import React from "react";
import { useVideoConfig } from "remotion";
import { Overlay, OverlayType, ClipOverlay, ImageOverlay } from "../../types";
import { PhotoshopResizeHandles } from "./photoshop-resize-handle";
import { PhotoshopRotateZones } from "./photoshop-rotate-handle";
import { CropOverlay } from "./crop-overlay";
import { getEffectiveCropDimensions } from "../../utils/crop-utils";
import { useAlignmentGuides } from "../../hooks/use-alignment-guides";
import { useCropHandling } from "../../hooks/use-crop-handling";
import { useKeyframedTransform } from "../../hooks/use-keyframed-value";
import type { PropertyKeyframes } from "../../types/keyframes";

/**
 * SelectionHandles renders interactive handles (resize, rotate, crop) for the selected overlay.
 * Uses Photoshop-style 8-point handles (4 corners + 4 edge midpoints) and rotation zones.
 *
 * Photoshop-style behavior:
 * - 8 resize handles (white squares with blue border)
 * - Shift+drag: maintain aspect ratio
 * - Alt+drag: resize from center
 * - Rotation by dragging outside corners (invisible hit zones)
 * - Shift while rotating: snap to 15° increments
 *
 * @component
 * @param {Object} props
 * @param {Overlay} props.overlay - The selected overlay object
 * @param {Function} props.changeOverlay - Callback to update overlay properties
 * @param {ReturnType<typeof useAlignmentGuides>} props.alignmentGuides - Alignment guide utilities
 * @param {Overlay[]} props.allOverlays - All overlays for alignment calculations
 */
export const SelectionHandles: React.FC<{
  overlay: Overlay;
  changeOverlay: (
    overlayId: number,
    updater: (overlay: Overlay) => Overlay
  ) => void;
  alignmentGuides: ReturnType<typeof useAlignmentGuides>;
  allOverlays: Overlay[];
}> = ({ overlay, changeOverlay, alignmentGuides, allOverlays }) => {
  const { fps } = useVideoConfig();
  
  // Use shared crop handling hook
  const handleCropChange = useCropHandling(overlay, changeOverlay);
  
  // Get keyframed transform values for the current frame
  // This ensures the selection handles match the animated overlay position
  // NOTE: outsideSequence=false because SelectionHandles is rendered INSIDE a Remotion Sequence
  // (see SortedOutlines), so useCurrentFrame() already returns the relative frame
  const overlayWithKeyframes = overlay as Overlay & { keyframes?: PropertyKeyframes[] };
  const keyframedTransform = useKeyframedTransform(overlayWithKeyframes, fps, false);

  if (overlay.type === OverlayType.SOUND) {
    return null;
  }

  // Get effective dimensions for positioning using keyframed values
  // Use the same calculation as SelectionOutline to ensure handles align with the outline
  const overlayWithKeyframedValues = {
    ...overlay,
    left: keyframedTransform.x,
    top: keyframedTransform.y,
    width: keyframedTransform.width,
    height: keyframedTransform.height,
    rotation: keyframedTransform.rotation,
  };
  const effectiveDimensions = getEffectiveCropDimensions(overlayWithKeyframedValues);

  // Build transform string with keyframed values
  const transformParts: string[] = [];
  if (keyframedTransform.rotation !== 0) {
    transformParts.push(`rotate(${keyframedTransform.rotation}deg)`);
  }
  if (keyframedTransform.scale !== 1) {
    transformParts.push(`scale(${keyframedTransform.scale})`);
  }
  const transform = transformParts.length > 0 ? transformParts.join(' ') : undefined;

  // Container style matches the overlay position but with extreme z-index
  const containerStyle: React.CSSProperties = {
    position: "absolute",
    left: effectiveDimensions.left,
    top: effectiveDimensions.top,
    width: effectiveDimensions.width,
    height: effectiveDimensions.height,
    transform,
    transformOrigin: "center center",
    zIndex: 999999, // Extreme z-index to be above everything
    pointerEvents: "none", // Don't block clicks on the container itself
    contain: "layout style", // PERF: Isolate style recalc from propagating through handle children
  };

  return (
    <div style={containerStyle}>
      {/* Photoshop-style 8-point resize handles */}
      <PhotoshopResizeHandles
        overlay={overlay}
        setOverlay={changeOverlay}
        alignmentGuides={alignmentGuides}
        allOverlays={allOverlays}
      />
      
      {/* Invisible rotation zones outside corners (Photoshop style) */}
      <PhotoshopRotateZones
        overlay={overlay}
        setOverlay={changeOverlay}
      />
      
      {/* Crop overlay for video and image overlays when crop is enabled */}
      {(overlay.type === OverlayType.VIDEO && (overlay as ClipOverlay).styles.cropEnabled) && (
        <CropOverlay
          overlay={overlay as ClipOverlay}
          onCropChange={handleCropChange}
        />
      )}
      {(overlay.type === OverlayType.IMAGE && (overlay as ImageOverlay).styles.cropEnabled) && (
        <CropOverlay
          overlay={overlay as ImageOverlay}
          onCropChange={handleCropChange}
        />
      )}
    </div>
  );
};

