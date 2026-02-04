import { 
  Effect, 
  EffectType, 
  BlurEffect, 
  GrayscaleEffect, 
  SepiaEffect, 
  InvertEffect, 
  DropShadowEffect, 
  GlowEffect,
  VignetteEffect, 
  SharpenEffect, 
  NoiseEffect,
  OpacityEffect,
  MotionEffect
} from "../types/effects";

// ==========================================
// BLEND MODE NORMALIZATION
// ==========================================

/**
 * All CSS blend modes supported by major browsers
 * Used for validation and fallback handling
 */
export const CSS_BLEND_MODES = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
] as const;

export type CSSBlendMode = typeof CSS_BLEND_MODES[number];

/**
 * Map of effect blend modes to CSS blend modes (handling camelCase to kebab-case)
 */
const BLEND_MODE_CSS_MAP: Record<string, CSSBlendMode> = {
  'normal': 'normal',
  'multiply': 'multiply',
  'screen': 'screen',
  'overlay': 'overlay',
  'darken': 'darken',
  'lighten': 'lighten',
  'colorDodge': 'color-dodge',
  'color-dodge': 'color-dodge',
  'colorBurn': 'color-burn',
  'color-burn': 'color-burn',
  'hardLight': 'hard-light',
  'hard-light': 'hard-light',
  'softLight': 'soft-light',
  'soft-light': 'soft-light',
  'difference': 'difference',
  'exclusion': 'exclusion',
  'hue': 'hue',
  'saturation': 'saturation',
  'color': 'color',
  'luminosity': 'luminosity',
};

/**
 * Normalizes a blend mode value to a valid CSS blend mode
 * Handles:
 * - camelCase to kebab-case conversion
 * - Fallback for unsupported/invalid modes
 * - Consistent behavior across preview and render
 * 
 * @param blendMode - The blend mode value from overlay/effect
 * @param fallback - Fallback mode if invalid (defaults to 'normal')
 * @returns Valid CSS blend mode
 */
export function normalizeBlendMode(blendMode: string | undefined, fallback: CSSBlendMode = 'normal'): CSSBlendMode {
  if (!blendMode) return fallback;
  
  const normalized = BLEND_MODE_CSS_MAP[blendMode];
  if (normalized) return normalized;
  
  // Check if it's already a valid CSS blend mode
  if (CSS_BLEND_MODES.includes(blendMode as CSSBlendMode)) {
    return blendMode as CSSBlendMode;
  }
  
  // Unknown blend mode - log warning and use fallback
  console.warn(`[effect-renderer] Unknown blend mode "${blendMode}", falling back to "${fallback}"`);
  return fallback;
}

/**
 * Creates safe mix-blend-mode CSS with feature detection fallback
 * Some browsers may not support all blend modes, this provides graceful degradation
 * 
 * @param blendMode - The requested blend mode
 * @returns CSS properties object with blend mode and fallback
 */
export function safeBlendModeCSS(blendMode: string | undefined): React.CSSProperties {
  const normalized = normalizeBlendMode(blendMode);
  
  if (normalized === 'normal') {
    return {};
  }
  
  return {
    mixBlendMode: normalized,
    // Isolation context ensures blend mode applies correctly within nested elements
    isolation: 'isolate' as const,
  };
}

/**
 * Premiere Pro-style Effect Rendering
 * 
 * In Premiere Pro, effects are applied in order with each effect optionally
 * having its own mask. The mask constrains WHERE the effect is applied.
 * 
 * Rendering pipeline:
 * 1. For each effect in order:
 *    a. Apply the effect to the entire clip
 *    b. If the effect has masks, composite the affected area only within mask bounds
 * 2. Built-in effects (Motion, Opacity) are processed first
 * 
 * Effect types:
 * - CSS Filter Effects: blur, brightness, contrast, saturation, hue, grayscale, sepia, invert, drop-shadow
 * - Overlay Effects: vignette (rendered as overlay div)
 * - Canvas Effects: sharpen, noise, glow (require canvas processing)
 */

/**
 * Converts an effect stack to a CSS filter string
 * Note: This is a simplified implementation. True per-effect masking requires
 * multiple render passes or SVG filters for accurate Premiere Pro behavior.
 * @param effects Array of effects to apply (in order)
 * @returns CSS filter string
 */
