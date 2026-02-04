/**
 * LayerTrack - Main layer bar on the timeline (right side)
 * 
 * Shows the layer's time extent with:
 * - Colored bar based on layer type
 * - Smooth drag to move (uses local state during drag)
 * - Resize handles for in/out points
 * - Snapping to other layers, playhead, and seconds
 * - Visual snap indicators
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { cn } from '../../../../utils/general/utils';
import { AE_COLORS, TRACK_HEIGHT } from '../constants';
import type { CompositionLayer } from '../../../../types/composition';
import { getLayerTypeColor } from '../../../../types/composition';

// Snapping configuration
const SNAP_THRESHOLD_PX = 8; // Pixels threshold for snapping
const SNAP_TO_SECONDS = true;
const SNAP_TO_LAYERS = true;
const SNAP_TO_PLAYHEAD = true;

interface SnapPoint {
  frame: number;
  type: 'layer-start' | 'layer-end' | 'playhead' | 'second';
  layerId?: string;
}

interface LayerTrackProps {
  layer: CompositionLayer;
  pixelsPerFrame: number;
  scrollLeft: number;
  viewportWidth: number;
  isSelected: boolean;
  onSelect: (layerId: string, addToSelection: boolean) => void;
  onUpdateLayer: (layerId: string, updates: Partial<CompositionLayer>) => void;
  compositionDuration: number;
  fps?: number;
  currentFrame?: number;
  otherLayers?: CompositionLayer[];
  onSnapLineChange?: (snapLine: { x: number; visible: boolean } | null) => void;
}

export const LayerTrack = React.memo<LayerTrackProps>(({
  layer,
  pixelsPerFrame,
  scrollLeft,
  viewportWidth,
  isSelected,
  onSelect,
  onUpdateLayer,
  compositionDuration,
  fps = 30,
  currentFrame = 0,
  otherLayers = [],
  onSnapLineChange,
}) => {
  // Local drag state for smooth movement
  const [dragState, setDragState] = useState<{
    isDragging: boolean;
    mode: 'move' | 'trim-start' | 'trim-end' | null;
    localStartTime: number;
    localDuration: number;
    snappedTo: SnapPoint | null;
  }>({
    isDragging: false,
    mode: null,
    localStartTime: layer.startTime,
    localDuration: layer.duration,
    snappedTo: null,
  });
  
  const [hoverHandle, setHoverHandle] = useState<'start' | 'end' | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingUpdateRef = useRef<{ startTime?: number; duration?: number } | null>(null);
  
  const layerColor = layer.color || getLayerTypeColor(layer.type);
  
  // Use local state during drag, otherwise use layer props
  const displayStartTime = dragState.isDragging ? dragState.localStartTime : layer.startTime;
  const displayDuration = dragState.isDragging ? dragState.localDuration : layer.duration;
  
  // Calculate position in viewport coordinates
  const startX = displayStartTime * pixelsPerFrame - scrollLeft;
  const width = displayDuration * pixelsPerFrame;
  const endX = startX + width;
  
  // Generate snap points from other layers, playhead, and seconds
  const getSnapPoints = useCallback((): SnapPoint[] => {
    const points: SnapPoint[] = [];
    
    // Snap to other layer edges
    if (SNAP_TO_LAYERS) {
      for (const other of otherLayers) {
        if (other.id === layer.id) continue;
        points.push({ frame: other.startTime, type: 'layer-start', layerId: other.id });
        points.push({ frame: other.startTime + other.duration, type: 'layer-end', layerId: other.id });
      }
    }
    
    // Snap to playhead
    if (SNAP_TO_PLAYHEAD) {
      points.push({ frame: currentFrame, type: 'playhead' });
    }
    
    // Snap to seconds
    if (SNAP_TO_SECONDS) {
      for (let s = 0; s <= compositionDuration; s += fps) {
        points.push({ frame: s, type: 'second' });
      }
    }
    
    return points;
  }, [otherLayers, currentFrame, fps, compositionDuration, layer.id]);
  
  // Find nearest snap point
  const findSnapPoint = useCallback((frame: number, snapPoints: SnapPoint[]): { frame: number; snappedTo: SnapPoint | null } => {
    const thresholdFrames = SNAP_THRESHOLD_PX / pixelsPerFrame;
    let nearest: SnapPoint | null = null;
    let minDistance = thresholdFrames;
    
    for (const point of snapPoints) {
      const distance = Math.abs(point.frame - frame);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = point;
      }
    }
    
    if (nearest) {
      return { frame: nearest.frame, snappedTo: nearest };
    }
    
    return { frame, snappedTo: null };
  }, [pixelsPerFrame]);
  
  // Update snap line indicator
  useEffect(() => {
    if (dragState.isDragging && dragState.snappedTo && onSnapLineChange) {
      const snapX = dragState.snappedTo.frame * pixelsPerFrame - scrollLeft;
      onSnapLineChange({ x: snapX, visible: true });
    } else if (onSnapLineChange) {
      onSnapLineChange(null);
    }
  }, [dragState.isDragging, dragState.snappedTo, pixelsPerFrame, scrollLeft, onSnapLineChange]);
  
  // Skip rendering if completely outside viewport
  if (endX < -50 || startX > viewportWidth + 50) {
    return (
      <div 
        className="relative" 
        style={{ height: TRACK_HEIGHT }}
      />
    );
  }
  
  const handleMouseDown = useCallback((e: React.MouseEvent, mode: 'move' | 'trim-start' | 'trim-end') => {
    if (layer.locked) return;
    
    e.stopPropagation();
    e.preventDefault();
    
    // Select if not already selected
    if (!isSelected) {
      onSelect(layer.id, e.shiftKey || e.ctrlKey || e.metaKey);
    }
    
    const startMouseX = e.clientX;
    const startTime = layer.startTime;
    const startDuration = layer.duration;
    const snapPoints = getSnapPoints();
    
    // Initialize local drag state
    setDragState({
      isDragging: true,
      mode,
      localStartTime: startTime,
      localDuration: startDuration,
      snappedTo: null,
    });
    
    // Set cursor based on mode
    if (mode === 'move') {
      document.body.style.cursor = 'grabbing';
    }
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startMouseX;
      const deltaFrames = deltaX / pixelsPerFrame; // Don't round for smooth movement
      
      let newStartTime = startTime;
      let newDuration = startDuration;
      let snappedTo: SnapPoint | null = null;
      
      if (mode === 'move') {
        // Calculate target position
        let targetStart = startTime + deltaFrames;
        
        // Clamp to bounds
        targetStart = Math.max(0, Math.min(compositionDuration - startDuration, targetStart));
        
        // Try snapping start edge
        const startSnap = findSnapPoint(targetStart, snapPoints);
        // Try snapping end edge
        const endSnap = findSnapPoint(targetStart + startDuration, snapPoints);
        
        // Use whichever snap is closer
        const startDist = startSnap.snappedTo ? Math.abs(startSnap.frame - targetStart) : Infinity;
        const endDist = endSnap.snappedTo ? Math.abs(endSnap.frame - (targetStart + startDuration)) : Infinity;
        
        if (startDist < endDist && startSnap.snappedTo) {
          newStartTime = startSnap.frame;
          snappedTo = startSnap.snappedTo;
        } else if (endSnap.snappedTo) {
          newStartTime = endSnap.frame - startDuration;
          snappedTo = endSnap.snappedTo;
        } else {
          newStartTime = Math.round(targetStart); // Round only if not snapping
        }
        
        // Final clamp
        newStartTime = Math.max(0, Math.min(compositionDuration - startDuration, newStartTime));
        newDuration = startDuration;
        
      } else if (mode === 'trim-start') {
        const maxTrim = startDuration - 1;
        let targetDelta = Math.min(maxTrim, Math.max(-startTime, deltaFrames));
        let targetStart = startTime + targetDelta;
        
        // Snap start edge
        const startSnap = findSnapPoint(targetStart, snapPoints);
        if (startSnap.snappedTo) {
          targetStart = Math.max(0, Math.min(startTime + startDuration - 1, startSnap.frame));
          snappedTo = startSnap.snappedTo;
        } else {
          targetStart = Math.round(targetStart);
        }
        
        newStartTime = targetStart;
        newDuration = startTime + startDuration - targetStart;
        
      } else if (mode === 'trim-end') {
        let targetEnd = startTime + startDuration + deltaFrames;
        
        // Snap end edge
        const endSnap = findSnapPoint(targetEnd, snapPoints);
        if (endSnap.snappedTo) {
          targetEnd = Math.max(startTime + 1, Math.min(compositionDuration, endSnap.frame));
          snappedTo = endSnap.snappedTo;
        } else {
          targetEnd = Math.round(targetEnd);
        }
        
        newStartTime = startTime;
        newDuration = Math.max(1, Math.min(compositionDuration - startTime, targetEnd - startTime));
      }
      
      // Update local state immediately for smooth rendering
      setDragState(prev => ({
        ...prev,
        localStartTime: newStartTime,
        localDuration: newDuration,
        snappedTo,
      }));
      
      // Store pending update
      pendingUpdateRef.current = { startTime: newStartTime, duration: newDuration };
    };
    
    const handleMouseUp = () => {
      // Reset cursor
      document.body.style.cursor = '';
      
      // Apply the final update to the store
      if (pendingUpdateRef.current) {
        const updates: Partial<CompositionLayer> = {};
        if (pendingUpdateRef.current.startTime !== undefined) {
          updates.startTime = Math.round(pendingUpdateRef.current.startTime);
        }
        if (pendingUpdateRef.current.duration !== undefined) {
          updates.duration = Math.round(pendingUpdateRef.current.duration);
        }
        onUpdateLayer(layer.id, updates);
        pendingUpdateRef.current = null;
      }
      
      setDragState({
        isDragging: false,
        mode: null,
        localStartTime: layer.startTime,
        localDuration: layer.duration,
        snappedTo: null,
      });
      
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [layer, pixelsPerFrame, onUpdateLayer, onSelect, isSelected, compositionDuration, getSnapPoints, findSnapPoint]);
  
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent bubbling to container which clears selection
    if (!layer.locked && !dragState.isDragging) {
      onSelect(layer.id, e.shiftKey || e.ctrlKey || e.metaKey);
    }
  }, [layer.id, layer.locked, dragState.isDragging, onSelect]);
  
  // Show layer name only if bar is wide enough
  const showName = width > 60;
  
  return (
    <div 
      className="relative" 
      style={{ height: TRACK_HEIGHT }}
    >
      {/* Layer bar */}
      <div
        className={cn(
          "absolute top-1 bottom-1 rounded-sm",
          isSelected && "ring-1 ring-white/70",
          !layer.visible && "opacity-40",
          dragState.isDragging && "shadow-lg"
        )}
        style={{
          cursor: layer.locked ? 'not-allowed' : 'grab',
          left: startX,
          width: Math.max(width, 6),
          backgroundColor: layerColor,
          // Remove transition during drag for immediate feedback
          transition: dragState.isDragging ? 'none' : 'box-shadow 0.15s',
          // Subtle glow when snapped
          boxShadow: dragState.snappedTo 
            ? `0 0 8px ${AE_COLORS.playhead}, 0 2px 8px rgba(0,0,0,0.3)` 
            : dragState.isDragging 
              ? '0 2px 8px rgba(0,0,0,0.3)' 
              : undefined,
        }}
        onClick={handleClick}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget || 
              !(e.target as HTMLElement).dataset.handle) {
            handleMouseDown(e, 'move');
          }
        }}
      >
        {/* Trim handle - start */}
        <div
          data-handle="start"
          className={cn(
            "absolute left-0 top-0 bottom-0 w-1.5 z-10 rounded-l-sm",
            hoverHandle === 'start' || dragState.mode === 'trim-start' 
              ? "bg-white/40" 
              : "hover:bg-white/30"
          )}
          style={{ 
            transition: 'background-color 0.1s',
            cursor: 'ew-resize',
          }}
          onMouseDown={(e) => handleMouseDown(e, 'trim-start')}
          onMouseEnter={() => setHoverHandle('start')}
          onMouseLeave={() => setHoverHandle(null)}
        />
        
        {/* Content area */}
        {showName && (
          <div 
            className="absolute inset-x-2 inset-y-0 flex items-center overflow-hidden pointer-events-none"
          >
            <span 
              className="text-[10px] font-semibold truncate"
              style={{
                color: 'rgba(255, 255, 255, 0.95)',
                textShadow: '0 1px 2px rgba(0, 0, 0, 0.6)',
              }}
            >
              {layer.name}
            </span>
          </div>
        )}
        
        {/* Trim handle - end */}
        <div
          data-handle="end"
          className={cn(
            "absolute right-0 top-0 bottom-0 w-1.5 z-10 rounded-r-sm",
            hoverHandle === 'end' || dragState.mode === 'trim-end' 
              ? "bg-white/40" 
              : "hover:bg-white/30"
          )}
          style={{ 
            transition: 'background-color 0.1s',
            cursor: 'ew-resize',
          }}
          onMouseDown={(e) => handleMouseDown(e, 'trim-end')}
          onMouseEnter={() => setHoverHandle('end')}
          onMouseLeave={() => setHoverHandle(null)}
        />
      </div>
    </div>
  );
});

export default LayerTrack;
