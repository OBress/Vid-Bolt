/**
 * OpenRouter API Module
 * ============================================================================
 * Centralized interface for calling LLMs via OpenRouter.
 * 
 * All OpenRouter calls across the codebase should use this module to get:
 *   - Per-user concurrency throttling (Redis-backed)
 *   - Automatic retry with exponential backoff
 *   - Global 429 detection and rate limit signaling
 *   - Cost tracking integration
 *   - Multimodal support (text, image, video)
 *   - Streaming support (async generator)
 *   - Consistent error handling
 */

import { createClient } from "@supabase/supabase-js";
import {
  acquireSlot,
  releaseSlot,
  signalRateLimited,
  waitIfRateLimited,
} from "@/lib/queues/rate-limiter";

// ============================================================================
// CONSTANTS
// ============================================================================

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const LOG_PREFIX = "[OpenRouter]";

// ============================================================================
// TYPES — Message Content (multimodal)
// ============================================================================

/** A text content part. */
export interface TextContentPart {
  type: "text";
  text: string;
}

/** An image content part for vision models. */
export interface ImageContentPart {
  type: "image_url";
  image_url: { url: string; detail?: "high" | "low" | "auto" };
}

/** A video content part for video-capable models. */
export interface VideoContentPart {
  type: "video_url";
  video_url: { url: string };
}

/** Content can be a plain string or an array of multimodal parts. */
export type OpenRouterMessageContent =
  | string
  | Array<TextContentPart | ImageContentPart | VideoContentPart>;

export interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: OpenRouterMessageContent;
}

// ============================================================================
// TYPES — Configuration
// ============================================================================

/**
 * Web search plugin configuration.
 */
export interface WebSearchPlugin {
  id: "web";
  engine?: "native" | "exa";
  maxResults?: number;
  searchPrompt?: string;
}

/**
 * URL citation from web search results.
 */
export interface UrlCitation {
  url: string;
  title: string;
  content?: string;
  startIndex?: number;
  endIndex?: number;
}

export interface OpenRouterConfig {
  /** Model identifier (e.g., 'google/gemini-3-flash-preview'). */
  model?: string;
  /** Sampling temperature (0-2). */
  temperature?: number;
  /** Maximum tokens to generate. */
  maxTokens?: number;
  /** Top-p nucleus sampling. */
  topP?: number;
  /** Enable web search by setting to true or providing plugin config. */
  webSearch?: boolean | WebSearchPlugin;
  /** Web search context size for native search. */
  webSearchContextSize?: "low" | "medium" | "high";
  /**
   * Structured output format. Constrains the model at the token level
   * to produce JSON matching the given schema.
   */
  responseFormat?:
    | {
        type: "json_schema";
        json_schema: {
          name: string;
          strict: boolean;
          schema: Record<string, unknown>;
        };
      }
    | { type: "json_object" };
  /** Number of retry attempts for transient failures. Default: 3. */
  maxRetries?: number;
  /** Title sent to OpenRouter for tracking. Default: 'Vid-Bolt'. */
  xTitle?: string;
}

// ============================================================================
// TYPES — Response
// ============================================================================

export interface OpenRouterResponse {
  content: string;
  model: string;
  /** The finish reason: 'stop' (normal), 'length' (truncated), etc. */
  finishReason: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** URL citations from web search (if enabled). */
  citations?: UrlCitation[];
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: OpenRouterConfig = {
  model: "google/gemini-3-flash-preview",
  temperature: 0.7,
  maxTokens: 8192,
  topP: 0.95,
  maxRetries: 3,
  xTitle: "Vid-Bolt",
};

/** Quality review model — smarter, used for script quality assessment. */
export const QUALITY_REVIEW_MODEL = "google/gemini-3-pro-preview";

/** Config preset for quality review calls. */
export const QUALITY_REVIEW_CONFIG: Partial<OpenRouterConfig> = {
  model: QUALITY_REVIEW_MODEL,
  temperature: 0.3,
  maxTokens: 4096,
};

// ============================================================================
// API KEY RETRIEVAL
// ============================================================================

/**
 * Get the OpenRouter API key from Supabase for a given user.
 * Uses the service role client to bypass RLS.
 */
async function getApiKey(userId: string): Promise<string> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Supabase configuration missing");
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabase
    .from("user_api_keys")
    .select("openrouter_key")
    .eq("user_id", userId)
    .single();

