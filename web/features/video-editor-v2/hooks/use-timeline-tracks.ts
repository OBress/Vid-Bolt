/**
 * useTrackManagement - Hook for managing timeline track state
 * 
 * Provides track management functionality (add, delete, lock, mute, solo, etc.)
 * for the Timeline V2 architecture.
 * 
 * NOTE: For UI rendering with denormalized tracks (tracks with embedded clips),
 * use useTimelineTracks from 'advanced-timeline/hooks/use-timeline-tracks'.
 */

import { useCallback, useMemo } from "react";
import { 
  useVideoEditorStore, 
  selectTracks,
  selectVideoTracks,
  selectAudioTracks,
  selectClips,
} from "../stores/video-editor-store";
import type { TimelineTrack, TimelineClip, TrackType } from "../types/timeline-v2";

/**
 * Hook for track management operations
 */
export const useTrackManagement = () => {
  // Get state from store
  const tracks = useVideoEditorStore(selectTracks);
  const videoTracks = useVideoEditorStore(selectVideoTracks);
  const audioTracks = useVideoEditorStore(selectAudioTracks);
  const clips = useVideoEditorStore(selectClips);
  
  // Get actions from store
  const {
    addTrack,
    deleteTrack,
    updateTrack,
    reorderTracks,
    toggleTrackLock,
    toggleTrackVisibility,
    toggleTrackMute,
    setTracks,
  } = useVideoEditorStore.getState();

  // ========================================
  // DERIVED STATE
  // ========================================

  /**
   * Get clips by track ID
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
   * Check if any track has clips
   */
  const hasClips = useMemo(() => {
    return clips.length > 0;
  }, [clips]);

  /**
   * Get total number of tracks by type
   */
  const trackCounts = useMemo(() => ({
    video: videoTracks.length,
    audio: audioTracks.length,
    total: tracks.length,
  }), [videoTracks.length, audioTracks.length, tracks.length]);

  // ========================================
  // TRACK OPERATIONS
  // ========================================

  /**
   * Add a new video track
   */
  const addVideoTrack = useCallback((options?: Partial<TimelineTrack>) => {
    return addTrack('video', options);
  }, [addTrack]);

  /**
   * Add a new audio track
   */
  const addAudioTrack = useCallback((options?: Partial<TimelineTrack>) => {
    return addTrack('audio', options);
  }, [addTrack]);

  /**
   * Remove a track (optionally keeping clips by moving them to another track)
   */
  const removeTrack = useCallback((trackId: string, options?: {
    deleteClips?: boolean;
    moveClipsToTrackId?: string;
  }) => {
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;

    // If moving clips to another track
    if (options?.moveClipsToTrackId) {
      const trackClips = clips.filter(c => c.trackId === trackId);
      trackClips.forEach(clip => {
        useVideoEditorStore.getState().moveClip(clip.id, options.moveClipsToTrackId!, clip.startTime);
      });
      deleteTrack(trackId, false);
    } else {
      deleteTrack(trackId, options?.deleteClips ?? true);
    }
  }, [tracks, clips, deleteTrack]);

  /**
   * Rename a track
   */
  const renameTrack = useCallback((trackId: string, newName: string) => {
    updateTrack(trackId, { name: newName });
  }, [updateTrack]);

  /**
   * Set track color
   */
  const setTrackColor = useCallback((trackId: string, color: string) => {
    updateTrack(trackId, { color });
  }, [updateTrack]);

  /**
   * Move track to a new position
   */
  const moveTrack = useCallback((trackId: string, newOrder: number) => {
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;

    // Get all tracks of same type
    const sameTypeTracks = tracks.filter(t => t.type === track.type);
    const otherTypeTracks = tracks.filter(t => t.type !== track.type);

    // Remove and insert at new position
    const filteredSame = sameTypeTracks.filter(t => t.id !== trackId);
    filteredSame.splice(newOrder, 0, track);

    // Rebuild track order
    const reorderedIds = [
      ...filteredSame.map(t => t.id),
      ...otherTypeTracks.map(t => t.id),
    ];
    
    reorderTracks(reorderedIds);
  }, [tracks, reorderTracks]);

  // ========================================
  // TRACK STATE OPERATIONS
  // ========================================

  /**
   * Lock all tracks
   */
  const lockAllTracks = useCallback(() => {
    tracks.forEach(track => {
      if (!track.locked) {
        updateTrack(track.id, { locked: true });
      }
    });
  }, [tracks, updateTrack]);

  /**
   * Unlock all tracks
   */
  const unlockAllTracks = useCallback(() => {
    tracks.forEach(track => {
      if (track.locked) {
        updateTrack(track.id, { locked: false });
      }
    });
  }, [tracks, updateTrack]);

  /**
   * Mute all audio tracks
   */
  const muteAllAudio = useCallback(() => {
    audioTracks.forEach(track => {
      if (!track.muted) {
        updateTrack(track.id, { muted: true });
      }
    });
  }, [audioTracks, updateTrack]);

  /**
   * Unmute all audio tracks
   */
  const unmuteAllAudio = useCallback(() => {
    audioTracks.forEach(track => {
      if (track.muted) {
        updateTrack(track.id, { muted: false });
      }
    });
  }, [audioTracks, updateTrack]);

  /**
   * Solo a track (mute all other tracks of same type)
   */
  const soloTrack = useCallback((trackId: string) => {
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;

    const sameTypeTracks = tracks.filter(t => t.type === track.type);
    sameTypeTracks.forEach(t => {
      updateTrack(t.id, { 
        muted: t.id !== trackId,
        solo: t.id === trackId,
      });
    });
  }, [tracks, updateTrack]);

  /**
   * Unsolo all tracks
   */
  const unsoloAllTracks = useCallback(() => {
    tracks.forEach(track => {
      if (track.solo || track.muted) {
        updateTrack(track.id, { solo: false, muted: false });
      }
    });
  }, [tracks, updateTrack]);

  // ========================================
  // UTILITY FUNCTIONS
  // ========================================

  /**
   * Get track by ID
   */
  const getTrackById = useCallback((trackId: string): TimelineTrack | undefined => {
    return tracks.find(t => t.id === trackId);
  }, [tracks]);

  /**
   * Get track at specific order position
   */
  const getTrackAtOrder = useCallback((order: number): TimelineTrack | undefined => {
    return tracks.find(t => t.order === order);
  }, [tracks]);

  /**
   * Find first available track for a clip type
   */
  const findAvailableTrack = useCallback((type: TrackType): TimelineTrack | undefined => {
    const tracksOfType = type === 'video' ? videoTracks : audioTracks;
    return tracksOfType.find(t => !t.locked);
  }, [videoTracks, audioTracks]);

  /**
   * Get clips for a specific track
   */
  const getTrackClips = useCallback((trackId: string): TimelineClip[] => {
    return clipsByTrack.get(trackId) || [];
  }, [clipsByTrack]);

  /**
   * Check if track is empty
   */
  const isTrackEmpty = useCallback((trackId: string): boolean => {
    const trackClips = clipsByTrack.get(trackId);
    return !trackClips || trackClips.length === 0;
  }, [clipsByTrack]);

  /**
   * Get track index in the sorted list
   */
  const getTrackIndex = useCallback((trackId: string): number => {
    return tracks.findIndex(t => t.id === trackId);
  }, [tracks]);

  return {
    // State
    tracks,
    videoTracks,
    audioTracks,
    clipsByTrack,
    hasClips,
    trackCounts,
    
    // Track management
    addTrack,
    addVideoTrack,
    addAudioTrack,
    removeTrack,
    renameTrack,
    setTrackColor,
    moveTrack,
    reorderTracks,
    setTracks,
    
    // Track state
    toggleTrackLock,
    toggleTrackVisibility,
    toggleTrackMute,
    lockAllTracks,
    unlockAllTracks,
    muteAllAudio,
    unmuteAllAudio,
    soloTrack,
    unsoloAllTracks,
    
    // Utility
    getTrackById,
    getTrackAtOrder,
    findAvailableTrack,
    getTrackClips,
    isTrackEmpty,
    getTrackIndex,
  };
};

export default useTrackManagement;
