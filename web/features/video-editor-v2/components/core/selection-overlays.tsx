/**
 * SelectionOverlays — Lightweight component that manages mask/shape overlays
 * for the currently selected clip.
 * 
 * PERF: Extracted from VideoPlayer so that selection changes only re-render
 * this small component, NOT the entire VideoPlayer (which includes the 
 * expensive Remotion <Player>). VideoPlayer no longer subscribes to
 * selectedClipIds at all.
 */
import React, { useMemo, useCallback } from "react";
import { useVideoEditorStore, useTypedStore } from "../../stores/video-editor-store";
import { useShallow } from "zustand/react/shallow";
import type { TimelineClip } from "../../types/timeline-v2";
import { MaskManipulationOverlay } from "./mask-manipulation-overlay";
import { ShapeManipulationOverlay } from "./shape-manipulation-overlay";
import { Mask } from "../../types/masks";
import { ShapeOverlay } from "../../types";
import { getInterpolatedValue } from "../../utils/keyframe-interpolator";
import type { PropertyKeyframes } from "../../types/keyframes";

interface SelectionOverlaysProps {
  /** Dimensions of the rendered video area for coordinate mapping */
  videoAreaDimensions: {
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
  };
  /** Composition dimensions */
  compositionWidth: number;
  compositionHeight: number;
  /** Aspect ratio string like '16:9' */
  aspectRatio: string;
  /** FPS for keyframe interpolation */
  fps: number;
}

/**
 * Renders mask and shape manipulation overlays for the currently selected clip.
 * Isolated from VideoPlayer to prevent selection changes from re-rendering the
 * entire Remotion Player composition.
 */
