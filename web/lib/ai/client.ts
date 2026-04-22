/**
 * Universal LLM Client
 * ============================================================================
 * Provider-agnostic implementation of all LLM call patterns.
 *
 * This module dispatches every call to the active provider via the registry.
 * All cross-cutting concerns live here:
 *   - Per-user concurrency throttling (Redis-backed semaphore)
 *   - Global rate-limit detection and backoff (per-provider)
 *   - Automatic retry with exponential backoff
 *   - Cost tracking integration
 *   - Multimodal support (text, image, video content parts)
 *   - Streaming (async generator, SSE parsing)
 *   - Consistent error handling and truncation warnings
 *
 * USAGE PATTERN A — userId-based (BullMQ workers, background jobs):
 *   The active provider is resolved from the user's stored preferences in
 *   Supabase. The API key is fetched automatically.
 *
 *     import { callLLM, generateJSON } from '@/lib/ai/client';
 *     const result = await callLLM(userId, messages, config);
 *
 * USAGE PATTERN B — key-based (Next.js API routes):
 *   The caller pre-fetches the provider config (key + providerId) then passes
 *   them directly. No per-user throttle is applied (user-triggered, not batch).
 *
 *     import { callLLMWithKey } from '@/lib/ai/client';
 *     const { apiKey, provider } = await getLlmProviderConfig(userId);
 *     const result = await callLLMWithKey(apiKey, messages, config, provider);
 *
 * WEB SEARCH — always served by OpenRouter regardless of active provider:
 *   Inworld Router does not support a web-search plugin. The generateWithWebSearch
 *   and generateJSONWithWebSearch functions are always pinned to OpenRouter.
 */

import { createClient } from '@supabase/supabase-js';
import {
  acquireSlot,
  releaseSlot,
  signalRateLimited,
  waitIfRateLimited,
} from '@/lib/queues/rate-limiter';
import { getProvider } from './registry';
import type {
  LlmProvider,
  LLMMessage,
  LLMConfig,
  LLMResponse,
  ResolvedLLMConfig,
  UrlCitation,
  WebSearchPlugin,
} from './providers/types';

// ============================================================================
// RE-EXPORTS (convenience — callers can import types from here)
// ============================================================================

export type { LlmProvider, LLMMessage, LLMConfig, LLMResponse, UrlCitation, WebSearchPlugin };

// Legacy type aliases for backward compat with existing imports
export type OpenRouterMessageContent = LLMMessage['content'];
export type OpenRouterMessage = LLMMessage;
export type OpenRouterConfig = LLMConfig;
export type OpenRouterResponse = LLMResponse;
export type { TextContentPart, ImageContentPart, VideoContentPart } from './providers/types';

// ============================================================================
// CONSTANTS
// ============================================================================

const LOG_PREFIX = '[LLM Client]';

/** Default model constants (re-exported for callers that reference them directly). */
export const QUALITY_REVIEW_MODEL = 'google/gemini-3-flash-preview'; // OpenRouter
export const QUALITY_REVIEW_CONFIG: Partial<LLMConfig> = {
  model: 'google/gemini-3-pro-preview',
  temperature: 0.3,
  maxTokens: 131072,
};

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: Required<Omit<LLMConfig, 'webSearch' | 'responseFormat' | 'timeoutMs' | 'model' | 'trackingUserId' | 'trackingVideoId'>> & { model?: string } = {
  model: undefined, // resolved from adapter.defaultModel at call time
  temperature: 0.7,
  maxTokens: 131072,
  topP: 0.95,
  webSearchContextSize: 'medium',
  maxRetries: 3,
  xTitle: 'Vid-Bolt',
};

// ============================================================================
// INTERNAL: config resolution
// ============================================================================

