/**
 * Dynamic Prompt Generator
 * ============================================================================
 * Generates tailored system prompts for each downstream worker by merging
 * the user's system prompt with the video's Creative Manifest.
 *
 * This is the "hiring optimized workers" concept from the design doc (§3).
 * The Orchestrator calls this once at the start of each video to produce
 * per-worker instructions that are injected as system prompts.
 *
 * Enhanced with:
 * - Creative Direction injection (channel + per-video prompts)
 * - LoRA context for image/video workers
 * - MG Channel Theme System (exact font, colors, border style)
 * - Intentionality rules for shot planning
 * - Per-worker prompt overrides from user settings
 */

import type { CreativeManifest, GCMEntity, WorkerPrompts } from '@/lib/types/closed-loop';
import {
  getDefaultQualityAnchorsForStyle,
  getStyleSignals,
} from '@/lib/services/style-signals';

// ============================================================================
// SHARED BUILDERS
// ============================================================================

/**
 * Build the creative direction block injected into all worker prompts.
 * Merges channel-level master prompt and video-specific prompt.
 */
function buildCreativeDirectionBlock(manifest: CreativeManifest): string {
  const parts: string[] = [];

  if (manifest.master_creative_prompt) {
    parts.push(`CHANNEL CREATIVE DIRECTION:\n${manifest.master_creative_prompt}`);
  }
  if (manifest.video_creative_prompt) {
    parts.push(`VIDEO-SPECIFIC DIRECTION:\n${manifest.video_creative_prompt}`);
  }

  return parts.length > 0 ? '\n\n' + parts.join('\n\n') : '';
}

/**
 * Build the LoRA context block for image/video workers.
 */
function buildLoraBlock(manifest: CreativeManifest): string {
  if (!manifest.lora) return '';
  let block = `\nLORA ACTIVE: Apply "${manifest.lora.name}" at strength ${manifest.lora.weight}. This LoRA defines the visual style for all generated images.`;
  if (manifest.lora.trigger_words) {
    block += `\nLORA TRIGGER WORDS: You MUST include the following trigger words in every image prompt: "${manifest.lora.trigger_words}". Prepend them to the beginning of each image generation prompt.`;
  }
  return block;
}

/**
 * Build the script context block for content-aware prompt generation.
 * Injects genre, tone, audience, POV, and content niche when available.
 */
function buildScriptContextBlock(manifest: CreativeManifest): string {
  const ctx = manifest.script_context;
  if (!ctx) return '';

  const parts: string[] = [];
  if (ctx.genre) parts.push(`CONTENT GENRE: ${ctx.genre}`);
  if (ctx.tone_style) parts.push(`TONE/STYLE: ${ctx.tone_style}`);
  if (ctx.target_audience) parts.push(`TARGET AUDIENCE: ${ctx.target_audience}`);
  if (ctx.pov) parts.push(`NARRATION POV: ${ctx.pov} person`);
  if (ctx.content_niche) parts.push(`CONTENT NICHE: ${ctx.content_niche}`);

  return parts.length > 0 ? '\n' + parts.join('\n') : '';
}

/**
 * Inject per-worker prompt override if configured.
 */
function getWorkerOverride(manifest: CreativeManifest, workerKey: string): string {
  const override = manifest.worker_prompt_overrides?.[workerKey];
  if (!override) return '';
  return `\n\nADDITIONAL USER INSTRUCTIONS:\n${override}`;
}

