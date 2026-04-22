/**
 * TTS Text Optimizer
 * ============================================================================
 * Pre-processes script text chunks for optimal Inworld TTS synthesis quality.
 *
 * This service runs AFTER text chunking and BEFORE the TTS API call in the
 * audio worker. It uses Gemini 3 Flash to apply Inworld-specific text
 * transformations that improve speech naturalness, pacing, and emphasis.
 *
 * Provider gate: transformations here are exclusively for Inworld TTS.
 * Inworld-specific tokens (*asterisks*, <break> SSML tags) must never be
 * injected into text sent to other providers.
 *
 * Key sources:
 *   - https://docs.inworld.ai/tts/best-practices/generating-speech
 *   - https://docs.inworld.ai/tts/best-practices/prompting-for-tts
 */

import { callLLM } from '@/lib/ai/client';
import type { ScriptStyleConfig, ScriptGenre } from '@/lib/queues/writing/types';

// ============================================================================
// CONSTANTS
// ============================================================================

const LOG_PREFIX = '[TTS Optimizer]';
const OPTIMIZER_MODEL = 'google/gemini-3-flash-preview';

/**
 * Maximum character expansion ratio allowed.
 * If the optimized text is >20% longer than the original, it is rejected
 * and the original is used instead.
 */
const MAX_EXPANSION_RATIO = 1.20;

// ============================================================================
// TYPES
// ============================================================================

export interface TtsOptimizationContext {
  /** Script genre from Step 3 config */
  genre?: ScriptGenre;
  /** Tone/style description (e.g. "calm and informative", "energetic hype") */
  toneStyle?: string;
  /** Content niche (e.g. "true crime", "finance", "motivational") */
  contentNiche?: string;
  /** Target audience description */
  targetAudience?: string;
  /** Full style config from ScriptAdvancedSettings */
  styleConfig?: ScriptStyleConfig;
}

export interface OptimizedChunk {
  /** The text to send to TTS (may be optimized or original) */
  text: string;
  /** The raw original text before optimization */
  originalText: string;
  /** Whether the optimized text was actually used (false = fell back to original) */
  wasOptimized: boolean;
}

// ============================================================================
// STYLE PROFILE RESOLUTION
// ============================================================================

/**
 * Derives the speech register from available style context.
 * This determines what class of TTS optimizations are appropriate.
 */
type SpeechRegister =
  | 'documentary'     // Measured, no fillers, long sentences, rare emphasis
  | 'educational'     // Clear, structured, no fillers, frequent emphasis on key terms
  | 'storytelling'    // Varied rhythm, occasional fillers, moderate emphasis
  | 'casual'          // Conversational, heavy fillers, contractions, free-flowing
  | 'hype'            // Short punchy sentences, heavy !, no fillers, strong emphasis
  | 'technical'       // Precise, no fillers, acronym expansion priority, measured

function resolveSpeechRegister(ctx: TtsOptimizationContext): SpeechRegister {
  const genre = ctx.genre;
  const tone = (ctx.toneStyle || '').toLowerCase();
  const niche = (ctx.contentNiche || '').toLowerCase();

  // Genre-first decisions (most reliable signal)
  if (genre === 'documentary') return 'documentary';
  if (genre === 'educational') return 'educational';
  if (genre === 'tutorial') return 'technical';
  if (genre === 'news') return 'documentary';
  if (genre === 'narrative_fiction' || genre === 'historical_fiction') return 'storytelling';
  if (genre === 'opinion_essay') return 'storytelling';

  // Fallback: tone string heuristics
  if (/hype|energetic|exciting|intense|motivat/.test(tone)) return 'hype';
  if (/casual|conversational|relaxed|chill/.test(tone)) return 'casual';
  if (/story|narrative|dramatic|cinematic/.test(tone)) return 'storytelling';
  if (/technical|precise|analytical/.test(tone)) return 'technical';

  // Niche heuristics as final fallback
  if (/true.crime|mystery|thriller/.test(niche)) return 'storytelling';
  if (/finance|business|science|tech/.test(niche)) return 'documentary';
  if (/gaming|commentary|reaction/.test(niche)) return 'casual';
  if (/motivation|self.help|fitness/.test(niche)) return 'hype';

  return 'documentary'; // Safe default — least disruptive
}

/**
 * Build a register-specific instruction block for the LLM prompt.
 * Keeps the rules minimal and targeted — we do not want the LLM to overdo it.
 */
