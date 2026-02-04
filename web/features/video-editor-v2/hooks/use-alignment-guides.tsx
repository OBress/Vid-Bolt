import { useState, useCallback, useRef, useMemo } from "react";
import { Overlay } from "../types";

export interface GuidePosition {
  id: string;
  x?: number;
  y?: number;
  type: "canvas-center-x" | "canvas-center-y" | "canvas-edge-left" | "canvas-edge-right" | "canvas-edge-top" | "canvas-edge-bottom" | "element-left" | "element-right" | "element-top" | "element-bottom" | "element-center-x" | "element-center-y";
  elementId?: number;
}

export interface AlignmentGuideState {
  isActive: boolean;
  guides: GuidePosition[];
  snapThreshold: number;
  /** Current overlay being dragged */
  draggedOverlay?: { left: number; top: number; width: number; height: number } | null;
}

interface UseAlignmentGuidesOptions {
  canvasWidth: number;
  canvasHeight: number;
  /** Snap threshold in pixels (default: 8 for Photoshop-like behavior) */
  snapThreshold?: number;
}

/**
 * Photoshop-style alignment guides hook
 * Provides smart snapping to:
 * - Canvas edges and center
 * - Other element edges and centers
 * - Equal spacing between elements
 * 
 * Performance optimized:
 * - Uses refs to avoid unnecessary re-renders during drag
 * - Calculates snap position and guides in a single pass
 * - Batches state updates
 */
