// ============================================================================
// SCRIPT SETTINGS
// ============================================================================

export type ScriptPOV = '1st' | '2nd' | '3rd';
export type ScriptGender = 'male' | 'female' | 'any';
export type ScriptGenre = 'documentary' | 'educational' | 'narrative_fiction' | 'historical_fiction' | 'opinion_essay' | 'tutorial' | 'news';
export type ResearchDepth = 'deep' | 'full' | 'light' | 'off';

export interface ScriptAdvancedSettings {
  /** Custom system prompts for each generation phase */
  systemPrompts?: {
    research?: string;
    spine?: string;
    expansion?: string;
    quality?: string;
  };
  /** Custom banned phrases to avoid in scripts */
  bannedPhrases?: string[];
  /** Custom word replacements (overused word -> alternatives) */
  wordReplacements?: Record<string, string[]>;
  /** Custom engagement timing settings */
  engagementTiming?: {
    patternInterruptIntervalSeconds?: number;
    hookDeadlineSeconds?: number;
    commitmentDeadlineSeconds?: number;
  };
}

export interface ScriptSettings {
  /** Point of view for narration */
  pov: ScriptPOV;
  /** Protagonist/narrator gender for appropriate pronouns */
  protagonistGender: ScriptGender;
  /** Default script genre */
  genre: ScriptGenre;
  /** Research depth setting */
  researchDepth: ResearchDepth;
  /** OpenRouter model ID to use for generation (writing) */
  openrouterModel: string;
  /** OpenRouter model ID to use for quality review/scoring */
  qualityReviewModel?: string;
  /** Content niche/category */
  contentNiche: string;
  /** Preferred tone/style description */
  toneStyle?: string;
  /** Target audience description */
  targetAudience?: string;
  /** Favorite model IDs for quick access */
  favoriteModels?: string[];
  /** Advanced settings (system prompts, etc.) */
  advanced?: ScriptAdvancedSettings;
}

// ============================================================================
// BASIC INFO SETTINGS
// ============================================================================

export interface BasicInfoSettings {
  projectName: string;
  pictureUrl: string | null;
  contentNiche: string;
  aspectRatio: string;
  videoDurationRange: number[];
  autoIdeaVerification: boolean;
  autoScriptVerification: boolean;
  autoExportToMedia: boolean;
}

export interface VoiceSettings {
  provider: 'elevenlabs' | 'genai' | 'inworld';
  model: string;
  voiceName: string;
  speakerBoost: boolean;
  stability: number;
  similarityBoost: number;
  speakingSpeed: number;
  voiceStyle: number;
}

// ============================================================================
// CREATIVE DIRECTION SETTINGS (Channel-Level Defaults)
// ============================================================================

/**
 * Configuration for a custom LoRA uploaded by the user.
 * Stored in R2 and synced to the GPU API on-demand before production.
 */
export interface LoraConfig {
  /** Display name for the LoRA */
  name: string;
  /** R2 object key (e.g., "loras/{userId}/{loraId}/model.safetensors") */
  storageKey: string;
  /** Public R2 URL for the LoRA file */
  url: string;
  /** Default weight when applying this LoRA (0.0–1.0) */
  defaultWeight: number;
  /** Activation trigger words — prepended to image prompts when this LoRA is active */
  triggerWords?: string;
  /** Preview image URL */
  previewUrl?: string;
  /** ISO timestamp when uploaded */
  uploadedAt: string;
}

/**
 * Motion graphics theme defaults for consistent MG appearance.
 * Applied to all MG compositions within a channel/video.
 */
export interface MgThemeDefaults {
  /** Theme mode */
  theme: 'dark' | 'light' | 'colorful' | 'minimal';
  /** Primary color palette for MG (hex values) */
  colorPalette: string[];
  /** Animation easing style for MG elements */
  animationStyle: 'smooth' | 'bouncy' | 'snappy' | 'gentle';
  /** Font family preference (e.g., "Inter", "Outfit") */
  fontFamily?: string;
  /** Corner radius style for cards/containers */
  borderStyle?: 'rounded' | 'sharp' | 'pill';
}

/** Pacing preset identifiers */
export type PacingPreset = 'documentary' | 'fast-paced' | 'cinematic' | 'educational';

/**
 * Channel-wide creative direction defaults.
 * Serves as the baseline that every video in this project inherits.
 * Per-video overrides can selectively replace any field.
 */
export interface CreativeDirectionDefaults {
  /** Overall visual aesthetic description (e.g., "cinematic, documentary, warm tones") */
  visualStyle: string;
  /** Color palette hex values for the channel */
  colorPalette: string[];
  /** Lighting/mood description (e.g., "warm golden hour", "cold blue noir") */
  lightingMood: string;
  /** Quality anchor keywords for image generation (e.g., "cinematic depth of field") */
  qualityAnchors: string[];
  /** Image generation constraints (e.g., "no text", "no watermark") */
  imageConstraints: string[];
  /** LoRA configurations uploaded for this channel */
  loras: LoraConfig[];
  /** Name of the default LoRA to apply (matches LoraConfig.name) */
  defaultLoraName?: string;
  /** Motion graphics theme defaults */
  mgTheme: MgThemeDefaults;
  /** Media type weighting for shot distribution */
  mediaWeighting: {
    stockFootage: number;
    aiVideo: number;
    motionGraphics: number;
    aiImageStatic: number;
  };
  /** Pacing style preset */
  pacingPreset: PacingPreset;
  /** Custom pacing rules (overrides the preset when provided) */
  customPacing?: {
    hookDurationSeconds: number;
    hookMinMotionGraphics: number;
    maxConsecutiveStaticImages: number;
    minVideoShotsPerMinute: number;
  };
  /** Channel-wide creative direction prompt — injected into all worker prompts */
  masterCreativePrompt: string;
  /** Per-worker prompt overrides (advanced). Keys match WorkerPrompts fields. */
  workerPromptOverrides?: Record<string, string>;
}

// ============================================================================
// VISUALS SETTINGS
// ============================================================================

export interface VisualsSettings {
  imageModel: string;
  videoModel: string;
  imageEditModel: string;
  /** Channel-level creative direction defaults */
  creativeDirection?: CreativeDirectionDefaults;
}

export interface ExportSettings {
  defaultTargets: string[]; // e.g., ["youtube", "tiktok"]
}

export interface EditingSettings {
  // Placeholder for future editing settings
  [key: string]: any;
}

export interface ProjectSettings {
  basic_info: BasicInfoSettings;
  voice: VoiceSettings;
  visuals: VisualsSettings;
  editing: EditingSettings;
  export: ExportSettings;
  script: ScriptSettings;
}

export interface MediaProject {
  id: string;
  user_id: string;
  name: string;
  picture_url: string | null;
  created_at: string;
  updated_at: string;
  settings?: ProjectSettings;
}

export interface UserSettings {
  language: string;
  theme: 'dark' | 'light' | 'system';
  onboarding_completed?: boolean;
  defaultProjectSettings?: Partial<ProjectSettings>;
  favorite_voices?: string[];
  /** Whether to auto-generate SVG thumbnails for new videos */
  enableThumbnailGeneration?: boolean;
}

export interface ApiKeys {
  openrouter_key: string;
  elevenlabs_key: string;
  genai_key: string;
  inworld_tts_key: string;
  replicate_key: string;
  google_cloud_credentials: string;
  groq_key: string;
  valyu_key: string;
}
