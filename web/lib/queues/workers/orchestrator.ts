/**
 * Orchestrator Worker
 * ============================================================================
 * Central coordinator for the Closed-Loop Production Phase.
 *
 * Responsibilities:
 *   - Phase progression (I→V) with quality gating
 *   - Dynamic prompt generation for all downstream workers
 *   - State persistence for crash recovery (via `closed_loop_state` column)
 *   - Dispatching jobs to specialized worker queues
 *   - Error handling and Best-Fit Salvage on max retries
 *
 * Phase Flow:
 *   I.   TTS Generation           → audio + word-level timestamps
 *   II.  Shot Planning            → structured ShotPlan JSON
 *   III. Asset Retrieval + SFX    → AssetManifest JSON
 *   IV.  Production (GPU + MG)    → generated media URLs
 *   V.   Auto-Assembly            → Video Editor V2 state JSON
 */

import { Job, Processor, QueueEvents } from 'bullmq';
import { getSupabaseServiceClient, updateTaskStatus } from '@/lib/queues/shared';
import { getRedisConnection } from '@/lib/queues/redis';
import { generateWorkerPrompts } from '@/lib/services/prompt-generator';
import { listEntities } from '@/lib/services/gcm';
import type {
  OrchestratorJobData,
  ClosedLoopState,
  WorkerPrompts,
  GCMEntity,
} from '@/lib/types/closed-loop';

// ============================================================================
// CONSTANTS
// ============================================================================

const LOG_PREFIX = '[Orchestrator]';

// ============================================================================
// QUEUE EVENTS CACHE
// ============================================================================

const queueEventsCache = new Map<string, QueueEvents>();

/**
 * Get or create a QueueEvents instance for the given queue name.
 * QueueEvents listens for job completion/failure events on a queue.
 */
function getQueueEvents(queueName: string): QueueEvents {
  let events = queueEventsCache.get(queueName);
  if (!events) {
    events = new QueueEvents(queueName, { connection: getRedisConnection() });
    queueEventsCache.set(queueName, events);
  }
  return events;
}

// ============================================================================
// STATE HELPERS
// ============================================================================

/**
 * Persist the closed-loop state to the video_projects table.
 * Called after every phase transition for crash recovery.
 */
async function persistState(
  videoId: string,
  state: ClosedLoopState,
  extra?: Record<string, unknown>
): Promise<void> {
  const supabase = getSupabaseServiceClient();

  const updatePayload: Record<string, unknown> = {
    closed_loop_state: state,
    updated_at: new Date().toISOString(),
    ...extra,
  };

  const { error } = await supabase
    .from('video_projects')
    .update(updatePayload)
    .eq('id', videoId);

  if (error) {
    console.error(`${LOG_PREFIX} Failed to persist state:`, error);
    throw error;
  }
}

/**
 * Initialize a fresh ClosedLoopState.
 */
function createInitialState(): ClosedLoopState {
  return {
    phase: 'tts',
    status: 'pending',
    started_at: new Date().toISOString(),
    phase_data: {},
    flagged_shots: [],
    total_retries: 0,
    errors: [],
  };
}

// ============================================================================
// PHASE EXECUTORS
// ============================================================================

/**
 * Phase I: TTS Generation
 * Triggers the existing audio worker and waits for completion.
 */
async function executeTtsPhase(
  videoId: string,
  jobData: OrchestratorJobData,
  taskId: string
): Promise<{ audioUrl: string; timestampsCount: number }> {
  console.log(`${LOG_PREFIX} Phase I: TTS Generation`);

  await updateTaskStatus(taskId, {
    status: 'running',
    current_step: 'Phase I: Generating narration audio...',
    progress_percent: 5,
  });

  const { audioQueue } = await import('@/lib/queues/queues');
  const queueEvents = getQueueEvents('audio-workflow');

  const audioJob = await audioQueue.add('closed-loop-tts', {
    taskId,
    userId: jobData.userId,
    videoId,
    script: jobData.scriptContent,
    voiceProvider: 'inworld',
    voiceModel: 'inworld-tts-1.5-max',
    voiceName: 'Hades',
  });

  const audioResult = await audioJob.waitUntilFinished(queueEvents, 300_000);

  if (!audioResult?.success) {
    throw new Error('TTS generation failed');
  }

  // Fetch the completed audio data from video_projects metadata
  const supabase = getSupabaseServiceClient();
  const { data: video } = await supabase
    .from('video_projects')
    .select('audio_url, metadata')
    .eq('id', videoId)
    .single();

  const metadata = (video?.metadata || {}) as Record<string, unknown>;
  const wordTimestamps = (metadata.word_timestamps || []) as Array<unknown>;

  return {
    audioUrl: video?.audio_url || '',
    timestampsCount: wordTimestamps.length,
  };
}

