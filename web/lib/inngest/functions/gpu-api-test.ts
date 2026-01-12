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
  callGpuLtx2Generate,
  callGpuLtx2Interpolate,
  callGpuGetJobStatus,
  type AspectRatio,
  type FPS,
  type KeyframeImage,
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
    const { taskId, userId, prompt, aspectRatio, numInferenceSteps, seed, width, height } = event.data;
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
      let result = await step.run('call-gpu-api', async () => {
        const jobId = uuidv4();
        return await callGpuImageGenerate({
          job_id: jobId,
          prompt,
          aspect_ratio: (aspectRatio as AspectRatio) || '16:9',
          width: width || undefined,
          height: height || undefined,
          num_inference_steps: numInferenceSteps || 20,
          seed: seed || undefined,
          save_url: putUrl,
        });
      });

      // If the job is async, poll for completion
      if (result.success && result.isAsync && result.jobId) {
        console.log(`[GPUApiTest] Job is async, starting polling for job ${result.jobId}`);
        
        let attempts = 0;
        const maxAttempts = 60; // 5 minutes max (5s * 60)
        let isDone = false;

        while (attempts < maxAttempts && !isDone) {
          attempts++;
          
          // Wait for 5 seconds
          await step.sleep('wait-for-job', '5s');

          // Check job status
          const pollResult = await step.run(`poll-job-status-${attempts}`, async () => {
            return await callGpuGetJobStatus(result.jobId!);
          });

          if (!pollResult.success) {
            console.error(`[GPUApiTest] Polling failed for job ${result.jobId}:`, pollResult.error);
            // We don't throw here, just continue polling or timeout
            continue;
          }

          const job = pollResult.job;
          console.log(`[GPUApiTest] Job ${result.jobId} status: ${job.status}, progress: ${job.progress_percent || 0}%`);

          // Update task progress
          await step.run(`update-status-polling-${attempts}`, async () => {
            await updateTaskStatus(taskId, {
              current_step: `Processing on GPU (${job.status})...`,
              progress_percent: 30 + Math.floor((job.progress_percent || 0) * 0.6), // Scale 0-100 to 30-90
            });
          });

          if (job.status === 'completed') {
            isDone = true;
            result = {
              ...result,
              success: true,
              generationTime: job.result?.generation_time,
              publicUrl: job.result?.save_url || result.publicUrl,
            };
          } else if (job.status === 'failed') {
            isDone = true;
            result = {
              ...result,
              success: false,
              errorMessage: job.error_message || 'GPU job failed',
              errorCode: job.error_code,
            };
          }
        }

        if (!isDone) {
          throw new Error('Timeout waiting for GPU job completion');
        }
      }

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
            error: result.success ? undefined : (result.errorMessage || 'Unknown error'),
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
    const { taskId, userId, prompt, sourceImageUrl, aspectRatio, seed, maskImageUrl } = event.data;
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
      let result = await step.run('call-gpu-api', async () => {
        const jobId = uuidv4();
        return await callGpuImageEdit({
          job_id: jobId,
          input_image_url: inputImageUrl,
          prompt,
          aspect_ratio: (aspectRatio as AspectRatio) || '16:9',
          mask_image_url: maskImageUrl || undefined,
          seed: seed || undefined,
          save_url: putUrl,
        });
      });

      // If the job is async, poll for completion
      if (result.success && result.isAsync && result.jobId) {
        console.log(`[GPUApiTest] Image edit job is async, starting polling for job ${result.jobId}`);
        
        let attempts = 0;
        const maxAttempts = 60; // 5 minutes max
        let isDone = false;

        while (attempts < maxAttempts && !isDone) {
          attempts++;
          await step.sleep('wait-for-job', '5s');

          const pollResult = await step.run(`poll-job-status-${attempts}`, async () => {
            return await callGpuGetJobStatus(result.jobId!);
          });

          if (!pollResult.success) {
            console.error(`[GPUApiTest] Polling failed for job ${result.jobId}:`, pollResult.error);
            continue;
          }

          const job = pollResult.job;
          console.log(`[GPUApiTest] Image edit job ${result.jobId} status: ${job.status}, progress: ${job.progress_percent || 0}%`);

          await step.run(`update-status-polling-${attempts}`, async () => {
            await updateTaskStatus(taskId, {
              current_step: `Editing image on GPU (${job.status})...`,
              progress_percent: 30 + Math.floor((job.progress_percent || 0) * 0.6),
            });
          });

          if (job.status === 'completed') {
            isDone = true;
            result = {
              ...result,
              success: true,
              generationTime: job.result?.generation_time,
              publicUrl: job.result?.save_url || result.publicUrl,
            };
          } else if (job.status === 'failed') {
            isDone = true;
            result = {
              ...result,
              success: false,
              errorMessage: job.error_message || 'GPU job failed',
              errorCode: job.error_code,
            };
          }
        }

        if (!isDone) {
          throw new Error('Timeout waiting for GPU job completion');
        }
      }

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
            error: result.success ? undefined : (result.errorMessage || 'Unknown error'),
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
      width,
      height,
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
      let result = await step.run('call-gpu-api', async () => {
        const jobId = uuidv4();
        return await callGpuVideoGenerate({
          job_id: jobId,
          input_image_url: inputImageUrl,
          prompt,
          duration_seconds: durationSeconds || 4.0,
          fps: (fps as FPS) || 24,
          aspect_ratio: (aspectRatio as AspectRatio) || '16:9',
          width: width || undefined,
          height: height || undefined,
          seed: seed || undefined,
          end_image_url: endFrameUrl || undefined,
          save_url: putUrl,
        });
      });

      // If the job is async, poll for completion
      if (result.success && result.isAsync && result.jobId) {
        console.log(`[GPUApiTest] Video job is async, starting polling for job ${result.jobId}`);
        
        let attempts = 0;
        const maxAttempts = 120; // 10 minutes max (5s * 120) for video
        let isDone = false;

        while (attempts < maxAttempts && !isDone) {
          attempts++;
          await step.sleep('wait-for-job', '5s');

          const pollResult = await step.run(`poll-job-status-${attempts}`, async () => {
            return await callGpuGetJobStatus(result.jobId!);
          });

          if (!pollResult.success) {
            console.error(`[GPUApiTest] Polling failed for job ${result.jobId}:`, pollResult.error);
            continue;
          }

          const job = pollResult.job;
          console.log(`[GPUApiTest] Video job ${result.jobId} status: ${job.status}, progress: ${job.progress_percent || 0}%`);

          await step.run(`update-status-polling-${attempts}`, async () => {
            await updateTaskStatus(taskId, {
              current_step: `Generating video on GPU (${job.status})...`,
              progress_percent: 30 + Math.floor((job.progress_percent || 0) * 0.6),
            });
          });

          if (job.status === 'completed') {
            isDone = true;
            result = {
              ...result,
              success: true,
              generationTime: job.result?.generation_time,
              publicUrl: job.result?.save_url || result.publicUrl,
            };
          } else if (job.status === 'failed') {
            isDone = true;
            result = {
              ...result,
              success: false,
              errorMessage: job.error_message || 'GPU job failed',
              errorCode: job.error_code,
            };
          }
        }

        if (!isDone) {
          throw new Error('Timeout waiting for GPU job completion');
        }
      }

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
            error: result.success ? undefined : (result.errorMessage || 'Unknown error'),
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
// LTX-2 GENERATION TEST
// ============================================================================

