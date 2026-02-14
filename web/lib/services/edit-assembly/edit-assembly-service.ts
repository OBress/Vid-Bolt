/**
 * Edit Assembly Service
 * ============================================================================
 * Orchestrates AI-driven edit decisions. Takes project context (shots, audio,
 * media, script) and calls an LLM to produce an Edit Decision List (EDL).
 *
 * Key responsibilities:
 * - Build project context from video project data
 * - Call OpenRouter API with documentary-style system prompt
 * - Parse and validate the returned EDL JSON
 * - Fallback with simplified prompt on failure
 */

import {
  EDIT_ASSEMBLY_SYSTEM_PROMPT,
  buildEditAssemblyUserPrompt,
  type EditAssemblyContext,
  type EditDecisionList,
  type EDLClip,
  type EDLTransition,
} from './edit-assembly-prompts';
import type { GeneratedMedia } from '@/types/video';

// ============================================================
// TYPES
// ============================================================

/** Minimal shot shape needed by the edit assembly service */
interface ShotDataInput {
  segment_index: number;
  start_seconds: number;
  end_seconds: number;
  duration_seconds: number;
  text: string;
  content_type?: string;
  summary?: string;
  media_type?: 'image' | 'video' | 'motiongraphic';
}

export interface AssembleEditRequest {
  /** Video project ID */
  videoId: string;
  /** Shot list from the pipeline */
  shots: ShotDataInput[];
  /** Generated media entries */
  generatedMedia: GeneratedMedia[];
  /** Video title/topic */
  videoTitle: string;
  /** Audio chunks from TTS */
  audioChunks: Array<{
    index: number;
    duration_seconds: number;
    text?: string;
    audio_url?: string;
  }>;
  /** Full script text (for sentence extraction) */
  scriptText?: string;
  /** FPS setting */
  fps?: number;
  /** OpenRouter API key */
  apiKey: string;
  /** Model to use */
  model?: string;
}

export interface AssembleEditResult {
  success: boolean;
  edl?: EditDecisionList;
  error?: string;
}

// ============================================================
// SERVICE
// ============================================================

/**
 * Generate an Edit Decision List for a video project using AI.
 */
export async function assembleEdit(request: AssembleEditRequest): Promise<AssembleEditResult> {
  const {
    shots,
    generatedMedia,
    videoTitle,
    audioChunks,
    scriptText = '',
    fps = 30,
    apiKey,
    model = 'google/gemini-2.5-flash-preview',
  } = request;

  console.log(`[EditAssembly] Starting EDL generation for "${videoTitle}" (${shots.length} shots, ${generatedMedia.length} media items)`);

  try {
    // 1. Build context object
    const context = buildContext(shots, generatedMedia, videoTitle, audioChunks, scriptText, fps);

    // 2. Build user prompt
    const userPrompt = buildEditAssemblyUserPrompt(context);

    console.log(`[EditAssembly] Context: ${context.shots.length} shots, ${context.failedShots.length} failed, ${context.audioChunks.length} audio chunks`);

    // 3. Call LLM
    let edl = await callLLM(apiKey, model, EDIT_ASSEMBLY_SYSTEM_PROMPT, userPrompt);

    // 4. Validate and fix common issues
    edl = validateAndFix(edl, shots);

    console.log(`[EditAssembly] EDL generated: ${edl.clips.length} clips, ${edl.transitions.length} transitions, ${edl.effects.length} effects, ${edl.textOverlays.length} text overlays`);

    return { success: true, edl };
  } catch (error) {
    console.error('[EditAssembly] EDL generation failed:', error);

    // Fallback: generate a simple sequential EDL without AI
    try {
      console.log('[EditAssembly] Falling back to simple sequential EDL');
      const fallbackEDL = generateFallbackEDL(shots, generatedMedia, fps);
      return { success: true, edl: fallbackEDL };
    } catch (fallbackError) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'EDL generation failed',
      };
    }
  }
}

// ============================================================
// CONTEXT BUILDER
// ============================================================

function buildContext(
  shots: ShotDataInput[],
  generatedMedia: GeneratedMedia[],
  videoTitle: string,
  audioChunks: Array<{ index: number; duration_seconds: number; text?: string }>,
  scriptText: string,
  fps: number
): EditAssemblyContext {
  // Build media lookup
  const mediaByShot = new Map<number, GeneratedMedia>();
  generatedMedia.forEach(m => mediaByShot.set(m.shot_index, m));

  // Identify failed shots
  const failedShots = generatedMedia
    .filter(m => m.generation_status === 'failed')
    .map(m => m.shot_index);

  // Also include shots with no media at all
  shots.forEach(shot => {
    const media = mediaByShot.get(shot.segment_index);
    if (!media && !failedShots.includes(shot.segment_index)) {
      failedShots.push(shot.segment_index);
    }
  });

  // Extract sentences from script
  const scriptSentences = scriptText
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 10);

  // Calculate total duration
  const totalDuration = shots.length > 0
    ? shots[shots.length - 1].end_seconds
    : audioChunks.reduce((sum, c) => sum + c.duration_seconds, 0);

  return {
    videoTitle,
    totalDuration,
    fps,
    shots: shots.map(shot => {
      const media = mediaByShot.get(shot.segment_index);
      return {
        index: shot.segment_index,
        startSeconds: shot.start_seconds,
        endSeconds: shot.end_seconds,
        durationSeconds: shot.duration_seconds,
        text: shot.text,
        mediaType: (media?.media_type || 'none') as 'image' | 'video' | 'motiongraphic' | 'none',
        hasMedia: !!media && media.generation_status === 'completed',
        mediaUrl: media?.media_url,
      };
    }),
    scriptSentences,
    failedShots,
    audioChunks: audioChunks.map(c => ({
      index: c.index,
      durationSeconds: c.duration_seconds,
      text: c.text,
    })),
  };
}

