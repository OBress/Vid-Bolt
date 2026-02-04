/**
 * ShadowEditor - Reusable shadow editor component
 * 
 * Features:
 * - Multiple shadows support
 * - Add/remove shadows
 * - Per-shadow controls (offset X/Y, blur, spread, color, opacity)
 * - Shadow presets
 * - Visual preview
 */

import React, { useCallback } from "react";
import { Shadow, SHADOW_PRESETS, createDropShadow } from "../../../types/shadows";
import { Button } from "../../ui/button";
import { Slider } from "../../ui/slider";
import { DraggableNumber } from "../../ui/draggable-number";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Plus, Trash2, MoveVertical } from "lucide-react";
import { cn } from "../../../utils/general/utils";

// ==========================================
// TYPES
// ==========================================

interface ShadowEditorProps {
  shadows: Shadow[] | undefined;
  onChange: (shadows: Shadow[] | undefined) => void;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  type?: 'drop' | 'inner' | 'text';
  label?: string;
}

// ==========================================
// SINGLE SHADOW EDITOR
// ==========================================

interface SingleShadowEditorProps {
  shadow: Shadow;
  index: number;
  onUpdate: (index: number, shadow: Shadow) => void;
  onRemove: (index: number) => void;
  canRemove: boolean;
}

const SingleShadowEditor: React.FC<SingleShadowEditorProps> = ({
  shadow,
  index,
  onUpdate,
  onRemove,
  canRemove,
}) => {
  return (
    <div className="p-3 rounded bg-neutral-800/50 border border-neutral-700/50 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Shadow {index + 1}
        </span>
        {canRemove && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-destructive hover:bg-destructive/10"
            onClick={() => onRemove(index)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Color */}
      <div className="flex items-center gap-2">
        <Input
          type="color"
          value={shadow.color}
          onChange={(e) => onUpdate(index, { ...shadow, color: e.target.value })}
          className="h-8 w-12 p-1 cursor-pointer"
        />
        <Input
          type="text"
          value={shadow.color}
          onChange={(e) => onUpdate(index, { ...shadow, color: e.target.value })}
          className="flex-1 h-8 text-xs font-mono"
          placeholder="#000000"
        />
      </div>

      {/* Offset X */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Offset X</Label>
        <div className="flex items-center gap-3">
          <Slider
            value={[shadow.offsetX]}
            onValueChange={([value]) => onUpdate(index, { ...shadow, offsetX: value })}
            min={-50}
            max={50}
            step={1}
            className="flex-1"
          />
          <div className="w-16">
            <DraggableNumber
              value={shadow.offsetX}
              onChange={(value) => onUpdate(index, { ...shadow, offsetX: value })}
              suffix="px"
              decimals={0}
              min={-100}
              max={100}
            />
          </div>
        </div>
      </div>

      {/* Offset Y */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Offset Y</Label>
        <div className="flex items-center gap-3">
          <Slider
            value={[shadow.offsetY]}
            onValueChange={([value]) => onUpdate(index, { ...shadow, offsetY: value })}
            min={-50}
            max={50}
            step={1}
            className="flex-1"
          />
          <div className="w-16">
            <DraggableNumber
              value={shadow.offsetY}
              onChange={(value) => onUpdate(index, { ...shadow, offsetY: value })}
              suffix="px"
              decimals={0}
              min={-100}
              max={100}
            />
          </div>
        </div>
      </div>

      {/* Blur */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Blur</Label>
        <div className="flex items-center gap-3">
          <Slider
            value={[shadow.blur]}
            onValueChange={([value]) => onUpdate(index, { ...shadow, blur: value })}
            min={0}
            max={100}
            step={1}
            className="flex-1"
          />
          <div className="w-16">
            <DraggableNumber
              value={shadow.blur}
              onChange={(value) => onUpdate(index, { ...shadow, blur: value })}
              suffix="px"
              decimals={0}
              min={0}
              max={100}
            />
          </div>
        </div>
      </div>

      {/* Spread (for box-shadow only) */}
      {shadow.spread !== undefined && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Spread</Label>
          <div className="flex items-center gap-3">
            <Slider
              value={[shadow.spread]}
              onValueChange={([value]) => onUpdate(index, { ...shadow, spread: value })}
              min={-50}
              max={50}
              step={1}
              className="flex-1"
            />
            <div className="w-16">
              <DraggableNumber
                value={shadow.spread}
                onChange={(value) => onUpdate(index, { ...shadow, spread: value })}
                suffix="px"
                decimals={0}
                min={-100}
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
// MAIN COMPONENT
// ==========================================

export const ShadowEditor: React.FC<ShadowEditorProps> = ({
  shadows,
  onChange,
  enabled,
  onEnabledChange,
  type = 'drop',
  label = 'Shadow',
}) => {
  const activeShadows = shadows || [createDropShadow()];

  const handleShadowUpdate = useCallback((index: number, shadow: Shadow) => {
    const newShadows = [...activeShadows];
    newShadows[index] = shadow;
    onChange(newShadows);
  }, [activeShadows, onChange]);

  const handleShadowRemove = useCallback((index: number) => {
    if (activeShadows.length <= 1) {
      // If removing the last shadow, disable shadows
      onChange(undefined);
      onEnabledChange(false);
      return;
    }
    const newShadows = activeShadows.filter((_, i) => i !== index);
    onChange(newShadows);
  }, [activeShadows, onChange, onEnabledChange]);

  const handleAddShadow = useCallback(() => {
    onChange([...activeShadows, createDropShadow()]);
  }, [activeShadows, onChange]);

  const handlePresetSelect = useCallback((presetKey: string) => {
    const preset = SHADOW_PRESETS[presetKey];
    if (preset) {
      onChange([preset]);
      onEnabledChange(true);
    }
  }, [onChange, onEnabledChange]);

  return (
    <div className="space-y-3">
      {/* Enable/Disable Toggle */}
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">{label}</Label>
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
          {/* Shadows List */}
          <div className="space-y-2">
            {activeShadows.map((shadow, index) => (
              <SingleShadowEditor
                key={index}
                shadow={shadow}
                index={index}
                onUpdate={handleShadowUpdate}
                onRemove={handleShadowRemove}
                canRemove={activeShadows.length > 1}
              />
            ))}
          </div>

          {/* Add Shadow Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddShadow}
            className="w-full h-8 text-xs"
          >
            <Plus className="h-3 w-3 mr-1" />
            Add Shadow
          </Button>

          {/* Presets */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Presets</Label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(SHADOW_PRESETS).map(([key, preset]) => (
                <Button
                  key={key}
                  variant="outline"
                  size="sm"
                  onClick={() => handlePresetSelect(key)}
                  className="h-8 text-xs justify-start"
                >
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </Button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ShadowEditor;
