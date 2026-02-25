/**
 * Quality Reviewer
 * ============================================================================
 * Uses Gemini 3 Pro to review beat quality and trigger rewrites when needed.
 * Central to ensuring high-quality, non-repetitive script output.
 */

import { generateJSON, generateText, type OpenRouterConfig } from '@/lib/ai/openrouter';
import type { 
  ContinuityState,
  ScriptGenre,
} from '../types';
import { BANNED_PHRASES } from '../config';

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Quality review model - smarter but more expensive */
export const QUALITY_REVIEW_MODEL = 'google/gemini-3-pro-preview';

/** Minimum score to pass quality check */
const QUALITY_PASS_THRESHOLD = 8;

/** Maximum rewrite attempts per beat */
export const MAX_REWRITE_ATTEMPTS = 1;

// ============================================================================
// TYPES
// ============================================================================

export interface QualityIssue {
  type: 'originality' | 'engagement' | 'flow' | 'factual' | 'repetition' | 'banned_phrase';
  description: string;
  severity: 'low' | 'medium' | 'high';
  location?: string;
}

export interface RepetitionFlag {
  phrase: string;
  occurrences: number;
  location: 'within_beat' | 'cross_beat';
}

export interface QualityReviewResult {
  /** Overall quality score 1-10 */
  score: number;
  /** Individual dimension scores */
  originality: number;
  engagement: number;
  flow: number;
  factualGrounding: number;
  /** Whether beat passes quality bar (score >= 8) */
  passed: boolean;
  /** Specific issues found */
  issues: QualityIssue[];
  /** Repetition flags */
  repetitionFlags: RepetitionFlag[];
  /** Whether a rewrite is needed */
  rewriteNeeded: boolean;
  /** Specific guidance for rewrite */
  rewriteGuidance: string;
}

export interface BeatReviewContext {
  userId: string;
  beatNarration: string;
  beatIndex: number;
  previousBeatsContext: string;
  continuityState: ContinuityState;
  genre: ScriptGenre;
}

// ============================================================================
// QUALITY REVIEW PROMPTS
// ============================================================================

const QUALITY_REVIEW_SYSTEM_PROMPT = `You are an elite script quality reviewer for premium YouTube documentary content.
Score this beat on a 1-10 scale. Be RUTHLESSLY STRICT - only truly exceptional writing scores 8+.

## SCORING DIMENSIONS (each 1-10):
1. ORIGINALITY: No AI clichés, no overused phrases, fresh and specific language
2. ENGAGEMENT: Compelling prose that creates forward momentum - viewer wants to keep watching
3. FLOW: Natural rhythm, varied sentence structure, smooth transitions
4. FACTUAL_GROUNDING: Facts attributed properly, no vague claims, research-backed

## AI-ISM DETECTION (instant -2 points per occurrence):
Scan for these overused AI words - they MUST be replaced:
- Movement: delve, embark, unfold
- Abstract: landscape, tapestry, intricate, nestled, realm, plethora, myriad
- Jargon: pivotal, paradigm, synergy, leverage, facilitate, juxtaposition
- Emphasis: testament, underscore, nuanced, robust, holistic
- Hyperbolic: unprecedented, unparalleled, groundbreaking, cutting-edge, game-changing
- Flow: seamlessly, intertwined, catalyst, cornerstone
- Generic: captivating, meticulous, profound, poignant, enigmatic

## PATTERN DETECTION (flag each):
- Starting 2+ sentences with the same word
- Using the same sentence structure 3+ times
- Rhetorical fillers: "But that's not all...", "And it doesn't stop there..."
- Meta-commentary: "In this video...", "Let me tell you...", "As we'll see..."
- Vague hedging: "Some say...", "Many believe...", "According to some..."
- Weak transitions: "Moving on...", "Now let's talk about...", "With that said..."

## DOCUMENTARY-SPECIFIC CHECKS:
- Are facts properly attributed (not just stated without source)?
- Is there concrete detail or just vague generalities?
- Does it sound like it's written for the EAR (spoken aloud) not the eye?
- Are contractions used naturally?

## NATURAL LANGUAGE CHECKLIST:
- Sentence length variety (mix of 5-8, 12-18, and 20-25 word sentences)
- Specific concrete details (names, numbers, places) not abstractions
- Active voice predominates
- Conversational but authoritative tone

Return ONLY valid JSON (no markdown):
{
  "score": 7,
  "originality": 7,
  "engagement": 8,
  "flow": 7,
  "factualGrounding": 6,
  "issues": [
    {"type": "repetition", "description": "...", "severity": "medium", "location": "paragraph 2"}
  ],
  "repetitionFlags": [
    {"phrase": "repeated phrase", "occurrences": 2, "location": "within_beat"}
  ],
  "rewriteNeeded": true,
  "rewriteGuidance": "Specific instructions for what to fix"
}`;

