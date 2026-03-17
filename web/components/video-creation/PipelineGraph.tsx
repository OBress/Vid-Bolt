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
  scoring: ["asset_retrieval"],
  animating: ["production"],
  rendering: ["production"],
  assembling: ["assembly"],
  finalizing: ["assembly", "complete"],
};

// ============================================================================
// SVG VIEWBOX DIMENSIONS
// ============================================================================

const DESKTOP_SVG_WIDTH = 820;
const DESKTOP_SVG_HEIGHT = 240;
const MOBILE_SVG_WIDTH = 240;
const MOBILE_SVG_HEIGHT = 530;

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
 * Handles row-1 horizontals, fan-out from Scripting to Pair 1,
 * cross-wires between parallel pairs, and merge into Assembling.
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

  // ── Scripting → Designing (loopback: right → down → left → enter) ──
  if (fromId === "scripting" && toId === "designing") {
    const r = 595;               // right turn past Scripting
    const cy = f.y + 44;         // corridor below row 1
    const l = 15;                // far-left corridor
    const entryLeft = t.x - NODE_HALF_W;
    return `M ${exitX} ${exitY} L ${r} ${exitY} L ${r} ${cy} L ${l} ${cy} L ${l} ${entryY} L ${entryLeft} ${entryY}`;
  }

  // ── Scripting → Scoring (same loopback, enters Scoring from left) ──
  if (fromId === "scripting" && toId === "scoring") {
    const r = 595;
    const cy = f.y + 44;
    const l = 15;
    const entryLeft = t.x - NODE_HALF_W;
    return `M ${exitX} ${exitY} L ${r} ${exitY} L ${r} ${cy} L ${l} ${cy} L ${l} ${entryY} L ${entryLeft} ${entryY}`;
  }

  // ── Same row (horizontal): straight line right-exit → left-entry ──
  if (Math.abs(exitY - entryY) < 10) {
    return `M ${exitX} ${exitY} L ${entryX} ${entryY}`;
  }

  // ── Different row (cross-wires / merge): bezier from right-exit to left-entry ──
  const midX = (exitX + entryX) / 2;
  return `M ${exitX} ${exitY} C ${midX} ${exitY}, ${midX} ${entryY}, ${entryX} ${entryY}`;
}

// ============================================================================
// ORDERED NODES — for fallback derivation
// ============================================================================

const ORDERED_NODES = [
  "preparing", "narrating", "scripting",
  "designing", "scoring",
  "animating", "rendering",
  "assembling", "finalizing",
] as const;

function detectPhaseFromStep(step: string, progress?: number): number {
  const s = step.toLowerCase();

  // Text-based detection
  if (s.includes("phase v-b") || s.includes("pacing")) return 8; // finalizing
  if (s.includes("phase v")) return 7; // assembling
  if (s.includes("edl") || s.includes("compositing") || s.includes("assembly")) return 7; // assembling
  if (s.includes("phase iv")) return 5; // animating/rendering
  if (s.includes("phase iii")) return 3; // designing/scoring
  if (s.includes("phase ii")) return 2; // scripting
  if (s.includes("phase i")) return 1; // narrating
  if (s.includes("initializing") || s.includes("init")) return 0; // preparing

  // Progress-based fallback when text doesn't match
  if (progress !== undefined) {
    if (progress >= 92) return 8; // finalizing
    if (progress >= 75) return 7; // assembling
    if (progress >= 30) return 5; // animating/rendering
    if (progress >= 20) return 3; // designing/scoring
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

    // Sequential nodes
    for (const nodeId of ["preparing", "narrating", "scripting", "assembling"]) {
      if (hasComplete(nodeId)) statuses[nodeId] = "completed";
      else if (hasStart(nodeId)) statuses[nodeId] = "running";
      else statuses[nodeId] = "pending";
    }

    // Parallel pair 1: Designing + Scoring (both map to asset_retrieval)
    const assetStarted = phaseState.get("asset_retrieval")?.hasStart ?? false;
    const assetComplete = phaseState.get("asset_retrieval")?.hasComplete ?? false;
    // Check for music-related events to determine Scoring status
    const hasMusicEvent = events.some(
      (e) =>
        e.phase === "asset_retrieval" &&
        (e.message.toLowerCase().includes("music") ||
          e.message.toLowerCase().includes("scoring") ||
          e.message.toLowerCase().includes("audio"))
    );

    if (assetComplete) {
      statuses.designing = "completed";
      statuses.scoring = hasMusicEvent ? "completed" : "skipped";
    } else if (assetStarted) {
      statuses.designing = "running";
      statuses.scoring = "running";
    } else {
      statuses.designing = "pending";
      statuses.scoring = "pending";
    }

    // Parallel pair 2: Animating (MG) + Rendering (video/image)
    const prodStarted = phaseState.get("production")?.hasStart ?? false;
    const prodComplete = phaseState.get("production")?.hasComplete ?? false;
    const hasMg = events.some(
      (e) =>
        e.phase === "production" &&
        (e.message.toLowerCase().includes("motion graphic") ||
          e.message.toLowerCase().includes("composing") ||
          e.message.toLowerCase().includes("composition") ||
          e.message.toLowerCase().includes("mg"))
    );

    if (prodComplete) {
      statuses.animating = hasMg ? "completed" : "skipped";
      statuses.rendering = "completed";
    } else if (prodStarted) {
      statuses.animating = hasMg ? "running" : "pending";
      statuses.rendering = "running";
    } else {
      statuses.animating = "pending";
      statuses.rendering = "pending";
    }

    // Finalizing
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
      } else if (activeIdx === 3 && i === 4) {
        // Phase III runs Designing + Scoring in parallel
        statuses[nodeId] = "running";
      } else if (activeIdx === 5 && i === 6) {
        // Phase IV runs Animating + Rendering in parallel
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

  // foreignObject dimensions in viewBox units — large enough for any node chip
  const foWidth = 200;
  const foHeight = 60;

  return (
    <div className="w-full bg-neutral-900/60 border border-neutral-800 rounded-xl">
      <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider px-5 pt-4 pb-2">
        Pipeline
      </h3>

      <div className="w-full px-2 pb-2">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-auto block"
          style={{ overflow: "visible" }}
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

          {/* Edge paths */}
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

          {/* Node chips via foreignObject — same coordinate system as edges */}
          {GRAPH_NODES.map((node) => {
            const pos = positions[node.id];
            if (!pos) return null;

            const status = nodeStatuses[node.id] || "pending";
            const subLabel =
              status === "running"
                ? getNodeSubLabel(node.id, activityEvents, currentStep)
                : undefined;

            return (
              <foreignObject
                key={node.id}
                x={pos.x - foWidth / 2}
                y={pos.y - foHeight / 2}
                width={foWidth}
                height={foHeight}
                style={{ overflow: "visible" }}
              >
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <PipelineGraphNode
                    node={node}
                    status={status}
                    subLabel={subLabel}
                  />
                </div>
              </foreignObject>
            );
          })}
        </svg>
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