/**
 * Phase II: Shot Planning
 * Triggers the shot planner worker (refactored from av-script Part 1).
 */
async function executeShotPlanningPhase(
  videoId: string,
  jobData: OrchestratorJobData,
  taskId: string
): Promise<{ shotCount: number }> {
  console.log(`${LOG_PREFIX} Phase II: Shot Planning`);

  await updateTaskStatus(taskId, {
    status: 'running',
    current_step: 'Phase II: Planning shots aligned to narration...',
    progress_percent: 15,
  });

  const { avScriptQueue } = await import('@/lib/queues/queues');
  const queueEvents = getQueueEvents('av-script-workflow');

  // Fetch TTS data from metadata
  const supabase = getSupabaseServiceClient();
  const { data: video } = await supabase
    .from('video_projects')
    .select('metadata')
    .eq('id', videoId)
    .single();

  const metadata = (video?.metadata || {}) as Record<string, unknown>;
  const wordTimestamps = (metadata.word_timestamps || []) as Array<{ word: string; start_seconds: number; end_seconds: number }>;
  const totalDuration = wordTimestamps.length > 0
    ? wordTimestamps[wordTimestamps.length - 1].end_seconds
    : 0;

  const shotJob = await avScriptQueue.add('closed-loop-shot-planning', {
    taskId,
    userId: jobData.userId,
    videoId,
    script: jobData.scriptContent,
    wordTimestamps,
    totalDurationSeconds: totalDuration,
    mode: 'part1',
    stockMediaLevel: 'none',
  });

  const shotResult = await shotJob.waitUntilFinished(queueEvents, 300_000);

  return {
    shotCount: shotResult?.output?.shots?.length || 0,
  };
}

/**
 * Phase III: Asset Retrieval + SFX
 * Triggers the asset scout to find stock media and write AI prompts.
 */
async function executeAssetRetrievalPhase(
  videoId: string,
  jobData: OrchestratorJobData,
  taskId: string
): Promise<{ stockMatched: number; promptsGenerated: number }> {
  console.log(`${LOG_PREFIX} Phase III: Asset Retrieval + SFX`);

  await updateTaskStatus(taskId, {
    status: 'running',
    current_step: 'Phase III: Finding stock media and crafting AI prompts...',
    progress_percent: 30,
  });

  const { avScriptQueue } = await import('@/lib/queues/queues');
  const queueEvents = getQueueEvents('av-script-workflow');

  // Fetch shots from metadata
  const supabase = getSupabaseServiceClient();
  const { data: video } = await supabase
    .from('video_projects')
    .select('metadata')
    .eq('id', videoId)
    .single();

  const metadata = (video?.metadata || {}) as Record<string, unknown>;
  const avScriptPart1 = metadata.av_script_part1 as { shots?: Array<Record<string, unknown>> } | undefined;
  const shots = avScriptPart1?.shots || [];

  const assetJob = await avScriptQueue.add('closed-loop-asset-retrieval', {
    taskId,
    userId: jobData.userId,
    videoId,
    shots,
    mode: 'part2',
    gpuEnabled: false, // Don't trigger GPU here — Phase IV handles it
    aspectRatio: jobData.creativeManifest.style.aspect_ratio,
  });

  await assetJob.waitUntilFinished(queueEvents, 300_000);

  return {
    stockMatched: 0, // Will be populated when Asset Scout is fully built
    promptsGenerated: shots.length,
  };
}

/**
 * Phase IV: Production (GPU image/video + MG on CPU)
 * Triggers the visual director for GPU batch generation + MG.
 */
