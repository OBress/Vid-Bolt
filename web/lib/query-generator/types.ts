/**
 * Query Generator Types
 * ============================================================================
 * Type definitions for the media query generation system that analyzes
 * video scenes and narrative content to generate stock media search queries.
 */

// =============================================================================
// MEDIA SOURCE TYPES
// =============================================================================

/**
 * Supported media sources for scraping
 */
export type ImageSource = 'serper' | 'wikimedia';
export type VideoSource = 'pexels' | 'youtube';
export type MediaSource = ImageSource | VideoSource;

/**
 * Media type classification
 */
export type MediaType = 'image' | 'video';

/**
 * Media density levels for query generation
 * Controls how many and what type of queries are generated
 */
export type MediaDensityLevel = 
  | 'none'              // No stock media queries
  | 'images_only'        // Only image queries (serper)
  | 'images_minimal_video' // Images + few video queries
  | 'images_heavy_video';  // Images + lots of video queries

/**
 * Configuration for each media density level
 */
export const MEDIA_DENSITY_CONFIG: Record<MediaDensityLevel, {
  generateQueries: boolean;
  includeImages: boolean;
  includeVideos: boolean;
  imageQueriesPerScene: number;
  videoQueriesPerScene: number;
  totalMinQueries: number;
}> = {
  none: {
    generateQueries: false,
    includeImages: false,
    includeVideos: false,
    imageQueriesPerScene: 0,
    videoQueriesPerScene: 0,
    totalMinQueries: 0,
  },
  images_only: {
    generateQueries: true,
    includeImages: true,
    includeVideos: false,
    imageQueriesPerScene: 6,
    videoQueriesPerScene: 0,
    totalMinQueries: 6,
  },
  images_minimal_video: {
    generateQueries: true,
    includeImages: true,
    includeVideos: true,
    imageQueriesPerScene: 6,
    videoQueriesPerScene: 2,
    totalMinQueries: 8,
  },
  images_heavy_video: {
    generateQueries: true,
    includeImages: true,
    includeVideos: true,
    imageQueriesPerScene: 6,
    videoQueriesPerScene: 6,
    totalMinQueries: 12,
  },
};

// =============================================================================
// QUERY TYPES
// =============================================================================

/**
 * Generated search query with source routing
 */
export interface GeneratedQuery {
  /** Unique ID for deduplication tracking */
  id: string;
  
  /** The actual search query text */
  query: string;
  
  /** Media type (image or video) */
  mediaType: MediaType;
  
  /** Assigned source for this query */
  source: MediaSource;
  
  /** Why this source was chosen */
  sourceReason: string;
  
  /** Original scene/beat context */
  context: {
    /** Scene/beat index */
    beatIndex: number;
    /** Brief narrative context */
    narrativeSummary: string;
  };
  
  /** Stock-safe validation */
  stockSafe: {
    isValid: boolean;
    confidence: number; // 0-1
    reasoning?: string;
  };
  
  /** Specificity score (1-10) for source routing */
  specificityScore: number;
  
  /** Source-specific filters/parameters */
  filters?: {
    // Serper filters
    imageSize?: 'any' | 'large' | 'medium';
    imageType?: 'any' | 'photo' | 'face';
    aspectRatio?: 'any' | 'wide' | 'tall' | 'square';
    license?: 'any' | 'cc' | 'commercial';
    
    // Pexels filters
    orientation?: 'landscape' | 'portrait' | 'square';
    size?: 'large' | 'medium' | 'small';
    
    // YouTube filters
    videoDuration?: 'any' | 'short' | 'medium' | 'long';
    videoLicense?: 'any' | 'creativeCommon';
  };
}

/**
 * Classification result from Gemini analysis
 */
export interface QueryClassification {
  /** Recommended media type */
  mediaType: MediaType;
  
  /** Recommended source */
  source: MediaSource;
  
  /** Confidence in this classification (0-1) */
  confidence: number;
  
  /** Reasoning for this classification */
  reasoning: string;
  
  /** Specificity score (1-10) */
  specificityScore: number;
  
  /** Is this content stock-safe? */
  isStockSafe: boolean;
  
  /** Stock-safe reasoning */
  stockSafeReasoning: string;
  
  /** Suggested search queries (multiple alternatives) */
  suggestedQueries: string[];
  
  /** Named entities detected (people, places, events) */
  namedEntities: {
    people: string[];
    places: string[];
    events: string[];
    dates: string[];
  };
  
  /** Is this historical content? */
  isHistorical: boolean;
  
  /** Recommended filters */
  recommendedFilters?: GeneratedQuery['filters'];
}

// =============================================================================
// SCENE BATCH TYPES
// =============================================================================

