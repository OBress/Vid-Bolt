/**
 * GPU API Test Workers
 * ============================================================================
 * BullMQ processors for GPU API testing (image/video generation).
 * 
 * NOTE: These are placeholder implementations with polling. 
 * In the future, these will be converted to use webhooks.
 */

import { Job, Processor } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { getSupabaseServiceClient, updateTaskStatus } from '@/lib/queues/shared';
import { 
  isR2Configured, 
  generatePresignedPutUrl,
  generateGpuTestKey
} from '@/lib/services/r2-storage';
import {
  callGpuImageGenerate,
  callGpuImageEdit,
  callGpuVideoGenerate,
  callGpuLtx2Generate,
  callGpuLtx2Interpolate,
  callGpuGetJobStatus,
} from '@/lib/services/gpu-api-service';
import type { AspectRatio, FPS } from '@/lib/services/gpu-api-service';

const PLACEHOLDER_IMAGE_URL = 'https://picsum.photos/1920/1080';

// Get webhook configuration from environment
const getWebhookUrl = () => process.env.WEBHOOK_CALLBACK_URL || 'http://localhost:3000/api/gpu-callback';
const getWebhookSecret = () => process.env.GPU_WEBHOOK_SECRET;

// ============================================================================
// SHARED POLLING HELPER
// ============================================================================

async function pollJobUntilComplete(
  jobId: string,
  taskId: string,
  operationType: string,
  maxAttempts: number = 60,
  pollIntervalMs: number = 5000
): Promise<{
  success: boolean;
  generationTime?: number;
  publicUrl?: string;
  errorMessage?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  finalJob?: any;
}> {
  const supabase = getSupabaseServiceClient();
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    attempts++;
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    
    const pollResult = await callGpuGetJobStatus(jobId);
    if (!pollResult.success) continue;
    
    const job = pollResult.job;
    const stage = job.progress_stage ? `: ${job.progress_stage}` : '';
    const queueMsg = job.status === 'pending' && job.queue_position ? ` (Queue Pos: ${job.queue_position})` : '';
    
    await updateTaskStatus(taskId, {
      current_step: `${operationType} (${job.status}${stage})${queueMsg}...`,
      progress_percent: 30 + Math.floor((job.progress_percent || 0) * 0.6),
    });
    
    if (job.status === 'pending' || job.status === 'processing') {
      await supabase.from('tasks').update({ output_data: { finalJob: job } }).eq('id', taskId);
    }
    
    if (job.status === 'completed') {
      return { success: true, generationTime: job.result?.generation_time, publicUrl: job.result?.save_url, finalJob: job };
    } else if (job.status === 'failed') {
      return { success: false, errorMessage: job.error_message || 'GPU job failed', finalJob: job };
    }
  }
  throw new Error('Timeout waiting for GPU job completion');
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
}

