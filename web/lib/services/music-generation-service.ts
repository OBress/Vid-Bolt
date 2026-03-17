/**
 * Music Generation Service
 * ============================================================================
 * Generates segmented instrumental background music via ACE-Step 1.5.
 *
 * Flow:
 *   1. Music Director Agent (LLM) → plans segments aligned to narrative arc
 *   2. ensureMode('audio_creation') → switch GPU to audio VRAM mode
 *   3. Per-segment callGpuMusicGenerate() → webhook-based async generation
 *   4. Return MusicGenerationResult → consumed by edit assembly (target: 'music')
 *
 * ACE-Step Best Practices (baked into agent prompt):
 *   - Captions: comma-separated tags (genre, instruments, mood, tempo)
 *   - Lyrics field: structured section tags even for instrumental ([Intro], [Verse], etc.)
 *   - Always instrumental, never vocals
 *   - Shared seed/BPM/key across segments for timbral consistency
 *   - 30-180s per segment (quality sweet spot)
 *   - BPM → emotion: 60-80 calm, 80-120 balanced, 120-160 energetic
 */

import { v4 as uuidv4 } from 'uuid';
import { generateJSON } from '@/lib/ai/openrouter';
import {
  callGpuMusicGenerate,
  callGpuGetMode,
  callGpuSetVramMode,
  type MusicGenerateRequest,
} from '@/lib/services/gpu-api-service';
import {
  generateMediaKey,
  generatePresignedPutUrl,
  getPublicUrl,
  STORAGE_PATHS,
} from '@/lib/services/r2-storage';
import { waitForWebhookResult } from '@/lib/queues/webhook-listener';

// ============================================================================
// CONFIGURATION
// ============================================================================

const LOG_PREFIX = '[MusicGen]';
const MODE_SWITCH_TIMEOUT_MS = 120_000; // 2 min to switch to audio_creation
const MODE_POLL_INTERVAL_MS = 2_000;
const POST_SWITCH_DELAY_MS = 3_000;
const MUSIC_GEN_TIMEOUT_MS = 900_000;   // 15 min per segment (long music can take a while)

const getWebhookUrl = () =>
  process.env.WEBHOOK_CALLBACK_URL || 'http://localhost:3000/api/gpu-callback';
const getWebhookSecret = () => process.env.GPU_WEBHOOK_SECRET;

// ============================================================================
// TYPES
// ============================================================================

/** Plan for a single music segment */
export interface MusicSegmentPlan {
  segment_index: number;
  start_seconds: number;
  end_seconds: number;
  duration_seconds: number;
  /** Comma-separated ACE-Step caption tags: genre, instruments, mood, tempo */
  caption: string;
  /** Structure tags for energy dynamics: [Intro]\n[Instrumental - ...]\n[Verse]... */
  lyrics_structure: string;
  transition_type: 'crossfade' | 'cut' | 'fade_out_in';
  transition_duration_seconds: number;
  energy_level: 'low' | 'medium' | 'high';
  /** What's happening in the video at this point */
  narrative_context: string;
}

/** Full output from the Music Director Agent */
export interface MusicDirectorOutput {
  segments: MusicSegmentPlan[];
  shared_seed: number;
  shared_bpm: number;
  shared_key_scale: string;
  /** e.g. "dark ambient electronic" */
  style_summary: string;
}

/** A generated music segment with R2 URL */
export interface MusicTrackSegment {
  segment_index: number;
  audio_url: string;
  start_seconds: number;
  end_seconds: number;
  duration_seconds: number;
  transition_type: 'crossfade' | 'cut' | 'fade_out_in';
  transition_duration_seconds: number;
  /** Background music volume (0.0-1.0). Typically 0.15-0.25. */
  volume: number;
}

/** Final result from the music generation pipeline */
export interface MusicGenerationResult {
  segments: MusicTrackSegment[];
  total_duration_seconds: number;
  generation_time_seconds: number;
  style_summary: string;
  plan: MusicDirectorOutput;
}

