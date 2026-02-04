/**
 * Masking System Types
 * 
 * Defines the type system for masks that can be applied to video and image overlays.
 * Supports shape-based masks, gradient masks, edge-specific feathering, and track mattes.
 * 
 * Features:
 * - Shape masks: rectangle, ellipse, bezier polygon
 * - Gradient masks: linear, radial, angular, multi-stop
 * - Edge-specific feathering (per-edge control)
 * - Bezier control points for smooth curves
 * - Multiple mask compositing
 * - Keyframe animation support
 */

// ==========================================
// MASK TYPE ENUM
// ==========================================

export enum MaskType {
  SHAPE = 'shape',
  GRADIENT = 'gradient',
  TRACK_MATTE = 'trackMatte',
}

export enum ShapeMaskType {
  RECTANGLE = 'rectangle',
  ELLIPSE = 'ellipse',
  POLYGON = 'polygon',
}

export enum TrackMatteType {
  ALPHA = 'alpha',
  LUMA = 'luma',
  ALPHA_INVERTED = 'alphaInverted',
  LUMA_INVERTED = 'lumaInverted',
}

/**
 * Gradient mask types
 */
export enum GradientMaskType {
  /** Linear gradient from one edge to another */
  LINEAR = 'linear',
  /** Radial gradient from center outward */
  RADIAL = 'radial',
  /** Angular/conic gradient around a center point */
  ANGULAR = 'angular',
  /** Custom multi-stop gradient */
  MULTI_STOP = 'multiStop',
}

/**
 * Feather modes - where the feathering is applied
 * @deprecated Use EdgeFeather for per-edge control instead
 */
export enum FeatherMode {
  /** Feather extends inward from the mask edge */
  INSIDE = 'inside',
  /** Feather extends outward from the mask edge */
  OUTSIDE = 'outside',
  /** Feather extends both inward and outward (centered on edge) */
  BOTH = 'both',
}

// ==========================================
// EDGE FEATHERING TYPES
// ==========================================

/**
 * Edge identifiers for rectangular shapes
 */
export type RectangleEdge = 'top' | 'right' | 'bottom' | 'left';

/**
 * Edge identifiers for elliptical/round shapes
 * Uses simplified zones since ellipses don't have defined edges
 */
export type EllipseEdge = 'top' | 'sides' | 'bottom';

/**
 * Edge feather values - per-edge feathering control
 */
export interface EdgeFeather {
  /** Top edge feather amount (0-100) */
  top: number;
  /** Right edge feather amount (0-100) - for rectangles */
  right: number;
  /** Bottom edge feather amount (0-100) */
  bottom: number;
  /** Left edge feather amount (0-100) - for rectangles */
  left: number;
  /** Feather mode for all edges */
  mode: FeatherMode;
}

/**
 * Simplified edge feather for ellipses/round shapes
 */
export interface EllipseEdgeFeather {
  /** Top zone feather amount (0-100) */
  top: number;
  /** Left and right sides feather amount (0-100) */
  sides: number;
  /** Bottom zone feather amount (0-100) */
  bottom: number;
  /** Feather mode for all edges */
  mode: FeatherMode;
}

/**
 * Default edge feather values
 */
export const DEFAULT_EDGE_FEATHER: EdgeFeather = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  mode: FeatherMode.BOTH,
};

export const DEFAULT_ELLIPSE_EDGE_FEATHER: EllipseEdgeFeather = {
  top: 0,
  sides: 0,
  bottom: 0,
  mode: FeatherMode.BOTH,
};

// ==========================================
// GRADIENT TYPES
// ==========================================

/**
 * A color stop in a gradient
 */
export interface GradientStop {
  /** Position along the gradient (0-1) */
  position: number;
  /** Opacity at this stop (0-1) */
  opacity: number;
}

/**
 * Linear gradient configuration
 */
export interface LinearGradientConfig {
  /** Angle of the gradient in degrees (0 = left to right, 90 = top to bottom) */
  angle: number;
  /** Gradient stops */
  stops: GradientStop[];
}

/**
 * Radial gradient configuration
 */
export interface RadialGradientConfig {
  /** Center X position as percentage (0-100) */
  centerX: number;
  /** Center Y position as percentage (0-100) */
  centerY: number;
  /** Horizontal radius as percentage (0-100) */
  radiusX: number;
  /** Vertical radius as percentage (0-100) */
  radiusY: number;
  /** Gradient stops */
  stops: GradientStop[];
}

