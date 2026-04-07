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
import { getSupabaseServiceClient, updateTaskStatus, appendActivityEvent } from '@/lib/queues/shared';
import { getRedisConnection } from '@/lib/queues/redis';
import {
  calculateTtsTimeout,
  calculateShotPlannerTimeout,
  calculateAssetScoutTimeout,
  calculateAssemblyTimeout,
  calculateImageEditTimeout,
  calculateVerifierTimeout,
  calculatePortraitTimeout,
} from '@/lib/queues/pipeline-timeouts';
import { generateWorkerPrompts } from '@/lib/services/prompt-generator';
import { listEntities, incrementAppearance } from '@/lib/services/gcm';
import { selectBestFitSalvage, type SalvageAttempt } from '@/lib/services/best-fit-salvage';
import { syncLorasToGpuApi } from '@/lib/services/lora-sync-service';
import { decrementActiveProductions, executeGpuShutdown } from '@/lib/services/gpu-production-tracker';
import { withGpuLock } from '@/lib/queues/gpu-lock';
import { executeSegmentationShot } from '@/lib/services/segmentation-shot-executor';
import { buildVideoGenerationWaves } from '@/lib/services/continuity-wave-planner';
import { processContinuityWaveBatch } from '@/lib/av-script/i2v-processor';
import type { VerifierResult } from '@/lib/queues/workers/verifier';
import type {
  OrchestratorJobData,
  ClosedLoopState,
  WorkerPrompts,
  GCMEntity,
} from '@/lib/types/closed-loop';
import { getShotNeighborContextForMG } from '@/lib/services/shot-context';
import type {
  MotionGraphicsAssetBundleItem,
  PersistentMotionGraphicState,
} from '@/types/video';

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

type MotionGraphicShotLike = {
  segment_index: number;
  media_type: string;
  text: string;
  summary: string;
  visual_description?: string;
  visual_elements?: string[];
  stock_search_query?: string;
  image_edit_instruction?: string;
  mg_asset_bundle?: MotionGraphicsAssetBundleItem[];
};

type AssetManifestEntryLike = {
  segment_index: number;
  source: 'stock' | 'ai_image' | 'ai_video' | 'motiongraphic';
  visual_prompt?: string;
  stock_url?: string;
  stock_metadata?: {
    id?: string;
    thumbnailUrl?: string;
    description?: string;
    similarity?: number;
  };
};

const MG_MATCH_STOP_WORDS = new Set([
  'about',
  'after',
  'again',
  'along',
  'also',
  'between',
  'during',
  'from',
  'have',
  'into',
  'just',
  'more',
  'over',
  'their',
  'them',
  'they',
  'this',
  'those',
  'through',
  'under',
  'using',
  'when',
  'where',
  'with',
]);

function tokenizeForAssetMatch(text: string | undefined): string[] {
  if (!text) return [];

  const words = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map(word => word.trim())
    .filter(word => word.length >= 4 && !MG_MATCH_STOP_WORDS.has(word));

  return [...new Set(words)].slice(0, 24);
}

function scoreAssetBundleCandidate(
  shotTokens: string[],
  candidate: Pick<MotionGraphicsAssetBundleItem, 'label' | 'description' | 'usage'>
): number {
  if (shotTokens.length === 0) return 0;

  const haystack = [candidate.label, candidate.description, candidate.usage]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (!haystack) return 0;

  return shotTokens.reduce((score, token) => {
    if (haystack.includes(token)) return score + 3;
    if (token.length > 6 && haystack.includes(token.slice(0, -1))) return score + 1;
    return score;
  }, 0);
}

function inferBundleAssetKind(
  url: string,
  fallbackSource: MotionGraphicsAssetBundleItem['source'],
  contextText?: string
): MotionGraphicsAssetBundleItem['asset_kind'] {
  if (url.startsWith('placeholder://')) return 'placeholder';
  if (/\.(mp4|mov|webm)(\?|$)/i.test(url)) {
    return fallbackSource === 'reference' ? 'video_context' : 'video';
  }

  const context = (contextText || '').toLowerCase();
  if (/\b(document|memo|report|file|dossier|paper|article|record)\b/.test(context)) return 'document';
  if (/\b(logo|brand|wordmark)\b/.test(context)) return 'logo';
  if (/\b(portrait|headshot|person|face)\b/.test(context)) return 'portrait';
  if (/\b(screenshot|ui|screen)\b/.test(context)) return 'screenshot';
  if (/\b(diagram|chart|blueprint|process)\b/.test(context)) return 'diagram';
  if (fallbackSource === 'stock') return 'stock';
  if (fallbackSource === 'reference') return 'reference';
  return 'image';
}

function dedupeMotionGraphicsAssetBundle(
  items: MotionGraphicsAssetBundleItem[]
): MotionGraphicsAssetBundleItem[] {
  const seen = new Set<string>();
  const deduped: MotionGraphicsAssetBundleItem[] = [];

  for (const item of items) {
    const key = item.url || item.id;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

function buildMotionGraphicsAssetBundle(params: {
  shot: MotionGraphicShotLike;
  assetEntry?: AssetManifestEntryLike;
  referenceKit: MotionGraphicsAssetBundleItem[];
  placeholders: MotionGraphicsAssetBundleItem[];
  generatedImages: Record<string, string>;
  generatedVideos: Record<string, string>;
}): MotionGraphicsAssetBundleItem[] {
  const { shot, assetEntry, referenceKit, placeholders, generatedImages, generatedVideos } = params;
  const shotKey = `shot-${shot.segment_index}`;
  const baseBundle = [...(shot.mg_asset_bundle || [])];
  const shotTokens = tokenizeForAssetMatch(
    [
      shot.visual_description,
      shot.summary,
      shot.text,
      shot.stock_search_query,
      assetEntry?.visual_prompt,
    ].filter(Boolean).join(' ')
  );

  const bundle: MotionGraphicsAssetBundleItem[] = [...baseBundle];

  const sameShotImageUrl = generatedImages[shotKey];
  if (sameShotImageUrl) {
    bundle.push({
      id: `${shotKey}-generated-image`,
      url: sameShotImageUrl,
      asset_kind: 'image',
      label: `Shot ${shot.segment_index + 1} keyframe`,
      usage: shot.image_edit_instruction ? 'edited image source' : 'primary keyframe',
      description: shot.visual_description || shot.summary || shot.text,
      source: 'generated',
      source_shot_index: shot.segment_index,
    });
  }

  const sameShotVideoUrl = generatedVideos[shotKey];
  if (sameShotVideoUrl && (shot.visual_elements || []).includes('remotion_video_manipulation')) {
    bundle.push({
      id: `${shotKey}-video-context`,
      url: sameShotVideoUrl,
      asset_kind: 'video_context',
      label: `Shot ${shot.segment_index + 1} base video`,
      usage: 'context-only base layer',
      description: 'Underlying base video for overlay timing and positioning context',
      source: 'generated',
      source_shot_index: shot.segment_index,
    });
  }

  if (assetEntry?.stock_url) {
    bundle.push({
      id: assetEntry.stock_metadata?.id || `${shotKey}-stock`,
      url: assetEntry.stock_url,
      asset_kind: 'stock',
      label: `Shot ${shot.segment_index + 1} stock reference`,
      usage: shot.media_type === 'motiongraphic' ? 'documentary reference asset' : 'stock source',
      description: assetEntry.stock_metadata?.description || assetEntry.visual_prompt || shot.summary,
      source: 'stock',
      source_shot_index: shot.segment_index,
    });
  }

  const rankedReferenceKit = referenceKit
    .map((item, index) => ({
      item,
      index,
      score: scoreAssetBundleCandidate(shotTokens, item),
    }))
    .filter(candidate => candidate.score > 0 || candidate.index < 2)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 4)
    .map(({ item }, matchedIndex) => ({
      ...item,
      id: item.id || `${shotKey}-reference-${matchedIndex}`,
      asset_kind: inferBundleAssetKind(
        item.url,
        item.source || 'reference',
        [item.label, item.description, item.usage].filter(Boolean).join(' ')
      ),
      source: item.source || 'reference',
    }));

  bundle.push(...rankedReferenceKit);
  bundle.push(...placeholders);

  return dedupeMotionGraphicsAssetBundle(bundle).slice(0, 8);
}

// ============================================================================
// CONSTANTS
// ============================================================================

const LOG_PREFIX = '[Orchestrator]';
const MAX_VERIFY_ATTEMPTS = 3;

// CancellationError and checkCancelled are shared across the pipeline
// (orchestrator, gpu-batch-generation, etc.) to avoid circular imports.
import { CancellationError, checkCancelled } from '@/lib/queues/cancellation';

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

function isBullMqWaitTimeoutError(error: unknown): error is Error {
  return error instanceof Error && error.message.includes('timed out before finishing');
}

function buildVerifierTimeoutResult(waitTimeoutMs: number): VerifierResult {
  return {
    verdict: 'FAIL',
    failure_type: 'recoverable',
    dimension_feedback: {
      semantic_alignment: `Verifier wait timed out after ${Math.round(waitTimeoutMs / 1000)}s before a verdict was received.`,
      entity_consistency: 'Unknown because the verifier did not return in time.',
      temporal_continuity: 'Unknown because the verifier did not return in time.',
      visual_quality: 'Unknown because the verifier did not return in time.',
      style_consistency: 'Unknown because the verifier did not return in time.',
      thematic_consistency: 'Unknown because the verifier did not return in time.',
    },
    suggested_corrections: [
      'Verifier timed out before returning a verdict',
      'Retry verification or review this shot manually in the editor',
    ],
    recommended_action: 'regenerate',
    confidence: 0,
  };
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

// ============================================================================
// PROGRESS BAND HELPER
// ============================================================================

/**
 * Linearly interpolate within a progress band based on completion count.
 * Returns a whole-number percentage within [bandStart, bandEnd].
 * Safe for total=0 (returns bandEnd).
 */
function computePhaseProgress(
  bandStart: number,
  bandEnd: number,
  completed: number,
  total: number
): number {
  if (total <= 0) return bandEnd;
  const ratio = Math.min(completed / total, 1);
  return Math.round(bandStart + ratio * (bandEnd - bandStart));
}

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
    progress_percent: 3, // Band: 3–8
  });

  const { audioQueue } = await import('@/lib/queues/queues');
  const queueEvents = await getQueueEvents('audio-workflow');

  // Use voice settings from project config instead of hardcoded defaults
  const voice = jobData.projectConfig?.voice;

  const audioJob = await audioQueue.add('closed-loop-tts', {
    taskId,
    userId: jobData.userId,
    videoId,
    taskLifecycleOwner: 'orchestrator',
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

  // Dynamic timeout: scales with script length (word count → chunks → processing time)
  const wordCount = jobData.scriptContent.split(/\s+/).length;
  const ttsTimeout = calculateTtsTimeout(wordCount);
  const audioResult = await audioJob.waitUntilFinished(queueEvents, ttsTimeout);

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
    progress_percent: 8, // Band: 8–15
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
    taskLifecycleOwner: 'orchestrator',
    script: jobData.scriptContent,
    wordTimestamps,
    totalDurationSeconds: totalDuration,
    aspectRatio: jobData.creativeManifest.style.aspect_ratio,
    systemPrompt,
  });

  // Dynamic timeout: scales with video duration (more segments → more LLM batches)
  const shotPlannerTimeout = calculateShotPlannerTimeout(totalDuration);
  const shotResult = await shotJob.waitUntilFinished(queueEvents, shotPlannerTimeout);

  return {
    shotCount: shotResult?.output?.shots?.length || 0,
  };
}

// ============================================================================
// SHOT PLAN SELF-REFLECTION
// ============================================================================

const REFLECTION_MODEL = 'google/gemini-3-flash-preview';

