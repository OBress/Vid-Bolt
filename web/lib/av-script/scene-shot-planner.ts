/**
 * Scene Shot Planner
 * ============================================================================
 * Per-scene LLM shot planning that replaces the batch-of-10
 * chunked-processor.ts pipeline.
 *
 * Given a single scene (from the scene decomposer), plans individual shots
 * with full creative attention, including:
 * - Media type decisions (video, motiongraphic)
 * - Narrative beat classification (9 director-level purposes)
 * - Scene continuity + angle change directives
 * - Stock-worthiness and search queries
 * - Sound effects
 *
 * Uses strict JSON schema enforcement (constrained decoding) and the
 * same 5-attempt retry strategy as the scene decomposer.
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { generateJSON, QUALITY_REVIEW_MODEL } from '@/lib/ai/openrouter';
import { NarrativeBeat } from '@/lib/types/closed-loop';
import {
  MOTION_GRAPHICS_MODES,
  MOTION_GRAPHICS_TEMPLATE_TYPES,
  PERSISTENT_GRAPHIC_TYPES,
  type GraphicStatePatch,
  type MotionGraphicsMode,
  type MotionGraphicsTemplateType,
  type PersistentGraphicType,
} from '@/types/video';
import {
  getRecommendedPlaceholderCount,
  hasMeaningfulGraphicPatch,
  inferTemplateType,
  resolveMotionGraphicsMode,
} from '@/lib/services/motion-graphics/strategy';
import type { EnrichedScene, WordTimestamp } from './scene-decomposer';

// ============================================================================
// TYPES
// ============================================================================

/**
 * A single planned shot within a scene, as returned by the LLM.
 */
const SceneShotOutput = z.object({
  start_word_index: z.number().int(),
  end_word_index: z.number().int(),
  summary: z.string(),
  narrative_beat: NarrativeBeat,
  media_type: z.enum(['video', 'motiongraphic']),
  visual_description: z.string(),
  visual_elements: z.array(z.string()),
  stock_worthy: z.boolean(),
  stock_search_query: z.string(),
  synthesis_mode: z.enum(['T2V', 'I2V']),
  continuity_from_previous: z.boolean(),
  angle_change: z.string(),
  image_count: z.number().int().min(1).max(6).optional(),
  image_edit_instruction: z.string(),
  mg_mode: z.enum(MOTION_GRAPHICS_MODES).optional(),
  template_type: z.enum(MOTION_GRAPHICS_TEMPLATE_TYPES).optional(),
  persistent_graphic_id: z.string().optional(),
  persistent_graphic_type: z.enum(PERSISTENT_GRAPHIC_TYPES).optional(),
  graphic_state_patch: z.object({
    headline: z.string().optional(),
    notes: z.array(z.string()).optional(),
    add_labels: z.array(z.string()).optional(),
    remove_labels: z.array(z.string()).optional(),
    focus_label: z.string().optional(),
    status: z.enum(['introduced', 'updated', 'revealed', 'resolved']).optional(),
  }).optional(),
  sound_effects: z.array(z.object({
    type: z.string(),
    description: z.string(),
    anchor_word: z.string(),
  })),
});

const SceneShotPlanOutput = z.object({
  shots: z.array(SceneShotOutput),
});
export type SceneShotPlanOutput = z.infer<typeof SceneShotPlanOutput>;

/**
 * A fully enriched planned shot with computed timestamps and scene metadata.
 */
export interface EnrichedPlannedShot {
  segment_index: number;
  start_seconds: number;
  end_seconds: number;
  duration_seconds: number;
  text: string;
  summary: string;
  content_type: string;           // backward compat: populated from narrative_beat
  media_type: 'video' | 'motiongraphic';
  synthesis_mode: 'T2V' | 'I2V';
  visual_description: string;
  visual_elements: string[];
  stock_worthy: boolean;
  stock_search_query?: string;
  sound_effects: Array<{
    type: string;
    description: string;
    trigger_at_seconds: number;
    anchor_word?: string;
  }>;
  image_count: number;
  visual_treatment?: 'stock' | 'archival' | 'mg_template' | 'ai_image' | 'ai_video' | 'hybrid';
  mg_mode?: MotionGraphicsMode;
  template_type?: MotionGraphicsTemplateType;
  scene_id: string;
  narrative_beat: string;
  continuity_from_previous: boolean;
  angle_change?: string;
  image_edit_instruction?: string;
  persistent_graphic_id?: string;
  persistent_graphic_type?: PersistentGraphicType;
  graphic_state_patch?: GraphicStatePatch;
  entity_refs: string[];
}

