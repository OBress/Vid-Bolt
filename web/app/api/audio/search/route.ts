/**
 * Audio Search API Route
 * ============================================================================
 * Proxies search requests to the Freesound API for SFX/audio discovery.
 *
 * GET /api/audio/search?q=whoosh&page=1&per_page=15&max_duration=10
 *
 * Returns StandardAudio[] compatible results.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  searchSounds,
  getPreviewUrl,
  type FreesoundSound,
  type FreesoundSearchOptions,
} from '@/lib/services/freesound-service';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const query = searchParams.get('q') || searchParams.get('query') || '';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const perPage = parseInt(searchParams.get('per_page') || '15', 10);
    const maxDuration = searchParams.get('max_duration')
      ? parseFloat(searchParams.get('max_duration')!)
      : undefined;
    const minDuration = searchParams.get('min_duration')
      ? parseFloat(searchParams.get('min_duration')!)
      : undefined;
    const sort = (searchParams.get('sort') as FreesoundSearchOptions['sort']) || 'score';

    if (!query.trim()) {
      return NextResponse.json(
        { error: 'Query parameter "q" is required' },
        { status: 400 }
      );
    }

    const options: FreesoundSearchOptions = {
      pageSize: Math.min(perPage, 50), // Cap at 50 for UI performance
      page,
      maxDuration,
      minDuration,
      sort,
      license: 'cc0',
    };

    const results = await searchSounds(query, options);

    // Transform to StandardAudio format for the editor
    const items = results.results.map((sound: FreesoundSound) => ({
      id: `freesound-${sound.id}`,
      title: sound.name,
      artist: sound.username,
      duration: Math.round(sound.duration * 10) / 10, // Round to 1 decimal
      file: getPreviewUrl(sound),
      thumbnail: sound.images?.waveform_m || undefined,
      attribution: {
        author: sound.username,
        source: 'Freesound',
        license: sound.license,
        url: `https://freesound.org/people/${sound.username}/sounds/${sound.id}/`,
      },
      // Extra metadata (useful for pipeline)
      _freesoundId: sound.id,
      _tags: sound.tags,
      _rating: sound.avg_rating,
      _downloads: sound.num_downloads,
    }));

    return NextResponse.json({
      items,
      totalCount: results.count,
      hasMore: results.next !== null,
      page,
      perPage: options.pageSize,
    });
  } catch (error) {
    console.error('[AudioSearch] Error:', error);

    const message = error instanceof Error ? error.message : 'Unknown error';
    const isApiKeyMissing = message.includes('FREESOUND_API_KEY');

    return NextResponse.json(
      {
        error: isApiKeyMissing
          ? 'Freesound API key not configured'
          : 'Failed to search audio',
        details: message,
      },
      { status: isApiKeyMissing ? 503 : 500 }
    );
  }
}
