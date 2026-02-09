/**
 * TextTab - Text creation and preset management
 * 
 * Features:
 * - Quick add text button
 * - Text preset templates
 * - Recently used texts
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
import { textStylePresets } from "../../../templates/text-style-presets";
import { scrollAndHighlightClip } from "../../../utils/timeline-helpers";
import { usePresetFontPreloader } from "../../../hooks/use-preset-font-preloader";
import { startTextPresetDrag, endDrag } from "../../../stores";
import {
  Type,
  Plus,
} from "lucide-react";

// ==========================================
// TYPES
// ==========================================

interface TextPreset {
  name: string;
  preview: string;
  styles: any; // Text styles from presets
}

// ==========================================
// PRESET CARD COMPONENT
// ==========================================

interface PresetCardProps {
  preset: TextPreset;
  onClick: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
}

const PresetCard: React.FC<PresetCardProps> = ({ preset, onClick, onDragStart, onDragEnd }) => {
  // Build inline styles for the preview text - matching TextLayerContent exactly
  const previewStyles: React.CSSProperties = {
    fontSize: preset.styles.fontSize ? `${parseInt(String(preset.styles.fontSize)) * 0.25}px` : '12px',
    fontWeight: preset.styles.fontWeight || '400',
    fontStyle: preset.styles.fontStyle || 'normal',
    fontFamily: preset.styles.fontFamily || 'Inter',
    color: preset.styles.color || '#ffffff',
    textAlign: (preset.styles.textAlign as any) || 'left',
    lineHeight: preset.styles.lineHeight || '1.2',
    letterSpacing: preset.styles.letterSpacing || 'normal',
    textDecoration: preset.styles.textDecoration || 'none',
    wordWrap: 'break-word',
    whiteSpace: 'pre-wrap',
  };

  // Apply text stroke (matching TextLayerContent)
  if (preset.styles.textStroke) {
    previewStyles.WebkitTextStroke = `${preset.styles.textStroke.width * 0.25}px ${preset.styles.textStroke.color}`;
    previewStyles.paintOrder = 'stroke fill';
  }

  // Apply text shadows (matching TextLayerContent)
  if (preset.styles.textShadows && preset.styles.textShadows.length > 0) {
    const shadows = preset.styles.textShadows
      .map(s => `${s.offsetX * 0.25}px ${s.offsetY * 0.25}px ${s.blur * 0.25}px ${s.color}`)
      .join(', ');
    if (shadows) {
      previewStyles.textShadow = shadows;
    }
  } else if (preset.styles.glowEffect) {
    // Apply glow effect as multiple text shadows (matching TextLayerContent)
    const intensity = preset.styles.glowEffect.intensity || 10;
    const color = preset.styles.glowEffect.color || 'rgba(255, 255, 255, 0.5)';
    const glowShadows = [
      `0px 0px ${intensity * 0.25}px ${color}`,
      `0px 0px ${intensity * 0.5}px ${color}`,
      `0px 0px ${intensity * 0.75}px ${color}`,
    ].join(', ');
    previewStyles.textShadow = glowShadows;
  }

  // Apply text gradient (matching TextLayerContent)
  if (preset.styles.textGradient) {
    const gradient = preset.styles.textGradient;
    const stops = gradient.stops.map(s => `${s.color} ${s.offset}%`).join(', ');
    
    if (gradient.type === 'radial') {
      previewStyles.background = `radial-gradient(circle, ${stops})`;
    } else {
      const angle = gradient.angle || 0;
      previewStyles.background = `linear-gradient(${angle}deg, ${stops})`;
    }
    
    previewStyles.WebkitBackgroundClip = 'text';
    previewStyles.WebkitTextFillColor = 'transparent';
    previewStyles.backgroundClip = 'text';
  }
  
  return (
    <button
      onClick={onClick}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "w-full p-4 rounded-lg border border-border",
        "bg-muted/30 hover:bg-muted/50 transition-colors",
        "text-left group min-h-[80px] flex flex-col justify-between"
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <Type className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">{preset.name}</span>
      </div>
      <div
        className="line-clamp-2 leading-tight"
        style={previewStyles}
      >
        {preset.preview}
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
  const videoTrack = state.tracks.find(t => t.type === 'video');
  
  if (videoTrack) {
    return videoTrack.id;
  }
  
  // Create a new video track
  return state.addTrack('video');
};

// ==========================================
// TEXT TAB COMPONENT
// ==========================================

export const TextTab: React.FC = () => {
  // Preload all fonts used in text presets for preview cards
  usePresetFontPreloader();

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
      
      // T for Text Tool
      if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        setActiveTool(ToolType.TEXT);
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

  /**
   * Calculate intelligent text box dimensions based on text content and font size
   */
  const calculateTextDimensions = (text: string, fontSize: number, canvasWidth: number, canvasHeight: number) => {
    // Estimate character width as ~60% of font size (average for most fonts)
    const avgCharWidth = fontSize * 0.6;
    
    // Calculate approximate text width
    const textWidth = text.length * avgCharWidth;
    
    // Line height is typically 1.2-1.5x font size
    const lineHeight = fontSize * 1.4;
    
    // Determine how many lines we'll need based on max width (80% of canvas)
    const maxWidth = Math.min(canvasWidth * 0.8, textWidth + 40); // Add padding
    const estimatedLines = Math.ceil(textWidth / (maxWidth - 40)) || 1;
    
    // Calculate height based on estimated lines
    const totalHeight = (estimatedLines * lineHeight) + 40; // Add padding
    
    // Ensure minimum dimensions
    const finalWidth = Math.max(300, Math.min(maxWidth, canvasWidth * 0.9));
    const finalHeight = Math.max(80, Math.min(totalHeight, canvasHeight * 0.5));
    
    return {
      width: Math.round(finalWidth),
      height: Math.round(finalHeight),
    };
  };

  // Add text with preset styles
  const handleAddTextWithPreset = (preset: TextPreset) => {
    // Ensure we have a video track
    const trackId = ensureVideoTrack();
    
    // Get composition dimensions
    const { width: canvasWidth, height: canvasHeight } = getCompositionDimensions();
    
    // Parse fontSize to number
    const fontSize = preset.styles.fontSize 
      ? parseInt(String(preset.styles.fontSize).replace('px', ''))
      : 48;
    
    // Calculate intelligent text dimensions
    const textDimensions = calculateTextDimensions(preset.preview, fontSize, canvasWidth, canvasHeight);
    
    // Create text clip
    const clipData = {
      trackId,
      startTime: currentTime,
      duration: 3, // 3 seconds
      type: 'text' as const,
      sourceId: '',
      label: preset.name || 'Text',
      content: preset.preview,
      transform: {
        x: Math.round(canvasWidth / 2 - textDimensions.width / 2),
        y: Math.round(canvasHeight / 2 - textDimensions.height / 2),
        width: textDimensions.width,
        height: textDimensions.height,
        rotation: 0,
        opacity: 1,
        zIndex: 100,
      },
      text: {
        text: preset.preview,
        fontSize, // NUMBER for TextClipProperties
        fontFamily: preset.styles.fontFamily || 'Inter',
        color: preset.styles.color || '#ffffff',
        backgroundColor: preset.styles.backgroundColor || 'transparent',
        textAlign: (preset.styles.textAlign || 'center') as 'left' | 'center' | 'right',
      },
      styles: {
        // All advanced styles from preset (including fontWeight, shadows, gradients, etc.)
        ...preset.styles,
        // Ensure fontSize is string in styles for CSS compatibility
        fontSize: `${fontSize}px`,
        // Ensure fontFamily is in styles too (for overlay conversion)
        fontFamily: preset.styles.fontFamily || 'Inter',
      },
    };
    
    const clipId = addClip(clipData);
    
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

  // Quick add text (simple text)
  const handleQuickAddText = () => {
    const firstPreset = Object.values(textStylePresets)[0];
    handleAddTextWithPreset(firstPreset); // Use first preset as default
  };

  // Activate text tool for click-to-create
  const handleActivateTextTool = () => {
    setActiveTool(ToolType.TEXT);
  };

  return (
    <div className="h-full">
      <ScrollArea className="h-full sidepanel-scrollbar">
        <div className="p-3 space-y-4 pb-6">
          {/* Quick Add Section */}
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Quick Add
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="h-16 flex flex-col gap-1"
                onClick={handleQuickAddText}
              >
                <Plus className="h-4 w-4" />
                <span className="text-xs">Add Text</span>
              </Button>
              <Button
                variant="outline"
                className={cn(
                  "h-16 flex flex-col gap-1",
                  activeTool === ToolType.TEXT && "bg-primary/10 border-primary text-primary"
                )}
                onClick={handleActivateTextTool}
              >
                <Type className="h-4 w-4" />
                <span className="text-xs">Text Tool</span>
                <span className="text-[10px] text-muted-foreground">(T)</span>
              </Button>
            </div>
          </div>

          {/* Multi-Add Mode Toggle */}
          <div className="flex items-center justify-between p-2 rounded-md bg-muted/30 border border-border/50">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="multi-add" className="text-xs font-medium cursor-pointer">
                Add Multiple
              </Label>
              <span className="text-[10px] text-muted-foreground">
                Keep adding without auto-selecting
              </span>
            </div>
            <Switch
              id="multi-add"
              checked={multiAddMode}
              onCheckedChange={setMultiAddMode}
            />
          </div>

          {/* Presets Section */}
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Text Style Presets
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(textStylePresets).map(([key, preset]) => (
                <PresetCard
                  key={key}
                  preset={preset}
                  onClick={() => handleAddTextWithPreset(preset)}
                  onDragStart={(e) => {
                    startTextPresetDrag(key, preset.styles, {
                      content: preset.preview,
                      name: preset.name,
                    });
                    e.dataTransfer.setData('application/json', JSON.stringify({
                      isNewItem: true,
                      type: 'text',
                      label: preset.name || 'Text',
                      duration: 5,
                      data: {
                        presetId: key,
                        presetStyles: preset.styles,
                        content: preset.preview,
                        name: preset.name,
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

export default TextTab;
