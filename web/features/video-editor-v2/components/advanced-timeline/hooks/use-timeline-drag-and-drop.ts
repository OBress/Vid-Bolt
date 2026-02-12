import { useCallback, useRef, useEffect } from 'react';
import { TimelineItem, TrackWithClips, isVideoTrackItem, isAudioTrackItem, EditMode } from '../types';
import { TIMELINE_CONSTANTS, SNAPPING_CONFIG } from '../constants';
import {
  resolveGroup,
} from '../components/canvas-timeline/canvas-timeline-utils';
import { 
  useVideoEditorStore,
  useVideoEditorActions,
  selectEditMode,
  getCurrentDrag,
  type UnifiedDragState,
  type ClipDragSnapshot,
  type GhostElementData,
  type CommittedDragPosition,
} from '../../../stores/video-editor-store';

/** Check if an item type is compatible with a track type */
const canItemGoOnTrack = (itemType: string, trackType: string): boolean => {
  const audioTypes = ['audio', 'sound'];
  const videoTypes = ['video', 'image', 'text', 'shape', 'motion-graphics', 'gif'];
  if (trackType === 'audio') return audioTypes.includes(itemType);
  if (trackType === 'video') return videoTypes.includes(itemType) || !audioTypes.includes(itemType);
  return true;
};

/** Calculate ripple edit preview - pushes subsequent items when resizing */
const calculateRippleEditPreview = (
  items: TimelineItem[],
  resizedItemId: string,
  newStart: number,
  newEnd: number
): Array<{ id: string; start: number; end: number; duration: number }> => {
  const sorted = [...items].sort((a, b) => a.start - b.start);
  const result: Array<{ id: string; start: number; end: number; duration: number }> = [];
  let offset = 0;
  for (const item of sorted) {
    if (item.id === resizedItemId) {
      result.push({ id: item.id, start: newStart, end: newEnd, duration: newEnd - newStart });
      offset = newEnd - item.end;
    } else {
      const s = item.start + offset;
      const e = item.end + offset;
      result.push({ id: item.id, start: s, end: e, duration: e - s });
    }
  }
  return result;
};

/** Push items during resize to prevent overlap */
const pushItemsDuringResize = (
  items: TimelineItem[],
  resizedItemId: string,
  newStart: number,
  newEnd: number
): { actualStart: number; actualEnd: number; items: TimelineItem[] } => {
  const sorted = [...items].sort((a, b) => a.start - b.start);
  const result: TimelineItem[] = [];
  let offset = 0;
  for (const item of sorted) {
    if (item.id === resizedItemId) {
      result.push({ ...item, start: newStart, end: newEnd });
      offset = newEnd - item.end;
    } else {
      result.push({ ...item, start: item.start + offset, end: item.end + offset });
    }
  }
  return { actualStart: newStart, actualEnd: newEnd, items: result };
};

interface UseTimelineDragAndDropProps {
  totalDuration: number; // Total timeline duration in seconds
  tracks: TrackWithClips[];
  onItemMove?: (itemId: string, newStart: number, newEnd: number, newTrackId: string) => void;
  onItemResize?: (itemId: string, newStart: number, newEnd: number) => void;
  timelineRef: React.RefObject<HTMLDivElement | null>;
  onInsertTrackAt?: (index: number, trackType?: 'video' | 'audio', moveItem?: { itemId: string; newStart: number; newEnd: number }) => string;
  onInsertMultipleTracksAt?: (index: number, count: number) => string[];
  onCreateTracksWithItems?: (
    index: number, 
    trackItems: Array<{ trackId: string; items: Array<{ itemId: string; start: number; end: number }> }>
  ) => void;
  selectedItemIds?: string[];
  trackHeight?: number; // Track height in pixels (for compact mode support)
  // Link support - for moving linked items together (like Premiere Pro)
  getLinkedItemIds?: (itemId: string) => string[];
}

const MIN_ITEM_DURATION = 0.1; // Minimum item duration in seconds
const DURATION_TOLERANCE = 0.05; // Tolerance for floating point precision in duration comparisons (50ms)
const FPS = 30; // Frames per second - must match the overlay/composition FPS

// Debug logging for drag operations (set to false in production)
const DEBUG_DRAG = false;
const logDrag = (action: string, data: any) => {
  if (DEBUG_DRAG) {
    console.log(`%c[DRAG-MANAGER] ${action}`, 'color: #22c55e; font-weight: bold;', data);
  }
};

/**
 * Quantize a time value to the nearest frame boundary.
 * This ensures the visual position during drag matches exactly what will be saved.
 * Premiere Pro works this way - you can't position items between frames.
 */
const quantizeToFrame = (timeInSeconds: number): number => {
  const frame = Math.round(timeInSeconds * FPS);
  return frame / FPS;
};

/**
 * Check if two time ranges overlap.
 * Uses a small tolerance to avoid floating point precision issues.
 */
const rangesOverlap = (start1: number, end1: number, start2: number, end2: number, tolerance: number = 0.001): boolean => {
  // Two ranges overlap if one starts before the other ends
  return start1 < end2 - tolerance && end1 > start2 + tolerance;
};

/**
 * Find a valid position for an item that doesn't overlap with other items on the track.
 * Returns the adjusted start position, or the original if no overlap.
 * 
 * Strategy:
 * 1. If no overlap, return original position
 * 2. If overlap detected, try to snap to the nearest edge of blocking items
 * 3. If moving right hits an item, snap to its start (place before it)
 * 4. If moving left hits an item, snap to its end (place after it)
 */
