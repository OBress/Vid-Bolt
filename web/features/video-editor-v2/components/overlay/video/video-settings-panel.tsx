import React from "react";
import { ClipOverlay } from "../../../types";
import { 
  FlipHorizontal, 
  FlipVertical, 
  RotateCcw, 
  Volume2, 
  VolumeX, 
  Gauge,
  Move3D
} from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";
import { Slider } from "../../ui/slider";
import { Switch } from "../../ui/switch";
import { Label } from "../../ui/label";
import { Button } from "../../ui/button";
import { AnimationSettings } from "../../shared/animation/animation-settings";
import { CropSettings } from "./crop-settings";
import { PositionSettings } from "../../shared/position/position-settings";

// Snap angles for rotation (in degrees)
const SNAP_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315, 360];
const SNAP_THRESHOLD = 5;

const SPEED_OPTIONS = [
  { value: 0.25, label: "0.25x" },
  { value: 0.5, label: "0.5x" },
  { value: 0.75, label: "0.75x" },
  { value: 1, label: "1x" },
  { value: 1.25, label: "1.25x" },
  { value: 1.5, label: "1.5x" },
  { value: 1.75, label: "1.75x" },
  { value: 2, label: "2x" },
  { value: 3, label: "3x" },
  { value: 4, label: "4x" },
];

interface VideoSettingsPanelProps {
  localOverlay: ClipOverlay;
  handleStyleChange: (updates: Partial<ClipOverlay["styles"]>) => void;
  onSpeedChange?: (speed: number, newDuration: number) => void;
  onPositionChange?: (updates: { left?: number; top?: number; width?: number; height?: number }) => void;
  onRotationChange?: (rotation: number) => void;
}

