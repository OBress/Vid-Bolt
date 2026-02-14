/**
 * Clip-to-Render Adapter
 * 
 * Converts Timeline V2 clips to the render format expected by Remotion.
 * 
 * TRANSITION ARCHITECTURE (Premiere Pro style):
 * - Clips stay in place on the timeline - they do NOT move when transitions are added
 * - Transitions store absolute startTime/endTime (transition.startTime to transition.endTime)
 * - Between transitions are a single entity with clipIds: [firstClip, secondClip]
 * - For between transitions, clips are EXTENDED during rendering to create overlap:
 *   - First clip: extends END to reach transition.endTime
 *   - Second clip: extends START back to transition.startTime
 * - During the overlap period, both clips render and the TransitionWrapper applies the effect
 * - ALL transition types (crossfade, wipe, slide, zoom, etc.) work the same way
 */

import type { TimelineClip, TimelineTrack, TransitionEntity } from '../types/timeline-v2';
import { isBetweenTransition, getTransitionDuration } from '../types/timeline-v2';
import { getClipTransitionsPure, useVideoEditorStore } from '../stores/video-editor-store';
import type { 
  Overlay, 
  ClipOverlay, 
  SoundOverlay, 
  ImageOverlay, 
  TextOverlay, 
  CaptionOverlay,
  ShapeOverlay,
  StickerOverlay,
  VideoTransition,
  AudioTransition,
} from '../types';
import { OverlayType, VideoTransitionType, AudioTransitionType } from '../types';
import type { MotionGraphicsOverlay } from '../types/motion-graphics';
import { 
  type RenderClip, 
  type RenderState as RenderClipState,
  timelineClipToRenderClip,
} from '../types/render-clip';

/**
 * Render state for Remotion (Overlay-based)
 * 
 * Note: A newer RenderClip-based API is also available for future use.
 */
export interface RenderState {
  overlays: Overlay[];
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
  backgroundColor: string;
}

// Re-export RenderClip types for convenience
export type { RenderClip, RenderClipState };

// Note: findClipTransitions is now imported as getClipTransitionsPure from the store

/**
 * PERF: Pre-build a clipId → {inTransition, outTransition} lookup map in O(M).
 *
 * Previously, `getClipTransitionsPure` was called once per clip — each call doing
 * `Object.values(transitions).forEach(...)` — resulting in O(N × M) complexity.
 * With 50 clips this single bottleneck consumed 10.8 seconds of main-thread time.
 *
 * By building the map once and passing it to `clipToOverlay`, the total cost
 * drops to O(N + M) — typically < 1ms.
 */
export type TransitionLookup = Map<string, { inTransition?: TransitionEntity; outTransition?: TransitionEntity }>;

export function buildTransitionLookup(
  transitions: Record<string, TransitionEntity>,
): TransitionLookup {
  const map: TransitionLookup = new Map();
  if (!transitions) return map;

  const values = Object.values(transitions);
  for (let i = 0; i < values.length; i++) {
    const t = values[i];
    const clipIds = t.clipIds;

    if (t.position === 'between') {
      // Between transition: first clip gets 'out', second clip gets 'in'
      if (clipIds[0]) {
        const existing = map.get(clipIds[0]);
        if (existing) {
          existing.outTransition = t;
        } else {
          map.set(clipIds[0], { outTransition: t });
        }
      }
      if (clipIds[1]) {
        const existing = map.get(clipIds[1]);
        if (existing) {
          existing.inTransition = t;
        } else {
          map.set(clipIds[1], { inTransition: t });
        }
      }
    } else {
      // Standalone transition
      if (clipIds[0]) {
        const existing = map.get(clipIds[0]) || {};
        if (t.position === 'in') {
          existing.inTransition = t;
        } else if (t.position === 'out') {
          existing.outTransition = t;
        }
        if (!map.has(clipIds[0])) {
          map.set(clipIds[0], existing);
        }
      }
    }
  }

  return map;
}

/**
 * Convert a string clip ID to a safe, deterministic numeric ID.
 *
 * Uses djb2 hashing to produce a collision-resistant integer within safe range.
 * The previous digit-stripping approach was unsafe because different clip IDs
 * (e.g., "clip-1771096011816-9abc" and "clip-17710960118169-xyz") could strip
 * to the same digit string, producing duplicate React keys.
 *
 * Exported so all consumers use the same conversion (detail components,
 * video-player, overlay selection, etc.).
 */
