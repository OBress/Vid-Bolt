/**
 * Video Project Types
 * ============================================================================
 * Type definitions for individual video projects tracked through the
 * production pipeline (idea → script → audio → video → export → completed)
 */

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

export const VIDEO_STATUSES = ['draft', 'processing', 'completed', 'failed', 'cancelled'] as const;
export type VideoStatus = typeof VIDEO_STATUSES[number];

// 8-Step Workflow Stages
export const VIDEO_STAGES = [
  'outline',       // Step 1
  'stock',         // Step 2
  'script',        // Step 3
  'audio',         // Step 4
  'shot_planning', // Step 5
  'shot_creation', // Step 6
  'video',         // Step 7 (Editor)
  'export',        // Step 8
  'completed'
] as const;
export type VideoStage = typeof VIDEO_STAGES[number] | 'idea' | 'media'; // Keep legacy for types

// ============================================================================
// SHARED CONTENT TYPES
// ============================================================================

export interface AudioChunk {
  chapterNumber: number;
  url: string;
  duration_seconds?: number;
  text?: string;
  wordTimestamps?: import("@/types/task").WordTimestamp[];
  lastUpdated?: number; // Timestamp for cache busting
}

export interface ShotEvent {
  segment_index: number;
  start_seconds: number;
  end_seconds: number;
  duration_seconds: number;
  content_type:
    | "list-item"
    | "comparison"
    | "concept"
    | "transition"
    | "emotional-beat";
  text: string;
  visual_prompt?: string;
}

/**
 * Keyframe data for video shot generation
 * Used to store start/end frame configuration for video generation
 */
export interface KeyframeData {
  /** Generated keyframe image URL */
  image_url?: string;
  /** Prompt for keyframe image generation */
  prompt: string;
  /** Current generation status */
  generation_status: 'pending' | 'generating' | 'completed' | 'failed';
  /** Generation parameters for the keyframe */
  generation_params?: {
    seed?: number;
    lora_name?: string;
    lora_weight?: number;
    aspect_ratio?: '16:9' | '9:16';
  };
  /** Error message if generation failed */
  error_message?: string;
  /** Timestamps */
  created_at?: string;
  updated_at?: string;
}

/**
 * Generated media item for a shot (Step 6: Scene Review)
 * Tracks the generation status and result for each shot's visual media
 */
export interface GeneratedMedia {
  /** Links to ShotPart1.segment_index */
  shot_index: number;
  /** Type of media to generate */
  media_type: 'image' | 'video' | 'motiongraphic';
  /** Current generation status */
  generation_status: 'pending' | 'generating' | 'completed' | 'failed';
  /** R2 URL for the generated media */
  media_url?: string;
  /** Thumbnail URL for video/motion content */
  thumbnail_url?: string;
  /** The visual prompt used for generation (for video: describes motion/animation) */
  visual_prompt: string;
  /** Parameters used for generation */
  generation_params?: {
    model?: string;
    style?: string;
    seed?: number;
    lora_name?: string;
    lora_weight?: number;
  };
  /** Keyframes for video generation (start required, end optional) */
  keyframes?: {
    start: KeyframeData;
    end?: KeyframeData;
  };
  /** Error message if generation failed */
  error_message?: string;
  /** Timestamps */
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// MAIN VIDEO PROJECT TYPE
// ============================================================================

/**
 * Video Project - Represents an individual video tracked through production
 */
export interface VideoProject {
  /** Unique video project identifier */
  id: string;
  /** Owner user ID */
  user_id: string;
  /** Optional parent media project */
  project_id?: string | null;
  
  // Basic info
  /** Video title/name */
  name: string;
  /** Optional video description */
  description?: string;
  
  // Status tracking
  /** Overall status: draft, processing, completed, failed, cancelled */
  status: VideoStatus;
  /** Current pipeline stage */
  current_stage: VideoStage;
  /** Current step description for UI */
  current_step?: string | null;
  /** Overall progress (0-100) */
  progress_percent: number;
  
  // Task references (links to tasks table for each pipeline stage)
  /** Task ID for script generation */
  script_task_id?: string | null;
  /** Task ID for audio generation */
  audio_task_id?: string | null;
  /** Task ID for video generation */
  video_task_id?: string | null;
  /** Task ID for export */
  export_task_id?: string | null;
  
  // Content tracking
  /** Original video idea/prompt */
  idea?: string;
  /** Generated or approved script content */
  script_content?: string;
  /** Final audio file URL */
  audio_url?: string;
  /** Final video file URL */
  video_url?: string;
  
  // Flexible metadata storage
  /** Additional video-specific data (JSONB) */
  metadata?: Record<string, unknown>;
  
