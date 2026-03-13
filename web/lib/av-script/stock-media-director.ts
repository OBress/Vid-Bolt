/**
 * Stock Media Director
 * ============================================================================
 * Intelligent stock media matching system that acts like a "Movie Director"
 * to make informed decisions about visual media for each shot.
 * 
 * Key Features:
 * - Parallel processing for speed
 * - Context-aware evaluation (considers surrounding shots)
 * - Fixed 0.9 similarity threshold for vector matching
 * - Gemini-decided fallbacks (motion graphics vs AI-generated)
 * - @(StockMedia:id) reference syntax for UI rendering
 */

import { ShotPart1 } from '@/lib/queues/workers/av-script';
import { generateEmbedding } from '@/lib/ai/embedding';
import { getSupabaseServiceClient } from '@/lib/queues/shared';
import { validateStockImage } from '@/lib/classification/media-classifier';
import { searchAndStoreImages, searchAndStoreFirstMatch, deleteStockMediaAsset } from '@/lib/av-script/stock-media-utils';

// Helper function to escape special regex characters
function _escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================================
// TYPES
// ============================================================================

export interface StockMediaDirectorConfig {
  userId: string;
  videoId: string;
  stockMediaLevel: 'none' | 'standard_images' | 'extensive_images' | 'standard_images_video' | 'extensive_images_video';
  /** Overall video topic/title for contextual relevance decisions */
  videoTopic?: string;
  /** Main spine beats/sections for understanding story structure */
  spineBeats?: string[];
  /** Visual style/aesthetic for tone-appropriate matching (Fix 8) */
  visualStyle?: string;
}

export interface StockMediaRef {
  id: string;
  url: string;
  thumbnailUrl: string;
  description: string;
  similarity: number;
}

export interface ShotWithStockMedia extends ShotPart1 {
  stock_media_ref?: StockMediaRef;
  stock_media_refs?: StockMediaRef[];
  fallback_type?: 'motiongraphic' | 'video';
}

export interface StockMediaCandidate {
  id: string;
  r2_key: string;
  source: string;
  similarity: number;
  mediaType: string;
  description: string;
  url: string;
  thumbnailUrl: string;
  subjects?: string[];
  mood?: string;
  metadata?: Record<string, any>;
}

export interface ShotContext {
  shot: ShotPart1;
  index: number;
  previousShots: ShotPart1[];
  nextShots: ShotPart1[];
  totalShots: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Fixed similarity threshold - lowered from 0.9 to 0.7 for better matching */
const SIMILARITY_THRESHOLD = 0.7;

/** Number of previous/next shots to include for context */
const CONTEXT_WINDOW_SIZE = 2;

/** Maximum candidates to evaluate per shot */
const MAX_CANDIDATES_PER_SHOT = 3;

/** Timeout for individual shot evaluation (ms) - 90s to account for rate limiting delays and retries */
const SHOT_TIMEOUT_MS = 150000; // 2.5 minutes - allows for on-demand Serper + sequential validation

/** Maximum concurrent validation calls - issue was image format not rate limits */
const MAX_CONCURRENT_VALIDATIONS = 5;

// ============================================================================
// MAIN DIRECTOR CLASS
// ============================================================================

export class StockMediaDirector {
  private config: StockMediaDirectorConfig;
  private logPrefix = '[StockMediaDirector]';
  private usedStockIds: Set<string> = new Set(); // Track already-used stock media
  private deletedStockIds: Set<string> = new Set(); // Track deleted stock media to prevent race conditions
  private pendingDeletions: Map<string, string> = new Map(); // Deferred deletions: id -> r2_key

  constructor(config: StockMediaDirectorConfig) {
    this.config = config;
  }

  // =========================================================================
  // ENTITY REUSE METHODS
  // =========================================================================

  /**
   * Look up existing stock media by entity name.
   * Uses RPC function for deterministic matching (not vector similarity).
   */
  private async getStockMediaByEntity(entityName: string): Promise<StockMediaCandidate | null> {
    const supabase = getSupabaseServiceClient();
    
    try {
      const { data, error } = await supabase.rpc('get_stock_media_by_entity', {
        p_video_id: this.config.videoId,
        p_entity_name: entityName
      });

      if (error || !data || data.length === 0) {
        console.log(`${this.logPrefix} No existing stock media for entity: ${entityName}`);
        return null;
      }

      const row = data[0];
      const m = row.metadata || {};
      
      console.log(`${this.logPrefix} Found existing stock media for entity: ${entityName}`);
      
      return {
        id: row.id,
        r2_key: row.r2_key,
        source: m.source || 'serper',
        similarity: 1.0, // Perfect match for entity reuse
        mediaType: m.mediaType || 'image',
        description: m.description || m.title || entityName,
        url: m.url || '',
        thumbnailUrl: m.thumbnailUrl || m.url || '',
        subjects: m.subjects,
        mood: m.mood,
        metadata: m,
      };
    } catch (err) {
      console.warn(`${this.logPrefix} Entity lookup failed for ${entityName}:`, err);
      return null;
    }
  }

