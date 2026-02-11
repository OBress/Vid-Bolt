/**
 * ============================================================
 * UNIFIED VIDEO EDITOR STORE (Timeline V2 Architecture)
 * ============================================================
 *
 * Single source of truth for ALL video editor state.
 * Uses Timeline V2 clips/tracks as the canonical data model.
 *
 * ARCHITECTURE:
 * ┌────────────────────────────────────────────────────────────┐
 * │                   VIDEO EDITOR STORE                       │
 * ├────────────────────────────────────────────────────────────┤
 * │  TIMELINE DATA:                                            │
 * │    - tracks: TimelineTrack[]                               │
 * │    - clips: TimelineClip[]                                 │
 * │    - transitions: Record<string, TransitionEntity>         │
 * │                                                            │
 * │  UI STATE:                                                 │
 * │    - selection: { clipIds, transitionId }                  │
 * │    - drag: DragData | null                                 │
 * │    - playback: { currentTime, isPlaying, playbackRate }    │
 * │                                                            │
 * │  DERIVED (computed via selectors):                         │
 * │    - clipsByTrack: computed from clips                     │
 * │    - selectedClip: computed from selection                 │
 * │    - totalDuration: computed from clips                    │
 * └────────────────────────────────────────────────────────────┘
 *
 * RULES:
 * 1. All mutations go through actions
 * 2. No bidirectional sync - one direction only
 * 3. Derived data computed via selectors, never stored
 * 4. Components subscribe to minimal state via selectors
 */

import { create } from "zustand";
import { subscribeWithSelector, persist } from "zustand/middleware";
import { temporal } from "zundo";
import { mutative } from "zustand-mutative";
import { shallow } from "zustand/shallow";
import { useShallow } from "zustand/react/shallow";
import type {
  TimelineTrack,
  TimelineClip,
  TransitionEntity,
  SelectionState,
  PlaybackState,
  UnifiedDragState,
  UnifiedDragType,
  DragVisualState,
  ClipDragSnapshot,
  GhostElementData,
  CommittedDragPosition,
  SnapInfo,
  EditMode,
  ClipType,
  TrackType,
} from "../types/timeline-v2";
import {
  VideoTransitionType,
  AudioTransitionType,
  TransitionEasing,
  EasingPreset,
} from "../types";
import type { AudioEffect } from "../types/audio-effects";
import type {
  Keyframe,
  PropertyKeyframes,
  KeyframeInterpolation,
  KeyframeValue,
  KeyframeSelection,
  KeyframeClipboard,
} from "../types/keyframes";
import {
  generateKeyframeId,
  createKeyframe,
  createPropertyKeyframes,
  sortKeyframes,
  getKeyframeAtTime,
  DEFAULT_INTERPOLATION,
} from "../types/keyframes";
import {
  syncTransitionsOnClipMove,
  wouldOverlapOnTrack,
} from "./timeline-store-helpers";

// ============================================================
// TYPES
// ============================================================

export type AspectRatio = "16:9" | "9:16" | "1:1" | "4:3" | "21:9" | "4:5";
export type ResolutionPreset = "720p" | "1080p" | "1440p" | "4K";

// ============================================================
// STORE STATE
// ============================================================

export interface VideoEditorState {
  // === TIMELINE DATA (Normalized) ===
  /** Tracks keyed by ID for O(1) lookup */
  tracks: Record<string, TimelineTrack>;
  /** Ordered array of track IDs for display order */
  trackOrder: string[];
  /** Clips keyed by ID for O(1) lookup */
  clips: Record<string, TimelineClip>;
  transitions: Record<string, TransitionEntity>;

  // === SELECTION ===
  selection: SelectionState;

  // === INLINE TEXT EDITING ===
  /** Overlay ID currently being inline-edited (double-click on text) */
  editingOverlayId: number | null;

  // === DRAG STATE (UNIFIED) ===
  /** Core drag data - what is being dragged and where */
  dragState: UnifiedDragState | null;
  /** Visual feedback - ghost elements, snap lines, etc. */
  dragVisuals: DragVisualState | null;

  // === PLAYBACK ===
  playback: PlaybackState;

  // === CANVAS ===
  aspectRatio: AspectRatio;
  resolution: ResolutionPreset;
  playerDimensions: { width: number; height: number };
  backgroundColor: string;

  // === SETTINGS ===
  fps: number;
  editMode: EditMode;
  snappingEnabled: boolean;
  showAlignmentGuides: boolean;
  trackHeight: number;
  clipHeight: number;

  // === PROJECT ===
  projectId: string | null;
  isDirty: boolean;
  lastSavedAt: number | null;

  // === HISTORY (Undo/Redo) — managed by zundo temporal middleware ===

  // === KEYFRAME ANIMATION ===
  /** Currently selected keyframes in the UI */
  keyframeSelection: KeyframeSelection | null;
  /** Keyframes stored in clipboard for copy/paste */
  keyframeClipboard: KeyframeClipboard | null;
}

// ============================================================
// STORE ACTIONS
// ============================================================

export interface VideoEditorActions {
  // === TRACK ACTIONS ===
  addTrack: (type: TrackType, options?: Partial<TimelineTrack>) => string;
  deleteTrack: (trackId: string, deleteClips?: boolean) => void;
  updateTrack: (trackId: string, updates: Partial<TimelineTrack>) => void;
  reorderTracks: (trackIds: string[]) => void;
  toggleTrackLock: (trackId: string) => void;
  toggleTrackVisibility: (trackId: string) => void;
  toggleTrackMute: (trackId: string) => void;
  setTracks: (tracks: TimelineTrack[]) => void;

  // === CLIP ACTIONS ===
  addClip: (
    clip: Omit<TimelineClip, "id" | "createdAt" | "updatedAt">,
  ) => string;
  deleteClip: (clipId: string) => void;
  deleteClips: (clipIds: string[]) => void;
  updateClip: (clipId: string, updates: Partial<TimelineClip>) => void;
  moveClip: (clipId: string, trackId: string, startTime: number) => void;
  duplicateClip: (clipId: string) => string | null;
  splitClip: (clipId: string, splitTime: number) => [string, string] | null;
  trimClip: (clipId: string, newStartTime: number, newDuration: number) => void;
  setClips: (clips: TimelineClip[] | Record<string, TimelineClip>) => void;

  // === CLIP LINKING ===
  linkClips: (clipId1: string, clipId2: string) => void;
  unlinkClips: (clipIds: string[]) => void;
  getLinkedClipIds: (clipId: string) => string[];

  // === TRANSITION ACTIONS ===
  /**
   * Add a standalone transition (fade in/out) to a single clip
   * startTime/endTime are calculated from clip timing if not provided
   */
  addTransition: (params: {
    clipId: string;
    position: "in" | "out";
    type: VideoTransitionType | AudioTransitionType;
    isAudio: boolean;
    duration?: number;
    easing?: TransitionEasing;
  }) => string;
  /**
   * Add a between transition (crossfade) between two adjacent clips
   * Creates a SINGLE TransitionEntity with both clipIds
   */
  addBetweenTransition: (params: {
    firstClipId: string;
    secondClipId: string;
    type: VideoTransitionType | AudioTransitionType;
    isAudio: boolean;
    duration?: number;
  }) => string;
  /**
   * Update transition properties (times, easing, type)
   */
  updateTransition: (
    id: string,
    updates: Partial<Omit<TransitionEntity, "id" | "clipIds" | "createdAt">>,
  ) => void;
  removeTransition: (id: string) => void;
  clearAllTransitions: () => void;
  setTransitions: (transitions: Record<string, TransitionEntity>) => void;
  /**
   * Get transitions for a specific clip
   */
  getClipTransitions: (clipId: string) => {
    inTransition?: TransitionEntity;
    outTransition?: TransitionEntity;
  };

  // === SELECTION ACTIONS ===
  selectClip: (id: string | null) => void;
  selectClips: (ids: string[]) => void;
  addToSelection: (id: string) => void;
  removeFromSelection: (id: string) => void;
  selectTransition: (id: string | null) => void;
  clearSelection: () => void;

  // === INLINE TEXT EDITING ===
  setEditingOverlayId: (id: number | null) => void;

  // === DRAG ACTIONS (UNIFIED) ===
  /** Start a new drag operation */
  startDrag: (data: Omit<UnifiedDragState, "dragId">) => string;
  /** Update the current drag state */
  updateDrag: (updates: Partial<UnifiedDragState>) => void;
  /** End the current drag operation */
  endDrag: () => void;
  /** Get the current drag state */
  getDragState: () => UnifiedDragState | null;
  /** Check if a specific type of drag is active */
  isDraggingType: (type: UnifiedDragType) => boolean;
  /** Check if any drag is active */
  isDragging: () => boolean;

  // === DRAG VISUAL ACTIONS ===
  /** Set drag visual state (ghost elements, snap lines, etc.) */
  setDragVisuals: (visuals: DragVisualState | null) => void;
  /** Update drag visual state */
  updateDragVisuals: (updates: Partial<DragVisualState>) => void;
  /** Set ghost elements for drag preview */
  setGhostElements: (elements: GhostElementData[] | null) => void;
  /** Set magnetic snap line indicator */
  setSnapLine: (
    snapLine: {
      trackIndex: number;
      snappedToTrackIndex: number;
      time: number;
    } | null,
  ) => void;
  /** Set track insertion indicator */
  setTrackInsertionIndicator: (
    indicator: {
      insertions: Array<{
        insertionIndex: number;
        trackType: "video" | "audio";
      }>;
    } | null,
  ) => void;
  /** Set committed positions (optimistic UI) */
  setCommittedPositions: (
    positions: Map<string, CommittedDragPosition>,
  ) => void;
  /** Clear a specific committed position */
  clearCommittedPosition: (clipId: string) => void;
  /** Get a committed position */
  getCommittedPosition: (clipId: string) => CommittedDragPosition | null;
  /** Reset all drag state */
  resetDragState: () => void;

