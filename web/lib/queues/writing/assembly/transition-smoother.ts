/**
 * Transition Smoother
 * ============================================================================
 * Analyzes and improves transitions between beats after all beats are expanded.
 * Uses Gemini 3 Pro to detect and fix rigid/awkward transitions.
 */

import { generateJSON, type OpenRouterConfig } from '@/lib/ai/openrouter';
import type { ExpandedBeat, Spine } from '../types';
import { countWords } from '../utils';

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Model for transition analysis */
const TRANSITION_MODEL = 'google/gemini-3-pro-preview';

/** Minimum score for a transition to pass */
const TRANSITION_PASS_THRESHOLD = 7;

// ============================================================================
// TYPES
// ============================================================================

export interface TransitionAnalysis {
  beatPair: [number, number];
  score: number;
  smoothness: number;
  continuity: number;
  energyFlow: number;
  issues: string[];
  needsFix: boolean;
  suggestedEndingRewrite?: string;
  suggestedOpeningRewrite?: string;
}

export interface TransitionSmoothingResult {
  smoothedBeats: ExpandedBeat[];
  transitionsFixed: number;
  averageTransitionScore: number;
}

// ============================================================================
// PROMPTS
// ============================================================================

const TRANSITION_ANALYSIS_PROMPT = `Analyze the transition between these two consecutive beats in a YouTube documentary script.

BEAT {n} ENDING:
"{beatEnding}"

BEAT {n+1} OPENING:
"{beatOpening}"

## SCORING CRITERIA (each 1-10):
- SMOOTHNESS: Does it flow naturally? No jarring breaks or abrupt topic shifts?
- CONTINUITY: Is there a logical connection? Does it feel like one continuous narrative?
- ENERGY_FLOW: Is the energy shift appropriate? Too abrupt feels jarring, too similar feels monotonous.

## PATTERN DETECTION (flag these issues):
- Repetitive transition phrases: "But that's not all...", "Meanwhile...", "However...", "And yet..."
- Both sections starting with the same word or phrase
- Abrupt topic changes without bridging language
- Energy level jump of more than 2 levels (e.g., somber directly to excited)
- Ending on a complete thought with no forward momentum
- Opening that ignores what just happened

## DOCUMENTARY-SPECIFIC CHECKS:
- Does the ending create curiosity for what's next?
- Does the opening feel like a natural continuation?
- Is there implicit temporal or causal linkage?
- Would a viewer feel satisfied by the flow when listening?

Return ONLY valid JSON:
{
  "score": 7,
  "smoothness": 7,
  "continuity": 8,
  "energyFlow": 6,
  "issues": ["specific issue 1", "specific issue 2"],
  "needsFix": true,
  "suggestedEndingRewrite": "Improved last 1-2 sentences for beat {n}",
  "suggestedOpeningRewrite": "Improved first 1-2 sentences for beat {n+1}"
}

If the transition scores 7+ overall, set needsFix to false and omit rewrites.`;

const TRANSITION_REWRITE_PROMPT = `You are a documentary script editor smoothing the transition between two beats.

CONTEXT: This transition connects Beat {n} to Beat {n+1} in a YouTube video.

CURRENT ENDING (Beat {n}):
"{currentEnding}"

CURRENT OPENING (Beat {n+1}):
"{currentOpening}"

ISSUES TO FIX:
{issues}

## REWRITE RULES:
1. Preserve all facts, names, and key information exactly
2. Create a sense of forward momentum at the ending
3. Make the opening feel like a natural continuation (not a reset)
4. Keep approximately the same word count
5. Vary sentence structure between ending and opening
6. Use transitional logic (temporal, causal, or thematic) not transitional phrases
7. Write for the EAR - this will be spoken aloud
8. NEVER use: "But that's not all...", "Meanwhile...", "Moving on...", "Now let's..."

Return JSON only:
{
  "rewrittenEnding": "New ending sentences for beat {n}",
  "rewrittenOpening": "New opening sentences for beat {n+1}"
}`;

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Smooth transitions between all expanded beats
 */
