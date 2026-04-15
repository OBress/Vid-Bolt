/**
 * Shot List Generator
 * ============================================================================
 * Main orchestrator that combines content analysis, timeline segmentation,
 * and visual prompt generation to produce a complete shot list.
 */

import {
  ShotEvent,
  ShotListInput,
  ShotListOutput,
} from "./types";
import { analyzeContentStructure } from "./analyzer";
import { segmentTimeline, getSegmentStats } from "./segmenter";
import { generateVisualPrompts, type OutlineAssets, type CreativeManifestContext } from "./prompt-gen";

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Generate a complete shot list from script and word timestamps.
 * 
 * Pipeline:
 * 1. Analyze content structure (lists, comparisons, transitions, emotional beats)
 * 2. Segment timeline based on analysis
 * 3. Generate visual prompts for each segment (with optional entity consistency)
 * 4. Return structured shot list
 * 
 * @param userId        - User ID for AI prompt generation
 * @param input         - Script, word timestamps, and total duration
 * @param outlineAssets - Optional entity profiles for Visual Consistency Bible
 * @param creative      - Optional creative manifest for style consistency
 * @returns Complete shot list with visual prompts
 */
export async function generateShotList(
  userId: string,
  input: ShotListInput,
  outlineAssets?: OutlineAssets,
  creative?: CreativeManifestContext,
): Promise<ShotListOutput> {
  const { script, word_timestamps, total_duration_seconds } = input;
  
  // Validate input
  if (!word_timestamps || word_timestamps.length === 0) {
    throw new Error("Word timestamps are required for shot list generation");
  }
  
  if (!script || script.trim().length === 0) {
    throw new Error("Script is required for shot list generation");
  }
  
  console.log(`[ShotList] Generating shot list for ${word_timestamps.length} words, ${total_duration_seconds.toFixed(1)}s total`);
  
  // Step 1: Analyze content structure
  console.log("[ShotList] Step 1: Analyzing content structure...");
  const analysis = analyzeContentStructure(script, word_timestamps);
  console.log(`[ShotList] Found ${analysis.lists.length} lists, ${analysis.comparisons.length} comparisons, ${analysis.transitions.length} transitions, ${analysis.emotional_beats.length} emotional beats`);
  
  // Step 2: Segment timeline
  console.log("[ShotList] Step 2: Segmenting timeline...");
  const segments = segmentTimeline(word_timestamps, analysis);
  console.log(`[ShotList] Created ${segments.length} segments`);
  
  // Step 3: Generate visual prompts (with optional entity profiles)
  console.log("[ShotList] Step 3: Generating visual prompts...");
  const segmentsWithPrompts = await generateVisualPrompts(userId, segments, outlineAssets, creative);
  console.log(`[ShotList] Generated ${segmentsWithPrompts.filter(s => s.visual_prompt).length} visual prompts`);
  
  // Step 4: Calculate metadata
  const stats = getSegmentStats(segmentsWithPrompts);
  
  const output: ShotListOutput = {
    shots: segmentsWithPrompts,
    analysis,
    metadata: {
      total_segments: stats.total_segments,
      total_duration_seconds: stats.total_duration,
      average_segment_duration: stats.average_duration,
      content_type_breakdown: stats.content_type_breakdown,
    },
  };
  
  console.log(`[ShotList] Complete. Stats: ${stats.total_segments} segments, avg ${stats.average_duration.toFixed(1)}s, min ${stats.min_duration.toFixed(1)}s, max ${stats.max_duration.toFixed(1)}s`);
  
  return output;
}

/**
 * Generate a shot list without visual prompts (for testing/preview).
 */
