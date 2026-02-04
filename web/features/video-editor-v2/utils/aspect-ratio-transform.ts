import { Overlay, AspectRatio } from "../types";

/**
 * Transform overlay positions when aspect ratio changes
 * This ensures overlays remain visible and proportionally positioned
 * when switching between different aspect ratios (e.g., 16:9 to 9:16)
 */

export interface CanvasDimensions {
  width: number;
  height: number;
}

// Base dimensions for each resolution preset
const RESOLUTION_BASE_DIMENSIONS = {
  "720p": { width: 1280, height: 720 },
  "1080p": { width: 1920, height: 1080 },
  "1440p": { width: 2560, height: 1440 },
  "4K": { width: 3840, height: 2160 },
} as const;

/**
 * Get canvas dimensions for a specific aspect ratio
 * @param aspectRatio - The aspect ratio to get dimensions for
 * @param resolution - Optional resolution preset to override defaults
 * @returns Canvas dimensions for the given aspect ratio
 */
export function getDimensionsForAspectRatio(
  aspectRatio: AspectRatio,
  resolution?: import("../types").ResolutionPreset
): CanvasDimensions {
  // If a resolution preset is provided, use it with the aspect ratio
  if (resolution) {
    const baseDimensions = RESOLUTION_BASE_DIMENSIONS[resolution];
    const aspectRatioValue = getAspectRatioValue(aspectRatio);

    // Adjust the base resolution to match the aspect ratio
    if (aspectRatioValue > 1) {
      // Landscape (wider than tall) - use height as base
      return {
        width: Math.round(baseDimensions.height * aspectRatioValue),
        height: baseDimensions.height
      };
    } else {
      // Portrait (taller than wide) - use width as base
      return {
        width: baseDimensions.width,
        height: Math.round(baseDimensions.width / aspectRatioValue)
      };
    }
  }

  // Fallback to legacy behavior
  switch (aspectRatio) {
    case "9:16":
      return { width: 1080, height: 1920 };
    case "4:5":
      return { width: 1080, height: 1350 };
    case "1:1":
      return { width: 1080, height: 1080 };
    case "16:9":
      return { width: 1280, height: 720 };
    default:
      return { width: 1920, height: 1080 };
  }
}

/**
 * Get the numeric aspect ratio value (width/height)
 */
function getAspectRatioValue(aspectRatio: AspectRatio): number {
  switch (aspectRatio) {
    case "16:9": return 16/9;
    case "9:16": return 9/16;
    case "4:5": return 4/5;
    case "1:1": return 1/1;
    default: return 16/9;
  }
}

/**
 * Get available resolution presets for an aspect ratio
 */
export function getResolutionPresetsForAspectRatio(aspectRatio: AspectRatio): Array<{
  value: import("../types").ResolutionPreset;
  label: string;
  dimensions: CanvasDimensions;
}> {
  return Object.entries(RESOLUTION_BASE_DIMENSIONS).map(([key, baseDims]) => {
    const resolution = key as import("../types").ResolutionPreset;
    const dimensions = getDimensionsForAspectRatio(aspectRatio, resolution);
    return {
      value: resolution,
      label: key,
      dimensions
    };
  });
}

/**
 * Transforms a single overlay's position and dimensions based on canvas size change
 * @param overlay - The overlay to transform
 * @param oldDimensions - Previous canvas dimensions
 * @param newDimensions - New canvas dimensions
 * @returns Updated overlay with transformed position and size
 */
export function transformOverlayForAspectRatio(
  overlay: Overlay,
  oldDimensions: CanvasDimensions,
  newDimensions: CanvasDimensions
): Overlay {
  // Calculate scale factors for both dimensions
  const scaleX = newDimensions.width / oldDimensions.width;
  const scaleY = newDimensions.height / oldDimensions.height;

  // Transform position
  const newLeft = overlay.left * scaleX;
  const newTop = overlay.top * scaleY;
  
  // Transform dimensions
  const newWidth = overlay.width * scaleX;
  const newHeight = overlay.height * scaleY;

  return {
    ...overlay,
    left: Math.round(newLeft),
    top: Math.round(newTop),
    width: Math.round(newWidth),
    height: Math.round(newHeight),
  };
}

/**
 * Transforms all overlays for a new aspect ratio
 * @param overlays - Array of overlays to transform
 * @param oldDimensions - Previous canvas dimensions
 * @param newDimensions - New canvas dimensions
 * @returns Array of transformed overlays
 */
export function transformOverlaysForAspectRatio(
  overlays: Overlay[],
  oldDimensions: CanvasDimensions,
  newDimensions: CanvasDimensions
): Overlay[] {
  // If dimensions haven't changed, return overlays as-is
  if (
    oldDimensions.width === newDimensions.width &&
    oldDimensions.height === newDimensions.height
  ) {
    return overlays;
  }

  return overlays.map((overlay) =>
    transformOverlayForAspectRatio(overlay, oldDimensions, newDimensions)
  );
}

/**
 * Check if overlays need transformation (i.e., if dimensions changed significantly)
 * @param oldDimensions - Previous canvas dimensions
 * @param newDimensions - New canvas dimensions
 * @returns true if transformation is needed
 */
export function shouldTransformOverlays(
  oldDimensions: CanvasDimensions,
  newDimensions: CanvasDimensions
): boolean {
  // Use a small tolerance to avoid unnecessary transformations due to rounding
  const tolerance = 0.01;
  
  const widthRatio = Math.abs(oldDimensions.width - newDimensions.width) / oldDimensions.width;
  const heightRatio = Math.abs(oldDimensions.height - newDimensions.height) / oldDimensions.height;
  
  return widthRatio > tolerance || heightRatio > tolerance;
}