/** Timeout for video verification jobs (vision analysis is slower than text). */
const VIDEO_VERIFY_TIMEOUT_MS = calculateVerifierTimeout('video');

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

  // Serialize the shot plan for LLM review (include new fields)
  const serializedPlan = shots.map((shot, i) => ({
    index: i,
    media_type: shot.media_type,
    content_type: shot.content_type,
    narrative_beat: shot.narrative_beat || 'unknown',
    scene_id: shot.scene_id || 'unassigned',
    continuity: shot.continuity_from_previous || false,
    angle_change: shot.angle_change || null,
    synthesis_mode: shot.synthesis_mode || 'T2V',
    duration: shot.duration_seconds,
    entity_refs: (shot.entity_refs as string[])?.length || 0,
    description: (shot.description || shot.summary || '').toString().substring(0, 100),
  }));

  const { callOpenRouter } = await import('@/lib/ai/openrouter');

  const result = await callOpenRouter(userId, [
    {
      role: 'system',
      content: 'You review shot plans for AI video production. You understand narrative structure, scene composition, and visual storytelling.',
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
6. Scene structure: do shots with the same scene_id form coherent visual groups?
7. Narrative beat variety: is there a pacing rollercoaster (varying energy), or are all beats the same?
8. Continuity consistency: is angle_change only present when continuity=true? Is the first shot in each scene always continuity=false?
9. Synthesis mode: are continuity shots using I2V and first-in-scene shots using T2V?

Severity guidelines: "major" = fundamental plan errors that would produce unwatchable video. "minor" = imperfections that are acceptable. "none" = plan looks good.`,
    },
  ], {
    model: REFLECTION_MODEL,
    temperature: 0.1,
    maxTokens: 65536,
    xTitle: 'Vid-Bolt Shot Plan Reflection',
    responseFormat: {
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
  });

  try {
    const parsed = JSON.parse(result.content);
    return {
      severity: ['none', 'minor', 'major'].includes(parsed.severity) ? parsed.severity : 'none',
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    };
  } catch {
    console.warn(`${LOG_PREFIX_REFLECT} JSON parse failed:`, result.content.substring(0, 200));
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
  workerPrompts: WorkerPrompts,
  shotCount: number = 30
): Promise<{ stockMatched: number; promptsGenerated: number }> {
  console.log(`${LOG_PREFIX} Phase III: Asset Retrieval + SFX`);

  await updateTaskStatus(taskId, {
    status: 'running',
    current_step: 'Phase III: Finding stock media and crafting AI prompts...',
    progress_percent: 15, // Band: 15–30
  });

  const { assetScoutQueue } = await import('@/lib/queues/queues');
  const queueEvents = await getQueueEvents('asset-scout');

  const assetJob = await assetScoutQueue.add('closed-loop-asset-retrieval', {
    taskId,
    userId: jobData.userId,
    videoId,
    taskLifecycleOwner: 'orchestrator',
    aspectRatio: jobData.creativeManifest.style.aspect_ratio,
    systemPrompt: workerPrompts.asset_scout,
  });

  // Dynamic timeout: scales with shot count (more shots → more stock search + prompt gen)
  const assetScoutTimeout = calculateAssetScoutTimeout(shotCount);
  const assetResult = await assetJob.waitUntilFinished(queueEvents, assetScoutTimeout);

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
    visualStyleTag?: string;
    /** GCM entity IDs referenced by this shot (for appearance tracking) */
    entityIds?: string[];
    // Creative context for dynamic verifier prompt
    creativeDirection?: string;
    loraInfo?: { name: string; triggerWords?: string };
    genre?: string;
    narrativeBeat?: string;
    imageEditInstruction?: string;
    /** Total shots in this pipeline run - drives image-edit timeout scaling */
    totalShotCount?: number;
    /** Total video duration in seconds - drives image-edit timeout scaling */
    totalDurationSeconds?: number;
  },
  state: ClosedLoopState
): Promise<{ mediaUrl: string; verified: boolean; flag?: ReturnType<typeof selectBestFitSalvage>['flag']; softFailed?: boolean }> {
  const { verifierQueue, imageEditQueue } = await import('@/lib/queues/queues');
  const salvageAttempts: SalvageAttempt[] = [];

  // Track the current media URL — may be updated by image-edit
  let currentMediaUrl = '';
  let retryVerificationOnly = false;

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
      !retryVerificationOnly &&
      generationConfig.mediaType === 'image' &&
      lastResult?.failure_type === 'recoverable' &&
      currentMediaUrl;

    if (retryVerificationOnly) {
      console.log(`${LOG_PREFIX} Shot ${shotIndex}: retrying verification on existing media`);
      retryVerificationOnly = false;
    } else if (isRecoverableImageFail) {
      // --- RECOVERABLE IMAGE: use image-edit (cheaper, no VRAM switch) ---
      console.log(`${LOG_PREFIX} Shot ${shotIndex}: recoverable failure — dispatching to image-edit`);

      const editQueueEvents = await getQueueEvents('image-edit');
      const editJob = await imageEditQueue.add(
        `image-edit-shot-${shotIndex}`,
        {
          taskId: verificationContext.taskId,
          userId: verificationContext.userId,
          videoId: verificationContext.videoId,
          taskLifecycleOwner: 'orchestrator',
          shotIndex,
          sourceImageUrl: currentMediaUrl,
          editInstruction: lastResult!.suggested_corrections.join('. '),
          entityReferences: verificationContext.entityReferences,
          aspectRatio: generationConfig.jobData.aspectRatio,
          attempt,
          previousFeedback,
        }
      );

      const editResult = await editJob.waitUntilFinished(
        editQueueEvents,
        calculateImageEditTimeout(
          verificationContext.totalShotCount ?? 1,
          verificationContext.totalDurationSeconds ?? 0
        )
      );
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
      visualStyleTag: verificationContext.visualStyleTag,
      previousFeedback,
      // Creative context for dynamic verifier prompt
      creativeDirection: verificationContext.creativeDirection,
      loraInfo: verificationContext.loraInfo,
      genre: verificationContext.genre,
      narrativeBeat: verificationContext.narrativeBeat,
      imageEditInstruction: verificationContext.imageEditInstruction,
    });

    const verifierTimeoutMs = calculateVerifierTimeout(generationConfig.mediaType);
    console.log(
      `${LOG_PREFIX} Shot ${shotIndex} verifier wait budget: ${Math.round(verifierTimeoutMs / 1000)}s`
    );

    let result: VerifierResult | undefined;
    try {
      const verifierWaitStartedAt = Date.now();
      const verifyResult = await verifyJob.waitUntilFinished(verifyQueueEvents, verifierTimeoutMs);
      console.log(
        `${LOG_PREFIX} Shot ${shotIndex} verifier completed in ${Date.now() - verifierWaitStartedAt}ms`
      );
      result = verifyResult?.result;
    } catch (error) {
      if (isBullMqWaitTimeoutError(error)) {
        console.warn(
          `${LOG_PREFIX} Shot ${shotIndex} attempt ${attempt}: verifier wait timed out after ${Math.round(verifierTimeoutMs / 1000)}s`
        );
        result = buildVerifierTimeoutResult(verifierTimeoutMs);
        retryVerificationOnly = attempt < MAX_VERIFY_ATTEMPTS;
      } else {
        throw error;
      }
    }

    if (!result) {
      console.warn(`${LOG_PREFIX} Shot ${shotIndex} attempt ${attempt}: no verifier result`);
      continue;
    }

    // PASS or SOFT_FAIL → accept the media
    // SOFT_FAIL: usable but has quality concerns — flag issues for the editor
    if (result.verdict === 'PASS' || result.verdict === 'SOFT_FAIL') {
      if (result.verdict === 'SOFT_FAIL') {
        console.log(`${LOG_PREFIX} Shot ${shotIndex} SOFT_FAIL on attempt ${attempt} — accepted with warnings`);
        // Flag the quality concerns so they appear in the editor's Issues panel
        state.flagged_shots.push({
          shotIndex,
          issue: `Shot ${shotIndex + 1} accepted with quality concerns: ${result.suggested_corrections.join('; ')}`,
          suggestions: result.suggested_corrections,
          allAttemptUrls: [currentMediaUrl],
        });
      } else {
        console.log(`${LOG_PREFIX} Shot ${shotIndex} PASSED on attempt ${attempt}`);
      }

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
    softFailed: true, // Best-Fit Salvage = soft-fail (media exists, quality concerns)
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
    progress_percent: 30, // Band: images 30–50, videos 50–70, MG 70–75
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
    text: string;
    summary: string;
    visual_description?: string;
    visual_elements?: string[];
    stock_search_query?: string;
    start_seconds: number;
    end_seconds: number;
    duration_seconds: number;
    entity_refs?: string[];
    synthesis_mode?: string;
    angle_change?: string;
    continuity_from_previous?: boolean;
    narrative_beat?: string;
    scene_id?: string;
    image_edit_instruction?: string;
    image_count?: number;
    mg_mode?: 'template' | 'freeform';
    template_type?: import('@/types/video').MotionGraphicsTemplateType;
    mg_asset_bundle?: MotionGraphicsAssetBundleItem[];
    visual_treatment?: import('@/lib/types/closed-loop').VisualTreatment;
    shot_role?: string;
    framing?: string;
    camera_angle?: string;
    camera_motion?: string;
    lens_style?: string;
    subject_focus?: string;
    entry_transition_intent?: string;
    exit_transition_intent?: string;
    bridge_subject?: string;
    visual_motif?: string;
    continuity_level?: 'fresh' | 'soft' | 'strict';
    anchor_strategy?: 'fresh' | 'scene_anchor' | 'prev_frame' | 'prev_keyframe';
    render_strategy?: 'ai_video' | 'ai_image' | 'stock' | 'motiongraphic' | 'segment_animate' | 'segment_video_fx' | 'segment_mask_prep';
    trim_priority?: 'hold' | 'balanced' | 'tight';
    segmentation_treatment?: import('@/lib/types/closed-loop').SegmentationTreatment;
    persistent_graphic_id?: string;
    persistent_graphic_type?: import('@/types/video').PersistentGraphicType;
    graphic_state_patch?: import('@/types/video').GraphicStatePatch;
  }>;

  const persistentMotionGraphics = (metadata.persistent_motion_graphics || {}) as Record<string, PersistentMotionGraphicState>;
  const assetManifestEntries = ((((metadata.asset_manifest || {}) as Record<string, unknown>).entries) || []) as AssetManifestEntryLike[];
  const assetManifestByShot = new Map<number, AssetManifestEntryLike>(
    assetManifestEntries.map(entry => [entry.segment_index, entry])
  );
  const existingGeneratedImages = (metadata.generated_images || {}) as Record<string, string>;
  const existingGeneratedVideos = (metadata.generated_videos || {}) as Record<string, string>;
  const referenceKit = ((jobData.creativeManifest.reference_kit || []) as MotionGraphicsAssetBundleItem[]).slice(0, 12);

  // Global word timestamps for millisecond-precision MG animation timing
  const allWordTimestamps = (metadata.word_timestamps || []) as Array<{
    word: string;
    start_seconds: number;
    end_seconds: number;
  }>;

  // Build entity references once for all verification calls
  const entityRefs = toEntityReferences(gcmEntities);

  // Build two style guides: one for AI-generated content (includes LoRA) and one for stock
  const baseStyle = [
    jobData.creativeManifest.style.visual_style,
    jobData.creativeManifest.style.lighting_mood,
    jobData.creativeManifest.master_creative_prompt
      ? `Creative direction: ${jobData.creativeManifest.master_creative_prompt}` : '',
  ].filter(Boolean).join('. ');

  // AI style guide: includes LoRA info so the verifier knows what visual style to expect
  const aiStyleGuide = [
    baseStyle,
    jobData.creativeManifest.lora
      ? `STYLE MODEL (LoRA): "${jobData.creativeManifest.lora.name}" — this LoRA model defines the visual style of all AI-generated content. ` +
        `The model's trained aesthetic IS the intended look. Accept its output style as correct.`
      : '',
    jobData.creativeManifest.lora?.trigger_words
      ? `LoRA trigger words: ${jobData.creativeManifest.lora.trigger_words}`
      : '',
  ].filter(Boolean).join('. ');

  // Stock style guide: no LoRA info — stock images are real footage, not AI-generated
  const stockStyleGuide = baseStyle;

  // Derive pipeline-level dimensions for timeout scaling (no extra DB call)
  const pipelineShotCount = shots.length;
  const shotPlanMeta = (shotPlan.metadata || {}) as Record<string, unknown>;
  const pipelineDurationSeconds = (shotPlanMeta.total_duration_seconds as number) ||
    (shots.length > 0 ? Math.max(...shots.map(s => s.end_seconds || 0)) : 0);

  let imagesCompleted = 0;
  let imagesFailed = 0;
  let videosCompleted = 0;
  let videosFailed = 0;
  let mgCompleted = 0;
  let mgFailed = 0;
  const mgSwitchedToVideo = new Set<number>(); // MG shots that failed → will be generated as AI video

  const resolveVisualTreatment = (shot: typeof shots[number]) =>
    shot.visual_treatment || (
      shot.media_type === 'stock'
        ? 'stock'
        : shot.media_type === 'image'
          ? 'ai_image'
          : shot.media_type === 'video'
            ? 'ai_video'
            : 'hybrid'
    );

  // Separate shot types
  const scrapedStock = (metadata.scraped_stock_images || {}) as Record<string, string>;
  const stockImageShots = shots.filter(s => {
    const treatment = resolveVisualTreatment(s);
    return (treatment === 'stock' || treatment === 'archival') &&
      !!scrapedStock[`shot-${s.segment_index}`];
  });
  const imageShots = shots.filter(s => {
    const treatment = resolveVisualTreatment(s);
    return treatment === 'ai_image' || s.media_type === 'image';
  });
  const segmentMaskPrepShots = shots.filter(s =>
    s.segmentation_treatment?.execution_mode === 'segment_mask_prep'
  );
  const segmentationAnimateShots = shots.filter(s =>
    s.render_strategy === 'segment_animate' &&
    s.segmentation_treatment?.execution_mode === 'segment_animate'
  );
  const allVideoShots = shots.filter(s => {
    if (s.render_strategy === 'segment_animate') return false;
    const treatment = resolveVisualTreatment(s);
    if (treatment === 'ai_video') return true;
    if ((treatment === 'stock' || treatment === 'archival') && !scrapedStock[`shot-${s.segment_index}`]) {
      return true;
    }
    return !s.visual_treatment && s.media_type === 'video';
  });
  const segmentationVideoFxShots = allVideoShots.filter(s =>
    s.render_strategy === 'segment_video_fx' &&
    s.segmentation_treatment?.execution_mode === 'segment_video_fx'
  );
  const videoGenerationWaves = buildVideoGenerationWaves(allVideoShots);
  const videoShots = allVideoShots.filter(s =>
    videoGenerationWaves[0]?.shotIndices.includes(s.segment_index)
  );
  const i2vShots: typeof allVideoShots = [];
  if (videoGenerationWaves.length > 1) {
    console.log(
      `${LOG_PREFIX} Planned ${videoGenerationWaves.length} video generation waves: ` +
      `${videoGenerationWaves.map(w => `wave ${w.index} [${w.shotIndices.join(', ')}]`).join(' | ')}`
    );
  }
  const mgShots = shots.filter(s =>
    s.media_type === 'motiongraphic' ||
    resolveVisualTreatment(s) === 'mg_template' ||
    resolveVisualTreatment(s) === 'hybrid'
  );

  // -----------------------------------------------------------------------
  // PARALLEL EXECUTION: GPU pipeline + MG Pass 1 (CPU)
  // -----------------------------------------------------------------------

  // MG Pass 1: Run on CPU with placeholder assets (non-blocking)
  const mgPass1Promise = (async () => {
    if (mgShots.length === 0) {
      return {
        results: new Map<number, string>(),
        persistentState: persistentMotionGraphics,
      };
    }

    const { generateMotionGraphic, buildPlaceholderAssets } = await import(
      '@/lib/services/motion-graphics/pipeline-motion-graphics'
    );
    const { getRecommendedPlaceholderCount, inferTemplateType } = await import(
      '@/lib/services/motion-graphics/strategy'
    );
    const { getOpenRouterApiKey } = await import('@/lib/services/api-keys');
    const apiKey = await getOpenRouterApiKey(jobData.userId);
    const mgResults = new Map<number, string>();
    const persistentStateMap = new Map<string, PersistentMotionGraphicState>(
      Object.entries(persistentMotionGraphics)
    );

    // Build style context from creative manifest for MG visual consistency
    // NOTE: LoRA is NOT included here — LoRA is for GPU image diffusion, not Remotion code gen
    const mgConfig = jobData.creativeManifest.motion_graphics;
    const styleContext = [
      jobData.creativeManifest.style.visual_style
        ? `Visual Style: ${jobData.creativeManifest.style.visual_style}` : '',
      jobData.creativeManifest.style.lighting_mood
        ? `Mood/Lighting: ${jobData.creativeManifest.style.lighting_mood}` : '',
      mgConfig?.theme ? `MG Theme: ${mgConfig.theme}` : '',
      mgConfig?.color_palette?.length ? `Color Palette: ${mgConfig.color_palette.join(', ')}` : '',
      mgConfig?.animation_style ? `Animation Style: ${mgConfig.animation_style}` : '',
      mgConfig?.font_family ? `Font: ${mgConfig.font_family}` : '',
      jobData.creativeManifest.master_creative_prompt
        ? `Creative Direction: ${jobData.creativeManifest.master_creative_prompt}` : '',
    ].filter(Boolean).join('\n');

    for (const shot of mgShots) {
      // Slice word timestamps for this shot's time window (millisecond precision)
      const shotWordTimestamps = allWordTimestamps.filter(
        w => w.start_seconds >= shot.start_seconds && w.start_seconds < shot.end_seconds
      );

      // Format word timestamps as timing context for MG animations
      const timingContext = shotWordTimestamps.length > 0
        ? `\n\nWORD-LEVEL TIMING (use for precise animation sync):\n` +
          shotWordTimestamps.map(w =>
            `"${w.word}" @ ${w.start_seconds.toFixed(3)}s–${w.end_seconds.toFixed(3)}s`
          ).join('\n')
        : '';

      // Build a rich prompt from actual shot data (summary, narration, visual description)
      // Include neighbor context so MG animations complement surrounding shots
      const neighborCtxForMG = getShotNeighborContextForMG(shots as any[], shots.indexOf(shot));

      const mgPrompt = [
        shot.visual_description || shot.summary || '',
        shot.text ? `\nNarration during this shot: "${shot.text}"` : '',
        timingContext,
        neighborCtxForMG,
        styleContext ? `\n\nSTYLE REQUIREMENTS:\n${styleContext}` : '',
      ].filter(Boolean).join('');

      const finalPrompt = mgPrompt || `Motion graphic for shot ${shot.segment_index}`;
      const recommendedTemplateType = shot.template_type || inferTemplateType({
        prompt: shot.visual_description || shot.summary || '',
        routingTags: (shot.visual_elements || []) as import('@/types/video').RoutingTag[],
        imageCount: shot.image_count || 1,
        requestedMode: shot.mg_mode,
        requestedTemplateType: shot.template_type,
        persistentGraphicType: shot.persistent_graphic_type,
      });
      const placeholderCount = getRecommendedPlaceholderCount(
        recommendedTemplateType,
        shot.image_count || 1
      );
      const placeholders = buildPlaceholderAssets(shot.segment_index, placeholderCount);
      const placeholderBundle: MotionGraphicsAssetBundleItem[] = placeholders.map((asset, index) => ({
        id: `shot-${shot.segment_index}-placeholder-${index}`,
        url: asset.url,
        asset_kind: 'placeholder',
        label: asset.description,
        usage: asset.suggestedUsage,
        description: asset.description,
        source: 'placeholder',
        source_shot_index: shot.segment_index,
      }));
      const mgAssetBundle = buildMotionGraphicsAssetBundle({
        shot,
        assetEntry: assetManifestByShot.get(shot.segment_index),
        referenceKit,
        placeholders: placeholderBundle,
        generatedImages: existingGeneratedImages,
        generatedVideos: existingGeneratedVideos,
      });
      shot.mg_asset_bundle = mgAssetBundle;
      const imageAssetsForGeneration = mgAssetBundle.map((asset, index) => ({
        url: asset.url,
        description: asset.description || asset.label || `Motion graphics asset ${index + 1}`,
        suggestedUsage: asset.usage || 'general',
      }));
      const persistentGraphic = shot.persistent_graphic_id && shot.persistent_graphic_type
        ? {
            id: shot.persistent_graphic_id,
            type: shot.persistent_graphic_type,
            statePatch: shot.graphic_state_patch,
            previousState: persistentStateMap.get(shot.persistent_graphic_id),
          }
        : undefined;
      const contextHint = (shot.visual_elements || []).includes('remotion_overlay')
        ? 'text/graphics overlay'
        : (shot.visual_elements || []).includes('remotion_image_manipulation')
          ? 'image manipulation with Ken Burns/montage'
          : (shot.visual_elements || []).includes('remotion_video_manipulation')
            ? 'video annotation/overlay'
            : shot.template_type
              ? `documentary template: ${shot.template_type}`
              : undefined;
      let activeMode = shot.mg_mode;
      let activeTemplate = shot.template_type || recommendedTemplateType;

      // Attempt 1: Full generation with rich prompt
      let success = false;
      let lastError = '';
      try {
        const result = await generateMotionGraphic({
          prompt: finalPrompt,
          duration: shot.duration_seconds,
          shotIndex: shot.segment_index,
          videoId,
          apiKey,
          model: 'google/gemini-3-flash-preview',
          imageAssets: imageAssetsForGeneration,
          narrationText: shot.text || shot.summary,
          routingTags: (shot.visual_elements || []) as import('@/types/video').RoutingTag[],
          contextHint,
          mgMode: activeMode,
          templateType: activeTemplate,
          mgAssetBundle,
          persistentGraphic,
        });

        if (result.success && result.remotionCode) {
          mgResults.set(shot.segment_index, result.remotionCode);
          activeMode = result.mgMode || activeMode;
          activeTemplate = result.templateType || activeTemplate;
          if (persistentGraphic?.id && result.persistentGraphicState) {
            persistentStateMap.set(persistentGraphic.id, result.persistentGraphicState);
          }
          mgCompleted++;
          success = true;
        } else {
          lastError = result.error || 'Unknown failure';
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'Unknown error';
        console.warn(`${LOG_PREFIX} MG shot ${shot.segment_index} attempt 1 failed:`, err);
      }

      // Attempt 2: QC-feedback retry (pass attempt 1's error for targeted fix)
      if (!success) {
        console.warn(`${LOG_PREFIX} MG shot ${shot.segment_index}: retrying with QC feedback`);
        try {
          const retryResult = await generateMotionGraphic({
            prompt: finalPrompt,
            duration: shot.duration_seconds,
            shotIndex: shot.segment_index,
            videoId,
            apiKey,
            model: 'google/gemini-3-flash-preview',
            imageAssets: imageAssetsForGeneration,
            narrationText: shot.text || shot.summary,
            routingTags: (shot.visual_elements || []) as import('@/types/video').RoutingTag[],
            contextHint,
            mgMode: activeMode,
            templateType: activeTemplate,
            mgAssetBundle,
            persistentGraphic,
            previousQCFeedback: lastError,
          });

          if (retryResult.success && retryResult.remotionCode) {
            mgResults.set(shot.segment_index, retryResult.remotionCode);
            activeMode = retryResult.mgMode || activeMode;
            activeTemplate = retryResult.templateType || activeTemplate;
            if (persistentGraphic?.id && retryResult.persistentGraphicState) {
              persistentStateMap.set(persistentGraphic.id, retryResult.persistentGraphicState);
            }
            mgCompleted++;
            success = true;
          } else {
            lastError = retryResult.error || 'QC retry failed';
          }
        } catch (retryErr) {
          lastError = retryErr instanceof Error ? retryErr.message : 'Unknown error';
          console.warn(`${LOG_PREFIX} MG shot ${shot.segment_index} QC-feedback retry failed:`, retryErr);
        }
      }

      // Attempt 3: Switch freeform -> deterministic template lane when supported
      if (!success && activeMode !== 'template') {
        console.warn(`${LOG_PREFIX} MG shot ${shot.segment_index}: switching to template lane`);
        try {
          const retryResult = await generateMotionGraphic({
            prompt: finalPrompt,
            duration: shot.duration_seconds,
            shotIndex: shot.segment_index,
            videoId,
            apiKey,
            model: 'google/gemini-3-flash-preview',
            imageAssets: imageAssetsForGeneration,
            narrationText: shot.text || shot.summary,
            routingTags: (shot.visual_elements || []) as import('@/types/video').RoutingTag[],
            contextHint,
            mgMode: 'template',
            templateType: activeTemplate,
            mgAssetBundle,
            persistentGraphic,
            previousQCFeedback: lastError,
          });

          if (retryResult.success && retryResult.remotionCode) {
            mgResults.set(shot.segment_index, retryResult.remotionCode);
            activeMode = retryResult.mgMode || 'template';
            activeTemplate = retryResult.templateType || activeTemplate;
            if (persistentGraphic?.id && retryResult.persistentGraphicState) {
              persistentStateMap.set(persistentGraphic.id, retryResult.persistentGraphicState);
            }
            mgCompleted++;
            success = true;
          } else {
            lastError = retryResult.error || 'Template retry failed';
          }
        } catch (retryErr) {
          lastError = retryErr instanceof Error ? retryErr.message : 'Unknown error';
          console.warn(`${LOG_PREFIX} MG shot ${shot.segment_index} template retry failed:`, retryErr);
        }
      }

      // Attempt 4: Simplify within the chosen template lane before giving up
      if (!success) {
        console.warn(`${LOG_PREFIX} MG shot ${shot.segment_index}: retrying with simplified template`);
        try {
          const retryResult = await generateMotionGraphic({
            prompt: finalPrompt,
            duration: shot.duration_seconds,
            shotIndex: shot.segment_index,
            videoId,
            apiKey,
            model: 'google/gemini-3-flash-preview',
            imageAssets: imageAssetsForGeneration,
            narrationText: shot.text || shot.summary,
            routingTags: (shot.visual_elements || []) as import('@/types/video').RoutingTag[],
            contextHint,
            mgMode: 'template',
            templateType: activeTemplate,
            mgAssetBundle,
            persistentGraphic,
            previousQCFeedback: lastError,
            simplifiedRetry: true,
          });

          if (retryResult.success && retryResult.remotionCode) {
            mgResults.set(shot.segment_index, retryResult.remotionCode);
            if (persistentGraphic?.id && retryResult.persistentGraphicState) {
              persistentStateMap.set(persistentGraphic.id, retryResult.persistentGraphicState);
            }
            mgCompleted++;
            success = true;
          }
        } catch (retryErr) {
          console.warn(`${LOG_PREFIX} MG shot ${shot.segment_index} simplified template retry failed:`, retryErr);
        }
      }

      if (!success) {
        mgSwitchedToVideo.add(shot.segment_index);
        console.warn(`${LOG_PREFIX} MG shot ${shot.segment_index}: all MG attempts failed — switching to AI video`);
        mgFailed++;
      }
    }

    return {
      results: mgResults,
      persistentState: Object.fromEntries(persistentStateMap),
    };
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
    const _computeVideoTimeoutMs = (durationSeconds: number) =>
      Math.max(60_000, durationSeconds * 10 * 1_000 * MAX_VERIFY_ATTEMPTS);

    console.log(`${LOG_PREFIX} Timeouts: image=${IMAGE_GEN_TIMEOUT_MS}ms, video=computed per-shot (1:10 ratio × ${MAX_VERIFY_ATTEMPTS} attempts)`);

    // --- STOCK-LED IMAGES ---
    if (stockImageShots.length > 0) {
      const stockGeneratedImages: Record<string, string> = {};
      const stockImageProvenance: Record<string, string> = {};
      for (const shot of stockImageShots) {
        const shotKey = `shot-${shot.segment_index}`;
        const stockUrl = scrapedStock[shotKey];
        if (!stockUrl) continue;
        stockGeneratedImages[shotKey] = stockUrl;
        stockImageProvenance[shotKey] = 'stock_source';
        generatedAssets.set(`placeholder://shot-${shot.segment_index}/asset-0`, stockUrl);
      }

      if (Object.keys(stockGeneratedImages).length > 0) {
        await supabase.rpc('merge_video_metadata', {
          p_video_id: videoId,
          p_updates: {
            generated_images: stockGeneratedImages,
            generated_image_provenance: stockImageProvenance,
          },
        });
        imagesCompleted += Object.keys(stockGeneratedImages).length;
        console.log(`${LOG_PREFIX} Registered ${Object.keys(stockGeneratedImages).length} stock-led image shots`);
      }
    }

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
            taskLifecycleOwner: 'orchestrator',
            shotIndex: shot.segment_index,
            aspectRatio: jobData.creativeManifest.style.aspect_ratio,
            loraName: jobData.creativeManifest.lora?.name,
            loraTriggerWords: jobData.creativeManifest.lora?.trigger_words,
          },
          mediaType: 'image',
          shotDescription: shot.summary || `Shot ${shot.segment_index}`,
          timeout: IMAGE_GEN_TIMEOUT_MS,
        },
        {
          userId: jobData.userId,
          videoId,
          taskId,
          entityReferences: entityRefs,
          styleGuide: stockStyleGuide,
          visualStyleTag: jobData.creativeManifest?.style?.visual_style,
          entityIds: shot.entity_refs,
          creativeDirection: [
            jobData.creativeManifest?.master_creative_prompt,
            jobData.creativeManifest?.video_creative_prompt,
          ].filter(Boolean).join('\n') || undefined,
          loraInfo: jobData.creativeManifest?.lora
            ? { name: jobData.creativeManifest.lora.name, triggerWords: jobData.creativeManifest.lora.trigger_words }
            : undefined,
          genre: (jobData.creativeManifest?.script_context as any)?.genre || undefined,
          narrativeBeat: shot.narrative_beat || undefined,
          imageEditInstruction: shot.image_edit_instruction || undefined,
          totalShotCount: pipelineShotCount,
          totalDurationSeconds: pipelineDurationSeconds,
        },
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

      // Granular per-image progress (band: 30–50%)
      const imgTotal = imageShots.length + stockImageShots.length;
      const imgDone = imagesCompleted + imagesFailed;
      await updateTaskStatus(taskId, {
        current_step: `Phase IV: Images ${imgDone}/${imgTotal}...`,
        progress_percent: computePhaseProgress(30, 50, imgDone, imgTotal),
      });
    }

    const totalImageShots = imageShots.length + stockImageShots.length;
    const imageStatusText = totalImageShots > 0
      ? `Images done (${imagesCompleted}/${totalImageShots}). Harmonizing scenes...`
      : 'Generating videos...';
    await updateTaskStatus(taskId, {
      current_step: `Phase IV: ${imageStatusText}`,
      progress_percent: 50, // Entering harmonization sub-band: 50–52
    });

    // --- SCENE HARMONIZATION (proactive image editing) ---
    // After all keyframe images are generated, harmonize visual consistency
    // across thematically related shots before they're used as video keyframes.
    try {
      const { harmonizeSceneImages } = await import('@/lib/services/scene-harmonizer');
      // Fetch current generated_images from metadata
      const { data: freshProject } = await supabase
        .from('video_projects')
        .select('metadata')
        .eq('id', videoId)
        .single();
      const freshMeta = (freshProject?.metadata || {}) as Record<string, unknown>;
      const currentGenImages = (freshMeta.generated_images || {}) as Record<string, string>;

      if (Object.keys(currentGenImages).length >= 2) {
        console.log(`${LOG_PREFIX} Running scene harmonization on ${Object.keys(currentGenImages).length} images...`);
        await updateTaskStatus(taskId, {
          current_step: 'Phase IV: Harmonizing visual consistency across scenes...',
          progress_percent: 50,
        });

        const harmResult = await harmonizeSceneImages(
          jobData.userId,
          videoId,
          shots as any,
          currentGenImages,
          (msg) => console.log(`${LOG_PREFIX} ${msg}`),
        );

        // Merge harmonized image URLs back into metadata
        if (harmResult.harmonized > 0) {
          const mergedImages = { ...currentGenImages, ...harmResult.updatedImages };
          const harmonizedProvenance = Object.fromEntries(
            Object.keys(harmResult.updatedImages).map(key => [key, 'harmonized'])
          );
          await supabase.rpc('merge_video_metadata', {
            p_video_id: videoId,
            p_updates: {
              generated_images: mergedImages,
              generated_image_provenance: harmonizedProvenance,
            },
          });

          console.log(`${LOG_PREFIX} Scene harmonization: ${harmResult.harmonized} images updated, ` +
            `${harmResult.skipped} skipped, ${harmResult.sequences} sequences`);
        } else {
          console.log(`${LOG_PREFIX} Scene harmonization: no shots needed harmonizing`);
        }
      }
    } catch (harmErr) {
      // Non-fatal: harmonization is a best-effort enhancement
      console.warn(`${LOG_PREFIX} Scene harmonization error (non-fatal):`, harmErr);
    }

    // --- SEGMENTATION MASK PREP ---
    // Prep-only segmentation runs before downstream creative edits so masks and
    // object metadata are available for later compositing or editing decisions.
    if (segmentMaskPrepShots.length > 0) {
      console.log(`${LOG_PREFIX} Preparing segmentation masks for ${segmentMaskPrepShots.length} shots...`);
      await updateTaskStatus(taskId, {
        current_step: `Phase IV: Preparing segmentation masks for ${segmentMaskPrepShots.length} shots...`,
        progress_percent: 50,
      });

      const { data: maskPrepMeta } = await supabase
        .from('video_projects')
        .select('metadata')
        .eq('id', videoId)
        .single();
      const maskPrepObj = (maskPrepMeta?.metadata || {}) as Record<string, unknown>;
      const currentImages = (maskPrepObj.generated_images || {}) as Record<string, string>;
      const currentStock = (maskPrepObj.scraped_stock_images || {}) as Record<string, string>;
      const existingMaskPrepOutputs = (maskPrepObj.segmentation_outputs || {}) as Record<string, Record<string, unknown>>;
      const maskPrepUpdates: Record<string, Record<string, unknown>> = {};

      for (const shot of segmentMaskPrepShots) {
        const shotKey = `shot-${shot.segment_index}`;
        const sourceUrl = currentImages[shotKey] || currentStock[shotKey];
        if (!sourceUrl) {
          console.warn(`${LOG_PREFIX} Segment mask prep shot ${shot.segment_index}: no source image available, skipping`);
          continue;
        }

        const lockTtlMs = Math.max(180_000, Math.round((shot.duration_seconds || 4) * 35_000) + 120_000);
        const segResult = await withGpuLock(jobData.userId, async () => {
          return executeSegmentationShot({
            userId: jobData.userId,
            videoId,
            shot: shot as any,
            inputUrl: sourceUrl,
          });
        }, lockTtlMs, videoId);

        if (segResult.success) {
          maskPrepUpdates[shotKey] = {
            mode: 'segment_mask_prep',
            source_media_url: sourceUrl,
            output_url: segResult.mediaUrl,
            lane_decision: shot.render_strategy || 'segment_mask_prep',
            model_version: segResult.metadata?.model_version,
            labels: segResult.metadata?.labels,
            prompt_to_obj_ids: segResult.metadata?.prompt_to_obj_ids,
            object_id_to_prompt_label: segResult.metadata?.object_id_to_prompt_label,
            metadata: segResult.metadata || {},
          };
          console.log(`${LOG_PREFIX} Segment mask prep shot ${shot.segment_index}: prepared`);
        } else {
          state.flagged_shots.push({
            shotIndex: shot.segment_index,
            issue: segResult.error || 'Segmentation mask prep failed',
            suggestions: ['Use unmasked editing or simplify the segmentation request'],
            allAttemptUrls: [sourceUrl],
          });
        }
      }

      if (Object.keys(maskPrepUpdates).length > 0) {
        await supabase.rpc('merge_video_metadata', {
          p_video_id: videoId,
          p_updates: {
            segmentation_outputs: { ...existingMaskPrepOutputs, ...maskPrepUpdates },
          },
        });
      }
    }

    // --- CREATIVE IMAGE EDITING ---
    // After harmonization, apply any image_edit_instruction directives from the
    // shot planner. These are creative edits on keyframe/stock images used in
    // ANY shot type (video, MG, stock overlay, etc.) — e.g., "add clown mask",
    // "make background apocalyptic", "highlight data in red".
    const shotsWithEdits = shots.filter(s => s.image_edit_instruction && s.image_edit_instruction.trim());
    if (shotsWithEdits.length > 0) {
      console.log(`${LOG_PREFIX} Applying ${shotsWithEdits.length} creative image edits...`);
      await updateTaskStatus(taskId, {
        current_step: `Phase IV: Applying ${shotsWithEdits.length} creative image edits...`,
        progress_percent: 51,
      });

      const { applyCreativeEdit } = await import('@/lib/av-script/i2v-processor');

      // Fetch current images (post-harmonization)
      const { data: editMeta } = await supabase
        .from('video_projects')
        .select('metadata')
        .eq('id', videoId)
        .single();
      const editMetaObj = (editMeta?.metadata || {}) as Record<string, unknown>;
      const currentImages = (editMetaObj.generated_images || {}) as Record<string, string>;
      const currentStock = (editMetaObj.scraped_stock_images || {}) as Record<string, string>;
      const editedImages: Record<string, string> = {};

      // Process edits in parallel (they're independent of each other)
      await Promise.all(shotsWithEdits.map(async (shot) => {
        const shotKey = `shot-${shot.segment_index}`;
        const sourceUrl = currentImages[shotKey] || currentStock[shotKey];

        if (!sourceUrl) {
          console.warn(`${LOG_PREFIX} Shot ${shot.segment_index}: No source image for creative edit, skipping`);
          return;
        }

        try {
          const editedUrl = await applyCreativeEdit(
            sourceUrl,
            shot.image_edit_instruction!,
            videoId,
            shot.segment_index,
            jobData.userId,
            jobData.creativeManifest.style.aspect_ratio
          );

          if (editedUrl !== sourceUrl) {
            editedImages[shotKey] = editedUrl;
            console.log(`${LOG_PREFIX} Shot ${shot.segment_index}: Creative edit applied → ${editedUrl}`);
          }
        } catch (err) {
          console.warn(`${LOG_PREFIX} Shot ${shot.segment_index}: Creative edit failed (non-blocking):`, err);
        }
      }));

      // Persist edited images (overwrite keyframes with edited versions)
      if (Object.keys(editedImages).length > 0) {
        const editedProvenance = Object.fromEntries(
          Object.keys(editedImages).map(key => [key, 'creative_edit'])
        );
        await supabase.rpc('merge_video_metadata', {
          p_video_id: videoId,
          p_updates: {
            generated_images: editedImages,
            generated_image_provenance: editedProvenance,
          },
        });
        console.log(`${LOG_PREFIX} Persisted ${Object.keys(editedImages).length} creatively edited images`);
      }
    }

    // --- SEGMENTATION-LED IMAGE → VIDEO SHOTS ---
    if (segmentationAnimateShots.length > 0) {
      console.log(`${LOG_PREFIX} Running ${segmentationAnimateShots.length} segmentation-led animation shots...`);
      await updateTaskStatus(taskId, {
        current_step: `Phase IV: Animating ${segmentationAnimateShots.length} segmentation-led shots...`,
        progress_percent: 52,
      });

      const { data: segMeta } = await supabase
        .from('video_projects')
        .select('metadata')
        .eq('id', videoId)
        .single();
      const segMetaObj = (segMeta?.metadata || {}) as Record<string, unknown>;
      const currentImages = (segMetaObj.generated_images || {}) as Record<string, string>;
      const currentStock = (segMetaObj.scraped_stock_images || {}) as Record<string, string>;
      const existingGeneratedVideosForSeg = (segMetaObj.generated_videos || {}) as Record<string, string>;
      const existingSegmentationOutputs = (segMetaObj.segmentation_outputs || {}) as Record<string, Record<string, unknown>>;
      const segmentedVideos: Record<string, string> = {};
      const segmentationOutputs: Record<string, Record<string, unknown>> = {};

      for (const shot of segmentationAnimateShots) {
        const shotKey = `shot-${shot.segment_index}`;
        const sourceUrl = currentImages[shotKey] || currentStock[shotKey];
        if (!sourceUrl) {
          console.warn(`${LOG_PREFIX} Segmentation animate shot ${shot.segment_index}: no source image found, skipping`);
          continue;
        }

        const lockTtlMs = Math.max(240_000, Math.round((shot.duration_seconds || 4) * 45_000) + 120_000);
        const segResult = await withGpuLock(jobData.userId, async () => {
          return executeSegmentationShot({
            userId: jobData.userId,
            videoId,
            shot: shot as any,
            inputUrl: sourceUrl,
          });
        }, lockTtlMs, videoId);

        if (segResult.success && segResult.mediaUrl) {
          segmentedVideos[shotKey] = segResult.mediaUrl;
          segmentationOutputs[shotKey] = {
            mode: 'segment_animate',
            output_url: segResult.mediaUrl,
            source_media_url: sourceUrl,
            lane_decision: shot.render_strategy || 'segment_animate',
            model_version: segResult.metadata?.model_version,
            labels: segResult.metadata?.labels,
            prompt_to_obj_ids: segResult.metadata?.prompt_to_obj_ids,
            object_id_to_prompt_label: segResult.metadata?.object_id_to_prompt_label,
            metadata: segResult.metadata || {},
          };
          generatedAssets.set(`placeholder://shot-${shot.segment_index}/asset-0`, segResult.mediaUrl);
          videosCompleted++;
          console.log(`${LOG_PREFIX} Segmentation animate shot ${shot.segment_index}: generated ${segResult.mediaUrl}`);
        } else {
          console.warn(`${LOG_PREFIX} Segmentation animate shot ${shot.segment_index} failed: ${segResult.error}`);
          state.flagged_shots.push({
            shotIndex: shot.segment_index,
            issue: segResult.error || 'Segmentation animation failed',
            suggestions: ['Fallback to source image or simplify segmentation treatment'],
            allAttemptUrls: sourceUrl ? [sourceUrl] : [],
          });
        }
      }

      if (Object.keys(segmentedVideos).length > 0) {
        await supabase.rpc('merge_video_metadata', {
          p_video_id: videoId,
          p_updates: {
            generated_videos: { ...existingGeneratedVideosForSeg, ...segmentedVideos },
            segmentation_outputs: { ...existingSegmentationOutputs, ...segmentationOutputs },
          },
        });
      }
    }

    await updateTaskStatus(taskId, {
      current_step: 'Phase IV: Generating videos...',
      progress_percent: 52, // Entering video band: 52–70
    });

    // Cancellation checkpoint: after image shots, before video batch dispatch
    await checkCancelled(taskId);


    // --- VIDEOS (PARALLEL STREAMING VERIFICATION) ---
    // The video-gen worker processes ALL video shots as a single GPU batch
    // (keyframe images → mode switch → video generation). As each video completes
    // (webhook resolves), the orchestrator immediately fires a non-blocking verifier
    // job. All pending verifications are awaited after video-gen finishes.
    //
    // This overlaps the ~3.5 min verification phase with the ~20 min generation
    // phase, eliminating the sequential bottleneck.
    if (videoShots.length > 0) {
      const totalVideoDuration = videoShots.reduce((sum, s) => sum + (s.duration_seconds || 0), 0);
      // Query queue depth to dynamically scale timeout for multi-video contention
      const videoGenQueue = new Queue('video-gen', { connection: getRedisConnection() });
      const { waiting: waitingJobs, active: activeJobs } = await videoGenQueue.getJobCounts('waiting', 'active');
      const queueDepth = waitingJobs + activeJobs;
      const queueMultiplier = queueDepth + 1;
      // Query GPU lock state to estimate lock wait time
      const { isGpuLockHeld } = await import('@/lib/queues/gpu-lock');
      const lockState = await isGpuLockHeld(jobData.userId);
      const lockWaitBufferMs = lockState.held ? (lockState.ttl * 1_000) + 60_000 : 60_000;
      // Dynamic timeout: GPU processing + lock wait buffer + mode switches
      // Uses 2x leniency so timeouts only fire for genuinely stuck batches.
      // Mode switch buffer: 9 min total (image→video + possible OOM cleanup between)
      const gpuProcessingMs = Math.max(300_000, totalVideoDuration * 12 * 1_000 * queueMultiplier * 2);
      const VIDEO_BATCH_TIMEOUT_MS = gpuProcessingMs + lockWaitBufferMs + 540_000;
      console.log(`${LOG_PREFIX} Video batch timeout: ${Math.round(VIDEO_BATCH_TIMEOUT_MS / 1000)}s for ${totalVideoDuration.toFixed(1)}s of video (${videoShots.length} shots, ${queueDepth} jobs ahead → ${queueMultiplier}x multiplier, lock buffer: ${Math.round(lockWaitBufferMs / 1000)}s)`);

      // -----------------------------------------------------------------------
      // STREAMING VERIFICATION: Subscribe to per-shot completions BEFORE
      // dispatching video-gen, so we catch every webhook result.
      // -----------------------------------------------------------------------
      const { verifierQueue } = await import('@/lib/queues/queues');
      const {
        onVideoItemComplete: subscribeVideoComplete,
        offVideoItemComplete: unsubscribeVideoComplete,
      } = await import('@/lib/queues/video-completion-emitter');

      // Collect fundamental failures for batch retry
      const fundamentalFailures: Array<{
        shot: typeof videoShots[0];
        shotKey: string;
        mediaUrl: string;
        feedback: string;
      }> = [];

      // Build a shot lookup by segment_index for O(1) matching in the callback
      const shotByIndex = new Map(videoShots.map(s => [s.segment_index, s]));

      // Array of pending verification promises — settled after video-gen finishes
      const pendingVerifications: Promise<void>[] = [];

      // Subscribe: as each video's webhook resolves, fire a non-blocking verifier job
      subscribeVideoComplete(videoId, (gpuResult) => {
        const shot = shotByIndex.get(gpuResult.shot_index);
        if (!shot) return;

        const shotKey = `shot-${gpuResult.shot_index}`;
        const mediaUrl = gpuResult.media_url;

        if (!mediaUrl || gpuResult.generation_status === 'failed') {
          videosFailed++;
          return;
        }

        // Count as completed and map for MG Pass 2 asset swap (immediately)
        videosCompleted++;
        generatedAssets.set(
          `placeholder://shot-${gpuResult.shot_index}/asset-0`,
          mediaUrl
        );

        // Fire a non-blocking verification job for this shot
        const verifyPromise = (async () => {
          try {
            const verifyQueueEvents = await getQueueEvents('verifier');
            const verifyJob = await verifierQueue.add(`verify-video-${shot.segment_index}`, {
              taskId,
              userId: jobData.userId,
              videoId,
              mediaType: 'video',
              mediaUrl,
              shotDescription: shot.summary || `Shot ${shot.segment_index}`,
              shotIndex: shot.segment_index,
              entityReferences: entityRefs,
              styleGuide: aiStyleGuide,
              visualStyleTag: jobData.creativeManifest?.style?.visual_style,
              // Creative context for dynamic verifier prompt
              creativeDirection: [jobData.creativeManifest?.master_creative_prompt, jobData.creativeManifest?.video_creative_prompt].filter(Boolean).join('\n') || undefined,
              loraInfo: jobData.creativeManifest?.lora ? { name: jobData.creativeManifest.lora.name, triggerWords: jobData.creativeManifest.lora.trigger_words } : undefined,
              genre: (jobData.creativeManifest?.script_context as any)?.genre || undefined,
              narrativeBeat: shot.narrative_beat || undefined,
              imageEditInstruction: shot.image_edit_instruction || undefined,
              // Temporal continuity skipped for parallel path — shots verify out-of-order
            });

            const verifyResult = await verifyJob.waitUntilFinished(verifyQueueEvents, VIDEO_VERIFY_TIMEOUT_MS);
            const verdict = verifyResult?.result;

            // Track verification skips in state
            if (verifyResult?.verificationSkipped) {
              state.verification_skipped = (state.verification_skipped || 0) + 1;
            }

            if (verdict?.verdict === 'PASS') {
              console.log(`${LOG_PREFIX} Video shot ${shot.segment_index} PASSED verification`);
            } else if (verdict?.verdict === 'SOFT_FAIL') {
              console.log(`${LOG_PREFIX} Video shot ${shot.segment_index} SOFT_FAIL: ${verdict.suggested_corrections?.join('; ')}`);
              state.flagged_shots.push({
                shotIndex: shot.segment_index,
                issue: `Quality concerns: ${verdict.suggested_corrections?.join('; ') || 'Minor quality issues'}`,
                suggestions: verdict.suggested_corrections || [],
                allAttemptUrls: [mediaUrl],
              });
            } else if (verdict) {
              console.log(`${LOG_PREFIX} Video shot ${shot.segment_index} FAILED verification: ${verdict.suggested_corrections?.join('; ')}`);

              if (verdict.failure_type === 'fundamental') {
                console.log(`${LOG_PREFIX} Video shot ${shot.segment_index} FUNDAMENTAL failure — queuing for batch retry`);
                fundamentalFailures.push({
                  shot,
                  shotKey,
                  mediaUrl,
                  feedback: verdict.suggested_corrections?.join('. ') || '',
                });
              } else {
                state.flagged_shots.push({
                  shotIndex: shot.segment_index,
                  issue: verdict.suggested_corrections?.join('; ') || 'Failed verification',
                  suggestions: verdict.suggested_corrections || [],
                  allAttemptUrls: [mediaUrl],
                });
              }
            }
          } catch (verifyErr) {
            const isTimeout = verifyErr instanceof Error && verifyErr.message.includes('timed out');
            if (isTimeout) {
              console.warn(`${LOG_PREFIX} Video shot ${shot.segment_index} verification timed out — accepting media`);
              state.verification_skipped = (state.verification_skipped || 0) + 1;
            } else {
              console.warn(`${LOG_PREFIX} Video shot ${shot.segment_index} verification error:`, verifyErr);
            }
            // Still use the video even if verification fails/times out
          }
        })();

        pendingVerifications.push(verifyPromise);
      });

      // 1. Dispatch video-gen ONCE for the entire batch
      const genQueueEvents = await getQueueEvents('video-gen');
      const genJob = await videoGenQueue.add('video-batch', {
        taskId,
        userId: jobData.userId,
        videoId,
        taskLifecycleOwner: 'orchestrator',
        aspectRatio: jobData.creativeManifest.style.aspect_ratio,
        loraName: jobData.creativeManifest.lora?.name,
        loraTriggerWords: jobData.creativeManifest.lora?.trigger_words,
      }, {
        attempts: 1,
      });

      console.log(`${LOG_PREFIX} Dispatched single video-gen batch job ${genJob.id} (with parallel streaming verification)`);
      await genJob.waitUntilFinished(genQueueEvents, VIDEO_BATCH_TIMEOUT_MS);

      // 2. Unsubscribe from events (video-gen is done, no more webhooks)
      unsubscribeVideoComplete(videoId);

      // 3. Read generated_videos from metadata for the batch retry path
      //    (the EventEmitter callback already counted completed/failed)
      const { data: updatedProject } = await supabase
        .from('video_projects')
        .select('metadata')
        .eq('id', videoId)
        .single();

      const updatedMeta = (updatedProject?.metadata || {}) as Record<string, unknown>;
      const generatedVideos = (updatedMeta.generated_videos || {}) as Record<string, string>;
      console.log(`${LOG_PREFIX} Video batch complete: ${Object.keys(generatedVideos).length} URLs in metadata`);

      // 4. Await all pending verifications (most should already be done,
      //    since they ran in parallel with generation)
      if (pendingVerifications.length > 0) {
        console.log(`${LOG_PREFIX} Awaiting ${pendingVerifications.length} pending verifications...`);
        await Promise.allSettled(pendingVerifications);
        console.log(`${LOG_PREFIX} All parallel verifications settled`);
      }

      // 5. Batch retry all fundamental failures in ONE GPU pass
      if (fundamentalFailures.length > 0) {
        console.log(`${LOG_PREFIX} Batch retrying ${fundamentalFailures.length} fundamental failures in single GPU pass`);

        // Build per-shot feedback map
        const retryFeedbackMap: Record<number, string> = {};
        const retryShotIndices: number[] = [];
        for (const f of fundamentalFailures) {
          retryShotIndices.push(f.shot.segment_index);
          retryFeedbackMap[f.shot.segment_index] = f.feedback;
        }

        try {
          const retryJob = await videoGenQueue.add('video-batch-retry', {
            taskId,
            userId: jobData.userId,
            videoId,
            taskLifecycleOwner: 'orchestrator',
            retryShotIndices,
            retryFeedbackMap,
            aspectRatio: jobData.creativeManifest.style.aspect_ratio,
            loraName: jobData.creativeManifest.lora?.name,
            loraTriggerWords: jobData.creativeManifest.lora?.trigger_words,
          }, {
            attempts: 1,
          });

          // Calculate timeout based on total retry duration
          const totalRetryDuration = fundamentalFailures.reduce((sum, f) => sum + (f.shot.duration_seconds || 0), 0);
          const retryLockState = await isGpuLockHeld(jobData.userId);
          const retryLockBufferMs = retryLockState.held ? (retryLockState.ttl * 1_000) + 60_000 : 60_000;
          const BATCH_RETRY_TIMEOUT_MS = Math.max(
            180_000,
            totalRetryDuration * 20 * 1_000 + fundamentalFailures.length * 10_000
          ) + retryLockBufferMs;

          console.log(`${LOG_PREFIX} Dispatched batch retry job ${retryJob.id} for ${retryShotIndices.length} shots (timeout: ${Math.round(BATCH_RETRY_TIMEOUT_MS / 1000)}s)`);
          const retryResult = await retryJob.waitUntilFinished(genQueueEvents, BATCH_RETRY_TIMEOUT_MS);

          // Process batch retry results
          const retryResults = (retryResult?.retryResults || {}) as Record<string, string>;
          let retriesSucceeded = 0;

          for (const f of fundamentalFailures) {
            const retryUrl = retryResults[`shot-${f.shot.segment_index}`];
            if (retryUrl) {
              generatedVideos[f.shotKey] = retryUrl;
              generatedAssets.set(`placeholder://shot-${f.shot.segment_index}/asset-0`, retryUrl);
              retriesSucceeded++;
            } else {
              // Batch retry failed for this shot: flag but still use original
              state.flagged_shots.push({
                shotIndex: f.shot.segment_index,
                issue: f.feedback || 'Failed verification and retry',
                suggestions: f.feedback ? f.feedback.split('. ') : [],
                allAttemptUrls: [f.mediaUrl],
              });
            }
          }

          state.total_retries = (state.total_retries || 0) + retriesSucceeded;
          console.log(`${LOG_PREFIX} Batch retry complete: ${retriesSucceeded}/${fundamentalFailures.length} succeeded`);
        } catch (retryErr) {
          console.warn(`${LOG_PREFIX} Batch retry failed:`, retryErr);
          // Flag all failed shots with their original URLs
          for (const f of fundamentalFailures) {
            state.flagged_shots.push({
              shotIndex: f.shot.segment_index,
              issue: f.feedback || 'Failed verification and batch retry',
              suggestions: f.feedback ? f.feedback.split('. ') : [],
              allAttemptUrls: [f.mediaUrl],
            });
          }
        }
      }
    }

    if (videosFailed > 0) {
      console.warn(`${LOG_PREFIX} ${videosFailed}/${videoShots.length} video shots had no URL in batch results`);
    }

    if (videoGenerationWaves.length > 1) {
      const waveVideoGenQueue = new Queue('video-gen', { connection: getRedisConnection() });
      const waveQueueEvents = await getQueueEvents('video-gen');
      const { verifierQueue } = await import('@/lib/queues/queues');
      const verifyQueueEvents = await getQueueEvents('verifier');

      for (const wave of videoGenerationWaves.slice(1)) {
        await updateTaskStatus(taskId, {
          current_step: `Phase IV: Preparing continuity wave ${wave.index + 1}/${videoGenerationWaves.length}...`,
          progress_percent: 67,
        });

        const { data: continuityMeta } = await supabase
          .from('video_projects')
          .select('metadata')
          .eq('id', videoId)
          .single();
        const continuityMetaObj = (continuityMeta?.metadata || {}) as Record<string, unknown>;
        const currentGeneratedVideos = (continuityMetaObj.generated_videos || {}) as Record<string, string>;
        const currentGeneratedImages = (continuityMetaObj.generated_images || {}) as Record<string, string>;
        const currentImageProvenance = (continuityMetaObj.generated_image_provenance || {}) as Record<string, string>;
        const currentContinuityOutputs = (continuityMetaObj.continuity_outputs || {}) as Record<string, Record<string, unknown>>;
        const manualContinuityOutputs: Record<string, Record<string, unknown>> = {};

        const continuityInputs = wave.continuityDependencies
          .map(dep => {
            const targetShot = allVideoShots.find(shot => shot.segment_index === dep.shotIndex);
            const parentVideoUrl = currentGeneratedVideos[`shot-${dep.parentShotIndex}`]
              || generatedAssets.get(`placeholder://shot-${dep.parentShotIndex}/asset-0`) as string | undefined;

            if (!targetShot || !parentVideoUrl) {
              manualContinuityOutputs[`shot-${dep.shotIndex}`] = {
                parent_shot_index: dep.parentShotIndex,
                source_video_url: parentVideoUrl,
                edit_instruction: targetShot?.angle_change,
                continuity_applied: false,
                status: 'fallback_to_t2v',
                failure_reason: 'Missing parent video for continuity wave',
              };
              return null;
            }

            return {
              shotIndex: dep.shotIndex,
              previousShotIndex: dep.parentShotIndex,
              previousVideoUrl: parentVideoUrl,
              angleChange: targetShot.angle_change || '',
            };
          })
          .filter((input): input is NonNullable<typeof input> => Boolean(input));

        const continuityBatch = continuityInputs.length > 0
          ? await withGpuLock(jobData.userId, async () => {
              return processContinuityWaveBatch({
                userId: jobData.userId,
                videoId,
                aspectRatio: jobData.creativeManifest.style.aspect_ratio,
                shots: continuityInputs,
                existingContinuityOutputs: currentContinuityOutputs,
              });
            }, Math.max(240_000, continuityInputs.length * 90_000), videoId)
          : {
              startFrames: {},
              continuityOutputs: {},
              failedShotIndices: [],
            };

        await supabase.rpc('merge_video_metadata', {
          p_video_id: videoId,
          p_updates: {
            generated_images: {
              ...currentGeneratedImages,
              ...continuityBatch.startFrames,
            },
            generated_image_provenance: {
              ...currentImageProvenance,
              ...Object.fromEntries(
                Object.keys(continuityBatch.startFrames).map(key => [key, 'continuity_edit'])
              ),
            },
            continuity_outputs: {
              ...currentContinuityOutputs,
              ...manualContinuityOutputs,
              ...continuityBatch.continuityOutputs,
            },
          },
        });

        await updateTaskStatus(taskId, {
          current_step: `Phase IV: Generating continuity wave ${wave.index + 1}/${videoGenerationWaves.length}...`,
          progress_percent: 68,
        });

        const waveJob = await waveVideoGenQueue.add(`video-wave-${wave.index}`, {
          taskId,
          userId: jobData.userId,
          videoId,
          taskLifecycleOwner: 'orchestrator',
          shotIndices: wave.shotIndices,
          aspectRatio: jobData.creativeManifest.style.aspect_ratio,
          loraName: jobData.creativeManifest.lora?.name,
          loraTriggerWords: jobData.creativeManifest.lora?.trigger_words,
        }, { attempts: 1 });

        const waveDuration = wave.shotIndices.reduce((sum, shotIndex) => {
          const shot = allVideoShots.find(candidate => candidate.segment_index === shotIndex);
          return sum + (shot?.duration_seconds || 0);
        }, 0);
        const waveTimeout = Math.max(180_000, waveDuration * 20 * 1_000) + 180_000;
        await waveJob.waitUntilFinished(waveQueueEvents, waveTimeout);

        const { data: waveMeta } = await supabase
          .from('video_projects')
          .select('metadata')
          .eq('id', videoId)
          .single();
        const waveMetaObj = (waveMeta?.metadata || {}) as Record<string, unknown>;
        const waveVideos = (waveMetaObj.generated_videos || {}) as Record<string, string>;

        await Promise.allSettled(wave.shotIndices.map(async shotIndex => {
          const mediaUrl = waveVideos[`shot-${shotIndex}`];
          const shot = allVideoShots.find(candidate => candidate.segment_index === shotIndex);
          if (!mediaUrl || !shot) {
            videosFailed++;
            return;
          }

          generatedAssets.set(`placeholder://shot-${shotIndex}/asset-0`, mediaUrl);
          videosCompleted++;

          try {
            const verifyJob = await verifierQueue.add(`verify-video-wave-${shotIndex}`, {
              taskId,
              userId: jobData.userId,
              videoId,
              mediaType: 'video',
              mediaUrl,
              shotDescription: shot.summary || `Shot ${shot.segment_index}`,
              shotIndex: shot.segment_index,
              entityReferences: entityRefs,
              styleGuide: aiStyleGuide,
              visualStyleTag: jobData.creativeManifest?.style?.visual_style,
              creativeDirection: [jobData.creativeManifest?.master_creative_prompt, jobData.creativeManifest?.video_creative_prompt].filter(Boolean).join('\n') || undefined,
              loraInfo: jobData.creativeManifest?.lora ? { name: jobData.creativeManifest.lora.name, triggerWords: jobData.creativeManifest.lora.trigger_words } : undefined,
              genre: (jobData.creativeManifest?.script_context as any)?.genre || undefined,
              narrativeBeat: shot.narrative_beat || undefined,
              imageEditInstruction: shot.image_edit_instruction || undefined,
            });

            const verifyResult = await verifyJob.waitUntilFinished(verifyQueueEvents, VIDEO_VERIFY_TIMEOUT_MS);
            const verdict = verifyResult?.result;
            if (verifyResult?.verificationSkipped) {
              state.verification_skipped = (state.verification_skipped || 0) + 1;
            }

            if (verdict?.verdict === 'SOFT_FAIL' || (verdict && verdict.verdict !== 'PASS')) {
              state.flagged_shots.push({
                shotIndex: shot.segment_index,
                issue: verdict?.suggested_corrections?.join('; ') || 'Wave verification flagged quality issues',
                suggestions: verdict?.suggested_corrections || [],
                allAttemptUrls: [mediaUrl],
              });
            }
          } catch (verifyErr) {
            console.warn(`${LOG_PREFIX} Wave ${wave.index} shot ${shotIndex} verification error:`, verifyErr);
          }
        }));
      }

      console.log(`${LOG_PREFIX} Continuity wave processing complete`);
    }

    // -----------------------------------------------------------------
    // I2V CONTINUITY: Process I2V shots AFTER batch completes
    // -----------------------------------------------------------------
    // I2V shots extract the last frame from the previous shot's video,
    // run it through Qwen-Edit with the angle_change directive, then
    // dispatch a single-shot video-gen job using the edited frame.
    if (i2vShots.length > 0) {
      console.log(`${LOG_PREFIX} Processing ${i2vShots.length} I2V continuity shots...`);
      await updateTaskStatus(taskId, {
        current_step: `Phase IV: Processing ${i2vShots.length} scene-continuity shots...`,
        progress_percent: 67,
      });

      const { processI2VShot } = await import('@/lib/av-script/i2v-processor');
      const i2vVideoGenQueue = new Queue('video-gen', { connection: getRedisConnection() });
      const i2vQueueEvents = await getQueueEvents('video-gen');

      // Fetch current generated videos to find previous shot URLs
      const { data: freshMeta } = await supabase
        .from('video_projects')
        .select('metadata')
        .eq('id', videoId)
        .single();
      const currentGenVideos = ((freshMeta?.metadata as Record<string, unknown>)?.generated_videos || {}) as Record<string, string>;

      for (const i2vShot of i2vShots) {
        const shotIdx = i2vShot.segment_index;

        // Find the previous shot's video URL
        const prevShotIdx = shotIdx - 1;
        const prevVideoUrl = currentGenVideos[`shot-${prevShotIdx}`]
          || generatedAssets.get(`placeholder://shot-${prevShotIdx}/asset-0`) as string;

        if (!prevVideoUrl) {
          console.warn(`${LOG_PREFIX} I2V shot ${shotIdx}: No previous video found (shot ${prevShotIdx}), falling back to T2V`);
          // Fall through to T2V — use existing keyframe
        } else {
          // Run the I2V pipeline: extract frame → quality check → Qwen-Edit
          const i2vResult = await processI2VShot(
            prevVideoUrl,
            i2vShot.angle_change || '',
            videoId,
            shotIdx,
            jobData.userId,
            jobData.creativeManifest.style.aspect_ratio
          );

          if (i2vResult) {
            // Success: store edited frame as keyframe, dispatch video-gen
            try {
              console.log(`${LOG_PREFIX} I2V shot ${shotIdx}: Dispatching video gen with edited start frame`);

              await supabase.rpc('merge_video_metadata', {
                p_video_id: videoId,
                p_updates: {
                  generated_images: { [`shot-${shotIdx}`]: i2vResult.startFrameUrl },
                  generated_image_provenance: { [`shot-${shotIdx}`]: 'i2v_start_frame' },
                },
              });

              const i2vGenJob = await i2vVideoGenQueue.add(`i2v-shot-${shotIdx}`, {
                taskId,
                userId: jobData.userId,
                videoId,
                taskLifecycleOwner: 'orchestrator',
                aspectRatio: jobData.creativeManifest.style.aspect_ratio,
                singleShotIndex: shotIdx,
                loraName: jobData.creativeManifest.lora?.name,
                loraTriggerWords: jobData.creativeManifest.lora?.trigger_words,
              }, { attempts: 1 });

              // Include mode switch buffer for consistency — GPU may need to
              // re-enter video_generation mode if it was briefly switched away
              const i2vTimeout = Math.max(120_000, (i2vShot.duration_seconds || 5) * 12 * 1_000 * 2) + 180_000;
              const i2vGenResult = await i2vGenJob.waitUntilFinished(
                i2vQueueEvents,
                i2vTimeout
              ) as Record<string, unknown>;

              const mediaUrl = i2vGenResult?.mediaUrl as string;
              if (mediaUrl) {
                generatedAssets.set(`placeholder://shot-${shotIdx}/asset-0`, mediaUrl);
                videosCompleted++;
                console.log(`${LOG_PREFIX} I2V shot ${shotIdx}: ✅ Generated with continuity frame`);
                continue; // Next I2V shot
              }
            } catch (err) {
              console.error(`${LOG_PREFIX} I2V shot ${shotIdx}: Video gen failed, falling back to T2V:`, err);
            }
          }
        }

        // Fallback: treat as regular T2V shot (dispatch with existing keyframe)
        console.log(`${LOG_PREFIX} I2V shot ${shotIdx}: Falling back to T2V`);
        try {
          const fallbackJob = await i2vVideoGenQueue.add(`i2v-fallback-${shotIdx}`, {
            taskId,
            userId: jobData.userId,
            videoId,
            taskLifecycleOwner: 'orchestrator',
            aspectRatio: jobData.creativeManifest.style.aspect_ratio,
            singleShotIndex: shotIdx,
            loraName: jobData.creativeManifest.lora?.name,
            loraTriggerWords: jobData.creativeManifest.lora?.trigger_words,
          }, { attempts: 1 });

          const fallbackTimeout = Math.max(120_000, (i2vShot.duration_seconds || 5) * 12 * 1_000 * 2);
          const fallbackResult = await fallbackJob.waitUntilFinished(
            i2vQueueEvents,
            fallbackTimeout
          ) as Record<string, unknown>;

          const fallbackUrl = fallbackResult?.mediaUrl as string;
          if (fallbackUrl) {
            generatedAssets.set(`placeholder://shot-${shotIdx}/asset-0`, fallbackUrl);
            videosCompleted++;
          } else {
            videosFailed++;
          }
        } catch (err) {
          console.error(`${LOG_PREFIX} I2V fallback for shot ${shotIdx} failed:`, err);
          videosFailed++;
        }
      }

      console.log(`${LOG_PREFIX} I2V processing complete: ${i2vShots.length} shots handled`);
    }

    if (segmentationVideoFxShots.length > 0) {
      console.log(`${LOG_PREFIX} Applying segmentation FX to ${segmentationVideoFxShots.length} generated video shots...`);
      await updateTaskStatus(taskId, {
        current_step: `Phase IV: Applying tracked segmentation FX to ${segmentationVideoFxShots.length} shots...`,
        progress_percent: 69,
      });

      const { data: segVideoMeta } = await supabase
        .from('video_projects')
        .select('metadata')
        .eq('id', videoId)
        .single();
      const segVideoMetaObj = (segVideoMeta?.metadata || {}) as Record<string, unknown>;
      const currentVideos = (segVideoMetaObj.generated_videos || {}) as Record<string, string>;
      const existingSegmentationOutputs = (segVideoMetaObj.segmentation_outputs || {}) as Record<string, Record<string, unknown>>;
      const segmentedVideoUpdates: Record<string, string> = {};
      const segmentationOutputs: Record<string, Record<string, unknown>> = {};

      for (const shot of segmentationVideoFxShots) {
        const shotKey = `shot-${shot.segment_index}`;
        const sourceUrl = currentVideos[shotKey] || generatedAssets.get(`placeholder://shot-${shot.segment_index}/asset-0`) as string | undefined;
        if (!sourceUrl) {
          console.warn(`${LOG_PREFIX} Segmentation video FX shot ${shot.segment_index}: missing source video, skipping`);
          continue;
        }

        const lockTtlMs = Math.max(240_000, Math.round((shot.duration_seconds || 4) * 50_000) + 120_000);
        const segResult = await withGpuLock(jobData.userId, async () => {
          return executeSegmentationShot({
            userId: jobData.userId,
            videoId,
            shot: shot as any,
            inputUrl: sourceUrl,
          });
        }, lockTtlMs, videoId);

        if (segResult.success && segResult.mediaUrl) {
          segmentedVideoUpdates[shotKey] = segResult.mediaUrl;
          segmentationOutputs[shotKey] = {
            mode: 'segment_video_fx',
            source_video_url: sourceUrl,
            output_url: segResult.mediaUrl,
            lane_decision: shot.render_strategy || 'segment_video_fx',
            model_version: segResult.metadata?.model_version,
            labels: segResult.metadata?.labels,
            prompt_to_obj_ids: segResult.metadata?.prompt_to_obj_ids,
            object_id_to_prompt_label: segResult.metadata?.object_id_to_prompt_label,
            metadata: segResult.metadata || {},
          };
          generatedAssets.set(`placeholder://shot-${shot.segment_index}/asset-0`, segResult.mediaUrl);
          console.log(`${LOG_PREFIX} Segmentation video FX shot ${shot.segment_index}: updated ${segResult.mediaUrl}`);
        } else {
          console.warn(`${LOG_PREFIX} Segmentation video FX shot ${shot.segment_index} failed: ${segResult.error}`);
          state.flagged_shots.push({
            shotIndex: shot.segment_index,
            issue: segResult.error || 'Segmentation video effect failed',
            suggestions: ['Use the unprocessed video or simplify the segmentation treatment'],
            allAttemptUrls: [sourceUrl],
          });
        }
      }

      if (Object.keys(segmentedVideoUpdates).length > 0) {
        await supabase.rpc('merge_video_metadata', {
          p_video_id: videoId,
          p_updates: {
            generated_videos: { ...currentVideos, ...segmentedVideoUpdates },
            segmentation_outputs: { ...existingSegmentationOutputs, ...segmentationOutputs },
          },
        });
      }
    }

    return generatedAssets;
  })();

  // Wait for both GPU and MG Pass 1 to complete
  const [mgPass1Bundle, generatedAssets] = await Promise.all([
    mgPass1Promise,
    gpuPipelinePromise,
  ]);
  const mgPass1Results = mgPass1Bundle.results;
  const updatedPersistentMotionGraphics = mgPass1Bundle.persistentState;

  // Cancellation checkpoint: after GPU + MG pipelines complete, before persistence
  await checkCancelled(taskId);

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
      p_updates: {
        generated_motion_graphics: mgCodeMap,
        persistent_motion_graphics: updatedPersistentMotionGraphics,
      },
    });

    console.log(`${LOG_PREFIX} MG Pass 1: persisted ${mgPass1Results.size} Remotion compositions`);
  }

  // -----------------------------------------------------------------------
  // M1: Generate AI video for MG shots that failed all attempts
  // -----------------------------------------------------------------------
  if (mgSwitchedToVideo.size > 0) {
    console.log(`${LOG_PREFIX} ${mgSwitchedToVideo.size} MG shots switched to AI video — queueing video generation`);
    
    const switchedShots = shots.filter(s => mgSwitchedToVideo.has(s.segment_index));
    // Collect all MG→video results, then persist in a SINGLE merge call.
    // Previously each iteration called merge_video_metadata({ generated_videos: { "shot-X": url } }),
    // which with JSONB || (shallow merge) REPLACED the entire generated_videos object each time,
    // destroying all videos from the main batch and prior iterations.
    const mgVideoResults: Record<string, string> = {};
    
    // Reuse cached QueueEvents to avoid leaking Redis connections per MG shot
    const mgVideoQueue = new Queue('video-gen', { connection: getRedisConnection() });
    const mgVideoQueueEvents = await getQueueEvents('video-gen');

    for (const shot of switchedShots) {
      try {
        
        const genJob = await mgVideoQueue.add(`mg-to-video-${shot.segment_index}`, {
          taskId,
          userId: jobData.userId,
          videoId,
          taskLifecycleOwner: 'orchestrator',
          singleShotIndex: shot.segment_index,
          aspectRatio: jobData.creativeManifest.style.aspect_ratio,
          loraName: jobData.creativeManifest.lora?.name,
          loraTriggerWords: jobData.creativeManifest.lora?.trigger_words,
        });

        // Dynamic timeout: video duration × 24x (12x gen ratio × 2x leniency) + mode switch buffer
        if (!shot.duration_seconds || shot.duration_seconds <= 0) {
          throw new Error(`[Orchestrator] Shot ${shot.segment_index} has no valid duration_seconds — pipeline timing data is incomplete.`);
        }
        const shotDuration = shot.duration_seconds;
        const timeout = Math.max(300_000, shotDuration * 24 * 1_000 + 180_000);
        const result = await genJob.waitUntilFinished(mgVideoQueueEvents, timeout);
        const videoUrl = result?.mediaUrl || result?.url;
        
        if (videoUrl) {
          const shotKey = `shot-${shot.segment_index}`;
          mgVideoResults[shotKey] = videoUrl;
          generatedAssets.set(`placeholder://shot-${shot.segment_index}/asset-0`, videoUrl);
          videosCompleted++;
          console.log(`${LOG_PREFIX} MG→Video shot ${shot.segment_index}: generated successfully`);
        } else {
          videosFailed++;
          console.warn(`${LOG_PREFIX} MG→Video shot ${shot.segment_index}: generation returned no URL`);
        }
      } catch (err) {
        videosFailed++;
        console.error(`${LOG_PREFIX} MG→Video shot ${shot.segment_index}: generation failed:`, err);
      }
    }

    // Batch persist ALL MG→video results in a single merge call
    if (Object.keys(mgVideoResults).length > 0) {
      await supabase.rpc('merge_video_metadata', {
        p_video_id: videoId,
        p_updates: { generated_videos: mgVideoResults },
      });
      console.log(`${LOG_PREFIX} MG→Video: persisted ${Object.keys(mgVideoResults).length} videos in single batch`);
    }
    
    (state as any).mg_switched_to_video = mgSwitchedToVideo.size;
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

      const placeholderMatches = [...pass1Code.matchAll(new RegExp(`placeholder://shot-${shotIdx}/asset-(\\d+)`, 'g'))];
      const placeholderKeys = [...new Set(placeholderMatches.map((match) => match[0]))];

      for (const placeholderKey of placeholderKeys) {
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
    progress_percent: 75, // End of production band
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
    progress_percent: 75, // Band: 75–90
  });

  const { editAssemblyQueue } = await import('@/lib/queues/queues');
  const queueEvents = await getQueueEvents('edit-assembly-workflow');

  const assemblyJob = await editAssemblyQueue.add('closed-loop-assembly', {
    taskId,
    userId: jobData.userId,
    videoId,
    taskLifecycleOwner: 'orchestrator',
  });

  // Dynamic timeout: base 120s + 15s per shot, clamped [180s, 900s]
  // Query shot count from metadata (already in DB after Phase II)
  let shotCount = 30; // sensible fallback
  try {
    const supabase = getSupabaseServiceClient();
    const { data: meta } = await supabase
      .from('video_projects')
      .select('metadata')
      .eq('id', videoId)
      .single();
    // Read from shot_plan.shots (closed-loop pipeline), fall back to
    // av_script_part1.shots (legacy) for correct timeout calculation
    const shots = (meta?.metadata as any)?.shot_plan?.shots
      || (meta?.metadata as any)?.av_script_part1?.shots;
    if (Array.isArray(shots)) shotCount = shots.length;
  } catch { /* use fallback */ }
  // Dynamic timeout: generous bounds for large videos (30 min max for hour-long content)
  const dynamicTimeoutMs = calculateAssemblyTimeout(shotCount);
  console.log(`${LOG_PREFIX} Assembly timeout: ${dynamicTimeoutMs / 1000}s for ${shotCount} shots`);
  const assemblyResult = await assemblyJob.waitUntilFinished(queueEvents, dynamicTimeoutMs);

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
  const { taskId, userId, videoId, creativeManifest, userSystemPrompt, scriptContent: _scriptContent, entities } = job.data;
  const resumeFromSequencePreview = job.data.resumeFromPhase === 'asset_retrieval';

  console.log(`${LOG_PREFIX} Starting closed-loop pipeline for video ${videoId}`);

  let state = createInitialState();

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
              taskLifecycleOwner: 'orchestrator',
              shotIndex: -1, // Sentinel: not a real shot
              prompt: portraitPrompt,
              aspectRatio: creativeManifest.style.aspect_ratio,
              isPortrait: true,
            }
          );

          const portraitResult = await portraitJob.waitUntilFinished(imageGenQueueEvents, calculatePortraitTimeout());
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

    await appendActivityEvent(taskId, {
      phase: 'init',
      type: 'info',
      message: 'Pipeline initialized — worker prompts generated',
    });

    if (resumeFromSequencePreview) {
      const { data: existingProject } = await supabase
        .from('video_projects')
        .select('closed_loop_state, metadata')
        .eq('id', videoId)
        .single();

      const existingState = existingProject?.closed_loop_state as ClosedLoopState | null;
      const existingMetadata = (existingProject?.metadata || {}) as Record<string, unknown>;
      const persistedShotCount = Array.isArray((existingMetadata.shot_plan as Record<string, unknown> | undefined)?.shots)
        ? (((existingMetadata.shot_plan as Record<string, unknown>).shots as unknown[])?.length || 0)
        : 0;

      if (existingState) {
        state = {
          ...createInitialState(),
          ...existingState,
          phase: 'shot_planning',
          status: 'running',
          completed_at: undefined,
          phase_data: {
            ...existingState.phase_data,
          },
        };
      }

      state.phase = 'shot_planning';
      state.status = 'running';
      state.completed_at = undefined;
      state.started_at = state.started_at || new Date().toISOString();

      if (!state.phase_data.shot_planning?.shot_count && persistedShotCount > 0) {
        state.phase_data.shot_planning = {
          completed: true,
          shot_count: persistedShotCount,
          iteration: state.phase_data.shot_planning?.iteration || 1,
        };
      }

      await appendActivityEvent(taskId, {
        phase: 'shot_planning',
        type: 'info',
        message: 'Sequence preview approved — resuming from asset retrieval',
      });

      await updateTaskStatus(taskId, {
        status: 'running',
        current_step: 'Sequence preview approved — resuming production...',
        progress_percent: 15,
      });
    }

    // =========================================================================
    // PHASE I: TTS Generation
    // =========================================================================
    if (!resumeFromSequencePreview) {
      state.phase = 'tts';
      state.status = 'running';
      await persistState(videoId, state);

      await appendActivityEvent(taskId, {
        phase: 'tts',
        type: 'phase_start',
        message: 'Phase I: Starting TTS narration generation',
      });

      const ttsResult = await executeTtsPhase(videoId, job.data, taskId);

      state.phase_data.tts = {
        completed: true,
        audio_url: ttsResult.audioUrl,
        timestamps_count: ttsResult.timestampsCount,
      };
      await persistState(videoId, state);
      console.log(`${LOG_PREFIX} Phase I complete: ${ttsResult.timestampsCount} word timestamps`);

      await appendActivityEvent(taskId, {
        phase: 'tts',
        type: 'phase_complete',
        message: `Phase I complete — ${ttsResult.timestampsCount} word timestamps generated`,
      });

      // Cancellation check: abort if user stopped the task
      await checkCancelled(taskId);

      // =========================================================================
      // PHASE II: Shot Planning
      // =========================================================================
      state.phase = 'shot_planning';
      await persistState(videoId, state);

      await appendActivityEvent(taskId, {
        phase: 'shot_planning',
        type: 'phase_start',
        message: 'Phase II: Planning shots aligned to narration timing',
      });

      const shotResult = await executeShotPlanningPhase(videoId, job.data, taskId, workerPrompts);

      state.phase_data.shot_planning = {
        completed: true,
        shot_count: shotResult.shotCount,
        iteration: 1,
      };
      await persistState(videoId, state);
      console.log(`${LOG_PREFIX} Phase II complete: ${shotResult.shotCount} shots planned`);

      await appendActivityEvent(taskId, {
        phase: 'shot_planning',
        type: 'phase_complete',
        message: `Phase II complete — ${shotResult.shotCount} shots planned`,
      });

      // =========================================================================
      // PHASE II-B: Shot Plan Self-Reflection (for long videos only)
      // =========================================================================
      // Lightweight LLM check catches bad plans before expensive GPU generation.
      // P2 Fix: Lowered from 15 to 5 — short videos have proportionally higher
      // impact per shot, so plan errors are MORE damaging, not less (~$0.001/call).
      if (shotResult.shotCount >= 5) {
        console.log(`${LOG_PREFIX} Phase II-B: Self-reflection on ${shotResult.shotCount}-shot plan...`);

        await appendActivityEvent(taskId, {
          phase: 'shot_planning',
          type: 'reflection',
          message: `Self-reflection: Reviewing ${shotResult.shotCount}-shot plan for quality issues`,
        });

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

            await appendActivityEvent(taskId, {
              phase: 'shot_planning',
              type: 'retry',
              message: `Self-reflection found ${reflectionResult.issues.length} major issue(s) — re-planning shots`,
              detail: reflectionResult.issues.join('; '),
            });

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

            await appendActivityEvent(taskId, {
              phase: 'shot_planning',
              type: 'phase_complete',
              message: `Re-plan complete — ${replanResult.shotCount} shots (iteration 2)`,
            });
          } else {
            console.log(`${LOG_PREFIX} Phase II-B: Plan OK (severity: ${reflectionResult.severity})`);

            await appendActivityEvent(taskId, {
              phase: 'shot_planning',
              type: 'info',
              message: `Self-reflection passed — plan quality: ${reflectionResult.severity}`,
            });
          }
        } catch (reflectionError) {
          // Non-blocking: reflection failure shouldn't stop the pipeline
          console.warn(`${LOG_PREFIX} Phase II-B: Self-reflection failed, continuing:`, reflectionError);
        }
      }

      if (job.data.productionControls?.reviewMode === 'sequence_preview') {
        await supabase.rpc('merge_video_metadata', {
          p_video_id: videoId,
          p_updates: {
            shot_plan: {
              metadata: {
                review_state: {
                  review_mode: 'sequence_preview',
                  status: 'pending',
                },
              },
            },
          },
        });

        state.phase = 'shot_planning';
        state.status = 'pending';
        await persistState(videoId, state);

        await appendActivityEvent(taskId, {
          phase: 'shot_planning',
          type: 'info',
          message: 'Sequence preview ready — approve by starting production again to continue from asset retrieval',
        });

        await updateTaskStatus(taskId, {
          status: 'completed',
          current_step: 'Sequence preview ready — start production again to continue',
          progress_percent: 15,
          completed_at: new Date().toISOString(),
        });

        return {
          success: true,
          videoId,
          pausedForSequencePreview: true,
        };
      }

      // Cancellation check: abort if user stopped the task
      await checkCancelled(taskId);
    } else {
      await persistState(videoId, state);
    }

    // =========================================================================
    // PHASE III: Asset Retrieval + SFX
    // =========================================================================
    state.phase = 'asset_retrieval';
    await persistState(videoId, state);

    await appendActivityEvent(taskId, {
      phase: 'asset_retrieval',
      type: 'phase_start',
      message: 'Phase III: Finding stock media and crafting AI image prompts',
    });

    // Run asset retrieval and music generation in parallel.
    // Music generation uses the GPU (audio_creation mode) which is idle during
    // stock scraping — this is the earliest point where TTS + shot plan are available.
    const musicContext = await (async () => {
      try {
        const { data: musicMeta } = await supabase
          .from('video_projects')
          .select('metadata')
          .eq('id', videoId)
          .single();
        const musicMetadata = (musicMeta?.metadata || {}) as Record<string, unknown>;
        const musicWordTimestamps = (musicMetadata.word_timestamps || []) as Array<{ end_seconds: number }>;
        const musicTotalDuration = musicWordTimestamps.length > 0
          ? musicWordTimestamps[musicWordTimestamps.length - 1].end_seconds
          : 60;
        const musicShotPlan = (musicMetadata.shot_plan || {}) as Record<string, unknown>;
        const musicShots = (musicShotPlan.shots || []) as Array<{
          segment_index: number;
          start_seconds: number;
          end_seconds: number;
          summary?: string;
          text?: string;
          narrative_beat?: string;
          scene_id?: string;
        }>;
        return {
          userId: job.data.userId,
          videoId,
          totalDurationSeconds: musicTotalDuration,
          scriptContent: job.data.scriptContent,
          // Creative context — pass actual creative direction, not visual style
          creativeDirection: [
            job.data.creativeManifest?.master_creative_prompt,
            job.data.creativeManifest?.video_creative_prompt,
          ].filter(Boolean).join('\n') || undefined,
          genre: (job.data.creativeManifest?.script_context as any)?.genre || undefined,
          mood: job.data.creativeManifest?.style?.lighting_mood,
          visualStyle: job.data.creativeManifest?.style?.visual_style,
          shots: musicShots,
        };
      } catch (err) {
        console.warn(`${LOG_PREFIX} Failed to build music context:`, err);
        return null;
      }
    })();

    const musicPromise = musicContext
      ? (async () => {
          try {
            const { generateBackgroundMusic } = await import('@/lib/services/music-generation-service');
            const result = await generateBackgroundMusic(musicContext);
            console.log(`${LOG_PREFIX} Music generation complete: ${result.segments.length} segments`);
            return result;
          } catch (err) {
            console.error(`${LOG_PREFIX} Music generation failed (non-blocking):`, err);
            return null;
          }
        })()
      : Promise.resolve(null);

    const [assetResult, musicResult] = await Promise.all([
      executeAssetRetrievalPhase(videoId, job.data, taskId, workerPrompts, state.phase_data.shot_planning?.shot_count || 30),
      musicPromise,
    ]);

    // Persist music results immediately
    if (musicResult && musicResult.segments.length > 0) {
      await supabase.rpc('merge_video_metadata', {
        p_video_id: videoId,
        p_updates: {
          generated_music: {
            segments: musicResult.segments,
            style_summary: musicResult.style_summary,
            total_duration_seconds: musicResult.total_duration_seconds,
            generation_time_seconds: musicResult.generation_time_seconds,
          },
        },
      });
      console.log(`${LOG_PREFIX} Music: persisted ${musicResult.segments.length} segments (${musicResult.style_summary})`);
    }

    state.phase_data.asset_retrieval = {
      completed: true,
      stock_matched: assetResult.stockMatched,
      prompts_generated: assetResult.promptsGenerated,
    };
    await persistState(videoId, state);
    console.log(`${LOG_PREFIX} Phase III complete: ${assetResult.promptsGenerated} prompts generated${musicResult ? `, ${musicResult.segments.length} music segments` : ''}`);

    await appendActivityEvent(taskId, {
      phase: 'asset_retrieval',
      type: 'phase_complete',
      message: `Phase III complete — ${assetResult.stockMatched} stock matched, ${assetResult.promptsGenerated} AI prompts crafted${musicResult ? `, ${musicResult.segments.length} music segments generated` : ''}`,
    });

    // Cancellation check: abort if user stopped the task
    await checkCancelled(taskId);

    // =========================================================================
    // PHASE IV: Production (GPU + MG)
    // =========================================================================
    state.phase = 'production';
    await persistState(videoId, state);

    await appendActivityEvent(taskId, {
      phase: 'production',
      type: 'phase_start',
      message: 'Phase IV: Generating AI images, videos, and motion graphics',
    });

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

    await appendActivityEvent(taskId, {
      phase: 'production',
      type: 'phase_complete',
      message: `Phase IV complete — ${prodResult.imagesCompleted} images, ${prodResult.videosCompleted} videos, ${prodResult.mgCompleted} motion graphics`,
      detail: prodResult.imagesFailed + prodResult.videosFailed > 0
        ? `${prodResult.imagesFailed} images failed, ${prodResult.videosFailed} videos failed`
        : undefined,
    });

    // Persist pipeline diagnostics for the Pipeline Debugger
    try {
      const { data: diagProject } = await supabase
        .from('video_projects')
        .select('metadata')
        .eq('id', videoId)
        .single();
      const diagMeta = (diagProject?.metadata || {}) as Record<string, unknown>;
      const diagShots = ((diagMeta.shot_plan as any)?.shots || (diagMeta.av_script_part1 as any)?.shots || []) as any[];
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

      // Also persist flagged shots as verifier_issues for the edit-assembly worker
      // These become `mediaIssues` in the editor's Issues panel
      if (state.flagged_shots.length > 0) {
        const verifierIssues = state.flagged_shots.map(flag => ({
          shotIndex: flag.shotIndex,
          severity: 'warning' as const,
          type: 'quality_concern',
          title: `Shot ${flag.shotIndex + 1}: Quality concerns`,
          description: flag.suggestions?.join('; ') || flag.issue || 'Verification flagged quality issues',
        }));

        await supabase.rpc('merge_video_metadata', {
          p_video_id: videoId,
          p_updates: { verifier_issues: verifierIssues },
        });
        console.log(`${LOG_PREFIX} Persisted ${verifierIssues.length} verifier issues for editor`);
      }
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

        await appendActivityEvent(taskId, {
          phase: 'production',
          type: 'info',
          message: `Analyzing ${prodResult.videosCompleted} video clips for optimal trim points`,
        });

        await updateTaskStatus(taskId, {
          status: 'running',
          current_step: 'Phase IV-B: Analyzing video clips for optimal trim points...',
          progress_percent: 73, // Within MG/trim band: 70–75
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
        // M6 Fix: Read from generated_videos['shot-{index}'] — the actual key format
        // written by the video-gen worker. Previously read generated_media[index].url
        // which was the old av-script format (always empty → zero clips trimmed).
        const generatedVideoUrls = (projMeta.generated_videos || {}) as Record<string, string>;

        // Collect video shots with their generated URLs
        // Use segment_index (not array index) for correct video URL lookup
        // when shot plans have non-contiguous indices (mixed media types)
        const videoShots = allShots
          .map((shot) => {
            const segIdx = Number(shot.segment_index ?? shot.index);
            return {
              shotIndex: segIdx,
              mediaUrl: generatedVideoUrls[`shot-${segIdx}`] || '',
              description: String(shot.description || shot.summary || ''),
              durationSeconds: Number(shot.duration_seconds) || 0,
            };
          })
          .filter(s => s.mediaUrl && !isNaN(s.shotIndex));

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

    // Cancellation check: abort if user stopped the task
    await checkCancelled(taskId);

    // =========================================================================
    // PHASE V: Auto-Assembly
    // =========================================================================
    state.phase = 'assembly';
    await persistState(videoId, state);

    await appendActivityEvent(taskId, {
      phase: 'assembly',
      type: 'phase_start',
      message: 'Phase V: Assembling timeline in Video Editor',
    });

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
      // agentEdl stores clips in a flat array (agentEdl.clips[]),
      // NOT nested under tracks. Use max end-time of main-video clips
      // for duration to avoid double-counting overlay tracks.
      if (agentEdl?.clips && Array.isArray(agentEdl.clips)) {
        for (const clip of agentEdl.clips) {
          edlClipCount++;
          const dur = clip.duration || 0;
          if (dur > 10) edlClipsOver10s++;
          // Track timeline end only for main-video clips
          if (clip.trackId === 'main-video') {
            const clipEnd = (clip.startTime || 0) + dur;
            if (clipEnd > edlTotalDuration) edlTotalDuration = clipEnd;
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

      await appendActivityEvent(taskId, {
        phase: 'assembly',
        type: 'reflection',
        message: 'Reviewing overall video pacing and timing',
      });

      await updateTaskStatus(taskId, {
        status: 'running',
        current_step: 'Phase V-B: Reviewing overall video pacing...',
        progress_percent: 90, // Band: 90–95
      });

      const { reviewTimelinePacing } = await import('@/lib/services/pacing-editor');
      const pacingResult = await reviewTimelinePacing(videoId, userId);

      if (pacingResult.hasAdjustments) {
        console.log(
          `${LOG_PREFIX} Phase V-B: ${pacingResult.adjustments.length} pacing adjustments recommended`
        );
        await appendActivityEvent(taskId, {
          phase: 'assembly',
          type: 'info',
          message: `Pacing review: ${pacingResult.adjustments.length} adjustments recommended`,
        });
      } else {
        console.log(`${LOG_PREFIX} Phase V-B: Pacing looks good — ${pacingResult.overallAssessment}`);
        await appendActivityEvent(taskId, {
          phase: 'assembly',
          type: 'info',
          message: `Pacing review passed — ${pacingResult.overallAssessment}`,
        });
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

    await appendActivityEvent(taskId, {
      phase: 'assembly',
      type: 'phase_complete',
      message: 'Phase V complete — timeline assembled and pacing reviewed',
    });

    await appendActivityEvent(taskId, {
      phase: 'complete',
      type: 'phase_complete',
      message: `Pipeline complete — ${prodResult.imagesCompleted} images, ${prodResult.videosCompleted} videos, ${prodResult.mgCompleted} MG`,
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

    // --- GPU auto-shutdown check ---
    try {
      const { shouldShutdown, activeCount } = await decrementActiveProductions(userId);
      if (shouldShutdown) {
        console.log(`${LOG_PREFIX} Auto-shutting down GPU VM — no more active productions`);
        await appendActivityEvent(taskId, {
          phase: 'complete',
          type: 'info',
          message: 'GPU VM auto-shutdown initiated (all productions complete)',
        });
        await executeGpuShutdown(userId);
      } else {
        console.log(`${LOG_PREFIX} Production complete — ${activeCount} other production(s) still active, GPU stays on`);
      }
    } catch (shutdownErr) {
      console.warn(`${LOG_PREFIX} GPU shutdown tracking failed (non-fatal):`, shutdownErr);
    }

    return { success: true, videoId, summary };

  } catch (error) {
    // Clean exit for cancelled tasks — no error logging or failure state
    if (error instanceof CancellationError) {
      console.log(`${LOG_PREFIX} Pipeline cancelled for video ${videoId} — clean exit`);
      state.status = 'cancelled';
      try {
        await persistState(videoId, state);
      } catch { /* ignore */ }

      // Decrement GPU production counter on cancellation
      try {
        const { shouldShutdown } = await decrementActiveProductions(userId);
        if (shouldShutdown) {
          console.log(`${LOG_PREFIX} Cancelled — auto-shutting down GPU (last production)`);
          await executeGpuShutdown(userId);
        }
      } catch { /* non-fatal */ }

      return { success: false, cancelled: true, videoId };
    }

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

    await appendActivityEvent(taskId, {
      phase: state.phase,
      type: 'warning',
      message: `Pipeline failed in phase: ${state.phase}`,
      detail: error instanceof Error ? error.message : 'Unknown error',
    });

    await updateTaskStatus(taskId, {
      status: 'failed',
      current_step: `Failed in phase: ${state.phase}`,
      // Don't reset progress — keep it at the last value so the UI shows the correct failed phase
      error_message: error instanceof Error ? error.message : 'Unknown error',
    });

    // Decrement GPU production counter on failure
    try {
      const { shouldShutdown } = await decrementActiveProductions(userId);
      if (shouldShutdown) {
        console.log(`${LOG_PREFIX} Failed — auto-shutting down GPU (last production)`);
        await executeGpuShutdown(userId);
      }
    } catch { /* non-fatal */ }

    throw error;
  }
};
