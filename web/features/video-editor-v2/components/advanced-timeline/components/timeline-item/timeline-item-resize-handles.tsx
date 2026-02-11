import React from 'react';

interface TimelineItemResizeHandlesProps {
  onDragStart?: boolean;
  splittingEnabled?: boolean;
  isHovering?: boolean;
  isSelected?: boolean;
  isDragging?: boolean;
  isMultiSelected?: boolean; // Prop to indicate multi-selection
  isLinked?: boolean; // Whether this item is part of a link group
  isLinkedItemSelected?: boolean; // Whether any item in the link group is selected
  onMouseDown?: (e: React.MouseEvent<HTMLDivElement>, position: 'left' | 'right') => void;
  onTouchStart?: (e: React.TouchEvent<HTMLDivElement>, position: 'left' | 'right') => void;
}

export const TimelineItemResizeHandles: React.FC<TimelineItemResizeHandlesProps> = ({
  onDragStart,
  splittingEnabled = false,
  isHovering = false,
  isSelected = false,
  isDragging = false,
  isMultiSelected = false,
  isLinked = false,
  isLinkedItemSelected = false,
  onMouseDown,
  onTouchStart,
}) => {
  // Hide resize handles if:
  // - dragging is not enabled
  // - splitting is enabled  
  // - multiple unlinked items are selected (linked items can resize together)
  if (!onDragStart || splittingEnabled || (isMultiSelected && !isLinked)) {
    return null;
  }

  const handleMouseDown = (position: 'left' | 'right') => (e: React.MouseEvent<HTMLDivElement>) => {
    onMouseDown?.(e, position);
  };

  const handleTouchStart = (position: 'left' | 'right') => (e: React.TouchEvent<HTMLDivElement>) => {
    onTouchStart?.(e, position);
  };

  // Show handles when:
  // - Item is hovered
  // - Item is selected  
  // - Any linked item is selected (Premiere Pro behavior)
  const shouldShowHandles = isHovering || isSelected || isLinkedItemSelected;

  // Consistent gray styling for all handles (linked or not)
  const baseHandleClasses = `
    absolute top-0 bottom-0 z-50
    backdrop-blur-sm
    bg-gray-600/40 hover:bg-gray-600/60 border-gray-500/60
    ${shouldShowHandles ? "opacity-100" : "opacity-0 group-hover:opacity-100"}
  `.trim();

  const cursorStyle: React.CSSProperties = !isDragging 
    ? { cursor: "ew-resize" } 
    : { cursor: "grabbing" };

  return (
    <>
      {/* Resize handle - left */}
      <div
        className={`${baseHandleClasses} left-0 border-r border-l rounded-l-[4px] touch-none`}
        style={{ width: '16px', minWidth: '16px', ...cursorStyle }}
        onMouseDown={handleMouseDown('left')}
        onTouchStart={handleTouchStart('left')}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="space-x-1 flex ml-0">
            <div className="w-[2px] h-[18px] bg-white rounded-full shadow-[0_0_4px_rgba(0,0,0,0.8)]" />
            <div className="w-[2px] h-[18px] bg-white rounded-full shadow-[0_0_4px_rgba(0,0,0,0.8)]" />
          </div>
        </div>
      </div>
      
      {/* Resize handle - right */}
      <div
        className={`${baseHandleClasses} right-0 border-r border-l rounded-r-[4px] touch-none`}
        style={{ width: '16px', minWidth: '16px', ...cursorStyle }}
        onMouseDown={handleMouseDown('right')}
        onTouchStart={handleTouchStart('right')}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="space-x-1 flex mr-0">
            <div className="w-[2px] h-[18px] bg-white rounded-full shadow-[0_0_4px_rgba(0,0,0,0.8)]" />
            <div className="w-[2px] h-[18px] bg-white rounded-full shadow-[0_0_4px_rgba(0,0,0,0.8)]" />
          </div>
        </div>
      </div>
    </>
  );
}; 