const findNonOverlappingPosition = (
  desiredStart: number,
  duration: number,
  trackItems: TimelineItem[],
  excludeIds: string[],
  originalStart: number // To determine direction of movement
): { start: number; wasAdjusted: boolean } => {
  const desiredEnd = desiredStart + duration;
  
  // Filter out the items being dragged
  const otherItems = trackItems.filter(item => !excludeIds.includes(item.id));
  
  if (otherItems.length === 0) {
    return { start: desiredStart, wasAdjusted: false };
  }
  
  // Sort items by start time for easier processing
  const sortedItems = [...otherItems].sort((a, b) => a.start - b.start);
  
  // Check for any overlaps
  let hasOverlap = false;
  for (const item of sortedItems) {
    if (rangesOverlap(desiredStart, desiredEnd, item.start, item.end)) {
      hasOverlap = true;
      break;
    }
  }
  
  if (!hasOverlap) {
    return { start: desiredStart, wasAdjusted: false };
  }
  
  // Determine movement direction
  const movingRight = desiredStart >= originalStart;
  
  // Find the best non-overlapping position
  let bestStart = desiredStart;
  
  if (movingRight) {
    // Moving right: find the first blocking item and snap to just before it
    // OR find the first gap after the blocking items where we fit
    for (const item of sortedItems) {
      if (rangesOverlap(desiredStart, desiredEnd, item.start, item.end)) {
        // This item blocks us - try snapping to just before it
        const snapBefore = item.start - duration;
        if (snapBefore >= 0) {
          // Check if snapping before creates new overlaps
          let snapBeforeValid = true;
          for (const other of sortedItems) {
            if (other.id !== item.id && rangesOverlap(snapBefore, item.start, other.start, other.end)) {
              snapBeforeValid = false;
              break;
            }
          }
          if (snapBeforeValid) {
            bestStart = snapBefore;
            break;
          }
        }
        
        // Can't snap before, try snapping after the blocking item
        const snapAfter = item.end;
        let snapAfterValid = true;
        for (const other of sortedItems) {
          if (other.id !== item.id && rangesOverlap(snapAfter, snapAfter + duration, other.start, other.end)) {
            snapAfterValid = false;
            break;
          }
        }
        if (snapAfterValid) {
          bestStart = snapAfter;
          break;
        }
      }
    }
  } else {
    // Moving left: find the blocking item and snap to just after it
    // Process items in reverse order to find the rightmost blocking item first
    for (let i = sortedItems.length - 1; i >= 0; i--) {
      const item = sortedItems[i];
      if (rangesOverlap(desiredStart, desiredEnd, item.start, item.end)) {
        // This item blocks us - snap to just after it
        const snapAfter = item.end;
        let snapAfterValid = true;
        for (const other of sortedItems) {
          if (other.id !== item.id && rangesOverlap(snapAfter, snapAfter + duration, other.start, other.end)) {
            snapAfterValid = false;
            break;
          }
        }
        if (snapAfterValid) {
          bestStart = snapAfter;
          break;
        }
        
        // Can't snap after, try snapping before the blocking item
        const snapBefore = item.start - duration;
        if (snapBefore >= 0) {
          let snapBeforeValid = true;
          for (const other of sortedItems) {
            if (other.id !== item.id && rangesOverlap(snapBefore, item.start, other.start, other.end)) {
              snapBeforeValid = false;
              break;
            }
          }
          if (snapBeforeValid) {
            bestStart = snapBefore;
            break;
          }
        }
      }
    }
  }
  
  // Ensure we don't go before timeline start
  bestStart = Math.max(0, bestStart);
  
  return { start: bestStart, wasAdjusted: bestStart !== desiredStart };
};

