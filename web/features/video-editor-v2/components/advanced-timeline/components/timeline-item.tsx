import React, { useRef, useCallback, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { TimelineItem as TimelineItemType, isVideoTrackItem } from '../types';
import { TIMELINE_CONSTANTS } from '../constants';
import { useVideoEditorStore, getCurrentDrag, type UnifiedDragState } from '../../../stores/video-editor-store';
import { EyeOff, VolumeX, Lock, Link2, Sparkles, Shuffle, Volume2 } from 'lucide-react';

// Debug logging for timeline item interactions - DISABLED IN PRODUCTION
const DEBUG_TIMELINE_ITEMS = false;
const logTimelineItem = (action: string, data: any) => {
  if (DEBUG_TIMELINE_ITEMS) {
    console.log(`%c[TIMELINE-ITEM] ${action}`, 'color: #3b82f6; font-weight: bold;', data);
  }
};

// ==========================================
// LINK GROUP COLOR UTILITIES
// ==========================================

/**
 * Color palette for link groups - distinct, visually appealing colors
 * Each link group gets a unique color based on its ID hash
 */
const LINK_GROUP_COLORS = [
  { bg: '#8B5CF6', glow: 'rgba(139, 92, 246, 0.6)' },  // Purple
  { bg: '#EC4899', glow: 'rgba(236, 72, 153, 0.6)' },  // Pink
  { bg: '#F59E0B', glow: 'rgba(245, 158, 11, 0.6)' },  // Amber
  { bg: '#10B981', glow: 'rgba(16, 185, 129, 0.6)' },  // Emerald
  { bg: '#3B82F6', glow: 'rgba(59, 130, 246, 0.6)' },  // Blue
  { bg: '#EF4444', glow: 'rgba(239, 68, 68, 0.6)' },   // Red
  { bg: '#06B6D4', glow: 'rgba(6, 182, 212, 0.6)' },   // Cyan
  { bg: '#F97316', glow: 'rgba(249, 115, 22, 0.6)' },  // Orange
  { bg: '#84CC16', glow: 'rgba(132, 204, 22, 0.6)' },  // Lime
  { bg: '#A855F7', glow: 'rgba(168, 85, 247, 0.6)' },  // Violet
  { bg: '#14B8A6', glow: 'rgba(20, 184, 166, 0.6)' },  // Teal
  { bg: '#F43F5E', glow: 'rgba(244, 63, 94, 0.6)' },   // Rose
];

/**
 * Generate a consistent color index from a link group ID
 * Uses a simple hash function to ensure the same ID always gets the same color
 */
function getLinkGroupColorIndex(linkGroupId: string): number {
  let hash = 0;
  for (let i = 0; i < linkGroupId.length; i++) {
    const char = linkGroupId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash) % LINK_GROUP_COLORS.length;
}

/**
 * Get the color configuration for a link group
 */
function getLinkGroupColor(linkGroupId: string | undefined): { bg: string; glow: string } | null {
  if (!linkGroupId) return null;
  return LINK_GROUP_COLORS[getLinkGroupColorIndex(linkGroupId)];
}

import {
  TimelineItemContent,
  TimelineItemResizeHandles,
  TimelineItemSplitLine,
  TimelineItemContextMenu,
  TimelineItemFadeOverlays,
  TimelineItemTransitionIndicators,
  TimelineItemTransitionDropZones,
  TimelineItemTransitionOverlay,
} from './timeline-item/index';
import { TimelineKeyframes } from './timeline-keyframes';
import { ContextMenu, ContextMenuTrigger } from '../../ui/context-menu';
import type { PropertyKeyframes } from '../../../types/keyframes';

/**
 * Format time in seconds to a human-readable format
 * Examples: "0.0s", "1.5s", "1m 30.0s", "1h 5m 30.0s"
 */
const formatTime = (seconds: number): string => {
  const absSeconds = Math.abs(seconds);
  
  if (absSeconds < 60) {
    return `${absSeconds.toFixed(1)}s`;
  }
  
  const mins = Math.floor(absSeconds / 60);
  const secs = absSeconds % 60;
  
  if (mins < 60) {
    return `${mins}m ${secs.toFixed(1)}s`;
  }
  
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours}h ${remainingMins}m ${secs.toFixed(1)}s`;
};

/**
 * Format delta time with sign in a human-readable way
 * Examples: "+0.5s", "-2.0s", "+1m 5.0s"
 */
const formatDelta = (deltaSeconds: number): string => {
  if (Math.abs(deltaSeconds) < 0.05) {
    return '0s';
  }
  
  const sign = deltaSeconds >= 0 ? '+' : '-';
  const absSeconds = Math.abs(deltaSeconds);
  
  if (absSeconds < 60) {
    return `${sign}${absSeconds.toFixed(1)}s`;
  }
  
  const mins = Math.floor(absSeconds / 60);
  const secs = absSeconds % 60;
  
  if (secs < 0.05) {
    return `${sign}${mins}m`;
  }
  
  return `${sign}${mins}m ${secs.toFixed(1)}s`;
};

/**
 * Format duration in a compact way
 * Examples: "5.0s", "1:30", "1:05:30"
 */
const formatDuration = (seconds: number): string => {
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  
  if (mins < 60) {
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
  
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours}:${remainingMins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Drag info overlay component - shows delta and timestamps during drag
 * Uses a portal to render outside the clipped item container
 */
interface DragInfoOverlayProps {
  originalStart: number;
  originalEnd: number;
  currentStart: number;
  currentEnd: number;
  action: 'move' | 'resize-start' | 'resize-end';
  fps?: number;
  previewRect: { left: number; top: number; width: number };
}

const DragInfoOverlay: React.FC<DragInfoOverlayProps> = ({
  originalStart,
  originalEnd,
  currentStart,
  currentEnd,
  action,
  fps = 30,
  previewRect,
}) => {
  const deltaStart = currentStart - originalStart;
  const currentDuration = currentEnd - currentStart;
  const originalDuration = originalEnd - originalStart;
  const deltaDuration = currentDuration - originalDuration;
  
  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    left: previewRect.left + previewRect.width / 2,
    top: previewRect.top - 6,
    transform: 'translate(-50%, -100%)',
    zIndex: 9999,
    pointerEvents: 'none',
  };
  
  const getDeltaColor = (delta: number, invert: boolean = false) => {
    if (Math.abs(delta) < 0.05) return 'text-gray-400';
    const isPositive = invert ? delta < 0 : delta > 0;
    return isPositive ? 'text-green-400' : 'text-orange-400';
  };
  
  return createPortal(
    <div style={overlayStyle}>
      <div className="bg-black/95 rounded px-2 py-1 shadow-lg border border-white/10 flex items-center gap-2 text-[11px]">
        {action === 'move' && (
          <>
            <span className={`font-semibold tabular-nums ${getDeltaColor(deltaStart)}`}>
              {formatDelta(deltaStart)}
            </span>
            <span className="text-gray-500">•</span>
            <span className="text-gray-400 tabular-nums">{formatTime(currentStart)}</span>
            <span className="text-gray-600">→</span>
            <span className="text-gray-400 tabular-nums">{formatTime(currentEnd)}</span>
          </>
        )}
        
        {action === 'resize-start' && (
          <>
            <span className={`font-semibold tabular-nums ${getDeltaColor(deltaStart, true)}`}>
              {formatDelta(deltaStart)}
            </span>
            <span className="text-gray-500">•</span>
            <span className="text-gray-400 tabular-nums">{formatTime(currentStart)}</span>
            <span className="text-gray-600">|</span>
            <span className="text-white tabular-nums">{formatDuration(currentDuration)}</span>
          </>
        )}
        
        {action === 'resize-end' && (
          <>
            <span className={`font-semibold tabular-nums ${getDeltaColor(deltaDuration)}`}>
              {formatDelta(deltaDuration)}
            </span>
            <span className="text-gray-500">•</span>
            <span className="text-gray-400 tabular-nums">{formatTime(currentEnd)}</span>
            <span className="text-gray-600">|</span>
            <span className="text-white tabular-nums">{formatDuration(currentDuration)}</span>
          </>
        )}
      </div>
      {/* Arrow */}
      <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-l-transparent border-r-4 border-r-transparent border-t-4 border-t-black/95" />
    </div>,
    document.body
  );
};

/**
 * Drag preview component with info overlay - shows a copy of the item following the mouse
 * Rendered via portal at the dragged position, with the info overlay above it
 */
interface DragPreviewWithOverlayProps {
  item: TimelineItemType;
  originalRect: DOMRect;
  dragInfo: {
    currentStart: number;
    startPosition: number;
    currentDuration?: number;
    startDuration: number;
    currentRow?: number;
    startRow?: number;
    action: 'move' | 'resize-start' | 'resize-end';
  };
  totalDuration: number;
  color?: string;
  isShowingVideoThumbnails: boolean;
  fps?: number;
  currentFrame?: number;
  trackHeight?: number;
}

const DragPreviewWithOverlay: React.FC<DragPreviewWithOverlayProps> = ({
  item,
  originalRect,
  dragInfo,
  totalDuration,
  color,
  isShowingVideoThumbnails,
  fps = 30,
  currentFrame,
  trackHeight: propTrackHeight,
}) => {
  // Use provided track height or fall back to default
  const trackHeightPx = propTrackHeight || TIMELINE_CONSTANTS.TRACK_HEIGHT;
  
  const timelineWidth = originalRect.width / ((item.end - item.start) / totalDuration);
  
  // Calculate position and size based on action type
  let pixelOffsetX = 0;
  let pixelOffsetY = 0;
  let previewWidth = originalRect.width;
  
  if (dragInfo.action === 'move') {
    // For move: apply horizontal offset based on start position change
    const startOffset = dragInfo.currentStart - dragInfo.startPosition;
    pixelOffsetX = (startOffset / totalDuration) * timelineWidth;
    
    // Vertical offset for track changes (only for move)
    if (dragInfo.currentRow !== undefined && dragInfo.startRow !== undefined) {
      const trackOffset = dragInfo.currentRow - dragInfo.startRow;
      pixelOffsetY = trackOffset * trackHeightPx;
    }
  } else if (dragInfo.action === 'resize-start') {
    // For resize-start: item stays at RIGHT edge (end is fixed), left edge moves
    // Only adjust left position based on duration change, NOT based on currentStart
    if (dragInfo.currentDuration !== undefined) {
      const durationDelta = dragInfo.currentDuration - dragInfo.startDuration;
      // Move left by the amount the duration increased
      pixelOffsetX = -(durationDelta / totalDuration) * timelineWidth;
      previewWidth = originalRect.width * (dragInfo.currentDuration / dragInfo.startDuration);
    }
  } else if (dragInfo.action === 'resize-end') {
    // For resize-end: item stays at LEFT edge (start is fixed), right edge moves
    // No position change, only width change
    if (dragInfo.currentDuration !== undefined) {
      previewWidth = originalRect.width * (dragInfo.currentDuration / dragInfo.startDuration);
    }
  }
  
  const previewLeft = originalRect.left + pixelOffsetX;
  const previewTop = originalRect.top + pixelOffsetY;
  
  const previewStyle: React.CSSProperties = {
    position: 'fixed',
    left: previewLeft,
    top: previewTop,
    width: previewWidth,
    height: originalRect.height,
    backgroundColor: isShowingVideoThumbnails ? 'transparent' : (color || '#3b82f6'),
    borderRadius: '4px',
    border: '3px solid rgb(0, 255, 255)', // Brightest cyan
    zIndex: 9998,
    pointerEvents: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    opacity: 0.85, // More visible preview
  };
  
  return createPortal(
    <>
      {/* Drag preview - render actual item content */}
      <div style={previewStyle}>
        <TimelineItemContent
          label={item.label}
          type={item.type}
          data={item.data}
          start={item.start}
          end={item.end}
          mediaStart={item.mediaStart}
          mediaEnd={item.mediaEnd}
          isHovering={false}
          itemId={item.id}
          currentFrame={currentFrame}
          fps={fps}
        />
      </div>
      {/* Info overlay positioned above the preview */}
      <DragInfoOverlay
        originalStart={dragInfo.startPosition}
        originalEnd={dragInfo.startPosition + dragInfo.startDuration}
        currentStart={dragInfo.currentStart}
        currentEnd={dragInfo.currentStart + (dragInfo.currentDuration ?? dragInfo.startDuration)}
        action={dragInfo.action}
        fps={fps}
        previewRect={{ left: previewLeft, top: previewTop, width: previewWidth }}
      />
    </>,
    document.body
  );
};




interface TimelineItemProps {
  item: TimelineItemType;
  totalDuration: number;
  onSelect?: (itemId: string) => void;
  onSelectionChange?: (itemId: string, isMultiple: boolean) => void; // New prop for multi-selection
  onDragStart?: (
    item: TimelineItemType,
    clientX: number,
    clientY: number,
    action: "move" | "resize-start" | "resize-end",
    selectedItemIds?: string[] // Add selectedItemIds parameter
  ) => void;
  onDeleteItems?: (itemIds: string[]) => void; // Always takes array of item IDs
  onDuplicateItems?: (itemIds: string[]) => void; // Always takes array of item IDs
  onSplitItems?: (itemId: string, splitTime: number) => void; // Callback when item should be split
  selectedItemIds?: string[]; // Array of all selected item IDs
  zoomScale?: number;
  isDragging?: boolean;
  isSelected?: boolean; // Whether this item is currently selected
  onContextMenuOpenChange?: (isOpen: boolean) => void; // New prop for context menu state
  splittingEnabled?: boolean; // Whether splitting mode is enabled
  currentFrame?: number; // Current playhead frame position
  fps?: number; // Frames per second for time conversion
  trackLocked?: boolean; // Whether the track containing this item is locked
  trackHidden?: boolean; // Whether the track containing this item is hidden (visibility off)
  trackMuted?: boolean; // Whether the track containing this item is muted (audio only)
  trackHeight?: number; // Track height in pixels (for compact mode support)
  // Transition props
  isDraggingTransition?: boolean;
  draggingTransitionIsVideo?: boolean | null;
  selectedTransition?: { itemId: string; position: "start" | "end" } | null;
  onTransitionDrop?: (position: "start" | "end", transitionType: string, isVideo: boolean, duration: number, adjacentItemId?: string) => void;
  onTransitionSelect?: (position: "start" | "end") => void;
  onTransitionDeselect?: () => void;
  onTransitionTimesChange?: (position: "start" | "end", startTime: number, endTime: number) => void;
  onTransitionRemove?: (position: "start" | "end") => void;
  // Adjacent items for determining shared transition zones
  nextItem?: TimelineItemType;
  prevItem?: TimelineItemType;
  // Link props
  canLinkItems?: (itemIds: string[]) => boolean;
  areItemsLinked?: (itemIds: string[]) => boolean;
  isItemLinked?: (itemId: string) => boolean;
  getLinkGroupSize?: (itemId: string) => number;
  getLinkedItemIds?: (itemId: string) => string[];
  onLinkItems?: (itemIds: string[]) => void;
  onUnlinkItems?: (itemIds: string[]) => void;
  onSelectedItemsChange?: (itemIds: string[]) => void; // Callback for multi-item selection (linked items)
  // Effect drop props
  onEffectDrop?: (itemId: string, effectType: string, effectValue: string) => void;
  // Composition editor props
  onOpenCompositionEditor?: (itemId: string) => void;
}

export const TimelineItem: React.FC<TimelineItemProps> = ({ 
  item, 
  totalDuration, 
  onSelect,
  onSelectionChange,
  onDragStart,
  onDeleteItems,
  onDuplicateItems,
  onSplitItems,
  selectedItemIds = [],
  isDragging = false,
  isSelected = false,
  onContextMenuOpenChange,
  splittingEnabled = false,
  currentFrame,
  fps = 30,
  trackLocked = false,
  trackHidden = false,
  trackMuted = false,
  trackHeight: propTrackHeight,
  // Transition props
  isDraggingTransition = false,
  draggingTransitionIsVideo = null,
  selectedTransition = null,
  onTransitionDrop,
  onTransitionSelect,
  onTransitionDeselect,
  onTransitionTimesChange,
  onTransitionRemove,
  nextItem,
  prevItem,
  // Link props
  canLinkItems,
  areItemsLinked,
  // Effect drop
  onEffectDrop,
  isItemLinked,
  getLinkGroupSize,
  getLinkedItemIds,
  onLinkItems,
  onUnlinkItems,
  onSelectedItemsChange,
  // Composition editor
  onOpenCompositionEditor,
}) => {
  const itemRef = useRef<HTMLDivElement>(null);
  
  // Use provided track height or fall back to default
  const trackHeightPx = propTrackHeight || TIMELINE_CONSTANTS.TRACK_HEIGHT;
  
  // State for splitting mode
  const [splitPosition, setSplitPosition] = React.useState<number | null>(null);
  const [isHovering, setIsHovering] = React.useState(false);

  // State for hover cursor management
  const [isHoveringItem, setIsHoveringItem] = React.useState(false);

  // State to track if video thumbnails are showing (for transparent background)
  const [isShowingVideoThumbnails, setIsShowingVideoThumbnails] = React.useState(false);

  // State to track context menu mouse position for splitting


  // Simplified touch state for immediate drag response
  const [touchStartPosition, setTouchStartPosition] = React.useState<{ x: number; y: number; time: number } | null>(null);

  // Throttle ref for split position updates
  const splitThrottleRef = useRef<number | null>(null);
  const lastSplitPositionRef = useRef<number | null>(null);

  // Get current edit mode, drag state, and committed position from store
  const { 
    editMode, 
    dragState,
    dragVisuals,
    clearCommittedPosition,
    getCommittedPosition,
  } = useVideoEditorStore();
  
  // Derive isDragging from drag state - use store as source of truth
  const storeIsDragging = dragState !== null;
  const committedDragPosition = getCommittedPosition(item.id);

  // Check if this item is being dragged OR has a pending position update
  // Use store's isDragging to detect ALL drags (primary and linked)
  const globalDragActive = storeIsDragging || isDragging;
  
  // Check if this is a clip drag operation
  const isClipDrag = dragState?.type?.startsWith('clip-') ?? false;
  
  // PRIMARY: The item being directly dragged
  // Use globalDragActive (store state) instead of just isDragging (prop) to ensure we detect the drag
  // even if the prop hasn't propagated yet
  const isPrimaryDrag = globalDragActive && isClipDrag && dragState?.clipId === item.id;
  
  // LINKED: This item is part of a linked group being dragged together
  // Check against store's drag state, not just the isDragging prop
  const isLinkedDrag = globalDragActive && isClipDrag && 
    dragState?.selectedClipsSnapshot?.some(snapshot => snapshot.id === item.id) && 
    dragState?.clipId !== item.id;
  
  // Combined: either primary or linked drag
  const isBeingDragged = isPrimaryDrag || isLinkedDrag;
  
  // Only show "active drag" visual (dashed border, preview) when there's actual mouse movement
  // This prevents the drag preview from flashing on simple clicks
  const hasActualDragMovement = dragState?.currentTime !== undefined && dragState.currentTime !== dragState.startTime;
  
  // Check for committed position - check both single (primary) and map (linked items)
  const myCommittedPosition = committedDragPosition;
  const hasCommittedPosition = myCommittedPosition !== null;

  // Check if any item in this item's link group is currently selected
  // This enables showing resize handles on all linked items when one is selected (Premiere Pro behavior)
  const isLinkedItemSelected = React.useMemo(() => {
    if (!item.linkGroup || !getLinkedItemIds) return false;
    const linkedIds = getLinkedItemIds(item.id);
    // Check if any of the linked items (excluding this one) is in the selection
    return linkedIds.some(linkedId => linkedId !== item.id && selectedItemIds.includes(linkedId));
  }, [item.linkGroup, item.id, getLinkedItemIds, selectedItemIds]);
  
  // Get the unique color for this item's link group
  const linkGroupColor = useMemo(() => getLinkGroupColor(item.linkGroup), [item.linkGroup]);
  
  // Check if this item is part of a link group
  const isLinked = !!item.linkGroup;
  
  // Check if item has effects applied
  const hasEffects = useMemo(() => {
    const effects = item.data?.effects;
    return effects && (Array.isArray(effects) ? effects.length > 0 : Object.keys(effects).length > 0);
  }, [item.data?.effects]);
  
  // Check if item has transitions
  const hasTransitions = !!item.inTransition || !!item.outTransition;
  
  // Check if we're currently dragging a transition on this clip
  const isTransitionResize = dragState?.type === 'transition-resize' && dragState.clipId === item.id;
  
  // Extract preview values if this item's transitions are being resized
  const inTransitionPreview = (isTransitionResize && dragState?.transitionPosition === 'start')
    ? { duration: dragState.previewDuration ?? item.inTransition?.duration ?? 0 }
    : null;
    
  const outTransitionPreview = (isTransitionResize && dragState?.transitionPosition === 'end')
    ? { duration: dragState.previewDuration ?? item.outTransition?.duration ?? 0 }
    : null;
  
  // Check if item is muted (audio clip-level mute)
  const isItemMuted = item.data?.muted === true || item.data?.volume === 0;
  
  // Check for adjacent items (items that meet/touch)
  const ADJACENCY_TOLERANCE = 0.001; // seconds
  const hasAdjacentLeft = prevItem ? Math.abs(prevItem.end - item.start) < ADJACENCY_TOLERANCE : false;
  const hasAdjacentRight = nextItem ? Math.abs(item.end - nextItem.start) < ADJACENCY_TOLERANCE : false;

  // Calculate base position
  const duration = item.end - item.start;
  const leftPercentage = (item.start / totalDuration) * 100;
  const widthPercentage = (duration / totalDuration) * 100;
  
  // Calculate transition widths as percentages for badge positioning
  // Add extra spacing (6px) beyond the transition edge for visual breathing room
  const BADGE_TRANSITION_SPACING = 6; // pixels of extra space beyond transition edge
  
  // Calculate actual overlap of transitions on this item
  // Uses absolute startTime/endTime from TransitionEntity
  const calculateTransitionOverlap = (
    transition: typeof item.inTransition | typeof item.outTransition, 
    position: 'in' | 'out',
    preview: { startTime?: number; endTime?: number } | null
  ): number => {
    if (!transition) return 0;
    
    // Use preview values if available, otherwise use actual transition values
    const transStartTime = preview?.startTime ?? transition.startTime;
    const transEndTime = preview?.endTime ?? transition.endTime;
    const transDuration = transEndTime - transStartTime;
    
    // Check if this is a between transition (has two clipIds)
    const isBetween = transition.position === 'between' || 
                      (transition.clipIds && transition.clipIds.length === 2 && transition.clipIds[1] !== undefined);
    
    // For standalone transitions, just use the duration directly
    if (!isBetween) {
      return Math.min((transDuration / duration) * 100, 50);
    }
    
    // For between transitions, calculate the actual overlap on this item
    let overlapStart, overlapEnd;
    if (position === 'out') {
      // For out transitions on the first item
      overlapStart = Math.max(transStartTime, item.start);
      overlapEnd = item.end;
    } else {
      // For in transitions on the second item
      overlapStart = item.start;
      overlapEnd = Math.min(transEndTime, item.end);
    }
    
    const overlap = Math.max(0, overlapEnd - overlapStart);
    return Math.min((overlap / duration) * 100, 50); // Cap at 50%
  };
  
  const inTransitionPercent = calculateTransitionOverlap(item.inTransition, 'in', inTransitionPreview as any);
  const outTransitionPercent = calculateTransitionOverlap(item.outTransition, 'out', outTransitionPreview as any);
  
  // Determine if resize handles should be visible (matches TimelineItemResizeHandles logic)
  const shouldShowHandles = isHovering || isSelected || isLinkedItemSelected;
  
  // Resize handle width in pixels (from TimelineItemResizeHandles component)
  const RESIZE_HANDLE_WIDTH = 16;
  
  // Calculate badge positions accounting for both transitions AND resize handles
  // Uses preview values during drag/resize for real-time positioning
  const leftBadgePosition = React.useMemo(() => {
    let position = '2px';
    
    // Account for left resize handle when visible
    if (shouldShowHandles && onDragStart && !splittingEnabled && !(isSelected && selectedItemIds.length > 1 && !isLinked)) {
      position = `${RESIZE_HANDLE_WIDTH + 2}px`;
    }
    
    // If there's an in-transition, position after it (overrides resize handle positioning)
    if (inTransitionPercent > 0) {
      // Position after the transition with spacing
      position = `calc(${inTransitionPercent}% + ${BADGE_TRANSITION_SPACING}px)`;
    }
    
    return position;
  }, [inTransitionPercent, BADGE_TRANSITION_SPACING, shouldShowHandles, onDragStart, splittingEnabled, isSelected, selectedItemIds.length, isLinked]);
  
  const rightBadgePosition = React.useMemo(() => {
    let position = '2px';
    
    // Account for right resize handle when visible
    if (shouldShowHandles && onDragStart && !splittingEnabled && !(isSelected && selectedItemIds.length > 1 && !isLinked)) {
      position = `${RESIZE_HANDLE_WIDTH + 2}px`;
    }
    
    // If there's an out-transition, position before it (overrides resize handle positioning)
    if (outTransitionPercent > 0) {
      // Position before the transition with spacing
      position = `calc(${outTransitionPercent}% + ${BADGE_TRANSITION_SPACING}px)`;
    }
    
    return position;
  }, [outTransitionPercent, BADGE_TRANSITION_SPACING, shouldShowHandles, onDragStart, splittingEnabled, isSelected, selectedItemIds.length, isLinked]);

  // Premiere Pro style: original item stays in place, drag preview follows mouse
  // No transform needed during drag - the original stays put
  let displayWidth = widthPercentage;
  
  // For committed position (after drag ends), we still need to show the item at the new position
  // until the data updates
  let transformX = 0;
  let transformY = 0;
  
  if (hasCommittedPosition && myCommittedPosition) {
    // After drag ended: Keep showing at committed position until data updates
    const newDuration = myCommittedPosition.duration;
    displayWidth = (newDuration / totalDuration) * 100;
    
    const startOffset = (myCommittedPosition.start ?? item.start) - item.start;
    const offsetAsParentPercent = (startOffset / totalDuration) * 100;
    transformX = displayWidth > 0 ? (offsetAsParentPercent / displayWidth) * 100 : 0;
    
    // Handle track change for committed position
    if (myCommittedPosition.row !== undefined) {
      const currentTrackIndex = myCommittedPosition.originalRow ?? 0;
      const targetTrackIndex = myCommittedPosition.row;
      const trackOffset = targetTrackIndex - currentTrackIndex;
      transformY = trackOffset * trackHeightPx;
    }
  }
  
  // Effect to clear committed position when item.start has actually changed
  React.useEffect(() => {
    if (hasCommittedPosition && myCommittedPosition) {
      // Check if item.start now matches the committed position (data has updated)
      const tolerance = 0.001; // Very small tolerance for floating point
      const positionMatches = Math.abs(item.start - (myCommittedPosition.start ?? item.start)) < tolerance;
      
      if (positionMatches) {
        // Data has updated to match committed position, clear it
        clearCommittedPosition(item.id);
      }
    }
  }, [item.start, hasCommittedPosition, myCommittedPosition, clearCommittedPosition, item.id]);
  
  // Use the potentially updated duration for width (already calculated above)
  const displayWidthPercentage = displayWidth;
  
  // Get original rect for drag preview positioning
  const [originalRect, setOriginalRect] = React.useState<DOMRect | null>(null);
  
  // Capture the original rect when drag starts
  React.useEffect(() => {
    if (isBeingDragged && itemRef.current && !originalRect) {
      setOriginalRect(itemRef.current.getBoundingClientRect());
    } else if (!isBeingDragged && originalRect) {
      setOriginalRect(null);
    }
  }, [isBeingDragged, originalRect]);

  // Callback to handle when video thumbnails display state changes
  const handleThumbnailDisplayChange = React.useCallback((isShowingThumbnails: boolean) => {
    setIsShowingVideoThumbnails(isShowingThumbnails);
  }, []);

  // Unified drag start logic for both mouse and touch
  const initiateDragStart = React.useCallback((
    clientX: number, 
    clientY: number, 
    isTouch: boolean = false
  ) => {
    // If splitting mode is enabled, don't handle dragging
    if (splittingEnabled) {
      return;
    }
    
    // If razor tool is active, don't start drag - let click handler do the cut
    if (editMode === 'razor') {
      return;
    }

    if (!onDragStart) {
      onSelect?.(item.id);
      return;
    }

    // Only select the item if it's not already selected (preserves multi-selection)
    // This allows dragging multiple selected items without losing the selection
    if (!isSelected) {
      // Premiere Pro behavior: When selecting a linked item, select all linked items
      if (isItemLinked?.(item.id) && getLinkedItemIds && onSelectedItemsChange) {
        const linkedIds = getLinkedItemIds(item.id);
        onSelectedItemsChange(linkedIds);
      } else if (onSelectionChange) {
        onSelectionChange(item.id, false); // Single selection mode
      } else {
        onSelect?.(item.id);
      }
    }

    const rect = itemRef.current?.getBoundingClientRect();
    if (!rect) return;

    const relativeX = clientX - rect.left;
    const itemWidth = rect.width;

    // Determine drag action based on position
    let action: "move" | "resize-start" | "resize-end" = "move";
    
    const resizeHandleWidth = isTouch ? 20 : 12; // Larger touch targets for mobile
    
    // Only detect resize if handles are not visible (multi-selected items)
    const isMultiSelected = isSelected && selectedItemIds.length > 1;
    const handlesVisible = !splittingEnabled && !isMultiSelected && !!onDragStart;
    
    if (!handlesVisible) {
      if (relativeX <= resizeHandleWidth) {
        action = "resize-start";
      } else if (relativeX >= itemWidth - resizeHandleWidth) {
        action = "resize-end";
      }
    }

    onDragStart(item, clientX, clientY, action, selectedItemIds);
  }, [splittingEnabled, editMode, onDragStart, onSelect, onSelectionChange, isSelected, item, selectedItemIds, isItemLinked, getLinkedItemIds, onSelectedItemsChange]);

  // Check if any transition is currently selected (blocks timeline item interaction)
  const isTransitionSelected = selectedTransition !== null;

  // Simple mouse down handler
  const handleMouseDown = (e: React.MouseEvent) => {
    const currentDrag = useVideoEditorStore.getState().dragState;
    const activeDragType = currentDrag?.type || null;
    
    // ============================================================
    // CRITICAL: Block mouse handling during HTML5 drag operations!
    // ============================================================
    // If a transition is being dragged (HTML5 drag and drop), we should NOT
    // handle any mouse events. The drop zones will handle the transition drop.
    if (currentDrag && (currentDrag.type === 'video-transition' || currentDrag.type === 'audio-transition')) {
      // This is an HTML5 drag operation - completely ignore mouse events!
      return;
    }

    logTimelineItem('MOUSE_DOWN', {
      itemId: item.id,
      itemLabel: item.label,
      itemStart: item.start,
      itemEnd: item.end,
      button: e.button,
      trackLocked,
      isTransitionSelected,
      activeDragType,
      target: (e.target as HTMLElement).className,
    });
    
    // Only handle left mouse button for drag operations
    if (e.button !== 0) {
      logTimelineItem('MOUSE_DOWN_BLOCKED: Not left click', null);
      return;
    }
    
    // Don't allow dragging items on locked tracks
    if (trackLocked) {
      logTimelineItem('MOUSE_DOWN_BLOCKED: Track locked', null);
      return;
    }
    
    // Check if the click target is a transition overlay - don't start drag if so
    const target = e.target as HTMLElement;
    if (target.closest('.timeline-transition-overlay') || 
        target.closest('[data-transition-resize-handle]') ||
        target.closest('[data-transition-drop-zone]')) {
      logTimelineItem('MOUSE_DOWN_BLOCKED: Clicked transition overlay', { 
        isTransitionOverlay: !!target.closest('.timeline-transition-overlay'),
        isResizeHandle: !!target.closest('[data-transition-resize-handle]'),
        isDropZone: !!target.closest('[data-transition-drop-zone]'),
      });
      return; // Let the transition overlay handle this event
    }
    
    // If a transition is selected, deselect it first but DON'T block timeline item interaction
    // The user clicking on a timeline item means they want to work with items, not transitions
    if (isTransitionSelected && onTransitionDeselect) {
      logTimelineItem('DESELECTING_TRANSITION', null);
      onTransitionDeselect();
      // Continue to handle the timeline item interaction
    }
    
    // Check if another drag is already active
    if (activeDragType !== null) {
      logTimelineItem('MOUSE_DOWN_BLOCKED: Another drag active', { activeDragType });
      return;
    }
    
    e.preventDefault();
    e.stopPropagation();

    logTimelineItem('INITIATING_DRAG', { itemId: item.id });
    initiateDragStart(e.clientX, e.clientY, false);
  };

  // Smart touch handlers - immediate drag start but handle taps gracefully
  const handleTouchStart = (e: React.TouchEvent) => {
    // Check if the touch target is a transition overlay - don't start drag if so
    const target = e.target as HTMLElement;
    if (target.closest('.timeline-transition-overlay') || 
        target.closest('[data-transition-resize-handle]') ||
        target.closest('[data-transition-drop-zone]')) {
      return; // Let the transition overlay handle this event
    }
    
    // If a transition is selected, deselect it first
    if (isTransitionSelected && onTransitionDeselect) {
      onTransitionDeselect();
    }
    
    e.preventDefault();
    e.stopPropagation();

    const touch = e.touches[0];
    if (!touch) return;

    // Record touch start for tap detection
    setTouchStartPosition({ 
      x: touch.clientX, 
      y: touch.clientY, 
      time: Date.now() 
    });

    // Add haptic feedback for better mobile UX
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }

    // Start drag immediately - the global touch move will handle ghost updates
    initiateDragStart(touch.clientX, touch.clientY, true);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const touch = e.changedTouches[0];
    if (touch && touchStartPosition) {
      const deltaX = Math.abs(touch.clientX - touchStartPosition.x);
      const deltaY = Math.abs(touch.clientY - touchStartPosition.y);
      const duration = Date.now() - touchStartPosition.time;
      
      // If it was a quick tap with minimal movement, treat as a click
      if (duration < 150 && deltaX < 5 && deltaY < 5) {
        handleClick(e as any);
      }
    }

    setTouchStartPosition(null);
  };
  
  // Check if razor tool is active
  const isRazorToolActive = editMode === 'razor';
  
  // Enhanced click handler for selection with multi-selection support
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Only handle left clicks for selection changes
    if (e.button !== 0) {
      return;
    }
    
    // Check if the click target is a transition overlay - don't handle if so
    const target = e.target as HTMLElement;
    if (target.closest('.timeline-transition-overlay') || 
        target.closest('[data-transition-resize-handle]') ||
        target.closest('[data-transition-drop-zone]')) {
      return; // Let the transition overlay handle this event
    }
    
    // Handle razor tool (C) - click to cut at cursor position
    if (isRazorToolActive && onSplitItems) {
      // Don't allow cutting on locked tracks
      if (trackLocked) {
        console.warn('Cannot cut item on locked track');
        return;
      }
      
      const rect = itemRef.current?.getBoundingClientRect();
      if (!rect) return;
      
      const relativeX = e.clientX - rect.left;
      const itemWidth = rect.width;
      const clickPercentage = Math.max(0, Math.min(1, relativeX / itemWidth));
      const itemDuration = item.end - item.start;
      const splitTime = item.start + (itemDuration * clickPercentage);
      
      // Minimum segment duration for razor cuts
      const minSegmentDuration = 0.016; // ~1 frame at 60fps
      if (splitTime - item.start >= minSegmentDuration && item.end - splitTime >= minSegmentDuration) {
        onSplitItems(item.id, splitTime);
      }
      
      return;
    }
    
    // Handle legacy splitting mode (if still enabled)
    if (splittingEnabled && onSplitItems) {
      const rect = itemRef.current?.getBoundingClientRect();
      if (!rect) return;
      
      const relativeX = e.clientX - rect.left;
      const itemWidth = rect.width;
      const clickPercentage = Math.max(0, Math.min(1, relativeX / itemWidth)); // Clamp between 0 and 1
      const itemDuration = item.end - item.start;
      const splitTime = item.start + (itemDuration * clickPercentage);
      
      // Reduce minimum segment duration to allow more precise splits
      const minSegmentDuration = 0.016; // ~1 frame at 60fps, much more permissive
      if (splitTime - item.start >= minSegmentDuration && item.end - splitTime >= minSegmentDuration) {
        onSplitItems(item.id, splitTime);
      } else {
        // Provide user feedback for why split was rejected
        console.warn('Split rejected: segments would be too small', {
          leftSegment: splitTime - item.start,
          rightSegment: item.end - splitTime,
          minRequired: minSegmentDuration
        });
      }
      
      return;
    }
    
    const isShiftPressed = e.shiftKey;
    const isCtrlPressed = e.ctrlKey || e.metaKey; // Support both Ctrl and Cmd (Mac)
    
    // Premiere Pro behavior: When clicking a linked item, select all linked items
    if (isItemLinked?.(item.id) && getLinkedItemIds && onSelectedItemsChange) {
      const linkedIds = getLinkedItemIds(item.id);
      
      if (isShiftPressed || isCtrlPressed) {
        // Multi-selection mode - add all linked items to selection
        const currentSelection = new Set(selectedItemIds);
        linkedIds.forEach(id => currentSelection.add(id));
        onSelectedItemsChange(Array.from(currentSelection));
      } else {
        // Single selection mode - replace selection with all linked items
        onSelectedItemsChange(linkedIds);
      }
    } else if (onSelectionChange && (isShiftPressed || isCtrlPressed)) {
      // Multi-selection mode (unlinked items)
      onSelectionChange(item.id, true);
    } else {
      // Single selection mode (or fallback to old onSelect)
      if (onSelectionChange) {
        onSelectionChange(item.id, false);
      } else {
        onSelect?.(item.id);
      }
    }
  };

  // Handle double-click to open composition editor for motion graphics
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Only handle for motion graphics clips
    if (item.type !== 'motion-graphics') {
      return;
    }
    
    // Don't open composition editor on locked tracks
    if (trackLocked) {
      return;
    }
    
    // Open composition editor
    if (onOpenCompositionEditor) {
      onOpenCompositionEditor(item.id);
    }
  }, [item.id, item.type, trackLocked, onOpenCompositionEditor]);

  // Handle context menu (right-click) separately
  const handleContextMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
  
    // Mouse position no longer needed since we split at playhead position
  
    // If this item is not already selected, select it
    // Premiere Pro behavior: When right-clicking a linked item, select all linked items
    if (!isSelected) {
      if (isItemLinked?.(item.id) && getLinkedItemIds && onSelectedItemsChange) {
        // Select all linked items
        const linkedIds = getLinkedItemIds(item.id);
        onSelectedItemsChange(linkedIds);
      } else if (onSelectionChange) {
        onSelectionChange(item.id, false); // Single selection when right-clicking unselected item
      } else {
        onSelect?.(item.id);
      }
    }
    // else: Right-clicked selected item - preserve current selection
  };

  const getCursorStyle = (): { className: string; style: React.CSSProperties } => {
    // Locked tracks show not-allowed cursor
    if (trackLocked) {
      return { 
        className: "cursor-not-allowed", 
        style: { cursor: "not-allowed" } 
      };
    }
    
    // Razor tool - show crosshair/cut cursor
    if (isRazorToolActive) {
      return { 
        className: "cursor-crosshair", 
        style: { cursor: "crosshair" } 
      };
    }
    
    if (splittingEnabled) {
      return { 
        className: "cursor-col-resize", 
        style: { cursor: "col-resize" } 
      };
    }
    if (!onDragStart) {
      return { 
        className: "cursor-pointer", 
        style: { cursor: "pointer" } 
      };
    }
    
    // Use grabbing cursor when hovering for better feedback
    const cursor = isHoveringItem ? "grabbing" : "grab";
    return { 
      className: `cursor-grab hover:cursor-grabbing`, 
      style: { cursor } 
    };
  };

  const handleDelete = () => {    
    // If this item is part of a multi-selection, delete all selected items
    if (isSelected && selectedItemIds.length > 1) {
      onDeleteItems?.(selectedItemIds);
    } else {
      // Single item delete - still pass as array for consistency
      onDeleteItems?.([item.id]);
    }
  };

  const handleDuplicate = () => {
    // If this item is part of a multi-selection, duplicate all selected items
    if (isSelected && selectedItemIds.length > 1) {
      onDuplicateItems?.(selectedItemIds);
    } else {
      // Single item duplicate - still pass as array for consistency
      onDuplicateItems?.([item.id]);
    }
  };

  const handleSplit = () => {
    if (!onSplitItems || !currentFrame || !fps) return;
    
    // Use current playhead position instead of mouse cursor
    const currentTimeInSeconds = currentFrame / fps;
    
    // Check if the current playhead is within the item's time range
    if (currentTimeInSeconds < item.start || currentTimeInSeconds > item.end) {
      console.warn('Current playhead is not within the item\'s time range');
      return;
    }
    
    // Check minimum segment duration
    const minSegmentDuration = 0.016; // ~1 frame at 60fps
    const leftSegmentDuration = currentTimeInSeconds - item.start;
    const rightSegmentDuration = item.end - currentTimeInSeconds;
    
    if (leftSegmentDuration >= minSegmentDuration && rightSegmentDuration >= minSegmentDuration) {
      onSplitItems(item.id, currentTimeInSeconds);
    } else {
      console.warn('Split rejected: segments would be too small', {
        leftSegment: leftSegmentDuration,
        rightSegment: rightSegmentDuration,
        minRequired: minSegmentDuration
      });
    }
    
    // Mouse position no longer needed
  };

  // Enhanced mouse move handler for splitting mode (throttled)
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!splittingEnabled || !itemRef.current) return;
    
    // Cancel previous throttled call
    if (splitThrottleRef.current) {
      cancelAnimationFrame(splitThrottleRef.current);
    }
    
    // Throttle using requestAnimationFrame for smooth updates
    splitThrottleRef.current = requestAnimationFrame(() => {
      if (!itemRef.current) return;
      
      const rect = itemRef.current.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      const percentage = Math.max(0, Math.min(100, (relativeX / rect.width) * 100));
      
      // Only update if position has changed significantly (reduce unnecessary renders)
      if (lastSplitPositionRef.current === null || Math.abs(percentage - lastSplitPositionRef.current) > 0.5) {
        setSplitPosition(percentage);
        lastSplitPositionRef.current = percentage;
      }
    });
  }, [splittingEnabled]);

  // Handle resize handle mouse down events
  const handleResizeMouseDown = (e: React.MouseEvent<HTMLDivElement>, position: 'left' | 'right') => {
    // Only handle left mouse button for resize operations
    if (e.button !== 0) {
      return;
    }
    
    // If a transition is selected, deselect it first
    if (isTransitionSelected && onTransitionDeselect) {
      onTransitionDeselect();
    }
    
    e.preventDefault();
    e.stopPropagation();

    if (!onDragStart) {
      return;
    }

    // Select the item if it's not already selected (preserves multi-selection)
    // Premiere Pro behavior: When selecting a linked item, select all linked items
    if (!isSelected) {
      if (isItemLinked?.(item.id) && getLinkedItemIds && onSelectedItemsChange) {
        const linkedIds = getLinkedItemIds(item.id);
        onSelectedItemsChange(linkedIds);
      } else if (onSelectionChange) {
        onSelectionChange(item.id, false); // Single selection mode
      } else {
        onSelect?.(item.id);
      }
    }

    // Map resize handle position to drag action
    const action = position === 'left' ? 'resize-start' : 'resize-end';
    
    onDragStart(item, e.clientX, e.clientY, action, selectedItemIds);
  };

  // Handle resize handle touch start events
  const handleResizeTouchStart = (e: React.TouchEvent<HTMLDivElement>, position: 'left' | 'right') => {
    // If a transition is selected, deselect it first
    if (isTransitionSelected && onTransitionDeselect) {
      onTransitionDeselect();
    }
    
    e.preventDefault();
    e.stopPropagation();

    if (!onDragStart) {
      return;
    }

    // Select the item if it's not already selected (preserves multi-selection)
    // Premiere Pro behavior: When selecting a linked item, select all linked items
    if (!isSelected) {
      if (isItemLinked?.(item.id) && getLinkedItemIds && onSelectedItemsChange) {
        const linkedIds = getLinkedItemIds(item.id);
        onSelectedItemsChange(linkedIds);
      } else if (onSelectionChange) {
        onSelectionChange(item.id, false); // Single selection mode
      } else {
        onSelect?.(item.id);
      }
    }

    // Map resize handle position to drag action
    const action = position === 'left' ? 'resize-start' : 'resize-end';
    
    // Use the first touch point for coordinates
    const touch = e.touches[0];
    if (touch) {
      onDragStart(item, touch.clientX, touch.clientY, action, selectedItemIds);
    }
  };

  const handleMouseEnter = () => {
    setIsHovering(true);
    setIsHoveringItem(true);
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
    setIsHoveringItem(false);
    
    // Cancel any pending throttled updates
    if (splitThrottleRef.current) {
      cancelAnimationFrame(splitThrottleRef.current);
      splitThrottleRef.current = null;
    }
    
    setSplitPosition(null);
    lastSplitPositionRef.current = null;
  };

  // ==========================================
  // SIMPLE TRANSITION DROP HANDLERS
  // ==========================================
  const handleTransitionDropStart = useCallback((e: React.DragEvent) => {
    if (!onTransitionDrop || trackLocked) return;
    
    // Get drag data from the centralized store (no JSON.parse needed!)
    const dragData = getCurrentDrag();
    if (!dragData) return;
    
    if (dragData.type === "video-transition") {
      const hasAdjacentPrev = prevItem && Math.abs(prevItem.end - item.start) < 0.001;
      
      onTransitionDrop(
        "start",
        dragData.transitionType as string,
        true, // isVideo
        dragData.transitionDuration || 1,
        hasAdjacentPrev ? prevItem?.id : undefined
      );
    } else if (dragData.type === "audio-transition") {
      const hasAdjacentPrev = prevItem && Math.abs(prevItem.end - item.start) < 0.001;
      
      onTransitionDrop(
        "start",
        dragData.transitionType as string,
        false, // isVideo
        dragData.transitionDuration || 1,
        hasAdjacentPrev ? prevItem?.id : undefined
      );
    }
  }, [onTransitionDrop, trackLocked, prevItem, item.start]);
  
  const handleTransitionDropEnd = useCallback((e: React.DragEvent) => {
    if (!onTransitionDrop || trackLocked) return;
    
    // Get drag data from the centralized store (no JSON.parse needed!)
    const dragData = getCurrentDrag();
    if (!dragData) return;
    
    if (dragData.type === "video-transition") {
      const hasAdjacentNext = nextItem && Math.abs(item.end - nextItem.start) < 0.001;
      
      onTransitionDrop(
        "end",
        dragData.transitionType as string,
        true, // isVideo
        dragData.transitionDuration || 1,
        hasAdjacentNext ? nextItem?.id : undefined
      );
    } else if (dragData.type === "audio-transition") {
      const hasAdjacentNext = nextItem && Math.abs(item.end - nextItem.start) < 0.001;
      
      onTransitionDrop(
        "end",
        dragData.transitionType as string,
        false, // isVideo
        dragData.transitionDuration || 1,
        hasAdjacentNext ? nextItem?.id : undefined
      );
    }
  }, [onTransitionDrop, trackLocked, nextItem, item.end]);

  // ==========================================
  // EFFECT DROP HANDLERS
  // ==========================================
  const [isDragOverForEffect, setIsDragOverForEffect] = useState(false);
  
  // Check if a drag event is for an effect/mask
  const isEffectOrMaskDrag = useCallback((e: React.DragEvent): boolean => {
    // Check for our custom effect type
    if (e.dataTransfer.types.includes('text/x-video-effect')) {
      return true;
    }
    // Also check the centralized drag store
    const dragData = getCurrentDrag();
    if (dragData?.type === 'effect' || dragData?.type === 'mask') {
      return true;
    }
    return false;
  }, []);
  
  const handleEffectDragEnter = useCallback((e: React.DragEvent) => {
    // Check if this could be an effect drag
    if (isEffectOrMaskDrag(e)) {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOverForEffect(true);
    }
  }, [isEffectOrMaskDrag]);
  
  const handleEffectDragOver = useCallback((e: React.DragEvent) => {
    // ============================================================
    // CRITICAL: Check for transitions FIRST!
    // ============================================================
    const dragData = getCurrentDrag();
    
    // If it's a transition, don't handle it - let drop zones handle it
    if (dragData && (dragData.type === 'video-transition' || dragData.type === 'audio-transition')) {
      // Don't preventDefault - let the event reach drop zones!
      return;
    }
    
    // Check if this could be an effect drag
    if (isEffectOrMaskDrag(e)) {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOverForEffect(true);
    }
  }, [isEffectOrMaskDrag]);
  
  const handleEffectDragLeave = useCallback((e: React.DragEvent) => {
    // Only remove highlight if actually leaving the element (not entering a child)
    const relatedTarget = e.relatedTarget as Node | null;
    const currentTarget = e.currentTarget as Node;
    if (!relatedTarget || !currentTarget.contains(relatedTarget)) {
      setIsDragOverForEffect(false);
    }
  }, []);
  
  const handleEffectDrop = useCallback((e: React.DragEvent) => {
    setIsDragOverForEffect(false);
    
    // ============================================================
    // CRITICAL: Check for transitions FIRST!
    // ============================================================
    const dragData = getCurrentDrag();
    
    // If it's a transition, don't handle it - let drop zones handle it
    if (dragData && (dragData.type === 'video-transition' || dragData.type === 'audio-transition')) {
      // Don't preventDefault - let the event reach drop zones!
      return;
    }
    
    // Only process if this is an effect/mask drop
    if (!isEffectOrMaskDrag(e)) {
      return; // Let other handlers process this
    }
    
    e.preventDefault();
    e.stopPropagation();
    
    if (!onEffectDrop || trackLocked) return;
    
    if (!dragData) return;
    
    // Handle video effects
    if (dragData.type === 'effect') {
      onEffectDrop(item.id, 'videoEffect', dragData.effectType!);
    }
    // Handle masks  
    else if (dragData.type === 'mask') {
      onEffectDrop(item.id, 'mask', dragData.maskType!);
    }
  }, [onEffectDrop, trackLocked, item.id, isEffectOrMaskDrag]);

  // Determine context menu text based on selection
  const isMultiSelection = isSelected && selectedItemIds.length > 1;
  const deleteText = isMultiSelection ? `Delete ${selectedItemIds.length} items` : 'Delete';
  const duplicateText = isMultiSelection ? `Duplicate ${selectedItemIds.length} items` : 'Duplicate';
  
  // Show split option only for single items (not multi-selection) and when playhead is over the item
  const isPlayheadOverItem = currentFrame && fps ? 
    (currentFrame / fps >= item.start && currentFrame / fps <= item.end) : false;
  const showSplitOption = !isMultiSelection && !!onSplitItems && isPlayheadOverItem;

  // Link/Unlink handlers
  const handleLink = useCallback(() => {
    if (onLinkItems && selectedItemIds.length > 0) {
      onLinkItems(selectedItemIds);
    }
  }, [onLinkItems, selectedItemIds]);

  const handleUnlink = useCallback(() => {
    if (onUnlinkItems && selectedItemIds.length > 0) {
      onUnlinkItems(selectedItemIds);
    }
  }, [onUnlinkItems, selectedItemIds]);

  // Check if link/unlink options should be shown
  const canLink = canLinkItems?.(selectedItemIds) ?? false;
  const canUnlink = areItemsLinked?.(selectedItemIds) ?? false;

  // Extract fade values from item data (for audio/sound items)
  const fadeIn = item.data?.styles?.fadeIn ?? 0;
  const fadeOut = item.data?.styles?.fadeOut ?? 0;

  return (
    <ContextMenu onOpenChange={onContextMenuOpenChange}>
      <ContextMenuTrigger asChild>
        <div
          ref={itemRef}
          className={`timeline-item group absolute rounded flex items-center justify-center text-xs font-light text-white shadow-sm hover:shadow-md select-none overflow-hidden touch-none ${getCursorStyle().className} ${
            isBeingDragged && hasActualDragMovement
              ? 'border-2 border-dashed border-cyan-400' 
              : isDragOverForEffect 
                ? 'border-2 border-primary ring-2 ring-primary/30' 
                : isSelected 
                  ? item.linkGroup && linkGroupColor
                    ? 'border-2'
                    : 'border-2 dark:border-white border-black'
                  : isLinkedItemSelected 
                    ? 'border-2' 
                    : item.linkGroup 
                      ? 'border' 
                      : 'border border-white/20'
          }`}
          style={{
            left: `${leftPercentage}%`,
            top: '50%',
            width: `${displayWidthPercentage}%`,
            height: 'var(--timeline-item-height, 40px)',
            backgroundColor: isShowingVideoThumbnails ? 'transparent' : (item.color || '#3b82f6'),
            // Premiere Pro style: original stays in place at full opacity, drag preview is semi-transparent
            opacity: (trackLocked || trackHidden || trackMuted) ? 0.4 : 1,
            userSelect: 'none',
            // Only apply transform for committed position (after drag ends)
            // During drag, the original stays in place
            transform: hasCommittedPosition
              ? `translate(${transformX}%, calc(-50% + ${transformY}px))` 
              : 'translateY(-50%)',
            // Disable transitions on transform/left to prevent wobble during drag handoff
            // Only allow transitions on non-position properties like opacity
            transition: 'opacity 0.1s ease-out',
            pointerEvents: isBeingDragged && hasActualDragMovement ? 'none' : 'auto',
            // CSS containment for performance - isolates layout/style calculations
            contain: 'layout style',
            // Dynamic border and glow based on link group color
            ...(isBeingDragged && hasActualDragMovement
              ? { boxShadow: '0 0 8px rgba(34,211,238,0.5)' }
              : isSelected && linkGroupColor
                ? { 
                    borderColor: linkGroupColor.bg,
                    boxShadow: `0 0 8px ${linkGroupColor.glow}` 
                  }
                : isLinkedItemSelected && linkGroupColor
                  ? { 
                      borderColor: linkGroupColor.bg,
                      boxShadow: `0 0 6px ${linkGroupColor.glow}`,
                    }
                  : item.linkGroup && linkGroupColor
                    ? { borderColor: `${linkGroupColor.bg}50` } // 50 = ~31% opacity in hex
                    : {}
            ),
            ...getCursorStyle().style,
          }}
          data-clip-id={item.id}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onContextMenu={handleContextMenu}
          onMouseMove={handleMouseMove}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onDragEnter={handleEffectDragEnter}
          onDragOver={handleEffectDragOver}
          onDragLeave={handleEffectDragLeave}
          onDrop={handleEffectDrop}
        >
          {/* Adjacent item indicators - thin gradient strokes showing where items meet */}
          {hasAdjacentLeft && (
            <div 
              className="absolute left-0 top-0 bottom-0 w-[2px] pointer-events-none z-10"
              style={{
                background: 'linear-gradient(to right, rgba(255,255,255,0.6), rgba(255,255,255,0))',
              }}
            />
          )}
          {hasAdjacentRight && (
            <div 
              className="absolute right-0 top-0 bottom-0 w-[2px] pointer-events-none z-10"
              style={{
                background: 'linear-gradient(to left, rgba(255,255,255,0.6), rgba(255,255,255,0))',
              }}
            />
          )}
          
          {/* Drag preview - Premiere Pro style copy that follows the mouse */}
          {/* For PRIMARY item: show preview at dragged position */}
          {/* For LINKED items: show preview at their calculated position (horizontal only, same track) */}
          {isBeingDragged && dragState && isClipDrag && dragState.currentTime !== undefined && originalRect && (() => {
            // Find this item's snapshot in the drag state
            const itemSnapshot = dragState.selectedClipsSnapshot?.find(s => s.id === item.id);
            const primarySnapshot = dragState.selectedClipsSnapshot?.find(s => s.id === dragState.clipId);
            
            if (!itemSnapshot || !primarySnapshot) return null;
            
            // Derive action from drag type
            const action = dragState.type === 'clip-move' ? 'move' : 
                          dragState.type === 'clip-resize-start' ? 'resize-start' : 'resize-end';
            
            // Calculate delta from primary item's movement
            const deltaTime = dragState.currentTime - primarySnapshot.originalStartTime;
            const deltaDuration = (dragState.currentDuration ?? primarySnapshot.originalDuration) - primarySnapshot.originalDuration;
            
            // Calculate this item's current position based on the delta
            const itemCurrentStart = itemSnapshot.originalStartTime + deltaTime;
            const itemCurrentDuration = action === 'move' 
              ? itemSnapshot.originalDuration 
              : itemSnapshot.originalDuration + deltaDuration;
            
            // Calculate track row indices for vertical offset
            const tracks = useVideoEditorStore.getState().tracks;
            
            // For linked items (not the primary item), keep them on their original track
            const isPrimaryItem = item.id === dragState.clipId;
            const isLinkedItem = item.linkGroup && !isPrimaryItem;
            
            const startTrackIndex = itemSnapshot.originalTrackId 
              ? tracks.findIndex(t => t.id === itemSnapshot.originalTrackId)
              : 0;
            
            // Only apply track changes to the primary item, linked items stay on original track
            const currentTrackIndex = isLinkedItem 
              ? startTrackIndex // Linked items don't change tracks
              : (dragState.currentTrackId 
                  ? tracks.findIndex(t => t.id === dragState.currentTrackId)
                  : startTrackIndex);
            
            return (
              <DragPreviewWithOverlay
                item={item}
                originalRect={originalRect}
                dragInfo={{
                  currentStart: itemCurrentStart,
                  startPosition: itemSnapshot.originalStartTime,
                  currentDuration: itemCurrentDuration,
                  startDuration: itemSnapshot.originalDuration,
                  currentRow: currentTrackIndex,
                  startRow: startTrackIndex,
                  action: action,
                }}
                totalDuration={totalDuration}
                color={item.color}
                isShowingVideoThumbnails={isShowingVideoThumbnails}
                fps={fps}
                currentFrame={currentFrame}
                trackHeight={trackHeightPx}
              />
            );
          })()}
          
          <TimelineItemResizeHandles 
            onDragStart={!!onDragStart}
            splittingEnabled={splittingEnabled}
            isHovering={isHovering}
            isSelected={isSelected}
            isDragging={isDragging}
            isMultiSelected={isSelected && selectedItemIds.length > 1}
            isLinked={!!item.linkGroup}
            isLinkedItemSelected={isLinkedItemSelected}
            onMouseDown={handleResizeMouseDown}
            onTouchStart={handleResizeTouchStart}
          />
          
          <TimelineItemContent 
            label={item.label}
            type={item.type}
            data={item.data}
            start={item.start}
            end={item.end}
            mediaStart={item.mediaStart}
            mediaEnd={item.mediaEnd}
            isHovering={isHovering} // Pass hover state to content
            isSelected={isSelected} // Pass selected state for tooltips
            itemId={item.id} // Pass item ID to check for resize operations
            onThumbnailDisplayChange={handleThumbnailDisplayChange} // Pass callback to detect thumbnail display
            currentFrame={currentFrame}
            fps={fps}
          />
          
          {/* Keyframe markers - show diamond indicators for animated properties */}
          {item.data?.keyframes && (() => {
            const keyframes = item.data.keyframes as PropertyKeyframes[];
            // Check if any property has actual keyframes
            const hasAnyKeyframes = keyframes.some(pk => pk.keyframes && pk.keyframes.length > 0);
            if (!hasAnyKeyframes) return null;
            
            return (
              <TimelineKeyframes
                clipId={item.id}
                keyframes={keyframes}
                duration={duration}
                width={itemRef.current?.offsetWidth ?? 100}
                isSelected={isSelected}
                fps={fps}
                currentTime={currentFrame !== undefined ? (currentFrame / fps) - item.start : undefined}
              />
            );
          })()}
          
          {/* Link indicator badge with unique color per link group */}
          {/* Moves right when resize handles are visible OR when there's an in-transition to avoid overlap */}
          {item.linkGroup && linkGroupColor && (
            <div 
              className="absolute top-0.5 z-40 pointer-events-none transition-all duration-200"
              style={{ left: leftBadgePosition }}
              title={`Linked with ${(getLinkGroupSize?.(item.id) ?? 1) - 1} other item(s)${isLinkedItemSelected ? ' (linked item selected)' : ''}`}
            >
              <div 
                className="rounded p-0.5 shadow-sm"
                style={{ 
                  backgroundColor: linkGroupColor.bg,
                  opacity: isSelected || isLinkedItemSelected ? 1 : 0.85,
                }}
              >
                <Link2 className="w-3 h-3 text-white drop-shadow-sm" />
              </div>
            </div>
          )}
          
          {/* Status badges (right side) - effects, transitions, muted, track states */}
          {/* Moves left when resize handles are visible OR when there's an out-transition to avoid overlap */}
          <div 
            className="absolute top-0.5 flex gap-0.5 z-40 pointer-events-none transition-all duration-200"
            style={{ right: rightBadgePosition }}
          >
            {/* Effects badge */}
            {hasEffects && (
              <div 
                className="rounded p-0.5 shadow-sm" 
                style={{ backgroundColor: '#A855F7' }}
                title="Effects applied"
              >
                <Sparkles className="w-3 h-3 text-white drop-shadow-sm" />
              </div>
            )}
            
            {/* Transitions badge */}
            {hasTransitions && (
              <div 
                className="rounded p-0.5 shadow-sm" 
                style={{ backgroundColor: '#3B82F6' }}
                title={`${item.inTransition ? 'In' : ''}${item.inTransition && item.outTransition ? ' + ' : ''}${item.outTransition ? 'Out' : ''} transition`}
              >
                <Shuffle className="w-3 h-3 text-white drop-shadow-sm" />
              </div>
            )}
            
            {/* Item muted badge (clip-level) */}
            {isItemMuted && (
              <div 
                className="rounded p-0.5 shadow-sm" 
                style={{ backgroundColor: '#EF4444' }}
                title="Clip muted"
              >
                <VolumeX className="w-3 h-3 text-white drop-shadow-sm" />
              </div>
            )}
            
            {/* Track state indicators */}
            {trackHidden && (
              <div 
                className="rounded p-0.5 shadow-sm" 
                style={{ backgroundColor: '#6B7280' }}
                title="Track hidden - not in final video"
              >
                <EyeOff className="w-3 h-3 text-white drop-shadow-sm" />
              </div>
            )}
            
            {trackMuted && !isItemMuted && (
              <div 
                className="rounded p-0.5 shadow-sm" 
                style={{ backgroundColor: '#F59E0B' }}
                title="Track muted"
              >
                <VolumeX className="w-3 h-3 text-white drop-shadow-sm" />
              </div>
            )}
            
            {trackLocked && (
              <div 
                className="rounded p-0.5 shadow-sm" 
                style={{ backgroundColor: '#F97316' }}
                title="Track locked"
              >
                <Lock className="w-3 h-3 text-white drop-shadow-sm" />
              </div>
            )}
          </div>
          
          {/* Transition drop zones - visible when dragging transitions */}
          <TimelineItemTransitionDropZones
            isDraggingTransition={isDraggingTransition}
            draggingTransitionIsVideo={draggingTransitionIsVideo}
            onDropStart={handleTransitionDropStart}
            onDropEnd={handleTransitionDropEnd}
            hasInTransition={!!item.inTransition}
            hasOutTransition={!!item.outTransition}
            // Check if adjacent items are snapped (zero gap)
            hasAdjacentNextItem={nextItem ? Math.abs(item.end - nextItem.start) < 0.001 : false}
            hasAdjacentPrevItem={prevItem ? Math.abs(prevItem.end - item.start) < 0.001 : false}
            itemDuration={duration}
            pixelsPerSecond={itemRef.current ? (itemRef.current.offsetWidth / duration) : 100}
            isVideoItem={isVideoTrackItem(item.type)}
          />

          {/* Effect drop overlay - shows when dragging an effect over this item */}
          {isDragOverForEffect && (
            <div 
              className="absolute inset-0 z-50 pointer-events-none rounded flex items-center justify-center"
              style={{
                background: 'rgba(59, 130, 246, 0.3)',
                border: '2px dashed rgba(59, 130, 246, 0.8)',
                boxShadow: '0 0 12px rgba(59, 130, 246, 0.5)',
              }}
            >
              <div className="bg-blue-500/90 text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg">
                Drop Effect
              </div>
            </div>
          )}
          
          {/* Fade overlays for audio/sound items */}
          <TimelineItemFadeOverlays 
            fadeIn={fadeIn}
            fadeOut={fadeOut}
            duration={duration}
          />
          
          {/* Interactive transition overlays */}
          {/* Only render individual overlays if NOT a between transition */}
          {item.inTransition && item.inTransition.position !== 'between' && (
            <TimelineItemTransitionOverlay
              itemId={item.id}
              transition={item.inTransition}
              position="start"
              itemDuration={duration}
              itemStartTime={item.start}
              isSelected={selectedTransition?.itemId === item.id && selectedTransition?.position === 'start'}
              onSelect={() => onTransitionSelect?.('start')}
              onDeselect={onTransitionDeselect}
              onTimesChange={(startTime, endTime) => onTransitionTimesChange?.('start', startTime, endTime)}
              onRemove={() => onTransitionRemove?.('start')}
              trackLocked={trackLocked}
            />
          )}
          
          {item.outTransition && item.outTransition.position !== 'between' && (
            <TimelineItemTransitionOverlay
              itemId={item.id}
              transition={item.outTransition}
              position="end"
              itemDuration={duration}
              itemStartTime={item.start}
              isSelected={selectedTransition?.itemId === item.id && selectedTransition?.position === 'end'}
              onSelect={() => onTransitionSelect?.('end')}
              onDeselect={onTransitionDeselect}
              onTimesChange={(startTime, endTime) => onTransitionTimesChange?.('end', startTime, endTime)}
              onRemove={() => onTransitionRemove?.('end')}
              trackLocked={trackLocked}
            />
          )}
          
          <TimelineItemSplitLine 
            splittingEnabled={splittingEnabled}
            isHovering={isHovering}
            splitPosition={splitPosition}
          />
        </div>
      </ContextMenuTrigger>
      
      <TimelineItemContextMenu 
        onDuplicate={handleDuplicate}
        onDelete={handleDelete}
        onSplit={handleSplit}
        onDuplicateItems={onDuplicateItems}
        onDeleteItems={onDeleteItems}
        onSplitItems={onSplitItems}
        duplicateText={duplicateText}
        deleteText={deleteText}
        showSplit={showSplitOption}
        canLink={canLink}
        canUnlink={canUnlink}
        onLink={handleLink}
        onUnlink={handleUnlink}
      />
    </ContextMenu>
  );
};

/**
 * Memoized TimelineItem component with custom comparison function.
 * Only re-renders when props that affect visual output actually change.
 * This is critical for performance with many timeline items.
 */
export const MemoizedTimelineItem = React.memo(TimelineItem, (prevProps, nextProps) => {
  // Compare item properties that affect rendering
  if (prevProps.item.id !== nextProps.item.id) return false;
  if (prevProps.item.start !== nextProps.item.start) return false;
  if (prevProps.item.end !== nextProps.item.end) return false;
  if (prevProps.item.color !== nextProps.item.color) return false;
  if (prevProps.item.label !== nextProps.item.label) return false;
  if (prevProps.item.type !== nextProps.item.type) return false;
  if (prevProps.item.linkGroup !== nextProps.item.linkGroup) return false;
  
  // Compare transitions (shallow)
  if (prevProps.item.inTransition !== nextProps.item.inTransition) return false;
  if (prevProps.item.outTransition !== nextProps.item.outTransition) return false;
  
  // Compare data properties that affect badge rendering
  if (prevProps.item.data?.effects !== nextProps.item.data?.effects) return false;
  if (prevProps.item.data?.muted !== nextProps.item.data?.muted) return false;
  if (prevProps.item.data?.volume !== nextProps.item.data?.volume) return false;
  // Compare keyframes for animation markers
  if (prevProps.item.data?.keyframes !== nextProps.item.data?.keyframes) return false;
  
  // Compare scalar props
  if (prevProps.totalDuration !== nextProps.totalDuration) return false;
  if (prevProps.zoomScale !== nextProps.zoomScale) return false;
  if (prevProps.isSelected !== nextProps.isSelected) return false;
  if (prevProps.isDragging !== nextProps.isDragging) return false;
  if (prevProps.splittingEnabled !== nextProps.splittingEnabled) return false;
  if (prevProps.currentFrame !== nextProps.currentFrame) return false;
  if (prevProps.fps !== nextProps.fps) return false;
  if (prevProps.trackLocked !== nextProps.trackLocked) return false;
  if (prevProps.trackHidden !== nextProps.trackHidden) return false;
  if (prevProps.trackMuted !== nextProps.trackMuted) return false;
  if (prevProps.trackHeight !== nextProps.trackHeight) return false;
  
  // Compare transition drag state
  if (prevProps.isDraggingTransition !== nextProps.isDraggingTransition) return false;
  if (prevProps.draggingTransitionIsVideo !== nextProps.draggingTransitionIsVideo) return false;
  
  // Compare selected transition (shallow)
  const prevSel = prevProps.selectedTransition;
  const nextSel = nextProps.selectedTransition;
  if (prevSel?.itemId !== nextSel?.itemId || prevSel?.position !== nextSel?.position) return false;
  
  // Compare adjacent items (by reference is fine - they're from the same source)
  if (prevProps.nextItem !== nextProps.nextItem) return false;
  if (prevProps.prevItem !== nextProps.prevItem) return false;
  
  // Compare selectedItemIds array (used for multi-selection UI)
  const prevIds = prevProps.selectedItemIds || [];
  const nextIds = nextProps.selectedItemIds || [];
  if (prevIds.length !== nextIds.length) return false;
  // Only deep compare if lengths match and are small
  if (prevIds.length > 0 && prevIds.length <= 10) {
    for (let i = 0; i < prevIds.length; i++) {
      if (prevIds[i] !== nextIds[i]) return false;
    }
  }
  
  // IMPORTANT: Always allow re-renders when callback props change
  // Callback functions are recreated on each render, so we must compare them
  // to ensure drag/resize handlers work correctly
  if (prevProps.onDragStart !== nextProps.onDragStart) return false;
  if (prevProps.onSelect !== nextProps.onSelect) return false;
  if (prevProps.onSelectionChange !== nextProps.onSelectionChange) return false;
  
  return true; // Props are equal, skip re-render
});