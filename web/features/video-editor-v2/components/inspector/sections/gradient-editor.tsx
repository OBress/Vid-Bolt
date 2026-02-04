/**
 * GradientEditor - Reusable gradient editor component
 * 
 * Features:
 * - Linear/Radial gradient type selector
 * - Angle control (for linear)
 * - Gradient stop editor (add/remove/edit stops)
 * - Visual gradient preview
 * - Preset gradients
 */

import React, { useCallback } from "react";
import { Gradient, GradientType, GradientStop, GRADIENT_PRESETS, createLinearGradient } from "../../../types/gradients";
import { Button } from "../../ui/button";
import { Slider } from "../../ui/slider";
import { DraggableNumber } from "../../ui/draggable-number";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";
import { Plus, Trash2, Palette } from "lucide-react";
import { cn } from "../../../utils/general/utils";

// ==========================================
// TYPES
// ==========================================

interface GradientEditorProps {
  gradient: Gradient | undefined;
  onChange: (gradient: Gradient | undefined) => void;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
}

// ==========================================
// GRADIENT STOP EDITOR
// ==========================================

interface GradientStopEditorProps {
  stop: GradientStop;
  index: number;
  onUpdate: (index: number, stop: GradientStop) => void;
  onRemove: (index: number) => void;
  canRemove: boolean;
}

const GradientStopEditor: React.FC<GradientStopEditorProps> = ({
  stop,
  index,
  onUpdate,
  onRemove,
  canRemove,
}) => {
  return (
    <div className="flex items-center gap-2 p-2 rounded bg-neutral-800/50 border border-neutral-700/50">
      <Input
        type="color"
        value={stop.color}
        onChange={(e) => onUpdate(index, { ...stop, color: e.target.value })}
        className="h-8 w-12 p-1 cursor-pointer"
      />
      <Input
        type="text"
        value={stop.color}
        onChange={(e) => onUpdate(index, { ...stop, color: e.target.value })}
        className="flex-1 h-8 text-xs font-mono"
        placeholder="#000000"
      />
      <div className="w-20">
        <DraggableNumber
          value={stop.offset}
          onChange={(value) => onUpdate(index, { ...stop, offset: value })}
          suffix="%"
          decimals={0}
          min={0}
          max={100}
        />
      </div>
      {canRemove && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:bg-destructive/10"
          onClick={() => onRemove(index)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
};

// ==========================================
// GRADIENT PREVIEW
// ==========================================

interface GradientPreviewProps {
  gradient: Gradient;
}

const GradientPreview: React.FC<GradientPreviewProps> = ({ gradient }) => {
  const stops = gradient.stops
    .map(stop => `${stop.color} ${stop.offset}%`)
    .join(', ');

  const gradientCSS =
    gradient.type === GradientType.RADIAL
      ? `radial-gradient(circle, ${stops})`
      : `linear-gradient(${gradient.angle || 0}deg, ${stops})`;

  return (
    <div
      className="w-full h-12 rounded border border-neutral-700/50"
      style={{ background: gradientCSS }}
    />
  );
};

// ==========================================
// MAIN COMPONENT
// ==========================================

export const GradientEditor: React.FC<GradientEditorProps> = ({
  gradient,
  onChange,
  enabled,
  onEnabledChange,
}) => {
  const activeGradient = gradient || createLinearGradient();

  const handleTypeChange = useCallback((type: string) => {
    onChange({
      ...activeGradient,
      type: type as GradientType,
    });
  }, [activeGradient, onChange]);

  const handleAngleChange = useCallback((angle: number) => {
    onChange({
      ...activeGradient,
      angle,
    });
  }, [activeGradient, onChange]);

  const handleStopUpdate = useCallback((index: number, stop: GradientStop) => {
    const newStops = [...activeGradient.stops];
    newStops[index] = stop;
    onChange({
      ...activeGradient,
      stops: newStops,
    });
  }, [activeGradient, onChange]);

  const handleStopRemove = useCallback((index: number) => {
    if (activeGradient.stops.length <= 2) return; // Need at least 2 stops
    const newStops = activeGradient.stops.filter((_, i) => i !== index);
    onChange({
      ...activeGradient,
      stops: newStops,
    });
  }, [activeGradient, onChange]);

  const handleAddStop = useCallback(() => {
    const newOffset = activeGradient.stops.length > 0
      ? Math.min(100, Math.max(...activeGradient.stops.map(s => s.offset)) + 10)
      : 50;
    
    onChange({
      ...activeGradient,
      stops: [
        ...activeGradient.stops,
        { color: '#ffffff', offset: newOffset },
      ],
    });
  }, [activeGradient, onChange]);

  const handlePresetSelect = useCallback((presetKey: string) => {
    const preset = GRADIENT_PRESETS[presetKey];
    if (preset) {
      onChange(preset);
      onEnabledChange(true);
    }
  }, [onChange, onEnabledChange]);

  return (
    <div className="space-y-3">
      {/* Enable/Disable Toggle */}
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">Gradient</Label>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onEnabledChange(!enabled)}
          className={cn(
            "h-7 text-xs",
            enabled ? "text-blue-400" : "text-muted-foreground"
          )}
        >
          {enabled ? "Enabled" : "Disabled"}
        </Button>
      </div>

      {enabled && (
        <>
          {/* Preview */}
          <GradientPreview gradient={activeGradient} />

          {/* Type Selector */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Type</Label>
            <Select
              value={activeGradient.type}
              onValueChange={handleTypeChange}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={GradientType.LINEAR}>Linear</SelectItem>
                <SelectItem value={GradientType.RADIAL}>Radial</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Angle (Linear only) */}
          {activeGradient.type === GradientType.LINEAR && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Angle</Label>
              <div className="flex items-center gap-3">
                <Slider
                  value={[activeGradient.angle || 0]}
                  onValueChange={([value]) => handleAngleChange(value)}
                  min={0}
                  max={360}
                  step={1}
                  className="flex-1"
                />
                <div className="w-16">
                  <DraggableNumber
                    value={activeGradient.angle || 0}
                    onChange={handleAngleChange}
                    suffix="°"
                    decimals={0}
                    min={0}
                    max={360}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Gradient Stops */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Color Stops</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleAddStop}
                className="h-6 text-xs"
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Stop
              </Button>
            </div>
            <div className="space-y-2">
              {activeGradient.stops.map((stop, index) => (
                <GradientStopEditor
                  key={index}
                  stop={stop}
                  index={index}
                  onUpdate={handleStopUpdate}
                  onRemove={handleStopRemove}
                  canRemove={activeGradient.stops.length > 2}
                />
              ))}
            </div>
          </div>

          {/* Presets */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Presets</Label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(GRADIENT_PRESETS).map(([key, preset]) => {
                const stops = preset.stops
                  .map(stop => `${stop.color} ${stop.offset}%`)
                  .join(', ');
                const gradientCSS =
                  preset.type === GradientType.RADIAL
                    ? `radial-gradient(circle, ${stops})`
                    : `linear-gradient(${preset.angle || 0}deg, ${stops})`;

                return (
                  <button
                    key={key}
                    onClick={() => handlePresetSelect(key)}
                    className="h-10 rounded border border-neutral-700/50 hover:border-blue-400 transition-colors cursor-pointer"
                    style={{ background: gradientCSS }}
                    title={key}
                  />
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default GradientEditor;
