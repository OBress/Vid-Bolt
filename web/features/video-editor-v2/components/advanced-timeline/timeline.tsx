import React, { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle, useMemo } from 'react';
import { TimelineHeader, TimelineTrackHandles, TimelineContent } from './components';
import { TimelineNavigatorV2 } from './components/timeline-navigator-v2';
import { 
  useTimelineInteractions, 
  useTimelineTracks,
  useTimelineSettings,
  useTimelineOperations,
  useTimelineHistory,
  useTimelineShortcuts,
  useMobileDetection,
  useTimelineTransitions,
  useTimelineIntegration,
  useTimelineLinks,
  useVirtualScroll,
} from './hooks';
import { TimelineProps, TimelineRef } from './types';
import { clearTimelineMarkerPosition } from './utils';
import { ZOOM_CONSTRAINTS, TIMELINE_CONSTANTS } from './constants';
import { useVideoEditorStore, selectDragType } from '../../stores/video-editor-store';

/**
 * Timeline Component with Comprehensive Theming Support
 * 
 * This component now uses CSS custom properties for theming, providing:
 * - Consistent color usage across light, dark, and RVE themes
 * - Smooth transitions between theme changes
 * - Proper semantic color mapping for timeline elements
 * 
 * Theme Variables Used:
 * - --background: Main timeline container background
 * - --surface: Timeline content area background
 * - --surface-elevated: Track handles and header backgrounds
 * - --border: All border colors
 * - --timeline-row: Individual track row backgrounds
 * - --timeline-tick: Marker tick colors
 * - --timeline-item-selected-border: Selected timeline item borders
 * - --interactive-hover: Hover states for interactive elements
 * - --interactive-pressed: Active/pressed states
 * - --primary-50/300: Drop target highlighting
 * - --text-secondary: Marker labels
 * - --text-disabled: Disabled/overflow text
 */

// Re-export types for backward compatibility
export type { TimelineItem, TimelineTrack, TimelineProps } from './types';

