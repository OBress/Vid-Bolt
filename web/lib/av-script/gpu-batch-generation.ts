/**
 * GPU Batch Media Generation for AV Script Part 2
 * ============================================================================
 * Handles batch-by-type GPU generation with VRAM mode switching.
 * 
 * Processing Order:
 * 1. All images (image_generation mode)
 * 2. All image edits (image_editing mode)  
 * 3. All videos (video_generation mode)
 */

import { v4 as uuidv4 } from 'uuid';
import {
  callGpuBatchImageGenerate,
  callGpuBatchVideoGenerate,
  callGpuGetMode,
  callGpuSwitchMode,
  type AspectRatio,
  type BatchImageGenerateItem,
  type BatchVideoGenerateItem,
} from '@/lib/services/gpu-api-service';
import {
  generateMediaKey,
  generatePresignedPutUrl,
  getPublicUrl,
  STORAGE_PATHS,
} from '@/lib/services/r2-storage';
import { waitForWebhookResult } from '@/lib/queues/webhook-listener';

// ============================================================================
// CONFIGURATION
// ============================================================================

const getWebhookUrl = () =>
  process.env.WEBHOOK_CALLBACK_URL || 'http://localhost:3000/api/gpu-callback';
const getWebhookSecret = () => process.env.GPU_WEBHOOK_SECRET;

// Timeout configurations based on benchmarks
// Images: ~7s each, Edits: ~12s each, Videos: ~8x duration
const TIMEOUT_CONFIG = {
  image_generation: { baseMs: 30_000, perItemMs: 10_000 },
  image_editing: { baseMs: 45_000, perItemMs: 15_000 },
  video_generation: { baseMs: 60_000, perSecondMs: 10_000 },
};

// Mode switch timeout (max 60s)
const MODE_SWITCH_TIMEOUT_MS = 60_000;
const MODE_POLL_INTERVAL_MS = 2_000;

// ============================================================================
// TYPES
// ============================================================================

export interface ShotForGpuGeneration {
  segment_index: number;
  /** Media type from ShotPart1: 'video' or 'motiongraphic' */
  media_type: 'video' | 'motiongraphic';
  visual_prompt: string;
  duration_seconds?: number;
  /** Input image URL for video generation (keyframe) */
  input_image_url?: string;
}

export interface GpuGenerationResult {
  shot_index: number;
  media_url: string;
  generation_status: 'completed' | 'failed';
  error_message?: string;
}

export interface BatchGpuGenerationResult {
  results: GpuGenerationResult[];
  stats: {
    imagesGenerated: number;
    imagesFailed: number;
    videosGenerated: number;
    videosFailed: number;
  };
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Calculate timeout for a batch based on item count and type
 */
function calculateTimeout(
  type: 'image_generation' | 'image_editing' | 'video_generation',
  itemCount: number,
  avgDurationSec?: number
): number {
  const config = TIMEOUT_CONFIG[type];
  if (type === 'video_generation') {
    return config.baseMs + itemCount * (avgDurationSec || 5) * (config as any).perSecondMs;
  }
  return config.baseMs + itemCount * (config as any).perItemMs;
}

/**
 * Wait for VRAM mode to become ready
 */
async function waitForModeReady(
  targetMode: string,
  timeoutMs: number = MODE_SWITCH_TIMEOUT_MS
): Promise<boolean> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    const result = await callGpuGetMode();
    
    if (result.success && result.data) {
      // Check if mode matches and not currently switching
      if (result.data.mode === targetMode && !result.data.is_switching) {
        return true;
      }
      
      // Log switching progress
      if (result.data.is_switching) {
        console.log(`[GPU-Batch] Mode switching: ${result.data.switching_progress ? Math.round(result.data.switching_progress * 100) + '%' : 'in progress'}`);
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, MODE_POLL_INTERVAL_MS));
  }
  
  console.error(`[GPU-Batch] Mode switch timeout waiting for ${targetMode}`);
  return false;
}

/**
 * Ensure GPU is in the correct VRAM mode
 */
