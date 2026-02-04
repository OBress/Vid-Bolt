/**
 * TransitionInspector - Simplified transition editor for the inspector
 * 
 * Features:
 * - Direct property editing without nested dropdowns
 * - Treats "between" transitions as a single unified type
 * - Clean, minimal UI matching the inspector aesthetic
 * 
 * SIMPLIFIED: Now uses startTime/endTime instead of duration/offset
 */

import React, { useCallback, useMemo } from "react";
import { cn } from "../../../utils/general/utils";
import { Label } from "../../ui/label";
import { Slider } from "../../ui/slider";
import { Button } from "../../ui/button";
import { BezierCurveEditor, BezierCurve, BEZIER_PRESETS } from "../../ui/bezier-curve-editor";
import { DraggableNumber } from "../../ui/draggable-number";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "../../ui/select";
import {
  VideoTransitionType,
  AudioTransitionType,
  EasingPreset,
  TransitionEasing,
  EASING_BEZIER_CURVES,
} from "../../../types";
import {
  Timer,
  Trash2,
  Shuffle,
  ArrowLeftRight,
} from "lucide-react";
import type { TransitionEntity } from "../../../types/timeline-v2";
import { isBetweenTransition, getTransitionDuration } from "../../../types/timeline-v2";

// ==========================================
// TYPES
// ==========================================

interface TransitionInspectorProps {
  transition: TransitionEntity;
  onUpdate: (updates: Partial<TransitionEntity>) => void;
  onRemove: () => void;
}

// ==========================================
// TRANSITION TYPE OPTIONS
// ==========================================

const VIDEO_TRANSITION_OPTIONS: Array<{ value: VideoTransitionType; label: string; group: string }> = [
  // Dissolve
  { value: VideoTransitionType.CROSSFADE, label: "Cross Dissolve", group: "Dissolve" },
  { value: VideoTransitionType.FADE, label: "Fade", group: "Dissolve" },
  { value: VideoTransitionType.FADE_TO_BLACK, label: "Dip to Black", group: "Dissolve" },
  { value: VideoTransitionType.FADE_TO_WHITE, label: "Dip to White", group: "Dissolve" },
  { value: VideoTransitionType.DISSOLVE, label: "Film Dissolve", group: "Dissolve" },
  { value: VideoTransitionType.CROSS_BLUR, label: "Cross Blur", group: "Dissolve" },
  // Slide
  { value: VideoTransitionType.SLIDE_LEFT, label: "Push Left", group: "Slide" },
  { value: VideoTransitionType.SLIDE_RIGHT, label: "Push Right", group: "Slide" },
  { value: VideoTransitionType.SLIDE_UP, label: "Push Up", group: "Slide" },
  { value: VideoTransitionType.SLIDE_DOWN, label: "Push Down", group: "Slide" },
  // Wipe
  { value: VideoTransitionType.WIPE_LEFT, label: "Wipe Left", group: "Wipe" },
  { value: VideoTransitionType.WIPE_RIGHT, label: "Wipe Right", group: "Wipe" },
  { value: VideoTransitionType.WIPE_UP, label: "Wipe Up", group: "Wipe" },
  { value: VideoTransitionType.WIPE_DOWN, label: "Wipe Down", group: "Wipe" },
  // Zoom
  { value: VideoTransitionType.ZOOM_IN, label: "Zoom In", group: "Zoom" },
  { value: VideoTransitionType.ZOOM_OUT, label: "Zoom Out", group: "Zoom" },
  // Iris
  { value: VideoTransitionType.IRIS_CIRCLE, label: "Iris Round", group: "Iris" },
  { value: VideoTransitionType.IRIS_RECTANGLE, label: "Iris Box", group: "Iris" },
  // 3D
  { value: VideoTransitionType.FLIP_HORIZONTAL, label: "Flip Over", group: "3D Motion" },
];

const AUDIO_TRANSITION_OPTIONS: Array<{ value: AudioTransitionType; label: string }> = [
  { value: AudioTransitionType.CROSSFADE_LINEAR, label: "Crossfade (Linear)" },
  { value: AudioTransitionType.CROSSFADE_CONSTANT_POWER, label: "Crossfade (Constant Power)" },
  { value: AudioTransitionType.CROSSFADE_EXPONENTIAL, label: "Crossfade (Exponential)" },
  { value: AudioTransitionType.FADE_IN_LINEAR, label: "Fade In" },
  { value: AudioTransitionType.FADE_OUT_LINEAR, label: "Fade Out" },
];

// Group video transitions by category
const VIDEO_TRANSITION_GROUPS = VIDEO_TRANSITION_OPTIONS.reduce((groups, option) => {
  if (!groups[option.group]) groups[option.group] = [];
  groups[option.group].push(option);
  return groups;
}, {} as Record<string, typeof VIDEO_TRANSITION_OPTIONS>);

// ==========================================
// MAIN COMPONENT
// ==========================================

