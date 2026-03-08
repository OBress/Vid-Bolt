/**
 * Valyu API Client
 * ============================================================================
 * Provides wrapper functions for Valyu's Search and DeepResearch APIs.
 * API key is provided per-call from the user's Supabase settings.
 * 
 * Documentation: https://docs.valyu.ai
 */

import type {
  ValyuSearchParams,
  ValyuSearchResponse,
  ValyuDeepResearchParams,
  ValyuDeepResearchCreateResponse,
  ValyuDeepResearchResult,
} from './types';

const VALYU_API_URL = 'https://api.valyu.ai/v1';

// ============================================================================
// SEARCH API
// ============================================================================

/**
 * Perform a Valyu web search
 * 
 * @param params - Search parameters
 * @param apiKey - User's Valyu API key (from Supabase user_api_keys)
 * @returns Search results with content
 * 
 * @example
 * const results = await valyuSearch({
 *   query: 'Bronze Age collapse causes',
 *   search_type: 'web',
 *   max_num_results: 15,
 *   response_length: 'large',
 * }, userApiKey);
 */
export async function valyuSearch(
  params: ValyuSearchParams,
  apiKey: string
): Promise<ValyuSearchResponse> {
  console.log(`[Valyu:Search] Searching for: "${params.query.substring(0, 50)}..."`);

  try {
    const response = await fetch(`${VALYU_API_URL}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        query: params.query,
        search_type: params.search_type || 'web',
        max_num_results: params.max_num_results || 15,
        relevance_threshold: params.relevance_threshold,
        response_length: params.response_length || 'large',
        start_date: params.start_date,
        end_date: params.end_date,
        included_sources: params.included_sources,
        excluded_sources: params.excluded_sources,
        category: params.category,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Valyu Search API error (${response.status}): ${errorText}`
      );
    }

    const data = await response.json();
    
    console.log(`[Valyu:Search] Found ${data.results?.length || 0} results`);
    
    return {
      success: true,
      results: data.results || [],
      total_results: data.total_results || data.results?.length || 0,
    };
  } catch (error) {
    console.error('[Valyu:Search] Error:', error);
    throw error;
  }
}

// ============================================================================
// DEEPRESEARCH API
// ============================================================================

/**
 * Create a new DeepResearch task
 * 
 * @param params - Research parameters
 * @param apiKey - User's Valyu API key (from Supabase user_api_keys)
 * @returns Task ID for polling
 * 
 * @example
 * const task = await createDeepResearch({
 *   query: 'Comprehensive analysis of Bronze Age collapse',
 *   mode: 'standard',
 *   output_formats: ['markdown'],  // or include a JSON Schema object for structured output
 *   strategy: 'Focus on verified historical facts and expert analysis',
 * }, userApiKey);
 */
