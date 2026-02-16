/**
 * Edit Assembly Service
 * ============================================================================
 * Orchestrates AI-driven edit decisions. Takes project context (shots, audio,
 * media, script) and calls an LLM to produce an Edit Decision List (EDL).
 *
 * V2: Returns EditorAgentEDL with multi-track, effects, keyframes, text styling.
 * Falls back to a richer fallback EDL when LLM fails.
 */

import {
  EDIT_ASSEMBLY_SYSTEM_PROMPT,
  buildEditAssemblyUserPrompt,
  type EditAssemblyContext,
  type EditDecisionList,
} from './edit-assembly-prompts';
import type {
  EditorAgentEDL,
  AgentClip,
  AgentTrack,
  AgentTransition,
} from './editor-capability-manifest';
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
  videoId: string;
  shots: ShotDataInput[];
  generatedMedia: GeneratedMedia[];
  videoTitle: string;
  audioChunks: Array<{
    index: number;
    duration_seconds: number;
    text?: string;
    audio_url?: string;
  }>;
  scriptText?: string;
  fps?: number;
  apiKey: string;
  model?: string;
}

export interface AssembleEditResult {
  success: boolean;
  /** V2 EDL format (preferred) */
  agentEdl?: EditorAgentEDL;
  /** Legacy EDL format (for backward compat) */
  edl?: EditDecisionList;
  error?: string;
}

// ============================================================
// SERVICE
// ============================================================

