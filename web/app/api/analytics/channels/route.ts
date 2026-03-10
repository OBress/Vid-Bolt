/**
 * Analytics Channels API
 * GET  — List user's linked YouTube channels
 * POST — Link a new channel (auto-discovers from YouTube)
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getValidGCPToken } from '@/lib/gcp/token-refresh';
import { YouTubeApi } from '@/lib/youtube/api';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: channels, error } = await supabase
    .from('youtube_channels')
    .select('*')
    .eq('user_id', user.id)
    .order('is_primary', { ascending: false })
    .order('linked_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ channels: channels || [] });
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const token = await getValidGCPToken(user.id);
    const api = new YouTubeApi(token);
    const myChannels = await api.getMyChannels();

    if (myChannels.length === 0) {
      return NextResponse.json({ error: 'No YouTube channels found for this Google account.' }, { status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const linked: any[] = [];
    for (let i = 0; i < myChannels.length; i++) {
      const ch = myChannels[i];
      const { data, error } = await supabase
        .from('youtube_channels')
        .upsert({
          user_id: user.id,
          channel_id: ch.id,
          channel_title: ch.title,
          channel_handle: ch.handle,
          thumbnail_url: ch.thumbnailUrl,
          subscriber_count: ch.subscriberCount,
          view_count: ch.viewCount,
          video_count: ch.videoCount,
          custom_url: ch.customUrl,
          is_primary: i === 0,
          last_synced_at: new Date().toISOString(),
          sync_status: 'synced',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,channel_id' })
        .select()
        .single();

      if (data) linked.push(data);
      if (error) console.error(`[Analytics] Failed to link channel ${ch.id}:`, error.message);
    }

    return NextResponse.json({ channels: linked, discovered: myChannels.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to discover channels';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
