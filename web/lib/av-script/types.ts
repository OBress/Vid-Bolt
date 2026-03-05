/**
 * AV Script Types
 * ============================================================================
 * Type definitions for the shot list generation system that analyzes 
 * word-aligned TTS audio to generate intelligent visual shot lists.
 */

import { WordTimestamp } from "@/types/task";

// ============================================================================
// CONTENT TYPES
// ============================================================================

/**
 * Content types determine segmentation strategy and visual style.
 * Each type has different target duration ranges and visual approaches.
 * Ranges are intentionally tight to enable modern, fast-paced editing
 * while still allowing the AI editor to choose appropriate timing per-clip.
 */
export type ContentType = 
  | 'list-item'        // 2-5 seconds, punchy focus on specific item
  | 'comparison'       // 2.5-5 seconds, clear visual contrast
  | 'concept'          // 3-6 seconds, rich detailed scene
  | 'transition'       // 2-4 seconds, neutral bridging imagery
  | 'emotional-beat';  // 3-6 seconds, evocative atmospheric imagery

/**
 * Duration ranges for each content type (in seconds).
 * These enable modern YouTube-grade pacing — shorter targets that allow
 * the edit assembly AI to create dynamic, engaging timelines.
 */
export const CONTENT_DURATION_RANGES: Record<ContentType, { min: number; target: number; max: number }> = {
  'list-item': { min: 2, target: 3, max: 5 },
  'comparison': { min: 2.5, target: 3.5, max: 5 },
  'concept': { min: 3, target: 4.5, max: 6 },
  'transition': { min: 2, target: 3, max: 4 },
  'emotional-beat': { min: 3, target: 4.5, max: 6 },
};

/**
 * Definitions for each content type to help users understand their purpose.
 */
export const CONTENT_TYPE_DEFINITIONS: Record<ContentType, string> = {
  'concept': "A rich, detailed scene or illustration representing a core idea or theme.",
  'list-item': "Focused imagery highlighting a specific point, item, or step in a sequence.",
  'comparison': "A split-screen or contrasted visual showing difference between two elements.",
  'transition': "Neutral or abstract imagery used to bridge two distinct topics smoothly.",
  'emotional-beat': "Atmospheric, evocative imagery designed to emphasize a feeling or moment.",
};

/**
 * Absolute segment boundaries
 */
export const SEGMENT_BOUNDS = {
  MIN_DURATION: 1.5,  // Never shorter than 1.5 seconds (prevents glitchy micro-clips)
  MAX_DURATION: 10,   // Never longer than 10 seconds
};

// ============================================================================
// SHOT EVENT TYPES
// ============================================================================

/**
 * A single segment in the visual shot list.
 * Represents one image/visual that appears during a time range.
 */
export interface ShotEvent {
  /** Sequential segment number (1-indexed) */
  segment_index: number;
  
  /** Start time in seconds (from first word's start time) */
  start_seconds: number;
  
  /** End time in seconds (from last word's end time) */
  end_seconds: number;
  
  /** Calculated duration in seconds */
  duration_seconds: number;
  
  /** Content type classification */
  content_type: ContentType;
  
  /** Media type classification (video or motiongraphic only) */
  media_type?: 'video' | 'motiongraphic';
  
  /** Transcript text for this segment */
  text: string;
  
  /** Generated visual description/prompt */
  visual_prompt?: string;
  
  /** Word timestamps within this segment */
  word_timestamps?: WordTimestamp[];
}

// ============================================================================
// CONTENT ANALYSIS TYPES
// ============================================================================

/**
 * A span of words that form a list structure.
 */
export interface ListSpan {
  /** Start word index */
  start_index: number;
  /** End word index (exclusive) */
  end_index: number;
  /** Individual item boundaries within the list */
  items: Array<{ start_index: number; end_index: number }>;
  /** Detection method used */
  detection_method: 'ordinal' | 'comma-series' | 'parallel-structure' | 'numeric-pattern';
}

/**
 * A span representing a comparison structure.
 */
