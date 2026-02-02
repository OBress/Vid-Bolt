"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  GripVertical,
  Sparkles,
  Play,
  Image,
  Film,
  Layers,
  Loader2,
  AlertCircle,
  Clock,
  Edit2,
  CheckCircle2,
} from "lucide-react";
import type { GeneratedMedia, RoutingTag } from "@/types/video";
import { ROUTING_TAG_CONFIG } from "@/types/video";

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
  // NEW: Descriptive visual intent
  visual_description?: string;
  visual_elements?: RoutingTag[];
  // Sound effects with millisecond-precise timing
  sound_effects?: import("@/types/video").SoundEffect[];
}

// Content type colors
const CONTENT_TYPE_COLORS: Record<string, string> = {
  concept: "bg-purple-900/50 text-purple-300 border-purple-700/50",
  "list-item": "bg-blue-900/50 text-blue-300 border-blue-700/50",
  comparison: "bg-amber-900/50 text-amber-300 border-amber-700/50",
  transition: "bg-neutral-800 text-neutral-400 border-neutral-700",
  "emotional-beat": "bg-rose-900/50 text-rose-300 border-rose-700/50",
};

// Placeholder gradients by media type
const PLACEHOLDER_GRADIENTS: Record<string, string> = {
  image: "from-sky-900/40 to-sky-800/20",
  video: "from-emerald-900/40 to-emerald-800/20",
  motiongraphic: "from-indigo-900/40 to-indigo-800/20",
};

interface SceneCardProps {
  shot: ShotData;
  media?: GeneratedMedia;
  isSelected?: boolean;
  hasPendingChanges?: boolean;
  onSelect?: () => void;
  onEdit?: () => void;
  onGenerate?: () => void;
}

