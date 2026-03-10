/**
 * Competitor Channel Search API
 * GET — Search YouTube channels to add as competitors
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getValidGCPToken } from '@/lib/gcp/token-refresh';
import { YouTubeApi } from '@/lib/youtube/api';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query || query.length < 2) {
    return NextResponse.json({ error: 'Query must be at least 2 characters' }, { status: 400 });
  }

  try {
    const token = await getValidGCPToken(user.id);
    const api = new YouTubeApi(token);
    const results = await api.searchChannels(query, 10);

    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Search failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