/**
 * Scene-level input for batch processing
 */
export interface SceneInput {
  /** Beat/scene index */
  beatIndex: number;
  
  /** Beat type (hook, setup, information, etc.) */
  beatType: string;
  
  /** Content summary from spine */
  contentSummary: string;
  
  /** Key points to cover */
  keyPoints: string[];
  
  /** Narration text */
  narration: string;
  
  /** Duration in seconds */
  durationSeconds: number;
  
  /** Referenced asset IDs */
  assetIds?: string[];
  
  /** Research fact IDs used */
  factIds?: string[];
}

/**
 * Scene batch result
 */
export interface SceneBatchResult {
  /** Beat index range processed */
  beatRange: { start: number; end: number };
  
  /** Generated queries for this batch */
  queries: GeneratedQuery[];
  
  /** Queries skipped due to deduplication */
  skippedDuplicates: number;
  
  /** Queries rejected due to stock-safe filtering */
  rejectedNonStock: number;
  
  /** Processing metadata */
  metadata: {
    processingTimeMs: number;
    totalBeatsProcessed: number;
  };
}

// =============================================================================
// DEDUPLICATION TYPES
// =============================================================================

/**
 * Per-video query tracking for deduplication
 */
export interface VideoQueryTracker {
  /** Video/task ID */
  videoId: string;
  
  /** All queries generated so far */
  generatedQueries: Map<string, GeneratedQuery>;
  
  /** Query embeddings for semantic dedup (query ID -> embedding) */
  queryEmbeddings: Map<string, number[]>;
  
  /** Query hashes for exact dedup */
  queryHashes: Set<string>;
}

/**
 * Deduplication result
 */
export interface DedupResult {
  /** Is this a duplicate? */
  isDuplicate: boolean;
  
  /** Type of duplicate */
  duplicateType?: 'exact' | 'semantic';
  
  /** Similar existing query ID (if semantic duplicate) */
  similarQueryId?: string;
  
  /** Similarity score (for semantic) */
  similarityScore?: number;
}

// =============================================================================
// FULL GENERATION TYPES
// =============================================================================

/**
 * Input for query generation from Universal Script output
 */
export interface QueryGenerationInput {
  /** Video/task ID for tracking */
  videoId: string;
  
  /** User ID for API calls */
  userId: string;
  
  /** Scenes to process (from spine.beats + expandedBeats) */
  scenes: SceneInput[];
  
  /** Media density level - controls query volume */
  mediaDensity?: MediaDensityLevel;
  
  /** Asset registry for context */
  assetRegistry?: {
    characters: Array<{ id: string; name: string; role: string }>;
    locations: Array<{ id: string; name: string; essence: string }>;
    objects: Array<{ id: string; name: string; type: string }>;
  };
  
  /** Research entities for context */
  researchEntities?: Array<{ type: string; name: string; role: string }>;
}

/**
 * Full query generation result
 */
export interface QueryGenerationResult {
  /** Video ID */
  videoId: string;
  
  /** All generated queries grouped by source */
  queriesBySource: {
    serper: GeneratedQuery[];
    wikimedia: GeneratedQuery[];
    pexels: GeneratedQuery[];
    youtube: GeneratedQuery[];
  };
  
  /** Total queries generated */
  totalQueries: number;
  
  /** Queries by media type */
  queryCountByType: {
    image: number;
    video: number;
  };
  
  /** Deduplication stats */
  deduplicationStats: {
    exactDuplicatesSkipped: number;
    semanticDuplicatesSkipped: number;
  };
  
  /** Stock-safe filtering stats */
  stockSafeStats: {
    approved: number;
    rejected: number;
  };
  
  /** Processing metadata */
  metadata: {
    totalProcessingTimeMs: number;
    scenesProcessed: number;
    batchCount: number;
  };
}

// =============================================================================
// HELPER CONSTANTS
// =============================================================================

/**
 * Specificity threshold for YouTube vs Pexels routing
 * - Score >= 4: Route to YouTube (documentary/archival footage)
 * - Score < 4: Route to Pexels (generic stock footage)
 */
export const VIDEO_SPECIFICITY_THRESHOLD = 4;

/**
 * Semantic similarity threshold for deduplication
 * - Similarity > 0.85: Consider as duplicate
 */
export const SEMANTIC_DEDUP_THRESHOLD = 0.85;

/**
 * Stock-safe confidence threshold
 * - Confidence >= 0.7: Accept as stock-safe
 */
export const STOCK_SAFE_THRESHOLD = 0.7;

/**
 * Default scene batch size
 */
export const DEFAULT_BATCH_SIZE = 5;
