import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { AlignHorizontalSpaceAround } from "lucide-react";
import { ZOOM_CONSTRAINTS } from "../../constants";

// Tooltip component that renders in a portal (matches ToolsPanel style)
// With boundary detection to keep tooltip within viewport
const ZoomTooltip: React.FC<{
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  show: boolean;
  label: string;
  shortcut?: string;
  description: string;
}> = ({ buttonRef, show, label, shortcut, description }) => {
  const [position, setPosition] = useState({ top: 0, left: 0, arrowOffset: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (show && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const buttonCenter = rect.left + rect.width / 2;
      let left = buttonCenter;
      let top = rect.top - 8;
      let arrowOffset = 0;
      
      // After first render, adjust position to stay within viewport
      requestAnimationFrame(() => {
        if (tooltipRef.current) {
          const tooltipRect = tooltipRef.current.getBoundingClientRect();
          const padding = 8;
          
          // Keep within horizontal bounds
          if (left - tooltipRect.width / 2 < padding) {
            const newLeft = tooltipRect.width / 2 + padding;
            arrowOffset = left - newLeft; // Arrow moves right (positive offset)
            left = newLeft;
          } else if (left + tooltipRect.width / 2 > window.innerWidth - padding) {
            const newLeft = window.innerWidth - tooltipRect.width / 2 - padding;
            arrowOffset = left - newLeft; // Arrow moves left (negative offset)
            left = newLeft;
          }
          
          setPosition({ top, left, arrowOffset });
        }
      });
      
      setPosition({ top, left, arrowOffset: 0 });
    }
  }, [show, buttonRef]);

  if (!show) return null;

  return createPortal(
    <div
      ref={tooltipRef}
      className="fixed flex flex-col items-center pointer-events-none"
      style={{
        top: position.top,
        left: position.left,
        transform: 'translate(-50%, -100%)',
        zIndex: 99999,
      }}
    >
      <div className="bg-neutral-900 text-white text-xs px-3 py-2 rounded-lg shadow-lg whitespace-nowrap border border-neutral-700">
        <div className="flex items-center gap-2 font-medium">
          {label}
          {shortcut && (
            <kbd className="px-1.5 py-0.5 bg-neutral-700 rounded text-[10px] font-mono">{shortcut}</kbd>
          )}
        </div>
        <div className="text-[11px] text-gray-400 mt-1">
          {description}
        </div>
      </div>
      <div 
        className="w-2 h-2 bg-neutral-900 border-r border-b border-neutral-700 rotate-45 -mt-1" 
        style={{ transform: `translateX(${position.arrowOffset}px) rotate(45deg)` }}
      />
    </div>,
    document.body
  );
};

interface ZoomControlsProps {
  zoomScale: number;
  setZoomScale: (scale: number, isDragging?: boolean) => void;
  resetZoom?: () => void;
  startSliderDrag?: () => void;
  endSliderDrag?: () => void;
  zoomConstraints?: typeof ZOOM_CONSTRAINTS;
}

export const ZoomControls: React.FC<ZoomControlsProps> = ({
  zoomScale,
  setZoomScale,
  resetZoom,
  zoomConstraints = ZOOM_CONSTRAINTS,
}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  
  const handleMouseEnter = () => {
    hoverTimeoutRef.current = setTimeout(() => setShowTooltip(true), 200);
  };

  const handleMouseLeave = () => {
    clearTimeout(hoverTimeoutRef.current);
    setShowTooltip(false);
  };

  const handleZoomReset = () => {
    if (resetZoom) {
      resetZoom();
    } else {
      setZoomScale(zoomConstraints.default);
    }
  };

  // Always enable zoom to fit button - it dynamically calculates fit zoom
  const isDisabled = false;

  return (
    <div className="flex items-center gap-0.5 bg-neutral-800/60 rounded-md px-1 py-1">
      <button
        ref={buttonRef}
        onClick={handleZoomReset}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        disabled={isDisabled}
        className={`
          relative flex items-center justify-center
          w-7 h-7 rounded transition-all duration-100
          ${isDisabled 
            ? 'text-white/30 cursor-not-allowed' 
            : 'text-white hover:bg-muted/50'
          }
        `}
            >
        <AlignHorizontalSpaceAround className="w-4 h-4" />
      </button>
      <ZoomTooltip
        buttonRef={buttonRef}
        show={showTooltip}
        label="Zoom to Fit"
        description="Zoom to fit all timeline content perfectly in view"
      />
    </div>
  );
};
