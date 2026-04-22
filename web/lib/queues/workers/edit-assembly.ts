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
  type TaskLifecycleOwner,
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
import { getLlmProviderConfig } from '@/lib/services/api-keys';
import { CostTracker } from '@/lib/queues/cost-tracker';
import { PROJECT_FPS } from '@/lib/constants/video';

// ============================================================================
// JOB DATA INTERFACE
// ============================================================================

export interface EditAssemblyJobData {
  taskId: string;
  userId: string;
  videoId: string;
  taskLifecycleOwner?: TaskLifecycleOwner;
}

// ============================================================================
// WORKER PROCESSOR
// ============================================================================

export const editAssemblyProcessor: Processor<EditAssemblyJobData> = async (
  job: Job<EditAssemblyJobData>
) => {
  const { taskId, userId, videoId, taskLifecycleOwner } = job.data;
  const supabase = getSupabaseServiceClient();
  const updateOwnedTaskStatus = (
    updates: Parameters<typeof updateTaskStatus>[1]
  ) => updateTaskStatus(taskId, updates, { lifecycleOwner: taskLifecycleOwner });

  console.log(`[EditAssembly Worker] Starting for video ${videoId}, task ${taskId}`);

  try {
    // Cost tracking for Step 7 (Edit Assembly)
    const costTracker = new CostTracker(7, userId);
    const result = await costTracker.run(async () => {
    // =====================================================================
    // PHASE 1: Context Analysis (0-10%)
    // =====================================================================
    await updateOwnedTaskStatus({
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
      const providerConfig = await getLlmProviderConfig(userId);
      apiKey = providerConfig.apiKey;
    } catch {
      throw new Error('LLM API key not configured. Set it in Settings → API Keys.');
    }

    // Parse project metadata
    const metadata = (project.metadata || {}) as Record<string, unknown>;
    // Use shot_plan as primary data source (canonical, used by video-gen + asset-scout),
    // with av_script_part1 as fallback for backward compatibility.
    const shotPlanData = metadata.shot_plan as { shots?: Array<Record<string, unknown>> } | undefined;
    const avScriptFallback = (metadata.av_script_part1 || {}) as { shots?: Array<Record<string, unknown>> };
    const allShotsRaw = shotPlanData?.shots || avScriptFallback?.shots || [];
    const shots = allShotsRaw as unknown as AssembleEditRequest['shots'];
    // Build GeneratedMedia[] from actual metadata keys written by image-gen/video-gen workers
    // (The old av-script worker used metadata.generatedMedia, but the closed-loop pipeline
    //  writes to metadata.generated_images and metadata.generated_videos instead.)
    const generatedImages = (metadata.generated_images || {}) as Record<string, string>;
    const generatedVideos = (metadata.generated_videos || {}) as Record<string, string>;
    const generatedVideoAudioUrls = (metadata.generated_video_audio_urls || {}) as Record<string, string>;
    const generatedVideoAudioFlags = (metadata.generated_video_audio_flags || {}) as Record<string, boolean>;
    const generatedMG = (metadata.generated_motion_graphics || {}) as Record<string, string>;
    const avScriptShots = allShotsRaw;
    
    // Read clip trim data computed by the VLM-guided clip trimmer (C5)
    const clipTrims = (metadata.clip_trims || []) as Array<{
      shotIndex: number;
      trimStart: number;
      trimEnd: number;
      trimmedDuration: number;
      wasTrimmed: boolean;
    }>;
    const trimsByShot = new Map(clipTrims.map(t => [t.shotIndex, t]));
    if (clipTrims.length > 0) {
      const trimmedCount = clipTrims.filter(t => t.wasTrimmed).length;
      console.log(`[EditAssembly Worker] Clip trims available: ${trimmedCount}/${clipTrims.length} clips trimmed`);
    }

    // Read generated background music segments from pipeline Phase III
    const generatedMusicData = (metadata.generated_music || {}) as Record<string, unknown>;
    const musicSegments = (generatedMusicData.segments || []) as Array<{
      segment_index: number;
      audio_url: string;
      start_seconds: number;
      end_seconds: number;
      duration_seconds: number;
      transition_type: 'crossfade' | 'cut' | 'fade_out_in';
      transition_duration_seconds: number;
      volume: number;
    }>;
    if (musicSegments.length > 0) {
      console.log(`[EditAssembly Worker] Background music available: ${musicSegments.length} segments`);
    }
    
    const generatedMedia: GeneratedMedia[] = avScriptShots.map((shot) => {
      const idx = shot.segment_index as number;
      const key = `shot-${idx}`;
      const imageUrl = generatedImages[key];
      const videoUrl = generatedVideos[key];
      const normalizedAudioUrl = generatedVideoAudioUrls[key];
      const hasAudio = generatedVideoAudioFlags[key];
      const url = videoUrl || imageUrl;
      const mgCode = generatedMG[key];
      const trim = trimsByShot.get(idx);
      return {
        shot_index: idx,
        media_type: (shot.media_type as string || 'image') as 'image' | 'video' | 'motiongraphic',
        // MG shots have remotion_code instead of a media URL — treat as completed
        generation_status: (url || mgCode) ? 'completed' : 'failed',
        media_url: url,
        has_audio: hasAudio,
        normalized_audio_url: normalizedAudioUrl,
        visual_prompt: (shot.visual_prompt as string) || (shot.summary as string) || '',
        remotion_code: mgCode,
        // Apply clip trim data if available
        ...(trim?.wasTrimmed ? {
          trimStart: trim.trimStart,
          trimEnd: trim.trimEnd,
        } : {}),
      } as GeneratedMedia;
    });

    // Diagnostic: confirm MG Remotion code handoff
    const mgShotCount = Object.keys(generatedMG).length;
    const mgWithCode = generatedMedia.filter(m => m.media_type === 'motiongraphic' && m.remotion_code).length;
    if (mgShotCount > 0) {
      console.log(`[EditAssembly Worker] MG code handoff: ${mgWithCode}/${mgShotCount} MG shots have remotion_code`);
      if (mgWithCode < mgShotCount) {
        const missing = generatedMedia
          .filter(m => m.media_type === 'motiongraphic' && !m.remotion_code)
          .map(m => `shot-${m.shot_index}`);
        console.warn(`[EditAssembly Worker] ⚠️ MG shots WITHOUT remotion_code: ${missing.join(', ')}`);
      }
    }

    // Map audio chunks with correct field names
    const rawAudioChunks = (metadata.audio_chunks || []) as unknown as Array<Record<string, unknown>>;
    const audioChunks: AssembleEditRequest['audioChunks'] = rawAudioChunks.map((c) => ({
      index: (c.chapterNumber as number) ?? (c.index as number) ?? 0,
      duration_seconds: (c.duration_seconds as number) ?? 0,
      text: (c.text as string) || undefined,
      audio_url: (c.url as string) || (c.audio_url as string) || undefined,
    }));

    // Calculate total audio duration for timeline capping
    const totalAudioDuration = audioChunks.reduce((sum, c) => sum + (c.duration_seconds || 0), 0);
    console.log(`[EditAssembly Worker] Total audio duration: ${totalAudioDuration.toFixed(1)}s`);

    const scriptText = (project.script_content as string) || (metadata.raw_script as string) || '';

    const model = 'google/gemini-3-flash-preview';

    if (shots.length === 0) {
      throw new Error('No shots found in project — cannot generate EDL');
    }

    await completeStep(taskId, contextStepId);
    await updateOwnedTaskStatus({
      progress_percent: 10,
      current_step: `Loaded ${shots.length} shots, ${generatedMedia.length} media items`,
    });

    console.log(`[EditAssembly Worker] Context loaded: ${shots.length} shots, ${generatedMedia.length} media, ${audioChunks.length} audio chunks`);

    // =====================================================================
    // PHASE 2: Scene-Aware Chunked EDL Generation (10-80%)
    // Group shots by scene_id for coherent editing within scenes.
    // Cross-scene transitions are handled by injecting scene boundary markers
    // in the prompt so the LLM chooses purposeful transitions.
    // =====================================================================

    // Build scene-based batches instead of arbitrary fixed-size chunks
    const MAX_BATCH_SIZE = 10; // Safety cap — scenes with >10 shots get split
    const sceneBatches: Array<typeof shots> = [];
    let currentBatch: typeof shots = [];
    let currentSceneId: string | undefined;

    for (const shot of shots) {
      const shotSceneId = (shot as any).scene_id as string | undefined;
      const isNewScene = shotSceneId && shotSceneId !== currentSceneId;
      const batchFull = currentBatch.length >= MAX_BATCH_SIZE;

      if ((isNewScene || batchFull) && currentBatch.length > 0) {
        sceneBatches.push(currentBatch);
        currentBatch = [];
      }
      currentBatch.push(shot);
      if (shotSceneId) currentSceneId = shotSceneId;
    }
    if (currentBatch.length > 0) sceneBatches.push(currentBatch);

    const totalBatches = sceneBatches.length;
    const isChunked = totalBatches > 1;

    if (isChunked) {
      console.log(`[EditAssembly Worker] Scene-based chunked mode: ${totalBatches} batches (${sceneBatches.map(b => b.length).join(', ')} shots)`);
    } else {
      console.log(`[EditAssembly Worker] Single-pass mode: ${shots.length} shots`);
    }

    const chunkAgentEDLs: EditorAgentEDL[] = [];
    const chunkLegacyEDLs: EditDecisionList[] = [];

    for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
      const batchShots = sceneBatches[batchIdx];

      const stepName = isChunked
        ? `EDL batch ${batchIdx + 1}/${totalBatches} (shots ${batchShots[0].segment_index + 1}-${batchShots[batchShots.length - 1].segment_index + 1})`
        : `Generate EDL (${shots.length} shots)`;

      const batchStepId = await addTaskStep(taskId, 'writing', stepName, batchIdx + 2);

      await updateOwnedTaskStatus({
        current_phase: 'compositing',
        current_step: stepName,
        progress_percent: Math.round(10 + (batchIdx / totalBatches) * 70),
      });

      // Filter generated media relevant to this batch's shots
      const batchShotIndices = new Set(batchShots.map((s) => s.segment_index));
      const batchMedia = generatedMedia.filter((m) => batchShotIndices.has(m.shot_index));

      // Pass ALL audio chunks to every batch. Previously, we filtered by
      // batchShotIndices.has(c.index), but audio chunk indices (from chapterNumber,
      // e.g. 0-10) only matched batch 1's shot indices — batches 2-4 received
      // ZERO audio chunks, producing 6 minutes of silent clips.
      // The LLM uses shot timing context to decide which audio clips to place.
      const batchAudioChunks = audioChunks;

      // Include trailing clips from previous batch for cross-batch continuity.
      // Without this, the LLM in batch 2 doesn't know how batch 1 ended
      // (e.g., it might duplicate a crossfade at the boundary).
      let batchScriptText = scriptText;
      if (batchIdx > 0 && chunkAgentEDLs.length > 0) {
        const prevEDL = chunkAgentEDLs[chunkAgentEDLs.length - 1];
        const trailingClips = (prevEDL.clips || [])
          .filter(c => c.trackId === 'main-video')
          .slice(-2);
        const trailingTransitions = (prevEDL.transitions || []).slice(-1);

        if (trailingClips.length > 0) {
          const trailingLines = trailingClips.map(c =>
            `  Shot ${c.shotIndex}: ${c.type} at ${c.startTime.toFixed(1)}s for ${c.duration.toFixed(1)}s`
          );
          const trailingTransLine = trailingTransitions.length > 0
            ? `  Last transition: ${trailingTransitions[0].type} (${trailingTransitions[0].duration}s)`
            : '';
          batchScriptText += `\n\n## Previous Batch Ending Context\n${trailingLines.join('\n')}${trailingTransLine ? '\n' + trailingTransLine : ''}`;
        }
      }

      // Compute batch time range for audio chunk filtering
      const batchStartSeconds = batchShots.length > 0 ? batchShots[0].start_seconds : 0;
      const batchEndSeconds = batchShots.length > 0 ? batchShots[batchShots.length - 1].end_seconds : 0;

      try {
        const result = await assembleEdit({
          videoId,
          shots: batchShots,
          generatedMedia: batchMedia,
          videoTitle: project.name || 'Untitled',
          audioChunks: batchAudioChunks,
          scriptText: batchScriptText,
          fps: PROJECT_FPS,
          apiKey,
          model,
          shotTimeRange: { startSeconds: batchStartSeconds, endSeconds: batchEndSeconds },
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

    await updateOwnedTaskStatus({
      current_phase: 'postprocessing',
      current_step: 'Merging EDL chunks...',
      progress_percent: 85,
    });

    // Merge v2 agent EDLs — pass shot timing data for absolute position rebasing
    const mergedAgentEDL = mergeAgentEDLChunks(chunkAgentEDLs, totalAudioDuration, shots);
    // Merge legacy EDLs for backward compat
    const mergedLegacyEDL = mergeLegacyEDLChunks(chunkLegacyEDLs);

    const totalClips = mergedAgentEDL.clips.length;
    const totalTracks = mergedAgentEDL.tracks.length;
    const totalTextClips = mergedAgentEDL.clips.filter(c => c.type === 'text').length;
    const totalKeyframedClips = mergedAgentEDL.clips.filter(c => c.keyframes && c.keyframes.length > 0).length;

    console.log(`[EditAssembly Worker] Merged Agent EDL: ${totalTracks} tracks, ${totalClips} clips, ${totalTextClips} text clips, ${totalKeyframedClips} keyframed clips`);

    // Inject verifier quality warnings into mediaIssues (from orchestrator's flagged_shots)
    const verifierIssues = (metadata.verifier_issues || []) as Array<{
      shotIndex: number;
      severity: string;
      type: string;
      title: string;
      description: string;
    }>;
    if (verifierIssues.length > 0) {
      console.log(`[EditAssembly Worker] Injecting ${verifierIssues.length} verifier issues into EDL`);
      for (const issue of verifierIssues) {
        mergedAgentEDL.mediaIssues.push({
          shotIndex: issue.shotIndex,
          severity: (issue.severity as 'error' | 'warning' | 'info') || 'warning',
          type: issue.type || 'quality_concern',
          title: issue.title,
          description: issue.description,
        });
        mergedLegacyEDL.mediaIssues.push({
          shotIndex: issue.shotIndex,
          severity: (issue.severity as 'error' | 'warning') || 'warning',
          type: issue.type as any || 'quality_concern',
          title: issue.title,
          description: issue.description,
        });
      }
    }

    // =====================================================================
    // Overlay backfill: ensure every overlay clip has a main-video clip behind it
    // =====================================================================
    const overlayClips = mergedAgentEDL.clips.filter(c => c.trackId === 'overlays');
    if (overlayClips.length > 0) {
      const mainVideoClips = mergedAgentEDL.clips.filter(c => c.trackId === 'main-video');
      const mainByShotIdx = new Map<number, boolean>();
      mainVideoClips.forEach(c => { if (c.shotIndex != null) mainByShotIdx.set(c.shotIndex, true); });

      let backfillCount = 0;
      for (const overlay of overlayClips) {
        if (overlay.shotIndex == null) continue;
        if (mainByShotIdx.has(overlay.shotIndex)) continue; // main-video exists, no backfill needed

        // Look up available media for this shot
        const shotKey = `shot-${overlay.shotIndex}`;
        const videoUrl = generatedVideos[shotKey];
        const imageUrl = generatedImages[shotKey];
        const mediaSrc = videoUrl || imageUrl;

        if (mediaSrc) {
          mergedAgentEDL.clips.push({
            trackId: 'main-video',
            shotIndex: overlay.shotIndex,
            type: videoUrl ? 'video' : 'image',
            startTime: overlay.startTime,
            duration: overlay.duration,
            label: `Backfill Shot ${overlay.shotIndex}`,
          });
          mainByShotIdx.set(overlay.shotIndex, true);
          backfillCount++;
          console.log(`[EditAssembly Worker] Backfilled main-video for overlay shot ${overlay.shotIndex}`);
        } else {
          // No media available — find nearest main-video clip and extend it
          const nearest = mainVideoClips
            .filter(c => c.startTime + c.duration <= overlay.startTime || c.startTime >= overlay.startTime + overlay.duration)
            .sort((a, b) => Math.abs(a.startTime - overlay.startTime) - Math.abs(b.startTime - overlay.startTime))[0];
          if (nearest) {
            // Extend the nearest clip duration to cover the overlay gap
            const gapEnd = overlay.startTime + overlay.duration;
            const nearestEnd = nearest.startTime + nearest.duration;
            if (nearestEnd < gapEnd) {
              nearest.duration = gapEnd - nearest.startTime;
              console.log(`[EditAssembly Worker] Extended nearest main-video clip to cover overlay shot ${overlay.shotIndex}`);
              backfillCount++;
            }
          } else {
            console.warn(`[EditAssembly Worker] ⚠️ Orphaned overlay shot ${overlay.shotIndex}: no media & no nearby main-video clip to extend`);
          }
        }
      }
      if (backfillCount > 0) {
        console.log(`[EditAssembly Worker] ✅ Backfilled ${backfillCount} main-video clips for orphaned overlays`);
      }
    }

    // =====================================================================
    // Inject background music onto the timeline
    // =====================================================================
    if (musicSegments.length > 0) {
      // Ensure a background-music track exists
      const hasMusicTrack = mergedAgentEDL.tracks.some(t => t.id === 'background-music');
      if (!hasMusicTrack) {
        const maxAudioOrder = mergedAgentEDL.tracks
          .filter(t => t.type === 'audio')
          .reduce((max, t) => Math.max(max, t.order), -1);
        mergedAgentEDL.tracks.push({
          id: 'background-music',
          type: 'audio',
          name: 'Background Music',
          group: 'audio',
          order: maxAudioOrder + 1,
        });
      }

      // Add a clip for each music segment
      let injectedCount = 0;
      for (const seg of musicSegments) {
        if (!seg.audio_url) {
          console.warn(`[EditAssembly Worker] Music segment ${seg.segment_index} has no audio_url, skipping`);
          continue;
        }
        mergedAgentEDL.clips.push({
          trackId: 'background-music',
          type: 'audio',
          startTime: seg.start_seconds,
          duration: seg.duration_seconds,
          label: `Music Segment ${seg.segment_index + 1}`,
          audioUrl: seg.audio_url,
          volume: Math.min(seg.volume ?? 0.15, 0.25), // Post-normalization: all audio at -16 LUFS; editor controls final mix
        });
        injectedCount++;
      }

      // Add music fades (gentle fade-in at start, fade-out at end)
      if (injectedCount > 0) {
        const firstSeg = musicSegments[0];
        const lastSeg = musicSegments[musicSegments.length - 1];

        mergedAgentEDL.audioFades.push({
          target: 'music',
          type: 'fadeIn',
          startTime: firstSeg.start_seconds,
          duration: 2.0,
        });
        mergedAgentEDL.audioFades.push({
          target: 'music',
          type: 'fadeOut',
          startTime: lastSeg.end_seconds - 3.0,
          duration: 3.0,
        });
      }

      console.log(`[EditAssembly Worker] ✅ Injected ${injectedCount} background music clips onto timeline`);
    }

    await completeStep(taskId, reconStepId);

    // =====================================================================
    // PHASE 4: Finalize (90-100%)
    // =====================================================================
    const finalStepId = await addTaskStep(taskId, 'postprocessing', 'Save EDL to project', totalBatches + 3);

    await updateOwnedTaskStatus({
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
    await updateOwnedTaskStatus({
      status: 'completed',
      current_step: 'EDL generation complete',
      progress_percent: 100,
      completed_at: new Date().toISOString(),
    });

    console.log(`[EditAssembly Worker] Task ${taskId} completed successfully`);

    return { success: true, agentEdl: mergedAgentEDL, edl: mergedLegacyEDL };
    }); // end costTracker.run()

    // Save cost data
    await costTracker.save(videoId);
    return result;
  } catch (error) {
    console.error(`[EditAssembly Worker] Task ${taskId} failed:`, error);

    await updateOwnedTaskStatus({
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

function mergeAgentEDLChunks(
  chunks: EditorAgentEDL[],
  totalAudioDuration: number = 0,
  shots: AssembleEditRequest['shots'] = []
): EditorAgentEDL {
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

  if (chunks.length === 1) {
    // Single chunk — still need to sanitize audio fades
    const single = { ...chunks[0] };
    const lastClip = single.clips
      .filter(c => c.trackId === 'main-video')
      .reduce((best, c) => {
        const end = c.startTime + c.duration;
        return end > best ? end : best;
      }, 0);
    const endTime = totalAudioDuration > 0 ? totalAudioDuration : lastClip;
    single.audioFades = [
      { target: 'main' as const, type: 'fadeIn' as const, startTime: 0, duration: 1 },
      { target: 'main' as const, type: 'fadeOut' as const, startTime: Math.max(0, endTime - 2), duration: 2 },
    ];
    return single;
  }

  // Build shot timing lookup for absolute position rebasing
  const shotTimingMap = new Map<number, { start_seconds: number; duration_seconds: number }>();
  for (const shot of shots) {
    shotTimingMap.set(shot.segment_index, {
      start_seconds: shot.start_seconds,
      duration_seconds: shot.duration_seconds,
    });
  }

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

    if (trackId === 'main-video') {
      // REBASE: Use original shot timing for absolute positions.
      // The LLM generates each batch with startTime relative to that batch
      // (starting near 0). We must rebase to absolute narration-aligned positions.
      if (shotTimingMap.size > 0) {
        for (const clip of clips) {
          const shotData = clip.shotIndex != null ? shotTimingMap.get(clip.shotIndex) : undefined;
          if (shotData) {
            clip.startTime = shotData.start_seconds;
            // Duration comes from the shot plan — do NOT cap or scale it.
            // We control both media generation duration and timeline placement,
            // so mismatches should not occur. If they do, investigate the source.
          }
        }
        // Re-sort after rebasing since positions changed
        clips.sort((a, b) => a.startTime - b.startTime);
      }

      // Duration capping mechanisms REMOVED (see implementation_plan.md C3):
      // - 15s hard cap: removed — arbitrary truncation
      // - Narration-duration cap: removed — discards usable video
      // - 80% proportional scaling: removed — creates frozen frames

      // Fix overlaps — only adjust when consecutive clips actually overlap
      for (let i = 1; i < clips.length; i++) {
        const prevEnd = clips[i - 1].startTime + clips[i - 1].duration;
        if (clips[i].startTime < prevEnd) {
          console.log(`[EditAssembly Merge] Fixing overlap: clip (shot ${clips[i].shotIndex}) ${clips[i].startTime.toFixed(2)}s → ${prevEnd.toFixed(2)}s`);
          clips[i].startTime = prevEnd;
        }
      }

      // Close micro-gaps (< 0.1s) caused by float-precision overlap fixes.
      // These are NOT intentional audio-sync gaps (those are > 0.1s from failed shots).
      // Extending the previous clip by a few ms prevents visible black frames.
      for (let i = 1; i < clips.length; i++) {
        const prevEnd = clips[i - 1].startTime + clips[i - 1].duration;
        const gap = clips[i].startTime - prevEnd;
        if (gap > 0 && gap < 0.1) {
          clips[i - 1].duration += gap;
        }
      }

      // GAP DIAGNOSTIC: Log remaining gaps (> 0.1s) for visibility.
      // These are expected when shots fail — preserving them maintains audio sync.
      for (let i = 1; i < clips.length; i++) {
        const prevEnd = clips[i - 1].startTime + clips[i - 1].duration;
        const gap = clips[i].startTime - prevEnd;
        if (gap > 0.05) { // >50ms gap — log but preserve
          console.log(`[EditAssembly Merge] Gap: ${gap.toFixed(2)}s before shot ${clips[i].shotIndex} (preserving audio sync)`);
        }
      }

      // Diagnostic: warn if timeline exceeds audio duration (but do NOT scale)
      const lastClip = clips[clips.length - 1];
      const timelineEnd = lastClip ? lastClip.startTime + lastClip.duration : 0;
      if (totalAudioDuration > 0 && timelineEnd > totalAudioDuration * 1.05) {
        console.warn(`[EditAssembly Merge] ⚠️ Timeline (${timelineEnd.toFixed(1)}s) exceeds audio (${totalAudioDuration.toFixed(1)}s) by ${((timelineEnd / totalAudioDuration - 1) * 100).toFixed(1)}% — investigate source of mismatch (do NOT scale)`);
      }
    }
  });

  // After main-video timing is rebuilt, sync overlay clips to their
  // corresponding main-video clip by shotIndex (preserves hybrid shot sync)
  const mainClips = clipsByTrack.get('main-video') || [];
  const mainClipsByShotIndex = new Map<number, AgentClip>();
  mainClips.forEach(c => {
    if (c.shotIndex != null) mainClipsByShotIndex.set(c.shotIndex, c);
  });

  clipsByTrack.forEach((clips, trackId) => {
    if (trackId === 'main-video') return;
    for (const clip of clips) {
      if (clip.shotIndex != null) {
        const mainClip = mainClipsByShotIndex.get(clip.shotIndex);
        if (mainClip) {
          // Sync to matching main-video clip
          if (clip.startTime !== mainClip.startTime || clip.duration !== mainClip.duration) {
            console.log(`[EditAssembly Merge] Syncing overlay clip (shot ${clip.shotIndex}) on ${trackId}: ${clip.startTime.toFixed(2)}s → ${mainClip.startTime.toFixed(2)}s, dur ${clip.duration.toFixed(2)}s → ${mainClip.duration.toFixed(2)}s`);
          }
          clip.startTime = mainClip.startTime;
          clip.duration = mainClip.duration;
        } else {
          // Orphaned overlay: no matching main-video clip — use shot timing fallback
          const shotData = shotTimingMap.get(clip.shotIndex);
          if (shotData) {
            console.log(`[EditAssembly Merge] Orphaned overlay (shot ${clip.shotIndex}) on ${trackId}: rebased to shot timing ${shotData.start_seconds.toFixed(2)}s`);
            clip.startTime = shotData.start_seconds;
            clip.duration = Math.min(clip.duration, shotData.duration_seconds);
          }
        }
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

  // Replace accumulated per-batch audio fades with correct absolute fades.
  // Each batch generates its own fadeIn/fadeOut, which after merge creates
  // multiple fadeOuts mid-video that cut off narration audio.
  const finalMainClips = clipsByTrack.get('main-video') || [];
  const computedEnd = finalMainClips.length > 0
    ? finalMainClips[finalMainClips.length - 1].startTime + finalMainClips[finalMainClips.length - 1].duration
    : 0;
  const finalEndTime = totalAudioDuration > 0 ? totalAudioDuration : computedEnd;
  merged.audioFades = [
    { target: 'main' as const, type: 'fadeIn' as const, startTime: 0, duration: 1 },
    { target: 'main' as const, type: 'fadeOut' as const, startTime: Math.max(0, finalEndTime - 2), duration: 2 },
  ];

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
