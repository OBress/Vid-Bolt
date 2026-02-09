"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
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
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { GeneratedMedia, KeyframeData, MediaItem } from "@/types/video";
import { KeyframeThumbnail } from "./KeyframeThumbnail";
import { KeyframeEditPopup } from "./KeyframeEditPopup";
import { TypeChangeConfirmDialog } from "./TypeChangeConfirmDialog";

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
  videoId: string;
  shot: ShotData | null;
  media: GeneratedMedia | null;
  onSave: (updatedMedia: GeneratedMedia) => void;
  onRegenerate?: (shotIndex: number) => void;
  isRegenerating?: boolean;
}

export function MediaEditModal({
  isOpen,
  onClose,
  videoId,
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
  
  // Keyframe state for video shots
  const [keyframes, setKeyframes] = useState<{
    start?: KeyframeData;
    end?: KeyframeData;
  }>({});
  const [keyframeEditing, setKeyframeEditing] = useState<"start" | "end" | null>(null);
  const [isKeyframeRegenerating, setIsKeyframeRegenerating] = useState(false);
  const [availableLoras, setAvailableLoras] = useState<string[]>([]);
  
  // Multi-image state
  const [selectedItemIndex, setSelectedItemIndex] = useState(0);
  const isMultiImage = !!(media?.media_items && media.media_items.length > 1);
  const selectedItem: MediaItem | undefined = isMultiImage
    ? media?.media_items?.[selectedItemIndex]
    : undefined;
  // For multi-image: use selected item's URL; for single: use primary media_url
  const displayUrl = selectedItem?.media_url || media?.media_url;
  
  // Session tracking for cleanup on cancel
  const [originalType, setOriginalType] = useState<string | null>(null);
  const pendingUrls = useRef<Set<string>>(new Set());
  const [showTypeChangeDialog, setShowTypeChangeDialog] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  
  // Fetch available LORAs
  useEffect(() => {
    async function fetchLoras() {
      try {
        const response = await fetch("/api/loras");
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.loras) {
            setAvailableLoras(data.loras.map((l: { name: string }) => l.name));
          }
        }
      } catch (error) {
        console.error("Failed to fetch LORAs:", error);
      }
    }
    fetchLoras();
  }, []);

  // Initialize form when shot/media changes
  useEffect(() => {
    if (shot && media) {
      setVisualPrompt(media.visual_prompt || shot.summary || "");
      setMediaType(media.media_type || shot.media_type || "image");
      setKeyframes(media.keyframes || {});
      setOriginalType(media.media_type || shot.media_type || "image");
      setSelectedItemIndex(0);
    } else if (shot) {
      setVisualPrompt(shot.summary || "");
      setMediaType(shot.media_type || "image");
      setKeyframes({});
      setOriginalType(shot.media_type || "image");
      setSelectedItemIndex(0);
    }
    // Reset pending URLs when modal opens with new shot
    pendingUrls.current = new Set();
  }, [shot, media]);

  // Cleanup function for pending URLs
  const cleanupPendingUrls = useCallback(async (urlsToDelete: string[]) => {
    if (urlsToDelete.length === 0) return;
    
    try {
      const response = await fetch("/api/media/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urls: urlsToDelete,
          videoId,
        }),
      });
      const result = await response.json();
      console.log("[MediaEditModal] Cleanup result:", result);
    } catch (error) {
      console.error("[MediaEditModal] Cleanup failed:", error);
    }
  }, [videoId]);

  // Handle cancel - cleanup any unsaved pending URLs
  const handleCancel = useCallback(async () => {
    const urlsToCleanup = Array.from(pendingUrls.current);
    if (urlsToCleanup.length > 0) {
      setIsCleaning(true);
      await cleanupPendingUrls(urlsToCleanup);
      setIsCleaning(false);
    }
    pendingUrls.current = new Set();
    onClose();
  }, [cleanupPendingUrls, onClose]);

  // Early return if no shot - must be after all hooks
  if (!shot) return null;

  // Collect URLs to delete when type changes
  const getUrlsToDeleteOnTypeChange = (): string[] => {
    const urls: string[] = [];
    
    // If there's existing media and type changed, queue for deletion
    if (media?.media_url) {
      urls.push(media.media_url);
    }
    if (media?.thumbnail_url) {
      urls.push(media.thumbnail_url);
    }
    
    // If switching away from video, also delete keyframe images
    if (originalType === "video" && mediaType !== "video") {
      if (keyframes.start?.image_url) urls.push(keyframes.start.image_url);
      if (keyframes.end?.image_url) urls.push(keyframes.end.image_url);
    }
    
    return urls;
  };

  // Perform the actual save
  const performSave = async (deleteUrls: string[] = []) => {
    // Clean up old media if type changed
    if (deleteUrls.length > 0) {
      await cleanupPendingUrls(deleteUrls);
    }
    
    // Clean up any unused pending URLs (new generations not being kept)
    const unusedPending = Array.from(pendingUrls.current).filter(
      url => url !== media?.media_url
    );
    if (unusedPending.length > 0) {
      await cleanupPendingUrls(unusedPending);
    }
    
    const updatedMedia: GeneratedMedia = {
      shot_index: shot.segment_index,
      media_type: mediaType,
      // Reset status if type changed and had media
      generation_status: mediaType !== originalType && media?.media_url 
        ? "pending" 
        : (media?.generation_status || "pending"),
      // Clear media URL if type changed
      media_url: mediaType !== originalType && media?.media_url 
        ? undefined 
        : media?.media_url,
      thumbnail_url: mediaType !== originalType && media?.media_url 
        ? undefined 
        : media?.thumbnail_url,
      visual_prompt: visualPrompt,
      generation_params: media?.generation_params,
      // Clear keyframes if switching away from video
      keyframes: mediaType === "video" && keyframes.start ? {
        start: keyframes.start,
        end: keyframes.end,
      } : undefined,
      error_message: media?.error_message,
      created_at: media?.created_at,
      updated_at: new Date().toISOString(),
    };
    
    pendingUrls.current = new Set();
    onSave(updatedMedia);
    setShowTypeChangeDialog(false);
    onClose();
  };

  const handleSave = () => {
    // Check if type changed and has existing media
    const typeChanged = mediaType !== originalType;
    const hasExistingMedia = !!media?.media_url;
    const hasKeyframeImages = !!(keyframes.start?.image_url || keyframes.end?.image_url);
    
    if (typeChanged && (hasExistingMedia || hasKeyframeImages)) {
      // Show confirmation dialog
      setShowTypeChangeDialog(true);
    } else {
      // No type change or no media to delete, save directly
      performSave();
    }
  };
  
  const handleTypeChangeConfirm = () => {
    const urlsToDelete = getUrlsToDeleteOnTypeChange();
    performSave(urlsToDelete);
  };
  
  // Handle keyframe save from popup
  const handleKeyframeSave = (data: KeyframeData) => {
    if (keyframeEditing === "start") {
      setKeyframes((prev) => ({ ...prev, start: data }));
    } else if (keyframeEditing === "end") {
      setKeyframes((prev) => ({ ...prev, end: data }));
    }
    setKeyframeEditing(null);
  };
  
  // Handle keyframe regeneration - call the API
  const handleKeyframeRegenerate = async (data: KeyframeData) => {
    if (!shot || !keyframeEditing) return;
    
    setIsKeyframeRegenerating(true);
    
    // Update state to show generating
    const frameType = keyframeEditing;
    setKeyframes((prev) => ({
      ...prev,
      [frameType]: { ...data, generation_status: "generating" },
    }));
    
    try {
      const response = await fetch("/api/keyframe/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId,
          shotIndex: shot.segment_index,
          frameType,
          prompt: data.prompt,
          loraName: data.generation_params?.lora_name,
          loraWeight: data.generation_params?.lora_weight,
          seed: data.generation_params?.seed,
          aspectRatio: data.generation_params?.aspect_ratio,
        }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Update with the expected image URL (will be available after webhook)
        setKeyframes((prev) => ({
          ...prev,
          [frameType]: {
            ...data,
            image_url: result.imageUrl,
            generation_status: "generating", // Will be updated by webhook
          },
        }));
      } else {
        // Mark as failed
        setKeyframes((prev) => ({
          ...prev,
          [frameType]: {
            ...data,
            generation_status: "failed",
            error_message: result.error || "Generation failed",
          },
        }));
      }
    } catch (error) {
      console.error("Keyframe regeneration failed:", error);
      setKeyframes((prev) => ({
        ...prev,
        [frameType]: {
          ...data,
          generation_status: "failed",
          error_message: "Network error",
        },
      }));
    } finally {
      setIsKeyframeRegenerating(false);
    }
  };
  
  // Check if video can be regenerated (needs start keyframe)
  const canRegenerateVideo = mediaType !== "video" || keyframes.start?.image_url;

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
      <DialogContent className="bg-neutral-950 border-neutral-800 text-white sm:max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
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

        <div className="flex-1 overflow-y-auto">
        <div className="space-y-6 my-4">
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
                {isMultiImage ? `Media (${media?.media_items?.length} items)` : 'Current Media'}
              </Label>
              
              {/* Multi-image thumbnail strip */}
              {isMultiImage && media?.media_items && (
                <div className="flex gap-1.5 overflow-x-auto pb-1.5 no-scrollbar">
                  {media.media_items.map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedItemIndex(idx)}
                      className={cn(
                        "relative flex-shrink-0 w-16 h-12 rounded-md overflow-hidden border-2 transition-all",
                        selectedItemIndex === idx
                          ? "border-orange-500 ring-1 ring-orange-500/50"
                          : "border-neutral-700 hover:border-neutral-500",
                      )}
                    >
                      {item.media_url ? (
                        <img
                          src={item.media_url}
                          alt={`Item ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-neutral-800 flex items-center justify-center">
                          <Image className="w-4 h-4 text-neutral-600" />
                        </div>
                      )}
                      {/* Source badge */}
                      <span
                        className={cn(
                          "absolute bottom-0.5 right-0.5 text-[7px] font-bold px-1 py-px rounded",
                          item.source === 'stock'
                            ? "bg-blue-600/80 text-blue-100"
                            : "bg-purple-600/80 text-purple-100",
                        )}
                      >
                        {item.source === 'stock' ? 'S' : 'AI'}
                      </span>
                      {/* Status indicator */}
                      {item.generation_status === 'failed' && (
                        <div className="absolute inset-0 bg-red-900/40 flex items-center justify-center">
                          <X className="w-3 h-3 text-red-400" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
              
              <div className="aspect-video bg-neutral-900 rounded-lg border border-neutral-800 overflow-hidden relative flex items-center justify-center">
                {displayUrl ? (
                  mediaType === "video" && !isMultiImage ? (
                    <video
                      src={displayUrl}
                      controls
                      className="w-full h-full object-contain bg-black"
                      poster={media?.thumbnail_url}
                    />
                  ) : (
                    <img
                      src={displayUrl}
                      alt={`Shot ${shot.segment_index + 1}${isMultiImage ? ` - Item ${selectedItemIndex + 1}` : ''}`}
                      className="w-full h-full object-cover"
                    />
                  )
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
                {/* Selected item info overlay for multi-image */}
                {isMultiImage && selectedItem && (
                  <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-gradient-to-t from-black/80 to-transparent">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-neutral-300">
                        {selectedItemIndex + 1}/{media?.media_items?.length}
                        {' · '}
                        {selectedItem.source === 'stock' ? 'Stock' : 'AI Generated'}
                      </span>
                      <span className={cn(
                        "text-[10px] font-medium",
                        selectedItem.generation_status === 'completed' ? 'text-emerald-400' :
                        selectedItem.generation_status === 'failed' ? 'text-red-400' : 'text-neutral-400'
                      )}>
                        {selectedItem.generation_status}
                      </span>
                    </div>
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
                  className={cn(
                    "text-white",
                    canRegenerateVideo
                      ? "bg-orange-600 hover:bg-orange-700"
                      : "bg-neutral-700 cursor-not-allowed",
                  )}
                  onClick={handleRegenerate}
                  disabled={isRegenerating || !canRegenerateVideo}
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
                  {mediaType === "video" && !canRegenerateVideo
                    ? "Configure start frame first"
                    : `Generate a new ${mediaType} based on the prompt below`}
                </p>
              </div>
            </div>
          </div>

          {/* Keyframe Section for Video Shots */}
          {mediaType === "video" && (
            <div className="space-y-3 p-4 bg-neutral-900/50 rounded-lg border border-neutral-800">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-orange-500" />
                <Label className="text-neutral-300 text-sm font-medium">Keyframes</Label>
              </div>
              <p className="text-xs text-neutral-500">
                Configure start/end frames for video generation. Start frame is required.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <KeyframeThumbnail
                  label="Start Frame"
                  imageUrl={keyframes.start?.image_url}
                  prompt={keyframes.start?.prompt}
                  status={keyframes.start?.generation_status}
                  onClick={() => setKeyframeEditing("start")}
                />
                <KeyframeThumbnail
                  label="End Frame"
                  imageUrl={keyframes.end?.image_url}
                  prompt={keyframes.end?.prompt}
                  status={keyframes.end?.generation_status}
                  optional
                  onClick={() => setKeyframeEditing("end")}
                />
              </div>
              {!keyframes.start?.image_url && (
                <p className="text-xs text-amber-500 flex items-center gap-1">
                  ⚠️ Start frame required before generating video
                </p>
              )}
            </div>
          )}

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
        </div>

        <DialogFooter className="flex-shrink-0 flex gap-2 justify-end pt-4 border-t border-neutral-800 bg-neutral-950">
          <Button
            variant="ghost"
            onClick={handleCancel}
            disabled={isCleaning}
            className="text-neutral-300 hover:bg-neutral-800"
          >
            {isCleaning ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Cleaning...
              </>
            ) : (
              <>
                <X className="w-4 h-4 mr-2" />
                Cancel
              </>
            )}
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
      
      {/* Keyframe Edit Popup */}
      <KeyframeEditPopup
        isOpen={keyframeEditing !== null}
        onClose={() => setKeyframeEditing(null)}
        frameType={keyframeEditing || "start"}
        keyframeData={
          keyframeEditing === "start"
            ? keyframes.start
            : keyframes.end
        }
        onSave={handleKeyframeSave}
        onRegenerate={handleKeyframeRegenerate}
        isRegenerating={isKeyframeRegenerating}
        availableLoras={availableLoras}
      />
      
      {/* Type Change Confirmation Dialog */}
      <TypeChangeConfirmDialog
        isOpen={showTypeChangeDialog}
        onCancel={() => setShowTypeChangeDialog(false)}
        onConfirm={handleTypeChangeConfirm}
        fromType={originalType || "image"}
        toType={mediaType}
        hasKeyframes={originalType === "video" && (!!keyframes.start?.image_url || !!keyframes.end?.image_url)}
      />
    </Dialog>
  );
}
