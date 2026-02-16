/**
 * EditorProvider - Simplified Provider for Video Editor
 * 
 * This provider:
 * - Initializes the VideoEditorStore with project data
 * - Provides configuration and callbacks via EditorContext
 * - Manages the Remotion player reference
 * - Manages audio resource lifecycle via AudioResourceManager
 * 
 * All state is managed by VideoEditorStore - no bidirectional sync.
 */

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { EditorProvider as EditorContextProvider } from "../../contexts/editor-context";
import { useVideoPlayer } from "../../hooks/use-video-player";
import { useRenderer } from "../../contexts/renderer-context";
import { PlayerRef } from "@remotion/player";
import { TIMELINE_CONSTANTS } from "../advanced-timeline/constants";
import { useVideoEditorStore } from "../../stores/video-editor-store";
import type { TimelineTrack, TimelineClip } from "../../types/timeline-v2";
import { 
  initializeAudioResourceManager, 
  destroyAudioResourceManager,
  cleanupAllAudioResources,
} from "../../utils/audio-resource-manager";
import { useProjectSync } from "../../hooks/use-project-sync";
import { importWizardDataToStore, type WizardData } from "../../hooks/use-wizard-data-import";


interface EditorProviderProps {
  children: React.ReactNode;
  projectId: string;
  
  // Initial data (Timeline V2 format)
  defaultTracks?: TimelineTrack[];
  defaultClips?: TimelineClip[];
  
  // Settings
  defaultAspectRatio?: import("../../stores/video-editor-store").AspectRatio;
  defaultResolution?: import("../../stores/video-editor-store").ResolutionPreset;
  defaultBackgroundColor?: string;
  fps?: number;
  
  // Player Configuration
  playerRef?: React.RefObject<PlayerRef | null>;
  
  // API Configuration
  baseUrl?: string;
  
  // Timeline Configuration
  initialRows?: number;
  maxRows?: number;
  zoomConstraints?: {
    min: number;
    max: number;
    step: number;
    default: number;
  };
  snappingConfig?: {
    thresholdFrames: number;
    enableVerticalSnapping: boolean;
  };
  
  // Feature Flags
  disableMobileLayout?: boolean;
  disableVideoKeyframes?: boolean;
  enablePushOnDrag?: boolean;
  
  // Video Dimensions
  videoWidth?: number;
  videoHeight?: number;
  
  // Loading state
  isLoadingProject?: boolean;
  
  // Skip initial load from Supabase (wizard data bridge will populate the store)
  skipInitialLoad?: boolean;
  
  // Wizard data to import after store initialization (from video creation wizard)
  wizardData?: WizardData;
  
  // Callbacks
  onSaving?: (saving: boolean) => void;
  onSaved?: (timestamp: number) => void;
}

