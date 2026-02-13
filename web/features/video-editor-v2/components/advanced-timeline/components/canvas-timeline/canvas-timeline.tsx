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

import React, { useRef, useMemo, useCallback, useEffect, useState } from 'react';
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
import { TIMELINE_CONSTANTS, TIMELINE_DIMENSIONS_REM } from '../../constants';
import { remToPx } from '../../utils/rem-utils';

extend({ Container, Graphics });

// ============================================================
// CONSTANTS
// ============================================================

const CANVAS_BG = 0x0a0a0a; // Near-black background (matches neutral-950)
const GROUP_HEADER_HEIGHT = TIMELINE_CONSTANTS.GROUP_HEADER_HEIGHT;

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
  /** Track item height override (or undefined for default) */
  trackItemHeight?: number;
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
  /** Ref to canvas container for direct DOM scroll counter-transform */
  canvasContainerRef?: React.MutableRefObject<HTMLDivElement | null>;
}

// ============================================================
// INTERNAL COMPONENTS
// ============================================================

/**
 * Inner canvas content — separated so it can use useApplication() hook.
 * The PixiJS Application must be the parent for context to work.
 * Wrapped in React.memo to prevent cascading re-renders when the parent
 * CanvasTimeline re-renders (e.g. during scroll flush).
 */