export const gpuApiTestLtx2Create = inngest.createFunction(
  {
    id: 'gpu-api-test-ltx-2-create',
    retries: 1,
    concurrency: {
      limit: 3,
      key: 'event.data.userId',
    },
  },
  { event: 'gpu-api/test-ltx2.create' },
  async ({ event, step }) => {
    const { 
      taskId, 
      userId, 
      prompt, 
      input_image_url, 
      negative_prompt,
      duration_seconds,
      frame_rate,
      aspect_ratio,
      width,
      height,
      end_image_url,
      seed,
      enhance_prompt
    } = event.data;
    const supabase = getSupabaseServiceClient();

    console.log(`[GPUApiTest] Starting LTX-2 generation test for task ${taskId}`);

    try {
      await step.run('validate-r2', async () => {
        if (!isR2Configured()) {
          throw new Error('R2 storage is not configured. Please set R2 environment variables.');
        }
      });

      await step.run('update-status-running', async () => {
        await updateTaskStatus(taskId, {
          status: 'running',
          current_phase: 'video_generation',
          current_step: 'Generating presigned URL...',
          progress_percent: 10,
        });
      });

      const { putUrl, publicUrl, key } = await step.run('generate-presigned-url', async () => {
        const key = generateGpuTestKey(userId, 'video', 'mp4');
        const { putUrl, publicUrl } = await generatePresignedPutUrl(key, 'video/mp4');
        return { putUrl, publicUrl, key };
      });

      await step.run('update-status-calling-gpu', async () => {
        await updateTaskStatus(taskId, {
          status: 'running',
          current_step: 'Calling GPU API...',
          progress_percent: 30,
        });
      });

      const inputImageUrl = input_image_url || PLACEHOLDER_IMAGE_URL;

      let result = await step.run('call-gpu-api', async () => {
        const jobId = uuidv4();
        return await callGpuLtx2Generate({
          job_id: jobId,
          input_image_url: inputImageUrl,
          prompt,
          negative_prompt: negative_prompt || undefined,
          duration_seconds: duration_seconds || 5.0,
          frame_rate: frame_rate || 24.0,
          aspect_ratio: (aspect_ratio as AspectRatio) || '16:9',
          width: width || undefined,
          height: height || undefined,
          end_image_url: end_image_url || undefined,
          seed: seed || undefined,
          enhance_prompt: enhance_prompt || false,
          save_url: putUrl,
        });
      });

      if (result.success && result.isAsync && result.jobId) {
        let attempts = 0;
        const maxAttempts = 120;
        let isDone = false;

        while (attempts < maxAttempts && !isDone) {
          attempts++;
          await step.sleep('wait-for-job', '5s');

          const pollResult = await step.run(`poll-job-status-${attempts}`, async () => {
            return await callGpuGetJobStatus(result.jobId!);
          });

          if (!pollResult.success) continue;

          const job = pollResult.job;
          await step.run(`update-status-polling-${attempts}`, async () => {
            await updateTaskStatus(taskId, {
              current_step: `LTX-2 Generation (${job.status})...`,
              progress_percent: 30 + Math.floor((job.progress_percent || 0) * 0.6),
            });
          });

          if (job.status === 'completed') {
            isDone = true;
            result = {
              ...result,
              success: true,
              generationTime: job.result?.generation_time,
              publicUrl: job.result?.save_url || result.publicUrl,
            };
          } else if (job.status === 'failed') {
            isDone = true;
            result = {
              ...result,
              success: false,
              errorMessage: job.error_message || 'GPU job failed',
              errorCode: job.error_code,
            };
          }
        }

        if (!isDone) throw new Error('Timeout waiting for GPU job completion');
      }

      await supabase
        .from('tasks')
        .update({
          status: result.success ? 'completed' : 'failed',
          current_step: result.success ? 'Complete' : 'Failed',
          progress_percent: result.success ? 100 : 0,
          output_data: {
            success: result.success,
            type: 'ltx2_generation',
            videoUrl: result.success ? publicUrl : undefined,
            generationTime: result.generationTime,
            inputImageUrl,
            error: result.success ? undefined : (result.errorMessage || 'Unknown error'),
            errorCode: result.errorCode,
            r2Key: key,
            debug: result.debug,
          },
        })
        .eq('id', taskId);

      if (!result.success) throw new Error(result.errorMessage || 'GPU API returned error');

      return { success: true, videoUrl: publicUrl, generationTime: result.generationTime, debug: result.debug };
    } catch (error) {
      await supabase.from('tasks').update({
        status: 'failed',
        current_step: 'Failed',
        progress_percent: 0,
        output_data: {
          success: false,
          type: 'ltx2_generation',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      }).eq('id', taskId);
      throw error;
    }
  }
);

// ============================================================================
// LTX-2 INTERPOLATION TEST
// ============================================================================

export const gpuApiTestLtx2Interpolate = inngest.createFunction(
  {
    id: 'gpu-api-test-ltx-2-interpolate',
    retries: 1,
    concurrency: {
      limit: 3,
      key: 'event.data.userId',
    },
  },
  { event: 'gpu-api/test-ltx2.interpolate' },
  async ({ event, step }) => {
    const { 
      taskId, 
      userId, 
      prompt, 
      keyframes, 
      negative_prompt,
      duration_seconds,
      frame_rate,
      aspect_ratio,
      width,
      height,
      seed,
      enhance_prompt
    } = event.data;
    const supabase = getSupabaseServiceClient();

    console.log(`[GPUApiTest] Starting LTX-2 interpolation test for task ${taskId}`);

    try {
      await step.run('validate-r2', async () => {
        if (!isR2Configured()) {
          throw new Error('R2 storage is not configured. Please set R2 environment variables.');
        }
      });

      await step.run('update-status-running', async () => {
        await updateTaskStatus(taskId, {
          status: 'running',
          current_phase: 'video_generation',
          current_step: 'Generating presigned URL...',
          progress_percent: 10,
        });
      });

      const { putUrl, publicUrl, key } = await step.run('generate-presigned-url', async () => {
        const key = generateGpuTestKey(userId, 'video', 'mp4');
        const { putUrl, publicUrl } = await generatePresignedPutUrl(key, 'video/mp4');
        return { putUrl, publicUrl, key };
      });

      await step.run('update-status-calling-gpu', async () => {
        await updateTaskStatus(taskId, {
          status: 'running',
          current_step: 'Calling GPU API...',
          progress_percent: 30,
        });
      });

      let result = await step.run('call-gpu-api', async () => {
        const jobId = uuidv4();
        return await callGpuLtx2Interpolate({
          job_id: jobId,
          prompt,
          keyframes,
          negative_prompt: negative_prompt || undefined,
          duration_seconds: duration_seconds || 5.0,
          frame_rate: frame_rate || 24.0,
          aspect_ratio: (aspect_ratio as AspectRatio) || '16:9',
          width: width || undefined,
          height: height || undefined,
          seed: seed || undefined,
          enhance_prompt: enhance_prompt || false,
          save_url: putUrl,
        });
      });

      if (result.success && result.isAsync && result.jobId) {
        let attempts = 0;
        const maxAttempts = 120;
        let isDone = false;

        while (attempts < maxAttempts && !isDone) {
          attempts++;
          await step.sleep('wait-for-job', '5s');

          const pollResult = await step.run(`poll-job-status-${attempts}`, async () => {
            return await callGpuGetJobStatus(result.jobId!);
          });

          if (!pollResult.success) continue;

          const job = pollResult.job;
          await step.run(`update-status-polling-${attempts}`, async () => {
            await updateTaskStatus(taskId, {
              current_step: `LTX-2 Interpolation (${job.status})...`,
              progress_percent: 30 + Math.floor((job.progress_percent || 0) * 0.6),
            });
          });

          if (job.status === 'completed') {
            isDone = true;
            result = {
              ...result,
              success: true,
              generationTime: job.result?.generation_time,
              publicUrl: job.result?.save_url || result.publicUrl,
            };
          } else if (job.status === 'failed') {
            isDone = true;
            result = {
              ...result,
              success: false,
              errorMessage: job.error_message || 'GPU job failed',
              errorCode: job.error_code,
            };
          }
        }

        if (!isDone) throw new Error('Timeout waiting for GPU job completion');
      }

      await supabase
        .from('tasks')
        .update({
          status: result.success ? 'completed' : 'failed',
          current_step: result.success ? 'Complete' : 'Failed',
          progress_percent: result.success ? 100 : 0,
          output_data: {
            success: result.success,
            type: 'ltx2_interpolate',
            videoUrl: result.success ? publicUrl : undefined,
            generationTime: result.generationTime,
            error: result.success ? undefined : (result.errorMessage || 'Unknown error'),
            errorCode: result.errorCode,
            r2Key: key,
            debug: result.debug,
          },
        })
        .eq('id', taskId);

      if (!result.success) throw new Error(result.errorMessage || 'GPU API returned error');

      return { success: true, videoUrl: publicUrl, generationTime: result.generationTime, debug: result.debug };
    } catch (error) {
      await supabase.from('tasks').update({
        status: 'failed',
        current_step: 'Failed',
        progress_percent: 0,
        output_data: {
          success: false,
          type: 'ltx2_interpolate',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      }).eq('id', taskId);
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
  gpuApiTestLtx2Create,
  gpuApiTestLtx2Interpolate,
];
