/**
 * GPU API Test Functions
 * ============================================================================
 * Inngest functions for testing GPU API endpoints individually.
 * These are for single image/video creation tests, not batch operations.
 * 
 * Calls the real GPU API backend at http://localhost:8000 (or GPU_API_URL).
 */

import { inngest } from '../client';
import { getSupabaseServiceClient, updateTaskStatus } from './shared';
import { v4 as uuidv4 } from 'uuid';
import { 
  generatePresignedPutUrl, 
  generateGpuTestKey, 
  isR2Configured 
} from '@/lib/services/r2-storage';
import {
  callGpuImageGenerate,
  callGpuImageEdit,
  callGpuVideoGenerate,
  type AspectRatio,
  type FPS,
} from '@/lib/services/gpu-api-service';

// Placeholder image URL for testing (random images from picsum)
const PLACEHOLDER_IMAGE_URL = "https://picsum.photos/1920/1080";

// ============================================================================
// IMAGE CREATION TEST
// ============================================================================

export const gpuApiTestImageCreate = inngest.createFunction(
  {
    id: 'gpu-api-test-image-create',
    retries: 1,
    concurrency: {
      limit: 5,
      key: 'event.data.userId',
    },
  },
  { event: 'gpu-api/test-image.create' },
  async ({ event, step }) => {
    const { taskId, userId, prompt, aspectRatio, numInferenceSteps, seed } = event.data;
    const supabase = getSupabaseServiceClient();

    console.log(`[GPUApiTest] Starting image creation test for task ${taskId}`);

    try {
      // Validate R2 configuration
      await step.run('validate-r2', async () => {
        if (!isR2Configured()) {
          throw new Error('R2 storage is not configured. Please set R2 environment variables.');
        }
      });

      // Update task status
      await step.run('update-status-running', async () => {
        await updateTaskStatus(taskId, {
          status: 'running',
          current_phase: 'image_generation',
          current_step: 'Generating presigned URL...',
          progress_percent: 10,
        });
      });

      // Generate presigned PUT URL for saving the result
      const { putUrl, publicUrl, key } = await step.run('generate-presigned-url', async () => {
        const key = generateGpuTestKey(userId, 'image', 'png');
        const { putUrl, publicUrl } = await generatePresignedPutUrl(key, 'image/png');
        console.log(`[GPUApiTest] Generated presigned URL for key: ${key}`);
        return { putUrl, publicUrl, key };
      });

      // Update status before GPU call
      await step.run('update-status-calling-gpu', async () => {
        await updateTaskStatus(taskId, {
          status: 'running',
          current_step: 'Calling GPU API...',
          progress_percent: 30,
        });
      });

      // Call the GPU API
      const result = await step.run('call-gpu-api', async () => {
        const jobId = uuidv4();
        return await callGpuImageGenerate({
          job_id: jobId,
          prompt,
          aspect_ratio: (aspectRatio as AspectRatio) || '16:9',
          num_inference_steps: numInferenceSteps || 20,
          seed: seed || undefined,
          save_url: putUrl,
        });
      });

      // Store results
      await supabase
        .from('tasks')
        .update({
          status: result.success ? 'completed' : 'failed',
          current_step: result.success ? 'Complete' : 'Failed',
          progress_percent: result.success ? 100 : 0,
          output_data: {
            success: result.success,
            type: 'image_creation',
            imageUrl: result.success ? publicUrl : undefined,
            generationTime: result.generationTime,
            error: result.success ? undefined : result.errorMessage,
            errorCode: result.errorCode,
            r2Key: key,
            debug: result.debug,
          },
        })
        .eq('id', taskId);

      console.log(`[GPUApiTest] Image creation test ${result.success ? 'complete' : 'failed'} for task ${taskId}`);

      if (!result.success) {
        throw new Error(result.errorMessage || 'GPU API returned error');
      }

      return {
        success: true,
        imageUrl: publicUrl,
        generationTime: result.generationTime,
        debug: result.debug,
      };
    } catch (error) {
      console.error(`[GPUApiTest] Image creation test failed for task ${taskId}:`, error);

      await supabase
        .from('tasks')
        .update({
          status: 'failed',
          current_step: 'Failed',
          progress_percent: 0,
          output_data: {
            success: false,
            type: 'image_creation',
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        })
        .eq('id', taskId);

      throw error;
    }
  }
);

// ============================================================================
// IMAGE EDITING TEST
// ============================================================================

export const gpuApiTestImageEdit = inngest.createFunction(
  {
    id: 'gpu-api-test-image-edit',
    retries: 1,
    concurrency: {
      limit: 5,
      key: 'event.data.userId',
    },
  },
  { event: 'gpu-api/test-image.edit' },
  async ({ event, step }) => {
    const { taskId, userId, prompt, sourceImageUrl, aspectRatio, seed } = event.data;
    const supabase = getSupabaseServiceClient();

    console.log(`[GPUApiTest] Starting image edit test for task ${taskId}`);

    try {
      // Validate R2 configuration
      await step.run('validate-r2', async () => {
        if (!isR2Configured()) {
          throw new Error('R2 storage is not configured. Please set R2 environment variables.');
        }
      });

      // Update task status
      await step.run('update-status-running', async () => {
        await updateTaskStatus(taskId, {
          status: 'running',
          current_phase: 'image_editing',
          current_step: 'Generating presigned URL...',
          progress_percent: 10,
        });
      });

      // Generate presigned PUT URL for saving the result
      const { putUrl, publicUrl, key } = await step.run('generate-presigned-url', async () => {
        const key = generateGpuTestKey(userId, 'image', 'png');
        const { putUrl, publicUrl } = await generatePresignedPutUrl(key, 'image/png');
        console.log(`[GPUApiTest] Generated presigned URL for key: ${key}`);
        return { putUrl, publicUrl, key };
      });

      // Update status before GPU call
      await step.run('update-status-calling-gpu', async () => {
        await updateTaskStatus(taskId, {
          status: 'running',
          current_step: 'Calling GPU API...',
          progress_percent: 30,
        });
      });

      // Use placeholder image if no source provided, or the provided URL
      const inputImageUrl = sourceImageUrl || PLACEHOLDER_IMAGE_URL;

      // Call the GPU API
      const result = await step.run('call-gpu-api', async () => {
        const jobId = uuidv4();
        return await callGpuImageEdit({
          job_id: jobId,
          input_image_url: inputImageUrl,
          prompt,
          aspect_ratio: (aspectRatio as AspectRatio) || '16:9',
          seed: seed || undefined,
          save_url: putUrl,
        });
      });

      // Store results
      await supabase
        .from('tasks')
        .update({
          status: result.success ? 'completed' : 'failed',
          current_step: result.success ? 'Complete' : 'Failed',
          progress_percent: result.success ? 100 : 0,
          output_data: {
            success: result.success,
            type: 'image_edit',
            imageUrl: result.success ? publicUrl : undefined,
            generationTime: result.generationTime,
            inputImageUrl,
            error: result.success ? undefined : result.errorMessage,
            errorCode: result.errorCode,
            r2Key: key,
            debug: result.debug,
          },
        })
        .eq('id', taskId);

      console.log(`[GPUApiTest] Image edit test ${result.success ? 'complete' : 'failed'} for task ${taskId}`);

      if (!result.success) {
        throw new Error(result.errorMessage || 'GPU API returned error');
      }

      return {
        success: true,
        imageUrl: publicUrl,
        generationTime: result.generationTime,
        debug: result.debug,
      };
    } catch (error) {
      console.error(`[GPUApiTest] Image edit test failed for task ${taskId}:`, error);

      await supabase
        .from('tasks')
        .update({
          status: 'failed',
          current_step: 'Failed',
          progress_percent: 0,
          output_data: {
            success: false,
            type: 'image_edit',
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        })
        .eq('id', taskId);

      throw error;
    }
  }
);

// ============================================================================
// VIDEO CREATION TEST
// ============================================================================

export const gpuApiTestVideoCreate = inngest.createFunction(
  {
    id: 'gpu-api-test-video-create',
    retries: 1,
    concurrency: {
      limit: 3,
      key: 'event.data.userId',
    },
  },
  { event: 'gpu-api/test-video.create' },
  async ({ event, step }) => {
    const { 
      taskId, 
      userId, 
      prompt, 
      startFrameUrl, 
      durationSeconds, 
      fps, 
      aspectRatio,
      endFrameUrl,
      seed 
    } = event.data;
    const supabase = getSupabaseServiceClient();

    console.log(`[GPUApiTest] Starting video creation test for task ${taskId}`);

    try {
      // Validate R2 configuration
      await step.run('validate-r2', async () => {
        if (!isR2Configured()) {
          throw new Error('R2 storage is not configured. Please set R2 environment variables.');
        }
      });

      // Update task status
      await step.run('update-status-running', async () => {
        await updateTaskStatus(taskId, {
          status: 'running',
          current_phase: 'video_generation',
          current_step: 'Generating presigned URL...',
          progress_percent: 10,
        });
      });

      // Generate presigned PUT URL for saving the result
      const { putUrl, publicUrl, key } = await step.run('generate-presigned-url', async () => {
        const key = generateGpuTestKey(userId, 'video', 'mp4');
        const { putUrl, publicUrl } = await generatePresignedPutUrl(key, 'video/mp4');
        console.log(`[GPUApiTest] Generated presigned URL for key: ${key}`);
        return { putUrl, publicUrl, key };
      });

      // Update status before GPU call
      await step.run('update-status-calling-gpu', async () => {
        await updateTaskStatus(taskId, {
          status: 'running',
          current_step: 'Calling GPU API...',
          progress_percent: 30,
        });
      });

      // Use placeholder image if no start frame provided
      const inputImageUrl = startFrameUrl || PLACEHOLDER_IMAGE_URL;

      // Call the GPU API
      const result = await step.run('call-gpu-api', async () => {
        const jobId = uuidv4();
        return await callGpuVideoGenerate({
          job_id: jobId,
          input_image_url: inputImageUrl,
          prompt,
          duration_seconds: durationSeconds || 4.0,
          fps: (fps as FPS) || 24,
          aspect_ratio: (aspectRatio as AspectRatio) || '16:9',
          seed: seed || undefined,
          end_image_url: endFrameUrl || undefined,
          save_url: putUrl,
        });
      });

      // Store results
      await supabase
        .from('tasks')
        .update({
          status: result.success ? 'completed' : 'failed',
          current_step: result.success ? 'Complete' : 'Failed',
          progress_percent: result.success ? 100 : 0,
          output_data: {
            success: result.success,
            type: 'video_creation',
            videoUrl: result.success ? publicUrl : undefined,
            generationTime: result.generationTime,
            inputImageUrl,
            durationSeconds: durationSeconds || 4.0,
            fps: fps || 24,
            error: result.success ? undefined : result.errorMessage,
            errorCode: result.errorCode,
            r2Key: key,
            debug: result.debug,
          },
        })
        .eq('id', taskId);

      console.log(`[GPUApiTest] Video creation test ${result.success ? 'complete' : 'failed'} for task ${taskId}`);

      if (!result.success) {
        throw new Error(result.errorMessage || 'GPU API returned error');
      }

      return {
        success: true,
        videoUrl: publicUrl,
        generationTime: result.generationTime,
        debug: result.debug,
      };
    } catch (error) {
      console.error(`[GPUApiTest] Video creation test failed for task ${taskId}:`, error);

      await supabase
        .from('tasks')
        .update({
          status: 'failed',
          current_step: 'Failed',
          progress_percent: 0,
          output_data: {
            success: false,
            type: 'video_creation',
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        })
        .eq('id', taskId);

      throw error;
    }
  }
);

// ============================================================================
// EXPORT ALL FUNCTIONS
// ============================================================================

export const gpuApiTestFunctions = [
  gpuApiTestImageCreate,
  gpuApiTestImageEdit,
  gpuApiTestVideoCreate,
];
