/**
 * Timeline Segmentation Engine
 * ============================================================================
 * Divides the audio timeline into visual segments following adaptive rules
 * based on content type analysis. Respects word boundaries and duration limits.
 */

import { WordTimestamp } from "@/types/task";
import {
  ContentAnalysis,
  ShotEvent,
  ContentType,
  BreakPoint,
  CONTENT_DURATION_RANGES,
  SEGMENT_BOUNDS,
  SENTENCE_ENDINGS,
  CLAUSE_SEPARATORS,
} from "./types";
import { getContentTypeForWord, isInList } from "./analyzer";

// ============================================================================
// MAIN SEGMENTATION FUNCTION
// ============================================================================

/**
 * Segment the audio timeline into visual segments.
 * Uses content analysis to determine segment durations and break points.
 */
export function segmentTimeline(
  wordTimestamps: WordTimestamp[],
  analysis: ContentAnalysis
): ShotEvent[] {
  if (wordTimestamps.length === 0) {
    return [];
  }

  // Step 1: Identify all potential break points
  const breakPoints = findBreakPoints(wordTimestamps, analysis);
  
  // Step 2: Build segments using break points and duration rules
  const segments = buildSegments(wordTimestamps, breakPoints, analysis);
  
  // Step 3: Validate and adjust segments to meet constraints
  return validateAndAdjustSegments(segments, wordTimestamps);
}

// ============================================================================
// BREAK POINT DETECTION
// ============================================================================

/**
 * Find all potential break points in the timeline.
 * Priority 1: List item boundaries
 * Priority 2: Sentence boundaries
 * Priority 3: Clause boundaries
 * Priority 4: Phrase boundaries
 */
function findBreakPoints(
  wordTimestamps: WordTimestamp[],
  analysis: ContentAnalysis
): BreakPoint[] {
  const breakPoints: BreakPoint[] = [];
  
  for (let i = 0; i < wordTimestamps.length; i++) {
    const word = wordTimestamps[i].word;
    const endTime = wordTimestamps[i].end_seconds;
    
    // Priority 1: List item boundaries
    const listSpan = isInList(i, analysis);
    if (listSpan) {
      // Check if this is the end of a list item
      for (const item of listSpan.items) {
        if (i === item.end_index - 1) {
          breakPoints.push({
            after_word_index: i,
            priority: 1,
            time_seconds: endTime,
            reason: 'list-item-boundary',
          });
          break;
        }
      }
    }
    
    // Priority 2: Sentence boundaries
    if (SENTENCE_ENDINGS.some(ending => word.endsWith(ending))) {
      // Don't double-add if already a list boundary
      if (!breakPoints.some(bp => bp.after_word_index === i && bp.priority === 1)) {
        breakPoints.push({
          after_word_index: i,
          priority: 2,
          time_seconds: endTime,
          reason: 'sentence-boundary',
        });
      }
    }
    
    // Priority 3: Clause boundaries (semicolons, colons)
    if (CLAUSE_SEPARATORS.some(sep => word.includes(sep))) {
      if (!breakPoints.some(bp => bp.after_word_index === i)) {
        breakPoints.push({
          after_word_index: i,
          priority: 3,
          time_seconds: endTime,
          reason: 'clause-boundary',
        });
      }
    }
    
    // Priority 4: Comma boundaries (potential phrase breaks)
    if (word.endsWith(',') && !breakPoints.some(bp => bp.after_word_index === i)) {
      breakPoints.push({
        after_word_index: i,
        priority: 4,
        time_seconds: endTime,
        reason: 'phrase-boundary',
      });
    }
  }
  
  // Sort by time
  return breakPoints.sort((a, b) => a.time_seconds - b.time_seconds);
}

// ============================================================================
// SEGMENT BUILDING
// ============================================================================

/**
 * Build segments from break points, respecting content type duration rules.
 */
