/**
 * useMediaDrop - Unified drag and drop hook for media panel to timeline
 * 
 * This hook handles:
 * - Dragging media (video, image, audio) from asset panels to timeline
 * - Ghost preview with cross-track snapping
 * - Video+audio mirrored track placement
 * - Track insertion detection and creation
 * 
 * Design principles:
 * - Single source of truth: video-editor-store for all drag state
 * - Pixel-based positioning for stable ghost rendering
 * - Premiere Pro-style cross-track edge snapping
 */

import { useCallback, useRef, useMemo } from 'react';
import { TrackWithClips, TimelineItem, isVideoTrackItem, isAudioTrackItem } from '../types';
import { TIMELINE_CONSTANTS, SNAPPING_CONFIG } from '../constants';
import { getCurrentDrag, useVideoEditorStore, endDrag, type UnifiedDragState } from '../../../stores/video-editor-store';

// ============================================================
// TYPES
// ============================================================

export interface MediaDropState {
  isDragging: boolean;
  itemType: string | null;
  startTime: number;
  duration: number;
  primaryTrackIndex: number;
  audioTrackIndex: number; // -1 if no audio track needed
  isValidDrop: boolean;
  snappedTime: number | null; // The time position we snapped to, if any
  snappedToTrackIndex: number; // Track index of item we snapped to (-1 if none)
  insertionIndex: number | null; // Track insertion point if dropping between tracks
  thumbnailUrl?: string; // Thumbnail URL for preview
  itemLabel?: string; // Label for the item
}

export interface GhostRenderData {
  id: string;
  startTime: number;
  duration: number;
  trackIndex: number;
  isAudio: boolean;
  isValid: boolean;
  thumbnailUrl?: string;
  label?: string;
}

export interface SnapIndicator {
  time: number;
  fromTrackIndex: number;
  toTrackIndex: number;
}

interface UseMediaDropProps {
  timelineRef: React.RefObject<HTMLDivElement>;
  totalDuration: number;
  tracks: TrackWithClips[];
  trackHeight?: number;
  onDrop?: (
    itemType: string,
    trackIndex: number,
    startTime: number,
    itemData: {
      duration: number;
      label?: string;
      data?: any;
      audioTrackIndex?: number; // For video files that need audio placement
    }
  ) => void;
  onInsertTrack?: (index: number, trackType?: 'video' | 'audio') => string;
}

// ============================================================
// CONSTANTS
// ============================================================

const SNAP_THRESHOLD = 0.15; // seconds - snap within this distance of an edge
const TRACK_INSERTION_THRESHOLD = 8; // pixels - detect insertion zone near track boundaries
const DEFAULT_IMAGE_DURATION = 5; // seconds
const DEFAULT_VIDEO_DURATION = 10; // seconds
const SPACER_HEIGHT = 28; // Height of "Add Track" button spacer

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Find first video track index in tracks array
 */
const findFirstVideoTrackIndex = (tracks: TrackWithClips[]): number => {
  const index = tracks.findIndex(t => t.type === 'video');
  return index >= 0 ? index : 0;
};

/**
 * Find first audio track index in tracks array
 */
const findFirstAudioTrackIndex = (tracks: TrackWithClips[]): number => {
  const index = tracks.findIndex(t => t.type === 'audio');
  return index >= 0 ? index : tracks.length - 1;
};

/**
 * Calculate the corresponding audio track index for a video track using middle-out pairing.
 * V1 (bottom video, closest to middle) pairs with A1 (top audio, closest to middle)
 * 
 * Layout:
 *   V3  ← top video (furthest from middle)
 *   V2
 *   V1  ← bottom video (closest to middle)
 *   ──── MIDDLE DIVIDER ────
 *   A1  ← top audio (closest to middle)
 *   A2
 *   A3  ← bottom audio (furthest from middle)
 */