/** Context passed to the music generation service */
export interface MusicGenerationContext {
  userId: string;
  videoId: string;
  /** Total video duration from TTS */
  totalDurationSeconds: number;
  /** Full script text */
  scriptContent: string;
  /** Creative manifest mood/genre info */
  mood?: string;
  genre?: string;
  visualStyle?: string;
  /** Shot plan for transition alignment */
  shots?: Array<{
    segment_index: number;
    start_seconds: number;
    end_seconds: number;
    summary?: string;
    text?: string;
  }>;
}

// ============================================================================
// MUSIC DIRECTOR AGENT PROMPT
// ============================================================================

const MUSIC_DIRECTOR_SYSTEM_PROMPT = `You are the Music Director for an AI video production pipeline. Your job is to plan segmented instrumental background music that matches the video's narrative arc.

## Your Task
Analyze the video context (script, duration, mood, shot plan) and output a structured music plan. The number of segments is DYNAMIC — you will be told how many to generate based on the video duration. Each segment is 30-180 seconds long (the quality sweet spot for ACE-Step 1.5).

## ACE-Step 1.5 Prompting Rules (CRITICAL)
You are generating prompts for ACE-Step 1.5 music generation. Follow these rules exactly:

### Caption Format
Captions MUST be comma-separated tags, NOT prose sentences.
Include: genre, 2-3 specific instruments, mood adjective, tempo feel, production style
GOOD: "dark ambient electronic, deep synthesizer pads, subtle string textures, slow atmospheric drone, melancholic, warm mix"
BAD:  "make some background music that sounds dark and electronic"

### Lyrics Structure Field
Even though this is instrumental, the lyrics_structure field controls the song's ENERGY DYNAMICS.
Use section tags with energy descriptors:

Example for a build-up segment:
[Intro]
[Instrumental - gentle piano, atmospheric pads, sparse percussion]
[Verse]
[Instrumental - building layers, deeper bass, subtle rhythmic pulse]

Example for a climax segment:
[Chorus - intense, full instrumentation]
[Instrumental - driving rhythm, soaring strings, powerful drums]
[Bridge]
[Instrumental - peak energy, all instruments layered]

Example for a resolution segment:
[Bridge - winding down]
[Instrumental - stripped back, reflective, fading textures]
[Outro]
[Instrumental - ambient fade, single instrument, dissolving]

### Segment Design Rules
1. ALWAYS instrumental — never include actual lyrics text
2. All segments share the EXACT SAME genre, instruments, and style — they must sound like ONE piece
3. Only the ENERGY LEVEL changes between segments (build-up → climax → resolution)
4. Each segment: 30-180 seconds (quality sweet spot — longer degrades quality)
5. You MUST generate EXACTLY the number of segments specified in the user prompt
6. Segments must cover the entire video duration with no gaps and no overlaps
7. Distribute segment boundaries at natural narrative transition points
8. Use crossfade transitions (2-5s) for seamless blending
9. For very long videos (30min+): create a repeating energy pattern (build→climax→resolve→build→climax→resolve...)
10. Despite many segments, they must ALL sound like one continuous piece — same genre, instruments, timbre

### BPM Selection Guide
- 60-80 BPM: Calm, reflective, melancholic → documentaries, emotional scenes
- 80-120 BPM: Balanced, optimistic, easygoing → tutorials, comparisons, general content  
- 120-160 BPM: Energetic, joyful, tense → montages, action, highlights

### Seed
Generate a random seed (1-999999) and use it across ALL segments for timbral consistency.

### Key Scale
Pick one key/scale that fits the mood and lock it across all segments.
- Major keys (C Major, G Major): bright, uplifting, happy
- Minor keys (Am, Em, Dm): darker, serious, emotional, contemplative`;

// ============================================================================
// VRAM MODE MANAGEMENT
// ============================================================================

/**
 * Wait for VRAM mode to become ready (polls GPU status)
 */
