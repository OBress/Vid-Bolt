/**
 * Duration Calculator
 * ============================================================================
 * Calculates optimal video duration based on content density and user range.
 */

import type { 
  ContentDensityAnalysis, 
  DurationDecision,
  DurationRange,
  ScriptGenre,
} from '../types';
import { 
  WORDS_PER_MINUTE, 
  BEAT_DURATION, 
  DEFAULT_CONTENT_ALLOCATION,
  GENRE_CONFIG,
} from '../config';
import { calculateContentScore } from './density-analyzer';

// ============================================================================
// TYPES
// ============================================================================

export interface ContentFit {
  tooThin: boolean;
  tooRich: boolean;
  idealDurationSeconds: number;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Calculate optimal duration within user's range.
 * 
 * @param densityAnalysis - Content density analysis
 * @param durationRange - User's desired min/max minutes
 * @param genre - Script genre
 * @returns Duration decision with reasoning
 */
export function calculateOptimalDuration(
  densityAnalysis: ContentDensityAnalysis,
  durationRange: DurationRange,
  genre: ScriptGenre
): { decision: DurationDecision; contentFit: ContentFit } {
  const minSeconds = durationRange.minMinutes * 60;
  const maxSeconds = durationRange.maxMinutes * 60;

  // Calculate ideal duration based on content
  const idealDurationSeconds = calculateIdealDuration(densityAnalysis);

  // Determine content fit
  const contentFit: ContentFit = {
    tooThin: idealDurationSeconds < minSeconds * 0.7, // <70% of min
    tooRich: idealDurationSeconds > maxSeconds * 1.3, // >130% of max
    idealDurationSeconds,
  };

  // Clamp to user's range
  const recommendedDurationSeconds = Math.max(
    minSeconds,
    Math.min(maxSeconds, idealDurationSeconds)
  );

  // Calculate derived values
  const targetWordCount = Math.round((recommendedDurationSeconds / 60) * WORDS_PER_MINUTE);
  const beatCount = Math.round(recommendedDurationSeconds / BEAT_DURATION.defaultSeconds);

  // Get content allocation (may be overridden by genre)
  const genreConfig = GENRE_CONFIG[genre];
  const contentAllocation = genreConfig.contentAllocationOverride || DEFAULT_CONTENT_ALLOCATION;

  // Build reasoning
  const reasoning = buildReasoning(
    densityAnalysis,
    idealDurationSeconds,
    recommendedDurationSeconds,
    durationRange,
    contentFit
  );

  const decision: DurationDecision = {
    recommendedDurationSeconds,
    targetWordCount,
    beatCount,
    reasoning,
    contentAllocation,
  };

  return { decision, contentFit };
}

/**
 * Calculate ideal duration from content density
 */
function calculateIdealDuration(densityAnalysis: ContentDensityAnalysis): number {
  // Base duration by fact count
  let baseDurationSeconds: number;
  switch (densityAnalysis.factCountScore) {
    case 'lean':
      baseDurationSeconds = 180; // 3 minutes base
      break;
    case 'mid':
      baseDurationSeconds = 420; // 7 minutes base
      break;
    case 'rich':
      baseDurationSeconds = 720; // 12 minutes base
      break;
  }

  // Adjust for narrative complexity
  let complexityMultiplier: number;
  switch (densityAnalysis.narrativeComplexity) {
    case 'single_thread':
      complexityMultiplier = 1.0;
      break;
    case 'multiple_threads':
      complexityMultiplier = 1.3;
      break;
    case 'complex':
      complexityMultiplier = 1.6;
      break;
  }

  // Adjust for timeline span
  let timelineMultiplier: number;
  switch (densityAnalysis.timelineSpan) {
    case 'single_event':
      timelineMultiplier = 1.0;
      break;
    case 'days':
      timelineMultiplier = 1.1;
      break;
    case 'months':
      timelineMultiplier = 1.2;
      break;
    case 'years':
      timelineMultiplier = 1.4;
      break;
    case 'decades':
      timelineMultiplier = 1.6;
      break;
  }

  // Add time for theories (each theory needs ~45 seconds to explain)
  const theoryTimePadding = densityAnalysis.theoryCount * 45;

  // Add time for characters (each character introduction ~20 seconds)
  const characterTimePadding = densityAnalysis.characterCount * 20;

  // Add time for visual scenes (transitions ~5 seconds each)
  const sceneTransitionTime = densityAnalysis.visualSceneCount * 5;

  const totalSeconds = 
    baseDurationSeconds * complexityMultiplier * timelineMultiplier +
    theoryTimePadding +
    characterTimePadding +
    sceneTransitionTime;

  // Round to nearest 30 seconds
  return Math.round(totalSeconds / 30) * 30;
}

/**
 * Build human-readable reasoning for the duration decision
 */
function buildReasoning(
  densityAnalysis: ContentDensityAnalysis,
  idealSeconds: number,
  recommendedSeconds: number,
  durationRange: DurationRange,
  contentFit: ContentFit
): string {
  const parts: string[] = [];

  // Content description
  const factDescription = {
    lean: 'limited factual content',
    mid: 'moderate factual content',
    rich: 'rich factual content',
  }[densityAnalysis.factCountScore];

  parts.push(`Based on ${factDescription} (${densityAnalysis.factCountScore})`);

  // Narrative complexity
  if (densityAnalysis.narrativeComplexity !== 'single_thread') {
    parts.push(
      densityAnalysis.narrativeComplexity === 'complex'
        ? 'with complex multi-threaded narrative'
        : 'with multiple narrative threads'
    );
  }

  // Timeline span
  if (densityAnalysis.timelineSpan !== 'single_event' && densityAnalysis.timelineSpan !== 'days') {
    parts.push(`spanning ${densityAnalysis.timelineSpan}`);
  }

  // Character count
  if (densityAnalysis.characterCount > 3) {
    parts.push(`and ${densityAnalysis.characterCount} key figures to introduce`);
  }

  // Fit assessment
  const idealMinutes = Math.round(idealSeconds / 60);
  const recommendedMinutes = Math.round(recommendedSeconds / 60);

  if (contentFit.tooThin) {
    parts.push(
      `Ideal duration is ~${idealMinutes} minutes, but user requested minimum ${durationRange.minMinutes} minutes. ` +
      `Proceeding with ${recommendedMinutes} minutes but content may feel stretched.`
    );
  } else if (contentFit.tooRich) {
    parts.push(
      `Ideal duration is ~${idealMinutes} minutes, but user requested maximum ${durationRange.maxMinutes} minutes. ` +
      `Proceeding with ${recommendedMinutes} minutes but some content may be condensed.`
    );
  } else {
    parts.push(`Recommending ${recommendedMinutes} minutes.`);
  }

  return parts.join(', ').replace(/,\s*,/g, ',');
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate beat count from duration
 */
export function calculateBeatCount(durationSeconds: number): number {
  return Math.max(1, Math.round(durationSeconds / BEAT_DURATION.defaultSeconds));
}

/**
 * Calculate time allocation for each section
 */
export function calculateTimeAllocation(
  totalSeconds: number,
  allocation: typeof DEFAULT_CONTENT_ALLOCATION
): {
  openingSeconds: number;
  mainActsSeconds: number;
  conclusionSeconds: number;
} {
  return {
    openingSeconds: Math.round(totalSeconds * (allocation.openingPercent / 100)),
    mainActsSeconds: Math.round(totalSeconds * (allocation.mainActsPercent / 100)),
    conclusionSeconds: Math.round(totalSeconds * (allocation.conclusionPercent / 100)),
  };
}

/**
 * Estimate whether user should reconsider duration range
 */
export function shouldReconsiderRange(
  contentFit: ContentFit,
  durationRange: DurationRange
): { shouldReconsider: boolean; suggestion: string } {
  if (contentFit.tooThin) {
    const suggestedMax = Math.ceil(contentFit.idealDurationSeconds / 60);
    return {
      shouldReconsider: true,
      suggestion: `Consider a shorter video (${suggestedMax} minutes max) for this content.`,
    };
  }

  if (contentFit.tooRich) {
    const suggestedMin = Math.ceil(contentFit.idealDurationSeconds / 60);
    return {
      shouldReconsider: true,
      suggestion: `Content is rich enough for ${suggestedMin}+ minutes, or consider a series.`,
    };
  }

  return { shouldReconsider: false, suggestion: '' };
}
