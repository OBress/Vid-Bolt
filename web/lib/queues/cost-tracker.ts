/**
 * Cost Tracker
 * ============================================================================
 * Lightweight accumulator for tracking API costs during pipeline execution.
 *
 * Uses Node.js AsyncLocalStorage so that any `callOpenRouter` call anywhere
 * in the async call tree automatically records to the active tracker.
 *
 * Usage in workers:
 *   const tracker = new CostTracker(stepNumber);
 *   const result = await tracker.run(async () => {
 *     // All generateText/generateJSON/callOpenRouter calls here are tracked
 *     await executeResearchPhase(...);
 *     return result;
 *   });
 *   await tracker.save(videoId);
 */

import { AsyncLocalStorage } from 'node:async_hooks';

// ============================================================================
// TYPES
// ============================================================================

export interface LlmCallRecord {
  model: string;
  promptTokens: number;
  completionTokens: number;
}

export interface StepCostData {
  /** LLM API calls with token usage */
  llmCalls?: LlmCallRecord[];
  /** Number of Valyu search calls */
  valyuSearches?: number;
  /** Number of Valyu deep research calls */
  valyuDeepResearches?: number;
  /** Number of Serper image search calls */
  serperSearches?: number;
  /** Total GPU compute time in seconds */
  totalGpuTimeSeconds?: number;
  /** TTS character count */
  ttsCharacters?: number;
  /** TTS model used */
  ttsModel?: string;
  /** Render duration in minutes (Remotion Lambda) */
  renderDurationMinutes?: number;
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
  private data: StepCostData = {};

  constructor(step: number) {
    this.step = step;
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
   * Called automatically by the OpenRouter module when a tracker is active.
   */
  addLlmCall(
    model: string,
    usage: { promptTokens: number; completionTokens: number; totalTokens: number }
  ): void {
    if (!this.data.llmCalls) this.data.llmCalls = [];
    this.data.llmCalls.push({
      model,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
    });
  }

  // ---- Valyu ----

  addValyuSearch(count: number = 1): void {
    this.data.valyuSearches = (this.data.valyuSearches || 0) + count;
  }

  addValyuDeepResearch(count: number = 1): void {
    this.data.valyuDeepResearches = (this.data.valyuDeepResearches || 0) + count;
  }

  // ---- Serper ----

  addSerperSearch(count: number = 1): void {
    this.data.serperSearches = (this.data.serperSearches || 0) + count;
  }

  // ---- GPU ----

  addGpuTime(seconds: number): void {
    this.data.totalGpuTimeSeconds = (this.data.totalGpuTimeSeconds || 0) + seconds;
  }

  // ---- TTS ----

  setTtsUsage(characters: number, model: string): void {
    this.data.ttsCharacters = characters;
    this.data.ttsModel = model;
  }

  // ---- Remotion ----

  setRenderDuration(minutes: number): void {
    this.data.renderDurationMinutes = minutes;
  }

  // ---- Accessors ----

  getData(): StepCostData {
    return { ...this.data };
  }

  getStep(): number {
    return this.step;
  }

  // ---- Persistence ----

  /**
   * Save accumulated cost data to video_projects.metadata.costData.stepN.
   * Uses deep merge via the merge_video_metadata RPC.
   */
  async save(videoId: string): Promise<void> {
    if (!videoId) return;

    const hasData = Object.keys(this.data).length > 0;
    if (!hasData) return;

    try {
      const { updateVideoContent } = await import('@/lib/services/video-service');
      await updateVideoContent(videoId, {
        metadata: {
          costData: {
            [`step${this.step}`]: this.data,
          },
        },
      });
      console.log(
        `[CostTracker] Saved step ${this.step} cost data for video ${videoId}` +
        (this.data.llmCalls ? ` (${this.data.llmCalls.length} LLM calls)` : '')
      );
    } catch (error) {
      // Cost tracking failures should never break the pipeline
      console.error(`[CostTracker] Failed to save cost data for step ${this.step}:`, error);
    }
  }
}
