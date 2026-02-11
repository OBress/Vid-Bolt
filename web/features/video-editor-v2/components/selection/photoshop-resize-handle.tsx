import React, { useCallback, useMemo } from "react";
import { useCurrentScale } from "remotion";
import { Overlay, OverlayType } from "../../types";
import { useAlignmentGuides } from "../../hooks/use-alignment-guides";
import { getEffectiveCropDimensions } from "../../utils/crop-utils";
import { useVideoEditorStore } from "../../stores/video-editor-store";

// Handle types - 4 corners + 4 edge midpoints (Photoshop style)
export type HandleType = 
  | "top-left" 
  | "top-center" 
  | "top-right" 
  | "middle-left" 
  | "middle-right" 
  | "bottom-left" 
  | "bottom-center" 
  | "bottom-right";

const HANDLE_SIZE = 10;
const HANDLE_BORDER = 2;

// PERF: Modifier keys (Shift/Alt) are read directly from PointerEvent.shiftKey/altKey
// in the pointermove handler. No need for separate state tracking.

/**
 * Get cursor style based on handle type and rotation
 * Photoshop rotates cursors based on element rotation
 */
function getRotatedCursor(type: HandleType, rotation: number): string {
  // Base cursor directions for each handle (in degrees, 0 = right)
  const baseCursors: Record<HandleType, number> = {
    "top-left": 315,      // nwse
    "top-center": 0,      // ns
    "top-right": 45,      // nesw
    "middle-left": 90,    // ew
    "middle-right": 90,   // ew
    "bottom-left": 45,    // nesw
    "bottom-center": 0,   // ns
    "bottom-right": 315,  // nwse
  };

  // Adjust for element rotation
  const adjustedAngle = (baseCursors[type] + rotation + 360) % 360;
  
  // Map to nearest cursor
  const normalizedAngle = ((adjustedAngle + 22.5) % 180);
  
  if (normalizedAngle < 45) return "ns-resize";
  if (normalizedAngle < 90) return "nesw-resize";
  if (normalizedAngle < 135) return "ew-resize";
  return "nwse-resize";
}

/**
 * PhotoshopResizeHandle - A single resize handle in Photoshop style
 */
