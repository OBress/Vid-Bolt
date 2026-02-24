/**
 * Cost Calculator
 * ============================================================================
 * Computes dynamic per-video cost breakdowns from pipeline metadata.
 *
 * Strategy:
 *  1. Check for exact `costData` in metadata (from instrumented workers)
 *  2. Fall back to estimation heuristics from available metadata fields
 *  3. Mark each line item as exact or estimated
 *
 * See docs/cost-estimation.md for methodology and pricing sources.
 */

import type { PipelineRun, PipelineStep, StepData } from '../types/pipeline-debugger';

// ============================================================================
// PRICING CONSTANTS — Last verified: February 2026
// ============================================================================

/** OpenRouter model pricing ($ per 1M tokens) */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'google/gemini-3-flash-preview': { input: 0.50, output: 3.00 },
  'google/gemini-3-pro-preview':   { input: 2.00, output: 12.00 },
};

/** Default model used by most pipeline steps */
export const DEFAULT_MODEL = 'google/gemini-3-flash-preview';

/** Valyu search/research API */
export const VALYU_COST_PER_SEARCH       = 0.10;  // $/search or $/deep-research

/** Serper Google Image Search */
export const SERPER_COST_PER_CREDIT      = 0.001; // $/credit (1 credit per search ≤10 results)

/** GCP g2-standard-8 + L4 GPU VM */
export const GPU_VM_COST_PER_HOUR        = 1.80;
export const GPU_VM_COST_PER_SECOND      = GPU_VM_COST_PER_HOUR / 3600;

/** Inworld TTS pricing ($ per 1M characters) */
export const INWORLD_TTS_MAX_PER_MILLION  = 10.00;
export const INWORLD_TTS_MINI_PER_MILLION = 5.00;

/** Remotion Lambda approximate cost */
export const REMOTION_COST_PER_MINUTE    = 0.02;

// ============================================================================
// ESTIMATION DEFAULTS (when no exact data is available)
// ============================================================================

/** Average GPU generation times in seconds by media type */
const GPU_TIME_ESTIMATES = {
  image: 12,
  video: 45,
  music: 30,
  sfx: 8,
};

/** Estimated token usage per step (input, output) for Flash model */
const LLM_TOKEN_ESTIMATES: Record<number, { input: number; output: number; model: string }> = {
  1: { input: 3000, output: 4000, model: DEFAULT_MODEL },
  3: { input: 8000, output: 12000, model: DEFAULT_MODEL },
  5: { input: 5000, output: 6000, model: DEFAULT_MODEL },
  7: { input: 4000, output: 3000, model: DEFAULT_MODEL },
};

/** Step 3 quality review uses Pro model — additional estimated cost */
const QUALITY_REVIEW_ESTIMATE = {
  input: 2000,
  output: 1000,
  model: 'google/gemini-3-pro-preview',
};

// ============================================================================
// TYPES
// ============================================================================

export interface CostLineItem {
  service: string;
  description: string;
  cost: number;
  isEstimated: boolean;
}

export interface StepCostBreakdown {
  step: PipelineStep;
  totalCost: number;
  isEstimated: boolean;
  items: CostLineItem[];
}

export interface VideoCostBreakdown {
  totalCost: number;
  steps: StepCostBreakdown[];
  hasExactData: boolean;
}

// ============================================================================
// LLM COST HELPERS
// ============================================================================

function calcLlmCost(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING[DEFAULT_MODEL];
  return (promptTokens / 1_000_000) * pricing.input +
         (completionTokens / 1_000_000) * pricing.output;
}

function formatTokens(prompt: number, completion: number): string {
  return `${prompt.toLocaleString()} in + ${completion.toLocaleString()} out tokens`;
}

// ============================================================================
// PER-STEP COST CALCULATORS
// ============================================================================

