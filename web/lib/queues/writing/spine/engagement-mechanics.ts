/**
 * Engagement Mechanics
 * ============================================================================
 * Manages open/close loops, pattern interrupts, callbacks, and energy curve.
 */

import type { Beat } from '../types';
import { ENGAGEMENT_TIMING } from '../config';
import type { BeatSpec } from './beat-types';

// ============================================================================
// TYPES
// ============================================================================

export interface EngagementValidation {
  /** Whether there's a hook in the first beat */
  hasHook: boolean;
  /** Whether commitment is established early */
  hasCommitment: boolean;
  /** Unclosed loops */
  unclosedLoops: Array<{ loopId: string; openedAtBeatIndex: number }>;
  /** Gaps without pattern interrupts */
  patternInterruptGaps: Array<{ startBeatIndex: number; endBeatIndex: number; gapSeconds: number }>;
  /** Consecutive same-energy beats */
  energyViolations: number[];
  /** Overall engagement score (0-100) */
  score: number;
}

// ============================================================================
// ENGAGEMENT ANCHOR ASSIGNMENT
// ============================================================================

/**
 * Assign engagement anchors to beat specifications.
 * 
 * This ensures required engagement mechanics are placed:
 * - Hook at beat 0
 * - Pattern interrupts every 2-3 minutes
 * - Open/close loops for curiosity
 * - Climax at ~75-80%
 */
export function assignEngagementAnchors(
  beatSpecs: BeatSpec[],
  totalDurationSeconds: number
): BeatSpec[] {
  const beats = [...beatSpecs];
  const beatDuration = totalDurationSeconds / beats.length;

  // 1. Ensure hook at beat 0
  if (beats.length > 0 && beats[0].type !== 'hook') {
    beats[0] = { ...beats[0], type: 'hook' };
  }

  // 2. Assign pattern interrupts at regular intervals
  const patternInterruptInterval = ENGAGEMENT_TIMING.patternInterruptIntervalSeconds;
  let lastInterruptTime = 0;
  let loopCounter = 1;

  for (let i = 1; i < beats.length - 1; i++) {
    const beatStartTime = i * beatDuration;
    const timeSinceLastInterrupt = beatStartTime - lastInterruptTime;

    // Add pattern interrupt if it's been too long
    if (timeSinceLastInterrupt >= patternInterruptInterval) {
      if (!beats[i].isPatternInterrupt && beats[i].type !== 'pattern_interrupt') {
        beats[i] = { 
          ...beats[i], 
          isPatternInterrupt: true,
        };
      }
      lastInterruptTime = beatStartTime;
    }

    // Add open loops in early beats (first 30%)
    const position = i / beats.length;
    if (position < 0.3 && position > 0.05 && !beats[i].opensLoop) {
      // Open a loop every few beats in the first third
      if (i % 3 === 0) {
        beats[i] = {
          ...beats[i],
          opensLoop: true,
          loopId: `LOOP-${loopCounter}`,
        };
        loopCounter++;
      }
    }
  }

  // 3. Close loops before resolution
  const openLoopIds = beats
    .filter(b => b.opensLoop && b.loopId)
    .map(b => b.loopId!);

  const resolutionStartIndex = Math.floor(beats.length * ENGAGEMENT_TIMING.resolutionPosition);
  let loopCloseIndex = resolutionStartIndex - 1;

  for (const loopId of openLoopIds) {
    if (loopCloseIndex > 0 && loopCloseIndex < beats.length) {
      // Find a beat that doesn't already close a loop
      while (loopCloseIndex > 0 && beats[loopCloseIndex].closesLoop) {
        loopCloseIndex--;
      }
      
      if (loopCloseIndex > 0) {
        beats[loopCloseIndex] = {
          ...beats[loopCloseIndex],
          closesLoop: true,
          loopId,
        };
        loopCloseIndex--;
      }
    }
  }

  // 4. Ensure climax exists around 75-80%
  const climaxPosition = Math.floor(beats.length * ENGAGEMENT_TIMING.climaxPosition);
  if (climaxPosition > 0 && climaxPosition < beats.length) {
    if (!beats.some(b => b.type === 'climax')) {
      beats[climaxPosition] = { ...beats[climaxPosition], type: 'climax' };
    }
  }

  // 5. Ensure resolution at the end
  const lastBeatIndex = beats.length - 1;
  if (lastBeatIndex > 0 && beats[lastBeatIndex].type !== 'resolution') {
    beats[lastBeatIndex] = { ...beats[lastBeatIndex], type: 'resolution' };
  }

  return beats;
}

// ============================================================================
// ENGAGEMENT VALIDATION
// ============================================================================

/**
 * Validate engagement mechanics in a spine
 */