export function clipIdToNumeric(clipId: string): number {
  // djb2 hash — deterministic, collision-resistant, always within safe integer range
  let hash = 5381;
  for (let i = 0; i < clipId.length; i++) {
    // hash * 33 + char, kept within 32-bit signed range then made positive
    hash = ((hash << 5) + hash + clipId.charCodeAt(i)) | 0;
  }
  // Ensure positive and add a large offset to avoid colliding with small integers
  return (hash >>> 0) + 1_000_000_000;
}

/**
 * Build video transition for Remotion rendering (module-level to avoid closure allocation)
 *
 * Uses absolute startTime/endTime for precise timing.
 * Position is preserved from the original TransitionEntity.
 */
function buildVideoTransition(t: TransitionEntity): (VideoTransition & {
  _absoluteStartTime: number;
  _absoluteEndTime: number;
  _isBetween: boolean;
}) | undefined {
  if (!t || t.isAudio) return undefined;

  const durationSeconds = getTransitionDuration(t);
  const isBetween = isBetweenTransition(t);

  return {
    type: t.type as VideoTransitionType,
    duration: durationSeconds,
    position: t.position === 'between' ? 'end' : (t.position === 'in' ? 'start' : 'end'),
    easing: t.easing,
    _absoluteStartTime: t.startTime,
    _absoluteEndTime: t.endTime,
    _isBetween: isBetween,
  };
}

/**
 * Build audio transition for Remotion rendering (module-level to avoid closure allocation)
 */
function buildAudioTransition(t: TransitionEntity): (AudioTransition & {
  _absoluteStartTime: number;
  _absoluteEndTime: number;
  _isBetween: boolean;
}) | undefined {
  if (!t || !t.isAudio) return undefined;

  const durationSeconds = getTransitionDuration(t);
  const isBetween = isBetweenTransition(t);

  return {
    type: t.type as AudioTransitionType,
    duration: durationSeconds,
    position: t.position === 'between' ? 'end' : (t.position === 'in' ? 'start' : 'end'),
    easing: t.easing,
    _absoluteStartTime: t.startTime,
    _absoluteEndTime: t.endTime,
    _isBetween: isBetween,
  };
}

/**
 * Convert a Timeline V2 clip to an Overlay for Remotion rendering.
 * 
 * For between transitions, clips are extended to create overlap:
 * - First clip extends past its end time to transition.endTime
 * - Second clip starts earlier at transition.startTime
 * - Both clips render during the overlap, with TransitionWrapper applying effects
 */
