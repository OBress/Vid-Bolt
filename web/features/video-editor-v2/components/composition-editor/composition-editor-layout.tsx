/**
 * CompositionEditorLayout - Panel Layout for Composition Editor
 * 
 * Three-panel layout similar to the main editor:
 * - Left: AI Chat Panel (for modifying composition with AI)
 * - Center: Composition Preview (Remotion player)
 * - Right: Composition Inspector (layer properties)
 * - Bottom: Composition Timeline (layer visualization)
 * 
 * All panels are resizable with localStorage persistence.
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "../../utils/general/utils";
import { useCompositionEditorStore } from "../../stores/composition-editor-store";
import { ChatPanel } from "./chat-panel/chat-panel";
import { CompositionInspector } from "./composition-inspector/composition-inspector";
import { CompositionTimeline } from "./composition-timeline/composition-timeline";
import { CompositionPreview } from "./composition-preview/composition-preview";

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
  CHAT_PANEL: {
    DEFAULT_WIDTH: 320,
    MIN_WIDTH: 250,
    MAX_WIDTH: 500,
    STORAGE_KEY: 'comp-editor-chat-panel-width',
    COLLAPSED_KEY: 'comp-editor-chat-panel-collapsed',
  },
  INSPECTOR: {
    DEFAULT_WIDTH: 320,
    MIN_WIDTH: 250,
    MAX_WIDTH: 500,
    STORAGE_KEY: 'comp-editor-inspector-width',
    COLLAPSED_KEY: 'comp-editor-inspector-collapsed',
  },
  TIMELINE: {
    DEFAULT_HEIGHT: 250,
    MIN_HEIGHT: 150,
    MAX_HEIGHT: 500,
    STORAGE_KEY: 'comp-editor-timeline-height',
  },
} as const;

// ==========================================
// HORIZONTAL RESIZE HOOK
// ==========================================

interface UseHorizontalResizeOptions {
  initialWidth: number;
  minWidth: number;
  maxWidth: number;
  storageKey: string;
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
// VERTICAL RESIZE HOOK
// ==========================================

interface UseVerticalResizeOptions {
  initialHeight: number;
  minHeight: number;
  maxHeight: number;
  storageKey: string;
}

function useVerticalResize({
  initialHeight,
  minHeight,
  maxHeight,
  storageKey,
}: UseVerticalResizeOptions) {
  const [size, setSize] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed) && parsed >= minHeight && parsed <= maxHeight) {
          return parsed;
        }
      }
    }
    return initialHeight;
  });

  const [isResizing, setIsResizing] = useState(false);
  const startPosRef = useRef(0);
  const startSizeRef = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startPosRef.current = e.clientY;
    startSizeRef.current = size;
  }, [size]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Dragging up increases height (negative delta)
      const delta = startPosRef.current - e.clientY;
      const newSize = Math.min(maxHeight, Math.max(minHeight, startSizeRef.current + delta));
      setSize(newSize);
    };

    const handleEnd = () => {
      setIsResizing(false);
      localStorage.setItem(storageKey, String(size));
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleEnd);

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'row-resize';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleEnd);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isResizing, minHeight, maxHeight, storageKey, size]);

  return {
    size,
    setSize,
    isResizing,
    handleMouseDown,
  };
}

// ==========================================
// RESIZE HANDLE COMPONENTS
// ==========================================

interface HorizontalResizeHandleProps {
  onMouseDown: (e: React.MouseEvent) => void;
  onTouchStart: (e: React.TouchEvent) => void;
  isResizing: boolean;
}

const HorizontalResizeHandle: React.FC<HorizontalResizeHandleProps> = ({
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
        "bg-border/50 hover:bg-purple-500/30 transition-colors",
        isResizing && "bg-purple-500/50"
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

interface VerticalResizeHandleProps {
  onMouseDown: (e: React.MouseEvent) => void;
  isResizing: boolean;
}

const VerticalResizeHandle: React.FC<VerticalResizeHandleProps> = ({
  onMouseDown,
  isResizing,
}) => {
  return (
    <div
      onMouseDown={onMouseDown}
      className={cn(
        "h-[6px] cursor-row-resize flex items-center justify-center group z-10 shrink-0",
        "bg-border/50 hover:bg-purple-500/30 transition-colors",
        isResizing && "bg-purple-500/50"
      )}
    >
      <div className={cn(
        "w-12 h-1 rounded-full",
        "bg-muted-foreground/30 group-hover:bg-muted-foreground/50 transition-colors"
      )} />
    </div>
  );
};

// ==========================================
// PANEL WRAPPER
// ==========================================

interface PanelProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

const Panel: React.FC<PanelProps> = ({ children, className, style }) => (
  <div 
    className={cn(
      "relative overflow-hidden h-full",
      className
    )}
    style={style}
  >
    {children}
  </div>
);

// ==========================================
// MAIN LAYOUT COMPONENT
// ==========================================

export const CompositionEditorLayout: React.FC = () => {
  // Panel collapse states
  const [chatPanelCollapsed, setChatPanelCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(LAYOUT_CONSTANTS.CHAT_PANEL.COLLAPSED_KEY) === 'true';
    }
    return false;
  });

  const [inspectorCollapsed, setInspectorCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(LAYOUT_CONSTANTS.INSPECTOR.COLLAPSED_KEY) === 'true';
    }
    return false;
  });

  // Resize states
  const chatPanelResize = useHorizontalResize({
    initialWidth: LAYOUT_CONSTANTS.CHAT_PANEL.DEFAULT_WIDTH,
    minWidth: LAYOUT_CONSTANTS.CHAT_PANEL.MIN_WIDTH,
    maxWidth: LAYOUT_CONSTANTS.CHAT_PANEL.MAX_WIDTH,
    storageKey: LAYOUT_CONSTANTS.CHAT_PANEL.STORAGE_KEY,
  });

  const inspectorResize = useHorizontalResize({
    initialWidth: LAYOUT_CONSTANTS.INSPECTOR.DEFAULT_WIDTH,
    minWidth: LAYOUT_CONSTANTS.INSPECTOR.MIN_WIDTH,
    maxWidth: LAYOUT_CONSTANTS.INSPECTOR.MAX_WIDTH,
    storageKey: LAYOUT_CONSTANTS.INSPECTOR.STORAGE_KEY,
    invertDrag: true,
  });

  const timelineResize = useVerticalResize({
    initialHeight: LAYOUT_CONSTANTS.TIMELINE.DEFAULT_HEIGHT,
    minHeight: LAYOUT_CONSTANTS.TIMELINE.MIN_HEIGHT,
    maxHeight: LAYOUT_CONSTANTS.TIMELINE.MAX_HEIGHT,
    storageKey: LAYOUT_CONSTANTS.TIMELINE.STORAGE_KEY,
  });

  // Persist collapse states
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(LAYOUT_CONSTANTS.CHAT_PANEL.COLLAPSED_KEY, String(chatPanelCollapsed));
    }
  }, [chatPanelCollapsed]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(LAYOUT_CONSTANTS.INSPECTOR.COLLAPSED_KEY, String(inspectorCollapsed));
    }
  }, [inspectorCollapsed]);

  // Calculate panel widths
  const leftPanelWidth = chatPanelCollapsed ? 40 : chatPanelResize.size;
  const rightPanelWidth = inspectorCollapsed ? 40 : inspectorResize.size;

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-background">
      {/* Main content area (above timeline) */}
      <div className="flex-1 flex overflow-hidden" style={{ minHeight: 0 }}>
        {/* Chat Panel (Left) */}
        <Panel
          className={cn(
            "shrink-0 border-r border-border bg-background",
            chatPanelCollapsed && "flex items-start justify-center pt-2"
          )}
          style={{ width: leftPanelWidth }}
        >
          {chatPanelCollapsed ? (
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setChatPanelCollapsed(false)}
                  >
                    <PanelLeftClose className="h-4 w-4 rotate-180" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Show AI Chat</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <ChatPanel onClose={() => setChatPanelCollapsed(true)} />
          )}
        </Panel>

        {/* Chat Panel Resize Handle */}
        {!chatPanelCollapsed && (
          <HorizontalResizeHandle
            onMouseDown={chatPanelResize.handleMouseDown}
            onTouchStart={chatPanelResize.handleTouchStart}
            isResizing={chatPanelResize.isResizing}
          />
        )}

        {/* Composition Preview (Center) */}
        <Panel className="flex-1 bg-background" style={{ minWidth: 0 }}>
          <CompositionPreview />
        </Panel>

        {/* Inspector Resize Handle */}
        {!inspectorCollapsed && (
          <HorizontalResizeHandle
            onMouseDown={inspectorResize.handleMouseDown}
            onTouchStart={inspectorResize.handleTouchStart}
            isResizing={inspectorResize.isResizing}
          />
        )}

        {/* Inspector Panel (Right) */}
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
            <CompositionInspector onClose={() => setInspectorCollapsed(true)} />
          )}
        </Panel>
      </div>

      {/* Timeline Resize Handle */}
      <VerticalResizeHandle
        onMouseDown={timelineResize.handleMouseDown}
        isResizing={timelineResize.isResizing}
      />

      {/* Composition Timeline (Bottom) */}
      <div
        className="shrink-0 border-t border-border overflow-hidden"
        style={{ height: timelineResize.size }}
      >
        <CompositionTimeline />
      </div>
    </div>
  );
};

export default CompositionEditorLayout;
