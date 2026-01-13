"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  CheckCircle2,
  Circle,
  Image as ImageIcon,
  FileText,
  ChevronDown,
  ChevronUp,
  Eye,
} from "lucide-react";
import { type ShotEvent } from "@/types/video";
import { Button } from "@/components/ui/button";

interface StepProcessingProps {
  videoId: string;
  onComplete: () => void;
  onBack: () => void;
}

export function StepProcessing({ videoId, onComplete }: StepProcessingProps) {
  const [status, setStatus] = useState({
    avScript: "pending" as "pending" | "processing" | "completed",
    images: "pending" as "pending" | "processing" | "completed",
    totalImages: 0,
    completedImages: 0,
  });
  const [shotList, setShotList] = useState<ShotEvent[]>([]);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    let mounted = true;
    let pollInterval: NodeJS.Timeout;

    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/videos/${videoId}`);
        if (!response.ok) return;

        const data = await response.json();
        const video = data.video;
        const metadata = video.metadata || {};

        // Check AV Script Status
        const avScriptCompleted = metadata.av_script_completed === true;

        // Check Image Status
        const currentShotList: ShotEvent[] = metadata.shot_list || [];
        const shotsWithPrompts = currentShotList.filter(
          (s) => s.visual_prompt && s.media_type === "image"
        );
        const totalImages = shotsWithPrompts.length;
        const completedImages = shotsWithPrompts.filter(
          (s: any) => s.startImageUrl
        ).length;

        // Determine states
        let newAvScriptStatus = "pending";
        if (avScriptCompleted) {
          newAvScriptStatus = "completed";
        } else if (metadata.avScript || metadata.shot_list) {
          // If we have some data but flag not set, maybe processing?
          // Usually valid shot_list means AV script is done.
          if (currentShotList.length > 0) newAvScriptStatus = "completed";
          else newAvScriptStatus = "processing";
        } else {
          newAvScriptStatus = "processing"; // Assume processing if we are in this step
        }

        let newImagesStatus = "pending";
        if (newAvScriptStatus === "completed") {
          if (completedImages >= totalImages && totalImages > 0) {
            newImagesStatus = "completed";
          } else {
            newImagesStatus = "processing";
          }
        }

        if (mounted) {
          setStatus({
            avScript: newAvScriptStatus as any,
            images: newImagesStatus as any,
            totalImages,
            completedImages,
          });
          setShotList(currentShotList);

          // Auto-advance if everything is done
          // If 100% images are done OR if there are 0 images needed (e.g. all video clips or none)
          if (newAvScriptStatus === "completed") {
            const allImagesDone =
              totalImages === 0 || completedImages === totalImages;
            if (allImagesDone) {
              // Add a small delay so user sees the checkmark
              setTimeout(() => {
                // Only auto-advance if user isn't inspecting details
                if (mounted && !showDetails) onComplete();
              }, 2000);
            }
          }
        }
      } catch (error) {
        console.error("Error polling status:", error);
      }
    };

    // Initial check
    checkStatus();

    // Poll every 2 seconds
    pollInterval = setInterval(checkStatus, 2000);

    return () => {
      mounted = false;
      clearInterval(pollInterval);
    };
  }, [videoId, onComplete, showDetails]);

  return (
    <div className="flex flex-col items-center justify-start min-h-[400px] w-full max-w-4xl mx-auto p-8 space-y-8">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Processing Video</h2>
        <p className="text-neutral-400">
          Analyzing your script and generating visuals...
        </p>
      </div>

      <div className="w-full max-w-2xl space-y-4 bg-neutral-900/50 p-6 rounded-xl border border-neutral-800">
        {/* Step 1: AV Script */}
        <div className="flex items-center justify-between p-4 bg-neutral-900 rounded-lg border border-neutral-800">
          <div className="flex items-center space-x-4">
            <div
              className={`p-2 rounded-full ${
                status.avScript === "processing"
                  ? "bg-blue-500/20 text-blue-500"
                  : status.avScript === "completed"
                  ? "bg-green-500/20 text-green-500"
                  : "bg-neutral-800 text-neutral-500"
              }`}
            >
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-medium text-white">Analyzing Scenes</h3>
              <p className="text-sm text-neutral-400">
                Breaking down script into visual segments
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            {/* View Details Button */}
            {status.avScript === "completed" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDetails(!showDetails)}
                className="text-xs text-neutral-400 hover:text-white"
              >
                <Eye className="w-3 h-3 mr-2" />
                {showDetails ? "Hide Script" : "View Script"}
              </Button>
            )}

            <div className="text-right">
              {status.avScript === "processing" && (
                <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
              )}
              {status.avScript === "completed" && (
                <CheckCircle2 className="w-6 h-6 text-green-500" />
              )}
              {status.avScript === "pending" && (
                <Circle className="w-5 h-5 text-neutral-600" />
              )}
            </div>
          </div>
        </div>

        {/* Step 2: Image Generation */}
        <div className="flex items-center justify-between p-4 bg-neutral-900 rounded-lg border border-neutral-800">
          <div className="flex items-center space-x-4">
            <div
              className={`p-2 rounded-full ${
                status.images === "processing"
                  ? "bg-purple-500/20 text-purple-500"
                  : status.images === "completed"
                  ? "bg-green-500/20 text-green-500"
                  : "bg-neutral-800 text-neutral-500"
              }`}
            >
              <ImageIcon className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-medium text-white">Generating Images</h3>
              <p className="text-sm text-neutral-400">
                Creating AI visuals for your scenes
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            {status.images === "processing" && (
              <div className="flex items-center space-x-3">
                <span className="text-sm font-medium text-purple-400">
                  {status.completedImages} / {status.totalImages}
                </span>
                <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
              </div>
            )}
            {status.images === "completed" && (
              <CheckCircle2 className="w-6 h-6 text-green-500" />
            )}
            {status.images === "pending" && (
              <Circle className="w-5 h-5 text-neutral-600" />
            )}
          </div>
        </div>
      </div>

      {/* Detailed View */}
      {showDetails && shotList.length > 0 && (
        <div className="w-full animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-neutral-800 bg-neutral-950/50">
              <h3 className="font-semibold text-white">Generated AV Script</h3>
            </div>
            <div className="max-h-[300px] overflow-y-auto divide-y divide-neutral-800">
              {shotList.map((shot, idx) => (
                <div
                  key={idx}
                  className="p-4 flex gap-4 text-sm hover:bg-neutral-800/20 transition-colors"
                >
                  <div className="w-8 shrink-0 text-neutral-500 font-mono">
                    #{shot.segment_index}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                    <div className="space-y-1">
                      <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">
                        Audio
                      </span>
                      <p className="text-neutral-300">
                        {shot.text || "(No narration)"}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-purple-400 uppercase tracking-wider">
                          Visual Prompt
                        </span>
                        {shot.media_type === "image" && (
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded ${
                              (shot as any).startImageUrl
                                ? "bg-green-500/20 text-green-400"
                                : "bg-neutral-700 text-neutral-400"
                            }`}
                          >
                            {(shot as any).startImageUrl
                              ? "Ready"
                              : "Generating..."}
                          </span>
                        )}
                      </div>
                      <p className="text-neutral-400 italic">
                        {shot.visual_prompt}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Manual Bypass */}
      {status.avScript === "completed" && status.images !== "completed" && (
        <div className="text-center animate-in fade-in slide-in-from-bottom-2 duration-700">
          <p className="text-xs text-neutral-500 mb-2">Taking too long?</p>
          <button
            onClick={onComplete}
            className="text-sm text-neutral-400 hover:text-white underline decoration-dotted underline-offset-4 transition-colors"
          >
            Continue with placeholders
          </button>
        </div>
      )}
      {status.images === "completed" && showDetails && (
        <div className="text-center animate-in fade-in slide-in-from-bottom-2 duration-300">
          <Button
            onClick={onComplete}
            className="bg-green-600 hover:bg-green-500 text-white"
          >
            Continue to Editor
          </Button>
        </div>
      )}
    </div>
  );
}
