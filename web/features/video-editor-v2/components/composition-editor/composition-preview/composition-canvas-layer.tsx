/**
 * CompositionCanvasLayer - Interactive canvas layer for the composition editor
 * 
 * Allows clicking on elements to select layers, showing selection outlines,
 * and eventually transforming elements (move, resize, rotate).
 * 
 * Similar to the video editor's CanvasInteractionLayer but specifically
 * for composition editing.
 */

import React, { useCallback, useRef, useMemo, useEffect, useState } from "react";
import { useCompositionEditorStore } from "../../../stores/composition-editor-store";
import type { CompositionLayer } from "../../../types/composition";
import { cn } from "../../../utils/general/utils";

// ==========================================
// DRAG STATE
// ==========================================

interface DragState {
  isDragging: boolean;
  layerId: string | null;
  startX: number;
  startY: number;
  startLayerX: number;
  startLayerY: number;
}

// ==========================================
// TYPES
// ==========================================

interface CompositionCanvasLayerProps {
  /** Canvas dimensions from the composition */
  canvasWidth: number;
  canvasHeight: number;
  /** The rendered container dimensions */
  containerWidth: number;
  containerHeight: number;
  /** Current playback frame */
  currentFrame: number;
  /** Whether to show all layer bounds (not just selected) */
  showAllBounds?: boolean;
  /** Children (the actual Remotion player content) */
  children?: React.ReactNode;
}

// ==========================================
// HELPER: CHECK IF POINT IS IN LAYER BOUNDS
// ==========================================

/**
 * Check if a point (in canvas coordinates) is within a layer's bounds
 */
function isPointInLayer(
  x: number,
  y: number,
  layer: CompositionLayer,
  currentFrame: number
): boolean {
  // Check if layer is visible at current frame
  if (!layer.visible) return false;
  if (currentFrame < layer.startTime || currentFrame >= layer.startTime + layer.duration) {
    return false;
  }

  const transform = layer.transform;
  
  // Get layer dimensions based on type
  let layerWidth = 0;
  let layerHeight = 0;
  
  if (layer.type === 'text') {
    const props = layer.layerProperties?.properties as any;
    // Estimate text dimensions based on font size
    const fontSize = props?.fontSize || 48;
    const text = props?.text || '';
    layerWidth = Math.max(100, text.length * fontSize * 0.6);
    layerHeight = fontSize * (props?.lineHeight || 1.2);
  } else if (layer.type === 'shape') {
    const props = layer.layerProperties?.properties as any;
    layerWidth = props?.width || 100;
    layerHeight = props?.height || 100;
  } else if (layer.type === 'solid') {
    const props = layer.layerProperties?.properties as any;
    layerWidth = props?.width || 1920;
    layerHeight = props?.height || 1080;
  } else {
    // Default size for unknown types
    layerWidth = 100;
    layerHeight = 100;
  }

  // Apply scale
  layerWidth *= transform.scaleX;
  layerHeight *= transform.scaleY;

  // Calculate bounds considering anchor point
  const anchorX = transform.anchorX ?? 0.5;
  const anchorY = transform.anchorY ?? 0.5;
  
  const left = transform.x - layerWidth * anchorX;
  const top = transform.y - layerHeight * anchorY;
  const right = left + layerWidth;
  const bottom = top + layerHeight;

  // Simple bounding box check (ignoring rotation for now)
  return x >= left && x <= right && y >= top && y <= bottom;
}

// ==========================================
// COMPONENT
// ==========================================

