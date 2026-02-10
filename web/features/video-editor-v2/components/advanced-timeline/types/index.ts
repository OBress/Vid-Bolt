/**
 * Timeline Types - V2 Architecture
 * 
 * Architecture:
 * - Store keeps NORMALIZED data: tracks[] + clips[] (separate arrays)
 * - UI uses DENORMALIZED view: TrackWithClips (tracks with embedded items)
 * - Selectors compute the denormalized view from normalized store
 * 
 * This is the standard pattern for React state management.
 */

// Re-export V2 types from the store
export type {
  TimelineItem,
  TrackWithClips,
  ItemTransition,
} from '../../../stores/video-editor-store';

export {
  selectTracksWithClips,
  useTracksWithClips,
  selectClipsByTrackId,
  useClipsByTrackId,
  computeLinkGroup,
} from '../../../stores/video-editor-store';

// Re-export all canonical V2 types from the type system
export type {
  TimelineTrack,
  TimelineClip,
  ClipType,
  TrackType,
  EditMode,
  ClipTransform,
  MediaClipProperties,
  TextClipProperties,
  UnifiedDragState,
  UnifiedDragType,
  DragVisualState,
  ClipDragSnapshot,
  GhostElementData,
  CommittedDragPosition,
} from '../../../types/timeline-v2';

// Compatibility aliases for renamed types
import type { UnifiedDragState, ClipDragSnapshot, UnifiedDragType } from '../../../types/timeline-v2';
export type DragData = UnifiedDragState;
export type DragInfoState = UnifiedDragState;
export type TransitionDragState = UnifiedDragState;
export type DraggedClipSnapshot = ClipDragSnapshot;
export type ActiveDragType = UnifiedDragType;

// Re-export transition types from main types
export type {
  VideoTransition,
  AudioTransition,
  TransitionPosition,
  TransitionEasing,
} from '../../../types';

export {
  VideoTransitionType,
  AudioTransitionType,
} from '../../../types';

// Re-export utility functions
export {
  VIDEO_CLIP_TYPES,
  AUDIO_CLIP_TYPES,
  isVideoClipType,
  isAudioClipType,
  getClipEndTime,
  getClipsForTrack,
  sortClipsByStartTime,
  calculateTimelineDuration,
} from '../../../types/timeline-v2';

// ============================================================
// CLIP TYPE ENUM & UTILITIES
// ============================================================

/**
 * Enum for timeline item types
 * These map to ClipType values but provide a convenient enum interface
 */
export enum TrackItemType {
  VIDEO = 'video',
  AUDIO = 'audio',
  IMAGE = 'image',
  TEXT = 'text',
  CAPTION = 'caption',
  STICKER = 'sticker',
  BLUR = 'blur',
  SHAPE = 'shape',
  MOTION_GRAPHICS = 'motion-graphics',
}

/**
 * Type guard to check if a clip type belongs on a video track
 */
export const isVideoTrackItem = (type?: string | null): boolean => {
  if (!type) return true;
  return [
    TrackItemType.VIDEO,
    TrackItemType.IMAGE,
    TrackItemType.TEXT,
    TrackItemType.CAPTION,
    TrackItemType.STICKER,
    TrackItemType.BLUR,
    TrackItemType.SHAPE,
    TrackItemType.MOTION_GRAPHICS,
  ].includes(type as TrackItemType);
};

/**
 * Type guard to check if a clip type belongs on an audio track
 */
export const isAudioTrackItem = (type?: string | null): boolean => {
  return type === TrackItemType.AUDIO;
};

// ============================================================
// COMPONENT PROPS INTERFACES
// ============================================================

import type { TrackWithClips, TimelineItem } from '../../../stores/video-editor-store';

/**
 * Visible time range for virtualization
 */
export interface VisibleTimeRange {
  startTime: number;
  endTime: number;
}

/**
 * Props for TimelineContent component
 */
