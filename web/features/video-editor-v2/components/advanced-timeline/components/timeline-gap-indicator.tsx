import React from 'react';
import { TIMELINE_CONSTANTS } from '../constants';

/**
 * Props for the TimelineGapIndicator component
 */
interface TimelineGapIndicatorProps {
  /** The gap object containing start and end timestamps in seconds */
  gap: { start: number; end: number };
  /** The index of the track where this gap appears */
  trackIndex: number;
  /** The total duration of the timeline in seconds */
  totalDuration: number;
}

/**
 * A component that displays a visual indicator for gaps in a timeline track.
 * Shows a subtle striped pattern on hover to indicate empty space.
 * Like Premiere Pro - gaps are allowed and don't auto-close.
 */
export const TimelineGapIndicator: React.FC<TimelineGapIndicatorProps> = ({
  gap,
  totalDuration,
}) => {
  return (
    <div
      className="absolute top-0 bottom-0 w-full h-full group z-5 my-auto pointer-events-none"
      style={{
        left: `${(gap.start / totalDuration) * 100}%`,
        width: `${((gap.end - gap.start) / totalDuration) * 100}%`,
        height: `${TIMELINE_CONSTANTS.TRACK_ITEM_HEIGHT}px`,
      }}
      title={`Gap: ${gap.start.toFixed(1)}s - ${gap.end.toFixed(1)}s`}
    >
      {/* Gap indicator - subtle visual only, no interaction */}
      <div
        className="absolute top-0 bottom-0 left-0 right-0 w-full h-full opacity-0"
      />
    </div>
  );
}; 