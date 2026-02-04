/**
 * useProjectSync - Supabase-only Project Persistence
 * 
 * Provides:
 * - Auto-save to Supabase with debouncing
 * - Project state loading with optional asset validation
 * - Manual save functionality
 * - Save status tracking
 * - Asset validation on load
 * 
 * No localStorage - all persistence goes to Supabase.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useVideoEditorStore } from '../stores/video-editor-store';
import { saveProjectState, loadProjectState } from '../services/project-state-service';
import { 
  validateClipAssets, 
  filterInvalidClips, 
  type ValidationSummary 
} from '../services/asset-validation-service';

export interface UseProjectSyncOptions {
  /** Auto-save interval in milliseconds (default: 10000ms = 10s) */
  autoSaveInterval?: number;
  /** Whether to enable auto-save (default: true) */
  enableAutoSave?: boolean;
  /** Callback when saving starts */
  onSaveStart?: () => void;
  /** Callback when save completes */
  onSaveComplete?: (timestamp: number) => void;
  /** Callback when save fails */
  onSaveError?: (error: Error) => void;
  /** Callback when project is loaded */
  onLoad?: (hasData: boolean) => void;
  /** Whether to validate assets on load (default: false) */
  validateAssetsOnLoad?: boolean;
  /** Callback when asset validation completes */
  onAssetValidation?: (summary: ValidationSummary) => void;
  /** Whether to automatically remove clips with invalid assets (default: false) */
  autoRemoveInvalidClips?: boolean;
}

export interface ProjectSyncState {
  /** Whether a save is in progress */
  isSaving: boolean;
  /** Last successful save timestamp */
  lastSavedAt: number | null;
  /** Whether the project has unsaved changes */
  isDirty: boolean;
  /** Whether the initial load is complete */
  isLoaded: boolean;
  /** Last error encountered */
  error: Error | null;
  /** Whether asset validation is in progress */
  isValidatingAssets: boolean;
  /** Last asset validation summary */
  assetValidation: ValidationSummary | null;
}

