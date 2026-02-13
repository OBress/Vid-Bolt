'use client';

/**
 * CanvasTimelineTrack — GPU-rendered timeline track
 *
 * Renders a single track as a horizontal band containing all its items.
 * Replaces the DOM-based `timeline-track.tsx` for the rendering path.
 *
 * Responsibilities:
 * - Draws track background and bottom border
 * - Renders all items within the track via CanvasTimelineItem
 * - Renders transitions as separate elements via CanvasTransitionItem
 * - Handles click on empty track area (move playhead)
 * - Forwards interaction callbacks to items (drag, select, context menu)
 */

import React, { useCallback, useMemo } from 'react';
import { Graphics, Container } from 'pixi.js';
import { extend } from '@pixi/react';
import { CanvasTimelineItem } from './canvas-timeline-item';
import { CanvasTransitionItem } from './canvas-transition-item';
import type { CanvasContextMenuData } from './canvas-timeline-item';
import type { TrackWithClips, TimelineItem } from '../../../../stores/memoized-selectors';
import type { TransitionEntity } from '../../../../types/timeline-v2';
import { TIMELINE_CONSTANTS } from '../../constants';

extend({ Container, Graphics });

// ============================================================
// CONSTANTS
// ============================================================

const TRACK_BG_DEFAULT = 0x171717; // neutral-900 (fallback)
const GROUP_BG_COLORS: Record<string, number> = {
  video:    0x171717, // neutral-900
  overlays: 0x13101a, // subtle violet-tinted
  text:     0x1a1508, // subtle amber-tinted
  effects:  0x150f1a, // subtle purple-tinted
  audio:    0x0f1a14, // subtle green-tinted
};
const TRACK_BORDER_COLOR = 0x404040; // neutral-700
const TRACK_BORDER_ALPHA = 0.8;

// ============================================================
// TYPES
// ============================================================

export interface CanvasTimelineTrackProps {
  /** Track data with embedded items */
  track: TrackWithClips;
  /** Y position for this track in the canvas */
  y: number;
  /** Total scrollable duration in seconds */
  totalDuration: number;
  /** Total scrollable width in pixels */
  totalWidth: number;
  /** Track height in pixels */
  trackHeight: number;
  /** Track item height in pixels */
  trackItemHeight?: number;
  /** Currently selected item IDs */
  selectedItemIds: string[];
  /** Currently selected transition ID */
  selectedTransitionId?: string | null;
  /** Whether splitting mode is active */
  splittingEnabled?: boolean;
  /** Callback when an item is selected */
  onItemSelect?: (itemId: string) => void;
  /** Callback for multi-select (Shift+click) */
  onSelectionChange?: (itemId: string, isMultiple: boolean) => void;
  /** Callback to initiate drag/resize */
  onDragStart?: (
    item: TimelineItem,
    clientX: number,
    clientY: number,
    action: 'move' | 'resize-start' | 'resize-end',
    selectedItemIds: string[],
  ) => void;
  /** Callback for right-click context menu */
  onContextMenu?: (data: CanvasContextMenuData) => void;
  /** Callback when empty track area is clicked (for playhead) */
  onTimeClick?: (timeInSeconds: number) => void;
  /** Callback when user clicks on a transition zone */
  onTransitionClick?: (transitionId: string) => void;
  /** Callback when user starts resizing a transition */
  onTransitionResizeStart?: (
    transitionId: string,
    clientX: number,
    clientY: number,
    side: 'left' | 'right',
  ) => void;
}

// ============================================================
// COMPONENT
// ============================================================

