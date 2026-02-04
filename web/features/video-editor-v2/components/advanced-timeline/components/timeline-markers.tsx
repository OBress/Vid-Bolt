import React, { useCallback, useRef, useMemo } from 'react';
import { TIMELINE_CONSTANTS } from '../constants';

interface TimelineMarkersProps {
  totalDuration: number;
  onTimeClick?: (timeInSeconds: number) => void;
  onDragStateChange?: (isDragging: boolean) => void;
  zoomScale?: number;
  fps?: number;
  /** Callback when user performs a zoom selection (Shift+drag) */
  onZoomSelectionStart?: (e: React.MouseEvent<HTMLDivElement>, container: HTMLDivElement) => void;
  /** Whether a zoom selection is currently active */
  isZoomSelecting?: boolean;
}

/**
 * Premiere Pro-style timecode formatting
 * Format: HH:MM:SS:FF with leading zeros
 */
const formatTimecode = (seconds: number, fps: number): string => {
  if (seconds < 0) seconds = 0;
  
  const totalFrames = Math.round(seconds * fps);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const f = totalFrames % fps;
  
  // Premiere Pro format: HH:MM:SS:FF with leading zeros
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
};

/**
 * Calculate optimal intervals based on zoom level
 * Mimics Premiere Pro's exact behavior
 */
const calculateIntervals = (
  totalDuration: number, 
  zoomScale: number,
  fps: number,
  viewportWidthEstimate: number = 1000
): {
  majorMs: number;
  minorMs: number;
} => {
  // Calculate pixels per second at current zoom
  const contentWidth = viewportWidthEstimate * zoomScale;
  const pixelsPerSecond = contentWidth / totalDuration;
  
  // Target: roughly 6-10 major labels visible at any zoom level
  // Premiere Pro uses wider spacing for the full timecode format
  const targetMajorSpacingPx = 140;
  const targetMajorIntervalSec = targetMajorSpacingPx / pixelsPerSecond;
  
  // Standard Premiere Pro intervals (in milliseconds)
  const presets: { ms: number; minorDiv: number }[] = [
    // Frame-level (very high zoom)
    { ms: Math.round(1000 / fps), minorDiv: 1 },        // 1 frame
    { ms: Math.round(1000 / fps) * 2, minorDiv: 2 },    // 2 frames
    { ms: Math.round(1000 / fps) * 5, minorDiv: 5 },    // 5 frames
    { ms: Math.round(1000 / fps) * 10, minorDiv: 5 },   // 10 frames
    { ms: Math.round(1000 / fps) * 15, minorDiv: 5 },   // 15 frames
    
    // Second-level
    { ms: 1000, minorDiv: 4 },       // 1 second
    { ms: 2000, minorDiv: 4 },       // 2 seconds
    { ms: 5000, minorDiv: 5 },       // 5 seconds
    { ms: 10000, minorDiv: 5 },      // 10 seconds
    { ms: 15000, minorDiv: 3 },      // 15 seconds
    { ms: 30000, minorDiv: 6 },      // 30 seconds
    
    // Minute-level
    { ms: 60000, minorDiv: 4 },      // 1 minute
    { ms: 120000, minorDiv: 4 },     // 2 minutes
    { ms: 300000, minorDiv: 5 },     // 5 minutes
    { ms: 600000, minorDiv: 5 },     // 10 minutes
    { ms: 900000, minorDiv: 3 },     // 15 minutes
    { ms: 1800000, minorDiv: 6 },    // 30 minutes
    
    // Hour-level
    { ms: 3600000, minorDiv: 4 },    // 1 hour
  ];
  
  const targetMs = targetMajorIntervalSec * 1000;
  
  // Find best matching interval
  let best = presets[presets.length - 1];
  for (const preset of presets) {
    if (preset.ms >= targetMs * 0.6) {
      best = preset;
      break;
    }
  }
  
  return {
    majorMs: best.ms,
    minorMs: Math.round(best.ms / best.minorDiv),
  };
};

