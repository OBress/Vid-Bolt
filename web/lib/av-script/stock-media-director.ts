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
import { evaluateShotMatch, decideFallbackType } from './shot-evaluator';

// ============================================================================
// TYPES
// ============================================================================

export interface StockMediaDirectorConfig {
  userId: string;
  videoId: string;
  stockMediaLevel: 'none' | 'standard_images' | 'extensive_images' | 'standard_images_video' | 'extensive_images_video';
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
  fallback_type?: 'motiongraphic' | 'ai_generated';
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

/** Fixed similarity threshold - not configurable per user request */
const SIMILARITY_THRESHOLD = 0.9;

/** Number of previous/next shots to include for context */
const CONTEXT_WINDOW_SIZE = 2;

/** Maximum candidates to evaluate per shot */
const MAX_CANDIDATES_PER_SHOT = 3;

/** Timeout for individual shot evaluation (ms) */
const SHOT_TIMEOUT_MS = 8000;

// ============================================================================
// MAIN DIRECTOR CLASS
// ============================================================================

export class StockMediaDirector {
  private config: StockMediaDirectorConfig;
  private logPrefix = '[StockMediaDirector]';

  constructor(config: StockMediaDirectorConfig) {
    this.config = config;
  }

  /**
   * Process all shots in parallel to match stock media or assign fallback types.
   * This is the main entry point for the Stock Media Director.
   */
  async processShots(shots: ShotPart1[]): Promise<ShotWithStockMedia[]> {
    console.log(`${this.logPrefix} Starting parallel processing for ${shots.length} shots`);
    console.log(`${this.logPrefix} Config: stockMediaLevel=${this.config.stockMediaLevel}, threshold=${SIMILARITY_THRESHOLD}`);

    // If stock media is disabled, assign fallback types directly
    if (this.config.stockMediaLevel === 'none') {
      console.log(`${this.logPrefix} Stock media disabled, assigning fallback types only`);
      return this.processShotsWithoutStockMedia(shots);
    }

    // Step 1: Build context windows for all shots
    const contexts = this.buildContextWindows(shots);

    // Step 2: Batch query vector DB for all shots (parallel)
    const allCandidates = await this.batchSearchVectorDB(shots);
    console.log(`${this.logPrefix} Vector DB returned candidates for ${Object.keys(allCandidates).filter(k => allCandidates[parseInt(k)]?.length > 0).length} shots`);

    // Step 3: Parallel evaluation with timeout protection
    const evaluationPromises = contexts.map((ctx, idx) =>
      this.evaluateShotWithTimeout(ctx, allCandidates[idx] || [])
    );

    const results = await Promise.all(evaluationPromises);

    // Step 4: Log summary
    const matched = results.filter(r => r.stock_media_ref).length;
    const fallbacks = results.filter(r => r.fallback_type).length;
    console.log(`${this.logPrefix} Complete: ${matched} shots matched, ${fallbacks} fallbacks assigned`);

    return results;
  }

  /**
   * Process shots when stock media is disabled - only assign fallback types.
   */
  private async processShotsWithoutStockMedia(shots: ShotPart1[]): Promise<ShotWithStockMedia[]> {
    const fallbackPromises = shots.map(async (shot) => {
      const fallbackType = await decideFallbackType(this.config.userId, shot);
      return {
        ...shot,
        media_type: fallbackType as 'image' | 'video' | 'motiongraphic',
        fallback_type: fallbackType,
      } as ShotWithStockMedia;
    });

    return Promise.all(fallbackPromises);
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
   */
  private async batchSearchVectorDB(shots: ShotPart1[]): Promise<Record<number, StockMediaCandidate[]>> {
    const results: Record<number, StockMediaCandidate[]> = {};

    // Import StockMediaService dynamically to avoid circular deps
    const { StockMediaService } = await import('@/lib/stock-media/service');
    const service = new StockMediaService();

    // Parallel search for all shots
    const searchPromises = shots.map(async (shot, index) => {
      try {
        // Build search query from shot summary + character/location refs
        const searchQuery = this.buildSearchQuery(shot);
        
        // Search with our fixed threshold
        const candidates = await service.search(searchQuery, MAX_CANDIDATES_PER_SHOT, SIMILARITY_THRESHOLD);
        
        // Map to our format
        results[index] = candidates.map(c => ({
          id: c.id,
          r2_key: c.r2_key,
          source: c.source,
          similarity: c.similarity || 0,
          mediaType: c.mediaType || 'image',
          description: c.description || '',
          url: c.url || '',
          thumbnailUrl: c.thumbnailUrl || '',
          subjects: c.subjects,
          mood: c.mood,
          metadata: c.metadata,
        }));
      } catch (error) {
        console.warn(`${this.logPrefix} Vector search failed for shot ${index}:`, error);
        results[index] = [];
      }
    });

    await Promise.all(searchPromises);
    return results;
  }

  /**
   * Build a search query from shot data for vector similarity.
   */
  private buildSearchQuery(shot: ShotPart1): string {
    const parts: string[] = [];

    // Primary: shot summary
    if (shot.summary) {
      // Remove any existing @() references for cleaner search
      parts.push(shot.summary.replace(/@\([^)]+\)/g, '').trim());
    }

    // Secondary: shot text (first 100 chars)
    if (shot.text) {
      parts.push(shot.text.substring(0, 100));
    }

    // Tertiary: content type context
    parts.push(shot.content_type);

    return parts.join('. ');
  }

