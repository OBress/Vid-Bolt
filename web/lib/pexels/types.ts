/**
 * Pexels API Types
 * @see https://www.pexels.com/api/documentation/
 */

// Photo response from Pexels API
export interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string; // Pexels page URL
  photographer: string;
  photographer_url: string;
  photographer_id: number;
  avg_color: string; // Hex color
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
    small: string;
    portrait: string;
    landscape: string;
    tiny: string;
  };
  liked: boolean;
  alt: string;
}

// Video file variant
export interface PexelsVideoFile {
  id: number;
  quality: 'hd' | 'sd' | 'uhd';
  file_type: string;
  width: number;
  height: number;
  fps: number;
  link: string;
}

// Video picture (thumbnail)
export interface PexelsVideoPicture {
  id: number;
  nr: number;
  picture: string;
}

// Video response from Pexels API
export interface PexelsVideo {
  id: number;
  width: number;
  height: number;
  duration: number; // seconds
  url: string; // Pexels page URL
  image: string; // Thumbnail image
  user: {
    id: number;
    name: string;
    url: string;
  };
  video_files: PexelsVideoFile[];
  video_pictures: PexelsVideoPicture[];
}

// Search parameters
export interface PexelsSearchParams {
  query: string;
  mediaType: 'photo' | 'video';
  maxResults?: number; // per_page, max 80
  page?: number;
  orientation?: 'landscape' | 'portrait' | 'square';
  size?: 'large' | 'medium' | 'small';
  color?: string; // Hex color without #
  locale?: string;
}

// API response wrappers
export interface PexelsPhotosResponse {
  total_results: number;
  page: number;
  per_page: number;
  photos: PexelsPhoto[];
  next_page?: string;
}

export interface PexelsVideosResponse {
  total_results: number;
  page: number;
  per_page: number;
  videos: PexelsVideo[];
  next_page?: string;
}
