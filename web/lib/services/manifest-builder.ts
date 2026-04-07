/**
 * Manifest Builder Service
 * ============================================================================
 * Builds a CreativeManifest by merging three layers:
 * 
 * 1. System defaults (sensible fallbacks — current hardcoded values)
 * 2. Channel-level creative direction (from project_settings.visuals.creativeDirection)
 * 3. Per-video creative overrides (from user at production time)
 *
 * Merge strategy:
 * - Atomic fields: last-writer-wins (per-video > channel > defaults)
 * - Array fields: union (color_palette, qualityAnchors)
 * - Absent fields: skip (don't overwrite with undefined)
 */

import type { CreativeManifest, VideoCreativeOverrides } from '@/lib/types/closed-loop';
import type { CreativeDirectionDefaults, LoraConfig } from '@/types/settings';

// ============================================================================
// SYSTEM DEFAULTS
// ============================================================================

/**
 * Sensible defaults used when neither channel settings nor video overrides
 * provide a value. These match the original hardcoded values in route.ts.
 */
const SYSTEM_DEFAULTS = {
  style: {
    visual_style: 'cinematic, documentary',
    color_palette: [] as string[],
    aspect_ratio: '16:9' as const,
  },
  media_weighting: {
    stock_footage: 0.3,
    ai_video: 0.4,
    motion_graphics: 0.2,
    ai_image_static: 0.1,
  },
  pacing_rules: {
    hook_duration_seconds: 15,
    hook_min_motion_graphics: 2,
    max_consecutive_static_images: 2,
    min_video_shots_per_minute: 3,
  },
  quality_thresholds: {
    max_retries: 3,
  },
} as const;

/**
 * Pacing preset shape (non-const to allow varying values).
 */
interface PacingRules {
  hook_duration_seconds: number;
  hook_min_motion_graphics: number;
  max_consecutive_static_images: number;
  min_video_shots_per_minute: number;
}

/**
 * Pacing presets — predefined pacing rules per content type.
 * Used when channel sets pacingPreset without custom overrides.
 */
const PACING_PRESETS: Record<string, PacingRules> = {
  documentary: {
    hook_duration_seconds: 15,
    hook_min_motion_graphics: 2,
    max_consecutive_static_images: 2,
    min_video_shots_per_minute: 3,
  },
  'fast-paced': {
    hook_duration_seconds: 8,
    hook_min_motion_graphics: 3,
    max_consecutive_static_images: 1,
    min_video_shots_per_minute: 6,
  },
  cinematic: {
    hook_duration_seconds: 20,
    hook_min_motion_graphics: 1,
    max_consecutive_static_images: 3,
    min_video_shots_per_minute: 2,
  },
  educational: {
    hook_duration_seconds: 12,
    hook_min_motion_graphics: 2,
    max_consecutive_static_images: 2,
    min_video_shots_per_minute: 4,
  },
};

// ============================================================================
// OUTLINE CONFIG TYPE
// ============================================================================

export interface OutlineConfig {
  visualStyle?: string;
  aspectRatio?: string;
  [key: string]: unknown;
}

// ============================================================================
// MANIFEST BUILDER
// ============================================================================

/**
 * Resolve the LoRA config for this video.
 * Priority: per-video override > channel default > none.
 */
function resolveLoraConfig(
  channelDefaults?: CreativeDirectionDefaults,
  videoOverrides?: VideoCreativeOverrides,
): CreativeManifest['lora'] | undefined {
  // Per-video override takes priority
  if (videoOverrides?.loraName) {
    const lora = channelDefaults?.loras?.find(
      (l: LoraConfig) => l.name === videoOverrides.loraName
    );
    if (lora) {
      return {
        name: lora.name,
        weight: videoOverrides.loraWeight ?? lora.defaultWeight,
        url: lora.url,
        trigger_words: lora.triggerWords,
      };
    }
  }

  // Fall back to channel default
  if (channelDefaults?.defaultLoraName) {
    const lora = channelDefaults.loras?.find(
      (l: LoraConfig) => l.name === channelDefaults.defaultLoraName
    );
    if (lora) {
      return {
        name: lora.name,
        weight: lora.defaultWeight,
        url: lora.url,
        trigger_words: lora.triggerWords,
      };
    }
  }

  return undefined;
}

/**
 * Merge two arrays, deduplicating entries. Used for color_palette, qualityAnchors, etc.
 */
function unionArrays(base: string[] | undefined, override: string[] | undefined): string[] {
  const merged = [...(base || []), ...(override || [])];
  return [...new Set(merged)];
}

