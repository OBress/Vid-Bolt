/**
 * Keyframe Animation System Types
 * 
 * Professional keyframe animation system similar to Adobe Premiere Pro and After Effects.
 * Supports animating any property over time with customizable interpolation curves.
 * 
 * TIME UNIT CONVENTION:
 * - Keyframe.time is stored in SECONDS (relative to layer/clip start)
 * - CompositionLayer.startTime and duration are in FRAMES (Remotion convention)
 * - Use framesToSeconds() and secondsToFrames() from time-conversion.ts for conversions
 * - AI generates keyframe times in FRAMES which are converted to SECONDS during parsing
 * 
 * Features:
 * - Per-clip keyframe storage
 * - Property path-based targeting (e.g., "transform.x", "opacity", "effects[0].blur.radius")
 * - Multiple interpolation types including custom bezier curves
 * - Preset easing functions
 */

// ============================================================
// INTERPOLATION TYPES
// ============================================================

/**
 * Built-in interpolation/easing types
 */
export type InterpolationType = 
  | 'linear'      // Constant rate of change
  | 'hold'        // Jump instantly to value (no interpolation)
  | 'bezier'      // Custom cubic bezier curve
  | 'ease-in'     // Slow start, fast end
  | 'ease-out'    // Fast start, slow end
  | 'ease-in-out' // Slow start and end
  | 'ease'        // Standard CSS ease
  // Additional professional presets
  | 'ease-in-quad'
  | 'ease-out-quad'
  | 'ease-in-out-quad'
  | 'ease-in-cubic'
  | 'ease-out-cubic'
  | 'ease-in-out-cubic'
  | 'ease-in-quart'
  | 'ease-out-quart'
  | 'ease-in-out-quart'
  | 'ease-in-expo'
  | 'ease-out-expo'
  | 'ease-in-out-expo'
  | 'ease-in-back'
  | 'ease-out-back'
  | 'ease-in-out-back'
  | 'ease-in-elastic'
  | 'ease-out-elastic'
  | 'ease-in-out-elastic'
  | 'ease-out-bounce';

/**
 * Bezier handle point for custom curves
 * Coordinates are normalized (0-1) relative to the keyframe segment
 */
export interface BezierHandle {
  /** X coordinate (time influence, 0-1) */
  x: number;
  /** Y coordinate (value influence, can exceed 0-1 for overshoot) */
  y: number;
}

/**
 * Bezier handles for a keyframe (in and out tangents)
 */
export interface BezierHandles {
  /** Incoming tangent (controls curve from previous keyframe) */
  in: BezierHandle;
  /** Outgoing tangent (controls curve to next keyframe) */
  out: BezierHandle;
}

/**
 * Keyframe interpolation configuration
 */
export interface KeyframeInterpolation {
  /** Type of interpolation */
  type: InterpolationType;
  /** 
   * Custom bezier handles (only used when type is 'bezier')
   * If not provided for 'bezier' type, defaults to linear
   */
  bezierHandles?: BezierHandles;
}

// ============================================================
// KEYFRAME TYPES
// ============================================================

/**
 * Supported keyframe value types
 * - number: Single numeric value (opacity, scale, rotation, etc.)
 * - number[]: Array of numbers (position [x, y], color [r, g, b], etc.)
 * - string: String value (color hex, etc.)
 */
export type KeyframeValue = number | number[] | string;

/**
 * Single keyframe - a value at a specific point in time
 */
export interface Keyframe {
  /** Unique identifier for this keyframe */
  id: string;
  
  /** 
   * Time position in seconds, relative to clip start
   * 0 = clip start, duration = clip end
   */
  time: number;
  
  /** The value at this keyframe */
  value: KeyframeValue;
  
  /** How to interpolate from this keyframe to the next */
  interpolation: KeyframeInterpolation;
  
  /** Whether this keyframe is selected in the UI */
  selected?: boolean;
}

/**
 * Collection of keyframes for a single property
 */
