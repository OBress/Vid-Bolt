import React, { useCallback, useRef, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { TransitionEntity } from '../../../../types/timeline-v2';
import { getTransitionDuration } from '../../../../types/timeline-v2';
import { useVideoEditorStore } from '../../../../stores/video-editor-store';
import { Shuffle } from 'lucide-react';

interface TimelineItemTransitionOverlayProps {
  itemId: string;
  transition: TransitionEntity;
  position: 'start' | 'end';
  itemDuration: number; // Total duration of the parent item in seconds
  itemStartTime: number; // Start time of the parent item in seconds
  isSelected?: boolean;
  onSelect?: () => void;
  onDeselect?: () => void;
  onTimesChange?: (startTime: number, endTime: number) => void;
  onRemove?: () => void;
  trackLocked?: boolean;
}

/**
 * Renders an interactive transition overlay on timeline items
 * For standalone transitions (fade in/out, not between transitions)
 * Uses TransitionEntity with absolute startTime/endTime
 */
export const TimelineItemTransitionOverlay: React.FC<TimelineItemTransitionOverlayProps> = ({
  itemId,
  transition,
  position,
  itemDuration,
  itemStartTime,
  isSelected = false,
  onSelect,
  onDeselect,
  onTimesChange,
  onRemove,
  trackLocked = false,
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [isHovering, setIsHovering] = useState(false);
  
  // Store starting times for drag calculations
  const startingTimesRef = useRef({ startTime: transition.startTime, endTime: transition.endTime });

  // Preview state during resize
  const [previewDuration, setPreviewDuration] = useState<number | null>(null);
  const finalTimesRef = useRef<{ startTime: number; endTime: number } | null>(null);

  // Get drag state from unified store
  const dragState = useVideoEditorStore(state => state.dragState);
  
  // Refs for values accessed in effects
  const itemDurationRef = useRef(itemDuration);
  const itemStartTimeRef = useRef(itemStartTime);
  const onTimesChangeRef = useRef(onTimesChange);
  
  useEffect(() => {
    itemDurationRef.current = itemDuration;
    itemStartTimeRef.current = itemStartTime;
    onTimesChangeRef.current = onTimesChange;
  });
  
  // Determine if THIS overlay is being resized
  const isResizing = dragState?.type === 'transition-resize' && 
                     dragState?.clipId === itemId && 
                     dragState?.transitionPosition === position;

  // Calculate transition width as percentage of item
  const transDuration = getTransitionDuration(transition);
  const displayDuration = previewDuration !== null ? previewDuration : transDuration;
  const transitionPercent = Math.min((displayDuration / itemDuration) * 100, 50);
  
  // Get transition display name
  const transitionName = transition.type.charAt(0).toUpperCase() + transition.type.slice(1).replace(/([A-Z])/g, ' $1').trim();
  
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (trackLocked) return;
    e.stopPropagation();
    e.preventDefault();
    e.nativeEvent.stopImmediatePropagation();
  }, [trackLocked]);
  
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (trackLocked) return;
    e.stopPropagation();
    e.preventDefault();
    e.nativeEvent.stopImmediatePropagation();
    onSelect?.();
  }, [onSelect, trackLocked]);

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

  const setupResizeListeners = useCallback(() => {
    cleanupResizeListeners();
    finalTimesRef.current = null;
    
    const { startTime: origStart, endTime: origEnd } = startingTimesRef.current;
    const origDuration = origEnd - origStart;
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const currentDragState = useVideoEditorStore.getState().dragState;
      if (!currentDragState || currentDragState.type !== 'transition-resize') return;
      
      if (!overlayRef.current) return;
      
      const deltaX = moveEvent.clientX - currentDragState.startX;
      const parentWidth = overlayRef.current.parentElement?.offsetWidth || 1;
      const currentItemDuration = itemDurationRef.current;
      const deltaDuration = (deltaX / parentWidth) * currentItemDuration;
      
      // Calculate new duration
      let newDuration: number;
      if (position === 'start') {
        newDuration = origDuration + deltaDuration;
      } else {
        newDuration = origDuration - deltaDuration;
      }
      
      // Clamp duration
      newDuration = Math.max(0.1, Math.min(currentItemDuration / 2, newDuration));
      
      // Calculate new times (keep the anchor point fixed)
      let newStartTime: number;
      let newEndTime: number;
      
      if (position === 'start') {
        // In transition: startTime is fixed (item start), endTime changes
        newStartTime = origStart;
        newEndTime = origStart + newDuration;
      } else {
        // Out transition: endTime is fixed (item end), startTime changes
        newEndTime = origEnd;
        newStartTime = origEnd - newDuration;
      }
      
      finalTimesRef.current = { startTime: newStartTime, endTime: newEndTime };
      setPreviewDuration(newDuration);
    };
    
    const handleMouseUp = () => {
      if (finalTimesRef.current) {
        onTimesChangeRef.current?.(finalTimesRef.current.startTime, finalTimesRef.current.endTime);
      }
      
      setPreviewDuration(null);
      finalTimesRef.current = null;
      cleanupResizeListeners();
      
      useVideoEditorStore.getState().endDrag();
    };
    
    resizeListenersRef.current = { handleMouseMove, handleMouseUp };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [position, cleanupResizeListeners]);
    
  useEffect(() => {
    return () => cleanupResizeListeners();
  }, [cleanupResizeListeners]);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    if (trackLocked) return;
    
    const currentDrag = useVideoEditorStore.getState().dragState;
    if (currentDrag !== null) return;
    
    e.stopPropagation();
    e.preventDefault();
    e.nativeEvent.stopImmediatePropagation();
    
    startingTimesRef.current = { startTime: transition.startTime, endTime: transition.endTime };
    
    // Start unified drag for transition resize
    useVideoEditorStore.getState().startDrag({
      type: 'transition-resize',
      clipId: itemId,
      transitionPosition: position,
      startTime: transition.startTime,
      currentTime: transition.startTime,
      startDuration: transition.endTime - transition.startTime,
      startX: e.clientX,
      startY: e.clientY,
      isValidDrop: true,
    });
    
    setupResizeListeners();
    
    if (!isSelected && onSelect) {
      onSelect();
    }
  }, [trackLocked, itemId, position, transition.startTime, transition.endTime, isSelected, onSelect, setupResizeListeners]);
  
  // Click-outside detection
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
      className={cn(
        "absolute z-30 transition-all duration-100 timeline-transition-overlay",
        position === 'start' ? 'left-0' : 'right-0',
        trackLocked ? 'cursor-not-allowed' : 'cursor-pointer'
      )}
      style={{
        width: `${transitionPercent}%`,
        top: '12%',
        bottom: '12%',
      }}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
    >
      <div
        className={cn(
          "absolute inset-0 transition-all duration-150 rounded",
          "bg-gradient-to-r from-blue-900/70 to-blue-800/70 backdrop-blur-sm",
          isSelected 
            ? 'border-2 border-white shadow-[0_0_8px_rgba(255,255,255,0.5)]'
            : isHovering
              ? 'border-2 border-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.4)]'
              : 'border-2 border-blue-500/60 shadow-[0_2px_4px_rgba(0,0,0,0.3)]',
          trackLocked && 'opacity-50'
        )}
      >
        <div className="absolute inset-0 flex items-center justify-center gap-1.5 px-2 overflow-hidden">
          <Shuffle className="w-3.5 h-3.5 text-blue-200 flex-shrink-0 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]" />
          <span className="text-[11px] font-semibold text-white truncate drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
            {transitionName}
          </span>
        </div>
        
        {!trackLocked && (
          <div
            data-transition-resize-handle="true"
            className={cn(
              "absolute top-0 bottom-0 z-50 cursor-ew-resize touch-none",
              "bg-blue-600/50 hover:bg-blue-500/70",
              "transition-all duration-150 ease-out",
              isHovering || isSelected ? "opacity-100" : "opacity-0",
              position === 'start' ? 'right-0' : 'left-0'
            )}
            style={{ width: '12px', minWidth: '12px' }}
            onMouseDown={handleResizeMouseDown}
            onClick={(e) => {
              e.stopPropagation();
              e.nativeEvent.stopImmediatePropagation();
            }}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-[2px] h-4 bg-white/80 rounded-full" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TimelineItemTransitionOverlay;
