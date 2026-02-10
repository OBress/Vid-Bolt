/**
 * Editor V2 - Professional Video Editor Layout
 * 
 * New three-panel layout inspired by Premiere Pro, DaVinci Resolve, and Figma:
 * - Left: Asset Manager (media browser)
 * - Center: Canvas with toolbar
 * - Right: Inspector Panel (properties)
 * 
 * This is the new editor replacing the legacy dual-sidebar approach.
 */

import React, { useCallback, useEffect } from "react";
import { EditorLayout } from "../layout/editor-layout";
import { EditorHeader, EditorHeaderProps } from "./editor-header";
import { useEditorShortcuts } from "../../hooks/use-editor-shortcuts";
import { useFontPreloader } from "../../hooks/use-font-preloader";
import { CompositionEditor } from "../composition-editor/composition-editor";
import { useCompositionEditorStore } from "../../stores/composition-editor-store";
import { useVideoEditorStore } from "../../stores/video-editor-store";
import type { CompositionDefinition } from "../../types/composition";
import { validateComposition, validateAndFixComposition } from "../../utils/composition-validator";
import { preloadBabelWorker } from "../../utils/remotion-compiler";

export interface EditorV2Props extends EditorHeaderProps {
  /** Whether to hide the theme toggle dropdown */
  hideThemeToggle?: boolean;
  /** Default theme to use when theme toggle is hidden */
  defaultTheme?: string;
  /** Whether to enable mobile layout (otherwise shows warning) */
  enableMobileLayout?: boolean;
}

/**
 * EditorV2 Component
 * 
 * The main editor interface with professional three-panel layout.
 * Uses the new EditorLayout system with Asset Manager and Inspector panels.
 */
export const EditorV2: React.FC<EditorV2Props> = ({
  projectTitle,
  availableThemes,
  selectedTheme,
  onThemeChange,
  showDefaultThemes,
  hideThemeToggle,
  defaultTheme,
  enableMobileLayout = false,
}) => {
  // Enable global undo/redo keyboard shortcuts (Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y)
  useEditorShortcuts();

  // Preload all fonts used in text clips on page load
  useFontPreloader();

  // Preload Babel compiler in background for motion graphics
  // This loads Babel via Web Worker during idle time, so it's ready when needed
  useEffect(() => {
    preloadBabelWorker();
  }, []);

  // Composition editor store state
  const compositionEditorOpen = useCompositionEditorStore((state) => state.isOpen);
  const sourceClipId = useCompositionEditorStore((state) => state.sourceClipId);
  
  // Video editor store - get clips array and updateClip action
  const clips = useVideoEditorStore((state) => state.clips);
  const updateClip = useVideoEditorStore((state) => state.updateClip);

  // Handle save from composition editor
  const handleCompositionSave = useCallback((compositionData: CompositionDefinition) => {
    if (!sourceClipId) return;

    // Get the original clip from the clips Record
    const clip = clips[sourceClipId];
    if (!clip || clip.type !== 'motion-graphics') return;

    // Validate the composition
    const validation = validateComposition(compositionData);
    
    if (!validation.valid) {
      console.warn('[EditorV2] Composition validation errors:', validation.errors);
      // Fix any issues and continue saving
    }
    
    if (validation.warnings.length > 0) {
      console.warn('[EditorV2] Composition validation warnings:', validation.warnings);
    }
    
    // Apply fixes and ensure data integrity
    const fixedComposition = validateAndFixComposition(compositionData);

    // Update the clip with the validated composition definition
    updateClip(sourceClipId, {
      properties: {
        ...clip.properties,
        compositionDefinition: fixedComposition,
      },
    });
  }, [sourceClipId, clips, updateClip]);

  return (
    <>
      <EditorLayout
        enableMobileLayout={enableMobileLayout}
        header={
          <EditorHeader
            projectTitle={projectTitle}
            availableThemes={availableThemes}
            selectedTheme={selectedTheme}
            onThemeChange={onThemeChange}
            showDefaultThemes={showDefaultThemes}
            hideThemeToggle={hideThemeToggle}
            defaultTheme={defaultTheme}
          />
        }
      />

      {/* Composition Editor Overlay */}
      {compositionEditorOpen && (
        <CompositionEditor
          onSave={handleCompositionSave}
        />
      )}
    </>
  );
};

export default EditorV2;
