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

import { Job, Processor, Queue, QueueEvents } from 'bullmq';
import { getSupabaseServiceClient, updateTaskStatus } from '@/lib/queues/shared';
import { getRedisConnection } from '@/lib/queues/redis';
import { generateWorkerPrompts } from '@/lib/services/prompt-generator';
import { listEntities, incrementAppearance } from '@/lib/services/gcm';
import { selectBestFitSalvage, type SalvageAttempt } from '@/lib/services/best-fit-salvage';
import { syncLorasToGpuApi } from '@/lib/services/lora-sync-service';
import type { VerifierResult } from '@/lib/queues/workers/verifier';
import type {
  OrchestratorJobData,
  ClosedLoopState,
  WorkerPrompts,
  GCMEntity,
} from '@/lib/types/closed-loop';

// Entity reference shape used by the verifier and image-edit workers
interface EntityReference {
  name: string;
  referenceUrl: string;
  description: string;
}

/** Convert GCM entities to the lightweight reference format used by workers. */
function toEntityReferences(entities: GCMEntity[]): EntityReference[] {
  return entities
    .filter(e => e.reference_url)
    .map(e => ({
      name: e.name,
      referenceUrl: e.reference_url,
      description: e.text_description,
    }));
}

// ============================================================================
// CONSTANTS
// ============================================================================

const LOG_PREFIX = '[Orchestrator]';
const MAX_VERIFY_ATTEMPTS = 3;

// ============================================================================
// QUEUE EVENTS CACHE
// ============================================================================

const queueEventsCache = new Map<string, QueueEvents>();

/**
 * Get or create a QueueEvents instance for the given queue name.
 * QueueEvents listens for job completion/failure events on a queue.
 *
 * IMPORTANT: This is async because we must wait for the QueueEvents connection
 * to be fully established before using waitUntilFinished(). Without this,
 * BullMQ can miss job completion events (known issue with shared connections).
 */
