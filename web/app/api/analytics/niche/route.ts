/**
 * Niche Network API
 * GET    — Returns full graph data (nodes + edges)
 * POST   — Triggers on-demand niche discovery scan
 * DELETE — Removes a node from the user's network
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [{ data: nodes }, { data: edges }] = await Promise.all([
    supabase
      .from('niche_network_channels')
      .select('*')
      .eq('user_id', user.id)
      .order('similarity_score', { ascending: false }),
    supabase
      .from('niche_network_edges')
      .select('*')
      .eq('user_id', user.id),
  ]);

  return NextResponse.json({
    nodes: nodes || [],
    edges: edges || [],
  });
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Check if user is admin (admins bypass rate limit)
  const { data: userData } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  const isAdmin = userData?.is_admin === true;

  // Rate limit: 1 scan per day (admins exempt)
  if (!isAdmin) {
    const { data: recentScan } = await supabase
      .from('analytics_sync_log')
      .select('started_at')
      .eq('user_id', user.id)
      .eq('sync_type', 'niche_discovery')
      .order('started_at', { ascending: false })
      .limit(1)
      .single();

    if (recentScan) {
      const lastScan = new Date(recentScan.started_at);
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      if (lastScan > dayAgo) {
        return NextResponse.json(
          { error: 'Scan limit reached. Next scan available after ' + new Date(lastScan.getTime() + 24 * 60 * 60 * 1000).toISOString() },
          { status: 429 }
        );
      }
    }
  }

  // Instead of importing BullMQ queue (which needs server-side Redis),
  // we create a sync log and let the repeatable job pick it up,
  // OR we directly call the queue if available.
  try {
    const { nicheDiscoveryQueue } = await import('@/lib/queues/queues');
    await nicheDiscoveryQueue.add('manual-niche-discovery', {}, {
      jobId: `niche-manual-${user.id}-${Date.now()}`,
    });
    return NextResponse.json({ message: 'Niche discovery scan triggered.' });
  } catch (err) {
    console.error('Failed to trigger niche discovery:', err);
    return NextResponse.json({ error: 'Failed to trigger scan' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const channelId = searchParams.get('channelId');

  if (!channelId) {
    return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
  }

  // Delete node and related edges
  await Promise.all([
    supabase
      .from('niche_network_channels')
      .delete()
      .eq('user_id', user.id)
      .eq('channel_id', channelId),
    supabase
      .from('niche_network_edges')
      .delete()
      .eq('user_id', user.id)
      .or(`source_channel.eq.${channelId},target_channel.eq.${channelId}`),
  ]);

  return NextResponse.json({ success: true });
}
