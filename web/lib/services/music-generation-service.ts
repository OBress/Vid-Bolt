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
 *   - No lyrics field for closed-loop background music
 *   - Always instrumental, never vocals
 *   - Shared seed/BPM/key across segments for timbral consistency
 *   - 30-180s per segment (quality sweet spot)
 *   - BPM → emotion: 60-80 calm, 80-120 balanced, 120-160 energetic
 */

import { z } from 'zod';
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
const MAX_PLANNING_RETRIES = 3;
const DEFAULT_SHARED_BPM = 58;
const DEFAULT_SHARED_KEY_SCALE = 'Dm';
const DEFAULT_STYLE_SUMMARY =
  'Barely noticeable ambient documentary bed with warm analog pads, faint room tone, and a slow, stable texture.';

const getWebhookUrl = () =>
  process.env.WEBHOOK_CALLBACK_URL || 'http://localhost:3000/api/gpu-callback';
const getWebhookSecret = () => process.env.GPU_WEBHOOK_SECRET;

// ============================================================================
// TYPES
// ============================================================================

const MusicSegmentPlanSchema = z.object({
  segment_index: z.number().int().min(0),
  start_seconds: z.number().min(0),
  end_seconds: z.number().min(0),
  duration_seconds: z.number().min(10).max(180),
  /** Comma-separated ACE-Step caption tags: texture, atmosphere, timbre, mood. */
  caption: z.string().trim().min(1).max(400),
  transition_type: z.enum(['crossfade', 'cut', 'fade_out_in']).default('crossfade'),
  transition_duration_seconds: z.number().min(0).max(10).default(4),
  energy_level: z.enum(['low', 'medium', 'high']).default('low'),
  /** What's happening in the video at this point */
  narrative_context: z.string().trim().min(1).max(400).default(
    'Maintain the same quiet ambient bed with only a barely perceptible change in warmth or density.'
  ),
});

/** Plan for a single music segment */
export type MusicSegmentPlan = z.infer<typeof MusicSegmentPlanSchema>;

const MusicDirectorOutputSchema = z.object({
  segments: z.array(MusicSegmentPlanSchema).min(1),
  shared_seed: z.number().int().min(1).max(999_999).default(482_910),
  shared_bpm: z.number().int().min(50).max(70).default(DEFAULT_SHARED_BPM),
  shared_key_scale: z.string().trim().min(1).max(40).default(DEFAULT_SHARED_KEY_SCALE),
  /** e.g. "dark ambient drone with warm analog hum" */
  style_summary: z.string().trim().min(1).max(400).default(DEFAULT_STYLE_SUMMARY),
});

/** Full output from the Music Director Agent */
export type MusicDirectorOutput = z.infer<typeof MusicDirectorOutputSchema>;

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
  /** Full creative direction from Creative Manifest (master + video prompts) */
  creativeDirection?: string;
  /** User's original video idea / prompt */
  userPrompt?: string;
  /** Shot plan for transition alignment */
  shots?: Array<{
    segment_index: number;
    start_seconds: number;
    end_seconds: number;
    summary?: string;
    text?: string;
    /** Narrative purpose: hook, reveal, climax, transition, exposition, cta */
    narrative_beat?: string;
    /** Scene group identifier for boundary alignment */
    scene_id?: string;
  }>;
}

// ============================================================================
// MUSIC DIRECTOR AGENT PROMPT
// ============================================================================

