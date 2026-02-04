/**
 * Professional Effect Control Components
 * 
 * High-performance, drag-optimized UI components inspired by:
 * - Adobe Premiere Pro
 * - Adobe After Effects  
 * - DaVinci Resolve
 * - Adobe Photoshop
 * 
 * Key optimization: Uses local state during drag for smooth 60fps updates,
 * only syncing to parent component on drag end or throttled intervals.
 */

import React, { useRef, useState, useCallback, useEffect, memo } from 'react';
import { cn } from '../../../utils/general/utils';
import { RotateCcw } from 'lucide-react';

// ============================================
// DRAGGABLE VALUE INPUT (Premiere Pro style)
// ============================================

interface DraggableValueProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  sensitivity?: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  label?: string;
  className?: string;
  showReset?: boolean;
  defaultValue?: number;
}

/**
 * Scrubable number input - click and drag horizontally to adjust value
 * Like Premiere Pro/After Effects property values
 */
export const DraggableValue = memo<DraggableValueProps>(({
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  sensitivity = 1,
  suffix = '',
  prefix = '',
  decimals = 0,
  label,
  className,
  showReset,
  defaultValue = 0,
}) => {
  // Local state for smooth dragging
  const [localValue, setLocalValue] = useState(value);
  const [isDragging, setIsDragging] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  // Refs to avoid stale closures
  const dragStartRef = useRef({ x: 0, value: 0 });
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  
  // Sync local value when prop changes (but not during drag)
  useEffect(() => {
    if (!isDragging && !isEditing) {
      setLocalValue(value);
    }
  }, [value, isDragging, isEditing]);
  
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isEditing) return;
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, value: localValue };
    document.body.style.cursor = 'ew-resize';
  }, [localValue, isEditing]);
  
  useEffect(() => {
    if (!isDragging) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - dragStartRef.current.x;
      let newValue = dragStartRef.current.value + delta * sensitivity * step;
      
      // Clamp to min/max
      newValue = Math.max(min, Math.min(max, newValue));
      
      // Round to step
      newValue = Math.round(newValue / step) * step;
      
      setLocalValue(newValue);
      // Throttled update to parent - every frame
      onChangeRef.current(newValue);
    };
    
    const handleMouseUp = () => {
      setIsDragging(false);
      document.body.style.cursor = '';
      // Final update
      onChangeRef.current(localValue);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
    };
  }, [isDragging, min, max, step, sensitivity, localValue]);
  
  const handleDoubleClick = useCallback(() => {
    setIsEditing(true);
  }, []);
  
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const parsed = parseFloat(e.target.value);
    if (!isNaN(parsed)) {
      const clamped = Math.max(min, Math.min(max, parsed));
      setLocalValue(clamped);
    }
  }, [min, max]);
  
  const handleInputBlur = useCallback(() => {
    setIsEditing(false);
    onChangeRef.current(localValue);
  }, [localValue]);
  
  const handleInputKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      setIsEditing(false);
      onChangeRef.current(localValue);
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setLocalValue(value);
    }
  }, [localValue, value]);
  
  const formatValue = (v: number) => {
    const formatted = decimals > 0 ? v.toFixed(decimals) : Math.round(v).toString();
    return `${prefix}${formatted}${suffix}`;
  };
  
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {label && (
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide w-16 shrink-0">
          {label}
        </span>
      )}
      <div className="relative flex-1 flex items-center">
        {isEditing ? (
          <input
            type="number"
            value={localValue}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            onKeyDown={handleInputKeyDown}
            className={cn(
              "w-full h-7 px-2 bg-neutral-900 border border-primary rounded",
              "font-mono text-sm text-white text-center outline-none"
            )}
            autoFocus
            step={step}
            min={min !== -Infinity ? min : undefined}
            max={max !== Infinity ? max : undefined}
          />
        ) : (
          <div
            className={cn(
              "w-full h-7 px-2 flex items-center justify-center rounded",
              "bg-neutral-900/80 border border-neutral-700/50",
              "font-mono text-sm text-white select-none",
              "cursor-ew-resize transition-colors",
              "hover:bg-neutral-800 hover:border-neutral-600",
              isDragging && "bg-neutral-800 border-primary ring-1 ring-primary/30"
            )}
            onMouseDown={handleMouseDown}
            onDoubleClick={handleDoubleClick}
            title="Drag to adjust • Double-click to type"
          >
            {formatValue(localValue)}
          </div>
        )}
      </div>
      {showReset && localValue !== defaultValue && (
        <button
          onClick={() => {
            setLocalValue(defaultValue);
            onChangeRef.current(defaultValue);
          }}
          className="h-6 w-6 flex items-center justify-center rounded hover:bg-neutral-800 text-muted-foreground hover:text-foreground transition-colors"
          title="Reset to default"
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      )}
    </div>
  );
});
DraggableValue.displayName = 'DraggableValue';


