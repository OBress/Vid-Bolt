/**
 * Inworld Router Provider Adapter
 * ============================================================================
 * Implements LLMProviderAdapter for Inworld AI's LLM Router.
 *
 * Inworld Router is fully OpenAI-API compatible:
 *   - Same chat/completions endpoint shape
 *   - Same request body structure (model, messages, temperature, max_tokens)
 *   - Same SSE streaming format
 *   - Same response shape (choices, usage, finish_reason)
 *   - Same error codes (429, 500, etc.)
 *
 * Key differences from OpenRouter:
 *   - Base URL: https://api.inworld.ai/v1
 *   - Model IDs: google-ai-studio/gemini-3-flash-preview (different provider namespace)
 *   - No web-search plugin support
 *   - No HTTP-Referer / X-Title headers required (omitting is safe)
 *
 * Docs: https://docs.inworld.ai/router/introduction
 */

import type { LLMProviderAdapter, LLMMessage, ResolvedLLMConfig } from './types';

export const inworldRouterAdapter: LLMProviderAdapter = {
  id: 'inworld',
  name: 'Inworld Router',
  baseUrl: 'https://api.inworld.ai/v1',
  defaultModel: 'google-ai-studio/gemini-3-flash-preview',
  qualityReviewModel: 'google-ai-studio/gemini-3-pro-preview',
  supportsWebSearch: false,

  buildHeaders(apiKey: string, _xTitle: string): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };
  },

  buildRequestBody(
    messages: LLMMessage[],
    config: ResolvedLLMConfig
  ): Record<string, unknown> {
    // Inworld uses identical body shape to OpenAI / OpenRouter (minus plugins)
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

    // Web search is not supported — the client.ts layer guards against this
    // being called with webSearch enabled on this provider.

    return body;
  },
};
