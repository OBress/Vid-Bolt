import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { EditMode } from '../../types';
import { useVideoEditorStore, useVideoEditorActions, selectEditMode, selectSnappingEnabled } from '../../../../stores/video-editor-store';
import { 
  MousePointer2, 
  Scissors,
  ArrowRightToLine, 
  ArrowLeftRight, 
  SlidersHorizontal,
  MoveHorizontal,
  Magnet,
} from 'lucide-react';

// Custom icon for Close Gap - two horizontal arrows pointing at each other
const CloseGapIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg 
    className={className} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
  >
    {/* Left arrow pointing right */}
    <path d="M4 12h6" />
    <path d="M7 9l3 3-3 3" />
    {/* Right arrow pointing left */}
    <path d="M20 12h-6" />
    <path d="M17 9l-3 3 3 3" />
  </svg>
);

// Tooltip component that renders in a portal
// With boundary detection to keep tooltip within viewport
const ToolTooltip: React.FC<{
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  show: boolean;
  label: string;
  shortcut: string;
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
            arrowOffset = left - newLeft;
            left = newLeft;
          } else if (left + tooltipRect.width / 2 > window.innerWidth - padding) {
            const newLeft = window.innerWidth - tooltipRect.width / 2 - padding;
            arrowOffset = left - newLeft;
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
          <kbd className="px-1.5 py-0.5 bg-neutral-700 rounded text-[10px] font-mono">{shortcut}</kbd>
        </div>
        <div className="text-[11px] text-gray-400 mt-1">
          {description}
        </div>
      </div>
      {/* Arrow pointing down - offset when tooltip is repositioned */}
      <div 
        className="w-2 h-2 bg-neutral-900 border-r border-b border-neutral-700 rotate-45 -mt-1" 
        style={{ transform: `translateX(${position.arrowOffset}px) rotate(45deg)` }}
      />
    </div>,
    document.body
  );
};

interface ToolsPanelProps {
  className?: string;
}

// Tool definition interface
interface ToolDef {
  mode: EditMode;
  icon: React.ElementType;
  label: string;
  shortcut: string;
  description: string;
}

// Individual tool button with portal tooltip
const ToolButton: React.FC<{
  tool: ToolDef;
  isActive: boolean;
  onClick: () => void;
}> = ({ tool, isActive, onClick }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const Icon = tool.icon;

  const handleMouseEnter = () => {
    hoverTimeoutRef.current = setTimeout(() => setShowTooltip(true), 200);
  };

  const handleMouseLeave = () => {
    clearTimeout(hoverTimeoutRef.current);
    setShowTooltip(false);
  };

  return (
    <>
      <button
        ref={buttonRef}
        onClick={onClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`
          relative flex items-center justify-center
          w-7 h-7 rounded transition-all duration-100
          ${isActive 
            ? 'bg-primary text-primary-foreground' 
            : 'text-white hover:bg-muted/50'
          }
        `}
      >
        <Icon className="w-4 h-4" />
      </button>
      <ToolTooltip
        buttonRef={buttonRef}
        show={showTooltip}
        label={tool.label}
        shortcut={tool.shortcut}
        description={tool.description}
      />
    </>
  );
};

// Tool group with background
const ToolGroup: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => (
  <div className="flex items-center gap-0.5 bg-neutral-800/60 rounded-md px-1 py-1">
    {children}
  </div>
);

/**
 * Tools Panel - Like Premiere Pro's tool palette
 * Organized into logical groups:
 * - Select: Selection tool
 * - Edit: Razor, Close Gap  
 * - Trim: Ripple, Rolling, Slip, Slide
 * - Snap: Snapping toggle
 */
