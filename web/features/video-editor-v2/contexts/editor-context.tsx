/**
 * EditorContext - Configuration and Callbacks Only
 * 
 * This context provides:
 * - Project configuration (fps, renderer, projectId)
 * - Player ref for Remotion integration
 * - Callbacks for external integrations
 * 
 * ALL DATA STATE is managed by VideoEditorStore (Zustand).
 * Components MUST use useVideoEditorStore for data access.
 * 
 * NO backward compatibility - use the new clip-based APIs.
 */

import React, { createContext, useContext, ReactNode } from "react";
import type { PlayerRef } from "@remotion/player";

// ============================================================
// CONFIGURATION TYPES
// ============================================================

export interface EditorConfig {
  projectId: string;
  fps: number;
  playerRef: React.RefObject<PlayerRef>;
  isScrubbingRef: React.MutableRefObject<boolean>; // Shared scrubbing state
  renderType: string;
  baseUrl?: string;
  initialRows: number;
  maxRows: number;
  zoomConstraints: {
    min: number;
    max: number;
    step: number;
    default: number;
  };
  snappingConfig: {
    thresholdFrames: number;
    enableVerticalSnapping: boolean;
  };
  disableMobileLayout: boolean;
  disableVideoKeyframes: boolean;
  enablePushOnDrag: boolean;
  videoWidth: number;
  videoHeight: number;
}

export interface EditorCallbacks {
  play: () => void;
  pause: () => void;
  togglePlayPause: () => void;
  seekTo: (frame: number) => void;
  formatTime: (frame: number) => string;
  renderMedia: () => void;
  saveProject?: () => Promise<void>;
}

export interface EditorContextProps extends EditorConfig, EditorCallbacks {
  isInitialLoadComplete: boolean;
}

// ============================================================
// CONTEXT
// ============================================================

const EditorContext = createContext<EditorContextProps | undefined>(undefined);

export const EditorProvider: React.FC<{
  value: EditorContextProps;
  children: ReactNode;
}> = ({ value, children }) => {
  return (
    <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
  );
};

export const useEditorContext = (): EditorContextProps => {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error("useEditorContext must be used within an EditorProvider");
  }
  return context;
};

/**
 * Hook to get just the config values (no callbacks)
 */
export const useEditorConfig = (): EditorConfig => {
  const context = useEditorContext();
  return {
    projectId: context.projectId,
    fps: context.fps,
    playerRef: context.playerRef,
    isScrubbingRef: context.isScrubbingRef,
    renderType: context.renderType,
    baseUrl: context.baseUrl,
    initialRows: context.initialRows,
    maxRows: context.maxRows,
    zoomConstraints: context.zoomConstraints,
    snappingConfig: context.snappingConfig,
    disableMobileLayout: context.disableMobileLayout,
    disableVideoKeyframes: context.disableVideoKeyframes,
    enablePushOnDrag: context.enablePushOnDrag,
    videoWidth: context.videoWidth,
    videoHeight: context.videoHeight,
  };
};
