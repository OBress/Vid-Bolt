'use client';

/**
 * use-auto-scroll — Keeps the playhead visible during playback
 *
 * When playback is active, this hook monitors the playhead's pixel position
 * and scrolls the timeline view to keep it visible. The playhead is kept
 * at approximately 30% from the right edge of the viewport.
 *
 * Inspired by Premiere Pro's auto-scroll and CapCut's "scroll to playhead" behavior.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useVideoEditorStore } from '../../../../stores/video-editor-store';

// ============================================================
// TYPES
// ============================================================

export interface UseAutoScrollOptions {
  /** Whether auto-scroll is enabled (user can toggle via toolbar) */
  enabled: boolean;
  /** Pixels per second at current zoom level */
  pixelsPerSecond: number;
  /** Current horizontal scroll offset (pixels, typically negative) */
  scrollX: number;
  /** Width of the visible viewport in pixels */
  viewportWidth: number;
  /** Callback to set the scroll offset */
  onScrollChange: (newScrollX: number) => void;
}

// ============================================================
// CONSTANTS
// ============================================================

/** Where the playhead should be positioned (0 = left edge, 1 = right edge) */
const PLAYHEAD_TARGET_POSITION = 0.3;

/** Minimum distance from either edge before triggering a scroll (px) */
const EDGE_MARGIN = 60;

/** Smooth scroll speed factor (0-1, higher = snappier) */
const SCROLL_LERP = 0.12;

// ============================================================
// HOOK
// ============================================================

export function useAutoScroll({
  enabled,
  pixelsPerSecond,
  scrollX,
  viewportWidth,
  onScrollChange,
}: UseAutoScrollOptions) {
  const rafRef = useRef<number | null>(null);
  const lastScrollRef = useRef(scrollX);

  // Keep ref in sync for the animation loop
  lastScrollRef.current = scrollX;

  const tick = useCallback(() => {
    if (!enabled) return;

    const state = useVideoEditorStore.getState();
    const { isPlaying, currentTime } = state.playback;

    if (!isPlaying) {
      rafRef.current = null;
      return;
    }

    // Calculate playhead pixel position
    const playheadPx = currentTime * pixelsPerSecond;
    // scrollX is typically negative (scroll right = more negative)
    const visibleStart = -lastScrollRef.current;
    const visibleEnd = visibleStart + viewportWidth;

    // Check if playhead is about to leave the visible area
    const rightMargin = visibleEnd - EDGE_MARGIN;

    if (playheadPx > rightMargin) {
      // Playhead is past the right margin — scroll to keep it at target position
      const targetVisibleStart = playheadPx - viewportWidth * (1 - PLAYHEAD_TARGET_POSITION);
      const targetScrollX = -targetVisibleStart;
      // Smooth lerp
      const newScrollX = lastScrollRef.current + (targetScrollX - lastScrollRef.current) * SCROLL_LERP;
      onScrollChange(newScrollX);
    } else if (playheadPx < visibleStart + EDGE_MARGIN) {
      // Playhead is past the left margin (reverse playback)
      const targetVisibleStart = playheadPx - viewportWidth * PLAYHEAD_TARGET_POSITION;
      const targetScrollX = -Math.max(0, targetVisibleStart);
      const newScrollX = lastScrollRef.current + (targetScrollX - lastScrollRef.current) * SCROLL_LERP;
      onScrollChange(newScrollX);
    }

    // Continue loop
    rafRef.current = requestAnimationFrame(tick);
  }, [enabled, pixelsPerSecond, viewportWidth, onScrollChange]);

  // Start/stop the animation loop based on playback state
  useEffect(() => {
    if (!enabled) return;

    const unsub = useVideoEditorStore.subscribe(
      (s) => s.playback.isPlaying,
      (isPlaying) => {
        if (isPlaying && rafRef.current === null) {
          rafRef.current = requestAnimationFrame(tick);
        } else if (!isPlaying && rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
      },
    );

    // If already playing on mount, start
    if (useVideoEditorStore.getState().playback.isPlaying) {
      rafRef.current = requestAnimationFrame(tick);
    }

    return () => {
      unsub();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [enabled, tick]);
}
