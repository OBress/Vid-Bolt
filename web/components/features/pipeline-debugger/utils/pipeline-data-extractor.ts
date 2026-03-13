/**
 * Pipeline Data Extractor
 * ============================================================================
 * Extracts structured pipeline step data from video_projects metadata.
 * Transforms raw Supabase data into PipelineRun / StepData used by the inspector.
 */

import type {
  PipelineRun,
  PipelineRunSummary,
  PipelineStep,
  StepData,
  StepStatus,
  StepMedia,
  StepTiming,
  StepError,
  StepPrompt,
  StepLog,
} from '../types/pipeline-debugger';
import { STEP_CONFIGS, stageToStep, ALL_STEPS } from './step-config';

// ============================================================================
// TYPES — Raw video project from API
// ============================================================================

interface RawVideoProject {
  id: string;
  name: string;
  project_id: string;
  created_at: string;
  updated_at: string;
  current_stage: string;
  idea?: string;
  script_content?: string;
  audio_url?: string;
  metadata?: Record<string, unknown>;
  audio_task_id?: string;
  outline_task_id?: string;
  script_task_id?: string;
  video_task_id?: string;
  export_task_id?: string;
}

/** Linked task record from the tasks table */
interface LinkedTask {
  id: string;
  type: string;
  status: string;
  name: string;
  started_at?: string | null;
  completed_at?: string | null;
  steps?: Array<{
    id: string;
    name: string;
    phase: string;
    status: string;
    started_at?: string;
    completed_at?: string;
    duration_ms?: number;
    token_count?: number;
    error?: string;
  }>;
  activity_events?: Array<{
    timestamp: string;
    phase: string;
    type: string;
    message: string;
    detail?: string;
  }>;
  retry_count?: number;
  current_phase?: string;
  progress_percent?: number;
  error_message?: string;
}

/** Supplementary data from the API response (not in video_projects directly) */
export interface SupplementaryData {
  audioChunks?: Array<Record<string, unknown>>;
  linkedTasks?: LinkedTask[];
}

// ============================================================================
// MAIN EXTRACTOR
// ============================================================================

/**
 * Extract a full PipelineRun from a raw video project record.
 */
export function extractPipelineRun(
  video: RawVideoProject,
  supplementary?: SupplementaryData
): PipelineRun {
  const meta = (video.metadata || {}) as Record<string, unknown>;
  const currentStepNum = stageToStep(video.current_stage);
  const tasks = supplementary?.linkedTasks || [];

  // Build task-to-step mapping
  const tasksByStep = mapTasksToSteps(video, tasks);

  const steps: StepData[] = ALL_STEPS.map((step) =>
    extractStepData(step, video, meta, currentStepNum, tasksByStep[step] || null, supplementary)
  );

  return {
    id: video.id,
    videoName: video.name || 'Untitled',
    projectId: video.project_id,
    createdAt: video.created_at,
    updatedAt: video.updated_at,
    currentStage: video.current_stage,
    steps,
    totalDurationMs: null, // Computed from step timings if available
    metadata: meta,
  };
}

/**
 * Extract a summary for list views (lighter weight than full extraction).
 */
export function extractRunSummary(video: RawVideoProject): PipelineRunSummary {
  const currentStepNum = stageToStep(video.current_stage);
  const meta = (video.metadata || {}) as Record<string, unknown>;

  return {
    id: video.id,
    videoName: video.name || 'Untitled',
    currentStage: video.current_stage,
    stepsCompleted: Math.max(0, currentStepNum - 1),
    totalSteps: 8,
    createdAt: video.created_at,
    updatedAt: video.updated_at,
    hasErrors: !!meta.generationError,
  };
}

// ============================================================================
// TASK-TO-STEP MAPPING
// ============================================================================

/**
 * Map linked tasks to pipeline steps based on task type and video task IDs.
 */