export function useProjectSync(
  projectId: string | null,
  options: UseProjectSyncOptions = {}
) {
  const {
    autoSaveInterval = 10000,
    enableAutoSave = true,
    onSaveStart,
    onSaveComplete,
    onSaveError,
    onLoad,
    validateAssetsOnLoad = false,
    onAssetValidation,
    autoRemoveInvalidClips = false,
  } = options;

  // State
  const [state, setState] = useState<ProjectSyncState>({
    isSaving: false,
    lastSavedAt: null,
    isDirty: false,
    isLoaded: false,
    error: null,
    isValidatingAssets: false,
    assetValidation: null,
  });

  // Refs for tracking
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSaveDataRef = useRef<string>('');

  // Get current state from store
  const tracks = useVideoEditorStore(state => state.tracks);
  const clips = useVideoEditorStore(state => state.clips);
  const transitions = useVideoEditorStore(state => state.transitions);
  const aspectRatio = useVideoEditorStore(state => state.aspectRatio);
  const resolution = useVideoEditorStore(state => state.resolution);
  const backgroundColor = useVideoEditorStore(state => state.backgroundColor);
  const storeIsDirty = useVideoEditorStore(state => state.isDirty);
  const markSaved = useVideoEditorStore(state => state.markSaved);

  // Build save payload
  const buildSavePayload = useCallback(() => {
    return {
      timelineData: {
        tracks,
        clips,
        transitions,
        version: 2, // Timeline V2 format
      },
      aspectRatio,
      resolution,
      backgroundColor,
    };
  }, [tracks, clips, transitions, aspectRatio, resolution, backgroundColor]);

  // Perform save
  const performSave = useCallback(async () => {
    if (!projectId) return false;

    const payload = buildSavePayload();
    const payloadString = JSON.stringify(payload);

    // Skip if nothing changed
    if (payloadString === lastSaveDataRef.current) {
      return true;
    }

    setState(prev => ({ ...prev, isSaving: true, error: null }));
    onSaveStart?.();

    try {
      const result = await saveProjectState(projectId, {
        timelineData: payload.timelineData,
        editorPreferences: {
          aspectRatio: payload.aspectRatio,
          resolution: payload.resolution,
          backgroundColor: payload.backgroundColor,
        },
      });

      if (result.success) {
        const timestamp = Date.now();
        lastSaveDataRef.current = payloadString;
        markSaved();
        
        setState(prev => ({
          ...prev,
          isSaving: false,
          lastSavedAt: timestamp,
          isDirty: false,
        }));
        
        onSaveComplete?.(timestamp);
        return true;
      } else {
        throw new Error('Save failed');
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Unknown save error');
      
      setState(prev => ({
        ...prev,
        isSaving: false,
        error: err,
      }));
      
      onSaveError?.(err);
      console.error('[useProjectSync] Save failed:', err);
      return false;
    }
  }, [projectId, buildSavePayload, markSaved, onSaveStart, onSaveComplete, onSaveError]);

  // Manual save function
  const save = useCallback(async () => {
    // Clear any pending auto-save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    
    return performSave();
  }, [performSave]);

  // Load project state
  const load = useCallback(async () => {
    if (!projectId) {
      setState(prev => ({ ...prev, isLoaded: true }));
      onLoad?.(false);
      return;
    }

    try {
      const savedState = await loadProjectState(projectId);
      
      if (savedState && savedState.timelineData) {
        const store = useVideoEditorStore.getState();
        const { timelineData, editorPreferences } = savedState as any;
        
        let clipsToLoad = timelineData.clips || [];
        
        // Validate assets if enabled
        if (validateAssetsOnLoad && clipsToLoad.length > 0) {
          console.log('[useProjectSync] Validating assets...');
          setState(prev => ({ ...prev, isValidatingAssets: true }));
          
          try {
            const validationSummary = await validateClipAssets(clipsToLoad, {
              timeout: 5000,
              concurrency: 5,
            });
            
            setState(prev => ({ ...prev, assetValidation: validationSummary }));
            onAssetValidation?.(validationSummary);
            
            // If there are invalid assets and auto-remove is enabled
            if (validationSummary.invalidAssets > 0 && autoRemoveInvalidClips) {
              console.log(`[useProjectSync] Removing ${validationSummary.invalidClipIds.length} clips with invalid assets`);
              const { validClips } = filterInvalidClips(clipsToLoad, validationSummary.invalidClipIds);
              clipsToLoad = validClips;
            } else if (validationSummary.invalidAssets > 0) {
              console.warn(
                `[useProjectSync] Found ${validationSummary.invalidAssets} clips with invalid assets. ` +
                `Set autoRemoveInvalidClips=true to remove them.`
              );
            }
          } catch (validationError) {
            console.error('[useProjectSync] Asset validation failed:', validationError);
            // Continue loading even if validation fails
          } finally {
            setState(prev => ({ ...prev, isValidatingAssets: false }));
          }
        }
        
        // Initialize store with loaded data
        if (timelineData.tracks) {
          store.setTracks(timelineData.tracks);
        }
        if (clipsToLoad.length >= 0) {
          store.setClips(clipsToLoad);
        }
        if (timelineData.transitions) {
          store.setTransitions(timelineData.transitions);
        }
        
        // Apply preferences
        if (editorPreferences) {
          if (editorPreferences.aspectRatio) {
            store.setAspectRatio(editorPreferences.aspectRatio);
          }
          if (editorPreferences.resolution) {
            store.setResolution(editorPreferences.resolution);
          }
          if (editorPreferences.backgroundColor) {
            store.setBackgroundColor(editorPreferences.backgroundColor);
          }
        }
        
        // Update last save data ref to prevent immediate save
        lastSaveDataRef.current = JSON.stringify({
          timelineData: { ...timelineData, clips: clipsToLoad },
          ...editorPreferences,
        });
        
        setState(prev => ({ ...prev, isLoaded: true, isDirty: false }));
        onLoad?.(true);
      } else {
        setState(prev => ({ ...prev, isLoaded: true }));
        onLoad?.(false);
      }
    } catch (error) {
      console.error('[useProjectSync] Load failed:', error);
      setState(prev => ({ 
        ...prev, 
        isLoaded: true, 
        error: error instanceof Error ? error : new Error('Load failed'),
      }));
      onLoad?.(false);
    }
  }, [projectId, onLoad, validateAssetsOnLoad, onAssetValidation, autoRemoveInvalidClips]);

  // Auto-save effect
  useEffect(() => {
    if (!enableAutoSave || !projectId || !storeIsDirty) {
      return;
    }

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Schedule new save
    saveTimeoutRef.current = setTimeout(() => {
      performSave();
    }, autoSaveInterval);

    // Update dirty state
    setState(prev => ({ ...prev, isDirty: true }));

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [enableAutoSave, projectId, storeIsDirty, autoSaveInterval, performSave]);

  // Initial load
  useEffect(() => {
    if (projectId && !state.isLoaded) {
      load();
    }
  }, [projectId, state.isLoaded, load]);

  // Cleanup on unmount - save if dirty
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
      // Perform final save if dirty
      if (storeIsDirty && projectId) {
        performSave();
      }
    };
  }, [storeIsDirty, projectId, performSave]);

  return {
    ...state,
    save,
    load,
  };
}

export default useProjectSync;
