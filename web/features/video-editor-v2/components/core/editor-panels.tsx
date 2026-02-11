import * as React from "react";
import {
  Film,
  Music,
  Type,
  Subtitles,
  ImageIcon,
  FolderOpen,
  Sticker,
  Layout,
  ChevronsLeft,
  Settings,
  Shuffle,
  GripVertical,
  PanelLeftClose,
} from "lucide-react";

import { OverlayType } from "../../types";
import { useEditorSidebar } from "../../contexts/sidebar-context";
import { useEditorContext } from "../../contexts/editor-context";
import { useHorizontalResize } from "../../hooks/use-horizontal-resize";

// PERF: Lazy-loaded overlay panels — only the active panel's code is loaded.
// Each panel becomes its own webpack chunk, reducing initial bundle by ~300KB+.
const VideoOverlayPanel = React.lazy(() => import("../overlay/video/video-overlay-panel").then(m => ({ default: m.VideoOverlayPanel })));
const TextOverlaysPanel = React.lazy(() => import("../overlay/text/text-overlays-panel").then(m => ({ default: m.TextOverlaysPanel })));
const SoundsOverlayPanel = React.lazy(() => import("../overlay/sounds/sounds-overlay-panel"));
const CaptionsOverlayPanel = React.lazy(() => import("../overlay/captions/captions-overlay-panel").then(m => ({ default: m.CaptionsOverlayPanel })));
const ImageOverlayPanel = React.lazy(() => import("../overlay/images/image-overlay-panel").then(m => ({ default: m.ImageOverlayPanel })));
const LocalMediaPanel = React.lazy(() => import("../overlay/local-media/local-media-panel"));
const StickersPanel = React.lazy(() => import("../overlay/stickers/stickers-panel").then(m => ({ default: m.StickersPanel })));
const TemplateOverlayPanel = React.lazy(() => import("../overlay/templates/template-overlay-panel").then(m => ({ default: m.TemplateOverlayPanel })));
const TransitionsOverlayPanel = React.lazy(() => import("../overlay/transitions/transitions-overlay-panel"));
const SettingsPanel = React.lazy(() => import("../settings/settings-panel").then(m => ({ default: m.SettingsPanel })));

/** Lightweight skeleton shown while a panel chunk is loading */
const PanelSkeleton: React.FC = () => (
  <div className="flex flex-col gap-3 p-4 animate-pulse">
    <div className="h-8 bg-muted/40 rounded-md w-3/4" />
    <div className="h-4 bg-muted/30 rounded-md w-full" />
    <div className="h-4 bg-muted/30 rounded-md w-5/6" />
    <div className="h-24 bg-muted/20 rounded-md w-full" />
    <div className="h-4 bg-muted/30 rounded-md w-2/3" />
  </div>
);

import { Button } from "../ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import { cn } from "../../utils/general/utils";

/** Panel resize constants */
const PANEL_CONSTANTS = {
  /** Default panel width */
  DEFAULT_WIDTH: 600,
  /** Minimum panel width */
  MIN_WIDTH: 300,
  /** Maximum panel width */
  MAX_WIDTH: 900,
  /** Icon navigation width */
  ICON_NAV_WIDTH: 48,
} as const;

interface PanelResizeHandleProps {
  onMouseDown: (e: React.MouseEvent) => void;
  onTouchStart: (e: React.TouchEvent) => void;
  isResizing: boolean;
}

/**
 * Draggable resize handle component for the panel
 * Allows users to adjust the width of the panel by dragging left or right
 */
const PanelResizeHandle: React.FC<PanelResizeHandleProps> = ({ 
  onMouseDown, 
  onTouchStart,
  isResizing 
}) => {
  return (
    <div
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      className={cn(
        "w-1 bg-border hover:bg-primary/50 transition-colors cursor-ew-resize",
        "flex items-center justify-center group relative shrink-0",
        isResizing && "bg-primary"
      )}
      style={{ touchAction: 'none' }}
    >
      {/* Visual grip indicator - shows on hover */}
      <div className={cn(
        "absolute inset-y-0 w-3 -right-1 flex items-center justify-center",
        "opacity-0 group-hover:opacity-100 transition-opacity"
      )}>
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  );
};