export function clipToOverlay(
  clip: TimelineClip,
  fps: number,
  trackIndex: number = 0,
  transitions: Record<string, TransitionEntity> = {},
  /** PERF: Optional pre-built lookup map — avoids O(M) scan per clip */
  prebuiltLookup?: TransitionLookup,
): Overlay {
  // PERF: Use pre-built map (O(1)) when available, fall back to O(M) scan for single-clip calls
  const { inTransition, outTransition } = prebuiltLookup
    ? (prebuiltLookup.get(clip.id) || {})
    : getClipTransitionsPure(clip.id, transitions);
  
  // Calculate clip timing
  // Start with the clip's actual timeline position
  let fromSeconds = clip.startTime;
  let toSeconds = clip.startTime + clip.duration;
  
  // For between transitions, EXTEND clip render duration to create overlap
  // This is how crossfades work: both clips render during the transition period
  // First clip: extend END to reach transition.endTime
  if (outTransition && isBetweenTransition(outTransition)) {
    toSeconds = Math.max(toSeconds, outTransition.endTime);
  }
  
  // Second clip: extend START back to transition.startTime
  if (inTransition && isBetweenTransition(inTransition)) {
    fromSeconds = Math.min(fromSeconds, inTransition.startTime);
  }
  
  const fromFrame = Math.round(fromSeconds * fps);
  const durationInFrames = Math.round((toSeconds - fromSeconds) * fps);
  
  // Convert string ID to safe numeric ID (handles IDs that exceed MAX_SAFE_INTEGER)
  const numericId = clipIdToNumeric(clip.id);
  
  // Base properties shared by all overlay types
  const baseOverlay = {
    id: numericId,
    from: fromFrame,
    durationInFrames,
    row: trackIndex,
    left: clip.transform?.x ?? 0,
    top: clip.transform?.y ?? 0,
    width: clip.transform?.width ?? 100,
    height: clip.transform?.height ?? 100,
    rotation: clip.transform?.rotation ?? 0,
    isDragging: false,
    linkedOverlayId: clip.linkedClipId
      ? clipIdToNumeric(clip.linkedClipId)
      : undefined,
    data: clip.data,
    keyframes: clip.keyframes,
  };


  // Get opacity and zIndex from canonical locations
  const opacity = clip.transform?.opacity ?? clip.styles?.opacity ?? 1;
  const zIndex = clip.transform?.zIndex ?? clip.styles?.zIndex ?? 0;

  // Type-specific conversion
  switch (clip.type) {
    case 'video': {
      // No media adjustment needed - clips are positioned correctly by store
      const adjustedMediaStartTime = clip.media?.mediaStartTime;
      
      const videoOverlay: ClipOverlay = {
        ...baseOverlay,
        type: OverlayType.VIDEO,
        content: clip.name || clip.label || '',
        src: clip.sourceId,
        videoStartTime: adjustedMediaStartTime,
        speed: clip.media?.speed || 1,
        mediaSrcDuration: clip.media?.mediaDuration,
        inTransition: inTransition ? buildVideoTransition(inTransition) : undefined,
        outTransition: outTransition ? buildVideoTransition(outTransition) : undefined,
        effects: clip.effects,
        masks: clip.masks,
        greenscreen: clip.greenscreen,
        styles: {
          opacity,
          zIndex,
          volume: clip.media?.volume ?? 1,
          ...clip.styles,
        },
      };
      return videoOverlay;
    }

    case 'audio': {
      // No media adjustment needed - clips are positioned correctly by store
      const adjustedMediaStartTime = clip.media?.mediaStartTime;
      
      const soundOverlay: SoundOverlay = {
        ...baseOverlay,
        type: OverlayType.SOUND,
        content: clip.name || clip.label || '',
        src: clip.sourceId,
        startFromSound: adjustedMediaStartTime 
          ? Math.round(adjustedMediaStartTime * fps) 
          : undefined,
        videoDurationInFrames: durationInFrames,
        mediaSrcDuration: clip.media?.mediaDuration,
        playbackRate: clip.media?.speed || 1,
        toneFrequency: (clip.media as any)?.pitch || 1,
        audioEffects: clip.audioEffects,
        inTransition: inTransition ? buildAudioTransition(inTransition) : undefined,
        outTransition: outTransition ? buildAudioTransition(outTransition) : undefined,
        styles: {
          opacity,
          zIndex,
          volume: clip.media?.volume ?? 1,
          ...clip.styles,
        },
      };
      return soundOverlay;
    }

    case 'image': {
      const imageOverlay: ImageOverlay = {
        ...baseOverlay,
        type: OverlayType.IMAGE,
        src: clip.sourceId,
        content: clip.name || clip.label,
        inTransition: inTransition ? buildVideoTransition(inTransition) : undefined,
        outTransition: outTransition ? buildVideoTransition(outTransition) : undefined,
        effects: clip.effects,
        masks: clip.masks,
        greenscreen: clip.greenscreen,
        styles: {
          opacity,
          zIndex,
          ...clip.styles,
        },
      };
      return imageOverlay;
    }

    case 'text': {
      const baseStyles = {
        opacity,
        zIndex,
        fontSize: clip.styles?.fontSize ?? (clip.text?.fontSize ? `${clip.text.fontSize}px` : '24px'),
        fontFamily: clip.styles?.fontFamily ?? clip.text?.fontFamily ?? 'Inter',
        fontWeight: clip.styles?.fontWeight ?? 'normal',
        fontStyle: clip.styles?.fontStyle ?? 'normal',
        textDecoration: clip.styles?.textDecoration ?? 'none',
        color: clip.text?.color ?? clip.styles?.color ?? '#ffffff',
        backgroundColor: clip.text?.backgroundColor ?? clip.styles?.backgroundColor ?? 'transparent',
        textAlign: clip.text?.textAlign ?? clip.styles?.textAlign ?? 'center',
      };
      
      const textOverlay: TextOverlay = {
        ...baseOverlay,
        type: OverlayType.TEXT,
        content: clip.content ?? clip.text?.text ?? '',
        styles: {
          ...baseStyles,
          ...clip.styles,
        },
      };
      
      return textOverlay;
    }

    case 'caption': {
      const captionOverlay: CaptionOverlay = {
        ...baseOverlay,
        type: OverlayType.CAPTION,
        captions: clip.data?.captions || [],
        styles: clip.styles ?? clip.data?.styles ?? {
          fontFamily: 'Arial',
          fontSize: '24px',
          lineHeight: 1.5,
          textAlign: 'center',
          color: '#ffffff',
        },
        template: clip.data?.template,
      };
      return captionOverlay;
    }

    case 'shape': {
      const shapeOverlay: ShapeOverlay = {
        ...baseOverlay,
        type: OverlayType.SHAPE,
        content: clip.data?.shapeType ?? clip.content ?? 'rectangle',
        effects: clip.effects,
        styles: {
          opacity,
          zIndex,
          fill: clip.data?.fill ?? clip.styles?.fill ?? '#3b82f6',
          stroke: clip.data?.stroke ?? clip.styles?.stroke,
          strokeWidth: clip.data?.strokeWidth ?? clip.styles?.strokeWidth,
          borderRadius: clip.data?.borderRadius ?? clip.styles?.borderRadius,
          ...clip.styles,
        },
      };
      return shapeOverlay;
    }

    case 'sticker': {
      const stickerOverlay: StickerOverlay = {
        ...baseOverlay,
        type: OverlayType.STICKER,
        content: clip.sourceId,
        category: clip.data?.category || 'Default',
        styles: {
          opacity,
          zIndex,
          scale: clip.transform?.scale ?? clip.styles?.scale,
          ...clip.styles,
        },
      };
      return stickerOverlay;
    }

    case 'motion-graphics': {
      // Get template from clip properties
      const template = clip.properties?.template;
      const propertyValues = clip.properties?.propertyValues || {};
      const mapboxConfig = clip.properties?.mapboxConfig || template?.mapboxConfig;
      
      // Get compositionDefinition - priority order:
      // 1. clip.properties.compositionDefinition (edited in composition editor)
      // 2. template.compositionDefinition (generated by AI)
      const compositionDefinition = clip.properties?.compositionDefinition || template?.compositionDefinition;
      
      
      const motionGraphicsOverlay: MotionGraphicsOverlay = {
        ...baseOverlay,
        type: OverlayType.MOTION_GRAPHICS,
        templateId: template?.id || clip.sourceId,
        template: template!,
        propertyValues,
        compositionDefinition,
        mapboxConfig,
        styles: {
          opacity,
          zIndex,
          ...clip.styles,
        },
      };
      return motionGraphicsOverlay as unknown as Overlay;
    }

    default:
      return {
        ...baseOverlay,
        type: OverlayType.VIDEO,
        content: clip.name || clip.label || '',
        src: clip.sourceId,
        styles: {
          opacity,
          zIndex,
          ...clip.styles,
        },
      } as ClipOverlay;
  }
}

