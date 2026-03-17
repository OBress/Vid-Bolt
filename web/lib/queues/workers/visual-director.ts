/**
 * Visual Director Workflow Worker
 * ============================================================================
 * BullMQ worker for the visual director pipeline that generates images
 * and videos for a video project's shot list using the GPU API.
 * 
 * Pipeline:
 * 1. Fetch shot list from video_projects.metadata (from AV Script Part 1)
 * 2. Build ShotForGpuGeneration[] from shots
 * 3. Call processGpuBatchGeneration() for batch image + video generation
 *    (handles VRAM mode switching, R2 storage, webhook tracking)
 * 4. Map results to EnhancedShot[] format and store in metadata
 * 5. Update media_generation progress tracking
 */

import { Job, Processor } from 'bullmq';
import { getSupabaseServiceClient, updateTaskStatus } from '@/lib/queues/shared';
import {
  processGpuBatchGeneration,
  type ShotForGpuGeneration,
  type ItemCompleteEvent,
} from '@/lib/av-script/gpu-batch-generation';
import type { ShotPart1 } from './av-script';
import type {
  EnhancedShot,
  MediaGenerationProgress,
} from '@/types/media-generation';
import type { AspectRatio } from '@/lib/services/gpu-api-service';
import { CostTracker } from '@/lib/queues/cost-tracker';

// ============================================================================
// JOB DATA INTERFACE
// ============================================================================

export interface VisualDirectorJobData {
  taskId: string;
  userId: string;
  videoId: string;
  projectId?: string;
  spine?: {
    title: string;
    duration_seconds: number;
    beats: Array<{
      beat_id: string;
      content: string;
      start_time: number;
      end_time: number;
    }>;
  };
  assetRegistry?: {
    characters: Array<{ id: string; name: string; description: string }>;
    locations: Array<{ id: string; name: string; description: string }>;
    objects: Array<{ id: string; name: string; description: string }>;
  };
  expandedBeats?: Array<{
    beat_id: string;
    expanded_content: string;
    visual_description: string;
  }>;
  finalScript?: string;
  /** Enable GPU generation (default: true) */
  gpuEnabled?: boolean;
  /** Aspect ratio override (default: from metadata or '16:9') */
  aspectRatio?: '16:9' | '9:16';
}

// ============================================================================
// HELPERS
// ============================================================================

const LOG_PREFIX = '[VisualDirector]';

/**
 * Extract shots from video metadata, supporting multiple storage formats.
 */
function extractShotsFromMetadata(metadata: Record<string, unknown>): ShotPart1[] {
  // Priority: av_script_part1 → shot_list
  const avScriptPart1 = metadata.av_script_part1 as { shots?: ShotPart1[] } | undefined;
  if (avScriptPart1?.shots?.length) {
    return avScriptPart1.shots;
  }

  const shotList = metadata.shot_list as ShotPart1[] | undefined;
  if (shotList?.length) {
    return shotList;
  }

  return [];
}

/**
 * Determine the aspect ratio from metadata or job data.
 */
function resolveAspectRatio(
  jobAspectRatio?: '16:9' | '9:16',
  metadata?: Record<string, unknown>
): AspectRatio {
  if (jobAspectRatio) return jobAspectRatio;

  const visuals = metadata?.visuals as { aspectRatio?: '16:9' | '9:16' } | undefined;
  if (visuals?.aspectRatio) return visuals.aspectRatio;

  return '16:9';
}

/**
 * Build ShotForGpuGeneration[] from ShotPart1[].
 */
function buildGpuShots(shots: ShotPart1[]): ShotForGpuGeneration[] {
  return shots.map((shot) => ({
    segment_index: shot.segment_index,
    media_type: shot.media_type || 'motiongraphic',
    visual_prompt: shot.visual_prompt || shot.summary || `Visual for segment ${shot.segment_index}`,
    duration_seconds: (() => {
      if (!shot.duration_seconds || shot.duration_seconds <= 0) {
        throw new Error(`[VisualDirector] Shot ${shot.segment_index} has no valid duration_seconds — shot plan timing is incomplete.`);
      }
      return shot.duration_seconds;
    })(),
    // Video shots need a keyframe image — these get generated in the image batch first,
    // then the batch pipeline uses them for video generation if start_frame_url is provided.
    // For now, video shots without a pre-existing keyframe will fall back to placeholder.
    start_frame_url: undefined,
  }));
}

/**
 * Build basic shots from expandedBeats when no AV script data exists.
 */
