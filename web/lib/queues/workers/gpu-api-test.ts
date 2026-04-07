/**
 * GPU API Test Workers
 * ============================================================================
 * BullMQ processors for GPU API testing (image/video generation).
 * 
 * Uses webhook-based completion instead of polling:
 * 1. Worker submits job with webhook_url and item_id=taskId
 * 2. Worker waits for webhook result via Redis pub/sub
 * 3. GPU callback updates Supabase and notifies worker
 */

import { Job, Processor } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { getSupabaseServiceClient, updateTaskStatus } from '@/lib/queues/shared';
import { waitForWebhookResult } from '@/lib/queues/webhook-listener';
import { 
  isR2Configured, 
  generatePresignedPutUrl,
  generateGpuTestKey,
  getPublicUrl
} from '@/lib/services/r2-storage';
import {
  callGpuAnimateSegment,
  callGpuImageGenerate,
  callGpuImageEdit,
  callGpuLtx2Generate,
  callGpuLtx2Interpolate,
  callGpuMusicGenerate,
  callGpuSoundEffectGenerate,
  getImageDimensions,
  getVideoDimensions,
} from '@/lib/services/gpu-api-service';
import type { AspectRatio, FPS, SegmentMetadata, SegmentOperation } from '@/lib/services/gpu-api-service';

const PLACEHOLDER_IMAGE_URL = 'https://picsum.photos/1920/1080';

// Get webhook configuration from environment
const getWebhookUrl = () => process.env.WEBHOOK_CALLBACK_URL || 'http://localhost:3000/api/gpu-callback';
const getWebhookSecret = () => process.env.GPU_WEBHOOK_SECRET;

// ============================================================================
// SHARED WEBHOOK HELPER
// ============================================================================

/**
 * Wait for GPU job completion via webhook.
 * Replaces polling with Redis pub/sub notification.
 */
async function waitForJobCompletion(
  taskId: string,
  operationType: string,
  timeoutMs: number = 300000  // 5 minutes default
): Promise<{
  success: boolean;
  generationTime?: number;
  publicUrl?: string;
  metadata?: SegmentMetadata;
  errorMessage?: string;
}> {
  // Update status to indicate waiting
  await updateTaskStatus(taskId, {
    current_step: `${operationType} (waiting for completion)...`,
    progress_percent: 50,
  });
  
  console.log(`[GPUApiTest] Waiting for webhook result for task ${taskId}`);
  
  try {
    const webhookResult = await waitForWebhookResult(taskId, timeoutMs);
    
    if (webhookResult.status === 'completed') {
      return {
        success: true,
        generationTime: webhookResult.result?.generation_time,
        publicUrl: webhookResult.result?.save_url,
        metadata: webhookResult.result?.metadata as SegmentMetadata | undefined,
      };
    } else {
      return {
        success: false,
        errorMessage: webhookResult.errorMessage || 'GPU job failed',
      };
    }
  } catch (error) {
    // Timeout or connection error
    return {
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error waiting for webhook',
    };
  }
}

function mergeSegmentMetadata<T extends { metadata?: SegmentMetadata }>(
  result: T,
  webhookMetadata?: SegmentMetadata
): T & {
  metadata?: SegmentMetadata;
  objectCount?: number;
  width?: number;
  height?: number;
  boxes?: number[][];
  scores?: number[];
  outputType?: string;
  frameCount?: number;
  trackedIds?: number[];
  durationSeconds?: number;
  fps?: number;
  modelVersion?: string;
  labels?: string[];
  promptToObjectIds?: Record<string, number[]>;
  objectIdToPromptLabel?: Record<string, string>;
} {
  const metadata = webhookMetadata || result.metadata;

  return {
    ...result,
    metadata,
    objectCount: (result as { objectCount?: number }).objectCount ?? metadata?.object_count,
    width: (result as { width?: number }).width ?? metadata?.width,
    height: (result as { height?: number }).height ?? metadata?.height,
    boxes: (result as { boxes?: number[][] }).boxes ?? metadata?.boxes,
    scores: (result as { scores?: number[] }).scores ?? metadata?.scores,
    outputType: (result as { outputType?: string }).outputType ?? metadata?.output_type ?? metadata?.output_format,
    frameCount: (result as { frameCount?: number }).frameCount ?? metadata?.frame_count,
    trackedIds: (result as { trackedIds?: number[] }).trackedIds ?? metadata?.tracked_ids,
    durationSeconds: (result as { durationSeconds?: number }).durationSeconds ?? metadata?.duration_seconds,
    fps: (result as { fps?: number }).fps ?? metadata?.fps,
    modelVersion: (result as { modelVersion?: string }).modelVersion ?? metadata?.model_version,
    labels: (result as { labels?: string[] }).labels ?? metadata?.labels,
    promptToObjectIds: (result as { promptToObjectIds?: Record<string, number[]> }).promptToObjectIds ?? metadata?.prompt_to_obj_ids,
    objectIdToPromptLabel:
      (result as { objectIdToPromptLabel?: Record<string, string> }).objectIdToPromptLabel ?? metadata?.object_id_to_prompt_label,
  };
}

// ============================================================================
// IMAGE CREATE PROCESSOR
// ============================================================================

export interface GpuImageCreateJobData {
  taskId: string;
  userId: string;
  prompt: string;
  aspectRatio?: AspectRatio;
  numInferenceSteps?: number;
  seed?: number;
  width?: number;
  height?: number;
  lora_name?: string;
  // Pre-generated URLs for batch jobs
  putUrl?: string;
  publicUrl?: string;
  r2Key?: string;
}