const MUSIC_DIRECTOR_SYSTEM_PROMPT = `You are the Music Director for an AI video production pipeline. Your ONLY job is to plan barely-noticeable ambient background texture that sits underneath narration.

## CORE PHILOSOPHY — READ THIS FIRST
The viewer must NEVER consciously notice the music. If it sounds like something on Spotify, it's too prominent. If someone could hum it, it's too melodic. If it has a beat you could tap your foot to, it's too rhythmic.

Think: the hum of a warm room. A distant ocean. The barely-there tone of a meditation app. That's the energy level — MAXIMUM.

## Your Task
Analyze the video context (script, creative direction, shot plan) and output a structured ambient texture plan. Each segment is 30-180 seconds long (quality sweet spot for ACE-Step 1.5).

## ACE-Step 1.5 Prompting Rules

### Caption Format
Captions MUST be comma-separated texture/atmosphere tags. NEVER use genre labels that imply composed music.
GOOD: "soft ambient pad, warm analog drone, gentle atmospheric texture, slow evolving soundscape, minimal, lo-fi warmth"
GOOD: "dark ambient drone, deep sub-bass hum, distant reverb wash, sparse ethereal texture, immersive"
BAD:  "cinematic orchestral score, epic drums, emotional piano melody"
BAD:  "lo-fi hip hop beats, jazzy chords, catchy synth lead"

### BANNED Elements — NEVER include these in captions:
- Melodies, hooks, riffs, leads, solos
- Drums, beats, percussion patterns, rhythmic loops
- Piano chords, guitar strums, bass lines
- Any instrument being "featured" or "prominent"
- Words like: catchy, groovy, driving, powerful, soaring, epic, uplifting beat

### ALLOWED Elements — use ONLY these:
- Ambient pads, drones, texture layers, soundscapes
- Atmospheric washes, reverb tails, subtle shimmer
- Warm analog hum, tape hiss, room tone
- Distant/faint string textures (not melodies — textures)
- Soft sub-bass undertones
- Evolving timbres, granular synthesis textures

### Lyrics Structure Field (Energy Dynamics)
Even though this is instrumental, the lyrics_structure field controls energy shape.
Do NOT use [Verse], [Chorus], [Bridge] — these make ACE-Step generate composed music.

Use these section tags instead:

Gentle/low energy:
[Ambient Bed]
[Texture - warm analog pad, barely audible drone, spacious]
[Ambient Bed]
[Texture - same tone, slowly evolving, minimal movement]

Slightly warmer (for emotional moments):
[Ambient Bed]
[Texture - slightly deeper warmth, additional subtle layer, still distant]
[Ambient Bed]
[Texture - gentle swell then recede, atmospheric]

Cooling down:
[Ambient Bed]
[Texture - stripping back to single pad, fading, dissolving]
[Outro]
[Texture - near-silence, single faint tone]

### Segment Design Rules
1. ALWAYS instrumental — never include actual lyrics text
2. All segments share the EXACT SAME timbre and texture palette — one continuous atmosphere
3. Only the WARMTH/DENSITY changes between segments (never dramatic shifts)
4. Each segment: 30-180 seconds (quality sweet spot)
5. Generate EXACTLY the number of segments specified in the user prompt
6. Segments must cover the entire video duration with no gaps/overlaps
7. Place boundary changes at scene transitions (use scene_id changes from shot data)
8. Use crossfade transitions (3-5s) — never hard cuts in ambient texture
9. Energy differences between segments should be EXTREMELY subtle — think 5-10% variation, not 50%
10. Despite multiple segments, they must sound like one continuous ambient bed

### BPM Selection
- 50-70 BPM ONLY. Anything faster produces rhythmic music.
- Lower BPM = more ambient, less structured. Default to 55-60.

### Seed
Generate one random seed (1-999999), shared across ALL segments.

### Key Scale
Pick one key that fits the mood:
- Minor keys preferred (Am, Dm, Em) — they produce warmer, more ambient textures
- Avoid major keys — they tend to sound "happy" and noticeable

## Using Creative Direction
You will receive the video's creative direction. Use it to understand the VIDEO's mood — then translate that into ambient texture. Examples:
- Horror video → dark, unsettling drone with subtle dissonance
- Documentary → warm, neutral analog pad
- Comedy → light, airy ambient shimmer (but still barely noticeable)
- Tutorial → clean, minimal room-tone-like texture

## Using Narrative Beats
Shots may include a narrative_beat (hook, reveal, climax, transition, exposition, cta). Use these for MICRO energy adjustments:
- hook/climax → slightly denser texture (add one more subtle layer)
- transition/exposition → standard ambient bed
- cta → strip back to near-silence so the call-to-action is prominent
These are 5% adjustments, not dramatic shifts. The viewer should never notice the change.`;