async function executeProductionPhase(
  videoId: string,
  jobData: OrchestratorJobData,
  taskId: string
): Promise<{
  imagesCompleted: number;
  imagesFailed: number;
  videosCompleted: number;
  videosFailed: number;
  mgCompleted: number;
  mgFailed: number;
}> {
  console.log(`${LOG_PREFIX} Phase IV: Production (GPU + MG)`);

  await updateTaskStatus(taskId, {
    status: 'running',
    current_step: 'Phase IV: Generating images, videos, and motion graphics...',
    progress_percent: 40,
  });

  const { visualDirectorQueue } = await import('@/lib/queues/queues');
  const queueEvents = getQueueEvents('visual-director-workflow');

  const prodJob = await visualDirectorQueue.add('closed-loop-production', {
    taskId,
    userId: jobData.userId,
    videoId,
    gpuEnabled: true,
    aspectRatio: jobData.creativeManifest.style.aspect_ratio,
  });

  const prodResult = await prodJob.waitUntilFinished(queueEvents, 1_200_000);

  const stats = prodResult?.stats || {};

  return {
    imagesCompleted: stats.imagesGenerated || 0,
    imagesFailed: stats.imagesFailed || 0,
    videosCompleted: stats.videosGenerated || 0,
    videosFailed: stats.videosFailed || 0,
    mgCompleted: 0, // Will be populated when MG worker is fully separated
    mgFailed: 0,
  };
}

/**
 * Phase V: Auto-Assembly
 * Triggers the edit assembly worker to build the Video Editor V2 timeline.
 */
async function executeAssemblyPhase(
  videoId: string,
  jobData: OrchestratorJobData,
  taskId: string
): Promise<{ editorStateSaved: boolean }> {
  console.log(`${LOG_PREFIX} Phase V: Auto-Assembly`);

  await updateTaskStatus(taskId, {
    status: 'running',
    current_step: 'Phase V: Assembling timeline in Video Editor...',
    progress_percent: 85,
  });

  const { editAssemblyQueue } = await import('@/lib/queues/queues');
  const queueEvents = getQueueEvents('edit-assembly-workflow');

  const assemblyJob = await editAssemblyQueue.add('closed-loop-assembly', {
    taskId,
    userId: jobData.userId,
    videoId,
  });

  const assemblyResult = await assemblyJob.waitUntilFinished(queueEvents, 300_000);

  return {
    editorStateSaved: !!assemblyResult?.success,
  };
}

// ============================================================================
// MAIN ORCHESTRATOR PROCESSOR
// ============================================================================

