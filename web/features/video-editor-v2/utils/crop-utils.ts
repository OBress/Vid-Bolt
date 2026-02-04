/**
 * Crop Utilities
 * 
 * This module provides utilities for handling crop functionality in overlays.
 * 
 * SOLUTION OVERVIEW:
 * When crop is enabled, the selection outline automatically adjusts to show
 * the cropped area. This is achieved through getEffectiveCropDimensions()
 * which calculates what the overlay dimensions would be if cropped.
 * 
 * The cropEnabled flag controls whether:
 * 1. The crop overlay UI is shown (drag handles for adjusting crop)
 * 2. The selection outline uses effective crop dimensions
 * 3. The visual crop effect (clipPath) is applied
 */

/**
 * Generates a CSS clipPath string based on crop parameters
 * @param x - Crop X position as percentage (0-100)
 * @param y - Crop Y position as percentage (0-100) 
 * @param width - Crop width as percentage (0-100)
 * @param height - Crop height as percentage (0-100)
 * @returns CSS clipPath inset string
 */
export const generateClipPath = (
  x: number = 0,
  y: number = 0,
  width: number = 100,
  height: number = 100
): string => {
  // Convert percentages to CSS clipPath inset values
  const top = y;
  const right = 100 - (x + width);
  const bottom = 100 - (y + height);
  const left = x;
  
  return `inset(${top}% ${right}% ${bottom}% ${left}%)`;
};

/**
 * Calculates the effective dimensions and position of an overlay after cropping
 * This is used to make the selection outline match the cropped area when crop is enabled
 * @param overlay - The overlay with crop settings
 * @returns Effective dimensions and position for display purposes
 */
export const getEffectiveCropDimensions = (overlay: { 
  width: number; 
  height: number; 
  left: number; 
  top: number; 
  styles?: any 
}) => {
  // Handle case where styles might be undefined
  if (!overlay.styles) {
    return {
      width: overlay.width,
      height: overlay.height,
      left: overlay.left,
      top: overlay.top,
    };
  }

  const cropX = overlay.styles.cropX ?? 0;
  const cropY = overlay.styles.cropY ?? 0;
  const cropWidth = overlay.styles.cropWidth ?? 100;
  const cropHeight = overlay.styles.cropHeight ?? 100;

  // Check if crop has been modified from defaults
  const hasNonDefaultCrop = cropX !== 0 || cropY !== 0 || cropWidth !== 100 || cropHeight !== 100;
  
  // Apply effective dimensions if crop has been modified, regardless of cropEnabled state
  // This ensures the selection outline stays cropped even when crop UI is disabled
  if (!hasNonDefaultCrop) {
    return {
      width: overlay.width,
      height: overlay.height,
      left: overlay.left,
      top: overlay.top,
    };
  }

  // Calculate the cropped area in pixels
  const cropLeftPx = (cropX / 100) * overlay.width;
  const cropTopPx = (cropY / 100) * overlay.height;
  const cropWidthPx = (cropWidth / 100) * overlay.width;
  const cropHeightPx = (cropHeight / 100) * overlay.height;

  return {
    width: Math.round(cropWidthPx),
    height: Math.round(cropHeightPx),
    left: overlay.left + Math.round(cropLeftPx),
    top: overlay.top + Math.round(cropTopPx),
  };
};

/**
 * Calculates the effective video bounds within an overlay based on object-fit behavior
 * This ensures resize handles are positioned at the actual video content corners, not overlay container corners
 * @param overlay - The overlay containing the video
 * @param videoAspectRatio - The aspect ratio of the video (width/height)
 * @returns Effective bounds of the visible video content within the overlay
 */
