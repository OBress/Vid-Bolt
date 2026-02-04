/**
 * Shadow Types for Shapes and Text
 */

export interface Shadow {
  /** Horizontal offset in pixels */
  offsetX: number;
  /** Vertical offset in pixels */
  offsetY: number;
  /** Blur radius in pixels */
  blur: number;
  /** Spread radius in pixels (for box-shadow only) */
  spread?: number;
  /** Shadow color (hex, rgb, rgba) */
  color: string;
  /** Shadow opacity (0-1) */
  opacity?: number;
}

/**
 * Create a default drop shadow
 */
export function createDropShadow(
  offsetX: number = 0,
  offsetY: number = 4,
  blur: number = 8,
  color: string = 'rgba(0, 0, 0, 0.5)'
): Shadow {
  return {
    offsetX,
    offsetY,
    blur,
    spread: 0,
    color,
    opacity: 1,
  };
}

/**
 * Create a default inner shadow
 */
export function createInnerShadow(
  offsetX: number = 0,
  offsetY: number = 2,
  blur: number = 4,
  color: string = 'rgba(0, 0, 0, 0.3)'
): Shadow {
  return {
    offsetX,
    offsetY,
    blur,
    spread: 0,
    color,
    opacity: 1,
  };
}

/**
 * Create a glow effect (multiple shadows)
 */
export function createGlowEffect(
  color: string = '#3b82f6',
  intensity: number = 10
): Shadow[] {
  return [
    { offsetX: 0, offsetY: 0, blur: intensity, spread: 0, color, opacity: 0.8 },
    { offsetX: 0, offsetY: 0, blur: intensity * 2, spread: 0, color, opacity: 0.4 },
    { offsetX: 0, offsetY: 0, blur: intensity * 3, spread: 0, color, opacity: 0.2 },
  ];
}

/**
 * Preset shadows for quick selection
 */
export const SHADOW_PRESETS: Record<string, Shadow> = {
  subtle: createDropShadow(0, 2, 4, 'rgba(0, 0, 0, 0.1)'),
  medium: createDropShadow(0, 4, 8, 'rgba(0, 0, 0, 0.2)'),
  strong: createDropShadow(0, 8, 16, 'rgba(0, 0, 0, 0.3)'),
  dramatic: createDropShadow(0, 16, 32, 'rgba(0, 0, 0, 0.4)'),
  innerSubtle: createInnerShadow(0, 2, 4, 'rgba(0, 0, 0, 0.1)'),
  innerMedium: createInnerShadow(0, 4, 8, 'rgba(0, 0, 0, 0.2)'),
};
