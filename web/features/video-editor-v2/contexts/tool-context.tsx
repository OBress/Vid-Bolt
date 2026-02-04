/**
 * Tool Context
 * 
 * Manages the active tool state for the canvas toolbar.
 * Provides tool selection, keyboard shortcuts, and tool options.
 */

import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from "react";
import {
  ToolType,
  ToolState,
  DEFAULT_TOOL_STATE,
  ShapeToolOptions,
  DEFAULT_SHAPE_OPTIONS,
  TextToolOptions,
  DEFAULT_TEXT_OPTIONS,
  TOOL_METADATA,
} from "../types/tools";

// ==========================================
// CONTEXT TYPE
// ==========================================

interface ToolContextType {
  // Tool State
  toolState: ToolState;
  activeTool: ToolType;
  
  // Tool Selection
  setActiveTool: (tool: ToolType) => void;
  resetToSelect: () => void;
  
  // Modifier Keys
  setShiftHeld: (held: boolean) => void;
  setAltHeld: (held: boolean) => void;
  
  // Drawing State
  startDrawing: (x: number, y: number) => void;
  updateDrawing: (x: number, y: number) => void;
  endDrawing: () => void;
  cancelDrawing: () => void;
  isDrawing: boolean;
  drawBounds: { x: number; y: number; width: number; height: number } | null;
  
  // Tool Options
  shapeOptions: ShapeToolOptions;
  setShapeOptions: (options: Partial<ShapeToolOptions>) => void;
  textOptions: TextToolOptions;
  setTextOptions: (options: Partial<TextToolOptions>) => void;
  
  // Temporary Tool Switching (e.g., holding space for hand tool)
  pushTemporaryTool: (tool: ToolType) => void;
  popTemporaryTool: () => void;
  
  // Cursor
  currentCursor: string;
}

// ==========================================
// CONTEXT
// ==========================================

const ToolContext = createContext<ToolContextType | undefined>(undefined);

// ==========================================
// PROVIDER
// ==========================================

interface ToolProviderProps {
  children: React.ReactNode;
}

