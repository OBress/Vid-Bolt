/**
 * Shot Planner Worker
 * ============================================================================
 * Specialized worker extracted from av-script.ts Part 1.
 *
 * Input:  Locked script + TTS word timestamps
 * Output: Structured ShotPlan JSON with media types and temporal alignment
 *
 * This worker focuses purely on:
 *   1. Analyzing content structure (via analyzer.ts)
 *   2. Segmenting the timeline (via segmenter.ts)
 *   3. Assigning media types and content types
 *   4. Producing a structured ShotPlan
 *
 * It does NOT:
 *   - Search for stock media (that's Asset Scout)
 *   - Generate AI prompts (that's Asset Scout)
 *   - Trigger GPU jobs (that's image-gen / video-gen)
 */

import { Job, Processor } from 'bullmq';
import { getSupabaseServiceClient, updateTaskStatus } from '@/lib/queues/shared';
import { analyzeContentStructure, segmentTimeline } from '@/lib/av-script';
import { processInChunks } from '@/lib/av-script/chunked-processor';
import type { ShotListInput } from '@/lib/av-script/types';
import type { WordTimestamp } from '@/types/task';
import type { PlannedShot, ShotPlan } from '@/lib/types/closed-loop';
import { CostTracker } from '@/lib/queues/cost-tracker';

// ============================================================================
// JOB DATA INTERFACE
// ============================================================================

export interface ShotPlannerJobData {
  taskId: string;
  userId: string;
  videoId: string;
  /** The locked script content */
  script: string;
  /** Word-level TTS timestamps */
  wordTimestamps: WordTimestamp[];
  /** Total audio duration in seconds */
  totalDurationSeconds: number;
  /** Creative manifest aspect ratio */
  aspectRatio?: '16:9' | '9:16';
  /** System prompt from the Orchestrator's Dynamic Prompt Generator */
  systemPrompt?: string;
}

// ============================================================================
// PROCESSOR
// ============================================================================

const LOG_PREFIX = '[ShotPlanner]';

export const shotPlannerProcessor: Processor<ShotPlannerJobData> = async (
  job: Job<ShotPlannerJobData>
) => {
  const { taskId, userId, videoId, script, wordTimestamps, totalDurationSeconds } = job.data;

  console.log(`${LOG_PREFIX} Starting for video ${videoId} (${wordTimestamps.length} words, ${totalDurationSeconds}s)`);

  const costTracker = new CostTracker(3); // Step 3 in the pipeline

  try {
    const result = await costTracker.run(async () => {
      const supabase = getSupabaseServiceClient();

      // =====================================================================
      // STEP 1: Content structure analysis
      // =====================================================================
      console.log(`${LOG_PREFIX} Step 1: Analyzing content structure...`);

      await updateTaskStatus(taskId, {
        status: 'running',
        current_step: 'Analyzing content structure...',
        progress_percent: 10,
      });

      const analysis = analyzeContentStructure(
        script,
        wordTimestamps
      );

      console.log(`${LOG_PREFIX} Content analysis: ${analysis.lists.length} lists, ${analysis.comparisons.length} comparisons, ${analysis.transitions.length} transitions`);

      // =====================================================================
      // STEP 2: Timeline segmentation
      // =====================================================================
      console.log(`${LOG_PREFIX} Step 2: Segmenting timeline...`);

      await updateTaskStatus(taskId, {
        status: 'running',
        current_step: 'Segmenting narration timeline...',
        progress_percent: 25,
      });

      const segments = segmentTimeline(wordTimestamps, analysis);
      console.log(`${LOG_PREFIX} Produced ${segments.length} temporal segments`);

      // =====================================================================
      // STEP 3: Chunked AI processing for shot summaries
      // =====================================================================
      console.log(`${LOG_PREFIX} Step 3: Generating shot summaries via chunked processing...`);

      await updateTaskStatus(taskId, {
        status: 'running',
        current_step: `Generating summaries for ${segments.length} shots...`,
        progress_percent: 40,
      });

      // Fetch outline assets from metadata for context
      const { data: video } = await supabase
        .from('video_projects')
        .select('metadata')
        .eq('id', videoId)
        .single();

      const metadata = (video?.metadata || {}) as Record<string, unknown>;
      const outlineAssets = metadata.outline_assets || {};

      const shotSummaries = await processInChunks(
        userId,
        segments,
        outlineAssets,
        undefined,
        async (progress: number, step: string) => {
          await updateTaskStatus(taskId, {
            status: 'running',
            current_step: step,
            progress_percent: 40 + Math.round(progress * 0.4),
          });
        }
      );

      console.log(`${LOG_PREFIX} Generated ${shotSummaries.length} shot summaries`);

      // =====================================================================
      // STEP 4: Build structured ShotPlan
      // =====================================================================
      console.log(`${LOG_PREFIX} Step 4: Building structured ShotPlan...`);

      await updateTaskStatus(taskId, {
        status: 'running',
        current_step: 'Building shot plan...',
        progress_percent: 85,
      });

      const plannedShots: PlannedShot[] = shotSummaries.map((shot, idx) => ({
        segment_index: shot.segment_index ?? idx,
        start_seconds: shot.start_seconds ?? 0,
        end_seconds: shot.end_seconds ?? 0,
        duration_seconds: shot.duration_seconds ?? 0,
        text: shot.text || '',
        summary: shot.summary || '',
        content_type: shot.content_type || 'concept',
        media_type: (shot.media_type as PlannedShot['media_type']) || 'motiongraphic',
        entity_refs: [],
        visual_elements: [],
        sound_effects: [],
        stock_worthy: false,
        image_count: 1,
      }));

      // Compute media type breakdown
      const mediaBreakdown: Record<string, number> = {};
      const contentBreakdown: Record<string, number> = {};
      for (const shot of plannedShots) {
        mediaBreakdown[shot.media_type] = (mediaBreakdown[shot.media_type] || 0) + 1;
        contentBreakdown[shot.content_type] = (contentBreakdown[shot.content_type] || 0) + 1;
      }

      const shotPlan: ShotPlan = {
        shots: plannedShots,
        metadata: {
          total_segments: plannedShots.length,
          total_duration_seconds: totalDurationSeconds,
          average_segment_duration: totalDurationSeconds / Math.max(1, plannedShots.length),
          content_type_breakdown: contentBreakdown,
          media_type_breakdown: mediaBreakdown,
        },
      };

      // =====================================================================
      // STEP 5: Persist to metadata
      // =====================================================================
      console.log(`${LOG_PREFIX} Step 5: Persisting shot plan to metadata...`);

      await supabase
        .from('video_projects')
        .update({
          metadata: {
            ...metadata,
            shot_plan: shotPlan,
            av_script_part1: {
              shots: shotSummaries,
              analysis,
            },
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', videoId);

      await updateTaskStatus(taskId, {
        status: 'completed',
        current_step: `Shot plan complete: ${plannedShots.length} shots`,
        progress_percent: 100,
      });

      console.log(`${LOG_PREFIX} ✅ Complete: ${plannedShots.length} shots planned`);

      return {
        success: true,
        videoId,
        output: shotPlan,
      };
    }); // end costTracker.run

    await costTracker.save(videoId);
    return result;

  } catch (error) {
    console.error(`${LOG_PREFIX} Failed for video ${videoId}:`, error);

    await costTracker.save(videoId);

    await updateTaskStatus(taskId, {
      status: 'failed',
      current_step: 'Shot planning failed',
      progress_percent: 0,
      error_message: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
};