function mapTasksToSteps(
  video: RawVideoProject,
  tasks: LinkedTask[]
): Record<number, LinkedTask> {
  const map: Record<number, LinkedTask> = {};

  for (const task of tasks) {
    // Map by task ID on the video project
    if (task.id === video.audio_task_id) {
      map[4] = task; // Audio is step 4
    } else if (task.id === video.script_task_id) {
      map[3] = task; // Script is step 3
    } else if (task.id === video.video_task_id) {
      // The video/closed-loop task covers steps 5-6
      map[5] = task;
      map[6] = task;
    } else if (task.id === video.export_task_id) {
      map[8] = task; // Export is step 8
    }

    // Also map by task type as fallback
    if (!map[1] && (task.type === 'outline' || task.type === 'universal_script')) {
      map[1] = task;
    }
    if (!map[3] && task.type === 'script_writing') {
      map[3] = task;
    }
    if (!map[5] && task.type === 'closed_loop') {
      map[5] = task;
      if (!map[6]) map[6] = task;
    }
    if (!map[7] && task.type === 'edit_assembly') {
      map[7] = task;
    }
  }

  return map;
}

// ============================================================================
// STEP DATA EXTRACTION
// ============================================================================

function extractStepData(
  step: PipelineStep,
  video: RawVideoProject,
  meta: Record<string, unknown>,
  currentStepNum: number,
  linkedTask: LinkedTask | null,
  supplementary?: SupplementaryData
): StepData {
  const config = STEP_CONFIGS[step];

  return {
    step,
    label: config.label,
    status: getStepStatus(step, currentStepNum, meta),
    inputs: extractStepInputs(step, video, meta, supplementary),
    outputs: extractStepOutputs(step, video, meta),
    config: extractStepConfig(step, meta),
    prompts: extractStepPrompts(step, meta),
    timing: extractStepTiming(step, meta, linkedTask),
    errors: extractStepErrors(step, meta),
    logs: extractStepLogs(step, meta, linkedTask),
    media: extractStepMedia(step, meta),
  };
}

function getStepStatus(
  step: PipelineStep,
  currentStepNum: number,
  meta: Record<string, unknown>
): StepStatus {
  if (meta.generationError && step === currentStepNum) return 'error';
  if (step < currentStepNum) return 'complete';
  if (step === currentStepNum) return 'in-progress';
  return 'not-reached';
}

// ============================================================================
// INPUT EXTRACTION PER STEP
// ============================================================================

/**
 * Get audio chunks from metadata, checking both naming conventions.
 */
function getAudioChunks(
  meta: Record<string, unknown>,
  supplementary?: SupplementaryData
): unknown[] {
  // Priority: supplementary audioChunks > meta.audio_chunks > meta.audioChunks
  if (supplementary?.audioChunks && supplementary.audioChunks.length > 0) {
    return supplementary.audioChunks;
  }
  if (Array.isArray(meta.audio_chunks)) return meta.audio_chunks;
  if (Array.isArray(meta.audioChunks)) return meta.audioChunks;
  return [];
}

function extractStepInputs(
  step: PipelineStep,
  video: RawVideoProject,
  meta: Record<string, unknown>,
  supplementary?: SupplementaryData
): Record<string, unknown> {
  switch (step) {
    case 1: // Outline
      return {
        prompt: video.idea || '',
      };
    case 2: // Stock Media
      return {
        assetRegistry: getNestedValue(meta, 'outlineOutput.assetRegistry'),
        stockMediaLevel: getNestedValue(meta, 'outlineConfig.stockMediaLevel'),
      };
    case 3: // Script
      return {
        outlineOutput: meta.outlineOutput ? summarizeObject(meta.outlineOutput) : null,
        scriptConfig: meta.scriptConfig || null,
      };
    case 4: // Audio
      return {
        script: video.script_content ? `${video.script_content.substring(0, 500)}...` : null,
        scriptWordCount: video.script_content?.split(/\s+/).length || 0,
      };
    case 5: { // Shot Creation
      const audioChunks = getAudioChunks(meta, supplementary);
      return {
        audioChunkCount: audioChunks.length,
        hasOutline: !!meta.outlineOutput,
        hasScript: !!video.script_content,
      };
    }
    case 6: // Scene Review
      return {
        shotCount: getNestedValue(meta, 'shot_plan.shots.length')
          || getNestedValue(meta, 'av_script_part1.shots.length')
          || getNestedValue(meta, 'avScriptPart1Output.shots.length')
          || 0,
        hasAssetReferenceImages: !!meta.assetReferenceImages,
        hasStockMedia: Array.isArray(meta.stockMediaResults) &&
          (meta.stockMediaResults as unknown[]).length > 0,
      };
    case 7: // Editor
      return {
        mediaCount: Array.isArray(meta.generatedMedia)
          ? (meta.generatedMedia as unknown[]).length
          : 0,
        hasEdl: !!meta.edl,
        hasAgentEdl: !!meta.agentEdl,
      };
    case 8: // Export
      return {
        hasEditorState: !!meta.editor_state,
      };
    default:
      return {};
  }
}

