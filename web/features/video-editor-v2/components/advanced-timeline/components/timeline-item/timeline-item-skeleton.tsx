/**
 * TimelineItemSkeleton - Ultra-lightweight placeholder rendered during active scrolling
 *
 * Phase 0 of the multi-tier lazy loading system.
 * This component has ZERO hooks, ZERO state, ZERO effects, ZERO subscriptions.
 * It should mount/unmount in <1ms.
 *
 * Renders a simple colored div with:
 * - Clip label text
 * - Type icon
 * - Background color matching the clip color
 */

import React from 'react';
import { TrackItemType } from '../../types';

interface TimelineItemSkeletonProps {
  label?: string;
  type?: TrackItemType | string;
  color?: string;
}

/** Map track item types to compact icons */
const TYPE_ICONS: Record<string, string> = {
  [TrackItemType.VIDEO]: '🎥',
  [TrackItemType.AUDIO]: '🔊',
  [TrackItemType.TEXT]: 'Aa',
  [TrackItemType.CAPTION]: '💬',
  [TrackItemType.IMAGE]: '🖼',
  [TrackItemType.STICKER]: '⭐',
  [TrackItemType.BLUR]: '◐',
  [TrackItemType.MOTION_GRAPHICS]: '✦',
};

/**
 * Pure presentational skeleton — no hooks, no state, no effects.
 */
export const TimelineItemSkeleton: React.FC<TimelineItemSkeletonProps> = ({
  label,
  type,
  color,
}) => {
  const icon = type ? (TYPE_ICONS[type] ?? '▪') : '▪';

  return (
    <div
      className="flex items-center h-full w-full overflow-hidden px-2 select-none"
      style={{ contain: 'strict' }}
    >
      <span className="mr-1.5 text-xs opacity-70 flex-shrink-0">{icon}</span>
      <span className="truncate text-[11px] font-medium text-white/80">
        {label || type || ''}
      </span>
    </div>
  );
};
