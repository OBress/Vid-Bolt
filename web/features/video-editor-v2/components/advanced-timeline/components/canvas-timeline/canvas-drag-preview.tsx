'use client';

/**
 * CanvasDragPreview — Standalone DOM overlay for clip drag previews
 *
 * When dragging a canvas-rendered timeline item, the PixiJS canvas doesn't
 * produce a natural drag preview. This component subscribes to the Zustand
 * drag state and renders a semi-transparent preview rectangle at the
 * dragged position, plus an info overlay showing the time delta.
 *
 * Replaces the per-item DragPreviewWithOverlay that was embedded in
 * the DOM-based TimelineItem component.
 */

import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useVideoEditorStore, selectDragState } from '../../../../stores/video-editor-store';
import type { TrackWithClips } from '../../../../stores/memoized-selectors';
import { TIMELINE_CONSTANTS } from '../../constants';
import { getTrackYOffset } from './canvas-timeline-utils';

// ============================================================
// HELPERS
// ============================================================

/** Format a time delta as "+N.Ns" / "-N.Ns" */
function formatDelta(deltaSeconds: number): string {
  if (Math.abs(deltaSeconds) < 0.05) return '0s';
  const sign = deltaSeconds >= 0 ? '+' : '-';
  const abs = Math.abs(deltaSeconds);
  if (abs < 60) return `${sign}${abs.toFixed(1)}s`;
  const mins = Math.floor(abs / 60);
  const secs = abs % 60;
  if (secs < 0.05) return `${sign}${mins}m`;
  return `${sign}${mins}m ${secs.toFixed(1)}s`;
}

