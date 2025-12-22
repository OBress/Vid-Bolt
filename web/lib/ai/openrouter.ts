/**
 * OpenRouter API Helper
 * Provides a standardized interface for calling LLMs via OpenRouter.
 * Designed for scale with proper error handling and retries.
 */

import { createClient } from "@supabase/supabase-js";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

export interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenRouterConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

export interface OpenRouterResponse {
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

const DEFAULT_CONFIG: OpenRouterConfig = {
  model: "google/gemini-3-flash-preview",
  temperature: 0.7,
  maxTokens: 8192,
  topP: 0.95
};

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

/**
 * Call OpenRouter API with the given messages and configuration.
 * Includes automatic retry logic for transient failures.
 */
export async function callOpenRouter(
  userId: string,
  messages: OpenRouterMessage[],
  config: OpenRouterConfig = {}
): Promise<OpenRouterResponse> {
  const apiKey = await getApiKey(userId);
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(OPENROUTER_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
          "X-Title": "Vid-Bolt",
        },
        body: JSON.stringify({
          model: mergedConfig.model,
          messages,
          temperature: mergedConfig.temperature,
          max_tokens: mergedConfig.maxTokens,
          top_p: mergedConfig.topP,
        }),
      });

      // Get raw text first to handle HTML error pages
      const responseText = await response.text();

      // Check if response is HTML (error page)
      if (responseText.trim().startsWith("<!DOCTYPE") || responseText.trim().startsWith("<html")) {
        throw new Error(`OpenRouter returned an error page. This usually means an invalid API key or network issue. Status: ${response.status}`);
      }

      // Parse JSON
      let data;
      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error(`Invalid JSON response from OpenRouter: ${responseText.substring(0, 200)}`);
      }

      if (!response.ok) {
        const errorMessage = data.error?.message || `HTTP ${response.status}`;
        
        // Retry on 5xx errors, rate limits
        if (response.status >= 500 || response.status === 429) {
          lastError = new Error(`OpenRouter API error: ${errorMessage}`);
          await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
          continue;
        }
        
        throw new Error(`OpenRouter API error: ${errorMessage}`);
      }

      const choice = data.choices?.[0];

      if (!choice?.message?.content) {
        throw new Error("Invalid response from OpenRouter API - no content in response");
      }

      return {
        content: choice.message.content,
        model: data.model || mergedConfig.model!,
        usage: {
          promptTokens: data.usage?.prompt_tokens || 0,
          completionTokens: data.usage?.completion_tokens || 0,
          totalTokens: data.usage?.total_tokens || 0,
        },
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Only retry on network errors
      if (attempt < maxRetries - 1 && error instanceof TypeError) {
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        continue;
      }
      
      throw lastError;
    }
  }

  throw lastError || new Error("OpenRouter API call failed after retries");
}

/**
 * Convenience function to generate text with a simple prompt.
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
 * Instructs the model to return valid JSON.
 */
export async function generateJSON<T = unknown>(
  userId: string,
  systemPrompt: string,
  userPrompt: string,
  config: OpenRouterConfig = {}
): Promise<T> {
  const jsonSystemPrompt = `${systemPrompt}\n\nIMPORTANT: You must respond with valid JSON only. No markdown, no code blocks, just raw JSON.`;

  const response = await callOpenRouter(
    userId,
    [
      { role: "system", content: jsonSystemPrompt },
      { role: "user", content: userPrompt },
    ],
    { ...config, temperature: 0.3 } // Lower temperature for more consistent JSON
  );

  try {
    // Try to extract JSON if wrapped in code blocks
    let content = response.content.trim();
    if (content.startsWith("```json")) {
      content = content.slice(7);
    }
    if (content.startsWith("```")) {
      content = content.slice(3);
    }
    if (content.endsWith("```")) {
      content = content.slice(0, -3);
    }

    return JSON.parse(content.trim()) as T;
  } catch {
    throw new Error(`Failed to parse JSON response: ${response.content.substring(0, 200)}`);
  }
}