export const gpuImageCreateProcessor: Processor<GpuImageCreateJobData> = async (job: Job<GpuImageCreateJobData>) => {
  const { taskId, userId, prompt, aspectRatio, numInferenceSteps, seed, width, height, lora_name } = job.data;
  const supabase = getSupabaseServiceClient();

  console.log(`[GPUApiTest] Starting image creation for task ${taskId}`);

  try {
    if (!isR2Configured()) throw new Error('R2 storage is not configured.');

    await updateTaskStatus(taskId, { status: 'running', current_phase: 'image_generation', current_step: 'Generating presigned URL...', progress_percent: 10 });

    // Use pre-generated URLs if provided (batch jobs), otherwise generate new ones
    let key = job.data.r2Key;
    let putUrl = job.data.putUrl;
    let publicUrl = job.data.publicUrl;

    if (!putUrl || !publicUrl) {
      key = generateGpuTestKey(userId, 'image', 'png');
      const urls = await generatePresignedPutUrl(key, 'image/png');
      putUrl = urls.putUrl;
      publicUrl = urls.publicUrl;
    }

    await updateTaskStatus(taskId, { current_step: 'Calling GPU API...', progress_percent: 30 });

    const gpuJobId = uuidv4();
    const imgDims = getImageDimensions(aspectRatio || '16:9');
    let result = await callGpuImageGenerate({
      job_id: gpuJobId,
      prompt,
      aspect_ratio: aspectRatio || '16:9',
      width: width || imgDims.width,
      height: height || imgDims.height,
      num_inference_steps: numInferenceSteps || 20,
      seed: seed || undefined,
      lora_name: lora_name || undefined,
      save_url: putUrl,
      webhook_url: getWebhookUrl(),
      item_id: taskId,
      webhook_secret: getWebhookSecret(),
    });

    if (result.success && result.isAsync) {
      const webhookResult = await waitForJobCompletion(taskId, 'Generating image');
      result = { ...result, ...webhookResult };
    }

    // Final status update with logging
    const finalStatus = result.success ? 'completed' : 'failed';
    const finalPublicUrl = result.success ? getPublicUrl(key!) : undefined;

    console.log(`[GPUApiTest] Updating task ${taskId} to ${finalStatus}`);
    
    const { error: updateError, data: updateData } = await supabase.from('tasks').update({
      status: finalStatus,
      current_step: result.success ? 'Complete' : 'Failed',
      progress_percent: result.success ? 100 : 0,
      completed_at: new Date().toISOString(),
      output_data: { success: result.success, type: 'image_creation', imageUrl: finalPublicUrl, generationTime: result.generationTime, error: result.success ? undefined : result.errorMessage, r2Key: key },
    }).eq('id', taskId).select('id, status');

    if (updateError) {
      console.error(`[GPUApiTest] FAILED to update task ${taskId}:`, updateError);
    } else {
      console.log(`[GPUApiTest] Task ${taskId} updated successfully:`, updateData);
    }

    if (!result.success) throw new Error(result.errorMessage || 'GPU API returned error');
    return { success: true, imageUrl: finalPublicUrl, generationTime: result.generationTime };
  } catch (error) {
    await supabase.from('tasks').update({ status: 'failed', current_step: 'Failed', progress_percent: 0, output_data: { success: false, type: 'image_creation', error: error instanceof Error ? error.message : 'Unknown error' } }).eq('id', taskId);
    throw error;
  }
};

// ============================================================================
// IMAGE EDIT PROCESSOR
// ============================================================================

export interface GpuImageEditJobData {
  taskId: string;
  userId: string;
  prompt: string;
  sourceImageUrl?: string;
  aspectRatio?: AspectRatio;
  seed?: number;
  maskImageUrl?: string;
  loraName?: string;
  loraStrength?: number;
  // Pre-generated URLs for batch jobs
  putUrl?: string;
  publicUrl?: string;
  r2Key?: string;
}

export const gpuImageEditProcessor: Processor<GpuImageEditJobData> = async (job: Job<GpuImageEditJobData>) => {
  const { taskId, userId, prompt, sourceImageUrl, aspectRatio, seed, maskImageUrl, loraName, loraStrength } = job.data;
  const supabase = getSupabaseServiceClient();

  console.log(`[GPUApiTest] Starting image edit for task ${taskId}`);

  try {
    if (!isR2Configured()) throw new Error('R2 storage is not configured.');

    await updateTaskStatus(taskId, { status: 'running', current_phase: 'image_editing', current_step: 'Generating presigned URL...', progress_percent: 10 });

    // Use pre-generated URLs if provided (batch jobs), otherwise generate new ones
    let key = job.data.r2Key;
    let putUrl = job.data.putUrl;
    let publicUrl = job.data.publicUrl;

    if (!putUrl || !publicUrl) {
      key = generateGpuTestKey(userId, 'image', 'png');
      const urls = await generatePresignedPutUrl(key, 'image/png');
      putUrl = urls.putUrl;
      publicUrl = urls.publicUrl;
    }
    const inputImageUrl = sourceImageUrl || PLACEHOLDER_IMAGE_URL;

    await updateTaskStatus(taskId, { current_step: 'Calling GPU API...', progress_percent: 30 });

    const gpuJobId = uuidv4();
    let result = await callGpuImageEdit({
      job_id: gpuJobId,
      input_image_url: inputImageUrl,
      prompt,
      aspect_ratio: aspectRatio || '16:9',
      mask_image_url: maskImageUrl || undefined,
      seed: seed || undefined,
      lora_name: loraName || undefined,
      lora_strength: loraStrength ?? undefined,
      save_url: putUrl,
      webhook_url: getWebhookUrl(),
      item_id: taskId,
      webhook_secret: getWebhookSecret(),
    });

    if (result.success && result.isAsync) {
      const webhookResult = await waitForJobCompletion(taskId, 'Editing image');
      result = { ...result, ...webhookResult };
    }

    // Final status update with logging
    const finalStatus = result.success ? 'completed' : 'failed';
    const finalPublicUrl = result.success ? getPublicUrl(key!) : undefined;

    console.log(`[GPUApiTest] Updating task ${taskId} to ${finalStatus}`);
    
    const { error: updateError, data: updateData } = await supabase.from('tasks').update({
      status: finalStatus,
      current_step: result.success ? 'Complete' : 'Failed',
      progress_percent: result.success ? 100 : 0,
      completed_at: new Date().toISOString(),
      output_data: { success: result.success, type: 'image_edit', imageUrl: finalPublicUrl, generationTime: result.generationTime, inputImageUrl, error: result.success ? undefined : result.errorMessage, r2Key: key },
    }).eq('id', taskId).select('id, status');

    if (updateError) {
      console.error(`[GPUApiTest] FAILED to update task ${taskId}:`, updateError);
    } else {
      console.log(`[GPUApiTest] Task ${taskId} updated successfully:`, updateData);
    }

    if (!result.success) throw new Error(result.errorMessage || 'GPU API returned error');
    return { success: true, imageUrl: finalPublicUrl, generationTime: result.generationTime };
  } catch (error) {
    await supabase.from('tasks').update({ status: 'failed', current_step: 'Failed', progress_percent: 0, output_data: { success: false, type: 'image_edit', error: error instanceof Error ? error.message : 'Unknown error' } }).eq('id', taskId);
    throw error;
  }
};

