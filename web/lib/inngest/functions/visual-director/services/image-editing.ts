/**
 * Image Editing Service (STUB)
 * ============================================================================
 * Stub implementation for image editing endpoint.
 * Will be replaced with actual endpoint when available.
 */

import type { ImageEditingTask } from '../types';

// ============================================================================
// TYPES
// ============================================================================

export interface ImageEditingRequest {
  /** Source image URL to edit */
  sourceImageUrl: string;
  /** Instructions for how to edit the image */
  editPrompt: string;
  /** Optional mask area for inpainting (x, y, width, height as percentages) */
  maskArea?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** Elements to preserve from the original */
  preserveElements: string[];
  /** Elements to change */
  changeElements: string[];
}

export interface ImageEditingResponse {
  /** URL of the edited image */
  imageUrl: string;
  /** Whether edits were applied successfully */
  success: boolean;
  /** Details about what was changed */
  changes?: string[];
  /** Generation metadata */
  metadata?: {
    model: string;
    processingTimeMs: number;
  };
}

// ============================================================================
// STUB IMPLEMENTATION
// ============================================================================

/**
 * Edit an existing image based on prompts.
 * 
 * STUB: Returns placeholder URL. Will connect to actual endpoint later.
 */
export async function editImage(
  userId: string,
  request: ImageEditingRequest
): Promise<ImageEditingResponse> {
  console.log('[ImageEditing] STUB: Would edit image');
  console.log('[ImageEditing] Source:', request.sourceImageUrl);
  console.log('[ImageEditing] Edit Prompt:', request.editPrompt.substring(0, 100) + '...');
  console.log('[ImageEditing] Preserve:', request.preserveElements);
  console.log('[ImageEditing] Change:', request.changeElements);

  // Simulate processing delay
  await new Promise(resolve => setTimeout(resolve, 100));

  // Return placeholder
  return {
    imageUrl: `https://placeholder.vidbolt.dev/edited/${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`,
    success: true,
    changes: request.changeElements,
    metadata: {
      model: 'stub-edit-model-v1',
      processingTimeMs: 100,
    },
  };
}

/**
 * Edit images for multiple tasks in batch.
 * 
 * STUB: Processes sequentially, will be parallelized with real endpoint.
 */
export async function editImagesBatch(
  userId: string,
  tasks: ImageEditingTask[]
): Promise<Map<string, ImageEditingResponse>> {
  console.log(`[ImageEditing] STUB: Would edit ${tasks.length} images in batch`);

  const results = new Map<string, ImageEditingResponse>();

  for (const task of tasks) {
    const response = await editImage(userId, {
      sourceImageUrl: task.sourceImageUrl,
      editPrompt: task.editPrompt,
      preserveElements: task.preserveElements,
      changeElements: task.changeElements,
    });

    results.set(task.taskId, response);
  }

  return results;
}

/**
 * Check if the image editing service is available.
 * 
 * STUB: Always returns true with a note that it's a stub.
 */
export async function checkImageEditingHealth(): Promise<{
  available: boolean;
  isStub: boolean;
  message: string;
}> {
  return {
    available: true,
    isStub: true,
    message: 'Image editing service is running in STUB mode. Placeholder URLs will be returned.',
  };
}
