/**
 * Wikimedia Commons API Client
 * ============================================================================
 * Client for searching and fetching images from Wikimedia Commons.
 * Uses the MediaWiki Action API.
 * 
 * @see https://commons.wikimedia.org/w/api.php
 */

import type { WikimediaImage, WikimediaSearchFilters } from './types';

const WIKIMEDIA_API_ENDPOINT = 'https://commons.wikimedia.org/w/api.php';
const USER_AGENT = 'Vid-Bolt/1.0 (https://vidbolt.app; contact@vidbolt.app)';

/**
 * Calculate aspect ratio category from dimensions
 */
function getAspectRatioCategory(width: number, height: number): 'landscape' | 'portrait' | 'square' {
  const ratio = width / height;
  if (ratio > 1.1) return 'landscape';
  if (ratio < 0.9) return 'portrait';
  return 'square';
}

/**
 * Search Wikimedia Commons for images matching a query.
 * 
 * @param query - Search query string
 * @param filters - Optional filters for results
 * @returns Array of matching images
 */
export async function searchWikimediaImages(
  query: string,
  filters: WikimediaSearchFilters = {}
): Promise<WikimediaImage[]> {
  const {
    maxResults = 20,
    minWidth,
    minHeight,
    aspectRatio = 'any',
  } = filters;

  // Request more than needed to account for filtering
  const fetchLimit = Math.min(maxResults * 3, 100);

  console.log(`[Wikimedia] Searching for: "${query}" (limit: ${maxResults})`);

  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrnamespace: '6', // File namespace
    gsrsearch: query,
    gsrlimit: String(fetchLimit),
    prop: 'imageinfo',
    iiprop: 'url|size|extmetadata|mime',
    iiurlwidth: '400', // Thumbnail width
    origin: '*', // CORS
  });

  const response = await fetch(`${WIKIMEDIA_API_ENDPOINT}?${params}`, {
    headers: {
      'User-Agent': USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`Wikimedia API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (!data.query?.pages) {
    console.log('[Wikimedia] No results found');
    return [];
  }

  const pages = Object.values(data.query.pages) as any[];
  const results: WikimediaImage[] = [];

  for (const page of pages) {
    if (!page.imageinfo?.[0]) continue;

    const info = page.imageinfo[0];
    const meta = info.extmetadata || {};

    const width = info.width || 0;
    const height = info.height || 0;

    // Apply filters
    if (minWidth && width < minWidth) continue;
    if (minHeight && height < minHeight) continue;
    if (aspectRatio !== 'any' && getAspectRatioCategory(width, height) !== aspectRatio) continue;

    // Only include images (skip video/audio for now)
    const mimeType = info.mime || '';
    if (!mimeType.startsWith('image/')) continue;

    results.push({
      pageId: page.pageid,
      title: page.title?.replace('File:', '') || 'Untitled',
      url: info.url,
      thumbnailUrl: info.thumburl || info.url,
      author: meta.Artist?.value?.replace(/<[^>]*>/g, '') || 'Unknown',
      license: meta.LicenseShortName?.value || 'Unknown',
      width,
      height,
      descriptionUrl: info.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
      mediaType: 'image',
      mimeType,
    });

    if (results.length >= maxResults) break;
  }

  console.log(`[Wikimedia] Found ${results.length} images after filtering`);
  return results;
}

/**
 * Download an image from Wikimedia and return as buffer.
 * 
 * @param url - The image URL to download
 * @returns Buffer containing the image data
 */
export async function downloadWikimediaImage(url: string): Promise<Buffer> {
  console.log(`[Wikimedia] Downloading: ${url.substring(0, 80)}...`);
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Get file extension from MIME type or URL
 */
export function getExtensionFromMime(mimeType: string | undefined, url: string): string {
  if (mimeType) {
    const mimeMap: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'image/svg+xml': 'svg',
    };
    if (mimeMap[mimeType]) return mimeMap[mimeType];
  }
  
  // Fallback to URL extension
  const match = url.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  return match?.[1]?.toLowerCase() || 'jpg';
}
