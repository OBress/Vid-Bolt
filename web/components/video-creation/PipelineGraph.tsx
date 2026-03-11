"use client";

import { useMemo, useState, useEffect } from "react";
import type { ActivityEvent } from "@/types/task";
import { PipelineGraphEdge, type EdgeStatus } from "./PipelineGraphEdge";
import {
  PipelineGraphNode,
  type NodeStatus,
  GRAPH_NODES,
  GRAPH_EDGES,
  DESKTOP_POSITIONS,
  MOBILE_POSITIONS,
} from "./PipelineGraphNode";

// ============================================================================
// TYPES
// ============================================================================

interface PipelineGraphProps {
  activityEvents: ActivityEvent[];
  currentStep: string | null;
  taskStatus: string | null;
  progress?: number;
  isRunning: boolean;
}

// ============================================================================
// NODE ↔ ORCHESTRATOR PHASE MAPPING
// ============================================================================

const NODE_PHASE_MAP: Record<string, string[]> = {
  preparing: ["init"],
  narrating: ["tts"],
  scripting: ["shot_planning"],
  designing: ["asset_retrieval"],
  creating: ["production"],
  composing: ["production"],
  assembling: ["assembly"],
  finalizing: ["assembly", "complete"],
};

// ============================================================================
// SVG VIEWBOX DIMENSIONS
// ============================================================================

const DESKTOP_SVG_WIDTH = 820;
const DESKTOP_SVG_HEIGHT = 240;
const MOBILE_SVG_WIDTH = 240;
const MOBILE_SVG_HEIGHT = 520;

// ============================================================================
// EDGE PATH GENERATION
// ============================================================================

/**
 * Approximate half-width of a node chip in viewbox units.
 * Lines exit from right edge (center.x + HALF_W) and enter at
 * left edge (center.x - HALF_W).
 */
const NODE_HALF_W = 58;

/**
 * Generate SVG path for an edge.
 * - Row 1 horizontal: straight line from right-exit to left-entry
 * - Designing→Creating/Composing: loopback (right→down→left→down)
 * - Creating/Composing→Assembling: bezier to merge
 * - Assembling→Finalizing: straight horizontal
 */
function generateEdgePath(
  fromId: string,
  toId: string,
  positions: Record<string, { x: number; y: number }>
): string {
  const f = positions[fromId];
  const t = positions[toId];
  if (!f || !t) return "";

  const exitX = f.x + NODE_HALF_W;
  const exitY = f.y;
  const entryX = t.x - NODE_HALF_W;
  const entryY = t.y;

  // ── Designing → Creating (loopback wire) ──
  if (fromId === "designing" && toId === "creating") {
    const r = 795;                 // right turn x
    const cy = f.y + 44;          // corridor y (below row 1 nodes)
    const l = t.x - NODE_HALF_W;  // left entry x
    return `M ${exitX} ${exitY} L ${r} ${exitY} L ${r} ${cy} L ${l} ${cy} L ${l} ${entryY}`;
  }

  // ── Designing → Composing (same loopback, extends further down) ──
  if (fromId === "designing" && toId === "composing") {
    const r = 795;
    const cy = f.y + 44;
    const l = t.x - NODE_HALF_W;
    return `M ${exitX} ${exitY} L ${r} ${exitY} L ${r} ${cy} L ${l} ${cy} L ${l} ${entryY}`;
  }

  // ── Same row (horizontal): straight line right-exit → left-entry ──
  if (Math.abs(exitY - entryY) < 10) {
    return `M ${exitX} ${exitY} L ${entryX} ${entryY}`;
  }

  // ── Different row (merge curves): bezier from right-exit to left-entry ──
  const midX = (exitX + entryX) / 2;
  return `M ${exitX} ${exitY} C ${midX} ${exitY}, ${midX} ${entryY}, ${entryX} ${entryY}`;
}

// ============================================================================
// ORDERED NODES — for fallback derivation
// ============================================================================

const ORDERED_NODES = [
  "preparing", "narrating", "scripting", "designing",
  "creating", "composing", "assembling", "finalizing",
] as const;