function buildShotsFromBeats(
  expandedBeats: VisualDirectorJobData['expandedBeats']
): ShotForGpuGeneration[] {
  if (!expandedBeats?.length) return [];

  return expandedBeats.map((beat, index) => ({
    segment_index: index,
    media_type: 'motiongraphic' as const,
    visual_prompt: beat.visual_description || beat.expanded_content || `Visual for beat ${index}`,
    duration_seconds: 5,
    start_frame_url: undefined,
  }));
}

/**
 * Map GPU generation results back to EnhancedShot[] format.
 */
function mapResultsToEnhancedShots(
  shots: ShotPart1[],
  gpuResults: Awaited<ReturnType<typeof processGpuBatchGeneration>>
): EnhancedShot[] {
  return shots.map((shot) => {
    const gpuResult = gpuResults.results.find(
      (r) => r.shot_index === shot.segment_index
    );

    const isImage = shot.media_type !== 'video';
    const isCompleted = gpuResult?.generation_status === 'completed';

    const enhanced: EnhancedShot = {
      // Core shot fields
      segment_index: shot.segment_index,
      start_seconds: shot.start_seconds,
      end_seconds: shot.end_seconds,
      duration_seconds: shot.duration_seconds,
      content_type: (shot as any).content_type || 'concept',
      text: shot.text,
      visual_prompt: shot.visual_prompt || shot.summary,

      // Media type
      media_type: isImage ? 'image' : 'video',

      // Generation status
      generationStatus: isCompleted ? 'completed' : 'failed',
    };

    if (gpuResult && isCompleted) {
      if (isImage) {
        enhanced.baseImageUrl = gpuResult.media_url;
        enhanced.baseImageStatus = 'completed';
        enhanced.startImageUrl = gpuResult.media_url;
      } else {
        enhanced.videoUrl = gpuResult.media_url;
        enhanced.videoStatus = 'completed';
      }
    } else if (gpuResult) {
      if (isImage) {
        enhanced.baseImageStatus = 'failed';
        enhanced.baseImageError = gpuResult.error_message;
      } else {
        enhanced.videoStatus = 'failed';
        enhanced.videoError = gpuResult.error_message;
      }
    }

    return enhanced;
  });
}

// ============================================================================
// PROCESSOR
// ============================================================================