// ============================================================================
// VIDEO CREATE PROCESSOR
// ============================================================================

export interface GpuVideoCreateJobData {
  taskId: string;
  userId: string;
  prompt: string;
  startFrameUrl?: string;
  sourceImageUrl?: string;  // Alias for startFrameUrl (batch jobs)
  durationSeconds?: number;
  fps?: FPS;
  aspectRatio?: AspectRatio;
  width?: number;
  height?: number;
  endFrameUrl?: string;
  endImageUrl?: string;  // Alias for endFrameUrl (batch jobs)
  seed?: number;
  // Pre-generated URLs for batch jobs
  putUrl?: string;
  publicUrl?: string;
  r2Key?: string;
}

export const gpuVideoCreateProcessor: Processor<GpuVideoCreateJobData> = async (job: Job<GpuVideoCreateJobData>) => {
  const { taskId, userId, prompt, startFrameUrl, durationSeconds, fps, aspectRatio, width, height, endFrameUrl, seed } = job.data;
  const supabase = getSupabaseServiceClient();

  console.log(`[GPUApiTest] Starting video creation for task ${taskId}`);

  try {
    if (!isR2Configured()) throw new Error('R2 storage is not configured.');

    await updateTaskStatus(taskId, { status: 'running', current_phase: 'video_generation', current_step: 'Generating presigned URL...', progress_percent: 10 });

    // Use pre-generated URLs if provided (batch jobs), otherwise generate new ones
    let key = job.data.r2Key;
    let putUrl = job.data.putUrl;
    let publicUrl = job.data.publicUrl;

    if (!putUrl || !publicUrl) {
      key = generateGpuTestKey(userId, 'video', 'mp4');
      const urls = await generatePresignedPutUrl(key, 'video/mp4');
      putUrl = urls.putUrl;
      publicUrl = urls.publicUrl;
    }
    const inputImageUrl = startFrameUrl || job.data.sourceImageUrl || PLACEHOLDER_IMAGE_URL;

    await updateTaskStatus(taskId, { current_step: 'Calling GPU API...', progress_percent: 30 });

    const gpuJobId = uuidv4();
    const vidDims = getVideoDimensions(aspectRatio || '16:9');
    let result = await callGpuLtx2Generate({
      job_id: gpuJobId,
      start_frame_url: inputImageUrl,
      prompt,
      duration_seconds: durationSeconds || 4.0,
      frame_rate: fps || 24,
      aspect_ratio: aspectRatio || '16:9',
      width: width || vidDims.width,
      height: height || vidDims.height,
      seed: seed || undefined,
      end_frame_url: endFrameUrl || undefined,
      save_url: putUrl,
      webhook_url: getWebhookUrl(),
      item_id: taskId,
      webhook_secret: getWebhookSecret(),
    });

    if (result.success && result.isAsync) {
      const webhookResult = await waitForJobCompletion(taskId, 'Generating video', 600000);  // 10 min for video
      result = { ...result, ...webhookResult };
    }

    // Final status update with logging
    const finalStatus = result.success ? 'completed' : 'failed';
    const finalPublicUrl = result.success ? getPublicUrl(key!) : undefined;

    console.log(`[GPUApiTest] Updating task ${taskId} to ${finalStatus}`);
    
    const { error: updateError, data: updateData } = await supabase.from('tasks').update({
      status: finalStatus,
      current_step: result.success ? 'Complete' : 'Failed',
      progress_percent: result.success ? 100 : 0,
      completed_at: new Date().toISOString(),
      output_data: { success: result.success, type: 'video_creation', videoUrl: finalPublicUrl, generationTime: result.generationTime, inputImageUrl, durationSeconds: durationSeconds || 4.0, fps: fps || 24, error: result.success ? undefined : result.errorMessage, r2Key: key },
    }).eq('id', taskId).select('id, status');

    if (updateError) {
      console.error(`[GPUApiTest] FAILED to update task ${taskId}:`, updateError);
    } else {
      console.log(`[GPUApiTest] Task ${taskId} updated successfully:`, updateData);
    }

    if (!result.success) throw new Error(result.errorMessage || 'GPU API returned error');
    return { success: true, videoUrl: finalPublicUrl, generationTime: result.generationTime };
  } catch (error) {
    await supabase.from('tasks').update({ status: 'failed', current_step: 'Failed', progress_percent: 0, output_data: { success: false, type: 'video_creation', error: error instanceof Error ? error.message : 'Unknown error' } }).eq('id', taskId);
    throw error;
  }
};

// ============================================================================
// LTX-2 CREATE PROCESSOR
// ============================================================================

export interface GpuLtx2CreateJobData {
  taskId: string;
  userId: string;
  prompt: string;
  start_frame_url?: string;
  input_image_url?: string;  // Legacy alias for start_frame_url
  sourceImageUrl?: string;  // Alias for start_frame_url (batch jobs)
  negative_prompt?: string;
  negativePrompt?: string;  // Alias (batch jobs)
  duration_seconds?: number;
  durationSeconds?: number;  // Alias (batch jobs)
  frame_rate?: number;
  frameRate?: number;  // Alias (batch jobs)
  aspect_ratio?: AspectRatio;
  aspectRatio?: AspectRatio;  // Alias (batch jobs)
  width?: number;
  height?: number;
  end_frame_url?: string;
  end_image_url?: string;  // Legacy alias for end_frame_url
  endImageUrl?: string;  // Alias (batch jobs)
  seed?: number;
  enhance_prompt?: boolean;
  enhancePrompt?: boolean;  // Alias (batch jobs)
  // Pre-generated URLs for batch jobs
  putUrl?: string;
  publicUrl?: string;
  r2Key?: string;
}

