/**
 * useScrollVelocity - Tracks scroll velocity and provides scroll state signals
 *
 * Provides:
 * - isScrolling: true while the user is actively scrolling
 * - isRapidScrolling: true when scroll velocity exceeds threshold
 *
 * Uses a debounced idle timer (150ms) to detect when scrolling has stopped.
 * Scroll velocity is computed from the delta between consecutive scrollX values.
 */

import { useRef, useCallback, useEffect, useState } from 'react';

/** Threshold for rapid scrolling (normalized scrollX units per sample) */
const RAPID_SCROLL_THRESHOLD = 0.008;

/** Duration of inactivity (ms) before declaring scroll idle */
const SCROLL_IDLE_DELAY_MS = 150;

export interface ScrollVelocityState {
  /** True while the user is actively scrolling or within the idle window */
  isScrolling: boolean;
  /** True when scroll velocity exceeds the rapid threshold */
  isRapidScrolling: boolean;
}

export function useScrollVelocity(
  scrollX: number,
  scrollY: number,
  zoomScale: number,
): ScrollVelocityState {
  const [isScrolling, setIsScrolling] = useState(false);
  const [isRapidScrolling, setIsRapidScrolling] = useState(false);

  // Refs to avoid stale closures
  const prevScrollXRef = useRef(scrollX);
  const prevZoomRef = useRef(zoomScale);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isScrollingRef = useRef(false);

  // Track scroll changes and compute velocity
  useEffect(() => {
    const deltaX = Math.abs(scrollX - prevScrollXRef.current);
    const deltaZoom = Math.abs(zoomScale - prevZoomRef.current);
    prevScrollXRef.current = scrollX;
    prevZoomRef.current = zoomScale;

    // Any meaningful change counts as scrolling
    const hasMovement = deltaX > 0.0001 || deltaZoom > 0.001;

    if (hasMovement) {
      // Enter scrolling state
      if (!isScrollingRef.current) {
        isScrollingRef.current = true;
        setIsScrolling(true);
      }

      // Determine if rapid
      setIsRapidScrolling(deltaX > RAPID_SCROLL_THRESHOLD);

      // Reset idle timer
      if (idleTimerRef.current !== null) {
        clearTimeout(idleTimerRef.current);
      }

      idleTimerRef.current = setTimeout(() => {
        isScrollingRef.current = false;
        setIsScrolling(false);
        setIsRapidScrolling(false);
        idleTimerRef.current = null;
      }, SCROLL_IDLE_DELAY_MS);
    }
  }, [scrollX, scrollY, zoomScale]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (idleTimerRef.current !== null) {
        clearTimeout(idleTimerRef.current);
      }
    };
  }, []);

  return { isScrolling, isRapidScrolling };
}
