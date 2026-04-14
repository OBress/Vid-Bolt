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

  const { displayStatus: vmStatus, startVM } = useGCPVM();
  const { settings } = useProjectSettings(projectId);
  const needsLocalGpu = hasAnyLocalModel(
    settings.visuals.imageModel,
    settings.visuals.imageEditModel,
    settings.visuals.videoModel,
  );

  useEffect(() => {
    if (taskIdProp && !taskId) setTaskId(taskIdProp);
  }, [taskIdProp, taskId]);

  // =========================================================================
  // Completion helpers
  // =========================================================================

  const dispatchCompletion = useCallback(
    (payload: ProductionCompletionPayload, delayMs: number) => {
      if (completionTimeoutRef.current) clearTimeout(completionTimeoutRef.current);
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
      if (completionTimeoutRef.current) { clearTimeout(completionTimeoutRef.current); completionTimeoutRef.current = null; }
      setCompletionPayload(null);
      setHasCompleted(false);
      setErrorMessage(message);
      if (latestTaskId) setTaskId(latestTaskId);
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
        if (!res.ok) return { payload: null, error: data.error || "Failed to confirm." };
        const video = data.video as VideoProject;
        const latestProductionTask = (data.latestProductionTask || null) as ProductionTaskSummary | null;
        const metadata = (video.metadata || {}) as Record<string, any>;
        const edl = (metadata.edl || null) as EditDecisionList | null;
        const agentEdl = metadata.agentEdl || null;
        const pipelineOutputs = extractPipelineOutputs(metadata);
        const audioChunks = Array.isArray(data.audioChunks) && data.audioChunks.length > 0 ? (data.audioChunks as AudioChunk[]) : pipelineOutputs.audioChunks;
        const hasAssemblyOutput = Boolean(edl || agentEdl);
        const latestTaskMatches = !expectedTaskId || latestProductionTask?.id === expectedTaskId;
        if (!latestProductionTask || latestProductionTask.status !== "completed" || !latestTaskMatches || !isEditorReadyStage(video.current_stage) || !hasAssemblyOutput) {
          return { payload: null, latestTaskId: latestProductionTask?.id || expectedTaskId, error: latestProductionTask?.error_message || "Production did not finish cleanly." };
        }
        return {
          payload: { video, latestProductionTask, edl, agentEdl, audioChunks, shotList: pipelineOutputs.shotList, generatedMedia: pipelineOutputs.generatedMedia },
          latestTaskId: latestProductionTask.id,
        };
      } catch (error) {
        return { payload: null, error: error instanceof Error ? error.message : "Failed to confirm." };
      }
    },
    [videoId]
  );

  const handleComplete = useCallback(async (task: Task) => {
    if (completedRef.current) return;
    completedRef.current = true;
    const confirmation = await confirmProductionCompletion(task.id);
    if (!confirmation.payload) { failCompletionConfirmation(confirmation.error || "Production did not finish cleanly.", confirmation.latestTaskId); return; }
    setErrorMessage(null); setCompletionPayload(confirmation.payload); setHasCompleted(true);
    if (confirmation.latestTaskId) setTaskId(confirmation.latestTaskId);
    dispatchCompletion(confirmation.payload, 1500);
  }, [confirmProductionCompletion, dispatchCompletion, failCompletionConfirmation]);

  const handleContinueToEditor = useCallback(async () => {
    if (completionPayload) {
      if (completionTimeoutRef.current) { clearTimeout(completionTimeoutRef.current); completionTimeoutRef.current = null; }
      if (!completionDispatchedRef.current) { completionDispatchedRef.current = true; onComplete(completionPayload); }
      return;
    }
    const confirmation = await confirmProductionCompletion(taskId);
    if (!confirmation.payload) { failCompletionConfirmation(confirmation.error || "Production did not finish cleanly.", confirmation.latestTaskId); return; }
    setErrorMessage(null); setCompletionPayload(confirmation.payload); setHasCompleted(true);
    if (completionTimeoutRef.current) { clearTimeout(completionTimeoutRef.current); completionTimeoutRef.current = null; }
    completionDispatchedRef.current = true;
    onComplete(confirmation.payload);
  }, [completionPayload, confirmProductionCompletion, failCompletionConfirmation, onComplete, taskId]);

  const handleError = useCallback((error: string) => { setErrorMessage(error); setIsStarting(false); onError?.(error); }, [onError]);

  const { progress, currentStep, status: taskStatus, isPolling, error: pollError, activityEvents } = useTaskProgress(taskId, {
    pollInterval: 3000, onComplete: handleComplete, onError: handleError, autoStart: !!taskId,
  });

  useEffect(() => { if (pollError && !errorMessage) setErrorMessage(pollError); }, [pollError, errorMessage]);

  const isRunning = isLoadingProp || (!!taskId && isPolling && (taskStatus === "running" || taskStatus === "pending"));

  // =========================================================================
  // Actions
  // =========================================================================

  const handleStart = useCallback(async () => {
    setIsStarting(true); setErrorMessage(null); completedRef.current = false; completionDispatchedRef.current = false;
    setHasCompleted(false); setCompletionPayload(null);
    if (completionTimeoutRef.current) { clearTimeout(completionTimeoutRef.current); completionTimeoutRef.current = null; }
    try {
      if (needsLocalGpu && vmStatus === "OFF") { try { await startVM(); } catch (vmErr) { console.warn("[ProductionStep] GPU auto-start failed:", vmErr); } }
      const res = await fetch("/api/process/closed-loop", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, videoCreativeOverrides, productionControls: { reviewMode }, shutdownWhenDone: needsLocalGpu ? shutdownWhenDone : false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
      if (data.taskId) { setTaskId(data.taskId); onTaskStarted(data.taskId); }
      else throw new Error("No task ID returned from API");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start production";
      setErrorMessage(msg); onError?.(msg);
    } finally { setIsStarting(false); }
  }, [videoId, onTaskStarted, onError, vmStatus, startVM, needsLocalGpu, shutdownWhenDone, reviewMode, videoCreativeOverrides]);

  const handleStop = useCallback(async () => {
    if (!taskId) return; setIsStopping(true);
    try { await fetch(`/api/tasks/${taskId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "cancelled" }) }); setTaskId(null); setErrorMessage("Production stopped by user."); }
    catch (err) { console.error("[ProductionStep] Failed to stop:", err); }
    finally { setIsStopping(false); }
  }, [taskId]);

  const handleRetry = useCallback(async () => {
    if (taskId) { try { await fetch(`/api/tasks/${taskId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "cancelled" }) }); } catch {} }
    setErrorMessage(null); setTaskId(null); setCompletionPayload(null); setHasCompleted(false);
    completedRef.current = false; completionDispatchedRef.current = false;
    if (completionTimeoutRef.current) { clearTimeout(completionTimeoutRef.current); completionTimeoutRef.current = null; }
    handleStart();
  }, [handleStart, taskId]);

  useEffect(() => { return () => { if (completionTimeoutRef.current) clearTimeout(completionTimeoutRef.current); }; }, []);

  // =========================================================================
  // RENDER — Running / Completed view (full-width pipeline progress)
  // =========================================================================

  if (isRunning || hasCompleted || (progress > 0 && !errorMessage)) {
    return (
      <div className="flex h-full w-full min-h-0">
        <div
          className="flex-1 overflow-y-auto flex flex-col gap-5 px-8 py-8"
          style={{ scrollbarWidth: "thin", scrollbarColor: "rgb(38 38 38) transparent" }}
        >
          {/* Status header */}
          <div className="flex flex-col items-center text-center gap-2">
            <div className="relative">
              <div className={`absolute -inset-4 rounded-full blur-2xl ${hasCompleted ? "bg-green-500/15" : "bg-blue-500/10 animate-pulse"}`} />
              <div className={`relative w-12 h-12 rounded-2xl flex items-center justify-center ${hasCompleted ? "bg-gradient-to-br from-green-500 to-emerald-600" : "bg-gradient-to-br from-blue-500 to-indigo-600"}`}>
                {hasCompleted ? <CheckCircle2 className="w-6 h-6 text-white" /> : <Loader2 className="w-6 h-6 text-white animate-spin" />}
              </div>
            </div>
            <h2 className="text-base font-bold">{hasCompleted ? "Production Complete" : "Producing Your Video"}</h2>
            <p className="text-xs text-neutral-500 max-w-xs">
              {hasCompleted ? "All assets generated. Ready to edit." : currentStep?.replace(/phase\s+[ivxIVX\-]+\w*:\s*/gi, "") || "Starting production pipeline..."}
            </p>
          </div>

          {/* Progress bar */}
          <div>
            <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out ${hasCompleted ? "bg-gradient-to-r from-green-500 to-emerald-400" : currentStep?.toLowerCase().includes("fixing") ? "bg-gradient-to-r from-amber-500 to-orange-400" : "bg-gradient-to-r from-blue-500 to-indigo-400"}`}
                style={{ width: `${hasCompleted ? 100 : progress}%` }}
              />
            </div>
            <div className="flex justify-between mt-1 text-[10px] font-mono text-neutral-600">
              <span>{hasCompleted ? "Complete" : taskStatus === "running" ? "Processing..." : taskStatus || "Initializing..."}</span>
              <span>{Math.round(hasCompleted ? 100 : progress)}%</span>
            </div>
          </div>

          {/* Batch retry banner */}
          {isRunning && currentStep?.toLowerCase().includes("fixing") && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-500/30 bg-amber-500/5">
              <RefreshCw className="w-4 h-4 text-amber-400 flex-shrink-0 animate-spin" />
              <div>
                <p className="text-sm text-amber-300 font-medium">Regenerating failed shots</p>
                <p className="text-xs text-neutral-500">{currentStep.replace(/phase\s+[ivxIVX\-]+\w*:\s*/gi, "")}</p>
              </div>
            </div>
          )}

          {/* Pipeline Graph */}
          <PipelineGraph activityEvents={activityEvents} currentStep={currentStep} taskStatus={taskStatus} progress={progress} isRunning={isRunning} />

          {/* Activity Feed */}
          {(isRunning || activityEvents.length > 0) && (
            <ActivityFeed events={activityEvents} isRunning={isRunning} />
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-neutral-800">
            <Button variant="outline" onClick={onBack} disabled={isRunning} className="px-6">Back</Button>
            <div className="flex gap-2">
              {isRunning ? (
                <Button onClick={handleStop} disabled={isStopping} variant="outline" className="gap-2 border-red-500/30 text-red-400 hover:bg-red-500/10">
                  <Square className="w-4 h-4" />{isStopping ? "Stopping..." : "Stop"}
                </Button>
              ) : hasCompleted ? (
                <Button onClick={() => { void handleContinueToEditor(); }} className="gap-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white border-0">
                  <CheckCircle2 className="w-4 h-4" />Continue to Editor
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // RENDER — Idle / Error view
  // Matches the ScriptStep card aesthetic: rounded-2xl, border-neutral-800,
  // bg-neutral-900/60 containers with generous padding.
  // =========================================================================

  return (
    <div
      className="flex-1 overflow-hidden"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-8 py-10 h-full">
        {/* Page heading — error shown as inline icon with hover tooltip */}
        <div className="space-y-1 flex-shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight">Video Production</h2>
            {errorMessage && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5 cursor-default">
                      <AlertCircle className="w-4.5 h-4.5 text-red-500" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs bg-neutral-900 border-neutral-700">
                    <p className="text-xs text-red-300">{errorMessage}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <p className="text-sm text-neutral-500">
            Fine-tune creative direction, then launch the AI pipeline to generate your video assets.
          </p>
        </div>

        {/* GPU Warning */}
        {needsLocalGpu && (vmStatus === "OFF" || vmStatus === "SETUP") && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 flex items-start gap-3">
            <Zap className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-amber-300 font-medium">{vmStatus === "SETUP" ? "GPU VM not configured" : "GPU VM is off"}</p>
              <p className="text-xs text-neutral-500 mt-0.5">
                {vmStatus === "SETUP" ? "Configure your Google Cloud instance in Settings → API Keys before starting." : "The GPU will be auto-started when you click Start Production."}
              </p>
            </div>
          </div>
        )}

        {/* Two-column grid: 60/40 split, items stretch to equal height */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)] flex-1 min-h-0">

          {/* LEFT CARD — Creative Direction (scrollable interior) */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 flex flex-col min-h-0">
            {/* Fixed card heading */}
            <div className="flex items-center gap-2.5 px-6 pt-5 pb-3 flex-shrink-0 border-b border-neutral-800/50">
              <Film className="w-4 h-4 text-orange-500 flex-shrink-0" />
              <span className="text-xs font-medium uppercase tracking-wider text-neutral-400">
                Creative Direction
              </span>
              {videoCreativeOverrides && Object.keys(videoCreativeOverrides).some((k) => (videoCreativeOverrides as any)[k] !== undefined) && (
                <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 font-medium">
                  Customized
                </span>
              )}
            </div>

            {/* Scrollable content area */}
            <div
              className="flex-1 overflow-y-auto px-6 py-5 min-h-0"
              style={{ scrollbarWidth: "thin", scrollbarColor: "rgb(64 64 64) transparent" }}
            >
              <VideoPreferencesPanel
                overrides={videoCreativeOverrides}
                onChange={onVideoCreativeOverridesChange}
                availableLoras={settings.visuals.creativeDirection?.loras || []}
                channelDefaultLora={settings.visuals.creativeDirection?.defaultLoraName}
                hideHeader
                defaultExpanded
              />
            </div>
          </div>

          {/* RIGHT CARD — Launch Controls */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6 flex flex-col">
            {/* Review Mode */}
            <div className="space-y-2.5 mb-6">
              <span className="text-xs font-medium uppercase tracking-wider text-neutral-400">
                Review Mode
              </span>
              <Select value={reviewMode} onValueChange={(val) => onReviewModeChange(val as ProductionReviewMode)}>
                <SelectTrigger className="bg-neutral-950/60 border-neutral-800 h-11 text-sm w-full">
                  <SelectValue placeholder="Automatic" />
                </SelectTrigger>
                <SelectContent className="bg-neutral-900 border-neutral-800">
                  <SelectItem value="off">Automatic</SelectItem>
                  <SelectItem value="sequence_preview">Sequence preview</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-neutral-600 leading-relaxed">
                Keep fully automatic, or pause after planning for a sequence preview.
              </p>
            </div>

            {/* Spacer pushes buttons to bottom */}
            <div className="flex-1" />

            {/* Action buttons — 2-column grid */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  onClick={onBack}
                  className="h-11 text-sm border-neutral-800"
                >
                  Back
                </Button>

                {errorMessage ? (
                  <Button
                    onClick={handleRetry}
                    disabled={isStarting}
                    className="h-11 text-sm gap-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white border-0"
                  >
                    <RefreshCw className={`w-4 h-4 ${isStarting ? "animate-spin" : ""}`} />
                    Retry
                  </Button>
                ) : (
                  <Button
                    onClick={handleStart}
                    disabled={isStarting}
                    className="h-11 text-sm gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white border-0"
                  >
                    {isStarting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    {isStarting ? "Starting..." : "Start Production"}
                  </Button>
                )}
              </div>

              {/* GPU auto-shutdown */}
              {needsLocalGpu && (
                <div className="flex items-center justify-center pt-1">
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
                          <Power className={`w-3 h-3 transition-colors ${shutdownWhenDone ? "text-orange-400" : "text-neutral-600 group-hover:text-neutral-400"}`} />
                          <span className={`text-[11px] transition-colors ${shutdownWhenDone ? "text-orange-400" : "text-neutral-600 group-hover:text-neutral-400"}`}>
                            Shut down GPU when done
                          </span>
                        </label>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs bg-neutral-900 border-neutral-700">
                        <p className="text-xs text-neutral-300">
                          GPU VM will stop after production completes, only if no other videos are being produced.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