export const gpuLtx2CreateProcessor: Processor<GpuLtx2CreateJobData> = async (job: Job<GpuLtx2CreateJobData>) => {
  const { taskId, userId, prompt } = job.data;
  const supabase = getSupabaseServiceClient();

  console.log(`[GPUApiTest] Starting LTX-2 generation for task ${taskId}`);

  try {
    if (!isR2Configured()) throw new Error('R2 storage is not configured.');

    await updateTaskStatus(taskId, { status: 'running', current_phase: 'video_generation', current_step: 'Generating presigned URL...', progress_percent: 10 });

    // Use pre-generated URLs if provided (batch jobs), otherwise generate new ones
    let key = job.data.r2Key;
    let putUrl = job.data.putUrl;
    let publicUrl = job.data.publicUrl;

    if (!putUrl || !publicUrl) {
      key = generateGpuTestKey(userId, 'video', 'mp4');
      const urls = await generatePresignedPutUrl(key, 'video/mp4');
      putUrl = urls.putUrl;
      publicUrl = urls.publicUrl;
    }
    const inputImageUrl = job.data.start_frame_url || job.data.input_image_url || job.data.sourceImageUrl || PLACEHOLDER_IMAGE_URL;

    await updateTaskStatus(taskId, { current_step: 'Calling GPU API...', progress_percent: 30 });

    const gpuJobId = uuidv4();
    const negative_prompt = job.data.negative_prompt || job.data.negativePrompt;
    const duration_seconds = job.data.duration_seconds || job.data.durationSeconds || 5.0;
    const frame_rate = job.data.frame_rate || job.data.frameRate || 24.0;
    const aspect_ratio = job.data.aspect_ratio || job.data.aspectRatio || '16:9';
    const vidDims = getVideoDimensions(aspect_ratio);
    const width = job.data.width || vidDims.width;
    const height = job.data.height || vidDims.height;
    const end_frame_url_resolved = job.data.end_frame_url || job.data.end_image_url || job.data.endImageUrl;
    const seed = job.data.seed;
    const enhance_prompt = job.data.enhance_prompt || job.data.enhancePrompt || false;
    
    let result = await callGpuLtx2Generate({
      job_id: gpuJobId,
      start_frame_url: inputImageUrl,
      prompt,
      negative_prompt: negative_prompt || undefined,
      duration_seconds,
      frame_rate,
      aspect_ratio,
      width,
      height,
      end_frame_url: end_frame_url_resolved || undefined,
      seed: seed || undefined,
      enhance_prompt,
      save_url: putUrl,
      webhook_url: getWebhookUrl(),
      item_id: taskId,
      webhook_secret: getWebhookSecret(),
    });

    if (result.success && result.isAsync) {
      const webhookResult = await waitForJobCompletion(taskId, 'LTX-2 Generation', 600000);  // 10 min
      result = { ...result, ...webhookResult };
    }

    // Final status update with logging
    const finalStatus = result.success ? 'completed' : 'failed';
    const finalPublicUrl = result.success ? getPublicUrl(key!) : undefined;

    console.log(`[GPUApiTest] Updating task ${taskId} to ${finalStatus}`);
    
    const { error: updateError, data: updateData } = await supabase.from('tasks').update({
      status: finalStatus,
      current_step: result.success ? 'Complete' : 'Failed',
      progress_percent: result.success ? 100 : 0,
      completed_at: new Date().toISOString(),
      output_data: { success: result.success, type: 'ltx2_generation', videoUrl: finalPublicUrl, generationTime: result.generationTime, inputImageUrl, error: result.success ? undefined : result.errorMessage, r2Key: key },
    }).eq('id', taskId).select('id, status');

    if (updateError) {
      console.error(`[GPUApiTest] FAILED to update task ${taskId}:`, updateError);
    } else {
      console.log(`[GPUApiTest] Task ${taskId} updated successfully:`, updateData);
    }

    if (!result.success) throw new Error(result.errorMessage || 'GPU API returned error');
    return { success: true, videoUrl: finalPublicUrl, generationTime: result.generationTime };
  } catch (error) {
    await supabase.from('tasks').update({ status: 'failed', current_step: 'Failed', progress_percent: 0, output_data: { success: false, type: 'ltx2_generation', error: error instanceof Error ? error.message : 'Unknown error' } }).eq('id', taskId);
    throw error;
  }
};

// ============================================================================
// LTX-2 INTERPOLATE PROCESSOR
// ============================================================================

export interface GpuLtx2InterpolateJobData {
  taskId: string;
  userId: string;
  prompt: string;
  keyframes: Array<{ image_url: string; frame_index: number }>;
  negative_prompt?: string;
  duration_seconds?: number;
  frame_rate?: number;
  aspect_ratio?: AspectRatio;
  width?: number;
  height?: number;
  seed?: number;
  enhance_prompt?: boolean;
}

