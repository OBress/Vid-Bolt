import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { ChevronRight, Compass, GripVertical, Wand2 } from "lucide-react";

interface SceneReviewSidebarProps {
  selectedSceneNumber?: number;
  className?: string;
}

export function SceneReviewSidebar({
  selectedSceneNumber = 1,
  className,
}: SceneReviewSidebarProps) {
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
          <GripVertical className="w-4 h-4 text-neutral-500" />
          <h2 className="text-lg font-bold text-white">
            Scene {selectedSceneNumber}
          </h2>
        </div>
        <p className="text-sm text-neutral-500 pl-6">Scene description</p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {/* Location Control */}
          <button className="w-full flex items-center justify-between p-3 rounded-lg bg-neutral-900 border border-neutral-800 hover:border-neutral-700 transition-colors group text-left">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full border border-neutral-700 flex items-center justify-center text-neutral-500 group-hover:text-neutral-300 group-hover:border-neutral-500 transition-colors">
                <Compass className="w-3 h-3" />
              </div>
              <span className="text-xs font-bold tracking-wider text-neutral-300 group-hover:text-white uppercase">
                Location
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full border border-neutral-600" />
              <ChevronRight className="w-3 h-3 text-neutral-600 group-hover:text-neutral-400" />
            </div>
          </button>

          {/* Style Control */}
          <button className="w-full flex items-center justify-between p-3 rounded-lg bg-neutral-900 border border-neutral-800 hover:border-neutral-700 transition-colors group text-left">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full border border-neutral-700 flex items-center justify-center text-neutral-500 group-hover:text-neutral-300 group-hover:border-neutral-500 transition-colors">
                <Wand2 className="w-3 h-3" />
              </div>
              <span className="text-xs font-bold tracking-wider text-neutral-300 group-hover:text-white uppercase">
                Style
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full border border-neutral-600" />
              <ChevronRight className="w-3 h-3 text-neutral-600 group-hover:text-neutral-400" />
            </div>
          </button>
        </div>
      </ScrollArea>
    </div>
  );
}
