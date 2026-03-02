/**
 * Replicate Client Service
 * ============================================================================
 * Thin wrapper around the Replicate HTTP API for running image generation,
 * image editing, and video generation models hosted on Replicate.
 *
 * Uses raw fetch — no npm dependency required.
 */

import { getUserApiKeys } from './api-keys';

// ============================================================================
// TYPES
// ============================================================================

interface ReplicatePrediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output: any;
  error: string | null;
  urls: {
    get: string;
    cancel: string;
  };
}

interface ReplicateRunOptions {
  /** Full Replicate model path, e.g. "bytedance/seedream-4" */
  modelId: string;
  /** Input parameters for the model */
  input: Record<string, unknown>;
  /** User's Replicate API token */
  apiKey: string;
  /** Maximum time to wait for result in ms (default: 300_000 = 5 min) */
  timeoutMs?: number;
  /** Poll interval in ms (default: 2000) */
  pollIntervalMs?: number;
}

// ============================================================================
// API KEY HELPER
// ============================================================================

/**
 * Retrieve the user's Replicate API key from Supabase.
 * Unlike other providers, there is no platform fallback — the user
 * must configure their own key in Settings → API Keys.
 */
export async function getReplicateApiKey(userId: string): Promise<string> {
  const userKeys = await getUserApiKeys(userId);

  if (!userKeys?.replicate_key) {
    throw new Error(
      'No Replicate API key found. Please configure your Replicate key in Settings → API Keys.',
    );
  }

  return userKeys.replicate_key;
}

// ============================================================================
// CORE API
// ============================================================================

const REPLICATE_API_BASE = 'https://api.replicate.com/v1';

/**
 * Create a prediction and poll until it completes or times out.
 */
export async function runReplicateModel({
  modelId,
  input,
  apiKey,
  timeoutMs = 300_000,
  pollIntervalMs = 2_000,
}: ReplicateRunOptions): Promise<any> {
  // Create prediction
  const createRes = await fetch(`${REPLICATE_API_BASE}/models/${modelId}/predictions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Prefer: 'wait',
    },
    body: JSON.stringify({ input }),
  });

  if (!createRes.ok) {
    const errBody = await createRes.text();
    throw new Error(`Replicate API error (${createRes.status}): ${errBody}`);
  }

  let prediction: ReplicatePrediction = await createRes.json();

  // If the "Prefer: wait" header returned a completed result, return immediately
  if (prediction.status === 'succeeded') {
    return prediction.output;
  }
  if (prediction.status === 'failed') {
    throw new Error(`Replicate prediction failed: ${prediction.error || 'unknown error'}`);
  }

  // Poll for completion
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));

    const pollRes = await fetch(prediction.urls.get, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!pollRes.ok) {
      throw new Error(`Replicate poll error (${pollRes.status})`);
    }

    prediction = await pollRes.json();

    if (prediction.status === 'succeeded') {
      return prediction.output;
    }
    if (prediction.status === 'failed' || prediction.status === 'canceled') {
      throw new Error(`Replicate prediction ${prediction.status}: ${prediction.error || 'unknown'}`);
    }
  }

  throw new Error(`Replicate prediction timed out after ${timeoutMs}ms`);
}

// ============================================================================
// CATEGORY-SPECIFIC HELPERS
// ============================================================================

/**
 * Generate an image via a Replicate model.
 * @returns URL of the generated image
 */
export async function generateImageViaReplicate(
  replicateModelId: string,
  prompt: string,
  apiKey: string,
  options?: {
    aspectRatio?: string;
    width?: number;
    height?: number;
  },
): Promise<string> {
  const input: Record<string, unknown> = { prompt };
  if (options?.aspectRatio) input.aspect_ratio = options.aspectRatio;
  if (options?.width) input.width = options.width;
  if (options?.height) input.height = options.height;

  const output = await runReplicateModel({ modelId: replicateModelId, input, apiKey });

  // Replicate image models typically return a URL string or array of URLs
  if (typeof output === 'string') return output;
  if (Array.isArray(output) && output.length > 0) return output[0];
  throw new Error('Unexpected Replicate image output format');
}

/**
 * Edit an image via a Replicate model (Nano Banana Pro / Nano Banana 2).
 * @returns URL of the edited image
 */
export async function editImageViaReplicate(
  replicateModelId: string,
  prompt: string,
  imageUrl: string,
  apiKey: string,
  options?: {
    aspectRatio?: string;
  },
): Promise<string> {
  const input: Record<string, unknown> = {
    prompt,
    image: imageUrl,
  };
  if (options?.aspectRatio) input.aspect_ratio = options.aspectRatio;

  const output = await runReplicateModel({ modelId: replicateModelId, input, apiKey });

  if (typeof output === 'string') return output;
  if (Array.isArray(output) && output.length > 0) return output[0];
  throw new Error('Unexpected Replicate image edit output format');
}

/**
 * Generate a video via a Replicate model (Veo 3.1 / Veo 3.1 Fast).
 * @returns URL of the generated video
 */
export async function generateVideoViaReplicate(
  replicateModelId: string,
  prompt: string,
  apiKey: string,
  options?: {
    aspectRatio?: string;
    duration?: number;
    imageUrl?: string;
  },
): Promise<string> {
  const input: Record<string, unknown> = { prompt };
  if (options?.aspectRatio) input.aspect_ratio = options.aspectRatio;
  if (options?.duration) input.duration = options.duration;
  if (options?.imageUrl) input.image = options.imageUrl;

  const output = await runReplicateModel({
    modelId: replicateModelId,
    input,
    apiKey,
    timeoutMs: 600_000, // Videos can take longer
    pollIntervalMs: 5_000,
  });

  if (typeof output === 'string') return output;
  if (Array.isArray(output) && output.length > 0) return output[0];
  throw new Error('Unexpected Replicate video output format');
}