export const gpuLtx2InterpolateProcessor: Processor<GpuLtx2InterpolateJobData> = async (job: Job<GpuLtx2InterpolateJobData>) => {
  const { taskId, userId, prompt, keyframes, negative_prompt, duration_seconds, frame_rate, aspect_ratio, width, height, seed, enhance_prompt } = job.data;
  const supabase = getSupabaseServiceClient();

  console.log(`[GPUApiTest] Starting LTX-2 interpolation for task ${taskId}`);

  try {
    if (!isR2Configured()) throw new Error('R2 storage is not configured.');

    await updateTaskStatus(taskId, { status: 'running', current_phase: 'video_generation', current_step: 'Generating presigned URL...', progress_percent: 10 });

    const key = generateGpuTestKey(userId, 'video', 'mp4');
    const { putUrl, publicUrl: _publicUrl } = await generatePresignedPutUrl(key, 'video/mp4');

    await updateTaskStatus(taskId, { current_step: 'Calling GPU API...', progress_percent: 30 });

    const gpuJobId = uuidv4();
    let result = await callGpuLtx2Interpolate({
      job_id: gpuJobId,
      prompt,
      keyframes,
      negative_prompt: negative_prompt || undefined,
      duration_seconds: duration_seconds || 5.0,
      frame_rate: frame_rate || 24.0,
      aspect_ratio: aspect_ratio || '16:9',
      width: width || undefined,
      height: height || undefined,
      seed: seed || undefined,
      enhance_prompt: enhance_prompt || false,
      save_url: putUrl,
      webhook_url: getWebhookUrl(),
      item_id: taskId,
      webhook_secret: getWebhookSecret(),
    });

    if (result.success && result.isAsync) {
      const webhookResult = await waitForJobCompletion(taskId, 'LTX-2 Interpolation', 600000);  // 10 min
      result = { ...result, ...webhookResult };
    }

    // Final status update with logging
    const finalStatus = result.success ? 'completed' : 'failed';
    const finalPublicUrl = result.success ? getPublicUrl(key) : undefined;

    console.log(`[GPUApiTest] Updating task ${taskId} to ${finalStatus}`);
    
    const { error: updateError, data: updateData } = await supabase.from('tasks').update({
      status: finalStatus,
      current_step: result.success ? 'Complete' : 'Failed',
      progress_percent: result.success ? 100 : 0,
      completed_at: new Date().toISOString(),
      output_data: { success: result.success, type: 'ltx2_interpolate', videoUrl: finalPublicUrl, generationTime: result.generationTime, error: result.success ? undefined : result.errorMessage, r2Key: key },
    }).eq('id', taskId).select('id, status');

    if (updateError) {
      console.error(`[GPUApiTest] FAILED to update task ${taskId}:`, updateError);
    } else {
      console.log(`[GPUApiTest] Task ${taskId} updated successfully:`, updateData);
    }

    if (!result.success) throw new Error(result.errorMessage || 'GPU API returned error');
    return { success: true, videoUrl: finalPublicUrl, generationTime: result.generationTime };
  } catch (error) {
    await supabase.from('tasks').update({ status: 'failed', current_step: 'Failed', progress_percent: 0, output_data: { success: false, type: 'ltx2_interpolate', error: error instanceof Error ? error.message : 'Unknown error' } }).eq('id', taskId);
    throw error;
  }
};

// ============================================================================
// MUSIC GENERATION PROCESSOR
// ============================================================================

export interface GpuMusicCreateJobData {
  taskId: string;
  userId: string;
  prompt: string;
  lyrics?: string | string[];
  durationSeconds?: number;
  seed?: number;
  // Pre-generated URLs for batch jobs
  putUrl?: string;
  publicUrl?: string;
  r2Key?: string;
}

export const gpuMusicCreateProcessor: Processor<GpuMusicCreateJobData> = async (job: Job<GpuMusicCreateJobData>) => {
  const { taskId, userId, prompt, lyrics, durationSeconds, seed } = job.data;
  const supabase = getSupabaseServiceClient();

  console.log(`[GPUApiTest] Starting music generation for task ${taskId}`);

  try {
    if (!isR2Configured()) throw new Error('R2 storage is not configured.');

    await updateTaskStatus(taskId, { status: 'running', current_phase: 'audio_generation', current_step: 'Generating presigned URL...', progress_percent: 10 });

    // Use pre-generated URLs if provided (batch jobs), otherwise generate new ones
    let key = job.data.r2Key;
    let putUrl = job.data.putUrl;
    let publicUrl = job.data.publicUrl;

    if (!putUrl || !publicUrl) {
      key = generateGpuTestKey(userId, 'music', 'wav');
      const urls = await generatePresignedPutUrl(key, 'audio/wav');
      putUrl = urls.putUrl;
      publicUrl = urls.publicUrl;
    }

    await updateTaskStatus(taskId, { current_step: 'Calling GPU API...', progress_percent: 30 });

    const gpuJobId = uuidv4();
    let result = await callGpuMusicGenerate({
      job_id: gpuJobId,
      prompt,
      lyrics: lyrics || undefined,
      duration_seconds: durationSeconds || 30,
      seed: seed || undefined,
      save_url: putUrl,
      webhook_url: getWebhookUrl(),
      item_id: taskId,
      webhook_secret: getWebhookSecret(),
    });

    if (result.success && result.isAsync) {
      // Music can take a while for long durations (up to 10 min for 600s music)
      const webhookResult = await waitForJobCompletion(taskId, 'Generating music', 900000);  // 15 min timeout
      result = { ...result, ...webhookResult };
    }

    // Final status update with logging
    const finalStatus = result.success ? 'completed' : 'failed';
    const finalPublicUrl = result.success ? getPublicUrl(key!) : undefined;

    console.log(`[GPUApiTest] Updating task ${taskId} to ${finalStatus}`);
    
    const { error: updateError, data: updateData } = await supabase.from('tasks').update({
      status: finalStatus,
      current_step: result.success ? 'Complete' : 'Failed',
      progress_percent: result.success ? 100 : 0,
      completed_at: new Date().toISOString(),
      output_data: { success: result.success, type: 'music_generation', audioUrl: finalPublicUrl, generationTime: result.generationTime, durationSeconds: durationSeconds || 30, error: result.success ? undefined : result.errorMessage, r2Key: key },
    }).eq('id', taskId).select('id, status');

    if (updateError) {
      console.error(`[GPUApiTest] FAILED to update task ${taskId}:`, updateError);
    } else {
      console.log(`[GPUApiTest] Task ${taskId} updated successfully:`, updateData);
    }

    if (!result.success) throw new Error(result.errorMessage || 'GPU API returned error');
    return { success: true, audioUrl: finalPublicUrl, generationTime: result.generationTime };
  } catch (error) {
    await supabase.from('tasks').update({ status: 'failed', current_step: 'Failed', progress_percent: 0, output_data: { success: false, type: 'music_generation', error: error instanceof Error ? error.message : 'Unknown error' } }).eq('id', taskId);
    throw error;
  }
};

// ============================================================================
// SOUND EFFECT GENERATION PROCESSOR
// ============================================================================

export interface GpuSfxCreateJobData {
  taskId: string;
  userId: string;
  prompt: string;
  durationSeconds?: number;
  seed?: number;
  // Pre-generated URLs for batch jobs
  putUrl?: string;
  publicUrl?: string;
  r2Key?: string;
}

