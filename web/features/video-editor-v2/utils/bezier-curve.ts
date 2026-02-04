/**
 * Bezier Curve Utilities
 * 
 * Mathematical functions for cubic bezier curve evaluation.
 * Used for keyframe interpolation with custom easing curves.
 * 
 * A cubic bezier curve is defined by 4 control points:
 * P0 (0, 0) - Start point (implicit)
 * P1 (x1, y1) - First control point
 * P2 (x2, y2) - Second control point
 * P3 (1, 1) - End point (implicit)
 */

/**
 * Calculate point on cubic bezier curve at parameter t
 * B(t) = (1-t)³P0 + 3(1-t)²tP1 + 3(1-t)t²P2 + t³P3
 * 
 * @param t - Parameter (0-1)
 * @param p1 - First control point
 * @param p2 - Second control point
 * @returns Value at t
 */
export function cubicBezier(t: number, p1: number, p2: number, p3: number, p4: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  
  return mt3 * p1 + 3 * mt2 * t * p2 + 3 * mt * t2 * p3 + t3 * p4;
}

/**
 * Solve for t given x using Newton-Raphson iteration
 * This is needed because bezier curves are parametric - we have x(t) and y(t)
 * but we need to find t given x, then evaluate y(t)
 * 
 * @param x - X value to solve for (0-1)
 * @param x1 - First control point x
 * @param x2 - Second control point x
 * @param epsilon - Precision threshold
 * @returns t value corresponding to x
 */
export function solveCubicBezierX(
  x: number,
  x1: number,
  x2: number,
  epsilon: number = 0.0001
): number {
  // Initial guess using linear interpolation
  let t = x;
  
  // Newton-Raphson iteration
  for (let i = 0; i < 8; i++) {
    const currentX = cubicBezier(t, 0, x1, x2, 1) - x;
    if (Math.abs(currentX) < epsilon) {
      return t;
    }
    
    const derivative = cubicBezierDerivative(t, 0, x1, x2, 1);
    if (Math.abs(derivative) < 1e-6) {
      break;
    }
    
    t = t - currentX / derivative;
  }
  
  // Fallback to binary search if Newton-Raphson didn't converge
  let low = 0;
  let high = 1;
  t = x;
  
  while (low < high) {
    const currentX = cubicBezier(t, 0, x1, x2, 1);
    if (Math.abs(currentX - x) < epsilon) {
      return t;
    }
    
    if (x > currentX) {
      low = t;
    } else {
      high = t;
    }
    
    t = (low + high) / 2;
  }
  
  return t;
}

/**
 * Calculate derivative of cubic bezier curve at parameter t
 * B'(t) = 3(1-t)²(P1-P0) + 6(1-t)t(P2-P1) + 3t²(P3-P2)
 */
export function cubicBezierDerivative(
  t: number,
  p1: number,
  p2: number,
  p3: number,
  p4: number
): number {
  const t2 = t * t;
  const mt = 1 - t;
  const mt2 = mt * mt;
  
  return 3 * mt2 * (p2 - p1) + 6 * mt * t * (p3 - p2) + 3 * t2 * (p4 - p3);
}

/**
 * Evaluate a cubic bezier easing function
 * Given control points (x1, y1) and (x2, y2), evaluate y at position x
 * 
 * @param x - Input value (0-1, typically time progress)
 * @param x1 - First control point x
 * @param y1 - First control point y
 * @param x2 - Second control point x
 * @param y2 - Second control point y
 * @returns Eased output value (0-1)
 */
export function evaluateCubicBezier(
  x: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  // Handle edge cases
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  
  // Clamp control points x values to valid range
  const cx1 = Math.max(0, Math.min(1, x1));
  const cx2 = Math.max(0, Math.min(1, x2));
  
  // Find t for given x
  const t = solveCubicBezierX(x, cx1, cx2);
  
  // Evaluate y at t
  return cubicBezier(t, 0, y1, y2, 1);
}

/**
 * Common easing presets as bezier control points [x1, y1, x2, y2]
 */
export const EASING_PRESETS: Record<string, [number, number, number, number]> = {
  // Standard CSS easings
  'linear': [0, 0, 1, 1],
  'ease': [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
  
  // Quadratic
  'ease-in-quad': [0.55, 0.085, 0.68, 0.53],
  'ease-out-quad': [0.25, 0.46, 0.45, 0.94],
  'ease-in-out-quad': [0.455, 0.03, 0.515, 0.955],
  
  // Cubic
  'ease-in-cubic': [0.55, 0.055, 0.675, 0.19],
  'ease-out-cubic': [0.215, 0.61, 0.355, 1],
  'ease-in-out-cubic': [0.645, 0.045, 0.355, 1],
  
  // Quartic
  'ease-in-quart': [0.895, 0.03, 0.685, 0.22],
  'ease-out-quart': [0.165, 0.84, 0.44, 1],
  'ease-in-out-quart': [0.77, 0, 0.175, 1],
  
  // Exponential
  'ease-in-expo': [0.95, 0.05, 0.795, 0.035],
  'ease-out-expo': [0.19, 1, 0.22, 1],
  'ease-in-out-expo': [1, 0, 0, 1],
  
  // Back (overshoot)
  'ease-in-back': [0.6, -0.28, 0.735, 0.045],
  'ease-out-back': [0.175, 0.885, 0.32, 1.275],
  'ease-in-out-back': [0.68, -0.55, 0.265, 1.55],
};

/**
 * Get easing function for a preset name
 * Returns a function that takes progress (0-1) and returns eased value (0-1)
 */
export function getEasingFunction(preset: string): (t: number) => number {
  const points = EASING_PRESETS[preset];
  
  if (!points) {
    // Default to linear if preset not found
    return (t: number) => t;
  }
  
  const [x1, y1, x2, y2] = points;
  return (t: number) => evaluateCubicBezier(t, x1, y1, x2, y2);
}

/**
 * Create a custom easing function from control points
 */
export function createEasingFunction(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): (t: number) => number {
  return (t: number) => evaluateCubicBezier(t, x1, y1, x2, y2);
}

/**
 * Spring animation easing (approximated with bezier)
 * Not a true physical spring, but visually similar
 */
export function springEasing(t: number, tension: number = 0.5): number {
  // Approximation using damped sine wave
  const omega = 10 + tension * 20;
  const decay = 4 + tension * 4;
  
  return 1 - Math.exp(-decay * t) * Math.cos(omega * t);
}

/**
 * Bounce easing (procedural, not bezier-based)
 */
export function bounceOut(t: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  
  if (t < 1 / d1) {
    return n1 * t * t;
  } else if (t < 2 / d1) {
    const t2 = t - 1.5 / d1;
    return n1 * t2 * t2 + 0.75;
  } else if (t < 2.5 / d1) {
    const t2 = t - 2.25 / d1;
    return n1 * t2 * t2 + 0.9375;
  } else {
    const t2 = t - 2.625 / d1;
    return n1 * t2 * t2 + 0.984375;
  }
}

/**
 * Elastic easing (procedural, not bezier-based)
 */
export function elasticOut(t: number): number {
  if (t === 0 || t === 1) return t;
  
  const p = 0.3;
  const s = p / 4;
  
  return Math.pow(2, -10 * t) * Math.sin((t - s) * (2 * Math.PI) / p) + 1;
}

export function elasticIn(t: number): number {
  if (t === 0 || t === 1) return t;
  return 1 - elasticOut(1 - t);
}

export function elasticInOut(t: number): number {
  if (t < 0.5) {
    return elasticIn(t * 2) / 2;
  }
  return 0.5 + elasticOut((t - 0.5) * 2) / 2;
}
