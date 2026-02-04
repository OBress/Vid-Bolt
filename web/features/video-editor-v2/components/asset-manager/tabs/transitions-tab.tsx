/**
 * TransitionsTab - Video transition presets
 * 
 * Features:
 * - Browse transition effects
 * - Preview transitions
 * - Apply to clips
 */

import React, { useState, useCallback } from "react";
import { cn } from "../../../utils/general/utils";
import { ScrollArea } from "../../ui/scroll-area";
import { Button } from "../../ui/button";
import { VideoTransitionType } from "../../../types";
import { 
  startVideoTransitionDrag, 
  endDrag 
} from "../../../stores/video-editor-store";
import {
  ArrowRight,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Circle,
  Square,
  ZoomIn,
  ZoomOut,
  Sparkles,
  RotateCcw,
  Layers,
} from "lucide-react";

// ==========================================
// TYPES
// ==========================================

interface TransitionPreset {
  id: string;
  type: VideoTransitionType;
  name: string;
  description: string;
  icon: React.ElementType;
  category: 'fade' | 'wipe' | 'slide' | 'zoom' | 'other';
}

// ==========================================
// TRANSITION PRESETS
// ==========================================

const TRANSITION_PRESETS: TransitionPreset[] = [
  // Fade transitions
  {
    id: 'fade',
    type: VideoTransitionType.FADE,
    name: 'Fade',
    description: 'Simple fade in/out',
    icon: Circle,
    category: 'fade',
  },
  {
    id: 'crossfade',
    type: VideoTransitionType.CROSSFADE,
    name: 'Crossfade',
    description: 'Blend between clips',
    icon: Layers,
    category: 'fade',
  },
  {
    id: 'fade-black',
    type: VideoTransitionType.FADE_TO_BLACK,
    name: 'Fade to Black',
    description: 'Fade through black',
    icon: Square,
    category: 'fade',
  },
  
  // Wipe transitions
  {
    id: 'wipe-left',
    type: VideoTransitionType.WIPE_LEFT,
    name: 'Wipe Left',
    description: 'Wipe from right to left',
    icon: ArrowLeft,
    category: 'wipe',
  },
  {
    id: 'wipe-right',
    type: VideoTransitionType.WIPE_RIGHT,
    name: 'Wipe Right',
    description: 'Wipe from left to right',
    icon: ArrowRight,
    category: 'wipe',
  },
  {
    id: 'wipe-up',
    type: VideoTransitionType.WIPE_UP,
    name: 'Wipe Up',
    description: 'Wipe from bottom to top',
    icon: ArrowUp,
    category: 'wipe',
  },
  {
    id: 'wipe-down',
    type: VideoTransitionType.WIPE_DOWN,
    name: 'Wipe Down',
    description: 'Wipe from top to bottom',
    icon: ArrowDown,
    category: 'wipe',
  },
  
  // Slide transitions
  {
    id: 'slide-left',
    type: VideoTransitionType.SLIDE_LEFT,
    name: 'Slide Left',
    description: 'Push from right',
    icon: ArrowLeft,
    category: 'slide',
  },
  {
    id: 'slide-right',
    type: VideoTransitionType.SLIDE_RIGHT,
    name: 'Slide Right',
    description: 'Push from left',
    icon: ArrowRight,
    category: 'slide',
  },
  
  // Zoom transitions
  {
    id: 'zoom-in',
    type: VideoTransitionType.ZOOM_IN,
    name: 'Zoom In',
    description: 'Zoom into next clip',
    icon: ZoomIn,
    category: 'zoom',
  },
  {
    id: 'zoom-out',
    type: VideoTransitionType.ZOOM_OUT,
    name: 'Zoom Out',
    description: 'Zoom out to next clip',
    icon: ZoomOut,
    category: 'zoom',
  },
  
  // Other
  {
    id: 'dissolve',
    type: VideoTransitionType.DISSOLVE,
    name: 'Dissolve',
    description: 'Pixelated dissolve effect',
    icon: Sparkles,
    category: 'other',
  },
  {
    id: 'flip-h',
    type: VideoTransitionType.FLIP_HORIZONTAL,
    name: 'Flip Horizontal',
    description: '3D horizontal flip',
    icon: RotateCcw,
    category: 'other',
  },
];

// ==========================================
// TRANSITION CARD COMPONENT
// ==========================================

interface TransitionCardProps {
  preset: TransitionPreset;
  onSelect: () => void;
}

const TransitionCard: React.FC<TransitionCardProps> = ({ preset, onSelect }) => {
  const Icon = preset.icon;
  const [isDragging, setIsDragging] = useState(false);
  
  const handleDragStart = useCallback((e: React.DragEvent) => {
    setIsDragging(true);
    const dragId = startVideoTransitionDrag(preset.type, 1);
    e.dataTransfer.setData('text/plain', dragId);
    e.dataTransfer.effectAllowed = "copy";
  }, [preset.type]);
  
  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    endDrag();
  }, []);
  
  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={onSelect}
      className={cn(
        "w-full p-3 rounded-lg border border-border cursor-grab active:cursor-grabbing",
        "bg-muted/30 hover:bg-muted/50 transition-colors",
        "text-left group",
        isDragging && "opacity-50"
      )}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center shrink-0">
          <Icon className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{preset.name}</p>
          <p className="text-xs text-muted-foreground truncate">{preset.description}</p>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// TRANSITIONS TAB COMPONENT
// ==========================================

export const TransitionsTab: React.FC = () => {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Group presets by category
  const categories = ['fade', 'wipe', 'slide', 'zoom', 'other'] as const;
  
  const handleSelectTransition = (preset: TransitionPreset) => {
    console.log('Selected transition:', preset);
    // TODO: Apply transition to selected clip or store for next use
  };

  return (
    <div className="h-full">
      <ScrollArea className="h-full sidepanel-scrollbar">
        <div className="p-3 space-y-4 pb-6">
          {/* Info */}
          <div className="p-3 rounded-lg bg-muted/30 border border-border">
            <p className="text-xs text-muted-foreground">
              Click a transition to apply it to the selected clip, or drag it to the timeline between two clips.
            </p>
          </div>

          {/* Transitions by Category */}
          {categories.map(category => {
            const categoryPresets = TRANSITION_PRESETS.filter(p => p.category === category);
            if (categoryPresets.length === 0) return null;
            
            return (
              <div key={category} className="space-y-2">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide capitalize">
                  {category}
                </h3>
                <div className="space-y-2">
                  {categoryPresets.map(preset => (
                    <TransitionCard
                      key={preset.id}
                      preset={preset}
                      onSelect={() => handleSelectTransition(preset)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
};

export default TransitionsTab;
