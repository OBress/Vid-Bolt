/**
 * ReactVideoEditorV2 - Professional Video Editor Entry Point
 * 
 * Uses the three-panel layout system:
 * - Asset Manager (left)
 * - Canvas with Toolbar (center)
 * - Inspector Panel (right)
 */

import React, { useState, useRef } from "react";
import { PlayerRef } from "@remotion/player";

import { EditorV2 } from "./core/editor-v2";
import { VideoPlayer } from "./core/video-player";
import { ReactVideoEditorProvider, ReactVideoEditorProviderProps } from "./providers/react-video-editor-provider";
import { CustomTheme } from "../hooks/use-extended-theme-switcher";

export interface ReactVideoEditorV2Props extends Omit<ReactVideoEditorProviderProps, 'children'> {
  className?: string;
  /** Project title to display in the header */
  projectTitle?: string;
  /** Array of available custom themes for the theme dropdown */
  availableThemes?: CustomTheme[];
  /** Current selected theme */
  selectedTheme?: string;
  /** Callback when theme is changed */
  onThemeChange?: (themeId: string) => void;
  /** Whether to show the default light/dark themes */
  showDefaultThemes?: boolean;
  /** Whether to hide the theme toggle dropdown */
  hideThemeToggle?: boolean;
  /** Default theme to use when theme toggle is hidden */
  defaultTheme?: string;
  /** Whether to render in player-only mode (no editor UI) */
  isPlayerOnly?: boolean;
  /** Whether to enable mobile layout */
  enableMobileLayout?: boolean;
}

export const ReactVideoEditorV2: React.FC<ReactVideoEditorV2Props> = ({
  className,
  projectTitle,
  availableThemes = [],
  selectedTheme,
  onThemeChange,
  showDefaultThemes = true,
  hideThemeToggle = false,
  defaultTheme = 'dark',
  onSaving,
  onSaved,
  isPlayerOnly = false,
  enableMobileLayout = false,
  ...providerProps
}) => {
  const playerRef = useRef<PlayerRef>(null);

  const handleSaving = (saving: boolean) => {
    onSaving?.(saving);
  };

  const handleSaved = (timestamp: number) => {
    onSaved?.(timestamp);
  };

  return (
    <ReactVideoEditorProvider
      {...providerProps}
      onSaving={handleSaving}
      onSaved={handleSaved}
      playerRef={playerRef as any}
    >
      {isPlayerOnly ? (
        // Player-only mode: Simple fullscreen video player
        <div 
          className="w-full bg-black flex items-center justify-center"
          style={{
            height: "calc(var(--vh, 1vh) * 100)",
            maxHeight: "-webkit-fill-available",
          }}
        >
          <VideoPlayer playerRef={playerRef} isPlayerOnly={true} />
        </div>
      ) : (
        // Editor mode: Professional three-panel layout
        <div className={`h-full w-full flex flex-col ${className || ''}`}>
          <EditorV2
            projectTitle={projectTitle}
            availableThemes={availableThemes}
            selectedTheme={selectedTheme}
            onThemeChange={onThemeChange}
            showDefaultThemes={showDefaultThemes}
            hideThemeToggle={hideThemeToggle}
            defaultTheme={defaultTheme}
            enableMobileLayout={enableMobileLayout}
          />
        </div>
      )}
    </ReactVideoEditorProvider>
  );
};

export default ReactVideoEditorV2;