const calculateMirroredAudioTrackIndex = (
  videoTrackIndex: number,
  tracks: TrackWithClips[]
): number => {
  const videoTracks = tracks.filter(t => t.type === 'video');
  const audioTracks = tracks.filter(t => t.type === 'audio');
  
  if (audioTracks.length === 0) {
    return -1; // No audio tracks available
  }
  
  // Count video tracks before the target index
  let videoIdxInVideoTracks = 0;
  for (let i = 0; i < videoTrackIndex && i < tracks.length; i++) {
    if (tracks[i].type === 'video') {
      videoIdxInVideoTracks++;
    }
  }
  
  // Calculate position from middle for video track
  // Video tracks are reversed (V3, V2, V1), so last one is closest to middle
  const videoPositionFromMiddle = videoTracks.length - 1 - videoIdxInVideoTracks;
  
  // Corresponding audio track has same position from middle
  const correspondingAudioIdx = videoPositionFromMiddle;
  
  // Find actual track index in full tracks array
  let audioCount = 0;
  for (let i = 0; i < tracks.length; i++) {
    if (tracks[i].type === 'audio') {
      if (audioCount === correspondingAudioIdx) {
        return i;
      }
      audioCount++;
    }
  }
  
  // Fallback: return first audio track
  return tracks.findIndex(t => t.type === 'audio');
};

/**
 * Collect all snap targets (clip edges) from all tracks
 */
const collectSnapTargets = (tracks: TrackWithClips[]): number[] => {
  const targets: number[] = [0]; // Always include timeline start
  
  tracks.forEach(track => {
    track.items.forEach(item => {
      targets.push(item.start);
      targets.push(item.end);
    });
  });
  
  // Remove duplicates and sort
  return [...new Set(targets)].sort((a, b) => a - b);
};

/**
 * Find the best snap position for a given time and duration
 * Checks both start and end of the item against all snap targets
 */
const findSnapPosition = (
  rawTime: number,
  duration: number,
  snapTargets: number[],
  threshold: number
): { snappedTime: number; snappedTo: number | null } => {
  let bestSnap: number | null = null;
  let bestDistance = threshold;
  let snappedTo: number | null = null;
  
  const endTime = rawTime + duration;
  
  for (const target of snapTargets) {
    // Check start edge snapping to target
    const startDistance = Math.abs(rawTime - target);
    if (startDistance < bestDistance) {
      bestDistance = startDistance;
      bestSnap = target;
      snappedTo = target;
    }
    
    // Check end edge snapping to target
    const endDistance = Math.abs(endTime - target);
    if (endDistance < bestDistance) {
      bestDistance = endDistance;
      bestSnap = target - duration; // Adjust so end aligns with target
      snappedTo = target;
    }
  }
  
  return {
    snappedTime: bestSnap !== null ? bestSnap : rawTime,
    snappedTo,
  };
};

/**
 * Find which track a snap target belongs to (for visual indicator)
 */
const findTrackForSnapTarget = (
  snapTarget: number,
  tracks: TrackWithClips[]
): number => {
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    for (const item of track.items) {
      if (Math.abs(item.start - snapTarget) < 0.001 || Math.abs(item.end - snapTarget) < 0.001) {
        return i;
      }
    }
  }
  return -1; // Snap to timeline start or no specific track
};

/**
 * Check if dropping at a position would cause overlap on a track
 */
const checkForOverlap = (
  track: TrackWithClips,
  startTime: number,
  duration: number
): boolean => {
  // Video tracks allow overlap (layering)
  if (track.allowOverlap) return false;
  
  const endTime = startTime + duration;
  return track.items.some(
    item => startTime < item.end && endTime > item.start
  );
};

/**
 * Detect if mouse is near a track boundary for insertion
 */
const detectInsertionZone = (
  relativeY: number,
  tracks: TrackWithClips[],
  trackHeight: number
): number | null => {
  const adjustedY = relativeY - SPACER_HEIGHT;
  if (adjustedY < 0) return null;
  
  // Check boundaries between tracks
  for (let i = 0; i <= tracks.length; i++) {
    const boundaryY = i * trackHeight;
    const distanceToBoundary = Math.abs(adjustedY - boundaryY);
    
    if (distanceToBoundary <= TRACK_INSERTION_THRESHOLD) {
      return i;
    }
  }
  
  return null;
};

// ============================================================
// MAIN HOOK
// ============================================================

