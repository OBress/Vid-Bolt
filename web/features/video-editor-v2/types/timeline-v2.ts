/**
 * ============================================================
 * TIMELINE V2 TYPES - Professional Industry-Standard Architecture
 * ============================================================
 * 
 * Following Premiere Pro / DaVinci Resolve patterns:
 * - Tracks are first-class data (not computed)
 * - Clips reference tracks by stable ID
 * - No transforms, only direct mutations
 * - Explicit ordering and metadata
 * 
 * This is the CANONICAL source of truth for timeline data.
 * All state flows through the VideoEditorStore using these types.
 */

import { 
  VideoTransitionType, 
  AudioTransitionType, 
  TransitionEasing,
  EasingPreset,
} from './index';
import type { PropertyKeyframes } from './keyframes';
import type { AudioEffect } from './audio-effects';
import type { Effect } from './effects';
import type { Mask } from './masks';

// ============================================================
// TRACK TYPES
// ============================================================

export type TrackType = 'video' | 'audio';
export type TrackGroup = 'video' | 'audio' | 'text' | 'effects' | 'overlays';

/**
 * Edit modes for timeline operations (like Premiere Pro)
 */
export type EditMode = 'select' | 'razor' | 'ripple' | 'rolling' | 'slip' | 'slide' | 'gap';

/**
 * Timeline Track - First-class persistent data
 * Tracks exist independently and have stable IDs that never change
 */
export interface TimelineTrack {
  /** Stable UUID - never changes */
  id: string;
  
  /** Track type */
  type: TrackType;
  
  /** Display name (e.g., "V1", "A1") */
  name: string;
  
  /** Explicit ordering (0, 1, 2...) - determines visual position */
  order: number;
  
  /** Track group (for separating video/audio sections) */
  group?: TrackGroup;
  
  // === METADATA ===
  /** Whether track is locked (prevents editing) */
  locked: boolean;
  
  /** Whether track is visible in playback */
  visible: boolean;
  
  /** Whether track audio is muted */
  muted: boolean;
  
  /** Whether clips can overlap on this track (true for video, false for audio) */
  allowOverlap: boolean;
  
  /** Whether track is soloed (audio only) */
  solo?: boolean;
  
  /** Track color (optional) */
  color?: string;
  
  /** Track height multiplier (optional, for custom heights) */
  heightMultiplier?: number;
  
  /** Track height in pixels (optional, used by some UI components) */
  height?: number;
  
  /** Whether track is targeted for new content */
  targeted?: boolean;
  
  /** Creation timestamp */
  createdAt?: number;
  
  /** Update timestamp */
  updatedAt?: number;
}

// ============================================================
// CLIP TYPES
// ============================================================

export type ClipType = 
  | 'video' 
  | 'audio' 
  | 'image' 
  | 'text' 
  | 'caption'
  | 'shape' 
  | 'sticker'
  | 'sound'
  | 'motion-graphics';

/**
 * Clip Transform - Visual positioning on canvas
 */
export interface ClipTransform {
  /** X position on canvas */
  x: number;
  
  /** Y position on canvas */
  y: number;
  
  /** Width on canvas */
  width: number;
  
  /** Height on canvas */
  height: number;
  
  /** Rotation in degrees */
  rotation: number;
  
  /** Scale factor */
  scale?: number;
  
  /** Opacity (0-1) */
  opacity?: number;
  
  /** Z-index for layering */
  zIndex?: number;
}

/**
 * Media Clip Properties
 */
export interface MediaClipProperties {
  /** Media start time (trim offset) */
  mediaStartTime?: number;
  
  /** Original media duration */
  mediaDuration?: number;
  
  /** Playback speed multiplier */
  speed: number;
  
  /** Whether to loop the media */
  loop?: boolean;
  
  /** Volume (0-1) for audio/video */
  volume?: number;
  
  /** Media source URL */
  src?: string;
}

/**
 * Text Clip Properties
 */
export interface TextClipProperties {
  /** Text content */
  text: string;
  
  /** Font family */
  fontFamily: string;
  