function detectPhaseFromStep(step: string, progress?: number): number {
  const s = step.toLowerCase();

  // Text-based detection
  if (s.includes("phase v-b") || s.includes("pacing")) return 7; // finalizing
  if (s.includes("phase v")) return 6; // assembling
  if (s.includes("edl") || s.includes("compositing") || s.includes("assembly")) return 6; // assembling
  if (s.includes("phase iv")) return 4; // creating
  if (s.includes("phase iii")) return 3; // designing
  if (s.includes("phase ii")) return 2; // scripting
  if (s.includes("phase i")) return 1; // narrating
  if (s.includes("initializing") || s.includes("init")) return 0; // preparing

  // Progress-based fallback when text doesn't match
  if (progress !== undefined) {
    if (progress >= 92) return 7; // finalizing
    if (progress >= 75) return 6; // assembling
    if (progress >= 30) return 4; // creating/composing
    if (progress >= 20) return 3; // designing
    if (progress >= 12) return 2; // scripting
    if (progress >= 5) return 1;  // narrating
    return 0; // preparing
  }

  return -1;
}

// ============================================================================
// STATUS DERIVATION
// ============================================================================

function deriveNodeStatuses(
  events: ActivityEvent[],
  currentStep: string | null,
  taskStatus: string | null,
  progress: number
): Record<string, NodeStatus> {
  const statuses: Record<string, NodeStatus> = {};
  const stepLower = (currentStep || "").toLowerCase();

  if (events.length > 0) {
    const phaseState = new Map<string, { hasStart: boolean; hasComplete: boolean }>();
    for (const event of events) {
      const state = phaseState.get(event.phase) || { hasStart: false, hasComplete: false };
      if (event.type === "phase_start") state.hasStart = true;
      if (event.type === "phase_complete") state.hasComplete = true;
      phaseState.set(event.phase, state);
    }

    const hasStart = (nodeId: string) =>
      (NODE_PHASE_MAP[nodeId] || []).some((p) => phaseState.get(p)?.hasStart);
    const hasComplete = (nodeId: string) =>
      (NODE_PHASE_MAP[nodeId] || []).some((p) => phaseState.get(p)?.hasComplete);

    for (const nodeId of ["preparing", "narrating", "scripting", "designing", "assembling"]) {
      if (hasComplete(nodeId)) statuses[nodeId] = "completed";
      else if (hasStart(nodeId)) statuses[nodeId] = "running";
      else statuses[nodeId] = "pending";
    }

    const prodStarted = phaseState.get("production")?.hasStart ?? false;
    const prodComplete = phaseState.get("production")?.hasComplete ?? false;
    const hasMg = events.some(
      (e) =>
        e.phase === "production" &&
        (e.message.toLowerCase().includes("motion graphic") ||
          e.message.toLowerCase().includes("composing") ||
          e.message.toLowerCase().includes("composition"))
    );

    if (prodComplete) {
      statuses.creating = "completed";
      statuses.composing = hasMg ? "completed" : "skipped";
    } else if (prodStarted) {
      statuses.creating = "running";
      statuses.composing = hasMg ? "running" : "pending";
    } else {
      statuses.creating = "pending";
      statuses.composing = "pending";
    }

    const asmComplete = phaseState.get("assembly")?.hasComplete ?? false;
    const doneComplete = phaseState.get("complete")?.hasComplete ?? false;
    if (doneComplete) statuses.finalizing = "completed";
    else if (asmComplete || stepLower.includes("v-b") || stepLower.includes("pacing"))
      statuses.finalizing = "running";
    else statuses.finalizing = "pending";

  } else if (currentStep && taskStatus === "running") {
    const activeIdx = detectPhaseFromStep(currentStep, progress);
    for (let i = 0; i < ORDERED_NODES.length; i++) {
      const nodeId = ORDERED_NODES[i];
      if (activeIdx < 0) {
        statuses[nodeId] = "pending";
      } else if (i < activeIdx) {
        statuses[nodeId] = "completed";
      } else if (i === activeIdx) {
        statuses[nodeId] = "running";
      } else if (activeIdx === 4 && i === 5) {
        // Phase IV runs Creating + Composing in parallel — always light both
        statuses[nodeId] = "running";
      } else {
        statuses[nodeId] = "pending";
      }
    }
  } else {
    for (const nodeId of ORDERED_NODES) {
      statuses[nodeId] = "pending";
    }
  }

  if (taskStatus === "failed") {
    for (const nodeId of Object.keys(statuses)) {
      if (statuses[nodeId] === "running") statuses[nodeId] = "failed";
    }
  }
  if (taskStatus === "completed") {
    for (const nodeId of Object.keys(statuses)) {
      if (statuses[nodeId] !== "skipped") statuses[nodeId] = "completed";
    }
  }

  return statuses;
}

