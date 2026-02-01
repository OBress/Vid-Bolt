"use client";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  Image,
  Film,
  Layers,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  LayoutGrid,
  Filter,
  Save,
} from "lucide-react";
import type { GeneratedMedia } from "@/types/video";

// Shot data type
interface ShotData {
  segment_index: number;
  start_seconds: number;
  end_seconds: number;
  duration_seconds: number;
  content_type: string;
  media_type?: "image" | "video" | "motiongraphic";
  text: string;
  summary?: string;
}

interface SceneReviewSidebarProps {
  shots: ShotData[];
  mediaMap: Map<number, GeneratedMedia>;
  pendingChanges: Map<number, GeneratedMedia>;
  generatingShots: Set<number>;
  onGenerateAll: () => void;
  onSaveAll: () => void;
  isSaving?: boolean;
  className?: string;
}

export function SceneReviewSidebar({
  shots,
  mediaMap,
  pendingChanges,
  generatingShots,
  onGenerateAll,
  onSaveAll,
  isSaving = false,
  className,
}: SceneReviewSidebarProps) {
  // Calculate stats
  const totalShots = shots.length;
  const completedCount = Array.from(mediaMap.values()).filter(
    (m) => m.generation_status === "completed" && m.media_url,
  ).length;
  const pendingCount = totalShots - completedCount;
  const generatingCount = generatingShots.size;
  const failedCount = Array.from(mediaMap.values()).filter(
    (m) => m.generation_status === "failed",
  ).length;

  // Calculate progress percentage
  const progressPercent =
    totalShots > 0 ? (completedCount / totalShots) * 100 : 0;

  // Count by media type
  const imageCount = shots.filter(
    (s) =>
      (mediaMap.get(s.segment_index)?.media_type || s.media_type || "image") ===
      "image",
  ).length;
  const videoCount = shots.filter(
    (s) =>
      (mediaMap.get(s.segment_index)?.media_type || s.media_type) === "video",
  ).length;
  const motionCount = shots.filter(
    (s) =>
      (mediaMap.get(s.segment_index)?.media_type || s.media_type) ===
      "motiongraphic",
  ).length;

  // Total duration
  const totalDuration = shots.reduce((sum, s) => sum + s.duration_seconds, 0);
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className={cn(
        "w-80 flex-shrink-0 bg-[#0F0F0F] border-r border-neutral-800 flex flex-col h-full",
        className,
      )}
    >
      {/* Header */}
      <div className="p-4 border-b border-neutral-800">
        <div className="flex items-center gap-2 mb-1">
          <LayoutGrid className="w-4 h-4 text-neutral-500" />
          <h2 className="text-lg font-bold text-white">Media Generation</h2>
        </div>
        <p className="text-sm text-neutral-500 pl-6">
          Generate visuals for each shot
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* Progress Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutral-400">Generation Progress</span>
              <span className="text-neutral-300 font-medium">
                {completedCount}/{totalShots}
              </span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Total Duration */}
            <div className="bg-neutral-900/50 rounded-lg p-3 border border-neutral-800">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-neutral-500" />
                <span className="text-xs text-neutral-500 uppercase">
                  Duration
                </span>
              </div>
              <span className="text-lg font-bold text-white">
                {formatDuration(totalDuration)}
              </span>
            </div>

            {/* Total Shots */}
            <div className="bg-neutral-900/50 rounded-lg p-3 border border-neutral-800">
              <div className="flex items-center gap-2 mb-1">
                <LayoutGrid className="w-4 h-4 text-neutral-500" />
                <span className="text-xs text-neutral-500 uppercase">
                  Shots
                </span>
              </div>
              <span className="text-lg font-bold text-white">{totalShots}</span>
            </div>

            {/* Completed */}
            <div className="bg-neutral-900/50 rounded-lg p-3 border border-neutral-800">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span className="text-xs text-neutral-500 uppercase">Done</span>
              </div>
              <span className="text-lg font-bold text-emerald-400">
                {completedCount}
              </span>
            </div>

            {/* Pending */}
            <div className="bg-neutral-900/50 rounded-lg p-3 border border-neutral-800">
              <div className="flex items-center gap-2 mb-1">
                {generatingCount > 0 ? (
                  <Loader2 className="w-4 h-4 text-orange-500 animate-spin" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-neutral-500" />
                )}
                <span className="text-xs text-neutral-500 uppercase">
                  {generatingCount > 0 ? "Generating" : "Pending"}
                </span>
              </div>
              <span
                className={cn(
                  "text-lg font-bold",
                  generatingCount > 0 ? "text-orange-400" : "text-neutral-400",
                )}
              >
                {generatingCount > 0 ? generatingCount : pendingCount}
              </span>
            </div>
          </div>

          {/* Media Type Breakdown */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-neutral-500 uppercase tracking-wide">
              <Filter className="w-3 h-3" />
              Media Types
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-2 bg-neutral-900/30 rounded border border-neutral-800/50">
                <div className="flex items-center gap-2">
                  <Image className="w-4 h-4 text-sky-400" />
                  <span className="text-sm text-neutral-300">Images</span>
                </div>
                <span className="text-sm font-medium text-neutral-400">
                  {imageCount}
                </span>
              </div>
              <div className="flex items-center justify-between p-2 bg-neutral-900/30 rounded border border-neutral-800/50">
                <div className="flex items-center gap-2">
                  <Film className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm text-neutral-300">Videos</span>
                </div>
                <span className="text-sm font-medium text-neutral-400">
                  {videoCount}
                </span>
              </div>
              <div className="flex items-center justify-between p-2 bg-neutral-900/30 rounded border border-neutral-800/50">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-400" />
                  <span className="text-sm text-neutral-300">Motion</span>
                </div>
                <span className="text-sm font-medium text-neutral-400">
                  {motionCount}
                </span>
              </div>
            </div>
          </div>

          {/* Failed count if any */}
          {failedCount > 0 && (
            <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-3">
              <div className="flex items-center gap-2 text-red-400">
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm font-medium">
                  {failedCount} generation{failedCount === 1 ? "" : "s"} failed
                </span>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Footer Actions */}
      <div className="p-4 border-t border-neutral-800 space-y-3">

        {/* Save All Button (if pending changes) */}
        {pendingChanges.size > 0 && (
          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={onSaveAll}
            disabled={isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Changes ({pendingChanges.size})
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
