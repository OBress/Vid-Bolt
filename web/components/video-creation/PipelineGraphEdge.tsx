"use client";

import { useMemo } from "react";

// ============================================================================
// TYPES
// ============================================================================

export type EdgeStatus = "pending" | "active" | "completed";

interface PipelineGraphEdgeProps {
  /** Source node center position */
  from: { x: number; y: number };
  /** Target node center position */
  to: { x: number; y: number };
  /** Visual state of this edge */
  status: EdgeStatus;
  /** Unique key for CSS animation staggering */
  index?: number;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function PipelineGraphEdge({
  from,
  to,
  status,
  index = 0,
}: PipelineGraphEdgeProps) {
  // Compute a smooth bezier path between source and target
  const pathD = useMemo(() => {
    const dx = to.x - from.x;
    // Horizontal offset for the control points (~40% of the distance)
    const cpOffset = Math.abs(dx) * 0.4;

    return `M ${from.x} ${from.y} C ${from.x + cpOffset} ${from.y}, ${to.x - cpOffset} ${to.y}, ${to.x} ${to.y}`;
  }, [from, to]);

  // Status-based styling
  const strokeColor =
    status === "completed"
      ? "#22c55e"
      : status === "active"
        ? "#3b82f6"
        : "#404040";

  const strokeWidth = status === "pending" ? 1.5 : 2;
  const strokeOpacity = status === "pending" ? 0.4 : 1;

  return (
    <g>
      {/* Base path (always visible) */}
      <path
        d={pathD}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeOpacity={strokeOpacity}
        strokeDasharray={status === "pending" ? "4 6" : "none"}
        strokeLinecap="round"
      />

      {/* Animated overlay for completed / active edges */}
      {status !== "pending" && (
        <path
          d={pathD}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={status === "completed" ? "4 8" : "6 6"}
          style={{
            animation: `pipelineEdgeFlow ${status === "completed" ? "1.2s" : "1.6s"} linear infinite`,
            animationDelay: `${index * 0.15}s`,
          }}
        />
      )}
    </g>
  );
}
