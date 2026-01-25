/**
 * Wikimedia Image Search API
 * ============================================================================
 * GET /api/wikimedia/search
 * Preview-only search - returns Wikimedia results without storing.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { searchWikimediaImages } from '@/lib/wikimedia/client';
import type { WikimediaSearchFilters } from '@/lib/wikimedia/types';

export async function GET(req: Request) {
  try {
    // 1. Authenticate
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse query params
    const url = new URL(req.url);
    const query = url.searchParams.get('q');
    const maxResults = parseInt(url.searchParams.get('max') || '20', 10);
    const minWidth = url.searchParams.get('minWidth') ? parseInt(url.searchParams.get('minWidth')!, 10) : undefined;
    const minHeight = url.searchParams.get('minHeight') ? parseInt(url.searchParams.get('minHeight')!, 10) : undefined;
    const aspectRatio = url.searchParams.get('aspectRatio') as WikimediaSearchFilters['aspectRatio'] || 'any';

    if (!query) {
      return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
    }

    // 3. Search Wikimedia
    const results = await searchWikimediaImages(query, {
      maxResults: Math.min(maxResults, 50), // Cap at 50 for preview
      minWidth,
      minHeight,
      aspectRatio,
    });

    return NextResponse.json({
      success: true,
      query,
      count: results.length,
      results,
    });

  } catch (error) {
    console.error('[Wikimedia Search] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Search failed' },
      { status: 500 }
    );
  }
}
