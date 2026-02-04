/**
 * AppearanceSection - Opacity, Blend Mode, and visual appearance controls
 * 
 * Controls:
 * - Opacity slider with draggable number
 * - Blend mode dropdown
 * - Visibility toggle
 */

import React, { useMemo, useCallback } from "react";
import { Overlay } from "../../../types";
import { DraggableNumber } from "../../ui/draggable-number";
import { Slider } from "../../ui/slider";
import { Button } from "../../ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";
import { 
  Circle, 
  Layers,
  Eye,
  EyeOff,
  RotateCcw,
} from "lucide-react";
import { cn } from "../../../utils/general/utils";

// ==========================================
// TYPES
// ==========================================

interface AppearanceSectionProps {
  selectedOverlays: Overlay[];
  onUpdateStyles: (styleUpdates: Record<string, any>) => void;
}

type MixedValue<T> = T | 'mixed';

// ==========================================
// BLEND MODES
// ==========================================

const BLEND_MODE_GROUPS = [
  {
    label: 'Normal',
    modes: [
      { value: 'normal', label: 'Normal' },
    ],
  },
  {
    label: 'Darken',
    modes: [
      { value: 'darken', label: 'Darken' },
      { value: 'multiply', label: 'Multiply' },
      { value: 'color-burn', label: 'Color Burn' },
    ],
  },
  {
    label: 'Lighten',
    modes: [
      { value: 'lighten', label: 'Lighten' },
      { value: 'screen', label: 'Screen' },
      { value: 'color-dodge', label: 'Color Dodge' },
    ],
  },
  {
    label: 'Contrast',
    modes: [
      { value: 'overlay', label: 'Overlay' },
      { value: 'soft-light', label: 'Soft Light' },
      { value: 'hard-light', label: 'Hard Light' },
    ],
  },
  {
    label: 'Inversion',
    modes: [
      { value: 'difference', label: 'Difference' },
      { value: 'exclusion', label: 'Exclusion' },
    ],
  },
  {
    label: 'Component',
    modes: [
      { value: 'hue', label: 'Hue' },
      { value: 'saturation', label: 'Saturation' },
      { value: 'color', label: 'Color' },
      { value: 'luminosity', label: 'Luminosity' },
    ],
  },
] as const;

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function getSharedStyleValue<T>(
  overlays: Overlay[],
  getter: (styles: Record<string, any>) => T | undefined,
  defaultValue: T
): MixedValue<T> {
  if (overlays.length === 0) return defaultValue;
  
  const values: (T | undefined)[] = overlays.map(o => {
    if ('styles' in o && o.styles) {
      return getter(o.styles as Record<string, any>);
    }
    return undefined;
  });
  
  const firstValue = values[0] ?? defaultValue;
  const allSame = values.every(v => (v ?? defaultValue) === firstValue);
  
  return allSame ? firstValue : 'mixed';
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
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {title}
      </span>
    </div>
    {children}
  </div>
);

// ==========================================
// APPEARANCE SECTION COMPONENT
// ==========================================

export const AppearanceSection: React.FC<AppearanceSectionProps> = ({
  selectedOverlays,
  onUpdateStyles,
}) => {
  // Get shared values
  const opacity = useMemo(
    () => getSharedStyleValue(selectedOverlays, s => s.opacity, 1),
    [selectedOverlays]
  );

  const blendMode = useMemo(
    () => getSharedStyleValue(selectedOverlays, s => s.mixBlendMode, 'normal'),
    [selectedOverlays]
  );

  const isMixed = <T,>(val: MixedValue<T>): val is 'mixed' => val === 'mixed';

  // Handlers
  const handleOpacityChange = useCallback((value: number) => {
    onUpdateStyles({ opacity: Math.round(value * 100) / 100 });
  }, [onUpdateStyles]);

  const handleBlendModeChange = useCallback((value: string) => {
    onUpdateStyles({ mixBlendMode: value === 'normal' ? undefined : value });
  }, [onUpdateStyles]);

  const handleResetAppearance = useCallback(() => {
    onUpdateStyles({ opacity: 1, mixBlendMode: undefined });
  }, [onUpdateStyles]);

  const opacityValue = isMixed(opacity) ? 1 : opacity;
  const opacityPercent = Math.round(opacityValue * 100);
  const blendModeValue = isMixed(blendMode) ? 'normal' : (blendMode || 'normal');
  const hasChanges = opacityValue !== 1 || (blendModeValue !== 'normal' && blendModeValue !== undefined);

  return (
    <div className="space-y-3">
      {/* Opacity */}
      <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3">
        <SectionHeader icon={Circle} title="Opacity">
          {hasChanges && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleResetAppearance}
            >
              <RotateCcw className="h-3 w-3" />
            </Button>
          )}
        </SectionHeader>
        <div className="flex items-center gap-3">
          <Slider
            value={[opacityValue]}
            onValueChange={([value]) => handleOpacityChange(value)}
            min={0}
            max={1}
            step={0.01}
            className="flex-1"
            disabled={isMixed(opacity)}
          />
          <div className="w-16">
            <DraggableNumber
              value={opacityPercent}
              onChange={(v) => handleOpacityChange(v / 100)}
              suffix="%"
              decimals={0}
              step={1}
              min={0}
              max={100}
              disabled={isMixed(opacity)}
            />
          </div>
        </div>
      </div>

      {/* Blend Mode */}
      <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3">
        <SectionHeader icon={Layers} title="Blend Mode" />
        <Select
          value={isMixed(blendMode) ? undefined : blendModeValue}
          onValueChange={handleBlendModeChange}
          disabled={isMixed(blendMode)}
        >
          <SelectTrigger className="h-8 text-sm bg-muted/50 border-muted-foreground/20">
            <SelectValue placeholder={isMixed(blendMode) ? 'Mixed' : 'Normal'} />
          </SelectTrigger>
          <SelectContent className="max-h-[300px]">
            {BLEND_MODE_GROUPS.map(group => (
              <SelectGroup key={group.label}>
                <SelectLabel className="text-xs text-muted-foreground">
                  {group.label}
                </SelectLabel>
                {group.modes.map(mode => (
                  <SelectItem 
                    key={mode.value} 
                    value={mode.value}
                    className="text-sm"
                  >
                    {mode.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Quick Opacity Presets */}
      <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-2 font-medium">
          Opacity Presets
        </span>
        <div className="flex gap-1">
          {[100, 75, 50, 25, 0].map(percent => (
            <Button
              key={percent}
              variant="ghost"
              size="sm"
              className={cn(
                "flex-1 h-7 text-xs",
                !isMixed(opacity) && opacityPercent === percent && "bg-accent"
              )}
              onClick={() => handleOpacityChange(percent / 100)}
            >
              {percent}%
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AppearanceSection;
