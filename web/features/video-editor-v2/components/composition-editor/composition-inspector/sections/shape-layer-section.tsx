/**
 * ShapeLayerSection - Properties for shape layers
 */

import React from "react";
import type { ShapeLayerProperties, ShapeType } from "../../../../types/composition";
import { Input } from "../../../ui/input";
import { Label } from "../../../ui/label";
import { Slider } from "../../../ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../ui/select";
import { Square, Circle, Triangle, Star, Shapes, Maximize2, Palette, PenTool } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../../ui/card";

// ==========================================
// TYPES
// ==========================================

interface ShapeLayerSectionProps {
  properties: ShapeLayerProperties;
  onUpdate: (updates: Partial<ShapeLayerProperties>) => void;
}

// ==========================================
// MAIN COMPONENT
// ==========================================

export const ShapeLayerSection: React.FC<ShapeLayerSectionProps> = ({
  properties,
  onUpdate,
}) => {
  return (
    <div className="space-y-3">
      {/* Shape Type Card */}
      <Card className="bg-[#222225] shadow-none border-0">
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-xs font-medium flex items-center gap-2">
            <Shapes className="h-3.5 w-3.5 text-blue-400" />
            Shape Type
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <Select
            value={properties.shapeType}
            onValueChange={(shapeType: ShapeType) => onUpdate({ shapeType })}
          >
            <SelectTrigger className="h-8 text-sm bg-[#1a1a1a] border-[#3a3a3a] focus:border-[#4a90d9]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rectangle">
                <div className="flex items-center gap-2">
                  <Square className="h-4 w-4" />
                  Rectangle
                </div>
              </SelectItem>
              <SelectItem value="ellipse">
                <div className="flex items-center gap-2">
                  <Circle className="h-4 w-4" />
                  Ellipse
                </div>
              </SelectItem>
              <SelectItem value="polygon">
                <div className="flex items-center gap-2">
                  <Triangle className="h-4 w-4" />
                  Polygon
                </div>
              </SelectItem>
              <SelectItem value="star">
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4" />
                  Star
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
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

          {/* Corner Radius (for rectangle) */}
          {properties.shapeType === 'rectangle' && (
            <div className="mt-3">
              <Label className="text-xs mb-1.5 block text-muted-foreground">Corner Radius</Label>
              <Input
                type="number"
                value={properties.cornerRadius || 0}
                onChange={(e) => onUpdate({ cornerRadius: parseInt(e.target.value) || 0 })}
                className="h-8 text-sm bg-[#1a1a1a] border-[#3a3a3a] focus:border-[#4a90d9]"
                min={0}
              />
            </div>
          )}

          {/* Polygon Sides */}
          {properties.shapeType === 'polygon' && (
            <div className="mt-3">
              <Label className="text-xs mb-1.5 block text-muted-foreground">Number of Sides</Label>
              <Input
                type="number"
                value={properties.sides || 6}
                onChange={(e) => onUpdate({ sides: parseInt(e.target.value) || 6 })}
                className="h-8 text-sm bg-[#1a1a1a] border-[#3a3a3a] focus:border-[#4a90d9]"
                min={3}
                max={12}
              />
            </div>
          )}

          {/* Star Points & Inner Radius */}
          {properties.shapeType === 'star' && (
            <div className="mt-3 space-y-3">
              <div>
                <Label className="text-xs mb-1.5 block text-muted-foreground">Points</Label>
                <Input
                  type="number"
                  value={properties.sides || 5}
                  onChange={(e) => onUpdate({ sides: parseInt(e.target.value) || 5 })}
                  className="h-8 text-sm bg-[#1a1a1a] border-[#3a3a3a] focus:border-[#4a90d9]"
                  min={3}
                  max={12}
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label className="text-xs text-muted-foreground">Inner Radius</Label>
                  <span className="text-xs text-muted-foreground">
                    {Math.round((properties.innerRadius || 0.5) * 100)}%
                  </span>
                </div>
                <Slider
                  value={[(properties.innerRadius || 0.5) * 100]}
                  min={10}
                  max={90}
                  step={1}
                  onValueChange={([value]) => onUpdate({ innerRadius: value / 100 })}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Fill Card */}
      <Card className="bg-[#222225] shadow-none border-0">
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-xs font-medium flex items-center gap-2">
            <Palette className="h-3.5 w-3.5 text-orange-400" />
            Fill
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 space-y-3">
          <div>
            <Label className="text-xs mb-1.5 block text-muted-foreground">Color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={properties.fillColor}
                onChange={(e) => onUpdate({ fillColor: e.target.value })}
                className="w-8 h-8 rounded cursor-pointer"
              />
              <Input
                value={properties.fillColor}
                onChange={(e) => onUpdate({ fillColor: e.target.value })}
                className="flex-1 h-8 text-sm bg-[#1a1a1a] border-[#3a3a3a] focus:border-[#4a90d9]"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-xs text-muted-foreground">Opacity</Label>
              <span className="text-xs text-muted-foreground">
                {Math.round(properties.fillOpacity * 100)}%
              </span>
            </div>
            <Slider
              value={[properties.fillOpacity * 100]}
              min={0}
              max={100}
              step={1}
              onValueChange={([value]) => onUpdate({ fillOpacity: value / 100 })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Stroke Card */}
      <Card className="bg-[#222225] shadow-none border-0">
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-xs font-medium flex items-center gap-2">
            <PenTool className="h-3.5 w-3.5 text-purple-400" />
            Stroke
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 space-y-3">
          <div>
            <Label className="text-xs mb-1.5 block text-muted-foreground">Color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={properties.strokeColor || '#000000'}
                onChange={(e) => onUpdate({ strokeColor: e.target.value })}
                className="w-8 h-8 rounded cursor-pointer"
              />
              <Input
                value={properties.strokeColor || ''}
                onChange={(e) => onUpdate({ strokeColor: e.target.value || undefined })}
                className="flex-1 h-8 text-sm bg-[#1a1a1a] border-[#3a3a3a] focus:border-[#4a90d9]"
                placeholder="No stroke"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs mb-1.5 block text-muted-foreground">Width</Label>
            <Input
              type="number"
              value={properties.strokeWidth || 0}
              onChange={(e) => onUpdate({ strokeWidth: parseInt(e.target.value) || 0 })}
              className="h-8 text-sm bg-[#1a1a1a] border-[#3a3a3a] focus:border-[#4a90d9]"
              min={0}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ShapeLayerSection;