export const EditorProvider: React.FC<EditorProviderProps> = ({
  children,
  projectId,
  defaultTracks,
  defaultClips,
  defaultAspectRatio,
  defaultResolution,
  defaultBackgroundColor,
  fps = 30,
  playerRef: externalPlayerRef,
  baseUrl,
  initialRows = 5,
  maxRows = 8,
  zoomConstraints = {
    min: 0.2,
    max: 10,
    step: 0.1,
    default: 1,
  },
  snappingConfig = {
    thresholdFrames: 1,
    enableVerticalSnapping: true,
  },
  disableMobileLayout = false,
  disableVideoKeyframes = false,
  enablePushOnDrag = false,
  videoWidth = 1280,
  videoHeight = 720,
  isLoadingProject = false,
  skipInitialLoad = false,
  wizardData,
  onSaving,
  onSaved,
}) => {
  // Get renderer configuration
  const rendererConfig = useRenderer();
  const renderType = rendererConfig.renderer.renderType?.type || "ssr";

  // Track initialization
  const hasInitialized = useRef(false);
  const audioManagerInitialized = useRef(false);
  
  // Initialize AudioResourceManager on mount (before store initialization)
  useEffect(() => {
    if (!audioManagerInitialized.current) {
      // Initialize the audio resource manager with store subscription
      // This must happen BEFORE any clips are added so it can track them
      initializeAudioResourceManager(useVideoEditorStore);
      audioManagerInitialized.current = true;
      console.log('[EditorProvider] AudioResourceManager initialized');
    }
    
    // Cleanup on unmount
    return () => {
      console.log('[EditorProvider] Destroying AudioResourceManager');
      destroyAudioResourceManager();
      audioManagerInitialized.current = false;
    };
  }, []);
  
  // Capture wizardData in a ref to avoid it being a dependency (it's an inline object
  // that changes reference every render, which would cause infinite re-renders via store mutations)
  const wizardDataRef = useRef(wizardData);
  wizardDataRef.current = wizardData;
  
  // Initialize store on mount
  useEffect(() => {
    if (hasInitialized.current || isLoadingProject) return;
    
    const store = useVideoEditorStore.getState();
    store.initialize({
      projectId,
      tracks: defaultTracks,
      clips: defaultClips,
      fps,
      aspectRatio: defaultAspectRatio,
      resolution: defaultResolution,
      backgroundColor: defaultBackgroundColor,
    });
    
    // Set timeline constants
    store.setTrackHeight(TIMELINE_CONSTANTS.TRACK_HEIGHT);
    store.setClipHeight(TIMELINE_CONSTANTS.TRACK_ITEM_HEIGHT);
    
    // Import wizard data IMMEDIATELY after initialize (same tick)
    // This guarantees clips are populated before any other effects run.
    if (wizardDataRef.current) {
      console.log('[EditorProvider] Importing wizard data after store.initialize()');
      importWizardDataToStore(wizardDataRef.current);
    }
    
    hasInitialized.current = true;
  }, [projectId, defaultTracks, defaultClips, fps, defaultAspectRatio, defaultResolution, defaultBackgroundColor, isLoadingProject]);
  
  // Re-initialize when project data loads
  useEffect(() => {
    if (!isLoadingProject && hasInitialized.current && (defaultTracks || defaultClips)) {
      // Clean up old audio resources before loading new project data
      // This ensures no orphaned resources from the previous project
      console.log('[EditorProvider] Cleaning up audio resources before project reload');
      cleanupAllAudioResources();
      
      const store = useVideoEditorStore.getState();
      if (defaultTracks) store.setTracks(defaultTracks);
      if (defaultClips) store.setClips(defaultClips);
      if (defaultAspectRatio) store.setAspectRatio(defaultAspectRatio);
      if (defaultResolution) store.setResolution(defaultResolution);
      if (defaultBackgroundColor) store.setBackgroundColor(defaultBackgroundColor);
    }
  }, [isLoadingProject, defaultTracks, defaultClips, defaultAspectRatio, defaultResolution, defaultBackgroundColor]);
  
  // Video player hook for Remotion integration
  const { 
    isPlaying, 
    currentFrame, 
    playerRef: internalPlayerRef, 
    togglePlayPause, 
    formatTime, 
    play, 
    pause, 
    seekTo 
  } = useVideoPlayer(fps, externalPlayerRef as any);
  
  const playerRef = externalPlayerRef || internalPlayerRef;
  
  // Create shared scrubbing state ref
  const isScrubbingRef = useRef(false);
  
  // Sync playback state to store
  // NOTE: currentFrame sync is handled directly in useVideoPlayer's frameupdate handler
  // for real-time performance. Only isPlaying needs the useEffect bridge here.
  useEffect(() => {
    const store = useVideoEditorStore.getState();
    store.setIsPlaying(isPlaying);
  }, [isPlaying]);
  
  // Render function (placeholder - actual rendering handled elsewhere)
  const renderMedia = useCallback(() => {
    console.log('[EditorProvider] Render requested');
    // Rendering is handled by the rendering system
  }, []);

  // Supabase auto-save + load via useProjectSync
  const {
    save: saveProject,
    isLoaded: isSyncLoaded,
  } = useProjectSync(projectId, {
    enableAutoSave: true,
    autoSaveInterval: 10000,
    skipInitialLoad,
    onSaveStart: () => onSaving?.(true),
    onSaveComplete: (ts) => {
      onSaving?.(false);
      onSaved?.(ts);
    },
    onSaveError: () => onSaving?.(false),
  });

  // Wrap save in async callback for context compatibility
  const saveProjectCallback = useCallback(async () => {
    await saveProject();
  }, [saveProject]);

  // Context value - MEMOIZED to prevent re-render cascade
  // IMPORTANT: currentFrame and isPlaying are intentionally excluded —
  // they change at 30fps during playback and are already synced to the Zustand store
  // (see useEffect above). Components should read them from the store, not context.
  const contextValue = useMemo(() => ({
    // Project identification
    projectId,
    
    // Video settings
    fps,

    // Player reference
    playerRef,
    
    // Scrubbing state (shared between scrubbing hook and video-player)
    isScrubbingRef,
    
    // Renderer configuration
    renderType,

    // API Configuration
    baseUrl,

    // Timeline Configuration
    initialRows,
    maxRows,
    zoomConstraints,
    snappingConfig,
    
    // Feature flags
    disableMobileLayout,
    disableVideoKeyframes,
    enablePushOnDrag,
    
    // Video dimensions
    videoWidth,
    videoHeight,

    // Playback controls
    play,
    pause,
    togglePlayPause,
    seekTo,
    formatTime,

    // Rendering
    renderMedia,
    
    // Save functionality
    saveProject: saveProjectCallback,
    
    // Loading state
    isInitialLoadComplete: !isLoadingProject && isSyncLoaded,
  }), [
    projectId, fps, playerRef, isScrubbingRef, renderType, baseUrl,
    initialRows, maxRows, zoomConstraints, snappingConfig,
    disableMobileLayout, disableVideoKeyframes, enablePushOnDrag,
    videoWidth, videoHeight,
    play, pause, togglePlayPause, seekTo, formatTime,
    renderMedia, saveProjectCallback, isLoadingProject, isSyncLoaded,
  ]);

  return (
    <EditorContextProvider value={contextValue as any}>
      {children}
    </EditorContextProvider>
  );
}; 
