import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { formatInTimeZone } from 'date-fns-tz';
import { ChevronDown, ChevronUp, Minimize2, Maximize2 } from 'lucide-react';
import { ZoomControls } from './zoom-controls';
import { PlaybackControls } from './playback-controls';
import { SplittingToggle } from './splitting-toggle';
import { SplitAtSelectionButton } from './split-at-selection-button';
import { UndoRedoControls } from './undo-redo-controls';
import { AspectRatioDropdown, ResolutionDropdown } from './aspect-ratio-dropdown';
import { ToolsPanel } from './edit-mode-toolbar';
import { AspectRatio, ResolutionPreset } from '../../../../types';
import { Overlay } from '../../../../types';

// Button group wrapper (matches ToolsPanel style)
const ButtonGroup: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex items-center gap-0.5 bg-neutral-800/60 rounded-md px-1 py-1">
    {children}
  </div>
);

// Tooltip component that renders in a portal (matches ToolsPanel style)
// With boundary detection to keep tooltip within viewport
const HeaderTooltip: React.FC<{
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

// Right controls component with organized button groups
interface RightControlsProps {
  showAspectRatioControls?: boolean;
  aspectRatio?: AspectRatio;
  onAspectRatioChange?: (ratio: AspectRatio) => void;
  resolution?: ResolutionPreset;
  onResolutionChange?: (resolution: ResolutionPreset) => void;
  showZoomControls?: boolean;
  zoomScale?: number;
  setZoomScale?: (scale: number, isDragging?: boolean) => void;
  resetZoom?: () => void;
  startSliderDrag?: () => void;
  endSliderDrag?: () => void;
  isCompact?: boolean;
  onToggleCompact?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

const RightControls: React.FC<RightControlsProps> = ({
  showAspectRatioControls,
  aspectRatio = "16:9",
  onAspectRatioChange,
  resolution = "1080p",
  onResolutionChange,
  showZoomControls,
  zoomScale,
  setZoomScale,
  resetZoom,
  startSliderDrag,
  endSliderDrag,
  isCompact = false,
  onToggleCompact,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  const [showCompactTooltip, setShowCompactTooltip] = useState(false);
  const [showCollapseTooltip, setShowCollapseTooltip] = useState(false);
  const compactButtonRef = useRef<HTMLButtonElement>(null);
  const collapseButtonRef = useRef<HTMLButtonElement>(null);
  const compactHoverRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const collapseHoverRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleCompactEnter = () => {
    compactHoverRef.current = setTimeout(() => setShowCompactTooltip(true), 200);
  };
  const handleCompactLeave = () => {
    clearTimeout(compactHoverRef.current);
    setShowCompactTooltip(false);
  };
  const handleCollapseEnter = () => {
    collapseHoverRef.current = setTimeout(() => setShowCollapseTooltip(true), 200);
  };
  const handleCollapseLeave = () => {
    clearTimeout(collapseHoverRef.current);
    setShowCollapseTooltip(false);
  };

  return (
    <div className="flex items-center gap-2 flex-1 justify-end">
      {/* Aspect Ratio Dropdown */}
      {showAspectRatioControls && onAspectRatioChange && (
        <AspectRatioDropdown
          aspectRatio={aspectRatio}
          onAspectRatioChange={onAspectRatioChange}
        />
      )}

      {/* Resolution Dropdown */}
      {showAspectRatioControls && onResolutionChange && (
        <ResolutionDropdown
          resolution={resolution}
          onResolutionChange={onResolutionChange}
        />
      )}

      {/* Zoom Controls */}
      {showZoomControls && zoomScale !== undefined && setZoomScale && (
        <ZoomControls
          zoomScale={zoomScale}
          setZoomScale={setZoomScale}
          resetZoom={resetZoom}
          startSliderDrag={startSliderDrag}
          endSliderDrag={endSliderDrag}
        />
      )}
      
      {/* View Controls Group */}
      <ButtonGroup>
        {/* Compact Mode Toggle */}
        {onToggleCompact && (
          <>
            <button
              ref={compactButtonRef}
              onClick={onToggleCompact}
              onMouseEnter={handleCompactEnter}
              onMouseLeave={handleCompactLeave}
              className={`
                relative flex items-center justify-center
                w-7 h-7 rounded transition-all duration-100
                ${isCompact 
                  ? 'bg-primary text-primary-foreground' 
                  : 'text-white hover:bg-muted/50'
                }
              `}
              type="button"
            >
              {isCompact ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
            </button>
            <HeaderTooltip
              buttonRef={compactButtonRef}
              show={showCompactTooltip}
              label={isCompact ? "Expand Tracks" : "Compact Tracks"}
              description={isCompact ? "Show tracks at normal height" : "Reduce track height for more space"}
            />
          </>
        )}

        {/* Collapse Timeline Toggle */}
        {onToggleCollapse && (
          <>
            <button
              ref={collapseButtonRef}
              onClick={onToggleCollapse}
              onMouseEnter={handleCollapseEnter}
              onMouseLeave={handleCollapseLeave}
              className={`
                relative flex items-center justify-center
                w-7 h-7 rounded transition-all duration-100
                ${isCollapsed 
                  ? 'bg-primary text-primary-foreground' 
                  : 'text-white hover:bg-muted/50'
                }
              `}
              type="button"
            >
              {isCollapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            <HeaderTooltip
              buttonRef={collapseButtonRef}
              show={showCollapseTooltip}
              label={isCollapsed ? "Expand Timeline" : "Collapse Timeline"}
              description={isCollapsed ? "Show the full timeline" : "Hide timeline tracks"}
            />
          </>
        )}
      </ButtonGroup>
    </div>
  );
};

interface TimelineHeaderProps {
  totalDuration: number;
  currentTime?: number;
  showZoomControls?: boolean;
  zoomScale?: number;
  setZoomScale?: (scale: number, isDragging?: boolean) => void;
  resetZoom?: () => void;
  startSliderDrag?: () => void;
  endSliderDrag?: () => void;
  // Playback controls
  isPlaying?: boolean;
  onPlay?: () => void;
  onPause?: () => void;
  onSeekToStart?: () => void;
  onSeekToEnd?: () => void;
  showPlaybackControls?: boolean;
  // Playback speed controls
  playbackRate?: number;
  setPlaybackRate?: (rate: number) => void;
  // Auto-remove empty tracks
  autoRemoveEmptyTracks?: boolean;
  onToggleAutoRemoveEmptyTracks?: (enabled: boolean) => void;
  // Splitting mode (legacy - hidden)
  splittingEnabled?: boolean;
  onToggleSplitting?: (enabled: boolean) => void;
  // Split at selection (new functionality)
  onSplitAtSelection?: () => void;
  hasSelectedItem?: boolean;
  selectedItemsCount?: number;
  showSplitAtSelection?: boolean;
  // Undo/Redo controls
  showUndoRedoControls?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  // Aspect ratio controls
  aspectRatio?: AspectRatio;
  onAspectRatioChange?: (ratio: AspectRatio) => void;
  showAspectRatioControls?: boolean;
  // Resolution controls
  resolution?: ResolutionPreset;
  onResolutionChange?: (resolution: ResolutionPreset) => void;
  // Visibility controls
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  // Debug export
  overlays?: Overlay[];
  // Compact mode
  isCompact?: boolean;
  onToggleCompact?: () => void;
}

export const TimelineHeader: React.FC<TimelineHeaderProps> = ({
  totalDuration,
  currentTime = 0,
  showZoomControls = false,
  zoomScale,
  setZoomScale,
  resetZoom,
  startSliderDrag,
  endSliderDrag,
  isPlaying = false,
  onPlay,
  onPause,
  onSeekToStart,
  onSeekToEnd,
  showPlaybackControls = false,
  playbackRate = 1,
  setPlaybackRate,
  splittingEnabled = false,
  onToggleSplitting,
  onSplitAtSelection,
  hasSelectedItem = false,
  selectedItemsCount = 0,
  showSplitAtSelection = true,
  showUndoRedoControls = false,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  aspectRatio = "16:9",
  onAspectRatioChange,
  showAspectRatioControls = true,
  resolution = "1080p",
  onResolutionChange,
  isCollapsed = false,
  onToggleCollapse,
  // overlays = [],
  isCompact = false,
  onToggleCompact,
}) => {
  const formatTime = (timeInSeconds: number) => {
    // Guard against NaN, Infinity, or negative values
    if (!Number.isFinite(timeInSeconds) || timeInSeconds < 0) {
      return '0:00.00';
    }
    // Convert seconds to milliseconds
    const milliseconds = Math.round(timeInSeconds * 1000);
    // Use date-fns-tz to format in UTC timezone, avoiding local timezone offset issues
    return formatInTimeZone(milliseconds, 'UTC', 'm:ss.SS');
  };

  // Debug export function
  // const exportOverlaysAsTemplate = () => {
  //   const template = {
  //     id: `debug-export-${Date.now()}`,
  //     name: "Debug Export",
  //     description: "Debug export of current overlays",
  //     createdAt: new Date().toISOString(),
  //     updatedAt: new Date().toISOString(),
  //     createdBy: {
  //       id: "debug-user",
  //       name: "Debug User"
  //     },
  //     category: "Debug",
  //     tags: ["debug", "export"],
  //     duration: totalDuration,
  //     aspectRatio: aspectRatio,
  //     overlays: overlays
  //   };

  //   // Create and download JSON file
  //   const dataStr = JSON.stringify(template, null, 2);
  //   const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
  //   const exportFileDefaultName = `debug-overlays-${Date.now()}.json`;
    
  //   const linkElement = document.createElement('a');
  //   linkElement.setAttribute('href', dataUri);
  //   linkElement.setAttribute('download', exportFileDefaultName);
  //   linkElement.click();

  //   // Also log to console for easy copying
  //   console.log('Exported overlays:', template);
  // };

  return (
    <div className=" bg-background flex justify-between items-center border border-border px-3 py-2.5">
      {/* Left section: Tools Panel, Undo/Redo and Split at Selection */}
      <div className="flex items-center gap-2 flex-1 justify-start">
        {/* Tools Panel - Like Premiere Pro */}
        <ToolsPanel />
        
        {/* Separator */}
        <div className="w-px h-5 bg-border mx-1" />
        
        {showUndoRedoControls && onUndo && onRedo && (
          <UndoRedoControls
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={onUndo}
            onRedo={onRedo}
          />
        )}
     
        {/* Legacy splitting toggle - hidden but kept for backward compatibility */}
        {false && onToggleSplitting && (
          <SplittingToggle
            enabled={splittingEnabled}
            onToggle={onToggleSplitting!}
          />
        )}

        {/* New split at selection button */}
        {showSplitAtSelection && onSplitAtSelection && (
          <SplitAtSelectionButton
            onSplitAtSelection={onSplitAtSelection}
            hasSelectedItem={hasSelectedItem}
            selectedItemsCount={selectedItemsCount}
          />
        )}

        {/* Debug Export Button - Comment out this section to hide */}
        {/* {true && (
          <button
            onClick={exportOverlaysAsTemplate}
            className="px-3 py-1.5 text-xs bg-orange-500 hover:bg-orange-600 text-white rounded-md font-medium transition-colors"
            title="Export overlays as JSON template (Debug)"
          >
            Debug Export
          </button>
        )} */}
      </div>

      {/* Center section: Playback controls */}
      <div className="flex items-center justify-center gap-2 grow">
        {showPlaybackControls && (
          <PlaybackControls
            isPlaying={isPlaying}
            onPlay={onPlay}
            onPause={onPause}
            onSeekToStart={onSeekToStart}
            onSeekToEnd={onSeekToEnd}
            currentTime={currentTime}
            totalDuration={totalDuration}
            formatTime={formatTime}
            playbackRate={playbackRate}
            setPlaybackRate={setPlaybackRate}
          />
        )}
      </div>

      {/* Right section: Aspect Ratio, Resolution, View Controls */}
      <RightControls
        showAspectRatioControls={showAspectRatioControls}
        aspectRatio={aspectRatio}
        onAspectRatioChange={onAspectRatioChange}
        resolution={resolution}
        onResolutionChange={onResolutionChange}
        showZoomControls={showZoomControls}
        zoomScale={zoomScale}
        setZoomScale={setZoomScale}
        resetZoom={resetZoom}
        startSliderDrag={startSliderDrag}
        endSliderDrag={endSliderDrag}
        isCompact={isCompact}
        onToggleCompact={onToggleCompact}
        isCollapsed={isCollapsed}
        onToggleCollapse={onToggleCollapse}
      />
    </div>
  );
};