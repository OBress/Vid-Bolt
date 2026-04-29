/**
 * I2V Processor — Image-Edit Pipeline
 * ============================================================================
 * General-purpose image editing pipeline used for:
 *
 * 1. **I2V Continuity**: Extract last frame from previous video → Qwen-Edit
 *    (angle change) → use as start frame for next video
 * 2. **Creative edits**: Edit a stock image or keyframe for dramatic effect
 *    (e.g., "add a clown mask to the statue") — used in video/MG/image shots
 * 3. **Variant generation**: Create visual variations of an image for MG
 *    compositions (e.g., before/after, highlighting specific elements)
 *
 * All three use the same pipeline:
 *   source image → (quality check) → Qwen-Edit → edited image URL
 *
 * Frame quality check is only applied to extracted video frames (I2V),
 * since stock/keyframe images are already quality-verified.
 */

import { callOpenRouter } from '@/lib/ai/openrouter';
import { extractLastFrame } from '@/lib/services/frame-extraction';
import {
  callGpuBatchImageEdit,
  callGpuGetJobStatus,
  callGpuImageEdit,
  type BatchImageEditItem,
} from '@/lib/services/gpu-api-service';
import {
  generateMediaKey,
  generatePresignedGetUrl,
  generatePresignedPutUrl,
  getKeyFromUrl,
  STORAGE_PATHS,
} from '@/lib/services/r2-storage';
import { waitForWebhookResult } from '@/lib/queues/webhook-listener';
import { v4 as uuidv4 } from 'uuid';

const LOG_PREFIX = '[I2VProcessor]';
/** Timeout for I2V continuity frame edits — single-shot, relatively fast. */
const CONTINUITY_EDIT_TIMEOUT_MS = 120_000; // 2 min
/** Timeout for creative edits on keyframes/stock images — matches standalone image-edit worker budget. */
const CREATIVE_EDIT_TIMEOUT_MS = 300_000;   // 5 min
const getWebhookUrl = () => process.env.WEBHOOK_CALLBACK_URL || 'http://localhost:3000/api/gpu-callback';
const getWebhookSecret = () => process.env.GPU_WEBHOOK_SECRET;

// ============================================================================
// FRAME QUALITY CHECK
// ============================================================================

/**
 * Quick VLM-based quality check on an extracted video frame.
 * Returns true if the frame is sharp and suitable for image editing.
 *
 * Only used for frames extracted from AI-generated video — stock images
 * and keyframes are already quality-verified and skip this check.
 *
 * Cost: ~$0.001 per check (single image + short prompt).
 */
export async function checkFrameQuality(
  frameUrl: string,
  userId: string
): Promise<{ usable: boolean; reason?: string }> {
  try {
    const result = await callOpenRouter(userId, [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: frameUrl },
          },
          {
            type: 'text',
            text: `Is this image clear, sharp, and suitable as a source for image editing? 
Consider: Is the main subject visible? Is there severe blur, corruption, or artifacts?
Minor AI generation artifacts are acceptable. Only reject if the image is genuinely unusable.
Reply with EXACTLY one word: YES or NO`,
          },
        ],
      },
    ], {
      model: 'google/gemini-2.0-flash-001',
      temperature: 0,
      maxTokens: 10,
      xTitle: 'Vid-Bolt Frame Quality Check',
    });

    const answer = result.content.trim().toUpperCase();
    const usable = answer.startsWith('YES');

    console.log(`${LOG_PREFIX} Frame quality check: ${usable ? 'PASS' : 'FAIL'} (${answer})`);

    return {
      usable,
      reason: usable ? undefined : 'Frame too blurry/corrupted for image editing',
    };
  } catch (error) {
    // On VLM failure, assume the frame is usable (don't block the pipeline)
    console.warn(`${LOG_PREFIX} Frame quality check failed, assuming usable:`, error);
    return { usable: true };
  }
}

// ============================================================================
// IMAGE EDITING (via Qwen-Edit on GPU)
// ============================================================================

/**
 * Edit an image using Qwen-Edit on the GPU VM.
 * Works for any edit instruction — angle changes, creative modifications, etc.
 *
 * @returns Edited image URL, or null if editing fails
 */
