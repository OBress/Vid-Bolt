/**
 * SolidLayerSection - Properties for solid color layers
 */

import React from "react";
import type { SolidLayerProperties } from "../../../../types/composition";
import { Input } from "../../../ui/input";
import { Label } from "../../../ui/label";
import { Palette, Maximize2, CornerUpRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../../ui/card";

// ==========================================
// TYPES
// ==========================================

interface SolidLayerSectionProps {
  properties: SolidLayerProperties;
  onUpdate: (updates: Partial<SolidLayerProperties>) => void;
}

// ==========================================
// COLOR PRESETS
// ==========================================

const COLOR_PRESETS = [
  '#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF',
  '#FFFF00', '#FF00FF', '#00FFFF', '#FF8000', '#8000FF',
  '#0080FF', '#FF0080', '#80FF00', '#00FF80', '#333333',
];

// ==========================================
// MAIN COMPONENT
// ==========================================

export const SolidLayerSection: React.FC<SolidLayerSectionProps> = ({
  properties,
  onUpdate,
}) => {
  return (
    <div className="space-y-3">
      {/* Color Card */}
      <Card className="bg-[#222225] shadow-none border-0">
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-xs font-medium flex items-center gap-2">
            <Palette className="h-3.5 w-3.5 text-orange-400" />
            Color
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={properties.color}
              onChange={(e) => onUpdate({ color: e.target.value })}
              className="w-10 h-8 rounded cursor-pointer shrink-0"
            />
            <Input
              value={properties.color}
              onChange={(e) => onUpdate({ color: e.target.value })}
              className="flex-1 h-8 text-sm font-mono uppercase bg-[#1a1a1a] border-[#3a3a3a] focus:border-[#4a90d9]"
            />
          </div>

          {/* Color Presets */}
          <div>
            <Label className="text-xs mb-1.5 block text-muted-foreground">Presets</Label>
            <div className="grid grid-cols-5 gap-1.5">
              {COLOR_PRESETS.map((color) => (
                <button
                  key={color}
                  className="w-full aspect-square rounded hover:ring-2 hover:ring-primary transition-all"
                  style={{ backgroundColor: color }}
                  onClick={() => onUpdate({ color })}
                  title={color}
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Size Card */}
      <Card className="bg-[#222225] shadow-none border-0">
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-xs font-medium flex items-center gap-2">
            <Maximize2 className="h-3.5 w-3.5 text-green-400" />
            Size
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs mb-1.5 block text-muted-foreground">Width</Label>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  value={properties.width}
                  onChange={(e) => onUpdate({ width: parseInt(e.target.value) || 100 })}
                  className="h-8 text-sm font-mono bg-[#1a1a1a] border-[#3a3a3a] focus:border-[#4a90d9]"
                  min={1}
                />
                <span className="text-xs text-muted-foreground w-6">px</span>
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1.5 block text-muted-foreground">Height</Label>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  value={properties.height}
                  onChange={(e) => onUpdate({ height: parseInt(e.target.value) || 100 })}
                  className="h-8 text-sm font-mono bg-[#1a1a1a] border-[#3a3a3a] focus:border-[#4a90d9]"
                  min={1}
                />
                <span className="text-xs text-muted-foreground w-6">px</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Corner Radius Card */}
      <Card className="bg-[#222225] shadow-none border-0">
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-xs font-medium flex items-center gap-2">
            <CornerUpRight className="h-3.5 w-3.5 text-purple-400" />
            Corner Radius
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <div className="flex items-center gap-1">
            <Input
              type="number"
              value={properties.borderRadius || 0}
              onChange={(e) => onUpdate({ borderRadius: parseInt(e.target.value) || 0 })}
              className="h-8 text-sm font-mono bg-[#1a1a1a] border-[#3a3a3a] focus:border-[#4a90d9]"
              min={0}
            />
            <span className="text-xs text-muted-foreground w-6">px</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SolidLayerSection;
