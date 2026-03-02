"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Play,
  Square,
  Loader2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Volume2,
  Clapperboard,
  Search,
  Film,
  Layers,
  Zap,
} from "lucide-react";
import { useTaskProgress } from "@/hooks/use-task-progress";
import { useGCPVM } from "@/hooks/use-gcp-vm";
import { useProjectSettings } from "@/hooks/use-project-settings";
import { hasAnyLocalModel } from "@/lib/constants/model-registry";

// ============================================================================
// TYPES
// ============================================================================

interface ProductionStepProps {
  videoId: string;
  projectId: string;
  isLoading: boolean;
  taskId: string | null;
  onTaskStarted: (taskId: string) => void;
  onComplete: () => void;
  onError?: (error: string) => void;
  onBack: () => void;
  isLocked?: boolean;
  lockedMessage?: string;
}

/** Orchestrator pipeline phases */
interface PipelinePhase {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  progressRange: [number, number]; // [startPercent, endPercent]
}

type PhaseStatus = "pending" | "running" | "completed" | "failed" | "skipped";

// ============================================================================
// CONSTANTS
// ============================================================================

const PIPELINE_PHASES: PipelinePhase[] = [
  {
    id: "tts",
    label: "TTS Generation",
    description: "Generating narration audio with word-level timestamps",
    icon: <Volume2 className="w-4 h-4" />,
    progressRange: [0, 15],
  },
  {
    id: "shot_planning",
    label: "Shot Planning",
    description: "Planning shots aligned to narration timing",
    icon: <Clapperboard className="w-4 h-4" />,
    progressRange: [15, 30],
  },
  {
    id: "asset_retrieval",
    label: "Asset Retrieval",
    description: "Finding stock media and crafting AI image prompts",
    icon: <Search className="w-4 h-4" />,
    progressRange: [30, 45],
  },
  {
    id: "production",
    label: "Production",
    description: "Generating AI images, videos, and motion graphics",
    icon: <Film className="w-4 h-4" />,
    progressRange: [45, 85],
  },
  {
    id: "assembly",
    label: "Assembly",
    description: "Building edit decisions and timeline",
    icon: <Layers className="w-4 h-4" />,
    progressRange: [85, 100],
  },
];

/**
 * Derive phase status from the task's progress_percent.
 * Uses progress ranges only — no fragile text matching.
 * The orchestrator is the sole writer of progress, so ranges are reliable.
 */
