/**
 * KeyframesSection - Adobe Premiere Pro Effect Controls Style Panel
 * 
 * Replicates the exact Adobe Premiere Pro Effect Controls keyframe editing experience.
 * 
 * LAYOUT:
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ EFFECT CONTROLS                                  0:01.50 / 0:05.00   │
 * ├──────────────────────────────────────────────────────────────────────┤
 * │ ▼ Timeline Ruler [----0:00----0:01----0:02----0:03----0:04----]      │
 * ├──────────────────────────────────────────────────────────────────────┤
 * │ TRANSFORM                                                            │
 * ├──────────────────────────────────────────────────────────────────────┤
 * │ [⏱] Position X  [◄][◆][►]                                    500.0  │
 * │     [◇─────────◇─────────────◇─────────────────] (keyframe track)   │
 * ├──────────────────────────────────────────────────────────────────────┤
 * │ [⏱] Position Y  [◄][◆][►]                                    300.0  │
 * │     [◇─────────────────────────────────────────◇]                   │
 * └──────────────────────────────────────────────────────────────────────┘
 * 
 * KEY FEATURES (matching Premiere Pro exactly):
 * - Dark charcoal color scheme (#1e1e1e, #232323, #2d2d2d)
 * - Blue accent color (#4eb3ff) for active/animated elements
 * - Stopwatch (⏱) toggles animation on/off - blue highlight when active
 * - ◄ ◆ ► navigation controls inline with property name
 * - Filled diamond (◆) when at keyframe, hollow when not
 * - Value input on far right, drag-to-scrub (double-click to edit)
 * - Separate keyframe track row below each animated property
 * - Blue playhead (triangle) on ruler and red line on tracks
 * - Right-click context menu for interpolation options
 */

import React, { useMemo, useCallback, useState, useRef, Fragment, useEffect } from "react";
import { 
  Clock, 
  Diamond, 
  ChevronLeft, 
  ChevronRight, 
  Trash2,
  Copy,
  Clipboard,
  AlignHorizontalJustifyCenter,
  AlignHorizontalDistributeCenter,
  AlignLeft,
  AlignRight,
  Sparkles,
} from "lucide-react";
import { cn } from "../../../utils/general/utils";
import { useVideoEditorStore, useVideoEditorActions, selectFps, selectKeyframeClipboard } from "../../../stores/video-editor-store";
import { useOptimizedScrubbing } from "../../../hooks/use-optimized-scrubbing";
import { useEditorContext } from "../../../contexts/editor-context";
import type { TimelineClip } from "../../../types/timeline-v2";
import type { PropertyKeyframes, Keyframe, KeyframeInterpolation } from "../../../types/keyframes";
import { EASE_IN_OUT_HANDLES } from "../../../types/keyframes";
import { getInterpolatedValue, getNearestKeyframeTime } from "../../../utils/keyframe-interpolator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../ui/tooltip";
import { ScrollArea } from "../../ui/scroll-area";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "../../ui/context-menu";
import { BezierCurveEditor } from "./bezier-curve-editor";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../ui/collapsible";
import { ChevronDown, Square, Circle, Pentagon, Layers } from "lucide-react";
import { Mask, MaskType, ShapeMaskType, ShapeMask, RectangleMask, EllipseMask, PolygonMask } from "../../../types/masks";

// ==========================================
// SCRUB NUMBER INPUT COMPONENT
// ==========================================

interface ScrubNumberInputProps {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  color?: string;
  isKeyframed?: boolean;
}

/**
 * Premiere Pro style number input with drag-to-change
 * - Click and drag horizontally to change value
 * - Double-click to select and type a value
 * - Shows cursor as ew-resize when hovering
 */
const ScrubNumberInput: React.FC<ScrubNumberInputProps> = ({
  value,
  onChange,
  step = 1,
  min,
  max,
  unit,
  color,
  isKeyframed,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, value: 0 });
  const hasDraggedRef = useRef(false);
  
  // Sensitivity: how many pixels to drag for one step
  const sensitivity = step < 1 ? 50 : (step >= 10 ? 5 : 10);
  
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Don't start drag if clicking in the input while editing
    if (isEditing) return;
    
    e.preventDefault();
    setIsDragging(true);
    hasDraggedRef.current = false;
    dragStartRef.current = { x: e.clientX, value };
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - dragStartRef.current.x;
      // Only start "real" dragging after 3px threshold
      if (Math.abs(deltaX) > 3) {
        hasDraggedRef.current = true;
      }
      const deltaSteps = Math.round(deltaX / sensitivity);
      let newValue = dragStartRef.current.value + (deltaSteps * step);
      
      // Apply min/max constraints
      if (min !== undefined) newValue = Math.max(min, newValue);
      if (max !== undefined) newValue = Math.min(max, newValue);
      
      onChange(newValue);
    };
    
    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [isEditing, value, step, sensitivity, min, max, onChange]);
  
  // Double-click to enter edit mode (Premiere Pro behavior)
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
    setEditValue(String(Math.round(value * 100) / 100));
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  }, [value]);
  
  // Edit mode is triggered by double-click, not single click
  // (Premiere Pro behavior - single click starts drag)
  
  const handleBlur = useCallback(() => {
    setIsEditing(false);
    const newValue = parseFloat(editValue);
    if (!isNaN(newValue)) {
      let clampedValue = newValue;
      if (min !== undefined) clampedValue = Math.max(min, clampedValue);
      if (max !== undefined) clampedValue = Math.min(max, clampedValue);
      onChange(clampedValue);
    }
  }, [editValue, min, max, onChange]);
  
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBlur();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  }, [handleBlur]);
  
  const displayValue = Math.round(value * 100) / 100;
  
  return (
    <div
      className={cn(
        "relative flex items-center justify-end h-7 min-w-[65px] px-2 select-none",
        "bg-muted/50 hover:bg-muted transition-colors rounded",
        isDragging && "bg-primary/20",
        !isEditing && "cursor-ew-resize"
      )}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          type="number"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          step={step}
          min={min}
          max={max}
          className="w-full h-full bg-transparent text-right text-sm font-mono outline-none text-foreground"
        />
      ) : (
        <span 
          className={cn(
            "text-sm font-mono whitespace-nowrap tabular-nums",
            isKeyframed ? "text-primary font-medium" : "text-foreground"
          )}
          style={{ color: color }}
        >
          {displayValue}
          {unit && <span className="text-muted-foreground ml-1">{unit}</span>}
        </span>
      )}
    </div>
  );
};

// ==========================================
// TYPES
// ==========================================

interface KeyframesSectionProps {
  clip: TimelineClip;
  currentTime: number; // Global playback time
}

interface AnimatableProperty {
  path: string;
  name: string;
  shortName: string;
  color: string;
  getValue: (clip: TimelineClip) => number;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
}

interface SelectedKeyframe {
  keyframeId: string;
  propertyPath: string;
}

// ==========================================
// CONSTANTS
// ==========================================

const TRANSFORM_PROPERTIES: AnimatableProperty[] = [
  { 
    path: 'transform.x', 
    name: 'Position X', 
    shortName: 'X',
    color: '#EF4444', 
    getValue: (clip) => clip.transform?.x ?? 0,
    unit: 'px'
  },
  { 
    path: 'transform.y', 
    name: 'Position Y', 
    shortName: 'Y',
    color: '#22C55E', 
    getValue: (clip) => clip.transform?.y ?? 0,
    unit: 'px'
  },
  { 
    path: 'transform.scale', 
    name: 'Scale', 
    shortName: 'Scale',
    color: '#8B5CF6', 
    getValue: (clip) => (clip.transform as any)?.scale ?? 1,
    min: 0.01, max: 10, step: 0.01
  },
  { 
    path: 'transform.rotation', 
    name: 'Rotation', 
    shortName: 'Rotation',
    color: '#F59E0B', 
    getValue: (clip) => clip.transform?.rotation ?? 0,
    unit: '°',
    step: 1
  },
  { 
    path: 'transform.opacity', 
    name: 'Opacity', 
    shortName: 'Opacity',
    color: '#06B6D4', 
    getValue: (clip) => clip.styles?.opacity ?? 1,
    min: 0, max: 1, step: 0.01
  },
];

// Keep PROPERTIES for backward compatibility
const PROPERTIES = TRANSFORM_PROPERTIES;

/**
 * Mask property colors (similar to Premiere Pro's mask color coding)
 */
const MASK_COLORS = [
  '#FF6B6B', // red
  '#4ECDC4', // teal
  '#FFE66D', // yellow
  '#95E1D3', // mint
  '#F8B500', // gold
  '#FF8CC6', // pink
];

/**
 * Get icon for mask shape type
 */
const getMaskIcon = (mask: Mask): React.ElementType => {
  if (mask.type === MaskType.SHAPE) {
    const shapeMask = mask as ShapeMask;
    switch (shapeMask.shapeType) {
      case ShapeMaskType.RECTANGLE: return Square;
      case ShapeMaskType.ELLIPSE: return Circle;
      case ShapeMaskType.POLYGON: return Pentagon;
    }
  }
  return Layers;
};

/**
 * Generate animatable properties for a mask based on its type
 * Like Premiere Pro, allows animating position, size, feather, expansion, opacity per mask
 */
