/**
 * OpenRouter Provider Adapter
 * ============================================================================
 * Implements LLMProviderAdapter for OpenRouter.
 * Supports: web search plugin, :online model suffix, full OpenAI-compat body.
 */

import type { LLMProviderAdapter, LLMMessage, ResolvedLLMConfig } from './types';

export const openRouterAdapter: LLMProviderAdapter = {
  id: 'openrouter',
  name: 'OpenRouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  defaultModel: 'google/gemini-3-flash-preview',
  qualityReviewModel: 'google/gemini-3-pro-preview',
  supportsWebSearch: true,

  buildHeaders(apiKey: string, xTitle: string): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      'X-Title': xTitle,
    };
  },

  buildRequestBody(
    messages: LLMMessage[],
    config: ResolvedLLMConfig
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

    // Web search plugin (OpenRouter-specific)
    if (config.webSearch) {
      if (typeof config.webSearch === 'boolean') {
        // Simple boolean: append :online suffix to model
        body.model = `${config.model}:online`;
      } else {
        // Full plugin config
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
  },
};
