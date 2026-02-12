/**
 * ImageSection - Inspector section for image-specific properties
 *
 * Properties:
 * - Object fit
 * - Border radius
 * - Border
 * - Filters (brightness, contrast, saturation, etc.)
 * - Crop controls
 */

import React, { useCallback, useState } from "react";
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
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";
import { ColorPicker } from "../../ui/color-picker";
import { ImageOverlay } from "../../../types";
import {
  Maximize2,
  Square,
  Crop,
  RefreshCw,
  SunMedium,
  Contrast,
  Droplets,
  CircleDot,
  Move,
  ZoomIn,
  Video,
} from "lucide-react";
import { generateClipPath } from "../../../utils/crop-utils";

// ==========================================
// TYPES
// ==========================================

interface ImageSectionProps {
  overlay: ImageOverlay;
  onUpdate: (updates: Partial<ImageOverlay>) => void;
  onUpdateStyles: (updates: Partial<ImageOverlay["styles"]>) => void;
}

// ==========================================
// CONSTANTS
// ==========================================

const OBJECT_FIT_OPTIONS = [
  { value: "contain", label: "Contain" },
  { value: "cover", label: "Cover" },
  { value: "fill", label: "Fill" },
  { value: "none", label: "None" },
  { value: "scale-down", label: "Scale Down" },
];

// ==========================================
// FILTER CONTROLS
// ==========================================

interface FilterControlProps {
  label: string;
  icon: React.ElementType;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  defaultValue: number;
  onChange: (value: number) => void;
}

const FilterControl: React.FC<FilterControlProps> = ({
  label,
  icon: Icon,
  value,
  min,
  max,
  step = 1,
  unit = "",
  defaultValue,
  onChange,
}) => {
  const displayValue = unit === "%" ? Math.round(value * 100) : value;
  const isDefault = Math.abs(value - defaultValue) < 0.01;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground flex items-center gap-1">
          {React.createElement(Icon, { className: "h-3 w-3" })}
          {label}
        </Label>
        <span className={cn(
          "text-xs font-mono",
          isDefault ? "text-muted-foreground" : "text-foreground"
        )}>
          {displayValue}{unit}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([val]) => onChange(val)}
      />
    </div>
  );
};

// ==========================================
// PARSE FILTER STRING HELPERS
// ==========================================

interface FilterValues {
  brightness: number;
  contrast: number;
  saturate: number;
  blur: number;
}

function parseFilterString(filter?: string): FilterValues {
  const defaults: FilterValues = {
    brightness: 1,
    contrast: 1,
    saturate: 1,
    blur: 0,
  };

  if (!filter) return defaults;

  // Parse brightness(x)
  const brightnessMatch = filter.match(/brightness\(([0-9.]+)\)/);
  if (brightnessMatch) {
    defaults.brightness = parseFloat(brightnessMatch[1]);
  }

  // Parse contrast(x)
  const contrastMatch = filter.match(/contrast\(([0-9.]+)\)/);
  if (contrastMatch) {
    defaults.contrast = parseFloat(contrastMatch[1]);
  }

  // Parse saturate(x)
  const saturateMatch = filter.match(/saturate\(([0-9.]+)\)/);
  if (saturateMatch) {
    defaults.saturate = parseFloat(saturateMatch[1]);
  }

  // Parse blur(xpx)
  const blurMatch = filter.match(/blur\(([0-9.]+)px\)/);
  if (blurMatch) {
    defaults.blur = parseFloat(blurMatch[1]);
  }

  return defaults;
}

function buildFilterString(values: FilterValues): string {
  const parts: string[] = [];

  if (Math.abs(values.brightness - 1) > 0.01) {
    parts.push(`brightness(${values.brightness})`);
  }
  if (Math.abs(values.contrast - 1) > 0.01) {
    parts.push(`contrast(${values.contrast})`);
  }
  if (Math.abs(values.saturate - 1) > 0.01) {
    parts.push(`saturate(${values.saturate})`);
  }
  if (values.blur > 0) {
    parts.push(`blur(${values.blur}px)`);
  }

  return parts.length > 0 ? parts.join(" ") : "";
}

// ==========================================
// KEN BURNS EFFECT TYPES
// ==========================================

