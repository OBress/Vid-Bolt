/**
 * Effects System Types
 * 
 * Defines the type system for stackable, pre-built effects that can be applied
 * to visual overlays (video, image, text, shapes).
 * 
 * Based on Premiere Pro's Effect Controls panel architecture:
 * - Each clip has built-in effects (Motion, Opacity)
 * - Additional effects can be added and reordered
 * - Each effect can have its own masks (masks are per-effect, not per-clip)
 * - Effects are applied in order with their masks constraining the effect area
 */

import { Mask } from './masks';

// ==========================================
// EFFECT TYPE ENUM
// ==========================================

export enum EffectType {
  // Built-in effects (like Premiere Pro's fixed effects)
  MOTION = 'motion',           // Position, Scale, Rotation, Anchor Point
  OPACITY = 'opacity',         // Clip opacity with mask support
  
  // Video effects
  BLUR = 'blur',
  DROP_SHADOW = 'dropShadow',
  GLOW = 'glow',
  VIGNETTE = 'vignette',
  SHARPEN = 'sharpen',
  NOISE = 'noise',
  
  // Stylize effects
  GRAYSCALE = 'grayscale',
  SEPIA = 'sepia',
  INVERT = 'invert',
}

// ==========================================
// BASE EFFECT INTERFACE
// ==========================================

export interface BaseEffect {
  /** Unique identifier for this effect instance */
  id: string;
  /** Type of effect */
  type: EffectType;
  /** Whether this effect is currently enabled */
  enabled: boolean;
  /** Order in the effect stack (lower = applied first) */
  order: number;
  /** Display name for this effect instance */
  name?: string;
  /** Whether this effect is expanded in the UI */
  expanded?: boolean;
  /** 
   * Masks attached to this effect (Premiere Pro style)
   * Masks constrain where the effect is applied
   */
  masks?: Mask[];
}

// ==========================================
// BUILT-IN EFFECTS (Always present, like Premiere Pro)
// ==========================================

/**
 * Motion effect - controls position, scale, rotation, anchor point
 * This is a built-in effect that every visual overlay has
 */
export interface MotionEffect extends BaseEffect {
  type: EffectType.MOTION;
  /** Position X (pixels from left) */
  positionX: number;
  /** Position Y (pixels from top) */
  positionY: number;
  /** Scale as percentage (100 = original size) */
  scale: number;
  /** Uniform scale - when true, scaleX and scaleY are linked */
  uniformScale: boolean;
  /** Scale X as percentage (only used when uniformScale is false) */
  scaleX: number;
  /** Scale Y as percentage (only used when uniformScale is false) */
  scaleY: number;
  /** Rotation in degrees */
  rotation: number;
  /** Anchor point X as percentage of width */
  anchorX: number;
  /** Anchor point Y as percentage of height */
  anchorY: number;
  /** Anti-flicker filter (for interlaced footage) */
  antiFlicker: number;
}

/**
 * Opacity effect - controls clip visibility with mask support
 * This is a built-in effect that every visual overlay has
 */
export interface OpacityEffect extends BaseEffect {
  type: EffectType.OPACITY;
  /** Opacity value (0-100) */
  opacity: number;
  /** Blend mode */
  blendMode: 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'colorDodge' | 'colorBurn' | 'hardLight' | 'softLight' | 'difference' | 'exclusion';
}

// ==========================================
// INDIVIDUAL EFFECT TYPES
// ==========================================

export interface BlurEffect extends BaseEffect {
  type: EffectType.BLUR;
  /** Blur radius in pixels (0-100) */
  radius: number;
  /** Blur direction: both, horizontal, vertical */
  direction?: 'both' | 'horizontal' | 'vertical';
}

export interface DropShadowEffect extends BaseEffect {
  type: EffectType.DROP_SHADOW;
  /** Horizontal offset in pixels */
  offsetX: number;
  /** Vertical offset in pixels */
  offsetY: number;
  /** Blur radius in pixels */
  blur: number;
  /** Spread radius in pixels */
  spread: number;
  /** Shadow color (hex or rgba) */
  color: string;
  /** Shadow opacity (0-1) */
  opacity: number;
}

