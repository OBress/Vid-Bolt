/**
 * Universal Script Generation Workflow
 * ============================================================================
 * Main Inngest function for the 6-phase universal script generation pipeline.
 * 
 * Supports any genre and duration with factual accuracy, engagement optimization,
 * and visual asset consistency.
 */

import { inngest } from '../../client';
import { 
  getSupabaseServiceClient,
  addTaskStep,
  updateStepStatus,
  completeStep,
  failStep,
  updateTaskStatus,
} from '../shared';
import { STEP_ORDER, UNIVERSAL_PHASES } from './constants';

// Phase imports
import { executeResearchPhase } from './research';
import { executeScopingPhase } from './scoping';
import { generateSpine } from './spine';
import { generateAssetRegistry } from './assets';
import { expandSpineToScript } from './expansion';
import { assembleScript } from './assembly';

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
} from './types';

// ============================================================================
// EVENT TYPES
// ============================================================================

interface UniversalScriptStartEvent {
  name: 'universal-script/workflow.start';
  data: {
    taskId: string;
    userId: string;
    input: UniversalScriptInput;
  };
}

// ============================================================================
// MAIN WORKFLOW
// ============================================================================

export const universalScriptWorkflow = inngest.createFunction(
  {
    id: 'universal-script-workflow',
    retries: 3,
    concurrency: {
      limit: 3, // Limit concurrent workflows per user
      key: 'event.data.userId',
    },
  },
  { event: 'universal-script/workflow.start' },
  async ({ event, step }) => {
    const { taskId, userId, input } = event.data;

    console.log(`[UniversalScript] Starting workflow for task ${taskId}`);
    console.log(`[UniversalScript] Topic: ${input.topic.substring(0, 50)}...`);
    console.log(`[UniversalScript] Genre: ${input.genre}, Duration: ${input.durationRange.minMinutes}-${input.durationRange.maxMinutes} min`);

    // Store results across steps
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
        current_phase: 'preprocessing', // Mapped from RESEARCH to satisfy DB constraint
        current_step: 'Research & Analysis',
        started_at: new Date().toISOString(),
      });

      // =========================================================================
      // PHASE 1: RESEARCH & ANALYSIS
      // =========================================================================
      researchDossier = await step.run('research-phase', async () => {
        const stepId = await addTaskStep(
          taskId,
          UNIVERSAL_PHASES.RESEARCH as any,
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
          return result.dossier;

        } catch (error) {
          await failStep(taskId, stepId, String(error));
          throw error;
        }
      });

      // =========================================================================
      // PHASE 2: CONTENT SCOPING & DURATION
      // =========================================================================
      await updateTaskStatus(taskId, {
        current_phase: 'preprocessing', // Mapped from SCOPING
        current_step: 'Content Scoping',
        progress_percent: 15,
      });

      durationDecision = await step.run('scoping-phase', async () => {
        const stepId = await addTaskStep(
          taskId,
          UNIVERSAL_PHASES.SCOPING as any,
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
          return result.durationDecision;

        } catch (error) {
          await failStep(taskId, stepId, String(error));
          throw error;
        }
      });

      // =========================================================================
      // PHASE 3: SPINE GENERATION
      // =========================================================================
      await updateTaskStatus(taskId, {
        current_phase: 'writing', // Mapped from SPINE
        current_step: 'Spine Generation',
        progress_percent: 25,
      });

      spine = await step.run('spine-phase', async () => {
        const stepId = await addTaskStep(
          taskId,
          UNIVERSAL_PHASES.SPINE as any,
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
          return result.spine;

        } catch (error) {
          await failStep(taskId, stepId, String(error));
          throw error;
        }
      });

      // =========================================================================
      // PHASE 4: ASSET REGISTRY
      // =========================================================================
      await updateTaskStatus(taskId, {
        current_phase: 'writing', // Mapped from ASSETS
        current_step: 'Asset Registry',
        progress_percent: 40,
      });

      assetRegistry = await step.run('asset-phase', async () => {
        const stepId = await addTaskStep(
          taskId,
          UNIVERSAL_PHASES.ASSETS as any,
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
          return result.registry;

        } catch (error) {
          await failStep(taskId, stepId, String(error));
          throw error;
        }
      });

      // =========================================================================
      // PHASE 5: SCRIPT EXPANSION
      // =========================================================================
      await updateTaskStatus(taskId, {
        current_phase: 'writing', // Mapped from EXPANSION
        current_step: 'Script Expansion',
        progress_percent: 55,
      });

      expandedBeats = await step.run('expansion-phase', async () => {
        const stepId = await addTaskStep(
          taskId,
          UNIVERSAL_PHASES.EXPANSION as any,
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
          });

          await completeStep(taskId, stepId);
          return result.expandedBeats;

        } catch (error) {
          await failStep(taskId, stepId, String(error));
          throw error;
        }
      });

      // =========================================================================
      // PHASE 6: ASSEMBLY & VALIDATION
      // =========================================================================
      await updateTaskStatus(taskId, {
        current_phase: 'postprocessing', // Mapped from ASSEMBLY
        current_step: 'Assembly & Validation',
        progress_percent: 85,
      });

      const assemblyResult = await step.run('assembly-phase', async () => {
        const stepId = await addTaskStep(
          taskId,
          UNIVERSAL_PHASES.ASSEMBLY as any,
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
          return {
             finalScript: result.finalScript,
             qualityValidation: result.qualityValidation
          };

        } catch (error) {
          await failStep(taskId, stepId, String(error));
          throw error;
        }
      });
      
      finalScript = assemblyResult.finalScript;
      qualityValidation = assemblyResult.qualityValidation;

      // =========================================================================
      // FINALIZE
      // =========================================================================
      console.log(`[UniversalScript:Finalize] ENTERING finalize step for task ${taskId}`);
      console.log(`[UniversalScript:Finalize] finalScript length: ${finalScript?.length || 0} chars`);
      console.log(`[UniversalScript:Finalize] expandedBeats count: ${expandedBeats?.length || 0}`);
      
      // Prepare output inside the step (this gets cached, which is fine)
      const output = await step.run('finalize', async (): Promise<UniversalScriptOutput> => {
        console.log(`[UniversalScript:Finalize] INSIDE step.run - preparing output data`);
        
        const outputData: UniversalScriptOutput = {
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

        console.log(`[UniversalScript:Finalize] Output prepared, finalScript: ${outputData.finalScript?.length || 0} chars`);
        return outputData;
      });
      
      console.log(`[UniversalScript:Finalize] Step complete, now updating DB (this runs every time, not cached)`);
      
      // DB UPDATE HAPPENS OUTSIDE THE STEP - this ensures it runs every time the function is invoked
      // even when steps return cached results
      const supabase = getSupabaseServiceClient();
      
      console.log(`[UniversalScript:Finalize] Attempting DB update for task ${taskId}...`);
      const { error, data } = await supabase
        .from('tasks')
        .update({ 
          output_data: output,
          status: 'completed',
          progress_percent: 100,
          completed_at: new Date().toISOString(),
        })
        .eq('id', taskId)
        .select('id, status, progress_percent');

      console.log(`[UniversalScript:Finalize] DB update result - error: ${error?.message || 'none'}, data: ${JSON.stringify(data)}`);

      if (error) {
        console.error(`[UniversalScript:Finalize] DB UPDATE FAILED:`, error);
        throw new Error(`Failed to save output: ${error.message}`);
      }

      console.log(`[UniversalScript:Finalize] SUCCESS - task ${taskId} updated to completed`);
      console.log(`[UniversalScript] Workflow completed for task ${taskId}`);

      return {
        success: true,
        taskId,
        wordCount: finalScript.split(/\s+/).length,
        beatCount: (spine as any)?.beatCount || 0,
        qualityPassed: (qualityValidation as any)?.passed || false,
      };

    } catch (error) {
      console.error(`[UniversalScript] Workflow failed for task ${taskId}:`, error);
      
      await updateTaskStatus(taskId, {
        status: 'failed',
        error_message: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }
);
