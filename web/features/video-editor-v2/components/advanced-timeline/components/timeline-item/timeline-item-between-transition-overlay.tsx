import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Shuffle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TransitionEntity } from '../../../../types/timeline-v2';
import { getTransitionDuration } from '../../../../types/timeline-v2';
import { useVideoEditorStore } from '../../../../stores/video-editor-store';

// Debug logging for transition overlay interactions (disabled for performance)
const DEBUG_TRANSITIONS = false;
const logTransition = (action: string, data: any) => {
  if (DEBUG_TRANSITIONS) {
    console.log(`%c[TRANSITION-BETWEEN] ${action}`, 'color: #a855f7; font-weight: bold;', data);
  }
};

interface TimelineItemBetweenTransitionOverlayProps {
  /** The transition entity with absolute startTime/endTime */
  transition: TransitionEntity;
  /** First clip's start time (for boundary constraints) */
  firstItemStart: number;
  /** First clip's end time = second clip's start time (the boundary) */
  firstItemEnd: number;
  /** Second clip's end time (for boundary constraints) */
  secondItemEnd: number;
  /** Total timeline duration for percentage calculations */
  totalDuration: number;
  isSelected: boolean;
  onSelect: () => void;
  onDeselect: () => void;
  /** Called when transition times change (simplified: just pass new startTime/endTime) */
  onTimesChange: (startTime: number, endTime: number) => void;
  onRemove: () => void;
  trackLocked?: boolean;
}

/**
 * Renders a transition overlay that spans across two adjacent timeline items
 * 
 * SIMPLIFIED with absolute times:
 * - The transition has startTime and endTime (absolute timeline positions)
 * - Duration = endTime - startTime (derived)
 * - When dragging: shift both startTime and endTime equally
 * - When resizing: adjust either startTime or endTime
 */
