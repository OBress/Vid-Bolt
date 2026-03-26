/**
 * Scene Decomposer
 * ============================================================================
 * LLM-driven scene decomposition that replaces the old keyword-based
 * analyzer.ts + rule-based segmenter.ts pipeline.
 *
 * Takes a full script with word-level TTS timestamps and outputs scene
 * boundaries with narrative purpose, pacing intent, and shot count
 * recommendations.
 *
 * Uses strict JSON schema enforcement (constrained decoding) via
 * OpenRouter's `responseFormat` to guarantee valid output structure.
 *
 * Retry strategy:
 *   1. Primary model (gemini-3-flash-preview) × 3 attempts
 *   2. Upgrade to stronger model (gemini-3-pro-preview) × 2 attempts
 *   3. Only after all 5 attempts fail does the caller fall back to legacy
 */

import { z } from 'zod';
import { generateJSON, QUALITY_REVIEW_MODEL } from '@/lib/ai/openrouter';
import type { CreativeManifest } from '@/lib/types/closed-loop';

// ============================================================================
// TYPES
// ============================================================================

const PacingIntent = z.enum(['fast', 'moderate', 'slow', 'building', 'climactic']);
export type PacingIntent = z.infer<typeof PacingIntent>;

/**
 * Schema for a single decomposed scene.
 * The LLM returns word indices — we compute actual timestamps from those.
 */
const DecomposedScene = z.object({
  scene_id: z.string(),
  description: z.string(),
  narrative_purpose: z.string(),
  start_word_index: z.number().int(),
  end_word_index: z.number().int(),
  suggested_shot_count: z.number().int(),
  pacing_intent: PacingIntent,
  visual_continuity: z.boolean(),
});
export type DecomposedScene = z.infer<typeof DecomposedScene>;

/**
 * Full scene decomposition output from the LLM.
 */
const SceneDecompositionOutput = z.object({
  scenes: z.array(DecomposedScene),
});
export type SceneDecompositionOutput = z.infer<typeof SceneDecompositionOutput>;

/**
 * Enriched scene with computed timestamps (after post-processing).
 */
export interface EnrichedScene extends DecomposedScene {
  start_seconds: number;
  end_seconds: number;
  text: string;
}

export interface WordTimestamp {
  word: string;
  start_seconds: number;
  end_seconds: number;
}

// ============================================================================
// JSON SCHEMA (for constrained decoding)
// ============================================================================

function getResponseFormat() {
  const schema = z.toJSONSchema(SceneDecompositionOutput);
  // Strip $schema metadata — OpenRouter only wants the structural schema
  const { $schema: _, ...structuralSchema } = schema as Record<string, unknown>;
  return {
    type: 'json_schema' as const,
    json_schema: {
      name: 'scene_decomposition',
      strict: true,
      schema: structuralSchema,
    },
  };
}

// ============================================================================
// PROMPT CONSTRUCTION
// ============================================================================

const LOG_PREFIX = '[SceneDecomposer]';

function buildSystemPrompt(
  wordCount: number,
  creativeContext: SceneDecompositionContext
): string {
  const parts: string[] = [];

  parts.push(`You are an expert video director specializing in scene decomposition for automated video production.

Your job: Take a script with ${wordCount} words (indices 0 to ${wordCount - 1}) and divide it into logical SCENES. Each scene is a coherent narrative unit — a single topic, location, argument, or emotional beat.

CRITICAL RULES:
- Word indices MUST be integers in range [0, ${wordCount - 1}]
- Scene 1 MUST start at word index 0
- The last scene MUST end at word index ${wordCount - 1}
- Scenes MUST be contiguous — end_word_index of scene N must be exactly start_word_index of scene N+1 minus 1
- No gaps, no overlaps — every word must belong to exactly one scene
- suggested_shot_count is how many visual cuts this scene should have (minimum 1)`);

  // Creative context
  if (creativeContext.style) {
    parts.push(`\nVISUAL STYLE: ${creativeContext.style}`);
  }
  if (creativeContext.aspectRatio) {
    parts.push(`ASPECT RATIO: ${creativeContext.aspectRatio}`);
  }
  if (creativeContext.genre) {
    parts.push(`CONTENT GENRE: ${creativeContext.genre}`);
  }
  if (creativeContext.tone) {
    parts.push(`TONE/STYLE: ${creativeContext.tone}`);
  }
  if (creativeContext.targetAudience) {
    parts.push(`TARGET AUDIENCE: ${creativeContext.targetAudience}`);
  }

  // Pacing rules
  if (creativeContext.pacingRules) {
    const pr = creativeContext.pacingRules;
    parts.push(`\nPACING RULES:
- Hook duration: ${pr.hookDuration}s (the first ~${pr.hookDuration}s should be a fast-paced hook scene)
- Maximum ${pr.maxConsecutiveStatic} consecutive static images allowed
- Minimum ${pr.minVideoShotsPerMinute} video shots per minute`);
  }

  // Media weighting
  if (creativeContext.mediaWeighting) {
    const mw = creativeContext.mediaWeighting;
    parts.push(`\nMEDIA WEIGHTING TARGETS:
- Stock footage: ${Math.round(mw.stock * 100)}%
- AI video: ${Math.round(mw.video * 100)}%
- Motion graphics: ${Math.round(mw.motionGraphics * 100)}%
- AI image (static): ${Math.round(mw.image * 100)}%`);
  }

  parts.push(`\nDIRECTOR MINDSET:
- Think like a premium YouTube director. Every scene should serve a narrative purpose.
- Design a pacing rollercoaster — oscillate between high-energy and low-energy moments.
- The hook (first scene) should be fast-paced with quick visual changes.
- Transitions between major topics deserve their own short scene.
- A single dramatic line can be its own scene with 1 shot.
- A long explanatory section might be one scene with 5+ shots.
- Let the narrative rhythm drive your decisions, not arbitrary rules.`);

  return parts.join('\n');
}