function calcStep1Cost(
  stepData: StepData,
  meta: Record<string, unknown>
): StepCostBreakdown {
  const items: CostLineItem[] = [];
  const costData = getStepCostData(meta, 1);

  // LLM costs
  if (costData?.llmCalls && Array.isArray(costData.llmCalls)) {
    let totalCost = 0;
    let totalPrompt = 0;
    let totalCompletion = 0;
    for (const call of costData.llmCalls as Array<{ model: string; promptTokens: number; completionTokens: number }>) {
      totalCost += calcLlmCost(call.model, call.promptTokens, call.completionTokens);
      totalPrompt += call.promptTokens;
      totalCompletion += call.completionTokens;
    }
    items.push({
      service: 'OpenRouter (Gemini Flash)',
      description: formatTokens(totalPrompt, totalCompletion),
      cost: totalCost,
      isEstimated: false,
    });
  } else if (stepData.status === 'complete') {
    const est = LLM_TOKEN_ESTIMATES[1];
    items.push({
      service: 'OpenRouter (Gemini Flash)',
      description: `~${formatTokens(est.input, est.output)}`,
      cost: calcLlmCost(est.model, est.input, est.output),
      isEstimated: true,
    });
  }

  // Valyu costs
  if (costData?.valyuSearches != null) {
    const count = Number(costData.valyuSearches) + Number(costData?.valyuDeepResearches || 0);
    items.push({
      service: 'Valyu Research',
      description: `${count} search${count !== 1 ? 'es' : ''}`,
      cost: count * VALYU_COST_PER_SEARCH,
      isEstimated: false,
    });
  } else if (stepData.status === 'complete') {
    // Estimate from research results
    const researchResults = meta.researchResults || meta.research_results;
    const estCount = researchResults ? 3 : 2;
    items.push({
      service: 'Valyu Research',
      description: `~${estCount} searches (est.)`,
      cost: estCount * VALYU_COST_PER_SEARCH,
      isEstimated: true,
    });
  }

  return buildStepBreakdown(1, items);
}

function calcStep2Cost(
  stepData: StepData,
  meta: Record<string, unknown>
): StepCostBreakdown {
  const items: CostLineItem[] = [];
  const costData = getStepCostData(meta, 2);

  if (costData?.serperSearches != null) {
    const count = Number(costData.serperSearches);
    items.push({
      service: 'Serper Image Search',
      description: `${count} search${count !== 1 ? 'es' : ''}`,
      cost: count * SERPER_COST_PER_CREDIT,
      isEstimated: false,
    });
  } else if (stepData.status === 'complete') {
    // Estimate from stock media results count
    const stockResults = meta.stockMediaResults;
    const estSearches = Array.isArray(stockResults) ? Math.max(3, Math.ceil((stockResults as unknown[]).length / 3)) : 5;
    items.push({
      service: 'Serper Image Search',
      description: `~${estSearches} searches (est.)`,
      cost: estSearches * SERPER_COST_PER_CREDIT,
      isEstimated: true,
    });
  }

  // Pixabay is always free
  if (stepData.status === 'complete') {
    items.push({
      service: 'Pixabay',
      description: 'Free tier',
      cost: 0,
      isEstimated: false,
    });
  }

  return buildStepBreakdown(2, items);
}

function calcStep3Cost(
  stepData: StepData,
  meta: Record<string, unknown>
): StepCostBreakdown {
  const items: CostLineItem[] = [];
  const costData = getStepCostData(meta, 3);

  if (costData?.llmCalls && Array.isArray(costData.llmCalls)) {
    // Group by model
    const byModel = groupLlmCalls(costData.llmCalls as Array<{ model: string; promptTokens: number; completionTokens: number }>);
    for (const [model, usage] of Object.entries(byModel)) {
      const modelLabel = model.includes('pro') ? 'Gemini Pro' : 'Gemini Flash';
      items.push({
        service: `OpenRouter (${modelLabel})`,
        description: formatTokens(usage.prompt, usage.completion),
        cost: calcLlmCost(model, usage.prompt, usage.completion),
        isEstimated: false,
      });
    }
  } else if (stepData.status === 'complete') {
    // Flash for beat expansion
    const est = LLM_TOKEN_ESTIMATES[3];
    items.push({
      service: 'OpenRouter (Gemini Flash)',
      description: `~${formatTokens(est.input, est.output)}`,
      cost: calcLlmCost(est.model, est.input, est.output),
      isEstimated: true,
    });
    // Pro for quality review
    items.push({
      service: 'OpenRouter (Gemini Pro)',
      description: `~${formatTokens(QUALITY_REVIEW_ESTIMATE.input, QUALITY_REVIEW_ESTIMATE.output)}`,
      cost: calcLlmCost(QUALITY_REVIEW_ESTIMATE.model, QUALITY_REVIEW_ESTIMATE.input, QUALITY_REVIEW_ESTIMATE.output),
      isEstimated: true,
    });
  }

  return buildStepBreakdown(3, items);
}