async function getQueueEvents(queueName: string): Promise<QueueEvents> {
  let events = queueEventsCache.get(queueName);
  if (!events) {
    events = new QueueEvents(queueName, { connection: getRedisConnection() });
    queueEventsCache.set(queueName, events);
    // Wait for the Redis connection to be fully ready before returning
    await events.waitUntilReady();
    console.log(`${LOG_PREFIX} QueueEvents ready for "${queueName}"`);
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
    verification_skipped: 0,
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
  const queueEvents = await getQueueEvents('audio-workflow');

  // Use voice settings from project config instead of hardcoded defaults
  const voice = jobData.projectConfig?.voice;

  const audioJob = await audioQueue.add('closed-loop-tts', {
    taskId,
    userId: jobData.userId,
    videoId,
    script: jobData.scriptContent,
    voiceProvider: voice?.provider || 'inworld',
    voiceModel: voice?.model || 'inworld-tts-1.5-max',
    voiceName: voice?.voiceName || 'Hades',
    voiceSettings: voice ? {
      speakingRate: (voice.speakingSpeed ?? 100) / 100,
      stability: voice.stability,
      similarityBoost: voice.similarityBoost,
    } : undefined,
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
 * Dispatches to the dedicated shot-planner worker with TTS timestamps
 * and the tailored system prompt from the Dynamic Prompt Generator.
 */
async function executeShotPlanningPhase(
  videoId: string,
  jobData: OrchestratorJobData,
  taskId: string,
  workerPrompts: WorkerPrompts,
  /** Optional feedback from self-reflection to prepend to the system prompt */
  reflectionFeedback?: string
): Promise<{ shotCount: number }> {
  console.log(`${LOG_PREFIX} Phase II: Shot Planning${reflectionFeedback ? ' (with reflection feedback)' : ''}`);

  await updateTaskStatus(taskId, {
    status: 'running',
    current_step: reflectionFeedback
      ? 'Phase II: Re-planning shots with feedback...'
      : 'Phase II: Planning shots aligned to narration...',
    progress_percent: 15,
  });

  const { shotPlannerQueue } = await import('@/lib/queues/queues');
  const queueEvents = await getQueueEvents('shot-planner');

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

  // If reflection feedback is provided, prepend it to the system prompt
  const systemPrompt = reflectionFeedback
    ? `CRITICAL FEEDBACK FROM PLAN REVIEW (address these issues):\n${reflectionFeedback}\n\n${workerPrompts.shot_planner}`
    : workerPrompts.shot_planner;

  const shotJob = await shotPlannerQueue.add('closed-loop-shot-planning', {
    taskId,
    userId: jobData.userId,
    videoId,
    script: jobData.scriptContent,
    wordTimestamps,
    totalDurationSeconds: totalDuration,
    aspectRatio: jobData.creativeManifest.style.aspect_ratio,
    systemPrompt,
  });

  const shotResult = await shotJob.waitUntilFinished(queueEvents, 300_000);

  return {
    shotCount: shotResult?.output?.shots?.length || 0,
  };
}

// ============================================================================
// SHOT PLAN SELF-REFLECTION
// ============================================================================

const REFLECTION_MODEL = 'google/gemini-3-flash-preview';

interface ShotPlanReflectionResult {
  severity: 'none' | 'minor' | 'major';
  issues: string[];
}

/**
 * Perform a lightweight LLM review of the generated shot plan.
 * Only called for long videos (15+ shots) to catch plan-level issues
 * before triggering expensive GPU generation.
 *
 * Cost: ~$0.001 per call (single Gemini 3 Flash completion).
 */
async function performShotPlanReflection(
  videoId: string,
  shotCount: number,
  userId: string
): Promise<ShotPlanReflectionResult> {
  const LOG_PREFIX_REFLECT = '[ShotPlanReflect]';

  // Load the shot plan from DB
  const supabase = getSupabaseServiceClient();
  const { data: project } = await supabase
    .from('video_projects')
    .select('metadata')
    .eq('id', videoId)
    .single();

  const metadata = (project?.metadata || {}) as Record<string, unknown>;
  const shotPlan = metadata.shot_plan as Record<string, unknown> | undefined;

  if (!shotPlan?.shots) {
    console.warn(`${LOG_PREFIX_REFLECT} No shot plan found in metadata — skipping`);
    return { severity: 'none', issues: [] };
  }

  const shots = shotPlan.shots as Array<Record<string, unknown>>;
  const totalDuration = (shotPlan.metadata as Record<string, unknown>)?.total_duration_seconds || 0;

  // Serialize the shot plan for LLM review
  const serializedPlan = shots.map((shot, i) => ({
    index: i,
    media_type: shot.media_type,
    content_type: shot.content_type,
    duration: shot.duration_seconds,
    entity_refs: (shot.entity_refs as string[])?.length || 0,
    description: (shot.description || shot.summary || '').toString().substring(0, 100),
  }));

  const { getOpenRouterApiKey } = await import('@/lib/services/api-keys');
  const apiKey = await getOpenRouterApiKey(userId);

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      'X-Title': 'Vid-Bolt Shot Plan Reflection',
    },
    body: JSON.stringify({
      model: REFLECTION_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You review shot plans for AI video production.',
        },
        {
          role: 'user',
          content: `Review this ${shotCount}-shot plan (total audio: ${totalDuration}s) for issues:

${JSON.stringify(serializedPlan, null, 2)}

Check for:
1. Missing coverage: any large gaps between shots?
2. Unreasonable durations: shots <2s or >15s?
3. Media type imbalance: are all shots the same type?
4. Entity consistency: shots referencing characters but no entity_refs?
5. Total coverage: do durations roughly sum to ${totalDuration}s?

Severity guidelines: "major" = fundamental plan errors that would produce unwatchable video. "minor" = imperfections that are acceptable. "none" = plan looks good.`,
        },
      ],
      temperature: 0.1,
      max_tokens: 1024,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'shot_plan_reflection',
          strict: true,
          schema: {
            type: 'object',
            required: ['issues', 'severity'],
            additionalProperties: false,
            properties: {
              issues: { type: 'array', items: { type: 'string' } },
              severity: { type: 'string', enum: ['none', 'minor', 'major'] },
            },
          },
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Reflection API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '{}';

  try {
    const parsed = JSON.parse(content);
    return {
      severity: ['none', 'minor', 'major'].includes(parsed.severity) ? parsed.severity : 'none',
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    };
  } catch {
    console.warn(`${LOG_PREFIX_REFLECT} JSON parse failed:`, content.substring(0, 200));
    return { severity: 'none', issues: [] };
  }
}

/**
 * Phase III: Asset Retrieval + SFX
 * Dispatches to the dedicated asset-scout worker with the tailored
 * system prompt from the Dynamic Prompt Generator.
 */
async function executeAssetRetrievalPhase(
  videoId: string,
  jobData: OrchestratorJobData,
  taskId: string,
  workerPrompts: WorkerPrompts
): Promise<{ stockMatched: number; promptsGenerated: number }> {
  console.log(`${LOG_PREFIX} Phase III: Asset Retrieval + SFX`);

  await updateTaskStatus(taskId, {
    status: 'running',
    current_step: 'Phase III: Finding stock media and crafting AI prompts...',
    progress_percent: 30,
  });

  const { assetScoutQueue } = await import('@/lib/queues/queues');
  const queueEvents = await getQueueEvents('asset-scout');

  const assetJob = await assetScoutQueue.add('closed-loop-asset-retrieval', {
    taskId,
    userId: jobData.userId,
    videoId,
    aspectRatio: jobData.creativeManifest.style.aspect_ratio,
    systemPrompt: workerPrompts.asset_scout,
  });

  const assetResult = await assetJob.waitUntilFinished(queueEvents, 300_000);

  return {
    stockMatched: assetResult?.output?.metadata?.stock_count || 0,
    promptsGenerated:
      (assetResult?.output?.metadata?.ai_image_count || 0) +
      (assetResult?.output?.metadata?.ai_video_count || 0) +
      (assetResult?.output?.metadata?.motiongraphic_count || 0),
  };
}

// ============================================================================
// VERIFICATION LOOP
// ============================================================================

/**
 * Execute a generation job with verification loop.
 * Dispatches to the generator, verifies the result, and retries up to
 * MAX_VERIFY_ATTEMPTS times. On max failures, performs Best-Fit Salvage.
 *
 * For images, uses failure_type branching:
 *   - "recoverable" → dispatch to image-edit queue (cheaper, no VRAM switch)
 *   - "fundamental" → dispatch to generation queue (full re-generation)
 *
 * @returns The accepted media URL and any flags
 */
async function executeWithVerification(
  shotIndex: number,
  generationConfig: {
    queueName: string;
    jobName: string;
    jobData: Record<string, unknown>;
    mediaType: 'image' | 'video';
    shotDescription: string;
    timeout: number;
  },
  verificationContext: {
    userId: string;
    videoId: string;
    taskId: string;
    entityReferences?: EntityReference[];
    previousShotUrl?: string;
    styleGuide?: string;
    /** GCM entity IDs referenced by this shot (for appearance tracking) */
    entityIds?: string[];
  },
  state: ClosedLoopState
): Promise<{ mediaUrl: string; verified: boolean; flag?: ReturnType<typeof selectBestFitSalvage>['flag'] }> {
  const { verifierQueue, imageEditQueue } = await import('@/lib/queues/queues');
  const salvageAttempts: SalvageAttempt[] = [];

  // Track the current media URL — may be updated by image-edit
  let currentMediaUrl = '';

  for (let attempt = 1; attempt <= MAX_VERIFY_ATTEMPTS; attempt++) {
    console.log(`${LOG_PREFIX} Shot ${shotIndex} attempt ${attempt}/${MAX_VERIFY_ATTEMPTS}`);

    const previousFeedback = attempt > 1
      ? salvageAttempts[attempt - 2]?.verifierResult.suggested_corrections.join('; ')
      : undefined;

    // -----------------------------------------------------------------------
    // Decide: generate fresh OR edit the existing image
    // -----------------------------------------------------------------------
    const lastResult = attempt > 1 ? salvageAttempts[attempt - 2]?.verifierResult : undefined;
    const isRecoverableImageFail =
      generationConfig.mediaType === 'image' &&
      lastResult?.failure_type === 'recoverable' &&
      currentMediaUrl;

    if (isRecoverableImageFail) {
      // --- RECOVERABLE IMAGE: use image-edit (cheaper, no VRAM switch) ---
      console.log(`${LOG_PREFIX} Shot ${shotIndex}: recoverable failure — dispatching to image-edit`);

      const editQueueEvents = await getQueueEvents('image-edit');
      const editJob = await imageEditQueue.add(
        `image-edit-shot-${shotIndex}`,
        {
          taskId: verificationContext.taskId,
          userId: verificationContext.userId,
          videoId: verificationContext.videoId,
          shotIndex,
          sourceImageUrl: currentMediaUrl,
          editInstruction: lastResult!.suggested_corrections.join('. '),
          entityReferences: verificationContext.entityReferences,
          aspectRatio: generationConfig.jobData.aspectRatio,
          attempt,
          previousFeedback,
        }
      );

      const editResult = await editJob.waitUntilFinished(editQueueEvents, 30_000); // ~15s edit + network buffer
      currentMediaUrl = editResult?.mediaUrl || editResult?.url || currentMediaUrl;
    } else {
      // --- FUNDAMENTAL or FIRST ATTEMPT: generate from scratch ---
      const genQueue = new Queue(generationConfig.queueName, {
        connection: getRedisConnection(),
      });
      const genQueueEvents = await getQueueEvents(generationConfig.queueName);

      const genJob = await genQueue.add(
        generationConfig.jobName,
        {
          ...generationConfig.jobData,
          attempt,
          previousFeedback,
        }
      );

      const genResult = await genJob.waitUntilFinished(genQueueEvents, generationConfig.timeout);
      currentMediaUrl = genResult?.mediaUrl || genResult?.url || '';
    }

    if (!currentMediaUrl) {
      console.warn(`${LOG_PREFIX} Shot ${shotIndex} attempt ${attempt}: no media URL returned`);
      continue;
    }

    // -----------------------------------------------------------------------
    // Verify the result
    // -----------------------------------------------------------------------
    const verifyQueueEvents = await getQueueEvents('verifier');
    const verifyJob = await verifierQueue.add(`verify-shot-${shotIndex}`, {
      taskId: verificationContext.taskId,
      userId: verificationContext.userId,
      videoId: verificationContext.videoId,
      mediaType: generationConfig.mediaType,
      mediaUrl: currentMediaUrl,
      shotDescription: generationConfig.shotDescription,
      shotIndex,
      entityReferences: verificationContext.entityReferences,
      previousShotUrl: verificationContext.previousShotUrl,
      styleGuide: verificationContext.styleGuide,
      previousFeedback,
    });

    const verifyResult = await verifyJob.waitUntilFinished(verifyQueueEvents, 60_000);
    const result: VerifierResult = verifyResult?.result;

    if (!result) {
      console.warn(`${LOG_PREFIX} Shot ${shotIndex} attempt ${attempt}: no verifier result`);
      continue;
    }

    // PASS → accept, update GCM, and return
    if (result.verdict === 'PASS') {
      console.log(`${LOG_PREFIX} Shot ${shotIndex} PASSED on attempt ${attempt}`);

      // Increment GCM appearance count for all referenced entities (§5.5)
      if (verificationContext.entityIds?.length) {
        for (const entityId of verificationContext.entityIds) {
          try {
            await incrementAppearance(entityId);
          } catch (err) {
            console.warn(`${LOG_PREFIX} Failed to increment appearance for entity ${entityId}:`, err);
          }
        }

        // -------------------------------------------------------------------
        // GCM Rolling Update: update entity reference from verified output
        // -------------------------------------------------------------------
        // High-confidence passes (>0.8) indicate the generated media closely
        // matches the entity description. Extract a frame and update the GCM
        // reference so downstream shots use the latest visual representation.
        if (
          result.confidence > 0.8 &&
          generationConfig.mediaType === 'video' &&
          verificationContext.entityIds.length > 0
        ) {
          try {
            const { updateEntity, getEntity } = await import('@/lib/services/gcm');
            const { extractLastFrame } = await import('@/lib/services/frame-extraction');
            const frameResult = await extractLastFrame(
              currentMediaUrl,
              verificationContext.videoId,
              shotIndex
            );

            for (const entityId of verificationContext.entityIds) {
              const entity = await getEntity(entityId);
              // Only update characters and props — settings/styles don't drift the same way
              if (entity && (entity.entity_type === 'character' || entity.entity_type === 'prop')) {
                await updateEntity(entityId, { reference_url: frameResult.frameUrl });
                console.log(
                  `${LOG_PREFIX} Shot ${shotIndex}: GCM rolling update for ${entity.name} → ${frameResult.frameUrl}`
                );
              }
            }
          } catch (gcmError) {
            // Non-blocking: GCM update failure shouldn't fail the shot
            console.warn(`${LOG_PREFIX} Shot ${shotIndex}: GCM rolling update failed:`, gcmError);
          }
        }
      }

      return { mediaUrl: currentMediaUrl, verified: true };
    }

    // FAIL → record for salvage, log feedback
    console.log(
      `${LOG_PREFIX} Shot ${shotIndex} FAILED (${result.failure_type}): ` +
      `${result.suggested_corrections.join('; ')}`
    );

    salvageAttempts.push({ mediaUrl: currentMediaUrl, verifierResult: result, attemptNumber: attempt });
    state.total_retries++;
  }

  // Max retries exceeded → Best-Fit Salvage
  console.warn(`${LOG_PREFIX} Shot ${shotIndex} failed ${MAX_VERIFY_ATTEMPTS}x — performing Best-Fit Salvage`);

  if (salvageAttempts.length === 0) {
    return { mediaUrl: '', verified: false };
  }

  const salvage = selectBestFitSalvage(shotIndex, salvageAttempts);
  state.flagged_shots.push(salvage.flag);
  console.log(`${LOG_PREFIX} Salvaged shot ${shotIndex}: ${salvage.reason}`);

  return {
    mediaUrl: salvage.bestMediaUrl,
    verified: false,
    flag: salvage.flag,
  };
}

/**
 * Phase IV: Production (GPU image/video + MG)
 * Uses specialized queues (image-gen, video-gen) with per-shot verification.
 * Passes GCM entity references and style guide to all verification calls.
 */
async function executeProductionPhase(
  videoId: string,
  jobData: OrchestratorJobData,
  taskId: string,
  state: ClosedLoopState,
  gcmEntities: GCMEntity[]
): Promise<{
  imagesCompleted: number;
  imagesFailed: number;
  videosCompleted: number;
  videosFailed: number;
  mgCompleted: number;
  mgFailed: number;
}> {
  console.log(`${LOG_PREFIX} Phase IV: Production (GPU + MG) with verification`);

  await updateTaskStatus(taskId, {
    status: 'running',
    current_step: 'Phase IV: Generating and verifying images...',
    progress_percent: 40,
  });

  // Fetch shot plan from DB to know what needs generating
  const supabase = getSupabaseServiceClient();
  const { data: project } = await supabase
    .from('video_projects')
    .select('metadata')
    .eq('id', videoId)
    .single();

  const metadata = (project?.metadata || {}) as Record<string, unknown>;
  const shotPlan = (metadata.shot_plan || {}) as Record<string, unknown>;
  const shots = (shotPlan.shots || []) as Array<{
    segment_index: number;
    media_type: string;
    content_type: string;
    description?: string;
    duration_seconds: number;
    entity_refs?: string[];
  }>;

  // Build entity references once for all verification calls
  const entityRefs = toEntityReferences(gcmEntities);
  const styleGuide = jobData.creativeManifest.style.visual_style
    + (jobData.creativeManifest.style.lighting_mood ? `, ${jobData.creativeManifest.style.lighting_mood}` : '')
    + (jobData.creativeManifest.master_creative_prompt ? `. Creative direction: ${jobData.creativeManifest.master_creative_prompt}` : '');

  let imagesCompleted = 0;
  let imagesFailed = 0;
  let videosCompleted = 0;
  let videosFailed = 0;
  let mgCompleted = 0;
  let mgFailed = 0;

  // Separate shot types
  // Only stock shots with confirmed scraped URLs stay as images; AI "image" shots → video pipeline
  const scrapedStock = (metadata.scraped_stock_images || {}) as Record<string, string>;
  const imageShots = shots.filter(s =>
    s.media_type === 'stock' && scrapedStock[`shot-${s.segment_index}`]
  );
  const videoShots = shots.filter(s =>
    s.media_type === 'video' ||
    (s.media_type === 'image') ||
    (s.media_type === 'stock' && !scrapedStock[`shot-${s.segment_index}`])
  );
  const mgShots = shots.filter(s => s.media_type === 'motiongraphic');

  // -----------------------------------------------------------------------
  // PARALLEL EXECUTION: GPU pipeline + MG Pass 1 (CPU)
  // -----------------------------------------------------------------------

  // MG Pass 1: Run on CPU with placeholder assets (non-blocking)
  const mgPass1Promise = (async () => {
    if (mgShots.length === 0) return new Map<number, string>();

    const { generateMotionGraphic, buildPlaceholderAssets } = await import(
      '@/lib/services/motion-graphics/pipeline-motion-graphics'
    );
    const { getOpenRouterApiKey } = await import('@/lib/services/api-keys');
    const apiKey = await getOpenRouterApiKey(jobData.userId);
    const mgResults = new Map<number, string>();

    for (const shot of mgShots) {
      try {
        const placeholders = buildPlaceholderAssets(shot.segment_index, 2);
        const result = await generateMotionGraphic({
          prompt: shot.description || `Motion graphic for shot ${shot.segment_index}`,
          duration: shot.duration_seconds,
          shotIndex: shot.segment_index,
          videoId,
          apiKey,
          model: 'google/gemini-3-flash-preview',
          imageAssets: placeholders,
          narrationText: shot.description,
        });

        if (result.success && result.remotionCode) {
          mgResults.set(shot.segment_index, result.remotionCode);
          mgCompleted++;
        } else {
          mgFailed++;
        }
      } catch (err) {
        console.error(`${LOG_PREFIX} MG Pass 1 failed for shot ${shot.segment_index}:`, err);
        mgFailed++;
      }
    }

    return mgResults;
  })();

  // GPU Pipeline: Images → Videos (sequential VRAM modes, with verification)
  const gpuPipelinePromise = (async () => {
    const generatedAssets = new Map<string, string>(); // placeholder → real URL

    // --- Compute dynamic timeouts ---
    // Image gen: ~10s per generation, ~15s per edit, across MAX_VERIFY_ATTEMPTS
    const IMAGE_GEN_TIMEOUT_MS = Math.max(
      60_000,
      (10_000 + 15_000) * MAX_VERIFY_ATTEMPTS + 15_000  // gen + edit per attempt + buffer
    );
    // Video gen: 1:10 ratio (seconds of content → seconds of timeout) × retry attempts
    const computeVideoTimeoutMs = (durationSeconds: number) =>
      Math.max(60_000, durationSeconds * 10 * 1_000 * MAX_VERIFY_ATTEMPTS);

    console.log(`${LOG_PREFIX} Timeouts: image=${IMAGE_GEN_TIMEOUT_MS}ms, video=computed per-shot (1:10 ratio × ${MAX_VERIFY_ATTEMPTS} attempts)`);

    // --- IMAGES ---
    for (const shot of imageShots) {
      const result = await executeWithVerification(
        shot.segment_index,
        {
          queueName: 'image-gen',
          jobName: `image-shot-${shot.segment_index}`,
          jobData: {
            taskId,
            userId: jobData.userId,
            videoId,
            shotIndex: shot.segment_index,
            aspectRatio: jobData.creativeManifest.style.aspect_ratio,
            loraName: jobData.creativeManifest.lora?.name,
          },
          mediaType: 'image',
          shotDescription: shot.description || `Shot ${shot.segment_index}`,
          timeout: IMAGE_GEN_TIMEOUT_MS,
        },
        { userId: jobData.userId, videoId, taskId, entityReferences: entityRefs, styleGuide, entityIds: shot.entity_refs },
        state
      );

      if (result.verified || result.mediaUrl) {
        imagesCompleted++;
        // Map for MG Pass 2 asset swap
        generatedAssets.set(
          `placeholder://shot-${shot.segment_index}/asset-0`,
          result.mediaUrl
        );
      } else {
        imagesFailed++;
      }
    }

    const imageStatusText = imageShots.length > 0
      ? `Images done (${imagesCompleted}/${imageShots.length}). Generating videos...`
      : 'Generating videos...';
    await updateTaskStatus(taskId, {
      current_step: `Phase IV: ${imageStatusText}`,
      progress_percent: 55,
    });

    // --- VIDEOS ---
    // The video-gen worker processes ALL video shots as a single GPU batch
    // (keyframe images → mode switch → video generation). Dispatch ONCE, then
    // read per-shot URLs from metadata and verify each individually.
    if (videoShots.length > 0) {
      const totalVideoDuration = videoShots.reduce((sum, s) => sum + (s.duration_seconds || 5), 0);
      // Query queue depth to dynamically scale timeout for multi-video contention
      const videoGenQueue = new Queue('video-gen', { connection: getRedisConnection() });
      const { waiting: waitingJobs, active: activeJobs } = await videoGenQueue.getJobCounts('waiting', 'active');
      const queueDepth = waitingJobs + activeJobs;
      const queueMultiplier = queueDepth + 1;
      const VIDEO_BATCH_TIMEOUT_MS = Math.max(120_000, totalVideoDuration * 10 * 1_000 * queueMultiplier);
      console.log(`${LOG_PREFIX} Video batch timeout: ${Math.round(VIDEO_BATCH_TIMEOUT_MS / 1000)}s for ${totalVideoDuration.toFixed(1)}s of video (${videoShots.length} shots, ${queueDepth} jobs ahead → ${queueMultiplier}x multiplier)`);

      // 1. Dispatch video-gen ONCE for the entire batch
      const genQueueEvents = await getQueueEvents('video-gen');
      const genJob = await videoGenQueue.add('video-batch', {
        taskId,
        userId: jobData.userId,
        videoId,
        aspectRatio: jobData.creativeManifest.style.aspect_ratio,
        loraName: jobData.creativeManifest.lora?.name,
      });

      console.log(`${LOG_PREFIX} Dispatched single video-gen batch job ${genJob.id}`);
      await genJob.waitUntilFinished(genQueueEvents, VIDEO_BATCH_TIMEOUT_MS);

      // 2. Read per-shot URLs from metadata (video-gen saves to generated_videos)
      const { data: updatedProject } = await supabase
        .from('video_projects')
        .select('metadata')
        .eq('id', videoId)
        .single();

      const updatedMeta = (updatedProject?.metadata || {}) as Record<string, unknown>;
      const generatedVideos = (updatedMeta.generated_videos || {}) as Record<string, string>;
      console.log(`${LOG_PREFIX} Video batch complete: ${Object.keys(generatedVideos).length} URLs in metadata`);

      // 3. Verify each shot individually
      const { verifierQueue } = await import('@/lib/queues/queues');

      for (const shot of videoShots) {
        const shotKey = `shot-${shot.segment_index}`;
        const mediaUrl = generatedVideos[shotKey];

        if (!mediaUrl) {
          videosFailed++;
          continue;
        }

        // Run verifier on this shot's video
        try {
          const verifyQueueEvents = await getQueueEvents('verifier');
          const verifyJob = await verifierQueue.add(`verify-video-${shot.segment_index}`, {
            taskId,
            userId: jobData.userId,
            videoId,
            mediaType: 'video',
            mediaUrl,
            shotDescription: shot.description || `Shot ${shot.segment_index}`,
            shotIndex: shot.segment_index,
            entityReferences: entityRefs,
            styleGuide,
          });

          const verifyResult = await verifyJob.waitUntilFinished(verifyQueueEvents, 60_000);
          const verdict = verifyResult?.result;

          // Track verification skips in state
          if (verifyResult?.verificationSkipped) {
            state.verification_skipped = (state.verification_skipped || 0) + 1;
          }

          if (verdict?.verdict === 'PASS') {
            console.log(`${LOG_PREFIX} Video shot ${shot.segment_index} PASSED verification`);
          } else if (verdict) {
            console.log(`${LOG_PREFIX} Video shot ${shot.segment_index} FAILED verification: ${verdict.suggested_corrections?.join('; ')}`);

            // For fundamental failures (wrong scene entirely), try ONE re-generation
            if (verdict.failure_type === 'fundamental' && !(shot as any)._retried) {
              console.log(`${LOG_PREFIX} Video shot ${shot.segment_index} FUNDAMENTAL failure — scheduling one retry`);
              (shot as any)._retried = true;

              try {
                const retryJob = await videoGenQueue.add('video-retry', {
                  taskId,
                  userId: jobData.userId,
                  videoId,
                  singleShotIndex: shot.segment_index,
                  previousFeedback: verdict.suggested_corrections?.join('. '),
                  aspectRatio: jobData.creativeManifest.style.aspect_ratio,
                  loraName: jobData.creativeManifest.lora?.name,
                });

                const totalVideoDurationForRetry = shot.duration_seconds || 5;
                const RETRY_TIMEOUT_MS = Math.max(120_000, totalVideoDurationForRetry * 20 * 1_000);
                const retryResult = await retryJob.waitUntilFinished(genQueueEvents, RETRY_TIMEOUT_MS);
                const retryUrl = retryResult?.mediaUrl || retryResult?.url;
                if (retryUrl) {
                  generatedVideos[shotKey] = retryUrl;
                  generatedAssets.set(`placeholder://shot-${shot.segment_index}/asset-0`, retryUrl);
                  console.log(`${LOG_PREFIX} Video shot ${shot.segment_index} retry succeeded`);
                  videosCompleted++;
                  state.total_retries = (state.total_retries || 0) + 1;
                  continue; // Skip the flagging below
                }
              } catch (retryErr) {
                console.warn(`${LOG_PREFIX} Video shot ${shot.segment_index} retry failed:`, retryErr);
              }
            }

            // Recoverable failure or retry-exhausted: flag but still use
            state.flagged_shots.push({
              shotIndex: shot.segment_index,
              issue: verdict.suggested_corrections?.join('; ') || 'Failed verification',
              suggestions: verdict.suggested_corrections || [],
              allAttemptUrls: [mediaUrl],
            });
          }
        } catch (verifyErr) {
          console.warn(`${LOG_PREFIX} Video shot ${shot.segment_index} verification error:`, verifyErr);
          // Still use the video even if verification fails
        }

        // Count as completed and map for MG Pass 2 asset swap
        videosCompleted++;
        generatedAssets.set(
          `placeholder://shot-${shot.segment_index}/asset-0`,
          mediaUrl
        );
      }
    }

    if (videosFailed > 0) {
      console.warn(`${LOG_PREFIX} ${videosFailed}/${videoShots.length} video shots had no URL in batch results`);
    }

    return generatedAssets;
  })();

  // Wait for both GPU and MG Pass 1 to complete
  const [mgPass1Results, generatedAssets] = await Promise.all([
    mgPass1Promise,
    gpuPipelinePromise,
  ]);

  // -----------------------------------------------------------------------
  // MG PASS 1 PERSISTENCE: Save generated Remotion code to metadata
  // -----------------------------------------------------------------------
  if (mgPass1Results.size > 0) {
    const mgCodeMap: Record<string, string> = {};
    for (const [shotIdx, code] of mgPass1Results) {
      mgCodeMap[`shot-${shotIdx}`] = code;
    }

    // Atomic merge — prevents race with concurrent GPU pipeline metadata writes
    await supabase.rpc('merge_video_metadata', {
      p_video_id: videoId,
      p_updates: { generated_motion_graphics: mgCodeMap },
    });

    console.log(`${LOG_PREFIX} MG Pass 1: persisted ${mgPass1Results.size} Remotion compositions`);
  }

  // -----------------------------------------------------------------------
  // MG PASS 2: Swap placeholder URLs → real R2 URLs (images, videos, stock)
  // -----------------------------------------------------------------------
  if (mgPass1Results.size > 0 && generatedAssets.size > 0) {
    const { generateMotionGraphicPass2 } = await import(
      '@/lib/services/motion-graphics/pipeline-motion-graphics'
    );

    // Build a sorted list of all generated asset URLs by segment index
    const assetEntries = [...generatedAssets.entries()]
      .map(([placeholder, url]) => {
        const match = placeholder.match(/shot-(\d+)/);
        return { segmentIndex: match ? parseInt(match[1]) : -1, url };
      })
      .filter(e => e.segmentIndex >= 0)
      .sort((a, b) => a.segmentIndex - b.segmentIndex);

    // Also include scraped stock images from Phase III (asset-scout)
    const { data: latestForStock } = await supabase
      .from('video_projects')
      .select('metadata')
      .eq('id', videoId)
      .single();
    const metaForStock = (latestForStock?.metadata || {}) as Record<string, unknown>;
    const scrapedStock = (metaForStock.scraped_stock_images || {}) as Record<string, string>;
    for (const [key, url] of Object.entries(scrapedStock)) {
      const match = key.match(/shot-(\d+)/);
      if (match && url) {
        assetEntries.push({ segmentIndex: parseInt(match[1]), url });
      }
    }
    assetEntries.sort((a, b) => a.segmentIndex - b.segmentIndex);

    const updatedMgCode: Record<string, string> = {};

    for (const [shotIdx, pass1Code] of mgPass1Results) {
      // Resolve this MG shot's placeholders to nearest available assets
      const mgAssetMap: Record<string, string> = {};
      const availableAssets = [...assetEntries]; // clone to avoid cross-shot interference

      for (let i = 0; i < 2; i++) {
        const placeholderKey = `placeholder://shot-${shotIdx}/asset-${i}`;
        if (availableAssets.length === 0) break;

        // Find the asset closest to this MG shot's segment index
        const nearest = availableAssets.reduce((best, entry) =>
          Math.abs(entry.segmentIndex - shotIdx) < Math.abs(best.segmentIndex - shotIdx)
            ? entry
            : best
        );
        mgAssetMap[placeholderKey] = nearest.url;

        // Remove used entry to avoid assigning the same asset twice
        const idx = availableAssets.indexOf(nearest);
        if (idx >= 0) availableAssets.splice(idx, 1);
      }

      const pass2Result = generateMotionGraphicPass2(pass1Code, mgAssetMap);
      if (pass2Result.success && pass2Result.remotionCode) {
        updatedMgCode[`shot-${shotIdx}`] = pass2Result.remotionCode;
        console.log(`${LOG_PREFIX} MG Pass 2 complete for shot ${shotIdx}`);
      } else {
        // Retain Pass 1 code as fallback (placeholder URLs remain unresolved)
        updatedMgCode[`shot-${shotIdx}`] = pass1Code;
        console.warn(`${LOG_PREFIX} MG Pass 2 failed for shot ${shotIdx}, retaining Pass 1 code`);
      }
    }

    // Persist Pass 2 updated code to metadata
    // Atomic merge — prevents race with concurrent metadata writes
    await supabase.rpc('merge_video_metadata', {
      p_video_id: videoId,
      p_updates: { generated_motion_graphics: updatedMgCode },
    });

    console.log(`${LOG_PREFIX} MG Pass 2: persisted ${Object.keys(updatedMgCode).length} updated compositions`);
  }

  await updateTaskStatus(taskId, {
    current_step: `Phase IV: Complete — ${imagesCompleted} images, ${videosCompleted} videos, ${mgCompleted} MG`,
    progress_percent: 75,
  });

  return {
    imagesCompleted,
    imagesFailed,
    videosCompleted,
    videosFailed,
    mgCompleted,
    mgFailed,
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
  const queueEvents = await getQueueEvents('edit-assembly-workflow');

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

    // =========================================================================
    // STEP 0-B: Auto-generate portraits for entities without reference URLs
    // =========================================================================
    // Ensures every character/prop has a visual anchor for downstream workers,
    // even if the user skipped reference image upload.
    const entitiesWithoutRefs = gcmEntities.filter(
      e => !e.reference_url && (e.entity_type === 'character' || e.entity_type === 'prop')
    );

    if (entitiesWithoutRefs.length > 0) {
      console.log(`${LOG_PREFIX} Step 0-B: Generating portraits for ${entitiesWithoutRefs.length} entities without references`);

      const { imageGenQueue } = await import('@/lib/queues/queues');
      const imageGenQueueEvents = await getQueueEvents('image-gen');
      const { updateEntity } = await import('@/lib/services/gcm');

      for (const entity of entitiesWithoutRefs) {
        try {
          const portraitPrompt = `Professional reference portrait: ${entity.text_description}. ` +
            `${entity.entity_type === 'character' ? 'Clear face visible, neutral background, studio lighting.' : 'Product/prop shot, clean background, well-lit.'}`;

          const portraitJob = await imageGenQueue.add(
            `gcm-portrait-${entity.entity_id}`,
            {
              taskId,
              userId,
              videoId,
              shotIndex: -1, // Sentinel: not a real shot
              prompt: portraitPrompt,
              aspectRatio: creativeManifest.style.aspect_ratio,
              isPortrait: true,
            }
          );

          const portraitResult = await portraitJob.waitUntilFinished(imageGenQueueEvents, 60_000);
          const portraitUrl = portraitResult?.mediaUrl || portraitResult?.url;

          if (portraitUrl) {
            await updateEntity(entity.entity_id, { reference_url: portraitUrl });
            // Also update the in-memory entity for downstream prompt generation
            const entityIndex = gcmEntities.findIndex(e => e.entity_id === entity.entity_id);
            if (entityIndex >= 0) {
              gcmEntities[entityIndex] = { ...gcmEntities[entityIndex], reference_url: portraitUrl };
            }
            console.log(`${LOG_PREFIX} Step 0-B: Portrait for "${entity.name}" → ${portraitUrl}`);
          }
        } catch (portraitError) {
          // Non-blocking: missing portrait is not fatal
          console.warn(`${LOG_PREFIX} Step 0-B: Portrait generation failed for "${entity.name}":`, portraitError);
        }
      }
    }

    // =========================================================================
    // STEP 0-C: Sync user LoRAs from R2 to GPU API
    // =========================================================================
    if (creativeManifest.lora) {
      console.log(`${LOG_PREFIX} Step 0-C: Syncing LoRAs to GPU API...`);

      try {
        // Use the parent media project ID (not videoId) for project_settings lookup
        const parentProjectId = job.data.projectId;
        if (!parentProjectId) {
          console.warn(`${LOG_PREFIX} Step 0-C: No parent project ID — skipping LoRA sync`);
        } else {
          const { data: settingsRow } = await supabase
            .from('project_settings')
            .select('settings')
            .eq('project_id', parentProjectId)
            .maybeSingle();

          const settings = settingsRow?.settings as Record<string, any> | null;
          const channelLoras = settings?.visuals?.creativeDirection?.loras || [];

        if (channelLoras.length > 0) {
            const syncResult = await syncLorasToGpuApi(channelLoras);
            console.log(
              `${LOG_PREFIX} Step 0-C: LoRA sync complete:`,
              `${syncResult.alreadyPresent} present, ${syncResult.synced} synced, ${syncResult.failed} failed`
            );

            if (syncResult.failed > 0) {
              console.warn(
                `${LOG_PREFIX} Step 0-C: Some LoRAs failed to sync:`,
                syncResult.errors.map(e => `${e.loraName}: ${e.error}`).join('; ')
              );
            }
          }
        }
      } catch (loraSyncError) {
        // Non-blocking: LoRA sync failure shouldn't stop production
        console.warn(`${LOG_PREFIX} Step 0-C: LoRA sync failed (non-blocking):`, loraSyncError);
      }
    }

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

    const shotResult = await executeShotPlanningPhase(videoId, job.data, taskId, workerPrompts);

    state.phase_data.shot_planning = {
      completed: true,
      shot_count: shotResult.shotCount,
      iteration: 1,
    };
    await persistState(videoId, state);
    console.log(`${LOG_PREFIX} Phase II complete: ${shotResult.shotCount} shots planned`);

    // =========================================================================
    // PHASE II-B: Shot Plan Self-Reflection (for long videos only)
    // =========================================================================
    // Lightweight LLM check catches bad plans before expensive GPU generation.
    // Only triggers for videos with 15+ shots (short videos rarely have plan errors).
    if (shotResult.shotCount >= 15) {
      console.log(`${LOG_PREFIX} Phase II-B: Self-reflection on ${shotResult.shotCount}-shot plan...`);

      try {
        const reflectionResult = await performShotPlanReflection(
          videoId,
          shotResult.shotCount,
          userId
        );

        if (reflectionResult.severity === 'major') {
          console.warn(
            `${LOG_PREFIX} Phase II-B: MAJOR issues found — re-planning (1 retry):`,
            reflectionResult.issues
          );

          // Prepend feedback to re-run shot planning (max 1 re-plan)
          const replanResult = await executeShotPlanningPhase(
            videoId, job.data, taskId, workerPrompts, reflectionResult.issues.join('; ')
          );

          state.phase_data.shot_planning = {
            completed: true,
            shot_count: replanResult.shotCount,
            iteration: 2,
          };
          await persistState(videoId, state);
          console.log(`${LOG_PREFIX} Phase II-B: Re-planned → ${replanResult.shotCount} shots`);
        } else {
          console.log(`${LOG_PREFIX} Phase II-B: Plan OK (severity: ${reflectionResult.severity})`);
        }
      } catch (reflectionError) {
        // Non-blocking: reflection failure shouldn't stop the pipeline
        console.warn(`${LOG_PREFIX} Phase II-B: Self-reflection failed, continuing:`, reflectionError);
      }
    }

    // =========================================================================
    // PHASE III: Asset Retrieval + SFX
    // =========================================================================
    state.phase = 'asset_retrieval';
    await persistState(videoId, state);

    const assetResult = await executeAssetRetrievalPhase(videoId, job.data, taskId, workerPrompts);

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

    const prodResult = await executeProductionPhase(videoId, job.data, taskId, state, gcmEntities);

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

    // Persist pipeline diagnostics for the Pipeline Debugger
    try {
      const { data: diagProject } = await supabase
        .from('video_projects')
        .select('metadata')
        .eq('id', videoId)
        .single();
      const diagMeta = (diagProject?.metadata || {}) as Record<string, unknown>;
      const diagShots = ((diagMeta.av_script_part1 as any)?.shots || []) as any[];
      const diagVideos = (diagMeta.generated_videos || {}) as Record<string, string>;
      const diagMG = (diagMeta.generated_motion_graphics || {}) as Record<string, string>;

      // Atomic merge — prevents race with other metadata writes
      await supabase.rpc('merge_video_metadata', {
        p_video_id: videoId,
        p_updates: {
          pipeline_diagnostics: {
            phase_iv_completed_at: new Date().toISOString(),
            images_completed: prodResult.imagesCompleted,
            images_failed: prodResult.imagesFailed,
            videos_completed: prodResult.videosCompleted,
            videos_failed: prodResult.videosFailed,
            mg_completed: prodResult.mgCompleted,
            mg_failed: prodResult.mgFailed,
            total_retries: state.total_retries || 0,
            verification_skipped: state.verification_skipped || 0,
            flagged_shots: state.flagged_shots,
            per_shot_status: diagShots.map((s: any) => ({
              shot_index: s.segment_index,
              media_type: s.media_type,
              requested_duration_s: s.duration_seconds,
              has_video_url: !!diagVideos[`shot-${s.segment_index}`],
              has_mg_code: !!diagMG[`shot-${s.segment_index}`],
            })),
          },
        },
      });
      console.log(`${LOG_PREFIX} Pipeline diagnostics persisted to metadata`);
    } catch (diagErr) {
      console.warn(`${LOG_PREFIX} Failed to persist pipeline diagnostics:`, diagErr);
    }

    // =========================================================================
    // PHASE IV-B: VLM-Guided Clip Trimming
    // =========================================================================
    // Trim dead frames and startup artifacts from AI-generated video clips.
    // Non-blocking — if trimming fails, assembly uses full clips.
    if (prodResult.videosCompleted > 0 && process.env.GPU_API_URL) {
      try {
        console.log(`${LOG_PREFIX} Phase IV-B: Trimming ${prodResult.videosCompleted} video clips...`);

        await updateTaskStatus(taskId, {
          status: 'running',
          current_step: 'Phase IV-B: Analyzing video clips for optimal trim points...',
          progress_percent: 72,
        });

        const { trimAllClips } = await import('@/lib/services/clip-trimmer');

        // Load shot plan + generated media URLs from metadata
        const { data: projData } = await supabase
          .from('video_projects')
          .select('metadata')
          .eq('id', videoId)
          .single();

        const projMeta = (projData?.metadata || {}) as Record<string, unknown>;
        const shotPlanData = (projMeta.shot_plan || {}) as Record<string, unknown>;
        const allShots = (shotPlanData.shots || []) as Array<Record<string, unknown>>;
        const generatedMedia = (projMeta.generated_media || {}) as Record<string, { url: string; type: string }>;

        // Collect video shots with their generated URLs
        const videoShots = allShots
          .map((shot, i) => ({
            shotIndex: i,
            mediaUrl: generatedMedia[String(i)]?.url || '',
            description: String(shot.description || shot.summary || ''),
            durationSeconds: Number(shot.duration_seconds) || 5,
          }))
          .filter(s => s.mediaUrl && generatedMedia[String(s.shotIndex)]?.type === 'video');

        if (videoShots.length > 0) {
          await trimAllClips(videoId, videoShots, userId, {
            gpuApiUrl: process.env.GPU_API_URL,
            gpuApiSecret: process.env.GPU_API_SECRET || '',
          });
        }
      } catch (trimError) {
        // Non-blocking: trim failure shouldn't fail the pipeline
        console.warn(`${LOG_PREFIX} Phase IV-B: Clip trimming failed, continuing:`, trimError);
      }
    }

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

    // Append edit-assembly diagnostics to pipeline_diagnostics
    try {
      const { data: asmProject } = await supabase
        .from('video_projects')
        .select('metadata')
        .eq('id', videoId)
        .single();
      const asmMeta = (asmProject?.metadata || {}) as Record<string, unknown>;
      const existingDiag = (asmMeta.pipeline_diagnostics || {}) as Record<string, unknown>;
      const agentEdl = asmMeta.agentEdl as any;
      const audioChunks = (asmMeta.audio_chunks || []) as any[];

      // Compute EDL health metrics
      let edlClipCount = 0;
      let edlTotalDuration = 0;
      let edlClipsOver10s = 0;
      if (agentEdl?.tracks) {
        for (const track of agentEdl.tracks) {
          if (track.clips) {
            for (const clip of track.clips) {
              edlClipCount++;
              const dur = clip.duration || 0;
              edlTotalDuration += dur;
              if (dur > 10) edlClipsOver10s++;
            }
          }
        }
      }
      const audioTotalDuration = audioChunks.reduce(
        (sum: number, c: any) => sum + (c.duration_seconds || 0), 0
      );

      // Atomic merge — prevents race with other metadata writes
      await supabase.rpc('merge_video_metadata', {
        p_video_id: videoId,
        p_updates: {
          pipeline_diagnostics: {
            ...existingDiag,
            phase_v_completed_at: new Date().toISOString(),
            edl_clip_count: edlClipCount,
            edl_total_duration_s: Math.round(edlTotalDuration * 100) / 100,
            edl_clips_over_10s: edlClipsOver10s,
            audio_total_duration_s: Math.round(audioTotalDuration * 100) / 100,
            edl_vs_audio_diff_s: Math.round((edlTotalDuration - audioTotalDuration) * 100) / 100,
            editor_state_saved: assemblyResult.editorStateSaved,
          },
        },
      });
      console.log(`${LOG_PREFIX} Assembly diagnostics appended to pipeline_diagnostics`);
    } catch (asmDiagErr) {
      console.warn(`${LOG_PREFIX} Failed to persist assembly diagnostics:`, asmDiagErr);
    }

    // =========================================================================
    // PHASE V-B: Holistic Pacing Review
    // =========================================================================
    // Review the full assembled timeline for pacing issues.
    // Non-blocking — adjustments are stored as recommendations.
    try {
      console.log(`${LOG_PREFIX} Phase V-B: Reviewing timeline pacing...`);

      await updateTaskStatus(taskId, {
        status: 'running',
        current_step: 'Phase V-B: Reviewing overall video pacing...',
        progress_percent: 92,
      });

      const { reviewTimelinePacing } = await import('@/lib/services/pacing-editor');
      const pacingResult = await reviewTimelinePacing(videoId, userId);

      if (pacingResult.hasAdjustments) {
        console.log(
          `${LOG_PREFIX} Phase V-B: ${pacingResult.adjustments.length} pacing adjustments recommended`
        );
      } else {
        console.log(`${LOG_PREFIX} Phase V-B: Pacing looks good — ${pacingResult.overallAssessment}`);
      }
    } catch (pacingError) {
      console.warn(`${LOG_PREFIX} Phase V-B: Pacing review failed, continuing:`, pacingError);
    }

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
      // Don't reset progress — keep it at the last value so the UI shows the correct failed phase
      error_message: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
};
