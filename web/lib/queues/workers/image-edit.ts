/**
 * Image Edit Worker
 * ============================================================================
 * Specialized worker for GCM-guided consistency editing via Qwen-Image-Edit-2511.
 *
 * Input:  Generated keyframe images + GCM entity references
 * Output: Edited images with corrected consistency (hair, clothing, lighting, etc.)
 *
 * This worker operates in the `image_editing` VRAM mode and processes edits
 * after the initial image generation batch. It uses the existing
 * `gpu-batch-generation.ts` infrastructure.
 */

import { Job, Processor } from 'bullmq';
import { updateTaskStatus } from '@/lib/queues/shared';
import { fetchDynamicGpuApiUrl } from '@/lib/services/gpu-api-service';

// ============================================================================
// TYPES
// ============================================================================

export interface ImageEditJobData {
  taskId: string;
  userId: string;
  videoId: string;
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
const GPU_API_SECRET = process.env.GPU_API_SECRET || '';

// ============================================================================
// EDIT PROMPT CONSTRUCTION
// ============================================================================

/**
 * Build a Qwen-Image-Edit-2511 instruction prompt from GCM delta feedback.
 * Qwen-Edit uses a different prompt format than generation — it takes the
 * source image + natural language instruction describing what to change.
 */
function buildEditPrompt(
  jobData: ImageEditJobData
): string {
  const parts: string[] = [];

  // Base edit instruction (from verifier's suggested corrections)
  parts.push(jobData.editInstruction);

  // Add entity context for consistency
  if (jobData.entityReferences && jobData.entityReferences.length > 0) {
    parts.push('\n\nEntity consistency requirements:');
    for (const entity of jobData.entityReferences) {
      parts.push(`- ${entity.name}: ${entity.description}`);
    }
  }

  // Add previous feedback for iterative refinement
  if (jobData.previousFeedback) {
    parts.push(`\n\nPrevious edit attempt feedback: ${jobData.previousFeedback}`);
    parts.push('Please address these remaining issues while preserving other correct aspects.');
  }

  return parts.join('\n');
}

// ============================================================================
// PROCESSOR
// ============================================================================

export const imageEditProcessor: Processor<ImageEditJobData> = async (
  job: Job<ImageEditJobData>
) => {
  const { taskId, videoId, shotIndex, sourceImageUrl, attempt = 1 } = job.data;

  console.log(`${LOG_PREFIX} Editing shot ${shotIndex} (attempt ${attempt}) for video ${videoId}`);

  try {
    await updateTaskStatus(taskId, {
      current_step: `Editing image for shot ${shotIndex + 1}...`,
    });

    // Build the edit prompt
    const editPrompt = buildEditPrompt(job.data);
    console.log(`${LOG_PREFIX} Shot ${shotIndex}: Edit prompt (${editPrompt.length} chars)`);

    const gpuApiUrl = await fetchDynamicGpuApiUrl();
    if (!gpuApiUrl || gpuApiUrl === 'http://localhost:8000') {
      throw new Error('No GPU VM available — cannot perform image editing');
    }

    // Call the GPU VM's image editing endpoint directly
    const response = await fetch(`${gpuApiUrl}/api/edit-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GPU_API_SECRET}`,
      },
      body: JSON.stringify({
        source_image_url: sourceImageUrl,
        edit_instruction: editPrompt,
        aspect_ratio: job.data.aspectRatio || '16:9',
        video_id: videoId,
        shot_index: shotIndex,
      }),
      signal: AbortSignal.timeout(120_000), // 2 min timeout
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`GPU image edit API error: ${response.status} — ${errText.substring(0, 200)}`);
    }

    const result = await response.json();

    if (!result.url && !result.media_url) {
      throw new Error(`No edited image URL returned for shot ${shotIndex}`);
    }

    const editedUrl = result.url || result.media_url;
    console.log(`${LOG_PREFIX} Shot ${shotIndex}: Edit complete → ${editedUrl}`);

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
