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

/**
 * Web search plugin configuration
 */
export interface WebSearchPlugin {
  id: 'web';
  engine?: 'native' | 'exa';
  maxResults?: number; // Defaults to 5
  searchPrompt?: string;
}

/**
 * URL citation from web search results
 */
export interface UrlCitation {
  url: string;
  title: string;
  content?: string;
  startIndex?: number;
  endIndex?: number;
}

export interface OpenRouterConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  /** Enable web search by setting to true or providing plugin config */
  webSearch?: boolean | WebSearchPlugin;
  /** Web search context size for native search */
  webSearchContextSize?: 'low' | 'medium' | 'high';
}

export interface OpenRouterResponse {
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** URL citations from web search (if web search was enabled) */
  citations?: UrlCitation[];
}

const DEFAULT_CONFIG: OpenRouterConfig = {
  model: "google/gemini-3-flash-preview",
  temperature: 0.7,
  maxTokens: 8192,
  topP: 0.95
};

/** Quality review model - smarter, used for script quality assessment */
export const QUALITY_REVIEW_MODEL = "google/gemini-3-pro-preview";

/** Config preset for quality review calls */
export const QUALITY_REVIEW_CONFIG: Partial<OpenRouterConfig> = {
  model: QUALITY_REVIEW_MODEL,
  temperature: 0.3, // Lower temp for consistent scoring
  maxTokens: 4096,
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
      // Build request body with optional web search
      const requestBody: Record<string, unknown> = {
        model: mergedConfig.model,
        messages,
        temperature: mergedConfig.temperature,
        max_tokens: mergedConfig.maxTokens,
        top_p: mergedConfig.topP,
      };

      // Add web search if enabled
      if (mergedConfig.webSearch) {
        if (typeof mergedConfig.webSearch === 'boolean') {
          // Simple :online suffix approach - append to model
          requestBody.model = `${mergedConfig.model}:online`;
        } else {
          // Full plugin configuration
          requestBody.plugins = [{
            id: mergedConfig.webSearch.id,
            engine: mergedConfig.webSearch.engine,
            max_results: mergedConfig.webSearch.maxResults,
            search_prompt: mergedConfig.webSearch.searchPrompt,
          }];
        }
      }

      // Add web search context size if specified
      if (mergedConfig.webSearchContextSize) {
        requestBody.web_search_options = {
          search_context_size: mergedConfig.webSearchContextSize,
        };
      }

      const response = await fetch(OPENROUTER_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
          "X-Title": "Vid-Bolt",
        },
        body: JSON.stringify(requestBody),
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
        const errorMetadata = data.error?.metadata || {};
        const providerName = errorMetadata.provider_name || 'unknown';
        const rawError = errorMetadata.raw || '';
        
        // Log detailed error info for debugging
        console.log(`[OpenRouter] Error details: status=${response.status}, provider=${providerName}, message="${errorMessage}"`);
        if (data.error?.metadata) {
          console.log(`[OpenRouter] Error metadata:`, JSON.stringify(data.error.metadata).substring(0, 500));
        }
        
        // Check if this is a non-retryable image error (400 = bad request, image format issue)
        // These errors won't succeed on retry - the image itself is the problem
        const isImageError = response.status === 400 && (
          rawError.includes('image is not valid') ||
          rawError.includes('Unable to process input image') ||
          rawError.includes('INVALID_ARGUMENT')
        );
        
        // Only retry on 5xx errors, rate limits, and transient overload - NOT 400 errors
        const isRetryable = !isImageError && (
          response.status >= 500 || 
          response.status === 429 || 
          errorMessage.includes('rate limit') ||
          errorMessage.includes('overloaded')
        );
          
        if (isRetryable && attempt < maxRetries - 1) {
          lastError = new Error(`OpenRouter API error: ${errorMessage}`);
          const backoffMs = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
          console.log(`[OpenRouter] Retrying in ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries}): ${errorMessage}`);
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }
        
        throw new Error(`OpenRouter API error: ${errorMessage}`);
      }

      const choice = data.choices?.[0];

      if (!choice?.message?.content) {
        throw new Error("Invalid response from OpenRouter API - no content in response");
      }

      // Extract citations from annotations if present (web search results)
      const annotations = choice.message.annotations as Array<{
        type: string;
        url_citation?: {
          url: string;
          title: string;
          content?: string;
          start_index?: number;
          end_index?: number;
        };
      }> | undefined;

      const citations = annotations
        ?.filter((a) => a.type === 'url_citation' && a.url_citation)
        .map((a) => ({
          url: a.url_citation!.url,
          title: a.url_citation!.title,
          content: a.url_citation!.content,
          startIndex: a.url_citation!.start_index,
          endIndex: a.url_citation!.end_index,
        }));

      // Record usage to active CostTracker (if any worker is tracking costs)
      const { getActiveCostTracker } = await import('@/lib/queues/cost-tracker');
      const tracker = getActiveCostTracker();
      if (tracker) {
        tracker.addLlmCall(data.model || mergedConfig.model!, {
          promptTokens: data.usage?.prompt_tokens || 0,
          completionTokens: data.usage?.completion_tokens || 0,
          totalTokens: data.usage?.total_tokens || 0,
        });
      }

      return {
        content: choice.message.content,
        model: data.model || mergedConfig.model!,
        usage: {
          promptTokens: data.usage?.prompt_tokens || 0,
          completionTokens: data.usage?.completion_tokens || 0,
          totalTokens: data.usage?.total_tokens || 0,
        },
        citations,
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

    content = content.trim();
    
    // Detect truncated JSON before attempting parse
    const lastChar = content.charAt(content.length - 1);
    if (lastChar !== '}' && lastChar !== ']') {
      throw new Error(
        `Response appears truncated (ends with "${content.substring(content.length - 50)}"...). ` +
        `Try increasing maxTokens in the config. Usage: prompt=${response.usage.promptTokens}, completion=${response.usage.completionTokens}`
      );
    }

    return JSON.parse(content) as T;
  } catch (parseError) {
    // Re-throw if it's already our custom error
    if (parseError instanceof Error && parseError.message.includes('truncated')) {
      throw parseError;
    }
    throw new Error(`Failed to parse JSON response: ${response.content.substring(0, 200)}`);
  }
}

/**
 * Generate text with web search enabled for research purposes.
 * Automatically includes URL citations from search results.
 */
export async function generateWithWebSearch(
  userId: string,
  systemPrompt: string,
  userPrompt: string,
  options: {
    maxResults?: number;
    searchContextSize?: 'low' | 'medium' | 'high';
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
      webSearchContextSize: options.searchContextSize || 'medium',
      temperature: 0.5, // Lower temperature for factual research
    }
  );
}

/**
 * Generate JSON with web search enabled.
 * Useful for structured research output with citations.
 */
export async function generateJSONWithWebSearch<T = unknown>(
  userId: string,
  systemPrompt: string,
  userPrompt: string,
  options: {
    maxResults?: number;
    searchContextSize?: 'low' | 'medium' | 'high';
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
      webSearch: true,
      webSearchContextSize: options.searchContextSize || 'medium',
      temperature: 0.3,
    }
  );

  try {
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

    return {
      data: JSON.parse(content.trim()) as T,
      citations: response.citations || [],
    };
  } catch {
    throw new Error(`Failed to parse JSON response: ${response.content.substring(0, 200)}`);
  }
}