export async function createDeepResearch(
  params: ValyuDeepResearchParams,
  apiKey: string
): Promise<ValyuDeepResearchCreateResponse> {
  console.log(`[Valyu:DeepResearch] Creating task for: "${params.query.substring(0, 50)}..."`);
  console.log(`[Valyu:DeepResearch] Mode: ${params.mode}`);

  try {
    const response = await fetch(`${VALYU_API_URL}/deepresearch/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        query: params.query,
        mode: params.mode,
        output_formats: params.output_formats || ['markdown'],
        search_type: params.search_type || 'web',
        strategy: params.strategy,
        max_price: params.max_price,
        start_date: params.start_date,
        end_date: params.end_date,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Valyu DeepResearch create error (${response.status}): ${errorText}`
      );
    }

    const data = await response.json();

    if (!data.deepresearch_id) {
      return {
        success: false,
        deepresearch_id: '',
        error: data.error || 'No task ID returned',
      };
    }

    console.log(`[Valyu:DeepResearch] Task created: ${data.deepresearch_id}`);

    return {
      success: true,
      deepresearch_id: data.deepresearch_id,
    };
  } catch (error) {
    console.error('[Valyu:DeepResearch] Create error:', error);
    return {
      success: false,
      deepresearch_id: '',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Get the status/result of a DeepResearch task
 * 
 * @param deepresearchId - Task ID from createDeepResearch
 * @param apiKey - User's Valyu API key (from Supabase user_api_keys)
 * @returns Current status and results if completed
 */
export async function getDeepResearchStatus(
  deepresearchId: string,
  apiKey: string
): Promise<ValyuDeepResearchResult> {
  try {
    const response = await fetch(
      `${VALYU_API_URL}/deepresearch/tasks/${deepresearchId}/status`,
      {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Valyu DeepResearch status error (${response.status}): ${errorText}`
      );
    }

    const data = await response.json();

    // Valyu returns JSON schema output in the `output` field when using JSON output_formats
    // The `output_type` field indicates whether it's 'markdown', 'json', or 'toon'
    // We need to detect this and populate structured_output accordingly
    let outputString: string | undefined;
    let structuredOutput = data.structured_output;

    if (data.output) {
      // Check if output is structured JSON (object) or markdown (string)
      if (typeof data.output === 'object' && data.output !== null) {
        // Output is already a JSON object - this is our structured data!
        console.log(`[Valyu:DeepResearch] Detected JSON schema output with ${Object.keys(data.output).length} top-level keys`);
        structuredOutput = data.output;
        // Convert to string for markdown fallback consumers
        outputString = JSON.stringify(data.output, null, 2);
      } else if (typeof data.output === 'string') {
        // Output is markdown string
        outputString = data.output;
        
        // Also check if output_type indicates JSON (belt and suspenders)
        if (data.output_type === 'json') {
          try {
            structuredOutput = JSON.parse(data.output);
            console.log(`[Valyu:DeepResearch] Parsed JSON from string output`);
          } catch {
            console.warn(`[Valyu:DeepResearch] output_type is 'json' but output is not valid JSON`);
          }
        }
      }
    }

    // Log what we found for debugging
    if (data.status === 'completed') {
      console.log(`[Valyu:DeepResearch] Response summary:`);
      console.log(`  - output_type: ${data.output_type || 'not set'}`);
      console.log(`  - output: ${typeof data.output} (${data.output ? (typeof data.output === 'string' ? `${data.output.length} chars` : `${Object.keys(data.output).length} keys`) : 'null'})`);
      console.log(`  - structured_output extracted: ${structuredOutput ? Object.keys(structuredOutput).join(', ') : 'none'}`);
      console.log(`  - sources: ${data.sources?.length || 0}`);
    }

    return {
      deepresearch_id: deepresearchId,
      status: data.status,
      output: outputString,
      structured_output: structuredOutput,
      sources: data.sources || [],
      cost: data.cost || 0,
      pdf_url: data.pdf_url,
      error: data.error,
    };
  } catch (error) {
    console.error('[Valyu:DeepResearch] Status error:', error);
    throw error;
  }
}

/**
 * Wait for a DeepResearch task to complete
 * Polls the status endpoint until completion or timeout
 * 
 * @param deepresearchId - Task ID from createDeepResearch
 * @param apiKey - User's Valyu API key (from Supabase user_api_keys)
 * @param options - Polling options
 * @returns Final research results
 * 
 * @throws Error if task fails or times out
 * 
 * @example
 * const result = await waitForDeepResearch(task.deepresearch_id, userApiKey, {
 *   maxWaitMs: 20 * 60 * 1000, // 20 minutes
 *   pollIntervalMs: 5000,       // Poll every 5 seconds
 *   onProgress: (status) => console.log(`Status: ${status}`),
 * });
 */
export async function waitForDeepResearch(
  deepresearchId: string,
  apiKey: string,
  options: {
    maxWaitMs?: number;
    pollIntervalMs?: number;
    onProgress?: (status: string, elapsedMs: number) => void;
  } = {}
): Promise<ValyuDeepResearchResult> {
  const maxWaitMs = options.maxWaitMs || 30 * 60 * 1000; // 30 min default
  const pollIntervalMs = options.pollIntervalMs || 5000;  // 5s default
  const startTime = Date.now();

  console.log(`[Valyu:DeepResearch] Waiting for task ${deepresearchId}`);
  console.log(`[Valyu:DeepResearch] Max wait: ${maxWaitMs / 1000}s, poll interval: ${pollIntervalMs / 1000}s`);

  while (Date.now() - startTime < maxWaitMs) {
    const elapsedMs = Date.now() - startTime;
    
    const result = await getDeepResearchStatus(deepresearchId, apiKey);

    // Report progress
    if (options.onProgress) {
      options.onProgress(result.status, elapsedMs);
    }

    // Check for terminal states
    if (result.status === 'completed') {
      console.log(`[Valyu:DeepResearch] Task completed in ${elapsedMs / 1000}s`);
      console.log(`[Valyu:DeepResearch] Sources found: ${result.sources.length}`);
      return result;
    }

    if (result.status === 'failed') {
      console.error(`[Valyu:DeepResearch] Task failed: ${result.error}`);
      throw new Error(`DeepResearch task failed: ${result.error || 'Unknown error'}`);
    }

    // Log progress periodically
    if (elapsedMs % 30000 < pollIntervalMs) {
      console.log(`[Valyu:DeepResearch] Still researching... (${Math.round(elapsedMs / 1000)}s elapsed)`);
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  // Timeout
  const elapsedSec = Math.round((Date.now() - startTime) / 1000);
  throw new Error(
    `DeepResearch timeout after ${elapsedSec}s. ` +
    `Task ${deepresearchId} did not complete in time.`
  );
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Perform a quick search with sensible defaults
 * Convenience wrapper around valyuSearch
 * 
 * @param query - Search query
 * @param apiKey - User's Valyu API key (from Supabase user_api_keys)
 * @param maxResults - Maximum number of results
 */
export async function quickSearch(
  query: string,
  apiKey: string,
  maxResults: number = 10
): Promise<ValyuSearchResponse> {
  return valyuSearch({
    query,
    search_type: 'web',
    max_num_results: maxResults,
    response_length: 'medium',
  }, apiKey);
}

/**
 * Perform comprehensive research using DeepResearch
 * Combines create + wait into a single call
 * 
 * @param query - Research topic/question
 * @param apiKey - User's Valyu API key (from Supabase user_api_keys)
 * @param mode - 'fast' (~5-10 min) or 'standard' (~10-30 min)
 * @param options - Additional options
 */
export async function performDeepResearch(
  query: string,
  apiKey: string,
  mode: 'fast' | 'standard' = 'standard',
  options: {
    strategy?: string;
    maxWaitMs?: number;
    onProgress?: (status: string, elapsedMs: number) => void;
  } = {}
): Promise<ValyuDeepResearchResult> {
  // Create the task with JSON Schema for structured v2 research output
  // NOTE: Per Valyu docs, cannot mix JSON Schema with markdown/pdf - use one or the other
  const createResponse = await createDeepResearch({
    query,
    mode,
    // V2 JSON Schema for breaking news script writing
    output_formats: [
      {
        type: 'object',
        properties: {
          // NEW: Narrative context for script writing
          narrative: {
            type: 'object',
            properties: {
              hook: { type: 'string', description: '1-2 sentence attention grabber' },
              summary: { type: 'string', description: '3-5 sentence complete overview' },
              background: { type: 'string', description: 'Background context needed to understand the event' },
              priorEvents: { type: 'array', items: { type: 'string' }, description: 'What led to this event' },
              keyTerms: { type: 'object', description: 'Important term definitions' }
            },
            required: ['hook', 'summary', 'background']
          },
          // NEW: Chronological story beats
          keyDevelopments: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                timestamp: { type: 'string' },
                what: { type: 'string', description: 'What happened' },
                who: { type: 'array', items: { type: 'string' }, description: 'People/orgs involved' },
                significance: { type: 'string', description: 'Why this matters to the story' },
                sources: { type: 'array', items: { type: 'string' } }
              },
              required: ['what', 'significance']
            }
          },
          // Enhanced entities with actions and quotes
          entities: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                type: { type: 'string', enum: ['person', 'organization', 'location', 'concept'] },
                role: { type: 'string', description: 'Role in this story' },
                bio: { type: 'string', description: '1-2 sentence background' },
                quotes: { type: 'array', items: { type: 'string' } },
                actions: { type: 'array', items: { type: 'string' } }
              },
              required: ['name', 'type', 'role']
            }
          },
          // Keep original fields for compatibility
          facts: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                statement: { type: 'string' },
                confidence: { type: 'number' },
                sources: { type: 'array', items: { type: 'string' } }
              },
              required: ['statement']
            }
          },
          quotes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                quote: { type: 'string' },
                speaker: { type: 'string' },
                context: { type: 'string' },
                source: { type: 'string' }
              },
              required: ['quote', 'speaker']
            }
          },
          timeline: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                date: { type: 'string' },
                event: { type: 'string' },
                significance: { type: 'string' }
              },
              required: ['date', 'event']
            }
          },
          summary: { type: 'string' },
          verificationGaps: { type: 'array', items: { type: 'string' }, description: 'What could not be verified' }
        },
        required: ['narrative', 'keyDevelopments', 'facts', 'summary']
      }
    ],
    search_type: 'web',
    strategy: options.strategy || 
      'Provide comprehensive research for a video script about a breaking news event. ' +
      'The script writer has ZERO prior knowledge - extract EVERYTHING needed including context, ' +
      'chronological developments, key figures with their backgrounds, verified facts, and direct quotes. ' +
      'Cite all sources with URLs.',
  }, apiKey);

  if (!createResponse.success) {
    throw new Error(`Failed to create DeepResearch task: ${createResponse.error}`);
  }

  // Wait for completion
  return waitForDeepResearch(createResponse.deepresearch_id, apiKey, {
    maxWaitMs: options.maxWaitMs,
    onProgress: options.onProgress,
  });
}
