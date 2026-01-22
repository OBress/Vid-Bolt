"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronRight,
  Image,
  Film,
  Layers,
  RefreshCw,
  Check,
  X,
  Loader2,
  Clock,
  Type,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { GeneratedMedia } from "@/types/video";

// Shot data type (from av-script worker)
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

// Content type options (same as Step5)
const CONTENT_TYPE_OPTIONS = [
  {
    value: "concept",
    label: "Concept",
    color: "bg-purple-900/50 text-purple-300",
  },
  {
    value: "list-item",
    label: "List Item",
    color: "bg-blue-900/50 text-blue-300",
  },
  {
    value: "comparison",
    label: "Comparison",
    color: "bg-amber-900/50 text-amber-300",
  },
  {
    value: "transition",
    label: "Transition",
    color: "bg-neutral-800 text-neutral-400",
  },
  {
    value: "emotional-beat",
    label: "Emotional Beat",
    color: "bg-rose-900/50 text-rose-300",
  },
] as const;

interface MediaEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  shot: ShotData | null;
  media: GeneratedMedia | null;
  onSave: (updatedMedia: GeneratedMedia) => void;
  onRegenerate?: (shotIndex: number) => void;
  isRegenerating?: boolean;
}

export function MediaEditModal({
  isOpen,
  onClose,
  shot,
  media,
  onSave,
  onRegenerate,
  isRegenerating = false,
}: MediaEditModalProps) {
  // Form state
  const [visualPrompt, setVisualPrompt] = useState("");
  const [mediaType, setMediaType] = useState<
    "image" | "video" | "motiongraphic"
  >("image");

  // Initialize form when shot/media changes
  useEffect(() => {
    if (shot && media) {
      setVisualPrompt(media.visual_prompt || shot.summary || "");
      setMediaType(media.media_type || shot.media_type || "image");
    } else if (shot) {
      setVisualPrompt(shot.summary || "");
      setMediaType(shot.media_type || "image");
    }
  }, [shot, media]);

  if (!shot) return null;

  const handleSave = () => {
    const updatedMedia: GeneratedMedia = {
      shot_index: shot.segment_index,
      media_type: mediaType,
      generation_status: media?.generation_status || "pending",
      media_url: media?.media_url,
      thumbnail_url: media?.thumbnail_url,
      visual_prompt: visualPrompt,
      generation_params: media?.generation_params,
      error_message: media?.error_message,
      created_at: media?.created_at,
      updated_at: new Date().toISOString(),
    };
    onSave(updatedMedia);
    onClose();
  };

  const handleRegenerate = () => {
    if (onRegenerate) {
      onRegenerate(shot.segment_index);
    }
  };

  // Get content type color
  const contentTypeOption = CONTENT_TYPE_OPTIONS.find(
    (opt) => opt.value === shot.content_type,
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-neutral-950 border-neutral-800 text-white sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="text-xs font-bold px-2 py-1 rounded bg-neutral-800 text-neutral-300 border border-neutral-700">
              SHOT {shot.segment_index + 1}
            </span>
            <span>Edit Visual Media</span>
          </DialogTitle>
          <DialogDescription className="text-neutral-400">
            Modify the visual prompt and media settings for this shot.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 my-4">
          {/* Timing Info Bar */}
          <div className="flex items-center gap-4 p-3 bg-neutral-900/50 rounded-lg border border-neutral-800">
            <div className="flex items-center gap-2 text-neutral-400">
              <Clock className="w-4 h-4" />
              <span className="text-sm">{shot.start_seconds.toFixed(1)}s</span>
            </div>
            <ChevronRight className="w-4 h-4 text-neutral-600" />
            <div className="text-sm text-neutral-400">
              {shot.end_seconds.toFixed(1)}s
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-neutral-500">Duration</span>
              <span className="text-sm font-mono text-neutral-300">
                {shot.duration_seconds.toFixed(1)}s
              </span>
            </div>
          </div>

          {/* Content Type Badge */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-neutral-400">Content Type:</span>
            <span
              className={cn(
                "text-xs font-medium px-3 py-1 rounded",
                contentTypeOption?.color || "bg-neutral-800 text-neutral-400",
              )}
            >
              {contentTypeOption?.label || shot.content_type}
            </span>
          </div>

          {/* Media Preview */}
          <div className="grid grid-cols-2 gap-4">
            {/* Current Media */}
            <div className="space-y-2">
              <Label className="text-neutral-400 text-xs uppercase tracking-wide">
                Current Media
              </Label>
              <div className="aspect-video bg-neutral-900 rounded-lg border border-neutral-800 overflow-hidden relative flex items-center justify-center">
                {media?.media_url ? (
                  <img
                    src={media.media_url}
                    alt={`Shot ${shot.segment_index + 1}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-neutral-600">
                    {mediaType === "video" ? (
                      <Film className="w-8 h-8" />
                    ) : mediaType === "motiongraphic" ? (
                      <Layers className="w-8 h-8" />
                    ) : (
                      <Image className="w-8 h-8" />
                    )}
                    <span className="text-xs">Not Generated</span>
                  </div>
                )}
                {media?.generation_status === "generating" && (
                  <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
                  </div>
                )}
              </div>
            </div>

            {/* Regenerate Panel */}
            <div className="space-y-2">
              <Label className="text-neutral-400 text-xs uppercase tracking-wide">
                Generation
              </Label>
              <div className="aspect-video bg-neutral-900/50 rounded-lg border border-dashed border-neutral-700 flex flex-col items-center justify-center gap-3 p-4">
                <Button
                  variant="secondary"
                  className="bg-orange-600 hover:bg-orange-700 text-white"
                  onClick={handleRegenerate}
                  disabled={isRegenerating}
                >
                  {isRegenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      {media?.media_url ? "Regenerate" : "Generate"}
                    </>
                  )}
                </Button>
                <p className="text-xs text-neutral-500 text-center">
                  Generate a new {mediaType} based on the prompt below
                </p>
              </div>
            </div>
          </div>

          {/* Visual Prompt */}
          <div className="space-y-2">
            <Label htmlFor="visual-prompt" className="text-neutral-300">
              Visual Prompt
            </Label>
            <Textarea
              id="visual-prompt"
              value={visualPrompt}
              onChange={(e) => setVisualPrompt(e.target.value)}
              className="bg-neutral-900 border-neutral-800 min-h-[120px] focus:ring-orange-600 text-white resize-none"
              placeholder="Describe what should be shown visually in this shot..."
            />
            <p className="text-xs text-neutral-500">
              Use @(EntityName) to reference characters, locations, or objects
              from your outline.
            </p>
          </div>

          {/* Media Type Selector */}
          <div className="space-y-2">
            <Label className="text-neutral-300">Media Type</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={mediaType === "image" ? "default" : "outline"}
                className={cn(
                  "flex-1",
                  mediaType === "image"
                    ? "bg-sky-600 hover:bg-sky-700 text-white"
                    : "border-neutral-700 text-neutral-400 hover:text-white hover:bg-neutral-800",
                )}
                onClick={() => setMediaType("image")}
              >
                <Image className="w-4 h-4 mr-2" />
                Image
              </Button>
              <Button
                type="button"
                variant={mediaType === "video" ? "default" : "outline"}
                className={cn(
                  "flex-1",
                  mediaType === "video"
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                    : "border-neutral-700 text-neutral-400 hover:text-white hover:bg-neutral-800",
                )}
                onClick={() => setMediaType("video")}
              >
                <Film className="w-4 h-4 mr-2" />
                Video
              </Button>
              <Button
                type="button"
                variant={mediaType === "motiongraphic" ? "default" : "outline"}
                className={cn(
                  "flex-1",
                  mediaType === "motiongraphic"
                    ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                    : "border-neutral-700 text-neutral-400 hover:text-white hover:bg-neutral-800",
                )}
                onClick={() => setMediaType("motiongraphic")}
              >
                <Layers className="w-4 h-4 mr-2" />
                Motion
              </Button>
            </div>
          </div>

          {/* Script Text (Read-only) */}
          <div className="space-y-2">
            <Label className="text-neutral-500 flex items-center gap-2">
              <Type className="w-3 h-3" />
              Script Text (read-only)
            </Label>
            <div className="p-3 bg-neutral-900/30 rounded-lg border border-neutral-800/50 text-sm text-neutral-400 max-h-24 overflow-y-auto">
              {shot.text}
            </div>
          </div>
        </div>

        <DialogFooter className="flex gap-2 justify-end pt-4 border-t border-neutral-800">
          <Button
            variant="ghost"
            onClick={onClose}
            className="text-neutral-300 hover:bg-neutral-800"
          >
            <X className="w-4 h-4 mr-2" />
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Check className="w-4 h-4 mr-2" />
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