interface KenBurnsSettings {
  enabled: boolean;
  startScale: number;
  endScale: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

type KenBurnsPreset = 'none' | 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right' | 'pan-up' | 'pan-down';

const KEN_BURNS_PRESETS: Record<KenBurnsPreset, Partial<KenBurnsSettings>> = {
  'none': { enabled: false },
  'zoom-in': { enabled: true, startScale: 100, endScale: 120, startX: 50, startY: 50, endX: 50, endY: 50 },
  'zoom-out': { enabled: true, startScale: 120, endScale: 100, startX: 50, startY: 50, endX: 50, endY: 50 },
  'pan-left': { enabled: true, startScale: 110, endScale: 110, startX: 60, startY: 50, endX: 40, endY: 50 },
  'pan-right': { enabled: true, startScale: 110, endScale: 110, startX: 40, startY: 50, endX: 60, endY: 50 },
  'pan-up': { enabled: true, startScale: 110, endScale: 110, startX: 50, startY: 60, endX: 50, endY: 40 },
  'pan-down': { enabled: true, startScale: 110, endScale: 110, startX: 50, startY: 40, endX: 50, endY: 60 },
};

// ==========================================
// KEN BURNS SECTION COMPONENT
// ==========================================

interface KenBurnsSectionProps {
  overlay: ImageOverlay;
  onUpdate: (updates: Partial<ImageOverlay>) => void;
}

const KenBurnsSection: React.FC<KenBurnsSectionProps> = ({ overlay, onUpdate }) => {
  // Get ken burns settings from overlay
  const kenBurns: KenBurnsSettings = {
    enabled: (overlay as any).kenBurnsEnabled ?? false,
    startScale: (overlay as any).kenBurnsStartScale ?? 100,
    endScale: (overlay as any).kenBurnsEndScale ?? 100,
    startX: (overlay as any).kenBurnsStartX ?? 50,
    startY: (overlay as any).kenBurnsStartY ?? 50,
    endX: (overlay as any).kenBurnsEndX ?? 50,
    endY: (overlay as any).kenBurnsEndY ?? 50,
  };

  const updateKenBurns = (updates: Partial<KenBurnsSettings>) => {
    const newSettings = { ...kenBurns, ...updates };
    onUpdate({
      kenBurnsEnabled: newSettings.enabled,
      kenBurnsStartScale: newSettings.startScale,
      kenBurnsEndScale: newSettings.endScale,
      kenBurnsStartX: newSettings.startX,
      kenBurnsStartY: newSettings.startY,
      kenBurnsEndX: newSettings.endX,
      kenBurnsEndY: newSettings.endY,
    } as any);
  };

  const applyPreset = (preset: KenBurnsPreset) => {
    updateKenBurns(KEN_BURNS_PRESETS[preset]);
  };

  return (
    <div className="space-y-3 pt-2 border-t border-border">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground flex items-center gap-1">
          <Video className="h-3 w-3" />
          Ken Burns Effect
        </Label>
        <Switch
          checked={kenBurns.enabled}
          onCheckedChange={(checked) => updateKenBurns({ enabled: checked })}
        />
      </div>

      {kenBurns.enabled && (
        <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
          {/* Presets */}
          <div className="space-y-1.5">
            <Label className="text-[10px] text-muted-foreground">Preset</Label>
            <div className="grid grid-cols-3 gap-1">
              {(['zoom-in', 'zoom-out', 'pan-left', 'pan-right', 'pan-up', 'pan-down'] as KenBurnsPreset[]).map((preset) => (
                <Button
                  key={preset}
                  variant="outline"
                  size="sm"
                  className="h-7 text-[10px] capitalize"
                  onClick={() => applyPreset(preset)}
                >
                  {preset.replace('-', ' ')}
                </Button>
              ))}
            </div>
          </div>

          {/* Scale Controls */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                <ZoomIn className="h-2.5 w-2.5" />
                Start Scale
              </Label>
              <DraggableNumber
                value={kenBurns.startScale}
                onChange={(v) => updateKenBurns({ startScale: v })}
                suffix="%"
                decimals={0}
                step={5}
                min={50}
                max={200}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                <ZoomIn className="h-2.5 w-2.5" />
                End Scale
              </Label>
              <DraggableNumber
                value={kenBurns.endScale}
                onChange={(v) => updateKenBurns({ endScale: v })}
                suffix="%"
                decimals={0}
                step={5}
                min={50}
                max={200}
              />
            </div>
          </div>

          {/* Position Controls */}
          <div className="space-y-2">
            <Label className="text-[10px] text-muted-foreground">Start Position</Label>
            <div className="grid grid-cols-2 gap-2">
              <DraggableNumber
                label="X"
                value={kenBurns.startX}
                onChange={(v) => updateKenBurns({ startX: v })}
                suffix="%"
                decimals={0}
                step={5}
                min={0}
                max={100}
              />
              <DraggableNumber
                label="Y"
                value={kenBurns.startY}
                onChange={(v) => updateKenBurns({ startY: v })}
                suffix="%"
                decimals={0}
                step={5}
                min={0}
                max={100}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] text-muted-foreground">End Position</Label>
            <div className="grid grid-cols-2 gap-2">
              <DraggableNumber
                label="X"
                value={kenBurns.endX}
                onChange={(v) => updateKenBurns({ endX: v })}
                suffix="%"
                decimals={0}
                step={5}
                min={0}
                max={100}
              />
              <DraggableNumber
                label="Y"
                value={kenBurns.endY}
                onChange={(v) => updateKenBurns({ endY: v })}
                suffix="%"
                decimals={0}
                step={5}
                min={0}
                max={100}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ==========================================
// IMAGE SECTION COMPONENT
// ==========================================

export const ImageSection: React.FC<ImageSectionProps> = ({
  overlay,
  onUpdate,
  onUpdateStyles,
}) => {
  const styles = overlay.styles;
  const filterValues = parseFilterString(styles.filter);

  // Update filter
  const handleFilterChange = useCallback(
    (key: keyof FilterValues, value: number) => {
      const newValues = { ...filterValues, [key]: value };
      const filterStr = buildFilterString(newValues);
      onUpdateStyles({ filter: filterStr || undefined });
    },
    [filterValues, onUpdateStyles]
  );

  // Reset filters
  const handleResetFilters = useCallback(() => {
    onUpdateStyles({ filter: undefined });
  }, [onUpdateStyles]);

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

  // Check if any filters are applied
  const hasFilters =
    Math.abs(filterValues.brightness - 1) > 0.01 ||
    Math.abs(filterValues.contrast - 1) > 0.01 ||
    Math.abs(filterValues.saturate - 1) > 0.01 ||
    filterValues.blur > 0;

  return (
    <div className="space-y-4">
      {/* Object Fit */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">
          <Maximize2 className="h-3 w-3 inline mr-1" />
          Object Fit
        </Label>
        <Select
          value={styles.objectFit || "contain"}
          onValueChange={(val) =>
            onUpdateStyles({ objectFit: val as ImageOverlay["styles"]["objectFit"] })
          }
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OBJECT_FIT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Border Radius */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">
          <Square className="h-3 w-3 inline mr-1" />
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

      {/* Border */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Border</Label>
        <div className="flex items-center gap-2">
          <Input
            type="text"
            value={styles.border || ""}
            onChange={(e) => onUpdateStyles({ border: e.target.value || undefined })}
            placeholder="none"
            className="flex-1 h-7 text-xs"
          />
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" className="h-7 w-7">
                <div
                  className="w-4 h-4 rounded border border-border"
                  style={{
                    backgroundColor: extractBorderColor(styles.border) || "#ffffff",
                  }}
                />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3" align="end">
              <ColorPicker
                color={extractBorderColor(styles.border) || "#ffffff"}
                onChange={(color) => {
                  const width = extractBorderWidth(styles.border) || "1px";
                  const style = extractBorderStyle(styles.border) || "solid";
                  onUpdateStyles({ border: `${width} ${style} ${color}` });
                }}
              />
            </PopoverContent>
          </Popover>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Format: width style color (e.g., "2px solid #ffffff")
        </p>
      </div>

      {/* Filters Section */}
      <div className="space-y-3 pt-2 border-t border-border">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium">Filters</Label>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={handleResetFilters}
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Reset
            </Button>
          )}
        </div>

        <FilterControl
          label="Brightness"
          icon={SunMedium}
          value={filterValues.brightness}
          min={0}
          max={2}
          step={0.01}
          unit="%"
          defaultValue={1}
          onChange={(val) => handleFilterChange("brightness", val)}
        />

        <FilterControl
          label="Contrast"
          icon={Contrast}
          value={filterValues.contrast}
          min={0}
          max={2}
          step={0.01}
          unit="%"
          defaultValue={1}
          onChange={(val) => handleFilterChange("contrast", val)}
        />

        <FilterControl
          label="Saturation"
          icon={Droplets}
          value={filterValues.saturate}
          min={0}
          max={2}
          step={0.01}
          unit="%"
          defaultValue={1}
          onChange={(val) => handleFilterChange("saturate", val)}
        />

        <FilterControl
          label="Blur"
          icon={CircleDot}
          value={filterValues.blur}
          min={0}
          max={20}
          step={0.5}
          unit="px"
          defaultValue={0}
          onChange={(val) => handleFilterChange("blur", val)}
        />
      </div>

      {/* Ken Burns Effect Section */}
      <KenBurnsSection overlay={overlay} onUpdate={onUpdate} />

      {/* Crop Section */}
      <div className="space-y-2 pt-2 border-t border-border">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground flex items-center gap-1">
            <Crop className="h-3 w-3" />
            Crop
          </Label>
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

        {styles.cropEnabled && (
          <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">X %</Label>
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
                <Label className="text-xs text-muted-foreground">Y %</Label>
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

// Helper functions for border parsing
function extractBorderWidth(border?: string): string | null {
  if (!border) return null;
  const match = border.match(/^(\d+px)/);
  return match ? match[1] : null;
}

function extractBorderStyle(border?: string): string | null {
  if (!border) return null;
  const styles = ["solid", "dashed", "dotted", "double", "none"];
  for (const style of styles) {
    if (border.includes(style)) return style;
  }
  return null;
}

function extractBorderColor(border?: string): string | null {
  if (!border) return null;
  // Match hex color
  const hexMatch = border.match(/#[0-9a-fA-F]{3,8}/);
  if (hexMatch) return hexMatch[0];
  // Match rgb/rgba
  const rgbMatch = border.match(/rgba?\([^)]+\)/);
  if (rgbMatch) return rgbMatch[0];
  return null;
}

export default ImageSection;