export const getEffectiveVideoBounds = (
  overlay: { width: number; height: number; left: number; top: number; styles?: any },
  videoAspectRatio: number
) => {
  const overlayAspectRatio = overlay.width / overlay.height;
  const objectFit = overlay.styles?.objectFit || "cover";

  let videoWidth: number;
  let videoHeight: number;
  let videoLeft: number;
  let videoTop: number;

  switch (objectFit) {
    case "contain": {
      // Video fits entirely within overlay, maintaining aspect ratio
      // For 9:16 video in 16:9 container: videoAspectRatio (9/16 = 0.5625) < overlayAspectRatio (16/9 = 1.777)
      // So video is taller than overlay - fit by height
      if (videoAspectRatio < overlayAspectRatio) {
        // Video is taller than overlay - fit by height
        videoHeight = overlay.height;
        videoWidth = overlay.height * videoAspectRatio;
        videoLeft = overlay.left + (overlay.width - videoWidth) / 2;
        videoTop = overlay.top;
      } else {
        // Video is wider than overlay - fit by width
        videoWidth = overlay.width;
        videoHeight = overlay.width / videoAspectRatio;
        videoLeft = overlay.left;
        videoTop = overlay.top + (overlay.height - videoHeight) / 2;
      }
      break;
    }

    case "cover": {
      // Video covers entire overlay, maintaining aspect ratio
      // For 9:16 video in 16:9 container: videoAspectRatio (9/16 = 0.5625) < overlayAspectRatio (16/9 = 1.777)
      // So video is taller than overlay - cover by width
      if (videoAspectRatio < overlayAspectRatio) {
        // Video is taller than overlay - cover by width (extend horizontally)
        videoWidth = overlay.width;
        videoHeight = overlay.width / videoAspectRatio;
        videoLeft = overlay.left;
        videoTop = overlay.top + (overlay.height - videoHeight) / 2;
      } else {
        // Video is wider than overlay - cover by height (extend vertically)
        videoHeight = overlay.height;
        videoWidth = overlay.height * videoAspectRatio;
        videoLeft = overlay.left + (overlay.width - videoWidth) / 2;
        videoTop = overlay.top;
      }
      break;
    }

    case "fill":
      // Video fills entire overlay, may distort aspect ratio
      videoWidth = overlay.width;
      videoHeight = overlay.height;
      videoLeft = overlay.left;
      videoTop = overlay.top;
      break;

    case "none":
      // Video uses its natural size, centered
      videoWidth = Math.min(overlay.width, overlay.height * videoAspectRatio);
      videoHeight = Math.min(overlay.height, overlay.width / videoAspectRatio);
      videoLeft = overlay.left + (overlay.width - videoWidth) / 2;
      videoTop = overlay.top + (overlay.height - videoHeight) / 2;
      break;

    case "scale-down":
      // Use "none" if video is smaller, otherwise use "contain"
      const naturalWidth = overlay.height * videoAspectRatio;
      const naturalHeight = overlay.width / videoAspectRatio;

      if (naturalWidth <= overlay.width && naturalHeight <= overlay.height) {
        // Use natural size
        videoWidth = naturalWidth;
        videoHeight = naturalHeight;
      } else {
        // Use contain behavior
        if (videoAspectRatio < overlayAspectRatio) {
          videoHeight = overlay.height;
          videoWidth = overlay.height * videoAspectRatio;
        } else {
          videoWidth = overlay.width;
          videoHeight = overlay.width / videoAspectRatio;
        }
      }
      videoLeft = overlay.left + (overlay.width - videoWidth) / 2;
      videoTop = overlay.top + (overlay.height - videoHeight) / 2;
      break;

    default:
      // Fallback to contain behavior
      if (videoAspectRatio < overlayAspectRatio) {
        videoHeight = overlay.height;
        videoWidth = overlay.height * videoAspectRatio;
        videoLeft = overlay.left + (overlay.width - videoWidth) / 2;
        videoTop = overlay.top;
      } else {
        videoWidth = overlay.width;
        videoHeight = overlay.width / videoAspectRatio;
        videoLeft = overlay.left;
        videoTop = overlay.top + (overlay.height - videoHeight) / 2;
      }
  }

  return {
    width: Math.round(videoWidth),
    height: Math.round(videoHeight),
    left: Math.round(videoLeft),
    top: Math.round(videoTop),
  };
};

/**
 * Checks if an overlay has active crop settings (different from defaults)
 * @param overlay - The overlay to check
 * @returns true if the overlay has crop settings different from defaults
 */
export const hasActiveCrop = (overlay: { styles?: any }): boolean => {
  if (!overlay.styles) return false;

  const cropX = overlay.styles.cropX || 0;
  const cropY = overlay.styles.cropY || 0;
  const cropWidth = overlay.styles.cropWidth || 100;
  const cropHeight = overlay.styles.cropHeight || 100;

  return cropX !== 0 || cropY !== 0 || cropWidth !== 100 || cropHeight !== 100;
}; 