/**
 * Universal Script Generation Utilities
 * ============================================================================
 * Shared utility functions for the script generation system.
 */

import type { 
  ConfidenceLevel, 
  SourceCitation, 
  ReliabilityTier,
  Beat,
  EngagementMarkers,
} from './types';
import { 
  WORDS_PER_MINUTE, 
  BEAT_DURATION,
  CONFIDENCE_ASSIGNMENT_RULES,
} from './config';

// ============================================================================
// WORD & TIMING CALCULATIONS
// ============================================================================

/**
 * Count words in a text string
 */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Calculate duration in seconds from word count
 */
export function calculateDuration(wordCount: number, wpm: number = WORDS_PER_MINUTE): number {
  return Math.round((wordCount / wpm) * 60);
}

/**
 * Calculate word count from duration
 */
export function calculateWordCount(durationSeconds: number, wpm: number = WORDS_PER_MINUTE): number {
  return Math.round((durationSeconds / 60) * wpm);
}

/**
 * Calculate number of beats from duration
 */
export function calculateBeatCount(
  durationSeconds: number, 
  avgBeatDuration: number = BEAT_DURATION.defaultSeconds
): number {
  return Math.max(1, Math.round(durationSeconds / avgBeatDuration));
}

/**
 * Convert minutes to seconds
 */
export function minutesToSeconds(minutes: number): number {
  return minutes * 60;
}

/**
 * Convert seconds to minutes
 */
export function secondsToMinutes(seconds: number): number {
  return seconds / 60;
}

/**
 * Format duration as MM:SS string
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ============================================================================
// CONFIDENCE & SOURCE SCORING
// ============================================================================

/**
 * Assign confidence level based on source citations
 */
export function assignConfidenceLevel(sources: SourceCitation[]): ConfidenceLevel {
  if (sources.length === 0) {
    return 'unverified';
  }

  const tier1Or2Count = sources.filter(s => s.reliabilityTier <= 2).length;
  const tier3Count = sources.filter(s => s.reliabilityTier === 3).length;

  // Check for conflicts (would need more context to properly detect)
  // For now, we just count sources

  if (tier1Or2Count >= CONFIDENCE_ASSIGNMENT_RULES.verified.minTier1Or2Sources) {
    return 'verified';
  }

  if (tier1Or2Count >= CONFIDENCE_ASSIGNMENT_RULES.high.minTier1Or2Sources) {
    return 'high';
  }

  if (tier1Or2Count >= 1 || tier3Count >= 2) {
    return 'medium';
  }

  if (tier3Count >= 1 || sources.length > 0) {
    return 'low';
  }

  return 'unverified';
}

/**
 * Calculate overall confidence score (0-100) from multiple facts
 */
export function calculateOverallConfidence(confidenceLevels: ConfidenceLevel[]): number {
  if (confidenceLevels.length === 0) return 0;

  const scores: Record<ConfidenceLevel, number> = {
    verified: 100,
    high: 80,
    medium: 60,
    low: 40,
    conflicted: 30,
    unverified: 10,
  };

  const total = confidenceLevels.reduce((sum, level) => sum + scores[level], 0);
  return Math.round(total / confidenceLevels.length);
}

/**
 * Get reliability tier label
 */
export function getReliabilityTierLabel(tier: ReliabilityTier): string {
  const labels: Record<ReliabilityTier, string> = {
    1: 'Primary/Academic',
    2: 'Established News',
    3: 'Books/Documentaries',
    4: 'Informal',
    5: 'Unverified',
  };
  return labels[tier];
}

// ============================================================================
// ID GENERATION
// ============================================================================

/**
 * Generate a unique fact ID
 */
export function generateFactId(index: number): string {
  return `FACT-${String(index + 1).padStart(3, '0')}`;
}

/**
 * Generate a unique quote ID
 */
export function generateQuoteId(index: number): string {
  return `QUOTE-${String(index + 1).padStart(3, '0')}`;
}

/**
 * Generate a unique timeline event ID
 */
export function generateTimelineId(index: number): string {
  return `TIMELINE-${String(index + 1).padStart(3, '0')}`;
}