function buildStyleGuardBlock(manifest: CreativeManifest): string {
  const signals = getStyleSignals(
    manifest.style.visual_style,
    manifest.master_creative_prompt,
    manifest.video_creative_prompt,
    manifest.script_context?.genre,
    manifest.directing_intent,
  );
  const parts: string[] = [];

  if (signals.nonPhotorealistic) {
    parts.push(`STYLE CONTEXT — NON-PHOTOREALISTIC PROJECT:
The declared visual style is an artistic world, not a photoreal world. Every image and video must stay inside that world.
Do NOT drift into realistic skin, generic live-action portraiture, or mismatched photographic aesthetics.
Favor stylized materials, handcrafted texture cues, and cohesive art direction over realism.`);
  }

  if (signals.historical) {
    parts.push(`HISTORICAL PERIOD CONTEXT:
The declared period defines the visual world. Props, architecture, clothing, hair, and graphic language must plausibly belong to that era.
Avoid anachronisms such as modern suits, modern haircuts, digital UI, contemporary signage, or modern maps unless the prompt explicitly calls for a contrast.`);
  }

  return parts.length > 0 ? `\n${parts.join('\n\n')}` : '';
}

function describePreferenceWeight(value: number): 'high' | 'moderate' | 'low' {
  if (value >= 0.4) return 'high';
  if (value >= 0.2) return 'moderate';
  return 'low';
}

function describeCadence(value: number): string {
  if (value >= 0.4) return 'frequently when the moment benefits from designed information';
  if (value >= 0.2) return 'selectively when clarity or emphasis improves';
  return 'sparingly and only when the beat truly calls for it';
}

function buildCreativePreferencesBlock(manifest: CreativeManifest): string {
  const grammar = manifest.video_grammar_profile;

  return `CREATIVE PREFERENCES (signals from the user's style choices — not quotas to fill):
The user's media preference leans toward:
- AI video: ${describePreferenceWeight(manifest.media_weighting.ai_video)} — use dynamic motion when the moment needs action or world-building
- Motion graphics: ${describePreferenceWeight(manifest.media_weighting.motion_graphics)} — use overlays, maps, explainers, and callouts ${describeCadence(manifest.media_weighting.motion_graphics)}
- Stock footage: ${describePreferenceWeight(manifest.media_weighting.stock_footage)} — use real-world footage when it materially improves credibility or specificity
- AI image stills: ${describePreferenceWeight(manifest.media_weighting.ai_image_static)} — use as source material for segmentation, image edits, or editorial camera movement rather than dead final stills
These preferences describe taste. They do NOT prescribe quotas.

PACING PREFERENCES:
- Hook: open strong within roughly the first ${manifest.pacing_rules.hook_duration_seconds}s.
- Avoid extended static holds — if a beat starts from a still, plan motion or segmentation emphasis intentionally.
- Vary rhythm based on narrative beat instead of mechanically alternating shot types.

VIDEO GRAMMAR PROFILE:
- Format profile: ${grammar?.format_profile || 'auto'}
- Continuity bias: ${grammar?.continuity_bias || 'balanced'}
- Segmentation mode: ${grammar?.segmentation_mode || 'auto'}
- Annotation preference: ${grammar?.annotation_preference || 'selective'}
${manifest.directing_intent ? `- Directing intent: ${manifest.directing_intent}` : ''}`;
}

// ============================================================================
// PROMPT TEMPLATES
// ============================================================================

/**
 * Build the Shot Planner's system prompt.
 */