function buildSegments(
  wordTimestamps: WordTimestamp[],
  breakPoints: BreakPoint[],
  analysis: ContentAnalysis
): ShotEvent[] {
  const segments: ShotEvent[] = [];
  let currentStartIndex = 0;
  let segmentIndex = 1;
  
  while (currentStartIndex < wordTimestamps.length) {
    const startTime = wordTimestamps[currentStartIndex].start_seconds;
    const contentType = getContentTypeForWord(currentStartIndex, analysis);
    const durationRange = CONTENT_DURATION_RANGES[contentType];
    
    // Find the best break point for this segment
    const { endIndex, reason: _reason } = findBestBreakPoint(
      currentStartIndex,
      wordTimestamps,
      breakPoints,
      contentType,
      durationRange,
      analysis
    );
    
    const endTime = wordTimestamps[endIndex].end_seconds;
    const duration = endTime - startTime;
    
    // Extract text for this segment
    const segmentWords = wordTimestamps.slice(currentStartIndex, endIndex + 1);
    const text = segmentWords.map(wt => wt.word).join(' ');
    
    segments.push({
      segment_index: segmentIndex,
      start_seconds: startTime,
      end_seconds: endTime,
      duration_seconds: duration,
      content_type: contentType,
      text,
      word_timestamps: segmentWords,
    });
    
    currentStartIndex = endIndex + 1;
    segmentIndex++;
  }
  
  return segments;
}

/**
 * Find the best break point for a segment starting at startIndex.
 */
function findBestBreakPoint(
  startIndex: number,
  wordTimestamps: WordTimestamp[],
  breakPoints: BreakPoint[],
  contentType: ContentType,
  durationRange: { min: number; target: number; max: number },
  analysis: ContentAnalysis
): { endIndex: number; reason: string } {
  const startTime = wordTimestamps[startIndex].start_seconds;
  const targetEndTime = startTime + durationRange.target;
  const _minEndTime = startTime + durationRange.min;
  const maxEndTime = startTime + durationRange.max;
  
  // Special handling for list items: try to end at item boundaries
  const listSpan = isInList(startIndex, analysis);
  if (listSpan && contentType === 'list-item') {
    // Find which list item we're in
    for (const item of listSpan.items) {
      if (startIndex >= item.start_index && startIndex < item.end_index) {
        // End at this item's boundary
        const itemEndIndex = Math.min(item.end_index - 1, wordTimestamps.length - 1);
        const itemEndTime = wordTimestamps[itemEndIndex].end_seconds;
        const itemDuration = itemEndTime - startTime;
        
        // If item is within acceptable range, use it
        if (itemDuration >= SEGMENT_BOUNDS.MIN_DURATION && 
            itemDuration <= SEGMENT_BOUNDS.MAX_DURATION) {
          return { endIndex: itemEndIndex, reason: 'list-item-end' };
        }
        break;
      }
    }
  }
  
  // Find break points in the acceptable time range
  const candidateBreakPoints = breakPoints.filter(bp => {
    const endIndex = bp.after_word_index;
    if (endIndex <= startIndex) return false;
    
    const duration = bp.time_seconds - startTime;
    return duration >= SEGMENT_BOUNDS.MIN_DURATION && 
           duration <= SEGMENT_BOUNDS.MAX_DURATION;
  });
  
  if (candidateBreakPoints.length === 0) {
    // No break points in range, find the best word boundary
    return findFallbackBreakPoint(startIndex, wordTimestamps, targetEndTime, maxEndTime);
  }
  
  // Score each break point
  const scoredBreakPoints = candidateBreakPoints.map(bp => {
    const duration = bp.time_seconds - startTime;
    
    // Base score: how close to target duration (inverse distance)
    const durationDiff = Math.abs(duration - durationRange.target);
    let score = 100 - (durationDiff * 10);
    
    // Bonus for priority (higher priority = higher score)
    score += (5 - bp.priority) * 20;
    
    // Penalty for being too short or too long relative to content type range
    if (duration < durationRange.min) {
      score -= 30;
    } else if (duration > durationRange.max) {
      score -= 20;
    }
    
    return { ...bp, score };
  });
  
  // Sort by score descending
  scoredBreakPoints.sort((a, b) => b.score - a.score);
  
  const best = scoredBreakPoints[0];
  return { 
    endIndex: best.after_word_index, 
    reason: best.reason 
  };
}

