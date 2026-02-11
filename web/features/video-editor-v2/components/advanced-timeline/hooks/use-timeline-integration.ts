/**
 * useTimelineIntegration - V2 Cleanup Utilities
 * 
 * Provides cleanup functions when clips or tracks are deleted,
 * ensuring transitions and related data are properly cleaned up.
 */

import { useCallback } from 'react';
import { useTypedStore } from '../../../stores/video-editor-store';
import { useShallow } from 'zustand/react/shallow';

// Props interface maintained for backwards compatibility
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface UseTimelineIntegrationProps {
  tracks?: unknown;
  onTracksChange?: unknown;
  selectedItemIds?: string[];
  onSelectedItemsChange?: (itemIds: string[]) => void;
}

export function useTimelineIntegration(_props?: UseTimelineIntegrationProps) {
  // Get store state and actions
  const transitions = useTypedStore(state => state.transitions);
  const removeTransition = useTypedStore(state => state.removeTransition);
  const clips = useTypedStore(state => state.clips);

  // Clean up transitions when a clip/item is deleted
  const handleItemDeleted = useCallback((clipId: string) => {
    Object.values(transitions).forEach(transition => {
      // Remove if this clip is involved in the transition
      if (transition.clipIds.includes(clipId)) {
        removeTransition(transition.id);
      }
    });
  }, [transitions, removeTransition]);

  // Clean up when a track is deleted
  const handleTrackDeleted = useCallback((trackId: string) => {
    // Find clips on this track and clean up their transitions
    const trackClips = Object.values(clips).filter(c => c.trackId === trackId);
    trackClips.forEach(clip => {
      handleItemDeleted(clip.id);
    });
  }, [clips, handleItemDeleted]);

  return {
    handleItemDeleted,
    handleTrackDeleted,
    // Alias for backwards compatibility
    handleClipDeleted: handleItemDeleted,
  };
}

export default useTimelineIntegration;
