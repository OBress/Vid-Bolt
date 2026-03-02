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

MEDIA WEIGHTING TARGETS:
- Stock footage: ${Math.round(manifest.media_weighting.stock_footage * 100)}%
- AI video: ${Math.round(manifest.media_weighting.ai_video * 100)}%
- Motion graphics: ${Math.round(manifest.media_weighting.motion_graphics * 100)}%
- AI image (static): ${Math.round(manifest.media_weighting.ai_image_static * 100)}%

PACING RULES:
- Hook duration: ${manifest.pacing_rules.hook_duration_seconds}s
- Hook must have at least ${manifest.pacing_rules.hook_min_motion_graphics} motion graphics
- Max ${manifest.pacing_rules.max_consecutive_static_images} consecutive static images
- Min ${manifest.pacing_rules.min_video_shots_per_minute} video shots per minute

INTENTIONALITY RULES:
- Every shot MUST have a clear purpose: inform, emotionally engage, or visually transition
- Avoid random or decorative visuals — each shot must logically flow from the previous
- Use visual motifs (recurring visual elements) to create thematic continuity
- Match visual intensity to narrative intensity (calm narration = slow/wide shots, tense = tight/fast)
- Vary shot types intentionally: establish → detail → reaction → establish
- Each shot must declare its narrative purpose in the description
${entityList}

OUTPUT: A structured JSON ShotPlan with each shot aligned to narration segments, assigned media types, entity references, and synthesis modes.${getWorkerOverride(manifest, 'shot_planner')}`;
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
${entityContext}

PROMPT ENRICHMENT RULES:
- Always include the visual style keywords in AI generation prompts
- For shots referencing entities, embed the entity's text_description
- For stock searches, extract semantic keywords from the shot description
- For SFX, match sound effects to precise timeline positions
- Maintain thematic consistency across all prompts — every visual should feel like it belongs to the same video${getWorkerOverride(manifest, 'asset_scout')}`;
}

/**
 * Build the Image Generation Agent's system prompt.
 */
function buildImageGenPrompt(
  userPrompt: string,
  manifest: CreativeManifest
): string {
  const qualityAnchors = manifest.visual?.quality_anchors?.join(', ') || 'photorealistic, cinematic, 4K, film grain';
  const constraints = manifest.visual?.image_constraints?.join(', ') || 'no text, no watermark, no logos';

  return `You are an expert AI image generation specialist optimized for Z-Image Turbo.

USER CREATIVE DIRECTION:
${userPrompt || 'No specific direction provided.'}
${buildCreativeDirectionBlock(manifest)}
${buildLoraBlock(manifest)}

VISUAL STYLE: ${manifest.style.visual_style}
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
- Every image must serve a narrative purpose — no generic stock-like compositions${getWorkerOverride(manifest, 'image_gen')}`;
}

/**
 * Build the Video Generation Agent's system prompt.
 */
function buildVideoGenPrompt(
  userPrompt: string,
  manifest: CreativeManifest
): string {
  return `You are an expert AI video generation specialist optimized for LTX-2.

USER CREATIVE DIRECTION:
${userPrompt || 'No specific direction provided.'}
${buildCreativeDirectionBlock(manifest)}

VISUAL STYLE: ${manifest.style.visual_style}
ASPECT RATIO: ${manifest.style.aspect_ratio}
${manifest.style.lighting_mood ? `LIGHTING MOOD: ${manifest.style.lighting_mood}` : ''}

VIDEO GENERATION RULES:
- Use T2V mode for first shots or isolated scenes
- Use FF2V mode for sequential shots continuing the same scene
- Always describe camera movement explicitly (push in, track left, slow zoom, etc.)
- Include temporal descriptions (action starts with..., over 3 seconds...)
- Match the lighting and color grading from the style guide
- Generated video must contain meaningful motion — avoid static frames with minor camera drift${getWorkerOverride(manifest, 'video_gen')}`;
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
