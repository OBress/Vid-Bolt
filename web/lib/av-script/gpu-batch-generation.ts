/**
 * GPU Batch Media Generation for AV Script Part 2
 * ============================================================================
 * Handles batch-by-type GPU generation with VRAM mode switching.
 * 
 * Processing Order:
 * 1. All keyframe images (image_generation mode)
 *    - Standalone images for motiongraphic shots (standard HD dimensions)
 *    - Keyframe images for video shots (32-divisible dimensions for LTX-2)
 * 2. All videos (video_generation mode) - using keyframe images as start frames
 */

import { v4 as uuidv4 } from 'uuid';
import {
  callGpuBatchImageGenerate,
  callGpuBatchVideoGenerate,
  callGpuGetMode,
  callGpuSwitchMode,
  forceUpdateGpuActivity,
  getImageDimensions,
  getVideoDimensions,
  type AspectRatio,
  type BatchImageGenerateItem,
  type BatchVideoGenerateItem,
} from '@/lib/services/gpu-api-service';
import {
  generateMediaKey,
  generatePresignedPutUrl,
  generatePresignedGetUrl,
  getPublicUrl,
  getKeyFromUrl,
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
// Images: ~7-15s each with batch overhead, Videos: ~8x duration
export const TIMEOUT_CONFIG = {
  image_generation: { baseMs: 60_000, perItemMs: 20_000 },
  image_editing: { baseMs: 60_000, perItemMs: 20_000 },
  video_generation: { baseMs: 120_000, perSecondMs: 15_000 },
};

// Mode switch timeout (LTX-2 loading can take ~90s+)
export const MODE_SWITCH_TIMEOUT_MS = 180_000;
const MODE_POLL_INTERVAL_MS = 2_000;
// Stabilization delay after mode switch completes (GPU needs a moment)
const POST_SWITCH_DELAY_MS = 5_000;

// ============================================================================
// TYPES
// ============================================================================

export interface ShotForGpuGeneration {
  segment_index: number;
  /** Media type from ShotPart1: 'video' or 'motiongraphic' */
  media_type: 'video' | 'motiongraphic';
  visual_prompt: string;
  duration_seconds?: number;
  /** Start frame image URL for video generation (keyframe) */
  start_frame_url?: string;
  /** Optional end frame image URL for video interpolation */
  end_frame_url?: string;
  /** Number of images for multi-image motiongraphics (default: 1) */
  image_count?: number;
  /** Pre-matched stock media refs for multi-image shots */
  stock_media_refs?: Array<{ id: string; url: string; thumbnailUrl: string; description: string; similarity: number }>;
  /** Routing tags for generation tool selection */
  visual_elements?: import('@/types/video').RoutingTag[];
  /** Narration text for MG pacing */
  narration_text?: string;
}

export interface GpuGenerationResult {
  shot_index: number;
  media_url: string;
  generation_status: 'completed' | 'failed';
  error_message?: string;
  /** Individual media items for multi-image shots */
  media_items?: import('@/types/video').MediaItem[];
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

/** Fired each time a single item's webhook resolves (success or failure). */
export interface ItemCompleteEvent {
  completed: number;
  total: number;
  mediaType: 'image' | 'video';
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Calculate timeout for a batch based on item count and type
 */
export function calculateTimeout(
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
async function ensureMode(targetMode: 'image_generation' | 'image_editing' | 'video_generation' | 'audio_creation'): Promise<boolean> {
  // Get current mode
  const currentMode = await callGpuGetMode();
  
  if (currentMode.success && currentMode.data?.mode === targetMode && !currentMode.data.is_switching) {
    console.log(`[GPU-Batch] Already in ${targetMode} mode`);
    return true;
  }
  
  // Switch mode
  console.log(`[GPU-Batch] Switching to ${targetMode} mode...`);
  const switchTarget: 'image' | 'video' | 'audio' =
    targetMode === 'video_generation' ? 'video' :
    targetMode === 'audio_creation' ? 'audio' :
    'image';
  const switchResult = await callGpuSwitchMode(switchTarget);
  
  if (!switchResult.success) {
    console.error(`[GPU-Batch] Failed to initiate mode switch: ${switchResult.error}`);
    return false;
  }
  
  // Wait for switch to complete
  const ready = await waitForModeReady(targetMode);
  if (ready) {
    // Brief stabilization delay after mode switch
    console.log(`[GPU-Batch] Mode switch complete, stabilizing for ${POST_SWITCH_DELAY_MS / 1000}s...`);
    await new Promise(resolve => setTimeout(resolve, POST_SWITCH_DELAY_MS));
  }
  return ready;
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
 * Order:
 * 1. Generate keyframe images for ALL shots (image_generation mode)
 *    - Motiongraphic shots: standalone images with standard HD dimensions
 *    - Video shots: keyframe images with 32-divisible dimensions for LTX-2
 * 2. Generate videos using keyframe images as start frames (video_generation mode)
 */
export async function processGpuBatchGeneration(
  userId: string,
  videoId: string,
  shots: ShotForGpuGeneration[],
  aspectRatio: AspectRatio,
  onProgress?: (message: string, percent: number) => void,
  onItemComplete?: (event: ItemCompleteEvent) => void,
  /** Optional LoRA name to apply to all image generations */
  loraName?: string,
  /** Optional LoRA trigger words to prepend to all image prompts */
  loraTriggerWords?: string,
): Promise<BatchGpuGenerationResult> {
  const logPrefix = '[GPU-Batch]';
  const results: GpuGenerationResult[] = [];
  
  const stats = {
    imagesGenerated: 0,
    imagesFailed: 0,
    videosGenerated: 0,
    videosFailed: 0,
  };

  // -------------------------------------------------------------------------
  // Separate shots by final output type, distinguishing MG sub-categories:
  //  - Pure MG (remotion_overlay only): skip GPU entirely, Remotion code is the output
  //  - Hybrid MG (remotion_image_manipulation / remotion_video_manipulation):
  //      still need an AI image as input for the Remotion code
  //  - Video shots: need keyframe image → then video gen
  //  - Image-only shots (ai_image): just GPU image
  // -------------------------------------------------------------------------
  const videoShots = shots.filter(s => s.media_type === 'video');

  // Helper: does this MG shot need a base AI image?
  const mgNeedsBaseImage = (s: ShotForGpuGeneration) =>
    s.media_type === 'motiongraphic' &&
    s.visual_elements?.some(t => t === 'remotion_image_manipulation' || t === 'remotion_video_manipulation');

  const pureMgShots = shots.filter(
    s => s.media_type === 'motiongraphic' && !mgNeedsBaseImage(s)
  );
  const hybridMgShots = shots.filter(s => mgNeedsBaseImage(s));
  // Image-only shots: everything that isn't video or motiongraphic
  const imageOnlyShots = shots.filter(s => s.media_type !== 'video' && s.media_type !== 'motiongraphic');
  // Standalone images = pure image shots + hybrid MG shots (hybrid need base images)
  const standaloneImageShots = [...imageOnlyShots, ...hybridMgShots];
  // ALL shots that need keyframe images: standalone + video
  const allShotsForImages = [...standaloneImageShots, ...videoShots];

  console.log(`${logPrefix} Processing: ${imageOnlyShots.length} images, ${videoShots.length} videos, ${pureMgShots.length} pure MG (skipped), ${hybridMgShots.length} hybrid MG (need base images)`);

  // Pure MG shots don't need GPU at all — mark them for Remotion processing
  for (const shot of pureMgShots) {
    results.push({
      shot_index: shot.segment_index,
      media_url: `remotion://${shot.segment_index}`,
      generation_status: 'completed',
    });
  }

  // =========================================================================
  // STEP 1: Generate keyframe images for ALL shots
  // =========================================================================
  onProgress?.('Switching to image generation mode...', 10);
  
  const imageModeReady = await ensureMode('image_generation');
  if (!imageModeReady) {
    console.error(`${logPrefix} Failed to switch to image_generation mode`);
    // Fallback everything to failures — never mask with placeholder URLs
    for (const shot of shots) {
      const isVideo = shot.media_type === 'video';
      results.push({
        shot_index: shot.segment_index,
        media_url: '',
        generation_status: 'failed',
        error_message: 'Failed to switch GPU to image_generation mode',
      });
      if (isVideo) stats.videosFailed++;
      else stats.imagesFailed++;
    }
    console.log(`${logPrefix} Complete: ${stats.imagesGenerated} images, ${stats.videosGenerated} videos generated`);
    console.log(`${logPrefix} Failed: ${stats.imagesFailed} images, ${stats.videosFailed} videos`);
    return { results, stats };
  }

  onProgress?.(`Generating ${allShotsForImages.length} keyframe images...`, 20);
  
  // Generate images in two sub-batches with different dimensions:
  // - Standalone images (motiongraphics): standard HD (1920x1080)
  // - Video keyframes: 32-divisible (1920x1088) for LTX-2 compatibility
  // Total image count for progress tracking (standalone + keyframes)
  const totalImageCount = allShotsForImages.length;
  let imageItemsCompleted = 0;

  // Per-item callback wrapper that accumulates across sub-batches
  const imageItemCallback = onItemComplete
    ? (_event: ItemCompleteEvent) => {
        imageItemsCompleted++;
        onItemComplete({ completed: imageItemsCompleted, total: totalImageCount, mediaType: 'image' });
      }
    : undefined;

  const standaloneResults = standaloneImageShots.length > 0 
    ? await processImageBatch(userId, videoId, standaloneImageShots, aspectRatio, 'standalone', imageItemCallback, loraName, loraTriggerWords)
    : [];
  const keyframeResults = videoShots.length > 0
    ? await processImageBatch(userId, videoId, videoShots, aspectRatio, 'keyframe', imageItemCallback, loraName, loraTriggerWords)
    : [];
  
  // Assemble multi-image shots: group results by shot_index and build media_items
  const assembledResults = assembleMultiImageResults(standaloneImageShots, standaloneResults);
  results.push(...assembledResults);
  stats.imagesGenerated = assembledResults.filter(r => r.generation_status === 'completed').length;
  stats.imagesFailed = standaloneResults.filter(r => r.generation_status === 'failed').length;

  // Build a map of shot_index -> keyframe image URL for video generation
  const keyframeMap = new Map<number, string>();
  for (const kr of keyframeResults) {
    if (kr.generation_status === 'completed' && kr.media_url) {
      keyframeMap.set(kr.shot_index, kr.media_url);
    }
  }
  console.log(`${logPrefix} Keyframe images generated: ${keyframeMap.size}/${videoShots.length} for video shots`);

  // =========================================================================
  // STEP 2: Generate all videos using keyframe images as start frames
  // =========================================================================
  if (videoShots.length > 0) {
    onProgress?.('Switching to video generation mode...', 50);
    
    // Wire keyframe URLs into video shots as presigned GET URLs
    // The keyframe URLs from webhooks are raw R2 internal URLs that require auth.
    // The GPU API needs to download these images, so we generate presigned GET URLs.
    for (const shot of videoShots) {
      const keyframeUrl = keyframeMap.get(shot.segment_index);
      if (keyframeUrl) {
        try {
          const key = getKeyFromUrl(keyframeUrl);
          const presignedGetUrl = await generatePresignedGetUrl(key);
          shot.start_frame_url = presignedGetUrl;
          console.log(`${logPrefix} Shot ${shot.segment_index}: Wired keyframe image as start frame (presigned GET URL)`);
        } catch (err) {
          console.error(`${logPrefix} Shot ${shot.segment_index}: Failed to generate presigned GET URL, using raw URL`, err);
          shot.start_frame_url = keyframeUrl;
        }
      } else {
        console.warn(`${logPrefix} Shot ${shot.segment_index}: No keyframe image available, video will be skipped`);
      }
    }
    
    const modeReady = await ensureMode('video_generation');
    if (!modeReady) {
      console.error(`${logPrefix} Failed to switch to video_generation mode`);
      for (const shot of videoShots) {
        results.push({
          shot_index: shot.segment_index,
          media_url: '',
          generation_status: 'failed',
          error_message: 'Failed to switch GPU to video_generation mode',
        });
        stats.videosFailed++;
      }
    } else {
      onProgress?.(`Generating ${videoShots.length} videos...`, 60);
      const videoResults = await processVideoBatch(userId, videoId, videoShots, aspectRatio, onItemComplete);
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
  aspectRatio: AspectRatio,
  purpose: 'standalone' | 'keyframe' = 'standalone',
  onItemComplete?: (event: ItemCompleteEvent) => void,
  /** Optional LoRA name to apply to all images in this batch */
  loraName?: string,
  /** Optional LoRA trigger words to prepend to prompts */
  loraTriggerWords?: string,
): Promise<GpuGenerationResult[]> {
  const logPrefix = `[GPU-Batch/Images/${purpose}]`;
  const batchId = `img-${purpose}-${videoId}-${uuidv4().slice(0, 8)}`;
  const webhookUrl = getWebhookUrl();
  const webhookSecret = getWebhookSecret();
  
  // Count total GPU items (shots with image_count > 1 expand to multiple items)
  let totalGpuItems = 0;
  for (const shot of shots) {
    const imageCount = shot.image_count || 1;
    const stockCount = shot.stock_media_refs?.length || 0;
    const aiImagesNeeded = Math.max(1, imageCount - stockCount);
    totalGpuItems += aiImagesNeeded;
  }
  
  console.log(`${logPrefix} Preparing batch ${batchId}: ${shots.length} shots → ${totalGpuItems} GPU items (${purpose})`);

  // Prepare batch items with presigned URLs
  const items: BatchImageGenerateItem[] = [];
  const itemIdToShot = new Map<string, ShotForGpuGeneration>();
  
  // Track sub-item index for multi-image shots: item_id → sub-item index within the shot
  const itemIdToSubIndex = new Map<string, number>();
  
  // Select dimensions based on purpose:
  // - standalone: standard HD (1920x1080) for final motiongraphic images
  // - keyframe: 32-divisible (1920x1088) for LTX-2 video start frames
  const { width, height } = purpose === 'keyframe' 
    ? getVideoDimensions(aspectRatio) 
    : getImageDimensions(aspectRatio);
  
  console.log(`${logPrefix} Using dimensions: ${width}x${height} (${purpose})`);

  // Use appropriate storage path based on purpose
  const storagePath = purpose === 'keyframe' 
    ? STORAGE_PATHS.IMAGES.GENERATED
    : STORAGE_PATHS.IMAGES.GENERATED;

  for (const shot of shots) {
    const imageCount = shot.image_count || 1;
    const stockCount = shot.stock_media_refs?.length || 0;
    // For multi-image: AI generates (imageCount - stockCount) images, minimum 1
    const aiImagesNeeded = Math.max(1, imageCount - stockCount);
    
    for (let imgIdx = 0; imgIdx < aiImagesNeeded; imgIdx++) {
      // For multi-image, include sub-index in item ID and filename
      const subSuffix = aiImagesNeeded > 1 ? `-img${imgIdx}` : '';
      const itemId = `shot-${shot.segment_index}${subSuffix}-${uuidv4().slice(0, 8)}`;
      const suffix = purpose === 'keyframe' ? '_keyframe' : '';
      const filenameSuffix = aiImagesNeeded > 1 ? `_${imgIdx}` : '';
      const filename = `shot_${shot.segment_index}${suffix}${filenameSuffix}.png`;
      const key = generateMediaKey(userId, videoId, storagePath, filename);
      
      try {
        const { putUrl } = await generatePresignedPutUrl(key, 'image/png');
        
        // Inject LoRA trigger words into prompt text for style activation
        const effectivePrompt = loraTriggerWords
          ? `${loraTriggerWords} ${shot.visual_prompt}`
          : shot.visual_prompt;

        items.push({
          item_id: itemId,
          prompt: effectivePrompt,
          aspect_ratio: aspectRatio,
          width,
          height,
          save_url: putUrl,
          ...(loraName ? { lora_name: loraName } : {}),
        });
        
        itemIdToShot.set(itemId, shot);
        // Track which sub-item index this is (stock items will be added at higher indices)
        itemIdToSubIndex.set(itemId, imgIdx);
      } catch (error) {
        console.error(`${logPrefix} Failed to create presigned URL for shot ${shot.segment_index} img ${imgIdx}:`, error);
      }
    }
  }

  if (items.length === 0) {
    return shots.map(shot => ({
      shot_index: shot.segment_index,
      media_url: '',
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
      media_url: '',
      generation_status: 'failed' as const,
      error_message: submitResult.errorMessage || 'Batch submission failed',
    }));
  }

  console.log(`${logPrefix} Batch ${batchId} submitted (${items.length} items), waiting for webhooks...`);

  // Wait for all webhooks with calculated timeout
  const timeout = calculateTimeout('image_generation', items.length);
  console.log(`${logPrefix} Webhook timeout: ${Math.round(timeout / 1000)}s for ${items.length} items`);

  // Force-update GPU activity before long webhook wait to prevent VM shutdown
  forceUpdateGpuActivity().catch(() => {});

  const results = await waitForBatchWebhooks(items, itemIdToShot, timeout, 'image', onItemComplete);

  return results;
}

// ============================================================================
// MULTI-IMAGE RESULT ASSEMBLY
// ============================================================================

/**
 * Assemble multi-image results: for shots with image_count > 1, group results
 * by shot_index, include stock images, and build media_items array.
 * Single-image shots pass through unchanged.
 */
function assembleMultiImageResults(
  shots: ShotForGpuGeneration[],
  gpuResults: GpuGenerationResult[]
): GpuGenerationResult[] {
  const assembled: GpuGenerationResult[] = [];
  
  for (const shot of shots) {
    const imageCount = shot.image_count || 1;
    const stockRefs = shot.stock_media_refs || [];
    
    // Single-image shot — pass through directly
    if (imageCount <= 1 && stockRefs.length === 0) {
      const result = gpuResults.find(r => r.shot_index === shot.segment_index);
      if (result) {
        assembled.push(result);
      } else {
        assembled.push({
          shot_index: shot.segment_index,
          media_url: '',
          generation_status: 'failed',
          error_message: 'No GPU result for shot',
        });
      }
      continue;
    }
    
    // Multi-image shot — collect all GPU results for this shot
    const shotResults = gpuResults.filter(r => r.shot_index === shot.segment_index);
    const mediaItems: import('@/types/video').MediaItem[] = [];
    let itemIndex = 0;
    
    // Add AI-generated images
    for (const result of shotResults) {
      mediaItems.push({
        item_index: itemIndex++,
        media_type: 'image',
        media_url: result.media_url,
        visual_prompt: shot.visual_prompt,
        source: 'ai_generated',
        generation_status: result.generation_status,
        error_message: result.error_message,
      });
    }
    
    // Add stock images as pre-completed items
    for (const stockRef of stockRefs) {
      mediaItems.push({
        item_index: itemIndex++,
        media_type: 'image',
        media_url: stockRef.url,
        visual_prompt: stockRef.description,
        source: 'stock',
        stock_media_id: stockRef.id,
        generation_status: 'completed',
      });
    }
    
    // Primary URL is first item (AI-generated takes priority)
    const primaryUrl = mediaItems.find(m => m.media_url)?.media_url || '';
    const allCompleted = mediaItems.every(m => m.generation_status === 'completed');
    const anyFailed = mediaItems.some(m => m.generation_status === 'failed');
    
    assembled.push({
      shot_index: shot.segment_index,
      media_url: primaryUrl,
      generation_status: anyFailed ? 'failed' : (allCompleted ? 'completed' : 'failed'),
      media_items: mediaItems,
      error_message: anyFailed 
        ? `${mediaItems.filter(m => m.generation_status === 'failed').length}/${mediaItems.length} items failed` 
        : undefined,
    });
    
    console.log(`[GPU-Batch] Shot ${shot.segment_index}: assembled ${mediaItems.length} media items (${shotResults.length} AI + ${stockRefs.length} stock)`);
  }
  
  return assembled;
}

// ============================================================================
// LTX-2 PROMPT ENRICHMENT
// ============================================================================

/**
 * Enrich a visual prompt for LTX-2 video generation.
 * Based on official LTX-2 prompting guide (https://ltx.io/model/model-blog/prompting-guide-for-ltx-2):
 * - Single flowing paragraph (no bullets/lists)
 * - Present tense verbs for movement and action
 * - Explicit camera motion terms (tracks, pans, pushes in, etc.)
 * - Describe the action as a natural beginning-to-end sequence
 * - 4-8 descriptive sentences covering shot, scene, action, camera
 */
function enrichLtx2Prompt(rawPrompt: string, durationSeconds: number, shotIndex?: number): string {
  // Check if agent already specified detailed camera motion
  const hasMotionLanguage = /\b(camera|pan|track|zoom|dolly|tilt|push|pull|follow|crane|handheld|close-?up|wide shot|medium shot|orbit|sweep|glide)\b/i.test(rawPrompt);

  // If the agent already provided camera motion, DON'T override it —
  // only add quality constraints and duration-aware pacing guidance
  if (hasMotionLanguage) {
    // Duration-aware pacing hint (Fix 4: calibrate motion to clip length)
    const pacingHint = durationSeconds <= 3
      ? 'Execute camera movement quickly and decisively within the short duration.'
      : durationSeconds <= 5
      ? 'Smooth, measured camera movement filling the full duration.'
      : `Extended, graceful camera movement maintaining visual interest across the full ${durationSeconds}s.`;
    
    return [
      rawPrompt.trim().replace(/\.$/, ''),
      pacingHint,
      'Cinematic quality, photorealistic rendering.',
      'No watermarks, no text overlays, no CGI artifacts.',
    ].join('. ') + '.';
  }

  // No camera motion specified by agent — add duration-calibrated motion
  const cameraStyles = [
    'Slow dolly push-in revealing fine details, shallow depth of field.',
    'Smooth tracking shot follows the action laterally, cinematic movement.',
    'Subtle crane shot rising gently, establishing the scene from above.',
    'Handheld close-up with natural micro-movements, intimate perspective.',
    'Wide establishing shot with gentle parallax drift, atmospheric depth.',
    'Medium shot with slow orbit around the subject, smooth rotation.',
  ];

  // Fix 4: Duration-calibrated motion intensity
  const motionCue = durationSeconds <= 3
    ? 'Camera locks on subject with minimal organic movement, sharp focus.'
    : durationSeconds <= 5
    ? cameraStyles[(shotIndex || 0) % cameraStyles.length]
    : `${cameraStyles[(shotIndex || 0) % cameraStyles.length]} The movement continues smoothly for the full ${durationSeconds}s duration.`;

  return [
    rawPrompt.trim().replace(/\.$/, ''),
    motionCue,
    'Soft natural lighting with atmospheric depth and volumetric haze.',
    'Cinematic quality, photorealistic rendering, smooth continuous motion throughout the entire shot.',
    'No watermarks, no text overlays, no stock photo feel, no CGI artifacts.',
  ].join('. ') + '.';
}

// ============================================================================
// VIDEO BATCH PROCESSING
// ============================================================================

async function processVideoBatch(
  userId: string,
  videoId: string,
  shots: ShotForGpuGeneration[],
  aspectRatio: AspectRatio,
  onItemComplete?: (event: ItemCompleteEvent) => void
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
    if (!shot.start_frame_url) {
      console.warn(`${logPrefix} Shot ${shot.segment_index} has no start frame, skipping video generation`);
      skippedShots.push({
        shot_index: shot.segment_index,
        media_url: '',
        generation_status: 'failed',
        error_message: 'No start frame image for video generation',
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
        start_frame_url: shot.start_frame_url,
        prompt: enrichLtx2Prompt(shot.visual_prompt, shot.duration_seconds || 5, shot.segment_index),
        duration_seconds: Math.min(shot.duration_seconds || 5, 10),
        aspect_ratio: aspectRatio,
        save_url: putUrl,
        ...(shot.end_frame_url ? { end_frame_url: shot.end_frame_url } : {}),
      });
      
      itemIdToShot.set(itemId, shot);
    } catch (error) {
      console.error(`${logPrefix} Failed to create presigned URL for shot ${shot.segment_index}:`, error);
      skippedShots.push({
        shot_index: shot.segment_index,
        media_url: '',
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
      media_url: '',
      generation_status: 'failed' as const,
      error_message: submitResult.errorMessage || 'Batch submission failed',
    }));
    return allFailed;
  }

  console.log(`${logPrefix} Batch ${batchId} submitted, waiting for webhooks...`);

  // Calculate timeout based on average duration
  const avgDuration = shots.reduce((sum, s) => sum + (s.duration_seconds || 5), 0) / shots.length;
  const timeout = calculateTimeout('video_generation', items.length, avgDuration);
  
  // Force-update GPU activity before long webhook wait to prevent VM shutdown
  forceUpdateGpuActivity().catch(() => {});
  
  const webhookResults = await waitForBatchWebhooks(items, itemIdToShot, timeout, 'video', onItemComplete);

  return [...webhookResults, ...skippedShots];
}

// ============================================================================
// WEBHOOK COLLECTION
// ============================================================================

async function waitForBatchWebhooks<T extends { item_id: string }>(
  items: T[],
  itemIdToShot: Map<string, ShotForGpuGeneration>,
  timeoutMs: number,
  mediaType: 'image' | 'video',
  onItemComplete?: (event: ItemCompleteEvent) => void
): Promise<GpuGenerationResult[]> {
  const logPrefix = `[GPU-Batch/Webhooks]`;
  const results: GpuGenerationResult[] = [];
  
  // Create promises for all items
  const webhookPromises = items.map(async (item) => {
    const shot = itemIdToShot.get(item.item_id);
    if (!shot) {
      return {
        shot_index: -1,
        media_url: '',
        generation_status: 'failed' as const,
        error_message: 'Item mapping not found',
      };
    }

    try {
      const webhookResult = await waitForWebhookResult(item.item_id, timeoutMs);
      
      if (webhookResult.status === 'completed' && webhookResult.result?.save_url) {
        // Convert presigned PUT URL (upload-only) to public URL via custom domain
        // The webhook returns the same save_url we sent (a presigned PUT URL),
        // which is not viewable by browsers. Extract the key and build a public URL.
        let publicUrl = webhookResult.result.save_url;
        try {
          const key = getKeyFromUrl(publicUrl);
          publicUrl = getPublicUrl(key);
        } catch (e) {
          console.error(`[GPU-Batch/Webhooks] Failed to convert save_url to public URL for shot ${shot.segment_index}:`, e);
        }
        
        return {
          shot_index: shot.segment_index,
          media_url: publicUrl,
          generation_status: 'completed' as const,
        };
      } else {
        console.warn(`${logPrefix} Shot ${shot.segment_index} failed: ${webhookResult.errorMessage}`);
        return {
          shot_index: shot.segment_index,
          media_url: '',
          generation_status: 'failed' as const,
          error_message: webhookResult.errorMessage || 'GPU generation failed',
        };
      }
    } catch (error) {
      console.error(`${logPrefix} Webhook wait failed for shot ${shot.segment_index}:`, error);
      return {
        shot_index: shot.segment_index,
        media_url: '',
        generation_status: 'failed' as const,
        error_message: error instanceof Error ? error.message : 'Webhook timeout',
      };
    }
  });

  // Wait for all webhooks, tracking per-item completions
  let completedCount = 0;
  const trackedPromises = webhookPromises.map(async (promise) => {
    const result = await promise;
    completedCount++;
    onItemComplete?.({ completed: completedCount, total: items.length, mediaType });
    return result;
  });
  const allResults = await Promise.all(trackedPromises);
  results.push(...allResults);

  return results;
}
