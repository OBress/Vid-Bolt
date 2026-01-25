/**
 * Serper API Types
 * ============================================================================
 * Types for Serper Google Images API integration.
 * Supports comprehensive image search with filters.
 * 
 * @see https://serper.dev
 */

// =============================================================================
// Search Filter Types
// =============================================================================

export type SerperImageColor =
  | 'any'
  | 'bw'       // Black and white
  | 'trans'    // Transparent
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'teal'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'white'
  | 'gray'
  | 'black'
  | 'brown';

export type SerperImageType =
  | 'any'
  | 'face'      // Photos of faces
  | 'photo'     // Photographs
  | 'clipart'   // Clipart images
  | 'lineart'   // Line drawings
  | 'animated'; // Animated GIFs

export type SerperImageSize =
  | 'any'
  | 'large'
  | 'medium'
  | 'icon';

export type SerperImageAspectRatio =
  | 'any'
  | 'tall'     // Portrait/vertical
  | 'square'
  | 'wide';    // Landscape/horizontal

export type SerperImageLicense =
  | 'any'
  | 'f'    // Free to use or share
  | 'fc'   // Free to use or share, even commercially
  | 'fm'   // Free to use, share, or modify
  | 'fmc'  // Free to use, share, or modify, even commercially
  | 'cl'   // Creative Commons licenses
  | 'ol';  // Commercial and other licenses

export interface SerperSearchFilters {
  /** Maximum number of results to return (default: 20, max: 100) */
  maxResults?: number;

  /** Filter by color */
  color?: SerperImageColor;

  /** Filter by image type */
  type?: SerperImageType;

  /** Filter by image size */
  size?: SerperImageSize;

  /** Filter by aspect ratio */
  aspectRatio?: SerperImageAspectRatio;

  /** Filter by usage license */
  license?: SerperImageLicense;

  /** Enable safe search (default: true) */
  safe?: boolean;

  /** Country code for localized results (e.g., 'us', 'uk') */
  countryCode?: string;

  /** Language code (e.g., 'en', 'es') */
  language?: string;
}

// =============================================================================
// API Response Types
// =============================================================================

export interface SerperImage {
  /** Unique identifier (imageUrl hash) */
  id: string;

  /** Full resolution image URL */
  imageUrl: string;

  /** Thumbnail URL */
  thumbnailUrl: string;

  /** Image title/alt text */
  title: string;

  /** Source website URL */
  sourceUrl: string;

  /** Source domain name */
  source: string;

  /** Image width in pixels (if available) */
  width?: number;

  /** Image height in pixels (if available) */
  height?: number;

  /** Position in search results */
  position: number;
}

export interface SerperApiResponse {
  images: Array<{
    title: string;
    imageUrl: string;
    imageWidth: number;
    imageHeight: number;
    thumbnailUrl: string;
    thumbnailWidth: number;
    thumbnailHeight: number;
    source: string;
    domain: string;
    link: string;
    googleUrl: string;
    position: number;
  }>;
  searchParameters: {
    q: string;
    type: string;
    engine: string;
  };
  credits: number;
}

// =============================================================================
// Scrape Request/Response Types (matching Wikimedia pattern)
// =============================================================================

export interface SerperScrapeRequest {
  /** Original search query (for relevance checking) */
  query: string;

  /** Search filters used */
  filters?: SerperSearchFilters;

  /** Specific image URLs to scrape (from user selection) */
  selectedImageUrls?: string[];
}

export interface SerperScrapeResult {
  /** Total images processed */
  processed: number;

  /** Images that passed all quality filters */
  approved: number;

  /** Images rejected by any filter */
  rejected: number;

  /** Details of stored images */
  stored: Array<{
    id: string;
    title: string;
    r2Key: string;
    qualityRating: number;
  }>;

  /** Details of rejected images with reasons */
  rejectedDetails?: Array<{
    imageUrl: string;
    title: string;
    reason: string;
    /** Rejection type for UI categorization */
    rejectionType: 'watermark' | 'quality' | 'relevance' | 'duplicate' | 'error';
    /** Additional details (e.g., similarity score, watermark confidence) */
    details?: Record<string, any>;
  }>;

  /** Total processing time in milliseconds */
  processingTimeMs?: number;
}
