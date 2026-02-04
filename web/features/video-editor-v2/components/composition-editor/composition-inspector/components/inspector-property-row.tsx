/**
 * InspectorPropertyRow - Property row with optional stopwatch
 * 
 * After Effects style property control with:
 * - Label on left
 * - Value input on right
 * - Optional stopwatch for animation
 * - Consistent styling and spacing
 * - Support for different input types
 */

import React from 'react';
import { cn } from '../../../../utils/general/utils';
import { Clock } from 'lucide-react';
import { Button } from '../../../ui/button';
import { Input } from '../../../ui/input';
import { Label } from '../../../ui/label';

// ==========================================
// TYPES
// ==========================================

interface InspectorPropertyRowProps {
  label: string;
  children: React.ReactNode;
  animatable?: boolean;
  isKeyframing?: boolean;
  onToggleKeyframing?: () => void;
  className?: string;
}

// ==========================================
// MAIN COMPONENT
// ==========================================

export const InspectorPropertyRow: React.FC<InspectorPropertyRowProps> = ({
  label,
  children,
  animatable = false,
  isKeyframing = false,
  onToggleKeyframing,
  className,
}) => {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Stopwatch (if animatable) */}
      {animatable && (
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-6 w-6 shrink-0",
            isKeyframing 
              ? "text-blue-500 hover:text-blue-400" 
              : "text-muted-foreground/50 hover:text-muted-foreground"
          )}
          onClick={onToggleKeyframing}
          title={isKeyframing ? "Remove keyframing" : "Add keyframing"}
        >
          <Clock className="h-3.5 w-3.5" />
        </Button>
      )}

      {/* Label */}
      <Label className="text-xs font-medium min-w-[80px] shrink-0">
        {label}
      </Label>

      {/* Value Control */}
      <div className="flex-1 min-w-0">
        {children}
      </div>
    </div>
  );
};

// ==========================================
// SPECIALIZED NUMBER INPUT
// ==========================================

interface NumberInputRowProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  animatable?: boolean;
  isKeyframing?: boolean;
  onToggleKeyframing?: () => void;
  className?: string;
}

export const NumberInputRow: React.FC<NumberInputRowProps> = ({
  label,
  value,
  onChange,
  unit,
  step = 1,
  min,
  max,
  animatable = false,
  isKeyframing = false,
  onToggleKeyframing,
  className,
}) => {
  return (
    <InspectorPropertyRow
      label={label}
      animatable={animatable}
      isKeyframing={isKeyframing}
      onToggleKeyframing={onToggleKeyframing}
      className={className}
    >
      <div className="flex items-center gap-1">
        <Input
          type="number"
          value={value}
          onChange={(e) => {
            const num = parseFloat(e.target.value);
            if (!isNaN(num)) {
              onChange(num);
            }
          }}
          step={step}
          min={min}
          max={max}
          className="h-8 text-sm font-mono bg-[#1a1a1a] border-[#3a3a3a] focus:border-[#4a90d9]"
        />
        {unit && (
          <span className="text-xs text-muted-foreground w-8 shrink-0">
            {unit}
          </span>
        )}
      </div>
    </InspectorPropertyRow>
  );
};

export default InspectorPropertyRow;
