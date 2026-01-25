export interface PixabayImageHit {
  id: number;
  pageURL: string;
  type: 'photo' | 'illustration' | 'vector';
  tags: string;
  previewURL: string;
  previewWidth: number;
  previewHeight: number;
  webformatURL: string;
  webformatWidth: number;
  webformatHeight: number;
  largeImageURL: string;
  imageWidth: number;
  imageHeight: number;
  imageSize: number;
  views: number;
  downloads: number;
  collections: number;
  likes: number;
  comments: number;
  user_id: number;
  user: string;
  userImageURL: string;
}

export interface PixabayVideoHit {
  id: number;
  pageURL: string;
  type: 'film';
  tags: string;
  duration: number;
  videos: {
    large: { url: string; width: number; height: number; size: number; thumbnail: string };
    medium: { url: string; width: number; height: number; size: number; thumbnail: string };
    small: { url: string; width: number; height: number; size: number; thumbnail: string };
    tiny: { url: string; width: number; height: number; size: number; thumbnail: string };
  };
  views: number;
  downloads: number;
  likes: number;
  comments: number;
  user_id: number;
  user: string;
  userImageURL: string;
}

export interface PixabaySearchParams {
  query: string;
  mediaType: 'image' | 'video';
  maxResults?: number;
  imageType?: 'all' | 'photo' | 'illustration' | 'vector';
  orientation?: 'all' | 'horizontal' | 'vertical';
  minWidth?: number;
  minHeight?: number;
  safeSearch?: boolean;
  page?: number;
}

export interface PixabayApiResponse<T> {
  total: number;
  totalHits: number;
  hits: T[];
}
