/**
 * Valyu API Types
 * ============================================================================
 * TypeScript types for Valyu Search and DeepResearch APIs.
 * Documentation: https://docs.valyu.ai
 */

// ============================================================================
// VALYU SEARCH API TYPES
// ============================================================================

/**
 * Parameters for Valyu Search API
 */
export interface ValyuSearchParams {
  /** The search query */
  query: string;
  /** Type of search to perform */
  search_type?: 'web' | 'proprietary' | 'news' | 'all';
  /** Maximum number of results (1-100) */
  max_num_results?: number;
  /** Minimum relevance threshold (0.0-1.0) */
  relevance_threshold?: number;
  /** Response length for content extraction */
  response_length?: 'short' | 'medium' | 'large' | 'max';
  /** Filter by start date (YYYY-MM-DD) */
  start_date?: string;
  /** Filter by end date (YYYY-MM-DD) */
  end_date?: string;
  /** Include only specific sources */
  included_sources?: string[];
  /** Exclude specific sources */
  excluded_sources?: string[];
  /** Content category filter */
  category?: string;
}

/**
 * Individual search result from Valyu
 */
export interface ValyuSearchResult {
  /** Title of the content */
  title: string;
  /** URL of the source */
  url: string;
  /** Full or partial content text */
  content: string;
  /** Short description/snippet */
  description?: string;
  /** Source name/domain */
  source: string;
  /** Type of source (web, academic, news, etc.) */
  source_type: string;
  /** Publication date if available */
  publication_date?: string;
  /** Content length in words */
  length: number;
  /** Author if available */
  author?: string;
}

/**
 * Response from Valyu Search API
 */
export interface ValyuSearchResponse {
  /** Whether the request was successful */
  success: boolean;
  /** Array of search results */
  results: ValyuSearchResult[];
  /** Total number of results found */
  total_results: number;
  /** Error message if request failed */
  error?: string;
}

// ============================================================================
// VALYU DEEPRESEARCH API TYPES
// ============================================================================

/**
 * DeepResearch modes with different time/depth tradeoffs
 * - fast: ~5-10 minutes, quick overview
 * - standard: ~10-30 minutes, comprehensive research
 * Note: We don't use 'heavy' as it can take 2+ hours
 */
export type ValyuDeepResearchMode = 'fast' | 'standard';

/**
 * Parameters for creating a DeepResearch task
 */
export interface ValyuDeepResearchParams {
  /** The research query/question */
  query: string;
  /** Research mode (fast or standard, max 30 min) */
  mode: ValyuDeepResearchMode;
  /** Output formats to generate - 'markdown', 'pdf', 'toon', or a JSON Schema object */
  output_formats?: Array<'markdown' | 'pdf' | 'toon' | Record<string, unknown>>;
  /** Type of sources to search */
  search_type?: 'web' | 'proprietary' | 'all';
  /** Strategy/approach guidance for the research */
  strategy?: string;
  /** Maximum cost limit */
  max_price?: number;
  /** Filter by start date */
  start_date?: string;
  /** Filter by end date */
  end_date?: string;
}

/**
 * Response from DeepResearch create endpoint
 */
export interface ValyuDeepResearchCreateResponse {
  /** Whether task creation was successful */
  success: boolean;
  /** Unique ID for the research task */
  deepresearch_id: string;
  /** Error message if creation failed */
  error?: string;
}

/**
 * Status of a DeepResearch task
 */
export type ValyuDeepResearchStatus = 'queued' | 'researching' | 'completed' | 'failed';

/**
 * Individual source from DeepResearch results
 */
export interface ValyuDeepResearchSource {
  /** Title of the source */
  title: string;
  /** URL of the source */
  url: string;
  /** Short snippet/excerpt from the source */
  snippet: string;
  /** Word count of the source content */
  word_count: number;
  /** Publication date if available */
  publication_date?: string;
  /** Author if available */
  author?: string;
  /** Source type (academic, news, web, etc.) */
  source_type?: string;
}

/**
 * Result from DeepResearch status/wait endpoint
 */
export interface ValyuDeepResearchResult {
  /** The research task ID */
  deepresearch_id: string;
  /** Current status */
  status: ValyuDeepResearchStatus;
  /** Markdown research output (if completed) */
  output?: string;
  /** Structured JSON output (if requested and completed) */
  structured_output?: {
    facts?: Array<{
      statement: string;
      sources: string[];
      confidence?: number;
    }>;
    quotes?: Array<{
      quote: string;
      speaker: string;
      context?: string;
      source?: string;
    }>;
    timeline?: Array<{
      date: string;
      event: string;
      significance?: string;
    }>;
    entities?: Array<{
      name: string;
      type: string;
      description?: string;
    }>;
    summary?: string;
  };
  /** Array of sources used in the research */
  sources: ValyuDeepResearchSource[];
  /** Cost of the research task */
  cost: number;
  /** PDF URL if PDF output was requested */
  pdf_url?: string;
  /** Error message if task failed */
  error?: string;
}

// ============================================================================
// INTERNAL TYPES FOR RESEARCH INTEGRATION
// ============================================================================

/**
 * Mapped result for internal use
 * Combines Valyu results with our reliability scoring
 */
export interface MappedValyuSource {
  /** Unique source ID (e.g., SRC-001) */
  id: string;
  /** URL of the source */
  url: string;
  /** Title of the source */
  title: string;
  /** Full content text */
  content: string;
  /** Short excerpt/snippet */
  excerpt?: string;
  /** Publication date */
  publicationDate?: string;
  /** Author name */
  author?: string;
  /** Source type for categorization */
  sourceType: string;
  /** Reliability tier (1-5, 1 = most reliable) */
  reliabilityTier: 1 | 2 | 3 | 4 | 5;
  /** When the source was accessed */
  accessedAt: string;
}

/**
 * Configuration for Valyu research integration
 */
export interface ValyuResearchConfig {
  /** Maximum time to wait for DeepResearch */
  maxWaitMs: number;
  /** Polling interval for DeepResearch status */
  pollIntervalMs: number;
  /** Default number of results for search */
  defaultMaxResults: number;
  /** Response length preference */
  responseLength: 'short' | 'medium' | 'large' | 'max';
}

/**
 * Default configuration values
 */
export const DEFAULT_VALYU_CONFIG: ValyuResearchConfig = {
  maxWaitMs: 30 * 60 * 1000,      // 30 minutes max
  pollIntervalMs: 5000,           // Poll every 5 seconds
  defaultMaxResults: 15,
  responseLength: 'large',
};