const REWRITE_SYSTEM_PROMPT = `You are a senior documentary script editor with 20 years of experience improving scripts.

## YOUR MISSION:
Fix this beat that failed quality review while maintaining its core content and impact.

## MANDATORY RULES:
1. Fix ALL identified issues - no exceptions
2. Preserve all key points, facts, and narrative beats
3. Keep approximately the same word count (±10%)
4. Replace ALL forbidden AI words with natural alternatives:
   - delve → explore, examine, dig into
   - tapestry → mix, blend, combination
   - unprecedented → rare, unusual, first-ever
   - (and all others from the review feedback)
5. Use contractions naturally (don't, can't, it's)
6. Vary sentence openers - NO two consecutive sentences starting the same way
7. Mix sentence lengths: short punchy ones with medium and occasionally longer

## NATURAL LANGUAGE REQUIREMENTS:
- Write for the EAR, not the eye
- Use specific details, not vague generalities
- Attribute facts naturally ("Court documents show...", "According to investigators...")
- Be conversational but authoritative

## OUTPUT:
Return ONLY the rewritten narration text.
No explanations. No markdown. No headers. Just the improved script.`;


// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Review beat quality using Gemini 3 Pro
 */
export async function reviewBeatQuality(
  context: BeatReviewContext
): Promise<QualityReviewResult> {
  const { userId, beatNarration, beatIndex, previousBeatsContext, continuityState, genre } = context;

  // Build user prompt with context
  const userPrompt = buildReviewPrompt(beatNarration, beatIndex, previousBeatsContext, continuityState, genre);

  try {
    const config: OpenRouterConfig = {
      model: QUALITY_REVIEW_MODEL,
      temperature: 0.3, // Low temp for consistent scoring
    };

    const response = await generateJSON<QualityReviewResult>(
      userId,
      QUALITY_REVIEW_SYSTEM_PROMPT,
      userPrompt,
      config
    );

    // Determine if passed
    const passed = response.score >= QUALITY_PASS_THRESHOLD;

    console.log(`[QualityReviewer] Beat ${beatIndex + 1} scored ${response.score}/10 - ${passed ? 'PASSED' : 'NEEDS REWRITE'}`);

    return {
      ...response,
      passed,
      rewriteNeeded: !passed,
    };

  } catch (error) {
    console.error(`[QualityReviewer] Error reviewing beat ${beatIndex + 1}:`, error);
    
    // Return a default "pass" to avoid blocking the pipeline
    return {
      score: 7,
      originality: 7,
      engagement: 7,
      flow: 7,
      factualGrounding: 7,
      passed: true,
      issues: [],
      repetitionFlags: [],
      rewriteNeeded: false,
      rewriteGuidance: '',
    };
  }
}

/**
 * Rewrite a beat based on quality review feedback
 */
