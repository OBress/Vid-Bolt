/**
 * CompositionEditor - After Effects Style Composition Editor
 * 
 * Full-screen editor for editing motion graphics compositions with:
 * - AI Chat Panel (left) for modifying the composition via natural language
 * - Composition Preview (center) with Remotion player
 * - Composition Inspector (right) for layer properties and animation
 * - Composition Timeline (bottom) showing all layers
 * 
 * This component opens as an overlay on top of the main video editor
 * when a user double-clicks a motion graphics clip.
 */

import React, { useEffect, useCallback, useRef } from "react";
import { cn } from "../../utils/general/utils";
import { useCompositionEditorStore } from "../../stores/composition-editor-store";
import { CompositionEditorLayout } from "./composition-editor-layout";
import { X, ChevronLeft, Save, Undo2, Redo2 } from "lucide-react";
import { Button } from "../ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";

// ==========================================
// TYPES
// ==========================================

export interface CompositionEditorProps {
  /** Callback when closing the editor */
  onClose?: () => void;
  /** Callback when saving changes */
  onSave?: (compositionData: any) => void;
}

// ==========================================
// COMPOSITION EDITOR HEADER
// ==========================================

interface CompositionEditorHeaderProps {
  compositionName: string;
  isDirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onClose: () => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

const CompositionEditorHeader: React.FC<CompositionEditorHeaderProps> = ({
  compositionName,
  isDirty,
  canUndo,
  canRedo,
  onClose,
  onSave,
  onUndo,
  onRedo,
}) => {
  return (
    <div className="h-12 bg-background border-b border-border flex items-center justify-between px-4 shrink-0">
      {/* Left: Back button and breadcrumb */}
      <div className="flex items-center gap-3">
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onClose}
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Back to Timeline (Esc)</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Timeline</span>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium text-purple-400">{compositionName}</span>
          {isDirty && (
            <span className="text-xs text-muted-foreground">(unsaved)</span>
          )}
        </div>
      </div>

      {/* Center: Title */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
        <div className="h-2 w-2 rounded-full bg-purple-500" />
        <span className="text-sm font-medium">Composition Editor</span>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={!canUndo}
                onClick={onUndo}
              >
                <Undo2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Undo (Ctrl+Z)</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={!canRedo}
                onClick={onRedo}
              >
                <Redo2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Redo (Ctrl+Shift+Z)</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <div className="w-px h-6 bg-border mx-1" />

        <Button
          variant="default"
          size="sm"
          className="h-8 bg-purple-600 hover:bg-purple-700"
          onClick={onSave}
        >
          <Save className="h-4 w-4 mr-1.5" />
          Save & Close
        </Button>

        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Close (Esc)</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
};

// ==========================================
// MAIN COMPONENT
// ==========================================

export const CompositionEditor: React.FC<CompositionEditorProps> = ({
  onClose,
  onSave,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Store state
  const isOpen = useCompositionEditorStore((state) => state.isOpen);
  const composition = useCompositionEditorStore((state) => state.composition);
  const isDirty = useCompositionEditorStore((state) => state.isDirty);
  const closeCompositionEditor = useCompositionEditorStore(
    (state) => state.closeCompositionEditor
  );
  
  // Undo/Redo
  const undo = useCompositionEditorStore((state) => state.undo);
  const redo = useCompositionEditorStore((state) => state.redo);
  const historyIndex = useCompositionEditorStore((state) => state.historyIndex);
  const historyLength = useCompositionEditorStore((state) => state.history.length);
  const canUndo = historyIndex > 0 && historyLength > 0;
  const canRedo = historyIndex < historyLength - 1;

  // Handle close
  const handleClose = useCallback(() => {
    if (isDirty) {
      // TODO: Show confirmation dialog
      const confirmed = window.confirm(
        "You have unsaved changes. Are you sure you want to close?"
      );
      if (!confirmed) return;
    }

    closeCompositionEditor();
    onClose?.();
  }, [isDirty, closeCompositionEditor, onClose]);

  // Handle save
  const handleSave = useCallback(() => {
    if (!composition) return;

    onSave?.(composition);
    closeCompositionEditor();
    onClose?.();
  }, [composition, onSave, closeCompositionEditor, onClose]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape to close
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
        return;
      }

      // Ctrl/Cmd + S to save
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
        return;
      }

      // Ctrl/Cmd + Z to undo
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }

      // Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y to redo
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleClose, handleSave, undo, redo]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Don't render if not open or no composition
  if (!isOpen || !composition) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "fixed inset-0 z-50 bg-background",
        "flex flex-col",
        "animate-in fade-in-0 zoom-in-95 duration-200"
      )}
    >
      {/* Header */}
      <CompositionEditorHeader
        compositionName={composition.name}
        isDirty={isDirty}
        canUndo={canUndo}
        canRedo={canRedo}
        onClose={handleClose}
        onSave={handleSave}
        onUndo={undo}
        onRedo={redo}
      />

      {/* Main Editor Layout */}
      <div className="flex-1 overflow-hidden">
        <CompositionEditorLayout />
      </div>
    </div>
  );
};

export default CompositionEditor;