export const TimelineMarkers: React.FC<TimelineMarkersProps> = ({
  totalDuration,
  onTimeClick,
  onDragStateChange,
  zoomScale = 1,
  fps = 30,
  onZoomSelectionStart,
  isZoomSelecting = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // If Shift is held, trigger zoom selection instead of playhead scrub
    if (e.shiftKey && onZoomSelectionStart && containerRef.current) {
      onZoomSelectionStart(e, containerRef.current);
      return;
    }
    
    if (!onTimeClick) return;
    
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;
    let hasMoved = false;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = Math.abs(e.clientX - startX);
      const deltaY = Math.abs(e.clientY - startY);
      
      if (deltaX > 3 || deltaY > 3) {
        if (!hasMoved) {
          hasMoved = true;
          onDragStateChange?.(true);
        }
        
        const container = containerRef.current;
        if (container) {
          // Calculate time from content position
          const rect = container.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const clickPosition = Math.max(0, Math.min(1, x / rect.width));
          const timeInSeconds = clickPosition * totalDuration;
          
          // Calculate CSS position from VIEWPORT (not content) for consistent playhead positioning
          const viewportContainer = document.querySelector('.timeline-tracks-scroll-container') as HTMLElement;
          const viewportRect = viewportContainer?.getBoundingClientRect();
          const viewportX = viewportRect ? e.clientX - viewportRect.left : 0;
          const positionPercentage = viewportRect ? (viewportX / viewportRect.width) * 100 : clickPosition * 100;
          
          const rootContainer = container.closest('.flex.flex-col.h-full') as HTMLElement;
          if (rootContainer) {
            rootContainer.style.setProperty('--timeline-marker-position', `${positionPercentage}%`);
          }
          
          onTimeClick?.(Math.max(0, Math.min(totalDuration, timeInSeconds)));
        }
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      
      if (!hasMoved) {
        const container = containerRef.current;
        if (container) {
          // Calculate time from content position
          const rect = container.getBoundingClientRect();
          const clickX = e.clientX - rect.left;
          const clickPosition = clickX / rect.width;
          const timeInSeconds = clickPosition * totalDuration;
          
          if (timeInSeconds >= 0 && timeInSeconds <= totalDuration) {
            // Calculate CSS position from VIEWPORT (not content) for consistent playhead positioning
            const viewportContainer = document.querySelector('.timeline-tracks-scroll-container') as HTMLElement;
            const viewportRect = viewportContainer?.getBoundingClientRect();
            const viewportX = viewportRect ? e.clientX - viewportRect.left : 0;
            const positionPercentage = viewportRect ? (viewportX / viewportRect.width) * 100 : clickPosition * 100;
            
            const rootContainer = container.closest('.flex.flex-col.h-full') as HTMLElement;
            if (rootContainer) {
              rootContainer.style.setProperty('--timeline-marker-position', `${positionPercentage}%`);
            }
            
            onTimeClick?.(Math.max(0, Math.min(totalDuration, timeInSeconds)));
          }
        }
      }
      
      onDragStateChange?.(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [onTimeClick, totalDuration, onDragStateChange, onZoomSelectionStart]);

  // Touch event handlers for mobile
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (!onTimeClick) return;
    
    e.preventDefault();
    e.stopPropagation();

    const touch = e.touches[0];
    if (!touch) return;

    const startX = touch.clientX;
    const startY = touch.clientY;

    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }

    let hasMoved = false;

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      if (!touch) return;

      const deltaX = Math.abs(touch.clientX - startX);
      const deltaY = Math.abs(touch.clientY - startY);
      
      if (deltaX > 3 || deltaY > 3) {
        if (!hasMoved) {
          hasMoved = true;
          onDragStateChange?.(true);
        }
        
        const container = containerRef.current;
        if (container) {
          // Calculate time from content position
          const rect = container.getBoundingClientRect();
          const x = touch.clientX - rect.left;
          const clickPosition = Math.max(0, Math.min(1, x / rect.width));
          const timeInSeconds = clickPosition * totalDuration;
          
          // Calculate CSS position from VIEWPORT (not content) for consistent playhead positioning
          const viewportContainer = document.querySelector('.timeline-tracks-scroll-container') as HTMLElement;
          const viewportRect = viewportContainer?.getBoundingClientRect();
          const viewportX = viewportRect ? touch.clientX - viewportRect.left : 0;
          const positionPercentage = viewportRect ? (viewportX / viewportRect.width) * 100 : clickPosition * 100;
          
          const rootContainer = container.closest('.flex.flex-col.h-full') as HTMLElement;
          if (rootContainer) {
            rootContainer.style.setProperty('--timeline-marker-position', `${positionPercentage}%`);
          }
          
          onTimeClick?.(Math.max(0, Math.min(totalDuration, timeInSeconds)));
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
      
      if (!hasMoved && e.changedTouches[0]) {
        const touch = e.changedTouches[0];
        const container = containerRef.current;
        if (container) {
          // Calculate time from content position
          const rect = container.getBoundingClientRect();
          const clickX = touch.clientX - rect.left;
          const clickPosition = clickX / rect.width;
          const timeInSeconds = clickPosition * totalDuration;
          
          if (timeInSeconds >= 0 && timeInSeconds <= totalDuration) {
            // Calculate CSS position from VIEWPORT (not content) for consistent playhead positioning
            const viewportContainer = document.querySelector('.timeline-tracks-scroll-container') as HTMLElement;
            const viewportRect = viewportContainer?.getBoundingClientRect();
            const viewportX = viewportRect ? touch.clientX - viewportRect.left : 0;
            const positionPercentage = viewportRect ? (viewportX / viewportRect.width) * 100 : clickPosition * 100;
            
            const rootContainer = container.closest('.flex.flex-col.h-full') as HTMLElement;
            if (rootContainer) {
              rootContainer.style.setProperty('--timeline-marker-position', `${positionPercentage}%`);
            }
            
            onTimeClick?.(Math.max(0, Math.min(totalDuration, timeInSeconds)));
          }
        }
      }
      
      onDragStateChange?.(false);
    };

    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd);
  }, [onTimeClick, totalDuration, onDragStateChange]);

  // Generate markers using memoization for performance
  const markers = useMemo(() => {
    const result: React.ReactNode[] = [];
    const intervals = calculateIntervals(totalDuration, zoomScale, fps);
    
    const totalMs = Math.round(totalDuration * 1000);
    const { majorMs, minorMs } = intervals;
    
    // Generate minor ticks (no labels)
    for (let ms = 0; ms <= totalMs; ms += minorMs) {
      // Skip if this is a major tick position
      if (ms % majorMs === 0) continue;
      
      const timeSeconds = ms / 1000;
      const positionPercentage = (timeSeconds / totalDuration) * 100;
      
      result.push(
          <div
          key={`minor-${ms}`}
            className="absolute"
            style={{
              left: `${positionPercentage}%`,
              transform: 'translateX(-50%)',
            }}
          >
          <div className="w-px bg-neutral-500 h-[6px] opacity-40" />
          </div>
        );
    }
    
    // Generate major ticks with labels
    for (let ms = 0; ms <= totalMs; ms += majorMs) {
      const timeSeconds = ms / 1000;
      const positionPercentage = (timeSeconds / totalDuration) * 100;
      
      const label = formatTimecode(timeSeconds, fps);
      
      result.push(
          <div
          key={`major-${ms}`}
          className="absolute flex flex-col items-center"
            style={{
              left: `${positionPercentage}%`,
              transform: 'translateX(-50%)',
            }}
          >
          <div className="w-px bg-neutral-400 h-[10px]" />
          <span className="text-[11px] text-neutral-300 mt-0.5 select-none whitespace-nowrap font-mono tracking-tight">
            {label}
          </span>
          </div>
        );
    }

    return result;
  }, [totalDuration, zoomScale, fps]);

  return (
    <div
      ref={containerRef}
      className={`relative bg-background border-b border-border w-full timeline-markers-container ${
        isZoomSelecting ? 'cursor-col-resize' : 'cursor-pointer'
      }`}
      style={{ 
        height: `${TIMELINE_CONSTANTS.MARKERS_HEIGHT}px`,
      }}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      title="Click to set playhead • Shift+drag to zoom to selection"
    >
      {markers}
    </div>
  );
};
