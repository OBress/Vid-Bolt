import React from "react";
import { ClipOverlay } from "../../../types";
import { MediaFilterPresetSelector } from "../common/media-filter-preset-selector";
import { MediaPaddingControls } from "../common/media-padding-controls";
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
  Palette, 
  Square, 
  Sun, 
  Contrast, 
  Droplets, 
  Circle,
  RotateCcw
} from "lucide-react";

/**
 * Helper to parse a CSS filter value
 */
const parseFilterValue = (filter: string | undefined, property: string, defaultValue: number = 100): number => {
  if (!filter) return defaultValue;
  const regex = new RegExp(`${property}\\(([\\d.]+)(%|px)?\\)`);
  const match = filter.match(regex);
  return match ? parseFloat(match[1]) : defaultValue;
};

/**
 * Helper to update a CSS filter property while preserving others
 */
const updateFilterProperty = (currentFilter: string | undefined, property: string, value: number, unit: string = '%'): string => {
  const filter = currentFilter || '';
  const regex = new RegExp(`${property}\\([\\d.]+(%|px)?\\)`, 'g');
  const newValue = `${property}(${value}${unit})`;
  
  if (regex.test(filter)) {
    return filter.replace(regex, newValue).trim();
  }
  return `${filter} ${newValue}`.trim();
};

interface VideoStylePanelProps {
  localOverlay: ClipOverlay;
  handleStyleChange: (updates: Partial<ClipOverlay["styles"]>) => void;
}

export const VideoStylePanel: React.FC<VideoStylePanelProps> = ({
  localOverlay,
  handleStyleChange,
}) => {
  const opacity = localOverlay?.styles?.opacity ?? 1;
  const borderRadius = parseInt(localOverlay?.styles?.borderRadius ?? "0");
  const brightness = parseFilterValue(localOverlay?.styles?.filter, 'brightness', 100);
  const contrast = parseFilterValue(localOverlay?.styles?.filter, 'contrast', 100);
  const saturation = parseFilterValue(localOverlay?.styles?.filter, 'saturate', 100);
  const blur = parseFilterValue(localOverlay?.styles?.filter, 'blur', 0);

  const hasChanges = opacity !== 1 || borderRadius > 0 || brightness !== 100 || 
                     contrast !== 100 || saturation !== 100 || blur > 0;

  return (
    <div className="space-y-3">
      {/* Fit & Shape */}
      <div className="bg-neutral-900/50 rounded-lg p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Square className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Fit & Shape</span>
        </div>

        {/* Object Fit */}
        <div className="space-y-2">
          <span className="text-xs text-muted-foreground">Object Fit</span>
          <Select
            value={localOverlay?.styles?.objectFit ?? "cover"}
            onValueChange={(value) => handleStyleChange({ objectFit: value as any })}
          >
            <SelectTrigger className="w-full h-9 bg-neutral-800 border-none text-sm">
              <SelectValue placeholder="Select fit" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cover">Cover</SelectItem>
              <SelectItem value="contain">Contain</SelectItem>
              <SelectItem value="fill">Fill</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Border Radius */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Corner Radius</span>
            <span className="text-xs text-muted-foreground tabular-nums">{borderRadius}px</span>
          </div>
          <Slider
            value={[borderRadius]}
            onValueChange={(value) => handleStyleChange({ borderRadius: `${value[0]}px` })}
            min={0}
            max={50}
            step={1}
            className="flex-1"
          />
        </div>
      </div>

      {/* Color & Effects */}
      <div className="bg-neutral-900/50 rounded-lg p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Color & Effects</span>
        </div>

        {/* Opacity */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Circle className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Opacity</span>
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">
              {Math.round(opacity * 100)}%
            </span>
          </div>
          <Slider
            value={[opacity]}
            onValueChange={(value) => handleStyleChange({ opacity: value[0] })}
            min={0}
            max={1}
            step={0.01}
            className="flex-1"
          />
        </div>

        {/* Brightness */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sun className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Brightness</span>
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">{brightness}%</span>
          </div>
          <Slider
            value={[brightness]}
            onValueChange={(value) => {
              const newFilter = updateFilterProperty(localOverlay?.styles?.filter, 'brightness', value[0]);
              handleStyleChange({ filter: newFilter });
            }}
            min={0}
            max={200}
            step={1}
            className="flex-1"
          />
        </div>

        {/* Contrast */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Contrast className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Contrast</span>
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">{contrast}%</span>
          </div>
          <Slider
            value={[contrast]}
            onValueChange={(value) => {
              const newFilter = updateFilterProperty(localOverlay?.styles?.filter, 'contrast', value[0]);
              handleStyleChange({ filter: newFilter });
            }}
            min={0}
            max={200}
            step={1}
            className="flex-1"
          />
        </div>

        {/* Saturation */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Droplets className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Saturation</span>
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">{saturation}%</span>
          </div>
          <Slider
            value={[saturation]}
            onValueChange={(value) => {
              const newFilter = updateFilterProperty(localOverlay?.styles?.filter, 'saturate', value[0]);
              handleStyleChange({ filter: newFilter });
            }}
            min={0}
            max={200}
            step={1}
            className="flex-1"
          />
        </div>

        {/* Blur */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Blur</span>
            <span className="text-xs text-muted-foreground tabular-nums">{blur}px</span>
          </div>
          <Slider
            value={[blur]}
            onValueChange={(value) => {
              const newFilter = updateFilterProperty(localOverlay?.styles?.filter, 'blur', value[0], 'px');
              handleStyleChange({ filter: newFilter });
            }}
            min={0}
            max={20}
            step={0.5}
            className="flex-1"
          />
        </div>

        {/* Reset Button */}
        {hasChanges && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs h-8 text-muted-foreground hover:text-foreground"
            onClick={() => handleStyleChange({ filter: '', opacity: 1, borderRadius: '0px' })}
          >
            <RotateCcw className="h-3 w-3 mr-2" />
            Reset All Effects
          </Button>
        )}
      </div>

      {/* Filter Presets */}
      <div className="bg-neutral-900/50 rounded-lg p-4 space-y-3">
        <span className="text-sm font-medium text-foreground">Filter Presets</span>
        <MediaFilterPresetSelector
          localOverlay={localOverlay}
          handleStyleChange={handleStyleChange}
        />
      </div>

      {/* Padding Controls */}
      <div className="bg-neutral-900/50 rounded-lg p-4 space-y-3">
        <MediaPaddingControls
          localOverlay={localOverlay}
          handleStyleChange={handleStyleChange}
        />
      </div>
    </div>
  );
};
