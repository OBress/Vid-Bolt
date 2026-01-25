/**
 * Query Deduplicator
 * ============================================================================
 * Per-video semantic deduplication to prevent scraping the same content twice.
 * Uses text similarity and optional vector embeddings.
 */

import {
  VideoQueryTracker,
  GeneratedQuery,
  DedupResult,
  SEMANTIC_DEDUP_THRESHOLD,
} from './types';

// =============================================================================
// TRACKER MANAGEMENT
// =============================================================================

/**
 * Create a new query tracker for a video
 */
export function createVideoTracker(videoId: string): VideoQueryTracker {
  return {
    videoId,
    generatedQueries: new Map(),
    queryEmbeddings: new Map(),
    queryHashes: new Set(),
  };
}

/**
 * Generate a hash for exact deduplication
 */
function hashQuery(query: string, source: string): string {
  // Simple hash: lowercase, remove extra spaces, combine with source
  const normalized = query.toLowerCase().replace(/\s+/g, ' ').trim();
  return `${source}:${normalized}`;
}

/**
 * Calculate text similarity using Jaccard index
 * (Simple approach without needing embeddings)
 */
function textSimilarity(a: string, b: string): number {
  const aWords = new Set(a.toLowerCase().split(/\s+/));
  const bWords = new Set(b.toLowerCase().split(/\s+/));
  
  const intersection = new Set([...aWords].filter(x => bWords.has(x)));
  const union = new Set([...aWords, ...bWords]);
  
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

// =============================================================================
// DEDUPLICATION FUNCTIONS
// =============================================================================

/**
 * Check if a query is a duplicate
 */
export function checkDuplicate(
  tracker: VideoQueryTracker,
  query: string,
  source: string
): DedupResult {
  const hash = hashQuery(query, source);
  
  // Check exact match first
  if (tracker.queryHashes.has(hash)) {
    return {
      isDuplicate: true,
      duplicateType: 'exact',
    };
  }
  
  // Check semantic similarity against all queries with same source
  const sameSourceQueries = Array.from(tracker.generatedQueries.values())
    .filter(q => q.source === source);
  
  for (const existing of sameSourceQueries) {
    const similarity = textSimilarity(query, existing.query);
    if (similarity >= SEMANTIC_DEDUP_THRESHOLD) {
      return {
        isDuplicate: true,
        duplicateType: 'semantic',
        similarQueryId: existing.id,
        similarityScore: similarity,
      };
    }
  }
  
  return { isDuplicate: false };
}

/**
 * Add a query to the tracker
 */
export function addToTracker(
  tracker: VideoQueryTracker,
  query: GeneratedQuery
): void {
  const hash = hashQuery(query.query, query.source);
  
  tracker.generatedQueries.set(query.id, query);
  tracker.queryHashes.add(hash);
}

/**
 * Get all generated queries from tracker
 */
export function getTrackerQueries(tracker: VideoQueryTracker): GeneratedQuery[] {
  return Array.from(tracker.generatedQueries.values());
}

/**
 * Get queries grouped by source
 */
export function getQueriesBySource(tracker: VideoQueryTracker): {
  serper: GeneratedQuery[];
  wikimedia: GeneratedQuery[];
  pexels: GeneratedQuery[];
  youtube: GeneratedQuery[];
} {
  const queries = getTrackerQueries(tracker);
  
  return {
    serper: queries.filter(q => q.source === 'serper'),
    wikimedia: queries.filter(q => q.source === 'wikimedia'),
    pexels: queries.filter(q => q.source === 'pexels'),
    youtube: queries.filter(q => q.source === 'youtube'),
  };
}

/**
 * Get deduplication stats
 */
export function getTrackerStats(tracker: VideoQueryTracker): {
  totalQueries: number;
  bySource: Record<string, number>;
  byMediaType: { image: number; video: number };
} {
  const queries = getTrackerQueries(tracker);
  
  return {
    totalQueries: queries.length,
    bySource: {
      serper: queries.filter(q => q.source === 'serper').length,
      wikimedia: queries.filter(q => q.source === 'wikimedia').length,
      pexels: queries.filter(q => q.source === 'pexels').length,
      youtube: queries.filter(q => q.source === 'youtube').length,
    },
    byMediaType: {
      image: queries.filter(q => q.mediaType === 'image').length,
      video: queries.filter(q => q.mediaType === 'video').length,
    },
  };
}
