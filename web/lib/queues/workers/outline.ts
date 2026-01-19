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

  // Store results across phases
  let researchDossier: ResearchDossier | null = null;
  let durationDecision: DurationDecision | null = null;
  let spine: Spine | null = null;
  let assetRegistry: AssetRegistry | null = null;

  const supabase = getSupabaseServiceClient();

  try {
    // Update task status to in progress
    await updateTaskStatus(taskId, {
      status: 'running',
      current_phase: 'preprocessing',
      current_step: 'Research & Analysis',
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

      try {
        const result = await executeResearchPhase({
          userId,
          topic: input.topic,
          genre: input.genre,
          researchToggle: input.researchToggle,
          angle: input.angle,
          sourcePreferences: input.sourcePreferences,
        });

        await completeStep(taskId, stepId);
        researchDossier = result.dossier;
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
    const { error: videoError } = await supabase
      .from('video_projects')
      .update({
        metadata: {
          outlineOutput: output,
          outlineConfig: input,
        },
        current_stage: input.stockMediaLevel === 'none' ? 'script' : 'stock', // Skip if 'none', else Step 2
      })
      .eq('id', videoId);

    if (videoError) {
      console.error(`[Outline:Finalize] Video DB UPDATE FAILED:`, videoError);
      throw new Error(`Failed to save video metadata: ${videoError.message}`);
    }

    console.log(`[Outline] Workflow completed for task ${taskId}`);

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
  } catch (error) {
    console.error(`[Outline] Workflow failed for task ${taskId}:`, error);

    await updateTaskStatus(taskId, {
      status: 'failed',
      error_message: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
};
