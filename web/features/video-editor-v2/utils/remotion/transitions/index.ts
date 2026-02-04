/**
 * Remotion Transitions Module
 * 
 * All transition types are handled uniformly (Premiere Pro style):
 * - crossfade, fade, wipe, slide, zoom, blur, iris - ALL work the same
 * - Clips stay in place on the timeline
 * - For between transitions, clips are extended during rendering to overlap
 * - TransitionWrapper applies the visual effect during the overlap period
 * 
 * Rendering:
 * - Video/Image: TransitionWrapper in layer.tsx (applies opacity, transform, clipPath)
 * - Audio: SoundLayerContent (applies volume fading)
 * 
 * Timing:
 * - _absoluteStartTime: when the transition effect begins
 * - _absoluteEndTime: when the transition effect ends
 */

// Re-export transition types from the main types file
export type { VideoTransitionType, AudioTransitionType, TransitionEasing } from '../../../types';
