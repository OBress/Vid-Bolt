/**
 * OpenRouter Backward-Compat Façade
 * ============================================================================
 * All LLM logic has moved to lib/ai/client.ts.
 *
 * This file exists so that every existing import of '@/lib/ai/openrouter'
 * continues to work WITHOUT modification. All public symbols are re-exported
 * with their original names.
 *
 * DO NOT add logic here. Add new functionality to lib/ai/client.ts and expose
 * it here as a re-export if needed.
 */

export {
  // Core call functions
  callLLM          as callOpenRouter,
  callLLMWithKey   as callOpenRouterWithKey,
  streamLLM        as streamOpenRouter,
  streamLLMWithKey as streamOpenRouterWithKey,

  // Convenience helpers
  generateText,
  generateJSON,
  generateWithWebSearch,
  generateJSONWithWebSearch,

  // Model constants
  QUALITY_REVIEW_MODEL,
  QUALITY_REVIEW_CONFIG,
} from './client';

// Type re-exports (zero runtime cost)
export type {
  LlmProvider,
  LLMMessage        as OpenRouterMessage,
  LLMConfig         as OpenRouterConfig,
  LLMResponse       as OpenRouterResponse,
  OpenRouterMessageContent,
  TextContentPart,
  ImageContentPart,
  VideoContentPart,
  WebSearchPlugin,
  UrlCitation,
} from './client';
