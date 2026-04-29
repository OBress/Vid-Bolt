/**
 * Cost Pricing Constants
 * ============================================================================
 * Single source of truth for all unit pricing used in cost tracking.
 * All amounts are in USD.
 *
 * LLM costs: captured live from the API response (`usage.cost` field from
 * OpenRouter; approximate model cost from Inworld Router).
 * All other categories use the constants defined below.
 */

// ============================================================================
// GCP VM — GPU node
// ============================================================================

/** Hourly compute rate while VM is in RUNNING state (SPOT pricing estimate). */
export const VM_HOURLY_RATE_USD = 1.90;

/** Flat daily ownership fee from the day the VM is provisioned (whether on or off). */
export const VM_DAILY_FLAT_RATE_USD = 2.00;

// ============================================================================
// TTS — Inworld AI
// ============================================================================

/** Cost per character for each Inworld TTS model, in USD. */
export const TTS_PRICING_USD_PER_CHAR: Record<string, number> = {
  'inworld-tts-1.5-max': 0.000016,
  'inworld-tts-1.5-mini': 0.000008,
};

/** Fallback when model is not found in the map. */
export const TTS_DEFAULT_PRICE_USD_PER_CHAR = 0.000016;

/**
 * Look up the per-character price for a TTS model name or voice ID.
 * Falls back to the default rate if the model is unknown.
 */
export function getTtsPricePerChar(modelOrVoice: string): number {
  return TTS_PRICING_USD_PER_CHAR[modelOrVoice] ?? TTS_DEFAULT_PRICE_USD_PER_CHAR;
}

// ============================================================================
// Search APIs
// ============================================================================

/** Serper image/web search cost per query. */
export const SERPER_PER_QUERY_USD = 0.0003;

/**
 * Valyu Search CPM (cost per 1,000 results) by search type.
 * These are the standard tier rates. Actual cost may be lower if max_price
 * cap truncates results. DeepResearch returns an exact `cost` field.
 */
export const VALYU_SEARCH_CPM_USD: Record<string, number> = {
  web: 1.50,
  proprietary: 1.00,
  financial: 8.00,
};

/** Default Valyu CPM when search_type is unknown. */
export const VALYU_SEARCH_CPM_DEFAULT_USD = 1.50;

/**
 * Estimate the USD cost for a Valyu search call.
 * @param numResults - Number of results returned
 * @param searchType - The search_type parameter used ('web', 'proprietary', 'financial')
 */
export function estimateValyuSearchCostUsd(
  numResults: number,
  searchType: string = 'web'
): number {
  const cpm = VALYU_SEARCH_CPM_USD[searchType] ?? VALYU_SEARCH_CPM_DEFAULT_USD;
  return (numResults / 1000) * cpm;
}

// ============================================================================
// LLM Token Pricing — fallback when provider doesn't return usage.cost
// ============================================================================

/**
 * Approximate $/1M-token pricing for common models (input, output).
 * Used when the API response doesn't include an exact cost (e.g. Inworld Router).
 */
export const LLM_TOKEN_PRICING: Record<string, { input: number; output: number }> = {
  // Gemini 3 via Inworld Router
  'google-ai-studio/gemini-3-flash-preview':   { input: 0.10, output: 0.40 },
  'google-ai-studio/gemini-3-pro-preview':     { input: 1.25, output: 10.00 },
  // OpenRouter paths (also used for estimates when usage.cost is missing)
  'google/gemini-3-flash-preview':             { input: 0.10, output: 0.40 },
  'google/gemini-3-pro-preview':               { input: 1.25, output: 10.00 },
  'anthropic/claude-sonnet-4':                 { input: 3.00, output: 15.00 },
  'anthropic/claude-3.5-sonnet':               { input: 3.00, output: 15.00 },
};

/** Fallback pricing when model not found — uses a conservative mid-range estimate. */
const LLM_FALLBACK_PRICING = { input: 0.50, output: 2.00 };

/**
 * Estimate the USD cost for an LLM call from token counts.
 * Used as a fallback for providers that don't return exact cost.
 *
 * @param model - The model ID (e.g. 'google-ai-studio/gemini-3-flash-preview')
 * @param promptTokens - Number of input/prompt tokens
 * @param completionTokens - Number of output/completion tokens
 * @returns Estimated cost in USD
 */
export function estimateLlmCostFromTokens(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  // Direct match first
  let pricing = LLM_TOKEN_PRICING[model];

  // Try suffix match (e.g. 'gemini-3-flash-preview' matches multiple provider prefixes)
  if (!pricing) {
    const modelSuffix = model.split('/').pop() || '';
    const match = Object.entries(LLM_TOKEN_PRICING).find(
      ([k]) => k.endsWith(modelSuffix)
    );
    if (match) pricing = match[1];
  }

  if (!pricing) pricing = LLM_FALLBACK_PRICING;

  return (promptTokens / 1_000_000) * pricing.input
       + (completionTokens / 1_000_000) * pricing.output;
}

// ============================================================================
// Admin-only: Storage and Hosting
// ============================================================================

/** Cloudflare R2 storage: cost per GB per month. */
export const R2_STORAGE_GB_MONTH_USD = 0.015;

/** Cloudflare R2 Class A operations (writes): cost per million ops. */
export const R2_CLASS_A_OPS_PER_MILLION_USD = 4.50;

/** Cloudflare R2 Class B operations (reads): cost per million ops. */
export const R2_CLASS_B_OPS_PER_MILLION_USD = 0.36;

// ============================================================================
// Cost category type
// ============================================================================

export type CostCategory =
  | 'llm'
  | 'tts'
  | 'gcp_vm'
  | 'aws_lambda'
  | 'search_valyu'
  | 'search_serper'
  | 'r2_storage';

export type CostService =
  | 'openrouter'
  | 'inworld_router'
  | 'inworld_tts'
  | 'gcp'
  | 'aws'
  | 'cloudflare'
  | 'valyu'
  | 'serper';

/** Human-readable labels for each category used in charts and tables. */
export const CATEGORY_LABELS: Record<CostCategory, string> = {
  llm: 'LLM',
  tts: 'Audio / TTS',
  gcp_vm: 'GCP VM',
  aws_lambda: 'AWS Lambda',
  search_valyu: 'Valyu Search',
  search_serper: 'Serper Search',
  r2_storage: 'R2 Storage',
};

/** Chart colors for each cost category (HSL). */
export const CATEGORY_COLORS: Record<CostCategory, string> = {
  llm: 'hsl(220, 90%, 56%)',
  tts: 'hsl(280, 100%, 65%)',
  gcp_vm: 'hsl(160, 84%, 39%)',
  aws_lambda: 'hsl(45, 93%, 47%)',
  search_valyu: 'hsl(20, 90%, 48%)',
  search_serper: 'hsl(10, 85%, 55%)',
  r2_storage: 'hsl(200, 98%, 39%)',
};

/** Emoji icons for each category. */
export const CATEGORY_ICONS: Record<CostCategory, string> = {
  llm: '🤖',
  tts: '🔊',
  gcp_vm: '🖥️',
  aws_lambda: '⚡',
  search_valyu: '🔍',
  search_serper: '🔎',
  r2_storage: '☁️',
};
