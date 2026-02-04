/**
 * VideoSection - Inspector section for video-specific properties
 *
 * Properties:
 * - Speed/playback rate with curve support
 * - Visual trimmer for start/end points
 * - Object fit
 * - Border radius
 * - Crop controls
 * - Greenscreen settings (if applicable)
 * 
 * Note: Volume control is on the linked audio overlay (Premiere Pro style)
 */

import React, { useCallback, useMemo } from "react";
import { cn } from "../../../utils/general/utils";
import { Label } from "../../ui/label";
import { Input } from "../../ui/input";
import { Button } from "../../ui/button";
import { Slider } from "../../ui/slider";
import { Switch } from "../../ui/switch";
import { DraggableNumber } from "../../ui/draggable-number";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";
import { ClipOverlay } from "../../../types";
import {
  Gauge,
  Maximize2,
  Crop,
  Square,
  RefreshCw,
  Scissors,
  Clock,
  Film,
} from "lucide-react";
import { generateClipPath } from "../../../utils/crop-utils";

// ==========================================
// TYPES
// ==========================================

interface VideoSectionProps {
  overlay: ClipOverlay;
  onUpdate: (updates: Partial<ClipOverlay>) => void;
  onUpdateStyles: (updates: Partial<ClipOverlay["styles"]>) => void;
}

// ==========================================
// CONSTANTS
// ==========================================

const OBJECT_FIT_OPTIONS = [
  { value: "contain", label: "Contain", description: "Fit inside without cropping" },
  { value: "cover", label: "Cover", description: "Fill entire area, may crop" },
  { value: "fill", label: "Fill", description: "Stretch to fill" },
  { value: "none", label: "None", description: "Original size" },
  { value: "scale-down", label: "Scale Down", description: "Smaller of contain/none" },
];

const SPEED_PRESETS = [
  { value: 0.25, label: "0.25x" },
  { value: 0.5, label: "0.5x" },
  { value: 0.75, label: "0.75x" },
  { value: 1, label: "1x" },
  { value: 1.25, label: "1.25x" },
  { value: 1.5, label: "1.5x" },
  { value: 2, label: "2x" },
];

// ==========================================
// VISUAL TRIMMER COMPONENT
// ==========================================

interface TrimmerProps {
  duration: number;
  startTime: number;
  clipDuration: number;
  onStartChange: (time: number) => void;
  onDurationChange: (frames: number) => void;
}

const VisualTrimmer: React.FC<TrimmerProps> = ({
  duration,
  startTime,
  clipDuration,
  onStartChange,
  onDurationChange,
}) => {
  const FPS = 30;
  const totalFrames = Math.round(duration * FPS);
  const startFrame = Math.round(startTime * FPS);
  const endFrame = startFrame + clipDuration;
  
  // Calculate percentages for visual display
  const startPercent = (startFrame / totalFrames) * 100;
  const widthPercent = (clipDuration / totalFrames) * 100;
  
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Source: {formatTime(duration)}</span>
        <span>Clip: {formatTime(clipDuration / FPS)}</span>
      </div>
      
      {/* Visual trimmer bar */}
      <div className="relative h-8 bg-muted/50 rounded border border-border overflow-hidden">
        {/* Full duration background */}
        <div className="absolute inset-0 bg-muted/30" />
        
        {/* Selected range */}
        <div
          className="absolute h-full bg-primary/30 border-x-2 border-primary cursor-move"
          style={{
            left: `${startPercent}%`,
            width: `${widthPercent}%`,
          }}
        />
        
        {/* Time markers */}
        <div className="absolute inset-x-0 bottom-0 flex justify-between px-1 text-[8px] text-muted-foreground">
          <span>0:00</span>
          <span>{formatTime(duration / 2)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
      
      {/* Start time control */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Start</Label>
          <DraggableNumber
            value={startTime}
            onChange={onStartChange}
            suffix="s"
            decimals={2}
            step={0.1}
            min={0}
            max={duration - (clipDuration / FPS)}
            sensitivity={0.05}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">End</Label>
          <DraggableNumber
            value={startTime + (clipDuration / FPS)}
            onChange={(val) => {
              const newDuration = Math.round((val - startTime) * FPS);
              onDurationChange(Math.max(1, newDuration));
            }}
            suffix="s"
            decimals={2}
            step={0.1}
            min={startTime + 0.1}
            max={duration}
            sensitivity={0.05}
          />
        </div>
      </div>
    </div>
  );
};

// Helper function for time formatting
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}

// ==========================================
// VIDEO SECTION COMPONENT
// ==========================================