export const TimelineItemBetweenTransitionOverlay: React.FC<TimelineItemBetweenTransitionOverlayProps> = ({
  transition,
  firstItemStart,
  firstItemEnd,
  secondItemEnd,
  totalDuration,
  isSelected,
  onSelect,
  onDeselect,
  onTimesChange,
  onRemove,
  trackLocked = false,
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [isHovering, setIsHovering] = useState(false);
  
  // Preview state during drag/resize
  const [previewStartTime, setPreviewStartTime] = useState<number | null>(null);
  const [previewEndTime, setPreviewEndTime] = useState<number | null>(null);
  
  // Get drag state from unified store
  const dragState = useVideoEditorStore(state => state.dragState);
  
  // Determine if THIS overlay is being dragged/resized
  const firstClipId = transition.clipIds[0];
  const isDragging = dragState?.type === 'transition-move' && 
                     dragState?.clipId === firstClipId;
  const isResizing = dragState?.type === 'transition-resize' && 
                     dragState?.clipId === firstClipId;

  // Get current times (use preview during interaction, otherwise actual)
  const currentStartTime = previewStartTime ?? transition.startTime;
  const currentEndTime = previewEndTime ?? transition.endTime;
  const currentDuration = currentEndTime - currentStartTime;
  
  // Calculate position as percentage of total duration
  const leftPercentage = (currentStartTime / totalDuration) * 100;
  const widthPercentage = (currentDuration / totalDuration) * 100;
  
  // Calculate where the boundary (where clips meet) falls within the transition
  const boundaryTime = firstItemEnd;
  const boundaryPositionInTransition = boundaryTime - currentStartTime;
  const boundaryPositionPercent = (boundaryPositionInTransition / currentDuration) * 100;
  
  const isInteracting = isDragging || isResizing;

  // Get transition display name
  const transitionName = transition.type.charAt(0).toUpperCase() + transition.type.slice(1).replace(/([A-Z])/g, ' $1').trim();

  // Refs for values needed in event handlers
  const totalDurationRef = useRef(totalDuration);
  const firstItemStartRef = useRef(firstItemStart);
  const firstItemEndRef = useRef(firstItemEnd);
  const secondItemEndRef = useRef(secondItemEnd);
  const onTimesChangeRef = useRef(onTimesChange);
  
  useEffect(() => {
    totalDurationRef.current = totalDuration;
    firstItemStartRef.current = firstItemStart;
    firstItemEndRef.current = firstItemEnd;
    secondItemEndRef.current = secondItemEnd;
    onTimesChangeRef.current = onTimesChange;
  });
  
  // Store starting values for drag operations
  const startingTimesRef = useRef({ startTime: transition.startTime, endTime: transition.endTime });

  // Move handlers
  const moveListenersRef = useRef<{
    handleMouseMove: (e: MouseEvent) => void;
    handleMouseUp: () => void;
  } | null>(null);
  
  const cleanupMoveListeners = useCallback(() => {
    if (moveListenersRef.current) {
      document.removeEventListener('mousemove', moveListenersRef.current.handleMouseMove);
      document.removeEventListener('mouseup', moveListenersRef.current.handleMouseUp);
      moveListenersRef.current = null;
    }
  }, []);
  
  const finalTimesRef = useRef<{ startTime: number; endTime: number } | null>(null);
  
  const setupMoveListeners = useCallback(() => {
    cleanupMoveListeners();
    finalTimesRef.current = null;
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const currentDragState = useVideoEditorStore.getState().dragState;
      if (!currentDragState || currentDragState.type !== 'transition-move') return;
      
      const trackElement = overlayRef.current?.parentElement;
      if (!trackElement) return;
      
      const parentWidth = trackElement.offsetWidth;
      const deltaX = moveEvent.clientX - currentDragState.startX;
      const secondsPerPixel = totalDurationRef.current / parentWidth;
      const deltaSeconds = deltaX * secondsPerPixel;
      
      const { startTime: origStart, endTime: origEnd } = startingTimesRef.current;
      const duration = origEnd - origStart;
      const boundary = firstItemEndRef.current;
      
      // Calculate new times with shift
      let newStartTime = origStart + deltaSeconds;
      let newEndTime = origEnd + deltaSeconds;
      
      // Constraint: Transition must always span the boundary
      // Left edge can't go past boundary, right edge can't go before boundary
      if (newEndTime <= boundary) {
        newEndTime = boundary + 0.01; // Keep just past boundary
        newStartTime = newEndTime - duration;
      }
      if (newStartTime >= boundary) {
        newStartTime = boundary - 0.01; // Keep just before boundary
        newEndTime = newStartTime + duration;
      }
      
      // Constraint: Stay within clip bounds
      if (newStartTime < firstItemStartRef.current) {
        newStartTime = firstItemStartRef.current;
        newEndTime = newStartTime + duration;
      }
      if (newEndTime > secondItemEndRef.current) {
        newEndTime = secondItemEndRef.current;
        newStartTime = newEndTime - duration;
      }
      
      finalTimesRef.current = { startTime: newStartTime, endTime: newEndTime };
      setPreviewStartTime(newStartTime);
      setPreviewEndTime(newEndTime);
    };
    
    const handleMouseUp = () => {
      if (finalTimesRef.current) {
        onTimesChangeRef.current(finalTimesRef.current.startTime, finalTimesRef.current.endTime);
      }
      
      setPreviewStartTime(null);
      setPreviewEndTime(null);
      finalTimesRef.current = null;
      cleanupMoveListeners();
      
      useVideoEditorStore.getState().endDrag();
    };
    
    moveListenersRef.current = { handleMouseMove, handleMouseUp };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [cleanupMoveListeners]);
  
  useEffect(() => {
    return () => cleanupMoveListeners();
  }, [cleanupMoveListeners]);

  const handleDragMouseDown = useCallback((e: React.MouseEvent) => {
    if (trackLocked) return;
    
    const target = e.target as HTMLElement;
    if (target.closest('[data-transition-resize-handle]')) return;
    
    const currentDragState = useVideoEditorStore.getState().dragState;
    if (currentDragState !== null) return;
    
    e.stopPropagation();
    e.preventDefault();
    e.nativeEvent.stopImmediatePropagation();
    
    startingTimesRef.current = { startTime: transition.startTime, endTime: transition.endTime };
    
    // Start unified drag for transition move
    useVideoEditorStore.getState().startDrag({
      type: 'transition-move',
      clipId: firstClipId,
      transitionPosition: 'end',
      startTime: transition.startTime,
      currentTime: transition.startTime,
      startDuration: transition.endTime - transition.startTime,
      startX: e.clientX,
      startY: e.clientY,
      isValidDrop: true,
    });
    
    setupMoveListeners();
    
    if (!isSelected) {
      onSelect();
    }
  }, [trackLocked, isSelected, onSelect, transition.startTime, transition.endTime, firstClipId, setupMoveListeners]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (trackLocked || isDragging) return;
    
    e.stopPropagation();
    e.preventDefault();
    e.nativeEvent.stopImmediatePropagation();
    
    if (!isSelected) {
      onSelect();
    }
  }, [trackLocked, isSelected, onSelect, isDragging]);

  // Resize handlers
  const resizeListenersRef = useRef<{
    handleMouseMove: (e: MouseEvent) => void;
    handleMouseUp: () => void;
  } | null>(null);
  
  const cleanupResizeListeners = useCallback(() => {
    if (resizeListenersRef.current) {
      document.removeEventListener('mousemove', resizeListenersRef.current.handleMouseMove);
      document.removeEventListener('mouseup', resizeListenersRef.current.handleMouseUp);
      resizeListenersRef.current = null;
    }
  }, []);
  
  const setupResizeListeners = useCallback((side: 'left' | 'right') => {
    cleanupResizeListeners();
    finalTimesRef.current = null;
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const currentDragState = useVideoEditorStore.getState().dragState;
      if (!currentDragState || currentDragState.type !== 'transition-resize') return;
      
      const trackElement = overlayRef.current?.parentElement;
      if (!trackElement) return;
      
      const parentWidth = trackElement.offsetWidth;
      const deltaX = moveEvent.clientX - currentDragState.startX;
      const secondsPerPixel = totalDurationRef.current / parentWidth;
      const deltaSeconds = deltaX * secondsPerPixel;
      
      const { startTime: origStart, endTime: origEnd } = startingTimesRef.current;
      const boundary = firstItemEndRef.current;
      
      let newStartTime = origStart;
      let newEndTime = origEnd;
      
      if (side === 'right') {
        // Resize right edge
        newEndTime = origEnd + deltaSeconds;
        
        // Constraints
        newEndTime = Math.max(boundary + 0.01, newEndTime); // Must stay past boundary
        newEndTime = Math.min(secondItemEndRef.current, newEndTime); // Can't exceed second clip
        newEndTime = Math.max(newStartTime + 0.2, newEndTime); // Min duration
      } else {
        // Resize left edge
        newStartTime = origStart + deltaSeconds;
        
        // Constraints
        newStartTime = Math.min(boundary - 0.01, newStartTime); // Must stay before boundary
        newStartTime = Math.max(firstItemStartRef.current, newStartTime); // Can't go before first clip
        newStartTime = Math.min(newEndTime - 0.2, newStartTime); // Min duration
      }
      
      finalTimesRef.current = { startTime: newStartTime, endTime: newEndTime };
      setPreviewStartTime(newStartTime);
      setPreviewEndTime(newEndTime);
    };
    
    const handleMouseUp = () => {
      if (finalTimesRef.current) {
        onTimesChangeRef.current(finalTimesRef.current.startTime, finalTimesRef.current.endTime);
      }
      
      setPreviewStartTime(null);
      setPreviewEndTime(null);
      finalTimesRef.current = null;
      cleanupResizeListeners();
      
      useVideoEditorStore.getState().endDrag();
    };
    
    resizeListenersRef.current = { handleMouseMove, handleMouseUp };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [cleanupResizeListeners]);
  
  useEffect(() => {
    return () => cleanupResizeListeners();
  }, [cleanupResizeListeners]);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent, side: 'left' | 'right') => {
    if (trackLocked) return;
    
    const currentDragState = useVideoEditorStore.getState().dragState;
    if (currentDragState !== null) return;
    
    e.stopPropagation();
    e.preventDefault();
    e.nativeEvent.stopImmediatePropagation();
    
    startingTimesRef.current = { startTime: transition.startTime, endTime: transition.endTime };
    
    // Start unified drag for transition resize
    useVideoEditorStore.getState().startDrag({
      type: 'transition-resize',
      clipId: firstClipId,
      transitionPosition: 'end',
      transitionResizeSide: side,
      startTime: transition.startTime,
      currentTime: transition.startTime,
      startDuration: transition.endTime - transition.startTime,
      startX: e.clientX,
      startY: e.clientY,
      isValidDrop: true,
    });
    
    setupResizeListeners(side);
    
    if (!isSelected) {
      onSelect();
    }
  }, [trackLocked, isSelected, onSelect, transition.startTime, transition.endTime, firstClipId, setupResizeListeners]);

  // Click-outside detection to deselect
  useEffect(() => {
    if (!isSelected || !onDeselect) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      
      const clickedOutsideOverlay = overlayRef.current && !overlayRef.current.contains(target);
      const isTransitionOverlayClick = target.closest('.timeline-transition-overlay');
      const isResizeHandleClick = target.closest('[data-transition-resize-handle]');
      const isInspectorClick = target.closest('[data-inspector-panel]') || target.closest('[role="dialog"]') || target.closest('[data-radix-popper-content-wrapper]');
      
      if (clickedOutsideOverlay && !isTransitionOverlayClick && !isResizeHandleClick && !isInspectorClick) {
        onDeselect();
      }
    };
    
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);
    
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isSelected, onDeselect]);

  return (
    <div
      ref={overlayRef}
      data-transition-overlay="between"
      className={cn(
        "absolute z-30 timeline-transition-overlay",
        !isInteracting && "transition-[left,width] duration-100",
        trackLocked ? 'cursor-not-allowed' : isDragging ? 'cursor-grabbing' : 'cursor-grab'
      )}
      style={{
        left: `${leftPercentage}%`,
        width: `${widthPercentage}%`,
        minWidth: '30px',
        top: 'calc((var(--timeline-track-height, 48px) - var(--timeline-item-height, 40px)) / 2 + var(--timeline-item-height, 40px) * 0.12)',
        bottom: 'calc((var(--timeline-track-height, 48px) - var(--timeline-item-height, 40px)) / 2 + var(--timeline-item-height, 40px) * 0.12)',
      }}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onMouseDown={handleDragMouseDown}
      onClick={handleClick}
    >
      {/* Boundary indicator - shows where the two clips meet */}
      <div 
        className="absolute top-0 bottom-0 w-[2px] bg-purple-300/20 pointer-events-none z-20"
        style={{ 
          left: `${boundaryPositionPercent}%`, 
          transform: 'translateX(-50%)',
          transition: isInteracting ? 'none' : 'left 100ms ease-out',
        }}
      />
      
      {/* Main overlay with purple styling */}
      <div
        className={cn(
          "absolute inset-0 rounded",
          !isInteracting && "transition-shadow duration-150",
          "bg-gradient-to-r from-purple-900/70 to-purple-800/70 backdrop-blur-sm",
          isSelected 
            ? 'border-2 border-white shadow-[0_0_8px_rgba(255,255,255,0.5)]'
            : isHovering
              ? 'border-2 border-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.4)]'
              : 'border-2 border-purple-500/60 shadow-[0_2px_4px_rgba(0,0,0,0.3)]',
          trackLocked && 'opacity-50'
        )}
      >
        {/* Content: Icon + Name */}
        <div className="absolute inset-0 flex items-center justify-center gap-1.5 px-2 overflow-hidden">
          <Shuffle className="w-3.5 h-3.5 text-purple-200 flex-shrink-0 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]" />
          <span className="text-[11px] font-semibold text-white truncate drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
            {transitionName}
          </span>
        </div>

        {/* Resize handles */}
        {!trackLocked && (
          <>
            {/* Left handle */}
            <div
              data-transition-resize-handle="true"
              className={cn(
                "absolute left-0 top-0 bottom-0 z-50 cursor-ew-resize touch-none",
                "bg-purple-600/50 hover:bg-purple-500/70",
                "transition-all duration-150 ease-out",
                isHovering || isSelected ? "opacity-100" : "opacity-0"
              )}
              style={{ width: '12px', minWidth: '12px' }}
              onMouseDown={(e) => handleResizeMouseDown(e, 'left')}
              onClick={(e) => {
                e.stopPropagation();
                e.nativeEvent.stopImmediatePropagation();
              }}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-[2px] h-4 bg-white/80 rounded-full" />
              </div>
            </div>

            {/* Right handle */}
            <div
              data-transition-resize-handle="true"
              className={cn(
                "absolute right-0 top-0 bottom-0 z-50 cursor-ew-resize touch-none",
                "bg-purple-600/50 hover:bg-purple-500/70",
                "transition-all duration-150 ease-out",
                isHovering || isSelected ? "opacity-100" : "opacity-0"
              )}
              style={{ width: '12px', minWidth: '12px' }}
              onMouseDown={(e) => handleResizeMouseDown(e, 'right')}
              onClick={(e) => {
                e.stopPropagation();
                e.nativeEvent.stopImmediatePropagation();
              }}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-[2px] h-4 bg-white/80 rounded-full" />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