/**
 * Generate an Edit Decision List for a video project using AI.
 * Returns the new EditorAgentEDL format. Legacy `edl` field is populated
 * by converting the agent EDL for backward compat.
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

    // 3. Call LLM for v2 format
    let agentEdl = await callLLMv2(apiKey, model, EDIT_ASSEMBLY_SYSTEM_PROMPT, userPrompt);

    // 4. Validate and fix
    agentEdl = validateAndFixV2(agentEdl, shots);

    console.log(`[EditAssembly] Agent EDL: ${agentEdl.tracks.length} tracks, ${agentEdl.clips.length} clips, ${agentEdl.transitions.length} transitions, ${agentEdl.clips.filter(c => c.type === 'text').length} text clips`);

    // 5. Convert to legacy format for backward compat
    const legacyEdl = agentEdlToLegacy(agentEdl);

    return { success: true, agentEdl, edl: legacyEdl };
  } catch (error) {
    console.error('[EditAssembly] EDL generation failed:', error);

    // Fallback: generate a rich EDL without AI
    try {
      console.log('[EditAssembly] Falling back to enhanced fallback EDL');
      const agentEdl = generateFallbackAgentEDL(shots, generatedMedia, fps, scriptText);
      const legacyEdl = agentEdlToLegacy(agentEdl);
      return { success: true, agentEdl, edl: legacyEdl };
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
  const mediaByShot = new Map<number, GeneratedMedia>();
  generatedMedia.forEach(m => mediaByShot.set(m.shot_index, m));

  const failedShots = generatedMedia
    .filter(m => m.generation_status === 'failed')
    .map(m => m.shot_index);

  shots.forEach(shot => {
    const media = mediaByShot.get(shot.segment_index);
    if (!media && !failedShots.includes(shot.segment_index)) {
      failedShots.push(shot.segment_index);
    }
  });

  const scriptSentences = scriptText
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 10);

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
// LLM CALLER (V2 — EditorAgentEDL)
// ============================================================

async function callLLMv2(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<EditorAgentEDL> {
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
      max_tokens: 16000,
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

  // Log raw response for debugging
  console.log(`[EditAssembly] Raw LLM response length: ${content.length} chars`);
  console.log(`[EditAssembly] Raw LLM response preview: ${content.substring(0, 200)}...`);

  // Parse JSON — strip any markdown fences if present
  let jsonStr = content.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    console.error(`[EditAssembly] JSON parse error. Raw content:\n${content.substring(0, 500)}`);
    throw new Error(`Failed to parse LLM response as JSON: ${e instanceof Error ? e.message : 'unknown'}`);
  }

  // Detect format: is this v2 (EditorAgentEDL) or legacy (EditDecisionList)?
  if (Array.isArray(parsed.tracks) && Array.isArray(parsed.clips)) {
    // V2 format — validate
    const agentEdl = parsed as unknown as EditorAgentEDL;
    agentEdl.transitions = agentEdl.transitions || [];
    agentEdl.audioFades = agentEdl.audioFades || [];
    agentEdl.mediaIssues = agentEdl.mediaIssues || [];
    return agentEdl;
  }

  // Legacy format detection — convert to v2
  if (Array.isArray(parsed.clips) && !Array.isArray(parsed.tracks)) {
    console.log('[EditAssembly] LLM returned legacy EDL format, converting to v2');
    const legacy = parsed as unknown as EditDecisionList;
    legacy.transitions = legacy.transitions || [];
    legacy.effects = legacy.effects || [];
    legacy.textOverlays = legacy.textOverlays || [];
    legacy.motionGraphics = legacy.motionGraphics || [];
    legacy.audioEffects = legacy.audioEffects || [];
    legacy.mediaIssues = legacy.mediaIssues || [];
    return legacyToAgentEdl(legacy);
  }

  console.error(`[EditAssembly] Unrecognized EDL format. Keys: ${Object.keys(parsed).join(', ')}`);
  throw new Error(`EDL missing required 'clips' array. Got keys: ${Object.keys(parsed).join(', ')}`);
}

// ============================================================
// FORMAT CONVERTERS
// ============================================================

/** Convert legacy EditDecisionList to EditorAgentEDL */
function legacyToAgentEdl(legacy: EditDecisionList): EditorAgentEDL {
  // Collect unique tracks from clips
  const trackIds = new Set(legacy.clips.map(c => c.track));
  const tracks: AgentTrack[] = [];
  let order = 0;
  for (const trackId of trackIds) {
    tracks.push({
      id: trackId,
      type: 'video',
      name: trackId.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()),
      group: 'video',
      order: order++,
    });
  }

  // Add text track if there are text overlays
  if (legacy.textOverlays.length > 0) {
    tracks.push({
      id: 'text-overlays',
      type: 'video',
      name: 'Text Overlays',
      group: 'text',
      order: order++,
    });
  }

  // Convert clips
  const clips: AgentClip[] = legacy.clips.map(c => ({
    trackId: c.track,
    shotIndex: c.shotIndex,
    type: c.mediaType === 'motiongraphic' ? 'motion-graphics' as const : c.mediaType as 'image' | 'video',
    startTime: c.startTime,
    duration: c.duration,
    // Apply effects from legacy format
    keyframes: legacy.effects
      .filter(e => e.shotIndex === c.shotIndex)
      .flatMap(e => effectToKeyframes(e.type, e.params, c.duration) || []),
  }));

  // Convert text overlays to text clips
  for (const text of legacy.textOverlays) {
    clips.push({
      trackId: 'text-overlays',
      type: 'text',
      startTime: text.startTime,
      duration: text.duration,
      text: {
        text: text.text,
        fontSize: text.fontSize,
      },
      label: text.text.substring(0, 30),
    });
  }

  // Convert transitions
  const transitions: AgentTransition[] = legacy.transitions.map(t => ({
    type: t.type,
    fromShotIndex: t.fromShotIndex,
    toShotIndex: t.toShotIndex,
    duration: t.duration,
  }));

  return {
    tracks,
    clips,
    transitions,
    audioFades: legacy.audioEffects
      .filter(a => a.type === 'fadeIn' || a.type === 'fadeOut')
      .map(a => ({
        target: (typeof a.target === 'string' ? a.target : 'main') as 'main' | 'music',
        type: a.type as 'fadeIn' | 'fadeOut',
        startTime: a.startTime,
        duration: a.duration,
      })),
    mediaIssues: legacy.mediaIssues.map(m => ({
      shotIndex: m.shotIndex,
      severity: m.severity as 'error' | 'warning' | 'info',
      type: m.type,
      title: m.title,
      description: m.description,
    })),
  };
}

