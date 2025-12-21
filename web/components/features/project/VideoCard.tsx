"use client";

import { Play, MoreVertical, Clock } from "lucide-react";
import { forwardRef } from "react";

interface VideoCardProps {
  index: number;
  onClick: () => void;
}

export const VideoCard = forwardRef<HTMLDivElement, VideoCardProps>(
  ({ index, onClick }, ref) => {
    return (
      <div
        ref={ref}
        onClick={onClick}
        className="group relative bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden hover:border-orange-500/50 transition-all duration-300 cursor-pointer"
      >
        <div className="aspect-video bg-neutral-800 relative flex items-center justify-center">
          <Play className="w-8 h-8 text-neutral-700 group-hover:text-orange-500/50 transition-colors" />
          <div className="absolute bottom-2 right-2 bg-black/80 px-1.5 py-0.5 rounded text-[10px] font-mono text-neutral-400">
            02:45
          </div>
        </div>
        <div className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium truncate">
              sequence_v{index + 1}_draft.mp4
            </span>
            <MoreVertical className="w-3.5 h-3.5 text-neutral-600" />
          </div>
          <div className="flex items-center gap-2 text-[10px] text-neutral-500">
            <Clock className="w-3 h-3" />
            <span>Modified 2h ago</span>
          </div>
        </div>
      </div>
    );
  }
);

VideoCard.displayName = "VideoCard";
