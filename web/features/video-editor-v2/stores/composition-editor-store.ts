/**
 * ============================================================
 * COMPOSITION EDITOR STORE
 * ============================================================
 * 
 * State management for the After Effects-style composition editor.
 * Manages composition layers, selection, playback, AI chat, and undo/redo.
 * 
 * NEW ARCHITECTURE (Single Source of Truth):
 * - CompositionDefinition is the single source of truth
 * - remotionCode is NO LONGER stored (removed from state)
 * - Use serializeToRemotionCode(composition) to generate code for export
 * 
 * This store is separate from the main video editor store to keep
 * composition editing state isolated and easy to manage.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { produce } from 'immer';
import type {
  CompositionDefinition,
  CompositionLayer,
  CompositionEditorState,
  CompositionSelectionState,
  CompositionPlaybackState,
  CompositionTimelineState,
  CompositionChatMessage,
  LayerTransform,
  LayerTypeProperties,
  CompositionLayerType,
} from '../types/composition';
import {
  DEFAULT_COMPOSITION_EDITOR_STATE,
  DEFAULT_LAYER_TRANSFORM,
  generateLayerId,
  generateCompositionId,
  getLayerTypeColor,
} from '../types/composition';
import type { PropertyKeyframes, Keyframe } from '../types/keyframes';
import { generateKeyframeId, DEFAULT_INTERPOLATION } from '../types/keyframes';
import { 
  type AnimationPreset, 
  type PresetOptions,
  applyPresetToLayer,
} from '../utils/animation-presets';
import { serializeToRemotionCode } from '../utils/composition-serializer';
import { parseTaggedJSX, hasLayerTags } from '../utils/jsx-layer-parser';
import { regenerateJSXFromLayers } from '../utils/jsx-layer-regenerator';

// ============================================================
// UNDO/REDO CONFIGURATION
// ============================================================

const MAX_HISTORY_SIZE = 50; // Maximum number of states to keep in history

// Batching configuration for continuous operations
const HISTORY_BATCH_DELAY = 300; // milliseconds to wait before saving to history
let historyBatchTimeout: NodeJS.Timeout | null = null;
let pendingHistorySave = false;

// ============================================================
// STORE ACTIONS
// ============================================================

export interface CompositionEditorActions {
  // === COMPOSITION EDITOR LIFECYCLE ===
  /**
   * Open the composition editor for a motion graphics clip
   * 
   * NEW ARCHITECTURE: CompositionDefinition is the single source of truth.
   * remotionCode is no longer passed - it's generated on demand for export.
   * 
   * @param sourceClipId - The ID of the clip in the main timeline
   * @param composition - The composition definition with layers (single source of truth)
   */
  openCompositionEditor: (sourceClipId: string, composition: CompositionDefinition) => void;
  
  /**
   * Close the composition editor
   */
  closeCompositionEditor: () => void;
  
  /**
   * Reset the composition editor state
   */
  resetCompositionEditor: () => void;
  
  // === COMPOSITION ACTIONS ===
  /**
   * Update composition settings
   */
  updateComposition: (updates: Partial<CompositionDefinition>) => void;
  
  /**
   * Set the entire composition
   */
  setComposition: (composition: CompositionDefinition) => void;
  
  // === LAYER ACTIONS ===
  /**
   * Add a new layer to the composition
   */
  addLayer: (layer: Omit<CompositionLayer, 'id'>) => string;
  
  /**
   * Delete a layer
   */
  deleteLayer: (layerId: string) => void;
  
  /**
   * Delete multiple layers
   */
  deleteLayers: (layerIds: string[]) => void;
  
  /**
   * Update a layer
   * Automatically regenerates JSX if the composition has tagged layers
   */
  updateLayer: (layerId: string, updates: Partial<CompositionLayer>) => void;
  
  /**
   * Update layer transform
   */
  updateLayerTransform: (layerId: string, transform: Partial<LayerTransform>) => void;
  
  /**
   * Update layer type-specific properties
   */
  updateLayerProperties: (layerId: string, properties: Partial<LayerTypeProperties>) => void;
  
  /**
   * Move layer in the stack (reorder z-index)
   */
  moveLayer: (layerId: string, newIndex: number) => void;
  
  /**
   * Duplicate a layer
   */
  duplicateLayer: (layerId: string) => string | null;
  
  /**
   * Toggle layer visibility
   */
  toggleLayerVisibility: (layerId: string) => void;
  
  /**
   * Toggle layer lock
   */
  toggleLayerLock: (layerId: string) => void;
  
  /**
   * Toggle layer solo
   */
  toggleLayerSolo: (layerId: string) => void;
  
  // === SELECTION ACTIONS ===
  /**
   * Select layers
   */
  selectLayers: (layerIds: string[], addToSelection?: boolean) => void;
  
  /**
   * Clear layer selection
   */
  clearLayerSelection: () => void;
  
  /**
   * Select keyframes
   */
  selectKeyframes: (keyframeIds: string[], addToSelection?: boolean) => void;
  
  /**
   * Clear keyframe selection
   */
  clearKeyframeSelection: () => void;
  
  /**
   * Set active property path for editing
   */
  setActivePropertyPath: (propertyPath: string | undefined) => void;
  
  // === PLAYBACK ACTIONS ===
  /**
   * Set current frame
   */
  setCurrentFrame: (frame: number) => void;
  
  /**
   * Toggle playback
   */
  togglePlayback: () => void;
  
  /**
   * Set playing state
   */
  setIsPlaying: (isPlaying: boolean) => void;
  
  /**
   * Set playback rate
   */
  setPlaybackRate: (rate: number) => void;
  
  /**
   * Toggle loop
   */
  toggleLoop: () => void;
  
  /**
   * Set work area
   */
  setWorkArea: (start: number | undefined, end: number | undefined) => void;
  
  // === TIMELINE UI ACTIONS ===
  /**
   * Set zoom level
   */
  setZoom: (zoom: number) => void;
  
  /**
   * Set scroll position
   */
  setScrollPosition: (position: number) => void;
  
  /**
   * Set track height
   */
  setTrackHeight: (height: number) => void;
  
  /**
   * Toggle layer collapse
   */
  toggleLayerCollapse: (layerId: string) => void;
  
  // === KEYFRAME ACTIONS ===
  /**
   * Add keyframe to a layer property
   */
  addKeyframe: (layerId: string, propertyPath: string, frame: number, value: any) => string;
  
  /**
   * Update a keyframe
   */
  updateKeyframe: (layerId: string, propertyPath: string, keyframeId: string, updates: Partial<Keyframe>) => void;
  
  /**
   * Delete a keyframe
   */
  deleteKeyframe: (layerId: string, propertyPath: string, keyframeId: string) => void;
  
  /**
   * Enable/disable keyframing for a property
   */
  togglePropertyKeyframing: (layerId: string, propertyPath: string, enabled: boolean) => void;
  
  // === CHAT ACTIONS ===
  /**
   * Add a chat message
   */
  addChatMessage: (message: Omit<CompositionChatMessage, 'id' | 'timestamp'>) => string;
  
  /**
   * Update a chat message (for streaming)
   */
  updateChatMessage: (messageId: string, updates: Partial<CompositionChatMessage>) => void;
  
  /**
   * Clear chat history
   */
  clearChatHistory: () => void;
  
  // === DIRTY STATE ===
  /**
   * Mark as dirty (unsaved changes)
   */
  setDirty: (isDirty: boolean) => void;
  
  // === UNDO/REDO ACTIONS ===
  /**
   * Undo the last action
   */
  undo: () => void;
  
  /**
   * Redo the last undone action
   */
  redo: () => void;
  
  /**
   * Check if undo is available
   */
  canUndo: () => boolean;
  
  /**
   * Check if redo is available
   */
  canRedo: () => boolean;
  
  /**
   * Clear history (e.g., after saving)
   */
  clearHistory: () => void;
  
  // === CLIPBOARD ACTIONS ===
  /**
   * Copy selected layers to clipboard
   */
  copyLayers: () => void;
  
  /**
   * Cut selected layers (copy + delete)
   */
  cutLayers: () => void;
  
  /**
   * Paste layers from clipboard
   */
  pasteLayers: () => void;
  
  /**
   * Check if there are layers in clipboard
   */
  hasClipboard: () => boolean;
  
  // === ANIMATION PRESET ACTIONS ===
  /**
   * Apply an animation preset to a layer
   */
  applyAnimationPreset: (
    layerId: string,
    preset: AnimationPreset,
    options?: Partial<PresetOptions>,
    mergeMode?: 'replace' | 'merge' | 'append'
  ) => void;
  
  // === EXPORT ACTIONS ===
  /**
   * Generate remotionCode from the current composition for export
   * 
   * NEW ARCHITECTURE: This generates code on demand from the composition
   * (single source of truth). Use this when you need remotionCode for:
   * - Video export/rendering
   * - Saving the template for playback in non-CompositionRenderer contexts
   */
  getRemotionCodeForExport: () => string | null;
  
  // === JSX/LAYER HYBRID ACTIONS ===
  /**
   * Load composition from JSX code
   * Parses JSX into layers using the hybrid parser
   * @param jsxCode - The JSX code to load
   * @param usedIcons - Optional list of icon names used in the code (for compiler injection)
   * @param durationInFrames - Optional duration for the composition (from AI vision)
   */
  loadFromJSX: (jsxCode: string, usedIcons?: string[], durationInFrames?: number) => void;
  
  /**
   * Regenerate JSX code from current layers
   * Updates the originalRemotionCode field
   */
  regenerateJSX: () => string | null;
  
  /**
   * Set the rendering mode (JSX direct or layer-based)
   */
  setRenderMode: (mode: 'jsx' | 'layers') => void;
  
  /**
   * Get current render mode
   */
  getRenderMode: () => 'jsx' | 'layers';
}