  /**
   * Tag a stock media record with an entity name for future reuse.
   */
  private async tagStockMediaWithEntity(stockMediaId: string, entityName: string): Promise<void> {
    const supabase = getSupabaseServiceClient();
    
    try {
      const { error } = await supabase
        .from('stock_media')
        .update({ entity_name: entityName })
        .eq('id', stockMediaId);

      if (error) {
        console.warn(`${this.logPrefix} Failed to tag entity ${entityName}:`, error);
      } else {
        console.log(`${this.logPrefix} Tagged stock media ${stockMediaId} as entity: ${entityName}`);
      }
    } catch (err) {
      console.warn(`${this.logPrefix} Entity tagging failed:`, err);
    }
  }

  /**
   * Clean up queued deletions after all shots are processed.
   * Only deletes images that are NOT in usedStockIds.
   * This prevents race conditions where parallel shots haven't finished claiming their images.
   */
  private async cleanupPendingDeletions(): Promise<void> {
    if (this.pendingDeletions.size === 0) {
      return;
    }

    let deletedCount = 0;
    let keptCount = 0;

    for (const [id, r2Key] of this.pendingDeletions) {
      // Check if this image was claimed by any shot during processing
      if (this.usedStockIds.has(id)) {
        console.log(`${this.logPrefix} Keeping ${id} (used by a shot)`);
        keptCount++;
        continue;
      }

      // Safe to delete - not used by any shot
      try {
        await deleteStockMediaAsset(id, r2Key);
        this.deletedStockIds.add(id);
        deletedCount++;
      } catch (err) {
        console.warn(`${this.logPrefix} Failed to delete ${id}:`, err);
      }
    }

    console.log(`${this.logPrefix} Cleanup: ${deletedCount} deleted, ${keptCount} kept (used by shots)`);
  }

