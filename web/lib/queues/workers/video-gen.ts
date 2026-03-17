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
  calculateTimeout,
  MODE_SWITCH_TIMEOUT_MS,
  type ShotForGpuGeneration,
  type ItemCompleteEvent,
} from '@/lib/av-script/gpu-batch-generation';
import type { AspectRatio } from '@/lib/services/gpu-api-service';
import { CostTracker } from '@/lib/queues/cost-tracker';
import { withGpuLock } from '@/lib/queues/gpu-lock';
import { emitVideoItemComplete } from '@/lib/queues/video-completion-emitter';

// ============================================================================
// JOB DATA INTERFACE
// ============================================================================

export interface VideoGenJobData {
  taskId: string;
  userId: string;
  videoId: string;
  /** Aspect ratio for generation */
  aspectRatio?: '16:9' | '9:16';
  /** When set, only regenerate this specific shot (for single-shot retries) */
  singleShotIndex?: number;
  /** Verifier feedback to incorporate into the retry prompt */
  previousFeedback?: string;
  /** Batch retry: regenerate multiple shots in a single GPU pass */
  retryShotIndices?: number[];
  /** Per-shot verifier feedback for batch retries: { [shotIndex]: feedback } */
  retryFeedbackMap?: Record<number, string>;
  /** Optional LoRA name to apply for video keyframe generation */
  loraName?: string;
  /** Optional LoRA trigger words to prepend to keyframe prompts */
  loraTriggerWords?: string;
}

// ============================================================================
// PROCESSOR
// ============================================================================

const LOG_PREFIX = '[VideoGen]';

