/**
 * RotationDial - Professional circular rotation input like After Effects
 * 
 * Features:
 * - Full 360° radial dial with draggable handle
 * - Visual tick marks at 0°, 90°, 180°, 270°
 * - Shift+drag for fine control (0.1° increments)
 * - Combined with numeric DraggableNumber input
 * - Snap-to-angle option (15° increments)
 * - Supports multiple rotations (values > 360° or < 0°)
 */

import * as React from "react";
import { cn } from "../../utils/general/utils";
import { DraggableNumber } from "./draggable-number";
import { RotateCcw } from "lucide-react";
import { Button } from "./button";

export interface RotationDialProps {
  /** Current rotation value in degrees */
  value: number;
  /** Callback when rotation changes */
  onChange: (value: number) => void;
  /** Whether to clamp to 0-360 or allow multiple rotations */
  clampTo360?: boolean;
  /** Whether snap to angles is enabled */
  snapEnabled?: boolean;
  /** Snap increment in degrees (default: 15) */
  snapIncrement?: number;
  /** Size of the dial in pixels (default: 64) */
  size?: number;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Show reset button */
  showReset?: boolean;
  /** Additional class names */
  className?: string;
}

export const RotationDial = React.forwardRef<HTMLDivElement, RotationDialProps>(
  (
    {
      value,
      onChange,
      clampTo360 = false,
      snapEnabled = false,
      snapIncrement = 15,
      size = 64,
      disabled = false,
      showReset = true,
      className,
    },
    ref
  ) => {
    const dialRef = React.useRef<SVGSVGElement>(null);
    const [isDragging, setIsDragging] = React.useState(false);
    const [isHovering, setIsHovering] = React.useState(false);
    // Local value for smooth visual updates during drag (prevents lag)
    const [localValue, setLocalValue] = React.useState(value);
    const dragStartAngle = React.useRef(0);
    const dragStartValue = React.useRef(0);
    const accumulatedRotation = React.useRef(0);
    const lastAngle = React.useRef(0);
    const rafRef = React.useRef<number | null>(null);

    // Sync local value with prop when not dragging
    React.useEffect(() => {
      if (!isDragging) {
        setLocalValue(value);
      }
    }, [value, isDragging]);

    // Use local value for display during drag, otherwise use prop value
    const displayValue = isDragging ? localValue : value;

    // Normalize angle for display (0-360)
    const displayAngle = ((displayValue % 360) + 360) % 360;

    // Calculate handle position
    const handleAngleRad = (displayAngle - 90) * (Math.PI / 180);
    const handleRadius = (size / 2) - 8;
    const handleX = size / 2 + Math.cos(handleAngleRad) * handleRadius;
    const handleY = size / 2 + Math.sin(handleAngleRad) * handleRadius;

    // Get angle from mouse position relative to dial center
    const getAngleFromMouse = React.useCallback((e: MouseEvent | React.MouseEvent) => {
      if (!dialRef.current) return 0;
      
      const rect = dialRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      const dx = e.clientX - centerX;
      const dy = e.clientY - centerY;
      
      // Convert to degrees (0° at top, clockwise)
      let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
      if (angle < 0) angle += 360;
      
      return angle;
    }, []);

    // Handle mouse down on dial
    const handleMouseDown = React.useCallback((e: React.MouseEvent) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      
      const angle = getAngleFromMouse(e);
      dragStartAngle.current = angle;
      dragStartValue.current = value;
      lastAngle.current = angle;
      accumulatedRotation.current = 0;
      
      // Initialize local value with current value
      setLocalValue(value);
      setIsDragging(true);
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
    }, [disabled, getAngleFromMouse, value]);

    // Handle mouse move (dragging) - uses local state for smooth updates
    React.useEffect(() => {
      if (!isDragging) return;

      const handleMouseMove = (e: MouseEvent) => {
        // Cancel any pending RAF to prevent buildup
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
        }

        // Use requestAnimationFrame for smoother visual updates
        rafRef.current = requestAnimationFrame(() => {
          const currentAngle = getAngleFromMouse(e);
          
          // Calculate delta with wrap-around handling
          let delta = currentAngle - lastAngle.current;
          
          // Handle crossing 0°/360° boundary
          if (delta > 180) delta -= 360;
          if (delta < -180) delta += 360;
          
          // Fine control with Shift
          if (e.shiftKey) {
            delta *= 0.1;
          }
          
          accumulatedRotation.current += delta;
          lastAngle.current = currentAngle;
          
          let newValue = dragStartValue.current + accumulatedRotation.current;
          
          // Snap to increment if enabled and not holding Shift
          if (snapEnabled && !e.shiftKey) {
            newValue = Math.round(newValue / snapIncrement) * snapIncrement;
          }
          
          // Clamp to 0-360 if required
          if (clampTo360) {
            newValue = ((newValue % 360) + 360) % 360;
          }
          
          // Update local state for smooth visual feedback (no parent re-render)
          setLocalValue(Number(newValue.toFixed(1)));
        });
      };

      const handleMouseUp = () => {
        // Cancel any pending RAF
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        
        // Commit the final value to parent
        onChange(localValue);
        
        setIsDragging(false);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);

      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
        }
      };
    }, [isDragging, getAngleFromMouse, onChange, clampTo360, snapEnabled, snapIncrement, localValue]);

    // Handle direct click on dial (jump to angle)
    const handleClick = React.useCallback((e: React.MouseEvent) => {
      if (disabled || isDragging) return;
      
      const angle = getAngleFromMouse(e);
      let newValue = angle;
      
      // Snap if enabled
      if (snapEnabled) {
        newValue = Math.round(newValue / snapIncrement) * snapIncrement;
      }
      
      // Preserve rotation count if not clamping
      if (!clampTo360) {
        const rotations = Math.floor(value / 360);
        newValue = rotations * 360 + newValue;
      }
      
      onChange(Number(newValue.toFixed(1)));
    }, [disabled, isDragging, getAngleFromMouse, snapEnabled, snapIncrement, clampTo360, value, onChange]);

    // Reset rotation
    const handleReset = React.useCallback(() => {
      onChange(0);
    }, [onChange]);

    // Generate tick marks
    const tickMarks = React.useMemo(() => {
      const ticks = [];
      const majorAngles = [0, 90, 180, 270];
      const tickLength = 4;
      const majorTickLength = 6;
      
      for (let i = 0; i < 360; i += 15) {
        const isMajor = majorAngles.includes(i);
        const angleRad = (i - 90) * (Math.PI / 180);
        const innerRadius = (size / 2) - (isMajor ? majorTickLength : tickLength) - 2;
        const outerRadius = (size / 2) - 2;
        
        const x1 = size / 2 + Math.cos(angleRad) * innerRadius;
        const y1 = size / 2 + Math.sin(angleRad) * innerRadius;
        const x2 = size / 2 + Math.cos(angleRad) * outerRadius;
        const y2 = size / 2 + Math.sin(angleRad) * outerRadius;
        
        ticks.push(
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="currentColor"
            strokeWidth={isMajor ? 1.5 : 1}
            opacity={isMajor ? 0.5 : 0.2}
          />
        );
      }
      
      return ticks;
    }, [size]);

    return (
      <div ref={ref} className={cn("flex items-center gap-3", className)}>
        {/* Circular Dial */}
        <div className="relative">
          <svg
            ref={dialRef}
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className={cn(
              "cursor-pointer transition-transform",
              isDragging && "scale-105",
              disabled && "opacity-50 cursor-not-allowed"
            )}
            onMouseDown={handleMouseDown}
            onClick={handleClick}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
          >
            {/* Background circle */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={size / 2 - 2}
              fill="hsl(var(--muted))"
              stroke="hsl(var(--border))"
              strokeWidth={1}
              opacity={0.5}
            />
            
            {/* Inner circle */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={size / 2 - 10}
              fill="hsl(var(--background))"
              stroke="hsl(var(--border))"
              strokeWidth={1}
            />
            
            {/* Tick marks */}
            <g className="text-muted-foreground">
              {tickMarks}
            </g>
            
            {/* Rotation arc (shows current rotation) */}
            {displayAngle > 0 && (
              <path
                d={describeArc(size / 2, size / 2, handleRadius - 4, 0, displayAngle)}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                strokeLinecap="round"
                opacity={0.6}
              />
            )}
            
            {/* Handle line from center */}
            <line
              x1={size / 2}
              y1={size / 2}
              x2={handleX}
              y2={handleY}
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              strokeLinecap="round"
            />
            
            {/* Handle circle */}
            <circle
              cx={handleX}
              cy={handleY}
              r={5}
              fill="hsl(var(--primary))"
              stroke="hsl(var(--primary-foreground))"
              strokeWidth={2}
              className={cn(
                "transition-all",
                (isDragging || isHovering) && "r-[6px]"
              )}
              style={{
                filter: isDragging ? "drop-shadow(0 0 4px hsl(var(--primary)))" : undefined
              }}
            />
            
            {/* Center dot */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={3}
              fill="hsl(var(--muted-foreground))"
            />
          </svg>
          
          {/* Rotation count badge (when > 360° or < 0°) */}
          {!clampTo360 && Math.abs(displayValue) >= 360 && (
            <div className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
              {Math.floor(Math.abs(displayValue) / 360)}x
            </div>
          )}
        </div>

        {/* Numeric Input */}
        <div className="flex flex-col gap-1">
          <DraggableNumber
            value={displayValue}
            onChange={onChange}
            suffix="°"
            decimals={1}
            step={1}
            sensitivity={0.5}
            disabled={disabled}
          />
          
          {/* Quick angles */}
          <div className="flex gap-0.5">
            {[0, 90, 180, 270].map((angle) => (
              <button
                key={angle}
                onClick={() => onChange(angle)}
                disabled={disabled}
                className={cn(
                  "text-[9px] px-1.5 py-0.5 rounded transition-colors",
                  "hover:bg-muted",
                  displayAngle === angle && "bg-accent text-accent-foreground",
                  disabled && "opacity-50 cursor-not-allowed"
                )}
              >
                {angle}°
              </button>
            ))}
          </div>
        </div>

        {/* Reset button */}
        {showReset && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleReset}
            disabled={disabled || value === 0}
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
        )}
      </div>
    );
  }
);

RotationDial.displayName = "RotationDial";

// Helper function to describe an SVG arc
function describeArc(x: number, y: number, radius: number, startAngle: number, endAngle: number): string {
  const startRad = (startAngle - 90) * Math.PI / 180;
  const endRad = (endAngle - 90) * Math.PI / 180;
  
  const startX = x + radius * Math.cos(startRad);
  const startY = y + radius * Math.sin(startRad);
  const endX = x + radius * Math.cos(endRad);
  const endY = y + radius * Math.sin(endRad);
  
  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;
  
  return `M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY}`;
}

export default RotationDial;
