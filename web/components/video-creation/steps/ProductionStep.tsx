"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Play,
  Square,
  Loader2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Film,
  Zap,
  Power,
} from "lucide-react";
import { useTaskProgress } from "@/hooks/use-task-progress";
import { useGCPVM } from "@/hooks/use-gcp-vm";
import { useProjectSettings } from "@/hooks/use-project-settings";
import { hasAnyLocalModel } from "@/lib/constants/model-registry";
import { PipelineGraph } from "@/components/video-creation/PipelineGraph";
import { ActivityFeed } from "@/components/video-creation/ActivityFeed";
import { VideoPreferencesPanel } from "@/components/features/project/settings/VideoPreferencesPanel";
import type { VideoCreativeOverrides } from "@/lib/types/closed-loop";
import type { EditDecisionList } from "@/lib/services/edit-assembly/edit-assembly-prompts";
import type { Task } from "@/types/task";
import type {
  AudioChunk,
  GeneratedMedia,
  ProductionTaskSummary,
  ShotEvent,
  VideoProject,
  VideoStage,
} from "@/types/video";

// ============================================================================
// TYPES
// ============================================================================

interface ProductionStepProps {
  videoId: string;
  projectId: string;
  isLoading: boolean;
  taskId: string | null;
  onTaskStarted: (taskId: string) => void;
  onComplete: (payload: ProductionCompletionPayload) => void;
  onError?: (error: string) => void;
  onBack: () => void;
  videoCreativeOverrides?: VideoCreativeOverrides;
  onVideoCreativeOverridesChange: (overrides: VideoCreativeOverrides) => void;
  reviewMode: ProductionReviewMode;
  onReviewModeChange: (reviewMode: ProductionReviewMode) => void;
  isLocked?: boolean;
  lockedMessage?: string;
}

export type ProductionReviewMode = "off" | "sequence_preview";

export interface ProductionCompletionPayload {
  video: VideoProject;
  latestProductionTask: ProductionTaskSummary | null;
  edl: EditDecisionList | null;
  agentEdl: any | null;
  audioChunks: AudioChunk[];
  shotList: ShotEvent[];
  generatedMedia: GeneratedMedia[];
}

function extractPipelineOutputs(metadata: Record<string, any>): {
  audioChunks: AudioChunk[];
  shotList: ShotEvent[];
  generatedMedia: GeneratedMedia[];
} {
  const shotPlan = metadata?.shot_plan || {};
  const avScript = metadata?.av_script_part1 || {};
  const shots: ShotEvent[] = ((shotPlan.shots || avScript.shots || [])) as ShotEvent[];
  const genImages = (metadata?.generated_images || {}) as Record<string, string>;
  const genVideos = (metadata?.generated_videos || {}) as Record<string, string>;
  const genMG = (metadata?.generated_motion_graphics || {}) as Record<string, string>;
  const audioChunks = (metadata?.audio_chunks || []) as AudioChunk[];

  const generatedMedia: GeneratedMedia[] = shots.map((shot: any) => {
    const idx = shot.segment_index as number;
    const key = `shot-${idx}`;
    const imageUrl = genImages[key];
    const videoUrl = genVideos[key];
    const mgCode = genMG[key];
    const url = videoUrl || imageUrl || (mgCode ? `remotion://shot-${idx}` : undefined);
    return {
      shot_index: idx,
      media_type: (shot.media_type || "image") as "image" | "video" | "motiongraphic",
      generation_status: (url || mgCode) ? "completed" : "failed",
      media_url: url,
      visual_prompt: shot.visual_prompt || shot.summary || "",
      remotion_code: mgCode,
    } as GeneratedMedia;
  });

  return { audioChunks, shotList: shots, generatedMedia };
}