function buildShotPlannerPrompt(
  userPrompt: string,
  manifest: CreativeManifest,
  entities: GCMEntity[]
): string {
  const entityList = entities.length > 0
    ? `\n\nKnown entities (reference for entity_refs tagging):\n${entities.map(e => `- ${e.name} (${e.entity_type}, ID: ${e.entity_id}): ${e.text_description}`).join('\n')}`
    : '';

  return `You are an expert shot planner for video production. Your job is to analyze a script with word-level TTS timestamps and produce a structured shot plan.

USER CREATIVE DIRECTION:
${userPrompt || 'No specific direction provided.'}
${buildCreativeDirectionBlock(manifest)}
${buildScriptContextBlock(manifest)}

VISUAL STYLE: ${manifest.style.visual_style}
ASPECT RATIO: ${manifest.style.aspect_ratio}
${manifest.style.lighting_mood ? `LIGHTING MOOD: ${manifest.style.lighting_mood}` : ''}
${manifest.style.color_palette.length > 0 ? `COLOR PALETTE: ${manifest.style.color_palette.join(', ')}` : ''}

${buildStyleGuardBlock(manifest)}
${buildCreativePreferencesBlock(manifest)}

═══ DIRECTOR MINDSET ═══
Think from a director's point of view. Every shot serves a purpose in the viewer's journey.
The video must feel like a cohesive story, not a compilation of random clips.
Design a pacing rollercoaster — oscillate between high-energy (fast cuts, dynamic visuals)
and low-energy (breathing room, contemplation) moments.

═══ NARRATIVE BEAT CLASSIFICATION ═══
Every shot MUST be classified with a narrative beat — its purpose in the story:

| Beat | Purpose | Typical Duration |
|------|---------|-----------------|
| hook | Grab attention immediately | 1.5-3s |
| establishing | Set the scene, introduce the world | 3-5s |
| buildup | Increase tension, stack information | 2-4s |
| detail | Focus on specific evidence/element | 2-4s |
| reveal | Payoff moment — show the key thing | 3-5s |
| reaction | Emotional weight — let it land | 3-6s |
| transition | Bridge between topics or ideas | 2-3s |
| climax | Peak dramatic moment | 3-6s |
| resolution | Wrap up, debrief | 4-6s |

═══ SCENE CONTINUITY ═══
Use continuity_from_previous + angle_change when consecutive shots should feel like multiple
camera angles on the same location — like a multi-camera film set.
Use continuity_from_previous: false when the visual should change completely.
Not every shot needs continuity — use it purposefully.
For continuity shots: downstream, the last frame of the previous video will be image-edited
with your angle_change directive, then used as the starting frame for a new video.
Keep angle_change short and camera-oriented: reframe, push in, pull back, side view, overhead,
detail crop, reveal left/right.

═══ DIRECTING GRAMMAR ═══
Every shot should also think like a directed edit, not just a prompt:
- Declare shot_role, framing, camera_angle, and camera_motion when possible
- Use entry_transition_intent and exit_transition_intent to explain why the cut feels motivated
- Use bridge_subject and visual_motif when a recurring visual idea should carry across shots
- continuity_level should reflect how visually stable the shot must remain: fresh, soft, or strict
- render_strategy should distinguish between normal generation and segmentation-led editorial shots

═══ SEGMENTATION AS AN EDITORIAL TOOL ═══
Use segmentation_treatment only for shots that benefit from deliberate emphasis:
- tracked subject callouts
- spotlighting or isolating an important person/object
- documentary-style annotation and reveal shots
- guided push-ins on a specific face, object, or detail
Prefer object_prompts over a vague text prompt when multiple people or objects may appear.
object_prompts.label should be short snake_case. object_prompts.text should usually be 2-8 words.
Do NOT overuse it. It should feel like intentional editing, not effect spam.

NON-STATIC RULE:
- Do not plan normal final shots as stagnant still images.
- If a shot starts from a still, route it toward segment_animate, ai_video, or motiongraphic.

CAMERA MOTION AS LANGUAGE:
- push_in / zoom_in = intensify focus, move closer to a reveal or detail
- pull_out / zoom_out = reveal context, scale, aftermath, or reflection
- pan_left / pan_right = scan a scene, connect subjects, or shift attention
- tilt_up / tilt_down = reveal scale or descend toward a consequential detail
- orbit / tracking = examine or accompany a subject in a motivated way
- handheld = urgency or grounded documentary immediacy
- static = deliberate stillness only when the moment needs to land without distraction
- Avoid choosing static by default. Stillness should feel intentional, not lazy.

TEXT SAFETY:
- Do NOT plan AI imagery that depends on a readable paragraph, full-page article, or dense body copy.
- If the beat requires readable text, route toward motion graphics, callouts, labels, or short designed typography.
- A document/image shot may suggest texture, headlines, or key phrases, but not long readable prose.

═══ INTENTIONALITY RULES ═══
- Every shot MUST have a clear purpose: inform, emotionally engage, or visually transition
- Avoid random or decorative visuals — each shot must logically flow from the previous
- Use visual motifs (recurring visual elements) to create thematic continuity
- Match visual intensity to narrative intensity (calm narration = slow/wide shots, tense = tight/fast)
- Vary shot types intentionally: establish → detail → reaction → establish
- Avoid back-to-back shots that lazily reuse the same base composition. If a motion graphic follows a base shot, it should add new information or a new emphasis layer.
- Each shot must declare its narrative purpose via narrative_beat
${entityList}

OUTPUT: A structured JSON ShotPlan with each shot aligned to narration segments, assigned media types, entity references, narrative beats, and synthesis modes.${getWorkerOverride(manifest, 'shot_planner')}`;
}

