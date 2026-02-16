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
 * IMPORTANT: This hook uses NON-REACTIVE store access (getState / subscribe)
 * instead of Zustand selectors. This prevents the hook from causing re-renders
 * of EditorProvider and its entire subtree on every store change.
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
  /** Skip loading state from Supabase on mount (use when wizard data bridge
   *  will populate the store instead). Auto-save still works. */
  skipInitialLoad?: boolean;
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
    skipInitialLoad = false,
  } = options;

  // State — only tracks meta-status, NOT store data
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
  const isMountedRef = useRef(true);

  // Keep callback refs so effects stay stable
  const onSaveStartRef = useRef(onSaveStart);
  const onSaveCompleteRef = useRef(onSaveComplete);
  const onSaveErrorRef = useRef(onSaveError);
  const onLoadRef = useRef(onLoad);
  const onAssetValidationRef = useRef(onAssetValidation);
  onSaveStartRef.current = onSaveStart;
  onSaveCompleteRef.current = onSaveComplete;
  onSaveErrorRef.current = onSaveError;
  onLoadRef.current = onLoad;
  onAssetValidationRef.current = onAssetValidation;

  // =============================================
  // NON-REACTIVE save — reads store via getState()
  // =============================================
  const performSave = useCallback(async () => {
    if (!projectId || !isMountedRef.current) return false;

    const store = useVideoEditorStore.getState();
    const payload = {
      timelineData: {
        tracks: store.tracks,
        trackOrder: store.trackOrder,
        clips: store.clips,
        transitions: store.transitions,
        version: 2,
      },
      aspectRatio: store.aspectRatio,
      resolution: store.resolution,
      backgroundColor: store.backgroundColor,
    };
    const payloadString = JSON.stringify(payload);

    // Skip if nothing changed
    if (payloadString === lastSaveDataRef.current) {
      return true;
    }

    if (isMountedRef.current) {
      setState(prev => ({ ...prev, isSaving: true, error: null }));
    }
    onSaveStartRef.current?.();

    try {
      const result = await saveProjectState(projectId, {
        timelineData: payload.timelineData as any,
        editorPreferences: {
          aspectRatio: payload.aspectRatio,
          resolution: payload.resolution,
          backgroundColor: payload.backgroundColor,
        },
      });

      if (result.success) {
        const timestamp = Date.now();
        lastSaveDataRef.current = payloadString;
        store.markSaved();
        
        if (isMountedRef.current) {
          setState(prev => ({
            ...prev,
            isSaving: false,
            lastSavedAt: timestamp,
            isDirty: false,
          }));
        }
        
        onSaveCompleteRef.current?.(timestamp);
        return true;
      } else {
        throw new Error('Save failed');
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Unknown save error');
      
      if (isMountedRef.current) {
        setState(prev => ({
          ...prev,
          isSaving: false,
          error: err,
        }));
      }
      
      onSaveErrorRef.current?.(err);
      console.error('[useProjectSync] Save failed:', err);
      return false;
    }
  }, [projectId]); // Only depends on projectId — all store data read via getState()

  // Manual save function
  const save = useCallback(async () => {
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
      onLoadRef.current?.(false);
      return;
    }

    try {
      const savedState = await loadProjectState(projectId);
      
      if (savedState && savedState.timelineData) {
        const store = useVideoEditorStore.getState();
        const { timelineData, editorPreferences } = savedState as any;
        
        const rawClips = timelineData.clips || [];
        let clipsToLoad = Array.isArray(rawClips) ? rawClips : Object.values(rawClips);
        
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
            onAssetValidationRef.current?.(validationSummary);
            
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
          } finally {
            setState(prev => ({ ...prev, isValidatingAssets: false }));
          }
        }
        
        // Initialize store with loaded data
        // Note: saved state may store tracks/clips as Record<string, T> objects (store format)
        // but setTracks/setClips expect arrays — normalize here.
        if (timelineData.tracks) {
          const tracksArray = Array.isArray(timelineData.tracks)
            ? timelineData.tracks
            : Object.values(timelineData.tracks);
          // Restore saved track order if available, otherwise sort by track.order
          if (timelineData.trackOrder && Array.isArray(timelineData.trackOrder)) {
            const orderMap = new Map(timelineData.trackOrder.map((id: string, idx: number) => [id, idx]));
            tracksArray.sort((a: any, b: any) => (orderMap.get(a.id) ?? a.order ?? 999) - (orderMap.get(b.id) ?? b.order ?? 999));
          } else {
            tracksArray.sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
          }
          store.setTracks(tracksArray);
        }
        
        const clipsArray = Array.isArray(clipsToLoad)
          ? clipsToLoad
          : Object.values(clipsToLoad);
        if (clipsArray.length >= 0) {
          store.setClips(clipsArray);
        }
        
        if (timelineData.transitions) {
          const transitionsArray = Array.isArray(timelineData.transitions)
            ? timelineData.transitions
            : Object.values(timelineData.transitions);
          store.setTransitions(transitionsArray);
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
        onLoadRef.current?.(true);
      } else {
        setState(prev => ({ ...prev, isLoaded: true }));
        onLoadRef.current?.(false);
      }
    } catch (error) {
      console.error('[useProjectSync] Load failed:', error);
      setState(prev => ({ 
        ...prev, 
        isLoaded: true, 
        error: error instanceof Error ? error : new Error('Load failed'),
      }));
      onLoadRef.current?.(false);
    }
  }, [projectId, validateAssetsOnLoad, autoRemoveInvalidClips]);

  // =============================================
  // Auto-save via non-reactive subscribe()
  // =============================================
  useEffect(() => {
    if (!enableAutoSave || !projectId) return;

    // Subscribe to isDirty changes in the store — does NOT trigger re-render
    const unsubscribe = useVideoEditorStore.subscribe(
      (state) => state.isDirty,
      (isDirty) => {
        if (!isDirty || !isMountedRef.current) return;

        // Clear any pending save
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }

        // Schedule new save
        saveTimeoutRef.current = setTimeout(() => {
          performSave();
        }, autoSaveInterval);
      },
    );

    return () => {
      unsubscribe();
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [enableAutoSave, projectId, autoSaveInterval, performSave]);

  // Initial load (skipped when wizard data bridge will populate the store)
  useEffect(() => {
    if (projectId && !state.isLoaded) {
      if (skipInitialLoad) {
        console.log('[useProjectSync] Skipping initial load (wizard data bridge will populate store)');
        setState(prev => ({ ...prev, isLoaded: true }));
        onLoadRef.current?.(false);
      } else {
        load();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, state.isLoaded, load, skipInitialLoad]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      // Perform final save if dirty
      const store = useVideoEditorStore.getState();
      if (store.isDirty && projectId) {
        performSave();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  return {
    ...state,
    save,
    load,
  };
}

export default useProjectSync;
