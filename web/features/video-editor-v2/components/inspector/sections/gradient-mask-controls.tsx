/**
 * GradientMaskControls - Controls for editing gradient masks
 * 
 * Provides UI for configuring gradient masks including:
 * - Linear gradient: angle, start/end points
 * - Radial gradient: center position, radius
 * - Angular gradient: center, start angle
 * - Multi-stop gradient: custom stops editor
 */

import React, { useState, useCallback, useMemo } from "react";
import { cn } from "../../../utils/general/utils";
import { DraggableNumber } from "../../ui/draggable-number";
import { Slider } from "../../ui/slider";
import { Button } from "../../ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";
import {
  GradientMask,
  GradientMaskType,
  LinearGradientMask,
  RadialGradientMask,
  AngularGradientMask,
  MultiStopGradientMask,
  GradientStop,
  LinearGradientConfig,
  RadialGradientConfig,
  AngularGradientConfig,
} from "../../../types/masks";
import {
  ArrowRight,
  Target,
  RotateCw,
  Sliders,
  Plus,
  Trash2,
  Move,
  Maximize2,
} from "lucide-react";

// ==========================================
// TYPES
// ==========================================

interface GradientMaskControlsProps {
  /** The gradient mask to edit */
  mask: GradientMask;
  /** Callback when mask is updated */
  onUpdate: (updates: Partial<GradientMask>) => void;
  /** Additional className */
  className?: string;
}

// ==========================================
// SECTION HEADER COMPONENT
// ==========================================

interface SectionHeaderProps {
  icon: React.ElementType;
  title: string;
  children?: React.ReactNode;
}

const SectionHeader: React.FC<SectionHeaderProps> = ({ icon: Icon, title, children }) => (
  <div className="flex items-center justify-between mb-3">
    <div className="flex items-center gap-2">
      {React.createElement(Icon, { className: "h-3.5 w-3.5 text-muted-foreground" })}
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {title}
      </span>
    </div>
    {children}
  </div>
);

// ==========================================
// GRADIENT STOP EDITOR
// ==========================================

interface GradientStopEditorProps {
  stops: GradientStop[];
  onChange: (stops: GradientStop[]) => void;
}

