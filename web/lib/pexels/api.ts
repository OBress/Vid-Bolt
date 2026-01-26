import {
  PexelsSearchParams,
  PexelsPhotosResponse,
  PexelsVideosResponse,
} from "./types";

const PEXELS_API_BASE = "https://api.pexels.com";

// Production cap for automated pipeline
const PRODUCTION_MAX_RESULTS = 5;

export class PexelsApi {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Make authenticated request to Pexels API
   */
  private async request<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${PEXELS_API_BASE}${endpoint}`, {
      headers: {
        Authorization: this.apiKey,
      },
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error("Pexels API rate limit exceeded. Please try again later.");
      }
      if (response.status === 401) {
        throw new Error("Invalid Pexels API key.");
      }
      throw new Error(`Pexels API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Search for photos
   */
  async searchPhotos(params: PexelsSearchParams): Promise<PexelsPhotosResponse> {
    const {
      query,
      maxResults = 20,
      page = 1,
      orientation,
      size,
      color,
      locale,
    } = params;

    const url = new URL(`${PEXELS_API_BASE}/v1/search`);
    url.searchParams.append("query", query);
    // Enforce production cap of 5 results max
    url.searchParams.append("per_page", Math.min(Math.max(1, maxResults), PRODUCTION_MAX_RESULTS).toString());
    url.searchParams.append("page", page.toString());

    if (orientation) url.searchParams.append("orientation", orientation);
    if (size) url.searchParams.append("size", size);
    if (color) url.searchParams.append("color", color);
    if (locale) url.searchParams.append("locale", locale);

    return this.request<PexelsPhotosResponse>(url.pathname + url.search);
  }

  /**
   * Search for videos
   */
  async searchVideos(params: PexelsSearchParams): Promise<PexelsVideosResponse> {
    const {
      query,
      maxResults = 20,
      page = 1,
      orientation,
      size,
    } = params;

    const url = new URL(`${PEXELS_API_BASE}/videos/search`);
    url.searchParams.append("query", query);
    // Enforce production cap of 5 results max
    url.searchParams.append("per_page", Math.min(Math.max(1, maxResults), PRODUCTION_MAX_RESULTS).toString());
    url.searchParams.append("page", page.toString());

    if (orientation) url.searchParams.append("orientation", orientation);
    if (size) url.searchParams.append("size", size);

    return this.request<PexelsVideosResponse>(url.pathname + url.search);
  }

  /**
   * Unified search method
   */
  async search(params: PexelsSearchParams): Promise<PexelsPhotosResponse | PexelsVideosResponse> {
    if (params.mediaType === "video") {
      return this.searchVideos(params);
    }
    return this.searchPhotos(params);
  }
}
