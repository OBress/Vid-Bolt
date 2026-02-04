/**
 * ============================================================
 * TRANSITION OVERLAY COMPONENT
 * ============================================================
 * 
 * Renders a first-class transition entity on the timeline.
 * Uses the unified DragManager for all drag operations.
 * 
 * Features:
 * - Visual representation of transition timing
 * - Drag to move (for boundary transitions)
 * - Resize handles on edges
 * - Selection and info overlay
 * - Clean event handling that doesn't interfere with items
 */

import React, { useCallback, useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Shuffle, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TimelineTransition, getTransitionDuration } from '../../types/transition-types';
import { useDragManager, useIsDragActive } from '../../managers/drag-manager';
import { useTransitionManager } from '../../managers/transition-manager';

interface TransitionOverlayProps {
  /** The transition to render */
  transition: TimelineTransition;
  /** Total timeline duration for percentage calculations */
  totalDuration: number;
  /** Whether the parent track is locked */
  trackLocked?: boolean;
}

/**
 * Get display name for a transition type
 */
const getTransitionDisplayName = (type: string): string => {
  return type.charAt(0).toUpperCase() + type.slice(1).replace(/([A-Z])/g, ' $1').trim();
};

export const TransitionOverlay: React.FC<TransitionOverlayProps> = ({
  transition,
  totalDuration,
  trackLocked = false,
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const infoOverlayRef = useRef<HTMLDivElement>(null);
  
  const [isHovering, setIsHovering] = useState(false);
  const [infoOverlayRect, setInfoOverlayRect] = useState<DOMRect | null>(null);
  const [resizeDelta, setResizeDelta] = useState(0);
  
  // Drag manager
  const dragManager = useDragManager();
  const isTransitionDragging = useIsDragActive('transition');
  
  // Transition manager
  const transitionManager = useTransitionManager();
  const isSelected = transitionManager.isSelected(transition.id);
  
  // Check if THIS transition is being dragged
  const isThisDragging = isTransitionDragging && 
    dragManager.transitionDrag?.transitionId === transition.id;
  
  // Calculate position percentages
  const leftPercentage = (transition.startTime / totalDuration) * 100;
  const widthPercentage = (getTransitionDuration(transition) / totalDuration) * 100;
  
  // Get display values
  const transitionName = getTransitionDisplayName(transition.effect.type);
  const duration = getTransitionDuration(transition);
  
  // Color scheme based on transition mode
  const isBoundary = transition.mode === 'boundary';
  const colorScheme = isBoundary ? {
    gradient: 'from-purple-900/70 to-purple-800/70',
    accent: 'purple-400',
    border: 'purple-500/60',
    glow: 'rgba(168,85,247,0.7)',
    glowHover: 'rgba(168,85,247,0.4)',
    handle: 'purple-500',
    text: 'purple-200',
  } : {
    gradient: 'from-blue-900/70 to-blue-800/70',
    accent: 'blue-400',
    border: 'blue-500/60',
    glow: 'rgba(59,130,246,0.7)',
    glowHover: 'rgba(59,130,246,0.4)',
    handle: 'blue-500',
    text: 'blue-200',
  };

  // Refs for values needed in effects
  const totalDurationRef = useRef(totalDuration);
  useEffect(() => {
    totalDurationRef.current = totalDuration;
  });

  // Handle click to select
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (trackLocked) return;
    
    e.stopPropagation();
    e.preventDefault();
    e.nativeEvent.stopImmediatePropagation();
    
    transitionManager.selectTransition(transition.id);
    
    if (overlayRef.current) {
      setInfoOverlayRect(overlayRef.current.getBoundingClientRect());
    }
  }, [trackLocked, transition.id, transitionManager]);

  // Handle drag to move (only for boundary transitions)
  const handleDragMouseDown = useCallback((e: React.MouseEvent) => {
    if (trackLocked || !isBoundary) return;
    
    // Don't start drag if clicking on resize handles
    const target = e.target as HTMLElement;
    if (target.closest('[data-transition-resize-handle]')) return;
    
    // Check if we can start a drag
    if (!dragManager.canStartDrag()) {
      return;
    }
    
    e.stopPropagation();
    e.preventDefault();
    e.nativeEvent.stopImmediatePropagation();
    
    // Start the drag
    const started = dragManager.startTransitionDrag({
      action: 'move',
      transitionId: transition.id,
      startX: e.clientX,
      startY: e.clientY,
      originalTransition: {
        startTime: transition.startTime,
        endTime: transition.endTime,
      },
    });
    
    if (started) {
      transitionManager.selectTransition(transition.id);
      if (overlayRef.current) {
        setInfoOverlayRect(overlayRef.current.getBoundingClientRect());
      }
    }
  }, [trackLocked, isBoundary, dragManager, transition, transitionManager]);

  // Handle resize mouse down
  const handleResizeMouseDown = useCallback((e: React.MouseEvent, side: 'left' | 'right') => {
    if (trackLocked) return;
    
    if (!dragManager.canStartDrag()) {
      return;
    }
    
    e.stopPropagation();
    e.preventDefault();
    e.nativeEvent.stopImmediatePropagation();
    
    const action = side === 'left' ? 'resize-left' : 'resize-right';
    
    const started = dragManager.startTransitionDrag({
      action: action as 'resize-left' | 'resize-right',
      transitionId: transition.id,
      startX: e.clientX,
      startY: e.clientY,
      originalTransition: {
        startTime: transition.startTime,
        endTime: transition.endTime,
      },
    });
    
    if (started) {
      transitionManager.selectTransition(transition.id);
      if (overlayRef.current) {
        setInfoOverlayRect(overlayRef.current.getBoundingClientRect());
      }
    }
  }, [trackLocked, dragManager, transition, transitionManager]);

  // Global mouse move/up for drag operations
  useEffect(() => {
    if (!isThisDragging) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      const dragState = dragManager.transitionDrag;
      if (!dragState) return;
      
      const trackElement = overlayRef.current?.parentElement;
      if (!trackElement) return;
      
      const parentWidth = trackElement.offsetWidth;
      const deltaX = e.clientX - dragState.startX;
      const secondsPerPixel = totalDurationRef.current / parentWidth;
      const deltaSeconds = deltaX * secondsPerPixel;
      
      const originalDuration = dragState.originalTransition.endTime - dragState.originalTransition.startTime;
      
      let newStartTime = dragState.originalTransition.startTime;
      let newEndTime = dragState.originalTransition.endTime;
      
      if (dragState.action === 'move') {
        // Move the entire transition
        newStartTime = Math.max(0, dragState.originalTransition.startTime + deltaSeconds);
        newEndTime = newStartTime + originalDuration;
      } else if (dragState.action === 'resize-left') {
        // Resize from left edge
        newStartTime = Math.max(0, dragState.originalTransition.startTime + deltaSeconds);
        const newDuration = newEndTime - newStartTime;
        if (newDuration < 0.1) {
          newStartTime = newEndTime - 0.1;
        }
        setResizeDelta(newEndTime - newStartTime - originalDuration);
      } else if (dragState.action === 'resize-right') {
        // Resize from right edge
        newEndTime = dragState.originalTransition.endTime + deltaSeconds;
        const newDuration = newEndTime - newStartTime;
        if (newDuration < 0.1) {
          newEndTime = newStartTime + 0.1;
        }
        setResizeDelta(newEndTime - newStartTime - originalDuration);
      }
      
      dragManager.updateTransitionDrag({
        currentX: e.clientX,
        currentY: e.clientY,
        previewState: {
          startTime: newStartTime,
          endTime: newEndTime,
        },
      });
      
      if (overlayRef.current) {
        setInfoOverlayRect(overlayRef.current.getBoundingClientRect());
      }
    };
    
    const handleMouseUp = () => {
      const finalState = dragManager.endTransitionDrag();
      
      if (finalState) {
        // Apply the changes
        transitionManager.updateTransitionTiming(
          finalState.transitionId,
          finalState.previewState.startTime,
          finalState.previewState.endTime
        );
      }
      
      setResizeDelta(0);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isThisDragging, dragManager, transitionManager]);

  // Update info overlay position when selected and when scrolling
  useEffect(() => {
    if (isSelected && overlayRef.current) {
      setInfoOverlayRect(overlayRef.current.getBoundingClientRect());
    } else {
      setInfoOverlayRect(null);
      return; // No need to set up scroll listeners if not selected
    }

    const updateOverlayPosition = () => {
      if (overlayRef.current) {
        setInfoOverlayRect(overlayRef.current.getBoundingClientRect());
      }
    };

    // Listen for window resize which can affect position
    // Note: With virtual scroll, there's no native scroll events to listen for
    window.addEventListener('resize', updateOverlayPosition);

    return () => {
      window.removeEventListener('resize', updateOverlayPosition);
    };
  }, [isSelected]);

  // Click-outside detection
  useEffect(() => {
    if (!isSelected) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      
      const clickedOutsideOverlay = overlayRef.current && !overlayRef.current.contains(target);
      const clickedOutsideInfo = infoOverlayRef.current && !infoOverlayRef.current.contains(target);
      const isTransitionClick = target.closest('[data-transition-overlay]');
      const isResizeHandleClick = target.closest('[data-transition-resize-handle]');
      
      // Don't deselect if clicking inside the Inspector panel (for editing properties)
      const isInspectorClick = target.closest('[data-inspector-panel]') || target.closest('[role="dialog"]') || target.closest('[data-radix-popper-content-wrapper]');
      
      if (clickedOutsideOverlay && clickedOutsideInfo && !isTransitionClick && !isResizeHandleClick && !isInspectorClick) {
        transitionManager.clearSelection();
      }
    };
    
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);
    
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isSelected, transitionManager]);

  // Handle delete
  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    e.nativeEvent.stopImmediatePropagation();
    
    transitionManager.removeTransition(transition.id);
  }, [transitionManager, transition.id]);

  // Get preview position if dragging
  const displayStartTime = isThisDragging && dragManager.transitionDrag
    ? dragManager.transitionDrag.previewState.startTime
    : transition.startTime;
  const displayEndTime = isThisDragging && dragManager.transitionDrag
    ? dragManager.transitionDrag.previewState.endTime
    : transition.endTime;
  
  const displayLeftPercentage = (displayStartTime / totalDuration) * 100;
  const displayWidthPercentage = ((displayEndTime - displayStartTime) / totalDuration) * 100;
  const displayDuration = displayEndTime - displayStartTime;

  return (
    <>
      <div
        ref={overlayRef}
        data-transition-overlay={transition.mode}
        className={cn(
          "absolute z-[100] pointer-events-auto",
          "transition-[box-shadow,ring] duration-100",
          trackLocked ? 'cursor-not-allowed' : 
            isBoundary ? (isThisDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-pointer'
        )}
        style={{
          left: `${displayLeftPercentage}%`,
          top: '50%',
          width: `${displayWidthPercentage}%`,
          minWidth: '30px',
          height: 'calc(var(--timeline-item-height, 40px) * 0.76)',
          transform: 'translateY(-50%)',
        }}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        onMouseDown={handleDragMouseDown}
        onClick={handleClick}
      >
        {/* Main overlay background */}
        <div
          className={cn(
            "absolute inset-0 transition-all duration-150 rounded",
            `bg-gradient-to-r ${colorScheme.gradient} backdrop-blur-sm`,
            `border-l-[3px] border-l-${colorScheme.accent}`,
            `border-r-[3px] border-r-${colorScheme.accent}`,
            `border-t-2 border-b-2 border-${colorScheme.border}`,
            isSelected 
              ? `shadow-[0_0_12px_${colorScheme.glow}] ring-2 ring-${colorScheme.accent}/50`
              : isHovering
                ? `shadow-[0_0_8px_${colorScheme.glowHover}]`
                : 'shadow-[0_2px_4px_rgba(0,0,0,0.3)]',
            trackLocked && 'opacity-50'
          )}
        >
          {/* Content */}
          <div className="absolute inset-0 flex items-center justify-center gap-1.5 px-2 overflow-hidden pointer-events-none">
            <Shuffle className={cn(
              "w-3.5 h-3.5 flex-shrink-0 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]",
              `text-${colorScheme.text}`
            )} />
            <span className="text-[11px] font-semibold text-white truncate drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
              {transitionName}
            </span>
          </div>

          {/* Resize handles */}
          {!trackLocked && (
            <>
              {/* Left handle */}
              <div
                data-transition-resize-handle="left"
                className={cn(
                  "absolute left-0 top-0 bottom-0 z-50 cursor-ew-resize touch-none pointer-events-auto",
                  `bg-${colorScheme.handle}/40 backdrop-blur-sm hover:bg-${colorScheme.handle}/60`,
                  `border-l-2 border-r-2 border-${colorScheme.accent}/60 rounded-l-[4px]`,
                  "transition-opacity duration-200 ease-in-out",
                  isHovering || isSelected ? "opacity-100" : "opacity-0"
                )}
                style={{ width: '16px', minWidth: '16px' }}
                onMouseDown={(e) => handleResizeMouseDown(e, 'left')}
                onClick={(e) => {
                  e.stopPropagation();
                  e.nativeEvent.stopImmediatePropagation();
                }}
              >
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-[2.5px] h-[18px] bg-white rounded-full shadow-[0_0_6px_rgba(0,0,0,0.9)]" />
                </div>
              </div>

              {/* Right handle */}
              <div
                data-transition-resize-handle="right"
                className={cn(
                  "absolute right-0 top-0 bottom-0 z-50 cursor-ew-resize touch-none pointer-events-auto",
                  `bg-${colorScheme.handle}/40 backdrop-blur-sm hover:bg-${colorScheme.handle}/60`,
                  `border-l-2 border-r-2 border-${colorScheme.accent}/60 rounded-r-[4px]`,
                  "transition-opacity duration-200 ease-in-out",
                  isHovering || isSelected ? "opacity-100" : "opacity-0"
                )}
                style={{ width: '16px', minWidth: '16px' }}
                onMouseDown={(e) => handleResizeMouseDown(e, 'right')}
                onClick={(e) => {
                  e.stopPropagation();
                  e.nativeEvent.stopImmediatePropagation();
                }}
              >
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-[2.5px] h-[18px] bg-white rounded-full shadow-[0_0_6px_rgba(0,0,0,0.9)]" />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Info overlay */}
      {isSelected && infoOverlayRect && createPortal(
        <div
          ref={infoOverlayRef}
          className="fixed z-[9999] bg-black/95 border border-white/10 rounded px-2 py-1.5 shadow-lg flex items-center gap-2"
          style={{
            left: infoOverlayRect.left + (infoOverlayRect.width / 2),
            top: infoOverlayRect.top - 32,
            transform: 'translateX(-50%)',
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
          }}
        >
          <div className="flex items-center gap-1.5">
            <Shuffle className={cn(
              "w-3 h-3 flex-shrink-0",
              isBoundary ? "text-purple-400" : "text-blue-400"
            )} />
            <span className="text-xs text-white font-medium">
              {displayDuration.toFixed(1)}s
              {resizeDelta !== 0 && (
                <span className={cn(
                  "ml-1",
                  resizeDelta > 0 ? "text-green-400" : "text-red-400"
                )}>
                  ({resizeDelta > 0 ? '+' : ''}{resizeDelta.toFixed(1)}s)
                </span>
              )}
            </span>
          </div>
          
          {isBoundary && (
            <div className="text-xs text-white/60 border-l border-white/20 pl-2">
              Between
            </div>
          )}
          
          {!trackLocked && (
            <button
              onClick={handleDelete}
              onMouseDown={(e) => {
                e.stopPropagation();
                e.nativeEvent.stopImmediatePropagation();
              }}
              className="p-1 hover:bg-red-500/20 rounded transition-colors flex-shrink-0"
              title="Delete transition"
            >
              <Trash2 className="w-3 h-3 text-red-400 hover:text-red-300" />
            </button>
          )}
        </div>,
        document.body
      )}
    </>
  );
};

export default TransitionOverlay;
