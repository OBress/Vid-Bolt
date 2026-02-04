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

import { create } from 'zustand';
import { subscribeWithSelector, persist } from 'zustand/middleware';
import { shallow } from 'zustand/shallow';
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
} from '../types/timeline-v2';
import { 
  VideoTransitionType, 
  AudioTransitionType, 
  TransitionEasing,
  EasingPreset,
} from '../types';
import type {
  Keyframe,
  PropertyKeyframes,
  KeyframeInterpolation,
  KeyframeValue,
  KeyframeSelection,
  KeyframeClipboard,
} from '../types/keyframes';
import {
  generateKeyframeId,
  createKeyframe,
  createPropertyKeyframes,
  sortKeyframes,
  getKeyframeAtTime,
  DEFAULT_INTERPOLATION,
} from '../types/keyframes';

// ============================================================
// TYPES
// ============================================================

export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:3' | '21:9' | '4:5';
export type ResolutionPreset = '720p' | '1080p' | '1440p' | '4K';

// ============================================================
// STORE STATE
// ============================================================

export interface VideoEditorState {
  // === TIMELINE DATA ===
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  transitions: Record<string, TransitionEntity>;
  
  // === SELECTION ===
  selection: SelectionState;
  
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
  
  // === HISTORY (Undo/Redo) ===
  history: {
    past: Array<{ clips: TimelineClip[]; tracks: TimelineTrack[] }>;
    future: Array<{ clips: TimelineClip[]; tracks: TimelineTrack[] }>;
  };
  isUndoRedoOperation: boolean;
  
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
  addClip: (clip: Omit<TimelineClip, 'id' | 'createdAt' | 'updatedAt'>) => string;
  deleteClip: (clipId: string) => void;
  deleteClips: (clipIds: string[]) => void;
  updateClip: (clipId: string, updates: Partial<TimelineClip>) => void;
  moveClip: (clipId: string, trackId: string, startTime: number) => void;
  duplicateClip: (clipId: string) => string | null;
  splitClip: (clipId: string, splitTime: number) => [string, string] | null;
  trimClip: (clipId: string, newStartTime: number, newDuration: number) => void;
  setClips: (clips: TimelineClip[]) => void;
  
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
    position: 'in' | 'out';
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
  updateTransition: (id: string, updates: Partial<Omit<TransitionEntity, 'id' | 'clipIds' | 'createdAt'>>) => void;
  removeTransition: (id: string) => void;
  clearAllTransitions: () => void;
  setTransitions: (transitions: Record<string, TransitionEntity>) => void;
  /**
   * Get transitions for a specific clip
   */
  getClipTransitions: (clipId: string) => { inTransition?: TransitionEntity; outTransition?: TransitionEntity };
  
  // === SELECTION ACTIONS ===
  selectClip: (id: string | null) => void;
  selectClips: (ids: string[]) => void;
  addToSelection: (id: string) => void;
  removeFromSelection: (id: string) => void;
  selectTransition: (id: string | null) => void;
  clearSelection: () => void;
  
  // === DRAG ACTIONS (UNIFIED) ===
  /** Start a new drag operation */
  startDrag: (data: Omit<UnifiedDragState, 'dragId'>) => string;
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
  setSnapLine: (snapLine: { trackIndex: number; snappedToTrackIndex: number; time: number } | null) => void;
  /** Set track insertion indicator */
  setTrackInsertionIndicator: (indicator: { insertions: Array<{ insertionIndex: number; trackType: 'video' | 'audio' }> } | null) => void;
  /** Set committed positions (optimistic UI) */
  setCommittedPositions: (positions: Map<string, CommittedDragPosition>) => void;
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
    tracks?: TimelineTrack[];
    clips?: TimelineClip[];
    transitions?: Record<string, TransitionEntity>;
    fps?: number;
    aspectRatio?: AspectRatio;
    resolution?: ResolutionPreset;
    backgroundColor?: string;
  }) => void;
  reset: () => void;
  
  // === HISTORY (Undo/Redo) ===
  /** Save current state to history before making changes */
  saveToHistory: () => void;
  /** Undo the last change */
  undo: () => void;
  /** Redo the last undone change */
  redo: () => void;
  /** Clear all history */
  clearHistory: () => void;
  /** Check if undo is available */
  canUndo: () => boolean;
  /** Check if redo is available */
  canRedo: () => boolean;
  
  // === AUDIO EFFECT ACTIONS ===
  /** Add an audio effect to a clip */
  addAudioEffect: (clipId: string, effectType: import('../types/audio-effects').AudioEffectType) => string | null;
  
  /** Update an audio effect */
  updateAudioEffect: (clipId: string, effectId: string, updates: Partial<import('../types/audio-effects').AudioEffect>) => void;
  
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
    interpolation?: KeyframeInterpolation
  ) => string | null;
  
  /** Update an existing keyframe */
  updateKeyframe: (
    clipId: string,
    propertyPath: string,
    keyframeId: string,
    updates: Partial<Omit<Keyframe, 'id'>>
  ) => void;
  
  /** Delete a keyframe */
  deleteKeyframe: (clipId: string, propertyPath: string, keyframeId: string) => void;
  
  /** Delete multiple keyframes */
  deleteKeyframes: (clipId: string, propertyPath: string, keyframeIds: string[]) => void;
  
  /** Move a keyframe to a new time */
  moveKeyframe: (clipId: string, propertyPath: string, keyframeId: string, newTime: number) => void;
  
  /** Toggle keyframing for a property (stopwatch) */
  togglePropertyAnimation: (clipId: string, propertyPath: string, initialValue?: KeyframeValue) => void;
  
  /** Get keyframes for a specific property on a clip */
  getPropertyKeyframes: (clipId: string, propertyPath: string) => PropertyKeyframes | null;
  
  /** Check if a property has keyframing enabled */
  isPropertyAnimated: (clipId: string, propertyPath: string) => boolean;
  
  /** Copy keyframes to clipboard */
  copyKeyframes: (clipId: string, propertyPath: string, keyframeIds?: string[]) => void;
  
  /** Paste keyframes from clipboard */
  pasteKeyframes: (clipId: string, propertyPath: string, targetTime: number) => void;
  
  /** Select keyframes */
  selectKeyframes: (clipId: string, propertyPath: string, keyframeIds: string[]) => void;
  
  /** Add keyframes to selection */
  addKeyframesToSelection: (clipId: string, propertyPath: string, keyframeIds: string[]) => void;
  
  /** Clear keyframe selection */
  clearKeyframeSelection: () => void;
  
  /** Get all keyframes for a clip */
  getClipKeyframes: (clipId: string) => PropertyKeyframes[];
  
  /** Set keyframe interpolation preset */
  setKeyframeInterpolation: (
    clipId: string,
    propertyPath: string,
    keyframeId: string,
    interpolation: KeyframeInterpolation
  ) => void;
}

// ============================================================
// HELPERS
// ============================================================

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

const createDefaultTracks = (): TimelineTrack[] => {
  const tracks: TimelineTrack[] = [];
  
  // Create 2 video tracks
  for (let i = 0; i < 2; i++) {
    tracks.push({
      id: `track-video-${i + 1}`,
      name: `V${i + 1}`,
      type: 'video',
      order: i,
      group: 'video',
      locked: false,
      visible: true,
      muted: false,
      allowOverlap: true,
      color: '#3b82f6',
    });
  }
  
  // Create 2 audio tracks
  for (let i = 0; i < 2; i++) {
    tracks.push({
      id: `track-audio-${i + 1}`,
      name: `A${i + 1}`,
      type: 'audio',
      order: i + 2,
      group: 'audio',
      locked: false,
      visible: true,
      muted: false,
      allowOverlap: false,
      color: '#22c55e',
    });
  }
  
  return tracks;
};

// ============================================================
// INITIAL STATE
// ============================================================

const initialState: VideoEditorState = {
  // Timeline data
  tracks: createDefaultTracks(),
  clips: [],
  transitions: {},
  
  // Selection
  selection: {
    clipIds: [],
    transitionId: null,
  },
  
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
  aspectRatio: '16:9',
  resolution: '1080p',
  playerDimensions: { width: 1920, height: 1080 },
  backgroundColor: '#000000',
  
  // Settings
  fps: 30,
  editMode: 'select',
  snappingEnabled: true,
  showAlignmentGuides: true,
  trackHeight: 50,
  clipHeight: 40,
  
  // Project
  projectId: null,
  isDirty: false,
  lastSavedAt: null,
  
  // History (undo/redo)
  history: {
    past: [],
    future: [],
  },
  isUndoRedoOperation: false,
  
  // Keyframe animation
  keyframeSelection: null,
  keyframeClipboard: null,
};

