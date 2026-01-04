/**
 * Image Generation Service (STUB)
 * ============================================================================
 * Stub implementation for image generation endpoint.
 * Will be replaced with actual endpoint when available.
 */

import type { ImageGenerationTask } from '../types';

// ============================================================================
// TYPES
// ============================================================================

export interface ImageGenerationRequest {
  /** The prompt describing the image to generate */
  prompt: string;
  /** Negative prompt (what to avoid) */
  negativePrompt?: string;
  /** Aspect ratio for the image */
  aspectRatio: '16:9' | '9:16' | '1:1';
  /** Style guidance */
  style?: string;
  /** Reference images for consistency */
  referenceImages?: string[];
}

export interface ImageGenerationResponse {
  /** URL of the generated image */
  imageUrl: string;
  /** Seed used for generation (for reproducibility) */
  seed?: number;
  /** Generation metadata */
  metadata?: {
    model: string;
    generationTimeMs: number;
  };
}

// ============================================================================
// STUB IMPLEMENTATION
// ============================================================================

/**
 * Generate an image from a text prompt.
 * 
 * STUB: Returns placeholder URL. Will connect to actual endpoint later.
 */
export async function generateImage(
  userId: string,
  request: ImageGenerationRequest
): Promise<ImageGenerationResponse> {
  console.log('[ImageGeneration] STUB: Would generate image');
  console.log('[ImageGeneration] Prompt:', request.prompt.substring(0, 100) + '...');
  console.log('[ImageGeneration] Aspect Ratio:', request.aspectRatio);
  console.log('[ImageGeneration] Reference Images:', request.referenceImages?.length || 0);

  // Simulate processing delay
  await new Promise(resolve => setTimeout(resolve, 100));

  // Return placeholder
  return {
    imageUrl: `https://placeholder.vidbolt.dev/generated/${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`,
    seed: Math.floor(Math.random() * 1000000),
    metadata: {
      model: 'stub-model-v1',
      generationTimeMs: 100,
    },
  };
}

/**
 * Generate images for multiple tasks in batch.
 * 
 * STUB: Processes sequentially, will be parallelized with real endpoint.
 */
export async function generateImagesBatch(
  userId: string,
  tasks: ImageGenerationTask[]
): Promise<Map<string, ImageGenerationResponse>> {
  console.log(`[ImageGeneration] STUB: Would generate ${tasks.length} images in batch`);

  const results = new Map<string, ImageGenerationResponse>();

  for (const task of tasks) {
    const response = await generateImage(userId, {
      prompt: task.prompt,
      negativePrompt: task.negativePrompt,
      aspectRatio: task.aspectRatio,
      style: task.style,
      referenceImages: task.referenceImages,
    });

    results.set(task.taskId, response);
  }

  return results;
}

/**
 * Check if the image generation service is available.
 * 
 * STUB: Always returns true with a note that it's a stub.
 */
export async function checkImageGenerationHealth(): Promise<{
  available: boolean;
  isStub: boolean;
  message: string;
}> {
  return {
    available: true,
    isStub: true,
    message: 'Image generation service is running in STUB mode. Placeholder URLs will be returned.',
  };
}
