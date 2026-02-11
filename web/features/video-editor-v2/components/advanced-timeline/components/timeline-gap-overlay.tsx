import React, { useMemo, useState } from 'react';
import { TrackWithClips, TimelineItem } from '../types';
import { useVideoEditorStore, selectEditMode } from '../../../stores/video-editor-store';
import { TIMELINE_CONSTANTS } from '../constants';

interface Gap {
  trackIndex: number;
  trackId: string;
  start: number;
  end: number;
  duration: number;
  itemAfterGap: TimelineItem | null; // The item that comes after this gap
}

interface TimelineGapOverlayProps {
  tracks: TrackWithClips[];
  totalDuration: number;
  onCloseGap: (trackId: string, gapStart: number, gapEnd: number, itemsToShift: TimelineItem[]) => void;
  trackHeight?: number; // Track height in pixels (for compact mode support)
}

/**
 * Timeline Gap Overlay - Renders clickable gap indicators when the Gap tool is active
 * Clicking on a gap closes it by shifting all subsequent items on that track
 */
export const TimelineGapOverlay: React.FC<TimelineGapOverlayProps> = ({
  tracks,
  totalDuration,
  onCloseGap,
  trackHeight: propTrackHeight,
}) => {
  // Use provided track height or fall back to default
  const trackHeight = propTrackHeight || TIMELINE_CONSTANTS.TRACK_HEIGHT;
  const editMode = useVideoEditorStore(selectEditMode);
  const [hoveredGap, setHoveredGap] = useState<string | null>(null);

  // Calculate gaps for all tracks
  // NOTE: This must be above the early return to maintain consistent hook call order
  const gaps = useMemo(() => {
    if (editMode !== 'gap') return [];
    
    const allGaps: Gap[] = [];
    
    tracks.forEach((track, trackIndex) => {
      if (track.items.length === 0) return;
      
      // Sort items by start time
      const sortedItems = [...track.items].sort((a, b) => a.start - b.start);
      
      // Check for gap at the start (before first item)
      if (sortedItems[0].start > 0.01) { // Small threshold to avoid floating point issues
        allGaps.push({
          trackIndex,
          trackId: track.id,
          start: 0,
          end: sortedItems[0].start,
          duration: sortedItems[0].start,
          itemAfterGap: sortedItems[0],
        });
      }
      
      // Check for gaps between items
      for (let i = 0; i < sortedItems.length - 1; i++) {
        const currentItem = sortedItems[i];
        const nextItem = sortedItems[i + 1];
        const gapStart = currentItem.end;
        const gapEnd = nextItem.start;
        const gapDuration = gapEnd - gapStart;
        
        // Only consider it a gap if it's more than a tiny amount (0.01 seconds)
        if (gapDuration > 0.01) {
          allGaps.push({
            trackIndex,
            trackId: track.id,
            start: gapStart,
            end: gapEnd,
            duration: gapDuration,
            itemAfterGap: nextItem,
          });
        }
      }
    });
    
    return allGaps;
  }, [tracks, editMode]);

  const handleGapClick = (gap: Gap) => {
    // Find all items on this track that come after the gap
    const track = tracks.find(t => t.id === gap.trackId);
    if (!track) return;
    
    const itemsToShift = track.items.filter(item => item.start >= gap.end);
    onCloseGap(gap.trackId, gap.start, gap.end, itemsToShift);
  };

  const formatDuration = (seconds: number): string => {
    if (seconds < 1) {
      return `${(seconds * 1000).toFixed(0)}ms`;
    }
    return `${seconds.toFixed(1)}s`;
  };

  // Only show gaps when gap tool is active
  if (editMode !== 'gap') {
    return null;
  }

  return (
    <>
      {gaps.map((gap) => {
        const gapId = `${gap.trackId}-${gap.start}-${gap.end}`;
        const isHovered = hoveredGap === gapId;
        const leftPercent = (gap.start / totalDuration) * 100;
        const widthPercent = (gap.duration / totalDuration) * 100;
        
        // Calculate top position based on track index
        // Account for the header height (28px) and dynamic track height
        const headerHeight = 28;
        const topPosition = headerHeight + (gap.trackIndex * trackHeight);
        
        return (
          <div
            key={gapId}
            className="absolute cursor-pointer transition-all duration-150"
            style={{
              left: `${leftPercent}%`,
              width: `${widthPercent}%`,
              top: `${topPosition}px`,
              height: `${trackHeight}px`,
              backgroundColor: isHovered 
                ? 'rgba(239, 68, 68, 0.4)' 
                : 'rgba(239, 68, 68, 0.15)',
              border: isHovered 
                ? '2px dashed rgba(239, 68, 68, 0.9)' 
                : '1px dashed rgba(239, 68, 68, 0.5)',
              zIndex: 40,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '4px',
            }}
            onClick={() => handleGapClick(gap)}
            onMouseEnter={() => setHoveredGap(gapId)}
            onMouseLeave={() => setHoveredGap(null)}
          >
            {/* Gap indicator */}
            <div 
              className={`
                flex items-center gap-1 px-2 py-1 rounded text-xs font-medium
                transition-all duration-150
                ${isHovered 
                  ? 'bg-red-500 text-white scale-105' 
                  : 'bg-red-500/80 text-white/90'
                }
              `}
              style={{
                // Only show the label if the gap is wide enough
                opacity: widthPercent > 3 ? 1 : 0,
              }}
            >
              <span className="text-[10px]">Gap: {formatDuration(gap.duration)}</span>
            </div>
          </div>
        );
      })}
    </>
  );
};

export default TimelineGapOverlay;
