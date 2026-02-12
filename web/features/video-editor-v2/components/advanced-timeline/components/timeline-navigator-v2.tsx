import React, { useCallback, useRef, useState, useEffect } from 'react';

interface TimelineNavigatorV2Props {
  /** Current horizontal scroll position (0-1 range) */
  scrollX: number;
  /** Callback to update scroll position */
  onScrollChange: (scrollX: number) => void;
  /** Current zoom scale */
  zoomScale: number;
  /** Callback to zoom while keeping playhead at same pixel position (uses unified coordinate system) */
  onZoomAtPlayhead: (newZoom: number) => void;
  /** Callback to zoom while anchoring a specific time at a viewport fraction (for handle drags) */
  onZoomWithAnchor: (newZoom: number, anchorTime: number, anchorViewportFraction: number) => void;
  /** Duration of viewport in seconds (how much time is visible) */
  viewportDuration: number;
  /** Total scrollable duration in seconds (content + buffer) */
  scrollableDuration: number;
  /** Minimum zoom level */
  minZoom?: number;
  /** Maximum zoom level */
  maxZoom?: number;
}

/**
 * TimelineNavigatorV2 - Virtualized timeline navigation bar
 * 
 * This component works with virtual scroll state (not native browser scroll).
 * It directly modifies scrollX and zoomScale values which are used to:
 * - Calculate visible time range
 * - Position content via CSS transforms
 * 
 * Architecture:
 * - Thumb width represents viewport as fraction of total timeline (1/zoomScale)
 * - Thumb position represents scrollX (0-1)
 * - Dragging handles changes zoom (thumb width)
 * - Dragging middle changes scroll (thumb position)
 * - NO native scroll involved at all
 */
