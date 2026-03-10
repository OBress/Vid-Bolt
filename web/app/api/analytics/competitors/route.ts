/**
 * Competitor Channels API
 * GET  — List user's tracked competitor channels
 * POST — Add a new competitor channel by YouTube channel ID
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getValidGCPToken } from '@/lib/gcp/token-refresh';
import { YouTubeApi } from '@/lib/youtube/api';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: competitors, error } = await supabase
    .from('competitor_channels')
    .select('*, competitor_channel_snapshots(snapshot_date, subscriber_count, view_count, engagement_rate)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ competitors: competitors || [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { channelId, niche } = body;

  if (!channelId) {
    return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
  }

  // Check limit (max 20 competitors per user)
  const { count } = await supabase
    .from('competitor_channels')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id);

  if ((count ?? 0) >= 20) {
    return NextResponse.json({ error: 'Maximum 20 competitor channels allowed' }, { status: 400 });
  }

  // Check if already tracked
  const { data: existing } = await supabase
    .from('competitor_channels')
    .select('id')
    .eq('user_id', user.id)
    .eq('channel_id', channelId)
    .single();

  if (existing) {
    return NextResponse.json({ error: 'Channel is already tracked' }, { status: 409 });
  }

  try {
    const token = await getValidGCPToken(user.id);
    const api = new YouTubeApi(token);
    const channelInfo = await api.getChannelById(channelId);

    if (!channelInfo) {
      return NextResponse.json({ error: 'YouTube channel not found' }, { status: 404 });
    }

    const { data: competitor, error } = await supabase
      .from('competitor_channels')
      .insert({
        user_id: user.id,
        channel_id: channelId,
        channel_title: channelInfo.title,
        channel_handle: channelInfo.handle,
        thumbnail_url: channelInfo.thumbnailUrl,
        banner_url: channelInfo.bannerUrl,
        subscriber_count: channelInfo.subscriberCount,
        view_count: channelInfo.viewCount,
        video_count: channelInfo.videoCount,
        niche: niche || null,
        last_synced_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ competitor });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to add competitor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const competitorId = searchParams.get('id');

  if (!competitorId) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('competitor_channels')
    .delete()
    .eq('id', competitorId)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