  /**
   * Process all shots in parallel to match stock media or assign fallback types.
   * This is the main entry point for the Stock Media Director.
   * 
   * OPTIMIZATION: Only processes shots marked as stock_worthy (famous people/landmarks).
   */
  async processShots(shots: ShotPart1[]): Promise<ShotWithStockMedia[]> {
    console.log(`${this.logPrefix} Starting parallel processing for ${shots.length} shots`);
    console.log(`${this.logPrefix} Config: stockMediaLevel=${this.config.stockMediaLevel}, threshold=${SIMILARITY_THRESHOLD}`);

    // If stock media is disabled, assign fallback types directly
    if (this.config.stockMediaLevel === 'none') {
      console.log(`${this.logPrefix} Stock media disabled, assigning fallback types only`);
      return this.processShotsWithoutStockMedia(shots);
    }

    // OPTIMIZATION: Filter to only stock-worthy shots for vector search
    const stockWorthyIndices: number[] = [];
    shots.forEach((shot, idx) => {
      if (shot.stock_worthy === true) {
        stockWorthyIndices.push(idx);
      }
    });

    console.log(`${this.logPrefix} ${stockWorthyIndices.length}/${shots.length} shots marked as stock-worthy`);

    // If no stock-worthy shots, skip vector search entirely
    if (stockWorthyIndices.length === 0) {
      console.log(`${this.logPrefix} No stock-worthy shots, assigning fallback types only`);
      return this.processShotsWithoutStockMedia(shots);
    }

    // Step 1: Build context windows only for stock-worthy shots
    const stockWorthyShots = stockWorthyIndices.map(idx => shots[idx]);
    const contexts = this.buildContextWindows(shots); // Full context for reference

    // Step 2: Batch query vector DB only for stock-worthy shots (parallel)
    const stockWorthyCandidates = await this.batchSearchVectorDB(stockWorthyShots);
    
    // Map candidates back to original indices
    const allCandidates: Record<number, StockMediaCandidate[]> = {};
    stockWorthyIndices.forEach((originalIdx, swIdx) => {
      allCandidates[originalIdx] = stockWorthyCandidates[swIdx] || [];
    });
    
    console.log(`${this.logPrefix} Vector DB returned candidates for ${Object.keys(allCandidates).filter(k => allCandidates[parseInt(k)]?.length > 0).length} shots`);

    // Step 3: Throttled evaluation with timeout protection (only stock-worthy shots)
    // Use semaphore pattern to limit concurrent OpenRouter API calls
    const results: ShotWithStockMedia[] = new Array(contexts.length);
    let activeTasks = 0;
    let nextIdx = 0;
    
    const processNext = async (): Promise<void> => {
      while (nextIdx < contexts.length) {
        if (activeTasks >= MAX_CONCURRENT_VALIDATIONS) {
          // Wait for a slot to free up
          await new Promise(resolve => setTimeout(resolve, 100));
          continue;
        }
        
        const idx = nextIdx++;
        const ctx = contexts[idx];
        
        // Non-stock-worthy shots don't need throttling (no API calls)
        if (!stockWorthyIndices.includes(idx)) {
          results[idx] = await this.assignFallbackForShot(ctx.shot);
          continue;
        }
        
        // Stock-worthy shots need throttling
        activeTasks++;
        this.evaluateShotWithTimeout(ctx, allCandidates[idx] || [])
          .then(result => {
            results[idx] = result;
            activeTasks--;
          })
          .catch(err => {
            console.error(`${this.logPrefix} Shot ${idx} evaluation error:`, err);
            results[idx] = this.assignFallbackForShot(ctx.shot) as unknown as ShotWithStockMedia;
            activeTasks--;
          });
      }
      
      // Wait for all remaining active tasks to complete
      while (activeTasks > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    };
    
    await processNext();

    // Step 4: Clean up unused images (deferred deletion)
    await this.cleanupPendingDeletions();
    
    // Step 5: Log summary
    const matched = results.filter((r: ShotWithStockMedia) => r.stock_media_ref).length;
    const fallbacks = results.filter((r: ShotWithStockMedia) => r.fallback_type).length;
    console.log(`${this.logPrefix} Complete: ${matched} shots matched, ${fallbacks} fallbacks assigned`);

    return results;
  }

  /**
   * Fast fallback assignment for non-stock-worthy shots.
   * RESPECTS the AI's media_type decision from generateShotSummaries.
   * Only falls back to content-type heuristics if AI didn't specify.
   */
  private assignFallbackForShot(shot: ShotPart1): ShotWithStockMedia {
    // CRITICAL: Respect the AI's media_type decision (video or motiongraphic)
    // Only use content-type heuristic if AI didn't provide a media_type
    const mediaType = shot.media_type || this.getFallbackFromContentType(shot.content_type);
    
    return {
      ...shot,
      media_type: mediaType,
      fallback_type: mediaType,
    };
  }

  /**
   * Determine fallback type based on content type (instant, no API call).
   * 
   * Fern-style logic:
   * - AI Video: Narrative scenes, people doing things, reimagining events
   * - Motion Graphics: ONLY explicit comparisons (side-by-side analysis)
   * 
   * Note: list-item uses AI Video because documentary lists are almost always
   * narrative scenes (people, places, events), not data visualizations.
   */
  private getFallbackFromContentType(contentType: string): 'motiongraphic' | 'video' {
    switch (contentType) {
      // ═══════════════════════════════════════════════════════════
      // MOTION GRAPHICS: Only explicit analytical comparisons
      // ═══════════════════════════════════════════════════════════
      case 'comparison':     // Side-by-side analysis → split screens/charts
        return 'motiongraphic';
      
      // ═══════════════════════════════════════════════════════════
      // AI VIDEO (3D-style): All narrative content including lists
      // ═══════════════════════════════════════════════════════════
      case 'list-item':      // Narrative lists → imagined scenes (NOT data viz)
      case 'concept':        // Narrative explanations → imagined scenes
      case 'transition':     // Topic changes → new environments/settings
      case 'emotional-beat': // Dramatic moments → expressive visuals
      default:               // Unknown → assume narrative (Fern's default)
        return 'video';
    }
  }

  /**
   * Process shots when stock media is disabled - only assign fallback types.
   * Uses fast heuristics instead of Gemini API calls.
   */
  private processShotsWithoutStockMedia(shots: ShotPart1[]): ShotWithStockMedia[] {
    return shots.map((shot) => this.assignFallbackForShot(shot));
  }

  /**
   * Build context windows for each shot (2 previous + 2 next shots).
   */
  private buildContextWindows(shots: ShotPart1[]): ShotContext[] {
    return shots.map((shot, index) => ({
      shot,
      index,
      previousShots: shots.slice(Math.max(0, index - CONTEXT_WINDOW_SIZE), index),
      nextShots: shots.slice(index + 1, index + 1 + CONTEXT_WINDOW_SIZE),
      totalShots: shots.length,
    }));
  }

  /**
   * Batch query vector DB for all shots.
   * Returns a map of shot index -> candidate array.
   * 
   * Uses direct Cloudflare API for embeddings (not HTTP route) to work in worker context.
   */
  private async batchSearchVectorDB(shots: ShotPart1[]): Promise<Record<number, StockMediaCandidate[]>> {
    const results: Record<number, StockMediaCandidate[]> = {};
    const supabase = getSupabaseServiceClient();

    // Parallel search for all shots
    const searchPromises = shots.map(async (shot, index) => {
      try {
        // Build search query from shot summary + character/location refs
        const searchQuery = this.buildSearchQuery(shot);
        console.log(`${this.logPrefix} Shot ${index} search query: "${searchQuery.substring(0, 100)}..."`);
        
        // Generate embedding directly via Cloudflare API (not HTTP route)
        const embedding = await generateEmbedding(searchQuery);
        console.log(`${this.logPrefix} Shot ${index} embedding generated: ${embedding.length} dimensions`);
        
        // Query Supabase vector DB directly using the new filtered function
        const { data, error } = await supabase.rpc('match_stock_media_for_video', {
          query_embedding: embedding,
          match_threshold: SIMILARITY_THRESHOLD,
          match_count: MAX_CANDIDATES_PER_SHOT,
          p_user_id: this.config.userId,
          p_video_id: this.config.videoId,
        });
        
        console.log(`${this.logPrefix} Shot ${index} RPC result: ${data?.length || 0} candidates, error: ${error?.message || 'none'}`);

        if (error) {
          console.warn(`${this.logPrefix} Vector search RPC failed for shot ${index}:`, error);
          results[index] = [];
          return;
        }

        // Map to our format
        results[index] = (data || []).map((row: any) => {
          const m = row.metadata || {};
          return {
            id: row.id,
            r2_key: row.r2_key,
            source: row.source || m.source || 'other',
            similarity: row.similarity || 0,
            mediaType: m.mediaType || 'image',
            description: m.description || m.title || '',
            url: m.url || '',
            thumbnailUrl: m.thumbnailUrl || '',
            subjects: m.subjects,
            mood: m.mood,
            metadata: m,
          };
        });
      } catch (error) {
        console.warn(`${this.logPrefix} Vector search failed for shot ${index}:`, error);
        results[index] = [];
      }
    });

    await Promise.all(searchPromises);
    return results;
  }


  /**
   * Build search query for vector similarity matching.
   * Includes entity names (characters, locations) for better semantic matching.
   */
  private buildSearchQuery(shot: ShotPart1): string {
    const parts: string[] = [];

    // CRITICAL: Include character names for proper matching
    // This is essential because stock media is indexed by subject (e.g., "Martin Luther King")
    // but shot summaries may be abstract (e.g., "a man speaking at a podium")
    if (shot.character_refs && shot.character_refs.length > 0) {
      parts.push(`People: ${shot.character_refs.join(', ')}`);
    }

    // Include location names
    if (shot.location_refs && shot.location_refs.length > 0) {
      parts.push(`Places: ${shot.location_refs.join(', ')}`);
    }

    // Primary: shot summary
    if (shot.summary) {
      // Extract entity names from @() references instead of stripping them
      parts.push(shot.summary.replace(/@\(([^)]+)\)/g, '$1').trim());
    }

    // Secondary: shot text (first 150 chars for more context)
    if (shot.text) {
      parts.push(shot.text.substring(0, 150));
    }

    // Tertiary: content type context
    parts.push(shot.content_type);

    return parts.join('. ');
  }

