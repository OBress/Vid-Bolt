import React, { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { TimelineItem } from '../types';
import { 
  useVideoEditorStore, 
  getCurrentDrag,
} from '../../../stores/video-editor-store';
import { VideoTransitionType, AudioTransitionType } from '../../../types';

interface TimelineBoundaryTransitionDropZoneProps {
  firstItem: TimelineItem;
  secondItem: TimelineItem;
  totalDuration: number;
  isVideoTrack: boolean;
  hasExistingTransition: boolean;
}

/**
 * Drop zone that appears AT THE BOUNDARY between two adjacent timeline items.
 * 
 * This component calls the store's addBetweenTransition action directly,
 * eliminating the need for callback chains through parent components.
 * 
 * Width calculation:
 * - 1 second on each side of the boundary = 2 seconds total
 * - Capped at half of each item's duration (whichever is smaller)
 */
export const TimelineBoundaryTransitionDropZone: React.FC<TimelineBoundaryTransitionDropZoneProps> = ({
  firstItem,
  secondItem,
  totalDuration,
  isVideoTrack,
  hasExistingTransition,
}) => {
  const [isHovering, setIsHovering] = useState(false);
  const [isCompatible, setIsCompatible] = useState(true);

  // Get drag state from unified store
  const drag = useVideoEditorStore(state => state.dragState);
  const isDraggingVideoTransition = drag?.type === 'video-transition';
  const isDraggingAudioTransition = drag?.type === 'audio-transition';
  const isCurrentlyDraggingTransition = isDraggingVideoTransition || isDraggingAudioTransition;
  
  // Check compatibility: video transitions only on video tracks, audio only on audio tracks
  const isCompatibleDrag = (isDraggingVideoTransition && isVideoTrack) || 
                          (isDraggingAudioTransition && !isVideoTrack);

  // Calculate the boundary position and zone width
  const boundaryTime = firstItem.end;
  const firstItemDuration = firstItem.end - firstItem.start;
  const secondItemDuration = secondItem.end - secondItem.start;
  
  const extendIntoFirst = Math.min(1, firstItemDuration / 2);
  const extendIntoSecond = Math.min(1, secondItemDuration / 2);
  
  const zoneStart = boundaryTime - extendIntoFirst;
  const zoneEnd = boundaryTime + extendIntoSecond;
  
  const leftPercentage = (zoneStart / totalDuration) * 100;
  const widthPercentage = ((zoneEnd - zoneStart) / totalDuration) * 100;

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    
    const dragData = getCurrentDrag();
    if (dragData) {
      const isVideoTransition = dragData.type === "video-transition";
      const isAudioTransition = dragData.type === "audio-transition";
      
      if (isVideoTransition || isAudioTransition) {
        const compatible = isVideoTransition === isVideoTrack;
        setIsCompatible(compatible);
        if (compatible) {
          setIsHovering(true);
        }
        return;
      }
    }
    
    setIsHovering(true);
  }, [isVideoTrack]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsHovering(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.stopPropagation();
    setIsHovering(false);
    setIsCompatible(true);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsHovering(false);
    setIsCompatible(true);
    
    const dragData = getCurrentDrag();
    if (!dragData) {
      console.warn('[BoundaryDropZone] No drag data on drop');
      return;
    }
    
    const isVideoTransition = dragData.type === "video-transition";
    const isAudioTransition = dragData.type === "audio-transition";
    
    if (!isVideoTransition && !isAudioTransition) {
      console.warn('[BoundaryDropZone] Not a transition drag:', dragData.type);
      return;
    }
    
    // Validate compatibility
    if (isVideoTransition !== isVideoTrack) {
      console.warn('[BoundaryDropZone] Incompatible transition type');
      return;
    }
    
    // Calculate transition duration and offset
    const transitionDuration = extendIntoFirst + extendIntoSecond;
    const initialOffset = (extendIntoSecond - extendIntoFirst) / 2;
    const transitionType = dragData.transitionType as VideoTransitionType | AudioTransitionType;
    
    console.log('[BoundaryDropZone] Adding transition:', {
      firstClipId: firstItem.id,
      secondClipId: secondItem.id,
      type: transitionType,
      duration: transitionDuration,
    });
    
    // Call store directly - no callback chain needed!
    const result = useVideoEditorStore.getState().addBetweenTransition({
      firstClipId: firstItem.id,
      secondClipId: secondItem.id,
      type: transitionType,
      isAudio: isAudioTransition,
      duration: transitionDuration,
      offset: initialOffset,
    } as any);
    
    console.log('[BoundaryDropZone] Transition added:', result);
    
    // Clear drag state after successful drop
    useVideoEditorStore.getState().endDrag();
  }, [firstItem.id, secondItem.id, isVideoTrack, extendIntoFirst, extendIntoSecond]);

  // Don't render if not dragging, has existing transition, or incompatible type
  if (!isCurrentlyDraggingTransition || hasExistingTransition || !isCompatibleDrag) {
    return null;
  }

  return (
    <div
      className={cn(
        "absolute pointer-events-auto transition-all duration-150",
        "flex items-center justify-center",
        !isCompatible
          ? "bg-red-500/60 border-[3px] border-red-400 shadow-[0_0_12px_rgba(239,68,68,0.6)] cursor-not-allowed"
          : isHovering
            ? "bg-purple-500/70 border-[3px] border-purple-300 shadow-[0_0_16px_rgba(168,85,247,0.8)]"
            : "bg-purple-600/50 border-[3px] border-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.5)]"
      )}
      style={{
        left: `${leftPercentage}%`,
        top: '50%',
        width: `${widthPercentage}%`,
        minWidth: '40px',
        height: 'calc(var(--timeline-item-height, 40px) * 0.76)',
        transform: 'translateY(-50%)',
        borderRadius: '4px',
        zIndex: 100,
      }}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      title={
        !isCompatible 
          ? (isVideoTrack ? "Video transitions only" : "Audio transitions only")
          : "Drop transition here (between clips)"
      }
    >
      <div className="text-[10px] font-bold text-white/90 text-center drop-shadow-md">
        {isHovering ? "DROP" : "⬌"}
      </div>
    </div>
  );
};