  /**
   * Evaluate a shot with timeout protection.
   */
  private async evaluateShotWithTimeout(
    context: ShotContext,
    candidates: StockMediaCandidate[]
  ): Promise<ShotWithStockMedia> {
    const timeoutPromise = new Promise<ShotWithStockMedia>((resolve) => {
      setTimeout(() => {
        console.warn(`${this.logPrefix} Shot ${context.index} evaluation timed out, using fallback`);
        resolve({
          ...context.shot,
          media_type: 'motiongraphic',
          fallback_type: 'motiongraphic',
        });
      }, SHOT_TIMEOUT_MS);
    });

    const evaluationPromise = this.evaluateShot(context, candidates);

    return Promise.race([evaluationPromise, timeoutPromise]);
  }

  /**
   * Evaluate a single shot against candidates and decide on stock media or fallback.
   */
  private async evaluateShot(
    context: ShotContext,
    candidates: StockMediaCandidate[]
  ): Promise<ShotWithStockMedia> {
    const { shot, index } = context;

    // No candidates - go directly to fallback
    if (candidates.length === 0) {
      const fallbackType = await decideFallbackType(this.config.userId, shot);
      return {
        ...shot,
        media_type: fallbackType as 'image' | 'video' | 'motiongraphic',
        fallback_type: fallbackType,
        summary: shot.summary, // No stock media reference
      };
    }

    // Evaluate candidates with Gemini
    for (const candidate of candidates) {
      try {
        const evaluation = await evaluateShotMatch(
          this.config.userId,
          context,
          candidate
        );

        if (evaluation.isGoodMatch) {
          console.log(`${this.logPrefix} Shot ${index}: Matched with ${candidate.id} (narrative=${evaluation.narrativeFit}, technical=${evaluation.technicalFit})`);
          
          // Build the @(StockMedia:id) reference
          const stockMediaRef: StockMediaRef = {
            id: candidate.id,
            url: candidate.url,
            thumbnailUrl: candidate.thumbnailUrl || candidate.url,
            description: candidate.description,
            similarity: candidate.similarity,
          };

          // Append stock media reference to summary
          const updatedSummary = this.appendStockMediaReference(shot.summary || '', candidate.id);

          return {
            ...shot,
            media_type: candidate.mediaType as 'image' | 'video' | 'motiongraphic',
            summary: updatedSummary,
            stock_media_ref: stockMediaRef,
          };
        }
      } catch (error) {
        console.warn(`${this.logPrefix} Shot ${index} evaluation failed for candidate ${candidate.id}:`, error);
        // Continue to next candidate
      }
    }

    // No good match found - use fallback
    console.log(`${this.logPrefix} Shot ${index}: No match found, deciding fallback type`);
    const fallbackType = await decideFallbackType(this.config.userId, shot);
    
    return {
      ...shot,
      media_type: fallbackType as 'image' | 'video' | 'motiongraphic',
      fallback_type: fallbackType,
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
  stockMediaLevel: StockMediaDirectorConfig['stockMediaLevel']
): Promise<ShotWithStockMedia[]> {
  const director = createStockMediaDirector({
    userId,
    videoId,
    stockMediaLevel,
  });

  return director.processShots(shots);
}
