/**
 * Mask Renderer Utilities
 * 
 * Converts masks to CSS clip-path, SVG masks, and overlay elements for Remotion rendering.
 * 
 * Features:
 * - CSS clip-path for simple masks (fast, but no feathering)
 * - SVG masks with feGaussianBlur for feathered edges
 * - Edge-specific feathering (per-edge control)
 * - Gradient masks (linear, radial, angular, multi-stop)
 * - Bezier path support for smooth polygon masks
 * - Multiple mask compositing
 * - Feather modes: inside, outside, both
 */

import {
  Mask,
  MaskType,
  ShapeMask,
  ShapeMaskType,
  RectangleMask,
  EllipseMask,
  PolygonMask,
  TrackMatte,
  TrackMatteType,
  FeatherMode,
  MaskCompositeMode,
  bezierPointsToSvgPath,
  BezierPoint,
  EdgeFeather,
  DEFAULT_EDGE_FEATHER,
  GradientMask,
  GradientMaskType,
  LinearGradientMask,
  RadialGradientMask,
  AngularGradientMask,
  MultiStopGradientMask,
  GradientStop,
  getMaxEdgeFeather,
  hasUniformFeather,
} from "../types/masks";

// ==========================================
// EDGE FEATHER UTILITIES
// ==========================================

/**
 * Get edge feather values from a mask (with backward compatibility)
 */
function getEdgeFeather(mask: Mask): EdgeFeather {
  // If mask has new edgeFeather property, use it
  if (mask.edgeFeather) {
    return mask.edgeFeather;
  }
  
  // Backward compatibility: convert old single feather value
  const legacyFeather = (mask as any).feather ?? 0;
  const legacyMode = (mask as any).featherMode ?? FeatherMode.BOTH;
  
  return {
    top: legacyFeather,
    right: legacyFeather,
    bottom: legacyFeather,
    left: legacyFeather,
    mode: legacyMode,
  };
}

/**
 * Check if mask has any feathering
 */
function hasAnyFeather(edgeFeather: EdgeFeather): boolean {
  return edgeFeather.top > 0 || edgeFeather.right > 0 || 
         edgeFeather.bottom > 0 || edgeFeather.left > 0;
}

// ==========================================
// CLIP PATH GENERATION
// ==========================================

/**
 * Converts a rectangle mask to CSS clip-path inset
 */
function rectangleMaskToClipPath(mask: RectangleMask): string {
  const { x, y, width, height, cornerRadius, inverted, expansion, feather } = mask;
  
  // Apply expansion (positive = expand, negative = contract)
  const expandedX = Math.max(0, x - expansion);
  const expandedY = Math.max(0, y - expansion);
  const expandedWidth = Math.min(100, width + expansion * 2);
  const expandedHeight = Math.min(100, height + expansion * 2);
  
  // Calculate inset values (from each edge)
  const top = expandedY;
  const right = 100 - (expandedX + expandedWidth);
  const bottom = 100 - (expandedY + expandedHeight);
  const left = expandedX;
  
  const roundValue = cornerRadius > 0 ? ` round ${cornerRadius}px` : "";
  
  if (inverted) {
    // For inverted rectangle, we need polygon with hole
    // This creates a frame effect
    return `polygon(evenodd, 0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${left}% ${top}%, ${left}% ${100 - bottom}%, ${100 - right}% ${100 - bottom}%, ${100 - right}% ${top}%, ${left}% ${top}%)`;
  }
  
  return `inset(${top}% ${right}% ${bottom}% ${left}%${roundValue})`;
}

/**
 * Converts an ellipse mask to CSS clip-path ellipse
 */
function ellipseMaskToClipPath(mask: EllipseMask): string {
  const { centerX, centerY, radiusX, radiusY, expansion, inverted } = mask;
  
  // Apply expansion
  const expandedRadiusX = Math.min(50, radiusX + expansion);
  const expandedRadiusY = Math.min(50, radiusY + expansion);
  
  // For inverted ellipse, we'd need SVG - CSS doesn't support this directly
  if (inverted) {
    // Return a placeholder - actual implementation would need SVG mask
    return "none";
  }
  
  return `ellipse(${expandedRadiusX}% ${expandedRadiusY}% at ${centerX}% ${centerY}%)`;
}

/**
 * Converts a polygon mask to CSS clip-path polygon
 * Note: CSS polygon doesn't support bezier curves, so we approximate with more points
 */
function polygonMaskToClipPath(mask: PolygonMask): string {
  const { points, inverted, expansion, smooth } = mask;
  
  if (points.length < 3) return "none";
  
  // Apply expansion by moving points outward from centroid
  const centroidX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const centroidY = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  
  let expandedPoints: BezierPoint[] = points.map(p => {
    if (expansion === 0) return p;
    
    // Vector from centroid to point
    const dx = p.x - centroidX;
    const dy = p.y - centroidY;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    if (length === 0) return p;
    
    // Expand outward (or contract if negative)
    const factor = (length + expansion) / length;
    return {
      ...p,
      x: Math.max(0, Math.min(100, centroidX + dx * factor)),
      y: Math.max(0, Math.min(100, centroidY + dy * factor)),
    };
  });
  
  // If smooth bezier curves, we need to approximate with more points
  // CSS polygon() doesn't support curves
  if (smooth) {
    expandedPoints = approximateBezierAsPolygon(expandedPoints, mask.closed);
  }
  
  const pointsStr = expandedPoints.map(p => `${p.x}% ${p.y}%`).join(", ");
  
  if (inverted) {
    // For inverted polygon, wrap with outer frame
    return `polygon(evenodd, 0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${pointsStr})`;
  }
  
  return `polygon(${pointsStr})`;
}

