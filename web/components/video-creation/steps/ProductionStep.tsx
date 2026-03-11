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
  Film,
  Zap,
} from "lucide-react";
import { useTaskProgress } from "@/hooks/use-task-progress";
import { useGCPVM } from "@/hooks/use-gcp-vm";
import { useProjectSettings } from "@/hooks/use-project-settings";
import { hasAnyLocalModel } from "@/lib/constants/model-registry";
import { PipelineGraph } from "@/components/video-creation/PipelineGraph";
import { ActivityFeed } from "@/components/video-creation/ActivityFeed";

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

// Types and constants for pipeline phases removed — status derivation
// now lives in PipelineGraph.tsx and is event-driven.

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
    activityEvents,
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
    <div className="flex flex-col items-center gap-8 w-full max-w-4xl mx-auto py-8">
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
                ? currentStep?.replace(/phase\s+[ivxIVX\-]+\w*:\s*/gi, "") || "Starting production pipeline..."
                : "Start the AI pipeline to generate your video assets and assemble your edit."}
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

      {/* Pipeline Graph — live node graph showing pipeline topology */}
      {(isRunning || hasCompleted || activityEvents.length > 0 || progress > 0) && (
        <PipelineGraph
          activityEvents={activityEvents}
          currentStep={currentStep}
          taskStatus={taskStatus}
          progress={progress}
          isRunning={isRunning}
        />
      )}

      {/* Activity Feed — detailed log of agent communication */}
      {(isRunning || activityEvents.length > 0) && (
        <ActivityFeed events={activityEvents} isRunning={isRunning} />
      )}

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

      {/* Connection status is now shown inside the PipelineGraph component */}
    </div>
  );
}
