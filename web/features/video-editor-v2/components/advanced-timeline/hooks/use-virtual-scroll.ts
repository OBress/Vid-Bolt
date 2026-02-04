/**
 * useVirtualScroll - Virtualized scroll management for the timeline
 * 
 * This hook manages scroll position as pure state (not native browser scroll).
 * Benefits:
 * - Complete isolation from parent scroll events
 * - Better performance for large timelines (only render visible items)
 * - Full control over scroll behavior
 * - Matches professional video editor architecture
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { ZOOM_CONSTRAINTS, VIRTUAL_SCROLL_CONSTANTS } from '../constants';

export interface VirtualScrollState {
  // Horizontal scroll as percentage (0-1 of scrollable range)
  scrollX: number;
  // Vertical scroll in pixels
  scrollY: number;
  // Current zoom level
  zoomScale: number;
}

export interface VisibleTimeRange {
  startTime: number;
  endTime: number;
}

interface UseVirtualScrollOptions {
  totalDuration: number;
  containerWidth: number;
  containerHeight: number;
  contentHeight: number; // Total height of all tracks content (for vertical scroll bounds)
  initialZoom?: number;
}

export const useVirtualScroll = ({
  totalDuration,
  containerWidth,
  containerHeight,
  contentHeight,
  initialZoom = ZOOM_CONSTRAINTS.default,
}: UseVirtualScrollOptions) => {
  // Core state - single source of truth for scroll/zoom
  const [state, setState] = useState<VirtualScrollState>({
    scrollX: 0,
    scrollY: 0,
    zoomScale: initialZoom,
  });

  // Ref to track current state without causing re-renders
  const stateRef = useRef(state);
  stateRef.current = state;
  
  // Track previous totalDuration to detect content extension
  const prevTotalDurationRef = useRef(totalDuration);

  // Calculate the viewport duration based on zoom
  // Higher zoom = see less time = smaller viewport duration
  const { FIXED_BASE_DURATION, getScrollableDuration } = VIRTUAL_SCROLL_CONSTANTS;
  const viewportDuration = FIXED_BASE_DURATION / state.zoomScale;
  
  // Calculate the total scrollable duration (content + buffer)
  // This is the actual timeline length users can scroll through
  const scrollableDuration = getScrollableDuration(totalDuration);

  // Calculate content width (how wide the timeline content is in pixels)
  // CRITICAL: Content must represent scrollableDuration seconds, with pixelsPerSecond = containerWidth / viewportDuration
  // This ensures transform calculations match time calculations exactly
  const pixelsPerSecond = containerWidth / viewportDuration;
  const contentWidth = scrollableDuration * pixelsPerSecond;
  
  // Calculate maximum scroll range (horizontal)
  const maxScrollX = Math.max(0, contentWidth - containerWidth);
  
  // Calculate maximum scroll range (vertical) - content that exceeds visible area
  const maxScrollY = Math.max(0, contentHeight - containerHeight);
  
  // PREMIERE PRO BEHAVIOR: When content extends, maintain absolute TIME position
  // This ensures the view doesn't shift when clips are added at the end
  useEffect(() => {
    const prevDuration = prevTotalDurationRef.current;
    const currentDuration = totalDuration;
    
    // Only adjust if duration actually changed (content was added/removed)
    if (Math.abs(currentDuration - prevDuration) > 0.001) {
      const { scrollX, zoomScale } = stateRef.current;
      const currentViewportDuration = FIXED_BASE_DURATION / zoomScale;
      
      // Calculate the TIME we were viewing before (using centralized calculation)
      const prevScrollableDuration = getScrollableDuration(prevDuration);
      const prevMaxStartTime = Math.max(0, prevScrollableDuration - currentViewportDuration);
      const prevStartTime = scrollX * prevMaxStartTime;
      
      // Calculate new scrollX to maintain the same START TIME
      const newScrollableDuration = getScrollableDuration(currentDuration);
      const newMaxStartTime = Math.max(0, newScrollableDuration - currentViewportDuration);
      
      if (newMaxStartTime > 0) {
        // Clamp the start time to valid range
        const clampedStartTime = Math.min(prevStartTime, newMaxStartTime);
        const newScrollX = clampedStartTime / newMaxStartTime;
        
        // Only update if there's a meaningful difference
        if (Math.abs(newScrollX - scrollX) > 0.001) {
          setState(prev => ({
            ...prev,
            scrollX: Math.max(0, Math.min(1, newScrollX)),
          }));
        }
      }
      
      prevTotalDurationRef.current = currentDuration;
    }
  }, [totalDuration, FIXED_BASE_DURATION, getScrollableDuration]);

  // Calculate the visible time range based on scroll position
  // Uses stateRef to always get the latest values, avoiding stale closure issues during rapid zoom
  const getVisibleTimeRange = useCallback((): VisibleTimeRange => {
    const currentZoom = stateRef.current.zoomScale;
    const currentScrollX = stateRef.current.scrollX;
    const currentViewportDuration = FIXED_BASE_DURATION / currentZoom;
    const maxStartTime = Math.max(0, scrollableDuration - currentViewportDuration);
    const scrollOffsetTime = currentScrollX * maxStartTime;
    
    return {
      startTime: Math.max(0, scrollOffsetTime),
      endTime: Math.min(scrollableDuration, scrollOffsetTime + currentViewportDuration),
    };
  }, [scrollableDuration, FIXED_BASE_DURATION]);

  // ============================================================
  // UNIFIED COORDINATE SYSTEM - Single source of truth for positioning
  // All components should use these functions for consistent behavior
  // ============================================================

  /**
   * Convert a time (in seconds) to viewport pixel position
   * Returns the X pixel position within the visible viewport (not content)
   * Negative values = before visible area, > containerWidth = after visible area
   */
  const timeToViewportPixels = useCallback((timeInSeconds: number): number => {
    const { startTime } = getVisibleTimeRange();
    const currentViewportDuration = FIXED_BASE_DURATION / stateRef.current.zoomScale;
    if (currentViewportDuration <= 0) return 0;
    return ((timeInSeconds - startTime) / currentViewportDuration) * containerWidth;
  }, [getVisibleTimeRange, FIXED_BASE_DURATION, containerWidth]);

  /**
   * Calculate the scrollX needed to keep a specific time at a specific pixel position
   * Used for playhead-fixed zooming: when zoom changes, calculate new scroll to keep playhead stationary
   * 
   * @param newZoom - The new zoom level to apply
   * @param fixedTime - The time (in seconds) that should stay at the same pixel position
   * @param fixedPixelX - The viewport pixel X position where fixedTime should remain
   * @returns The new scrollX value (0-1) that keeps fixedTime at fixedPixelX
   */
  const calcScrollForFixedTime = useCallback((newZoom: number, fixedTime: number, fixedPixelX: number): number => {
    const clampedZoom = Math.max(ZOOM_CONSTRAINTS.min, Math.min(ZOOM_CONSTRAINTS.max, newZoom));
    const newViewportDuration = FIXED_BASE_DURATION / clampedZoom;
    
    // Calculate what startTime would put fixedTime at fixedPixelX
    // Formula: fixedPixelX = ((fixedTime - newStartTime) / newViewportDuration) * containerWidth
    // Solving for newStartTime:
    const newStartTime = fixedTime - (fixedPixelX / containerWidth) * newViewportDuration;
    
    // Convert startTime to scrollX (0-1 range)
    const newMaxStartTime = Math.max(0, scrollableDuration - newViewportDuration);
    if (newMaxStartTime <= 0) return 0;
    
    const clampedStartTime = Math.max(0, Math.min(newMaxStartTime, newStartTime));
    return clampedStartTime / newMaxStartTime;
  }, [FIXED_BASE_DURATION, containerWidth, scrollableDuration]);

  // Convert time to pixel position
  const timeToPixels = useCallback((timeInSeconds: number): number => {
    const pixelsPerSecond = contentWidth / Math.max(totalDuration, FIXED_BASE_DURATION);
    return timeInSeconds * pixelsPerSecond;
  }, [contentWidth, totalDuration]);

  // Convert pixel position to time
  const pixelsToTime = useCallback((pixels: number): number => {
    const pixelsPerSecond = contentWidth / Math.max(totalDuration, FIXED_BASE_DURATION);
    return pixels / pixelsPerSecond;
  }, [contentWidth, totalDuration]);

  // Get the transform offset for content positioning
  const getContentTransform = useCallback((): { x: number; y: number } => {
    const scrollOffsetX = stateRef.current.scrollX * maxScrollX;
    return {
      x: -scrollOffsetX,
      y: -stateRef.current.scrollY,
    };
  }, [maxScrollX]);

  // Set horizontal scroll (0-1 range)
  const setScrollX = useCallback((scrollX: number) => {
    setState(prev => ({
      ...prev,
      scrollX: Math.max(0, Math.min(1, scrollX)),
    }));
  }, []);

  // Set vertical scroll (pixels) - clamped to content bounds
  const setScrollY = useCallback((scrollY: number) => {
    setState(prev => ({
      ...prev,
      scrollY: Math.max(0, Math.min(maxScrollY, scrollY)),
    }));
  }, [maxScrollY]);

  // Set zoom level
  const setZoomScale = useCallback((zoomScale: number) => {
    const clampedZoom = Math.max(ZOOM_CONSTRAINTS.min, Math.min(ZOOM_CONSTRAINTS.max, zoomScale));
    setState(prev => ({
      ...prev,
      zoomScale: clampedZoom,
    }));
  }, []);

  // Atomically set both zoom and scroll - used by navigator for playhead-fixed zooming
  const setZoomAndScrollX = useCallback((zoom: number, scrollX: number) => {
    const clampedZoom = Math.max(ZOOM_CONSTRAINTS.min, Math.min(ZOOM_CONSTRAINTS.max, zoom));
    const clampedScrollX = Math.max(0, Math.min(1, scrollX));
    setState(prev => ({
      ...prev,
      zoomScale: clampedZoom,
      scrollX: clampedScrollX,
    }));
  }, []);

  /**
   * Perform a playhead-fixed zoom: change zoom while keeping playhead at same pixel position
   * This is the main function for zooming via navigator
   * 
   * @param newZoom - The new zoom level
   * @param playheadTime - The playhead time in seconds (currentFrame / fps)
   */
  const zoomAtPlayhead = useCallback((newZoom: number, playheadTime: number) => {
    // Calculate where playhead currently is in viewport pixels
    const playheadPixelX = timeToViewportPixels(playheadTime);
    
    // Calculate the scrollX that keeps playhead at the same pixel position
    const newScrollX = calcScrollForFixedTime(newZoom, playheadTime, playheadPixelX);
    
    // Apply both zoom and scroll atomically
    setZoomAndScrollX(newZoom, newScrollX);
  }, [timeToViewportPixels, calcScrollForFixedTime, setZoomAndScrollX]);

  // Scroll to a specific time
  const scrollToTime = useCallback((timeInSeconds: number, centerInViewport = true) => {
    const currentViewportDuration = FIXED_BASE_DURATION / stateRef.current.zoomScale;
    
    let targetStartTime: number;
    if (centerInViewport) {
      targetStartTime = timeInSeconds - (currentViewportDuration / 2);
    } else {
      targetStartTime = timeInSeconds;
    }
    
    const maxStartTime = Math.max(0, scrollableDuration - currentViewportDuration);
    const clampedStartTime = Math.max(0, Math.min(maxStartTime, targetStartTime));
    const newScrollX = maxStartTime > 0 ? clampedStartTime / maxStartTime : 0;
    
    setScrollX(newScrollX);
  }, [scrollableDuration, setScrollX]);

  // Handle wheel events - scrolling only (zoom is handled by navigator)
  const handleWheel = useCallback((e: WheelEvent, containerRect: DOMRect) => {
    // ALWAYS prevent default and stop propagation - timeline handles all wheel events
    e.preventDefault();
    e.stopPropagation();

    const { scrollX, scrollY } = stateRef.current;

    // Shift + Wheel = Horizontal scroll
    if (e.shiftKey) {
      const scrollDelta = e.deltaY / maxScrollX;
      setScrollX(scrollX + scrollDelta * 0.5);
      return;
    }

    // Normal Wheel = Vertical scroll (for tracks)
    const newScrollY = scrollY + e.deltaY;
    setScrollY(Math.max(0, newScrollY));
  }, [maxScrollX, setScrollX, setScrollY]);

  // Reset to default zoom and scroll
  const reset = useCallback(() => {
    setState({
      scrollX: 0,
      scrollY: 0,
      zoomScale: ZOOM_CONSTRAINTS.default,
    });
  }, []);

  // Zoom to fit all content
  const zoomToFit = useCallback(() => {
    if (totalDuration <= 0) {
      reset();
      return;
    }
    
    // Calculate zoom that fits all content with some padding
    const targetZoom = (FIXED_BASE_DURATION * 0.8) / totalDuration;
    const clampedZoom = Math.max(ZOOM_CONSTRAINTS.min, Math.min(ZOOM_CONSTRAINTS.max, targetZoom));
    
    setState({
      scrollX: 0,
      scrollY: 0,
      zoomScale: clampedZoom,
    });
  }, [totalDuration, reset]);

  return {
    // State
    scrollX: state.scrollX,
    scrollY: state.scrollY,
    zoomScale: state.zoomScale,
    
    // Derived values
    viewportDuration,
    scrollableDuration, // Total timeline length (for navigator thumb width)
    contentWidth,
    maxScrollX,
    maxScrollY, // Max vertical scroll (for scroll indicator)
    contentHeight, // Total content height (for scroll indicator)
    containerWidth, // Expose for coordinate calculations
    containerHeight, // Expose for scroll indicator calculations
    
    // Functions
    setScrollX,
    setScrollY,
    setZoomScale,
    setZoomAndScrollX,
    scrollToTime,
    getVisibleTimeRange,
    getContentTransform,
    timeToPixels,
    pixelsToTime,
    handleWheel,
    reset,
    zoomToFit,
    
    // Unified coordinate system functions
    timeToViewportPixels,
    calcScrollForFixedTime,
    zoomAtPlayhead,
  };
};

export default useVirtualScroll;
