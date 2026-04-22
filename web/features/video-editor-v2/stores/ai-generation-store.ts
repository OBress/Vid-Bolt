/**
 * AI Generation Store
 * ============================================================================
 * Manages all state for AI generation within the video editor.
 * Each generation mode (image-gen, image-edit, video-gen) has independent
 * form state so switching between modes preserves all user inputs.
 *
 * Persisted to localStorage so state survives tab refreshes.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// ============================================================================
// TYPES
// ============================================================================

export type AIGenerationMode = 'image-gen' | 'image-edit' | 'video-gen' | 'motion' | 'sfx' | 'audio' | 'tts';

export interface ImageGenState {
  prompt: string;
  negativePrompt: string;
  modelId: string;
  aspectRatio: string;
  /** Resolution preset key, e.g. '1280x720'. Null = auto from aspect ratio. */
  resolutionPreset: string | null;
  loraName: string | null;
  loraStrength: number;
  seed: number | null;
  steps: number;
}

export interface ImageEditState {
  prompt: string;
  modelId: string;
  inputImageUrl: string;
  maskImageUrl: string;
  loraName: string | null;
  loraStrength: number;
  seed: number | null;
}

export interface VideoGenState {
  prompt: string;
  negativePrompt: string;
  modelId: string;
  startFrameUrl: string;
  endFrameUrl: string;
  durationSeconds: number;
  aspectRatio: string;
  /** Resolution preset key, e.g. '1280x720'. Null = auto from aspect ratio. */
  resolutionPreset: string | null;
  loraName: string | null;
  loraStrength: number;
  fps: number;
  seed: number | null;
}

export interface GenerationResult {
  /** Discriminator for which form generated this */
  mode: AIGenerationMode;
  type: 'image' | 'video' | 'audio';
  url: string;
  mimeType: string;
  prompt: string;
  modelId: string;
  timestamp: number;
  /** Normalized/processed audio URL (may differ from url for audio results) */
  normalizedAudioUrl?: string | null;
  durationSeconds?: number;
}

export interface SfxSearchState {
  /** Freesound search query (e.g. "whoosh", "door slam") */
  query: string;
  /** Max duration filter in seconds */
  maxDuration: number;
  /** Sort order for results */
  sort: 'score' | 'downloads_desc' | 'rating_desc';
}

export interface AudioGenState {
  /** Comma-separated ACE-Step caption tags: genre, instruments, mood, tempo */
  prompt: string;
  /** Optional lyrics for vocal generation. Leave empty for instrumental background music. */
  lyrics: string;
  /** Duration in seconds */
  durationSeconds: number;
  /** Seed for reproducibility (null = random) */
  seed: number | null;
  /** Beats per minute (40-200) */
  bpm: number;
  /** Musical key/scale (e.g. 'C Major', 'Am', 'D Minor') */
  keyScale: string;
  /** Whether to inject the channel masterCreativePrompt as a prompt suffix */
  injectChannelStyle: boolean;
}

export interface TtsFormState {
  /** Text to convert to speech */
  text: string;
  /** TTS provider: 'inworld', 'elevenlabs', 'genai' */
  provider: 'inworld' | 'elevenlabs' | 'genai';
  /** Voice ID for the selected provider */
  voiceId: string;
  /** Model ID */
  modelId: string;
  /** Speaking rate multiplier (0.5 - 2.0) */
  speakingRate: number;
  /** Temperature (0.1 - 2.0) */
  temperature: number;
}

/** Ring-buffer history: max 10 entries per mode, newest first */
export type GenerationHistory = GenerationResult[];

export interface AIGenerationState {
  /** Active sub-tab */
  activeMode: AIGenerationMode;

  /** Per-mode form state — preserved when switching */
  imageGen: ImageGenState;
  imageEdit: ImageEditState;
  videoGen: VideoGenState;
  sfxSearch: SfxSearchState;
  audioGen: AudioGenState;
  ttsForm: TtsFormState;

  /**
   * Auto-enhance: when true, prompts are automatically enhanced via
   * /api/video-editor/enhance-prompt before each generation.
   */
  autoEnhance: boolean;

  /** Per-mode generation history (ring buffer, max 10 per mode) */
  history: Record<AIGenerationMode, GenerationHistory>;

  /**
   * Whether channel defaults have been seeded this session.
   * Reset to false on store reset.
   */
  channelDefaultsSeeded: boolean;

  /** Generation lifecycle */
  isGenerating: boolean;
  generationProgress: string | null;
  lastResult: GenerationResult | null;
  error: string | null;

  /** Actions */
  setActiveMode: (mode: AIGenerationMode) => void;
  updateImageGen: (partial: Partial<ImageGenState>) => void;
  updateImageEdit: (partial: Partial<ImageEditState>) => void;
  updateVideoGen: (partial: Partial<VideoGenState>) => void;
  updateSfxSearch: (partial: Partial<SfxSearchState>) => void;
  updateAudioGen: (partial: Partial<AudioGenState>) => void;
  updateTtsForm: (partial: Partial<TtsFormState>) => void;
  setAutoEnhance: (enabled: boolean) => void;
  setGenerating: (isGenerating: boolean, progress?: string | null) => void;
  setResult: (result: GenerationResult | null) => void;
  setError: (error: string | null) => void;
  markChannelDefaultsSeeded: () => void;
  /** Push a result to the mode's history ring-buffer (max 10) */
  pushToHistory: (result: GenerationResult) => void;
  /** Clear history for a specific mode */
  clearHistory: (mode: AIGenerationMode) => void;
  reset: () => void;
}

// ============================================================================
// DEFAULTS
// ============================================================================

