/**
 * useTimelineHistory - V2 Undo/Redo Hook
 * 
 * Provides undo/redo capabilities powered by zundo temporal middleware.
 * History is auto-tracked — no manual saveToHistory/saveSnapshot needed.
 */

import { useCallback, useEffect } from 'react';
import { useVideoEditorStore } from '../../../stores/video-editor-store';

export function useTimelineHistory(updatePresentHistoryRef?: React.MutableRefObject<(() => void) | undefined>) {
  // Get thin wrapper actions from the main store (they delegate to temporal store)
  const undo = useVideoEditorStore(state => state.undo);
  const redo = useVideoEditorStore(state => state.redo);
  const canUndo = useVideoEditorStore(state => state.canUndo);
  const canRedo = useVideoEditorStore(state => state.canRedo);

  // saveSnapshot is now a no-op — zundo tracks all set() calls automatically
  const saveSnapshot = useCallback(() => {
    // No-op: zundo temporal middleware auto-records state changes
  }, []);

  // Update the present history ref if provided (backward compat)
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
