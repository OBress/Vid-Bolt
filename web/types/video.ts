/**
 * Video Project Types
 * ============================================================================
 * Type definitions for individual video projects tracked through the
 * production pipeline (outline → script → production → video → export → completed)
 */

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

export const VIDEO_STATUSES = ['draft', 'processing', 'completed', 'failed', 'cancelled'] as const;
export type VideoStatus = typeof VIDEO_STATUSES[number];

// 5-Step Workflow Stages
export const VIDEO_STAGES = [
  'outline',       // Step 1
  'script',        // Step 2
  'production',    // Step 3 (Closed-Loop Pipeline)
  'video',         // Step 4 (Editor)
  'export',        // Step 5
  'completed'
] as const;
export type VideoStage = typeof VIDEO_STAGES[number] | 'idea' | 'stock' | 'media' | 'audio' | 'shot_planning' | 'shot_creation'; // Keep legacy for types

// ============================================================================
// ROUTING TAGS (for shot generation routing)
// ============================================================================

/**
 * Routing tags determine which generation tools/services process each shot.
 * The AI outputs these tags, and the system routes to appropriate APIs.
 */
export type RoutingTag =
  // Core GPU generation
  | 'ai_video'                        // → GPU API: LTX-2.3 video generation
  | 'ai_image'                        // → GPU API: Z-Image Turbo images
  // Stock media
  | 'stock_image'                     // → Valyu Search: static photos
  | 'stock_video'                     // → Valyu Search: video footage
  | 'stock_audience'                  // → Valyu Search: audience reactions
  // Audio
  | 'sound_effects'                   // → Audio API: SFX library
  | 'music'                           // → Audio API: music/score
  // Remotion operations
  | 'remotion_overlay'                // → Remotion: text/graphics overlay
  | 'remotion_image_manipulation'     // → Remotion: Ken Burns, layers, montages
  | 'remotion_video_manipulation';    // → Remotion: video annotations

/**
 * Badge styles and labels for routing tags (UI display)
 */
export const ROUTING_TAG_CONFIG: Record<RoutingTag, { style: string; label: string }> = {
  ai_video: { style: 'bg-violet-900/50 text-violet-300', label: 'AI Video' },
  ai_image: { style: 'bg-sky-900/50 text-sky-300', label: 'AI Image' },
  stock_image: { style: 'bg-amber-900/50 text-amber-300', label: 'Stock Photo' },
  stock_video: { style: 'bg-amber-900/50 text-amber-300', label: 'Stock Video' },
  stock_audience: { style: 'bg-amber-900/50 text-amber-300', label: 'Audience' },
  sound_effects: { style: 'bg-emerald-900/50 text-emerald-300', label: 'SFX' },
  music: { style: 'bg-emerald-900/50 text-emerald-300', label: 'Music' },
  remotion_overlay: { style: 'bg-indigo-900/50 text-indigo-300', label: 'Overlay' },
  remotion_image_manipulation: { style: 'bg-purple-900/50 text-purple-300', label: 'Image FX' },
  remotion_video_manipulation: { style: 'bg-fuchsia-900/50 text-fuchsia-300', label: 'Video FX' },
};

// ============================================================================
// MOTION GRAPHICS STRATEGY TYPES
// ============================================================================

export const MOTION_GRAPHICS_MODES = ['template', 'freeform'] as const;
export type MotionGraphicsMode = typeof MOTION_GRAPHICS_MODES[number];

export const MOTION_GRAPHICS_TEMPLATE_TYPES = [
  'map_focus',
  'timeline',
  'evidence_board',
  'document_callout',
  'quote_card',
  'lower_third',
  'photo_montage',
  'comparison_board',
  'route_trace',
  'process_diagram',
] as const;
export type MotionGraphicsTemplateType = typeof MOTION_GRAPHICS_TEMPLATE_TYPES[number];

export const PERSISTENT_GRAPHIC_TYPES = [
  'crime_board',
  'relationship_board',
  'investigation_wall',
  'timeline_board',
  'route_map',
  'evidence_dossier',
  'entity_comparison',
  'state_of_story',
] as const;
export type PersistentGraphicType = typeof PERSISTENT_GRAPHIC_TYPES[number];

export const MG_ASSET_KINDS = [
  'image',
  'video',
  'document',
  'logo',
  'portrait',
  'screenshot',
  'diagram',
  'stock',
  'reference',
  'placeholder',
  'video_context',
] as const;
export type MGAssetKind = typeof MG_ASSET_KINDS[number];

export interface MotionGraphicsAssetBundleItem {
  /** Stable asset identifier within the shot/template */
  id: string;
  /** R2 or placeholder URL */
  url: string;
  /** Semantic asset type for template routing */
  asset_kind: MGAssetKind;
  /** Human-readable label used in prompts/debugging */
  label?: string;
  /** What this asset should represent in the composition */
  usage?: string;
  /** Descriptive context for the model/template system */
  description?: string;
  /** Origin of this asset */
  source?: 'generated' | 'stock' | 'reference' | 'placeholder';
  /** Optional source shot when borrowed from nearby shots */
  source_shot_index?: number;
}

export interface GraphicStatePatch {
  /** Override title/headline for the persistent graphic */
  headline?: string;
  /** Short notes or bullet updates to reveal */
  notes?: string[];
  /** Labels/items to add to the current persistent graphic */
  add_labels?: string[];
  /** Labels/items that should be removed or resolved */
  remove_labels?: string[];
  /** Which label/item should receive emphasis in this shot */
  focus_label?: string;
  /** Narrative update status for the persistent graphic */
  status?: 'introduced' | 'updated' | 'revealed' | 'resolved';
}