export const CanvasTimelineTrack = React.memo(function CanvasTimelineTrack({
  track,
  y,
  totalDuration,
  totalWidth,
  trackHeight,
  trackItemHeight,
  selectedItemIds,
  selectedTransitionId,
  splittingEnabled = false,
  onItemSelect,
  onSelectionChange,
  onDragStart,
  onContextMenu,
  onTimeClick,
  onTransitionClick,
  onTransitionResizeStart,
}: CanvasTimelineTrackProps) {
  const selectedSet = useMemo(
    () => new Set(selectedItemIds),
    [selectedItemIds],
  );

  // Track muted/locked/hidden state from track data
  const isMuted = !!track.muted;
  const isLocked = !!track.locked;
  const trackHidden = !track.visible;
  const trackMuted = !!track.muted;

  // Extract unique transitions from track items (deduped by transition ID)
  const trackTransitions = useMemo(() => {
    const seen = new Map<string, TransitionEntity>();
    for (const item of track.items) {
      if (item.inTransition && !seen.has(item.inTransition.id)) {
        seen.set(item.inTransition.id, item.inTransition);
      }
      if (item.outTransition && !seen.has(item.outTransition.id)) {
        seen.set(item.outTransition.id, item.outTransition);
      }
    }
    return Array.from(seen.values());
  }, [track.items]);

  // Draw track background + bottom border
  const drawTrackBg = useCallback(
    (g: Graphics) => {
      g.clear();

      // Background — resolve from track.group (or fallback to type)
      const group = track.group || (track.type === 'audio' ? 'audio' : 'video');
      const bgColor = GROUP_BG_COLORS[group] || TRACK_BG_DEFAULT;
      g.rect(0, 0, totalWidth, trackHeight);
      g.fill({ color: bgColor });

      // Bottom border
      g.moveTo(0, trackHeight - 0.5);
      g.lineTo(totalWidth, trackHeight - 0.5);
      g.stroke({ color: TRACK_BORDER_COLOR, width: 1, alpha: TRACK_BORDER_ALPHA });
    },
    [totalWidth, trackHeight, track.type],
  );

  // Handle click on empty track area → move playhead to that time
  const handleTrackPointerDown = useCallback(
    (e: any) => {
      // Only handle if clicking on the track background (not on an item)
      // PixiJS events bubble up, so item clicks will be caught by the item first
      if (e.target !== e.currentTarget) return;

      // Convert click X to time
      const localX = e.data?.getLocalPosition?.(e.currentTarget)?.x ?? e.globalX;
      if (localX == null || totalDuration <= 0 || totalWidth <= 0) return;

      const time = (localX / totalWidth) * totalDuration;
      onTimeClick?.(Math.max(0, Math.min(time, totalDuration)));
    },
    [totalDuration, totalWidth, onTimeClick],
  );

  return (
    <pixiContainer y={y}>
      {/* Track background (interactive for playhead clicks) */}
      <pixiGraphics
        draw={drawTrackBg}
        eventMode="static"
        cursor="default"
        onPointerDown={handleTrackPointerDown}
      />

      {/* Track items */}
      {track.items.map((item) => (
        <CanvasTimelineItem
          key={item.id}
          item={item}
          totalDuration={totalDuration}
          totalWidth={totalWidth}
          trackHeight={trackHeight}
          trackItemHeight={trackItemHeight}
          isSelected={selectedSet.has(item.id)}
          isMuted={isMuted}
          isLocked={isLocked}
          trackHidden={trackHidden}
          trackMuted={trackMuted}
          splittingEnabled={splittingEnabled}
          selectedItemIds={selectedItemIds}
          onSelect={onItemSelect}
          onSelectionChange={onSelectionChange}
          onDragStart={onDragStart}
          onContextMenu={onContextMenu}
          onTransitionClick={onTransitionClick}
        />
      ))}

      {/* Transitions — rendered on top of clips as separate elements */}
      {trackTransitions.map((transition) => (
        <CanvasTransitionItem
          key={`transition-${transition.id}`}
          transition={transition}
          totalDuration={totalDuration}
          totalWidth={totalWidth}
          trackHeight={trackHeight}
          isSelected={selectedTransitionId === transition.id}
          isLocked={isLocked}
          onTransitionClick={onTransitionClick}
          onResizeStart={onTransitionResizeStart}
        />
      ))}
    </pixiContainer>
  );
});