export const gpuSfxCreateProcessor: Processor<GpuSfxCreateJobData> = async (job: Job<GpuSfxCreateJobData>) => {
  const { taskId, userId, prompt, durationSeconds, seed } = job.data;
  const supabase = getSupabaseServiceClient();

  console.log(`[GPUApiTest] Starting sound effect generation for task ${taskId}`);

  try {
    if (!isR2Configured()) throw new Error('R2 storage is not configured.');

    await updateTaskStatus(taskId, { status: 'running', current_phase: 'audio_generation', current_step: 'Generating presigned URL...', progress_percent: 10 });

    // Use pre-generated URLs if provided (batch jobs), otherwise generate new ones
    let key = job.data.r2Key;
    let putUrl = job.data.putUrl;
    let publicUrl = job.data.publicUrl;

    if (!putUrl || !publicUrl) {
      key = generateGpuTestKey(userId, 'sfx', 'wav');
      const urls = await generatePresignedPutUrl(key, 'audio/wav');
      putUrl = urls.putUrl;
      publicUrl = urls.publicUrl;
    }

    await updateTaskStatus(taskId, { current_step: 'Calling GPU API...', progress_percent: 30 });

    const gpuJobId = uuidv4();
    let result = await callGpuSoundEffectGenerate({
      job_id: gpuJobId,
      prompt,
      duration_seconds: durationSeconds || 5,
      seed: seed || undefined,
      save_url: putUrl,
      webhook_url: getWebhookUrl(),
      item_id: taskId,
      webhook_secret: getWebhookSecret(),
    });

    if (result.success && result.isAsync) {
      const webhookResult = await waitForJobCompletion(taskId, 'Generating sound effect', 120000);  // 2 min for short SFX
      result = { ...result, ...webhookResult };
    }

    // Final status update with logging
    const finalStatus = result.success ? 'completed' : 'failed';
    const finalPublicUrl = result.success ? getPublicUrl(key!) : undefined;

    console.log(`[GPUApiTest] Updating task ${taskId} to ${finalStatus}`);
    
    const { error: updateError, data: updateData } = await supabase.from('tasks').update({
      status: finalStatus,
      current_step: result.success ? 'Complete' : 'Failed',
      progress_percent: result.success ? 100 : 0,
      completed_at: new Date().toISOString(),
      output_data: { success: result.success, type: 'sfx_generation', audioUrl: finalPublicUrl, generationTime: result.generationTime, durationSeconds: durationSeconds || 5, error: result.success ? undefined : result.errorMessage, r2Key: key },
    }).eq('id', taskId).select('id, status');

    if (updateError) {
      console.error(`[GPUApiTest] FAILED to update task ${taskId}:`, updateError);
    } else {
      console.log(`[GPUApiTest] Task ${taskId} updated successfully:`, updateData);
    }

    if (!result.success) throw new Error(result.errorMessage || 'GPU API returned error');
    return { success: true, audioUrl: finalPublicUrl, generationTime: result.generationTime };
  } catch (error) {
    await supabase.from('tasks').update({ status: 'failed', current_step: 'Failed', progress_percent: 0, output_data: { success: false, type: 'sfx_generation', error: error instanceof Error ? error.message : 'Unknown error' } }).eq('id', taskId);
    throw error;
  }
};

// ============================================================================
// IMAGE SEGMENTATION PROCESSOR (SAM 3)
// ============================================================================

export interface GpuSegmentImageJobData {
  taskId: string;
  userId: string;
  inputImageUrl: string;
  textPrompt?: string;
  pointPrompts?: number[][];
  boxPrompts?: number[][];
  boxPromptsLabeled?: { box: number[]; label: boolean }[];
  objectPrompts?: { label: string; text: string }[];
  confidenceThreshold?: number;
  maxObjects?: number;
  outputType?: "masks_json" | "image";
  operations?: SegmentOperation[];
}

export const gpuSegmentImageProcessor: Processor<GpuSegmentImageJobData> = async (job: Job<GpuSegmentImageJobData>) => {
  const { taskId, userId, inputImageUrl, textPrompt, pointPrompts, boxPrompts, boxPromptsLabeled, objectPrompts, confidenceThreshold, maxObjects, outputType, operations } = job.data;
  const supabase = getSupabaseServiceClient();

  console.log(`[GPUApiTest] Starting image segmentation for task ${taskId} (output: ${outputType || 'masks_json'})`);

  try {
    if (!isR2Configured()) throw new Error('R2 storage is not configured.');

    await updateTaskStatus(taskId, { status: 'running', current_phase: 'segmentation', current_step: 'Generating presigned URL...', progress_percent: 10 });

    // Use PNG extension for image output, JSON for masks
    const isImageOutput = outputType === 'image';
    const ext = isImageOutput ? 'png' : 'json';
    const contentType = isImageOutput ? 'image/png' : 'application/json';
    const key = generateGpuTestKey(userId, 'segmentation', ext);
    const { putUrl } = await generatePresignedPutUrl(key, contentType);

    await updateTaskStatus(taskId, { current_step: 'Calling GPU API (SAM 3)...', progress_percent: 30 });

    const gpuJobId = uuidv4();
    const { callGpuImageSegment } = await import('@/lib/services/gpu-api-service');
    let result = await callGpuImageSegment({
      job_id: gpuJobId,
      input_image_url: inputImageUrl,
      text_prompt: textPrompt || undefined,
      point_prompts: pointPrompts?.length ? pointPrompts : undefined,
      box_prompts: boxPrompts?.length ? boxPrompts : undefined,
      box_prompts_labeled: boxPromptsLabeled?.length ? boxPromptsLabeled as { box: number[]; label: boolean }[] : undefined,
      object_prompts: objectPrompts?.length ? objectPrompts : undefined,
      confidence_threshold: confidenceThreshold ?? undefined,
      max_objects: maxObjects || undefined,
      output_type: outputType || undefined,
      operations: operations?.length ? operations as import('@/lib/services/gpu-api-service').SegmentOperation[] : undefined,
      save_url: putUrl,
      webhook_url: getWebhookUrl(),
      item_id: taskId,
      webhook_secret: getWebhookSecret(),
    });

    if (result.success && result.isAsync) {
      const webhookResult = await waitForJobCompletion(taskId, 'Image segmentation', 300000);
      result = mergeSegmentMetadata({ ...result, ...webhookResult }, webhookResult.metadata);
    } else {
      result = mergeSegmentMetadata(result);
    }

    const finalStatus = result.success ? 'completed' : 'failed';
    const finalPublicUrl = result.success ? getPublicUrl(key) : undefined;

    console.log(`[GPUApiTest] Updating task ${taskId} to ${finalStatus}`);

    const { error: updateError, data: updateData } = await supabase.from('tasks').update({
      status: finalStatus,
      current_step: result.success ? 'Complete' : 'Failed',
      progress_percent: result.success ? 100 : 0,
      completed_at: new Date().toISOString(),
      output_data: {
        success: result.success,
        type: 'image_segmentation',
        outputType: outputType || 'masks_json',
        segmentationDataUrl: finalPublicUrl,
        generationTime: result.generationTime,
        objectCount: result.objectCount,
        width: result.width,
        height: result.height,
        boxes: result.boxes,
        scores: result.scores,
        modelVersion: result.modelVersion,
        labels: result.labels,
        promptToObjectIds: result.promptToObjectIds,
        objectIdToPromptLabel: result.objectIdToPromptLabel,
        metadata: result.metadata,
        inputImageUrl,
        error: result.success ? undefined : result.errorMessage,
        r2Key: key,
      },
    }).eq('id', taskId).select('id, status');

    if (updateError) {
      console.error(`[GPUApiTest] FAILED to update task ${taskId}:`, updateError);
    } else {
      console.log(`[GPUApiTest] Task ${taskId} updated successfully:`, updateData);
    }

    if (!result.success) throw new Error(result.errorMessage || 'GPU API returned error');
    return { success: true, segmentationDataUrl: finalPublicUrl, generationTime: result.generationTime };
  } catch (error) {
    await supabase.from('tasks').update({ status: 'failed', current_step: 'Failed', progress_percent: 0, output_data: { success: false, type: 'image_segmentation', error: error instanceof Error ? error.message : 'Unknown error' } }).eq('id', taskId);
    throw error;
  }
};

