/**
 * ShapesTab - Shape creation and preset management
 * 
 * Features:
 * - Quick add shape buttons
 * - Shape preset templates with visual previews
 * - Shape tool activation
 * 
 * Uses Timeline V2 clip-based API
 */

import React, { useState, useEffect } from "react";
import { cn } from "../../../utils/general/utils";
import { ScrollArea } from "../../ui/scroll-area";
import { Button } from "../../ui/button";
import { Switch } from "../../ui/switch";
import { Label } from "../../ui/label";
import { useVideoEditorStore } from "../../../stores/video-editor-store";
import { useToolContext } from "../../../contexts/tool-context";
import { ToolType } from "../../../types/tools";
import { shapeStylePresets } from "../../../templates/shape-style-presets";
import { scrollAndHighlightClip } from "../../../utils/timeline-helpers";
import { startShapePresetDrag, endDrag } from "../../../stores";
import {
  Square,
  Circle,
  Triangle,
  Minus,
} from "lucide-react";

// ==========================================
// TYPES
// ==========================================

interface ShapePreset {
  name: string;
  preview: string;
  content: 'rectangle' | 'ellipse' | 'triangle' | 'line';
  styles: any; // Shape styles from presets
}

// ==========================================
// PRESET CARD COMPONENT
// ==========================================

interface PresetCardProps {
  preset: ShapePreset;
  onClick: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
}

const PresetCard: React.FC<PresetCardProps> = ({ preset, onClick, onDragStart, onDragEnd }) => {
  // Build inline styles for the preview shape
  const previewContainerStyles: React.CSSProperties = {
    position: 'relative',
    width: '100%',
    height: '60px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const shapeStyles: React.CSSProperties = {
    width: preset.content === 'line' ? '80%' : '50%',
    height: preset.content === 'line' ? '2px' : '50%',
    backgroundColor: preset.styles.fill || 'transparent',
    border: preset.styles.stroke ? `${preset.styles.strokeWidth || 1}px solid ${preset.styles.stroke}` : 'none',
    opacity: preset.styles.opacity !== undefined ? preset.styles.opacity : 1,
  };

  // Shape-specific styling
  if (preset.content === 'ellipse') {
    shapeStyles.borderRadius = '50%';
  } else if (preset.content === 'rectangle') {
    shapeStyles.borderRadius = preset.styles.borderRadius || '0px';
  } else if (preset.content === 'triangle') {
    shapeStyles.clipPath = 'polygon(50% 0%, 0% 100%, 100% 100%)';
  } else if (preset.content === 'line') {
    shapeStyles.transform = 'rotate(0deg)';
  }

  // Add gradient if present
  if (preset.styles.gradientConfig) {
    const gradient = preset.styles.gradientConfig;
    if (gradient.type === 'linear') {
      const gradientStops = gradient.stops.map((s: { color: string; offset: number }) => `${s.color} ${s.offset}%`).join(', ');
      shapeStyles.background = `linear-gradient(${gradient.angle}deg, ${gradientStops})`;
    } else if (gradient.type === 'radial') {
      const gradientStops = gradient.stops.map((s: { color: string; offset: number }) => `${s.color} ${s.offset}%`).join(', ');
      shapeStyles.background = `radial-gradient(circle, ${gradientStops})`;
    }
  }

  // Add shadows if present (simplified for preview)
  if (preset.styles.shadows && preset.styles.shadows.length > 0) {
    const shadows = preset.styles.shadows
      .map((s: { offsetX: number; offsetY: number; blur: number; color: string }) => `${s.offsetX * 0.5}px ${s.offsetY * 0.5}px ${s.blur * 0.5}px ${s.color}`)
      .join(', ');
    if (shadows) {
      shapeStyles.boxShadow = shadows;
    }
  }
  
  return (
    <button
      onClick={onClick}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "w-full p-3 rounded-lg border border-border",
        "bg-muted/30 hover:bg-muted/50 transition-colors",
        "text-left group"
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="h-3.5 w-3.5 text-muted-foreground">
          {preset.content === 'rectangle' && <Square className="h-3.5 w-3.5" />}
          {preset.content === 'ellipse' && <Circle className="h-3.5 w-3.5" />}
          {preset.content === 'triangle' && <Triangle className="h-3.5 w-3.5" />}
          {preset.content === 'line' && <Minus className="h-3.5 w-3.5" />}
        </div>
        <span className="text-xs font-medium text-muted-foreground">{preset.name}</span>
      </div>
      <div style={previewContainerStyles}>
        <div style={shapeStyles} />
      </div>
    </button>
  );
};

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Get composition dimensions based on aspect ratio and resolution
 */