export interface PersistentMotionGraphicState {
  id: string;
  type: PersistentGraphicType;
  template_type: MotionGraphicsTemplateType;
  title?: string;
  subtitle?: string;
  focus_label?: string;
  notes?: string[];
  items?: Array<{
    label: string;
    detail?: string;
    asset_index?: number;
    emphasis?: 'normal' | 'highlighted' | 'dim';
  }>;
  updated_at_shot?: number;
}

/**
 * Sound effect with millisecond-precise timing
 */
export interface SoundEffect {
  /** Short label for UI display (1-2 words, e.g., "chain snap") */
  type: string;
  /** Full description for stock audio search/generation (e.g., "Heavy metal chain breaking under tension") */
  description: string;
  /** Absolute trigger time in seconds (e.g., 12.345) */
  trigger_at_seconds: number;
  /** Word this effect is anchored to (for debugging/display) */
  anchor_word?: string;
  /** Optional reasoning for this effect */
  reasoning?: string;
  /** Resolved audio file URL (populated by SFX resolver via Freesound search) */
  audio_url?: string;
  /** Freesound sound ID for attribution tracking */
  freesound_id?: number;
}

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
 * Individual media item within a multi-media shot.
 * Used when image_count > 1 (multi-image motiongraphics).
 */
export interface MediaItem {
  /** Index within the shot (0-based) */
  item_index: number;
  /** Type of this specific item */
  media_type: 'image' | 'video';
  /** R2 public URL */
  media_url?: string;
  /** Visual prompt for this specific item */
  visual_prompt?: string;
  /** Source of this media item */
  source: 'ai_generated' | 'stock';
  /** Stock media ID if source is 'stock' */
  stock_media_id?: string;
  /** Generation status */
  generation_status: 'pending' | 'generating' | 'completed' | 'failed';
  /** Error message if generation failed */
  error_message?: string;
}

/**
 * Generated media item for a shot (Step 6: Scene Review)
 * Tracks the generation status and result for each shot's visual media
 */
export interface GeneratedMedia {
  /** Links to ShotPart1.segment_index */
  shot_index: number;
  /** Type of media to generate (legacy - kept for backwards compat) */
  media_type: 'image' | 'video' | 'motiongraphic';
  /** Current generation status */
  generation_status: 'pending' | 'generating' | 'completed' | 'failed';
  /** R2 URL for the generated media (primary/first item) */
  media_url?: string;
  /** Thumbnail URL for video/motion content */
  thumbnail_url?: string;
  /** Whether the generated video asset has an embedded audio stream */
  has_audio?: boolean;
  /** Normalized linked audio URL extracted from the generated video */
  normalized_audio_url?: string;
  /** The visual prompt used for generation (for video: describes motion/animation) */
  visual_prompt: string;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // Multi-image support
  // ═══════════════════════════════════════════════════════════════════════════
  
  /** Individual media items for multi-image shots (only populated when image_count > 1) */
  media_items?: MediaItem[];
  /** Planned image count from AI (for motiongraphics with multiple images) */
  image_count?: number;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // Descriptive visual intent (routing tags + natural language)
  // ═══════════════════════════════════════════════════════════════════════════
  
  /** AI's natural language description of the visual approach */
  visual_description?: string;
  /** Routing tags for generation tool selection */
  visual_elements?: RoutingTag[];
  
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
  /** Generated Remotion component code (for motiongraphic media) */
  remotion_code?: string;
  /** Lucide-react icon names used in the generated Remotion code */
  used_icons?: string[];
  /** MG generation lane used for this shot */
  mg_mode?: MotionGraphicsMode;
  /** Deterministic template type when mg_mode=template */
  template_type?: MotionGraphicsTemplateType;
  /** Asset bundle consumed by the MG renderer */
  mg_asset_bundle?: MotionGraphicsAssetBundleItem[];
  /** Stable ID for reusable graphics across shots */
  persistent_graphic_id?: string;
  /** Reusable graphic family/type */
  persistent_graphic_type?: PersistentGraphicType;
  /** Patch applied to the persistent graphic for this shot */
  graphic_state_patch?: GraphicStatePatch;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // Clip trim data (from VLM-guided clip trimmer)
  // ═══════════════════════════════════════════════════════════════════════════
  
  /** Recommended start time in seconds (trim in-point) */
  trimStart?: number;
  /** Recommended end time in seconds (trim out-point) */
  trimEnd?: number;
  
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
  idea: 'script', // Legacy map to Step 2
  outline: 'script',
  stock: 'script', // Legacy (removed step) — maps to script
  script: 'production',
  production: 'video',
  audio: 'production', // Legacy map (removed step)
  media: 'production', // Legacy map (removed step)
  shot_planning: 'production', // Legacy map (removed step)
  shot_creation: 'production', // Legacy map (removed step)
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
    stock: 20,         // Legacy (removed step)
    script: 20,        // Step 2
    production: 50,    // Step 3 (Closed-Loop)
    audio: 50,         // Legacy (removed step) — maps to production
    media: 50,         // Legacy (removed step)
    shot_planning: 50, // Legacy (removed step)
    shot_creation: 50, // Legacy (removed step)
    video: 70,         // Step 4 (Editor)
    export: 90,        // Step 5
    completed: 100,
  };
  return stageProgress[stage] || 0;
}