/**
 * Angular/conic gradient configuration
 */
export interface AngularGradientConfig {
  /** Center X position as percentage (0-100) */
  centerX: number;
  /** Center Y position as percentage (0-100) */
  centerY: number;
  /** Starting angle in degrees */
  startAngle: number;
  /** Gradient stops */
  stops: GradientStop[];
}

/**
 * Mask compositing modes for multiple masks
 */
export enum MaskCompositeMode {
  /** Add mask areas together (union) */
  ADD = 'add',
  /** Subtract this mask from previous masks */
  SUBTRACT = 'subtract',
  /** Only show intersection of masks */
  INTERSECT = 'intersect',
  /** Show difference between masks */
  DIFFERENCE = 'difference',
}

// ==========================================
// BEZIER POINT TYPES
// ==========================================

/**
 * A point with optional bezier control handles
 * Used for smooth bezier curves in polygon masks
 */
export interface BezierPoint {
  /** X position as percentage of parent (0-100) */
  x: number;
  /** Y position as percentage of parent (0-100) */
  y: number;
  /** Handle in - control point for incoming curve */
  handleIn?: {
    x: number;
    y: number;
  };
  /** Handle out - control point for outgoing curve */
  handleOut?: {
    x: number;
    y: number;
  };
  /** Point type: corner (sharp), smooth (aligned handles), or auto */
  pointType?: 'corner' | 'smooth' | 'auto';
}

/**
 * Simple point without bezier handles (for backwards compatibility)
 */
export interface SimplePoint {
  x: number;
  y: number;
}

// ==========================================
// BASE MASK INTERFACE
// ==========================================

export interface BaseMask {
  /** Unique identifier for this mask */
  id: string;
  /** Whether this mask is enabled */
  enabled: boolean;
  /** Whether to invert the mask (show outside instead of inside) */
  inverted: boolean;
  /** 
   * Edge-specific feather values 
   * Replaces the old single feather value for per-edge control
   */
  edgeFeather: EdgeFeather;
  /**
   * @deprecated Use edgeFeather instead. Kept for backward compatibility.
   * Feather/blur amount for mask edges in pixels (0-100)
   */
  feather?: number;
  /**
   * @deprecated Use edgeFeather.mode instead. Kept for backward compatibility.
   * Feather mode - where feathering is applied
   */
  featherMode?: FeatherMode;
  /** Expansion/contraction of mask in pixels (-100 to 100) */
  expansion: number;
  /** Opacity of the mask (0-1, where 1 = fully masked) */
  opacity: number;
  /** Display name for this mask */
  name?: string;
  /** Composite mode for stacking with other masks */
  compositeMode?: MaskCompositeMode;
  /** Whether this mask is locked (can't be edited) */
  locked?: boolean;
  /** Whether this mask is selected in the UI */
  selected?: boolean;
}

// ==========================================
// SHAPE MASK TYPES
// ==========================================

export interface ShapeMaskBase extends BaseMask {
  type: MaskType.SHAPE;
  shapeType: ShapeMaskType;
}

export interface RectangleMask extends ShapeMaskBase {
  shapeType: ShapeMaskType.RECTANGLE;
  /** X position as percentage of parent (0-100) */
  x: number;
  /** Y position as percentage of parent (0-100) */
  y: number;
  /** Width as percentage of parent (0-100) */
  width: number;
  /** Height as percentage of parent (0-100) */
  height: number;
  /** Corner radius in pixels */
  cornerRadius: number;
}

export interface EllipseMask extends ShapeMaskBase {
  shapeType: ShapeMaskType.ELLIPSE;
  /** Center X position as percentage of parent (0-100) */
  centerX: number;
  /** Center Y position as percentage of parent (0-100) */
  centerY: number;
  /** Horizontal radius as percentage of parent (0-100) */
  radiusX: number;
  /** Vertical radius as percentage of parent (0-100) */
  radiusY: number;
}

export interface PolygonMask extends ShapeMaskBase {
  shapeType: ShapeMaskType.POLYGON;
  /** Array of bezier points defining the polygon path with optional handles */
  points: BezierPoint[];
  /** Whether the path is closed */
  closed: boolean;
  /** Whether to use smooth bezier curves (true) or linear segments (false) */
  smooth: boolean;
  /** Tension for auto-generated bezier curves (0-1, default 0.5) */
  tension?: number;
}