const getCompositionDimensions = () => {
  const state = useVideoEditorStore.getState();
  const aspectRatio = state.aspectRatio || '16:9';
  const resolution = state.resolution || '1080p';
  
  const resolutionHeights: Record<string, number> = {
    '720p': 720,
    '1080p': 1080,
    '1440p': 1440,
    '4k': 2160,
  };
  
  const aspectRatios: Record<string, number> = {
    '16:9': 16/9,
    '9:16': 9/16,
    '1:1': 1,
    '4:5': 4/5,
  };
  
  const height = resolutionHeights[resolution] || 1080;
  const ratio = aspectRatios[aspectRatio] || 16/9;
  const width = Math.round(height * ratio);
  
  return { width, height };
};

/**
 * Ensure a video track exists, create one if needed
 */
const ensureVideoTrack = (): string => {
  const state = useVideoEditorStore.getState();
  const allTracks = Object.values(state.tracks);
  const videoTrack = allTracks.find(t => t.type === 'video');
  
  if (videoTrack) {
    return videoTrack.id;
  }
  
  // Create a new video track
  return state.addTrack('video');
};

// ==========================================
// SHAPES TAB COMPONENT
// ==========================================

export const ShapesTab: React.FC = () => {
  // Get store actions and state
  const addClip = useVideoEditorStore(s => s.addClip);
  const currentTime = useVideoEditorStore(s => s.playback?.currentTime || 0);
  const selectClip = useVideoEditorStore(s => s.selectClip);
  const { setActiveTool, activeTool } = useToolContext();
  
  // Multi-add mode state
  const [multiAddMode, setMultiAddMode] = useState(false);
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).isContentEditable
      ) {
        return;
      }
      
      // R for Rectangle tool
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        setActiveTool(ToolType.RECTANGLE);
      }
      
      // E for Ellipse tool
      if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        setActiveTool(ToolType.ELLIPSE);
      }
      
      // L for Line tool
      if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        setActiveTool(ToolType.LINE);
      }
      
      // ESC to return to select tool
      if (e.key === 'Escape') {
        e.preventDefault();
        setActiveTool(ToolType.SELECT);
      }
      
      // V for select tool
      if (e.key === 'v' || e.key === 'V') {
        e.preventDefault();
        setActiveTool(ToolType.SELECT);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setActiveTool]);

  // Add shape with preset styles
  const handleAddShapeWithPreset = (preset: ShapePreset) => {
    // Ensure we have a video track
    const trackId = ensureVideoTrack();
    
    // Get composition dimensions
    const { width: canvasWidth, height: canvasHeight } = getCompositionDimensions();
    
    // Default dimensions based on shape type
    let width = 200;
    let height = 200;
    if (preset.content === 'line') {
      width = 300;
      height = 2;
    }
    
    // Create shape clip
    const clipId = addClip({
      trackId,
      startTime: currentTime,
      duration: 5, // 5 seconds
      type: 'shape',
      sourceId: '',
      label: preset.name || 'Shape',
      content: preset.content, // 'rectangle', 'ellipse', etc.
      transform: {
        x: Math.round(canvasWidth / 2 - width / 2),
        y: Math.round(canvasHeight / 2 - height / 2),
        width,
        height,
        rotation: 0,
        opacity: preset.styles.opacity !== undefined ? preset.styles.opacity : 1,
        zIndex: 100,
      },
      data: {
        shapeType: preset.content,
        fill: preset.styles.fill || '#3b82f6',
        stroke: preset.styles.stroke,
        strokeWidth: preset.styles.strokeWidth,
        borderRadius: preset.styles.borderRadius,
      },
      styles: {
        // All advanced styles from preset
        ...preset.styles,
      },
    });
    
    // Select the newly created clip and show on timeline
    if (clipId) {
      // Scroll timeline to show the new clip and highlight it
      scrollAndHighlightClip(clipId, 1500);
      
      // Select the clip unless in multi-add mode
      if (!multiAddMode) {
        selectClip(clipId);
      }
    }
  };

  // Quick add shape (default rectangle)
  const handleQuickAddShape = () => {
    const firstPreset = Object.values(shapeStylePresets)[0];
    handleAddShapeWithPreset(firstPreset);
  };

  // Activate shape tools
  const handleActivateRectangleTool = () => setActiveTool(ToolType.RECTANGLE);
  const handleActivateEllipseTool = () => setActiveTool(ToolType.ELLIPSE);
  const handleActivateLineTool = () => setActiveTool(ToolType.LINE);

  return (
    <div className="h-full">
      <ScrollArea className="h-full sidepanel-scrollbar">
        <div className="p-3 space-y-4 pb-6">
          {/* Quick Add Section */}
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Shape Tools
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="outline"
                className={cn(
                  "h-16 flex flex-col gap-1",
                  activeTool === ToolType.RECTANGLE && "bg-primary/10 border-primary text-primary"
                )}
                onClick={handleActivateRectangleTool}
              >
                <Square className="h-4 w-4" />
                <span className="text-xs">Rectangle</span>
                <span className="text-[10px] text-muted-foreground">(R)</span>
              </Button>
              <Button
                variant="outline"
                className={cn(
                  "h-16 flex flex-col gap-1",
                  activeTool === ToolType.ELLIPSE && "bg-primary/10 border-primary text-primary"
                )}
                onClick={handleActivateEllipseTool}
              >
                <Circle className="h-4 w-4" />
                <span className="text-xs">Ellipse</span>
                <span className="text-[10px] text-muted-foreground">(E)</span>
              </Button>
              <Button
                variant="outline"
                className={cn(
                  "h-16 flex flex-col gap-1",
                  activeTool === ToolType.LINE && "bg-primary/10 border-primary text-primary"
                )}
                onClick={handleActivateLineTool}
              >
                <Minus className="h-4 w-4" />
                <span className="text-xs">Line</span>
                <span className="text-[10px] text-muted-foreground">(L)</span>
              </Button>
            </div>
          </div>

          {/* Multi-Add Mode Toggle */}
          <div className="flex items-center justify-between p-2 rounded-md bg-muted/30 border border-border/50">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="shape-multi-add" className="text-xs font-medium cursor-pointer">
                Add Multiple
              </Label>
              <span className="text-[10px] text-muted-foreground">
                Keep adding without auto-selecting
              </span>
            </div>
            <Switch
              id="shape-multi-add"
              checked={multiAddMode}
              onCheckedChange={setMultiAddMode}
            />
          </div>

          {/* Presets Section */}
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Shape Style Presets
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(shapeStylePresets).map(([key, preset]) => (
                <PresetCard
                  key={key}
                  preset={preset as ShapePreset}
                  onClick={() => handleAddShapeWithPreset(preset as ShapePreset)}
                  onDragStart={(e) => {
                    const sp = preset as ShapePreset;
                    startShapePresetDrag(sp.content, sp.styles, {
                      name: sp.name,
                    });
                    e.dataTransfer.setData('application/json', JSON.stringify({
                      isNewItem: true,
                      type: 'shape',
                      label: sp.name || 'Shape',
                      duration: 5,
                      data: {
                        shapeType: sp.content,
                        shapeStyles: sp.styles,
                        name: sp.name,
                      },
                    }));
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  onDragEnd={() => endDrag()}
                />
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
};

export default ShapesTab;
