"use client";

/**
 * Media Preview Panel
 * ============================================================================
 * Full media gallery for a pipeline step — shows images, videos, and audio
 * with inline previews and playback controls.
 */

import { useState } from "react";
import type { StepMedia } from "../../types/pipeline-debugger";
import {
  Image as ImageIcon,
  Video,
  Music,
  X,
  ExternalLink,
  Maximize2,
  Download,
} from "lucide-react";

interface MediaPreviewPanelProps {
  media: StepMedia[];
  className?: string;
}

export function MediaPreviewPanel({
  media,
  className = "",
}: MediaPreviewPanelProps) {
  const [selectedMedia, setSelectedMedia] = useState<StepMedia | null>(null);

  if (media.length === 0) {
    return (
      <div className={`text-center py-8 text-neutral-500 text-sm ${className}`}>
        No media generated at this step.
      </div>
    );
  }

  const images = media.filter((m) => m.type === "image");
  const videos = media.filter((m) => m.type === "video");
  const audio = media.filter((m) => m.type === "audio");

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Summary bar */}
      <div className="flex items-center gap-4 text-xs">
        {images.length > 0 && (
          <span className="flex items-center gap-1 text-neutral-400">
            <ImageIcon className="w-3 h-3" /> {images.length} image{images.length !== 1 ? "s" : ""}
          </span>
        )}
        {videos.length > 0 && (
          <span className="flex items-center gap-1 text-neutral-400">
            <Video className="w-3 h-3" /> {videos.length} video{videos.length !== 1 ? "s" : ""}
          </span>
        )}
        {audio.length > 0 && (
          <span className="flex items-center gap-1 text-neutral-400">
            <Music className="w-3 h-3" /> {audio.length} audio
          </span>
        )}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {media.map((item) => (
          <MediaCard
            key={item.id}
            item={item}
            onClick={() => setSelectedMedia(item)}
          />
        ))}
      </div>

      {/* Expanded preview */}
      {selectedMedia && (
        <MediaLightbox
          item={selectedMedia}
          onClose={() => setSelectedMedia(null)}
        />
      )}
    </div>
  );
}

// ============================================================================
// MEDIA CARD
// ============================================================================

function MediaCard({
  item,
  onClick,
}: {
  item: StepMedia;
  onClick: () => void;
}) {
  const statusColor =
    item.generationStatus === "failed"
      ? "border-red-800"
      : item.generationStatus === "completed"
      ? "border-neutral-700"
      : "border-amber-800";

  return (
    <button
      onClick={onClick}
      className={`relative aspect-square rounded-lg border ${statusColor} bg-neutral-950 overflow-hidden group hover:ring-1 hover:ring-neutral-600 transition-all`}
    >
      {item.type === "image" && item.url ? (
        <img
          src={item.url}
          alt={item.label}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      ) : item.type === "video" ? (
        <div className="w-full h-full flex items-center justify-center">
          <Video className="w-8 h-8 text-neutral-600" />
        </div>
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <Music className="w-8 h-8 text-neutral-600" />
        </div>
      )}

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <Maximize2 className="w-5 h-5 text-white" />
      </div>

      {/* Label */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5">
        <span className="text-[10px] text-white font-medium truncate block">
          {item.label}
        </span>
      </div>

      {/* Error indicator */}
      {item.generationStatus === "failed" && (
        <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-500/80 flex items-center justify-center">
          <X className="w-2.5 h-2.5 text-white" />
        </div>
      )}
    </button>
  );
}

// ============================================================================
// LIGHTBOX
// ============================================================================

function MediaLightbox({
  item,
  onClose,
}: {
  item: StepMedia;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div
        className="absolute inset-0"
        onClick={onClose}
      />
      <div className="relative max-w-4xl max-h-[80vh] w-full mx-4 rounded-xl border border-neutral-700 bg-neutral-900 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-800">
          <div>
            <h4 className="text-sm font-medium text-white">{item.label}</h4>
            <span className="text-xs text-neutral-500 capitalize">{item.type}</span>
          </div>
          <div className="flex items-center gap-2">
            {item.url && (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
                title="Open in new tab"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 flex items-center justify-center max-h-[70vh] overflow-auto">
          {item.type === "image" && item.url ? (
            <img
              src={item.url}
              alt={item.label}
              className="max-w-full max-h-[60vh] object-contain rounded"
            />
          ) : item.type === "video" && item.url ? (
            <video
              src={item.url}
              controls
              className="max-w-full max-h-[60vh] rounded"
            />
          ) : item.type === "audio" && item.url ? (
            <div className="w-full max-w-md">
              <audio src={item.url} controls className="w-full" />
              {item.durationSeconds && (
                <p className="text-xs text-neutral-500 text-center mt-2">
                  Duration: {item.durationSeconds.toFixed(1)}s
                </p>
              )}
            </div>
          ) : (
            <div className="text-neutral-500 text-sm">No preview available</div>
          )}
        </div>
      </div>
    </div>
  );
}
