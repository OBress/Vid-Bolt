import React, { memo } from "react";
import { TIMELINE_CONSTANTS } from "../constants";
import { ImageIcon, Film, Music } from "lucide-react";

interface GhostElementProps {
  left: number;
  width: number;
  top: number;
  isTransitioning?: boolean;
}

interface TimelineGhostElementProps {
  ghostElement: GhostElementProps;
  rowIndex: number;
  trackCount: number;
  isValidDrop?: boolean;
  isFloating?: boolean;
  floatingPosition?: { x: number; y: number };
  itemData?: {
    type?: string;
    label?: string;
    thumbnailUrl?: string;
  };
  isAudioTrack?: boolean;
}

// Pre-calculate gradients to avoid recalculation on each render
const BLUE_GRADIENT =
  "repeating-linear-gradient(45deg, rgba(59, 130, 246, 0.8), rgba(59, 130, 246, 0.8) 10px, rgba(59, 130, 246, 0.7) 10px, rgba(59, 130, 246, 0.7) 20px)";
const RED_GRADIENT =
  "repeating-linear-gradient(45deg, rgba(239, 68, 68, 0.8), rgba(239, 68, 68, 0.8) 10px, rgba(239, 68, 68, 0.7) 10px, rgba(239, 68, 68, 0.7) 20px)";

// Get icon for media type
const MediaTypeIcon: React.FC<{ type?: string; className?: string }> = ({ type, className = "h-4 w-4" }) => {
  switch (type) {
    case 'video':
      return <Film className={className} />;
    case 'image':
      return <ImageIcon className={className} />;
    case 'audio':
      return <Music className={className} />;
    default:
      return <Film className={className} />;
  }
};

/**
 * Renders a ghost element on the timeline during drag-and-drop operations.
 * This component provides a visual cue for where an element will be placed if dropped.
 * It changes appearance based on whether the drop target is valid.
 *
 * Supports two modes:
 * 1. Row-aligned mode (original): Ghost snaps to specific rows
 * 2. Floating mode (new): Ghost follows mouse position exactly for smoother transitions
 *
 * Enhanced with thumbnail preview support for media items.
 */