function getNodeSubLabel(
  nodeId: string,
  events: ActivityEvent[],
  currentStep: string | null
): string | undefined {
  const phases = NODE_PHASE_MAP[nodeId] || [];
  const relevantEvents = events.filter((e) => phases.includes(e.phase));
  const latest = relevantEvents[relevantEvents.length - 1];
  if (latest?.message) return latest.message.replace(/phase\s+[ivxIVX\-]+\w*:\s*/gi, "");
  if (currentStep) return currentStep.replace(/phase\s+[ivxIVX\-]+\w*:\s*/gi, "");
  return undefined;
}

function deriveEdgeStatus(fromStatus: NodeStatus, toStatus: NodeStatus): EdgeStatus {
  if (fromStatus === "completed" && toStatus === "completed") return "completed";
  if (fromStatus === "completed" && (toStatus === "running" || toStatus === "failed"))
    return "active";
  if (fromStatus === "running" || fromStatus === "failed") return "active";
  return "pending";
}

// ============================================================================
// RESPONSIVE HOOK
// ============================================================================

function useIsMobile(breakpoint = 640): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < breakpoint);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [breakpoint]);
  return isMobile;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function PipelineGraph({
  activityEvents,
  currentStep,
  taskStatus,
  progress = 0,
  isRunning,
}: PipelineGraphProps) {
  const isMobile = useIsMobile();
  const positions = isMobile ? MOBILE_POSITIONS : DESKTOP_POSITIONS;
  const svgWidth = isMobile ? MOBILE_SVG_WIDTH : DESKTOP_SVG_WIDTH;
  const svgHeight = isMobile ? MOBILE_SVG_HEIGHT : DESKTOP_SVG_HEIGHT;

  const nodeStatuses = useMemo(
    () => deriveNodeStatuses(activityEvents, currentStep, taskStatus, progress),
    [activityEvents, currentStep, taskStatus, progress]
  );

  const edgePaths = useMemo(
    () =>
      GRAPH_EDGES.map((edge) => ({
        ...edge,
        pathData: generateEdgePath(edge.from, edge.to, positions),
      })),
    [positions]
  );

  return (
    <div className="w-full bg-neutral-900/60 border border-neutral-800 rounded-xl overflow-hidden">
      <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider px-5 pt-4 pb-2">
        Pipeline
      </h3>

      <div
        className="relative w-full"
        style={{ aspectRatio: `${svgWidth} / ${svgHeight}` }}
      >
        {/* SVG edge layer — BEHIND nodes (z-index: 1) */}
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="absolute inset-0 w-full h-full"
          style={{ zIndex: 1 }}
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <style>{`
              @keyframes pipelineEdgeFlow {
                from { stroke-dashoffset: 20; }
                to   { stroke-dashoffset: 0; }
              }
            `}</style>
          </defs>

          {edgePaths.map((edge, i) => {
            if (!edge.pathData) return null;
            const fromStatus = nodeStatuses[edge.from] || "pending";
            const toStatus = nodeStatuses[edge.to] || "pending";
            const edgeStatus = deriveEdgeStatus(fromStatus, toStatus);

            return (
              <PipelineGraphEdge
                key={`${edge.from}-${edge.to}`}
                pathData={edge.pathData}
                status={edgeStatus}
                index={i}
              />
            );
          })}
        </svg>

        {/* HTML node layer — ON TOP of edges (z-index: 2) */}
        <div className="absolute inset-0" style={{ zIndex: 2 }}>
          <div className="relative w-full h-full">
            {GRAPH_NODES.map((node) => {
              const pos = positions[node.id];
              if (!pos) return null;

              const status = nodeStatuses[node.id] || "pending";
              const subLabel =
                status === "running"
                  ? getNodeSubLabel(node.id, activityEvents, currentStep)
                  : undefined;

              const xPercent = (pos.x / svgWidth) * 100;
              const yPercent = (pos.y / svgHeight) * 100;

              return (
                <PipelineGraphNode
                  key={node.id}
                  node={node}
                  status={status}
                  subLabel={subLabel}
                  position={{ x: xPercent, y: yPercent }}
                />
              );
            })}
          </div>
        </div>
      </div>

      {isRunning && (
        <div className="flex items-center gap-2 mx-5 mb-3 mt-1 pt-2 border-t border-neutral-800">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-[10px] text-neutral-600 font-mono">
            Connected to pipeline
          </span>
        </div>
      )}
    </div>
  );
}
