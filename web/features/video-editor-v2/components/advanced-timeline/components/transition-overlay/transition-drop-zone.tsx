/**
 * ============================================================
 * TRANSITION DROP ZONE COMPONENT
 * ============================================================
 * 
 * Renders drop zones for placing transitions on timeline items.
 * Shows when dragging a transition from the sidebar.
 * 
 * Two types of zones:
 * - Single: At start/end of individual items
 * - Boundary: Between two adjacent items
 */

import React, { useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { TimelineItem } from '../../types';
import { useTransitionManager, useIsSidebarDragActive } from '../../managers/transition-manager';
import { 
  DEFAULT_TRANSITION_DURATION, 
  MAX_TRANSITION_RATIO 
} from '../../types/transition-types';

interface TransitionDropZoneSingleProps {
  item: TimelineItem;
  trackId: string;
  position: 'start' | 'end';
  totalDuration: number;
  isVideoTrack: boolean;
}

/**
 * Drop zone for a single transition at item start/end
 */
export const TransitionDropZoneSingle: React.FC<TransitionDropZoneSingleProps> = ({
  item,
  trackId,
  position,
  totalDuration,
  isVideoTrack,
}) => {
  const transitionManager = useTransitionManager();
  const isDraggingFromSidebar = useIsSidebarDragActive();
  
  // Check if transition already exists at this position
  const hasExistingTransition = (transitionManager as any).hasTransitionAt(item.id, position);
  
  // Check type compatibility
  const isCompatible = transitionManager.sidebarDragIsVideo === isVideoTrack;
  
  // Don't show if not dragging or transition already exists
  if (!isDraggingFromSidebar || hasExistingTransition) {
    return null;
  }
  
  // Calculate zone dimensions
  const itemDuration = item.end - item.start;
  const maxZoneDuration = itemDuration * MAX_TRANSITION_RATIO;
  const zoneDuration = Math.min(1, maxZoneDuration);
  const zoneWidthPercentage = (zoneDuration / itemDuration) * 100;
  
  // Handle drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!isCompatible) return;
    
    const transitionType = transitionManager.sidebarDragType;
    if (!transitionType) return;
    
    (transitionManager as any).createSingleTransition({
      trackId,
      item,
      position,
      effect: { type: transitionType },
      isVideo: isVideoTrack,
      duration: DEFAULT_TRANSITION_DURATION[transitionType] || 0.5,
    });
    
    transitionManager.endSidebarDrag();
  }, [isCompatible, transitionManager, trackId, item, position, isVideoTrack]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return (
    <div
      className={cn(
        "absolute z-40 pointer-events-auto",
        "transition-all duration-200",
        position === 'start' ? 'left-0' : 'right-0',
        "top-[12%] bottom-[12%]",
        isCompatible 
          ? "border-2 border-dashed border-blue-400/80 bg-blue-500/20"
          : "border-2 border-dashed border-red-400/80 bg-red-500/20",
        "rounded"
      )}
      style={{
        width: `${zoneWidthPercentage}%`,
        minWidth: '20px',
      }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={cn(
          "text-[10px] font-bold uppercase",
          isCompatible ? "text-blue-300" : "text-red-300"
        )}>
          {isCompatible ? "DROP" : "X"}
        </span>
      </div>
    </div>
  );
};

interface TransitionDropZoneBoundaryProps {
  firstItem: TimelineItem;
  secondItem: TimelineItem;
  trackId: string;
  totalDuration: number;
  isVideoTrack: boolean;
}

/**
 * Drop zone for a boundary transition between two adjacent items
 */
export const TransitionDropZoneBoundary: React.FC<TransitionDropZoneBoundaryProps> = ({
  firstItem,
  secondItem,
  trackId,
  totalDuration,
  isVideoTrack,
}) => {
  const transitionManager = useTransitionManager();
  const isDraggingFromSidebar = useIsSidebarDragActive();
  
  // Check if transition already exists at this boundary
  const existingTransition = (transitionManager as any).getBoundaryTransition(firstItem.id, secondItem.id);
  
  // Check type compatibility
  const isCompatible = transitionManager.sidebarDragIsVideo === isVideoTrack;
  
  // Don't show if not dragging or transition already exists
  if (!isDraggingFromSidebar || existingTransition) {
    return null;
  }
  
  // Calculate zone dimensions
  // Zone extends into both items equally (1 second or half item, whichever is smaller)
  const firstItemDuration = firstItem.end - firstItem.start;
  const secondItemDuration = secondItem.end - secondItem.start;
  
  const extendIntoFirst = Math.min(1, firstItemDuration * MAX_TRANSITION_RATIO);
  const extendIntoSecond = Math.min(1, secondItemDuration * MAX_TRANSITION_RATIO);
  
  const zoneStart = firstItem.end - extendIntoFirst;
  const zoneEnd = secondItem.start + extendIntoSecond;
  const zoneDuration = zoneEnd - zoneStart;
  
  const leftPercentage = (zoneStart / totalDuration) * 100;
  const widthPercentage = (zoneDuration / totalDuration) * 100;
  
  // Handle drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!isCompatible) return;
    
    const transitionType = transitionManager.sidebarDragType;
    if (!transitionType) return;
    
    (transitionManager as any).createBoundaryTransition({
      trackId,
      firstItem,
      secondItem,
      effect: { type: transitionType },
      isVideo: isVideoTrack,
      duration: zoneDuration,
    });
    
    transitionManager.endSidebarDrag();
  }, [isCompatible, transitionManager, trackId, firstItem, secondItem, isVideoTrack, zoneDuration]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return (
    <div
      className={cn(
        "absolute z-50 pointer-events-auto",
        "transition-all duration-200",
        "top-[10%] bottom-[10%]",
        isCompatible 
          ? "border-2 border-dashed border-purple-400/80 bg-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.4)]"
          : "border-2 border-dashed border-red-400/80 bg-red-500/30",
        "rounded"
      )}
      style={{
        left: `${leftPercentage}%`,
        width: `${widthPercentage}%`,
        minWidth: '40px',
      }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={cn(
          "text-[10px] font-bold uppercase",
          isCompatible ? "text-purple-200" : "text-red-200"
        )}>
          {isCompatible ? "DROP" : "X"}
        </span>
      </div>
    </div>
  );
};

interface TransitionDropZonesForItemProps {
  item: TimelineItem;
  trackId: string;
  totalDuration: number;
  isVideoTrack: boolean;
  hasAdjacentPrevItem: boolean;
  hasAdjacentNextItem: boolean;
}

/**
 * Renders appropriate drop zones for a timeline item
 * 
 * - Shows single zones at start/end if no adjacent items
 * - Boundary zones are rendered separately by the track
 */
export const TransitionDropZonesForItem: React.FC<TransitionDropZonesForItemProps> = ({
  item,
  trackId,
  totalDuration,
  isVideoTrack,
  hasAdjacentPrevItem,
  hasAdjacentNextItem,
}) => {
  const isDraggingFromSidebar = useIsSidebarDragActive();
  
  if (!isDraggingFromSidebar) {
    return null;
  }
  
  return (
    <>
      {/* Start zone - only if no adjacent previous item */}
      {!hasAdjacentPrevItem && (
        <TransitionDropZoneSingle
          item={item}
          trackId={trackId}
          position="start"
          totalDuration={totalDuration}
          isVideoTrack={isVideoTrack}
        />
      )}
      
      {/* End zone - only if no adjacent next item */}
      {!hasAdjacentNextItem && (
        <TransitionDropZoneSingle
          item={item}
          trackId={trackId}
          position="end"
          totalDuration={totalDuration}
          isVideoTrack={isVideoTrack}
        />
      )}
    </>
  );
};