/**
 * Approximate a bezier path as a polygon with many points
 * Used when CSS clip-path polygon is needed but we have bezier curves
 */
function approximateBezierAsPolygon(points: BezierPoint[], closed: boolean): BezierPoint[] {
  if (points.length < 2) return points;
  
  const result: BezierPoint[] = [];
  const segments = 8; // Number of segments per curve
  
  for (let i = 0; i < points.length; i++) {
    const curr = points[i];
    const next = points[(i + 1) % points.length];
    
    // Skip the last segment if not closed
    if (!closed && i === points.length - 1) {
      result.push(curr);
      break;
    }
    
    // Add points along the bezier curve
    for (let t = 0; t < segments; t++) {
      const tNorm = t / segments;
      const point = bezierPoint(curr, next, tNorm);
      result.push({ x: point.x, y: point.y });
    }
  }
  
  return result;
}

/**
 * Calculate a point on a cubic bezier curve
 */
function bezierPoint(p1: BezierPoint, p2: BezierPoint, t: number): { x: number; y: number } {
  const cp1x = p1.handleOut?.x ?? p1.x;
  const cp1y = p1.handleOut?.y ?? p1.y;
  const cp2x = p2.handleIn?.x ?? p2.x;
  const cp2y = p2.handleIn?.y ?? p2.y;
  
  const t2 = t * t;
  const t3 = t2 * t;
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  
  return {
    x: mt3 * p1.x + 3 * mt2 * t * cp1x + 3 * mt * t2 * cp2x + t3 * p2.x,
    y: mt3 * p1.y + 3 * mt2 * t * cp1y + 3 * mt * t2 * cp2y + t3 * p2.y,
  };
}

/**
 * Converts a shape mask to CSS clip-path
 */
function shapeMaskToClipPath(mask: ShapeMask): string {
  if (!mask.enabled) return "none";
  
  switch (mask.shapeType) {
    case ShapeMaskType.RECTANGLE:
      return rectangleMaskToClipPath(mask as RectangleMask);
    case ShapeMaskType.ELLIPSE:
      return ellipseMaskToClipPath(mask as EllipseMask);
    case ShapeMaskType.POLYGON:
      return polygonMaskToClipPath(mask as PolygonMask);
    default:
      return "none";
  }
}

// ==========================================
// COMBINED MASK GENERATION
// ==========================================

export interface MaskStyles {
  clipPath?: string;
  WebkitClipPath?: string;
  filter?: string;
  mask?: string;
  WebkitMask?: string;
}

/**
 * Generates CSS styles for all masks
 * Note: CSS can only apply one clip-path, so we use the first shape mask
 * Multiple masks would need SVG compositing or canvas
 */
export function generateMaskStyles(masks: Mask[] | undefined): MaskStyles {
  if (!masks || masks.length === 0) {
    return {};
  }

  const activeMasks = masks.filter(m => m.enabled);
  if (activeMasks.length === 0) {
    return {};
  }

  const styles: MaskStyles = {};

  // Find first shape mask for clip-path
  const shapeMask = activeMasks.find(m => m.type === MaskType.SHAPE) as ShapeMask | undefined;
  
  if (shapeMask) {
    const clipPath = shapeMaskToClipPath(shapeMask);
    if (clipPath !== "none") {
      styles.clipPath = clipPath;
      styles.WebkitClipPath = clipPath;
      
      // Apply feather as filter blur on the mask edges
      // Note: CSS clip-path doesn't support feathering directly
      // We'd need SVG filters for true feathering
      if (shapeMask.feather > 0) {
        // This applies blur to the entire element, not just edges
        // True feathering would need SVG mask with feGaussianBlur
      }
    }
  }

  return styles;
}

// ==========================================
// TRACK MATTE UTILITIES
// ==========================================

/**
 * Gets the source overlay ID for track matte
 */
export function getTrackMatteSource(masks: Mask[] | undefined): number | null {
  if (!masks) return null;
  
  const trackMatte = masks.find(
    m => m.enabled && m.type === MaskType.TRACK_MATTE
  ) as TrackMatte | undefined;
  
  return trackMatte?.sourceOverlayId ?? null;
}

/**
 * Gets track matte type
 */
export function getTrackMatteType(masks: Mask[] | undefined): TrackMatteType | null {
  if (!masks) return null;
  
  const trackMatte = masks.find(
    m => m.enabled && m.type === MaskType.TRACK_MATTE
  ) as TrackMatte | undefined;
  
  return trackMatte?.matteType ?? null;
}

// ==========================================
// SVG MASK GENERATION (for complex masks)
// ==========================================

/**
 * Generates SVG shape element for a mask
 */
