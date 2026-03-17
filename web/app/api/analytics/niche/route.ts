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
    // Create a task row so the TopBar shows progress
    const nicheSteps = [
      { id: 'channel_profiling', name: 'Channel Profiling', phase: 'channel_profiling', order: 1, status: 'pending' },
      { id: 'channel_crawling', name: 'Crawling Featured Channels', phase: 'channel_crawling', order: 2, status: 'pending' },
      { id: 'keyword_search', name: 'Keyword Search', phase: 'keyword_search', order: 3, status: 'pending' },
      { id: 'enrichment', name: 'Enriching Candidates', phase: 'enrichment', order: 4, status: 'pending' },
      { id: 'snowball_expansion', name: 'Network Expansion', phase: 'snowball_expansion', order: 5, status: 'pending' },
      { id: 'embedding_similarity', name: 'Computing Embeddings', phase: 'embedding_similarity', order: 6, status: 'pending' },
      { id: 'ai_analysis', name: 'AI Similarity Analysis', phase: 'ai_analysis', order: 7, status: 'pending' },
      { id: 'scoring', name: 'Multi-Signal Scoring', phase: 'scoring', order: 8, status: 'pending' },
      { id: 'storing_results', name: 'Storing Results', phase: 'storing_results', order: 9, status: 'pending' },
    ];

    const { data: task } = await supabase
      .from('tasks')
      .insert({
        user_id: user.id,
        type: 'niche_discovery',
        name: 'Niche Network Scan',
        status: 'pending',
        progress_percent: 0,
        steps: nicheSteps,
        input_data: {},
        output_data: {},
        retry_count: 0,
        max_retries: 0,
      })
      .select('id')
      .single();

    const { nicheDiscoveryQueue } = await import('@/lib/queues/queues');
    await nicheDiscoveryQueue.add('manual-niche-discovery', {
      taskId: task?.id,
      userId: user.id,
    }, {
      jobId: `niche-manual-${user.id}-${Date.now()}`,
    });
    return NextResponse.json({ message: 'Niche discovery scan triggered.', taskId: task?.id });
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
