/**
 * API Keys Service
 * ============================================================================
 * Retrieves API keys from Supabase user_api_keys table with fallback to
 * platform default environment variables.
 *
 * Key function for LLM routing:
 *   getLlmProviderConfig(userId) — returns the user's active LLM provider
 *   and resolved API key in a single call. Use this in API routes instead of
 *   getOpenRouterApiKey() to support all providers transparently.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { LlmProvider } from "@/lib/ai/providers/types";

let supabaseClient: SupabaseClient | null = null;

function getSupabaseServiceClient(): SupabaseClient {
  if (supabaseClient) return supabaseClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase configuration");
  }

  supabaseClient = createClient(url, key);
  return supabaseClient;
}

export interface UserApiKeys {
  openrouter_key?: string | null;
  inworld_router_key?: string | null;  // LLM Router key (separate from TTS key)
  llm_provider?: LlmProvider | null;   // Active LLM provider; defaults to 'openrouter'
  elevenlabs_key?: string | null;
  genai_key?: string | null;
  inworld_tts_key?: string | null;     // Voice TTS key (unchanged)
  replicate_key?: string | null;
  google_cloud_credentials?: string | null;
  groq_key?: string | null;
  valyu_key?: string | null;
}

/** Resolved provider config returned by getLlmProviderConfig(). */
export interface LlmProviderConfig {
  provider: LlmProvider;
  apiKey: string;
}

/**
 * Get all API keys for a user.
 * 
 * @param userId - User ID
 * @returns User's API keys or null if not found
 */
export async function getUserApiKeys(userId: string): Promise<UserApiKeys | null> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("user_api_keys")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      // No row found
      return null;
    }
    throw new Error(`Failed to fetch user API keys: ${error.message}`);
  }

  return data;
}

/**
 * Get Inworld API key for a user from Supabase.
 * Users must configure their own key in Settings → API Keys.
 * 
 * @param userId - User ID
 * @returns Inworld API key (plain text, not encoded)
 */
export async function getInworldApiKey(userId: string): Promise<string> {
  const userKeys = await getUserApiKeys(userId);
  
  if (!userKeys?.inworld_tts_key) {
    throw new Error(
      "No Inworld API key found. Please configure your Inworld TTS key in Settings → API Keys."
    );
  }

  return userKeys.inworld_tts_key;
}

/**
 * Get ElevenLabs API key for a user.
 * Falls back to platform default if user doesn't have their own key.
 */
export async function getElevenLabsApiKey(userId: string): Promise<string> {
  const userKeys = await getUserApiKeys(userId);
  
  if (userKeys?.elevenlabs_key) {
    return userKeys.elevenlabs_key;
  }

  const platformKey = process.env.ELEVENLABS_API_KEY;
  if (!platformKey) {
    throw new Error(
      "No ElevenLabs API key found. User must configure their key or platform default must be set."
    );
  }

  return platformKey;
}

/**
 * Get GenAI (Google) API key for a user.
 * Falls back to platform default if user doesn't have their own key.
 */
export async function getGenAiApiKey(userId: string): Promise<string> {
  const userKeys = await getUserApiKeys(userId);
  
  if (userKeys?.genai_key) {
    return userKeys.genai_key;
  }

  const platformKey = process.env.GOOGLE_GENAI_API_KEY;
  if (!platformKey) {
    throw new Error(
      "No GenAI API key found. User must configure their key or platform default must be set."
    );
  }

  return platformKey;
}

/**
 * Get OpenRouter API key for a user.
 * Falls back to platform default if user doesn't have their own key.
 *
 * @deprecated For most cases, prefer getLlmProviderConfig() which respects
 * the user's active provider choice. Use getOpenRouterApiKey() only when
 * you explicitly need OpenRouter (e.g., web-search features).
 */
export async function getOpenRouterApiKey(userId: string): Promise<string> {
  const userKeys = await getUserApiKeys(userId);

  if (userKeys?.openrouter_key) {
    return userKeys.openrouter_key;
  }

  const platformKey = process.env.OPENROUTER_API_KEY;
  if (!platformKey) {
    throw new Error(
      "No OpenRouter API key found. Please configure your OpenRouter key in Settings \u2192 API Keys."
    );
  }

  return platformKey;
}

/**
 * Get the user's active LLM provider config.
 *
 * This is the primary function API routes and services should call to resolve
 * which provider to use for a given user. It reads the user's `llm_provider`
 * preference and returns the appropriate API key.
 *
 * Usage in an API route:
 * ```ts
 * const { apiKey, provider } = await getLlmProviderConfig(user.id);
 * const result = await callLLMWithKey(apiKey, messages, config, provider);
 * ```
 *
 * @param userId  Authenticated user ID.
 * @returns       Resolved { provider, apiKey } for the user's active LLM.
 */
export async function getLlmProviderConfig(userId: string): Promise<LlmProviderConfig> {
  const userKeys = await getUserApiKeys(userId);
  const provider = (userKeys?.llm_provider ?? 'openrouter') as LlmProvider;

  if (provider === 'inworld') {
    const key = userKeys?.inworld_router_key;
    if (!key) {
      throw new Error(
        "Inworld Router API key not configured. Please add your Inworld Router key in Settings \u2192 API Keys."
      );
    }
    return { provider: 'inworld', apiKey: key };
  }

  // Default: OpenRouter (with platform fallback for shared deployments)
  const key = userKeys?.openrouter_key || process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error(
      "No OpenRouter API key found. Please configure your OpenRouter key in Settings \u2192 API Keys."
    );
  }
  return { provider: 'openrouter', apiKey: key };
}

/**
 * Get Valyu API key for a user from Supabase.
 * Users must configure their own key in Settings → API Keys.
 * No environment variable fallback — this is a required per-user key.
 * 
 * @param userId - User ID
 * @returns Valyu API key
 */
export async function getValyuApiKey(userId: string): Promise<string> {
  const userKeys = await getUserApiKeys(userId);
  
  if (!userKeys?.valyu_key) {
    throw new Error(
      "No Valyu API key found. Please configure your Valyu API key in Settings → API Keys."
    );
  }

  return userKeys.valyu_key;
}