export const visualDirectorProcessor: Processor<VisualDirectorJobData> = async (job: Job<VisualDirectorJobData>) => {
  const {
    taskId,
    userId,
    videoId,
    expandedBeats,
    gpuEnabled = true,
    aspectRatio: jobAspectRatio,
  } = job.data;

  console.log(`${LOG_PREFIX} Starting job ${job.id} for video ${videoId} (GPU: ${gpuEnabled})`);

  // Cost tracking for Step 6 (Visual Director / GPU)
  const costTracker = new CostTracker(6);

  try {
    const result = await costTracker.run(async () => {
    const supabase = getSupabaseServiceClient();

    // =========================================================================
    // STEP 1: Fetch video metadata and extract shots
    // =========================================================================
    console.log(`${LOG_PREFIX} Step 1: Fetching video metadata...`);

    if (taskId) {
      await updateTaskStatus(taskId, {
        status: 'running',
        current_phase: 'media_generation',
        current_step: 'Fetching shot list...',
        progress_percent: 5,
      });
    }

    const { data: video, error: fetchError } = await supabase
      .from('video_projects')
      .select('metadata')
      .eq('id', videoId)
      .single();

    if (fetchError) {
      throw new Error(`Failed to fetch video ${videoId}: ${fetchError.message}`);
    }

    const metadata = (video?.metadata || {}) as Record<string, unknown>;
    const aspectRatio = resolveAspectRatio(jobAspectRatio, metadata);

    // Try to extract shots from existing AV script data
    const existingShots = extractShotsFromMetadata(metadata);

    let gpuShots: ShotForGpuGeneration[];
    let shotSource: string;

    if (existingShots.length > 0) {
      gpuShots = buildGpuShots(existingShots);
      shotSource = 'AV Script';
      console.log(`${LOG_PREFIX} Found ${existingShots.length} shots from AV Script metadata`);
    } else if (expandedBeats?.length) {
      gpuShots = buildShotsFromBeats(expandedBeats);
      shotSource = 'expandedBeats';
      console.log(`${LOG_PREFIX} Built ${gpuShots.length} shots from expandedBeats`);
    } else {
      console.warn(`${LOG_PREFIX} No shots or beats found — nothing to generate`);

      // Store empty result
      await supabase
        .from('video_projects')
        .update({
          metadata: {
            ...metadata,
            visual_director_output: { scenes: [], generatedImages: {}, generatedVideos: {}, stats: { totalScenes: 0, totalShots: 0 } },
            visual_director_completed: true,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', videoId);

      if (taskId) {
        await updateTaskStatus(taskId, {
          status: 'completed',
          current_step: 'No shots to generate',
          progress_percent: 100,
        });
      }

      return { success: true, videoId, stats: { totalScenes: 0, totalShots: 0 } };
    }

    // =========================================================================
    // STEP 2: Update media generation progress
    // =========================================================================
    console.log(`${LOG_PREFIX} Step 2: Initialising media generation progress...`);

    const imageShots = gpuShots.filter((s) => s.media_type !== 'video');
    const videoShots = gpuShots.filter((s) => s.media_type === 'video');

    const mediaProgress: MediaGenerationProgress = {
      status: 'images',
      started_at: new Date().toISOString(),
      av_script_completed: true,
      total_shots: gpuShots.length,
      current_shot_index: 0,
      current_phase: 'image',
      images_completed: 0,
      images_failed: 0,
      edits_completed: 0,
      edits_failed: 0,
      edits_skipped: gpuShots.length, // We skip editing in this pipeline
      videos_completed: 0,
      videos_failed: 0,
    };

    await supabase
      .from('video_projects')
      .update({
        metadata: {
          ...metadata,
          media_generation: mediaProgress,
        },
        current_stage: 'media_generation',
        status: 'processing',
        updated_at: new Date().toISOString(),
      })
      .eq('id', videoId);

    if (taskId) {
      await updateTaskStatus(taskId, {
        status: 'running',
        current_step: `Generating media for ${gpuShots.length} shots (${imageShots.length} images, ${videoShots.length} videos)...`,
        progress_percent: 10,
      });
    }

    // =========================================================================
    // STEP 3: GPU batch generation (or fallback)
    // =========================================================================
    if (gpuEnabled) {
      console.log(`${LOG_PREFIX} Step 3: Running GPU batch generation (${imageShots.length} images, ${videoShots.length} videos)...`);

      // Progress callback wired to task + metadata updates
      const onProgress = async (message: string, percent: number) => {
        console.log(`${LOG_PREFIX} Progress: ${message} (${percent}%)`);

        if (taskId) {
          await updateTaskStatus(taskId, {
            status: 'running',
            current_step: message,
            progress_percent: 10 + Math.round(percent * 0.7), // Scale 0-100 to 10-80
          });
        }
      };

      // Per-item callback wired to task + metadata updates
      const onItemComplete = async (event: ItemCompleteEvent) => {
        const label = event.mediaType === 'image' ? 'Images' : 'Videos';
        const message = `${label}: ${event.completed} of ${event.total} created`;
        console.log(`${LOG_PREFIX} Item complete: ${message}`);

        if (taskId) {
          // Scale progress: images within 15-45%, videos within 55-80%
          const phaseStart = event.mediaType === 'image' ? 15 : 55;
          const phaseEnd = event.mediaType === 'image' ? 45 : 80;
          const phasePercent = phaseStart + Math.round((event.completed / event.total) * (phaseEnd - phaseStart));

          await updateTaskStatus(taskId, {
            status: 'running',
            current_step: message,
            progress_percent: phasePercent,
          });
        }
      };

      const gpuResult = await processGpuBatchGeneration(
        userId,
        videoId,
        gpuShots,
        aspectRatio,
        onProgress,
        onItemComplete
      );

      // Track GPU compute time (approximate: ~3s/image, ~8s/video on A100)
      const totalGpuSeconds = gpuResult.stats.imagesGenerated * 3 + gpuResult.stats.videosGenerated * 8;
      costTracker.addGpuTime(totalGpuSeconds);

      console.log(`${LOG_PREFIX} GPU batch complete: ${gpuResult.stats.imagesGenerated} images, ${gpuResult.stats.videosGenerated} videos`);
      console.log(`${LOG_PREFIX} Failed: ${gpuResult.stats.imagesFailed} images, ${gpuResult.stats.videosFailed} videos`);

      // =====================================================================
      // STEP 4: Map results and store
      // =====================================================================
      console.log(`${LOG_PREFIX} Step 4: Storing results in metadata...`);

      if (taskId) {
        await updateTaskStatus(taskId, {
          status: 'running',
          current_step: 'Storing generated media...',
          progress_percent: 85,
        });
      }

      // Re-fetch metadata in case it was updated during generation
      const { data: updatedVideo } = await supabase
        .from('video_projects')
        .select('metadata')
        .eq('id', videoId)
        .single();

      const latestMetadata = (updatedVideo?.metadata || metadata) as Record<string, unknown>;

      // Build enhanced shot list if we have existing shots
      let enhancedShots: EnhancedShot[] | undefined;
      if (existingShots.length > 0) {
        enhancedShots = mapResultsToEnhancedShots(existingShots, gpuResult);
      }

      // Build legacy visual director output for backwards compat
      const generatedImages: Record<string, string> = {};
      const generatedVideos: Record<string, string> = {};

      for (const result of gpuResult.results) {
        if (result.generation_status === 'completed') {
          const shot = gpuShots.find((s) => s.segment_index === result.shot_index);
          const key = `scene-${result.shot_index}`;
          if (shot?.media_type === 'video') {
            generatedVideos[key] = result.media_url;
          } else {
            generatedImages[key] = result.media_url;
          }
        }
      }

      // Final progress update
      const completedProgress: MediaGenerationProgress = {
        ...mediaProgress,
        status: 'completed',
        completed_at: new Date().toISOString(),
        current_phase: 'idle',
        images_completed: gpuResult.stats.imagesGenerated,
        images_failed: gpuResult.stats.imagesFailed,
        videos_completed: gpuResult.stats.videosGenerated,
        videos_failed: gpuResult.stats.videosFailed,
      };

      const finalMetadata = {
        ...latestMetadata,
        visual_director_output: {
          scenes: existingShots.map((shot, i) => ({
            scene_id: `scene-${i}`,
            beat_id: `beat-${i}`,
            content: shot.text,
            visual_description: shot.visual_prompt || shot.summary,
          })),
          generatedImages,
          generatedVideos,
          stats: {
            totalScenes: gpuShots.length,
            totalShots: gpuShots.length,
            imagesGenerated: gpuResult.stats.imagesGenerated,
            imagesFailed: gpuResult.stats.imagesFailed,
            videosGenerated: gpuResult.stats.videosGenerated,
            videosFailed: gpuResult.stats.videosFailed,
          },
        },
        visual_director_completed: true,
        media_generation: completedProgress,
        // Store enhanced shots if available
        ...(enhancedShots ? { shot_list: enhancedShots } : {}),
      };

      const { error: storeError } = await supabase
        .from('video_projects')
        .update({
          metadata: finalMetadata,
          current_stage: 'media_generation',
          status: 'processing',
          updated_at: new Date().toISOString(),
        })
        .eq('id', videoId);

      if (storeError) {
        console.error(`${LOG_PREFIX} Failed to store results:`, storeError);
        throw storeError;
      }

      // =====================================================================
      // STEP 5: Complete
      // =====================================================================
      if (taskId) {
        await updateTaskStatus(taskId, {
          status: 'completed',
          current_step: 'Media generation complete',
          progress_percent: 100,
        });
      }

      const stats = {
        totalScenes: gpuShots.length,
        totalShots: gpuShots.length,
        shotSource,
        imagesGenerated: gpuResult.stats.imagesGenerated,
        imagesFailed: gpuResult.stats.imagesFailed,
        videosGenerated: gpuResult.stats.videosGenerated,
        videosFailed: gpuResult.stats.videosFailed,
      };

      console.log(`${LOG_PREFIX} Complete for video ${videoId}`);
      console.log(`${LOG_PREFIX} Stats:`, JSON.stringify(stats));

      return { success: true, videoId, stats };

    } else {
      // GPU disabled — placeholder mode (original behavior)
      console.log(`${LOG_PREFIX} GPU disabled, storing placeholder results`);

      await supabase
        .from('video_projects')
        .update({
          metadata: {
            ...metadata,
            visual_director_output: {
              scenes: gpuShots.map((shot, i) => ({
                scene_id: `scene-${i}`,
                content: shot.visual_prompt,
                visual_description: shot.visual_prompt,
              })),
              generatedImages: {},
              generatedVideos: {},
              stats: {
                totalScenes: gpuShots.length,
                totalShots: gpuShots.length,
                imagesGenerated: 0,
                videosGenerated: 0,
              },
            },
            visual_director_completed: true,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', videoId);

      if (taskId) {
        await updateTaskStatus(taskId, {
          status: 'completed',
          current_step: 'Complete (GPU disabled)',
          progress_percent: 100,
        });
      }

      return {
        success: true,
        videoId,
        stats: { totalScenes: gpuShots.length, totalShots: gpuShots.length, gpuDisabled: true },
      };
    }
    }); // end costTracker.run()

    // Save cost data (GPU time)
    await costTracker.save(videoId);
    return result;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed for video ${videoId}:`, error);

    // Still try to save partial cost data
    await costTracker.save(videoId);

    if (taskId) {
      await updateTaskStatus(taskId, {
        status: 'failed',
        current_step: 'Failed',
        progress_percent: 0,
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    throw error;
  }
};