  /** Font size */
  fontSize: number;
  
  /** Text color */
  color: string;
  
  /** Background color */
  backgroundColor?: string;
  
  /** Text alignment */
  textAlign: 'left' | 'center' | 'right';
  
  /** Additional styles */
  styles?: Record<string, any>;
  
  /** Text content (alias for text field, used in some rendering paths) */
  content?: string;
}

/**
 * Timeline Clip - Item on a track
 * Clips reference tracks by ID and contain all necessary data
 */
export interface TimelineClip {
  /** Unique clip ID */
  id: string;
  
  /** Track this clip belongs to (foreign key) */
  trackId: string;
  
  /** Start time on timeline (seconds) */
  startTime: number;
  
  /** Duration (seconds) */
  duration: number;
  
  /** Clip type */
  type: ClipType;
  
  /** Source asset ID (video file, image, etc.) */
  sourceId: string;
  
  /** Display label */
  label?: string;
  
  // === VISUAL PROPERTIES ===
  /** Transform for canvas rendering */
  transform: ClipTransform;
  
  // === MEDIA PROPERTIES ===
  /** Media-specific properties (for video/audio/image) */
  media?: MediaClipProperties;
  
  /** Text-specific properties (for text/caption) */
  text?: TextClipProperties;
  
  // === LINKING ===
  /** ID of linked clip (for video+audio pairs) */
  linkedClipId?: string;
  
  // === EFFECTS & TRANSITIONS ===
  /** Visual effects applied to this clip (Premiere Pro style effect stack) */
  effects?: Effect[];
  
  /** Audio effects applied to this clip (for audio/video clips) */
  audioEffects?: AudioEffect[];
  
  /** Masks for masking/cropping */
  masks?: Mask[];
  
  /** Greenscreen/chroma key configuration */
  greenscreen?: {
    enabled: boolean;
    color?: string;
    similarity?: number;
    smoothness?: number;
  };
  
  /** 
   * Transitions embedded in clip (legacy format)
   * @deprecated Use TransitionEntity in store.transitions instead
   */
  transitions?: {
    in?: TransitionEntity;
    out?: TransitionEntity;
  };
  
  // === KEYFRAME ANIMATION ===
  /** 
   * Keyframe animation data for this clip
   * Enables animating any property over time (position, scale, opacity, effects, etc.)
   */
  keyframes?: PropertyKeyframes[];
  
  // === VISUAL STYLE ===
  // Note: opacity is stored in transform.opacity (canonical location)
  // Note: volume is stored in media.volume (canonical location)
  /** Backward-compat: direct opacity value */
  opacity?: number;
  /** Backward-compat: direct volume value */
  volume?: number;
  
  /** Visual styles (filters, blend modes, etc.) */
  styles?: Record<string, any>;
  
  /** Content (for text overlays, etc.) */
  content?: string;
  
  /** Display name for the clip */
  name?: string;
  
  /** Motion graphics properties (for motion-graphics clips) */
  properties?: {
    /** Motion graphics template */
    template?: import('./motion-graphics').MotionGraphicsTemplate;
    /** Current property values */
    propertyValues?: Record<string, any>;
    /** Mapbox configuration override */
    mapboxConfig?: import('./motion-graphics').MapboxConfig;
    /** 
     * Composition definition with editable layers.
     * This is saved when editing in the composition editor and takes
     * precedence over template.compositionDefinition for rendering.
     */
    compositionDefinition?: import('./composition').CompositionDefinition;
  };
  
  // === METADATA ===
  /** Thumbnail URL */
  thumbnailUrl?: string;
  
  /** Color for timeline display */
  color?: string;
  
  /** Additional data storage */
  data?: Record<string, any>;
  
  /** Creation timestamp */
  createdAt?: number;
  
  /** Last modified timestamp */
  updatedAt?: number;
}

// ============================================================
// TIMELINE STATE
// ============================================================

/**
 * Timeline State - Complete timeline data structure
 */