export interface PropertyKeyframes {
  /** 
   * Property path using dot notation
   * Examples:
   * - "transform.x" - X position
   * - "transform.y" - Y position
   * - "transform.scale" - Uniform scale
   * - "transform.rotation" - Rotation in degrees
   * - "opacity" - Clip opacity
   * - "effects[0].blur.radius" - First blur effect's radius
   * - "masks[0].feather" - First mask's feather amount
   * - "styles.filter.brightness" - Brightness filter
   */
  propertyPath: string;
  
  /** Whether keyframing is enabled for this property (stopwatch active) */
  enabled: boolean;
  
  /** Array of keyframes, sorted by time */
  keyframes: Keyframe[];
}

/**
 * All keyframes for a clip, organized by property
 */
export type ClipKeyframes = PropertyKeyframes[];

// ============================================================
// KEYFRAME SELECTION STATE
// ============================================================

/**
 * Currently selected keyframes in the UI
 */
export interface KeyframeSelection {
  /** Clip ID containing the selected keyframes */
  clipId: string;
  /** Property path of selected keyframes */
  propertyPath: string;
  /** Array of selected keyframe IDs */
  keyframeIds: string[];
}

// ============================================================
// KEYFRAME CLIPBOARD
// ============================================================

/**
 * Keyframes stored in clipboard for copy/paste operations
 */
export interface KeyframeClipboard {
  /** Source clip ID */
  sourceClipId: string;
  /** Source property path */
  sourcePropertyPath: string;
  /** Copied keyframes (with times normalized to start from 0) */
  keyframes: Keyframe[];
  /** Time offset of first keyframe (for paste positioning) */
  timeOffset: number;
}

// ============================================================
// ANIMATABLE PROPERTY METADATA
// ============================================================

/**
 * Metadata about an animatable property
 */
export interface AnimatablePropertyMetadata {
  /** Property path */
  path: string;
  /** Display name */
  name: string;
  /** Short label for compact display */
  label?: string;
  /** Property category */
  category: 'transform' | 'opacity' | 'effects' | 'masks' | 'style' | 'media' | 'audio';
  /** Value type */
  valueType: 'number' | 'number[]' | 'string';
  /** Minimum value (for numeric) */
  min?: number;
  /** Maximum value (for numeric) */
  max?: number;
  /** Default value */
  defaultValue: KeyframeValue;
  /** Unit for display (%, px, °, etc.) */
  unit?: string;
  /** Color for keyframe markers in timeline */
  color: string;
}

/**
 * Standard animatable properties available on all visual clips
 */
export const STANDARD_ANIMATABLE_PROPERTIES: AnimatablePropertyMetadata[] = [
  // Transform properties
  {
    path: 'transform.x',
    name: 'Position X',
    category: 'transform',
    valueType: 'number',
    defaultValue: 0,
    unit: 'px',
    color: '#EF4444', // Red
  },
  {
    path: 'transform.y',
    name: 'Position Y',
    category: 'transform',
    valueType: 'number',
    defaultValue: 0,
    unit: 'px',
    color: '#22C55E', // Green
  },
  {
    path: 'transform.width',
    name: 'Width',
    category: 'transform',
    valueType: 'number',
    min: 1,
    defaultValue: 100,
    unit: 'px',
    color: '#3B82F6', // Blue
  },
  {
    path: 'transform.height',
    name: 'Height',
    category: 'transform',
    valueType: 'number',
    min: 1,
    defaultValue: 100,
    unit: 'px',
    color: '#3B82F6', // Blue
  },
  {
    path: 'transform.scale',
    name: 'Scale',
    category: 'transform',
    valueType: 'number',
    min: 0.01,
    max: 10,
    defaultValue: 1,
    unit: '%',
    color: '#8B5CF6', // Purple
  },
  {
    path: 'transform.rotation',
    name: 'Rotation',
    category: 'transform',
    valueType: 'number',
    defaultValue: 0,
    unit: '°',
    color: '#F59E0B', // Amber
  },
  // Opacity
  {
    path: 'transform.opacity',
    name: 'Opacity',
    category: 'opacity',
    valueType: 'number',
    min: 0,
    max: 1,
    defaultValue: 1,
    unit: '%',
    color: '#6366F1', // Indigo
  },
];