// ============================================
// PROFESSIONAL SLIDER (After Effects style)
// ============================================

interface ProSliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  suffix?: string;
  decimals?: number;
  showValue?: boolean;
  gradient?: string;
  className?: string;
}

/**
 * Professional slider with track dragging and smooth updates
 */
export const ProSlider = memo<ProSliderProps>(({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  suffix = '',
  decimals = 0,
  showValue = true,
  gradient,
  className,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [localValue, setLocalValue] = useState(value);
  const [isDragging, setIsDragging] = useState(false);
  
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  
  // Sync with prop when not dragging
  useEffect(() => {
    if (!isDragging) {
      setLocalValue(value);
    }
  }, [value, isDragging]);
  
  const calculateValue = useCallback((clientX: number) => {
    if (!trackRef.current) return localValue;
    const rect = trackRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    let newValue = min + percent * (max - min);
    newValue = Math.round(newValue / step) * step;
    return Math.max(min, Math.min(max, newValue));
  }, [min, max, step, localValue]);
  
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const newValue = calculateValue(e.clientX);
    setLocalValue(newValue);
    onChangeRef.current(newValue);
  }, [calculateValue]);
  
  useEffect(() => {
    if (!isDragging) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      const newValue = calculateValue(e.clientX);
      setLocalValue(newValue);
      onChangeRef.current(newValue);
    };
    
    const handleMouseUp = () => {
      setIsDragging(false);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, calculateValue]);
  
  const percent = ((localValue - min) / (max - min)) * 100;
  
  // For bidirectional sliders (where min < 0 and max > 0), show fill from center
  const isBidirectional = min < 0 && max > 0;
  const centerPercent = isBidirectional ? ((0 - min) / (max - min)) * 100 : 0;
  
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {label && (
        <span className="text-xs text-muted-foreground w-20 shrink-0">{label}</span>
      )}
      <div
        ref={trackRef}
        className={cn(
          "relative flex-1 h-5 rounded cursor-pointer select-none",
          "bg-neutral-800/80"
        )}
        onMouseDown={handleMouseDown}
      >
        {/* Track fill - for bidirectional, fill from center; otherwise from left */}
        {isBidirectional ? (
          <div
            className="absolute inset-y-0 rounded"
            style={{
              left: percent < centerPercent ? `${percent}%` : `${centerPercent}%`,
              width: `${Math.abs(percent - centerPercent)}%`,
              background: gradient || 'linear-gradient(to right, #3b82f6, #60a5fa)',
            }}
          />
        ) : (
          <div
            className="absolute inset-y-0 left-0 rounded-l"
            style={{
              width: `${percent}%`,
              background: gradient || 'linear-gradient(to right, #3b82f6, #60a5fa)',
            }}
          />
        )}
        {/* Center line for bidirectional sliders */}
        {isBidirectional && (
          <div 
            className="absolute top-0 bottom-0 w-px bg-neutral-500"
            style={{ left: `${centerPercent}%` }}
          />
        )}
        {/* Handle */}
        <div
          className={cn(
            "absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full",
            "bg-white shadow-md border border-neutral-300",
            "transition-transform",
            isDragging && "scale-125"
          )}
          style={{ left: `calc(${percent}% - 6px)` }}
        />
      </div>
      {showValue && (
        <span className="text-xs text-muted-foreground w-12 text-right font-mono">
          {decimals > 0 ? localValue.toFixed(decimals) : Math.round(localValue)}{suffix}
        </span>
      )}
    </div>
  );
});
ProSlider.displayName = 'ProSlider';


// ============================================
// HUE WHEEL (DaVinci Resolve style)
// ============================================

interface HueWheelProps {
  value: number; // 0-360
  onChange: (value: number) => void;
  size?: number;
  className?: string;
}