export interface TimelineState {
  /** All tracks (ordered by track.order) */
  tracks: TimelineTrack[];
  
  /** All clips on the timeline */
  clips: TimelineClip[];
  
  /** Selected clip IDs */
  selectedClipIds: string[];
  
  /** Timeline playback position (seconds) */
  playhead: number;
  
  /** Timeline zoom level */
  zoom: number;
  
  /** Timeline scroll position (seconds) */
  scrollPosition: number;
}

// ============================================================
// TIMELINE ACTIONS
// ============================================================

/**
 * Timeline Actions - All timeline mutations
 */
export interface TimelineActions {
  // === TRACK ACTIONS ===
  /**
   * Add a new track
   * @returns The new track ID
   */
  addTrack: (type: TrackType, options?: Partial<TimelineTrack>) => string;
  
  /**
   * Delete a track and optionally its clips
   */
  deleteTrack: (trackId: string, deleteClips?: boolean) => void;
  
  /**
   * Update track properties
   */
  updateTrack: (trackId: string, updates: Partial<TimelineTrack>) => void;
  
  /**
   * Reorder tracks by their IDs
   */
  reorderTracks: (trackIds: string[]) => void;
  
  /**
   * Toggle track lock
   */
  toggleTrackLock: (trackId: string) => void;
  
  /**
   * Toggle track visibility
   */
  toggleTrackVisibility: (trackId: string) => void;
  
  /**
   * Toggle track mute
   */
  toggleTrackMute: (trackId: string) => void;
  
  // === CLIP ACTIONS ===
  /**
   * Add a new clip to the timeline
   * @returns The new clip ID
   */
  addClip: (clip: Omit<TimelineClip, 'id' | 'createdAt' | 'updatedAt'>) => string;
  
  /**
   * Delete a clip
   */
  deleteClip: (clipId: string) => void;
  
  /**
   * Delete multiple clips
   */
  deleteClips: (clipIds: string[]) => void;
  
  /**
   * Update clip properties
   */
  updateClip: (clipId: string, updates: Partial<TimelineClip>) => void;
  
  /**
   * Move a clip to a new track and/or time
   */
  moveClip: (clipId: string, trackId: string, startTime: number) => void;
  
  /**
   * Duplicate a clip
   * @returns The new clip ID
   */
  duplicateClip: (clipId: string) => string | null;
  
  /**
   * Split a clip at a time
   * @returns The IDs of the two resulting clips
   */
  splitClip: (clipId: string, splitTime: number) => [string, string] | null;
  
  /**
   * Trim a clip (adjust start time and duration)
   */
  trimClip: (clipId: string, newStartTime: number, newDuration: number) => void;
  
  // === LINKING ACTIONS ===
  /**
   * Link two clips together (e.g., video + audio)
   */
  linkClips: (clipId1: string, clipId2: string) => void;
  
  /**
   * Unlink clips
   */
  unlinkClips: (clipIds: string[]) => void;
  
  /**
   * Get linked clip IDs for a given clip
   */
  getLinkedClipIds: (clipId: string) => string[];
  
  // === SELECTION ACTIONS ===
  /**
   * Select clips
   */
  selectClips: (clipIds: string[]) => void;
  
  /**
   * Clear selection
   */
  clearSelection: () => void;
  
  // === PLAYBACK ACTIONS ===
  /**
   * Set playhead position
   */
  setPlayhead: (time: number) => void;
  
  /**
   * Set zoom level
   */
  setZoom: (zoom: number) => void;
  
  /**
   * Set scroll position
   */
  setScrollPosition: (position: number) => void;
}

// ============================================================
// HELPER TYPES
// ============================================================

/**
 * Track creation options
 */
export interface CreateTrackOptions {
  type: TrackType;
  name?: string;
  locked?: boolean;
  visible?: boolean;
  muted?: boolean;
  color?: string;
}

/**
 * Clip creation options
 */
export interface CreateClipOptions {
  trackId: string;
  startTime: number;
  duration: number;
  type: ClipType;
  sourceId: string;
  label?: string;
  transform?: Partial<ClipTransform>;
  media?: Partial<MediaClipProperties>;
  text?: Partial<TextClipProperties>;
}