export function effectsToFilter(effects: Effect[] | undefined): string {
  if (!effects || effects.length === 0) return "";

  // Only apply enabled effects, sorted by order
  // Skip built-in Motion/Opacity effects as they're handled separately
  const enabledEffects = effects
    .filter(e => e.enabled && e.type !== EffectType.MOTION && e.type !== EffectType.OPACITY)
    .sort((a, b) => a.order - b.order);

  if (enabledEffects.length === 0) return "";

  const filterParts: string[] = [];

  for (const effect of enabledEffects) {
    // Note: Per-effect masks would require separate rendering layers
    // For now, we apply filters globally. A full implementation would need
    // SVG filters or canvas compositing for true Premiere Pro behavior.
    const effectFilter = effectToFilter(effect);
    if (effectFilter) {
      filterParts.push(effectFilter);
    }
  }

  return filterParts.join(" ");
}

/**
 * Converts a single effect to its CSS filter equivalent
 */
export function effectToFilter(effect: Effect): string | null {
  switch (effect.type) {
    case EffectType.BLUR: {
      const blur = effect as BlurEffect;
      return `blur(${blur.radius}px)`;
    }

    case EffectType.GRAYSCALE: {
      const grayscale = effect as GrayscaleEffect;
      return `grayscale(${grayscale.amount / 100})`;
    }

    case EffectType.SEPIA: {
      const sepia = effect as SepiaEffect;
      return `sepia(${sepia.amount / 100})`;
    }

    case EffectType.INVERT: {
      const invert = effect as InvertEffect;
      return `invert(${invert.amount / 100})`;
    }

    case EffectType.DROP_SHADOW: {
      const shadow = effect as DropShadowEffect;
      // CSS drop-shadow filter: drop-shadow(offset-x offset-y blur-radius color)
      // Note: spread is not supported in CSS drop-shadow filter, only in box-shadow
      // We apply opacity to the color using rgba
      const r = parseInt(shadow.color.slice(1, 3), 16);
      const g = parseInt(shadow.color.slice(3, 5), 16);
      const b = parseInt(shadow.color.slice(5, 7), 16);
      const colorWithOpacity = `rgba(${r}, ${g}, ${b}, ${shadow.opacity})`;
      return `drop-shadow(${shadow.offsetX}px ${shadow.offsetY}px ${shadow.blur}px ${colorWithOpacity})`;
    }

    // Effects that can't be done with CSS filters
    case EffectType.VIGNETTE:
    case EffectType.SHARPEN:
    case EffectType.NOISE:
    case EffectType.GLOW:
      return null;

    // Built-in effects are handled separately
    case EffectType.MOTION:
    case EffectType.OPACITY:
      return null;

    default:
      return null;
  }
}

/**
 * Gets the opacity value from the Opacity built-in effect
 */
export function getOpacityFromEffects(effects: Effect[] | undefined): number {
  if (!effects) return 100;
  
  const opacityEffect = effects.find(
    e => e.enabled && e.type === EffectType.OPACITY
  ) as OpacityEffect | undefined;
  
  return opacityEffect?.opacity ?? 100;
}

/**
 * Gets the blend mode from the Opacity built-in effect
 * Returns a normalized CSS blend mode value for consistency
 */
export function getBlendModeFromEffects(effects: Effect[] | undefined): CSSBlendMode {
  if (!effects) return 'normal';
  
  const opacityEffect = effects.find(
    e => e.enabled && e.type === EffectType.OPACITY
  ) as OpacityEffect | undefined;
  
  return normalizeBlendMode(opacityEffect?.blendMode, 'normal');
}

/**
 * Gets the vignette effect if present and enabled
 * @param effects Array of effects
 * @returns Vignette effect or null
 */
export function getVignetteEffect(effects: Effect[] | undefined): VignetteEffect | null {
  if (!effects) return null;
  
  const vignette = effects.find(
    e => e.enabled && e.type === EffectType.VIGNETTE
  ) as VignetteEffect | undefined;
  
  return vignette || null;
}

/**
 * Generates CSS for a vignette effect overlay
 * Uses normalized blend mode for consistent preview/render behavior
 * 
 * @param vignette Vignette effect
 * @param blendMode Optional override for blend mode (default: 'multiply')
 * @returns CSS properties object
 */
