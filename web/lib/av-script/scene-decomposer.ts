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
import { getFormatProfile, type FormatProfile } from './format-profiles';

// ============================================================================
// DEBUG CAPTURE INTERFACE
// ============================================================================

/**
 * Optional callbacks for capturing LLM call inputs/outputs during a debug run.
 * Injected into core pipeline functions by the ShotPlannerDebugger dev tool.
 * All fields are optional — the callbacks are never called in production
 * because the parameter itself is never passed from any production call site.
 */
export interface DebugCapture {
  /** Called with the full system prompt before each LLM attempt. */
  onSystemPrompt?: (phase: string, attempt: number, prompt: string) => void;
  /** Called with the full user prompt before each LLM attempt. */
  onUserPrompt?: (phase: string, attempt: number, prompt: string) => void;
  /** Called with the raw LLM response object after a successful attempt. */
  onLLMResponse?: (phase: string, attempt: number, response: unknown) => void;
  /** Called when an attempt fails before retrying. */
  onError?: (phase: string, attempt: number, error: string) => void;
}

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
 * The LLM first maps the emotional arc (Step 1), then builds scenes around it (Step 2).
 * emotional_arc is optional — if the model omits it the pipeline continues without issue.
 */
const SceneDecompositionOutput = z.object({
  emotional_arc: z.array(z.object({
    label: z.string(),
    register: z.enum([
      'neutral', 'intrigue', 'tension', 'grief',
      'revelation', 'climax', 'resolution', 'anger', 'awe', 'hope',
    ]),
    position_pct: z.number(),
    requires_human_perspective: z.boolean(),
  })).optional(),
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
  creativeContext: SceneDecompositionContext,
  wordsPerSecond: number
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
  if (creativeContext.masterCreativePrompt) {
    parts.push(`MASTER CREATIVE DIRECTION: ${creativeContext.masterCreativePrompt}`);
  }
  if (creativeContext.videoCreativePrompt) {
    parts.push(`VIDEO-SPECIFIC DIRECTION: ${creativeContext.videoCreativePrompt}`);
  }
  if (creativeContext.directingIntent) {
    parts.push(`DIRECTING INTENT: ${creativeContext.directingIntent}`);
  }
  if (creativeContext.loraName) {
    parts.push(`STYLE MODEL: ${creativeContext.loraName}`);
  }
  if (creativeContext.qualityAnchors?.length) {
    parts.push(`QUALITY ANCHORS: ${creativeContext.qualityAnchors.join(', ')}`);
  }
  if (creativeContext.transitionPalette?.length) {
    parts.push(`PREFERRED TRANSITIONS: ${creativeContext.transitionPalette.join(', ')}`);
  }
  if (creativeContext.shotVocab?.length) {
    parts.push(`SHOT VOCABULARY: ${creativeContext.shotVocab.join(', ')}`);
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

  // Temporal pacing — give the LLM real numbers to reason about
  const approxSecondsPerWord = (1 / wordsPerSecond).toFixed(3);
  parts.push(`\nTEMPORAL PACING — CRITICAL FOR SHOT COUNT:
This script runs at approximately ${wordsPerSecond.toFixed(2)} words/second (~${approxSecondsPerWord}s per word).

When assigning suggested_shot_count, think in TIME and pacing_intent together.
A scene's approximate duration = (end_word_index - start_word_index + 1) / ${wordsPerSecond.toFixed(2)}

Shot count guidance by duration AND pacing intent:
- fast / climactic scenes: target a shot every 1–4 seconds
- building / moderate scenes: target a shot every 2–7 seconds
- slow scenes: target a shot every 4–11 seconds

General scale reference:
- ~5s scene  → 1-2 shots
- ~10s scene → 2-3 shots (fast) / 1-2 shots (slow)
- ~20s scene → 4-8 shots (fast) / 2-4 shots (slow)
- ~40s scene → 8-16 shots (fast) / 4-8 shots (slow)
- ~60s scene → 12-24 shots (fast) / 6-12 shots (slow)
- 60s+ scene → NEVER acceptable. Any section over 60s contains multiple distinct emotional beats.

A 30-second scene with 2 shots forces 15-second static holds — a viewer experience failure.
A single dramatic revelation CAN hold for 8-10s if the narration genuinely demands stillness.
But the default should be active editing — shots that breathe and move.

SCENE SIZE HARD LIMIT: No scene may exceed 60 seconds (~${Math.round(wordsPerSecond * 60)} words).
If you feel a section only deserves one scene, look harder — it almost certainly has 2-4
distinct beats hiding inside it. Find them. Separate them.`);

  parts.push(`\nDIRECTOR MINDSET:
- Think like a premium documentary director. Every scene must serve a clear narrative purpose.
- Design a pacing rollercoaster — oscillate between high-energy and low-energy moments.
- Emotional pivot points in the script are natural scene boundaries. Grief, revelation, and
  climax beats must not be absorbed into longer mixed-purpose scenes — they earn their own space.
- The hook (first scene) should be fast-paced and visceral. Do not open with exposition.
- Transitions between major topics deserve their own short scene.
- A single dramatic line can be its own scene with 1 shot.
- A long explanatory section might be one scene with 5+ shots.
- Let the narrative rhythm drive your decisions, not arbitrary rules.
- THE FINAL ACT deserves the same granularity as the opening. A conclusion is NOT a single
  "reflective" blob — it has distinct beats: the verdict, the settlement, the new revelation,
  the lasting warning. Each of those is a separate scene with a separate emotional register.

PACING ≠ ON-SCREEN MOTION:
"fast" pacing means more frequent cuts between shots — not faster movement within each shot.
A rapid montage of still shots cut at 1.5 seconds each is extremely high energy.
"slow" pacing means longer holds — the camera lingers and the composition breathes.
The shot planner will handle motion decisions; your job is editorial rhythm.`);

  // Format editorial brief — natural language creative context, not constraints
  if (creativeContext.formatProfile) {
    const fp = creativeContext.formatProfile;
    parts.push(`\nFORMAT: ${fp.name.toUpperCase()}
${fp.editorialBrief}

PACING CHARACTER: ${fp.pacingCharacter}
B-ROLL PHILOSOPHY: ${fp.brollPhilosophy}
HUMAN PERSPECTIVE: ${fp.humanPerspectiveGuidance}
MOTION GRAPHICS: ${fp.mgPhilosophy}`);
  }

  parts.push(`\nSTEP 1 — READ THE EMOTIONAL SHAPE:
Before defining scene boundaries, briefly identify 6–10 key emotional moments in the script.
For each moment, note:
  - label: a brief name for the moment ("The crash", "Victim count revealed")
  - register: the emotional character (neutral / intrigue / tension / grief / revelation / climax / resolution / anger / awe / hope)
  - position_pct: roughly where it falls in the video (0–100%)
  - requires_human_perspective: true if a named individual's experience would make this moment more human

Emotional pivot points are natural scene boundaries.
Grief, revelation, and climax beats must not be absorbed into longer exposition scenes.
Record this arc in the emotional_arc field before writing any scenes.

Pay particular attention to the FINAL ACT. Closing sections almost always contain multiple
distinct emotional registers — relief, grief, civic judgment, hope. Do not collapse the
entire conclusion into one generic "reflection" scene. A 130-second final act with one scene
entry is a decomposition failure. Find the distinct beats inside it.

STEP 2 — BUILD SCENES THAT HONOUR THE SHAPE:
Use the emotional arc from Step 1 to decide where scene boundaries fall.
Each scene should serve one emotional register, not several competing ones.
Your scenes should reflect the arc — do not override it with arbitrary groupings.
Verify before submitting: does any scene exceed 60 seconds? If so, split it.`);

  return parts.join('\n');
}

function buildUserPrompt(
  script: string,
  wordTimestamps: WordTimestamp[],
  wordsPerSecond: number
): string {
  const totalDuration = wordTimestamps.length > 0
    ? wordTimestamps[wordTimestamps.length - 1].end_seconds
    : 0;
  const exampleWords = Math.round(wordsPerSecond * 5);

  return `Here is the script (${wordTimestamps.length} words, ${totalDuration.toFixed(1)}s total, ~${wordsPerSecond.toFixed(2)} words/second):

Use the narration rate to estimate scene durations when assigning shot counts.
Example: ${exampleWords} words ≈ 5 seconds. A 100-word scene ≈ ${(100 / wordsPerSecond).toFixed(0)}s at this pace.

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
  masterCreativePrompt?: string;
  videoCreativePrompt?: string;
  directingIntent?: string;
  qualityAnchors?: string[];
  loraName?: string;
  transitionPalette?: string[];
  shotVocab?: string[];
  formatProfile?: FormatProfile;
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
  const genre = manifest.script_context?.genre;
  return {
    style: manifest.style?.visual_style,
    aspectRatio: manifest.style?.aspect_ratio,
    genre,
    tone: manifest.script_context?.tone_style,
    targetAudience: manifest.script_context?.target_audience,
    masterCreativePrompt: manifest.master_creative_prompt,
    videoCreativePrompt: manifest.video_creative_prompt,
    directingIntent: manifest.directing_intent,
    qualityAnchors: manifest.visual?.quality_anchors,
    loraName: manifest.lora?.name,
    transitionPalette: manifest.video_grammar_profile?.transition_palette,
    shotVocab: manifest.video_grammar_profile?.shot_vocab,
    formatProfile: getFormatProfile(genre),
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
 * Math guardrails for shot count bounds — derived from pacing_intent.
 * These prevent timing contradictions (a 15-second "fast" shot) without
 * encoding any editorial taste. All creative decisions remain with the LLM.
 *
 * floor: minimum shots = ceil(duration / maxSecondsPerShot)
 * ceiling: maximum shots = floor(duration / minSecondsPerShot)
 */
const PACING_DENSITY: Record<PacingIntent, {
  maxSecondsPerShot: number;
  minSecondsPerShot: number;
}> = {
  fast:      { maxSecondsPerShot: 3.5,  minSecondsPerShot: 0.8 },
  building:  { maxSecondsPerShot: 5.5,  minSecondsPerShot: 1.5 },
  climactic: { maxSecondsPerShot: 4.0,  minSecondsPerShot: 1.0 },
  moderate:  { maxSecondsPerShot: 7.0,  minSecondsPerShot: 2.5 },
  slow:      { maxSecondsPerShot: 11.0, minSecondsPerShot: 4.0 },
};

/**
 * Enforce shot count bounds based on scene duration and pacing_intent.
 * Raises suggested_shot_count when too few, caps when absurdly many.
 * Never overrides the LLM when it's within valid range.
 */
function enforceShotCountBounds(
  scenes: EnrichedScene[],
  wordsPerSecond: number
): EnrichedScene[] {
  return scenes.map(scene => {
    const durationSeconds = scene.end_seconds - scene.start_seconds;
    const density = PACING_DENSITY[scene.pacing_intent];
    const minRequired = Math.max(1, Math.ceil(durationSeconds / density.maxSecondsPerShot));
    const maxAllowed = Math.max(minRequired, Math.floor(durationSeconds / density.minSecondsPerShot));
    let adjusted = scene.suggested_shot_count;
    if (adjusted < minRequired) {
      console.warn(
        `${LOG_PREFIX} Scene "${scene.scene_id}" [${scene.pacing_intent}] had ${adjusted} shots ` +
        `for ${durationSeconds.toFixed(1)}s — raising to ${minRequired}`
      );
      adjusted = minRequired;
    } else if (adjusted > maxAllowed) {
      console.warn(
        `${LOG_PREFIX} Scene "${scene.scene_id}" [${scene.pacing_intent}] had ${adjusted} shots ` +
        `for ${durationSeconds.toFixed(1)}s — capping to ${maxAllowed}`
      );
      adjusted = maxAllowed;
    }
    return adjusted !== scene.suggested_shot_count
      ? { ...scene, suggested_shot_count: adjusted }
      : scene;
  });
}

/**
 * Derive a reasonable shot count for a sub-scene from its duration and pacing intent.
 * Uses the PACING_DENSITY midpoint to avoid inheriting a corrupted shot count from
 * a parent scene that was planned for a completely different duration.
 */
function deriveShotCountFromPacing(pacing: PacingIntent, durationSeconds: number): number {
  const density = PACING_DENSITY[pacing] ?? PACING_DENSITY['moderate'];
  const midpoint = (density.minSecondsPerShot + density.maxSecondsPerShot) / 2;
  return Math.max(1, Math.round(durationSeconds / midpoint));
}

/**
 * Strip accumulated split suffixes from a description or narrative_purpose string
 * so that recursive splits don't double-append "— opening" / "(first half)" labels.
 */
function stripSplitSuffix(str: string): string {
  return str
    .replace(/\s+— (opening|continuing): "[^"]*\u2026"$/, '')
    .replace(/\s+\((first|second) half\)$/, '');
}

/**
 * Split any scene exceeding MAX_SCENE_DURATION_SECONDS into two contiguous sub-scenes.
 * Splits at the word midpoint, recalculates shot counts from PACING_DENSITY, preserves
 * all other fields. Runs recursively until no scene exceeds the threshold.
 */
const MAX_SCENE_DURATION_SECONDS = 50;

function splitOversizedScenes(
  scenes: EnrichedScene[],
  wordTimestamps: WordTimestamp[],
  wordsPerSecond: number,
  iteration = 0
): EnrichedScene[] {
  if (iteration > 4) return scenes; // guard against infinite recursion
  const words = wordTimestamps.map(w => w.word);
  let didSplit = false;
  const result: EnrichedScene[] = [];

  for (const scene of scenes) {
    const duration = scene.end_seconds - scene.start_seconds;
    if (duration <= MAX_SCENE_DURATION_SECONDS || scene.end_word_index <= scene.start_word_index + 1) {
      result.push(scene);
      continue;
    }

    // Split at natural word midpoint
    const midWord = Math.floor((scene.start_word_index + scene.end_word_index) / 2);
    const midStartSec = wordTimestamps[midWord + 1]?.start_seconds ?? wordTimestamps[midWord].end_seconds;
    const firstHalfDur = midStartSec - scene.start_seconds;
    const secondHalfDur = scene.end_seconds - midStartSec;
    const totalDur = scene.end_seconds - scene.start_seconds;
    // Derive shot counts fresh from PACING_DENSITY rather than inheriting proportionally from
    // the parent. The parent's suggested_shot_count was set for the original (much longer)
    // duration, so proportional inheritance produces shot counts that are far too low.
    const firstShots = deriveShotCountFromPacing(scene.pacing_intent, firstHalfDur);
    const secondShots = deriveShotCountFromPacing(scene.pacing_intent, secondHalfDur);

    // Derive distinct descriptions for each half using their opening narration words.
    // Strip any accumulated split suffixes from a prior recursive pass first — without this,
    // a second split produces double-labels like "— opening: '...' — opening: '...'".
    const ANCHOR_WORDS = 12;
    const anchorA = words
      .slice(scene.start_word_index, Math.min(scene.start_word_index + ANCHOR_WORDS, midWord + 1))
      .join(' ');
    const anchorB = words
      .slice(midWord + 1, Math.min(midWord + 1 + ANCHOR_WORDS, scene.end_word_index + 1))
      .join(' ');
    const baseDescription = stripSplitSuffix(scene.description);
    const basePurpose = stripSplitSuffix(scene.narrative_purpose);

    const sceneA: EnrichedScene = {
      ...scene,
      scene_id: `${scene.scene_id}_a`,
      description: `${baseDescription} — opening: "${anchorA}\u2026"`,
      narrative_purpose: `${basePurpose} (first half)`,
      end_word_index: midWord,
      end_seconds: wordTimestamps[midWord].end_seconds,
      text: words.slice(scene.start_word_index, midWord + 1).join(' '),
      suggested_shot_count: firstShots,
    };
    const sceneB: EnrichedScene = {
      ...scene,
      scene_id: `${scene.scene_id}_b`,
      description: `${baseDescription} — continuing: "${anchorB}\u2026"`,
      narrative_purpose: `${basePurpose} (second half)`,
      start_word_index: midWord + 1,
      start_seconds: midStartSec,
      text: words.slice(midWord + 1, scene.end_word_index + 1).join(' '),
      suggested_shot_count: secondShots,
    };

    console.warn(
      `${LOG_PREFIX} Scene "${scene.scene_id}" (${duration.toFixed(1)}s) split into ` +
      `"${sceneA.scene_id}" (${(sceneA.end_seconds - sceneA.start_seconds).toFixed(1)}s, ${firstShots} shots) ` +
      `and "${sceneB.scene_id}" (${(sceneB.end_seconds - sceneB.start_seconds).toFixed(1)}s, ${secondShots} shots)`
    );

    result.push(sceneA, sceneB);
    didSplit = true;
  }

  // Recurse if any scene was split (might still exceed threshold)
  return didSplit ? splitOversizedScenes(result, wordTimestamps, wordsPerSecond, iteration + 1) : result;
}

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
// SMART SCENE REFINEMENT — LLM-driven split for oversized scenes
// ============================================================================

/**
 * Builds a short, targeted system prompt for refining a single oversized scene.
 * Deliberately concise — the model only needs to find 2-4 beat boundaries
 * within one section of text, not reason about the entire video.
 */
function buildRefinementSystemPrompt(
  parentScene: EnrichedScene,
  durationSeconds: number,
  wordCount: number,
  wordsPerSecond: number
): string {
  return `You are a documentary editor reviewing a scene that is too long for effective visual planning.

The scene "${parentScene.scene_id}" runs ${durationSeconds.toFixed(0)} seconds (words ${parentScene.start_word_index}–${parentScene.end_word_index}) and covers multiple distinct narrative registers that were incorrectly collapsed into one.

Your job: Read the narration text below and identify 2–5 genuine emotional or narrative beat boundaries within it. Split it into sub-scenes at those boundaries.

CRITICAL RULES (MUST FOLLOW):
- Word indices must be integers in range [${parentScene.start_word_index}, ${parentScene.end_word_index}]
- Sub-scenes must be contiguous — no gaps, no overlaps
- First sub-scene MUST start at word index ${parentScene.start_word_index}
- Last sub-scene MUST end at word index ${parentScene.end_word_index}
- Each sub-scene MUST have a unique scene_id (use format: ${parentScene.scene_id}_1, ${parentScene.scene_id}_2, etc.)
- Each sub-scene should serve ONE emotional register, not multiple
- Prefer natural sentence boundaries for cuts
- Aim for sub-scenes between 20–55 seconds (~${Math.round(wordsPerSecond * 20)}–${Math.round(wordsPerSecond * 55)} words each)
- suggested_shot_count should match the sub-scene's duration and pacing_intent

Return ONLY the JSON array of sub-scenes — no commentary.`;
}

/**
 * Builds the sub-scene JSON schema for constrained decoding in refinement calls.
 * Mirrors DecomposedScene but returns an array directly.
 */
function getRefinementResponseFormat() {
  const subSceneSchema = z.object({
    scenes: z.array(z.object({
      scene_id: z.string(),
      description: z.string(),
      narrative_purpose: z.string(),
      start_word_index: z.number().int(),
      end_word_index: z.number().int(),
      suggested_shot_count: z.number().int(),
      pacing_intent: PacingIntent,
      visual_continuity: z.boolean(),
    })),
  });
  const schema = z.toJSONSchema(subSceneSchema);
  const { $schema: _, ...structuralSchema } = schema as Record<string, unknown>;
  return {
    type: 'json_schema' as const,
    json_schema: {
      name: 'scene_refinement',
      strict: true,
      schema: structuralSchema,
    },
  };
}

/**
 * For each scene that exceeds MAX_SCENE_DURATION_SECONDS, make a targeted
 * LLM call with just that scene's narration text and ask the model to find
 * the real narrative beats inside it.
 *
 * This is fundamentally better than mechanical midpoint splitting because:
 * - The model reads the ACTUAL narration it failed to decompose
 * - Split points are semantically meaningful (sentence boundaries, register shifts)
 * - Output scene IDs, descriptions, and purposes are all freshly generated
 * - No label corruption, no duplicate descriptions
 *
 * Falls back to the mechanical split if the refinement call itself fails or
 * still produces oversized output.
 */
async function refineLongScenes(
  scenes: EnrichedScene[],
  wordTimestamps: WordTimestamp[],
  wordsPerSecond: number,
  userId: string,
  onProgress?: (message: string) => void,
  debugCapture?: DebugCapture
): Promise<EnrichedScene[]> {
  const oversized = scenes.filter(s => (s.end_seconds - s.start_seconds) > MAX_SCENE_DURATION_SECONDS);

  if (oversized.length === 0) return scenes;

  const words = wordTimestamps.map(w => w.word);
  const responseFormat = getRefinementResponseFormat();
  let result = [...scenes];

  for (const scene of oversized) {
    const duration = scene.end_seconds - scene.start_seconds;
    const sceneText = words.slice(scene.start_word_index, scene.end_word_index + 1).join(' ');
    const wordCount = scene.end_word_index - scene.start_word_index + 1;

    onProgress?.(`Refining oversized scene "${scene.scene_id}" (${duration.toFixed(0)}s)...`);
    console.log(`${LOG_PREFIX} Refining "${scene.scene_id}" (${duration.toFixed(0)}s, ${wordCount} words)`);

    const systemPrompt = buildRefinementSystemPrompt(scene, duration, wordCount, wordsPerSecond);
    const userPrompt = `Here is the narration text for this scene (words ${scene.start_word_index}–${scene.end_word_index}, ${duration.toFixed(0)}s):\n\n"${sceneText}"\n\nAt ${wordsPerSecond.toFixed(2)} words/second, this runs ${duration.toFixed(0)} seconds.\n\nIdentify the distinct narrative beats within this text and split it into 2–5 sub-scenes. Return the JSON.`;

    try {
      const raw = await generateJSON<{ scenes: typeof scenes }>(  
        userId,
        systemPrompt,
        userPrompt,
        {
          model: PRIMARY_MODEL,
          responseFormat,
          temperature: 0.3,
          maxTokens: 8192,
          maxRetries: 2,
        }
      );

      // Validate the refinement output
      const refinedScenes = (raw as { scenes: DecomposedScene[] }).scenes;
      if (!Array.isArray(refinedScenes) || refinedScenes.length < 2) {
        console.warn(`${LOG_PREFIX} Refinement for "${scene.scene_id}" returned invalid data — falling back to mechanical split`);
        continue; // leave the oversized scene in place; splitOversizedScenes handles it
      }

      // Verify coverage: first must start at parent's start, last must end at parent's end
      const sorted = [...refinedScenes].sort((a, b) => a.start_word_index - b.start_word_index);
      const coversStart = sorted[0].start_word_index === scene.start_word_index;
      const coversEnd = sorted[sorted.length - 1].end_word_index === scene.end_word_index;

      if (!coversStart || !coversEnd) {
        // Clamp boundaries to guarantee coverage
        sorted[0].start_word_index = scene.start_word_index;
        sorted[sorted.length - 1].end_word_index = scene.end_word_index;
        // Patch any resulting gaps
        for (let i = 1; i < sorted.length; i++) {
          if (sorted[i].start_word_index > sorted[i - 1].end_word_index + 1) {
            sorted[i - 1].end_word_index = sorted[i].start_word_index - 1;
          }
          if (sorted[i].start_word_index <= sorted[i - 1].end_word_index) {
            sorted[i].start_word_index = sorted[i - 1].end_word_index + 1;
          }
        }
        console.warn(`${LOG_PREFIX} Refinement boundaries clamped for "${scene.scene_id}"`);
      }

      // Enrich the refined sub-scenes with timestamps and text
      const enrichedRefined: EnrichedScene[] = sorted.map(s => ({
        ...s,
        start_seconds: wordTimestamps[Math.max(0, Math.min(wordTimestamps.length - 1, s.start_word_index))].start_seconds,
        end_seconds: wordTimestamps[Math.max(0, Math.min(wordTimestamps.length - 1, s.end_word_index))].end_seconds,
        text: words.slice(s.start_word_index, s.end_word_index + 1).join(' '),
      }));

      // Replace the oversized scene in the result array
      const idx = result.findIndex(s => s.scene_id === scene.scene_id);
      if (idx !== -1) {
        result.splice(idx, 1, ...enrichedRefined);
        console.log(
          `${LOG_PREFIX} "${scene.scene_id}" refined into ${enrichedRefined.length} sub-scenes: ` +
          enrichedRefined.map(s => `"${s.scene_id}" (${(s.end_seconds - s.start_seconds).toFixed(0)}s)`).join(', ')
        );
      }

      debugCapture?.onLLMResponse?.('scene_decomposer', -1, { refinement_for: scene.scene_id, sub_scenes: enrichedRefined });

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`${LOG_PREFIX} Refinement LLM call failed for "${scene.scene_id}": ${msg} — falling back to mechanical split`);
      // Leave oversized scene in place; splitOversizedScenes will handle it
    }
  }

  return result;
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
  onProgress?: (message: string) => void,
  /** Optional debug capture callbacks — never passed in production. */
  debugCapture?: DebugCapture
): Promise<EnrichedScene[] | null> {
  const wordCount = wordTimestamps.length;
  if (wordCount === 0) {
    console.warn(`${LOG_PREFIX} No word timestamps provided`);
    return null;
  }

  // Compute narration rate from word timestamps
  const totalDuration = wordTimestamps[wordCount - 1].end_seconds;
  const wordsPerSecond = totalDuration > 0 ? wordCount / totalDuration : 2.5;

  const systemPrompt = buildSystemPrompt(wordCount, creativeContext, wordsPerSecond);
  const userPrompt = buildUserPrompt(script, wordTimestamps, wordsPerSecond);
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

      // Debug capture: emit prompts before the LLM call
      debugCapture?.onSystemPrompt?.('scene_decomposer', i, systemPrompt);
      debugCapture?.onUserPrompt?.('scene_decomposer', i, userPrompt);

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

      // Debug capture: emit raw response after the LLM call
      debugCapture?.onLLMResponse?.('scene_decomposer', i, raw);

      // Validate with Zod
      const parsed = SceneDecompositionOutput.safeParse(raw);
      if (!parsed.success) {
        console.warn(`${LOG_PREFIX} Attempt ${i + 1} Zod validation failed:`, parsed.error.message);
        debugCapture?.onError?.('scene_decomposer', i, `Zod validation failed: ${parsed.error.message}`);
        continue;
      }

      // Post-process: clamp indices, fill gaps, compute timestamps
      let enriched = postProcess(parsed.data, wordTimestamps, script);

      if (enriched.length === 0) {
        console.warn(`${LOG_PREFIX} Attempt ${i + 1} produced 0 valid scenes after post-processing`);
        debugCapture?.onError?.('scene_decomposer', i, 'Post-processing produced 0 valid scenes');
        continue;
      }

      // Primary strategy: LLM-driven refinement of any oversized scenes.
      // This makes a targeted follow-up LLM call with the actual narration text
      // of each oversized scene, asking the model to find the real narrative beats.
      // The mechanical midpoint split below is only a last-resort fallback.
      enriched = await refineLongScenes(
        enriched, wordTimestamps, wordsPerSecond, userId, onProgress, debugCapture
      );

      // Fallback: mechanical split for any scenes that the refinement call
      // itself still left oversized (e.g. API failure or model returned only 1 sub-scene).
      enriched = splitOversizedScenes(enriched, wordTimestamps, wordsPerSecond);

      // Enforce shot count bounds based on pacing_intent (raises floor, caps ceiling)
      enriched = enforceShotCountBounds(enriched, wordsPerSecond);

      console.log(
        `${LOG_PREFIX} Success: ${enriched.length} scenes decomposed ` +
        `(${enriched.reduce((sum, s) => sum + s.suggested_shot_count, 0)} total suggested shots)`
      );

      return enriched;

    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`${LOG_PREFIX} Attempt ${i + 1}/5 failed:`, errMsg);
      debugCapture?.onError?.('scene_decomposer', i, errMsg);

      // Continue to next attempt
    }
  }

  // All 5 attempts exhausted
  console.error(`${LOG_PREFIX} All 5 attempts exhausted — returning null for legacy fallback`);
  return null;
}