// ============================================================================
// OUTPUT EXTRACTION PER STEP
// ============================================================================

function extractStepOutputs(
  step: PipelineStep,
  video: RawVideoProject,
  meta: Record<string, unknown>
): Record<string, unknown> {
  switch (step) {
    case 1:
      return {
        outlineOutput: meta.outlineOutput || null,
        outlineConfig: meta.outlineConfig || null,
      };
    case 2:
      return {
        stockMediaResults: meta.stockMediaResults || null,
        stockMediaCount: Array.isArray(meta.stockMediaResults)
          ? (meta.stockMediaResults as unknown[]).length
          : 0,
      };
    case 3:
      return {
        scriptOutput: meta.scriptOutput || null,
        universalScriptOutput: meta.universalScriptOutput || null,
        scriptContent: video.script_content || null,
        scriptWordCount: video.script_content?.split(/\s+/).length || 0,
      };
    case 4: {
      const audioChunks = (meta.audio_chunks || meta.audioChunks || []) as unknown[];
      return {
        audioUrl: video.audio_url || null,
        audioChunks: audioChunks,
        audioChunkCount: audioChunks.length,
      };
    }
    case 5:
      return {
        avScriptPart1Output: meta.shot_plan || meta.av_script_part1 || meta.avScriptPart1Output || null,
        shotCount: getNestedValue(meta, 'shot_plan.shots.length')
          || getNestedValue(meta, 'av_script_part1.shots.length')
          || getNestedValue(meta, 'avScriptPart1Output.shots.length')
          || 0,
        assetReferenceImages: meta.assetReferenceImages || null,
        // Per-shot timing from shot plan (requested durations)
        shotTimings: extractShotTimings(meta),
      };
    case 6:
      return {
        generatedMedia: meta.generatedMedia || [],
        mediaCount: Array.isArray(meta.generatedMedia)
          ? (meta.generatedMedia as unknown[]).length
          : 0,
        mediaBreakdown: getMediaBreakdown(meta.generatedMedia),
        // Actual media asset maps (what the workers persist)
        generated_videos_count: Object.keys((meta.generated_videos || {}) as object).length,
        generated_images_count: Object.keys((meta.generated_images || {}) as object).length,
        generated_mg_count: Object.keys((meta.generated_motion_graphics || {}) as object).length,
        video_gen_stats: meta.video_gen_stats || null,
        // Pipeline diagnostics (from orchestrator)
        pipeline_diagnostics: meta.pipeline_diagnostics || null,
      };
    case 7:
      return {
        edl: meta.edl || null,
        agentEdl: meta.agentEdl || null,
        editorState: meta.editor_state ? '(present)' : null,
        // EDL health summary (computed from agentEdl vs audio)
        edlHealth: computeEdlHealth(meta),
      };
    case 8:
      return {
        renderUrl: meta.renderUrl || null,
        renderJobId: meta.renderJobId || null,
      };
    default:
      return {};
  }
}

// ============================================================================
// CONFIG EXTRACTION
// ============================================================================

function extractStepConfig(
  step: PipelineStep,
  meta: Record<string, unknown>
): Record<string, unknown> {
  const outlineConfig = (meta.outlineConfig || {}) as Record<string, unknown>;
  const scriptConfig = (meta.scriptConfig || {}) as Record<string, unknown>;

  switch (step) {
    case 1:
      return { ...outlineConfig };
    case 2:
      return { stockMediaLevel: outlineConfig.stockMediaLevel };
    case 3:
      return { ...scriptConfig };
    case 4:
      return {
        voiceModel: outlineConfig.voiceModel,
        speakingRate: outlineConfig.speakingRate,
      };
    case 5:
      return {
        gpuEnabled: meta.gpuEnabled ?? true,
        stockMediaOverride: meta.stockMediaOverride ?? false,
      };
    case 6:
      return { gpuEnabled: meta.gpuEnabled ?? true };
    case 7:
      return { fps: 30 };
    case 8:
      return {};
    default:
      return {};
  }
}

