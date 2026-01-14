"use client";

/**
 * StepMediaGeneration Component
 * ============================================================================
 * Step 3 in the video creation wizard. Displays progress for:
 * 1. AV Script generation
 * 2. Z-Image Turbo base image generation
 * 3. Image editing/enhancement
 * 4. LTX-2 video generation
 *
 * Shows detailed progress with visual indicators for each phase and allows
 * retrying failed shots in the editor.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileText,
  Image,
  Sparkles,
  Video,
  RefreshCw,
} from "lucide-react";
import type {
  MediaGenerationProgress,
  EnhancedShot,
} from "@/types/media-generation";
import {
  calculateMediaGenerationProgress,
  getMediaGenerationStatusMessage,
} from "@/types/media-generation";

// ============================================================================
// TYPES
// ============================================================================

interface StepMediaGenerationProps {
  videoId: string;
  onComplete: () => void;
  onBack: () => void;
}

interface PhaseStatus {
  label: string;
  icon: React.ReactNode;
  status: "waiting" | "in-progress" | "completed" | "failed";
  completed: number;
  total: number;
  failed: number;
  skipped?: number;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function StepMediaGeneration({
  videoId,
  onComplete,
  onBack,
}: StepMediaGenerationProps) {
  const [progress, setProgress] = useState<MediaGenerationProgress | null>(
    null
  );
  const [shots, setShots] = useState<EnhancedShot[]>([]);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use ref instead of state to prevent React 18 Strict Mode double-trigger
  const hasStartedRef = useRef(false);

  // Calculate overall progress percentage
  const overallProgress = progress
    ? calculateMediaGenerationProgress(progress)
    : 0;
  const statusMessage = progress
    ? getMediaGenerationStatusMessage(progress)
    : "Initializing...";

  // Get phase statuses for display
  const getPhaseStatuses = useCallback((): PhaseStatus[] => {
    if (!progress) {
      return [
        {
          label: "AV Script",
          icon: <FileText className="w-4 h-4" />,
          status: "waiting",
          completed: 0,
          total: 1,
          failed: 0,
        },
        {
          label: "Images",
          icon: <Image className="w-4 h-4" />,
          status: "waiting",
          completed: 0,
          total: 0,
          failed: 0,
        },
        {
          label: "Edits",
          icon: <Sparkles className="w-4 h-4" />,
          status: "waiting",
          completed: 0,
          total: 0,
          failed: 0,
        },
        {
          label: "Videos",
          icon: <Video className="w-4 h-4" />,
          status: "waiting",
          completed: 0,
          total: 0,
          failed: 0,
        },
      ];
    }

    const total = progress.total_shots || 1;

    const getStatus = (
      phase: string
    ): "waiting" | "in-progress" | "completed" | "failed" => {
      if (progress.status === "failed") return "failed";

      switch (phase) {
        case "av_script":
          if (progress.av_script_completed) return "completed";
          if (progress.status === "av_script") return "in-progress";
          if (progress.status === "pending") return "waiting";
          return "completed";

        case "images":
          if (progress.images_completed + progress.images_failed >= total)
            return progress.images_failed > 0 ? "failed" : "completed";
          if (progress.status === "images") return "in-progress";
          if (["av_script", "pending"].includes(progress.status))
            return "waiting";
          return "completed";

        case "image_edits":
          if (
            progress.edits_completed +
              progress.edits_failed +
              progress.edits_skipped >=
            total
          )
            return progress.edits_failed > 0 ? "failed" : "completed";
          if (progress.status === "image_edits") return "in-progress";
          if (["av_script", "pending", "images"].includes(progress.status))
            return "waiting";
          return "completed";

        case "videos":
          if (progress.videos_completed + progress.videos_failed >= total)
            return progress.videos_failed > 0 ? "failed" : "completed";
          if (progress.status === "videos") return "in-progress";
          if (
            ["av_script", "pending", "images", "image_edits"].includes(
              progress.status
            )
          )
            return "waiting";
          return "completed";

        default:
          return "waiting";
      }
    };

    return [
      {
        label: "AV Script",
        icon: <FileText className="w-4 h-4" />,
        status: getStatus("av_script"),
        completed: progress.av_script_completed ? 1 : 0,
        total: 1,
        failed: 0,
      },
      {
        label: "Images",
        icon: <Image className="w-4 h-4" />,
        status: getStatus("images"),
        completed: progress.images_completed,
        total: total,
        failed: progress.images_failed,
      },
      {
        label: "Edits",
        icon: <Sparkles className="w-4 h-4" />,
        status: getStatus("image_edits"),
        completed: progress.edits_completed,
        total: total,
        failed: progress.edits_failed,
        skipped: progress.edits_skipped,
      },
      {
        label: "Videos",
        icon: <Video className="w-4 h-4" />,
        status: getStatus("videos"),
        completed: progress.videos_completed,
        total: total,
        failed: progress.videos_failed,
      },
    ];
  }, [progress]);

  // Poll for progress updates
  const pollProgress = useCallback(async () => {
    try {
      const response = await fetch(`/api/videos/${videoId}`);
      if (!response.ok) throw new Error("Failed to fetch video");

      const data = await response.json();
      const metadata = data.video?.metadata || {};

      setProgress(metadata.media_generation || null);
      setShots(metadata.shot_list || []);

      // Check if completed or failed
      if (metadata.media_generation?.status === "completed") {
        setIsPolling(false);
        // Auto-advance after a short delay
        setTimeout(() => {
          onComplete();
        }, 2000);
      } else if (metadata.media_generation?.status === "failed") {
        setIsPolling(false);
        setError(metadata.media_generation.error || "Media generation failed");
      }
    } catch (err) {
      console.error("[MediaGen UI] Poll error:", err);
    }
  }, [videoId, onComplete]);

  // Start media generation
  const startGeneration = useCallback(async () => {
    // Double-check ref to prevent duplicate calls
    if (hasStartedRef.current) {
      console.log("[MediaGen UI] Skipping duplicate startGeneration call");
      return;
    }
    hasStartedRef.current = true;

    try {
      setError(null);
      setIsPolling(true);

      const response = await fetch(`/api/videos/${videoId}/trigger-media-gen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to start media generation");
      }

      // Initial poll
      await pollProgress();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start");
      setIsPolling(false);
      hasStartedRef.current = false; // Allow retry on error
    }
  }, [videoId, pollProgress]);

  // Check initial state and auto-start if needed
  useEffect(() => {
    const checkInitialState = async () => {
      try {
        const response = await fetch(`/api/videos/${videoId}`);
        if (!response.ok) return;

        const data = await response.json();
        const metadata = data.video?.metadata || {};
        const mediaProgress = metadata.media_generation;

        setProgress(mediaProgress || null);
        setShots(metadata.shot_list || []);

        // Check if already in progress
        if (
          mediaProgress &&
          ["av_script", "images", "image_edits", "videos"].includes(
            mediaProgress.status
          )
        ) {
          hasStartedRef.current = true;
          setIsPolling(true);
        } else if (mediaProgress?.status === "completed") {
          // Already complete, just show the UI
          hasStartedRef.current = true;
        } else if (!hasStartedRef.current) {
          // Auto-start generation (ref check prevents double trigger)
          startGeneration();
        }
      } catch (err) {
        console.error("[MediaGen UI] Initial check error:", err);
      }
    };

    checkInitialState();
  }, [videoId, startGeneration]);

  // Polling interval
  useEffect(() => {
    if (!isPolling) return;

    const interval = setInterval(pollProgress, 3000);
    return () => clearInterval(interval);
  }, [isPolling, pollProgress]);

  const phases = getPhaseStatuses();

  // Render phase card
  const renderPhaseCard = (phase: PhaseStatus, index: number) => {
    const statusColors = {
      waiting: "bg-neutral-800 border-neutral-700 text-neutral-500",
      "in-progress": "bg-orange-500/10 border-orange-500/30 text-orange-400",
      completed: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
      failed: "bg-red-500/10 border-red-500/30 text-red-400",
    };

    const statusIcons = {
      waiting: (
        <div className="w-4 h-4 rounded-full border-2 border-neutral-600" />
      ),
      "in-progress": <Loader2 className="w-4 h-4 animate-spin" />,
      completed: <CheckCircle2 className="w-4 h-4" />,
      failed: <XCircle className="w-4 h-4" />,
    };

    return (
      <div
        key={phase.label}
        className={`flex flex-col items-center p-4 rounded-lg border transition-all ${
          statusColors[phase.status]
        }`}
      >
        <div className="flex items-center gap-2 mb-2">
          {phase.icon}
          <span className="font-medium text-sm">{phase.label}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          {statusIcons[phase.status]}
          <span>
            {phase.status === "waiting" && "Waiting"}
            {phase.status === "in-progress" &&
              `${phase.completed}/${phase.total}`}
            {phase.status === "completed" &&
              (phase.skipped !== undefined
                ? `${phase.completed} done, ${phase.skipped} skipped`
                : `${phase.completed}/${phase.total}`)}
            {phase.status === "failed" && `${phase.failed} failed`}
          </span>
        </div>
      </div>
    );
  };

  // Count failed shots
  const failedShotsCount = shots.filter(
    (s) =>
      s.baseImageStatus === "failed" ||
      s.editedImageStatus === "failed" ||
      s.videoStatus === "failed"
  ).length;

  return (
    <div className="flex flex-col h-full bg-black/40 rounded-xl overflow-hidden border border-white/5 relative">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
        <button
          onClick={onBack}
          className="p-2 bg-neutral-900/80 backdrop-blur rounded-lg border border-white/10 hover:border-white/20 transition-colors text-neutral-400 hover:text-white"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/10 border border-orange-500/20 rounded text-orange-500 text-xs font-mono uppercase tracking-widest">
            <Video className="w-3 h-3" />
            Media Generation
          </div>
        </div>

        {progress?.status === "completed" && (
          <Button
            onClick={onComplete}
            className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-medium"
          >
            Continue to Editor
          </Button>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-8">
        {/* Error State */}
        {error && (
          <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-6 max-w-lg w-full text-center space-y-4">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
            <div>
              <h3 className="text-lg font-bold text-white mb-2">
                Generation Failed
              </h3>
              <p className="text-red-200 text-sm">{error}</p>
            </div>
            <Button
              onClick={startGeneration}
              variant="outline"
              className="border-red-500/30 hover:bg-red-500/10"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </div>
        )}

        {/* Progress UI */}
        {!error && (
          <>
            {/* Overall Progress */}
            <div className="w-full max-w-xl space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-neutral-400">{statusMessage}</span>
                <span className="text-orange-400 font-mono">
                  {overallProgress}%
                </span>
              </div>
              <div className="h-3 bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-orange-500 to-orange-400 transition-all duration-500 rounded-full"
                  style={{ width: `${overallProgress}%` }}
                />
              </div>
            </div>

            {/* Phase Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-2xl">
              {phases.map((phase, index) => renderPhaseCard(phase, index))}
            </div>

            {/* Current Shot Info */}
            {progress &&
              progress.status !== "completed" &&
              progress.status !== "pending" && (
                <div className="text-center space-y-2 max-w-md">
                  <p className="text-sm text-neutral-400">
                    Processing shot {progress.current_shot_index + 1} of{" "}
                    {progress.total_shots}
                  </p>
                  {shots[progress.current_shot_index]?.visual_prompt && (
                    <p className="text-xs text-neutral-500 italic line-clamp-2">
                      "{shots[progress.current_shot_index].visual_prompt}"
                    </p>
                  )}
                </div>
              )}

            {/* Estimated Time */}
            {isPolling && progress?.total_shots && progress.total_shots > 0 && (
              <div className="text-sm text-neutral-500">
                <span>Estimated time remaining: </span>
                <span className="text-neutral-400">
                  ~{Math.max(1, Math.round((100 - overallProgress) * 0.5))}{" "}
                  minutes
                </span>
              </div>
            )}

            {/* Completion State */}
            {progress?.status === "completed" && (
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">
                    Generation Complete!
                  </h3>
                  <p className="text-neutral-400 text-sm mt-1">
                    {progress.images_completed} images,{" "}
                    {progress.edits_completed} edits,{" "}
                    {progress.videos_completed} videos created
                  </p>
                  {failedShotsCount > 0 && (
                    <p className="text-amber-400 text-sm mt-2 flex items-center justify-center gap-1">
                      <AlertCircle className="w-4 h-4" />
                      {failedShotsCount} shot{failedShotsCount > 1 ? "s" : ""}{" "}
                      had issues - you can retry in the editor
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Loading Animation */}
            {isPolling && !progress?.status?.includes("completed") && (
              <div className="flex items-center gap-2 text-neutral-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Processing on GPU...</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
