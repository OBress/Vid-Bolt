/**
 * ============================================================
 * MEMOIZED RENDER SELECTORS — Overlay/Render Pipeline
 * ============================================================
 *
 * These selectors memoize the expensive clip-to-overlay conversion
 * that feeds into the Remotion Player. They only recompute when
 * clips, tracks, transitions, or fps change — NOT on selection,
 * playback, or UI state changes.
 *
 * Previously, this conversion happened inside VideoPlayer's useMemo
 * and was busted by every store update that changed the clips reference
 * (including selection changes), causing a ~97ms recomputation per click.
 */

import { createSelector } from "reselect";
import type { VideoEditorStore } from "./video-editor-store";
import type { Overlay } from "../types";
import { clipsToOverlaysWithTracks } from "../utils/clip-to-render-adapter";
import {
  selectClipsArray,
  selectTracksArray,
} from "./memoized-selectors";

// ============================================================
// INPUT SELECTORS
// ============================================================

const selectTransitionsRecord = (state: VideoEditorStore) => state.transitions;
const selectFpsValue = (state: VideoEditorStore) => state.fps;

// ============================================================
// MEMOIZED RENDER SELECTORS
// ============================================================

/**
 * All overlays for Remotion rendering.
 *
 * ONLY recomputes when clips, tracks, transitions, or fps change.
 * Does NOT recompute on selection, playback, or UI state changes.
 *
 * This replaces the inline useMemo in VideoPlayer that was
 * responsible for 97.7ms (32.2%) of frame time per click.
 */
export const selectOverlays = createSelector(
  [selectClipsArray, selectTracksArray, selectFpsValue, selectTransitionsRecord],
  (clips, tracks, fps, transitions): Overlay[] =>
    clipsToOverlaysWithTracks(clips, tracks, fps, transitions),
);

/**
 * Selected overlay ID in numeric format (for Remotion compatibility).
 *
 * Converts the first selected clip ID to the numeric overlay ID format
 * used by the Remotion rendering pipeline.
 *
 * Memoized so it only recomputes when selection changes.
 */
const selectSelectedClipIdsArr = (state: VideoEditorStore) =>
  state.selection?.clipIds;

export const selectSelectedOverlayId = createSelector(
  [selectSelectedClipIdsArr],
  (clipIds): number | null => {
    if (!clipIds || clipIds.length !== 1) return null;
    return parseInt(clipIds[0].replace(/\D/g, ""), 10) || null;
  },
);