function getMaskProperties(mask: Mask, maskIndex: number): AnimatableProperty[] {
  const colorIndex = maskIndex % MASK_COLORS.length;
  const baseColor = MASK_COLORS[colorIndex];
  const maskName = mask.name || `Mask ${maskIndex + 1}`;
  const basePath = `masks[${maskIndex}]`;
  
  const commonProperties: AnimatableProperty[] = [
    {
      path: `${basePath}.edgeFeather.top`,
      name: `${maskName} Feather`,
      shortName: 'Feather',
      color: baseColor,
      getValue: (clip) => {
        const m = clip.masks?.[maskIndex];
        return m?.edgeFeather?.top ?? 0;
      },
      unit: 'px',
      min: 0,
      max: 100,
      step: 1,
    },
    {
      path: `${basePath}.expansion`,
      name: `${maskName} Expansion`,
      shortName: 'Expansion',
      color: baseColor,
      getValue: (clip) => {
        const m = clip.masks?.[maskIndex];
        return m?.expansion ?? 0;
      },
      unit: 'px',
      min: -100,
      max: 100,
      step: 1,
    },
    {
      path: `${basePath}.opacity`,
      name: `${maskName} Opacity`,
      shortName: 'Opacity',
      color: baseColor,
      getValue: (clip) => {
        const m = clip.masks?.[maskIndex];
        return m?.opacity ?? 1;
      },
      min: 0,
      max: 1,
      step: 0.01,
    },
  ];

  if (mask.type === MaskType.SHAPE) {
    const shapeMask = mask as ShapeMask;
    
    if (shapeMask.shapeType === ShapeMaskType.RECTANGLE) {
      const rectMask = shapeMask as RectangleMask;
      return [
        {
          path: `${basePath}.x`,
          name: `${maskName} X`,
          shortName: 'X',
          color: baseColor,
          getValue: (clip) => {
            const m = clip.masks?.[maskIndex] as RectangleMask | undefined;
            return m?.x ?? rectMask.x;
          },
          unit: '%',
          min: -100,
          max: 200,
          step: 0.5,
        },
        {
          path: `${basePath}.y`,
          name: `${maskName} Y`,
          shortName: 'Y',
          color: baseColor,
          getValue: (clip) => {
            const m = clip.masks?.[maskIndex] as RectangleMask | undefined;
            return m?.y ?? rectMask.y;
          },
          unit: '%',
          min: -100,
          max: 200,
          step: 0.5,
        },
        {
          path: `${basePath}.width`,
          name: `${maskName} Width`,
          shortName: 'W',
          color: baseColor,
          getValue: (clip) => {
            const m = clip.masks?.[maskIndex] as RectangleMask | undefined;
            return m?.width ?? rectMask.width;
          },
          unit: '%',
          min: 0,
          max: 200,
          step: 0.5,
        },
        {
          path: `${basePath}.height`,
          name: `${maskName} Height`,
          shortName: 'H',
          color: baseColor,
          getValue: (clip) => {
            const m = clip.masks?.[maskIndex] as RectangleMask | undefined;
            return m?.height ?? rectMask.height;
          },
          unit: '%',
          min: 0,
          max: 200,
          step: 0.5,
        },
        {
          path: `${basePath}.cornerRadius`,
          name: `${maskName} Roundness`,
          shortName: 'Radius',
          color: baseColor,
          getValue: (clip) => {
            const m = clip.masks?.[maskIndex] as RectangleMask | undefined;
            return m?.cornerRadius ?? rectMask.cornerRadius;
          },
          unit: 'px',
          min: 0,
          max: 200,
          step: 1,
        },
        ...commonProperties,
      ];
    }
    
    if (shapeMask.shapeType === ShapeMaskType.ELLIPSE) {
      const ellipseMask = shapeMask as EllipseMask;
      return [
        {
          path: `${basePath}.centerX`,
          name: `${maskName} Center X`,
          shortName: 'CX',
          color: baseColor,
          getValue: (clip) => {
            const m = clip.masks?.[maskIndex] as EllipseMask | undefined;
            return m?.centerX ?? ellipseMask.centerX;
          },
          unit: '%',
          min: -100,
          max: 200,
          step: 0.5,
        },
        {
          path: `${basePath}.centerY`,
          name: `${maskName} Center Y`,
          shortName: 'CY',
          color: baseColor,
          getValue: (clip) => {
            const m = clip.masks?.[maskIndex] as EllipseMask | undefined;
            return m?.centerY ?? ellipseMask.centerY;
          },
          unit: '%',
          min: -100,
          max: 200,
          step: 0.5,
        },
        {
          path: `${basePath}.radiusX`,
          name: `${maskName} Radius X`,
          shortName: 'RX',
          color: baseColor,
          getValue: (clip) => {
            const m = clip.masks?.[maskIndex] as EllipseMask | undefined;
            return m?.radiusX ?? ellipseMask.radiusX;
          },
          unit: '%',
          min: 0,
          max: 100,
          step: 0.5,
        },
        {
          path: `${basePath}.radiusY`,
          name: `${maskName} Radius Y`,
          shortName: 'RY',
          color: baseColor,
          getValue: (clip) => {
            const m = clip.masks?.[maskIndex] as EllipseMask | undefined;
            return m?.radiusY ?? ellipseMask.radiusY;
          },
          unit: '%',
          min: 0,
          max: 100,
          step: 0.5,
        },
        ...commonProperties,
      ];
    }
    
    // For polygon masks - animate expansion, feather, opacity (path animation is complex)
    if (shapeMask.shapeType === ShapeMaskType.POLYGON) {
      return commonProperties;
    }
  }
  
  // For gradient masks and other types - just common properties
  return commonProperties;
}

/**
 * Interpolation options with visual curve indicators
 * Ordered by common usage: Linear → Hold → Standard easings → Special effects
 */
// Interpolation options with categories for the context menu
const INTERPOLATION_OPTIONS = [
  // Basic
  { value: 'linear', label: 'Linear', description: 'Constant speed', curveColor: '#9CA3AF', category: 'basic' },
  { value: 'hold', label: 'Hold', description: 'No interpolation', curveColor: '#6B7280', category: 'basic' },
  // Smooth
  { value: 'ease', label: 'Ease', description: 'Gentle acceleration', curveColor: '#60A5FA', category: 'smooth' },
  { value: 'ease-in', label: 'Ease In', description: 'Slow start', curveColor: '#3B82F6', category: 'smooth' },
  { value: 'ease-out', label: 'Ease Out', description: 'Slow end', curveColor: '#10B981', category: 'smooth' },
  { value: 'ease-in-out', label: 'Ease In/Out', description: 'Slow both ends', curveColor: '#8B5CF6', category: 'smooth' },
  // Dramatic
  { value: 'ease-in-cubic', label: 'Ease In Cubic', description: 'Strong acceleration', curveColor: '#A855F7', category: 'dramatic' },
  { value: 'ease-out-cubic', label: 'Ease Out Cubic', description: 'Smooth landing', curveColor: '#22C55E', category: 'dramatic' },
  { value: 'ease-in-out-cubic', label: 'Ease In/Out Cubic', description: 'Professional S-curve', curveColor: '#A78BFA', category: 'dramatic' },
  { value: 'ease-in-quart', label: 'Ease In Quart', description: 'Heavy start', curveColor: '#C084FC', category: 'dramatic' },
  { value: 'ease-out-quart', label: 'Ease Out Quart', description: 'Dramatic settle', curveColor: '#34D399', category: 'dramatic' },
  { value: 'ease-in-expo', label: 'Ease In Expo', description: 'Explosive start', curveColor: '#E879F9', category: 'dramatic' },
  { value: 'ease-out-expo', label: 'Ease Out Expo', description: 'Instant slow-down', curveColor: '#4ADE80', category: 'dramatic' },
  // Bounce/Back
  { value: 'ease-in-back', label: 'Ease In Back', description: 'Pull back first', curveColor: '#F59E0B', category: 'bounce' },
  { value: 'ease-out-back', label: 'Ease Out Back', description: 'Overshoot & settle', curveColor: '#FBBF24', category: 'bounce' },
  { value: 'ease-in-out-back', label: 'Ease In/Out Back', description: 'Bounce both ends', curveColor: '#FCD34D', category: 'bounce' },
  // Special
  { value: 'ease-out-bounce', label: 'Bounce', description: 'Bouncing ball', curveColor: '#EF4444', category: 'special' },
  { value: 'ease-in-elastic', label: 'Elastic In', description: 'Spring tension', curveColor: '#F87171', category: 'special' },
  { value: 'ease-out-elastic', label: 'Elastic Out', description: 'Spring release', curveColor: '#FB923C', category: 'special' },
] as const;

// Category config for grouping in context menu
const INTERPOLATION_CATEGORIES = {
  basic: { label: 'Basic', color: '#9CA3AF' },
  smooth: { label: 'Smooth', color: '#3B82F6' },
  dramatic: { label: 'Dramatic', color: '#A855F7' },
  bounce: { label: 'Bounce', color: '#F59E0B' },
  special: { label: 'Special', color: '#EF4444' },
} as const;

/**
 * Get visual style for a keyframe based on its interpolation type
 * Different easing types get different visual indicators like in Premiere Pro
 */
function getKeyframeStyle(interpolation: KeyframeInterpolation | undefined) {
  const type = interpolation?.type || 'linear';
  const option = INTERPOLATION_OPTIONS.find(opt => opt.value === type);
  
  // Default style (diamond)
  const baseStyle = {
    shape: 'diamond' as const, // diamond, square, or circle
    color: option?.curveColor || '#9CA3AF',
    showCurveIndicator: type !== 'linear' && type !== 'hold',
  };
  
  // Specific shapes for special interpolation types
  if (type === 'hold') {
    return { ...baseStyle, shape: 'square' as const };
  }
  
  if (type === 'ease-out-bounce' || type.includes('elastic')) {
    return { ...baseStyle, shape: 'circle' as const };
  }
  
  return baseStyle;
}

/**
 * Mini easing curve SVG preview
 * Shows a small visual representation of the easing curve
 * Accurate bezier curves based on actual easing function shapes
 */
