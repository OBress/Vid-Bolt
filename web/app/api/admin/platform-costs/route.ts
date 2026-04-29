/**
 * Admin: Platform Costs API
 * ============================================================================
 * Admin-only endpoint that aggregates costs across ALL users plus platform
 * infrastructure costs (Hetzner, Cloudflare R2) from the admin_platform_costs table.
 *
 * Query params:
 *   ?month=2026-04-01   (optional; defaults to last 30 days if omitted)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAuthError } from '@/lib/utils/admin-auth';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { CATEGORY_LABELS, type CostCategory } from '@/lib/costs/pricing';

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET(req: NextRequest) {
  const authResult = await requireAdmin();
  if (isAuthError(authResult)) return authResult;

  const { searchParams } = new URL(req.url);
  const monthParam = searchParams.get('month');

  let sinceDate: Date;
  let untilDate: Date;
  let monthLabel: string;

  if (monthParam) {
    sinceDate = new Date(monthParam);
    untilDate = new Date(sinceDate.getFullYear(), sinceDate.getMonth() + 1, 1);
    monthLabel = sinceDate.toISOString().slice(0, 7);
  } else {
    untilDate = new Date();
    sinceDate = new Date(untilDate.getTime() - 30 * 86400000);
    monthLabel = untilDate.toISOString().slice(0, 7);
  }

  const db = getServiceClient();

  // ---- All user cost events in range ----
  const { data: events, error: eventsError } = await db
    .from('cost_events')
    .select('user_id, category, amount_usd')
    .gte('occurred_at', sinceDate.toISOString())
    .lt('occurred_at', untilDate.toISOString());

  if (eventsError) {
    return NextResponse.json({ error: eventsError.message }, { status: 500 });
  }

  // ---- Users table for display names ----
  const { data: usersData } = await db
    .from('users')
    .select('id, email, full_name');

  const userMap: Record<string, { email: string; fullName: string }> = {};
  for (const u of usersData || []) {
    userMap[u.id] = { email: u.email ?? '', fullName: u.full_name ?? '' };
  }

  // ---- Per-user aggregation ----
  const userTotals: Record<string, { total: number; breakdown: Record<string, number> }> = {};
  for (const ev of events || []) {
    if (!userTotals[ev.user_id]) {
      userTotals[ev.user_id] = { total: 0, breakdown: {} };
    }
    const amt = Number(ev.amount_usd);
    userTotals[ev.user_id].total += amt;
    userTotals[ev.user_id].breakdown[ev.category] =
      (userTotals[ev.user_id].breakdown[ev.category] || 0) + amt;
  }

  const allUsersCostUsd = Object.values(userTotals).reduce((s, u) => s + u.total, 0);

  const users = Object.entries(userTotals)
    .map(([userId, { total, breakdown }]) => ({
      userId,
      email: userMap[userId]?.email ?? userId,
      displayName: userMap[userId]?.fullName ?? '',
      totalCostUsd: total,
      breakdown: Object.fromEntries(
        (Object.entries(breakdown) as [CostCategory, number][]).map(([cat, amt]) => [
          CATEGORY_LABELS[cat] ?? cat,
          amt,
        ])
      ),
    }))
    .sort((a, b) => b.totalCostUsd - a.totalCostUsd);

  // ---- Platform costs (Hetzner, R2, misc) ----
  const { data: platformRows } = await db
    .from('admin_platform_costs')
    .select('category, label, amount_usd, month_date, notes')
    .eq('month_date', `${monthLabel}-01`);

  let hetznerCostUsd = 0;
  let r2StorageCostUsd = 0;
  let miscCostUsd = 0;

  for (const row of platformRows || []) {
    const amt = Number(row.amount_usd);
    if (row.category === 'hetzner') hetznerCostUsd += amt;
    else if (row.category === 'r2') r2StorageCostUsd += amt;
    else miscCostUsd += amt;
  }

  const totalPlatformCostUsd = allUsersCostUsd + hetznerCostUsd + r2StorageCostUsd + miscCostUsd;

  // ---- Monthly trend (last 6 months) ----
  const { data: trendRows } = await db
    .from('cost_events')
    .select('occurred_at, amount_usd')
    .gte('occurred_at', new Date(sinceDate.getTime() - 150 * 86400000).toISOString());

  const monthlyTrendMap: Record<string, number> = {};
  for (const row of trendRows || []) {
    const month = row.occurred_at.slice(0, 7);
    monthlyTrendMap[month] = (monthlyTrendMap[month] || 0) + Number(row.amount_usd);
  }

  // Merge with platform costs
  const { data: allPlatformRows } = await db
    .from('admin_platform_costs')
    .select('category, amount_usd, month_date')
    .gte('month_date', new Date(sinceDate.getTime() - 150 * 86400000).toISOString().slice(0, 10));

  const platformTrendMap: Record<string, number> = {};
  for (const row of allPlatformRows || []) {
    const month = row.month_date.slice(0, 7);
    platformTrendMap[month] = (platformTrendMap[month] || 0) + Number(row.amount_usd);
  }

  const allMonths = new Set([
    ...Object.keys(monthlyTrendMap),
    ...Object.keys(platformTrendMap),
  ]);

  const monthlyTrend = Array.from(allMonths)
    .sort()
    .slice(-6)
    .map((month) => ({
      month,
      userCostUsd: monthlyTrendMap[month] || 0,
      platformCostUsd: platformTrendMap[month] || 0,
    }));

  return NextResponse.json({
    month: monthLabel,
    users,
    platformTotals: {
      allUsersCostUsd,
      hetznerCostUsd,
      r2StorageCostUsd,
      miscCostUsd,
      totalPlatformCostUsd,
    },
    platformRows: platformRows || [],
    monthlyTrend,
  });
}

// ---- Admin: Save platform cost entries ----
export async function POST(req: NextRequest) {
  const authResult = await requireAdmin();
  if (isAuthError(authResult)) return authResult;

  const body = await req.json();
  const { monthDate, category, label, amountUsd, notes } = body;

  if (!monthDate || !category || !label || amountUsd === undefined) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const db = getServiceClient();
  const { error } = await db
    .from('admin_platform_costs')
    .upsert({
      month_date: monthDate,
      category,
      label,
      amount_usd: amountUsd,
      notes: notes ?? null,
    }, { onConflict: 'month_date,category,label' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
