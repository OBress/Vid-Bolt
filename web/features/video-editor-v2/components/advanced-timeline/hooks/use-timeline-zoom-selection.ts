import { useState, useCallback, useRef, useEffect } from 'react';

export interface ZoomSelectionState {
  isSelecting: boolean;
  startTime: number;
  endTime: number;
  startX: number;
  currentX: number;
}

interface UseTimelineZoomSelectionOptions {
  totalDuration: number;
  zoomScale: number;
  onZoomToRange?: (startTime: number, endTime: number) => void;
  minSelectionDuration?: number; // Minimum duration in seconds to trigger zoom
}

/**
 * Hook for handling click-and-drag zoom selection on the timeline ruler.
 * Similar to Premiere Pro's work area / zoom selection feature.
 */
export const useTimelineZoomSelection = ({
  totalDuration,
  zoomScale,
  onZoomToRange,
  minSelectionDuration = 0.1, // Minimum 100ms selection to trigger zoom
}: UseTimelineZoomSelectionOptions) => {
  const [selectionState, setSelectionState] = useState<ZoomSelectionState | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);
  const startTimeRef = useRef<number>(0);
  const onZoomToRangeRef = useRef(onZoomToRange);
  
  // Keep ref in sync
  useEffect(() => {
    onZoomToRangeRef.current = onZoomToRange;
  }, [onZoomToRange]);

  const getTimeFromMouseX = useCallback((clientX: number, container: HTMLElement): number => {
    const rect = container.getBoundingClientRect();
    
    // Virtual scroll: content positioned via CSS transforms (no native scroll)
    // getBoundingClientRect() returns the transformed position, so direct calculation works
    const relativeX = clientX - rect.left;
    
    // Calculate percentage based on full container width
    const fullWidth = container.scrollWidth || rect.width;
    const percentage = Math.max(0, Math.min(1, relativeX / fullWidth));
    
    return percentage * totalDuration;
  }, [totalDuration]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLElement>, container: HTMLElement) => {
    // Only handle left mouse button
    if (e.button !== 0) return;
    
    // Check if Shift key is held (required for zoom selection)
    if (!e.shiftKey) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    containerRef.current = container;
    
    const startTime = getTimeFromMouseX(e.clientX, container);
    startTimeRef.current = startTime;
    
    setSelectionState({
      isSelecting: true,
      startTime,
      endTime: startTime,
      startX: e.clientX,
      currentX: e.clientX,
    });
  }, [getTimeFromMouseX]);

  // Use refs to avoid stale closures in global event handlers
  useEffect(() => {
    if (!selectionState || !selectionState.isSelecting) return;
    
    const container = containerRef.current;
    if (!container) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      
      // Virtual scroll: content positioned via CSS transforms (no native scroll)
      const relativeX = e.clientX - rect.left;
      const fullWidth = container.scrollWidth || rect.width;
      const percentage = Math.max(0, Math.min(1, relativeX / fullWidth));
      const currentTime = percentage * totalDuration;
      
      setSelectionState(prev => {
        if (!prev) return null;
        return {
          ...prev,
          endTime: currentTime,
          currentX: e.clientX,
        };
      });
    };

    const handleMouseUp = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      
      // Virtual scroll: content positioned via CSS transforms (no native scroll)
      const relativeX = e.clientX - rect.left;
      const fullWidth = container.scrollWidth || rect.width;
      const percentage = Math.max(0, Math.min(1, relativeX / fullWidth));
      const endTime = percentage * totalDuration;
      
      // Calculate the actual selection range
      const rangeStart = Math.min(startTimeRef.current, endTime);
      const rangeEnd = Math.max(startTimeRef.current, endTime);
      const selectionDuration = rangeEnd - rangeStart;
      
      // Only trigger zoom if selection duration is greater than minimum
      if (selectionDuration >= minSelectionDuration) {
        onZoomToRangeRef.current?.(rangeStart, rangeEnd);
      }
      
      // Clear selection state
      setSelectionState(null);
      containerRef.current = null;
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [selectionState?.isSelecting, totalDuration, minSelectionDuration]);

  // Calculate selection percentages for rendering
  const getSelectionPercentages = useCallback(() => {
    if (!selectionState) return null;
    
    const startPercent = (Math.min(selectionState.startTime, selectionState.endTime) / totalDuration) * 100;
    const endPercent = (Math.max(selectionState.startTime, selectionState.endTime) / totalDuration) * 100;
    
    return {
      left: startPercent,
      width: endPercent - startPercent,
    };
  }, [selectionState, totalDuration]);

  // Cancel selection (e.g., on Escape key)
  const cancelSelection = useCallback(() => {
    setSelectionState(null);
    containerRef.current = null;
  }, []);

  // Handle Escape key to cancel selection
  useEffect(() => {
    if (!selectionState) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancelSelection();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectionState, cancelSelection]);

  // Check if we're actually dragging (moved more than 5px)
  const isDragging = selectionState 
    ? Math.abs(selectionState.currentX - selectionState.startX) > 5
    : false;

  return {
    isSelecting: !!selectionState && isDragging,
    selectionState,
    handleMouseDown,
    getSelectionPercentages,
    cancelSelection,
    // Expose the normalized selection range for rendering
    selectionRange: selectionState ? {
      startTime: Math.min(selectionState.startTime, selectionState.endTime),
      endTime: Math.max(selectionState.startTime, selectionState.endTime),
    } : null,
  };
};
