/**
 * AI Settings Store
 * 
 * Manages AI-related settings for motion graphics:
 * - Selected AI model (uses user's OpenRouter API key from user settings)
 * - Model preferences
 * 
 * Note: API key is stored in user settings (openrouter_key), not here.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// ==========================================
// TYPES
// ==========================================

interface AISettingsState {
  // Selected model for motion graphics generation
  selectedModelId: string;
  
  // Feature flags
  enableStreaming: boolean;
  
  // Actions
  setSelectedModelId: (modelId: string) => void;
  setEnableStreaming: (enable: boolean) => void;
}

// ==========================================
// STORE
// ==========================================

export const useAISettingsStore = create<AISettingsState>()(
  persist(
    (set) => ({
      // Initial state - default to Gemini 3 Flash (fast + high quality code gen)
      selectedModelId: 'google/gemini-3-flash-preview',
      enableStreaming: true,

      // Actions
      setSelectedModelId: (modelId) => {
        set({ selectedModelId: modelId });
      },

      setEnableStreaming: (enable) => {
        set({ enableStreaming: enable });
      },
    }),
    {
      name: 'video-editor-ai-settings',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        selectedModelId: state.selectedModelId,
        enableStreaming: state.enableStreaming,
      }),
    }
  )
);

export default useAISettingsStore;
