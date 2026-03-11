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

// ============================================================================
// YouTube Analytics API v2 Types
// ============================================================================

/** Raw response from YouTube Analytics API v2 reports.query */
export interface AnalyticsReportResponse {
  kind: string;
  columnHeaders: Array<{
    name: string;
    columnType: string;
    dataType: string;
  }>;
  rows: Array<Array<string | number>>;
}

/** Parsed analytics report with dynamic metrics */
export interface AnalyticsReport {
  headers: string[];
  rows: Record<string, string | number>[];
}

/** Channel info from channels.list */
export interface YouTubeChannelInfo {
  id: string;
  title: string;
  handle?: string;
  customUrl?: string;
  description: string;
  thumbnailUrl: string;
  bannerUrl?: string;
  subscriberCount: number;
  viewCount: number;
  videoCount: number;
  uploadsPlaylistId: string;
  publishedAt: string;
  /** Channel IDs featured by this channel (from brandingSettings) */
  featuredChannelsUrls?: string[];
  /** YouTube topic categories (Freebase IDs) */
  topicCategories?: string[];
}

/** Playlist item from playlistItems.list */
export interface YouTubePlaylistItem {
  videoId: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  publishedAt: string;
  position: number;
}

// ============================================================================
// Database Row Types (matching Supabase tables)
// ============================================================================

export interface YouTubeChannelRow {
  id: string;
  user_id: string;
  channel_id: string;
  channel_title: string;
  channel_handle: string | null;
  thumbnail_url: string | null;
  subscriber_count: number;
  view_count: number;
  video_count: number;
  custom_url: string | null;
  is_primary: boolean;
  linked_at: string;
  last_synced_at: string | null;
  sync_status: 'pending' | 'syncing' | 'synced' | 'error';
  sync_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChannelSnapshotRow {
  id: string;
  channel_id: string;
  snapshot_date: string;
  subscriber_count: number | null;
  view_count: number | null;
  video_count: number | null;
  estimated_revenue: number | null;
  views_day: number | null;
  subscribers_gained: number | null;
  subscribers_lost: number | null;
  estimated_minutes_watched: number | null;
  average_view_duration: number | null;
  likes: number | null;
  dislikes: number | null;
  comments: number | null;
  shares: number | null;
  created_at: string;
}

export interface VideoAnalyticsRow {
  id: string;
  channel_id: string;
  video_id: string;
  title: string | null;
  published_at: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  estimated_minutes_watched: number;
  average_view_duration: number | null;
  estimated_revenue: number | null;
  subscriber_impact: number;
  traffic_sources: Record<string, number>;
  demographics: Record<string, Record<string, number>>;
  geography: Record<string, number>;
  devices: Record<string, number>;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AudienceDemographicsRow {
  id: string;
  channel_id: string;
  snapshot_date: string;
  age_gender_data: Record<string, Record<string, number>>;
  country_data: Record<string, number>;
  device_data: Record<string, number>;
  traffic_data: Record<string, number>;
  os_data: Record<string, number>;
  created_at: string;
}

export interface CompetitorChannelRow {
  id: string;
  user_id: string;
  channel_id: string;
  channel_title: string | null;
  channel_handle: string | null;
  thumbnail_url: string | null;
  banner_url: string | null;
  subscriber_count: number;
  view_count: number;
  video_count: number;
  avg_views_per_video: number;
  upload_frequency: number | null;
  niche_tags: string[];
  label: string | null;
  last_synced_at: string | null;
  created_at: string;
}

export interface CompetitorSnapshotRow {
  id: string;
  competitor_id: string;
  snapshot_date: string;
  subscriber_count: number | null;
  view_count: number | null;
  video_count: number | null;
  recent_avg_views: number | null;
  recent_avg_likes: number | null;
  recent_avg_comments: number | null;
  engagement_rate: number | null;
  created_at: string;
}

export interface SyncLogRow {
  id: string;
  user_id: string;
  channel_id: string | null;
  sync_type: string;
  status: 'running' | 'completed' | 'failed';
  records_synced: number;
  quota_used: number;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
}

export interface PlatformAnalyticsDailyRow {
  id: string;
  snapshot_date: string;
  total_users: number | null;
  active_users: number | null;
  pending_users: number | null;
  new_users_today: number | null;
  videos_created: number;
  videos_completed: number;
  scripts_generated: number;
  renders_completed: number;
  renders_failed: number;
  gpu_hours_purchased: number;
  gpu_hours_consumed: number;
  gpu_revenue_usd: number;
  total_yt_views: number;
  total_yt_subs: number;
  total_yt_videos: number;
  total_yt_revenue: number;
  avg_render_time_ms: number | null;
  api_errors_count: number;
  created_at: string;
}
