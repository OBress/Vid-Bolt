/**
 * LayerTransformSection - Transform properties for a layer
 * 
 * After Effects style transform controls with stopwatches
 */

import React from "react";
import { cn } from "../../../../utils/general/utils";
import { useCompositionEditorStore } from "../../../../stores/composition-editor-store";
import type { CompositionLayer, LayerTransform } from "../../../../types/composition";
import { NumberInputRow } from "../components/inspector-property-row";
import { Input } from "../../../ui/input";
import { Slider } from "../../../ui/slider";
import { Button } from "../../../ui/button";
import { Label } from "../../../ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../../../ui/card";
import { Move, Maximize2, RotateCw, Eye, Target } from "lucide-react";

// ==========================================
// TYPES
// ==========================================

interface LayerTransformSectionProps {
  layer: CompositionLayer;
  onUpdate: (updates: Partial<LayerTransform>) => void;
}

// ==========================================
// MAIN COMPONENT
// ==========================================

export const LayerTransformSection: React.FC<LayerTransformSectionProps> = ({
  layer,
  onUpdate,
}) => {
  const { transform } = layer;
  
  const togglePropertyKeyframing = useCompositionEditorStore((state) => state.togglePropertyKeyframing);
  const composition = useCompositionEditorStore((state) => state.composition);
  const fps = composition?.fps || 30;
  const currentFrame = useCompositionEditorStore((state) => state.playback.currentFrame);

  // Check if properties have keyframing enabled
  const hasKeyframes = (propertyPath: string) => {
    return layer.keyframes?.some(pk => pk.propertyPath === propertyPath && pk.enabled) ?? false;
  };

  return (
    <div className="space-y-3">
      {/* Position X & Y */}
      <Card className="bg-[#222225] shadow-none border-0">
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-xs font-medium flex items-center gap-2">
            <Move className="h-3.5 w-3.5 text-blue-400" />
            Position
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 space-y-2">
          <NumberInputRow
            label="X"
            value={transform.x}
            onChange={(x) => onUpdate({ x })}
            unit="px"
            animatable={true}
            isKeyframing={hasKeyframes('transform.x')}
            onToggleKeyframing={() => togglePropertyKeyframing(layer.id, 'transform.x', !hasKeyframes('transform.x'))}
          />
          <NumberInputRow
            label="Y"
            value={transform.y}
            onChange={(y) => onUpdate({ y })}
            unit="px"
            animatable={true}
            isKeyframing={hasKeyframes('transform.y')}
            onToggleKeyframing={() => togglePropertyKeyframing(layer.id, 'transform.y', !hasKeyframes('transform.y'))}
          />
        </CardContent>
      </Card>

      {/* Scale X & Y */}
      <Card className="bg-[#222225] shadow-none border-0">
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-xs font-medium flex items-center gap-2">
            <Maximize2 className="h-3.5 w-3.5 text-green-400" />
            Scale
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 space-y-2">
          <NumberInputRow
            label="X"
            value={transform.scaleX * 100}
            onChange={(v) => onUpdate({ scaleX: v / 100 })}
            unit="%"
            step={1}
            min={0}
            animatable={true}
            isKeyframing={hasKeyframes('transform.scaleX')}
            onToggleKeyframing={() => togglePropertyKeyframing(layer.id, 'transform.scaleX', !hasKeyframes('transform.scaleX'))}
          />
          <NumberInputRow
            label="Y"
            value={transform.scaleY * 100}
            onChange={(v) => onUpdate({ scaleY: v / 100 })}
            unit="%"
            step={1}
            min={0}
            animatable={true}
            isKeyframing={hasKeyframes('transform.scaleY')}
            onToggleKeyframing={() => togglePropertyKeyframing(layer.id, 'transform.scaleY', !hasKeyframes('transform.scaleY'))}
          />
        </CardContent>
      </Card>

      {/* Rotation */}
      <Card className="bg-[#222225] shadow-none border-0">
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-xs font-medium flex items-center gap-2">
            <RotateCw className="h-3.5 w-3.5 text-purple-400" />
            Rotation
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <NumberInputRow
            label="Angle"
            value={transform.rotation}
            onChange={(rotation) => onUpdate({ rotation })}
            unit="°"
            step={1}
            min={-360}
            max={360}
            animatable={true}
            isKeyframing={hasKeyframes('transform.rotation')}
            onToggleKeyframing={() => togglePropertyKeyframing(layer.id, 'transform.rotation', !hasKeyframes('transform.rotation'))}
          />
        </CardContent>
      </Card>

      {/* Opacity */}
      <Card className="bg-[#222225] shadow-none border-0">
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-xs font-medium flex items-center gap-2">
            <Eye className="h-3.5 w-3.5 text-yellow-400" />
            Opacity
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <NumberInputRow
            label="Value"
            value={transform.opacity * 100}
            onChange={(v) => onUpdate({ opacity: v / 100 })}
            unit="%"
            step={1}
            min={0}
            max={100}
            animatable={true}
            isKeyframing={hasKeyframes('transform.opacity')}
            onToggleKeyframing={() => togglePropertyKeyframing(layer.id, 'transform.opacity', !hasKeyframes('transform.opacity'))}
          />
        </CardContent>
      </Card>

      {/* Anchor Point */}
      <Card className="bg-[#222225] shadow-none border-0">
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-xs font-medium flex items-center gap-2">
            <Target className="h-3.5 w-3.5 text-orange-400" />
            Anchor Point
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 space-y-2">
          <NumberInputRow
            label="X"
            value={transform.anchorX * 100}
            onChange={(v) => onUpdate({ anchorX: v / 100 })}
            unit="%"
            step={1}
            min={0}
            max={100}
            animatable={true}
            isKeyframing={hasKeyframes('transform.anchorX')}
            onToggleKeyframing={() => togglePropertyKeyframing(layer.id, 'transform.anchorX', !hasKeyframes('transform.anchorX'))}
          />
          <NumberInputRow
            label="Y"
            value={transform.anchorY * 100}
            onChange={(v) => onUpdate({ anchorY: v / 100 })}
            unit="%"
            step={1}
            min={0}
            max={100}
            animatable={true}
            isKeyframing={hasKeyframes('transform.anchorY')}
            onToggleKeyframing={() => togglePropertyKeyframing(layer.id, 'transform.anchorY', !hasKeyframes('transform.anchorY'))}
          />
          
          {/* Anchor presets - 3x3 grid */}
          <div className="grid grid-cols-3 gap-1 pt-1">
            {[
              { x: 0, y: 0, label: '↖' },
              { x: 0.5, y: 0, label: '↑' },
              { x: 1, y: 0, label: '↗' },
              { x: 0, y: 0.5, label: '←' },
              { x: 0.5, y: 0.5, label: '●' },
              { x: 1, y: 0.5, label: '→' },
              { x: 0, y: 1, label: '↙' },
              { x: 0.5, y: 1, label: '↓' },
              { x: 1, y: 1, label: '↘' },
            ].map((preset) => (
              <Button
                key={`${preset.x}-${preset.y}`}
                variant="ghost"
                size="sm"
                className={cn(
                  "h-7 text-sm font-mono bg-[#1a1a1a] hover:bg-[#252525] border-0",
                  transform.anchorX === preset.x && transform.anchorY === preset.y && "bg-purple-500/20 text-purple-400"
                )}
                onClick={() => onUpdate({ anchorX: preset.x, anchorY: preset.y })}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default LayerTransformSection;