export const SelectionOverlays: React.FC<SelectionOverlaysProps> = ({
  videoAreaDimensions,
  compositionWidth,
  compositionHeight,
  aspectRatio,
  fps,
}) => {
  // PERF: Only this small component subscribes to selection, not VideoPlayer
  const selectedClipIds = useTypedStore(useShallow(state => state.selection?.clipIds)) || [];
  const updateClip = useTypedStore(state => state.updateClip);
  // PERF: currentTime subscription moved here from VideoPlayer — avoids VideoPlayer
  // re-rendering every 500ms during playback just to pass this value down.
  const currentTime = useTypedStore(state => state.playback?.currentTime) || 0;

  // PERF: Direct O(1) lookup instead of subscribing to ALL clips via selectClipsArray.
  // This removes the subscription to state.clips entirely — this component
  // only re-renders when selectedClipIds or currentTime changes.
  const selectedClip = useMemo(() => {
    if (selectedClipIds.length !== 1) return null;
    const state = useVideoEditorStore.getState();
    return (state.clips[selectedClipIds[0]] as TimelineClip) || null;
  }, [selectedClipIds]);

  const selectedClipMasks = useMemo(() => {
    return (selectedClip?.masks as Mask[]) || [];
  }, [selectedClip]);

  // Calculate overlay bounds (composition pixel coords → rendered pixel coords)
  const overlayBounds = useMemo(() => {
    if (!selectedClip || videoAreaDimensions.width === 0) {
      return { x: 0, y: 0, width: videoAreaDimensions.width, height: videoAreaDimensions.height };
    }

    const scaleX = videoAreaDimensions.width / compositionWidth;
    const scaleY = videoAreaDimensions.height / compositionHeight;

    // Calculate time relative to clip start for keyframe interpolation
    const clipRelativeTime = Math.max(0, currentTime - selectedClip.startTime);

    // Helper to get interpolated value for a property using the find pattern
    const getAnimatedValue = (propertyPath: string, defaultValue: number): number => {
      if (!selectedClip.keyframes) return defaultValue;
      const keyframesArray = selectedClip.keyframes as PropertyKeyframes[];
      const propKf = keyframesArray.find(
        (pk: PropertyKeyframes) => pk.propertyPath === propertyPath
      );
      if (!propKf || !propKf.enabled || propKf.keyframes.length === 0) {
        return defaultValue;
      }
      const interpolated = getInterpolatedValue(propKf, clipRelativeTime, defaultValue);
      return typeof interpolated === 'number' ? interpolated : defaultValue;
    };

    // Get clip's transform with keyframe animation support
    const clipX = getAnimatedValue('transform.x', selectedClip.transform?.x ?? 0);
    const clipY = getAnimatedValue('transform.y', selectedClip.transform?.y ?? 0);
    const clipWidth = getAnimatedValue('transform.width', selectedClip.transform?.width ?? compositionWidth);
    const clipHeight = getAnimatedValue('transform.height', selectedClip.transform?.height ?? compositionHeight);

    return {
      x: clipX * scaleX,
      y: clipY * scaleY,
      width: clipWidth * scaleX,
      height: clipHeight * scaleY,
    };
  }, [selectedClip, videoAreaDimensions, compositionWidth, compositionHeight, currentTime]);

  const overlayAspectRatio = useMemo(() => {
    if (overlayBounds.width === 0 || overlayBounds.height === 0) {
      const ratios: Record<string, number> = {
        '16:9': 16/9, '9:16': 9/16, '1:1': 1, '4:3': 4/3, '21:9': 21/9, '4:5': 4/5,
      };
      return ratios[aspectRatio] || 16/9;
    }
    return overlayBounds.width / overlayBounds.height;
  }, [overlayBounds, aspectRatio]);

  const handleUpdateMasks = useCallback((newMasks: Mask[]) => {
    const clipIds = useVideoEditorStore.getState().selection?.clipIds || [];
    if (clipIds.length !== 1) return;
    updateClip(clipIds[0], { masks: newMasks });
  }, [updateClip]);

  const selectedShapeClip = useMemo(() => {
    if (selectedClipIds.length !== 1 || !selectedClip) return null;
    if (selectedClip.type === 'shape') return selectedClip;
    return null;
  }, [selectedClipIds, selectedClip]);

  const handleUpdateShapeStyles = useCallback((styleUpdates: Partial<ShapeOverlay['styles']>) => {
    const store = useVideoEditorStore.getState();
    const clipIds = store.selection?.clipIds || [];
    if (clipIds.length !== 1) return;
    const clip = (Object.values(store.clips) as TimelineClip[]).find(c => c.id === clipIds[0]);
    if (clip && clip.type === 'shape') {
      updateClip(clipIds[0], {
        styles: {
          ...clip.styles,
          ...styleUpdates,
        },
      });
    }
  }, [updateClip]);

  // Don't render anything if nothing is selected
  if (selectedClipIds.length !== 1) return null;

  return (
    <>
      {/* Mask Manipulation Overlay */}
      {selectedClipMasks.length > 0 && overlayBounds.width > 0 && (
        <MaskManipulationOverlay
          containerWidth={overlayBounds.width}
          containerHeight={overlayBounds.height}
          offsetX={videoAreaDimensions.offsetX + overlayBounds.x}
          offsetY={videoAreaDimensions.offsetY + overlayBounds.y}
          clipId={selectedClipIds[0]}
          masks={selectedClipMasks}
          onUpdateMasks={handleUpdateMasks}
          aspectRatio={overlayAspectRatio}
        />
      )}

      {/* Shape Manipulation Overlay */}
      {selectedShapeClip && overlayBounds.width > 0 && (
        <ShapeManipulationOverlay
          containerWidth={overlayBounds.width}
          containerHeight={overlayBounds.height}
          offsetX={videoAreaDimensions.offsetX + overlayBounds.x}
          offsetY={videoAreaDimensions.offsetY + overlayBounds.y}
          shape={selectedShapeClip as any as ShapeOverlay}
          onUpdateShape={handleUpdateShapeStyles}
          aspectRatio={overlayAspectRatio}
        />
      )}
    </>
  );
};