/**
 * Interactive color wheel for hue rotation
 * Supports smooth dragging around the wheel
 */
export const HueWheel = memo<HueWheelProps>(({
  value,
  onChange,
  size = 80,
  className,
}) => {
  const wheelRef = useRef<HTMLDivElement>(null);
  const [localValue, setLocalValue] = useState(value);
  const [isDragging, setIsDragging] = useState(false);
  
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  
  // Sync with prop when not dragging
  useEffect(() => {
    if (!isDragging) {
      setLocalValue(value);
    }
  }, [value, isDragging]);
  
  const calculateAngle = useCallback((clientX: number, clientY: number) => {
    if (!wheelRef.current) return localValue;
    const rect = wheelRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    
    let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
    if (angle < 0) angle += 360;
    return Math.round(angle) % 360;
  }, [localValue]);
  
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    const angle = calculateAngle(e.clientX, e.clientY);
    setLocalValue(angle);
    onChangeRef.current(angle);
  }, [calculateAngle]);
  
  useEffect(() => {
    if (!isDragging) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      const angle = calculateAngle(e.clientX, e.clientY);
      setLocalValue(angle);
      onChangeRef.current(angle);
    };
    
    const handleMouseUp = () => {
      setIsDragging(false);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, calculateAngle]);
  
  // Calculate indicator position
  const indicatorAngle = (localValue - 90) * (Math.PI / 180);
  const radius = (size / 2) - 8;
  const indicatorX = Math.cos(indicatorAngle) * radius;
  const indicatorY = Math.sin(indicatorAngle) * radius;
  
  // Display value in -180 to 180 range
  const displayValue = localValue > 180 ? localValue - 360 : localValue;
  
  return (
    <div
      ref={wheelRef}
      className={cn(
        "relative rounded-full shrink-0 cursor-crosshair select-none",
        "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1),0_2px_8px_rgba(0,0,0,0.3)]",
        isDragging && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        className
      )}
      style={{
        width: size,
        height: size,
        background: `conic-gradient(from 0deg, 
          hsl(0, 85%, 55%), 
          hsl(30, 85%, 55%),
          hsl(60, 85%, 55%), 
          hsl(90, 85%, 55%),
          hsl(120, 85%, 55%), 
          hsl(150, 85%, 55%),
          hsl(180, 85%, 55%), 
          hsl(210, 85%, 55%),
          hsl(240, 85%, 55%), 
          hsl(270, 85%, 55%),
          hsl(300, 85%, 55%), 
          hsl(330, 85%, 55%),
          hsl(360, 85%, 55%)
        )`,
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Inner dark circle */}
      <div 
        className="absolute rounded-full bg-neutral-900/90"
        style={{
          inset: size * 0.15,
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5), inset 0 -1px 2px rgba(255,255,255,0.05)'
        }}
      />
      
      {/* Rotation indicator line */}
      <div 
        className="absolute pointer-events-none"
        style={{
          top: '50%',
          left: '50%',
          width: 2,
          height: size * 0.4,
          transformOrigin: 'bottom center',
          transform: `translate(-50%, -100%) rotate(${localValue}deg)`,
          background: 'linear-gradient(to top, transparent, white 20%, white)',
          boxShadow: '0 0 4px rgba(255,255,255,0.5)',
        }}
      />
      
      {/* Indicator dot */}
      <div 
        className="absolute w-3 h-3 rounded-full pointer-events-none"
        style={{
          left: `calc(50% + ${indicatorX}px)`,
          top: `calc(50% + ${indicatorY}px)`,
          transform: 'translate(-50%, -50%)',
          background: `hsl(${localValue}, 85%, 55%)`,
          boxShadow: '0 0 0 2px white, 0 2px 8px rgba(0,0,0,0.5)',
        }}
      />
      
      {/* Center value display */}
      <div 
        className="absolute inset-0 flex items-center justify-center text-[11px] font-mono font-medium text-white/90 pointer-events-none"
      >
        {displayValue}°
      </div>
    </div>
  );
});
HueWheel.displayName = 'HueWheel';


// ============================================
// COLOR INPUT (After Effects style)
// ============================================

interface ColorInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  className?: string;
}

/**
 * Professional color picker with swatch and hex input
 */
