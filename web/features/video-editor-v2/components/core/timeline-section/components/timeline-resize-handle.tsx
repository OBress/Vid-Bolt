import React from 'react';
import { GripHorizontal } from 'lucide-react';
import { cn } from '../../../../utils/general/utils';

interface TimelineResizeHandleProps {
  onMouseDown: (e: React.MouseEvent) => void;
  onTouchStart: (e: React.TouchEvent) => void;
  isResizing: boolean;
}

/**
 * Draggable resize handle component for the timeline
 * Allows users to adjust the height of the timeline by dragging up or down
 * Supports both mouse and touch interactions for mobile devices
 */
export const TimelineResizeHandle: React.FC<TimelineResizeHandleProps> = ({ 
  onMouseDown, 
  onTouchStart,
  isResizing 
}) => {
  return (
    <div
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      className={cn(
        "relative h-[6px] cursor-row-resize flex items-center justify-center group z-10",
        "bg-border/50 hover:bg-primary/30 transition-colors",
        isResizing && "bg-primary/50"
      )}
      style={{ touchAction: 'none' }}
    >
      <div className={cn(
        "absolute inset-x-0 h-4 flex items-center justify-center -top-[5px]",
        "opacity-0 group-hover:opacity-100 transition-opacity"
      )}>
        <GripHorizontal className="h-5 w-5 text-muted-foreground" />
      </div>
    </div>
  );
};
