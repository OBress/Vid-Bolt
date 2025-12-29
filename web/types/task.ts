/**
 * Task Types - Unified Type Definitions
 * ============================================================================
 * Comprehensive types for the consolidated task system supporting multiple
 * workflow types: writing, audio, video, and export.
 * 
 * Architecture:
 * - All tasks share the same base structure
 * - Steps are stored as JSONB array in tasks.steps
 * - Type-specific outputs are stored in tasks.output_data
 * - Type-specific inputs are stored in tasks.input_data
 */

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

export const TASK_TYPES = ['writing', 'audio', 'video', 'export'] as const;
export type TaskType = typeof TASK_TYPES[number];

export const TASK_STATUSES = ['pending', 'running', 'completed', 'failed', 'cancelled'] as const;
export type TaskStatus = typeof TASK_STATUSES[number];

export const STEP_STATUSES = ['pending', 'running', 'completed', 'failed', 'skipped'] as const;
export type TaskStepStatus = typeof STEP_STATUSES[number];

export const TASK_PHASES = [
  // Writing phases
  'preprocessing',
  'writing', 
  'postprocessing',
  // Audio phases
  'audio_generation',
  'audio_processing',
  // Video phases
  'image_generation',
  'video_generation',
  'compositing',
  // Export phases
  'encoding',
  'uploading',
] as const;
export type TaskPhase = typeof TASK_PHASES[number];

// ============================================================================
// STEP TYPES
// ============================================================================

/**
 * Individual step within a task workflow.
 * Stored as array elements in tasks.steps JSONB column.
 */
export interface TaskStep {
  /** Unique identifier for this step */
  id: string;
  /** Human-readable step name (e.g., "Master Outline", "Write Chapter 1") */
  name: string;
  /** Workflow phase this step belongs to */
  phase: TaskPhase;
  /** Order of execution (for sorting) */
  order: number;
  /** Current status of this step */
  status: TaskStepStatus;
  /** When this step started executing */
  started_at?: string;
  /** When this step completed (success or failure) */
  completed_at?: string;
  /** Execution duration in milliseconds */
  duration_ms?: number;
  /** Token count for AI operations */
  token_count?: number;
  /** Error message if step failed */
  error?: string;
}

// ============================================================================
// WRITING WORKFLOW TYPES
// ============================================================================

export interface MasterOutline {
  title: string;
  synopsis: string;
  chapters: ChapterOutline[];
}

export interface ChapterOutline {
  chapterNumber: number;
  title: string;
  summary: string;
  keyEvents: string[];
}

export interface Character {
  name: string;
  description: string;
  role: 'protagonist' | 'antagonist' | 'supporting' | string;
  traits: string[];
}

export interface Setting {
  name: string;
  description: string;
  significance: string;
}

export interface Chapter {
  chapterNumber: number;
  title: string;
  content: string;
}

export interface WordTimestamp {
  word: string;
  start_seconds: number;
  end_seconds: number;
}

export interface WritingTaskInput {
  scriptType: 'top_10' | 'long_form' | 'kitcon';
  idea: string;
  researchEnabled?: boolean;
  numberOfChapters?: number;
}

export interface WritingTaskOutput {
  /** Expanded idea from idea expansion workflow */
  expanded_idea?: string;
  research?: string;
  master_outline?: MasterOutline;
  detailed_outline?: ChapterOutline[];
  characters?: Character[];
  settings?: Setting[];
  chapters?: Chapter[];
  final_script?: string;
}

// ============================================================================
// AUDIO WORKFLOW TYPES
// ============================================================================

export interface AudioChunk {
  chapterNumber: number;
  url: string;
  duration_seconds?: number;
  file_size_bytes?: number;
  word_timestamps?: WordTimestamp[];
  text?: string;
}

export interface AudioTaskInput {
  script: string;
  voice_provider: 'elevenlabs' | 'genai' | 'inworld';
  voice_model: string;
  voice_settings?: {
    stability?: number;
    similarity_boost?: number;
    speaking_speed?: number;
  };
}

export interface AudioTaskOutput {
  /** Individual TTS chunks per chapter/section */
  tts_chunks?: AudioChunk[];
  /** Normalized/processed audio chunks */
  processed_chunks?: AudioChunk[];
  /** Final merged audio file URL */
  final_audio?: string;
  /** Total audio duration in seconds */
  total_duration_seconds?: number;
}

// ============================================================================
// VIDEO WORKFLOW TYPES
// ============================================================================

export interface GeneratedImage {
  sceneNumber: number;
  prompt: string;
  url: string;
  width?: number;
  height?: number;
}

export interface GeneratedClip {
  sceneNumber: number;
  url: string;
  duration_seconds?: number;
}

export interface VideoTaskInput {
  script: string;
  audio_url: string;
  image_model: string;
  video_model: string;
  aspect_ratio?: '16:9' | '9:16' | '1:1';
}

export interface VideoTaskOutput {
  /** Scene descriptions extracted from script */
  scene_descriptions?: Array<{
    sceneNumber: number;
    description: string;
    start_time_seconds: number;
    end_time_seconds: number;
  }>;
  /** Generated images for each scene */
  images?: GeneratedImage[];
  /** Animated/video clips for each scene */
  clips?: GeneratedClip[];
  /** Final composited video URL */
  final_video?: string;
  /** Video metadata */
  metadata?: {
    duration_seconds: number;
    resolution: string;
    file_size_bytes: number;
  };
  /** Shot list from AV script analysis */
  shot_list?: Array<{
    segment_index: number;
    start_seconds: number;
    end_seconds: number;
    duration_seconds: number;
    content_type: 'list-item' | 'comparison' | 'concept' | 'transition' | 'emotional-beat';
    text: string;
    visual_prompt?: string;
  }>;
  /** Content analysis from script */
  content_analysis?: {
    lists_count: number;
    comparisons_count: number;
    transitions_count: number;
    emotional_beats_count: number;
  };
}


