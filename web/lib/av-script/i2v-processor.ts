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
import { fetchDynamicGpuApiUrl } from '@/lib/services/gpu-api-service';

const LOG_PREFIX = '[I2VProcessor]';
const GPU_API_SECRET = process.env.GPU_API_SECRET || '';

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
  aspectRatio: string = '16:9'
): Promise<string | null> {
  const gpuApiUrl = await fetchDynamicGpuApiUrl();
  if (!gpuApiUrl || gpuApiUrl === 'http://localhost:8000') {
    console.warn(`${LOG_PREFIX} No GPU VM available for image editing`);
    return null;
  }

  try {
    console.log(
      `${LOG_PREFIX} Shot ${shotIndex}: Editing image — "${editInstruction.substring(0, 80)}..."`
    );

    const response = await fetch(`${gpuApiUrl}/api/edit-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GPU_API_SECRET}`,
      },
      body: JSON.stringify({
        source_image_url: sourceImageUrl,
        edit_instruction: editInstruction,
        aspect_ratio: aspectRatio,
        video_id: videoId,
        shot_index: shotIndex,
      }),
      signal: AbortSignal.timeout(120_000), // 2 min timeout
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`${LOG_PREFIX} Shot ${shotIndex}: Image edit API error: ${response.status} — ${errText.substring(0, 200)}`);
      return null;
    }

    const result = await response.json();
    const editedUrl = result.url || result.media_url;

    if (!editedUrl) {
      console.error(`${LOG_PREFIX} Shot ${shotIndex}: No edited image URL in response`);
      return null;
    }

    console.log(`${LOG_PREFIX} Shot ${shotIndex}: Image edit complete → ${editedUrl}`);
    return editedUrl;

  } catch (error) {
    console.error(`${LOG_PREFIX} Shot ${shotIndex}: Image edit failed:`, error);
    return null;
  }
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

  if (!frameResult.frameUrl || frameResult.frameUrl === previousVideoUrl) {
    // extractLastFrame fell back to returning the video URL — frame extraction unavailable
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
    aspectRatio
  );

  if (!editedUrl) {
    console.warn(`${LOG_PREFIX} Shot ${shotIndex}: Image edit failed, falling back to T2V`);
    return null;
  }

  console.log(`${LOG_PREFIX} Shot ${shotIndex}: I2V pipeline complete — edited frame ready`);

  return {
    startFrameUrl: editedUrl,
    wasEdited: true,
    editInstruction: angleChange,
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
  aspectRatio: string = '16:9'
): Promise<string> {
  const editedUrl = await editImage(
    sourceImageUrl,
    editInstruction,
    videoId,
    shotIndex,
    aspectRatio
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
