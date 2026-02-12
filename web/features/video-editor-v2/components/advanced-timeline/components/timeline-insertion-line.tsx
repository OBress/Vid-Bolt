import React from 'react';
import { TIMELINE_CONSTANTS } from '../constants';
import { Plus } from 'lucide-react';
import { getTrackYOffset } from './canvas-timeline/canvas-timeline-utils';

interface TimelineInsertionLineProps {
  insertionIndex: number | null;
  trackCount: number;
  trackHeight?: number;
  tracks?: ReadonlyArray<{ type: string; group?: string }>;
}

/**
 * Timeline insertion line component that shows where a new track would be inserted
 * Appears on the boundary BETWEEN tracks, not in the middle
 */
export const TimelineInsertionLine: React.FC<TimelineInsertionLineProps> = ({
  insertionIndex,
  trackCount,
  trackHeight = TIMELINE_CONSTANTS.TRACK_HEIGHT,
  tracks,
}) => {
  if (insertionIndex === null) {
    return null;
  }

  // Position using group-aware Y calculation
  const topPosition = tracks && tracks.length > 0
    ? (insertionIndex < tracks.length
        ? getTrackYOffset(insertionIndex, trackHeight, tracks)
        : getTrackYOffset(tracks.length - 1, trackHeight, tracks) + trackHeight)
    : insertionIndex * trackHeight;

  return (
    <>
      {/* Main insertion line - positioned at track boundary */}
      <div
        className="absolute left-0 right-0 pointer-events-none flex items-center justify-center"
        style={{
          top: `${topPosition}px`,
          zIndex: 100,
          height: '3px',
          backgroundColor: 'rgb(59, 130, 246)',
          boxShadow: '0 0 16px rgba(59, 130, 246, 0.9), 0 0 4px rgba(59, 130, 246, 1)',
        }}
      >
        {/* "New Track" label */}
        <div 
          className="absolute flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap"
          style={{
            backgroundColor: 'rgb(59, 130, 246)',
            color: 'white',
            transform: 'translateY(0)',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
          }}
        >
          <Plus className="w-3 h-3" />
          New Track
        </div>
      </div>
      
      {/* Highlighted zone around the insertion line */}
      <div
        className="absolute left-0 right-0 pointer-events-none"
        style={{
          top: `${topPosition - 12}px`,
          zIndex: 99,
          height: '24px',
          background: 'linear-gradient(to bottom, transparent, rgba(59, 130, 246, 0.2), transparent)',
        }}
      />
    </>
  );
};