/**
 * Simple conversion of clips to overlays without track info
 */
export function clipsToOverlays(
  clips: TimelineClip[],
  fps: number,
): Overlay[] {
  if (!clips || clips.length === 0) return [];
  
  const trackClips = new Map<string, TimelineClip[]>();
  clips.forEach(clip => {
    const existing = trackClips.get(clip.trackId) || [];
    existing.push(clip);
    trackClips.set(clip.trackId, existing);
  });
  
  const trackRowMap = new Map<string, number>();
  let videoRow = 0;
  let audioRow = -1;
  
  trackClips.forEach((trackClipList, trackId) => {
    const isAudio = trackClipList.some(c => c.type === 'audio');
    if (isAudio) {
      trackRowMap.set(trackId, audioRow);
      audioRow--;
    } else {
      trackRowMap.set(trackId, videoRow);
      videoRow++;
    }
  });
  
  const overlays: Overlay[] = [];
  for (const clip of clips) {
    const row = trackRowMap.get(clip.trackId) ?? 0;
    const overlay = clipToOverlay(clip, fps, row);
    overlays.push(overlay);
  }
  
  return overlays.sort((a, b) => a.from - b.from);
}

/**
 * Convert all Timeline V2 clips to overlays for rendering with full track info
 */
export function clipsToOverlaysWithTracks(
  clips: TimelineClip[],
  tracks: TimelineTrack[],
  fps: number,
  transitions: Record<string, TransitionEntity> = {}
): Overlay[] {
  const overlays: Overlay[] = [];
  
  const trackIndexMap = new Map<string, number>();
  
  const videoTracks = tracks
    .filter(t => t.type === 'video')
    .sort((a, b) => a.order - b.order);
  videoTracks.forEach((track, idx) => {
    trackIndexMap.set(track.id, idx);
  });
  
  const audioTracks = tracks
    .filter(t => t.type === 'audio')
    .sort((a, b) => a.order - b.order);
  audioTracks.forEach((track, idx) => {
    trackIndexMap.set(track.id, -(idx + 1));
  });
  
  // PERF: Build transition lookup once O(M), then O(1) per clip
  const transitionLookup = buildTransitionLookup(transitions);

  for (const clip of clips) {
    const trackIndex = trackIndexMap.get(clip.trackId) ?? 0;
    const overlay = clipToOverlay(clip, fps, trackIndex, transitions, transitionLookup);
    overlays.push(overlay);
  }
  
  return overlays.sort((a, b) => a.from - b.from);
}