export const useMediaDrop = ({
  timelineRef,
  totalDuration,
  tracks,
  trackHeight = TIMELINE_CONSTANTS.TRACK_HEIGHT,
  onDrop,
  onInsertTrack,
}: UseMediaDropProps) => {
  // State refs for tracking drag without causing re-renders
  const lastValidDropRef = useRef<{
    itemType: string;
    trackIndex: number;
    startTime: number;
    duration: number;
    audioTrackIndex: number;
    itemData: any;
  } | null>(null);
  
  const lastUpdateRef = useRef<{
    time: number;
    trackIndex: number;
    isValid: boolean;
  } | null>(null);

  // RAF throttling refs for performance
  const rafIdRef = useRef<number | null>(null);
  const pendingDropStateRef = useRef<{
    clientX: number;
    clientY: number;
    dataTransfer: DataTransfer | null;
    isClamped?: boolean; // Flag to indicate position was clamped from outside
    hideGhost?: boolean; // Flag to hide ghost preview when outside bounds
  } | null>(null);

  // Memoize snap targets - recalculated when tracks change
  const snapTargets = useMemo(() => collectSnapTargets(tracks), [tracks]);

  /**
   * Calculate drop position from mouse event
   * Returns pixel-based calculations that are stable regardless of timeline duration changes
   */
  const calculateDropPosition = useCallback((
    clientX: number,
    clientY: number,
    dataTransfer?: DataTransfer | null,
    isClampedPosition: boolean = false // Flag to indicate position was clamped from outside
  ): MediaDropState | null => {
    if (!timelineRef.current) {
      // Debug removed for performance
      return null;
    }

    // Try to get drag data from store first
    let dragData = getCurrentDrag();
    let itemType: string | null = null;
    let duration = 5; // Default duration
    let thumbnailUrl: string | undefined = undefined;
    let itemLabel: string | undefined = undefined;
    
    
    // If store has media drag data, use it
    if (dragData && dragData.type === 'media') {
      itemType = dragData.newItemType || 'video';
      duration = dragData.mediaDuration || (itemType === 'image' ? DEFAULT_IMAGE_DURATION : DEFAULT_VIDEO_DURATION);
      thumbnailUrl = dragData.thumbnailUrl;
    } else if (dataTransfer) {
      // Fall back to parsing dataTransfer for drag data (handles race conditions)
      try {
        const jsonData = dataTransfer.getData('application/json');
        if (jsonData) {
          const parsed = JSON.parse(jsonData);
          if (parsed.isNewItem || parsed.type) {
            itemType = parsed.type || 'video';
            duration = parsed.duration || (itemType === 'image' ? DEFAULT_IMAGE_DURATION : DEFAULT_VIDEO_DURATION);
            thumbnailUrl = parsed.data?.thumbnail || parsed.thumbnail;
            itemLabel = parsed.label;
          }
        }
      } catch (e) {
      }
    }
    
    // If we couldn't determine item type, return null
    if (!itemType) {
      return null;
    }
    
    // Store extracted data for later use in return value
    const extractedData = { thumbnailUrl, itemLabel };

    const timelineRect = timelineRef.current.getBoundingClientRect();
    
    // Calculate position in timeline content coordinates
    // With virtual scroll, content is positioned via CSS transforms (no native scroll)
    // getBoundingClientRect() returns the transformed position, so direct calculation works
    const rawRelativeX = clientX - timelineRect.left;
    const relativeX = Math.max(0, rawRelativeX);
    const relativeY = clientY - timelineRect.top;
    
    // Get timeline dimensions
    const scrollableWidth = timelineRef.current.scrollWidth || timelineRect.width;
    const pixelsPerSecond = scrollableWidth / totalDuration;
    
    // Calculate raw time from pixel position
    const rawTime = Math.max(0, relativeX / pixelsPerSecond);
    
    // Check snapping
    const snappingEnabled = useVideoEditorStore.getState().snappingEnabled;
    let startTime = rawTime;
    let snappedTime: number | null = null;
    let snappedToTrackIndex = -1;
    
    if (snappingEnabled) {
      const snapResult = findSnapPosition(rawTime, duration, snapTargets, SNAP_THRESHOLD);
      startTime = snapResult.snappedTime;
      snappedTime = snapResult.snappedTo;
      
      if (snappedTime !== null) {
        snappedToTrackIndex = findTrackForSnapTarget(snappedTime, tracks);
      }
    }
    
    // Ensure we don't go before timeline start
    startTime = Math.max(0, startTime);
    
    // Calculate track index from Y position
    const adjustedY = Math.max(0, relativeY - SPACER_HEIGHT);
    const hoverTrackIndex = Math.max(
      0,
      Math.min(tracks.length - 1, Math.floor(adjustedY / trackHeight))
    );
    
    // Determine if we're in a track insertion zone
    // Disable insertion when position was clamped from outside bounds
    const insertionIndex = isClampedPosition ? null : detectInsertionZone(relativeY, tracks, trackHeight);
    
    // Determine target track based on item type
    const itemBelongsOnVideoTrack = isVideoTrackItem(itemType);
    const itemBelongsOnAudioTrack = isAudioTrackItem(itemType);
    const hoverTrack = tracks[hoverTrackIndex];
    const isHoveringVideoTrack = hoverTrack?.type === 'video';
    const isHoveringAudioTrack = hoverTrack?.type === 'audio';
    
    let primaryTrackIndex: number;
    
    if (itemBelongsOnVideoTrack) {
      primaryTrackIndex = isHoveringVideoTrack ? hoverTrackIndex : findFirstVideoTrackIndex(tracks);
    } else if (itemBelongsOnAudioTrack) {
      primaryTrackIndex = isHoveringAudioTrack ? hoverTrackIndex : findFirstAudioTrackIndex(tracks);
    } else {
      primaryTrackIndex = isHoveringVideoTrack ? hoverTrackIndex : findFirstVideoTrackIndex(tracks);
    }
    
    // Calculate mirrored audio track for video files
    const isVideoFile = itemType === 'video';
    const audioTrackIndex = isVideoFile 
      ? calculateMirroredAudioTrackIndex(primaryTrackIndex, tracks)
      : -1;
    
    // Validate drop position
    const primaryTrack = tracks[primaryTrackIndex];
    const audioTrack = audioTrackIndex >= 0 ? tracks[audioTrackIndex] : null;
    
    let isValidDrop = true;
    
    // Check track exists and is not locked
    if (!primaryTrack || primaryTrack.locked) {
      isValidDrop = false;
    }
    
    // Check for overlaps on primary track
    if (isValidDrop && primaryTrack && checkForOverlap(primaryTrack, startTime, duration)) {
      isValidDrop = false;
    }
    
    // Check for overlaps on audio track (for video files)
    if (isValidDrop && audioTrack && !audioTrack.locked && checkForOverlap(audioTrack, startTime, duration)) {
      isValidDrop = false;
    }
    
    // Check if audio track is locked
    if (isValidDrop && audioTrack && audioTrack.locked) {
      isValidDrop = false;
    }
    
    return {
      isDragging: true,
      itemType,
      startTime,
      duration,
      primaryTrackIndex,
      audioTrackIndex,
      isValidDrop,
      snappedTime,
      snappedToTrackIndex,
      insertionIndex,
      thumbnailUrl: extractedData.thumbnailUrl,
      itemLabel: extractedData.itemLabel,
    };
  }, [timelineRef, totalDuration, tracks, trackHeight, snapTargets]);

  /**
   * Process pending drag update - called via RAF for smooth 60fps updates
   */
  const processDragUpdate = useCallback(() => {
    const pending = pendingDropStateRef.current;
    if (!pending) return;
    
    const dropState = calculateDropPosition(
      pending.clientX, 
      pending.clientY, 
      pending.dataTransfer, 
      pending.isClamped || false
    );
    if (!dropState) return;
    
    // Throttle updates - only update if position changed significantly
    const currentUpdate = {
      time: Math.round(dropState.startTime * 100) / 100,
      trackIndex: dropState.primaryTrackIndex,
      isValid: dropState.isValidDrop,
    };
    
    if (
      lastUpdateRef.current &&
      Math.abs(lastUpdateRef.current.time - currentUpdate.time) < 0.05 &&
      lastUpdateRef.current.trackIndex === currentUpdate.trackIndex &&
      lastUpdateRef.current.isValid === currentUpdate.isValid
    ) {
      return; // Skip update - position hasn't changed enough
    }
    
    lastUpdateRef.current = currentUpdate;
    
    // Hide ghost if mouse is outside timeline bounds
    if (pending.hideGhost) {
      useVideoEditorStore.getState().setGhostElements(null);
    } else {
      // Create ghost elements for rendering
      const ghostElements: Array<{
        id: string;
        left: number;
        width: number;
        top: number;
        isAudio?: boolean;
      }> = [];
      
      // Calculate percentages for ghost positioning
      // Use pending duration to keep ghost stable when item would extend timeline
      const endTime = dropState.startTime + dropState.duration;
      const pendingDuration = Math.max(totalDuration, endTime);
      const leftPercentage = (dropState.startTime / pendingDuration) * 100;
      const widthPercentage = Math.max(0.5, (dropState.duration / pendingDuration) * 100);
      
      // Primary ghost (video/image/audio item)
      ghostElements.push({
        id: 'media-drop-ghost-primary',
        left: leftPercentage,
        width: widthPercentage,
        top: dropState.primaryTrackIndex * (100 / tracks.length),
        isAudio: isAudioTrackItem(dropState.itemType),
      });
      
      // Audio ghost for video files
      if (dropState.audioTrackIndex >= 0 && dropState.audioTrackIndex !== dropState.primaryTrackIndex) {
        ghostElements.push({
          id: 'media-drop-ghost-audio',
          left: leftPercentage,
          width: widthPercentage,
          top: dropState.audioTrackIndex * (100 / tracks.length),
          isAudio: true,
        });
      }
      
      // Update store with ghost elements
      useVideoEditorStore.getState().setGhostElements(ghostElements);
    }
    
    // Update snap line indicator
    if (dropState.snappedTime !== null && dropState.snappedToTrackIndex !== -1) {
      useVideoEditorStore.getState().setSnapLine({
        trackIndex: dropState.primaryTrackIndex,
        snappedToTrackIndex: dropState.snappedToTrackIndex,
        time: dropState.snappedTime,
      });
    } else {
      useVideoEditorStore.getState().setSnapLine(null);
    }
    
    // Update track insertion indicator
    if (dropState.insertionIndex !== null) {
      // Calculate where each track type should be inserted
      const insertions: Array<{ insertionIndex: number; trackType: 'video' | 'audio' }> = [];
      
      // Determine which track types are needed
      const needsVideoTrack = !isAudioTrackItem(dropState.itemType);
      const needsAudioTrack = isAudioTrackItem(dropState.itemType) || 
                             (dropState.itemType === 'video' && dropState.audioTrackIndex >= 0);
      
      if (needsVideoTrack) {
        // Video track goes at the insertion index
        insertions.push({
          insertionIndex: dropState.insertionIndex,
          trackType: 'video',
        });
      }
      
      if (needsAudioTrack) {
        let audioInsertIndex: number;
        
        if (needsVideoTrack) {
          // Video with audio - calculate mirrored audio track position
          // The audio track should mirror the video track position
          const videoTracks = tracks.filter(t => t.type === 'video');
          const audioTracks = tracks.filter(t => t.type === 'audio');
          const firstAudioIndex = tracks.findIndex(t => t.type === 'audio');
          
          if (firstAudioIndex === -1 || audioTracks.length === 0) {
            // No audio tracks yet - insert after all video tracks
            const lastVideoIndex = tracks.findIndex(t => t.type === 'audio') - 1;
            audioInsertIndex = lastVideoIndex >= 0 ? lastVideoIndex + 1 : tracks.length;
          } else {
            // Calculate mirrored position
            // Count how many video tracks will be before this one after insertion
            let videoCountBefore = 0;
            for (let i = 0; i < dropState.insertionIndex && i < tracks.length; i++) {
              if (tracks[i].type === 'video') {
                videoCountBefore++;
              }
            }
            
            // After insertion, this will be video track #videoCountBefore
            // In mirrored system: video position from middle = (totalVideos - 1) - videoCountBefore
            // Audio position from middle should be same
            const totalVideosAfterInsert = videoTracks.length + 1;
            const videoPositionFromMiddle = (totalVideosAfterInsert - 1) - videoCountBefore;
            
            // Audio track at same position from middle
            const audioPositionFromMiddle = videoPositionFromMiddle;
            
            // Find the insertion index in audio section
            let audioCount = 0;
            audioInsertIndex = firstAudioIndex + audioPositionFromMiddle;
          }
        } else {
          // Pure audio - goes at insertion index
          audioInsertIndex = dropState.insertionIndex;
        }
        
        insertions.push({
          insertionIndex: audioInsertIndex,
          trackType: 'audio',
        });
      }
      
      if (insertions.length > 0) {
        useVideoEditorStore.getState().setTrackInsertionIndicator({
          insertions,
        });
      } else {
        useVideoEditorStore.getState().setTrackInsertionIndicator(null);
      }
    } else {
      useVideoEditorStore.getState().setTrackInsertionIndicator(null);
    }
    
    // Store last valid drop data for outside-timeline drops
    if (dropState.isValidDrop) {
      const dragData = getCurrentDrag();
      lastValidDropRef.current = {
        itemType: dropState.itemType || 'video',
        trackIndex: dropState.primaryTrackIndex,
        startTime: dropState.startTime,
        duration: dropState.duration,
        audioTrackIndex: dropState.audioTrackIndex,
        itemData: {
          duration: dropState.duration,
          label: dropState.itemLabel,
          data: dragData,
          thumbnailUrl: dropState.thumbnailUrl,
        },
      };
    }
  }, [calculateDropPosition, totalDuration, tracks]);

  /**
   * Handle drag over event - queues update for RAF processing
   */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    
    // Check for valid drag data
    const types = Array.from(e.dataTransfer.types);
    const hasJsonType = types.includes('application/json');
    
    // Also check for video-editor-store drag state as fallback
    const storeDragData = getCurrentDrag();
    const hasStoreDrag = storeDragData && storeDragData.type === 'media';
    
    if (!hasJsonType && !hasStoreDrag) {
      return;
    }
    
    // Store pending update data
    pendingDropStateRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      dataTransfer: hasJsonType ? e.dataTransfer : null,
    };
    
    // Schedule RAF if not already scheduled
    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(() => {
        processDragUpdate();
        rafIdRef.current = null;
      });
    }
  }, [processDragUpdate]);

  /**
   * Handle drop event - places item on timeline
   */
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    
    const dropState = calculateDropPosition(e.clientX, e.clientY, e.dataTransfer);
    
    // Clear ghost elements and indicators
    useVideoEditorStore.getState().setGhostElements(null);
    useVideoEditorStore.getState().setSnapLine(null);
    useVideoEditorStore.getState().setTrackInsertionIndicator(null);
    
    if (!dropState || !dropState.isValidDrop) {
      lastValidDropRef.current = null;
      lastUpdateRef.current = null;
      endDrag();
      return;
    }
    
    // Extract full item data from dataTransfer - this contains the complete media object
    // The dataTransfer has { isNewItem, type, label, duration, data: item } where item
    // is the full media object with _source, src, _isLocalMedia, etc.
    let fullItemData: any = null;
    try {
      const jsonData = e.dataTransfer.getData('application/json');
      if (jsonData) {
        const parsed = JSON.parse(jsonData);
        fullItemData = parsed.data; // The full media item object
      }
    } catch (err) {
      console.warn('[useMediaDrop] handleDrop: Failed to parse dataTransfer JSON:', err);
    }
    
    // Fallback to getCurrentDrag if dataTransfer parsing failed
    if (!fullItemData) {
      const dragData = getCurrentDrag();
      fullItemData = dragData;
    }
    
    // Handle track insertion if needed
    let targetTrackIndex = dropState.primaryTrackIndex;
    let audioTargetTrackIndex = dropState.audioTrackIndex;
    
    if (dropState.insertionIndex !== null && onInsertTrack) {
      // Determine which tracks need to be created
      const needsVideoTrack = !isAudioTrackItem(dropState.itemType);
      const needsAudioTrack = isAudioTrackItem(dropState.itemType) || 
                             (dropState.itemType === 'video' && dropState.audioTrackIndex >= 0);
      
      // Insert video track first if needed
      if (needsVideoTrack) {
        onInsertTrack(dropState.insertionIndex, 'video');
        targetTrackIndex = dropState.insertionIndex;
      }
      
      // Insert audio track if needed
      if (needsAudioTrack) {
        let audioInsertIndex: number;
        
        if (needsVideoTrack) {
          // Video with audio - calculate mirrored audio position
          const videoTracks = tracks.filter(t => t.type === 'video');
          const audioTracks = tracks.filter(t => t.type === 'audio');
          const firstAudioIndex = tracks.findIndex(t => t.type === 'audio');
          
          if (firstAudioIndex === -1 || audioTracks.length === 0) {
            // No audio tracks yet - insert after all video tracks (which now includes the new one)
            audioInsertIndex = dropState.insertionIndex + 1;
          } else {
            // Calculate mirrored position
            let videoCountBefore = 0;
            for (let i = 0; i < dropState.insertionIndex && i < tracks.length; i++) {
              if (tracks[i].type === 'video') {
                videoCountBefore++;
              }
            }
            
            const totalVideosAfterInsert = videoTracks.length + 1;
            const videoPositionFromMiddle = (totalVideosAfterInsert - 1) - videoCountBefore;
            audioInsertIndex = firstAudioIndex + videoPositionFromMiddle;
          }
          
          onInsertTrack(audioInsertIndex, 'audio');
          audioTargetTrackIndex = audioInsertIndex;
        } else {
          // Pure audio - goes at insertion index
          audioInsertIndex = dropState.insertionIndex;
          onInsertTrack(audioInsertIndex, 'audio');
          targetTrackIndex = audioInsertIndex;
        }
      }
    }
    
    // Call drop handler
    if (onDrop && dropState.itemType) {
      onDrop(
        dropState.itemType,
        targetTrackIndex,
        dropState.startTime,
        {
          duration: dropState.duration,
          label: fullItemData?.name || fullItemData?._sourceDisplayName,
          data: fullItemData,
          audioTrackIndex: audioTargetTrackIndex >= 0 ? audioTargetTrackIndex : undefined,
        }
      );
    }
    
    // Clean up
    lastValidDropRef.current = null;
    lastUpdateRef.current = null;
    endDrag();
  }, [calculateDropPosition, onDrop, onInsertTrack]);

  /**
   * Handle drag leave - keep ghost at last valid position (Premiere Pro behavior)
   */
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Don't clear ghost - keep it visible at last position
    // This allows dropping outside timeline to use last valid position
  }, []);

  /**
   * Handle drag end - clean up state
   */
  const handleDragEnd = useCallback(() => {
    useVideoEditorStore.getState().setGhostElements(null);
    useVideoEditorStore.getState().setSnapLine(null);
    useVideoEditorStore.getState().setTrackInsertionIndicator(null);
    lastValidDropRef.current = null;
    lastUpdateRef.current = null;
  }, []);

  /**
   * Handle drop outside timeline - uses last valid position
   */
  const handleDropOutside = useCallback(() => {
    const lastValid = lastValidDropRef.current;
    
    // Clear ghost elements and snap line
    useVideoEditorStore.getState().setGhostElements(null);
    useVideoEditorStore.getState().setSnapLine(null);
    useVideoEditorStore.getState().setTrackInsertionIndicator(null);
    
    if (!lastValid || !onDrop) {
      lastValidDropRef.current = null;
      lastUpdateRef.current = null;
      endDrag();
      return;
    }
    
    // Drop at last valid position
    onDrop(
      lastValid.itemType,
      lastValid.trackIndex,
      lastValid.startTime,
      {
        duration: lastValid.duration,
        data: lastValid.itemData?.data,
        audioTrackIndex: lastValid.audioTrackIndex >= 0 ? lastValid.audioTrackIndex : undefined,
      }
    );
    
    // Clean up
    lastValidDropRef.current = null;
    lastUpdateRef.current = null;
    endDrag();
  }, [onDrop]);

  /**
   * Clear all drag state
   */
  const clearDragState = useCallback(() => {
    useVideoEditorStore.getState().setGhostElements(null);
    useVideoEditorStore.getState().setSnapLine(null);
    useVideoEditorStore.getState().setTrackInsertionIndicator(null);
    lastValidDropRef.current = null;
    lastUpdateRef.current = null;
  }, []);

  /**
   * Get current drop state for rendering
   */
  const getDropState = useCallback((): MediaDropState | null => {
    const dragData = getCurrentDrag();
    if (!dragData || dragData.type !== 'media') return null;
    
    const lastValid = lastValidDropRef.current;
    if (!lastValid) return null;
    
    return {
      isDragging: true,
      itemType: lastValid.itemType,
      startTime: lastValid.startTime,
      duration: lastValid.duration,
      primaryTrackIndex: lastValid.trackIndex,
      audioTrackIndex: lastValid.audioTrackIndex,
      isValidDrop: true,
      snappedTime: null,
      snappedToTrackIndex: -1,
      insertionIndex: null,
    };
  }, []);

  /**
   * Get last valid drop position for global drop handler
   */
  const getLastValidDrop = useCallback(() => lastValidDropRef.current, []);

  /**
   * Process drag update with specific coordinates (for external/clamped positions)
   * Used when mouse is outside timeline bounds but we want to update ghost position
   */
  const processDragAtPosition = useCallback((clientX: number, clientY: number, dataTransfer?: DataTransfer | null, isClamped: boolean = true, hideGhost: boolean = false) => {
    pendingDropStateRef.current = {
      clientX,
      clientY,
      dataTransfer: dataTransfer || null,
      isClamped, // Track whether this is a clamped position
      hideGhost, // Track whether to hide the ghost preview
    };
    
    // Process immediately (don't wait for RAF)
    processDragUpdate();
  }, [processDragUpdate]);

  /**
   * Process drop at specific coordinates (for external/clamped positions)
   * Uses stored drag data since dataTransfer may not be accessible outside timeline
   */
  const processDropAtPosition = useCallback((clientX: number, clientY: number, dataTransfer?: DataTransfer | null, isClamped: boolean = true) => {
    const dropState = calculateDropPosition(clientX, clientY, dataTransfer, isClamped);
    
    // Clear ghost elements and indicators
    useVideoEditorStore.getState().setGhostElements(null);
    useVideoEditorStore.getState().setSnapLine(null);
    useVideoEditorStore.getState().setTrackInsertionIndicator(null);

    if (!dropState || !dropState.isValidDrop) {
      lastValidDropRef.current = null;
      lastUpdateRef.current = null;
      endDrag();
      return;
    }
    
    // Get full item data from store (most reliable source)
    let fullItemData: any = getCurrentDrag();
    
    // Try dataTransfer as secondary source if available
    if (!fullItemData && dataTransfer) {
      try {
        const jsonData = dataTransfer.getData('application/json');
        if (jsonData) {
          const parsed = JSON.parse(jsonData);
          fullItemData = parsed.data || parsed;
        }
      } catch (err) {
        console.warn('[useMediaDrop] processDropAtPosition: Failed to parse dataTransfer JSON:', err);
      }
    }
    
    // Tertiary fallback: use lastValidDropRef if it exists
    if (!fullItemData && lastValidDropRef.current?.itemData?.data) {
      fullItemData = lastValidDropRef.current.itemData.data;
    }
    
    if (!fullItemData) {
      console.warn('[useMediaDrop] processDropAtPosition: No item data available');
      lastValidDropRef.current = null;
      lastUpdateRef.current = null;
      endDrag();
      return;
    }
    
    // Handle track insertion if needed
    let targetTrackIndex = dropState.primaryTrackIndex;
    let audioTargetTrackIndex = dropState.audioTrackIndex;
    
    if (dropState.insertionIndex !== null && onInsertTrack) {
      // Determine which tracks need to be created
      const needsVideoTrack = !isAudioTrackItem(dropState.itemType);
      const needsAudioTrack = isAudioTrackItem(dropState.itemType) || 
                             (dropState.itemType === 'video' && dropState.audioTrackIndex >= 0);
      
      // Insert video track first if needed
      if (needsVideoTrack) {
        onInsertTrack(dropState.insertionIndex, 'video');
        targetTrackIndex = dropState.insertionIndex;
      }
      
      // Insert audio track if needed
      if (needsAudioTrack) {
        let audioInsertIndex: number;
        
        if (needsVideoTrack) {
          // Video with audio - calculate mirrored audio position
          const videoTracks = tracks.filter(t => t.type === 'video');
          const audioTracks = tracks.filter(t => t.type === 'audio');
          const firstAudioIndex = tracks.findIndex(t => t.type === 'audio');
          
          if (firstAudioIndex === -1 || audioTracks.length === 0) {
            // No audio tracks yet - insert after all video tracks (which now includes the new one)
            audioInsertIndex = dropState.insertionIndex + 1;
          } else {
            // Calculate mirrored position
            let videoCountBefore = 0;
            for (let i = 0; i < dropState.insertionIndex && i < tracks.length; i++) {
              if (tracks[i].type === 'video') {
                videoCountBefore++;
              }
            }
            
            const totalVideosAfterInsert = videoTracks.length + 1;
            const videoPositionFromMiddle = (totalVideosAfterInsert - 1) - videoCountBefore;
            audioInsertIndex = firstAudioIndex + videoPositionFromMiddle;
          }
          
          onInsertTrack(audioInsertIndex, 'audio');
          audioTargetTrackIndex = audioInsertIndex;
        } else {
          // Pure audio - goes at insertion index
          audioInsertIndex = dropState.insertionIndex;
          onInsertTrack(audioInsertIndex, 'audio');
          targetTrackIndex = audioInsertIndex;
        }
      }
    }
    
    // Place the item
    onDrop(
      dropState.itemType || 'video',
      targetTrackIndex,
      dropState.startTime,
      {
        duration: dropState.duration,
        data: fullItemData,
        audioTrackIndex: audioTargetTrackIndex >= 0 ? audioTargetTrackIndex : undefined,
      }
    );
    
    // Clean up
    lastValidDropRef.current = null;
    lastUpdateRef.current = null;
    endDrag();
  }, [calculateDropPosition, onDrop, onInsertTrack]);

  return {
    handleDragOver,
    handleDrop,
    handleDragLeave,
    handleDragEnd,
    handleDropOutside,
    clearDragState,
    getDropState,
    getLastValidDrop,
    processDragAtPosition,
    processDropAtPosition,
  };
};

export default useMediaDrop;