const EasingCurvePreview: React.FC<{ type: string; size?: number; color?: string; showBg?: boolean }> = ({ 
  type, 
  size = 24, 
  color = 'currentColor',
  showBg = false,
}) => {
  // SVG path data for different easing curves - accurate bezier representations
  const getPath = () => {
    const w = 22; // viewBox width - padding
    const h = 20; // viewBox height - padding
    const x1 = 2, y1 = h; // start point (bottom-left)
    const x2 = w, y2 = 2; // end point (top-right)
    
    switch (type) {
      case 'linear':
        return `M${x1},${y1} L${x2},${y2}`;
      case 'hold':
        return `M${x1},${y1} L${x1},${y2} L${x2},${y2}`;
      case 'ease':
        return `M${x1},${y1} C${x1 + 5},${y1 - 2} ${x2 - 5},${y2} ${x2},${y2}`;
      case 'ease-in':
      case 'ease-in-quad':
        return `M${x1},${y1} C${x1},${y1} ${x2 - 5},${y2 + 2} ${x2},${y2}`;
      case 'ease-out':
      case 'ease-out-quad':
        return `M${x1},${y1} C${x1 + 5},${y1 - 8} ${x2},${y2} ${x2},${y2}`;
      case 'ease-in-out':
      case 'ease-in-out-quad':
        return `M${x1},${y1} C${x1 + 8},${y1} ${x2 - 8},${y2} ${x2},${y2}`;
      case 'ease-in-cubic':
        return `M${x1},${y1} C${x1},${y1} ${x2 - 3},${y2 + 1} ${x2},${y2}`;
      case 'ease-out-cubic':
        return `M${x1},${y1} C${x1 + 4},${y1 - 12} ${x2},${y2} ${x2},${y2}`;
      case 'ease-in-out-cubic':
        return `M${x1},${y1} C${x1 + 10},${y1} ${x2 - 10},${y2} ${x2},${y2}`;
      case 'ease-in-quart':
        return `M${x1},${y1} C${x1},${y1} ${x2 - 2},${y2 + 1} ${x2},${y2}`;
      case 'ease-out-quart':
        return `M${x1},${y1} C${x1 + 3},${y1 - 15} ${x2},${y2} ${x2},${y2}`;
      case 'ease-in-out-quart':
        return `M${x1},${y1} C${x1 + 12},${y1} ${x2 - 12},${y2} ${x2},${y2}`;
      case 'ease-in-expo':
        return `M${x1},${y1} C${x1},${y1} ${x2 - 1},${y2 + 1} ${x2},${y2}`;
      case 'ease-out-expo':
        return `M${x1},${y1} C${x1 + 4},${y1 - 18} ${x2},${y2} ${x2},${y2}`;
      case 'ease-in-out-expo':
        return `M${x1},${y1} C${x1 + 15},${y1} ${x2 - 15},${y2} ${x2},${y2}`;
      case 'ease-in-back':
        return `M${x1},${y1} C${x1},${y1 + 4} ${x2 - 8},${y2 - 3} ${x2},${y2}`;
      case 'ease-out-back':
        return `M${x1},${y1} C${x1 + 3},${y1 - 16} ${x2},${y2 + 4} ${x2},${y2}`;
      case 'ease-in-out-back':
        return `M${x1},${y1} C${x1 + 10},${y1 + 6} ${x2 - 10},${y2 - 6} ${x2},${y2}`;
      case 'ease-out-bounce':
        // Simplified bounce curve
        return `M${x1},${y1} C${x1 + 4},${y1 - 14} ${x1 + 6},${y1 - 4} ${x1 + 9},${y2 + 2} Q${x1 + 11},${y2} ${x1 + 14},${y2 + 1} Q${x1 + 16},${y2} ${x1 + 18},${y2} L${x2},${y2}`;
      case 'ease-in-elastic':
        return `M${x1},${y1} C${x1},${y1 + 3} ${x1 + 5},${y1 + 5} ${x1 + 8},${y1 - 3} C${x1 + 11},${y1 - 10} ${x2 - 4},${y2 + 3} ${x2},${y2}`;
      case 'ease-out-elastic':
        return `M${x1},${y1} C${x1 + 4},${y1 - 14} ${x1 + 8},${y2 - 5} ${x1 + 12},${y2 + 3} C${x1 + 15},${y2 - 2} ${x2 - 2},${y2} ${x2},${y2}`;
      case 'ease-in-out-elastic':
        return `M${x1},${y1} C${x1 + 4},${y1 + 4} ${x1 + 8},${y1 - 6} ${12},${12} C${x2 - 8},${y2 + 6} ${x2 - 4},${y2 - 4} ${x2},${y2}`;
      default:
        return `M${x1},${y1} L${x2},${y2}`;
    }
  };

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="flex-shrink-0">
      {showBg && (
        <rect x={0} y={0} width={24} height={24} rx={3} fill="currentColor" fillOpacity={0.1} />
      )}
      {/* Linear reference line */}
      <line x1={2} y1={20} x2={22} y2={2} stroke="currentColor" strokeOpacity={0.15} strokeWidth={0.5} />
      <path 
        d={getPath()} 
        fill="none" 
        stroke={color} 
        strokeWidth="1.5" 
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const frames = Math.floor((seconds % 1) * 24);
  return `${mins}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
}

function formatTimeShort(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) {
    return `${mins}:${secs.toFixed(1).padStart(4, '0')}`;
  }
  return `${secs.toFixed(2)}s`;
}

// ==========================================
// TIMELINE RULER COMPONENT
// ==========================================

interface TimelineRulerProps {
  duration: number;
  currentTime: number; // Relative to clip start
  clipStartTime: number; // Global start time of the clip
  onScrubStart: () => void;
  onScrubEnd: () => void;
}

const TimelineRuler: React.FC<TimelineRulerProps> = ({
  duration,
  currentTime,
  clipStartTime,
  onScrubStart,
  onScrubEnd,
}) => {
  const rulerRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  // Local position for instant UI feedback during scrubbing
  const [localPosition, setLocalPosition] = useState<number | null>(null);
  
  // Use optimized scrubbing hook with local time callback for instant UI
  const { startScrubbing: startOptimizedScrub, updateTime, endScrubbing: endOptimizedScrub } = useOptimizedScrubbing({
    onScrubStart: () => {
      setIsScrubbing(true);
      onScrubStart();
    },
    onScrubEnd: () => {
      setIsScrubbing(false);
      setLocalPosition(null); // Clear local position, use prop again
      onScrubEnd();
    },
    pauseDuringScrub: true,
  });
  
  // Generate time markers
  const markers = useMemo(() => {
    const result: { time: number; label: string; major: boolean }[] = [];
    
    // Determine interval based on duration
    let interval = 0.5;
    if (duration > 30) interval = 5;
    else if (duration > 10) interval = 2;
    else if (duration > 5) interval = 1;
    
    for (let t = 0; t <= duration; t += interval) {
      result.push({
        time: t,
        label: formatTimeShort(t),
        major: t % (interval * 2) === 0,
      });
    }
    return result;
  }, [duration]);
  
  const xToRelativeTime = useCallback((clientX: number): number => {
    if (!rulerRef.current) return 0;
    const rect = rulerRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return percent * duration;
  }, [duration]);
  
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    startOptimizedScrub();
    
    // Calculate relative time
    const relativeTime = xToRelativeTime(e.clientX);
    const globalTime = clipStartTime + relativeTime;
    
    // INSTANT: Update local position for immediate visual feedback
    setLocalPosition((relativeTime / duration) * 100);
    
    // THROTTLED: Update store/player at 20fps
    updateTime(globalTime);
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const relativeTime = xToRelativeTime(moveEvent.clientX);
      const globalTime = clipStartTime + relativeTime;
      
      // INSTANT: Update local position
      setLocalPosition((relativeTime / duration) * 100);
      
      // THROTTLED: Update store/player
      updateTime(globalTime);
    };
    
    const handleMouseUp = () => {
      endOptimizedScrub();
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [xToRelativeTime, startOptimizedScrub, updateTime, endOptimizedScrub, clipStartTime, duration]);
  
  // Use local position during scrubbing, prop position otherwise
  const playheadPosition = localPosition !== null ? localPosition : (currentTime / duration) * 100;
  
  return (
    <div 
      ref={rulerRef}
      className="relative h-6 bg-muted/30 border-b border-border cursor-ew-resize select-none"
      onMouseDown={handleMouseDown}
    >
      {/* Time markers */}
      <div className="absolute inset-0">
        {markers.map((marker, i) => (
          <div
            key={i}
            className="absolute bottom-0 flex flex-col items-center"
            style={{ left: `${(marker.time / duration) * 100}%` }}
          >
            {marker.major && (
              <span className="text-[9px] -translate-x-1/2 mb-0.5 text-muted-foreground font-mono tabular-nums">
                {marker.label}
              </span>
            )}
            <div 
              className={cn(
                "w-px",
                marker.major ? "h-2 bg-muted-foreground/50" : "h-1 bg-muted-foreground/30"
              )}
            />
          </div>
        ))}
      </div>
      
      {/* Playhead */}
      <div 
        ref={playheadRef}
        className="absolute top-0 bottom-0 w-0.5 z-20 pointer-events-none bg-primary"
        style={{ 
          left: `${playheadPosition}%`,
          transition: isScrubbing ? 'none' : 'left 0.05s ease-out',
        }}
      >
        {/* Playhead triangle/head */}
        <div
          className="absolute -top-px left-1/2 -translate-x-1/2 pointer-events-auto cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
        >
          {/* Triangle pointing down */}
          <div 
            className="w-0 h-0"
            style={{
              borderLeft: '5px solid transparent',
              borderRight: '5px solid transparent',
              borderTop: '6px solid hsl(var(--primary))',
            }}
          />
        </div>
      </div>
    </div>
  );
};

// ==========================================
// PROPERTY ROW COMPONENT
// ==========================================

interface PropertyRowProps {
  clip: TimelineClip;
  property: AnimatableProperty;
  propertyKeyframes: PropertyKeyframes | null;
  currentTime: number; // Relative to clip start
  selectedKeyframes: SelectedKeyframe[];
  onSelectKeyframe: (keyframeId: string, propertyPath: string, addToSelection: boolean, rangeSelect: boolean) => void;
  onClearSelection: () => void;
}

/**
 * Custom comparison for PropertyRow to minimize re-renders during scrubbing.
 * Only re-renders when:
 * - Clip ID changes
 * - Property path changes
 * - Keyframes data changes (new keyframes, keyframe positions, etc.)
 * - Selection changes for this property
 * - currentTime crosses a keyframe boundary (not on every time change)
 */
const arePropertyRowPropsEqual = (
  prev: PropertyRowProps,
  next: PropertyRowProps
): boolean => {
  // Always re-render if clip or property changes
  if (prev.clip.id !== next.clip.id) return false;
  if (prev.property.path !== next.property.path) return false;
  
  // Re-render if keyframes data changed
  if (prev.propertyKeyframes !== next.propertyKeyframes) {
    // Deep check: enabled state, keyframe count, or keyframe times/values
    const prevKfs = prev.propertyKeyframes;
    const nextKfs = next.propertyKeyframes;
    if (prevKfs?.enabled !== nextKfs?.enabled) return false;
    if (prevKfs?.keyframes?.length !== nextKfs?.keyframes?.length) return false;
    // If keyframes exist, check if any keyframe changed
    if (prevKfs?.keyframes && nextKfs?.keyframes) {
      for (let i = 0; i < prevKfs.keyframes.length; i++) {
        const pKf = prevKfs.keyframes[i];
        const nKf = nextKfs.keyframes[i];
        if (pKf.time !== nKf.time || pKf.value !== nKf.value || pKf.id !== nKf.id) {
          return false;
        }
      }
    }
  }
  
  // Re-render if selection for this property changed
  const prevSelected = prev.selectedKeyframes.filter(sk => sk.propertyPath === prev.property.path);
  const nextSelected = next.selectedKeyframes.filter(sk => sk.propertyPath === next.property.path);
  if (prevSelected.length !== nextSelected.length) return false;
  for (let i = 0; i < prevSelected.length; i++) {
    if (prevSelected[i].keyframeId !== nextSelected[i].keyframeId) return false;
  }
  
  // Check if currentTime crossed a keyframe boundary
  // This is the key optimization: don't re-render on every time change,
  // only when we enter/exit a keyframe's "at playhead" zone (within 0.02s)
  const keyframes = next.propertyKeyframes?.keyframes ?? [];
  const THRESHOLD = 0.02;
  
  const prevAtKeyframe = keyframes.find(kf => Math.abs(kf.time - prev.currentTime) < THRESHOLD);
  const nextAtKeyframe = keyframes.find(kf => Math.abs(kf.time - next.currentTime) < THRESHOLD);
  
  // Re-render if we moved from "at keyframe" to "not at keyframe" or vice versa
  if ((prevAtKeyframe?.id ?? null) !== (nextAtKeyframe?.id ?? null)) return false;
  
  // Also re-render if clip duration changed (affects percentage calculations)
  if (prev.clip.duration !== next.clip.duration) return false;
  
  // All important props are equal - skip re-render
  return true;
};

const PropertyRow: React.FC<PropertyRowProps> = React.memo(({
  clip,
  property,
  propertyKeyframes,
  currentTime,
  selectedKeyframes,
  onSelectKeyframe,
  onClearSelection,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [draggedKeyframeIds, setDraggedKeyframeIds] = useState<string[]>([]);
  const [dragStartTimes, setDragStartTimes] = useState<Map<string, number>>(new Map());
  
  // Box selection state (Premiere Pro marquee selection)
  const [isBoxSelecting, setIsBoxSelecting] = useState(false);
  const [boxStart, setBoxStart] = useState<{ x: number; time: number } | null>(null);
  const [boxEnd, setBoxEnd] = useState<{ x: number; time: number } | null>(null);
  
  const {
    addKeyframe,
    deleteKeyframe,
    updateKeyframe,
    togglePropertyAnimation,
    setKeyframeInterpolation,
    setCurrentTime: setGlobalTime,
    updateClip,
  } = useVideoEditorActions();
  
  const isEnabled = propertyKeyframes?.enabled ?? false;
  const keyframes = propertyKeyframes?.keyframes ?? [];
  const hasKeyframes = keyframes.length > 0;
  const isAnimated = isEnabled && hasKeyframes;
  
  // Check if there's a keyframe at current time
  const keyframeAtCurrentTime = useMemo(() => {
    return keyframes.find(kf => Math.abs(kf.time - currentTime) < 0.02) ?? null;
  }, [keyframes, currentTime]);
  
  // Get current value (interpolated if animated)
  const currentValue = useMemo(() => {
    const staticValue = property.getValue(clip);
    if (!isAnimated) return staticValue;
    const value = getInterpolatedValue(propertyKeyframes, currentTime, staticValue);
    return typeof value === 'number' ? value : staticValue;
  }, [isAnimated, propertyKeyframes, currentTime, property, clip]);
  
  // Get selected keyframe IDs for this property
  const selectedIds = useMemo(() => {
    return selectedKeyframes
      .filter(sk => sk.propertyPath === property.path)
      .map(sk => sk.keyframeId);
  }, [selectedKeyframes, property.path]);
  
  // Convert time to percentage position
  const timeToPercent = useCallback((time: number) => {
    return (time / clip.duration) * 100;
  }, [clip.duration]);
  
  // Convert X position to time
  const xToTime = useCallback((clientX: number): number => {
    if (!trackRef.current) return 0;
    const rect = trackRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return percent * clip.duration;
  }, [clip.duration]);
  
  // Toggle animation for this property
  const handleToggleAnimation = useCallback(() => {
    const staticValue = property.getValue(clip);
    togglePropertyAnimation(clip.id, property.path, staticValue);
  }, [clip, property, togglePropertyAnimation]);
  
  // Add keyframe at current time
  const handleAddKeyframe = useCallback(() => {
    addKeyframe(clip.id, property.path, currentTime, currentValue);
  }, [clip.id, property.path, currentTime, currentValue, addKeyframe]);
  
  // Delete keyframe at current time
  const handleDeleteCurrentKeyframe = useCallback(() => {
    if (keyframeAtCurrentTime) {
      deleteKeyframe(clip.id, property.path, keyframeAtCurrentTime.id);
    }
  }, [clip.id, property.path, keyframeAtCurrentTime, deleteKeyframe]);
  
  // Get editor context for video seeking
  const { playerRef, fps } = useEditorContext();
  
  // Helper to seek video player and update store
  const seekToTime = useCallback((globalTime: number) => {
    // Update store
    setGlobalTime(globalTime);
    
    // Also directly seek the player for immediate feedback
    if (playerRef?.current) {
      const frame = Math.round(globalTime * (fps || 30));
      playerRef.current.seekTo(frame);
    }
  }, [setGlobalTime, playerRef, fps]);
  
  // Navigate to previous keyframe
  const handlePrevKeyframe = useCallback(() => {
    // Use a small threshold to find keyframes before current position
    const threshold = 0.03; // 30ms threshold
    const adjustedTime = currentTime - threshold;
    const prevTime = getNearestKeyframeTime(propertyKeyframes, adjustedTime, 'before');
    
    // Also check if we're past the first keyframe but haven't reached before-threshold
    const firstKeyframe = keyframes.length > 0 ? keyframes.reduce((min, kf) => kf.time < min.time ? kf : min, keyframes[0]) : null;
    
    if (prevTime !== null) {
      seekToTime(clip.startTime + prevTime);
    } else if (firstKeyframe && currentTime > firstKeyframe.time + threshold) {
      // Jump to first keyframe if we're past it
      seekToTime(clip.startTime + firstKeyframe.time);
    }
  }, [propertyKeyframes, currentTime, clip.startTime, seekToTime, keyframes]);
  
  // Navigate to next keyframe  
  const handleNextKeyframe = useCallback(() => {
    // Use a small threshold to find keyframes after current position
    const threshold = 0.03; // 30ms threshold
    const adjustedTime = currentTime + threshold;
    const nextTime = getNearestKeyframeTime(propertyKeyframes, adjustedTime, 'after');
    
    if (nextTime !== null) {
      seekToTime(clip.startTime + nextTime);
    }
  }, [propertyKeyframes, currentTime, clip.startTime, seekToTime]);
  
  // Get selected keyframes for THIS property
  const selectedKeyframesForProperty = useMemo(() => {
    return selectedKeyframes.filter(sk => sk.propertyPath === property.path);
  }, [selectedKeyframes, property.path]);
  
  // Handle value change (from ScrubNumberInput or direct input)
  // PREMIERE PRO BEHAVIOR: If a keyframe is selected, update that keyframe's value.
  // Otherwise, update/create keyframe at current time.
  const handleValueChange = useCallback((newValue: number) => {
    if (isNaN(newValue)) return;
    
    // If there are selected keyframes for this property, update them instead
    if (selectedKeyframesForProperty.length > 0) {
      selectedKeyframesForProperty.forEach(sk => {
        updateKeyframe(clip.id, property.path, sk.keyframeId, { value: newValue });
      });
      return;
    }
    
    if (isAnimated && keyframeAtCurrentTime) {
      // Update existing keyframe at current time
      updateKeyframe(clip.id, property.path, keyframeAtCurrentTime.id, { value: newValue });
    } else if (isAnimated) {
      // Add new keyframe at current time
      addKeyframe(clip.id, property.path, currentTime, newValue);
    } else {
      // Update clip property directly (no animation)
      const updates: Partial<TimelineClip> = {};
      if (property.path === 'transform.x') {
        updates.transform = { ...clip.transform, x: newValue };
      } else if (property.path === 'transform.y') {
        updates.transform = { ...clip.transform, y: newValue };
      } else if (property.path === 'transform.rotation') {
        updates.transform = { ...clip.transform, rotation: newValue };
      } else if (property.path === 'transform.scale') {
        updates.transform = { ...clip.transform, scale: newValue } as any;
      } else if (property.path === 'transform.opacity') {
        updates.styles = { ...clip.styles, opacity: newValue };
      }
      updateClip(clip.id, updates);
    }
  }, [isAnimated, keyframeAtCurrentTime, clip, property, updateKeyframe, addKeyframe, updateClip, currentTime, selectedKeyframesForProperty]);
  
  // Handle track mouse down (start box selection or move playhead)
  const handleTrackMouseDown = useCallback((e: React.MouseEvent) => {
    if (isDragging) return;
    if (!trackRef.current) return;
    
    const rect = trackRef.current.getBoundingClientRect();
    const time = xToTime(e.clientX);
    const xPos = e.clientX - rect.left;
    
    if (e.altKey && isAnimated) {
      // Alt+click adds keyframe at clicked position
      const value = getInterpolatedValue(propertyKeyframes, time, property.getValue(clip));
      addKeyframe(clip.id, property.path, time, typeof value === 'number' ? value : property.getValue(clip));
      return;
    }
    
    // Start box selection
    setIsBoxSelecting(true);
    setBoxStart({ x: xPos, time });
    setBoxEnd({ x: xPos, time });
    
    if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
      // Clear selection if not holding modifier
      onClearSelection();
    }
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!trackRef.current) return;
      const moveRect = trackRef.current.getBoundingClientRect();
      const moveTime = xToTime(moveEvent.clientX);
      const moveX = moveEvent.clientX - moveRect.left;
      setBoxEnd({ x: moveX, time: moveTime });
    };
    
    const handleMouseUp = (upEvent: MouseEvent) => {
      setIsBoxSelecting(false);
      
      // Calculate box bounds
      if (boxStart && trackRef.current) {
        const endRect = trackRef.current.getBoundingClientRect();
        const endTime = xToTime(upEvent.clientX);
        const endX = upEvent.clientX - endRect.left;
        
        const minTime = Math.min(boxStart.time, endTime);
        const maxTime = Math.max(boxStart.time, endTime);
        const minX = Math.min(boxStart.x, endX);
        const maxX = Math.max(boxStart.x, endX);
        
        // If dragged at least 5px, select keyframes in range
        if (maxX - minX > 5) {
          const keyframesInRange = keyframes.filter(kf => 
            kf.time >= minTime && kf.time <= maxTime
          );
          
          if (keyframesInRange.length > 0) {
            const addToSelection = upEvent.shiftKey || upEvent.ctrlKey || upEvent.metaKey;
            keyframesInRange.forEach((kf, index) => {
              onSelectKeyframe(kf.id, property.path, addToSelection || index > 0, false);
            });
          }
        } else {
          // Small click - just move playhead
          setGlobalTime(clip.startTime + endTime);
        }
      }
      
      setBoxStart(null);
      setBoxEnd(null);
      
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [isDragging, xToTime, isAnimated, propertyKeyframes, clip, property, addKeyframe, setGlobalTime, onClearSelection, keyframes, onSelectKeyframe, boxStart]);
  
  // Calculate box selection visual bounds
  const boxSelectionStyle = useMemo(() => {
    if (!isBoxSelecting || !boxStart || !boxEnd || !trackRef.current) return null;
    
    const rect = trackRef.current.getBoundingClientRect();
    const minX = Math.min(boxStart.x, boxEnd.x);
    const maxX = Math.max(boxStart.x, boxEnd.x);
    const width = maxX - minX;
    
    if (width < 2) return null;
    
    return {
      left: `${minX}px`,
      width: `${width}px`,
    };
  }, [isBoxSelecting, boxStart, boxEnd]);
  
  // Handle keyframe mouse down (start drag or select)
  const handleKeyframeMouseDown = useCallback((e: React.MouseEvent, kf: Keyframe) => {
    e.stopPropagation();
    e.preventDefault();
    
    const isSelected = selectedIds.includes(kf.id);
    const addToSelection = e.shiftKey || e.ctrlKey || e.metaKey;
    const rangeSelect = e.shiftKey && !e.ctrlKey && !e.metaKey;
    
    // Handle selection
    if (!isSelected && !addToSelection) {
      // Not selected and not adding to selection - select only this one
      onClearSelection();
      onSelectKeyframe(kf.id, property.path, false, false);
    } else if (!isSelected && addToSelection) {
      // Not selected but adding - add to selection
      onSelectKeyframe(kf.id, property.path, true, rangeSelect);
    }
    // If already selected, don't change selection (allow dragging)
    
    // Start drag
    const dragIds = isSelected ? selectedIds : [kf.id];
    const startTimes = new Map<string, number>();
    keyframes.forEach(keyframe => {
      if (dragIds.includes(keyframe.id)) {
        startTimes.set(keyframe.id, keyframe.time);
      }
    });
    
    setIsDragging(true);
    setDragStartX(e.clientX);
    setDraggedKeyframeIds(dragIds);
    setDragStartTimes(startTimes);
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!trackRef.current) return;
      
      const rect = trackRef.current.getBoundingClientRect();
      const deltaX = moveEvent.clientX - e.clientX;
      const deltaPercent = deltaX / rect.width;
      const deltaTime = deltaPercent * clip.duration;
      
      // Move all dragged keyframes
      startTimes.forEach((startTime, keyframeId) => {
        const newTime = Math.max(0, Math.min(clip.duration, startTime + deltaTime));
        updateKeyframe(clip.id, property.path, keyframeId, { time: newTime });
      });
    };
    
    const handleMouseUp = () => {
      setIsDragging(false);
      setDraggedKeyframeIds([]);
      setDragStartTimes(new Map());
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [selectedIds, property.path, onSelectKeyframe, onClearSelection, keyframes, clip, updateKeyframe]);
  
  // Handle interpolation change
  const handleSetInterpolation = useCallback((keyframeId: string, type: string) => {
    setKeyframeInterpolation(clip.id, property.path, keyframeId, { type: type as any });
  }, [clip.id, property.path, setKeyframeInterpolation]);
  
  // Delete selected keyframes
  const handleDeleteSelected = useCallback(() => {
    selectedIds.forEach(id => {
      deleteKeyframe(clip.id, property.path, id);
    });
    onClearSelection();
  }, [selectedIds, clip.id, property.path, deleteKeyframe, onClearSelection]);
  
  // Calculate whether we can navigate (using threshold for better UX)
  const threshold = 0.03;
  const canGoPrev = useMemo(() => {
    if (!keyframes.length) return false;
    const firstKf = keyframes.reduce((min, kf) => kf.time < min.time ? kf : min, keyframes[0]);
    return currentTime > firstKf.time + threshold;
  }, [keyframes, currentTime]);
  
  const canGoNext = useMemo(() => {
    if (!keyframes.length) return false;
    const lastKf = keyframes.reduce((max, kf) => kf.time > max.time ? kf : max, keyframes[0]);
    return currentTime < lastKf.time - threshold;
  }, [keyframes, currentTime]);
  
  return (
    <div className="flex flex-col border-b border-border last:border-b-0">
      {/* Property row - single-row layout */}
      {/* Layout: [⏱] PropertyName [◄][◆][►] -------- [value] */}
      <div className="flex items-center h-9 bg-background hover:bg-muted/30 transition-colors">
        {/* Stopwatch toggle - left aligned, tight to edge */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleToggleAnimation}
              className={cn(
                "w-8 h-full flex items-center justify-center transition-colors flex-shrink-0 border-r border-border",
                isEnabled 
                  ? "bg-primary/20 hover:bg-primary/30 text-primary" 
                  : "hover:bg-muted text-muted-foreground"
              )}
            >
              <Clock className="w-3.5 h-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <p className="font-medium">{isEnabled ? 'Disable Animation' : 'Enable Animation'}</p>
            <p className="text-muted-foreground text-xs mt-1">
              {isEnabled 
                ? 'Click to disable keyframe animation' 
                : 'Click to enable keyframe animation'}
            </p>
          </TooltipContent>
        </Tooltip>
        
        {/* Property name */}
        <span 
          className={cn(
            "px-3 text-sm whitespace-nowrap min-w-[100px]",
            isAnimated ? "text-primary font-medium" : "text-muted-foreground"
          )}
        >
          {property.name}
        </span>
        
        {/* Keyframe navigation: ◄ ◆ ► */}
        <div className="flex items-center h-full border-l border-r border-border">
          {/* Previous keyframe */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handlePrevKeyframe}
                disabled={!isAnimated || !canGoPrev}
                className={cn(
                  "w-7 h-full flex items-center justify-center transition-colors",
                  isAnimated && canGoPrev 
                    ? "text-muted-foreground hover:text-foreground hover:bg-muted/50" 
                    : "text-muted-foreground/30 cursor-not-allowed"
                )}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Previous Keyframe</TooltipContent>
          </Tooltip>
          
          {/* Add/Delete keyframe diamond */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={isAnimated ? (keyframeAtCurrentTime ? handleDeleteCurrentKeyframe : handleAddKeyframe) : undefined}
                disabled={!isAnimated}
                className={cn(
                  "w-7 h-full flex items-center justify-center transition-colors",
                  !isAnimated && "cursor-not-allowed",
                  isAnimated && keyframeAtCurrentTime && "hover:bg-destructive/20",
                  isAnimated && !keyframeAtCurrentTime && "hover:bg-muted/50"
                )}
              >
                <Diamond 
                  className="w-3 h-3" 
                  fill={isAnimated && keyframeAtCurrentTime ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  strokeWidth={1.5}
                  style={{
                    color: isAnimated && keyframeAtCurrentTime ? 'hsl(var(--primary))' : isAnimated ? 'hsl(var(--muted-foreground))' : 'hsl(var(--muted-foreground) / 0.3)'
                  }}
                />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {!isAnimated ? 'Enable animation first' : keyframeAtCurrentTime ? 'Delete Keyframe' : 'Add Keyframe'}
            </TooltipContent>
          </Tooltip>
          
          {/* Next keyframe */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleNextKeyframe}
                disabled={!isAnimated || !canGoNext}
                className={cn(
                  "w-7 h-full flex items-center justify-center transition-colors",
                  isAnimated && canGoNext 
                    ? "text-muted-foreground hover:text-foreground hover:bg-muted/50" 
                    : "text-muted-foreground/30 cursor-not-allowed"
                )}
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Next Keyframe</TooltipContent>
          </Tooltip>
        </div>
        
        {/* Spacer */}
        <div className="flex-1" />
        
        {/* Value input - right aligned */}
        {/* Shows visual indicator when selected keyframes will be modified */}
        <div className={cn(
          "flex items-center h-full px-3 border-l border-border",
          selectedKeyframesForProperty.length > 0 && "bg-amber-500/10 ring-1 ring-inset ring-amber-500/30"
        )}>
          <ScrubNumberInput
            value={currentValue}
            onChange={handleValueChange}
            step={property.step ?? 1}
            min={property.min}
            max={property.max}
            unit={property.unit}
            color={selectedKeyframesForProperty.length > 0 ? 'hsl(38 92% 50%)' : isAnimated ? 'hsl(var(--primary))' : undefined}
            isKeyframed={!!keyframeAtCurrentTime || selectedKeyframesForProperty.length > 0}
          />
          {/* Indicator when editing selected keyframe */}
          {selectedKeyframesForProperty.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="ml-1.5 text-[10px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium whitespace-nowrap">
                  KF
                </span>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-xs">
                <p className="font-medium">Editing Selected Keyframe</p>
                <p className="text-muted-foreground text-xs mt-1">
                  Changes will update the selected keyframe's value, not create new keyframes.
                </p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
      
      {/* Keyframe track - timeline below the property row */}
      {isAnimated && (
        <div 
          ref={trackRef}
          className="h-6 bg-muted/20 relative cursor-crosshair border-t border-border select-none"
          onMouseDown={handleTrackMouseDown}
        >
          {/* Track center line */}
          <div className="absolute top-1/2 left-0 right-0 h-px bg-border" />
          
          {/* Box selection overlay (Premiere Pro marquee) */}
          {boxSelectionStyle && (
            <div 
              className="absolute top-0 bottom-0 bg-primary/20 border border-primary/50 pointer-events-none z-30"
              style={boxSelectionStyle}
            />
          )}
          
          {/* Keyframe diamonds with easing indicators */}
          {keyframes.map((kf) => {
            const isSelected = selectedIds.includes(kf.id);
            const isAtPlayhead = keyframeAtCurrentTime?.id === kf.id;
            const isDragged = draggedKeyframeIds.includes(kf.id);
            const kfStyle = getKeyframeStyle(kf.interpolation);
            const easingLabel = INTERPOLATION_OPTIONS.find(opt => opt.value === kf.interpolation?.type)?.label || 'Linear';
            
            return (
              <ContextMenu key={kf.id}>
                <Tooltip delayDuration={300}>
                <ContextMenuTrigger asChild>
                    <TooltipTrigger asChild>
                  <div
                    className={cn(
                          "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 cursor-move group",
                      isDragged && "scale-125",
                      isSelected && "scale-110"
                    )}
                    style={{ left: `${timeToPercent(kf.time)}%` }}
                    onMouseDown={(e) => handleKeyframeMouseDown(e, kf)}
                    onClick={(e) => {
                      // CRITICAL: Stop click from bubbling to track (which would clear selection)
                      e.stopPropagation();
                    }}
                  >
                        {/* Keyframe shape - varies based on easing type */}
                    <div
                      className={cn(
                            "w-2.5 h-2.5 transition-all",
                            kfStyle.shape === 'diamond' && "rotate-45",
                            kfStyle.shape === 'circle' && "rounded-full",
                            kfStyle.shape === 'square' && "rounded-[1px]",
                            isSelected && "ring-2 ring-white/50 ring-offset-1 ring-offset-transparent",
                            isAtPlayhead && "scale-125 shadow-lg",
                            !isSelected && !isAtPlayhead && "group-hover:scale-110"
                          )}
                          style={{ 
                            backgroundColor: kfStyle.color,
                            boxShadow: isAtPlayhead ? `0 0 8px ${kfStyle.color}` : undefined,
                          }}
                        />
                        {/* Easing curve indicator line (shows on hover for non-linear) */}
                        {kfStyle.showCurveIndicator && (
                          <div 
                            className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-3 h-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ backgroundColor: kfStyle.color }}
                    />
                        )}
                  </div>
                    </TooltipTrigger>
                </ContextMenuTrigger>
                  <TooltipContent side="top" className="flex items-center gap-2 px-2 py-1">
                    <EasingCurvePreview type={kf.interpolation?.type || 'linear'} size={16} color={kfStyle.color} />
                    <span className="text-xs font-medium">{easingLabel}</span>
                    <span className="text-xs text-muted-foreground">@ {formatTimeShort(kf.time)}</span>
                  </TooltipContent>
                </Tooltip>
                
                <ContextMenuContent className="w-52">
                  <ContextMenuItem 
                    onClick={() => deleteKeyframe(clip.id, property.path, kf.id)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Keyframe
                  </ContextMenuItem>
                  {selectedIds.length > 1 && (
                    <ContextMenuItem 
                      onClick={handleDeleteSelected}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Selected ({selectedIds.length})
                    </ContextMenuItem>
                  )}
                  <ContextMenuSeparator />
                  <ContextMenuSub>
                    <ContextMenuSubTrigger className="flex items-center gap-2">
                      <EasingCurvePreview 
                        type={kf.interpolation?.type || 'linear'} 
                        size={16} 
                        color={INTERPOLATION_OPTIONS.find(o => o.value === kf.interpolation?.type)?.curveColor || '#9CA3AF'} 
                      />
                      <span>Easing: {INTERPOLATION_OPTIONS.find(o => o.value === kf.interpolation?.type)?.label || 'Linear'}</span>
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent className="w-64 max-h-[400px] overflow-y-auto sidepanel-scrollbar">
                      {(['basic', 'smooth', 'dramatic', 'bounce', 'special'] as const).map((category, catIdx) => {
                        const categoryOpts = INTERPOLATION_OPTIONS.filter(o => o.category === category);
                        const catConfig = INTERPOLATION_CATEGORIES[category];
                        return (
                          <Fragment key={category}>
                            {catIdx > 0 && <ContextMenuSeparator />}
                            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: catConfig.color }}>
                              {catConfig.label}
                            </div>
                            {categoryOpts.map(opt => (
                        <ContextMenuItem 
                          key={opt.value}
                          onClick={() => handleSetInterpolation(kf.id, opt.value)}
                          className={cn(
                                  "flex items-center gap-2.5 py-1.5",
                                  kf.interpolation?.type === opt.value && "bg-primary/20"
                          )}
                        >
                                <EasingCurvePreview type={opt.value} size={22} color={opt.curveColor} showBg />
                                <div className="flex flex-col gap-0 flex-1 min-w-0">
                                  <span className="text-xs font-medium truncate">{opt.label}</span>
                                  <span className="text-[9px] text-muted-foreground truncate">{opt.description}</span>
                          </div>
                                {kf.interpolation?.type === opt.value && (
                                  <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                                )}
                        </ContextMenuItem>
                      ))}
                          </Fragment>
                        );
                      })}
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                </ContextMenuContent>
              </ContextMenu>
            );
          })}
          
          {/* Playhead line */}
          <div 
            className="absolute top-0 bottom-0 w-0.5 bg-primary z-20 pointer-events-none"
            style={{ left: `${timeToPercent(currentTime)}%` }}
          />
        </div>
      )}
    </div>
  );
}, arePropertyRowPropsEqual);

// Set display name for debugging
PropertyRow.displayName = 'PropertyRow';

// ==========================================
// MAIN COMPONENT
// ==========================================

export const KeyframesSection: React.FC<KeyframesSectionProps> = ({
  clip,
  currentTime,
}) => {
  const [selectedKeyframes, setSelectedKeyframes] = useState<SelectedKeyframe[]>([]);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [isCurveEditorOpen, setIsCurveEditorOpen] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const fps = useVideoEditorStore(selectFps);
  const keyframeClipboard = useVideoEditorStore(selectKeyframeClipboard);
  const { 
    setCurrentTime, 
    setKeyframeInterpolation,
    selectKeyframes: storeSelectKeyframes,
    clearKeyframeSelection,
    copyKeyframes,
    pasteKeyframes,
    deleteKeyframe,
    updateKeyframe,
  } = useVideoEditorActions();
  
  if (!clip) return null;
  
  // Calculate time relative to clip start
  const relativeTime = useMemo(() => {
    return Math.max(0, Math.min(clip.duration, currentTime - clip.startTime));
  }, [currentTime, clip.startTime, clip.duration]);
  
  // Get keyframes for each property
  const getPropertyKeyframes = useCallback((path: string): PropertyKeyframes | null => {
    return clip.keyframes?.find(pk => pk.propertyPath === path) ?? null;
  }, [clip.keyframes]);
  
  // Count animated properties
  const animatedCount = useMemo(() => {
    return clip.keyframes?.filter(pk => pk.enabled && pk.keyframes.length > 0).length ?? 0;
  }, [clip.keyframes]);
  
  // Total keyframe count
  const totalKeyframeCount = useMemo(() => {
    return clip.keyframes?.reduce((sum, pk) => sum + pk.keyframes.length, 0) ?? 0;
  }, [clip.keyframes]);
  
  // Handle keyframe selection - also moves playhead to selected keyframe (like Premiere Pro)
  const handleSelectKeyframe = useCallback((
    keyframeId: string, 
    propertyPath: string, 
    addToSelection: boolean,
    rangeSelect: boolean
  ) => {
    const pkf = getPropertyKeyframes(propertyPath);
    if (!pkf) return;
    
    // Find the keyframe being selected to get its time
    const selectedKf = pkf.keyframes.find(kf => kf.id === keyframeId);
    
    if (rangeSelect) {
      // Range selection: select all keyframes between last selected and this one
      if (pkf && selectedKeyframes.length > 0) {
        const lastSelected = selectedKeyframes[selectedKeyframes.length - 1];
        if (lastSelected.propertyPath === propertyPath) {
          const lastKf = pkf.keyframes.find(kf => kf.id === lastSelected.keyframeId);
          const thisKf = pkf.keyframes.find(kf => kf.id === keyframeId);
          if (lastKf && thisKf) {
            const minTime = Math.min(lastKf.time, thisKf.time);
            const maxTime = Math.max(lastKf.time, thisKf.time);
            const inRange = pkf.keyframes.filter(kf => kf.time >= minTime && kf.time <= maxTime);
            const newSelected = inRange.map(kf => ({ keyframeId: kf.id, propertyPath }));
            setSelectedKeyframes(prev => {
              const existing = prev.filter(sk => sk.propertyPath !== propertyPath);
              return [...existing, ...newSelected];
            });
            // Sync to store
            storeSelectKeyframes(clip.id, propertyPath, inRange.map(kf => kf.id));
            return;
          }
        }
      }
    }
    
    let newSelection: SelectedKeyframe[];
    
    if (addToSelection) {
      const exists = selectedKeyframes.some(sk => sk.keyframeId === keyframeId);
      if (exists) {
        // Toggle off
        newSelection = selectedKeyframes.filter(sk => sk.keyframeId !== keyframeId);
      } else {
        // Add to selection
        newSelection = [...selectedKeyframes, { keyframeId, propertyPath }];
      }
    } else {
      newSelection = [{ keyframeId, propertyPath }];
    }
    
    setSelectedKeyframes(newSelection);
    
    // Sync selection to store so video-player can access it
    if (newSelection.length > 0) {
      // Group by property path and select in store
      const byProperty = newSelection.reduce((acc, sk) => {
        if (!acc[sk.propertyPath]) acc[sk.propertyPath] = [];
        acc[sk.propertyPath].push(sk.keyframeId);
        return acc;
      }, {} as Record<string, string[]>);
      
      // Select the first property's keyframes (store only supports one property at a time)
      const firstProp = Object.keys(byProperty)[0];
      storeSelectKeyframes(clip.id, firstProp, byProperty[firstProp]);
    } else {
      clearKeyframeSelection();
    }
    
    // PREMIERE PRO BEHAVIOR: Move playhead to selected keyframe's time
    if (selectedKf && !addToSelection) {
      // Only move playhead on single selection (not when adding to selection)
      setCurrentTime(clip.startTime + selectedKf.time);
    }
  }, [selectedKeyframes, getPropertyKeyframes, clip.id, clip.startTime, setCurrentTime, storeSelectKeyframes, clearKeyframeSelection]);
  
  // Clear selection (both local and store)
  const handleClearSelection = useCallback(() => {
    setSelectedKeyframes([]);
    clearKeyframeSelection();
  }, [clearKeyframeSelection]);
  
  // ===========================================
  // PREMIERE PRO KEYBOARD SHORTCUTS & ACTIONS
  // ===========================================
  
  // Copy selected keyframes (Ctrl+C / Cmd+C)
  const handleCopyKeyframes = useCallback(() => {
    if (selectedKeyframes.length === 0) return;
    
    // Group by property path
    const byProperty = selectedKeyframes.reduce((acc, sk) => {
      if (!acc[sk.propertyPath]) acc[sk.propertyPath] = [];
      acc[sk.propertyPath].push(sk.keyframeId);
      return acc;
    }, {} as Record<string, string[]>);
    
    // Copy first property's keyframes (Premiere Pro behavior)
    const firstProp = Object.keys(byProperty)[0];
    copyKeyframes(clip.id, firstProp, byProperty[firstProp]);
  }, [selectedKeyframes, clip.id, copyKeyframes]);
  
  // Paste keyframes (Ctrl+V / Cmd+V)
  const handlePasteKeyframes = useCallback(() => {
    if (!keyframeClipboard) return;
    
    // Paste at current playhead position, same property as source
    pasteKeyframes(clip.id, keyframeClipboard.sourcePropertyPath, relativeTime);
  }, [clip.id, keyframeClipboard, pasteKeyframes, relativeTime]);
  
  // Delete selected keyframes (Delete/Backspace)
  const handleDeleteSelectedKeyframes = useCallback(() => {
    if (selectedKeyframes.length === 0) return;
    
    selectedKeyframes.forEach(({ keyframeId, propertyPath }) => {
      deleteKeyframe(clip.id, propertyPath, keyframeId);
    });
    
    setSelectedKeyframes([]);
    clearKeyframeSelection();
  }, [selectedKeyframes, clip.id, deleteKeyframe, clearKeyframeSelection]);
  
  // Easy Ease (F9) - Apply smooth ease-in-out to selected keyframes
  const handleEasyEase = useCallback(() => {
    if (selectedKeyframes.length === 0) return;
    
    selectedKeyframes.forEach(({ keyframeId, propertyPath }) => {
      setKeyframeInterpolation(clip.id, propertyPath, keyframeId, {
        type: 'ease-in-out',
        bezierHandles: EASE_IN_OUT_HANDLES,
      });
    });
  }, [selectedKeyframes, clip.id, setKeyframeInterpolation]);
  
  // Easy Ease In (Shift+F9) - Apply ease-in to selected keyframes
  const handleEasyEaseIn = useCallback(() => {
    if (selectedKeyframes.length === 0) return;
    
    selectedKeyframes.forEach(({ keyframeId, propertyPath }) => {
      setKeyframeInterpolation(clip.id, propertyPath, keyframeId, {
        type: 'ease-in',
      });
    });
  }, [selectedKeyframes, clip.id, setKeyframeInterpolation]);
  
  // Easy Ease Out (Ctrl+Shift+F9) - Apply ease-out to selected keyframes
  const handleEasyEaseOut = useCallback(() => {
    if (selectedKeyframes.length === 0) return;
    
    selectedKeyframes.forEach(({ keyframeId, propertyPath }) => {
      setKeyframeInterpolation(clip.id, propertyPath, keyframeId, {
        type: 'ease-out',
      });
    });
  }, [selectedKeyframes, clip.id, setKeyframeInterpolation]);
  
  // Toggle Hold interpolation (Ctrl+Alt+H)
  const handleToggleHold = useCallback(() => {
    if (selectedKeyframes.length === 0) return;
    
    selectedKeyframes.forEach(({ keyframeId, propertyPath }) => {
      setKeyframeInterpolation(clip.id, propertyPath, keyframeId, {
        type: 'hold',
      });
    });
  }, [selectedKeyframes, clip.id, setKeyframeInterpolation]);
  
  // Linear interpolation (Ctrl+L)
  const handleLinear = useCallback(() => {
    if (selectedKeyframes.length === 0) return;
    
    selectedKeyframes.forEach(({ keyframeId, propertyPath }) => {
      setKeyframeInterpolation(clip.id, propertyPath, keyframeId, {
        type: 'linear',
      });
    });
  }, [selectedKeyframes, clip.id, setKeyframeInterpolation]);
  
  // Auto-Bezier / Continuous Bezier - Automatically smooth keyframe handles
  const handleAutoBezier = useCallback(() => {
    if (selectedKeyframes.length === 0) return;
    
    // Group keyframes by property to calculate smooth handles
    const byProperty = selectedKeyframes.reduce((acc, sk) => {
      if (!acc[sk.propertyPath]) acc[sk.propertyPath] = [];
      acc[sk.propertyPath].push(sk.keyframeId);
      return acc;
    }, {} as Record<string, string[]>);
    
    Object.entries(byProperty).forEach(([propertyPath, keyframeIds]) => {
      const pkf = getPropertyKeyframes(propertyPath);
      if (!pkf) return;
      
      const sortedKeyframes = [...pkf.keyframes].sort((a, b) => a.time - b.time);
      
      keyframeIds.forEach(keyframeId => {
        const kfIndex = sortedKeyframes.findIndex(kf => kf.id === keyframeId);
        if (kfIndex === -1) return;
        
        const kf = sortedKeyframes[kfIndex];
        const prevKf = kfIndex > 0 ? sortedKeyframes[kfIndex - 1] : null;
        const nextKf = kfIndex < sortedKeyframes.length - 1 ? sortedKeyframes[kfIndex + 1] : null;
        
        // Calculate automatic bezier handles based on surrounding keyframes
        // This creates a continuous/smooth curve through the keyframe
        let inX = 0.33, inY = 0.33, outX = 0.67, outY = 0.67;
        
        if (prevKf && nextKf) {
          // Middle keyframe - calculate slope from prev to next for continuity
          const prevValue = typeof prevKf.value === 'number' ? prevKf.value : 0;
          const currValue = typeof kf.value === 'number' ? kf.value : 0;
          const nextValue = typeof nextKf.value === 'number' ? nextKf.value : 0;
          
          const totalTimeSpan = nextKf.time - prevKf.time;
          const inTimeSpan = kf.time - prevKf.time;
          const outTimeSpan = nextKf.time - kf.time;
          
          // Smooth tangent: average of incoming and outgoing slopes
          const inSlope = (currValue - prevValue) / inTimeSpan;
          const outSlope = (nextValue - currValue) / outTimeSpan;
          const avgSlope = (inSlope + outSlope) / 2;
          
          // Convert slope to bezier handle positions (normalized)
          const handleLength = 0.33; // Standard handle length
          
          inX = 1 - handleLength;
          inY = 1 - handleLength;
          outX = handleLength;
          outY = handleLength;
          
          // Adjust Y based on relative slopes
          if (Math.abs(avgSlope) > 0.001) {
            const valueRange = Math.max(Math.abs(currValue - prevValue), Math.abs(nextValue - currValue));
            if (valueRange > 0) {
              const normalizedSlope = avgSlope * (kf.time - prevKf.time) / valueRange;
              inY = Math.max(0, Math.min(1, 0.5 + normalizedSlope * 0.3));
              outY = Math.max(0, Math.min(1, 0.5 + normalizedSlope * 0.3));
            }
          }
        }
        
        setKeyframeInterpolation(clip.id, propertyPath, keyframeId, {
          type: 'bezier',
          bezierHandles: {
            in: { x: inX, y: inY },
            out: { x: outX, y: outY },
          },
        });
      });
    });
  }, [selectedKeyframes, clip.id, getPropertyKeyframes, setKeyframeInterpolation]);
  
  // Align keyframes to first selected keyframe's time
  const handleAlignKeyframesToFirst = useCallback(() => {
    if (selectedKeyframes.length < 2) return;
    
    const firstKf = selectedKeyframes[0];
    const pkf = getPropertyKeyframes(firstKf.propertyPath);
    if (!pkf) return;
    
    const firstKeyframe = pkf.keyframes.find(kf => kf.id === firstKf.keyframeId);
    if (!firstKeyframe) return;
    
    const targetTime = firstKeyframe.time;
    
    selectedKeyframes.slice(1).forEach(({ keyframeId, propertyPath }) => {
      updateKeyframe(clip.id, propertyPath, keyframeId, { time: targetTime });
    });
  }, [selectedKeyframes, clip.id, getPropertyKeyframes, updateKeyframe]);
  
  // Align keyframes to last selected keyframe's time
  const handleAlignKeyframesToLast = useCallback(() => {
    if (selectedKeyframes.length < 2) return;
    
    const lastKf = selectedKeyframes[selectedKeyframes.length - 1];
    const pkf = getPropertyKeyframes(lastKf.propertyPath);
    if (!pkf) return;
    
    const lastKeyframe = pkf.keyframes.find(kf => kf.id === lastKf.keyframeId);
    if (!lastKeyframe) return;
    
    const targetTime = lastKeyframe.time;
    
    selectedKeyframes.slice(0, -1).forEach(({ keyframeId, propertyPath }) => {
      updateKeyframe(clip.id, propertyPath, keyframeId, { time: targetTime });
    });
  }, [selectedKeyframes, clip.id, getPropertyKeyframes, updateKeyframe]);
  
  // Distribute keyframes evenly in time
  const handleDistributeKeyframes = useCallback(() => {
    if (selectedKeyframes.length < 3) return;
    
    // Get all selected keyframes with their times
    const keyframesWithTimes: { keyframeId: string; propertyPath: string; time: number }[] = [];
    
    selectedKeyframes.forEach(({ keyframeId, propertyPath }) => {
      const pkf = getPropertyKeyframes(propertyPath);
      if (!pkf) return;
      
      const kf = pkf.keyframes.find(k => k.id === keyframeId);
      if (kf) {
        keyframesWithTimes.push({ keyframeId, propertyPath, time: kf.time });
      }
    });
    
    if (keyframesWithTimes.length < 3) return;
    
    // Sort by time
    keyframesWithTimes.sort((a, b) => a.time - b.time);
    
    const firstTime = keyframesWithTimes[0].time;
    const lastTime = keyframesWithTimes[keyframesWithTimes.length - 1].time;
    const spacing = (lastTime - firstTime) / (keyframesWithTimes.length - 1);
    
    // Distribute middle keyframes evenly
    keyframesWithTimes.forEach((item, index) => {
      if (index === 0 || index === keyframesWithTimes.length - 1) return; // Keep first and last in place
      
      const newTime = firstTime + spacing * index;
      updateKeyframe(clip.id, item.propertyPath, item.keyframeId, { time: newTime });
    });
  }, [selectedKeyframes, clip.id, getPropertyKeyframes, updateKeyframe]);
  
  // Keyboard event handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;
      
      // F9 - Easy Ease
      if (e.key === 'F9' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        handleEasyEase();
        return;
      }
      
      // Shift+F9 - Easy Ease In
      if (e.key === 'F9' && e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        handleEasyEaseIn();
        return;
      }
      
      // Ctrl+Shift+F9 - Easy Ease Out
      if (e.key === 'F9' && e.shiftKey && ctrlOrCmd) {
        e.preventDefault();
        handleEasyEaseOut();
        return;
      }
      
      // Ctrl+C / Cmd+C - Copy keyframes
      if (e.key === 'c' && ctrlOrCmd && !e.shiftKey && !e.altKey) {
        if (selectedKeyframes.length > 0) {
          e.preventDefault();
          handleCopyKeyframes();
        }
        return;
      }
      
      // Ctrl+V / Cmd+V - Paste keyframes
      if (e.key === 'v' && ctrlOrCmd && !e.shiftKey && !e.altKey) {
        if (keyframeClipboard) {
          e.preventDefault();
          handlePasteKeyframes();
        }
        return;
      }
      
      // Delete / Backspace - Delete selected keyframes
      if ((e.key === 'Delete' || e.key === 'Backspace') && !ctrlOrCmd && !e.shiftKey && !e.altKey) {
        if (selectedKeyframes.length > 0) {
          e.preventDefault();
          handleDeleteSelectedKeyframes();
        }
        return;
      }
      
      // Ctrl+Alt+H - Toggle Hold interpolation
      if (e.key === 'h' && ctrlOrCmd && e.altKey) {
        e.preventDefault();
        handleToggleHold();
        return;
      }
      
      // Ctrl+L - Linear interpolation
      if (e.key === 'l' && ctrlOrCmd && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        handleLinear();
        return;
      }
      
      // Ctrl+Shift+A - Auto-Bezier
      if (e.key === 'a' && ctrlOrCmd && e.shiftKey && !e.altKey) {
        if (selectedKeyframes.length > 0) {
          e.preventDefault();
          handleAutoBezier();
        }
        return;
      }
      
      // Escape - Clear selection
      if (e.key === 'Escape') {
        handleClearSelection();
        return;
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    selectedKeyframes,
    keyframeClipboard,
    handleCopyKeyframes,
    handlePasteKeyframes,
    handleDeleteSelectedKeyframes,
    handleEasyEase,
    handleEasyEaseIn,
    handleEasyEaseOut,
    handleToggleHold,
    handleLinear,
    handleAutoBezier,
    handleClearSelection,
  ]);
  
  // Get the first selected keyframe for the curve editor
  const firstSelectedKeyframe = useMemo(() => {
    if (selectedKeyframes.length === 0) return null;
    
    const { keyframeId, propertyPath } = selectedKeyframes[0];
    const pkf = getPropertyKeyframes(propertyPath);
    if (!pkf) return null;
    
    const kf = pkf.keyframes.find(k => k.id === keyframeId);
    if (!kf) return null;
    
    return {
      keyframe: kf,
      propertyPath,
    };
  }, [selectedKeyframes, getPropertyKeyframes]);
  
  // Handle interpolation change from bezier editor
  const handleInterpolationChange = useCallback((interpolation: KeyframeInterpolation) => {
    // Apply to all selected keyframes
    selectedKeyframes.forEach(({ keyframeId, propertyPath }) => {
      setKeyframeInterpolation(clip.id, propertyPath, keyframeId, interpolation);
    });
  }, [selectedKeyframes, clip.id, setKeyframeInterpolation]);
  
  return (
    <TooltipProvider delayDuration={300}>
      <div ref={containerRef} className="flex flex-col h-full bg-background" tabIndex={-1}>
        {/* Header - fixed */}
        <div className="flex-shrink-0 border-b border-border">
          <div className="flex items-center justify-between px-3 py-2.5 bg-muted/30">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Animation</span>
              {animatedCount > 0 && (
                <span className="text-xs px-2 py-0.5 bg-primary/20 text-primary rounded font-medium">
                  {animatedCount} animated
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono tabular-nums">
              <span>{formatTime(relativeTime)}</span>
              <span className="text-muted-foreground/50">/</span>
              <span>{formatTime(clip.duration)}</span>
            </div>
          </div>
          
          {/* Premiere Pro-style Toolbar - visible when keyframes selected */}
          {selectedKeyframes.length > 0 && (
            <div className="flex items-center gap-1 px-2 py-1.5 bg-muted/20 border-t border-border">
              {/* Interpolation shortcuts */}
              <div className="flex items-center gap-0.5 pr-2 border-r border-border">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleEasyEase}
                      className="flex items-center justify-center w-7 h-7 rounded hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <p className="font-medium">Easy Ease (F9)</p>
                    <p className="text-muted-foreground text-xs mt-1">Apply smooth ease-in-out to selected keyframes</p>
                  </TooltipContent>
                </Tooltip>
                
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleAutoBezier}
                      className="flex items-center justify-center w-7 h-7 rounded hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors"
                    >
                      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M2 14 C6 14, 6 2, 14 2" strokeLinecap="round" />
                        <circle cx="2" cy="14" r="1.5" fill="currentColor" />
                        <circle cx="14" cy="2" r="1.5" fill="currentColor" />
                      </svg>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <p className="font-medium">Auto-Bezier (Ctrl+Shift+A)</p>
                    <p className="text-muted-foreground text-xs mt-1">Automatically smooth keyframe curves for continuity</p>
                  </TooltipContent>
                </Tooltip>
                
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleToggleHold}
                      className="flex items-center justify-center w-7 h-7 rounded hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors"
                    >
                      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M2 14 L2 2 L14 2" strokeLinecap="round" strokeLinejoin="round" />
                        <circle cx="2" cy="14" r="1.5" fill="currentColor" />
                        <circle cx="14" cy="2" r="1.5" fill="currentColor" />
                      </svg>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <p className="font-medium">Hold (Ctrl+Alt+H)</p>
                    <p className="text-muted-foreground text-xs mt-1">No interpolation - jump instantly to next value</p>
                  </TooltipContent>
                </Tooltip>
                
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleLinear}
                      className="flex items-center justify-center w-7 h-7 rounded hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors"
                    >
                      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M2 14 L14 2" strokeLinecap="round" />
                        <circle cx="2" cy="14" r="1.5" fill="currentColor" />
                        <circle cx="14" cy="2" r="1.5" fill="currentColor" />
                      </svg>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <p className="font-medium">Linear (Ctrl+L)</p>
                    <p className="text-muted-foreground text-xs mt-1">Constant rate of change between keyframes</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              
              {/* Alignment tools - only when 2+ keyframes selected */}
              {selectedKeyframes.length >= 2 && (
                <div className="flex items-center gap-0.5 px-2 border-r border-border">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={handleAlignKeyframesToFirst}
                        className="flex items-center justify-center w-7 h-7 rounded hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors"
                      >
                        <AlignLeft className="w-3.5 h-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <p className="font-medium">Align to First</p>
                      <p className="text-muted-foreground text-xs mt-1">Align all to first keyframe's time</p>
                    </TooltipContent>
                  </Tooltip>
                  
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={handleAlignKeyframesToLast}
                        className="flex items-center justify-center w-7 h-7 rounded hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors"
                      >
                        <AlignRight className="w-3.5 h-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <p className="font-medium">Align to Last</p>
                      <p className="text-muted-foreground text-xs mt-1">Align all to last keyframe's time</p>
                    </TooltipContent>
                  </Tooltip>
                  
                  {selectedKeyframes.length >= 3 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={handleDistributeKeyframes}
                          className="flex items-center justify-center w-7 h-7 rounded hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors"
                        >
                          <AlignHorizontalDistributeCenter className="w-3.5 h-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        <p className="font-medium">Distribute Evenly</p>
                        <p className="text-muted-foreground text-xs mt-1">Space keyframes evenly in time</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              )}
              
              {/* Copy/Paste/Delete */}
              <div className="flex items-center gap-0.5 px-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleCopyKeyframes}
                      className="flex items-center justify-center w-7 h-7 rounded hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="font-medium">Copy (Ctrl+C)</p>
                  </TooltipContent>
                </Tooltip>
                
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handlePasteKeyframes}
                      disabled={!keyframeClipboard}
                      className={cn(
                        "flex items-center justify-center w-7 h-7 rounded transition-colors",
                        keyframeClipboard 
                          ? "hover:bg-primary/20 text-muted-foreground hover:text-primary" 
                          : "text-muted-foreground/30 cursor-not-allowed"
                      )}
                    >
                      <Clipboard className="w-3.5 h-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="font-medium">Paste (Ctrl+V)</p>
                    {keyframeClipboard && (
                      <p className="text-muted-foreground text-xs mt-1">
                        {keyframeClipboard.keyframes.length} keyframe(s) in clipboard
                      </p>
                    )}
                  </TooltipContent>
                </Tooltip>
                
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleDeleteSelectedKeyframes}
                      className="flex items-center justify-center w-7 h-7 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="font-medium">Delete (Del)</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              
              {/* Selection count */}
              <div className="ml-auto text-xs text-muted-foreground">
                {selectedKeyframes.length} selected
              </div>
            </div>
          )}
        </div>
        
        {/* Timeline ruler - fixed */}
        <div className="flex-shrink-0">
        <TimelineRuler
          duration={clip.duration}
          currentTime={relativeTime}
          clipStartTime={clip.startTime}
          onScrubStart={() => setIsScrubbing(true)}
          onScrubEnd={() => setIsScrubbing(false)}
        />
        </div>
        
         {/* Main scrollable content - everything scrolls together */}
         <div className="flex-1 overflow-y-auto inspector-scrollbar">
            {/* Transform group header */}
           <div className="flex items-center h-8 bg-muted/20 border-b border-border px-3">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Transform</span>
            </div>
            
          {TRANSFORM_PROPERTIES.map(property => (
              <PropertyRow
                key={property.path}
                clip={clip}
                property={property}
                propertyKeyframes={getPropertyKeyframes(property.path)}
                currentTime={relativeTime}
                selectedKeyframes={selectedKeyframes}
                onSelectKeyframe={handleSelectKeyframe}
                onClearSelection={handleClearSelection}
              />
            ))}
            
          {/* Mask Properties */}
          {clip.masks && clip.masks.length > 0 && clip.masks.map((mask, maskIndex) => {
            const maskProperties = getMaskProperties(mask, maskIndex);
            const MaskIcon = getMaskIcon(mask);
            const maskName = mask.name || `Mask ${maskIndex + 1}`;
            const maskColor = MASK_COLORS[maskIndex % MASK_COLORS.length];
            
            return (
              <Fragment key={mask.id}>
                <div className="flex items-center h-8 bg-muted/20 border-b border-t border-border px-3 gap-2">
                  {React.createElement(MaskIcon, { className: "h-3.5 w-3.5", style: { color: maskColor } })}
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {maskName}
                  </span>
                  {!mask.enabled && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-muted text-muted-foreground rounded">
                      Disabled
                    </span>
                  )}
                </div>
                
                {maskProperties.map(property => (
                  <PropertyRow
                    key={property.path}
                    clip={clip}
                    property={property}
                    propertyKeyframes={getPropertyKeyframes(property.path)}
                    currentTime={relativeTime}
                    selectedKeyframes={selectedKeyframes}
                    onSelectKeyframe={handleSelectKeyframe}
                    onClearSelection={handleClearSelection}
                  />
                ))}
              </Fragment>
            );
          })}
          
          {/* Empty state */}
          {animatedCount === 0 && (!clip.masks || clip.masks.length === 0) && (
              <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                <p className="text-sm text-muted-foreground">Click the stopwatch icon to enable animation</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Then add keyframes to animate properties over time</p>
              </div>
            )}
          
          {/* Masks hint */}
          {clip.masks && clip.masks.length > 0 && animatedCount === 0 && (
            <div className="flex flex-col items-center justify-center py-6 text-center px-4 border-t border-border">
              <p className="text-xs text-muted-foreground">
                <strong>Animate masks:</strong> Use the stopwatch icons above to animate mask properties over time
              </p>
          </div>
          )}
          
          {/* Bezier Curve Editor - inside scroll area */}
          {selectedKeyframes.length > 0 && firstSelectedKeyframe && (
            <div className="border-t border-border mt-2">
              <Collapsible 
                open={isCurveEditorOpen} 
                onOpenChange={setIsCurveEditorOpen}
              >
                <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <ChevronDown 
                      className={cn(
                        "h-4 w-4 text-muted-foreground transition-transform duration-200",
                        !isCurveEditorOpen && "-rotate-90"
                      )} 
                    />
                    <span className="text-xs font-medium">Easing Curve</span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-primary/20 text-primary rounded">
                      {selectedKeyframes.length}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground capitalize">
                    {firstSelectedKeyframe.keyframe.interpolation?.type || 'linear'}
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-150">
                  <div className="p-3">
                    <BezierCurveEditor
                      interpolation={firstSelectedKeyframe.keyframe.interpolation || { type: 'linear' }}
                      onChange={handleInterpolationChange}
                    />
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}
          
          {/* Bottom padding for scrolling */}
          <div className="h-4" />
        </div>
        
        {/* Selection info bar - fixed at bottom */}
        {selectedKeyframes.length > 0 && (
          <div className="flex-shrink-0 px-3 py-2 bg-primary/10 border-t border-border">
            <div className="flex items-center justify-between text-xs">
              <span className="text-primary font-medium">
                {selectedKeyframes.length} keyframe{selectedKeyframes.length > 1 ? 's' : ''} selected
              </span>
              <button
                className="px-2 py-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors text-xs"
                onClick={handleClearSelection}
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
};

export default KeyframesSection;