export interface GlowEffect extends BaseEffect {
  type: EffectType.GLOW;
  /** Glow radius/spread in pixels */
  radius: number;
  /** Glow color */
  color: string;
  /** Glow intensity (0-1) */
  intensity: number;
}

export interface VignetteEffect extends BaseEffect {
  type: EffectType.VIGNETTE;
  /** Size of the vignette (0-100, higher = larger visible area) */
  size: number;
  /** Feather/softness of the vignette edge (0-100) */
  feather: number;
  /** Vignette color */
  color: string;
  /** Roundness of the vignette (0 = rectangular, 100 = circular) */
  roundness: number;
}

export interface SharpenEffect extends BaseEffect {
  type: EffectType.SHARPEN;
  /** Sharpening amount (0-100) */
  amount: number;
}

export interface NoiseEffect extends BaseEffect {
  type: EffectType.NOISE;
  /** Noise amount/intensity (0-100) */
  amount: number;
  /** Whether noise is monochrome or colored */
  monochrome: boolean;
}

// Stylize effects
export interface GrayscaleEffect extends BaseEffect {
  type: EffectType.GRAYSCALE;
  /** Grayscale amount (0-100) */
  amount: number;
}

export interface SepiaEffect extends BaseEffect {
  type: EffectType.SEPIA;
  /** Sepia amount (0-100) */
  amount: number;
}

export interface InvertEffect extends BaseEffect {
  type: EffectType.INVERT;
  /** Invert amount (0-100) */
  amount: number;
}

// ==========================================
// EFFECT UNION TYPE
// ==========================================

export type Effect =
  // Built-in effects
  | MotionEffect
  | OpacityEffect
  // Standard effects
  | BlurEffect
  | DropShadowEffect
  | GlowEffect
  | VignetteEffect
  | SharpenEffect
  | NoiseEffect
  // Stylize effects
  | GrayscaleEffect
  | SepiaEffect
  | InvertEffect;

// ==========================================
// EFFECT DEFAULTS
// ==========================================

export const DEFAULT_EFFECT_VALUES: Record<EffectType, Omit<Effect, 'id' | 'order'>> = {
  // Built-in effects
  [EffectType.MOTION]: {
    type: EffectType.MOTION,
    enabled: true,
    positionX: 0,
    positionY: 0,
    scale: 100,
    uniformScale: true,
    scaleX: 100,
    scaleY: 100,
    rotation: 0,
    anchorX: 50,
    anchorY: 50,
    antiFlicker: 0,
  },
  [EffectType.OPACITY]: {
    type: EffectType.OPACITY,
    enabled: true,
    opacity: 100,
    blendMode: 'normal',
  },
  // Standard effects
  [EffectType.BLUR]: {
    type: EffectType.BLUR,
    enabled: true,
    radius: 5,
    direction: 'both',
  },
  [EffectType.DROP_SHADOW]: {
    type: EffectType.DROP_SHADOW,
    enabled: true,
    offsetX: 4,
    offsetY: 4,
    blur: 8,
    spread: 0,
    color: '#000000',
    opacity: 0.5,
  },
  [EffectType.GLOW]: {
    type: EffectType.GLOW,
    enabled: true,
    radius: 10,
    color: '#ffffff',
    intensity: 0.5,
  },
  [EffectType.VIGNETTE]: {
    type: EffectType.VIGNETTE,
    enabled: true,
    size: 50,
    feather: 50,
    color: '#000000',
    roundness: 50,
  },
  [EffectType.SHARPEN]: {
    type: EffectType.SHARPEN,
    enabled: true,
    amount: 25,
  },
  [EffectType.NOISE]: {
    type: EffectType.NOISE,
    enabled: true,
    amount: 10,
    monochrome: true,
  },
  // Stylize effects
  [EffectType.GRAYSCALE]: {
    type: EffectType.GRAYSCALE,
    enabled: true,
    amount: 0,
  },
  [EffectType.SEPIA]: {
    type: EffectType.SEPIA,
    enabled: true,
    amount: 0,
  },
  [EffectType.INVERT]: {
    type: EffectType.INVERT,
    enabled: true,
    amount: 0,
  },
};