export function vignetteToCSS(vignette: VignetteEffect, blendMode: string = 'multiply'): React.CSSProperties {
  // Size: 0 = full vignette, 100 = minimal vignette
  // We map size to the gradient stop position
  const innerStop = Math.max(0, vignette.size - 20); // Inner transparent area
  const outerStop = Math.min(100, vignette.size + vignette.feather); // Feathered edge
  
  // Roundness affects the ellipse shape: 0 = rectangular, 100 = circular
  // We use percentage values for the radial gradient
  const gradientSizeX = 100 + (100 - vignette.roundness) * 0.5;
  const gradientSizeY = 100 + (100 - vignette.roundness) * 0.3;
  
  // Use normalized blend mode for cross-browser/renderer consistency
  const normalizedBlend = normalizeBlendMode(blendMode, 'multiply');
  
  return {
    position: "absolute",
    inset: 0,
    background: `radial-gradient(ellipse ${gradientSizeX}% ${gradientSizeY}% at 50% 50%, transparent ${innerStop}%, ${vignette.color} ${outerStop}%)`,
    pointerEvents: "none",
    mixBlendMode: normalizedBlend,
    // Isolation context ensures the blend mode works correctly
    isolation: 'isolate' as const,
  };
}

/**
 * Generates CSS for a glow effect overlay
 * Note: For best results, glow should be rendered via canvas for proper compositing
 * This CSS version uses box-shadow which works for simple cases
 * @param glow Glow effect
 * @returns CSS properties object
 */
export function glowToCSS(glow: GlowEffect): React.CSSProperties {
  // Parse color and apply intensity as alpha
  let r = 255, g = 255, b = 255;
  if (glow.color.startsWith('#')) {
    r = parseInt(glow.color.slice(1, 3), 16);
    g = parseInt(glow.color.slice(3, 5), 16);
    b = parseInt(glow.color.slice(5, 7), 16);
  }
  
  const colorWithIntensity = `rgba(${r}, ${g}, ${b}, ${glow.intensity})`;
  
  return {
    boxShadow: `0 0 ${glow.radius}px ${glow.radius / 2}px ${colorWithIntensity}`,
  };
}

/**
 * Gets the glow effect if present and enabled
 * @param effects Array of effects
 * @returns Glow effect or null
 */
export function getGlowEffect(effects: Effect[] | undefined): GlowEffect | null {
  if (!effects) return null;
  
  const glow = effects.find(
    e => e.enabled && e.type === EffectType.GLOW
  ) as GlowEffect | undefined;
  
  return glow || null;
}

/**
 * Gets the motion effect values from the Motion built-in effect
 * @param effects Array of effects
 * @returns Motion values or defaults
 */
export function getMotionFromEffects(effects: Effect[] | undefined): {
  positionX: number;
  positionY: number;
  scale: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  anchorX: number;
  anchorY: number;
} {
  const defaults = {
    positionX: 0,
    positionY: 0,
    scale: 100,
    scaleX: 100,
    scaleY: 100,
    rotation: 0,
    anchorX: 50,
    anchorY: 50,
  };
  
  if (!effects) return defaults;
  
  const motionEffect = effects.find(
    e => e.enabled && e.type === EffectType.MOTION
  ) as MotionEffect | undefined;
  
  if (!motionEffect) return defaults;
  
  return {
    positionX: motionEffect.positionX,
    positionY: motionEffect.positionY,
    scale: motionEffect.scale,
    scaleX: motionEffect.uniformScale ? motionEffect.scale : motionEffect.scaleX,
    scaleY: motionEffect.uniformScale ? motionEffect.scale : motionEffect.scaleY,
    rotation: motionEffect.rotation,
    anchorX: motionEffect.anchorX,
    anchorY: motionEffect.anchorY,
  };
}

/**
 * Generates CSS transform string from motion effect
 * @param motion Motion values
 * @returns CSS transform string
 */
export function motionToTransform(motion: ReturnType<typeof getMotionFromEffects>): string {
  const transforms: string[] = [];
  
  // Apply in correct order: translate -> rotate -> scale
  if (motion.positionX !== 0 || motion.positionY !== 0) {
    transforms.push(`translate(${motion.positionX}px, ${motion.positionY}px)`);
  }
  
  if (motion.rotation !== 0) {
    transforms.push(`rotate(${motion.rotation}deg)`);
  }
  
  if (motion.scaleX !== 100 || motion.scaleY !== 100) {
    transforms.push(`scale(${motion.scaleX / 100}, ${motion.scaleY / 100})`);
  }
  
  return transforms.length > 0 ? transforms.join(' ') : 'none';
}

