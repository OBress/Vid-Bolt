import React from 'react';
import { TIMELINE_CONSTANTS } from '../constants';

interface TimelineZoomSelectionOverlayProps {
  /** Whether the user is currently selecting a zoom range */
  isSelecting: boolean;
  /** Left position as percentage (0-100) */
  left: number;
  /** Width as percentage (0-100) */
  width: number;
  /** Height of the markers area */
  markersHeight?: number;
  /** Whether to show the full-height overlay (tracks area included) */
  showFullHeight?: boolean;
}

/**
 * Overlay component that shows the zoom selection area.
 * Displays a highlighted region in both the markers ruler and optionally the tracks area.
 */
export const TimelineZoomSelectionOverlay: React.FC<TimelineZoomSelectionOverlayProps> = ({
  isSelecting,
  left,
  width,
  markersHeight = TIMELINE_CONSTANTS.MARKERS_HEIGHT,
  showFullHeight = true,
}) => {
  if (!isSelecting || width <= 0) return null;

  return (
    <div
      className="absolute pointer-events-none z-50"
      style={{
        left: `${left}%`,
        width: `${width}%`,
        top: 0,
        bottom: showFullHeight ? 0 : 'auto',
        height: showFullHeight ? '100%' : markersHeight,
      }}
    >
      {/* Selection highlight */}
      <div
        className="absolute inset-0 transition-opacity duration-75"
        style={{
          background: 'linear-gradient(180deg, rgba(59, 130, 246, 0.35) 0%, rgba(59, 130, 246, 0.15) 100%)',
          borderLeft: '2px solid rgba(59, 130, 246, 0.9)',
          borderRight: '2px solid rgba(59, 130, 246, 0.9)',
        }}
      />
      
      {/* Top edge highlight (in markers area) */}
      <div
        className="absolute left-0 right-0 top-0"
        style={{
          height: markersHeight,
          background: 'rgba(59, 130, 246, 0.4)',
          borderBottom: '1px solid rgba(59, 130, 246, 0.8)',
        }}
      />
      
      {/* Selection handles at edges */}
      <div
        className="absolute top-0 left-0 w-0.5 bg-blue-500 shadow-lg"
        style={{ height: markersHeight }}
      />
      <div
        className="absolute top-0 right-0 w-0.5 bg-blue-500 shadow-lg"
        style={{ height: markersHeight }}
      />
      
      {/* Time range indicators */}
      <div
        className="absolute flex items-center justify-center text-xs font-medium text-white drop-shadow-md"
        style={{
          top: markersHeight / 2 - 8,
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '2px 6px',
          background: 'rgba(59, 130, 246, 0.9)',
          borderRadius: 4,
          whiteSpace: 'nowrap',
        }}
      >
        <span className="opacity-80">Zoom to selection</span>
      </div>
    </div>
  );
};