export function generateShotListSync(
  input: ShotListInput
): Omit<ShotListOutput, 'shots'> & { shots: ShotEvent[] } {
  const { script, word_timestamps } = input;
  
  // Validate input
  if (!word_timestamps || word_timestamps.length === 0) {
    throw new Error("Word timestamps are required for shot list generation");
  }
  
  // Step 1: Analyze content structure
  const analysis = analyzeContentStructure(script, word_timestamps);
  
  // Step 2: Segment timeline
  const segments = segmentTimeline(word_timestamps, analysis);
  
  // Step 3: Calculate metadata
  const stats = getSegmentStats(segments);
  
  return {
    shots: segments,
    analysis,
    metadata: {
      total_segments: stats.total_segments,
      total_duration_seconds: stats.total_duration,
      average_segment_duration: stats.average_duration,
      content_type_breakdown: stats.content_type_breakdown,
    },
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format a shot list as a table for logging/debugging.
 */
export function formatShotListTable(shots: ShotEvent[]): string {
  const header = "| # | Start | End | Dur | Type | Text Preview | Visual Prompt Preview |";
  const separator = "|---|-------|-----|-----|------|--------------|----------------------|";
  
  const rows = shots.map(shot => {
    const textPreview = shot.text.length > 40 
      ? shot.text.substring(0, 37) + "..." 
      : shot.text;
    const promptPreview = shot.visual_prompt 
      ? (shot.visual_prompt.length > 30 ? shot.visual_prompt.substring(0, 27) + "..." : shot.visual_prompt)
      : "(none)";
    
    return `| ${shot.segment_index} | ${shot.start_seconds.toFixed(1)}s | ${shot.end_seconds.toFixed(1)}s | ${shot.duration_seconds.toFixed(1)}s | ${shot.content_type} | ${textPreview} | ${promptPreview} |`;
  });
  
  return [header, separator, ...rows].join("\n");
}

/**
 * Validate a shot list meets all constraints.
 */
export function validateShotList(
  shots: ShotEvent[],
  totalDuration: number
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (shots.length === 0) {
    errors.push("Shot list is empty");
    return { valid: false, errors };
  }
  
  // Check each segment's duration
  for (const shot of shots) {
    if (shot.duration_seconds < 1) {
      errors.push(`Segment ${shot.segment_index} is too short (${shot.duration_seconds.toFixed(2)}s < 1s)`);
    }
    if (shot.duration_seconds > 10) {
      errors.push(`Segment ${shot.segment_index} is too long (${shot.duration_seconds.toFixed(2)}s > 10s)`);
    }
  }
  
  // Check for gaps
  for (let i = 1; i < shots.length; i++) {
    const prev = shots[i - 1];
    const curr = shots[i];
    const gap = curr.start_seconds - prev.end_seconds;
    
    if (gap > 0.01) { // Allow tiny floating point differences
      errors.push(`Gap detected between segments ${i} and ${i + 1}: ${gap.toFixed(2)}s`);
    }
    if (gap < -0.01) {
      errors.push(`Overlap detected between segments ${i} and ${i + 1}: ${Math.abs(gap).toFixed(2)}s`);
    }
  }
  
  // Check coverage
  const firstStart = shots[0].start_seconds;
  const lastEnd = shots[shots.length - 1].end_seconds;
  const coverage = lastEnd - firstStart;
  
  if (Math.abs(coverage - totalDuration) > 0.5) {
    errors.push(`Timeline coverage (${coverage.toFixed(1)}s) doesn't match total duration (${totalDuration.toFixed(1)}s)`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get a summary of the shot list by content type.
 */
export function getShotListSummary(shots: ShotEvent[]): string {
  const stats = getSegmentStats(shots);
  
  const lines = [
    `Total Segments: ${stats.total_segments}`,
    `Total Duration: ${stats.total_duration.toFixed(1)}s`,
    `Average Duration: ${stats.average_duration.toFixed(1)}s`,
    `Duration Range: ${stats.min_duration.toFixed(1)}s - ${stats.max_duration.toFixed(1)}s`,
    "",
    "Content Type Breakdown:",
    ...Object.entries(stats.content_type_breakdown)
      .filter(([_, count]) => count > 0)
      .map(([type, count]) => `  - ${type}: ${count} segments`),
  ];
  
  return lines.join("\n");
}