function resolveConfig(
  adapter: ReturnType<typeof getProvider>,
  config: LLMConfig
): ResolvedLLMConfig {
  return {
    model: config.model ?? adapter.defaultModel,
    temperature: config.temperature ?? DEFAULT_CONFIG.temperature,
    maxTokens: config.maxTokens ?? DEFAULT_CONFIG.maxTokens,
    topP: config.topP ?? DEFAULT_CONFIG.topP,
    webSearchContextSize: config.webSearchContextSize ?? DEFAULT_CONFIG.webSearchContextSize,
    maxRetries: config.maxRetries ?? DEFAULT_CONFIG.maxRetries,
    xTitle: config.xTitle ?? DEFAULT_CONFIG.xTitle,
    webSearch: config.webSearch,
    responseFormat: config.responseFormat,
    timeoutMs: config.timeoutMs,
    trackingUserId: config.trackingUserId,
    trackingVideoId: config.trackingVideoId,
  };
}

// ============================================================================
// INTERNAL: API key lookup (userId-based path)
// ============================================================================

interface ProviderInfo {
  provider: LlmProvider;
  apiKey: string;
}

async function getProviderInfo(userId: string): Promise<ProviderInfo> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase configuration missing');
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data, error } = await supabase
    .from('user_api_keys')
    .select('openrouter_key, inworld_router_key, llm_provider')
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to fetch LLM provider config: ${error.message}`);
  }

  const provider = (data?.llm_provider as LlmProvider | null) ?? 'openrouter';

  if (provider === 'inworld') {
    if (!data?.inworld_router_key) {
      throw new Error(
        'Inworld Router API key not configured. Please add your Inworld Router key in Settings → API Keys.'
      );
    }
    return { provider: 'inworld', apiKey: data.inworld_router_key };
  }

  // Default: OpenRouter
  if (!data?.openrouter_key) {
    throw new Error(
      'OpenRouter API key not configured. Please add your OpenRouter key in Settings → API Keys.'
    );
  }
  return { provider: 'openrouter', apiKey: data.openrouter_key };
}

/** Get OpenRouter key only — used for web-search functions that must always use OpenRouter. */
async function getOpenRouterKeyForUserId(userId: string): Promise<string> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) throw new Error('Supabase configuration missing');

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data, error } = await supabase
    .from('user_api_keys')
    .select('openrouter_key')
    .eq('user_id', userId)
    .single();

  if (error || !data?.openrouter_key) {
    throw new Error('OpenRouter API key not found for user');
  }
  return data.openrouter_key;
}

// ============================================================================
// INTERNAL: response parsing (provider-agnostic — both return OpenAI format)
// ============================================================================

async function parseResponse(
  response: Response,
  provider: LlmProvider,
  resolvedConfig: ResolvedLLMConfig,
  attempt: number,
  maxRetries: number
): Promise<{
  shouldRetry: boolean;
  result?: LLMResponse;
  error?: Error;
  backoffMs?: number;
}> {
  const responseText = await response.text();

  // HTML error pages
  if (
    responseText.trim().startsWith('<!DOCTYPE') ||
    responseText.trim().startsWith('<html')
  ) {
    return {
      shouldRetry: attempt < maxRetries - 1,
      error: new Error(`${provider} returned an error page. Status: ${response.status}`),
      backoffMs: Math.pow(2, attempt + 1) * 1000,
    };
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(responseText);
  } catch {
    return {
      shouldRetry: false,
      error: new Error(
        `Invalid JSON from ${provider}: ${responseText.substring(0, 200)}`
      ),
    };
  }

  if (!response.ok) {
    const errorObj = data.error as Record<string, unknown> | undefined;
    const errorMessage = (errorObj?.message as string) || `HTTP ${response.status}`;
    const errorMetadata = (errorObj?.metadata as Record<string, string>) || {};
    const providerName = errorMetadata.provider_name || 'unknown';
    const rawError = errorMetadata.raw || '';

    console.log(
      `${LOG_PREFIX} [${provider}] Error: status=${response.status}, provider=${providerName}, message="${errorMessage}"`
    );

    if (response.status === 429) {
      const retryAfterMatch = errorMessage.match(/retry.?after:?\s*(\d+)/i);
      const retryAfterSeconds = retryAfterMatch ? parseInt(retryAfterMatch[1]) : 60;
      signalRateLimited(provider, retryAfterSeconds);
    }

    const isImageError =
      response.status === 400 &&
      (rawError.includes('image is not valid') ||
        rawError.includes('Unable to process input image') ||
        rawError.includes('INVALID_ARGUMENT'));

    const isRetryable =
      !isImageError &&
      (response.status >= 500 ||
        response.status === 429 ||
        errorMessage.includes('rate limit') ||
        errorMessage.includes('overloaded'));

    if (isRetryable && attempt < maxRetries - 1) {
      const backoffMs = Math.pow(2, attempt + 1) * 1000;
      console.log(
        `${LOG_PREFIX} [${provider}] Retrying in ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries}): ${errorMessage}`
      );
      return {
        shouldRetry: true,
        error: new Error(`${provider} API error: ${errorMessage}`),
        backoffMs,
      };
    }

    return {
      shouldRetry: false,
      error: new Error(`${provider} API error: ${errorMessage}`),
    };
  }

  // Success path
  const choices = data.choices as Array<Record<string, unknown>> | undefined;
  const choice = choices?.[0];
  const message = choice?.message as Record<string, unknown> | undefined;
  const content = message?.content as string | undefined;

  if (!content) {
    return {
      shouldRetry: false,
      error: new Error(`Invalid response from ${provider} — no content in response`),
    };
  }

  // URL citations (OpenRouter web search annotations)
  const annotations = message?.annotations as
    | Array<{
        type: string;
        url_citation?: {
          url: string;
          title: string;
          content?: string;
          start_index?: number;
          end_index?: number;
        };
      }>
    | undefined;

  const citations = annotations
    ?.filter((a) => a.type === 'url_citation' && a.url_citation)
    .map((a) => ({
      url: a.url_citation!.url,
      title: a.url_citation!.title,
      content: a.url_citation!.content,
      startIndex: a.url_citation!.start_index,
      endIndex: a.url_citation!.end_index,
    }));

  // Cost tracking — capture exact cost from API response (OpenRouter returns usage.cost)
  try {
    const { getActiveCostTracker } = await import('@/lib/queues/cost-tracker');
    const tracker = getActiveCostTracker();
    const usage = data.usage as Record<string, number> | undefined;

    // Resolve cost: exact from provider, or estimated from token counts
    let exactCostUsd: number | undefined =
      typeof usage?.cost === 'number' && usage.cost > 0 ? usage.cost : undefined;
    let isEstimated = false;

    // If provider doesn't return exact cost (e.g. Inworld), estimate from token counts
    if (!exactCostUsd && usage && (usage.prompt_tokens || usage.completion_tokens)) {
      const { estimateLlmCostFromTokens } = await import('@/lib/costs/pricing');
      exactCostUsd = estimateLlmCostFromTokens(
        (data.model as string) || resolvedConfig.model,
        usage.prompt_tokens || 0,
        usage.completion_tokens || 0,
      );
      isEstimated = true;
    }

    if (tracker) {
      // Worker context — CostTracker is active, record the call
      tracker.addLlmCall(
        (data.model as string) || resolvedConfig.model,
        {
          promptTokens: usage?.prompt_tokens || 0,
          completionTokens: usage?.completion_tokens || 0,
          totalTokens: usage?.total_tokens || 0,
        },
        exactCostUsd,
        provider, // 'openrouter' | 'inworld'
        isEstimated,
      );
    } else if (exactCostUsd && exactCostUsd > 0 && resolvedConfig.trackingUserId) {
      // API route context — no CostTracker, emit standalone cost event
      try {
        const { emitCostEvent } = await import('@/lib/costs/emit-cost-event');
        await emitCostEvent({
          userId: resolvedConfig.trackingUserId,
          videoId: resolvedConfig.trackingVideoId || undefined,
          category: 'llm',
          service: provider === 'inworld' ? 'inworld_router' : 'openrouter',
          subLabel: (data.model as string) || resolvedConfig.model,
          amountUsd: exactCostUsd,
          rawUnits: {
            promptTokens: usage?.prompt_tokens || 0,
            completionTokens: usage?.completion_tokens || 0,
          },
          isEstimated,
          note: `API route: ${resolvedConfig.xTitle || 'unknown'}`,
        });
      } catch {
        // Non-critical — don't break the LLM call over a cost tracking failure
      }
    }
  } catch {
    // CostTracker not available — skip silently
  }

  const finishReason = (choice?.finish_reason as string) || 'stop';
  if (finishReason === 'length') {
    console.warn(
      `${LOG_PREFIX} [${provider}] ⚠️ Response TRUNCATED (finish_reason=length). ` +
        `Caller: "${resolvedConfig.xTitle}", ` +
        `Model: ${(data.model as string) || resolvedConfig.model}, ` +
        `max_tokens: ${resolvedConfig.maxTokens}, ` +
        `completion_tokens: ${(data.usage as Record<string, number> | undefined)?.completion_tokens ?? 'unknown'}.`
    );
  }

  const usage = data.usage as Record<string, number> | undefined;

  return {
    shouldRetry: false,
    result: {
      content,
      model: (data.model as string) || resolvedConfig.model,
      finishReason,
      usage: {
        promptTokens: usage?.prompt_tokens || 0,
        completionTokens: usage?.completion_tokens || 0,
        totalTokens: usage?.total_tokens || 0,
      },
      citations,
      provider,
    },
  };
}

// ============================================================================
// INTERNAL: core fetch loop (non-streaming)
// ============================================================================

async function callLLMInternal(
  provider: LlmProvider,
  apiKey: string,
  userId: string | null,
  messages: LLMMessage[],
  config: LLMConfig
): Promise<LLMResponse> {
  const adapter = getProvider(provider);
  const resolvedConfig = resolveConfig(adapter, config);
  const maxRetries = resolvedConfig.maxRetries;
  let lastError: Error | null = null;

  // Per-user concurrency slot (only for userId-based calls)
  let throttleToken: string | null = null;
  if (userId) {
    throttleToken = await acquireSlot(userId);
  }

  try {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      await waitIfRateLimited(provider);

      try {
        const requestBody = adapter.buildRequestBody(messages, resolvedConfig);
        const headers = adapter.buildHeaders(apiKey, resolvedConfig.xTitle);

        const response = await fetch(`${adapter.baseUrl}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
          signal:
            typeof resolvedConfig.timeoutMs === 'number'
              ? AbortSignal.timeout(resolvedConfig.timeoutMs)
              : undefined,
        });

        const parsed = await parseResponse(response, provider, resolvedConfig, attempt, maxRetries);

        if (parsed.result) return parsed.result;
        if (parsed.error) lastError = parsed.error;

        if (parsed.shouldRetry && parsed.backoffMs) {
          await new Promise((r) => setTimeout(r, parsed.backoffMs));
          continue;
        }

        if (parsed.error) throw parsed.error;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < maxRetries - 1 && error instanceof TypeError) {
          const backoffMs = Math.pow(2, attempt) * 1000;
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }

        throw lastError;
      }
    }

    throw lastError || new Error(`${provider} API call failed after ${maxRetries} retries`);
  } finally {
    if (userId && throttleToken) {
      await releaseSlot(userId, throttleToken);
    }
  }
}

