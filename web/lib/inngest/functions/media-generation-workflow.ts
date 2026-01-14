/**
 * Media Generation Workflow
 * ============================================================================
 * Master orchestration function for the complete media generation pipeline.
 * 
 * This workflow processes all shots in a video project through:
 * 1. AV Script Generation - Analyze script and create shot list
 * 2. Base Image Generation - Generate images using Z-Image Turbo
 * 3. Image Editing - Enhance images using Qwen Image Edit
 * 4. Video Generation - Create videos using LTX-2
 * 
 * Progress is tracked in video_projects.metadata.media_generation and
 * individual shot statuses are tracked in the shot_list array.
 * 
 * Error Handling: If a shot fails at any phase, the error is recorded
 * but processing continues with remaining shots. Failed shots can be
 * retried in the editor.
 */

import { inngest } from '../client';
import { getSupabaseServiceClient } from './shared';
import { v4 as uuidv4 } from 'uuid';
import {
  generatePresignedPutUrl,
  generateGpuTestKey,
  isR2Configured,
} from '@/lib/services/r2-storage';
import {
  callGpuImageGenerate,
  callGpuImageEdit,
  callGpuLtx2Generate,
  callGpuGetJobStatus,
  type AspectRatio,
} from '@/lib/services/gpu-api-service';
import type {
  MediaGenerationProgress,
  EnhancedShot,
  VideoProjectMetadata,
} from '@/types/media-generation';
import { createInitialMediaProgress } from '@/types/media-generation';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Maximum polling attempts per GPU job (5s x 120 = 10 minutes) */
const MAX_POLL_ATTEMPTS = 120;
/** Poll interval in seconds */
const POLL_INTERVAL = '5s';
/** Default aspect ratio if not set in project settings */
const DEFAULT_ASPECT_RATIO: AspectRatio = '16:9';
/** Number of inference steps for Z-Image Turbo (lower = faster) */
const IMAGE_INFERENCE_STEPS = 8;
/** Maximum video duration in seconds (LTX-2 limit) */
const MAX_VIDEO_DURATION = 8.0;
/** Minimum video duration in seconds */
const MIN_VIDEO_DURATION = 1.0;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get dimensions based on aspect ratio
 */
function getDimensionsForAspectRatio(aspectRatio: AspectRatio): { width: number; height: number } {
  switch (aspectRatio) {
    case '9:16':
      return { width: 1080, height: 1920 };
    case '16:9':
    default:
      return { width: 1920, height: 1080 };
  }
}

/**
 * Clamp video duration to valid range
 */
function clampVideoDuration(duration: number): number {
  return Math.max(MIN_VIDEO_DURATION, Math.min(MAX_VIDEO_DURATION, duration));
}

/**
 * Get aspect ratio from project settings or metadata
 */
async function getAspectRatio(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  videoId: string,
  projectId?: string
): Promise<AspectRatio> {
  // First check video metadata
  const { data: video } = await supabase
    .from('video_projects')
    .select('metadata, project_id')
    .eq('id', videoId)
    .single();

  const metadata = video?.metadata as VideoProjectMetadata | null;
  if (metadata?.visuals?.aspectRatio) {
    return metadata.visuals.aspectRatio;
  }

  // Then check project settings
  const actualProjectId = projectId || video?.project_id;
  if (actualProjectId) {
    const { data: settings } = await supabase
      .from('project_settings')
      .select('settings')
      .eq('project_id', actualProjectId)
      .single();

    const projectSettings = settings?.settings as Record<string, any> | null;
    if (projectSettings?.basic_info?.aspectRatio) {
      const ar = projectSettings.basic_info.aspectRatio;
      if (ar === '16:9' || ar === '9:16') {
        return ar;
      }
    }
  }

  return DEFAULT_ASPECT_RATIO;
}

/**
 * Update media generation progress in video metadata
 */
