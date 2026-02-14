/**
 * Edit Assembly Worker
 * ============================================================================
 * BullMQ worker that generates an Edit Decision List (EDL) via chunked AI calls.
 *
 * Phases:
 *   1. Context Analysis (0-10%)  — Load project data from Supabase
 *   2. Chunked EDL  (10-80%)    — Batch shots (~10 per batch), each with prior context
 *   3. Reconciliation (80-90%)  — Merge chunks, validate, fix overlaps
 *   4. Finalize (90-100%)       — Save merged EDL to video_projects.metadata
 *
 * Job data comes from the trigger route: /api/process/edit-assembly
 */

import { Job, Processor } from 'bullmq';
import {
  getSupabaseServiceClient,
  addTaskStep,
  updateStepStatus,
  completeStep,
  failStep,
  updateTaskStatus,
  updateTaskOutput,
} from '@/lib/queues/shared';
import {
  assembleEdit,
  type AssembleEditRequest,
} from '@/lib/services/edit-assembly/edit-assembly-service';
import type {
  EditDecisionList,
} from '@/lib/services/edit-assembly/edit-assembly-prompts';
import type { GeneratedMedia } from '@/types/video';
import { getOpenRouterApiKey } from '@/lib/services/api-keys';

// ============================================================================
// JOB DATA INTERFACE
// ============================================================================