function resolveVideoGrammarProfile(
  videoOverrides?: VideoCreativeOverrides,
  scriptMeta?: { genre?: string; toneStyle?: string; targetAudience?: string; contentNiche?: string },
): NonNullable<CreativeManifest['video_grammar_profile']> {
  const formatProfile = videoOverrides?.formatProfile || (
    (() => {
      const genre = scriptMeta?.genre?.toLowerCase() || '';
      const niche = scriptMeta?.contentNiche?.toLowerCase() || '';
      if (genre.includes('documentary') || niche.includes('history')) return 'documentary' as const;
      if (genre.includes('explain') || niche.includes('education')) return 'explainer' as const;
      if (genre.includes('promo') || niche.includes('marketing')) return 'promo' as const;
      if (genre.includes('narrative') || genre.includes('story')) return 'narrative' as const;
      return 'auto' as const;
    })()
  );

  const continuityBias = videoOverrides?.continuityBias || (
    formatProfile === 'documentary' || formatProfile === 'narrative'
      ? 'strict'
      : formatProfile === 'ugc' || formatProfile === 'listicle'
        ? 'dynamic'
        : 'balanced'
  );

  const segmentationMode = videoOverrides?.segmentationMode || (
    formatProfile === 'documentary' || formatProfile === 'explainer'
      ? 'prefer'
      : 'auto'
  );

  const transitionPalette = formatProfile === 'documentary'
    ? ['motivated push-in', 'match detail', 'environment bridge', 'graphic callout']
    : formatProfile === 'explainer'
      ? ['concept bridge', 'annotation reveal', 'clean cut', 'graphic emphasis']
      : formatProfile === 'promo'
        ? ['punch cut', 'product isolate', 'fast momentum bridge']
        : ['clean cut', 'motivated bridge'];

  const shotVocab = formatProfile === 'documentary'
    ? ['establishing', 'detail insert', 'reaction hold', 'annotation reveal']
    : formatProfile === 'explainer'
      ? ['coverage', 'graphic explainer', 'detail callout', 'bridge']
      : formatProfile === 'ugc'
        ? ['direct address', 'punch-in', 'reaction', 'caption support']
        : ['establishing', 'coverage', 'insert', 'bridge'];

  return {
    format_profile: formatProfile,
    continuity_bias: continuityBias,
    segmentation_mode: segmentationMode,
    annotation_preference:
      segmentationMode === 'prefer'
        ? 'selective'
        : formatProfile === 'promo'
          ? 'minimal'
          : 'selective',
    transition_palette: transitionPalette,
    shot_vocab: shotVocab,
    motif_bias: videoOverrides?.directingIntent || undefined,
  };
}

/**
 * Build a CreativeManifest from the three-layer merge:
 * system defaults → channel-level settings → per-video overrides → outline config.
 *
 * @param videoId - The video project UUID
 * @param outlineConfig - Outline configuration from video metadata
 * @param channelDefaults - Channel-level creative direction (from project_settings)
 * @param videoOverrides - Per-video overrides set at production time
 * @param visualsSettings - Visuals settings (model selections, etc.)
 * @param basicInfoAspectRatio - Fallback aspect ratio from basic_info settings (e.g. '16-9')
 * @param scriptMeta - Script metadata (genre, tone, audience, etc.) for prompt injection
 * @returns A fully-resolved CreativeManifest
 */
