/**
 * Query Generator
 * ============================================================================
 * Main orchestration for generating media search queries from video scenes.
 * Processes scenes in batches, applies classification, deduplication, and
 * produces source-grouped queries ready for scraping.
 */

import { v4 as uuidv4 } from 'uuid';
import { classifySceneBatch } from './classifier';
import {
  createVideoTracker,
  checkDuplicate,
  addToTracker,
  getQueriesBySource,
  getTrackerStats,
} from './deduplicator';
import {
  QueryGenerationInput,
  QueryGenerationResult,
  SceneInput,
  SceneBatchResult,
  GeneratedQuery,
  VideoQueryTracker,
  MediaDensityLevel,
  DEFAULT_BATCH_SIZE,
} from './types';

// =============================================================================
// MAIN GENERATOR
// =============================================================================

/**
 * Generate media queries from video scenes
 * Processes in batches to avoid overwhelming API calls
 */
export async function generateQueries(
  input: QueryGenerationInput
): Promise<QueryGenerationResult> {
  const startTime = Date.now();
  
  // Create tracker for this video
  const tracker = createVideoTracker(input.videoId);
  
  // Extract context for classification
  const context = buildContext(input);
  
  // Process scenes in batches
  const batches = chunkScenes(input.scenes, DEFAULT_BATCH_SIZE);
  const batchResults: SceneBatchResult[] = [];
  
  let totalSkippedDuplicates = 0;
  let totalRejectedNonStock = 0;
  
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const result = await processSceneBatch(
      input.userId,
      batch,
      tracker,
      context
    );
    
    batchResults.push(result);
    totalSkippedDuplicates += result.skippedDuplicates;
    totalRejectedNonStock += result.rejectedNonStock;
    
    // Update context with previously generated queries for dedup hints
    context.previousQueries = Array.from(tracker.generatedQueries.values())
      .map(q => q.query);
  }
  
  // Compile final result
  const queriesBySource = getQueriesBySource(tracker);
  const stats = getTrackerStats(tracker);
  
  return {
    videoId: input.videoId,
    queriesBySource,
    totalQueries: stats.totalQueries,
    queryCountByType: stats.byMediaType,
    deduplicationStats: {
      exactDuplicatesSkipped: totalSkippedDuplicates,
      semanticDuplicatesSkipped: 0, // Could track this separately
    },
    stockSafeStats: {
      approved: stats.totalQueries,
      rejected: totalRejectedNonStock,
    },
    metadata: {
      totalProcessingTimeMs: Date.now() - startTime,
      scenesProcessed: input.scenes.length,
      batchCount: batches.length,
    },
  };
}

/**
 * Generate queries for a single scene (for testing/preview)
 */
export async function generateQueriesForScene(
  userId: string,
  scene: SceneInput,
  existingQueries?: string[]
): Promise<GeneratedQuery[]> {
  const tracker = createVideoTracker('preview');
  
  const context = {
    assetNames: [] as string[],
    researchEntities: [] as string[],
    previousQueries: existingQueries || [],
    mediaDensity: 'images_heavy_video' as MediaDensityLevel,
  };
  
  const result = await processSceneBatch(
    userId,
    [scene],
    tracker,
    context
  );
  
  return result.queries;
}

// =============================================================================
// BATCH PROCESSING
// =============================================================================