async function ensureMode(targetMode: 'image_generation' | 'image_editing' | 'video_generation'): Promise<boolean> {
  // Get current mode
  const currentMode = await callGpuGetMode();
  
  if (currentMode.success && currentMode.data?.mode === targetMode && !currentMode.data.is_switching) {
    console.log(`[GPU-Batch] Already in ${targetMode} mode`);
    return true;
  }
  
  // Switch mode
  console.log(`[GPU-Batch] Switching to ${targetMode} mode...`);
  const switchTarget = targetMode === 'video_generation' ? 'video' : 'image';
  const switchResult = await callGpuSwitchMode(switchTarget);
  
  if (!switchResult.success) {
    console.error(`[GPU-Batch] Failed to initiate mode switch: ${switchResult.error}`);
    return false;
  }
  
  // Wait for switch to complete
  return await waitForModeReady(targetMode);
}

/**
 * Generate placeholder URL for fallback
 */
function getPlaceholderUrl(mediaType: string, index: number): string {
  const timestamp = Date.now();
  if (mediaType === 'video') {
    return `https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4?t=${timestamp}_${index}`;
  }
  return `https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?q=80&w=400&auto=format&fit=crop&t=${timestamp}_${index}`;
}

// ============================================================================
// MAIN BATCH GENERATION
// ============================================================================

/**
 * Process shots in batches by type with VRAM mode switching
 * 
 * Order: Images → Edits → Videos
 */
export async function processGpuBatchGeneration(
  userId: string,
  videoId: string,
  shots: ShotForGpuGeneration[],
  aspectRatio: AspectRatio,
  onProgress?: (message: string, percent: number) => void
): Promise<BatchGpuGenerationResult> {
  const logPrefix = '[GPU-Batch]';
  const results: GpuGenerationResult[] = [];
  
  const stats = {
    imagesGenerated: 0,
    imagesFailed: 0,
    videosGenerated: 0,
    videosFailed: 0,
  };

  // Group shots by type
  // ShotPart1.media_type is 'video' | 'motiongraphic'
  // - 'video' shots -> GPU video generation (requires keyframe image)
  // - 'motiongraphic' shots -> GPU image generation for keyframe
  const videoShots = shots.filter(s => s.media_type === 'video');
  const imageShots = shots.filter(s => s.media_type !== 'video'); // Everything else gets image gen
  // Motion graphics and other types get image generation for their keyframe

  console.log(`${logPrefix} Processing: ${imageShots.length} images, ${videoShots.length} videos`);

  // =========================================================================
  // STEP 1: Generate all images
  // =========================================================================
  if (imageShots.length > 0) {
    onProgress?.('Switching to image generation mode...', 10);
    
    const modeReady = await ensureMode('image_generation');
    if (!modeReady) {
      console.error(`${logPrefix} Failed to switch to image_generation mode`);
      // Fallback all images to placeholders
      for (const shot of imageShots) {
        results.push({
          shot_index: shot.segment_index,
          media_url: getPlaceholderUrl('image', shot.segment_index),
          generation_status: 'failed',
          error_message: 'Failed to switch GPU mode',
        });
        stats.imagesFailed++;
      }
    } else {
      onProgress?.(`Generating ${imageShots.length} images...`, 20);
      const imageResults = await processImageBatch(userId, videoId, imageShots, aspectRatio);
      results.push(...imageResults);
      
      stats.imagesGenerated = imageResults.filter(r => r.generation_status === 'completed').length;
      stats.imagesFailed = imageResults.filter(r => r.generation_status === 'failed').length;
    }
  }

  // =========================================================================
  // STEP 2: Generate all videos (requires keyframe images first)
  // =========================================================================
  if (videoShots.length > 0) {
    onProgress?.('Switching to video generation mode...', 50);
    
    const modeReady = await ensureMode('video_generation');
    if (!modeReady) {
      console.error(`${logPrefix} Failed to switch to video_generation mode`);
      // Fallback all videos to placeholders
      for (const shot of videoShots) {
        results.push({
          shot_index: shot.segment_index,
          media_url: getPlaceholderUrl('video', shot.segment_index),
          generation_status: 'failed',
          error_message: 'Failed to switch GPU mode',
        });
        stats.videosFailed++;
      }
    } else {
      onProgress?.(`Generating ${videoShots.length} videos...`, 60);
      const videoResults = await processVideoBatch(userId, videoId, videoShots, aspectRatio);
      results.push(...videoResults);
      
      stats.videosGenerated = videoResults.filter(r => r.generation_status === 'completed').length;
      stats.videosFailed = videoResults.filter(r => r.generation_status === 'failed').length;
    }
  }

  console.log(`${logPrefix} Complete: ${stats.imagesGenerated} images, ${stats.videosGenerated} videos generated`);
  console.log(`${logPrefix} Failed: ${stats.imagesFailed} images, ${stats.videosFailed} videos`);

  return { results, stats };
}

