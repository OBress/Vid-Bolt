/**
 * YouTube Analytics API v2 Client
 * ============================================================================
 * Fetches analytics data (views, revenue, demographics, etc.) from the
 * YouTube Analytics API using the user's GCP OAuth token.
 *
 * Follows the same pattern as YouTubeApi in ./api.ts.
 */

import type {
  AnalyticsReportResponse,
  AnalyticsReport,
  YouTubeApiError,
} from './types';

const ANALYTICS_API_BASE = 'https://youtubeanalytics.googleapis.com/v2';

export class YouTubeAnalyticsApi {
  private accessToken: string;
  private projectId?: string;

  constructor(accessToken: string, projectId?: string) {
    this.accessToken = accessToken;
    this.projectId = projectId;
  }

  // --------------------------------------------------------------------------
  // Private request helper
  // --------------------------------------------------------------------------

  private async request<T>(endpoint: string, params: URLSearchParams): Promise<T> {
    const url = `${ANALYTICS_API_BASE}${endpoint}?${params.toString()}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: 'application/json',
        ...(this.projectId && { 'X-Goog-User-Project': this.projectId }),
      },
    });

    if (!response.ok) {
      const errorData: YouTubeApiError = await response.json().catch(() => ({
        error: { code: response.status, message: response.statusText, errors: [] },
      }));

      if (response.status === 401) {
        throw new Error('YouTube Analytics API authentication failed. Please reconnect your Google account.');
      }

      if (response.status === 403) {
        const reason = errorData.error?.errors?.[0]?.reason;

        if (reason === 'insufficientPermissions') {
          throw new Error(
            'YouTube Analytics scopes not authorized. Please reconnect your Google account to grant analytics permissions.'
          );
        }

        if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') {
          throw new Error('YouTube API daily quota exceeded. Resets at midnight Pacific Time.');
        }

        if (reason === 'forbidden') {
          throw new Error('Access forbidden. Please ensure analytics scopes are authorized.');
        }
      }

      throw new Error(`YouTube Analytics API error: ${errorData.error?.message || response.statusText}`);
    }

    return response.json();
  }

  /**
   * Parse a raw analytics report response into a structured format.
   */
  private parseReport(raw: AnalyticsReportResponse): AnalyticsReport {
    const headers = raw.columnHeaders.map((h) => h.name);
    const rows = (raw.rows || []).map((row) => {
      const obj: Record<string, string | number> = {};
      headers.forEach((header, i) => {
        obj[header] = row[i];
      });
      return obj;
    });
    return { headers, rows };
  }

  // --------------------------------------------------------------------------
  // Channel-level metrics
  // --------------------------------------------------------------------------

  /**
   * Get channel metrics for a date range (daily breakdown).
   * Quota cost: ~1-5 units
   */
  async getChannelMetrics(
    startDate: string,
    endDate: string,
    metrics: string[] = [
      'views',
      'estimatedMinutesWatched',
      'subscribersGained',
      'subscribersLost',
      'likes',
      'comments',
      'shares',
    ],
    dimensions: string = 'day',
  ): Promise<AnalyticsReport> {
    const params = new URLSearchParams({
      ids: 'channel==MINE',
      startDate,
      endDate,
      metrics: metrics.join(','),
      dimensions,
      sort: dimensions === 'day' ? 'day' : `-${metrics[0]}`,
    });

    const raw = await this.request<AnalyticsReportResponse>('/reports', params);
    return this.parseReport(raw);
  }

  /**
   * Get top videos by a given metric.
   * Quota cost: ~1-5 units
   */
  async getTopVideos(
    startDate: string,
    endDate: string,
    maxResults: number = 50,
    metrics: string[] = [
      'views',
      'estimatedMinutesWatched',
      'averageViewDuration',
      'likes',
      'comments',
      'shares',
    ],
  ): Promise<AnalyticsReport> {
    const params = new URLSearchParams({
      ids: 'channel==MINE',
      startDate,
      endDate,
      metrics: metrics.join(','),
      dimensions: 'video',
      sort: '-views',
      maxResults: maxResults.toString(),
    });

    const raw = await this.request<AnalyticsReportResponse>('/reports', params);
    return this.parseReport(raw);
  }

  // --------------------------------------------------------------------------
  // Audience demographics
  // --------------------------------------------------------------------------

  /**
   * Get age/gender breakdown.
   * Quota cost: ~1-2 units
   */
  async getAudienceDemographics(
    startDate: string,
    endDate: string,
  ): Promise<AnalyticsReport> {
    const params = new URLSearchParams({
      ids: 'channel==MINE',
      startDate,
      endDate,
      metrics: 'viewerPercentage',
      dimensions: 'ageGroup,gender',
    });

    const raw = await this.request<AnalyticsReportResponse>('/reports', params);
    return this.parseReport(raw);
  }

  // --------------------------------------------------------------------------
  // Traffic sources
  // --------------------------------------------------------------------------

  /**
   * Get traffic source breakdown.
   * Quota cost: ~1-2 units
   */
  async getTrafficSources(
    startDate: string,
    endDate: string,
  ): Promise<AnalyticsReport> {
    const params = new URLSearchParams({
      ids: 'channel==MINE',
      startDate,
      endDate,
      metrics: 'views,estimatedMinutesWatched',
      dimensions: 'insightTrafficSourceType',
      sort: '-views',
    });

    const raw = await this.request<AnalyticsReportResponse>('/reports', params);
    return this.parseReport(raw);
  }

  // --------------------------------------------------------------------------
  // Device / Operating System
  // --------------------------------------------------------------------------

  /**
   * Get device type breakdown.
   * Quota cost: ~1 unit
   */
  async getDeviceBreakdown(
    startDate: string,
    endDate: string,
  ): Promise<AnalyticsReport> {
    const params = new URLSearchParams({
      ids: 'channel==MINE',
      startDate,
      endDate,
      metrics: 'views,estimatedMinutesWatched',
      dimensions: 'deviceType',
      sort: '-views',
    });

    const raw = await this.request<AnalyticsReportResponse>('/reports', params);
    return this.parseReport(raw);
  }

  /**
   * Get operating system breakdown.
   * Quota cost: ~1 unit
   */
  async getOSBreakdown(
    startDate: string,
    endDate: string,
  ): Promise<AnalyticsReport> {
    const params = new URLSearchParams({
      ids: 'channel==MINE',
      startDate,
      endDate,
      metrics: 'views,estimatedMinutesWatched',
      dimensions: 'operatingSystem',
      sort: '-views',
    });

    const raw = await this.request<AnalyticsReportResponse>('/reports', params);
    return this.parseReport(raw);
  }

  // --------------------------------------------------------------------------
  // Geographic data
  // --------------------------------------------------------------------------

  /**
   * Get views by country.
   * Quota cost: ~1-2 units
   */
  async getGeography(
    startDate: string,
    endDate: string,
    maxResults: number = 50,
  ): Promise<AnalyticsReport> {
    const params = new URLSearchParams({
      ids: 'channel==MINE',
      startDate,
      endDate,
      metrics: 'views,estimatedMinutesWatched',
      dimensions: 'country',
      sort: '-views',
      maxResults: maxResults.toString(),
    });

    const raw = await this.request<AnalyticsReportResponse>('/reports', params);
    return this.parseReport(raw);
  }

  // --------------------------------------------------------------------------
  // Revenue / Monetization (requires yt-analytics-monetary.readonly scope)
  // --------------------------------------------------------------------------

  /**
   * Get daily revenue metrics.
   * Returns empty report if channel isn't monetized.
   * Quota cost: ~1-2 units
   */
  async getRevenue(
    startDate: string,
    endDate: string,
  ): Promise<AnalyticsReport> {
    try {
      const params = new URLSearchParams({
        ids: 'channel==MINE',
        startDate,
        endDate,
        metrics: 'estimatedRevenue,estimatedAdRevenue,grossRevenue,adImpressions,cpm',
        dimensions: 'day',
        sort: 'day',
      });

      const raw = await this.request<AnalyticsReportResponse>('/reports', params);
      return this.parseReport(raw);
    } catch (error: unknown) {
      // If monetization isn't enabled, return empty report
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('forbidden') || message.includes('insufficientPermissions')) {
        return { headers: [], rows: [] };
      }
      throw error;
    }
  }

  /**
   * Get per-video revenue.
   * Quota cost: ~1-5 units
   */
  async getVideoRevenue(
    startDate: string,
    endDate: string,
    maxResults: number = 50,
  ): Promise<AnalyticsReport> {
    try {
      const params = new URLSearchParams({
        ids: 'channel==MINE',
        startDate,
        endDate,
        metrics: 'estimatedRevenue,views,estimatedMinutesWatched',
        dimensions: 'video',
        sort: '-estimatedRevenue',
        maxResults: maxResults.toString(),
      });

      const raw = await this.request<AnalyticsReportResponse>('/reports', params);
      return this.parseReport(raw);
    } catch {
      return { headers: [], rows: [] };
    }
  }
}
