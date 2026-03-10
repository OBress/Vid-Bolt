/**
 * Analytics Channel Overview API
 * GET — Returns KPI data + snapshot time-series for a specific channel
 *       Supports channelId="all" to aggregate across all user's channels
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { channelId } = await params;
  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get('days') || '30', 10);
  const isAll = channelId === 'all';

  // Get channel(s) owned by user
  let channels: any[] = [];
  if (isAll) {
    const { data } = await supabase
      .from('youtube_channels')
      .select('*')
      .eq('user_id', user.id);
    channels = data || [];
    if (channels.length === 0) return NextResponse.json({ error: 'No channels found' }, { status: 404 });
  } else {
    const { data: channel } = await supabase
      .from('youtube_channels')
      .select('*')
      .eq('id', channelId)
      .eq('user_id', user.id)
      .single();
    if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    channels = [channel];
  }

  const channelIds = channels.map((c) => c.id);

  // Get snapshots for date range
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - days);

  const { data: rawSnapshots } = await supabase
    .from('youtube_channel_snapshots')
    .select('*')
    .in('channel_id', channelIds)
    .gte('snapshot_date', sinceDate.toISOString().split('T')[0])
    .order('snapshot_date', { ascending: true });

  // When aggregating multiple channels, merge snapshots by date
  let sortedSnapshots: any[] = [];
  if (isAll && channels.length > 1) {
    const byDate: Record<string, any> = {};
    for (const snap of rawSnapshots || []) {
      const d = snap.snapshot_date;
      if (!byDate[d]) {
        byDate[d] = {
          snapshot_date: d,
          views_day: 0,
          subscribers_gained: 0,
          subscribers_lost: 0,
          estimated_minutes_watched: 0,
          likes: 0,
          comments: 0,
          shares: 0,
          average_view_duration: 0,
          estimated_revenue: 0,
          _count: 0,
        };
      }
      byDate[d].views_day += snap.views_day || 0;
      byDate[d].subscribers_gained += snap.subscribers_gained || 0;
      byDate[d].subscribers_lost += snap.subscribers_lost || 0;
      byDate[d].estimated_minutes_watched += snap.estimated_minutes_watched || 0;
      byDate[d].likes += snap.likes || 0;
      byDate[d].comments += snap.comments || 0;
      byDate[d].shares += snap.shares || 0;
      byDate[d].average_view_duration += snap.average_view_duration || 0;
      byDate[d].estimated_revenue += snap.estimated_revenue || 0;
      byDate[d]._count += 1;
    }
    // Average the average_view_duration
    for (const d of Object.values(byDate)) {
      if (d._count > 0) d.average_view_duration /= d._count;
      delete d._count;
    }
    sortedSnapshots = Object.values(byDate).sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
  } else {
    sortedSnapshots = rawSnapshots || [];
  }

  // Compute KPIs from snapshots
  const totalViews = sortedSnapshots.reduce((s, snap) => s + (snap.views_day || 0), 0);
  const totalSubsGained = sortedSnapshots.reduce((s, snap) => s + (snap.subscribers_gained || 0), 0);
  const totalSubsLost = sortedSnapshots.reduce((s, snap) => s + (snap.subscribers_lost || 0), 0);
  const totalMinutesWatched = sortedSnapshots.reduce((s, snap) => s + (snap.estimated_minutes_watched || 0), 0);
  const avgViewDuration = sortedSnapshots.length > 0
    ? sortedSnapshots.reduce((s, snap) => s + (snap.average_view_duration || 0), 0) / sortedSnapshots.length
    : 0;
  const totalRevenue = sortedSnapshots.reduce((s, snap) => s + (snap.estimated_revenue || 0), 0);

  // Fetch prior period snapshots for period-over-period comparison
  const priorStart = new Date();
  priorStart.setDate(priorStart.getDate() - days * 2);
  const priorEnd = new Date();
  priorEnd.setDate(priorEnd.getDate() - days);

  const { data: priorSnapshots } = await supabase
    .from('youtube_channel_snapshots')
    .select('views_day, subscribers_gained, subscribers_lost, estimated_minutes_watched')
    .in('channel_id', channelIds)
    .gte('snapshot_date', priorStart.toISOString().split('T')[0])
    .lt('snapshot_date', priorEnd.toISOString().split('T')[0]);

  const priorData = priorSnapshots || [];
  const priorViews = priorData.reduce((s, snap) => s + (snap.views_day || 0), 0);
  const priorNetSubs = priorData.reduce((s, snap) => s + (snap.subscribers_gained || 0) - (snap.subscribers_lost || 0), 0);
  const priorMinutes = priorData.reduce((s, snap) => s + (snap.estimated_minutes_watched || 0), 0);

  const pctChange = (current: number, prior: number) => {
    if (prior === 0) return current > 0 ? 100 : 0;
    return ((current - prior) / Math.abs(prior)) * 100;
  };

  const periodNetSubs = totalSubsGained - totalSubsLost;

  // Aggregate channel stats for KPI
  const totalSubscribers = channels.reduce((s, c) => s + (c.subscriber_count || 0), 0);
  const totalViewCount = channels.reduce((s, c) => s + (c.view_count || 0), 0);
  const totalVideoCount = channels.reduce((s, c) => s + (c.video_count || 0), 0);

  // Get video publish dates within the range for chart markers
  const { data: videos } = await supabase
    .from('youtube_video_analytics')
    .select('video_id, title, published_at, thumbnail_url')
    .in('channel_id', channelIds)
    .gte('published_at', sinceDate.toISOString())
    .order('published_at', { ascending: true });

  // Build a map of publish dates → video titles
  const videoPublishDates: Record<string, { title: string; video_id: string; thumbnail_url: string | null }[]> = {};
  for (const v of videos || []) {
    if (!v.published_at) continue;
    const d = new Date(v.published_at).toISOString().split('T')[0];
    if (!videoPublishDates[d]) videoPublishDates[d] = [];
    videoPublishDates[d].push({ title: v.title, video_id: v.video_id, thumbnail_url: v.thumbnail_url });
  }

  return NextResponse.json({
    channel: isAll ? { 
      id: 'all',
      channel_title: 'All Channels',
      subscriber_count: totalSubscribers,
      view_count: totalViewCount,
      video_count: totalVideoCount,
    } : channels[0],
    kpi: {
      currentSubscribers: totalSubscribers,
      totalViews: totalViewCount,
      totalVideos: totalVideoCount,
      periodViews: totalViews,
      periodSubsGained: totalSubsGained,
      periodSubsLost: totalSubsLost,
      periodNetSubs,
      periodMinutesWatched: totalMinutesWatched,
      periodAvgViewDuration: avgViewDuration,
      periodRevenue: totalRevenue,
      subscriberGrowthPct: pctChange(periodNetSubs, priorNetSubs),
      viewsGrowthPct: pctChange(totalViews, priorViews),
      watchTimeGrowthPct: pctChange(totalMinutesWatched, priorMinutes),
    },
    snapshots: sortedSnapshots,
    videoPublishDates,
  });
}
