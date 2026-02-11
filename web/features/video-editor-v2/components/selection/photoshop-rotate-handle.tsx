import React, { useCallback, useMemo, useState } from "react";
import { useCurrentScale } from "remotion";
import { Overlay } from "../../types";

/**
 * PhotoshopRotateHandle - Invisible rotation zones outside corners
 * In Photoshop, you rotate by clicking and dragging outside the corners
 * This component creates invisible hit zones outside each corner that show rotate cursors
 */

type CornerType = "top-left" | "top-right" | "bottom-left" | "bottom-right";

const ZONE_SIZE = 20; // Size of the rotation hit zone
const ZONE_OFFSET = 8; // How far outside the corner

/**
 * Get rotation cursor based on corner and current rotation
 */
function getRotateCursor(corner: CornerType, rotation: number): string {
  // Custom rotate cursors aren't available in CSS, but we can approximate
  // with a URL or use a custom cursor image
  // For now, use grab/grabbing which indicates interactive rotation
  return "grab";
}

export const PhotoshopRotateZone: React.FC<{
  corner: CornerType;
  overlay: Overlay;
  setOverlay: (overlayId: number, updater: (overlay: Overlay) => Overlay) => void;
}> = ({ corner, overlay, setOverlay }) => {
  const scale = useCurrentScale();
  const [isRotating, setIsRotating] = useState(false);
  
  const zoneSize = Math.max(16, Math.round(ZONE_SIZE / scale));
  const zoneOffset = Math.max(6, Math.round(ZONE_OFFSET / scale));

  const position = useMemo((): React.CSSProperties => {
    // Position rotation zones just outside the corners
    const totalOffset = zoneOffset + zoneSize / 2;
    const positions: Record<CornerType, React.CSSProperties> = {
      "top-left": { 
        top: -totalOffset, 
        left: -totalOffset,
        transform: "translate(-50%, -50%)"
      },
      "top-right": { 
        top: -totalOffset, 
        right: -totalOffset,
        transform: "translate(50%, -50%)"
      },
      "bottom-left": { 
        bottom: -totalOffset, 
        left: -totalOffset,
        transform: "translate(-50%, 50%)"
      },
      "bottom-right": { 
        bottom: -totalOffset, 
        right: -totalOffset,
        transform: "translate(50%, 50%)"
      },
    };
    return positions[corner];
  }, [corner, zoneSize, zoneOffset]);

  const style: React.CSSProperties = useMemo(() => ({
    position: "absolute",
    width: zoneSize,
    height: zoneSize,
    cursor: isRotating ? "grabbing" : "grab",
    zIndex: 999998, // Just below resize handles
    pointerEvents: "all",
    // Debug: uncomment to see the zones
    // backgroundColor: "rgba(255, 0, 0, 0.2)",
    ...position,
  }), [zoneSize, position, isRotating]);

  const startRotating = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (e.button !== 0) return;

      // Zundo auto-tracks state changes, no manual saveToHistory needed

      setIsRotating(true);

      // Get the center of the overlay element
      const rect = e.currentTarget.parentElement?.getBoundingClientRect();
      if (!rect) return;

      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const getAngle = (x: number, y: number) => {
        const deltaX = x - centerX;
        const deltaY = y - centerY;
        return Math.atan2(deltaY, deltaX) * (180 / Math.PI);
      };

      const startAngle = getAngle(e.clientX, e.clientY);
      const startRotation = overlay.rotation || 0;

      const onPointerMove = (moveEvent: PointerEvent) => {
        const currentAngle = getAngle(moveEvent.clientX, moveEvent.clientY);
        let deltaAngle = currentAngle - startAngle;

        // Shift key: snap to 15 degree increments
        if (moveEvent.shiftKey) {
          const newRotation = startRotation + deltaAngle;
          const snappedRotation = Math.round(newRotation / 15) * 15;
          deltaAngle = snappedRotation - startRotation;
        }

        setOverlay(overlay.id, (o) => ({
          ...o,
          rotation: startRotation + deltaAngle,
        }));
      };

      const onPointerUp = () => {
        setIsRotating(false);
        window.removeEventListener("pointermove", onPointerMove);
      };

      window.addEventListener("pointermove", onPointerMove, { passive: true });
      window.addEventListener("pointerup", onPointerUp, { once: true });
    },
    [overlay, setOverlay]
  );

  return <div onPointerDown={startRotating} style={style} />;
};

/**
 * All 4 rotation zones rendered together
 */
export const PhotoshopRotateZones: React.FC<{
  overlay: Overlay;
  setOverlay: (overlayId: number, updater: (overlay: Overlay) => Overlay) => void;
}> = ({ overlay, setOverlay }) => {
  const corners: CornerType[] = ["top-left", "top-right", "bottom-left", "bottom-right"];

  return (
    <>
      {corners.map((corner) => (
        <PhotoshopRotateZone
          key={corner}
          corner={corner}
          overlay={overlay}
          setOverlay={setOverlay}
        />
      ))}
    </>
  );
};