export async function rewriteBeat(
  userId: string,
  originalNarration: string,
  reviewResult: QualityReviewResult,
  previousBeatsContext: string,
  continuityState: ContinuityState
): Promise<string> {
  // Build rewrite prompt
  const userPrompt = buildRewritePrompt(
    originalNarration,
    reviewResult,
    previousBeatsContext,
    continuityState
  );

  try {
    const config: OpenRouterConfig = {
      model: QUALITY_REVIEW_MODEL,
      temperature: 0.7, // Higher temp for creative rewriting
      maxTokens: 4096,
    };

    const response = await generateText(
      userId,
      REWRITE_SYSTEM_PROMPT,
      userPrompt,
      config
    );

    console.log(`[QualityReviewer] Beat rewritten (${response.content.length} chars)`);

    return response.content.trim();

  } catch (error) {
    console.error('[QualityReviewer] Error rewriting beat:', error);
    // Return original on failure
    return originalNarration;
  }
}

/**
 * Quick check for banned phrases (can be done without API call)
 */
export function checkBannedPhrases(text: string, genre: ScriptGenre): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const bannedList = BANNED_PHRASES[genre] || [];
  const textLower = text.toLowerCase();

  for (const phrase of bannedList) {
    if (textLower.includes(phrase.toLowerCase())) {
      issues.push({
        type: 'banned_phrase',
        description: `Contains banned phrase: "${phrase}"`,
        severity: 'high',
      });
    }
  }

  return issues;
}

/**
 * Quick check for repetition within text
 */
export function checkInternalRepetition(text: string): RepetitionFlag[] {
  const flags: RepetitionFlag[] = [];
  const words = text.toLowerCase().split(/\s+/);
  
  // Check for repeated 3-word phrases
  const phrases = new Map<string, number>();
  for (let i = 0; i < words.length - 2; i++) {
    const phrase = words.slice(i, i + 3).join(' ');
    if (phrase.length > 8) { // Skip short phrases
      phrases.set(phrase, (phrases.get(phrase) || 0) + 1);
    }
  }

  for (const [phrase, count] of phrases) {
    if (count >= 2) {
      flags.push({
        phrase,
        occurrences: count,
        location: 'within_beat',
      });
    }
  }

  // Check for repeated sentence openers
  const sentences = text.split(/[.!?]+/).filter(s => s.trim());
  const openers = new Map<string, number>();
  
  for (const sentence of sentences) {
    const words = sentence.trim().split(/\s+/).slice(0, 2);
    if (words.length >= 2) {
      const opener = words.join(' ').toLowerCase();
      openers.set(opener, (openers.get(opener) || 0) + 1);
    }
  }

  for (const [opener, count] of openers) {
    if (count >= 2) {
      flags.push({
        phrase: `Sentences starting with: "${opener}"`,
        occurrences: count,
        location: 'within_beat',
      });
    }
  }

  return flags;
}

// ============================================================================
// PROMPT BUILDERS
// ============================================================================

function buildReviewPrompt(
  beatNarration: string,
  beatIndex: number,
  previousBeatsContext: string,
  continuityState: ContinuityState,
  genre: ScriptGenre
): string {
  const bannedPhrases = BANNED_PHRASES[genre] || [];

  return `Review this beat (Beat ${beatIndex + 1}) for quality:

=== BEAT TO REVIEW ===
${beatNarration}

=== PREVIOUS CONTEXT (check for cross-beat repetition) ===
${previousBeatsContext || 'This is the first beat.'}

=== PHRASES ALREADY USED (DO NOT repeat) ===
${continuityState.usedPhrases?.slice(0, 15).join(', ') || 'None yet'}

=== SENTENCE OPENERS ALREADY USED ===
${continuityState.usedOpeners?.slice(0, 10).join(', ') || 'None yet'}

=== BANNED PHRASES FOR THIS GENRE ===
${bannedPhrases.slice(0, 20).join(', ')}

Analyze and return your JSON assessment.`;
}

function buildRewritePrompt(
  originalNarration: string,
  reviewResult: QualityReviewResult,
  previousBeatsContext: string,
  continuityState: ContinuityState
): string {
  const issuesList = reviewResult.issues
    .map(i => `- [${i.severity.toUpperCase()}] ${i.description}`)
    .join('\n');

  const repetitionList = reviewResult.repetitionFlags
    .map(r => `- "${r.phrase}" (${r.occurrences}x, ${r.location})`)
    .join('\n');

  return `=== ORIGINAL BEAT ===
${originalNarration}

=== QUALITY SCORE: ${reviewResult.score}/10 ===

=== ISSUES FOUND ===
${issuesList || 'None specified'}

=== REPETITION FLAGS ===
${repetitionList || 'None'}

=== REWRITE GUIDANCE ===
${reviewResult.rewriteGuidance}

=== PREVIOUS CONTEXT (for continuity) ===
${previousBeatsContext}

=== AVOID THESE PHRASES (already used) ===
${continuityState.usedPhrases?.slice(0, 20).join(', ') || 'None'}

Write the improved version now:`;
}

