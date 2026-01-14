/**
 * Media Generation Types
 * ============================================================================
 * Type definitions for the media generation workflow including progress
 * tracking, shot status, and GPU API integration types.
 */

import type { ShotEvent } from './video';

// ============================================================================
// MEDIA GENERATION PROGRESS TRACKING
// ============================================================================

export type MediaGenerationPhase = 
  | 'pending'
  | 'av_script'
  | 'images'
  | 'image_edits'
  | 'videos'
  | 'completed'
  | 'failed';

export type ShotGenerationStatus = 'pending' | 'generating' | 'completed' | 'failed' | 'skipped';

/**
 * Progress tracking structure stored in video_projects.metadata.media_generation
 */
export interface MediaGenerationProgress {
  /** Current phase of media generation */
  status: MediaGenerationPhase;
  /** When media generation started */
  started_at: string;
  /** When media generation completed (success or failure) */
  completed_at?: string;
  /** Error message if status is 'failed' */
  error?: string;
  
  /** Whether AV script generation is complete */
  av_script_completed: boolean;
  
  /** Total number of shots to process */
  total_shots: number;
  /** Index of currently processing shot (0-based) */
  current_shot_index: number;
  /** What phase the current shot is in */
  current_phase: 'image' | 'edit' | 'video' | 'idle';
  
  /** Number of base images successfully generated */
  images_completed: number;
  /** Number of base images that failed */
  images_failed: number;
  
  /** Number of image edits successfully applied */
  edits_completed: number;
  /** Number of image edits that failed */
  edits_failed: number;
  /** Number of edits skipped (no edit needed) */
  edits_skipped: number;
  
  /** Number of videos successfully generated */
  videos_completed: number;
  /** Number of videos that failed */
  videos_failed: number;
}

// ============================================================================
// ENHANCED SHOT WITH GENERATION STATUS
// ============================================================================

/**
 * Extended shot event with media generation tracking
 */
export interface EnhancedShot extends ShotEvent {
  /** Media type: image-only or video */
  media_type?: 'image' | 'video';
  
  // === Base Image (Z-Image Turbo) ===
  /** URL of generated base image */
  baseImageUrl?: string;
  /** GPU API job ID for base image generation */
  baseImageJobId?: string;
  /** Status of base image generation */
  baseImageStatus?: ShotGenerationStatus;
  /** Error message if base image generation failed */
  baseImageError?: string;
  
  // === Edited Image (Qwen Image Edit) ===
  /** URL of edited image */
  editedImageUrl?: string;
  /** GPU API job ID for image editing */
  editedImageJobId?: string;
  /** Status of image editing */
  editedImageStatus?: ShotGenerationStatus;
  /** Error message if image editing failed */
  editedImageError?: string;
  
  // === Video (LTX-2) ===
  /** URL of generated video */
  videoUrl?: string;
  /** GPU API job ID for video generation */
  videoJobId?: string;
  /** Status of video generation */
  videoStatus?: ShotGenerationStatus;
  /** Error message if video generation failed */
  videoError?: string;
  
  // === Final Asset (used by editor) ===
  /** The final image to use (edited > base > none) */
  startImageUrl?: string;
  /** Overall status of this shot's generation */
  generationStatus?: ShotGenerationStatus;
}

// ============================================================================
// VIDEO METADATA WITH MEDIA GENERATION
// ============================================================================

/**
 * Structure of video_projects.metadata with media generation
 */
export interface VideoProjectMetadata {
  /** Word timestamps from TTS */
  word_timestamps?: Array<{
    word: string;
    start_seconds: number;
    end_seconds: number;
  }>;
  /** Total audio duration */
  total_duration_seconds?: number;
  /** Audio chunks with URLs */
  audio_chunks?: Array<{
    chunkIndex: number;
    url: string;
    durationSeconds: number;
    text?: string;
  }>;
  /** Whether AV script generation is complete */
  av_script_completed?: boolean;
  /** Shot list with generation status */
  shot_list?: EnhancedShot[];
  /** Content analysis from AV script */
  content_analysis?: {
    lists_count: number;
    comparisons_count: number;
    transitions_count: number;
    emotional_beats_count: number;
  };
  /** Media generation progress */
  media_generation?: MediaGenerationProgress;
  /** Expanded idea/prompt */
  expanded_idea?: string;
  /** Script configuration */
  scriptConfig?: Record<string, unknown>;
  /** Universal script output */
  universalScriptOutput?: Record<string, unknown>;
  /** Visual settings (aspect ratio, etc) */
  visuals?: {
    aspectRatio?: '16:9' | '9:16';
  };
}

// ============================================================================
// INNGEST EVENT TYPES
// ============================================================================

/**
 * Input for media-generation/start event
 */
export interface MediaGenerationStartInput {
  videoId: string;
  userId: string;
  /** If true, skip AV script generation and use existing shot_list */
  skipAvScript?: boolean;
}

/**
 * Input for processing a single shot
 */
export interface ProcessShotInput {
  videoId: string;
  userId: string;
  segmentIndex: number;
  visualPrompt: string;
  aspectRatio: '16:9' | '9:16';
  durationSeconds: number;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate overall progress percentage for media generation
 */
export function calculateMediaGenerationProgress(
  progress: MediaGenerationProgress
): number {
  if (progress.status === 'pending') return 0;
  if (progress.status === 'completed') return 100;
  if (progress.status === 'failed') return 0;
  
  const totalShots = progress.total_shots || 1;
  
  // Weight each phase: AV Script 10%, Images 30%, Edits 30%, Videos 30%
  let percent = 0;
  
  // AV Script (10%)
  if (progress.av_script_completed) {
    percent += 10;
  } else if (progress.status === 'av_script') {
    percent += 5; // In progress
  }
  
  // Images (30%)
  const imageProgress = (progress.images_completed + progress.images_failed) / totalShots;
  percent += imageProgress * 30;
  
  // Edits (30%)
  const editProgress = (progress.edits_completed + progress.edits_failed + progress.edits_skipped) / totalShots;
  percent += editProgress * 30;
  
  // Videos (30%)
  const videoProgress = (progress.videos_completed + progress.videos_failed) / totalShots;
  percent += videoProgress * 30;
  
  return Math.round(Math.min(99, percent));
}

/**
 * Get human-readable status message for current progress
 */
export function getMediaGenerationStatusMessage(
  progress: MediaGenerationProgress
): string {
  switch (progress.status) {
    case 'pending':
      return 'Waiting to start...';
    case 'av_script':
      return 'Analyzing script and creating shot list...';
    case 'images':
      return `Generating images (${progress.images_completed}/${progress.total_shots})...`;
    case 'image_edits':
      return `Enhancing images (${progress.edits_completed}/${progress.total_shots})...`;
    case 'videos':
      return `Creating videos (${progress.videos_completed}/${progress.total_shots})...`;
    case 'completed':
      return 'Media generation complete!';
    case 'failed':
      return `Failed: ${progress.error || 'Unknown error'}`;
    default:
      return 'Processing...';
  }
}

/**
 * Create initial progress object
 */
export function createInitialMediaProgress(): MediaGenerationProgress {
  return {
    status: 'pending',
    started_at: new Date().toISOString(),
    av_script_completed: false,
    total_shots: 0,
    current_shot_index: 0,
    current_phase: 'idle',
    images_completed: 0,
    images_failed: 0,
    edits_completed: 0,
    edits_failed: 0,
    edits_skipped: 0,
    videos_completed: 0,
    videos_failed: 0,
  };
}
