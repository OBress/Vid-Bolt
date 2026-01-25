import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getValidGCPToken } from '@/lib/gcp/token-refresh';
import { YouTubeApi } from '@/lib/youtube/api';
import { YouTubeSearchOptions } from '@/lib/youtube/types';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    // Get authenticated user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required', gcpRequired: true },
        { status: 401 }
      );
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    
    if (!query) {
      return NextResponse.json(
        { error: 'Query parameter "q" is required' },
        { status: 400 }
      );
    }

    // Get GCP token for YouTube API access
    let accessToken: string;
    try {
      accessToken = await getValidGCPToken(user.id);
    } catch (tokenError) {
      console.error('[YouTube Search] Token error:', tokenError);
      return NextResponse.json(
        { 
          error: 'GCP authentication required. Please connect your Google Cloud account.',
          gcpRequired: true 
        },
        { status: 401 }
      );
    }

    // Build search options from query parameters
    const options: YouTubeSearchOptions = {
      query,
      maxResults: parseInt(searchParams.get('maxResults') || '10', 10),
      order: (searchParams.get('order') as YouTubeSearchOptions['order']) || 'relevance',
      videoDuration: (searchParams.get('videoDuration') as YouTubeSearchOptions['videoDuration']) || 'any',
      videoLicense: (searchParams.get('videoLicense') as YouTubeSearchOptions['videoLicense']) || 'any',
      videoDefinition: (searchParams.get('videoDefinition') as YouTubeSearchOptions['videoDefinition']) || 'any',
      safeSearch: (searchParams.get('safeSearch') as YouTubeSearchOptions['safeSearch']) || 'moderate',
      regionCode: searchParams.get('regionCode') || undefined,
      pageToken: searchParams.get('pageToken') || undefined,
    };

    console.log('[YouTube Search] Searching for:', query, 'with options:', options);

    // Execute search
    const youtube = new YouTubeApi(accessToken);
    const results = await youtube.searchVideos(options);

    console.log(`[YouTube Search] Found ${results.hits.length} results (total: ${results.total})`);

    return NextResponse.json(results);
  } catch (error) {
    console.error('[YouTube Search] Error:', error);
    
    const message = error instanceof Error ? error.message : 'Search failed';
    
    // Check if it's a scope/auth issue
    if (message.includes('scope') || message.includes('forbidden')) {
      return NextResponse.json(
        { error: message, gcpRequired: true },
        { status: 403 }
      );
    }
    
    // Check if it's a quota issue
    if (message.includes('quota')) {
      return NextResponse.json(
        { error: message, quotaExceeded: true },
        { status: 429 }
      );
    }
    
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
