/**
 * useTimelineTracks - V2 Architecture Hook
 * 
 * This hook provides:
 * - Denormalized tracks (with embedded clips) via memoized computation
 * - All track/clip mutation handlers that delegate to the V2 store
 * 
 * Architecture:
 * - Store keeps normalized data (tracks[] + clips[])
 * - This hook provides denormalized view (tracks with items[]) for UI
 * - All mutations go directly to the store
 */

import { useCallback, useEffect, useMemo } from 'react';
import { 
  useVideoEditorStore,
  computeLinkGroup,
  shallow,
  selectTracksArray,
  selectClipsArray,
  type TrackWithClips,
} from '../../../stores/video-editor-store';
import { useShallow } from 'zustand/react/shallow';
import type { TimelineClip, TimelineTrack } from '../../../types/timeline-v2';
import type { TimelineItem } from '../types';

interface UseTimelineTracksProps {
  initialTracks?: TrackWithClips[];
  autoRemoveEmptyTracks?: boolean;
  onTracksChange?: (tracks: TrackWithClips[]) => void;
  selectedClipIds?: string[];
  selectedItemIds?: string[];
  onSelectedClipsChange?: (clipIds: string[]) => void;
  onSelectedItemsChange?: (itemIds: string[]) => void;
}

interface UseTimelineTracksReturn {
  // Denormalized tracks (with embedded items) for UI rendering
  tracks: TrackWithClips[];
  
  // Track handlers
  handleAddTrack: (type: 'video' | 'audio') => string;
  handleDeleteTrack: (trackId: string) => void;
  handleTrackReorder: (trackIds: string[]) => void;
  handleToggleLock: (trackId: string) => void;
  handleToggleVisibility: (trackId: string) => void;
  handleToggleMute: (trackId: string) => void;
  handleInsertTrackAt: (index: number, trackType: 'video' | 'audio') => string;
  handleInsertMultipleTracksAt: (index: number, trackTypes: Array<'video' | 'audio'>) => string[];
  handleCreateTracksWithItems: (params: any) => void;
  
  // Clip handlers (using "Item" naming for UI compatibility)
  handleItemMove: (itemId: string, newStart: number, newEnd: number, newTrackId: string) => void;
  handleItemResize: (itemId: string, newStart: number, newEnd: number) => void;
  handleItemsDelete: (itemIds: string[]) => void;
  handleCloseGap: (trackId: string, gapStart: number) => void;
  addNewItem: (itemData: any, currentFrame: number, fps: number) => any;
  
  // For components that need to set tracks directly
  setTracks: (tracks: TrackWithClips[]) => void;
}

