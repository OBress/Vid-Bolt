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
  media_type: z.enum(['video', 'image', 'motiongraphic']),
  visual_description: z.string(),
  visual_elements: z.array(z.string()),
  shot_role: z.enum([
    'hook',
    'establish',
    'coverage',
    'insert',
    'bridge',
    'annotation',
    'payoff',
    'reaction',
    'graphic_explainer',
    'closing',
  ]).default('coverage'),
  framing: z.enum([
    'extreme_wide',
    'wide',
    'medium_wide',
    'medium',
    'medium_close',
    'close_up',
    'extreme_close',
  ]).default('medium'),
  camera_angle: z.enum([
    'eye_level',
    'low_angle',
    'high_angle',
    'overhead',
    'top_down',
    'profile',
    'macro_detail',
    'first_person',
    'dutch',
  ]).default('eye_level'),
  camera_motion: z.enum([
    'static',
    'push_in',
    'pull_out',
    'pan_left',
    'pan_right',
    'tilt_up',
    'tilt_down',
    'orbit',
    'tracking',
    'handheld',
    'crane',
    'zoom_in',
    'zoom_out',
    'freeze_orbit',
  ]).default('static'),
  lens_style: z.string().default(''),
  subject_focus: z.string().default(''),
  entry_transition_intent: z.string().default(''),
  exit_transition_intent: z.string().default(''),
  bridge_subject: z.string().default(''),
  visual_motif: z.string().default(''),
  continuity_level: z.enum(['fresh', 'soft', 'strict']).default('soft'),
  anchor_strategy: z.enum(['fresh', 'scene_anchor', 'prev_frame', 'prev_keyframe']).default('fresh'),
  render_strategy: z.enum([
    'ai_video',
    'ai_image',
    'stock',
    'motiongraphic',
    'segment_animate',
    'segment_video_fx',
    'segment_mask_prep',
  ]).default('ai_video'),
  trim_priority: z.enum(['hold', 'balanced', 'tight']).default('balanced'),
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
  segmentation_treatment: z.object({
    execution_mode: z.enum(['segment_animate', 'segment_video_fx', 'segment_mask_prep']),
    preset: z.enum([
      'focus_reveal',
      'detail_callout',
      'subject_isolation',
      'progressive_reveal',
      'tracked_annotation',
      'danger_emphasis',
    ]).optional(),
    target_mode: z.enum(['text_prompt', 'object_prompts']).default('text_prompt'),
    text_prompt: z.string().default(''),
    text_prompts: z.array(z.string()).default([]),
    point_prompts: z.array(z.array(z.number())).default([]),
    point_labels: z.array(z.number().int()).default([]),
    box_prompts: z.array(z.array(z.number())).default([]),
    box_labels: z.array(z.number().int()).default([]),
    box_prompts_labeled: z.array(z.object({
      box: z.array(z.number()),
      label: z.boolean(),
    })).default([]),
    object_prompts: z.array(z.object({
      label: z.string(),
      text: z.string(),
    })).default([]),
    subject_focus: z.string().default(''),
    notes: z.string().default(''),
    prompt_frame_index: z.number().int().optional(),
    propagation_direction: z.enum(['forward', 'backward', 'both']).optional(),
    confidence_threshold: z.number().optional(),
    max_frames: z.number().int().optional(),
    max_objects: z.number().int().optional(),
    include_tracking_metadata: z.boolean().default(false),
    output_type: z.enum(['masks_json', 'image']).optional(),
    output_format: z.enum(['masks_json', 'video']).optional(),
    intensity: z.enum(['subtle', 'moderate', 'strong']).default('moderate'),
    operations: z.array(z.object({
      type: z.enum([
        'select',
        'blur',
        'pixelate',
        'redact',
        'color_overlay',
        'color_grade',
        'opacity',
        'replace_color',
        'remove_background',
        'replace_background',
        'greenscreen',
        'outline',
        'bounding_box',
        'spotlight',
        'bokeh',
        'glow',
        'shadow',
        'vignette',
        'grayscale',
        'invert',
        'sharpen',
        'sepia',
        'posterize',
        'edge_detect',
        'emboss',
        'noise',
        'sketch',
        'duotone',
        'halftone',
        'glitch',
        'motion_blur',
        'glass',
        'feather',
        'zoom',
        'pan',
      ]),
      target: z.union([
        z.enum(['mask', 'background', 'all', 'center']),
        z.array(z.number()),
      ]).optional(),
      object_index: z.number().int().optional(),
      object_label: z.string().optional(),
      object_labels: z.array(z.string()).optional(),
      object_id: z.number().int().optional(),
      object_ids: z.array(z.number().int()).optional(),
      notes: z.string().optional(),
      color: z.array(z.number()).optional(),
      thickness: z.number().optional(),
      strength: z.number().optional(),
      block_size: z.number().optional(),
      brightness: z.number().optional(),
      contrast: z.number().optional(),
      saturation: z.number().optional(),
      value: z.number().optional(),
      hue_shift: z.number().optional(),
      saturation_scale: z.number().optional(),
      image_url: z.string().optional(),
      progress: z.number().optional(),
      darkness: z.number().optional(),
      radius: z.number().optional(),
      intensity: z.number().optional(),
      offset: z.array(z.number()).optional(),
      amount: z.number().optional(),
      levels: z.number().optional(),
      noise_type: z.enum(['gaussian', 'grain']).optional(),
      detail: z.number().optional(),
      color_dark: z.array(z.number()).optional(),
      color_light: z.array(z.number()).optional(),
      dot_size: z.number().optional(),
      rgb_shift: z.number().optional(),
      seed: z.number().optional(),
      angle: z.number().optional(),
      scale: z.number().optional(),
      animation: z.object({
        mode: z.enum(['transition', 'draw', 'pulse', 'reveal', 'loop', 'stagger']).optional(),
        easing: z.enum([
          'linear',
          'ease_in',
          'ease_out',
          'ease_in_out',
          'ease_in_cubic',
          'ease_out_cubic',
          'ease_in_out_cubic',
          'ease_out_back',
          'ease_out_elastic',
          'ease_out_bounce',
        ]).optional(),
        duration: z.number().optional(),
        delay: z.number().optional(),
        cycles: z.number().int().optional(),
        direction: z.enum(['left', 'right', 'top', 'bottom', 'radial']).optional(),
        stagger_delay: z.number().optional(),
        start: z.record(z.string(), z.union([z.number(), z.array(z.number())])).optional(),
        end: z.record(z.string(), z.union([z.number(), z.array(z.number())])).optional(),
      }).optional(),
    })).default([]),
    allow_background_desaturation: z.boolean().default(false),
    allow_guided_zoom: z.boolean().default(false),
    allow_tracked_annotation: z.boolean().default(false),
    fallback_policy: z.enum([
      'fallback_to_prompted_generation',
      'fallback_to_source_media',
      'fail_strict',
    ]).default('fallback_to_prompted_generation'),
  }).optional(),
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
  media_type: 'video' | 'image' | 'motiongraphic';
  synthesis_mode: 'T2V' | 'I2V';
  visual_description: string;
  visual_elements: string[];
  shot_role?: 'hook' | 'establish' | 'coverage' | 'insert' | 'bridge' | 'annotation' | 'payoff' | 'reaction' | 'graphic_explainer' | 'closing';
  framing?: 'extreme_wide' | 'wide' | 'medium_wide' | 'medium' | 'medium_close' | 'close_up' | 'extreme_close';
  camera_angle?: 'eye_level' | 'low_angle' | 'high_angle' | 'overhead' | 'top_down' | 'profile' | 'macro_detail' | 'first_person' | 'dutch';
  camera_motion?: 'static' | 'push_in' | 'pull_out' | 'pan_left' | 'pan_right' | 'tilt_up' | 'tilt_down' | 'orbit' | 'tracking' | 'handheld' | 'crane' | 'zoom_in' | 'zoom_out' | 'freeze_orbit';
  lens_style?: string;
  subject_focus?: string;
  entry_transition_intent?: string;
  exit_transition_intent?: string;
  bridge_subject?: string;
  visual_motif?: string;
  continuity_level?: 'fresh' | 'soft' | 'strict';
  anchor_strategy?: 'fresh' | 'scene_anchor' | 'prev_frame' | 'prev_keyframe';
  render_strategy?: 'ai_video' | 'ai_image' | 'stock' | 'motiongraphic' | 'segment_animate' | 'segment_video_fx' | 'segment_mask_prep';
  trim_priority?: 'hold' | 'balanced' | 'tight';
  segmentation_treatment?: {
    execution_mode: 'segment_animate' | 'segment_video_fx' | 'segment_mask_prep';
    preset?: 'focus_reveal' | 'detail_callout' | 'subject_isolation' | 'progressive_reveal' | 'tracked_annotation' | 'danger_emphasis';
    target_mode?: 'text_prompt' | 'object_prompts';
    text_prompt?: string;
    text_prompts?: string[];
    point_prompts?: number[][];
    point_labels?: number[];
    box_prompts?: number[][];
    box_labels?: number[];
    box_prompts_labeled?: Array<{ box: number[]; label: boolean }>;
    object_prompts?: Array<{ label: string; text: string }>;
    subject_focus?: string;
    notes?: string;
    prompt_frame_index?: number;
    propagation_direction?: 'forward' | 'backward' | 'both';
    confidence_threshold?: number;
    max_frames?: number;
    max_objects?: number;
    include_tracking_metadata?: boolean;
    output_type?: 'masks_json' | 'image';
    output_format?: 'masks_json' | 'video';
    intensity?: 'subtle' | 'moderate' | 'strong';
    operations?: Array<{
      type: string;
      target?: 'mask' | 'background' | 'all' | 'center' | number[];
      object_index?: number;
      object_label?: string;
      object_labels?: string[];
      object_id?: number;
      object_ids?: number[];
      notes?: string;
      color?: number[];
      thickness?: number;
      strength?: number;
      block_size?: number;
      brightness?: number;
      contrast?: number;
      saturation?: number;
      value?: number;
      hue_shift?: number;
      saturation_scale?: number;
      image_url?: string;
      progress?: number;
      darkness?: number;
      radius?: number;
      intensity?: number;
      offset?: number[];
      amount?: number;
      levels?: number;
      noise_type?: 'gaussian' | 'grain';
      detail?: number;
      color_dark?: number[];
      color_light?: number[];
      dot_size?: number;
      rgb_shift?: number;
      seed?: number;
      angle?: number;
      scale?: number;
      animation?: {
        mode?: 'transition' | 'draw' | 'pulse' | 'reveal' | 'loop' | 'stagger';
        easing?: 'linear' | 'ease_in' | 'ease_out' | 'ease_in_out' | 'ease_in_cubic' | 'ease_out_cubic' | 'ease_in_out_cubic' | 'ease_out_back' | 'ease_out_elastic' | 'ease_out_bounce';
        duration?: number;
        delay?: number;
        cycles?: number;
        direction?: 'left' | 'right' | 'top' | 'bottom' | 'radial';
        stagger_delay?: number;
        start?: Record<string, number | number[]>;
        end?: Record<string, number | number[]>;
      };
    }>;
    allow_background_desaturation?: boolean;
    allow_guided_zoom?: boolean;
    allow_tracked_annotation?: boolean;
    fallback_policy?: 'fallback_to_prompted_generation' | 'fallback_to_source_media' | 'fail_strict';
  };
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

