/**
 * Admin Platform Analytics API
 * GET — Returns platform-wide analytics for admin dashboard
 * Requires admin role via RLS
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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

  // Aggregate totals
  const aggregates = dailyAggregates || [];
  const latestDay = aggregates[aggregates.length - 1];

  return NextResponse.json({
    latestDay,
    dailyAggregates: aggregates,
    syncStats,
    period: { days, since: sinceDateStr },
  });
}