export const VideoSettingsPanel: React.FC<VideoSettingsPanelProps> = ({
  localOverlay,
  handleStyleChange,
  onSpeedChange,
  onPositionChange,
  onRotationChange,
}) => {
  const [isSelectOpen, setIsSelectOpen] = React.useState(false);
  const [rotationSnapping, setRotationSnapping] = React.useState(true);
  
  // Track flip states
  const flipH = localOverlay?.styles?.transform?.includes('scaleX(-1)') ?? false;
  const flipV = localOverlay?.styles?.transform?.includes('scaleY(-1)') ?? false;
  const rotation = localOverlay?.rotation ?? 0;
  const volume = localOverlay?.styles?.volume ?? 1;
  const isMuted = volume === 0;
  const speed = localOverlay?.speed ?? 1;

  React.useEffect(() => {
    return () => {
      setIsSelectOpen(false);
    };
  }, []);

  const handleRotationSliderChange = (value: number[]) => {
    let newRotation = value[0];
    
    if (rotationSnapping) {
      for (const snapAngle of SNAP_ANGLES) {
        if (Math.abs(newRotation - snapAngle) <= SNAP_THRESHOLD) {
          newRotation = snapAngle === 360 ? 0 : snapAngle;
          break;
        }
      }
    }
    
    if (onRotationChange) {
      onRotationChange(newRotation);
    }
  };

  const handleFlipToggle = (direction: 'horizontal' | 'vertical') => {
    const currentTransform = localOverlay?.styles?.transform || '';
    let newTransform = currentTransform;
    
    if (direction === 'horizontal') {
      if (flipH) {
        newTransform = newTransform.replace(/scaleX\(-1\)\s*/g, '').trim();
      } else {
        newTransform = `scaleX(-1) ${newTransform}`.trim();
      }
    } else {
      if (flipV) {
        newTransform = newTransform.replace(/scaleY\(-1\)\s*/g, '').trim();
      } else {
        newTransform = `scaleY(-1) ${newTransform}`.trim();
      }
    }
    
    handleStyleChange({ transform: newTransform || 'none' });
  };

  const handleSpeedChange = (newSpeed: number) => {
    if (localOverlay) {
      const baseDuration = localOverlay.durationInFrames * (localOverlay.speed ?? 1);
      const newDuration = Math.round(baseDuration / newSpeed);

      if (onSpeedChange) {
        onSpeedChange(newSpeed, newDuration);
      }
      setIsSelectOpen(false);
    }
  };

  const handleEnterAnimationSelect = (animationKey: string) => {
    handleStyleChange({
      animation: {
        ...localOverlay?.styles?.animation,
        enter: animationKey === "none" ? "" : animationKey,
      },
    });
  };

  const handleExitAnimationSelect = (animationKey: string) => {
    handleStyleChange({
      animation: {
        ...localOverlay?.styles?.animation,
        exit: animationKey === "none" ? "" : animationKey,
      },
    });
  };

  return (
    <div className="space-y-3">
      {/* Transform Controls */}
      <div className="bg-neutral-900/50 rounded-lg p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Move3D className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Transform</span>
        </div>

        {/* Rotation */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Rotation</span>
            <span className="text-xs text-muted-foreground tabular-nums">{rotation}°</span>
          </div>
          <div className="flex items-center gap-2">
            <Slider
              value={[rotation]}
              onValueChange={handleRotationSliderChange}
              min={0}
              max={360}
              step={rotationSnapping ? 1 : 0.5}
              className="flex-1"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => onRotationChange?.(0)}
              disabled={rotation === 0}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex items-center justify-between pt-1">
            <Label htmlFor="snap-toggle" className="text-xs text-muted-foreground cursor-pointer">
              Snap to angles (0°, 45°, 90°...)
            </Label>
            <Switch
              id="snap-toggle"
              checked={rotationSnapping}
              onCheckedChange={setRotationSnapping}
            />
          </div>
        </div>

        {/* Flip Controls */}
        <div className="space-y-2">
          <span className="text-xs text-muted-foreground">Flip</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleFlipToggle('horizontal')}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded text-xs font-medium transition-colors ${
                flipH 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-neutral-800 text-muted-foreground hover:bg-neutral-700 hover:text-foreground'
              }`}
            >
              <FlipHorizontal className="h-4 w-4" />
              Horizontal
            </button>
            <button
              onClick={() => handleFlipToggle('vertical')}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded text-xs font-medium transition-colors ${
                flipV 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-neutral-800 text-muted-foreground hover:bg-neutral-700 hover:text-foreground'
              }`}
            >
              <FlipVertical className="h-4 w-4" />
              Vertical
            </button>
          </div>
        </div>
      </div>

      {/* Crop Settings */}
      <div className="bg-neutral-900/50 rounded-lg p-4 space-y-3">
        <CropSettings
          localOverlay={localOverlay}
          handleStyleChange={handleStyleChange}
        />
      </div>

      {/* Position Controls */}
      {onPositionChange && (
        <div className="bg-neutral-900/50 rounded-lg p-4 space-y-3">
          <PositionSettings
            overlayWidth={localOverlay.width}
            overlayHeight={localOverlay.height}
            onPositionChange={onPositionChange}
          />
        </div>
      )}

      {/* Volume Control */}
      <div className="bg-neutral-900/50 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isMuted ? (
              <VolumeX className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Volume2 className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="text-sm font-medium text-foreground">Volume</span>
          </div>
          <button
            onClick={() => handleStyleChange({ volume: isMuted ? 1 : 0 })}
            className={`text-xs px-2 py-1 rounded transition-colors ${
              isMuted 
                ? 'bg-red-500/20 text-red-400' 
                : 'bg-neutral-800 text-muted-foreground hover:bg-neutral-700'
            }`}
          >
            {isMuted ? "Unmute" : "Mute"}
          </button>
        </div>
        <div className="flex items-center gap-3">
          <Slider
            value={[volume]}
            onValueChange={(value) => handleStyleChange({ volume: value[0] })}
            min={0}
            max={1}
            step={0.01}
            className="flex-1"
          />
          <span className="text-xs text-muted-foreground w-10 text-right tabular-nums">
            {Math.round(volume * 100)}%
          </span>
        </div>
      </div>

      {/* Playback Speed */}
      <div className="bg-neutral-900/50 rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Playback Speed</span>
        </div>
        <Select
          open={isSelectOpen}
          onOpenChange={setIsSelectOpen}
          value={String(speed)}
          onValueChange={(value) => handleSpeedChange(parseFloat(value))}
        >
          <SelectTrigger className="w-full h-9 bg-neutral-800 border-none text-sm">
            <SelectValue placeholder="Select speed" />
          </SelectTrigger>
          <SelectContent>
            {SPEED_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={String(option.value)}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Animation Settings */}
      <div className="bg-neutral-900/50 rounded-lg p-4 space-y-3">
        <AnimationSettings
          selectedEnterAnimation={localOverlay?.styles?.animation?.enter || "none"}
          selectedExitAnimation={localOverlay?.styles?.animation?.exit || "none"}
          onEnterAnimationSelect={handleEnterAnimationSelect}
          onExitAnimationSelect={handleExitAnimationSelect}
        />
      </div>
    </div>
  );
};
