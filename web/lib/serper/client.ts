/**
 * Serper API Client
 * ============================================================================
 * Client for searching Google Images via Serper API.
 * 
 * @see https://serper.dev
 */

import type {
  SerperImage,
  SerperSearchFilters,
  SerperApiResponse,
  SerperImageColor,
  SerperImageType,
  SerperImageSize,
  SerperImageAspectRatio,
  SerperImageLicense,
} from './types';

const SERPER_API_ENDPOINT = 'https://google.serper.dev/images';

// Production cap for automated pipeline
const PRODUCTION_MAX_IMAGES = 10;

// Supported image formats for classification (same as Wikimedia)
const _SUPPORTED_IMAGE_FORMATS = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];

/**
 * Generate a unique ID from an image URL
 */
function generateImageId(imageUrl: string): string {
  // Simple hash function for deterministic IDs
  let hash = 0;
  for (let i = 0; i < imageUrl.length; i++) {
    const char = imageUrl.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `serper-${Math.abs(hash).toString(36)}`;
}

/**
 * Check if an image URL points to a supported format
 */
function isSupportedImageUrl(url: string): boolean {
  const lowercaseUrl = url.toLowerCase();
  const supportedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  return supportedExtensions.some(ext => 
    lowercaseUrl.includes(ext) || 
    // Handle URLs without extensions (common for CDN URLs)
    !lowercaseUrl.match(/\.(svg|bmp|tiff?|ico|pdf)($|\?)/i)
  );
}

/**
 * Build the Serper API request body with filters
 */
function buildRequestBody(
  query: string,
  filters: SerperSearchFilters
): Record<string, any> {
  const body: Record<string, any> = {
    q: query,
    num: Math.min(filters.maxResults || 20, 100),
  };

  // Color filter
  if (filters.color && filters.color !== 'any') {
    body.tbs = body.tbs || '';
    const colorMap: Record<SerperImageColor, string> = {
      any: '',
      bw: 'ic:gray',
      trans: 'ic:trans',
      red: 'ic:specific,isc:red',
      orange: 'ic:specific,isc:orange',
      yellow: 'ic:specific,isc:yellow',
      green: 'ic:specific,isc:green',
      teal: 'ic:specific,isc:teel',
      blue: 'ic:specific,isc:blue',
      purple: 'ic:specific,isc:purple',
      pink: 'ic:specific,isc:pink',
      white: 'ic:specific,isc:white',
      gray: 'ic:specific,isc:gray',
      black: 'ic:specific,isc:black',
      brown: 'ic:specific,isc:brown',
    };
    if (colorMap[filters.color]) {
      body.tbs += (body.tbs ? ',' : '') + colorMap[filters.color];
    }
  }

  // Type filter
  if (filters.type && filters.type !== 'any') {
    body.tbs = body.tbs || '';
    const typeMap: Record<SerperImageType, string> = {
      any: '',
      face: 'itp:face',
      photo: 'itp:photo',
      clipart: 'itp:clipart',
      lineart: 'itp:lineart',
      animated: 'itp:animated',
    };
    if (typeMap[filters.type]) {
      body.tbs += (body.tbs ? ',' : '') + typeMap[filters.type];
    }
  }

  // Size filter
  if (filters.size && filters.size !== 'any') {
    body.tbs = body.tbs || '';
    const sizeMap: Record<SerperImageSize, string> = {
      any: '',
      large: 'isz:l',
      medium: 'isz:m',
      icon: 'isz:i',
    };
    if (sizeMap[filters.size]) {
      body.tbs += (body.tbs ? ',' : '') + sizeMap[filters.size];
    }
  }

  // Aspect ratio filter
  if (filters.aspectRatio && filters.aspectRatio !== 'any') {
    body.tbs = body.tbs || '';
    const ratioMap: Record<SerperImageAspectRatio, string> = {
      any: '',
      tall: 'iar:t',
      square: 'iar:s',
      wide: 'iar:w',
    };
    if (ratioMap[filters.aspectRatio]) {
      body.tbs += (body.tbs ? ',' : '') + ratioMap[filters.aspectRatio];
    }
  }

  // License filter
  if (filters.license && filters.license !== 'any') {
    body.tbs = body.tbs || '';
    const licenseMap: Record<SerperImageLicense, string> = {
      any: '',
      f: 'sur:f',
      fc: 'sur:fc',
      fm: 'sur:fm',
      fmc: 'sur:fmc',
      cl: 'sur:cl',
      ol: 'sur:ol',
    };
    if (licenseMap[filters.license]) {
      body.tbs += (body.tbs ? ',' : '') + licenseMap[filters.license];
    }
  }

  // Safe search
  if (filters.safe !== false) {
    body.safe = 'active';
  }

  // Location/language
  if (filters.countryCode) {
    body.gl = filters.countryCode;
  }
  if (filters.language) {
    body.hl = filters.language;
  }

  return body;
}

/**
 * Search for images using Serper Google Images API.
 * 
 * @param query - Search query string
 * @param filters - Optional filters for results
 * @param apiKey - Serper API key (defaults to env var)
 * @returns Array of matching images
 */
export async function searchSerperImages(
  query: string,
  filters: SerperSearchFilters = {},
  apiKey?: string
): Promise<SerperImage[]> {
  const key = apiKey || process.env.SERPER_API_KEY;
  
  if (!key) {
    throw new Error('SERPER_API_KEY is not configured');
  }

  // Enforce production cap of 10 images max
  const maxResults = Math.min(filters.maxResults || PRODUCTION_MAX_IMAGES, PRODUCTION_MAX_IMAGES);
  
  // Default to 'any' size to get both medium and large images
  const enhancedFilters: SerperSearchFilters = {
    ...filters,
    size: filters.size || 'any',
  };
  
  console.log(`[Serper] Searching for: "${query}" (limit: ${maxResults}, size: ${enhancedFilters.size})`);

  const requestBody = buildRequestBody(query, enhancedFilters);

  const response = await fetch(SERPER_API_ENDPOINT, {
    method: 'POST',
    headers: {
      'X-API-KEY': key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Serper] API error:', response.status, errorText);
    throw new Error(`Serper API error: ${response.status} ${response.statusText}`);
  }

  const data: SerperApiResponse = await response.json();

  if (!data.images || data.images.length === 0) {
    console.log('[Serper] No results found');
    return [];
  }

  // Map API response to our type with filtering
  const results: SerperImage[] = [];

  for (const img of data.images) {
    // Skip unsupported formats
    if (!isSupportedImageUrl(img.imageUrl)) {
      continue;
    }

    results.push({
      id: generateImageId(img.imageUrl),
      imageUrl: img.imageUrl,
      thumbnailUrl: img.thumbnailUrl,
      title: img.title || 'Untitled',
      sourceUrl: img.link,
      source: img.domain || img.source,
      width: img.imageWidth,
      height: img.imageHeight,
      position: img.position,
    });

    if (results.length >= maxResults) break;
  }

  console.log(`[Serper] Found ${results.length} images after filtering`);
  return results;
}

/**
 * Download an image from a URL and return as buffer.
 * 
 * @param url - The image URL to download
 * @returns Buffer containing the image data
 */
export async function downloadSerperImage(url: string): Promise<Buffer> {
  console.log(`[Serper] Downloading: ${url.substring(0, 80)}...`);

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status}`);
  }

  // Check content-type is actually an image
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.startsWith('image/')) {
    throw new Error(`Invalid content-type: ${contentType} (expected image/*)`);
  }
  
  // Reject GIF and SVG - not supported by Google/Gemini AI models
  if (contentType.includes('gif') || contentType.includes('svg')) {
    throw new Error(`Unsupported image format: ${contentType} (GIF/SVG not supported)`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  // Validate minimum size - real images should be at least 5KB
  if (buffer.length < 5000) {
    throw new Error(`Image too small (${buffer.length} bytes) - likely a blocked/placeholder response`);
  }
  
  // Check if buffer starts with HTML (common for blocked downloads returning error pages)
  const firstBytes = buffer.subarray(0, 100).toString('utf8').toLowerCase();
  if (firstBytes.includes('<!doctype') || firstBytes.includes('<html') || firstBytes.includes('<?xml')) {
    throw new Error('Response is HTML/XML, not an image - likely blocked or requires auth');
  }
  
  return buffer;
}

/**
 * Get file extension from URL
 */
export function getExtensionFromUrl(url: string): string {
  // Try to extract extension from URL
  const match = url.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  if (match) {
    const ext = match[1].toLowerCase();
    // Normalize common variations
    if (ext === 'jpeg') return 'jpg';
    if (['jpg', 'png', 'gif', 'webp'].includes(ext)) return ext;
  }
  // Default to jpg for unknown
  return 'jpg';
}
