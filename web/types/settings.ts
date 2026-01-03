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

export interface VisualsSettings {
  imageModel: string;
  videoModel: string;
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
}

export interface ApiKeys {
  openrouter_key: string;
  elevenlabs_key: string;
  genai_key: string;
  inworld_tts_key: string;
  replicate_key: string;
  google_cloud_credentials: string;
}