export function buildCreativeManifest(
  videoId: string,
  outlineConfig?: OutlineConfig,
  channelDefaults?: CreativeDirectionDefaults,
  videoOverrides?: VideoCreativeOverrides,
  visualsSettings?: { imageModel?: string; videoModel?: string; imageEditModel?: string },
  basicInfoAspectRatio?: string,
  scriptMeta?: { pov?: string; genre?: string; toneStyle?: string; targetAudience?: string; contentNiche?: string },
): CreativeManifest {
  // --- Style ---
  const visualStyle =
    videoOverrides?.visualStyle
    || channelDefaults?.visualStyle
    || outlineConfig?.visualStyle
    || SYSTEM_DEFAULTS.style.visual_style;

  const colorPalette = unionArrays(
    channelDefaults?.colorPalette,
    videoOverrides?.colorPalette,
  );

  const lightingMood =
    videoOverrides?.lightingMood
    || channelDefaults?.lightingMood
    || undefined;

  // Normalize aspect ratio: outline config > basic_info setting > system default
  // basic_info stores with dashes ('16-9'), manifest needs colons ('16:9')
  const rawAr = outlineConfig?.aspectRatio || basicInfoAspectRatio || SYSTEM_DEFAULTS.style.aspect_ratio;
  const aspectRatio = (
    rawAr === '16-9' ? '16:9' : rawAr === '9-16' ? '9:16' : rawAr
  ) as '16:9' | '9:16';

  // --- Media Weighting ---
  const mediaWeighting = {
    stock_footage:
      videoOverrides?.mediaWeightingOverride?.stock_footage
      ?? channelDefaults?.mediaWeighting?.stockFootage
      ?? SYSTEM_DEFAULTS.media_weighting.stock_footage,
    ai_video:
      videoOverrides?.mediaWeightingOverride?.ai_video
      ?? channelDefaults?.mediaWeighting?.aiVideo
      ?? SYSTEM_DEFAULTS.media_weighting.ai_video,
    motion_graphics:
      videoOverrides?.mediaWeightingOverride?.motion_graphics
      ?? channelDefaults?.mediaWeighting?.motionGraphics
      ?? SYSTEM_DEFAULTS.media_weighting.motion_graphics,
    ai_image_static:
      videoOverrides?.mediaWeightingOverride?.ai_image_static
      ?? channelDefaults?.mediaWeighting?.aiImageStatic
      ?? SYSTEM_DEFAULTS.media_weighting.ai_image_static,
  };

  // --- Pacing ---
  const pacingPreset = channelDefaults?.pacingPreset || 'documentary';
  const presetRules = PACING_PRESETS[pacingPreset] || PACING_PRESETS.documentary;
  const pacingRules = channelDefaults?.customPacing
    ? {
        hook_duration_seconds: channelDefaults.customPacing.hookDurationSeconds,
        hook_min_motion_graphics: channelDefaults.customPacing.hookMinMotionGraphics,
        max_consecutive_static_images: channelDefaults.customPacing.maxConsecutiveStaticImages,
        min_video_shots_per_minute: channelDefaults.customPacing.minVideoShotsPerMinute,
      }
    : presetRules;

  // --- Motion Graphics Theme ---
  const motionGraphics = {
    theme: videoOverrides?.mgThemeOverride?.theme
      || channelDefaults?.mgTheme?.theme
      || undefined,
    color_palette: unionArrays(
      channelDefaults?.mgTheme?.colorPalette,
      videoOverrides?.mgThemeOverride?.colorPalette,
    ).length > 0
      ? unionArrays(channelDefaults?.mgTheme?.colorPalette, videoOverrides?.mgThemeOverride?.colorPalette)
      : undefined,
    animation_style: videoOverrides?.mgThemeOverride?.animationStyle
      || channelDefaults?.mgTheme?.animationStyle
      || undefined,
    font_family: channelDefaults?.mgTheme?.fontFamily || undefined,
    border_style: channelDefaults?.mgTheme?.borderStyle || undefined,
  } as CreativeManifest['motion_graphics'];

  // --- Visual Quality ---
  const qualityAnchors = unionArrays(
    channelDefaults?.qualityAnchors,
    videoOverrides?.qualityAnchors,
  );
  const imageConstraints = channelDefaults?.imageConstraints || [];

  // --- LoRA ---
  const lora = resolveLoraConfig(channelDefaults, videoOverrides);

  // --- Creative Direction Prompts ---
  const masterCreativePrompt = channelDefaults?.masterCreativePrompt || undefined;
  const videoCreativePrompt = videoOverrides?.videoCreativePrompt || undefined;
  const directingIntent = videoOverrides?.directingIntent || undefined;

  // --- Worker Prompt Overrides ---
  const workerPromptOverrides = channelDefaults?.workerPromptOverrides || undefined;

  // --- Pacing Preset in Editing ---
  const editingPacingPreset = pacingPreset === 'fast-paced' ? 'fast-paced' as const
    : pacingPreset === 'cinematic' ? 'cinematic' as const
    : pacingPreset === 'educational' ? 'educational' as const
    : 'documentary' as const;

  // --- Model Selection ---
  const models = {
    image: visualsSettings?.imageModel || 'local-z-image',
    video: visualsSettings?.videoModel || 'local-ltx2',
    image_edit: visualsSettings?.imageEditModel || 'local-qwen-edit',
  };

  const videoGrammarProfile = resolveVideoGrammarProfile(videoOverrides, scriptMeta);

  return {
    project_id: videoId,
    style: {
      visual_style: visualStyle,
      color_palette: colorPalette,
      lighting_mood: lightingMood,
      aspect_ratio: aspectRatio,
    },
    media_weighting: mediaWeighting,
    pacing_rules: pacingRules,
    quality_thresholds: SYSTEM_DEFAULTS.quality_thresholds,
    visual: {
      quality_anchors: qualityAnchors.length > 0 ? qualityAnchors : undefined,
      image_constraints: imageConstraints.length > 0 ? imageConstraints : undefined,
    },
    editing: {
      pacing_preset: editingPacingPreset,
    },
    motion_graphics: motionGraphics,
    lora,
    master_creative_prompt: masterCreativePrompt,
    video_creative_prompt: videoCreativePrompt,
    directing_intent: directingIntent,
    worker_prompt_overrides: workerPromptOverrides,
    models,
    script_context: scriptMeta ? {
      pov: scriptMeta.pov,
      genre: scriptMeta.genre,
      tone_style: scriptMeta.toneStyle,
      target_audience: scriptMeta.targetAudience,
      content_niche: scriptMeta.contentNiche,
    } : undefined,
    writing: scriptMeta ? {
      audience: {
        demographics: scriptMeta.targetAudience,
      },
      formality_level: scriptMeta.toneStyle?.toLowerCase().includes('formal')
        ? 'formal' as const
        : 'conversational' as const,
    } : undefined,
    video_grammar_profile: videoGrammarProfile,
  };
}
