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
  ExpandedBeat,
  ScriptStyleConfig,
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
  type: 'originality' | 'engagement' | 'flow' | 'factual' | 'repetition' | 'banned_phrase' | 'visualizability';
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
  /** Can a visual director easily illustrate every 5-8 seconds? (1-10) */
  visualizability: number;
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
  qualityReviewModel?: string;
  qualityPromptOverride?: string;
}

export interface RewriteOptions {
  genre: ScriptGenre;
  toneStyle?: string;
  targetAudience?: string;
  pov?: '1st' | '2nd' | '3rd';
  protagonistGender?: 'male' | 'female' | 'any';
  contentNiche?: string;
  model?: string;
  rewritePromptOverride?: string;
}

export interface BatchRatingOptions {
  genre: ScriptGenre;
  model?: string;
  qualityPromptOverride?: string;
}

// ============================================================================
// QUALITY REVIEW PROMPTS
// ============================================================================

const QUALITY_REVIEW_SYSTEM_PROMPT = `You are an elite script quality reviewer for premium YouTube scripts.
Score this beat on a 1-10 scale. Be RUTHLESSLY STRICT - only truly exceptional writing scores 8+.

## SCORING DIMENSIONS (each 1-10):
1. ORIGINALITY: No AI clichés, no overused phrases, fresh and specific language
2. ENGAGEMENT: Compelling prose that creates forward momentum - viewer wants to keep watching
3. FLOW: Natural rhythm, varied sentence structure, smooth transitions
4. FACTUAL_GROUNDING: Facts attributed properly, no vague claims, research-backed
5. VISUALIZABILITY: Can a visual director easily find a distinct image or video clip for every 5-8 seconds
   of narration? Score LOW if there are stretches of abstract philosophizing, internal monologue, or vague
   generalities with no concrete visual anchor (person, place, object, action). Score HIGH if every sentence
   suggests something the viewer could SEE on screen.

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

## VISUAL DEAD ZONE DETECTION (flag each):
- Flag any stretch of 3+ consecutive sentences where a viewer would see NOTHING specific on screen
- Examples of dead zones: abstract reasoning, philosophical musings, generic statements about "society" or "the world"
- Good writing gives every sentence a visual: a person, a place, an object, a number, an action

## FORMAT-SPECIFIC CHECKS:
- Does it fit the active format and viewer expectation for the requested genre?
- Is there concrete detail or just vague generalities?
- Does it sound like it's written for the EAR (spoken aloud) not the eye?
- Are contractions used naturally when appropriate?

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
  "visualizability": 7,
  "issues": [
    {"type": "repetition", "description": "...", "severity": "medium", "location": "paragraph 2"}
  ],
  "repetitionFlags": [
    {"phrase": "repeated phrase", "occurrences": 2, "location": "within_beat"}
  ],
  "rewriteNeeded": true,
  "rewriteGuidance": "Specific instructions for what to fix"
}`;

const REWRITE_SYSTEM_PROMPT = `You are a senior YouTube script editor with 20 years of experience improving scripts.

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
- Attribute facts naturally when the genre uses researched claims
- Be conversational but authoritative

## OUTPUT:
Return ONLY the rewritten narration text.
No explanations. No markdown. No headers. Just the improved script.`;

function getGenreStyleNotes(genre: ScriptGenre): string {
  switch (genre) {
    case 'documentary':
      return 'Prioritize sourced claims, causal clarity, and spoken-narration flow.';
    case 'educational':
      return 'Prioritize clarity, teachability, and smooth concept-to-concept progression.';
    case 'tutorial':
      return 'Prioritize step order, practical clarity, and actionable instructions without fluff.';
    case 'news':
      return 'Prioritize timeliness, attribution, precision, and a neutral, concise delivery.';
    case 'opinion_essay':
      return 'Prioritize a clear thesis, persuasive logic, and a distinct but credible point of view.';
    case 'historical_fiction':
      return 'Prioritize immersive scene writing, period texture, and emotional continuity.';
    case 'narrative_fiction':
      return 'Prioritize scene momentum, character voice, and narrative tension.';
    default:
      return 'Match the requested genre and keep the writing natural, specific, and engaging.';
  }
}

