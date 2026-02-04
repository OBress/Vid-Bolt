/**
 * DraggableNumber - Scrubbing number input like in Premiere Pro/After Effects
 * 
 * Features:
 * - Click and drag horizontally to scrub values
 * - Double-click to type exact values
 * - Mouse wheel to increment/decrement
 * - Shift for fine control, Ctrl for coarse control
 */

import * as React from "react";
import { cn } from "../../utils/general/utils";

export interface DraggableNumberProps {
  /** Current value */
  value: number;
  /** Callback when value changes */
  onChange: (value: number) => void;
  /** Minimum allowed value */
  min?: number;
  /** Maximum allowed value */
  max?: number;
  /** Step increment for dragging */
  step?: number;
  /** Number of decimal places to display */
  decimals?: number;
  /** Unit suffix to display (e.g., "px", "%", "°") */
  suffix?: string;
  /** Label text */
  label?: string;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Additional class names */
  className?: string;
  /** Sensitivity multiplier for dragging (default: 1) */
  sensitivity?: number;
}

export const DraggableNumber = React.forwardRef<HTMLDivElement, DraggableNumberProps>(
  (
    {
      value,
      onChange,
      min,
      max,
      step = 1,
      decimals = 0,
      suffix = "",
      label,
      disabled = false,
      className,
      sensitivity = 1,
    },
    ref
  ) => {
    const [isEditing, setIsEditing] = React.useState(false);
    const [editValue, setEditValue] = React.useState("");
    const [isDragging, setIsDragging] = React.useState(false);
    const inputRef = React.useRef<HTMLInputElement>(null);
    const dragStartX = React.useRef(0);
    const dragStartValue = React.useRef(0);

    // Format value for display
    const displayValue = React.useMemo(() => {
      return value.toFixed(decimals);
    }, [value, decimals]);

    // Clamp value to min/max
    const clampValue = React.useCallback(
      (val: number): number => {
        let clamped = val;
        if (min !== undefined) clamped = Math.max(min, clamped);
        if (max !== undefined) clamped = Math.min(max, clamped);
        return clamped;
      },
      [min, max]
    );

    // Start editing mode
    const handleDoubleClick = () => {
      if (disabled) return;
      setIsEditing(true);
      setEditValue(displayValue);
      setTimeout(() => {
        inputRef.current?.select();
      }, 0);
    };

    // Handle edit input change
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setEditValue(e.target.value);
    };

    // Commit edit value
    const commitEdit = () => {
      const parsed = parseFloat(editValue);
      if (!isNaN(parsed)) {
        onChange(clampValue(parsed));
      }
      setIsEditing(false);
    };

    // Handle input blur
    const handleInputBlur = () => {
      commitEdit();
    };

    // Handle input key down
    const handleInputKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        commitEdit();
      } else if (e.key === "Escape") {
        setIsEditing(false);
      }
    };

    // Start dragging
    const handleMouseDown = (e: React.MouseEvent) => {
      if (disabled || isEditing) return;
      e.preventDefault();
      
      setIsDragging(true);
      dragStartX.current = e.clientX;
      dragStartValue.current = value;

      document.body.style.cursor = "ew-resize";
      document.body.style.userSelect = "none";
    };

    // Handle mouse move (dragging)
    React.useEffect(() => {
      if (!isDragging) return;

      const handleMouseMove = (e: MouseEvent) => {
        const deltaX = e.clientX - dragStartX.current;
        
        // Modifiers: Shift = fine (0.1x), Ctrl = coarse (10x)
        let multiplier = sensitivity;
        if (e.shiftKey) multiplier *= 0.1;
        if (e.ctrlKey || e.metaKey) multiplier *= 10;

        const deltaValue = deltaX * step * multiplier;
        const newValue = clampValue(dragStartValue.current + deltaValue);
        
        // Round to step precision
        const rounded = Math.round(newValue / step) * step;
        onChange(Number(rounded.toFixed(decimals)));
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);

      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }, [isDragging, step, sensitivity, clampValue, onChange, decimals]);

    // Handle mouse wheel
    const handleWheel = (e: React.WheelEvent) => {
      if (disabled || isEditing) return;
      e.preventDefault();
      
      let multiplier = 1;
      if (e.shiftKey) multiplier = 0.1;
      if (e.ctrlKey || e.metaKey) multiplier = 10;
      
      const delta = e.deltaY > 0 ? -step : step;
      const newValue = clampValue(value + delta * multiplier);
      onChange(Number(newValue.toFixed(decimals)));
    };

    return (
      <div ref={ref} className={cn("flex flex-col gap-1", className)}>
        {label && (
          <label className="text-[10px] text-muted-foreground uppercase tracking-wide">
            {label}
          </label>
        )}
        <div
          className={cn(
            "relative flex items-center h-8 px-2 rounded-md",
            "bg-muted/50 border border-transparent",
            "transition-colors",
            !disabled && !isEditing && "cursor-ew-resize hover:bg-muted hover:border-border",
            isDragging && "bg-muted border-primary",
            disabled && "opacity-50 cursor-not-allowed"
          )}
          onMouseDown={handleMouseDown}
          onDoubleClick={handleDoubleClick}
          onWheel={handleWheel}
        >
          {isEditing ? (
            <input
              ref={inputRef}
              type="number"
              value={editValue}
              onChange={handleInputChange}
              onBlur={handleInputBlur}
              onKeyDown={handleInputKeyDown}
              step={step}
              min={min}
              max={max}
              className={cn(
                "w-full h-full bg-transparent outline-none text-sm tabular-nums",
                "text-foreground"
              )}
              autoFocus
            />
          ) : (
            <span className="text-sm tabular-nums text-foreground select-none">
              {displayValue}
            </span>
          )}
          {suffix && !isEditing && (
            <span className="ml-0.5 text-xs text-muted-foreground select-none">
              {suffix}
            </span>
          )}
        </div>
      </div>
    );
  }
);

DraggableNumber.displayName = "DraggableNumber";

export default DraggableNumber;