// ============================================================================
// EXPORT WORKFLOW TYPES
// ============================================================================

export interface ExportTarget {
  platform: 'youtube' | 'tiktok' | 'instagram' | 'snapchat' | 'local';
  format: 'mp4' | 'webm' | 'mov';
  resolution: '1080p' | '720p' | '4k';
}

export interface ExportTaskInput {
  video_url: string;
  targets: ExportTarget[];
  title?: string;
  description?: string;
  tags?: string[];
}

export interface ExportTaskOutput {
  /** Rendered video files for each target */
  rendered_files?: Record<string, string>;  // target_platform -> url
  /** Upload results */
  uploads?: Array<{
    platform: string;
    status: 'pending' | 'uploading' | 'completed' | 'failed';
    url?: string;
    video_id?: string;
    error?: string;
  }>;
}

// ============================================================================
// UNION TYPES
// ============================================================================

export type TaskInput = 
  | WritingTaskInput 
  | AudioTaskInput 
  | VideoTaskInput 
  | ExportTaskInput
  | Record<string, unknown>;  // Fallback for extensibility

export type TaskOutput = 
  | WritingTaskOutput 
  | AudioTaskOutput 
  | VideoTaskOutput 
  | ExportTaskOutput
  | Record<string, unknown>;  // Fallback for extensibility

// ============================================================================
// MAIN TASK TYPE
// ============================================================================

/**
 * Unified Task type representing any workflow task.
 * This matches the database schema exactly.
 */
export interface Task<
  TInput extends TaskInput = TaskInput,
  TOutput extends TaskOutput = TaskOutput
> {
  /** Unique task identifier */
  id: string;
  /** Owner user ID */
  user_id: string;
  /** Associated media project (optional) */
  project_id?: string | null;
  
  // Core fields
  /** Type of workflow */
  type: TaskType;
  /** Human-readable task name */
  name: string;
  /** Current task status */
  status: TaskStatus;
  /** Current workflow phase */
  current_phase?: TaskPhase | null;
  /** Current step description for UI */
  current_step?: string | null;
  /** Overall progress (0-100) */
  progress_percent: number;
  
  // Step tracking (replaces task_steps table)
  /** Array of workflow steps with their status */
  steps: TaskStep[];
  
  // Type-agnostic I/O
  /** Input parameters for this task */
  input_data: TInput;
  /** Output results from this task */
  output_data: TOutput;
  
  // Error handling
  /** Error message if task failed */
  error_message?: string | null;
  /** Number of retry attempts */
  retry_count: number;
  /** Maximum allowed retries */
  max_retries: number;
  
  // External references
  /** Inngest run ID for debugging */
  inngest_run_id?: string | null;
  
  // Timestamps
  created_at: string;
  updated_at: string;
  started_at?: string | null;
  completed_at?: string | null;
}

// Convenience type aliases for specific task types
export type WritingTask = Task<WritingTaskInput, WritingTaskOutput>;
export type AudioTask = Task<AudioTaskInput, AudioTaskOutput>;
export type VideoTask = Task<VideoTaskInput, VideoTaskOutput>;
export type ExportTask = Task<ExportTaskInput, ExportTaskOutput>;

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isWritingTask(task: Task): task is WritingTask {
  return task.type === 'writing';
}

export function isAudioTask(task: Task): task is AudioTask {
  return task.type === 'audio';
}

export function isVideoTask(task: Task): task is VideoTask {
  return task.type === 'video';
}

export function isExportTask(task: Task): task is ExportTask {
  return task.type === 'export';
}

export function isWritingOutput(output: TaskOutput): output is WritingTaskOutput {
  return 'chapters' in output || 'final_script' in output || 'master_outline' in output;
}

export function isAudioOutput(output: TaskOutput): output is AudioTaskOutput {
  return 'tts_chunks' in output || 'final_audio' in output;
}

export function isVideoOutput(output: TaskOutput): output is VideoTaskOutput {
  return 'images' in output || 'clips' in output || 'final_video' in output;
}

export function isExportOutput(output: TaskOutput): output is ExportTaskOutput {
  return 'rendered_files' in output || 'uploads' in output;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/** Task creation input (subset of Task required for creation) */
export interface CreateTaskInput {
  user_id: string;
  project_id?: string;
  type: TaskType;
  name: string;
  input_data: TaskInput;
}

/** Task update input (partial updates) */
export interface UpdateTaskInput {
  status?: TaskStatus;
  current_phase?: TaskPhase;
  current_step?: string;
  progress_percent?: number;
  error_message?: string;
  started_at?: string;
  completed_at?: string;
}

/** Step statistics for UI display */
export interface TaskStepStats {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  skipped: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate step statistics from a task's steps array.
 */
export function calculateStepStats(steps: TaskStep[]): TaskStepStats {
  return {
    total: steps.length,
    pending: steps.filter(s => s.status === 'pending').length,
    running: steps.filter(s => s.status === 'running').length,
    completed: steps.filter(s => s.status === 'completed').length,
    failed: steps.filter(s => s.status === 'failed').length,
    skipped: steps.filter(s => s.status === 'skipped').length,
  };
}

/**
 * Get the current running step from a task.
 */
export function getCurrentStep(steps: TaskStep[]): TaskStep | undefined {
  return steps.find(s => s.status === 'running');
}

/**
 * Calculate overall progress from steps.
 */
export function calculateProgressFromSteps(steps: TaskStep[]): number {
  if (steps.length === 0) return 0;
  const completed = steps.filter(s => s.status === 'completed' || s.status === 'skipped').length;
  return Math.round((completed / steps.length) * 100);
}