export async function editImage(
  sourceImageUrl: string,
  editInstruction: string,
  videoId: string,
  shotIndex: number,
  userId: string,
  aspectRatio: string = '16:9',
  timeoutMs: number = CONTINUITY_EDIT_TIMEOUT_MS,
): Promise<string | null> {
  try {
    console.log(
      `${LOG_PREFIX} Shot ${shotIndex}: Editing image - "${editInstruction.substring(0, 80)}..."`
    );

    const outputKey = generateMediaKey(
      userId,
      videoId,
      STORAGE_PATHS.IMAGES.GENERATED,
      `shot_${shotIndex}_creative_edit_${uuidv4().slice(0, 8)}.png`,
    );
    const { putUrl, publicUrl } = await generatePresignedPutUrl(outputKey, 'image/png');
    const itemId = `creative-edit-${shotIndex}-${uuidv4().slice(0, 8)}`;

    const submitResult = await callGpuImageEdit({
      job_id: `creative-edit-${videoId}-${shotIndex}-${uuidv4().slice(0, 8)}`,
      input_image_url: sourceImageUrl,
      prompt: editInstruction,
      aspect_ratio: aspectRatio as '16:9' | '9:16',
      save_url: putUrl,
      webhook_url: getWebhookUrl(),
      item_id: itemId,
      webhook_secret: getWebhookSecret(),
    });

    if (!submitResult.success) {
      console.error(
        `${LOG_PREFIX} Shot ${shotIndex}: GPU image edit rejected — ` +
        `code=${submitResult.errorCode}, msg=${submitResult.errorMessage}`
      );
      return null;
    }

    // For async jobs, editedUrl is not known yet — initialize to null and only
    // set to a real URL once the webhook or job-status poll confirms completion.
    // (publicUrl is the presigned PUT destination, not a readable URL.)
    let editedUrl: string | null = null;
    if (!submitResult.isAsync) {
      // Rare sync completion path — GPU returned save_url immediately.
      editedUrl = submitResult.publicUrl || null;
    }

    if (editedUrl === null && submitResult.isAsync && submitResult.jobId) {
      try {
        const webhookResult = await waitForWebhookResult(itemId, timeoutMs);
        if (webhookResult.status === 'completed') {
          editedUrl = webhookResult.result?.save_url || null;
        } else {
          console.error(
            `${LOG_PREFIX} Shot ${shotIndex}: Image edit webhook failed: ${webhookResult.errorMessage || 'Unknown error'}`
          );
          return null;
        }
      } catch (webhookError) {
        const jobStatus = await callGpuGetJobStatus(submitResult.jobId);
        if (jobStatus.success && jobStatus.job?.status === 'completed') {
          editedUrl = jobStatus.job.result?.save_url || null;
        } else {
          console.error(`${LOG_PREFIX} Shot ${shotIndex}: Image edit completion check failed:`, webhookError);
          return null;
        }
      }
    }

    if (!editedUrl) {
      console.error(`${LOG_PREFIX} Shot ${shotIndex}: No edited image URL in response`);
      return null;
    }

    console.log(`${LOG_PREFIX} Shot ${shotIndex}: Image edit complete -> ${editedUrl}`);
    return editedUrl;
  } catch (error) {
    console.error(`${LOG_PREFIX} Shot ${shotIndex}: Image edit failed:`, error);
    return null;
  }
}

export function normalizeAngleChangeInstruction(angleChange: string | undefined): string {
  const base = (angleChange || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 12)
    .join(' ');

  if (!base) return '';

  // Append preservation anchors so Qwen-Edit reframes the camera
  // without altering the subject's appearance, lighting, or world texture.
  // This is critical for I2V continuity — the frame edit is setting the start
  // frame for a new video generation; any subject drift here cascades forward.
  return `${base}. Preserve subject appearance, clothing, lighting, and background environment exactly. Only adjust camera angle and framing. Do not add or remove scene elements. No text, no watermarks.`;
}

export interface ContinuityWaveShotInput {
  shotIndex: number;
  previousShotIndex: number;
  previousVideoUrl: string;
  angleChange: string;
}

export interface ContinuityWaveBatchResult {
  startFrames: Record<string, string>;
  continuityOutputs: Record<string, Record<string, unknown>>;
  failedShotIndices: number[];
}