/** Format duration compactly */
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins < 60) return `${mins}:${secs.toString().padStart(2, '0')}`;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours}:${remainingMins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/** Format time as compact string */
function formatTime(seconds: number): string {
  if (seconds < 0) return '0s';
  return formatDuration(seconds);
}

// ============================================================
// TYPES
// ============================================================

export interface CanvasDragPreviewProps {
  /** Ref to the timeline content container (for bounding rect) */
  timelineRef: React.RefObject<HTMLDivElement | null>;
  /** Total scrollable duration */
  scrollableDuration: number;
  /** Current scrollX offset */
  scrollX: number;
  /** Pixels per second (for time→pixel conversion) */
  pixelsPerSecond: number;
  /** All tracks (for computing Y positions) */
  tracks: TrackWithClips[];
  /** Track height */
  trackHeight?: number;
  /** FPS for time formatting */
  fps?: number;
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

interface DragInfoOverlayProps {
  originalStart: number;
  originalEnd: number;
  currentStart: number;
  currentEnd: number;
  action: 'move' | 'resize-start' | 'resize-end';
  previewRect: { left: number; top: number; width: number };
}

function DragInfoOverlay({
  originalStart,
  originalEnd,
  currentStart,
  currentEnd,
  action,
  previewRect,
}: DragInfoOverlayProps) {
  const deltaStart = currentStart - originalStart;
  const currentDuration = currentEnd - currentStart;
  const originalDuration = originalEnd - originalStart;
  const deltaDuration = currentDuration - originalDuration;

  const getDeltaColor = (delta: number, invert = false) => {
    if (Math.abs(delta) < 0.05) return 'text-gray-400';
    const isPositive = invert ? delta < 0 : delta > 0;
    return isPositive ? 'text-green-400' : 'text-orange-400';
  };

  return createPortal(
    <div
      style={{
        position: 'fixed',
        left: previewRect.left + previewRect.width / 2,
        top: previewRect.top - 6,
        transform: 'translate(-50%, -100%)',
        zIndex: 9999,
        pointerEvents: 'none',
      }}
    >
      <div className="bg-black/95 rounded px-2 py-1 shadow-lg border border-white/10 flex items-center gap-2 text-[11px]">
        {action === 'move' && (
          <>
            <span className={`font-semibold tabular-nums ${getDeltaColor(deltaStart)}`}>
              {formatDelta(deltaStart)}
            </span>
            <span className="text-gray-500">•</span>
            <span className="text-gray-400 tabular-nums">{formatTime(currentStart)}</span>
            <span className="text-gray-600">→</span>
            <span className="text-gray-400 tabular-nums">{formatTime(currentEnd)}</span>
          </>
        )}
        {action === 'resize-start' && (
          <>
            <span className={`font-semibold tabular-nums ${getDeltaColor(deltaStart, true)}`}>
              {formatDelta(deltaStart)}
            </span>
            <span className="text-gray-500">•</span>
            <span className="text-gray-400 tabular-nums">{formatTime(currentStart)}</span>
            <span className="text-gray-600">|</span>
            <span className="text-white tabular-nums">{formatDuration(currentDuration)}</span>
          </>
        )}
        {action === 'resize-end' && (
          <>
            <span className={`font-semibold tabular-nums ${getDeltaColor(deltaDuration)}`}>
              {formatDelta(deltaDuration)}
            </span>
            <span className="text-gray-500">•</span>
            <span className="text-gray-400 tabular-nums">{formatTime(currentEnd)}</span>
            <span className="text-gray-600">|</span>
            <span className="text-white tabular-nums">{formatDuration(currentDuration)}</span>
          </>
        )}
      </div>
      {/* Arrow pointing down */}
      <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-l-transparent border-r-4 border-r-transparent border-t-4 border-t-black/95" />
    </div>,
    document.body,
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

/**
 * Standalone drag preview that subscribes to Zustand drag state
 * and renders DOM-based preview elements via portal.
 */
export function CanvasDragPreview({
  timelineRef,
  scrollableDuration,
  scrollX,
  pixelsPerSecond,
  tracks,
  trackHeight: propTrackHeight,
  fps = 30,
}: CanvasDragPreviewProps) {
  const dragState = useVideoEditorStore(selectDragState);
  const trackHeight = propTrackHeight || TIMELINE_CONSTANTS.TRACK_HEIGHT;
  const itemHeight = TIMELINE_CONSTANTS.TRACK_ITEM_HEIGHT;

  // Only render for clip drags
  const isClipDrag = dragState?.type?.startsWith('clip-') ?? false;
  if (!isClipDrag || !dragState || dragState.currentTime === undefined) return null;

  const action: 'move' | 'resize-start' | 'resize-end' =
    dragState.type === 'clip-move' ? 'move' :
    dragState.type === 'clip-resize-start' ? 'resize-start' : 'resize-end';

  const snapshots = dragState.selectedClipsSnapshot;
  if (!snapshots || snapshots.length === 0) return null;

  const primarySnapshot = snapshots.find(s => s.id === dragState.clipId);
  if (!primarySnapshot) return null;

  // Get timeline container's screen-space rect
  const containerRect = timelineRef.current?.getBoundingClientRect();
  if (!containerRect) return null;

  // Compute delta from primary item's movement
  const deltaTime = dragState.currentTime - primarySnapshot.originalStartTime;
  const deltaDuration = (dragState.currentDuration ?? primarySnapshot.originalDuration) - primarySnapshot.originalDuration;

  // Add video track button spacer height
  const ADD_BUTTON_HEIGHT = 28;

  return createPortal(
    <>
      {snapshots.map((snapshot) => {
        const isPrimary = snapshot.id === dragState.clipId;

        // Compute this item's current position
        let itemCurrentStart: number;
        let itemCurrentDuration: number;

        if (action === 'move') {
          itemCurrentStart = snapshot.originalStartTime + deltaTime;
          itemCurrentDuration = snapshot.originalDuration;
        } else if (action === 'resize-start') {
          itemCurrentStart = snapshot.originalStartTime + deltaTime;
          itemCurrentDuration = snapshot.originalDuration + deltaDuration;
        } else {
          // resize-end
          itemCurrentStart = snapshot.originalStartTime;
          itemCurrentDuration = snapshot.originalDuration + deltaDuration;
        }

        // Find current track index
        const originalTrackIndex = tracks.findIndex(t => t.id === snapshot.originalTrackId);
        let currentTrackIndex: number;

        if (action === 'move' && isPrimary && dragState.currentTrackId) {
          currentTrackIndex = tracks.findIndex(t => t.id === dragState.currentTrackId);
          if (currentTrackIndex === -1) currentTrackIndex = originalTrackIndex;
        } else {
          currentTrackIndex = originalTrackIndex;
        }

        if (currentTrackIndex === -1) return null;

        // Convert time to pixel position
        const previewX = itemCurrentStart * pixelsPerSecond;
        const previewW = itemCurrentDuration * pixelsPerSecond;

        // Get track Y position in the content space
        const trackY = getTrackYOffset(currentTrackIndex, trackHeight, tracks);
        const itemY = trackY + (trackHeight - itemHeight) / 2;

        // Convert to screen space using the container rect + scroll offset
        const screenX = containerRect.left + previewX + scrollX;
        const screenY = containerRect.top + itemY + ADD_BUTTON_HEIGHT;

        // Don't render if off-screen
        if (screenX + previewW < containerRect.left || screenX > containerRect.right) return null;

        // Get the item's color (from the snapshot's original track or a default)
        const track = tracks[originalTrackIndex];
        const originalItem = track?.items.find(i => i.id === snapshot.id);
        const color = originalItem?.color || '#3b82f6';

        return (
          <React.Fragment key={snapshot.id}>
            {/* Semi-transparent preview rectangle */}
            <div
              style={{
                position: 'fixed',
                left: screenX,
                top: screenY,
                width: previewW,
                height: itemHeight,
                backgroundColor: color,
                borderRadius: 4,
                border: '3px solid rgb(0, 255, 255)',
                zIndex: 9998,
                pointerEvents: 'none',
                opacity: 0.7,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              {previewW > 40 && (
                <span
                  style={{
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 500,
                    fontFamily: 'Inter, system-ui, sans-serif',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    padding: '0 8px',
                    textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                  }}
                >
                  {originalItem?.label || snapshot.label || snapshot.type || ''}
                </span>
              )}
            </div>

            {/* Info overlay — only on primary item */}
            {isPrimary && (
              <DragInfoOverlay
                originalStart={primarySnapshot.originalStartTime}
                originalEnd={primarySnapshot.originalStartTime + primarySnapshot.originalDuration}
                currentStart={itemCurrentStart}
                currentEnd={itemCurrentStart + itemCurrentDuration}
                action={action}
                previewRect={{ left: screenX, top: screenY, width: previewW }}
              />
            )}
          </React.Fragment>
        );
      })}
    </>,
    document.body,
  );
}
