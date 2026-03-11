"use client";

import { motion } from "framer-motion";
import {
  Sparkles,
  PenTool,
  Palette,
  Wand2,
  Layers,
  Puzzle,
  Star,
  Mic,
  CheckCircle2,
  AlertCircle,
  Loader2,
  SkipForward,
} from "lucide-react";
import type { ReactNode, CSSProperties } from "react";

// ============================================================================
// TYPES
// ============================================================================

export type NodeStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export interface GraphNodeDef {
  id: string;
  label: string;
  icon: ReactNode;
}

interface PipelineGraphNodeProps {
  node: GraphNodeDef;
  status: NodeStatus;
  /** Live activity sub-label shown when running */
  subLabel?: string;
  /** Position within the graph as percentages (0–100) */
  position: { x: number; y: number };
}

// ============================================================================
// NODE DEFINITIONS (abstracted, consumer-friendly labels)
// ============================================================================

export const GRAPH_NODES: GraphNodeDef[] = [
  { id: "preparing", label: "Preparing", icon: <Sparkles className="w-3.5 h-3.5" /> },
  { id: "narrating", label: "Narrating", icon: <Mic className="w-3.5 h-3.5" /> },
  { id: "scripting", label: "Scripting", icon: <PenTool className="w-3.5 h-3.5" /> },
  { id: "designing", label: "Designing", icon: <Palette className="w-3.5 h-3.5" /> },
  { id: "creating", label: "Creating", icon: <Wand2 className="w-3.5 h-3.5" /> },
  { id: "composing", label: "Composing", icon: <Layers className="w-3.5 h-3.5" /> },
  { id: "assembling", label: "Assembling", icon: <Puzzle className="w-3.5 h-3.5" /> },
  { id: "finalizing", label: "Finalizing", icon: <Star className="w-3.5 h-3.5" /> },
];

// ============================================================================
// EDGE DEFINITIONS (source → target)
// ============================================================================

export const GRAPH_EDGES: Array<{ from: string; to: string }> = [
  { from: "preparing", to: "narrating" },
  { from: "narrating", to: "scripting" },
  { from: "scripting", to: "designing" },
  { from: "designing", to: "creating" },
  { from: "designing", to: "composing" },
  { from: "creating", to: "assembling" },
  { from: "composing", to: "assembling" },
  { from: "assembling", to: "finalizing" },
];

// ============================================================================
// LAYOUT — SVG viewbox positions (820 × 240)
// ============================================================================

/** Desktop layout (≥640px): 2-row conveyor belt */
export const DESKTOP_POSITIONS: Record<string, { x: number; y: number }> = {
  // Row 1 (y=58): 4 nodes evenly spaced, centered at x=410
  preparing:  { x: 110, y: 58  },
  narrating:  { x: 310, y: 58  },
  scripting:  { x: 510, y: 58  },
  designing:  { x: 710, y: 58  },
  // Row 2: Creating+Composing stacked left, Assembling center, Finalizing right
  creating:   { x: 110, y: 148 },
  composing:  { x: 110, y: 198 },
  assembling: { x: 410, y: 173 },
  finalizing: { x: 710, y: 173 },
};

/** Mobile layout (<640px): vertical flow */
export const MOBILE_POSITIONS: Record<string, { x: number; y: number }> = {
  preparing:  { x: 120, y: 40  },
  narrating:  { x: 120, y: 105 },
  scripting:  { x: 120, y: 170 },
  designing:  { x: 120, y: 235 },
  creating:   { x: 65,  y: 310 },
  composing:  { x: 175, y: 310 },
  assembling: { x: 120, y: 385 },
  finalizing: { x: 120, y: 450 },
};

// ============================================================================
// STATUS STYLING — inline styles for real visibility
// ============================================================================

