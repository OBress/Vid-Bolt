/**
 * Outline Generation Worker
 * ============================================================================
 * BullMQ worker for the outline generation pipeline (Phases 1-4).
 *
 * This worker handles:
 * 1. Research & Analysis
 * 2. Content Scoping
 * 3. Spine Generation
 * 4. Asset Registry
 *
 * Output is stored in `video_projects.metadata` for user review and editing.
 */

import { Job, Processor } from 'bullmq';
import {
  getSupabaseServiceClient,
  addTaskStep,
  updateStepStatus,
  completeStep,
  failStep,
  updateTaskStatus,
} from '@/lib/queues/shared';
import { STEP_ORDER } from '@/lib/queues/writing/constants';

// Phase imports
import { executeResearchPhase } from '@/lib/queues/writing/research';
import { executeScopingPhase } from '@/lib/queues/writing/scoping';
import { generateSpine } from '@/lib/queues/writing/spine';
import { generateAssetRegistry } from '@/lib/queues/writing/assets';

// Type imports
import type {
  UniversalScriptInput,
  Spine,
  AssetRegistry,
  ResearchDossier,
  DurationDecision,
} from '@/lib/queues/writing/types';

import { CostTracker } from '@/lib/queues/cost-tracker';

// ============================================================================
// JOB DATA & OUTPUT INTERFACES
// ============================================================================

export interface OutlineJobData {
  taskId: string;
  userId: string;
  videoId: string;
  input: UniversalScriptInput;
}

export interface OutlineOutput {
  researchDossier?: ResearchDossier;
  durationDecision: DurationDecision;
  spine: Spine;
  assetRegistry: AssetRegistry;
}

// ============================================================================
// PROCESSOR
// ============================================================================

