import React, { useCallback, useMemo } from 'react';
import { TrackWithClips as TimelineTrackType, TimelineItem as TimelineItemType } from '../types';
import { MemoizedTimelineItem, type TimelineItemContextMenuData } from './timeline-item';
import { TimelineItemBetweenTransitionOverlay } from './timeline-item/timeline-item-between-transition-overlay';
import { TimelineItemContextMenu } from './timeline-item/timeline-item-context-menu';
import { TimelineBoundaryTransitionDropZone } from './timeline-boundary-transition-drop-zone';
import { TimelineGapIndicator } from './timeline-gap-indicator';
import { MemoizedTimelineGhostElement } from './timeline-ghost-element';
import { findGapsInTrack } from '../utils/gap-utils';
import { TIMELINE_CONSTANTS } from '../constants';
import { useVideoEditorStore, useTypedStore } from '../../../stores/video-editor-store';
import type { VideoEditorStore } from '../../../stores/video-editor-store';
import type { TransitionEntity } from '../../../types/timeline-v2';
import { isBetweenTransition } from '../../../types/timeline-v2';
import { ContextMenu, ContextMenuTrigger } from '../../ui/context-menu';

interface TimelineTrackProps {
  track: TimelineTrackType;
  totalDuration: number;
  trackIndex: number;
  trackCount: number;
  onItemSelect?: (itemId: string) => void;
  onDeleteItems?: (itemIds: string[]) => void; // Updated to take array of item IDs
  onDuplicateItems?: (itemIds: string[]) => void; // Updated to take array of item IDs
  onSplitItems?: (itemId: string, splitTime: number) => void; // Callback when item should be split
  selectedItemIds?: string[]; // Currently selected item IDs (supports multiple)
  onSelectedItemsChange?: (itemIds: string[]) => void; // Callback when selection changes
  onItemMove?: (itemId: string, newStart: number, newEnd: number, newTrackId: string) => void;
  onDragStart?: (
    item: TimelineItemType,
    clientX: number,
    clientY: number,
    action: "move" | "resize-start" | "resize-end",
    selectedItemIds?: string[] // Add selectedItemIds parameter
  ) => void;
  zoomScale?: number;
  isDragging?: boolean;
  draggedItemId?: string;
  ghostElements?: Array<{
    left: number;
    width: number;
    top: number;
    isAudio?: boolean;
  }>;
  isValidDrop?: boolean;
  newItemDragData?: {
    type?: string;
    label?: string;
    thumbnailUrl?: string;
  };
  onContextMenuOpenChange?: (isOpen: boolean) => void; // New prop for context menu state
  splittingEnabled?: boolean; // Whether splitting mode is enabled
  hideItemsOnDrag?: boolean; // Whether to hide selected timeline items during drag operations (default: false)
  currentFrame?: number; // Current playhead frame position
  fps?: number; // Frames per second for time conversion
  onTimeClick?: (timeInSeconds: number) => void; // Click on empty area to move playhead (like Premiere Pro)
  trackHeight?: number; // Track height in pixels (for compact mode support)
  // Transition props
  isDraggingTransition?: boolean;
  draggingTransitionIsVideo?: boolean | null;
  selectedTransition?: { itemId: string; position: "start" | "end" } | null;
  onTransitionDrop?: (itemId: string, position: "start" | "end", transitionType: string, isVideo: boolean, duration: number, adjacentItemId?: string) => void;
  onBoundaryTransitionDrop?: (firstItemId: string, secondItemId: string, transitionType: string, isVideo: boolean, duration: number) => void;
  onTransitionSelect?: (itemId: string, position: "start" | "end") => void;
  onTransitionDeselect?: () => void;
  onTransitionTimesChange?: (itemId: string, position: "start" | "end", startTime: number, endTime: number) => void;
  onTransitionRemove?: (itemId: string, position: "start" | "end") => void;
  // Link props
  canLinkItems?: (itemIds: string[]) => boolean;
  areItemsLinked?: (itemIds: string[]) => boolean;
  isItemLinked?: (itemId: string) => boolean;
  getLinkGroupSize?: (itemId: string) => number;
  getLinkedItemIds?: (itemId: string) => string[];
  onLinkItems?: (itemIds: string[]) => void;
  onUnlinkItems?: (itemIds: string[]) => void;
  // Effect drop props
  onEffectDrop?: (itemId: string, effectType: string, effectValue: string) => void;
  // Composition editor props
  onOpenCompositionEditor?: (itemId: string) => void;
}