export function validateEngagementMechanics(
  beats: Beat[],
  totalDurationSeconds: number
): EngagementValidation {
  const beatDuration = totalDurationSeconds / beats.length;

  // Check for hook
  const hasHook = beats.length > 0 && (
    beats[0].classification.type === 'hook' ||
    beats[0].timing.startSeconds < ENGAGEMENT_TIMING.hookDeadlineSeconds
  );

  // Check for commitment (setup in first 30 seconds)
  const hasCommitment = beats.some(b => 
    b.timing.startSeconds < ENGAGEMENT_TIMING.commitmentDeadlineSeconds &&
    (b.classification.type === 'setup' || b.classification.engagementFunction.toLowerCase().includes('value'))
  );

  // Find unclosed loops
  const openLoops = new Map<string, number>();
  const closedLoops = new Set<string>();

  for (let i = 0; i < beats.length; i++) {
    const beat = beats[i];
    if (beat.engagement.opensLoop && beat.engagement.loopId) {
      openLoops.set(beat.engagement.loopId, i);
    }
    if (beat.engagement.closesLoop && beat.engagement.loopId) {
      closedLoops.add(beat.engagement.loopId);
    }
  }

  const unclosedLoops = Array.from(openLoops.entries())
    .filter(([loopId]) => !closedLoops.has(loopId))
    .map(([loopId, openedAtBeatIndex]) => ({ loopId, openedAtBeatIndex }));

  // Find pattern interrupt gaps
  const patternInterruptGaps = findPatternInterruptGaps(beats, beatDuration);

  // Find energy violations (too many consecutive same-energy beats)
  const energyViolations = findEnergyViolations(beats);

  // Calculate overall score
  const score = calculateEngagementScore({
    hasHook,
    hasCommitment,
    unclosedLoops,
    patternInterruptGaps,
    energyViolations,
    beatCount: beats.length,
  });

  return {
    hasHook,
    hasCommitment,
    unclosedLoops,
    patternInterruptGaps,
    energyViolations,
    score,
  };
}

/**
 * Find gaps without pattern interrupts
 */
function findPatternInterruptGaps(
  beats: Beat[],
  beatDuration: number
): EngagementValidation['patternInterruptGaps'] {
  const gaps: EngagementValidation['patternInterruptGaps'] = [];
  const maxGapSeconds = ENGAGEMENT_TIMING.patternInterruptIntervalSeconds * 1.2; // 20% tolerance

  let lastInterruptIndex = 0;

  for (let i = 1; i < beats.length; i++) {
    const beat = beats[i];
    
    if (
      beat.engagement.isPatternInterrupt ||
      beat.classification.type === 'pattern_interrupt' ||
      beat.classification.type === 'hook' ||
      beat.classification.type === 'climax'
    ) {
      const gapSeconds = (i - lastInterruptIndex) * beatDuration;
      
      if (gapSeconds > maxGapSeconds) {
        gaps.push({
          startBeatIndex: lastInterruptIndex,
          endBeatIndex: i,
          gapSeconds,
        });
      }
      
      lastInterruptIndex = i;
    }
  }

  return gaps;
}

/**
 * Find consecutive same-energy beats (violation of variety)
 */
function findEnergyViolations(beats: Beat[]): number[] {
  const violations: number[] = [];
  let consecutiveSameEnergy = 1;

  for (let i = 1; i < beats.length; i++) {
    if (beats[i].toneEnergy.energyRelativeToPrevious === 'same') {
      consecutiveSameEnergy++;
      
      if (consecutiveSameEnergy > 2) { // More than 2 same-energy beats in a row
        violations.push(i);
      }
    } else {
      consecutiveSameEnergy = 1;
    }
  }

  return violations;
}

/**
 * Calculate overall engagement score
 */
function calculateEngagementScore(params: {
  hasHook: boolean;
  hasCommitment: boolean;
  unclosedLoops: EngagementValidation['unclosedLoops'];
  patternInterruptGaps: EngagementValidation['patternInterruptGaps'];
  energyViolations: number[];
  beatCount: number;
}): number {
  let score = 100;

  // Hook is critical
  if (!params.hasHook) score -= 20;

  // Commitment is important
  if (!params.hasCommitment) score -= 15;

  // Unclosed loops are problematic
  score -= params.unclosedLoops.length * 5;

  // Pattern interrupt gaps hurt retention
  score -= params.patternInterruptGaps.length * 10;

  // Energy violations cause boredom
  score -= params.energyViolations.length * 3;

  return Math.max(0, Math.min(100, score));
}

// ============================================================================
// LOOP MANAGEMENT
// ============================================================================

/**
 * Generate a unique loop ID
 */
export function generateLoopId(index: number): string {
  return `LOOP-${String(index + 1).padStart(3, '0')}`;
}

/**
 * Check if all loops are closed by a given position
 */
export function areLoopsClosedByPosition(
  beats: Beat[],
  positionRatio: number
): boolean {
  const checkUntilIndex = Math.floor(beats.length * positionRatio);
  
  const openedBefore = new Set<string>();
  const closedBefore = new Set<string>();

  for (let i = 0; i < checkUntilIndex; i++) {
    const beat = beats[i];
    if (beat.engagement.opensLoop && beat.engagement.loopId) {
      openedBefore.add(beat.engagement.loopId);
    }
    if (beat.engagement.closesLoop && beat.engagement.loopId) {
      closedBefore.add(beat.engagement.loopId);
    }
  }

  // Check if all opened loops are closed
  for (const loopId of openedBefore) {
    if (!closedBefore.has(loopId)) {
      return false;
    }
  }

  return true;
}
