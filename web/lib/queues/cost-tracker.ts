/**
 * Cost Tracker
 * ============================================================================
 * Lightweight accumulator for tracking API costs during pipeline execution.
 *
 * Uses Node.js AsyncLocalStorage so that any `callLLM` / `callOpenRouter`
 * call anywhere in the async call tree automatically records to the active
 * tracker (via `lib/ai/client.ts` which calls `getActiveCostTracker()`).
 *
 * On save(), the tracker:
 *   1. Emits individual `cost_events` rows to the dedicated ledger table.
 *   2. Updates video_projects.metadata.costData (backward-compat blob).
 *
 * Usage in workers:
 *   const tracker = new CostTracker(stepNumber, userId);
 *   const result = await tracker.run(async () => {
 *     // All callLLM / generateJSON calls here are automatically tracked
 *     await executeResearchPhase(...);
 *     return result;
 *   });
 *   await tracker.save(videoId);
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import {
  getTtsPricePerChar,
  SERPER_PER_QUERY_USD,
  estimateValyuSearchCostUsd,
} from '@/lib/costs/pricing';

// ============================================================================
// TYPES
// ============================================================================

export interface LlmCallRecord {
  model: string;
  provider: string;       // 'openrouter' | 'inworld' | etc.
  promptTokens: number;
  completionTokens: number;
  /** Cost in USD — exact from API response (OpenRouter) or estimated from token counts (Inworld). */
  costUsd?: number;
  /** Whether costUsd was estimated from token counts rather than returned by the API. */
  isEstimated?: boolean;
}

export interface ValyuSearchRecord {
  searchType: string;
  numResults: number;
  estimatedCostUsd: number;
}

export interface ValyuDeepResearchRecord {
  exactCostUsd: number;
}

export interface StepCostData {
  /** LLM API calls with token usage and optional exact cost */
  llmCalls?: LlmCallRecord[];
  /** Valyu search calls with per-call cost estimates */
  valyuSearches?: ValyuSearchRecord[];
  /** Valyu DeepResearch calls with exact costs */
  valyuDeepResearches?: ValyuDeepResearchRecord[];
  /** Number of Serper image search queries */
  serperSearches?: number;
  /** Total GPU compute time in seconds (informational — not double-billed vs VM uptime) */
  totalGpuTimeSeconds?: number;
  /** TTS character count */
  ttsCharacters?: number;
  /** TTS model used */
  ttsModel?: string;
  /** Render duration in minutes (Remotion Lambda) */
  renderDurationMinutes?: number;
  /** Exact Lambda render cost from Remotion SDK */
  renderCostUsd?: number;
}

// ============================================================================
// ASYNC LOCAL STORAGE — global tracker context
// ============================================================================

const costTrackerStorage = new AsyncLocalStorage<CostTracker>();

/** Get the active CostTracker from the current async context (if any). */
export function getActiveCostTracker(): CostTracker | undefined {
  return costTrackerStorage.getStore();
}

// ============================================================================
// COST TRACKER CLASS
// ============================================================================

export class CostTracker {
  private step: number;
  private userId: string;
  private data: StepCostData = {};

  constructor(step: number, userId: string = '') {
    this.step = step;
    this.userId = userId;
  }

  /**
   * Run an async function within this tracker's context.
   * All LLM calls made inside will be automatically recorded.
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    return costTrackerStorage.run(this, fn);
  }

  // ---- LLM ----

  /**
   * Record an LLM call's token usage.
   * Called automatically by `lib/ai/client.ts` when a tracker is active.
   *
   * @param model - The resolved model name.
   * @param usage - Token counts.
   * @param costUsd - Exact cost from the API response (e.g. OpenRouter usage.cost).
   * @param provider - Which provider served the call ('openrouter' | 'inworld').
   */
  addLlmCall(
    model: string,
    usage: { promptTokens: number; completionTokens: number; totalTokens: number },
    costUsd?: number,
    provider: string = 'openrouter',
    isEstimated: boolean = false
  ): void {
    if (!this.data.llmCalls) this.data.llmCalls = [];
    this.data.llmCalls.push({
      model,
      provider,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      costUsd,
      isEstimated,
    });
  }

  // ---- Valyu ----

  /**
   * Record a Valyu Search API call.
   * @param numResults - Number of results returned.
   * @param searchType - 'web' | 'proprietary' | 'financial'
   */
  addValyuSearch(numResults: number = 1, searchType: string = 'web'): void {
    if (!this.data.valyuSearches) this.data.valyuSearches = [];
    const estimatedCostUsd = estimateValyuSearchCostUsd(numResults, searchType);
    this.data.valyuSearches.push({ searchType, numResults, estimatedCostUsd });
  }

  /**
   * Record a Valyu DeepResearch call with exact cost from the API response.
   * @param exactCostUsd - The `cost` field returned by the Valyu API.
   */
  addValyuDeepResearch(exactCostUsd: number): void {
    if (!this.data.valyuDeepResearches) this.data.valyuDeepResearches = [];
    this.data.valyuDeepResearches.push({ exactCostUsd });
  }

  // ---- Serper ----

  addSerperSearch(count: number = 1): void {
    this.data.serperSearches = (this.data.serperSearches || 0) + count;
  }

  // ---- GPU (informational only — billed via VM uptime) ----

  addGpuTime(seconds: number): void {
    this.data.totalGpuTimeSeconds = (this.data.totalGpuTimeSeconds || 0) + seconds;
  }

  // ---- TTS ----