function buildRegisterRules(register: SpeechRegister): string {
  switch (register) {
    case 'documentary':
      return `REGISTER: Measured documentary narrator.
- Emphasize 1 key word per sentence using *asterisks*. Use this sparingly — maximum 1 per sentence.
- Use long, flowing sentences with commas for natural pacing.
- DO NOT add filler words (uh, um, like, you know).
- DO NOT add exclamation marks.
- Add a <break time="0.4s" /> only at strong paragraph or topic transitions.`;

    case 'educational':
      return `REGISTER: Clear educational presenter.
- Wrap *key technical terms and concepts* in asterisks for emphasis (1-2 per sentence max).
- Keep sentences clear and direct with periods creating natural pauses.
- DO NOT add filler words.
- Add <break time="0.3s" /> before lists or when introducing a new concept.
- Spell out acronyms on first appearance: "AI" becomes "A.I.", "TTS" becomes "T.T.S."`;

    case 'storytelling':
      return `REGISTER: Engaging narrative storyteller.
- Emphasize *emotionally charged* or *pivotal words* using asterisks (1 per sentence max).
- Use varied sentence lengths — short sentences for dramatic moments, longer for build-up.
- Occasional filler words are natural here — add "Well," or "And then..." at transitions where they fit naturally. Maximum 1 filler per paragraph.
- Add <break time="0.5s" /> before reveals or dramatic beats.
- Use ellipsis (...) for trailing thoughts that create suspense.`;

    case 'casual':
      return `REGISTER: Casual conversational host.
- Use *asterisks* for emphasis on important words (1 per sentence max).
- Sentence lengths should vary naturally and feel unscripted.
- Add natural filler words where a human would pause to think: "So," "Well," "I mean," "You know,". Use judiciously — a maximum of 1 per 2-3 sentences.
- Use contractions consistently: "don't", "can't", "I'm", "we're" instead of formal forms.
- Add <break time="0.3s" /> at topic changes.`;

    case 'hype':
      return `REGISTER: High-energy hype presenter.
- Use short, punchy sentences. Break long sentences up.
- Add *strong emphasis* on action words and key claims (1 per sentence max).
- Use exclamation marks liberally for excitement and urgency.
- DO NOT add filler words — the delivery must stay clean and polished.
- Add <break time="0.2s" /> between rapid-fire points to let emphasis land.`;

    case 'technical':
      return `REGISTER: Precise technical presenter.
- Emphasize *technical terms* with asterisks (1-2 per sentence max).
- Spell out acronyms on first appearance: "API" → "A.P.I.", "LLM" → "L.L.M.", "GPU" → "G.P.U."
- Use measured, even pacing. Avoid rushing.
- DO NOT add filler words — precision and clarity are paramount.
- Add <break time="0.3s" /> before key technical terms.`;
  }
}

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

function buildSystemPrompt(
  register: SpeechRegister,
  ctx: TtsOptimizationContext
): string {
  const registerRules = buildRegisterRules(register);
  const niche = ctx.contentNiche ? `Content niche: ${ctx.contentNiche}.` : '';
  const audience = ctx.targetAudience ? `Target audience: ${ctx.targetAudience}.` : '';

  return `You are a TTS text optimizer for Inworld AI's speech synthesis engine. Your job is to make script text sound as natural as possible when spoken aloud.

CONTEXT
${niche}
${audience}
Speech register: ${register}

YOUR TASK
Take the provided script chunk and return an optimized version specifically formatted for Inworld TTS. Apply only the transformations listed below for this register.

${registerRules}

UNIVERSAL RULES (always apply regardless of register):
- Expand numbers to spoken form when they appear ambiguous or hard to pronounce: "$5,342" → "five thousand three hundred and forty-two dollars", "3/15/2025" → "march fifteenth twenty twenty-five".
- Symbols to words: "+" → "plus", "=" → "equals", "%" → "percent".
- Emails to spoken form: "user@example.com" → "user at example dot com".
- URLs if present: "vidbolt.com" → "vid bolt dot com".
- DO NOT change factual content, names, or meaning.
- DO NOT add new sentences or substantially increase the length of the text.
- DO NOT use markdown formatting, bullet points, or code blocks in output.
- If the text already looks optimized or clean, return it with minimal changes.

CRITICAL CONSTRAINTS:
- The optimized text MUST convey the exact same information as the original.
- Keep changes conservative and purposeful. Do not over-optimize.
- The output should be 100-120% the character length of the input. If you find yourself adding much more, you are overdoing it — simplify.

Reply with ONLY the optimized text. No explanation, no preamble, no quotes around the output.`;
}