// ============================================================================
// VIDEO SEGMENTATION / OBJECT TRACKING PROCESSOR (SAM 3)
// ============================================================================

export interface GpuSegmentVideoJobData {
  taskId: string;
  userId: string;
  inputVideoUrl: string;
  textPrompt?: string;
  textPrompts?: string[];
  pointPrompts?: number[][];
  pointLabels?: number[];
  boxPrompts?: number[][];
  boxLabels?: number[];
  objectPrompts?: { label: string; text: string }[];
  promptFrameIndex?: number;
  propagationDirection?: "forward" | "backward" | "both";
  confidenceThreshold?: number;
  includeTrackingMetadata?: boolean;
  outputFormat?: "masks_json" | "video";
  operations?: SegmentOperation[];
  maxFrames?: number;
}

export const gpuSegmentVideoProcessor: Processor<GpuSegmentVideoJobData> = async (job: Job<GpuSegmentVideoJobData>) => {
  const {
    taskId,
    userId,
    inputVideoUrl,
    textPrompt,
    textPrompts,
    pointPrompts,
    pointLabels,
    boxPrompts,
    boxLabels,
    objectPrompts,
    promptFrameIndex,
    propagationDirection,
    confidenceThreshold,
    includeTrackingMetadata,
    outputFormat,
    operations,
    maxFrames,
  } = job.data;
  const supabase = getSupabaseServiceClient();

  console.log(`[GPUApiTest] Starting video segmentation for task ${taskId} (output: ${outputFormat || 'masks_json'})`);

  try {
    if (!isR2Configured()) throw new Error('R2 storage is not configured.');

    await updateTaskStatus(taskId, { status: 'running', current_phase: 'segmentation', current_step: 'Generating presigned URL...', progress_percent: 10 });

    // Use MP4 extension for video output, JSON for masks
    const isVideoOutput = outputFormat === 'video';
    const ext = isVideoOutput ? 'mp4' : 'json';
    const contentType = isVideoOutput ? 'video/mp4' : 'application/json';
    const key = generateGpuTestKey(userId, 'segmentation', ext);
    const { putUrl } = await generatePresignedPutUrl(key, contentType);

    await updateTaskStatus(taskId, { current_step: 'Calling GPU API (SAM 3 Video)...', progress_percent: 30 });

    const gpuJobId = uuidv4();
    const { callGpuVideoSegment } = await import('@/lib/services/gpu-api-service');
    let result = await callGpuVideoSegment({
      job_id: gpuJobId,
      input_video_url: inputVideoUrl,
      text_prompt: textPrompt || undefined,
      text_prompts: textPrompts?.length ? textPrompts : undefined,
      point_prompts: pointPrompts?.length ? pointPrompts : undefined,
      point_labels: pointLabels?.length ? pointLabels : undefined,
      box_prompts: boxPrompts?.length ? boxPrompts : undefined,
      box_labels: boxLabels?.length ? boxLabels : undefined,
      object_prompts: objectPrompts?.length ? objectPrompts : undefined,
      prompt_frame_index: promptFrameIndex ?? undefined,
      propagation_direction: propagationDirection || undefined,
      confidence_threshold: confidenceThreshold ?? undefined,
      include_tracking_metadata: includeTrackingMetadata ?? undefined,
      output_format: outputFormat || undefined,
      operations: operations?.length ? operations as import('@/lib/services/gpu-api-service').SegmentOperation[] : undefined,
      max_frames: maxFrames || undefined,
      save_url: putUrl,
      webhook_url: getWebhookUrl(),
      item_id: taskId,
      webhook_secret: getWebhookSecret(),
    });

    if (result.success && result.isAsync) {
      const webhookResult = await waitForJobCompletion(taskId, 'Video segmentation', 600000);  // 10 min for video
      result = mergeSegmentMetadata({ ...result, ...webhookResult }, webhookResult.metadata);
    } else {
      result = mergeSegmentMetadata(result);
    }

    const finalStatus = result.success ? 'completed' : 'failed';
    const finalPublicUrl = result.success ? getPublicUrl(key) : undefined;

    console.log(`[GPUApiTest] Updating task ${taskId} to ${finalStatus}`);

    const { error: updateError, data: updateData } = await supabase.from('tasks').update({
      status: finalStatus,
      current_step: result.success ? 'Complete' : 'Failed',
      progress_percent: result.success ? 100 : 0,
      completed_at: new Date().toISOString(),
      output_data: {
        success: result.success,
        type: 'video_segmentation',
        outputFormat: outputFormat || 'masks_json',
        segmentationDataUrl: finalPublicUrl,
        generationTime: result.generationTime,
        frameCount: result.frameCount,
        objectCount: result.objectCount,
        durationSeconds: result.durationSeconds,
        fps: result.fps,
        trackedIds: result.trackedIds,
        modelVersion: result.modelVersion,
        labels: result.labels,
        promptToObjectIds: result.promptToObjectIds,
        objectIdToPromptLabel: result.objectIdToPromptLabel,
        metadata: result.metadata,
        inputVideoUrl,
        error: result.success ? undefined : result.errorMessage,
        r2Key: key,
      },
    }).eq('id', taskId).select('id, status');

    if (updateError) {
      console.error(`[GPUApiTest] FAILED to update task ${taskId}:`, updateError);
    } else {
      console.log(`[GPUApiTest] Task ${taskId} updated successfully:`, updateData);
    }

    if (!result.success) throw new Error(result.errorMessage || 'GPU API returned error');
    return { success: true, segmentationDataUrl: finalPublicUrl, generationTime: result.generationTime };
  } catch (error) {
    await supabase.from('tasks').update({ status: 'failed', current_step: 'Failed', progress_percent: 0, output_data: { success: false, type: 'video_segmentation', error: error instanceof Error ? error.message : 'Unknown error' } }).eq('id', taskId);
    throw error;
  }
};