export function SceneCard({
  shot,
  media,
  isSelected,
  hasPendingChanges = false,
  onSelect,
  onEdit,
  onGenerate,
}: SceneCardProps) {
  const mediaType = media?.media_type || shot.media_type || "image";
  const status = media?.generation_status || "pending";
  const hasMedia = !!media?.media_url;

  // Format duration as m:ss
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return mins > 0
      ? `${mins}:${secs.toString().padStart(2, "0")}`
      : `${secs}s`;
  };

  return (
    <div
      onClick={onSelect}
      className={cn(
        "flex-shrink-0 w-[340px] bg-neutral-900/50 border rounded-xl overflow-hidden transition-all duration-200 cursor-pointer group",
        isSelected
          ? "border-orange-500/50 ring-1 ring-orange-500/50"
          : hasPendingChanges
            ? "border-amber-500/50 ring-1 ring-amber-500/30"
            : "border-neutral-800 hover:border-neutral-700",
      )}
    >
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-2 border-b border-white/5 bg-neutral-900/30">
        <GripVertical className="w-4 h-4 text-neutral-600" />
        <span className="text-sm font-medium text-neutral-300">
          Shot {shot.segment_index + 1}
        </span>

        {/* Duration badge */}
        <div className="ml-auto flex items-center gap-1.5 text-neutral-500">
          <Clock className="w-3 h-3" />
          <span className="text-xs font-mono">
            {formatDuration(shot.duration_seconds)}
          </span>
        </div>

        {/* Status indicator */}
        {status === "completed" && hasMedia && (
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        )}
        {status === "generating" && (
          <Loader2 className="w-4 h-4 text-orange-500 animate-spin" />
        )}
        {status === "failed" && (
          <AlertCircle className="w-4 h-4 text-red-500" />
        )}
        {hasPendingChanges && (
          <span className="text-[9px] font-bold text-amber-400 bg-amber-900/30 px-1.5 py-0.5 rounded">
            EDITED
          </span>
        )}
      </div>

      {/* Image/Video Area */}
      <div className="relative aspect-video w-full bg-black/40">
        {hasMedia && media?.media_url ? (
          // Show generated media
          <img
            src={media.media_url}
            alt={`Shot ${shot.segment_index + 1}`}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          // Placeholder with gradient based on media type
          <div
            className={cn(
              "absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br",
              PLACEHOLDER_GRADIENTS[mediaType] || PLACEHOLDER_GRADIENTS.image,
            )}
          >
            {status === "generating" ? (
              <>
                <Loader2 className="w-10 h-10 text-orange-500 animate-spin" />
                <span className="text-xs text-neutral-400">Generating...</span>
              </>
            ) : status === "failed" ? (
              <>
                <AlertCircle className="w-10 h-10 text-red-500" />
                <span className="text-xs text-red-400">Generation Failed</span>
              </>
            ) : (
              <>
                {mediaType === "video" ? (
                  <Film className="w-10 h-10 text-neutral-600" />
                ) : mediaType === "motiongraphic" ? (
                  <Layers className="w-10 h-10 text-neutral-600" />
                ) : (
                  <Image className="w-10 h-10 text-neutral-600" />
                )}
                {/* Show visual_elements routing tags if available (filter out audio tags) */}
                {shot.visual_elements && shot.visual_elements.length > 0 ? (
                  <div className="flex flex-wrap gap-1 justify-center" title={shot.visual_description}>
                    {shot.visual_elements
                      .filter(tag => !['sound_effects', 'music'].includes(tag))
                      .slice(0, 2)
                      .map((tag) => {
                        const config = ROUTING_TAG_CONFIG[tag];
                        return (
                          <span 
                            key={tag}
                            className={cn("text-[9px] font-medium px-1.5 py-0.5 rounded", config?.style || "bg-neutral-800 text-neutral-300")}
                          >
                            {config?.label || tag}
                          </span>
                        );
                      })}
                  </div>
                ) : (
                  <span className="text-xs text-neutral-500 font-medium uppercase tracking-wide">
                    {mediaType === "motiongraphic" ? "Motion Graphic" : mediaType}
                  </span>
                )}
                
                {/* Audio Indicator - Descriptive Sound Effects */}
                {shot.sound_effects && shot.sound_effects.length > 0 && (
                  <div 
                    className="flex items-center gap-1 mt-1.5 justify-center flex-wrap"
                    title={shot.sound_effects.map(sfx => 
                      `${sfx.type}${sfx.anchor_word ? ` @ "${sfx.anchor_word}"` : ''}`
                    ).join(', ')}
                  >
                    {shot.sound_effects.slice(0, 2).map((sfx, idx) => (
                      <span 
                        key={idx}
                        className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-emerald-900/70 text-emerald-300 flex items-center gap-0.5"
                      >
                        <span>🔊</span>
                        <span>{sfx.type}</span>
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Hover overlay with actions */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            className="bg-white/10 hover:bg-white/20 text-white border-0"
            onClick={(e) => {
              e.stopPropagation();
              onEdit?.();
            }}
          >
            <Edit2 className="w-3.5 h-3.5 mr-1" />
            Edit
          </Button>
          <Button
            size="sm"
            className="bg-orange-600 hover:bg-orange-700 text-white"
            onClick={(e) => {
              e.stopPropagation();
              onGenerate?.();
            }}
            disabled={status === "generating"}
          >
            {status === "generating" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 mr-1" />
                {hasMedia ? "Regen" : "Generate"}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Content Type & Routing Tag Badges */}
      <div className="flex items-center gap-2 p-3 border-b border-white/5 bg-neutral-900/20">
        {/* Content type badge */}
        <span
          className={cn(
            "text-[10px] font-medium px-2 py-1 rounded border",
            CONTENT_TYPE_COLORS[shot.content_type] ||
              "bg-neutral-800 text-neutral-400",
          )}
        >
          {shot.content_type}
        </span>

        {/* Routing tag badges - show visual_elements or fall back to media_type */}
        {shot.visual_elements && shot.visual_elements.length > 0 ? (
          shot.visual_elements
            .filter(tag => !['sound_effects', 'music'].includes(tag))
            .slice(0, 2)
            .map((tag) => {
              const config = ROUTING_TAG_CONFIG[tag];
              return (
                <span
                  key={tag}
                  className={cn(
                    "text-[10px] font-medium px-2 py-1 rounded",
                    config?.style || "bg-neutral-800 text-neutral-300"
                  )}
                  title={shot.visual_description}
                >
                  {config?.label || tag}
                </span>
              );
            })
        ) : (
          <span
            className={cn(
              "text-[10px] font-medium px-2 py-1 rounded border",
              mediaType === "image"
                ? "bg-sky-900/30 text-sky-300 border-sky-700/50"
                : mediaType === "video"
                  ? "bg-emerald-900/30 text-emerald-300 border-emerald-700/50"
                  : "bg-indigo-900/30 text-indigo-300 border-indigo-700/50",
            )}
          >
            {mediaType === "motiongraphic" ? "motion" : mediaType}
          </span>
        )}
        
        {/* Audio indicator for sound effects */}
        {shot.sound_effects && shot.sound_effects.length > 0 && (
          <span 
            className="text-[10px] font-medium px-2 py-1 rounded bg-emerald-900/50 text-emerald-300"
            title={shot.sound_effects.map(sfx => sfx.type).join(', ')}
          >
            🔊 {shot.sound_effects.length} SFX
          </span>
        )}

        {/* Video play icon for video type */}
        {mediaType === "video" && hasMedia && (
          <Play className="w-3 h-3 text-neutral-500 ml-auto" />
        )}
      </div>

      {/* Summary/Description */}
      <div className="p-4">
        <p className="text-xs text-neutral-400 leading-relaxed line-clamp-3">
          {media?.visual_prompt || shot.summary || shot.text.substring(0, 150)}
          {!media?.visual_prompt &&
            !shot.summary &&
            shot.text.length > 150 &&
            "..."}
        </p>
      </div>
    </div>
  );
}