function isEditorReadyStage(stage: VideoStage): stage is "video" | "export" | "completed" {
  return stage === "video" || stage === "export" || stage === "completed";
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
  videoCreativeOverrides,
  onVideoCreativeOverridesChange,
  reviewMode,
  onReviewModeChange,
}: ProductionStepProps) {
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(taskIdProp);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasCompleted, setHasCompleted] = useState(false);
  const [shutdownWhenDone, setShutdownWhenDone] = useState(false);
  const [completionPayload, setCompletionPayload] = useState<ProductionCompletionPayload | null>(null);
  const completedRef = useRef(false);
  const completionDispatchedRef = useRef(false);
  const completionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // GPU VM status
  const { displayStatus: vmStatus, startVM, isLoading: _isVmLoading } = useGCPVM();

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

  const dispatchCompletion = useCallback(
    (payload: ProductionCompletionPayload, delayMs: number) => {
      if (completionTimeoutRef.current) {
        clearTimeout(completionTimeoutRef.current);
      }

      completionTimeoutRef.current = setTimeout(() => {
        if (completionDispatchedRef.current) return;
        completionDispatchedRef.current = true;
        onComplete(payload);
      }, delayMs);
    },
    [onComplete]
  );

  const failCompletionConfirmation = useCallback(
    (message: string, latestTaskId?: string | null) => {
      completedRef.current = false;
      completionDispatchedRef.current = false;
      if (completionTimeoutRef.current) {
        clearTimeout(completionTimeoutRef.current);
        completionTimeoutRef.current = null;
      }
      setCompletionPayload(null);
      setHasCompleted(false);
      setErrorMessage(message);
      if (latestTaskId) {
        setTaskId(latestTaskId);
      }
      onError?.(message);
    },
    [onError]
  );

  const confirmProductionCompletion = useCallback(
    async (expectedTaskId: string | null): Promise<{
      payload: ProductionCompletionPayload | null;
      error?: string;
      latestTaskId?: string | null;
    }> => {
      try {
        const res = await fetch(`/api/videos/${videoId}`);
        const data = await res.json();

        if (!res.ok) {
          return {
            payload: null,
            error: data.error || "Failed to confirm production completion.",
          };
        }

        const video = data.video as VideoProject;
        const latestProductionTask = (data.latestProductionTask || null) as ProductionTaskSummary | null;
        const metadata = (video.metadata || {}) as Record<string, any>;
        const edl = (metadata.edl || null) as EditDecisionList | null;
        const agentEdl = metadata.agentEdl || null;
        const pipelineOutputs = extractPipelineOutputs(metadata);
        const audioChunks = Array.isArray(data.audioChunks) && data.audioChunks.length > 0
          ? (data.audioChunks as AudioChunk[])
          : pipelineOutputs.audioChunks;
        const hasAssemblyOutput = Boolean(edl || agentEdl);
        const latestTaskMatches = !expectedTaskId || latestProductionTask?.id === expectedTaskId;

        if (
          !latestProductionTask
          || latestProductionTask.status !== "completed"
          || !latestTaskMatches
          || !isEditorReadyStage(video.current_stage)
          || !hasAssemblyOutput
        ) {
          return {
            payload: null,
            latestTaskId: latestProductionTask?.id || expectedTaskId,
            error:
              latestProductionTask?.error_message
              || "Production did not finish cleanly. Staying on Production.",
          };
        }

        return {
          payload: {
            video,
            latestProductionTask,
            edl,
            agentEdl,
            audioChunks,
            shotList: pipelineOutputs.shotList,
            generatedMedia: pipelineOutputs.generatedMedia,
          },
          latestTaskId: latestProductionTask.id,
        };
      } catch (error) {
        return {
          payload: null,
          error: error instanceof Error ? error.message : "Failed to confirm production completion.",
        };
      }
    },
    [videoId]
  );

  const handleComplete = useCallback(
    async (task: Task) => {
      if (completedRef.current) return;
      completedRef.current = true;

      const confirmation = await confirmProductionCompletion(task.id);
      if (!confirmation.payload) {
        failCompletionConfirmation(
          confirmation.error || "Production did not finish cleanly. Staying on Production.",
          confirmation.latestTaskId
        );
        return;
      }

      setErrorMessage(null);
      setCompletionPayload(confirmation.payload);
      setHasCompleted(true);
      if (confirmation.latestTaskId) {
        setTaskId(confirmation.latestTaskId);
      }
      dispatchCompletion(confirmation.payload, 1500);
    },
    [confirmProductionCompletion, dispatchCompletion, failCompletionConfirmation]
  );

  const handleContinueToEditor = useCallback(async () => {
    if (completionPayload) {
      if (completionTimeoutRef.current) {
        clearTimeout(completionTimeoutRef.current);
        completionTimeoutRef.current = null;
      }
      if (!completionDispatchedRef.current) {
        completionDispatchedRef.current = true;
        onComplete(completionPayload);
      }
      return;
    }

    const confirmation = await confirmProductionCompletion(taskId);
    if (!confirmation.payload) {
      failCompletionConfirmation(
        confirmation.error || "Production did not finish cleanly. Staying on Production.",
        confirmation.latestTaskId
      );
      return;
    }

    setErrorMessage(null);
    setCompletionPayload(confirmation.payload);
    setHasCompleted(true);
    if (completionTimeoutRef.current) {
      clearTimeout(completionTimeoutRef.current);
      completionTimeoutRef.current = null;
    }
    completionDispatchedRef.current = true;
    onComplete(confirmation.payload);
  }, [completionPayload, confirmProductionCompletion, failCompletionConfirmation, onComplete, taskId]);

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
    completionDispatchedRef.current = false;
    setHasCompleted(false);
    setCompletionPayload(null);
    if (completionTimeoutRef.current) {
      clearTimeout(completionTimeoutRef.current);
      completionTimeoutRef.current = null;
    }

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
        body: JSON.stringify({
          videoId,
          videoCreativeOverrides,
          productionControls: { reviewMode },
          shutdownWhenDone: needsLocalGpu ? shutdownWhenDone : false,
        }),
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
  }, [
    videoId,
    onTaskStarted,
    onError,
    vmStatus,
    startVM,
    needsLocalGpu,
    shutdownWhenDone,
    reviewMode,
    videoCreativeOverrides,
  ]);

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

  const handleRetry = useCallback(async () => {
    // Cancel any existing task before retrying to prevent duplicate pipelines
    if (taskId) {
      try {
        await fetch(`/api/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "cancelled" }),
        });
      } catch (err) {
        console.warn("[ProductionStep] Failed to cancel previous task before retry:", err);
      }
    }
    setErrorMessage(null);
    setTaskId(null);
    setCompletionPayload(null);
    setHasCompleted(false);
    completedRef.current = false;
    completionDispatchedRef.current = false;
    if (completionTimeoutRef.current) {
      clearTimeout(completionTimeoutRef.current);
      completionTimeoutRef.current = null;
    }
    handleStart();
  }, [handleStart, taskId]);

  useEffect(() => {
    return () => {
      if (completionTimeoutRef.current) {
        clearTimeout(completionTimeoutRef.current);
      }
    };
  }, []);

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

      {/* Creative direction controls */}
      {!isRunning && !hasCompleted && (
        <div className="w-full space-y-4">
          <VideoPreferencesPanel
            overrides={videoCreativeOverrides}
            onChange={onVideoCreativeOverridesChange}
            availableLoras={settings.visuals.creativeDirection?.loras || []}
            channelDefaultLora={settings.visuals.creativeDirection?.defaultLoraName}
          />

          <div className="w-full rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-3 backdrop-blur-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-neutral-200">Review mode</p>
                <p className="text-xs text-neutral-500 mt-1">
                  Keep production automatic, or pause after planning for a quick sequence preview.
                </p>
              </div>
              <div className="w-52">
                <Select
                  value={reviewMode}
                  onValueChange={(val) => onReviewModeChange(val as ProductionReviewMode)}
                >
                  <SelectTrigger className="bg-black/40 border-neutral-800 h-10">
                    <SelectValue placeholder="Automatic" />
                  </SelectTrigger>
                  <SelectContent className="bg-neutral-900 border-neutral-800">
                    <SelectItem value="off">Automatic</SelectItem>
                    <SelectItem value="sequence_preview">Sequence preview</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col gap-3 w-full">
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
              onClick={() => {
                void handleContinueToEditor();
              }}
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

        {/* GPU Auto-Shutdown Checkbox — only visible when local GPU is in use */}
        {needsLocalGpu && !isRunning && !hasCompleted && (
          <div className="flex items-center justify-end">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <label className="flex items-center gap-2 cursor-pointer select-none group">
                    <Checkbox
                      id="shutdown-when-done"
                      checked={shutdownWhenDone}
                      onCheckedChange={(checked) => setShutdownWhenDone(checked === true)}
                      className="border-neutral-600 data-[state=checked]:bg-orange-500 data-[state=checked]:border-orange-500"
                    />
                    <Power className={`w-3.5 h-3.5 transition-colors ${shutdownWhenDone ? "text-orange-400" : "text-neutral-500 group-hover:text-neutral-400"}`} />
                    <span className={`text-xs transition-colors ${shutdownWhenDone ? "text-orange-400" : "text-neutral-500 group-hover:text-neutral-400"}`}>
                      Shut down GPU when done
                    </span>
                  </label>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  className="max-w-xs bg-neutral-900 border-neutral-700"
                >
                  <p className="text-xs text-neutral-300">
                    The GPU VM will automatically stop after this video&apos;s
                    production is complete, but only if no other videos are
                    still being produced.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
      </div>

      {/* Connection status is now shown inside the PipelineGraph component */}
    </div>
  );
}
