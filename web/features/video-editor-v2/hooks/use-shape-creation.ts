/**
 * useShapeCreation Hook
 * 
 * Handles shape creation on the canvas when shape tools are active.
 * Manages mouse/touch events for drawing shapes via click-drag.
 * 
 * Uses Timeline V2 clip-based API
 */

import { useCallback } from "react";
import { useVideoEditorStore } from "../stores/video-editor-store";
import { useToolContext } from "../contexts/tool-context";
import { ToolType, SHAPE_TOOLS } from "../types/tools";

// ==========================================
// TYPES
// ==========================================

interface ShapeCreationResult {
  /** Start shape creation at a point */
  handleMouseDown: (e: React.MouseEvent, canvasRect: DOMRect) => void;
  /** Update shape during drag */
  handleMouseMove: (e: React.MouseEvent, canvasRect: DOMRect) => void;
  /** Finish shape creation */
  handleMouseUp: () => void;
  /** Cancel shape creation */
  handleCancel: () => void;
  /** Whether currently creating a shape */
  isCreating: boolean;
  /** Preview bounds for the shape being created */
  previewBounds: { x: number; y: number; width: number; height: number } | null;
  /** The shape type being created */
  shapeType: ToolType | null;
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Get composition dimensions based on aspect ratio and resolution
 */
const getCompositionDimensions = () => {
  const state = useVideoEditorStore.getState();
  const aspectRatio = state.aspectRatio || '16:9';
  const resolution = state.resolution || '1080p';
  
  const resolutionHeights: Record<string, number> = {
    '720p': 720,
    '1080p': 1080,
    '1440p': 1440,
    '4k': 2160,
  };
  
  const aspectRatios: Record<string, number> = {
    '16:9': 16/9,
    '9:16': 9/16,
    '1:1': 1,
    '4:5': 4/5,
  };
  
  const height = resolutionHeights[resolution] || 1080;
  const ratio = aspectRatios[aspectRatio] || 16/9;
  const width = Math.round(height * ratio);
  
  return { width, height };
};

/**
 * Ensure a video track exists, create one if needed
 */
const ensureVideoTrack = (): string => {
  const state = useVideoEditorStore.getState();
  const videoTrack = state.tracks.find(t => t.type === 'video');
  
  if (videoTrack) {
    return videoTrack.id;
  }
  
  // Create a new video track
  return state.addTrack('video');
};

// ==========================================
// HOOK
// ==========================================

export function useShapeCreation(): ShapeCreationResult {
  // Get store actions and state
  const addClip = useVideoEditorStore(s => s.addClip);
  const currentTime = useVideoEditorStore(s => s.playback?.currentTime || 0);
  const selectClip = useVideoEditorStore(s => s.selectClip);

  const {
    activeTool,
    toolState,
    shapeOptions,
    startDrawing,
    updateDrawing,
    endDrawing,
    cancelDrawing,
    drawBounds,
    resetToSelect,
  } = useToolContext();

  /**
   * Convert screen coordinates to canvas coordinates (composition pixels)
   */
  const screenToCanvas = useCallback((
    clientX: number,
    clientY: number,
    canvasRect: DOMRect
  ): { x: number; y: number } => {
    const { width: canvasWidth, height: canvasHeight } = getCompositionDimensions();
    
    // Calculate the actual rendered size within the canvas rect
    const aspectRatio = canvasWidth / canvasHeight;
    const containerAspect = canvasRect.width / canvasRect.height;
    
    let renderWidth: number;
    let renderHeight: number;
    let offsetX: number;
    let offsetY: number;
    
    if (containerAspect > aspectRatio) {
      // Container is wider - fit to height
      renderHeight = canvasRect.height;
      renderWidth = renderHeight * aspectRatio;
      offsetX = (canvasRect.width - renderWidth) / 2;
      offsetY = 0;
    } else {
      // Container is taller - fit to width
      renderWidth = canvasRect.width;
      renderHeight = renderWidth / aspectRatio;
      offsetX = 0;
      offsetY = (canvasRect.height - renderHeight) / 2;
    }
    
    // Convert to canvas coordinates (in pixels, relative to composition)
    const relativeX = clientX - canvasRect.left - offsetX;
    const relativeY = clientY - canvasRect.top - offsetY;
    
    const x = (relativeX / renderWidth) * canvasWidth;
    const y = (relativeY / renderHeight) * canvasHeight;
    
    return { x: Math.round(x), y: Math.round(y) };
  }, []);

  /**
   * Create the actual shape clip
   */
  const createShape = useCallback(() => {
    if (!drawBounds || drawBounds.width < 5 || drawBounds.height < 5) {
      // Too small to be a meaningful shape
      return;
    }

    // Ensure we have a video track
    const trackId = ensureVideoTrack();
    
    // Determine shape content based on tool type
    let shapeContent = "rectangle";
    switch (activeTool) {
      case ToolType.RECTANGLE:
        shapeContent = "rectangle";
        break;
      case ToolType.ELLIPSE:
        shapeContent = "ellipse";
        break;
      case ToolType.TRIANGLE:
        shapeContent = "triangle";
        break;
      case ToolType.LINE:
        shapeContent = "line";
        break;
    }

    // Create shape clip
    const clipId = addClip({
      trackId,
      startTime: currentTime,
      duration: 3, // 3 seconds
      type: 'shape',
      sourceId: '',
      label: `${shapeContent.charAt(0).toUpperCase()}${shapeContent.slice(1)}`,
      content: shapeContent,
      transform: {
        x: drawBounds.x,
        y: drawBounds.y,
        width: drawBounds.width,
        height: activeTool === ToolType.LINE ? 4 : drawBounds.height, // Lines have fixed height
        rotation: 0,
        opacity: 1,
        zIndex: 100,
      },
      data: {
        shapeType: shapeContent,
        fill: shapeOptions.fillEnabled ? shapeOptions.fillColor : "#3b82f6",
        stroke: shapeOptions.strokeEnabled ? shapeOptions.strokeColor : undefined,
        strokeWidth: shapeOptions.strokeEnabled ? shapeOptions.strokeWidth : 0,
      },
      styles: {
        fill: shapeOptions.fillEnabled ? shapeOptions.fillColor : "#3b82f6",
        stroke: shapeOptions.strokeEnabled ? shapeOptions.strokeColor : undefined,
        strokeWidth: shapeOptions.strokeEnabled ? shapeOptions.strokeWidth : 0,
      },
    });
    
    // Select the newly created clip
    if (clipId) {
      selectClip(clipId);
    }
    
    // After creating, switch back to select tool
    resetToSelect();
  }, [
    drawBounds,
    activeTool,
    currentTime,
    shapeOptions,
    addClip,
    selectClip,
    resetToSelect,
  ]);

  /**
   * Handle mouse down - start shape creation
   */
  const handleMouseDown = useCallback((e: React.MouseEvent, canvasRect: DOMRect) => {
    if (!SHAPE_TOOLS.includes(activeTool)) return;
    
    const { x, y } = screenToCanvas(e.clientX, e.clientY, canvasRect);
    startDrawing(x, y);
  }, [activeTool, screenToCanvas, startDrawing]);

  /**
   * Handle mouse move - update shape preview
   */
  const handleMouseMove = useCallback((e: React.MouseEvent, canvasRect: DOMRect) => {
    if (!toolState.isDrawing) return;
    
    const { x, y } = screenToCanvas(e.clientX, e.clientY, canvasRect);
    updateDrawing(x, y);
  }, [toolState.isDrawing, screenToCanvas, updateDrawing]);

  /**
   * Handle mouse up - finish shape creation
   */
  const handleMouseUp = useCallback(() => {
    if (!toolState.isDrawing) return;
    
    createShape();
    endDrawing();
  }, [toolState.isDrawing, createShape, endDrawing]);

  /**
   * Handle cancel
   */
  const handleCancel = useCallback(() => {
    cancelDrawing();
  }, [cancelDrawing]);

  // Check if we're in a shape tool mode
  const isShapeTool = SHAPE_TOOLS.includes(activeTool);

  return {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleCancel,
    isCreating: toolState.isDrawing && isShapeTool,
    previewBounds: isShapeTool ? drawBounds : null,
    shapeType: isShapeTool ? activeTool : null,
  };
}

export default useShapeCreation;