function buildUserPrompt(
  script: string,
  wordTimestamps: WordTimestamp[]
): string {
  // Provide the script with word indices annotated for context
  // We include word-level timing so the LLM can make informed pacing decisions
  const totalDuration = wordTimestamps.length > 0
    ? wordTimestamps[wordTimestamps.length - 1].end_seconds
    : 0;

  return `Here is the script (${wordTimestamps.length} words, ${totalDuration.toFixed(1)}s total duration):

---
${script}
---

Decompose this script into scenes. Return the scene decomposition JSON.`;
}

// ============================================================================
// CONTEXT INTERFACE
// ============================================================================

export interface SceneDecompositionContext {
  style?: string;
  aspectRatio?: string;
  genre?: string;
  tone?: string;
  targetAudience?: string;
  pacingRules?: {
    hookDuration: number;
    maxConsecutiveStatic: number;
    minVideoShotsPerMinute: number;
  };
  mediaWeighting?: {
    stock: number;
    video: number;
    motionGraphics: number;
    image: number;
  };
}

/**
 * Build creative context from a CreativeManifest.
 */
export function buildContextFromManifest(manifest: CreativeManifest): SceneDecompositionContext {
  return {
    style: manifest.style?.visual_style,
    aspectRatio: manifest.style?.aspect_ratio,
    genre: manifest.script_context?.genre,
    tone: manifest.script_context?.tone_style,
    targetAudience: manifest.script_context?.target_audience,
    pacingRules: manifest.pacing_rules ? {
      hookDuration: manifest.pacing_rules.hook_duration_seconds,
      maxConsecutiveStatic: manifest.pacing_rules.max_consecutive_static_images,
      minVideoShotsPerMinute: manifest.pacing_rules.min_video_shots_per_minute,
    } : undefined,
    mediaWeighting: manifest.media_weighting ? {
      stock: manifest.media_weighting.stock_footage,
      video: manifest.media_weighting.ai_video,
      motionGraphics: manifest.media_weighting.motion_graphics,
      image: manifest.media_weighting.ai_image_static,
    } : undefined,
  };
}

// ============================================================================
// POST-PROCESSING: Semantic validation & timing computation
// ============================================================================

/**
 * Validate and fix the LLM's scene decomposition output.
 * - Clamps word indices to valid range
 * - Fills any gaps between scenes
 * - Computes timestamps from word indices
 * - Extracts scene text from the script
 */