export type ShapeMask = RectangleMask | EllipseMask | PolygonMask;

// ==========================================
// TRACK MATTE TYPE
// ==========================================

export interface TrackMatte extends BaseMask {
  type: MaskType.TRACK_MATTE;
  /** ID of the overlay to use as the matte source */
  sourceOverlayId: number;
  /** Type of track matte to apply */
  matteType: TrackMatteType;
}

// ==========================================
// GRADIENT MASK TYPE
// ==========================================

export interface GradientMaskBase extends BaseMask {
  type: MaskType.GRADIENT;
  gradientType: GradientMaskType;
}

export interface LinearGradientMask extends GradientMaskBase {
  gradientType: GradientMaskType.LINEAR;
  config: LinearGradientConfig;
}

export interface RadialGradientMask extends GradientMaskBase {
  gradientType: GradientMaskType.RADIAL;
  config: RadialGradientConfig;
}

export interface AngularGradientMask extends GradientMaskBase {
  gradientType: GradientMaskType.ANGULAR;
  config: AngularGradientConfig;
}

export interface MultiStopGradientMask extends GradientMaskBase {
  gradientType: GradientMaskType.MULTI_STOP;
  /** Type of underlying gradient (linear or radial) */
  baseType: 'linear' | 'radial';
  config: LinearGradientConfig | RadialGradientConfig;
}

export type GradientMask = LinearGradientMask | RadialGradientMask | AngularGradientMask | MultiStopGradientMask;

// ==========================================
// MASK UNION TYPE
// ==========================================

export type Mask = ShapeMask | GradientMask | TrackMatte;

// ==========================================
// DEFAULT MASK VALUES
// ==========================================

export const DEFAULT_MASK_BASE: Omit<BaseMask, 'id'> = {
  enabled: true,
  inverted: false,
  edgeFeather: { ...DEFAULT_EDGE_FEATHER },
  expansion: 0,
  opacity: 1,
  compositeMode: MaskCompositeMode.ADD,
  locked: false,
  selected: false,
};

export const DEFAULT_RECTANGLE_MASK: Omit<RectangleMask, 'id'> = {
  ...DEFAULT_MASK_BASE,
  type: MaskType.SHAPE,
  shapeType: ShapeMaskType.RECTANGLE,
  x: 10,
  y: 10,
  width: 80,
  height: 80,
  cornerRadius: 0,
};

export const DEFAULT_ELLIPSE_MASK: Omit<EllipseMask, 'id'> = {
  ...DEFAULT_MASK_BASE,
  type: MaskType.SHAPE,
  shapeType: ShapeMaskType.ELLIPSE,
  centerX: 50,
  centerY: 50,
  radiusX: 40,
  radiusY: 40,
};

export const DEFAULT_POLYGON_MASK: Omit<PolygonMask, 'id'> = {
  ...DEFAULT_MASK_BASE,
  type: MaskType.SHAPE,
  shapeType: ShapeMaskType.POLYGON,
  points: [
    { x: 50, y: 10, pointType: 'corner' },
    { x: 90, y: 90, pointType: 'corner' },
    { x: 10, y: 90, pointType: 'corner' },
  ],
  closed: true,
  smooth: false,
  tension: 0.5,
};

export const DEFAULT_BEZIER_POLYGON_MASK: Omit<PolygonMask, 'id'> = {
  ...DEFAULT_MASK_BASE,
  type: MaskType.SHAPE,
  shapeType: ShapeMaskType.POLYGON,
  points: [
    { 
      x: 50, y: 10, 
      pointType: 'smooth',
      handleIn: { x: 30, y: 10 },
      handleOut: { x: 70, y: 10 },
    },
    { 
      x: 90, y: 90, 
      pointType: 'smooth',
      handleIn: { x: 90, y: 60 },
      handleOut: { x: 70, y: 90 },
    },
    { 
      x: 10, y: 90, 
      pointType: 'smooth',
      handleIn: { x: 30, y: 90 },
      handleOut: { x: 10, y: 60 },
    },
  ],
  closed: true,
  smooth: true,
  tension: 0.5,
};

export const DEFAULT_TRACK_MATTE: Omit<TrackMatte, 'id' | 'sourceOverlayId'> = {
  ...DEFAULT_MASK_BASE,
  type: MaskType.TRACK_MATTE,
  matteType: TrackMatteType.ALPHA,
};

