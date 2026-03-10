/**
 * Social Connections API
 * GET    — List all connections for the authenticated user
 * DELETE — Disconnect a connection by ID
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: connections, error } = await supabase
    .from('social_connections')
    .select('id, provider, provider_email, provider_name, provider_avatar, is_primary, scopes, connected_at, last_used_at')
    .eq('user_id', user.id)
    .order('connected_at', { ascending: true });

  if (error) {
    console.error('[Connections] Failed to fetch:', error);
    return NextResponse.json({ error: 'Failed to fetch connections' }, { status: 500 });
  }

  return NextResponse.json({ connections: connections || [] });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const connectionId = searchParams.get('connectionId');

  if (!connectionId) {
    return NextResponse.json({ error: 'connectionId is required' }, { status: 400 });
  }

  const serviceSupabase = createServiceClient();

  // Verify ownership
  const { data: connection } = await serviceSupabase
    .from('social_connections')
    .select('id, provider, is_primary')
    .eq('id', connectionId)
    .eq('user_id', user.id)
    .single();

  if (!connection) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
  }

  // Unlink any youtube_channels tied to this connection
  await serviceSupabase
    .from('youtube_channels')
    .update({ connection_id: null })
    .eq('connection_id', connectionId);

  // Clear youtube_channel_id from video_projects referencing channels from this connection
  // (We set to null rather than deleting channels so analytics history is preserved)

  // Delete the connection
  await serviceSupabase
    .from('social_connections')
    .delete()
    .eq('id', connectionId);

  // If this was the primary, promote the next oldest connection of same provider
  if (connection.is_primary) {
    const { data: nextConnection } = await serviceSupabase
      .from('social_connections')
      .select('id')
      .eq('user_id', user.id)
      .eq('provider', connection.provider)
      .order('connected_at', { ascending: true })
      .limit(1)
      .single();

    if (nextConnection) {
      await serviceSupabase
        .from('social_connections')
        .update({ is_primary: true })
        .eq('id', nextConnection.id);
    }
  }

  return NextResponse.json({ success: true });
}
