"use client";

import React from "react";
import { Image, Plus, Loader2, AlertTriangle, Check, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

interface KeyframeThumbnailProps {
  label: string;
  imageUrl?: string;
  prompt?: string; // Show configured state if prompt exists
  status?: "pending" | "generating" | "completed" | "failed";
  optional?: boolean;
  onClick?: () => void;
}

/**
 * Thumbnail component for displaying keyframe preview
 * Shows the keyframe image, generation status, configured state, or placeholder
 */
export function KeyframeThumbnail({
  label,
  imageUrl,
  prompt,
  status,
  optional = false,
  onClick,
}: KeyframeThumbnailProps) {
  const hasImage = imageUrl && status === "completed";
  const isGenerating = status === "generating";
  const isFailed = status === "failed";
  const isConfigured = !hasImage && !isGenerating && !isFailed && prompt;
  const isEmpty = !imageUrl && !prompt && (!status || status === "pending");

  return (
    <div
      className={cn(
        "relative rounded-lg overflow-hidden cursor-pointer transition-all",
        "border-2 border-dashed",
        hasImage
          ? "border-transparent"
          : isConfigured
            ? "border-orange-600/50 hover:border-orange-500"
            : isEmpty
              ? "border-neutral-700 hover:border-neutral-500"
              : isFailed
                ? "border-red-800 hover:border-red-600"
                : "border-neutral-700",
        onClick && "hover:ring-2 ring-orange-500/50",
      )}
      onClick={onClick}
    >
      {/* Image or placeholder */}
      <div className="aspect-video bg-neutral-900 flex items-center justify-center">
        {hasImage ? (
          <img
            src={imageUrl}
            alt={label}
            className="w-full h-full object-cover"
          />
        ) : isGenerating ? (
          <div className="flex flex-col items-center gap-2 text-neutral-500">
            <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
            <span className="text-xs">Generating...</span>
          </div>
        ) : isFailed ? (
          <div className="flex flex-col items-center gap-2 text-red-400">
            <AlertTriangle className="w-6 h-6" />
            <span className="text-xs">Failed</span>
          </div>
        ) : isConfigured ? (
          <div className="flex flex-col items-center gap-2 text-orange-400 px-3">
            <Settings className="w-6 h-6" />
            <span className="text-xs text-center">Configured</span>
            <span className="text-[10px] text-neutral-500 text-center line-clamp-2">
              {prompt.length > 60 ? prompt.slice(0, 60) + "..." : prompt}
            </span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-neutral-600">
            {optional ? (
              <>
                <Plus className="w-6 h-6" />
                <span className="text-xs">Add {label}</span>
              </>
            ) : (
              <>
                <Image className="w-6 h-6" />
                <span className="text-xs">Click to configure</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Label bar */}
      <div
        className={cn(
          "absolute bottom-0 left-0 right-0 px-2 py-1 text-xs font-medium",
          "bg-gradient-to-t from-black/80 to-transparent",
          hasImage || isConfigured ? "text-white" : "text-neutral-400",
        )}
      >
        <div className="flex items-center justify-between">
          <span>{label}</span>
          {hasImage && <Check className="w-3 h-3 text-green-400" />}
          {isConfigured && <Check className="w-3 h-3 text-orange-400" />}
          {optional && isEmpty && (
            <span className="text-neutral-500">(optional)</span>
          )}
        </div>
      </div>
    </div>
  );
}

