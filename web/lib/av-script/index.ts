/**
 * AV Script Module - Public API
 * ============================================================================
 * Shot list generation system that analyzes word-aligned TTS audio
 * to create intelligent visual shot lists.
 */

// Main entry points
export { 
  generateShotList,
  generateShotListSync,
  formatShotListTable,
  validateShotList,
  getShotListSummary,
} from "./shot-list";

// Types
export type {
  ShotEvent,
  ShotListInput,
  ShotListOutput,
  ContentType,
  ContentAnalysis,
  ListSpan,
  ComparisonSpan,
  TransitionSpan,
  EmotionalBeatSpan,
  BreakPoint,
} from "./types";

export {
  CONTENT_DURATION_RANGES,
  SEGMENT_BOUNDS,
  ORDINAL_MARKERS,
  COMPARISON_MARKERS,
  TRANSITION_MARKERS,
} from "./types";

// Content analysis
export {
  analyzeContentStructure,
  detectLists,
  detectComparisons,
  detectTransitions,
  detectEmotionalBeats,
  getContentTypeForWord,
  isInList,
  isInComparison,
} from "./analyzer";

// Segmentation
export {
  segmentTimeline,
  getSegmentStats,
} from "./segmenter";

// Visual prompts
export {
  generateVisualPrompts,
  generateQuickPrompt,
} from "./prompt-gen";