  /**
   * Build search query specifically for Serper image search.
   * Creates CONCRETE, SUBJECT-FOCUSED queries that will find real documentary/archival content.
   * 
   * Uses Gemini 3 Flash to intelligently convert the shot summary into an
   * optimal image search query. This is far more effective than rule-based
   * string manipulation because the AI can:
   * 1. Extract key subjects (people, places, objects)
   * 2. Remove production language naturally
   * 3. Format specifically for image search
   * 4. Adapt based on context
   */
  private async buildSerperQuery(shot: ShotPart1): Promise<string> {
    const { generateText } = await import('@/lib/ai/openrouter');
    
    // Prepare the summary - strip @() syntax for the AI
    const cleanSummary = (shot.summary || shot.text?.substring(0, 150) || '')
      .replace(/@\(([^)]+)\)/g, '$1');
    
    const systemPrompt = `You are a Google Images search query optimizer. Convert visual descriptions into optimal image search queries.

RULES:
1. Extract ONLY concrete subjects (real people, real places, real objects)
2. Remove ALL production language (cinematic, motiongraphic, aerial, close-up, etc.)
3. Remove abstract concepts and metaphors
4. Keep the query under 8 words
5. Add "photo" at the end for better image results
6. Return ONLY the search query, nothing else

EXAMPLES:
- "@(Donald Trump) speaking at rally podium" → "Donald Trump campaign rally speech photo"
- "Crime board with evidence connecting suspects" → "crime investigation evidence board photo"
- "Aerial view of New York skyline at sunset" → "New York skyline photo"
- "Motiongraphic showing stock market crash visualization" → "stock market trading floor photo"`;

    const userPrompt = `Convert this visual description into an image search query:

Visual: "${cleanSummary}"
Video topic: "${this.config.videoTopic || 'documentary'}"

Return ONLY the search query:`;