const DEFAULT_IMAGE_GEN: ImageGenState = {
  prompt: '',
  negativePrompt: '',
  modelId: 'local-z-image',
  aspectRatio: '16-9',
  resolutionPreset: null,
  loraName: null,
  loraStrength: 0.8,
  seed: null,
  steps: 4,
};

const DEFAULT_IMAGE_EDIT: ImageEditState = {
  prompt: '',
  modelId: 'local-qwen-edit',
  inputImageUrl: '',
  maskImageUrl: '',
  loraName: null,
  loraStrength: 0.8,
  seed: null,
};

const DEFAULT_VIDEO_GEN: VideoGenState = {
  prompt: '',
  negativePrompt: '',
  modelId: 'local-ltx2',
  startFrameUrl: '',
  endFrameUrl: '',
  durationSeconds: 5,
  aspectRatio: '16-9',
  resolutionPreset: null,
  loraName: null,
  loraStrength: 0.8,
  fps: 24,
  seed: null,
};

const DEFAULT_SFX_SEARCH: SfxSearchState = {
  query: '',
  maxDuration: 30,
  sort: 'score',
};

const DEFAULT_AUDIO_GEN: AudioGenState = {
  prompt: '',
  lyrics: '',
  durationSeconds: 60,
  seed: null,
  bpm: 85,
  keyScale: 'C Minor',
  injectChannelStyle: true,
};

const DEFAULT_TTS_FORM: TtsFormState = {
  text: '',
  provider: 'inworld',
  voiceId: 'Hades',
  modelId: 'inworld-tts-1.5-max',
  speakingRate: 1.0,
  temperature: 1.0,
};

const EMPTY_HISTORY: Record<AIGenerationMode, GenerationHistory> = {
  'image-gen': [],
  'image-edit': [],
  'video-gen': [],
  'motion': [],
  'sfx': [],
  'audio': [],
  'tts': [],
};

const HISTORY_MAX = 10;

// ============================================================================
// STORE
// ============================================================================

export const useAIGenerationStore = create<AIGenerationState>()(
  persist(
    (set) => ({
      activeMode: 'image-gen',
      imageGen: { ...DEFAULT_IMAGE_GEN },
      imageEdit: { ...DEFAULT_IMAGE_EDIT },
      videoGen: { ...DEFAULT_VIDEO_GEN },
      sfxSearch: { ...DEFAULT_SFX_SEARCH },
      audioGen: { ...DEFAULT_AUDIO_GEN },
      ttsForm: { ...DEFAULT_TTS_FORM },
      autoEnhance: false,
      history: { ...EMPTY_HISTORY },
      channelDefaultsSeeded: false,

      isGenerating: false,
      generationProgress: null,
      lastResult: null,
      error: null,

      setActiveMode: (mode) => set({ activeMode: mode }),

      updateImageGen: (partial) =>
        set((state) => ({ imageGen: { ...state.imageGen, ...partial } })),

      updateImageEdit: (partial) =>
        set((state) => ({ imageEdit: { ...state.imageEdit, ...partial } })),

      updateVideoGen: (partial) =>
        set((state) => ({ videoGen: { ...state.videoGen, ...partial } })),

      updateSfxSearch: (partial) =>
        set((state) => ({ sfxSearch: { ...state.sfxSearch, ...partial } })),

      updateAudioGen: (partial) =>
        set((state) => ({ audioGen: { ...state.audioGen, ...partial } })),

      updateTtsForm: (partial) =>
        set((state) => ({ ttsForm: { ...state.ttsForm, ...partial } })),

      setAutoEnhance: (enabled) => set({ autoEnhance: enabled }),

      setGenerating: (isGenerating, progress = null) =>
        set({ isGenerating, generationProgress: progress, error: null }),

      setResult: (result) =>
        set({ lastResult: result, isGenerating: false, generationProgress: null }),

      setError: (error) =>
        set({ error, isGenerating: false, generationProgress: null }),

      markChannelDefaultsSeeded: () => set({ channelDefaultsSeeded: true }),

      pushToHistory: (result) =>
        set((state) => {
          const prev = state.history[result.mode] ?? [];
          const next = [result, ...prev].slice(0, HISTORY_MAX);
          return { history: { ...state.history, [result.mode]: next } };
        }),

      clearHistory: (mode) =>
        set((state) => ({
          history: { ...state.history, [mode]: [] },
        })),

      reset: () =>
        set({
          activeMode: 'image-gen',
          imageGen: { ...DEFAULT_IMAGE_GEN },
          imageEdit: { ...DEFAULT_IMAGE_EDIT },
          videoGen: { ...DEFAULT_VIDEO_GEN },
          sfxSearch: { ...DEFAULT_SFX_SEARCH },
          audioGen: { ...DEFAULT_AUDIO_GEN },
          ttsForm: { ...DEFAULT_TTS_FORM },
          autoEnhance: false,
          history: { ...EMPTY_HISTORY },
          channelDefaultsSeeded: false,
          isGenerating: false,
          generationProgress: null,
          lastResult: null,
          error: null,
        }),
    }),
    {
      name: 'video-editor-ai-generation',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        activeMode: state.activeMode,
        imageGen: state.imageGen,
        imageEdit: state.imageEdit,
        videoGen: state.videoGen,
        sfxSearch: state.sfxSearch,
        audioGen: state.audioGen,
        ttsForm: state.ttsForm,
        autoEnhance: state.autoEnhance,
        history: state.history,
        // Don't persist transient generation state or the seed flag
        // (channelDefaultsSeeded resets each session so channel defaults
        //  are always freshly applied from the latest project settings)
      }),
    }
  )
);

export default useAIGenerationStore;
