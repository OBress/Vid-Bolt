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

export type AIGenerationMode = 'image-gen' | 'image-edit' | 'video-gen' | 'motion' | 'sfx' | 'audio';

export interface ImageGenState {
  prompt: string;
  modelId: string;
  aspectRatio: string;
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
  modelId: string;
  startFrameUrl: string;
  endFrameUrl: string;
  durationSeconds: number;
  aspectRatio: string;
  fps: number;
  seed: number | null;
}

export interface GenerationResult {
  type: 'image' | 'video';
  url: string;
  mimeType: string;
  prompt: string;
  modelId: string;
  timestamp: number;
}

export interface AIGenerationState {
  /** Active sub-tab */
  activeMode: AIGenerationMode;

  /** Per-mode form state — preserved when switching */
  imageGen: ImageGenState;
  imageEdit: ImageEditState;
  videoGen: VideoGenState;

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
  setGenerating: (isGenerating: boolean, progress?: string | null) => void;
  setResult: (result: GenerationResult | null) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

// ============================================================================
// DEFAULTS
// ============================================================================

const DEFAULT_IMAGE_GEN: ImageGenState = {
  prompt: '',
  modelId: 'local-z-image',
  aspectRatio: '16-9',
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
  modelId: 'local-ltx2',
  startFrameUrl: '',
  endFrameUrl: '',
  durationSeconds: 5,
  aspectRatio: '16-9',
  fps: 24,
  seed: null,
};

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

      setGenerating: (isGenerating, progress = null) =>
        set({ isGenerating, generationProgress: progress, error: null }),

      setResult: (result) =>
        set({ lastResult: result, isGenerating: false, generationProgress: null }),

      setError: (error) =>
        set({ error, isGenerating: false, generationProgress: null }),

      reset: () =>
        set({
          activeMode: 'image-gen',
          imageGen: { ...DEFAULT_IMAGE_GEN },
          imageEdit: { ...DEFAULT_IMAGE_EDIT },
          videoGen: { ...DEFAULT_VIDEO_GEN },
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
        // Don't persist transient generation state
      }),
    }
  )
);

export default useAIGenerationStore;
