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
} from './types';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

export class YouTubeApi {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
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
}