// ============================================================================
// JSON SCHEMA (for constrained decoding)
// ============================================================================

const SCENE_SHOT_PLAN_JSON_SCHEMA = zodToJsonSchema(
  SceneShotPlanOutput as any,
  { name: 'scene_shot_plan', target: 'openApi3' }
);

function getResponseFormat() {
  const schema = SCENE_SHOT_PLAN_JSON_SCHEMA;
  return {
    type: 'json_schema' as const,
    json_schema: {
      name: 'scene_shot_plan',
      strict: true,
      schema: (schema as any).definitions?.scene_shot_plan || schema,
    },
  };
}

// ============================================================================
// PROMPT CONSTRUCTION
// ============================================================================

const LOG_PREFIX = '[SceneShotPlanner]';

interface AdjacentContext {
  previousScene?: {
    description: string;
    shots: Array<{ summary: string; visual_description: string; media_type: string }>;
  };
  nextScene?: {
    description: string;
    narrative_purpose: string;
  };
}

function buildSystemPrompt(
  orchestratorPrompt: string | undefined,
  scene: EnrichedScene,
  adjacentContext: AdjacentContext
): string {
  const parts: string[] = [];

  // Use the orchestrator's carefully constructed prompt as the base
  if (orchestratorPrompt) {
    parts.push(orchestratorPrompt);
  }

  // Scene-specific directives
  parts.push(`\n═══ SCENE-SPECIFIC CONTEXT ═══
You are planning shots for ONE scene. Give each shot your full creative attention.

SCENE: "${scene.description}"
NARRATIVE PURPOSE: ${scene.narrative_purpose}
PACING INTENT: ${scene.pacing_intent}
SUGGESTED SHOT COUNT: ${scene.suggested_shot_count}
VISUAL CONTINUITY: ${scene.visual_continuity ? 'YES — shots in this scene can share visual DNA' : 'NO — each shot is visually independent'}
WORD RANGE: ${scene.start_word_index} to ${scene.end_word_index} (${scene.end_word_index - scene.start_word_index + 1} words)`);

  // Adjacent scene context
  if (adjacentContext.previousScene) {
    const prev = adjacentContext.previousScene;
    const lastShot = prev.shots[prev.shots.length - 1];
    parts.push(`\nPREVIOUS SCENE: "${prev.description}"
Last shot: "${lastShot?.summary || 'N/A'}" (${lastShot?.media_type || 'unknown'})
→ Consider how your FIRST shot transitions from this.`);
  } else {
    parts.push(`\nThis is the FIRST scene — the hook. Make it impactful and fast-paced.`);
  }

  if (adjacentContext.nextScene) {
    parts.push(`\nNEXT SCENE: "${adjacentContext.nextScene.description}" (${adjacentContext.nextScene.narrative_purpose})
→ Consider how your LAST shot transitions into this.`);
  } else {
    parts.push(`\nThis is the LAST scene. End with resolution or a strong closing visual.`);
  }

  // Shot planning rules
  parts.push(`\n═══ SHOT PLANNING RULES ═══
WORD INDICES:
- All start_word_index and end_word_index must be integers in range [${scene.start_word_index}, ${scene.end_word_index}]
- First shot MUST start at word index ${scene.start_word_index}
- Last shot MUST end at word index ${scene.end_word_index}
- Shots must be contiguous — no gaps between shots
- Cuts can happen mid-sentence — visual rhythm is independent of narration

NARRATIVE BEATS — every shot MUST have one:
- hook: Grab attention (typically first 3-15s of video)
- establishing: Set the scene, introduce the topic/location
- buildup: Stack information, increase tension
- detail: Zoom in on specific evidence or element
- reveal: Payoff moment — show the key thing
- reaction: Emotional weight — let it land, give the viewer time
- transition: Bridge between topics or ideas
- climax: Peak dramatic moment
- resolution: Wrap up, conclude

SCENE CONTINUITY (angle_change):
- Use continuity_from_previous: true + angle_change when consecutive shots should feel like they're in the SAME physical location — like multiple camera angles on a film set.
- Use continuity_from_previous: false when the visual should change completely (new location, concept, topic shift).
- NOT every shot in a scene needs continuity — use it purposefully, not by default.
- The FIRST shot in a scene should use synthesis_mode: "T2V" and continuity_from_previous: false.
- For continuity shots: synthesis_mode should be "I2V" — downstream, the last frame of the previous shot will be image-edited with your angle_change directive, then used as the starting frame for a new video.
- angle_change examples: "shift to close-up of subject's face", "pull back to wide establishing shot", "change to overhead angle", "pan left to reveal environment"
- Set angle_change to empty string "" when continuity_from_previous is false.

MEDIA TYPE:
- "video": Dynamic scenes with motion, action, environment reveals
- "motiongraphic": Stats, lists, text overlays, infographics, data visualization

STOCK MEDIA:
- stock_worthy: true ONLY when the narration references specific real-world entities (people, places, events)
- stock_search_query: 2-4 word search query. Set to empty string "" when stock_worthy is false.

SOUND EFFECTS:
- Add sound_effects only where they genuinely enhance the experience. Less is more.
- anchor_word: the word in the narration that the SFX should align with. Set to empty string "" if not applicable.

CREATIVE IMAGE EDITING (image_edit_instruction):
- Use this to apply a creative edit to the shot's base image BEFORE it's used for anything (video generation, motion graphic composition, overlay display, etc.).
- This is NOT the same as angle_change — angle_change is specifically for I2V continuity (editing the previous shot's last frame).
- image_edit_instruction edits the shot's OWN keyframe or stock image for creative effect.
- Examples: "add a crown to the person's head", "make the background apocalyptic", "highlight the chart data in red", "add dramatic storm clouds", "overlay a red X across the image"
- Set to empty string "" when no creative edit is needed (most shots won't need this).
- Use sparingly and purposefully — only when the edit genuinely enhances storytelling.

MOTION GRAPHICS STRATEGY:
- If media_type is "motiongraphic", ALSO decide whether the shot should use mg_mode "template" or "freeform".
- Use mg_mode: "template" for deterministic documentary graphics such as maps, route traces, timelines, evidence boards, document callouts, quote cards, lower thirds, photo montages, comparison boards, and process diagrams.
- Use mg_mode: "freeform" only when the motion graphic truly needs bespoke animated treatment that doesn't fit a documentary template.
- template_type is optional, but when mg_mode is "template" you should usually provide one of:
  map_focus, route_trace, timeline, evidence_board, document_callout, quote_card, lower_third, photo_montage, comparison_board, process_diagram
- Use image_count > 1 when the template would benefit from multiple stills, especially for evidence boards, photo montages, and comparison boards.

PERSISTENT GRAPHICS:
- When a board/map/timeline/relationship graphic should evolve across multiple shots, provide persistent_graphic_id and persistent_graphic_type.
- Reuse the SAME persistent_graphic_id for every shot that updates the same graphic.
- persistent_graphic_type should be one of:
  crime_board, relationship_board, investigation_wall, timeline_board, route_map, evidence_dossier, entity_comparison, state_of_story
- Use graphic_state_patch to describe what changes in this shot:
  - headline: optional new title
  - notes: short note cards or annotations to add
  - add_labels: new labels/items to introduce
  - remove_labels: labels/items that should be removed or marked resolved
  - focus_label: which label/item should be emphasized now
  - status: introduced, updated, revealed, or resolved
- Only use persistent graphics when they add real narrative continuity. Do NOT force them into every scene.`);

  return parts.join('\n');
}