export const Timeline = forwardRef<TimelineRef, TimelineProps>(({ 
  tracks: initialTracks, 
  totalDuration, 
  currentFrame = 0,
  fps = 30,
  onFrameChange,
  onItemMove,
  onItemResize,
  onItemSelect,
  onDeleteItems,
  onDuplicateItems,
  onSplitItems,
  selectedItemIds = [],
  onSelectedItemsChange,
  onTracksChange,
  onAddNewItem,
  onNewItemDrop,
  showZoomControls = false,
  isPlaying = false,
  onPlay,
  onPause,
  onSeekToStart,
  onSeekToEnd,
  showPlaybackControls = false,
  playbackRate = 1,
  setPlaybackRate,
  autoRemoveEmptyTracks = true,
  onAutoRemoveEmptyTracksChange,
  showTimelineGuidelines = true,
  showUndoRedoControls = false,
  hideItemsOnDrag = true,
  enableTrackDrag = true,
  enableTrackDelete = true,
  // Undo/Redo props from parent
  canUndo: parentCanUndo,
  canRedo: parentCanRedo,
  onUndo: parentOnUndo,
  onRedo: parentOnRedo,
  // Aspect ratio props
  aspectRatio,
  onAspectRatioChange,
  resolution,
  onResolutionChange,
  showAspectRatioControls = false,
  // Update present history ref
  updatePresentHistoryRef,
  // Compact mode props
  isCompact = false,
  onToggleCompact,
  trackHeight,
  trackItemHeight,
  // Collapse controls
  onCollapseChange,
  // Effect drop
  onEffectDrop,
  // Composition editor
  onOpenCompositionEditor,
  // Note: onTransitionSelectionChange is deprecated - store handles selection now
}, ref) => {
  const timelineRef = useRef<HTMLDivElement>(null);
  const timelineContainerRef = useRef<HTMLDivElement>(null);
  
  // Local collapse state - managed locally but reported to parent
  const [isCollapsed, setIsCollapsed] = useState(false);
  
  // Toggle collapse handler
  const handleToggleCollapse = useCallback(() => {
    const newCollapsed = !isCollapsed;
    setIsCollapsed(newCollapsed);
    onCollapseChange?.(newCollapsed);
  }, [isCollapsed, onCollapseChange]);
  
  // Detect mobile devices to adjust UX behavior
  const { isMobile } = useMobileDetection();
  
  // On mobile devices, don't hide items during drag to maintain better UX
  const effectiveHideItemsOnDrag = isMobile ? false : hideItemsOnDrag;
  
  // Container dimensions for virtual scroll calculations
  const [containerWidth, setContainerWidth] = useState(800);
  const [containerHeight, setContainerHeight] = useState(400);
  
  // Update container dimensions on resize
  // IMPORTANT: Subtract handle width to get actual content area width
  // The playhead and all coordinate calculations are relative to the content area, not the full container
  useEffect(() => {
    const updateDimensions = () => {
      if (timelineContainerRef.current) {
        // Content width is full width minus the track handles
        const fullWidth = timelineContainerRef.current.offsetWidth;
        const contentWidth = Math.max(100, fullWidth - TIMELINE_CONSTANTS.HANDLE_WIDTH);
        setContainerWidth(contentWidth);
        
        // For vertical scroll, we need just the tracks viewport height
        // Full height minus: header (52px) + markers (40px) + navigator (24px)
        const fullHeight = timelineContainerRef.current.offsetHeight;
        const nonScrollableHeight = TIMELINE_CONSTANTS.HEADER_HEIGHT + TIMELINE_CONSTANTS.MARKERS_HEIGHT + 24; // navigator is h-6 (24px)
        const tracksViewportHeight = Math.max(50, fullHeight - nonScrollableHeight);
        setContainerHeight(tracksViewportHeight);
      }
    };
    
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    
    // Also observe the container element
    const observer = new ResizeObserver(updateDimensions);
    if (timelineContainerRef.current) {
      observer.observe(timelineContainerRef.current);
    }
    
    return () => {
      window.removeEventListener('resize', updateDimensions);
      observer.disconnect();
    };
  }, []);
  
  // Settings hook (before tracks so autoRemove is available)
  const {
    isAutoRemoveEnabled,
    isSplittingEnabled,
    handleToggleAutoRemoveEmptyTracks,
    handleToggleSplitting,
  } = useTimelineSettings({ 
    autoRemoveEmptyTracks, 
    onAutoRemoveEmptyTracksChange 
  });
  
  // TRACKS HOOK: Must come before virtual scroll so we can compute compositionDuration
  const {
    tracks,
    setTracks,
    handleItemMove: internalItemMove,
    handleItemResize: internalItemResize,
    handleItemsDelete: internalItemsDelete,
    handleInsertTrackAt,
    handleInsertMultipleTracksAt,
    handleCreateTracksWithItems,
    handleTrackReorder,
    handleDeleteTrack,
    handleToggleLock,
    handleToggleVisibility,
    handleToggleMute,
    handleAddTrack,
    addNewItem,
    handleCloseGap,
  } = useTimelineTracks({ 
    initialTracks, 
    autoRemoveEmptyTracks: isAutoRemoveEnabled, 
    onTracksChange,
    selectedItemIds,
    onSelectedItemsChange
  });

  // Compute composition duration from tracks (max end time of all items)
  // This represents the ACTUAL content duration, not the scrollable area
  // The scrollable area (minimum 60s) is handled separately by getScrollableDuration
  const compositionDuration = useMemo(() => {
    let maxEndTime = totalDuration || 0;
    for (const track of tracks) {
      for (const item of track.items) {
        maxEndTime = Math.max(maxEndTime, item.end);
      }
    }
    // Just return actual content duration - scrollable area is handled by virtual scroll
    return maxEndTime;
  }, [tracks, totalDuration]);
  
  // Calculate content height for vertical scroll bounds
  // Includes: Add Video Track button (28px) + all tracks + dividers + Add Audio Track button + bottom spacer
  const contentHeight = useMemo(() => {
    const trackHeightValue = trackHeight || TIMELINE_CONSTANTS.TRACK_HEIGHT;
    const addVideoButtonHeight = 28; // h-7 = 28px
    const addAudioButtonHeight = trackHeightValue / 2; // Half track height
    const bottomSpacerHeight = trackHeightValue / 2; // Half track height for visual comfort
    const hasVideoTracks = tracks.some(t => t.type === 'video');
    const hasAudioTracks = tracks.some(t => t.type === 'audio');
    
    // Calculate total: Add Video button + all tracks + divider (if mixed) + bottom audio button (if no audio tracks) + bottom spacer
    let height = addVideoButtonHeight; // Add Video Track button
    height += tracks.length * trackHeightValue; // All tracks
    
    // Add divider between video and audio tracks
    if (hasVideoTracks && hasAudioTracks) {
      height += addAudioButtonHeight; // The "Add Audio Track" button between sections
    }
    
    // Add bottom audio button if no audio tracks
    if (!hasAudioTracks) {
      height += addAudioButtonHeight;
    }
    
    // Add bottom padding spacer
    height += bottomSpacerHeight;
    
    return height;
  }, [tracks, trackHeight]);
  
  // VIRTUAL SCROLL: Single source of truth for scroll and zoom
  // No native browser scroll - uses CSS transforms for positioning
  // Must come after tracks so compositionDuration is available
  const {
    scrollX,
    scrollY,
    zoomScale,
    viewportDuration,
    scrollableDuration,
    maxScrollY,
    setScrollX,
    setScrollY,
    setZoomScale,
    setZoomAndScrollX,
    scrollToTime,
    getVisibleTimeRange,
    getContentTransform,
    zoomAtPlayhead,
    handleWheel: handleVirtualWheel,
    reset: resetZoom,
    zoomToFit,
  } = useVirtualScroll({
    totalDuration: compositionDuration, // Use computed duration that includes all content
    containerWidth,
    containerHeight,
    contentHeight, // For vertical scroll bounds
    initialZoom: ZOOM_CONSTRAINTS.default,
  });

  // Initialize other hooks
  const {
    ghostMarkerPosition,
    isDragging,
    handleMouseMove,
    handleMouseLeave,
  } = useTimelineInteractions(timelineRef, zoomScale);

  // Current time in seconds based on frame and fps
  const currentTime = currentFrame / fps;

  // Timeline history for undo/redo
  const {
    undo: internalUndo,
    redo: internalRedo,
    canUndo: internalCanUndo,
    canRedo: internalCanRedo,
  } = useTimelineHistory(tracks, setTracks, onTracksChange, updatePresentHistoryRef);

  // Use parent undo/redo props if provided, otherwise use internal timeline history
  const undo = parentOnUndo || internalUndo;
  const redo = parentOnRedo || internalRedo;
  const canUndo = parentCanUndo !== undefined ? parentCanUndo : internalCanUndo;
  const canRedo = parentCanRedo !== undefined ? parentCanRedo : internalCanRedo;

  // Create handlePlayPause function for keyboard shortcuts
  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      onPause?.();
    } else {
      onPlay?.();
    }
  }, [isPlaying, onPlay, onPause]);

  // Frame stepping function for keyboard navigation (like Premiere Pro arrow keys)
  const handleFrameStep = useCallback((delta: number) => {
    if (onFrameChange) {
      const newFrame = Math.max(0, currentFrame + delta);
      onFrameChange(newFrame);
    }
  }, [currentFrame, onFrameChange]);

  // Link management hook (like Premiere Pro's item linking/grouping)
  // MUST be called before useTimelineShortcuts since shortcuts use these functions
  const {
    canLinkItems,
    areItemsLinked,
    isItemLinked,
    getLinkGroupSize,
    getLinkedItemIds,
    linkItems,
    unlinkItems,
    linkGroups,
  } = useTimelineLinks(tracks, setTracks);

  // Setup keyboard shortcuts with enhanced navigation
  useTimelineShortcuts({
    handlePlayPause,
    undo,
    redo,
    canUndo,
    canRedo,
    zoomScale,
    setZoomScale,
    // Pass new navigation props
    onFrameStep: handleFrameStep,
    onSeekToStart,
    onSeekToEnd,
    onPlay,
    onPause,
    isPlaying,
    playbackRate,
    setPlaybackRate,
    // Link/Unlink props
    onLink: () => linkItems(selectedItemIds),
    onUnlink: () => unlinkItems(selectedItemIds),
    canLink: canLinkItems(selectedItemIds),
    canUnlink: areItemsLinked(selectedItemIds),
    // Delete props
    onDeleteSelectedItems: () => handleCombinedItemsDelete(selectedItemIds),
    hasSelectedItems: selectedItemIds.length > 0,
  });

  // Manage transitions - use setTracks to update internal state, which triggers effect to call onTracksChange
  const {
    selectedTransition,
    isDraggingTransition,
    draggingTransitionIsVideo,
    setIsDraggingTransition,
    setDraggingTransitionIsVideo,
    handleTransitionDrop,
    handleBoundaryTransitionDrop,
    selectTransition: rawSelectTransition,
    clearTransitionSelection,
    updateTransitionTimes,
    removeTransition,
  } = useTimelineTransitions(tracks, setTracks);

  // NEW: Integration hook for unified drag management and first-class transitions
  // This provides track integrity checks and handles cleanup when items/tracks are deleted
  const {
    handleItemDeleted,
    handleTrackDeleted,
  } = useTimelineIntegration({
    tracks,
    onTracksChange,
    selectedItemIds,
    onSelectedItemsChange,
  });

  // Wrapper to clear timeline item selection when a transition is selected
  // This ensures transitions and timeline items are mutually exclusive selections
  const selectTransition = useCallback((itemId: string, position: "start" | "end") => {
    // Clear timeline item selection first
    onSelectedItemsChange?.([]);
    // Then select the transition (updates store, which notifies inspector)
    rawSelectTransition(itemId, position);
  }, [rawSelectTransition, onSelectedItemsChange]);

  // Wrapper for timeline item selection that clears transition selection
  const handleSelectedItemsChange = useCallback((itemIds: string[]) => {
    // Clear transition selection when selecting timeline items
    if (itemIds.length > 0) {
      clearTransitionSelection();
    }
    // Pass through to the external handler
    onSelectedItemsChange?.(itemIds);
  }, [clearTransitionSelection, onSelectedItemsChange]);

  // Wrapper to clear transition selection
  const handleClearTransitionSelection = useCallback(() => {
    clearTransitionSelection();
  }, [clearTransitionSelection]);

  // ============================================================
  // REACTIVE DRAG STATE DETECTION (No polling! Uses unified store)
  // ============================================================
  
  // Use reactive hook from unified video-editor-store - instant updates!
  const currentDragType = useVideoEditorStore(selectDragType);
  
  // Update transition drag state reactively based on unified store
  useEffect(() => {
    const isTransition = currentDragType === 'video-transition' || currentDragType === 'audio-transition';
    setIsDraggingTransition(isTransition);
    
    // Track whether it's a video or audio transition
    if (isTransition) {
      setDraggingTransitionIsVideo(currentDragType === 'video-transition');
    } else {
      setDraggingTransitionIsVideo(null);
    }
  }, [currentDragType, setIsDraggingTransition, setDraggingTransitionIsVideo]);
  
  const {
    handleExternalItemMove,
    handleExternalItemResize,
    handleExternalItemsDelete,
    handleExternalItemsDuplicate,
    handleExternalItemSplit,
    handleExternalAddNewItem,
  } = useTimelineOperations({
    onItemMove,
    onItemResize,
    onDeleteItems,
    onDuplicateItems,
    onSplitItems,
    onAddNewItem,
  });

  // Manage context menu state
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
  
  const handleContextMenuOpenChange = useCallback((isOpen: boolean) => {
    setIsContextMenuOpen(isOpen);
  }, []);

  // Combined handlers that call both internal and external callbacks
  const handleCombinedItemMove = useCallback((itemId: string, newStart: number, newEnd: number, newTrackId: string) => {
    internalItemMove(itemId, newStart, newEnd, newTrackId);
    handleExternalItemMove(itemId, newStart, newEnd, newTrackId);
  }, [internalItemMove, handleExternalItemMove]);

  // Helper function to check if playhead is over the selected item
  const isPlayheadOverSelectedItem = useCallback(() => {
    if (selectedItemIds.length !== 1) return false;

    const selectedItemId = selectedItemIds[0];
    const currentTimeInSeconds = currentFrame / fps;
    
    // Find the selected item across all tracks
    for (const track of tracks) {
      const item = track.items.find(item => item.id === selectedItemId);
      if (item) {
        // Check if the current playhead is within the item's time range
        return currentTimeInSeconds >= item.start && currentTimeInSeconds <= item.end;
      }
    }
    return false;
  }, [selectedItemIds, currentFrame, fps, tracks]);

  // Handler for splitting selected item at current playhead position
  const handleSplitAtSelection = useCallback(() => {
    if (selectedItemIds.length !== 1) {
      console.warn('Split at selection requires exactly one selected item');
      return;
    }

    const selectedItemId = selectedItemIds[0];
    const currentTimeInSeconds = currentFrame / fps;
    
    // Find the selected item across all tracks
    let selectedItem = null;
    for (const track of tracks) {
      const item = track.items.find(item => item.id === selectedItemId);
      if (item) {
        selectedItem = item;
        break;
      }
    }

    if (!selectedItem) {
      console.warn('Selected item not found in tracks');
      return;
    }

    // Check if the current playhead is within the item's time range
    if (currentTimeInSeconds < selectedItem.start || currentTimeInSeconds > selectedItem.end) {
      console.warn('Current playhead is not within the selected item\'s time range');
      return;
    }

    // Check minimum segment duration (same as existing splitting logic)
    const minSegmentDuration = 0.016; // ~1 frame at 60fps
    const leftSegmentDuration = currentTimeInSeconds - selectedItem.start;
    const rightSegmentDuration = selectedItem.end - currentTimeInSeconds;

    if (leftSegmentDuration < minSegmentDuration || rightSegmentDuration < minSegmentDuration) {
      console.warn('Split rejected: segments would be too small', {
        leftSegment: leftSegmentDuration,
        rightSegment: rightSegmentDuration,
        minRequired: minSegmentDuration
      });
      return;
    }

    // Perform the split
    handleExternalItemSplit(selectedItemId, currentTimeInSeconds);
  }, [selectedItemIds, currentFrame, fps, tracks, handleExternalItemSplit]);

  const handleCombinedItemResize = useCallback((itemId: string, newStart: number, newEnd: number) => {
    internalItemResize(itemId, newStart, newEnd);
    handleExternalItemResize(itemId, newStart, newEnd);
  }, [internalItemResize, handleExternalItemResize]);

  const handleCombinedItemsDelete = useCallback((itemIds: string[]) => {
    // Clean up transitions associated with deleted items
    itemIds.forEach(itemId => handleItemDeleted(itemId));
    internalItemsDelete(itemIds);
    handleExternalItemsDelete(itemIds);
  }, [internalItemsDelete, handleExternalItemsDelete, handleItemDeleted]);

  // Wrapped track delete handler that also cleans up transitions
  const handleCombinedTrackDelete = useCallback((trackId: string) => {
    handleTrackDeleted(trackId);
    handleDeleteTrack(trackId);
  }, [handleDeleteTrack, handleTrackDeleted]);

  const handleCombinedAddNewItem = useCallback((itemData: {
    type: string;
    label?: string;
    duration?: number;
    color?: string;
    data?: any;
    preferredTrackId?: string;
    preferredStartTime?: number;
  }) => {
    const createdItem = addNewItem(itemData, currentFrame, fps) as any;
    if (createdItem) {
      handleExternalAddNewItem({
        ...itemData,
        trackId: createdItem.trackId,
        start: createdItem.start,
        end: createdItem.end,
      });
    }
  }, [addNewItem, currentFrame, fps, handleExternalAddNewItem]);

  // Enhanced auto-remove handler that applies changes immediately
  const handleEnhancedToggleAutoRemoveEmptyTracks = useCallback((enabled: boolean) => {
    handleToggleAutoRemoveEmptyTracks(enabled);
    
    // If enabling auto-remove, immediately clean up empty tracks
    if (enabled && onTracksChange) {
      const filteredTracks = tracks.filter(track => track.items.length > 0);
      const updatedTracks = filteredTracks.length === 0 ? [tracks[0] || {
        id: `track-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: undefined,
        items: [],
      }] : filteredTracks;
      onTracksChange(updatedTracks);
    }
  }, [handleToggleAutoRemoveEmptyTracks, tracks, onTracksChange]);

  // VIRTUAL SCROLL: Programmatic scrolling using virtual scroll state
  const scrollToTop = useCallback(() => {
    setScrollY(0);
  }, [setScrollY]);

  const scrollToBottom = useCallback(() => {
    // Calculate max scroll based on track count and track height
    const trackHeightValue = trackHeight || 48;
    const totalTracksHeight = tracks.length * trackHeightValue;
    const maxScrollY = Math.max(0, totalTracksHeight - containerHeight + 100);
    setScrollY(maxScrollY);
  }, [setScrollY, tracks.length, trackHeight, containerHeight]);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    addNewItem: handleCombinedAddNewItem,
    scroll: {
      scrollToTop,
      scrollToBottom,
    },
  }), [handleCombinedAddNewItem, scrollToTop, scrollToBottom]);

  // VIRTUAL SCROLL: Handle wheel events with complete isolation
  // All scroll/zoom behavior is handled through virtual scroll state
  useEffect(() => {
    const container = timelineContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      // ALWAYS prevent default and stop propagation
      // Virtual scroll handles everything internally
      e.preventDefault();
      e.stopPropagation();
      
      // Get container rect for zoom calculations
      const rect = container.getBoundingClientRect();
      handleVirtualWheel(e, rect);
    };

    // Capture phase ensures we get events before any children
    container.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    
    return () => {
      container.removeEventListener('wheel', handleWheel, { capture: true } as EventListenerOptions);
    };
  }, [handleVirtualWheel]);

  // Zoom to time range (like Premiere Pro's "Zoom to Selection")
  const zoomToRange = useCallback((startTime: number, endTime: number) => {
    const rangeDuration = Math.abs(endTime - startTime);
    const minDuration = 0.1;
    const effectiveDuration = Math.max(rangeDuration, minDuration);
    
    // Calculate zoom to fit 80% of viewport
    const targetZoom = (60 * 0.8) / effectiveDuration; // 60 = base viewport duration
    const clampedZoom = Math.max(ZOOM_CONSTRAINTS.min, Math.min(ZOOM_CONSTRAINTS.max, targetZoom));
    
    // Calculate center of range
    const centerTime = (startTime + endTime) / 2;
    
    // Calculate scroll to center the range
    const newViewportDuration = 60 / clampedZoom;
    const newStartTime = centerTime - (newViewportDuration / 2);
    const newMaxStartTime = Math.max(0, scrollableDuration - newViewportDuration);
    const newScrollX = newMaxStartTime > 0 ? Math.max(0, Math.min(1, newStartTime / newMaxStartTime)) : 0;
    
    setZoomAndScrollX(clampedZoom, newScrollX);
  }, [setZoomAndScrollX, scrollableDuration]);

  // Navigator handlers for virtual scroll
  const handleNavigatorScrollChange = useCallback((newScrollX: number) => {
    setScrollX(newScrollX);
  }, [setScrollX]);

  // Zoom handler using unified coordinate system - keeps playhead at same pixel position
  const handleNavigatorZoomAtPlayhead = useCallback((newZoom: number) => {
    const playheadTime = currentFrame / fps;
    zoomAtPlayhead(newZoom, playheadTime);
  }, [currentFrame, fps, zoomAtPlayhead]);

  // Clear the CSS custom property for timeline marker position during playback
  // This allows the marker to move dynamically with currentFrame during playback
  useEffect(() => {
    if (isPlaying) {
      // The CSS variable is set on the timeline container by timeline-markers when clicking
      // We need to clear it during playback so the marker can move freely
      clearTimelineMarkerPosition();
    }
  }, [isPlaying, currentFrame]); // Also run when currentFrame changes during playback

  return (
    <div 
      ref={timelineContainerRef}
      className="timeline-container bg-background flex flex-col h-full overflow-hidden"
      style={{
        '--timeline-track-height': `${trackHeight || 48}px`,
        '--timeline-item-height': `${trackItemHeight || 40}px`,
        // Ensure the timeline is a scroll container boundary
        overscrollBehavior: 'contain',
        touchAction: 'pan-y pinch-zoom',
      } as React.CSSProperties}
    >
      <TimelineHeader 
        totalDuration={compositionDuration}
        currentTime={currentTime}
        showZoomControls={showZoomControls}
        zoomScale={zoomScale}
        setZoomScale={setZoomScale}
        resetZoom={zoomToFit}
        isPlaying={isPlaying}
        onPlay={onPlay}
        onPause={onPause}
        onSeekToStart={onSeekToStart}
        onSeekToEnd={onSeekToEnd}
        showPlaybackControls={showPlaybackControls}
        playbackRate={playbackRate}
        setPlaybackRate={setPlaybackRate}
        autoRemoveEmptyTracks={isAutoRemoveEnabled}
        onToggleAutoRemoveEmptyTracks={handleEnhancedToggleAutoRemoveEmptyTracks}
        splittingEnabled={isSplittingEnabled}
        onToggleSplitting={handleToggleSplitting}
        onSplitAtSelection={handleSplitAtSelection}
        hasSelectedItem={selectedItemIds.length === 1 && isPlayheadOverSelectedItem()}
        selectedItemsCount={selectedItemIds.length}
        showSplitAtSelection={true}
        showUndoRedoControls={showUndoRedoControls}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        aspectRatio={aspectRatio}
        onAspectRatioChange={onAspectRatioChange}
        resolution={resolution}
        onResolutionChange={onResolutionChange}
        showAspectRatioControls={showAspectRatioControls}
        isCompact={isCompact}
        onToggleCompact={onToggleCompact}
        isCollapsed={isCollapsed}
        onToggleCollapse={handleToggleCollapse}
      />
      
      {/* Tracks container - flex layout with scroll */}
      <div className="timeline-tracks-wrapper flex flex-1 overflow-hidden">
        <div className="hidden md:block overflow-hidden">
          <TimelineTrackHandles 
            tracks={tracks} 
            onTrackReorder={handleTrackReorder}
            onTrackDelete={handleCombinedTrackDelete}
            onToggleLock={handleToggleLock}
            onToggleVisibility={handleToggleVisibility}
            onToggleMute={handleToggleMute}
            onAddTrack={handleAddTrack}
            enableTrackDrag={enableTrackDrag}
            enableTrackDelete={enableTrackDelete}
            scrollY={scrollY}
          />
        </div>
        
        <div className="timeline-content flex-1 relative bg-surface overflow-hidden">
          <TimelineContent
            tracks={tracks}
            totalDuration={compositionDuration}
            viewportDuration={viewportDuration}
            currentFrame={currentFrame}
            fps={fps}
            zoomScale={zoomScale}
            // Virtual scroll props
            scrollX={scrollX}
            scrollY={scrollY}
            onScrollXChange={setScrollX}
            onScrollYChange={setScrollY}
            getVisibleTimeRange={getVisibleTimeRange}
            getContentTransform={getContentTransform}
            // Other props
            onFrameChange={onFrameChange}
            onItemSelect={onItemSelect}
            onDeleteItems={handleCombinedItemsDelete}
            onDuplicateItems={handleExternalItemsDuplicate}
            onSplitItems={handleExternalItemSplit}
            selectedItemIds={selectedItemIds}
            onSelectedItemsChange={handleSelectedItemsChange}
            onItemMove={handleCombinedItemMove}
            onItemResize={handleCombinedItemResize}
            timelineRef={timelineRef}
            // Transition props
            isDraggingTransition={isDraggingTransition}
            draggingTransitionIsVideo={draggingTransitionIsVideo}
            selectedTransition={selectedTransition}
            onTransitionDrop={handleTransitionDrop}
            onBoundaryTransitionDrop={handleBoundaryTransitionDrop}
            onTransitionSelect={selectTransition}
            onTransitionDeselect={handleClearTransitionSelection}
            onTransitionTimesChange={updateTransitionTimes}
            onTransitionRemove={removeTransition}
            // Link props
            canLinkItems={canLinkItems}
            areItemsLinked={areItemsLinked}
            isItemLinked={isItemLinked}
            getLinkGroupSize={getLinkGroupSize}
            getLinkedItemIds={getLinkedItemIds}
            onLinkItems={linkItems}
            onUnlinkItems={unlinkItems}
            ghostMarkerPosition={ghostMarkerPosition}
            isDragging={isDragging}
            isContextMenuOpen={isContextMenuOpen}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onInsertTrackAt={handleInsertTrackAt}
            onInsertMultipleTracksAt={handleInsertMultipleTracksAt}
            onCreateTracksWithItems={handleCreateTracksWithItems}
            showTimelineGuidelines={showTimelineGuidelines}
            onContextMenuOpenChange={handleContextMenuOpenChange}
            splittingEnabled={isSplittingEnabled}
            hideItemsOnDrag={effectiveHideItemsOnDrag}
            onNewItemDrop={onNewItemDrop}
            trackHeight={trackHeight}
            onCloseGap={handleCloseGap}
            onZoomToRange={zoomToRange}
            onEffectDrop={onEffectDrop}
            onOpenCompositionEditor={onOpenCompositionEditor}
          />
          
          {/* Vertical scroll indicator - only show when content exceeds viewport */}
          {maxScrollY > 0 && (
            <div 
              className="absolute right-0 bottom-0 w-2 bg-neutral-900/50 pointer-events-auto z-50"
              style={{ top: `${TIMELINE_CONSTANTS.MARKERS_HEIGHT}px` }}
              onMouseDown={(e) => {
                // Allow clicking on scrollbar track to jump
                const rect = e.currentTarget.getBoundingClientRect();
                const clickY = e.clientY - rect.top;
                const scrollPercent = Math.max(0, Math.min(1, clickY / rect.height));
                setScrollY(scrollPercent * maxScrollY);
              }}
            >
              {/* Scrollbar thumb */}
              <div 
                className="absolute w-full bg-neutral-500/70 hover:bg-neutral-400/80 rounded-full transition-colors cursor-pointer"
                style={{
                  height: `${Math.max(20, (containerHeight / contentHeight) * 100)}%`,
                  top: `${maxScrollY > 0 ? (scrollY / maxScrollY) * (100 - Math.max(20, (containerHeight / contentHeight) * 100)) : 0}%`,
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  const startY = e.clientY;
                  const startScrollY = scrollY;
                  const trackRect = e.currentTarget.parentElement?.getBoundingClientRect();
                  
                  const handleMouseMove = (moveEvent: MouseEvent) => {
                    if (!trackRect) return;
                    const deltaY = moveEvent.clientY - startY;
                    const trackHeight = trackRect.height;
                    const thumbHeight = Math.max(20, (containerHeight / contentHeight) * trackHeight);
                    const scrollableTrackHeight = trackHeight - thumbHeight;
                    const scrollDelta = scrollableTrackHeight > 0 ? (deltaY / scrollableTrackHeight) * maxScrollY : 0;
                    setScrollY(Math.max(0, Math.min(maxScrollY, startScrollY + scrollDelta)));
                  };
                  
                  const handleMouseUp = () => {
                    document.removeEventListener('mousemove', handleMouseMove);
                    document.removeEventListener('mouseup', handleMouseUp);
                  };
                  
                  document.addEventListener('mousemove', handleMouseMove);
                  document.addEventListener('mouseup', handleMouseUp);
                }}
              />
            </div>
          )}
        </div>
      </div>
      
      {/* Premiere Pro-style zoom/scroll navigator at bottom */}
      <TimelineNavigatorV2
        scrollX={scrollX}
        onScrollChange={handleNavigatorScrollChange}
        zoomScale={zoomScale}
        onZoomAtPlayhead={handleNavigatorZoomAtPlayhead}
        viewportDuration={viewportDuration}
        scrollableDuration={scrollableDuration}
        minZoom={ZOOM_CONSTRAINTS.min}
        maxZoom={ZOOM_CONSTRAINTS.max}
      />
    </div>
  );
});

Timeline.displayName = 'Timeline';

export default Timeline;