/**
 * Audio-specific animatable properties
 * These can be animated on audio clips and audio effects
 */
export const AUDIO_ANIMATABLE_PROPERTIES: AnimatablePropertyMetadata[] = [
  // Volume
  {
    path: 'volume',
    name: 'Volume',
    category: 'audio',
    valueType: 'number',
    min: 0,
    max: 2,
    defaultValue: 1,
    unit: '%',
    color: '#22C55E', // Green
  },
  {
    path: 'styles.volumeDb',
    name: 'Volume (dB)',
    category: 'audio',
    valueType: 'number',
    min: -60,
    max: 12,
    defaultValue: 0,
    unit: 'dB',
    color: '#22C55E', // Green
  },
];

/**
 * Get animatable properties for audio effect parameters
 * Returns property paths for a specific effect type at a given index
 */
export function getAudioEffectAnimatableProperties(
  effectType: string,
  effectIndex: number
): AnimatablePropertyMetadata[] {
  const baseColors: Record<string, string> = {
    parametricEQ: '#3B82F6', // Blue
    compressor: '#EF4444', // Red
    reverb: '#8B5CF6', // Purple
    delay: '#F59E0B', // Amber
    chorus: '#EC4899', // Pink
    distortion: '#F97316', // Orange
    gain: '#22C55E', // Green
    noiseGate: '#6366F1', // Indigo
    limiter: '#14B8A6', // Teal
    stereoEnhancer: '#84CC16', // Lime
  };
  
  const color = baseColors[effectType] || '#6B7280';
  const prefix = `audioEffects[${effectIndex}]`;
  
  const propertyMap: Record<string, Array<{ path: string; name: string; min?: number; max?: number; unit?: string }>> = {
    parametricEQ: [
      { path: 'outputGain', name: 'Output Gain', min: -24, max: 24, unit: 'dB' },
    ],
    compressor: [
      { path: 'threshold', name: 'Threshold', min: -60, max: 0, unit: 'dB' },
      { path: 'ratio', name: 'Ratio', min: 1, max: 20 },
      { path: 'attack', name: 'Attack', min: 0.1, max: 1000, unit: 'ms' },
      { path: 'release', name: 'Release', min: 10, max: 3000, unit: 'ms' },
      { path: 'makeupGain', name: 'Makeup Gain', min: 0, max: 24, unit: 'dB' },
    ],
    noiseGate: [
      { path: 'threshold', name: 'Threshold', min: -80, max: 0, unit: 'dB' },
      { path: 'attack', name: 'Attack', min: 0.1, max: 100, unit: 'ms' },
      { path: 'hold', name: 'Hold', min: 0, max: 500, unit: 'ms' },
      { path: 'release', name: 'Release', min: 10, max: 1000, unit: 'ms' },
    ],
    limiter: [
      { path: 'ceiling', name: 'Ceiling', min: -12, max: 0, unit: 'dB' },
      { path: 'release', name: 'Release', min: 10, max: 1000, unit: 'ms' },
    ],
    reverb: [
      { path: 'decay', name: 'Decay', min: 0.1, max: 10, unit: 's' },
      { path: 'preDelay', name: 'Pre-Delay', min: 0, max: 200, unit: 'ms' },
      { path: 'damping', name: 'Damping', min: 0, max: 100, unit: '%' },
      { path: 'mix', name: 'Mix', min: 0, max: 100, unit: '%' },
    ],
    delay: [
      { path: 'delayTime', name: 'Delay Time', min: 1, max: 2000, unit: 'ms' },
      { path: 'feedback', name: 'Feedback', min: 0, max: 95, unit: '%' },
      { path: 'mix', name: 'Mix', min: 0, max: 100, unit: '%' },
    ],
    chorus: [
      { path: 'rate', name: 'Rate', min: 0.1, max: 10, unit: 'Hz' },
      { path: 'depth', name: 'Depth', min: 0, max: 100, unit: '%' },
      { path: 'mix', name: 'Mix', min: 0, max: 100, unit: '%' },
    ],
    distortion: [
      { path: 'drive', name: 'Drive', min: 0, max: 100, unit: '%' },
      { path: 'tone', name: 'Tone', min: -100, max: 100 },
      { path: 'output', name: 'Output', min: -24, max: 0, unit: 'dB' },
    ],
    gain: [
      { path: 'gain', name: 'Gain', min: -60, max: 24, unit: 'dB' },
    ],
    stereoEnhancer: [
      { path: 'width', name: 'Width', min: 0, max: 200, unit: '%' },
      { path: 'midLevel', name: 'Mid Level', min: -24, max: 24, unit: 'dB' },
      { path: 'sideLevel', name: 'Side Level', min: -24, max: 24, unit: 'dB' },
    ],
  };
  
  const props = propertyMap[effectType] || [];
  
  return props.map(prop => ({
    path: `${prefix}.${prop.path}`,
    name: prop.name,
    category: 'audio' as const,
    valueType: 'number' as const,
    min: prop.min,
    max: prop.max,
    defaultValue: prop.min ?? 0,
    unit: prop.unit,
    color,
  }));
}

