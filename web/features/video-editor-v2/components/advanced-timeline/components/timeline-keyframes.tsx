/**
 * TimelineKeyframes Component
 * 
 * Renders keyframe diamond markers on timeline clips.
 * 
 * Visual Design:
 * - Diamond markers positioned at keyframe times
 * - Color-coded by property type (X=red, Y=green, Scale=purple, etc.)
 * - Stacked vertically when multiple keyframes at same time
 * - Glowing effect on hover/selection
 * - Count badge showing total keyframes
 * 
 * Interaction:
 * - Click to select keyframe
 * - Drag to move keyframe in time
 * - Right-click context menu for interpolation
 * - Shift+click for range selection
 * - Ctrl+click to toggle selection
 */

import React, { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { cn } from '../../../utils/general/utils';
import { useVideoEditorStore } from '../../../stores/video-editor-store';
import type { PropertyKeyframes, Keyframe } from '../../../types/keyframes';
import { STANDARD_ANIMATABLE_PROPERTIES } from '../../../types/keyframes';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '../../ui/context-menu';
import { Trash2 } from 'lucide-react';

// ==========================================
// TYPES
// ==========================================

interface TimelineKeyframesProps {
  clipId: string;
  keyframes: PropertyKeyframes[];
  duration: number;
  width: number;
  isSelected: boolean;
  fps: number;
  currentTime?: number;
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function getPropertyColor(propertyPath: string): string {
  const prop = STANDARD_ANIMATABLE_PROPERTIES.find(p => p.path === propertyPath);
  if (prop) return prop.color;
  
  // Fallback colors for custom properties
  if (propertyPath.startsWith('effects')) return '#A855F7';
  if (propertyPath.startsWith('masks')) return '#F97316';
  if (propertyPath.startsWith('styles')) return '#06B6D4';
  
  return '#6B7280';
}

function getPropertyShortName(propertyPath: string): string {
  const prop = STANDARD_ANIMATABLE_PROPERTIES.find(p => p.path === propertyPath);
  if (prop) return (prop.label ?? '?').charAt(0);
  return '?';
}

// ==========================================
// KEYFRAME DIAMOND COMPONENT
// ==========================================

interface KeyframeDiamondProps {
  keyframe: Keyframe;
  propertyPath: string;
  clipId: string;
  position: number; // percentage
  color: string;
  isSelected: boolean;
  isAtPlayhead: boolean;
  duration: number;
  containerWidth: number;
  verticalOffset: number; // for stacking
}

const KeyframeDiamond: React.FC<KeyframeDiamondProps> = ({
  keyframe,
  propertyPath,
  clipId,
  position,
  color,
  isSelected,
  isAtPlayhead,
  duration,
  containerWidth,
  verticalOffset,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, startTime: 0 });
  
  const { 
    updateKeyframe, 
    deleteKeyframe, 
    setKeyframeInterpolation,
    selectKeyframes,
    addKeyframesToSelection,
    setCurrentTime,
  } = useVideoEditorStore();
  
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    // Select this keyframe
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      addKeyframesToSelection(clipId, propertyPath, [keyframe.id]);
    } else {
      selectKeyframes(clipId, propertyPath, [keyframe.id]);
      
      // PREMIERE PRO BEHAVIOR: Move playhead to selected keyframe on single selection
      const clip = useVideoEditorStore.getState().clips.find(c => c.id === clipId);
      if (clip) {
        setCurrentTime(clip.startTime + keyframe.time);
      }
    }
    
    // Start drag
    dragStartRef.current = { x: e.clientX, startTime: keyframe.time };
    setIsDragging(true);
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - dragStartRef.current.x;
      const deltaTime = (deltaX / containerWidth) * duration;
      const newTime = Math.max(0, Math.min(duration, dragStartRef.current.startTime + deltaTime));
      updateKeyframe(clipId, propertyPath, keyframe.id, { time: newTime });
    };
    
    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [keyframe, clipId, propertyPath, containerWidth, duration, updateKeyframe, selectKeyframes, addKeyframesToSelection, setCurrentTime]);
  
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    // Jump to this keyframe time
    const clip = useVideoEditorStore.getState().clips.find(c => c.id === clipId);
    if (clip) {
      setCurrentTime(clip.startTime + keyframe.time);
    }
  }, [clipId, keyframe.time, setCurrentTime]);
  
  const handleDelete = useCallback(() => {
    deleteKeyframe(clipId, propertyPath, keyframe.id);
  }, [clipId, propertyPath, keyframe.id, deleteKeyframe]);
  
  const handleSetInterpolation = useCallback((type: string) => {
    setKeyframeInterpolation(clipId, propertyPath, keyframe.id, { type: type as any });
  }, [clipId, propertyPath, keyframe.id, setKeyframeInterpolation]);
  
  // Determine diamond size based on state
  const size = isDragging ? 8 : (isSelected ? 7 : 6);
  
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            "absolute z-50 cursor-move",
            "transition-transform duration-75",
            isDragging && "scale-125 z-[60]",
            isSelected && !isDragging && "scale-110"
          )}
          style={{ 
            left: `${position}%`,
            bottom: `${2 + verticalOffset * 5}px`,
            transform: 'translateX(-50%)',
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={handleMouseDown}
          onDoubleClick={handleDoubleClick}
        >
          <div
            className={cn(
              "rotate-45 transition-all",
              isSelected && "ring-1 ring-white"
            )}
            style={{
              width: size,
              height: size,
              backgroundColor: color,
              boxShadow: isAtPlayhead 
                ? `0 0 6px ${color}, 0 0 10px ${color}80` 
                : isSelected 
                  ? `0 0 4px ${color}` 
                  : `0 0 2px ${color}60`,
            }}
          />
        </div>
      </ContextMenuTrigger>
      
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={handleDelete} className="text-red-400">
          <Trash2 className="w-3.5 h-3.5 mr-2" />
          Delete Keyframe
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger>Interpolation</ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-40">
            <ContextMenuItem 
              onClick={() => handleSetInterpolation('linear')}
              className={keyframe.interpolation.type === 'linear' ? 'bg-primary/20' : ''}
            >
              Linear
            </ContextMenuItem>
            <ContextMenuItem 
              onClick={() => handleSetInterpolation('hold')}
              className={keyframe.interpolation.type === 'hold' ? 'bg-primary/20' : ''}
            >
              Hold (Step)
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem 
              onClick={() => handleSetInterpolation('ease-in')}
              className={keyframe.interpolation.type === 'ease-in' ? 'bg-primary/20' : ''}
            >
              Ease In
            </ContextMenuItem>
            <ContextMenuItem 
              onClick={() => handleSetInterpolation('ease-out')}
              className={keyframe.interpolation.type === 'ease-out' ? 'bg-primary/20' : ''}
            >
              Ease Out
            </ContextMenuItem>
            <ContextMenuItem 
              onClick={() => handleSetInterpolation('ease-in-out')}
              className={keyframe.interpolation.type === 'ease-in-out' ? 'bg-primary/20' : ''}
            >
              Ease In/Out
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem 
              onClick={() => handleSetInterpolation('ease-out-bounce')}
              className={keyframe.interpolation.type === 'ease-out-bounce' ? 'bg-primary/20' : ''}
            >
              Bounce
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
      </ContextMenuContent>
    </ContextMenu>
  );
};