// ============================================================
// STORE
// ============================================================

export type VideoEditorStore = VideoEditorState & VideoEditorActions;

export const useVideoEditorStore = create<VideoEditorStore>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        ...initialState,

        // ========================================
        // TRACK ACTIONS
        // ========================================
        
        addTrack: (type, options = {}) => {
          const state = get();
          const existingTracksOfType = state.tracks.filter(t => t.type === type);
          
          // Separate existing tracks by type
          const videoTracks = state.tracks.filter(t => t.type === 'video').sort((a, b) => a.order - b.order);
          const audioTracks = state.tracks.filter(t => t.type === 'audio').sort((a, b) => a.order - b.order);
          
          const newTrack: TimelineTrack = {
            id: generateId('track'),
            type,
            name: options.name || `${type === 'video' ? 'V' : 'A'}${existingTracksOfType.length + 1}`,
            order: 0, // Will be recalculated below
            group: type,
            locked: options.locked ?? false,
            visible: options.visible ?? true,
            muted: options.muted ?? false,
            allowOverlap: options.allowOverlap ?? (type === 'video'),
            ...options,
          };
          
          // Build new tracks array: video tracks first, then audio tracks
          // Insert new track at the end of its type section
          let newTracks: TimelineTrack[];
          if (type === 'video') {
            newTracks = [...videoTracks, newTrack, ...audioTracks];
          } else {
            newTracks = [...videoTracks, ...audioTracks, newTrack];
          }
          
          // Recalculate order for all tracks
          newTracks = newTracks.map((track, index) => ({
            ...track,
            order: index,
          }));
          
          set({ 
            tracks: newTracks,
            isDirty: true,
          });
          return newTrack.id;
        },

        deleteTrack: (trackId, deleteClips = true) => {
          set(state => {
            const newTracks = state.tracks.filter(t => t.id !== trackId);
            const newClips = deleteClips 
              ? state.clips.filter(c => c.trackId !== trackId)
              : state.clips;
            
            // Clean up transitions for deleted clips
            const deletedClipIds = new Set(
              state.clips.filter(c => c.trackId === trackId).map(c => c.id)
            );
            const newTransitions = { ...state.transitions };
            Object.keys(newTransitions).forEach(id => {
              if (deletedClipIds.has(newTransitions[id].clipId)) {
                delete newTransitions[id];
              }
            });
            
            return {
              tracks: newTracks,
              clips: newClips,
              transitions: newTransitions,
              isDirty: true,
            };
          });
        },

        updateTrack: (trackId, updates) => {
          set(state => ({
            tracks: state.tracks.map(track =>
              track.id === trackId ? { ...track, ...updates } : track
            ),
            isDirty: true,
          }));
        },

        reorderTracks: (trackIds) => {
          set(state => ({
            tracks: trackIds
              .map(id => state.tracks.find(t => t.id === id))
              .filter((t): t is TimelineTrack => t !== undefined)
              .map((track, index) => ({ ...track, order: index })),
            isDirty: true,
          }));
        },

        toggleTrackLock: (trackId) => {
          set(state => ({
            tracks: state.tracks.map(track =>
              track.id === trackId ? { ...track, locked: !track.locked } : track
            ),
            isDirty: true,
          }));
        },

        toggleTrackVisibility: (trackId) => {
          set(state => ({
            tracks: state.tracks.map(track =>
              track.id === trackId ? { ...track, visible: !track.visible } : track
            ),
            isDirty: true,
          }));
        },

        toggleTrackMute: (trackId) => {
          set(state => ({
            tracks: state.tracks.map(track =>
              track.id === trackId ? { ...track, muted: !track.muted } : track
            ),
            isDirty: true,
          }));
        },

        setTracks: (tracks) => {
          set({ tracks, isDirty: true });
        },

        // ========================================
        // CLIP ACTIONS (with validation)
        // ========================================
        
        addClip: (clipData) => {
          const state = get();
          const now = Date.now();
          
          // Find target track
          const targetTrack = state.tracks.find(t => t.id === clipData.trackId);
          
          // Validate track exists
          if (!targetTrack) {
            console.error('[VideoEditorStore] addClip: Target track not found:', clipData.trackId);
            // Try to find a compatible track
            const requiredType = clipData.type === 'audio' ? 'audio' : 'video';
            const compatibleTrack = state.tracks.find(t => t.type === requiredType && !t.locked);
            if (!compatibleTrack) {
              console.error('[VideoEditorStore] addClip: No compatible track found');
              return '';
            }
            clipData = { ...clipData, trackId: compatibleTrack.id };
          }
          
          // Validate track type compatibility
          const track = state.tracks.find(t => t.id === clipData.trackId)!;
          const requiredTrackType = clipData.type === 'audio' ? 'audio' : 'video';
          
          if (track.type !== requiredTrackType) {
            console.warn('[VideoEditorStore] addClip: Track type mismatch, redirecting to correct track');
            const correctTrack = state.tracks.find(t => t.type === requiredTrackType && !t.locked);
            if (correctTrack) {
              clipData = { ...clipData, trackId: correctTrack.id };
            } else {
              console.error('[VideoEditorStore] addClip: No compatible track found for type:', clipData.type);
              return '';
            }
          }
          
          // Validate track is not locked
          const finalTrack = state.tracks.find(t => t.id === clipData.trackId)!;
          if (finalTrack.locked) {
            console.error('[VideoEditorStore] addClip: Cannot add clip to locked track');
            return '';
          }
          
          // Validate and fix start time
          let startTime = Math.max(0, clipData.startTime);
          
          // Validate duration
          const duration = Math.max(0.033, clipData.duration); // Minimum ~1 frame at 30fps
          
          // Check for overlaps on non-overlap tracks and create new track if needed
          let targetTrackId = clipData.trackId;
          let newTrackToAdd: TimelineTrack | null = null;
          
          if (!finalTrack.allowOverlap) {
            const trackClips = state.clips
              .filter(c => c.trackId === finalTrack.id)
              .sort((a, b) => a.startTime - b.startTime);
            
            // Check if proposed position overlaps
            const wouldOverlap = trackClips.some(existing => {
              const existingEnd = existing.startTime + existing.duration;
              const newEnd = startTime + duration;
              return startTime < existingEnd && newEnd > existing.startTime;
            });
            
            if (wouldOverlap) {
              console.log('[VideoEditorStore] addClip: Overlap detected, creating new track');
              
              // Create a new track of the same type
              const trackType = finalTrack.type;
              const existingTracksOfType = state.tracks.filter(t => t.type === trackType);
              const newTrackNumber = existingTracksOfType.length + 1;
              
              newTrackToAdd = {
                id: generateId('track'),
                name: `${trackType === 'video' ? 'Video' : 'Audio'} ${newTrackNumber}`,
                type: trackType,
                height: trackType === 'video' ? 80 : 60,
                locked: false,
                visible: true,
                muted: false,
                allowOverlap: false,
                createdAt: now,
                updatedAt: now,
              };
              
              targetTrackId = newTrackToAdd.id;
              console.log('[VideoEditorStore] addClip: Will create new track:', newTrackToAdd.id, 'for clip');
            }
          }
          
          const newClip: TimelineClip = {
            ...clipData,
            trackId: targetTrackId,
            startTime,
            duration,
            id: generateId('clip'),
            createdAt: now,
            updatedAt: now,
          };
          
          set(state => ({
            tracks: newTrackToAdd ? [...state.tracks, newTrackToAdd] : state.tracks,
            clips: [...state.clips, newClip],
            selection: {
              ...state.selection,
              clipIds: [newClip.id],
              transitionId: null,
            },
            isDirty: true,
          }));
          
          return newClip.id;
        },

        deleteClip: (clipId) => {
          set(state => {
            const clip = state.clips.find(c => c.id === clipId);
            const linkedClipId = clip?.linkedClipId;
            
            // Clean up transitions
            const newTransitions = { ...state.transitions };
            Object.keys(newTransitions).forEach(id => {
              if (newTransitions[id].clipId === clipId || 
                  (linkedClipId && newTransitions[id].clipId === linkedClipId)) {
                delete newTransitions[id];
              }
            });
            
            return {
              clips: state.clips.filter(c => c.id !== clipId && c.id !== linkedClipId),
              selection: {
                ...state.selection,
                clipIds: state.selection.clipIds.filter(id => id !== clipId && id !== linkedClipId),
              },
              transitions: newTransitions,
              isDirty: true,
            };
          });
        },

        deleteClips: (clipIds) => {
          set(state => {
            // Collect linked clip IDs
            const allIdsToDelete = new Set(clipIds);
            clipIds.forEach(id => {
              const clip = state.clips.find(c => c.id === id);
              if (clip?.linkedClipId) {
                allIdsToDelete.add(clip.linkedClipId);
              }
            });
            
            // Clean up transitions
            const newTransitions = { ...state.transitions };
            Object.keys(newTransitions).forEach(id => {
              if (allIdsToDelete.has(newTransitions[id].clipId)) {
                delete newTransitions[id];
              }
            });
            
            return {
              clips: state.clips.filter(c => !allIdsToDelete.has(c.id)),
              selection: {
                ...state.selection,
                clipIds: state.selection.clipIds.filter(id => !allIdsToDelete.has(id)),
              },
              transitions: newTransitions,
              isDirty: true,
            };
          });
        },

        updateClip: (clipId, updates) => {
          const state = get();
          const clip = state.clips.find(c => c.id === clipId);
          
          if (!clip) {
            console.error('[VideoEditorStore] updateClip: Clip not found:', clipId);
            return;
          }
          
          // Log audio effect updates
          if (updates.audioEffects !== undefined) {
            console.log('[VideoEditorStore] updateClip: Updating audioEffects for', clipId);
            console.log('[VideoEditorStore] Current audioEffects:', clip.audioEffects);
            console.log('[VideoEditorStore] New audioEffects:', updates.audioEffects);
          }
          
          // If updating trackId, validate track type compatibility
          if (updates.trackId && updates.trackId !== clip.trackId) {
            const newTrack = state.tracks.find(t => t.id === updates.trackId);
            if (!newTrack) {
              console.error('[VideoEditorStore] updateClip: Target track not found:', updates.trackId);
              return;
            }
            
            if (newTrack.locked) {
              console.error('[VideoEditorStore] updateClip: Cannot move to locked track');
              return;
            }
            
            const requiredType = clip.type === 'audio' ? 'audio' : 'video';
            if (newTrack.type !== requiredType) {
              console.error('[VideoEditorStore] updateClip: Track type mismatch');
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
          const targetTrack = state.tracks.find(t => t.id === targetTrackId);
          
          if (targetTrack && !targetTrack.allowOverlap) {
            const newStart = finalUpdates.startTime ?? clip.startTime;
            const newDuration = finalUpdates.duration ?? clip.duration;
            const newEnd = newStart + newDuration;
            
            const wouldOverlap = state.clips.some(c => {
              if (c.id === clipId) return false;
              if (c.trackId !== targetTrackId) return false;
              const existingEnd = c.startTime + c.duration;
              return newStart < existingEnd && newEnd > c.startTime;
            });
            
            if (wouldOverlap) {
              console.warn('[VideoEditorStore] updateClip: Update would cause overlap, rejecting');
              return;
            }
          }
          
          set(state => {
            const updatedClips = state.clips.map(c =>
              c.id === clipId 
                ? { ...c, ...finalUpdates, updatedAt: Date.now() }
                : c
            );
            
            // Log the updated clip if audioEffects changed
            if (finalUpdates.audioEffects !== undefined) {
              const updatedClip = updatedClips.find(c => c.id === clipId);
              console.log('[VideoEditorStore] Clip updated with audioEffects:', updatedClip?.audioEffects);
            }
            
            return {
              clips: updatedClips,
              isDirty: true,
            };
          });
        },

        moveClip: (clipId, trackId, startTime) => {
          const state = get();
          const clip = state.clips.find(c => c.id === clipId);
          
          if (!clip) {
            console.error('[VideoEditorStore] moveClip: Clip not found:', clipId);
            return;
          }
          
          // Validate target track
          const targetTrack = state.tracks.find(t => t.id === trackId);
          if (!targetTrack) {
            console.error('[VideoEditorStore] moveClip: Target track not found:', trackId);
            return;
          }
          
          // Check track lock
          if (targetTrack.locked) {
            console.error('[VideoEditorStore] moveClip: Cannot move to locked track');
            return;
          }
          
          // Validate track type compatibility
          const requiredType = clip.type === 'audio' ? 'audio' : 'video';
          if (targetTrack.type !== requiredType) {
            console.error('[VideoEditorStore] moveClip: Track type mismatch -', clip.type, 'cannot go on', targetTrack.type, 'track');
            return;
          }
          
          // Validate start time
          const validStartTime = Math.max(0, startTime);
          
          // Check for overlaps on non-overlap tracks
          if (!targetTrack.allowOverlap) {
            const endTime = validStartTime + clip.duration;
            
            const wouldOverlap = state.clips.some(c => {
              if (c.id === clipId) return false;
              if (c.trackId !== trackId) return false;
              const existingEnd = c.startTime + c.duration;
              return validStartTime < existingEnd && endTime > c.startTime;
            });
            
            if (wouldOverlap) {
              console.warn('[VideoEditorStore] moveClip: Move would cause overlap, rejecting');
              return;
            }
          }
          
          set(state => ({
            clips: state.clips.map(c =>
              c.id === clipId
                ? { ...c, trackId, startTime: validStartTime, updatedAt: Date.now() }
                : c
            ),
            isDirty: true,
          }));
        },

        duplicateClip: (clipId) => {
          const state = get();
          const clip = state.clips.find(c => c.id === clipId);
          
          if (!clip) return null;
          
          const track = state.tracks.find(t => t.id === clip.trackId);
          if (!track) return null;
          
          // Find a valid position for the duplicate
          let newStartTime = clip.startTime + clip.duration;
          
          // For non-overlap tracks, ensure no collision
          if (!track.allowOverlap) {
            const trackClips = state.clips
              .filter(c => c.trackId === clip.trackId)
              .sort((a, b) => a.startTime - b.startTime);
            
            // Find the first available position after the original clip
            for (const existing of trackClips) {
              const existingEnd = existing.startTime + existing.duration;
              if (newStartTime < existingEnd && newStartTime + clip.duration > existing.startTime) {
                newStartTime = existingEnd;
              }
            }
          }
          
          const now = Date.now();
          const newClip: TimelineClip = {
            ...clip,
            id: generateId('clip'),
            startTime: newStartTime,
            linkedClipId: undefined,
            createdAt: now,
            updatedAt: now,
          };
          
          set(state => ({
            clips: [...state.clips, newClip],
            isDirty: true,
          }));
          
          return newClip.id;
        },

        splitClip: (clipId, splitTime) => {
          const state = get();
          const clip = state.clips.find(c => c.id === clipId);
          
          if (!clip) return null;
          if (splitTime <= clip.startTime || splitTime >= clip.startTime + clip.duration) {
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
            id: generateId('clip'),
            startTime: splitTime,
            duration: secondDuration,
            linkedClipId: undefined,
            createdAt: now,
            updatedAt: now,
            media: clip.media ? {
              ...clip.media,
              mediaStartTime: clip.media.mediaStartTime + firstDuration,
            } : undefined,
          };
          
          set(state => ({
            clips: state.clips.map(c =>
              c.id === clipId ? firstClip : c
            ).concat(secondClip),
            isDirty: true,
          }));
          
          return [firstClip.id, secondClip.id];
        },

        trimClip: (clipId, newStartTime, newDuration) => {
          set(state => ({
            clips: state.clips.map(clip =>
              clip.id === clipId
                ? { ...clip, startTime: newStartTime, duration: newDuration, updatedAt: Date.now() }
                : clip
            ),
            isDirty: true,
          }));
        },

        setClips: (clips) => {
          set({ clips, isDirty: true });
        },

        // ========================================
        // CLIP LINKING
        // ========================================
        
        linkClips: (clipId1, clipId2) => {
          set(state => ({
            clips: state.clips.map(clip => {
              if (clip.id === clipId1) {
                return { ...clip, linkedClipId: clipId2, updatedAt: Date.now() };
              } else if (clip.id === clipId2) {
                return { ...clip, linkedClipId: clipId1, updatedAt: Date.now() };
              }
              return clip;
            }),
            isDirty: true,
          }));
        },

        unlinkClips: (clipIds) => {
          const clipIdSet = new Set(clipIds);
          
          set(state => ({
            clips: state.clips.map(clip => {
              if (clipIdSet.has(clip.id) || (clip.linkedClipId && clipIdSet.has(clip.linkedClipId))) {
                const { linkedClipId, ...rest } = clip;
                return { ...rest, updatedAt: Date.now() };
              }
              return clip;
            }),
            isDirty: true,
          }));
        },

        getLinkedClipIds: (clipId) => {
          const state = get();
          const clip = state.clips.find(c => c.id === clipId);
          
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
        addTransition: ({ clipId, position, type, isAudio, duration = 1, easing }) => {
          const id = generateId('transition');
          const now = Date.now();
          const state = get();
          
          // Find the clip to calculate absolute times
          const clip = state.clips.find(c => c.id === clipId);
          if (!clip) {
            console.error('[addTransition] Clip not found:', clipId);
            return id;
          }
          
          // Calculate absolute times based on position
          let startTime: number;
          let endTime: number;
          
          if (position === 'in') {
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
            const newTransitions = { ...state.transitions };
            Object.keys(newTransitions).forEach(existingId => {
              const existing = newTransitions[existingId];
              const existingClipIds = existing.clipIds;
              if (existingClipIds[0] === clipId && existing.position === position) {
                delete newTransitions[existingId];
              }
            });
            newTransitions[id] = transition;
            
            return { transitions: newTransitions, isDirty: true };
          });
          
          return id;
        },

        /**
         * Add a between transition (crossfade) between two adjacent clips
         * Creates a SINGLE TransitionEntity with both clipIds
         */
        addBetweenTransition: ({ firstClipId, secondClipId, type, isAudio, duration = 1 }) => {
          const id = generateId('transition');
          const now = Date.now();
          const state = get();
          
          // Find the clips to calculate the boundary point
          const firstClip = state.clips.find(c => c.id === firstClipId);
          const secondClip = state.clips.find(c => c.id === secondClipId);
          
          if (!firstClip || !secondClip) {
            console.error('[addBetweenTransition] Clips not found:', firstClipId, secondClipId);
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
            endTime: boundary + halfDuration,   // When crossfade ends
            easing: defaultEasing(),
            position: 'between',
            clipIds: [firstClipId, secondClipId],
            isAudio,
            createdAt: now,
            updatedAt: now,
          };
          
          set((state) => {
            // Remove any existing between transitions involving these clips
            const newTransitions = { ...state.transitions };
            Object.keys(newTransitions).forEach(existingId => {
              const existing = newTransitions[existingId];
              const existingClipIds = existing.clipIds;
              // Remove if it's a between transition involving either clip
              if (existing.position === 'between') {
                if (existingClipIds.includes(firstClipId) || existingClipIds.includes(secondClipId)) {
                  delete newTransitions[existingId];
                }
              }
              // Also remove standalone out transition from first clip
              if (existingClipIds[0] === firstClipId && existing.position === 'out') {
                delete newTransitions[existingId];
              }
              // Also remove standalone in transition from second clip
              if (existingClipIds[0] === secondClipId && existing.position === 'in') {
                delete newTransitions[existingId];
              }
            });
            newTransitions[id] = transition;
            
            // ONLY update transitions - clips stay in place!
            return { transitions: newTransitions };
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
            const newTransitions = { ...state.transitions };
            newTransitions[id] = {
              ...transition,
              ...updates,
              updatedAt: now,
            };
            
            return { transitions: newTransitions, isDirty: true };
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
            const newTransitions = { ...state.transitions };
            delete newTransitions[id];
            
            // Clear selection if needed
            const newSelection = { ...state.selection };
            if (newSelection.transitionId === id) {
              newSelection.transitionId = null;
            }
            
            return { transitions: newTransitions, selection: newSelection, isDirty: true };
          });
        },

        clearAllTransitions: () => {
          set(() => ({
            transitions: {},
            selection: { clipIds: [], transitionId: null },
            isDirty: true,
          }));
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
          set((state) => ({
            selection: {
              ...state.selection,
              clipIds: id !== null ? [id] : [],
              transitionId: null,
            },
          }));
        },

        selectClips: (ids) => {
          set((state) => ({
            selection: {
              ...state.selection,
              clipIds: ids,
              transitionId: null,
            },
          }));
        },

        addToSelection: (id) => {
          set((state) => ({
            selection: {
              ...state.selection,
              clipIds: state.selection.clipIds.includes(id) 
                ? state.selection.clipIds 
                : [...state.selection.clipIds, id],
              transitionId: null,
            },
          }));
        },

        removeFromSelection: (id) => {
          set((state) => ({
            selection: {
              ...state.selection,
              clipIds: state.selection.clipIds.filter(clipId => clipId !== id),
            },
          }));
        },

        selectTransition: (id) => {
          set((state) => ({
            selection: {
              ...state.selection,
              transitionId: id,
            },
          }));
        },

        clearSelection: () => {
          set(() => ({
            selection: {
              clipIds: [],
              transitionId: null,
            },
          }));
        },

        // ========================================
        // DRAG ACTIONS (UNIFIED)
        // ========================================
        
        startDrag: (data) => {
          const dragId = generateDragId();
          set(() => ({
            dragState: { ...data, dragId } as UnifiedDragState,
          }));
          return dragId;
        },

        updateDrag: (updates) => {
          set((state) => ({
            dragState: state.dragState ? { ...state.dragState, ...updates } : null,
          }));
        },

        endDrag: () => {
          set(() => ({
            dragState: null,
            dragVisuals: null,
          }));
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
          set((state) => ({
            dragVisuals: state.dragVisuals ? { ...state.dragVisuals, ...updates } : updates as DragVisualState,
          }));
        },

        setGhostElements: (elements) => {
          set((state) => ({
            dragVisuals: {
              ...state.dragVisuals,
              ghostElements: elements || undefined,
            },
          }));
        },

        setSnapLine: (snapLine) => {
          set((state) => ({
            dragVisuals: {
              ...state.dragVisuals,
              snapLine: snapLine ? {
                trackIndex: snapLine.trackIndex,
                snappedToTrackIndex: snapLine.snappedToTrackIndex,
                insertionTime: snapLine.time,
              } : undefined,
            },
          }));
        },

        setTrackInsertionIndicator: (indicator) => {
          set((state) => ({
            dragVisuals: {
              ...state.dragVisuals,
              trackInsertion: indicator || undefined,
            },
          }));
        },

        setCommittedPositions: (positions) => {
          set((state) => ({
            dragVisuals: {
              ...state.dragVisuals,
              committedPositions: positions,
            },
          }));
        },

        clearCommittedPosition: (clipId) => {
          const positions = get().dragVisuals?.committedPositions;
          if (positions?.has(clipId)) {
            const newPositions = new Map(positions);
            newPositions.delete(clipId);
            set((state) => ({
              dragVisuals: {
                ...state.dragVisuals,
                committedPositions: newPositions,
              },
            }));
          }
        },

        getCommittedPosition: (clipId) => {
          return get().dragVisuals?.committedPositions?.get(clipId) || null;
        },

        resetDragState: () => {
          // Preserve committed positions during reset
          const existingCommittedPositions = get().dragVisuals?.committedPositions;
          
          set({
            dragState: null,
            dragVisuals: existingCommittedPositions ? {
              committedPositions: existingCommittedPositions,
            } : null,
          });
        },

        // ========================================
        // PLAYBACK ACTIONS
        // ========================================
        
        setCurrentTime: (time) => {
          set((state) => ({
            playback: { ...state.playback, currentTime: time },
          }));
        },

        setCurrentFrame: (frame) => {
          const fps = get().fps;
          set((state) => ({
            playback: { ...state.playback, currentTime: frame / fps },
          }));
        },

        setIsPlaying: (playing) => {
          set((state) => ({
            playback: { ...state.playback, isPlaying: playing },
          }));
        },

        setPlaybackRate: (rate) => {
          set((state) => ({
            playback: { ...state.playback, playbackRate: rate },
          }));
        },

        play: () => {
          set((state) => ({
            playback: { ...state.playback, isPlaying: true },
          }));
        },

        pause: () => {
          set((state) => ({
            playback: { ...state.playback, isPlaying: false },
          }));
        },

        togglePlayPause: () => {
          set((state) => ({
            playback: { ...state.playback, isPlaying: !state.playback.isPlaying },
          }));
        },

        // ========================================
        // CANVAS ACTIONS
        // ========================================
        
        setAspectRatio: (ratio) => {
          set(() => ({ aspectRatio: ratio, isDirty: true }));
        },

        setResolution: (resolution) => {
          set(() => ({ resolution, isDirty: true }));
        },

        setPlayerDimensions: (dimensions) => {
          set(() => ({ playerDimensions: dimensions }));
        },

        setBackgroundColor: (color) => {
          set(() => ({ backgroundColor: color, isDirty: true }));
        },

        getAspectRatioDimensions: () => {
          const state = get();
          const baseWidths = {
            '720p': 1280,
            '1080p': 1920,
            '1440p': 2560,
            '4K': 3840,
          };
          
          const baseWidth = baseWidths[state.resolution] || 1920;
          
          const ratios: Record<AspectRatio, { width: number; height: number }> = {
            '16:9': { width: baseWidth, height: Math.round(baseWidth * 9 / 16) },
            '9:16': { width: Math.round(baseWidth * 9 / 16), height: baseWidth },
            '1:1': { width: baseWidth, height: baseWidth },
            '4:3': { width: baseWidth, height: Math.round(baseWidth * 3 / 4) },
            '21:9': { width: baseWidth, height: Math.round(baseWidth * 9 / 21) },
            '4:5': { width: Math.round(baseWidth * 4 / 5), height: baseWidth },
          };
          
          return ratios[state.aspectRatio] || ratios['16:9'];
        },

        // ========================================
        // SETTINGS ACTIONS
        // ========================================
        
        setFps: (fps) => {
          set(() => ({ fps }));
        },

        setEditMode: (mode) => {
          set(() => ({ editMode: mode }));
        },

        setSnappingEnabled: (enabled) => {
          set(() => ({ snappingEnabled: enabled }));
        },

        toggleSnapping: () => {
          set((state) => ({ snappingEnabled: !state.snappingEnabled }));
        },

        setShowAlignmentGuides: (show) => {
          set(() => ({ showAlignmentGuides: show }));
        },

        setTrackHeight: (height) => {
          set(() => ({ trackHeight: height }));
        },

        setClipHeight: (height) => {
          set(() => ({ clipHeight: height }));
        },

        // ========================================
        // PROJECT ACTIONS
        // ========================================
        
        setProjectId: (id) => {
          set(() => ({ projectId: id }));
        },

        markDirty: () => {
          set(() => ({ isDirty: true }));
        },

        markSaved: () => {
          set(() => ({ isDirty: false, lastSavedAt: Date.now() }));
        },

        // ========================================
        // DERIVED DATA
        // ========================================
        
        getDurationInSeconds: () => {
          const state = get();
          if (state.clips.length === 0) return 30; // Default 30 seconds
          
          return Math.max(
            ...state.clips.map(c => c.startTime + c.duration)
          );
        },

        getDurationInFrames: () => {
          const state = get();
          return Math.ceil(get().getDurationInSeconds() * state.fps);
        },

        getClipsByTrack: (trackId) => {
          return get().clips
            .filter(c => c.trackId === trackId)
            .sort((a, b) => a.startTime - b.startTime);
        },

        getClipById: (clipId) => {
          return get().clips.find(c => c.id === clipId);
        },

        getTrackById: (trackId) => {
          return get().tracks.find(t => t.id === trackId);
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
          set(() => ({
            projectId: projectId ?? null,
            tracks: newTracks ?? createDefaultTracks(),
            clips: newClips ?? [],
            transitions: newTransitions ?? {},
            ...(newFps !== undefined && { fps: newFps }),
            ...(newAspectRatio !== undefined && { aspectRatio: newAspectRatio }),
            ...(newResolution !== undefined && { resolution: newResolution }),
            ...(newBackgroundColor !== undefined && { backgroundColor: newBackgroundColor }),
            isDirty: false,
            lastSavedAt: null,
          }));
        },

        reset: () => {
          set(() => ({ ...initialState }));
        },

        // ========================================
        // HISTORY (Undo/Redo) ACTIONS
        // ========================================
        
        saveToHistory: () => {
          const state = get();
          // Don't save if we're in the middle of an undo/redo operation
          if (state.isUndoRedoOperation) return;
          
          // Ensure history is initialized
          const history = state.history || { past: [], future: [] };
          
          // Create a snapshot of the current state using structuredClone (faster than JSON.parse/stringify)
          const snapshot = {
            clips: structuredClone(state.clips || []),
            tracks: structuredClone(state.tracks || []),
          };
          
          set({
            history: {
              past: [...history.past.slice(-49), snapshot], // Keep last 50 states
              future: [], // Clear future when new action is performed
            },
          });
        },

        undo: () => {
          const state = get();
          const history = state.history || { past: [], future: [] };
          if (history.past.length === 0) return;
          
          // Get the last state from history
          const newPast = [...history.past];
          const previousState = newPast.pop()!;
          
          // Create snapshot of current state for redo (using structuredClone for better performance)
          const currentSnapshot = {
            clips: structuredClone(state.clips || []),
            tracks: structuredClone(state.tracks || []),
          };
          
          // Apply the previous state
          set({
            isUndoRedoOperation: true,
            clips: previousState.clips,
            tracks: previousState.tracks,
            history: {
              past: newPast,
              future: [currentSnapshot, ...history.future],
            },
            isDirty: true,
          });
          
          // Reset the flag after the state update
          setTimeout(() => {
            set({ isUndoRedoOperation: false });
          }, 0);
        },

        redo: () => {
          const state = get();
          const history = state.history || { past: [], future: [] };
          if (history.future.length === 0) return;
          
          // Get the next state from future
          const [nextState, ...newFuture] = history.future;
          
          // Create snapshot of current state for undo (using structuredClone for better performance)
          const currentSnapshot = {
            clips: structuredClone(state.clips || []),
            tracks: structuredClone(state.tracks || []),
          };
          
          // Apply the next state
          set({
            isUndoRedoOperation: true,
            clips: nextState.clips,
            tracks: nextState.tracks,
            history: {
              past: [...history.past, currentSnapshot],
              future: newFuture,
            },
            isDirty: true,
          });
          
          // Reset the flag after the state update
          setTimeout(() => {
            set({ isUndoRedoOperation: false });
          }, 0);
        },

        clearHistory: () => {
          set({
            history: {
              past: [],
              future: [],
            },
          });
        },

        canUndo: () => {
          const history = get().history || { past: [], future: [] };
          return history.past.length > 0;
        },

        canRedo: () => {
          const history = get().history || { past: [], future: [] };
          return history.future.length > 0;
        },

        // ========================================
        // AUDIO EFFECT ACTIONS
        // ========================================
        
        addAudioEffect: (clipId, effectType) => {
          const state = get();
          const clipIndex = state.clips.findIndex(c => c.id === clipId);
          if (clipIndex === -1) return null;
          
          const clip = state.clips[clipIndex];
          const audioEffects = clip.audioEffects || [];
          
          // Import dynamically to avoid circular deps
          const { createAudioEffect } = require('../types/audio-effects');
          const maxOrder = audioEffects.length > 0 
            ? Math.max(...audioEffects.map(e => e.order)) + 1 
            : 0;
          const newEffect = createAudioEffect(effectType, maxOrder);
          
          const newClips = [...state.clips];
          newClips[clipIndex] = {
            ...clip,
            audioEffects: [...audioEffects, newEffect],
          };
          
          set({ clips: newClips, isDirty: true });
          return newEffect.id;
        },
        
        updateAudioEffect: (clipId, effectId, updates) => {
          const state = get();
          const clipIndex = state.clips.findIndex(c => c.id === clipId);
          if (clipIndex === -1) return;
          
          const clip = state.clips[clipIndex];
          if (!clip.audioEffects) return;
          
          const effectIndex = clip.audioEffects.findIndex(e => e.id === effectId);
          if (effectIndex === -1) return;
          
          const newAudioEffects = [...clip.audioEffects];
          newAudioEffects[effectIndex] = {
            ...newAudioEffects[effectIndex],
            ...updates,
          };
          
          const newClips = [...state.clips];
          newClips[clipIndex] = {
            ...clip,
            audioEffects: newAudioEffects,
          };
          
          set({ clips: newClips, isDirty: true });
        },
        
        removeAudioEffect: (clipId, effectId) => {
          const state = get();
          const clipIndex = state.clips.findIndex(c => c.id === clipId);
          if (clipIndex === -1) return;
          
          const clip = state.clips[clipIndex];
          if (!clip.audioEffects) return;
          
          const newAudioEffects = clip.audioEffects.filter(e => e.id !== effectId);
          
          const newClips = [...state.clips];
          newClips[clipIndex] = {
            ...clip,
            audioEffects: newAudioEffects,
          };
          
          set({ clips: newClips, isDirty: true });
        },
        
        reorderAudioEffects: (clipId, effectIds) => {
          const state = get();
          const clipIndex = state.clips.findIndex(c => c.id === clipId);
          if (clipIndex === -1) return;
          
          const clip = state.clips[clipIndex];
          if (!clip.audioEffects) return;
          
          // Reorder effects based on effectIds array
          const effectMap = new Map(clip.audioEffects.map(e => [e.id, e]));
          const newAudioEffects = effectIds
            .map((id, index) => {
              const effect = effectMap.get(id);
              if (effect) {
                return { ...effect, order: index };
              }
              return null;
            })
            .filter(Boolean) as typeof clip.audioEffects;
          
          const newClips = [...state.clips];
          newClips[clipIndex] = {
            ...clip,
            audioEffects: newAudioEffects,
          };
          
          set({ clips: newClips, isDirty: true });
        },
        
        duplicateAudioEffect: (clipId, effectId) => {
          const state = get();
          const clipIndex = state.clips.findIndex(c => c.id === clipId);
          if (clipIndex === -1) return null;
          
          const clip = state.clips[clipIndex];
          if (!clip.audioEffects) return null;
          
          const effect = clip.audioEffects.find(e => e.id === effectId);
          if (!effect) return null;
          
          const maxOrder = Math.max(...clip.audioEffects.map(e => e.order)) + 1;
          const newEffect = {
            ...effect,
            id: `audio-effect-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            order: maxOrder,
            name: effect.name ? `${effect.name} (Copy)` : undefined,
          };
          
          const newClips = [...state.clips];
          newClips[clipIndex] = {
            ...clip,
            audioEffects: [...clip.audioEffects, newEffect],
          };
          
          set({ clips: newClips, isDirty: true });
          return newEffect.id;
        },

        // ========================================
        // KEYFRAME ANIMATION ACTIONS
        // ========================================
        
        addKeyframe: (clipId, propertyPath, time, value, interpolation = DEFAULT_INTERPOLATION) => {
          const state = get();
          const clipIndex = state.clips.findIndex(c => c.id === clipId);
          if (clipIndex === -1) return null;
          
          const clip = state.clips[clipIndex];
          const keyframes = clip.keyframes || [];
          
          // Find or create property keyframes
          let propKeyframesIndex = keyframes.findIndex(pk => pk.propertyPath === propertyPath);
          let propKeyframes: PropertyKeyframes;
          
          if (propKeyframesIndex === -1) {
            // Create new property keyframes collection
            propKeyframes = createPropertyKeyframes(propertyPath);
            propKeyframesIndex = keyframes.length;
          } else {
            propKeyframes = { ...keyframes[propKeyframesIndex] };
          }
          
          // Check if keyframe already exists at this time
          const existingKf = getKeyframeAtTime(propKeyframes.keyframes, time);
          if (existingKf) {
            // Update existing keyframe value
            propKeyframes.keyframes = propKeyframes.keyframes.map(kf =>
              kf.id === existingKf.id ? { ...kf, value } : kf
            );
          } else {
            // Add new keyframe
            const newKeyframe = createKeyframe(time, value, interpolation);
            propKeyframes.keyframes = sortKeyframes([...propKeyframes.keyframes, newKeyframe]);
          }
          
          // Update clip with new keyframes
          const newKeyframes = [...keyframes];
          if (propKeyframesIndex < keyframes.length) {
            newKeyframes[propKeyframesIndex] = propKeyframes;
          } else {
            newKeyframes.push(propKeyframes);
          }
          
          const newClips = [...state.clips];
          newClips[clipIndex] = {
            ...clip,
            keyframes: newKeyframes,
            updatedAt: Date.now(),
          };
          
          set({ clips: newClips, isDirty: true });
          
          const addedKf = existingKf || propKeyframes.keyframes.find(kf => kf.time === time);
          return addedKf?.id || null;
        },

        updateKeyframe: (clipId, propertyPath, keyframeId, updates) => {
          const state = get();
          const clipIndex = state.clips.findIndex(c => c.id === clipId);
          if (clipIndex === -1) return;
          
          const clip = state.clips[clipIndex];
          const keyframes = clip.keyframes || [];
          const propKeyframesIndex = keyframes.findIndex(pk => pk.propertyPath === propertyPath);
          if (propKeyframesIndex === -1) return;
          
          const propKeyframes = { ...keyframes[propKeyframesIndex] };
          propKeyframes.keyframes = propKeyframes.keyframes.map(kf =>
            kf.id === keyframeId ? { ...kf, ...updates } : kf
          );
          
          // Re-sort if time changed
          if (updates.time !== undefined) {
            propKeyframes.keyframes = sortKeyframes(propKeyframes.keyframes);
          }
          
          const newKeyframes = [...keyframes];
          newKeyframes[propKeyframesIndex] = propKeyframes;
          
          const newClips = [...state.clips];
          newClips[clipIndex] = {
            ...clip,
            keyframes: newKeyframes,
            updatedAt: Date.now(),
          };
          
          set({ clips: newClips, isDirty: true });
        },

        deleteKeyframe: (clipId, propertyPath, keyframeId) => {
          const state = get();
          const clipIndex = state.clips.findIndex(c => c.id === clipId);
          if (clipIndex === -1) return;
          
          const clip = state.clips[clipIndex];
          const keyframes = clip.keyframes || [];
          const propKeyframesIndex = keyframes.findIndex(pk => pk.propertyPath === propertyPath);
          if (propKeyframesIndex === -1) return;
          
          const propKeyframes = { ...keyframes[propKeyframesIndex] };
          propKeyframes.keyframes = propKeyframes.keyframes.filter(kf => kf.id !== keyframeId);
          
          const newKeyframes = [...keyframes];
          newKeyframes[propKeyframesIndex] = propKeyframes;
          
          const newClips = [...state.clips];
          newClips[clipIndex] = {
            ...clip,
            keyframes: newKeyframes,
            updatedAt: Date.now(),
          };
          
          // Clear keyframe selection if the deleted keyframe was selected
          let newSelection = state.keyframeSelection;
          if (newSelection?.keyframeIds.includes(keyframeId)) {
            newSelection = {
              ...newSelection,
              keyframeIds: newSelection.keyframeIds.filter(id => id !== keyframeId),
            };
            if (newSelection.keyframeIds.length === 0) {
              newSelection = null;
            }
          }
          
          set({ clips: newClips, keyframeSelection: newSelection, isDirty: true });
        },

        deleteKeyframes: (clipId, propertyPath, keyframeIds) => {
          const state = get();
          const clipIndex = state.clips.findIndex(c => c.id === clipId);
          if (clipIndex === -1) return;
          
          const clip = state.clips[clipIndex];
          const keyframes = clip.keyframes || [];
          const propKeyframesIndex = keyframes.findIndex(pk => pk.propertyPath === propertyPath);
          if (propKeyframesIndex === -1) return;
          
          const propKeyframes = { ...keyframes[propKeyframesIndex] };
          propKeyframes.keyframes = propKeyframes.keyframes.filter(kf => !keyframeIds.includes(kf.id));
          
          const newKeyframes = [...keyframes];
          newKeyframes[propKeyframesIndex] = propKeyframes;
          
          const newClips = [...state.clips];
          newClips[clipIndex] = {
            ...clip,
            keyframes: newKeyframes,
            updatedAt: Date.now(),
          };
          
          // Clear keyframe selection if deleted keyframes were selected
          let newSelection = state.keyframeSelection;
          if (newSelection) {
            const remainingIds = newSelection.keyframeIds.filter(id => !keyframeIds.includes(id));
            if (remainingIds.length === 0) {
              newSelection = null;
            } else {
              newSelection = { ...newSelection, keyframeIds: remainingIds };
            }
          }
          
          set({ clips: newClips, keyframeSelection: newSelection, isDirty: true });
        },

        moveKeyframe: (clipId, propertyPath, keyframeId, newTime) => {
          get().updateKeyframe(clipId, propertyPath, keyframeId, { time: newTime });
        },

        togglePropertyAnimation: (clipId, propertyPath, initialValue) => {
          const state = get();
          const clipIndex = state.clips.findIndex(c => c.id === clipId);
          if (clipIndex === -1) return;
          
          const clip = state.clips[clipIndex];
          const keyframes = clip.keyframes || [];
          const propKeyframesIndex = keyframes.findIndex(pk => pk.propertyPath === propertyPath);
          
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
          
          const newClips = [...state.clips];
          newClips[clipIndex] = {
            ...clip,
            keyframes: newKeyframes,
            updatedAt: Date.now(),
          };
          
          set({ clips: newClips, isDirty: true });
        },

        getPropertyKeyframes: (clipId, propertyPath) => {
          const state = get();
          const clip = state.clips.find(c => c.id === clipId);
          if (!clip?.keyframes) return null;
          return clip.keyframes.find(pk => pk.propertyPath === propertyPath) || null;
        },

        isPropertyAnimated: (clipId, propertyPath) => {
          const propKeyframes = get().getPropertyKeyframes(clipId, propertyPath);
          return propKeyframes?.enabled === true && propKeyframes.keyframes.length > 0;
        },

        copyKeyframes: (clipId, propertyPath, keyframeIds) => {
          const propKeyframes = get().getPropertyKeyframes(clipId, propertyPath);
          if (!propKeyframes) return;
          
          let keyframesToCopy = propKeyframes.keyframes;
          if (keyframeIds && keyframeIds.length > 0) {
            keyframesToCopy = keyframesToCopy.filter(kf => keyframeIds.includes(kf.id));
          }
          
          if (keyframesToCopy.length === 0) return;
          
          // Normalize times to start from 0
          const minTime = Math.min(...keyframesToCopy.map(kf => kf.time));
          const normalizedKeyframes = keyframesToCopy.map(kf => ({
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
          clipboardKeyframes.forEach(kf => {
            get().addKeyframe(
              clipId,
              propertyPath,
              targetTime + kf.time,
              kf.value,
              kf.interpolation
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
          if (state.keyframeSelection?.clipId === clipId && 
              state.keyframeSelection?.propertyPath === propertyPath) {
            set({
              keyframeSelection: {
                ...state.keyframeSelection,
                keyframeIds: [...new Set([...state.keyframeSelection.keyframeIds, ...keyframeIds])],
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
          const clip = get().clips.find(c => c.id === clipId);
          return clip?.keyframes || [];
        },

        setKeyframeInterpolation: (clipId, propertyPath, keyframeId, interpolation) => {
          get().updateKeyframe(clipId, propertyPath, keyframeId, { interpolation });
        },
      }),
      {
        name: 'video-editor-store-v4', // Bump version to reset persisted state
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
          // Always use initial values for these (not persisted)
          history: { past: [], future: [] },
          isUndoRedoOperation: false,
        }),
      }
    )
  )
);

// ============================================================
// SELECTORS
// ============================================================

// === TRACK SELECTORS ===
export const selectTracks = (state: VideoEditorStore) => {
  // Sort tracks: video tracks first (REVERSED so V1 is at bottom), then audio tracks (by order)
  // This matches Premiere Pro's track layout where V1 is closest to the audio section
  const videoTracks = state.tracks.filter(t => t.type === 'video').sort((a, b) => b.order - a.order); // Reversed!
  const audioTracks = state.tracks.filter(t => t.type === 'audio').sort((a, b) => a.order - b.order);
  return [...videoTracks, ...audioTracks];
};
export const selectTrackById = (trackId: string) => (state: VideoEditorStore) =>
  state.tracks.find(t => t.id === trackId);
export const selectVideoTracks = (state: VideoEditorStore) =>
  state.tracks.filter(t => t.type === 'video').sort((a, b) => b.order - a.order); // Reversed so V1 is at bottom
export const selectAudioTracks = (state: VideoEditorStore) =>
  state.tracks.filter(t => t.type === 'audio').sort((a, b) => a.order - b.order);

// === CLIP SELECTORS ===
export const selectClips = (state: VideoEditorStore) => state.clips;
export const selectClipById = (clipId: string) => (state: VideoEditorStore) =>
  state.clips.find(c => c.id === clipId);
export const selectClipsByTrack = (trackId: string) => (state: VideoEditorStore) =>
  state.clips.filter(c => c.trackId === trackId).sort((a, b) => a.startTime - b.startTime);
export const selectClipsInRange = (startTime: number, endTime: number, trackId?: string) => 
  (state: VideoEditorStore) => {
    let clips = state.clips;
    if (trackId) {
      clips = clips.filter(c => c.trackId === trackId);
    }
    return clips.filter(c => {
      const clipEnd = c.startTime + c.duration;
      return c.startTime < endTime && clipEnd > startTime;
    });
  };

// === TRANSITION SELECTORS ===
export const selectTransitions = (state: VideoEditorStore) => state.transitions;
export const selectTransitionById = (id: string) => (state: VideoEditorStore) => 
  state.transitions[id];
export const selectClipTransitions = (clipId: string) => (state: VideoEditorStore) => {
  let inTransition: TransitionEntity | undefined;
  let outTransition: TransitionEntity | undefined;
  
  Object.values(state.transitions).forEach(t => {
    const clipIds = t.clipIds;
    if (t.position === 'between') {
      if (clipIds[0] === clipId) outTransition = t;
      else if (clipIds[1] === clipId) inTransition = t;
    } else {
      if (clipIds[0] === clipId) {
        if (t.position === 'in') inTransition = t;
        else if (t.position === 'out') outTransition = t;
      }
    }
  });
  
  return { inTransition, outTransition };
};

// === SELECTION SELECTORS ===
export const selectSelectedClipIds = (state: VideoEditorStore) => state.selection.clipIds;
export const selectSelectedClipId = (state: VideoEditorStore) => 
  state.selection.clipIds[0] ?? null;
export const selectSelectedClip = (state: VideoEditorStore) => {
  const id = state.selection.clipIds[0];
  return id !== undefined ? state.clips.find(c => c.id === id) : undefined;
};
export const selectSelectedTransitionId = (state: VideoEditorStore) => state.selection.transitionId;
export const selectSelectedTransition = (state: VideoEditorStore) => {
  const id = state.selection.transitionId;
  return id ? state.transitions[id] : null;
};

// === DRAG SELECTORS (UNIFIED) ===
export const selectDragState = (state: VideoEditorStore) => state.dragState;
export const selectDragType = (state: VideoEditorStore) => state.dragState?.type ?? null;
export const selectIsDragging = (state: VideoEditorStore) => state.dragState !== null;
export const selectIsDraggingType = (type: UnifiedDragType) => (state: VideoEditorStore) => 
  state.dragState?.type === type;
export const selectDragVisuals = (state: VideoEditorStore) => state.dragVisuals;
export const selectGhostElements = (state: VideoEditorStore) => state.dragVisuals?.ghostElements ?? null;
export const selectSnapLine = (state: VideoEditorStore) => state.dragVisuals?.snapLine ?? null;
export const selectTrackInsertion = (state: VideoEditorStore) => state.dragVisuals?.trackInsertion ?? null;
export const selectCommittedPositions = (state: VideoEditorStore) => state.dragVisuals?.committedPositions ?? null;
// Check if drag is a transition drag
export const selectIsDraggingTransition = (state: VideoEditorStore) => 
  state.dragState?.type === 'video-transition' || 
  state.dragState?.type === 'audio-transition' ||
  state.dragState?.type === 'transition-move' ||
  state.dragState?.type === 'transition-resize';
// Check if drag is a new item drag
export const selectIsDraggingNewItem = (state: VideoEditorStore) =>
  state.dragState?.type?.startsWith('new-') ?? false;
// Check if drag is a clip drag
export const selectIsDraggingClip = (state: VideoEditorStore) =>
  state.dragState?.type?.startsWith('clip-') ?? false;

// === PLAYBACK SELECTORS ===
export const selectPlayback = (state: VideoEditorStore) => state.playback;
export const selectCurrentTime = (state: VideoEditorStore) => state.playback.currentTime;
export const selectCurrentFrame = (state: VideoEditorStore) => 
  Math.round(state.playback.currentTime * state.fps);
export const selectIsPlaying = (state: VideoEditorStore) => state.playback.isPlaying;
export const selectPlaybackRate = (state: VideoEditorStore) => state.playback.playbackRate;

// === CANVAS SELECTORS ===
export const selectAspectRatio = (state: VideoEditorStore) => state.aspectRatio;
export const selectResolution = (state: VideoEditorStore) => state.resolution;
export const selectPlayerDimensions = (state: VideoEditorStore) => state.playerDimensions;
export const selectBackgroundColor = (state: VideoEditorStore) => state.backgroundColor;

// === SETTINGS SELECTORS ===
export const selectFps = (state: VideoEditorStore) => state.fps;
export const selectEditMode = (state: VideoEditorStore) => state.editMode;
export const selectSnappingEnabled = (state: VideoEditorStore) => state.snappingEnabled;
export const selectShowAlignmentGuides = (state: VideoEditorStore) => state.showAlignmentGuides;
export const selectTrackHeight = (state: VideoEditorStore) => state.trackHeight;
export const selectClipHeight = (state: VideoEditorStore) => state.clipHeight;

// === PROJECT SELECTORS ===
export const selectProjectId = (state: VideoEditorStore) => state.projectId;
export const selectIsDirty = (state: VideoEditorStore) => state.isDirty;
export const selectLastSavedAt = (state: VideoEditorStore) => state.lastSavedAt;

// === DERIVED SELECTORS ===
export const selectDurationInSeconds = (state: VideoEditorStore) => {
  if (state.clips.length === 0) return 30;
  return Math.max(...state.clips.map(c => c.startTime + c.duration));
};
export const selectDurationInFrames = (state: VideoEditorStore) => 
  Math.ceil(selectDurationInSeconds(state) * state.fps);

// === CLIP SELECTORS ===

/**
 * Get clips for a specific track, sorted by start time
 */
export const selectClipsByTrackId = (trackId: string) => (state: VideoEditorStore) =>
  state.clips
    .filter(clip => clip.trackId === trackId)
    .sort((a, b) => a.startTime - b.startTime);

/**
 * Get all clips as a map by ID for O(1) lookup
 */
export const selectClipsMap = (state: VideoEditorStore) => {
  const map = new Map<string, TimelineClip>();
  state.clips.forEach(clip => map.set(clip.id, clip));
  return map;
};

/**
 * Get clip IDs for a specific track
 */
export const selectClipIdsByTrackId = (trackId: string) => (state: VideoEditorStore) =>
  state.clips
    .filter(clip => clip.trackId === trackId)
    .sort((a, b) => a.startTime - b.startTime)
    .map(clip => clip.id);

/**
 * Compute linkGroup for a clip from its linkedClipId
 * Sorting ensures the same group ID regardless of which clip is primary
 */
export const computeLinkGroup = (clipId: string, linkedClipId?: string): string | undefined => {
  if (!linkedClipId) return undefined;
  return `link-${[clipId, linkedClipId].sort().join('-')}`;
};

/**
 * Get all clips with computed linkGroup
 */
export const selectClipsWithLinkGroups = (state: VideoEditorStore) =>
  state.clips.map(clip => ({
    ...clip,
    linkGroup: computeLinkGroup(clip.id, clip.linkedClipId),
  }));

/**
 * Hook: Get clips for a track with shallow comparison
 */
export const useClipsByTrackId = (trackId: string) =>
  useVideoEditorStore(selectClipsByTrackId(trackId), shallow);

// === DENORMALIZED VIEW SELECTOR ===

/**
 * TimelineItem - Denormalized clip data for UI rendering
 * 
 * This is the computed view of a clip with:
 * - start/end times (computed from startTime + duration)
 * - linkGroup (computed from linkedClipId)
 * - Flattened media properties
 */
/**
 * ItemTransition - Transition data for timeline item overlays
 * Uses the simplified TransitionEntity format with absolute startTime/endTime
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
 * Selector: Tracks with embedded clips (denormalized view)
 * 
 * This computes a denormalized view for UI components that need
 * tracks with their clips pre-filtered and embedded.
 * 
 * The store stays normalized (tracks + clips separate) for efficient updates,
 * and this selector computes the denormalized view for rendering.
 */
export const selectTracksWithClips = (state: VideoEditorStore): TrackWithClips[] => {
  return state.tracks.map(track => {
    const trackClips = state.clips.filter(clip => clip.trackId === track.id);
    const items: TimelineItem[] = trackClips.map(clip => {
      const linkGroup = computeLinkGroup(clip.id, clip.linkedClipId);
      
      // Get transition entities for this clip using canonical pure function
      const { inTransition, outTransition } = getClipTransitionsPure(clip.id, state.transitions);
      
      return {
        id: clip.id,
        start: clip.startTime,
        end: clip.startTime + clip.duration,
        type: clip.type,
        label: clip.label,
        color: clip.color,
        data: {
          ...clip.data,
          sourceId: clip.sourceId,
          transform: clip.transform,
          text: clip.text,
          linkedClipId: clip.linkedClipId,
          thumbnailUrl: clip.thumbnailUrl,
          effects: clip.effects,
          keyframes: clip.keyframes, // Include keyframes for animation markers
        },
        mediaStart: clip.media?.mediaStartTime,
        mediaDuration: clip.media?.mediaDuration,
        mediaSrcDuration: clip.media?.mediaDuration,
        speed: clip.media?.speed,
        linkGroup,
        linkedItemId: clip.linkedClipId,
        transitions: clip.transitions,
        // Use full TransitionEntity objects for "between" transitions
        inTransition: inTransition as ItemTransition | undefined,
        outTransition: outTransition as ItemTransition | undefined,
      };
    }).sort((a, b) => a.start - b.start);
    
    return { ...track, items };
  });
};

/**
 * Hook: Get tracks with embedded clips using shallow comparison
 */
export const useTracksWithClips = () => 
  useVideoEditorStore(selectTracksWithClips, shallow);

// ============================================================
// ACTION SELECTOR (for stable references)
// ============================================================

export const selectActions = (state: VideoEditorStore) => ({
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
});

// ============================================================
// SHALLOW COMPARISON SELECTORS (Performance Optimized)
// ============================================================
// These selectors use shallow comparison to prevent unnecessary re-renders
// when array contents haven't actually changed (common with computed arrays).

/**
 * Export shallow for use in component-level selectors
 */
export { shallow };

/**
 * Select only clip IDs (shallow compared) - use when you only need to track
 * which clips exist, not their full data
 */
export const selectClipIds = (state: VideoEditorStore) => 
  state.clips.map(c => c.id);

/**
 * Select only track IDs (shallow compared)
 */
export const selectTrackIds = (state: VideoEditorStore) =>
  state.tracks.map(t => t.id);

/**
 * Combined selector for clip position data only - useful for timeline rendering
 * Returns minimal data needed for clip positioning
 */
export const selectClipPositions = (state: VideoEditorStore) =>
  state.clips.map(c => ({
    id: c.id,
    trackId: c.trackId,
    startTime: c.startTime,
    duration: c.duration,
  }));

/**
 * Selector for a single clip by ID - returns undefined if not found
 * Use with shallow comparison at component level
 */
export const createClipSelector = (clipId: string) => (state: VideoEditorStore) =>
  state.clips.find(c => c.id === clipId);

/**
 * Hook for using clip IDs with shallow comparison
 * Only triggers re-render when actual clip IDs change
 */
export const useClipIds = () => 
  useVideoEditorStore(selectClipIds, shallow);

/**
 * Hook for using track IDs with shallow comparison
 */
export const useTrackIds = () =>
  useVideoEditorStore(selectTrackIds, shallow);

/**
 * Hook for using selected clip IDs with shallow comparison
 */
export const useSelectedClipIds = () =>
  useVideoEditorStore(selectSelectedClipIds, shallow);

/**
 * Hook for using clip positions with shallow comparison
 * Useful for timeline item rendering where only position matters
 */
export const useClipPositions = () =>
  useVideoEditorStore(selectClipPositions, shallow);

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
    type: 'effect',
    effectType,
    startTime: 0,
    currentTime: 0,
    startDuration: 0,
    startX: 0,
    startY: 0,
    isValidDrop: true,
  });
};

export const startVideoTransitionDrag = (transitionType: VideoTransitionType, duration = 1): string => {
  return useVideoEditorStore.getState().startDrag({
    type: 'video-transition',
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

export const startAudioTransitionDrag = (transitionType: AudioTransitionType, duration = 1): string => {
  return useVideoEditorStore.getState().startDrag({
    type: 'audio-transition',
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
    type: 'mask',
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
  mediaType: 'video' | 'image' | 'audio',
  url: string,
  options?: { duration?: number; name?: string; thumbnailUrl?: string }
): string => {
  return useVideoEditorStore.getState().startDrag({
    type: 'media',
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
  transitions: Record<string, TransitionEntity>
): { inTransition?: TransitionEntity; outTransition?: TransitionEntity } {
  let inTransition: TransitionEntity | undefined;
  let outTransition: TransitionEntity | undefined;
  
  Object.values(transitions).forEach(t => {
    const clipIds = t.clipIds;
    
    if (t.position === 'between') {
      // Between transition: first clip gets 'out', second clip gets 'in'
      if (clipIds[0] === clipId) {
        outTransition = t;
      } else if (clipIds[1] === clipId) {
        inTransition = t;
      }
    } else {
      // Standalone transition
      if (clipIds[0] === clipId) {
        if (t.position === 'in') {
          inTransition = t;
        } else if (t.position === 'out') {
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
} from '../types/timeline-v2';

export default useVideoEditorStore;