// ============================================================
// STORE IMPLEMENTATION
// ============================================================

// ============================================================
// EXTENDED STATE FOR UNDO/REDO AND CLIPBOARD
// ============================================================

interface HistoryState {
  /** History stack of composition states */
  history: CompositionDefinition[];
  /** Current position in history (-1 means at latest) */
  historyIndex: number;
}

interface ClipboardState {
  /** Copied layers */
  clipboard: CompositionLayer[];
}

// ============================================================
// RENDER MODE STATE
// ============================================================

interface RenderModeState {
  /** 
   * Rendering mode for composition preview
   * - 'jsx': Render original JSX code directly (highest fidelity)
   * - 'layers': Render from CompositionDefinition layers (editable)
   */
  renderMode: 'jsx' | 'layers';
}

// ============================================================
// AI GENERATION STATE
// ============================================================

interface AIGenerationState {
  /** AI-generated JSX code (used for direct JSX rendering) */
  generatedCode: string | null;
  
  /** Whether AI generation is in progress */
  isGenerating: boolean;
  
  /** Current generation error if any */
  generationError: string | null;
  
  /** Skills detected for the current generation */
  detectedSkills: string[];
  
  /** Conversation history for follow-up edits */
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
}

interface AIGenerationActions {
  /** Set the generated code */
  setGeneratedCode: (code: string | null) => void;
  
  /** Set generation in progress state */
  setIsGenerating: (isGenerating: boolean) => void;
  
  /** Set generation error */
  setGenerationError: (error: string | null) => void;
  
  /** Set detected skills */
  setDetectedSkills: (skills: string[]) => void;
  
  /** Add a message to conversation history */
  addConversationMessage: (role: 'user' | 'assistant', content: string) => void;
  
  /** Clear conversation history */
  clearConversationHistory: () => void;
  
  /** Reset all AI generation state */
  resetAIGenerationState: () => void;
}

// ============================================================
// AFTER EFFECTS TIMELINE STATE
// ============================================================

interface TimelineExpansionState {
  /** 
   * Maps layer ID to expanded property group paths
   * e.g., { "layer-123": ["transform", "transform.position"] }
   */
  expandedLayers: Record<string, string[]>;
  
  /** Whether the graph editor is visible */
  graphEditorVisible: boolean;
  
  /** Selected property path for graph editor */
  graphEditorSelectedProperty: string | null;
  
  /** Show only keyframed properties (U key) */
  showOnlyKeyframedProperties: boolean;
}

interface TimelineExpansionActions {
  /** Toggle layer expansion (show/hide property groups) */
  toggleLayerExpansion: (layerId: string) => void;
  
  /** Expand a specific property group in a layer */
  expandPropertyGroup: (layerId: string, propertyPath: string) => void;
  
  /** Collapse a specific property group in a layer */
  collapsePropertyGroup: (layerId: string, propertyPath: string) => void;
  
  /** Check if a layer is expanded */
  isLayerExpanded: (layerId: string) => boolean;
  
  /** Check if a property group is expanded */
  isPropertyGroupExpanded: (layerId: string, propertyPath: string) => boolean;
  