const GradientStopEditor: React.FC<GradientStopEditorProps> = ({
  stops,
  onChange,
}) => {
  const handleStopChange = useCallback((index: number, updates: Partial<GradientStop>) => {
    const newStops = [...stops];
    newStops[index] = { ...newStops[index], ...updates };
    // Sort by position
    newStops.sort((a, b) => a.position - b.position);
    onChange(newStops);
  }, [stops, onChange]);

  const handleAddStop = useCallback(() => {
    // Add stop at midpoint
    const newPosition = stops.length > 0
      ? (stops[0].position + (stops[stops.length - 1]?.position ?? 1)) / 2
      : 0.5;
    const newStops = [...stops, { position: newPosition, opacity: 0.5 }];
    newStops.sort((a, b) => a.position - b.position);
    onChange(newStops);
  }, [stops, onChange]);

  const handleRemoveStop = useCallback((index: number) => {
    if (stops.length <= 2) return; // Keep at least 2 stops
    const newStops = stops.filter((_, i) => i !== index);
    onChange(newStops);
  }, [stops, onChange]);

  return (
    <div className="space-y-3">
      {/* Visual gradient preview */}
      <div className="relative h-6 rounded-md overflow-hidden border border-neutral-700/50">
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(to right, ${stops
              .map(s => `rgba(255,255,255,${s.opacity}) ${s.position * 100}%`)
              .join(', ')})`,
          }}
        />
        {/* Stop markers */}
        {stops.map((stop, index) => (
          <div
            key={index}
            className="absolute top-0 w-2 h-full cursor-pointer"
            style={{ left: `calc(${stop.position * 100}% - 4px)` }}
          >
            <div className={cn(
              "w-2 h-full border-2 rounded-sm",
              stop.opacity > 0.5 ? "border-black" : "border-white",
              "bg-gradient-to-b from-white/80 to-white/40"
            )} />
          </div>
        ))}
      </div>

      {/* Stop list */}
      <div className="space-y-2">
        {stops.map((stop, index) => (
          <div key={index} className="flex items-center gap-2">
            <div className="flex-1 grid grid-cols-2 gap-2">
              <DraggableNumber
                label="Position"
                value={Math.round(stop.position * 100)}
                onChange={(v) => handleStopChange(index, { position: v / 100 })}
                min={0}
                max={100}
                step={1}
                decimals={0}
                suffix="%"
              />
              <DraggableNumber
                label="Opacity"
                value={Math.round(stop.opacity * 100)}
                onChange={(v) => handleStopChange(index, { opacity: v / 100 })}
                min={0}
                max={100}
                step={1}
                decimals={0}
                suffix="%"
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-destructive"
              onClick={() => handleRemoveStop(index)}
              disabled={stops.length <= 2}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>

      {/* Add stop button */}
      <Button
        variant="outline"
        size="sm"
        className="w-full h-7 text-xs"
        onClick={handleAddStop}
      >
        <Plus className="h-3 w-3 mr-1" />
        Add Stop
      </Button>
    </div>
  );
};

// ==========================================
// LINEAR GRADIENT CONTROLS
// ==========================================

interface LinearGradientControlsProps {
  config: LinearGradientConfig;
  onUpdate: (config: LinearGradientConfig) => void;
}

const LinearGradientControls: React.FC<LinearGradientControlsProps> = ({
  config,
  onUpdate,
}) => {
  // Angle presets
  const anglePresets = [
    { label: '→', angle: 0, title: 'Left to Right' },
    { label: '↘', angle: 45, title: 'Top-Left to Bottom-Right' },
    { label: '↓', angle: 90, title: 'Top to Bottom' },
    { label: '↙', angle: 135, title: 'Top-Right to Bottom-Left' },
    { label: '←', angle: 180, title: 'Right to Left' },
    { label: '↖', angle: 225, title: 'Bottom-Right to Top-Left' },
    { label: '↑', angle: 270, title: 'Bottom to Top' },
    { label: '↗', angle: 315, title: 'Bottom-Left to Top-Right' },
  ];

  return (
    <div className="space-y-4">
      {/* Angle control */}
      <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3">
        <SectionHeader icon={RotateCw} title="Angle" />
        
        {/* Angle presets */}
        <div className="grid grid-cols-8 gap-1 mb-3">
          {anglePresets.map((preset) => (
            <button
              key={preset.angle}
              onClick={() => onUpdate({ ...config, angle: preset.angle })}
              className={cn(
                "aspect-square rounded flex items-center justify-center text-sm transition-colors",
                config.angle === preset.angle
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
              title={preset.title}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Custom angle */}
        <div className="flex items-center gap-3">
          <Slider
            value={[config.angle]}
            onValueChange={([v]) => onUpdate({ ...config, angle: v })}
            min={0}
            max={360}
            step={1}
            className="flex-1"
          />
          <div className="w-16">
            <DraggableNumber
              value={config.angle}
              onChange={(v) => onUpdate({ ...config, angle: v })}
              suffix="°"
              decimals={0}
              step={1}
              min={0}
              max={360}
            />
          </div>
        </div>
      </div>

      {/* Gradient stops */}
      <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3">
        <SectionHeader icon={Sliders} title="Gradient Stops" />
        <GradientStopEditor
          stops={config.stops}
          onChange={(stops) => onUpdate({ ...config, stops })}
        />
      </div>
    </div>
  );
};

// ==========================================
// RADIAL GRADIENT CONTROLS
// ==========================================

interface RadialGradientControlsProps {
  config: RadialGradientConfig;
  onUpdate: (config: RadialGradientConfig) => void;
}

const RadialGradientControls: React.FC<RadialGradientControlsProps> = ({
  config,
  onUpdate,
}) => {
  // Center presets
  const centerPresets = [
    { label: '↖', x: 25, y: 25 },
    { label: '↑', x: 50, y: 25 },
    { label: '↗', x: 75, y: 25 },
    { label: '←', x: 25, y: 50 },
    { label: '●', x: 50, y: 50 },
    { label: '→', x: 75, y: 50 },
    { label: '↙', x: 25, y: 75 },
    { label: '↓', x: 50, y: 75 },
    { label: '↘', x: 75, y: 75 },
  ];

  return (
    <div className="space-y-4">
      {/* Center position */}
      <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3">
        <SectionHeader icon={Move} title="Center Position" />
        
        {/* Position presets */}
        <div className="grid grid-cols-3 gap-1 mb-3 w-20 mx-auto">
          {centerPresets.map((preset) => (
            <button
              key={`${preset.x}-${preset.y}`}
              onClick={() => onUpdate({ ...config, centerX: preset.x, centerY: preset.y })}
              className={cn(
                "aspect-square rounded flex items-center justify-center text-xs transition-colors",
                config.centerX === preset.x && config.centerY === preset.y
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Custom position */}
        <div className="grid grid-cols-2 gap-2">
          <DraggableNumber
            label="X"
            value={config.centerX}
            onChange={(v) => onUpdate({ ...config, centerX: v })}
            suffix="%"
            decimals={1}
            step={0.5}
            min={0}
            max={100}
          />
          <DraggableNumber
            label="Y"
            value={config.centerY}
            onChange={(v) => onUpdate({ ...config, centerY: v })}
            suffix="%"
            decimals={1}
            step={0.5}
            min={0}
            max={100}
          />
        </div>
      </div>

      {/* Radius */}
      <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3">
        <SectionHeader icon={Maximize2} title="Radius" />
        <div className="grid grid-cols-2 gap-2">
          <DraggableNumber
            label="X Radius"
            value={config.radiusX}
            onChange={(v) => onUpdate({ ...config, radiusX: v })}
            suffix="%"
            decimals={1}
            step={0.5}
            min={1}
            max={100}
          />
          <DraggableNumber
            label="Y Radius"
            value={config.radiusY}
            onChange={(v) => onUpdate({ ...config, radiusY: v })}
            suffix="%"
            decimals={1}
            step={0.5}
            min={1}
            max={100}
          />
        </div>
      </div>

      {/* Gradient stops */}
      <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3">
        <SectionHeader icon={Sliders} title="Gradient Stops" />
        <GradientStopEditor
          stops={config.stops}
          onChange={(stops) => onUpdate({ ...config, stops })}
        />
      </div>
    </div>
  );
};

// ==========================================
// ANGULAR GRADIENT CONTROLS
// ==========================================

interface AngularGradientControlsProps {
  config: AngularGradientConfig;
  onUpdate: (config: AngularGradientConfig) => void;
}

const AngularGradientControls: React.FC<AngularGradientControlsProps> = ({
  config,
  onUpdate,
}) => {
  return (
    <div className="space-y-4">
      {/* Center position */}
      <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3">
        <SectionHeader icon={Move} title="Center Position" />
        <div className="grid grid-cols-2 gap-2">
          <DraggableNumber
            label="X"
            value={config.centerX}
            onChange={(v) => onUpdate({ ...config, centerX: v })}
            suffix="%"
            decimals={1}
            step={0.5}
            min={0}
            max={100}
          />
          <DraggableNumber
            label="Y"
            value={config.centerY}
            onChange={(v) => onUpdate({ ...config, centerY: v })}
            suffix="%"
            decimals={1}
            step={0.5}
            min={0}
            max={100}
          />
        </div>
      </div>

      {/* Start angle */}
      <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3">
        <SectionHeader icon={RotateCw} title="Start Angle" />
        <div className="flex items-center gap-3">
          <Slider
            value={[config.startAngle]}
            onValueChange={([v]) => onUpdate({ ...config, startAngle: v })}
            min={0}
            max={360}
            step={1}
            className="flex-1"
          />
          <div className="w-16">
            <DraggableNumber
              value={config.startAngle}
              onChange={(v) => onUpdate({ ...config, startAngle: v })}
              suffix="°"
              decimals={0}
              step={1}
              min={0}
              max={360}
            />
          </div>
        </div>
      </div>

      {/* Gradient stops */}
      <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3">
        <SectionHeader icon={Sliders} title="Gradient Stops" />
        <GradientStopEditor
          stops={config.stops}
          onChange={(stops) => onUpdate({ ...config, stops })}
        />
      </div>
    </div>
  );
};

// ==========================================
// MULTI-STOP GRADIENT CONTROLS
// ==========================================

interface MultiStopGradientControlsProps {
  mask: MultiStopGradientMask;
  onUpdate: (updates: Partial<MultiStopGradientMask>) => void;
}

const MultiStopGradientControls: React.FC<MultiStopGradientControlsProps> = ({
  mask,
  onUpdate,
}) => {
  const handleBaseTypeChange = (baseType: 'linear' | 'radial') => {
    if (baseType === 'linear') {
      onUpdate({
        baseType,
        config: {
          angle: 90,
          stops: mask.config.stops,
        } as LinearGradientConfig,
      });
    } else {
      onUpdate({
        baseType,
        config: {
          centerX: 50,
          centerY: 50,
          radiusX: 50,
          radiusY: 50,
          stops: mask.config.stops,
        } as RadialGradientConfig,
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Base type selector */}
      <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3">
        <SectionHeader icon={Sliders} title="Gradient Type" />
        <Select
          value={mask.baseType}
          onValueChange={(v) => handleBaseTypeChange(v as 'linear' | 'radial')}
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="linear">Linear</SelectItem>
            <SelectItem value="radial">Radial</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Type-specific controls */}
      {mask.baseType === 'linear' ? (
        <LinearGradientControls
          config={mask.config as LinearGradientConfig}
          onUpdate={(config) => onUpdate({ config })}
        />
      ) : (
        <RadialGradientControls
          config={mask.config as RadialGradientConfig}
          onUpdate={(config) => onUpdate({ config })}
        />
      )}
    </div>
  );
};

// ==========================================
// MAIN COMPONENT
// ==========================================

export const GradientMaskControls: React.FC<GradientMaskControlsProps> = ({
  mask,
  onUpdate,
  className,
}) => {
  // Get gradient type icon
  const getIcon = () => {
    switch (mask.gradientType) {
      case GradientMaskType.LINEAR: return ArrowRight;
      case GradientMaskType.RADIAL: return Target;
      case GradientMaskType.ANGULAR: return RotateCw;
      case GradientMaskType.MULTI_STOP: return Sliders;
      default: return Sliders;
    }
  };

  const Icon = getIcon();

  // Render type-specific controls
  const renderControls = () => {
    switch (mask.gradientType) {
      case GradientMaskType.LINEAR:
        return (
          <LinearGradientControls
            config={(mask as LinearGradientMask).config}
            onUpdate={(config) => onUpdate({ config } as any)}
          />
        );

      case GradientMaskType.RADIAL:
        return (
          <RadialGradientControls
            config={(mask as RadialGradientMask).config}
            onUpdate={(config) => onUpdate({ config } as any)}
          />
        );

      case GradientMaskType.ANGULAR:
        return (
          <AngularGradientControls
            config={(mask as AngularGradientMask).config}
            onUpdate={(config) => onUpdate({ config } as any)}
          />
        );

      case GradientMaskType.MULTI_STOP:
        return (
          <MultiStopGradientControls
            mask={mask as MultiStopGradientMask}
            onUpdate={onUpdate as any}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">
          {mask.gradientType === GradientMaskType.LINEAR && 'Linear Gradient'}
          {mask.gradientType === GradientMaskType.RADIAL && 'Radial Gradient'}
          {mask.gradientType === GradientMaskType.ANGULAR && 'Angular Gradient'}
          {mask.gradientType === GradientMaskType.MULTI_STOP && 'Multi-Stop Gradient'}
        </span>
      </div>

      {/* Type-specific controls */}
      {renderControls()}
    </div>
  );
};

export default GradientMaskControls;
