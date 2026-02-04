/**
 * KeyframeDiamond - Individual keyframe marker in the timeline
 * 
 * Renders a consistent diamond shape that can be:
 * - Selected/unselected
 * - Dragged to change time (with smooth local updates)
 * - Right-clicked for context menu
 * - Shows interpolation type (hold=square, bezier=circle, default=diamond)
 */

import React, { useState, useCallback, useRef } from 'react';
import { cn } from '../../../../utils/general/utils';
import { AE_COLORS } from '../constants';
import type { Keyframe } from '../../../../types/keyframes';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '../../../ui/context-menu';

interface KeyframeDiamondProps {
  keyframe: Keyframe;
  layerId: string;
  propertyPath: string;
  pixelsPerFrame: number;
  fps: number;
  isSelected: boolean;
  onSelect: (keyframeId: string, addToSelection: boolean) => void;
  onDrag: (keyframeId: string, newTime: number) => void;
  onDelete?: (keyframeId: string) => void;
  onSetEasing?: (keyframeId: string, easing: string) => void;
}

export const KeyframeDiamond = React.memo<KeyframeDiamondProps>(({
  keyframe,
  layerId,
  propertyPath,
  pixelsPerFrame,
  fps,
  isSelected,
  onSelect,
  onDrag,
  onDelete,
  onSetEasing,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [localOffset, setLocalOffset] = useState(0);
  const dragStartRef = useRef({ x: 0, time: 0 });
  const pendingTimeRef = useRef<number | null>(null);
  
  const baseFrame = keyframe.time * fps;
  
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 2) return; // Right click
    
    e.stopPropagation();
    e.preventDefault();
    
    // Select this keyframe
    onSelect(keyframe.id, e.shiftKey || e.ctrlKey || e.metaKey);
    
    // Start drag
    setIsDragging(true);
    setLocalOffset(0);
    dragStartRef.current = { x: e.clientX, time: keyframe.time };
    pendingTimeRef.current = null;
    document.body.style.cursor = 'grabbing';
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - dragStartRef.current.x;
      
      // Update local offset for smooth visual feedback
      setLocalOffset(deltaX);
      
      // Calculate new time for final update
      const deltaFrames = deltaX / pixelsPerFrame;
      const deltaTime = deltaFrames / fps;
      const newTime = Math.max(0, dragStartRef.current.time + deltaTime);
      pendingTimeRef.current = newTime;
    };
    
    const handleMouseUp = () => {
      // Reset cursor
      document.body.style.cursor = '';
      
      // Apply the final time update
      if (pendingTimeRef.current !== null) {
        onDrag(keyframe.id, pendingTimeRef.current);
        pendingTimeRef.current = null;
      }
      
      setIsDragging(false);
      setLocalOffset(0);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [keyframe.id, keyframe.time, fps, pixelsPerFrame, onSelect, onDrag]);
  
  // Get shape and rotation based on interpolation type
  const interpolationType = keyframe.interpolation?.type || 'linear';
  
  let shapeClass = '';
  let rotation = 45; // Default diamond rotation
  
  switch (interpolationType) {
    case 'hold':
      // Square (no rotation)
      shapeClass = 'rounded-[1px]';
      rotation = 0;
      break;
    case 'bezier':
      // Circle
      shapeClass = 'rounded-full';
      rotation = 0;
      break;
    default:
      // Diamond for linear, ease-in, ease-out, ease-in-out
      shapeClass = '';
      rotation = 45;
  }
  
  const diamondElement = (
    <div
      className={cn(
        "w-2 h-2 relative",
        shapeClass,
        "hover:scale-110 active:scale-110",
        isDragging && "scale-110 z-50"
      )}
      style={{
        transform: `rotate(${rotation}deg) ${isDragging ? `translateX(${localOffset}px)` : ''}`,
        backgroundColor: isSelected ? AE_COLORS.keyframeSelected : AE_COLORS.keyframe,
        border: isSelected ? `1px solid ${AE_COLORS.selection}` : 'none',
        boxShadow: isDragging 
          ? `0 0 8px ${AE_COLORS.selection}, 0 2px 4px rgba(0,0,0,0.3)` 
          : isSelected 
            ? `0 0 4px ${AE_COLORS.selection}` 
            : 'none',
        transition: isDragging ? 'none' : 'transform 0.1s, box-shadow 0.15s',
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
      onMouseDown={handleMouseDown}
      title={`Frame ${Math.round(baseFrame)} (${keyframe.time.toFixed(2)}s) - ${interpolationType}`}
    />
  );
  
  // Wrap with context menu if handlers provided
  if (onDelete || onSetEasing) {
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {diamondElement}
        </ContextMenuTrigger>
        <ContextMenuContent className="w-44">
          {onSetEasing && (
            <>
              <ContextMenuSub>
                <ContextMenuSubTrigger className="text-xs">
                  Keyframe Interpolation
                </ContextMenuSubTrigger>
                <ContextMenuSubContent className="w-36">
                  <ContextMenuItem 
                    onClick={() => onSetEasing(keyframe.id, 'linear')} 
                    className="text-xs"
                  >
                    Linear
                  </ContextMenuItem>
                  <ContextMenuItem 
                    onClick={() => onSetEasing(keyframe.id, 'ease-in')} 
                    className="text-xs"
                  >
                    Ease In
                  </ContextMenuItem>
                  <ContextMenuItem 
                    onClick={() => onSetEasing(keyframe.id, 'ease-out')} 
                    className="text-xs"
                  >
                    Ease Out
                  </ContextMenuItem>
                  <ContextMenuItem 
                    onClick={() => onSetEasing(keyframe.id, 'ease-in-out')} 
                    className="text-xs"
                  >
                    Ease In Out
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem 
                    onClick={() => onSetEasing(keyframe.id, 'hold')} 
                    className="text-xs"
                  >
                    Hold (No Interpolation)
                  </ContextMenuItem>
                  <ContextMenuItem 
                    onClick={() => onSetEasing(keyframe.id, 'bezier')} 
                    className="text-xs"
                  >
                    Bezier
                  </ContextMenuItem>
                </ContextMenuSubContent>
              </ContextMenuSub>
              <ContextMenuSeparator />
            </>
          )}
          {onDelete && (
            <ContextMenuItem 
              onClick={() => onDelete(keyframe.id)} 
              className="text-xs text-red-400"
            >
              Delete Keyframe
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>
    );
  }
  
  return diamondElement;
});

export default KeyframeDiamond;