export const TimelineNavigatorV2: React.FC<TimelineNavigatorV2Props> = ({
  scrollX,
  onScrollChange,
  zoomScale,
  onZoomAtPlayhead,
  onZoomWithAnchor,
  viewportDuration,
  scrollableDuration,
  minZoom = 0.5,
  maxZoom = 30,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState<'left' | 'right' | 'middle' | 'track' | null>(null);
  
  const dragStartRef = useRef({ 
    x: 0, 
    scrollX: 0, 
    zoomScale: 1,
    viewportDuration: 60,
    scrollableDuration: 60,
    hasMoved: false 
  });

  // PREMIERE PRO-STYLE THUMB WIDTH CALCULATION
  // Thumb width = viewport / total timeline (as percentage)
  // When content extends, thumb shrinks (we see a smaller portion)
  // When zooming in, thumb shrinks (we see a smaller portion)
  const thumbWidthPercent = Math.min(100, Math.max(3, (viewportDuration / scrollableDuration) * 100));
  const maxThumbLeft = 100 - thumbWidthPercent;
  const thumbLeftPercent = scrollX * maxThumbLeft;

  // Handle thumb drag start
  const handleThumbMouseDown = useCallback((e: React.MouseEvent, type: 'left' | 'right' | 'middle') => {
    e.preventDefault();
    e.stopPropagation();
    
    dragStartRef.current = { 
      x: e.clientX, 
      scrollX, 
      zoomScale,
      viewportDuration,
      scrollableDuration,
      hasMoved: false 
    };
    setIsDragging(type);
    document.body.style.cursor = type === 'middle' ? 'grabbing' : 'ew-resize';
    document.body.style.userSelect = 'none';
  }, [scrollX, zoomScale, viewportDuration, scrollableDuration]);

  // Handle track background mousedown
  const handleTrackMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-thumb]')) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    dragStartRef.current = { 
      x: e.clientX, 
      scrollX, 
      zoomScale,
      viewportDuration,
      scrollableDuration,
      hasMoved: false 
    };
    setIsDragging('track');
  }, [scrollX, zoomScale, viewportDuration, scrollableDuration]);

  // Handle drag move and end
  useEffect(() => {
    if (!isDragging) return;
    
    // Base duration constant (same as in use-virtual-scroll.ts)
    const FIXED_BASE_DURATION = 60;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      
      const rect = containerRef.current.getBoundingClientRect();
      const { 
        x: startX, 
        scrollX: startScrollX, 
        viewportDuration: startViewport,
        scrollableDuration: startScrollable 
      } = dragStartRef.current;
      const deltaPixels = e.clientX - startX;
      const deltaPct = (deltaPixels / rect.width) * 100;
      
      if (Math.abs(deltaPixels) > 3) {
        dragStartRef.current.hasMoved = true;
      }
      
      // Track click doesn't drag
      if (isDragging === 'track') return;
      
      // Calculate initial thumb dimensions using duration-based formula
      const startThumbWidth = (startViewport / startScrollable) * 100;
      const startMaxThumbLeft = 100 - startThumbWidth;
      const startThumbLeft = startScrollX * startMaxThumbLeft;
      
      if (isDragging === 'middle') {
        // Dragging middle = pan (change scrollX only, zoom stays same)
        const newThumbLeft = Math.max(0, Math.min(startMaxThumbLeft, startThumbLeft + deltaPct));
        const newScrollX = startMaxThumbLeft > 0 ? newThumbLeft / startMaxThumbLeft : 0;
        
        onScrollChange(newScrollX);
        
      } else if (isDragging === 'left') {
        // Dragging left handle = zoom while anchoring RIGHT edge of thumb
        const rightEdge = startThumbLeft + startThumbWidth;
        
        // Calculate new left edge and thumb width (as percentage)
        const newThumbLeft = Math.max(0, Math.min(rightEdge - 3, startThumbLeft + deltaPct));
        const newThumbWidthPct = rightEdge - newThumbLeft;
        
        // Convert thumb width percentage to viewport duration then to zoom scale
        const newViewportDuration = (newThumbWidthPct * startScrollable) / 100;
        const newZoom = Math.max(minZoom, Math.min(maxZoom, FIXED_BASE_DURATION / newViewportDuration));
        
        // Anchor: the right edge of the thumb should stay fixed
        // Right edge % → time in seconds
        const rightEdgeTime = (rightEdge / 100) * startScrollable;
        // Right edge sits at fraction 1.0 of the viewport
        onZoomWithAnchor(newZoom, rightEdgeTime, 1.0);
        
      } else if (isDragging === 'right') {
        // Dragging right handle = zoom while anchoring LEFT edge of thumb
        const newRight = Math.min(100, Math.max(startThumbLeft + 3, startThumbLeft + startThumbWidth + deltaPct));
        const newThumbWidthPct = newRight - startThumbLeft;
        
        // Convert thumb width percentage to viewport duration then to zoom scale
        const newViewportDuration = (newThumbWidthPct * startScrollable) / 100;
        const newZoom = Math.max(minZoom, Math.min(maxZoom, FIXED_BASE_DURATION / newViewportDuration));
        
        // Anchor: the left edge of the thumb should stay fixed
        // Left edge % → time in seconds
        const leftEdgeTime = (startThumbLeft / 100) * startScrollable;
        // Left edge sits at fraction 0.0 of the viewport
        onZoomWithAnchor(newZoom, leftEdgeTime, 0.0);
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      // Handle track click (jump to position)
      if (isDragging === 'track' && !dragStartRef.current.hasMoved && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const clickPct = ((e.clientX - rect.left) / rect.width) * 100;
        const newThumbLeft = Math.max(0, Math.min(maxThumbLeft, clickPct - (thumbWidthPercent / 2)));
        const newScrollX = maxThumbLeft > 0 ? newThumbLeft / maxThumbLeft : 0;
        
        onScrollChange(newScrollX);
      }
      
      setIsDragging(null);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, minZoom, maxZoom, onScrollChange, onZoomAtPlayhead, maxThumbLeft, thumbWidthPercent]);

  // Handle wheel events on navigator - convert to zoom with playhead-fixed scrolling
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (Math.abs(e.deltaY) > 0) {
        const zoomDelta = -Math.sign(e.deltaY) * 0.1;
        const newZoom = Math.max(minZoom, Math.min(maxZoom, zoomScale + zoomDelta));
        
        if (newZoom !== zoomScale) {
          // Use unified coordinate system to zoom while keeping playhead fixed
          onZoomAtPlayhead(newZoom);
        }
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [zoomScale, minZoom, maxZoom, onZoomAtPlayhead]);

  return (
    <div 
      ref={containerRef}
      className="timeline-navigator h-6 bg-neutral-950 border-t border-neutral-800 relative select-none flex-shrink-0 cursor-pointer"
      onMouseDown={handleTrackMouseDown}
    >
      {/* Track background */}
      <div className="absolute inset-x-2 top-1.5 bottom-1.5 bg-neutral-900/80 rounded-full pointer-events-none" />
      
      {/* Thumb */}
      <div
        data-thumb
        className={`absolute top-1 bottom-1 rounded-full transition-colors ${
          isDragging === 'middle' ? 'bg-neutral-500' : 'bg-neutral-600'
        }`}
        style={{
          left: `calc(${thumbLeftPercent}% + 8px)`,
          width: `calc(${thumbWidthPercent}% - 16px)`,
          minWidth: '24px',
        }}
      >
        {/* Left handle */}
        <div
          className={`absolute -left-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 cursor-ew-resize z-10 transition-colors ${
            isDragging === 'left' 
              ? 'bg-blue-500 border-blue-400' 
              : 'bg-neutral-400 border-neutral-300 hover:bg-blue-400 hover:border-blue-300'
          }`}
          onMouseDown={(e) => handleThumbMouseDown(e, 'left')}
        />
        
        {/* Center drag area */}
        <div
          className="absolute inset-x-2 inset-y-0 cursor-grab active:cursor-grabbing"
          onMouseDown={(e) => handleThumbMouseDown(e, 'middle')}
        />
        
        {/* Right handle */}
        <div
          className={`absolute -right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 cursor-ew-resize z-10 transition-colors ${
            isDragging === 'right' 
              ? 'bg-blue-500 border-blue-400' 
              : 'bg-neutral-400 border-neutral-300 hover:bg-blue-400 hover:border-blue-300'
          }`}
          onMouseDown={(e) => handleThumbMouseDown(e, 'right')}
        />
      </div>
    </div>
  );
};

export default TimelineNavigatorV2;
