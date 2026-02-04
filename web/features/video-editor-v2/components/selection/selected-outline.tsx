import React, { useCallback, useMemo, useRef } from "react";
import { useCurrentScale, useVideoConfig } from "remotion";
import { Overlay, OverlayType, ClipOverlay, ImageOverlay } from "../../types";
import { useAlignmentGuides } from "../../hooks/use-alignment-guides";
import { getEffectiveCropDimensions } from "../../utils/crop-utils";
import { useOverlaySelection } from "../../hooks/use-overlay-section";
import { useCropHandling } from "../../hooks/use-crop-handling";
import { useVideoEditorStore } from "../../stores/video-editor-store";
import { useKeyframedTransform } from "../../hooks/use-keyframed-value";
import type { PropertyKeyframes } from "../../types/keyframes";

/**
 * SelectionOutline is a component that renders a draggable, resizable outline around selected overlays.
 * It provides visual feedback and interaction handles for manipulating overlay elements.
 *
 * @component
 * @param {Object} props
 * @param {Overlay} props.overlay - The overlay object containing position, size, and other properties
 * @param {Function} props.changeOverlay - Callback to update overlay properties
 * @param {Function} props.setSelectedOverlayId - Function to update the currently selected overlay
 * @param {number|null} props.selectedOverlayId - ID of the currently selected overlay
 * @param {boolean} props.isDragging - Whether the overlay is currently being dragged
 */
