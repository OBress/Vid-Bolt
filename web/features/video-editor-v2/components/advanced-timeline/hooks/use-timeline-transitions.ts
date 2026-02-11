/**
 * useTimelineTransitions - Hook for managing transitions in the timeline
 * 
 * Transition format:
 * - Transitions store absolute startTime/endTime
 * - Between transitions have clipIds: [firstClipId, secondClipId]
 * - All transition types (crossfade, wipe, slide, etc.) behave uniformly
 */

import { useState, useCallback, useMemo } from "react";
import { 
  VideoTransition, 
  AudioTransition,
  TrackWithClips,
  TimelineItem
} from "../types";
import { 
  useVideoEditorStore,
  useVideoEditorActions,
  useTypedStore,
  selectSelectedTransitionId,
  selectTransitions,
} from "../../../stores/video-editor-store";
import { VideoTransitionType, AudioTransitionType, EasingPreset } from "../../../types";
import { isBetweenTransition, getTransitionDuration } from "../../../types/timeline-v2";

/**
 * State for tracking selected transition
 */
export interface SelectedTransitionState {
  itemId: string;
  position: "start" | "end";
}

/**
 * Hook for managing transitions in the timeline
 * 
 * Now uses simplified TransitionEntity format with absolute startTime/endTime.
 */