// ============================================================
// QUERY HELPERS
// ============================================================

/**
 * Get clips for a specific track
 */
export type GetClipsByTrack = (trackId: string) => TimelineClip[];

/**
 * Get track by ID
 */
export type GetTrackById = (trackId: string) => TimelineTrack | undefined;

/**
 * Get clip by ID
 */
export type GetClipById = (clipId: string) => TimelineClip | undefined;

/**
 * Get clips in time range
 */
export type GetClipsInRange = (startTime: number, endTime: number, trackId?: string) => TimelineClip[];

/**
 * Check if time range is available on track
 */
export type IsTimeRangeAvailable = (trackId: string, startTime: number, endTime: number, excludeClipIds?: string[]) => boolean;

// ============================================================
// TRANSITION TYPES
// ============================================================

/**
 * TransitionEntity - Source of truth for all transitions
 * 
 * Premiere Pro style behavior:
 * - Clips stay in place on the timeline (no movement when transitions are added)
 * - For between transitions, clips are extended during RENDERING to create overlap
 * - ALL transition types (crossfade, wipe, slide, zoom, etc.) work uniformly
 * 
 * Properties:
 * - startTime/endTime: Absolute seconds on the timeline (when the effect plays)
 * - clipIds: [clipId] for standalone, [firstClipId, secondClipId] for between transitions
 * - position: 'in' | 'out' | 'between'
 * - Duration is derived: endTime - startTime
 */
export interface TransitionEntity {
  id: string;
  type: VideoTransitionType | AudioTransitionType;
  
  /** Absolute timeline start time in seconds */
  startTime: number;
  
  /** Absolute timeline end time in seconds */
  endTime: number;
  
  easing: TransitionEasing;
  isAudio: boolean;
  
  /**
   * Clips involved in this transition:
   * - Standalone (fade in/out): [clipId] - single clip
   * - Between (crossfade): [firstClipId, secondClipId] - two adjacent clips
   */
  clipIds: [string, string?];
  
  /**
   * Position relative to the clip(s):
   * - 'in': Transition at start of clip (fade in, or second clip in crossfade)
   * - 'out': Transition at end of clip (fade out, or first clip in crossfade)
   * - 'between': Crossfade between two clips (clipIds has both)
   */
  position: 'in' | 'out' | 'between';
  
  /** Optional effect configuration */
  effect?: any;
  
  /** Transition mode (e.g. 'wipe', 'dissolve') */
  mode?: string;
  
  /** Duration in seconds (derived: endTime - startTime, but also settable) */
  duration?: number;
  
  createdAt: number;
  updatedAt: number;
}

/**
 * Helper to get transition duration from entity
 */
export function getTransitionDuration(transition: TransitionEntity): number {
  return transition.endTime - transition.startTime;
}

/**
 * Helper to check if transition is a between/crossfade transition
 */
export function isBetweenTransition(transition: TransitionEntity): boolean {
  return transition.position === 'between' || (transition.clipIds.length === 2 && transition.clipIds[1] !== undefined);
}

// ============================================================
// DRAG STATE TYPES (UNIFIED)
// ============================================================

/**
 * Unified drag type - single source of truth for all drag operations
 * 
 * Categories:
 * - clip-*: Dragging existing clips
 * - new-*: Dragging new content from panels
 * - transition-*: Dragging transitions
 * - playhead: Scrubbing the playhead
 */
export type UnifiedDragType = 
  // Clip operations
  | 'clip-move'
  | 'clip-resize-start'
  | 'clip-resize-end'
  // Content drag (from asset panels)
  | 'clip'
  | 'media'
  | 'effect'
  | 'video-transition'
  | 'audio-transition'
  | 'mask'
  | 'text-preset'
  | 'shape-preset'
  // Transition operations (existing transitions)
  | 'transition-move'
  | 'transition-resize'
  // Playhead
  | 'playhead';

/**
 * Snapshot of a clip being dragged (for multi-select)
 */
