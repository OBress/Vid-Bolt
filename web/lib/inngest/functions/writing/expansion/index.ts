/**
 * Script Expansion Module - Main Orchestrator
 * ============================================================================
 * Expands the spine into full narration scripts beat-by-beat.
 */

import type { 
  Spine, 
  Beat,
  ExpandedBeat,
  ContinuityState,
  AssetRegistry,
  ResearchDossier,
  ScriptGenre,
} from '../types';
import { getBannedPhrases } from '../config';
import { expandSingleBeat, type BeatExpansionContext } from './beat-writer';
import { 
  initializeContinuityState, 
  updateContinuityState, 
  type ContinuityTracker,
} from './continuity-tracker';
import { 
  injectAssetConsistency, 
  getRelevantAssets,
} from './consistency-injector';

// ============================================================================
// TYPES
// ============================================================================

export interface ExpansionOptions {
  userId: string;
  topic: string;
  genre: ScriptGenre;
  spine: Spine;
  dossier: ResearchDossier | null;
  assetRegistry: AssetRegistry;
  angle?: string;
}

export interface ExpansionResult {
  expandedBeats: ExpandedBeat[];
  totalWordCount: number;
  finalContinuityState: ContinuityState;
}

// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================

/**
 * Expand the spine into full narration scripts.
 * Processes beats sequentially to maintain continuity.
 */
export async function expandSpineToScript(
  options: ExpansionOptions
): Promise<ExpansionResult> {
  const { userId, topic, genre, spine, dossier, assetRegistry, angle } = options;

  console.log(`[Expansion] Starting script expansion for ${spine.beatCount} beats`);

  const expandedBeats: ExpandedBeat[] = [];
  const bannedPhrases = getBannedPhrases(genre);
  
  // Initialize continuity tracking
  const continuityTracker: ContinuityTracker = initializeContinuityState(topic, angle);

  // Process beats sequentially (need previous context for each)
  for (let i = 0; i < spine.beats.length; i++) {
    const beat = spine.beats[i];
    const previousBeat = i > 0 ? expandedBeats[i - 1] : null;

    console.log(`[Expansion] Expanding beat ${i + 1}/${spine.beats.length}: ${beat.classification.type}`);

    try {
      // Get relevant assets for this beat
      const relevantAssets = getRelevantAssets(beat, assetRegistry, dossier);

      // Build expansion context
      const context: BeatExpansionContext = {
        userId,
        beat,
        beatIndex: i,
        totalBeats: spine.beats.length,
        previousBeatEnding: previousBeat?.narration.slice(-200) || '',
        continuityState: continuityTracker.currentState,
        relevantAssets,
        dossier,
        bannedPhrases,
        genre,
      };

      // Expand the beat
      let expandedBeat = await expandSingleBeat(context);

      // Inject asset consistency markers
      expandedBeat = injectAssetConsistency(expandedBeat, relevantAssets, assetRegistry);

      // Update continuity state
      updateContinuityState(continuityTracker, beat, expandedBeat);

      expandedBeats.push(expandedBeat);

    } catch (error) {
      console.error(`[Expansion] Error expanding beat ${i}:`, error);
      // Add placeholder beat
      expandedBeats.push(createFallbackBeat(beat, i));
    }
  }

  // Calculate total word count
  const totalWordCount = expandedBeats.reduce((sum, b) => sum + b.wordCount, 0);

  console.log(`[Expansion] Complete: ${totalWordCount} total words across ${expandedBeats.length} beats`);

  return {
    expandedBeats,
    totalWordCount,
    finalContinuityState: continuityTracker.currentState,
  };
}

/**
 * Create a fallback expanded beat when expansion fails
 */
function createFallbackBeat(beat: Beat, beatIndex: number): ExpandedBeat {
  return {
    beatIndex,
    narration: beat.contentSummary,
    visualCallouts: [],
    audioNotes: {
      musicMood: beat.toneEnergy.mood,
    },
    pacingNotes: {},
    wordCount: beat.contentSummary.split(/\s+/).length,
    factsUsed: beat.researchReferences.factIds,
  };
}

// ============================================================================
// BATCH EXPANSION (for parallel processing if needed later)
// ============================================================================

/**
 * Expand multiple non-adjacent beats in parallel.
 * Use with caution - continuity may be affected.
 */
export async function expandBeatsInParallel(
  beats: Beat[],
  contexts: BeatExpansionContext[],
  batchSize: number = 3
): Promise<ExpandedBeat[]> {
  const results: ExpandedBeat[] = [];

  for (let i = 0; i < beats.length; i += batchSize) {
    const batch = contexts.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(ctx => expandSingleBeat(ctx))
    );
    results.push(...batchResults);
  }

  return results;
}