/**
 * Calculate total duration in frames from clips
 */
export function calculateDurationInFrames(clips: TimelineClip[], fps: number, minDuration = 30): number {
  if (!clips || clips.length === 0) return minDuration * fps;
  
  const maxEndTime = Math.max(...clips.map(c => c.startTime + c.duration));
  return Math.ceil(maxEndTime * fps);
}

/**
 * Build complete render state from Timeline V2 data
 */
export function buildRenderState(
  clips: TimelineClip[],
  tracks: TimelineTrack[],
  transitions: Record<string, TransitionEntity>,
  fps: number,
  dimensions: { width: number; height: number },
  backgroundColor: string
): RenderState {
  const overlays = clipsToOverlaysWithTracks(clips, tracks, fps, transitions);
  const durationInFrames = calculateDurationInFrames(clips, fps);
  
  return {
    overlays,
    durationInFrames,
    fps,
    width: dimensions.width,
    height: dimensions.height,
    backgroundColor,
  };
}

/**
 * Hook to get render state from the VideoEditorStore
 */
export function useRenderState(): RenderState {
    
  const clipsRecord = useVideoEditorStore((state: any) => state.clips) || {};
  const tracksRecord = useVideoEditorStore((state: any) => state.tracks) || {};
  const clips = Array.isArray(clipsRecord) ? clipsRecord : Object.values(clipsRecord) as TimelineClip[];
  const tracks = Array.isArray(tracksRecord) ? tracksRecord : Object.values(tracksRecord) as TimelineTrack[];
  const transitions = useVideoEditorStore((state: any) => state.transitions) || {};
  const fps = useVideoEditorStore((state: any) => state.fps) || 30;
  const aspectRatio = useVideoEditorStore((state: any) => state.aspectRatio) || '16:9';
  const resolution = useVideoEditorStore((state: any) => state.resolution) || '1080p';
  const backgroundColor = useVideoEditorStore((state: any) => state.backgroundColor) || '#000000';
  
  const resolutionHeights: Record<string, number> = {
    '720p': 720,
    '1080p': 1080,
    '1440p': 1440,
    '4k': 2160,
  };
  
  const aspectRatios: Record<string, number> = {
    '16:9': 16/9,
    '9:16': 9/16,
    '1:1': 1,
    '4:5': 4/5,
  };
  
  const height = resolutionHeights[resolution] || 1080;
  const ratio = aspectRatios[aspectRatio] || 16/9;
  const width = Math.round(height * ratio);
  
  const dimensions = { width, height };
  
  return buildRenderState(clips, tracks, transitions, fps, dimensions, backgroundColor);
}

// ============================================================
// NEW RENDER CLIP API (Recommended)
// ============================================================