function buildUserPrompt(scene: EnrichedScene): string {
  return `Plan the shots for this scene:

SCENE TEXT (word indices ${scene.start_word_index}-${scene.end_word_index}):
"${scene.text}"

Generate the shot plan JSON for this scene.`;
}

function inferVisualTreatment(
  mediaType: 'video' | 'motiongraphic',
  stockWorthy: boolean,
  mgMode?: MotionGraphicsMode,
  visualElements: string[] = [],
): EnrichedPlannedShot['visual_treatment'] {
  if (mediaType === 'motiongraphic') {
    return mgMode === 'template' ? 'mg_template' : 'hybrid';
  }
  if (stockWorthy || visualElements.some((tag) => tag.startsWith('stock_'))) return 'stock';
  if (visualElements.includes('ai_image')) return 'ai_image';
  return 'ai_video';
}

// ============================================================================
// POST-PROCESSING
// ============================================================================

/**
 * Validate and fix shot word indices within a scene, then compute timestamps.
 */
function postProcessSceneShots(
  raw: SceneShotPlanOutput,
  scene: EnrichedScene,
  wordTimestamps: WordTimestamp[],
  sceneIndex: number,
  globalSegmentOffset: number
): EnrichedPlannedShot[] {
  const words = wordTimestamps.map(w => w.word);

  // Sort shots by start_word_index
  const shots = [...raw.shots].sort((a, b) => a.start_word_index - b.start_word_index);

  if (shots.length === 0) {
    // Create a single fallback shot covering the entire scene
    console.warn(`${LOG_PREFIX} Scene "${scene.scene_id}" returned 0 shots, creating single fallback`);
    return [{
      segment_index: globalSegmentOffset,
      start_seconds: scene.start_seconds,
      end_seconds: scene.end_seconds,
      duration_seconds: scene.end_seconds - scene.start_seconds,
      text: scene.text,
      summary: scene.description,
      content_type: 'concept',
      media_type: 'video',
      synthesis_mode: 'T2V',
      visual_description: scene.description,
      visual_elements: [],
      stock_worthy: false,
      sound_effects: [],
      image_count: 1,
      scene_id: scene.scene_id,
      narrative_beat: 'establishing',
      continuity_from_previous: false,
      entity_refs: [],
    }];
  }

  // Clamp indices to scene range
  for (const shot of shots) {
    shot.start_word_index = Math.max(
      scene.start_word_index,
      Math.min(scene.end_word_index, Math.round(shot.start_word_index))
    );
    shot.end_word_index = Math.max(
      scene.start_word_index,
      Math.min(scene.end_word_index, Math.round(shot.end_word_index))
    );

    if (shot.start_word_index > shot.end_word_index) {
      const temp = shot.start_word_index;
      shot.start_word_index = shot.end_word_index;
      shot.end_word_index = temp;
    }
  }

  // Fix first shot to start at scene start
  shots[0].start_word_index = scene.start_word_index;

  // Fix last shot to end at scene end
  shots[shots.length - 1].end_word_index = scene.end_word_index;

  // Fill gaps between shots
  for (let i = 1; i < shots.length; i++) {
    const prev = shots[i - 1];
    const curr = shots[i];

    if (curr.start_word_index > prev.end_word_index + 1) {
      prev.end_word_index = curr.start_word_index - 1;
    }

    if (curr.start_word_index <= prev.end_word_index) {
      curr.start_word_index = prev.end_word_index + 1;
    }

    if (curr.start_word_index > curr.end_word_index) {
      shots.splice(i, 1);
      i--;
    }
  }

  // First shot in a scene always uses T2V and no continuity
  if (shots.length > 0) {
    shots[0].continuity_from_previous = false;
    shots[0].synthesis_mode = 'T2V';
    shots[0].angle_change = '';
  }

  // Convert to enriched shots
  return shots.map((shot, i): EnrichedPlannedShot => {
    const startSec = wordTimestamps[shot.start_word_index].start_seconds;
    const endSec = wordTimestamps[shot.end_word_index].end_seconds;
    const text = words.slice(shot.start_word_index, shot.end_word_index + 1).join(' ');
    const resolvedMgMode = shot.media_type === 'motiongraphic'
      ? resolveMotionGraphicsMode({
          prompt: shot.visual_description,
          requestedMode: shot.mg_mode,
          requestedTemplateType: shot.template_type,
          imageCount: shot.image_count || 1,
          persistentGraphicType: shot.persistent_graphic_type,
        })
      : undefined;
    const resolvedTemplateType = resolvedMgMode === 'template'
      ? inferTemplateType({
          prompt: shot.visual_description,
          requestedMode: resolvedMgMode,
          requestedTemplateType: shot.template_type,
          imageCount: shot.image_count || 1,
          persistentGraphicType: shot.persistent_graphic_type,
        })
      : undefined;
    const imageCount = shot.media_type === 'motiongraphic'
      ? Math.max(
          shot.image_count || 1,
          resolvedTemplateType
            ? getRecommendedPlaceholderCount(resolvedTemplateType, shot.image_count || 1)
            : 1
        )
      : 1;
    const persistentGraphicId = shot.persistent_graphic_id?.trim() || undefined;
    const graphicStatePatch = hasMeaningfulGraphicPatch(shot.graphic_state_patch)
      ? shot.graphic_state_patch
      : undefined;

    // Compute SFX timing from anchor words
    const soundEffects = shot.sound_effects
      .filter(sfx => sfx.type && sfx.description)
      .map(sfx => {
        // Try to find anchor word in the shot's word range
        let triggerAt = startSec;
        if (sfx.anchor_word) {
          for (let w = shot.start_word_index; w <= shot.end_word_index; w++) {
            if (wordTimestamps[w].word.toLowerCase().includes(sfx.anchor_word.toLowerCase())) {
              triggerAt = wordTimestamps[w].start_seconds;
              break;
            }
          }
        }
        return {
          type: sfx.type,
          description: sfx.description,
          trigger_at_seconds: triggerAt,
          anchor_word: sfx.anchor_word || undefined,
        };
      });

    return {
      segment_index: globalSegmentOffset + i,
      start_seconds: startSec,
      end_seconds: endSec,
      duration_seconds: Math.max(0.5, endSec - startSec),
      text,
      summary: shot.summary,
      content_type: shot.narrative_beat, // backward compat
      media_type: shot.media_type,
      synthesis_mode: shot.synthesis_mode,
      visual_description: shot.visual_description,
      visual_elements: shot.visual_elements,
      stock_worthy: shot.stock_worthy,
      stock_search_query: shot.stock_search_query || undefined,
      sound_effects: soundEffects,
      image_count: imageCount,
      visual_treatment: inferVisualTreatment(
        shot.media_type,
        shot.stock_worthy,
        resolvedMgMode,
        shot.visual_elements,
      ),
      mg_mode: resolvedMgMode,
      template_type: resolvedTemplateType,
      scene_id: scene.scene_id,
      narrative_beat: shot.narrative_beat,
      continuity_from_previous: shot.continuity_from_previous,
      angle_change: shot.continuity_from_previous && shot.angle_change
        ? shot.angle_change
        : undefined,
      image_edit_instruction: shot.image_edit_instruction
        ? shot.image_edit_instruction
        : undefined,
      persistent_graphic_id: persistentGraphicId,
      persistent_graphic_type: shot.persistent_graphic_type || undefined,
      graphic_state_patch: graphicStatePatch,
      entity_refs: [],
    };
  });
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

const PRIMARY_MODEL = 'google/gemini-3-flash-preview';
const UPGRADE_MODEL = QUALITY_REVIEW_MODEL;

/**
 * Plan shots for a single scene using LLM analysis.
 *
 * @returns EnrichedPlannedShot[] on success, null if all attempts exhausted
 */
export async function planSceneShots(
  userId: string,
  scene: EnrichedScene,
  wordTimestamps: WordTimestamp[],
  orchestratorPrompt: string | undefined,
  adjacentContext: AdjacentContext,
  sceneIndex: number,
  globalSegmentOffset: number,
): Promise<EnrichedPlannedShot[] | null> {
  const systemPrompt = buildSystemPrompt(orchestratorPrompt, scene, adjacentContext);
  const userPrompt = buildUserPrompt(scene);
  const responseFormat = getResponseFormat();

  // 5-attempt strategy
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
      console.log(`${LOG_PREFIX} Scene "${scene.scene_id}" attempt ${i + 1}/5 with ${model}`);

      const raw = await generateJSON<SceneShotPlanOutput>(
        userId,
        systemPrompt,
        userPrompt,
        {
          model,
          responseFormat,
          temperature: 0.5,
          maxTokens: 4096,
          maxRetries: 1,
        }
      );

      const parsed = SceneShotPlanOutput.safeParse(raw);
      if (!parsed.success) {
        console.warn(
          `${LOG_PREFIX} Scene "${scene.scene_id}" attempt ${i + 1} Zod validation failed:`,
          parsed.error.message
        );
        continue;
      }

      const enriched = postProcessSceneShots(
        parsed.data,
        scene,
        wordTimestamps,
        sceneIndex,
        globalSegmentOffset
      );

      if (enriched.length === 0) {
        console.warn(`${LOG_PREFIX} Scene "${scene.scene_id}" attempt ${i + 1} produced 0 valid shots`);
        continue;
      }

      console.log(
        `${LOG_PREFIX} Scene "${scene.scene_id}" planned: ${enriched.length} shots ` +
        `(${enriched.map(s => s.narrative_beat).join(', ')})`
      );

      return enriched;

    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`${LOG_PREFIX} Scene "${scene.scene_id}" attempt ${i + 1}/5 failed:`, errMsg);
    }
  }

  console.error(`${LOG_PREFIX} Scene "${scene.scene_id}" all 5 attempts exhausted — returning null`);
  return null;
}

