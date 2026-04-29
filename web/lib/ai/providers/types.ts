/**
 * LLM Provider Types
 * ============================================================================
 * Shared interfaces and types for the universal LLM provider system.
 * Every provider adapter must implement `LLMProviderAdapter`.
 *
 * Adding a new provider:
 *   1. Create lib/ai/providers/<name>.ts implementing LLMProviderAdapter
 *   2. Call registerProvider(yourAdapter) in lib/ai/registry.ts
 *   3. Add the provider id to the LlmProvider union type below
 */

// ============================================================================
// PROVIDER IDENTIFICATION
// ============================================================================

/** Union of all registered LLM provider IDs. Extend when adding new providers. */
export type LlmProvider = 'openrouter' | 'inworld';

// ============================================================================
// MESSAGE CONTENT (multimodal — shared across providers)
// ============================================================================

export interface TextContentPart {
  type: 'text';
  text: string;
}

export interface ImageContentPart {
  type: 'image_url';
  image_url: { url: string; detail?: 'high' | 'low' | 'auto' };
}

export interface VideoContentPart {
  type: 'video_url';
  video_url: { url: string };
}

export type LLMMessageContent =
  | string
  | Array<TextContentPart | ImageContentPart | VideoContentPart>;

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: LLMMessageContent;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface WebSearchPlugin {
  id: 'web';
  engine?: 'native' | 'exa';
  maxResults?: number;
  searchPrompt?: string;
}

export interface LLMConfig {
  /** Model identifier (e.g., 'google/gemini-3-flash-preview'). Falls back to provider default. */
  model?: string;
  /** Sampling temperature (0–2). */
  temperature?: number;
  /** Maximum tokens to generate. */
  maxTokens?: number;
  /** Top-p nucleus sampling. */
  topP?: number;
  /**
   * Web search plugin. Only supported by providers where supportsWebSearch === true.
   * If enabled on an unsupported provider, client.ts will automatically fall back to OpenRouter.
   */
  webSearch?: boolean | WebSearchPlugin;
  /** Web search context size (OpenRouter-specific). */
  webSearchContextSize?: 'low' | 'medium' | 'high';
  /** Structured output / response format constraint. */
  responseFormat?:
    | {
        type: 'json_schema';
        json_schema: {
          name: string;
          strict: boolean;
          schema: Record<string, unknown>;
        };
      }
    | { type: 'json_object' };
  /** Number of retry attempts for transient failures. Default: 3. */
  maxRetries?: number;
  /** Abort the request after this many milliseconds. */
  timeoutMs?: number;
  /** Title sent for tracking / logging. Default: 'Vid-Bolt'. */
  xTitle?: string;
  /**
   * Optional user ID for cost attribution in API routes.
   * When set and no CostTracker is active, the client will emit a standalone
   * cost event to the cost_events ledger for this user.
   */
  trackingUserId?: string;
  /** Optional video ID for cost attribution (pairs with trackingUserId). */
  trackingVideoId?: string;
}

/** Merged config after defaults are applied — all fields are resolved. */
export interface ResolvedLLMConfig extends Required<Omit<LLMConfig, 'webSearch' | 'responseFormat' | 'timeoutMs' | 'trackingUserId' | 'trackingVideoId'>> {
  webSearch?: boolean | WebSearchPlugin;
  responseFormat?: LLMConfig['responseFormat'];
  timeoutMs?: number;
  trackingUserId?: string;
  trackingVideoId?: string;
}

// ============================================================================
// RESPONSE
// ============================================================================

export interface UrlCitation {
  url: string;
  title: string;
  content?: string;
  startIndex?: number;
  endIndex?: number;
}

export interface LLMResponse {
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
  /** Which provider served this response. */
  provider: LlmProvider;
}

// ============================================================================
// PROVIDER ADAPTER INTERFACE
// ============================================================================

/**
 * Contract every LLM provider adapter must implement.
 *
 * Provider adapters are responsible for:
 *  - Building HTTP headers (auth, content-type, provider-specific headers)
 *  - Building the request body (model, messages, params, plugins)
 *
 * Cross-cutting concerns (retry, rate limiting, cost tracking, streaming
 * SSE parsing) live in lib/ai/client.ts and are provider-agnostic.
 */
export interface LLMProviderAdapter {
  /** Unique identifier — must match LlmProvider union. */
  readonly id: LlmProvider;
  /** Human-readable display name. */
  readonly name: string;
  /** Base URL for the provider's OpenAI-compatible API. */
  readonly baseUrl: string;
  /** Default model when the caller does not specify one. */
  readonly defaultModel: string;
  /** Model used for quality-review / scoring tasks. */
  readonly qualityReviewModel: string;
  /**
   * Whether this provider supports the web-search plugin.
   * Callers that request web search on a provider that doesn't support it
   * will be automatically rerouted through OpenRouter in client.ts.
   */
  readonly supportsWebSearch: boolean;

  /**
   * Build HTTP request headers for this provider.
   * @param apiKey  Resolved API key for the user.
   * @param xTitle  Tracking title (e.g., 'Vid-Bolt Script Writer').
   */
  buildHeaders(apiKey: string, xTitle: string): Record<string, string>;

  /**
   * Build the full request body for a chat-completions request.
   * @param messages  Resolved messages array.
   * @param config    Merged + resolved config.
   */
  buildRequestBody(
    messages: LLMMessage[],
    config: ResolvedLLMConfig
  ): Record<string, unknown>;
}