  /** Toggle graph editor visibility */
  toggleGraphEditor: () => void;
  
  /** Set graph editor selected property */
  setGraphEditorProperty: (propertyPath: string | null) => void;
  
  /** Toggle show only keyframed properties */
  toggleShowOnlyKeyframed: () => void;
  
  /** Reveal specific property (e.g., for keyboard shortcuts P, R, S, T, A) */
  revealProperty: (layerId: string, propertyPath: string) => void;
  
  /** Reveal all keyframed properties for a layer */
  revealKeyframedProperties: (layerId: string) => void;
}

export type CompositionEditorStore = CompositionEditorState & CompositionEditorActions & HistoryState & ClipboardState & TimelineExpansionState & TimelineExpansionActions & RenderModeState & AIGenerationState & AIGenerationActions;

/**
 * Helper to deep clone a composition for history using Immer (structural sharing)
 * This is much faster than JSON.parse(JSON.stringify()) and preserves non-serializable data
 */
const cloneComposition = (composition: CompositionDefinition): CompositionDefinition => {
  return produce(composition, (draft) => {
    // Immer will create a structural clone with sharing
  });
};

export const useCompositionEditorStore = create<CompositionEditorStore>()(
  subscribeWithSelector((set, get) => {
    /**
     * Save current state to history before making changes
     * @param continuous - If true, debounces the save for continuous operations (e.g., dragging)
     */
    const saveToHistory = (continuous = false) => {
      const { composition, history, historyIndex } = get();
      if (!composition) return;
      
      const performSave = () => {
        const state = get();
        if (!state.composition) return;
        
        // Create a clone of the current composition
        const cloned = cloneComposition(state.composition);
        
        // If we're not at the end of history (user has undone some actions),
        // truncate the history to the current position
        let newHistory = state.historyIndex >= 0 && state.historyIndex < state.history.length - 1
          ? state.history.slice(0, state.historyIndex + 1)
          : [...state.history];
        
        // Add the current state to history
        newHistory.push(cloned);
        
        // Limit history size
        if (newHistory.length > MAX_HISTORY_SIZE) {
          newHistory = newHistory.slice(newHistory.length - MAX_HISTORY_SIZE);
        }
        
        set({
          history: newHistory,
          historyIndex: newHistory.length - 1,
        });
        
        pendingHistorySave = false;
      };
      
      // For continuous operations, debounce the save
      if (continuous) {
        if (historyBatchTimeout) {
          clearTimeout(historyBatchTimeout);
        }
        
        pendingHistorySave = true;
        historyBatchTimeout = setTimeout(performSave, HISTORY_BATCH_DELAY);
      } else {
        // For discrete operations, save immediately
        // But first, if there's a pending save, execute it first
        if (historyBatchTimeout) {
          clearTimeout(historyBatchTimeout);
          historyBatchTimeout = null;
        }
        
        performSave();
      }
    };
    
    return {
      // === INITIAL STATE ===
      ...DEFAULT_COMPOSITION_EDITOR_STATE,
      history: [],
      historyIndex: -1,
      clipboard: [],
      // After Effects timeline expansion state
      expandedLayers: {},
      graphEditorVisible: false,
      graphEditorSelectedProperty: null,
      showOnlyKeyframedProperties: false,
      // Render mode (jsx for high fidelity, layers for editing)
      renderMode: 'jsx' as const,
      
      // AI Generation state
      generatedCode: null,
      isGenerating: false,
      generationError: null,
      detectedSkills: [],
      conversationHistory: [],
      
      // === COMPOSITION EDITOR LIFECYCLE ===
      openCompositionEditor: (sourceClipId, composition) => {
        // Debug: Log what we're opening with
        // NOTE: remotionCode is no longer stored - CompositionDefinition is the single source of truth
        console.log('[CompositionEditorStore] Opening composition editor:', {
          sourceClipId,
          compositionId: composition?.id,
          compositionName: composition?.name,
          width: composition?.width,
          height: composition?.height,
          duration: composition?.duration,
          fps: composition?.fps,
          layerCount: composition?.layers?.length || 0,
          layers: composition?.layers?.map(l => ({
            id: l.id,
            name: l.name,
            type: l.type,
            startTime: l.startTime,
            duration: l.duration,
            visible: l.visible,
          })),
        });
        
        // Save initial state to history
        const initialHistory = [cloneComposition(composition)];
        
        // Auto-select render mode based on layers
        // If we have parsed layers, start in layers mode for editing
        // Otherwise, use JSX mode for direct code viewing
        const hasEditableLayers = composition.layers && composition.layers.length > 0;
        const initialRenderMode = hasEditableLayers ? 'layers' : 
                                   composition.originalRemotionCode ? 'jsx' : 'layers';
        
        set({
          isOpen: true,
          sourceClipId,
          composition,
          selection: {
            layerIds: [],
            keyframeIds: [],
          },
          playback: {
            currentFrame: 0,
            isPlaying: false,
            playbackRate: 1,
            loop: true,
          },
          isDirty: false,
          chatMessages: [],
          history: initialHistory,
          historyIndex: 0,
          renderMode: initialRenderMode,
        });
        
        // If composition has JSX code, parse it to extract layers
        if (composition.originalRemotionCode) {
          const jsxCode = composition.originalRemotionCode;
          console.log('[CompositionEditorStore] Found JSX code, length:', jsxCode.length);
          console.log('[CompositionEditorStore] JSX preview:', jsxCode.substring(0, 200));
          
          if (hasLayerTags(jsxCode)) {
            console.log('[CompositionEditorStore] JSX has layer tags, parsing...');
            const parsedLayers = parseTaggedJSX(jsxCode, composition.fps);
            
            if (parsedLayers.length > 0) {
              // Update composition with parsed layers
              set(produce((state: CompositionEditorStore) => {
                if (state.composition) {
                  state.composition.layers = parsedLayers;
                }
              }));
              
              // Auto-expand layers that have keyframes
              const newExpandedLayers: Record<string, string[]> = {};
              for (const layer of parsedLayers) {
                if (layer.keyframes && layer.keyframes.length > 0) {
                  // Expand transform group for layers with keyframes
                  newExpandedLayers[layer.id] = ['transform'];
                  console.log('[CompositionEditorStore] Auto-expanding layer with keyframes:', layer.id);
                }
              }
              
              if (Object.keys(newExpandedLayers).length > 0) {
                set({ expandedLayers: newExpandedLayers });
              }
              
              console.log('[CompositionEditorStore] ✅ Successfully parsed', parsedLayers.length, 'layers from JSX');
            } else {
              console.warn('[CompositionEditorStore] ⚠️ No layers extracted from tagged JSX');
            }
          } else {
            console.log('[CompositionEditorStore] JSX does not have layer tags (old format)');
          }
        } else {
          console.log('[CompositionEditorStore] No JSX code found in composition');
        }
      },
    
    closeCompositionEditor: () => {
      set({
        isOpen: false,
        sourceClipId: null,
        composition: null,
        isDirty: false,
      });
    },
    
    resetCompositionEditor: () => {
      set(DEFAULT_COMPOSITION_EDITOR_STATE);
    },
    
    // === COMPOSITION ACTIONS ===
    updateComposition: (updates) => {
      const { composition } = get();
      if (!composition) return;
      
      saveToHistory();
      
      set({
        composition: {
          ...composition,
          ...updates,
          updatedAt: new Date().toISOString(),
        },
        isDirty: true,
      });
    },
    
    setComposition: (composition) => {
      saveToHistory();
      
      set({
        composition,
        isDirty: true,
      });
    },
    
    // === LAYER ACTIONS ===
    addLayer: (layerData) => {
      const { composition } = get();
      if (!composition) return '';
      
      saveToHistory();
      
      const id = generateLayerId();
      const newLayer: CompositionLayer = {
        ...layerData,
        id,
        color: layerData.color || getLayerTypeColor(layerData.type),
      };
      
      // Add to beginning of layers array (top of stack)
      set({
        composition: {
          ...composition,
          layers: [newLayer, ...composition.layers],
          updatedAt: new Date().toISOString(),
        },
        isDirty: true,
      });
      
      return id;
    },
    
    deleteLayer: (layerId) => {
      const { composition, selection } = get();
      if (!composition) return;
      
      saveToHistory();
      
      set({
        composition: {
          ...composition,
          layers: composition.layers.filter(l => l.id !== layerId),
          updatedAt: new Date().toISOString(),
        },
        selection: {
          ...selection,
          layerIds: selection.layerIds.filter(id => id !== layerId),
        },
        isDirty: true,
      });
    },
    
    deleteLayers: (layerIds) => {
      const { composition, selection } = get();
      if (!composition) return;
      
      saveToHistory();
      
      const idsSet = new Set(layerIds);
      set({
        composition: {
          ...composition,
          layers: composition.layers.filter(l => !idsSet.has(l.id)),
          updatedAt: new Date().toISOString(),
        },
        selection: {
          ...selection,
          layerIds: selection.layerIds.filter(id => !idsSet.has(id)),
        },
        isDirty: true,
      });
    },
    
    updateLayer: (layerId, updates) => {
      const { composition } = get();
      if (!composition) return;
      
      saveToHistory();
      
      set({
        composition: produce(composition, (draft) => {
          const layer = draft.layers.find(l => l.id === layerId);
          if (layer) {
            Object.assign(layer, updates);
          }
          draft.updatedAt = new Date().toISOString();
        }),
        isDirty: true,
      });
      
      // Auto-regenerate JSX if composition has tagged layers
      // This keeps JSX in sync with layer edits
      const updatedComposition = get().composition;
      const originalCode = updatedComposition?.originalRemotionCode;
      if (originalCode && hasLayerTags(originalCode)) {
        setTimeout(() => {
          const newCode = get().regenerateJSX();
          if (newCode) {
            console.log('[CompositionEditor] JSX regenerated after layer update');
          }
        }, 0);
      }
    },
    
    updateLayerTransform: (layerId, transform) => {
      const { composition } = get();
      if (!composition) return;
      
      // Use continuous batching for transform updates (frequent during dragging)
      saveToHistory(true);
      
      set({
        composition: produce(composition, (draft) => {
          const layer = draft.layers.find(l => l.id === layerId);
          if (layer) {
            layer.transform = { ...layer.transform, ...transform };
          }
          draft.updatedAt = new Date().toISOString();
        }),
        isDirty: true,
      });
      
      // Auto-regenerate JSX if composition has tagged layers
      // Debounced for performance during dragging
      const updatedComposition = get().composition;
      const originalCode = updatedComposition?.originalRemotionCode;
      if (originalCode && hasLayerTags(originalCode)) {
        setTimeout(() => {
          const newCode = get().regenerateJSX();
          if (newCode) {
            console.log('[CompositionEditor] JSX regenerated after transform update');
          }
        }, 100); // Slight debounce for dragging
      }
    },
    
    updateLayerProperties: (layerId, properties) => {
      const { composition } = get();
      if (!composition) return;
      
      saveToHistory();
      
      set({
        composition: produce(composition, (draft) => {
          const layer = draft.layers.find(l => l.id === layerId);
          if (layer && layer.layerProperties) {
            Object.assign(layer.layerProperties.properties, properties);
          }
          draft.updatedAt = new Date().toISOString();
        }),
        isDirty: true,
      });
      
      // Auto-regenerate JSX if composition has tagged layers
      const updatedComposition = get().composition;
      const originalCode = updatedComposition?.originalRemotionCode;
      if (originalCode && hasLayerTags(originalCode)) {
        setTimeout(() => {
          const newCode = get().regenerateJSX();
          if (newCode) {
            console.log('[CompositionEditor] JSX regenerated after property update');
          }
        }, 0);
      }
    },
    
    moveLayer: (layerId, newIndex) => {
      const { composition } = get();
      if (!composition) return;
      
      saveToHistory();
      
      const layers = [...composition.layers];
      const currentIndex = layers.findIndex(l => l.id === layerId);
      if (currentIndex === -1) return;
      
      // Remove from current position
      const [layer] = layers.splice(currentIndex, 1);
      // Insert at new position
      layers.splice(newIndex, 0, layer);
      
      set({
        composition: {
          ...composition,
          layers,
          updatedAt: new Date().toISOString(),
        },
        isDirty: true,
      });
    },
    
    duplicateLayer: (layerId) => {
      const { composition } = get();
      if (!composition) return null;
      
      saveToHistory();
      
      const sourceLayer = composition.layers.find(l => l.id === layerId);
      if (!sourceLayer) return null;
      
      const newId = generateLayerId();
      const newLayer: CompositionLayer = {
        ...sourceLayer,
        id: newId,
        name: `${sourceLayer.name} Copy`,
        // Deep copy keyframes
        keyframes: sourceLayer.keyframes?.map(pk => ({
          ...pk,
          keyframes: pk.keyframes.map(k => ({
            ...k,
            id: generateKeyframeId(),
          })),
        })),
      };
      
      // Insert after the source layer
      const sourceIndex = composition.layers.findIndex(l => l.id === layerId);
      const layers = [...composition.layers];
      layers.splice(sourceIndex + 1, 0, newLayer);
      
      set({
        composition: {
          ...composition,
          layers,
          updatedAt: new Date().toISOString(),
        },
        isDirty: true,
      });
      
      return newId;
    },
    
    toggleLayerVisibility: (layerId) => {
      const { composition } = get();
      if (!composition) return;
      
      set({
        composition: {
          ...composition,
          layers: composition.layers.map(layer =>
            layer.id === layerId
              ? { ...layer, visible: !layer.visible }
              : layer
          ),
          updatedAt: new Date().toISOString(),
        },
        isDirty: true,
      });
    },
    
    toggleLayerLock: (layerId) => {
      const { composition } = get();
      if (!composition) return;
      
      set({
        composition: {
          ...composition,
          layers: composition.layers.map(layer =>
            layer.id === layerId
              ? { ...layer, locked: !layer.locked }
              : layer
          ),
          updatedAt: new Date().toISOString(),
        },
        isDirty: true,
      });
    },
    
    toggleLayerSolo: (layerId) => {
      const { composition } = get();
      if (!composition) return;
      
      set({
        composition: {
          ...composition,
          layers: composition.layers.map(layer =>
            layer.id === layerId
              ? { ...layer, solo: !layer.solo }
              : layer
          ),
          updatedAt: new Date().toISOString(),
        },
        isDirty: true,
      });
    },
    
    // === SELECTION ACTIONS ===
    selectLayers: (layerIds, addToSelection = false) => {
      const { selection } = get();
      
      set({
        selection: {
          ...selection,
          layerIds: addToSelection
            ? [...new Set([...selection.layerIds, ...layerIds])]
            : layerIds,
        },
      });
    },
    
    clearLayerSelection: () => {
      const { selection } = get();
      set({
        selection: {
          ...selection,
          layerIds: [],
        },
      });
    },
    
    selectKeyframes: (keyframeIds, addToSelection = false) => {
      const { selection } = get();
      
      set({
        selection: {
          ...selection,
          keyframeIds: addToSelection
            ? [...new Set([...selection.keyframeIds, ...keyframeIds])]
            : keyframeIds,
        },
      });
    },
    
    clearKeyframeSelection: () => {
      const { selection } = get();
      set({
        selection: {
          ...selection,
          keyframeIds: [],
        },
      });
    },
    
    setActivePropertyPath: (propertyPath) => {
      const { selection } = get();
      set({
        selection: {
          ...selection,
          activePropertyPath: propertyPath,
        },
      });
    },
    
    // === PLAYBACK ACTIONS ===
    setCurrentFrame: (frame) => {
      const { playback, composition } = get();
      if (!composition) return;
      
      // Clamp to valid range
      const clampedFrame = Math.max(0, Math.min(frame, composition.duration - 1));
      
      set({
        playback: {
          ...playback,
          currentFrame: clampedFrame,
        },
      });
    },
    
    togglePlayback: () => {
      const { playback } = get();
      set({
        playback: {
          ...playback,
          isPlaying: !playback.isPlaying,
        },
      });
    },
    
    setIsPlaying: (isPlaying) => {
      const { playback } = get();
      set({
        playback: {
          ...playback,
          isPlaying,
        },
      });
    },
    
    setPlaybackRate: (rate) => {
      const { playback } = get();
      set({
        playback: {
          ...playback,
          playbackRate: rate,
        },
      });
    },
    
    toggleLoop: () => {
      const { playback } = get();
      set({
        playback: {
          ...playback,
          loop: !playback.loop,
        },
      });
    },
    
    setWorkArea: (start, end) => {
      const { playback } = get();
      set({
        playback: {
          ...playback,
          workAreaStart: start,
          workAreaEnd: end,
        },
      });
    },
    
    // === TIMELINE UI ACTIONS ===
    setZoom: (zoom) => {
      const { timeline } = get();
      set({
        timeline: {
          ...timeline,
          zoom: Math.max(0.5, Math.min(20, zoom)),
        },
      });
    },
    
    setScrollPosition: (position) => {
      const { timeline } = get();
      set({
        timeline: {
          ...timeline,
          scrollPosition: Math.max(0, position),
        },
      });
    },
    
    setTrackHeight: (height) => {
      const { timeline } = get();
      set({
        timeline: {
          ...timeline,
          trackHeight: Math.max(24, Math.min(64, height)),
        },
      });
    },
    
    toggleLayerCollapse: (layerId) => {
      const { timeline } = get();
      const collapsedLayers = new Set(timeline.collapsedLayers);
      
      if (collapsedLayers.has(layerId)) {
        collapsedLayers.delete(layerId);
      } else {
        collapsedLayers.add(layerId);
      }
      
      set({
        timeline: {
          ...timeline,
          collapsedLayers: [...collapsedLayers],
        },
      });
    },
    
    // === KEYFRAME ACTIONS ===
    addKeyframe: (layerId, propertyPath, frame, value) => {
      const { composition } = get();
      if (!composition) return '';
      
      saveToHistory();
      
      const keyframeId = generateKeyframeId();
      const newKeyframe: Keyframe = {
        id: keyframeId,
        time: frame / composition.fps, // Convert frame to time
        value,
        interpolation: DEFAULT_INTERPOLATION,
      };
      
      set({
        composition: produce(composition, (draft) => {
          const layer = draft.layers.find(l => l.id === layerId);
          if (!layer) return;
          
          const keyframes = layer.keyframes || [];
          const existingPropKeyframes = keyframes.find(pk => pk.propertyPath === propertyPath);
          
          if (existingPropKeyframes) {
            // Add to existing property keyframes
            existingPropKeyframes.keyframes.push(newKeyframe);
            existingPropKeyframes.keyframes.sort((a, b) => a.time - b.time);
          } else {
            // Create new property keyframes
            if (!layer.keyframes) {
              layer.keyframes = [];
            }
            layer.keyframes.push({
              propertyPath,
              enabled: true,
              keyframes: [newKeyframe],
            });
          }
          
          draft.updatedAt = new Date().toISOString();
        }),
        isDirty: true,
      });
      
      return keyframeId;
    },
    
    updateKeyframe: (layerId, propertyPath, keyframeId, updates) => {
      const { composition } = get();
      if (!composition) return;
      
      // Use continuous batching for keyframe updates (frequent during dragging)
      saveToHistory(true);
      
      set({
        composition: produce(composition, (draft) => {
          const layer = draft.layers.find(l => l.id === layerId);
          if (!layer || !layer.keyframes) return;
          
          const propKeyframes = layer.keyframes.find(pk => pk.propertyPath === propertyPath);
          if (!propKeyframes) return;
          
          const keyframe = propKeyframes.keyframes.find(k => k.id === keyframeId);
          if (keyframe) {
            Object.assign(keyframe, updates);
          }
          
          draft.updatedAt = new Date().toISOString();
        }),
        isDirty: true,
      });
    },
    
    deleteKeyframe: (layerId, propertyPath, keyframeId) => {
      const { composition } = get();
      if (!composition) return;
      
      saveToHistory();
      
      set({
        composition: {
          ...composition,
          layers: composition.layers.map(layer => {
            if (layer.id !== layerId) return layer;
            
            return {
              ...layer,
              keyframes: layer.keyframes?.map(pk =>
                pk.propertyPath === propertyPath
                  ? {
                      ...pk,
                      keyframes: pk.keyframes.filter(k => k.id !== keyframeId),
                    }
                  : pk
              ).filter(pk => pk.keyframes.length > 0), // Remove empty property keyframes
            };
          }),
          updatedAt: new Date().toISOString(),
        },
        isDirty: true,
      });
    },
    
    togglePropertyKeyframing: (layerId, propertyPath, enabled) => {
      const { composition } = get();
      if (!composition) return;
      
      saveToHistory();
      
      set({
        composition: {
          ...composition,
          layers: composition.layers.map(layer => {
            if (layer.id !== layerId) return layer;
            
            const keyframes = layer.keyframes || [];
            const existingPropKeyframes = keyframes.find(pk => pk.propertyPath === propertyPath);
            
            if (existingPropKeyframes) {
              return {
                ...layer,
                keyframes: keyframes.map(pk =>
                  pk.propertyPath === propertyPath
                    ? { ...pk, enabled }
                    : pk
                ),
              };
            } else if (enabled) {
              // Create new property keyframes entry if enabling
              return {
                ...layer,
                keyframes: [
                  ...keyframes,
                  {
                    propertyPath,
                    enabled: true,
                    keyframes: [],
                  },
                ],
              };
            }
            
            return layer;
          }),
          updatedAt: new Date().toISOString(),
        },
        isDirty: true,
      });
    },
    
    // === CHAT ACTIONS ===
    addChatMessage: (messageData) => {
      const id = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const message: CompositionChatMessage = {
        ...messageData,
        id,
        timestamp: new Date().toISOString(),
      };
      
      set(state => ({
        chatMessages: [...state.chatMessages, message],
      }));
      
      return id;
    },
    
    updateChatMessage: (messageId, updates) => {
      set(state => ({
        chatMessages: state.chatMessages.map(msg =>
          msg.id === messageId ? { ...msg, ...updates } : msg
        ),
      }));
    },
    
    clearChatHistory: () => {
      set({ chatMessages: [] });
    },
    
    // === DIRTY STATE ===
    setDirty: (isDirty) => {
      set({ isDirty });
    },
    
    // === UNDO/REDO ACTIONS ===
    undo: () => {
      const { history, historyIndex, composition } = get();
      
      // If at the beginning, nothing to undo
      if (historyIndex <= 0 || history.length === 0) {
        console.log('[CompositionEditor] Nothing to undo');
        return;
      }
      
      // Save current state if we're at the end (haven't undone yet)
      if (historyIndex === history.length - 1 && composition) {
        const currentClone = cloneComposition(composition);
        const newHistory = [...history];
        newHistory[historyIndex] = currentClone;
        set({ history: newHistory });
      }
      
      const newIndex = historyIndex - 1;
      const previousState = cloneComposition(history[newIndex]);
      
      console.log('[CompositionEditor] Undo to index:', newIndex, 'of', history.length);
      
      set({
        composition: previousState,
        historyIndex: newIndex,
        isDirty: true,
      });
    },
    
    redo: () => {
      const { history, historyIndex } = get();
      
      // If at the end, nothing to redo
      if (historyIndex >= history.length - 1) {
        console.log('[CompositionEditor] Nothing to redo');
        return;
      }
      
      const newIndex = historyIndex + 1;
      const nextState = cloneComposition(history[newIndex]);
      
      console.log('[CompositionEditor] Redo to index:', newIndex, 'of', history.length);
      
      set({
        composition: nextState,
        historyIndex: newIndex,
        isDirty: true,
      });
    },
    
    canUndo: () => {
      const { historyIndex, history } = get();
      return historyIndex > 0 && history.length > 0;
    },
    
    canRedo: () => {
      const { historyIndex, history } = get();
      return historyIndex < history.length - 1;
    },
    
    clearHistory: () => {
      const { composition } = get();
      if (!composition) {
        set({ history: [], historyIndex: -1 });
        return;
      }
      // Keep only the current state
      set({
        history: [cloneComposition(composition)],
        historyIndex: 0,
      });
    },
    
    // === CLIPBOARD ACTIONS ===
    copyLayers: () => {
      const { composition, selection } = get();
      if (!composition || selection.layerIds.length === 0) return;
      
      const selectedLayers = composition.layers.filter(l => 
        selection.layerIds.includes(l.id)
      );
      
      // Deep clone the layers
      const clonedLayers = JSON.parse(JSON.stringify(selectedLayers));
      
      set({ clipboard: clonedLayers });
      console.log('[CompositionEditor] Copied', clonedLayers.length, 'layers to clipboard');
    },
    
    cutLayers: () => {
      const { copyLayers, deleteLayers, selection } = get();
      if (selection.layerIds.length === 0) return;
      
      // Copy first
      copyLayers();
      
      // Then delete
      deleteLayers(selection.layerIds);
      console.log('[CompositionEditor] Cut', selection.layerIds.length, 'layers');
    },
    
    pasteLayers: () => {
      const { composition, clipboard } = get();
      if (!composition || clipboard.length === 0) return;
      
      // Save to history before pasting
      saveToHistory();
      
      // Clone clipboard layers with new IDs
      const newLayers: CompositionLayer[] = clipboard.map(layer => ({
        ...JSON.parse(JSON.stringify(layer)),
        id: generateLayerId(),
        name: `${layer.name} (Copy)`,
      }));
      
      // Add to the beginning (top of stack)
      const updatedLayers = [...newLayers, ...composition.layers];
      
      set({
        composition: {
          ...composition,
          layers: updatedLayers,
          updatedAt: new Date().toISOString(),
        },
        selection: {
          layerIds: newLayers.map(l => l.id),
          keyframeIds: [],
        },
        isDirty: true,
      });
      
      console.log('[CompositionEditor] Pasted', newLayers.length, 'layers');
    },
    
    hasClipboard: () => {
      return get().clipboard.length > 0;
    },
    
    // === ANIMATION PRESET ACTIONS ===
    applyAnimationPreset: (layerId, preset, options = {}, mergeMode = 'replace') => {
      const { composition, playback } = get();
      if (!composition) return;
      
      const layer = composition.layers.find(l => l.id === layerId);
      if (!layer) return;
      
      saveToHistory();
      
      // Build full options with defaults
      const fullOptions: PresetOptions = {
        startFrame: options.startFrame ?? playback.currentFrame,
        duration: options.duration ?? preset.defaultDuration,
        fps: composition.fps,
        reverse: options.reverse,
        easing: options.easing,
        propertyOverrides: options.propertyOverrides,
      };
      
      // Apply the preset
      const updatedLayer = applyPresetToLayer(layer, preset, fullOptions, mergeMode);
      
      set({
        composition: {
          ...composition,
          layers: composition.layers.map(l =>
            l.id === layerId ? updatedLayer : l
          ),
          updatedAt: new Date().toISOString(),
        },
        isDirty: true,
      });
      
      console.log('[CompositionEditor] Applied preset:', preset.name, 'to layer:', layer.name);
    },
    
    // === EXPORT ACTIONS ===
    getRemotionCodeForExport: () => {
      const { composition } = get();
      if (!composition) return null;
      
      // Generate remotionCode from the composition (single source of truth)
      const code = serializeToRemotionCode(composition);
      console.log('[CompositionEditor] Generated remotionCode for export:', code.length, 'chars');
      return code;
    },
    
    // === JSX/LAYER HYBRID ACTIONS ===
    loadFromJSX: (jsxCode: string, usedIcons?: string[], durationInFrames?: number) => {
      const { composition } = get();
      if (!composition) {
        console.warn('[CompositionEditor] Cannot load JSX - no composition open');
        return;
      }
      
      // Check if JSX has layer tags for parsing
      const hasTaggedLayers = hasLayerTags(jsxCode);
      console.log('[CompositionEditor] JSX has layer tags:', hasTaggedLayers);
      if (usedIcons?.length) {
        console.log('[CompositionEditor] Used icons:', usedIcons);
      }
      if (durationInFrames) {
        console.log('[CompositionEditor] AI provided duration:', durationInFrames, 'frames', `(${(durationInFrames / 30).toFixed(1)}s)`);
      } else {
        console.warn('[CompositionEditor] ⚠️ NO DURATION provided by AI - composition will keep existing duration');
      }
      
      if (hasTaggedLayers) {
        // Parse tagged JSX to extract layers
        const fps = composition.fps || 30;
        const parsedLayers = parseTaggedJSX(jsxCode, fps);
        console.log('[CompositionEditor] Parsed', parsedLayers.length, 'layers from tagged JSX');
        
        // Update composition with parsed layers AND store the JSX
        set(produce((state: CompositionEditorStore) => {
          if (state.composition) {
            state.composition.layers = parsedLayers;
            state.composition.originalRemotionCode = jsxCode;
            state.composition.generatedFromJSX = true;
            // Store used icons for compiler injection
            if (usedIcons?.length) {
              state.composition.usedIcons = usedIcons;
            }
            // Update duration if provided by AI vision
            if (durationInFrames && durationInFrames > 0) {
              console.log('[CompositionEditor] ✅ Applying AI duration:', durationInFrames, 'frames (replacing', state.composition.duration, 'frames)');
              state.composition.duration = durationInFrames;
            }
          }
        }));
        
        // Save to history
        get().saveToHistory();
      } else {
        // Store the JSX code directly without parsing
        // For backwards compatibility with non-tagged JSX
        set(produce((state: CompositionEditorStore) => {
          if (state.composition) {
            state.composition.originalRemotionCode = jsxCode;
            state.composition.generatedFromJSX = true;
            // Store used icons for compiler injection
            if (usedIcons?.length) {
              state.composition.usedIcons = usedIcons;
            }
            // Update duration if provided by AI vision
            if (durationInFrames && durationInFrames > 0) {
              console.log('[CompositionEditor] ✅ Applying AI duration:', durationInFrames, 'frames (replacing', state.composition.duration, 'frames)');
              state.composition.duration = durationInFrames;
            }
          }
        }));
        
        console.log('[CompositionEditor] Stored untagged JSX code:', jsxCode.length, 'chars');
      }
    },
    
    regenerateJSX: () => {
      const { composition } = get();
      if (!composition) return null;
      
      // Check if the original code had layer tags
      const originalCode = composition.originalRemotionCode;
      const hasTaggedLayers = originalCode && hasLayerTags(originalCode);
      
      let newCode: string;
      
      if (hasTaggedLayers && originalCode) {
        // Regenerate tagged JSX from modified layers
        console.log('[CompositionEditor] Regenerating tagged JSX from layers');
        newCode = regenerateJSXFromLayers(originalCode, composition.layers, composition.fps);
      } else {
        // Generate JSX from scratch using the serializer (for untagged JSX)
        console.log('[CompositionEditor] Generating JSX from layers using serializer');
        newCode = serializeToRemotionCode(composition);
      }
      
      // Update the stored code
      set(produce((state: CompositionEditorStore) => {
        if (state.composition) {
          state.composition.originalRemotionCode = newCode;
        }
      }));
      
      console.log('[CompositionEditor] Regenerated JSX:', newCode.length, 'chars');
      return newCode;
    },
    
    setRenderMode: (mode: 'jsx' | 'layers') => {
      set({ renderMode: mode });
      console.log('[CompositionEditor] Set render mode:', mode);
    },
    
    getRenderMode: () => {
      return get().renderMode;
    },
    
    // === AI GENERATION ACTIONS ===
    setGeneratedCode: (code: string | null) => {
      set({ generatedCode: code });
      console.log('[CompositionEditor] Set generated code:', code?.length || 0, 'chars');
    },
    
    setIsGenerating: (isGenerating: boolean) => {
      set({ isGenerating });
    },
    
    setGenerationError: (error: string | null) => {
      set({ generationError: error });
    },
    
    setDetectedSkills: (skills: string[]) => {
      set({ detectedSkills: skills });
    },
    
    addConversationMessage: (role: 'user' | 'assistant', content: string) => {
      set(produce((state: CompositionEditorStore) => {
        state.conversationHistory.push({ role, content });
        // Keep last 20 messages to avoid context overflow
        if (state.conversationHistory.length > 20) {
          state.conversationHistory = state.conversationHistory.slice(-20);
        }
      }));
    },
    
    clearConversationHistory: () => {
      set({ conversationHistory: [] });
    },
    
    resetAIGenerationState: () => {
      set({
        generatedCode: null,
        isGenerating: false,
        generationError: null,
        detectedSkills: [],
        conversationHistory: [],
      });
    },
    
    // === AFTER EFFECTS TIMELINE EXPANSION ACTIONS ===
    toggleLayerExpansion: (layerId) => {
      const { expandedLayers } = get();
      const isCurrentlyExpanded = (expandedLayers[layerId]?.length ?? 0) > 0;
      
      if (isCurrentlyExpanded) {
        // Collapse: remove all expanded properties
        const { [layerId]: _, ...rest } = expandedLayers;
        set({ expandedLayers: rest });
      } else {
        // Expand: show transform group by default
        set({
          expandedLayers: {
            ...expandedLayers,
            [layerId]: ['transform'],
          },
        });
      }
    },
    
    expandPropertyGroup: (layerId, propertyPath) => {
      const { expandedLayers } = get();
      const current = expandedLayers[layerId] || [];
      
      if (!current.includes(propertyPath)) {
        set({
          expandedLayers: {
            ...expandedLayers,
            [layerId]: [...current, propertyPath],
          },
        });
      }
    },
    
    collapsePropertyGroup: (layerId, propertyPath) => {
      const { expandedLayers } = get();
      const current = expandedLayers[layerId] || [];
      
      // Remove the property and any children (e.g., 'transform.position' when collapsing 'transform')
      const filtered = current.filter(p => p !== propertyPath && !p.startsWith(propertyPath + '.'));
      
      if (filtered.length === 0) {
        const { [layerId]: _, ...rest } = expandedLayers;
        set({ expandedLayers: rest });
      } else {
        set({
          expandedLayers: {
            ...expandedLayers,
            [layerId]: filtered,
          },
        });
      }
    },
    
    isLayerExpanded: (layerId) => {
      const { expandedLayers } = get();
      return (expandedLayers[layerId]?.length ?? 0) > 0;
    },
    
    isPropertyGroupExpanded: (layerId, propertyPath) => {
      const { expandedLayers } = get();
      return expandedLayers[layerId]?.includes(propertyPath) ?? false;
    },
    
    toggleGraphEditor: () => {
      const { graphEditorVisible } = get();
      set({ graphEditorVisible: !graphEditorVisible });
    },
    
    setGraphEditorProperty: (propertyPath) => {
      set({ graphEditorSelectedProperty: propertyPath });
    },
    
    toggleShowOnlyKeyframed: () => {
      const { showOnlyKeyframedProperties } = get();
      set({ showOnlyKeyframedProperties: !showOnlyKeyframedProperties });
    },
    
    revealProperty: (layerId, propertyPath) => {
      const { expandedLayers } = get();
      const current = expandedLayers[layerId] || [];
      
      // Build path to property (e.g., for 'transform.x', add 'transform' then 'transform.x')
      const parts = propertyPath.split('.');
      const pathsToAdd: string[] = [];
      let currentPath = '';
      
      for (const part of parts) {
        currentPath = currentPath ? `${currentPath}.${part}` : part;
        if (!current.includes(currentPath)) {
          pathsToAdd.push(currentPath);
        }
      }
      
      if (pathsToAdd.length > 0) {
        set({
          expandedLayers: {
            ...expandedLayers,
            [layerId]: [...current, ...pathsToAdd],
          },
        });
      }
    },
    
    revealKeyframedProperties: (layerId) => {
      const { composition, expandedLayers } = get();
      if (!composition) return;
      
      const layer = composition.layers.find(l => l.id === layerId);
      if (!layer || !layer.keyframes) return;
      
      // Get all property paths that have keyframes
      const keyframedPaths = layer.keyframes
        .filter(pk => pk.keyframes.length > 0)
        .map(pk => pk.propertyPath);
      
      // Build all parent paths
      const allPaths = new Set<string>();
      for (const path of keyframedPaths) {
        const parts = path.split('.');
        let currentPath = '';
        for (const part of parts) {
          currentPath = currentPath ? `${currentPath}.${part}` : part;
          allPaths.add(currentPath);
        }
      }
      
      set({
        expandedLayers: {
          ...expandedLayers,
          [layerId]: [...allPaths],
        },
      });
    },
  };
  })
);

