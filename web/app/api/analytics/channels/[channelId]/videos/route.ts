/**
 * Channel Videos API
 * GET — Returns video analytics for a specific channel
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
  const sortBy = searchParams.get('sort') || 'views';
  const order = searchParams.get('order') || 'desc';
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const isAll = channelId === 'all';

  // Get channel IDs
  let channelIds: string[] = [];
  if (isAll) {
    const { data } = await supabase
      .from('youtube_channels')
      .select('id')
      .eq('user_id', user.id);
    channelIds = (data || []).map((c) => c.id);
    if (channelIds.length === 0) return NextResponse.json({ videos: [] });
  } else {
    const { data: channel } = await supabase
      .from('youtube_channels')
      .select('id')
      .eq('id', channelId)
      .eq('user_id', user.id)
      .single();
    if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    channelIds = [channel.id];
  }

  const { data: videos, error } = await supabase
    .from('youtube_video_analytics')
    .select('*')
    .in('channel_id', channelIds)
    .order(sortBy, { ascending: order === 'asc' })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ videos: videos || [] });
}