  if (error || !data?.openrouter_key) {
    throw new Error("OpenRouter API key not found for user");
  }

  return data.openrouter_key;
}

// ============================================================================
// REQUEST BODY BUILDER
// ============================================================================

function buildRequestBody(
  messages: OpenRouterMessage[],
  config: Required<Pick<OpenRouterConfig, "model" | "temperature" | "maxTokens" | "topP">> &
    OpenRouterConfig
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    temperature: config.temperature,
    max_tokens: config.maxTokens,
    top_p: config.topP,
  };

  if (config.responseFormat) {
    body.response_format = config.responseFormat;
  }

  if (config.webSearch) {
    if (typeof config.webSearch === "boolean") {
      body.model = `${config.model}:online`;
    } else {
      body.plugins = [
        {
          id: config.webSearch.id,
          engine: config.webSearch.engine,
          max_results: config.webSearch.maxResults,
          search_prompt: config.webSearch.searchPrompt,
        },
      ];
    }
  }

  if (config.webSearchContextSize) {
    body.web_search_options = {
      search_context_size: config.webSearchContextSize,
    };
  }

  return body;
}

function buildHeaders(apiKey: string, xTitle: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    "HTTP-Referer":
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    "X-Title": xTitle,
  };
}

// ============================================================================
// RESPONSE PARSING
// ============================================================================

async function parseResponse(
  response: Response,
  mergedConfig: OpenRouterConfig,
  attempt: number,
  maxRetries: number
): Promise<{
  shouldRetry: boolean;
  result?: OpenRouterResponse;
  error?: Error;
  backoffMs?: number;
}> {
  const responseText = await response.text();

  // Check for HTML error pages
  if (
    responseText.trim().startsWith("<!DOCTYPE") ||
    responseText.trim().startsWith("<html")
  ) {
    return {
      shouldRetry: attempt < maxRetries - 1,
      error: new Error(
        `OpenRouter returned an error page. Status: ${response.status}`
      ),
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
        `Invalid JSON response from OpenRouter: ${responseText.substring(0, 200)}`
      ),
    };
  }

  if (!response.ok) {
    const errorObj = data.error as Record<string, unknown> | undefined;
    const errorMessage =
      (errorObj?.message as string) || `HTTP ${response.status}`;
    const errorMetadata = (errorObj?.metadata as Record<string, string>) || {};
    const providerName = errorMetadata.provider_name || "unknown";
    const rawError = errorMetadata.raw || "";

    console.log(
      `${LOG_PREFIX} Error: status=${response.status}, provider=${providerName}, message="${errorMessage}"`
    );

    // Signal global rate limit on 429
    if (response.status === 429) {
      const retryAfterMatch = errorMessage.match(
        /retry.?after:?\s*(\d+)/i
      );
      const retryAfterSeconds = retryAfterMatch
        ? parseInt(retryAfterMatch[1])
        : 60;
      signalRateLimited("openrouter", retryAfterSeconds);
    }

    // Non-retryable: bad request with image format issues
    const isImageError =
      response.status === 400 &&
      (rawError.includes("image is not valid") ||
        rawError.includes("Unable to process input image") ||
        rawError.includes("INVALID_ARGUMENT"));

    const isRetryable =
      !isImageError &&
      (response.status >= 500 ||
        response.status === 429 ||
        errorMessage.includes("rate limit") ||
        errorMessage.includes("overloaded"));

    if (isRetryable && attempt < maxRetries - 1) {
      const backoffMs = Math.pow(2, attempt + 1) * 1000;
      console.log(
        `${LOG_PREFIX} Retrying in ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries}): ${errorMessage}`
      );
      return {
        shouldRetry: true,
        error: new Error(`OpenRouter API error: ${errorMessage}`),
        backoffMs,
      };
    }

    return {
      shouldRetry: false,
      error: new Error(`OpenRouter API error: ${errorMessage}`),
    };
  }

  // Success
  const choices = data.choices as Array<Record<string, unknown>> | undefined;
  const choice = choices?.[0];
  const message = choice?.message as Record<string, unknown> | undefined;
  const content = message?.content as string | undefined;

  if (!content) {
    return {
      shouldRetry: false,
      error: new Error(
        "Invalid response from OpenRouter API - no content in response"
      ),
    };
  }

  // Extract citations from web search annotations
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
    ?.filter((a) => a.type === "url_citation" && a.url_citation)
    .map((a) => ({
      url: a.url_citation!.url,
      title: a.url_citation!.title,
      content: a.url_citation!.content,
      startIndex: a.url_citation!.start_index,
      endIndex: a.url_citation!.end_index,
    }));

  // Record usage to active CostTracker (if any)
  try {
    const { getActiveCostTracker } = await import(
      "@/lib/queues/cost-tracker"
    );
    const tracker = getActiveCostTracker();
    const usage = data.usage as Record<string, number> | undefined;
    if (tracker) {
      tracker.addLlmCall(
        (data.model as string) || mergedConfig.model!,
        {
          promptTokens: usage?.prompt_tokens || 0,
          completionTokens: usage?.completion_tokens || 0,
          totalTokens: usage?.total_tokens || 0,
        }
      );
    }
  } catch {
    // CostTracker not available (API routes) — skip
  }

  const finishReason =
    (choice?.finish_reason as string) || "stop";
  if (finishReason === "length") {
    console.warn(
      `${LOG_PREFIX} ⚠️ Response TRUNCATED (finish_reason=length). ` +
        `Model: ${(data.model as string) || mergedConfig.model}, ` +
        `max_tokens: ${mergedConfig.maxTokens}. Consider increasing maxTokens.`
    );
  }

  const usage = data.usage as Record<string, number> | undefined;

  return {
    shouldRetry: false,
    result: {
      content,
      model: (data.model as string) || mergedConfig.model!,
      finishReason,
      usage: {
        promptTokens: usage?.prompt_tokens || 0,
        completionTokens: usage?.completion_tokens || 0,
        totalTokens: usage?.total_tokens || 0,
      },
      citations,
    },
  };
}