// ============================================================================
// PROMPT EXTRACTION
// ============================================================================

function extractStepPrompts(
  step: PipelineStep,
  meta: Record<string, unknown>
): StepPrompt[] {
  const prompts: StepPrompt[] = [];

  switch (step) {
    case 1: {
      // Outline: extract from outlineConfig or outline system prompt
      const outlineConfig = (meta.outlineConfig || {}) as Record<string, unknown>;
      if (outlineConfig.systemPrompt || outlineConfig.userSystemPrompt) {
        prompts.push({
          id: 'outline-system',
          label: 'Outline Generation',
          systemPrompt: (outlineConfig.systemPrompt || outlineConfig.userSystemPrompt) as string,
          model: (outlineConfig.model || outlineConfig.llmModel) as string | undefined,
        });
      }
      break;
    }
    case 3: {
      // Script: extract from scriptConfig
      const scriptConfig = (meta.scriptConfig || {}) as Record<string, unknown>;
      if (scriptConfig.systemPrompt || scriptConfig.userSystemPrompt) {
        prompts.push({
          id: 'script-system',
          label: 'Script Generation',
          systemPrompt: (scriptConfig.systemPrompt || scriptConfig.userSystemPrompt) as string,
          model: (scriptConfig.model || scriptConfig.llmModel) as string | undefined,
        });
      }
      break;
    }
    case 5: {
      // Shot Planning: extract system prompt from shot_plan metadata
      const shotPlan = (meta.shot_plan || {}) as Record<string, unknown>;
      const shotPlanMeta = (shotPlan.metadata || {}) as Record<string, unknown>;
      if (shotPlanMeta.system_prompt) {
        prompts.push({
          id: 'shot-planner-system',
          label: 'Shot Planner System Prompt',
          systemPrompt: shotPlanMeta.system_prompt as string,
          model: shotPlanMeta.model as string | undefined,
        });
      }
      // Creative manifest prompts
      const manifest = meta.creative_manifest as Record<string, unknown> | undefined;
      if (manifest?.master_creative_prompt) {
        prompts.push({
          id: 'creative-direction',
          label: 'Creative Direction (Master)',
          userPrompt: manifest.master_creative_prompt as string,
        });
      }
      if (manifest?.video_creative_prompt) {
        prompts.push({
          id: 'video-creative-direction',
          label: 'Creative Direction (Video)',
          userPrompt: manifest.video_creative_prompt as string,
        });
      }
      break;
    }
    case 6: {
      // Scene Review: extract per-shot visual prompts
      if (Array.isArray(meta.generatedMedia)) {
        const mediaItems = meta.generatedMedia as Array<Record<string, unknown>>;
        // Only include first 10 to avoid huge lists
        for (const item of mediaItems.slice(0, 10)) {
          if (item.visual_prompt) {
            prompts.push({
              id: `visual-prompt-shot-${item.shot_index}`,
              label: `Shot ${item.shot_index} Visual Prompt`,
              userPrompt: item.visual_prompt as string,
            });
          }
        }
        if (mediaItems.length > 10) {
          prompts.push({
            id: 'visual-prompt-overflow',
            label: `... and ${mediaItems.length - 10} more shot prompts`,
          });
        }
      }
      break;
    }
    case 7: {
      // Editor: extract edit assembly context if present
      const agentEdl = meta.agentEdl as Record<string, unknown> | undefined;
      if (agentEdl?.assembly_prompt || agentEdl?.system_prompt) {
        prompts.push({
          id: 'edit-assembly-system',
          label: 'Edit Assembly Prompt',
          systemPrompt: (agentEdl.system_prompt || agentEdl.assembly_prompt) as string,
        });
      }
      break;
    }
  }

  return prompts;
}

// ============================================================================
// TIMING EXTRACTION
// ============================================================================

