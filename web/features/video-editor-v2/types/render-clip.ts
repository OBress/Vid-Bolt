/**
 * RenderClip Types - TimelineClip-based rendering types for Remotion
 * 
 * These types bridge the gap between the editor's TimelineClip format
 * and Remotion's rendering needs. They extend TimelineClip with:
 * - Frame-based timing (fromFrame, durationInFrames)
 * - Row/track position for layering
 * - Resolved transitions with frame-based timing
 * 
 * This allows Remotion components to work directly with TimelineClip data
 * without needing the intermediate Overlay format.
 */

import type { TimelineClip, ClipTransform, MediaClipProperties, TextClipProperties, TransitionEntity, ClipType } from './timeline-v2';
import type { VideoTransition, AudioTransition, VideoTransitionType, AudioTransitionType, TransitionPosition, TransitionEasing } from './index';
import type { PropertyKeyframes } from './keyframes';
import type { Effect } from './effects';
import type { Mask } from './masks';
import type { AudioEffect } from './audio-effects';

/**
 * Video transition resolved with frame-based timing
 * Ready for Remotion's TransitionWrapper
 */
export interface ResolvedVideoTransition extends VideoTransition {
  /** Absolute start time in seconds */
  _absoluteStartTime: number;
  /** Absolute end time in seconds */
  _absoluteEndTime: number;
  /** Whether this is a between-clip transition */
  _isBetween: boolean;
}

/**
 * Audio transition resolved with frame-based timing
 * Ready for Remotion's SoundLayerContent
 */
export interface ResolvedAudioTransition extends AudioTransition {
  /** Absolute start time in seconds */
  _absoluteStartTime: number;
  /** Absolute end time in seconds */
  _absoluteEndTime: number;
  /** Whether this is a between-clip transition */
  _isBetween: boolean;
}

/**
 * RenderClip - TimelineClip extended for Remotion rendering
 * 
 * This is the format consumed by Remotion components directly.
 * It includes all TimelineClip properties plus:
 * - Frame-based timing for Remotion's <Sequence> components
 * - Track row for layering order
 * - Resolved transitions ready for rendering
 */
export interface RenderClip extends Omit<TimelineClip, 'transitions'> {
  // === FRAME-BASED TIMING ===
  /** Start frame (computed from startTime * fps) */
  fromFrame: number;
  /** Duration in frames (computed from duration * fps) */
  durationInFrames: number;
  /** Track row index for layering (lower = behind) */
  row: number;
  
  // === RESOLVED TRANSITIONS ===
  /** In transition with absolute timing for rendering */
  inTransition?: ResolvedVideoTransition;
  /** Out transition with absolute timing for rendering */
  outTransition?: ResolvedAudioTransition;
  
  // === RENDER-SPECIFIC OVERRIDES ===
  /** 
   * Adjusted start time for rendering (may differ from startTime if extended for transitions)
   * For between transitions, clips are extended to overlap
   */
  renderStartTime?: number;
  /** 
   * Adjusted duration for rendering (may differ from duration if extended for transitions)
   */
  renderDuration?: number;
  
  // === CONVENIENCE PROPERTIES ===
  /** Source URL for media clips (extracted from sourceId or media.src) */
  src?: string;
  /** Content for text/caption clips (extracted from text.content) */
  content?: string;
}

/**
 * RenderState - Complete render configuration for Remotion
 */
export interface RenderState {
  /** All clips converted to RenderClip format */
  clips: RenderClip[];
  /** Total duration in frames */
  durationInFrames: number;
  /** Frames per second */
  fps: number;
  /** Canvas width */
  width: number;
  /** Canvas height */
  height: number;
  /** Background color */
  backgroundColor: string;
}

// ============================================================
// CONVERSION UTILITIES
// ============================================================

/**
 * Convert a TransitionEntity to a VideoTransition for rendering
 */
export function transitionEntityToVideoTransition(
  entity: TransitionEntity,
  clipStartTime: number,
  clipDuration: number,
  fps: number
): ResolvedVideoTransition {
  const duration = entity.endTime - entity.startTime;
  
  return {
    type: entity.type as VideoTransitionType,
    duration,
    position: entity.position as TransitionPosition,
    easing: entity.easing,
    durationInFrames: Math.round(duration * fps),
    _absoluteStartTime: entity.startTime,
    _absoluteEndTime: entity.endTime,
    _isBetween: entity.position === 'between',
  };
}

/**
 * Convert a TransitionEntity to an AudioTransition for rendering
 */
