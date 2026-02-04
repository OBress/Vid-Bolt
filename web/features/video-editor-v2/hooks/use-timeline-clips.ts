/**
 * useTimelineClips - Hook for managing timeline clips
 * 
 * This is the primary hook for clip manipulation in the Timeline V2 architecture.
 * All operations use the unified VideoEditorStore.
 * 
 * Replaces the legacy useOverlays hook.
 */

import { useCallback, useMemo } from "react";
import { 
  useVideoEditorStore, 
  selectClips,
  selectTracks,
  selectSelectedClipIds,
  selectSelectedClipId,
  selectSelectedClip,
  selectFps,
  selectTransitions,
  getClipTransitionsPure,
} from "../stores/video-editor-store";
import type { 
  TimelineClip, 
  TimelineTrack,
  ClipType, 
  ClipTransform,
  TransitionEntity,
} from "../types/timeline-v2";

/**
 * Hook to manage timeline clips in the editor
 * 
 * @returns Object containing clip state and management functions
 */
export const useTimelineClips = () => {
  // Get state from store via selectors
  const clips = useVideoEditorStore(selectClips);
  const tracks = useVideoEditorStore(selectTracks);
  const selectedClipIds = useVideoEditorStore(selectSelectedClipIds);
  const selectedClipId = useVideoEditorStore(selectSelectedClipId);
  const selectedClip = useVideoEditorStore(selectSelectedClip);
  const fps = useVideoEditorStore(selectFps);
  const transitions = useVideoEditorStore(selectTransitions);

  // Get actions from store
  const {
    addClip,
    deleteClip,
    deleteClips,
    updateClip,
    moveClip,
    duplicateClip: storeDuplicateClip,
    splitClip: storeSplitClip,
    trimClip: storeTrimClip,
    linkClips,
    unlinkClips,
    getLinkedClipIds,
    selectClip: storeSelectClip,
    selectClips: storeSelectClips,
    addToSelection,
    removeFromSelection,
    clearSelection,
    setClips,
  } = useVideoEditorStore.getState();

  // ========================================
  // DERIVED STATE
  // ========================================

  /**
   * Get clips organized by track
   */
  const clipsByTrack = useMemo(() => {
    const map = new Map<string, TimelineClip[]>();
    tracks.forEach(track => {
      map.set(
        track.id, 
        clips.filter(c => c.trackId === track.id).sort((a, b) => a.startTime - b.startTime)
      );
    });
    return map;
  }, [clips, tracks]);

  /**
   * Calculate total duration in seconds
   */
  const totalDuration = useMemo(() => {
    if (clips.length === 0) return 30;
    return Math.max(...clips.map(c => c.startTime + c.duration));
  }, [clips]);

  /**
   * Calculate total duration in frames
   */
  const totalDurationInFrames = useMemo(() => {
    return Math.ceil(totalDuration * fps);
  }, [totalDuration, fps]);

  // ========================================
  // CLIP OPERATIONS
  // ========================================

  /**
   * Create a new clip and add it to the timeline
   */
  const createClip = useCallback((params: {
    trackId: string;
    startTime: number;
    duration: number;
    type: ClipType;
    sourceId: string;
    label?: string;
    transform?: Partial<ClipTransform>;
    data?: Record<string, any>;
  }): string => {
    const defaultTransform: ClipTransform = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      opacity: 1,
      zIndex: 0,
    };

    return addClip({
      trackId: params.trackId,
      startTime: params.startTime,
      duration: params.duration,
      type: params.type,
      sourceId: params.sourceId,
      label: params.label,
      transform: { ...defaultTransform, ...params.transform },
      data: params.data,
    });
  }, [addClip]);

  /**
   * Update a clip's properties
   */
  const changeClip = useCallback((
    clipId: string,
    updater: Partial<TimelineClip> | ((clip: TimelineClip) => Partial<TimelineClip>)
  ) => {
    const clip = clips.find(c => c.id === clipId);
    if (!clip) return;

    const updates = typeof updater === 'function' ? updater(clip) : updater;
    updateClip(clipId, updates);
  }, [clips, updateClip]);

  /**
   * Delete selected clips
   */
  const deleteSelectedClips = useCallback(() => {
    if (selectedClipIds.length > 0) {
      deleteClips(selectedClipIds);
    }
  }, [selectedClipIds, deleteClips]);

  /**
   * Duplicate a clip
   */
  const duplicateClip = useCallback((clipId: string): string | null => {
    return storeDuplicateClip(clipId);
  }, [storeDuplicateClip]);

  /**
   * Split a clip at a specific time
   */
  const splitClip = useCallback((clipId: string, splitTime: number): [string, string] | null => {
    return storeSplitClip(clipId, splitTime);
  }, [storeSplitClip]);

  /**
   * Split a clip at a specific frame
   */
  const splitClipAtFrame = useCallback((clipId: string, frame: number): [string, string] | null => {
    const splitTime = frame / fps;
    return storeSplitClip(clipId, splitTime);
  }, [storeSplitClip, fps]);

  /**
   * Trim a clip (change start time and duration)
   */
  const trimClip = useCallback((
    clipId: string, 
    newStartTime: number, 
    newDuration: number
  ) => {
    storeTrimClip(clipId, newStartTime, newDuration);
  }, [storeTrimClip]);

  /**
   * Move a clip to a new track and/or time
   */
  const moveClipTo = useCallback((
    clipId: string, 
    trackId: string, 
    startTime: number
  ) => {
    moveClip(clipId, trackId, startTime);
    
    // Also move linked clips
    const linkedIds = getLinkedClipIds(clipId);
    linkedIds.forEach(linkedId => {
      if (linkedId !== clipId) {
        const linkedClip = clips.find(c => c.id === linkedId);
        if (linkedClip) {
          // Find corresponding audio/video track
          const clip = clips.find(c => c.id === clipId);
          const sourceTrack = tracks.find(t => t.id === clip?.trackId);
          const targetTrack = tracks.find(t => t.id === trackId);
          
          if (sourceTrack && targetTrack && sourceTrack.type !== targetTrack.type) {
            // Linked clip should stay on its original track type
            moveClip(linkedId, linkedClip.trackId, startTime);
          } else {
            moveClip(linkedId, trackId, startTime);
          }
        }
      }
    });
  }, [moveClip, getLinkedClipIds, clips, tracks]);

  // ========================================
  // SELECTION OPERATIONS
  // ========================================

  /**
   * Select a single clip
   */
  const selectClip = useCallback((clipId: string | null) => {
    storeSelectClip(clipId);
  }, [storeSelectClip]);

  /**
   * Select multiple clips
   */
  const selectClips = useCallback((clipIds: string[]) => {
    storeSelectClips(clipIds);
  }, [storeSelectClips]);

  /**
   * Toggle clip selection (add/remove from multi-select)
   */
  const toggleClipSelection = useCallback((clipId: string) => {
    if (selectedClipIds.includes(clipId)) {
      removeFromSelection(clipId);
    } else {
      addToSelection(clipId);
    }
  }, [selectedClipIds, addToSelection, removeFromSelection]);

  // ========================================
  // UTILITY FUNCTIONS
  // ========================================

  /**
   * Get a clip by ID
   */
  const getClipById = useCallback((clipId: string): TimelineClip | undefined => {
    return clips.find(c => c.id === clipId);
  }, [clips]);

  /**
   * Get clips on a specific track
   */
  const getClipsByTrack = useCallback((trackId: string): TimelineClip[] => {
    return clips.filter(c => c.trackId === trackId).sort((a, b) => a.startTime - b.startTime);
  }, [clips]);

  /**
   * Get clips at a specific time
   */
  const getClipsAtTime = useCallback((time: number, trackId?: string): TimelineClip[] => {
    return clips.filter(c => {
      if (trackId && c.trackId !== trackId) return false;
      return time >= c.startTime && time < c.startTime + c.duration;
    });
  }, [clips]);

  /**
   * Get clips in a time range
   */
  const getClipsInRange = useCallback((
    startTime: number, 
    endTime: number, 
    trackId?: string
  ): TimelineClip[] => {
    return clips.filter(c => {
      if (trackId && c.trackId !== trackId) return false;
      const clipEnd = c.startTime + c.duration;
      return c.startTime < endTime && clipEnd > startTime;
    });
  }, [clips]);

  /**
   * Check if a time range is available on a track
   */
  const isTimeRangeAvailable = useCallback((
    trackId: string,
    startTime: number,
    duration: number,
    excludeClipIds: string[] = []
  ): boolean => {
    const track = tracks.find(t => t.id === trackId);
    if (!track) return false;
    
    // If track allows overlap, always available
    if (track.allowOverlap) return true;
    
    const endTime = startTime + duration;
    const trackClips = clips.filter(c => 
      c.trackId === trackId && !excludeClipIds.includes(c.id)
    );
    
    return !trackClips.some(c => {
      const clipEnd = c.startTime + c.duration;
      return c.startTime < endTime && clipEnd > startTime;
    });
  }, [clips, tracks]);

  /**
   * Find the next available position on a track
   */
  const findNextAvailablePosition = useCallback((
    trackId: string,
    duration: number,
    afterTime: number = 0
  ): number => {
    const trackClips = clips
      .filter(c => c.trackId === trackId)
      .sort((a, b) => a.startTime - b.startTime);
    
    let position = afterTime;
    
    for (const clip of trackClips) {
      if (clip.startTime >= position + duration) {
        // Gap is large enough
        break;
      }
      if (clip.startTime + clip.duration > position) {
        // Move position to after this clip
        position = clip.startTime + clip.duration;
      }
    }
    
    return position;
  }, [clips]);

  /**
   * Convert frame to time
   */
  const frameToTime = useCallback((frame: number): number => {
    return frame / fps;
  }, [fps]);

  /**
   * Convert time to frame
   */
  const timeToFrame = useCallback((time: number): number => {
    return Math.round(time * fps);
  }, [fps]);

  /**
   * Get transitions for a clip
   * Uses the canonical getClipTransitionsPure function
   */
  const getClipTransitions = useCallback((clipId: string): {
    inTransition?: TransitionEntity;
    outTransition?: TransitionEntity;
  } => {
    return getClipTransitionsPure(clipId, transitions);
  }, [transitions]);

  return {
    // State
    clips,
    tracks,
    selectedClipIds,
    selectedClipId,
    selectedClip,
    clipsByTrack,
    totalDuration,
    totalDurationInFrames,
    fps,
    transitions,
    
    // Clip operations
    createClip,
    changeClip,
    deleteClip,
    deleteClips,
    deleteSelectedClips,
    duplicateClip,
    splitClip,
    splitClipAtFrame,
    trimClip,
    moveClipTo,
    setClips,
    
    // Linking
    linkClips,
    unlinkClips,
    getLinkedClipIds,
    
    // Selection
    selectClip,
    selectClips,
    toggleClipSelection,
    addToSelection,
    removeFromSelection,
    clearSelection,
    
    // Utility
    getClipById,
    getClipsByTrack,
    getClipsAtTime,
    getClipsInRange,
    isTimeRangeAvailable,
    findNextAvailablePosition,
    frameToTime,
    timeToFrame,
    getClipTransitions,
  };
};

export default useTimelineClips;