/**
 * Find a fallback break point when no ideal break points exist.
 */
function findFallbackBreakPoint(
  startIndex: number,
  wordTimestamps: WordTimestamp[],
  targetEndTime: number,
  _maxEndTime: number
): { endIndex: number; reason: string } {
  const startTime = wordTimestamps[startIndex].start_seconds;
  
  // Find the word closest to target end time
  let bestIndex = startIndex;
  let bestDiff = Infinity;
  
  for (let i = startIndex + 1; i < wordTimestamps.length; i++) {
    const endTime = wordTimestamps[i].end_seconds;
    const duration = endTime - startTime;
    
    // Stop if we're past max duration
    if (duration > SEGMENT_BOUNDS.MAX_DURATION) {
      break;
    }
    
    // Only consider if at least min duration
    if (duration >= SEGMENT_BOUNDS.MIN_DURATION) {
      const diff = Math.abs(endTime - targetEndTime);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIndex = i;
      }
    }
  }
  
  // If we couldn't find anything, use max allowed or end of words
  if (bestIndex === startIndex) {
    for (let i = startIndex + 1; i < wordTimestamps.length; i++) {
      const duration = wordTimestamps[i].end_seconds - startTime;
      if (duration >= SEGMENT_BOUNDS.MIN_DURATION) {
        bestIndex = i;
        break;
      }
    }
  }
  
  // Final fallback: just use the next word
  if (bestIndex === startIndex && startIndex + 1 < wordTimestamps.length) {
    bestIndex = startIndex + 1;
  }
  
  return { endIndex: bestIndex, reason: 'fallback-word-boundary' };
}

// ============================================================================
// SEGMENT VALIDATION & ADJUSTMENT
// ============================================================================

/**
 * Validate segments and adjust to meet all constraints.
 */
function validateAndAdjustSegments(
  segments: ShotEvent[],
  wordTimestamps: WordTimestamp[]
): ShotEvent[] {
  const adjusted: ShotEvent[] = [];
  
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    
    // Check duration constraints
    if (segment.duration_seconds < SEGMENT_BOUNDS.MIN_DURATION) {
      // Too short - merge with next or previous segment
      if (i + 1 < segments.length) {
        // Merge with next
        const nextSegment = segments[i + 1];
        const merged: ShotEvent = {
          ...segment,
          end_seconds: nextSegment.end_seconds,
          duration_seconds: nextSegment.end_seconds - segment.start_seconds,
          text: segment.text + ' ' + nextSegment.text,
          word_timestamps: [...(segment.word_timestamps || []), ...(nextSegment.word_timestamps || [])],
        };
        adjusted.push(merged);
        i++; // Skip next segment since we merged it
        continue;
      } else if (adjusted.length > 0) {
        // Merge with previous
        const prev = adjusted[adjusted.length - 1];
        prev.end_seconds = segment.end_seconds;
        prev.duration_seconds = prev.end_seconds - prev.start_seconds;
        prev.text = prev.text + ' ' + segment.text;
        prev.word_timestamps = [...(prev.word_timestamps || []), ...(segment.word_timestamps || [])];
        continue;
      }
    }
    
    if (segment.duration_seconds > SEGMENT_BOUNDS.MAX_DURATION) {
      // Too long - split into multiple segments
      const splitSegments = splitLongSegment(segment, wordTimestamps);
      adjusted.push(...splitSegments);
      continue;
    }
    
    adjusted.push(segment);
  }
  
  // Re-index segments
  adjusted.forEach((seg, idx) => {
    seg.segment_index = idx + 1;
  });
  
  // Validate no gaps or overlaps
  return ensureTimelineCoverage(adjusted, wordTimestamps);
}

/**
 * Split a segment that's too long into smaller segments.
 */