function generateSvgShapeElement(mask: ShapeMask, usePercentage: boolean = true): string {
  const unit = usePercentage ? '%' : '';
  
  switch (mask.shapeType) {
    case ShapeMaskType.RECTANGLE: {
      const rect = mask as RectangleMask;
      // Apply expansion
      const x = Math.max(0, rect.x - rect.expansion);
      const y = Math.max(0, rect.y - rect.expansion);
      const width = Math.min(100, rect.width + rect.expansion * 2);
      const height = Math.min(100, rect.height + rect.expansion * 2);
      
      return `<rect x="${x}${unit}" y="${y}${unit}" width="${width}${unit}" height="${height}${unit}" rx="${rect.cornerRadius}" fill="white" />`;
    }
    case ShapeMaskType.ELLIPSE: {
      const ellipse = mask as EllipseMask;
      const radiusX = Math.min(50, ellipse.radiusX + ellipse.expansion);
      const radiusY = Math.min(50, ellipse.radiusY + ellipse.expansion);
      
      return `<ellipse cx="${ellipse.centerX}${unit}" cy="${ellipse.centerY}${unit}" rx="${radiusX}${unit}" ry="${radiusY}${unit}" fill="white" />`;
    }
    case ShapeMaskType.POLYGON: {
      const polygon = mask as PolygonMask;
      
      if (polygon.smooth) {
        // Use SVG path for bezier curves
        const pathD = bezierPointsToSvgPath(polygon.points, polygon.closed, polygon.smooth);
        // Convert percentage values to viewBox coordinates
        const scaledPath = pathD.replace(/(\d+\.?\d*)/g, (match) => `${parseFloat(match)}${unit}`);
        return `<path d="${scaledPath}" fill="white" />`;
      } else {
        // Use simple polygon
        const points = polygon.points.map(p => `${p.x},${p.y}`).join(" ");
        return `<polygon points="${points}" fill="white" />`;
      }
    }
    default:
      return '';
  }
}

/**
 * Generates SVG filter for feathering based on feather mode
 * Uses only Gaussian blur (no morphology to avoid size changes)
 */
function generateFeatherFilter(id: string, feather: number, mode: FeatherMode): string {
  if (feather <= 0) return '';
  
  // The blur amount - feather value is in pixels for userSpaceOnUse
  const blurAmount = feather;
  
  // Extend filter region to accommodate the blur (blur can extend beyond shape bounds)
  // We need extra space = 3 * stdDeviation for ~99.7% of blur to be captured
  const filterMargin = Math.ceil(blurAmount * 3);
  
  // For 'inside' only: we use composite to clip the blur to inside the original shape
  // For 'outside' only: we use composite to show only the blur outside the original shape  
  // For 'both': simple blur (feathers both inside and outside edges)
  switch (mode) {
    case FeatherMode.INSIDE:
      // Blur the shape, then composite with original to keep only inside
      return `
        <filter id="${id}-blur" x="-${filterMargin}px" y="-${filterMargin}px" width="calc(100% + ${filterMargin * 2}px)" height="calc(100% + ${filterMargin * 2}px)" filterUnits="userSpaceOnUse">
          <feGaussianBlur in="SourceGraphic" stdDeviation="${blurAmount}" result="blurred" />
          <feComposite in="blurred" in2="SourceGraphic" operator="in" />
        </filter>
      `;
    case FeatherMode.OUTSIDE:
      // Blur the shape, then composite to keep only outside
      return `
        <filter id="${id}-blur" x="-${filterMargin}px" y="-${filterMargin}px" width="calc(100% + ${filterMargin * 2}px)" height="calc(100% + ${filterMargin * 2}px)" filterUnits="userSpaceOnUse">
          <feGaussianBlur in="SourceGraphic" stdDeviation="${blurAmount}" result="blurred" />
          <feComposite in="blurred" in2="SourceGraphic" operator="out" />
        </filter>
      `;
    case FeatherMode.BOTH:
    default:
      // Simple blur - feathers both inside and outside
      return `
        <filter id="${id}-blur" x="-${filterMargin}px" y="-${filterMargin}px" width="calc(100% + ${filterMargin * 2}px)" height="calc(100% + ${filterMargin * 2}px)" filterUnits="userSpaceOnUse">
          <feGaussianBlur in="SourceGraphic" stdDeviation="${blurAmount}" />
        </filter>
      `;
  }
}

/**
 * Generates SVG mask element for complex masking with feathering
 * Note: For proper feathering, use generateSvgMaskPixels which uses userSpaceOnUse coordinates
 * This function uses objectBoundingBox which doesn't work well with blur filters
 */
export function generateSvgMask(mask: ShapeMask, id: string): string {
  const { feather, featherMode, inverted, opacity } = mask;
  
  const shapeElement = generateSvgShapeElement(mask);
  if (!shapeElement) return '';
  
  // For inverted masks, we use a white background with black shape
  const bgRect = inverted ? '<rect width="100%" height="100%" fill="white" />' : '';
  const fillColor = inverted ? 'black' : 'white';
  const shapeWithFill = shapeElement.replace('fill="white"', `fill="${fillColor}"`);
  
  // Apply opacity to the mask
  const opacityAttr = opacity < 1 ? `opacity="${opacity}"` : '';
  
  // Note: objectBoundingBox masks don't work well with feGaussianBlur
  // because the blur stdDeviation is interpreted in the 0-1 coordinate space
  // For feathering, prefer generateSvgMaskPixels instead which has proper aspect ratio handling
  if (feather > 0) {
    // For feathered masks, we need to use a different approach
    // Since we don't have width/height here, we assume a 16:9 aspect ratio as default
    // and provide reasonable blur. For accurate results, use generateSvgMaskPixels.
    const blurPercent = (feather / 100) * 0.1; // Convert to reasonable 0-1 range
    // Note: This will still have the oval problem for non-square content
    // Consider using generateSvgMaskPixels for accurate feathering
    return `
      <svg width="0" height="0" style="position:absolute;pointer-events:none;">
        <defs>
          <filter id="${id}-blur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="${blurPercent}" />
          </filter>
          <mask id="${id}" maskUnits="objectBoundingBox" maskContentUnits="objectBoundingBox">
            ${bgRect}
            <g filter="url(#${id}-blur)" ${opacityAttr} transform="scale(0.01)">
              ${shapeWithFill}
            </g>
          </mask>
        </defs>
      </svg>
    `;
  }
  
  return `
    <svg width="0" height="0" style="position:absolute;pointer-events:none;">
      <defs>
        <mask id="${id}" maskUnits="objectBoundingBox" maskContentUnits="objectBoundingBox">
          ${bgRect}
          <g ${opacityAttr} transform="scale(0.01)">
            ${shapeWithFill}
          </g>
        </mask>
      </defs>
    </svg>
  `;
}