// ============================================================================
// CORE: callOpenRouter (userId-based, with throttle)
// ============================================================================

/**
 * Call OpenRouter API with the given messages and configuration.
 * Includes per-user concurrency throttling, automatic retries, and cost tracking.
 *
 * @param userId - User ID for API key lookup and rate limit tracking
 * @param messages - Chat messages (supports multimodal content)
 * @param config - Optional configuration overrides
 */
export async function callOpenRouter(
  userId: string,
  messages: OpenRouterMessage[],
  config: OpenRouterConfig = {}
): Promise<OpenRouterResponse> {
  const apiKey = await getApiKey(userId);
  return callOpenRouterInternal(apiKey, userId, messages, config);
}

// ============================================================================
// CORE: callOpenRouterWithKey (API-key-based, no throttle)
// ============================================================================

/**
 * Call OpenRouter API with a raw API key.
 * Use this in API routes where the key is already available.
 * Rate limiting is not applied (API routes are user-triggered, not batch).
 *
 * @param apiKey - OpenRouter API key
 * @param messages - Chat messages (supports multimodal content)
 * @param config - Optional configuration overrides
 */
export async function callOpenRouterWithKey(
  apiKey: string,
  messages: OpenRouterMessage[],
  config: OpenRouterConfig = {}
): Promise<OpenRouterResponse> {
  return callOpenRouterInternal(apiKey, null, messages, config);
}

// ============================================================================
// INTERNAL: shared implementation
// ============================================================================

