/**
 * TextLayerSection - Properties for text layers
 * 
 * After Effects style text controls
 */

import React from "react";
import type { TextLayerProperties } from "../../../../types/composition";
import { Input } from "../../../ui/input";
import { Label } from "../../../ui/label";
import { Textarea } from "../../../ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../ui/select";
import { Slider } from "../../../ui/slider";
import { AlignLeft, AlignCenter, AlignRight, Type, Paintbrush, AlignJustify, Palette } from "lucide-react";
import { Button } from "../../../ui/button";
import { cn } from "../../../../utils/general/utils";
import { Card, CardContent, CardHeader, CardTitle } from "../../../ui/card";

// ==========================================
// TYPES
// ==========================================

interface TextLayerSectionProps {
  properties: TextLayerProperties;
  onUpdate: (updates: Partial<TextLayerProperties>) => void;
}

// ==========================================
// FONT OPTIONS
// ==========================================

const FONT_OPTIONS = [
  'Inter',
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Poppins',
  'Playfair Display',
  'Merriweather',
  'Source Sans Pro',
  'Oswald',
];

// ==========================================
// MAIN COMPONENT
// ==========================================

export const TextLayerSection: React.FC<TextLayerSectionProps> = ({
  properties,
  onUpdate,
}) => {
  // Apply defaults for any missing properties
  const text = properties?.text ?? '';
  const fontFamily = properties?.fontFamily ?? 'Inter';
  const fontSize = properties?.fontSize ?? 48;
  const fontWeight = properties?.fontWeight ?? 600;
  const color = properties?.color ?? '#FFFFFF';
  const textAlign = properties?.textAlign ?? 'center';
  const lineHeight = properties?.lineHeight ?? 1.2;
  const letterSpacing = properties?.letterSpacing ?? 0;
  const backgroundColor = properties?.backgroundColor;

  return (
    <div className="space-y-3">
      {/* Text Content Card */}
      <Card className="bg-[#222225] shadow-none border-0">
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-xs font-medium flex items-center gap-2">
            <Type className="h-3.5 w-3.5 text-pink-400" />
            Content
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <Textarea
            value={text}
            onChange={(e) => onUpdate({ text: e.target.value })}
            className="min-h-[80px] text-sm resize-none bg-[#1a1a1a] border-[#3a3a3a] focus:border-[#4a90d9]"
            placeholder="Enter text..."
          />
        </CardContent>
      </Card>

      {/* Font Card */}
      <Card className="bg-[#222225] shadow-none border-0">
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-xs font-medium flex items-center gap-2">
            <Type className="h-3.5 w-3.5 text-blue-400" />
            Font
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 space-y-3">
          <div className="grid grid-cols-[1fr,80px] gap-2">
            <div>
              <Label className="text-xs mb-1.5 block text-muted-foreground">Family</Label>
              <Select
                value={fontFamily}
                onValueChange={(value) => onUpdate({ fontFamily: value })}
              >
                <SelectTrigger className="h-8 text-sm bg-[#1a1a1a] border-[#3a3a3a] focus:border-[#4a90d9]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONT_OPTIONS.map((font) => (
                    <SelectItem key={font} value={font} style={{ fontFamily: font }}>
                      {font}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1.5 block text-muted-foreground">Size</Label>
              <Input
                type="number"
                value={fontSize}
                onChange={(e) => onUpdate({ fontSize: parseInt(e.target.value) || 48 })}
                className="h-8 text-sm font-mono bg-[#1a1a1a] border-[#3a3a3a] focus:border-[#4a90d9]"
                min={8}
                max={500}
              />
            </div>
          </div>

          <div>
            <Label className="text-xs mb-1.5 block text-muted-foreground">Weight</Label>
            <Select
              value={String(fontWeight)}
              onValueChange={(v) => onUpdate({ fontWeight: parseInt(v) })}
            >
              <SelectTrigger className="h-8 text-sm bg-[#1a1a1a] border-[#3a3a3a] focus:border-[#4a90d9]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="300">Light (300)</SelectItem>
                <SelectItem value="400">Regular (400)</SelectItem>
                <SelectItem value="500">Medium (500)</SelectItem>
                <SelectItem value="600">Semi Bold (600)</SelectItem>
                <SelectItem value="700">Bold (700)</SelectItem>
                <SelectItem value="800">Extra Bold (800)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Color Card */}
      <Card className="bg-[#222225] shadow-none border-0">
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-xs font-medium flex items-center gap-2">
            <Palette className="h-3.5 w-3.5 text-orange-400" />
            Color
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={color}
              onChange={(e) => onUpdate({ color: e.target.value })}
              className="w-10 h-8 rounded cursor-pointer shrink-0"
            />
            <Input
              value={color}
              onChange={(e) => onUpdate({ color: e.target.value })}
              className="flex-1 h-8 text-sm font-mono uppercase bg-[#1a1a1a] border-[#3a3a3a] focus:border-[#4a90d9]"
              placeholder="#FFFFFF"
            />
          </div>
        </CardContent>
      </Card>

      {/* Alignment Card */}
      <Card className="bg-[#222225] shadow-none border-0">
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-xs font-medium flex items-center gap-2">
            <AlignJustify className="h-3.5 w-3.5 text-green-400" />
            Alignment
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <div className="flex gap-1">
            {[
              { value: 'left', icon: <AlignLeft className="h-4 w-4" /> },
              { value: 'center', icon: <AlignCenter className="h-4 w-4" /> },
              { value: 'right', icon: <AlignRight className="h-4 w-4" /> },
            ].map((option) => (
              <Button
                key={option.value}
                variant="ghost"
                size="sm"
                className={cn(
                  "flex-1 h-8 bg-[#1a1a1a] hover:bg-[#252525] border-0",
                  textAlign === option.value && "bg-primary text-primary-foreground hover:bg-primary"
                )}
                onClick={() => onUpdate({ textAlign: option.value as 'left' | 'center' | 'right' })}
              >
                {option.icon}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Spacing Card */}
      <Card className="bg-[#222225] shadow-none border-0">
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-xs font-medium flex items-center gap-2">
            <Paintbrush className="h-3.5 w-3.5 text-purple-400" />
            Spacing
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs mb-1.5 block text-muted-foreground">Line Height</Label>
              <Slider
                value={[lineHeight]}
                min={0.5}
                max={3}
                step={0.1}
                onValueChange={([value]) => onUpdate({ lineHeight: value })}
              />
              <span className="text-[10px] text-muted-foreground">
                {lineHeight.toFixed(1)}
              </span>
            </div>
            <div>
              <Label className="text-xs mb-1.5 block text-muted-foreground">Letter Spacing</Label>
              <Input
                type="number"
                value={letterSpacing}
                onChange={(e) => onUpdate({ letterSpacing: parseFloat(e.target.value) || 0 })}
                className="h-8 text-sm bg-[#1a1a1a] border-[#3a3a3a] focus:border-[#4a90d9]"
                step={0.5}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Background Color (Optional) */}
      {backgroundColor && (
        <Card className="bg-[#222225] shadow-none border-0">
          <CardHeader className="p-3 pb-2">
            <CardTitle className="text-xs font-medium flex items-center gap-2">
              <Palette className="h-3.5 w-3.5 text-cyan-400" />
              Background
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={backgroundColor || '#000000'}
                onChange={(e) => onUpdate({ backgroundColor: e.target.value })}
                className="w-10 h-8 rounded cursor-pointer shrink-0"
              />
              <Input
                value={backgroundColor || ''}
                onChange={(e) => onUpdate({ backgroundColor: e.target.value || undefined })}
                className="flex-1 h-8 text-sm font-mono uppercase bg-[#1a1a1a] border-[#3a3a3a] focus:border-[#4a90d9]"
                placeholder="transparent"
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default TextLayerSection;