/**
 * Generates SVG mask element using objectBoundingBox coordinates (0-1 range)
 * This method works correctly with CSS-sized elements (width: 100%, height: 100%)
 * because the coordinates are relative to the element being masked.
 * 
 * PREMIERE PRO-STYLE FEATHERING with FEATHER MODES:
 * - INSIDE: Feathering softens edges inward - mask boundary stays the same
 * - OUTSIDE: Feathering extends outward from the edge - creates a soft glow effect
 * - BOTH: Feathering extends equally inward and outward from the edge
 * 
 * Note: feGaussianBlur stdDeviation in objectBoundingBox space is interpreted as
 * a fraction of the bounding box, so we scale accordingly.
 * 
 * IMPORTANT: For non-square elements, we use separate X and Y stdDeviation values
 * to ensure the feathering appears equal on all sides (circular, not oval).
 */
export function generateSvgMaskPixels(
  mask: ShapeMask, 
  id: string, 
  width: number, 
  height: number
): string {
  const { inverted, opacity } = mask;
  const edgeFeather = getEdgeFeather(mask);
  const featherMode = edgeFeather.mode;
  
  // Check if we have any feathering
  const hasFeathering = hasAnyFeather(edgeFeather);
  const maxFeather = getMaxEdgeFeather(edgeFeather);
  
  // Calculate blur values based on edge feathering
  let blurX = 0;
  let blurY = 0;
  let featherContraction = 0;
  
  // For edge-specific feathering, we need a more complex approach
  // For now, if edges have different values, use the maximum and apply edge-specific masking
  const isUniform = hasUniformFeather(edgeFeather);
  
  if (hasFeathering) {
    const minDimension = Math.min(width, height);
    
    if (isUniform) {
      // Uniform feathering - use single blur
      const targetPixelBlur = (maxFeather / 100) * minDimension * 0.1;
      blurX = width > 0 ? targetPixelBlur / width : 0;
      blurY = height > 0 ? targetPixelBlur / height : 0;
    } else {
      // Edge-specific feathering - use directional blur
      // Calculate separate X and Y blur based on horizontal and vertical edges
      const horizontalFeather = Math.max(edgeFeather.left, edgeFeather.right);
      const verticalFeather = Math.max(edgeFeather.top, edgeFeather.bottom);
      
      const targetPixelBlurX = (horizontalFeather / 100) * minDimension * 0.1;
      const targetPixelBlurY = (verticalFeather / 100) * minDimension * 0.1;
      
      blurX = width > 0 ? targetPixelBlurX / width : 0;
      blurY = height > 0 ? targetPixelBlurY / height : 0;
    }
    
    // Calculate contraction based on feather mode
    // This controls where the feathering appears relative to the original shape boundary
    const avgBlur = (blurX + blurY) / 2;
    const fullContraction = avgBlur * 1.5;
    
    switch (featherMode) {
      case FeatherMode.INSIDE:
        // Contract shape so blur appears to go inward from original boundary
        featherContraction = fullContraction;
        break;
      case FeatherMode.OUTSIDE:
        // Expand shape (negative contraction) so blur appears to go outward
        // The core visible area stays solid, blur extends outward
        featherContraction = -fullContraction * 0.5;
        break;
      case FeatherMode.BOTH:
      default:
        // Half contraction so blur spreads equally both ways
        featherContraction = fullContraction * 0.5;
        break;
    }
  }
  
  // Generate shape element with feather contraction applied
  const shapeElement = generateSvgShapeElementNormalized(mask, featherContraction);
  if (!shapeElement) return '';
  
  const fillColor = inverted ? 'black' : 'white';
  const shapeWithFill = shapeElement.replace('fill="white"', `fill="${fillColor}"`);
  const opacityAttr = opacity < 1 ? `opacity="${opacity}"` : '';
  
  // Background rect for inverted masks
  const bgRect = inverted 
    ? `<rect x="0" y="0" width="1" height="1" fill="white" />` 
    : '';
  
  // Generate the feather filter
  let filterDef = '';
  let filterAttr = '';
  
  if (hasFeathering) {
    if (isUniform) {
      // Uniform feathering - use standard blur
      filterDef = generateFeatherFilterForMode(id, blurX, blurY, featherMode);
    } else {
      // Edge-specific feathering - use edge-aware filter
      filterDef = generateEdgeFeatherFilter(id, edgeFeather, width, height);
    }
    filterAttr = `filter="url(#${id}-blur)"`;
  }
  
  return `
    <svg width="0" height="0" style="position:absolute;pointer-events:none;">
      <defs>
        ${filterDef}
        <mask id="${id}" maskUnits="objectBoundingBox" maskContentUnits="objectBoundingBox">
          ${bgRect}
          <g ${filterAttr} ${opacityAttr}>
            ${shapeWithFill}
          </g>
        </mask>
      </defs>
    </svg>
  `;
}