function extractStepTiming(
  step: PipelineStep,
  meta: Record<string, unknown>,
  linkedTask: LinkedTask | null
): StepTiming | null {
  if (!linkedTask) return null;

  const startedAt = linkedTask.started_at || null;
  const completedAt = linkedTask.completed_at || null;

  let durationMs: number | null = null;
  if (startedAt && completedAt) {
    durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  }

  // Try to get step-specific timing from task steps array
  if (linkedTask.steps && Array.isArray(linkedTask.steps)) {
    const taskSteps = linkedTask.steps;
    // For combined tasks (closed_loop covering steps 5+6), try to find phase-relevant steps
    const relevantPhases = getRelevantPhases(step);
    const matchingSteps = taskSteps.filter(
      s => relevantPhases.includes(s.phase)
    );

    if (matchingSteps.length > 0) {
      const earliest = matchingSteps
        .filter(s => s.started_at)
        .sort((a, b) => new Date(a.started_at!).getTime() - new Date(b.started_at!).getTime())[0];
      const latest = matchingSteps
        .filter(s => s.completed_at)
        .sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime())[0];

      const stepDuration = matchingSteps.reduce((sum, s) => sum + (s.duration_ms || 0), 0);

      return {
        startedAt: earliest?.started_at || startedAt,
        completedAt: latest?.completed_at || completedAt,
        durationMs: stepDuration > 0 ? stepDuration : durationMs,
        queueWaitMs: null,
        retryCount: linkedTask.retry_count || 0,
      };
    }
  }

  return {
    startedAt,
    completedAt,
    durationMs,
    queueWaitMs: null,
    retryCount: linkedTask.retry_count || 0,
  };
}

/**
 * Map pipeline step numbers to task phases for timing extraction.
 */
function getRelevantPhases(step: PipelineStep): string[] {
  switch (step) {
    case 1: return ['research', 'scoping', 'spine', 'assets', 'preprocessing'];
    case 3: return ['expansion', 'assembly', 'writing', 'postprocessing'];
    case 4: return ['audio_generation', 'audio_processing'];
    case 5: return ['shot_planning']; // Phase from closed-loop
    case 6: return ['image_generation', 'video_generation', 'compositing'];
    case 7: return ['edit_assembly'];
    case 8: return ['encoding', 'uploading'];
    default: return [];
  }
}

// ============================================================================
// LOG EXTRACTION
// ============================================================================

function extractStepLogs(
  step: PipelineStep,
  meta: Record<string, unknown>,
  linkedTask: LinkedTask | null
): StepLog[] {
  const logs: StepLog[] = [];

  // Extract activity events from linked task
  if (linkedTask?.activity_events && Array.isArray(linkedTask.activity_events)) {
    const relevantPhases = getRelevantPhases(step);
    for (const event of linkedTask.activity_events) {
      // Include events from relevant phases, or all if no phase filter
      if (relevantPhases.length === 0 || relevantPhases.includes(event.phase)) {
        logs.push({
          timestamp: event.timestamp,
          level: mapEventTypeToLevel(event.type),
          phase: event.phase,
          message: event.message,
          detail: event.detail,
        });
      }
    }
  }

  // Extract pipeline diagnostics for steps 5-6
  if ((step === 5 || step === 6) && meta.pipeline_diagnostics) {
    const diag = meta.pipeline_diagnostics as Record<string, unknown>;
    logs.push({
      timestamp: new Date().toISOString(),
      level: 'info',
      phase: 'diagnostics',
      message: 'Pipeline diagnostics available',
      detail: JSON.stringify(diag, null, 2),
    });
  }

  // Extract task step logs
  if (linkedTask?.steps && Array.isArray(linkedTask.steps)) {
    const relevantPhases = getRelevantPhases(step);
    for (const taskStep of linkedTask.steps) {
      if (relevantPhases.length === 0 || relevantPhases.includes(taskStep.phase)) {
        if (taskStep.started_at) {
          logs.push({
            timestamp: taskStep.started_at,
            level: 'info',
            phase: taskStep.phase,
            message: `Step "${taskStep.name}" started`,
          });
        }
        if (taskStep.completed_at && taskStep.status === 'completed') {
          logs.push({
            timestamp: taskStep.completed_at,
            level: 'info',
            phase: taskStep.phase,
            message: `Step "${taskStep.name}" completed${taskStep.duration_ms ? ` (${(taskStep.duration_ms / 1000).toFixed(1)}s)` : ''}`,
          });
        }
        if (taskStep.error) {
          logs.push({
            timestamp: taskStep.completed_at || taskStep.started_at || '',
            level: 'error',
            phase: taskStep.phase,
            message: `Step "${taskStep.name}" failed`,
            detail: taskStep.error,
          });
        }
      }
    }
  }

  // Sort by timestamp
  logs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return logs;
}

