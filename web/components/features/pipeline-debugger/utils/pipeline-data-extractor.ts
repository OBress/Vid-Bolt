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
}

// ============================================================================
// MAIN EXTRACTOR
// ============================================================================

/**
 * Extract a full PipelineRun from a raw video project record.
 */
export function extractPipelineRun(video: RawVideoProject): PipelineRun {
  const meta = (video.metadata || {}) as Record<string, unknown>;
  const currentStepNum = stageToStep(video.current_stage);

  const steps: StepData[] = ALL_STEPS.map((step) =>
    extractStepData(step, video, meta, currentStepNum)
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
// STEP DATA EXTRACTION
// ============================================================================

function extractStepData(
  step: PipelineStep,
  video: RawVideoProject,
  meta: Record<string, unknown>,
  currentStepNum: number
): StepData {
  const config = STEP_CONFIGS[step];

  return {
    step,
    label: config.label,
    status: getStepStatus(step, currentStepNum, meta),
    inputs: extractStepInputs(step, video, meta),
    outputs: extractStepOutputs(step, video, meta),
    config: extractStepConfig(step, meta),
    prompts: [], // Populated by prompt extractor when viewing details
    timing: extractStepTiming(step, meta),
    errors: extractStepErrors(step, meta),
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

function extractStepInputs(
  step: PipelineStep,
  video: RawVideoProject,
  meta: Record<string, unknown>
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
    case 5: // Shot Creation
      return {
        audioChunkCount: Array.isArray(meta.audioChunks)
          ? (meta.audioChunks as unknown[]).length
          : 0,
        hasOutline: !!meta.outlineOutput,
        hasScript: !!video.script_content,
      };
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
    case 4:
      return {
        audioUrl: video.audio_url || null,
        audioChunks: meta.audioChunks || [],
        audioChunkCount: Array.isArray(meta.audioChunks)
          ? (meta.audioChunks as unknown[]).length
          : 0,
      };
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
// TIMING & ERRORS
// ============================================================================

function extractStepTiming(
  _step: PipelineStep,
  _meta: Record<string, unknown>
): StepTiming | null {
  // Timing data would come from task records if available
  // For now, return null — will be populated when we have task data
  return null;
}

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

  // Step 4: Audio chunks
  if (step === 4 && Array.isArray(meta.audioChunks)) {
    for (const chunk of meta.audioChunks as Array<Record<string, unknown>>) {
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
  const avScript = (meta.av_script_part1 || meta.avScriptPart1Output) as Record<string, unknown> | undefined;
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
