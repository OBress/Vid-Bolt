import React from 'react';

interface TrackInfo {
  type: 'video' | 'audio';
}

interface TimelineMagneticInsertionIndicatorProps {
  insertionStart: number; // Time position where snap occurs (in seconds)
  totalDuration: number;
  trackHeight?: number;
  trackIndex: number; // Track index of the item being dragged
  snappedToTrackIndex?: number; // Track index of the item being snapped to
  trackCount?: number; // Total number of tracks
  tracks?: TrackInfo[]; // Track type info for calculating divider positions
}

/**
 * Format time in seconds to timecode format (MM:SS.ms or HH:MM:SS.ms)
 */
const formatTimecode = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
};

/**
 * Calculate the Y position of a track, accounting for the divider between video and audio tracks
 */
const calculateTrackTopPosition = (
  trackIndex: number, 
  trackHeight: number, 
  headerOffset: number,
  tracks?: TrackInfo[]
): number => {
  let position = headerOffset;
  
  if (!tracks) {
    // Fallback: simple calculation without divider
    return position + (trackIndex * trackHeight);
  }
  
  // Calculate position accounting for the video/audio divider
  for (let i = 0; i < trackIndex; i++) {
    position += trackHeight;
    // Add divider height if transitioning from video to audio
    if (i < tracks.length - 1 && tracks[i].type === 'video' && tracks[i + 1].type === 'audio') {
      position += trackHeight / 2; // Divider is half track height
    }
  }
  
  return position;
};

/**
 * Visual indicator showing where items snap together across tracks
 * Displays a vertical line between the two tracks involved in the snap
 * Shows timecode at the snap position
 */
export const TimelineMagneticInsertionIndicator: React.FC<TimelineMagneticInsertionIndicatorProps> = ({
  insertionStart,
  totalDuration,
  trackHeight = 48,
  trackIndex,
  snappedToTrackIndex,
  trackCount = 1,
  tracks,
}) => {
  // Calculate horizontal position as percentage
  const leftPercentage = (insertionStart / totalDuration) * 100;
  
  const headerOffset = 28; // "Add Video Track" button height
  
  // Determine if this is cross-track snapping (snapping to a different track)
  const isCrossTrack = snappedToTrackIndex !== undefined && snappedToTrackIndex !== trackIndex;
  
  // Calculate the line position to span between the two tracks involved
  let topPosition: number;
  let lineHeight: number;
  
  if (isCrossTrack && snappedToTrackIndex !== undefined) {
    // Line spans from the top of the higher track to the bottom of the lower track
    const minTrack = Math.min(trackIndex, snappedToTrackIndex);
    const maxTrack = Math.max(trackIndex, snappedToTrackIndex);
    
    topPosition = calculateTrackTopPosition(minTrack, trackHeight, headerOffset, tracks);
    const bottomPosition = calculateTrackTopPosition(maxTrack, trackHeight, headerOffset, tracks) + trackHeight;
    lineHeight = bottomPosition - topPosition;
  } else {
    // Single track snap - just show on that track
    topPosition = calculateTrackTopPosition(trackIndex, trackHeight, headerOffset, tracks);
    lineHeight = trackHeight;
  }

  // Line color - green for cross-track, blue for same-track
  const lineColor = isCrossTrack ? 'rgb(34, 197, 94)' : 'rgb(59, 130, 246)';
  const glowColor = isCrossTrack ? 'rgba(34, 197, 94, 0.6)' : 'rgba(59, 130, 246, 0.8)';
  const highlightColor = isCrossTrack ? 'rgba(34, 197, 94, 0.15)' : 'rgba(59, 130, 246, 0.2)';

  return (
    <>
      {/* Timecode label at the top of the snap line */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: `${leftPercentage}%`,
          top: `${topPosition - 18}px`,
          transform: 'translateX(-50%)',
          zIndex: 103,
        }}
      >
        <div
          className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium whitespace-nowrap"
          style={{
            backgroundColor: lineColor,
            color: 'white',
            boxShadow: `0 1px 4px ${glowColor}`,
          }}
        >
          {formatTimecode(insertionStart)}
        </div>
      </div>
      
      {/* Vertical snap line */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: `${leftPercentage}%`,
          top: `${topPosition}px`,
          height: `${lineHeight}px`,
          width: '2px',
          backgroundColor: lineColor,
          boxShadow: `0 0 6px ${glowColor}`,
          zIndex: 101,
        }}
      >
        {/* Arrow at top */}
        <div
          className="absolute"
          style={{
            top: '-4px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '4px solid transparent',
            borderRight: '4px solid transparent',
            borderTop: `4px solid ${lineColor}`,
          }}
        />
        
        {/* Arrow at bottom */}
        <div
          className="absolute"
          style={{
            bottom: '-4px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '4px solid transparent',
            borderRight: '4px solid transparent',
            borderBottom: `4px solid ${lineColor}`,
          }}
        />
      </div>
      
      {/* Highlighted snap zone */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: `${leftPercentage}%`,
          top: `${topPosition}px`,
          height: `${lineHeight}px`,
          width: '12px',
          transform: 'translateX(-50%)',
          background: `linear-gradient(to right, transparent, ${highlightColor}, transparent)`,
          zIndex: 100,
        }}
      />
    </>
  );
};