async function callOpenRouterInternal(
  apiKey: string,
  userId: string | null,
  messages: OpenRouterMessage[],
  config: OpenRouterConfig = {}
): Promise<OpenRouterResponse> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const maxRetries = mergedConfig.maxRetries ?? 3;
  let lastError: Error | null = null;

  // Acquire per-user throttle slot (if userId provided)
  let throttleToken: string | null = null;
  if (userId) {
    throttleToken = await acquireSlot(userId);
  }

  try {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      // Wait if globally rate limited
      await waitIfRateLimited("openrouter");

      try {
        const requestBody = buildRequestBody(messages, mergedConfig as any);

        const response = await fetch(OPENROUTER_API_URL, {
          method: "POST",
          headers: buildHeaders(
            apiKey,
            mergedConfig.xTitle || "Vid-Bolt"
          ),
          body: JSON.stringify(requestBody),
        });

        const parsed = await parseResponse(
          response,
          mergedConfig,
          attempt,
          maxRetries
        );

        if (parsed.result) {
          return parsed.result;
        }

        if (parsed.error) {
          lastError = parsed.error;
        }

        if (parsed.shouldRetry && parsed.backoffMs) {
          await new Promise((r) => setTimeout(r, parsed.backoffMs));
          continue;
        }

        if (parsed.error) {
          throw parsed.error;
        }
      } catch (error) {
        lastError =
          error instanceof Error ? error : new Error(String(error));

        // Retry on network errors
        if (attempt < maxRetries - 1 && error instanceof TypeError) {
          const backoffMs = Math.pow(2, attempt) * 1000;
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }

        throw lastError;
      }
    }

    throw lastError || new Error("OpenRouter API call failed after retries");
  } finally {
    // Release throttle slot
    if (userId && throttleToken) {
      await releaseSlot(userId, throttleToken);
    }
  }
}

// ============================================================================
// STREAMING: streamOpenRouter (userId-based, with throttle)
// ============================================================================

/**
 * Stream OpenRouter API responses as an async generator.
 * Each yielded value is a text chunk from the model.
 *
 * @param userId - User ID for API key lookup and rate limit tracking
 * @param messages - Chat messages (supports multimodal content)
 * @param config - Optional configuration overrides
 */
export async function* streamOpenRouter(
  userId: string,
  messages: OpenRouterMessage[],
  config: OpenRouterConfig = {}
): AsyncGenerator<string> {
  const apiKey = await getApiKey(userId);
  yield* streamOpenRouterInternal(apiKey, userId, messages, config);
}

/**
 * Stream OpenRouter API responses with a raw API key.
 */
export async function* streamOpenRouterWithKey(
  apiKey: string,
  messages: OpenRouterMessage[],
  config: OpenRouterConfig = {}
): AsyncGenerator<string> {
  yield* streamOpenRouterInternal(apiKey, null, messages, config);
}