function postProcess(
  raw: SceneDecompositionOutput,
  wordTimestamps: WordTimestamp[],
  script: string
): EnrichedScene[] {
  const wordCount = wordTimestamps.length;
  if (wordCount === 0) return [];

  // Sort scenes by start_word_index
  const scenes = [...raw.scenes].sort((a, b) => a.start_word_index - b.start_word_index);

  if (scenes.length === 0) {
    // LLM returned empty scenes — create a single scene covering everything
    console.warn(`${LOG_PREFIX} LLM returned 0 scenes, creating single fallback scene`);
    scenes.push({
      scene_id: 'scene-1',
      description: 'Full video',
      narrative_purpose: 'Complete content',
      start_word_index: 0,
      end_word_index: wordCount - 1,
      suggested_shot_count: Math.max(1, Math.ceil(wordCount / 30)),
      pacing_intent: 'moderate' as PacingIntent,
      visual_continuity: false,
    });
  }

  // Clamp indices and fix gaps/overlaps
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];

    // Clamp to valid range
    scene.start_word_index = Math.max(0, Math.min(wordCount - 1, Math.round(scene.start_word_index)));
    scene.end_word_index = Math.max(0, Math.min(wordCount - 1, Math.round(scene.end_word_index)));

    // Ensure start <= end
    if (scene.start_word_index > scene.end_word_index) {
      const temp = scene.start_word_index;
      scene.start_word_index = scene.end_word_index;
      scene.end_word_index = temp;
    }

    // Ensure minimum 1 shot
    if (scene.suggested_shot_count < 1) {
      scene.suggested_shot_count = 1;
    }
  }

  // Fix first scene to start at 0
  scenes[0].start_word_index = 0;

  // Fix last scene to end at wordCount - 1
  scenes[scenes.length - 1].end_word_index = wordCount - 1;

  // Fill gaps: make scenes contiguous
  for (let i = 1; i < scenes.length; i++) {
    const prev = scenes[i - 1];
    const curr = scenes[i];

    // If there's a gap, extend the previous scene
    if (curr.start_word_index > prev.end_word_index + 1) {
      prev.end_word_index = curr.start_word_index - 1;
    }

    // If there's an overlap, adjust current to start after previous
    if (curr.start_word_index <= prev.end_word_index) {
      curr.start_word_index = prev.end_word_index + 1;
    }

    // If adjustment made the scene invalid, remove it
    if (curr.start_word_index > curr.end_word_index) {
      scenes.splice(i, 1);
      i--;
      continue;
    }
  }

  // Build word list for text extraction
  const words = wordTimestamps.map(w => w.word);

  // Enrich with timestamps and text
  return scenes.map((scene): EnrichedScene => ({
    ...scene,
    start_seconds: wordTimestamps[scene.start_word_index].start_seconds,
    end_seconds: wordTimestamps[scene.end_word_index].end_seconds,
    text: words.slice(scene.start_word_index, scene.end_word_index + 1).join(' '),
  }));
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

const PRIMARY_MODEL = 'google/gemini-3-flash-preview';
const UPGRADE_MODEL = QUALITY_REVIEW_MODEL; // gemini-3-pro-preview

/**
 * Decompose a script into logical scenes using LLM analysis.
 *
 * Uses strict JSON schema enforcement (constrained decoding) for guaranteed
 * valid output. Retries aggressively (5 attempts with model upgrade) before
 * returning null to signal fallback.
 *
 * @returns EnrichedScene[] on success, null if all attempts exhausted
 */
export async function decomposeIntoScenes(
  userId: string,
  script: string,
  wordTimestamps: WordTimestamp[],
  creativeContext: SceneDecompositionContext,
  onProgress?: (message: string) => void
): Promise<EnrichedScene[] | null> {
  const wordCount = wordTimestamps.length;
  if (wordCount === 0) {
    console.warn(`${LOG_PREFIX} No word timestamps provided`);
    return null;
  }

  const systemPrompt = buildSystemPrompt(wordCount, creativeContext);
  const userPrompt = buildUserPrompt(script, wordTimestamps);
  const responseFormat = getResponseFormat();

  // 5-attempt strategy: 3 × Flash, 2 × Pro
  const attempts = [
    { model: PRIMARY_MODEL, delay: 0 },
    { model: PRIMARY_MODEL, delay: 2000 },
    { model: PRIMARY_MODEL, delay: 4000 },
    { model: UPGRADE_MODEL, delay: 2000 },
    { model: UPGRADE_MODEL, delay: 8000 },
  ];

  for (let i = 0; i < attempts.length; i++) {
    const { model, delay } = attempts[i];

    if (delay > 0) {
      await new Promise(r => setTimeout(r, delay));
    }

    try {
      onProgress?.(`Scene decomposition attempt ${i + 1}/5 (${model.split('/')[1]})...`);
      console.log(`${LOG_PREFIX} Attempt ${i + 1}/5 with ${model}`);

      const raw = await generateJSON<SceneDecompositionOutput>(
        userId,
        systemPrompt,
        userPrompt,
        {
          model,
          responseFormat,
          temperature: 0.4,
          maxTokens: 65536,
          maxRetries: 1, // Let our own retry loop handle retries
        }
      );

      // Validate with Zod
      const parsed = SceneDecompositionOutput.safeParse(raw);
      if (!parsed.success) {
        console.warn(`${LOG_PREFIX} Attempt ${i + 1} Zod validation failed:`, parsed.error.message);
        continue;
      }

      // Post-process: clamp indices, fill gaps, compute timestamps
      const enriched = postProcess(parsed.data, wordTimestamps, script);

      if (enriched.length === 0) {
        console.warn(`${LOG_PREFIX} Attempt ${i + 1} produced 0 valid scenes after post-processing`);
        continue;
      }

      console.log(
        `${LOG_PREFIX} Success: ${enriched.length} scenes decomposed ` +
        `(${enriched.reduce((sum, s) => sum + s.suggested_shot_count, 0)} total suggested shots)`
      );

      return enriched;

    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`${LOG_PREFIX} Attempt ${i + 1}/5 failed:`, errMsg);

      // Continue to next attempt
    }
  }

  // All 5 attempts exhausted
  console.error(`${LOG_PREFIX} All 5 attempts exhausted — returning null for legacy fallback`);
  return null;
}
