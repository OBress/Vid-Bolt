/**
 * TrackInsertionIndicator - Visual indicator for track insertion
 * 
 * Shows blue lines with "Add Track" text when dragging media near track boundaries
 * Each insertion shows at its actual position in the timeline with its own label
 */

import React from 'react';
import { Plus } from 'lucide-react';

interface TrackInsertionIndicatorProps {
  insertions: Array<{
    insertionIndex: number; // Position where this track will be inserted
    trackType: 'video' | 'audio'; // Type of track
  }>;
  trackHeight: number; // Height of each track in pixels
  trackCount: number; // Total number of tracks
  spacerHeight?: number; // Height of the spacer at the top (default: 28)
  tracks?: Array<{ type: 'video' | 'audio' }>; // Track list to calculate divider position
}

export const TrackInsertionIndicator: React.FC<TrackInsertionIndicatorProps> = ({
  insertions,
  trackHeight,
  trackCount,
  spacerHeight = 28,
  tracks = [],
}) => {
  // Calculate where the video/audio divider is
  // The divider appears after all video tracks and has height of trackHeight / 2
  const firstAudioIndex = tracks.findIndex(t => t.type === 'audio');
  const dividerHeight = trackHeight / 2;
  
  return (
    <>
      {insertions.map((insertion, index) => {
        // Calculate Y position based on insertion index
        // insertionIndex 0 = before first track (after spacer)
        // insertionIndex 1 = between track 0 and track 1
        // insertionIndex n = after last track
        let yPosition = spacerHeight + (insertion.insertionIndex * trackHeight);
        
        // If this is an audio track and there are video tracks before it,
        // add the divider height to account for the space between video and audio sections
        if (insertion.trackType === 'audio' && firstAudioIndex !== -1 && insertion.insertionIndex >= firstAudioIndex) {
          yPosition += dividerHeight;
        }
        
        // Get label for this specific track type
        const labelText = `Add ${insertion.trackType === 'video' ? 'Video' : 'Audio'} Track`;
        
        return (
          <div
            key={`${insertion.trackType}-${insertion.insertionIndex}`}
            className="absolute left-0 right-0 pointer-events-none z-[100]"
            style={{
              top: `${yPosition}px`,
              transform: 'translateY(-50%)',
            }}
          >
            {/* Blue insertion line */}
            <div className="relative w-full">
              <div className="h-[2px] bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
              
              {/* Label for this track */}
              <div className="absolute left-1/2 top-0 transform -translate-x-1/2 -translate-y-1/2">
                <div className="flex items-center gap-1.5 px-3 py-1 bg-blue-500 text-white text-xs font-medium rounded-full shadow-lg whitespace-nowrap">
                  <Plus className="w-3 h-3" />
                  <span>{labelText}</span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
};