// ============================================================================
// INTERNAL: streaming
// ============================================================================

async function* streamLLMInternal(
  provider: LlmProvider,
  apiKey: string,
  userId: string | null,
  messages: LLMMessage[],
  config: LLMConfig
): AsyncGenerator<string> {
  const adapter = getProvider(provider);
  const resolvedConfig = resolveConfig(adapter, config);

  let throttleToken: string | null = null;
  if (userId) {
    throttleToken = await acquireSlot(userId);
  }

  try {
    await waitIfRateLimited(provider);

    const requestBody = adapter.buildRequestBody(messages, resolvedConfig);
    requestBody.stream = true;
    const headers = adapter.buildHeaders(apiKey, resolvedConfig.xTitle);

    const response = await fetch(`${adapter.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const responseText = await response.text();
      if (response.status === 429) {
        signalRateLimited(provider, 60);
      }
      throw new Error(
        `${provider} streaming error: HTTP ${response.status} - ${responseText.substring(0, 200)}`
      );
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body for streaming');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice(6);
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // Skip malformed SSE chunks
        }
      }
    }
  } finally {
    if (userId && throttleToken) {
      await releaseSlot(userId, throttleToken);
    }
  }
}

// ============================================================================
// PUBLIC API — userId-based (workers, background jobs, BullMQ)
// ============================================================================

/**
 * Call the user's active LLM provider.
 * Resolves the provider and API key from the user's stored preferences.
 * Applies per-user concurrency throttling.
 */
export async function callLLM(
  userId: string,
  messages: LLMMessage[],
  config: LLMConfig = {}
): Promise<LLMResponse> {
  const { provider, apiKey } = await getProviderInfo(userId);
  return callLLMInternal(provider, apiKey, userId, messages, config);
}

/**
 * Stream the user's active LLM provider response as text chunks.
 */
export async function* streamLLM(
  userId: string,
  messages: LLMMessage[],
  config: LLMConfig = {}
): AsyncGenerator<string> {
  const { provider, apiKey } = await getProviderInfo(userId);
  yield* streamLLMInternal(provider, apiKey, userId, messages, config);
}

/**
 * Generate text from a system + user prompt pair.
 */
export async function generateText(
  userId: string,
  systemPrompt: string,
  userPrompt: string,
  config: LLMConfig = {}
): Promise<LLMResponse> {
  return callLLM(
    userId,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    config
  );
}

/**
 * Generate structured JSON output.
 * Uses constrained decoding when responseFormat is provided; otherwise
 * uses prompt injection + markdown stripping as fallback.
 */
export async function generateJSON<T = unknown>(
  userId: string,
  systemPrompt: string,
  userPrompt: string,
  config: LLMConfig = {}
): Promise<T> {
  if (config.responseFormat) {
    const response = await callLLM(
      userId,
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { ...config, temperature: config.temperature ?? 0.3 }
    );

    if (response.finishReason === 'length') {
      throw new Error(
        `Structured output truncated (finish_reason=length). ` +
          `completion_tokens=${response.usage.completionTokens}, ` +
          `model=${response.model}. Increase maxTokens.`
      );
    }

    try {
      return JSON.parse(response.content) as T;
    } catch (e) {
      console.error(`${LOG_PREFIX} Structured output parse failure:`, response.content.substring(0, 300));
      throw new Error(
        `Structured output parse error: ${e instanceof Error ? e.message : 'unknown'}`
      );
    }
  }

  // Fallback: prompt injection + markdown stripping
  const jsonSystemPrompt = `${systemPrompt}\n\nIMPORTANT: You must respond with valid JSON only. No markdown, no code blocks, just raw JSON.`;

  const response = await callLLM(
    userId,
    [
      { role: 'system', content: jsonSystemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { ...config, temperature: config.temperature ?? 0.3 }
  );

  try {
    let content = response.content.trim();
    if (content.startsWith('```json')) content = content.slice(7);
    if (content.startsWith('```')) content = content.slice(3);
    if (content.endsWith('```')) content = content.slice(0, -3);
    content = content.trim();

    const lastChar = content.charAt(content.length - 1);
    if (lastChar !== '}' && lastChar !== ']') {
      throw new Error(
        `Response appears truncated. Usage: prompt=${response.usage.promptTokens}, completion=${response.usage.completionTokens}`
      );
    }

    return JSON.parse(content) as T;
  } catch (parseError) {
    if (parseError instanceof Error && parseError.message.includes('truncated')) {
      throw parseError;
    }
    throw new Error(
      `Failed to parse JSON response: ${response.content.substring(0, 200)}`
    );
  }
}

// ============================================================================
// PUBLIC API — key-based (Next.js API routes, no per-user throttle)
// ============================================================================

/**
 * Call LLM with a pre-resolved API key.
 * Use in Next.js API routes where the key is already fetched.
 * No per-user throttle is applied (user-triggered single requests).
 *
 * @param apiKey     The resolved API key.
 * @param messages   Chat messages.
 * @param config     Optional config overrides.
 * @param providerId Which provider this key belongs to (default: 'openrouter').
 */
export async function callLLMWithKey(
  apiKey: string,
  messages: LLMMessage[],
  config: LLMConfig = {},
  providerId: LlmProvider = 'openrouter'
): Promise<LLMResponse> {
  return callLLMInternal(providerId, apiKey, null, messages, config);
}

/**
 * Stream LLM with a pre-resolved API key.
 */
export async function* streamLLMWithKey(
  apiKey: string,
  messages: LLMMessage[],
  config: LLMConfig = {},
  providerId: LlmProvider = 'openrouter'
): AsyncGenerator<string> {
  yield* streamLLMInternal(providerId, apiKey, null, messages, config);
}

// ============================================================================
// WEB SEARCH — always OpenRouter (Inworld has no web-search plugin)
// ============================================================================

/**
 * Generate text with web search enabled.
 * Always uses OpenRouter regardless of the user's active provider setting.
 */
export async function generateWithWebSearch(
  userId: string,
  systemPrompt: string,
  userPrompt: string,
  options: {
    maxResults?: number;
    searchContextSize?: 'low' | 'medium' | 'high';
  } = {}
): Promise<LLMResponse> {
  // Web search is OpenRouter-only — always fetch the OpenRouter key directly
  const apiKey = await getOpenRouterKeyForUserId(userId);
  return callLLMInternal(
    'openrouter',
    apiKey,
    userId,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    {
      webSearch: true,
      webSearchContextSize: options.searchContextSize || 'medium',
      temperature: 0.5,
    }
  );
}

/**
 * Generate JSON with web search enabled.
 * Always uses OpenRouter regardless of the user's active provider setting.
 */
export async function generateJSONWithWebSearch<T = unknown>(
  userId: string,
  systemPrompt: string,
  userPrompt: string,
  options: {
    model?: string;
    maxResults?: number;
    searchContextSize?: 'low' | 'medium' | 'high';
  } = {}
): Promise<{ data: T; citations: UrlCitation[] }> {
  // Web search is OpenRouter-only
  const apiKey = await getOpenRouterKeyForUserId(userId);
  const jsonSystemPrompt = `${systemPrompt}\n\nIMPORTANT: You must respond with valid JSON only. No markdown, no code blocks, just raw JSON.`;

  const response = await callLLMInternal(
    'openrouter',
    apiKey,
    userId,
    [
      { role: 'system', content: jsonSystemPrompt },
      { role: 'user', content: userPrompt },
    ],
    {
      model: options.model,
      webSearch: true,
      webSearchContextSize: options.searchContextSize || 'medium',
      temperature: 0.3,
    }
  );

  try {
    let content = response.content.trim();
    if (content.startsWith('```json')) content = content.slice(7);
    if (content.startsWith('```')) content = content.slice(3);
    if (content.endsWith('```')) content = content.slice(0, -3);

    return {
      data: JSON.parse(content.trim()) as T,
      citations: response.citations || [],
    };
  } catch {
    throw new Error(
      `Failed to parse JSON web-search response: ${response.content.substring(0, 200)}`
    );
  }
}

// ============================================================================
// BACKWARD COMPAT — legacy named exports used by some callers
// (callOpenRouter, streamOpenRouter, etc. are re-exported in openrouter.ts)
// ============================================================================

/** @deprecated Use callLLM instead. Preserved for internal backward compat. */
export const callOpenRouter = callLLM;
/** @deprecated Use callLLMWithKey instead. */
export const callOpenRouterWithKey = callLLMWithKey;
/** @deprecated Use streamLLM instead. */
export const streamOpenRouter = streamLLM;
/** @deprecated Use streamLLMWithKey instead. */
export const streamOpenRouterWithKey = streamLLMWithKey;
