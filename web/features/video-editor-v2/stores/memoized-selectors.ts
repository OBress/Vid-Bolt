/**
 * ============================================================
 * MEMOIZED SELECTORS — Performance-Optimized Derived State
 * ============================================================
 *
 * Uses reselect's `createSelector` (v5.0+ with `weakMapMemoize` default)
 * to memoize computed selectors. These only recompute when their
 * input references actually change, preventing unnecessary re-renders.
 *
 * RULES:
 * 1. Input selectors must be simple property accessors (no computation)
 * 2. Result functions perform the actual transformation
 * 3. Only use `createSelector` for selectors that CREATE new references
 * 4. Atomic selectors (single property access) don't need memoization
 */

import { createSelector } from "reselect";
import type { VideoEditorStore } from "./video-editor-store";
import type {
  TimelineTrack,
  TimelineClip,
  TransitionEntity,
} from "../types/timeline-v2";

// ============================================================
// INPUT SELECTORS (stable property accessors — no computation)
// ============================================================

const selectTracksRecord = (state: VideoEditorStore) => state.tracks;
const selectTrackOrderArr = (state: VideoEditorStore) => state.trackOrder;
const selectClipsRecord = (state: VideoEditorStore) => state.clips;
const selectTransitionsRecord = (state: VideoEditorStore) => state.transitions;
const selectFpsValue = (state: VideoEditorStore) => state.fps;

// ============================================================
// MEMOIZED TRACK SELECTORS
// ============================================================

/** All tracks in display order (trackOrder mapped to track objects) */
export const selectTracksArray = createSelector(
  [selectTracksRecord, selectTrackOrderArr],
  (tracks, trackOrder): TimelineTrack[] =>
    trackOrder.map((id) => tracks[id]).filter(Boolean),
);

/** Sorted tracks: video (reversed order) first, then audio (natural order) */
export const selectTracks = createSelector(
  [selectTracksArray],
  (allTracks): TimelineTrack[] => {
    const videoTracks = allTracks
      .filter((t) => t.type === "video")
      .sort((a, b) => b.order - a.order); // Reversed so V1 is at bottom
    const audioTracks = allTracks
      .filter((t) => t.type === "audio")
      .sort((a, b) => a.order - b.order);
    return [...videoTracks, ...audioTracks];
  },
);

/** Video tracks only, reverse sorted */
export const selectVideoTracks = createSelector(
  [selectTracksArray],
  (allTracks): TimelineTrack[] =>
    allTracks
      .filter((t) => t.type === "video")
      .sort((a, b) => b.order - a.order),
);

/** Audio tracks only, natural sorted */
export const selectAudioTracks = createSelector(
  [selectTracksArray],
  (allTracks): TimelineTrack[] =>
    allTracks
      .filter((t) => t.type === "audio")
      .sort((a, b) => a.order - b.order),
);

// ============================================================
// MEMOIZED CLIP SELECTORS
// ============================================================

/** All clips as a flat array */
export const selectClipsArray = createSelector(
  [selectClipsRecord],
  (clips): TimelineClip[] => Object.values(clips),
);

/** Clip IDs only */
export const selectClipIds = createSelector(
  [selectClipsRecord],
  (clips): string[] => Object.keys(clips),
);

/** Minimal clip position data for timeline rendering */
export const selectClipPositions = createSelector(
  [selectClipsRecord],
  (clips) =>
    Object.values(clips).map((c) => ({
      id: c.id,
      trackId: c.trackId,
      startTime: c.startTime,
      duration: c.duration,
    })),
);

/**
 * Compute linkGroup for a clip from its linkedClipId
 * Sorting ensures the same group ID regardless of which clip is primary
 */
export const computeLinkGroup = (
  clipId: string,
  linkedClipId?: string,
): string | undefined => {
  if (!linkedClipId) return undefined;
  return `link-${[clipId, linkedClipId].sort().join("-")}`;
};

/** All clips with computed linkGroup */
export const selectClipsWithLinkGroups = createSelector(
  [selectClipsRecord],
  (clips) =>
    Object.values(clips).map((clip) => ({
      ...clip,
      linkGroup: computeLinkGroup(clip.id, clip.linkedClipId),
    })),
);

// ============================================================
// MEMOIZED DERIVED INDEX SELECTORS
// ============================================================
// These create lookup indexes that are recalculated only when
// the source data changes — O(n) build, O(1) per-lookup.

/** Clips grouped by trackId — used by selectTracksWithClips */
export const selectClipsByTrackIndex = createSelector(
  [selectClipsRecord],
  (clips): Record<string, TimelineClip[]> => {
    const index: Record<string, TimelineClip[]> = {};
    for (const clip of Object.values(clips)) {
      if (!index[clip.trackId]) index[clip.trackId] = [];
      index[clip.trackId].push(clip);
    }
    // Sort each track's clips by startTime
    for (const trackId in index) {
      index[trackId].sort((a, b) => a.startTime - b.startTime);
    }
    return index;
  },
);

/** Transitions indexed by clipId for O(1) lookup per clip */
export const selectTransitionsByClipIndex = createSelector(
  [selectTransitionsRecord],
  (
    transitions,
  ): Record<string, { in?: TransitionEntity; out?: TransitionEntity }> => {
    const index: Record<
      string,
      { in?: TransitionEntity; out?: TransitionEntity }
    > = {};

    for (const t of Object.values(transitions)) {
      if (t.position === "between") {
        // Between transition: first clip gets 'out', second clip gets 'in'
        if (t.clipIds[0]) {
          if (!index[t.clipIds[0]]) index[t.clipIds[0]] = {};
          index[t.clipIds[0]].out = t;
        }
        if (t.clipIds[1]) {
          if (!index[t.clipIds[1]]) index[t.clipIds[1]] = {};
          index[t.clipIds[1]].in = t;
        }
      } else {
        const clipId = t.clipIds[0];
        if (clipId) {
          if (!index[clipId]) index[clipId] = {};
          if (t.position === "in") index[clipId].in = t;
          else if (t.position === "out") index[clipId].out = t;
        }
      }
    }

    return index;
  },
);

