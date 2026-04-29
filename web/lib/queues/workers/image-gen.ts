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
import { getSupabaseServiceClient, updateTaskStatus, type TaskLifecycleOwner } from '@/lib/queues/shared';
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
import { getShotNeighborContext } from '@/lib/services/shot-context';

// ============================================================================
// JOB DATA INTERFACE
// ============================================================================

export interface ImageGenJobData {
  taskId: string;
  userId: string;
  videoId: string;
  taskLifecycleOwner?: TaskLifecycleOwner;
  /** When set, only generate this one shot */
  singleShotIndex?: number;
  /** Backward-compatible alias used by the orchestrator */
  shotIndex?: number;
  /** Aspect ratio for generation */
  aspectRatio?: '16:9' | '9:16';
  /** Optional LoRA name to apply for all image generations */
  loraName?: string;
  /** Optional LoRA trigger words to prepend to image prompts */
  loraTriggerWords?: string;
  /** Verifier feedback from the previous attempt (populated by orchestrator on retries) */
  previousFeedback?: string;
  /** Which attempt number this is (1-based); used for logging */
  attempt?: number;
}

// ============================================================================
// PROCESSOR
// ============================================================================

const LOG_PREFIX = '[ImageGen]';

function getResolvedPromptForShot(
  metadata: Record<string, unknown>,
  shot: Record<string, unknown>,
): string {
  const shotKey = `shot-${shot.segment_index as number}`;
  const resolvedPrompts = (metadata.resolved_prompts || {}) as Record<string, string>;
  const assetEntries = ((((metadata.asset_manifest || {}) as Record<string, unknown>).entries) || []) as Array<Record<string, unknown>>;
  const assetEntry = assetEntries.find(entry => (entry.segment_index as number) === (shot.segment_index as number));

  return resolvedPrompts[shotKey]
    || (assetEntry?.visual_prompt as string | undefined)
    || (shot.visual_prompt as string | undefined)
    || (shot.visual_description as string | undefined)
    || (shot.summary as string | undefined)
    || `Visual for segment ${shot.segment_index as number}`;
}

