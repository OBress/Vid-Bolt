/**
 * Script Writing Worker
 * ============================================================================
 * BullMQ worker for the script writing pipeline (Phases 5-6).
 *
 * This worker handles:
 * 5. Script Expansion (from Spine + Assets + Research)
 * 6. Assembly & Validation
 *
 * Input comes from `video_projects.metadata.outlineOutput`.
 * Output is stored in `video_projects.metadata.scriptOutput` and `script_content`.
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
import { expandSpineToScript } from '@/lib/queues/writing/expansion';
import { assembleScript } from '@/lib/queues/writing/assembly';

// Type imports
import type {
  Spine,
  AssetRegistry,
  ResearchDossier,
  DurationDecision,
  ExpandedBeat,
  QualityValidation,
  ScriptGenre,
  UniversalScriptOutput,
} from '@/lib/queues/writing/types';

// ============================================================================
// JOB DATA & OUTPUT INTERFACES
// ============================================================================

export interface ScriptWritingJobData {
  taskId: string;
  userId: string;
  videoId: string;
  // Input from Step 1 (outline output)
  outlineData: {
    researchDossier?: ResearchDossier;
    durationDecision: DurationDecision;
    spine: Spine;
    assetRegistry: AssetRegistry;
  };
  // Config from Step 1
  config: {
    topic: string;
    genre: ScriptGenre;
    angle?: string;
  };
}

export interface ScriptWritingOutput {
  expandedBeats: ExpandedBeat[];
  finalScript: string;
  qualityValidation: QualityValidation;
  beatTimingSheet: Array<{
    beatIndex: number;
    startSeconds: number;
    endSeconds: number;
    type: string;
    summary: string;
  }>;
  visualCalloutList: Array<{
    beatIndex: number;
    assetId: string;
    assetType: 'character' | 'location' | 'object';
    context: string;
  }>;
}

// ============================================================================
// PROCESSOR
// ============================================================================

export const scriptWritingProcessor: Processor<ScriptWritingJobData> = async (
  job: Job<ScriptWritingJobData>
) => {
  const { taskId, userId, videoId, outlineData, config } = job.data;

  console.log(`[ScriptWriting] Starting job ${job.id} for task ${taskId}`);
  console.log(`[ScriptWriting] Topic: ${config.topic.substring(0, 50)}...`);
  console.log(
    `[ScriptWriting] Spine has ${outlineData.spine?.beats?.length || 0} beats`
  );

  // Store results across phases
  let expandedBeats: ExpandedBeat[] = [];
  let finalScript = '';
  let qualityValidation: QualityValidation | null = null;

  const supabase = getSupabaseServiceClient();

  try {
    // Get beat count for progress calculation
    const _totalBeats = outlineData.spine?.beats?.length || 1;
    
    // Progress distribution:
    // 0-5%   = Initialization
    // 5-55%  = Beat expansion (50% of total, split evenly across beats)
    // 55-60% = Quality rating
    // 60-65% = Low-score rewrites
    // 65-95% = Assembly (4 sub-steps, 7.5% each)
    // 95-100% = Finalization

    // Update task status to in progress
    await updateTaskStatus(taskId, {
      status: 'running',
      current_phase: 'writing',
      current_step: 'Initializing script generation...',
      progress_percent: 5,
      started_at: new Date().toISOString(),
    });

    // =========================================================================
    // PHASE 5: SCRIPT EXPANSION
    // =========================================================================
    {
      const stepId = await addTaskStep(
        taskId,
        'writing',
        'Script Expansion',
        STEP_ORDER.UNIVERSAL_EXPANSION_BEAT_BASE
      );

      await updateStepStatus(taskId, stepId, { status: 'running' });

      try {
        // Create progress callback for expansion phase
        const expansionProgress = async (beatIndex: number, totalBeats: number, step: string) => {
          // Calculate progress: 5-55% for beats, 55-65% for quality/rewrites
          let progressPercent: number;
          
          if (step.startsWith('Expanding beat')) {
            // Beat expansion: 5% to 55% (50% total, split evenly)
            progressPercent = 5 + Math.round((beatIndex / totalBeats) * 50);
          } else if (step.includes('Rating')) {
            progressPercent = 57;
          } else if (step.includes('Refining')) {
            progressPercent = 62;
          } else {
            progressPercent = 55;
          }
          
          await updateTaskStatus(taskId, {
            current_step: step,
            progress_percent: progressPercent,
          });
        };

        const result = await expandSpineToScript({
          userId,
          topic: config.topic,
          genre: config.genre,
          spine: outlineData.spine,
          dossier: outlineData.researchDossier || null,
          assetRegistry: outlineData.assetRegistry,
          angle: config.angle,
          onProgress: expansionProgress,
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
      progress_percent: 70,
    });

    {
      const stepId = await addTaskStep(
        taskId,
        'postprocessing',
        'Assembly & Validation',
        STEP_ORDER.UNIVERSAL_ASSEMBLY_CONCATENATE
      );

      await updateStepStatus(taskId, stepId, { status: 'running' });

      try {
        // Create progress callback for assembly phase
        const assemblyProgress = async (step: string, substepIndex: number, totalSubsteps: number) => {
          // Assembly: 65% to 95% (30% total, split across 4 sub-steps)
          const progressPercent = 65 + Math.round((substepIndex / totalSubsteps) * 30);
          
          await updateTaskStatus(taskId, {
            current_step: step,
            progress_percent: progressPercent,
          });
        };

        const result = await assembleScript({
          userId,
          genre: config.genre,
          expandedBeats,
          spine: outlineData.spine,
          assetRegistry: outlineData.assetRegistry,
          dossier: outlineData.researchDossier || null,
          durationDecision: outlineData.durationDecision,
          onProgress: assemblyProgress,
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
    await updateTaskStatus(taskId, {
      current_step: 'Saving script...',
      progress_percent: 95,
    });
    
    console.log(`[ScriptWriting:Finalize] Preparing output for task ${taskId}`);
    console.log(
      `[ScriptWriting:Finalize] finalScript length: ${finalScript?.length || 0} chars`
    );

    const output: ScriptWritingOutput = {
      expandedBeats,
      finalScript,
      qualityValidation: qualityValidation!,
      beatTimingSheet: outlineData.spine.beats.map((beat) => ({
        beatIndex: beat.index,
        startSeconds: beat.timing.startSeconds,
        endSeconds: beat.timing.endSeconds,
        type: beat.classification.type,
        summary: beat.contentSummary.substring(0, 100),
      })),
      visualCalloutList: expandedBeats.flatMap((beat) =>
        beat.visualCallouts.map((callout) => ({
          beatIndex: beat.beatIndex,
          assetId: callout.assetId,
          assetType: callout.assetId.startsWith('CHAR-')
            ? ('character' as const)
            : callout.assetId.startsWith('LOC-')
              ? ('location' as const)
              : ('object' as const),
          context: callout.context,
        }))
      ),
    };

    // Create the full universal script output for compatibility
    const typedBeatTimingSheet = outlineData.spine.beats.map((beat) => ({
      beatIndex: beat.index,
      startSeconds: beat.timing.startSeconds,
      endSeconds: beat.timing.endSeconds,
      type: beat.classification.type,
      summary: beat.contentSummary.substring(0, 100),
    }));

    const fullOutput: UniversalScriptOutput = {
      researchDossier: outlineData.researchDossier,
      durationDecision: outlineData.durationDecision,
      spine: outlineData.spine,
      assetRegistry: outlineData.assetRegistry,
      expandedBeats,
      finalScript,
      qualityValidation: qualityValidation!,
      beatTimingSheet: typedBeatTimingSheet,
      visualCalloutList: expandedBeats.flatMap((beat) =>
        beat.visualCallouts.map((callout) => ({
          beatIndex: beat.beatIndex,
          assetId: callout.assetId,
          assetType: callout.assetId.startsWith('CHAR-')
            ? ('character' as const)
            : callout.assetId.startsWith('LOC-')
              ? ('location' as const)
              : ('object' as const),
          context: callout.context,
        }))
      ),
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
      console.error(
        `[ScriptWriting:Finalize] Task DB UPDATE FAILED:`,
        taskError
      );
      throw new Error(`Failed to save task output: ${taskError.message}`);
    }

    // Save to video_projects for persistence
    // Merge with existing metadata (preserve outlineOutput, add scriptOutput)
    const { data: currentVideo, error: fetchError } = await supabase
      .from('video_projects')
      .select('metadata')
      .eq('id', videoId)
      .single();

    if (fetchError) {
      console.error(
        `[ScriptWriting:Finalize] Video FETCH FAILED:`,
        fetchError
      );
    }

    const existingMetadata = (currentVideo?.metadata as Record<string, unknown>) || {};

    const { error: videoError } = await supabase
      .from('video_projects')
      .update({
        script_content: finalScript,
        metadata: {
          ...existingMetadata,
          scriptOutput: output,
          universalScriptOutput: fullOutput, // For backward compatibility
        },
        // Note: current_stage is NOT updated here - it's updated in the wizard when user navigates
      })
      .eq('id', videoId);

    if (videoError) {
      console.error(
        `[ScriptWriting:Finalize] Video DB UPDATE FAILED:`,
        videoError
      );
      throw new Error(`Failed to save video metadata: ${videoError.message}`);
    }

    console.log(`[ScriptWriting] Workflow completed for task ${taskId}`);

    return {
      success: true,
      taskId,
      videoId,
      wordCount: finalScript.split(/\s+/).length,
      beatCount: expandedBeats.length,
      qualityPassed: qualityValidation?.passed || false,
    };
  } catch (error) {
    console.error(`[ScriptWriting] Workflow failed for task ${taskId}:`, error);

    await updateTaskStatus(taskId, {
      status: 'failed',
      error_message: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
};
