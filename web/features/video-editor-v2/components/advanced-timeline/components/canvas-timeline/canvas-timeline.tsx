'use client';

/**
 * CanvasTimeline — Top-level canvas wrapper for the timeline tracks area
 *
 * This is the main integration point. It renders a PixiJS Application
 * that fills the tracks area and draws all tracks and items on the GPU.
 *
 * Architecture:
 * ┌─────────────────────────────────────────────────────┐
 * │ timeline-content.tsx (DOM)                          │
 * │ ┌─────────────────────────────────────────────────┐ │
 * │ │ <Application> (PixiJS)                          │ │
 * │ │   <Container> ← scrollX/scrollY transform       │ │
 * │ │     <CanvasTimelineTrack> per track             │ │
 * │ │       <CanvasTimelineItem> per item             │ │
 * │ │     <CanvasPlayhead>                            │ │
 * │ │   </Container>                                  │ │
 * │ └─────────────────────────────────────────────────┘ │
 * │ [DOM overlays: guidelines, marquee, context menu]   │
 * └─────────────────────────────────────────────────────┘
 *
 * This component:
 * - Creates a PixiJS Application sized to the container
 * - Auto-resizes when the container resizes
 * - Applies scroll/zoom transforms to a root Container
 * - Renders all visible tracks and their items
 * - Renders the playhead line
 * - Forwards interaction events (drag, select, context menu) to parent
 * - Keeps all existing business logic untouched (store, hooks, selectors)
 */

import React, { useRef, useMemo, useCallback } from 'react';
import { Container, Graphics } from 'pixi.js';
import { Application, extend } from '@pixi/react';
import { CanvasTimelineTrack } from './canvas-timeline-track';
import { CanvasPlayhead } from './canvas-playhead';
import {
  timeToX,
  getTrackYOffset,
  getTotalContentHeight,
} from './canvas-timeline-utils';
import { useCanvasKeyboard } from './use-canvas-keyboard';
import { CanvasTimelineAria } from './canvas-timeline-aria';
import type { CanvasContextMenuData } from './canvas-timeline-item';
import type { TrackWithClips, TimelineItem } from '../../../../stores/memoized-selectors';
import { TIMELINE_CONSTANTS } from '../../constants';

extend({ Container, Graphics });

// ============================================================
// CONSTANTS
// ============================================================

const CANVAS_BG = 0x0a0a0a; // Near-black background (matches neutral-950)
const ADD_BUTTON_HEIGHT = 28; // Matches h-7 Add Video Track spacer
const DIVIDER_BG = 0x262626; // neutral-800

// ============================================================
// TYPES
// ============================================================

export interface CanvasTimelineProps {
  /** Sorted tracks with embedded items (from selectTracksWithClips) */
  tracks: TrackWithClips[];
  /** Scrollable duration in seconds (content + buffer) */
  scrollableDuration: number;
  /** Scrollable width in pixels */
  scrollableWidth: number;
  /** Current horizontal scroll offset (pixels, negative for right-scroll) */
  scrollX: number;
  /** Current vertical scroll offset (pixels, negative for down-scroll) */
  scrollY: number;
  /** Current zoom scale */
  zoomScale: number;
  /** Currently selected item IDs */
  selectedItemIds: string[];
  /** Current playback frame */
  currentFrame: number;
  /** Frames per second */
  fps: number;
  /** Track height override (or undefined for default) */
  trackHeight?: number;
  /** Whether splitting mode is active */
  splittingEnabled?: boolean;
  /** Callback when an item is clicked/selected */
  onItemSelect?: (itemId: string) => void;
  /** Callback for multi-select (Shift+click) */
  onSelectionChange?: (itemId: string, isMultiple: boolean) => void;
  /** Callback to initiate drag/resize (bridges to useTimelineDragAndDrop) */
  onDragStart?: (
    item: TimelineItem,
    clientX: number,
    clientY: number,
    action: 'move' | 'resize-start' | 'resize-end',
    selectedItemIds: string[],
  ) => void;
  /** Callback for right-click context menu */
  onContextMenu?: (data: CanvasContextMenuData) => void;
  /** Callback when empty track area is clicked (move playhead) */
  onTimeClick?: (timeInSeconds: number) => void;
  /** Callback to request zoom change: delta > 0 = zoom in, < 0 = zoom out */
  onZoomChange?: (delta: number) => void;
  /** Callback to zoom timeline to fit entire duration */
  onZoomToFit?: () => void;
}