// Default gradient stops (fade from visible to transparent)
export const DEFAULT_GRADIENT_STOPS: GradientStop[] = [
  { position: 0, opacity: 1 },
  { position: 1, opacity: 0 },
];

export const DEFAULT_LINEAR_GRADIENT_MASK: Omit<LinearGradientMask, 'id'> = {
  ...DEFAULT_MASK_BASE,
  type: MaskType.GRADIENT,
  gradientType: GradientMaskType.LINEAR,
  config: {
    angle: 90, // Top to bottom
    stops: [...DEFAULT_GRADIENT_STOPS],
  },
};

export const DEFAULT_RADIAL_GRADIENT_MASK: Omit<RadialGradientMask, 'id'> = {
  ...DEFAULT_MASK_BASE,
  type: MaskType.GRADIENT,
  gradientType: GradientMaskType.RADIAL,
  config: {
    centerX: 50,
    centerY: 50,
    radiusX: 50,
    radiusY: 50,
    stops: [...DEFAULT_GRADIENT_STOPS],
  },
};

export const DEFAULT_ANGULAR_GRADIENT_MASK: Omit<AngularGradientMask, 'id'> = {
  ...DEFAULT_MASK_BASE,
  type: MaskType.GRADIENT,
  gradientType: GradientMaskType.ANGULAR,
  config: {
    centerX: 50,
    centerY: 50,
    startAngle: 0,
    stops: [...DEFAULT_GRADIENT_STOPS],
  },
};

export const DEFAULT_MULTI_STOP_GRADIENT_MASK: Omit<MultiStopGradientMask, 'id'> = {
  ...DEFAULT_MASK_BASE,
  type: MaskType.GRADIENT,
  gradientType: GradientMaskType.MULTI_STOP,
  baseType: 'linear',
  config: {
    angle: 90,
    stops: [
      { position: 0, opacity: 1 },
      { position: 0.5, opacity: 0.5 },
      { position: 1, opacity: 0 },
    ],
  },
};

// ==========================================
// MASK METADATA
// ==========================================

export interface MaskMetadata {
  type: MaskType;
  shapeType?: ShapeMaskType;
  name: string;
  description: string;
  icon: string;
}

export const SHAPE_MASK_METADATA: Record<ShapeMaskType, MaskMetadata> = {
  [ShapeMaskType.RECTANGLE]: {
    type: MaskType.SHAPE,
    shapeType: ShapeMaskType.RECTANGLE,
    name: 'Rectangle Mask',
    description: 'Rectangular mask with optional rounded corners',
    icon: 'Square',
  },
  [ShapeMaskType.ELLIPSE]: {
    type: MaskType.SHAPE,
    shapeType: ShapeMaskType.ELLIPSE,
    name: 'Ellipse Mask',
    description: 'Elliptical or circular mask',
    icon: 'Circle',
  },
  [ShapeMaskType.POLYGON]: {
    type: MaskType.SHAPE,
    shapeType: ShapeMaskType.POLYGON,
    name: 'Polygon Mask',
    description: 'Custom shape mask with multiple points',
    icon: 'Pentagon',
  },
};

export interface GradientMaskMetadata {
  type: MaskType.GRADIENT;
  gradientType: GradientMaskType;
  name: string;
  description: string;
  icon: string;
}

export const GRADIENT_MASK_METADATA: Record<GradientMaskType, GradientMaskMetadata> = {
  [GradientMaskType.LINEAR]: {
    type: MaskType.GRADIENT,
    gradientType: GradientMaskType.LINEAR,
    name: 'Linear Gradient',
    description: 'Fade from one edge to another in a straight line',
    icon: 'ArrowRight',
  },
  [GradientMaskType.RADIAL]: {
    type: MaskType.GRADIENT,
    gradientType: GradientMaskType.RADIAL,
    name: 'Radial Gradient',
    description: 'Circular fade from center outward',
    icon: 'Target',
  },
  [GradientMaskType.ANGULAR]: {
    type: MaskType.GRADIENT,
    gradientType: GradientMaskType.ANGULAR,
    name: 'Angular Gradient',
    description: 'Sweep fade around a center point',
    icon: 'RotateCw',
  },
  [GradientMaskType.MULTI_STOP]: {
    type: MaskType.GRADIENT,
    gradientType: GradientMaskType.MULTI_STOP,
    name: 'Multi-Stop Gradient',
    description: 'Custom gradient with multiple opacity stops',
    icon: 'Sliders',
  },
};

