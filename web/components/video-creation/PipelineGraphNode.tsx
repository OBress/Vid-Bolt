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
  CheckCircle2,
  AlertCircle,
  Loader2,
  SkipForward,
} from "lucide-react";
import type { ReactNode } from "react";

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
  { from: "preparing", to: "scripting" },
  { from: "scripting", to: "designing" },
  { from: "designing", to: "creating" },
  { from: "designing", to: "composing" },
  { from: "creating", to: "assembling" },
  { from: "composing", to: "assembling" },
  { from: "assembling", to: "finalizing" },
];

// ============================================================================
// LAYOUT — responsive positions
// ============================================================================

/** Desktop layout (≥640px): horizontal flow with parallel fork */
export const DESKTOP_POSITIONS: Record<string, { x: number; y: number }> = {
  preparing:  { x: 60,  y: 100 },
  scripting:  { x: 170, y: 100 },
  designing:  { x: 280, y: 100 },
  creating:   { x: 410, y: 50  },
  composing:  { x: 410, y: 150 },
  assembling: { x: 540, y: 100 },
  finalizing: { x: 650, y: 100 },
};

/** Mobile layout (<640px): vertical flow */
export const MOBILE_POSITIONS: Record<string, { x: number; y: number }> = {
  preparing:  { x: 100, y: 40  },
  scripting:  { x: 100, y: 100 },
  designing:  { x: 100, y: 160 },
  creating:   { x: 60,  y: 230 },
  composing:  { x: 175, y: 230 },
  assembling: { x: 100, y: 300 },
  finalizing: { x: 100, y: 360 },
};

// ============================================================================
// STATUS STYLING
// ============================================================================

function getStatusStyles(status: NodeStatus) {
  switch (status) {
    case "completed":
      return {
        bg: "bg-green-500/10",
        border: "border-green-500/30",
        text: "text-green-400",
        iconBg: "bg-green-500/20",
        glow: "shadow-green-500/15",
      };
    case "running":
      return {
        bg: "bg-blue-500/10",
        border: "border-blue-500/30",
        text: "text-blue-400",
        iconBg: "bg-blue-500/20",
        glow: "shadow-blue-500/20",
      };
    case "failed":
      return {
        bg: "bg-red-500/10",
        border: "border-red-500/30",
        text: "text-red-400",
        iconBg: "bg-red-500/20",
        glow: "shadow-red-500/15",
      };
    case "skipped":
      return {
        bg: "bg-neutral-800/40",
        border: "border-neutral-700/30",
        text: "text-neutral-600",
        iconBg: "bg-neutral-700/30",
        glow: "",
      };
    case "pending":
    default:
      return {
        bg: "bg-neutral-800/60",
        border: "border-neutral-700/40",
        text: "text-neutral-500",
        iconBg: "bg-neutral-700/40",
        glow: "",
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
  const styles = getStatusStyles(status);

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
      }}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{
        opacity: 1,
        scale: status === "running" ? [1, 1.04, 1] : 1,
      }}
      transition={
        status === "running"
          ? { scale: { repeat: Infinity, duration: 2, ease: "easeInOut" } }
          : { duration: 0.3 }
      }
    >
      <div
        className={`
          relative flex items-center gap-2 px-3 py-2 rounded-xl border
          transition-colors duration-500
          ${styles.bg} ${styles.border}
          ${status === "running" ? `shadow-lg ${styles.glow}` : ""}
        `}
      >
        {/* Glow ring for running state */}
        {status === "running" && (
          <div className="absolute -inset-1 rounded-xl bg-blue-500/10 blur-md animate-pulse pointer-events-none" />
        )}

        {/* Icon */}
        <div
          className={`
            relative w-6 h-6 rounded-lg flex items-center justify-center
            ${styles.iconBg} ${styles.text}
          `}
        >
          {displayIcon}
        </div>

        {/* Label */}
        <div className="relative flex flex-col min-w-0">
          <span
            className={`text-xs font-semibold leading-tight whitespace-nowrap ${styles.text}`}
          >
            {node.label}
          </span>
          {/* Sub-label for running nodes */}
          {status === "running" && subLabel && (
            <motion.span
              className="text-[10px] text-neutral-500 leading-tight truncate max-w-[110px]"
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
