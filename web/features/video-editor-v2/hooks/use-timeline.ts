/**
 * useTimeline - Unified Timeline Hook
 * 
 * Single entry point for all timeline operations in the Timeline V2 architecture.
 * Consolidates track management, clip operations, transitions, and selection.
 * 
 * Usage:
 * ```tsx
 * const {
 *   // Data
 *   tracks, clips, transitions, selectedClipIds,
 *   // Clip operations
 *   addClip, updateClip, deleteClip, splitClip,
 *   // Track operations
 *   addTrack, deleteTrack, reorderTracks,
 *   // Transition operations
 *   addTransition, removeTransition,
 *   // Selection
 *   selectClip, clearSelection,
 * } = useTimeline();
 * ```
 */

import { useCallback, useMemo } from "react";
import { 
  useVideoEditorStore, 
  selectTracksArray,
  selectClipsArray,
  selectTransitions,
  selectSelectedClipIds,
  selectSelectedClipId,
  selectFps,
  selectVideoTracks,
  selectAudioTracks,
  computeLinkGroup,
  getClipTransitionsPure,
} from "../stores/video-editor-store";
import type { 
  TimelineTrack, 
  TimelineClip, 
  TransitionEntity,
  ClipType,
  ClipTransform,
  TrackType,
} from "../types/timeline-v2";
import { VideoTransitionType, AudioTransitionType, TransitionEasing } from "../types";

/**
 * Return type for useTimeline hook
 */
export interface UseTimelineReturn {
  // === DATA ===
  /** All tracks sorted by order */
  tracks: TimelineTrack[];
  /** Video tracks only */
  videoTracks: TimelineTrack[];
  /** Audio tracks only */
  audioTracks: TimelineTrack[];
  /** All clips */
  clips: TimelineClip[];
  /** All transitions as a record */
  transitions: Record<string, TransitionEntity>;
  /** Currently selected clip IDs */
  selectedClipIds: string[];
  /** First selected clip ID (convenience) */
  selectedClipId: string | null;
  /** FPS setting */
  fps: number;
  /** Total duration in seconds */
  totalDuration: number;
  
  // === CLIP OPERATIONS ===
  /** Create a new clip */
  addClip: (clip: Omit<TimelineClip, 'id' | 'createdAt' | 'updatedAt'>) => string;
  /** Update an existing clip */
  updateClip: (clipId: string, updates: Partial<TimelineClip>) => void;
  /** Delete a clip */
  deleteClip: (clipId: string) => void;
  /** Delete multiple clips */
  deleteClips: (clipIds: string[]) => void;
  /** Move a clip to a new position/track */
  moveClip: (clipId: string, newTrackId: string, newStartTime: number) => void;
  /** Duplicate a clip */
  duplicateClip: (clipId: string) => string | null;
  /** Split a clip at a time */
  splitClip: (clipId: string, splitTime: number) => { firstClipId: string; secondClipId: string } | null;
  /** Trim a clip */
  trimClip: (clipId: string, newStart: number, newDuration: number, trimType?: 'start' | 'end' | 'both') => void;
  /** Link two clips */
  linkClips: (clipId1: string, clipId2: string) => void;
  /** Unlink clips */
  unlinkClips: (clipIds: string[]) => void;
  /** Get linked clip IDs */
  getLinkedClipIds: (clipId: string) => string[];
  
  // === TRACK OPERATIONS ===
  /** Add a new track */
  addTrack: (type: TrackType, options?: Partial<TimelineTrack>) => string;
  /** Delete a track */
  deleteTrack: (trackId: string, deleteClips?: boolean) => void;
  /** Update a track */
  updateTrack: (trackId: string, updates: Partial<TimelineTrack>) => void;
  /** Reorder tracks */
  reorderTracks: (trackIds: string[]) => void;
  /** Toggle track lock */
  toggleTrackLock: (trackId: string) => void;
  /** Toggle track visibility */
  toggleTrackVisibility: (trackId: string) => void;
  /** Toggle track mute */
  toggleTrackMute: (trackId: string) => void;
  