// ============================================================================
// CORE OPTIMIZER
// ============================================================================

/**
 * Optimize a single text chunk for Inworld TTS synthesis.
 *
 * @param userId - User ID for LLM API key resolution
 * @param chunkText - Raw script text to optimize
 * @param ctx - Project style context from the script config
 * @returns Optimized chunk with original text preserved
 */
export async function optimizeChunkForInworldTts(
  userId: string,
  chunkText: string,
  ctx: TtsOptimizationContext
): Promise<OptimizedChunk> {
  const original = chunkText;

  // Skip optimization for very short chunks — not worth the LLM call
  if (chunkText.trim().length < 30) {
    console.log(`${LOG_PREFIX} Chunk too short (${chunkText.length} chars) — skipping`);
    return { text: original, originalText: original, wasOptimized: false };
  }

  const register = resolveSpeechRegister(ctx);
  console.log(`${LOG_PREFIX} Optimizing ${chunkText.length}-char chunk (register: ${register})`);

  try {
    const response = await callLLM(
      userId,
      [
        { role: 'system', content: buildSystemPrompt(register, ctx) },
        { role: 'user', content: chunkText },
      ],
      {
        model: OPTIMIZER_MODEL,
        temperature: 0.3, // Low temperature = consistent, rule-following output
        maxTokens: 1024,
        xTitle: 'Vid-Bolt TTS Optimizer',
      }
    );

    const optimized = response.content.trim();

    // Safety validation: reject if the output is substantially longer than input
    const expansionRatio = optimized.length / original.length;
    if (expansionRatio > MAX_EXPANSION_RATIO) {
      console.warn(
        `${LOG_PREFIX} Optimized text too long (${optimized.length} vs ${original.length} chars, ratio=${expansionRatio.toFixed(2)}) — falling back to original`
      );
      return { text: original, originalText: original, wasOptimized: false };
    }

    // Safety validation: reject empty or clearly broken output
    if (!optimized || optimized.length < 10) {
      console.warn(`${LOG_PREFIX} Optimizer returned empty/invalid output — falling back to original`);
      return { text: original, originalText: original, wasOptimized: false };
    }

    console.log(
      `${LOG_PREFIX} Done: ${original.length} → ${optimized.length} chars (register: ${register}, ratio: ${expansionRatio.toFixed(2)})`
    );

    return {
      text: optimized,
      originalText: original,
      wasOptimized: true,
    };
  } catch (error) {
    // Non-blocking — if optimization fails, use the raw text
    console.warn(`${LOG_PREFIX} Optimization failed, using original:`, error instanceof Error ? error.message : error);
    return { text: original, originalText: original, wasOptimized: false };
  }
}

/**
 * Optimize all chunks in a batch for Inworld TTS.
 * Runs sequentially (not in parallel) to avoid rate-limiting the LLM
 * while multiple chunks are being processed.
 *
 * @param userId - User ID for LLM key resolution
 * @param chunks - Array of text chunks to optimize
 * @param ctx - Project style context
 * @param onProgress - Optional progress callback (chunk index, total)
 */
export async function optimizeChunksForInworldTts(
  userId: string,
  chunks: Array<{ index: number; text: string; charCount: number }>,
  ctx: TtsOptimizationContext,
  onProgress?: (chunkIndex: number, total: number) => Promise<void>
): Promise<Array<{ index: number; text: string; originalText: string; charCount: number; wasOptimized: boolean }>> {
  const results: Array<{ index: number; text: string; originalText: string; charCount: number; wasOptimized: boolean }> = [];
  const total = chunks.length;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const optimized = await optimizeChunkForInworldTts(userId, chunk.text, ctx);

    results.push({
      index: chunk.index,
      text: optimized.text,
      originalText: optimized.originalText,
      charCount: optimized.text.length,
      wasOptimized: optimized.wasOptimized,
    });

    if (onProgress) {
      await onProgress(i + 1, total);
    }
  }

  const optimizedCount = results.filter(r => r.wasOptimized).length;
  console.log(`${LOG_PREFIX} Batch complete: ${optimizedCount}/${total} chunks optimized`);

  return results;
}
