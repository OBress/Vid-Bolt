/**
 * ReactVideoEditorProvider - Main Provider for Video Editor
 * 
 * Wraps the application with all necessary providers:
 * - UI Sidebar
 * - Renderer
 * - Media Adaptors
 * - Theme
 * - Editor (VideoEditorStore)
 * - Local Media
 * - Sidebar Context
 * - Tool Context
 */

import React from "react";
import { SidebarProvider as UISidebarProvider } from "../ui/sidebar";
import { EditorProvider } from "./editor-provider";
import type { WizardData } from "../../hooks/use-wizard-data-import";
import { RendererProvider } from "../../contexts/renderer-context";
import { LocalMediaProvider } from "../../contexts/local-media-context";
import { SidebarProvider as EditorSidebarProvider } from "../../contexts/sidebar-context";
import { MediaAdaptorProvider } from "../../contexts/media-adaptor-context";
import { ThemeProvider } from "../../contexts/theme-context";
import { ToolProvider } from "../../contexts/tool-context";
import { VideoRenderer } from "../../types/renderer";
import { HttpRenderer } from "../../utils/http-renderer";
import { PlayerRef } from "@remotion/player";
import { OverlayAdaptors } from "../../types/overlay-adaptors";
import { CustomTheme } from "../../hooks/use-extended-theme-switcher";
import type { TimelineTrack, TimelineClip } from "../../types/timeline-v2";
import type { AspectRatio, ResolutionPreset } from "../../stores/video-editor-store";

export interface ReactVideoEditorProviderProps {
  children: React.ReactNode;
  projectId: string;
  
  // Timeline V2 data
  defaultTracks?: TimelineTrack[];
  defaultClips?: TimelineClip[];
  
  // Settings
  defaultAspectRatio?: AspectRatio;
  defaultResolution?: ResolutionPreset;
  defaultBackgroundColor?: string;
  fps?: number;
  renderer?: VideoRenderer;
  
  // Callbacks
  onSaving?: (saving: boolean) => void;
  onSaved?: (timestamp: number) => void;
  
  // UI Configuration
  sidebarWidth?: string;
  sidebarIconWidth?: string;
  
  // Loading State
  isLoadingProject?: boolean;
  
  // Skip initial load from Supabase (wizard data bridge will populate the store)
  skipInitialLoad?: boolean;
  
  // Wizard data to import after store initialization
  wizardData?: WizardData;
  
  // Player Configuration
  playerRef?: React.RefObject<PlayerRef>;
  
  // API Configuration
  baseUrl?: string;
  
  // Adaptor Configuration
  adaptors?: OverlayAdaptors;
  
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
  
  // Theme Configuration
  availableThemes?: CustomTheme[];
  selectedTheme?: string;
  onThemeChange?: (themeId: string) => void;
  showDefaultThemes?: boolean;
  hideThemeToggle?: boolean;
  defaultTheme?: string;
}

// Default renderer (lazy singleton)
let _defaultRenderer: VideoRenderer | null = null;
function getDefaultRenderer(): VideoRenderer {
  if (!_defaultRenderer) {
    _defaultRenderer = new HttpRenderer("/api/render", {
      type: "ssr",
      entryPoint: "/api/render",
    });
  }
  return _defaultRenderer;
}

export const ReactVideoEditorProvider: React.FC<ReactVideoEditorProviderProps> = ({
  children,
  projectId,
  defaultTracks,
  defaultClips,
  defaultAspectRatio,
  defaultResolution,
  defaultBackgroundColor,
  fps = 30,
  renderer,
  onSaving,
  onSaved,
  sidebarWidth = "16rem",
  sidebarIconWidth = "3rem",
  isLoadingProject = false,
  skipInitialLoad = false,
  wizardData,
  playerRef,
  baseUrl,
  adaptors,
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
  availableThemes = [],
  selectedTheme,
  onThemeChange,
  showDefaultThemes = true,
  hideThemeToggle = false,
  defaultTheme = 'dark',
}) => {
  return (
    <UISidebarProvider
      contained={true}
      defaultOpen={false}
      style={{
          "--sidebar-width": sidebarWidth,
          "--sidebar-width-icon": sidebarIconWidth,
      } as React.CSSProperties}
    >
      <RendererProvider config={{ renderer: renderer ?? getDefaultRenderer() }}>
        <MediaAdaptorProvider adaptors={adaptors || {}}>
          <ThemeProvider config={{
            availableThemes,
            selectedTheme,
            onThemeChange,
            showDefaultThemes,
            hideThemeToggle,
            defaultTheme,
          }}>
            <EditorProvider
              projectId={projectId}
              defaultTracks={defaultTracks}
              defaultClips={defaultClips}
              defaultAspectRatio={defaultAspectRatio}
              defaultResolution={defaultResolution}
              defaultBackgroundColor={defaultBackgroundColor}
              fps={fps}
              isLoadingProject={isLoadingProject}
              skipInitialLoad={skipInitialLoad}
              wizardData={wizardData}
              onSaving={onSaving}
              onSaved={onSaved}
              playerRef={playerRef}
              baseUrl={baseUrl}
              initialRows={initialRows}
              maxRows={maxRows}
              zoomConstraints={zoomConstraints}
              snappingConfig={snappingConfig}
              disableMobileLayout={disableMobileLayout}
              disableVideoKeyframes={disableVideoKeyframes}
              enablePushOnDrag={enablePushOnDrag}
              videoWidth={videoWidth}
              videoHeight={videoHeight}
            >
                <LocalMediaProvider>
                      <EditorSidebarProvider>
                        <ToolProvider>
                          {children}
                        </ToolProvider>
                      </EditorSidebarProvider>
                </LocalMediaProvider>
            </EditorProvider>
          </ThemeProvider>
        </MediaAdaptorProvider>
      </RendererProvider>
    </UISidebarProvider>
  );
}; 