/**
 * Generate a unique theory ID
 */
export function generateTheoryId(index: number): string {
  return `THEORY-${String(index + 1).padStart(3, '0')}`;
}

/**
 * Generate a unique character ID
 */
export function generateCharacterId(index: number): string {
  return `CHAR-${String(index + 1).padStart(3, '0')}`;
}

/**
 * Generate a unique location ID
 */
export function generateLocationId(index: number): string {
  return `LOC-${String(index + 1).padStart(3, '0')}`;
}

/**
 * Generate a unique object ID
 */
export function generateObjectId(index: number): string {
  return `OBJ-${String(index + 1).padStart(3, '0')}`;
}

// ============================================================================
// ENGAGEMENT ANALYSIS
// ============================================================================

/**
 * Check if a beat has any engagement markers
 */
export function hasEngagementMarker(markers: EngagementMarkers): boolean {
  return markers.opensLoop || 
         markers.closesLoop || 
         markers.isPatternInterrupt || 
         markers.callbackToBeatIndex !== undefined;
}

/**
 * Count open loops in a sequence of beats
 */
export function countOpenLoops(beats: Beat[]): number {
  let openCount = 0;
  for (const beat of beats) {
    if (beat.engagement.opensLoop) openCount++;
    if (beat.engagement.closesLoop) openCount--;
  }
  return Math.max(0, openCount);
}

/**
 * Find unclosed loops in beats
 */
export function findUnclosedLoops(beats: Beat[]): Array<{ openedAtIndex: number; loopId?: string }> {
  const openLoops: Map<string, number> = new Map();
  const unclosed: Array<{ openedAtIndex: number; loopId?: string }> = [];

  for (let i = 0; i < beats.length; i++) {
    const beat = beats[i];
    if (beat.engagement.opensLoop && beat.engagement.loopId) {
      openLoops.set(beat.engagement.loopId, i);
    }
    if (beat.engagement.closesLoop && beat.engagement.loopId) {
      openLoops.delete(beat.engagement.loopId);
    }
  }

  for (const [loopId, openedAtIndex] of openLoops) {
    unclosed.push({ openedAtIndex, loopId });
  }

  return unclosed;
}

/**
 * Find pattern interrupt gaps (consecutive beats without interrupt)
 */
export function findPatternInterruptGaps(
  beats: Beat[], 
  maxGapSeconds: number
): Array<{ startIndex: number; endIndex: number; gapSeconds: number }> {
  const gaps: Array<{ startIndex: number; endIndex: number; gapSeconds: number }> = [];
  
  let lastInterruptIndex = -1;
  let gapStartTime = 0;

  for (let i = 0; i < beats.length; i++) {
    const beat = beats[i];
    
    if (beat.engagement.isPatternInterrupt || beat.classification.type === 'hook') {
      if (lastInterruptIndex >= 0) {
        const gapSeconds = beat.timing.startSeconds - gapStartTime;
        if (gapSeconds > maxGapSeconds) {
          gaps.push({
            startIndex: lastInterruptIndex,
            endIndex: i,
            gapSeconds,
          });
        }
      }
      lastInterruptIndex = i;
      gapStartTime = beat.timing.endSeconds;
    }
  }

  return gaps;
}

// ============================================================================
// TEXT UTILITIES
// ============================================================================

/**
 * Check if text contains any banned phrases
 */
export function findBannedPhrases(text: string, bannedPhrases: string[]): string[] {
  const lowerText = text.toLowerCase();
  return bannedPhrases.filter(phrase => lowerText.includes(phrase.toLowerCase()));
}

/**
 * Truncate text to a maximum length with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Extract first N sentences from text
 */
export function extractFirstSentences(text: string, count: number): string {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  return sentences.slice(0, count).join(' ').trim();
}

/**
 * Clean AI-generated text by removing common artifacts
 */
export function cleanAIText(text: string): string {
  return text
    // Remove markdown code blocks
    .replace(/```[\s\S]*?```/g, '')
    // Remove excessive newlines
    .replace(/\n{3,}/g, '\n\n')
    // Trim whitespace
    .trim();
}