// ============================================================
// MEMOIZED DENORMALIZED VIEW SELECTOR
// ============================================================

/**
 * ItemTransition - Transition data for timeline item overlays
 */
export type ItemTransition = TransitionEntity;

export interface TimelineItem {
  id: string;
  start: number;
  end: number;
  type?: string;
  label?: string;
  color?: string;
  data?: Record<string, any>;
  mediaStart?: number;
  mediaDuration?: number;
  mediaSrcDuration?: number;
  mediaEnd?: number;
  speed?: number;
  linkGroup?: string;
  linkedItemId?: string;
  /**
   * @deprecated - Use inTransition/outTransition TransitionEntity instead
   * Kept for backward compatibility during migration
   */
  transitions?: {
    in?: TransitionEntity;
    out?: TransitionEntity;
  };
  /** In transition (fade in, or second clip in crossfade) */
  inTransition?: TransitionEntity;
  /** Out transition (fade out, or first clip in crossfade) */
  outTransition?: TransitionEntity;
}

/**
 * TrackWithClips - Denormalized track with embedded clips for UI rendering
 */
export interface TrackWithClips extends TimelineTrack {
  items: TimelineItem[];
}

/**
 * Distinct colors for each clip type so items are visually distinguishable
 * on the timeline. Uses -600 tones for better contrast on dark backgrounds.
 *
 * Priority chain: clip.color > CLIP_TYPE_COLORS[type] > track.color > DEFAULT
 */
const CLIP_TYPE_COLORS: Record<string, string> = {
  video:             '#0891b2', // Cyan-600  – teal for video clips
  image:             '#7c3aed', // Violet-600 – purple for image clips
  audio:             '#16a34a', // Green-600 – green for audio (universal NLE convention)
  text:              '#d97706', // Amber-600 – warm amber for text / titles
  caption:           '#ea580c', // Orange-600 – orange for captions
  sticker:           '#db2777', // Pink-600  – pink for stickers
  shape:             '#4f46e5', // Indigo-600 – indigo for shapes
  blur:              '#475569', // Slate-600 – muted for utility clips
  'motion-graphics': '#9333ea', // Purple-600 – vivid purple for motion graphics
  effect:            '#7c3aed', // Violet-600 – effects / adjustment layers
};

const DEFAULT_CLIP_COLOR = '#3b82f6'; // Blue-500 fallback

/**
 * Tracks with embedded clips (denormalized view)
 *
 * Uses memoized indexes (clipsByTrack, transitionsByClip) for O(1) lookups
 * instead of O(n) linear scans per track/clip.
 *
 * Only recomputes when tracks, clips, or transitions actually change.
 */
export const selectTracksWithClips = createSelector(
  [
    selectTracks,
    selectClipsByTrackIndex,
    selectTransitionsByClipIndex,
  ],
  (sortedTracks, clipsByTrack, transitionsByClip): TrackWithClips[] => {
    return sortedTracks.map((track) => {
      const trackClips = clipsByTrack[track.id] || [];
      const items: TimelineItem[] = trackClips
        .map((clip) => {
          const linkGroup = computeLinkGroup(clip.id, clip.linkedClipId);

          // O(1) transition lookup via index
          const clipTransitions = transitionsByClip[clip.id];
          const inTransition = clipTransitions?.in;
          const outTransition = clipTransitions?.out;

          // Resolve color: explicit clip color > type-based > track color > default
          const resolvedColor =
            clip.color ||
            CLIP_TYPE_COLORS[clip.type] ||
            track.color ||
            DEFAULT_CLIP_COLOR;

          return {
            id: clip.id,
            start: clip.startTime,
            end: clip.startTime + clip.duration,
            type: clip.type,
            label: clip.label,
            color: resolvedColor,
            data: {
              ...clip.data,
              sourceId: clip.sourceId,
              mediaSrc: clip.media?.src,
              transform: clip.transform,
              text: clip.text,
              linkedClipId: clip.linkedClipId,
              thumbnailUrl: clip.thumbnailUrl,
              effects: clip.effects,
              keyframes: clip.keyframes,
            },
            mediaStart: clip.media?.mediaStartTime,
            mediaDuration: clip.media?.mediaDuration,
            mediaSrcDuration: clip.media?.mediaDuration,
            speed: clip.media?.speed,
            linkGroup,
            linkedItemId: clip.linkedClipId,
            transitions: clip.transitions,
            inTransition: inTransition as ItemTransition | undefined,
            outTransition: outTransition as ItemTransition | undefined,
          };
        })
        .sort((a, b) => a.start - b.start);

      return { ...track, items };
    });
  },
);

// ============================================================
// MEMOIZED DURATION SELECTORS
// ============================================================

/** Total timeline duration in seconds */
export const selectDurationInSeconds = createSelector(
  [selectClipsRecord],
  (clips): number => {
    const clipsArr = Object.values(clips);
    if (clipsArr.length === 0) return 0;
    // Guard: filter out clips with NaN/Infinity timing to prevent Math.max → NaN
    const validEnds = clipsArr
      .map((c) => c.startTime + c.duration)
      .filter((v) => Number.isFinite(v));
    if (validEnds.length === 0) return 0;
    return Math.max(...validEnds);
  },
);

/** Total timeline duration in frames */
export const selectDurationInFrames = createSelector(
  [selectDurationInSeconds, selectFpsValue],
  (durationSeconds, fps): number => Math.ceil(durationSeconds * fps),
);
