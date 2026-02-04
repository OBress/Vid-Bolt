/**
 * MotionGraphicsItemContent
 * 
 * Renders the content for motion graphics clips in the timeline.
 * Shows template name, category badge, and visual indicator.
 */

import React, { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Wand2, MapPin, Type, Film, MousePointerClick, Timer } from 'lucide-react';
import type { BaseItemContentProps } from '../timeline-item-content-factory';
import { MotionGraphicsCategory } from '../../../../../types/motion-graphics';
import { useCompositionEditorStore } from '../../../../../stores/composition-editor-store';

// Get icon based on category
const getCategoryIcon = (category?: MotionGraphicsCategory) => {
  switch (category) {
    case MotionGraphicsCategory.MAP_ANIMATION:
      return MapPin;
    case MotionGraphicsCategory.LOWER_THIRD:
      return Type;
    case MotionGraphicsCategory.TITLE_CARD:
      return Film;
    case MotionGraphicsCategory.CALL_TO_ACTION:
      return MousePointerClick;
    case MotionGraphicsCategory.COUNTDOWN:
      return Timer;
    default:
      return Wand2;
  }
};

// Get category display name
const getCategoryName = (category?: MotionGraphicsCategory) => {
  switch (category) {
    case MotionGraphicsCategory.MAP_ANIMATION:
      return 'Map';
    case MotionGraphicsCategory.LOWER_THIRD:
      return 'Lower Third';
    case MotionGraphicsCategory.TITLE_CARD:
      return 'Title';
    case MotionGraphicsCategory.CALL_TO_ACTION:
      return 'CTA';
    case MotionGraphicsCategory.COUNTDOWN:
      return 'Countdown';
    case MotionGraphicsCategory.TEXT_ANIMATION:
      return 'Text';
    case MotionGraphicsCategory.SOCIAL_MEDIA:
      return 'Social';
    case MotionGraphicsCategory.LOGO_REVEAL:
      return 'Logo';
    default:
      return 'Motion';
  }
};

export const MotionGraphicsItemContent: React.FC<BaseItemContentProps> = ({
  label,
  data,
  itemWidth,
  isSelected,
}) => {
  const template = data?.template;
  const category = template?.category;
  const templateName = template?.name || label || 'Motion Graphic';
  
  const Icon = getCategoryIcon(category);
  const categoryName = getCategoryName(category);
  
  // Check if composition editor is open
  const isCompositionEditorOpen = useCompositionEditorStore((state) => state.isOpen);
  
  // Determine what to show based on available width
  const showCategory = itemWidth > 100;
  const showIcon = itemWidth > 40;
  
  // Track position for tooltip portal
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  
  useEffect(() => {
    // Don't show tooltip if composition editor is open or if item is too small
    if (!isSelected || itemWidth <= 40 || isCompositionEditorOpen) {
      setTooltipPosition(null);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }
    
    const updatePosition = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setTooltipPosition({
        x: rect.left + rect.width / 2,
        y: rect.top,
      });
    };
    
    // Continuously update position using requestAnimationFrame
    // This handles virtual scrolling (CSS transforms) used by the timeline
    const animate = () => {
      updatePosition();
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    
    // Start animation loop
    animationFrameRef.current = requestAnimationFrame(animate);
    
    // Also listen to scroll events on the timeline container (for vertical scrolling)
    const timelineScrollContainer = document.querySelector('[data-timeline-scroll-container]');
    if (timelineScrollContainer) {
      timelineScrollContainer.addEventListener('scroll', updatePosition);
    }
    
    // Listen to window resize
    window.addEventListener('resize', updatePosition);
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (timelineScrollContainer) {
        timelineScrollContainer.removeEventListener('scroll', updatePosition);
      }
      window.removeEventListener('resize', updatePosition);
    };
  }, [isSelected, itemWidth, isCompositionEditorOpen]);
  
  return (
    <>
      <div ref={containerRef} className="flex items-center h-full w-full overflow-hidden px-2 gap-2 relative">
      {/* Icon */}
      {showIcon && (
        <div className="flex-shrink-0 w-5 h-5 rounded bg-purple-500/30 flex items-center justify-center">
          <Icon className="w-3 h-3 text-purple-200" />
        </div>
      )}
      
      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        {/* Template name */}
        <div className="truncate text-xs font-medium text-white/90">
          {templateName}
        </div>
        
        {/* Category badge */}
        {showCategory && (
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-[10px] text-purple-300/80 truncate">
              {categoryName}
            </span>
          </div>
        )}
      </div>
      
      {/* Animated indicator dots for very wide clips */}
      {itemWidth > 200 && (
        <div className="flex-shrink-0 flex items-center gap-1 mr-1">
          <div className="w-1.5 h-1.5 rounded-full bg-purple-400/60 animate-pulse" style={{ animationDelay: '0ms' }} />
          <div className="w-1.5 h-1.5 rounded-full bg-purple-400/60 animate-pulse" style={{ animationDelay: '200ms' }} />
          <div className="w-1.5 h-1.5 rounded-full bg-purple-400/60 animate-pulse" style={{ animationDelay: '400ms' }} />
        </div>
      )}
    </div>
    
    {/* Tooltip - rendered in portal to avoid parent overflow-hidden */}
    {tooltipPosition && createPortal(
      <div 
        className="fixed px-2.5 py-1.5 rounded-md font-medium whitespace-nowrap pointer-events-none"
        style={{
          left: `${tooltipPosition.x}px`,
          top: `${tooltipPosition.y - 32}px`,
          transform: 'translateX(-50%)',
          backgroundColor: '#2a2a2a',
          border: '1px solid #5a5a5a',
          boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
          color: '#e0e0e0',
          fontSize: '11px',
          zIndex: 99999,
        }}
      >
        <span style={{ color: '#7aa8ff' }}>Double-click</span> to edit
        {/* Arrow pointer */}
        <div 
          className="absolute left-1/2 -translate-x-1/2 w-2 h-2 rotate-45"
          style={{
            bottom: '-4px',
            backgroundColor: '#2a2a2a',
            borderRight: '1px solid #5a5a5a',
            borderBottom: '1px solid #5a5a5a',
          }}
        />
      </div>,
      document.body
    )}
  </>
  );
};

export default MotionGraphicsItemContent;
