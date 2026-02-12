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

import React, { useRef, useMemo, useCallback, useEffect } from 'react';
import { Container, Graphics } from 'pixi.js';
import { Application, extend } from '@pixi/react';
import type { ApplicationRef } from '@pixi/react';
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
const GROUP_HEADER_HEIGHT = 24; // Must match canvas-timeline-utils.ts

/** Visual config for each group header in the canvas */
const GROUP_CONFIG: Record<string, { accentColor: number; bgColor: number; label: string }> = {
  video:    { accentColor: 0x0891b2, bgColor: 0x0f1717, label: '🎬 VIDEO' },
  overlays: { accentColor: 0x7c3aed, bgColor: 0x13101a, label: '🎭 OVERLAYS' },
  text:     { accentColor: 0xd97706, bgColor: 0x1a1508, label: '✏️ TEXT' },
  effects:  { accentColor: 0x9333ea, bgColor: 0x150f1a, label: '✨ EFFECTS' },
  audio:    { accentColor: 0x16a34a, bgColor: 0x0f1a14, label: '🔊 AUDIO' },
};
const GROUP_ORDER: string[] = ['video', 'overlays', 'text', 'effects', 'audio'];

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
  /** Set of collapsed track group names */
  collapsedGroups?: Set<string>;
  /** Callback when user clicks on a transition zone */
  onTransitionClick?: (transitionId: string) => void;
  /** Currently selected transition ID */
  selectedTransitionId?: string | null;
  /** Callback when user starts resizing a transition */
  onTransitionResizeStart?: (
    transitionId: string,
    clientX: number,
    clientY: number,
    side: 'left' | 'right',
  ) => void;
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
  collapsedGroups,
  onTransitionClick,
  selectedTransitionId,
  onTransitionResizeStart,
}: Omit<CanvasTimelineProps, 'scrollX' | 'scrollY' | 'zoomScale'>) {
  const trackHeight = propTrackHeight || TIMELINE_CONSTANTS.TRACK_HEIGHT;

  // Compute total content height for all tracks (including spacers and dividers)
  const contentHeight = useMemo(
    () => getTotalContentHeight(tracks, trackHeight, collapsedGroups),
    [tracks, trackHeight, collapsedGroups],
  );

  // Compute playhead X position
  const playheadX = useMemo(() => {
    if (fps <= 0 || scrollableDuration <= 0) return 0;
    const currentTime = currentFrame / fps;
    return timeToX(currentTime, scrollableDuration, scrollableWidth);
  }, [currentFrame, fps, scrollableDuration, scrollableWidth]);

  // Compute track Y positions (only for non-collapsed groups)
  const trackLayouts = useMemo(() => {
    const layouts: Array<{ track: TrackWithClips; y: number; index: number }> = [];
    for (let i = 0; i < tracks.length; i++) {
      // Determine group for this track
      const group = tracks[i].group || (tracks[i].type === 'audio' ? 'audio' : 'video');
      if (collapsedGroups?.has(group)) continue; // skip collapsed
      layouts.push({
        track: tracks[i],
        y: getTrackYOffset(i, trackHeight, tracks, collapsedGroups),
        index: i,
      });
    }
    return layouts;
  }, [tracks, trackHeight, collapsedGroups]);

  // Compute group header positions
  const groupHeaders = useMemo(() => {
    // Build group layout (same logic as utils)
    const byGroup = new Map<string, number[]>();
    for (const g of GROUP_ORDER) byGroup.set(g, []);
    for (let i = 0; i < tracks.length; i++) {
      const g = tracks[i].group || (tracks[i].type === 'audio' ? 'audio' : 'video');
      const list = byGroup.get(g);
      if (list) list.push(i);
      else byGroup.get('video')!.push(i);
    }

    const headers: Array<{ group: string; y: number }> = [];
    let y = 0;
    for (const g of GROUP_ORDER) {
      const indices = byGroup.get(g)!;
      // Always show all group categories
      headers.push({ group: g, y });
      y += GROUP_HEADER_HEIGHT;
      // Only add track heights if group is NOT collapsed
      if (!collapsedGroups?.has(g)) {
        y += indices.length * trackHeight;
      }
    }
    return headers;
  }, [tracks, trackHeight, collapsedGroups]);

  // No internal transform — the parent DOM div in timeline-content.tsx
  // already applies transform: translate(virtualTransform.x, virtualTransform.y)
  return (
    <pixiContainer>
      {/* Group header bars */}
      {groupHeaders.map(({ group, y }) => {
        const cfg = GROUP_CONFIG[group] || GROUP_CONFIG.video;
        return (
          <pixiGraphics
            key={`header-${group}`}
            y={y}
            draw={(g: Graphics) => {
              g.clear();
              // Background fill
              g.rect(0, 0, scrollableWidth, GROUP_HEADER_HEIGHT);
              g.fill({ color: cfg.bgColor });
              // Left accent bar (3px)
              g.rect(0, 0, 3, GROUP_HEADER_HEIGHT);
              g.fill({ color: cfg.accentColor, alpha: 0.9 });
              // Bottom border
              g.moveTo(0, GROUP_HEADER_HEIGHT - 0.5);
              g.lineTo(scrollableWidth, GROUP_HEADER_HEIGHT - 0.5);
              g.stroke({ color: 0x333333, width: 1, alpha: 0.6 });
            }}
          />
        );
      })}

      {/* Tracks */}
      {trackLayouts.map(({ track, y }) => (
        <CanvasTimelineTrack
          key={track.id}
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
          onTransitionClick={onTransitionClick}
          selectedTransitionId={selectedTransitionId}
          onTransitionResizeStart={onTransitionResizeStart}
        />
      ))}

      {/* Bottom spacer */}
      <pixiGraphics
        y={contentHeight - trackHeight / 2}
        draw={(g: Graphics) => {
          g.clear();
          g.rect(0, 0, scrollableWidth, trackHeight / 2);
          g.fill({ color: 0x000000 });
        }}
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
  collapsedGroups,
  onTransitionClick,
  selectedTransitionId,
  onTransitionResizeStart,
}: CanvasTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<ApplicationRef>(null);

  // Keep canvas resolution in sync with display — fixes blurry canvas
  // after fullscreen toggle or any container resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let debounceTimer: ReturnType<typeof setTimeout>;

    const syncResolution = () => {
      const app = appRef.current?.getApplication();
      if (!app?.renderer) return;
      const dpr = window.devicePixelRatio || 1;
      // Only update if resolution actually changed
      if (app.renderer.resolution !== dpr) {
        app.renderer.resolution = dpr;
      }
      // Always re-apply size to rebuild framebuffer at correct resolution
      app.renderer.resize(container.clientWidth, container.clientHeight);
    };

    const debouncedSync = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(syncResolution, 100);
    };

    const ro = new ResizeObserver(debouncedSync);
    ro.observe(container);
    document.addEventListener('fullscreenchange', debouncedSync);

    return () => {
      clearTimeout(debounceTimer);
      ro.disconnect();
      document.removeEventListener('fullscreenchange', debouncedSync);
    };
  }, []);

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
        ref={appRef}
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
          collapsedGroups={collapsedGroups}
          onTransitionClick={onTransitionClick}
          selectedTransitionId={selectedTransitionId}
          onTransitionResizeStart={onTransitionResizeStart}
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