function getResponseFormat() {
  const schema = z.toJSONSchema(SceneShotPlanOutput);
  const { $schema: _, ...structuralSchema } = schema as Record<string, unknown>;
  return {
    type: 'json_schema' as const,
    json_schema: {
      name: 'scene_shot_plan',
      strict: true,
      schema: structuralSchema,
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
- "image": A source still only. Do NOT treat this as a final static output unless it will become segmentation animation or motion-designed treatment.
- "motiongraphic": Stats, lists, text overlays, infographics, data visualization

FINAL LANE RULE:
- Non-motiongraphic image shots should almost never ship as a static still.
- If an image-led shot should reveal, isolate, spotlight, or annotate a subject, prefer render_strategy "segment_animate".
- Otherwise, prefer render_strategy "ai_video" so the final output is moving footage.
- Only use render_strategy "ai_image" when the still is clearly an intermediate source asset and not the intended final viewer experience.

DIRECTING GRAMMAR:
- shot_role: what this shot does in the sequence (hook, establish, coverage, insert, bridge, annotation, payoff, reaction, graphic_explainer, closing)
- framing: choose the visual scale intentionally
- camera_angle and camera_motion: describe how the audience is meant to perceive the shot
- subject_focus: what exact person/object/detail deserves attention
- entry_transition_intent and exit_transition_intent: why this cut is motivated
- bridge_subject: repeated person/object/location/detail used to connect adjacent shots
- visual_motif: recurring visual idea that should carry through the sequence
- trim_priority: hold, balanced, or tight based on editorial pacing
- continuity_level:
  - fresh = new world or concept
  - soft = should feel related but can flex
  - strict = must preserve the same world/subject look
- anchor_strategy:
  - fresh = no anchor
  - scene_anchor = use the scene's established look
  - prev_frame = chain from the previous rendered frame
  - prev_keyframe = chain from the previous still/keyframe
- render_strategy:
  - ai_video, ai_image, stock, motiongraphic for normal lanes
  - segment_animate for still-image emphasis/reveal shots
  - segment_video_fx for tracked effects on an existing video
  - segment_mask_prep when segmentation should prepare a mask/edit before another step

FREEZE-WORLD TECHNIQUE (camera_motion: 'freeze_orbit'):
A powerful cinematic tool where everything in the scene is perfectly still — frozen in time — while the camera moves freely through the environment. The world is paused; the lens is not.
- Use this when you want the viewer to absorb a scene spatially without distraction from subject motion.
- The camera can push in, pull back, orbit, crane, or drift — the subjects and environment remain statue-still.
- Distinct from 'orbit' (which implies a living scene) — in freeze_orbit, nothing breathes.

When to use freeze_orbit:
- Documentary / Factual: Establishing overview shots at the start of a new location or chapter. Slow reveal of a scene before the action begins. "Pause the world" moments that let critical visual information land.
- Drama / Narrative: Tension-building before a reveal. A character frozen mid-action while the camera circles to reveal something behind them. The moment before a pivotal event.
- Educational / Explainer: Spatial overview of a structure, environment, or layout — the camera flies around to show all angles.
- General rule: If the purpose is to let the viewer SEE THE WORLD rather than WATCH SOMETHING HAPPEN, freeze_orbit is the right choice.

In visual_description, describe:
1. What is frozen (scene, subjects, environment)
2. How the camera moves through the stillness
3. What the viewer is meant to discover or absorb
Example: "A busy city intersection frozen mid-moment — pedestrians stopped mid-step, cars halted. The camera slowly orbits the frozen tableau from eye level, drifting forward through the stillness to reveal the lone figure at the center."

SEGMENTATION TREATMENT:
- Use segmentation_treatment only when it adds real editorial value.
- Good use cases: highlighting an important character, circling/isolating a face, spotlighting evidence, desaturating the background around a subject, guided zoom into a detail, tracked annotation in motion.
- Prefer object_prompts over a generic text prompt whenever more than one subject could be in frame or when the target could be ambiguous.
- Each object_prompts.label must be short, stable, and snake_case, such as "lead_detective", "left_witness", or "red_folder".
- Each object_prompts.text should be concise, usually 2-8 words.
- If multiple people are present, describe them only in this order as needed: role/name, left/right or foreground/background, distinctive clothing/color, action.
- preset examples:
  - focus_reveal = spotlight + guided zoom + subtle reveal
  - detail_callout = annotation/outline around an important detail
  - subject_isolation = subject stays vivid while background changes
  - progressive_reveal = effect gradually reveals the point
  - tracked_annotation = tracked highlight in a moving shot
  - danger_emphasis = ominous focus on a person/object, often with background desaturation
- If using segmentation_treatment, choose the matching render_strategy.
- Default to subtle or moderate intensity unless the story beat truly needs strong emphasis.
- Use segment_mask_prep only when segmentation should prepare a mask for image editing or later compositing before the final lane continues.

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
- Only use persistent graphics when they add real narrative continuity. Do NOT force them into every scene.

SHOT DURATION & PACING:
Each shot spans a natural narration segment. Keep these guidelines in mind:
- hook: 1.5-3s ideal
- establishing: 3-5s ideal
- buildup / detail / transition: 2-4s ideal
- reveal / reaction / climax: 3-6s ideal
- resolution: 4-7s ideal
- No single shot should exceed 10s unless the narration for that shot genuinely runs that long without pause
- If a shot would be very long (8s+) and covers static content, consider splitting it into 2 shorter shots with different angles or framings

MULTI-ANGLE COVERAGE (use I2V continuity proactively for long scenes):
When a scene covers 15+ seconds in the same physical location, do NOT plan it as one long shot or a series of entirely separate keyframe generations.
Instead, break it into 3-5 shorter shots using continuity_from_previous + angle_change + synthesis_mode I2V to create a multi-camera feel:
- Example chain: wide establishing (T2V) → push in to medium (I2V, angle_change: push in to medium shot) → reframe to subject closeup (I2V, angle_change: shift to close-up on face) → pull back to wide again (I2V, angle_change: pull back to re-establish)
- This is cinematically superior to 4 unrelated T2V shots because the world stays consistent while the camera moves
- I2V chains also save generation cost and produce more coherent results than disconnected keyframes
- The "angle_change" should be concise and camera-oriented: "push in to medium", "shift overhead", "pan left to reveal doorway", "pull back to wide", "detail crop to hands"`);


  return parts.join('\n');
}

function buildUserPrompt(scene: EnrichedScene): string {
  return `Plan the shots for this scene:

SCENE TEXT (word indices ${scene.start_word_index}-${scene.end_word_index}):
"${scene.text}"

Generate the shot plan JSON for this scene.`;
}

function inferVisualTreatment(
  mediaType: 'video' | 'image' | 'motiongraphic',
  stockWorthy: boolean,
  mgMode?: MotionGraphicsMode,
  visualElements: string[] = [],
): EnrichedPlannedShot['visual_treatment'] {
  if (mediaType === 'motiongraphic') {
    return mgMode === 'template' ? 'mg_template' : 'hybrid';
  }
  if (stockWorthy || visualElements.some((tag) => tag.startsWith('stock_'))) return 'stock';
  if (visualElements.includes('ai_image')) return 'ai_image';
  if (mediaType === 'image') return 'ai_image';
  return 'ai_video';
}

function inferShotRole(
  beat: EnrichedPlannedShot['narrative_beat'],
  mediaType: EnrichedPlannedShot['media_type'],
): NonNullable<EnrichedPlannedShot['shot_role']> {
  switch (beat) {
    case 'hook': return 'hook';
    case 'establishing': return 'establish';
    case 'detail': return mediaType === 'motiongraphic' ? 'graphic_explainer' : 'insert';
    case 'transition': return 'bridge';
    case 'reveal': return 'payoff';
    case 'reaction': return 'reaction';
    case 'resolution': return 'closing';
    default: return mediaType === 'motiongraphic' ? 'graphic_explainer' : 'coverage';
  }
}

function inferDefaultFraming(
  beat: EnrichedPlannedShot['narrative_beat'],
  role: NonNullable<EnrichedPlannedShot['shot_role']>,
): NonNullable<EnrichedPlannedShot['framing']> {
  if (role === 'insert') return 'close_up';
  if (role === 'annotation') return 'medium_close';
  if (beat === 'establishing') return 'wide';
  if (beat === 'detail') return 'extreme_close';
  if (beat === 'reaction') return 'medium_close';
  return 'medium';
}

function inferCameraMotion(
  beat: EnrichedPlannedShot['narrative_beat'],
  mediaType: EnrichedPlannedShot['media_type'],
  continuityFromPrevious: boolean,
): NonNullable<EnrichedPlannedShot['camera_motion']> {
  if (mediaType === 'motiongraphic') {
    // MG compositions animate their internal elements — the "camera" is not moving.
    // Only use non-static for specific beats where the design itself has a directional reveal.
    if (beat === 'reveal' || beat === 'climax') return 'push_in';
    if (beat === 'establishing') return 'pull_out';
    return 'static'; // default: hold the composition, animate the elements within it
  }
  if (mediaType === 'image') {
    if (beat === 'detail' || beat === 'reveal' || beat === 'climax') return 'push_in';
    if (beat === 'transition') return 'pan_right';
    if (beat === 'establishing') return 'pull_out';
    if (beat === 'reaction' || beat === 'resolution') return 'zoom_out';
    return 'pan_left';
  }
  if (continuityFromPrevious) return 'tracking';
  if (beat === 'reveal' || beat === 'climax') return 'push_in';
  if (beat === 'detail') return 'zoom_in';
  if (beat === 'transition') return 'pan_right';
  if (beat === 'establishing') return 'pull_out';
  if (beat === 'reaction' || beat === 'resolution') return 'static';
  return 'tracking';
}

function inferContinuityLevel(
  continuityFromPrevious: boolean,
  synthesisMode: EnrichedPlannedShot['synthesis_mode'],
): NonNullable<EnrichedPlannedShot['continuity_level']> {
  if (continuityFromPrevious && synthesisMode === 'I2V') return 'strict';
  if (continuityFromPrevious) return 'soft';
  return 'fresh';
}

function inferRenderStrategy(
  mediaType: EnrichedPlannedShot['media_type'],
  visualTreatment: EnrichedPlannedShot['visual_treatment'],
  segmentationTreatment?: EnrichedPlannedShot['segmentation_treatment'],
): NonNullable<EnrichedPlannedShot['render_strategy']> {
  if (segmentationTreatment?.execution_mode) {
    return segmentationTreatment.execution_mode;
  }
  if (visualTreatment === 'stock' || visualTreatment === 'archival') return 'stock';
  if (mediaType === 'motiongraphic') return 'motiongraphic';
  if (mediaType === 'image') return 'ai_image';
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
      shot_role: 'establish',
      framing: 'wide',
      camera_angle: 'eye_level',
      camera_motion: 'static',
      lens_style: undefined,
      subject_focus: scene.description,
      entry_transition_intent: 'open the scene cleanly',
      exit_transition_intent: 'hand off to the next beat',
      bridge_subject: undefined,
      visual_motif: undefined,
      continuity_level: 'fresh',
      anchor_strategy: 'fresh',
      render_strategy: 'ai_video',
      trim_priority: 'balanced',
      segmentation_treatment: undefined,
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
    const shotRole = shot.shot_role || inferShotRole(shot.narrative_beat, shot.media_type);
    const framing = shot.framing || inferDefaultFraming(shot.narrative_beat, shotRole);
    const cameraMotion = shot.camera_motion || inferCameraMotion(
      shot.narrative_beat,
      shot.media_type,
      shot.continuity_from_previous,
    );
    const continuityLevel = shot.continuity_level || inferContinuityLevel(
      shot.continuity_from_previous,
      shot.synthesis_mode,
    );
    const segmentationTreatment = shot.segmentation_treatment?.execution_mode
      ? {
          ...shot.segmentation_treatment,
          text_prompt: shot.segmentation_treatment.text_prompt || undefined,
          object_prompts: shot.segmentation_treatment.object_prompts?.filter(obj => obj.label && obj.text) || [],
          operations: shot.segmentation_treatment.operations || [],
          subject_focus: shot.segmentation_treatment.subject_focus || shot.subject_focus || undefined,
          notes: shot.segmentation_treatment.notes || undefined,
        }
      : undefined;
    const renderStrategy = shot.render_strategy || inferRenderStrategy(
      shot.media_type,
      inferVisualTreatment(
        shot.media_type,
        shot.stock_worthy,
        resolvedMgMode,
        shot.visual_elements,
      ),
      segmentationTreatment,
    );

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
      shot_role: shotRole,
      framing,
      camera_angle: shot.camera_angle,
      camera_motion: cameraMotion,
      lens_style: shot.lens_style || undefined,
      subject_focus: shot.subject_focus || undefined,
      entry_transition_intent: shot.entry_transition_intent || undefined,
      exit_transition_intent: shot.exit_transition_intent || undefined,
      bridge_subject: shot.bridge_subject || undefined,
      visual_motif: shot.visual_motif || undefined,
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
      continuity_level: continuityLevel,
      anchor_strategy: shot.anchor_strategy || (
        shot.continuity_from_previous
          ? (shot.synthesis_mode === 'I2V' ? 'prev_frame' : 'scene_anchor')
          : 'fresh'
      ),
      render_strategy: renderStrategy,
      trim_priority: shot.trim_priority || (
        shot.narrative_beat === 'reaction' || shot.narrative_beat === 'resolution'
          ? 'hold'
          : shot.narrative_beat === 'hook' || shot.narrative_beat === 'transition'
            ? 'tight'
            : 'balanced'
      ),
      segmentation_treatment: segmentationTreatment,
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
          maxTokens: 65536,
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