/**
 * Plan shots for all scenes sequentially, accumulating context.
 *
 * Each scene is planned with awareness of the previous scene's shots
 * and the next scene's description for coherent transitions.
 *
 * If a single scene fails all 5 attempts, returns null for that scene
 * to trigger per-scene legacy fallback by the caller.
 *
 * @returns Array of { scene, shots } pairs, where shots may be null for failed scenes
 */
export async function planAllSceneShots(
  userId: string,
  scenes: EnrichedScene[],
  wordTimestamps: WordTimestamp[],
  orchestratorPrompt: string | undefined,
  onProgress?: (message: string, sceneIndex: number) => void
): Promise<Array<{ scene: EnrichedScene; shots: EnrichedPlannedShot[] | null }>> {
  const results: Array<{ scene: EnrichedScene; shots: EnrichedPlannedShot[] | null }> = [];
  let globalSegmentOffset = 0;

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];

    onProgress?.(`Planning scene ${i + 1}/${scenes.length}: "${scene.description.substring(0, 50)}..."`, i);

    // Build adjacent context from previously planned scenes
    const adjacentContext: AdjacentContext = {};

    if (i > 0 && results[i - 1]?.shots) {
      const prevResult = results[i - 1];
      adjacentContext.previousScene = {
        description: prevResult.scene.description,
        shots: prevResult.shots!.map(s => ({
          summary: s.summary,
          visual_description: s.visual_description,
          media_type: s.media_type,
        })),
      };
    }

    if (i < scenes.length - 1) {
      adjacentContext.nextScene = {
        description: scenes[i + 1].description,
        narrative_purpose: scenes[i + 1].narrative_purpose,
      };
    }

    const shots = await planSceneShots(
      userId,
      scene,
      wordTimestamps,
      orchestratorPrompt,
      adjacentContext,
      i,
      globalSegmentOffset
    );

    results.push({ scene, shots });

    if (shots) {
      globalSegmentOffset += shots.length;
    } else {
      // Estimate segment offset for fallback shots
      globalSegmentOffset += scene.suggested_shot_count;
    }
  }

  return results;
}