export const ToolProvider: React.FC<ToolProviderProps> = ({ children }) => {
  const [toolState, setToolState] = useState<ToolState>(DEFAULT_TOOL_STATE);
  const [shapeOptions, setShapeOptionsState] = useState<ShapeToolOptions>(DEFAULT_SHAPE_OPTIONS);
  const [textOptions, setTextOptionsState] = useState<TextToolOptions>(DEFAULT_TEXT_OPTIONS);

  // Set active tool
  const setActiveTool = useCallback((tool: ToolType) => {
    setToolState(prev => ({
      ...prev,
      activeTool: tool,
      previousTool: null,
      // Reset drawing state when changing tools
      isDrawing: false,
      drawStart: null,
      drawCurrent: null,
    }));
  }, []);

  // Reset to select tool
  const resetToSelect = useCallback(() => {
    setActiveTool(ToolType.SELECT);
  }, [setActiveTool]);

  // Modifier keys
  const setShiftHeld = useCallback((held: boolean) => {
    setToolState(prev => ({ ...prev, shiftHeld: held }));
  }, []);

  const setAltHeld = useCallback((held: boolean) => {
    setToolState(prev => ({ ...prev, altHeld: held }));
  }, []);

  // Drawing operations
  const startDrawing = useCallback((x: number, y: number) => {
    setToolState(prev => ({
      ...prev,
      isDrawing: true,
      drawStart: { x, y },
      drawCurrent: { x, y },
    }));
  }, []);

  const updateDrawing = useCallback((x: number, y: number) => {
    setToolState(prev => {
      if (!prev.isDrawing) return prev;
      return {
        ...prev,
        drawCurrent: { x, y },
      };
    });
  }, []);

  const endDrawing = useCallback(() => {
    setToolState(prev => ({
      ...prev,
      isDrawing: false,
      drawStart: null,
      drawCurrent: null,
    }));
  }, []);

  const cancelDrawing = useCallback(() => {
    setToolState(prev => ({
      ...prev,
      isDrawing: false,
      drawStart: null,
      drawCurrent: null,
    }));
  }, []);

  // Calculate draw bounds from start and current positions
  const drawBounds = useMemo(() => {
    const { drawStart, drawCurrent, shiftHeld, altHeld } = toolState;
    if (!drawStart || !drawCurrent) return null;

    let x = Math.min(drawStart.x, drawCurrent.x);
    let y = Math.min(drawStart.y, drawCurrent.y);
    let width = Math.abs(drawCurrent.x - drawStart.x);
    let height = Math.abs(drawCurrent.y - drawStart.y);

    // Shift = constrain proportions (square/circle)
    if (shiftHeld) {
      const size = Math.max(width, height);
      width = size;
      height = size;
      // Adjust position if needed
      if (drawCurrent.x < drawStart.x) x = drawStart.x - size;
      if (drawCurrent.y < drawStart.y) y = drawStart.y - size;
    }

    // Alt = draw from center
    if (altHeld) {
      x = drawStart.x - width;
      y = drawStart.y - height;
      width *= 2;
      height *= 2;
    }

    return { x, y, width, height };
  }, [toolState]);

  // Temporary tool switching
  const pushTemporaryTool = useCallback((tool: ToolType) => {
    setToolState(prev => ({
      ...prev,
      previousTool: prev.activeTool,
      activeTool: tool,
    }));
  }, []);

  const popTemporaryTool = useCallback(() => {
    setToolState(prev => {
      if (!prev.previousTool) return prev;
      return {
        ...prev,
        activeTool: prev.previousTool,
        previousTool: null,
      };
    });
  }, []);

  // Tool options setters
  const setShapeOptions = useCallback((options: Partial<ShapeToolOptions>) => {
    setShapeOptionsState(prev => ({ ...prev, ...options }));
  }, []);

  const setTextOptions = useCallback((options: Partial<TextToolOptions>) => {
    setTextOptionsState(prev => ({ ...prev, ...options }));
  }, []);

  // Get current cursor based on tool and state
  const currentCursor = useMemo(() => {
    const { activeTool, isDrawing } = toolState;
    
    // Special cursors for drawing state
    if (isDrawing) {
      return 'crosshair';
    }
    
    // Hand tool has grabbing cursor when active
    if (activeTool === ToolType.HAND) {
      return 'grab';
    }
    
    return TOOL_METADATA[activeTool].cursor;
  }, [toolState]);

  // Keyboard shortcuts for tool selection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Track modifier keys
      if (e.key === 'Shift') setShiftHeld(true);
      if (e.key === 'Alt') setAltHeld(true);

      // Space for temporary hand tool
      if (e.key === ' ' && !e.repeat) {
        e.preventDefault();
        pushTemporaryTool(ToolType.HAND);
        return;
      }

      // Escape to cancel drawing or reset to select
      if (e.key === 'Escape') {
        if (toolState.isDrawing) {
          cancelDrawing();
        } else {
          resetToSelect();
        }
        return;
      }

      // Tool shortcuts
      const key = e.key.toLowerCase();
      switch (key) {
        case 'v':
          setActiveTool(ToolType.SELECT);
          break;
        case 't':
          setActiveTool(ToolType.TEXT);
          break;
        case 'r':
          setActiveTool(ToolType.RECTANGLE);
          break;
        case 'e':
        case 'o': // Legacy shortcut
          setActiveTool(ToolType.ELLIPSE);
          break;
        case 'l':
          setActiveTool(ToolType.LINE);
          break;
        case 'h':
          setActiveTool(ToolType.HAND);
          break;
        case 'z':
          setActiveTool(ToolType.ZOOM);
          break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Track modifier keys
      if (e.key === 'Shift') setShiftHeld(false);
      if (e.key === 'Alt') setAltHeld(false);

      // Space release to restore previous tool
      if (e.key === ' ') {
        popTemporaryTool();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [
    setActiveTool,
    setShiftHeld,
    setAltHeld,
    pushTemporaryTool,
    popTemporaryTool,
    cancelDrawing,
    resetToSelect,
    toolState.isDrawing,
  ]);

  // Memoize context value
  const value = useMemo<ToolContextType>(() => ({
    toolState,
    activeTool: toolState.activeTool,
    setActiveTool,
    resetToSelect,
    setShiftHeld,
    setAltHeld,
    startDrawing,
    updateDrawing,
    endDrawing,
    cancelDrawing,
    isDrawing: toolState.isDrawing,
    drawBounds,
    shapeOptions,
    setShapeOptions,
    textOptions,
    setTextOptions,
    pushTemporaryTool,
    popTemporaryTool,
    currentCursor,
  }), [
    toolState,
    setActiveTool,
    resetToSelect,
    setShiftHeld,
    setAltHeld,
    startDrawing,
    updateDrawing,
    endDrawing,
    cancelDrawing,
    drawBounds,
    shapeOptions,
    setShapeOptions,
    textOptions,
    setTextOptions,
    pushTemporaryTool,
    popTemporaryTool,
    currentCursor,
  ]);

  return (
    <ToolContext.Provider value={value}>
      {children}
    </ToolContext.Provider>
  );
};

// ==========================================
// HOOK
// ==========================================

export const useToolContext = (): ToolContextType => {
  const context = useContext(ToolContext);
  if (!context) {
    throw new Error("useToolContext must be used within a ToolProvider");
  }
  return context;
};

// Optional hook that returns undefined instead of throwing if not in provider
export const useToolContextOptional = (): ToolContextType | undefined => {
  return useContext(ToolContext);
};
