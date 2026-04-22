/**
 * Admin Platform Analytics API
 * GET — Returns platform-wide analytics for admin dashboard
 * Requires admin role via RLS
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server configuration missing');
  return createServiceClient(url, key);
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Admin check — only admins can see cumulative platform costs
  const serviceClient = getServiceSupabase();
  const { data: userData } = await serviceClient
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!userData?.is_admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get('days') || '30', 10);

  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - days);
  const sinceDateStr = sinceDate.toISOString().split('T')[0];

  // Platform daily aggregates
  const { data: dailyAggregates } = await supabase
    .from('platform_analytics_daily')
    .select('*')
    .gte('date', sinceDateStr)
    .order('date', { ascending: true });

  // Count sync logs by status within period
  const { data: syncLogs } = await supabase
    .from('analytics_sync_log')
    .select('sync_type, status')
    .gte('started_at', sinceDate.toISOString());

  const syncStats: Record<string, { total: number; success: number; failed: number }> = {};
  for (const log of syncLogs || []) {
    if (!syncStats[log.sync_type]) {
      syncStats[log.sync_type] = { total: 0, success: 0, failed: 0 };
    }
    syncStats[log.sync_type].total++;
    if (log.status === 'completed') syncStats[log.sync_type].success++;
    if (log.status === 'failed') syncStats[log.sync_type].failed++;
  }

  // ==========================================
  // Cost Events — cumulative platform spend
  // ==========================================
  const { data: costEvents } = await serviceClient
    .from('cost_events')
    .select('user_id, category, service, amount_usd, is_estimated, occurred_at')
    .gte('occurred_at', sinceDate.toISOString())
    .order('occurred_at', { ascending: false });

  // Aggregate by category
  const costByCategory: Record<string, number> = {};
  // Aggregate by user
  const costByUser: Record<string, { total: number; categories: Record<string, number> }> = {};
  let totalPlatformCost = 0;

  for (const event of costEvents || []) {
    const amount = event.amount_usd || 0;
    totalPlatformCost += amount;

    // By category
    costByCategory[event.category] = (costByCategory[event.category] || 0) + amount;

    // By user
    if (!costByUser[event.user_id]) {
      costByUser[event.user_id] = { total: 0, categories: {} };
    }
    costByUser[event.user_id].total += amount;
    costByUser[event.user_id].categories[event.category] =
      (costByUser[event.user_id].categories[event.category] || 0) + amount;
  }

  // Aggregate totals
  const aggregates = dailyAggregates || [];
  const latestDay = aggregates[aggregates.length - 1];

  return NextResponse.json({
    latestDay,
    dailyAggregates: aggregates,
    syncStats,
    costAnalytics: {
      totalPlatformCost,
      costByCategory,
      costByUser,
      eventCount: (costEvents || []).length,
    },
    period: { days, since: sinceDateStr },
  });
}
