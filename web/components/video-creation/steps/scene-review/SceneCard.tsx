import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GripVertical, Sparkles, Video } from "lucide-react";

interface SceneCardProps {
  sceneNumber: number;
  imageUrl?: string;
  description: string;
  isSelected?: boolean;
  onSelect?: () => void;
  onEditImage?: () => void;
  onGenerateVideo?: () => void;
}

export function SceneCard({
  sceneNumber,
  imageUrl,
  description,
  isSelected,
  onSelect,
  onEditImage,
  onGenerateVideo,
}: SceneCardProps) {
  return (
    <div
      onClick={onSelect}
      className={cn(
        "flex-shrink-0 w-[400px] bg-neutral-900/50 border rounded-xl overflow-hidden transition-all duration-200 cursor-pointer group",
        isSelected
          ? "border-orange-500/50 ring-1 ring-orange-500/50"
          : "border-neutral-800 hover:border-neutral-700",
      )}
    >
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-2 border-b border-white/5">
        <GripVertical className="w-4 h-4 text-neutral-600" />
        <span className="text-sm font-medium text-neutral-300">
          Scene {sceneNumber}
        </span>
      </div>

      {/* Image Area */}
      <div className="relative aspect-video w-full bg-black/40 group-hover:bg-black/60 transition-colors">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={`Scene ${sceneNumber}`}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-neutral-700 font-mono text-xs">
              NO IMAGE GENERATED
            </div>
          </div>
        )}
      </div>

      {/* Actions Toolbar */}
      <div className="flex items-center gap-2 p-3 border-b border-white/5 bg-black/20">
        <Button
          size="sm"
          variant="secondary"
          className="h-8 text-xs gap-1.5 bg-blue-900/30 text-blue-400 hover:bg-blue-900/50 hover:text-blue-300 border border-blue-500/20"
          onClick={(e) => {
            e.stopPropagation();
            onEditImage?.();
          }}
        >
          <Sparkles className="w-3 h-3" />
          Edit Image
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="h-8 text-xs gap-1.5 bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-300 border border-white/5"
          onClick={(e) => {
            e.stopPropagation();
            onGenerateVideo?.();
          }}
        >
          <Video className="w-3 h-3" />
          Generate Video
        </Button>
      </div>

      {/* Description */}
      <div className="p-4">
        <p className="text-xs text-neutral-400 leading-relaxed line-clamp-4">
          {description}
        </p>
      </div>
    </div>
  );
}
