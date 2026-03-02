/**
 * Image Generation Worker
 * ============================================================================
 * Specialized worker for batch AI image generation via Z-Image Turbo.
 * Split from the monolithic visual-director.ts.
 *
 * Input:  AssetManifest (shots needing AI-generated images)
 * Output: Generated image URLs stored in video_projects metadata
 *
 * Reuses the existing gpu-batch-generation.ts engine for the actual API calls.
 */

import { Job, Processor } from 'bullmq';
import { getSupabaseServiceClient, updateTaskStatus } from '@/lib/queues/shared';
import {
  processGpuBatchGeneration,
  calculateTimeout,
  MODE_SWITCH_TIMEOUT_MS,
  type ShotForGpuGeneration,
  type ItemCompleteEvent,
} from '@/lib/av-script/gpu-batch-generation';
import type { AspectRatio } from '@/lib/services/gpu-api-service';
import { CostTracker } from '@/lib/queues/cost-tracker';
import { withGpuLock } from '@/lib/queues/gpu-lock';

// ============================================================================
// JOB DATA INTERFACE
// ============================================================================

export interface ImageGenJobData {
  taskId: string;
  userId: string;
  videoId: string;
  /** Aspect ratio for generation */
  aspectRatio?: '16:9' | '9:16';
  /** Optional LoRA name to apply for all image generations */
  loraName?: string;
}

// ============================================================================
// PROCESSOR
// ============================================================================

const LOG_PREFIX = '[ImageGen]';

export const imageGenProcessor: Processor<ImageGenJobData> = async (
  job: Job<ImageGenJobData>
) => {
  const { taskId, userId, videoId, aspectRatio = '16:9', loraName } = job.data;

  console.log(`${LOG_PREFIX} Starting for video ${videoId}`);

  const costTracker = new CostTracker(5); // Step 5 in the pipeline

  try {
    const result = await costTracker.run(async () => {
      const supabase = getSupabaseServiceClient();

      // =====================================================================
      // STEP 1: Fetch shot data from metadata
      // =====================================================================
      console.log(`${LOG_PREFIX} Step 1: Loading shot data...`);

      await updateTaskStatus(taskId, {
        status: 'running',
        current_step: 'Loading shots for image generation...',
        progress_percent: 5,
      });

      const { data: video } = await supabase
        .from('video_projects')
        .select('metadata')
        .eq('id', videoId)
        .single();

      const metadata = (video?.metadata || {}) as Record<string, unknown>;

      // Build GPU shots from av_script_part1 or asset_manifest
      const avScriptPart1 = metadata.av_script_part1 as { shots?: Array<Record<string, unknown>> } | undefined;
      const shots = avScriptPart1?.shots || [];

      if (shots.length === 0) {
        console.warn(`${LOG_PREFIX} No shots found`);
        await updateTaskStatus(taskId, {
          status: 'completed',
          current_step: 'No shots to generate images for',
          progress_percent: 100,
        });
        return { success: true, videoId, stats: { imagesGenerated: 0, imagesFailed: 0 } };
      }

      // Filter to only image-needing shots (not pure MG or stock)
      const gpuShots: ShotForGpuGeneration[] = shots
        .filter((s: Record<string, unknown>) => {
          const mediaType = s.media_type as string;
          return mediaType !== 'stock'; // Image and video shots both need keyframe images
        })
        .map((s: Record<string, unknown>) => ({
          segment_index: s.segment_index as number,
          media_type: (s.media_type as 'video' | 'motiongraphic') || 'motiongraphic',
          visual_prompt: (s.visual_prompt as string) || (s.summary as string) || `Visual for segment ${s.segment_index}`,
          duration_seconds: (s.duration_seconds as number) || 5,
          start_frame_url: undefined,
          visual_elements: s.visual_elements as import('@/types/video').RoutingTag[] | undefined,
          narration_text: s.text as string | undefined,
          image_count: (s.image_count as number) || 1,
        }));

      console.log(`${LOG_PREFIX} ${gpuShots.length} shots need image generation`);

      // =====================================================================
      // STEP 2: Run GPU batch generation (image mode only)
      // =====================================================================
      console.log(`${LOG_PREFIX} Step 2: Running GPU batch image generation...`);

      await updateTaskStatus(taskId, {
        status: 'running',
        current_step: `Generating images for ${gpuShots.length} shots...`,
        progress_percent: 15,
      });

      const onProgress = async (message: string, percent: number) => {
        console.log(`${LOG_PREFIX} Progress: ${message} (${percent}%)`);
        await updateTaskStatus(taskId, {
          status: 'running',
          current_step: message,
          progress_percent: 15 + Math.round(percent * 0.7),
        });
      };

      const onItemComplete = async (event: ItemCompleteEvent) => {
        console.log(`${LOG_PREFIX} Images: ${event.completed}/${event.total}`);
      };

      // Override all shots to image type for this worker — the video-gen worker handles video later
      const imageShotsOnly = gpuShots.map(s => ({
        ...s,
        media_type: 'motiongraphic' as const, // Force image mode for all
      }));

      // Acquire per-user GPU lock to prevent VRAM mode thrashing
      // when multiple pipelines for the same user run concurrently
      const lockTtlMs = calculateTimeout('image_generation', imageShotsOnly.length) + MODE_SWITCH_TIMEOUT_MS + 60_000;

      const gpuResult = await withGpuLock(userId, async () => {
        return processGpuBatchGeneration(
          userId,
          videoId,
          imageShotsOnly,
          aspectRatio as AspectRatio,
          onProgress,
          onItemComplete,
          loraName,
        );
      }, lockTtlMs);

      // Track GPU cost (~3s per image on A100)
      costTracker.addGpuTime(gpuResult.stats.imagesGenerated * 3);

      // =====================================================================
      // STEP 3: Persist results
      // =====================================================================
      console.log(`${LOG_PREFIX} Step 3: Persisting image results...`);

      // Store image results for downstream workers (video-gen needs keyframes)
      const imageResults: Record<string, string> = {};
      for (const r of gpuResult.results) {
        if (r.generation_status === 'completed') {
          imageResults[`shot-${r.shot_index}`] = r.media_url;
        }
      }

      // Atomic merge — prevents race with concurrent metadata writes
      await supabase.rpc('merge_video_metadata', {
        p_video_id: videoId,
        p_updates: {
          generated_images: imageResults,
          image_gen_stats: gpuResult.stats,
        },
      });

      await updateTaskStatus(taskId, {
        status: 'completed',
        current_step: `Image generation complete: ${gpuResult.stats.imagesGenerated} generated, ${gpuResult.stats.imagesFailed} failed`,
        progress_percent: 100,
      });

      console.log(`${LOG_PREFIX} ✅ Complete: ${gpuResult.stats.imagesGenerated} images`);

      return {
        success: true,
        videoId,
        stats: {
          imagesGenerated: gpuResult.stats.imagesGenerated,
          imagesFailed: gpuResult.stats.imagesFailed,
        },
      };
    }); // end costTracker.run

    await costTracker.save(videoId);
    return result;

  } catch (error) {
    console.error(`${LOG_PREFIX} Failed for video ${videoId}:`, error);
    await costTracker.save(videoId);

    await updateTaskStatus(taskId, {
      status: 'failed',
      current_step: 'Image generation failed',
      progress_percent: 0,
      error_message: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
};
