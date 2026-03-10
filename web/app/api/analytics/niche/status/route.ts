/**
 * Niche Discovery Status API
 * GET — Returns the status of the latest niche discovery scan for the user
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: latestSync } = await supabase
    .from('analytics_sync_log')
    .select('status, records_synced, started_at, completed_at, error_message')
    .eq('user_id', user.id)
    .eq('sync_type', 'niche_discovery')
    .order('started_at', { ascending: false })
    .limit(1)
    .single();

  if (!latestSync) {
    return NextResponse.json({ status: 'none', records_synced: 0 });
  }

  return NextResponse.json({
    status: latestSync.status,
    records_synced: latestSync.records_synced || 0,
    started_at: latestSync.started_at,
    completed_at: latestSync.completed_at,
    error_message: latestSync.error_message,
  });
}