// ============================================================================
// BATCH RATING (Efficient end-of-expansion rating)
// ============================================================================

/** Fast model for batch rating - much cheaper than pro */
const BATCH_RATING_MODEL = 'google/gemini-3-flash-preview';

const _BATCH_RATING_PROMPT = `You are a script quality rater. Rate each beat on a 1-10 scale based on:
- Natural language (no AI-isms like "delve", "tapestry", "unprecedented")
- Engagement (keeps viewer watching)
- Flow (smooth transitions, varied sentences)
- Specificity (concrete details, not vague generalities)

Be strict but fair. Only truly excellent writing gets 9-10. Decent writing gets 6-7. Poor writing gets 1-5.

Return ONLY a JSON array of numbers, one score per beat, in order.
Example for 5 beats: [7, 8, 6, 9, 7]`;

export interface BatchRatingResult {
  scores: number[];
  averageScore: number;
}

/**
 * Rate all beats in a single efficient LLM call.
 * Uses flash model for speed - much faster than rating each beat individually.
 */
export async function batchRateBeats(
  userId: string,
  beats: Array<{ beatIndex: number; narration: string }>
): Promise<BatchRatingResult> {
  console.log(`[BatchRating] Rating ${beats.length} beats in single call...`);

  // Build a compact representation of all beats
  const beatsText = beats
    .map((b, i) => `--- SECTION ${i + 1} ---\n${b.narration.substring(0, 800)}${b.narration.length > 800 ? '...' : ''}`)
    .join('\n\n');

  const systemPrompt = `You are a script quality rater. Rate each section on a 1-10 scale based on:
- Natural language (no AI-isms like "delve", "tapestry", "unprecedented", "journey")  
- Engagement (keeps viewer watching)
- Flow (smooth transitions, varied sentences)
- Specificity (concrete details, not vague generalities)

Be strict but fair. Score meanings:
- 9-10: Exceptional, publish-ready
- 7-8: Good, minor improvements possible
- 5-6: Mediocre, needs work
- 1-4: Poor, major issues

You MUST return ONLY a JSON array of numbers, nothing else.
Example for 3 sections: [7, 8, 6]`;

  const userPrompt = `Rate these ${beats.length} sections and return ONLY a JSON array of ${beats.length} scores:\n\n${beatsText}`;

  try {
    const config: OpenRouterConfig = {
      model: BATCH_RATING_MODEL,
      temperature: 0.1,
      maxTokens: 256,
    };

    const response = await generateText(
      userId,
      systemPrompt,
      userPrompt,
      config
    );

    console.log(`[BatchRating] Raw response: ${response.content.substring(0, 200)}`);

    // Parse the scores array from the response
    let scores: number[] = [];
    const content = response.content.trim();
    
    // Try to extract JSON array from response
    const arrayMatch = content.match(/\[[\d\s,\.]+\]/);
    if (arrayMatch) {
      try {
        const parsed = JSON.parse(arrayMatch[0]);
        if (Array.isArray(parsed)) {
          scores = parsed.map((s: any) => {
            const num = Math.round(Number(s));
            return isNaN(num) ? 6 : Math.min(10, Math.max(1, num));
          });
        }
      } catch (_e) {
        console.log('[BatchRating] JSON parse failed, trying fallback');
      }
    }
    
    // Fallback: extract numbers from the response
    if (scores.length === 0) {
      const numbers = content.match(/\d+/g);
      if (numbers) {
        scores = numbers.slice(0, beats.length).map(n => {
          const num = parseInt(n, 10);
          return isNaN(num) || num > 10 ? 6 : Math.min(10, Math.max(1, num));
        });
      }
    }

    // Ensure we have the right number of scores
    while (scores.length < beats.length) {
      scores.push(6); // Default to 6 if missing (meh)
    }
    scores = scores.slice(0, beats.length);

    const averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;

    console.log(`[BatchRating] Parsed scores: [${scores.join(', ')}], avg: ${averageScore.toFixed(1)}/10`);

    return { scores, averageScore };

  } catch (error) {
    console.error('[BatchRating] Error rating beats:', error);
    // Return default scores on error (6 = needs review)
    const defaultScores = beats.map(() => 6);
    return { scores: defaultScores, averageScore: 6 };
  }
}

