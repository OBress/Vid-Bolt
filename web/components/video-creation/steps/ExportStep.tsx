"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Loader2, CheckCircle, XCircle, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useVideoEditorStore } from "@/features/video-editor-v2/stores/video-editor-store";
import { buildRenderState } from "@/features/video-editor-v2/utils/clip-to-render-adapter";
import { loadProjectState } from "@/features/video-editor-v2/services/project-state-service";
import type { TimelineClip } from "@/features/video-editor-v2/types/timeline-v2";

interface ExportStepProps {
  videoId: string;
  projectId: string;
  onClose: () => void;
  isLocked?: boolean;
  lockedMessage?: string;
}

type ExportStatus = "idle" | "rendering" | "success" | "error";

export function ExportStep({
  videoId,
  projectId,
  onClose,
  isLocked,
  lockedMessage,
}: ExportStepProps) {
  const [exportStatus, setExportStatus] = useState<ExportStatus>("idle");
  const [exportProgress, setExportProgress] = useState(0);
  const [exportMessage, setExportMessage] = useState("");
  const [exportError, setExportError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [isRestoringState, setIsRestoringState] = useState(false);
  const hasAttemptedRestore = useRef(false);

  // Get timeline data from V2 editor store (for UI display only)
  const clips = useVideoEditorStore((s) => s.clips);

  // Count assets for display
  const clipValues = Object.values(clips) as TimelineClip[];
  const audioCount = clipValues.filter((c) => c.type === "audio").length;
  const videoCount = clipValues.filter((c) => c.type === "video").length;
  const imageCount = clipValues.filter((c) => c.type === "image").length;
  const totalAssets = clipValues.length;

  // Restore store from Supabase if empty (handles page refresh on Step 8)
  useEffect(() => {
    if (hasAttemptedRestore.current || totalAssets > 0) return;
    hasAttemptedRestore.current = true;

    async function restoreFromSupabase() {
      setIsRestoringState(true);
      try {
        console.log('[ExportStep] Store empty, restoring from Supabase...');
        const savedState = await loadProjectState(projectId);

        if (savedState?.timelineData) {
          const store = useVideoEditorStore.getState();
          const { timelineData } = savedState;

          if (timelineData.tracks) store.setTracks(timelineData.tracks);
          if (timelineData.clips) store.setClips(timelineData.clips);
          if (timelineData.transitions) store.setTransitions(timelineData.transitions);

          console.log('[ExportStep] Restored state from Supabase:', {
            tracks: timelineData.tracks?.length || 0,
            clips: Array.isArray(timelineData.clips) ? timelineData.clips.length : Object.keys(timelineData.clips || {}).length,
          });
        } else {
          console.warn('[ExportStep] No saved state found in Supabase');
        }
      } catch (err) {
        console.error('[ExportStep] Failed to restore state:', err);
      } finally {
        setIsRestoringState(false);
      }
    }

    restoreFromSupabase();
  }, [projectId, totalAssets]);

  const handleRender = useCallback(async () => {
    if (isLocked || exportStatus === "rendering") return;

    setExportStatus("rendering");
    setExportProgress(0);
    setExportMessage("Building render state...");
    setExportError(null);
    setDownloadUrl(null);

    try {
      // Read latest state directly from store (stable reference)
      const storeState = useVideoEditorStore.getState();
      const latestClips = Object.values(storeState.clips) as TimelineClip[];
      const latestTracks = Object.values(storeState.tracks) as import("@/features/video-editor-v2/types/timeline-v2").TimelineTrack[];
      const latestTransitions = storeState.transitions;

      // Build render state from V2 store data
      const state = buildRenderState(
        latestClips,
        latestTracks,
        latestTransitions,
        30,
        { width: 1920, height: 1080 },
        "#000000",
      );

      setExportMessage("Invoking Lambda render...");

      // Start the render via new Lambda API
      const renderRes = await fetch('/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId,
          overlays: state.overlays,
          durationInFrames: state.durationInFrames,
          width: 1920,
          height: 1080,
          fps: 30,
        }),
      });

      if (!renderRes.ok) {
        const errData = await renderRes.json().catch(() => ({}));
        throw new Error(errData.error || `Render request failed: ${renderRes.status}`);
      }

      const { jobId, warnings } = await renderRes.json();
      if (warnings?.length) {
        console.warn('[ExportStep] Render warnings:', warnings);
      }

      setExportMessage("Rendering video...");

      // Calculate timeout: 2x video duration, minimum 120s
      const videoDurationSec = state.durationInFrames / 24;
      const maxWaitMs = Math.max(videoDurationSec * 2, 120) * 1000;
      const pollStartTime = Date.now();
      console.log(`[ExportStep] Polling timeout: ${Math.round(maxWaitMs / 1000)}s (video: ${Math.round(videoDurationSec)}s)`);

      // Poll for progress via GET
      let pending = true;
      while (pending) {
        // Timeout guard
        if (Date.now() - pollStartTime > maxWaitMs) {
          throw new Error(
            `Render timed out after ${Math.round(maxWaitMs / 1000)}s. ` +
            `The video may still be rendering — try refreshing.`
          );
        }

        const progressRes = await fetch(`/api/render/progress?jobId=${jobId}`);
        if (!progressRes.ok) {
          throw new Error(`Progress check failed: ${progressRes.status}`);
        }

        const result = await progressRes.json();

        switch (result.type) {
          case "error":
            setExportStatus("error");
            setExportError(result.message);
            setExportMessage("Render failed");
            pending = false;
            break;

          case "done":
            setExportStatus("success");
            setExportProgress(100);
            setExportMessage("Video rendered successfully!");
            setDownloadUrl(result.url);
            pending = false;
            break;

          case "progress":
            setExportProgress(result.progress * 100);
            setExportMessage(
              `Rendering... ${Math.round(result.progress * 100)}%`,
            );
            // Wait before polling again
            await new Promise((r) => setTimeout(r, 1500));
            break;
        }
      }
    } catch (error) {
      setExportStatus("error");
      setExportError(
        error instanceof Error ? error.message : "Render failed",
      );
      setExportMessage("Render failed");
    }
  }, [videoId, isLocked, exportStatus]);

  const resetExportState = () => {
    setExportStatus("idle");
    setExportProgress(0);
    setExportMessage("");
    setExportError(null);
    setDownloadUrl(null);
  };

  return (
    <div className="flex flex-col items-center gap-6 text-center pt-12">
      {/* Header */}
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">
          Export Your Video
        </h2>
        <p className="text-neutral-500 text-sm max-w-md">
          Render your video through AWS Lambda and download the final result.
        </p>
      </div>

      {/* Export Progress */}
      {exportStatus !== "idle" && (
        <div className="w-full max-w-md p-6 bg-neutral-900 border border-neutral-800 rounded-xl space-y-4">
          {exportStatus === "rendering" && (
            <>
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-orange-500" />
                <span className="text-sm font-medium">{exportMessage}</span>
              </div>
              <Progress value={exportProgress} className="h-2" />
              <p className="text-xs text-neutral-500">
                {Math.round(exportProgress)}% complete
              </p>
            </>
          )}

          {exportStatus === "success" && (
            <>
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <span className="text-sm font-medium text-green-500">
                  Render Complete!
                </span>
              </div>
              <p className="text-xs text-neutral-400">{exportMessage}</p>
              {downloadUrl && (
                <a
                  href={downloadUrl}
                  download
                  className="block w-full py-2 text-center text-sm font-medium bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors"
                >
                  Download Video
                </a>
              )}
              <Button
                onClick={resetExportState}
                variant="outline"
                size="sm"
                className="w-full border-neutral-700"
              >
                Render Again
              </Button>
            </>
          )}

          {exportStatus === "error" && (
            <>
              <div className="flex items-center gap-3">
                <XCircle className="w-5 h-5 text-red-500" />
                <span className="text-sm font-medium text-red-500">
                  Render Failed
                </span>
              </div>
              <p className="text-xs text-red-400">{exportError}</p>
              <Button
                onClick={resetExportState}
                variant="outline"
                size="sm"
                className="w-full border-neutral-700"
              >
                Try Again
              </Button>
            </>
          )}
        </div>
      )}

      {/* Render Button */}
      {/* Restoring state loading indicator */}
      {isRestoringState && (
        <div className="w-full flex items-center justify-center gap-3 p-4 bg-neutral-900/50 border border-neutral-800 rounded-lg">
          <Loader2 className="w-4 h-4 animate-spin text-orange-400" />
          <p className="text-sm text-neutral-300">Restoring project data...</p>
        </div>
      )}

      {exportStatus === "idle" && !isRestoringState && (
        <div
          className={`w-full grid grid-cols-1 gap-3 ${isLocked ? "opacity-50" : ""}`}
        >
          <button
            onClick={handleRender}
            disabled={isLocked || totalAssets === 0}
            className={`group flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-400 hover:to-amber-500 text-white transition-all duration-300 hover:scale-[1.02] hover:shadow-lg ${
              isLocked || totalAssets === 0 ? "cursor-not-allowed opacity-50" : ""
            }`}
          >
            <div className="p-2 bg-white/20 rounded-lg">
              <Rocket className="w-5 h-5" />
            </div>
            <div className="text-left">
              <p className="font-semibold">Render Video</p>
              <p className="text-xs opacity-80">
                {totalAssets} assets • AWS Lambda
              </p>
            </div>
          </button>
        </div>
      )}

      {/* Asset Summary */}
      {exportStatus === "idle" && totalAssets > 0 && (
        <div className="w-full p-4 bg-neutral-900/50 border border-neutral-800 rounded-lg">
          <p className="text-xs text-neutral-400 mb-2">Project Summary</p>
          <div className="flex justify-center gap-6 text-sm">
            {videoCount > 0 && (
              <span className="text-neutral-300">
                <span className="text-orange-500 font-semibold">
                  {videoCount}
                </span>{" "}
                video{videoCount !== 1 ? "s" : ""}
              </span>
            )}
            {audioCount > 0 && (
              <span className="text-neutral-300">
                <span className="text-orange-500 font-semibold">
                  {audioCount}
                </span>{" "}
                audio
              </span>
            )}
            {imageCount > 0 && (
              <span className="text-neutral-300">
                <span className="text-orange-500 font-semibold">
                  {imageCount}
                </span>{" "}
                image{imageCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-4 w-full pt-4">
        {isLocked ? (
          <div className="w-full h-12 flex items-center justify-center bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-500 font-mono text-xs uppercase tracking-widest">
            {lockedMessage}
          </div>
        ) : (
          <Button
            onClick={onClose}
            className="w-full h-12 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-bold uppercase tracking-widest"
            disabled={exportStatus === "rendering"}
          >
            Done
          </Button>
        )}
      </div>
    </div>
  );
}