function isReusableContinuityEntry(
  entry: Record<string, unknown> | undefined,
  previousShotIndex: number,
  previousVideoUrl: string,
): boolean {
  if (!entry) return false;
  return entry.parent_shot_index === previousShotIndex
    && entry.source_video_url === previousVideoUrl;
}

async function toPresignedInputUrl(frameUrl: string): Promise<string> {
  try {
    return await generatePresignedGetUrl(getKeyFromUrl(frameUrl));
  } catch {
    return frameUrl;
  }
}

export async function processContinuityWaveBatch(params: {
  userId: string;
  videoId: string;
  aspectRatio?: '16:9' | '9:16';
  shots: ContinuityWaveShotInput[];
  existingContinuityOutputs?: Record<string, Record<string, unknown>>;
}): Promise<ContinuityWaveBatchResult> {
  const {
    userId,
    videoId,
    aspectRatio = '16:9',
    shots,
    existingContinuityOutputs = {},
  } = params;

  const result: ContinuityWaveBatchResult = {
    startFrames: {},
    continuityOutputs: {},
    failedShotIndices: [],
  };

  const shotsNeedingExtraction: Array<ContinuityWaveShotInput & {
    shotKey: string;
    extractedFrameUrl?: string;
    extractionMethod?: string;
  }> = [];

  for (const shot of shots) {
    const shotKey = `shot-${shot.shotIndex}`;
    const existing = existingContinuityOutputs[shotKey];
    if (isReusableContinuityEntry(existing, shot.previousShotIndex, shot.previousVideoUrl)) {
      const editedFrameUrl = existing.edited_frame_url;
      if (typeof editedFrameUrl === 'string' && editedFrameUrl) {
        result.startFrames[shotKey] = editedFrameUrl;
        result.continuityOutputs[shotKey] = {
          ...existing,
          reused_cached_edit: true,
        };
        continue;
      }
    }

    shotsNeedingExtraction.push({ ...shot, shotKey });
  }

  const extractedShots = await Promise.all(shotsNeedingExtraction.map(async shot => {
    const existing = existingContinuityOutputs[shot.shotKey];
    if (isReusableContinuityEntry(existing, shot.previousShotIndex, shot.previousVideoUrl)) {
      const extractedFrameUrl = existing.extracted_frame_url;
      if (typeof extractedFrameUrl === 'string' && extractedFrameUrl) {
        return {
          ...shot,
          extractedFrameUrl,
          extractionMethod: String(existing.extraction_method || 'cache'),
        };
      }
    }

    try {
      const frameResult = await extractLastFrame(
        shot.previousVideoUrl,
        videoId,
        shot.shotIndex,
      );

      return {
        ...shot,
        extractedFrameUrl: frameResult.frameUrl,
        extractionMethod: frameResult.extractionMethod,
      };
    } catch (error) {
      result.failedShotIndices.push(shot.shotIndex);
      result.continuityOutputs[shot.shotKey] = {
        parent_shot_index: shot.previousShotIndex,
        source_video_url: shot.previousVideoUrl,
        edit_instruction: normalizeAngleChangeInstruction(shot.angleChange),
        continuity_applied: false,
        status: 'fallback_to_t2v',
        failure_reason: error instanceof Error ? error.message : 'Frame extraction failed',
      };
    }
  }));

  const extractedReady = extractedShots.filter((shot): shot is NonNullable<typeof shot> => Boolean(shot));
  const usableFrames = await Promise.all(extractedReady.map(async shot => {
    const quality = await checkFrameQuality(shot.extractedFrameUrl!, userId);
    if (!quality.usable) {
      result.failedShotIndices.push(shot.shotIndex);
      result.continuityOutputs[shot.shotKey] = {
        parent_shot_index: shot.previousShotIndex,
        source_video_url: shot.previousVideoUrl,
        extracted_frame_url: shot.extractedFrameUrl,
        extraction_method: shot.extractionMethod,
        edit_instruction: normalizeAngleChangeInstruction(shot.angleChange),
        continuity_applied: false,
        status: 'fallback_to_t2v',
        failure_reason: quality.reason || 'Frame quality check failed',
      };
      return null;
    }

    return shot;
  }));

  const batchShots = usableFrames.filter((shot): shot is NonNullable<typeof shot> => Boolean(shot));
  if (batchShots.length === 0) {
    return result;
  }

  const batchId = `continuity-${videoId}-${uuidv4().slice(0, 8)}`;
  const webhookUrl = process.env.WEBHOOK_CALLBACK_URL || 'http://localhost:3000/api/gpu-callback';
  const webhookSecret = process.env.GPU_WEBHOOK_SECRET;
  const outputPublicUrls = new Map<string, string>();
  const batchItems: BatchImageEditItem[] = [];
  const itemIdToShot = new Map<string, typeof batchShots[number]>();

  for (const shot of batchShots) {
    const outputKey = generateMediaKey(
      userId,
      videoId,
      STORAGE_PATHS.IMAGES.GENERATED,
      `shot_${shot.shotIndex}_continuity_start.png`,
    );
    const { putUrl, publicUrl } = await generatePresignedPutUrl(outputKey, 'image/png');
    const itemId = `continuity-${shot.shotIndex}-${uuidv4().slice(0, 8)}`;
    outputPublicUrls.set(itemId, publicUrl);
    itemIdToShot.set(itemId, shot);
    batchItems.push({
      item_id: itemId,
      input_image_url: await toPresignedInputUrl(shot.extractedFrameUrl!),
      prompt: normalizeAngleChangeInstruction(shot.angleChange),
      aspect_ratio: aspectRatio,
      save_url: putUrl,
    });
  }

  const submitResult = await callGpuBatchImageEdit(
    batchId,
    batchItems,
    webhookUrl,
    webhookSecret,
  );

  if (!submitResult.success) {
    for (const shot of batchShots) {
      result.failedShotIndices.push(shot.shotIndex);
      result.continuityOutputs[shot.shotKey] = {
        parent_shot_index: shot.previousShotIndex,
        source_video_url: shot.previousVideoUrl,
        extracted_frame_url: shot.extractedFrameUrl,
        extraction_method: shot.extractionMethod,
        edit_instruction: normalizeAngleChangeInstruction(shot.angleChange),
        continuity_applied: false,
        status: 'fallback_to_t2v',
        failure_reason: submitResult.errorMessage || 'Batch image edit submission failed',
      };
    }
    return result;
  }

  await Promise.allSettled(batchItems.map(async item => {
    const shot = itemIdToShot.get(item.item_id);
    if (!shot) return;

    try {
      const webhookResult = await waitForWebhookResult(item.item_id, CONTINUITY_EDIT_TIMEOUT_MS);
      if (webhookResult.status === 'completed') {
        const startFrameUrl = outputPublicUrls.get(item.item_id) || '';
        result.startFrames[shot.shotKey] = startFrameUrl;
        result.continuityOutputs[shot.shotKey] = {
          parent_shot_index: shot.previousShotIndex,
          source_video_url: shot.previousVideoUrl,
          extracted_frame_url: shot.extractedFrameUrl,
          extraction_method: shot.extractionMethod,
          edit_instruction: normalizeAngleChangeInstruction(shot.angleChange),
          edited_frame_url: startFrameUrl,
          continuity_applied: true,
          status: 'ready',
        };
      } else {
        result.failedShotIndices.push(shot.shotIndex);
        result.continuityOutputs[shot.shotKey] = {
          parent_shot_index: shot.previousShotIndex,
          source_video_url: shot.previousVideoUrl,
          extracted_frame_url: shot.extractedFrameUrl,
          extraction_method: shot.extractionMethod,
          edit_instruction: normalizeAngleChangeInstruction(shot.angleChange),
          continuity_applied: false,
          status: 'fallback_to_t2v',
          failure_reason: webhookResult.errorMessage || 'Continuity image edit failed',
        };
      }
    } catch (error) {
      result.failedShotIndices.push(shot.shotIndex);
      result.continuityOutputs[shot.shotKey] = {
        parent_shot_index: shot.previousShotIndex,
        source_video_url: shot.previousVideoUrl,
        extracted_frame_url: shot.extractedFrameUrl,
        extraction_method: shot.extractionMethod,
        edit_instruction: normalizeAngleChangeInstruction(shot.angleChange),
        continuity_applied: false,
        status: 'fallback_to_t2v',
        failure_reason: error instanceof Error ? error.message : 'Continuity image edit timed out',
      };
    }
  }));

  return result;
}

