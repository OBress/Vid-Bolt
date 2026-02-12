/**
 * ShapeSection - Properties for shape overlays
 * 
 * Controls:
 * - Fill color and enable/disable
 * - Stroke color, width, and enable/disable
 * - Corner radius (for rectangles)
 * - Gradient options
 * - Shadow options (drop and inner)
 * - Blend modes
 */

import React, { useMemo, useCallback } from "react";
import { ShapeOverlay } from "../../../types";
import { DraggableNumber } from "../../ui/draggable-number";
import { Button } from "../../ui/button";
import { Switch } from "../../ui/switch";
import { Label } from "../../ui/label";
import { Input } from "../../ui/input";
import { Slider } from "../../ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";
import {
  Paintbrush,
  PenLine,
  Square,
  Blend,
  Sparkles,
} from "lucide-react";
import { cn } from "../../../utils/general/utils";
import { GradientEditor } from "./gradient-editor";
import { ShadowEditor } from "./shadow-editor";
import { Gradient } from "../../../types/gradients";
import { Shadow } from "../../../types/shadows";

// ==========================================
// TYPES
// ==========================================

interface ShapeSectionProps {
  overlay: ShapeOverlay;
  onUpdate: (updates: Partial<ShapeOverlay>) => void;
  onUpdateStyles: (styleUpdates: Partial<ShapeOverlay['styles']>) => void;
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
// COLOR PICKER ROW
// ==========================================

interface ColorPickerRowProps {
  label: string;
  color: string;
  enabled: boolean;
  onColorChange: (color: string) => void;
  onEnabledChange: (enabled: boolean) => void;
}

const ColorPickerRow: React.FC<ColorPickerRowProps> = ({
  label,
  color,
  enabled,
  onColorChange,
  onEnabledChange,
}) => (
  <div className="flex items-center gap-2">
    <Switch
      checked={enabled}
      onCheckedChange={onEnabledChange}
      className="scale-75"
    />
    <span className="text-xs text-muted-foreground w-12">{label}</span>
    <Input
      type="color"
      value={color}
      onChange={(e) => onColorChange(e.target.value)}
      disabled={!enabled}
      className={cn(
        "h-8 w-12 p-1 cursor-pointer",
        !enabled && "opacity-50"
      )}
    />
    <Input
      type="text"
      value={color}
      onChange={(e) => onColorChange(e.target.value)}
      disabled={!enabled}
      className={cn(
        "flex-1 h-8 text-xs font-mono",
        !enabled && "opacity-50"
      )}
      placeholder="#000000"
    />
  </div>
);

// ==========================================
// SHAPE SECTION COMPONENT
// ==========================================

export const ShapeSection: React.FC<ShapeSectionProps> = ({
  overlay,
  onUpdate,
  onUpdateStyles,
}) => {
  const styles = overlay.styles || {};
  
  // Determine if fill/stroke are enabled based on current values
  const fillEnabled = styles.fill !== "transparent" && styles.fill !== undefined;
  const strokeEnabled = (styles.strokeWidth ?? 0) > 0 && styles.stroke !== "transparent";
  
  const fillColor = styles.fill || "#3b82f6";
  const strokeColor = styles.stroke || "#1e40af";
  const strokeWidth = styles.strokeWidth ?? 2;
  const borderRadius = parseInt(styles.borderRadius || "0", 10);

  // Handlers
  const handleFillEnabledChange = useCallback((enabled: boolean) => {
    onUpdateStyles({
      fill: enabled ? fillColor : "transparent",
    });
  }, [fillColor, onUpdateStyles]);

  const handleFillColorChange = useCallback((color: string) => {
    onUpdateStyles({ fill: color });
  }, [onUpdateStyles]);

  const handleStrokeEnabledChange = useCallback((enabled: boolean) => {
    onUpdateStyles({
      stroke: enabled ? strokeColor : "transparent",
      strokeWidth: enabled ? strokeWidth : 0,
    });
  }, [strokeColor, strokeWidth, onUpdateStyles]);

  const handleStrokeColorChange = useCallback((color: string) => {
    onUpdateStyles({ stroke: color });
  }, [onUpdateStyles]);

  const handleStrokeWidthChange = useCallback((width: number) => {
    onUpdateStyles({ strokeWidth: width });
  }, [onUpdateStyles]);

  const handleBorderRadiusChange = useCallback((radius: number) => {
    onUpdateStyles({ borderRadius: `${radius}px` });
  }, [onUpdateStyles]);

  // Gradient handlers
  const gradientEnabled = !!styles.gradientConfig;
  const handleGradientChange = useCallback((gradient: Gradient | undefined) => {
    onUpdateStyles({ gradientConfig: gradient });
  }, [onUpdateStyles]);
  const handleGradientEnabledChange = useCallback((enabled: boolean) => {
    if (!enabled) {
      onUpdateStyles({ gradientConfig: undefined });
    }
  }, [onUpdateStyles]);

  // Shadow handlers
  const shadowsEnabled = !!(styles.shadows && styles.shadows.length > 0) || !!styles.dropShadow;
  const handleShadowsChange = useCallback((shadows: Shadow[] | undefined) => {
    onUpdateStyles({ shadows, dropShadow: undefined }); // Clear old dropShadow when using new shadows array
  }, [onUpdateStyles]);
  const handleShadowsEnabledChange = useCallback((enabled: boolean) => {
    if (!enabled) {
      onUpdateStyles({ shadows: undefined, dropShadow: undefined });
    }
  }, [onUpdateStyles]);

  // Blend mode handler
  const handleBlendModeChange = useCallback((mode: string) => {
    onUpdateStyles({ mixBlendMode: mode });
  }, [onUpdateStyles]);

  const isRectangle = overlay.content === "rectangle";

  return (
    <div className="space-y-4">
      {/* Fill */}
      <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3">
        <SectionHeader icon={Paintbrush} title="Fill" />
        <ColorPickerRow
          label="Fill"
          color={fillColor}
          enabled={fillEnabled && !gradientEnabled}
          onColorChange={handleFillColorChange}
          onEnabledChange={handleFillEnabledChange}
        />
      </div>

      {/* Gradient */}
      <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3">
        <SectionHeader icon={Sparkles} title="Gradient" />
        <GradientEditor
          gradient={styles.gradientConfig}
          onChange={handleGradientChange}
          enabled={gradientEnabled}
          onEnabledChange={handleGradientEnabledChange}
        />
      </div>

      {/* Stroke */}
      <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3">
        <SectionHeader icon={PenLine} title="Stroke" />
        <div className="space-y-3">
          <ColorPickerRow
            label="Stroke"
            color={strokeColor}
            enabled={strokeEnabled}
            onColorChange={handleStrokeColorChange}
            onEnabledChange={handleStrokeEnabledChange}
          />
          
          {strokeEnabled && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-12">Width</span>
              <Slider
                value={[strokeWidth]}
                onValueChange={([value]) => handleStrokeWidthChange(value)}
                min={1}
                max={20}
                step={1}
                className="flex-1"
              />
              <div className="w-14">
                <DraggableNumber
                  value={strokeWidth}
                  onChange={handleStrokeWidthChange}
                  suffix="px"
                  decimals={0}
                  min={1}
                  max={20}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Shadows */}
      <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3">
        <SectionHeader icon={Sparkles} title="Shadows" />
        <ShadowEditor
          shadows={styles.shadows || (styles.dropShadow ? [styles.dropShadow] : undefined)}
          onChange={handleShadowsChange}
          enabled={shadowsEnabled}
          onEnabledChange={handleShadowsEnabledChange}
          type="drop"
          label="Drop Shadow"
        />
      </div>

      {/* Corner Radius (rectangles only) */}
      {isRectangle && (
        <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3">
          <SectionHeader icon={Square} title="Corner Radius" />
          <div className="flex items-center gap-3">
            <Slider
              value={[borderRadius]}
              onValueChange={([value]) => handleBorderRadiusChange(value)}
              min={0}
              max={100}
              step={1}
              className="flex-1"
            />
            <div className="w-14">
              <DraggableNumber
                value={borderRadius}
                onChange={handleBorderRadiusChange}
                suffix="px"
                decimals={0}
                min={0}
                max={100}
              />
            </div>
          </div>
        </div>
      )}

      {/* Blend Mode */}
      <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3">
        <SectionHeader icon={Blend} title="Blend Mode" />
        <Select
          value={styles.mixBlendMode || 'normal'}
          onValueChange={handleBlendModeChange}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="multiply">Multiply</SelectItem>
            <SelectItem value="screen">Screen</SelectItem>
            <SelectItem value="overlay">Overlay</SelectItem>
            <SelectItem value="darken">Darken</SelectItem>
            <SelectItem value="lighten">Lighten</SelectItem>
            <SelectItem value="color-dodge">Color Dodge</SelectItem>
            <SelectItem value="color-burn">Color Burn</SelectItem>
            <SelectItem value="hard-light">Hard Light</SelectItem>
            <SelectItem value="soft-light">Soft Light</SelectItem>
            <SelectItem value="difference">Difference</SelectItem>
            <SelectItem value="exclusion">Exclusion</SelectItem>
            <SelectItem value="hue">Hue</SelectItem>
            <SelectItem value="saturation">Saturation</SelectItem>
            <SelectItem value="color">Color</SelectItem>
            <SelectItem value="luminosity">Luminosity</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Shape Type Info */}
      <div className="p-3 rounded-md bg-muted/30 border border-border">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground capitalize">
            {overlay.content}
          </span>
          {" "}shape
        </p>
      </div>
    </div>
  );
};

export default ShapeSection;
