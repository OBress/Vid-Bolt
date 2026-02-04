/**
 * useTimelineHistory - V2 Undo/Redo Hook
 * 
 * Provides undo/redo capabilities using the video-editor-store's
 * built-in history management.
 */

import { useCallback, useEffect } from 'react';
import { useVideoEditorStore } from '../../../stores/video-editor-store';

export function useTimelineHistory(updatePresentHistoryRef?: React.MutableRefObject<(() => void) | undefined>) {
  // Get store actions directly
  const undo = useVideoEditorStore(state => state.undo);
  const redo = useVideoEditorStore(state => state.redo);
  const canUndo = useVideoEditorStore(state => state.canUndo);
  const canRedo = useVideoEditorStore(state => state.canRedo);
  const saveToHistory = useVideoEditorStore(state => state.saveToHistory);

  // Wrapper for manual snapshots
  const saveSnapshot = useCallback(() => {
    saveToHistory();
  }, [saveToHistory]);

  // Update the present history ref if provided
  useEffect(() => {
    if (updatePresentHistoryRef) {
      updatePresentHistoryRef.current = saveSnapshot;
    }
  }, [saveSnapshot, updatePresentHistoryRef]);

  return {
    undo,
    redo,
    canUndo: canUndo(),
    canRedo: canRedo(),
    saveSnapshot,
  };
}

export default useTimelineHistory;