/**
 * Map activity event type to log level.
 */
function mapEventTypeToLevel(type: string): StepLog['level'] {
  switch (type) {
    case 'warning': return 'warning';
    case 'retry': return 'warning';
    case 'phase_start': return 'info';
    case 'phase_complete': return 'info';
    case 'reflection': return 'info';
    case 'verification': return 'info';
    case 'info': return 'info';
    default: return 'debug';
  }
}

// ============================================================================
// ERROR EXTRACTION
// ============================================================================

function extractStepErrors(
  step: PipelineStep,
  meta: Record<string, unknown>
): StepError[] {
  const errors: StepError[] = [];
  
  if (meta.generationError && typeof meta.generationError === 'string') {
    errors.push({
      message: meta.generationError,
    });
  }

  // Check for media generation failures in Step 6
  if (step === 6 && Array.isArray(meta.generatedMedia)) {
    const failedMedia = (meta.generatedMedia as Array<Record<string, unknown>>).filter(
      (m) => m.generation_status === 'failed'
    );
    for (const m of failedMedia) {
      errors.push({
        message: `Shot ${m.shot_index}: ${m.error_message || 'Generation failed'}`,
      });
    }
  }

  return errors;
}

// ============================================================================
// MEDIA EXTRACTION
// ============================================================================

function extractStepMedia(
  step: PipelineStep,
  meta: Record<string, unknown>
): StepMedia[] {
  const media: StepMedia[] = [];

  // Step 4: Audio chunks (check both naming conventions)
  if (step === 4) {
    const audioChunks = (meta.audio_chunks || meta.audioChunks) as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(audioChunks)) {
      for (const chunk of audioChunks) {
        if (chunk.url) {
          media.push({
            id: `audio-${chunk.chapterNumber ?? chunk.chunkIndex}`,
            type: 'audio',
            url: chunk.url as string,
            label: `Chapter ${chunk.chapterNumber ?? chunk.chunkIndex}`,
            durationSeconds: chunk.duration_seconds as number | undefined,
          });
        }
      }
    }
  }

  // Step 5: Asset reference images
  if (step === 5 && meta.assetReferenceImages) {
    const refs = meta.assetReferenceImages as Record<string, string>;
    for (const [assetId, url] of Object.entries(refs)) {
      media.push({
        id: `ref-${assetId}`,
        type: 'image',
        url,
        label: `Ref: ${assetId}`,
      });
    }
  }

  // Step 6: Generated media (from generatedMedia array AND from direct maps)
  if (step === 6) {
    // From legacy generatedMedia array
    if (Array.isArray(meta.generatedMedia)) {
      for (const item of meta.generatedMedia as Array<Record<string, unknown>>) {
        const url = (item.media_url || item.image_url || item.video_url) as string;
        if (url) {
          media.push({
            id: `media-${item.shot_index}`,
            type: (item.media_type as StepMedia['type']) || 'image',
            url,
            label: `Shot ${item.shot_index}`,
            shotIndex: item.shot_index as number,
            generationStatus: item.generation_status as string,
          });
        }
      }
    }
    // From generated_videos map (what video-gen actually persists)
    if (meta.generated_videos && typeof meta.generated_videos === 'object') {
      for (const [key, url] of Object.entries(meta.generated_videos as Record<string, string>)) {
        const idx = key.replace('shot-', '');
        if (url && !media.some(m => m.id === `media-${idx}`)) {
          media.push({
            id: `video-${idx}`,
            type: 'video',
            url,
            label: `Shot ${idx} (video)`,
            shotIndex: Number(idx),
            generationStatus: 'completed',
          });
        }
      }
    }
    // From generated_images map
    if (meta.generated_images && typeof meta.generated_images === 'object') {
      for (const [key, url] of Object.entries(meta.generated_images as Record<string, string>)) {
        const idx = key.replace('shot-', '');
        if (url && !media.some(m => m.id === `media-${idx}`)) {
          media.push({
            id: `image-${idx}`,
            type: 'image',
            url,
            label: `Shot ${idx} (image)`,
            shotIndex: Number(idx),
            generationStatus: 'completed',
          });
        }
      }
    }
  }

  return media;
}

