import React, { useRef, useCallback, useState } from 'react';
import { TrackWithClips as TimelineTrackType, TrackType } from '../types';
import { TIMELINE_CONSTANTS } from '../constants';
import { GripVertical, Trash2, Eye, EyeOff, Lock, Unlock, Volume2, VolumeX, Plus, Video, Music } from 'lucide-react';

interface TimelineTrackHandlesProps {
  tracks: TimelineTrackType[];
  onTrackReorder?: (...args: any[]) => void;
  onTrackDelete?: (trackId: string) => void;
  onToggleLock?: (trackId: string) => void;
  onToggleVisibility?: (trackId: string) => void;
  onToggleMute?: (trackId: string) => void;
  onToggleSolo?: (trackId: string) => void;
  onAddTrack?: (type: TrackType) => void; // New: Add empty track
  enableTrackDrag?: boolean;
  enableTrackDelete?: boolean;
  scrollY?: number; // Virtual scroll Y offset (pixels)
}

export const TimelineTrackHandles: React.FC<TimelineTrackHandlesProps> = ({
  tracks,
  onTrackReorder,
  onTrackDelete,
  onToggleLock,
  onToggleVisibility,
  onToggleMute,
  onToggleSolo,
  onAddTrack,
  enableTrackDrag = true,
  enableTrackDelete = true,
  scrollY = 0,
}) => {
  const dragIndexRef = useRef<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = useCallback((index: number) => (e: React.DragEvent<HTMLDivElement>) => {
    dragIndexRef.current = index;
    setIsDragging(true);
    e.dataTransfer.effectAllowed = 'move';
    // For Firefox compatibility
    e.dataTransfer.setData('text/plain', String(index));
  }, []);

  const handleDragOver = useCallback((index: number) => (e: React.DragEvent<HTMLDivElement>) => {
    // Only accept track reorder drags, not media drops
    // Track reorder drags set data with 'text/plain' containing the index
    // and have the internal isDragging state set
    if (!isDragging) {
      // Not a track reorder drag - ignore
      e.dataTransfer.dropEffect = 'none';
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  }, [isDragging]);

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null);
  }, []);

  const handleDrop = useCallback((toIndex: number) => (e: React.DragEvent<HTMLDivElement>) => {
    // Only accept track reorder drags
    if (!isDragging) {
      return; // Not a track reorder drag - ignore
    }
    e.preventDefault();
    const fromIndex = dragIndexRef.current ?? parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (!Number.isNaN(fromIndex) && fromIndex !== toIndex) {
      onTrackReorder?.(fromIndex, toIndex);
    }
    dragIndexRef.current = null;
    setIsDragging(false);
    setDragOverIndex(null);
  }, [onTrackReorder, isDragging]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    setDragOverIndex(null);
    dragIndexRef.current = null;
  }, []);

  // Find the index where audio tracks start
  const audioStartIndex = tracks.findIndex(t => t.type === 'audio');
  const hasVideoTracks = tracks.some(t => t.type === 'video');
  const hasAudioTracks = tracks.some(t => t.type === 'audio');
  
  // Determine if we need to show the "Add Audio Track" button at the bottom
  // (when there are no audio tracks or no video-to-audio transition)
  const needsBottomAudioButton = !hasAudioTracks || audioStartIndex === -1;

  return (
    <div 
      className="flex flex-col h-full bg-background border-r border-border border-l overflow-hidden"
      style={{ 
        width: `${TIMELINE_CONSTANTS.HANDLE_WIDTH}px`,
      }}
    >
      {/* Header - empty for alignment with timeline markers */}
      <div 
        className="flex-shrink-0 bg-background border-b border-neutral-700"
        style={{ height: `${TIMELINE_CONSTANTS.MARKERS_HEIGHT}px` }}
      />
      
      {/* Track handles - virtual scroll matches timeline content */}
      <div 
        className="flex-1 overflow-hidden track-handles-scroll"
      >
        {/* Inner container with virtual scroll transform */}
        <div
        style={{
            transform: `translateY(${-scrollY}px)`,
        }}
      >
        {/* Add Video Track button - at top, above all video tracks */}
        <button
          type="button"
          onClick={() => onAddTrack?.('video')}
          className="w-full h-7 flex items-center justify-start gap-2 px-2 bg-neutral-900 hover:bg-purple-500/20 text-purple-400 hover:text-purple-300 transition-colors border-b border-neutral-700 text-[10px] font-medium"
        >
          <Plus className="w-3 h-3" />
          <span>Add Video Track</span>
        </button>

        {tracks.map((track, index) => {
          const isBeingDragged = isDragging && dragIndexRef.current === index;
          const isDropTarget = dragOverIndex === index && dragIndexRef.current !== index;
          
          // Check if we need to render a divider before this track
          const previousTrack = index > 0 ? tracks[index - 1] : null;
          const isTransitionToAudio = previousTrack?.type === 'video' && track.type === 'audio';
          
          // Enhanced visual feedback classes
          const getTrackClasses = () => {
            const baseClasses = "track flex items-center px-1 gap-0.5 border-b border-neutral-700";
            
            if (isBeingDragged) {
              // Track being dragged - make it very obvious
              return `${baseClasses} bg-muted border-l-[2px] border-l-neutral-500 transform scale-105 z-50 opacity-90`;
            } else if (isDropTarget) {
              // Drop target - highlight clearly
              return `${baseClasses} bg-[hsl(var(--primary)/0.1)] border-l-[2px] border-l-primary scale-102`;
            } else if (isDragging) {
              // Other tracks during drag - subtle dimming
              return `${baseClasses} bg-background opacity-70`;
            }
            
            // Default state
            return `${baseClasses} bg-background hover:bg-muted`;
          };
          
          const isVideoTrack = track.type === 'video';
          const isAudioTrack = track.type === 'audio';
          
          return (
            <React.Fragment key={track.id}>
              {/* Audio Tracks Section Header with Add Audio Track button */}
              {isTransitionToAudio && (
                <button
                  type="button"
                  onClick={() => onAddTrack?.('audio')}
                  className="w-full flex items-center justify-start gap-2 px-2 bg-neutral-800 hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 transition-colors border-b border-neutral-700 text-[10px] font-medium"
                  style={{ height: 'calc(var(--timeline-track-height, 48px) / 2)' }}
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Audio Track</span>
                </button>
              )}
              <div
                className={getTrackClasses()}
              style={{ 
                height: 'var(--timeline-track-height, 48px)'
              }}
              onDragOver={handleDragOver(index)}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop(index)}
            >
              {/* Lock toggle */}
              <button
                type="button"
                className={`w-5 h-5 inline-flex items-center justify-center rounded hover:bg-muted ${
                  track.locked ? 'text-red-400' : 'text-muted-foreground'
                }`}
                onClick={() => onToggleLock?.(track.id)}
                title={track.locked ? 'Unlock track' : 'Lock track'}
              >
                {track.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
              </button>

              {/* Visibility toggle (for video tracks) */}
              {isVideoTrack && (
                <button
                  type="button"
                  className={`w-5 h-5 inline-flex items-center justify-center rounded hover:bg-muted ${
                    track.visible === false ? 'text-muted-foreground/50' : 'text-muted-foreground'
                  }`}
                  onClick={() => onToggleVisibility?.(track.id)}
                  title={track.visible === false ? 'Show track' : 'Hide track'}
                >
                  {track.visible === false ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                </button>
              )}

              {/* Mute toggle (for audio tracks) */}
              {isAudioTrack && (
                <button
                  type="button"
                  className={`w-5 h-5 inline-flex items-center justify-center rounded hover:bg-muted ${
                    track.muted ? 'text-red-400' : 'text-muted-foreground'
                  }`}
                  onClick={() => onToggleMute?.(track.id)}
                  title={track.muted ? 'Unmute track' : 'Mute track'}
                >
                  {track.muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                </button>
              )}

              {/* Drag handle */}
              {enableTrackDrag && (
              <div
                className={`flex items-center justify-center w-5 h-5 rounded select-none transition-all duration-150 ${
                  track.locked ? 'opacity-50 cursor-not-allowed' :
                  isBeingDragged 
                    ? 'bg-muted cursor-grabbing' 
                    : 'hover:bg-muted cursor-grab'
                }`}
                  draggable={!track.locked && enableTrackDrag}
                onDragStart={track.locked ? undefined : handleDragStart(index)}
                onDragEnd={handleDragEnd}
                title={track.locked ? 'Unlock track to reorder' : 'Reorder track'}
              >
                <GripVertical className={`w-3 h-3 ${isBeingDragged ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>
              )}

              {/* Delete track */}
              {enableTrackDelete && (
              <button
                type="button"
                className="w-5 h-5 inline-flex items-center justify-center rounded hover:bg-[hsl(var(--destructive)/0.1)] text-muted-foreground hover:text-destructive"
                onClick={() => onTrackDelete?.(track.id)}
                title="Delete track"
              >
                <Trash2 className="w-3 h-3" />
              </button>
              )}
            </div>
            </React.Fragment>
          );
        })}
        
        {/* Add Audio Track button at the bottom when there are no audio tracks */}
        {needsBottomAudioButton && (
          <button
            type="button"
            onClick={() => onAddTrack?.('audio')}
            className="w-full flex items-center justify-start gap-2 px-2 bg-neutral-800 hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 transition-colors border-b border-neutral-700 text-[10px] font-medium"
            style={{ height: 'calc(var(--timeline-track-height, 48px) / 2)' }}
          >
            <Plus className="w-3 h-3" />
            <span>Add Audio Track</span>
          </button>
        )}
        
        {/* Bottom padding spacer - half track height for visual comfort when scrolled */}
        <div 
          className="bg-black" 
          style={{ height: 'calc(var(--timeline-track-height, 48px) / 2)' }}
        />
        </div>
      </div>
    </div>
  );
};