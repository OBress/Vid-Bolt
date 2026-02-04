/**
 * Timeline utilities
 */

import type { TimelineItem } from '../types';

/**
 * Clear the CSS custom property used for timeline marker position during scrubbing
 * NOTE: The CSS variable is set on elements matching '.flex.flex-col.h-full' inside 
 * the timeline, so we need to clear it from all matching elements and the container.
 */
export function clearTimelineMarkerPosition(): void {
  // Clear from the main timeline container
  const timelineContainer = document.querySelector('.timeline-container');
  if (timelineContainer) {
    (timelineContainer as HTMLElement).style.removeProperty('--timeline-marker-position');
  }
  
  // Also clear from any nested elements where it may have been set
  // (clicks set it on .flex.flex-col.h-full elements found via closest())
  const nestedElements = document.querySelectorAll('.timeline-container .flex.flex-col.h-full');
  nestedElements.forEach(el => {
    (el as HTMLElement).style.removeProperty('--timeline-marker-position');
  });
}

/**
 * Gap in a track
 */
export interface TrackGap {
  start: number;
  end: number;
}

/**
 * Find gaps between items in a track
 */
export function findGapsInTrack(items: TimelineItem[]): TrackGap[] {
  if (!items || items.length === 0) return [];
  
  const sortedItems = [...items].sort((a, b) => a.start - b.start);
  const gaps: TrackGap[] = [];
  
  // Check for gap at the beginning
  if (sortedItems[0].start > 0) {
    gaps.push({ start: 0, end: sortedItems[0].start });
  }
  
  // Check for gaps between items
  for (let i = 0; i < sortedItems.length - 1; i++) {
    const currentEnd = sortedItems[i].end;
    const nextStart = sortedItems[i + 1].start;
    
    if (nextStart > currentEnd) {
      gaps.push({ start: currentEnd, end: nextStart });
    }
  }
  
  return gaps;
}

// Re-export for backwards compatibility
export { findGapsInTrack as findGaps };

// FIXED base viewport duration - matches use-timeline-composition.ts
// This determines "how many seconds fit in the viewport at zoom=1"
// This NEVER changes during normal operation, ensuring stable pixelsPerSecond
const FIXED_BASE_VIEWPORT_DURATION = 60; // 60 seconds visible at zoom level 1

/**
 * Calculate viewport duration based on zoom scale
 * The viewport duration is the amount of time visible in the timeline at the current zoom level
 * 
 * CRITICAL: Uses FIXED base duration (60s) to ensure stable positioning!
 * This prevents items from shifting when timeline content grows.
 */
export function calculateViewportDuration(_totalDuration: number, zoomScale: number): number {
  // At zoom 1.0, we see 60 seconds
  // At zoom 2.0, we see 30 seconds (zoomed in)
  // At zoom 0.5, we see 120 seconds (zoomed out)
  // 
  // NOTE: totalDuration is IGNORED - we use fixed base to prevent instability
  // when timeline content changes. The scrollable area grows independently.
  return FIXED_BASE_VIEWPORT_DURATION / Math.max(zoomScale, 0.01);
}

// ============================================================
// TIME CONVERSION UTILITIES
// ============================================================

/**
 * Convert frame number to time in seconds
 * @param frame - The frame number
 * @param fps - Frames per second (default: 30)
 * @returns Time in seconds
 */
export function frameToTime(frame: number, fps: number = 30): number {
  return frame / fps;
}

/**
 * Convert time in seconds to frame number
 * @param time - Time in seconds
 * @param fps - Frames per second (default: 30)
 * @returns Frame number
 */
export function timeToFrame(time: number, fps: number = 30): number {
  return Math.round(time * fps);
}

// ============================================================
// MOUSE POSITION UTILITIES
// ============================================================

/**
 * Calculate mouse position as a percentage within an element
 * @param event - Mouse event
 * @param element - Reference element for position calculation
 * @returns Position as percentage (0-100)
 */
export function calculateMousePosition(
  event: MouseEvent | React.MouseEvent,
  element: HTMLElement
): number {
  const rect = element.getBoundingClientRect();
  const x = event.clientX - rect.left;
  return Math.max(0, Math.min(100, (x / rect.width) * 100));
}

/**
 * Calculate mouse position relative to timeline scrollable area
 * @param clientX - Mouse X coordinate
 * @param container - Container element
 * @returns Position data with percentage and pixel values
 */
export function calculateTimelineMousePosition(
  clientX: number,
  container: HTMLElement
): { percentage: number; pixelX: number } {
  const rect = container.getBoundingClientRect();
  const pixelX = clientX - rect.left;
  const percentage = Math.max(0, Math.min(100, (pixelX / rect.width) * 100));
  return { percentage, pixelX };
}
