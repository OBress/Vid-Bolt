/**
 * Channel On-Demand Refresh API
 * POST — Triggers an immediate sync for a specific channel (rate-limited to 1/hour)
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getValidGCPToken } from '@/lib/gcp/token-refresh';
import { YouTubeApi } from '@/lib/youtube/api';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { channelId } = await params;

  // Verify ownership
  const { data: channel } = await supabase
    .from('youtube_channels')
    .select('*')
    .eq('id', channelId)
    .eq('user_id', user.id)
    .single();

  if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });

  // Rate limit: 1 refresh per hour
  if (channel.last_synced_at) {
    const lastSync = new Date(channel.last_synced_at);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (lastSync > oneHourAgo) {
      const minutesRemaining = Math.ceil((lastSync.getTime() + 3600000 - Date.now()) / 60000);
      return NextResponse.json(
        { error: `Rate limited. Try again in ${minutesRemaining} minute(s).` },
        { status: 429 }
      );
    }
  }

  try {
    // Mark as syncing
    await supabase
      .from('youtube_channels')
      .update({ sync_status: 'syncing' })
      .eq('id', channelId);

    const token = await getValidGCPToken(user.id);
    const api = new YouTubeApi(token);
    const myChannels = await api.getMyChannels();
    const ytChannel = myChannels.find((c) => c.id === channel.channel_id);

    if (!ytChannel) {
      await supabase
        .from('youtube_channels')
        .update({ sync_status: 'error', sync_error: 'Channel not found on YouTube' })
        .eq('id', channelId);
      return NextResponse.json({ error: 'Channel no longer found on your YouTube account' }, { status: 404 });
    }

    await supabase
      .from('youtube_channels')
      .update({
        channel_title: ytChannel.title,
        channel_handle: ytChannel.handle,
        thumbnail_url: ytChannel.thumbnailUrl,
        subscriber_count: ytChannel.subscriberCount,
        view_count: ytChannel.viewCount,
        video_count: ytChannel.videoCount,
        custom_url: ytChannel.customUrl,
        last_synced_at: new Date().toISOString(),
        sync_status: 'synced',
        sync_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', channelId);

    return NextResponse.json({ success: true, channel: ytChannel });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Refresh failed';
    await supabase
      .from('youtube_channels')
      .update({ sync_status: 'error', sync_error: message })
      .eq('id', channelId);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