function getNodeStyles(status: NodeStatus): {
  containerStyle: CSSProperties;
  textClass: string;
  iconBgClass: string;
  iconTextClass: string;
} {
  switch (status) {
    case "completed":
      return {
        containerStyle: {
          background: "rgba(34, 197, 94, 0.12)",
          borderColor: "rgba(34, 197, 94, 0.5)",
          boxShadow: "0 0 16px rgba(34, 197, 94, 0.25), 0 0 4px rgba(34, 197, 94, 0.15)",
        },
        textClass: "text-green-400",
        iconBgClass: "bg-green-500/20",
        iconTextClass: "text-green-400",
      };
    case "running":
      return {
        containerStyle: {
          background: "rgba(59, 130, 246, 0.15)",
          borderColor: "rgba(96, 165, 250, 0.7)",
          boxShadow: "0 0 24px rgba(59, 130, 246, 0.45), 0 0 48px rgba(59, 130, 246, 0.15)",
        },
        textClass: "text-blue-300",
        iconBgClass: "bg-blue-500/25",
        iconTextClass: "text-blue-300",
      };
    case "failed":
      return {
        containerStyle: {
          background: "rgba(239, 68, 68, 0.12)",
          borderColor: "rgba(239, 68, 68, 0.5)",
          boxShadow: "0 0 16px rgba(239, 68, 68, 0.3), 0 0 4px rgba(239, 68, 68, 0.15)",
        },
        textClass: "text-red-400",
        iconBgClass: "bg-red-500/20",
        iconTextClass: "text-red-400",
      };
    case "skipped":
      return {
        containerStyle: {
          background: "rgba(64, 64, 64, 0.3)",
          borderColor: "rgba(64, 64, 64, 0.4)",
          boxShadow: "none",
        },
        textClass: "text-neutral-600",
        iconBgClass: "bg-neutral-700/30",
        iconTextClass: "text-neutral-600",
      };
    case "pending":
    default:
      return {
        containerStyle: {
          background: "rgba(38, 38, 38, 0.6)",
          borderColor: "rgba(64, 64, 64, 0.5)",
          boxShadow: "none",
        },
        textClass: "text-neutral-500",
        iconBgClass: "bg-neutral-700/40",
        iconTextClass: "text-neutral-500",
      };
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

export function PipelineGraphNode({
  node,
  status,
  subLabel,
  position,
}: PipelineGraphNodeProps) {
  const styles = getNodeStyles(status);

  // Status-specific icon override
  const displayIcon =
    status === "completed" ? (
      <CheckCircle2 className="w-3.5 h-3.5" />
    ) : status === "running" ? (
      <Loader2 className="w-3.5 h-3.5 animate-spin" />
    ) : status === "failed" ? (
      <AlertCircle className="w-3.5 h-3.5" />
    ) : status === "skipped" ? (
      <SkipForward className="w-3.5 h-3.5" />
    ) : (
      node.icon
    );

  return (
    <motion.div
      className="absolute"
      style={{
        left: `${position.x}%`,
        top: `${position.y}%`,
        transform: "translate(-50%, -50%)",
        zIndex: status === "running" ? 10 : 1,
      }}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{
        opacity: 1,
        scale: status === "running" ? [1, 1.06, 1] : 1,
      }}
      transition={
        status === "running"
          ? { scale: { repeat: Infinity, duration: 2, ease: "easeInOut" } }
          : { duration: 0.3 }
      }
    >
      <div
        className="relative flex items-center gap-2 px-3 py-2 rounded-xl border transition-all duration-500"
        style={styles.containerStyle}
      >
        {/* Outer glow ring for running state */}
        {status === "running" && (
          <div
            className="absolute -inset-2 rounded-2xl animate-pulse pointer-events-none"
            style={{
              background: "radial-gradient(ellipse at center, rgba(59,130,246,0.15) 0%, transparent 70%)",
            }}
          />
        )}

        {/* Icon */}
        <div
          className={`relative w-6 h-6 rounded-lg flex items-center justify-center ${styles.iconBgClass} ${styles.iconTextClass}`}
        >
          {displayIcon}
        </div>

        {/* Label */}
        <div className="relative flex flex-col min-w-0">
          <span
            className={`text-xs font-semibold leading-tight whitespace-nowrap ${styles.textClass}`}
          >
            {node.label}
          </span>
          {/* Sub-label for running nodes */}
          {status === "running" && subLabel && (
            <motion.span
              className="text-[10px] text-blue-300/60 leading-tight truncate max-w-[110px]"
              initial={{ opacity: 0, y: -2 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              {subLabel}
            </motion.span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