  // === PLAYBACK ACTIONS ===
  setCurrentTime: (time: number) => void;
  setCurrentFrame: (frame: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setPlaybackRate: (rate: number) => void;
  play: () => void;
  pause: () => void;
  togglePlayPause: () => void;

  // === CANVAS ACTIONS ===
  setAspectRatio: (ratio: AspectRatio) => void;
  setResolution: (resolution: ResolutionPreset) => void;
  setPlayerDimensions: (dimensions: { width: number; height: number }) => void;
  setBackgroundColor: (color: string) => void;
  getAspectRatioDimensions: () => { width: number; height: number };

  // === SETTINGS ACTIONS ===
  setFps: (fps: number) => void;
  setEditMode: (mode: EditMode) => void;
  setSnappingEnabled: (enabled: boolean) => void;
  toggleSnapping: () => void;
  setShowAlignmentGuides: (show: boolean) => void;
  setTrackHeight: (height: number) => void;
  setClipHeight: (height: number) => void;

  // === PROJECT ACTIONS ===
  setProjectId: (id: string | null) => void;
  markDirty: () => void;
  markSaved: () => void;

  // === DERIVED DATA ===
  getDurationInSeconds: () => number;
  getDurationInFrames: () => number;
  getClipsByTrack: (trackId: string) => TimelineClip[];
  getClipById: (clipId: string) => TimelineClip | undefined;
  getTrackById: (trackId: string) => TimelineTrack | undefined;

  // === INITIALIZATION ===
  initialize: (params: {
    projectId?: string;
    tracks?: TimelineTrack[] | Record<string, TimelineTrack>;
    trackOrder?: string[];
    clips?: TimelineClip[] | Record<string, TimelineClip>;
    transitions?: Record<string, TransitionEntity>;
    fps?: number;
    aspectRatio?: AspectRatio;
    resolution?: ResolutionPreset;
    backgroundColor?: string;
  }) => void;
  reset: () => void;

  // === HISTORY (Undo/Redo) — thin wrappers for zundo temporal store ===
  /** @deprecated No-op. History is auto-tracked by zundo. Kept for backward compat. */
  saveToHistory: () => void;
  /** Undo the last change (delegates to temporal store) */
  undo: () => void;
  /** Redo the last undone change (delegates to temporal store) */
  redo: () => void;
  /** Clear all history (delegates to temporal store) */
  clearHistory: () => void;
  /** Check if undo is available */
  canUndo: () => boolean;
  /** Check if redo is available */
  canRedo: () => boolean;

  // === AUDIO EFFECT ACTIONS ===
  /** Add an audio effect to a clip */
  addAudioEffect: (
    clipId: string,
    effectType: import("../types/audio-effects").AudioEffectType,
  ) => string | null;

  /** Update an audio effect */
  updateAudioEffect: (
    clipId: string,
    effectId: string,
    updates: Partial<import("../types/audio-effects").AudioEffect>,
  ) => void;

  /** Remove an audio effect from a clip */
  removeAudioEffect: (clipId: string, effectId: string) => void;

  /** Reorder audio effects on a clip */
  reorderAudioEffects: (clipId: string, effectIds: string[]) => void;

  /** Duplicate an audio effect */
  duplicateAudioEffect: (clipId: string, effectId: string) => string | null;

  // === KEYFRAME ANIMATION ACTIONS ===
  /** Add a keyframe to a clip property at a specific time */
  addKeyframe: (
    clipId: string,
    propertyPath: string,
    time: number,
    value: KeyframeValue,
    interpolation?: KeyframeInterpolation,
  ) => string | null;

  /** Update an existing keyframe */
  updateKeyframe: (
    clipId: string,
    propertyPath: string,
    keyframeId: string,
    updates: Partial<Omit<Keyframe, "id">>,
  ) => void;

  /** Delete a keyframe */
  deleteKeyframe: (
    clipId: string,
    propertyPath: string,
    keyframeId: string,
  ) => void;

  /** Delete multiple keyframes */
  deleteKeyframes: (
    clipId: string,
    propertyPath: string,
    keyframeIds: string[],
  ) => void;

  /** Move a keyframe to a new time */
  moveKeyframe: (
    clipId: string,
    propertyPath: string,
    keyframeId: string,
    newTime: number,
  ) => void;

  /** Toggle keyframing for a property (stopwatch) */
  togglePropertyAnimation: (
    clipId: string,
    propertyPath: string,
    initialValue?: KeyframeValue,
  ) => void;

  /** Get keyframes for a specific property on a clip */
  getPropertyKeyframes: (
    clipId: string,
    propertyPath: string,
  ) => PropertyKeyframes | null;

  /** Check if a property has keyframing enabled */
  isPropertyAnimated: (clipId: string, propertyPath: string) => boolean;

  /** Copy keyframes to clipboard */
  copyKeyframes: (
    clipId: string,
    propertyPath: string,
    keyframeIds?: string[],
  ) => void;

  /** Paste keyframes from clipboard */
  pasteKeyframes: (
    clipId: string,
    propertyPath: string,
    targetTime: number,
  ) => void;

  /** Select keyframes */
  selectKeyframes: (
    clipId: string,
    propertyPath: string,
    keyframeIds: string[],
  ) => void;

  /** Add keyframes to selection */
  addKeyframesToSelection: (
    clipId: string,
    propertyPath: string,
    keyframeIds: string[],
  ) => void;

  /** Clear keyframe selection */
  clearKeyframeSelection: () => void;

  /** Get all keyframes for a clip */
  getClipKeyframes: (clipId: string) => PropertyKeyframes[];

  /** Set keyframe interpolation preset */
  setKeyframeInterpolation: (
    clipId: string,
    propertyPath: string,
    keyframeId: string,
    interpolation: KeyframeInterpolation,
  ) => void;
}

// ============================================================
// HELPERS
// ============================================================

/** Debug logging — only outputs in development mode */
const __DEV__ = process.env.NODE_ENV === "development";
const debugLog = __DEV__
  ? (...args: unknown[]) => console.log(...args)
  : () => {};

let dragIdCounter = 0;
const generateDragId = (): string => {
  dragIdCounter += 1;
  return `drag-${dragIdCounter}-${Date.now()}`;
};

const generateId = (prefix: string): string => {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

const defaultEasing = (): TransitionEasing => ({
  preset: EasingPreset.EASE, // Standard CSS 'ease' - more natural for video transitions than ease-in-out
});

const createDefaultTracks = (): {
  tracks: Record<string, TimelineTrack>;
  trackOrder: string[];
} => {
  const tracks: Record<string, TimelineTrack> = {};
  const trackOrder: string[] = [];

  // Create 2 video tracks
  for (let i = 0; i < 2; i++) {
    const id = `track-video-${i + 1}`;
    tracks[id] = {
      id,
      name: `V${i + 1}`,
      type: "video",
      order: i,
      group: "video",
      locked: false,
      visible: true,
      muted: false,
      allowOverlap: true,
      color: "#3b82f6",
    };
    trackOrder.push(id);
  }

  // Create 2 audio tracks
  for (let i = 0; i < 2; i++) {
    const id = `track-audio-${i + 1}`;
    tracks[id] = {
      id,
      name: `A${i + 1}`,
      type: "audio",
      order: i + 2,
      group: "audio",
      locked: false,
      visible: true,
      muted: false,
      allowOverlap: false,
      color: "#22c55e",
    };
    trackOrder.push(id);
  }

  return { tracks, trackOrder };
};

// ============================================================
// INITIAL STATE
// ============================================================

const { tracks: defaultTracks, trackOrder: defaultTrackOrder } =
  createDefaultTracks();

const initialState: VideoEditorState = {
  // Timeline data (normalized)
  tracks: defaultTracks,
  trackOrder: defaultTrackOrder,
  clips: {},
  transitions: {},

  // Selection
  selection: {
    clipIds: [],
    transitionId: null,
  },

  // Inline text editing
  editingOverlayId: null,

  // Drag state (unified)
  dragState: null,
  dragVisuals: null,

  // Playback
  playback: {
    currentTime: 0,
    isPlaying: false,
    playbackRate: 1,
  },

  // Canvas
  aspectRatio: "16:9",
  resolution: "1080p",
  playerDimensions: { width: 1920, height: 1080 },
  backgroundColor: "#000000",

  // Settings
  fps: 30,
  editMode: "select",
  snappingEnabled: true,
  showAlignmentGuides: true,
  trackHeight: 50,
  clipHeight: 40,

  // Project
  projectId: null,
  isDirty: false,
  lastSavedAt: null,

  // History — managed by zundo temporal middleware

  // Keyframe animation
  keyframeSelection: null,
  keyframeClipboard: null,
};

// ============================================================
// HELPERS: Array/Record conversion utilities
// ============================================================

/** Convert an array of tracks to a Record keyed by ID */
function tracksArrayToRecord(
  tracks: TimelineTrack[],
): Record<string, TimelineTrack> {
  const record: Record<string, TimelineTrack> = {};
  for (const track of tracks) {
    record[track.id] = track;
  }
  return record;
}

/** Convert Record of tracks to ordered array using trackOrder */
function tracksRecordToArray(
  tracks: Record<string, TimelineTrack>,
  trackOrder: string[],
): TimelineTrack[] {
  return trackOrder.map((id) => tracks[id]).filter(Boolean);
}

/** Convert an array of clips to a Record keyed by ID */
function clipsArrayToRecord(
  clips: TimelineClip[],
): Record<string, TimelineClip> {
  const record: Record<string, TimelineClip> = {};
  for (const clip of clips) {
    record[clip.id] = clip;
  }
  return record;
}

/** Convert Record of clips to array */
function clipsRecordToArray(
  clips: Record<string, TimelineClip>,
): TimelineClip[] {
  return Object.values(clips);
}

/** Get all clips as an array sorted by startTime */
function getClipsSortedByStartTime(
  clips: Record<string, TimelineClip>,
): TimelineClip[] {
  return Object.values(clips).sort((a, b) => a.startTime - b.startTime);
}

/** Get clips for a specific track, sorted by startTime */
function getTrackClips(
  clips: Record<string, TimelineClip>,
  trackId: string,
): TimelineClip[] {
  return Object.values(clips)
    .filter((c) => c.trackId === trackId)
    .sort((a, b) => a.startTime - b.startTime);
}

// ============================================================
// STORE
// ============================================================

export type VideoEditorStore = VideoEditorState & VideoEditorActions;

// Throttle utility for batching rapid history entries (drag, resize, etc.)
function createThrottle<T extends (...args: any[]) => void>(
  fn: T,
  ms: number,
): T {
  let lastCall = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  return ((...args: any[]) => {
    const now = Date.now();
    if (timer) clearTimeout(timer);
    if (now - lastCall >= ms) {
      lastCall = now;
      fn(...args);
    } else {
      timer = setTimeout(
        () => {
          lastCall = Date.now();
          fn(...args);
        },
        ms - (now - lastCall),
      );
    }
  }) as T;
}

export const useVideoEditorStore = create<VideoEditorStore>()(
  subscribeWithSelector(
    persist(
      mutative(
        temporal(
          (set, get) => ({
            ...initialState,

            // ========================================
            // TRACK ACTIONS
            // ========================================

            addTrack: (
              type: TrackType,
              options: Partial<TimelineTrack> = {},
            ) => {
              const state = get();
              const allTracks = Object.values(state.tracks) as TimelineTrack[];
              const existingTracksOfType = allTracks.filter(
                (t) => t.type === type,
              );

              const newTrack: TimelineTrack = {
                id: generateId("track"),
                type,
                name:
                  options.name ||
                  `${type === "video" ? "V" : "A"}${existingTracksOfType.length + 1}`,
                order: 0,
                group: type,
                locked: options.locked ?? false,
                visible: options.visible ?? true,
                muted: options.muted ?? false,
                allowOverlap: options.allowOverlap ?? type === "video",
                ...options,
              };

              const videoOrder = state.trackOrder.filter(
                (id) => state.tracks[id]?.type === "video",
              );
              const audioOrder = state.trackOrder.filter(
                (id) => state.tracks[id]?.type === "audio",
              );

              let newTrackOrder: string[];
              if (type === "video") {
                newTrackOrder = [...videoOrder, newTrack.id, ...audioOrder];
              } else {
                newTrackOrder = [...videoOrder, ...audioOrder, newTrack.id];
              }

              set((state) => {
                state.tracks[newTrack.id] = newTrack;
                state.trackOrder = newTrackOrder;
                newTrackOrder.forEach((id, index) => {
                  if (state.tracks[id]) {
                    state.tracks[id].order = index;
                  }
                });
                state.isDirty = true;
              });
              return newTrack.id;
            },

            deleteTrack: (trackId, deleteClips = true) => {
              set((state) => {
                delete state.tracks[trackId];
                state.trackOrder = state.trackOrder.filter(
                  (id) => id !== trackId,
                );

                const deletedClipIds = new Set<string>();
                if (deleteClips) {
                  for (const [id, c] of Object.entries(state.clips)) {
                    if (c.trackId === trackId) {
                      deletedClipIds.add(id);
                      delete state.clips[id];
                    }
                  }
                }

                for (const [id, t] of Object.entries(state.transitions)) {
                  if (
                    t.clipIds.some(
                      (cid) => cid != null && deletedClipIds.has(cid),
                    )
                  ) {
                    delete state.transitions[id];
                  }
                }

                state.isDirty = true;
              });
            },

            updateTrack: (trackId, updates) => {
              set((state) => {
                const track = state.tracks[trackId];
                if (!track) return;
                Object.assign(state.tracks[trackId], updates);
                state.isDirty = true;
              });
            },

            reorderTracks: (trackIds) => {
              set((state) => {
                const validOrder = trackIds.filter((id) => state.tracks[id]);
                validOrder.forEach((id, index) => {
                  state.tracks[id].order = index;
                });
                state.trackOrder = validOrder;
                state.isDirty = true;
              });
            },

            toggleTrackLock: (trackId) => {
              set((state) => {
                if (!state.tracks[trackId]) return;
                state.tracks[trackId].locked = !state.tracks[trackId].locked;
                state.isDirty = true;
              });
            },

            toggleTrackVisibility: (trackId) => {
              set((state) => {
                if (!state.tracks[trackId]) return;
                state.tracks[trackId].visible = !state.tracks[trackId].visible;
                state.isDirty = true;
              });
            },

            toggleTrackMute: (trackId) => {
              set((state) => {
                if (!state.tracks[trackId]) return;
                state.tracks[trackId].muted = !state.tracks[trackId].muted;
                state.isDirty = true;
              });
            },

            setTracks: (tracks) => {
              // Accept array input and convert to Record for backward compat
              const tracksRecord = tracksArrayToRecord(tracks);
              const trackOrder = tracks.map((t) => t.id);
              set({ tracks: tracksRecord, trackOrder, isDirty: true });
            },

            // ========================================
            // CLIP ACTIONS (with validation)
            // ========================================

            addClip: (clipData) => {
              const state = get();
              const now = Date.now();

              // Find target track (O(1) lookup)
              let targetTrack = state.tracks[clipData.trackId];

              // Validate track exists
              if (!targetTrack) {
                console.error(
                  "[VideoEditorStore] addClip: Target track not found:",
                  clipData.trackId,
                );
                // Try to find a compatible track
                const requiredType =
                  clipData.type === "audio" ? "audio" : "video";
                const compatibleTrack = (
                  Object.values(state.tracks) as TimelineTrack[]
                ).find((t) => t.type === requiredType && !t.locked);
                if (!compatibleTrack) {
                  console.error(
                    "[VideoEditorStore] addClip: No compatible track found",
                  );
                  return "";
                }
                clipData = { ...clipData, trackId: compatibleTrack.id };
                targetTrack = compatibleTrack;
              }

              // Validate track type compatibility
              const track = state.tracks[clipData.trackId]!;
              const requiredTrackType =
                clipData.type === "audio" ? "audio" : "video";

              if (track.type !== requiredTrackType) {
                console.warn(
                  "[VideoEditorStore] addClip: Track type mismatch, redirecting to correct track",
                );
                const correctTrack = (
                  Object.values(state.tracks) as TimelineTrack[]
                ).find((t) => t.type === requiredTrackType && !t.locked);
                if (correctTrack) {
                  clipData = { ...clipData, trackId: correctTrack.id };
                } else {
                  console.error(
                    "[VideoEditorStore] addClip: No compatible track found for type:",
                    clipData.type,
                  );
                  return "";
                }
              }

              // Validate track is not locked
              const finalTrack = state.tracks[clipData.trackId]!;
              if (finalTrack.locked) {
                console.error(
                  "[VideoEditorStore] addClip: Cannot add clip to locked track",
                );
                return "";
              }

              // Validate and fix start time
              let startTime = Math.max(0, clipData.startTime);

              // Validate duration
              const duration = Math.max(0.033, clipData.duration); // Minimum ~1 frame at 30fps

              // Check for overlaps on non-overlap tracks and create new track if needed
              let targetTrackId = clipData.trackId;
              let newTrackToAdd: TimelineTrack | null = null;

              if (!finalTrack.allowOverlap) {
                const trackClips = getTrackClips(state.clips, finalTrack.id);

                // Check if proposed position overlaps
                const wouldOverlap = trackClips.some((existing) => {
                  const existingEnd = existing.startTime + existing.duration;
                  const newEnd = startTime + duration;
                  return startTime < existingEnd && newEnd > existing.startTime;
                });

                if (wouldOverlap) {
                  debugLog(
                    "[VideoEditorStore] addClip: Overlap detected, creating new track",
                  );

                  // Create a new track of the same type
                  const trackType = finalTrack.type;
                  const existingTracksOfType = (
                    Object.values(state.tracks) as TimelineTrack[]
                  ).filter((t) => t.type === trackType);
                  const newTrackNumber = existingTracksOfType.length + 1;

                  newTrackToAdd = {
                    id: generateId("track"),
                    name: `${trackType === "video" ? "Video" : "Audio"} ${newTrackNumber}`,
                    type: trackType,
                    order: existingTracksOfType.length,
                    height: trackType === "video" ? 80 : 60,
                    locked: false,
                    visible: true,
                    muted: false,
                    allowOverlap: false,
                    createdAt: now,
                    updatedAt: now,
                  };

                  targetTrackId = newTrackToAdd!.id;
                  debugLog(
                    "[VideoEditorStore] addClip: Will create new track:",
                    newTrackToAdd!.id,
                    "for clip",
                  );
                }
              }

              const newClip: TimelineClip = {
                ...clipData,
                trackId: targetTrackId,
                startTime,
                duration,
                id: generateId("clip"),
                createdAt: now,
                updatedAt: now,
              };

              set((state) => {
                if (newTrackToAdd) {
                  state.tracks[newTrackToAdd!.id] = newTrackToAdd!;
                  state.trackOrder.push(newTrackToAdd!.id);
                }
                state.clips[newClip.id] = newClip;
                state.selection.clipIds = [newClip.id];
                state.selection.transitionId = null;
                state.isDirty = true;
              });

              return newClip.id;
            },

            deleteClip: (clipId) => {
              set((state) => {
                const clip = state.clips[clipId];
                const linkedClipId = clip?.linkedClipId;

                // Clean up transitions
                for (const [id, t] of Object.entries(state.transitions)) {
                  if (
                    t.clipIds.includes(clipId) ||
                    (linkedClipId && t.clipIds.includes(linkedClipId))
                  ) {
                    delete state.transitions[id];
                  }
                }

                delete state.clips[clipId];
                if (linkedClipId) delete state.clips[linkedClipId];

                state.selection.clipIds = state.selection.clipIds.filter(
                  (id) => id !== clipId && id !== linkedClipId,
                );
                state.isDirty = true;
              });
            },

            deleteClips: (clipIds) => {
              set((state) => {
                const allIdsToDelete = new Set<string>(clipIds as string[]);
                (clipIds as string[]).forEach((id) => {
                  const clip = state.clips[id];
                  if (clip?.linkedClipId) {
                    allIdsToDelete.add(clip.linkedClipId);
                  }
                });

                for (const [id, t] of Object.entries(state.transitions)) {
                  if (
                    t.clipIds.some(
                      (cid) => cid != null && allIdsToDelete.has(cid),
                    )
                  ) {
                    delete state.transitions[id];
                  }
                }

                allIdsToDelete.forEach((id) => delete state.clips[id]);

                state.selection.clipIds = state.selection.clipIds.filter(
                  (id) => !allIdsToDelete.has(id),
                );
                state.isDirty = true;
              });
            },

            updateClip: (clipId, updates) => {
              const state = get();
              const clip = state.clips[clipId];

              if (!clip) {
                console.error(
                  "[VideoEditorStore] updateClip: Clip not found:",
                  clipId,
                );
                return;
              }

              // Log audio effect updates
              if (updates.audioEffects !== undefined) {
                debugLog(
                  "[VideoEditorStore] updateClip: Updating audioEffects for",
                  clipId,
                );
                debugLog(
                  "[VideoEditorStore] Current audioEffects:",
                  clip.audioEffects,
                );
                debugLog(
                  "[VideoEditorStore] New audioEffects:",
                  updates.audioEffects,
                );
              }

              // If updating trackId, validate track type compatibility
              if (updates.trackId && updates.trackId !== clip.trackId) {
                const newTrack = state.tracks[updates.trackId];
                if (!newTrack) {
                  console.error(
                    "[VideoEditorStore] updateClip: Target track not found:",
                    updates.trackId,
                  );
                  return;
                }

                if (newTrack.locked) {
                  console.error(
                    "[VideoEditorStore] updateClip: Cannot move to locked track",
                  );
                  return;
                }

                const requiredType = clip.type === "audio" ? "audio" : "video";
                if (newTrack.type !== requiredType) {
                  console.error(
                    "[VideoEditorStore] updateClip: Track type mismatch",
                  );
                  return;
                }
              }

              // Validate time values if being updated
              let finalUpdates = { ...updates };

              if (updates.startTime !== undefined) {
                finalUpdates.startTime = Math.max(0, updates.startTime);
              }

              if (updates.duration !== undefined) {
                finalUpdates.duration = Math.max(0.033, updates.duration);
              }

              // Check for overlaps if position/duration changed
              const targetTrackId = updates.trackId || clip.trackId;
              const targetTrack = state.tracks[targetTrackId];

              if (targetTrack && !targetTrack.allowOverlap) {
                const newStart = finalUpdates.startTime ?? clip.startTime;
                const newDuration = finalUpdates.duration ?? clip.duration;

                if (wouldOverlapOnTrack(state.clips, targetTrackId, newStart, newDuration, clipId)) {
                  console.warn(
                    "[VideoEditorStore] updateClip: Update would cause overlap, rejecting",
                  );
                  return;
                }
              }

              // Calculate time delta for transition sync
              const timeDelta =
                finalUpdates.startTime != null
                  ? finalUpdates.startTime - clip.startTime
                  : 0;

              set((state) => {
                Object.assign(state.clips[clipId], finalUpdates, {
                  updatedAt: Date.now(),
                });

                if (finalUpdates.audioEffects !== undefined) {
                  debugLog(
                    "[VideoEditorStore] Clip updated with audioEffects:",
                    state.clips[clipId].audioEffects,
                  );
                }

                // Auto-update transitions when clip position changes
                syncTransitionsOnClipMove(state.transitions, clipId, timeDelta);

                state.isDirty = true;
              });
            },

            moveClip: (clipId, trackId, startTime) => {
              const state = get();
              const clip = state.clips[clipId];

              if (!clip) {
                console.error(
                  "[VideoEditorStore] moveClip: Clip not found:",
                  clipId,
                );
                return;
              }

              // Validate target track
              const targetTrack = state.tracks[trackId];
              if (!targetTrack) {
                console.error(
                  "[VideoEditorStore] moveClip: Target track not found:",
                  trackId,
                );
                return;
              }

              // Check track lock
              if (targetTrack.locked) {
                console.error(
                  "[VideoEditorStore] moveClip: Cannot move to locked track",
                );
                return;
              }

              // Validate track type compatibility
              const requiredType = clip.type === "audio" ? "audio" : "video";
              if (targetTrack.type !== requiredType) {
                console.error(
                  "[VideoEditorStore] moveClip: Track type mismatch -",
                  clip.type,
                  "cannot go on",
                  targetTrack.type,
                  "track",
                );
                return;
              }

              // Validate start time
              const validStartTime = Math.max(0, startTime);

              // Check for overlaps on non-overlap tracks
              if (!targetTrack.allowOverlap) {
                if (wouldOverlapOnTrack(state.clips, trackId, validStartTime, clip.duration, clipId)) {
                  console.warn(
                    "[VideoEditorStore] moveClip: Move would cause overlap, rejecting",
                  );
                  return;
                }
              }

              const timeDelta = validStartTime - clip.startTime;

              set((state) => {
                state.clips[clipId].trackId = trackId;
                state.clips[clipId].startTime = validStartTime;
                state.clips[clipId].updatedAt = Date.now();

                syncTransitionsOnClipMove(state.transitions, clipId, timeDelta);

                state.isDirty = true;
              });
            },

            duplicateClip: (clipId) => {
              const state = get();
              const clip = state.clips[clipId];

              if (!clip) return null;

              const track = state.tracks[clip.trackId];
              if (!track) return null;

              // Find a valid position for the duplicate
              let newStartTime = clip.startTime + clip.duration;

              // For non-overlap tracks, ensure no collision
              if (!track.allowOverlap) {
                const trackClips = getTrackClips(state.clips, clip.trackId);

                // Find the first available position after the original clip
                for (const existing of trackClips) {
                  const existingEnd = existing.startTime + existing.duration;
                  if (
                    newStartTime < existingEnd &&
                    newStartTime + clip.duration > existing.startTime
                  ) {
                    newStartTime = existingEnd;
                  }
                }
              }

              const now = Date.now();
              const newClip: TimelineClip = {
                ...clip,
                id: generateId("clip"),
                startTime: newStartTime,
                linkedClipId: undefined,
                createdAt: now,
                updatedAt: now,
              };

              set((state) => {
                state.clips[newClip.id] = newClip;
                state.isDirty = true;
              });

              return newClip.id;
            },

            splitClip: (clipId, splitTime) => {
              const state = get();
              const clip = state.clips[clipId];

              if (!clip) return null;
              if (
                splitTime <= clip.startTime ||
                splitTime >= clip.startTime + clip.duration
              ) {
                return null;
              }

              const now = Date.now();
              const firstDuration = splitTime - clip.startTime;
              const secondDuration = clip.duration - firstDuration;

              const firstClip: TimelineClip = {
                ...clip,
                duration: firstDuration,
                updatedAt: now,
              };

              const secondClip: TimelineClip = {
                ...clip,
                id: generateId("clip"),
                startTime: splitTime,
                duration: secondDuration,
                linkedClipId: undefined,
                createdAt: now,
                updatedAt: now,
                media: clip.media
                  ? {
                      ...clip.media,
                      mediaStartTime:
                        (clip.media.mediaStartTime ?? 0) + firstDuration,
                    }
                  : undefined,
              };

              // Bug fix: transfer transitions to the correct clip halves
              const { inTransition, outTransition } = getClipTransitionsPure(
                clipId,
                state.transitions,
              );
              const newTransitions = { ...state.transitions };

              // In-transition stays on the first half (already references clipId)
              // No changes needed for in-transition unless it's a between transition

              // Out-transition moves to the second half
              if (outTransition) {
                const outT = outTransition;
                if (outT.position === "out") {
                  // Standalone out transition: reassign to second clip
                  newTransitions[outT.id] = {
                    ...outT,
                    clipIds: [secondClip.id, outT.clipIds[1]],
                    startTime:
                      secondClip.startTime +
                      secondDuration -
                      (outT.endTime - outT.startTime),
                    endTime: secondClip.startTime + secondDuration,
                    updatedAt: now,
                  };
                } else if (outT.position === "between") {
                  // Between transition: update to reference second clip instead of original
                  newTransitions[outT.id] = {
                    ...outT,
                    clipIds: [secondClip.id, outT.clipIds[1]],
                    updatedAt: now,
                  };
                }
              }

              set((state) => {
                state.clips[clipId] = firstClip;
                state.clips[secondClip.id] = secondClip;
                state.transitions = newTransitions;
                state.isDirty = true;
              });

              return [firstClip.id, secondClip.id];
            },

            trimClip: (clipId, newStartTime, newDuration) => {
              const state = get();
              const clip = state.clips[clipId];
              if (!clip) return;

              // Validation: floor start time at 0
              const validStartTime = Math.max(0, newStartTime);

              // Validation: enforce minimum duration (~1 frame at 30fps)
              const minDuration = 1 / (state.fps || 30);
              const validDuration = Math.max(minDuration, newDuration);

              // Validation: check for overlaps on non-overlap tracks
              const track = state.tracks[clip.trackId];
              if (track && !track.allowOverlap) {
                if (wouldOverlapOnTrack(state.clips, clip.trackId, validStartTime, validDuration, clipId)) {
                  console.warn(
                    "[VideoEditorStore] trimClip: Trim would cause overlap, rejecting",
                  );
                  return;
                }
              }

              const timeDelta = validStartTime - clip.startTime;

              set((state) => {
                state.clips[clipId].startTime = validStartTime;
                state.clips[clipId].duration = validDuration;
                state.clips[clipId].updatedAt = Date.now();

                syncTransitionsOnClipMove(state.transitions, clipId, timeDelta);

                state.isDirty = true;
              });
            },

            setClips: (clips) => {
              // Accept both array and Record input for backward compat
              const clipsRecord = Array.isArray(clips)
                ? clipsArrayToRecord(clips)
                : clips;
              set({ clips: clipsRecord, isDirty: true });
            },

            // ========================================
            // CLIP LINKING
            // ========================================

            linkClips: (clipId1, clipId2) => {
              set((state) => {
                if (!state.clips[clipId1] || !state.clips[clipId2]) return;
                state.clips[clipId1].linkedClipId = clipId2;
                state.clips[clipId1].updatedAt = Date.now();
                state.clips[clipId2].linkedClipId = clipId1;
                state.clips[clipId2].updatedAt = Date.now();
                state.isDirty = true;
              });
            },

            unlinkClips: (clipIds) => {
              const clipIdSet = new Set(clipIds);

              set((state) => {
                for (const [id, clip] of Object.entries(state.clips)) {
                  if (
                    clipIdSet.has(id) ||
                    (clip.linkedClipId && clipIdSet.has(clip.linkedClipId))
                  ) {
                    state.clips[id].linkedClipId = undefined;
                    state.clips[id].updatedAt = Date.now();
                  }
                }
                state.isDirty = true;
              });
            },

            getLinkedClipIds: (clipId) => {
              const state = get();
              const clip = state.clips[clipId];

              if (!clip) return [clipId];
              if (!clip.linkedClipId) return [clipId];

              return [clipId, clip.linkedClipId];
            },

            // ========================================
            // TRANSITION ACTIONS (Simplified with absolute times)
            // ========================================

            /**
             * Add a standalone transition (fade in/out) to a single clip
             * Calculates absolute startTime/endTime from clip timing
             */
            addTransition: ({
              clipId,
              position,
              type,
              isAudio,
              duration = 1,
              easing,
            }) => {
              const id = generateId("transition");
              const now = Date.now();
              const state = get();

              // Find the clip to calculate absolute times (O(1) lookup)
              const clip = state.clips[clipId];
              if (!clip) {
                console.error("[addTransition] Clip not found:", clipId);
                return id;
              }

              // Calculate absolute times based on position
              let startTime: number;
              let endTime: number;

              if (position === "in") {
                // Transition at start of clip
                startTime = clip.startTime;
                endTime = clip.startTime + duration;
              } else {
                // Transition at end of clip
                startTime = clip.startTime + clip.duration - duration;
                endTime = clip.startTime + clip.duration;
              }

              const transition: TransitionEntity = {
                id,
                type,
                startTime,
                endTime,
                easing: easing || defaultEasing(),
                position,
                clipIds: [clipId],
                isAudio,
                createdAt: now,
                updatedAt: now,
              };

              set((state) => {
                // Remove any existing transition at this position for this clip
                for (const [existingId, existing] of Object.entries(
                  state.transitions,
                )) {
                  if (
                    existing.clipIds[0] === clipId &&
                    existing.position === position
                  ) {
                    delete state.transitions[existingId];
                  }
                }
                state.transitions[id] = transition;
                state.isDirty = true;
              });

              return id;
            },

            /**
             * Add a between transition (crossfade) between two adjacent clips
             * Creates a SINGLE TransitionEntity with both clipIds
             */
            addBetweenTransition: ({
              firstClipId,
              secondClipId,
              type,
              isAudio,
              duration = 1,
            }) => {
              const id = generateId("transition");
              const now = Date.now();
              const state = get();

              // Find the clips to calculate the boundary point (O(1) lookup)
              const firstClip = state.clips[firstClipId];
              const secondClip = state.clips[secondClipId];

              if (!firstClip || !secondClip) {
                console.error(
                  "[addBetweenTransition] Clips not found:",
                  firstClipId,
                  secondClipId,
                );
                return id;
              }

              // Calculate transition times: centered at the boundary between clips
              // Boundary is where first clip ends = second clip starts
              const boundary = firstClip.startTime + firstClip.duration;
              const halfDuration = duration / 2;

              // Transition spans from halfDuration before boundary to halfDuration after
              // IMPORTANT: Clips do NOT move - they stay in place on the timeline
              // The overlap is created during RENDERING by extending clip render durations
              const transition: TransitionEntity = {
                id,
                type,
                startTime: boundary - halfDuration, // When crossfade starts
                endTime: boundary + halfDuration, // When crossfade ends
                easing: defaultEasing(),
                position: "between",
                clipIds: [firstClipId, secondClipId],
                isAudio,
                createdAt: now,
                updatedAt: now,
              };

              set((state) => {
                // Remove any existing between transitions involving these clips
                for (const [existingId, existing] of Object.entries(
                  state.transitions,
                )) {
                  if (existing.position === "between") {
                    if (
                      existing.clipIds.includes(firstClipId) ||
                      existing.clipIds.includes(secondClipId)
                    ) {
                      delete state.transitions[existingId];
                    }
                  }
                  if (
                    existing.clipIds[0] === firstClipId &&
                    existing.position === "out"
                  ) {
                    delete state.transitions[existingId];
                  }
                  if (
                    existing.clipIds[0] === secondClipId &&
                    existing.position === "in"
                  ) {
                    delete state.transitions[existingId];
                  }
                }
                state.transitions[id] = transition;
              });

              return id;
            },

            /**
             * Update transition properties
             * No more linked transition synchronization needed!
             */
            updateTransition: (id, updates) => {
              const currentState = get();
              const transition = currentState.transitions[id];
              if (!transition) return;

              const now = Date.now();

              set((state) => {
                Object.assign(state.transitions[id], updates, {
                  updatedAt: now,
                });
                state.isDirty = true;
              });
            },

            /**
             * Remove a transition
             * No more linked transition handling needed - just delete the single entity
             */
            removeTransition: (id) => {
              const currentState = get();
              const transition = currentState.transitions[id];
              if (!transition) return;

              set((state) => {
                delete state.transitions[id];
                if (state.selection.transitionId === id) {
                  state.selection.transitionId = null;
                }
                state.isDirty = true;
              });
            },

            clearAllTransitions: () => {
              set((state) => {
                state.transitions = {};
                state.selection = { clipIds: [], transitionId: null };
                state.isDirty = true;
              });
            },

            setTransitions: (transitions) => {
              set({ transitions, isDirty: true });
            },

            /**
             * Get transitions affecting a specific clip
             * Returns in/out transitions (including between transitions where this clip is involved)
             *
             * Uses the canonical getClipTransitionsPure function internally.
             */
            getClipTransitions: (clipId: string) => {
              const state = get();
              return getClipTransitionsPure(clipId, state.transitions);
            },

            // ========================================
            // SELECTION ACTIONS
            // ========================================

            selectClip: (id) => {
              set((state) => {
                state.selection.clipIds = id !== null ? [id] : [];
                state.selection.transitionId = null;
              });
            },

            selectClips: (ids) => {
              set((state) => {
                state.selection.clipIds = ids;
                state.selection.transitionId = null;
              });
            },

            addToSelection: (id) => {
              set((state) => {
                if (!state.selection.clipIds.includes(id)) {
                  state.selection.clipIds.push(id);
                }
                state.selection.transitionId = null;
              });
            },

            removeFromSelection: (id) => {
              set((state) => {
                state.selection.clipIds = state.selection.clipIds.filter(
                  (clipId) => clipId !== id,
                );
              });
            },

            selectTransition: (id) => {
              set((state) => {
                state.selection.transitionId = id;
              });
            },

            clearSelection: () => {
              set((state) => {
                state.selection.clipIds = [];
                state.selection.transitionId = null;
                state.editingOverlayId = null;
              });
            },

            // ========================================
            // INLINE TEXT EDITING
            // ========================================

            setEditingOverlayId: (id: number | null) => {
              set((state) => {
                state.editingOverlayId = id;
              });
            },

            // ========================================
            // DRAG ACTIONS (UNIFIED)
            // ========================================

            startDrag: (data) => {
              const dragId = generateDragId();
              set((state) => {
                state.dragState = { ...data, dragId } as UnifiedDragState;
              });
              return dragId;
            },

            updateDrag: (updates) => {
              set((state) => {
                if (state.dragState) Object.assign(state.dragState, updates);
              });
            },

            endDrag: () => {
              set((state) => {
                state.dragState = null;
                state.dragVisuals = null;
              });
            },

            getDragState: () => get().dragState,

            isDraggingType: (type) => get().dragState?.type === type,

            isDragging: () => get().dragState !== null,

            // ========================================
            // DRAG VISUAL ACTIONS
            // ========================================

            setDragVisuals: (visuals) => {
              set({ dragVisuals: visuals });
            },

            updateDragVisuals: (updates) => {
              set((state) => {
                if (state.dragVisuals) {
                  Object.assign(state.dragVisuals, updates);
                } else {
                  state.dragVisuals = updates as DragVisualState;
                }
              });
            },

            setGhostElements: (elements) => {
              set((state) => {
                if (!state.dragVisuals) state.dragVisuals = {} as DragVisualState;
                state.dragVisuals.ghostElements = elements || undefined;
              });
            },

            setSnapLine: (snapLine) => {
              set((state) => {
                if (!state.dragVisuals) state.dragVisuals = {} as DragVisualState;
                state.dragVisuals.snapLine = snapLine
                  ? {
                      trackIndex: snapLine.trackIndex,
                      snappedToTrackIndex: snapLine.snappedToTrackIndex,
                      insertionTime: snapLine.time,
                    }
                  : undefined;
              });
            },

            setTrackInsertionIndicator: (indicator) => {
              set((state) => {
                if (!state.dragVisuals) state.dragVisuals = {} as DragVisualState;
                state.dragVisuals.trackInsertion = indicator || undefined;
              });
            },

            setCommittedPositions: (positions) => {
              set((state) => {
                if (!state.dragVisuals) state.dragVisuals = {} as DragVisualState;
                state.dragVisuals.committedPositions = positions;
              });
            },

            clearCommittedPosition: (clipId) => {
              const positions = get().dragVisuals?.committedPositions;
              if (positions?.has(clipId)) {
                const newPositions = new Map(positions);
                newPositions.delete(clipId);
                set((state) => {
                  if (!state.dragVisuals) state.dragVisuals = {} as DragVisualState;
                  state.dragVisuals.committedPositions = newPositions;
                });
              }
            },

            getCommittedPosition: (clipId) => {
              return get().dragVisuals?.committedPositions?.get(clipId) || null;
            },

            resetDragState: () => {
              // Preserve committed positions during reset
              const existingCommittedPositions =
                get().dragVisuals?.committedPositions;

              set({
                dragState: null,
                dragVisuals: existingCommittedPositions
                  ? {
                      committedPositions: existingCommittedPositions,
                    }
                  : null,
              });
            },

            // ========================================
            // PLAYBACK ACTIONS
            // ========================================

            setCurrentTime: (time) => {
              set((state) => {
                state.playback.currentTime = time;
              });
            },

            setCurrentFrame: (frame) => {
              const fps = get().fps;
              set((state) => {
                state.playback.currentTime = frame / fps;
              });
            },

            setIsPlaying: (playing) => {
              set((state) => {
                state.playback.isPlaying = playing;
              });
            },

            setPlaybackRate: (rate) => {
              set((state) => {
                state.playback.playbackRate = rate;
              });
            },

            play: () => {
              set((state) => {
                state.playback.isPlaying = true;
              });
            },

            pause: () => {
              set((state) => {
                state.playback.isPlaying = false;
              });
            },

            togglePlayPause: () => {
              set((state) => {
                state.playback.isPlaying = !state.playback.isPlaying;
              });
            },

            // ========================================
            // CANVAS ACTIONS
            // ========================================

            setAspectRatio: (ratio) => {
              set((state) => {
                state.aspectRatio = ratio;
                state.isDirty = true;
              });
            },

            setResolution: (resolution) => {
              set((state) => {
                state.resolution = resolution;
                state.isDirty = true;
              });
            },

            setPlayerDimensions: (dimensions) => {
              set((state) => {
                state.playerDimensions = dimensions;
              });
            },

            setBackgroundColor: (color) => {
              set((state) => {
                state.backgroundColor = color;
                state.isDirty = true;
              });
            },

            getAspectRatioDimensions: () => {
              const state = get();
              const baseWidths = {
                "720p": 1280,
                "1080p": 1920,
                "1440p": 2560,
                "4K": 3840,
              };

              const baseWidth = baseWidths[state.resolution] || 1920;

              const ratios: Record<
                AspectRatio,
                { width: number; height: number }
              > = {
                "16:9": {
                  width: baseWidth,
                  height: Math.round((baseWidth * 9) / 16),
                },
                "9:16": {
                  width: Math.round((baseWidth * 9) / 16),
                  height: baseWidth,
                },
                "1:1": { width: baseWidth, height: baseWidth },
                "4:3": {
                  width: baseWidth,
                  height: Math.round((baseWidth * 3) / 4),
                },
                "21:9": {
                  width: baseWidth,
                  height: Math.round((baseWidth * 9) / 21),
                },
                "4:5": {
                  width: Math.round((baseWidth * 4) / 5),
                  height: baseWidth,
                },
              };

              return ratios[state.aspectRatio] || ratios["16:9"];
            },

            // ========================================
            // SETTINGS ACTIONS
            // ========================================

            setFps: (fps) => {
              set((state) => {
                state.fps = fps;
              });
            },

            setEditMode: (mode) => {
              set((state) => {
                state.editMode = mode;
              });
            },

            setSnappingEnabled: (enabled) => {
              set((state) => {
                state.snappingEnabled = enabled;
              });
            },

            toggleSnapping: () => {
              set((state) => {
                state.snappingEnabled = !state.snappingEnabled;
              });
            },

            setShowAlignmentGuides: (show) => {
              set((state) => {
                state.showAlignmentGuides = show;
              });
            },

            setTrackHeight: (height) => {
              set((state) => {
                state.trackHeight = height;
              });
            },

            setClipHeight: (height) => {
              set((state) => {
                state.clipHeight = height;
              });
            },

            // ========================================
            // PROJECT ACTIONS
            // ========================================

            setProjectId: (id) => {
              set((state) => {
                state.projectId = id;
              });
            },

            markDirty: () => {
              set((state) => {
                state.isDirty = true;
              });
            },

            markSaved: () => {
              set((state) => {
                state.isDirty = false;
                state.lastSavedAt = Date.now();
              });
            },

            // ========================================
            // DERIVED DATA
            // ========================================

            getDurationInSeconds: () => {
              const state = get();
              const clipsArr = Object.values(state.clips) as TimelineClip[];
              if (clipsArr.length === 0) return 30; // Default 30 seconds

              return Math.max(...clipsArr.map((c) => c.startTime + c.duration));
            },

            getDurationInFrames: () => {
              const state = get();
              return Math.ceil(get().getDurationInSeconds() * state.fps);
            },

            getClipsByTrack: (trackId) => {
              return getTrackClips(get().clips, trackId);
            },

            getClipById: (clipId) => {
              return get().clips[clipId];
            },

            getTrackById: (trackId) => {
              return get().tracks[trackId];
            },

            // ========================================
            // INITIALIZATION
            // ========================================

            initialize: ({
              projectId,
              tracks: newTracks,
              clips: newClips,
              transitions: newTransitions,
              fps: newFps,
              aspectRatio: newAspectRatio,
              resolution: newResolution,
              backgroundColor: newBackgroundColor,
            }) => {
              // Convert array inputs to Records for backward compat
              const tracksData = newTracks
                ? Array.isArray(newTracks)
                  ? {
                      tracks: tracksArrayToRecord(newTracks),
                      trackOrder: newTracks.map((t: TimelineTrack) => t.id),
                    }
                  : { tracks: newTracks, trackOrder: Object.keys(newTracks) }
                : { tracks: defaultTracks, trackOrder: defaultTrackOrder };
              const clipsData = newClips
                ? Array.isArray(newClips)
                  ? clipsArrayToRecord(newClips)
                  : newClips
                : {};

              set((state) => {
                state.projectId = projectId ?? null;
                state.tracks = tracksData.tracks;
                state.trackOrder = tracksData.trackOrder;
                state.clips = clipsData;
                state.transitions = newTransitions ?? {};
                if (newFps !== undefined) state.fps = newFps;
                if (newAspectRatio !== undefined) state.aspectRatio = newAspectRatio;
                if (newResolution !== undefined) state.resolution = newResolution;
                if (newBackgroundColor !== undefined) state.backgroundColor = newBackgroundColor;
                state.isDirty = false;
                state.lastSavedAt = null;
              });
            },

            reset: () => {
              set((state) => {
                Object.assign(state, initialState);
              });
            },

            // ========================================
            // HISTORY (Undo/Redo) — zundo temporal wrappers
            // ========================================

            /** @deprecated No-op. History is auto-tracked by zundo temporal middleware. */
            saveToHistory: () => {
              // No-op: zundo automatically records state on every set() call.
              // This stub exists for backward compatibility with existing callsites.
            },

            undo: () => {
              useVideoEditorStore.temporal.getState().undo();
            },

            redo: () => {
              useVideoEditorStore.temporal.getState().redo();
            },

            clearHistory: () => {
              useVideoEditorStore.temporal.getState().clear();
            },

            canUndo: () => {
              return (
                useVideoEditorStore.temporal.getState().pastStates.length > 0
              );
            },

            canRedo: () => {
              return (
                useVideoEditorStore.temporal.getState().futureStates.length > 0
              );
            },

            // ========================================
            // AUDIO EFFECT ACTIONS
            // ========================================

            addAudioEffect: (clipId, effectType) => {
              const state = get();
              const clip = state.clips[clipId];
              if (!clip) return null;

              const audioEffects = clip.audioEffects || [];

              // Import dynamically to avoid circular deps
              const { createAudioEffect } = require("../types/audio-effects");
              const maxOrder =
                audioEffects.length > 0
                  ? Math.max(...audioEffects.map((e) => e.order)) + 1
                  : 0;
              const newEffect = createAudioEffect(effectType, maxOrder);

              set((state) => {
                const clip = state.clips[clipId];
                if (!clip.audioEffects) clip.audioEffects = [];
                clip.audioEffects.push(newEffect as AudioEffect);
                state.isDirty = true;
              });
              return newEffect.id;
            },

            updateAudioEffect: (clipId, effectId, updates) => {
              const state = get();
              const clip = state.clips[clipId];
              if (!clip) return;
              if (!clip.audioEffects) return;

              const effectIndex = clip.audioEffects.findIndex(
                (e) => e.id === effectId,
              );
              if (effectIndex === -1) return;

              set((state) => {
                const effect = state.clips[clipId].audioEffects?.[effectIndex];
                if (effect) Object.assign(effect, updates);
                state.isDirty = true;
              });
            },

            removeAudioEffect: (clipId, effectId) => {
              const state = get();
              const clip = state.clips[clipId];
              if (!clip) return;
              if (!clip.audioEffects) return;

              set((state) => {
                state.clips[clipId].audioEffects =
                  state.clips[clipId].audioEffects?.filter(
                    (e) => e.id !== effectId,
                  ) ?? [];
                state.isDirty = true;
              });
            },

            reorderAudioEffects: (clipId, effectIds) => {
              const state = get();
              const clip = state.clips[clipId];
              if (!clip) return;
              if (!clip.audioEffects) return;

              // Reorder effects based on effectIds array
              const effectMap = new Map(
                clip.audioEffects.map((e) => [e.id, e]),
              );
              const newAudioEffects = effectIds
                .map((id, index) => {
                  const effect = effectMap.get(id);
                  if (effect) {
                    return { ...effect, order: index };
                  }
                  return null;
                })
                .filter(Boolean) as typeof clip.audioEffects;

              set((state) => {
                state.clips[clipId].audioEffects = newAudioEffects;
                state.isDirty = true;
              });
            },

            duplicateAudioEffect: (clipId, effectId) => {
              const state = get();
              const clip = state.clips[clipId];
              if (!clip) return null;
              if (!clip.audioEffects) return null;

              const effect = clip.audioEffects.find((e) => e.id === effectId);
              if (!effect) return null;

              const maxOrder =
                Math.max(...clip.audioEffects.map((e) => e.order)) + 1;
              const newEffect = {
                ...effect,
                id: `audio-effect-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                order: maxOrder,
                name: effect.name ? `${effect.name} (Copy)` : undefined,
              };

              set((state) => {
                state.clips[clipId].audioEffects?.push(
                  newEffect as AudioEffect,
                );
                state.isDirty = true;
              });
              return newEffect.id;
            },

            // ========================================
            // KEYFRAME ANIMATION ACTIONS
            // ========================================

            addKeyframe: (
              clipId,
              propertyPath,
              time,
              value,
              interpolation = DEFAULT_INTERPOLATION,
            ) => {
              const state = get();
              const clip = state.clips[clipId];
              if (!clip) return null;

              const keyframes = clip.keyframes || [];

              // Find or create property keyframes
              let propKeyframesIndex = keyframes.findIndex(
                (pk) => pk.propertyPath === propertyPath,
              );
              let propKeyframes: PropertyKeyframes;

              if (propKeyframesIndex === -1) {
                // Create new property keyframes collection
                propKeyframes = createPropertyKeyframes(propertyPath);
                propKeyframesIndex = keyframes.length;
              } else {
                propKeyframes = { ...keyframes[propKeyframesIndex] };
              }

              // Check if keyframe already exists at this time
              const existingKf = getKeyframeAtTime(
                propKeyframes.keyframes,
                time,
              );
              if (existingKf) {
                // Update existing keyframe value
                propKeyframes.keyframes = propKeyframes.keyframes.map((kf) =>
                  kf.id === existingKf.id ? { ...kf, value } : kf,
                );
              } else {
                // Add new keyframe
                const newKeyframe = createKeyframe(time, value, interpolation);
                propKeyframes.keyframes = sortKeyframes([
                  ...propKeyframes.keyframes,
                  newKeyframe,
                ]);
              }

              // Update clip with new keyframes
              const newKeyframes = [...keyframes];
              if (propKeyframesIndex < keyframes.length) {
                newKeyframes[propKeyframesIndex] = propKeyframes;
              } else {
                newKeyframes.push(propKeyframes);
              }

              set((state) => {
                const clip = state.clips[clipId];
                if (!clip.keyframes) clip.keyframes = [];
                if (propKeyframesIndex < clip.keyframes.length) {
                  clip.keyframes[propKeyframesIndex] = propKeyframes;
                } else {
                  clip.keyframes.push(propKeyframes);
                }
                clip.updatedAt = Date.now();
                state.isDirty = true;
              });

              const addedKf =
                existingKf ||
                propKeyframes.keyframes.find((kf) => kf.time === time);
              return addedKf?.id || null;
            },

            updateKeyframe: (clipId, propertyPath, keyframeId, updates) => {
              const state = get();
              const clip = state.clips[clipId];
              if (!clip) return;

              const keyframes = clip.keyframes || [];
              const propKeyframesIndex = keyframes.findIndex(
                (pk) => pk.propertyPath === propertyPath,
              );
              if (propKeyframesIndex === -1) return;

              const propKeyframes = { ...keyframes[propKeyframesIndex] };
              propKeyframes.keyframes = propKeyframes.keyframes.map((kf) =>
                kf.id === keyframeId ? { ...kf, ...updates } : kf,
              );

              // Re-sort if time changed
              if (updates.time !== undefined) {
                propKeyframes.keyframes = sortKeyframes(
                  propKeyframes.keyframes,
                );
              }

              const newKeyframes = [...keyframes];
              newKeyframes[propKeyframesIndex] = propKeyframes;

              set((state) => {
                const clip = state.clips[clipId];
                if (!clip.keyframes) return;
                clip.keyframes[propKeyframesIndex] = propKeyframes;
                clip.updatedAt = Date.now();
                state.isDirty = true;
              });
            },

            deleteKeyframe: (clipId, propertyPath, keyframeId) => {
              const state = get();
              const clip = state.clips[clipId];
              if (!clip) return;

              const keyframes = clip.keyframes || [];
              const propKeyframesIndex = keyframes.findIndex(
                (pk) => pk.propertyPath === propertyPath,
              );
              if (propKeyframesIndex === -1) return;

              const propKeyframes = { ...keyframes[propKeyframesIndex] };
              propKeyframes.keyframes = propKeyframes.keyframes.filter(
                (kf) => kf.id !== keyframeId,
              );

              const newKeyframes = [...keyframes];
              newKeyframes[propKeyframesIndex] = propKeyframes;

              // Clear keyframe selection if the deleted keyframe was selected
              let newSelection = state.keyframeSelection;
              if (newSelection?.keyframeIds.includes(keyframeId)) {
                newSelection = {
                  ...newSelection,
                  keyframeIds: newSelection.keyframeIds.filter(
                    (id) => id !== keyframeId,
                  ),
                };
                if (newSelection.keyframeIds.length === 0) {
                  newSelection = null;
                }
              }

              set((state) => {
                const clip = state.clips[clipId];
                if (!clip.keyframes) return;
                clip.keyframes[propKeyframesIndex] = propKeyframes;
                clip.updatedAt = Date.now();

                if (state.keyframeSelection?.keyframeIds.includes(keyframeId)) {
                  state.keyframeSelection.keyframeIds =
                    state.keyframeSelection.keyframeIds.filter(
                      (id) => id !== keyframeId,
                    );
                  if (state.keyframeSelection.keyframeIds.length === 0) {
                    state.keyframeSelection = null;
                  }
                }
                state.isDirty = true;
              });
            },

            deleteKeyframes: (clipId, propertyPath, keyframeIds) => {
              const state = get();
              const clip = state.clips[clipId];
              if (!clip) return;

              const keyframes = clip.keyframes || [];
              const propKeyframesIndex = keyframes.findIndex(
                (pk) => pk.propertyPath === propertyPath,
              );
              if (propKeyframesIndex === -1) return;

              const propKeyframes = { ...keyframes[propKeyframesIndex] };
              propKeyframes.keyframes = propKeyframes.keyframes.filter(
                (kf) => !keyframeIds.includes(kf.id),
              );

              const newKeyframes = [...keyframes];
              newKeyframes[propKeyframesIndex] = propKeyframes;

              // Clear keyframe selection if deleted keyframes were selected
              let newSelection = state.keyframeSelection;
              if (newSelection) {
                const remainingIds = newSelection.keyframeIds.filter(
                  (id) => !keyframeIds.includes(id),
                );
                if (remainingIds.length === 0) {
                  newSelection = null;
                } else {
                  newSelection = { ...newSelection, keyframeIds: remainingIds };
                }
              }

              set((state) => {
                const clip = state.clips[clipId];
                if (!clip.keyframes) return;
                clip.keyframes[propKeyframesIndex] = propKeyframes;
                clip.updatedAt = Date.now();

                if (state.keyframeSelection) {
                  const remainingIds =
                    state.keyframeSelection.keyframeIds.filter(
                      (id) => !keyframeIds.includes(id),
                    );
                  if (remainingIds.length === 0) {
                    state.keyframeSelection = null;
                  } else {
                    state.keyframeSelection.keyframeIds = remainingIds;
                  }
                }
                state.isDirty = true;
              });
            },

            moveKeyframe: (clipId, propertyPath, keyframeId, newTime) => {
              get().updateKeyframe(clipId, propertyPath, keyframeId, {
                time: newTime,
              });
            },

            togglePropertyAnimation: (clipId, propertyPath, initialValue) => {
              const state = get();
              const clip = state.clips[clipId];
              if (!clip) return;

              const keyframes = clip.keyframes || [];
              const propKeyframesIndex = keyframes.findIndex(
                (pk) => pk.propertyPath === propertyPath,
              );

              let newKeyframes: PropertyKeyframes[];

              if (propKeyframesIndex === -1) {
                // Enable keyframing - create with initial keyframe if value provided
                const propKeyframes = createPropertyKeyframes(propertyPath);
                if (initialValue !== undefined) {
                  propKeyframes.keyframes = [createKeyframe(0, initialValue)];
                }
                newKeyframes = [...keyframes, propKeyframes];
              } else {
                // Toggle enabled state
                const propKeyframes = { ...keyframes[propKeyframesIndex] };
                propKeyframes.enabled = !propKeyframes.enabled;
                newKeyframes = [...keyframes];
                newKeyframes[propKeyframesIndex] = propKeyframes;
              }

              set((state) => {
                state.clips[clipId].keyframes = newKeyframes;
                state.clips[clipId].updatedAt = Date.now();
                state.isDirty = true;
              });
            },

            getPropertyKeyframes: (clipId, propertyPath) => {
              const state = get();
              const clip = state.clips[clipId];
              if (!clip?.keyframes) return null;
              return (
                clip.keyframes.find((pk) => pk.propertyPath === propertyPath) ||
                null
              );
            },

            isPropertyAnimated: (clipId, propertyPath) => {
              const propKeyframes = get().getPropertyKeyframes(
                clipId,
                propertyPath,
              );
              return (
                propKeyframes?.enabled === true &&
                propKeyframes.keyframes.length > 0
              );
            },

            copyKeyframes: (clipId, propertyPath, keyframeIds) => {
              const propKeyframes = get().getPropertyKeyframes(
                clipId,
                propertyPath,
              );
              if (!propKeyframes) return;

              let keyframesToCopy = propKeyframes.keyframes;
              if (keyframeIds && keyframeIds.length > 0) {
                keyframesToCopy = keyframesToCopy.filter((kf) =>
                  keyframeIds.includes(kf.id),
                );
              }

              if (keyframesToCopy.length === 0) return;

              // Normalize times to start from 0
              const minTime = Math.min(...keyframesToCopy.map((kf) => kf.time));
              const normalizedKeyframes = keyframesToCopy.map((kf) => ({
                ...kf,
                time: kf.time - minTime,
              }));

              set({
                keyframeClipboard: {
                  sourceClipId: clipId,
                  sourcePropertyPath: propertyPath,
                  keyframes: normalizedKeyframes,
                  timeOffset: minTime,
                },
              });
            },

            pasteKeyframes: (clipId, propertyPath, targetTime) => {
              const state = get();
              if (!state.keyframeClipboard) return;

              const { keyframes: clipboardKeyframes } = state.keyframeClipboard;

              // Add each keyframe at the offset from target time
              clipboardKeyframes.forEach((kf) => {
                get().addKeyframe(
                  clipId,
                  propertyPath,
                  targetTime + kf.time,
                  kf.value,
                  kf.interpolation,
                );
              });
            },

            selectKeyframes: (clipId, propertyPath, keyframeIds) => {
              set({
                keyframeSelection: {
                  clipId,
                  propertyPath,
                  keyframeIds,
                },
              });
            },

            addKeyframesToSelection: (clipId, propertyPath, keyframeIds) => {
              const state = get();

              // If selecting from same clip/property, add to existing selection
              if (
                state.keyframeSelection?.clipId === clipId &&
                state.keyframeSelection?.propertyPath === propertyPath
              ) {
                const currentSelection = state.keyframeSelection!;
                set({
                  keyframeSelection: {
                    clipId: currentSelection.clipId,
                    propertyPath: currentSelection.propertyPath,
                    keyframeIds: [
                      ...new Set([
                        ...currentSelection.keyframeIds,
                        ...keyframeIds,
                      ]),
                    ],
                  },
                });
              } else {
                // Otherwise, start new selection
                set({
                  keyframeSelection: {
                    clipId,
                    propertyPath,
                    keyframeIds,
                  },
                });
              }
            },

            clearKeyframeSelection: () => {
              set({ keyframeSelection: null });
            },

            getClipKeyframes: (clipId) => {
              const clip = get().clips[clipId];
              return clip?.keyframes || [];
            },

            setKeyframeInterpolation: (
              clipId,
              propertyPath,
              keyframeId,
              interpolation,
            ) => {
              get().updateKeyframe(clipId, propertyPath, keyframeId, {
                interpolation,
              });
            },
          }),
          // zundo temporal options
          {
            // Only track timeline-relevant state for undo/redo
            partialize: (state: VideoEditorStore) => ({
              clips: state.clips,
              tracks: state.tracks,
              trackOrder: state.trackOrder,
              transitions: state.transitions,
            }),
            // Skip recording when tracked state hasn't changed (reference equality)
            equality: (pastState: any, currentState: any) =>
              pastState.clips === currentState.clips &&
              pastState.tracks === currentState.tracks &&
              pastState.trackOrder === currentState.trackOrder &&
              pastState.transitions === currentState.transitions,
            // Throttle to batch rapid updates (drag, resize, trim) into single undo steps
            handleSet: (handleSet: any) =>
              createThrottle<typeof handleSet>((state: any) => {
                handleSet(state);
              }, 500),
            // Keep last 50 states
            limit: 50,
          },
        ),
      ), // Close mutative(temporal(...))
      {
        // persist config
        name: "video-editor-store-v4", // Bump version to reset persisted state
        // Only persist user preferences, not project data (that goes to Supabase)
        partialize: (state) => ({
          snappingEnabled: state.snappingEnabled,
          editMode: state.editMode,
          showAlignmentGuides: state.showAlignmentGuides,
          trackHeight: state.trackHeight,
          clipHeight: state.clipHeight,
        }),
        // Merge persisted state with initial state to handle new fields
        merge: (persistedState: any, currentState: any) => ({
          ...currentState,
          ...(persistedState || {}),
        }),
      },
    ), // Close persist(...)
  ), // Close subscribeWithSelector(...)
);

/**
 * Type-safe getState() helper.
 * The middleware stack (temporal → mutative → persist → subscribeWithSelector)
 * causes TypeScript to lose the store type in some contexts.
 * Use this helper instead of useVideoEditorStore.getState() when TypeScript
 * infers the state as 'unknown' or '{}'.
 */
export const getTypedState = (): VideoEditorStore =>
  useVideoEditorStore.getState() as unknown as VideoEditorStore;

/**
 * Type-safe selector hook.
 * The middleware stack causes useVideoEditorStore's selector parameter
 * to be inferred as (state: unknown) => T. This wrapper casts the store
 * so selectors receive the correct VideoEditorStore type automatically.
 * 
 * Usage: const tracks = useTypedStore(s => s.tracks);
 */
export const useTypedStore = <T>(
  selector: (state: VideoEditorStore) => T,
  equalityFn?: (a: T, b: T) => boolean
): T => {
  return (useVideoEditorStore as any)(selector, equalityFn) as T;
};

// ============================================================
// SELECTORS
// ============================================================
// Memoized computed selectors are in ./memoized-selectors.ts
// Only atomic (single-property) selectors remain here.

// Import memoized computed selectors (available locally + re-exported)
import {
  selectTracksArray,
  selectTracks,
  selectVideoTracks,
  selectAudioTracks,
  selectClipsArray,
  selectClipIds,
  selectClipPositions,
  selectClipsWithLinkGroups,
  selectClipsByTrackIndex,
  selectTransitionsByClipIndex,
  selectTracksWithClips,
  selectDurationInSeconds,
  selectDurationInFrames,
  computeLinkGroup,
} from "./memoized-selectors";

// Re-export memoized computed selectors for external consumers
export {
  selectTracksArray,
  selectTracks,
  selectVideoTracks,
  selectAudioTracks,
  selectClipsArray,
  selectClipIds,
  selectClipPositions,
  selectClipsWithLinkGroups,
  selectClipsByTrackIndex,
  selectTransitionsByClipIndex,
  selectTracksWithClips,
  selectDurationInSeconds,
  selectDurationInFrames,
  computeLinkGroup,
};

// Re-export types from memoized-selectors
export type {
  ItemTransition,
  TimelineItem,
  TrackWithClips,
} from "./memoized-selectors";

// === ATOMIC SELECTORS (no memoization needed — direct property access) ===

export const selectTrackById = (trackId: string) => (state: VideoEditorStore) =>
  state.tracks[trackId];

/** Get clips Record (normalized) */
export const selectClips = (state: VideoEditorStore) => state.clips;
export const selectClipById = (clipId: string) => (state: VideoEditorStore) =>
  state.clips[clipId];
export const selectClipsByTrack =
  (trackId: string) => (state: VideoEditorStore) =>
    getTrackClips(state.clips, trackId);
export const selectClipsInRange =
  (startTime: number, endTime: number, trackId?: string) =>
  (state: VideoEditorStore) => {
    let clips = Object.values(state.clips);
    if (trackId) {
      clips = clips.filter((c) => c.trackId === trackId);
    }
    return clips.filter((c) => {
      const clipEnd = c.startTime + c.duration;
      return c.startTime < endTime && clipEnd > startTime;
    });
  };

// === TRANSITION SELECTORS ===
export const selectTransitions = (state: VideoEditorStore) => state.transitions;
export const selectTransitionById = (id: string) => (state: VideoEditorStore) =>
  state.transitions[id];
export const selectClipTransitions =
  (clipId: string) => (state: VideoEditorStore) => {
    let inTransition: TransitionEntity | undefined;
    let outTransition: TransitionEntity | undefined;

    Object.values(state.transitions).forEach((t) => {
      const clipIds = t.clipIds;
      if (t.position === "between") {
        if (clipIds[0] === clipId) outTransition = t;
        else if (clipIds[1] === clipId) inTransition = t;
      } else {
        if (clipIds[0] === clipId) {
          if (t.position === "in") inTransition = t;
          else if (t.position === "out") outTransition = t;
        }
      }
    });

    return { inTransition, outTransition };
  };

// === SELECTION SELECTORS ===
export const selectSelectedClipIds = (state: VideoEditorStore) =>
  state.selection.clipIds;
export const selectSelectedClipId = (state: VideoEditorStore) =>
  state.selection.clipIds[0] ?? null;
export const selectSelectedClip = (state: VideoEditorStore) => {
  const id = state.selection.clipIds[0];
  return id !== undefined ? state.clips[id] : undefined;
};
export const selectSelectedTransitionId = (state: VideoEditorStore) =>
  state.selection.transitionId;
export const selectSelectedTransition = (state: VideoEditorStore) => {
  const id = state.selection.transitionId;
  return id ? state.transitions[id] : null;
};

// === DRAG SELECTORS (UNIFIED) ===
export const selectDragState = (state: VideoEditorStore) => state.dragState;
export const selectDragType = (state: VideoEditorStore) =>
  state.dragState?.type ?? null;
export const selectIsDragging = (state: VideoEditorStore) =>
  state.dragState !== null;
export const selectIsDraggingType =
  (type: UnifiedDragType) => (state: VideoEditorStore) =>
    state.dragState?.type === type;
export const selectDragVisuals = (state: VideoEditorStore) => state.dragVisuals;
export const selectGhostElements = (state: VideoEditorStore) =>
  state.dragVisuals?.ghostElements ?? null;
export const selectSnapLine = (state: VideoEditorStore) =>
  state.dragVisuals?.snapLine ?? null;
export const selectTrackInsertion = (state: VideoEditorStore) =>
  state.dragVisuals?.trackInsertion ?? null;
export const selectCommittedPositions = (state: VideoEditorStore) =>
  state.dragVisuals?.committedPositions ?? null;
// Check if drag is a transition drag
export const selectIsDraggingTransition = (state: VideoEditorStore) =>
  state.dragState?.type === "video-transition" ||
  state.dragState?.type === "audio-transition" ||
  state.dragState?.type === "transition-move" ||
  state.dragState?.type === "transition-resize";
// Check if drag is a new item drag
export const selectIsDraggingNewItem = (state: VideoEditorStore) =>
  state.dragState?.type?.startsWith("new-") ?? false;
// Check if drag is a clip drag
export const selectIsDraggingClip = (state: VideoEditorStore) =>
  state.dragState?.type?.startsWith("clip-") ?? false;

// === PLAYBACK SELECTORS ===
export const selectPlayback = (state: VideoEditorStore) => state.playback;
export const selectCurrentTime = (state: VideoEditorStore) =>
  state.playback.currentTime;
export const selectCurrentFrame = (state: VideoEditorStore) =>
  Math.round(state.playback.currentTime * state.fps);
export const selectIsPlaying = (state: VideoEditorStore) =>
  state.playback.isPlaying;
export const selectPlaybackRate = (state: VideoEditorStore) =>
  state.playback.playbackRate;

// === CANVAS SELECTORS ===
export const selectAspectRatio = (state: VideoEditorStore) => state.aspectRatio;
export const selectResolution = (state: VideoEditorStore) => state.resolution;
export const selectPlayerDimensions = (state: VideoEditorStore) =>
  state.playerDimensions;
export const selectBackgroundColor = (state: VideoEditorStore) =>
  state.backgroundColor;

// === SETTINGS SELECTORS ===
export const selectFps = (state: VideoEditorStore) => state.fps;
export const selectEditMode = (state: VideoEditorStore) => state.editMode;
export const selectSnappingEnabled = (state: VideoEditorStore) =>
  state.snappingEnabled;
export const selectShowAlignmentGuides = (state: VideoEditorStore) =>
  state.showAlignmentGuides;
export const selectTrackHeight = (state: VideoEditorStore) => state.trackHeight;
export const selectClipHeight = (state: VideoEditorStore) => state.clipHeight;

// === KEYFRAME SELECTORS ===
export const selectKeyframeSelection = (state: VideoEditorStore) =>
  state.keyframeSelection;
export const selectKeyframeClipboard = (state: VideoEditorStore) =>
  state.keyframeClipboard;

// === PROJECT SELECTORS ===
export const selectProjectId = (state: VideoEditorStore) => state.projectId;
export const selectIsDirty = (state: VideoEditorStore) => state.isDirty;
export const selectLastSavedAt = (state: VideoEditorStore) => state.lastSavedAt;

/**
 * Get clips for a specific track, sorted by start time
 */
export const selectClipsByTrackId =
  (trackId: string) => (state: VideoEditorStore) =>
    getTrackClips(state.clips, trackId);

/**
 * Get all clips as a map by ID for O(1) lookup
 */
export const selectClipsMap = (
  state: VideoEditorStore,
): Record<string, TimelineClip> => state.clips;

/**
 * Get clip IDs for a specific track
 */
export const selectClipIdsByTrackId =
  (trackId: string) => (state: VideoEditorStore) =>
    getTrackClips(state.clips, trackId).map((clip) => clip.id);

/**
 * Hook: Get clips for a track with shallow comparison
 */
export const useClipsByTrackId = (trackId: string) =>
  useVideoEditorStore(useShallow(selectClipsByTrackId(trackId)));

/**
 * Hook: Get tracks with embedded clips using memoized selector
 */
export const useTracksWithClips = () =>
  useVideoEditorStore(useShallow(selectTracksWithClips));

// ============================================================
// SHALLOW COMPARISON SELECTORS (Performance Optimized)
// ============================================================

/**
 * Export shallow for use in component-level selectors
 */
export { shallow };

/**
 * Select only track IDs (shallow compared)
 */
export const selectTrackIds = (state: VideoEditorStore) => state.trackOrder;

/**
 * Selector for a single clip by ID - returns undefined if not found
 */
export const createClipSelector =
  (clipId: string) => (state: VideoEditorStore) =>
    state.clips[clipId];

/**
 * Hook for using clip IDs with shallow comparison
 */
export const useClipIds = () => useVideoEditorStore(useShallow(selectClipIds));

/**
 * Hook for using track IDs with shallow comparison
 */
export const useTrackIds = () =>
  useVideoEditorStore(useShallow(selectTrackIds));

/**
 * Hook for using selected clip IDs with shallow comparison
 */
export const useSelectedClipIds = () =>
  useVideoEditorStore(useShallow(selectSelectedClipIds));

/**
 * Hook for using clip positions with shallow comparison
 */
export const useClipPositions = () =>
  useVideoEditorStore(useShallow(selectClipPositions));

// ============================================================
// ACTION SELECTOR (cached stable reference)
// ============================================================
// Zustand actions are stable function references — they never change after
// store creation. We cache the actions object on first access to prevent
// creating a new ~100-property object on every render, which would cause
// every component using useVideoEditorActions() to re-render on ANY state change.

let _cachedActions: ReturnType<typeof _buildActions> | null = null;

function _buildActions(state: VideoEditorStore) {
  return {
    // Track actions
    addTrack: state.addTrack,
    deleteTrack: state.deleteTrack,
    updateTrack: state.updateTrack,
    reorderTracks: state.reorderTracks,
    toggleTrackLock: state.toggleTrackLock,
    toggleTrackVisibility: state.toggleTrackVisibility,
    toggleTrackMute: state.toggleTrackMute,
    setTracks: state.setTracks,
    // Clip actions
    addClip: state.addClip,
    deleteClip: state.deleteClip,
    deleteClips: state.deleteClips,
    updateClip: state.updateClip,
    moveClip: state.moveClip,
    duplicateClip: state.duplicateClip,
    splitClip: state.splitClip,
    trimClip: state.trimClip,
    setClips: state.setClips,
    // Clip linking
    linkClips: state.linkClips,
    unlinkClips: state.unlinkClips,
    getLinkedClipIds: state.getLinkedClipIds,
    // Transition actions
    addTransition: state.addTransition,
    addBetweenTransition: state.addBetweenTransition,
    updateTransition: state.updateTransition,
    removeTransition: state.removeTransition,
    clearAllTransitions: state.clearAllTransitions,
    setTransitions: state.setTransitions,
    getClipTransitions: state.getClipTransitions,
    // Selection actions
    selectClip: state.selectClip,
    selectClips: state.selectClips,
    addToSelection: state.addToSelection,
    removeFromSelection: state.removeFromSelection,
    selectTransition: state.selectTransition,
    clearSelection: state.clearSelection,
    // Drag actions (unified)
    startDrag: state.startDrag,
    updateDrag: state.updateDrag,
    endDrag: state.endDrag,
    getDragState: state.getDragState,
    isDraggingType: state.isDraggingType,
    isDragging: state.isDragging,
    // Drag visual actions
    setDragVisuals: state.setDragVisuals,
    updateDragVisuals: state.updateDragVisuals,
    setGhostElements: state.setGhostElements,
    setSnapLine: state.setSnapLine,
    setTrackInsertionIndicator: state.setTrackInsertionIndicator,
    setCommittedPositions: state.setCommittedPositions,
    clearCommittedPosition: state.clearCommittedPosition,
    getCommittedPosition: state.getCommittedPosition,
    resetDragState: state.resetDragState,
    // Playback actions
    setCurrentTime: state.setCurrentTime,
    setCurrentFrame: state.setCurrentFrame,
    setIsPlaying: state.setIsPlaying,
    setPlaybackRate: state.setPlaybackRate,
    play: state.play,
    pause: state.pause,
    togglePlayPause: state.togglePlayPause,
    // Canvas actions
    setAspectRatio: state.setAspectRatio,
    setResolution: state.setResolution,
    setPlayerDimensions: state.setPlayerDimensions,
    setBackgroundColor: state.setBackgroundColor,
    getAspectRatioDimensions: state.getAspectRatioDimensions,
    // Settings actions
    setFps: state.setFps,
    setEditMode: state.setEditMode,
    setSnappingEnabled: state.setSnappingEnabled,
    toggleSnapping: state.toggleSnapping,
    setShowAlignmentGuides: state.setShowAlignmentGuides,
    setTrackHeight: state.setTrackHeight,
    setClipHeight: state.setClipHeight,
    // Project actions
    setProjectId: state.setProjectId,
    markDirty: state.markDirty,
    markSaved: state.markSaved,
    // Derived data
    getDurationInSeconds: state.getDurationInSeconds,
    getDurationInFrames: state.getDurationInFrames,
    getClipsByTrack: state.getClipsByTrack,
    getClipById: state.getClipById,
    getTrackById: state.getTrackById,
    // Initialization
    initialize: state.initialize,
    reset: state.reset,
    // History (undo/redo)
    saveToHistory: state.saveToHistory,
    undo: state.undo,
    redo: state.redo,
    clearHistory: state.clearHistory,
    canUndo: state.canUndo,
    canRedo: state.canRedo,
    // Keyframe actions
    addKeyframe: state.addKeyframe,
    updateKeyframe: state.updateKeyframe,
    deleteKeyframe: state.deleteKeyframe,
    togglePropertyAnimation: state.togglePropertyAnimation,
    setKeyframeInterpolation: state.setKeyframeInterpolation,
    getPropertyKeyframes: state.getPropertyKeyframes,
    selectKeyframes: state.selectKeyframes,
    addKeyframesToSelection: state.addKeyframesToSelection,
    clearKeyframeSelection: state.clearKeyframeSelection,
    copyKeyframes: state.copyKeyframes,
    pasteKeyframes: state.pasteKeyframes,
  };
}

/** Returns a stable, cached actions object — same reference on every call */
export const selectActions = (state: VideoEditorStore) => {
  if (!_cachedActions) {
    _cachedActions = _buildActions(state);
  }
  return _cachedActions;
};

// ============================================================
// CONVENIENCE HOOKS
// ============================================================

export const useVideoEditorActions = () => useVideoEditorStore(selectActions);
export const useIsDraggingType = (type: UnifiedDragType) =>
  useVideoEditorStore(selectIsDraggingType(type));
export const useIsDraggingTransition = () =>
  useVideoEditorStore(selectIsDraggingTransition);

// ============================================================
// NON-REACTIVE HELPERS (for event handlers)
// ============================================================

export const getVideoEditorState = () => useVideoEditorStore.getState();

export const startEffectDrag = (effectType: string): string => {
  return useVideoEditorStore.getState().startDrag({
    type: "effect",
    effectType,
    startTime: 0,
    currentTime: 0,
    startDuration: 0,
    startX: 0,
    startY: 0,
    isValidDrop: true,
  });
};

export const startVideoTransitionDrag = (
  transitionType: VideoTransitionType,
  duration = 1,
): string => {
  return useVideoEditorStore.getState().startDrag({
    type: "video-transition",
    transitionType,
    transitionDuration: duration,
    startTime: 0,
    currentTime: 0,
    startDuration: duration,
    startX: 0,
    startY: 0,
    isValidDrop: true,
  });
};

export const startAudioTransitionDrag = (
  transitionType: AudioTransitionType,
  duration = 1,
): string => {
  return useVideoEditorStore.getState().startDrag({
    type: "audio-transition",
    transitionType,
    transitionDuration: duration,
    startTime: 0,
    currentTime: 0,
    startDuration: duration,
    startX: 0,
    startY: 0,
    isValidDrop: true,
  });
};

export const startMaskDrag = (maskType: string): string => {
  return useVideoEditorStore.getState().startDrag({
    type: "mask",
    maskType,
    startTime: 0,
    currentTime: 0,
    startDuration: 0,
    startX: 0,
    startY: 0,
    isValidDrop: true,
  });
};

export const startMediaDrag = (
  mediaType: "video" | "image" | "audio",
  url: string,
  options?: { duration?: number; name?: string; thumbnailUrl?: string },
): string => {
  return useVideoEditorStore.getState().startDrag({
    type: "media",
    newItemType: mediaType,
    url,
    mediaDuration: options?.duration,
    thumbnailUrl: options?.thumbnailUrl,
    startTime: 0,
    currentTime: 0,
    startDuration: options?.duration ?? 5,
    startX: 0,
    startY: 0,
    isValidDrop: true,
  });
};

export const startTextPresetDrag = (
  presetId: string,
  presetStyles: Record<string, unknown>,
  options?: { content?: string; name?: string },
): string => {
  return useVideoEditorStore.getState().startDrag({
    type: "text-preset",
    newItemType: "text",
    presetId,
    presetStyles,
    startTime: 0,
    currentTime: 0,
    startDuration: 5,
    startX: 0,
    startY: 0,
    isValidDrop: true,
  });
};

export const startShapePresetDrag = (
  shapeType: string,
  shapeStyles: Record<string, unknown>,
  options?: { name?: string },
): string => {
  return useVideoEditorStore.getState().startDrag({
    type: "shape-preset",
    newItemType: "effect", // maps to visual overlay track
    shapeType,
    shapeStyles,
    startTime: 0,
    currentTime: 0,
    startDuration: 5,
    startX: 0,
    startY: 0,
    isValidDrop: true,
  });
};

export const getCurrentDrag = () => useVideoEditorStore.getState().dragState;
export const endDrag = () => useVideoEditorStore.getState().endDrag();

// ============================================================
// PURE FUNCTION EXPORTS (for use outside React components)
// ============================================================

/**
 * Get transitions affecting a specific clip - PURE FUNCTION version
 *
 * This is the canonical implementation. All hooks and components should use this.
 *
 * @param clipId - The clip ID to get transitions for
 * @param transitions - The transitions record from the store
 * @returns Object containing inTransition and outTransition if they exist
 */
export function getClipTransitionsPure(
  clipId: string,
  transitions: Record<string, TransitionEntity>,
): { inTransition?: TransitionEntity; outTransition?: TransitionEntity } {
  let inTransition: TransitionEntity | undefined;
  let outTransition: TransitionEntity | undefined;

  Object.values(transitions).forEach((t) => {
    const clipIds = t.clipIds;

    if (t.position === "between") {
      // Between transition: first clip gets 'out', second clip gets 'in'
      if (clipIds[0] === clipId) {
        outTransition = t;
      } else if (clipIds[1] === clipId) {
        inTransition = t;
      }
    } else {
      // Standalone transition
      if (clipIds[0] === clipId) {
        if (t.position === "in") {
          inTransition = t;
        } else if (t.position === "out") {
          outTransition = t;
        }
      }
    }
  });

  return { inTransition, outTransition };
}

// Re-export types
export type {
  TimelineTrack,
  TimelineClip,
  TransitionEntity,
  SelectionState,
  PlaybackState,
  UnifiedDragState,
  UnifiedDragType,
  DragVisualState,
  ClipDragSnapshot,
  SnapInfo,
  GhostElementData,
  CommittedDragPosition,
  EditMode,
  ClipType,
  TrackType,
} from "../types/timeline-v2";

export default useVideoEditorStore;