function calcStep4Cost(
  stepData: StepData,
  meta: Record<string, unknown>
): StepCostBreakdown {
  const items: CostLineItem[] = [];
  const costData = getStepCostData(meta, 4);

  if (costData?.ttsCharacters != null) {
    const chars = Number(costData.ttsCharacters);
    const model = (costData.ttsModel as string) || 'inworld-tts-1.5-max';
    const rate = model.includes('mini') ? INWORLD_TTS_MINI_PER_MILLION : INWORLD_TTS_MAX_PER_MILLION;
    items.push({
      service: `Inworld TTS (${model.includes('mini') ? 'Mini' : 'Max'})`,
      description: `${chars.toLocaleString()} characters`,
      cost: (chars / 1_000_000) * rate,
      isEstimated: false,
    });
  } else if (stepData.status === 'complete') {
    // Estimate from script_content or outputs
    const scriptContent = stepData.outputs?.scriptContent as string | undefined;
    const scriptFromMeta = meta.script_content as string | undefined;
    const text = scriptContent || scriptFromMeta || '';
    const chars = text.length || 5000; // fallback 5K chars
    const voiceModel = (stepData.config?.voiceModel as string) || '';
    const isMini = voiceModel.toLowerCase().includes('mini');
    const rate = isMini ? INWORLD_TTS_MINI_PER_MILLION : INWORLD_TTS_MAX_PER_MILLION;

    items.push({
      service: `Inworld TTS (${isMini ? 'Mini' : 'Max'})`,
      description: text.length ? `${chars.toLocaleString()} characters` : `~${chars.toLocaleString()} chars (est.)`,
      cost: (chars / 1_000_000) * rate,
      isEstimated: !text.length,
    });
  }

  return buildStepBreakdown(4, items);
}

function calcStep5Cost(
  stepData: StepData,
  meta: Record<string, unknown>
): StepCostBreakdown {
  const items: CostLineItem[] = [];
  const costData = getStepCostData(meta, 5);

  // LLM cost
  if (costData?.llmCalls && Array.isArray(costData.llmCalls)) {
    let totalCost = 0;
    let totalPrompt = 0;
    let totalCompletion = 0;
    for (const call of costData.llmCalls as Array<{ model: string; promptTokens: number; completionTokens: number }>) {
      totalCost += calcLlmCost(call.model, call.promptTokens, call.completionTokens);
      totalPrompt += call.promptTokens;
      totalCompletion += call.completionTokens;
    }
    items.push({
      service: 'OpenRouter (Gemini Flash)',
      description: formatTokens(totalPrompt, totalCompletion),
      cost: totalCost,
      isEstimated: false,
    });
  } else if (stepData.status === 'complete') {
    const est = LLM_TOKEN_ESTIMATES[5];
    items.push({
      service: 'OpenRouter (Gemini Flash)',
      description: `~${formatTokens(est.input, est.output)}`,
      cost: calcLlmCost(est.model, est.input, est.output),
      isEstimated: true,
    });
  }

  // Serper for reference images
  if (costData?.serperSearches != null) {
    const count = Number(costData.serperSearches);
    items.push({
      service: 'Serper Image Search',
      description: `${count} search${count !== 1 ? 'es' : ''}`,
      cost: count * SERPER_COST_PER_CREDIT,
      isEstimated: false,
    });
  } else if (stepData.status === 'complete') {
    const refImages = meta.assetReferenceImages;
    const estSearches = refImages && typeof refImages === 'object' ? Object.keys(refImages).length : 3;
    items.push({
      service: 'Serper Image Search',
      description: `~${estSearches} searches (est.)`,
      cost: estSearches * SERPER_COST_PER_CREDIT,
      isEstimated: true,
    });
  }

  return buildStepBreakdown(5, items);
}

function calcStep6Cost(
  stepData: StepData,
  meta: Record<string, unknown>
): StepCostBreakdown {
  const items: CostLineItem[] = [];
  const costData = getStepCostData(meta, 6);

  if (costData?.totalGpuTimeSeconds != null) {
    const seconds = Number(costData.totalGpuTimeSeconds);
    items.push({
      service: 'GPU VM ($1.80/hr)',
      description: `${seconds.toFixed(1)}s compute time`,
      cost: seconds * GPU_VM_COST_PER_SECOND,
      isEstimated: false,
    });
  } else if (stepData.status === 'complete') {
    // Estimate from generated media breakdown
    const generatedMedia = meta.generatedMedia as Array<Record<string, unknown>> | undefined;
    let estSeconds = 0;

    if (Array.isArray(generatedMedia) && generatedMedia.length > 0) {
      // Sum up generation_time if available on individual items
      let hasGenTime = false;
      for (const item of generatedMedia) {
        if (item.generation_time != null) {
          estSeconds += Number(item.generation_time);
          hasGenTime = true;
        } else {
          const type = (item.media_type as string) || 'image';
          estSeconds += (GPU_TIME_ESTIMATES as Record<string, number>)[type] || GPU_TIME_ESTIMATES.image;
        }
      }

      items.push({
        service: 'GPU VM ($1.80/hr)',
        description: hasGenTime
          ? `${estSeconds.toFixed(1)}s compute time (${generatedMedia.length} jobs)`
          : `~${estSeconds.toFixed(0)}s estimated (${generatedMedia.length} jobs)`,
        cost: estSeconds * GPU_VM_COST_PER_SECOND,
        isEstimated: !hasGenTime,
      });
    } else {
      // Rough fallback
      estSeconds = 200;
      items.push({
        service: 'GPU VM ($1.80/hr)',
        description: `~${estSeconds}s estimated`,
        cost: estSeconds * GPU_VM_COST_PER_SECOND,
        isEstimated: true,
      });
    }
  }

  return buildStepBreakdown(6, items);
}

