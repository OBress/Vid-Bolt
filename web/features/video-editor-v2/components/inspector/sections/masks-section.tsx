/**
 * MasksSection - Mask management for video/image overlays
 * 
 * Styled to match the Properties tab exactly.
 */

import React, { useState, useCallback, useMemo } from "react";
import { Overlay, OverlayType } from "../../../types";
import {
  Mask,
  MaskType,
  ShapeMaskType,
  ShapeMask,
  RectangleMask,
  EllipseMask,
  PolygonMask,
  TrackMatteType,
  FeatherMode,
  MaskCompositeMode,
  SHAPE_MASK_METADATA,
  TRACK_MATTE_METADATA,
  GradientMask,
  GradientMaskType,
  EdgeFeather,
  DEFAULT_EDGE_FEATHER,
  createRectangleMask,
  createEllipseMask,
  createPolygonMask,
  createBezierMask,
  createTrackMatte,
  migrateToEdgeFeather,
} from "../../../types/masks";
import { EdgeFeatherSelector } from "../../ui/edge-feather-selector";
import { MaskAddPanel } from "./mask-add-panel";
import { GradientMaskControls } from "./gradient-mask-controls";
import { useVideoEditorStore } from "../../../stores/video-editor-store";
import { clipToOverlay } from "../../../utils/clip-to-render-adapter";
import type { TimelineClip } from "../../../types/timeline-v2";
import { useEditorContext } from "../../../contexts/editor-context";
import { Button } from "../../ui/button";
import { Slider } from "../../ui/slider";
import { DraggableNumber } from "../../ui/draggable-number";
import { Switch } from "../../ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu";
import {
  Plus,
  Trash2,
  Square,
  Circle,
  Pentagon,
  Layers,
  ChevronDown,
  FlipVertical,
  Move,
  Maximize2,
  RotateCcw,
  Spline,
  Blend,
  Feather,
  Link2,
  Link2Off,
  Eye,
  EyeOff,
  ArrowRight,
  Target,
  Sliders,
} from "lucide-react";
import { cn } from "../../../utils/general/utils";

// ==========================================
// ASPECT RATIO UTILITIES
// ==========================================

/**
 * Calculate the aspect ratio multiplier for creating true circles
 * Returns the factor to multiply radiusY by to get a visual circle
 */
function getAspectRatioMultiplier(aspectRatio: string): number {
  const ratios: Record<string, number> = {
    '16:9': 16/9,
    '9:16': 9/16,
    '1:1': 1,
    '4:5': 4/5,
    '4:3': 4/3,
    '21:9': 21/9,
  };
  return ratios[aspectRatio] || 16/9;
}

// ==========================================
// TYPES
// ==========================================

interface MasksSectionProps {
  overlay: Overlay;
  onUpdate: (updates: Partial<Overlay>) => void;
}

// Extended overlay type with masks
interface OverlayWithMasks {
  masks?: Mask[];
  [key: string]: any;
}

// ==========================================
// ICON MAPPING
// ==========================================

const SHAPE_ICONS: Record<ShapeMaskType, React.ElementType> = {
  [ShapeMaskType.RECTANGLE]: Square,
  [ShapeMaskType.ELLIPSE]: Circle,
  [ShapeMaskType.POLYGON]: Pentagon,
};

// ==========================================
// SECTION HEADER COMPONENT (matches Properties tab)
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
// MASK ITEM COMPONENT
// ==========================================

interface MaskItemProps {
  mask: Mask;
  overlays: Overlay[];
  onUpdate: (updates: Partial<Mask>) => void;
  onRemove: () => void;
  onExpand: () => void;
  isExpanded: boolean;
  aspectRatio: number;
}

// Icon mapping for gradient masks
const GRADIENT_ICONS: Record<GradientMaskType, React.ElementType> = {
  [GradientMaskType.LINEAR]: ArrowRight,
  [GradientMaskType.RADIAL]: Target,
  [GradientMaskType.ANGULAR]: RotateCcw,
  [GradientMaskType.MULTI_STOP]: Sliders,
};

