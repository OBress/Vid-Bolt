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

  // ──────────────────────────────────────────────────────────
  // REF-BASED IMMEDIATE SCROLL (Bypasses React During Active Scroll)
  //
  // Problem: Even rAF-coalesced setState causes full React reconciliation of
  // the massive TimelineContent component tree on every frame during scroll.
  //
  // Solution: During active scrolling, update only a ref and mutate the DOM
  // transform directly. React state is synced only when scrolling stops,
  // eliminating ALL React work during active scrolling.
  // ──────────────────────────────────────────────────────────

  /** Ref holding the "live" scrollX/scrollY during active scroll (not in React state) */
  const liveScrollRef = useRef({ x: state.scrollX, y: state.scrollY });
  // Keep live ref in sync when React state updates (e.g., from zoom, scrollToTime, etc.)
  useEffect(() => {
    liveScrollRef.current = { x: state.scrollX, y: state.scrollY };
  }, [state.scrollX, state.scrollY]);

  /** Ref to the DOM element whose transform we update directly */
  const scrollContentRef = useRef<HTMLDivElement | null>(null);
  /** Ref to the markers DOM element for synchronized header scroll */
  const scrollMarkersRef = useRef<HTMLDivElement | null>(null);

  /** Timer for flushing live scroll to React state after scroll stops */
  const scrollIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** rAF handle for batching direct DOM updates */
  const scrollRafRef = useRef<number | null>(null);

  /** Cleanup on unmount */
  useEffect(() => {
    return () => {
      if (scrollIdleTimerRef.current !== null) clearTimeout(scrollIdleTimerRef.current);
      if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current);
    };
  }, []);

  /** Apply live scroll position directly to DOM (no React!) */
  const applyDOMTransform = useCallback(() => {
    scrollRafRef.current = null;
    const { x, y } = liveScrollRef.current;
    const scrollOffsetX = x * maxScrollX;
    if (scrollContentRef.current) {
      scrollContentRef.current.style.transform = `translate(${-scrollOffsetX}px, ${-y}px)`;
    }
    if (scrollMarkersRef.current) {
      scrollMarkersRef.current.style.transform = `translateX(${-scrollOffsetX}px)`;
    }
  }, [maxScrollX]);

  /** Flush live scroll ref to React state (called when scroll stops) */
  const flushScrollToState = useCallback(() => {
    scrollIdleTimerRef.current = null;
    const { x, y } = liveScrollRef.current;
    setState(prev => {
      // Only update if values actually changed
      if (Math.abs(prev.scrollX - x) < 0.0001 && Math.abs(prev.scrollY - y) < 0.0001) {
        return prev;
      }
      return { ...prev, scrollX: x, scrollY: y };
    });
  }, []);

  /** Duration (ms) of scroll inactivity before flushing to React state */
  const SCROLL_IDLE_MS = 150;

  // Set horizontal scroll (0-1 range) — ref-based, bypasses React during scroll
  const setScrollX = useCallback((scrollX: number) => {
    const clamped = Math.max(0, Math.min(1, scrollX));
    liveScrollRef.current.x = clamped;
    // Also keep stateRef in sync for getVisibleTimeRange, getContentTransform, etc.
    stateRef.current = { ...stateRef.current, scrollX: clamped };

    // Schedule direct DOM update (batched to rAF)
    if (scrollRafRef.current === null) {
      scrollRafRef.current = requestAnimationFrame(applyDOMTransform);
    }

    // Reset idle timer — flush to React state only after scrolling stops
    if (scrollIdleTimerRef.current !== null) clearTimeout(scrollIdleTimerRef.current);
    scrollIdleTimerRef.current = setTimeout(flushScrollToState, SCROLL_IDLE_MS);
  }, [applyDOMTransform, flushScrollToState]);

  // Set horizontal scroll with IMMEDIATE React state update (no deferral).
  // Use this for UI controls like the navigator scrollbar where the control's
  // visual position depends on React state and must stay in sync during drag.
  const setScrollXImmediate = useCallback((scrollX: number) => {
    const clamped = Math.max(0, Math.min(1, scrollX));
    liveScrollRef.current.x = clamped;
    stateRef.current = { ...stateRef.current, scrollX: clamped };

    // Apply DOM transform immediately (no rAF batching)
    applyDOMTransform();

    // Update React state synchronously so the navigator thumb re-renders
    setState(prev => {
      if (Math.abs(prev.scrollX - clamped) < 0.0001) return prev;
      return { ...prev, scrollX: clamped };
    });
  }, [applyDOMTransform]);

  // Set vertical scroll (pixels) — ref-based, bypasses React during scroll
  const setScrollY = useCallback((scrollY: number) => {
    const clamped = Math.max(0, Math.min(maxScrollY, scrollY));
    liveScrollRef.current.y = clamped;
    stateRef.current = { ...stateRef.current, scrollY: clamped };

    // Schedule direct DOM update
    if (scrollRafRef.current === null) {
      scrollRafRef.current = requestAnimationFrame(applyDOMTransform);
    }

    // Reset idle timer
    if (scrollIdleTimerRef.current !== null) clearTimeout(scrollIdleTimerRef.current);
    scrollIdleTimerRef.current = setTimeout(flushScrollToState, SCROLL_IDLE_MS);
  }, [maxScrollY, applyDOMTransform, flushScrollToState]);

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
      // Scroll by a fraction of the viewport duration per wheel event
      // Each notch scrolls ~5% of the visible time range for consistent feel
      const viewportFraction = 0.05;
      const scrollDelta = Math.sign(e.deltaY) * viewportFraction * (viewportDuration / scrollableDuration);
      const normalizedDelta = scrollableDuration > viewportDuration ? scrollDelta : 0;
      setScrollX(scrollX + normalizedDelta);
      return;
    }

    // Normal Wheel = Vertical scroll (for tracks)
    const newScrollY = scrollY + e.deltaY;
    setScrollY(Math.max(0, newScrollY));
  }, [viewportDuration, scrollableDuration, setScrollX, setScrollY]);

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
    setScrollXImmediate,
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

    // DOM refs for direct scroll transform (bypasses React during active scroll)
    scrollContentRef,
    scrollMarkersRef,
  };
};

export default useVirtualScroll;