// ============================================================================
// I2V CONTINUITY FLOW
// ============================================================================

export interface I2VResult {
  /** The start frame URL to use for video generation */
  startFrameUrl: string;
  /** Whether the frame was successfully edited (true) or fell back to T2V (false) */
  wasEdited: boolean;
  /** If edited, what instruction was used */
  editInstruction?: string;
}

/**
 * Process an I2V shot: extract last frame → quality check → Qwen-Edit.
 *
 * If any step fails (no GPU, bad frame, edit failure), returns null
 * so the caller can fall back to T2V with a fresh keyframe.
 *
 * @param previousVideoUrl - URL of the previous shot's generated video
 * @param angleChange - The angle_change directive from the shot planner
 * @param videoId - Project ID
 * @param shotIndex - Current shot index
 * @param userId - For VLM quality check billing
 * @param aspectRatio - Aspect ratio for Qwen-Edit
 */
export async function processI2VShot(
  previousVideoUrl: string,
  angleChange: string,
  videoId: string,
  shotIndex: number,
  userId: string,
  aspectRatio: string = '16:9'
): Promise<I2VResult | null> {
  console.log(`${LOG_PREFIX} Shot ${shotIndex}: Starting I2V pipeline (angle: "${angleChange}")`);

  // Step 1: Extract last frame from previous video
  let frameResult;
  try {
    frameResult = await extractLastFrame(previousVideoUrl, videoId, shotIndex);
  } catch (error) {
    console.error(`${LOG_PREFIX} Shot ${shotIndex}: Frame extraction failed:`, error);
    return null;
  }

  if (!frameResult.frameUrl) {
    console.warn(`${LOG_PREFIX} Shot ${shotIndex}: Frame extraction unavailable, falling back to T2V`);
    return null;
  }

  // Step 2: Quality check the extracted frame
  const quality = await checkFrameQuality(frameResult.frameUrl, userId);
  if (!quality.usable) {
    console.warn(
      `${LOG_PREFIX} Shot ${shotIndex}: Frame quality insufficient — "${quality.reason}". Falling back to T2V.`
    );
    return null;
  }

  // Step 3: Edit the frame with Qwen-Edit using the angle_change directive
  const editedUrl = await editImage(
    frameResult.frameUrl,
    angleChange,
    videoId,
    shotIndex,
    userId,
    aspectRatio,
    CONTINUITY_EDIT_TIMEOUT_MS,
  );

  if (!editedUrl) {
    console.warn(`${LOG_PREFIX} Shot ${shotIndex}: Image edit failed, falling back to T2V`);
    return null;
  }

  console.log(`${LOG_PREFIX} Shot ${shotIndex}: I2V pipeline complete — edited frame ready`);

  return {
    startFrameUrl: editedUrl,
    wasEdited: true,
    editInstruction: normalizeAngleChangeInstruction(angleChange),
  };
}

// ============================================================================
// CREATIVE IMAGE EDITING (non-I2V)
// ============================================================================

/**
 * Apply a creative edit to a keyframe or stock image.
 * No quality check needed — source images are already verified.
 *
 * Used for:
 * - Editing stock images for dramatic effect (e.g., "add clown mask to statue")
 * - Creating visual variations for motion graphics
 * - Modifying AI keyframes before video generation
 *
 * @returns Edited image URL, or the original URL if editing fails (non-blocking)
 */
export async function applyCreativeEdit(
  sourceImageUrl: string,
  editInstruction: string,
  videoId: string,
  shotIndex: number,
  userId: string,
  aspectRatio: string = '16:9'
): Promise<string> {
  const editedUrl = await editImage(
    sourceImageUrl,
    editInstruction,
    videoId,
    shotIndex,
    userId,
    aspectRatio,
    CREATIVE_EDIT_TIMEOUT_MS,  // Creative edits get 5 min — matches standalone image-edit worker
  );

  // Creative edits are non-blocking — if they fail, use the original image
  if (!editedUrl) {
    console.warn(
      `${LOG_PREFIX} Shot ${shotIndex}: Creative edit failed, using original image`
    );
    return sourceImageUrl;
  }

  return editedUrl;
}

