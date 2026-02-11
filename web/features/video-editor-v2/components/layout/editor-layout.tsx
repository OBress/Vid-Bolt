/**
 * EditorLayout - Professional Video Editor Layout
 * 
 * Professional grid-based layout with resizable panels:
 * - Left: Asset Manager (media browser) - horizontally resizable
 * - Center: Canvas/Video Preview
 * - Right: Inspector Panel - horizontally resizable
 * - Bottom: Timeline - vertically resizable
 * 
 * All panels are contained within their grid areas and scroll internally.
 */

import React, { useEffect, useState, useCallback, useRef } from "react";
import { cn } from "../../utils/general/utils";
import { useEditorContext } from "../../contexts/editor-context";
import { useToolContext } from "../../contexts/tool-context";
import { useVideoEditorStore } from "../../stores/video-editor-store";

import { AssetManager } from "../asset-manager/asset-manager";
import { InspectorPanel } from "../inspector/inspector-panel";
import { VideoPlayer } from "../core/video-player";
import { TimelineSection } from "../core/timeline-section";
import { MobileNavBar } from "../shared/mobile-nav-bar";

import { PanelLeftClose, PanelRightClose, GripVertical } from "lucide-react";
import { Button } from "../ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";

// ==========================================
// CONSTANTS
// ==========================================

const LAYOUT_CONSTANTS = {
  ASSET_MANAGER: {
    DEFAULT_WIDTH: 280,
    MIN_WIDTH: 200,
    MAX_WIDTH: 450,
    STORAGE_KEY: 'editor-v2-asset-manager-width',
    COLLAPSED_KEY: 'editor-v2-asset-manager-collapsed',
  },
  INSPECTOR: {
    DEFAULT_WIDTH: 320,
    MIN_WIDTH: 250,
    MAX_WIDTH: 500,
    STORAGE_KEY: 'editor-v2-inspector-width',
    COLLAPSED_KEY: 'editor-v2-inspector-collapsed',
  },
  TOOLBAR_HEIGHT: 40,
  RESIZE_HANDLE_SIZE: 6,
} as const;

// ==========================================
// HORIZONTAL RESIZE HOOK
// ==========================================

interface UseHorizontalResizeOptions {
  initialWidth: number;
  minWidth: number;
  maxWidth: number;
  storageKey: string;
  /** If true, dragging right decreases width (for right-side panels) */
  invertDrag?: boolean;
}

function useHorizontalResize({
  initialWidth,
  minWidth,
  maxWidth,
  storageKey,
  invertDrag = false,
}: UseHorizontalResizeOptions) {
  const [size, setSize] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed) && parsed >= minWidth && parsed <= maxWidth) {
          return parsed;
        }
      }
    }
    return initialWidth;
  });

  const [isResizing, setIsResizing] = useState(false);
  const startPosRef = useRef(0);
  const startSizeRef = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startPosRef.current = e.clientX;
    startSizeRef.current = size;
  }, [size]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startPosRef.current = e.touches[0].clientX;
    startSizeRef.current = size;
  }, [size]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      let delta = e.clientX - startPosRef.current;
      if (invertDrag) delta = -delta;
      const newSize = Math.min(maxWidth, Math.max(minWidth, startSizeRef.current + delta));
      setSize(newSize);
    };

    const handleTouchMove = (e: TouchEvent) => {
      let delta = e.touches[0].clientX - startPosRef.current;
      if (invertDrag) delta = -delta;
      const newSize = Math.min(maxWidth, Math.max(minWidth, startSizeRef.current + delta));
      setSize(newSize);
    };

    const handleEnd = () => {
      setIsResizing(false);
      localStorage.setItem(storageKey, String(size));
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchmove', handleTouchMove);
    document.addEventListener('touchend', handleEnd);

    // Prevent text selection during resize
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleEnd);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isResizing, minWidth, maxWidth, storageKey, invertDrag, size]);

  // Persist on unmount
  useEffect(() => {
    return () => {
      localStorage.setItem(storageKey, String(size));
    };
  }, [size, storageKey]);

  return {
    size,
    setSize,
    isResizing,
    handleMouseDown,
    handleTouchStart,
  };
}

// ==========================================
// RESIZE HANDLE COMPONENT
// ==========================================

