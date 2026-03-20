/**
 * Connection Channels API
 * GET — List YouTube channels discovered under a specific Google connection,
 *       using that connection's own OAuth token (NOT the GCP token).
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { refreshYouTubeAccessToken } from '@/lib/gcp/token-refresh';
import { YouTubeApi } from '@/lib/youtube/api';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { connectionId } = await params;
  const serviceSupabase = createServiceClient();

  // Get the connection and verify ownership
  const { data: connection } = await serviceSupabase
    .from('social_connections')
    .select('id, refresh_token, access_token, token_expires_at')
    .eq('id', connectionId)
    .eq('user_id', user.id)
    .single();

  if (!connection) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
  }

  // Get user's per-user YouTube OAuth credentials (needed for token refresh)
  const { data: oauthConfig } = await serviceSupabase
    .from('user_gcp_config')
    .select('youtube_oauth_client_id, youtube_oauth_client_secret')
    .eq('user_id', user.id)
    .single() as { data: {
      youtube_oauth_client_id: string | null;
      youtube_oauth_client_secret: string | null;
    } | null; error: any };

  // Get channels already linked to this connection
  const { data: existingChannels } = await supabase
    .from('youtube_channels')
    .select('*')
    .eq('user_id', user.id)
    .eq('connection_id', connectionId);

  if (existingChannels && existingChannels.length > 0) {
    return NextResponse.json({ channels: existingChannels });
  }

  // No channels yet — discover from YouTube via THIS connection's token
  try {
    // Get a valid access token for this specific connection
    let accessToken = connection.access_token;

    // Check if the cached token is expired or missing
    const isExpired = !connection.token_expires_at ||
      new Date(connection.token_expires_at) < new Date(Date.now() + 5 * 60 * 1000);

    if (!accessToken || isExpired) {
      if (!connection.refresh_token) {
        return NextResponse.json({ channels: [], error: 'No refresh token for this connection' });
      }

      if (!oauthConfig?.youtube_oauth_client_id || !oauthConfig?.youtube_oauth_client_secret) {
        return NextResponse.json({ channels: [], error: 'YouTube OAuth credentials not configured. Please set up your YouTube OAuth in settings.' });
      }

      // Use per-user OAuth credentials — the connection was authorized with these, not the global GCP ones
      const refreshed = await refreshYouTubeAccessToken(
        connection.refresh_token,
        oauthConfig.youtube_oauth_client_id,
        oauthConfig.youtube_oauth_client_secret,
      );
      accessToken = refreshed.accessToken;

      // Cache the refreshed token back to the connection
      await serviceSupabase
        .from('social_connections')
        .update({
          access_token: refreshed.accessToken,
          token_expires_at: refreshed.expiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', connectionId);
    }

    const api = new YouTubeApi(accessToken);
    const discoveredChannels = await api.getMyChannels();

    // Store discovered channels linked to this connection
    const inserted: Array<Record<string, unknown>> = [];
    for (const ch of discoveredChannels) {
      const { data } = await serviceSupabase
        .from('youtube_channels')
        .upsert({
          user_id: user.id,
          channel_id: ch.id,
          channel_title: ch.title,
          channel_handle: ch.handle || null,
          thumbnail_url: ch.thumbnailUrl || null,
          subscriber_count: ch.subscriberCount,
          view_count: ch.viewCount,
          video_count: ch.videoCount,
          custom_url: ch.customUrl || null,
          is_primary: false,
          connection_id: connectionId,
          sync_status: 'pending',
        }, { onConflict: 'user_id,channel_id' })
        .select()
        .single();

      if (data) inserted.push(data);
    }

    // Update connection_id for any existing channels matching this connection
    for (const ch of discoveredChannels) {
      await serviceSupabase
        .from('youtube_channels')
        .update({ connection_id: connectionId })
        .eq('user_id', user.id)
        .eq('channel_id', ch.id)
        .is('connection_id', null);
    }

    const { data: allChannels } = await supabase
      .from('youtube_channels')
      .select('*')
      .eq('user_id', user.id)
      .eq('connection_id', connectionId);

    return NextResponse.json({ channels: allChannels || inserted });
  } catch (err) {
    console.error('[Connections] Failed to discover channels:', err);
    return NextResponse.json({ channels: [], error: 'Failed to discover channels' });
  }
}