export const imageGenProcessor: Processor<ImageGenJobData> = async (
  job: Job<ImageGenJobData>
) => {
  const {
    taskId,
    userId,
    videoId,
    aspectRatio = '16:9',
    loraName,
    loraTriggerWords,
    singleShotIndex,
    shotIndex,
    taskLifecycleOwner,
    previousFeedback,
    attempt,
  } = job.data;
  const requestedShotIndex = typeof singleShotIndex === 'number'
    ? singleShotIndex
    : shotIndex;

  if (previousFeedback && requestedShotIndex !== undefined) {
    console.log(
      `${LOG_PREFIX} Shot ${requestedShotIndex} retry (attempt ${attempt ?? '?'}): ` +
      `Feedback: "${previousFeedback.slice(0, 120)}..."`
    );
  }
  const updateOwnedTaskStatus = (
    updates: Parameters<typeof updateTaskStatus>[1]
  ) => updateTaskStatus(taskId, updates, { lifecycleOwner: taskLifecycleOwner });

  console.log(`${LOG_PREFIX} Starting for video ${videoId}`);

  const costTracker = new CostTracker(5, userId); // Step 5 in the pipeline

  try {
    const result = await costTracker.run(async () => {
      const supabase = getSupabaseServiceClient();

      // =====================================================================
      // STEP 1: Fetch shot data from metadata
      // =====================================================================
      console.log(`${LOG_PREFIX} Step 1: Loading shot data...`);

      await updateOwnedTaskStatus({
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

      // Use shot_plan as primary data source (canonical, used by video-gen + asset-scout),
      // with av_script_part1 as fallback for backward compatibility.
      const shotPlanData = metadata.shot_plan as { shots?: Array<Record<string, unknown>> } | undefined;
      const avScriptFallback = metadata.av_script_part1 as { shots?: Array<Record<string, unknown>> } | undefined;
      const shots = shotPlanData?.shots || avScriptFallback?.shots || [];

      if (shots.length === 0) {
        console.warn(`${LOG_PREFIX} No shots found`);
        await updateOwnedTaskStatus({
          status: 'completed',
          current_step: 'No shots to generate images for',
          progress_percent: 100,
        });
        return { success: true, videoId, stats: { imagesGenerated: 0, imagesFailed: 0 } };
      }

      // Filter to true image-led shots unless a specific shot was requested.
      const gpuShots: ShotForGpuGeneration[] = shots
        .filter((s: Record<string, unknown>) => {
          const segmentIndex = s.segment_index as number;
          if (typeof requestedShotIndex === 'number') {
            return segmentIndex === requestedShotIndex;
          }
          const mediaType = s.media_type as string;
          const visualTreatment = s.visual_treatment as string | undefined;
          return visualTreatment === 'ai_image' || mediaType === 'image';
        })
        .map((s: Record<string, unknown>) => {
          // Build neighbor context from the full shot list for visual continuity
          const neighborCtx = getShotNeighborContext(
            shots as any[], // Full shot list for context
            shots.indexOf(s), // Index in the full list
          );

          return {
            segment_index: s.segment_index as number,
            media_type: 'image' as const,
            visual_prompt: (() => {
              const rawPrompt = getResolvedPromptForShot(metadata, s);
              const isTargetShot = typeof requestedShotIndex === 'number' &&
                (s.segment_index as number) === requestedShotIndex;

              if (!isTargetShot || !previousFeedback) return rawPrompt;

              // Append verifier corrections as natural-language amendments.
              // Never truncate — the full prompt carries necessary style and scene context.
              const corrections = previousFeedback
                .split(';')
                .map((s: string) => s.trim())
                .filter((s: string) => s && s !== 'SIMPLIFY_PROMPT');
              if (corrections.length === 0) return rawPrompt;
              const amendment = corrections.join('. ');
              console.log(
                `${LOG_PREFIX} Shot ${s.segment_index as number}: Appending verifier corrections as amendment.`
              );
              return `${rawPrompt.trim().replace(/\.$/, '')}. ${amendment}.`;
            })(),
            duration_seconds: (s.duration_seconds as number) || 5,
            start_frame_url: undefined,
            visual_elements: s.visual_elements as import('@/types/video').RoutingTag[] | undefined,
            narration_text: s.text as string | undefined,
            image_count: (s.image_count as number) || 1,
            neighbor_context: neighborCtx.compactNote || undefined,
          };
        });

      console.log(`${LOG_PREFIX} ${gpuShots.length} shots need image generation`);

      if (gpuShots.length === 0) {
        await updateOwnedTaskStatus({
          status: 'completed',
          current_step: 'No image-led shots to generate',
          progress_percent: 100,
        });
        return {
          success: true,
          videoId,
          ...(typeof requestedShotIndex === 'number' ? { mediaUrl: '' } : {}),
          stats: { imagesGenerated: 0, imagesFailed: 0 },
        };
      }

      // =====================================================================
      // STEP 2: Run GPU batch generation (image mode only)
      // =====================================================================
      console.log(`${LOG_PREFIX} Step 2: Running GPU batch image generation...`);

      await updateOwnedTaskStatus({
        status: 'running',
        current_step: `Generating images for ${gpuShots.length} shots...`,
        progress_percent: 15,
      });

      const onProgress = async (message: string, percent: number) => {
        console.log(`${LOG_PREFIX} Progress: ${message} (${percent}%)`);
        await updateOwnedTaskStatus({
          status: 'running',
          current_step: message,
          progress_percent: 15 + Math.round(percent * 0.7),
        });
      };

      const onItemComplete = async (event: ItemCompleteEvent) => {
        console.log(`${LOG_PREFIX} Images: ${event.completed}/${event.total}`);
      };

      // Acquire per-user GPU lock to prevent VRAM mode thrashing
      // when multiple pipelines for the same user run concurrently
      const lockTtlMs = calculateTimeout('image_generation', gpuShots.length) + MODE_SWITCH_TIMEOUT_MS + 60_000;

      const gpuResult = await withGpuLock(userId, async () => {
        return processGpuBatchGeneration(
          userId,
          videoId,
          gpuShots,
          aspectRatio as AspectRatio,
          onProgress,
          onItemComplete,
          loraName,
          loraTriggerWords,
        );
      }, lockTtlMs, videoId);

      // Track GPU cost (~3s per image on A100)
      costTracker.addGpuTime(gpuResult.stats.imagesGenerated * 3);

      // =====================================================================
      // STEP 3: Persist results
      // =====================================================================
      console.log(`${LOG_PREFIX} Step 3: Persisting image results...`);

      // Store image results for downstream workers (video-gen needs keyframes)
      const imageResults: Record<string, string> = {};
      const imageProvenance: Record<string, string> = {};
      for (const r of gpuResult.results) {
        if (r.generation_status === 'completed') {
          imageResults[`shot-${r.shot_index}`] = r.media_url;
          imageProvenance[`shot-${r.shot_index}`] = 'standalone_image';
        }
      }

      const { data: latestVideo } = await supabase
        .from('video_projects')
        .select('metadata')
        .eq('id', videoId)
        .single();
      const latestMeta = (latestVideo?.metadata || {}) as Record<string, unknown>;
      const existingImages = (latestMeta.generated_images || {}) as Record<string, string>;
      const existingProvenance = (latestMeta.generated_image_provenance || {}) as Record<string, string>;
      const mergedImages = { ...existingImages, ...imageResults };
      const mergedProvenance = { ...existingProvenance, ...imageProvenance };

      // Atomic merge — prevents race with concurrent metadata writes
      await supabase.rpc('merge_video_metadata', {
        p_video_id: videoId,
        p_updates: {
          generated_images: mergedImages,
          generated_image_provenance: mergedProvenance,
          image_gen_stats: gpuResult.stats,
        },
      });

      await updateOwnedTaskStatus({
        status: 'completed',
        current_step: `Image generation complete: ${gpuResult.stats.imagesGenerated} generated, ${gpuResult.stats.imagesFailed} failed`,
        progress_percent: 100,
      });

      console.log(`${LOG_PREFIX} ✅ Complete: ${gpuResult.stats.imagesGenerated} images`);

      return {
        success: true,
        videoId,
        ...(typeof requestedShotIndex === 'number'
          ? { mediaUrl: mergedImages[`shot-${requestedShotIndex}`] }
          : {}),
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

    await updateOwnedTaskStatus({
      status: 'failed',
      current_step: 'Image generation failed',
      progress_percent: 0,
      error_message: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
};
