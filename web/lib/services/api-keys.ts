/**
 * API Keys Service
 * ============================================================================
 * Retrieves API keys from Supabase user_api_keys table with fallback to
 * platform default environment variables.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

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
  elevenlabs_key?: string | null;
  genai_key?: string | null;
  inworld_tts_key?: string | null;
  replicate_key?: string | null;
  google_cloud_credentials?: string | null;
  groq_key?: string | null;
  valyu_key?: string | null;
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
 */
export async function getOpenRouterApiKey(userId: string): Promise<string> {
  const userKeys = await getUserApiKeys(userId);
  
  if (userKeys?.openrouter_key) {
    return userKeys.openrouter_key;
  }

  const platformKey = process.env.OPENROUTER_API_KEY;
  if (!platformKey) {
    throw new Error(
      "No OpenRouter API key found. Please configure your OpenRouter key in Settings → API Keys."
    );
  }

  return platformKey;
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