export const TransitionInspector: React.FC<TransitionInspectorProps> = ({
  transition,
  onUpdate,
  onRemove,
}) => {
  // Determine if this is a "between" transition using the helper
  const isBetween = isBetweenTransition(transition);
  const isAudio = transition.isAudio;

  // Calculate duration from startTime/endTime
  const duration = getTransitionDuration(transition);

  // Get current easing or default
  const currentEasing: TransitionEasing = transition.easing || { preset: EasingPreset.LINEAR };
  
  // Get bezier curve for current easing
  const currentBezier = useMemo(() => {
    if (currentEasing.preset === EasingPreset.CUSTOM && currentEasing.bezier) {
      return currentEasing.bezier;
    }
    return EASING_BEZIER_CURVES[currentEasing.preset as Exclude<EasingPreset, EasingPreset.CUSTOM>] || EASING_BEZIER_CURVES[EasingPreset.LINEAR];
  }, [currentEasing]);

  // Handle type change
  const handleTypeChange = useCallback((value: string) => {
    onUpdate({ type: value as any });
  }, [onUpdate]);

  // Handle duration change - adjusts endTime while keeping startTime fixed
  const handleDurationChange = useCallback((newDuration: number) => {
    // Keep the center point fixed for between transitions
    // For standalone transitions, keep startTime fixed
    if (isBetween) {
      const center = (transition.startTime + transition.endTime) / 2;
      const halfDuration = newDuration / 2;
      onUpdate({
        startTime: center - halfDuration,
        endTime: center + halfDuration,
      });
    } else {
      onUpdate({
        endTime: transition.startTime + newDuration,
      });
    }
  }, [onUpdate, transition.startTime, transition.endTime, isBetween]);

  // Handle easing change via bezier editor
  const handleBezierChange = useCallback((bezier: BezierCurve) => {
    onUpdate({
      easing: {
        preset: EasingPreset.CUSTOM,
        bezier: bezier,
      },
    });
  }, [onUpdate]);

  // Get transition type display name
  const getTransitionTypeName = (type: string) => {
    const videoOption = VIDEO_TRANSITION_OPTIONS.find(opt => opt.value === type);
    if (videoOption) return videoOption.label;
    const audioOption = AUDIO_TRANSITION_OPTIONS.find(opt => opt.value === type);
    if (audioOption) return audioOption.label;
    return type.charAt(0).toUpperCase() + type.slice(1).replace(/([A-Z])/g, ' $1').trim();
  };

  return (
    <div className="p-3 space-y-4">
      {/* Header with icon and delete button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isBetween ? (
            <ArrowLeftRight className="w-4 h-4 text-purple-400" />
          ) : (
            <Shuffle className="w-4 h-4 text-blue-400" />
          )}
          <span className="text-sm font-medium">
            {isBetween ? "Between Transition" : (transition.position === 'in' ? "In Transition" : "Out Transition")}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Transition Type */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Type</Label>
        {isAudio ? (
          <Select value={transition.type} onValueChange={handleTypeChange}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AUDIO_TRANSITION_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Select value={transition.type} onValueChange={handleTypeChange}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(VIDEO_TRANSITION_GROUPS).map(([group, options]) => (
                <SelectGroup key={group}>
                  <SelectLabel className="text-[10px] text-muted-foreground">{group}</SelectLabel>
                  {options.map(opt => (
                    <SelectItem key={opt.value} value={opt.value} className="text-xs">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Duration (derived from startTime/endTime) */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Timer className="h-3 w-3 text-muted-foreground" />
          <Label className="text-xs text-muted-foreground flex-1">Duration</Label>
          <DraggableNumber
            value={duration}
            onChange={handleDurationChange}
            suffix="s"
            decimals={2}
            step={0.05}
            min={0.1}
            max={5}
            sensitivity={0.02}
            className="w-20"
          />
        </div>
        <Slider
          value={[duration]}
          onValueChange={([val]) => handleDurationChange(val)}
          min={0.1}
          max={3}
          step={0.05}
          className="w-full"
        />
        {/* Duration presets */}
        <div className="flex gap-1">
          {[0.25, 0.5, 1.0, 1.5, 2.0].map(dur => (
            <Button
              key={dur}
              variant="ghost"
              size="sm"
              className={cn(
                "flex-1 h-6 text-[10px]",
                Math.abs(duration - dur) < 0.01 && "bg-accent"
              )}
              onClick={() => handleDurationChange(dur)}
            >
              {dur}s
            </Button>
          ))}
        </div>
      </div>

      {/* Timing info (read-only display) */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Timing</Label>
        <div className="flex gap-2 text-xs text-muted-foreground">
          <span>Start: {transition.startTime.toFixed(2)}s</span>
          <span>→</span>
          <span>End: {transition.endTime.toFixed(2)}s</span>
        </div>
      </div>

      {/* Easing Curve Editor */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Easing Curve</Label>
        <BezierCurveEditor
          value={currentBezier as BezierCurve}
          onChange={handleBezierChange}
          width={180}
          height={140}
          showPresets={true}
          showCopy={true}
          showInputs={true}
        />
      </div>
    </div>
  );
};

export default TransitionInspector;