async function waitForModeReady(
  targetMode: string,
  timeoutMs: number = MODE_SWITCH_TIMEOUT_MS
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const result = await callGpuGetMode();

    if (result.success && result.data) {
      if (result.data.mode === targetMode && !result.data.is_switching) {
        return true;
      }
      if (result.data.is_switching) {
        console.log(`${LOG_PREFIX} Mode switching: ${result.data.switching_progress ? Math.round(result.data.switching_progress * 100) + '%' : 'in progress'}`);
      }
    }

    await new Promise(resolve => setTimeout(resolve, MODE_POLL_INTERVAL_MS));
  }

  console.error(`${LOG_PREFIX} Mode switch timeout waiting for ${targetMode}`);
  return false;
}

/**
 * Ensure GPU is in audio_creation VRAM mode for ACE-Step 1.5
 */
async function ensureAudioMode(): Promise<boolean> {
  const currentMode = await callGpuGetMode();

  if (currentMode.success && currentMode.data?.mode === 'audio_creation' && !currentMode.data.is_switching) {
    console.log(`${LOG_PREFIX} Already in audio_creation mode`);
    return true;
  }

  console.log(`${LOG_PREFIX} Switching to audio_creation mode...`);
  const switchResult = await callGpuSetVramMode('audio_creation');

  if (!switchResult.success) {
    console.error(`${LOG_PREFIX} Failed to initiate mode switch: ${switchResult.error}`);
    return false;
  }

  const ready = await waitForModeReady('audio_creation');
  if (ready) {
    console.log(`${LOG_PREFIX} Mode switch complete, stabilizing for ${POST_SWITCH_DELAY_MS / 1000}s...`);
    await new Promise(resolve => setTimeout(resolve, POST_SWITCH_DELAY_MS));
  }
  return ready;
}

// Maximum segments per LLM call to maintain output quality
const PLANNING_BATCH_SIZE = 6;

/**
 * Invoke the Music Director Agent to produce a segmented music plan.
 *
 * For short videos (≤BATCH_SIZE segments), this is a single LLM call.
 * For long videos, it batches in windows of BATCH_SIZE, carrying forward
 * shared musical parameters and previous segment context for continuity.
 */