export const SelectionOutline: React.FC<{
  overlay: Overlay;
  changeOverlay: (
    overlayId: number,
    updater: (overlay: Overlay) => Overlay
  ) => void;
  selectedOverlayId: number | null;
  isDragging: boolean;
  alignmentGuides: ReturnType<typeof useAlignmentGuides>;
  allOverlays: Overlay[];
}> = ({
  overlay,
  changeOverlay,
  selectedOverlayId,
  isDragging,
  alignmentGuides,
  allOverlays,
}) => {
  const scale = useCurrentScale();
  const { fps } = useVideoConfig();
  const scaledBorder = Math.max(2, Math.ceil(2 / scale)); // Thicker border for better visibility

  const [hovered, setHovered] = React.useState(false);
  
  // Ref for RAF-based drag handling
  const rafRef = useRef<number | null>(null);
  
  // Get keyframed transform values for the current frame
  // This ensures the selection outline matches the animated overlay position
  // NOTE: outsideSequence=false because SelectionOutline is rendered INSIDE a Remotion Sequence
  // (see SortedOutlines), so useCurrentFrame() already returns the relative frame
  const overlayWithKeyframes = overlay as Overlay & { keyframes?: PropertyKeyframes[] };
  const keyframedTransform = useKeyframedTransform(overlayWithKeyframes, fps, false);

  const onMouseEnter = useCallback(() => {
    setHovered(true);
  }, []);

  const onMouseLeave = useCallback(() => {
    setHovered(false);
  }, []);

  const isSelected = overlay.id === selectedOverlayId;

  // Use shared crop handling hook
  const handleCropChange = useCropHandling(overlay, changeOverlay);

  // Handle double-click to enable cropping
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      
      // Only enable crop for VIDEO and IMAGE types
      if (overlay.type === OverlayType.VIDEO || overlay.type === OverlayType.IMAGE) {
        const currentOverlay = overlay as ClipOverlay | ImageOverlay;
        
        // If crop is not already enabled, enable it with default values
        if (!currentOverlay.styles?.cropEnabled) {
          handleCropChange({
            cropEnabled: true,
            cropX: currentOverlay.styles?.cropX ?? 0,
            cropY: currentOverlay.styles?.cropY ?? 0,
            cropWidth: currentOverlay.styles?.cropWidth ?? 100,
            cropHeight: currentOverlay.styles?.cropHeight ?? 100,
          });
        }
      }
    },
    [overlay, handleCropChange]
  );

  const style: React.CSSProperties = useMemo(() => {
    // Get effective dimensions based on crop settings when crop is enabled
    // First, create an overlay with keyframed values for crop calculation
    const overlayWithKeyframedValues = {
      ...overlay,
      left: keyframedTransform.x,
      top: keyframedTransform.y,
      width: keyframedTransform.width,
      height: keyframedTransform.height,
      rotation: keyframedTransform.rotation,
    };
    const effectiveDimensions = getEffectiveCropDimensions(overlayWithKeyframedValues);
    
    // Selection outlines should match layer stacking
    // But start at 1000 to be above content
    // e.g. row 4 = z-index 960, row 0 = z-index 1000
    const baseZIndex = 1000 - (overlay.row || 0) * 10;

    // Selected items get a small boost to appear above their layer
    // but not enough to override higher layers (max +5 to stay within row spacing of 10)
    const selectionBoost = isSelected ? 5 : 0;
    const zIndex = baseZIndex + selectionBoost;

    // Modern selection style: solid border with enhanced shadow
    const borderStyle = isSelected
      ? `${scaledBorder}px solid #0066cc` // Blue selection
      : hovered && !isDragging
        ? `${scaledBorder}px solid #0066cc80` // Semi-transparent on hover
        : undefined;

    // Enhanced shadow for better depth and visibility
    const shadowStyle = isSelected
      ? `0 0 0 ${scaledBorder}px rgba(0, 102, 204, 0.15), 0 2px 8px rgba(0, 102, 204, 0.2)`
      : undefined;

    // Build transform string (scale is applied in addition to rotation)
    const transformParts: string[] = [];
    if (keyframedTransform.rotation !== 0) {
      transformParts.push(`rotate(${keyframedTransform.rotation}deg)`);
    }
    if (keyframedTransform.scale !== 1) {
      transformParts.push(`scale(${keyframedTransform.scale})`);
    }
    const transform = transformParts.length > 0 ? transformParts.join(' ') : undefined;

    return {
      width: Number.isFinite(effectiveDimensions.width) ? effectiveDimensions.width : 0,
      height: Number.isFinite(effectiveDimensions.height) ? effectiveDimensions.height : 0,
      left: effectiveDimensions.left,
      top: effectiveDimensions.top,
      position: "absolute",
      border: borderStyle,
      boxShadow: shadowStyle,
      transform,
      transformOrigin: "center center",
      userSelect: "none",
      touchAction: "none",
      zIndex,
      pointerEvents: "all",
      cursor: "move",
      transition: "box-shadow 0.15s ease", // Smooth shadow transition
    };
  }, [overlay, hovered, isDragging, isSelected, scaledBorder, keyframedTransform]);

  const startDragging = useCallback(
    (e: PointerEvent | React.MouseEvent) => {
      // Save to history before starting drag
      useVideoEditorStore.getState().saveToHistory();
      
      const initialX = e.clientX;
      const initialY = e.clientY;
      const startLeft = overlay.left;
      const startTop = overlay.top;
      
      // Track last position to avoid redundant updates
      let lastLeft = startLeft;
      let lastTop = startTop;

      const onPointerMove = (pointerMoveEvent: PointerEvent) => {
        // Cancel any pending RAF to prevent queuing
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
        }
        
        // Schedule update on next animation frame (natural 60fps throttling)
        rafRef.current = requestAnimationFrame(() => {
        const offsetX = (pointerMoveEvent.clientX - initialX) / scale;
        const offsetY = (pointerMoveEvent.clientY - initialY) / scale;
        
        // Calculate the intended position without snapping
          const intendedLeft = startLeft + offsetX;
          const intendedTop = startTop + offsetY;
        
        // Create a temporary overlay with the intended position for alignment calculations
        const tempOverlay = {
          ...overlay,
          left: intendedLeft,
          top: intendedTop,
          isDragging: true,
        };
        
          // Calculate snap position and update guides in one pass
          const snapPosition = alignmentGuides.calculateSnapPosition(tempOverlay, allOverlays);
          const snappedLeft = Math.round(snapPosition.left);
          const snappedTop = Math.round(snapPosition.top);
          
          // Update alignment guides
        alignmentGuides.updateGuides(tempOverlay, allOverlays);
        
          // Only update state if position actually changed (avoids redundant renders)
          if (snappedLeft !== lastLeft || snappedTop !== lastTop) {
            lastLeft = snappedLeft;
            lastTop = snappedTop;
        
            changeOverlay(overlay.id, (o) => ({
            ...o,
              left: snappedLeft,
              top: snappedTop,
            isDragging: true,
            }));
          }
        });
      };

      const onPointerUp = () => {
        // Cancel any pending RAF
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        
        // Clear alignment guides
        alignmentGuides.clearGuides();
        
        // Final state update to clear isDragging
        changeOverlay(overlay.id, (o) => ({
            ...o,
            isDragging: false,
        }));
        
        window.removeEventListener("pointermove", onPointerMove);
      };

      window.addEventListener("pointermove", onPointerMove, { passive: true });

      window.addEventListener("pointerup", onPointerUp, {
        once: true,
      });
    },
    [overlay, scale, changeOverlay, alignmentGuides, allOverlays]
  );

  const { handleOverlaySelect } = useOverlaySelection();

  const onPointerDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault(); // Prevent text selection during drag
      if (e.button !== 0) {
        return;
      }

      handleOverlaySelect(overlay);
      startDragging(e);
    },
    [overlay, handleOverlaySelect, startDragging]
  );

  if (overlay.type === OverlayType.SOUND) {
    return null;
  }

  return (
    <>
      <div
        onPointerDown={onPointerDown}
        onPointerEnter={onMouseEnter}
        onPointerLeave={onMouseLeave}
        onDoubleClick={handleDoubleClick}
        style={style}
      >
        {/* Handles are now rendered separately in SelectionHandles component */}
      </div>
    </>
  );
};
