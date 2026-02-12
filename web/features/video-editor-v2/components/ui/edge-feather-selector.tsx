/**
 * EdgeFeatherSelector - Simple edge feathering control
 * 
 * A clean UI for adjusting mask edge feathering with a single
 * value applied uniformly to all edges.
 */

import React, { useCallback } from "react";
import { cn } from "../../utils/general/utils";
import { Slider } from "./slider";
import { DraggableNumber } from "./draggable-number";
import {
  EdgeFeather,
  FeatherMode,
} from "../../types/masks";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";
import { Feather } from "lucide-react";

// ==========================================
// TYPES
// ==========================================

interface EdgeFeatherSelectorProps {
  /** Current edge feather values */
  value: EdgeFeather;
  /** Callback when values change */
  onChange: (value: EdgeFeather) => void;
  /** Additional className */
  className?: string;
  /** Whether the control is disabled */
  disabled?: boolean;
}

// ==========================================
// SECTION HEADER (matches masks-section.tsx pattern)
// ==========================================

const SectionHeader: React.FC<{ icon: React.ElementType; title: string }> = ({ icon: Icon, title }) => (
  <div className="flex items-center gap-2 mb-2">
    {React.createElement(Icon, { className: "h-3.5 w-3.5 text-muted-foreground" })}
    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
      {title}
    </span>
    </div>
  );

// ==========================================
// MAIN COMPONENT
// ==========================================

export const EdgeFeatherSelector: React.FC<EdgeFeatherSelectorProps> = ({
  value,
  onChange,
  className,
  disabled = false,
}) => {
  // Get the current unified feather value (use max of all edges for display)
  const featherValue = Math.max(value.top, value.right, value.bottom, value.left);

  // Handle feather change - applies to all edges uniformly
  const handleFeatherChange = useCallback((newValue: number) => {
    onChange({
      ...value,
      top: newValue,
      right: newValue,
      bottom: newValue,
      left: newValue,
    });
  }, [value, onChange]);

  // Update feather mode
  const handleModeChange = useCallback((mode: FeatherMode) => {
    onChange({ ...value, mode });
  }, [value, onChange]);

  return (
    <div className={cn("space-y-3", className)}>
      {/* Section Header */}
      <SectionHeader icon={Feather} title="Edge Feather" />

      {/* Feather Amount */}
      <div className="flex items-center gap-3">
        <Slider
          value={[featherValue]}
          onValueChange={([v]) => handleFeatherChange(v)}
          min={0}
          max={100}
          step={1}
            disabled={disabled}
          className="flex-1"
        />
        <div className="w-16">
          <DraggableNumber
            value={featherValue}
            onChange={handleFeatherChange}
            suffix="px"
            decimals={0}
            step={1}
            min={0}
            max={100}
            disabled={disabled}
          />
      </div>
      </div>

      {/* Feather Mode */}
          <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground shrink-0">Mode</span>
          <Select
            value={value.mode}
            onValueChange={(v) => handleModeChange(v as FeatherMode)}
            disabled={disabled}
          >
          <SelectTrigger className="h-8 text-sm bg-muted/50 border-muted-foreground/20 flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FeatherMode.INSIDE}>Inside</SelectItem>
              <SelectItem value={FeatherMode.OUTSIDE}>Outside</SelectItem>
              <SelectItem value={FeatherMode.BOTH}>Both</SelectItem>
            </SelectContent>
          </Select>
      </div>
    </div>
  );
};

export default EdgeFeatherSelector;