export const PhotoshopResizeHandle: React.FC<{
  type: HandleType;
  setOverlay: (overlayId: number, updater: (overlay: Overlay) => Overlay) => void;
  overlay: Overlay;
  alignmentGuides: ReturnType<typeof useAlignmentGuides>;
  allOverlays: Overlay[];
}> = ({ type, setOverlay, overlay, alignmentGuides, allOverlays }) => {
  const scale = useCurrentScale();
  // Scale handle size for zoom
  const size = Math.max(6, Math.round(HANDLE_SIZE / scale));
  const borderSize = Math.max(1, HANDLE_BORDER / scale);

  // Handle positioning using transforms for perfect centering
  const position = useMemo((): React.CSSProperties => {
    // Use transform to center handles on their anchor points
    // This works correctly regardless of handle size and border width
    const positions: Record<HandleType, React.CSSProperties> = {
      "top-left": { 
        top: 0, 
        left: 0, 
        transform: "translate(-50%, -50%)" 
      },
      "top-center": { 
        top: 0, 
        left: "50%", 
        transform: "translate(-50%, -50%)" 
      },
      "top-right": { 
        top: 0, 
        right: 0, 
        transform: "translate(50%, -50%)" 
      },
      "middle-left": { 
        top: "50%", 
        left: 0, 
        transform: "translate(-50%, -50%)" 
      },
      "middle-right": { 
        top: "50%", 
        right: 0, 
        transform: "translate(50%, -50%)" 
      },
      "bottom-left": { 
        bottom: 0, 
        left: 0, 
        transform: "translate(-50%, 50%)" 
      },
      "bottom-center": { 
        bottom: 0, 
        left: "50%", 
        transform: "translate(-50%, 50%)" 
      },
      "bottom-right": { 
        bottom: 0, 
        right: 0, 
        transform: "translate(50%, 50%)" 
      },
    };
    
    return positions[type];
  }, [type]);

  // Determine if this is a corner or edge handle
  const isCorner = ["top-left", "top-right", "bottom-left", "bottom-right"].includes(type);
  const isEdge = !isCorner;

  const style: React.CSSProperties = useMemo(() => ({
    position: "absolute",
    width: size,
    height: size,
    // White filled squares with blue border for better visibility
    backgroundColor: "#ffffff",
    border: `${borderSize}px solid #0066cc`,
    borderRadius: "2px", // Slight rounding for modern look
    cursor: getRotatedCursor(type, overlay.rotation || 0),
    zIndex: 999999,
    pointerEvents: "all",
    boxShadow: "0 2px 4px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.5)", // Enhanced shadow for depth
    transition: "transform 0.1s ease", // Smooth hover effect
    ...position,
  }), [size, borderSize, type, overlay.rotation, position]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (e.button !== 0) return;

      // Zundo auto-tracks state changes, no manual saveToHistory needed

      const initialX = e.clientX;
      const initialY = e.clientY;
      
      // Get effective dimensions
      const effectiveDimensions = getEffectiveCropDimensions(overlay);
      
      // Store initial state
      const initialState = {
        left: overlay.left,
        top: overlay.top,
        width: overlay.width,
        height: overlay.height,
        centerX: overlay.left + overlay.width / 2,
        centerY: overlay.top + overlay.height / 2,
        aspectRatio: overlay.width / overlay.height,
      };

      const onPointerMove = (moveEvent: PointerEvent) => {
        // Read modifiers directly from the event (no state tracking needed)
        const currentModifiers = {
          shift: moveEvent.shiftKey,
          alt: moveEvent.altKey,
        };

        // Raw mouse delta
        const rawDeltaX = (moveEvent.clientX - initialX) / scale;
        const rawDeltaY = (moveEvent.clientY - initialY) / scale;

        // Transform delta based on rotation
        const rotation = overlay.rotation || 0;
        const radians = -rotation * (Math.PI / 180);
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);
        const deltaX = rawDeltaX * cos - rawDeltaY * sin;
        const deltaY = rawDeltaX * sin + rawDeltaY * cos;

        // Calculate new dimensions based on handle type
        let newLeft = initialState.left;
        let newTop = initialState.top;
        let newWidth = initialState.width;
        let newHeight = initialState.height;

        // Determine which edges are being modified
        const affectsLeft = type.includes("left");
        const affectsRight = type.includes("right");
        const affectsTop = type.includes("top");
        const affectsBottom = type.includes("bottom");

        // Apply delta to affected edges
        if (affectsLeft) {
          newLeft = initialState.left + deltaX;
          newWidth = initialState.width - deltaX;
        }
        if (affectsRight) {
          newWidth = initialState.width + deltaX;
        }
        if (affectsTop) {
          newTop = initialState.top + deltaY;
          newHeight = initialState.height - deltaY;
        }
        if (affectsBottom) {
          newHeight = initialState.height + deltaY;
        }

        // Standard behavior: Hold Shift to maintain aspect ratio (corner handles only)
        // By default, allow free resize
        const shouldMaintainAspectRatio = currentModifiers.shift && isCorner;
        
        // Edge handles always constrain to one axis
        if (!isCorner) {
          if (type === "top-center" || type === "bottom-center") {
            newWidth = initialState.width; // Don't change width
            newLeft = initialState.left;
          } else if (type === "middle-left" || type === "middle-right") {
            newHeight = initialState.height; // Don't change height
            newTop = initialState.top;
          }
        }
        
        // Corner handles: maintain aspect ratio when Shift is held
        if (shouldMaintainAspectRatio) {
          const scaleX = newWidth / initialState.width;
          const scaleY = newHeight / initialState.height;
          
          // Use the larger absolute scale for uniform scaling
          const uniformScale = Math.abs(scaleX) > Math.abs(scaleY) ? scaleX : scaleY;
          
          newWidth = initialState.width * uniformScale;
          newHeight = initialState.height * uniformScale;

          // Anchor opposite corner
          if (affectsLeft) {
            newLeft = initialState.left + initialState.width - newWidth;
          }
          if (affectsTop) {
            newTop = initialState.top + initialState.height - newHeight;
          }
        }

        // Alt key: resize from center
        if (currentModifiers.alt) {
          const widthDelta = newWidth - initialState.width;
          const heightDelta = newHeight - initialState.height;
          
          newLeft = initialState.centerX - newWidth / 2;
          newTop = initialState.centerY - newHeight / 2;
          newWidth = initialState.width + widthDelta * 2;
          newHeight = initialState.height + heightDelta * 2;
          
          // Recalculate for center-based resize
          newLeft = initialState.centerX - newWidth / 2;
          newTop = initialState.centerY - newHeight / 2;
        }

        // Enforce minimum size (more generous minimum)
        const MIN_SIZE = 20;
        if (newWidth < MIN_SIZE) {
          if (affectsLeft) newLeft = newLeft + newWidth - MIN_SIZE;
          newWidth = MIN_SIZE;
        }
        if (newHeight < MIN_SIZE) {
          if (affectsTop) newTop = newTop + newHeight - MIN_SIZE;
          newHeight = MIN_SIZE;
        }

        // Create temp overlay for alignment guides
        const tempOverlay = {
          ...overlay,
          left: newLeft,
          top: newTop,
          width: newWidth,
          height: newHeight,
          isDragging: true,
        };

        // Update alignment guides
        alignmentGuides.updateGuides(tempOverlay, allOverlays);

        // Calculate snap position - this snaps the top-left corner
        const snapPosition = alignmentGuides.calculateSnapPosition(tempOverlay, allOverlays);

        // For resizing, we need to also snap the edges being resized
        // The snapPosition handles the top-left, but we need to also handle bottom-right edges
        let finalLeft = snapPosition.left;
        let finalTop = snapPosition.top;
        let finalWidth = newWidth;
        let finalHeight = newHeight;

        // Calculate snap threshold from alignment guides
        const snapThreshold = alignmentGuides.guideState?.snapThreshold || 5;

        // Get canvas dimensions from store - use composition dimensions, NOT player dimensions
        // Overlays use composition pixel coordinates (e.g., 1920x1080), not rendered size
        const compositionDimensions = useVideoEditorStore.getState().getAspectRatioDimensions();
        const canvasWidth = compositionDimensions?.width || 1920;
        const canvasHeight = compositionDimensions?.height || 1080;

        // Helper to snap width while maintaining aspect ratio if needed
        const snapWidth = (targetWidth: number) => {
          const aspectRatio = initialState.width / initialState.height;
          finalWidth = targetWidth;
          if (shouldMaintainAspectRatio) {
            finalHeight = finalWidth / aspectRatio;
            // Recalculate left position for center-anchored handles
            if (type === "top-center" || type === "bottom-center") {
              finalLeft = initialState.left + (initialState.width - finalWidth) / 2;
            }
          }
        };

        // Helper to snap height while maintaining aspect ratio if needed
        const snapHeight = (targetHeight: number) => {
          const aspectRatio = initialState.width / initialState.height;
          finalHeight = targetHeight;
          if (shouldMaintainAspectRatio) {
            finalWidth = finalHeight * aspectRatio;
            // Recalculate top position for center-anchored handles
            if (type === "middle-left" || type === "middle-right") {
              finalTop = initialState.top + (initialState.height - finalHeight) / 2;
            }
          }
        };

        // Snap right edge if resizing from right
        if (affectsRight && !affectsLeft) {
          const rightEdge = newLeft + newWidth;
          // Check snap to canvas right edge
          const distToRight = Math.abs(rightEdge - canvasWidth);
          if (distToRight <= snapThreshold) {
            snapWidth(canvasWidth - newLeft);
          }
          // Check snap to canvas center
          const canvasCenterX = canvasWidth / 2;
          const distToCenterX = Math.abs(rightEdge - canvasCenterX);
          if (distToCenterX <= snapThreshold) {
            snapWidth(canvasCenterX - newLeft);
          }
          // Check snap to other overlays' edges
          allOverlays.filter(o => o.id !== overlay.id).forEach(other => {
            const otherLeft = other.left;
            const otherRight = other.left + other.width;
            if (Math.abs(rightEdge - otherLeft) <= snapThreshold) {
              snapWidth(otherLeft - newLeft);
            }
            if (Math.abs(rightEdge - otherRight) <= snapThreshold) {
              snapWidth(otherRight - newLeft);
            }
          });
        }

        // Snap bottom edge if resizing from bottom
        if (affectsBottom && !affectsTop) {
          const bottomEdge = newTop + newHeight;
          // Check snap to canvas bottom edge
          const distToBottom = Math.abs(bottomEdge - canvasHeight);
          if (distToBottom <= snapThreshold) {
            snapHeight(canvasHeight - newTop);
          }
          // Check snap to canvas center
          const canvasCenterY = canvasHeight / 2;
          const distToCenterY = Math.abs(bottomEdge - canvasCenterY);
          if (distToCenterY <= snapThreshold) {
            snapHeight(canvasCenterY - newTop);
          }
          // Check snap to other overlays' edges
          allOverlays.filter(o => o.id !== overlay.id).forEach(other => {
            const otherTop = other.top;
            const otherBottom = other.top + other.height;
            if (Math.abs(bottomEdge - otherTop) <= snapThreshold) {
              snapHeight(otherTop - newTop);
            }
            if (Math.abs(bottomEdge - otherBottom) <= snapThreshold) {
              snapHeight(otherBottom - newTop);
            }
          });
        }

        // Snap left edge if resizing from left
        if (affectsLeft && !affectsRight) {
          const leftEdge = newLeft;
          let snappedLeft: number | null = null;
          
          // Check snap to canvas left edge (0)
          if (Math.abs(leftEdge - 0) <= snapThreshold) {
            snappedLeft = 0;
          }
          // Check snap to canvas center
          const canvasCenterX = canvasWidth / 2;
          if (Math.abs(leftEdge - canvasCenterX) <= snapThreshold) {
            snappedLeft = canvasCenterX;
          }
          // Check snap to other overlays' edges
          allOverlays.filter(o => o.id !== overlay.id).forEach(other => {
            const otherLeft = other.left;
            const otherRight = other.left + other.width;
            if (Math.abs(leftEdge - otherLeft) <= snapThreshold) {
              snappedLeft = otherLeft;
            }
            if (Math.abs(leftEdge - otherRight) <= snapThreshold) {
              snappedLeft = otherRight;
            }
          });
          
          if (snappedLeft !== null) {
            const originalRight = newLeft + newWidth;
            finalLeft = snappedLeft;
            const newSnapWidth = originalRight - finalLeft;
            if (shouldMaintainAspectRatio) {
              const aspectRatio = initialState.width / initialState.height;
              finalWidth = newSnapWidth;
              finalHeight = finalWidth / aspectRatio;
            } else {
              finalWidth = newSnapWidth;
            }
          }
        }

        // Snap top edge if resizing from top
        if (affectsTop && !affectsBottom) {
          const topEdge = newTop;
          let snappedTop: number | null = null;
          
          // Check snap to canvas top edge (0)
          if (Math.abs(topEdge - 0) <= snapThreshold) {
            snappedTop = 0;
          }
          // Check snap to canvas center
          const canvasCenterY = canvasHeight / 2;
          if (Math.abs(topEdge - canvasCenterY) <= snapThreshold) {
            snappedTop = canvasCenterY;
          }
          // Check snap to other overlays' edges
          allOverlays.filter(o => o.id !== overlay.id).forEach(other => {
            const otherTop = other.top;
            const otherBottom = other.top + other.height;
            if (Math.abs(topEdge - otherTop) <= snapThreshold) {
              snappedTop = otherTop;
            }
            if (Math.abs(topEdge - otherBottom) <= snapThreshold) {
              snappedTop = otherBottom;
            }
          });
          
          if (snappedTop !== null) {
            const originalBottom = newTop + newHeight;
            finalTop = snappedTop;
            const newSnapHeight = originalBottom - finalTop;
            if (shouldMaintainAspectRatio) {
              const aspectRatio = initialState.width / initialState.height;
              finalHeight = newSnapHeight;
              finalWidth = finalHeight * aspectRatio;
            } else {
              finalHeight = newSnapHeight;
            }
          }
        }

        // Re-enforce minimum size after snapping
        if (finalWidth < 10) finalWidth = 10;
        if (finalHeight < 10) finalHeight = 10;

        setOverlay(overlay.id, (o) => ({
          ...o,
          left: Math.round(finalLeft),
          top: Math.round(finalTop),
          width: Math.round(finalWidth),
          height: Math.round(finalHeight),
          isDragging: true,
        }));
      };

      const onPointerUp = () => {
        alignmentGuides.clearGuides();
        setOverlay(overlay.id, (o) => ({ ...o, isDragging: false }));
        window.removeEventListener("pointermove", onPointerMove);
      };

      window.addEventListener("pointermove", onPointerMove, { passive: true });
      window.addEventListener("pointerup", onPointerUp, { once: true });
    },
    [overlay, scale, setOverlay, type, alignmentGuides, allOverlays, isCorner]
  );

  if (overlay.type === OverlayType.SOUND) {
    return null;
  }

  return <div onPointerDown={onPointerDown} style={style} />;
};

/**
 * All 8 resize handles rendered together
 */
export const PhotoshopResizeHandles: React.FC<{
  overlay: Overlay;
  setOverlay: (overlayId: number, updater: (overlay: Overlay) => Overlay) => void;
  alignmentGuides: ReturnType<typeof useAlignmentGuides>;
  allOverlays: Overlay[];
}> = ({ overlay, setOverlay, alignmentGuides, allOverlays }) => {
  if (overlay.type === OverlayType.SOUND) {
    return null;
  }

  const handleTypes: HandleType[] = [
    "top-left",
    "top-center",
    "top-right",
    "middle-left",
    "middle-right",
    "bottom-left",
    "bottom-center",
    "bottom-right",
  ];

  return (
    <>
      {handleTypes.map((type) => (
        <PhotoshopResizeHandle
          key={type}
          type={type}
          overlay={overlay}
          setOverlay={setOverlay}
          alignmentGuides={alignmentGuides}
          allOverlays={allOverlays}
        />
      ))}
    </>
  );
};