// ============================================================================
// HELPERS
// ============================================================================

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function summarizeObject(obj: unknown): Record<string, string> {
  if (!obj || typeof obj !== 'object') return {};
  const summary: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      summary[key] = `Array(${value.length})`;
    } else if (typeof value === 'object' && value !== null) {
      summary[key] = `Object(${Object.keys(value).length} keys)`;
    } else if (typeof value === 'string') {
      summary[key] = value.length > 100 ? `${value.substring(0, 100)}...` : value;
    } else {
      summary[key] = String(value);
    }
  }
  return summary;
}

function getMediaBreakdown(
  generatedMedia: unknown
): Record<string, number> | null {
  if (!Array.isArray(generatedMedia)) return null;
  const breakdown: Record<string, number> = {};
  for (const item of generatedMedia as Array<Record<string, unknown>>) {
    const type = (item.media_type as string) || 'unknown';
    breakdown[type] = (breakdown[type] || 0) + 1;
  }
  return breakdown;
}

/**
 * Extract per-shot timing data from the AV script shot plan.
 * Shows requested duration per shot — useful for debugging frozen/stretched clips.
 */
function extractShotTimings(
  meta: Record<string, unknown>
): Array<{ shot_index: number; media_type: string; duration_s: number }> | null {
  const shotPlan = meta.shot_plan as Record<string, unknown> | undefined;
  const avScript = (shotPlan || meta.av_script_part1 || meta.avScriptPart1Output) as Record<string, unknown> | undefined;
  if (!avScript) return null;
  const shots = (avScript.shots || []) as Array<Record<string, unknown>>;
  if (shots.length === 0) return null;
  return shots.map(s => ({
    shot_index: (s.segment_index as number) || 0,
    media_type: (s.media_type as string) || 'unknown',
    duration_s: (s.duration_seconds as number) || 0,
  }));
}

/**
 * Compute EDL health metrics: total duration vs audio, clips over 10s, etc.
 * Critical for diagnosing frozen clips and stretched timelines.
 */
function computeEdlHealth(
  meta: Record<string, unknown>
): Record<string, unknown> | null {
  const agentEdl = meta.agentEdl as Record<string, unknown> | undefined;
  if (!agentEdl?.tracks) return null;

  const tracks = agentEdl.tracks as Array<Record<string, unknown>>;
  let totalClips = 0;
  let totalDuration = 0;
  let clipsOver10s = 0;
  const longClips: Array<{ track: string; start: number; duration: number }> = [];

  for (const track of tracks) {
    const clips = (track.clips || []) as Array<Record<string, unknown>>;
    for (const clip of clips) {
      totalClips++;
      const dur = (clip.duration as number) || 0;
      totalDuration += dur;
      if (dur > 10) {
        clipsOver10s++;
        longClips.push({
          track: (track.id as string) || 'unknown',
          start: (clip.startTime as number) || 0,
          duration: dur,
        });
      }
    }
  }

  const audioChunks = (meta.audio_chunks || meta.audioChunks || []) as Array<Record<string, unknown>>;
  const audioTotal = audioChunks.reduce(
    (sum, c) => sum + ((c.duration_seconds as number) || 0), 0
  );

  return {
    total_clips: totalClips,
    total_duration_s: Math.round(totalDuration * 100) / 100,
    audio_total_s: Math.round(audioTotal * 100) / 100,
    duration_vs_audio_diff_s: Math.round((totalDuration - audioTotal) * 100) / 100,
    clips_over_10s: clipsOver10s,
    long_clips: longClips.length > 0 ? longClips : undefined,
    tracks_count: tracks.length,
  };
}
