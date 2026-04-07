/**
 * Image Edit Worker
 * ============================================================================
 * Specialized worker for GCM-guided consistency editing via Qwen-Image-Edit-2511.
 *
 * Input:  Generated keyframe images + GCM entity references
 * Output: Edited images with corrected consistency (hair, clothing, lighting, etc.)
 */

import { Job, Processor } from 'bullmq';
import { updateTaskStatus, type TaskLifecycleOwner } from '@/lib/queues/shared';
import { waitForWebhookResult } from '@/lib/queues/webhook-listener';
import { callGpuGetJobStatus, callGpuImageEdit } from '@/lib/services/gpu-api-service';
import { generateMediaKey, generatePresignedPutUrl, STORAGE_PATHS } from '@/lib/services/r2-storage';

// ============================================================================
// TYPES
// ============================================================================

export interface ImageEditJobData {
  taskId: string;
  userId: string;
  videoId: string;
  taskLifecycleOwner?: TaskLifecycleOwner;
  /** Shot index for traceability */
  shotIndex: number;
  /** URL of the source image to edit */
  sourceImageUrl: string;
  /** Edit instruction (crafted from GCM delta feedback) */
  editInstruction: string;
  /** GCM entity references for consistency checking */
  entityReferences?: Array<{
    name: string;
    referenceUrl: string;
    description: string;
  }>;
  /** Aspect ratio */
  aspectRatio?: '16:9' | '9:16';
  /** Which attempt this is (for retry tracking) */
  attempt?: number;
  /** Previous verifier feedback */
  previousFeedback?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const LOG_PREFIX = '[ImageEdit]';
const IMAGE_EDIT_TIMEOUT_MS = 300_000; // 5 min — webhook wait for GPU edit completion
const getWebhookUrl = () => process.env.WEBHOOK_CALLBACK_URL || 'http://localhost:3000/api/gpu-callback';
const getWebhookSecret = () => process.env.GPU_WEBHOOK_SECRET;

// ============================================================================
// EDIT PROMPT CONSTRUCTION
// ============================================================================

function buildEditPrompt(jobData: ImageEditJobData): string {
  const parts: string[] = [];

  parts.push(jobData.editInstruction);

  if (jobData.entityReferences && jobData.entityReferences.length > 0) {
    parts.push('\n\nEntity consistency requirements:');
    for (const entity of jobData.entityReferences) {
      parts.push(`- ${entity.name}: ${entity.description}`);
    }
  }

  if (jobData.previousFeedback) {
    parts.push(`\n\nPrevious edit attempt feedback: ${jobData.previousFeedback}`);
    parts.push('Please address these remaining issues while preserving other correct aspects.');
  }

  return parts.join('\n');
}

async function resolveAsyncEditResult(jobId: string, itemId: string, publicUrl: string): Promise<string> {
  try {
    const webhookResult = await waitForWebhookResult(itemId, IMAGE_EDIT_TIMEOUT_MS);
    if (webhookResult.status === 'completed') {
      return webhookResult.result?.save_url || publicUrl;
    }

    throw new Error(webhookResult.errorMessage || 'GPU image edit job failed');
  } catch (webhookError) {
    const statusResult = await callGpuGetJobStatus(jobId);
    if (statusResult.success && statusResult.job) {
      if (statusResult.job.status === 'completed') {
        return statusResult.job.result?.save_url || publicUrl;
      }

      if (statusResult.job.status === 'failed') {
        throw new Error(statusResult.job.error_message || 'GPU image edit job failed');
      }
    }

    throw webhookError instanceof Error
      ? webhookError
      : new Error('Unknown error waiting for GPU image edit completion');
  }
}

// ============================================================================
// PROCESSOR
// ============================================================================

export const imageEditProcessor: Processor<ImageEditJobData> = async (
  job: Job<ImageEditJobData>
) => {
  const {
    taskId,
    userId,
    videoId,
    shotIndex,
    sourceImageUrl,
    aspectRatio = '16:9',
    attempt = 1,
    taskLifecycleOwner,
  } = job.data;
  const updateOwnedTaskStatus = (
    updates: Parameters<typeof updateTaskStatus>[1]
  ) => updateTaskStatus(taskId, updates, { lifecycleOwner: taskLifecycleOwner });

  console.log(`${LOG_PREFIX} Editing shot ${shotIndex} (attempt ${attempt}) for video ${videoId}`);

  try {
    await updateOwnedTaskStatus({
      current_step: `Editing image for shot ${shotIndex + 1}...`,
    });

    const editPrompt = buildEditPrompt(job.data);
    console.log(`${LOG_PREFIX} Shot ${shotIndex}: Edit prompt (${editPrompt.length} chars)`);

    const outputKey = generateMediaKey(
      userId,
      videoId,
      STORAGE_PATHS.IMAGES.GENERATED,
      `shot_${shotIndex}_edit_attempt_${attempt}.png`,
    );
    const { putUrl, publicUrl } = await generatePresignedPutUrl(outputKey, 'image/png');
    const itemId = `image-edit-shot-${shotIndex}-${crypto.randomUUID()}`;

    const submitResult = await callGpuImageEdit({
      job_id: `image-edit-${videoId}-${shotIndex}-${crypto.randomUUID()}`,
      input_image_url: sourceImageUrl,
      prompt: editPrompt,
      aspect_ratio: aspectRatio,
      save_url: putUrl,
      webhook_url: getWebhookUrl(),
      item_id: itemId,
      webhook_secret: getWebhookSecret(),
    });

    if (!submitResult.success) {
      throw new Error(submitResult.errorMessage || 'GPU image edit request failed');
    }

    const editedUrl = submitResult.isAsync && submitResult.jobId
      ? await resolveAsyncEditResult(submitResult.jobId, itemId, publicUrl)
      : (submitResult.publicUrl || publicUrl);

    if (!editedUrl) {
      throw new Error(`No edited image URL returned for shot ${shotIndex}`);
    }

    console.log(`${LOG_PREFIX} Shot ${shotIndex}: Edit complete -> ${editedUrl}`);

    return {
      success: true,
      shotIndex,
      mediaUrl: editedUrl,
      url: editedUrl,
      attempt,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} Shot ${shotIndex} edit failed:`, error);
    throw error;
  }
};