export function useTimelineTracks({
  onTracksChange,
  selectedClipIds = [],
  onSelectedClipsChange,
}: UseTimelineTracksProps = {}): UseTimelineTracksReturn {
  // Get raw store data for handlers (shallow comparison for stable references)
  const storeTracks = useVideoEditorStore(useShallow(selectTracksArray));
  const storeClips = useVideoEditorStore(useShallow(selectClipsArray));
  const storeTransitions = useVideoEditorStore(state => state.transitions);
  
  // Pre-compute a map of clipId -> transitions: O(M) once, instead of O(N×M) per render
  const transitionsByClip = useMemo(() => {
    const map = new Map<string, { inTransition?: any; outTransition?: any }>();
    if (!storeTransitions) return map;

    Object.values(storeTransitions).forEach((t: any) => {
      const clipIds = t.clipIds;
      if (t.position === 'between') {
        // Between transition: first clip gets 'out', second clip gets 'in'
        if (clipIds[0]) {
          const existing = map.get(clipIds[0]) || {};
          existing.outTransition = t;
          map.set(clipIds[0], existing);
        }
        if (clipIds[1]) {
          const existing = map.get(clipIds[1]) || {};
          existing.inTransition = t;
          map.set(clipIds[1], existing);
        }
      } else {
        // Standalone transition
        if (clipIds[0]) {
          const existing = map.get(clipIds[0]) || {};
          if (t.position === 'in') {
            existing.inTransition = t;
          } else if (t.position === 'out') {
            existing.outTransition = t;
          }
          map.set(clipIds[0], existing);
        }
      }
    });

    return map;
  }, [storeTransitions]);

  // O(1) lookup per clip from the pre-computed map
  const getClipTransitions = useCallback((clipId: string) => {
    return transitionsByClip.get(clipId) || { inTransition: undefined, outTransition: undefined };
  }, [transitionsByClip]);
  
  // Compute denormalized tracks using useMemo to avoid infinite re-renders
  // This replaces the direct use of selectTracksWithClips which created new objects each call
  const tracks = useMemo<TrackWithClips[]>(() => {
    return storeTracks.map(track => {
      const trackClips = storeClips.filter(clip => clip.trackId === track.id);
      const items: TimelineItem[] = trackClips.map(clip => {
        const linkGroup = computeLinkGroup(clip.id, clip.linkedClipId);
        
        // Get transition entities for this clip
        const { inTransition, outTransition } = getClipTransitions(clip.id);
        
        return {
          id: clip.id,
          start: clip.startTime,
          end: clip.startTime + clip.duration,
          type: clip.type,
          label: clip.label,
          color: clip.color,
          data: {
            ...clip.data,
            sourceId: clip.sourceId,
            transform: clip.transform,
            text: clip.text,
            linkedClipId: clip.linkedClipId,
            thumbnailUrl: clip.thumbnailUrl,
          },
          mediaStart: clip.media?.mediaStartTime,
          mediaDuration: clip.media?.mediaDuration,
          mediaSrcDuration: clip.media?.mediaDuration,
          speed: clip.media?.speed,
          linkGroup,
          linkedItemId: clip.linkedClipId,
          transitions: clip.transitions,
          // TransitionEntity objects with startTime/endTime
          inTransition: inTransition as any,
          outTransition: outTransition as any,
        };
      });
      
      return { ...track, items };
    });
  }, [storeTracks, storeClips, getClipTransitions]);
  
  // Get store actions via getState() to avoid subscribing to all state changes
  // This ensures stable action references and prevents stale closure issues
  const getActions = useCallback(() => useVideoEditorStore.getState(), []);

  // Notify parent of track changes
  useEffect(() => {
    if (onTracksChange) {
      onTracksChange(tracks);
    }
  }, [tracks, onTracksChange]);

  // === TRACK HANDLERS ===
  // All handlers use getActions() to get fresh store actions without subscribing to state
  
  const handleAddTrack = useCallback((type: 'video' | 'audio') => {
    return getActions().addTrack(type);
  }, [getActions]);

  const handleDeleteTrack = useCallback((trackId: string) => {
    getActions().deleteTrack(trackId, true); // true = also delete clips on track
  }, [getActions]);

  const handleTrackReorder = useCallback((trackIds: string[]) => {
    getActions().reorderTracks(trackIds);
  }, [getActions]);

  const handleToggleLock = useCallback((trackId: string) => {
    getActions().toggleTrackLock(trackId);
  }, [getActions]);

  const handleToggleVisibility = useCallback((trackId: string) => {
    getActions().toggleTrackVisibility(trackId);
  }, [getActions]);

  const handleToggleMute = useCallback((trackId: string) => {
    getActions().toggleTrackMute(trackId);
  }, [getActions]);

  const handleInsertTrackAt = useCallback((index: number, trackType: 'video' | 'audio') => {
    return getActions().addTrack(trackType, { order: index });
  }, [getActions]);

  const handleInsertMultipleTracksAt = useCallback((
    index: number, 
    trackTypes: Array<'video' | 'audio'>
  ) => {
    const { addTrack } = getActions();
    return trackTypes.map((type, i) => addTrack(type, { order: index + i }));
  }, [getActions]);

  const handleCreateTracksWithItems = useCallback((params: {
    items: Array<{
      type: string;
      trackType: 'video' | 'audio';
      startTime: number;
      duration: number;
      data: any;
    }>;
  }) => {
    const { addTrack, addClip } = getActions();
    params.items.forEach(item => {
      const trackId = addTrack(item.trackType);
      addClip({
        trackId,
        startTime: item.startTime,
        duration: item.duration,
        type: item.type as any,
        sourceId: item.data?.src || item.data?.sourceId || '',
        data: item.data,
        transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0 },
      });
    });
  }, [getActions]);

  // === CLIP/ITEM HANDLERS ===

  const handleItemMove = useCallback((
    itemId: string, 
    newStart: number, 
    newEnd: number, 
    newTrackId: string
  ) => {
    getActions().updateClip(itemId, {
      startTime: newStart,
      duration: newEnd - newStart,
      trackId: newTrackId,
    });
  }, [getActions]);

  const handleItemResize = useCallback((
    itemId: string,
    newStart: number,
    newEnd: number
  ) => {
    getActions().updateClip(itemId, {
      startTime: newStart,
      duration: newEnd - newStart,
    });
  }, [getActions]);

  const handleItemsDelete = useCallback((itemIds: string[]) => {
    console.log('[useTimelineTracks] handleItemsDelete called with:', itemIds);
    getActions().deleteClips(itemIds);
    
    // Clear selection for deleted items
    if (onSelectedClipsChange) {
      const remainingSelection = selectedClipIds.filter(id => !itemIds.includes(id));
      if (remainingSelection.length !== selectedClipIds.length) {
        onSelectedClipsChange(remainingSelection);
      }
    }
  }, [getActions, selectedClipIds, onSelectedClipsChange]);

  const handleCloseGap = useCallback((trackId: string, gapStart: number) => {
    const { updateClip } = getActions();
    const allClips = storeClips;
    const trackClips = allClips
      .filter(c => c.trackId === trackId)
      .sort((a, b) => a.startTime - b.startTime);

    const clipsToShift = trackClips.filter(c => c.startTime >= gapStart);
    if (clipsToShift.length === 0) return;

    const previousClip = trackClips.find(c => c.startTime + c.duration <= gapStart);
    const targetStart = previousClip ? previousClip.startTime + previousClip.duration : 0;
    const gapSize = gapStart - targetStart;

    clipsToShift.forEach(clip => {
      updateClip(clip.id, { startTime: clip.startTime - gapSize });
    });
  }, [getActions, storeClips]);

  const addNewItem = useCallback((
    itemData: {
      type: string;
      label?: string;
      duration?: number;
      color?: string;
      data?: any;
      preferredTrackId?: string;
      preferredStartTime?: number;
    },
    currentFrame: number,
    fps: number
  ) => {
    const { addTrack, addClip } = getActions();
    const currentTime = currentFrame / fps;
    const duration = itemData.duration || 5;
    
    let trackId = itemData.preferredTrackId;
    if (!trackId) {
      const trackType = itemData.type === 'audio' ? 'audio' : 'video';
      const existingTrack = storeTracks.find((t: TimelineTrack) => t.type === trackType && !t.locked);
      trackId = existingTrack?.id || addTrack(trackType);
    }

    const startTime = itemData.preferredStartTime ?? currentTime;
    
    const clipId = addClip({
      trackId,
      startTime,
      duration,
      type: (itemData.type || 'video') as any,
      sourceId: itemData.data?.src || itemData.data?.sourceId || '',
      label: itemData.label,
      color: itemData.color,
      data: itemData.data,
      transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0 },
    });

    return {
      id: clipId,
      trackId,
      start: startTime,
      end: startTime + duration,
    };
  }, [getActions, storeTracks]);

  // Set tracks from denormalized format (for undo/redo compatibility)
  const setTracks = useCallback((newTracks: TrackWithClips[]) => {
    const { setTracks: setStoreTracks, setClips: setStoreClips } = getActions();
    
    // Extract normalized tracks (without items)
    const normalizedTracks = newTracks.map(({ items, ...track }) => track);
    
    // Extract all clips from tracks
    const allClips: TimelineClip[] = newTracks.flatMap(track =>
      track.items.map(item => ({
        id: item.id,
        trackId: track.id,
        startTime: item.start,
        duration: item.end - item.start,
        type: (item.type as TimelineClip['type']) || 'video',
        sourceId: item.data?.sourceId || item.data?.src || '',
        label: item.label,
        color: item.color,
        data: item.data,
        transform: item.data?.transform || { x: 0, y: 0, width: 100, height: 100, rotation: 0 },
        media: item.mediaStart !== undefined ? {
          mediaStartTime: item.mediaStart || 0,
          mediaDuration: item.mediaSrcDuration || item.mediaDuration || (item.end - item.start),
          speed: item.speed || 1,
        } : undefined,
        text: item.data?.text,
        linkedClipId: item.linkedItemId || item.data?.linkedClipId,
        thumbnailUrl: item.data?.thumbnailUrl,
        transitions: item.transitions,
      }))
    );
    
    setStoreTracks(normalizedTracks);
    setStoreClips(allClips);
  }, [getActions]);

  return {
    tracks,
    handleAddTrack,
    handleDeleteTrack,
    handleTrackReorder,
    handleToggleLock,
    handleToggleVisibility,
    handleToggleMute,
    handleInsertTrackAt,
    handleInsertMultipleTracksAt,
    handleCreateTracksWithItems,
    handleItemMove,
    handleItemResize,
    handleItemsDelete,
    handleCloseGap,
    addNewItem,
    setTracks,
  };
}

export default useTimelineTracks;
