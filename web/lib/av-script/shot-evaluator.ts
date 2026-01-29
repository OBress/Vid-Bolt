/**
 * Shot Evaluator
 * ============================================================================
 * Gemini 3 Flash evaluation logic for stock media matching.
 * 
 * Responsibilities:
 * - Evaluate if a stock media candidate fits a shot narratively and technically
 * - Decide fallback type (motiongraphic vs ai_generated) when no match exists
 */

import { generateJSON } from '@/lib/ai/openrouter';
import type { ShotPart1 } from '@/lib/queues/workers/av-script';
import type { ShotContext, StockMediaCandidate } from './stock-media-director';

// ============================================================================
// TYPES
// ============================================================================

export interface ShotEvaluationResult {
  isGoodMatch: boolean;
  narrativeFit: number;      // 1-10
  technicalFit: number;      // 1-10
  confidence: number;        // 0-1
  reasoning: string;
}

export interface FallbackDecision {
  fallbackType: 'motiongraphic' | 'ai_generated';
  reasoning: string;
}

// ============================================================================
// PROMPTS
// ============================================================================

const EVALUATION_SYSTEM_PROMPT = `You are a professional movie director evaluating stock media for video scenes.

Your role is to determine if a stock media asset is suitable for a specific shot, considering:
1. Narrative fit: Does it support the story being told?
2. Technical fit: Is it high quality and properly formatted?

STOCK MEDIA IS BEST FOR (be generous with these):
- Famous people (celebrities, politicians, CEOs, historical figures)
- Iconic landmarks (Eiffel Tower, Times Square, Statue of Liberty)
- Common universal concepts (handshake, teamwork, celebration, nature)
- Historical footage or documentary-style shots
- Simple, recognizable subjects

AVOID STOCK MEDIA FOR (reject these):
- Complex multi-subject scenes requiring specific composition
- Fictional scenarios or abstract concepts
- Scenes with very specific requirements not met by the candidate
- Low similarity or poor metadata match

SCORING CRITERIA:
- NARRATIVE FIT (1-10):
  - 10: Perfect match for subjects, mood, and context
  - 7-9: Good match with minor differences
  - 4-6: Partial match, could work with compromise
  - 1-3: Poor match, would confuse viewers

- TECHNICAL FIT (1-10):
  - 10: Perfect resolution, aspect ratio, no artifacts
  - 7-9: Good quality, minor imperfections
  - 4-6: Acceptable but not ideal
  - 1-3: Poor quality, watermarks, or wrong format

DECISION RULE:
- Accept if BOTH narrative >= 7 AND technical >= 7
- For famous people/landmarks, be more lenient (narrative >= 6 is OK)
- Reject otherwise

Return JSON only. No markdown, no explanation outside JSON.`;

const FALLBACK_SYSTEM_PROMPT = `You are a premium documentary director choosing the best visual approach.

**"ai_generated"** - Cinematic AI scene
A single continuous moment. One camera, one subject, one atmosphere.
Best when the power is in WATCHING something unfold.
Creates atmosphere through cinematography: lighting, depth, motion.

**"motiongraphic"** - Composed visual storytelling
Multiple elements working together. Images, text, graphics, annotations.
Best when the power is in RELATIONSHIPS - connecting ideas, revealing patterns.
Examples: crime boards linking suspects, highlighted articles, visual evidence displays.

Ask: "Is this a SINGLE SCENE or a COMPOSITION of elements?"
Both can be atmospheric. Choose based on what makes the moment most powerful.

Return JSON only.`;

// ============================================================================
// EVALUATION FUNCTION
// ============================================================================

/**
 * Evaluate if a stock media candidate is a good match for a shot.
 */