const MUSIC_DIRECTOR_SYSTEM_PROMPT_V2 = `You are the Music Director for an AI video production pipeline.

Your ONLY job is to plan instrumental background music that is so subtle the viewer barely notices it. It should fill silence and support narration without ever feeling like a song.

## Core Philosophy
- The bed must be felt, not heard.
- If it sounds like something people would listen to on its own, it is too noticeable.
- If it has obvious rhythm, hooks, vocals, melody, featured instruments, or dramatic transitions, it is wrong.
- Think: warm room tone, distant ambient pad, restrained analog hum, quiet atmospheric texture.

## Hard Rules
- ALWAYS instrumental.
- NEVER output lyrics.
- NEVER output a lyrics field.
- NEVER use verse, chorus, bridge, refrain, topline, chant, choir, hook, riff, or beat language.
- Keep BPM in the 50-70 range only.
- All segments in a video must share the exact same timbral identity.
- Only make tiny changes in warmth, density, or tension between segments.

## Caption Rules
Each segment caption must be a comma-separated list of unobtrusive texture tags.

Good:
- "warm analog pad, quiet documentary drone, faint room tone, soft atmospheric wash, minimal, slow evolving texture"
- "dark ambient bed, distant reverb wash, gentle sub bass undertone, restrained texture, barely noticeable"

Bad:
- "cinematic orchestral score, emotional piano melody, soaring strings"
- "lo-fi beat, catchy synth lead, pulsing drums"
- "vocal ambient chant, choir swell"

## Allowed Sonic Language
- ambient pad
- drone
- room tone
- analog hum
- reverb wash
- tape warmth
- low sub undertone
- slow evolving texture
- granular haze
- distant shimmer

## Output Schema
Return JSON only with:
- shared_seed: integer 1-999999, reused across every segment
- shared_bpm: integer 50-70 only
- shared_key_scale: one stable key/scale for the entire video
- style_summary: one sentence describing the single stable timbral identity
- segments: array of objects with
  - segment_index
  - start_seconds
  - end_seconds
  - duration_seconds
  - caption
  - transition_type
  - transition_duration_seconds
  - energy_level
  - narrative_context

## Segment Rules
- Generate exactly the requested number of segments.
- Cover the full runtime with no gaps or overlaps.
- transition_type should almost always be "crossfade".
- transition_duration_seconds should usually be 3-5 seconds.
- energy_level may be low, medium, or high, but "high" still means subtle in practice.
- narrative_context should describe the story beat in plain language, not musical instructions.

## Narrative Mapping
- hook/climax: slightly denser or darker texture, still restrained
- exposition/transition: steady neutral bed
- cta/outro: pull back toward near-silence

## Consistency
All segments must sound like the same invisible background bed. Re-listening to one segment after another should feel like the same source, not different songs.`;