function buildNarrationStyleContext(options: {
  toneStyle?: string;
  targetAudience?: string;
  pov?: '1st' | '2nd' | '3rd';
  protagonistGender?: 'male' | 'female' | 'any';
  contentNiche?: string;
}): string {
  const lines = [
    options.toneStyle ? `Tone/style: ${options.toneStyle}` : null,
    options.targetAudience ? `Target audience: ${options.targetAudience}` : null,
    options.pov ? `Narration POV: ${options.pov}` : null,
    options.protagonistGender ? `Narrator/protagonist gender preference: ${options.protagonistGender}` : null,
    options.contentNiche ? `Content niche: ${options.contentNiche}` : null,
  ].filter(Boolean);

  return lines.length > 0 ? lines.join('\n') : 'No extra style constraints.';
}

function buildQualityReviewSystemPrompt(
  genre: ScriptGenre,
  override?: string,
): string {
  const basePrompt = `${QUALITY_REVIEW_SYSTEM_PROMPT}

ACTIVE GENRE: ${genre}
GENRE NOTES: ${getGenreStyleNotes(genre)}`;

  return override ? `${override}\n\n${basePrompt}` : basePrompt;
}

function buildRewriteSystemPrompt(
  options: RewriteOptions,
): string {
  const basePrompt = `${REWRITE_SYSTEM_PROMPT}

ACTIVE GENRE: ${options.genre}
GENRE NOTES: ${getGenreStyleNotes(options.genre)}`;

  return options.rewritePromptOverride
    ? `${options.rewritePromptOverride}\n\n${basePrompt}`
    : basePrompt;
}


// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Review beat quality using Gemini 3 Pro
 */
