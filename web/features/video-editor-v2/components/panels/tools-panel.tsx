/**
 * ToolsPanel - Canvas drawing tools for the video editor
 * 
 * A compact panel showing available canvas tools:
 * - Selection Tool (V) - Select and move elements
 * - Text Tool (T) - Add text to canvas
 * - Rectangle Tool (R) - Draw rectangles
 * - Ellipse Tool (E/O) - Draw ellipses/circles
 * - Line Tool (L) - Draw lines
 * - Hand Tool (H) - Pan the canvas view
 * 
 * Each tool has a keyboard shortcut displayed in a tooltip.
 * The active tool is visually highlighted.
 * 
 * Uses the existing ToolContext for state management.
 */

import React from "react";
import { cn } from "../../utils/general/utils";
import { Button } from "../ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import {
  MousePointer2,
  Type,
  Square,
  Circle,
  Minus,
  Hand,
} from "lucide-react";
import { useToolContext } from "../../contexts/tool-context";
import { ToolType, TOOL_METADATA } from "../../types/tools";

// ==========================================
// TYPES
// ==========================================

interface ToolsPanelProps {
  /** Additional class names */
  className?: string;
  /** Layout direction */
  layout?: "horizontal" | "vertical" | "grid";
  /** Whether to show tool labels */
  showLabels?: boolean;
  /** Whether the panel is compact */
  compact?: boolean;
}

// ==========================================
// ICON MAP
// ==========================================

const TOOL_ICONS: Record<ToolType, React.ComponentType<{ className?: string }>> = {
  [ToolType.SELECT]: MousePointer2,
  [ToolType.TEXT]: Type,
  [ToolType.RECTANGLE]: Square,
  [ToolType.ELLIPSE]: Circle,
  [ToolType.TRIANGLE]: Square, // Using Square as fallback for triangle icon
  [ToolType.LINE]: Minus,
  [ToolType.HAND]: Hand,
  [ToolType.ZOOM]: MousePointer2, // Placeholder
};

// Tools to show in the panel (subset of all available tools)
const PANEL_TOOLS: ToolType[] = [
  ToolType.SELECT,
  ToolType.TEXT,
  ToolType.RECTANGLE,
  ToolType.ELLIPSE,
  ToolType.LINE,
  ToolType.HAND,
];

// ==========================================
// TOOL BUTTON COMPONENT
// ==========================================

interface ToolButtonProps {
  tool: ToolType;
  isActive: boolean;
  onClick: () => void;
  showLabel?: boolean;
  compact?: boolean;
}

const ToolButton: React.FC<ToolButtonProps> = ({
  tool,
  isActive,
  onClick,
  showLabel = false,
  compact = false,
}) => {
  const metadata = TOOL_METADATA[tool];
  const Icon = TOOL_ICONS[tool];

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={isActive ? "secondary" : "ghost"}
            size={compact ? "icon" : "sm"}
            className={cn(
              "relative transition-all",
              compact ? "h-8 w-8" : "h-9 w-9",
              isActive && "bg-primary/20 ring-1 ring-primary/50",
              showLabel && !compact && "flex-col gap-1 h-auto py-2 px-3"
            )}
            onClick={onClick}
          >
            <Icon 
              className={cn(
                "transition-colors",
                compact ? "h-4 w-4" : "h-4 w-4",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            />
            {showLabel && !compact && (
              <span className={cn(
                "text-[9px] leading-none",
                isActive ? "text-primary" : "text-muted-foreground"
              )}>
                {metadata.name}
              </span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left" className="flex items-center gap-2">
          <span>{metadata.name}</span>
          <kbd className="px-1.5 py-0.5 text-[10px] bg-muted rounded border border-border">
            {metadata.shortcut}
          </kbd>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

// ==========================================
// TOOLS PANEL COMPONENT
// ==========================================

export const ToolsPanel: React.FC<ToolsPanelProps> = ({
  className,
  layout = "vertical",
  showLabels = false,
  compact = false,
}) => {
  const { activeTool, setActiveTool } = useToolContext();

  return (
    <div
      className={cn(
        "flex gap-0.5",
        layout === "horizontal" && "flex-row p-1.5",
        layout === "vertical" && "flex-col py-2 px-1",
        layout === "grid" && "grid grid-cols-3 gap-1 p-1.5",
        className
      )}
    >
      {PANEL_TOOLS.map((tool) => (
        <ToolButton
          key={tool}
          tool={tool}
          isActive={activeTool === tool}
          onClick={() => setActiveTool(tool)}
          showLabel={showLabels}
          compact={compact}
        />
      ))}
    </div>
  );
};

export default ToolsPanel;
