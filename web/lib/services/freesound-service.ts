/**
 * Freesound API Service
 * ============================================================================
 * Server-side client for the Freesound.org API v2.
 * Provides SFX search and sound detail retrieval.
 *
 * API Docs: https://freesound.org/docs/api/
 * Rate Limits: 60 req/min, 2000 req/day (free tier)
 *
 * Usage:
 *   const results = await searchSounds('whoosh', { maxDuration: 5 });
 *   const detail = await getSoundDetail(123456);
 */

// ============================================================================
// TYPES
// ============================================================================

export interface FreesoundSearchOptions {
  /** Max results per page (1-150, default 15) */
  pageSize?: number;
  /** Page number (1-based) */
  page?: number;
  /** Max duration in seconds */
  maxDuration?: number;
  /** Min duration in seconds */
  minDuration?: number;
  /** Sort order */
  sort?: 'score' | 'duration_asc' | 'duration_desc' | 'created_desc' | 'downloads_desc' | 'rating_desc';
  /** Filter by license (default: CC0 only) */
  license?: 'cc0' | 'any';
}

export interface FreesoundSound {
  /** Freesound sound ID */
  id: number;
  /** Sound name/title */
  name: string;
  /** Description */
  description: string;
  /** Tags */
  tags: string[];
  /** Username of uploader */
  username: string;
  /** License (e.g., "Creative Commons 0") */
  license: string;
  /** Duration in seconds */
  duration: number;
  /** Average rating (0-5) */
  avg_rating: number;
  /** Number of downloads */
  num_downloads: number;
  /** Preview URLs (browser-playable, no auth needed) */
  previews: {
    'preview-hq-mp3': string;   // High quality MP3
    'preview-lq-mp3': string;   // Low quality MP3
    'preview-hq-ogg': string;   // High quality OGG
    'preview-lq-ogg': string;   // Low quality OGG
  };
  /** Waveform image URLs */
  images?: {
    waveform_m: string;
    waveform_l: string;
    spectral_m: string;
    spectral_l: string;
  };
}

export interface FreesoundSearchResult {
  /** Total number of matching sounds */
  count: number;
  /** URL to next page (null if last page) */
  next: string | null;
  /** URL to previous page (null if first page) */
  previous: string | null;
  /** Results for this page */
  results: FreesoundSound[];
}

// ============================================================================
// CONFIGURATION
// ============================================================================

function getApiKey(): string {
  const key = process.env.FREESOUND_API_KEY;
  if (!key) {
    throw new Error(
      'FREESOUND_API_KEY environment variable is not set. ' +
      'Register at https://freesound.org/apiv2/apply/ to get a free API key.'
    );
  }
  return key;
}

const FREESOUND_BASE_URL = 'https://freesound.org/apiv2';

// Fields to request (reduces response size)
const SEARCH_FIELDS = [
  'id', 'name', 'description', 'tags', 'username', 'license',
  'duration', 'avg_rating', 'num_downloads', 'previews', 'images',
].join(',');

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Search for sounds on Freesound.
 *
 * @param query - Text search query (e.g., "whoosh", "door slam")
 * @param options - Search options (pagination, duration filter, sort)
 * @returns Search results with preview URLs
 */
export async function searchSounds(
  query: string,
  options: FreesoundSearchOptions = {}
): Promise<FreesoundSearchResult> {
  const {
    pageSize = 15,
    page = 1,
    maxDuration,
    minDuration,
    sort = 'score',
    license = 'cc0',
  } = options;

  // Build filter string
  const filters: string[] = [];

  // License filter
  if (license === 'cc0') {
    filters.push('license:"Creative Commons 0"');
  }

  // Duration filters
  if (minDuration !== undefined || maxDuration !== undefined) {
    const min = minDuration ?? 0;
    const max = maxDuration ?? '*';
    filters.push(`duration:[${min} TO ${max}]`);
  }

  // Build URL params
  const params = new URLSearchParams({
    query,
    token: getApiKey(),
    fields: SEARCH_FIELDS,
    page: String(page),
    page_size: String(Math.min(pageSize, 150)),
    sort,
  });

  if (filters.length > 0) {
    params.set('filter', filters.join(' '));
  }

  const url = `${FREESOUND_BASE_URL}/search/text/?${params.toString()}`;

  console.log(`[FreesoundService] Searching: "${query}" (page ${page}, ${pageSize}/page)`);

  const response = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    // No cache — fresh results each time per user's request
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[FreesoundService] Search failed (${response.status}):`, errorText);
    throw new Error(`Freesound API error ${response.status}: ${errorText}`);
  }

  const data: FreesoundSearchResult = await response.json();
  console.log(`[FreesoundService] Found ${data.count} results for "${query}"`);

  return data;
}

/**
 * Get detailed info for a specific sound.
 *
 * @param soundId - Freesound sound ID
 * @returns Full sound metadata
 */
export async function getSoundDetail(soundId: number): Promise<FreesoundSound> {
  const params = new URLSearchParams({
    token: getApiKey(),
    fields: SEARCH_FIELDS,
  });

  const url = `${FREESOUND_BASE_URL}/sounds/${soundId}/?${params.toString()}`;

  console.log(`[FreesoundService] Getting detail for sound ${soundId}`);

  const response = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[FreesoundService] Detail fetch failed (${response.status}):`, errorText);
    throw new Error(`Freesound API error ${response.status}: ${errorText}`);
  }

  return response.json();
}

/**
 * Get the best preview URL for a sound (HQ MP3 preferred).
 * Preview URLs are browser-playable without authentication.
 */
export function getPreviewUrl(sound: FreesoundSound): string {
  return (
    sound.previews['preview-hq-mp3'] ||
    sound.previews['preview-lq-mp3'] ||
    sound.previews['preview-hq-ogg'] ||
    sound.previews['preview-lq-ogg']
  );
}

/**
 * Search and return the single best match for a text description.
 * Used by the pipeline to resolve SFX descriptions to audio URLs.
 *
 * @param description - Natural language description (e.g., "Heavy metal chain breaking")
 * @param maxDuration - Optional max duration in seconds (for SFX, usually < 10s)
 * @returns Best matching sound with preview URL, or null if no results
 */
export async function findBestMatch(
  description: string,
  maxDuration?: number
): Promise<{ url: string; id: number; name: string; duration: number } | null> {
  try {
    const results = await searchSounds(description, {
      pageSize: 1,
      maxDuration: maxDuration ?? 10,
      sort: 'score',
      license: 'cc0',
    });

    if (results.results.length === 0) {
      console.log(`[FreesoundService] No matches for "${description}"`);
      return null;
    }

    const best = results.results[0];
    return {
      url: getPreviewUrl(best),
      id: best.id,
      name: best.name,
      duration: best.duration,
    };
  } catch (error) {
    console.error(`[FreesoundService] findBestMatch failed for "${description}":`, error);
    return null;
  }
}
