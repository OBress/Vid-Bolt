/**
 * useTimelineIntegration - V2 Cleanup Utilities
 * 
 * Provides cleanup functions when clips or tracks are deleted,
 * ensuring transitions and related data are properly cleaned up.
 */

import { useCallback } from 'react';
import { useVideoEditorStore, shallow } from '../../../stores/video-editor-store';

// Props interface maintained for backwards compatibility
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface UseTimelineIntegrationProps {
  tracks?: unknown;
  onTracksChange?: unknown;
  selectedItemIds?: string[];
}

export function useTimelineIntegration(_props?: UseTimelineIntegrationProps) {
  // Get store state and actions
  const transitions = useVideoEditorStore(state => state.transitions);
  const removeTransition = useVideoEditorStore(state => state.removeTransition);
  const clips = useVideoEditorStore(state => state.clips, shallow);

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
    const trackClips = clips.filter(c => c.trackId === trackId);
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
