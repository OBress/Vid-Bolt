import React, { useCallback, useEffect, useRef } from "react";
import { useOptimizedScrubbing } from "../../../hooks/use-optimized-scrubbing";
import { subscribeToPlayhead } from "../../../hooks/playhead-frame-bridge";

/**
 * Props for the TimelineMarker component.
 */
interface TimelineMarkerProps {
  /** Current frame position */
  currentFrame: number;
  
  /** Total duration in frames (legacy - still used for some calculations) */
  totalDurationInFrames: number;
  
  /** Zoom scale for calculating position */
  zoomScale?: number;
  
  /** FPS for high-precision time calculation */
  fps?: number;
  
  /** Total duration in seconds (scrollable duration for drag calculations) */
  totalDuration?: number;
  
  /** Start time of the visible viewport (from getVisibleTimeRange) */
  visibleStartTime?: number;
  
  /** Duration of the visible viewport in seconds */
  viewportDuration?: number;
  
  /** Callback when playhead is dragged to a new time */
  onTimeChange?: (timeInSeconds: number) => void;
  
  /** Callback when drag state changes */
  onDragStateChange?: (isDragging: boolean) => void;
}

/**
 * TimelineMarker component displays the current playback position as a vertical line.
 * Shows a red line with a draggable head at the top to indicate current frame.
 * 
 * Like Premiere Pro: The playhead head can be dragged to scrub through the timeline.
 * 
 * PERFORMANCE OPTIMIZED: Uses CSS custom properties for positioning to match ghost marker exactly.
 * Position is controlled via --timeline-marker-position CSS custom property.
 * Falls back to calculated position if CSS variable is not set.
 */
