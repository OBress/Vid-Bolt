"use client";

import {
  Play,
  MoreVertical,
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { forwardRef } from "react";
import type { VideoStatus, VideoStage } from "@/types/video";

interface VideoCardProps {
  title: string;
  status: VideoStatus;
  progress: number;
  stage?: VideoStage;
  thumbnailUrl?: string;
  duration?: string;
  updatedAt?: string;
  onClick: () => void;
}

const statusConfig: Record<
  VideoStatus,
  { icon: React.ReactNode; color: string; label: string }
> = {
  draft: {
    icon: <Clock className="w-3 h-3" />,
    color: "text-neutral-400",
    label: "Draft",
  },
  processing: {
    icon: <Loader2 className="w-3 h-3 animate-spin" />,
    color: "text-orange-500",
    label: "Processing",
  },
  completed: {
    icon: <CheckCircle2 className="w-3 h-3" />,
    color: "text-green-500",
    label: "Completed",
  },
  failed: {
    icon: <XCircle className="w-3 h-3" />,
    color: "text-red-500",
    label: "Failed",
  },
  cancelled: {
    icon: <XCircle className="w-3 h-3" />,
    color: "text-neutral-500",
    label: "Cancelled",
  },
};

const stageLabels: Record<VideoStage, string> = {
  idea: "Idea",
  script: "Script",
  audio: "Audio",
  video: "Video",
  export: "Export",
  completed: "Complete",
};

export const VideoCard = forwardRef<HTMLDivElement, VideoCardProps>(
  (
    { title, status, progress, stage, thumbnailUrl, duration, onClick },
    ref
  ) => {
    const statusInfo = statusConfig[status] || statusConfig.draft;

    return (
      <div
        ref={ref}
        onClick={onClick}
        className="group relative bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden hover:border-orange-500/50 transition-all duration-300 cursor-pointer"
      >
        {/* Thumbnail/Preview area */}
        <div className="aspect-video bg-neutral-800 relative flex items-center justify-center">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt={title}
              className="w-full h-full object-cover"
            />
          ) : (
            <Play className="w-8 h-8 text-neutral-700 group-hover:text-orange-500/50 transition-colors" />
          )}

          {/* Progress bar for processing videos */}
          {status === "processing" && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-neutral-700">
              <div
                className="h-full bg-orange-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          {/* Duration badge */}
          {duration && (
            <div className="absolute bottom-2 right-2 bg-black/80 px-1.5 py-0.5 rounded text-[10px] font-mono text-neutral-400">
              {duration}
            </div>
          )}

          {/* Stage badge */}
          {stage && stage !== "completed" && (
            <div className="absolute top-2 left-2 bg-orange-500/90 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-white">
              {stageLabels[stage]}
            </div>
          )}
        </div>

        {/* Info area */}
        <div className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span
              className="text-xs font-medium truncate max-w-[180px]"
              title={title}
            >
              {title}
            </span>
            <MoreVertical className="w-3.5 h-3.5 text-neutral-600 hover:text-white" />
          </div>
          <div
            className={`flex items-center gap-2 text-[10px] ${statusInfo.color}`}
          >
            {statusInfo.icon}
            <span>{statusInfo.label}</span>
            {status === "processing" && (
              <span className="text-neutral-500">({progress}%)</span>
            )}
          </div>
        </div>
      </div>
    );
  }
);

VideoCard.displayName = "VideoCard";