/**
 * Gets all effects that need canvas processing
 * @param effects Array of effects
 * @returns Array of effects requiring canvas
 */
export function getCanvasEffects(effects: Effect[] | undefined): Effect[] {
  if (!effects) return [];
  
  return effects.filter(e => 
    e.enabled && 
    (e.type === EffectType.SHARPEN || 
     e.type === EffectType.NOISE || 
     e.type === EffectType.GLOW)
  ).sort((a, b) => a.order - b.order);
}

/**
 * Checks if any effects require canvas processing
 * @param effects Array of effects
 * @returns True if canvas processing is needed
 */
export function needsCanvasProcessing(effects: Effect[] | undefined): boolean {
  return getCanvasEffects(effects).length > 0;
}

// ==========================================
// COLOR GRADING
// ==========================================

// Curve types for color grading (actual curve processing done via SVG filters)
interface CurvePoint {
  x: number;
  y: number;
}

export interface ColorGradingValues {
  temperature?: number;
  tint?: number;
  exposure?: number;
  contrast?: number;
  highlights?: number;
  shadows?: number;
  whites?: number;
  blacks?: number;
  saturation?: number;
  vibrance?: number;
  // Curves - processed via SVG filters (see svg-curves-filter.tsx)
  rgbCurve?: CurvePoint[];
  redCurve?: CurvePoint[];
  greenCurve?: CurvePoint[];
  blueCurve?: CurvePoint[];
}

/**
 * Converts color grading values to CSS filter string
 * @param colorGrading Color grading values from overlay styles
 * @returns CSS filter string
 */
export function colorGradingToFilter(colorGrading: ColorGradingValues | undefined): string {
  if (!colorGrading) return "";
  
  const filters: string[] = [];
  
  // Temperature: simulated with sepia + hue-rotate
  if (colorGrading.temperature && colorGrading.temperature !== 0) {
    const temp = colorGrading.temperature;
    if (temp > 0) {
      filters.push(`sepia(${Math.min(temp / 200, 0.3)})`);
      filters.push(`hue-rotate(${-temp / 10}deg)`);
    } else {
      filters.push(`hue-rotate(${-temp / 5}deg)`);
    }
  }
  
  // Tint: green/magenta shift
  if (colorGrading.tint && colorGrading.tint !== 0) {
    filters.push(`hue-rotate(${colorGrading.tint / 3}deg)`);
  }
  
  // Exposure
  if (colorGrading.exposure && colorGrading.exposure !== 0) {
    const brightness = 1 + (colorGrading.exposure / 100) * 0.5;
    filters.push(`brightness(${brightness})`);
  }
  
  // Contrast
  if (colorGrading.contrast && colorGrading.contrast !== 0) {
    const contrast = 1 + (colorGrading.contrast / 100);
    filters.push(`contrast(${contrast})`);
  }
  
  // Highlights
  if (colorGrading.highlights && colorGrading.highlights !== 0) {
    const highlightEffect = 1 + (colorGrading.highlights / 400);
    filters.push(`brightness(${highlightEffect})`);
  }
  
  // Shadows
  if (colorGrading.shadows && colorGrading.shadows !== 0) {
    const shadowEffect = 1 + (colorGrading.shadows / 400);
    filters.push(`contrast(${shadowEffect})`);
  }
  
  // Whites
  if (colorGrading.whites && colorGrading.whites !== 0) {
    const whitesEffect = 1 + (colorGrading.whites / 500);
    filters.push(`brightness(${whitesEffect})`);
  }
  
  // Blacks
  if (colorGrading.blacks && colorGrading.blacks !== 0) {
    const blacksEffect = 1 + (colorGrading.blacks / 500);
    filters.push(`contrast(${blacksEffect})`);
  }
  
  // Saturation
  if (colorGrading.saturation && colorGrading.saturation !== 0) {
    const saturation = 1 + (colorGrading.saturation / 100);
    filters.push(`saturate(${saturation})`);
  }
  
  // Vibrance
  if (colorGrading.vibrance && colorGrading.vibrance !== 0) {
    const vibrance = 1 + (colorGrading.vibrance / 200);
    filters.push(`saturate(${vibrance})`);
  }
  
  // NOTE: Curves (rgbCurve, redCurve, greenCurve, blueCurve) are handled
  // separately via SVG filters for accurate per-channel tone mapping.
  // See svg-curves-filter.tsx
  
  return filters.join(' ');
}