export async function reviewBeatQuality(
  context: BeatReviewContext
): Promise<QualityReviewResult> {
  const {
    userId,
    beatNarration,
    beatIndex,
    previousBeatsContext,
    continuityState,
    genre,
    qualityReviewModel,
    qualityPromptOverride,
  } = context;

  // Build user prompt with context
  const userPrompt = buildReviewPrompt(beatNarration, beatIndex, previousBeatsContext, continuityState, genre);

  try {
    const config: OpenRouterConfig = {
      model: qualityReviewModel || QUALITY_REVIEW_MODEL,
      temperature: 0.3, // Low temp for consistent scoring
      responseFormat: {
        type: 'json_schema',
        json_schema: {
          name: 'quality_review',
          strict: true,
          schema: {
            type: 'object',
            required: ['score', 'originality', 'engagement', 'flow', 'factualGrounding', 'visualizability', 'issues', 'repetitionFlags', 'rewriteNeeded', 'rewriteGuidance'],
            additionalProperties: false,
            properties: {
              score: { type: 'number' },
              originality: { type: 'number' },
              engagement: { type: 'number' },
              flow: { type: 'number' },
              factualGrounding: { type: 'number' },
              visualizability: { type: 'number' },
              issues: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['type', 'description', 'severity'],
                  additionalProperties: false,
                  properties: {
                    type: { type: 'string', enum: ['originality', 'engagement', 'flow', 'factual', 'repetition', 'banned_phrase', 'visualizability'] },
                    description: { type: 'string' },
                    severity: { type: 'string', enum: ['low', 'medium', 'high'] },
                    location: { type: ['string', 'null'] },
                  },
                },
              },
              repetitionFlags: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['phrase', 'occurrences', 'location'],
                  additionalProperties: false,
                  properties: {
                    phrase: { type: 'string' },
                    occurrences: { type: 'number' },
                    location: { type: 'string', enum: ['within_beat', 'cross_beat'] },
                  },
                },
              },
              rewriteNeeded: { type: 'boolean' },
              rewriteGuidance: { type: 'string' },
            },
          },
        },
      },
    };

    const response = await generateJSON<QualityReviewResult>(
      userId,
      buildQualityReviewSystemPrompt(genre, qualityPromptOverride),
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
      visualizability: 7,
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
  continuityState: ContinuityState,
  options: RewriteOptions
): Promise<string> {
  // Build rewrite prompt
  const userPrompt = buildRewritePrompt(
    originalNarration,
    reviewResult,
    previousBeatsContext,
    continuityState,
    options
  );

  try {
    const config: OpenRouterConfig = {
      model: options.model || QUALITY_REVIEW_MODEL,
      temperature: 0.7, // Higher temp for creative rewriting
      maxTokens: 4096,
    };

    const response = await generateText(
      userId,
      buildRewriteSystemPrompt(options),
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
export function checkBannedPhrases(
  text: string,
  genre: ScriptGenre,
  customPhrases?: string[]
): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const genreList = BANNED_PHRASES[genre] || [];
  const allBanned = customPhrases
    ? [...new Set([...genreList, ...customPhrases])]
    : genreList;
  const textLower = text.toLowerCase();

  for (const phrase of allBanned) {
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

/**
 * Deterministic scan for user-defined word replacement violations.
 * Returns all words found that have user-specified alternatives.
 */
export function checkWordReplacements(
  text: string,
  customReplacements: Record<string, string[]>
): Array<{ word: string; alternatives: string[]; count: number }> {
  const violations: Array<{ word: string; alternatives: string[]; count: number }> = [];
  const textLower = text.toLowerCase();

  for (const [word, alternatives] of Object.entries(customReplacements)) {
    const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    const matches = textLower.match(regex);
    if (matches && matches.length > 0) {
      violations.push({ word, alternatives, count: matches.length });
    }
  }

  return violations;
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

=== ACTIVE GENRE ===
${genre}

=== GENRE-SPECIFIC REVIEW GOALS ===
${getGenreStyleNotes(genre)}

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
  continuityState: ContinuityState,
  options: RewriteOptions
): string {
  const issuesList = reviewResult.issues
    .map(i => `- [${i.severity.toUpperCase()}] ${i.description}`)
    .join('\n');

  const repetitionList = reviewResult.repetitionFlags
    .map(r => `- "${r.phrase}" (${r.occurrences}x, ${r.location})`)
    .join('\n');

  return `=== ORIGINAL BEAT ===
${originalNarration}

=== ACTIVE GENRE ===
${options.genre}

=== STYLE TARGET ===
${buildNarrationStyleContext(options)}

=== GENRE-SPECIFIC WRITING NOTES ===
${getGenreStyleNotes(options.genre)}

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
  beats: Array<{ beatIndex: number; narration: string }>,
  options: BatchRatingOptions
): Promise<BatchRatingResult> {
  console.log(`[BatchRating] Rating ${beats.length} beats in single call...`);

  // Build a compact representation of all beats
  const beatsText = beats
    .map((b, i) => `--- SECTION ${i + 1} ---\n${b.narration.substring(0, 800)}${b.narration.length > 800 ? '...' : ''}`)
    .join('\n\n');

  const systemPrompt = `You are a script quality rater. Rate each section on a 1-10 scale based on:
- Active genre: ${options.genre}
- Genre expectations: ${getGenreStyleNotes(options.genre)}
- Natural language (no AI-isms like "delve", "tapestry", "unprecedented", "journey")  
- Engagement (keeps viewer watching)
- Flow (smooth transitions, varied sentences)
- Specificity (concrete details, not vague generalities)

Be strict but fair. Score meanings:
- 9-10: Exceptional, publish-ready
- 7-8: Good, minor improvements possible
- 5-6: Mediocre, needs work
- 1-4: Poor, major issues

Return a scores array with exactly ${beats.length} numbers.`;

  const userPrompt = `Rate these ${beats.length} sections:\n\n${beatsText}`;

  try {
    const config: OpenRouterConfig = {
      model: options.model || BATCH_RATING_MODEL,
      temperature: 0.1,
      maxTokens: 512,
      responseFormat: {
        type: 'json_schema',
        json_schema: {
          name: 'batch_rating',
          strict: true,
          schema: {
            type: 'object',
            required: ['scores'],
            additionalProperties: false,
            properties: {
              scores: {
                type: 'array',
                items: { type: 'number' },
              },
            },
          },
        },
      },
    };

    const response = await generateJSON<{ scores: number[] }>(
      userId,
      options.qualityPromptOverride
        ? `${options.qualityPromptOverride}\n\n${systemPrompt}`
        : systemPrompt,
      userPrompt,
      config
    );

    let scores = (response.scores || []).map((s: number) => {
      const num = Math.round(Number(s));
      return isNaN(num) ? 6 : Math.min(10, Math.max(1, num));
    });

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
  continuityState: ContinuityState,
  options: RewriteOptions
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
        continuityState,
        options
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
  continuityState: ContinuityState,
  options: RewriteOptions,
  additionalGuidance?: string,
  prevBeatContext?: string,
  nextBeatContext?: string,
): Promise<string> {
  const adjacentContext = [
    prevBeatContext ? `=== PREVIOUS PARAGRAPH (match ending tone) ===\n${prevBeatContext}` : '',
    nextBeatContext ? `=== NEXT PARAGRAPH (ensure smooth transition into) ===\n${nextBeatContext}` : '',
  ].filter(Boolean).join('\n\n');

  const systemPrompt = `You are an expert script editor. Improve this ${options.genre} script section.

ACTIVE STYLE TARGET:
${buildNarrationStyleContext(options)}

GENRE NOTES:
${getGenreStyleNotes(options.genre)}

ISSUES TO FIX (scored ${score}/10):
- Remove AI-isms: delve, tapestry, intricate, unprecedented, journey, nestled, realm
- Add specific details and concrete examples
- Vary sentence structure and length
- Make it conversational but authoritative
- Ensure smooth flow between ideas
${additionalGuidance ? `\nADDITIONAL REQUIREMENTS:\n${additionalGuidance}` : ''}

RULES:
1. Keep the same facts, key points, and overall message
2. Keep approximately the same length
3. Write for the EAR (spoken aloud), not the eye
4. Use contractions naturally

Return ONLY the improved narration, no explanations.`;

  const userPrompt = `ORIGINAL SECTION (${score}/10):
${narration}

${adjacentContext}

PHRASES ALREADY USED (avoid):
${continuityState.usedPhrases?.slice(0, 10).join(', ') || 'None'}

Write the improved version:`;

  const config: OpenRouterConfig = {
    model: options.model || QUALITY_REVIEW_MODEL,
    temperature: 0.7,
    maxTokens: 4096,
  };

  const response = await generateText(
    userId,
    options.rewritePromptOverride
      ? `${options.rewritePromptOverride}\n\n${systemPrompt}`
      : systemPrompt,
    userPrompt,
    config
  );

  return response.content.trim();
}

// ============================================================================
// STYLE CONSTRAINT ENFORCEMENT (Post-Generation Validation)
// ============================================================================

/**
 * Enforce user style constraints after generation.
 * Runs deterministic scans for banned phrases and word replacements,
 * then triggers targeted rewrites ONLY for violating beats.
 * Zero cost in happy path (no violations → no LLM calls).
 */
export async function enforceStyleConstraints(
  userId: string,
  beats: ExpandedBeat[],
  genre: ScriptGenre,
  styleConfig: ScriptStyleConfig,
  continuityState: ContinuityState,
  model?: string,
): Promise<void> {
  let totalRewrites = 0;

  for (let i = 0; i < beats.length; i++) {
    const beat = beats[i];

    // 1. Check user-custom banned phrases (deterministic string scan)
    const bannedIssues = styleConfig.customBannedPhrases?.length
      ? checkBannedPhrases(beat.narration, genre, styleConfig.customBannedPhrases)
          // Only flag issues from user's custom list (not genre defaults)
          .filter(issue => 
            styleConfig.customBannedPhrases!.some(p => 
              issue.description.toLowerCase().includes(p.toLowerCase())
            )
          )
      : [];

    // 2. Check user-custom word replacements (deterministic regex scan)
    const wordIssues = styleConfig.customWordReplacements
      ? checkWordReplacements(beat.narration, styleConfig.customWordReplacements)
      : [];

    if (bannedIssues.length === 0 && wordIssues.length === 0) continue;

    // Build targeted rewrite guidance with specific fix instructions
    const guidance = [
      ...bannedIssues.map(i => `REMOVE this phrase: ${i.description}`),
      ...wordIssues.map(w => `REPLACE "${w.word}" (found ${w.count}x) with one of: ${w.alternatives.join(', ')}`),
    ].join('\n');

    // Get adjacent beat context for seamless rewrites
    const prevContext = i > 0 ? beats[i - 1].narration.slice(-300) : '';
    const nextContext = i < beats.length - 1 ? beats[i + 1].narration.slice(0, 300) : '';

    console.log(`[StyleEnforcer] Beat ${beat.beatIndex}: ${bannedIssues.length} banned phrases, ${wordIssues.length} word violations → rewriting`);

    try {
      const rewritten = await rewriteSingleSection(
        userId,
        beat.narration,
        beat.qualityScore ?? 7,
        continuityState,
        {
          genre,
          model,
        },
        guidance,
        prevContext,
        nextContext,
      );

      beat.narration = rewritten;
      beat.wordCount = rewritten.split(/\s+/).length;
      totalRewrites++;
    } catch (error) {
      console.error(`[StyleEnforcer] Failed to rewrite beat ${beat.beatIndex}:`, error);
      // Non-blocking: keep original narration if rewrite fails
    }
  }

  if (totalRewrites > 0) {
    console.log(`[StyleEnforcer] Rewrote ${totalRewrites} beats to enforce style constraints`);
  } else {
    console.log(`[StyleEnforcer] No style violations found — all beats passed`);
  }
}