export const gpuImageCreateProcessor: Processor<GpuImageCreateJobData> = async (job: Job<GpuImageCreateJobData>) => {
  const { taskId, userId, prompt, aspectRatio, numInferenceSteps, seed, width, height, lora_name } = job.data;
  const supabase = getSupabaseServiceClient();

  console.log(`[GPUApiTest] Starting image creation for task ${taskId}`);

  try {
    if (!isR2Configured()) throw new Error('R2 storage is not configured.');

    await updateTaskStatus(taskId, { status: 'running', current_phase: 'image_generation', current_step: 'Generating presigned URL...', progress_percent: 10 });

    const key = generateGpuTestKey(userId, 'image', 'png');
    const { putUrl, publicUrl } = await generatePresignedPutUrl(key, 'image/png');

    await updateTaskStatus(taskId, { current_step: 'Calling GPU API...', progress_percent: 30 });

    const gpuJobId = uuidv4();
    let result = await callGpuImageGenerate({
      job_id: gpuJobId,
      prompt,
      aspect_ratio: aspectRatio || '16:9',
      width: width || (aspectRatio === '9:16' ? 1080 : 1920),
      height: height || (aspectRatio === '9:16' ? 1920 : 1080),
      num_inference_steps: numInferenceSteps || 20,
      seed: seed || undefined,
      lora_name: lora_name || undefined,
      save_url: putUrl,
      webhook_url: getWebhookUrl(),
      item_id: taskId,
      webhook_secret: getWebhookSecret(),
    });

    if (result.success && result.isAsync && result.jobId) {
      const pollResult = await pollJobUntilComplete(result.jobId, taskId, 'Generating image');
      result = { ...result, ...pollResult };
    }

    await supabase.from('tasks').update({
      status: result.success ? 'completed' : 'failed',
      current_step: result.success ? 'Complete' : 'Failed',
      progress_percent: result.success ? 100 : 0,
      output_data: { success: result.success, type: 'image_creation', imageUrl: result.success ? publicUrl : undefined, generationTime: result.generationTime, error: result.success ? undefined : result.errorMessage, r2Key: key },
    }).eq('id', taskId);

    if (!result.success) throw new Error(result.errorMessage || 'GPU API returned error');
    return { success: true, imageUrl: publicUrl, generationTime: result.generationTime };
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
}

export const gpuImageEditProcessor: Processor<GpuImageEditJobData> = async (job: Job<GpuImageEditJobData>) => {
  const { taskId, userId, prompt, sourceImageUrl, aspectRatio, seed, maskImageUrl } = job.data;
  const supabase = getSupabaseServiceClient();

  console.log(`[GPUApiTest] Starting image edit for task ${taskId}`);

  try {
    if (!isR2Configured()) throw new Error('R2 storage is not configured.');

    await updateTaskStatus(taskId, { status: 'running', current_phase: 'image_editing', current_step: 'Generating presigned URL...', progress_percent: 10 });

    const key = generateGpuTestKey(userId, 'image', 'png');
    const { putUrl, publicUrl } = await generatePresignedPutUrl(key, 'image/png');
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
      save_url: putUrl,
      webhook_url: getWebhookUrl(),
      item_id: taskId,
      webhook_secret: getWebhookSecret(),
    });

    if (result.success && result.isAsync && result.jobId) {
      const pollResult = await pollJobUntilComplete(result.jobId, taskId, 'Editing image');
      result = { ...result, ...pollResult };
    }

    await supabase.from('tasks').update({
      status: result.success ? 'completed' : 'failed',
      current_step: result.success ? 'Complete' : 'Failed',
      progress_percent: result.success ? 100 : 0,
      output_data: { success: result.success, type: 'image_edit', imageUrl: result.success ? publicUrl : undefined, generationTime: result.generationTime, inputImageUrl, error: result.success ? undefined : result.errorMessage, r2Key: key },
    }).eq('id', taskId);

    if (!result.success) throw new Error(result.errorMessage || 'GPU API returned error');
    return { success: true, imageUrl: publicUrl, generationTime: result.generationTime };
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
  durationSeconds?: number;
  fps?: FPS;
  aspectRatio?: AspectRatio;
  width?: number;
  height?: number;
  endFrameUrl?: string;
  seed?: number;
}

