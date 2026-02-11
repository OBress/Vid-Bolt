import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { TimelineMarkers, MemoizedTimelineTrack, TimelineGhostMarker, TimelineMarker, TimelineGuidelines, TimelineGapOverlay } from './';
import { TimelineMarqueeSelection } from './timeline-marquee-selection';
import { TimelineInsertionLine } from './timeline-insertion-line';
import { TimelineMagneticInsertionIndicator } from './timeline-magnetic-insertion-indicator';
import { TimelineZoomSelectionOverlay } from './timeline-zoom-selection-overlay';
import { TrackInsertionIndicator } from './track-insertion-indicator';
import { TimelineContentProps, isVideoTrackItem, isAudioTrackItem } from '../types';
import { useTimelineDragAndDrop } from '../hooks/use-timeline-drag-and-drop';
import { useMediaDrop } from '../hooks/use-media-drop';
import { useMarqueeSelection } from '../hooks/use-marquee-selection';
import { useTimelineZoomSelection } from '../hooks/use-timeline-zoom-selection';
import { useVideoEditorStore, selectDragState, selectDragVisuals, getCurrentDrag, endDrag } from '../../../stores/video-editor-store';
import { TIMELINE_CONSTANTS, VIRTUAL_SCROLL_CONSTANTS } from '../constants';

/**
 * Timeline content area component that contains all the zoomable timeline elements
 * Separated from main Timeline component for better organization
 */
