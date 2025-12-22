export interface BasicInfoSettings {
  projectName: string;
  pictureUrl: string | null;
  contentNiche: string;
  aspectRatio: string;
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