    try {
      const response = await generateText(
        this.config.userId,
        systemPrompt,
        userPrompt,
        { temperature: 0.3, maxTokens: 50 } // Low temp for consistent formatting
      );
      
      const query = response.content.trim()
        .replace(/^["']|["']$/g, '') // Remove quotes if present
        .replace(/\n.*/g, ''); // Take only first line
      
      console.log(`${this.logPrefix} AI-generated Serper query: "${query}" (from: "${cleanSummary.substring(0, 50)}...")`);
      return query;
    } catch (error) {
      // Fallback to simple cleaning if AI fails
      console.warn(`${this.logPrefix} AI query generation failed, using fallback:`, error);
      const fallbackQuery = cleanSummary.substring(0, 50) + ' photo';
      console.log(`${this.logPrefix} Fallback Serper query: "${fallbackQuery}"`);
      return fallbackQuery;
    }
  }
  
  /**
   * Determine if content is historical (pre-2000s topics).
   */
  private isHistoricalContent(shot: ShotPart1): boolean {
    const text = `${shot.summary || ''} ${shot.text || ''}`.toLowerCase();
    // Look for historical indicators
    const historicalKeywords = [
      '1800s', '1900s', '1910s', '1920s', '1930s', '1940s', '1950s', '1960s', '1970s', '1980s',
      'archival', 'historic', 'historical', 'vintage', 'civil rights', 'world war',
      'great depression', 'segregation', 'victorian', 'colonial'
    ];
    return historicalKeywords.some(kw => text.includes(kw));
  }

  /**
   * Evaluate a shot with timeout protection.
   * Uses a completion flag to prevent orphaned timeout logs.
   */
  private async evaluateShotWithTimeout(
    context: ShotContext,
    candidates: StockMediaCandidate[]
  ): Promise<ShotWithStockMedia> {
    let completed = false;
    
    const timeoutPromise = new Promise<ShotWithStockMedia>((resolve) => {
      setTimeout(() => {
        if (!completed) {
          console.warn(`${this.logPrefix} Shot ${context.index} evaluation timed out, using fallback`);
          resolve({
            ...context.shot,
            media_type: 'motiongraphic',
            fallback_type: 'motiongraphic',
          });
        }
      }, SHOT_TIMEOUT_MS);
    });

    const evaluationPromise = this.evaluateShot(context, candidates).then(result => {
      completed = true;
      return result;
    });

    return Promise.race([evaluationPromise, timeoutPromise]);
  }

  /**
   * Evaluate a single shot against candidates and decide on stock media or fallback.
   * 
   * OPTIMIZATION: Uses pure similarity threshold matching (no Gemini calls for matching).
   * VALIDATION: Uses Gemini 3 Flash to validate image quality (watermarks/NSFW) before returning.
   * FALLBACK: If no candidates, searches Serper for new images and retries.
   * MULTI-IMAGE: Supports image_count > 1 by matching multiple valid images.
   */
  private async evaluateShot(
    context: ShotContext,
    candidates: StockMediaCandidate[],
    isRetry: boolean = false
  ): Promise<ShotWithStockMedia> {
    const { shot, index } = context;
    const HIGH_CONFIDENCE_THRESHOLD = 0.70;
    const imageCount = shot.image_count || 1;

    // =========================================================================
    // STEP 1: ENTITY REUSE CHECK (deterministic, no vector search)
    // =========================================================================
    if (shot.reuse_entity && !isRetry) {
      console.log(`${this.logPrefix} Shot ${index}: Checking entity reuse for "${shot.reuse_entity}"`);
      
      const existingMedia = await this.getStockMediaByEntity(shot.reuse_entity);
      
      if (existingMedia) {
        console.log(`${this.logPrefix} Shot ${index}: Reusing existing stock media for ${shot.reuse_entity}`);
        this.usedStockIds.add(existingMedia.id);
        return this.buildMatchedShot(shot, existingMedia);
      }
      
      // Entity not found yet - will be tagged after fresh scrape below
      console.log(`${this.logPrefix} Shot ${index}: No existing media for ${shot.reuse_entity}, will scrape fresh`);
    }

    // =========================================================================
    // STEP 2: FRESH SCRAPE (skip vector search, scrape directly)
    // =========================================================================
    if (!isRetry) {
      console.log(`${this.logPrefix} Shot ${index}: Fresh scrape (skipping vector pool)`);
      
      // Build focused search query for Serper (concrete subjects + "photo" suffix)
      const searchQuery = await this.buildSerperQuery(shot);
      const shotDescription = shot.summary || shot.text;
      
      // OPTIMIZATION: For single-image shots, use efficient "first match wins"
      // This downloads sequentially and stops after first valid match = much less R2 storage
      if (imageCount === 1) {
        const match = await searchAndStoreFirstMatch(
          searchQuery,
          shotDescription,
          this.config.userId,
          this.config.videoId,
          { // Pass video context for holistic relevance decisions
            videoTopic: this.config.videoTopic,
            spineBeats: this.config.spineBeats,
          }
        );
        
        if (match) {
          console.log(`${this.logPrefix} Shot ${index}: First-match found, using directly`);
          
          // Tag with entity for future reuse if specified
          if (shot.reuse_entity) {
            await this.tagStockMediaWithEntity(match.id, shot.reuse_entity);
          }
          
          // Return immediately with the matched image
          const stockMediaRef: StockMediaRef = {
            id: match.id,
            url: match.publicUrl,
            thumbnailUrl: match.publicUrl,
            description: match.title,
            similarity: 1.0, // Direct match
          };
          
          this.usedStockIds.add(match.id);
          
          return {
            ...shot,
            media_type: shot.media_type || 'video' as 'video' | 'motiongraphic',
            stock_media_ref: stockMediaRef,
            summary: shot.summary,
          };
        }
        
        // No match found, fall through to fallback
        console.log(`${this.logPrefix} Shot ${index}: First-match search returned no valid images`);
      } else {
        // Multi-image shots: Use batch storage (need multiple images)
        const maxImages = imageCount * 2; // Extra buffer for validation failures
        const result = await searchAndStoreImages(
          searchQuery,
          this.config.userId,
          this.config.videoId,
          maxImages
        );

        if (result.stored.length > 0) {
          console.log(`${this.logPrefix} Shot ${index}: Stored ${result.stored.length} new images, retrying vector search`);
          
          // Re-query vector DB for this shot (more candidates for multi-image)
          const newCandidates = await this.searchVectorDBForShot(shot, index, imageCount * 3);
          
          // Retry evaluation with new candidates (mark as retry to prevent infinite loop)
          return this.evaluateShot(context, newCandidates, true);
        }
        
        console.log(`${this.logPrefix} Shot ${index}: Serper search returned no valid images`);
      }
    }

    // =========================================================================
    // STILL NO CANDIDATES: Use fallback
    // =========================================================================
    if (candidates.length === 0) {
      const mediaType = shot.media_type || this.getFallbackFromContentType(shot.content_type);
      return {
        ...shot,
        media_type: mediaType,
        fallback_type: mediaType,
        summary: shot.summary,
      };
    }

    // =========================================================================
    // EVALUATE CANDIDATES WITH VALIDATION
    // =========================================================================
    // Sort candidates by similarity (highest first)
    const sortedCandidates = [...candidates].sort((a, b) => b.similarity - a.similarity);

    // For multi-image shots, collect multiple valid images
    const validRefs: StockMediaRef[] = [];
    
    for (const candidate of sortedCandidates) {
      // Skip if already deleted earlier in this run (prevents race conditions)
      if (this.deletedStockIds.has(candidate.id)) {
        continue;
      }

      // Skip if already used (unless multi-image which may need duplicates across shots)
      if (this.usedStockIds.has(candidate.id) && imageCount === 1) {
        continue;
      }

      // Skip if below threshold
      if (candidate.similarity < HIGH_CONFIDENCE_THRESHOLD) {
        console.log(`${this.logPrefix} Shot ${index}: Candidate ${candidate.id} below threshold (${candidate.similarity.toFixed(2)})`);
        break; // Sorted by similarity, so remaining candidates will also be below threshold
      }

      console.log(`${this.logPrefix} Shot ${index}: Validating candidate ${candidate.id} (similarity=${candidate.similarity.toFixed(2)})`);

      // Validate the image before returning
      try {
        const validation = await validateStockImage(
          candidate.url, 
          this.config.userId,
          shot.summary || shot.text, // Pass shot description for relevance checking
          candidate.r2_key, // Pass r2_key for direct R2 fetching (bypasses CDN delays)
          { // Pass video context for holistic relevance decisions
            videoTopic: this.config.videoTopic,
            spineBeats: this.config.spineBeats,
          }
        );

        if (!validation.isValid) {
          console.log(`${this.logPrefix} Shot ${index}: Candidate ${candidate.id} invalid (${validation.failureReason}): ${validation.details}`);
          
          // DEFERRED DELETION: Queue for deletion instead of immediate delete
          // This prevents race conditions where parallel shots haven't had a chance
          // to add their images to usedStockIds yet
          const isCorruptedFile = validation.details?.includes('Corrupted image');
          if (validation.failureReason !== 'error' || isCorruptedFile) {
            this.pendingDeletions.set(candidate.id, candidate.r2_key);
            console.log(`${this.logPrefix} Shot ${index}: Candidate ${candidate.id} queued for deletion`);
          }
          
          // Continue to next candidate
          continue;
        }

        // Valid image!
        const ref: StockMediaRef = {
          id: candidate.id,
          url: candidate.url,
          thumbnailUrl: candidate.thumbnailUrl || candidate.url,
          description: candidate.description,
          similarity: candidate.similarity,
        };
        
        validRefs.push(ref);
        this.usedStockIds.add(candidate.id);
        console.log(`${this.logPrefix} Shot ${index}: Validated match ${validRefs.length}/${imageCount} with ${candidate.id}`);
        
        // Stop if we have enough images
        if (validRefs.length >= imageCount) {
          break;
        }
      } catch (validationError) {
        console.error(`${this.logPrefix} Shot ${index}: Validation failed for ${candidate.id}:`, validationError);
        // On validation error, skip this candidate and try next
        continue;
      }
    }

    // =========================================================================
    // RETURN MATCHED SHOT OR FALLBACK
    // =========================================================================
    if (validRefs.length > 0) {
      // Check for partial match on multi-image shot
      if (imageCount > 1 && validRefs.length < imageCount) {
        // PARTIAL MATCH: Ask AI to reconsider the shot strategy
        console.log(`${this.logPrefix} Shot ${index}: Partial match (${validRefs.length}/${imageCount}), asking AI to reconsider`);
        return this.reconsiderShotStrategy(shot, validRefs, imageCount);
      }
      
      // Full match
      if (imageCount > 1) {
        // Multi-image shot with all images found
        console.log(`${this.logPrefix} Shot ${index}: Matched ${validRefs.length} images for multi-image shot`);
        return this.buildMultiImageShot(shot, validRefs);
      } else {
        // Single image shot
        return this.buildMatchedShot(shot, sortedCandidates.find(c => c.id === validRefs[0].id)!);
      }
    }

    // No valid candidates found
    console.log(`${this.logPrefix} Shot ${index}: No valid candidates after validation, using fallback`);
    const mediaType = shot.media_type || this.getFallbackFromContentType(shot.content_type);
    
    return {
      ...shot,
      media_type: mediaType,
      fallback_type: mediaType,
    };
  }

  /**
   * AI reconsideration when partial stock media match.
   * Called when a multi-image shot doesn't find enough stock images.
   * AI decides: use found images + AI-gen, or switch entirely to AI video.
   */
  private async reconsiderShotStrategy(
    shot: ShotPart1,
    foundRefs: StockMediaRef[],
    requestedCount: number
  ): Promise<ShotWithStockMedia> {
    const { generateJSON } = await import('@/lib/ai/openrouter');
    
    try {
      const response = await generateJSON<{
        decision: 'use_partial' | 'all_ai_images' | 'ai_video';
        reasoning: string;
        updated_summary?: string;
      }>(
        this.config.userId,
        `You are a visual director making a strategic decision about a video shot.

The shot was originally planned to use ${requestedCount} stock images, but only ${foundRefs.length} could be found.

Your options:
1. "use_partial" - Use the ${foundRefs.length} found stock images and fill the rest with AI-generated images
   - Choose this if the found images are central to the shot and AI can fill supporting roles
   - Example: 2/3 historical photos found, AI can generate a complementary scene

2. "all_ai_images" - Discard stock images and use all AI-generated images in a motiongraphic
   - Choose this if mixing stock + AI would look inconsistent
   - Example: Found 1/4 images, better to have unified AI aesthetic

3. "ai_video" - Switch to AI-generated video entirely
   - Choose this if the shot needs fluid motion or the concept works better as video
   - Example: Abstract concepts, emotional beats, action sequences

Consider: visual consistency, the shot's purpose, and what would look best on screen.`,
        `Shot details:
- Summary: "${shot.summary}"
- Original plan: ${requestedCount} images (motiongraphic)
- Found: ${foundRefs.length} stock images
- Stock descriptions: ${foundRefs.map(r => r.description).join(', ')}
- Content type: ${shot.content_type}

What's your decision? Return JSON:
{
  "decision": "use_partial" | "all_ai_images" | "ai_video",
  "reasoning": "Brief explanation",
  "updated_summary": "Optional: new summary if changing approach"
}`
      );

      console.log(`${this.logPrefix} AI reconsideration: ${response.decision} - ${response.reasoning}`);

      switch (response.decision) {
        case 'use_partial':
          // Use found refs + mark remaining as AI-gen
          return {
            ...shot,
            media_type: 'motiongraphic',
            summary: response.updated_summary || shot.summary,
            stock_media_ref: foundRefs[0],
            stock_media_refs: foundRefs,
            // image_count stays the same - renderer knows to fill with AI
          };
          
        case 'all_ai_images':
          // Motiongraphic with all AI images
          return {
            ...shot,
            media_type: 'motiongraphic',
            fallback_type: 'motiongraphic',
            summary: response.updated_summary || shot.summary,
            // Clear stock refs - all AI
            stock_media_ref: undefined,
            stock_media_refs: undefined,
          };
          
        case 'ai_video':
        default:
          // Full AI video
          return {
            ...shot,
            media_type: 'video',
            fallback_type: 'video',
            summary: response.updated_summary || shot.summary,
            image_count: undefined, // No longer multi-image
            stock_media_ref: undefined,
            stock_media_refs: undefined,
          };
      }
    } catch (error) {
      console.error(`${this.logPrefix} AI reconsideration failed, defaulting to AI video:`, error);
      // Safe fallback: AI video
      return {
        ...shot,
        media_type: 'video',
        fallback_type: 'video',
      };
    }
  }

  /**
   * Build a matched shot result with multiple stock media references.
   */
  private buildMultiImageShot(shot: ShotPart1, refs: StockMediaRef[]): ShotWithStockMedia {
    // Append @(StockMedia:id) references for all images
    let updatedSummary = shot.summary || '';
    refs.forEach(ref => {
      if (!updatedSummary.includes(`@(StockMedia:${ref.id})`)) {
        updatedSummary = `${updatedSummary.trim()} @(StockMedia:${ref.id})`;
      }
    });

    return {
      ...shot,
      media_type: 'motiongraphic', // Multi-image is always motiongraphic
      summary: updatedSummary,
      stock_media_ref: refs[0], // Keep first for backwards compatibility
      stock_media_refs: refs,
    };
  }

  /**
   * Search vector DB for a single shot.
   * Used for on-demand retry after Serper search stores new images.
   * @param shot - The shot to search for
   * @param index - Shot index for logging
   * @param matchCount - Optional number of candidates to return (default: MAX_CANDIDATES_PER_SHOT)
   */
  private async searchVectorDBForShot(shot: ShotPart1, index: number, matchCount?: number): Promise<StockMediaCandidate[]> {
    const supabase = getSupabaseServiceClient();
    
    try {
      const searchQuery = this.buildSearchQuery(shot);
      const embedding = await generateEmbedding(searchQuery);
      
      const { data, error } = await supabase.rpc('match_stock_media_for_video', {
        query_embedding: embedding,
        match_threshold: SIMILARITY_THRESHOLD,
        match_count: matchCount || MAX_CANDIDATES_PER_SHOT,
        p_user_id: this.config.userId,
        p_video_id: this.config.videoId,
      });

      if (error) {
        console.warn(`${this.logPrefix} Vector search retry failed for shot ${index}:`, error);
        return [];
      }

      return (data || []).map((row: any) => {
        const m = row.metadata || {};
        return {
          id: row.id,
          r2_key: row.r2_key,
          source: row.source || m.source || 'other',
          similarity: row.similarity || 0,
          mediaType: m.mediaType || 'image',
          description: m.description || m.title || '',
          url: m.url || '',
          thumbnailUrl: m.thumbnailUrl || '',
          subjects: m.subjects,
          mood: m.mood,
          metadata: m,
        };
      });
    } catch (error) {
      console.warn(`${this.logPrefix} Vector search retry failed for shot ${index}:`, error);
      return [];
    }
  }


  /**
   * Build a matched shot result with stock media reference.
   */
  private buildMatchedShot(shot: ShotPart1, candidate: StockMediaCandidate): ShotWithStockMedia {
    const stockMediaRef: StockMediaRef = {
      id: candidate.id,
      url: candidate.url,
      thumbnailUrl: candidate.thumbnailUrl || candidate.url,
      description: candidate.description,
      similarity: candidate.similarity,
    };

    const updatedSummary = this.appendStockMediaReference(shot.summary || '', candidate.id);

    return {
      ...shot,
      // For stock matches, use video (since stock can be image or video)
      media_type: (candidate.mediaType === 'video' ? 'video' : shot.media_type) || 'video' as 'video' | 'motiongraphic',
      summary: updatedSummary,
      stock_media_ref: stockMediaRef,
    };
  }

  /**
   * Append @(StockMedia:id) reference to the shot summary.
   */
  private appendStockMediaReference(summary: string, stockMediaId: string): string {
    // Check if already has a stock media reference
    if (summary.includes('@(StockMedia:')) {
      return summary;
    }
    
    // Append the reference
    return `${summary.trim()} @(StockMedia:${stockMediaId})`;
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a Stock Media Director instance.
 * This is the preferred way to instantiate the director.
 */
export function createStockMediaDirector(config: StockMediaDirectorConfig): StockMediaDirector {
  return new StockMediaDirector(config);
}

/**
 * Process shots with stock media matching.
 * Convenience function for one-shot usage.
 */
export async function processWithStockMedia(
  userId: string,
  videoId: string,
  shots: ShotPart1[],
  stockMediaLevel: StockMediaDirectorConfig['stockMediaLevel'],
  options?: {
    /** Overall video topic/title for contextual relevance decisions */
    videoTopic?: string;
    /** Main spine beats/sections for understanding story structure */
    spineBeats?: string[];
    /** Visual style/aesthetic for tone-appropriate matching (Fix 8) */
    visualStyle?: string;
  }
): Promise<ShotWithStockMedia[]> {
  const director = createStockMediaDirector({
    userId,
    videoId,
    stockMediaLevel,
    videoTopic: options?.videoTopic,
    spineBeats: options?.spineBeats,
    visualStyle: options?.visualStyle,
  });

  return director.processShots(shots);
}

