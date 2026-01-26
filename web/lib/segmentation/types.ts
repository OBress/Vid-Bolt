/**
 * Video Segmentation Types
 * ==========================================================================
 * Types for breaking videos into classified clips for stock media library.
 */

// ==========================================================================
// Clip Types
// ==========================================================================

/** Type of clip based on audio content */
export type ClipAudioType = 'visual+audio' | 'visual-only';

/** Scene type classification */
export type SceneType =
  | 'interview'      // Person speaking to camera
  | 'b-roll'         // Visual footage without primary speaker
  | 'action'         // Dynamic action or movement
  | 'establishing'   // Wide shot setting location/context
  | 'transition'     // Brief transitional content
  | 'montage'        // Quick sequence of shots
  | 'graphic'        // Text, logos, or overlays
  | 'other';

// ==========================================================================
// Word-Level Timestamps
// ==========================================================================

/** Single word with timing from Groq Whisper */
export interface TranscriptWord {
  word: string;
  start: number;  // seconds
  end: number;    // seconds
}

/** Full transcription result from Groq Whisper */
export interface TranscriptionResult {
  text: string;
  words: TranscriptWord[];
  language: string;
  duration: number;
}

// ==========================================================================
// Scene Detection
// ==========================================================================

/** Scene detected by Gemini */
export interface DetectedScene {
  startTime: number;
  endTime: number;
  sceneType: SceneType;
  description: string;
  hasAudio: boolean;      // True if meaningful speech/audio
  subjects: string[];
  mood: string;
}

/** Gemini scene analysis response */
export interface SceneAnalysisResult {
  scenes: DetectedScene[];
  totalDuration: number;
  processingTimeMs: number;
}

// ==========================================================================
// Clips
// ==========================================================================

/** A single extracted clip */
export interface VideoClip {
  id: string;
  parentVideoId: string;
  
  // Timing
  startTime: number;
  endTime: number;
  duration: number;
  
  // Type classification
  audioType: ClipAudioType;
  sceneType: SceneType;
  
  // Content
  description: string;
  transcription: string | null;
  subjects: string[];
  mood: string;
  
  // Quality
  qualityRating: number;
  
  // Storage
  r2Key: string;
  thumbnailR2Key?: string;
  
  // Public URLs for direct access
  videoUrl?: string;
  thumbnailUrl?: string;
  
  // Searchability
  suggestedUses: string[];  // ["intro", "transition", "explainer", etc.]
}

// ==========================================================================
// Job Types
// ==========================================================================

/** Input to the segmentation job */
export interface SegmentVideoJobData {
  userId: string;
  videoId: string;
  videoR2Key?: string;
  sourceUrl: string;
  targetClipDuration?: {
    min: number;  // e.g., 5 seconds
    max: number;  // e.g., 10 seconds
  };
  /** Optional filter prompt to only extract clips matching this description */
  filterPrompt?: string;
  /** Video duration in seconds (for chunked analysis of long videos) */
  videoDuration?: number;
  /** Video title for context in scene analysis (helps identify characters/topics) */
  videoTitle?: string;
  /** Video description for additional context */
  videoDescription?: string;
  /** Local path to downloaded video file (enables physical chunk extraction) */
  videoPath?: string;
  /** If set, this job is part of video generation and clips should be stored per-project */
  parentProjectVideoId?: string;
}


/** Result from the segmentation job */
export interface SegmentVideoJobResult {
  videoId: string;
  clips: VideoClip[];
  hadAudioTranscription: boolean;
  totalProcessingTimeMs: number;
}

/** Progress update during segmentation */
export interface SegmentationProgress {
  stage: 'downloading' | 'transcribing' | 'analyzing' | 'extracting' | 'classifying' | 'storing';
  progress: number;  // 0-100
  message: string;
}