function getMusicDirectorResponseFormat() {
  const schema = z.toJSONSchema(MusicDirectorOutputSchema);
  const { $schema: _, ...structuralSchema } = schema as Record<string, unknown>;
  return {
    type: 'json_schema' as const,
    json_schema: {
      name: 'music_director_output',
      strict: true,
      schema: structuralSchema,
    },
  };
}


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
 * Ensure GPU is in audio_creation VRAM mode for ACE-Step 1.5.
 * 
 * Includes retry-with-backoff for 503 errors ("Cannot change VRAM mode while
 * jobs are queued or processing") to handle GPU contention from concurrent
 * video generation pipelines.
 */
async function ensureAudioMode(): Promise<boolean> {
  const currentMode = await callGpuGetMode();

  if (currentMode.success && currentMode.data?.mode === 'audio_creation' && !currentMode.data.is_switching) {
    console.log(`${LOG_PREFIX} Already in audio_creation mode`);
    return true;
  }

  // Retry parameters for GPU contention (503 = busy with other jobs)
  const MAX_MODE_SWITCH_RETRIES = 10;
  const MODE_SWITCH_RETRY_DELAY_MS = 30_000; // 30s between retries (~5 min max)

  for (let attempt = 1; attempt <= MAX_MODE_SWITCH_RETRIES; attempt++) {
    console.log(`${LOG_PREFIX} Switching to audio_creation mode (attempt ${attempt}/${MAX_MODE_SWITCH_RETRIES})...`);
    const switchResult = await callGpuSetVramMode('audio_creation');

    if (switchResult.success) {
      const ready = await waitForModeReady('audio_creation');
      if (ready) {
        console.log(`${LOG_PREFIX} Mode switch complete, stabilizing for ${POST_SWITCH_DELAY_MS / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, POST_SWITCH_DELAY_MS));
      }
      return ready;
    }

    // Check if the error is a 503 (GPU busy) — retry with backoff
    const is503 = switchResult.error?.includes('503') || switchResult.error?.includes('jobs are queued');
    if (is503 && attempt < MAX_MODE_SWITCH_RETRIES) {
      console.warn(
        `${LOG_PREFIX} GPU busy (503) — waiting ${MODE_SWITCH_RETRY_DELAY_MS / 1000}s before retry ` +
        `(${attempt}/${MAX_MODE_SWITCH_RETRIES}): ${switchResult.error}`
      );
      await new Promise(resolve => setTimeout(resolve, MODE_SWITCH_RETRY_DELAY_MS));

      // Re-check if mode was switched by another process while we waited
      const recheck = await callGpuGetMode();
      if (recheck.success && recheck.data?.mode === 'audio_creation' && !recheck.data.is_switching) {
        console.log(`${LOG_PREFIX} Mode switched by another process while waiting — ready`);
        return true;
      }
      continue;
    }

    // Non-503 error or max retries exhausted
    console.error(`${LOG_PREFIX} Failed to initiate mode switch: ${switchResult.error}`);
    return false;
  }

  console.error(`${LOG_PREFIX} Mode switch failed after ${MAX_MODE_SWITCH_RETRIES} retries`);
  return false;
}

// Maximum segments per LLM call to maintain output quality
const PLANNING_BATCH_SIZE = 6;

/**
 * Post-process LLM-planned segment timings to guarantee sequential,
 * gap-free, overlap-free placement covering the full video duration.
 *
 * The LLM controls creative decisions (energy, captions, proportions)
 * but actual timestamps become deterministic after this function.
 */
function fixSegmentTimings(
  segments: MusicSegmentPlan[],
  totalDurationSeconds: number
): MusicSegmentPlan[] {
  if (segments.length === 0) return segments;

  // Sort by segment_index to ensure correct order
  const sorted = [...segments].sort((a, b) => a.segment_index - b.segment_index);

  // Calculate original total of LLM-planned durations
  const llmTotalDuration = sorted.reduce((sum, s) => sum + s.duration_seconds, 0);

  // Scale proportionally so segments cover exactly totalDurationSeconds
  // (preserves relative proportions the LLM chose)
  const scaleFactor = llmTotalDuration > 0
    ? totalDurationSeconds / llmTotalDuration
    : totalDurationSeconds / sorted.length;

  let cursor = 0;
  let correctionsMade = 0;

  for (const seg of sorted) {
    const originalStart = seg.start_seconds;
    const originalDuration = seg.duration_seconds;

    // Scale duration proportionally, clamped to valid range
    let scaledDuration = llmTotalDuration > 0
      ? originalDuration * scaleFactor
      : totalDurationSeconds / sorted.length;
    scaledDuration = Math.max(10, Math.min(180, scaledDuration));

    // Force sequential placement starting from cursor
    seg.start_seconds = cursor;
    seg.duration_seconds = scaledDuration;
    seg.end_seconds = cursor + scaledDuration;

    if (Math.abs(originalStart - seg.start_seconds) > 0.5 ||
        Math.abs(originalDuration - seg.duration_seconds) > 0.5) {
      console.log(`${LOG_PREFIX} fixSegmentTimings: Seg ${seg.segment_index} ` +
        `${originalStart.toFixed(1)}s/${originalDuration.toFixed(1)}s → ` +
        `${seg.start_seconds.toFixed(1)}s/${seg.duration_seconds.toFixed(1)}s`);
      correctionsMade++;
    }

    cursor = seg.end_seconds;
  }

  // Stretch/shrink last segment to exactly hit totalDurationSeconds
  const last = sorted[sorted.length - 1];
  const overshoot = last.end_seconds - totalDurationSeconds;
  if (Math.abs(overshoot) > 0.1) {
    last.duration_seconds = totalDurationSeconds - last.start_seconds;
    last.end_seconds = totalDurationSeconds;
    console.log(`${LOG_PREFIX} fixSegmentTimings: Adjusted last segment to end at ${totalDurationSeconds.toFixed(1)}s`);
  }

  if (correctionsMade > 0) {
    console.log(`${LOG_PREFIX} fixSegmentTimings: Corrected ${correctionsMade}/${sorted.length} segment timings`);
  } else {
    console.log(`${LOG_PREFIX} fixSegmentTimings: All ${sorted.length} segment timings were already correct`);
  }

  return sorted;
}

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
  const responseFormat = getMusicDirectorResponseFormat();

  console.log(`${LOG_PREFIX} Planning ${requiredSegments} segments in ${totalBatches} batch(es)`);

  // Shared parameters established by the first batch
  let sharedSeed: number = 482_910;
  let sharedBpm: number = DEFAULT_SHARED_BPM;
  let sharedKeyScale: string = DEFAULT_SHARED_KEY_SCALE;
  let styleSummary: string = DEFAULT_STYLE_SUMMARY;
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
        windowShots.map(s => {
          const beatTag = s.narrative_beat ? ` | beat:${s.narrative_beat}` : '';
          const sceneTag = s.scene_id ? ` | scene:${s.scene_id}` : '';
          return `  Shot ${s.segment_index}: ${s.start_seconds.toFixed(1)}s–${s.end_seconds.toFixed(1)}s${beatTag}${sceneTag} | ${s.summary || s.text || 'No description'}`;
        }).join('\n')
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
      userPrompt = `Plan ambient background texture for this video (BATCH 1 of ${totalBatches}):

FULL VIDEO DURATION: ${context.totalDurationSeconds.toFixed(1)} seconds (${(context.totalDurationSeconds / 60).toFixed(1)} minutes)
THIS BATCH: segments ${batchStart} through ${batchEnd - 1} (${batchCount} segments, covering ${windowStartSec.toFixed(0)}s–${windowEndSec.toFixed(0)}s)
TOTAL SEGMENTS PLANNED: ${requiredSegments} across all batches
TARGET SEGMENT LENGTH: ~${Math.round(segDuration)}s each
${context.creativeDirection ? `\nCREATIVE DIRECTION:\n${context.creativeDirection}` : ''}
${context.userPrompt ? `\nVIDEO IDEA: ${context.userPrompt}` : ''}
${context.genre ? `\nCONTENT GENRE: ${context.genre}` : ''}

REMINDER: Generate barely-noticeable ambient texture, NOT composed music. No melodies, beats, or hooks.

SCRIPT FOR THIS WINDOW:
${scriptExcerpt}${scriptExcerpt.length >= 600 ? '...' : ''}
${shotContext}

Generate exactly ${batchCount} segments (indices ${batchStart} to ${batchEnd - 1}) covering ${windowStartSec.toFixed(0)}s–${windowEndSec.toFixed(0)}s.
Also establish shared_seed, shared_bpm (50-70 range ONLY), shared_key_scale, and style_summary for the entire video.`;
    } else {
      // Subsequent batches: use established parameters, carry forward context
      userPrompt = `Continue planning ambient background texture (BATCH ${batchIdx + 1} of ${totalBatches}):

FULL VIDEO DURATION: ${context.totalDurationSeconds.toFixed(1)} seconds (${(context.totalDurationSeconds / 60).toFixed(1)} minutes)
THIS BATCH: segments ${batchStart} through ${batchEnd - 1} (${batchCount} segments, covering ${windowStartSec.toFixed(0)}s–${windowEndSec.toFixed(0)}s)

ESTABLISHED STYLE (from batch 1 — DO NOT change these):
- shared_seed: ${sharedSeed}
- shared_bpm: ${sharedBpm}
- shared_key_scale: "${sharedKeyScale}"
- style_summary: "${styleSummary}"
${prevContext}

REMINDER: This is barely-noticeable ambient texture, NOT composed music.

SCRIPT FOR THIS WINDOW:
${scriptExcerpt}${scriptExcerpt.length >= 600 ? '...' : ''}
${shotContext}

Generate exactly ${batchCount} segments (indices ${batchStart} to ${batchEnd - 1}) covering ${windowStartSec.toFixed(0)}s–${windowEndSec.toFixed(0)}s.
Use the EXACT same shared_seed, shared_bpm, shared_key_scale, and style_summary as batch 1.
Maintain timbral continuity with previous segments.`;
    }

    console.log(`${LOG_PREFIX} Planning batch ${batchIdx + 1}/${totalBatches}: ` +
      `segments ${batchStart}-${batchEnd - 1} (${windowStartSec.toFixed(0)}s–${windowEndSec.toFixed(0)}s)`);

    let batchResult: MusicDirectorOutput | null = null;
    let lastBatchError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_PLANNING_RETRIES; attempt++) {
      console.log(
        `${LOG_PREFIX} Planning batch ${batchIdx + 1}/${totalBatches} ` +
        `(attempt ${attempt}/${MAX_PLANNING_RETRIES})`
      );

      try {
        const raw = await generateJSON<MusicDirectorOutput>(
          context.userId,
          MUSIC_DIRECTOR_SYSTEM_PROMPT_V2,
          userPrompt,
          {
            responseFormat,
            temperature: 0.3,
            maxTokens: 65536,
            maxRetries: 1,
          }
        );

        const parsed = MusicDirectorOutputSchema.safeParse(raw);
        if (!parsed.success) {
          lastBatchError = new Error(parsed.error.message);
          console.warn(
            `${LOG_PREFIX} Batch ${batchIdx + 1} schema validation failed on attempt ${attempt}:`,
            parsed.error.message
          );
        } else if (parsed.data.segments.length !== batchCount) {
          lastBatchError = new Error(
            `Expected ${batchCount} segments but received ${parsed.data.segments.length}`
          );
          console.warn(
            `${LOG_PREFIX} Batch ${batchIdx + 1} returned ${parsed.data.segments.length}/${batchCount} segments on attempt ${attempt}`
          );
        } else {
          batchResult = parsed.data;
          break;
        }
      } catch (error) {
        lastBatchError = error instanceof Error ? error : new Error(String(error));
        console.warn(
          `${LOG_PREFIX} Batch ${batchIdx + 1} attempt ${attempt} failed: ${lastBatchError.message}`
        );
      }

      if (attempt < MAX_PLANNING_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, 1_500 * attempt));
      }
    }

    if (!batchResult) {
      throw new Error(
        `Music Director batch ${batchIdx + 1} failed after ${MAX_PLANNING_RETRIES} attempts: ` +
        `${lastBatchError?.message || 'unknown error'}`
      );
    }

    // Capture shared parameters from batch 1
    if (batchIdx === 0) {
      sharedSeed = batchResult.shared_seed;
      sharedBpm = batchResult.shared_bpm;
      sharedKeyScale = batchResult.shared_key_scale;
      styleSummary = batchResult.style_summary;
    } else if (
      batchResult.shared_seed !== sharedSeed ||
      batchResult.shared_bpm !== sharedBpm ||
      batchResult.shared_key_scale !== sharedKeyScale
    ) {
      console.warn(
        `${LOG_PREFIX} Batch ${batchIdx + 1} returned different shared music parameters â€” keeping batch 1 values`
      );
    }

    // Clamp segment durations and fix indices
    batchResult.segments.forEach((seg, indexInBatch) => {
      seg.segment_index = batchStart + indexInBatch;
      if (seg.duration_seconds < 10) seg.duration_seconds = 30;
      if (seg.duration_seconds > 180) seg.duration_seconds = 180;
      seg.end_seconds = seg.start_seconds + seg.duration_seconds;
      allSegments.push(seg);
    });

    console.log(`${LOG_PREFIX} Batch ${batchIdx + 1}: ${batchResult.segments.length} segments planned`);
  }

  // Fix LLM-planned timings to guarantee sequential, gap-free placement
  const fixedSegments = fixSegmentTimings(allSegments, context.totalDurationSeconds);

  console.log(`${LOG_PREFIX} Music plan complete: ${fixedSegments.length} segments, ` +
    `${sharedBpm} BPM, ${sharedKeyScale}, seed=${sharedSeed}`);
  console.log(`${LOG_PREFIX} Style: ${styleSummary}`);

  return {
    segments: fixedSegments,
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
      duration_seconds: segment.duration_seconds,
      seed: plan.shared_seed,
      bpm: plan.shared_bpm,
      key_scale: plan.shared_key_scale,
      time_signature: '4',  // 4/4 is standard for most background music
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

    // Normalize music segment to -16 LUFS (EBU R128 compliant)
    // The GPU uploads WAV directly to R2 via presigned URL.
    // We download → normalize → re-upload in place.
    try {
      const { normalizeAudioFromR2 } = await import('./audio-normalizer');
      const normResult = await normalizeAudioFromR2(publicUrl, r2Key, { inputFormat: 'wav' });
      if (normResult.normalized) {
        console.log(
          `${segPrefix} Normalized: ${normResult.originalLufs.toFixed(1)} → ${normResult.normalizedLufs.toFixed(1)} LUFS ` +
          `(${normResult.gainApplied > 0 ? '+' : ''}${normResult.gainApplied.toFixed(1)} dB, ${normResult.processingTimeMs}ms)`
        );
      } else if (normResult.skipReason) {
        console.log(`${segPrefix} Normalization skipped — ${normResult.skipReason}`);
      }
    } catch (normErr) {
      console.warn(`${segPrefix} Normalization failed, using original audio:`, normErr);
    }

    return {
      segment_index: segment.segment_index,
      audio_url: publicUrl,
      start_seconds: segment.start_seconds,
      end_seconds: segment.end_seconds,
      duration_seconds: segment.duration_seconds,
      transition_type: segment.transition_type,
      transition_duration_seconds: segment.transition_duration_seconds,
      volume: 0.15, // Post-normalization: all audio at -16 LUFS; editor controls final mix
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