// ============================================================================
// IMAGE BATCH PROCESSING
// ============================================================================

async function processImageBatch(
  userId: string,
  videoId: string,
  shots: ShotForGpuGeneration[],
  aspectRatio: AspectRatio
): Promise<GpuGenerationResult[]> {
  const logPrefix = '[GPU-Batch/Images]';
  const batchId = `img-${videoId}-${uuidv4().slice(0, 8)}`;
  const webhookUrl = getWebhookUrl();
  const webhookSecret = getWebhookSecret();
  
  console.log(`${logPrefix} Preparing batch ${batchId} with ${shots.length} items`);

  // Prepare batch items with presigned URLs
  const items: BatchImageGenerateItem[] = [];
  const itemIdToShot = new Map<string, ShotForGpuGeneration>();
  
  for (const shot of shots) {
    const itemId = `shot-${shot.segment_index}-${uuidv4().slice(0, 8)}`;
    const filename = `shot_${shot.segment_index}.png`;
    const key = generateMediaKey(userId, videoId, STORAGE_PATHS.IMAGES.GENERATED, filename);
    
    try {
      const { putUrl } = await generatePresignedPutUrl(key, 'image/png');
      
      items.push({
        item_id: itemId,
        prompt: shot.visual_prompt,
        aspect_ratio: aspectRatio,
        save_url: putUrl,
      });
      
      itemIdToShot.set(itemId, shot);
    } catch (error) {
      console.error(`${logPrefix} Failed to create presigned URL for shot ${shot.segment_index}:`, error);
    }
  }

  if (items.length === 0) {
    return shots.map(shot => ({
      shot_index: shot.segment_index,
      media_url: getPlaceholderUrl('image', shot.segment_index),
      generation_status: 'failed' as const,
      error_message: 'Failed to create storage URLs',
    }));
  }

  // Submit batch
  const submitResult = await callGpuBatchImageGenerate(batchId, items, webhookUrl, webhookSecret);
  
  if (!submitResult.success) {
    console.error(`${logPrefix} Batch submission failed: ${submitResult.errorMessage}`);
    return shots.map(shot => ({
      shot_index: shot.segment_index,
      media_url: getPlaceholderUrl('image', shot.segment_index),
      generation_status: 'failed' as const,
      error_message: submitResult.errorMessage || 'Batch submission failed',
    }));
  }

  console.log(`${logPrefix} Batch ${batchId} submitted, waiting for webhooks...`);

  // Wait for all webhooks with calculated timeout
  const timeout = calculateTimeout('image_generation', items.length);
  const results = await waitForBatchWebhooks(items, itemIdToShot, timeout, 'image');

  return results;
}

// ============================================================================
// VIDEO BATCH PROCESSING
// ============================================================================