async function invokeMusicDirector(
  context: MusicGenerationContext
): Promise<MusicDirectorOutput> {
  console.log(`${LOG_PREFIX} Invoking Music Director Agent...`);

  // Calculate required segment count dynamically based on total duration
  // Target ~120s per segment (sweet spot), minimum 2 segments, no maximum
  const TARGET_SEGMENT_DURATION = 120;
  const requiredSegments = Math.max(2, Math.ceil(context.totalDurationSeconds / TARGET_SEGMENT_DURATION));
  const totalBatches = Math.ceil(requiredSegments / PLANNING_BATCH_SIZE);

  console.log(`${LOG_PREFIX} Planning ${requiredSegments} segments in ${totalBatches} batch(es)`);

  // Shared parameters established by the first batch
  let sharedSeed: number = 0;
  let sharedBpm: number = 0;
  let sharedKeyScale: string = '';
  let styleSummary: string = '';
  const allSegments: MusicSegmentPlan[] = [];

  for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    const batchStart = batchIdx * PLANNING_BATCH_SIZE;
    const batchEnd = Math.min(batchStart + PLANNING_BATCH_SIZE, requiredSegments);
    const batchCount = batchEnd - batchStart;

    // Calculate the time window this batch covers
    const segDuration = context.totalDurationSeconds / requiredSegments;
    const windowStartSec = batchStart * segDuration;
    const windowEndSec = batchEnd * segDuration;

    // Get shots in this time window
    const windowShots = context.shots?.filter(
      s => s.start_seconds < windowEndSec && s.end_seconds > windowStartSec
    ) || [];
    const shotContext = windowShots.length > 0
      ? `\n\nSHOTS IN THIS WINDOW (${windowShots.length}):\n` +
        windowShots.map(s =>
          `  Shot ${s.segment_index}: ${s.start_seconds.toFixed(1)}s–${s.end_seconds.toFixed(1)}s | ${s.summary || s.text || 'No description'}`
        ).join('\n')
      : '';

    // Script excerpt for this window (proportional)
    const scriptStartChar = Math.floor((windowStartSec / context.totalDurationSeconds) * context.scriptContent.length);
    const scriptEndChar = Math.min(
      scriptStartChar + 600,
      Math.floor((windowEndSec / context.totalDurationSeconds) * context.scriptContent.length)
    );
    const scriptExcerpt = context.scriptContent.substring(scriptStartChar, scriptEndChar);

    // Build context from previous batch
    const prevContext = allSegments.length > 0
      ? `\n\nPREVIOUS SEGMENTS (for continuity — maintain the same style):\n` +
        allSegments.slice(-3).map(s =>
          `  Seg ${s.segment_index}: ${s.start_seconds.toFixed(1)}s–${s.end_seconds.toFixed(1)}s | ${s.energy_level} energy | "${s.caption.substring(0, 80)}..."`
        ).join('\n')
      : '';

    // Build user prompt
    let userPrompt: string;
    if (batchIdx === 0) {
      // First batch: establish style, seed, BPM, key
      userPrompt = `Plan background music for this video (BATCH 1 of ${totalBatches}):

FULL VIDEO DURATION: ${context.totalDurationSeconds.toFixed(1)} seconds (${(context.totalDurationSeconds / 60).toFixed(1)} minutes)
THIS BATCH: segments ${batchStart} through ${batchEnd - 1} (${batchCount} segments, covering ${windowStartSec.toFixed(0)}s–${windowEndSec.toFixed(0)}s)
TOTAL SEGMENTS PLANNED: ${requiredSegments} across all batches
TARGET SEGMENT LENGTH: ~${Math.round(segDuration)}s each

MOOD: ${context.mood || 'not specified'}
GENRE HINT: ${context.genre || 'not specified'}
VISUAL STYLE: ${context.visualStyle || 'not specified'}

SCRIPT FOR THIS WINDOW:
${scriptExcerpt}${scriptExcerpt.length >= 600 ? '...' : ''}
${shotContext}

Generate exactly ${batchCount} segments (indices ${batchStart} to ${batchEnd - 1}) covering ${windowStartSec.toFixed(0)}s–${windowEndSec.toFixed(0)}s.
Also establish shared_seed, shared_bpm, shared_key_scale, and style_summary for the entire video.`;
    } else {
      // Subsequent batches: use established parameters, carry forward context
      userPrompt = `Continue planning background music (BATCH ${batchIdx + 1} of ${totalBatches}):

FULL VIDEO DURATION: ${context.totalDurationSeconds.toFixed(1)} seconds (${(context.totalDurationSeconds / 60).toFixed(1)} minutes)
THIS BATCH: segments ${batchStart} through ${batchEnd - 1} (${batchCount} segments, covering ${windowStartSec.toFixed(0)}s–${windowEndSec.toFixed(0)}s)

ESTABLISHED STYLE (from batch 1 — DO NOT change these):
- shared_seed: ${sharedSeed}
- shared_bpm: ${sharedBpm}
- shared_key_scale: "${sharedKeyScale}"
- style_summary: "${styleSummary}"
${prevContext}

SCRIPT FOR THIS WINDOW:
${scriptExcerpt}${scriptExcerpt.length >= 600 ? '...' : ''}
${shotContext}

Generate exactly ${batchCount} segments (indices ${batchStart} to ${batchEnd - 1}) covering ${windowStartSec.toFixed(0)}s–${windowEndSec.toFixed(0)}s.
Use the EXACT same shared_seed, shared_bpm, shared_key_scale, and style_summary as batch 1.
Maintain musical continuity with previous segments.`;
    }

    console.log(`${LOG_PREFIX} Planning batch ${batchIdx + 1}/${totalBatches}: ` +
      `segments ${batchStart}-${batchEnd - 1} (${windowStartSec.toFixed(0)}s–${windowEndSec.toFixed(0)}s)`);

    const batchResult = await generateJSON<MusicDirectorOutput>(
      context.userId,
      MUSIC_DIRECTOR_SYSTEM_PROMPT,
      userPrompt,
      { maxTokens: 8192 }
    );

    if (!batchResult.segments?.length) {
      throw new Error(`Music Director batch ${batchIdx + 1} returned no segments`);
    }

    // Capture shared parameters from batch 1
    if (batchIdx === 0) {
      sharedSeed = batchResult.shared_seed;
      sharedBpm = batchResult.shared_bpm;
      sharedKeyScale = batchResult.shared_key_scale;
      styleSummary = batchResult.style_summary;
    }

    // Clamp segment durations and fix indices
    for (const seg of batchResult.segments) {
      if (seg.duration_seconds < 10) seg.duration_seconds = 30;
      if (seg.duration_seconds > 180) seg.duration_seconds = 180;
      seg.end_seconds = seg.start_seconds + seg.duration_seconds;
      allSegments.push(seg);
    }

    console.log(`${LOG_PREFIX} Batch ${batchIdx + 1}: ${batchResult.segments.length} segments planned`);
  }

  console.log(`${LOG_PREFIX} Music plan complete: ${allSegments.length} segments, ` +
    `${sharedBpm} BPM, ${sharedKeyScale}, seed=${sharedSeed}`);
  console.log(`${LOG_PREFIX} Style: ${styleSummary}`);

  return {
    segments: allSegments,
    shared_seed: sharedSeed,
    shared_bpm: sharedBpm,
    shared_key_scale: sharedKeyScale,
    style_summary: styleSummary,
  };
}

