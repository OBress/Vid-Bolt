/**
 * Analytics Data Export API
 * GET — Export analytics data as CSV or JSON
 * Query params: channelId, type (snapshots|videos|demographics), format (csv|json)
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type ExportType = 'snapshots' | 'videos' | 'demographics';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const channelId = searchParams.get('channelId');
  const type = (searchParams.get('type') || 'snapshots') as ExportType;
  const format = searchParams.get('format') || 'csv';

  if (!channelId) {
    return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
  }

  // Verify ownership
  const { data: channel } = await supabase
    .from('youtube_channels')
    .select('id, channel_title')
    .eq('id', channelId)
    .eq('user_id', user.id)
    .single();

  if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });

  // Fetch data based on type
  let rows: Record<string, unknown>[] = [];
  let filename = '';

  switch (type) {
    case 'snapshots': {
      const { data } = await supabase
        .from('youtube_channel_snapshots')
        .select('snapshot_date, subscriber_count, view_count, video_count, views_day, subscribers_gained, subscribers_lost, estimated_minutes_watched, average_view_duration, likes, comments, shares, estimated_revenue')
        .eq('channel_id', channelId)
        .order('snapshot_date', { ascending: true });
      rows = (data || []) as Record<string, unknown>[];
      filename = `${channel.channel_title}_snapshots`;
      break;
    }
    case 'videos': {
      const { data } = await supabase
        .from('youtube_video_analytics')
        .select('video_id, title, published_at, views, likes, comments, shares, estimated_minutes_watched, average_view_duration, estimated_revenue')
        .eq('channel_id', channelId)
        .order('views', { ascending: false });
      rows = (data || []) as Record<string, unknown>[];
      filename = `${channel.channel_title}_videos`;
      break;
    }
    case 'demographics': {
      const { data } = await supabase
        .from('youtube_audience_demographics')
        .select('snapshot_date, age_gender_data, country_data, device_data, traffic_data')
        .eq('channel_id', channelId)
        .order('snapshot_date', { ascending: false })
        .limit(1);
      rows = (data || []) as Record<string, unknown>[];
      filename = `${channel.channel_title}_demographics`;
      break;
    }
    default:
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  }

  if (format === 'json') {
    return new NextResponse(JSON.stringify(rows, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}.json"`,
      },
    });
  }

  // CSV format
  if (rows.length === 0) {
    return new NextResponse('', {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}.csv"`,
      },
    });
  }

  const headers = Object.keys(rows[0]);
  const csvLines = [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const val = row[h];
          if (val === null || val === undefined) return '';
          if (typeof val === 'object') return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
          if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return String(val);
        })
        .join(',')
    ),
  ];

  return new NextResponse(csvLines.join('\n'), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}.csv"`,
    },
  });
}