  // === TRANSITION OPERATIONS ===
  /** Add a standalone transition (fade in/out) */
  addTransition: (params: {
    clipId: string;
    position: 'in' | 'out';
    type: VideoTransitionType | AudioTransitionType;
    isAudio: boolean;
    duration?: number;
    easing?: TransitionEasing;
  }) => string;
  /** Add a between transition (crossfade) */
  addBetweenTransition: (params: {
    firstClipId: string;
    secondClipId: string;
    type: VideoTransitionType | AudioTransitionType;
    isAudio: boolean;
    duration?: number;
  }) => string;
  /** Update a transition */
  updateTransition: (id: string, updates: Partial<Omit<TransitionEntity, 'id' | 'clipIds' | 'createdAt'>>) => void;
  /** Remove a transition */
  removeTransition: (id: string) => void;
  /** Get transitions for a clip */
  getClipTransitions: (clipId: string) => { inTransition?: TransitionEntity; outTransition?: TransitionEntity };
  
  // === SELECTION ===
  /** Select a single clip */
  selectClip: (id: string | null) => void;
  /** Select multiple clips */
  selectClips: (ids: string[]) => void;
  /** Add to selection */
  addToSelection: (id: string) => void;
  /** Remove from selection */
  removeFromSelection: (id: string) => void;
  /** Clear selection */
  clearSelection: () => void;
  
  // === UTILITY ===
  /** Get clip by ID */
  getClipById: (clipId: string) => TimelineClip | undefined;
  /** Get track by ID */
  getTrackById: (trackId: string) => TimelineTrack | undefined;
  /** Get clips by track */
  getClipsByTrack: (trackId: string) => TimelineClip[];
  /** Convert time to frame */
  timeToFrame: (time: number) => number;
  /** Convert frame to time */
  frameToTime: (frame: number) => number;
}

/**
 * Unified timeline hook - single entry point for all timeline operations
 */