function calcStep7Cost(
  stepData: StepData,
  meta: Record<string, unknown>
): StepCostBreakdown {
  const items: CostLineItem[] = [];
  const costData = getStepCostData(meta, 7);

  if (costData?.llmCalls && Array.isArray(costData.llmCalls)) {
    let totalCost = 0;
    let totalPrompt = 0;
    let totalCompletion = 0;
    for (const call of costData.llmCalls as Array<{ model: string; promptTokens: number; completionTokens: number }>) {
      totalCost += calcLlmCost(call.model, call.promptTokens, call.completionTokens);
      totalPrompt += call.promptTokens;
      totalCompletion += call.completionTokens;
    }
    items.push({
      service: 'OpenRouter (Gemini Flash)',
      description: formatTokens(totalPrompt, totalCompletion),
      cost: totalCost,
      isEstimated: false,
    });
  } else if (stepData.status === 'complete') {
    const est = LLM_TOKEN_ESTIMATES[7];
    items.push({
      service: 'OpenRouter (Gemini Flash)',
      description: `~${formatTokens(est.input, est.output)}`,
      cost: calcLlmCost(est.model, est.input, est.output),
      isEstimated: true,
    });
  }

  return buildStepBreakdown(7, items);
}

function calcStep8Cost(
  stepData: StepData,
  meta: Record<string, unknown>
): StepCostBreakdown {
  const items: CostLineItem[] = [];
  const costData = getStepCostData(meta, 8);

  if (costData?.renderDurationMinutes != null) {
    const mins = Number(costData.renderDurationMinutes);
    items.push({
      service: 'Remotion Lambda',
      description: `${mins.toFixed(1)} min render`,
      cost: mins * REMOTION_COST_PER_MINUTE,
      isEstimated: false,
    });
  } else if (stepData.status === 'complete') {
    // Estimate: typical 3-min video
    const estMins = 3;
    items.push({
      service: 'Remotion Lambda',
      description: `~${estMins} min render (est.)`,
      cost: estMins * REMOTION_COST_PER_MINUTE,
      isEstimated: true,
    });
  }

  return buildStepBreakdown(8, items);
}

// ============================================================================
// MAIN EXPORTS
// ============================================================================

const STEP_CALCULATORS: Record<number, (stepData: StepData, meta: Record<string, unknown>) => StepCostBreakdown> = {
  1: calcStep1Cost,
  2: calcStep2Cost,
  3: calcStep3Cost,
  4: calcStep4Cost,
  5: calcStep5Cost,
  6: calcStep6Cost,
  7: calcStep7Cost,
  8: calcStep8Cost,
};

/** Calculate cost for a single pipeline step */
export function calculateStepCost(
  step: PipelineStep,
  stepData: StepData,
  meta: Record<string, unknown>
): StepCostBreakdown {
  const calc = STEP_CALCULATORS[step];
  if (!calc) return { step, totalCost: 0, isEstimated: true, items: [] };
  return calc(stepData, meta);
}

/** Calculate total cost for an entire pipeline run */
export function calculateVideoCost(run: PipelineRun): VideoCostBreakdown {
  const steps = run.steps.map((stepData) =>
    calculateStepCost(stepData.step, stepData, run.metadata)
  );

  return {
    totalCost: steps.reduce((sum, s) => sum + s.totalCost, 0),
    steps,
    hasExactData: steps.every((s) => !s.isEstimated || s.totalCost === 0),
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function getStepCostData(
  meta: Record<string, unknown>,
  step: number
): Record<string, unknown> | null {
  const costData = meta.costData as Record<string, unknown> | undefined;
  if (!costData) return null;
  return (costData[`step${step}`] as Record<string, unknown>) || null;
}

function groupLlmCalls(
  calls: Array<{ model: string; promptTokens: number; completionTokens: number }>
): Record<string, { prompt: number; completion: number }> {
  const groups: Record<string, { prompt: number; completion: number }> = {};
  for (const call of calls) {
    if (!groups[call.model]) {
      groups[call.model] = { prompt: 0, completion: 0 };
    }
    groups[call.model].prompt += call.promptTokens;
    groups[call.model].completion += call.completionTokens;
  }
  return groups;
}

function buildStepBreakdown(
  step: PipelineStep,
  items: CostLineItem[]
): StepCostBreakdown {
  return {
    step,
    totalCost: items.reduce((sum, i) => sum + i.cost, 0),
    isEstimated: items.some((i) => i.isEstimated),
    items,
  };
}