export const outlineProcessor: Processor<OutlineJobData> = async (
  job: Job<OutlineJobData>
) => {
  const { taskId, userId, videoId, input } = job.data;

  console.log(`[Outline] Starting job ${job.id} for task ${taskId}`);
  console.log(`[Outline] Topic: ${input.topic.substring(0, 50)}...`);
  console.log(
    `[Outline] Genre: ${input.genre}, Duration: ${input.durationRange.minMinutes}-${input.durationRange.maxMinutes} min`
  );

  // Cost tracking for Step 1 (Outline)
  const costTracker = new CostTracker(1);

  // Store results across phases
  let researchDossier: ResearchDossier | null = null;
  let durationDecision: DurationDecision | null = null;
  let spine: Spine | null = null;
  let assetRegistry: AssetRegistry | null = null;

  const supabase = getSupabaseServiceClient();

  try {
    // Wrap in costTracker.run() so all LLM calls are automatically recorded
    const result = await costTracker.run(async () => {
    // Update task status to in progress
    await updateTaskStatus(taskId, {
      status: 'running',
      current_phase: 'preprocessing',
      current_step: 'Research & Analysis',
      progress_percent: 0,
      started_at: new Date().toISOString(),
    });

    // =========================================================================
    // PHASE 1: RESEARCH & ANALYSIS
    // =========================================================================
    {
      const stepId = await addTaskStep(
        taskId,
        'preprocessing',
        'Research & Analysis',
        STEP_ORDER.UNIVERSAL_TOPIC_DECOMPOSITION
      );

      await updateStepStatus(taskId, stepId, { status: 'running' });

      // Track last progress update to throttle DB writes (~30s interval)
      let lastProgressUpdate = 0;

      try {
        const result = await executeResearchPhase({
          userId,
          topic: input.topic,
          genre: input.genre,
          researchToggle: input.researchToggle,
          angle: input.angle,
          sourcePreferences: input.sourcePreferences,
          openrouterModel: input.openrouterModel,
          useValyu: true, // Enable Valyu for V2 fields (narrative, keyDevelopments, entitiesV2)
          onProgress: async (_status: string, elapsedMs: number) => {
            // Update progress_percent from 1-24% over ~10 minutes during research
            // Throttle to at most once every 30 seconds to avoid excessive DB writes
            const now = Date.now();
            if (now - lastProgressUpdate < 30_000) return;
            lastProgressUpdate = now;

            const expectedDurationMs = 10 * 60 * 1000; // 10 minutes expected
            const researchProgress = Math.min(24, Math.round((elapsedMs / expectedDurationMs) * 25));
            // Only update if progress actually moved
            if (researchProgress > 0) {
              await updateTaskStatus(taskId, {
                progress_percent: researchProgress,
              });
            }
          },
        });

        await completeStep(taskId, stepId);
        researchDossier = result.dossier;

        // Track Valyu usage — research phase typically makes 2-4 Valyu calls
        if (input.researchToggle !== 'off') {
          costTracker.addValyuSearch(3); // Default Valyu search count
        }
      } catch (error) {
        await failStep(taskId, stepId, String(error));
        throw error;
      }
    }

    // =========================================================================
    // PHASE 2: CONTENT SCOPING & DURATION
    // =========================================================================
    await updateTaskStatus(taskId, {
      current_phase: 'preprocessing',
      current_step: 'Content Scoping',
      progress_percent: 25,
    });

    {
      const stepId = await addTaskStep(
        taskId,
        'preprocessing',
        'Content Scoping',
        STEP_ORDER.UNIVERSAL_CONTENT_DENSITY_ANALYSIS
      );

      await updateStepStatus(taskId, stepId, { status: 'running' });

      try {
        const result = await executeScopingPhase({
          dossier: researchDossier,
          durationRange: input.durationRange,
          genre: input.genre,
          topic: input.topic,
          mustInclude: input.mustInclude,
        });

        await completeStep(taskId, stepId);
        durationDecision = result.durationDecision;
      } catch (error) {
        await failStep(taskId, stepId, String(error));
        throw error;
      }
    }

    // =========================================================================
    // PHASE 3: SPINE GENERATION
    // =========================================================================
    await updateTaskStatus(taskId, {
      current_phase: 'writing',
      current_step: 'Spine Generation',
      progress_percent: 50,
    });

    {
      const stepId = await addTaskStep(
        taskId,
        'writing',
        'Spine Generation',
        STEP_ORDER.UNIVERSAL_SPINE_BEAT_GENERATION
      );

      await updateStepStatus(taskId, stepId, { status: 'running' });

      try {
        const result = await generateSpine({
          userId,
          topic: input.topic,
          genre: input.genre,
          durationDecision: durationDecision!,
          dossier: researchDossier,
          angle: input.angle,
          mustInclude: input.mustInclude,
          mustAvoid: input.mustAvoid,
          openrouterModel: input.openrouterModel,
        });

        await completeStep(taskId, stepId);
        spine = result.spine;
      } catch (error) {
        await failStep(taskId, stepId, String(error));
        throw error;
      }
    }

    // =========================================================================
    // PHASE 4: ASSET REGISTRY
    // =========================================================================
    await updateTaskStatus(taskId, {
      current_phase: 'writing',
      current_step: 'Asset Registry',
      progress_percent: 75,
    });

    {
      const stepId = await addTaskStep(
        taskId,
        'writing',
        'Asset Registry',
        STEP_ORDER.UNIVERSAL_ASSET_CHARACTER_PROFILES
      );

      await updateStepStatus(taskId, stepId, { status: 'running' });

      try {
        const result = await generateAssetRegistry({
          userId,
          topic: input.topic,
          genre: input.genre,
          spine: spine!,
          dossier: researchDossier,
        });

        await completeStep(taskId, stepId);
        assetRegistry = result.registry;
      } catch (error) {
        await failStep(taskId, stepId, String(error));
        throw error;
      }
    }

    // =========================================================================
    // FINALIZE - Save to video_projects.metadata
    // =========================================================================
    console.log(`[Outline:Finalize] Preparing output for task ${taskId}`);

    const output: OutlineOutput = {
      researchDossier: researchDossier || undefined,
      durationDecision: durationDecision!,
      spine: spine!,
      assetRegistry: assetRegistry!,
    };

    // Save to tasks table
    const { error: taskError } = await supabase
      .from('tasks')
      .update({
        output_data: output,
        status: 'completed',
        progress_percent: 100,
        completed_at: new Date().toISOString(),
      })
      .eq('id', taskId);

    if (taskError) {
      console.error(`[Outline:Finalize] Task DB UPDATE FAILED:`, taskError);
      throw new Error(`Failed to save task output: ${taskError.message}`);
    }

    // Save to video_projects.metadata for persistence between steps
    // Uses merge_video_metadata RPC to preserve existing fields (e.g. thumbnail_svg)
    const { error: videoError } = await supabase.rpc('merge_video_metadata', {
      p_video_id: videoId,
      p_updates: {
        outlineOutput: output,
        outlineConfig: input,
      },
    });

    if (videoError) {
      console.error(`[Outline:Finalize] Video DB UPDATE FAILED:`, videoError);
      throw new Error(`Failed to save video metadata: ${videoError.message}`);
    }

    return {
      success: true,
      taskId,
      videoId,
      beatCount: spine?.beats?.length || 0,
      assetCount:
        (assetRegistry?.characters?.length || 0) +
        (assetRegistry?.locations?.length || 0) +
        (assetRegistry?.objects?.length || 0),
    };
    }); // end costTracker.run()

    // Save cost data (non-blocking, won't fail the pipeline)
    await costTracker.save(videoId);

    console.log(`[Outline] Workflow completed for task ${taskId}`);
    return result;
  } catch (error) {
    console.error(`[Outline] Workflow failed for task ${taskId}:`, error);

    // Still try to save partial cost data on failure
    await costTracker.save(videoId);

    await updateTaskStatus(taskId, {
      status: 'failed',
      error_message: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
};