export const CompositionCanvasLayer: React.FC<CompositionCanvasLayerProps> = ({
  canvasWidth,
  canvasHeight,
  containerWidth,
  containerHeight,
  currentFrame,
  showAllBounds = true, // Default to showing all bounds for better UX
  children,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Drag state
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    layerId: null,
    startX: 0,
    startY: 0,
    startLayerX: 0,
    startLayerY: 0,
  });

  // Store state
  const composition = useCompositionEditorStore((state) => state.composition);
  const selection = useCompositionEditorStore((state) => state.selection);
  const selectLayers = useCompositionEditorStore((state) => state.selectLayers);
  const updateLayerTransform = useCompositionEditorStore((state) => state.updateLayerTransform);

  // Calculate canvas transform (same logic as video editor)
  const canvasTransform = useMemo(() => {
    const aspectRatio = canvasWidth / canvasHeight;
    const containerAspect = containerWidth / containerHeight;

    let renderWidth: number;
    let renderHeight: number;
    let offsetX: number;
    let offsetY: number;

    if (containerAspect > aspectRatio) {
      renderHeight = containerHeight;
      renderWidth = renderHeight * aspectRatio;
      offsetX = (containerWidth - renderWidth) / 2;
      offsetY = 0;
    } else {
      renderWidth = containerWidth;
      renderHeight = renderWidth / aspectRatio;
      offsetX = 0;
      offsetY = (containerHeight - renderHeight) / 2;
    }

    const scaleX = renderWidth / canvasWidth;
    const scaleY = renderHeight / canvasHeight;

    return { offsetX, offsetY, scaleX, scaleY, renderWidth, renderHeight };
  }, [canvasWidth, canvasHeight, containerWidth, containerHeight]);

  // Convert screen coordinates to canvas coordinates
  const screenToCanvas = useCallback(
    (screenX: number, screenY: number): { x: number; y: number } | null => {
      if (!containerRef.current) return null;

      const rect = containerRef.current.getBoundingClientRect();
      const relativeX = screenX - rect.left - canvasTransform.offsetX;
      const relativeY = screenY - rect.top - canvasTransform.offsetY;

      const canvasX = relativeX / canvasTransform.scaleX;
      const canvasY = relativeY / canvasTransform.scaleY;

      return { x: canvasX, y: canvasY };
    },
    [canvasTransform]
  );

  // Handle mouse down - start drag or select
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!composition) return;
      
      // Only handle left mouse button
      if (e.button !== 0) return;

      const canvasCoords = screenToCanvas(e.clientX, e.clientY);
      if (!canvasCoords) return;

      // Check layers from top to bottom (last in array to first)
      const layers = [...composition.layers].reverse();
      const clickedLayer = layers.find((layer) =>
        isPointInLayer(canvasCoords.x, canvasCoords.y, layer, currentFrame)
      );

      if (clickedLayer) {
        // Select the layer (with multi-select if Ctrl/Cmd/Shift is held)
        const addToSelection = e.ctrlKey || e.metaKey || e.shiftKey;
        if (!selection.layerIds.includes(clickedLayer.id)) {
          selectLayers([clickedLayer.id], addToSelection);
        }
        
        // Start drag
        setDragState({
          isDragging: true,
          layerId: clickedLayer.id,
          startX: e.clientX,
          startY: e.clientY,
          startLayerX: clickedLayer.transform.x,
          startLayerY: clickedLayer.transform.y,
        });
        
        e.preventDefault();
        console.log('[CompositionCanvasLayer] Started drag:', clickedLayer.name);
      } else {
        // Clicked on empty space - clear selection if not holding modifier
        if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
          selectLayers([]);
        }
      }
    },
    [composition, currentFrame, screenToCanvas, selectLayers, selection.layerIds]
  );

  // Handle mouse move - drag layer
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragState.isDragging || !dragState.layerId) return;
      
      // Calculate delta in screen coordinates
      const deltaScreenX = e.clientX - dragState.startX;
      const deltaScreenY = e.clientY - dragState.startY;
      
      // Convert to canvas coordinates
      const deltaCanvasX = deltaScreenX / canvasTransform.scaleX;
      const deltaCanvasY = deltaScreenY / canvasTransform.scaleY;
      
      // Calculate new position
      const newX = dragState.startLayerX + deltaCanvasX;
      const newY = dragState.startLayerY + deltaCanvasY;
      
      // Update layer transform
      updateLayerTransform(dragState.layerId, {
        x: Math.round(newX),
        y: Math.round(newY),
      });
    },
    [dragState, canvasTransform, updateLayerTransform]
  );

  // Handle mouse up - end drag
  const handleMouseUp = useCallback(() => {
    if (dragState.isDragging) {
      console.log('[CompositionCanvasLayer] Ended drag');
      setDragState({
        isDragging: false,
        layerId: null,
        startX: 0,
        startY: 0,
        startLayerX: 0,
        startLayerY: 0,
      });
    }
  }, [dragState.isDragging]);

  // Handle mouse leave - also end drag
  const handleMouseLeave = useCallback(() => {
    if (dragState.isDragging) {
      handleMouseUp();
    }
  }, [dragState.isDragging, handleMouseUp]);

  // Global mouse up listener for drag ending outside container
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (dragState.isDragging) {
        handleMouseUp();
      }
    };
    
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [dragState.isDragging, handleMouseUp]);

  // Helper function to get layer dimensions
  const getLayerDimensions = useCallback((layer: CompositionLayer) => {
    let layerWidth = 0;
    let layerHeight = 0;

    if (layer.type === 'text') {
      const props = layer.layerProperties?.properties as any;
      const fontSize = props?.fontSize || 48;
      const text = props?.text || '';
      layerWidth = Math.max(100, text.length * fontSize * 0.6);
      layerHeight = fontSize * (props?.lineHeight || 1.2);
    } else if (layer.type === 'shape') {
      const props = layer.layerProperties?.properties as any;
      layerWidth = props?.width || 100;
      layerHeight = props?.height || 100;
    } else if (layer.type === 'solid') {
      const props = layer.layerProperties?.properties as any;
      layerWidth = props?.width || 1920;
      layerHeight = props?.height || 1080;
    } else {
      layerWidth = 100;
      layerHeight = 100;
    }

    return { width: layerWidth, height: layerHeight };
  }, []);

  // Calculate bounds for ALL visible layers (for showing clickable areas)
  const allLayerBounds = useMemo(() => {
    if (!composition || !showAllBounds) return [];

    return composition.layers
      .map((layer) => {
        const isVisibleAtFrame = 
          layer.visible && 
          currentFrame >= layer.startTime && 
          currentFrame < layer.startTime + layer.duration;

        // Only show bounds for layers visible at current frame
        if (!isVisibleAtFrame) return null;

        const transform = layer.transform;
        const { width: layerWidth, height: layerHeight } = getLayerDimensions(layer);

        const scaledWidth = layerWidth * transform.scaleX;
        const scaledHeight = layerHeight * transform.scaleY;

        const anchorX = transform.anchorX ?? 0.5;
        const anchorY = transform.anchorY ?? 0.5;

        const left = transform.x - scaledWidth * anchorX;
        const top = transform.y - scaledHeight * anchorY;

        const screenLeft = left * canvasTransform.scaleX + canvasTransform.offsetX;
        const screenTop = top * canvasTransform.scaleY + canvasTransform.offsetY;
        const screenWidth = scaledWidth * canvasTransform.scaleX;
        const screenHeight = scaledHeight * canvasTransform.scaleY;

        const isSelected = selection.layerIds.includes(layer.id);

        return {
          layerId: layer.id,
          layerName: layer.name,
          layerType: layer.type,
          left: screenLeft,
          top: screenTop,
          width: screenWidth,
          height: screenHeight,
          color: layer.color || '#A855F7',
          isSelected,
        };
      })
      .filter(Boolean);
  }, [composition, showAllBounds, currentFrame, canvasTransform, getLayerDimensions, selection.layerIds]);

  // Calculate selection outlines for selected layers (with full controls)
  const selectionOutlines = useMemo(() => {
    if (!composition || selection.layerIds.length === 0) return [];

    return selection.layerIds
      .map((layerId) => {
        const layer = composition.layers.find((l) => l.id === layerId);
        if (!layer) return null;
        
        // Show selection outline even if layer is not visible at current frame
        // (but dim it to indicate it's not currently visible)
        const isVisibleAtFrame = 
          layer.visible && 
          currentFrame >= layer.startTime && 
          currentFrame < layer.startTime + layer.duration;

        const transform = layer.transform;

        // Get layer dimensions
        const { width: layerWidth, height: layerHeight } = getLayerDimensions(layer);

        // Apply scale
        const scaledWidth = layerWidth * transform.scaleX;
        const scaledHeight = layerHeight * transform.scaleY;

        // Calculate bounds
        const anchorX = transform.anchorX ?? 0.5;
        const anchorY = transform.anchorY ?? 0.5;

        const left = transform.x - scaledWidth * anchorX;
        const top = transform.y - scaledHeight * anchorY;

        // Convert to screen coordinates
        const screenLeft = left * canvasTransform.scaleX + canvasTransform.offsetX;
        const screenTop = top * canvasTransform.scaleY + canvasTransform.offsetY;
        const screenWidth = scaledWidth * canvasTransform.scaleX;
        const screenHeight = scaledHeight * canvasTransform.scaleY;

        return {
          layerId: layer.id,
          layerName: layer.name,
          layerType: layer.type,
          left: screenLeft,
          top: screenTop,
          width: screenWidth,
          height: screenHeight,
          color: layer.color || '#A855F7',
          isVisibleAtFrame,
        };
      })
      .filter(Boolean);
  }, [composition, selection.layerIds, currentFrame, canvasTransform, getLayerDimensions]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "absolute inset-0",
        "transition-opacity",
        dragState.isDragging ? "cursor-grabbing" : "cursor-default"
      )}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      style={{
        pointerEvents: 'auto',
      }}
    >
      {/* Canvas content */}
      {children}

      {/* All layer bounds (subtle hover indicators for non-selected layers) */}
      {allLayerBounds.map((bound: any) => !bound.isSelected && (
        <div
          key={`bound-${bound.layerId}`}
          className="absolute transition-opacity hover:opacity-100"
          style={{
            left: bound.left,
            top: bound.top,
            width: bound.width,
            height: bound.height,
            pointerEvents: 'auto',
            cursor: 'grab',
            opacity: 0.3,
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
            const layer = composition?.layers.find(l => l.id === bound.layerId);
            if (!layer) return;
            
            const addToSelection = e.ctrlKey || e.metaKey || e.shiftKey;
            selectLayers([bound.layerId], addToSelection);
            
            // Start drag
            setDragState({
              isDragging: true,
              layerId: bound.layerId,
              startX: e.clientX,
              startY: e.clientY,
              startLayerX: layer.transform.x,
              startLayerY: layer.transform.y,
            });
          }}
        >
          {/* Subtle border on hover */}
          <div
            className="absolute inset-0"
            style={{
              border: `1px dashed ${bound.color}`,
              borderRadius: 2,
            }}
          />
          {/* Layer name tooltip on hover */}
          <div
            className="absolute -top-5 left-0 px-1.5 py-0.5 text-[9px] font-medium text-white rounded shadow-lg whitespace-nowrap opacity-0 hover:opacity-100 transition-opacity"
            style={{
              backgroundColor: 'rgba(0,0,0,0.75)',
            }}
          >
            {bound.layerName}
          </div>
        </div>
      ))}

      {/* Selection outlines and transform controls */}
      {selectionOutlines.map((outline: any) => (
        <div
          key={outline.layerId}
          className={cn(
            "absolute transition-opacity",
            !outline.isVisibleAtFrame && "opacity-40",
            dragState.isDragging && dragState.layerId === outline.layerId ? "cursor-grabbing" : "cursor-grab"
          )}
          style={{
            left: outline.left,
            top: outline.top,
            width: outline.width,
            height: outline.height,
            pointerEvents: 'auto',
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
            const layer = composition?.layers.find(l => l.id === outline.layerId);
            if (!layer) return;
            
            // Start drag
            setDragState({
              isDragging: true,
              layerId: outline.layerId,
              startX: e.clientX,
              startY: e.clientY,
              startLayerX: layer.transform.x,
              startLayerY: layer.transform.y,
            });
          }}
        >
          {/* Main selection border */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              border: `2px solid ${outline.color}`,
              boxShadow: `0 0 0 1px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.2)`,
              borderRadius: 1,
            }}
          />

          {/* Layer name label */}
          <div
            className="absolute -top-6 left-0 px-2 py-0.5 text-[10px] font-semibold text-white rounded shadow-lg"
            style={{
              backgroundColor: outline.color,
              whiteSpace: 'nowrap',
            }}
          >
            {outline.layerName}
            {!outline.isVisibleAtFrame && (
              <span className="ml-1 opacity-60">(hidden at this frame)</span>
            )}
          </div>

          {/* Type indicator badge */}
          <div
            className="absolute -top-6 right-0 px-1.5 py-0.5 text-[9px] font-medium text-white rounded shadow-lg uppercase"
            style={{
              backgroundColor: 'rgba(0,0,0,0.7)',
              whiteSpace: 'nowrap',
            }}
          >
            {outline.layerType}
          </div>

          {/* Corner transform handles */}
          {[
            { x: -5, y: -5, cursor: 'nwse-resize', position: 'top-left' },
            { x: outline.width - 3, y: -5, cursor: 'nesw-resize', position: 'top-right' },
            { x: -5, y: outline.height - 3, cursor: 'nesw-resize', position: 'bottom-left' },
            { x: outline.width - 3, y: outline.height - 3, cursor: 'nwse-resize', position: 'bottom-right' },
          ].map((handle, i) => (
            <div
              key={`corner-${i}`}
              className="absolute w-2 h-2 rounded-sm shadow-lg"
              style={{
                left: handle.x,
                top: handle.y,
                backgroundColor: '#FFFFFF',
                border: `1.5px solid ${outline.color}`,
                cursor: handle.cursor,
                pointerEvents: 'auto',
              }}
              title={`Resize: ${handle.position}`}
            />
          ))}

          {/* Edge handles (middle of each side) */}
          {[
            { x: outline.width / 2 - 4, y: -5, cursor: 'ns-resize', position: 'top' },
            { x: outline.width / 2 - 4, y: outline.height - 3, cursor: 'ns-resize', position: 'bottom' },
            { x: -5, y: outline.height / 2 - 4, cursor: 'ew-resize', position: 'left' },
            { x: outline.width - 3, y: outline.height / 2 - 4, cursor: 'ew-resize', position: 'right' },
          ].map((handle, i) => (
            <div
              key={`edge-${i}`}
              className="absolute w-2 h-2 rounded-sm shadow-lg"
              style={{
                left: handle.x,
                top: handle.y,
                backgroundColor: '#FFFFFF',
                border: `1.5px solid ${outline.color}`,
                cursor: handle.cursor,
                pointerEvents: 'auto',
              }}
              title={`Resize: ${handle.position}`}
            />
          ))}

          {/* Anchor point indicator */}
          <div
            className="absolute w-1.5 h-1.5 rounded-full shadow-lg"
            style={{
              left: outline.width * 0.5 - 3,
              top: outline.height * 0.5 - 3,
              backgroundColor: outline.color,
              border: '1.5px solid white',
            }}
            title="Anchor Point"
          />
        </div>
      ))}
    </div>
  );
};

export default CompositionCanvasLayer;