export function transitionEntityToAudioTransition(
  entity: TransitionEntity,
  clipStartTime: number,
  clipDuration: number,
  fps: number
): ResolvedAudioTransition {
  const duration = entity.endTime - entity.startTime;
  
  return {
    type: entity.type as AudioTransitionType,
    duration,
    position: entity.position as TransitionPosition,
    easing: entity.easing,
    durationInFrames: Math.round(duration * fps),
    _absoluteStartTime: entity.startTime,
    _absoluteEndTime: entity.endTime,
    _isBetween: entity.position === 'between',
  };
}

/**
 * Convert a TimelineClip to a RenderClip
 * 
 * @param clip - The TimelineClip to convert
 * @param fps - Frames per second
 * @param row - Track row index for layering
 * @param inTransition - Optional in transition entity
 * @param outTransition - Optional out transition entity
 * @returns RenderClip ready for Remotion
 */
export function timelineClipToRenderClip(
  clip: TimelineClip,
  fps: number,
  row: number,
  inTransition?: TransitionEntity,
  outTransition?: TransitionEntity
): RenderClip {
  // Calculate base frame timing
  let renderStartTime = clip.startTime;
  let renderDuration = clip.duration;
  
  // For between transitions, extend clips to create overlap
  if (inTransition?.position === 'between') {
    // Second clip in crossfade: extend start backwards
    const extension = inTransition.endTime - inTransition.startTime;
    renderStartTime = clip.startTime - extension;
    renderDuration = clip.duration + extension;
  }
  
  if (outTransition?.position === 'between') {
    // First clip in crossfade: extend end forwards
    const extension = outTransition.endTime - outTransition.startTime;
    renderDuration = renderDuration + extension;
  }
  
  const fromFrame = Math.round(renderStartTime * fps);
  const durationInFrames = Math.round(renderDuration * fps);
  
  // Resolve transitions to rendering format
  const resolvedInTransition = inTransition && !inTransition.isAudio
    ? transitionEntityToVideoTransition(inTransition, clip.startTime, clip.duration, fps)
    : undefined;
    
  const resolvedOutTransition = outTransition && !outTransition.isAudio
    ? transitionEntityToVideoTransition(outTransition, clip.startTime, clip.duration, fps)
    : undefined;
  
  // Build the render clip
  const renderClip: RenderClip = {
    // Copy all TimelineClip properties
    id: clip.id,
    trackId: clip.trackId,
    startTime: clip.startTime,
    duration: clip.duration,
    type: clip.type,
    sourceId: clip.sourceId,
    label: clip.label,
    transform: clip.transform,
    media: clip.media,
    text: clip.text,
    linkedClipId: clip.linkedClipId,
    effects: clip.effects,
    audioEffects: clip.audioEffects,
    masks: clip.masks,
    greenscreen: clip.greenscreen,
    keyframes: clip.keyframes,
    styles: clip.styles,
    content: clip.content,
    thumbnailUrl: clip.thumbnailUrl,
    color: clip.color,
    data: clip.data,
    createdAt: clip.createdAt,
    updatedAt: clip.updatedAt,
    
    // Add frame-based timing
    fromFrame,
    durationInFrames,
    row,
    
    // Add render-specific timing
    renderStartTime,
    renderDuration,
    
    // Add resolved transitions
    inTransition: resolvedInTransition,
    outTransition: resolvedOutTransition as any, // Type assertion for video/audio difference
    
    // Add convenience properties
    src: clip.sourceId || clip.media?.src,
    content: clip.content || clip.text?.content,
  };
  
  return renderClip;
}

/**
 * Get the clip type category for rendering
 */
export function getRenderClipCategory(clip: RenderClip): 'video' | 'audio' | 'visual' | 'text' {
  switch (clip.type) {
    case 'video':
      return 'video';
    case 'audio':
    case 'sound':
      return 'audio';
    case 'text':
    case 'caption':
      return 'text';
    case 'image':
    case 'shape':
    case 'sticker':
    default:
      return 'visual';
  }
}

/**
 * Check if a RenderClip needs video rendering (has visual output)
 */
export function isVisualRenderClip(clip: RenderClip): boolean {
  return clip.type !== 'audio' && clip.type !== 'sound';
}

/**
 * Check if a RenderClip needs audio rendering
 */
export function isAudioRenderClip(clip: RenderClip): boolean {
  return clip.type === 'video' || clip.type === 'audio' || clip.type === 'sound';
}