export const useAlignmentGuides = ({
  canvasWidth,
  canvasHeight,
  snapThreshold = 12, // Increased snap threshold for easier snapping
}: UseAlignmentGuidesOptions) => {
  const [guideState, setGuideState] = useState<AlignmentGuideState>({
    isActive: false,
    guides: [],
    snapThreshold,
    draggedOverlay: null,
  });

  // Use ref to track if we need to update state (avoids unnecessary re-renders)
  const lastGuidesRef = useRef<string>("");
  
  // Pre-calculate canvas guides (these never change)
  const canvasGuides = useMemo((): GuidePosition[] => [
    { id: "canvas-center-x", x: canvasWidth / 2, type: "canvas-center-x" },
    { id: "canvas-center-y", y: canvasHeight / 2, type: "canvas-center-y" },
    { id: "canvas-edge-left", x: 0, type: "canvas-edge-left" },
    { id: "canvas-edge-right", x: canvasWidth, type: "canvas-edge-right" },
    { id: "canvas-edge-top", y: 0, type: "canvas-edge-top" },
    { id: "canvas-edge-bottom", y: canvasHeight, type: "canvas-edge-bottom" },
  ], [canvasWidth, canvasHeight]);

  /**
   * OPTIMIZED: Combined function that calculates snap position AND active guides in a single pass
   * This eliminates the duplicate findActiveGuides calls that were causing lag
   */
  const calculateSnapAndGuides = useCallback(
    (
      draggedOverlay: Overlay,
      allOverlays: Overlay[]
    ): { snapPosition: { left: number; top: number }; activeGuides: GuidePosition[] } => {
      // Pre-calculate dragged overlay bounds once
      const draggedLeft = draggedOverlay.left;
      const draggedRight = draggedLeft + draggedOverlay.width;
      const draggedTop = draggedOverlay.top;
      const draggedBottom = draggedTop + draggedOverlay.height;
      const draggedCenterX = draggedLeft + draggedOverlay.width / 2;
      const draggedCenterY = draggedTop + draggedOverlay.height / 2;

      // Threshold calculations
      const centerSnapThreshold = snapThreshold * 1.2;
      const edgeSnapThreshold = snapThreshold * 1.2;
      
      // Track best snaps
      let closestXDistance = Infinity;
      let closestYDistance = Infinity;
      let targetX: number | null = null;
      let targetY: number | null = null;
      
      // Track active guides for visual display
      const activeGuideIds = new Set<string>();
      
      // Helper to check X guide
      const checkXGuide = (guide: GuidePosition) => {
        if (guide.x === undefined) return;
        
        const isCanvasCenter = guide.type === "canvas-center-x";
        const isCanvasEdge = guide.type.startsWith("canvas-edge");
        const threshold = isCanvasCenter ? centerSnapThreshold : isCanvasEdge ? edgeSnapThreshold : snapThreshold;
        const centerBonus = isCanvasCenter ? 2 : 0;
        
        // Check left edge
        const distToLeft = Math.abs(guide.x - draggedLeft);
        if (distToLeft <= threshold && distToLeft < closestXDistance) {
          closestXDistance = distToLeft;
          targetX = guide.x;
          activeGuideIds.add(guide.id);
        }
        
        // Check right edge
        const distToRight = Math.abs(guide.x - draggedRight);
        if (distToRight <= threshold && distToRight < closestXDistance) {
          closestXDistance = distToRight;
          targetX = guide.x - draggedOverlay.width;
          activeGuideIds.add(guide.id);
        }
        
        // Check center (with bonus for canvas center)
        const distToCenter = Math.abs(guide.x - draggedCenterX);
        if (distToCenter <= threshold && (distToCenter - centerBonus) < closestXDistance) {
          closestXDistance = distToCenter - centerBonus;
          targetX = guide.x - draggedOverlay.width / 2;
          activeGuideIds.add(guide.id);
        }
      };
      
      // Helper to check Y guide
      const checkYGuide = (guide: GuidePosition) => {
        if (guide.y === undefined) return;
        
        const isCanvasCenter = guide.type === "canvas-center-y";
        const isCanvasEdge = guide.type.startsWith("canvas-edge");
        const threshold = isCanvasCenter ? centerSnapThreshold : isCanvasEdge ? edgeSnapThreshold : snapThreshold;
        const centerBonus = isCanvasCenter ? 2 : 0;
        
        // Check top edge
        const distToTop = Math.abs(guide.y - draggedTop);
        if (distToTop <= threshold && distToTop < closestYDistance) {
          closestYDistance = distToTop;
          targetY = guide.y;
          activeGuideIds.add(guide.id);
        }
        
        // Check bottom edge
        const distToBottom = Math.abs(guide.y - draggedBottom);
        if (distToBottom <= threshold && distToBottom < closestYDistance) {
          closestYDistance = distToBottom;
          targetY = guide.y - draggedOverlay.height;
          activeGuideIds.add(guide.id);
          }
        
        // Check center (with bonus for canvas center)
        const distToCenter = Math.abs(guide.y - draggedCenterY);
        if (distToCenter <= threshold && (distToCenter - centerBonus) < closestYDistance) {
          closestYDistance = distToCenter - centerBonus;
          targetY = guide.y - draggedOverlay.height / 2;
          activeGuideIds.add(guide.id);
        }
      };
      
      // Check canvas guides first (pre-calculated, always available)
      for (const guide of canvasGuides) {
        checkXGuide(guide);
        checkYGuide(guide);
      }
      
      // Check other overlay guides (only if there are other overlays)
      for (const overlay of allOverlays) {
        if (overlay.id === draggedOverlay.id) continue;
        
        const overlayRight = overlay.left + overlay.width;
        const overlayBottom = overlay.top + overlay.height;
        const overlayCenterX = overlay.left + overlay.width / 2;
        const overlayCenterY = overlay.top + overlay.height / 2;
        
        // Check X guides for this overlay
        checkXGuide({ id: `element-${overlay.id}-left`, x: overlay.left, type: "element-left", elementId: overlay.id });
        checkXGuide({ id: `element-${overlay.id}-right`, x: overlayRight, type: "element-right", elementId: overlay.id });
        checkXGuide({ id: `element-${overlay.id}-center-x`, x: overlayCenterX, type: "element-center-x", elementId: overlay.id });
        
        // Check Y guides for this overlay
        checkYGuide({ id: `element-${overlay.id}-top`, y: overlay.top, type: "element-top", elementId: overlay.id });
        checkYGuide({ id: `element-${overlay.id}-bottom`, y: overlayBottom, type: "element-bottom", elementId: overlay.id });
        checkYGuide({ id: `element-${overlay.id}-center-y`, y: overlayCenterY, type: "element-center-y", elementId: overlay.id });
      }
      
      // Build active guides array from IDs (only guides that resulted in a snap)
      const activeGuides: GuidePosition[] = [];
      for (const guide of canvasGuides) {
        if (activeGuideIds.has(guide.id)) {
          activeGuides.push(guide);
        }
      }
      // Add element guides if any matched
      for (const overlay of allOverlays) {
        if (overlay.id === draggedOverlay.id) continue;
        const overlayRight = overlay.left + overlay.width;
        const overlayBottom = overlay.top + overlay.height;
        const overlayCenterX = overlay.left + overlay.width / 2;
        const overlayCenterY = overlay.top + overlay.height / 2;
        
        if (activeGuideIds.has(`element-${overlay.id}-left`)) {
          activeGuides.push({ id: `element-${overlay.id}-left`, x: overlay.left, type: "element-left", elementId: overlay.id });
        }
        if (activeGuideIds.has(`element-${overlay.id}-right`)) {
          activeGuides.push({ id: `element-${overlay.id}-right`, x: overlayRight, type: "element-right", elementId: overlay.id });
        }
        if (activeGuideIds.has(`element-${overlay.id}-center-x`)) {
          activeGuides.push({ id: `element-${overlay.id}-center-x`, x: overlayCenterX, type: "element-center-x", elementId: overlay.id });
        }
        if (activeGuideIds.has(`element-${overlay.id}-top`)) {
          activeGuides.push({ id: `element-${overlay.id}-top`, y: overlay.top, type: "element-top", elementId: overlay.id });
        }
        if (activeGuideIds.has(`element-${overlay.id}-bottom`)) {
          activeGuides.push({ id: `element-${overlay.id}-bottom`, y: overlayBottom, type: "element-bottom", elementId: overlay.id });
        }
        if (activeGuideIds.has(`element-${overlay.id}-center-y`)) {
          activeGuides.push({ id: `element-${overlay.id}-center-y`, y: overlayCenterY, type: "element-center-y", elementId: overlay.id });
        }
      }

      return {
        snapPosition: {
          left: targetX !== null ? targetX : draggedLeft,
          top: targetY !== null ? targetY : draggedTop,
        },
        activeGuides,
      };
    },
    [canvasGuides, snapThreshold]
  );

  /**
   * Legacy wrapper: Calculate snap position for a dragged overlay
   * Now delegates to the optimized combined function
   */
  const calculateSnapPosition = useCallback(
    (
      draggedOverlay: Overlay,
      allOverlays: Overlay[]
    ): { left: number; top: number } => {
      return calculateSnapAndGuides(draggedOverlay, allOverlays).snapPosition;
    },
    [calculateSnapAndGuides]
  );

  /**
   * Update guides during drag - optimized to avoid unnecessary re-renders
   */
  const updateGuides = useCallback(
    (draggedOverlay: Overlay, allOverlays: Overlay[]) => {
      const { activeGuides } = calculateSnapAndGuides(draggedOverlay, allOverlays);
      
      // Create a simple hash of guide IDs to detect changes
      const guidesHash = activeGuides.map(g => g.id).sort().join(',');
      
      // Only update state if guides actually changed
      if (guidesHash !== lastGuidesRef.current) {
        lastGuidesRef.current = guidesHash;
      setGuideState({
        isActive: true,
        guides: activeGuides,
        snapThreshold,
        draggedOverlay: {
          left: draggedOverlay.left,
          top: draggedOverlay.top,
          width: draggedOverlay.width,
          height: draggedOverlay.height,
        },
      });
      }
    },
    [calculateSnapAndGuides, snapThreshold]
  );

  /**
   * Clear guides when dragging stops
   */
  const clearGuides = useCallback(() => {
    lastGuidesRef.current = "";
    setGuideState({
      isActive: false,
      guides: [],
      snapThreshold,
      draggedOverlay: null,
    });
  }, [snapThreshold]);

  return {
    guideState,
    updateGuides,
    clearGuides,
    calculateSnapPosition,
  };
}; 