export const gpuVideoCreateProcessor: Processor<GpuVideoCreateJobData> = async (job: Job<GpuVideoCreateJobData>) => {
  const { taskId, userId, prompt, startFrameUrl, durationSeconds, fps, aspectRatio, width, height, endFrameUrl, seed } = job.data;
  const supabase = getSupabaseServiceClient();

  console.log(`[GPUApiTest] Starting video creation for task ${taskId}`);

  try {
    if (!isR2Configured()) throw new Error('R2 storage is not configured.');

    await updateTaskStatus(taskId, { status: 'running', current_phase: 'video_generation', current_step: 'Generating presigned URL...', progress_percent: 10 });

    const key = generateGpuTestKey(userId, 'video', 'mp4');
    const { putUrl, publicUrl } = await generatePresignedPutUrl(key, 'video/mp4');
    const inputImageUrl = startFrameUrl || PLACEHOLDER_IMAGE_URL;

    await updateTaskStatus(taskId, { current_step: 'Calling GPU API...', progress_percent: 30 });

    const gpuJobId = uuidv4();
    let result = await callGpuVideoGenerate({
      job_id: gpuJobId,
      input_image_url: inputImageUrl,
      prompt,
      duration_seconds: durationSeconds || 4.0,
      fps: fps || 24,
      aspect_ratio: aspectRatio || '16:9',
      width: width || (aspectRatio === '9:16' ? 1080 : 1920),
      height: height || (aspectRatio === '9:16' ? 1920 : 1080),
      seed: seed || undefined,
      end_image_url: endFrameUrl || undefined,
      save_url: putUrl,
      webhook_url: getWebhookUrl(),
      item_id: taskId,
      webhook_secret: getWebhookSecret(),
    });

    if (result.success && result.isAsync && result.jobId) {
      const pollResult = await pollJobUntilComplete(result.jobId, taskId, 'Generating video', 120);
      result = { ...result, ...pollResult };
    }

    await supabase.from('tasks').update({
      status: result.success ? 'completed' : 'failed',
      current_step: result.success ? 'Complete' : 'Failed',
      progress_percent: result.success ? 100 : 0,
      output_data: { success: result.success, type: 'video_creation', videoUrl: result.success ? publicUrl : undefined, generationTime: result.generationTime, inputImageUrl, durationSeconds: durationSeconds || 4.0, fps: fps || 24, error: result.success ? undefined : result.errorMessage, r2Key: key },
    }).eq('id', taskId);

    if (!result.success) throw new Error(result.errorMessage || 'GPU API returned error');
    return { success: true, videoUrl: publicUrl, generationTime: result.generationTime };
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
  input_image_url?: string;
  negative_prompt?: string;
  duration_seconds?: number;
  frame_rate?: number;
  aspect_ratio?: AspectRatio;
  width?: number;
  height?: number;
  end_image_url?: string;
  seed?: number;
  enhance_prompt?: boolean;
}

export const gpuLtx2CreateProcessor: Processor<GpuLtx2CreateJobData> = async (job: Job<GpuLtx2CreateJobData>) => {
  const { taskId, userId, prompt, input_image_url, negative_prompt, duration_seconds, frame_rate, aspect_ratio, width, height, end_image_url, seed, enhance_prompt } = job.data;
  const supabase = getSupabaseServiceClient();

  console.log(`[GPUApiTest] Starting LTX-2 generation for task ${taskId}`);

  try {
    if (!isR2Configured()) throw new Error('R2 storage is not configured.');

    await updateTaskStatus(taskId, { status: 'running', current_phase: 'video_generation', current_step: 'Generating presigned URL...', progress_percent: 10 });

    const key = generateGpuTestKey(userId, 'video', 'mp4');
    const { putUrl, publicUrl } = await generatePresignedPutUrl(key, 'video/mp4');
    const inputImageUrl = input_image_url || PLACEHOLDER_IMAGE_URL;

    await updateTaskStatus(taskId, { current_step: 'Calling GPU API...', progress_percent: 30 });

    const gpuJobId = uuidv4();
    let result = await callGpuLtx2Generate({
      job_id: gpuJobId,
      input_image_url: inputImageUrl,
      prompt,
      negative_prompt: negative_prompt || undefined,
      duration_seconds: duration_seconds || 5.0,
      frame_rate: frame_rate || 24.0,
      aspect_ratio: aspect_ratio || '16:9',
      width: width || (aspect_ratio === '9:16' ? 1080 : 1920),
      height: height || (aspect_ratio === '9:16' ? 1920 : 1080),
      end_image_url: end_image_url || undefined,
      seed: seed || undefined,
      enhance_prompt: enhance_prompt || false,
      save_url: putUrl,
      webhook_url: getWebhookUrl(),
      item_id: taskId,
      webhook_secret: getWebhookSecret(),
    });

    if (result.success && result.isAsync && result.jobId) {
      const pollResult = await pollJobUntilComplete(result.jobId, taskId, 'LTX-2 Generation', 120);
      result = { ...result, ...pollResult };
    }

    await supabase.from('tasks').update({
      status: result.success ? 'completed' : 'failed',
      current_step: result.success ? 'Complete' : 'Failed',
      progress_percent: result.success ? 100 : 0,
      output_data: { success: result.success, type: 'ltx2_generation', videoUrl: result.success ? publicUrl : undefined, generationTime: result.generationTime, inputImageUrl, error: result.success ? undefined : result.errorMessage, r2Key: key },
    }).eq('id', taskId);

    if (!result.success) throw new Error(result.errorMessage || 'GPU API returned error');
    return { success: true, videoUrl: publicUrl, generationTime: result.generationTime };
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
    const { putUrl, publicUrl } = await generatePresignedPutUrl(key, 'video/mp4');

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

    if (result.success && result.isAsync && result.jobId) {
      const pollResult = await pollJobUntilComplete(result.jobId, taskId, 'LTX-2 Interpolation', 120);
      result = { ...result, ...pollResult };
    }

    await supabase.from('tasks').update({
      status: result.success ? 'completed' : 'failed',
      current_step: result.success ? 'Complete' : 'Failed',
      progress_percent: result.success ? 100 : 0,
      output_data: { success: result.success, type: 'ltx2_interpolate', videoUrl: result.success ? publicUrl : undefined, generationTime: result.generationTime, error: result.success ? undefined : result.errorMessage, r2Key: key },
    }).eq('id', taskId);

    if (!result.success) throw new Error(result.errorMessage || 'GPU API returned error');
    return { success: true, videoUrl: publicUrl, generationTime: result.generationTime };
  } catch (error) {
    await supabase.from('tasks').update({ status: 'failed', current_step: 'Failed', progress_percent: 0, output_data: { success: false, type: 'ltx2_interpolate', error: error instanceof Error ? error.message : 'Unknown error' } }).eq('id', taskId);
    throw error;
  }
};
