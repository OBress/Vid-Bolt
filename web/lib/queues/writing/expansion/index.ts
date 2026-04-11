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
  ScriptStyleConfig,
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

/** Progress callback for granular UI updates */
export type ExpansionProgressCallback = (
  beatIndex: number,
  totalBeats: number,
  step: string
) => Promise<void>;

export interface ExpansionOptions {
  userId: string;
  topic: string;
  genre: ScriptGenre;
  spine: Spine;
  dossier: ResearchDossier | null;
  assetRegistry: AssetRegistry;
  angle?: string;
  toneStyle?: string;
  targetAudience?: string;
  pov?: '1st' | '2nd' | '3rd';
  protagonistGender?: 'male' | 'female' | 'any';
  contentNiche?: string;
  openrouterModel?: string;
  qualityReviewModel?: string;
  /** Optional callback for reporting progress after each beat */
  onProgress?: ExpansionProgressCallback;
  /** User's style customization (banned phrases, word replacements, etc.) */
  styleConfig?: ScriptStyleConfig;
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
  const { userId, topic, genre, spine, dossier, assetRegistry, angle, onProgress } = options;

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

      // Build expansion context with enhanced parameters
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
        toneStyle: options.toneStyle,
        targetAudience: options.targetAudience,
        pov: options.pov,
        protagonistGender: options.protagonistGender,
        contentNiche: options.contentNiche,
        openrouterModel: options.openrouterModel,
        qualityReviewModel: options.qualityReviewModel,
        // Enhanced context for quality review
        spine,
        allPreviousBeats: [...expandedBeats],
        // OPTIMIZATION: Disable quality review to reduce LLM calls from 2-4 to 1 per beat
        // The improved prompts with 4-layer governance handle quality inline
        enableQualityReview: false,
        // System prompt override from user settings (only tone/persona context)
        expansionSystemPrompt: options.styleConfig?.systemPromptOverrides?.expansion,
        qualityPromptOverride: options.styleConfig?.systemPromptOverrides?.quality,
        rewritePromptOverride: options.styleConfig?.systemPromptOverrides?.rewrite,
      };

      // Expand the beat
      let expandedBeat = await expandSingleBeat(context);

      // Inject asset consistency markers
      expandedBeat = injectAssetConsistency(expandedBeat, relevantAssets, assetRegistry);

      // Update continuity state
      updateContinuityState(continuityTracker, beat, expandedBeat);

      expandedBeats.push(expandedBeat);

      // Report progress after each beat
      if (onProgress) {
        await onProgress(i + 1, spine.beats.length, `Expanding beat ${i + 1}/${spine.beats.length}`);
      }

    } catch (error) {
      console.error(`[Expansion] Error expanding beat ${i}:`, error);
      // Add placeholder beat
      expandedBeats.push(createFallbackBeat(beat, i));
    }
  }

  // Calculate total word count
  let totalWordCount = expandedBeats.reduce((sum, b) => sum + b.wordCount, 0);

  console.log(`[Expansion] Complete: ${totalWordCount} total words across ${expandedBeats.length} beats`);

  // Batch rate all beats in a single efficient LLM call
  console.log(`[Expansion] Running batch quality rating...`);
  if (onProgress) {
    await onProgress(spine.beats.length, spine.beats.length, 'Rating script quality...');
  }
  const { batchRateBeats, rewriteLowScorers } = await import('./quality-reviewer');
  const ratingResult = await batchRateBeats(userId, expandedBeats, {
    genre,
    // model intentionally omitted — batchRateBeats uses its own flash model by default
    qualityPromptOverride: options.styleConfig?.systemPromptOverrides?.quality,
  });
  
  // Assign scores to each beat
  expandedBeats.forEach((beat, i) => {
    beat.qualityScore = ratingResult.scores[i] ?? 6;
  });
  
  console.log(`[Expansion] Batch rating complete: avg score ${ratingResult.averageScore.toFixed(1)}/10`);

  // Enforce user style constraints (post-generation deterministic scan)
  if (options.styleConfig?.customBannedPhrases?.length || options.styleConfig?.customWordReplacements) {
    console.log(`[Expansion] Running style constraint enforcement...`);
    if (onProgress) {
      await onProgress(spine.beats.length, spine.beats.length, 'Enforcing style constraints...');
    }
    const { enforceStyleConstraints } = await import('./quality-reviewer');
    await enforceStyleConstraints(
      userId,
      expandedBeats,
      genre,
      options.styleConfig!,
      continuityTracker.currentState,
      options.qualityReviewModel,
    );
  }

  // Rewrite sections that scored below threshold (uses gemini-3-pro)
  console.log(`[Expansion] Checking for sections needing rewrite...`);
  if (onProgress) {
    await onProgress(spine.beats.length, spine.beats.length, 'Refining low-quality sections...');
  }
  const rewriteResults = await rewriteLowScorers(
    userId,
    expandedBeats,
    continuityTracker.currentState,
    {
      genre,
      toneStyle: options.toneStyle,
      targetAudience: options.targetAudience,
      pov: options.pov,
      protagonistGender: options.protagonistGender,
      contentNiche: options.contentNiche,
      model: options.qualityReviewModel,
      rewritePromptOverride: options.styleConfig?.systemPromptOverrides?.rewrite,
    },
  );
  
  // Apply rewrites and update word counts
  let rewriteCount = 0;
  rewriteResults.forEach((result, i) => {
    if (result.wasRewritten) {
      expandedBeats[i].narration = result.narration;
      expandedBeats[i].qualityScore = result.qualityScore;
      expandedBeats[i].wordCount = result.narration.split(/\s+/).length;
      rewriteCount++;
    }
  });
  
  if (rewriteCount > 0) {
    totalWordCount = expandedBeats.reduce((sum, b) => sum + b.wordCount, 0);
    console.log(`[Expansion] Rewrote ${rewriteCount} sections. New total: ${totalWordCount} words`);
  }

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
    narration: beat.contentSummary || '',
    visualCallouts: [],
    audioNotes: {
      musicMood: beat.toneEnergy.mood,
    },
    pacingNotes: {},
    wordCount: (beat.contentSummary || '').split(/\s+/).length,
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