const CanvasTimelineContent = React.memo(function CanvasTimelineContent({
  tracks,
  scrollableDuration,
  scrollableWidth,
  scrollX,
  scrollY,
  viewportWidth,
  selectedItemIds,
  currentFrame,
  fps,
  trackHeight: propTrackHeight,
  trackItemHeight: propTrackItemHeight,
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
}: Omit<CanvasTimelineProps, 'zoomScale'> & { viewportWidth: number }) {
  const trackHeight = propTrackHeight || TIMELINE_CONSTANTS.TRACK_HEIGHT;
  const itemHeight = trackHeight - remToPx(TIMELINE_DIMENSIONS_REM.TRACK_ITEM_PADDING);

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

  // SCROLL OFFSET:
  // The PixiJS canvas is viewport-sized, but items are at absolute pixel positions.
  // We shift the PixiJS scene by -scrollOffset so items near the current scroll
  // position land within [0, viewportWidth] and are visible on the canvas.
  // The CSS counter-transform on the canvas div (see CanvasTimeline) keeps the
  // canvas pinned to the viewport despite the parent's scroll transform.
  const scrollOffsetX = scrollX * Math.max(0, scrollableWidth - viewportWidth);
  const scrollOffsetY = scrollY;

  return (
    <pixiContainer x={-scrollOffsetX} y={-scrollOffsetY}>
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
          trackItemHeight={itemHeight}
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
});

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
  canvasContainerRef,
}: CanvasTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<ApplicationRef>(null);

  // Callback ref: assigns both local containerRef AND external canvasContainerRef
  // so useVirtualScroll can update the canvas counter-transform during active scrolling.
  const containerRefCallback = useCallback(
    (node: HTMLDivElement | null) => {
      (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      if (canvasContainerRef) {
        canvasContainerRef.current = node;
      }
    },
    [canvasContainerRef]
  );

  // Measure the VIEWPORT width (the visible scroll container), not the scrollable
  // content width. The parent `timeline-zoomable-content` can be 100,000+ px wide
  // due to zoom, but the canvas must only cover the visible viewport to avoid
  // exceeding GPU texture limits and causing blur.
  const [viewportSize, setViewportSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Find the viewport-sized scroll container (has overflow: hidden)
    const scrollContainer = el.closest('[data-timeline-scroll-container]') as HTMLElement | null;
    const target = scrollContainer || el.parentElement;
    if (!target) return;

    const update = () => {
      setViewportSize({ w: target.clientWidth, h: target.clientHeight });
    };
    update();

    // ResizeObserver: catches layout-driven size changes.
    // Observe both the scroll container AND the editor root so that any ancestor
    // layout change (app sidebar toggle, panel resize, etc.) is detected.
    const ro = new ResizeObserver(update);
    ro.observe(target);
    const editorRoot = el.closest('[data-editor-root]') as HTMLElement | null;
    if (editorRoot) ro.observe(editorRoot);

    // Window resize: browser window resizing, dev tools, tab reshaping.
    window.addEventListener('resize', update);

    // Fullscreen: explicit listener with RAF for immediate post-reflow measurement.
    const onFullscreenChange = () => {
      requestAnimationFrame(update);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);

    // Transition end: re-measure after CSS transitions complete (e.g. app sidebar
    // 300ms width transition) so the final settled size is captured exactly.
    const onTransitionEnd = (e: TransitionEvent) => {
      if (e.propertyName === 'width' || e.propertyName === 'max-width' || e.propertyName === 'flex') {
        requestAnimationFrame(update);
      }
    };
    document.addEventListener('transitionend', onTransitionEnd);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('transitionend', onTransitionEnd);
    };
  }, []);

  // Monkey-patch renderer.resize to ALWAYS enforce correct DPR.
  // `resizeTo` calls renderer.resize() internally and may use resolution=1,
  // causing blurry rendering on high-DPR displays. By wrapping resize(),
  // we guarantee the correct DPR for ALL resize paths (resizeTo, manual, etc.)
  //
  // Uses interval polling because @pixi/react creates the renderer asynchronously
  // — appRef.current.renderer may not exist when the effect first runs.
  useEffect(() => {
    let disposed = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const tryPatch = () => {
      if (disposed) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const app = appRef.current as any;
      const renderer = app?.renderer;
      if (!renderer) return; // Renderer not yet created — retry
      if (renderer.__dprPatched) { clearInterval(intervalId!); return; }

      const dpr = window.devicePixelRatio || 1;
      const originalResize = renderer.resize.bind(renderer);
      renderer.resize = (width: number, height: number, resolution?: number) => {
        renderer.resolution = window.devicePixelRatio || 1;
        originalResize(width, height, resolution);
      };
      renderer.__dprPatched = true;
      renderer.__originalResize = originalResize;

      // Immediately re-resize with correct DPR
      renderer.resolution = dpr;
      const canvas = renderer.canvas || app.canvas;
      if (canvas) {
        const cssW = canvas.clientWidth || (viewportSize?.w ?? 800);
        const cssH = canvas.clientHeight || (viewportSize?.h ?? 400);
        renderer.resize(cssW, cssH);
      }

      console.warn('[CanvasTimeline] DPR patch applied:', {
        dpr,
        rendererResolution: renderer.resolution,
        canvas: canvas ? `${canvas.width}×${canvas.height}` : 'N/A',
      });

      if (intervalId) clearInterval(intervalId);
    };

    // Try immediately, then poll every 100ms until renderer is ready
    tryPatch();
    intervalId = setInterval(tryPatch, 100);

    return () => {
      disposed = true;
      if (intervalId) clearInterval(intervalId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const app = appRef.current as any;
      const renderer = app?.renderer;
      if (renderer?.__dprPatched && renderer.__originalResize) {
        renderer.resize = renderer.__originalResize;
        renderer.__dprPatched = false;
      }
    };
  }, []); // Only run once on mount

  // Force a resize when viewport dimensions change (fullscreen, layout shifts)
  useEffect(() => {
    if (!viewportSize || !appRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const app = appRef.current as any;
    try {
      app.renderer?.resize(viewportSize.w, viewportSize.h);
    } catch {
      // Renderer not ready yet — safe to ignore
    }
  }, [viewportSize?.w, viewportSize?.h]);

  // Apply counter-transform when React state settles (scroll idle).
  // During active scrolling, applyDOMTransform() in use-virtual-scroll.ts
  // mutates canvasContainerRef.current.style.transform directly.
  // This effect runs only on React state changes (after flush), keeping
  // them in sync without conflicting inline styles.
  useEffect(() => {
    if (canvasContainerRef?.current) {
      const scrollOffsetX = scrollX * Math.max(0, scrollableWidth - (viewportSize?.w ?? 0));
      canvasContainerRef.current.style.transform = `translate(${scrollOffsetX}px, ${scrollY}px)`;
    }
  }, [scrollX, scrollY, scrollableWidth, viewportSize?.w, canvasContainerRef]);

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
      ref={containerRefCallback}
      className="canvas-timeline-container"
      role="application"
      aria-label="Timeline editor"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        // Use measured viewport width — NOT 100% which would inherit the
        // parent's scrollable content width (100,000+ px at high zoom).
        width: viewportSize ? `${viewportSize.w}px` : '100vw',
        height: viewportSize ? `${viewportSize.h}px` : '100%',
        // CRITICAL: position:absolute pins the canvas to the scroll container
        // (the nearest positioned ancestor), NOT the CSS-transformed parent.
        // This prevents the parent's scroll transform from moving the canvas
        // off-screen. PixiJS handles scrolling internally via pixiContainer offset.
        position: 'sticky',
        left: 0,
        top: 0,
        // Counter-transform is applied via useEffect / applyDOMTransform (use-virtual-scroll.ts)
        // to avoid React inline styles fighting with direct DOM mutation during active scrolling.
        willChange: 'transform',
        overflow: 'hidden',
        outline: 'none',
        flexShrink: 0,
        zIndex: 1,
      }}
    >
      <Application
        ref={appRef}
        resizeTo={containerRef}
        background={CANVAS_BG}
        antialias={false}
        resolution={typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1}
        autoDensity
      >
        <CanvasTimelineContent
          tracks={tracks}
          scrollableDuration={scrollableDuration}
          scrollableWidth={scrollableWidth}
          scrollX={scrollX}
          scrollY={scrollY}
          viewportWidth={viewportSize?.w ?? 800}
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