export const TimelineContent: React.FC<TimelineContentProps> = ({
  tracks,
  totalDuration, // compositionDuration - actual content duration
  viewportDuration,
  currentFrame,
  fps,
  zoomScale,
  // Virtual scroll props
  scrollX = 0,
  scrollY = 0,
  onScrollXChange,
  onScrollYChange,
  getVisibleTimeRange,
  getContentTransform,
  // Other props
  onFrameChange,
  onItemSelect,
  onDeleteItems,
  onDuplicateItems,
  onSplitItems,
  selectedItemIds = [],
  onSelectedItemsChange,
  onItemMove,
  onItemResize,
  onNewItemDrop,
  timelineRef,
  ghostMarkerPosition,
  isContextMenuOpen,
  onMouseMove,
  onMouseLeave,
  onInsertTrackAt,
  onInsertMultipleTracksAt,
  onCreateTracksWithItems,
  showTimelineGuidelines = true,
  onContextMenuOpenChange,
  splittingEnabled = false,
  hideItemsOnDrag = false,
  trackHeight = TIMELINE_CONSTANTS.TRACK_HEIGHT,
  onCloseGap,
  // Transition props
  isDraggingTransition = false,
  draggingTransitionIsVideo = null,
  selectedTransition = null,
  onTransitionDrop,
  onBoundaryTransitionDrop,
  onTransitionSelect,
  onTransitionDeselect,
  onTransitionTimesChange,
  onTransitionRemove,
  onZoomToRange,
  // Link props
  canLinkItems,
  areItemsLinked,
  isItemLinked,
  getLinkGroupSize,
  getLinkedItemIds,
  onLinkItems,
  onUnlinkItems,
  // Effect drop
  onEffectDrop,
  // Composition editor
  onOpenCompositionEditor,
}) => {
  // Check if we're using virtual scroll (new system) or native scroll (legacy)
  const useVirtualScroll = onScrollXChange !== undefined;
  const currentTime = currentFrame / fps;
  
  // Track container width for Premiere Pro-style scaling
  const [containerWidth, setContainerWidth] = useState(1000); // Default fallback
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Measure container width on mount and resize
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };
    
    updateWidth();
    
    const resizeObserver = new ResizeObserver(updateWidth);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    
    return () => resizeObserver.disconnect();
  }, []);

  
  // PREMIERE PRO-STYLE SCALING - PIXEL-BASED POSITIONING
  // 
  // The key to making this work like Premiere Pro:
  // 1. pixelsPerSecond is LOCKED at a given zoom level (only changes with zoom)
  // 2. Items are positioned at: item.start * pixelsPerSecond PIXELS
  // 3. Container width EXTENDS in pixels when content grows
  // 4. The visible viewport stays the same - user must scroll to see new content
  //
  // CRITICAL: scrollableWidth must NOT depend on containerWidth to avoid feedback loops!
  // The container measures its own width, so if content width depends on container width,
  // we get an infinite loop where content grows -> container grows -> content grows...
  
  // Calculate pixels per second - STABLE, only depends on zoom
  // This is the key value: 1 second = X pixels, and X stays constant at a given zoom level
  const pixelsPerSecond = useMemo(() => {
    if (containerWidth <= 0 || viewportDuration <= 0) return 100;
    return containerWidth / viewportDuration;
  }, [containerWidth, viewportDuration]);
  
  // Calculate scrollable duration (time extent) - INDEPENDENT of containerWidth
  // Uses centralized calculation to ensure consistency with virtual scroll
  const scrollableDuration = useMemo(() => {
    return VIRTUAL_SCROLL_CONSTANTS.getScrollableDuration(totalDuration);
  }, [totalDuration]);
  
  // Calculate scrollable width as PERCENTAGE of container
  // Using percentage avoids the feedback loop entirely - the content width is
  // expressed relative to container, not as an absolute value that could grow the container
  // scrollableDuration / viewportDuration = how many "viewports" wide the content should be
  const scrollableWidthPercent = useMemo(() => {
    if (viewportDuration <= 0) return 100;
    return (scrollableDuration / viewportDuration) * 100;
  }, [scrollableDuration, viewportDuration]);
  
  // Use percentage-based width to avoid the feedback loop entirely
  const scrollableWidth = `${scrollableWidthPercent}%`;
  
  // Get visible time range for playhead positioning
  // Playhead uses viewport-relative positioning (unified coordinate system)
  // IMPORTANT: Must include scrollX and zoomScale as dependencies so this recalculates when scroll/zoom changes
  const visibleTimeRange = useMemo(() => {
    if (getVisibleTimeRange) {
      return getVisibleTimeRange();
    }
    // Fallback if getVisibleTimeRange not available
    return { startTime: 0, endTime: viewportDuration || 60 };
  }, [getVisibleTimeRange, viewportDuration, scrollX, zoomScale]);
  
  // Initialize zoom selection hook
  const {
    isSelecting: isZoomSelecting,
    selectionState: zoomSelectionState,
    handleMouseDown: handleZoomSelectionMouseDown,
    getSelectionPercentages,
  } = useTimelineZoomSelection({
    totalDuration: scrollableDuration, // Use scrollable duration for stable positioning
    zoomScale,
    onZoomToRange,
  });

  // Get state from unified video editor store using individual selectors (performance optimized)
  const dragState = useVideoEditorStore(selectDragState);
  const dragVisuals = useVideoEditorStore(selectDragVisuals);
  
  // Extract visual state
  const ghostElements = dragVisuals?.ghostElements ?? null;
  const snapLine = dragVisuals?.snapLine ?? null;
  const trackInsertion = dragVisuals?.trackInsertion ?? null;
  
  // Playhead dragging state (separate from item/transition drag)
  const [isPlayheadDragging, setIsPlayheadDragging] = useState(false);
  
  // Local state for timeline-specific UI
  const [insertionIndex, setInsertionIndex] = useState<number | null>(null);
  const timelineRefLocal = useRef<HTMLDivElement | null>(null);
  
  // Derive drag state from unified dragState
  const draggedItem = dragState?.clipId ? { id: dragState.clipId } : null;
  const isValidDrop = dragState?.isValidDrop ?? true;
  
  // Determine drag type category
  const isClipDrag = dragState?.type?.startsWith('clip-') ?? false;
  const isTransitionDrag = dragState?.type === 'video-transition' || 
                           dragState?.type === 'audio-transition' ||
                           dragState?.type === 'transition-move' ||
                           dragState?.type === 'transition-resize';
  const isNewItemDrag = dragState?.type === 'media' || dragState?.type === 'clip' || dragState?.type === 'text-preset' || dragState?.type === 'shape-preset';
  
  const activeDragType = isClipDrag ? 'item' : 
                         isTransitionDrag ? 'transition' :
                         isNewItemDrag ? 'newItem' : null;
  
  const newItemDragState = isNewItemDrag && dragState ? {
    isDragging: true,
    itemType: dragState.newItemType || 'video',
    ghostElement: ghostElements?.[0] || null,
    itemData: {
      type: dragState.newItemType,
      label: undefined,
      thumbnailUrl: dragState.thumbnailUrl,
    },
  } : null;
  
  const currentDragPosition = dragState ? {
    startTime: dragState.currentTime,
    trackId: dragState.currentTrackId,
  } : null;

  // Derive isDragging from drag type
  const isDragging = isClipDrag;
  const isAnyDragActive = dragState !== null;

  
  // Initialize drag and drop functionality
  const { handleDragStart, handleDrag, handleDragEnd } = useTimelineDragAndDrop({
    totalDuration: scrollableDuration, // Use scrollable duration for stable positioning
    tracks,
    onItemMove,
    onItemResize,
    timelineRef: timelineRef!,
    onInsertTrackAt,
    onInsertMultipleTracksAt,
    onCreateTracksWithItems,
    selectedItemIds,
    trackHeight,
    getLinkedItemIds, // Pass linked items lookup for Premiere Pro-style linked movement
  });

  // Initialize new media drop functionality (replaces legacy useNewItemDrag)
  const {
    handleDragOver: handleMediaDragOver,
    handleDrop: handleMediaDrop,
    handleDragLeave: handleMediaDragLeave,
    handleDragEnd: handleMediaDragEnd,
    handleDropOutside: handleMediaDropOutside,
    clearDragState: clearMediaDragState,
    getLastValidDrop,
    processDragAtPosition,
    processDropAtPosition,
  } = useMediaDrop({
    timelineRef: timelineRef!,
    totalDuration: scrollableDuration,
    tracks,
    trackHeight,
    onDrop: onNewItemDrop,
    onInsertTrack: onInsertTrackAt ? (index, trackType) => {
      const newTrackId = onInsertTrackAt(index, trackType as any);
      return newTrackId;
    } : undefined,
  });
  
  // Track if we're handling a drag that goes outside timeline bounds
  const isHandlingOutsideDragRef = useRef(false);

  // Global drop handler - ensures drops work even when mouse is outside the timeline
  // Uses document-level listeners to capture drops anywhere on the page
  useEffect(() => {
    const handleGlobalDragOver = (e: DragEvent) => {
      // Check if we have an active media drag first
      const dragData = getCurrentDrag();
      const hasActiveDrag = dragData && (
        dragData.type === 'media' || 
        dragData.type === 'text-preset' || 
        dragData.type === 'shape-preset'
      );
      
      if (!hasActiveDrag) {
        // Remove cursor override if no active drag
        document.body.style.removeProperty('cursor');
        return; // Not our drag, ignore completely
      }
      
      // Check if inside timeline
      const timeline = timelineRef?.current;
      if (!timeline) {
        document.body.style.removeProperty('cursor');
        return;
      }
      
      const rect = timeline.getBoundingClientRect();
      const isInsideTimeline = (
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      );
      
      if (isInsideTimeline) {
        isHandlingOutsideDragRef.current = false;
        document.body.style.removeProperty('cursor');
        return; // Let timeline's native handler deal with it
      }
      
      // Outside timeline - we handle this
      isHandlingOutsideDragRef.current = true;
      
      // CRITICAL: Prevent default to allow drop when outside timeline bounds
      e.preventDefault();
      e.stopPropagation();
      
      // Override cursor to show it's a valid drop zone
      document.body.style.cursor = 'copy';
      
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
      
      // Clamp mouse position to timeline bounds for position calculation
      // This allows placing at time=0 or first track even when mouse is outside
      const clampedX = Math.max(rect.left, Math.min(rect.right, e.clientX));
      const clampedY = Math.max(rect.top, Math.min(rect.bottom, e.clientY));
      
      // Update drag position at clamped coordinates but hide the ghost preview
      // since mouse is outside timeline bounds
      processDragAtPosition(clampedX, clampedY, e.dataTransfer, true, true);
    };
    
    const handleGlobalDrop = (e: DragEvent) => {
      // Reset cursor override
      document.body.style.removeProperty('cursor');
      
      // Check if we have an active media drag
      const dragData = getCurrentDrag();
      const hasActiveDrag = dragData && (
        dragData.type === 'media' || 
        dragData.type === 'text-preset' || 
        dragData.type === 'shape-preset'
      );
      
      if (!hasActiveDrag) {
        return; // Not our drag, ignore
      }
      
      // Check if inside timeline
      const timeline = timelineRef?.current;
      if (!timeline) {
        // No timeline ref - fallback to last valid position
        const lastValid = getLastValidDrop();
        if (!lastValid) {
          clearMediaDragState();
          endDrag();
          return;
        }
        
        e.preventDefault();
        e.stopPropagation();
        handleMediaDropOutside();
        return;
      }
      
      const rect = timeline.getBoundingClientRect();
      const isInsideTimeline = (
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      );
      
      if (isInsideTimeline && !isHandlingOutsideDragRef.current) {
        return; // Let timeline's native handler deal with it
      }
      
      // Mouse is outside timeline OR we were handling the drag - clamp and drop
      e.preventDefault();
      e.stopPropagation();
      
      const clampedX = Math.max(rect.left, Math.min(rect.right, e.clientX));
      const clampedY = Math.max(rect.top, Math.min(rect.bottom, e.clientY));
      
      // Process drop at clamped coordinates
      processDropAtPosition(clampedX, clampedY, e.dataTransfer);
      isHandlingOutsideDragRef.current = false;
    };
    
    const handleGlobalDragEnd = (e: DragEvent) => {
      // Reset cursor override
      document.body.style.removeProperty('cursor');
      
      // If we were handling a drag outside the timeline, process it as a drop now
      // This is necessary because the browser doesn't fire 'drop' events outside the element
      if (isHandlingOutsideDragRef.current) {
        const dragData = getCurrentDrag();
        if (dragData && (
          dragData.type === 'media' || 
          dragData.type === 'text-preset' || 
          dragData.type === 'shape-preset'
        )) {
          const timeline = timelineRef?.current;
          if (timeline) {
            // Use the mouse position at dragend to determine drop location
            const rect = timeline.getBoundingClientRect();
            const clampedX = Math.max(rect.left, Math.min(rect.right, e.clientX));
            const clampedY = Math.max(rect.top, Math.min(rect.bottom, e.clientY));
            
            // Process the drop at the clamped position
            processDropAtPosition(clampedX, clampedY, null);
          }
        }
      }
      
      isHandlingOutsideDragRef.current = false;
      clearMediaDragState();
    };
    
    // Use capture phase to get events before they're handled elsewhere
    document.addEventListener('dragover', handleGlobalDragOver, true);
    document.addEventListener('drop', handleGlobalDrop, true);
    document.addEventListener('dragend', handleGlobalDragEnd, true);
    
    return () => {
      document.removeEventListener('dragover', handleGlobalDragOver, true);
      document.removeEventListener('drop', handleGlobalDrop, true);
      document.removeEventListener('dragend', handleGlobalDragEnd, true);
    };
  }, [timelineRef, getLastValidDrop, handleMediaDropOutside, clearMediaDragState, processDragAtPosition, processDropAtPosition]);

  // Initialize marquee selection
  const {
    isMarqueeSelecting,
    marqueeStartPoint,
    marqueeEndPoint,
    handleTimelineMouseDown: marqueeHandleTimelineMouseDown,
    handleMarqueeMouseMove,
    handleMarqueeMouseUp,
  } = useMarqueeSelection({
    timelineRef: timelineRef!,
    tracks,
    totalDuration: scrollableDuration, // Use scrollable duration for stable positioning
    selectedItemIds,
    onSelectedItemsChange: onSelectedItemsChange || (() => {}),
    isDragging,
    isContextMenuOpen,
    onTransitionDeselect,
  });

  // Refs to store handlers so they can be accessed synchronously
  const handleDragRef = useRef(handleDrag);
  const handleDragEndRef = useRef(handleDragEnd);
  const timelineRefStable = useRef(timelineRef);
  
  // Keep refs updated
  useEffect(() => {
    handleDragRef.current = handleDrag;
    handleDragEndRef.current = handleDragEnd;
    timelineRefStable.current = timelineRef;
  }, [handleDrag, handleDragEnd, timelineRef]);

  // Helper to get current drag type from unified store
  const getDragTypeFromStore = () => {
    const store = useVideoEditorStore.getState();
    
    // Check dragState for active drag type
    if (store.dragState) {
      const type = store.dragState.type;
      if (type.startsWith('clip-')) return 'item';
      if (type === 'media' || type === 'clip' || type === 'effect' || type === 'mask' || type === 'text-preset') return 'newItem';
      if (type.includes('transition')) return 'transition';
    }
    
    return null;
  };

  // Global mouse handlers for timeline item drag detection
  // CRITICAL: Attach listeners immediately on mount and check drag state inside handlers
  // This avoids the race condition where state updates don't happen before mouseup
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      // Check drag state synchronously from store
      const currentDragType = getDragTypeFromStore();
      if (currentDragType !== 'item') return;
      
      // Only handle left mouse button drag events (buttons=1 means left button is held)
      if (e.buttons !== 1) return;
      
      // Check if mouse is outside timeline bounds
      const currentTimelineRef = timelineRefStable.current;
      const timelineRect = currentTimelineRef?.current?.getBoundingClientRect();
      if (!timelineRect) return;

      const isOutsideTimeline = (
        e.clientX < timelineRect.left ||
        e.clientX > timelineRect.right ||
        e.clientY < timelineRect.top ||
        e.clientY > timelineRect.bottom
      );

      if (isOutsideTimeline) {
        // Still call handleDrag to maintain drag state, but with clamped coordinates
        const clampedX = Math.max(timelineRect.left, Math.min(timelineRect.right, e.clientX));
        const clampedY = Math.max(timelineRect.top, Math.min(timelineRect.bottom, e.clientY));
        handleDragRef.current(clampedX, clampedY);
      } else {
        // Normal drag handling when inside timeline
        handleDragRef.current(e.clientX, e.clientY);
      }
    };

    const handleGlobalMouseUp = (e: MouseEvent) => {
      // Check drag state synchronously from store
      const currentDragType = getDragTypeFromStore();
      if (currentDragType !== 'item') return;
      
      // Only handle left mouse button releases
      if (e.button !== 0) return;
      
      // Auto-trigger drag end when mouse is released anywhere
      handleDragEndRef.current();
    };

    // Touch event handlers for global touch drag operations
    const handleGlobalTouchMove = (e: TouchEvent) => {
      // Check drag state synchronously from store
      const currentDragType = getDragTypeFromStore();
      if (currentDragType !== 'item') return;
      
      // Prevent default scrolling during drag operations
      e.preventDefault();
      
      const touch = e.touches[0];
      if (!touch) return;
      
      // Check if touch is outside timeline bounds
      const currentTimelineRef = timelineRefStable.current;
      const timelineRect = currentTimelineRef?.current?.getBoundingClientRect();
      if (!timelineRect) return;

      const isOutsideTimeline = (
        touch.clientX < timelineRect.left ||
        touch.clientX > timelineRect.right ||
        touch.clientY < timelineRect.top ||
        touch.clientY > timelineRect.bottom
      );

      if (isOutsideTimeline) {
        // Still call handleDrag to maintain drag state, but with clamped coordinates
        const clampedX = Math.max(timelineRect.left, Math.min(timelineRect.right, touch.clientX));
        const clampedY = Math.max(timelineRect.top, Math.min(timelineRect.bottom, touch.clientY));
        handleDragRef.current(clampedX, clampedY);
      } else {
        // Normal drag handling when inside timeline
        handleDragRef.current(touch.clientX, touch.clientY);
      }
    };

    const handleGlobalTouchEnd = () => {
      // Check drag state synchronously from store
      const currentDragType = getDragTypeFromStore();
      if (currentDragType !== 'item') return;
      
      // Auto-trigger drag end when touch is released anywhere
      handleDragEndRef.current();
    };

    // Add global listeners immediately on mount
    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', handleGlobalMouseUp);
    document.addEventListener('touchmove', handleGlobalTouchMove, { passive: false });
    document.addEventListener('touchend', handleGlobalTouchEnd);

    // Cleanup on unmount
    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
      document.removeEventListener('touchmove', handleGlobalTouchMove);
      document.removeEventListener('touchend', handleGlobalTouchEnd);
    };
  }, []); // Empty deps - attach once on mount, check state inside handlers

  // SAFETY: Global mouseup listener to clear any stuck drag state
  // This is a fallback in case individual drag handlers fail to clean up
  useEffect(() => {
    const handleSafetyMouseUp = () => {
      // Check if there's a drag in progress that might be stuck
      const store = useVideoEditorStore.getState();
      const currentDragType = getDragTypeFromStore();
      
      // If transition drag is active but no mouse is pressed, clean it up
      if (currentDragType === 'transition') {
        // Small delay to allow normal handlers to process first
        setTimeout(() => {
          const stillDragType = getDragTypeFromStore();
          
          // If still active after handlers had a chance to run, force cleanup
          if (stillDragType === 'transition') {
            useVideoEditorStore.getState().endDrag();
          }
        }, 50);
      }
    };
    
    document.addEventListener('mouseup', handleSafetyMouseUp);
    return () => document.removeEventListener('mouseup', handleSafetyMouseUp);
  }, []);

  // Enhanced mouse move handler that combines original behavior with drag handling
  const enhancedMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Call original mouse move handler
      onMouseMove?.(e);
      
      // Handle marquee selection (drag handling is now done globally)
      handleMarqueeMouseMove(e);
    },
    [onMouseMove, handleMarqueeMouseMove]
  );

  // Enhanced touch move handler for timeline interactions
  const enhancedTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      // Only handle marquee selection if we're not currently dragging anything
      if (!isAnyDragActive) {
        // Convert touch event to mouse-like event for marquee selection
        const touch = e.touches[0];
        if (touch) {
          const syntheticMouseEvent = {
            ...e,
            clientX: touch.clientX,
            clientY: touch.clientY,
            button: 0,
            buttons: 1,
            movementX: 0,
            movementY: 0,
            pageX: touch.pageX,
            pageY: touch.pageY,
            screenX: touch.screenX,
            screenY: touch.screenY,
            offsetX: 0,
            offsetY: 0,
          } as unknown as React.MouseEvent<HTMLDivElement>;
          
          handleMarqueeMouseMove(syntheticMouseEvent);
        }
      }
    },
    [isAnyDragActive, handleMarqueeMouseMove]
  );

  // Enhanced mouse up handler
  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Handle marquee selection
      handleMarqueeMouseUp(e);
      // Drag end is now handled globally, so we don't need to handle it here
    },
    [handleMarqueeMouseUp]
  );

  // Enhanced touch end handler
  const handleTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      // Convert touch event to mouse-like event for marquee selection
      if (!isAnyDragActive && e.changedTouches[0]) {
        const touch = e.changedTouches[0];
        const syntheticMouseEvent = {
          ...e,
          clientX: touch.clientX,
          clientY: touch.clientY,
          button: 0,
          buttons: 1,
          movementX: 0,
          movementY: 0,
          pageX: touch.pageX,
          pageY: touch.pageY,
          screenX: touch.screenX,
          screenY: touch.screenY,
          offsetX: 0,
          offsetY: 0,
        } as unknown as React.MouseEvent<HTMLDivElement>;
        
        handleMarqueeMouseUp(syntheticMouseEvent);
      }
    },
    [isAnyDragActive, handleMarqueeMouseUp]
  );

  // Enhanced mouse down handler for marquee selection
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      marqueeHandleTimelineMouseDown(e);
    },
    [marqueeHandleTimelineMouseDown]
  );

  // Enhanced touch start handler for marquee selection
  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      // Prevent default to avoid scrolling during interactions
      e.preventDefault();
      
      // Convert touch event to mouse-like event for marquee selection
      const touch = e.touches[0];
      if (touch) {
        const syntheticMouseEvent = {
          ...e,
          clientX: touch.clientX,
          clientY: touch.clientY,
          button: 0,
          buttons: 1,
          movementX: 0,
          movementY: 0,
          pageX: touch.pageX,
          pageY: touch.pageY,
          screenX: touch.screenX,
          screenY: touch.screenY,
          offsetX: 0,
          offsetY: 0,
        } as unknown as React.MouseEvent<HTMLDivElement>;
        
        marqueeHandleTimelineMouseDown(syntheticMouseEvent);
      }
    },
    [marqueeHandleTimelineMouseDown]
  );

  // Virtual scroll: get transform offset for content positioning
  const virtualTransform = useMemo(() => {
    if (getContentTransform) {
      return getContentTransform();
    }
    return { x: 0, y: 0 };
  }, [getContentTransform, scrollX, scrollY, zoomScale]); // Re-calculate when scroll or zoom changes

  // VIRTUALIZATION: Only render items that are visible in the current viewport
  // This significantly improves performance for large timelines
  const virtualizedTracks = useMemo(() => {
    // If virtual scroll is not active or getVisibleTimeRange is not available, render all
    if (!getVisibleTimeRange) {
      return tracks;
    }
    
    const visibleRange = getVisibleTimeRange();
    // Add buffer to avoid popping (render items slightly outside viewport)
    const buffer = (visibleRange.endTime - visibleRange.startTime) * 0.5;
    const bufferedStart = Math.max(0, visibleRange.startTime - buffer);
    const bufferedEnd = visibleRange.endTime + buffer;
    
    // Filter each track's items to only those in the visible range
    return tracks.map(track => ({
      ...track,
      items: track.items.filter(item => {
        // Item is visible if it overlaps with the buffered visible range
        return item.end >= bufferedStart && item.start <= bufferedEnd;
      }),
    }));
  }, [tracks, getVisibleTimeRange, scrollX, zoomScale]); // Re-filter when scroll or zoom changes

  // Timeline-level drop handler for new items
  const handleTimelineDrop = useCallback(
    (e: React.DragEvent) => {
      // IMPORTANT: Check if this is a transition drop first!
      // If it is, let the boundary/item drop zones handle it - DON'T intercept
      const dragData = getCurrentDrag();
      if (dragData && (dragData.type === 'video-transition' || dragData.type === 'audio-transition')) {
        // This is a transition drop - don't handle it here
        // The boundary drop zone or item drop zone will handle it
        return;
      }

      // Delegate to new media drop handler
      handleMediaDrop(e);
    },
    [handleMediaDrop]
  );

  // Get the timeline content style using scrollableWidth
  const timelineContentStyle = useMemo(() => ({
    width: scrollableWidth,
    minWidth: '100%',
    willChange: 'width' as const,
    transform: 'translateZ(0)',
  }), [scrollableWidth]);

  // Memoized callback for time click events - prevents re-renders of child components
  const handleTimeClick = useCallback((timeInSeconds: number) => {
    const frame = Math.round(timeInSeconds * fps);
    onFrameChange?.(frame);
  }, [fps, onFrameChange]);

  return (
    <div 
      ref={containerRef}
      className="flex flex-col h-full relative"
      style={{
        // Initialize CSS custom properties for ghost marker and timeline marker at root level so overlay can access them
        '--ghost-marker-position': '0%',
        '--ghost-marker-visible': '0',
        '--timeline-marker-position': undefined, // Will be set by clicks, otherwise use calculated position
        // Explicit overflow properties to avoid React warning about mixing shorthand and non-shorthand
        overflowX: 'hidden',
        overflowY: 'hidden',
      } as React.CSSProperties}
    >
      {/* Fixed Markers at the top - horizontal scroll controlled by navigator */}
      <div 
        className="timeline-markers-wrapper flex-shrink-0"
        style={{
          // Virtual scroll - content positioned via transforms, no native scroll
          overflowX: 'hidden',
          overflowY: 'hidden',
        }}
      >
        <div 
          className="timeline-markers-content"
          style={{
            ...timelineContentStyle,
            // Virtual scroll: position content via transform
            transform: `translateX(${virtualTransform.x}px)`,
          }}
          onMouseMove={enhancedMouseMove}
          onMouseLeave={onMouseLeave}
        >
          <TimelineMarkers
            totalDuration={scrollableDuration}
            onTimeClick={handleTimeClick}
            onDragStateChange={setIsPlayheadDragging}
            zoomScale={zoomScale}
            fps={fps}
            onZoomSelectionStart={handleZoomSelectionMouseDown}
            isZoomSelecting={isZoomSelecting}
          />
        </div>
      </div>

      {/* Tracks area - horizontal scroll controlled by navigator */}
      <div 
        className="timeline-tracks-scroll-container flex-1"
        data-timeline-scroll-container
        style={{ 
          // Virtual scroll - content positioned via transforms, no native scroll
          overflowX: 'hidden',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
        }}
      >
        <div 
          ref={timelineRef}
          className="timeline-zoomable-content relative"
          style={{
            ...timelineContentStyle,
            minHeight: 'fit-content',
            // Virtual scroll: position content via transform (X for horizontal, Y for vertical)
            transform: `translate(${virtualTransform.x}px, ${virtualTransform.y}px)`,
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={enhancedMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={onMouseLeave}
          onDragOver={handleMediaDragOver}
          onDragEnd={handleMediaDragEnd}
          onDragLeave={handleMediaDragLeave}
          onDrop={handleTimelineDrop}
          onTouchStart={handleTouchStart}
          onTouchMove={enhancedTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="timeline-tracks-container" style={{
            contentVisibility: 'auto',
            containIntrinsicSize: 'auto 500px',
          }}>
            {/* Spacer to match "Add Video Track" button height in track handles */}
            <div className="h-7 bg-neutral-900 border-b border-neutral-700" />
            
            {(() => {
              // Check if we need a bottom spacer for audio tracks
              const hasAudioTracks = tracks.some(t => t.type === 'audio');
              const audioStartIndex = tracks.findIndex(t => t.type === 'audio');
              const needsBottomAudioSpacer = !hasAudioTracks || audioStartIndex === -1;
              
              return (
                <>
                  {/* Use virtualizedTracks for rendering (filters to visible items) */}
                  {virtualizedTracks.map((track, index) => {
            // Find all ghost elements that belong to this track
            const trackGhostElements = ghostElements?.filter(ghost => {
              // Use the same calculation as ghost creation to avoid floating-point precision issues
              // Ghost creation: trackIndex * (100 / tracks.length) = ghost.top
              // So: trackIndex = ghost.top / (100 / tracks.length) = ghost.top * tracks.length / 100
              const calculatedIndex = Math.round(ghost.top * tracks.length / 100);
              
              return calculatedIndex === index;
            }) || [];

            // Check if we need to render a divider before this track
            // Divider appears between video and audio tracks (like Premiere Pro)
            const previousTrack = index > 0 ? tracks[index - 1] : null;
            const isTransitionToAudio = previousTrack?.type === 'video' && track.type === 'audio';

            return (
              <React.Fragment key={track.id}>
                {/* Video/Audio track divider - matches Add Audio Track button height in handles */}
                {isTransitionToAudio && (
                  <div 
                    className="track-section-divider bg-neutral-800 border-b border-neutral-700" 
                    style={{ height: 'calc(var(--timeline-track-height, 48px) / 2)' }}
                  />
                )}
                <MemoizedTimelineTrack
                  track={track}
                  trackIndex={index}
                  trackCount={tracks.length}
                  totalDuration={scrollableDuration}
                  onItemSelect={onItemSelect}
                  onDeleteItems={onDeleteItems}
                  onDuplicateItems={onDuplicateItems}
                  onSplitItems={onSplitItems}
                  selectedItemIds={selectedItemIds}
                  onSelectedItemsChange={onSelectedItemsChange}
                  onItemMove={onItemMove}
                  onDragStart={handleDragStart}
                  zoomScale={zoomScale}
                  isDragging={isDragging}
                  draggedItemId={draggedItem?.id}
                  ghostElements={ghostElements ?? undefined}
                  isValidDrop={isValidDrop}
                  newItemDragData={newItemDragState?.itemData}
                  onContextMenuOpenChange={onContextMenuOpenChange}
                  splittingEnabled={splittingEnabled}
                  hideItemsOnDrag={hideItemsOnDrag}
                  currentFrame={currentFrame}
                  fps={fps}
                  trackHeight={trackHeight}
                  onTimeClick={handleTimeClick}
                  // Transition props
                  isDraggingTransition={isDraggingTransition}
                  draggingTransitionIsVideo={draggingTransitionIsVideo}
                  selectedTransition={selectedTransition}
                  onTransitionDrop={onTransitionDrop}
                  onBoundaryTransitionDrop={onBoundaryTransitionDrop}
                  onTransitionSelect={onTransitionSelect}
                  onTransitionDeselect={onTransitionDeselect}
                  onTransitionTimesChange={onTransitionTimesChange}
                  onTransitionRemove={onTransitionRemove}
                  // Link props
                  canLinkItems={canLinkItems}
                  areItemsLinked={areItemsLinked}
                  isItemLinked={isItemLinked}
                  getLinkGroupSize={getLinkGroupSize}
                  getLinkedItemIds={getLinkedItemIds}
                  onLinkItems={onLinkItems}
                  onUnlinkItems={onUnlinkItems}
                  // Effect drop
                  onEffectDrop={onEffectDrop}
                  // Composition editor
                  onOpenCompositionEditor={onOpenCompositionEditor}
                />
              </React.Fragment>
            );
          })}
                  
                  {/* Spacer for "Add Audio Track" button when there are no audio tracks */}
                  {needsBottomAudioSpacer && (
                    <div 
                      className="track-section-divider bg-neutral-800 border-b border-neutral-700" 
                      style={{ height: 'calc(var(--timeline-track-height, 48px) / 2)' }}
                    />
                  )}
                  
                  {/* Bottom padding spacer - half track height for visual comfort when scrolled */}
                  <div 
                    className="bg-black" 
                    style={{ height: 'calc(var(--timeline-track-height, 48px) / 2)' }}
                  />
                </>
              );
            })()}
          </div>

          {/* Timeline Guidelines */}
          {showTimelineGuidelines && (
            <TimelineGuidelines
              tracks={tracks}
              totalDuration={scrollableDuration}
              isDragging={isDragging}
              draggedItemId={draggedItem?.id}
              currentDragPosition={currentDragPosition as any}
            />
          )}

          {/* Gap overlay for closing gaps (when gap tool is active) */}
          {onCloseGap && (
            <TimelineGapOverlay
              tracks={tracks}
              totalDuration={scrollableDuration}
              onCloseGap={onCloseGap}
              trackHeight={trackHeight}
            />
          )}

          {/* Insertion indicator (between tracks) */}
          <TimelineInsertionLine
            insertionIndex={insertionIndex}
            trackCount={tracks.length}
            trackHeight={trackHeight}
          />
          
          {/* Magnetic snap indicator - shows snap line between tracks being snapped */}
          {snapLine && (
            <TimelineMagneticInsertionIndicator
              insertionStart={snapLine.insertionTime}
              totalDuration={scrollableDuration}
              trackHeight={trackHeight}
              trackIndex={snapLine.trackIndex}
              snappedToTrackIndex={snapLine.snappedToTrackIndex}
              trackCount={tracks.length}
              tracks={tracks.map(t => ({ type: t.type }))}
            />
          )}
          
          {/* Track insertion indicator - shows where new track will be added */}
          {trackInsertion && (
            <TrackInsertionIndicator
              insertions={trackInsertion.insertions}
              trackHeight={trackHeight}
              trackCount={tracks.length}
              spacerHeight={28}
              tracks={tracks.map(t => ({ type: t.type }))}
            />
          )}
          
          {/* Marquee Selection */}
          <TimelineMarqueeSelection
            isMarqueeSelecting={isMarqueeSelecting}
            marqueeStartPoint={marqueeStartPoint}
            marqueeEndPoint={marqueeEndPoint}
          />
        </div>
      </div>
      
      {/* Zoom selection overlay - visible when user is Shift+dragging */}
      {zoomSelectionState && getSelectionPercentages() && (
        <div 
          className="absolute inset-0 pointer-events-none overflow-hidden"
          style={{ zIndex: 48 }}
        >
          <div 
            className="h-full relative"
            style={{
              ...timelineContentStyle,
            }}
          >
            <TimelineZoomSelectionOverlay
              isSelecting={true}
              left={getSelectionPercentages()!.left}
              width={getSelectionPercentages()!.width}
              markersHeight={TIMELINE_CONSTANTS.MARKERS_HEIGHT}
              showFullHeight={true}
            />
          </div>
        </div>
      )}
      
      {/* Markers overlay - spans both markers and tracks sections */}
      {/* Playhead uses viewport-relative positioning (unified coordinate system) */}
      <div 
        className="absolute inset-0 pointer-events-none overflow-hidden"
        style={{ zIndex: 45 }}
      >
        {/* Container for playhead - NO transform needed, playhead positions relative to viewport */}
        <div 
          className="timeline-markers-overlay-content h-full relative"
        >
          {/* Current Frame Marker - spans full height, draggable head */}
          {/* Uses viewport-relative positioning for zoom-stable behavior */}
          <TimelineMarker
            currentFrame={currentFrame}
            totalDurationInFrames={Math.ceil(scrollableDuration * fps)}
            zoomScale={zoomScale}
            fps={fps}
            totalDuration={scrollableDuration}
            visibleStartTime={visibleTimeRange.startTime}
            viewportDuration={viewportDuration}
            onTimeChange={(timeInSeconds: number) => {
              const frame = Math.round(timeInSeconds * fps);
              onFrameChange?.(frame);
            }}
            onDragStateChange={setIsPlayheadDragging}
          />
          
          {/* Ghost Marker - spans full height */}
          <TimelineGhostMarker
            position={ghostMarkerPosition}
            isDragging={isDragging || isPlayheadDragging}
            isContextMenuOpen={isContextMenuOpen}
            isScrubbing={false}
            isSplittingEnabled={splittingEnabled}
            totalDuration={scrollableDuration}
            currentTime={currentTime}
            zoomScale={zoomScale}
          />
        </div>
      </div>
      
      {/* Floating ghost disabled - items now move directly */}
    </div>
  );
}; 