export interface ClipDragSnapshot {
  id: string;
  originalStartTime: number;
  originalDuration: number;
  originalTrackId: string;
  type?: ClipType;
  label?: string;
  mediaStartTime?: number;
  mediaDuration?: number;
  speed?: number;
}

/**
 * Snap information during drag
 */
export interface SnapInfo {
  /** Time that was snapped to (or null if no snap) */
  snappedTime: number | null;
  /** Track ID that was snapped to (or null) */
  snappedTrackId: string | null;
  /** The snap source: playhead, clip-start, clip-end */
  snapSource?: 'playhead' | 'clip-start' | 'clip-end';
}

/**
 * UNIFIED DRAG STATE - Core drag data
 * 
 * This replaces: drag, dragInfo, transitionDragState
 * All drag operations use this single structure.
 */
export interface UnifiedDragState {
  /** Type of drag operation */
  type: UnifiedDragType;
  /** Unique ID for this drag operation */
  dragId: string;
  
  // === CLIP DRAG DATA ===
  /** ID of the clip being dragged (for clip operations) */
  clipId?: string;
  /** Starting time of the clip when drag began */
  startTime: number;
  /** Current time position during drag */
  currentTime: number;
  /** Duration at drag start (for resize operations) */
  startDuration: number;
  /** Current duration during resize */
  currentDuration?: number;
  /** Track ID when drag started */
  startTrackId?: string;
  /** Current track ID during drag */
  currentTrackId?: string;
  /** Snapshots of all selected clips for multi-select drag */
  selectedClipsSnapshot?: ClipDragSnapshot[];
  
  // === POSITION DATA ===
  /** Mouse X position when drag started */
  startX: number;
  /** Mouse Y position when drag started */
  startY: number;
  /** Current mouse X position */
  currentX?: number;
  /** Current mouse Y position */
  currentY?: number;
  
  // === SNAPPING ===
  /** Current snap information */
  snap?: SnapInfo;
  /** Whether the current position is a valid drop target */
  isValidDrop: boolean;
  
  // === NEW ITEM DATA (for dragging from panels) ===
  /** Type of new content being dragged */
  newItemType?: 'video' | 'audio' | 'image' | 'text' | 'effect' | 'transition' | 'mask';
  /** URL/source for new media */
  url?: string;
  /** Duration for new media */
  mediaDuration?: number;
  /** Thumbnail for preview */
  thumbnailUrl?: string;
  /** Effect type when dragging effects */
  effectType?: string;
  /** Transition type when dragging transitions */
  transitionType?: VideoTransitionType | AudioTransitionType;
  /** Transition duration */
  transitionDuration?: number;
  /** Mask type when dragging masks */
  maskType?: string;
  /** Text preset ID */
  presetId?: string;
  /** Styles for text preset */
  presetStyles?: Record<string, unknown>;
  /** Shape type when dragging shapes */
  shapeType?: string;
  /** Shape styles when dragging shapes */
  shapeStyles?: Record<string, unknown>;
  
  // === TRANSITION DRAG SPECIFIC ===
  /** Position of transition being dragged (start/end of clip) */
  transitionPosition?: 'start' | 'end';
  /** Side of transition being resized */
  transitionResizeSide?: 'left' | 'right';
  /** Preview duration for transition resize */
  previewDuration?: number;
}

/**
 * DRAG VISUAL STATE - Visual feedback during drag
 * 
 * This replaces: ghostElements, magneticSnapLine, trackInsertionIndicator, committedDragPositions
 * Separated from core drag data for performance (UI updates independently)
 */
export interface DragVisualState {
  /** Ghost elements showing where clips will be placed */
  ghostElements?: Array<{
    id: string;
    left: number;
    width: number;
    top: number;
    trackId?: string;
    isAudio?: boolean;
    thumbnailUrl?: string;
    label?: string;
  }>;
  
  /** Magnetic snap line indicator */
  snapLine?: {
    trackIndex: number;
    snappedToTrackIndex: number;
    insertionTime: number;
  };
  