interface ResizeHandleProps {
  onMouseDown: (e: React.MouseEvent) => void;
  onTouchStart: (e: React.TouchEvent) => void;
  isResizing: boolean;
}

const ResizeHandle: React.FC<ResizeHandleProps> = ({
  onMouseDown,
  onTouchStart,
  isResizing,
}) => {
  return (
    <div
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      className={cn(
        "relative w-[6px] cursor-col-resize flex items-center justify-center group z-10 shrink-0",
        "bg-border/50 hover:bg-primary/30 transition-colors",
        isResizing && "bg-primary/50"
      )}
      style={{ touchAction: 'none' }}
    >
      <div className={cn(
        "absolute inset-y-0 w-4 flex items-center justify-center",
        "opacity-0 group-hover:opacity-100 transition-opacity"
      )}>
        <GripVertical className="h-5 w-5 text-muted-foreground" />
      </div>
    </div>
  );
};

// ==========================================
// PANEL WRAPPER COMPONENT
// ==========================================

interface PanelProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

const Panel: React.FC<PanelProps> = ({ children, className, style }) => (
  <div 
    className={cn(
      "relative overflow-hidden p-0 m-0 h-full",
      className
    )}
    style={{
      ...style,
      padding: 0,
      margin: 0,
      height: '100%',
      // PERF: CSS containment isolates style recalculations to within this panel.
      // Prevents changes in one panel from triggering 'Recalculate style' across the whole DOM.
      contain: 'layout style paint',
    }}
  >
    {children}
  </div>
);

// ==========================================
// EDITOR LAYOUT PROPS
// ==========================================

export interface EditorLayoutProps {
  header?: React.ReactNode;
  enableMobileLayout?: boolean;
  onSave?: () => void;
}

// ==========================================
// EDITOR LAYOUT COMPONENT
// ==========================================

