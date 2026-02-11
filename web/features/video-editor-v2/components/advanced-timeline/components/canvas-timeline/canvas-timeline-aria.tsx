'use client';

/**
 * CanvasTimelineAria — Hidden DOM mirror for screen reader accessibility
 *
 * Renders a visually-hidden listbox that mirrors the canvas timeline's items.
 * Each item is represented as an <li role="option"> with descriptive aria-label
 * and correct aria-selected state.
 *
 * This component has ZERO visual footprint (clip-path: inset(50%)) but provides
 * full screen reader navigation for users who rely on assistive technology.
 */

import React, { useMemo } from 'react';
import type { TrackWithClips, TimelineItem } from '../../../../stores/memoized-selectors';

// ============================================================
// TYPES
// ============================================================

export interface CanvasTimelineAriaProps {
  /** All tracks with their items */
  tracks: TrackWithClips[];
  /** Currently selected item IDs */
  selectedItemIds: string[];
  /** FPS for time display */
  fps?: number;
}

// ============================================================
// HELPERS
// ============================================================

/** Format seconds to MM:SS.FF (frames) */
function formatTime(seconds: number, fps: number): string {
  const totalFrames = Math.round(seconds * fps);
  const m = Math.floor(totalFrames / (fps * 60));
  const s = Math.floor((totalFrames % (fps * 60)) / fps);
  const f = totalFrames % fps;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(f).padStart(2, '0')}`;
}

/** Build descriptive label for an item */
function getItemLabel(item: TimelineItem, trackName: string, fps: number): string {
  const type = item.type ?? 'clip';
  const label = item.label || `${type} clip`;
  const start = formatTime(item.start, fps);
  const end = formatTime(item.end, fps);
  return `${label}, ${type}, on track ${trackName}, from ${start} to ${end}`;
}

// ============================================================
// STYLES — visually hidden but accessible to screen readers
// ============================================================

const VISUALLY_HIDDEN_STYLE: React.CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

// ============================================================
// COMPONENT
// ============================================================

export function CanvasTimelineAria({
  tracks,
  selectedItemIds,
  fps = 30,
}: CanvasTimelineAriaProps) {
  const selectedSet = useMemo(() => new Set(selectedItemIds), [selectedItemIds]);

  const items = useMemo(() => {
    const result: { id: string; label: string; selected: boolean }[] = [];
    for (const track of tracks) {
      if (!track.items) continue;
      for (const item of track.items) {
        result.push({
          id: item.id,
          label: getItemLabel(item, track.name || track.id, fps),
          selected: selectedSet.has(item.id),
        });
      }
    }
    return result;
  }, [tracks, selectedSet, fps]);

  if (items.length === 0) return null;

  return (
    <div style={VISUALLY_HIDDEN_STYLE} role="region" aria-label="Timeline items">
      <ul
        role="listbox"
        aria-label="Timeline clips"
        aria-multiselectable="true"
      >
        {items.map((item) => (
          <li
            key={item.id}
            role="option"
            aria-selected={item.selected}
            aria-label={item.label}
            id={`aria-timeline-item-${item.id}`}
          >
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