interface EditorPanelsProps {
  /** Array of overlay types to disable/hide from the panels */
  disabledPanels?: OverlayType[];
  /** Whether to show icon titles */
  showIconTitles?: boolean;
  /** Default panel width (overridden by saved user preference) */
  defaultWidth?: number;
  /** Additional class names for the container */
  className?: string;
}

/**
 * EditorPanels Component
 * 
 * Premiere Pro-style panel layout with:
 * - Vertical icon navigation on the left
 * - Resizable panel content area on the right
 * - Draggable resize handle
 * 
 * Designed to sit above the timeline, to the left of the video preview
 */
export const EditorPanels: React.FC<EditorPanelsProps> = ({
  disabledPanels = [],
  showIconTitles = false,
  defaultWidth = PANEL_CONSTANTS.DEFAULT_WIDTH,
  className,
}) => {
  const { activePanel, setActivePanel, isCollapsed, toggleCollapsed } = useEditorSidebar();
  const { setSelectedOverlayId, selectedOverlayId, overlays } = useEditorContext();

  // Horizontal resize functionality
  const {
    width: panelWidth,
    isResizing,
    handleMouseDown,
    handleTouchStart,
  } = useHorizontalResize({
    initialWidth: defaultWidth,
    minWidth: PANEL_CONSTANTS.MIN_WIDTH,
    maxWidth: PANEL_CONSTANTS.MAX_WIDTH,
    storageKey: 'editor-panel-width-v1',
  });

  // Get the selected overlay to check its type
  const selectedOverlay = selectedOverlayId !== null 
    ? overlays.find(overlay => overlay.id === selectedOverlayId) 
    : null;

  // Only show back button if there's a selected overlay AND it matches the active panel type
  const shouldShowBackButton = selectedOverlay && selectedOverlay.type === activePanel;

  const getPanelTitle = (type: OverlayType): string => {
    switch (type) {
      case OverlayType.VIDEO:
        return "Video";
      case OverlayType.TEXT:
        return "Text";
      case OverlayType.SOUND:
        return "Audio";
      case OverlayType.CAPTION:
        return "Caption";
      case OverlayType.IMAGE:
        return "Image";
      case OverlayType.LOCAL_DIR:
        return "Uploads";
      case OverlayType.STICKER:
        return "Stickers";
      case OverlayType.TEMPLATE:
        return "Templates";
      case OverlayType.TRANSITION:
        return "Transitions";
      case OverlayType.SETTINGS:
        return "Settings";
      default:
        return "Unknown";
    }
  };

  const navigationItems = [
    { title: getPanelTitle(OverlayType.VIDEO), icon: Film, panel: OverlayType.VIDEO },
    { title: getPanelTitle(OverlayType.TEXT), icon: Type, panel: OverlayType.TEXT },
    { title: getPanelTitle(OverlayType.SOUND), icon: Music, panel: OverlayType.SOUND },
    { title: getPanelTitle(OverlayType.CAPTION), icon: Subtitles, panel: OverlayType.CAPTION },
    { title: getPanelTitle(OverlayType.IMAGE), icon: ImageIcon, panel: OverlayType.IMAGE },
    { title: getPanelTitle(OverlayType.STICKER), icon: Sticker, panel: OverlayType.STICKER },
    { title: getPanelTitle(OverlayType.LOCAL_DIR), icon: FolderOpen, panel: OverlayType.LOCAL_DIR },
    { title: getPanelTitle(OverlayType.TEMPLATE), icon: Layout, panel: OverlayType.TEMPLATE },
    { title: getPanelTitle(OverlayType.TRANSITION), icon: Shuffle, panel: OverlayType.TRANSITION },
  ].filter((item) => !disabledPanels.includes(item.panel));

  const renderActivePanel = () => {
    switch (activePanel) {
      case OverlayType.TEXT:
        return <TextOverlaysPanel />;
      case OverlayType.SOUND:
        return <SoundsOverlayPanel />;
      case OverlayType.VIDEO:
        return <VideoOverlayPanel />;
      case OverlayType.CAPTION:
        return <CaptionsOverlayPanel />;
      case OverlayType.IMAGE:
        return <ImageOverlayPanel />;
      case OverlayType.STICKER:
        return <StickersPanel />;
      case OverlayType.LOCAL_DIR:
        return <LocalMediaPanel />;
      case OverlayType.TEMPLATE:
        return <TemplateOverlayPanel />;
      case OverlayType.TRANSITION:
        return <TransitionsOverlayPanel />;
      case OverlayType.SETTINGS:
        return <SettingsPanel />;
      default:
        return null;
    }
  };

  // Calculate actual width based on collapsed state
  const actualWidth = isCollapsed ? PANEL_CONSTANTS.ICON_NAV_WIDTH : panelWidth;

  return (
    <div 
      className={cn("flex bg-background overflow-hidden shrink-0 transition-all duration-200", className)}
      style={{ width: actualWidth, height: '100%' }}
    >
      {/* Icon Navigation - Vertical strip */}
      <div 
        className={cn(
          "flex flex-col bg-muted/30 shrink-0 overflow-hidden",
          !isCollapsed && "border-r border-border"
        )}
        style={{ width: PANEL_CONSTANTS.ICON_NAV_WIDTH }}
      >
        {/* Main navigation items - scrollable */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin">
          <div className="flex flex-col gap-0.5 p-1">
            {navigationItems.map((item) => (
              <TooltipProvider key={item.title} delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActivePanel(item.panel);
                        // If collapsed, expand when clicking a panel button
                        if (isCollapsed) {
                          toggleCollapsed();
                        }
                      }}
                      className={cn(
                        "flex flex-col items-center justify-center gap-1 p-2 rounded-md transition-colors",
                        "hover:bg-accent hover:text-accent-foreground",
                        activePanel === item.panel 
                          ? "bg-accent text-accent-foreground" 
                          : "text-muted-foreground"
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                      {showIconTitles && (
                        <span className="text-[8px] leading-none">{item.title}</span>
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={8}>
                    {item.title}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ))}
          </div>
        </div>
        
        {/* Settings at bottom - fixed */}
        <div className="border-t border-border p-1 shrink-0">
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActivePanel(OverlayType.SETTINGS);
                    // If collapsed, expand when clicking settings
                    if (isCollapsed) {
                      toggleCollapsed();
                    }
                  }}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 p-2 rounded-md w-full transition-colors",
                    "hover:bg-accent hover:text-accent-foreground",
                    activePanel === OverlayType.SETTINGS 
                      ? "bg-accent text-accent-foreground" 
                      : "text-muted-foreground"
                  )}
                >
                  <Settings className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                  {showIconTitles && (
                    <span className="text-[8px] leading-none">Settings</span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                Settings
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Panel Content Area - takes remaining space, uses relative positioning */}
      {!isCollapsed && (
        <>
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
            {/* Panel Header - fixed height */}
            <div className="flex items-center justify-between h-10 px-3 border-b border-border bg-muted/20 shrink-0">
              <h3 className="text-sm font-medium text-foreground truncate">
                {activePanel ? getPanelTitle(activePanel) : ""}
              </h3>
              <div className="flex items-center gap-1">
                {shouldShowBackButton && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() => setSelectedOverlayId(null)}
                    aria-label="Back"
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                )}
                {/* Collapse button in header */}
                <TooltipProvider delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCollapsed();
                        }}
                        aria-label="Collapse panel"
                      >
                        <PanelLeftClose className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" sideOffset={4}>
                      Collapse panel
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
            
            {/* Panel Content - absolute positioned to fill remaining space */}
            <div className="absolute left-0 right-0 bottom-0 overflow-hidden" style={{ top: 40 }}>
              <React.Suspense fallback={<PanelSkeleton />}>
                {renderActivePanel()}
              </React.Suspense>
            </div>
          </div>

          {/* Resize Handle */}
          <PanelResizeHandle
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            isResizing={isResizing}
          />
        </>
      )}

    </div>
  );
};
