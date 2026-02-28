/**
 * Dynamic Prompt Generator
 * ============================================================================
 * Generates tailored system prompts for each downstream worker by merging
 * the user's system prompt with the video's Creative Manifest.
 *
 * This is the "hiring optimized workers" concept from the design doc (§3).
 * The Orchestrator calls this once at the start of each video to produce
 * per-worker instructions that are injected as system prompts.
 */

import type { CreativeManifest, GCMEntity, WorkerPrompts } from '@/lib/types/closed-loop';

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

VISUAL STYLE: ${manifest.style.visual_style}
ASPECT RATIO: ${manifest.style.aspect_ratio}
${manifest.style.lighting_mood ? `LIGHTING MOOD: ${manifest.style.lighting_mood}` : ''}

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
${entityList}

OUTPUT: A structured JSON ShotPlan with each shot aligned to narration segments, assigned media types, entity references, and synthesis modes.`;
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

VISUAL STYLE: ${manifest.style.visual_style}
COLOR PALETTE: ${manifest.style.color_palette.join(', ') || 'Not specified'}
${manifest.style.lighting_mood ? `LIGHTING: ${manifest.style.lighting_mood}` : ''}
${entityContext}

PROMPT ENRICHMENT RULES:
- Always include the visual style keywords in AI generation prompts
- For shots referencing entities, embed the entity's text_description
- For stock searches, extract semantic keywords from the shot description
- For SFX, match sound effects to precise timeline positions`;
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

VISUAL STYLE: ${manifest.style.visual_style}
QUALITY ANCHORS: ${qualityAnchors}
CONSTRAINTS: ${constraints}
ASPECT RATIO: ${manifest.style.aspect_ratio}

GENERATION RULES:
- Z-Image does NOT support negative prompts — embed all constraints in the positive prompt
- Always include quality anchors in every prompt
- Maintain consistent lighting and color grading across all images
- Generate at the highest quality settings available`;
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

VISUAL STYLE: ${manifest.style.visual_style}
ASPECT RATIO: ${manifest.style.aspect_ratio}

VIDEO GENERATION RULES:
- Use T2V mode for first shots or isolated scenes
- Use FF2V mode for sequential shots continuing the same scene
- Always describe camera movement explicitly (push in, track left, slow zoom, etc.)
- Include temporal descriptions (action starts with..., over 3 seconds...)
- Match the lighting and color grading from the style guide`;
}

/**
 * Build the Motion Graphics Agent's system prompt.
 */
function buildMotionGraphicsPrompt(
  userPrompt: string,
  manifest: CreativeManifest
): string {
  const mgTheme = manifest.motion_graphics?.theme || 'dark';
  const mgColors = manifest.motion_graphics?.color_palette?.join(', ') || '#0A0A0A, #3B82F6, #FFFFFF';
  const mgAnimation = manifest.motion_graphics?.animation_style || 'smooth';

  return `You are an expert Remotion composition designer for motion graphics.

USER CREATIVE DIRECTION:
${userPrompt || 'No specific direction provided.'}

VISUAL STYLE: ${manifest.style.visual_style}
MG THEME: ${mgTheme}
COLOR PALETTE: ${mgColors}
ANIMATION STYLE: ${mgAnimation}

COMPOSITION RULES:
- Use React + Remotion APIs only
- All animations should use spring physics for natural movement
- Typography should be clean and readable
- Maintain visual consistency with the overall video style
- Include smooth entrance and exit animations`;
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

VISUAL STYLE (match music mood): ${manifest.style.visual_style}
${manifest.style.lighting_mood ? `MOOD: ${manifest.style.lighting_mood}` : ''}

MUSIC RULES:
- Generate 2-3 variants for selection
- For videos > 90s, generate in overlapping 90-120s segments
- Include ducking rules for narration sections
- Match the energy curve to the video pacing`;
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

VISUAL STYLE (match SFX mood): ${manifest.style.visual_style}

SFX RULES:
- Search for CC0 licensed sound effects
- Prioritize high audio quality (44.1kHz+)
- Match SFX to precise timeline positions based on TTS timestamps
- Less is more — only add SFX where they genuinely enhance the experience
- Avoid distracting or overpowering sounds`;
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
