/**
 * YouTube Data API v3 Client
 * 
 * Uses Bearer token from GCP OAuth (getValidGCPToken) to make
 * authenticated requests against the user's GCP project quota.
 */

import {
  YouTubeSearchOptions,
  YouTubeSearchResponse,
  YouTubeSearchResult,
  YouTubeApiSearchResponse,
  YouTubeVideoDetails,
  YouTubeApiError,
  YouTubeChannelInfo,
  YouTubePlaylistItem,
} from './types';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

export class YouTubeApi {
  private accessToken: string;
  private projectId?: string;

  constructor(accessToken: string, projectId?: string) {
    this.accessToken = accessToken;
    this.projectId = projectId;
  }

  /**
   * Make authenticated request to YouTube Data API
   */
  private async request<T>(endpoint: string, params: URLSearchParams): Promise<T> {
    const url = `${YOUTUBE_API_BASE}${endpoint}?${params.toString()}`;
    
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: 'application/json',
        ...(this.projectId && { 'X-Goog-User-Project': this.projectId }),
      },
    });

    if (!response.ok) {
      const errorData: YouTubeApiError = await response.json().catch(() => ({
        error: { code: response.status, message: response.statusText, errors: [] }
      }));
      
      // Handle specific error cases
      if (response.status === 401) {
        throw new Error('YouTube API authentication failed. Please reconnect your Google account.');
      }
      
      if (response.status === 403) {
        const reason = errorData.error?.errors?.[0]?.reason;
        
        if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') {
          throw new Error('Daily quota exceeded. You have used all your YouTube API quota for today. Resets at midnight Pacific Time.');
        }
        
        if (reason === 'accessNotConfigured') {
          throw new Error('YouTube Data API is not enabled in your Google Cloud project. Please enable it in the Google Cloud Console.');
        }
        
        if (reason === 'forbidden') {
          throw new Error('Access forbidden. Please ensure the youtube.readonly scope is authorized.');
        }
      }
      
      throw new Error(`YouTube API error: ${errorData.error?.message || response.statusText}`);
    }

    return response.json();
  }

  /**
   * Search for videos
   * 
   * Quota cost: 100 units per call
   */
  async searchVideos(options: YouTubeSearchOptions): Promise<YouTubeSearchResponse> {
    const {
      query,
      maxResults = 10,
      order = 'relevance',
      videoDuration = 'any',
      videoLicense = 'any',
      videoDefinition = 'any',
      videoType = 'any',
      safeSearch = 'moderate',
      regionCode,
      pageToken,
    } = options;

    const params = new URLSearchParams({
      part: 'snippet',
      q: query,
      type: 'video',
      maxResults: Math.min(Math.max(1, maxResults), 50).toString(),
      order,
      safeSearch,
    });

    // Add optional filters
    if (videoDuration !== 'any') {
      params.set('videoDuration', videoDuration);
    }
    
    if (videoLicense !== 'any') {
      params.set('videoLicense', videoLicense);
    }
    
    if (videoDefinition !== 'any') {
      params.set('videoDefinition', videoDefinition);
    }
    
    if (videoType !== 'any') {
      params.set('videoType', videoType);
    }
    
    if (regionCode) {
      params.set('regionCode', regionCode);
    }
    
    if (pageToken) {
      params.set('pageToken', pageToken);
    }

    const response = await this.request<YouTubeApiSearchResponse>('/search', params);

    // Normalize results for UI consumption
    const hits: YouTubeSearchResult[] = response.items
      .filter(item => item.id.videoId) // Only include videos
      .map(item => ({
        id: item.id.videoId!,
        type: 'video' as const,
        title: item.snippet.title,
        description: item.snippet.description,
        thumbnailUrl: item.snippet.thumbnails.high?.url || 
                      item.snippet.thumbnails.medium?.url || 
                      item.snippet.thumbnails.default?.url || '',
        channelTitle: item.snippet.channelTitle,
        channelId: item.snippet.channelId,
        publishedAt: item.snippet.publishedAt,
        url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
      }));

    return {
      total: response.pageInfo.totalResults,
      nextPageToken: response.nextPageToken,
      hits,
    };
  }

  /**
   * Get detailed video information
   * 
   * Quota cost: 1 unit per call (plus parts requested)
   */
  async getVideoDetails(videoId: string): Promise<YouTubeVideoDetails | null> {
    const params = new URLSearchParams({
      part: 'snippet,contentDetails,statistics,status',
      id: videoId,
    });

    const response = await this.request<{
      items: Array<{
        id: string;
        snippet: {
          title: string;
          description: string;
          channelTitle: string;
          channelId: string;
          publishedAt: string;
          thumbnails: {
            high?: { url: string };
            maxres?: { url: string };
          };
          tags?: string[];
          categoryId: string;
          defaultLanguage?: string;
          defaultAudioLanguage?: string;
        };
        contentDetails: {
          duration: string;
          dimension: string;
          definition: string;
          caption: string;
          licensedContent: boolean;
        };
        statistics: {
          viewCount: string;
          likeCount: string;
          commentCount: string;
        };
        status: {
          license: string;
          embeddable: boolean;
        };
      }>;
    }>('/videos', params);

    if (!response.items || response.items.length === 0) {
      return null;
    }

    const video = response.items[0];
    
    return {
      id: video.id,
      title: video.snippet.title,
      description: video.snippet.description,
      channelTitle: video.snippet.channelTitle,
      channelId: video.snippet.channelId,
      publishedAt: video.snippet.publishedAt,
      duration: video.contentDetails.duration,
      durationSeconds: this.parseDuration(video.contentDetails.duration),
      viewCount: parseInt(video.statistics.viewCount || '0', 10),
      likeCount: parseInt(video.statistics.likeCount || '0', 10),
      thumbnailUrl: video.snippet.thumbnails.maxres?.url || 
                    video.snippet.thumbnails.high?.url || '',
      tags: video.snippet.tags,
      categoryId: video.snippet.categoryId,
      defaultLanguage: video.snippet.defaultLanguage,
      defaultAudioLanguage: video.snippet.defaultAudioLanguage,
      license: video.status.license,
      embeddable: video.status.embeddable,
    };
  }

  /**
   * Parse ISO 8601 duration to seconds
   * e.g., PT1H2M3S -> 3723
   */
  private parseDuration(duration: string): number {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    
    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);
    const seconds = parseInt(match[3] || '0', 10);
    
    return hours * 3600 + minutes * 60 + seconds;
  }

  // ==========================================================================
  // Channel Management Methods (for Analytics)
  // ==========================================================================

  /**
   * Get all channels owned by the authenticated user.
   * Quota cost: 1 unit
   */
  async getMyChannels(): Promise<YouTubeChannelInfo[]> {
    const params = new URLSearchParams({
      part: 'snippet,statistics,contentDetails,brandingSettings',
      mine: 'true',
    });

    const response = await this.request<{
      items: Array<{
        id: string;
        snippet: {
          title: string;
          customUrl?: string;
          description: string;
          publishedAt: string;
          thumbnails: {
            high?: { url: string };
            default?: { url: string };
          };
        };
        statistics: {
          subscriberCount: string;
          viewCount: string;
          videoCount: string;
          hiddenSubscriberCount: boolean;
        };
        contentDetails: {
          relatedPlaylists: { uploads: string };
        };
        brandingSettings?: {
          image?: { bannerExternalUrl?: string };
        };
      }>;
    }>('/channels', params);

    return (response.items || []).map((ch) => ({
      id: ch.id,
      title: ch.snippet.title,
      handle: ch.snippet.customUrl?.replace('@', ''),
      customUrl: ch.snippet.customUrl,
      description: ch.snippet.description,
      thumbnailUrl: ch.snippet.thumbnails.high?.url || ch.snippet.thumbnails.default?.url || '',
      bannerUrl: ch.brandingSettings?.image?.bannerExternalUrl,
      subscriberCount: ch.statistics.hiddenSubscriberCount
        ? 0
        : parseInt(ch.statistics.subscriberCount || '0', 10),
      viewCount: parseInt(ch.statistics.viewCount || '0', 10),
      videoCount: parseInt(ch.statistics.videoCount || '0', 10),
      uploadsPlaylistId: ch.contentDetails.relatedPlaylists.uploads,
      publishedAt: ch.snippet.publishedAt,
    }));
  }

  /**
   * Get channel info by channel ID (for competitors / niche discovery).
   * Quota cost: 1 unit
   */
  async getChannelById(channelId: string): Promise<YouTubeChannelInfo | null> {
    const params = new URLSearchParams({
      part: 'snippet,statistics,contentDetails,brandingSettings',
      id: channelId,
    });

    const response = await this.request<{
      items: Array<{
        id: string;
        snippet: {
          title: string;
          customUrl?: string;
          description: string;
          publishedAt: string;
          thumbnails: {
            high?: { url: string };
            default?: { url: string };
          };
        };
        statistics: {
          subscriberCount: string;
          viewCount: string;
          videoCount: string;
          hiddenSubscriberCount: boolean;
        };
        contentDetails: {
          relatedPlaylists: { uploads: string };
        };
        brandingSettings?: {
          image?: { bannerExternalUrl?: string };
        };
      }>;
    }>('/channels', params);

    if (!response.items || response.items.length === 0) return null;

    const ch = response.items[0];
    return {
      id: ch.id,
      title: ch.snippet.title,
      handle: ch.snippet.customUrl?.replace('@', ''),
      customUrl: ch.snippet.customUrl,
      description: ch.snippet.description,
      thumbnailUrl: ch.snippet.thumbnails.high?.url || ch.snippet.thumbnails.default?.url || '',
      bannerUrl: ch.brandingSettings?.image?.bannerExternalUrl,
      subscriberCount: ch.statistics.hiddenSubscriberCount
        ? 0
        : parseInt(ch.statistics.subscriberCount || '0', 10),
      viewCount: parseInt(ch.statistics.viewCount || '0', 10),
      videoCount: parseInt(ch.statistics.videoCount || '0', 10),
      uploadsPlaylistId: ch.contentDetails.relatedPlaylists.uploads,
      publishedAt: ch.snippet.publishedAt,
    };
  }

  /**
   * Get videos from a playlist (e.g., uploads playlist).
   * Quota cost: 1 unit per call
   */
  async getChannelVideos(
    playlistId: string,
    maxResults: number = 50,
    pageToken?: string,
  ): Promise<{ items: YouTubePlaylistItem[]; nextPageToken?: string }> {
    const params = new URLSearchParams({
      part: 'snippet',
      playlistId,
      maxResults: Math.min(maxResults, 50).toString(),
    });

    if (pageToken) params.set('pageToken', pageToken);

    const response = await this.request<{
      nextPageToken?: string;
      items: Array<{
        snippet: {
          title: string;
          description: string;
          publishedAt: string;
          position: number;
          resourceId: { videoId: string };
          thumbnails: {
            high?: { url: string };
            medium?: { url: string };
            default?: { url: string };
          };
        };
      }>;
    }>('/playlistItems', params);

    return {
      nextPageToken: response.nextPageToken,
      items: (response.items || []).map((item) => ({
        videoId: item.snippet.resourceId.videoId,
        title: item.snippet.title,
        description: item.snippet.description,
        thumbnailUrl:
          item.snippet.thumbnails.high?.url ||
          item.snippet.thumbnails.medium?.url ||
          item.snippet.thumbnails.default?.url ||
          '',
        publishedAt: item.snippet.publishedAt,
        position: item.snippet.position,
      })),
    };
  }

  /**
   * Search for channels by query (name, @handle, etc.).
   * Quota cost: 100 units per call
   */
  async searchChannels(
    query: string,
    maxResults: number = 10,
  ): Promise<Array<{ channelId: string; title: string; thumbnailUrl: string; description: string }>> {
    const params = new URLSearchParams({
      part: 'snippet',
      q: query,
      type: 'channel',
      maxResults: Math.min(maxResults, 50).toString(),
    });

    const response = await this.request<YouTubeApiSearchResponse>('/search', params);

    return (response.items || [])
      .filter((item) => item.id.channelId)
      .map((item) => ({
        channelId: item.id.channelId!,
        title: item.snippet.title,
        thumbnailUrl:
          item.snippet.thumbnails.high?.url ||
          item.snippet.thumbnails.medium?.url ||
          item.snippet.thumbnails.default?.url ||
          '',
        description: item.snippet.description,
      }));
  }

  /**
   * Get details for multiple videos at once (up to 50 per call).
   * Quota cost: 1 unit per call
   */
  async getMultipleVideoDetails(
    videoIds: string[],
  ): Promise<Array<{
    id: string;
    title: string;
    publishedAt: string;
    thumbnailUrl: string;
    durationSeconds: number;
    viewCount: number;
    likeCount: number;
    commentCount: number;
    tags?: string[];
  }>> {
    if (videoIds.length === 0) return [];

    // Process in batches of 50
    const results: Array<{
      id: string;
      title: string;
      publishedAt: string;
      thumbnailUrl: string;
      durationSeconds: number;
      viewCount: number;
      likeCount: number;
      commentCount: number;
      tags?: string[];
    }> = [];

    for (let i = 0; i < videoIds.length; i += 50) {
      const batch = videoIds.slice(i, i + 50);
      const params = new URLSearchParams({
        part: 'snippet,contentDetails,statistics',
        id: batch.join(','),
      });

      const response = await this.request<{
        items: Array<{
          id: string;
          snippet: {
            title: string;
            publishedAt: string;
            thumbnails: { high?: { url: string }; maxres?: { url: string } };
            tags?: string[];
          };
          contentDetails: { duration: string };
          statistics: {
            viewCount: string;
            likeCount: string;
            commentCount: string;
          };
        }>;
      }>('/videos', params);

      for (const v of response.items || []) {
        results.push({
          id: v.id,
          title: v.snippet.title,
          publishedAt: v.snippet.publishedAt,
          thumbnailUrl: v.snippet.thumbnails.maxres?.url || v.snippet.thumbnails.high?.url || '',
          durationSeconds: this.parseDuration(v.contentDetails.duration),
          viewCount: parseInt(v.statistics.viewCount || '0', 10),
          likeCount: parseInt(v.statistics.likeCount || '0', 10),
          commentCount: parseInt(v.statistics.commentCount || '0', 10),
          tags: v.snippet.tags,
        });
      }
    }

    return results;
  }
}

