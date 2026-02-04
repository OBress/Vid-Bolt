/**
 * Color Grading SVG Filter Generator
 */

import React, { useMemo } from 'react';

// Types
export interface CurvePoint {
  x: number;
  y: number;
}

export interface ColorWheelValue {
  r: number;
  g: number;
  b: number;
  lum: number;
}

export interface ColorGradingValues {
  temperature: number;
  tint: number;
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  saturation: number;
  vibrance: number;
  rgbCurve: CurvePoint[];
  redCurve: CurvePoint[];
  greenCurve: CurvePoint[];
  blueCurve: CurvePoint[];
  lift: ColorWheelValue;
  gamma: ColorWheelValue;
  gain: ColorWheelValue;
}

const DEFAULT_CURVE: CurvePoint[] = [{ x: 0, y: 0 }, { x: 255, y: 255 }];

export const DEFAULT_COLOR_GRADING: ColorGradingValues = {
  temperature: 0,
  tint: 0,
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  saturation: 0,
  vibrance: 0,
  rgbCurve: [...DEFAULT_CURVE],
  redCurve: [...DEFAULT_CURVE],
  greenCurve: [...DEFAULT_CURVE],
  blueCurve: [...DEFAULT_CURVE],
  lift: { r: 0, g: 0, b: 0, lum: 0 },
  gamma: { r: 0, g: 0, b: 0, lum: 0 },
  gain: { r: 0, g: 0, b: 0, lum: 0 },
};

function interpolateCurve(points: CurvePoint[]): number[] {
  if (points.length < 2) {
    return Array.from({ length: 256 }, (_, i) => i / 255);
  }
  
  const sorted = [...points].sort((a, b) => a.x - b.x);
  const table: number[] = [];
  
  for (let i = 0; i < 256; i++) {
    let p1 = sorted[0];
    let p2 = sorted[sorted.length - 1];
    
    for (let j = 0; j < sorted.length - 1; j++) {
      if (sorted[j].x <= i && sorted[j + 1].x >= i) {
        p1 = sorted[j];
        p2 = sorted[j + 1];
        break;
      }
    }
    
    if (p1.x === p2.x) {
      table.push(p1.y / 255);
    } else {
      const t = (i - p1.x) / (p2.x - p1.x);
      const smoothT = t * t * (3 - 2 * t);
      const value = p1.y + (p2.y - p1.y) * smoothT;
      table.push(Math.max(0, Math.min(1, value / 255)));
    }
  }
  
  return table;
}

function isDefaultCurve(curve: CurvePoint[]): boolean {
  if (curve.length !== 2) return false;
  return curve[0].x === 0 && curve[0].y === 0 && curve[1].x === 255 && curve[1].y === 255;
}

interface ColorGradingFilterProps {
  id: string;
  values: ColorGradingValues;
}