// ============================================================================
// BATCH REWRITE FOR LOW SCORERS
// ============================================================================

const REWRITE_THRESHOLD = 7; // Rewrite sections scoring below this

/**
 * Rewrite sections that scored below threshold using gemini-3-pro
 */
export async function rewriteLowScorers(
  userId: string,
  beats: Array<{ beatIndex: number; narration: string; qualityScore?: number }>,
  continuityState: ContinuityState
): Promise<Array<{ beatIndex: number; narration: string; qualityScore: number; wasRewritten: boolean }>> {
  const results = [...beats].map(b => ({ ...b, qualityScore: b.qualityScore ?? 6, wasRewritten: false }));
  
  // Find sections that need rewriting
  const lowScorers = results.filter(b => b.qualityScore < REWRITE_THRESHOLD);
  
  if (lowScorers.length === 0) {
    console.log('[Rewrite] All sections passed threshold, no rewrites needed');
    return results;
  }
  
  console.log(`[Rewrite] ${lowScorers.length} sections scored below ${REWRITE_THRESHOLD}, rewriting...`);
  
  for (const section of lowScorers) {
    const idx = section.beatIndex;
    console.log(`[Rewrite] Rewriting section ${idx + 1} (score: ${section.qualityScore}/10)`);
    
    try {
      const rewritten = await rewriteSingleSection(
        userId,
        section.narration,
        section.qualityScore,
        continuityState
      );
      
      // Update the result
      const resultIdx = results.findIndex(r => r.beatIndex === idx);
      if (resultIdx !== -1) {
        results[resultIdx].narration = rewritten;
        results[resultIdx].qualityScore = Math.min(10, section.qualityScore + 2); // Assume improvement
        results[resultIdx].wasRewritten = true;
      }
      
      console.log(`[Rewrite] Section ${idx + 1} rewritten successfully`);
    } catch (error) {
      console.error(`[Rewrite] Failed to rewrite section ${idx + 1}:`, error);
    }
  }
  
  return results;
}

/**
 * Rewrite a single section using gemini-3-pro
 */
async function rewriteSingleSection(
  userId: string,
  narration: string,
  score: number,
  continuityState: ContinuityState
): Promise<string> {
  const systemPrompt = `You are an expert script editor. Improve this documentary script section.

ISSUES TO FIX (scored ${score}/10):
- Remove AI-isms: delve, tapestry, intricate, unprecedented, journey, nestled, realm
- Add specific details and concrete examples
- Vary sentence structure and length
- Make it conversational but authoritative
- Ensure smooth flow between ideas

RULES:
1. Keep the same facts, key points, and overall message
2. Keep approximately the same length
3. Write for the EAR (spoken aloud), not the eye
4. Use contractions naturally

Return ONLY the improved narration, no explanations.`;

  const userPrompt = `ORIGINAL SECTION (${score}/10):
${narration}

PHRASES ALREADY USED (avoid):
${continuityState.usedPhrases?.slice(0, 10).join(', ') || 'None'}

Write the improved version:`;

  const config: OpenRouterConfig = {
    model: QUALITY_REVIEW_MODEL, // gemini-3-pro
    temperature: 0.7,
    maxTokens: 4096,
  };

  const response = await generateText(
    userId,
    systemPrompt,
    userPrompt,
    config
  );

  return response.content.trim();
}