// ============================================================
// LLM CALLER
// ============================================================

async function callLLM(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<EditDecisionList> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'https://vidbolt.com',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 8000,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('Empty response from LLM');
  }

  // Parse JSON — strip any markdown fences if present
  let jsonStr = content.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  const parsed = JSON.parse(jsonStr) as EditDecisionList;

  // Minimal structural validation
  if (!parsed.clips || !Array.isArray(parsed.clips)) {
    throw new Error('EDL missing required "clips" array');
  }

  // Ensure all required arrays exist
  parsed.transitions = parsed.transitions || [];
  parsed.effects = parsed.effects || [];
  parsed.textOverlays = parsed.textOverlays || [];
  parsed.motionGraphics = parsed.motionGraphics || [];
  parsed.audioEffects = parsed.audioEffects || [];
  parsed.mediaIssues = parsed.mediaIssues || [];

  return parsed;
}

// ============================================================
// VALIDATION & FIX
// ============================================================

function validateAndFix(edl: EditDecisionList, shots: ShotDataInput[]): EditDecisionList {
  const fixed = { ...edl };

  // Fix: ensure no overlapping clips on same track
  const clipsByTrack = new Map<string, EDLClip[]>();
  fixed.clips.forEach(clip => {
    const arr = clipsByTrack.get(clip.track) || [];
    arr.push(clip);
    clipsByTrack.set(clip.track, arr);
  });

  clipsByTrack.forEach((clips, track) => {
    clips.sort((a, b) => a.startTime - b.startTime);
    for (let i = 1; i < clips.length; i++) {
      const prev = clips[i - 1];
      const curr = clips[i];
      const prevEnd = prev.startTime + prev.duration;
      if (curr.startTime < prevEnd) {
        // Push this clip to start after previous
        console.warn(`[EditAssembly] Fix: Clip ${curr.shotIndex} overlapped on ${track}, adjusted from ${curr.startTime}s to ${prevEnd}s`);
        curr.startTime = prevEnd;
      }
    }
  });

  // Fix: transition durations must be reasonable
  fixed.transitions = fixed.transitions.filter(t => {
    if (t.duration <= 0 || t.duration > 3) {
      console.warn(`[EditAssembly] Fix: Removed transition with invalid duration ${t.duration}s`);
      return false;
    }
    return true;
  });

  // Fix: text overlay durations must be reasonable
  fixed.textOverlays = fixed.textOverlays.filter(t => {
    if (t.duration <= 0 || t.duration > 30) {
      console.warn(`[EditAssembly] Fix: Removed text overlay with invalid duration ${t.duration}s`);
      return false;
    }
    return true;
  });

  return fixed;
}

// ============================================================
// FALLBACK: Simple sequential EDL (no AI)
// ============================================================

function generateFallbackEDL(
  shots: ShotDataInput[],
  generatedMedia: GeneratedMedia[],
  fps: number
): EditDecisionList {
  const mediaByShot = new Map<number, GeneratedMedia>();
  generatedMedia.forEach(m => mediaByShot.set(m.shot_index, m));

  const clips: EDLClip[] = [];
  const transitions: EDLTransition[] = [];
  const mediaIssues: EditDecisionList['mediaIssues'] = [];
  let currentTime = 0;

  for (const shot of shots) {
    const media = mediaByShot.get(shot.segment_index);
    const hasMedia = !!media && media.generation_status === 'completed';

    if (!hasMedia) {
      mediaIssues.push({
        shotIndex: shot.segment_index,
        severity: 'error',
        type: media?.generation_status === 'failed' ? 'generation_failed' : 'missing_media',
        title: `Shot ${shot.segment_index + 1} media unavailable`,
        description: `Media for this shot is ${media?.generation_status || 'missing'}. A placeholder will be shown.`,
      });
    }

    clips.push({
      shotIndex: shot.segment_index,
      track: 'video-1',
      startTime: currentTime,
      duration: shot.duration_seconds,
      mediaType: (media?.media_type || 'image') as 'image' | 'video' | 'motiongraphic',
      sourceUrl: media?.media_url,
    });

    currentTime += shot.duration_seconds;
  }

  // Add simple crossfade between major transitions (every 3 clips)
  for (let i = 2; i < clips.length; i += 3) {
    if (i < clips.length) {
      transitions.push({
        type: 'crossfade',
        duration: 0.5,
        fromShotIndex: clips[i - 1].shotIndex,
        toShotIndex: clips[i].shotIndex,
        position: 'between',
      });
    }
  }

  return {
    clips,
    transitions,
    effects: shots
      .filter(s => {
        const m = mediaByShot.get(s.segment_index);
        return m?.media_type === 'image';
      })
      .map(s => ({
        shotIndex: s.segment_index,
        type: 'slowZoomIn' as const,
        params: { startScale: 1.0, endScale: 1.05 },
      })),
    textOverlays: [],
    motionGraphics: shots
      .filter(s => {
        const m = mediaByShot.get(s.segment_index);
        return m?.media_type === 'motiongraphic' && m?.generation_status === 'completed';
      })
      .map(s => ({
        shotIndex: s.segment_index,
        track: 'effects-1',
        startTime: s.start_seconds,
        duration: s.duration_seconds,
      })),
    audioEffects: [
      { target: 'main' as const, type: 'fadeIn' as const, startTime: 0, duration: 1 },
      {
        target: 'main' as const,
        type: 'fadeOut' as const,
        startTime: currentTime - 2,
        duration: 2,
      },
    ],
    mediaIssues,
  };
}