export interface TimelineContentProps {
  tracks: TrackWithClips[];
  totalDuration: number;
  viewportDuration: number;
  currentFrame: number;
  fps: number;
  zoomScale: number;
  // Virtual scroll props - when provided, uses CSS transforms instead of native scroll
  scrollX?: number;
  scrollY?: number;
  onScrollXChange?: (scrollX: number) => void;
  onScrollYChange?: (scrollY: number) => void;
  getVisibleTimeRange?: () => VisibleTimeRange;
  getContentTransform?: () => { x: number; y: number };
  // Other props
  onFrameChange?: (frame: number) => void;
  onItemSelect?: (itemId: string | null) => void;
  onDeleteItems?: (itemIds: string[]) => void;
  onDuplicateItems?: (itemIds: string[]) => void;
  onSplitItems?: (itemId: string, splitTime: number) => void;
  selectedItemIds?: string[];
  onSelectedItemsChange?: (itemIds: string[]) => void;
  onItemMove?: (itemId: string, newStart: number, newEnd: number, newTrackId: string) => void;
  onItemResize?: (itemId: string, newStart: number, newEnd: number) => void;
  onNewItemDrop?: (params: any) => void;
  timelineRef?: React.RefObject<HTMLDivElement | null>;
  ghostMarkerPosition?: number | null;
  isDragging?: boolean;
  isContextMenuOpen?: boolean;
  onMouseMove?: (e: React.MouseEvent<any>) => void;
  onMouseLeave?: () => void;
  onInsertTrackAt?: (index: number, type?: 'video' | 'audio') => any;
  onInsertMultipleTracksAt?: (index: number, trackDefinitions: any) => any;
  onCreateTracksWithItems?: (params: any) => void;
  showTimelineGuidelines?: boolean;
  onContextMenuOpenChange?: (open: boolean) => void;
  splittingEnabled?: boolean;
  hideItemsOnDrag?: boolean;
  trackHeight?: number;
  onCloseGap?: (trackId: string, gapStart: number, gapEnd: number) => void;
  // Transition props
  isDraggingTransition?: boolean;
  draggingTransitionIsVideo?: boolean | null;
  selectedTransition?: any;
  onTransitionDrop?: (...args: any[]) => void;
  onBoundaryTransitionDrop?: (...args: any[]) => void;
  onTransitionSelect?: (...args: any[]) => void;
  onTransitionDeselect?: () => void;
  onTransitionTimesChange?: (...args: any[]) => void;
  onTransitionRemove?: (...args: any[]) => void;
  onZoomToRange?: (startTime: number, endTime: number) => void;
  // Link props
  canLinkItems?: (...args: any[]) => boolean;
  areItemsLinked?: (...args: any[]) => boolean;
  isItemLinked?: (itemId: string) => boolean;
  getLinkGroupSize?: (itemId: string) => number;
  getLinkedItemIds?: (itemId: string) => string[];
  onLinkItems?: (...args: any[]) => void;
  onUnlinkItems?: (...args: any[]) => void;
  // Effect drop
  onEffectDrop?: (params: any) => void;
  // Composition editor
  onOpenCompositionEditor?: (itemId: string) => void;
}

/**
 * Ref interface for Timeline component
 */
export interface TimelineRef {
  addNewItem: (itemData: {
    type: string;
    label?: string;
    duration?: number;
    color?: string;
    data?: any;
    preferredTrackId?: string;
    preferredStartTime?: number;
  }) => void;
  scroll: {
    scrollToTop: () => void;
    scrollToBottom: () => void;
  };
}

/**
 * Props for Timeline component
 */
export interface TimelineProps {
  tracks?: TrackWithClips[];
  totalDuration: number;
  currentFrame?: number;
  fps?: number;
  onFrameChange?: (frame: number) => void;
  onItemMove?: (itemId: string, newStart: number, newEnd: number, newTrackId: string) => void;
  onItemResize?: (itemId: string, newStart: number, newEnd: number) => void;
  onItemSelect?: (itemId: string | null) => void;
  onDeleteItems?: (itemIds: string[]) => void;
  onDuplicateItems?: (itemIds: string[]) => void;
  onSplitItems?: (itemId: string, splitTime: number) => void;
  selectedItemIds?: string[];
  onSelectedItemsChange?: (itemIds: string[]) => void;
  onTracksChange?: (tracks: TrackWithClips[]) => void;
  onAddNewItem?: (itemData: any) => void;
  onNewItemDrop?: (params: any) => void;
  showZoomControls?: boolean;
  isPlaying?: boolean;
  onPlay?: () => void;
  onPause?: () => void;
  onSeekToStart?: () => void;
  onSeekToEnd?: () => void;
  showPlaybackControls?: boolean;
  playbackRate?: number;
  setPlaybackRate?: (rate: number) => void;
  autoRemoveEmptyTracks?: boolean;
  onAutoRemoveEmptyTracksChange?: (enabled: boolean) => void;
  showTimelineGuidelines?: boolean;
  showUndoRedoControls?: boolean;
  hideItemsOnDrag?: boolean;
  enableTrackDrag?: boolean;
  enableTrackDelete?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  aspectRatio?: string;
  onAspectRatioChange?: (ratio: string) => void;
  resolution?: string;
  onResolutionChange?: (resolution: string) => void;
  showAspectRatioControls?: boolean;
  updatePresentHistoryRef?: any;
  isCompact?: boolean;
  onToggleCompact?: () => void;
  trackHeight?: number;
  trackItemHeight?: number;
  onCollapseChange?: (collapsed: boolean) => void;
  onEffectDrop?: (params: any) => void;
  // Composition editor
  onOpenCompositionEditor?: (itemId: string) => void;
}

// ============================================================
// LINK GROUP UTILITIES
// ============================================================

import type { TimelineClip } from '../../../types/timeline-v2';

/**
 * Get the link group for a clip
 */
export function getClipLinkGroup(clip: TimelineClip): string | undefined {
  if (!clip.linkedClipId) return undefined;
  return `link-${[clip.id, clip.linkedClipId].sort().join('-')}`;
}

/**
 * Check if two clips are in the same link group
 */
export function areClipsInSameLinkGroup(clip1: TimelineClip, clip2: TimelineClip): boolean {
  const group1 = getClipLinkGroup(clip1);
  const group2 = getClipLinkGroup(clip2);
  return !!group1 && group1 === group2;
}
