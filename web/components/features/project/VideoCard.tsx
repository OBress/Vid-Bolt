"use client";

import {
  Play,
  MoreVertical,
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
  Info,
  Trash2,
} from "lucide-react";
import { forwardRef, useState } from "react";
import type { VideoStatus, VideoStage } from "@/types/video";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface VideoCardProps {
  videoId: string;
  title: string;
  status: VideoStatus;
  progress: number;
  stage?: VideoStage;
  thumbnailUrl?: string;
  thumbnailSvg?: string;
  duration?: string;
  updatedAt?: string;
  currentStep?: string | null;
  onClick: () => void;
  onDelete?: (videoId: string) => void;
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
  outline: "Outline",
  stock: "Stock Media",
  script: "Script",
  production: "Production",
  audio: "Audio",
  media: "Media",
  shot_planning: "Shot Planning",
  shot_creation: "Shot Creation",
  video: "Video",
  export: "Export",
  completed: "Complete",
};

export const VideoCard = forwardRef<HTMLDivElement, VideoCardProps>(
  (
    {
      videoId,
      title,
      status,
      progress,
      stage,
      thumbnailUrl,
      thumbnailSvg,
      duration,
      updatedAt,
      currentStep,
      onClick,
      onDelete,
    },
    ref
  ) => {
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [deleteConfirmName, setDeleteConfirmName] = useState("");
    const [isDeleting, setIsDeleting] = useState(false);

    // Determine if actively processing based on currentStep
    // Only show processing UI when there's an active step that's not a completion message
    const completionMessages = [
      "complete",
      "completed",
      "finished",
      "done",
      "workflow completed",
    ];
    const isActivelyProcessing =
      status === "processing" &&
      currentStep &&
      !completionMessages.some((msg) =>
        currentStep.toLowerCase().includes(msg)
      ) &&
      progress < 100;

    // Use draft status if not actively processing but status is still "processing"
    const effectiveStatus =
      status === "processing" && !isActivelyProcessing ? "draft" : status;
    const statusInfo = statusConfig[effectiveStatus] || statusConfig.draft;

    const handleDelete = async () => {
      if (deleteConfirmName !== title) return;

      setIsDeleting(true);
      try {
        const response = await fetch(`/api/videos/${videoId}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to delete video");
        }

        setIsDeleteDialogOpen(false);
        setDeleteConfirmName("");
        onDelete?.(videoId);
      } catch (error) {
        console.error("Failed to delete video:", error);
        // Could add toast notification here
      } finally {
        setIsDeleting(false);
      }
    };

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
          ) : thumbnailSvg ? (
            <div
              className="w-full h-full flex items-center justify-center [&>svg]:w-full [&>svg]:h-full [&>svg]:object-cover"
              dangerouslySetInnerHTML={{ __html: thumbnailSvg }}
            />
          ) : (
            <Play className="w-8 h-8 text-neutral-700 group-hover:text-orange-500/50 transition-colors" />
          )}

          {/* Progress bar for processing videos */}
          {isActivelyProcessing && (
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  onClick={(e) => e.stopPropagation()}
                  className="p-1 hover:bg-neutral-800 rounded-md transition-colors"
                >
                  <MoreVertical className="w-3.5 h-3.5 text-neutral-600 hover:text-white" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="bg-neutral-900 border-neutral-800 text-white w-40"
                onCloseAutoFocus={(e) => e.preventDefault()}
                onClick={(e) => e.stopPropagation()}
              >
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsDetailsOpen(true);
                  }}
                  className="gap-2 cursor-pointer focus:bg-neutral-800 focus:text-white"
                >
                  <Info className="w-4 h-4" />
                  <span>Details</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsDeleteDialogOpen(true);
                  }}
                  className="gap-2 cursor-pointer focus:bg-red-500/10 focus:text-red-500 text-red-500"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Details Dialog */}
          <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
            <DialogContent
              className="bg-neutral-950 border-neutral-800 text-white max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <DialogHeader>
                <DialogTitle className="text-xl font-bold uppercase tracking-tight flex items-center gap-2">
                  <Info className="w-5 h-5 text-orange-500" />
                  Video Details
                </DialogTitle>
                <DialogDescription className="text-neutral-400">
                  Technical details and metadata for this video.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4 space-y-4">
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <span className="text-neutral-500">Name</span>
                  <span className="col-span-2 text-neutral-200">{title}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <span className="text-neutral-500">Status</span>
                  <span className={`col-span-2 capitalize ${statusInfo.color}`}>
                    {statusInfo.label}
                  </span>
                </div>
                {stage && (
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <span className="text-neutral-500">Current Stage</span>
                    <span className="col-span-2 text-neutral-200">
                      {stageLabels[stage]}
                    </span>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <span className="text-neutral-500">Progress</span>
                  <span className="col-span-2 text-neutral-200">
                    {progress}%
                  </span>
                </div>
                {duration && (
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <span className="text-neutral-500">Duration</span>
                    <span className="col-span-2 text-neutral-200">
                      {duration}
                    </span>
                  </div>
                )}
                {updatedAt && (
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <span className="text-neutral-500">Last Updated</span>
                    <span className="col-span-2 text-neutral-200">
                      {new Date(updatedAt).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  className="bg-orange-500 border-none text-white hover:bg-orange-600"
                  onClick={() => setIsDetailsOpen(false)}
                >
                  Close
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Delete Dialog */}
          <Dialog
            open={isDeleteDialogOpen}
            onOpenChange={(open) => {
              setIsDeleteDialogOpen(open);
              if (!open) setDeleteConfirmName("");
            }}
          >
            <DialogContent
              className="bg-neutral-950 border-neutral-800 text-white max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <DialogHeader>
                <DialogTitle className="text-xl font-bold uppercase tracking-tight flex items-center gap-2">
                  <Trash2 className="w-5 h-5 text-red-500" />
                  Delete Video
                </DialogTitle>
                <DialogDescription className="text-neutral-400">
                  This action cannot be undone. Please type{" "}
                  <span className="text-white font-mono bg-neutral-800 px-1 rounded">
                    {title}
                  </span>{" "}
                  to confirm.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <Input
                  value={deleteConfirmName}
                  onChange={(e) => setDeleteConfirmName(e.target.value)}
                  placeholder="Enter video name"
                  className="bg-black border-neutral-800 text-white focus:ring-red-500 focus:border-red-500"
                  autoFocus
                  disabled={isDeleting}
                />
              </div>
              <DialogFooter className="gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setIsDeleteDialogOpen(false)}
                  className="text-neutral-400 hover:text-white"
                  disabled={isDeleting}
                >
                  Cancel
                </Button>
                <Button
                  disabled={deleteConfirmName !== title || isDeleting}
                  className="bg-red-600 hover:bg-red-700 text-white border-none disabled:opacity-50 disabled:bg-neutral-800 min-w-[120px]"
                  onClick={handleDelete}
                >
                  {isDeleting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Delete Video"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <div
            className={`flex items-center gap-2 text-[10px] ${statusInfo.color}`}
          >
            {statusInfo.icon}
            <span>{statusInfo.label}</span>
            {isActivelyProcessing && (
              <span className="text-neutral-500">({progress}%)</span>
            )}
          </div>
        </div>
      </div>
    );
  }
);

VideoCard.displayName = "VideoCard";