export interface ComparisonSpan {
  /** Start word index */
  start_index: number;
  /** End word index (exclusive) */
  end_index: number;
  /** First side of comparison */
  side_a: { start_index: number; end_index: number };
  /** Second side of comparison */
  side_b: { start_index: number; end_index: number };
}

/**
 * A span representing a topic transition.
 */
export interface TransitionSpan {
  /** Start word index */
  start_index: number;
  /** End word index (exclusive) */
  end_index: number;
  /** Transition marker word(s) */
  marker: string;
}

/**
 * A span representing an emotional/impactful moment.
 */
export interface EmotionalBeatSpan {
  /** Start word index */
  start_index: number;
  /** End word index (exclusive) */
  end_index: number;
  /** Type of emotional beat */
  beat_type: 'climax' | 'revelation' | 'conclusion' | 'pause';
}

/**
 * Complete content structure analysis result.
 */
export interface ContentAnalysis {
  /** Detected list structures */
  lists: ListSpan[];
  /** Detected comparison structures */
  comparisons: ComparisonSpan[];
  /** Detected topic transitions */
  transitions: TransitionSpan[];
  /** Detected emotional beats */
  emotional_beats: EmotionalBeatSpan[];
  /** Full text of the script */
  full_text: string;
  /** Word count */
  word_count: number;
}

// ============================================================================
// PIPELINE TYPES
// ============================================================================

/**
 * Input for the shot list generation pipeline.
 */
export interface ShotListInput {
  /** Complete script narration text */
  script: string;
  /** Word-level timing data from TTS */
  word_timestamps: WordTimestamp[];
  /** Total audio duration in seconds */
  total_duration_seconds: number;
}

/**
 * Output from the shot list generation pipeline.
 */
export interface ShotListOutput {
  /** Generated shot list */
  shots: ShotEvent[];
  /** Content analysis used for segmentation */
  analysis: ContentAnalysis;
  /** Generation metadata */
  metadata: {
    total_segments: number;
    total_duration_seconds: number;
    average_segment_duration: number;
    content_type_breakdown: Record<ContentType, number>;
  };
}

// ============================================================================
// BREAK POINT TYPES
// ============================================================================

/**
 * Priority levels for break points (higher = more preferred).
 */
export type BreakPointPriority = 1 | 2 | 3 | 4;

/**
 * A potential break point in the timeline.
 */
export interface BreakPoint {
  /** Word index where break would occur (after this word) */
  after_word_index: number;
  /** Priority of this break point */
  priority: BreakPointPriority;
  /** Time in seconds */
  time_seconds: number;
  /** Reason for this break point */
  reason: string;
}

// ============================================================================
// HELPER CONSTANTS
// ============================================================================

/**
 * Ordinal markers that indicate list items.
 */
export const ORDINAL_MARKERS = [
  'first', 'firstly',
  'second', 'secondly',
  'third', 'thirdly',
  'fourth', 'fourthly',
  'fifth', 'fifthly',
  'next', 'then',
  'finally', 'lastly',
  'additionally', 'also', 'another',
  'furthermore', 'moreover',
] as const;

/**
 * Comparison markers.
 */
export const COMPARISON_MARKERS = {
  SIDE_A: ['on one hand', 'firstly', 'before', 'previously', 'unlike'],
  SIDE_B: ['on the other hand', 'conversely', 'however', 'but', 'whereas', 'while', 'after', 'now'],
  VERSUS: ['versus', 'vs', 'compared to', 'in contrast to'],
} as const;

/**
 * Transition markers.
 */
export const TRANSITION_MARKERS = [
  'meanwhile', 'elsewhere',
  'moving on', 'turning to',
  'now', 'today',
  'beyond', 'outside',
  'in conclusion', 'to summarize',
  'however', 'nevertheless',
] as const;

/**
 * Sentence-ending punctuation.
 */
export const SENTENCE_ENDINGS = ['.', '!', '?'] as const;

/**
 * Clause-separating punctuation.
 */
export const CLAUSE_SEPARATORS = [';', ':', '—', '-'] as const;
