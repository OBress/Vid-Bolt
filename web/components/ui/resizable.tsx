"use client";

import * as React from "react";
import { GripVerticalIcon, GripHorizontalIcon } from "lucide-react";
import {
  Group as PanelGroup,
  Panel,
  Separator as PanelResizeHandle,
} from "react-resizable-panels";

import { cn } from "@/lib/utils";

interface ResizablePanelGroupProps
  extends Omit<React.ComponentProps<typeof PanelGroup>, "orientation"> {
  direction?: "horizontal" | "vertical";
  onLayoutChange?: (sizes: Record<string, number>) => void;
}

function ResizablePanelGroup({
  className,
  direction = "horizontal",
  onLayoutChange,
  ...props
}: ResizablePanelGroupProps) {
  return (
    <PanelGroup
      data-slot="resizable-panel-group"
      data-panel-group-direction={direction}
      orientation={direction}
      onLayoutChange={onLayoutChange}
      className={cn(
        "flex h-full w-full",
        direction === "vertical" && "flex-col",
        className
      )}
      {...props}
    />
  );
}

function ResizablePanel({
  className,
  ...props
}: React.ComponentProps<typeof Panel>) {
  return (
    <Panel
      data-slot="resizable-panel"
      className={cn("", className)}
      {...props}
    />
  );
}

function ResizableHandle({
  withHandle,
  className,
  direction = "horizontal",
  ...props
}: React.ComponentProps<typeof PanelResizeHandle> & {
  withHandle?: boolean;
  direction?: "horizontal" | "vertical";
}) {
  return (
    <PanelResizeHandle
      data-slot="resizable-handle"
      data-panel-group-direction={direction}
      className={cn(
        "bg-border/50 hover:bg-primary/30 transition-colors focus-visible:ring-ring relative flex items-center justify-center focus-visible:ring-1 focus-visible:ring-offset-1 focus-visible:outline-hidden",
        direction === "vertical"
          ? "h-1.5 w-full cursor-row-resize"
          : "w-1.5 h-full cursor-col-resize",
        className
      )}
      {...props}
    >
      {withHandle && (
        <div
          className={cn(
            "bg-muted-foreground/20 hover:bg-muted-foreground/40 z-10 flex items-center justify-center rounded-sm transition-colors",
            direction === "vertical" ? "h-1.5 w-8" : "h-8 w-1.5"
          )}
        >
          {direction === "vertical" ? (
            <GripHorizontalIcon className="size-3 text-muted-foreground" />
          ) : (
            <GripVerticalIcon className="size-3 text-muted-foreground" />
          )}
        </div>
      )}
    </PanelResizeHandle>
  );
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