export const VideoSection: React.FC<VideoSectionProps> = ({
  overlay,
  onUpdate,
  onUpdateStyles,
}) => {
  const styles = overlay.styles;
  const speed = overlay.speed ?? 1;

  // Reset crop
  const handleResetCrop = useCallback(() => {
    onUpdateStyles({
      cropEnabled: false,
      cropX: 0,
      cropY: 0,
      cropWidth: 100,
      cropHeight: 100,
      clipPath: undefined,
    });
  }, [onUpdateStyles]);

  return (
    <div className="space-y-3">
      {/* Speed */}
      <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
            <Gauge className="h-3 w-3 inline mr-1.5" />
            Playback Speed
          </Label>
          <span className="text-xs font-mono text-muted-foreground">
            {speed}x
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Slider
            value={[speed]}
            min={0.1}
            max={4}
            step={0.05}
            className="flex-1"
            onValueChange={([val]) => onUpdate({ speed: val })}
          />
          <Select
            value={SPEED_PRESETS.find((p) => p.value === speed)?.value.toString()}
            onValueChange={(val) => onUpdate({ speed: parseFloat(val) })}
          >
            <SelectTrigger className="w-20 h-7 text-xs">
              <SelectValue placeholder="Custom" />
            </SelectTrigger>
            <SelectContent>
              {SPEED_PRESETS.map((preset) => (
                <SelectItem key={preset.value} value={preset.value.toString()}>
                  {preset.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Object Fit */}
      <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3 space-y-2">
        <Label className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
          <Maximize2 className="h-3 w-3 inline mr-1.5" />
          Object Fit
        </Label>
        <Select
          value={styles.objectFit || "contain"}
          onValueChange={(val) => onUpdateStyles({ objectFit: val as ClipOverlay["styles"]["objectFit"] })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OBJECT_FIT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <div>
                  <span>{option.label}</span>
                  <span className="text-muted-foreground ml-2 text-[10px]">
                    {option.description}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Border Radius */}
      <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3 space-y-2">
        <Label className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
          <Square className="h-3 w-3 inline mr-1.5" />
          Corner Radius
        </Label>
        <div className="flex items-center gap-2">
          <Slider
            value={[parseInt(styles.borderRadius || "0", 10)]}
            min={0}
            max={100}
            step={1}
            className="flex-1"
            onValueChange={([val]) => onUpdateStyles({ borderRadius: `${val}px` })}
          />
          <Input
            type="text"
            value={styles.borderRadius || "0px"}
            onChange={(e) => onUpdateStyles({ borderRadius: e.target.value })}
            className="w-16 h-7 text-xs text-center"
          />
        </div>
      </div>

      {/* Crop Section */}
      <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground uppercase tracking-wide font-medium flex items-center gap-1.5">
            <Crop className="h-3 w-3" />
            Crop
          </Label>
          <div className="flex items-center gap-2">
            <Switch
              checked={styles.cropEnabled || false}
              onCheckedChange={(checked) => {
                const cropX = checked ? (styles.cropX ?? 0) : 0;
                const cropY = checked ? (styles.cropY ?? 0) : 0;
                const cropWidth = checked ? (styles.cropWidth ?? 100) : 100;
                const cropHeight = checked ? (styles.cropHeight ?? 100) : 100;
                const clipPath = checked ? generateClipPath(cropX, cropY, cropWidth, cropHeight) : undefined;
                onUpdateStyles({
                  cropEnabled: checked,
                  cropX,
                  cropY,
                  cropWidth,
                  cropHeight,
                  clipPath,
                });
              }}
            />
          </div>
        </div>

        {styles.cropEnabled && (
          <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
            {/* Crop X & Y */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">X Offset</Label>
                <Slider
                  value={[styles.cropX ?? 0]}
                  min={0}
                  max={50}
                  step={1}
                  onValueChange={([val]) => {
                    const newClipPath = generateClipPath(val, styles.cropY ?? 0, styles.cropWidth ?? 100, styles.cropHeight ?? 100);
                    onUpdateStyles({ cropX: val, clipPath: newClipPath });
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Y Offset</Label>
                <Slider
                  value={[styles.cropY ?? 0]}
                  min={0}
                  max={50}
                  step={1}
                  onValueChange={([val]) => {
                    const newClipPath = generateClipPath(styles.cropX ?? 0, val, styles.cropWidth ?? 100, styles.cropHeight ?? 100);
                    onUpdateStyles({ cropY: val, clipPath: newClipPath });
                  }}
                />
              </div>
            </div>

            {/* Crop Width & Height */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Width %</Label>
                <Slider
                  value={[styles.cropWidth ?? 100]}
                  min={10}
                  max={100}
                  step={1}
                  onValueChange={([val]) => {
                    const newClipPath = generateClipPath(styles.cropX ?? 0, styles.cropY ?? 0, val, styles.cropHeight ?? 100);
                    onUpdateStyles({ cropWidth: val, clipPath: newClipPath });
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Height %</Label>
                <Slider
                  value={[styles.cropHeight ?? 100]}
                  min={10}
                  max={100}
                  step={1}
                  onValueChange={([val]) => {
                    const newClipPath = generateClipPath(styles.cropX ?? 0, styles.cropY ?? 0, styles.cropWidth ?? 100, val);
                    onUpdateStyles({ cropHeight: val, clipPath: newClipPath });
                  }}
                />
              </div>
            </div>

            {/* Reset Button */}
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={handleResetCrop}
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Reset Crop
            </Button>
          </div>
        )}
      </div>

    </div>
  );
};

export default VideoSection;