/** Convert EditorAgentEDL to legacy EditDecisionList for backward compat */
function agentEdlToLegacy(agentEdl: EditorAgentEDL): EditDecisionList {
  return {
    clips: agentEdl.clips
      .filter(c => c.type !== 'text' && c.type !== 'caption' && c.type !== 'shape')
      .map(c => ({
        shotIndex: c.shotIndex ?? 0,
        track: c.trackId,
        startTime: c.startTime,
        duration: c.duration,
        mediaType: (c.type === 'motion-graphics' ? 'motiongraphic' : c.type) as 'image' | 'video' | 'motiongraphic',
      })),
    transitions: agentEdl.transitions.map(t => ({
      type: t.type as 'crossfade' | 'fadeToBlack' | 'fade' | 'wipeLeft' | 'dissolve',
      duration: t.duration,
      fromShotIndex: t.fromShotIndex,
      toShotIndex: t.toShotIndex,
      position: 'between' as const,
    })),
    effects: [],
    textOverlays: agentEdl.clips
      .filter(c => c.type === 'text')
      .map(c => ({
        text: c.text?.text || '',
        startTime: c.startTime,
        duration: c.duration,
        style: 'lowerThird' as const,
        fontSize: c.text?.fontSize,
      })),
    motionGraphics: agentEdl.clips
      .filter(c => c.type === 'motion-graphics')
      .map(c => ({
        shotIndex: c.shotIndex ?? 0,
        track: c.trackId,
        startTime: c.startTime,
        duration: c.duration,
      })),
    audioEffects: agentEdl.audioFades.map(a => ({
      target: a.target as 'main',
      type: a.type as 'fadeIn' | 'fadeOut',
      startTime: a.startTime,
      duration: a.duration,
    })),
    mediaIssues: agentEdl.mediaIssues.map(m => ({
      shotIndex: m.shotIndex,
      severity: m.severity as 'error' | 'warning',
      type: m.type as 'generation_failed' | 'placeholder' | 'missing_media',
      title: m.title,
      description: m.description,
    })),
  };
}

// ============================================================
// VALIDATION & FIX (V2)
// ============================================================

