/**
 * Media Classification Types
 * ==========================================================================
 * Type definitions for AI-powered media classification using Gemini 3 Flash.
 */

// ==========================================================================
// Image Classification
// ==========================================================================

export interface ImageClassification {
  /** Detailed visual description for vector search */
  description: string;
  /** Main subjects (people, objects, scenes) */
  subjects: string[];
  /** Emotional tone (energetic, calm, dramatic, etc.) */
  mood: string;
  /** Visual style (cinematic, documentary, artistic, etc.) */
  style: string;
  /** Primary colors present */
  dominantColors: string[];
  /** Quality rating 1-10 (Gemini assessment) */
  qualityRating: number;
  /** Technical observations (lighting, composition, focus) */
  technicalNotes?: string;
}

// ==========================================================================
// Video Classification
// ==========================================================================

export interface VideoClassification {
  /** Overall video description */
  description: string;
  /** Detailed summary of what the video covers, key topics, and visual content */
  contentSummary: string;
  /** Types of scenes (interview, b-roll, establishing, action, etc.) */
  sceneTypes: string[];
  /** Main subjects/characters */
  subjects: string[];
  /** Key actions happening */
  actions: string[];
  /** Emotional tone */
  mood: string;
  /** Pacing: slow, moderate, fast, dynamic */
  pacing: string;
  /** Shot types: wide, medium, close-up, aerial */
  shotTypes: string[];
  /** Quality rating 1-10 */
  qualityRating: number;
}

// ==========================================================================
// Audio Classification
// ==========================================================================

export interface AudioClassification {
  /** Audio content description */
  description: string;
  /** Full speech transcription, null if no speech */
  transcription: string | null;
  /** Content type: speech, music, ambient, mixed */
  contentType: 'speech' | 'music' | 'ambient' | 'mixed';
  /** Emotional quality */
  mood: string;
  /** Clarity: clear, moderate, noisy */
  clarity: 'clear' | 'moderate' | 'noisy';
  /** Quality rating 1-10 */
  qualityRating: number;
  /** Whether background noise is present */
  hasBackgroundNoise: boolean;
  /** Estimated loudness: quiet, moderate, loud */
  estimatedLoudness?: 'quiet' | 'moderate' | 'loud';
}

// ==========================================================================
// Unified Classification Result
// ==========================================================================

export type MediaType = 'image' | 'video' | 'audio';

export interface ClassificationResult {
  mediaType: MediaType;
  classification: ImageClassification | VideoClassification | AudioClassification;
  /** Processing time in milliseconds */
  processingTimeMs: number;
  /** Model used for classification */
  model: string;
  /** Token usage */
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// ==========================================================================
// Classification Request
// ==========================================================================

export interface ClassifyRequest {
  /** URL to the media (YouTube, R2, or other public URL) */
  mediaUrl: string;
  /** Type of media */
  mediaType: MediaType;
  /** Optional: Technical metadata if already known */
  technicalMetadata?: {
    width?: number;
    height?: number;
    duration?: number;
    aspectRatio?: string;
  };
}

export interface BatchClassifyRequest {
  items: ClassifyRequest[];
}

export interface BatchClassifyResult {
  results: Array<{
    request: ClassifyRequest;
    result?: ClassificationResult;
    error?: string;
  }>;
  totalProcessingTimeMs: number;
}