// ============================================================
// SELECTORS
// ============================================================

/**
 * Get the selected layers
 */
export const selectSelectedLayers = (state: CompositionEditorStore) => {
  if (!state.composition) return [];
  const selectedIds = new Set(state.selection.layerIds);
  return state.composition.layers.filter(l => selectedIds.has(l.id));
};

/**
 * Get a single selected layer (when one is selected)
 */
export const selectSingleSelectedLayer = (state: CompositionEditorStore) => {
  const selected = selectSelectedLayers(state);
  return selected.length === 1 ? selected[0] : null;
};

/**
 * Get layers visible at current frame
 */
export const selectLayersAtCurrentFrame = (state: CompositionEditorStore) => {
  if (!state.composition) return [];
  const frame = state.playback.currentFrame;
  
  return state.composition.layers.filter(layer => {
    if (!layer.visible) return false;
    const endFrame = layer.startTime + layer.duration;
    return frame >= layer.startTime && frame < endFrame;
  });
};

/**
 * Get whether any layer is soloed
 */
export const selectHasSoloedLayers = (state: CompositionEditorStore) => {
  if (!state.composition) return false;
  return state.composition.layers.some(l => l.solo);
};

/**
 * Get duration in seconds
 */
export const selectDurationInSeconds = (state: CompositionEditorStore) => {
  if (!state.composition) return 0;
  return state.composition.duration / state.composition.fps;
};

/**
 * Get current time in seconds
 */
export const selectCurrentTimeInSeconds = (state: CompositionEditorStore) => {
  if (!state.composition) return 0;
  return state.playback.currentFrame / state.composition.fps;
};