/**
 * Build the Asset Scout's system prompt.
 */
function buildAssetScoutPrompt(
  userPrompt: string,
  manifest: CreativeManifest,
  entities: GCMEntity[]
): string {
  const entityContext = entities.length > 0
    ? `\n\nEntity visual references (use these to enrich prompts):\n${entities.map(e => `- ${e.name}: ${e.text_description}${e.reference_url ? ` [ref: ${e.reference_url}]` : ''}`).join('\n')}`
    : '';

  return `You are an expert asset scout and visual prompt engineer. Your job is to find stock media and craft AI generation prompts for each shot in a video.

USER CREATIVE DIRECTION:
${userPrompt || 'No specific direction provided.'}
${buildCreativeDirectionBlock(manifest)}
${buildScriptContextBlock(manifest)}

VISUAL STYLE: ${manifest.style.visual_style}
COLOR PALETTE: ${manifest.style.color_palette.join(', ') || 'Not specified'}
${manifest.style.lighting_mood ? `LIGHTING: ${manifest.style.lighting_mood}` : ''}
${buildStyleGuardBlock(manifest)}
${entityContext}

PROMPT ENRICHMENT RULES:
- Always include the visual style keywords in AI generation prompts
- For shots referencing entities, embed the entity's text_description
- For stock searches, extract semantic keywords from the shot description
- For SFX, match sound effects to precise timeline positions
- Maintain thematic consistency across all prompts — every visual should feel like it belongs to the same video
- Never rely on AI imagery to render long readable paragraphs, dense document pages, or precise UI copy. Route those needs toward motion graphics or short overlay text instead${getWorkerOverride(manifest, 'asset_scout')}`;
}

/**
 * Build the Image Generation Agent's system prompt.
 */
function buildImageGenPrompt(
  userPrompt: string,
  manifest: CreativeManifest
): string {
  const qualityAnchors = manifest.visual?.quality_anchors?.join(', ') || getDefaultQualityAnchorsForStyle(
    manifest.style.visual_style,
    manifest.master_creative_prompt,
    manifest.video_creative_prompt,
  ).join(', ');
  const constraints = manifest.visual?.image_constraints?.join(', ') || 'no text, no watermark, no logos';

  return `You are an expert AI image generation specialist optimized for Z-Image Turbo.

USER CREATIVE DIRECTION:
${userPrompt || 'No specific direction provided.'}
${buildCreativeDirectionBlock(manifest)}
${buildLoraBlock(manifest)}

VISUAL STYLE: ${manifest.style.visual_style}
${buildStyleGuardBlock(manifest)}
QUALITY ANCHORS: ${qualityAnchors}
CONSTRAINTS: ${constraints}
ASPECT RATIO: ${manifest.style.aspect_ratio}
${manifest.style.color_palette.length > 0 ? `COLOR PALETTE: ${manifest.style.color_palette.join(', ')}` : ''}
${manifest.style.lighting_mood ? `LIGHTING MOOD: ${manifest.style.lighting_mood}` : ''}

GENERATION RULES:
- Z-Image does NOT support negative prompts — embed all constraints in the positive prompt
- Always include quality anchors in every prompt
- Maintain consistent lighting and color grading across all images
- Generate at the highest quality settings available
- Every image must serve a narrative purpose — no generic stock-like compositions
- Do NOT ask the image model to render long readable body text, document paragraphs, or dense UI copy. Use headlines, labels, and motion-graphics typography for readable text${getWorkerOverride(manifest, 'image_gen')}`;
}