  setTtsUsage(characters: number, model: string): void {
    this.data.ttsCharacters = characters;
    this.data.ttsModel = model;
  }

  // ---- Remotion Lambda ----

  setRenderDuration(minutes: number, exactCostUsd?: number): void {
    this.data.renderDurationMinutes = minutes;
    if (exactCostUsd !== undefined) {
      this.data.renderCostUsd = exactCostUsd;
    }
  }

  // ---- Accessors ----

  getData(): StepCostData {
    return { ...this.data };
  }

  getStep(): number {
    return this.step;
  }

  getUserId(): string {
    return this.userId;
  }

  /**
   * Compute the total estimated cost of all tracked events in USD.
   */
  computeTotalCostUsd(): number {
    let total = 0;

    // LLM
    for (const call of this.data.llmCalls ?? []) {
      total += call.costUsd ?? 0;
    }

    // Valyu Search (estimated)
    for (const search of this.data.valyuSearches ?? []) {
      total += search.estimatedCostUsd;
    }

    // Valyu DeepResearch (exact)
    for (const dr of this.data.valyuDeepResearches ?? []) {
      total += dr.exactCostUsd;
    }

    // Serper
    total += (this.data.serperSearches ?? 0) * SERPER_PER_QUERY_USD;

    // TTS
    if (this.data.ttsCharacters && this.data.ttsModel) {
      total += this.data.ttsCharacters * getTtsPricePerChar(this.data.ttsModel);
    }

    // Lambda
    total += this.data.renderCostUsd ?? 0;

    return total;
  }

  // ---- Persistence ----

  /**
   * Save accumulated cost data:
   *   1. Emit individual cost_events rows to the ledger table.
   *   2. Update video_projects.metadata.costData.stepN (backward compat).
   *
   * @param videoId - The video project ID to attribute costs to.
   */
  async save(videoId: string): Promise<void> {
    if (!videoId) return;

    const hasData = Object.keys(this.data).length > 0;
    if (!hasData) return;

    // Emit cost events to the ledger
    await this._emitCostEvents(videoId);

    // Also persist raw data blob for backward compat
    try {
      const { updateVideoContent } = await import('@/lib/services/video-service');
      await updateVideoContent(videoId, {
        metadata: {
          costData: {
            [`step${this.step}`]: {
              ...this.data,
              totalCostUsd: this.computeTotalCostUsd(),
            },
          },
        },
      });
      console.log(
        `[CostTracker] Saved step ${this.step} cost data for video ${videoId}` +
        (this.data.llmCalls ? ` (${this.data.llmCalls.length} LLM calls)` : '') +
        ` total=$${this.computeTotalCostUsd().toFixed(6)}`
      );
    } catch (error) {
      // Cost tracking failures should never break the pipeline
      console.error(`[CostTracker] Failed to save cost data for step ${this.step}:`, error);
    }
  }

  /**
   * Emit individual cost_events rows for each tracked category.
   */
  private async _emitCostEvents(videoId: string): Promise<void> {
    if (!this.userId) return; // Cannot emit without a userId

    try {
      const { emitCostEvents } = await import('@/lib/costs/emit-cost-event');
      const events = [];
      const now = new Date();

      // LLM calls — one event per call (groups by model in analytics)
      for (const call of this.data.llmCalls ?? []) {
        if ((call.costUsd ?? 0) > 0) {
          events.push({
            userId: this.userId,
            videoId,
            category: 'llm' as const,
            service: (call.provider === 'inworld' ? 'inworld_router' : 'openrouter') as any,
            subLabel: call.model,
            amountUsd: call.costUsd!,
            rawUnits: {
              promptTokens: call.promptTokens,
              completionTokens: call.completionTokens,
            },
            isEstimated: call.isEstimated ?? false,
            occurredAt: now,
          });
        }
      }

      // Valyu searches (estimated)
      for (const search of this.data.valyuSearches ?? []) {
        if (search.estimatedCostUsd > 0) {
          events.push({
            userId: this.userId,
            videoId,
            category: 'search_valyu' as const,
            service: 'valyu' as const,
            subLabel: search.searchType,
            amountUsd: search.estimatedCostUsd,
            rawUnits: { numResults: search.numResults },
            isEstimated: true,
            note: 'CPM estimate based on result count',
            occurredAt: now,
          });
        }
      }

      // Valyu DeepResearch (exact)
      for (const dr of this.data.valyuDeepResearches ?? []) {
        if (dr.exactCostUsd > 0) {
          events.push({
            userId: this.userId,
            videoId,
            category: 'search_valyu' as const,
            service: 'valyu' as const,
            subLabel: 'deep_research',
            amountUsd: dr.exactCostUsd,
            rawUnits: {},
            isEstimated: false,
            occurredAt: now,
          });
        }
      }

      // Serper
      if ((this.data.serperSearches ?? 0) > 0) {
        const serperCost = this.data.serperSearches! * SERPER_PER_QUERY_USD;
        events.push({
          userId: this.userId,
          videoId,
          category: 'search_serper' as const,
          service: 'serper' as const,
          amountUsd: serperCost,
          rawUnits: { queries: this.data.serperSearches! },
          isEstimated: false,
          occurredAt: now,
        });
      }

      // TTS (emitted by audio worker separately, skip here)
      // Lambda (emitted by render worker separately, skip here)

      if (events.length > 0) {
        await emitCostEvents(events);
      }
    } catch (err) {
      console.error('[CostTracker] Failed to emit cost events:', err);
    }
  }
}