function splitLongSegment(
  segment: ShotEvent,
  _allWordTimestamps: WordTimestamp[]
): ShotEvent[] {
  const words = segment.word_timestamps || [];
  if (words.length <= 1) {
    // Can't split single word
    return [segment];
  }
  
  const targetDuration = CONTENT_DURATION_RANGES[segment.content_type].target;
  const numSplits = Math.ceil(segment.duration_seconds / targetDuration);
  const wordsPerSplit = Math.ceil(words.length / numSplits);
  
  const splits: ShotEvent[] = [];
  
  for (let i = 0; i < words.length; i += wordsPerSplit) {
    const splitWords = words.slice(i, Math.min(i + wordsPerSplit, words.length));
    if (splitWords.length === 0) continue;
    
    const start = splitWords[0].start_seconds;
    const end = splitWords[splitWords.length - 1].end_seconds;
    
    splits.push({
      segment_index: 0, // Will be re-indexed
      start_seconds: start,
      end_seconds: end,
      duration_seconds: end - start,
      content_type: segment.content_type,
      text: splitWords.map(w => w.word).join(' '),
      word_timestamps: splitWords,
    });
  }
  
  return splits;
}

/**
 * Ensure complete timeline coverage with no gaps or overlaps.
 */
function ensureTimelineCoverage(
  segments: ShotEvent[],
  wordTimestamps: WordTimestamp[]
): ShotEvent[] {
  if (segments.length === 0 || wordTimestamps.length === 0) {
    return segments;
  }
  
  // Ensure first segment starts at beginning
  const firstWord = wordTimestamps[0];
  if (segments[0].start_seconds > firstWord.start_seconds) {
    segments[0].start_seconds = firstWord.start_seconds;
    segments[0].duration_seconds = segments[0].end_seconds - segments[0].start_seconds;
  }
  
  // Ensure last segment ends at end
  const lastWord = wordTimestamps[wordTimestamps.length - 1];
  const lastSegment = segments[segments.length - 1];
  if (lastSegment.end_seconds < lastWord.end_seconds) {
    lastSegment.end_seconds = lastWord.end_seconds;
    lastSegment.duration_seconds = lastSegment.end_seconds - lastSegment.start_seconds;
  }
  
  // Fix any gaps between segments
  for (let i = 1; i < segments.length; i++) {
    const prev = segments[i - 1];
    const curr = segments[i];
    
    if (curr.start_seconds > prev.end_seconds) {
      // Gap detected - extend previous segment
      prev.end_seconds = curr.start_seconds;
      prev.duration_seconds = prev.end_seconds - prev.start_seconds;
    } else if (curr.start_seconds < prev.end_seconds) {
      // Overlap detected - adjust current start
      curr.start_seconds = prev.end_seconds;
      curr.duration_seconds = curr.end_seconds - curr.start_seconds;
    }
  }
  
  return segments;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get segment duration statistics.
 */
export function getSegmentStats(segments: ShotEvent[]): {
  total_segments: number;
  total_duration: number;
  average_duration: number;
  min_duration: number;
  max_duration: number;
  content_type_breakdown: Record<ContentType, number>;
} {
  if (segments.length === 0) {
    return {
      total_segments: 0,
      total_duration: 0,
      average_duration: 0,
      min_duration: 0,
      max_duration: 0,
      content_type_breakdown: {
        'list-item': 0,
        'comparison': 0,
        'concept': 0,
        'transition': 0,
        'emotional-beat': 0,
      },
    };
  }
  
  const durations = segments.map(s => s.duration_seconds);
  const total_duration = durations.reduce((a, b) => a + b, 0);
  
  const breakdown: Record<ContentType, number> = {
    'list-item': 0,
    'comparison': 0,
    'concept': 0,
    'transition': 0,
    'emotional-beat': 0,
  };
  
  segments.forEach(s => {
    breakdown[s.content_type]++;
  });
  
  return {
    total_segments: segments.length,
    total_duration,
    average_duration: total_duration / segments.length,
    min_duration: Math.min(...durations),
    max_duration: Math.max(...durations),
    content_type_breakdown: breakdown,
  };
}