export async function smoothTransitions(
  userId: string,
  expandedBeats: ExpandedBeat[],
  spine: Spine
): Promise<TransitionSmoothingResult> {
  console.log(`[TransitionSmoother] Analyzing ${expandedBeats.length - 1} transitions...`);

  if (expandedBeats.length < 2) {
    return {
      smoothedBeats: expandedBeats,
      transitionsFixed: 0,
      averageTransitionScore: 10,
    };
  }

  // Clone beats to avoid mutating originals
  const smoothedBeats = expandedBeats.map(beat => ({ ...beat }));
  const analyses: TransitionAnalysis[] = [];
  let transitionsFixed = 0;

  // Analyze each transition
  for (let i = 0; i < smoothedBeats.length - 1; i++) {
    const currentBeat = smoothedBeats[i];
    const nextBeat = smoothedBeats[i + 1];

    try {
      // Get last 2 sentences of current beat
      const beatEnding = extractLastSentences(currentBeat.narration, 2);
      // Get first 2 sentences of next beat
      const beatOpening = extractFirstSentences(nextBeat.narration, 2);

      // Analyze the transition
      const analysis = await analyzeTransition(
        userId,
        i,
        beatEnding,
        beatOpening
      );

      analyses.push(analysis);

      // Fix if needed
      if (analysis.needsFix) {
        console.log(`[TransitionSmoother] Fixing transition ${i + 1} → ${i + 2} (score: ${analysis.score}/10)`);

        const fixed = await fixTransition(
          userId,
          i,
          beatEnding,
          beatOpening,
          analysis.issues
        );

        if (fixed) {
          // Apply rewrites
          smoothedBeats[i] = {
            ...smoothedBeats[i],
            narration: replaceEnding(currentBeat.narration, beatEnding, fixed.rewrittenEnding),
            wordCount: countWords(replaceEnding(currentBeat.narration, beatEnding, fixed.rewrittenEnding)),
          };

          smoothedBeats[i + 1] = {
            ...smoothedBeats[i + 1],
            narration: replaceOpening(nextBeat.narration, beatOpening, fixed.rewrittenOpening),
            wordCount: countWords(replaceOpening(nextBeat.narration, beatOpening, fixed.rewrittenOpening)),
          };

          transitionsFixed++;
        }
      }
    } catch (error) {
      console.error(`[TransitionSmoother] Error analyzing transition ${i + 1} → ${i + 2}:`, error);
    }
  }

  // Calculate average score
  const averageTransitionScore = analyses.length > 0
    ? analyses.reduce((sum, a) => sum + a.score, 0) / analyses.length
    : 10;

  console.log(`[TransitionSmoother] Complete: ${transitionsFixed} transitions fixed, avg score: ${averageTransitionScore.toFixed(1)}/10`);

  return {
    smoothedBeats,
    transitionsFixed,
    averageTransitionScore,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Analyze a single transition
 */
async function analyzeTransition(
  userId: string,
  beatIndex: number,
  beatEnding: string,
  beatOpening: string
): Promise<TransitionAnalysis> {
  const prompt = TRANSITION_ANALYSIS_PROMPT
    .replace(/{n}/g, String(beatIndex + 1))
    .replace('{beatEnding}', beatEnding)
    .replace('{beatOpening}', beatOpening);

  try {
    const config: OpenRouterConfig = {
      model: TRANSITION_MODEL,
      temperature: 0.3,
    };

    const response = await generateJSON<TransitionAnalysis>(
      userId,
      'Analyze script transitions for quality.',
      prompt,
      config
    );

    return {
      ...response,
      beatPair: [beatIndex, beatIndex + 1],
      needsFix: response.score < TRANSITION_PASS_THRESHOLD,
    };
  } catch (error) {
    console.error(`[TransitionSmoother] Analysis failed:`, error);
    return {
      beatPair: [beatIndex, beatIndex + 1],
      score: 7,
      smoothness: 7,
      continuity: 7,
      energyFlow: 7,
      issues: [],
      needsFix: false,
    };
  }
}

/**
 * Fix a problematic transition
 */
async function fixTransition(
  userId: string,
  beatIndex: number,
  currentEnding: string,
  currentOpening: string,
  issues: string[]
): Promise<{ rewrittenEnding: string; rewrittenOpening: string } | null> {
  const prompt = TRANSITION_REWRITE_PROMPT
    .replace(/{n}/g, String(beatIndex + 1))
    .replace('{currentEnding}', currentEnding)
    .replace('{currentOpening}', currentOpening)
    .replace('{issues}', issues.join('\n'));

  try {
    const config: OpenRouterConfig = {
      model: TRANSITION_MODEL,
      temperature: 0.6,
    };

    return await generateJSON<{ rewrittenEnding: string; rewrittenOpening: string }>(
      userId,
      'Rewrite script transitions for smooth flow.',
      prompt,
      config
    );
  } catch (error) {
    console.error(`[TransitionSmoother] Rewrite failed:`, error);
    return null;
  }
}

/**
 * Extract last N sentences from text
 */
function extractLastSentences(text: string, count: number): string {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim());
  return sentences.slice(-count).join(' ');
}

/**
 * Extract first N sentences from text
 */
function extractFirstSentences(text: string, count: number): string {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim());
  return sentences.slice(0, count).join(' ');
}

/**
 * Replace ending sentences in narration
 */
function replaceEnding(narration: string, oldEnding: string, newEnding: string): string {
  const endingStart = narration.lastIndexOf(oldEnding.split(' ')[0]);
  if (endingStart === -1) return narration;
  
  return narration.substring(0, endingStart) + newEnding;
}

/**
 * Replace opening sentences in narration
 */
function replaceOpening(narration: string, oldOpening: string, newOpening: string): string {
  const openingFirstWord = oldOpening.split(' ')[0];
  const firstWordIndex = narration.indexOf(openingFirstWord);
  
  if (firstWordIndex === -1 || firstWordIndex > 50) return narration;
  
  // Find end of old opening
  const openingEnd = narration.indexOf(oldOpening) + oldOpening.length;
  if (openingEnd <= oldOpening.length) return narration;
  
  return newOpening + narration.substring(openingEnd);
}