async function updateMediaProgress(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  videoId: string,
  progressUpdates: Partial<MediaGenerationProgress>
): Promise<void> {
  // Get current metadata
  const { data: video } = await supabase
    .from('video_projects')
    .select('metadata')
    .eq('id', videoId)
    .single();

  const metadata = (video?.metadata || {}) as VideoProjectMetadata;
  const currentProgress = metadata.media_generation || createInitialMediaProgress();

  // Merge updates
  const newProgress: MediaGenerationProgress = {
    ...currentProgress,
    ...progressUpdates,
  };

  await supabase
    .from('video_projects')
    .update({
      metadata: {
        ...metadata,
        media_generation: newProgress,
      },
      current_stage: progressUpdates.status === 'completed' ? 'video' : 'media',
      updated_at: new Date().toISOString(),
    })
    .eq('id', videoId);
}

/**
 * Update a specific shot in the shot list
 */
async function updateShotInList(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  videoId: string,
  segmentIndex: number,
  updates: Partial<EnhancedShot>
): Promise<void> {
  // Fetch, update, save pattern with retry
  const doUpdate = async () => {
    const { data: video } = await supabase
      .from('video_projects')
      .select('metadata')
      .eq('id', videoId)
      .single();

    const metadata = (video?.metadata || {}) as VideoProjectMetadata;
    const shotList = (metadata.shot_list || []) as EnhancedShot[];

    const shotIndex = shotList.findIndex((s) => s.segment_index === segmentIndex);
    if (shotIndex === -1) {
      console.warn(`[MediaGen] Shot ${segmentIndex} not found in video ${videoId}`);
      return;
    }

    shotList[shotIndex] = {
      ...shotList[shotIndex],
      ...updates,
    };

    // Also update startImageUrl if we have a new image
    if (updates.editedImageUrl || updates.baseImageUrl) {
      shotList[shotIndex].startImageUrl = updates.editedImageUrl || updates.baseImageUrl || shotList[shotIndex].startImageUrl;
    }

    const { error } = await supabase
      .from('video_projects')
      .update({
        metadata: { ...metadata, shot_list: shotList },
        updated_at: new Date().toISOString(),
      })
      .eq('id', videoId);

    if (error) throw error;
  };

  // Retry once on failure
  try {
    await doUpdate();
  } catch (e) {
    await new Promise((r) => setTimeout(r, 500 + Math.random() * 500));
    await doUpdate();
  }
}

/**
 * Poll GPU job until completion or failure
 */
async function pollGpuJob(
  step: any,
  jobId: string,
  stepPrefix: string
): Promise<{ success: boolean; resultUrl?: string; error?: string }> {
  let attempts = 0;
  
  while (attempts < MAX_POLL_ATTEMPTS) {
    attempts++;
    
    await step.sleep(`${stepPrefix}-wait-${attempts}`, POLL_INTERVAL);
    
    const pollResult = await step.run(`${stepPrefix}-poll-${attempts}`, async () => {
      return await callGpuGetJobStatus(jobId);
    });

    if (!pollResult.success) {
      console.error(`[MediaGen] Poll failed for job ${jobId}:`, pollResult.error);
      continue;
    }

    const job = pollResult.job;
    
    if (job.status === 'completed') {
      return {
        success: true,
        resultUrl: job.result?.save_url,
      };
    } else if (job.status === 'failed') {
      return {
        success: false,
        error: job.error_message || 'GPU job failed',
      };
    }
    // Still pending or processing - continue polling
  }

  return {
    success: false,
    error: 'Timeout waiting for GPU job completion',
  };
}

// ============================================================================
// MAIN WORKFLOW
// ============================================================================

interface MediaGenerationInput {
  videoId: string;
  userId: string;
  projectId?: string;
  skipAvScript?: boolean;
}

