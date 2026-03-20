/**
 * Channel Demographics API
 * GET — Returns latest audience demographics for a channel
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
  const isAll = channelId === 'all';

  // Get channel IDs
  let channelIds: string[] = [];
  if (isAll) {
    const { data } = await supabase
      .from('youtube_channels')
      .select('id')
      .eq('user_id', user.id);
    channelIds = (data || []).map((c) => c.id);
    if (channelIds.length === 0) return NextResponse.json({ demographics: null });
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

  if (channelIds.length === 1) {
    // Single channel — get latest snapshot
    const { data: demographics } = await supabase
      .from('youtube_audience_demographics')
      .select('*')
      .eq('channel_id', channelIds[0])
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .single();
    return NextResponse.json({ demographics: demographics || null });
  }

  // Multiple channels — aggregate latest snapshot per channel
  const allDemos: Record<string, any>[] = [];
  for (const chId of channelIds) {
    const { data } = await supabase
      .from('youtube_audience_demographics')
      .select('*')
      .eq('channel_id', chId)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .single();
    if (data) allDemos.push(data);
  }

  if (allDemos.length === 0) return NextResponse.json({ demographics: null });

  // Merge demographics data
  const merged: {
    age_gender_data: Record<string, Record<string, number>>;
    country_data: Record<string, number>;
    device_data: Record<string, number>;
    traffic_data: Record<string, number>;
  } = {
    age_gender_data: {},
    country_data: {},
    device_data: {},
    traffic_data: {},
  };

  for (const demo of allDemos) {
    // Merge age_gender_data
    if (demo.age_gender_data) {
      for (const [ageGroup, genders] of Object.entries(demo.age_gender_data as Record<string, Record<string, number>>)) {
        if (!merged.age_gender_data[ageGroup]) merged.age_gender_data[ageGroup] = {};
        for (const [gender, count] of Object.entries(genders)) {
          merged.age_gender_data[ageGroup][gender] = (merged.age_gender_data[ageGroup][gender] || 0) + count;
        }
      }
    }
    // Merge country_data
    if (demo.country_data) {
      for (const [country, views] of Object.entries(demo.country_data as Record<string, number>)) {
        merged.country_data[country] = (merged.country_data[country] || 0) + views;
      }
    }
    // Merge device_data
    if (demo.device_data) {
      for (const [device, views] of Object.entries(demo.device_data as Record<string, number>)) {
        merged.device_data[device] = (merged.device_data[device] || 0) + views;
      }
    }
    // Merge traffic_data
    if (demo.traffic_data) {
      for (const [source, views] of Object.entries(demo.traffic_data as Record<string, number>)) {
        merged.traffic_data[source] = (merged.traffic_data[source] || 0) + views;
      }
    }
  }

  return NextResponse.json({ demographics: merged });
}
