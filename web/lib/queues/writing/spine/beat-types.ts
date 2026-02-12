/**
 * Beat Types and Structures
 * ============================================================================
 * Beat type definitions and factory functions for spine generation.
 */

import type { Beat, BeatType } from '../types';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Beat specification from AI generation (before timing)
 */
export interface BeatSpec {
  index: number;
  type: BeatType;
  section: string;
  contentSummary: string;
  keyPoints: string[];
  factIds: string[];
  quoteIds: string[];
  timelineIds?: string[];
  theoryIds?: string[];
  toneEnergy: {
    mood: string;
    pacing: 'slow' | 'medium' | 'fast';
    energyRelativeToPrevious: 'lower' | 'same' | 'higher';
  };
  engagementFunction: string;
  // These may be added by engagement mechanics
  opensLoop?: boolean;
  closesLoop?: boolean;
  loopId?: string;
  isPatternInterrupt?: boolean;
  callbackToBeatIndex?: number;
}

/**
 * Timing information for a beat
 */
export interface BeatTiming {
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
}

// ============================================================================
// BEAT TYPE DESCRIPTIONS
// ============================================================================

/**
 * Descriptions for each beat type
 */
export const BEAT_TYPE_DESCRIPTIONS: Record<BeatType, {
  purpose: string;
  typicalDuration: string;
  engagementFunction: string;
}> = {
  hook: {
    purpose: 'Grab attention immediately',
    typicalDuration: '5-15 seconds',
    engagementFunction: 'Create curiosity gap or surprise',
  },
  setup: {
    purpose: 'Establish context and stakes',
    typicalDuration: '20-45 seconds',
    engagementFunction: 'Make viewer understand why they should care',
  },
  information: {
    purpose: 'Deliver key facts or exposition',
    typicalDuration: '30-60 seconds',
    engagementFunction: 'Provide value and build authority',
  },
  evidence: {
    purpose: 'Support claims with proof',
    typicalDuration: '20-40 seconds',
    engagementFunction: 'Build credibility and trust',
  },
  transition: {
    purpose: 'Move between topics smoothly',
    typicalDuration: '10-20 seconds',
    engagementFunction: 'Maintain flow and signal change',
  },
  escalation: {
    purpose: 'Build tension or raise stakes',
    typicalDuration: '30-45 seconds',
    engagementFunction: 'Keep viewer on edge of seat',
  },
  climax: {
    purpose: 'Deliver the main revelation or payoff',
    typicalDuration: '30-60 seconds',
    engagementFunction: 'Satisfy the promise made in hook',
  },
  resolution: {
    purpose: 'Wrap up and provide closure',
    typicalDuration: '20-45 seconds',
    engagementFunction: 'Leave viewer satisfied',
  },
  callback: {
    purpose: 'Reference earlier content',
    typicalDuration: '15-30 seconds',
    engagementFunction: 'Reward attentive viewers, create cohesion',
  },
  pattern_interrupt: {
    purpose: 'Break the pattern to re-engage',
    typicalDuration: '15-30 seconds',
    engagementFunction: 'Reset attention and prevent dropout',
  },
};

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a full Beat object from a BeatSpec and timing
 */
export function createBeatFromSpec(spec: BeatSpec, timing: BeatTiming): Beat {
  return {
    index: spec.index,
    timing: {
      startSeconds: timing.startSeconds,
      endSeconds: timing.endSeconds,
      durationSeconds: timing.durationSeconds,
    },
    classification: {
      type: spec.type,
      section: spec.section,
      engagementFunction: spec.engagementFunction,
    },
    contentSummary: spec.contentSummary,
    researchReferences: {
      factIds: spec.factIds || [],
      quoteIds: spec.quoteIds || [],
      timelineIds: spec.timelineIds || [],
      theoryIds: spec.theoryIds || [],
    },
    keyPoints: spec.keyPoints || [],
    toneEnergy: {
      mood: spec.toneEnergy.mood || 'neutral',
      pacing: spec.toneEnergy.pacing || 'medium',
      energyRelativeToPrevious: spec.toneEnergy.energyRelativeToPrevious || 'same',
    },
    transitions: {
      fromPrevious: spec.index === 0 ? 'Opening' : 'Continue from previous',
      toNext: 'Lead into next beat',
    },
    engagement: {
      opensLoop: spec.opensLoop || false,
      closesLoop: spec.closesLoop || false,
      loopId: spec.loopId,
      isPatternInterrupt: spec.isPatternInterrupt || spec.type === 'pattern_interrupt',
      callbackToBeatIndex: spec.callbackToBeatIndex,
    },
  };
}

/**
 * Create an empty beat as placeholder
 */
export function createEmptyBeat(index: number, timing: BeatTiming): Beat {
  return {
    index,
    timing,
    classification: {
      type: 'information',
      section: 'Main',
      engagementFunction: 'Continue narrative',
    },
    contentSummary: '',
    researchReferences: {
      factIds: [],
      quoteIds: [],
      timelineIds: [],
      theoryIds: [],
    },
    keyPoints: [],
    toneEnergy: {
      mood: 'neutral',
      pacing: 'medium',
      energyRelativeToPrevious: 'same',
    },
    transitions: {
      fromPrevious: '',
      toNext: '',
    },
    engagement: {
      opensLoop: false,
      closesLoop: false,
      isPatternInterrupt: false,
    },
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if a beat type is a structural anchor (must exist)
 */
export function isStructuralAnchor(type: BeatType): boolean {
  return ['hook', 'climax', 'resolution'].includes(type);
}

/**
 * Check if a beat type typically comes early in the video
 */
export function isEarlyBeatType(type: BeatType): boolean {
  return ['hook', 'setup'].includes(type);
}

/**
 * Check if a beat type typically comes late in the video
 */
export function isLateBeatType(type: BeatType): boolean {
  return ['climax', 'resolution'].includes(type);
}

/**
 * Get recommended position for a beat type (0-1)
 */
export function getRecommendedPosition(type: BeatType): { min: number; max: number } {
  const positions: Record<BeatType, { min: number; max: number }> = {
    hook: { min: 0, max: 0.05 },
    setup: { min: 0.03, max: 0.15 },
    information: { min: 0.10, max: 0.75 },
    evidence: { min: 0.15, max: 0.80 },
    transition: { min: 0.10, max: 0.90 },
    escalation: { min: 0.30, max: 0.75 },
    climax: { min: 0.65, max: 0.85 },
    resolution: { min: 0.80, max: 1.0 },
    callback: { min: 0.50, max: 0.95 },
    pattern_interrupt: { min: 0.15, max: 0.85 },
  };
  return positions[type];
}

/**
 * Validate beat type for position
 */
export function validateBeatPosition(beat: Beat, totalBeats: number): boolean {
  const position = beat.index / totalBeats;
  const recommended = getRecommendedPosition(beat.classification.type);
  return position >= recommended.min && position <= recommended.max;
}

/**
 * Suggest a beat type for a given position
 */
export function suggestBeatType(position: number, currentEnergy: 'low' | 'medium' | 'high'): BeatType {
  if (position < 0.03) return 'hook';
  if (position < 0.12) return 'setup';
  if (position > 0.90) return 'resolution';
  if (position > 0.75) return currentEnergy === 'high' ? 'climax' : 'resolution';
  if (position > 0.65 && currentEnergy === 'high') return 'climax';
  if (position > 0.50 && currentEnergy === 'low') return 'escalation';
  if (position > 0.40) return 'information';
  return 'information';
}
