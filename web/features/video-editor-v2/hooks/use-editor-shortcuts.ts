import { useEffect, useCallback } from 'react';
import { useVideoEditorStore } from '../stores/video-editor-store';
import { getNearestKeyframeTime } from '../utils/keyframe-interpolator';

/**
 * Global editor keyboard shortcuts
 * 
 * Provides consistent keyboard shortcuts across the editor:
 * - Undo/Redo (Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y)
 * - Keyframe shortcuts (K, J, Shift+J, Delete on selected keyframes)
 * 
 * This hook should be used at the editor level.
 */
export function useEditorShortcuts() {
  const undo = useVideoEditorStore(state => state.undo);
  const redo = useVideoEditorStore(state => state.redo);
  const canUndo = useVideoEditorStore(state => state.canUndo);
  const canRedo = useVideoEditorStore(state => state.canRedo);
  
  // Keyframe-related state and actions
  const clips = useVideoEditorStore(state => state.clips);
  const selection = useVideoEditorStore(state => state.selection);
  const playback = useVideoEditorStore(state => state.playback);
  const keyframeSelection = useVideoEditorStore(state => state.keyframeSelection);
  const setCurrentTime = useVideoEditorStore(state => state.setCurrentTime);
  const addKeyframe = useVideoEditorStore(state => state.addKeyframe);
  const deleteKeyframe = useVideoEditorStore(state => state.deleteKeyframe);
  const deleteKeyframes = useVideoEditorStore(state => state.deleteKeyframes);
  const clearKeyframeSelection = useVideoEditorStore(state => state.clearKeyframeSelection);
  const getPropertyKeyframes = useVideoEditorStore(state => state.getPropertyKeyframes);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't trigger shortcuts when typing in inputs
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      (e.target as HTMLElement).isContentEditable
    ) {
      return;
    }

    // Ctrl/Cmd + Z = Undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      if (canUndo()) {
        undo();
      }
      return;
    }

    // Ctrl/Cmd + Shift + Z = Redo (standard on Mac and some apps)
    // Ctrl/Cmd + Y = Redo (standard on Windows)
    if (
      ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') ||
      ((e.ctrlKey || e.metaKey) && e.key === 'y')
    ) {
      e.preventDefault();
      if (canRedo()) {
        redo();
      }
      return;
    }
    
    // ========================================
    // KEYFRAME SHORTCUTS
    // ========================================
    
    // Get selected clip for keyframe operations
    const selectedClipId = selection?.clipIds?.[0];
    const selectedClip = selectedClipId 
      ? clips.find(c => c.id === selectedClipId) 
      : null;
    
    // K = Add keyframe at current time (for selected property or all animated)
    if (e.key === 'k' || e.key === 'K') {
      e.preventDefault();
      
      if (keyframeSelection && selectedClip) {
        // Add keyframe for the selected property
        const currentTime = playback.currentTime - selectedClip.startTime;
        const propKf = getPropertyKeyframes(selectedClip.id, keyframeSelection.propertyPath);
        
        // Get current value from clip
        let currentValue: number | number[] | string = 0;
        if (keyframeSelection.propertyPath === 'transform.x') currentValue = selectedClip.transform?.x ?? 0;
        else if (keyframeSelection.propertyPath === 'transform.y') currentValue = selectedClip.transform?.y ?? 0;
        else if (keyframeSelection.propertyPath === 'transform.width') currentValue = selectedClip.transform?.width ?? 100;
        else if (keyframeSelection.propertyPath === 'transform.height') currentValue = selectedClip.transform?.height ?? 100;
        else if (keyframeSelection.propertyPath === 'transform.rotation') currentValue = selectedClip.transform?.rotation ?? 0;
        else if (keyframeSelection.propertyPath === 'transform.opacity') currentValue = selectedClip.styles?.opacity ?? 1;
        else if (keyframeSelection.propertyPath === 'transform.scale') currentValue = 1;
        
        addKeyframe(selectedClip.id, keyframeSelection.propertyPath, currentTime, currentValue);
      }
      return;
    }
    
    // J = Jump to previous keyframe
    // Shift+J = Jump to next keyframe
    if (e.key === 'j' || e.key === 'J') {
      e.preventDefault();
      
      if (keyframeSelection && selectedClip) {
        const propKf = getPropertyKeyframes(selectedClip.id, keyframeSelection.propertyPath);
        if (!propKf) return;
        
        const currentTime = playback.currentTime - selectedClip.startTime;
        const direction = e.shiftKey ? 'after' : 'before';
        const targetTime = getNearestKeyframeTime(propKf, currentTime, direction);
        
        if (targetTime !== null) {
          setCurrentTime(selectedClip.startTime + targetTime);
        }
      }
      return;
    }
    
    // Delete = Delete selected keyframes
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (keyframeSelection && keyframeSelection.keyframeIds.length > 0) {
        e.preventDefault();
        deleteKeyframes(
          keyframeSelection.clipId,
          keyframeSelection.propertyPath,
          keyframeSelection.keyframeIds
        );
        clearKeyframeSelection();
        return;
      }
      // Don't return here - let other handlers (timeline shortcuts) handle
      // deletion of clips/transitions when no keyframes are selected
    }
    
    // Escape = Clear keyframe selection
    if (e.key === 'Escape') {
      if (keyframeSelection) {
        e.preventDefault();
        clearKeyframeSelection();
      }
      return;
    }
    
  }, [
    undo, 
    redo, 
    canUndo, 
    canRedo, 
    clips, 
    selection, 
    playback, 
    keyframeSelection,
    setCurrentTime,
    addKeyframe,
    deleteKeyframes,
    clearKeyframeSelection,
    getPropertyKeyframes,
  ]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return { 
    undo, 
    redo, 
    canUndo: canUndo(), 
    canRedo: canRedo(),
  };
}
