/**
 * CompositionSettingsSection - Settings for the composition
 * 
 * Allows editing composition name, duration, dimensions, and background.
 */

import React from "react";
import { cn } from "../../../../utils/general/utils";
import type { CompositionDefinition } from "../../../../types/composition";
import { Input } from "../../../ui/input";
import { Label } from "../../../ui/label";
import { Slider } from "../../../ui/slider";
import { Button } from "../../../ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "../../../ui/card";
import { Settings, Clock, Monitor, Palette } from "lucide-react";

// ==========================================
// TYPES
// ==========================================

interface CompositionSettingsSectionProps {
  composition: CompositionDefinition;
  onUpdate: (updates: Partial<CompositionDefinition>) => void;
}

// ==========================================
// PRESET DIMENSIONS
// ==========================================

const PRESET_DIMENSIONS = [
  { label: '1080p (1920×1080)', width: 1920, height: 1080 },
  { label: '720p (1280×720)', width: 1280, height: 720 },
  { label: '4K (3840×2160)', width: 3840, height: 2160 },
  { label: 'Square (1080×1080)', width: 1080, height: 1080 },
  { label: 'Portrait (1080×1920)', width: 1080, height: 1920 },
  { label: 'Instagram (1080×1350)', width: 1080, height: 1350 },
];

// ==========================================
// MAIN COMPONENT
// ==========================================

export const CompositionSettingsSection: React.FC<CompositionSettingsSectionProps> = ({
  composition,
  onUpdate,
}) => {
  const durationInSeconds = composition.duration / composition.fps;

  const handleDurationChange = (seconds: number) => {
    onUpdate({ duration: Math.round(seconds * composition.fps) });
  };

  const handlePresetSelect = (value: string) => {
    const preset = PRESET_DIMENSIONS.find(p => `${p.width}x${p.height}` === value);
    if (preset) {
      onUpdate({ width: preset.width, height: preset.height });
    }
  };

  return (
    <div className="space-y-3">
      {/* General Settings */}
      <Card className="bg-[#222225] shadow-none border-0">
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-xs font-medium flex items-center gap-2">
            <Settings className="h-3.5 w-3.5 text-blue-400" />
            General
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <div>
            <Label className="text-xs mb-1.5 block text-muted-foreground">Name</Label>
            <Input
              value={composition.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
              className="h-8 text-sm bg-[#1a1a1a] border-[#3a3a3a] focus:border-[#4a90d9]"
            />
          </div>
        </CardContent>
      </Card>

      {/* Timing Settings */}
      <Card className="bg-[#222225] shadow-none border-0">
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-xs font-medium flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-green-400" />
            Timing
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-xs text-muted-foreground">Duration</Label>
              <span className="text-xs text-muted-foreground">
                {durationInSeconds.toFixed(1)}s ({composition.duration} frames)
              </span>
            </div>
            <Slider
              value={[durationInSeconds]}
              min={0.5}
              max={30}
              step={0.5}
              onValueChange={([value]) => handleDurationChange(value)}
            />
          </div>

          <div>
            <Label className="text-xs mb-1.5 block text-muted-foreground">Frame Rate</Label>
            <Select
              value={String(composition.fps)}
              onValueChange={(value) => onUpdate({ fps: parseInt(value) })}
            >
              <SelectTrigger className="h-8 text-sm bg-[#1a1a1a] border-[#3a3a3a] focus:border-[#4a90d9]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24">24 fps (Film)</SelectItem>
                <SelectItem value="25">25 fps (PAL)</SelectItem>
                <SelectItem value="30">30 fps (Standard)</SelectItem>
                <SelectItem value="60">60 fps (Smooth)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Dimensions Settings */}
      <Card className="bg-[#222225] shadow-none border-0">
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-xs font-medium flex items-center gap-2">
            <Monitor className="h-3.5 w-3.5 text-purple-400" />
            Dimensions
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 space-y-3">
          <div>
            <Label className="text-xs mb-1.5 block text-muted-foreground">Preset</Label>
            <Select
              value={`${composition.width}x${composition.height}`}
              onValueChange={handlePresetSelect}
            >
              <SelectTrigger className="h-8 text-sm bg-[#1a1a1a] border-[#3a3a3a] focus:border-[#4a90d9]">
                <SelectValue placeholder="Custom" />
              </SelectTrigger>
              <SelectContent>
                {PRESET_DIMENSIONS.map((preset) => (
                  <SelectItem
                    key={`${preset.width}x${preset.height}`}
                    value={`${preset.width}x${preset.height}`}
                  >
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs mb-1.5 block text-muted-foreground">Width</Label>
              <Input
                type="number"
                value={composition.width}
                onChange={(e) => onUpdate({ width: parseInt(e.target.value) || 1920 })}
                className="h-8 text-sm bg-[#1a1a1a] border-[#3a3a3a] focus:border-[#4a90d9]"
                min={1}
              />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block text-muted-foreground">Height</Label>
              <Input
                type="number"
                value={composition.height}
                onChange={(e) => onUpdate({ height: parseInt(e.target.value) || 1080 })}
                className="h-8 text-sm bg-[#1a1a1a] border-[#3a3a3a] focus:border-[#4a90d9]"
                min={1}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Background Settings */}
      <Card className="bg-[#222225] shadow-none border-0">
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-xs font-medium flex items-center gap-2">
            <Palette className="h-3.5 w-3.5 text-orange-400" />
            Background
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 space-y-3">
          <div>
            <Label className="text-xs mb-1.5 block text-muted-foreground">Color</Label>
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded cursor-pointer"
                style={{ 
                  backgroundColor: composition.backgroundColor === 'transparent' 
                    ? 'transparent' 
                    : composition.backgroundColor,
                  backgroundImage: composition.backgroundColor === 'transparent'
                    ? 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)'
                    : undefined,
                  backgroundSize: '8px 8px',
                  backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px',
                }}
                onClick={() => {
                  // TODO: Open color picker
                }}
              />
              <Input
                value={composition.backgroundColor}
                onChange={(e) => onUpdate({ backgroundColor: e.target.value })}
                className="flex-1 h-8 text-sm bg-[#1a1a1a] border-[#3a3a3a] focus:border-[#4a90d9]"
                placeholder="#000000"
              />
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="w-full h-8 text-xs border-0 bg-[#1a1a1a] hover:bg-[#252525]"
            onClick={() => onUpdate({ backgroundColor: 'transparent' })}
          >
            Set Transparent
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default CompositionSettingsSection;
