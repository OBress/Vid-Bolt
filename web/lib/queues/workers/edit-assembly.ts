/**
 * Edit Assembly Worker
 * ============================================================================
 * BullMQ worker that generates an Edit Decision List (EDL) via chunked AI calls.
 *
 * V2: Produces EditorAgentEDL with multi-track, effects, keyframes, text styling.
 *
 * Phases:
 *   1. Context Analysis (0-10%)  — Load project data from Supabase
 *   2. Chunked EDL  (10-80%)    — Batch shots (~10 per batch), each with prior context
 *   3. Reconciliation (80-90%)  — Merge chunks, validate, fix overlaps
 *   4. Finalize (90-100%)       — Save merged EDL to video_projects.metadata
 */

import { Job, Processor } from 'bullmq';
import {
  getSupabaseServiceClient,
  addTaskStep,
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
import type {
  EditorAgentEDL,
  AgentClip,
  AgentTrack,
} from '@/lib/services/edit-assembly/editor-capability-manifest';
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

    // Map audio chunks with correct field names
    const rawAudioChunks = (metadata.audio_chunks || []) as unknown as Array<Record<string, unknown>>;
    const audioChunks: AssembleEditRequest['audioChunks'] = rawAudioChunks.map((c) => ({
      index: (c.chapterNumber as number) ?? (c.index as number) ?? 0,
      duration_seconds: (c.duration_seconds as number) ?? 0,
      text: (c.text as string) || undefined,
      audio_url: (c.url as string) || (c.audio_url as string) || undefined,
    }));

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
    const totalBatches = Math.ceil(shots.length / SHOTS_PER_BATCH);
    const isChunked = totalBatches > 1;

    if (isChunked) {
      console.log(`[EditAssembly Worker] Chunked mode: ${totalBatches} batches of ~${SHOTS_PER_BATCH} shots`);
    } else {
      console.log(`[EditAssembly Worker] Single-pass mode: ${shots.length} shots`);
    }

    const chunkAgentEDLs: EditorAgentEDL[] = [];
    const chunkLegacyEDLs: EditDecisionList[] = [];

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

        if (result.success) {
          if (result.agentEdl) {
            chunkAgentEDLs.push(result.agentEdl);
          }
          if (result.edl) {
            chunkLegacyEDLs.push(result.edl);
          }
          await completeStep(taskId, batchStepId);

          const clipCount = result.agentEdl?.clips.length ?? result.edl?.clips.length ?? 0;
          const textCount = result.agentEdl?.clips.filter(c => c.type === 'text').length ?? 0;
          console.log(`[EditAssembly Worker] Batch ${batchIdx + 1}/${totalBatches} complete: ${clipCount} clips, ${textCount} text overlays`);
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

    // Merge v2 agent EDLs
    const mergedAgentEDL = mergeAgentEDLChunks(chunkAgentEDLs);
    // Merge legacy EDLs for backward compat
    const mergedLegacyEDL = mergeLegacyEDLChunks(chunkLegacyEDLs);

    const totalClips = mergedAgentEDL.clips.length;
    const totalTracks = mergedAgentEDL.tracks.length;
    const totalTextClips = mergedAgentEDL.clips.filter(c => c.type === 'text').length;
    const totalKeyframedClips = mergedAgentEDL.clips.filter(c => c.keyframes && c.keyframes.length > 0).length;

    console.log(`[EditAssembly Worker] Merged Agent EDL: ${totalTracks} tracks, ${totalClips} clips, ${totalTextClips} text clips, ${totalKeyframedClips} keyframed clips`);

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

    // Save BOTH formats to video_projects.metadata
    const updatedMetadata = {
      ...metadata,
      edl: mergedLegacyEDL,          // Legacy format for backward compat
      agentEdl: mergedAgentEDL,       // V2 format with full capability support
      edl_generated_at: new Date().toISOString(),
      edl_version: 'v2',
    };

    const { error: updateError } = await supabase
      .from('video_projects')
      .update({ metadata: updatedMetadata })
      .eq('id', videoId);

    if (updateError) {
      throw new Error(`Failed to save EDL: ${updateError.message}`);
    }

    // Save to task output for the AsyncLoadingStep's onComplete callback
    await updateTaskOutput(taskId, {
      edl: mergedLegacyEDL as unknown as Record<string, unknown>,
      agentEdl: mergedAgentEDL as unknown as Record<string, unknown>,
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

    return { success: true, agentEdl: mergedAgentEDL, edl: mergedLegacyEDL };
  } catch (error) {
    console.error(`[EditAssembly Worker] Task ${taskId} failed:`, error);

    await updateTaskStatus(taskId, {
      status: 'failed',
      error_message: error instanceof Error ? error.message : 'Unknown error',
      completed_at: new Date().toISOString(),
    });

    throw error;
  }
};

// ============================================================================
// AGENT EDL CHUNK MERGER (V2)
// ============================================================================

function mergeAgentEDLChunks(chunks: EditorAgentEDL[]): EditorAgentEDL {
  if (chunks.length === 0) {
    return {
      tracks: [
        { id: 'main-video', type: 'video', name: 'Main Video', group: 'video', order: 0 },
        { id: 'overlays', type: 'video', name: 'Video 2', group: 'video', order: 1 },
      ],
      clips: [],
      transitions: [],
      audioFades: [],
      mediaIssues: [],
    };
  }

  if (chunks.length === 1) return chunks[0];

  // Merge tracks (deduplicate by id)
  const trackMap = new Map<string, AgentTrack>();
  for (const chunk of chunks) {
    for (const track of chunk.tracks) {
      if (!trackMap.has(track.id)) {
        trackMap.set(track.id, track);
      }
    }
  }

  // Ensure overlays track exists
  if (!trackMap.has('overlays')) {
    trackMap.set('overlays', { id: 'overlays', type: 'video', name: 'Video 2', group: 'video', order: 1 });
  }

  const merged: EditorAgentEDL = {
    tracks: Array.from(trackMap.values()),
    clips: [],
    transitions: [],
    audioFades: [],
    mediaIssues: [],
  };

  for (const chunk of chunks) {
    merged.clips.push(...(chunk.clips || []));
    merged.transitions.push(...(chunk.transitions || []));
    merged.audioFades.push(...(chunk.audioFades || []));
    merged.mediaIssues.push(...(chunk.mediaIssues || []));
  }

  // Sort clips by startTime within each track and fix overlaps
  const clipsByTrack = new Map<string, AgentClip[]>();
  merged.clips.forEach(clip => {
    const arr = clipsByTrack.get(clip.trackId) || [];
    arr.push(clip);
    clipsByTrack.set(clip.trackId, arr);
  });

  clipsByTrack.forEach((clips, trackId) => {
    // Sort by shotIndex first (preserves correct shot order when AI generates
    // each batch starting from time 0), then by startTime as tiebreaker for
    // clips within the same shot (e.g., overlay + base at same shotIndex).
    clips.sort((a, b) => {
      const aShot = a.shotIndex ?? Infinity;
      const bShot = b.shotIndex ?? Infinity;
      if (aShot !== bShot) return aShot - bShot;
      return a.startTime - b.startTime;
    });

    // Fix ALL overlaps by snapping to the previous clip's end.
    // This handles the case where each AI batch produces timing relative
    // to its own batch rather than the absolute timeline — the sorted order
    // (by shotIndex naturally ascending) ensures correct sequencing.
    for (let i = 1; i < clips.length; i++) {
      const prev = clips[i - 1];
      const curr = clips[i];
      const prevEnd = prev.startTime + prev.duration;
      if (curr.startTime < prevEnd) {
        const overlapAmount = prevEnd - curr.startTime;
        console.log(`[EditAssembly Merge] Fixing ${overlapAmount.toFixed(2)}s overlap on ${trackId}: ${curr.startTime}s → ${prevEnd}s`);
        curr.startTime = prevEnd;
      }
    }

    // Gap-closer pass: fill gaps between 0.1s–2s by shifting clips backward
    for (let i = 1; i < clips.length; i++) {
      const prev = clips[i - 1];
      const curr = clips[i];
      const prevEnd = prev.startTime + prev.duration;
      const gap = curr.startTime - prevEnd;
      if (gap > 0.1 && gap < 2) {
        console.log(`[EditAssembly Merge] Closing ${gap.toFixed(2)}s gap on ${trackId}: ${curr.startTime}s → ${prevEnd}s`);
        curr.startTime = prevEnd;
      }
    }
  });

  // Deduplicate transitions
  const seenTransitions = new Set<string>();
  merged.transitions = merged.transitions.filter(t => {
    const key = `${t.fromShotIndex}-${t.toShotIndex}-${t.type}`;
    if (seenTransitions.has(key)) return false;
    seenTransitions.add(key);
    return true;
  });

  // Deduplicate audio fades
  const seenFades = new Set<string>();
  merged.audioFades = merged.audioFades.filter(f => {
    const key = `${f.target}-${f.type}-${f.startTime}`;
    if (seenFades.has(key)) return false;
    seenFades.add(key);
    return true;
  });

  return merged;
}

// ============================================================================
// LEGACY EDL CHUNK MERGER (backward compat)
// ============================================================================

function mergeLegacyEDLChunks(chunks: EditDecisionList[]): EditDecisionList {
  if (chunks.length === 0) {
    return { clips: [], transitions: [], effects: [], textOverlays: [], motionGraphics: [], audioEffects: [], mediaIssues: [] };
  }

  if (chunks.length === 1) return chunks[0];

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

  merged.clips.sort((a, b) => a.startTime - b.startTime);

  const seenTransitions = new Set<string>();
  merged.transitions = merged.transitions.filter(t => {
    const key = `${t.fromShotIndex}-${t.toShotIndex}-${t.type}`;
    if (seenTransitions.has(key)) return false;
    seenTransitions.add(key);
    return true;
  });

  return merged;
}