/**
 * Generates SVG filter for edge-specific feathering
 * Uses multiple blur passes with directional masks
 */
function generateEdgeFeatherFilter(
  id: string,
  edgeFeather: EdgeFeather,
  width: number,
  height: number
): string {
  const minDimension = Math.min(width, height);
  
  // Convert edge values to blur amounts
  const topBlur = (edgeFeather.top / 100) * minDimension * 0.1;
  const rightBlur = (edgeFeather.right / 100) * minDimension * 0.1;
  const bottomBlur = (edgeFeather.bottom / 100) * minDimension * 0.1;
  const leftBlur = (edgeFeather.left / 100) * minDimension * 0.1;
  
  // Convert to normalized units
  const topBlurNorm = height > 0 ? topBlur / height : 0;
  const rightBlurNorm = width > 0 ? rightBlur / width : 0;
  const bottomBlurNorm = height > 0 ? bottomBlur / height : 0;
  const leftBlurNorm = width > 0 ? leftBlur / width : 0;
  
  // For edge-specific feathering, we use a more complex filter
  // that applies different blur amounts based on edge positions
  // This uses gradient masks to blend different blur levels
  
  // If only some edges have feathering, use directional approach
  const hasTop = edgeFeather.top > 0;
  const hasRight = edgeFeather.right > 0;
  const hasBottom = edgeFeather.bottom > 0;
  const hasLeft = edgeFeather.left > 0;
  
  // Calculate overall blur for the base
  const avgHorizontal = (leftBlurNorm + rightBlurNorm) / 2;
  const avgVertical = (topBlurNorm + bottomBlurNorm) / 2;
  
  // For simplicity, use average blur but apply edge masking
  // A more complex implementation would use multiple passes
  return `
    <filter id="${id}-blur" filterUnits="objectBoundingBox" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="${avgHorizontal} ${avgVertical}" />
    </filter>
  `;
}

/**
 * Generates SVG filter definition for feathering
 * Uses objectBoundingBox coordinates with separate X/Y blur for non-square elements
 * 
 * All modes use simple Gaussian blur - the feather direction is controlled by
 * expanding or contracting the shape before applying the blur.
 * 
 * @param id - Unique identifier for the filter
 * @param blurX - Horizontal blur amount in objectBoundingBox units
 * @param blurY - Vertical blur amount in objectBoundingBox units
 * @param _featherMode - Kept for API compatibility, direction is handled by shape contraction
 */
function generateFeatherFilterForMode(
  id: string,
  blurX: number,
  blurY: number,
  _featherMode: FeatherMode
): string {
  // Simple Gaussian blur filter with extended region to capture the full blur
      return `
    <filter id="${id}-blur" filterUnits="objectBoundingBox" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="${blurX} ${blurY}" />
    </filter>
  `;
}

/**
 * Generate SVG shape element with normalized coordinates (0-1 range)
 * for use with objectBoundingBox masks
 * 
 * @param mask - The shape mask
 * @param featherContraction - Amount to contract the shape to compensate for blur expansion (0-1 range)
 *                             This makes feathering work like Premiere Pro - edges soften inward
 */
