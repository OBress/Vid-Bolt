/**
 * Image-to-Video Service (STUB)
 * ============================================================================
 * Stub implementation for image-to-video generation endpoint.
 * Will be replaced with actual endpoint when available.
 */

import type { VideoGenerationTask } from '../types';

// ============================================================================
// TYPES
// ============================================================================

export interface ImageToVideoRequest {
  /** URL of the start frame image */
  startFrameUrl: string;
  /** Motion prompt describing camera/scene movement (keep subtle!) */
  motionPrompt: string;
  /** Duration of the video in seconds */
  durationSeconds: number;
  /** Frames per second (optional, defaults to 24) */
  fps?: number;
  /** Optional end frame URL for interpolation */
  endFrameUrl?: string;
}

export interface ImageToVideoResponse {
  /** URL of the generated video */
  videoUrl: string;
  /** Duration of the generated video */
  durationSeconds: number;
  /** FPS of the generated video */
  fps: number;
  /** Generation metadata */
  metadata?: {
    model: string;
    generationTimeMs: number;
    frameCount: number;
  };
}

// ============================================================================
// STUB IMPLEMENTATION
// ============================================================================

/**
 * Generate a video clip from a start frame image.
 * 
 * STUB: Returns placeholder URL. Will connect to actual endpoint later.
 */
export async function generateVideoFromImage(
  userId: string,
  request: ImageToVideoRequest
): Promise<ImageToVideoResponse> {
  console.log('[ImageToVideo] STUB: Would generate video from image');
  console.log('[ImageToVideo] Start Frame:', request.startFrameUrl);
  console.log('[ImageToVideo] Motion Prompt:', request.motionPrompt);
  console.log('[ImageToVideo] Duration:', request.durationSeconds, 'seconds');
  console.log('[ImageToVideo] FPS:', request.fps || 24);

  // Simulate processing delay
  await new Promise(resolve => setTimeout(resolve, 100));

  const fps = request.fps || 24;
  const frameCount = Math.floor(request.durationSeconds * fps);

  // Return placeholder
  return {
    videoUrl: `https://placeholder.vidbolt.dev/video/${Date.now()}-${Math.random().toString(36).substring(7)}.mp4`,
    durationSeconds: request.durationSeconds,
    fps,
    metadata: {
      model: 'stub-video-model-v1',
      generationTimeMs: 100,
      frameCount,
    },
  };
}

/**
 * Generate videos for multiple tasks in batch.
 * 
 * STUB: Processes sequentially, will be parallelized with real endpoint.
 */
export async function generateVideosBatch(
  userId: string,
  tasks: VideoGenerationTask[]
): Promise<Map<string, ImageToVideoResponse>> {
  console.log(`[ImageToVideo] STUB: Would generate ${tasks.length} videos in batch`);

  const results = new Map<string, ImageToVideoResponse>();

  for (const task of tasks) {
    const response = await generateVideoFromImage(userId, {
      startFrameUrl: task.startFrameUrl,
      motionPrompt: task.motionPrompt,
      durationSeconds: task.durationSeconds,
      fps: task.fps,
    });

    results.set(task.taskId, response);
  }

  return results;
}

/**
 * Check if the image-to-video service is available.
 * 
 * STUB: Always returns true with a note that it's a stub.
 */
export async function checkImageToVideoHealth(): Promise<{
  available: boolean;
  isStub: boolean;
  message: string;
}> {
  return {
    available: true,
    isStub: true,
    message: 'Image-to-video service is running in STUB mode. Placeholder URLs will be returned.',
  };
}

/**
 * Validate motion prompt to ensure it's not too complex.
 * Complex motion often causes artifacts in AI video generation.
 */
export function validateMotionPrompt(prompt: string): {
  valid: boolean;
  warnings: string[];
  suggestion?: string;
} {
  const warnings: string[] = [];
  
  // Check for complex movement keywords
  const complexKeywords = [
    'rapid', 'fast', 'quick', 'suddenly', 'shake', 'handheld',
    'whip', 'spin', 'rotate quickly', 'chase', 'follow closely'
  ];


  const lowerPrompt = prompt.toLowerCase();
  complexKeywords.forEach(keyword => {
    if (lowerPrompt.includes(keyword)) {
      warnings.push(`Motion prompt contains "${keyword}" which may cause artifacts. Consider simpler movement.`);
    }
  });

  // Check for multiple movements
  const movementWords = ['pan', 'zoom', 'tilt', 'dolly', 'track', 'move'];
  const movementCount = movementWords.filter(w => lowerPrompt.includes(w)).length;
  if (movementCount > 1) {
    warnings.push('Multiple movement types detected. Simple single movements work best.');
  }

  return {
    valid: warnings.length === 0,
    warnings,
    suggestion: warnings.length > 0 
      ? 'Consider using simpler motion like "Camera slowly zooms in" or "Camera remains static"'
      : undefined,
  };
}