// ==========================================
// EFFECT METADATA
// ==========================================

export interface EffectMetadata {
  type: EffectType;
  name: string;
  description: string;
  icon: string; // Lucide icon name
  category: 'builtin' | 'blur' | 'shadow' | 'color' | 'distort' | 'adjustment';
  /** Whether this is a built-in effect that every clip has */
  isBuiltIn?: boolean;
}

export const EFFECT_METADATA: Record<EffectType, EffectMetadata> = {
  // Built-in effects (like Premiere Pro)
  [EffectType.MOTION]: {
    type: EffectType.MOTION,
    name: 'Motion',
    description: 'Position, scale, rotation, and anchor point',
    icon: 'Move',
    category: 'builtin',
    isBuiltIn: true,
  },
  [EffectType.OPACITY]: {
    type: EffectType.OPACITY,
    name: 'Opacity',
    description: 'Clip transparency and blend mode with mask support',
    icon: 'Eye',
    category: 'builtin',
    isBuiltIn: true,
  },
  // Standard effects
  [EffectType.BLUR]: {
    type: EffectType.BLUR,
    name: 'Gaussian Blur',
    description: 'Softens the image with a blur effect',
    icon: 'Circle',
    category: 'blur',
  },
  [EffectType.DROP_SHADOW]: {
    type: EffectType.DROP_SHADOW,
    name: 'Drop Shadow',
    description: 'Adds a shadow behind the element',
    icon: 'Square',
    category: 'shadow',
  },
  [EffectType.GLOW]: {
    type: EffectType.GLOW,
    name: 'Outer Glow',
    description: 'Adds a glowing effect around the element',
    icon: 'Sun',
    category: 'shadow',
  },
  [EffectType.VIGNETTE]: {
    type: EffectType.VIGNETTE,
    name: 'Vignette',
    description: 'Darkens the edges of the frame',
    icon: 'Aperture',
    category: 'color',
  },
  [EffectType.SHARPEN]: {
    type: EffectType.SHARPEN,
    name: 'Sharpen',
    description: 'Increases edge definition and clarity',
    icon: 'Triangle',
    category: 'distort',
  },
  [EffectType.NOISE]: {
    type: EffectType.NOISE,
    name: 'Noise/Grain',
    description: 'Adds film grain or noise texture',
    icon: 'Sparkles',
    category: 'distort',
  },
  // Stylize effects
  [EffectType.GRAYSCALE]: {
    type: EffectType.GRAYSCALE,
    name: 'Black & White',
    description: 'Convert to grayscale',
    icon: 'ImageOff',
    category: 'adjustment',
  },
  [EffectType.SEPIA]: {
    type: EffectType.SEPIA,
    name: 'Sepia',
    description: 'Apply vintage sepia tone',
    icon: 'Sticker',
    category: 'adjustment',
  },
  [EffectType.INVERT]: {
    type: EffectType.INVERT,
    name: 'Invert',
    description: 'Invert all colors',
    icon: 'RefreshCw',
    category: 'adjustment',
  },
};

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

/**
 * Creates a new effect with default values
 */
export function createEffect(type: EffectType, order: number): Effect {
  const defaults = DEFAULT_EFFECT_VALUES[type];
  return {
    ...defaults,
    id: `effect-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    order,
    expanded: false,
    masks: [],
  } as Effect;
}

/**
 * Generates a unique effect ID
 */
export function generateEffectId(): string {
  return `effect-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Creates the built-in effects that every clip should have (like Premiere Pro)
 * Returns Motion and Opacity effects
 */
export function createBuiltInEffects(): Effect[] {
  return [
    createEffect(EffectType.MOTION, 0),
    createEffect(EffectType.OPACITY, 1),
  ];
}

/**
 * Gets the list of addable effects (excludes built-in effects)
 */
export function getAddableEffectTypes(): EffectType[] {
  return Object.values(EffectType).filter(
    type => !EFFECT_METADATA[type]?.isBuiltIn
  );
}

/**
 * Checks if an effect type is a built-in effect
 */
export function isBuiltInEffect(type: EffectType): boolean {
  return EFFECT_METADATA[type]?.isBuiltIn === true;
}