export const ColorGradingFilter: React.FC<ColorGradingFilterProps> = ({ id, values }) => {
  const filterContent = useMemo(() => {
    const elements: React.ReactNode[] = [];
    let lastResult = 'SourceGraphic';
    let filterIndex = 0;
    
    // 1. Curves
    const rgbTable = interpolateCurve(values.rgbCurve);
    const redTable = interpolateCurve(values.redCurve);
    const greenTable = interpolateCurve(values.greenCurve);
    const blueTable = interpolateCurve(values.blueCurve);
    
    const hasCurves = values.rgbCurve.length > 2 || 
                      values.redCurve.length > 2 || 
                      values.greenCurve.length > 2 || 
                      values.blueCurve.length > 2 ||
                      !isDefaultCurve(values.rgbCurve) ||
                      !isDefaultCurve(values.redCurve) ||
                      !isDefaultCurve(values.greenCurve) ||
                      !isDefaultCurve(values.blueCurve);
    
    if (hasCurves) {
      const combinedRed = rgbTable.map((v) => redTable[Math.round(v * 255)] ?? v);
      const combinedGreen = rgbTable.map((v) => greenTable[Math.round(v * 255)] ?? v);
      const combinedBlue = rgbTable.map((v) => blueTable[Math.round(v * 255)] ?? v);
      
      const resultName = `curves${filterIndex++}`;
      elements.push(
        <feComponentTransfer key="curves" in={lastResult} result={resultName}>
          <feFuncR type="table" tableValues={combinedRed.join(' ')} />
          <feFuncG type="table" tableValues={combinedGreen.join(' ')} />
          <feFuncB type="table" tableValues={combinedBlue.join(' ')} />
        </feComponentTransfer>
      );
      lastResult = resultName;
    }
    
    // 2. Color wheels
    const hasColorWheels = 
      values.lift.r !== 0 || values.lift.g !== 0 || values.lift.b !== 0 || values.lift.lum !== 0 ||
      values.gamma.r !== 0 || values.gamma.g !== 0 || values.gamma.b !== 0 || values.gamma.lum !== 0 ||
      values.gain.r !== 0 || values.gain.g !== 0 || values.gain.b !== 0 || values.gain.lum !== 0;
    
    if (hasColorWheels) {
      const liftR = 1 + values.lift.r / 200;
      const liftG = 1 + values.lift.g / 200;
      const liftB = 1 + values.lift.b / 200;
      const liftLum = values.lift.lum / 200;
      
      const gammaR = 1 + values.gamma.r / 100;
      const gammaG = 1 + values.gamma.g / 100;
      const gammaB = 1 + values.gamma.b / 100;
      const gammaLum = values.gamma.lum / 200;
      
      const gainR = 1 + values.gain.r / 100;
      const gainG = 1 + values.gain.g / 100;
      const gainB = 1 + values.gain.b / 100;
      const gainLum = values.gain.lum / 200;
      
      const rScale = liftR * gammaR * gainR;
      const gScale = liftG * gammaG * gainG;
      const bScale = liftB * gammaB * gainB;
      const offset = (liftLum + gammaLum + gainLum);
      
      const resultName = `colorwheels${filterIndex++}`;
      elements.push(
        <feColorMatrix
          key="colorwheels"
          in={lastResult}
          result={resultName}
          type="matrix"
          values={`${rScale} 0 0 0 ${offset} 0 ${gScale} 0 0 ${offset} 0 0 ${bScale} 0 ${offset} 0 0 0 1 0`}
        />
      );
      lastResult = resultName;
    }
    
    // 3. Temperature and Tint
    if (values.temperature !== 0 || values.tint !== 0) {
      const tempR = 1 + values.temperature / 200;
      const tempB = 1 - values.temperature / 200;
      const tintG = 1 - values.tint / 200;
      const tintRB = 1 + values.tint / 400;
      
      const resultName = `temp${filterIndex++}`;
      elements.push(
        <feColorMatrix
          key="temperature"
          in={lastResult}
          result={resultName}
          type="matrix"
          values={`${tempR * tintRB} 0 0 0 0 0 ${tintG} 0 0 0 0 0 ${tempB * tintRB} 0 0 0 0 0 1 0`}
        />
      );
      lastResult = resultName;
    }
    
    // 4. Exposure
    if (values.exposure !== 0) {
      const exposure = Math.pow(2, values.exposure / 100);
      const resultName = `exposure${filterIndex++}`;
      elements.push(
        <feComponentTransfer key="exposure" in={lastResult} result={resultName}>
          <feFuncR type="linear" slope={exposure} />
          <feFuncG type="linear" slope={exposure} />
          <feFuncB type="linear" slope={exposure} />
        </feComponentTransfer>
      );
      lastResult = resultName;
    }
    
    // 5. Contrast
    if (values.contrast !== 0) {
      const contrast = 1 + values.contrast / 100;
      const intercept = (1 - contrast) / 2;
      const resultName = `contrast${filterIndex++}`;
      elements.push(
        <feComponentTransfer key="contrast" in={lastResult} result={resultName}>
          <feFuncR type="linear" slope={contrast} intercept={intercept} />
          <feFuncG type="linear" slope={contrast} intercept={intercept} />
          <feFuncB type="linear" slope={contrast} intercept={intercept} />
        </feComponentTransfer>
      );
      lastResult = resultName;
    }
    
    // 6. Highlights and Shadows
    if (values.highlights !== 0 || values.shadows !== 0) {
      const shadowGamma = 1 - values.shadows / 200;
      const highlightGamma = 1 + values.highlights / 200;
      const gamma = shadowGamma * highlightGamma;
      
      const resultName = `toneshadow${filterIndex++}`;
      elements.push(
        <feComponentTransfer key="shadows" in={lastResult} result={resultName}>
          <feFuncR type="gamma" amplitude={1} exponent={gamma} />
          <feFuncG type="gamma" amplitude={1} exponent={gamma} />
          <feFuncB type="gamma" amplitude={1} exponent={gamma} />
        </feComponentTransfer>
      );
      lastResult = resultName;
    }
    
    // 7. Whites and Blacks
    if (values.whites !== 0 || values.blacks !== 0) {
      const whitesAdjust = 1 + values.whites / 400;
      const blacksOffset = values.blacks / 1000;
      
      const resultName = `whitesblacks${filterIndex++}`;
      elements.push(
        <feComponentTransfer key="whitesblacks" in={lastResult} result={resultName}>
          <feFuncR type="linear" slope={whitesAdjust} intercept={blacksOffset} />
          <feFuncG type="linear" slope={whitesAdjust} intercept={blacksOffset} />
          <feFuncB type="linear" slope={whitesAdjust} intercept={blacksOffset} />
        </feComponentTransfer>
      );
      lastResult = resultName;
    }
    
    // 8. Saturation
    if (values.saturation !== 0 || values.vibrance !== 0) {
      const saturation = 1 + (values.saturation + values.vibrance * 0.5) / 100;
      const invSat = 1 - saturation;
      const r = 0.2126 * invSat;
      const g = 0.7152 * invSat;
      const b = 0.0722 * invSat;
      
      const resultName = `saturation${filterIndex++}`;
      elements.push(
        <feColorMatrix
          key="saturation"
          in={lastResult}
          result={resultName}
          type="matrix"
          values={`${r + saturation} ${g} ${b} 0 0 ${r} ${g + saturation} ${b} 0 0 ${r} ${g} ${b + saturation} 0 0 0 0 0 1 0`}
        />
      );
      lastResult = resultName;
    }
    
    return elements;
  }, [values]);
  
  const hasAnyAdjustment = useMemo(() => {
    return values.temperature !== 0 || values.tint !== 0 ||
           values.exposure !== 0 || values.contrast !== 0 ||
           values.highlights !== 0 || values.shadows !== 0 ||
           values.whites !== 0 || values.blacks !== 0 ||
           values.saturation !== 0 || values.vibrance !== 0 ||
           values.rgbCurve.length > 2 || !isDefaultCurve(values.rgbCurve) ||
           values.redCurve.length > 2 || !isDefaultCurve(values.redCurve) ||
           values.greenCurve.length > 2 || !isDefaultCurve(values.greenCurve) ||
           values.blueCurve.length > 2 || !isDefaultCurve(values.blueCurve) ||
           values.lift.r !== 0 || values.lift.g !== 0 || values.lift.b !== 0 || values.lift.lum !== 0 ||
           values.gamma.r !== 0 || values.gamma.g !== 0 || values.gamma.b !== 0 || values.gamma.lum !== 0 ||
           values.gain.r !== 0 || values.gain.g !== 0 || values.gain.b !== 0 || values.gain.lum !== 0;
  }, [values]);
  
  if (!hasAnyAdjustment) return null;
  
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }}>
      <defs>
        <filter id={id} colorInterpolationFilters="sRGB">
          {filterContent}
        </filter>
      </defs>
    </svg>
  );
};