export const TimelineGhostElement: React.FC<TimelineGhostElementProps> = ({
  ghostElement,
  rowIndex,
  trackCount,
  isValidDrop = true,
  isFloating = false,
  floatingPosition,
  itemData,
  isAudioTrack = false,
}) => {
  const hasThumbnail = !isAudioTrack && itemData?.thumbnailUrl && (itemData.type === 'video' || itemData.type === 'image');
  const isAudio = isAudioTrack || itemData?.type === 'audio';

  if (isFloating) {
    return (
      <div
        className="fixed rounded-[4px] pointer-events-none z-[9999] overflow-hidden shadow-lg"
        style={{
          left: floatingPosition?.x || 0,
          top: floatingPosition?.y || 0,
          width: hasThumbnail ? '120px' : '100px',
          height: `${TIMELINE_CONSTANTS.TRACK_ITEM_HEIGHT}px`,
          willChange: "transform",
          transform: "translate(-50%, -50%)",
          border: `2px solid ${isValidDrop ? 'rgba(59, 130, 246, 0.9)' : 'rgba(239, 68, 68, 0.9)'}`,
        }}
      >
        {hasThumbnail ? (
          <div className="relative w-full h-full">
            <img 
              src={itemData.thumbnailUrl} 
              alt="" 
              className="w-full h-full object-cover"
              draggable={false}
            />
            <div 
              className="absolute inset-0"
              style={{ 
                background: isValidDrop 
                  ? 'linear-gradient(to right, rgba(59, 130, 246, 0.3), transparent 50%)' 
                  : 'linear-gradient(to right, rgba(239, 68, 68, 0.4), rgba(239, 68, 68, 0.2))'
              }}
            />
            {/* Type icon badge */}
            <div className="absolute top-1 left-1 p-1 bg-black/60 rounded">
              <MediaTypeIcon type={itemData.type} className="h-3 w-3 text-white" />
            </div>
          </div>
        ) : (
          <div 
            className="w-full h-full flex items-center justify-center"
            style={{ backgroundImage: isValidDrop ? BLUE_GRADIENT : RED_GRADIENT }}
          >
            {itemData?.type && (
              <MediaTypeIcon type={itemData.type} className="h-5 w-5 text-white/90" />
            )}
          </div>
        )}
      </div>
    );
  }

  // Use the same calculation as ghost creation to avoid floating-point precision issues
  // Ghost creation: trackIndex * (100 / trackCount) = ghost.top
  // So: trackIndex = ghost.top * trackCount / 100
  const calculatedIndex = Math.round(ghostElement.top * trackCount / 100);
  if (calculatedIndex !== rowIndex) {
    return null;
  }

  // Audio track ghost - waveform style
  if (isAudio) {
    return (
      <div
        className="absolute top-1/2 transform -translate-y-1/2 rounded-[4px] pointer-events-none overflow-hidden"
        style={{
          left: `${ghostElement.left}%`,
          width: `${Math.max(ghostElement.width, 0.1)}%`,
          height: `${TIMELINE_CONSTANTS.TRACK_ITEM_HEIGHT}px`,
          zIndex: 50,
          willChange: "transform",
          border: `2px solid ${isValidDrop ? 'rgba(34, 197, 94, 0.9)' : 'rgba(239, 68, 68, 0.9)'}`,
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          background: isValidDrop 
            ? 'linear-gradient(180deg, rgba(34, 197, 94, 0.3) 0%, rgba(34, 197, 94, 0.15) 100%)'
            : 'linear-gradient(180deg, rgba(239, 68, 68, 0.3) 0%, rgba(239, 68, 68, 0.15) 100%)',
        }}
      >
        {/* Waveform visualization bars */}
        <div className="absolute inset-0 flex items-center justify-around px-1 gap-[2px]">
          {Array.from({ length: Math.min(Math.max(Math.floor(ghostElement.width * 2), 8), 40) }).map((_, i) => {
            // Deterministic pseudo-random based on index for consistent rendering
            const pseudoRandom = ((i * 7919) % 100) / 100;
            return (
              <div
                key={i}
                className="flex-shrink-0 rounded-full"
                style={{
                  width: '2px',
                  height: `${20 + Math.sin(i * 0.7) * 15 + pseudoRandom * 10}%`,
                  backgroundColor: isValidDrop ? 'rgba(34, 197, 94, 0.7)' : 'rgba(239, 68, 68, 0.7)',
                }}
              />
            );
          })}
        </div>
        {/* Audio icon */}
        <div className="absolute top-1 left-1 p-0.5 bg-black/40 rounded">
          <Music className="h-2.5 w-2.5 text-white" />
        </div>
        {/* Label */}
        {itemData?.label && (
          <div className="absolute bottom-0 left-0 right-0 px-1.5 py-0.5 bg-black/40 truncate">
            <span className="text-[10px] text-white/80">{itemData.label}</span>
          </div>
        )}
      </div>
    );
  }

  // Row-aligned ghost with thumbnail support (for video/image)
  return (
    <div
      className="absolute top-1/2 transform -translate-y-1/2 rounded-[4px] pointer-events-none overflow-hidden"
      style={{
        left: `${ghostElement.left}%`,
        width: `${Math.max(ghostElement.width, 0.1)}%`,
        height: `${TIMELINE_CONSTANTS.TRACK_ITEM_HEIGHT}px`,
        zIndex: 50,
        willChange: "transform",
        border: `2px solid ${isValidDrop ? 'rgba(59, 130, 246, 0.9)' : 'rgba(239, 68, 68, 0.9)'}`,
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      }}
    >
      {hasThumbnail ? (
        <div className="relative w-full h-full">
          <img 
            src={itemData.thumbnailUrl} 
            alt="" 
            className="w-full h-full object-cover"
            draggable={false}
          />
          <div 
            className="absolute inset-0"
            style={{ 
              background: isValidDrop 
                ? 'linear-gradient(to right, rgba(59, 130, 246, 0.3), transparent 50%)' 
                : 'linear-gradient(to right, rgba(239, 68, 68, 0.4), rgba(239, 68, 68, 0.2))'
            }}
          />
          {/* Type icon badge */}
          <div className="absolute top-1 left-1 p-0.5 bg-black/60 rounded">
            <MediaTypeIcon type={itemData.type} className="h-2.5 w-2.5 text-white" />
          </div>
          {/* Label */}
          {itemData?.label && (
            <div className="absolute bottom-0 left-0 right-0 px-1.5 py-0.5 bg-black/60 truncate">
              <span className="text-[10px] text-white/90">{itemData.label}</span>
            </div>
          )}
        </div>
      ) : (
        <div 
          className="w-full h-full flex items-center justify-center gap-1.5"
          style={{ backgroundImage: isValidDrop ? BLUE_GRADIENT : RED_GRADIENT }}
        >
          {itemData?.type && (
            <MediaTypeIcon type={itemData.type} className="h-4 w-4 text-white/90" />
          )}
          {itemData?.label && (
            <span className="text-xs text-white/90 truncate max-w-[80%]">{itemData.label}</span>
          )}
        </div>
      )}
    </div>
  );
};

// Memoize to prevent re-renders when parent updates but props haven't changed
export const MemoizedTimelineGhostElement = memo(TimelineGhostElement);