// ============================================================
// DEFAULT VALUES
// ============================================================

/**
 * Default interpolation (linear)
 */
export const DEFAULT_INTERPOLATION: KeyframeInterpolation = {
  type: 'linear',
};

/**
 * Default bezier handles (creates a linear curve)
 */
export const DEFAULT_BEZIER_HANDLES: BezierHandles = {
  in: { x: 0.33, y: 0.33 },
  out: { x: 0.67, y: 0.67 },
};

/**
 * Ease-in bezier handles
 */
export const EASE_IN_HANDLES: BezierHandles = {
  in: { x: 0, y: 0 },
  out: { x: 0.42, y: 0 },
};

/**
 * Ease-out bezier handles
 */
export const EASE_OUT_HANDLES: BezierHandles = {
  in: { x: 0.58, y: 1 },
  out: { x: 1, y: 1 },
};

/**
 * Ease-in-out bezier handles
 */
export const EASE_IN_OUT_HANDLES: BezierHandles = {
  in: { x: 0.42, y: 0 },
  out: { x: 0.58, y: 1 },
};

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Generate a unique keyframe ID
 */
export function generateKeyframeId(): string {
  return `kf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a new keyframe with default values
 */
export function createKeyframe(
  time: number,
  value: KeyframeValue,
  interpolation: KeyframeInterpolation = DEFAULT_INTERPOLATION
): Keyframe {
  return {
    id: generateKeyframeId(),
    time,
    value,
    interpolation,
    selected: false,
  };
}

/**
 * Create a new property keyframes collection
 */
export function createPropertyKeyframes(propertyPath: string): PropertyKeyframes {
  return {
    propertyPath,
    enabled: true,
    keyframes: [],
  };
}

/**
 * Find keyframes surrounding a given time
 * Returns [previous, next] keyframes, either can be null if at boundaries
 */
export function findSurroundingKeyframes(
  keyframes: Keyframe[],
  time: number
): [Keyframe | null, Keyframe | null] {
  if (keyframes.length === 0) {
    return [null, null];
  }
  
  // Keyframes should be sorted by time
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);
  
  let prev: Keyframe | null = null;
  let next: Keyframe | null = null;
  
  for (const kf of sorted) {
    if (kf.time <= time) {
      prev = kf;
    } else if (kf.time > time && !next) {
      next = kf;
      break;
    }
  }
  
  return [prev, next];
}

/**
 * Check if a time has an exact keyframe
 */
export function hasKeyframeAtTime(
  keyframes: Keyframe[],
  time: number,
  tolerance: number = 0.001
): boolean {
  return keyframes.some(kf => Math.abs(kf.time - time) < tolerance);
}

/**
 * Get keyframe at exact time (within tolerance)
 */
export function getKeyframeAtTime(
  keyframes: Keyframe[],
  time: number,
  tolerance: number = 0.001
): Keyframe | null {
  return keyframes.find(kf => Math.abs(kf.time - time) < tolerance) || null;
}

/**
 * Sort keyframes by time
 */
export function sortKeyframes(keyframes: Keyframe[]): Keyframe[] {
  return [...keyframes].sort((a, b) => a.time - b.time);
}

/**
 * Get the value at a property path from an object
 */
export function getValueAtPath(obj: any, path: string): any {
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let current = obj;
  
  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[part];
  }
  
  return current;
}

/**
 * Set a value at a property path in an object (returns new object)
 */
export function setValueAtPath(obj: any, path: string, value: any): any {
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  const result = JSON.parse(JSON.stringify(obj)); // Deep clone
  
  let current = result;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (current[part] === undefined) {
      // Create object or array based on next part
      current[part] = /^\d+$/.test(parts[i + 1]) ? [] : {};
    }
    current = current[part];
  }
  
  current[parts[parts.length - 1]] = value;
  return result;
}

/**
 * Get interpolation preset bezier handles
 */
export function getPresetBezierHandles(type: InterpolationType): BezierHandles | null {
  switch (type) {
    case 'linear':
      return DEFAULT_BEZIER_HANDLES;
    case 'ease-in':
    case 'ease-in-quad':
      return { in: { x: 0, y: 0 }, out: { x: 0.55, y: 0.085 } };
    case 'ease-out':
    case 'ease-out-quad':
      return { in: { x: 0.25, y: 0.46 }, out: { x: 0.45, y: 0.94 } };
    case 'ease-in-out':
    case 'ease-in-out-quad':
      return { in: { x: 0.455, y: 0.03 }, out: { x: 0.515, y: 0.955 } };
    case 'ease':
      return { in: { x: 0.25, y: 0.1 }, out: { x: 0.25, y: 1 } };
    case 'ease-in-cubic':
      return { in: { x: 0, y: 0 }, out: { x: 0.55, y: 0.055 } };
    case 'ease-out-cubic':
      return { in: { x: 0.215, y: 0.61 }, out: { x: 0.355, y: 1 } };
    case 'ease-in-out-cubic':
      return { in: { x: 0.645, y: 0.045 }, out: { x: 0.355, y: 1 } };
    case 'ease-in-quart':
      return { in: { x: 0, y: 0 }, out: { x: 0.895, y: 0.03 } };
    case 'ease-out-quart':
      return { in: { x: 0.165, y: 0.84 }, out: { x: 0.44, y: 1 } };
    case 'ease-in-out-quart':
      return { in: { x: 0.77, y: 0 }, out: { x: 0.175, y: 1 } };
    case 'ease-in-expo':
      return { in: { x: 0, y: 0 }, out: { x: 0.95, y: 0.05 } };
    case 'ease-out-expo':
      return { in: { x: 0.19, y: 1 }, out: { x: 0.22, y: 1 } };
    case 'ease-in-out-expo':
      return { in: { x: 1, y: 0 }, out: { x: 0, y: 1 } };
    case 'ease-in-back':
      return { in: { x: 0, y: 0 }, out: { x: 0.6, y: -0.28 } };
    case 'ease-out-back':
      return { in: { x: 0.175, y: 0.885 }, out: { x: 0.32, y: 1.275 } };
    case 'ease-in-out-back':
      return { in: { x: 0.68, y: -0.55 }, out: { x: 0.265, y: 1.55 } };
    // Elastic and bounce - approximations for preview (actual animation uses Remotion's functions)
    case 'ease-out-bounce':
      return { in: { x: 0.215, y: 0.61 }, out: { x: 0.355, y: 1 } }; // Shows final settle
    case 'ease-in-elastic':
      return { in: { x: 0.5, y: -0.5 }, out: { x: 0.75, y: 0.5 } }; // Shows spring tension
    case 'ease-out-elastic':
      return { in: { x: 0.25, y: 1.5 }, out: { x: 0.5, y: 1 } }; // Shows overshoot
    case 'ease-in-out-elastic':
      return { in: { x: 0.5, y: -0.3 }, out: { x: 0.5, y: 1.3 } }; // Shows both ends
    case 'hold':
    case 'bezier':
    default:
      return null;
  }
}

/**
 * Check if interpolation type uses bezier curves
 */
export function usesBezierCurve(type: InterpolationType): boolean {
  return type !== 'hold';
}
