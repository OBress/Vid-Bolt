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
  /** Activity events from the orchestrator */
  activityEvents: ActivityEvent[];
  /** Raw current_step text from the task */
  currentStep: string | null;
  /** Task status (pending, running, completed, failed, cancelled) */
  taskStatus: string | null;
  /** Overall progress percentage */
  progress: number;
  /** Whether the pipeline is actively running */
  isRunning: boolean;
}

// ============================================================================
// NODE ↔ ORCHESTRATOR PHASE MAPPING
// (Internal only — never exposed to UI)
// ============================================================================

/**
 * Maps each abstracted UI node to the orchestrator phases it represents.
 * This is the bridge between user-friendly labels and the real pipeline.
 */
const NODE_PHASE_MAP: Record<string, string[]> = {
  preparing: ["init"],
  scripting: ["tts", "shot_planning"],
  designing: ["asset_retrieval"],
  creating: ["production"], // GPU pipeline: images + videos + clip trim
  composing: ["production"], // CPU pipeline: motion graphics (parallel)
  assembling: ["assembly"],
  finalizing: ["assembly", "complete"], // pacing review + done
};

// ============================================================================
// STATUS DERIVATION
// ============================================================================

/**
 * Derive the status of each graph node from the activity_events stream.
 *
 * Rules:
 *   1. Simple nodes (preparing, scripting, designing, assembling):
 *      - Has ANY phase_complete event for mapped phases → COMPLETED
 *      - Has ANY phase_start event for mapped phases (no complete) → RUNNING
 *      - Otherwise → PENDING
 *
 *   2. "creating" vs "composing" (both map to 'production'):
 *      - "creating" = GPU work (images, videos, clip trim)
 *      - "composing" = CPU work (motion graphics, parallel)
 *      - Disambiguated via currentStep text and event messages
 *
 *   3. "finalizing":
 *      - Becomes RUNNING when assembly completes and pacing review starts
 *      - Becomes COMPLETED when 'complete' phase_complete event exists
 *
 *   4. On failure, the node that was RUNNING becomes FAILED
 */
function deriveNodeStatuses(
  events: ActivityEvent[],
  currentStep: string | null,
  taskStatus: string | null
): Record<string, NodeStatus> {
  const statuses: Record<string, NodeStatus> = {};
  const stepLower = (currentStep || "").toLowerCase();

  // Build a quick lookup: phase → { hasStart, hasComplete }
  const phaseState = new Map<string, { hasStart: boolean; hasComplete: boolean }>();
  for (const event of events) {
    const state = phaseState.get(event.phase) || { hasStart: false, hasComplete: false };
    if (event.type === "phase_start") state.hasStart = true;
    if (event.type === "phase_complete") state.hasComplete = true;
    phaseState.set(event.phase, state);
  }

  // Helper: does any mapped phase have a start/complete?
  function hasStartForNode(nodeId: string): boolean {
    const phases = NODE_PHASE_MAP[nodeId] || [];
    return phases.some((p) => phaseState.get(p)?.hasStart);
  }

  function hasCompleteForNode(nodeId: string): boolean {
    const phases = NODE_PHASE_MAP[nodeId] || [];
    return phases.some((p) => phaseState.get(p)?.hasComplete);
  }

  // 1. Derive status for simple sequential nodes
  for (const nodeId of ["preparing", "scripting", "designing", "assembling"]) {
    if (hasCompleteForNode(nodeId)) {
      statuses[nodeId] = "completed";
    } else if (hasStartForNode(nodeId)) {
      statuses[nodeId] = "running";
    } else {
      statuses[nodeId] = "pending";
    }
  }

  // 2. Special handling: "scripting" maps to tts + shot_planning
  //    It should only be COMPLETED if shot_planning is complete
  const ttsComplete = phaseState.get("tts")?.hasComplete ?? false;
  const shotComplete = phaseState.get("shot_planning")?.hasComplete ?? false;
  const ttsStarted = phaseState.get("tts")?.hasStart ?? false;
  if (shotComplete) {
    statuses.scripting = "completed";
  } else if (ttsComplete || ttsStarted) {
    statuses.scripting = "running";
  }

  // 3. "creating" (GPU) vs "composing" (Motion GFX)
  const productionStarted = phaseState.get("production")?.hasStart ?? false;
  const productionComplete = phaseState.get("production")?.hasComplete ?? false;

  // Check for MG-related events
  const hasMgEvents = events.some(
    (e) =>
      e.phase === "production" &&
      (e.message.toLowerCase().includes("motion graphic") ||
        e.message.toLowerCase().includes("composing") ||
        e.message.toLowerCase().includes("composition"))
  );

  // Check for clip trim (part of "creating")
  const hasClipTrimEvents =
    stepLower.includes("iv-b") ||
    events.some(
      (e) =>
        e.phase === "production" &&
        (e.message.toLowerCase().includes("trim") ||
          e.message.toLowerCase().includes("clip"))
    );

  if (productionComplete) {
    statuses.creating = "completed";
    statuses.composing = hasMgEvents ? "completed" : "skipped";
  } else if (productionStarted) {
    // Both can be running in parallel
    statuses.creating = "running";
    statuses.composing = hasMgEvents ? "running" : "pending";

    // If we detect "videos done" or clip trimming, creating is still running
    if (
      stepLower.includes("images done") ||
      stepLower.includes("generating videos") ||
      hasClipTrimEvents
    ) {
      statuses.creating = "running";
    }
  } else {
    statuses.creating = "pending";
    statuses.composing = "pending";
  }

  // 4. "finalizing" = pacing review + complete
  const assemblyComplete = phaseState.get("assembly")?.hasComplete ?? false;
  const completePhase = phaseState.get("complete")?.hasComplete ?? false;

  if (completePhase) {
    statuses.finalizing = "completed";
  } else if (
    assemblyComplete ||
    stepLower.includes("v-b") ||
    stepLower.includes("pacing")
  ) {
    statuses.finalizing = "running";
  } else {
    statuses.finalizing = "pending";
  }

  // 5. Handle task failure — mark the running node(s) as failed
  if (taskStatus === "failed") {
    for (const nodeId of Object.keys(statuses)) {
      if (statuses[nodeId] === "running") {
        statuses[nodeId] = "failed";
      }
    }
  }

  // 6. Handle full completion
  if (taskStatus === "completed") {
    for (const nodeId of Object.keys(statuses)) {
      if (statuses[nodeId] !== "skipped") {
        statuses[nodeId] = "completed";
      }
    }
  }

  return statuses;
}