export const TimelineTrack: React.FC<TimelineTrackProps> = ({
  track,
  totalDuration,
  trackIndex,
  trackCount,
  onItemSelect,
  onDeleteItems,
  onDuplicateItems,
  onSplitItems,
  selectedItemIds = [],
  onSelectedItemsChange,
  onItemMove,
  onDragStart,
  zoomScale = 1,
  isDragging = false,
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
  draggedItemId,
  ghostElements = [],
  isValidDrop = false,
  newItemDragData,
  onContextMenuOpenChange,
  splittingEnabled = false,
  hideItemsOnDrag = false,
  currentFrame,
  fps = 30,
  onTimeClick,
  trackHeight,
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
  // magneticPreview is now passed as prop from timeline-content
  const magneticPreview = null; // TODO: Pass as prop if needed

  // ── PERF: Shared context menu ─────────────────────────────────
  // A single state variable stores the context menu data for whatever
  // item was last right-clicked. This state only updates on right-click
  // (rare interaction), so the re-render cost is negligible.
  // The native contextmenu event bubbles up to our track-level
  // <ContextMenuTrigger>, which opens ONE Radix menu.
  const [contextMenuData, setContextMenuData] = React.useState<TimelineItemContextMenuData | null>(null);
  const handleContextMenuRequest = useCallback((data: TimelineItemContextMenuData) => {
    setContextMenuData(data);
  }, []);

  // Find gaps in the track for gap indicators
  const gaps = findGapsInTrack(track.items);
  
  // Get transitions from store for detecting between transitions
  const storeTransitions = useTypedStore(state => state.transitions);
  const updateTransition = useTypedStore(state => state.updateTransition);
  const removeTransition = useTypedStore(state => state.removeTransition);
  
  // Find between transitions that involve clips in this track
  const betweenTransitions = React.useMemo(() => {
    const trackItemIds = new Set(track.items.map(item => item.id));
    const result: TransitionEntity[] = [];
    
    for (const transition of Object.values(storeTransitions)) {
      if (isBetweenTransition(transition)) {
        const [firstClipId, secondClipId] = transition.clipIds;
        // Both clips must be in this track
        if (firstClipId && secondClipId && 
            trackItemIds.has(firstClipId) && trackItemIds.has(secondClipId)) {
          result.push(transition);
        }
      }
    }
    
    return result;
  }, [storeTransitions, track.items]);
  
  // Detect adjacent item pairs (for boundary drop zones)
  const adjacentPairs = React.useMemo(() => {
    const result: Array<{
      firstItem: TimelineItemType;
      secondItem: TimelineItemType;
      hasExistingTransition: boolean;
    }> = [];
    
    const sortedItems = [...track.items].sort((a, b) => a.start - b.start);
    
    for (let i = 0; i < sortedItems.length - 1; i++) {
      const currentItem = sortedItems[i];
      const nextItem = sortedItems[i + 1];
      
      // Check if items are adjacent (zero gap)
      const isAdjacent = Math.abs(currentItem.end - nextItem.start) < 0.001;
      
      if (isAdjacent) {
        // Check if there's already a between transition for these clips
        const hasExisting = betweenTransitions.some(t => 
          t.clipIds[0] === currentItem.id && t.clipIds[1] === nextItem.id
        );
        
        result.push({
          firstItem: currentItem,
          secondItem: nextItem,
          hasExistingTransition: hasExisting,
        });
      }
    }
    
    return result;
  }, [track.items, betweenTransitions]);

  // Handle item selection change with support for multi-selection
  // Use ref for selectedItemIds to keep handleSelectionChange referentially stable
  const selectedItemIdsRef = React.useRef(selectedItemIds);
  selectedItemIdsRef.current = selectedItemIds;
  
  const handleSelectionChange = useCallback((itemId: string, isMultiple: boolean) => {
    const currentIds = selectedItemIdsRef.current;
    if (onSelectedItemsChange) {
      if (isMultiple) {
        // Multi-selection: toggle the item
        const currentlySelected = currentIds.includes(itemId);
        if (currentlySelected) {
          const newSelection = currentIds.filter(id => id !== itemId);
          onSelectedItemsChange(newSelection);
        } else {
          const newSelection = [...currentIds, itemId];
          onSelectedItemsChange(newSelection);
        }
      } else {
        // Single selection: replace current selection
        onSelectedItemsChange([itemId]);
      }
    } else {
      onItemSelect?.(itemId);
    }
  }, [onSelectedItemsChange, onItemSelect]);

  // Handle click on empty track area to move playhead (like Premiere Pro)
  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Don't handle if clicking on an actual timeline item
    const target = e.target as HTMLElement;
    if (target.closest('.timeline-item') || 
        target.closest('[data-timeline-item]') ||
        target.closest('.timeline-transition-overlay') ||
        target.closest('[data-transition-drop-zone]')) {
      return;
    }
    if (!onTimeClick) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const timeInSeconds = percentage * totalDuration;
    
    onTimeClick(Math.max(0, Math.min(totalDuration, timeInSeconds)));
  };

  // Visual styling for hidden tracks
  const isHidden = track.visible === false;
  
  const trackContent = (
    <div 
      className={`track relative border-b border-neutral-700 w-full transition-all duration-200 ease-in-out ${
        isHidden ? 'bg-neutral-950/80' : 'bg-[var(--timeline-row)]'
      }`}
      style={{ 
        height: 'var(--timeline-track-height, 48px)',
        // PERF: 'strict' containment isolates layout/paint/style per track
        contain: 'strict',
      }}
      onClick={handleTrackClick}
    >
      {/* Render normal items - items handle their own drag preview */}
      {track.items.map((item, itemIndex) => {
        return (
            <MemoizedTimelineItem
              key={item.id}
              item={item}
              totalDuration={totalDuration}
              onSelect={onItemSelect}
              onSelectionChange={handleSelectionChange}
              onDragStart={onDragStart}
              onDeleteItems={onDeleteItems}
              onDuplicateItems={onDuplicateItems}
              onSplitItems={onSplitItems}
              selectedItemIds={selectedItemIds}
              zoomScale={zoomScale}
              isDragging={isDragging && draggedItemId === item.id}
              isSelected={selectedItemIds?.includes(item.id)}
              onContextMenuOpenChange={onContextMenuOpenChange}
              splittingEnabled={splittingEnabled}
              currentFrame={currentFrame}
              fps={fps}
              trackLocked={track.locked}
              trackHidden={track.visible === false}
              trackMuted={track.muted}
              trackHeight={trackHeight}
              isDraggingTransition={isDraggingTransition}
              draggingTransitionIsVideo={draggingTransitionIsVideo}
              selectedTransition={selectedTransition}
              onTransitionDrop={(position, transitionType, isVideo, duration, adjacentItemId) => 
                onTransitionDrop?.(item.id, position, transitionType, isVideo, duration, adjacentItemId)
              }
              onTransitionSelect={(position) => onTransitionSelect?.(item.id, position)}
              onTransitionDeselect={onTransitionDeselect}
              onTransitionTimesChange={(position, startTime, endTime) => 
                onTransitionTimesChange?.(item.id, position, startTime, endTime)
              }
              onTransitionRemove={(position) => onTransitionRemove?.(item.id, position)}
              // Adjacent item info for shared transition zones
              nextItem={itemIndex < track.items.length - 1 ? track.items[itemIndex + 1] : undefined}
              prevItem={itemIndex > 0 ? track.items[itemIndex - 1] : undefined}
              // Link props
              canLinkItems={canLinkItems}
              areItemsLinked={areItemsLinked}
              isItemLinked={isItemLinked}
              getLinkGroupSize={getLinkGroupSize}
              getLinkedItemIds={getLinkedItemIds}
              onLinkItems={onLinkItems}
              onUnlinkItems={onUnlinkItems}
              onSelectedItemsChange={onSelectedItemsChange}
              // Effect drop
              onEffectDrop={onEffectDrop}
              // Composition editor
              onOpenCompositionEditor={onOpenCompositionEditor}
              onContextMenuRequest={handleContextMenuRequest}
            />
          );
        })}
      
      {/* Gap indicators - visual only, no interaction (like Premiere Pro) */}
      {!isDragging &&
        gaps.map((gap, gapIndex) => (
          <TimelineGapIndicator
            key={`gap-${track.id}-${gapIndex}`}
            gap={gap}
            trackIndex={trackIndex}
            totalDuration={totalDuration}
          />
        ))}
      
      {/* Between-transition overlays - rendered inline using percentage positioning */}
      {betweenTransitions.map((transition) => {
        const [firstClipId, secondClipId] = transition.clipIds;
        if (!firstClipId || !secondClipId) return null;
        
        // Find the actual items to get their timeline positions
        const firstItem = track.items.find(item => item.id === firstClipId);
        const secondItem = track.items.find(item => item.id === secondClipId);
        
        if (!firstItem || !secondItem) return null;
        
        return (
          <TimelineItemBetweenTransitionOverlay
            key={`between-transition-${transition.id}`}
            transition={transition}
            firstItemStart={firstItem.start}
            firstItemEnd={firstItem.end}
            secondItemEnd={secondItem.end}
            totalDuration={totalDuration}
            isSelected={
              (selectedTransition?.itemId === firstClipId && selectedTransition?.position === 'end') ||
              (selectedTransition?.itemId === secondClipId && selectedTransition?.position === 'start')
            }
            onSelect={() => onTransitionSelect?.(firstClipId, 'end')}
            onDeselect={onTransitionDeselect!}
            onTimesChange={(newStartTime, newEndTime) => {
              // Update the transition with new times
              updateTransition(transition.id, { startTime: newStartTime, endTime: newEndTime });
            }}
            onRemove={() => removeTransition(transition.id)}
            trackLocked={track.locked}
          />
        );
      })}
      
      {/* Boundary drop zones - appear BETWEEN adjacent items when dragging transitions */}
      {adjacentPairs.map((pair, index) => (
        <TimelineBoundaryTransitionDropZone
          key={`boundary-${pair.firstItem.id}-${pair.secondItem.id}`}
          firstItem={pair.firstItem}
          secondItem={pair.secondItem}
          totalDuration={totalDuration}
          isVideoTrack={track.type === 'video'}
          hasExistingTransition={pair.hasExistingTransition}
        />
      ))}
      
      {/* Hidden track overlay - subtle darkening with desaturated appearance */}
      {isHidden && (
        <div 
          className="absolute inset-0 pointer-events-none z-30 bg-black/30"
          style={{
            backdropFilter: 'saturate(0.3) brightness(0.8)',
          }}
        />
      )}
      
      {/* Ghost elements for new item drag preview */}
      {ghostElements && ghostElements.map((ghost, idx) => (
        <MemoizedTimelineGhostElement
          key={`ghost-${idx}`}
          ghostElement={ghost}
          rowIndex={trackIndex}
          trackCount={trackCount}
          isValidDrop={isValidDrop}
          itemData={ghost.isAudio ? { ...newItemDragData, type: 'audio' } : newItemDragData}
          isAudioTrack={ghost.isAudio}
        />
      ))}
    </div>
  );

  return (
    <ContextMenu onOpenChange={onContextMenuOpenChange}>
      <ContextMenuTrigger asChild>
        {trackContent}
      </ContextMenuTrigger>
      {/* PERF: Single shared ContextMenu for ALL items in this track.
          contextMenuDataRef is populated synchronously by the item's
          onContextMenuRequest callback before the native event opens the menu. */}
      <TimelineItemContextMenu
        onDuplicate={contextMenuData?.onDuplicate}
        onDelete={contextMenuData?.onDelete}
        onSplit={contextMenuData?.onSplit}
        onDuplicateItems={contextMenuData?.onDuplicateItems}
        onDeleteItems={contextMenuData?.onDeleteItems}
        onSplitItems={contextMenuData?.onSplitItems}
        duplicateText={contextMenuData?.duplicateText ?? 'Duplicate'}
        deleteText={contextMenuData?.deleteText ?? 'Delete'}
        showSplit={contextMenuData?.showSplit}
        canLink={contextMenuData?.canLink}
        canUnlink={contextMenuData?.canUnlink}
        onLink={contextMenuData?.onLink}
        onUnlink={contextMenuData?.onUnlink}
      />
    </ContextMenu>
  );
};

