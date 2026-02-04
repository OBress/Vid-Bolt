/**
 * SVG Curves Filter - True per-channel tone curve implementation
 * Uses feComponentTransfer for accurate tone mapping like Premiere Pro/DaVinci
 */

import React, { useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

export interface CurvePoint {
  x: number; // 0-255 input value
  y: number; // 0-255 output value
}

export interface CurvesFilterValues {
  rgbCurve?: CurvePoint[];
  redCurve?: CurvePoint[];
  greenCurve?: CurvePoint[];
  blueCurve?: CurvePoint[];
}

// ============================================================================
// Curve Interpolation
// ============================================================================

/**
 * Attempt cubic interpolation for smoother curves
 * Falls back to linear for edge cases
 */
function cubicInterpolate(
  p0: number, p1: number, p2: number, p3: number, t: number
): number {
  const t2 = t * t;
  const t3 = t2 * t;
  
  // Catmull-Rom spline
  const a = -0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3;
  const b = p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3;
  const c = -0.5 * p0 + 0.5 * p2;
  const d = p1;
  
  return a * t3 + b * t2 + c * t + d;
}

/**
 * Interpolate curve value at a given x position using smooth interpolation
 */
function interpolateCurveSmooth(curve: CurvePoint[], x: number): number {
  if (curve.length === 0) return x;
  if (curve.length === 1) return curve[0].y;
  if (x <= curve[0].x) return curve[0].y;
  if (x >= curve[curve.length - 1].x) return curve[curve.length - 1].y;
  
  // Find the segment containing x
  let i = 0;
  for (; i < curve.length - 1; i++) {
    if (x >= curve[i].x && x <= curve[i + 1].x) break;
  }
  
  // Calculate t (position within segment)
  const t = (x - curve[i].x) / (curve[i + 1].x - curve[i].x);
  
  // Get 4 points for cubic interpolation
  const p0 = curve[Math.max(0, i - 1)].y;
  const p1 = curve[i].y;
  const p2 = curve[i + 1].y;
  const p3 = curve[Math.min(curve.length - 1, i + 2)].y;
  
  // Use cubic interpolation for smooth curves
  const result = cubicInterpolate(p0, p1, p2, p3, t);
  
  // Clamp to valid range
  return Math.max(0, Math.min(255, result));
}

/**
 * Generate a lookup table (256 values) from curve points
 * Each value maps input (0-255) to output (0-1 for SVG)
 */
function generateLookupTable(curve: CurvePoint[] | undefined): number[] {
  const table: number[] = [];
  
  // Default curve (identity): input = output
  const defaultCurve: CurvePoint[] = [
    { x: 0, y: 0 },
    { x: 255, y: 255 }
  ];
  
  const activeCurve = curve && curve.length >= 2 ? curve : defaultCurve;
  
  // Generate 256 values (0-255 input range)
  for (let i = 0; i <= 255; i++) {
    const outputValue = interpolateCurveSmooth(activeCurve, i);
    // Convert to 0-1 range for SVG feComponentTransfer
    table.push(outputValue / 255);
  }
  
  return table;
}

/**
 * Check if a curve is the default (identity) curve
 */
function isIdentityCurve(curve: CurvePoint[] | undefined): boolean {
  if (!curve || curve.length !== 2) return !curve || curve.length < 2;
  return (
    curve[0].x === 0 && curve[0].y === 0 &&
    curve[1].x === 255 && curve[1].y === 255
  );
}

// ============================================================================
// SVG Filter Component
// ============================================================================

interface SvgCurvesFilterProps {
  id: string;
  curves: CurvesFilterValues;
}

/**
 * Renders an SVG filter definition for curves
 * Must be placed inside an <svg> element with the filter definitions
 */
export const SvgCurvesFilter: React.FC<SvgCurvesFilterProps> = ({ id, curves }) => {
  // Generate lookup tables for each channel
  const tables = useMemo(() => {
    const rgb = generateLookupTable(curves.rgbCurve);
    const red = generateLookupTable(curves.redCurve);
    const green = generateLookupTable(curves.greenCurve);
    const blue = generateLookupTable(curves.blueCurve);
    
    // Combine RGB master curve with individual channel curves
    // RGB curve is applied first, then individual channels
    const combinedRed: number[] = [];
    const combinedGreen: number[] = [];
    const combinedBlue: number[] = [];
    
    for (let i = 0; i <= 255; i++) {
      // First apply RGB curve
      const rgbValue = rgb[i];
      // Then apply individual channel curve (lookup using RGB output as index)
      const rgbIndex = Math.round(rgbValue * 255);
      combinedRed.push(red[rgbIndex]);
      combinedGreen.push(green[rgbIndex]);
      combinedBlue.push(blue[rgbIndex]);
    }
    
    return {
      red: combinedRed.join(" "),
      green: combinedGreen.join(" "),
      blue: combinedBlue.join(" "),
    };
  }, [curves]);

  return (
    <filter id={id} colorInterpolationFilters="sRGB">
      <feComponentTransfer>
        <feFuncR type="table" tableValues={tables.red} />
        <feFuncG type="table" tableValues={tables.green} />
        <feFuncB type="table" tableValues={tables.blue} />
        <feFuncA type="identity" />
      </feComponentTransfer>
    </filter>
  );
};

// ============================================================================
// Hook for using curves filter
// ============================================================================

/**
 * Hook that returns filter ID and whether curves need to be applied
 */
export function useCurvesFilter(
  overlayId: string | number,
  curves: CurvesFilterValues | undefined
): { filterId: string; hasActiveCurves: boolean } {
  const filterId = `curves-filter-${overlayId}`;
  
  const hasActiveCurves = useMemo(() => {
    if (!curves) return false;
    
    return (
      !isIdentityCurve(curves.rgbCurve) ||
      !isIdentityCurve(curves.redCurve) ||
      !isIdentityCurve(curves.greenCurve) ||
      !isIdentityCurve(curves.blueCurve)
    );
  }, [curves]);
  
  return { filterId, hasActiveCurves };
}

// ============================================================================
// SVG Filter Container Component
// ============================================================================

interface SvgFilterDefsProps {
  children: React.ReactNode;
}

/**
 * Container for SVG filter definitions
 * Renders an invisible SVG element that holds the filter definitions
 */
export const SvgFilterDefs: React.FC<SvgFilterDefsProps> = ({ children }) => {
  return (
    <svg
      style={{
        position: "absolute",
        width: 0,
        height: 0,
        overflow: "hidden",
        pointerEvents: "none",
      }}
      aria-hidden="true"
    >
      <defs>{children}</defs>
    </svg>
  );
};

export default SvgCurvesFilter;