export const EditorLayout: React.FC<EditorLayoutProps> = ({
  header,
  enableMobileLayout = false,
}) => {
  const { playerRef, isInitialLoadComplete } = useEditorContext();
  const selectClips = useVideoEditorStore(s => s.selectClips);
  const { currentCursor } = useToolContext();
  
  const [isMobile, setIsMobile] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Panel collapse states
  const [assetManagerCollapsed, setAssetManagerCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(LAYOUT_CONSTANTS.ASSET_MANAGER.COLLAPSED_KEY) === 'true';
    }
    return false;
  });

  const [inspectorCollapsed, setInspectorCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(LAYOUT_CONSTANTS.INSPECTOR.COLLAPSED_KEY) === 'true';
    }
    return false;
  });

  // Resize states for each panel
  const assetManagerResize = useHorizontalResize({
    initialWidth: LAYOUT_CONSTANTS.ASSET_MANAGER.DEFAULT_WIDTH,
    minWidth: LAYOUT_CONSTANTS.ASSET_MANAGER.MIN_WIDTH,
    maxWidth: LAYOUT_CONSTANTS.ASSET_MANAGER.MAX_WIDTH,
    storageKey: LAYOUT_CONSTANTS.ASSET_MANAGER.STORAGE_KEY,
  });

  const inspectorResize = useHorizontalResize({
    initialWidth: LAYOUT_CONSTANTS.INSPECTOR.DEFAULT_WIDTH,
    minWidth: LAYOUT_CONSTANTS.INSPECTOR.MIN_WIDTH,
    maxWidth: LAYOUT_CONSTANTS.INSPECTOR.MAX_WIDTH,
    storageKey: LAYOUT_CONSTANTS.INSPECTOR.STORAGE_KEY,
    invertDrag: true,
  });

  // Persist collapse states
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(LAYOUT_CONSTANTS.ASSET_MANAGER.COLLAPSED_KEY, String(assetManagerCollapsed));
    }
  }, [assetManagerCollapsed]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(LAYOUT_CONSTANTS.INSPECTOR.COLLAPSED_KEY, String(inspectorCollapsed));
    }
  }, [inspectorCollapsed]);

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Prevent body scroll and set viewport height
  useEffect(() => {
    const handleResize = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty("--vh", `${vh}px`);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      window.removeEventListener("resize", handleResize);
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    };
  }, []);

  // Deselect handler
  const handleCanvasBackgroundClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      selectClips([]);
    }
  };

  // Loading state
  if (!isInitialLoadComplete) {
    return (
      <div className="flex items-center justify-center h-full bg-background p-6">
        <div className="text-center">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent mx-auto mb-3" />
          <h3 className="text-lg font-medium mb-2">Loading Editor</h3>
          <p className="text-sm text-muted-foreground">Checking for saved work...</p>
        </div>
      </div>
    );
  }

  // Mobile fallback
  if (isMobile && !enableMobileLayout) {
    return (
      <div className="flex items-center justify-center h-full bg-background p-6">
        <div className="text-center max-w-sm">
          <h2 className="text-xl font-medium mb-3">Video Editor</h2>
          <p className="text-sm text-muted-foreground mb-4">
            The video editor is optimized for desktop screens. Please use a larger device for the best experience.
          </p>
        </div>
      </div>
    );
  }

  // Calculate sizes
  const leftPanelWidth = assetManagerCollapsed ? 40 : assetManagerResize.size;
  const rightPanelWidth = inspectorCollapsed ? 40 : inspectorResize.size;

  return (
    <div 
      ref={containerRef}
      data-editor-root
      className="h-full w-full bg-background overflow-hidden flex flex-col"
    >
      {/* Header (optional) */}
      {header && <div className="shrink-0">{header}</div>}

      {/* Main Editor Grid - takes all remaining vertical space */}
      <div 
        className="flex-1 flex flex-col overflow-hidden"
        style={{ minHeight: 0 }}
      >
        {/* Top Section: Asset Manager | Canvas | Inspector */}
        <div 
          className="flex-1 flex overflow-hidden"
          style={{ minHeight: 0 }}
        >
          {/* Asset Manager */}
          <Panel 
            className={cn(
              "shrink-0 border-r border-border bg-background",
              assetManagerCollapsed && "flex items-start justify-center pt-2"
            )}
            style={{ width: leftPanelWidth }}
          >
            {assetManagerCollapsed ? (
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setAssetManagerCollapsed(false)}
                    >
                      <PanelLeftClose className="h-4 w-4 rotate-180" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Show Asset Manager</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <AssetManager onClose={() => setAssetManagerCollapsed(true)} />
            )}
          </Panel>

          {/* Asset Manager Resize Handle */}
          {!assetManagerCollapsed && (
            <ResizeHandle
              onMouseDown={assetManagerResize.handleMouseDown}
              onTouchStart={assetManagerResize.handleTouchStart}
              isResizing={assetManagerResize.isResizing}
            />
          )}

          {/* Canvas/Video Preview - takes remaining space */}
          <Panel 
            className="flex-1 bg-background"
            style={{ cursor: currentCursor, minWidth: 0 }}
          >
            <div 
              className="h-full w-full overflow-hidden"
              onClick={handleCanvasBackgroundClick}
            >
              <VideoPlayer playerRef={playerRef} />
            </div>
          </Panel>

          {/* Inspector Resize Handle */}
          {!inspectorCollapsed && (
            <ResizeHandle
              onMouseDown={inspectorResize.handleMouseDown}
              onTouchStart={inspectorResize.handleTouchStart}
              isResizing={inspectorResize.isResizing}
            />
          )}

          {/* Inspector Panel */}
          <Panel 
            className={cn(
              "shrink-0 border-l border-border bg-background",
              inspectorCollapsed && "flex items-start justify-center pt-2"
            )}
            style={{ width: rightPanelWidth }}
          >
            {inspectorCollapsed ? (
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setInspectorCollapsed(false)}
                    >
                      <PanelRightClose className="h-4 w-4 rotate-180" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left">Show Inspector</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <InspectorPanel onClose={() => setInspectorCollapsed(true)} />
            )}
          </Panel>
        </div>

        {/* Timeline Section - uses its own resize mechanism */}
        <div className="shrink-0 overflow-hidden" style={{ contain: 'layout style paint' }}>
          <TimelineSection />
        </div>
      </div>

      {/* Mobile Navigation */}
      {isMobile && enableMobileLayout && <MobileNavBar />}
    </div>
  );
};

export default EditorLayout;