  /** Track insertion indicator (for new track creation) */
  trackInsertion?: {
    insertions: Array<{
      insertionIndex: number;
      trackType: 'video' | 'audio';
    }>;
  };
  
  /** Committed positions (optimistic UI while waiting for state update) */
  committedPositions?: Map<string, {
    clipId: string;
    startTime: number;
    duration: number;
    trackId: string;
    originalStartTime: number;
    originalTrackId?: string;
  }>;
}

// ============================================================
// GHOST ELEMENT DATA (Used by drag visual state)
// ============================================================

/** Ghost element data during drag operations */
export interface GhostElementData {
  id: string;
  left: number;
  width: number;
  top: number;
  trackId?: string;
  isAudio?: boolean;
  thumbnailUrl?: string;
  label?: string;
}

/** Committed drag position (optimistic UI) */
export interface CommittedDragPosition {
  clipId: string;
  startTime: number;
  duration: number;
  trackId: string;
  originalStartTime: number;
  originalTrackId?: string;
  /** Drag start position (alias for startTime, used by some UI components) */
  start?: number;
  /** Row index in the timeline grid */
  row?: number;
  /** Original row index before the drag */
  originalRow?: number;
}

// ============================================================
// SELECTION STATE
// ============================================================

/**
 * Selection state for clips and transitions
 */
export interface SelectionState {
  clipIds: string[];
  transitionId: string | null;
}

// ============================================================
// PLAYBACK STATE
// ============================================================

/**
 * Playback state
 */
export interface PlaybackState {
  currentTime: number;
  isPlaying: boolean;
  playbackRate: number;
}

// ============================================================
// CANVAS / PLAYER STATE
// ============================================================

export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:3' | '21:9' | '4:5';
export type ResolutionPreset = '720p' | '1080p' | '1440p' | '4K';

export interface CanvasState {
  aspectRatio: AspectRatio;
  resolution: ResolutionPreset;
  playerDimensions: { width: number; height: number };
  backgroundColor: string;
}

// ============================================================
// UNIFIED EDITOR STATE
// ============================================================

/**
 * Complete video editor state - single source of truth
 */
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
  canvas: CanvasState;
  
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
}

// ============================================================
// CLIP TYPE UTILITIES
// ============================================================

/**
 * Clip types that belong on video tracks (visual content)
 */
export const VIDEO_CLIP_TYPES: ClipType[] = [
  'video',
  'image',
  'text',
  'caption',
  'sticker',
  'shape',
  'motion-graphics',
];

/**
 * Clip types that belong on audio tracks
 */
export const AUDIO_CLIP_TYPES: ClipType[] = [
  'audio',
];

/**
 * Check if a clip type belongs on a video track
 */
export const isVideoClipType = (clipType?: ClipType | string): boolean => {
  if (!clipType) return true; // Default to video track
  return VIDEO_CLIP_TYPES.includes(clipType as ClipType);
};

/**
 * Check if a clip type belongs on an audio track
 */
export const isAudioClipType = (clipType?: ClipType | string): boolean => {
  if (!clipType) return false;
  return AUDIO_CLIP_TYPES.includes(clipType as ClipType);
};

/**
 * Get the end time of a clip (startTime + duration)
 */
export const getClipEndTime = (clip: TimelineClip): number => {
  return clip.startTime + clip.duration;
};

/**
 * Get clips for a specific track
 */
export const getClipsForTrack = (clips: TimelineClip[], trackId: string): TimelineClip[] => {
  return clips.filter(clip => clip.trackId === trackId);
};

/**
 * Sort clips by start time
 */
export const sortClipsByStartTime = (clips: TimelineClip[]): TimelineClip[] => {
  return [...clips].sort((a, b) => a.startTime - b.startTime);
};

/**
 * Calculate total timeline duration from clips
 */
export const calculateTimelineDuration = (clips: TimelineClip[]): number => {
  if (clips.length === 0) return 0;
  return Math.max(...clips.map(clip => clip.startTime + clip.duration));
};
