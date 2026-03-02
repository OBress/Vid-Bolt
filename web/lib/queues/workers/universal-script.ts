/**
 * Universal Script Workflow Worker
 * ============================================================================
 * BullMQ worker for the universal script generation pipeline.
 * 
 * Supports any genre and duration with factual accuracy, engagement optimization,
 * and visual asset consistency.
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
import { expandSpineToScript } from '@/lib/queues/writing/expansion';
import { assembleScript } from '@/lib/queues/writing/assembly';

// Type imports
import type { 
  UniversalScriptInput, 
  UniversalScriptOutput,
  Spine,
  AssetRegistry,
  ResearchDossier,
  DurationDecision,
  ExpandedBeat,
  QualityValidation,
} from '@/lib/queues/writing/types';

// ============================================================================
// JOB DATA INTERFACE
// ============================================================================

export interface UniversalScriptJobData {
  taskId: string;
  userId: string;
  input: UniversalScriptInput;
}

// ============================================================================
// PROCESSOR
// ============================================================================

export const universalScriptProcessor: Processor<UniversalScriptJobData> = async (job: Job<UniversalScriptJobData>) => {
  const { taskId, userId, input } = job.data;

  console.log(`[UniversalScript] Starting job ${job.id} for task ${taskId}`);
  console.log(`[UniversalScript] Topic: ${input.topic.substring(0, 50)}...`);
  console.log(`[UniversalScript] Genre: ${input.genre}, Duration: ${input.durationRange.minMinutes}-${input.durationRange.maxMinutes} min`);

  // Store results across phases
  let researchDossier: ResearchDossier | null = null;
  let durationDecision: DurationDecision | null = null;
  let spine: Spine | null = null;
  let assetRegistry: AssetRegistry | null = null;
  let expandedBeats: ExpandedBeat[] = [];
  let finalScript = '';
  let qualityValidation: QualityValidation | null = null;

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
        'preprocessing', // UNIVERSAL_PHASES.RESEARCH maps to preprocessing
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
      progress_percent: 15,
    });

    {
      const stepId = await addTaskStep(
        taskId,
        'preprocessing', // UNIVERSAL_PHASES.SCOPING maps to preprocessing
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
      progress_percent: 25,
    });

    {
      const stepId = await addTaskStep(
        taskId,
        'writing', // UNIVERSAL_PHASES.SPINE maps to writing
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
      progress_percent: 40,
    });

    {
      const stepId = await addTaskStep(
        taskId,
        'writing', // UNIVERSAL_PHASES.ASSETS maps to writing
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
    // PHASE 5: SCRIPT EXPANSION
    // =========================================================================
    await updateTaskStatus(taskId, {
      current_phase: 'writing',
      current_step: 'Script Expansion',
      progress_percent: 55,
    });

    {
      const stepId = await addTaskStep(
        taskId,
        'writing', // UNIVERSAL_PHASES.EXPANSION maps to writing
        'Script Expansion',
        STEP_ORDER.UNIVERSAL_EXPANSION_BEAT_BASE
      );

      await updateStepStatus(taskId, stepId, { status: 'running' });

      try {
        const result = await expandSpineToScript({
          userId,
          topic: input.topic,
          genre: input.genre,
          spine: spine!,
          dossier: researchDossier,
          assetRegistry: assetRegistry!,
          angle: input.angle,
          styleConfig: input.styleConfig,
        });

        await completeStep(taskId, stepId);
        expandedBeats = result.expandedBeats;

      } catch (error) {
        await failStep(taskId, stepId, String(error));
        throw error;
      }
    }

    // =========================================================================
    // PHASE 6: ASSEMBLY & VALIDATION
    // =========================================================================
    await updateTaskStatus(taskId, {
      current_phase: 'postprocessing',
      current_step: 'Assembly & Validation',
      progress_percent: 85,
    });

    {
      const stepId = await addTaskStep(
        taskId,
        'postprocessing', // UNIVERSAL_PHASES.ASSEMBLY maps to postprocessing
        'Assembly & Validation',
        STEP_ORDER.UNIVERSAL_ASSEMBLY_CONCATENATE
      );

      await updateStepStatus(taskId, stepId, { status: 'running' });

      try {
        const result = await assembleScript({
          userId,
          genre: input.genre,
          expandedBeats,
          spine: spine!,
          assetRegistry: assetRegistry!,
          dossier: researchDossier,
          durationDecision: durationDecision!,
        });

        await completeStep(taskId, stepId);
        finalScript = result.finalScript;
        qualityValidation = result.qualityValidation;

      } catch (error) {
        await failStep(taskId, stepId, String(error));
        throw error;
      }
    }

    // =========================================================================
    // FINALIZE
    // =========================================================================
    console.log(`[UniversalScript:Finalize] Preparing output for task ${taskId}`);
    console.log(`[UniversalScript:Finalize] finalScript length: ${finalScript?.length || 0} chars`);

    const output: UniversalScriptOutput = {
      researchDossier: researchDossier || undefined,
      durationDecision: durationDecision!,
      spine: spine!,
      assetRegistry: assetRegistry!,
      expandedBeats,
      finalScript,
      qualityValidation: qualityValidation!,
      beatTimingSheet: spine!.beats.map(beat => ({
        beatIndex: beat.index,
        startSeconds: beat.timing.startSeconds,
        endSeconds: beat.timing.endSeconds,
        type: beat.classification.type,
        summary: beat.contentSummary.substring(0, 100),
      })),
      visualCalloutList: expandedBeats.flatMap(beat => 
        beat.visualCallouts.map(callout => ({
          beatIndex: beat.beatIndex,
          assetId: callout.assetId,
          assetType: callout.assetId.startsWith('CHAR-') ? 'character' as const :
                    callout.assetId.startsWith('LOC-') ? 'location' as const : 'object' as const,
          context: callout.context,
        }))
      ),
    };

    // Save to database
    const supabase = getSupabaseServiceClient();
    
    const { error } = await supabase
      .from('tasks')
      .update({ 
        output_data: output,
        status: 'completed',
        progress_percent: 100,
        completed_at: new Date().toISOString(),
      })
      .eq('id', taskId);

    if (error) {
      console.error(`[UniversalScript:Finalize] DB UPDATE FAILED:`, error);
      throw new Error(`Failed to save output: ${error.message}`);
    }

    console.log(`[UniversalScript] Workflow completed for task ${taskId}`);

    return {
      success: true,
      taskId,
      wordCount: finalScript.split(/\s+/).length,
      beatCount: spine?.beats?.length || 0,
      qualityPassed: qualityValidation?.passed || false,
    };

  } catch (error) {
    console.error(`[UniversalScript] Workflow failed for task ${taskId}:`, error);
    
    await updateTaskStatus(taskId, {
      status: 'failed',
      error_message: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
};
