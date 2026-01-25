
export interface StockMediaMetadata {
  title: string;
  description: string;
  tags: string[];
  width?: number;
  height?: number;
  duration?: number;
  license?: string;
  author?: string;
  thumbnailUrl?: string;

  // ==========================================================================
  // AI Classification Data (populated by Gemini 3 Flash)
  // ==========================================================================

  /** Media type */
  mediaType?: 'image' | 'video' | 'audio';

  /** Resolution in pixels */
  resolution?: { width: number; height: number };

  /** Aspect ratio (e.g., "16:9", "4:3", "1:1") */
  aspectRatio?: string;

  /** Full transcription of speech (video/audio only, null if no speech) */
  transcription?: string | null;

  /** Quality rating 1-10 from AI classification */
  qualityRating?: number;

  /** Emotional tone/mood */
  mood?: string;

  /** Main subjects visible/audible */
  subjects?: string[];

  /** Visual style (image/video) */
  style?: string;

  /** Dominant colors (image/video) */
  dominantColors?: string[];

  /** Scene types (video) */
  sceneTypes?: string[];

  /** Key actions (video) */
  actions?: string[];

  /** Pacing (video): slow, moderate, fast, dynamic */
  pacing?: string;

  /** Shot types (video): wide, medium, close-up, aerial */
  shotTypes?: string[];

  /** Content type (audio): speech, music, ambient, mixed */
  contentType?: string;

  /** Audio clarity: clear, moderate, noisy */
  clarity?: string;

  /** Whether background noise is present (audio) */
  hasBackgroundNoise?: boolean;
}

export interface StockMediaRecord {
  id: string;
  source: 'wikimedia' | 'youtube' | 'pexels' | 'pixabay' | 'upload' | 'other';
  external_id?: string;
  r2_key: string;
  metadata: StockMediaMetadata;
  similarity?: number;
}