/**
 * Convert clips to RenderClips (new unified format)
 * 
 * This is the recommended way to prepare clips for Remotion rendering.
 * RenderClips extend TimelineClip with frame-based timing and resolved transitions.
 * 
 * @param clips - Array of TimelineClips
 * @param tracks - Array of TimelineTracks (for row/order calculation)
 * @param transitions - Record of TransitionEntities
 * @param fps - Frames per second
 * @returns Array of RenderClips
 */
export function clipsToRenderClips(
  clips: TimelineClip[],
  tracks: TimelineTrack[],
  transitions: Record<string, TransitionEntity>,
  fps: number
): RenderClip[] {
  // Create track order map for row calculation
  const trackOrder = new Map<string, number>();
  tracks.forEach((track, index) => {
    trackOrder.set(track.id, index);
  });
  
  // PERF: Build transition lookup once O(M), then O(1) per clip
  const transitionLookup = buildTransitionLookup(transitions);

  return clips.map(clip => {
    const row = trackOrder.get(clip.trackId) ?? 0;
    const { inTransition, outTransition } = transitionLookup.get(clip.id) || {};
    
    return timelineClipToRenderClip(clip, fps, row, inTransition, outTransition);
  });
}

/**
 * Build a RenderClipState from the current store state (new format)
 * 
 * This replaces buildRenderState for components that want to work
 * with RenderClips instead of Overlays.
 */
export function buildRenderClipState(
  clips: TimelineClip[],
  tracks: TimelineTrack[],
  transitions: Record<string, TransitionEntity>,
  fps: number,
  dimensions: { width: number; height: number },
  backgroundColor: string
): RenderClipState {
  const renderClips = clipsToRenderClips(clips, tracks, transitions, fps);
  
  // Calculate total duration
  const maxEndTime = clips.reduce((max, clip) => {
    return Math.max(max, clip.startTime + clip.duration);
  }, 0);
  
  const durationInFrames = Math.ceil(maxEndTime * fps);
  
  return {
    clips: renderClips,
    durationInFrames: Math.max(1, durationInFrames),
    fps,
    width: dimensions.width,
    height: dimensions.height,
    backgroundColor,
  };
}

/**
 * Hook to get RenderClipState from the VideoEditorStore (new format)
 */
export function useRenderClipState(): RenderClipState {
    
  const clipsRecord = useVideoEditorStore((state: any) => state.clips) || {};
  const tracksRecord = useVideoEditorStore((state: any) => state.tracks) || {};
  const clips = Array.isArray(clipsRecord) ? clipsRecord : Object.values(clipsRecord) as TimelineClip[];
  const tracks = Array.isArray(tracksRecord) ? tracksRecord : Object.values(tracksRecord) as TimelineTrack[];
  const transitions = useVideoEditorStore((state: any) => state.transitions) || {};
  const fps = useVideoEditorStore((state: any) => state.fps) || 30;
  const aspectRatio = useVideoEditorStore((state: any) => state.aspectRatio) || '16:9';
  const resolution = useVideoEditorStore((state: any) => state.resolution) || '1080p';
  const backgroundColor = useVideoEditorStore((state: any) => state.backgroundColor) || '#000000';
  
  const resolutionHeights: Record<string, number> = {
    '720p': 720,
    '1080p': 1080,
    '1440p': 1440,
    '4k': 2160,
  };
  
  const aspectRatios: Record<string, number> = {
    '16:9': 16/9,
    '9:16': 9/16,
    '1:1': 1,
    '4:5': 4/5,
  };
  
  const height = resolutionHeights[resolution] || 1080;
  const ratio = aspectRatios[aspectRatio] || 16/9;
  const width = Math.round(height * ratio);
  
  const dimensions = { width, height };
  
  return buildRenderClipState(clips, tracks, transitions, fps, dimensions, backgroundColor);
}

export default {
  // Legacy Overlay API (deprecated)
  clipToOverlay,
  clipsToOverlays,
  clipsToOverlaysWithTracks,
  calculateDurationInFrames,
  buildRenderState,
  useRenderState,
  // New RenderClip API (recommended)
  clipsToRenderClips,
  buildRenderClipState,
  useRenderClipState,
};