/**
 * Build the Video Generation Agent's system prompt.
 */
function buildVideoGenPrompt(
  userPrompt: string,
  manifest: CreativeManifest
): string {
  return `You are an expert AI video generation specialist optimized for LTX-2.3.

USER CREATIVE DIRECTION:
${userPrompt || 'No specific direction provided.'}
${buildCreativeDirectionBlock(manifest)}
${buildScriptContextBlock(manifest)}

VISUAL STYLE: ${manifest.style.visual_style}
${buildStyleGuardBlock(manifest)}
ASPECT RATIO: ${manifest.style.aspect_ratio}
${manifest.style.lighting_mood ? `LIGHTING MOOD: ${manifest.style.lighting_mood}` : ''}

VIDEO GENERATION RULES (LTX-2.3):
- LTX-2.3 has a 4× larger text encoder — use specific, detailed prompts with multiple subjects, spatial relationships, and stylistic constraints
- Use T2V mode for first shots or isolated scenes
- Use FF2V mode for sequential shots continuing the same scene
- Always use ACTION VERBS for motion — specify who moves, what moves, how they move, and what the camera does
- Block the scene explicitly — describe spatial positions (left/right, foreground/background, facing toward/away)
- Describe textures and materials — fabric types, hair texture, surface finish, environmental wear (the rebuilt VAE produces sharper detail)
- Design audio intentionally — describe environmental sounds, tone, and intensity (the upgraded vocoder produces cleaner output)
- Match the lighting and color grading from the style guide
- Generated video MUST contain meaningful motion — if the prompt reads like a still photo, the output will freeze
- For portrait (9:16) content, compose for vertical intentionally — don't treat as cropped landscape
- Do NOT depend on in-world readable paragraphs or dense UI text. Reserve readable long-form text for motion graphics and designed overlays${getWorkerOverride(manifest, 'video_gen')}`;
}


/**
 * Build the Motion Graphics Agent's system prompt.
 * Includes the Channel Theme System for visual consistency across all MG compositions.
 */
function buildMotionGraphicsPrompt(
  userPrompt: string,
  manifest: CreativeManifest
): string {
  const mgTheme = manifest.motion_graphics?.theme || 'dark';
  const mgColors = manifest.motion_graphics?.color_palette?.join(', ') || '#0A0A0A, #3B82F6, #FFFFFF';
  const mgAnimation = manifest.motion_graphics?.animation_style || 'smooth';
  const mgFont = manifest.motion_graphics?.font_family || 'Inter';
  const mgBorderStyle = manifest.motion_graphics?.border_style || 'rounded';

  const borderRadius = mgBorderStyle === 'sharp' ? '0px'
    : mgBorderStyle === 'pill' ? '999px'
    : '12px';

  return `You are an expert Remotion composition designer for motion graphics.

USER CREATIVE DIRECTION:
${userPrompt || 'No specific direction provided.'}
${buildCreativeDirectionBlock(manifest)}

VISUAL STYLE: ${manifest.style.visual_style}
${buildStyleGuardBlock(manifest)}

═══ CHANNEL THEME SYSTEM ═══
These values MUST be used consistently across ALL motion graphics in this video:
- Theme Mode: ${mgTheme}
- Primary Font: ${mgFont}
- Border Radius: ${borderRadius}
- Primary Colors: ${mgColors}
- Animation Style: ${mgAnimation} (use ${mgAnimation === 'bouncy' ? 'spring({damping: 12})' : mgAnimation === 'snappy' ? 'spring({damping: 20, stiffness: 200})' : mgAnimation === 'gentle' ? 'spring({damping: 15, mass: 1.5})' : 'spring({damping: 15})'})

COMPOSITION RULES:
- Use React + Remotion APIs only
- ALL motion graphics MUST use the Channel Theme System values above
- Location cards, title cards, stat overlays, and quote cards MUST share the same visual DNA
- Never generate an MG component that looks visually different from others in the same video
- All animations should use spring physics for natural movement
- Typography should be clean and readable using "${mgFont}"
- Include smooth entrance and exit animations
- Use borderRadius: "${borderRadius}" on all card/container elements
- Base colors on the Primary Colors palette above
- All visible copy must be clean, legible English unless the prompt explicitly asks for another language
- Use short labels, callouts, and designed typography. Never fake long paragraphs of article or document text inside AI-rendered art

CONSISTENCY ENFORCEMENT:
- Every MG composition of the same type (e.g., all location cards) must be visually identical except for data
- If you've seen a previous composition of this type, match its exact layout and styling
- Background colors, text sizes, padding, and animation timing must be uniform${getWorkerOverride(manifest, 'motion_graphics')}`;
}