async function processSceneBatch(
  userId: string,
  scenes: SceneInput[],
  tracker: VideoQueryTracker,
  context: {
    assetNames: string[];
    researchEntities: string[];
    previousQueries: string[];
    mediaDensity: MediaDensityLevel;
  }
): Promise<SceneBatchResult> {
  const startTime = Date.now();
  
  // Get classifications for all scenes in batch
  // NOTE: The classifier now returns a FLAT array of all queries across all scenes,
  // not one classification per scene. Each query already has its source/mediaType set.
  const classifications = await classifySceneBatch(userId, scenes, context);
  
  const queries: GeneratedQuery[] = [];
  let skippedDuplicates = 0;
  let rejectedNonStock = 0;
  
  // Process each classification (each is already an individual query)
  for (const classification of classifications) {
    // Skip non-stock-safe content
    if (!classification.isStockSafe) {
      rejectedNonStock++;
      continue;
    }
    
    // Each classification.suggestedQueries now contains a single query
    for (const suggestedQuery of classification.suggestedQueries) {
      // Check for duplicates
      const dedupResult = checkDuplicate(tracker, suggestedQuery, classification.source);
      
      if (dedupResult.isDuplicate) {
        skippedDuplicates++;
        continue;
      }
      
      // Create the query object - beatIndex comes from the first scene as fallback
      const query: GeneratedQuery = {
        id: uuidv4(),
        query: suggestedQuery,
        mediaType: classification.mediaType,
        source: classification.source,
        sourceReason: classification.reasoning,
        context: {
          beatIndex: scenes[0]?.beatIndex ?? 0, // Associate with batch
          narrativeSummary: classification.reasoning.substring(0, 100),
        },
        stockSafe: {
          isValid: true,
          confidence: classification.confidence,
          reasoning: classification.stockSafeReasoning,
        },
        specificityScore: classification.specificityScore,
        filters: classification.recommendedFilters,
      };
      
      // Add to tracker
      addToTracker(tracker, query);
      queries.push(query);
    }
  }
  
  return {
    beatRange: {
      start: scenes[0]?.beatIndex ?? 0,
      end: scenes[scenes.length - 1]?.beatIndex ?? 0,
    },
    queries,
    skippedDuplicates,
    rejectedNonStock,
    metadata: {
      processingTimeMs: Date.now() - startTime,
      totalBeatsProcessed: scenes.length,
    },
  };
}

// =============================================================================
// HELPERS
// =============================================================================

function buildContext(input: QueryGenerationInput): {
  assetNames: string[];
  researchEntities: string[];
  previousQueries: string[];
  mediaDensity: MediaDensityLevel;
} {
  const assetNames: string[] = [];
  
  if (input.assetRegistry) {
    assetNames.push(
      ...input.assetRegistry.characters.map(c => c.name),
      ...input.assetRegistry.locations.map(l => l.name),
      ...input.assetRegistry.objects.map(o => o.name)
    );
  }
  
  const researchEntities = input.researchEntities?.map(e => e.name) || [];
  
  return {
    assetNames,
    researchEntities,
    previousQueries: [],
    mediaDensity: input.mediaDensity || 'images_heavy_video',
  };
}

function chunkScenes(scenes: SceneInput[], batchSize: number): SceneInput[][] {
  const batches: SceneInput[][] = [];
  
  for (let i = 0; i < scenes.length; i += batchSize) {
    batches.push(scenes.slice(i, i + batchSize));
  }
  
  return batches;
}

// =============================================================================
// SCENE CONVERSION HELPERS
// =============================================================================

/**
 * Convert Universal Script output to SceneInput array
 */
export function convertToSceneInputs(
  spine: {
    beats: Array<{
      index: number;
      classification: { type: string };
      contentSummary: string;
      keyPoints?: string[];
      timing?: { durationSeconds: number };
      researchReferences?: { factIds: string[] };
    }>;
  },
  expandedBeats?: Array<{
    beatIndex: number;
    narration: string;
  }>
): SceneInput[] {
  return spine.beats.map(beat => {
    const expanded = expandedBeats?.find(e => e.beatIndex === beat.index);
    
    return {
      beatIndex: beat.index,
      beatType: beat.classification.type,
      contentSummary: beat.contentSummary,
      keyPoints: beat.keyPoints || [],
      narration: expanded?.narration || beat.contentSummary,
      durationSeconds: beat.timing?.durationSeconds || 10,
      factIds: beat.researchReferences?.factIds,
    };
  });
}