async function* streamOpenRouterInternal(
  apiKey: string,
  userId: string | null,
  messages: OpenRouterMessage[],
  config: OpenRouterConfig = {}
): AsyncGenerator<string> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  // Acquire per-user throttle slot
  let throttleToken: string | null = null;
  if (userId) {
    throttleToken = await acquireSlot(userId);
  }

  try {
    await waitIfRateLimited("openrouter");

    const requestBody = buildRequestBody(messages, mergedConfig as any);
    requestBody.stream = true;

    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: buildHeaders(apiKey, mergedConfig.xTitle || "Vid-Bolt"),
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const responseText = await response.text();
      if (response.status === 429) {
        signalRateLimited("openrouter", 60);
      }
      throw new Error(
        `OpenRouter streaming error: HTTP ${response.status} - ${responseText.substring(0, 200)}`
      );
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body for streaming");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;

        const data = trimmed.slice(6);
        if (data === "[DONE]") return;

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
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Generate text with a simple system + user prompt pair.
 */
export async function generateText(
  userId: string,
  systemPrompt: string,
  userPrompt: string,
  config: OpenRouterConfig = {}
): Promise<OpenRouterResponse> {
  return callOpenRouter(
    userId,
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    config
  );
}

/**
 * Generate structured JSON output from a prompt.
 *
 * When `responseFormat` is provided, uses constrained decoding for guaranteed
 * valid JSON. Otherwise falls back to prompt injection + markdown stripping.
 */
export async function generateJSON<T = unknown>(
  userId: string,
  systemPrompt: string,
  userPrompt: string,
  config: OpenRouterConfig = {}
): Promise<T> {
  if (config.responseFormat) {
    const response = await callOpenRouter(
      userId,
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { ...config, temperature: config.temperature ?? 0.3 }
    );

    if (response.finishReason === "length") {
      throw new Error(
        `Structured output truncated (finish_reason=length). ` +
          `completion_tokens=${response.usage.completionTokens}, ` +
          `model=${response.model}. Increase maxTokens.`
      );
    }

    try {
      return JSON.parse(response.content) as T;
    } catch (e) {
      console.error(
        `${LOG_PREFIX} Structured output parse failure:`,
        response.content.substring(0, 300)
      );
      throw new Error(
        `Structured output parse error: ${e instanceof Error ? e.message : "unknown"}`
      );
    }
  }

  // Fallback: prompt injection + markdown stripping
  const jsonSystemPrompt = `${systemPrompt}\n\nIMPORTANT: You must respond with valid JSON only. No markdown, no code blocks, just raw JSON.`;

  const response = await callOpenRouter(
    userId,
    [
      { role: "system", content: jsonSystemPrompt },
      { role: "user", content: userPrompt },
    ],
    { ...config, temperature: config.temperature ?? 0.3 }
  );

  try {
    let content = response.content.trim();
    if (content.startsWith("```json")) content = content.slice(7);
    if (content.startsWith("```")) content = content.slice(3);
    if (content.endsWith("```")) content = content.slice(0, -3);
    content = content.trim();

    const lastChar = content.charAt(content.length - 1);
    if (lastChar !== "}" && lastChar !== "]") {
      throw new Error(
        `Response appears truncated. Usage: prompt=${response.usage.promptTokens}, completion=${response.usage.completionTokens}`
      );
    }

    return JSON.parse(content) as T;
  } catch (parseError) {
    if (
      parseError instanceof Error &&
      parseError.message.includes("truncated")
    ) {
      throw parseError;
    }
    throw new Error(
      `Failed to parse JSON response: ${response.content.substring(0, 200)}`
    );
  }
}

/**
 * Generate text with web search enabled.
 */
export async function generateWithWebSearch(
  userId: string,
  systemPrompt: string,
  userPrompt: string,
  options: {
    maxResults?: number;
    searchContextSize?: "low" | "medium" | "high";
  } = {}
): Promise<OpenRouterResponse> {
  return callOpenRouter(
    userId,
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    {
      webSearch: true,
      webSearchContextSize: options.searchContextSize || "medium",
      temperature: 0.5,
    }
  );
}

/**
 * Generate JSON with web search enabled.
 */
export async function generateJSONWithWebSearch<T = unknown>(
  userId: string,
  systemPrompt: string,
  userPrompt: string,
  options: {
    model?: string;
    maxResults?: number;
    searchContextSize?: "low" | "medium" | "high";
  } = {}
): Promise<{ data: T; citations: UrlCitation[] }> {
  const jsonSystemPrompt = `${systemPrompt}\n\nIMPORTANT: You must respond with valid JSON only. No markdown, no code blocks, just raw JSON.`;

  const response = await callOpenRouter(
    userId,
    [
      { role: "system", content: jsonSystemPrompt },
      { role: "user", content: userPrompt },
    ],
    {
      model: options.model,
      webSearch: true,
      webSearchContextSize: options.searchContextSize || "medium",
      temperature: 0.3,
    }
  );

  try {
    let content = response.content.trim();
    if (content.startsWith("```json")) content = content.slice(7);
    if (content.startsWith("```")) content = content.slice(3);
    if (content.endsWith("```")) content = content.slice(0, -3);

    return {
      data: JSON.parse(content.trim()) as T,
      citations: response.citations || [],
    };
  } catch {
    throw new Error(
      `Failed to parse JSON response: ${response.content.substring(0, 200)}`
    );
  }
}