// ============================================================================
// SEGMENT GENERATION
// ============================================================================

/**
 * Generate a single music segment via the GPU API.
 */
async function generateSegment(
  segment: MusicSegmentPlan,
  plan: MusicDirectorOutput,
  context: MusicGenerationContext
): Promise<MusicTrackSegment | null> {
  const segPrefix = `${LOG_PREFIX} [Seg${segment.segment_index}]`;
  console.log(`${segPrefix} Generating ${segment.duration_seconds}s ` +
    `(${segment.energy_level} energy, ${segment.transition_type} transition)`);

  try {
    // Generate presigned URL for R2 storage
    const r2Key = generateMediaKey(
      context.userId,
      context.videoId,
      STORAGE_PATHS.AUDIO.BACKGROUND_MUSIC,
      `seg-${segment.segment_index}.wav`
    );
    const { putUrl } = await generatePresignedPutUrl(r2Key, 'audio/wav');
    const publicUrl = getPublicUrl(r2Key);

    // Build the GPU API request
    const gpuJobId = uuidv4();
    const itemId = `music-${context.videoId}-seg-${segment.segment_index}`;

    const request: MusicGenerateRequest = {
      job_id: gpuJobId,
      prompt: segment.caption,
      lyrics: segment.lyrics_structure || '[Instrumental]',
      duration_seconds: segment.duration_seconds,
      seed: plan.shared_seed,
      bpm: plan.shared_bpm,
      key_scale: plan.shared_key_scale,
      time_signature: '4',  // 4/4 is standard for most background music
      vocal_language: 'unknown',  // Instrumental — no vocals
      save_url: putUrl,
      webhook_url: getWebhookUrl(),
      item_id: itemId,
      webhook_secret: getWebhookSecret(),
    };

    console.log(`${segPrefix} Calling GPU API (job: ${gpuJobId})...`);
    const result = await callGpuMusicGenerate(request);

    if (!result.success && !result.isAsync) {
      console.error(`${segPrefix} GPU API error: ${result.errorMessage}`);
      return null;
    }

    // Wait for webhook completion
    if (result.isAsync || result.success) {
      console.log(`${segPrefix} Waiting for webhook completion...`);
      try {
        const webhookResult = await waitForWebhookResult(itemId, MUSIC_GEN_TIMEOUT_MS);
        if (webhookResult.status !== 'completed') {
          console.error(`${segPrefix} Webhook returned failure: ${webhookResult.errorMessage}`);
          return null;
        }
      } catch (err) {
        console.error(`${segPrefix} Webhook timeout/error:`, err);
        return null;
      }
    }

    console.log(`${segPrefix} ✓ Generated successfully → ${publicUrl}`);

    return {
      segment_index: segment.segment_index,
      audio_url: publicUrl,
      start_seconds: segment.start_seconds,
      end_seconds: segment.end_seconds,
      duration_seconds: segment.duration_seconds,
      transition_type: segment.transition_type,
      transition_duration_seconds: segment.transition_duration_seconds,
      volume: 0.20, // Background music default: -14dB (0.20 linear ≈ -14dB)
    };
  } catch (error) {
    console.error(`${segPrefix} Failed:`, error);
    return null;
  }
}

