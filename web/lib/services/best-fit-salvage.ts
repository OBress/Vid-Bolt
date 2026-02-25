/**
 * Best-Fit Salvage Service
 * ============================================================================
 * When a shot fails verification 3 times, this utility selects the best
 * attempt from the failed results and flags it for human review.
 *
 * The pipeline never halts — worst case, the user sees a flagged shot in
 * the Video Editor V2 and fixes it manually.
 *
 * Ranking criteria:
 *   1. Number of passing dimensions (more = better)
 *   2. Recoverable failures preferred over fundamental
 *   3. Higher confidence score preferred
 */

import type { VerifierResult } from '@/lib/queues/workers/verifier';

// ============================================================================
// TYPES
// ============================================================================

export interface SalvageAttempt {
  /** The generated media URL */
  mediaUrl: string;
  /** The verifier's result for this attempt */
  verifierResult: VerifierResult;
  /** Which attempt number this was (1-based) */
  attemptNumber: number;
}

export interface SalvageDecision {
  /** The best media URL from all attempts */
  bestMediaUrl: string;
  /** The verifier result for the chosen attempt */
  bestResult: VerifierResult;
  /** Which attempt was selected (1-based) */
  selectedAttempt: number;
  /** Human-readable reason for the selection */
  reason: string;
  /** Structured flag for user review */
  flag: {
    shotIndex: number;
    issue: string;
    suggestions: string[];
    allAttemptUrls: string[];
  };
}

// ============================================================================
// SCORING
// ============================================================================

const DIMENSION_KEYS = [
  'semantic_alignment',
  'entity_consistency',
  'temporal_continuity',
  'visual_quality',
  'style_consistency',
] as const;

/**
 * Score a verifier result for ranking.
 * Higher score = better result.
 */
function scoreResult(result: VerifierResult): number {
  let score = 0;

  // +2 for each dimension that doesn't contain negative keywords
  for (const key of DIMENSION_KEYS) {
    const feedback = result.dimension_feedback[key].toLowerCase();
    const isNegative = feedback.includes('fail') ||
      feedback.includes('mismatch') ||
      feedback.includes('wrong') ||
      feedback.includes('artifact') ||
      feedback.includes('error') ||
      feedback.includes('missing');

    if (!isNegative) {
      score += 2;
    }
  }

  // +3 for recoverable (fixable by user) vs fundamental
  if (result.failure_type === 'recoverable') {
    score += 3;
  }

  // +confidence (0-1 range, contributes up to 1 point)
  score += result.confidence;

  // +1 if verdict is PASS (shouldn't normally happen in salvage, but handle edge case)
  if (result.verdict === 'PASS') {
    score += 5;
  }

  return score;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Select the best attempt from multiple failed verification results.
 */
export function selectBestFitSalvage(
  shotIndex: number,
  attempts: SalvageAttempt[]
): SalvageDecision {
  if (attempts.length === 0) {
    throw new Error('No attempts to salvage from');
  }

  // Score and rank all attempts
  const ranked = attempts
    .map((attempt) => ({
      ...attempt,
      score: scoreResult(attempt.verifierResult),
    }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];

  // Build human-readable reason
  const passingDimensions = DIMENSION_KEYS.filter((key) => {
    const feedback = best.verifierResult.dimension_feedback[key].toLowerCase();
    return !feedback.includes('fail') && !feedback.includes('mismatch') && !feedback.includes('wrong');
  });

  const reason = `Selected attempt ${best.attemptNumber} (score: ${best.score.toFixed(1)}). ` +
    `${passingDimensions.length}/${DIMENSION_KEYS.length} dimensions acceptable. ` +
    `Failure type: ${best.verifierResult.failure_type || 'unknown'}.`;

  // Collect all corrections from all attempts for comprehensive suggestions
  const allSuggestions = [...new Set(
    attempts.flatMap((a) => a.verifierResult.suggested_corrections)
  )];

  return {
    bestMediaUrl: best.mediaUrl,
    bestResult: best.verifierResult,
    selectedAttempt: best.attemptNumber,
    reason,
    flag: {
      shotIndex,
      issue: `Shot ${shotIndex + 1} failed verification ${attempts.length}x. ` +
        `Best attempt accepted with ${passingDimensions.length}/${DIMENSION_KEYS.length} passing dimensions. ` +
        `Review recommended.`,
      suggestions: allSuggestions,
      allAttemptUrls: attempts.map((a) => a.mediaUrl),
    },
  };
}