export const mediaGenerationWorkflow = inngest.createFunction(
  {
    id: 'media-generation-workflow',
    retries: 2,
    // Limit to 1 concurrent workflow per video to prevent duplicates
    concurrency: {
      limit: 1,
      key: 'event.data.videoId',
    },
  },
  { event: 'media-generation/start' },
  async ({ event, step }) => {
    const { videoId, userId, projectId, skipAvScript } = event.data as MediaGenerationInput;
    const supabase = getSupabaseServiceClient();

    console.log(`[MediaGen] ========== STARTING MEDIA GENERATION ==========`);
    console.log(`[MediaGen] Video: ${videoId}, User: ${userId}`);

    // ========================================================================
    // STEP 0: Validate R2 configuration
    // ========================================================================
    await step.run('validate-r2', async () => {
      if (!isR2Configured()) {
        throw new Error('R2 storage is not configured. Please set R2 environment variables.');
      }
    });

    // ========================================================================
    // STEP 1: Initialize progress tracking
    // ========================================================================
    await step.run('init-progress', async () => {
      const initialProgress = createInitialMediaProgress();
      initialProgress.status = 'av_script';
      
      await updateMediaProgress(supabase, videoId, initialProgress);
      
      // Also update video stage
      await supabase
        .from('video_projects')
        .update({
          current_stage: 'media',
          status: 'processing',
          updated_at: new Date().toISOString(),
        })
        .eq('id', videoId);
    });

    // ========================================================================
    // STEP 2: Get aspect ratio from project settings
    // ========================================================================
    const aspectRatio = await step.run('get-aspect-ratio', async () => {
      return await getAspectRatio(supabase, videoId, projectId);
    });
    const dimensions = getDimensionsForAspectRatio(aspectRatio);

    console.log(`[MediaGen] Using aspect ratio: ${aspectRatio} (${dimensions.width}x${dimensions.height})`);

    // ========================================================================
    // STEP 3: Trigger AV Script generation (if not skipping)
    // ========================================================================
    let shotList: EnhancedShot[] = [];

    if (!skipAvScript) {
      // Trigger the av-script workflow and wait for completion
      await step.run('trigger-av-script', async () => {
        // Get video data for AV script
        const { data: video } = await supabase
          .from('video_projects')
          .select('script_content, metadata')
          .eq('id', videoId)
          .single();

        if (!video?.script_content) {
          throw new Error('No script content found for video');
        }

        const metadata = video.metadata as VideoProjectMetadata;
        const wordTimestamps = metadata.word_timestamps || [];
        const totalDuration = metadata.total_duration_seconds || 0;

        if (wordTimestamps.length === 0) {
          throw new Error('No word timestamps found. Audio generation must complete first.');
        }

        // Send event to trigger AV script workflow
        await inngest.send({
          name: 'av-script/generate.start',
          data: {
            taskId: uuidv4(),
            userId,
            videoId,
            script: video.script_content,
            wordTimestamps,
            totalDurationSeconds: totalDuration,
          },
        });
      });

      // Wait for AV script to complete
      const avScriptResult = await step.waitForEvent('wait-for-av-script', {
        event: 'av-script/workflow.complete',
        match: 'data.videoId',
        timeout: '10m',
      });

      if (!avScriptResult) {
        throw new Error('AV script generation timed out');
      }

      console.log(`[MediaGen] AV Script complete. Shot count: ${avScriptResult.data.shotCount}`);
    }

    // ========================================================================
    // STEP 4: Load shot list from metadata
    // ========================================================================
    shotList = await step.run('load-shot-list', async () => {
      const { data: video } = await supabase
        .from('video_projects')
        .select('metadata')
        .eq('id', videoId)
        .single();

      const metadata = video?.metadata as VideoProjectMetadata;
      const shots = (metadata?.shot_list || []) as EnhancedShot[];

      if (shots.length === 0) {
        throw new Error('No shots found in shot list. AV script may have failed.');
      }

      // Update progress with shot count
      await updateMediaProgress(supabase, videoId, {
        av_script_completed: true,
        status: 'images',
        total_shots: shots.length,
      });

      return shots;
    });

    // Filter shots that need image generation (have visual_prompt)
    const shotsToProcess = shotList.filter((s) => s.visual_prompt && s.visual_prompt.trim());
    console.log(`[MediaGen] Processing ${shotsToProcess.length} shots with visual prompts`);

    // ========================================================================
    // STEP 5: Generate base images for all shots
    // ========================================================================
    console.log(`[MediaGen] ===== PHASE: BASE IMAGE GENERATION =====`);

    for (let i = 0; i < shotsToProcess.length; i++) {
      const shot = shotsToProcess[i];
      const stepName = `image-${shot.segment_index}`;

      console.log(`[MediaGen] Processing image ${i + 1}/${shotsToProcess.length} (segment ${shot.segment_index})`);

      // Update progress
      await step.run(`${stepName}-update-progress`, async () => {
        await updateMediaProgress(supabase, videoId, {
          current_shot_index: shot.segment_index,
          current_phase: 'image',
        });
        await updateShotInList(supabase, videoId, shot.segment_index, {
          baseImageStatus: 'generating',
        });
      });

      // Generate presigned URL
      const { putUrl, publicUrl } = await step.run(`${stepName}-presign`, async () => {
        const key = generateGpuTestKey(userId, 'image', 'png');
        return await generatePresignedPutUrl(key, 'image/png');
      });

      // Call GPU API
      const imageResult = await step.run(`${stepName}-generate`, async () => {
        const jobId = uuidv4();
        return await callGpuImageGenerate({
          job_id: jobId,
          prompt: shot.visual_prompt!,
          aspect_ratio: aspectRatio,
          width: dimensions.width,
          height: dimensions.height,
          num_inference_steps: IMAGE_INFERENCE_STEPS,
          save_url: putUrl,
        });
      });

      // Handle async job
      let finalImageUrl = publicUrl;
      let imageSuccess = imageResult.success;
      let imageError: string | undefined;

      if (imageResult.success && imageResult.isAsync && imageResult.jobId) {
        const pollResult = await pollGpuJob(step, imageResult.jobId, stepName);
        imageSuccess = pollResult.success;
        if (pollResult.success && pollResult.resultUrl) {
          finalImageUrl = pollResult.resultUrl;
        } else {
          imageError = pollResult.error;
        }
      } else if (!imageResult.success) {
        imageSuccess = false;
        imageError = imageResult.errorMessage;
      }

      // Update shot with result
      await step.run(`${stepName}-save-result`, async () => {
        if (imageSuccess) {
          await updateShotInList(supabase, videoId, shot.segment_index, {
            baseImageUrl: finalImageUrl,
            baseImageStatus: 'completed',
            startImageUrl: finalImageUrl, // Set as default for editor
          });
          
          // Get current progress and update
          const { data: video } = await supabase
            .from('video_projects')
            .select('metadata')
            .eq('id', videoId)
            .single();
          const metadata = video?.metadata as VideoProjectMetadata;
          const progress = metadata?.media_generation;
          
          await updateMediaProgress(supabase, videoId, {
            images_completed: (progress?.images_completed || 0) + 1,
          });
        } else {
          console.error(`[MediaGen] Image generation failed for shot ${shot.segment_index}: ${imageError}`);
          await updateShotInList(supabase, videoId, shot.segment_index, {
            baseImageStatus: 'failed',
            baseImageError: imageError,
          });
          
          const { data: video } = await supabase
            .from('video_projects')
            .select('metadata')
            .eq('id', videoId)
            .single();
          const metadata = video?.metadata as VideoProjectMetadata;
          const progress = metadata?.media_generation;
          
          await updateMediaProgress(supabase, videoId, {
            images_failed: (progress?.images_failed || 0) + 1,
          });
        }
      });
    }

    // ========================================================================
    // STEP 6: Apply image edits to all successfully generated images
    // ========================================================================
    console.log(`[MediaGen] ===== PHASE: IMAGE EDITING =====`);

    // Update status
    await step.run('update-status-edits', async () => {
      await updateMediaProgress(supabase, videoId, {
        status: 'image_edits',
        current_phase: 'edit',
      });
    });

    // Reload shot list to get updated URLs
    const shotsWithImages = await step.run('reload-shots-for-edit', async () => {
      const { data: video } = await supabase
        .from('video_projects')
        .select('metadata')
        .eq('id', videoId)
        .single();
      const metadata = video?.metadata as VideoProjectMetadata;
      return (metadata?.shot_list || []) as EnhancedShot[];
    });

    for (let i = 0; i < shotsWithImages.length; i++) {
      const shot = shotsWithImages[i];
      const stepName = `edit-${shot.segment_index}`;

      // Skip if no base image
      if (!shot.baseImageUrl || shot.baseImageStatus !== 'completed') {
        console.log(`[MediaGen] Skipping edit for shot ${shot.segment_index} - no base image`);
        await step.run(`${stepName}-skip`, async () => {
          await updateShotInList(supabase, videoId, shot.segment_index, {
            editedImageStatus: 'skipped',
          });
          
          const { data: video } = await supabase
            .from('video_projects')
            .select('metadata')
            .eq('id', videoId)
            .single();
          const metadata = video?.metadata as VideoProjectMetadata;
          const progress = metadata?.media_generation;
          
          await updateMediaProgress(supabase, videoId, {
            edits_skipped: (progress?.edits_skipped || 0) + 1,
          });
        });
        continue;
      }

      console.log(`[MediaGen] Processing edit ${i + 1}/${shotsWithImages.length} (segment ${shot.segment_index})`);

      // Update progress
      await step.run(`${stepName}-update-progress`, async () => {
        await updateMediaProgress(supabase, videoId, {
          current_shot_index: shot.segment_index,
          current_phase: 'edit',
        });
        await updateShotInList(supabase, videoId, shot.segment_index, {
          editedImageStatus: 'generating',
        });
      });

      // Generate presigned URL for edited image
      const { putUrl, publicUrl } = await step.run(`${stepName}-presign`, async () => {
        const key = generateGpuTestKey(userId, 'image', 'png');
        return await generatePresignedPutUrl(key, 'image/png');
      });

      // Create enhancement prompt
      const editPrompt = `Enhance this image with cinematic lighting, vivid colors, and professional quality. 
Maintain the original composition and subject while improving visual appeal and adding subtle details.
The scene should feel like a high-budget production still frame.
Original context: ${shot.visual_prompt || shot.text || ''}`;

      // Call GPU API for image edit
      const editResult = await step.run(`${stepName}-edit`, async () => {
        const jobId = uuidv4();
        return await callGpuImageEdit({
          job_id: jobId,
          input_image_url: shot.baseImageUrl!,
          prompt: editPrompt,
          aspect_ratio: aspectRatio,
          save_url: putUrl,
        });
      });

      // Handle async job
      let finalEditUrl = publicUrl;
      let editSuccess = editResult.success;
      let editError: string | undefined;

      if (editResult.success && editResult.isAsync && editResult.jobId) {
        const pollResult = await pollGpuJob(step, editResult.jobId, stepName);
        editSuccess = pollResult.success;
        if (pollResult.success && pollResult.resultUrl) {
          finalEditUrl = pollResult.resultUrl;
        } else {
          editError = pollResult.error;
        }
      } else if (!editResult.success) {
        editSuccess = false;
        editError = editResult.errorMessage;
      }

      // Update shot with result
      await step.run(`${stepName}-save-result`, async () => {
        if (editSuccess) {
          await updateShotInList(supabase, videoId, shot.segment_index, {
            editedImageUrl: finalEditUrl,
            editedImageStatus: 'completed',
            startImageUrl: finalEditUrl, // Update final image for editor
          });
          
          const { data: video } = await supabase
            .from('video_projects')
            .select('metadata')
            .eq('id', videoId)
            .single();
          const metadata = video?.metadata as VideoProjectMetadata;
          const progress = metadata?.media_generation;
          
          await updateMediaProgress(supabase, videoId, {
            edits_completed: (progress?.edits_completed || 0) + 1,
          });
        } else {
          // If edit fails, keep using base image
          console.error(`[MediaGen] Image edit failed for shot ${shot.segment_index}: ${editError}`);
          await updateShotInList(supabase, videoId, shot.segment_index, {
            editedImageStatus: 'failed',
            editedImageError: editError,
            // startImageUrl remains as baseImageUrl
          });
          
          const { data: video } = await supabase
            .from('video_projects')
            .select('metadata')
            .eq('id', videoId)
            .single();
          const metadata = video?.metadata as VideoProjectMetadata;
          const progress = metadata?.media_generation;
          
          await updateMediaProgress(supabase, videoId, {
            edits_failed: (progress?.edits_failed || 0) + 1,
          });
        }
      });
    }

    // ========================================================================
    // STEP 7: Generate videos for all shots with images
    // ========================================================================
    console.log(`[MediaGen] ===== PHASE: VIDEO GENERATION =====`);

    // Update status
    await step.run('update-status-videos', async () => {
      await updateMediaProgress(supabase, videoId, {
        status: 'videos',
        current_phase: 'video',
      });
    });

    // Reload shot list to get updated URLs
    const shotsForVideo = await step.run('reload-shots-for-video', async () => {
      const { data: video } = await supabase
        .from('video_projects')
        .select('metadata')
        .eq('id', videoId)
        .single();
      const metadata = video?.metadata as VideoProjectMetadata;
      return (metadata?.shot_list || []) as EnhancedShot[];
    });

    for (let i = 0; i < shotsForVideo.length; i++) {
      const shot = shotsForVideo[i];
      const stepName = `video-${shot.segment_index}`;

      // Skip if no start image (base or edited)
      const startImageUrl = shot.editedImageUrl || shot.baseImageUrl || shot.startImageUrl;
      if (!startImageUrl) {
        console.log(`[MediaGen] Skipping video for shot ${shot.segment_index} - no source image`);
        await step.run(`${stepName}-skip`, async () => {
          await updateShotInList(supabase, videoId, shot.segment_index, {
            videoStatus: 'skipped',
          });
          
          const { data: video } = await supabase
            .from('video_projects')
            .select('metadata')
            .eq('id', videoId)
            .single();
          const metadata = video?.metadata as VideoProjectMetadata;
          const progress = metadata?.media_generation;
          
          await updateMediaProgress(supabase, videoId, {
            videos_failed: (progress?.videos_failed || 0) + 1,
          });
        });
        continue;
      }

      // Only generate video if media_type is 'video'
      if (shot.media_type !== 'video') {
        console.log(`[MediaGen] Skipping video for shot ${shot.segment_index} - media_type is image`);
        await step.run(`${stepName}-skip-image-type`, async () => {
          await updateShotInList(supabase, videoId, shot.segment_index, {
            videoStatus: 'skipped',
          });
        });
        continue;
      }

      console.log(`[MediaGen] Processing video ${i + 1}/${shotsForVideo.length} (segment ${shot.segment_index})`);

      // Update progress
      await step.run(`${stepName}-update-progress`, async () => {
        await updateMediaProgress(supabase, videoId, {
          current_shot_index: shot.segment_index,
          current_phase: 'video',
        });
        await updateShotInList(supabase, videoId, shot.segment_index, {
          videoStatus: 'generating',
        });
      });

      // Generate presigned URL for video
      const { putUrl, publicUrl } = await step.run(`${stepName}-presign`, async () => {
        const key = generateGpuTestKey(userId, 'video', 'mp4');
        return await generatePresignedPutUrl(key, 'video/mp4');
      });

      // Calculate video duration
      const videoDuration = clampVideoDuration(shot.duration_seconds || 4.0);

      // Call GPU API for video generation
      const videoResult = await step.run(`${stepName}-generate`, async () => {
        const jobId = uuidv4();
        return await callGpuLtx2Generate({
          job_id: jobId,
          input_image_url: startImageUrl,
          prompt: shot.visual_prompt || `Subtle cinematic motion. ${shot.text || ''}`,
          duration_seconds: videoDuration,
          frame_rate: 24,
          aspect_ratio: aspectRatio,
          width: dimensions.width,
          height: dimensions.height,
          enhance_prompt: false,
          save_url: putUrl,
        });
      });

      // Handle async job
      let finalVideoUrl = publicUrl;
      let videoSuccess = videoResult.success;
      let videoError: string | undefined;

      if (videoResult.success && videoResult.isAsync && videoResult.jobId) {
        const pollResult = await pollGpuJob(step, videoResult.jobId, stepName);
        videoSuccess = pollResult.success;
        if (pollResult.success && pollResult.resultUrl) {
          finalVideoUrl = pollResult.resultUrl;
        } else {
          videoError = pollResult.error;
        }
      } else if (!videoResult.success) {
        videoSuccess = false;
        videoError = videoResult.errorMessage;
      }

      // Update shot with result
      await step.run(`${stepName}-save-result`, async () => {
        if (videoSuccess) {
          await updateShotInList(supabase, videoId, shot.segment_index, {
            videoUrl: finalVideoUrl,
            videoStatus: 'completed',
          });
          
          const { data: video } = await supabase
            .from('video_projects')
            .select('metadata')
            .eq('id', videoId)
            .single();
          const metadata = video?.metadata as VideoProjectMetadata;
          const progress = metadata?.media_generation;
          
          await updateMediaProgress(supabase, videoId, {
            videos_completed: (progress?.videos_completed || 0) + 1,
          });
        } else {
          console.error(`[MediaGen] Video generation failed for shot ${shot.segment_index}: ${videoError}`);
          await updateShotInList(supabase, videoId, shot.segment_index, {
            videoStatus: 'failed',
            videoError: videoError,
          });
          
          const { data: video } = await supabase
            .from('video_projects')
            .select('metadata')
            .eq('id', videoId)
            .single();
          const metadata = video?.metadata as VideoProjectMetadata;
          const progress = metadata?.media_generation;
          
          await updateMediaProgress(supabase, videoId, {
            videos_failed: (progress?.videos_failed || 0) + 1,
          });
        }
      });
    }

    // ========================================================================
    // STEP 8: Finalize
    // ========================================================================
    const finalResult = await step.run('finalize', async () => {
      // Get final stats
      const { data: video } = await supabase
        .from('video_projects')
        .select('metadata')
        .eq('id', videoId)
        .single();
      
      const metadata = video?.metadata as VideoProjectMetadata;
      const progress = metadata?.media_generation;

      const hasFailures = (progress?.images_failed || 0) > 0 || 
                          (progress?.edits_failed || 0) > 0 || 
                          (progress?.videos_failed || 0) > 0;

      // Update final progress
      await updateMediaProgress(supabase, videoId, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        current_phase: 'idle',
      });

      // Move to next stage
      await supabase
        .from('video_projects')
        .update({
          current_stage: 'video',
          updated_at: new Date().toISOString(),
        })
        .eq('id', videoId);

      console.log(`[MediaGen] ========== MEDIA GENERATION COMPLETE ==========`);
      console.log(`[MediaGen] Images: ${progress?.images_completed}/${progress?.total_shots} (${progress?.images_failed} failed)`);
      console.log(`[MediaGen] Edits: ${progress?.edits_completed}/${progress?.total_shots} (${progress?.edits_failed} failed, ${progress?.edits_skipped} skipped)`);
      console.log(`[MediaGen] Videos: ${progress?.videos_completed}/${progress?.total_shots} (${progress?.videos_failed} failed)`);

      return {
        success: true,
        hasFailures,
        stats: {
          total: progress?.total_shots || 0,
          imagesCompleted: progress?.images_completed || 0,
          imagesFailed: progress?.images_failed || 0,
          editsCompleted: progress?.edits_completed || 0,
          editsFailed: progress?.edits_failed || 0,
          editsSkipped: progress?.edits_skipped || 0,
          videosCompleted: progress?.videos_completed || 0,
          videosFailed: progress?.videos_failed || 0,
        },
      };
    });

    // Emit completion event
    await step.sendEvent('emit-completion', {
      name: 'media-generation/workflow.complete',
      data: {
        videoId,
        userId,
        ...finalResult,
      },
    });

    return finalResult;
  }
);