export const useTimelineTransitions = (
  tracks: TrackWithClips[],
  onTracksChange?: (tracks: TrackWithClips[]) => void
) => {
  // === UNIFIED STORE INTEGRATION ===
  const selectedTransitionId = useTypedStore(selectSelectedTransitionId);
  const storeTransitions = useTypedStore(selectTransitions);
  
  // Get actions from unified store
  const {
    addTransition: storeAddTransition,
    addBetweenTransition: storeAddBetweenTransition,
    updateTransition: storeUpdateTransition,
    removeTransition: storeRemoveTransition,
    selectTransition: storeSelectTransition,
    getClipTransitions: storeGetClipTransitions,
  } = useVideoEditorActions();
  
  // Get clip transitions using the new helper
  const storeGetItemTransitions = useCallback((itemId: string) => {
    return storeGetClipTransitions(itemId);
  }, [storeGetClipTransitions]);
  
  const selectedTransition = useMemo((): SelectedTransitionState | null => {
    if (!selectedTransitionId) return null;
    
    const transition = storeTransitions[selectedTransitionId];
    if (!transition) return null;
    
    // For between transitions, use the first clip as the itemId
    const itemId = transition.clipIds[0];
    if (!itemId) return null;
    
    // Determine position based on transition type
    let position: "start" | "end";
    if (isBetweenTransition(transition)) {
      // For between transitions, if we're looking at this from the first clip's perspective, it's 'end'
      position = 'end';
    } else {
      position = transition.position === 'in' ? 'start' : 'end';
    }
    
    return { itemId, position };
  }, [selectedTransitionId, storeTransitions]);
  
  // === LOCAL UI STATE (not in store) ===
  const [isDraggingTransition, setIsDraggingTransition] = useState(false);
  const [draggingTransitionIsVideo, setDraggingTransitionIsVideo] = useState<boolean | null>(null);

  // === UTILITY FUNCTIONS ===

  const findItemById = useCallback((itemId: string): { item: TimelineItem; trackIndex: number } | null => {
    for (let trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
      const item = tracks[trackIndex].items.find(i => i.id === itemId);
      if (item) {
        return { item, trackIndex };
      }
    }
    return null;
  }, [tracks]);

  const findAdjacentItem = useCallback((
    itemId: string,
    direction: "before" | "after"
  ): TimelineItem | null => {
    const found = findItemById(itemId);
    if (!found) return null;
    
    const { item, trackIndex } = found;
    const track = tracks[trackIndex];
    
    const sortedItems = [...track.items].sort((a, b) => a.start - b.start);
    const itemIndex = sortedItems.findIndex(i => i.id === itemId);
    
    if (itemIndex === -1) return null;
    
    if (direction === "before" && itemIndex > 0) {
      const prevItem = sortedItems[itemIndex - 1];
      if (Math.abs(prevItem.end - item.start) < 0.001) {
        return prevItem;
      }
    } else if (direction === "after" && itemIndex < sortedItems.length - 1) {
      const nextItem = sortedItems[itemIndex + 1];
      if (Math.abs(item.end - nextItem.start) < 0.001) {
        return nextItem;
      }
    }
    
    return null;
  }, [tracks, findItemById]);

  const hasAdjacentItem = useCallback((
    itemId: string,
    direction: "before" | "after"
  ): boolean => {
    return findAdjacentItem(itemId, direction) !== null;
  }, [findAdjacentItem]);

  // === CRUD OPERATIONS VIA STORE ===

  const addTransition = useCallback((
    itemId: string,
    position: "start" | "end",
    transitionType: string,
    isVideo: boolean,
    duration: number = 1
  ) => {
    storeAddTransition({
      clipId: itemId,
      position: position === 'start' ? 'in' : 'out',
      type: transitionType as VideoTransitionType | AudioTransitionType,
      isAudio: !isVideo,
      duration,
      easing: { preset: EasingPreset.EASE_IN_OUT },
    });
  }, [storeAddTransition]);

  /**
   * Update transition times directly
   */
  const updateTransitionTimes = useCallback((
    itemId: string,
    position: "start" | "end",
    newStartTime: number,
    newEndTime: number
  ) => {
    const { inTransition, outTransition } = storeGetItemTransitions(itemId);
    const transition = position === 'start' ? inTransition : outTransition;
    
    if (transition) {
      storeUpdateTransition(transition.id, {
        startTime: newStartTime,
        endTime: newEndTime,
      });
    }
  }, [storeGetItemTransitions, storeUpdateTransition]);

  const removeTransition = useCallback((
    itemId: string,
    position: "start" | "end"
  ) => {
    const { inTransition, outTransition } = storeGetItemTransitions(itemId);
    const transition = position === 'start' ? inTransition : outTransition;
    
    if (transition) {
      storeRemoveTransition(transition.id);
    }
  }, [storeGetItemTransitions, storeRemoveTransition]);

  // === SELECTION ===

  const selectTransition = useCallback((itemId: string, position: "start" | "end") => {
    const { inTransition, outTransition } = storeGetItemTransitions(itemId);
    const transition = position === 'start' ? inTransition : outTransition;
    
    if (transition) {
      storeSelectTransition(transition.id);
    }
  }, [storeGetItemTransitions, storeSelectTransition]);

  const clearTransitionSelection = useCallback(() => {
    storeSelectTransition(null);
  }, [storeSelectTransition]);

  // === DROP HANDLERS ===

  const handleTransitionDrop = useCallback((
    itemId: string,
    position: "start" | "end",
    transitionType: string,
    isVideo: boolean,
    duration: number,
    adjacentItemId?: string
  ) => {
    if (adjacentItemId) {
      // Create a "between" transition
      const transitionId = storeAddBetweenTransition({
        firstClipId: position === 'end' ? itemId : adjacentItemId,
        secondClipId: position === 'start' ? itemId : adjacentItemId,
        type: transitionType as VideoTransitionType | AudioTransitionType,
        isAudio: !isVideo,
        duration,
      });
      
      storeSelectTransition(transitionId);
    } else {
      // Single transition
      const transitionId = storeAddTransition({
        clipId: itemId,
        position: position === 'start' ? 'in' : 'out',
        type: transitionType as VideoTransitionType | AudioTransitionType,
        isAudio: !isVideo,
        duration,
      });
      
      storeSelectTransition(transitionId);
    }
    
    setIsDraggingTransition(false);
    setDraggingTransitionIsVideo(null);
  }, [storeAddTransition, storeAddBetweenTransition, storeSelectTransition]);

  /**
   * Handle transition drop at the BOUNDARY between two adjacent items
   */
  const handleBoundaryTransitionDrop = useCallback((
    firstItemId: string,
    secondItemId: string,
    transitionType: string,
    isVideo: boolean,
    duration: number,
    _initialOffset: number = 0 // No longer used
  ) => {
    const transitionId = storeAddBetweenTransition({
      firstClipId: firstItemId,
      secondClipId: secondItemId,
      type: transitionType as VideoTransitionType | AudioTransitionType,
      isAudio: !isVideo,
      duration,
    });
    
    storeSelectTransition(transitionId);
    
    setIsDraggingTransition(false);
    setDraggingTransitionIsVideo(null);
  }, [storeAddBetweenTransition, storeSelectTransition]);

  /**
   * Move transition between items
   */
  const moveTransitionBetweenItems = useCallback((
    fromItemId: string,
    fromPosition: "start" | "end",
    toItemId: string,
    toPosition: "start" | "end"
  ) => {
    const { inTransition, outTransition } = storeGetItemTransitions(fromItemId);
    const sourceTransition = fromPosition === 'start' ? inTransition : outTransition;
    
    if (!sourceTransition) return;
    
    const duration = getTransitionDuration(sourceTransition);
    
    // Remove from source
    storeRemoveTransition(sourceTransition.id);
    
    // Add to target with same properties
    storeAddTransition({
      clipId: toItemId,
      position: toPosition === 'start' ? 'in' : 'out',
      type: sourceTransition.type,
      isAudio: sourceTransition.isAudio,
      duration,
      easing: sourceTransition.easing,
    });
  }, [storeGetItemTransitions, storeRemoveTransition, storeAddTransition]);

  // === COMPUTED VALUES ===

  const getItemsWithBetweenTransitions = useMemo(() => {
    const result: Array<{
      itemId: string;
      adjacentItemId: string;
      transition: VideoTransition | AudioTransition;
    }> = [];
    
    // Find between transitions from the store
    Object.values(storeTransitions).forEach(transition => {
      if (isBetweenTransition(transition)) {
        const [firstClipId, secondClipId] = transition.clipIds;
        if (firstClipId && secondClipId) {
          result.push({
            itemId: firstClipId,
            adjacentItemId: secondClipId,
            transition: {
              type: transition.type as any,
              duration: getTransitionDuration(transition),
              position: 'end',
              easing: transition.easing,
            },
          });
        }
      }
    });
    
    return result;
  }, [storeTransitions]);

  return {
    // State
    selectedTransition,
    isDraggingTransition,
    draggingTransitionIsVideo,
    
    // Setters
    setIsDraggingTransition,
    setDraggingTransitionIsVideo,
    
    // Actions (via store)
    addTransition,
    updateTransitionTimes,
    removeTransition,
    selectTransition,
    clearTransitionSelection,
    handleTransitionDrop,
    handleBoundaryTransitionDrop,
    moveTransitionBetweenItems,
    
    // Utilities
    findItemById,
    findAdjacentItem,
    hasAdjacentItem,
    getItemsWithBetweenTransitions,
  };
};

export default useTimelineTransitions;