export const ColorInput = memo<ColorInputProps>(({
  value,
  onChange,
  label,
  className,
}) => {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {label && (
        <span className="text-xs text-muted-foreground w-20 shrink-0">{label}</span>
      )}
      <div className="flex-1 flex items-center gap-1.5">
        {/* Color swatch with picker */}
        <div className="relative">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <div
            className={cn(
              "w-8 h-7 rounded border border-neutral-600",
              "shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
            )}
            style={{ backgroundColor: value }}
          />
        </div>
        {/* Hex input */}
        <input
          type="text"
          value={value.toUpperCase()}
          onChange={(e) => {
            let hex = e.target.value;
            if (!hex.startsWith('#')) hex = '#' + hex;
            if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
              onChange(hex);
            }
          }}
          className={cn(
            "flex-1 h-7 px-2 bg-neutral-900/80 border border-neutral-700/50 rounded",
            "font-mono text-xs text-white",
            "focus:outline-none focus:border-primary"
          )}
          placeholder="#000000"
        />
      </div>
    </div>
  );
});
ColorInput.displayName = 'ColorInput';


// ============================================
// VECTOR 2D INPUT (Position/Scale controls)
// ============================================

interface Vector2DInputProps {
  x: number;
  y: number;
  onChangeX: (value: number) => void;
  onChangeY: (value: number) => void;
  minX?: number;
  maxX?: number;
  minY?: number;
  maxY?: number;
  step?: number;
  label?: string;
  labelX?: string;
  labelY?: string;
  suffix?: string;
  linked?: boolean;
  onLinkToggle?: () => void;
}

/**
 * Linked X/Y value inputs for position, scale, etc.
 */
export const Vector2DInput = memo<Vector2DInputProps>(({
  x,
  y,
  onChangeX,
  onChangeY,
  minX = -Infinity,
  maxX = Infinity,
  minY = -Infinity,
  maxY = Infinity,
  step = 1,
  label,
  labelX = 'X',
  labelY = 'Y',
  suffix = '',
  linked,
  onLinkToggle,
}) => {
  return (
    <div className="space-y-1">
      {label && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{label}</span>
          {onLinkToggle && (
            <button
              onClick={onLinkToggle}
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded",
                linked
                  ? "bg-primary/20 text-primary"
                  : "bg-neutral-800 text-muted-foreground hover:text-foreground"
              )}
            >
              {linked ? '🔗' : '⛓️‍💥'}
            </button>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <DraggableValue
          value={x}
          onChange={(v) => {
            onChangeX(v);
            if (linked) onChangeY(v);
          }}
          min={minX}
          max={maxX}
          step={step}
          suffix={suffix}
          label={labelX}
        />
        <DraggableValue
          value={y}
          onChange={(v) => {
            onChangeY(v);
            if (linked) onChangeX(v);
          }}
          min={minY}
          max={maxY}
          step={step}
          suffix={suffix}
          label={labelY}
        />
      </div>
    </div>
  );
});
Vector2DInput.displayName = 'Vector2DInput';


// ============================================
// GRADIENT SPECTRUM (For hue/color range)
// ============================================

interface GradientSpectrumProps {
  value: number;
  onChange: (value: number) => void;
  max?: number;
  className?: string;
}

/**
 * Clickable gradient bar for selecting values on a spectrum
 */
export const GradientSpectrum = memo<GradientSpectrumProps>(({
  value,
  onChange,
  max = 360,
  className,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  
  useEffect(() => {
    if (!isDragging) setLocalValue(value);
  }, [value, isDragging]);
  
  const calculateValue = useCallback((clientX: number) => {
    if (!trackRef.current) return localValue;
    const rect = trackRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(percent * max);
  }, [max, localValue]);
  
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const v = calculateValue(e.clientX);
    setLocalValue(v);
    onChangeRef.current(v);
  }, [calculateValue]);
  
  useEffect(() => {
    if (!isDragging) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      const v = calculateValue(e.clientX);
      setLocalValue(v);
      onChangeRef.current(v);
    };
    
    const handleMouseUp = () => setIsDragging(false);
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, calculateValue]);
  
  return (
    <div
      ref={trackRef}
      className={cn(
        "h-4 rounded cursor-pointer relative overflow-hidden",
        className
      )}
      style={{
        background: `linear-gradient(to right, 
          hsl(0, 85%, 55%), 
          hsl(60, 85%, 55%), 
          hsl(120, 85%, 55%), 
          hsl(180, 85%, 55%), 
          hsl(240, 85%, 55%), 
          hsl(300, 85%, 55%), 
          hsl(360, 85%, 55%)
        )`,
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.3)'
      }}
      onMouseDown={handleMouseDown}
    >
      <div 
        className="absolute top-0 bottom-0 w-0.5 bg-white pointer-events-none"
        style={{
          left: `${(localValue / max) * 100}%`,
          boxShadow: '0 0 4px rgba(0,0,0,0.5), 0 0 2px white',
        }}
      />
    </div>
  );
});
GradientSpectrum.displayName = 'GradientSpectrum';


