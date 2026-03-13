/**
 * VLM-Guided Clip Trimmer
 * ============================================================================
 * Post-generation step that reviews each AI-generated video clip to find
 * optimal in/out points, removing dead frames and startup artifacts from
 * LTX-2.3 output.
 *
 * Flow:
 *   1. Sample evenly-spaced frames from each generated clip
 *   2. Send frames + shot description to Gemini 3 Flash
 *   3. Identify the best contiguous segment
 *   4. Store trim metadata for edit assembly
 *
 * This runs between Phase IV (Production) and Phase V (Assembly).
 */

import { getOpenRouterApiKey } from '@/lib/services/api-keys';
import { getSupabaseServiceClient } from '@/lib/queues/shared';

// ============================================================================
// TYPES
// ============================================================================

export interface ClipTrimResult {
  /** Shot index this trim applies to */
  shotIndex: number;
  /** Original clip duration in seconds */
  originalDuration: number;
  /** Recommended start time in seconds */
  trimStart: number;
  /** Recommended end time in seconds */
  trimEnd: number;
  /** Trimmed duration in seconds */
  trimmedDuration: number;
  /** Whether the clip was actually trimmed (vs. using full duration) */
  wasTrimmed: boolean;
}

export interface ClipTrimmerConfig {
  /** Number of frames to sample from each clip (default: 8) */
  frameSampleCount?: number;
  /** GPU API base URL */
  gpuApiUrl: string;
  /** GPU API secret for auth */
  gpuApiSecret: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const LOG_PREFIX = '[ClipTrimmer]';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const TRIM_MODEL = 'google/gemini-3-flash-preview';
const DEFAULT_FRAME_COUNT = 8;

// ============================================================================
// MAIN
// ============================================================================

/**
 * Analyze a single video clip and determine optimal trim points.
 * Uses Gemini 3 Flash to evaluate sampled frames against the shot description.
 */
export async function trimClip(
  videoUrl: string,
  shotIndex: number,
  shotDescription: string,
  durationSeconds: number,
  userId: string,
  config: ClipTrimmerConfig
): Promise<ClipTrimResult> {
  const frameCount = config.frameSampleCount || DEFAULT_FRAME_COUNT;

  try {
    // Step 1: Sample frames from the video
    const frames = await sampleFrames(videoUrl, frameCount, config);

    if (frames.length === 0) {
      console.warn(`${LOG_PREFIX} Shot ${shotIndex}: No frames sampled — skipping trim`);
      return noTrim(shotIndex, durationSeconds);
    }

    // Step 2: Ask VLM to identify the best segment
    const apiKey = await getOpenRouterApiKey(userId);
    const trimResult = await analyzeTrimPoints(
      frames, shotIndex, shotDescription, durationSeconds, frameCount, apiKey
    );

    if (!trimResult.wasTrimmed) {
      console.log(`${LOG_PREFIX} Shot ${shotIndex}: Full clip is usable (no trim needed)`);
    } else {
      console.log(
        `${LOG_PREFIX} Shot ${shotIndex}: Trimmed ${durationSeconds.toFixed(1)}s → ` +
        `${trimResult.trimmedDuration.toFixed(1)}s (${trimResult.trimStart.toFixed(1)}s - ${trimResult.trimEnd.toFixed(1)}s)`
      );
    }

    return trimResult;
  } catch (error) {
    // Non-blocking: if trimming fails, use the full clip
    console.warn(`${LOG_PREFIX} Shot ${shotIndex}: Trim analysis failed, using full clip:`, error);
    return noTrim(shotIndex, durationSeconds);
  }
}

/**
 * Process all video clips in a project and store trim metadata.
 */
export async function trimAllClips(
  videoId: string,
  videoShots: Array<{
    shotIndex: number;
    mediaUrl: string;
    description: string;
    durationSeconds: number;
  }>,
  userId: string,
  config: ClipTrimmerConfig
): Promise<ClipTrimResult[]> {
  console.log(`${LOG_PREFIX} Trimming ${videoShots.length} video clips for project ${videoId}`);

  const results: ClipTrimResult[] = [];

  for (const shot of videoShots) {
    const result = await trimClip(
      shot.mediaUrl,
      shot.shotIndex,
      shot.description,
      shot.durationSeconds,
      userId,
      config
    );
    results.push(result);
  }

  // Persist trim metadata to the video project
  const supabase = getSupabaseServiceClient();
  const { data: project } = await supabase
    .from('video_projects')
    .select('metadata')
    .eq('id', videoId)
    .single();

  const metadata = (project?.metadata || {}) as Record<string, unknown>;

  await supabase
    .from('video_projects')
    .update({
      metadata: {
        ...metadata,
        clip_trims: results,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', videoId);

  const trimmedCount = results.filter(r => r.wasTrimmed).length;
  console.log(`${LOG_PREFIX} Done: ${trimmedCount}/${videoShots.length} clips trimmed`);

  return results;
}

// ============================================================================
// INTERNALS
// ============================================================================

/**
 * Sample evenly-spaced frames from a video via the GPU API.
 */
async function sampleFrames(
  videoUrl: string,
  frameCount: number,
  config: ClipTrimmerConfig
): Promise<string[]> {
  const response = await fetch(`${config.gpuApiUrl}/api/sample-frames`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.gpuApiSecret}`,
    },
    body: JSON.stringify({
      video_url: videoUrl,
      frame_count: frameCount,
      output_format: 'jpeg',
      quality: 80,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Frame sampling API error: ${response.status} — ${errText.substring(0, 200)}`);
  }

  const result = await response.json();
  return (result.frame_urls || []) as string[];
}

/**
 * Use Gemini 3 Flash to analyze sampled frames and determine trim points.
 */
async function analyzeTrimPoints(
  frameUrls: string[],
  shotIndex: number,
  shotDescription: string,
  durationSeconds: number,
  frameCount: number,
  apiKey: string
): Promise<ClipTrimResult> {
  // Build multimodal content with frame images
  const imageContent = frameUrls.map((url, i) => ([
    {
      type: 'text' as const,
      text: `Frame ${i + 1}/${frameCount} (at ${((i / frameCount) * durationSeconds).toFixed(1)}s):`,
    },
    {
      type: 'image_url' as const,
      image_url: { url },
    },
  ])).flat();

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      'X-Title': 'Vid-Bolt Clip Trimmer',
    },
    body: JSON.stringify({
      model: TRIM_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You analyze AI-generated video clips to find the best usable segment.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `These are ${frameCount} evenly-spaced frames from a ${durationSeconds.toFixed(1)}s AI-generated video clip.
The intended shot description is: "${shotDescription}"

Identify the best CONTIGUOUS segment of this clip:
- Which frames show the most meaningful motion and visual clarity?
- Avoid: static/frozen frames at the start (startup artifacts), visual decay at the end
- If ALL frames look good, return the full range (start_frame=0, end_frame=${frameCount - 1})`,
            },
            ...imageContent,
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 512,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'clip_trim',
          strict: true,
          schema: {
            type: 'object',
            required: ['start_frame', 'end_frame', 'reason'],
            additionalProperties: false,
            properties: {
              start_frame: { type: 'number' },
              end_frame: { type: 'number' },
              reason: { type: 'string' },
            },
          },
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Trim analysis API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '{}';

  try {
    const parsed = JSON.parse(content);
    const startFrame = Math.max(0, Math.min(parsed.start_frame || 0, frameCount - 1));
    const endFrame = Math.max(startFrame, Math.min(parsed.end_frame || frameCount - 1, frameCount - 1));

    // Convert frame indices to time codes
    const secondsPerFrame = durationSeconds / frameCount;
    const trimStart = startFrame * secondsPerFrame;
    const trimEnd = (endFrame + 1) * secondsPerFrame;
    const trimmedDuration = trimEnd - trimStart;

    // Only mark as trimmed if we're actually cutting something significant (>0.5s)
    const wasTrimmed = (durationSeconds - trimmedDuration) > 0.5;

    return {
      shotIndex,
      originalDuration: durationSeconds,
      trimStart,
      trimEnd: Math.min(trimEnd, durationSeconds),
      trimmedDuration: Math.min(trimmedDuration, durationSeconds),
      wasTrimmed,
    };
  } catch {
    return noTrim(shotIndex, durationSeconds);
  }
}

/** Helper: return a no-trim result (use full clip). */
function noTrim(shotIndex: number, duration: number): ClipTrimResult {
  return {
    shotIndex,
    originalDuration: duration,
    trimStart: 0,
    trimEnd: duration,
    trimmedDuration: duration,
    wasTrimmed: false,
  };
}