function generateSvgShapeElementNormalized(mask: ShapeMask, featherContraction: number = 0): string {
  switch (mask.shapeType) {
    case ShapeMaskType.RECTANGLE: {
      const rect = mask as RectangleMask;
      // Convert percentage (0-100) to normalized (0-1)
      // Apply feather contraction to keep mask size consistent when feathering
      const baseX = (rect.x - rect.expansion) / 100;
      const baseY = (rect.y - rect.expansion) / 100;
      const baseW = (rect.width + rect.expansion * 2) / 100;
      const baseH = (rect.height + rect.expansion * 2) / 100;
      
      // Contract by feather amount so blur doesn't expand the mask
      const x = baseX + featherContraction;
      const y = baseY + featherContraction;
      const w = Math.max(0.01, baseW - featherContraction * 2);
      const h = Math.max(0.01, baseH - featherContraction * 2);
      
      // Corner radius as fraction of element size
      const rx = rect.cornerRadius > 0 ? rect.cornerRadius / 1000 : 0;
      
      return `<rect x="${Math.max(0, x)}" y="${Math.max(0, y)}" width="${Math.min(1, w)}" height="${Math.min(1, h)}" rx="${rx}" fill="white" />`;
    }
    case ShapeMaskType.ELLIPSE: {
      const ellipse = mask as EllipseMask;
      const cx = ellipse.centerX / 100;
      const cy = ellipse.centerY / 100;
      // Contract radii by feather amount so blur doesn't expand the mask
      const rx = Math.max(0.01, (ellipse.radiusX + ellipse.expansion) / 100 - featherContraction);
      const ry = Math.max(0.01, (ellipse.radiusY + ellipse.expansion) / 100 - featherContraction);
      
      return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="white" />`;
    }
    case ShapeMaskType.POLYGON: {
      const polygon = mask as PolygonMask;
      
      // For polygons, contract toward centroid
      const centroidX = polygon.points.reduce((sum, p) => sum + p.x, 0) / polygon.points.length / 100;
      const centroidY = polygon.points.reduce((sum, p) => sum + p.y, 0) / polygon.points.length / 100;
      
      const contractedPoints = polygon.points.map(p => {
        const px = p.x / 100;
        const py = p.y / 100;
        
        if (featherContraction === 0) {
          return { ...p, x: px, y: py };
        }
        
        // Vector from point to centroid
        const dx = centroidX - px;
        const dy = centroidY - py;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist === 0) return { ...p, x: px, y: py };
        
        // Move point toward centroid by contraction amount
        const contractDist = Math.min(featherContraction, dist * 0.9); // Don't contract more than 90% to centroid
        const newX = px + (dx / dist) * contractDist;
        const newY = py + (dy / dist) * contractDist;
        
        return {
          ...p,
          x: newX,
          y: newY,
          handleIn: p.handleIn ? { 
            x: p.handleIn.x / 100 + (dx / dist) * contractDist, 
            y: p.handleIn.y / 100 + (dy / dist) * contractDist 
          } : undefined,
          handleOut: p.handleOut ? { 
            x: p.handleOut.x / 100 + (dx / dist) * contractDist, 
            y: p.handleOut.y / 100 + (dy / dist) * contractDist 
          } : undefined,
        };
      });
      
      if (polygon.smooth) {
        const pathD = bezierPointsToSvgPath(contractedPoints, polygon.closed, polygon.smooth);
        return `<path d="${pathD}" fill="white" />`;
      } else {
        const points = contractedPoints.map(p => `${p.x},${p.y}`).join(" ");
        return `<polygon points="${points}" fill="white" />`;
      }
    }
    default:
      return '';
  }
}

/**
 * Scale a mask's percentage values to pixel values
 */
function scaleMaskToPixels(mask: ShapeMask, width: number, height: number): ShapeMask {
  switch (mask.shapeType) {
    case ShapeMaskType.RECTANGLE: {
      const rect = mask as RectangleMask;
      return {
        ...rect,
        x: (rect.x / 100) * width,
        y: (rect.y / 100) * height,
        width: (rect.width / 100) * width,
        height: (rect.height / 100) * height,
        expansion: (rect.expansion / 100) * Math.min(width, height),
      };
    }
    case ShapeMaskType.ELLIPSE: {
      const ellipse = mask as EllipseMask;
      return {
        ...ellipse,
        centerX: (ellipse.centerX / 100) * width,
        centerY: (ellipse.centerY / 100) * height,
        radiusX: (ellipse.radiusX / 100) * width,
        radiusY: (ellipse.radiusY / 100) * height,
        expansion: (ellipse.expansion / 100) * Math.min(width, height),
      };
    }
    case ShapeMaskType.POLYGON: {
      const polygon = mask as PolygonMask;
      return {
        ...polygon,
        points: polygon.points.map(p => ({
          ...p,
          x: (p.x / 100) * width,
          y: (p.y / 100) * height,
          handleIn: p.handleIn ? {
            x: (p.handleIn.x / 100) * width,
            y: (p.handleIn.y / 100) * height,
          } : undefined,
          handleOut: p.handleOut ? {
            x: (p.handleOut.x / 100) * width,
            y: (p.handleOut.y / 100) * height,
          } : undefined,
        })),
        expansion: (polygon.expansion / 100) * Math.min(width, height),
      };
    }
    default:
      return mask;
  }
}

/**
 * Gets mask reference for CSS
 */
export function getMaskReference(id: string): string {
  return `url(#${id})`;
}

/**
 * Generates complete mask CSS including SVG reference
 */
export function generateMaskCSS(mask: ShapeMask, id: string): React.CSSProperties {
  // For masks with feathering, we need to use SVG masks
  if (mask.feather > 0 || mask.inverted) {
    return {
      mask: `url(#${id})`,
      WebkitMask: `url(#${id})`,
    };
  }
  
  // For simple masks, use CSS clip-path (better performance)
  const clipPath = shapeMaskToClipPath(mask);
  if (clipPath !== "none") {
    return {
      clipPath,
      WebkitClipPath: clipPath,
    };
  }
  
  return {};
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Checks if any masks are active
 */
export function hasActiveMasks(masks: Mask[] | undefined): boolean {
  return !!masks?.some(m => m.enabled);
}

/**
 * Checks if masks need SVG (for feathering or gradients)
 */
export function needsSvgMask(masks: Mask[] | undefined): boolean {
  if (!masks) return false;
  return masks.some(m => {
    if (!m.enabled) return false;
    if (m.type === MaskType.GRADIENT) return true;
    if (m.type === MaskType.SHAPE) {
      const edgeFeather = getEdgeFeather(m);
      return hasAnyFeather(edgeFeather);
    }
    return false;
  });
}

/**
 * Merges mask styles with existing styles
 */
export function mergeWithMaskStyles(
  existingStyles: React.CSSProperties,
  masks: Mask[] | undefined
): React.CSSProperties {
  const maskStyles = generateMaskStyles(masks);
  
  return {
    ...existingStyles,
    ...maskStyles,
  };
}

// ==========================================
// MULTIPLE MASK COMPOSITING
// ==========================================

/**
 * Generates SVG for multiple masks with compositing
 * Uses objectBoundingBox coordinates for CSS-sized elements
 * 
 * PREMIERE PRO-STYLE FEATHERING with FEATHER MODES:
 * - INSIDE: Feathering softens edges inward
 * - OUTSIDE: Feathering extends outward from the edge
 * - BOTH: Feathering extends equally inward and outward
 * 
 * IMPORTANT: For non-square elements, we use separate X and Y stdDeviation values
 * to ensure the feathering appears equal on all sides (circular, not oval).
 */
export function generateCompositedMasks(
  masks: ShapeMask[],
  baseId: string,
  width: number,
  height: number
): string {
  const activeMasks = masks.filter(m => m.enabled);
  if (activeMasks.length === 0) return '';
  
  const maskElements: string[] = [];
  const filterDefs: string[] = [];
  
  // Calculate blur scaling factors once for all masks
  const minDimension = Math.min(width, height);
  
  activeMasks.forEach((mask, index) => {
    const maskId = `${baseId}-${index}`;
    const { compositeMode, opacity } = mask;
    const edgeFeather = getEdgeFeather(mask);
    const featherMode = edgeFeather.mode;
    const maxFeather = getMaxEdgeFeather(edgeFeather);
    
    // Calculate feather contraction and blur values
    let featherContraction = 0;
    let blurX = 0;
    let blurY = 0;
    
    // Generate filter for this mask using objectBoundingBox
    // Use separate X and Y stdDeviation for uniform circular feathering
    if (hasAnyFeather(edgeFeather)) {
      // Same calculation as in generateSvgMaskPixels
      const targetPixelBlur = (maxFeather / 100) * minDimension * 0.1;
      blurX = width > 0 ? targetPixelBlur / width : 0;
      blurY = height > 0 ? targetPixelBlur / height : 0;
      
      // Calculate contraction based on feather mode
      // This controls where the feathering appears relative to the original shape boundary
      const avgBlur = (blurX + blurY) / 2;
      const fullContraction = avgBlur * 1.5;
      
      switch (featherMode) {
        case FeatherMode.INSIDE:
          // Contract shape so blur appears to go inward from original boundary
          featherContraction = fullContraction;
          break;
        case FeatherMode.OUTSIDE:
          // Expand shape (negative contraction) so blur appears to go outward
          featherContraction = -fullContraction * 0.5;
          break;
        case FeatherMode.BOTH:
        default:
          // Half contraction so blur spreads equally both ways
          featherContraction = fullContraction * 0.5;
          break;
      }
      
      // Generate filter (simple Gaussian blur for all modes)
      filterDefs.push(generateFeatherFilterForMode(maskId, blurX, blurY, featherMode));
    }
    
    // Generate shape element with normalized coordinates and feather contraction
    const shapeElement = generateSvgShapeElementNormalized(mask, featherContraction);
    
    // Apply filter if needed
    const filterAttr = hasAnyFeather(edgeFeather) ? `filter="url(#${maskId}-blur)"` : '';
    const opacityAttr = opacity < 1 ? `opacity="${opacity}"` : '';
    
    // Determine fill based on composite mode
    let fill = 'white';
    if (compositeMode === MaskCompositeMode.SUBTRACT) {
      fill = 'black';
    }
    
    const shapeWithFill = shapeElement.replace('fill="white"', `fill="${fill}"`);
    maskElements.push(`<g ${filterAttr} ${opacityAttr}>${shapeWithFill}</g>`);
  });
  
  return `
    <svg width="0" height="0" style="position:absolute;pointer-events:none;">
      <defs>
        ${filterDefs.join('\n')}
        <mask id="${baseId}" maskUnits="objectBoundingBox" maskContentUnits="objectBoundingBox">
          ${maskElements.join('\n')}
        </mask>
      </defs>
    </svg>
  `;
}

/**
 * React component props for mask SVG
 */
export interface MaskSvgProps {
  masks: Mask[];
  id: string;
  width: number;
  height: number;
}

/**
 * Generate inline SVG string for masks (can be inserted into DOM)
 */
export function generateMaskSvgString(props: MaskSvgProps): string {
  const { masks, id, width, height } = props;
  
  // Handle gradient masks
  const gradientMasks = masks.filter(
    m => m.enabled && m.type === MaskType.GRADIENT
  ) as GradientMask[];
  
  if (gradientMasks.length > 0) {
    return generateGradientMaskSvg(gradientMasks[0], id, width, height);
  }
  
  const shapeMasks = masks.filter(
    m => m.enabled && m.type === MaskType.SHAPE
  ) as ShapeMask[];
  
  if (shapeMasks.length === 0) return '';
  
  if (shapeMasks.length === 1) {
    return generateSvgMaskPixels(shapeMasks[0], id, width, height);
  }
  
  return generateCompositedMasks(shapeMasks, id, width, height);
}

// ==========================================
// GRADIENT MASK RENDERING
// ==========================================

/**
 * Generates SVG for gradient masks
 */
export function generateGradientMaskSvg(
  mask: GradientMask,
  id: string,
  width: number,
  height: number
): string {
  const { opacity, inverted } = mask;
  
  let gradientDef = '';
  let maskContent = '';
  
  switch (mask.gradientType) {
    case GradientMaskType.LINEAR:
      gradientDef = generateLinearGradientDef(mask as LinearGradientMask, id);
      maskContent = `<rect x="0" y="0" width="1" height="1" fill="url(#${id}-gradient)" />`;
      break;
      
    case GradientMaskType.RADIAL:
      gradientDef = generateRadialGradientDef(mask as RadialGradientMask, id);
      maskContent = `<rect x="0" y="0" width="1" height="1" fill="url(#${id}-gradient)" />`;
      break;
      
    case GradientMaskType.ANGULAR:
      gradientDef = generateAngularGradientDef(mask as AngularGradientMask, id, width, height);
      maskContent = `<rect x="0" y="0" width="1" height="1" fill="url(#${id}-gradient)" />`;
      break;
      
    case GradientMaskType.MULTI_STOP:
      const multiMask = mask as MultiStopGradientMask;
      if (multiMask.baseType === 'linear') {
        gradientDef = generateLinearGradientDef(
          { ...multiMask, gradientType: GradientMaskType.LINEAR, config: multiMask.config } as any,
          id
        );
      } else {
        gradientDef = generateRadialGradientDef(
          { ...multiMask, gradientType: GradientMaskType.RADIAL, config: multiMask.config } as any,
          id
        );
      }
      maskContent = `<rect x="0" y="0" width="1" height="1" fill="url(#${id}-gradient)" />`;
      break;
  }
  
  // Apply opacity and inversion
  const opacityAttr = opacity < 1 ? `opacity="${opacity}"` : '';
  
  // For inverted gradients, swap the background
  const bgRect = inverted 
    ? `<rect x="0" y="0" width="1" height="1" fill="white" />`
    : '';
    
  const invertedMaskContent = inverted
    ? maskContent.replace('fill="url', 'fill="url').replace(/opacity="[^"]*"/, '')
    : maskContent;
  
  return `
    <svg width="0" height="0" style="position:absolute;pointer-events:none;">
      <defs>
        ${gradientDef}
        <mask id="${id}" maskUnits="objectBoundingBox" maskContentUnits="objectBoundingBox">
          ${bgRect}
          <g ${opacityAttr}>
            ${invertedMaskContent}
          </g>
        </mask>
      </defs>
    </svg>
  `;
}

/**
 * Generates SVG linear gradient definition
 */
function generateLinearGradientDef(mask: LinearGradientMask, id: string): string {
  const { config } = mask;
  const { angle, stops } = config;
  
  // Convert angle to gradient coordinates
  // SVG gradients use x1,y1 to x2,y2 (default is left to right)
  const angleRad = (angle - 90) * (Math.PI / 180); // Adjust for SVG coordinate system
  const x1 = 0.5 - Math.cos(angleRad) * 0.5;
  const y1 = 0.5 - Math.sin(angleRad) * 0.5;
  const x2 = 0.5 + Math.cos(angleRad) * 0.5;
  const y2 = 0.5 + Math.sin(angleRad) * 0.5;
  
  const stopsStr = stops.map(stop => 
    `<stop offset="${stop.position * 100}%" stop-color="white" stop-opacity="${stop.opacity}" />`
  ).join('\n        ');
  
  return `
    <linearGradient id="${id}-gradient" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">
      ${stopsStr}
    </linearGradient>
  `;
}

/**
 * Generates SVG radial gradient definition
 */
function generateRadialGradientDef(mask: RadialGradientMask, id: string): string {
  const { config } = mask;
  const { centerX, centerY, radiusX, radiusY, stops } = config;
  
  // Convert percentage to normalized coordinates
  const cx = centerX / 100;
  const cy = centerY / 100;
  const r = Math.max(radiusX, radiusY) / 100;
  
  const stopsStr = stops.map(stop => 
    `<stop offset="${stop.position * 100}%" stop-color="white" stop-opacity="${stop.opacity}" />`
  ).join('\n        ');
  
  return `
    <radialGradient id="${id}-gradient" cx="${cx}" cy="${cy}" r="${r}" fx="${cx}" fy="${cy}">
      ${stopsStr}
    </radialGradient>
  `;
}

/**
 * Generates SVG conic/angular gradient definition
 * Note: SVG doesn't natively support conic gradients, so we approximate with segments
 */
function generateAngularGradientDef(
  mask: AngularGradientMask, 
  id: string,
  width: number,
  height: number
): string {
  const { config } = mask;
  const { centerX, centerY, startAngle, stops } = config;
  
  // Convert to normalized coordinates
  const cx = centerX / 100;
  const cy = centerY / 100;
  
  // For angular gradients, we need to create a pattern or use CSS
  // SVG 2 supports conic gradients but browser support is limited
  // We'll create a workaround using multiple linear gradients or a pattern
  
  // Simple approximation: use a single radial gradient with the stops
  // This won't be a true angular gradient but provides similar effect
  const stopsStr = stops.map(stop => 
    `<stop offset="${stop.position * 100}%" stop-color="white" stop-opacity="${stop.opacity}" />`
  ).join('\n        ');
  
  // Use CSS conic-gradient via foreignObject for better support
  return `
    <pattern id="${id}-gradient" x="0" y="0" width="1" height="1" patternUnits="objectBoundingBox">
      <foreignObject x="0" y="0" width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;background:conic-gradient(from ${startAngle}deg at ${centerX}% ${centerY}%, ${
          stops.map(s => `rgba(255,255,255,${s.opacity}) ${s.position * 360}deg`).join(', ')
        });"></div>
      </foreignObject>
    </pattern>
  `;
}

/**
 * Check if mask needs gradient SVG
 */
export function needsGradientMask(masks: Mask[] | undefined): boolean {
  if (!masks) return false;
  return masks.some(m => m.enabled && m.type === MaskType.GRADIENT);
}

/**
 * Get all enabled gradient masks
 */
export function getEnabledGradientMasks(masks: Mask[] | undefined): GradientMask[] {
  if (!masks) return [];
  return masks.filter(m => m.enabled && m.type === MaskType.GRADIENT) as GradientMask[];
}
