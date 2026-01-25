/**
 * YouTube Data API v3 Types
 */

/**
 * Search options for YouTube videos
 */
export interface YouTubeSearchOptions {
  query: string;
  maxResults?: number; // 1-50, default 10
  order?: 'date' | 'rating' | 'relevance' | 'title' | 'videoCount' | 'viewCount';
  videoDuration?: 'any' | 'short' | 'medium' | 'long'; // short: <4min, medium: 4-20min, long: >20min
  videoLicense?: 'any' | 'creativeCommon' | 'youtube';
  videoDefinition?: 'any' | 'high' | 'standard';
  videoType?: 'any' | 'episode' | 'movie';
  safeSearch?: 'moderate' | 'none' | 'strict';
  regionCode?: string; // ISO 3166-1 alpha-2 country code
  pageToken?: string;
}

/**
 * Raw YouTube API search response
 */
export interface YouTubeApiSearchResponse {
  kind: string;
  etag: string;
  nextPageToken?: string;
  prevPageToken?: string;
  pageInfo: {
    totalResults: number;
    resultsPerPage: number;
  };
  items: YouTubeApiSearchItem[];
}

/**
 * Single item from YouTube search API
 */
export interface YouTubeApiSearchItem {
  kind: string;
  etag: string;
  id: {
    kind: string;
    videoId?: string;
    channelId?: string;
    playlistId?: string;
  };
  snippet: {
    publishedAt: string;
    channelId: string;
    title: string;
    description: string;
    thumbnails: {
      default?: YouTubeThumbnail;
      medium?: YouTubeThumbnail;
      high?: YouTubeThumbnail;
      standard?: YouTubeThumbnail;
      maxres?: YouTubeThumbnail;
    };
    channelTitle: string;
    liveBroadcastContent: string;
    publishTime: string;
  };
}

export interface YouTubeThumbnail {
  url: string;
  width: number;
  height: number;
}

/**
 * Normalized search result for UI consumption
 */
export interface YouTubeSearchResult {
  id: string; // videoId
  type: 'video';
  title: string;
  description: string;
  thumbnailUrl: string;
  channelTitle: string;
  channelId: string;
  publishedAt: string;
  url: string; // Full YouTube URL
}

/**
 * Search response normalized for UI
 */
export interface YouTubeSearchResponse {
  total: number;
  nextPageToken?: string;
  hits: YouTubeSearchResult[];
}

/**
 * Video details from videos.list API
 */
export interface YouTubeVideoDetails {
  id: string;
  title: string;
  description: string;
  channelTitle: string;
  channelId: string;
  publishedAt: string;
  duration: string; // ISO 8601 duration (PT1H2M3S)
  durationSeconds: number;
  viewCount: number;
  likeCount: number;
  thumbnailUrl: string;
  tags?: string[];
  categoryId: string;
  defaultLanguage?: string;
  defaultAudioLanguage?: string;
  license: string;
  embeddable: boolean;
}

/**
 * API error response
 */
export interface YouTubeApiError {
  error: {
    code: number;
    message: string;
    errors: Array<{
      message: string;
      domain: string;
      reason: string;
    }>;
  };
}