// ============================================
// ANGLE DIAL (Rotation control)
// ============================================

interface AngleDialProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  size?: number;
  className?: string;
}

/**
 * Circular dial for angle/rotation values
 */
export const AngleDial = memo<AngleDialProps>(({
  value,
  onChange,
  min = -360,
  max = 360,
  size = 48,
  className,
}) => {
  const dialRef = useRef<HTMLDivElement>(null);
  const [localValue, setLocalValue] = useState(value);
  const [isDragging, setIsDragging] = useState(false);
  
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  
  useEffect(() => {
    if (!isDragging) setLocalValue(value);
  }, [value, isDragging]);
  
  const calculateAngle = useCallback((clientX: number, clientY: number) => {
    if (!dialRef.current) return localValue;
    const rect = dialRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    
    let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
    if (angle > 180) angle -= 360;
    return Math.max(min, Math.min(max, Math.round(angle)));
  }, [min, max, localValue]);
  
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const angle = calculateAngle(e.clientX, e.clientY);
    setLocalValue(angle);
    onChangeRef.current(angle);
  }, [calculateAngle]);
  
  useEffect(() => {
    if (!isDragging) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      const angle = calculateAngle(e.clientX, e.clientY);
      setLocalValue(angle);
      onChangeRef.current(angle);
    };
    
    const handleMouseUp = () => setIsDragging(false);
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, calculateAngle]);
  
  return (
    <div
      ref={dialRef}
      className={cn(
        "relative rounded-full cursor-crosshair select-none",
        "bg-neutral-800 border border-neutral-700",
        isDragging && "ring-2 ring-primary",
        className
      )}
      style={{ width: size, height: size }}
      onMouseDown={handleMouseDown}
    >
      {/* Tick marks */}
      {[0, 90, 180, 270].map((tick) => (
        <div
          key={tick}
          className="absolute w-0.5 h-1.5 bg-neutral-600"
          style={{
            top: tick === 0 ? 2 : tick === 180 ? 'auto' : '50%',
            bottom: tick === 180 ? 2 : 'auto',
            left: tick === 90 ? 'auto' : tick === 270 ? 2 : '50%',
            right: tick === 90 ? 2 : 'auto',
            transform: tick === 0 || tick === 180 ? 'translateX(-50%)' : 'translateY(-50%)',
          }}
        />
      ))}
      
      {/* Indicator line */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: '50%',
          left: '50%',
          width: 2,
          height: size * 0.4,
          transformOrigin: 'bottom center',
          transform: `translate(-50%, -100%) rotate(${localValue}deg)`,
          background: 'linear-gradient(to top, #3b82f6, white)',
          borderRadius: 1,
        }}
      />
      
      {/* Center dot */}
      <div
        className="absolute w-2 h-2 rounded-full bg-neutral-600"
        style={{
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        }}
      />
    </div>
  );
});
AngleDial.displayName = 'AngleDial';


// ============================================
// TOGGLE SWITCH (Professional style)
// ============================================

interface ProToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  className?: string;
}

export const ProToggle = memo<ProToggleProps>(({
  checked,
  onChange,
  label,
  className,
}) => {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {label && (
        <span className="text-xs text-muted-foreground flex-1">{label}</span>
      )}
      <button
        onClick={() => onChange(!checked)}
        className={cn(
          "relative w-9 h-5 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-neutral-700"
        )}
      >
        <div
          className={cn(
            "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-4" : "translate-x-0.5"
          )}
        />
      </button>
    </div>
  );
});
ProToggle.displayName = 'ProToggle';
