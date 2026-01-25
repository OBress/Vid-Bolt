/**
 * Wikimedia Commons Types
 * ============================================================================
 * Types for Wikimedia Commons API integration.
 * Supports images initially, designed for future video/audio support.
 */

export type WikimediaMediaType = 'image' | 'video' | 'audio';

export interface WikimediaSearchFilters {
  /** Maximum number of results to return (default: 20) */
  maxResults?: number;
  
  /** Media type to search for (default: 'image') */
  mediaType?: WikimediaMediaType;
  
  /** Minimum width in pixels */
  minWidth?: number;
  
  /** Minimum height in pixels */
  minHeight?: number;
  
  /** Filter by aspect ratio: 'landscape', 'portrait', 'square', 'any' */
  aspectRatio?: 'landscape' | 'portrait' | 'square' | 'any';
  
  /** Minimum duration in seconds (for video/audio, future use) */
  minDuration?: number;
  
  /** Maximum duration in seconds (for video/audio, future use) */
  maxDuration?: number;
}

export interface WikimediaImage {
  /** Wikimedia page ID */
  pageId: number;
  
  /** File title (e.g., "File:Example.jpg") */
  title: string;
  
  /** Full resolution URL */
  url: string;
  
  /** Thumbnail URL (400px) */
  thumbnailUrl: string;
  
  /** Original uploader/author */
  author?: string;
  
  /** License name (e.g., "CC BY-SA 4.0") */
  license?: string;
  
  /** Image width in pixels */
  width: number;
  
  /** Image height in pixels */
  height: number;
  
  /** Wikimedia description page URL */
  descriptionUrl: string;
  
  /** Media type */
  mediaType: WikimediaMediaType;
  
  /** Duration in seconds (for video/audio) */
  duration?: number;
  
  /** MIME type */
  mimeType?: string;
}

export interface WikimediaScrapeRequest {
  query: string;
  filters?: WikimediaSearchFilters;
  /** Optional: specific page IDs to scrape (if user selected from preview) */
  selectedPageIds?: number[];
}

export interface WikimediaScrapeResult {
  /** Total images processed */
  processed: number;
  
  /** Images that passed quality filter */
  approved: number;
  
  /** Images rejected by quality filter */
  rejected: number;
  
  /** Details of stored images */
  stored: Array<{
    pageId: number;
    title: string;
    r2Key: string;
    qualityRating: number;
  }>;
  
  /** Details of rejected images */
  rejectedDetails?: Array<{
    pageId: number;
    title: string;
    qualityRating: number;
    reason: string;
  }>;
}