export const useTimeline = (): UseTimelineReturn => {
  // Get state from store
  const tracks = useVideoEditorStore(selectTracksArray);
  const videoTracks = useVideoEditorStore(selectVideoTracks);
  const audioTracks = useVideoEditorStore(selectAudioTracks);
  const clips = useVideoEditorStore(selectClipsArray);
  const transitions = useVideoEditorStore(selectTransitions);
  const selectedClipIds = useVideoEditorStore(selectSelectedClipIds);
  const selectedClipId = useVideoEditorStore(selectSelectedClipId);
  const fps = useVideoEditorStore(selectFps);
  
  // Get actions from store (stable references)
  const actions = useVideoEditorStore.getState();
  
  // Computed values
  const totalDuration = useMemo(() => {
    if (clips.length === 0) return 0;
    return Math.max(...clips.map(clip => clip.startTime + clip.duration));
  }, [clips]);
  
  // Clip operations
  const addClip = useCallback((clip: Omit<TimelineClip, 'id' | 'createdAt' | 'updatedAt'>) => {
    return actions.addClip(clip);
  }, []);
  
  const updateClip = useCallback((clipId: string, updates: Partial<TimelineClip>) => {
    actions.updateClip(clipId, updates);
  }, []);
  
  const deleteClip = useCallback((clipId: string) => {
    actions.deleteClip(clipId);
  }, []);
  
  const deleteClips = useCallback((clipIds: string[]) => {
    actions.deleteClips(clipIds);
  }, []);
  
  const moveClip = useCallback((clipId: string, newTrackId: string, newStartTime: number) => {
    actions.moveClip(clipId, newTrackId, newStartTime);
  }, []);
  
  const duplicateClip = useCallback((clipId: string) => {
    return actions.duplicateClip(clipId);
  }, []);
  
  const splitClip = useCallback((clipId: string, splitTime: number) => {
    return actions.splitClip(clipId, splitTime);
  }, []);
  
  const trimClip = useCallback((clipId: string, newStart: number, newDuration: number, trimType?: 'start' | 'end' | 'both') => {
    actions.trimClip(clipId, newStart, newDuration);
  }, []);
  
  const linkClips = useCallback((clipId1: string, clipId2: string) => {
    actions.linkClips(clipId1, clipId2);
  }, []);
  
  const unlinkClips = useCallback((clipIds: string[]) => {
    actions.unlinkClips(clipIds);
  }, []);
  
  const getLinkedClipIds = useCallback((clipId: string) => {
    return actions.getLinkedClipIds(clipId);
  }, []);
  
  // Track operations
  const addTrack = useCallback((type: TrackType, options?: Partial<TimelineTrack>) => {
    return actions.addTrack(type, options);
  }, []);
  
  const deleteTrack = useCallback((trackId: string, deleteClipsFlag?: boolean) => {
    actions.deleteTrack(trackId, deleteClipsFlag);
  }, []);
  
  const updateTrack = useCallback((trackId: string, updates: Partial<TimelineTrack>) => {
    actions.updateTrack(trackId, updates);
  }, []);
  
  const reorderTracks = useCallback((trackIds: string[]) => {
    actions.reorderTracks(trackIds);
  }, []);
  
  const toggleTrackLock = useCallback((trackId: string) => {
    actions.toggleTrackLock(trackId);
  }, []);
  
  const toggleTrackVisibility = useCallback((trackId: string) => {
    actions.toggleTrackVisibility(trackId);
  }, []);
  
  const toggleTrackMute = useCallback((trackId: string) => {
    actions.toggleTrackMute(trackId);
  }, []);
  
  // Transition operations
  const addTransition = useCallback((params: {
    clipId: string;
    position: 'in' | 'out';
    type: VideoTransitionType | AudioTransitionType;
    isAudio: boolean;
    duration?: number;
    easing?: TransitionEasing;
  }) => {
    return actions.addTransition(params);
  }, []);
  
  const addBetweenTransition = useCallback((params: {
    firstClipId: string;
    secondClipId: string;
    type: VideoTransitionType | AudioTransitionType;
    isAudio: boolean;
    duration?: number;
  }) => {
    return actions.addBetweenTransition(params);
  }, []);
  
  const updateTransition = useCallback((id: string, updates: Partial<Omit<TransitionEntity, 'id' | 'clipIds' | 'createdAt'>>) => {
    actions.updateTransition(id, updates);
  }, []);
  
  const removeTransition = useCallback((id: string) => {
    actions.removeTransition(id);
  }, []);
  
  const getClipTransitions = useCallback((clipId: string) => {
    return getClipTransitionsPure(clipId, transitions);
  }, [transitions]);
  
  // Selection operations
  const selectClip = useCallback((id: string | null) => {
    actions.selectClip(id);
  }, []);
  
  const selectMultipleClips = useCallback((ids: string[]) => {
    actions.selectClips(ids);
  }, []);
  
  const addToSelection = useCallback((id: string) => {
    actions.addToSelection(id);
  }, []);
  
  const removeFromSelection = useCallback((id: string) => {
    actions.removeFromSelection(id);
  }, []);
  
  const clearSelection = useCallback(() => {
    actions.clearSelection();
  }, []);
  
  // Utility functions
  const getClipById = useCallback((clipId: string) => {
    return clips.find(c => c.id === clipId);
  }, [clips]);
  
  const getTrackById = useCallback((trackId: string) => {
    return tracks.find(t => t.id === trackId);
  }, [tracks]);
  
  const getClipsByTrack = useCallback((trackId: string) => {
    return clips.filter(c => c.trackId === trackId).sort((a, b) => a.startTime - b.startTime);
  }, [clips]);
  
  const timeToFrame = useCallback((time: number) => {
    return Math.round(time * fps);
  }, [fps]);
  
  const frameToTime = useCallback((frame: number) => {
    return frame / fps;
  }, [fps]);
  
  return {
    // Data
    tracks,
    videoTracks,
    audioTracks,
    clips,
    transitions,
    selectedClipIds,
    selectedClipId,
    fps,
    totalDuration,
    
    // Clip operations
    addClip,
    updateClip,
    deleteClip,
    deleteClips,
    moveClip,
    duplicateClip,
    splitClip: splitClip as UseTimelineReturn['splitClip'],
    trimClip,
    linkClips,
    unlinkClips,
    getLinkedClipIds,
    
    // Track operations
    addTrack,
    deleteTrack,
    updateTrack,
    reorderTracks,
    toggleTrackLock,
    toggleTrackVisibility,
    toggleTrackMute,
    
    // Transition operations
    addTransition,
    addBetweenTransition,
    updateTransition,
    removeTransition,
    getClipTransitions,
    
    // Selection
    selectClip,
    selectClips: selectMultipleClips,
    addToSelection,
    removeFromSelection,
    clearSelection,
    
    // Utility
    getClipById,
    getTrackById,
    getClipsByTrack,
    timeToFrame,
    frameToTime,
  };
};

export default useTimeline;