const MaskItem: React.FC<MaskItemProps> = ({
  mask,
  overlays,
  onUpdate,
  onRemove,
  onExpand,
  isExpanded,
  aspectRatio,
}) => {
  const isShapeMask = mask.type === MaskType.SHAPE;
  const isGradientMask = mask.type === MaskType.GRADIENT;
  const shapeMask = isShapeMask ? mask as ShapeMask : null;
  const gradientMask = isGradientMask ? mask as GradientMask : null;
  
  // Determine icon based on mask type
  let Icon: React.ElementType = Layers;
  if (isShapeMask) {
    Icon = SHAPE_ICONS[(mask as any).shapeType] || Square;
  } else if (isGradientMask) {
    Icon = GRADIENT_ICONS[(mask as GradientMask).gradientType] || Blend;
  }
  
  // Determine name based on mask type
  let name = 'Track Matte';
  if (isShapeMask) {
    name = SHAPE_MASK_METADATA[(mask as any).shapeType]?.name || 'Shape Mask';
  } else if (isGradientMask) {
    const gradientType = (mask as GradientMask).gradientType;
    const gradientNames: Record<GradientMaskType, string> = {
      [GradientMaskType.LINEAR]: 'Linear Gradient',
      [GradientMaskType.RADIAL]: 'Radial Gradient',
      [GradientMaskType.ANGULAR]: 'Angular Gradient',
      [GradientMaskType.MULTI_STOP]: 'Multi-Stop Gradient',
    };
    name = gradientNames[gradientType] || 'Gradient Mask';
  }

  // Reset mask to default position/size
  const handleReset = useCallback(() => {
    if (!shapeMask) return;
    
    switch (shapeMask.shapeType) {
      case ShapeMaskType.RECTANGLE:
        onUpdate({ x: 10, y: 10, width: 80, height: 80, cornerRadius: 0 } as any);
        break;
      case ShapeMaskType.ELLIPSE:
        onUpdate({ centerX: 50, centerY: 50, radiusX: 40, radiusY: 40 } as any);
        break;
      case ShapeMaskType.POLYGON:
        onUpdate({ 
          points: [
            { x: 50, y: 10, pointType: 'corner' },
            { x: 90, y: 90, pointType: 'corner' },
            { x: 10, y: 90, pointType: 'corner' },
          ]
        } as any);
        break;
    }
  }, [shapeMask, onUpdate]);

  return (
    <div className={cn(
      "bg-neutral-900/50 border border-neutral-700/50 rounded-lg overflow-hidden",
      !mask.enabled && "opacity-60"
    )}>
      {/* Header */}
      <div 
        className="flex items-center gap-1.5 px-3 py-2 cursor-pointer hover:bg-neutral-800/30 transition-colors"
        onClick={onExpand}
      >
        <Icon className={cn(
          "h-3.5 w-3.5",
          mask.enabled ? "text-primary" : "text-muted-foreground/50"
        )} />
        <span className="text-xs font-medium text-foreground/90 flex-1 truncate">
          {mask.name || name}
        </span>
        <div className="flex items-center gap-0.5 opacity-60 hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
          <button
            className={cn(
              "h-6 w-6 flex items-center justify-center rounded transition-colors",
              mask.inverted 
                ? "bg-primary/20 text-primary" 
                : "text-muted-foreground hover:text-foreground hover:bg-neutral-700/50"
            )}
            onClick={() => onUpdate({ inverted: !mask.inverted })}
            title="Invert"
          >
            <FlipVertical className="h-3 w-3" />
          </button>
          <button
            className={cn(
              "h-6 w-6 flex items-center justify-center rounded transition-colors",
              mask.enabled 
                ? "text-primary hover:bg-primary/10" 
                : "text-muted-foreground/50 hover:bg-neutral-700/50"
            )}
            onClick={() => onUpdate({ enabled: !mask.enabled })}
            title={mask.enabled ? "Disable" : "Enable"}
          >
            {mask.enabled ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          </button>
          <button
            className="h-6 w-6 flex items-center justify-center text-red-400/70 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
            onClick={onRemove}
            title="Delete"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
        <ChevronDown className={cn(
          "h-3.5 w-3.5 text-muted-foreground transition-transform",
          !isExpanded && "-rotate-90"
        )} />
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="p-3 space-y-3 border-t border-neutral-700/50">
          
          {/* Shape-specific controls */}
          {shapeMask && shapeMask.shapeType === ShapeMaskType.RECTANGLE && (
            <RectangleMaskControls 
              mask={shapeMask as RectangleMask} 
              onUpdate={onUpdate}
              onReset={handleReset}
              aspectRatio={aspectRatio}
            />
          )}
          
          {shapeMask && shapeMask.shapeType === ShapeMaskType.ELLIPSE && (
            <EllipseMaskControls 
              mask={shapeMask as EllipseMask} 
              onUpdate={onUpdate}
              onReset={handleReset}
              aspectRatio={aspectRatio}
            />
          )}
          
          {shapeMask && shapeMask.shapeType === ShapeMaskType.POLYGON && (
            <PolygonMaskControls 
              mask={shapeMask as PolygonMask} 
              onUpdate={onUpdate}
              onReset={handleReset}
            />
          )}

          {/* Gradient mask controls */}
          {mask.type === MaskType.GRADIENT && (
            <GradientMaskControls
              mask={mask as GradientMask}
              onUpdate={onUpdate as any}
            />
          )}

          {/* Edge Feather Section - New visual edge selector */}
          <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3">
            <EdgeFeatherSelector
              value={mask.edgeFeather || DEFAULT_EDGE_FEATHER}
              onChange={(edgeFeather: any) => onUpdate({ edgeFeather } as any)}
            />
          </div>

          {/* Expansion Section */}
          <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3">
            <SectionHeader icon={Maximize2} title="Expansion" />
            <div className="flex items-center gap-3">
              <Slider
                value={[mask.expansion]}
                onValueChange={([v]) => onUpdate({ expansion: v })}
                min={-100}
                max={100}
                step={1}
                className="flex-1"
              />
              <div className="w-16">
                <DraggableNumber
                  value={mask.expansion}
                  onChange={(v) => onUpdate({ expansion: v })}
                  suffix="px"
                  decimals={0}
                  step={1}
                  min={-100}
                  max={100}
                />
              </div>
            </div>
          </div>

          {/* Opacity Section */}
          <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3">
            <SectionHeader icon={Circle} title="Opacity" />
            <div className="flex items-center gap-3">
              <Slider
                value={[mask.opacity]}
                onValueChange={([v]) => onUpdate({ opacity: v })}
                min={0}
                max={1}
                step={0.01}
                className="flex-1"
              />
              <div className="w-16">
                <DraggableNumber
                  value={Math.round(mask.opacity * 100)}
                  onChange={(v) => onUpdate({ opacity: v / 100 })}
                  suffix="%"
                  decimals={0}
                  step={1}
                  min={0}
                  max={100}
                />
              </div>
            </div>
          </div>

          {/* Composite Mode Section */}
          <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3">
            <SectionHeader icon={Blend} title="Composite" />
            <Select
              value={mask.compositeMode || MaskCompositeMode.ADD}
              onValueChange={(value) => onUpdate({ compositeMode: value as MaskCompositeMode })}
            >
              <SelectTrigger className="h-8 text-sm bg-muted/50 border-muted-foreground/20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={MaskCompositeMode.ADD}>Add</SelectItem>
                <SelectItem value={MaskCompositeMode.SUBTRACT}>Subtract</SelectItem>
                <SelectItem value={MaskCompositeMode.INTERSECT}>Intersect</SelectItem>
                <SelectItem value={MaskCompositeMode.DIFFERENCE}>Difference</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Track Matte specific */}
          {mask.type === MaskType.TRACK_MATTE && (
            <>
              <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3">
                <SectionHeader icon={Layers} title="Source Layer" />
                <Select
                  value={String((mask as any).sourceOverlayId)}
                  onValueChange={(value) => onUpdate({ sourceOverlayId: parseInt(value) } as any)}
                >
                  <SelectTrigger className="h-8 text-sm bg-muted/50 border-muted-foreground/20">
                    <SelectValue placeholder="Select layer" />
                  </SelectTrigger>
                  <SelectContent>
                    {overlays
                      .filter(o => o.type !== OverlayType.SOUND)
                      .map(o => (
                        <SelectItem key={o.id} value={String(o.id)}>
                          {(o as any).content || `Layer ${o.id}`}
                        </SelectItem>
                      ))
                    }
                  </SelectContent>
                </Select>
              </div>

              <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3">
                <SectionHeader icon={Layers} title="Matte Type" />
                <Select
                  value={(mask as any).matteType}
                  onValueChange={(value) => onUpdate({ matteType: value } as any)}
                >
                  <SelectTrigger className="h-8 text-sm bg-muted/50 border-muted-foreground/20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TRACK_MATTE_METADATA).map(([type, meta]) => (
                      <SelectItem key={type} value={type}>
                        {meta.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

// ==========================================
// SHAPE-SPECIFIC CONTROL COMPONENTS
// ==========================================

interface RectangleMaskControlsProps {
  mask: RectangleMask;
  onUpdate: (updates: Partial<RectangleMask>) => void;
  onReset: () => void;
  aspectRatio: number;
}

const RectangleMaskControls: React.FC<RectangleMaskControlsProps> = ({ mask, onUpdate, onReset, aspectRatio }) => {
  const [constrainProportions, setConstrainProportions] = useState(false);
  
  // Calculate visually square height for the current aspect ratio
  const getSquareHeight = (width: number) => Math.min(100, width * aspectRatio);
  
  const handleWidthChange = (v: number) => {
    const newWidth = Math.max(1, Math.min(100, v));
    if (constrainProportions) {
      onUpdate({ width: newWidth, height: getSquareHeight(newWidth) });
    } else {
      onUpdate({ width: newWidth });
    }
  };
  
  const handleHeightChange = (v: number) => {
    const newHeight = Math.max(1, Math.min(100, v));
    if (constrainProportions) {
      const newWidth = newHeight / aspectRatio;
      onUpdate({ width: Math.max(1, Math.min(100, newWidth)), height: newHeight });
    } else {
      onUpdate({ height: newHeight });
    }
  };

  // Generate aspect-ratio-aware presets
  const presets = useMemo(() => {
    // For a visual square, height = width * aspectRatio
    const squareH = (w: number) => Math.min(100, w * aspectRatio);
    
    return [
      { label: "Square", x: 15, y: (100 - squareH(70)) / 2, w: 70, h: squareH(70), isSquare: true },
      { label: "Full", x: 0, y: 0, w: 100, h: 100 },
      { label: "Top Half", x: 0, y: 0, w: 100, h: 50 },
      { label: "Bottom Half", x: 0, y: 50, w: 100, h: 50 },
      { label: "Left Half", x: 0, y: 0, w: 50, h: 100 },
      { label: "Right Half", x: 50, y: 0, w: 50, h: 100 },
      { label: "Letterbox", x: 0, y: 12, w: 100, h: 76 },
      { label: "Wide Bar", x: 5, y: 35, w: 90, h: 30 },
    ];
  }, [aspectRatio]);

  return (
    <div className="space-y-3">
      {/* Position */}
      <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3">
        <SectionHeader icon={Move} title="Position" />
        <div className="grid grid-cols-2 gap-2">
          <DraggableNumber
            label="X"
            value={mask.x}
            onChange={(v) => onUpdate({ x: Math.max(0, Math.min(100, v)) })}
            suffix="%"
            decimals={1}
            step={0.5}
            min={0}
            max={100}
          />
          <DraggableNumber
            label="Y"
            value={mask.y}
            onChange={(v) => onUpdate({ y: Math.max(0, Math.min(100, v)) })}
            suffix="%"
            decimals={1}
            step={0.5}
            min={0}
            max={100}
          />
        </div>
      </div>
      
      {/* Size */}
      <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3">
        <SectionHeader icon={Maximize2} title="Size">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-6 px-2 text-xs gap-1",
              constrainProportions && "bg-accent text-accent-foreground"
            )}
            onClick={() => setConstrainProportions(!constrainProportions)}
            title="Lock proportions to maintain visual square"
          >
            {constrainProportions ? (
              <Link2 className="h-3 w-3" />
            ) : (
              <Link2Off className="h-3 w-3" />
            )}
            {constrainProportions ? 'Square' : 'Free'}
          </Button>
        </SectionHeader>
        <div className="grid grid-cols-2 gap-2">
          <DraggableNumber
            label="W"
            value={mask.width}
            onChange={handleWidthChange}
            suffix="%"
            decimals={1}
            step={0.5}
            min={1}
            max={100}
          />
          <DraggableNumber
            label="H"
            value={mask.height}
            onChange={handleHeightChange}
            suffix="%"
            decimals={1}
            step={0.5}
            min={1}
            max={100}
          />
        </div>
        {aspectRatio !== 1 && (
          <p className="text-[9px] text-muted-foreground mt-2">
            Video is {aspectRatio > 1 ? 'horizontal' : 'vertical'}. Enable "Square" lock for true squares.
          </p>
        )}
      </div>
      
      {/* Corner Radius */}
      <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3">
        <SectionHeader icon={Square} title="Roundness" />
        <div className="flex items-center gap-3">
          <Slider
            value={[mask.cornerRadius]}
            onValueChange={([v]) => onUpdate({ cornerRadius: v })}
            min={0}
            max={200}
            step={1}
            className="flex-1"
          />
          <div className="w-16">
            <DraggableNumber
              value={mask.cornerRadius}
              onChange={(v) => onUpdate({ cornerRadius: v })}
              suffix="px"
              decimals={0}
              step={1}
              min={0}
              max={200}
            />
          </div>
        </div>
      </div>
      
      {/* Shape presets with visual icons */}
      <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-2 font-medium">
          Presets (adjusted for video aspect ratio)
        </span>
        <div className="grid grid-cols-4 gap-1.5">
          {presets.map((preset) => {
            const isActive = 
              Math.abs(mask.x - preset.x) < 1 && 
              Math.abs(mask.y - preset.y) < 1 && 
              Math.abs(mask.width - preset.w) < 1 && 
              Math.abs(mask.height - preset.h) < 1;
            return (
              <button
                key={preset.label}
                type="button"
                title={preset.label}
                onClick={() => onUpdate({ x: preset.x, y: preset.y, width: preset.w, height: preset.h })}
                className={cn(
                  "aspect-square rounded-md border transition-all flex items-center justify-center p-1",
                  isActive 
                    ? "border-primary bg-primary/20 text-primary" 
                    : "border-neutral-700 bg-neutral-800/50 text-neutral-400 hover:bg-neutral-700/50 hover:border-neutral-600"
                )}
              >
                <svg viewBox="0 0 100 100" className="w-full h-full">
                  <rect 
                    x={preset.x || 2} 
                    y={preset.y || 2} 
                    width={Math.max(preset.w, 4)} 
                    height={Math.max(preset.h, 4)} 
                    fill="currentColor"
                  />
                </svg>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

interface EllipseMaskControlsProps {
  mask: EllipseMask;
  onUpdate: (updates: Partial<EllipseMask>) => void;
  onReset: () => void;
  aspectRatio: number; // width/height ratio of the video
}

const EllipseMaskControls: React.FC<EllipseMaskControlsProps> = ({ mask, onUpdate, onReset, aspectRatio }) => {
  const [constrainProportions, setConstrainProportions] = useState(false);
  
  // Calculate true circle radiusY for the current aspect ratio
  // To get a visual circle: radiusY (in %) = radiusX (in %) * aspectRatio
  const getCircleRadiusY = (radiusX: number) => {
    return Math.min(100, radiusX * aspectRatio);
  };
  
  const handleRadiusXChange = (v: number) => {
    const newRadiusX = Math.max(1, Math.min(100, v));
    if (constrainProportions) {
      // Maintain visual circle
      onUpdate({ radiusX: newRadiusX, radiusY: getCircleRadiusY(newRadiusX) });
    } else {
      onUpdate({ radiusX: newRadiusX });
    }
  };
  
  const handleRadiusYChange = (v: number) => {
    const newRadiusY = Math.max(1, Math.min(100, v));
    if (constrainProportions) {
      // Maintain visual circle
      const newRadiusX = newRadiusY / aspectRatio;
      onUpdate({ radiusX: Math.max(1, Math.min(100, newRadiusX)), radiusY: newRadiusY });
    } else {
      onUpdate({ radiusY: newRadiusY });
    }
  };

  // Generate presets that account for aspect ratio
  const presets = useMemo(() => {
    // For circles, calculate radiusY to create a visual circle
    const circleRY = (rx: number) => Math.min(100, rx * aspectRatio);
    
    return [
      { label: "Circle", cx: 50, cy: 50, rx: 40, ry: circleRY(40), isCircle: true },
      { label: "Small Circle", cx: 50, cy: 50, rx: 20, ry: circleRY(20), isCircle: true },
      { label: "Large Circle", cx: 50, cy: 50, rx: 48, ry: circleRY(48), isCircle: true },
      { label: "Wide", cx: 50, cy: 50, rx: 45, ry: 20 },
      { label: "Tall", cx: 50, cy: 50, rx: 20, ry: 45 },
      { label: "Top", cx: 50, cy: 25, rx: 35, ry: circleRY(35) * 0.7, isCircle: false },
      { label: "Bottom", cx: 50, cy: 75, rx: 35, ry: circleRY(35) * 0.7, isCircle: false },
      { label: "Full (Vignette)", cx: 50, cy: 50, rx: 70, ry: circleRY(70), isCircle: true },
    ];
  }, [aspectRatio]);

  return (
    <div className="space-y-3">
      {/* Center Position */}
      <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3">
        <SectionHeader icon={Move} title="Center" />
        <div className="grid grid-cols-2 gap-2">
          <DraggableNumber
            label="X"
            value={mask.centerX}
            onChange={(v) => onUpdate({ centerX: Math.max(0, Math.min(100, v)) })}
            suffix="%"
            decimals={1}
            step={0.5}
            min={0}
            max={100}
          />
          <DraggableNumber
            label="Y"
            value={mask.centerY}
            onChange={(v) => onUpdate({ centerY: Math.max(0, Math.min(100, v)) })}
            suffix="%"
            decimals={1}
            step={0.5}
            min={0}
            max={100}
          />
        </div>
      </div>
      
      {/* Radius */}
      <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3">
        <SectionHeader icon={Maximize2} title="Radius">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-6 px-2 text-xs gap-1",
              constrainProportions && "bg-accent text-accent-foreground"
            )}
            onClick={() => setConstrainProportions(!constrainProportions)}
            title="Lock proportions to maintain visual circle"
          >
            {constrainProportions ? (
              <Link2 className="h-3 w-3" />
            ) : (
              <Link2Off className="h-3 w-3" />
            )}
            {constrainProportions ? 'Circle' : 'Free'}
          </Button>
        </SectionHeader>
        <div className="grid grid-cols-2 gap-2">
          <DraggableNumber
            label="X"
            value={mask.radiusX}
            onChange={handleRadiusXChange}
            suffix="%"
            decimals={1}
            step={0.5}
            min={1}
            max={100}
          />
          <DraggableNumber
            label="Y"
            value={mask.radiusY}
            onChange={handleRadiusYChange}
            suffix="%"
            decimals={1}
            step={0.5}
            min={1}
            max={100}
          />
        </div>
        {aspectRatio !== 1 && (
          <p className="text-[9px] text-muted-foreground mt-2">
            Video is {aspectRatio > 1 ? 'horizontal' : 'vertical'} ({aspectRatio.toFixed(2)}:1). 
            Enable "Circle" lock for true circles.
          </p>
        )}
      </div>
      
      {/* Shape presets with visual icons */}
      <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-2 font-medium">
          Presets (adjusted for video aspect ratio)
        </span>
        <div className="grid grid-cols-4 gap-1.5">
          {presets.map((preset) => {
            // Check if current mask matches this preset (with small tolerance)
            const isActive = 
              Math.abs(mask.centerX - preset.cx) < 1 && 
              Math.abs(mask.centerY - preset.cy) < 1 && 
              Math.abs(mask.radiusX - preset.rx) < 1 && 
              Math.abs(mask.radiusY - preset.ry) < 1;
            
            // For preview SVG, show how it will look (accounting for aspect ratio in preview too)
            const previewRY = preset.isCircle ? preset.rx : preset.ry; // In preview, show as circle if it's meant to be one
            
            return (
              <button
                key={preset.label}
                type="button"
                title={preset.label}
                onClick={() => onUpdate({ 
                  centerX: preset.cx, 
                  centerY: preset.cy, 
                  radiusX: preset.rx, 
                  radiusY: preset.ry 
                })}
                className={cn(
                  "aspect-square rounded-md border transition-all flex items-center justify-center p-1",
                  isActive 
                    ? "border-primary bg-primary/20 text-primary" 
                    : "border-neutral-700 bg-neutral-800/50 text-neutral-400 hover:bg-neutral-700/50 hover:border-neutral-600"
                )}
              >
                <svg viewBox="0 0 100 100" className="w-full h-full">
                  <ellipse 
                    cx={preset.cx} 
                    cy={preset.cy} 
                    rx={preset.rx} 
                    ry={previewRY} 
                    fill="currentColor" 
                  />
                </svg>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// Polygon mask presets with SVG previews
const POLYGON_PRESETS = [
  { 
    name: "Triangle", 
    points: [
      { x: 50, y: 10, pointType: 'corner' as const },
      { x: 90, y: 90, pointType: 'corner' as const },
      { x: 10, y: 90, pointType: 'corner' as const },
    ],
    svgPoints: "50,10 90,90 10,90"
  },
  { 
    name: "Diamond", 
    points: [
      { x: 50, y: 5, pointType: 'corner' as const },
      { x: 95, y: 50, pointType: 'corner' as const },
      { x: 50, y: 95, pointType: 'corner' as const },
      { x: 5, y: 50, pointType: 'corner' as const },
    ],
    svgPoints: "50,5 95,50 50,95 5,50"
  },
  { 
    name: "Pentagon", 
    points: [
      { x: 50, y: 5, pointType: 'corner' as const },
      { x: 95, y: 38, pointType: 'corner' as const },
      { x: 79, y: 92, pointType: 'corner' as const },
      { x: 21, y: 92, pointType: 'corner' as const },
      { x: 5, y: 38, pointType: 'corner' as const },
    ],
    svgPoints: "50,5 95,38 79,92 21,92 5,38"
  },
  { 
    name: "Hexagon", 
    points: [
      { x: 50, y: 5, pointType: 'corner' as const },
      { x: 93, y: 27, pointType: 'corner' as const },
      { x: 93, y: 73, pointType: 'corner' as const },
      { x: 50, y: 95, pointType: 'corner' as const },
      { x: 7, y: 73, pointType: 'corner' as const },
      { x: 7, y: 27, pointType: 'corner' as const },
    ],
    svgPoints: "50,5 93,27 93,73 50,95 7,73 7,27"
  },
  { 
    name: "Star", 
    points: [
      { x: 50, y: 5, pointType: 'corner' as const },
      { x: 61, y: 35, pointType: 'corner' as const },
      { x: 95, y: 35, pointType: 'corner' as const },
      { x: 68, y: 57, pointType: 'corner' as const },
      { x: 79, y: 91, pointType: 'corner' as const },
      { x: 50, y: 70, pointType: 'corner' as const },
      { x: 21, y: 91, pointType: 'corner' as const },
      { x: 32, y: 57, pointType: 'corner' as const },
      { x: 5, y: 35, pointType: 'corner' as const },
      { x: 39, y: 35, pointType: 'corner' as const },
    ],
    svgPoints: "50,5 61,35 95,35 68,57 79,91 50,70 21,91 32,57 5,35 39,35"
  },
  { 
    name: "Arrow", 
    points: [
      { x: 10, y: 35, pointType: 'corner' as const },
      { x: 60, y: 35, pointType: 'corner' as const },
      { x: 60, y: 15, pointType: 'corner' as const },
      { x: 90, y: 50, pointType: 'corner' as const },
      { x: 60, y: 85, pointType: 'corner' as const },
      { x: 60, y: 65, pointType: 'corner' as const },
      { x: 10, y: 65, pointType: 'corner' as const },
    ],
    svgPoints: "10,35 60,35 60,15 90,50 60,85 60,65 10,65"
  },
  { 
    name: "Heart", 
    points: [
      { x: 50, y: 90, pointType: 'corner' as const },
      { x: 10, y: 50, pointType: 'corner' as const },
      { x: 10, y: 30, pointType: 'corner' as const },
      { x: 25, y: 15, pointType: 'corner' as const },
      { x: 50, y: 30, pointType: 'corner' as const },
      { x: 75, y: 15, pointType: 'corner' as const },
      { x: 90, y: 30, pointType: 'corner' as const },
      { x: 90, y: 50, pointType: 'corner' as const },
    ],
    svgPoints: "50,90 10,50 10,30 25,15 50,30 75,15 90,30 90,50"
  },
  { 
    name: "Cross", 
    points: [
      { x: 35, y: 10, pointType: 'corner' as const },
      { x: 65, y: 10, pointType: 'corner' as const },
      { x: 65, y: 35, pointType: 'corner' as const },
      { x: 90, y: 35, pointType: 'corner' as const },
      { x: 90, y: 65, pointType: 'corner' as const },
      { x: 65, y: 65, pointType: 'corner' as const },
      { x: 65, y: 90, pointType: 'corner' as const },
      { x: 35, y: 90, pointType: 'corner' as const },
      { x: 35, y: 65, pointType: 'corner' as const },
      { x: 10, y: 65, pointType: 'corner' as const },
      { x: 10, y: 35, pointType: 'corner' as const },
      { x: 35, y: 35, pointType: 'corner' as const },
    ],
    svgPoints: "35,10 65,10 65,35 90,35 90,65 65,65 65,90 35,90 35,65 10,65 10,35 35,35"
  },
  {
    name: "L-Shape",
    points: [
      { x: 10, y: 10, pointType: 'corner' as const },
      { x: 45, y: 10, pointType: 'corner' as const },
      { x: 45, y: 55, pointType: 'corner' as const },
      { x: 90, y: 55, pointType: 'corner' as const },
      { x: 90, y: 90, pointType: 'corner' as const },
      { x: 10, y: 90, pointType: 'corner' as const },
    ],
    svgPoints: "10,10 45,10 45,55 90,55 90,90 10,90"
  },
];

interface PolygonMaskControlsProps {
  mask: PolygonMask;
  onUpdate: (updates: Partial<PolygonMask>) => void;
  onReset: () => void;
}

const PolygonMaskControls: React.FC<PolygonMaskControlsProps> = ({ mask, onUpdate, onReset }) => (
  <div className="space-y-3">
    {/* Path Info */}
    <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3">
      <SectionHeader icon={Pentagon} title="Path" />
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Vertices</span>
        <span className="font-medium">{mask.points.length}</span>
      </div>
    </div>
    
    {/* Curve Options */}
    <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3">
      <SectionHeader icon={Spline} title="Curves" />
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Smooth</span>
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-7 text-xs", mask.smooth && "bg-accent")}
            onClick={() => onUpdate({ smooth: !mask.smooth })}
          >
            {mask.smooth ? "On" : "Off"}
          </Button>
        </div>
        
        {mask.smooth && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Tension</span>
            </div>
            <div className="flex items-center gap-3">
              <Slider
                value={[(mask.tension ?? 0.5) * 100]}
                onValueChange={([v]) => onUpdate({ tension: v / 100 })}
                min={0}
                max={100}
                step={1}
                className="flex-1"
              />
              <div className="w-14">
                <DraggableNumber
                  value={(mask.tension ?? 0.5) * 100}
                  onChange={(v) => onUpdate({ tension: v / 100 })}
                  suffix="%"
                  decimals={0}
                  step={1}
                  min={0}
                  max={100}
                />
              </div>
            </div>
          </div>
        )}
        
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Closed</span>
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-7 text-xs", mask.closed && "bg-accent")}
            onClick={() => onUpdate({ closed: !mask.closed })}
          >
            {mask.closed ? "Yes" : "No"}
          </Button>
        </div>
      </div>
    </div>
    
    {/* Shape presets with visual icons */}
    <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-lg p-3">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-2 font-medium">
        Presets
      </span>
      <div className="grid grid-cols-5 gap-1.5">
        {POLYGON_PRESETS.slice(0, 10).map((preset) => (
          <button
            key={preset.name}
            type="button"
            title={preset.name}
            onClick={() => onUpdate({ points: preset.points })}
            className="aspect-square rounded-md border border-neutral-700 bg-neutral-800/50 text-neutral-400 hover:bg-neutral-700/50 hover:border-neutral-600 transition-all flex items-center justify-center p-1.5"
          >
            <svg viewBox="0 0 100 100" className="w-full h-full">
              <polygon points={preset.svgPoints} fill="currentColor" />
            </svg>
          </button>
        ))}
      </div>
    </div>
  </div>
);

// ==========================================
// SHAPE PRESETS
// ==========================================

interface ShapePreset {
  name: string;
  icon: React.ElementType;
  createMask: () => Mask;
}

const SHAPE_PRESETS: ShapePreset[] = [
  {
    name: "Centered Circle",
    icon: Circle,
    createMask: () => ({
      ...createEllipseMask(),
      name: "Centered Circle",
      centerX: 50,
      centerY: 50,
      radiusX: 40,
      radiusY: 40,
    } as Mask),
  },
  {
    name: "Centered Square",
    icon: Square,
    createMask: () => ({
      ...createRectangleMask(),
      name: "Centered Square",
      x: 15,
      y: 15,
      width: 70,
      height: 70,
    } as Mask),
  },
  {
    name: "Full Frame",
    icon: Maximize2,
    createMask: () => ({
      ...createRectangleMask(),
      name: "Full Frame",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    } as Mask),
  },
  {
    name: "Letterbox (16:9)",
    icon: Square,
    createMask: () => ({
      ...createRectangleMask(),
      name: "Letterbox 16:9",
      x: 0,
      y: 12,
      width: 100,
      height: 76,
    } as Mask),
  },
  {
    name: "Letterbox (2.35:1)",
    icon: Square,
    createMask: () => ({
      ...createRectangleMask(),
      name: "Letterbox 2.35:1",
      x: 0,
      y: 17,
      width: 100,
      height: 66,
    } as Mask),
  },
  {
    name: "Pillarbox (4:3)",
    icon: Square,
    createMask: () => ({
      ...createRectangleMask(),
      name: "Pillarbox 4:3",
      x: 12.5,
      y: 0,
      width: 75,
      height: 100,
    } as Mask),
  },
  {
    name: "Portrait Circle",
    icon: Circle,
    createMask: () => ({
      ...createEllipseMask(),
      name: "Portrait Circle",
      centerX: 50,
      centerY: 35,
      radiusX: 25,
      radiusY: 25,
    } as Mask),
  },
  {
    name: "Vignette",
    icon: Circle,
    createMask: () => ({
      ...createEllipseMask(),
      name: "Vignette",
      centerX: 50,
      centerY: 50,
      radiusX: 60,
      radiusY: 50,
      feather: 30,
      featherMode: FeatherMode.INSIDE,
    } as Mask),
  },
  {
    name: "Triangle",
    icon: Pentagon,
    createMask: () => createPolygonMask(),
  },
  {
    name: "Diamond",
    icon: Pentagon,
    createMask: () => ({
      ...createPolygonMask(),
      name: "Diamond",
      points: [
        { x: 50, y: 5, pointType: 'corner' as const },
        { x: 95, y: 50, pointType: 'corner' as const },
        { x: 50, y: 95, pointType: 'corner' as const },
        { x: 5, y: 50, pointType: 'corner' as const },
      ],
    } as Mask),
  },
];

// ==========================================
// ADD MASK DROPDOWN
// ==========================================

interface AddMaskDropdownProps {
  onAddShape: (type: ShapeMaskType) => void;
  onAddBezier: () => void;
  onAddTrackMatte: () => void;
  onAddPreset: (mask: Mask) => void;
}

const AddMaskDropdown: React.FC<AddMaskDropdownProps> = ({ 
  onAddShape, 
  onAddBezier,
  onAddTrackMatte,
  onAddPreset,
}) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="w-full h-8">
          <Plus className="h-3.5 w-3.5 mr-2" />
          Add Mask
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-56">
        {/* Shape masks */}
        <DropdownMenuItem onClick={() => onAddShape(ShapeMaskType.RECTANGLE)}>
          <Square className="h-4 w-4 mr-2" />
          Rectangle Mask
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAddShape(ShapeMaskType.ELLIPSE)}>
          <Circle className="h-4 w-4 mr-2" />
          Ellipse Mask
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAddShape(ShapeMaskType.POLYGON)}>
          <Pentagon className="h-4 w-4 mr-2" />
          Polygon Mask
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        
        {/* Advanced */}
        <DropdownMenuItem onClick={onAddBezier}>
          <Spline className="h-4 w-4 mr-2" />
          Bezier Curve
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onAddTrackMatte}>
          <Layers className="h-4 w-4 mr-2" />
          Track Matte
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

// ==========================================
// MASKS SECTION COMPONENT
// ==========================================

export const MasksSection: React.FC<MasksSectionProps> = ({
  overlay,
  onUpdate,
}) => {
  // PERF: Subscribe to the clips record (stable reference) instead of
  // Object.values() which creates a new array on every store change.
  // Only actual clip mutations change the record reference.
  const clipsRecord = useVideoEditorStore(state => state.clips);
  const fps = useVideoEditorStore(state => state.fps) || 30;
  const overlays = useMemo(
    () => (Object.values(clipsRecord) as TimelineClip[]).map((clip) => clipToOverlay(clip, fps)),
    [clipsRecord, fps]
  );
  
  // Get composition dimensions to calculate the overlay's pixel aspect ratio
  const aspectRatioString = useVideoEditorStore(state => state.aspectRatio) || '16:9';
  const resolution = useVideoEditorStore(state => state.resolution) || '1080p';
  
  // Calculate composition dimensions
  const compositionDimensions = useMemo(() => {
    const resolutionHeights: Record<string, number> = {
      '720p': 720,
      '1080p': 1080,
      '1440p': 1440,
      '4k': 2160,
    };
    const aspectRatios: Record<string, number> = {
      '16:9': 16/9,
      '9:16': 9/16,
      '1:1': 1,
      '4:5': 4/5,
    };
    const height = resolutionHeights[resolution] || 1080;
    const ratio = aspectRatios[aspectRatioString] || 16/9;
    const width = Math.round(height * ratio);
    return { width, height };
  }, [aspectRatioString, resolution]);
  
  // Calculate the OVERLAY's actual pixel aspect ratio
  // Overlay width/height are in composition pixel coordinates
  // The mask is applied to this element, so we need its pixel aspect ratio
  const aspectRatio = useMemo(() => {
    // overlay.width and overlay.height are composition pixel values (not percentages!)
    const overlayWidth = overlay.width || compositionDimensions.width;
    const overlayHeight = overlay.height || compositionDimensions.height;
    // The aspect ratio is simply width/height in pixels
    return overlayWidth / overlayHeight;
  }, [overlay.width, overlay.height, compositionDimensions]);
  
  const [expandedId, setExpandedId] = useState<string | null>(null);
  
  // Get masks from overlay (with type assertion)
  const overlayWithMasks = overlay as OverlayWithMasks;
  const masks = overlayWithMasks.masks || [];

  // Handlers
  const handleAddShapeMask = (type: ShapeMaskType) => {
    let newMask: Mask;
    switch (type) {
      case ShapeMaskType.RECTANGLE:
        newMask = createRectangleMask(aspectRatio);
        break;
      case ShapeMaskType.ELLIPSE:
        newMask = createEllipseMask(aspectRatio);
        break;
      case ShapeMaskType.POLYGON:
        newMask = createPolygonMask();
        break;
    }
    onUpdate({ masks: [...masks, newMask] } as any);
    setExpandedId(newMask.id);
  };

  const handleAddBezierMask = () => {
    const newMask = createBezierMask();
    onUpdate({ masks: [...masks, newMask] } as any);
    setExpandedId(newMask.id);
  };

  const handleAddTrackMatte = () => {
    // Find first visual overlay that's not the current one
    const sourceOverlay = overlays.find(
      o => o.id !== overlay.id && o.type !== OverlayType.SOUND
    );
    if (!sourceOverlay) return;
    
    const newMask = createTrackMatte(sourceOverlay.id);
    onUpdate({ masks: [...masks, newMask] } as any);
    setExpandedId(newMask.id);
  };

  const handleAddPresetMask = (mask: Mask) => {
    onUpdate({ masks: [...masks, mask] } as any);
    setExpandedId(mask.id);
  };

  // New handler for MaskAddPanel - accepts any mask type
  const handleAddMask = (mask: Mask) => {
    onUpdate({ masks: [...masks, mask] } as any);
    setExpandedId(mask.id);
    setShowAddPanel(false);
  };

  const handleUpdateMask = (maskId: string, updates: Partial<Mask>) => {
    const updatedMasks = masks.map(m =>
      m.id === maskId ? { ...m, ...updates } : m
    );
    onUpdate({ masks: updatedMasks } as any);
  };

  const handleRemoveMask = (maskId: string) => {
    const updatedMasks = masks.filter(m => m.id !== maskId);
    onUpdate({ masks: updatedMasks } as any);
    if (expandedId === maskId) setExpandedId(null);
  };

  // State for showing the add panel
  const [showAddPanel, setShowAddPanel] = useState(false);

  // Prepare available overlays for track matte selection
  const availableOverlays = overlays
    .filter(o => o.id !== overlay.id && o.type !== OverlayType.SOUND)
    .map(o => ({ id: o.id, name: (o as any).content || `Layer ${o.id}` }));

  return (
    <div className="space-y-3">
      {/* Masks List */}
      {masks.length > 0 && (
        <div className="space-y-2">
          {masks.map(mask => (
            <MaskItem
              key={mask.id}
              mask={mask}
              overlays={overlays}
              onUpdate={(updates) => handleUpdateMask(mask.id, updates)}
              onRemove={() => handleRemoveMask(mask.id)}
              onExpand={() => setExpandedId(expandedId === mask.id ? null : mask.id)}
              isExpanded={expandedId === mask.id}
              aspectRatio={aspectRatio}
            />
          ))}
        </div>
      )}

      {/* Add Mask Panel */}
      {showAddPanel ? (
        <div className="relative">
          <MaskAddPanel
            onAddMask={handleAddMask}
            onCancel={() => setShowAddPanel(false)}
            availableOverlays={availableOverlays}
            currentOverlayId={overlay.id}
            aspectRatio={aspectRatio}
          />
        </div>
      ) : (
        <button
          className="w-full h-9 rounded-lg flex items-center justify-center gap-2 text-xs font-medium
                     bg-neutral-800/50 border border-neutral-700/50
                     text-muted-foreground hover:text-foreground
                     hover:bg-neutral-700/50 hover:border-neutral-600/50
                     active:scale-[0.98] transition-all duration-200"
          onClick={() => setShowAddPanel(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Mask
        </button>
      )}
    </div>
  );
};

export default MasksSection;