/**
 * Plan background music segments using the Music Director Agent (LLM only, no GPU).
 *
 * Call this first, then pass the plan to `generateMusicSegments()` when the GPU is free.
 *
 * @param context - Video context including script, duration, mood, shot plan
 * @returns MusicDirectorOutput with segment plans and shared musical parameters
 */
export async function planBackgroundMusic(
  context: MusicGenerationContext
): Promise<MusicDirectorOutput> {
  console.log(`${LOG_PREFIX} Starting music planning for video ${context.videoId}`);
  console.log(`${LOG_PREFIX} Total duration: ${context.totalDurationSeconds}s`);
  return invokeMusicDirector(context);
}

/**
 * Generate music segments on the GPU from a pre-computed plan.
 *
 * Switches GPU to audio_creation mode, generates each segment sequentially,
 * and returns URLs + transition metadata for edit assembly.
 *
 * @param plan - Output from planBackgroundMusic()
 * @param context - Same context used for planning
 * @returns MusicGenerationResult with segment URLs
 */
export async function generateMusicSegments(
  plan: MusicDirectorOutput,
  context: MusicGenerationContext
): Promise<MusicGenerationResult> {
  const startTime = Date.now();
  console.log(`${LOG_PREFIX} Starting GPU music generation: ${plan.segments.length} segments`);

  // Switch GPU to audio_creation mode
  const modeReady = await ensureAudioMode();
  if (!modeReady) {
    throw new Error('Failed to switch GPU to audio_creation mode');
  }

  // Generate each segment sequentially
  // (ACE-Step doesn't have batch — generate one at a time for quality)
  const segments: MusicTrackSegment[] = [];
  for (const segmentPlan of plan.segments) {
    const result = await generateSegment(segmentPlan, plan, context);
    if (result) {
      segments.push(result);
    } else {
      console.warn(`${LOG_PREFIX} Segment ${segmentPlan.segment_index} failed — will have gap in music`);
    }
  }

  if (segments.length === 0) {
    throw new Error('All music segments failed to generate');
  }

  const totalGenTime = (Date.now() - startTime) / 1000;
  console.log(`${LOG_PREFIX} ✓ Music generation complete: ${segments.length}/${plan.segments.length} segments in ${totalGenTime.toFixed(1)}s`);

  return {
    segments,
    total_duration_seconds: context.totalDurationSeconds,
    generation_time_seconds: totalGenTime,
    style_summary: plan.style_summary,
    plan,
  };
}

/**
 * Generate background music for a video (convenience wrapper).
 *
 * Runs both planning (LLM) and generation (GPU) sequentially.
 * For pipeline use, prefer calling planBackgroundMusic() and generateMusicSegments()
 * separately to control GPU timing.
 *
 * @param context - Video context including script, duration, mood, shot plan
 * @returns MusicGenerationResult with segment URLs and transition metadata
 */
export async function generateBackgroundMusic(
  context: MusicGenerationContext
): Promise<MusicGenerationResult> {
  const plan = await planBackgroundMusic(context);
  return generateMusicSegments(plan, context);
}
