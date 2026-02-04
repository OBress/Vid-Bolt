/**
 * ShapePreview - Preview overlay shown while drawing a shape
 * 
 * Displays a semi-transparent preview of the shape being created
 * based on the current draw bounds from the tool context.
 */

import React from "react";
import { useToolContext } from "../../contexts/tool-context";
import { ToolType } from "../../types/tools";
import { cn } from "../../utils/general/utils";

// ==========================================
// SHAPE PREVIEW COMPONENT
// ==========================================

interface ShapePreviewProps {
  /** Canvas dimensions for scaling */
  canvasWidth: number;
  canvasHeight: number;
  /** Container dimensions */
  containerWidth: number;
  containerHeight: number;
}

export const ShapePreview: React.FC<ShapePreviewProps> = ({
  canvasWidth,
  canvasHeight,
  containerWidth,
  containerHeight,
}) => {
  const { activeTool, toolState, drawBounds, shapeOptions } = useToolContext();

  // Don't render if not drawing or no bounds
  if (!toolState.isDrawing || !drawBounds) {
    return null;
  }

  // Calculate scale factor
  const scaleX = containerWidth / canvasWidth;
  const scaleY = containerHeight / canvasHeight;

  // Convert canvas coordinates to container coordinates
  const left = drawBounds.x * scaleX;
  const top = drawBounds.y * scaleY;
  const width = drawBounds.width * scaleX;
  const height = drawBounds.height * scaleY;

  // Common styles
  const commonStyles: React.CSSProperties = {
    position: "absolute",
    left,
    top,
    width,
    height,
    pointerEvents: "none",
    backgroundColor: shapeOptions.fillEnabled ? shapeOptions.fillColor : "transparent",
    border: shapeOptions.strokeEnabled 
      ? `${shapeOptions.strokeWidth}px solid ${shapeOptions.strokeColor}` 
      : "2px dashed rgba(59, 130, 246, 0.8)",
    opacity: 0.7,
  };

  // Render shape based on tool type
  switch (activeTool) {
    case ToolType.RECTANGLE:
      return (
        <div
          style={commonStyles}
          className="transition-none"
        />
      );

    case ToolType.ELLIPSE:
      return (
        <div
          style={{
            ...commonStyles,
            borderRadius: "50%",
          }}
          className="transition-none"
        />
      );

    case ToolType.TRIANGLE:
      // Use clip-path for triangle
      return (
        <div
          style={{
            ...commonStyles,
            clipPath: "polygon(50% 0%, 100% 100%, 0% 100%)",
          }}
          className="transition-none"
        />
      );

    case ToolType.LINE:
      // Calculate line angle and length
      const startX = toolState.drawStart?.x ?? 0;
      const startY = toolState.drawStart?.y ?? 0;
      const endX = toolState.drawCurrent?.x ?? 0;
      const endY = toolState.drawCurrent?.y ?? 0;
      
      const deltaX = endX - startX;
      const deltaY = endY - startY;
      const length = Math.sqrt(deltaX * deltaX + deltaY * deltaY) * scaleX;
      const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
      
      return (
        <div
          style={{
            position: "absolute",
            left: startX * scaleX,
            top: startY * scaleY,
            width: length,
            height: shapeOptions.strokeWidth || 2,
            backgroundColor: shapeOptions.strokeEnabled ? shapeOptions.strokeColor : "rgba(59, 130, 246, 0.8)",
            transformOrigin: "left center",
            transform: `rotate(${angle}deg)`,
            pointerEvents: "none",
          }}
          className="transition-none"
        />
      );

    default:
      return null;
  }
};

export default ShapePreview;
