import React, { useCallback, useMemo } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import type { FontInfo } from "@remotion/google-fonts";

import { Overlay } from "../../types";
import { SortedOutlines } from "../../components/selection/sorted-outlines";
import { Layer } from "./layer";
import { AlignmentGuides } from "../../components/selection/alignment-guides";
import { useAlignmentGuides } from "../../hooks/use-alignment-guides";


/**
 * Props for the Main component
 */
export type MainProps = {
  /** Array of overlay objects to be rendered */
  readonly overlays: Overlay[];
  /** Function to set the currently selected overlay ID */
  readonly setSelectedOverlayId: React.Dispatch<
    React.SetStateAction<number | null>
  >;
  /** Currently selected overlay ID, or null if none selected */
  readonly selectedOverlayId: number | null;
  /**
   * Function to update an overlay
   * @param overlayId - The ID of the overlay to update
   * @param updater - Function that receives the current overlay and returns an updated version
   */
  readonly changeOverlay: (
    overlayId: number,
    updater: (overlay: Overlay) => Overlay
  ) => void;
  /** Duration in frames of the composition */
  readonly durationInFrames: number;
  /** Frames per second of the composition */
  readonly fps: number;
  /** Width of the composition */
  readonly width: number;
  /** Height of the composition */
  readonly height: number;
  /** Base URL for media assets (optional) */
  readonly baseUrl?: string;
  /** Whether to show alignment guides */
  readonly showAlignmentGuides?: boolean;
  /** Background color for the canvas */
  readonly backgroundColor?: string;
  /** Font infos for rendering (populated during SSR/Lambda rendering) */
  readonly fontInfos?: Record<string, FontInfo>;
};

const outer: React.CSSProperties = {
  backgroundColor: "white",
};
const layerContainer: React.CSSProperties = {
  overflow: "hidden",
  maxWidth: "3000px",
  // PERF: Isolate overlay rendering from the rest of the UI
  contain: "layout style",
};

/**
 * Main component that renders a canvas-like area with overlays and their outlines.
 * Handles selection of overlays and provides a container for editing them.
 *
 * @param props - Component props of type MainProps
 * @returns React component that displays overlays and their interactive outlines
 */
export const Main: React.FC<MainProps> = ({
  overlays,
  setSelectedOverlayId,
  selectedOverlayId,
  changeOverlay,
  width,
  height,
  baseUrl,
  showAlignmentGuides = true,
  backgroundColor = "white",
  fontInfos,
}) => {
  // Initialize alignment guides hook with generous snap threshold for easier snapping
  // Use 15px or 1.5% of the smaller dimension - more forgiving and professional feeling
  const snapThreshold = Math.max(15, Math.min(width, height) * 0.015);
  const alignmentGuides = useAlignmentGuides({
    canvasWidth: width,
    canvasHeight: height,
    snapThreshold,
  });

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) {
        return;
      }

      setSelectedOverlayId(null);
    },
    [setSelectedOverlayId]
  );

  // Virtualize overlays — only render those visible at the current frame
  // Uses a 30-frame premount buffer (matching Layer's Sequence premountFor={30})
  const frame = useCurrentFrame();
  const PREMOUNT_BUFFER = 30;
  const visibleOverlays = useMemo(() => {
    return overlays.filter((overlay) => {
      if ((overlay as any).hidden) return false;
      const start = overlay.from - PREMOUNT_BUFFER;
      const end = overlay.from + overlay.durationInFrames;
      return frame >= start && frame < end;
    });
  }, [overlays, frame]);

  return (
    <AbsoluteFill
      style={{
        ...outer,
        backgroundColor,
      }}
      onPointerDown={onPointerDown}
    >
      <AbsoluteFill style={layerContainer}>
        {/* Only render overlays visible at current frame (virtualized) */}
        {visibleOverlays.map((overlay) => {
          return (
            <Layer
              key={overlay.id}
              overlay={overlay}
              allOverlays={visibleOverlays}
              {...(baseUrl && { baseUrl })}
              {...(fontInfos && { fontInfos })}
            />
          );
        })}
      </AbsoluteFill>
      <SortedOutlines
        selectedOverlayId={selectedOverlayId}
        overlays={visibleOverlays}
        changeOverlay={changeOverlay}
        alignmentGuides={alignmentGuides}
      />
      
      {/* Render alignment guides overlay (Photoshop-style smart guides) */}
      {showAlignmentGuides && (
        <AlignmentGuides
          guideState={alignmentGuides.guideState}
          canvasWidth={width}
          canvasHeight={height}
        />
      )}
    </AbsoluteFill>
  );
};