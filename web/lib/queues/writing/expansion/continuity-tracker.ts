/**
 * Continuity Tracker
 * ============================================================================
 * Tracks story state between beats for consistency.
 */

import type { 
  Beat, 
  ExpandedBeat, 
  ContinuityState,
} from '../types';
import {
  extractDistinctivePhrases,
  extractSentenceOpeners,
  extractTransitionPhrases,
} from './context-builder';

// ============================================================================
// TYPES
// ============================================================================

export interface ContinuityTracker {
  currentState: ContinuityState;
  history: ContinuityState[];
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize a new continuity tracker
 */
export function initializeContinuityState(
  topic: string,
  angle?: string
): ContinuityTracker {
  const initialState: ContinuityState = {
    storySummary: angle 
      ? `A video about ${topic}, focusing on: ${angle}`
      : `A video about ${topic}`,
    coveredContent: [],
    establishedFacts: [],
    introducedCharacters: [],
    narrativePromises: [],
    establishedTone: '',
    usedFactIds: [],
    // Language pattern tracking
    usedPhrases: [],
    usedOpeners: [],
    usedTransitions: [],
  };

  return {
    currentState: initialState,
    history: [initialState],
  };
}

// ============================================================================
// STATE UPDATES
// ============================================================================

/**
 * Update continuity state after processing a beat
 */
export function updateContinuityState(
  tracker: ContinuityTracker,
  beat: Beat,
  expandedBeat: ExpandedBeat
): void {
  // Extract language patterns from the beat
  const newPhrases = extractDistinctivePhrases(expandedBeat.narration);
  const newOpeners = extractSentenceOpeners(expandedBeat.narration);
  const newTransitions = extractTransitionPhrases(expandedBeat.narration);

  const newState: ContinuityState = {
    ...tracker.currentState,
    
    // Update covered content
    coveredContent: [
      ...tracker.currentState.coveredContent,
      beat.contentSummary.substring(0, 100),
    ],
    
    // Add established facts from this beat
    establishedFacts: [
      ...tracker.currentState.establishedFacts,
      ...beat.keyPoints.slice(0, 2),
    ].slice(-10), // Keep last 10
    
    // Track introduced characters from visual callouts
    introducedCharacters: updateIntroducedCharacters(
      tracker.currentState.introducedCharacters,
      expandedBeat.visualCallouts
    ),
    
    // Track narrative promises (open loops)
    narrativePromises: updateNarrativePromises(
      tracker.currentState.narrativePromises,
      beat
    ),
    
    // Update established tone
    establishedTone: beat.toneEnergy.mood,
    
    // Track used fact IDs
    usedFactIds: [
      ...tracker.currentState.usedFactIds,
      ...expandedBeat.factsUsed,
    ],

    // Track language patterns for repetition prevention
    usedPhrases: [
      ...tracker.currentState.usedPhrases,
      ...newPhrases,
    ].slice(-50), // Keep last 50 phrases
    
    usedOpeners: [
      ...tracker.currentState.usedOpeners,
      ...newOpeners,
    ].slice(-30), // Keep last 30 openers
    
    usedTransitions: [
      ...tracker.currentState.usedTransitions,
      ...newTransitions,
    ].slice(-20), // Keep last 20 transitions
  };

  tracker.currentState = newState;
  tracker.history.push(newState);
}

/**
 * Update introduced characters list
 */
function updateIntroducedCharacters(
  current: string[],
  visualCallouts: ExpandedBeat['visualCallouts']
): string[] {
  const newCharacters = visualCallouts
    .filter(c => c.assetId.startsWith('CHAR-'))
    .map(c => c.assetId);
  
  return [...new Set([...current, ...newCharacters])];
}

/**
 * Update narrative promises based on open/close loops
 */
function updateNarrativePromises(
  current: string[],
  beat: Beat
): string[] {
  const promises = [...current];

  if (beat.engagement.opensLoop && beat.engagement.loopId) {
    promises.push(beat.engagement.loopId);
  }

  if (beat.engagement.closesLoop && beat.engagement.loopId) {
    const index = promises.indexOf(beat.engagement.loopId);
    if (index > -1) {
      promises.splice(index, 1);
    }
  }

  return promises;
}

// ============================================================================
// STATE QUERIES
// ============================================================================

/**
 * Check if a fact has already been used
 */
export function isFactUsed(tracker: ContinuityTracker, factId: string): boolean {
  return tracker.currentState.usedFactIds.includes(factId);
}

/**
 * Check if a character has been introduced
 */
export function isCharacterIntroduced(tracker: ContinuityTracker, characterId: string): boolean {
  return tracker.currentState.introducedCharacters.includes(characterId);
}

/**
 * Get open narrative promises (unclosed loops)
 */
export function getOpenPromises(tracker: ContinuityTracker): string[] {
  return [...tracker.currentState.narrativePromises];
}

/**
 * Get recent covered content for context window
 */
export function getRecentContext(tracker: ContinuityTracker, maxItems: number = 5): string[] {
  return tracker.currentState.coveredContent.slice(-maxItems);
}

/**
 * Generate a summary of current story state
 */
export function generateStateSummary(tracker: ContinuityTracker): string {
  const state = tracker.currentState;
  
  return `STORY SUMMARY: ${state.storySummary}

COVERED SO FAR:
${state.coveredContent.slice(-5).map((c, i) => `${i + 1}. ${c}`).join('\n')}

ESTABLISHED FACTS:
${state.establishedFacts.slice(-5).join(', ')}

INTRODUCED CHARACTERS: ${state.introducedCharacters.join(', ') || 'None yet'}

OPEN QUESTIONS/PROMISES: ${state.narrativePromises.join(', ') || 'None'}

CURRENT TONE: ${state.establishedTone || 'Not yet established'}`;
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate continuity - check for problems
 */
export function validateContinuity(tracker: ContinuityTracker): {
  isValid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // Check for too many open promises (unclosed loops)
  if (tracker.currentState.narrativePromises.length > 3) {
    issues.push(`Too many open loops: ${tracker.currentState.narrativePromises.length}`);
  }

  // Check for empty story summary (shouldn't happen)
  if (!tracker.currentState.storySummary) {
    issues.push('Story summary is empty');
  }

  return {
    isValid: issues.length === 0,
    issues,
  };
}