// ==========================================
// MAIN COMPONENT
// ==========================================

export const TimelineKeyframes: React.FC<TimelineKeyframesProps> = ({
  clipId,
  keyframes,
  duration,
  width,
  isSelected: isClipSelected,
  fps,
  currentTime,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(width);
  
  const { keyframeSelection } = useVideoEditorStore();
  
  // Update container width on resize
  useEffect(() => {
    if (!containerRef.current) return;
    
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);
  
  // Collect ALL keyframes from enabled properties and group by time
  const keyframeData = useMemo(() => {
    const result: Array<{
      keyframe: Keyframe;
      propertyPath: string;
      position: number;
      color: string;
      isSelected: boolean;
      isAtPlayhead: boolean;
      verticalOffset: number;
    }> = [];
    
    if (!keyframes || keyframes.length === 0) return result;
    
    // First, collect all keyframes with their times
    const allKfs: Array<{
      keyframe: Keyframe;
      propertyPath: string;
      color: string;
      time: number;
    }> = [];
    
    for (const propKf of keyframes) {
      // Include keyframes from enabled properties only
      if (!propKf.enabled) continue;
      
      const color = getPropertyColor(propKf.propertyPath);
      
      for (const kf of propKf.keyframes) {
        allKfs.push({
          keyframe: kf,
          propertyPath: propKf.propertyPath,
          color,
          time: kf.time,
        });
      }
    }
    
    // Sort by time for grouping
    allKfs.sort((a, b) => a.time - b.time);
    
    // Group keyframes at similar times (within 0.05s) and assign vertical offsets
    const TIME_THRESHOLD = 0.05;
    let currentGroupTime = -999;
    let currentGroupOffset = 0;
    
    for (const kfData of allKfs) {
      if (Math.abs(kfData.time - currentGroupTime) < TIME_THRESHOLD) {
        currentGroupOffset++;
      } else {
        currentGroupTime = kfData.time;
        currentGroupOffset = 0;
      }
      
      const position = duration > 0 ? (kfData.time / duration) * 100 : 0;
      
      const isKfSelected = keyframeSelection?.clipId === clipId &&
        keyframeSelection.propertyPath === kfData.propertyPath &&
        keyframeSelection.keyframeIds.includes(kfData.keyframe.id);
      
      const isAtPlayhead = currentTime !== undefined && 
        Math.abs(kfData.time - currentTime) < 0.05;
      
      result.push({
        keyframe: kfData.keyframe,
        propertyPath: kfData.propertyPath,
        position: Math.max(0, Math.min(100, position)),
        color: kfData.color,
        isSelected: isKfSelected || false,
        isAtPlayhead,
        verticalOffset: currentGroupOffset,
      });
    }
    
    return result;
  }, [keyframes, duration, keyframeSelection, clipId, currentTime]);
  
  // Count unique property paths with keyframes
  const propertyCount = useMemo(() => {
    const paths = new Set(keyframeData.map(k => k.propertyPath));
    return paths.size;
  }, [keyframeData]);
  
  // Don't render if no keyframes
  if (keyframeData.length === 0) {
    return null;
  }
  
  return (
    <div 
      ref={containerRef}
      className="absolute inset-x-0 bottom-0 pointer-events-auto"
      style={{ 
        height: `${Math.min(20, 8 + propertyCount * 4)}px`,
        zIndex: 45,
      }}
    >
      {/* Background gradient */}
      <div 
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(to top, rgba(0,0,0,0.5), transparent)',
        }}
      />
      
      {/* Keyframe track line */}
      <div 
        className="absolute bottom-1 left-1 right-1 h-px"
        style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
      />
      
      {/* Current time indicator */}
      {currentTime !== undefined && currentTime >= 0 && currentTime <= duration && (
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white/50 pointer-events-none"
          style={{ left: `${(currentTime / duration) * 100}%` }}
        />
      )}
      
      {/* Keyframe diamonds */}
      {keyframeData.map(({ keyframe, propertyPath, position, color, isSelected, isAtPlayhead, verticalOffset }) => (
        <KeyframeDiamond
          key={keyframe.id}
          keyframe={keyframe}
          propertyPath={propertyPath}
          clipId={clipId}
          position={position}
          color={color}
          isSelected={isSelected}
          isAtPlayhead={isAtPlayhead}
          duration={duration}
          containerWidth={containerWidth || width}
          verticalOffset={verticalOffset}
        />
      ))}
      
      {/* Keyframe count badge */}
      <div 
        className="absolute -top-3 right-1 text-[8px] font-bold px-1 py-0.5 rounded leading-none"
        style={{ 
          backgroundColor: keyframeData[0]?.color ?? '#6B7280',
          color: 'white',
          textShadow: '0 0 2px rgba(0,0,0,0.5)',
        }}
        title={`${keyframeData.length} keyframe${keyframeData.length > 1 ? 's' : ''} on ${propertyCount} propert${propertyCount > 1 ? 'ies' : 'y'}`}
      >
        ◇{keyframeData.length}
      </div>
    </div>
  );
};

export default TimelineKeyframes;