export const TRACK_MATTE_METADATA: Record<TrackMatteType, { name: string; description: string }> = {
  [TrackMatteType.ALPHA]: {
    name: 'Alpha Matte',
    description: 'Uses the alpha channel of the source layer',
  },
  [TrackMatteType.LUMA]: {
    name: 'Luma Matte',
    description: 'Uses the brightness of the source layer',
  },
  [TrackMatteType.ALPHA_INVERTED]: {
    name: 'Alpha Matte (Inverted)',
    description: 'Uses the inverted alpha channel',
  },
  [TrackMatteType.LUMA_INVERTED]: {
    name: 'Luma Matte (Inverted)',
    description: 'Uses the inverted brightness',
  },
};

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

/**
 * Generates a unique mask ID
 */
export function generateMaskId(): string {
  return `mask-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Creates a new rectangle mask with default values
 */
/**
 * Creates a new rectangle mask with default values
 * @param aspectRatio - Optional video aspect ratio (width/height) for creating a true square
 */
export function createRectangleMask(aspectRatio?: number): RectangleMask {
  // For a visual square, height = width * aspectRatio
  const baseWidth = 80;
  const height = aspectRatio ? Math.min(100, baseWidth * aspectRatio) : baseWidth;
  // Center the rectangle
  const y = (100 - height) / 2;
  
  return {
    ...DEFAULT_RECTANGLE_MASK,
    id: generateMaskId(),
    y,
    height,
  };
}

/**
 * Creates a new ellipse mask with default values
 * @param aspectRatio - Optional video aspect ratio (width/height) for creating a true circle
 */
export function createEllipseMask(aspectRatio?: number): EllipseMask {
  const baseRadiusX = 40;
  // Adjust radiusY for aspect ratio to create a visual circle
  // radiusY = radiusX * (width/height) gives equal pixel radii
  const radiusY = aspectRatio ? Math.min(100, baseRadiusX * aspectRatio) : baseRadiusX;
  
  return {
    ...DEFAULT_ELLIPSE_MASK,
    id: generateMaskId(),
    radiusY, // Override with aspect-ratio-adjusted value
  };
}

/**
 * Creates a new polygon mask with default values
 */
export function createPolygonMask(smooth: boolean = false): PolygonMask {
  return {
    ...(smooth ? DEFAULT_BEZIER_POLYGON_MASK : DEFAULT_POLYGON_MASK),
    id: generateMaskId(),
  };
}

/**
 * Creates a bezier polygon mask (smooth curves)
 */
export function createBezierMask(): PolygonMask {
  return {
    ...DEFAULT_BEZIER_POLYGON_MASK,
    id: generateMaskId(),
  };
}

/**
 * Creates a new track matte with default values
 */
export function createTrackMatte(sourceOverlayId: number): TrackMatte {
  return {
    ...DEFAULT_TRACK_MATTE,
    id: generateMaskId(),
    sourceOverlayId,
  };
}

/**
 * Creates a new linear gradient mask
 */
export function createLinearGradientMask(angle: number = 90): LinearGradientMask {
  return {
    ...DEFAULT_LINEAR_GRADIENT_MASK,
    id: generateMaskId(),
    config: {
      ...DEFAULT_LINEAR_GRADIENT_MASK.config,
      angle,
    },
  };
}

/**
 * Creates a new radial gradient mask
 */
export function createRadialGradientMask(): RadialGradientMask {
  return {
    ...DEFAULT_RADIAL_GRADIENT_MASK,
    id: generateMaskId(),
  };
}

/**
 * Creates a new angular gradient mask
 */
export function createAngularGradientMask(): AngularGradientMask {
  return {
    ...DEFAULT_ANGULAR_GRADIENT_MASK,
    id: generateMaskId(),
  };
}

/**
 * Creates a new multi-stop gradient mask
 */
export function createMultiStopGradientMask(baseType: 'linear' | 'radial' = 'linear'): MultiStopGradientMask {
  return {
    ...DEFAULT_MULTI_STOP_GRADIENT_MASK,
    id: generateMaskId(),
    baseType,
  };
}

// ==========================================
// MIGRATION UTILITIES
// ==========================================

/**
 * Migrates old mask format (single feather) to new edge-based format
 * Preserves backward compatibility with existing masks
 */
export function migrateToEdgeFeather(mask: Mask): Mask {
  // If already has edgeFeather, return as-is
  if (mask.edgeFeather) return mask;
  
  // Convert old feather value to all edges
  const legacyFeather = (mask as any).feather ?? 0;
  const legacyMode = (mask as any).featherMode ?? FeatherMode.BOTH;
  
  return {
    ...mask,
    edgeFeather: {
      top: legacyFeather,
      right: legacyFeather,
      bottom: legacyFeather,
      left: legacyFeather,
      mode: legacyMode,
    },
  };
}

/**
 * Helper to set all edge feather values at once
 */
export function setAllEdgeFeather(value: number, mode: FeatherMode = FeatherMode.BOTH): EdgeFeather {
  return {
    top: value,
    right: value,
    bottom: value,
    left: value,
    mode,
  };
}

/**
 * Check if all edges have the same feather value
 */
export function hasUniformFeather(edgeFeather: EdgeFeather): boolean {
  return (
    edgeFeather.top === edgeFeather.right &&
    edgeFeather.right === edgeFeather.bottom &&
    edgeFeather.bottom === edgeFeather.left
  );
}

/**
 * Get maximum feather value from all edges (for rendering)
 */
export function getMaxEdgeFeather(edgeFeather: EdgeFeather): number {
  return Math.max(edgeFeather.top, edgeFeather.right, edgeFeather.bottom, edgeFeather.left);
}

/**
 * Converts a shape mask to CSS clip-path
 */
export function maskToClipPath(mask: ShapeMask): string {
  if (!mask.enabled) return 'none';

  switch (mask.shapeType) {
    case ShapeMaskType.RECTANGLE: {
      const { x, y, width, height, cornerRadius, inverted } = mask as RectangleMask;
      if (cornerRadius > 0) {
        // Use inset with border-radius
        const clipPath = `inset(${y}% ${100 - x - width}% ${100 - y - height}% ${x}% round ${cornerRadius}px)`;
        return inverted ? `polygon(evenodd, 0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${x}% ${y}%, ${x + width}% ${y}%, ${x + width}% ${y + height}%, ${x}% ${y + height}%)` : clipPath;
      }
      const clipPath = `inset(${y}% ${100 - x - width}% ${100 - y - height}% ${x}%)`;
      return inverted ? `polygon(evenodd, 0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${x}% ${y}%, ${x + width}% ${y}%, ${x + width}% ${y + height}%, ${x}% ${y + height}%)` : clipPath;
    }
    case ShapeMaskType.ELLIPSE: {
      const { centerX, centerY, radiusX, radiusY, inverted } = mask as EllipseMask;
      const clipPath = `ellipse(${radiusX}% ${radiusY}% at ${centerX}% ${centerY}%)`;
      // For inverted ellipse, we'd need SVG
      return inverted ? 'none' : clipPath;
    }
    case ShapeMaskType.POLYGON: {
      const { points, inverted } = mask as PolygonMask;
      const pointsStr = points.map(p => `${p.x}% ${p.y}%`).join(', ');
      const clipPath = `polygon(${pointsStr})`;
      return inverted ? 'none' : clipPath;
    }
    default:
      return 'none';
  }
}

/**
 * Generates CSS filter for mask feathering (blur)
 */
export function getMaskFeatherFilter(feather: number): string {
  if (feather <= 0) return '';
  return `blur(${feather}px)`;
}

// ==========================================
// BEZIER PATH UTILITIES
// ==========================================

/**
 * Converts bezier points to an SVG path string
 * Supports both smooth bezier curves and linear segments
 */
export function bezierPointsToSvgPath(
  points: BezierPoint[],
  closed: boolean = true,
  smooth: boolean = false
): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  const commands: string[] = [];
  
  // Move to first point
  commands.push(`M ${points[0].x} ${points[0].y}`);
  
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    
    if (smooth && (prev.handleOut || curr.handleIn)) {
      // Use cubic bezier curve
      const cp1x = prev.handleOut?.x ?? prev.x;
      const cp1y = prev.handleOut?.y ?? prev.y;
      const cp2x = curr.handleIn?.x ?? curr.x;
      const cp2y = curr.handleIn?.y ?? curr.y;
      
      commands.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${curr.x} ${curr.y}`);
    } else {
      // Use line segment
      commands.push(`L ${curr.x} ${curr.y}`);
    }
  }
  
  // Close the path if needed
  if (closed && points.length > 2) {
    const last = points[points.length - 1];
    const first = points[0];
    
    if (smooth && (last.handleOut || first.handleIn)) {
      const cp1x = last.handleOut?.x ?? last.x;
      const cp1y = last.handleOut?.y ?? last.y;
      const cp2x = first.handleIn?.x ?? first.x;
      const cp2y = first.handleIn?.y ?? first.y;
      
      commands.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${first.x} ${first.y}`);
    }
    
    commands.push('Z');
  }
  
  return commands.join(' ');
}

/**
 * Auto-generate smooth bezier handles for a point
 * Based on the positions of adjacent points
 */
export function autoGenerateHandles(
  point: BezierPoint,
  prevPoint: BezierPoint | null,
  nextPoint: BezierPoint | null,
  tension: number = 0.5
): BezierPoint {
  if (!prevPoint && !nextPoint) return point;
  
  const dx = (nextPoint?.x ?? point.x) - (prevPoint?.x ?? point.x);
  const dy = (nextPoint?.y ?? point.y) - (prevPoint?.y ?? point.y);
  const handleLength = Math.sqrt(dx * dx + dy * dy) * tension * 0.25;
  
  const angle = Math.atan2(dy, dx);
  
  return {
    ...point,
    pointType: 'smooth',
    handleIn: {
      x: point.x - Math.cos(angle) * handleLength,
      y: point.y - Math.sin(angle) * handleLength,
    },
    handleOut: {
      x: point.x + Math.cos(angle) * handleLength,
      y: point.y + Math.sin(angle) * handleLength,
    },
  };
}

/**
 * Convert simple points to bezier points with auto-generated handles
 */
export function simplePointsToBezier(
  points: SimplePoint[],
  tension: number = 0.5
): BezierPoint[] {
  return points.map((point, i) => {
    const prev = i > 0 ? points[i - 1] : null;
    const next = i < points.length - 1 ? points[i + 1] : null;
    
    const bezierPoint: BezierPoint = {
      x: point.x,
      y: point.y,
      pointType: 'smooth',
    };
    
    return autoGenerateHandles(
      bezierPoint,
      prev ? { x: prev.x, y: prev.y, pointType: 'smooth' } : null,
      next ? { x: next.x, y: next.y, pointType: 'smooth' } : null,
      tension
    );
  });
}

/**
 * Calculate the bounding box of a mask
 */
export function getMaskBounds(mask: ShapeMask): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
} {
  switch (mask.shapeType) {
    case ShapeMaskType.RECTANGLE: {
      const rect = mask as RectangleMask;
      return {
        minX: rect.x,
        minY: rect.y,
        maxX: rect.x + rect.width,
        maxY: rect.y + rect.height,
        width: rect.width,
        height: rect.height,
      };
    }
    case ShapeMaskType.ELLIPSE: {
      const ellipse = mask as EllipseMask;
      return {
        minX: ellipse.centerX - ellipse.radiusX,
        minY: ellipse.centerY - ellipse.radiusY,
        maxX: ellipse.centerX + ellipse.radiusX,
        maxY: ellipse.centerY + ellipse.radiusY,
        width: ellipse.radiusX * 2,
        height: ellipse.radiusY * 2,
      };
    }
    case ShapeMaskType.POLYGON: {
      const polygon = mask as PolygonMask;
      if (polygon.points.length === 0) {
        return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
      }
      
      let minX = polygon.points[0].x;
      let minY = polygon.points[0].y;
      let maxX = polygon.points[0].x;
      let maxY = polygon.points[0].y;
      
      for (const point of polygon.points) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
        
        // Include handles in bounds calculation
        if (point.handleIn) {
          minX = Math.min(minX, point.handleIn.x);
          minY = Math.min(minY, point.handleIn.y);
          maxX = Math.max(maxX, point.handleIn.x);
          maxY = Math.max(maxY, point.handleIn.y);
        }
        if (point.handleOut) {
          minX = Math.min(minX, point.handleOut.x);
          minY = Math.min(minY, point.handleOut.y);
          maxX = Math.max(maxX, point.handleOut.x);
          maxY = Math.max(maxY, point.handleOut.y);
        }
      }
      
      return {
        minX,
        minY,
        maxX,
        maxY,
        width: maxX - minX,
        height: maxY - minY,
      };
    }
    default:
      return { minX: 0, minY: 0, maxX: 100, maxY: 100, width: 100, height: 100 };
  }
}
