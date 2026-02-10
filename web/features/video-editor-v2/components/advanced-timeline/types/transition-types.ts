/**
 * Transition Types — Re-exports from the canonical type system.
 * This file exists for backwards compatibility with transition-overlay components.
 */

export type {
  TransitionEntity,
  UnifiedDragState,
  UnifiedDragType,
} from '../../../types/timeline-v2';

export {
  VideoTransitionType,
  AudioTransitionType,
  OverlayType,
} from '../../../types';

export type {
  VideoTransition,
  AudioTransition,
  TransitionEasing,
} from '../../../types';

// Constants used by transition overlay components
export const DEFAULT_TRANSITION_DURATION = 30; // frames
export const MAX_TRANSITION_RATIO = 0.5;

// Backwards compatibility aliases
export type TimelineTransition = TransitionEntity;
export const getTransitionDuration = (transition: TransitionEntity): number => {
  return (transition as any).duration ?? DEFAULT_TRANSITION_DURATION;
};

// Re-import TransitionEntity for use in this file
import type { TransitionEntity } from '../../../types/timeline-v2';