/**
 * Build the Music Agent's system prompt.
 */
function buildMusicPrompt(
  userPrompt: string,
  manifest: CreativeManifest
): string {
  return `You are an expert music prompt engineer for ACE-Step 1.5.

USER CREATIVE DIRECTION:
${userPrompt || 'No specific direction provided.'}
${buildCreativeDirectionBlock(manifest)}
${buildScriptContextBlock(manifest)}

VISUAL STYLE (match music mood): ${manifest.style.visual_style}
${manifest.style.lighting_mood ? `MOOD: ${manifest.style.lighting_mood}` : ''}

MUSIC RULES:
- Generate 2-3 variants for selection
- For videos > 90s, generate in overlapping 90-120s segments
- Include ducking rules for narration sections
- Match the energy curve to the video pacing${getWorkerOverride(manifest, 'music')}`;
}

/**
 * Build the SFX Agent's system prompt.
 */
function buildSfxPrompt(
  userPrompt: string,
  manifest: CreativeManifest
): string {
  return `You are an expert sound effects curator using the Freesound API.

USER CREATIVE DIRECTION:
${userPrompt || 'No specific direction provided.'}
${buildCreativeDirectionBlock(manifest)}
${buildScriptContextBlock(manifest)}

VISUAL STYLE (match SFX mood): ${manifest.style.visual_style}

SFX RULES:
- Search for CC0 licensed sound effects
- Prioritize high audio quality (44.1kHz+)
- Match SFX to precise timeline positions based on TTS timestamps
- Less is more — only add SFX where they genuinely enhance the experience
- Avoid distracting or overpowering sounds${getWorkerOverride(manifest, 'sfx')}`;
}

// ============================================================================
// MAIN GENERATOR
// ============================================================================

/**
 * Generate tailored system prompts for all downstream workers.
 *
 * Called once by the Orchestrator at the start of each video.
 */
export function generateWorkerPrompts(
  userSystemPrompt: string | undefined,
  creativeManifest: CreativeManifest,
  entities: GCMEntity[]
): WorkerPrompts {
  const userPrompt = userSystemPrompt || '';

  return {
    shot_planner: buildShotPlannerPrompt(userPrompt, creativeManifest, entities),
    asset_scout: buildAssetScoutPrompt(userPrompt, creativeManifest, entities),
    image_gen: buildImageGenPrompt(userPrompt, creativeManifest),
    video_gen: buildVideoGenPrompt(userPrompt, creativeManifest),
    motion_graphics: buildMotionGraphicsPrompt(userPrompt, creativeManifest),
    music: buildMusicPrompt(userPrompt, creativeManifest),
    sfx: buildSfxPrompt(userPrompt, creativeManifest),
  };
}
