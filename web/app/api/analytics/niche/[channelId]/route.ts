/**
 * Niche Network Node Detail API
 * GET — Returns detailed info for a single niche channel node
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { channelId } = await params;

  const { data: node, error } = await supabase
    .from('niche_network_channels')
    .select('*')
    .eq('user_id', user.id)
    .eq('channel_id', channelId)
    .single();

  if (error || !node) {
    return NextResponse.json({ error: 'Node not found' }, { status: 404 });
  }

  // Also get edges for this node
  const { data: edges } = await supabase
    .from('niche_network_edges')
    .select('*')
    .eq('user_id', user.id)
    .or(`source_channel.eq.${channelId},target_channel.eq.${channelId}`);

  return NextResponse.json({ node, edges: edges || [] });
}