  // Timestamps
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
}

// ============================================================================
// INPUT TYPES FOR API OPERATIONS
// ============================================================================

/**
 * Input for creating a new video project
 */
export interface CreateVideoInput {
  /** Video title/name (required) */
  name: string;
  /** Original video idea/prompt (optional initially) */
  idea?: string;
  /** Optional parent media project ID */
  project_id?: string;
  /** Optional video description */
  description?: string;
  /** Optional initial metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Input for updating an existing video project
 */
export interface UpdateVideoInput {
  /** Updated video name */
  name?: string;
  /** Updated description */
  description?: string;
  /** Updated status */
  status?: VideoStatus;
  /** Updated current stage */
  current_stage?: VideoStage;
  /** Updated current step */
  current_step?: string;
  /** Updated progress */
  progress_percent?: number;
  /** Updated script content */
  script_content?: string;
  /** Updated audio URL */
  audio_url?: string;
  /** Updated video URL */
  video_url?: string;
  /** Updated or merged metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Input for linking a task to a video project
 */
export interface LinkTaskInput {
  task_id: string;
  task_type: 'script' | 'audio' | 'video' | 'export';
}

/**
 * Input for updating video progress
 */
export interface UpdateProgressInput {
  current_stage: VideoStage;
  current_step: string;
  progress_percent: number;
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

/**
 * Response from creating a video
 */
export interface CreateVideoResponse {
  success: boolean;
  video: VideoProject;
}

/**
 * Response from listing videos
 */
export interface ListVideosResponse {
  videos: VideoProject[];
  total?: number;
  hasMore?: boolean;
}

/**
 * Response from getting a single video
 */
export interface GetVideoResponse {
  video: VideoProject;
}

/**
 * Response from updating a video
 */
export interface UpdateVideoResponse {
  success: boolean;
  video: VideoProject;
}

/**
 * Response from deleting a video
 */
export interface DeleteVideoResponse {
  success: boolean;
  id: string;
}

/**
 * Response from resume endpoint
 */
export interface ResumeVideoResponse {
  success: boolean;
  video: VideoProject;
  nextAction: string;
  taskId?: string;
}

/**
 * Incomplete video info (for resume list)
 */
export interface IncompleteVideo {
  id: string;
  name: string;
  status: VideoStatus;
  current_stage: VideoStage;
  current_step?: string | null;
  progress_percent: number;
  updated_at: string;
}

/**
 * Response from getting incomplete videos
 */
export interface IncompleteVideosResponse {
  videos: IncompleteVideo[];
}

// ============================================================================
// QUERY PARAMETERS
// ============================================================================

/**
 * Query parameters for listing videos
 */
export interface ListVideosParams {
  /** Filter by user ID */
  userId?: string;
  /** Filter by media project ID */
  projectId?: string;
  /** Filter by status */
  status?: VideoStatus;
  /** Filter by stage */
  stage?: VideoStage;
  /** Maximum number of results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Check if a status is valid
 */
export function isValidVideoStatus(status: string): status is VideoStatus {
  return VIDEO_STATUSES.includes(status as VideoStatus);
}

/**
 * Check if a stage is valid
 */
export function isValidVideoStage(stage: string): stage is VideoStage {
  return VIDEO_STAGES.includes(stage as any);
}

/**
 * Check if a video can be resumed
 */
export function canResumeVideo(video: VideoProject): boolean {
  return (
    video.status !== 'completed' &&
    video.status !== 'cancelled' &&
    video.current_stage !== 'completed'
  );
}

/**
 * Check if a video is in progress
 */
export function isVideoInProgress(video: VideoProject): boolean {
  return video.status === 'processing' || video.status === 'draft';
}

/**
 * Check if a video is complete
 */
export function isVideoComplete(video: VideoProject): boolean {
  return video.status === 'completed' && video.current_stage === 'completed';
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Partial video project (for updates)
 */
export type PartialVideoProject = Partial<VideoProject>;

/**
 * Video project creation data (subset required for DB insert)
 */
export type VideoProjectInsert = Omit<
  VideoProject,
  'id' | 'created_at' | 'updated_at' | 'completed_at'
>;

/**
 * Stage progression map
 */
export const STAGE_PROGRESSION: Record<VideoStage, VideoStage | null> = {
  idea: 'stock', // Legacy map to Step 2
  outline: 'stock',
  stock: 'script',
  script: 'audio',
  audio: 'shot_planning',
  media: 'shot_creation', // Legacy map
  shot_planning: 'shot_creation',
  shot_creation: 'video',
  video: 'export',
  export: 'completed',
  completed: null,
};

/**
 * Get the next stage in the pipeline
 */
export function getNextStage(currentStage: VideoStage): VideoStage | null {
  return STAGE_PROGRESSION[currentStage];
}

/**
 * Calculate progress based on current stage
 */
export function calculateStageProgress(stage: VideoStage): number {
  const stageProgress: Record<VideoStage, number> = {
    idea: 0,
    outline: 0,        // Step 1
    stock: 15,         // Step 2
    script: 30,        // Step 3
    audio: 45,         // Step 4
    media: 60,         // Legacy
    shot_planning: 60, // Step 5
    shot_creation: 75, // Step 6
    video: 85,         // Step 7
    export: 95,        // Step 8
    completed: 100,
  };
  return stageProgress[stage] || 0;
}