export const useTimelineDragAndDrop = ({
  totalDuration,
  tracks,
  onItemMove,
  onItemResize,
  timelineRef,
  onInsertTrackAt,
  onInsertMultipleTracksAt,
  onCreateTracksWithItems,
  selectedItemIds = [],
  trackHeight: propTrackHeight,
  getLinkedItemIds,
}: UseTimelineDragAndDropProps) => {
  // Use ref for selectedItemIds so wrappedHandleDragStart stays referentially stable
  // across selection changes. Without this, every selection click changes the onDragStart
  // callback reference, which busts React.memo for ALL timeline tracks and items.
  const selectedItemIdsRef = useRef(selectedItemIds);
  selectedItemIdsRef.current = selectedItemIds;

  // Use provided track height or fall back to constant
  const trackHeight = propTrackHeight || TIMELINE_CONSTANTS.TRACK_HEIGHT;
  
  // Get state from video editor store (only re-renders when editMode changes)
  const editMode = useVideoEditorStore(selectEditMode);
  
  // Get actions from video editor store (stable reference, never causes re-renders)
  const {
    resetDragState,
    setGhostElements,
    startDrag,
    updateDrag,
    endDrag,
    getDragState,
    setSnapLine,
  } = useVideoEditorActions();
  
  // Local refs for drag UI state
  const draggedItemRef = useRef<any>(null);
  const isValidDropRef = useRef(true);
  const insertionIndexRef = useRef<number | null>(null);
  
  // Helper functions for local state
  const setDraggedItem = (item: any) => { draggedItemRef.current = item; };
  const setIsValidDrop = (valid: boolean) => { isValidDropRef.current = valid; };
  const setInsertionIndex = (index: number | null) => { insertionIndexRef.current = index; };

  // RAF batching refs for smooth drag
  const pendingDragUpdateRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const rafIdRef = useRef<number | null>(null);

  // Premiere Pro-style snapping: ONLY snap to item edges, no arbitrary grid
  // Also checks if item's END would snap to an edge (for intuitive snapping)
  const snapToGridAndEdges = useCallback((
    value: number, 
    trackIndex: number, 
    excludeIds: string[] = [],
    itemDuration?: number // Optional: if provided, also check if END snaps to edges
  ) => {
    // Read snapping state fresh from store (not captured)
    const currentSnappingEnabled = useVideoEditorStore.getState().snappingEnabled;
    
    // If snapping is disabled, return the raw value exactly as-is
    if (!currentSnappingEnabled) {
      return value;
    }
    
    // Check if track is valid
    if (trackIndex < 0 || trackIndex >= tracks.length) {
      return value; // Return raw value if track is invalid
    }
    
    // NOTE: When global snapping is enabled, magnetic snapping is handled in processDragUpdate
    // This function is not used during magnetic snapping mode
    
    // Find all item edges in the target track and adjacent tracks for edge snapping
    const edgePositions: number[] = [];
    
    // Check current track and adjacent tracks for edge positions
    const tracksToCheck = [trackIndex];
    if (trackIndex > 0) tracksToCheck.push(trackIndex - 1);
    if (trackIndex < tracks.length - 1) tracksToCheck.push(trackIndex + 1);
    
    tracksToCheck.forEach(tIndex => {
      if (tIndex >= 0 && tIndex < tracks.length) {
        tracks[tIndex].items.forEach(item => {
          if (!excludeIds.includes(item.id)) {
            edgePositions.push(item.start); // Start edge
            edgePositions.push(item.end);   // End edge
          }
        });
      }
    });
    
    // Also add timeline start (0) as a snap point
    edgePositions.push(0);
    
    // Find the closest edge for the START position
    let closestStartSnap: number | null = null;
    let minStartDistance = SNAPPING_CONFIG.edgeSnapTolerance;
    
    edgePositions.forEach(edge => {
      const distance = Math.abs(value - edge);
      if (distance < minStartDistance) {
        minStartDistance = distance;
        closestStartSnap = edge;
      }
    });
    
    // If itemDuration is provided, also check if the END would snap to an edge
    let closestEndSnap: number | null = null;
    let minEndDistance = SNAPPING_CONFIG.edgeSnapTolerance;
    
    if (itemDuration !== undefined && itemDuration > 0) {
      const endPosition = value + itemDuration;
      
      edgePositions.forEach(edge => {
        const distance = Math.abs(endPosition - edge);
        if (distance < minEndDistance) {
          minEndDistance = distance;
          closestEndSnap = edge - itemDuration; // Convert to start position
        }
      });
    }
    
    // Determine which snap is better (closer to original position)
    let bestSnap: number | null = null;
    let bestDistance = SNAPPING_CONFIG.edgeSnapTolerance;
    
    if (closestStartSnap !== null && minStartDistance < bestDistance) {
      bestSnap = closestStartSnap;
      bestDistance = minStartDistance;
    }
    
    if (closestEndSnap !== null && minEndDistance < bestDistance) {
      bestSnap = closestEndSnap;
      bestDistance = minEndDistance;
    }
    
    // ONLY snap if we're actually near an edge - otherwise return raw value
    // This is Premiere Pro behavior: free placement unless near a snap point
    if (bestSnap !== null) {
      return bestSnap;
    }
    
    // No edge nearby - return the raw value for free placement
    return value;
  }, [tracks]);

  // Keep the original simple grid snap function for backward compatibility
  const snapToGrid = useCallback((value: number) => {
    // Read snapping state fresh from store (not captured)
    const currentSnappingEnabled = useVideoEditorStore.getState().snappingEnabled;
    
    // If snapping is disabled, return the raw value
    if (!currentSnappingEnabled) {
      return value;
    }
    return Math.round(value / SNAPPING_CONFIG.gridSize) * SNAPPING_CONFIG.gridSize;
  }, []);

  const validateDropPosition = useCallback(
    (
      targetStart: number,
      targetDuration: number,
      targetTrackIndex: number,
      excludeIds: string[] = [],
      action?: "move" | "resize-start" | "resize-end"
    ): { 
      isValid: boolean; 
      reason?: string; 
      magneticStart?: number;
      magneticPreview?: Array<{ id: string; start: number; end: number; duration: number }>;
    } => {
      const targetEnd = targetStart + targetDuration;

      if (targetStart < 0) {
        return { isValid: false, reason: "Cannot place item before timeline start" };
      }

      if (targetTrackIndex < 0 || targetTrackIndex >= tracks.length) {
        return { isValid: false, reason: "Invalid track" };
      }

      const targetTrack = tracks[targetTrackIndex];
      
      // Check if the target track is locked (like Premiere Pro)
      if (targetTrack.locked) {
        return { isValid: false, reason: `Track ${targetTrack.name} is locked` };
      }
      
      // Check if the item type is compatible with the target track type
      // Video items -> video tracks, Audio items -> audio tracks (like Premiere Pro)
      const dragState = getDragState();
      if (dragState && dragState.selectedClipsSnapshot && dragState.selectedClipsSnapshot.length > 0) {
        const primaryItem = dragState.selectedClipsSnapshot.find(item => item.id === dragState.clipId);
        if (primaryItem && primaryItem.type && targetTrack.type) {
          if (!canItemGoOnTrack(primaryItem.type, targetTrack.type)) {
            const itemTypeName = isAudioTrackItem(primaryItem.type) ? 'audio' : 'video';
            return { 
              isValid: false, 
              reason: `Cannot place ${itemTypeName} item on ${targetTrack.type} track` 
            };
          }
        }
      }

      // Check source duration constraints for video/audio items during resize operations
      if (action === "resize-start" || action === "resize-end") {
        const dragState = getDragState();
        if (dragState && dragState.selectedClipsSnapshot && dragState.selectedClipsSnapshot.length > 0) {
          const primaryItem = dragState.selectedClipsSnapshot.find(item => item.id === dragState.clipId);
          if (primaryItem && (primaryItem.type === 'video' || primaryItem.type === 'audio') && primaryItem.mediaDuration !== undefined) {
            let calculatedMediaStart = primaryItem.mediaStartTime || 0;
            
            // For resize-start operations, adjust mediaStart based on position change
            if (action === "resize-start") {
              const startTimeDelta = targetStart - primaryItem.originalStartTime;
              calculatedMediaStart = Math.max(0, calculatedMediaStart + startTimeDelta);
            }
            
            // Account for playback speed when calculating max duration
            const speed = primaryItem.speed || 1;
            const effectiveSourceDuration = primaryItem.mediaDuration / speed;
            const maxAllowedDuration = effectiveSourceDuration - calculatedMediaStart;
            
            // Use tolerance-based comparison to handle floating point precision issues
            if (targetDuration > maxAllowedDuration + DURATION_TOLERANCE) {
              return { 
                isValid: false, 
                reason: `Cannot resize beyond source duration (${maxAllowedDuration.toFixed(1)}s available at ${speed}x speed)` 
              };
            }
          }
        }
      }
      
      // Handle differently based on action type
      if (action === "resize-start" || action === "resize-end") {
        // For resize operations, calculate what's actually achievable and create a pushing preview
        const resizedItemId = excludeIds[0]; // The first excluded ID is the item being resized
        if (resizedItemId) {
          // In Ripple Edit mode, use ripple edit preview
          if (editMode === 'ripple') {
            const preview = calculateRippleEditPreview(
              targetTrack.items,
              resizedItemId,
              targetStart,
              targetStart + targetDuration
            );
            return {
              isValid: true,
              magneticStart: targetStart,
              magneticPreview: preview
            };
          }
          
          // Normal mode: push items during resize
          const result = pushItemsDuringResize(
            targetTrack.items,
            resizedItemId,
            targetStart,
            targetStart + targetDuration
          );
          
          // Use the actual achievable position for validation
          return {
            isValid: true,
            magneticStart: result.actualStart, // Return the constrained start position
            magneticPreview: result.items.map((item: TimelineItem) => ({
              id: item.id,
              start: item.start,
              end: item.end,
              duration: item.end - item.start
            }))
          };
        }
      } else {
        // For move operations, check for overlaps
        const overlappingItems = targetTrack.items.filter(
          (item) => 
            !excludeIds.includes(item.id) &&
            targetStart < item.end &&
            targetEnd > item.start
        );

        // Video tracks allow overlapping (items stack as layers like Premiere Pro)
        // Audio tracks do NOT allow overlapping
        if (overlappingItems.length > 0 && !targetTrack.allowOverlap) {
          return { isValid: false, reason: "Overlaps with existing item (audio tracks don't allow overlap)" };
        }
      }

      return { isValid: true };
    },
    [totalDuration, tracks, getDragState, editMode]
  );

  const calculateGhostPosition = useCallback(
    (
      startTime: number,
      duration: number,
      trackIndex: number
    ): GhostElementData => {
      const leftPercentage = (startTime / totalDuration) * 100;
      const widthPercentage = (duration / totalDuration) * 100;
      const topPercentage = trackIndex * (100 / tracks.length);

      return {
        id: 'ghost',
        left: Math.max(0, leftPercentage),
        width: Math.max(0.1, widthPercentage),
        top: topPercentage,
      };
    },
    [totalDuration, tracks.length]
  );

  const handleDragStart = useCallback(
    (
      item: TimelineItem,
      clientX: number,
      clientY: number,
      action: "move" | "resize-start" | "resize-end",
      selectedItemIds: string[] = []
    ) => {
      // Check if a drag is already in progress
      const existingDrag = getCurrentDrag();
      if (existingDrag) {
        logDrag('DRAG_START_BLOCKED', { reason: 'drag already active', dragType: existingDrag.type });
        return;
      }
      
      logDrag('DRAG_START_ATTEMPT', {
        itemId: item.id,
        itemLabel: item.label,
        itemStart: item.start,
        itemEnd: item.end,
        action,
        selectedItemIds,
      });
      
      if (!timelineRef.current) {
        logDrag('DRAG_START_BLOCKED: No timeline ref', null);
        return;
      }

      // Find the track that contains this item
      const itemTrackIndex = tracks.findIndex(track => 
        track.items.some(trackItem => trackItem.id === item.id)
      );
      if (itemTrackIndex === -1) {
        logDrag('DRAG_START_BLOCKED: Item track not found', { itemId: item.id });
        return;
      }

      // Check if the track is locked
      const itemTrack = tracks[itemTrackIndex];
      if (itemTrack.locked) {
        logDrag('DRAG_START_BLOCKED: Track locked', { trackName: itemTrack.name });
        console.warn(`Cannot edit item on locked track: ${itemTrack.name}`);
        return;
      }

      const itemDuration = item.end - item.start;

      // Create selected clips snapshot for multi-drag support
      const selectedClipsSnapshot: ClipDragSnapshot[] = [];
      
      // Get all items that should be dragged
      let itemsToDrag = selectedItemIds.includes(item.id) && selectedItemIds.length > 1 
        ? selectedItemIds 
        : [item.id];

      // Include linked items if available
      if (getLinkedItemIds) {
        const allLinkedIds = new Set<string>();
        for (const dragItemId of itemsToDrag) {
          const linkedIds = getLinkedItemIds(dragItemId);
          linkedIds.forEach(id => allLinkedIds.add(id));
        }
        itemsToDrag = Array.from(new Set([...itemsToDrag, ...allLinkedIds]));
        
        logDrag('LINKED_ITEMS_COLLECTED', {
          primaryItemId: item.id,
          linkedItemIds: Array.from(allLinkedIds),
          totalItemsToDrag: itemsToDrag.length,
        });
      }

      const allItems = tracks.flatMap(track => track.items);
      
      for (const itemId of itemsToDrag) {
        const draggedItem = allItems.find(i => i.id === itemId);
        if (draggedItem) {
          const draggedItemTrackIndex = tracks.findIndex(track => 
            track.items.some(trackItem => trackItem.id === draggedItem.id)
          );
          if (draggedItemTrackIndex !== -1) {
            selectedClipsSnapshot.push({
              id: draggedItem.id,
              originalStartTime: draggedItem.start,
              originalDuration: draggedItem.end - draggedItem.start,
              originalTrackId: tracks[draggedItemTrackIndex].id,
              type: draggedItem.type as any,
              label: draggedItem.label,
              mediaStartTime: draggedItem.mediaStart,
              mediaDuration: draggedItem.mediaSrcDuration,
              speed: draggedItem.speed,
            });
          }
        }
      }

      // Find the primary snapshot
      const primarySnapshot = selectedClipsSnapshot.find(s => s.id === item.id);
      if (!primarySnapshot) return;

      // Determine drag type
      const dragType = action === 'move' ? 'clip-move' : 
                       action === 'resize-start' ? 'clip-resize-start' : 
                       'clip-resize-end';

      // Start the unified drag
      startDrag({
        type: dragType,
        clipId: item.id,
        startTime: item.start,
        currentTime: item.start,
        startDuration: itemDuration,
        currentDuration: itemDuration,
        startTrackId: itemTrack.id,
        currentTrackId: itemTrack.id,
        selectedClipsSnapshot,
        startX: clientX,
        startY: clientY,
        currentX: clientX,
        currentY: clientY,
        isValidDrop: true,
      });
      
      setDraggedItem(item);
      
      // Add cursor class to indicate dragging
      document.body.classList.add('timeline-item-dragging');
      
      logDrag('DRAG_START_SUCCESS', {
        itemId: item.id,
        dragType,
        startPosition: item.start,
        startDuration: itemDuration,
        trackIndex: itemTrackIndex,
        itemsToDragCount: selectedClipsSnapshot.length,
      });

      setGhostElements(null);
      setIsValidDrop(true);
      setInsertionIndex(null);
    },
    [timelineRef, tracks, startDrag, getLinkedItemIds, calculateGhostPosition, setGhostElements]
  );

  // Core drag update logic - called from rAF
  const processDragUpdate = useCallback(
    (clientX: number, clientY: number) => {
      // Get current drag state
      const dragState = getDragState();
      if (!dragState || !timelineRef.current) return;
      
      // Only process clip drags
      if (!dragState.type.startsWith('clip-')) return;

      const timelineRect = timelineRef.current.getBoundingClientRect();
      const deltaX = clientX - dragState.startX;
      const deltaY = clientY - dragState.startY;

      // Calculate time and track changes
      const deltaTime = (deltaX / timelineRect.width) * totalDuration;

      let newStart: number;
      let newDuration: number;
      let newTrackIndex: number;

      // Find start track index from track ID
      const startTrackIndex = tracks.findIndex(t => t.id === dragState.startTrackId);
      if (startTrackIndex === -1) return;

      const sourceTrack = tracks[startTrackIndex];

      // ======================================================
      // GROUP-CONSTRAINED TRACK RESOLUTION
      // ======================================================
      // Clips are constrained to their source group (video, audio, text,
      // effects, overlays). Since there are no group headers between tracks
      // within the same group, simple deltaY/trackHeight arithmetic works.
      const sourceGroup = resolveGroup(sourceTrack);

      // Build list of track indices belonging to the same group
      const sameGroupIndices: number[] = [];
      for (let i = 0; i < tracks.length; i++) {
        if (resolveGroup(tracks[i]) === sourceGroup) {
          sameGroupIndices.push(i);
        }
      }

      // Find the source track's position within its group
      const sourcePositionInGroup = sameGroupIndices.indexOf(startTrackIndex);
      if (sourcePositionInGroup === -1) return;

      // Compute target position within group using simple division
      // (safe — no headers between tracks of the same group)
      const deltaTrack = Math.round(deltaY / trackHeight);
      const targetPositionInGroup = Math.max(
        0,
        Math.min(sameGroupIndices.length - 1, sourcePositionInGroup + deltaTrack),
      );

      // Map back to full tracks array index
      let targetTrackIndex = sameGroupIndices[targetPositionInGroup];

      // Get source duration limit for video/audio items
      const primaryItem = dragState.selectedClipsSnapshot?.find(item => item.id === dragState.clipId);
      let maxAllowedDuration = Infinity;
      
      if (primaryItem && (primaryItem.type === 'video' || primaryItem.type === 'audio') && primaryItem.mediaDuration !== undefined) {
        const speed = primaryItem.speed || 1;
        const effectiveSourceDuration = primaryItem.mediaDuration / speed;
        const currentMediaStart = primaryItem.mediaStartTime || 0;
        maxAllowedDuration = effectiveSourceDuration - currentMediaStart;
      }

      const action = dragState.type === 'clip-move' ? 'move' :
                     dragState.type === 'clip-resize-start' ? 'resize-start' : 'resize-end';

      switch (action) {
        case "move":
          newStart = dragState.startTime + deltaTime;
          newDuration = dragState.startDuration;
          newTrackIndex = targetTrackIndex;
          break;

        case "resize-start":
          const rawNewStart = dragState.startTime + deltaTime;
          const originalEnd = dragState.startTime + dragState.startDuration;
          newDuration = Math.max(MIN_ITEM_DURATION, originalEnd - rawNewStart);
          
          if (primaryItem && primaryItem.mediaDuration !== undefined) {
            const speed = primaryItem.speed || 1;
            const effectiveSourceDuration = primaryItem.mediaDuration / speed;
            const startTimeDelta = (originalEnd - newDuration) - primaryItem.originalStartTime;
            const newMediaStart = Math.max(0, (primaryItem.mediaStartTime || 0) + startTimeDelta);
            const maxDurationFromStart = effectiveSourceDuration - newMediaStart;
            newDuration = Math.min(newDuration, maxDurationFromStart);
            if (newMediaStart < 0) {
              newDuration = Math.min(newDuration, dragState.startDuration + (primaryItem.mediaStartTime || 0));
            }
          }
          
          newStart = originalEnd - newDuration;
          newTrackIndex = startTrackIndex;
          break;

        case "resize-end":
          newStart = dragState.startTime;
          const rawNewDuration = dragState.startDuration + deltaTime;
          newDuration = Math.max(MIN_ITEM_DURATION, Math.min(rawNewDuration, maxAllowedDuration));
          newTrackIndex = startTrackIndex;
          break;

        default:
          return;
      }

      // Prevent going before timeline start
      newStart = Math.max(0, newStart);

      // ==========================================
      // OVERLAP PREVENTION
      // ==========================================
      if (newTrackIndex >= 0 && newTrackIndex < tracks.length) {
        const targetTrackForOverlap = tracks[newTrackIndex];
        const excludeIds = dragState.selectedClipsSnapshot?.map(s => s.id) || [];
        
        if (action === "move") {
          const { start: adjustedStart } = findNonOverlappingPosition(
            newStart,
            newDuration,
            targetTrackForOverlap.items,
            excludeIds,
            dragState.startTime
          );
          newStart = adjustedStart;
        } else if (action === "resize-start" || action === "resize-end") {
          const otherItems = targetTrackForOverlap.items.filter(item => !excludeIds.includes(item.id));
          const newEnd = newStart + newDuration;
          
          for (const item of otherItems) {
            if (action === "resize-start") {
              if (newStart < item.end && newStart >= item.start) {
                newStart = item.end;
                newDuration = (dragState.startTime + dragState.startDuration) - newStart;
                newDuration = Math.max(MIN_ITEM_DURATION, newDuration);
              }
            } else {
              if (newEnd > item.start && newEnd <= item.end) {
                newDuration = item.start - newStart;
                newDuration = Math.max(MIN_ITEM_DURATION, newDuration);
              }
            }
          }
        }
      }

      // ==========================================
      // CROSS-TRACK EDGE SNAPPING
      // ==========================================
      let magneticSnapLinePosition: number | null = null;
      let snappedToTrackIdx: number = -1;
      const SNAP_THRESHOLD = 0.15;
      
      const currentSnappingEnabled = useVideoEditorStore.getState().snappingEnabled;
      
      if (currentSnappingEnabled) {
        const excludeIds = dragState.selectedClipsSnapshot?.map(s => s.id) || [];
        const allTrackItemsWithIndex: Array<{ item: TimelineItem; trackIdx: number }> = [];
        tracks.forEach((track, trackIdx) => {
          track.items
            .filter(item => !excludeIds.includes(item.id))
            .forEach(item => allTrackItemsWithIndex.push({ item, trackIdx }));
        });
        
        let closestEdge: number | null = null;
        let closestLinePosition: number | null = null;
        let closestDistance = SNAP_THRESHOLD;
        let closestTrackIdx: number = -1;
        
        if (action === "move") {
          for (const { item, trackIdx } of allTrackItemsWithIndex) {
            const distanceStartToEnd = Math.abs(newStart - item.end);
            if (distanceStartToEnd < closestDistance) {
              closestDistance = distanceStartToEnd;
              closestEdge = item.end;
              closestLinePosition = item.end;
              closestTrackIdx = trackIdx;
            }
            
            const distanceStartToStart = Math.abs(newStart - item.start);
            if (distanceStartToStart < closestDistance) {
              closestDistance = distanceStartToStart;
              closestEdge = item.start;
              closestLinePosition = item.start;
              closestTrackIdx = trackIdx;
            }
            
            const draggedItemEnd = newStart + newDuration;
            const distanceEndToStart = Math.abs(draggedItemEnd - item.start);
            if (distanceEndToStart < closestDistance) {
              closestDistance = distanceEndToStart;
              closestEdge = item.start - newDuration;
              closestLinePosition = item.start;
              closestTrackIdx = trackIdx;
            }
            
            const distanceEndToEnd = Math.abs(draggedItemEnd - item.end);
            if (distanceEndToEnd < closestDistance) {
              closestDistance = distanceEndToEnd;
              closestEdge = item.end - newDuration;
              closestLinePosition = item.end;
              closestTrackIdx = trackIdx;
            }
          }
          
          if (closestEdge !== null) {
            magneticSnapLinePosition = closestLinePosition;
            snappedToTrackIdx = closestTrackIdx;
            newStart = closestEdge;
          }
        } else if (action === "resize-start") {
          for (const { item, trackIdx } of allTrackItemsWithIndex) {
            const distanceToEnd = Math.abs(newStart - item.end);
            if (distanceToEnd < closestDistance) {
              closestDistance = distanceToEnd;
              closestLinePosition = item.end;
              closestTrackIdx = trackIdx;
              const originalEnd = dragState.startTime + dragState.startDuration;
              const snappedStart = item.end;
              const snappedDuration = Math.max(MIN_ITEM_DURATION, originalEnd - snappedStart);
              if (snappedDuration >= MIN_ITEM_DURATION) {
                closestEdge = snappedStart;
              }
            }
            
            const distanceToStart = Math.abs(newStart - item.start);
            if (distanceToStart < closestDistance) {
              closestDistance = distanceToStart;
              closestLinePosition = item.start;
              closestTrackIdx = trackIdx;
              const originalEnd = dragState.startTime + dragState.startDuration;
              const snappedStart = item.start;
              const snappedDuration = Math.max(MIN_ITEM_DURATION, originalEnd - snappedStart);
              if (snappedDuration >= MIN_ITEM_DURATION) {
                closestEdge = snappedStart;
              }
            }
          }
          
          if (closestEdge !== null && closestLinePosition !== null) {
            magneticSnapLinePosition = closestLinePosition;
            snappedToTrackIdx = closestTrackIdx;
            const originalEnd = dragState.startTime + dragState.startDuration;
            newStart = closestEdge;
            newDuration = Math.max(MIN_ITEM_DURATION, originalEnd - newStart);
          }
        } else if (action === "resize-end") {
          const newEnd = newStart + newDuration;
          
          for (const { item, trackIdx } of allTrackItemsWithIndex) {
            const distanceToStart = Math.abs(newEnd - item.start);
            if (distanceToStart < closestDistance) {
              closestDistance = distanceToStart;
              closestLinePosition = item.start;
              closestTrackIdx = trackIdx;
              const snappedDuration = Math.max(MIN_ITEM_DURATION, item.start - newStart);
              if (snappedDuration >= MIN_ITEM_DURATION) {
                closestEdge = item.start;
              }
            }
            
            const distanceToEnd = Math.abs(newEnd - item.end);
            if (distanceToEnd < closestDistance) {
              closestDistance = distanceToEnd;
              closestLinePosition = item.end;
              closestTrackIdx = trackIdx;
              const snappedDuration = Math.max(MIN_ITEM_DURATION, item.end - newStart);
              if (snappedDuration >= MIN_ITEM_DURATION) {
                closestEdge = item.end;
              }
            }
          }
          
          if (closestEdge !== null && closestLinePosition !== null) {
            magneticSnapLinePosition = closestLinePosition;
            snappedToTrackIdx = closestTrackIdx;
            newDuration = Math.max(MIN_ITEM_DURATION, closestEdge - newStart);
          }
        }
      }

      // For resize operations, always stay on the original track
      const effectiveTrackIndex = action === "move" ? newTrackIndex : startTrackIndex;
      const effectiveTrackId = tracks[effectiveTrackIndex]?.id || dragState.startTrackId;
      
      // Update unified drag state
      updateDrag({
        currentTime: newStart,
        currentDuration: newDuration,
        currentTrackId: effectiveTrackId,
        currentX: clientX,
        currentY: clientY,
        isValidDrop: true,
        snap: magneticSnapLinePosition !== null ? {
          snappedTime: magneticSnapLinePosition,
          snappedTrackId: tracks[snappedToTrackIdx]?.id || null,
        } : undefined,
      });
      
      setInsertionIndex(null);
      setIsValidDrop(true);
      
      // Update snap line visual
      if (magneticSnapLinePosition !== null && snappedToTrackIdx !== -1) {
        setSnapLine({
          trackIndex: effectiveTrackIndex,
          snappedToTrackIndex: snappedToTrackIdx,
          time: magneticSnapLinePosition,
        });
      } else {
        setSnapLine(null);
      }
    },
    [getDragState, updateDrag, setSnapLine, timelineRef, totalDuration, tracks, trackHeight]
  );

  // RAF loop for processing drag updates
  const rafLoop = useCallback(() => {
    if (pendingDragUpdateRef.current) {
      processDragUpdate(pendingDragUpdateRef.current.clientX, pendingDragUpdateRef.current.clientY);
      pendingDragUpdateRef.current = null;
    }
    rafIdRef.current = null;
  }, [processDragUpdate]);

  // handleDrag queues updates for RAF processing
  const handleDrag = useCallback(
    (clientX: number, clientY: number) => {
      // Store latest position
      pendingDragUpdateRef.current = { clientX, clientY };
      
      // Schedule RAF if not already scheduled
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(rafLoop);
      }
    },
    [rafLoop]
  );

  // Cleanup RAF on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      pendingDragUpdateRef.current = null;
    };
  }, []);

  const handleDragEnd = useCallback(() => {
    // Get current drag state
    const dragState = getDragState();
    
    logDrag('DRAG_END_ATTEMPT', {
      hasDragState: !!dragState,
      dragType: dragState?.type,
    });
    
    // Only process clip drags
    if (!dragState || !dragState.type.startsWith('clip-')) {
      logDrag('DRAG_END_BLOCKED: Not a clip drag', { dragType: dragState?.type });
      // Still clean up if there was any state
      if (dragState) {
        endDrag();
      }
      document.body.classList.remove('timeline-item-dragging');
      return;
    }

    // Check if drop is valid
    if (!isValidDropRef.current) {
      resetDragState();
      document.body.classList.remove('timeline-item-dragging');
      return;
    }

    // Use current drag position (or fall back to start)
    const finalStart = dragState.currentTime ?? dragState.startTime;
    const finalDuration = dragState.currentDuration ?? dragState.startDuration;
    const finalEnd = finalStart + finalDuration;
    const finalTrackId = dragState.currentTrackId ?? dragState.startTrackId;
    const finalTrackIndex = tracks.findIndex(t => t.id === finalTrackId);

    logDrag('DRAG_END_COMMITTING', {
      clipId: dragState.clipId,
      finalStart,
      finalEnd,
      finalDuration,
      finalTrackId,
    });

    // Create committed positions for optimistic UI
    const committedPositions = new Map<string, CommittedDragPosition>();
    const snapshots = dragState.selectedClipsSnapshot || [];
    const primarySnapshot = snapshots.find(s => s.id === dragState.clipId);
    
    if (primarySnapshot && snapshots.length > 1) {
      const deltaTime = finalStart - primarySnapshot.originalStartTime;
      const deltaDuration = finalDuration - primarySnapshot.originalDuration;
      
      // Determine linked items
      const primaryLinkedIds = getLinkedItemIds ? getLinkedItemIds(dragState.clipId!) : [dragState.clipId!];
      const linkedItemSet = new Set(primaryLinkedIds);
      
      for (const snapshot of snapshots) {
        if (snapshot.id === dragState.clipId) continue;
        
        const isLinkedItem = linkedItemSet.has(snapshot.id);
        const action = dragState.type;
        
        let itemNewStart: number;
        let itemNewDuration: number;
        let itemNewTrackId: string;
        
        if (action === 'clip-move') {
          itemNewStart = Math.max(0, snapshot.originalStartTime + deltaTime);
          itemNewDuration = snapshot.originalDuration;
          itemNewTrackId = isLinkedItem ? snapshot.originalTrackId : finalTrackId!;
        } else {
          if (action === 'clip-resize-start') {
            itemNewStart = Math.max(0, snapshot.originalStartTime + (finalStart - primarySnapshot.originalStartTime));
            itemNewDuration = Math.max(0.1, snapshot.originalDuration - (finalStart - primarySnapshot.originalStartTime));
          } else {
            itemNewStart = snapshot.originalStartTime;
            itemNewDuration = Math.max(0.1, snapshot.originalDuration + deltaDuration);
          }
          itemNewTrackId = snapshot.originalTrackId;
        }
        
        committedPositions.set(snapshot.id, {
          clipId: snapshot.id,
          startTime: itemNewStart,
          duration: itemNewDuration,
          trackId: itemNewTrackId,
          originalStartTime: snapshot.originalStartTime,
          originalTrackId: snapshot.originalTrackId,
        });
      }
    }
    
    // Clear drag state
    setDraggedItem(null);
    setIsValidDrop(false);
    setInsertionIndex(null);
    setSnapLine(null);
    setGhostElements(null);
    
    // Store committed positions and end drag
    useVideoEditorStore.getState().setCommittedPositions(committedPositions);
    endDrag();
    
    document.body.classList.remove('timeline-item-dragging');
    
    logDrag('DRAG_STATE_CLEARED', {
      isDragging: false,
      linkedItemsCommitted: committedPositions.size,
    });

    // Execute the actual move/resize operations
    const isMultiDrag = snapshots.length > 1;
    const action = dragState.type;
    
    if (isMultiDrag && action === 'clip-move' && primarySnapshot) {
      const deltaTime = finalStart - primarySnapshot.originalStartTime;
      
      const primaryLinkedIds = getLinkedItemIds ? getLinkedItemIds(dragState.clipId!) : [dragState.clipId!];
      const linkedItemSet = new Set(primaryLinkedIds);
      
      // Collect all moves into a batch instead of calling onItemMove per clip
      const moves: Array<{ clipId: string; trackId: string; startTime: number; duration: number }> = [];
      
      for (const snapshot of snapshots) {
        const itemNewStart = Math.max(0, snapshot.originalStartTime + deltaTime);
        
        // Linked items stay on their original track
        const isLinkedItem = linkedItemSet.has(snapshot.id) && snapshot.id !== dragState.clipId;
        const itemTrackId = isLinkedItem ? snapshot.originalTrackId : finalTrackId!;
        
        moves.push({
          clipId: snapshot.id,
          trackId: itemTrackId,
          startTime: itemNewStart,
          duration: snapshot.originalDuration,
        });
      }
      
      // Single set() call for all clips
      useVideoEditorStore.getState().batchMoveClips(moves);
      
      logDrag('MULTI_DRAG_MOVE_COMPLETE', {
        primaryClipId: dragState.clipId,
        deltaTime,
        itemsMoved: snapshots.length,
      });
    } else if (isMultiDrag && (action === 'clip-resize-start' || action === 'clip-resize-end') && onItemResize && primarySnapshot) {
      const deltaStart = finalStart - primarySnapshot.originalStartTime;
      const deltaDuration = finalDuration - primarySnapshot.originalDuration;
      
      for (const snapshot of snapshots) {
        let itemNewStart: number;
        let itemNewEnd: number;
        
        if (action === 'clip-resize-start') {
          itemNewStart = Math.max(0, snapshot.originalStartTime + deltaStart);
          itemNewEnd = snapshot.originalStartTime + snapshot.originalDuration;
          if (itemNewEnd - itemNewStart < MIN_ITEM_DURATION) {
            itemNewStart = itemNewEnd - MIN_ITEM_DURATION;
          }
        } else {
          itemNewStart = snapshot.originalStartTime;
          itemNewEnd = snapshot.originalStartTime + snapshot.originalDuration + deltaDuration;
          if (itemNewEnd - itemNewStart < MIN_ITEM_DURATION) {
            itemNewEnd = itemNewStart + MIN_ITEM_DURATION;
          }
        }
        
        onItemResize(snapshot.id, itemNewStart, itemNewEnd);
      }
      
      logDrag('MULTI_DRAG_RESIZE_COMPLETE', {
        action,
        primaryClipId: dragState.clipId,
        itemsResized: snapshots.length,
      });
    } else if (!isMultiDrag) {
      const targetTrack = tracks[finalTrackIndex];
      
      if (action === 'clip-move' && targetTrack && dragState.clipId) {
        // Even for single clip, use batch for consistency (single-item batch is cheap)
        useVideoEditorStore.getState().batchMoveClips([{
          clipId: dragState.clipId,
          trackId: targetTrack.id,
          startTime: finalStart,
          duration: finalEnd - finalStart,
        }]);
      } else if ((action === 'clip-resize-start' || action === 'clip-resize-end') && onItemResize && dragState.clipId) {
        onItemResize(dragState.clipId, finalStart, finalEnd);
      }
    }
    
    logDrag('DRAG_END_COMPLETE', {
      clipId: dragState.clipId,
      finalStart,
      finalEnd,
      finalTrackId,
    });
  }, [
    getDragState,
    resetDragState,
    endDrag,
    setSnapLine,
    setGhostElements,
    tracks,
    onItemMove,
    onItemResize,
    getLinkedItemIds,
  ]);

  // Wrapper for handleDragStart that includes selectedItemIds via ref
  // Using ref keeps this callback referentially stable across selection changes,
  // preventing memo busts in MemoizedTimelineTrack and MemoizedTimelineItem.
  const wrappedHandleDragStart = useCallback(
    (
      item: TimelineItem,
      clientX: number,
      clientY: number,
      action: "move" | "resize-start" | "resize-end"
    ) => {
      handleDragStart(item, clientX, clientY, action, selectedItemIdsRef.current);
    },
    [handleDragStart]
  );

  return {
    handleDragStart: wrappedHandleDragStart,
    handleDrag,
    handleDragEnd,
  };
}; 