// ============================================================
// INTERNAL COMPONENTS
// ============================================================

/**
 * Inner canvas content — separated so it can use useApplication() hook.
 * The PixiJS Application must be the parent for context to work.
 */
function CanvasTimelineContent({
  tracks,
  scrollableDuration,
  scrollableWidth,
  selectedItemIds,
  currentFrame,
  fps,
  trackHeight: propTrackHeight,
  splittingEnabled,
  onItemSelect,
  onSelectionChange,
  onDragStart,
  onContextMenu,
  onTimeClick,
}: Omit<CanvasTimelineProps, 'scrollX' | 'scrollY' | 'zoomScale'>) {
  const trackHeight = propTrackHeight || TIMELINE_CONSTANTS.TRACK_HEIGHT;

  // Compute total content height for all tracks (including spacers and dividers)
  const contentHeight = useMemo(
    () => getTotalContentHeight(tracks, trackHeight),
    [tracks, trackHeight],
  );

  // Compute playhead X position
  const playheadX = useMemo(() => {
    if (fps <= 0 || scrollableDuration <= 0) return 0;
    const currentTime = currentFrame / fps;
    return timeToX(currentTime, scrollableDuration, scrollableWidth);
  }, [currentFrame, fps, scrollableDuration, scrollableWidth]);

  // Compute track Y positions and detect video/audio dividers
  const trackLayouts = useMemo(() => {
    const layouts: Array<{
      track: TrackWithClips;
      y: number;
      showDividerBefore: boolean;
    }> = [];

    for (let i = 0; i < tracks.length; i++) {
      const previousTrack = i > 0 ? tracks[i - 1] : null;
      const showDividerBefore = previousTrack?.type === 'video' && tracks[i].type === 'audio';

      layouts.push({
        track: tracks[i],
        y: getTrackYOffset(i, trackHeight, tracks),
        showDividerBefore,
      });
    }

    return layouts;
  }, [tracks, trackHeight]);

  // Draw the top spacer (Add Video Track button area)
  const drawTopSpacer = useCallback(
    (g: Graphics) => {
      g.clear();
      g.rect(0, 0, scrollableWidth, ADD_BUTTON_HEIGHT);
      g.fill({ color: 0x171717 }); // neutral-900

      // Bottom border
      g.moveTo(0, ADD_BUTTON_HEIGHT - 0.5);
      g.lineTo(scrollableWidth, ADD_BUTTON_HEIGHT - 0.5);
      g.stroke({ color: 0x404040, width: 1, alpha: 0.8 }); // neutral-700
    },
    [scrollableWidth],
  );

  // Draw section dividers between video and audio tracks
  const drawDivider = useCallback(
    (g: Graphics) => {
      g.clear();
      const dividerHeight = trackHeight / 2;
      g.rect(0, 0, scrollableWidth, dividerHeight);
      g.fill({ color: DIVIDER_BG });

      // Bottom border
      g.moveTo(0, dividerHeight - 0.5);
      g.lineTo(scrollableWidth, dividerHeight - 0.5);
      g.stroke({ color: 0x404040, width: 1, alpha: 0.8 });
    },
    [scrollableWidth, trackHeight],
  );

  // Draw hidden audio divider at bottom (when no audio tracks)
  const hasAudioTracks = useMemo(
    () => tracks.some(t => t.type === 'audio'),
    [tracks],
  );

  // Bottom spacer Y position
  const bottomSpacerY = useMemo(
    () =>
      tracks.length > 0
        ? getTrackYOffset(tracks.length, trackHeight, tracks)
        : ADD_BUTTON_HEIGHT,
    [tracks, trackHeight],
  );

  const drawBottomSpacer = useCallback(
    (g: Graphics) => {
      g.clear();
      const spacerHeight = trackHeight / 2;
      g.rect(0, 0, scrollableWidth, spacerHeight);
      g.fill({ color: 0x000000 }); // black
    },
    [scrollableWidth, trackHeight],
  );

  // No internal transform — the parent DOM div in timeline-content.tsx
  // already applies transform: translate(virtualTransform.x, virtualTransform.y)
  // which moves the entire canvas element. Items are at absolute positions.
  return (
    <pixiContainer>
      {/* Top spacer (Add Video Track button area) */}
      <pixiGraphics draw={drawTopSpacer} />

      {/* Tracks */}
      {trackLayouts.map(({ track, y, showDividerBefore }) => (
        <React.Fragment key={track.id}>
          {/* Video/Audio divider */}
          {showDividerBefore && (
            <pixiGraphics
              draw={drawDivider}
              y={y - trackHeight / 2}
            />
          )}

          <CanvasTimelineTrack
            track={track}
            y={y}
            totalDuration={scrollableDuration}
            totalWidth={scrollableWidth}
            trackHeight={trackHeight}
            selectedItemIds={selectedItemIds}
            splittingEnabled={splittingEnabled}
            onItemSelect={onItemSelect}
            onSelectionChange={onSelectionChange}
            onDragStart={onDragStart}
            onContextMenu={onContextMenu}
            onTimeClick={onTimeClick}
          />
        </React.Fragment>
      ))}

      {/* Bottom spacer for audio section */}
      {!hasAudioTracks && (
        <pixiGraphics
          draw={drawDivider}
          y={bottomSpacerY}
        />
      )}
      <pixiGraphics
        draw={drawBottomSpacer}
        y={bottomSpacerY + (!hasAudioTracks ? trackHeight / 2 : 0)}
      />

      {/* Playhead line (rendered on top of all tracks) */}
      <CanvasPlayhead
        x={playheadX}
        height={contentHeight}
      />
    </pixiContainer>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function CanvasTimeline({
  tracks,
  scrollableDuration,
  scrollableWidth,
  scrollX,
  scrollY,
  zoomScale,
  selectedItemIds,
  currentFrame,
  fps,
  trackHeight,
  splittingEnabled,
  onItemSelect,
  onSelectionChange,
  onDragStart,
  onContextMenu,
  onTimeClick,
  onZoomChange,
  onZoomToFit,
}: CanvasTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Professional keyboard shortcuts (JKL shuttle, split, delete, nudge, etc.)
  const { handleKeyDown } = useCanvasKeyboard({
    tracks,
    selectedItemIds,
    onItemSelect,
    onSelectionChange,
    onZoomChange,
    onZoomToFit,
  });

  return (
    <div
      ref={containerRef}
      className="canvas-timeline-container"
      role="application"
      aria-label="Timeline editor"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        outline: 'none',
      }}
    >
      <Application
        resizeTo={containerRef}
        background={CANVAS_BG}
        antialias
        resolution={typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1}
        autoDensity
      >
        <CanvasTimelineContent
          tracks={tracks}
          scrollableDuration={scrollableDuration}
          scrollableWidth={scrollableWidth}
          selectedItemIds={selectedItemIds}
          currentFrame={currentFrame}
          fps={fps}
          trackHeight={trackHeight}
          splittingEnabled={splittingEnabled}
          onItemSelect={onItemSelect}
          onSelectionChange={onSelectionChange}
          onDragStart={onDragStart}
          onContextMenu={onContextMenu}
          onTimeClick={onTimeClick}
        />
      </Application>

      {/* Hidden DOM mirror for screen readers */}
      <CanvasTimelineAria
        tracks={tracks}
        selectedItemIds={selectedItemIds}
        fps={fps}
      />
    </div>
  );
}
