"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, CheckCircle, XCircle, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useVideoEditorStore } from "@/features/video-editor-v2/stores/video-editor-store";
import { buildRenderState } from "@/features/video-editor-v2/utils/clip-to-render-adapter";
import { HttpRenderer } from "@/features/video-editor-v2/utils/http-renderer";
import type {
  AudioChunk,
  ShotEvent,
} from "@/components/video-creation/VideoCreationWizard";
import type { TimelineClip } from "@/features/video-editor-v2/types/timeline-v2";

// Shared renderer targeting the Lambda endpoint
const renderer = new HttpRenderer("/api/render", {
  type: "ssr",
  entryPoint: "/api/render",
});

interface Step8ExportProps {
  videoId: string;
  projectId: string;
  onBack: () => void;
  onClose: () => void;
  audioChunks?: AudioChunk[];
  shotList?: ShotEvent[];
  isLocked?: boolean;
  lockedMessage?: string;
}

type ExportStatus = "idle" | "rendering" | "success" | "error";

export function Step8Export({
  videoId,
  projectId,
  onBack: _onBack,
  onClose,
  isLocked,
  lockedMessage,
}: Step8ExportProps) {
  const [exportStatus, setExportStatus] = useState<ExportStatus>("idle");
  const [exportProgress, setExportProgress] = useState(0);
  const [exportMessage, setExportMessage] = useState("");
  const [exportError, setExportError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  // Get timeline data from V2 editor store (for UI display only)
  const clips = useVideoEditorStore((s) => s.clips);

  // Count assets for display
  const clipValues = Object.values(clips) as TimelineClip[];
  const audioCount = clipValues.filter((c) => c.type === "audio").length;
  const videoCount = clipValues.filter((c) => c.type === "video").length;
  const imageCount = clipValues.filter((c) => c.type === "image").length;
  const totalAssets = clipValues.length;

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

      const inputProps = {
        overlays: state.overlays,
        durationInFrames: state.durationInFrames,
        width: 1920,
        height: 1080,
        fps: 30,
        src: "",
      };

      setExportMessage("Invoking Lambda render...");

      // Start the render
      const { renderId, bucketName } = await renderer.renderVideo({
        id: projectId,
        inputProps,
      });

      setExportMessage("Rendering video...");

      // Poll for progress
      let pending = true;
      while (pending) {
        const result = await renderer.getProgress({
          id: renderId,
          ...(bucketName && { bucketName }),
        });

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
  }, [projectId, isLocked, exportStatus]);

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
      {exportStatus === "idle" && (
        <div
          className={`w-full grid grid-cols-1 gap-3 ${isLocked ? "opacity-50" : ""}`}
        >
          <button
            onClick={handleRender}
            disabled={isLocked || totalAssets === 0}
            className={`group flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-400 hover:to-amber-500 text-white transition-all duration-300 hover:scale-[1.02] hover:shadow-lg ${
              isLocked ? "cursor-not-allowed" : ""
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
