/**
 * Serper Image Search API
 * ============================================================================
 * GET /api/serper/search
 * Preview-only search - returns Serper results without storing.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { searchSerperImages } from '@/lib/serper/client';
import type { SerperSearchFilters } from '@/lib/serper/types';

export async function GET(req: Request) {
  try {
    // 1. Authenticate
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Check API key
    if (!process.env.SERPER_API_KEY) {
      return NextResponse.json(
        { error: 'SERPER_API_KEY is not configured' },
        { status: 500 }
      );
    }

    // 3. Parse query params
    const url = new URL(req.url);
    const query = url.searchParams.get('q');
    
    if (!query) {
      return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
    }

    // Build filters from query params
    const filters: SerperSearchFilters = {
      maxResults: parseInt(url.searchParams.get('maxResults') || '20', 10),
      color: (url.searchParams.get('color') as SerperSearchFilters['color']) || 'any',
      type: (url.searchParams.get('type') as SerperSearchFilters['type']) || 'any',
      size: (url.searchParams.get('size') as SerperSearchFilters['size']) || 'any',
      aspectRatio: (url.searchParams.get('aspectRatio') as SerperSearchFilters['aspectRatio']) || 'any',
      license: (url.searchParams.get('license') as SerperSearchFilters['license']) || 'any',
      safe: url.searchParams.get('safe') !== 'false',
    };

    // 4. Search Serper
    const results = await searchSerperImages(query, filters);

    return NextResponse.json({
      success: true,
      query,
      count: results.length,
      results,
    });

  } catch (error) {
    console.error('[Serper Search] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Search failed' },
      { status: 500 }
    );
  }
}
