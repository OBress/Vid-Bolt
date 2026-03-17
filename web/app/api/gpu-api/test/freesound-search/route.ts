/**
 * Freesound Search Test Route
 * ============================================================================
 * GET /api/gpu-api/test/freesound-search?q=...&max_duration=...&sort=...
 *
 * Tests the Freesound API integration by performing a direct search.
 * Used by the DevTools GPU API Tester to verify the API key works
 * and search returns valid results with preview URLs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import {
  searchSounds,
  getPreviewUrl,
  type FreesoundSearchOptions,
} from '@/lib/services/freesound-service';

export async function GET(request: NextRequest) {
  try {
    // Auth check
    const cookieStore = await cookies();
    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
        },
      }
    );

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const maxDuration = searchParams.get('max_duration')
      ? parseFloat(searchParams.get('max_duration')!)
      : 30;
    const sort = (searchParams.get('sort') as FreesoundSearchOptions['sort']) || 'score';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const perPage = parseInt(searchParams.get('per_page') || '15', 10);

    if (!query.trim()) {
      return NextResponse.json(
        { error: 'Query parameter "q" is required' },
        { status: 400 }
      );
    }

    const startTime = Date.now();

    const results = await searchSounds(query, {
      pageSize: Math.min(perPage, 50),
      page,
      maxDuration,
      sort,
      license: 'cc0',
    });

    const elapsed = (Date.now() - startTime) / 1000;

    // Return raw results with preview URLs
    const items = results.results.map((sound) => ({
      id: sound.id,
      name: sound.name,
      description: sound.description,
      tags: sound.tags.slice(0, 8),
      username: sound.username,
      license: sound.license,
      duration: Math.round(sound.duration * 10) / 10,
      rating: sound.avg_rating,
      downloads: sound.num_downloads,
      previewUrl: getPreviewUrl(sound),
      waveformUrl: sound.images?.waveform_m || null,
      freesoundUrl: `https://freesound.org/people/${sound.username}/sounds/${sound.id}/`,
    }));

    return NextResponse.json({
      success: true,
      query,
      totalCount: results.count,
      hasMore: results.next !== null,
      page,
      perPage,
      results: items,
      searchTimeSeconds: elapsed,
    });
  } catch (error) {
    console.error('[FreesoundTest] Error:', error);

    const message = error instanceof Error ? error.message : 'Unknown error';
    const isApiKeyMissing = message.includes('FREESOUND_API_KEY');

    return NextResponse.json(
      {
        success: false,
        error: isApiKeyMissing
          ? 'FREESOUND_API_KEY not configured in environment variables'
          : `Freesound search failed: ${message}`,
      },
      { status: isApiKeyMissing ? 503 : 500 }
    );
  }
}
