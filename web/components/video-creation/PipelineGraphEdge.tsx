"use client";




// ============================================================================
// TYPES
// ============================================================================

export type EdgeStatus = "pending" | "active" | "completed";

interface PipelineGraphEdgeProps {
  /** Pre-computed SVG path data */
  pathData: string;
  /** Visual state of this edge */
  status: EdgeStatus;
  /** Unique key for CSS animation staggering */
  index?: number;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function PipelineGraphEdge({
  pathData,
  status,
  index = 0,
}: PipelineGraphEdgeProps) {
  const strokeColor =
    status === "completed"
      ? "#22c55e"
      : status === "active"
        ? "#3b82f6"
        : "#333333";

  const strokeWidth = status === "pending" ? 1.5 : 2;
  const strokeOpacity = status === "pending" ? 0.35 : 1;
  const dotColor = status === "completed" ? "#4ade80" : "#60a5fa";
  const dotSize = status === "completed" ? 3 : 4;

  return (
    <g>
      {/* Base path */}
      <path
        d={pathData}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeOpacity={strokeOpacity}
        strokeDasharray={status === "pending" ? "4 6" : "none"}
        strokeLinecap="round"
      />

      {/* Animated dash flow for active/completed */}
      {status !== "pending" && (
        <path
          d={pathData}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={status === "completed" ? "4 8" : "6 6"}
          style={{
            animationName: "pipelineEdgeFlow",
            animationDuration: status === "completed" ? "1.2s" : "1.6s",
            animationTimingFunction: "linear",
            animationIterationCount: "infinite",
            animationDelay: `${index * 0.15}s`,
          }}
        />
      )}

      {/* Traveling dot */}
      {status !== "pending" && (
        <>
          <circle r={dotSize} fill={dotColor} opacity={0.9}>
            <animateMotion
              dur={status === "completed" ? "2s" : "2.5s"}
              repeatCount="indefinite"
              path={pathData}
              begin={`${index * 0.3}s`}
            />
          </circle>
          <circle r={dotSize + 2} fill={dotColor} opacity={0.2}>
            <animateMotion
              dur={status === "completed" ? "2s" : "2.5s"}
              repeatCount="indefinite"
              path={pathData}
              begin={`${index * 0.3 + 0.15}s`}
            />
          </circle>
        </>
      )}
    </g>
  );
}
