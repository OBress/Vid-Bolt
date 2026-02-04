import React from "react";
import { GuidePosition, AlignmentGuideState } from "../../hooks/use-alignment-guides";

export interface AlignmentGuidesProps {
  guideState: AlignmentGuideState;
  canvasWidth: number;
  canvasHeight: number;
}

/**
 * Simple Photoshop-style alignment guides
 * Renders solid colored lines across the entire canvas
 */
export const AlignmentGuides: React.FC<AlignmentGuidesProps> = ({
  guideState,
  canvasWidth,
  canvasHeight,
}) => {
  // Don't render if not active or no guides
  if (!guideState.isActive || guideState.guides.length === 0) {
    return null;
  }

  // Get color based on guide type
  const getGuideColor = (guide: GuidePosition): string => {
    if (guide.type.startsWith("canvas-center")) {
      return "#00FFFF"; // Bright cyan for center
    }
    if (guide.type.startsWith("canvas-edge")) {
      return "#FF00FF"; // Bright magenta for edges
    }
    return "#FF00FF"; // Magenta for element alignment
  };

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: canvasWidth,
        height: canvasHeight,
        pointerEvents: "none",
        zIndex: 999999,
        overflow: "visible",
      }}
      >
        {guideState.guides.map((guide) => {
          const color = getGuideColor(guide);

        // Vertical line (for x position)
          if (guide.x !== undefined) {
            return (
            <div
                key={guide.id}
                style={{
                position: "absolute",
                left: guide.x - 1, // Center the 2px line
                top: 0,
                width: 2,
                height: canvasHeight,
                backgroundColor: color,
                boxShadow: `0 0 6px ${color}, 0 0 2px ${color}`,
                pointerEvents: "none",
                }}
              />
            );
          }

        // Horizontal line (for y position)
          if (guide.y !== undefined) {
            return (
            <div
                key={guide.id}
                style={{
                position: "absolute",
                left: 0,
                top: guide.y - 1, // Center the 2px line
                width: canvasWidth,
                height: 2,
                backgroundColor: color,
                boxShadow: `0 0 6px ${color}, 0 0 2px ${color}`,
                pointerEvents: "none",
                }}
              />
            );
          }

          return null;
      })}
    </div>
  );
}; 
