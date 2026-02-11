/**
 * ============================================================
 * TIMELINE STORE HELPERS
 * ============================================================
 *
 * Internal helper functions used by video-editor-store actions.
 * Extracted to eliminate code duplication across clip mutation actions.
 *
 * These helpers operate on mutable draft state (inside mutative set() callbacks)
 * or on plain Record-based state for validation checks.
 */

import type { TimelineClip, TransitionEntity } from "../types/timeline-v2";

// ============================================================
// TRANSITION SYNC
// ============================================================

/**
 * Sync transitions when a clip's position changes.
 * - In/out transitions: shift startTime/endTime by timeDelta
 * - Between transitions: delete (adjacency is broken by the move)
 *
 * Must be called inside a mutative set() callback (operates on draft state).
 *
 * @param transitions - The mutable transitions Record from draft state
 * @param clipId - The clip whose position changed
 * @param timeDelta - The amount the clip moved (newStartTime - oldStartTime)
 */
export function syncTransitionsOnClipMove(
  transitions: Record<string, TransitionEntity>,
  clipId: string,
  timeDelta: number,
): void {
  if (timeDelta === 0) return;

  for (const [tId, t] of Object.entries(transitions)) {
    if (t.clipIds.includes(clipId)) {
      if (t.position === "in" || t.position === "out") {
        transitions[tId].startTime += timeDelta;
        transitions[tId].endTime += timeDelta;
        transitions[tId].updatedAt = Date.now();
      }
      if (t.position === "between") {
        delete transitions[tId];
      }
    }
  }
}

// ============================================================
// OVERLAP DETECTION
// ============================================================

/**
 * Check if placing a clip at the given position would cause overlap
 * on a non-overlap track.
 *
 * Works directly with the normalized clips Record (no array conversion needed).
 *
 * @param clips - The clips Record from store state
 * @param trackId - The track to check for overlaps on
 * @param startTime - Proposed start time for the clip
 * @param duration - Proposed duration for the clip
 * @param excludeClipId - Optional clip ID to exclude (the clip being moved/updated)
 * @returns true if the placement would overlap with an existing clip
 */
export function wouldOverlapOnTrack(
  clips: Record<string, TimelineClip>,
  trackId: string,
  startTime: number,
  duration: number,
  excludeClipId?: string,
): boolean {
  const endTime = startTime + duration;
  return Object.values(clips).some((c) => {
    if (excludeClipId && c.id === excludeClipId) return false;
    if (c.trackId !== trackId) return false;
    const existingEnd = c.startTime + c.duration;
    return startTime < existingEnd && endTime > c.startTime;
  });
}