async function processVideoBatch(
  userId: string,
  videoId: string,
  shots: ShotForGpuGeneration[],
  aspectRatio: AspectRatio
): Promise<GpuGenerationResult[]> {
  const logPrefix = '[GPU-Batch/Videos]';
  const batchId = `vid-${videoId}-${uuidv4().slice(0, 8)}`;
  const webhookUrl = getWebhookUrl();
  const webhookSecret = getWebhookSecret();
  
  console.log(`${logPrefix} Preparing batch ${batchId} with ${shots.length} items`);

  // For videos, we need a start frame image
  // If not provided, use a placeholder or skip
  const items: BatchVideoGenerateItem[] = [];
  const itemIdToShot = new Map<string, ShotForGpuGeneration>();
  const skippedShots: GpuGenerationResult[] = [];
  
  for (const shot of shots) {
    if (!shot.input_image_url) {
      console.warn(`${logPrefix} Shot ${shot.segment_index} has no input image, skipping video generation`);
      skippedShots.push({
        shot_index: shot.segment_index,
        media_url: getPlaceholderUrl('video', shot.segment_index),
        generation_status: 'failed',
        error_message: 'No input image for video generation',
      });
      continue;
    }

    const itemId = `shot-${shot.segment_index}-${uuidv4().slice(0, 8)}`;
    const filename = `shot_${shot.segment_index}.mp4`;
    const key = generateMediaKey(userId, videoId, STORAGE_PATHS.FOOTAGE.GENERATED, filename);
    
    try {
      const { putUrl } = await generatePresignedPutUrl(key, 'video/mp4');
      
      items.push({
        item_id: itemId,
        input_image_url: shot.input_image_url,
        prompt: shot.visual_prompt,
        duration_seconds: shot.duration_seconds || 5,
        aspect_ratio: aspectRatio,
        save_url: putUrl,
      });
      
      itemIdToShot.set(itemId, shot);
    } catch (error) {
      console.error(`${logPrefix} Failed to create presigned URL for shot ${shot.segment_index}:`, error);
      skippedShots.push({
        shot_index: shot.segment_index,
        media_url: getPlaceholderUrl('video', shot.segment_index),
        generation_status: 'failed',
        error_message: 'Failed to create storage URL',
      });
    }
  }

  if (items.length === 0) {
    return skippedShots;
  }

  // Submit batch
  const submitResult = await callGpuBatchVideoGenerate(batchId, items, webhookUrl, webhookSecret);
  
  if (!submitResult.success) {
    console.error(`${logPrefix} Batch submission failed: ${submitResult.errorMessage}`);
    const allFailed = shots.map(shot => ({
      shot_index: shot.segment_index,
      media_url: getPlaceholderUrl('video', shot.segment_index),
      generation_status: 'failed' as const,
      error_message: submitResult.errorMessage || 'Batch submission failed',
    }));
    return allFailed;
  }

  console.log(`${logPrefix} Batch ${batchId} submitted, waiting for webhooks...`);

  // Calculate timeout based on average duration
  const avgDuration = shots.reduce((sum, s) => sum + (s.duration_seconds || 5), 0) / shots.length;
  const timeout = calculateTimeout('video_generation', items.length, avgDuration);
  
  const webhookResults = await waitForBatchWebhooks(items, itemIdToShot, timeout, 'video');

  return [...webhookResults, ...skippedShots];
}

// ============================================================================
// WEBHOOK COLLECTION
// ============================================================================

async function waitForBatchWebhooks<T extends { item_id: string }>(
  items: T[],
  itemIdToShot: Map<string, ShotForGpuGeneration>,
  timeoutMs: number,
  mediaType: 'image' | 'video'
): Promise<GpuGenerationResult[]> {
  const logPrefix = `[GPU-Batch/Webhooks]`;
  const results: GpuGenerationResult[] = [];
  
  // Create promises for all items
  const webhookPromises = items.map(async (item) => {
    const shot = itemIdToShot.get(item.item_id);
    if (!shot) {
      return {
        shot_index: -1,
        media_url: getPlaceholderUrl(mediaType, 0),
        generation_status: 'failed' as const,
        error_message: 'Item mapping not found',
      };
    }

    try {
      const webhookResult = await waitForWebhookResult(item.item_id, timeoutMs);
      
      if (webhookResult.status === 'completed' && webhookResult.result?.save_url) {
        // Get public URL from the storage key
        const filename = `shot_${shot.segment_index}.${mediaType === 'video' ? 'mp4' : 'png'}`;
        const storagePath = mediaType === 'video' ? STORAGE_PATHS.FOOTAGE.GENERATED : STORAGE_PATHS.IMAGES.GENERATED;
        // Note: We use the save_url from webhook which should be the final public URL
        // or we reconstruct it from the key
        
        return {
          shot_index: shot.segment_index,
          media_url: webhookResult.result.save_url,
          generation_status: 'completed' as const,
        };
      } else {
        console.warn(`${logPrefix} Shot ${shot.segment_index} failed: ${webhookResult.errorMessage}`);
        return {
          shot_index: shot.segment_index,
          media_url: getPlaceholderUrl(mediaType, shot.segment_index),
          generation_status: 'failed' as const,
          error_message: webhookResult.errorMessage || 'GPU generation failed',
        };
      }
    } catch (error) {
      console.error(`${logPrefix} Webhook wait failed for shot ${shot.segment_index}:`, error);
      return {
        shot_index: shot.segment_index,
        media_url: getPlaceholderUrl(mediaType, shot.segment_index),
        generation_status: 'failed' as const,
        error_message: error instanceof Error ? error.message : 'Webhook timeout',
      };
    }
  });

  // Wait for all webhooks
  const allResults = await Promise.all(webhookPromises);
  results.push(...allResults);

  return results;
}