export function useColorGradingFilter(overlayId: number | string, values: ColorGradingValues | undefined): string | null {
  return useMemo(() => {
    if (!values) return null;
    
    const hasAnyAdjustment = 
      values.temperature !== 0 || values.tint !== 0 ||
      values.exposure !== 0 || values.contrast !== 0 ||
      values.highlights !== 0 || values.shadows !== 0 ||
      values.whites !== 0 || values.blacks !== 0 ||
      values.saturation !== 0 || values.vibrance !== 0 ||
      values.rgbCurve?.length > 2 || (values.rgbCurve && !isDefaultCurve(values.rgbCurve)) ||
      values.redCurve?.length > 2 || (values.redCurve && !isDefaultCurve(values.redCurve)) ||
      values.greenCurve?.length > 2 || (values.greenCurve && !isDefaultCurve(values.greenCurve)) ||
      values.blueCurve?.length > 2 || (values.blueCurve && !isDefaultCurve(values.blueCurve)) ||
      values.lift?.r !== 0 || values.lift?.g !== 0 || values.lift?.b !== 0 || values.lift?.lum !== 0 ||
      values.gamma?.r !== 0 || values.gamma?.g !== 0 || values.gamma?.b !== 0 || values.gamma?.lum !== 0 ||
      values.gain?.r !== 0 || values.gain?.g !== 0 || values.gain?.b !== 0 || values.gain?.lum !== 0;
    
    if (!hasAnyAdjustment) return null;
    
    return `url(#color-grading-${overlayId})`;
  }, [overlayId, values]);
}