// ============================================================================
// ANIMATED SEGMENTATION PROCESSOR (SAM 3.1)
// ============================================================================

export interface GpuSegmentAnimateJobData {
  taskId: string;
  userId: string;
  inputImageUrl: string;
  textPrompt?: string;
  pointPrompts?: number[][];
  boxPrompts?: number[][];
  boxPromptsLabeled?: { box: number[]; label: boolean }[];
  objectPrompts?: { label: string; text: string }[];
  confidenceThreshold?: number;
  maxObjects?: number;
  durationSeconds?: number;
  fps?: number;
  operations: SegmentOperation[];
}

export const gpuSegmentAnimateProcessor: Processor<GpuSegmentAnimateJobData> = async (job: Job<GpuSegmentAnimateJobData>) => {
  const {
    taskId,
    userId,
    inputImageUrl,
    textPrompt,
    pointPrompts,
    boxPrompts,
    boxPromptsLabeled,
    objectPrompts,
    confidenceThreshold,
    maxObjects,
    durationSeconds,
    fps,
    operations,
  } = job.data;
  const supabase = getSupabaseServiceClient();

  console.log(`[GPUApiTest] Starting animated segmentation for task ${taskId}`);

  try {
    if (!isR2Configured()) throw new Error('R2 storage is not configured.');

    await updateTaskStatus(taskId, {
      status: 'running',
      current_phase: 'segmentation',
      current_step: 'Generating presigned URL...',
      progress_percent: 10,
    });

    const key = generateGpuTestKey(userId, 'segmentation', 'mp4');
    const { putUrl } = await generatePresignedPutUrl(key, 'video/mp4');

    await updateTaskStatus(taskId, { current_step: 'Calling GPU API (SAM 3 Animate)...', progress_percent: 30 });

    const gpuJobId = uuidv4();
    let result = await callGpuAnimateSegment({
      job_id: gpuJobId,
      input_image_url: inputImageUrl,
      text_prompt: textPrompt || undefined,
      point_prompts: pointPrompts?.length ? pointPrompts : undefined,
      box_prompts: boxPrompts?.length ? boxPrompts : undefined,
      box_prompts_labeled: boxPromptsLabeled?.length ? boxPromptsLabeled : undefined,
      object_prompts: objectPrompts?.length ? objectPrompts : undefined,
      confidence_threshold: confidenceThreshold ?? undefined,
      max_objects: maxObjects || undefined,
      duration_seconds: durationSeconds || undefined,
      fps: fps || undefined,
      operations: operations as import('@/lib/services/gpu-api-service').SegmentOperation[],
      save_url: putUrl,
      webhook_url: getWebhookUrl(),
      item_id: taskId,
      webhook_secret: getWebhookSecret(),
    });

    if (result.success && result.isAsync) {
      const webhookResult = await waitForJobCompletion(taskId, 'Animated segmentation', 600000);
      result = mergeSegmentMetadata({ ...result, ...webhookResult }, webhookResult.metadata);
    } else {
      result = mergeSegmentMetadata(result);
    }

    const finalStatus = result.success ? 'completed' : 'failed';
    const finalPublicUrl = result.success ? getPublicUrl(key) : undefined;

    console.log(`[GPUApiTest] Updating task ${taskId} to ${finalStatus}`);

    const { error: updateError, data: updateData } = await supabase.from('tasks').update({
      status: finalStatus,
      current_step: result.success ? 'Complete' : 'Failed',
      progress_percent: result.success ? 100 : 0,
      completed_at: new Date().toISOString(),
      output_data: {
        success: result.success,
        type: 'animated_segmentation',
        segmentationDataUrl: finalPublicUrl,
        generationTime: result.generationTime,
        width: result.width,
        height: result.height,
        durationSeconds: result.durationSeconds,
        fps: result.fps,
        frameCount: result.frameCount,
        objectCount: result.objectCount,
        modelVersion: result.modelVersion,
        labels: result.labels,
        promptToObjectIds: result.promptToObjectIds,
        objectIdToPromptLabel: result.objectIdToPromptLabel,
        metadata: result.metadata,
        inputImageUrl,
        error: result.success ? undefined : result.errorMessage,
        r2Key: key,
      },
    }).eq('id', taskId).select('id, status');

    if (updateError) {
      console.error(`[GPUApiTest] FAILED to update task ${taskId}:`, updateError);
    } else {
      console.log(`[GPUApiTest] Task ${taskId} updated successfully:`, updateData);
    }

    if (!result.success) throw new Error(result.errorMessage || 'GPU API returned error');
    return { success: true, segmentationDataUrl: finalPublicUrl, generationTime: result.generationTime };
  } catch (error) {
    await supabase.from('tasks').update({
      status: 'failed',
      current_step: 'Failed',
      progress_percent: 0,
      output_data: { success: false, type: 'animated_segmentation', error: error instanceof Error ? error.message : 'Unknown error' },
    }).eq('id', taskId);
    throw error;
  }
};