export interface EditAssemblyJobData {
  taskId: string;
  userId: string;
  videoId: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Maximum shots per batch for chunked EDL generation */
const SHOTS_PER_BATCH = 10;

// ============================================================================
// WORKER PROCESSOR
// ============================================================================

export const editAssemblyProcessor: Processor<EditAssemblyJobData> = async (
  job: Job<EditAssemblyJobData>
) => {
  const { taskId, userId, videoId } = job.data;
  const supabase = getSupabaseServiceClient();

  console.log(`[EditAssembly Worker] Starting for video ${videoId}, task ${taskId}`);

  try {
    // =====================================================================
    // PHASE 1: Context Analysis (0-10%)
    // =====================================================================
    await updateTaskStatus(taskId, {
      status: 'running',
      current_phase: 'preprocessing',
      current_step: 'Loading project data...',
      progress_percent: 0,
      started_at: new Date().toISOString(),
    });

    const contextStepId = await addTaskStep(taskId, 'preprocessing', 'Load project context', 1);

    // Fetch the video project
    const { data: project, error: projectError } = await supabase
      .from('video_projects')
      .select('id, user_id, name, metadata, script_content')
      .eq('id', videoId)
      .single();

    if (projectError || !project) {
      throw new Error(`Video project not found: ${projectError?.message || 'missing'}`);
    }

    // Get API key for LLM calls (user setting with env var fallback)
    let apiKey: string;
    try {
      apiKey = await getOpenRouterApiKey(userId);
    } catch {
      throw new Error('OpenRouter API key not configured. Set it in Settings → API Keys.');
    }

    // Parse project metadata
    const metadata = (project.metadata || {}) as Record<string, unknown>;
    const avScriptPart1 = (metadata.av_script_part1 || {}) as Record<string, unknown>;
    const shots = (avScriptPart1.shots || []) as unknown as AssembleEditRequest['shots'];
    const generatedMedia = (metadata.generatedMedia || []) as unknown as GeneratedMedia[];

    // Fix #7: Map audio chunks with correct field names
    const rawAudioChunks = (metadata.audio_chunks || []) as unknown as Array<Record<string, unknown>>;
    const audioChunks: AssembleEditRequest['audioChunks'] = rawAudioChunks.map((c) => ({
      index: (c.chapterNumber as number) ?? (c.index as number) ?? 0,
      duration_seconds: (c.duration_seconds as number) ?? 0,
      text: (c.text as string) || undefined,
      audio_url: (c.url as string) || (c.audio_url as string) || undefined,
    }));

    // Fix #8: Use script_content instead of metadata.raw_script
    const scriptText = (project.script_content as string) || (metadata.raw_script as string) || '';

    const model = 'google/gemini-3-flash-preview';

    if (shots.length === 0) {
      throw new Error('No shots found in project — cannot generate EDL');
    }

    await completeStep(taskId, contextStepId);
    await updateTaskStatus(taskId, {
      progress_percent: 10,
      current_step: `Loaded ${shots.length} shots, ${generatedMedia.length} media items`,
    });

    console.log(`[EditAssembly Worker] Context loaded: ${shots.length} shots, ${generatedMedia.length} media, ${audioChunks.length} audio chunks`);

    // =====================================================================
    // PHASE 2: Chunked EDL Generation (10-80%)
    // =====================================================================
    // For small projects, process all at once. For larger ones, chunk.
    const totalBatches = Math.ceil(shots.length / SHOTS_PER_BATCH);
    const isChunked = totalBatches > 1;

    if (isChunked) {
      console.log(`[EditAssembly Worker] Chunked mode: ${totalBatches} batches of ~${SHOTS_PER_BATCH} shots`);
    } else {
      console.log(`[EditAssembly Worker] Single-pass mode: ${shots.length} shots`);
    }

    const chunkEDLs: EditDecisionList[] = [];

    for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
      const batchStart = batchIdx * SHOTS_PER_BATCH;
      const batchEnd = Math.min(batchStart + SHOTS_PER_BATCH, shots.length);
      const batchShots = shots.slice(batchStart, batchEnd);

      const stepName = isChunked
        ? `EDL batch ${batchIdx + 1}/${totalBatches} (shots ${batchStart + 1}-${batchEnd})`
        : `Generate EDL (${shots.length} shots)`;

      const batchStepId = await addTaskStep(taskId, 'writing', stepName, batchIdx + 2);

      await updateTaskStatus(taskId, {
        current_phase: 'compositing',
        current_step: stepName,
        progress_percent: Math.round(10 + (batchIdx / totalBatches) * 70),
      });

      // Filter generated media relevant to this batch's shots
      const batchShotIndices = new Set(batchShots.map((s) => s.segment_index));
      const batchMedia = generatedMedia.filter((m) => batchShotIndices.has(m.shot_index));

      // Filter audio chunks relevant to this batch
      const batchAudioChunks = audioChunks.filter((c) => {
        // Audio chunks are matched by index to shot indices
        return batchShotIndices.has(c.index);
      });

      try {
        const result = await assembleEdit({
          videoId,
          shots: batchShots,
          generatedMedia: batchMedia,
          videoTitle: project.name || 'Untitled',
          audioChunks: batchAudioChunks,
          scriptText,
          fps: 30,
          apiKey,
          model,
        });

        if (result.success && result.edl) {
          chunkEDLs.push(result.edl);
          await completeStep(taskId, batchStepId);
          console.log(`[EditAssembly Worker] Batch ${batchIdx + 1}/${totalBatches} complete: ${result.edl.clips.length} clips`);
        } else {
          await failStep(taskId, batchStepId, result.error || 'Unknown EDL generation error');
          console.error(`[EditAssembly Worker] Batch ${batchIdx + 1} failed:`, result.error);
          throw new Error(`EDL batch ${batchIdx + 1} failed: ${result.error}`);
        }
      } catch (batchErr) {
        await failStep(taskId, batchStepId, batchErr instanceof Error ? batchErr.message : 'Unknown error');
        throw batchErr;
      }
    }

    // =====================================================================
    // PHASE 3: Reconciliation (80-90%)
    // =====================================================================
    const reconStepId = await addTaskStep(taskId, 'postprocessing', 'Merge & validate EDL', totalBatches + 2);

    await updateTaskStatus(taskId, {
      current_phase: 'postprocessing',
      current_step: 'Merging EDL chunks...',
      progress_percent: 85,
    });

    // Merge all chunk EDLs into one
    const mergedEDL = mergeEDLChunks(chunkEDLs);

    console.log(`[EditAssembly Worker] Merged EDL: ${mergedEDL.clips.length} clips, ${mergedEDL.transitions.length} transitions, ${mergedEDL.textOverlays.length} text overlays`);

    await completeStep(taskId, reconStepId);

    // =====================================================================
    // PHASE 4: Finalize (90-100%)
    // =====================================================================
    const finalStepId = await addTaskStep(taskId, 'postprocessing', 'Save EDL to project', totalBatches + 3);

    await updateTaskStatus(taskId, {
      current_phase: 'encoding',
      current_step: 'Saving EDL to project...',
      progress_percent: 95,
    });

    // Save EDL to video_projects.metadata
    const updatedMetadata = {
      ...metadata,
      edl: mergedEDL,
      edl_generated_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from('video_projects')
      .update({ metadata: updatedMetadata })
      .eq('id', videoId);

    if (updateError) {
      throw new Error(`Failed to save EDL: ${updateError.message}`);
    }

    // Save EDL to task output for the AsyncLoadingStep's onComplete callback
    await updateTaskOutput(taskId, {
      edl: mergedEDL as unknown as Record<string, unknown>,
    } as any);

    await completeStep(taskId, finalStepId);

    // Mark task as completed
    await updateTaskStatus(taskId, {
      status: 'completed',
      current_step: 'EDL generation complete',
      progress_percent: 100,
      completed_at: new Date().toISOString(),
    });

    console.log(`[EditAssembly Worker] Task ${taskId} completed successfully`);

    return { success: true, edl: mergedEDL };
  } catch (error) {
    console.error(`[EditAssembly Worker] Task ${taskId} failed:`, error);

    await updateTaskStatus(taskId, {
      status: 'failed',
      error_message: error instanceof Error ? error.message : 'Unknown error',
      completed_at: new Date().toISOString(),
    });

    throw error; // Re-throw so BullMQ retries if applicable
  }
};

// ============================================================================
// EDL CHUNK MERGER
// ============================================================================

/**
 * Merge multiple EDL chunks into a single unified EDL.
 * Concatenates all arrays and validates there are no overlapping clips.
 */
function mergeEDLChunks(chunks: EditDecisionList[]): EditDecisionList {
  if (chunks.length === 0) {
    return {
      clips: [],
      transitions: [],
      effects: [],
      textOverlays: [],
      motionGraphics: [],
      audioEffects: [],
      mediaIssues: [],
    };
  }

  if (chunks.length === 1) {
    return chunks[0];
  }

  const merged: EditDecisionList = {
    clips: [],
    transitions: [],
    effects: [],
    textOverlays: [],
    motionGraphics: [],
    audioEffects: [],
    mediaIssues: [],
  };

  for (const chunk of chunks) {
    merged.clips.push(...(chunk.clips || []));
    merged.transitions.push(...(chunk.transitions || []));
    merged.effects.push(...(chunk.effects || []));
    merged.textOverlays.push(...(chunk.textOverlays || []));
    merged.motionGraphics.push(...(chunk.motionGraphics || []));
    merged.audioEffects.push(...(chunk.audioEffects || []));
    merged.mediaIssues.push(...(chunk.mediaIssues || []));
  }

  // Sort clips by startTime within each track to handle across-chunk ordering
  merged.clips.sort((a, b) => a.startTime - b.startTime);

  // Fix overlaps across chunk boundaries
  const clipsByTrack = new Map<string, typeof merged.clips>();
  merged.clips.forEach((clip) => {
    const arr = clipsByTrack.get(clip.track) || [];
    arr.push(clip);
    clipsByTrack.set(clip.track, arr);
  });

  clipsByTrack.forEach((clips) => {
    clips.sort((a, b) => a.startTime - b.startTime);
    for (let i = 1; i < clips.length; i++) {
      const prev = clips[i - 1];
      const curr = clips[i];
      const prevEnd = prev.startTime + prev.duration;
      if (curr.startTime < prevEnd) {
        console.warn(
          `[EditAssembly Merge] Cross-chunk overlap on track, adjusting clip ${curr.shotIndex} from ${curr.startTime}s to ${prevEnd}s`
        );
        curr.startTime = prevEnd;
      }
    }
  });

  // Deduplicate transitions at chunk boundaries
  const seenTransitions = new Set<string>();
  merged.transitions = merged.transitions.filter((t) => {
    const key = `${t.fromShotIndex}-${t.toShotIndex}-${t.type}`;
    if (seenTransitions.has(key)) return false;
    seenTransitions.add(key);
    return true;
  });

  return merged;
}