function derivePhaseStatuses(
  progress: number,
  currentStep: string | null,
  taskStatus: string | null
): Record<string, PhaseStatus> {
  const statuses: Record<string, PhaseStatus> = {};

  // No active task — everything is pending
  if (!taskStatus || (taskStatus !== "running" && taskStatus !== "pending" && taskStatus !== "failed" && taskStatus !== "completed")) {
    for (const phase of PIPELINE_PHASES) {
      statuses[phase.id] = "pending";
    }
    return statuses;
  }

  const isFailed = taskStatus === "failed";

  // Special handling: if failed with progress=0, parse currentStep for the failed phase name
  // The orchestrator writes "Failed in phase: <phaseName>" (e.g. "production", "tts", "shot_planning")
  if (isFailed && progress === 0 && currentStep) {
    const phaseMatch = currentStep.match(/failed in phase:\s*(\w+)/i);
    const failedPhaseName = phaseMatch?.[1]?.toLowerCase();

    // Map orchestrator phase names to UI phase IDs
    const phaseNameToId: Record<string, string> = {
      tts: "tts_generation",
      shot_planning: "shot_planning",
      asset_retrieval: "asset_retrieval",
      production: "production",
      assembly: "assembly",
    };

    const failedPhaseId = failedPhaseName ? phaseNameToId[failedPhaseName] : null;

    if (failedPhaseId) {
      const failedIdx = PIPELINE_PHASES.findIndex(p => p.id === failedPhaseId);
      for (let i = 0; i < PIPELINE_PHASES.length; i++) {
        if (i < failedIdx) {
          statuses[PIPELINE_PHASES[i].id] = "completed";
        } else if (i === failedIdx) {
          statuses[PIPELINE_PHASES[i].id] = "failed";
        } else {
          statuses[PIPELINE_PHASES[i].id] = "pending";
        }
      }
      return statuses;
    }
  }

  // Find the currently active phase (last phase whose start <= progress)
  let activePhaseIdx = -1;
  for (let i = 0; i < PIPELINE_PHASES.length; i++) {
    const [start] = PIPELINE_PHASES[i].progressRange;
    if (progress >= start) {
      activePhaseIdx = i;
    }
  }

  for (let i = 0; i < PIPELINE_PHASES.length; i++) {
    const [, end] = PIPELINE_PHASES[i].progressRange;

    if (progress >= end) {
      // Progress is past this phase's end → completed
      statuses[PIPELINE_PHASES[i].id] = "completed";
    } else if (i === activePhaseIdx) {
      // This is the active phase
      statuses[PIPELINE_PHASES[i].id] = isFailed ? "failed" : "running";
    } else {
      statuses[PIPELINE_PHASES[i].id] = "pending";
    }
  }

  return statuses;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ProductionStep({
  videoId,
  projectId,
  isLoading: isLoadingProp,
  taskId: taskIdProp,
  onTaskStarted,
  onComplete,
  onError,
  onBack,
}: ProductionStepProps) {
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(taskIdProp);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasCompleted, setHasCompleted] = useState(false);
  const completedRef = useRef(false);

  // GPU VM status
  const { displayStatus: vmStatus, startVM, isLoading: isVmLoading } = useGCPVM();

  // Project settings — check if any local models need the GPU
  const { settings } = useProjectSettings(projectId);
  const needsLocalGpu = hasAnyLocalModel(
    settings.visuals.imageModel,
    settings.visuals.imageEditModel,
    settings.visuals.videoModel,
  );

  // Sync external taskId
  useEffect(() => {
    if (taskIdProp && !taskId) {
      setTaskId(taskIdProp);
    }
  }, [taskIdProp, taskId]);

  // =========================================================================
  // Task Progress Polling
  // =========================================================================

  const handleComplete = useCallback(
    () => {
      if (completedRef.current) return;
      completedRef.current = true;
      setHasCompleted(true);

      // Give the user a moment to see the completed state
      setTimeout(() => {
        onComplete();
      }, 1500);
    },
    [onComplete]
  );

  const handleError = useCallback(
    (error: string) => {
      setErrorMessage(error);
      setIsStarting(false);
      onError?.(error);
    },
    [onError]
  );

  const {
    progress,
    currentStep,
    status: taskStatus,
    isPolling,
    error: pollError,
  } = useTaskProgress(taskId, {
    pollInterval: 3000,
    onComplete: handleComplete,
    onError: handleError,
    autoStart: !!taskId,
  });

  // Surface poll errors
  useEffect(() => {
    if (pollError && !errorMessage) {
      setErrorMessage(pollError);
    }
  }, [pollError, errorMessage]);

  const isRunning = isLoadingProp || (!!taskId && isPolling && (taskStatus === "running" || taskStatus === "pending"));
  const phaseStatuses = derivePhaseStatuses(progress, currentStep, taskStatus);

  // =========================================================================
  // Actions
  // =========================================================================

  const handleStart = useCallback(async () => {
    setIsStarting(true);
    setErrorMessage(null);
    completedRef.current = false;
    setHasCompleted(false);

    try {
      // Auto-start GPU if it's off and we have local models that need it
      if (needsLocalGpu && vmStatus === "OFF") {
        console.log("[ProductionStep] GPU is off, auto-starting...");
        try {
          await startVM();
        } catch (vmErr) {
          console.warn("[ProductionStep] GPU auto-start failed, continuing anyway:", vmErr);
        }
      }

      const res = await fetch("/api/process/closed-loop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Request failed: ${res.status}`);
      }

      if (data.taskId) {
        setTaskId(data.taskId);
        onTaskStarted(data.taskId);
        console.log("[ProductionStep] Production started, task:", data.taskId);
      } else {
        throw new Error("No task ID returned from API");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start production";
      setErrorMessage(msg);
      onError?.(msg);
    } finally {
      setIsStarting(false);
    }
  }, [videoId, onTaskStarted, onError, vmStatus, startVM, needsLocalGpu]);

  const handleStop = useCallback(async () => {
    if (!taskId) return;
    setIsStopping(true);

    try {
      // Cancel the task via API
      await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });

      setTaskId(null);
      setErrorMessage("Production stopped by user.");
    } catch (err) {
      console.error("[ProductionStep] Failed to stop:", err);
    } finally {
      setIsStopping(false);
    }
  }, [taskId]);

  const handleRetry = useCallback(() => {
    setErrorMessage(null);
    setTaskId(null);
    handleStart();
  }, [handleStart]);

  // =========================================================================
  // Render
  // =========================================================================

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-2xl mx-auto py-8">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="relative inline-block">
          <div
            className={`absolute -inset-6 rounded-full blur-3xl ${
              hasCompleted
                ? "bg-green-500/15"
                : errorMessage
                  ? "bg-red-500/15"
                  : isRunning
                    ? "bg-blue-500/15 animate-pulse"
                    : "bg-neutral-500/10"
            }`}
          />
          <div
            className={`relative w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg ${
              hasCompleted
                ? "bg-gradient-to-br from-green-500 to-emerald-600 shadow-green-500/20"
                : errorMessage
                  ? "bg-gradient-to-br from-red-500 to-red-600 shadow-red-500/20"
                  : isRunning
                    ? "bg-gradient-to-br from-blue-500 to-indigo-600 shadow-blue-500/20"
                    : "bg-gradient-to-br from-neutral-600 to-neutral-700 shadow-neutral-500/10"
            }`}
          >
            {hasCompleted ? (
              <CheckCircle2 className="w-8 h-8 text-white" />
            ) : errorMessage ? (
              <AlertCircle className="w-8 h-8 text-white" />
            ) : isRunning ? (
              <Loader2 className="w-8 h-8 text-white animate-spin" />
            ) : (
              <Film className="w-8 h-8 text-white" />
            )}
          </div>
        </div>

        <h2 className="text-2xl font-bold tracking-tight">
          {hasCompleted
            ? "Production Complete"
            : errorMessage
              ? "Production Error"
              : isRunning
                ? "Producing Your Video"
                : "Video Production"}
        </h2>
        <p className="text-sm text-neutral-500 max-w-md">
          {hasCompleted
            ? "All assets generated successfully. Moving to the editor."
            : errorMessage
              ? errorMessage
              : isRunning
                ? currentStep || "Starting production pipeline..."
                : "Start the AI pipeline to generate TTS, imagery, video clips, and assemble your edit."}
        </p>
      </div>

      {/* Progress Bar */}
      {(isRunning || hasCompleted || progress > 0) && (
        <div className="w-full">
          <div className="h-2.5 bg-neutral-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out ${
                hasCompleted
                  ? "bg-gradient-to-r from-green-500 to-emerald-400"
                  : errorMessage
                    ? "bg-gradient-to-r from-red-500 to-red-400"
                    : "bg-gradient-to-r from-blue-500 to-indigo-400"
              }`}
              style={{ width: `${hasCompleted ? 100 : progress}%` }}
            />
          </div>
          <div className="flex justify-between mt-1.5 text-[10px] font-mono text-neutral-500">
            <span>
              {hasCompleted
                ? "Complete"
                : taskStatus === "running"
                  ? "Processing..."
                  : taskStatus || "Initializing..."}
            </span>
            <span>{Math.round(hasCompleted ? 100 : progress)}%</span>
          </div>
        </div>
      )}

      {/* GPU Warning Banner — only shown when local models need the GPU */}
      {needsLocalGpu && !isRunning && !hasCompleted && (vmStatus === "OFF" || vmStatus === "SETUP") && (
        <div className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-500/20 bg-amber-500/5">
          <Zap className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-amber-300 font-medium">
              {vmStatus === "SETUP" ? "GPU VM not configured" : "GPU VM is off"}
            </p>
            <p className="text-xs text-neutral-500 mt-0.5">
              {vmStatus === "SETUP"
                ? "Configure your Google Cloud instance in Settings → API Keys before starting."
                : "The GPU will be auto-started when you click Start Production."}
            </p>
          </div>
        </div>
      )}

      {/* Pipeline Phase Checklist */}
      <div className="w-full bg-neutral-900/60 border border-neutral-800 rounded-xl p-5">
        <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-4">
          Pipeline Phases
        </h3>
        <div className="space-y-1">
          {PIPELINE_PHASES.map((phase, index) => {
            const status = phaseStatuses[phase.id] || "pending";

            return (
              <div key={phase.id}>
                <div
                  className={`flex items-center gap-3 py-2.5 px-3 rounded-lg transition-all duration-300 ${
                    status === "running"
                      ? "bg-blue-500/5 border border-blue-500/20"
                      : status === "completed"
                        ? "bg-green-500/5"
                        : status === "failed"
                          ? "bg-red-500/5 border border-red-500/20"
                          : ""
                  }`}
                >
                  {/* Phase Icon / Status Indicator */}
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                      status === "completed"
                        ? "bg-green-500/20 text-green-400"
                        : status === "running"
                          ? "bg-blue-500/20 text-blue-400"
                          : status === "failed"
                            ? "bg-red-500/20 text-red-400"
                            : "bg-neutral-800 text-neutral-500"
                    }`}
                  >
                    {status === "completed" ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : status === "running" ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : status === "failed" ? (
                      <AlertCircle className="w-4 h-4" />
                    ) : (
                      phase.icon
                    )}
                  </div>

                  {/* Phase Info */}
                  <div className="flex-1 min-w-0">
                    <div
                      className={`text-sm font-medium transition-colors duration-300 ${
                        status === "completed"
                          ? "text-green-400"
                          : status === "running"
                            ? "text-blue-300"
                            : status === "failed"
                              ? "text-red-400"
                              : "text-neutral-500"
                      }`}
                    >
                      Phase {index + 1}: {phase.label}
                    </div>
                    {(status === "running" || status === "failed") && (
                      <p className="text-xs text-neutral-500 mt-0.5 truncate">
                        {status === "failed"
                          ? "Failed — check logs for details"
                          : phase.description}
                      </p>
                    )}
                  </div>

                  {/* Status Badge */}
                  <div
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-full flex-shrink-0 ${
                      status === "completed"
                        ? "bg-green-500/10 text-green-400"
                        : status === "running"
                          ? "bg-blue-500/10 text-blue-400"
                          : status === "failed"
                            ? "bg-red-500/10 text-red-400"
                            : "text-neutral-600"
                    }`}
                  >
                    {status === "completed"
                      ? "Done"
                      : status === "running"
                        ? "Running"
                        : status === "failed"
                          ? "Failed"
                          : "Pending"}
                  </div>
                </div>

                {/* Connector line between phases */}
                {index < PIPELINE_PHASES.length - 1 && (
                  <div className="flex items-center ml-[22px] h-1">
                    <div
                      className={`w-[1px] h-full ${
                        status === "completed"
                          ? "bg-green-500/30"
                          : "bg-neutral-800"
                      }`}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3 w-full">
        <Button
          variant="outline"
          onClick={onBack}
          disabled={isRunning}
          className="px-6"
        >
          Back
        </Button>

        <div className="flex-1" />

        {errorMessage && !isRunning && (
          <Button
            onClick={handleRetry}
            disabled={isStarting}
            variant="outline"
            className="gap-2 border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
          >
            <RefreshCw className={`w-4 h-4 ${isStarting ? "animate-spin" : ""}`} />
            Retry
          </Button>
        )}

        {isRunning ? (
          <Button
            onClick={handleStop}
            disabled={isStopping}
            variant="outline"
            className="gap-2 border-red-500/30 text-red-400 hover:bg-red-500/10"
          >
            <Square className="w-4 h-4" />
            {isStopping ? "Stopping..." : "Stop"}
          </Button>
        ) : hasCompleted ? (
          <Button
            onClick={onComplete}
            className="gap-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white border-0"
          >
            <CheckCircle2 className="w-4 h-4" />
            Continue to Editor
          </Button>
        ) : (
          <Button
            onClick={handleStart}
            disabled={isStarting}
            className="gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white border-0"
          >
            {isStarting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            {isStarting ? "Starting..." : "Start Production"}
          </Button>
        )}
      </div>

      {/* Connection Status */}
      {isRunning && (
        <p className="text-xs text-neutral-600 font-mono">
          {isPolling
            ? "Connected to orchestrator..."
            : "Waiting for task..."}
        </p>
      )}
    </div>
  );
}
