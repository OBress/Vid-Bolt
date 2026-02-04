/**
 * CanvasInteractionLayer - Interaction overlay for the canvas
 *
 * Handles:
 * - Shape drawing via click-drag
 * - Text placement via click
 * - Pan/zoom interactions
 * - Selection gestures
 */

import React, { useCallback, useRef, useEffect } from "react";
import { useToolContext } from "../../contexts/tool-context";
import { useShapeCreation } from "../../hooks/use-shape-creation";
import { ToolType, SHAPE_TOOLS } from "../../types/tools";
import { ShapePreview } from "./shape-preview";
import { cn } from "../../utils/general/utils";

// ==========================================
// TYPES
// ==========================================

interface CanvasInteractionLayerProps {
  /** Canvas dimensions from the composition */
  canvasWidth: number;
  canvasHeight: number;
  /** The rendered container dimensions */
  containerWidth: number;
  containerHeight: number;
  /** Callback when clicking empty space (for deselection) */
  onBackgroundClick?: () => void;
  /** Children (the actual video player content) */
  children?: React.ReactNode;
  /** Additional class names */
  className?: string;
}

// ==========================================
// COMPONENT
// ==========================================

export const CanvasInteractionLayer: React.FC<CanvasInteractionLayerProps> = ({
  canvasWidth,
  canvasHeight,
  containerWidth,
  containerHeight,
  onBackgroundClick,
  children,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { activeTool, toolState, currentCursor } = useToolContext();

  const {
    handleMouseDown: handleShapeMouseDown,
    handleMouseMove: handleShapeMouseMove,
    handleMouseUp: handleShapeMouseUp,
    handleCancel: handleShapeCancel,
    isCreating,
    previewBounds,
    shapeType,
  } = useShapeCreation();

  // Determine if we should intercept mouse events
  const isShapeTool = SHAPE_TOOLS.includes(activeTool);
  const isTextTool = activeTool === ToolType.TEXT;
  const isHandTool = activeTool === ToolType.HAND;
  const isZoomTool = activeTool === ToolType.ZOOM;

  // Get canvas rect helper
  const getCanvasRect = useCallback((): DOMRect | null => {
    if (!containerRef.current) return null;

    // Calculate the actual canvas area within the container
    const containerRect = containerRef.current.getBoundingClientRect();
    const aspectRatio = canvasWidth / canvasHeight;
    const containerAspect = containerRect.width / containerRect.height;

    let renderWidth: number;
    let renderHeight: number;
    let offsetX: number;
    let offsetY: number;

    if (containerAspect > aspectRatio) {
      renderHeight = containerRect.height;
      renderWidth = renderHeight * aspectRatio;
      offsetX = (containerRect.width - renderWidth) / 2;
      offsetY = 0;
    } else {
      renderWidth = containerRect.width;
      renderHeight = renderWidth / aspectRatio;
      offsetX = 0;
      offsetY = (containerRect.height - renderHeight) / 2;
    }

    // Return a DOMRect for the actual canvas area
    return new DOMRect(
      containerRect.left + offsetX,
      containerRect.top + offsetY,
      renderWidth,
      renderHeight
    );
  }, [canvasWidth, canvasHeight]);

  // Mouse down handler
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const canvasRect = getCanvasRect();
      if (!canvasRect) return;

      // Check if click is within the canvas area
      const isWithinCanvas =
        e.clientX >= canvasRect.left &&
        e.clientX <= canvasRect.right &&
        e.clientY >= canvasRect.top &&
        e.clientY <= canvasRect.bottom;

      if (!isWithinCanvas) {
        // Clicked outside canvas - deselect
        onBackgroundClick?.();
        return;
      }

      if (isShapeTool) {
        e.preventDefault();
        e.stopPropagation();
        handleShapeMouseDown(e, canvasRect);
      } else if (activeTool === ToolType.SELECT && e.target === e.currentTarget) {
        // Clicked on empty canvas with select tool - deselect
        onBackgroundClick?.();
      }
    },
    [getCanvasRect, isShapeTool, activeTool, handleShapeMouseDown, onBackgroundClick]
  );

  // Mouse move handler
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!toolState.isDrawing) return;

      const canvasRect = getCanvasRect();
      if (!canvasRect) return;

      if (isShapeTool) {
        e.preventDefault();
        handleShapeMouseMove(e, canvasRect);
      }
    },
    [getCanvasRect, isShapeTool, toolState.isDrawing, handleShapeMouseMove]
  );

  // Mouse up handler
  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (toolState.isDrawing && isShapeTool) {
        e.preventDefault();
        handleShapeMouseUp();
      }
    },
    [isShapeTool, toolState.isDrawing, handleShapeMouseUp]
  );

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape to cancel drawing
      if (e.key === "Escape" && toolState.isDrawing) {
        handleShapeCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toolState.isDrawing, handleShapeCancel]);

  // Handle mouse leaving the window during drawing
  useEffect(() => {
    const handleMouseLeave = () => {
      if (toolState.isDrawing && isShapeTool) {
        handleShapeMouseUp();
      }
    };

    window.addEventListener("mouseup", handleMouseLeave);
    return () => window.removeEventListener("mouseup", handleMouseLeave);
  }, [toolState.isDrawing, isShapeTool, handleShapeMouseUp]);

  // Calculate actual canvas render area for preview scaling
  const canvasRect = getCanvasRect();
  const previewContainerWidth = canvasRect?.width || containerWidth;
  const previewContainerHeight = canvasRect?.height || containerHeight;
  const previewOffsetX = canvasRect
    ? canvasRect.left - (containerRef.current?.getBoundingClientRect().left || 0)
    : 0;
  const previewOffsetY = canvasRect
    ? canvasRect.top - (containerRef.current?.getBoundingClientRect().top || 0)
    : 0;

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative w-full h-full",
        isShapeTool && "select-none",
        className
      )}
      style={{ cursor: currentCursor }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Video player content */}
      {children}

      {/* Shape preview overlay */}
      {isCreating && previewBounds && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: previewOffsetX,
            top: previewOffsetY,
            width: previewContainerWidth,
            height: previewContainerHeight,
          }}
        >
          <ShapePreview
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
            containerWidth={previewContainerWidth}
            containerHeight={previewContainerHeight}
          />
        </div>
      )}

      {/* Drawing indicator */}
      {isShapeTool && !toolState.isDrawing && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 px-2 py-1 rounded bg-black/60 text-white text-xs pointer-events-none z-10">
          Click and drag to draw {getToolName(activeTool)}
        </div>
      )}
    </div>
  );
};

// Helper function
function getToolName(tool: ToolType): string {
  switch (tool) {
    case ToolType.RECTANGLE:
      return "rectangle";
    case ToolType.ELLIPSE:
      return "ellipse";
    case ToolType.TRIANGLE:
      return "triangle";
    case ToolType.LINE:
      return "line";
    default:
      return "shape";
  }
}

export default CanvasInteractionLayer;