export const TimelineMarker: React.FC<TimelineMarkerProps> = ({
  currentFrame,
  totalDurationInFrames,
  fps,
  totalDuration,
  visibleStartTime,
  viewportDuration,
  onTimeChange,
  onDragStateChange,
}) => {
  const isDraggingRef = useRef(false);
  const markerRef = useRef<HTMLDivElement>(null);
  
  // PERF: Subscribe to the playhead bridge for real-time DOM updates during playback.
  // This bypasses React re-renders and updates the CSS custom property directly.
  useEffect(() => {
    const unsub = subscribeToPlayhead((frame, bridgeFps) => {
      if (isDraggingRef.current) return; // Don't override drag position
      const el = markerRef.current;
      if (!el || !bridgeFps || bridgeFps <= 0) return;

      // Recalculate position using the same logic as the React render path
      let pos: number;
      if (viewportDuration && viewportDuration > 0 && visibleStartTime !== undefined) {
        const playheadTime = frame / bridgeFps;
        pos = ((playheadTime - visibleStartTime) / viewportDuration) * 100;
      } else if (totalDuration && totalDuration > 0) {
        pos = ((frame / bridgeFps) / totalDuration) * 100;
      } else if (totalDurationInFrames > 0) {
        pos = (frame / totalDurationInFrames) * 100;
      } else {
        pos = 0;
      }

      el.style.left = `${pos}%`;
    });
    return unsub;
  }, [fps, totalDuration, totalDurationInFrames, visibleStartTime, viewportDuration]);
  
  // Use optimized scrubbing hook for smooth, throttled updates
  const { startScrubbing, updateTime, endScrubbing } = useOptimizedScrubbing({
    onScrubStart: () => onDragStateChange?.(true),
    onScrubEnd: () => onDragStateChange?.(false),
    pauseDuringScrub: true,
  });
  
  // UNIFIED COORDINATE SYSTEM: Position relative to VIEWPORT (not content)
  // This ensures the playhead stays at the same pixel position during zoom
  let calculatedPosition: number;
  
  if (fps && viewportDuration && viewportDuration > 0 && visibleStartTime !== undefined) {
    // Viewport-relative calculation (preferred)
    // playheadTime relative to visible viewport start
    const playheadTime = currentFrame / fps;
    const viewportFraction = (playheadTime - visibleStartTime) / viewportDuration;
    calculatedPosition = viewportFraction * 100;
  } else if (fps && totalDuration && fps > 0 && totalDuration > 0) {
    // Legacy fallback: content-relative calculation
    const currentTime = currentFrame / fps;
    calculatedPosition = (currentTime / totalDuration) * 100;
  } else {
    // Frame-based fallback
    calculatedPosition = totalDurationInFrames > 0 
      ? (currentFrame / totalDurationInFrames) * 100 
      : 0;
  }

  // Note: We don't clamp to 0-100 because with viewport-relative positioning,
  // the playhead may be outside the viewport (negative or >100)
  const clampedPosition = calculatedPosition;

  // Handle playhead head drag - like Premiere Pro
  // Uses viewport-relative positioning for consistency with unified coordinate system
  // OPTIMIZED: Uses requestAnimationFrame throttling for smooth 60fps updates
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Need either viewport params or totalDuration for drag
    const hasViewportParams = viewportDuration && viewportDuration > 0 && visibleStartTime !== undefined;
    const hasTotalDuration = totalDuration && totalDuration > 0;
    if (!hasViewportParams && !hasTotalDuration) return;
    
    e.preventDefault();
    e.stopPropagation();
    isDraggingRef.current = true;
    
    // Clear the CSS custom property so position is controlled by currentFrame prop
    const rootContainer = document.querySelector('.timeline-markers-overlay-content')?.closest('.flex.flex-col.h-full') as HTMLElement;
    if (rootContainer) {
      rootContainer.style.removeProperty('--timeline-marker-position');
    }
    
    startScrubbing();
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      
      // Find the timeline content container for position calculation
      // Use the markers overlay container since playhead is viewport-relative
      const container = document.querySelector('.timeline-markers-overlay-content')?.parentElement as HTMLElement;
      if (!container) return;
      
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const viewportFraction = Math.max(0, Math.min(1, x / rect.width));
      
      let timeInSeconds: number;
      let maxTime: number;
      
      if (hasViewportParams) {
        // Viewport-relative calculation
        timeInSeconds = visibleStartTime! + (viewportFraction * viewportDuration!);
        maxTime = totalDuration || (visibleStartTime! + viewportDuration!);
      } else {
        // Legacy calculation
        timeInSeconds = viewportFraction * totalDuration!;
        maxTime = totalDuration!;
      }
      
      const clampedTime = Math.max(0, Math.min(maxTime, timeInSeconds));
      
      // Use optimized update (throttled with RAF)
      // This handles both store and player updates
      updateTime(clampedTime);
    };
    
    const handleMouseUp = () => {
      isDraggingRef.current = false;
      endScrubbing();
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [totalDuration, visibleStartTime, viewportDuration, startScrubbing, updateTime, endScrubbing]);

  // Set initial position and update when paused (React prop-driven).
  // During playback, the bridge subscription above handles left updates.
  useEffect(() => {
    const el = markerRef.current;
    if (!el) return;
    el.style.left = `${clampedPosition}%`;
  }, [clampedPosition]);

  return (
    <div
      ref={markerRef}
      className="absolute top-0 z-50"
      data-timeline-marker="playhead"
      style={{
        // NOTE: `left` is NOT set here — it's controlled imperatively via the ref
        // to prevent React re-renders from overwriting the bridge's 60fps DOM updates.
        transform: "translateX(-50%)",
        height: "100%",
        width: "2px",
        pointerEvents: "none", // Line itself doesn't interfere with items
      }}
    >
      {/* Main marker line */}
      <div
        className="absolute top-0 left-1/2 transform -translate-x-1/2 w-[2px] bg-red-500 shadow-lg"
        style={{
          height: "100%",
        }}
      />

      {/* Draggable marker head - like Premiere Pro */}
      <div
        className="absolute -top-[2px] left-1/2 transform -translate-x-1/2 w-3 h-6 bg-red-500 rounded-sm shadow-md cursor-grab active:cursor-grabbing hover:bg-red-400 transition-colors"
        style={{
          pointerEvents: 'auto', // Head is interactive for dragging
        }}
        onMouseDown={handleMouseDown}
        title="Drag to scrub"
      />
    </div>
  );
}; 