export const ToolsPanel: React.FC<ToolsPanelProps> = ({ className }) => {
  const editMode = useVideoEditorStore(selectEditMode);
  const snappingEnabled = useVideoEditorStore(selectSnappingEnabled);
  const { setEditMode, toggleSnapping } = useVideoEditorActions();
  const [showSnapTooltip, setShowSnapTooltip] = useState(false);
  const snapButtonRef = useRef<HTMLButtonElement>(null);
  const snapHoverRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleSnapEnter = () => {
    snapHoverRef.current = setTimeout(() => setShowSnapTooltip(true), 200);
  };
  const handleSnapLeave = () => {
    clearTimeout(snapHoverRef.current);
    setShowSnapTooltip(false);
  };

  // Tool definitions grouped by category
  const selectTools: ToolDef[] = [
    { mode: 'select', icon: MousePointer2, label: 'Selection', shortcut: 'V', description: 'Select, move, and resize clips' },
  ];

  const editTools: ToolDef[] = [
    { mode: 'razor', icon: Scissors, label: 'Razor', shortcut: 'C', description: 'Click on a clip to cut/split it' },
    { mode: 'gap', icon: CloseGapIcon, label: 'Close Gap', shortcut: 'G', description: 'Click on gaps between clips to close them' },
  ];

  const trimTools: ToolDef[] = [
    { mode: 'ripple', icon: ArrowRightToLine, label: 'Ripple Edit', shortcut: 'B', description: 'Trim clips and shift all following clips' },
    { mode: 'rolling', icon: ArrowLeftRight, label: 'Rolling Edit', shortcut: 'N', description: 'Adjust edit point between adjacent clips' },
    { mode: 'slip', icon: SlidersHorizontal, label: 'Slip', shortcut: 'Y', description: 'Change which part of media is shown' },
    { mode: 'slide', icon: MoveHorizontal, label: 'Slide', shortcut: 'U', description: 'Move clip while adjusting neighbors' },
  ];

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const key = e.key.toLowerCase();
      const modeByKey: Record<string, EditMode> = {
        'v': 'select',
        'c': 'razor',
        'g': 'gap',
        'b': 'ripple',
        'n': 'rolling',
        'y': 'slip',
        'u': 'slide',
      };

      if (modeByKey[key]) {
        e.preventDefault();
        setEditMode(modeByKey[key]);
      }
      
      // 'S' toggles snapping
      if (key === 's') {
        e.preventDefault();
        toggleSnapping();
      }
      
      // Escape returns to selection
      if (key === 'escape') {
        e.preventDefault();
        setEditMode('select');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setEditMode, toggleSnapping]);

  return (
    <div className={`flex items-center gap-1.5 ${className || ''}`}>
      {/* Select Group */}
      <ToolGroup>
        {selectTools.map((tool) => (
          <ToolButton
            key={tool.mode}
            tool={tool}
            isActive={editMode === tool.mode}
            onClick={() => setEditMode(tool.mode)}
          />
        ))}
      </ToolGroup>

      {/* Edit Group */}
      <ToolGroup>
        {editTools.map((tool) => (
          <ToolButton
            key={tool.mode}
            tool={tool}
            isActive={editMode === tool.mode}
            onClick={() => setEditMode(tool.mode)}
          />
        ))}
      </ToolGroup>

      {/* Trim Group */}
      <ToolGroup>
        {trimTools.map((tool) => (
          <ToolButton
            key={tool.mode}
            tool={tool}
            isActive={editMode === tool.mode}
            onClick={() => setEditMode(tool.mode)}
          />
        ))}
      </ToolGroup>

      {/* Snap Group */}
      <ToolGroup>
        <button
          ref={snapButtonRef}
          onClick={toggleSnapping}
          onMouseEnter={handleSnapEnter}
          onMouseLeave={handleSnapLeave}
          className={`
            relative flex items-center justify-center
            w-7 h-7 rounded transition-all duration-100
            ${snappingEnabled 
              ? 'bg-blue-600 text-white' 
              : 'text-white hover:bg-muted/50'
            }
          `}
        >
          <Magnet className="w-4 h-4" />
        </button>
        <ToolTooltip
          buttonRef={snapButtonRef}
          show={showSnapTooltip}
          label="Snap to Edges"
          shortcut="S"
          description={snappingEnabled ? 'Snapping is ON - clips snap to edges' : 'Snapping is OFF - free positioning'}
        />
      </ToolGroup>
    </div>
  );
};

// Legacy exports for backwards compatibility
export const EditModeToolbar = ToolsPanel;
export const EditModeShortcuts = ToolsPanel;
export default ToolsPanel;