function validateAndFixV2(edl: EditorAgentEDL, shots: ShotDataInput[]): EditorAgentEDL {
  const fixed = { ...edl };

  // Ensure at least one video track exists
  if (!fixed.tracks.some(t => t.type === 'video')) {
    fixed.tracks.push({
      id: 'main-video',
      type: 'video',
      name: 'Main Video',
      group: 'video',
      order: 0,
    });
  }

  // Fix: ensure no overlapping clips on same track
  const clipsByTrack = new Map<string, AgentClip[]>();
  fixed.clips.forEach(clip => {
    const arr = clipsByTrack.get(clip.trackId) || [];
    arr.push(clip);
    clipsByTrack.set(clip.trackId, arr);
  });

  clipsByTrack.forEach((clips, trackId) => {
    clips.sort((a, b) => a.startTime - b.startTime);
    for (let i = 1; i < clips.length; i++) {
      const prev = clips[i - 1];
      const curr = clips[i];
      const prevEnd = prev.startTime + prev.duration;
      if (curr.startTime < prevEnd) {
        console.warn(`[EditAssembly] Fix: Clip overlapped on ${trackId}, adjusted from ${curr.startTime}s to ${prevEnd}s`);
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

  // Fix: text clip durations must be reasonable
  fixed.clips = fixed.clips.filter(c => {
    if (c.type === 'text' && (c.duration <= 0 || c.duration > 30)) {
      console.warn(`[EditAssembly] Fix: Removed text clip with invalid duration ${c.duration}s`);
      return false;
    }
    return true;
  });

  return fixed;
}

// ============================================================
// ENHANCED FALLBACK EDL (no AI, but uses v2 format)
// ============================================================

function generateFallbackAgentEDL(
  shots: ShotDataInput[],
  generatedMedia: GeneratedMedia[],
  fps: number,
  scriptText: string = ''
): EditorAgentEDL {
  const mediaByShot = new Map<number, GeneratedMedia>();
  generatedMedia.forEach(m => mediaByShot.set(m.shot_index, m));

  // --- TRACKS ---
  const tracks: AgentTrack[] = [
    { id: 'main-video', type: 'video', name: 'Main Video', group: 'video', order: 0 },
    { id: 'text-overlays', type: 'video', name: 'Text Overlays', group: 'text', order: 1 },
  ];

  // --- CLIPS ---
  const clips: AgentClip[] = [];
  const mediaIssues: EditorAgentEDL['mediaIssues'] = [];
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

    const clipType = media?.media_type === 'motiongraphic'
      ? 'motion-graphics' as const
      : (media?.media_type || 'image') as 'image' | 'video';

    const clip: AgentClip = {
      trackId: 'main-video',
      shotIndex: shot.segment_index,
      type: clipType,
      startTime: currentTime,
      duration: shot.duration_seconds,
      label: shot.text?.substring(0, 40),
    };

    // Add keyframe animations for image clips (Ken Burns effect)
    if (clipType === 'image') {
      clip.keyframes = [{
        property: 'transform.scale',
        points: [
          { time: 0, value: 1.0, easing: 'easeInOut' },
          { time: shot.duration_seconds, value: 1.05 },
        ],
      }];
    }

    clips.push(clip);
    currentTime += shot.duration_seconds;
  }

  // --- TEXT OVERLAYS (extract from script) ---
  // Add chapter titles at roughly evenly-spaced intervals
  const sentences = scriptText
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 10);

  if (sentences.length > 0 && shots.length > 0) {
    // Place a chapter title every ~5 shots (or at section breaks)
    const interval = Math.max(3, Math.floor(shots.length / 4));
    for (let i = 0; i < shots.length; i += interval) {
      const shot = shots[i];
      // Find a good sentence near this shot
      const sentenceIndex = Math.min(
        Math.floor((i / shots.length) * sentences.length),
        sentences.length - 1
      );
      const titleText = sentences[sentenceIndex].substring(0, 50);

      clips.push({
        trackId: 'text-overlays',
        type: 'text',
        startTime: shot.start_seconds,
        duration: Math.min(4, shot.duration_seconds),
        text: {
          text: titleText,
          fontFamily: 'Inter',
          fontSize: 48,
          color: '#ffffff',
          backgroundColor: 'transparent',
          textAlign: 'center',
        },
        transform: {
          x: 460,
          y: 440,
          width: 1000,
          height: 200,
          opacity: 1,
        },
        keyframes: [{
          property: 'transform.opacity',
          points: [
            { time: 0, value: 0, easing: 'easeOut' },
            { time: 0.5, value: 1, easing: 'linear' },
            { time: Math.min(3.5, shot.duration_seconds - 0.5), value: 1, easing: 'easeIn' },
            { time: Math.min(4, shot.duration_seconds), value: 0 },
          ],
        }],
        label: titleText.substring(0, 20),
      });
    }
  }

  // --- TRANSITIONS ---
  const transitions: AgentTransition[] = [];
  // Add crossfade between sections (every ~4 clips)
  const mainClips = clips.filter(c => c.trackId === 'main-video');
  for (let i = 3; i < mainClips.length; i += 4) {
    const fromClip = mainClips[i - 1];
    const toClip = mainClips[i];
    if (fromClip.shotIndex != null && toClip.shotIndex != null) {
      transitions.push({
        type: 'crossfade',
        fromShotIndex: fromClip.shotIndex,
        toShotIndex: toClip.shotIndex,
        duration: 0.5,
      });
    }
  }

  return {
    tracks,
    clips,
    transitions,
    audioFades: [
      { target: 'main', type: 'fadeIn', startTime: 0, duration: 1 },
      { target: 'main', type: 'fadeOut', startTime: Math.max(0, currentTime - 2), duration: 2 },
    ],
    mediaIssues,
  };
}

// ============================================================
// HELPERS
// ============================================================

/** Convert legacy effect type to keyframe animations */
function effectToKeyframes(
  effectType: string,
  params: Record<string, number | undefined>,
  duration: number
): AgentClip['keyframes'] {
  const keyframes: NonNullable<AgentClip['keyframes']> = [];

  switch (effectType) {
    case 'kenBurns':
      keyframes.push({
        property: 'transform.scale',
        points: [
          { time: 0, value: params.startScale ?? 1.0, easing: 'easeInOut' },
          { time: duration, value: params.endScale ?? 1.05 },
        ],
      });
      if (params.startX != null || params.endX != null) {
        keyframes.push({
          property: 'transform.x',
          points: [
            { time: 0, value: (params.startX ?? 0) * 1920, easing: 'easeInOut' },
            { time: duration, value: (params.endX ?? 0) * 1920 },
          ],
        });
      }
      break;
    case 'slowZoomIn':
      keyframes.push({
        property: 'transform.scale',
        points: [
          { time: 0, value: params.startScale ?? 1.0, easing: 'easeInOut' },
          { time: duration, value: params.endScale ?? 1.05 },
        ],
      });
      break;
    case 'slowZoomOut':
      keyframes.push({
        property: 'transform.scale',
        points: [
          { time: 0, value: params.startScale ?? 1.05, easing: 'easeInOut' },
          { time: duration, value: params.endScale ?? 1.0 },
        ],
      });
      break;
    case 'panLeft':
      keyframes.push({
        property: 'transform.x',
        points: [
          { time: 0, value: 0, easing: 'easeInOut' },
          { time: duration, value: -50 },
        ],
      });
      break;
    case 'panRight':
      keyframes.push({
        property: 'transform.x',
        points: [
          { time: 0, value: 0, easing: 'easeInOut' },
          { time: duration, value: 50 },
        ],
      });
      break;
  }

  return keyframes;
}
