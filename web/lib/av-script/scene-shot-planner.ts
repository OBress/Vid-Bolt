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
import type { EnrichedScene, WordTimestamp, DebugCapture } from './scene-decomposer';

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
    'whip_pan',
    'ken_burns',
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
  camera_motion?: 'static' | 'push_in' | 'pull_out' | 'pan_left' | 'pan_right' | 'tilt_up' | 'tilt_down' | 'orbit' | 'tracking' | 'handheld' | 'crane' | 'zoom_in' | 'zoom_out' | 'freeze_orbit' | 'whip_pan' | 'ken_burns';
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

/**
 * Thin entity roster — only what the shot planner needs to make
 * framing/naming decisions. Physical details are withheld; those
 * belong exclusively in the Visual Bible for prompt expansion.
 */
export interface ThinEntityRoster {
  characters?: Array<{ name: string; role: string }>;
  locations?: Array<{ name: string; type?: string; scale?: string; essence?: string; lightingMood?: string }>;
}

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
  adjacentContext: AdjacentContext,
  wordsPerSecond: number,
  entityRoster?: ThinEntityRoster,
): string {
  const parts: string[] = [];

  // Use the orchestrator's carefully constructed prompt as the base
  if (orchestratorPrompt) {
    parts.push(orchestratorPrompt);
  }

  // Gap 1: Translate creative direction into directorial craft
  parts.push(`
═══ TRANSLATING CREATIVE DIRECTION INTO DIRECTORIAL CRAFT ═══
The creative context above contains implicit directorial instructions. Before planning any shot,
derive what it tells you about your specific craft decisions. Do not treat it as visual style —
treat it as a directing brief. Extract four signals:

PACING SIGNAL: What does the creative direction imply about shot rhythm and editing tempo?
  → "rapid cuts", "kinetic", "montage", "urgent", "high-energy" → bias toward tight holds, more cuts, trim_priority: "tight"
  → "cinematic", "premium", "deliberate", "slow burn", "atmospheric" → longer holds, let moments breathe, trim_priority: "hold" on key beats
  → "documentary", "observational" → mix of fast b-roll sequences and sustained observational holds — not uniform

MOTION GRAPHICS SIGNAL: What does the creative direction imply about MG density?
  → "explainer", "data", "diagrams", "text overlay", "infographic" → MGs are expected and frequent; apply the decision test with a generous threshold
  → "cinematic", "immersive", "archival", "raw", "documentary feel" → MGs should be rare and only used when footage genuinely cannot carry the information
  → "minimal text", "footage-driven", "visual storytelling" → almost no MGs; each one is a significant editorial decision

CAMERA REGISTER SIGNAL: What does the creative direction imply about how the camera behaves?
  → "handheld", "raw", "gritty" → handheld camera_motion, urgency, human-scale framing
  → "cinematic", "precise", "deliberate" → every camera move is motivated; avoid gratuitous movement
  → "diorama", "miniature", "stop-motion", "3D world" → freeze_orbit and wide orbiting shots to showcase the constructed space
  → "POV", "immersive", "first-person", "you are there" → first_person angles, eyewitness compositions, subjective framing

HUMAN PERSPECTIVE SIGNAL: What does the creative direction imply about where the viewer stands?
  → "humanize", "personal story", "lived experience", "eyewitness" → actively seek POV compositions, reaction shots, foreground-subject frames
  → "observational", "objective", "investigative" → external framing; the camera observes rather than inhabits
  → no strong signal → apply Question 3 of the pre-planning brief individually for each scene

Commit to these four positions before writing your first shot. They should be consistent across all shots in this scene.`);

  const sceneDuration = scene.end_seconds - scene.start_seconds;
  const wordsInScene = scene.end_word_index - scene.start_word_index + 1;
  const approxWordsPerShot = Math.round(wordsInScene / scene.suggested_shot_count);
  const approxSecondsPerShot = (approxWordsPerShot / wordsPerSecond).toFixed(1);

  // Scene-specific directives
  parts.push(`\n═══ SCENE-SPECIFIC CONTEXT ═══
You are planning shots for ONE scene. Give each shot your full creative attention.

SCENE: "${scene.description}"
NARRATIVE PURPOSE: ${scene.narrative_purpose}
PACING INTENT: ${scene.pacing_intent}
SUGGESTED SHOT COUNT: ${scene.suggested_shot_count}
VISUAL CONTINUITY: ${scene.visual_continuity ? 'YES — shots in this scene can share visual DNA' : 'NO — each shot is visually independent'}
WORD RANGE: ${scene.start_word_index} to ${scene.end_word_index} (${wordsInScene} words)
DURATION: ${sceneDuration.toFixed(1)}s (${scene.start_seconds.toFixed(1)}s → ${scene.end_seconds.toFixed(1)}s in the video)
NARRATION RATE: ${wordsPerSecond.toFixed(2)} words/second (~${(wordsInScene / wordsPerSecond / scene.suggested_shot_count).toFixed(1)}s avg per shot at suggested count)`);

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

  // Named entity roster — names+roles only so the planner uses them in
  // visual_description without guessing, and picks framing based on location scale.
  // Physical appearance details are deliberately omitted here (they belong in prompt-gen).
  if (entityRoster && (entityRoster.characters?.length || entityRoster.locations?.length)) {
    const rosterLines: string[] = ['\n═══ NAMED ENTITIES IN THIS VIDEO ═══'];
    if (entityRoster.characters?.length) {
      rosterLines.push('Characters (use their names in visual_description when they appear):');
      for (const c of entityRoster.characters) {
        rosterLines.push(`  • ${c.name} — ${c.role}`);
      }
    }
    if (entityRoster.locations?.length) {
      rosterLines.push('Locations (use scale/type to inform framing and camera_motion choices):');
      for (const l of entityRoster.locations) {
        const details = [l.type, l.scale, l.essence, l.lightingMood ? `lighting: ${l.lightingMood}` : undefined]
          .filter(Boolean).join(', ');
        rosterLines.push(`  • ${l.name}${details ? ` [${details}]` : ''}`);
      }
    }
    parts.push(rosterLines.join('\n'));
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

VIDEO TEXT RULE — ONE SIMPLE RULE:
When writing visual_description for ANY render_strategy: "ai_video" shot, NEVER mention text, signs,
labels, banners, stamps, words, letters, captions, or readable characters of any kind.

The LTX-2.3 video model cannot reliably generate readable text from scratch. The safest and most
foolproof approach is: do not describe text in the video prompt at all. Text appears in video ONLY if
it is already present in the start-frame or end-frame image — LTX will preserve whatever it sees in
those frames without being told about it. You never need to mention it in visual_description.

THE COMPLETE RULE FOR EACH CASE:

  CASE: Text should appear in the video (e.g. a STOP sign, a label, a short word)
    ✓ Use image_edit_instruction to bake the text onto the keyframe image.
    ✓ Use synthesis_mode: "I2V" so the keyframe is used as the start frame.
    ✓ In visual_description: describe ONLY the camera motion, subjects, and physical world.
       Do NOT mention the text, the sign, or the label anywhere in visual_description.
    ✓ LTX will preserve whatever is in the start frame automatically.

    Example — STOP sign pull-back:
      image_edit_instruction: "Place a clay-paper STOP sign prop in the foreground"
      synthesis_mode: "I2V"
      visual_description: "The camera pulls back rapidly to reveal the entire Senate
                           diorama on a wooden desk. Workshop tools are visible around
                           the edges. The lighting shifts to flat overhead workshop light."
      ← Notice: NO mention of the STOP sign or any text in visual_description.

  CASE: A lot of text is needed (paragraph, multiple lines, dense copy)
    ✓ Route to render_strategy: "motiongraphic" — Remotion handles all typography perfectly.
    ✓ OR just don't include that text in the shot at all.

  CASE: Text would be nice but isn't critical to the shot
    ✓ Just remove it. Describe the physical scene without any text references.
       The shot will be cleaner for it.

ABSOLUTE PROHIBITIONS in visual_description for ai_video shots:
  ✗ Any prop with readable text: "a sign reading '...'" / "a note with '...'" / "stamped with '...'"
  ✗ Any text appearing, emerging, or slamming: "text slaps in" / "letters appear" / "stamp hits"
  ✗ Any text that is 'already visible': even referencing text as pre-existing is risky —
     just don't mention it. The keyframe handles it silently.
  ✗ image_edit_instruction on synthesis_mode: "T2V" shots — T2V has no keyframe to edit.



DIRECTING GRAMMAR:
- shot_role: what this shot does in the sequence (hook, establish, coverage, insert, bridge, annotation, payoff, reaction, graphic_explainer, closing)
- framing: choose the visual scale intentionally
- camera_angle and camera_motion: describe how the audience is meant to perceive the shot
- subject_focus: what exact person/object/detail deserves attention
- entry_transition_intent and exit_transition_intent: why this cut is motivated
  • match_cut: "match cut from [element A] to [element B]" — two shots share a visual in the same screen position. Reveals connection, causality, or hidden similarity.
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
- camera_motion — choose based on the NARRATIVE CONTRACT each motion makes with the viewer:
  • static: the camera holds perfectly still. Use for far more than just emotional weight.
    Static is one of the most powerful AND most reliable tools in the vocabulary:
    - Emotional weight: grief, dread, revelation — stillness as gravity.
    - Overview / establishing: a still frame lets the viewer scan the entire scene without distraction.
    - Explainer / highlight: when paired with segmentation, the stable frame makes subject isolation,
      spotlight effects, and annotation tracking crisp and reliable.
    - Detail emphasis: a static close-up of an object or detail forces the viewer's attention.
    - AI generation advantage: video generators produce their highest-fidelity output on low-motion scenes.
      A static or near-static shot is NOT a compromise — it is often the most visually polished result.
    Do not avoid static because it seems passive. A static shot with strong composition is more
    cinematic than a moving shot with weak motivation.

  STILL SHOTS AS A HIGH-FIDELITY TOOL:
  Across all camera motions, remember: shots where the subject is still or near-still and only
  the camera moves (static, push_in, pull_out, orbit, crane, ken_burns) are among the highest-
  quality compositions available. AI video generators produce dramatically better fidelity when
  subject motion is minimal. Camera movement alone creates cinematic energy — the viewer does
  not need subject motion to stay engaged. These shots are also ideal candidates for segmentation
  treatments (subject isolation, spotlight, depth separation) because the stable frame makes
  masking highly reliable. Reach for these tools often — they are powerful, not passive.
  • push_in: the camera wants to get closer to the truth. Intimacy, interrogation, mounting focus.
    Not a generic "emphasis" tool — implies the viewer is being drawn toward something inescapable.
  • pull_out: the world is larger than what we're looking at. Consequence, isolation, scale, aftermath.
    After a reveal, pulling out shows the viewer what surrounds it — a choice becomes a catastrophe.
  • tracking: the camera is present and participating. Companionship, momentum, following a subject.
    The camera is a character moving through the world alongside something — it is committed.
  • handheld: the camera is an observer not in control. Urgency, authenticity, chaos, immediacy.
    Instability signals: this is real, this is now — not staged, not safe.
  • crane: the world seen from above. Overview, divine perspective, transition between scales.
  • orbit: the camera circles a living scene — subjects are active, the world breathes around them.
    Distinct from freeze_orbit: in orbit, life continues.
  • whip_pan: aggressive fast pan — urgency, kinetic energy, rapid location or perspective shifts.
  • ken_burns: slow graceful pan+zoom across a still image — archival, memorial, evidence photo reveals.
    When using ken_burns, set render_strategy: "ai_image".
  • zoom_in / zoom_out: optical zoom (not physical movement) — more dramatic and unsettling than push/pull.
    zoom_in amplifies; push_in immerses. They are not interchangeable.
  • freeze_orbit: see FREEZE-WORLD TECHNIQUE below.

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

INTENTIONALITY GATE — before using freeze_orbit, ask:
"Am I doing this because stopping time is the narratively correct choice — or because it is available?"
If you cannot answer the first half of that question with a specific reason, do not use freeze_orbit.
- Do NOT use on shots under ~4 seconds — the camera barely moves before the cut; the technique is invisible.
- Do NOT use when subject motion or action is more informative than spatial inspection.
- Do NOT use as a default establishing shot when a live-world camera motion would be more appropriate.

In visual_description, describe:
1. What is frozen (scene, subjects, environment)
2. How the camera moves through the stillness
3. What the viewer is meant to DISCOVER or ABSORB — this is mandatory. If you cannot answer #3, the technique is wrong for this moment.
Example: "A busy city intersection frozen mid-moment — pedestrians stopped mid-step, cars halted. The camera slowly orbits the frozen tableau from eye level, drifting forward through the stillness to reveal the lone figure at the center."

SEGMENTATION — WHEN IT SERVES THE STORY:
Segmentation adds a post-processing layer to visually separate, isolate, or emphasize a subject.
Use it when the subject matters more than what surrounds it, and the camera alone
cannot make that distinction clear.

Ask yourself: "Would this moment be stronger if the subject stood apart from the world around it?"
If yes — use it. If the effect can be described in visual_description — don't.

Budget: roughly 1 segmentation shot per 8–10 shots across the full plan.

HARD STOPS — never use segmentation on these (pipeline constraints, not taste):
- More than 3 distinct moving subjects in frame (crowd, group shot, battle, audience) — mask quality degrades
- Any I2V continuity shot (continuity_from_previous: true) — already chained from prior frame
- Any motiongraphic shot — MG handles its own compositing pipeline
- Any extreme_wide or wide establishing shot — no singular focal subject to isolate
- When the desired effect can be described in ≤10 words in visual_description
- When you have already used segmentation on the previous shot in this scene

CHANNEL COLOR REFERENCE — always use these for operations.color fields:
See "CHANNEL SEGMENTATION COLORS" block in this prompt for pre-converted RGB arrays.
- Glow, outline, spotlight on subject → primary_accent RGB
- Background color_overlay, color_grade → dark_base RGB or desaturated secondary_accent
- If primary_accent is dark (lum < 0.3) → use secondary_accent for highlight operations
- Never use hardcoded [255,255,255] or [0,0,0] — always use the channel palette

OBJECT PROMPTS (always use these over text_prompt for subject precision):
- label: short snake_case — "lead_character", "key_product", "left_figure", "glowing_screen", "red_folder"
- text: 2–8 words — "woman in yellow jacket foreground", "product on white table", "man in dark coat left"
- Set the matching render_strategy: "segment_animate" (still source) or "segment_video_fx" (video source)
- intensity: subtle or moderate by default — only use strong for the single most dramatic beat of the scene
- Keep operations to 1–2 simple effects; avoid complex chains except at the scene's true climax moment

PRESET USE-CASE GUIDE:
- subject_isolation: introduce a character — blur and desaturate the world, keep the person crisp. First appearance = visual authority.
- focus_reveal: a key piece of evidence — the frame starts normal, then everything except the key object darkens and sharpens.
- detail_callout: a document, a badge, a weapon — outline glow + slight zoom draws the eye to a small object.
- danger_emphasis: a threat, a warning sign, something ominous — red-tinted glow, aggressive highlight.
- tracked_annotation: a person in a crowd — persistent mask tracking keeps them highlighted as the shot plays.
- progressive_reveal: information unfolds — multiple subjects revealed one by one across the shot duration.

COMBINED TREATMENT PATTERNS (segmentation + image_edit_instruction):
When you want to dramatically isolate or emphasize a subject, combine both tools:

• SUBJECT COLOR POP: image_edit_instruction: "Convert entire image to black and white with heavy vignette"
  + segmentation operations: [{ type: "color_grade", target: "mask" }] to restore full color to subject only.
  Result: B&W world, full-color subject. The eye goes nowhere else.

• DEPTH SEPARATION: segmentation operations: [{ type: "blur", target: "background", value: 12 },
  { type: "grayscale", target: "background" }]
  Result: Background blurred and desaturated, subject sharp and vivid.
  Standard treatment for highlighting a specific person in a scene.

• SPOTLIGHT EMPHASIS: segmentation operations: [{ type: "spotlight", target: "mask" },
  { type: "opacity", target: "background", value: 0.4 }]
  Result: Subject lit, world dimmed. For dramatic revelations or "this person matters."

• FORENSIC CALLOUT: segmentation preset: "detail_callout"
  operations: [{ type: "outline", target: "mask" }, { type: "glow", target: "mask" }]
  Result: Subject outlined and glowing against its context. For evidence, exhibits, key objects.

• ARCHIVAL HIGHLIGHT: image_edit_instruction: "Apply warm sepia tone with film grain"
  + segmentation operations: [{ type: "spotlight", target: "mask" }]
  Result: Aged archival look with the key subject spotlit. Historical documentary standard.

These combined treatments are powerful — use them when you want to create a strong visual
emphasis moment. They work best on still/near-still shots where segmentation masks are reliable.

STOCK MEDIA:
- stock_worthy: true ONLY when the narration references specific real-world entities (people, places, events)
- stock_search_query: 2-4 word search query. Set to empty string "" when stock_worthy is false.

SOUND EFFECTS — TWO DISTINCT LAYERS:
Sound design operates at two levels. Plan both before writing any SFX entries.

LAYER 1 — ATMOSPHERIC THROUGHLINE (scene-level):
Is there an ambient world-sound that should run as a continuous underpinning for this entire scene?
Examples: jet engine rumble, city traffic, wind through a building, institutional HVAC hum, crowd murmur, fire.
If yes — add it once, on the FIRST shot of the scene, with no anchor_word.
Write the description as: "[sound] — atmospheric, runs through scene" so downstream knows it's continuous.
This creates audio continuity across visual cuts. The world persists even as the picture changes.

LAYER 2 — REACTIVE PUNCTUATION (shot-level):
Are there specific moments where a sudden sound reinforces a single impact point?
Examples: a gunshot, a slamming door, a gavel strike, a glass breaking, a notification tone.
Use anchor_word to align with the spoken word or moment. Add these sparingly.

CALIBRATION: For most shots, Layer 1 exists and Layer 2 does not.
A scene with 8 shots should have 1 atmospheric entry and 0–3 reactive entries — not 8 separate effects.
- anchor_word: the spoken word the SFX aligns with. Set to "" for atmospheric entries (no word anchor).

CREATIVE IMAGE EDITING (image_edit_instruction):
- Use this to apply a creative edit to the shot's base image BEFORE it's used for anything (video generation, motion graphic composition, overlay display, etc.).
- This is NOT the same as angle_change — angle_change is specifically for I2V continuity (editing the previous shot's last frame).
- image_edit_instruction edits the shot's OWN keyframe or stock image for creative effect.
- Examples of professional post-production treatments:
  • "Convert entire image to black and white except the central figure" — selective color isolation
  • "Desaturate and blur the background, keeping the subject sharp and in full color" — depth emphasis
  • "Apply a warm sepia tone with vignette — aged archival treatment"
  • "Add dramatic film grain and slight green color shift — surveillance footage aesthetic"
  • "Darken everything except a spotlight circle on the subject's face" — interrogation / focus
  • "Split-tone: cool blue shadows, warm amber highlights — cinematic color grade"
  • "add a crown to the person's head", "make the background apocalyptic", "add dramatic storm clouds"
- Set to empty string "" when no creative edit is needed (most shots won't need this).
- Use sparingly and purposefully — only when the edit genuinely enhances storytelling.
- Combine with segmentation_treatment for powerful compound effects (see COMBINED TREATMENT PATTERNS below).

MOTION GRAPHICS — THE UNIVERSAL DECISION TEST:
Before routing any shot to media_type: "motiongraphic", apply this single test:
  "Does this motion graphic add information that footage or narration CANNOT convey on their own?"
  YES → use MG. (data, geography, spatial relationships, timelines, statistics, abstract system diagrams)
  NO  → do not use MG. Footage or narration already carries the idea. A graphic here is redundant noise.

Anti-patterns to reject:
- A lower third or slap annotation labelling what the narrator is already saying aloud
- A quote card for a quote the narrator is already reading
- A character dossier for someone the viewer already understands from footage context
- Any MG on a grief, reaction, or emotional beat where footage should carry the weight
- MG used as "filler" when you have no clear visual concept for a shot

The correctly used MG is rare and precise. A dramatic chapter might have 20 footage shots and 2 MGs —
and those 2 MGs are the most informationally dense visuals in the sequence. An explainer might end
every section with an MG summary card — because that card adds structural information footage cannot show.
In both cases, the test is identical: does this add something new?

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

PRE-PLANNING BRIEF — reason through this before planning any shot:

Before assigning media types, framings, or camera moves, ask yourself:

1. EMOTIONAL REGISTER
   What is the viewer meant to FEEL at each moment in this scene?
   Map the emotional arc — does it rise, peak, resolve, or hold a single sustained register?
   Let that answer drive hold time, pacing, and shot rhythm. Don't label it.
   Just let the feeling dictate how long each shot breathes.

2. HIERARCHY OF IMPORTANCE
   Which moment in this scene is the single most important thing?
   The most critical fact. The most powerful image. The most significant human moment.
   That moment deserves the most deliberate visual treatment: the tightest frame,
   the longest hold, the most precise camera choice.
   Only one moment can be the most important. If everything is emphasised, nothing is.

3. HUMAN SCALE
   Is there a named person experiencing what this narration describes?
   If so — can the viewer see that experience from the inside?
   An aerial of a burning building tells us something happened.
   A person looking out a window as the light changes outside tells us what it felt like.
   You don't need to call it anything. Just ask: does this moment need a human face?

   When the answer is yes, these are the compositional tools:
   • camera_angle: "first_person" — the viewer inhabits the subject's perspective. For eyewitness
     moments, immersive experience, and any emotion that reads as "I am here, this is happening to me."
   • Foreground-subject / background-event: the person is in frame while the event unfolds behind
     or outside them. One shot gives you both the human scale and the context simultaneously.
   • Reaction BEFORE reveal: show the face registering something BEFORE showing what they see.
     This is the correct narrative sequence. Shock on a face → then the source is 5x more impactful
     than source → then face. The viewer needs to feel it before they understand it.
   • Enter a scene in first_person, then cut to wider context — establishes subjective presence first,
     then reveals scale. Do not start with the wide and hope to earn the human moment later.

4. VISUAL RHYTHM — CONTRAST IS THE MECHANISM
   Pacing is not an absolute duration value. It is a RATIO between adjacent shots.
   A 1.5s cut means nothing in isolation. Next to a 9s hold, it hits like a shockwave.
   A 9s hold earns its gravity only by being surrounded by shots that move faster.
   The contrast between durations creates meaning — not any single shot length.

   Apply this within the scene:
   - The most important moment (from Question 2) should be the most contrasted against its neighbors.
     Fast scene → give the peak a longer hold than everything around it.
     Slow scene → give the peak a tighter, faster cut than everything around it.
   - Build toward the peak: shots before it should progressively tighten (shorter holds, tighter frames).
   - Release after the peak: shots following can breathe.

   Does pacing_intent: "${scene.pacing_intent}" actually feel true in the shots you're planning?
   A climactic scene with 3 uniform wide shots is not climactic.
   A slow scene with 12 uniform rapid cuts is not slow.
   A well-paced scene has internal variation that makes its overall register legible.

5. VISUAL REGISTER SEQUENCING
   What is the pattern of media types within this scene — and is it intentional?
   The ORDER and RHYTHM of media types create meaning, not just the individual shots.

   Ask: does the sequence of ai_video → stock → ai_video → stock create a conversation?
   In a documentary, 3D reconstruction followed by archival validates the reconstruction.
   The archival says "this actually happened" and the 3D says "this is what it may have looked like."
   The intercut rhythm makes both more powerful than either alone.

   In an explainer: footage establishing context → MG extracting data from that context
   → footage applying the conclusion is a natural three-act structure within a single scene.

   In horror or suspense: slow atmospheric footage → a sudden clinical graphic → back to atmosphere
   creates an uncanny destabilizing effect that pure footage cannot.

   You are not required to vary media types. Pure footage is correct when the footage is strong enough.
   But if you are mixing types, every switch between footage and graphics should be doing narrative work.
   Ask: what does each media type transition add that staying in one register wouldn't?

Reason through these before planning. The JSON is the result of that reasoning,
not a template fill. Use whatever shot types, framings, and movements your answers
require — the vocabulary is a toolbox, not a checklist.

PACING CONTEXT FOR THIS SCENE (${scene.pacing_intent}):
The system has validated that ${scene.suggested_shot_count} shots fits this scene's
duration and pacing intent. Hold times that contradict the pacing label (e.g. a
12-second shot in a "fast" scene) are timing contradictions — avoid them.
Within the validated range, trust your creative judgment.

MULTI-ANGLE COVERAGE (use I2V continuity proactively for long scenes):
When a scene covers 15+ seconds in the same physical location, do NOT plan it as one long shot or a series of entirely separate keyframe generations.
Instead, break it into 3-5 shorter shots using continuity_from_previous + angle_change + synthesis_mode I2V to create a multi-camera feel:
- Example chain: wide establishing (T2V) → push in to medium (I2V, angle_change: push in to medium shot) → reframe to subject closeup (I2V, angle_change: shift to close-up on face) → pull back to wide again (I2V, angle_change: pull back to re-establish)
- This is cinematically superior to 4 unrelated T2V shots because the world stays consistent while the camera moves
- I2V chains also save generation cost and produce more coherent results than disconnected keyframes
- The "angle_change" should be concise and camera-oriented: "push in to medium", "shift overhead", "pan left to reveal doorway", "pull back to wide", "detail crop to hands"`);


  return parts.join('\n');
}

function buildUserPrompt(scene: EnrichedScene, wordsPerSecond: number): string {
  const durationSeconds = scene.end_seconds - scene.start_seconds;
  const wordsInScene = scene.end_word_index - scene.start_word_index + 1;
  const approxWordsPerShot = Math.round(wordsInScene / scene.suggested_shot_count);
  const approxSecsPerShot = (approxWordsPerShot / wordsPerSecond).toFixed(1);
  const isLongScene = durationSeconds > 25;

  const densityNote = isLongScene
    ? `⚠️  This scene runs ${durationSeconds.toFixed(1)}s. Plan at least ${scene.suggested_shot_count} shots.
    At ${wordsPerSecond.toFixed(2)} wps, every ~${Math.round(wordsPerSecond * 5)} words ≈ 5 seconds.
    Distribute your word ranges so no single shot spans more than ~12 seconds.`
    : `Targeting ~${approxSecsPerShot}s per shot (${scene.suggested_shot_count} shots over ${durationSeconds.toFixed(1)}s).`;

  return `Plan the shots for this scene:

SCENE TIMING:
- Duration: ${durationSeconds.toFixed(1)}s (${scene.start_seconds.toFixed(1)}s → ${scene.end_seconds.toFixed(1)}s)
- Narration rate: ${wordsPerSecond.toFixed(2)} words/second
- Word range: indices ${scene.start_word_index}–${scene.end_word_index} (${wordsInScene} words)
- Suggested shots: ${scene.suggested_shot_count}
- ${densityNote}

SCENE TEXT:
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

  // ── Emergency bisect safety net ──────────────────────────────────────────
  // Fires ONLY for shots exceeding 15s — a clear index error, not a creative choice.
  // Deliberate slow-burn establishing shots (8-12s) are never touched.
  const EMERGENCY_MAX_SHOT_SECONDS = 15;
  let ei = 0;
  while (ei < shots.length) {
    const s = shots[ei];
    if (s.end_word_index <= s.start_word_index + 2) { ei++; continue; } // too short to bisect
    const shotDur = wordTimestamps[s.end_word_index].end_seconds
                  - wordTimestamps[s.start_word_index].start_seconds;
    if (shotDur > EMERGENCY_MAX_SHOT_SECONDS) {
      const mid = Math.floor((s.start_word_index + s.end_word_index) / 2);
      const splitSecond = {
        ...s,
        start_word_index: mid + 1,
        continuity_from_previous: true,
        synthesis_mode: 'I2V' as const,
        angle_change: 'push in to medium',
      };
      s.end_word_index = mid;
      shots.splice(ei + 1, 0, splitSecond);
      // Don't advance — re-check this slot (first half might still be >15s)
    } else {
      ei++;
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  // Convert to enriched shots
  const enrichedShots = shots.map((shot, i): EnrichedPlannedShot => {
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

  // ── Synthesis consistency pass ─────────────────────────────────────────────
  // Corrects four classes of LLM mismatch that the model occasionally produces.
  // All fixes are silent corrections logged for debugger visibility.
  // This runs AFTER enrichment so every field is already resolved.
  for (const s of enrichedShots) {
    const label = `[Shot seg=${s.segment_index} scene=${s.scene_id}]`;

    // ❶ image_edit_instruction on a pure T2V shot
    // T2V generates from scratch — there is no keyframe to apply an edit to.
    // The instruction would be silently ignored downstream; strip it now so the
    // debug output is honest about what will actually execute.
    if (
      s.image_edit_instruction &&
      s.synthesis_mode === 'T2V' &&
      !s.continuity_from_previous &&
      s.media_type !== 'motiongraphic'
    ) {
      console.warn(
        `${LOG_PREFIX} ${label} SYNTHESIS FIX: image_edit_instruction present on T2V shot ` +
        `(no keyframe to edit). Promoting to I2V continuity so the edit can execute.`
      );
      // Promote: the edit instruction implies the shot should chain from a keyframe.
      // The most sensible interpretation is "generate a keyframe, then apply the edit,
      // then animate from it" — which is exactly the I2V + image_edit_instruction pattern.
      s.synthesis_mode = 'I2V';
      s.continuity_from_previous = true;
      s.anchor_strategy = 'prev_frame';
      s.continuity_level = 'strict';
    }

    // ❷ segmentation_treatment present but render_strategy doesn't match its execution_mode
    // The model sometimes writes segmentation_treatment AND separately sets render_strategy
    // to ai_video/ai_image, forgetting the two must agree.
    if (s.segmentation_treatment?.execution_mode) {
      const expectedStrategy = s.segmentation_treatment.execution_mode; // segment_animate | segment_video_fx | segment_mask_prep
      if (s.render_strategy !== expectedStrategy) {
        console.warn(
          `${LOG_PREFIX} ${label} SYNTHESIS FIX: render_strategy="${s.render_strategy}" ` +
          `conflicts with segmentation execution_mode="${expectedStrategy}". Correcting.`
        );
        s.render_strategy = expectedStrategy;
      }
    }

    // ❸ segmentation_treatment present on a motiongraphic shot
    // MG has its own compositing pipeline. Segmentation cannot run on top of a Remotion render.
    if (s.media_type === 'motiongraphic' && s.segmentation_treatment) {
      console.warn(
        `${LOG_PREFIX} ${label} SYNTHESIS FIX: segmentation_treatment on motiongraphic shot ` +
        `is not executable. Stripping segmentation and correcting render_strategy to "motiongraphic".`
      );
      s.segmentation_treatment = undefined;
      s.render_strategy = 'motiongraphic';
    }

    // ❹ render_strategy is in segmentation lane but no segmentation_treatment is defined
    // The model chose a segmentation render_strategy without providing the required config.
    // Fall back to ai_video so the shot still generates something useful.
    if (
      (s.render_strategy === 'segment_animate' ||
       s.render_strategy === 'segment_video_fx' ||
       s.render_strategy === 'segment_mask_prep') &&
      !s.segmentation_treatment
    ) {
      console.warn(
        `${LOG_PREFIX} ${label} SYNTHESIS FIX: render_strategy="${s.render_strategy}" ` +
        `with no segmentation_treatment defined. Falling back to "ai_video".`
      );
      s.render_strategy = 'ai_video';
    }
    // ❺ image_edit_instruction on a motiongraphic shot
    // MG has its own compositing pipeline — there is no "source keyframe" to apply an edit to.
    // These instructions would be silently skipped by the orchestrator; strip here so the
    // plan is honest and no misleading "No source image for creative edit" logs appear.
    if (s.media_type === 'motiongraphic' && s.image_edit_instruction) {
      console.warn(
        `${LOG_PREFIX} ${label} SYNTHESIS FIX: image_edit_instruction on motiongraphic shot ` +
        `is not executable (no keyframe source). Stripping.`
      );
      s.image_edit_instruction = undefined;
    }
  }
  // ──────────────────────────────────────────────────────────────────────────

  return enrichedShots;
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
  /** Optional debug capture callbacks — never passed in production. */
  debugCapture?: DebugCapture,
  /** Thin entity roster: character names+roles and location types only. */
  entityRoster?: ThinEntityRoster,
): Promise<EnrichedPlannedShot[] | null> {
  // Compute narration rate; fall back to 2.5 wps if timestamps are thin
  const totalWords = wordTimestamps.length;
  const totalSecs = totalWords > 0 ? wordTimestamps[totalWords - 1].end_seconds : 0;
  const wordsPerSecond = totalSecs > 0 ? totalWords / totalSecs : 2.5;

  const systemPrompt = buildSystemPrompt(orchestratorPrompt, scene, adjacentContext, wordsPerSecond, entityRoster);
  const userPrompt = buildUserPrompt(scene, wordsPerSecond);
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

      // Debug capture: emit prompts before the LLM call
      debugCapture?.onSystemPrompt?.(`shot_planner:${scene.scene_id}`, i, systemPrompt);
      debugCapture?.onUserPrompt?.(`shot_planner:${scene.scene_id}`, i, userPrompt);

      const raw = await generateJSON<SceneShotPlanOutput>(
        userId,
        systemPrompt,
        userPrompt,
        {
          model,
          responseFormat,
          temperature: 0.5,
          maxTokens: 131072, // 128k — Gemini 3 Flash supports this; 65k was truncating large-video system prompts
          maxRetries: 1,
        }
      );

      // Debug capture: emit raw response after the LLM call
      debugCapture?.onLLMResponse?.(`shot_planner:${scene.scene_id}`, i, raw);

      const parsed = SceneShotPlanOutput.safeParse(raw);
      if (!parsed.success) {
        console.warn(
          `${LOG_PREFIX} Scene "${scene.scene_id}" attempt ${i + 1} Zod validation failed:`,
          parsed.error.message
        );
        debugCapture?.onError?.(`shot_planner:${scene.scene_id}`, i, `Zod validation failed: ${parsed.error.message}`);
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
        debugCapture?.onError?.(`shot_planner:${scene.scene_id}`, i, 'Post-processing produced 0 valid shots');
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
      debugCapture?.onError?.(`shot_planner:${scene.scene_id}`, i, errMsg);
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
  onProgress?: (message: string, sceneIndex: number) => void,
  /** Optional debug capture callbacks — never passed in production. */
  debugCapture?: DebugCapture,
  /** Thin entity roster: character names+roles and location types only. */
  entityRoster?: ThinEntityRoster,
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
      globalSegmentOffset,
      debugCapture,
      entityRoster,
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
