/**
 * Video Generation Worker
 * ============================================================================
 * Specialized worker for AI video generation via LTX-2.
 * Split from the monolithic visual-director.ts.
 *
 * Input:  Shots needing video generation + keyframe images from image-gen
 * Output: Generated video URLs stored in video_projects metadata
 *
 * Modes:
 *   - T2V (Text-to-Video): First shot or isolated scene
 *   - FF2V (First-Frame-to-Video): Sequential continuation starting from keyframe
 *
 * Reuses the existing gpu-batch-generation.ts engine for the actual API calls.
 */

import { Job, Processor } from 'bullmq';
import { getSupabaseServiceClient, updateTaskStatus } from '@/lib/queues/shared';
import {
  processGpuBatchGeneration,
  type ShotForGpuGeneration,
  type ItemCompleteEvent,
} from '@/lib/av-script/gpu-batch-generation';
import type { AspectRatio } from '@/lib/services/gpu-api-service';
import { CostTracker } from '@/lib/queues/cost-tracker';

// ============================================================================
// JOB DATA INTERFACE
// ============================================================================

export interface VideoGenJobData {
  taskId: string;
  userId: string;
  videoId: string;
  /** Aspect ratio for generation */
  aspectRatio?: '16:9' | '9:16';
}

// ============================================================================
// PROCESSOR
// ============================================================================

const LOG_PREFIX = '[VideoGen]';

export const videoGenProcessor: Processor<VideoGenJobData> = async (
  job: Job<VideoGenJobData>
) => {
  const { taskId, userId, videoId, aspectRatio = '16:9' } = job.data;

  console.log(`${LOG_PREFIX} Starting for video ${videoId}`);

  const costTracker = new CostTracker(6); // Step 6 in the pipeline

  try {
    const result = await costTracker.run(async () => {
      const supabase = getSupabaseServiceClient();

      // =====================================================================
      // STEP 1: Fetch shot data + keyframe images from metadata
      // =====================================================================
      console.log(`${LOG_PREFIX} Step 1: Loading shot data and keyframe images...`);

      await updateTaskStatus(taskId, {
        status: 'running',
        current_step: 'Loading shots for video generation...',
        progress_percent: 5,
      });

      const { data: video } = await supabase
        .from('video_projects')
        .select('metadata')
        .eq('id', videoId)
        .single();

      const metadata = (video?.metadata || {}) as Record<string, unknown>;

      // Get shots
      const avScriptPart1 = metadata.av_script_part1 as { shots?: Array<Record<string, unknown>> } | undefined;
      const allShots = avScriptPart1?.shots || [];

      // Get keyframe images from the image-gen worker's output
      const generatedImages = (metadata.generated_images || {}) as Record<string, string>;

      // Filter to only video shots
      const videoShots = allShots.filter(
        (s: Record<string, unknown>) => (s.media_type as string) === 'video'
      );

      if (videoShots.length === 0) {
        console.log(`${LOG_PREFIX} No video shots to generate`);
        await updateTaskStatus(taskId, {
          status: 'completed',
          current_step: 'No video shots to generate',
          progress_percent: 100,
        });
        return { success: true, videoId, stats: { videosGenerated: 0, videosFailed: 0 } };
      }

      // =====================================================================
      // STEP 2: Wire keyframe images as start frames for FF2V
      // =====================================================================
      console.log(`${LOG_PREFIX} Step 2: Wiring keyframe images for ${videoShots.length} video shots...`);

      const gpuShots: ShotForGpuGeneration[] = videoShots.map((s: Record<string, unknown>) => {
        const segmentIndex = s.segment_index as number;
        const keyframeUrl = generatedImages[`shot-${segmentIndex}`];

        return {
          segment_index: segmentIndex,
          media_type: 'video' as const,
          visual_prompt: (s.visual_prompt as string) || (s.summary as string) || `Video for segment ${segmentIndex}`,
          duration_seconds: (s.duration_seconds as number) || 5,
          start_frame_url: keyframeUrl, // Will be undefined for T2V shots
          visual_elements: s.visual_elements as import('@/types/video').RoutingTag[] | undefined,
          narration_text: s.text as string | undefined,
        };
      });

      const withKeyframe = gpuShots.filter(s => s.start_frame_url).length;
      console.log(`${LOG_PREFIX} ${withKeyframe}/${gpuShots.length} video shots have keyframe images (FF2V mode)`);

      // =====================================================================
      // STEP 3: Run GPU batch video generation
      // =====================================================================
      console.log(`${LOG_PREFIX} Step 3: Running GPU batch video generation...`);

      await updateTaskStatus(taskId, {
        status: 'running',
        current_step: `Generating ${gpuShots.length} videos...`,
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
        console.log(`${LOG_PREFIX} Videos: ${event.completed}/${event.total}`);
      };

      const gpuResult = await processGpuBatchGeneration(
        userId,
        videoId,
        gpuShots,
        aspectRatio as AspectRatio,
        onProgress,
        onItemComplete
      );

      // Track GPU cost (~8s per video on A100)
      costTracker.addGpuTime(gpuResult.stats.videosGenerated * 8);

      // =====================================================================
      // STEP 4: Persist results
      // =====================================================================
      console.log(`${LOG_PREFIX} Step 4: Persisting video results...`);

      const { data: updatedVideo } = await supabase
        .from('video_projects')
        .select('metadata')
        .eq('id', videoId)
        .single();

      const latestMetadata = (updatedVideo?.metadata || metadata) as Record<string, unknown>;

      const videoResults: Record<string, string> = {};
      for (const r of gpuResult.results) {
        if (r.generation_status === 'completed') {
          videoResults[`shot-${r.shot_index}`] = r.media_url;
        }
      }

      await supabase
        .from('video_projects')
        .update({
          metadata: {
            ...latestMetadata,
            generated_videos: videoResults,
            video_gen_stats: gpuResult.stats,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', videoId);

      await updateTaskStatus(taskId, {
        status: 'completed',
        current_step: `Video generation complete: ${gpuResult.stats.videosGenerated} generated, ${gpuResult.stats.videosFailed} failed`,
        progress_percent: 100,
      });

      console.log(`${LOG_PREFIX} ✅ Complete: ${gpuResult.stats.videosGenerated} videos`);

      return {
        success: true,
        videoId,
        stats: {
          videosGenerated: gpuResult.stats.videosGenerated,
          videosFailed: gpuResult.stats.videosFailed,
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
      current_step: 'Video generation failed',
      progress_percent: 0,
      error_message: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
};