export async function evaluateShotMatch(
  userId: string,
  context: ShotContext,
  candidate: StockMediaCandidate
): Promise<ShotEvaluationResult> {
  const { shot, previousShots, nextShots, totalShots, index } = context;

  // Build context strings
  const previousContext = previousShots.length > 0
    ? previousShots.map((s, i) => `[${index - previousShots.length + i}] ${s.summary || s.text.substring(0, 80)}`).join('\n')
    : '(None - this is the beginning)';

  const nextContext = nextShots.length > 0
    ? nextShots.map((s, i) => `[${index + 1 + i}] ${s.summary || s.text.substring(0, 80)}`).join('\n')
    : '(None - this is the end)';

  const userPrompt = `SCENE ${index + 1}/${totalShots}:
- Summary: ${shot.summary || 'N/A'}
- Narration: ${shot.text.substring(0, 200)}
- Content Type: ${shot.content_type}
- Duration: ${shot.duration_seconds.toFixed(1)}s

PREVIOUS SCENES:
${previousContext}

NEXT SCENES:
${nextContext}

STOCK MEDIA CANDIDATE:
- Description: ${candidate.description}
- Subjects: ${candidate.subjects?.join(', ') || 'Unknown'}
- Mood: ${candidate.mood || 'Unknown'}
- Type: ${candidate.mediaType}
- Source: ${candidate.source}

Evaluate this candidate and return JSON:
{
  "narrativeFit": number (1-10),
  "technicalFit": number (1-10),
  "isGoodMatch": boolean,
  "confidence": number (0-1),
  "reasoning": "brief explanation"
}`;

  try {
    const result = await generateJSON<{
      narrativeFit: number;
      technicalFit: number;
      isGoodMatch: boolean;
      confidence: number;
      reasoning: string;
    }>(userId, EVALUATION_SYSTEM_PROMPT, userPrompt);

    // Validate and normalize the result
    const narrativeFit = Math.min(10, Math.max(1, result.narrativeFit || 1));
    const technicalFit = Math.min(10, Math.max(1, result.technicalFit || 1));
    const isGoodMatch = result.isGoodMatch ?? (narrativeFit >= 7 && technicalFit >= 7);

    return {
      narrativeFit,
      technicalFit,
      isGoodMatch,
      confidence: Math.min(1, Math.max(0, result.confidence || 0.5)),
      reasoning: result.reasoning || 'No reasoning provided',
    };
  } catch (error) {
    console.warn('[ShotEvaluator] Gemini evaluation failed:', error);
    
    // Fallback: use similarity score as proxy
    // If similarity is very high (>= 0.95), assume it's a good match
    const fallbackMatch = candidate.similarity >= 0.95;
    return {
      narrativeFit: fallbackMatch ? 8 : 5,
      technicalFit: fallbackMatch ? 8 : 5,
      isGoodMatch: fallbackMatch,
      confidence: 0.3,
      reasoning: `Evaluation failed, using similarity fallback (${candidate.similarity.toFixed(2)})`,
    };
  }
}

// ============================================================================
// FALLBACK DECISION FUNCTION
// ============================================================================

/**
 * Decide whether to use motiongraphic or ai_generated for a shot without stock media.
 */
export async function decideFallbackType(
  userId: string,
  shot: ShotPart1
): Promise<'motiongraphic' | 'ai_generated'> {
  const userPrompt = `SCENE:
- Summary: ${shot.summary || 'N/A'}
- Content Type: ${shot.content_type}
- Narration: ${shot.text.substring(0, 200)}
- Duration: ${shot.duration_seconds.toFixed(1)}s

Choose the best visual approach for this scene:

Return JSON:
{
  "fallbackType": "motiongraphic" | "ai_generated",
  "reasoning": "brief explanation"
}`;

  try {
    const result = await generateJSON<FallbackDecision>(
      userId,
      FALLBACK_SYSTEM_PROMPT,
      userPrompt
    );

    // Validate the result
    if (result.fallbackType === 'motiongraphic' || result.fallbackType === 'ai_generated') {
      return result.fallbackType;
    }

    // Invalid response - use content type heuristic
    return getFallbackFromContentType(shot.content_type);
  } catch (error) {
    console.warn('[ShotEvaluator] Fallback decision failed:', error);
    
    // Use content type heuristic as fallback
    return getFallbackFromContentType(shot.content_type);
  }
}

/**
 * Heuristic fallback based on content type when AI fails.
 * Defaults to ai_generated (cinematic) - motiongraphic only for data/layout types.
 */
function getFallbackFromContentType(contentType: string): 'motiongraphic' | 'ai_generated' {
  switch (contentType) {
    case 'list-item':
    case 'comparison':
      // These content types benefit from structured layouts
      return 'motiongraphic';
    case 'concept':
    case 'transition':
    case 'emotional-beat':
    default:
      // Default to cinematic AI video for everything else
      return 'ai_generated';
  }
}

// ============================================================================
// BATCH EVALUATION (for potential future optimization)
// ============================================================================

/**
 * Batch evaluate multiple shots with their candidates.
 * Currently unused but provides a path for future optimization.
 */
export async function batchEvaluateShots(
  userId: string,
  evaluations: Array<{
    context: ShotContext;
    candidate: StockMediaCandidate;
  }>
): Promise<ShotEvaluationResult[]> {
  // For now, parallel individual evaluations
  // Could be optimized with a single batched Gemini call in the future
  const promises = evaluations.map(({ context, candidate }) =>
    evaluateShotMatch(userId, context, candidate)
  );

  return Promise.all(promises);
}
