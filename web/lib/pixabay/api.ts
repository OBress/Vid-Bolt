import { PixabayApiResponse, PixabayImageHit, PixabaySearchParams, PixabayVideoHit } from "./types";

const PIXABAY_API_URL = "https://pixabay.com/api/";

export class PixabayApi {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Search for images or videos on Pixabay
   */
  async search(params: PixabaySearchParams): Promise<PixabayApiResponse<PixabayImageHit | PixabayVideoHit>> {
    const {
      query,
      mediaType,
      maxResults = 20,
      imageType = "all",
      orientation = "all",
      safeSearch = true,
      page = 1
    } = params;
    
    // Determine base URL (videos use a different endpoint path structure in client, 
    // but the docs say https://pixabay.com/api/videos/ for videos)
    // Actually, normally it's ?key=...&video_type=... on the main endpoint?
    // Checking docs logic: 
    // Images: https://pixabay.com/api/?key=...
    // Videos: https://pixabay.com/api/videos/?key=...
    
    const baseUrl = mediaType === 'video' 
      ? `${PIXABAY_API_URL}videos/` 
      : PIXABAY_API_URL;

    const url = new URL(baseUrl);
    url.searchParams.append("key", this.apiKey);
    url.searchParams.append("q", query);
    url.searchParams.append("per_page", Math.min(Math.max(3, maxResults), 200).toString());
    url.searchParams.append("page", page.toString());
    url.searchParams.append("safesearch", safeSearch.toString());
    url.searchParams.append("orientation", orientation);

    if (mediaType === 'image') {
      url.searchParams.append("image_type", imageType);
    } else {
      url.searchParams.append("video_type", "all");
    }

    try {
      const response = await fetch(url.toString());
      
      if (!response.ok) {
        if (response.status === 429) {
          throw new Error("Pixabay API rate limit exceeded. Please try again later.");
        }
        throw new Error(`Pixabay API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error("[PixabayApi] Search failed:", error);
      throw error;
    }
  }
}