export const videoGenProcessor: Processor<VideoGenJobData> = async (
  job: Job<VideoGenJobData>
) => {
  const { taskId, userId, videoId, aspectRatio = '16:9', loraName, loraTriggerWords } = job.data;
  // Video-gen is always dispatched from the orchestrator with names like 'video-shot-1'.
  // Skip task-level progress updates to avoid overwriting the orchestrator's progress.
  const isClosedLoop = true;

  console.log(`${LOG_PREFIX} Starting for video ${videoId}`);

  const costTracker = new CostTracker(6); // Step 6 in the pipeline

  try {
    const result = await costTracker.run(async () => {
      const supabase = getSupabaseServiceClient();

      // =====================================================================
      // STEP 1: Fetch shot data + keyframe images from metadata
      // =====================================================================
      console.log(`${LOG_PREFIX} Step 1: Loading shot data and keyframe images...`);

      if (!isClosedLoop) {
        await updateTaskStatus(taskId, {
          status: 'running',
          current_step: 'Loading shots for video generation...',
          progress_percent: 5,
        });
      }

      const { data: video } = await supabase
        .from('video_projects')
        .select('metadata')
        .eq('id', videoId)
        .single();

      const metadata = (video?.metadata || {}) as Record<string, unknown>;

      // Get shots — primary: shot_plan (matches orchestrator), fallback: av_script_part1 (legacy)
      const shotPlanData = metadata.shot_plan as { shots?: Array<Record<string, unknown>> } | undefined;
      const avScriptFallback = metadata.av_script_part1 as { shots?: Array<Record<string, unknown>> } | undefined;
      const allShots = shotPlanData?.shots || avScriptFallback?.shots || [];

      // Get keyframe images from the image-gen worker's output
      const generatedImages = (metadata.generated_images || {}) as Record<string, string>;

      // Filter to only video shots
      let videoShots = allShots.filter(
        (s: Record<string, unknown>) => (s.media_type as string) === 'video'
      );

      // Support both single-shot and batch retries
      const { singleShotIndex, previousFeedback, retryShotIndices, retryFeedbackMap } = job.data;
      const isSingleShotRetry = typeof singleShotIndex === 'number';
      const isBatchRetry = Array.isArray(retryShotIndices) && retryShotIndices.length > 0;
      const isRetry = isSingleShotRetry || isBatchRetry;

      if (isBatchRetry) {
        // Batch retry: filter to all failed shots at once (one GPU pass instead of N)
        const retrySet = new Set(retryShotIndices);
        videoShots = allShots.filter(
          (s: Record<string, unknown>) => retrySet.has(s.segment_index as number)
        );
        console.log(`${LOG_PREFIX} Batch retry: regenerating ${videoShots.length} shots [${retryShotIndices.join(', ')}]`);
      } else if (isSingleShotRetry) {
        videoShots = videoShots.filter(
          (s: Record<string, unknown>) => (s.segment_index as number) === singleShotIndex
        );
        // Fallback: MG-to-video conversions still have media_type 'motion_graphics'
        // in the DB, so also search allShots when the shot isn't in the video-only list.
        if (videoShots.length === 0) {
          videoShots = allShots.filter(
            (s: Record<string, unknown>) => (s.segment_index as number) === singleShotIndex
          );
        }
        if (videoShots.length === 0) {
          throw new Error(`Shot ${singleShotIndex} not found in video shots or allShots`);
        }
        console.log(`${LOG_PREFIX} Single-shot retry: regenerating only shot ${singleShotIndex}`);
      }

      if (videoShots.length === 0) {
        console.log(`${LOG_PREFIX} No video shots to generate`);
        if (!isClosedLoop) {
          await updateTaskStatus(taskId, {
            status: 'completed',
            current_step: 'No video shots to generate',
            progress_percent: 100,
          });
        }
        return { success: true, videoId, stats: { videosGenerated: 0, videosFailed: 0 } };
      }

      // =====================================================================
      // STEP 2: Wire keyframe images as start frames for FF2V
      // =====================================================================
      console.log(`${LOG_PREFIX} Step 2: Wiring keyframe images for ${videoShots.length} video shots...`);

      const gpuShots: ShotForGpuGeneration[] = videoShots.map((s: Record<string, unknown>) => {
        const segmentIndex = s.segment_index as number;
        const keyframeUrl = generatedImages[`shot-${segmentIndex}`];

        // For retries, check if the verifier suggested prompt simplification
        // (catastrophic failures like frozen/corrupted video are often caused by overly complex prompts)
        let feedbackPrefix = '';
        let shouldSimplify = false;
        if (isBatchRetry && retryFeedbackMap?.[segmentIndex]) {
          const feedback = retryFeedbackMap[segmentIndex];
          shouldSimplify = feedback.includes('SIMPLIFY_PROMPT');
          feedbackPrefix = shouldSimplify ? '' : `[RETRY GUIDANCE: ${feedback}] `;
        } else if (isSingleShotRetry && previousFeedback) {
          shouldSimplify = previousFeedback.includes('SIMPLIFY_PROMPT');
          feedbackPrefix = shouldSimplify ? '' : `[RETRY GUIDANCE: ${previousFeedback}] `;
        }

        // Build the visual prompt — simplify if verifier flagged prompt complexity as the issue
        const fullPrompt = (s.visual_prompt as string) || (s.summary as string) || `Video for segment ${segmentIndex}`;
        let visualPrompt: string;
        if (shouldSimplify) {
          // Strip to first sentence only — removes complex lighting/mood/camera details
          const firstSentence = fullPrompt.split(/[.!?]/)[0]?.trim() || fullPrompt;
          visualPrompt = firstSentence;
          console.log(`${LOG_PREFIX} Shot ${segmentIndex}: Simplified prompt for retry (was ${fullPrompt.length} chars → ${visualPrompt.length} chars)`);
        } else {
          visualPrompt = feedbackPrefix + fullPrompt;
        }

        return {
          segment_index: segmentIndex,
          media_type: 'video' as const,
          visual_prompt: visualPrompt,
          duration_seconds: (() => {
            const d = s.duration_seconds as number;
            if (!d || d <= 0) throw new Error(`[VideoGen] Shot ${segmentIndex} has no valid duration_seconds — shot plan timing is incomplete.`);
            return d;
          })(),
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

      if (!isClosedLoop) {
        await updateTaskStatus(taskId, {
          status: 'running',
          current_step: `Generating ${gpuShots.length} videos...`,
          progress_percent: 15,
        });
      }

      const onProgress = async (message: string, percent: number) => {
        console.log(`${LOG_PREFIX} Progress: ${message} (${percent}%)`);
        if (!isClosedLoop) {
          await updateTaskStatus(taskId, {
            status: 'running',
            current_step: message,
            progress_percent: 15 + Math.round(percent * 0.7),
          });
        }
      };

      const onItemComplete = async (event: ItemCompleteEvent) => {
        const label = event.mediaType === 'image' ? 'Keyframes' : 'Videos';
        console.log(`${LOG_PREFIX} ${label}: ${event.completed}/${event.total}`);
      };

      // Acquire per-user GPU lock to prevent VRAM mode thrashing
      // when multiple pipelines for the same user run concurrently
      const totalVideoDuration = gpuShots.reduce((sum, s) => sum + (s.duration_seconds || 0), 0);
      const avgDuration = totalVideoDuration / gpuShots.length;
      const lockTtlMs = calculateTimeout('video_generation', gpuShots.length, {
        avgDurationSec: avgDuration,
        totalVideoDurationSec: totalVideoDuration,
      }) + MODE_SWITCH_TIMEOUT_MS + 60_000;

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
          // Stream each completed video to the orchestrator via EventEmitter
          (result) => emitVideoItemComplete(videoId, result),
        );
      }, lockTtlMs, videoId);

      // Track GPU cost (~8s per video on A100)
      costTracker.addGpuTime(gpuResult.stats.videosGenerated * 8);

      // =====================================================================
      // STEP 4: Persist results
      // =====================================================================
      console.log(`${LOG_PREFIX} Step 4: Persisting video results...`);

      const videoResults: Record<string, string> = {};
      for (const r of gpuResult.results) {
        if (r.generation_status === 'completed') {
          videoResults[`shot-${r.shot_index}`] = r.media_url;
        }
      }

      // For retries (single or batch), merge into existing videos.
      // The merge_video_metadata RPC does a shallow JSONB merge (||),
      // so we need to fetch existing videos for the merge if retrying.
      let mergedVideos = videoResults;
      if (isRetry) {
        const { data: existingData } = await supabase
          .from('video_projects')
          .select('metadata')
          .eq('id', videoId)
          .single();
        const existingMeta = (existingData?.metadata || {}) as Record<string, unknown>;
        const existingVideos = (existingMeta.generated_videos || {}) as Record<string, string>;
        mergedVideos = { ...existingVideos, ...videoResults };
      }

      // Atomic merge — prevents race with concurrent metadata writes
      await supabase.rpc('merge_video_metadata', {
        p_video_id: videoId,
        p_updates: {
          generated_videos: mergedVideos,
          video_gen_stats: gpuResult.stats,
        },
      });

      if (!isClosedLoop) {
        await updateTaskStatus(taskId, {
          status: 'completed',
          current_step: `Video generation complete: ${gpuResult.stats.videosGenerated} generated, ${gpuResult.stats.videosFailed} failed`,
          progress_percent: 100,
        });
      }

      console.log(`${LOG_PREFIX} ✅ Complete: ${gpuResult.stats.videosGenerated} videos`);

      // For retries, 0 generated means the retry definitively failed.
      if (isRetry && gpuResult.stats.videosGenerated === 0) {
        const shotLabel = isBatchRetry ? `batch [${retryShotIndices!.join(', ')}]` : `shot ${singleShotIndex}`;
        throw new Error(`Retry for ${shotLabel} failed: 0 videos generated`);
      }

      // For single-shot retries, include the generated URL (orchestrator checks retryResult.mediaUrl).
      // For batch retries, include all generated URLs as a map.
      const retryMediaUrl = isSingleShotRetry
        ? videoResults[`shot-${singleShotIndex}`]
        : undefined;

      return {
        success: true,
        videoId,
        ...(retryMediaUrl ? { mediaUrl: retryMediaUrl } : {}),
        ...(isBatchRetry ? { retryResults: videoResults } : {}),
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

    if (!isClosedLoop) {
      await updateTaskStatus(taskId, {
        status: 'failed',
        current_step: 'Video generation failed',
        progress_percent: 0,
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    throw error;
  }
};