/**
 * Get a user-friendly sub-label for the currently running node.
 * Extracts the latest relevant event message.
 */
function getNodeSubLabel(
  nodeId: string,
  events: ActivityEvent[],
  currentStep: string | null
): string | undefined {
  // Find events related to this node's mapped phases
  const phases = NODE_PHASE_MAP[nodeId] || [];
  const relevantEvents = events.filter((e) => phases.includes(e.phase));
  const latest = relevantEvents[relevantEvents.length - 1];

  if (latest?.message) {
    // Strip phase prefixes like "Phase I: " or "Phase IV: " for cleaner display
    return latest.message.replace(/phase\s+[ivxIVX\-]+\w*:\s*/gi, "");
  }

  // Fallback: parse currentStep text
  if (currentStep) {
    return currentStep.replace(/phase\s+[ivxIVX\-]+\w*:\s*/gi, "");
  }

  return undefined;
}

/**
 * Derive edge status from connected node statuses.
 */
function deriveEdgeStatus(
  fromStatus: NodeStatus,
  toStatus: NodeStatus
): EdgeStatus {
  if (fromStatus === "completed" && toStatus === "completed") return "completed";
  if (
    fromStatus === "completed" &&
    (toStatus === "running" || toStatus === "failed")
  )
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
  isRunning,
}: PipelineGraphProps) {
  const isMobile = useIsMobile();
  const positions = isMobile ? MOBILE_POSITIONS : DESKTOP_POSITIONS;

  // Derive statuses from events (no progress ranges!)
  const nodeStatuses = useMemo(
    () => deriveNodeStatuses(activityEvents, currentStep, taskStatus),
    [activityEvents, currentStep, taskStatus]
  );

  // SVG viewport
  const svgWidth = isMobile ? 240 : 720;
  const svgHeight = isMobile ? 400 : 200;

  return (
    <div className="w-full bg-neutral-900/60 border border-neutral-800 rounded-xl p-5 overflow-hidden">
      <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-4">
        Pipeline
      </h3>

      <div className="relative" style={{ height: svgHeight }}>
        {/* SVG layer for edges */}
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="absolute inset-0 w-full h-full"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* CSS animation for edge flow */}
          <defs>
            <style>{`
              @keyframes pipelineEdgeFlow {
                from { stroke-dashoffset: 20; }
                to   { stroke-dashoffset: 0; }
              }
            `}</style>
          </defs>

          {GRAPH_EDGES.map((edge, i) => {
            const fromPos = positions[edge.from];
            const toPos = positions[edge.to];
            if (!fromPos || !toPos) return null;

            const fromStatus = nodeStatuses[edge.from] || "pending";
            const toStatus = nodeStatuses[edge.to] || "pending";
            const edgeStatus = deriveEdgeStatus(fromStatus, toStatus);

            return (
              <PipelineGraphEdge
                key={`${edge.from}-${edge.to}`}
                from={fromPos}
                to={toPos}
                status={edgeStatus}
                index={i}
              />
            );
          })}
        </svg>

        {/* HTML layer for nodes (positioned absolutely over SVG) */}
        <div
          className="absolute inset-0"
          style={{
            /* Scale the node positions to match the SVG viewBox → actual container */
          }}
        >
          {/* 
            We need to map SVG viewBox coordinates to the actual container size.
            Use a wrapper that scales from viewBox space to container space.
          */}
          <div
            className="relative w-full h-full"
            style={{
              /* Nodes are positioned with left/top percentages */
            }}
          >
            {GRAPH_NODES.map((node) => {
              const pos = positions[node.id];
              if (!pos) return null;

              const status = nodeStatuses[node.id] || "pending";
              const subLabel =
                status === "running"
                  ? getNodeSubLabel(node.id, activityEvents, currentStep)
                  : undefined;

              // Convert SVG viewbox coords to percentages
              const xPercent = (pos.x / svgWidth) * 100;
              const yPercent = (pos.y / svgHeight) * 100;

              return (
                <PipelineGraphNode
                  key={node.id}
                  node={node}
                  status={status}
                  subLabel={subLabel}
                  position={{
                    x: xPercent,
                    y: yPercent,
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Connection status indicator */}
      {isRunning && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-neutral-800">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-[10px] text-neutral-600 font-mono">
            Connected to pipeline
          </span>
        </div>
      )}
    </div>
  );
}
