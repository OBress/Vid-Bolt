import React from 'react';
import { cn } from '@/lib/utils';
import { useVideoEditorStore, getCurrentDrag } from '../../../../stores/video-editor-store';

interface TransitionDropZonesProps {
  // Note: isDraggingTransition and draggingTransitionIsVideo props are DEPRECATED
  // We now use reactive hooks from video-editor-store directly!
  isDraggingTransition?: boolean; // DEPRECATED - kept for backward compat
  draggingTransitionIsVideo?: boolean | null; // DEPRECATED - kept for backward compat
  onDropStart: (e: React.DragEvent) => void;
  onDropEnd: (e: React.DragEvent) => void;
  hasInTransition: boolean;
  hasOutTransition: boolean;
  hasAdjacentNextItem?: boolean; // Is there an item immediately after (snapped)?
  hasAdjacentPrevItem?: boolean; // Is there an item immediately before (snapped)?
  itemDuration: number; // Duration of the item in seconds
  pixelsPerSecond: number; // Zoom level
  isVideoItem: boolean; // Whether this is a video item (true) or audio item (false)
}

/**
 * Visual drop zones for transitions on timeline items
 * 
 * IMPORTANT: These zones are ONLY for standalone transitions (IN at start, OUT at end)
 * For transitions BETWEEN adjacent items, the boundary drop zone in timeline-track handles that
 * 
 * This means:
 * - If hasAdjacentPrevItem is true, DON'T show the start zone (boundary handles it)
 * - If hasAdjacentNextItem is true, DON'T show the end zone (boundary handles it)
 */
export const TimelineItemTransitionDropZones: React.FC<TransitionDropZonesProps> = ({
  isDraggingTransition,
  draggingTransitionIsVideo = null,
  onDropStart,
  onDropEnd,
  hasInTransition,
  hasOutTransition,
  hasAdjacentNextItem = false,
  hasAdjacentPrevItem = false,
  itemDuration,
  pixelsPerSecond,
  isVideoItem,
}) => {
  const [hoveredZone, setHoveredZone] = React.useState<'start' | 'end' | null>(null);
  const [isCompatible, setIsCompatible] = React.useState(true);

  // ============================================================
  // REACTIVE DRAG STATE (Uses unified VideoEditorStore!)
  // ============================================================
  
  // Get drag state from unified store
  const drag = useVideoEditorStore(state => state.dragState);
  const isDraggingVideoTransition = drag?.type === 'video-transition';
  const isDraggingAudioTransition = drag?.type === 'audio-transition';
  const isCurrentlyDraggingTransition = isDraggingVideoTransition || isDraggingAudioTransition;
  
  // Check compatibility: video transitions only on video items, audio only on audio items
  const isCompatibleDrag = (isDraggingVideoTransition && isVideoItem) || 
                          (isDraggingAudioTransition && !isVideoItem);
  
  // Calculate width for 1 second of duration, capped at 50% of item
  const oneSecondWidth = pixelsPerSecond;
  const maxWidth = (itemDuration / 2) * pixelsPerSecond;
  const zoneWidth = Math.min(oneSecondWidth, maxWidth);
  
  // Early return if not dragging a transition or incompatible
  if (!isCurrentlyDraggingTransition || !isCompatibleDrag) {
    return null;
  }

  // Determine which zones to show:
  // - Start zone: Only if NO adjacent previous item AND no existing inTransition
  // - End zone: Only if NO adjacent next item AND no existing outTransition
  const showStartZone = !hasAdjacentPrevItem && !hasInTransition;
  const showEndZone = !hasAdjacentNextItem && !hasOutTransition;

  const handleDragOver = (e: React.DragEvent, zone: 'start' | 'end') => {
    e.preventDefault();
    e.stopPropagation();
    
    // Check compatibility using unified drag store
    const dragData = getCurrentDrag();
    if (dragData) {
      const isVideoTransition = dragData.type === "video-transition";
      const isAudioTransition = dragData.type === "audio-transition";
      
      if (isVideoTransition || isAudioTransition) {
        const compatible = isVideoTransition === isVideoItem;
        setIsCompatible(compatible);
        setHoveredZone(compatible ? zone : null);
        return;
      }
    }
    
    setIsCompatible(true);
    setHoveredZone(zone);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.stopPropagation();
    setHoveredZone(null);
    setIsCompatible(true);
  };

  const handleDrop = (e: React.DragEvent, zone: 'start' | 'end') => {
    e.preventDefault();
    e.stopPropagation();
    setHoveredZone(null);
    setIsCompatible(true);
    
    // Validate transition type using centralized drag store (no JSON.parse needed)
    const dragData = getCurrentDrag();
    if (dragData) {
      const isVideoTransition = dragData.type === "video-transition";
      const isAudioTransition = dragData.type === "audio-transition";

      if ((isVideoTransition || isAudioTransition) && isVideoTransition !== isVideoItem) {
        return; // Incompatible
      }
    }
    
    if (zone === 'start') {
      onDropStart(e);
    } else {
      onDropEnd(e);
    }
  };

  return (
    <>
      {/* START/IN Drop Zone - Only for standalone IN transitions (no adjacent previous item) */}
      {/* Height is 76% to match transition overlay style (like Premiere Pro) */}
      {showStartZone && (
        <div
          className={cn(
            "absolute left-0 z-[100] pointer-events-auto transition-all duration-150 rounded-l-md",
            !isCompatible
              ? "border-[3px] border-red-500/70 bg-red-600/40 shadow-[0_0_8px_rgba(239,68,68,0.4)] cursor-not-allowed"
              : hoveredZone === 'start' 
                ? "border-[3px] border-blue-400 bg-blue-500/60 shadow-[0_0_12px_rgba(59,130,246,0.6)]" 
                : "border-[3px] border-blue-500/70 bg-blue-600/40 shadow-[0_0_8px_rgba(59,130,246,0.4)]"
          )}
          style={{ 
            width: `${zoneWidth}px`,
            top: '12%',
            bottom: '12%',
          }}
          onDragOver={(e) => handleDragOver(e, 'start')}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, 'start')}
          title={!isCompatible ? (isVideoItem ? "Video transitions only" : "Audio transitions only") : "Drop IN transition here"}
        />
      )}

      {/* END/OUT Drop Zone - Only for standalone OUT transitions (no adjacent next item) */}
      {/* Height is 76% to match transition overlay style (like Premiere Pro) */}
      {showEndZone && (
        <div
          className={cn(
            "absolute right-0 z-[100] pointer-events-auto transition-all duration-150 rounded-r-md",
            !isCompatible
              ? "border-[3px] border-red-500/70 bg-red-600/40 shadow-[0_0_8px_rgba(239,68,68,0.4)] cursor-not-allowed"
              : hoveredZone === 'end' 
                ? "border-[3px] border-blue-400 bg-blue-500/60 shadow-[0_0_12px_rgba(59,130,246,0.6)]" 
                : "border-[3px] border-blue-500/70 bg-blue-600/40 shadow-[0_0_8px_rgba(59,130,246,0.4)]"
          )}
          style={{ 
            width: `${zoneWidth}px`,
            top: '12%',
            bottom: '12%',
          }}
          onDragOver={(e) => handleDragOver(e, 'end')}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, 'end')}
          title={!isCompatible ? (isVideoItem ? "Video transitions only" : "Audio transitions only") : "Drop OUT transition here"}
        />
      )}
    </>
  );
};