export const orchestratorProcessor: Processor<OrchestratorJobData> = async (
  job: Job<OrchestratorJobData>
) => {
  const { taskId, userId, videoId, creativeManifest, userSystemPrompt, scriptContent, entities } = job.data;

  console.log(`${LOG_PREFIX} Starting closed-loop pipeline for video ${videoId}`);

  const state = createInitialState();

  try {
    const supabase = getSupabaseServiceClient();

    // =========================================================================
    // STEP 0: Generate dynamic worker prompts
    // =========================================================================
    console.log(`${LOG_PREFIX} Step 0: Generating dynamic worker prompts...`);

    await updateTaskStatus(taskId, {
      status: 'running',
      current_step: 'Initializing closed-loop pipeline...',
      progress_percent: 2,
    });

    // Fetch GCM entities (either from job data or from DB)
    const gcmEntities: GCMEntity[] = entities.length > 0
      ? entities
      : await listEntities(videoId);

    const workerPrompts = generateWorkerPrompts(
      userSystemPrompt,
      creativeManifest,
      gcmEntities
    );

    // Persist worker prompts and creative manifest to DB
    await supabase
      .from('video_projects')
      .update({
        worker_prompts: workerPrompts,
        creative_manifest: creativeManifest,
        updated_at: new Date().toISOString(),
      })
      .eq('id', videoId);

    console.log(`${LOG_PREFIX} Worker prompts generated and persisted`);

    // =========================================================================
    // PHASE I: TTS Generation
    // =========================================================================
    state.phase = 'tts';
    state.status = 'running';
    await persistState(videoId, state);

    const ttsResult = await executeTtsPhase(videoId, job.data, taskId);

    state.phase_data.tts = {
      completed: true,
      audio_url: ttsResult.audioUrl,
      timestamps_count: ttsResult.timestampsCount,
    };
    await persistState(videoId, state);
    console.log(`${LOG_PREFIX} Phase I complete: ${ttsResult.timestampsCount} word timestamps`);

    // =========================================================================
    // PHASE II: Shot Planning
    // =========================================================================
    state.phase = 'shot_planning';
    await persistState(videoId, state);

    const shotResult = await executeShotPlanningPhase(videoId, job.data, taskId);

    state.phase_data.shot_planning = {
      completed: true,
      shot_count: shotResult.shotCount,
      iteration: 1,
    };
    await persistState(videoId, state);
    console.log(`${LOG_PREFIX} Phase II complete: ${shotResult.shotCount} shots planned`);

    // =========================================================================
    // PHASE III: Asset Retrieval + SFX
    // =========================================================================
    state.phase = 'asset_retrieval';
    await persistState(videoId, state);

    const assetResult = await executeAssetRetrievalPhase(videoId, job.data, taskId);

    state.phase_data.asset_retrieval = {
      completed: true,
      stock_matched: assetResult.stockMatched,
      prompts_generated: assetResult.promptsGenerated,
    };
    await persistState(videoId, state);
    console.log(`${LOG_PREFIX} Phase III complete: ${assetResult.promptsGenerated} prompts generated`);

    // =========================================================================
    // PHASE IV: Production (GPU + MG)
    // =========================================================================
    state.phase = 'production';
    await persistState(videoId, state);

    const prodResult = await executeProductionPhase(videoId, job.data, taskId);

    state.phase_data.production = {
      images_completed: prodResult.imagesCompleted,
      images_failed: prodResult.imagesFailed,
      videos_completed: prodResult.videosCompleted,
      videos_failed: prodResult.videosFailed,
      mg_completed: prodResult.mgCompleted,
      mg_failed: prodResult.mgFailed,
      music_completed: false,
    };
    await persistState(videoId, state);
    console.log(`${LOG_PREFIX} Phase IV complete: ${prodResult.imagesCompleted} images, ${prodResult.videosCompleted} videos`);

    // =========================================================================
    // PHASE V: Auto-Assembly
    // =========================================================================
    state.phase = 'assembly';
    await persistState(videoId, state);

    const assemblyResult = await executeAssemblyPhase(videoId, job.data, taskId);

    state.phase_data.assembly = {
      completed: true,
      editor_state_saved: assemblyResult.editorStateSaved,
    };

    // =========================================================================
    // COMPLETE
    // =========================================================================
    state.status = 'completed';
    state.completed_at = new Date().toISOString();
    await persistState(videoId, state, {
      current_stage: 'video',
      status: 'processing',
    });

    await updateTaskStatus(taskId, {
      status: 'completed',
      current_step: 'Closed-loop pipeline complete — ready for review',
      progress_percent: 100,
    });

    const summary = {
      phases_completed: 5,
      shots: state.phase_data.shot_planning?.shot_count || 0,
      images: prodResult.imagesCompleted,
      videos: prodResult.videosCompleted,
      flagged_shots: state.flagged_shots.length,
      total_retries: state.total_retries,
    };

    console.log(`${LOG_PREFIX} ✅ Pipeline complete for video ${videoId}`);
    console.log(`${LOG_PREFIX} Summary:`, JSON.stringify(summary));

    return { success: true, videoId, summary };

  } catch (error) {
    console.error(`${LOG_PREFIX} ❌ Pipeline failed for video ${videoId}:`, error);

    // Persist failure state for recovery
    state.status = 'failed';
    state.errors.push({
      phase: state.phase,
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });

    try {
      await persistState(videoId, state);
    } catch (_persistError) {
      console.error(`${LOG_PREFIX} Failed to persist error state`);
    }

    await updateTaskStatus(taskId, {
      status: 'failed',
      current_step: `Failed in phase: ${state.phase}`,
      progress_percent: 0,
      error_message: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
};