/**
 * Memoized TimelineTrack component with custom comparison function.
 * Prevents unnecessary re-renders when parent state changes but track data hasn't.
 */
export const MemoizedTimelineTrack = React.memo(TimelineTrack, (prevProps, nextProps) => {
  // Compare track object - most critical for rendering
  if (prevProps.track !== nextProps.track) {
    // Deep compare track properties that affect rendering
    if (prevProps.track.id !== nextProps.track.id) return false;
    if (prevProps.track.locked !== nextProps.track.locked) return false;
    if (prevProps.track.visible !== nextProps.track.visible) return false;
    if (prevProps.track.muted !== nextProps.track.muted) return false;
    if (prevProps.track.type !== nextProps.track.type) return false;
    
    // Compare items array
    const prevItems = prevProps.track.items;
    const nextItems = nextProps.track.items;
    if (prevItems.length !== nextItems.length) return false;
    for (let i = 0; i < prevItems.length; i++) {
      if (prevItems[i] !== nextItems[i]) return false;
    }
  }
  
  // Compare scalar props
  if (prevProps.totalDuration !== nextProps.totalDuration) return false;
  if (prevProps.trackIndex !== nextProps.trackIndex) return false;
  if (prevProps.trackCount !== nextProps.trackCount) return false;
  if (prevProps.zoomScale !== nextProps.zoomScale) return false;
  if (prevProps.isDragging !== nextProps.isDragging) return false;
  if (prevProps.draggedItemId !== nextProps.draggedItemId) return false;
  if (prevProps.isValidDrop !== nextProps.isValidDrop) return false;
  if (prevProps.splittingEnabled !== nextProps.splittingEnabled) return false;
  if (prevProps.hideItemsOnDrag !== nextProps.hideItemsOnDrag) return false;
  // NOTE: currentFrame intentionally excluded from memo comparison.
  // It changes 10×/sec during playback and would bust the memo for ALL tracks,
  // causing cascading re-renders. The split line and playhead-over-item highlight
  // are cosmetic and don't need per-tick updates.
  if (prevProps.fps !== nextProps.fps) return false;
  if (prevProps.trackHeight !== nextProps.trackHeight) return false;
  
  // Compare transition drag state
  if (prevProps.isDraggingTransition !== nextProps.isDraggingTransition) return false;
  if (prevProps.draggingTransitionIsVideo !== nextProps.draggingTransitionIsVideo) return false;
  
  // Compare selected transition (shallow)
  const prevSel = prevProps.selectedTransition;
  const nextSel = nextProps.selectedTransition;
  if (prevSel?.itemId !== nextSel?.itemId || prevSel?.position !== nextSel?.position) return false;
  
  // PERF: Per-track selection comparison.
  // Instead of comparing the full selectedItemIds array (which busts ALL tracks
  // on any selection change), we only check whether items IN THIS TRACK changed
  // their selection status. This reduces re-renders from O(allTracks) to
  // O(affectedTracks) — typically 1-2 tracks instead of all 10+.
  const prevSelIds = prevProps.selectedItemIds || [];
  const nextSelIds = nextProps.selectedItemIds || [];
  const prevSelSet = new Set(prevSelIds);
  const nextSelSet = new Set(nextSelIds);
  const trackItems = nextProps.track.items;
  for (let i = 0; i < trackItems.length; i++) {
    const itemId = trackItems[i].id;
    if (prevSelSet.has(itemId) !== nextSelSet.has(itemId)) return false;
  }
  
  // Compare ghost elements array (by reference)
  if (prevProps.ghostElements !== nextProps.ghostElements) return false;
  
  // Compare newItemDragData (shallow)
  if (prevProps.newItemDragData !== nextProps.newItemDragData) return false;
  
  // IMPORTANT: Always allow re-renders when callback props change
  // to ensure drag/resize/selection handlers work correctly
  if (prevProps.onDragStart !== nextProps.onDragStart) return false;
  if (prevProps.onItemSelect !== nextProps.onItemSelect) return false;
  if (prevProps.onItemMove !== nextProps.onItemMove) return false;
  
  return true; // Props are equal, skip re-render
});