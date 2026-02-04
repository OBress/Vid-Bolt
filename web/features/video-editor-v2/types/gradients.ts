/**
 * Gradient Types for Shapes and Text
 */

export enum GradientType {
  LINEAR = 'linear',
  RADIAL = 'radial',
}

export interface GradientStop {
  /** Color at this stop (hex, rgb, rgba) */
  color: string;
  /** Position of the stop (0-100) */
  offset: number;
}

export interface Gradient {
  /** Type of gradient */
  type: GradientType;
  /** Angle in degrees (for linear gradients, 0 = right, 90 = down, 180 = left, 270 = up) */
  angle?: number;
  /** Gradient color stops */
  stops: GradientStop[];
}

/**
 * Create a default linear gradient
 */
export function createLinearGradient(
  angle: number = 90,
  stops?: GradientStop[]
): Gradient {
  return {
    type: GradientType.LINEAR,
    angle,
    stops: stops || [
      { color: '#3b82f6', offset: 0 },
      { color: '#8b5cf6', offset: 100 },
    ],
  };
}

/**
 * Create a default radial gradient
 */
export function createRadialGradient(stops?: GradientStop[]): Gradient {
  return {
    type: GradientType.RADIAL,
    stops: stops || [
      { color: '#3b82f6', offset: 0 },
      { color: '#8b5cf6', offset: 100 },
    ],
  };
}

/**
 * Preset gradients for quick selection
 */
export const GRADIENT_PRESETS: Record<string, Gradient> = {
  blueToPurple: createLinearGradient(90, [
    { color: '#3b82f6', offset: 0 },
    { color: '#8b5cf6', offset: 100 },
  ]),
  sunsetOrange: createLinearGradient(135, [
    { color: '#ff6b6b', offset: 0 },
    { color: '#ffa500', offset: 100 },
  ]),
  oceanBlue: createLinearGradient(180, [
    { color: '#00c6ff', offset: 0 },
    { color: '#0072ff', offset: 100 },
  ]),
  forestGreen: createLinearGradient(45, [
    { color: '#11998e', offset: 0 },
    { color: '#38ef7d', offset: 100 },
  ]),
  pinkToYellow: createLinearGradient(90, [
    { color: '#ff0844', offset: 0 },
    { color: '#ffb199', offset: 100 },
  ]),
  radialBlue: createRadialGradient([
    { color: '#4facfe', offset: 0 },
    { color: '#00f2fe', offset: 100 },
  ]),
};
