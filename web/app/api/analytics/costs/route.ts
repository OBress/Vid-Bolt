/**
 * Analytics Costs API
 * ============================================================================
 * Returns aggregated cost data for the authenticated user from the
 * cost_events ledger table.
 *
 * Query params:
 *   ?period=7d|30d|90d|all   (default: 30d)
 *   ?videoId=uuid             (optional — filter to a specific video)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import {
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  type CostCategory,
} from '@/lib/costs/pricing';
import { VM_HOURLY_RATE_USD, VM_DAILY_FLAT_RATE_USD } from '@/lib/costs/pricing';

// ============================================================================
// TYPES
// ============================================================================

interface CostEvent {
  id: string;
  category: string;
  service: string;
  sub_label: string | null;
  amount_usd: number;
  raw_units: Record<string, number> | null;
  is_estimated: boolean;
  occurred_at: string;
  video_id: string | null;
}

// ============================================================================
// HANDLER
// ============================================================================

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const period = searchParams.get('period') || '30d';
  const videoIdFilter = searchParams.get('videoId');

  // Compute date range
  const now = new Date();
  let sinceDate: Date | null = null;
  if (period === '7d') sinceDate = new Date(now.getTime() - 7 * 86400000);
  else if (period === '30d') sinceDate = new Date(now.getTime() - 30 * 86400000);
  else if (period === '90d') sinceDate = new Date(now.getTime() - 90 * 86400000);
  // 'all' → no date filter

  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Build cost_events query
  let query = serviceClient
    .from('cost_events')
    .select('id, category, service, sub_label, amount_usd, raw_units, is_estimated, occurred_at, video_id')
    .eq('user_id', user.id)
    .order('occurred_at', { ascending: false });

  if (sinceDate) {
    query = query.gte('occurred_at', sinceDate.toISOString());
  }
  if (videoIdFilter) {
    query = query.eq('video_id', videoIdFilter);
  }

  const { data: events, error: eventsError } = await query;

  if (eventsError) {
    console.error('[API /analytics/costs]', eventsError.message);
    return NextResponse.json({ error: 'Failed to fetch cost events' }, { status: 500 });
  }

  const typedEvents: CostEvent[] = (events || []).map((e: any) => ({
    ...e,
    amount_usd: Number(e.amount_usd),
  }));

  // ---- Breakdown by category ----
  const categoryTotals: Record<string, number> = {};
  for (const ev of typedEvents) {
    categoryTotals[ev.category] = (categoryTotals[ev.category] || 0) + ev.amount_usd;
  }

  const totalCostUsd = Object.values(categoryTotals).reduce((a, b) => a + b, 0);

  const breakdown = (Object.entries(categoryTotals) as [CostCategory, number][])
    .sort((a, b) => b[1] - a[1])
    .map(([category, amountUsd]) => ({
      category,
      label: CATEGORY_LABELS[category] ?? category,
      color: CATEGORY_COLORS[category] ?? 'hsl(0,0%,50%)',
      icon: CATEGORY_ICONS[category] ?? '💲',
      amountUsd,
      pct: totalCostUsd > 0 ? (amountUsd / totalCostUsd) * 100 : 0,
    }));

  // ---- By model/service (sorted by cost) ----
  const modelTotals: Record<string, { service: string; amountUsd: number }> = {};
  for (const ev of typedEvents) {
    const key = ev.sub_label || ev.service;
    if (!modelTotals[key]) modelTotals[key] = { service: ev.service, amountUsd: 0 };
    modelTotals[key].amountUsd += ev.amount_usd;
  }

  const byModel = Object.entries(modelTotals)
    .map(([label, { service, amountUsd }]) => ({ label, service, amountUsd }))
    .sort((a, b) => b.amountUsd - a.amountUsd)
    .slice(0, 15);

  // ---- Daily trend ----
  const trendMap: Record<string, Record<string, number>> = {};
  const categories = Object.keys(CATEGORY_LABELS) as CostCategory[];

  for (const ev of typedEvents) {
    const dateKey = ev.occurred_at.slice(0, 10); // YYYY-MM-DD
    if (!trendMap[dateKey]) {
      trendMap[dateKey] = Object.fromEntries(categories.map((c) => [c, 0]));
    }
    trendMap[dateKey][ev.category] = (trendMap[dateKey][ev.category] || 0) + ev.amount_usd;
  }

  const trend = Object.entries(trendMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, cats]) => ({ date, ...cats }));

  // ---- Per-video breakdown ----
  const videoIdSet = new Set(typedEvents.map((e) => e.video_id).filter(Boolean));
  let byVideo: any[] = [];

  if (videoIdSet.size > 0) {
    const { data: projects } = await serviceClient
      .from('video_projects')
      .select('id, name, status, created_at')
      .in('id', Array.from(videoIdSet) as string[]);

    const videoTotals: Record<string, number> = {};
    for (const ev of typedEvents) {
      if (ev.video_id) {
        videoTotals[ev.video_id] = (videoTotals[ev.video_id] || 0) + ev.amount_usd;
      }
    }

    byVideo = (projects || [])
      .map((p: any) => ({
        videoId: p.id,
        name: p.name,
        status: p.status,
        createdAt: p.created_at,
        amountUsd: videoTotals[p.id] || 0,
      }))
      .sort((a: any, b: any) => b.amountUsd - a.amountUsd);
  }

  // ---- Live GCP VM data ----
  const { data: gcpConfig } = await serviceClient
    .from('user_gcp_config')
    .select('vm_session_started_at, vm_provisioned_at, total_vm_hours_run, total_vm_days_owned, status')
    .eq('user_id', user.id)
    .single();

  const sessionStartedAt = gcpConfig?.vm_session_started_at ?? null;
  const vmProvisionedAt = gcpConfig?.vm_provisioned_at ?? null;

  // Live estimate for the current running session (server-side at this moment)
  let liveEstimateUsd = 0;
  if (sessionStartedAt && gcpConfig?.status === 'RUNNING') {
    const sessionMs = now.getTime() - new Date(sessionStartedAt).getTime();
    liveEstimateUsd = (sessionMs / 3600000) * VM_HOURLY_RATE_USD;
  }

  // Total historical cost
  const historicalHours = gcpConfig?.total_vm_hours_run ?? 0;
  const historicalDays = gcpConfig?.total_vm_days_owned ?? 0;
  const totalHistoricalCostUsd =
    historicalHours * VM_HOURLY_RATE_USD + historicalDays * VM_DAILY_FLAT_RATE_USD;

  const gcpVm = {
    sessionStartedAt,
    vmProvisionedAt,
    vmStatus: gcpConfig?.status ?? null,
    totalHistoricalHours: historicalHours,
    totalHistoricalDaysOwned: historicalDays,
    totalHistoricalCostUsd,
    liveEstimateUsd,
  };

  return NextResponse.json({
    totalCostUsd,
    periodStart: typedEvents.length > 0 ? typedEvents[typedEvents.length - 1].occurred_at : null,
    periodEnd: typedEvents.length > 0 ? typedEvents[0].occurred_at : null,
    eventCount: typedEvents.length,
    breakdown,
    byModel,
    trend,
    byVideo,
    gcpVm,
  });
}
