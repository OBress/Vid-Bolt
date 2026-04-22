/**
 * LLM Provider Registry
 * ============================================================================
 * Central registry for all LLM provider adapters.
 *
 * To add a new provider:
 *   1. Create lib/ai/providers/<name>.ts implementing LLMProviderAdapter
 *   2. Import the adapter below
 *   3. Call registerProvider(yourAdapter)
 *   4. Add the provider id to the LlmProvider union in providers/types.ts
 *
 * Nothing else needs to change — the client.ts layer handles everything else
 * automatically via the registry.
 */

import type { LlmProvider, LLMProviderAdapter } from './providers/types';
import { openRouterAdapter }    from './providers/openrouter';
import { inworldRouterAdapter } from './providers/inworld-router';

// ============================================================================
// REGISTRY
// ============================================================================

const _registry = new Map<string, LLMProviderAdapter>();

/**
 * Register a provider adapter. Safe to call multiple times (idempotent).
 */
export function registerProvider(adapter: LLMProviderAdapter): void {
  _registry.set(adapter.id, adapter);
}

/**
 * Resolve a registered provider by ID.
 * @throws if the provider is not registered.
 */
export function getProvider(id: LlmProvider): LLMProviderAdapter {
  const adapter = _registry.get(id);
  if (!adapter) {
    throw new Error(
      `[LLM Registry] Unknown provider "${id}". ` +
        `Registered providers: ${[..._registry.keys()].join(', ')}. ` +
        `Did you forget to call registerProvider()?`
    );
  }
  return adapter;
}

/**
 * Returns all registered providers in registration order.
 */
export function listProviders(): LLMProviderAdapter[] {
  return [..._registry.values()];
}

/**
 * Check whether a provider ID is registered.
 */
export function hasProvider(id: string): id is LlmProvider {
  return _registry.has(id);
}

// ============================================================================
// BUILT-IN PROVIDER REGISTRATION
// ============================================================================

registerProvider(openRouterAdapter);
registerProvider(inworldRouterAdapter);

// Future providers — uncomment or add new entries here:
// import { anthropicAdapter } from './providers/anthropic';
// registerProvider(anthropicAdapter);
//
// import { groqAdapter } from './providers/groq';
// registerProvider(groqAdapter);
