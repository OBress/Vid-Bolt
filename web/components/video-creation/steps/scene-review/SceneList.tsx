"use client";

import { useRef, useCallback } from "react";
import { SceneCard } from "./SceneCard";
import type { GeneratedMedia, RoutingTag, SoundEffect } from "@/types/video";

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
  // NEW: Routing tags from Step 5
  visual_source?: 'ai_video' | 'motiongraphic';
  visual_description?: string;
  visual_elements?: RoutingTag[];
  sound_effects?: SoundEffect[];
}

interface SceneListProps {
  shots: ShotData[];
  mediaMap: Map<number, GeneratedMedia>;
  selectedShotIndex?: number;
  pendingChanges: Map<number, GeneratedMedia>;
  onSelectShot: (index: number) => void;
  onEditShot: (index: number) => void;
  onGenerateShot: (index: number) => void;
}

export function SceneList({
  shots,
  mediaMap,
  selectedShotIndex,
  pendingChanges,
  onSelectShot,
  onEditShot,
  onGenerateShot,
}: SceneListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Convert vertical scroll to horizontal scroll
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (scrollContainerRef.current && e.deltaY !== 0) {
      e.preventDefault();
      scrollContainerRef.current.scrollLeft += e.deltaY;
    }
  }, []);

  if (shots.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0a0a0a] p-8">
        <div className="text-center text-neutral-500">
          <p className="text-lg font-medium mb-2">No shots available</p>
          <p className="text-sm">
            Shot data will appear here after generation in Step 5
          </p>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={scrollContainerRef}
      className="w-full h-full bg-[#0a0a0a] overflow-x-auto overflow-y-hidden"
      onWheel={handleWheel}
    >
      <div className="flex gap-4 p-8 min-w-max">
        {shots.map((shot) => {
          // Check pending changes first, then existing media
          const media =
            pendingChanges.get(shot.segment_index) ||
            mediaMap.get(shot.segment_index);
          const hasPendingChanges = pendingChanges.has(shot.segment_index);

          return (
            <SceneCard
              key={shot.segment_index}
              shot={shot}
              media={media}
              isSelected={selectedShotIndex === shot.segment_index}
              hasPendingChanges={hasPendingChanges}
              onSelect={() => onSelectShot(shot.segment_index)}
              onEdit={() => onEditShot(shot.segment_index)}
              onGenerate={() => onGenerateShot(shot.segment_index)}
            />
          );
        })}
      </div>
    </div>
  );
}
