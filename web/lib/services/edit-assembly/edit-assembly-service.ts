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
  AgentKeyframes,
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
  /** Optional shot time range for batch-mode audio chunk filtering */
  shotTimeRange?: { startSeconds: number; endSeconds: number };
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
    model = 'google/gemini-3-flash-preview',
    shotTimeRange,
  } = request;

  console.log(`[EditAssembly] Starting EDL generation for "${videoTitle}" (${shots.length} shots, ${generatedMedia.length} media items)`);

  try {
    // 1. Build context object
    const context = buildContext(shots, generatedMedia, videoTitle, audioChunks, scriptText, fps, shotTimeRange);

    // 2. Build user prompt
    const userPrompt = buildEditAssemblyUserPrompt(context);

    console.log(`[EditAssembly] Context: ${context.shots.length} shots, ${context.failedShots.length} failed, ${context.audioChunks.length} audio chunks`);

    // 3. Call LLM for v2 format
    let agentEdl = await callLLMv2(apiKey, model, EDIT_ASSEMBLY_SYSTEM_PROMPT, userPrompt, shots.length);

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
    } catch (_fallbackError) {
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
  fps: number,
  shotTimeRange?: { startSeconds: number; endSeconds: number }
): EditAssemblyContext {
  const mediaByShot = new Map<number, GeneratedMedia>();
  generatedMedia.forEach(m => mediaByShot.set(m.shot_index, m));

  const failedShots = generatedMedia
    .filter(m => m.generation_status === 'failed')
    .map(m => m.shot_index);

  shots.forEach(shot => {
    const media = mediaByShot.get(shot.segment_index);
    // MG shots with remotion_code are valid media — they render via Remotion,
    // not a video URL. Don't treat them as failed/missing.
    const hasValidMedia = !!media && (
      media.generation_status === 'completed' || !!media.remotion_code
    );
    if (!hasValidMedia && !failedShots.includes(shot.segment_index)) {
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
        hasMedia: !!media && (media.generation_status === 'completed' || !!media.remotion_code),
        mediaUrl: media?.media_url,
        hasRemotionCode: !!media?.remotion_code,
        contentType: shot.content_type,
        sectionBreak: shot.content_type === 'transition',
      };
    }),
    scriptSentences,
    failedShots,
    audioChunks: audioChunks.map(c => ({
      index: c.index,
      durationSeconds: c.duration_seconds,
      text: c.text,
    })),
    shotTimeRange,
  };
}

// ============================================================
// LLM CALLER (V2 — EditorAgentEDL)
// ============================================================

async function callLLMv2(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  shotCount: number = 10
): Promise<EditorAgentEDL> {
  // JSON Schema for EditorAgentEDL — constrains LLM output at the token level
  const edlJsonSchema = {
    name: 'edl',
    strict: true,
    schema: {
      type: 'object',
      required: ['tracks', 'clips', 'transitions', 'audioFades', 'mediaIssues'],
      additionalProperties: false,
      properties: {
        tracks: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'type', 'name', 'group', 'order'],
            additionalProperties: false,
            properties: {
              id: { type: 'string' },
              type: { type: 'string', enum: ['video', 'audio'] },
              name: { type: 'string' },
              group: { type: 'string', enum: ['video', 'audio', 'text', 'effects', 'overlays'] },
              order: { type: 'number' },
            },
          },
        },
        clips: {
          type: 'array',
          items: {
            type: 'object',
            required: ['trackId', 'type', 'startTime', 'duration'],
            additionalProperties: false,
            properties: {
              trackId: { type: 'string' },
              shotIndex: { type: ['number', 'null'] },
              type: { type: 'string', enum: ['video', 'audio', 'image', 'text', 'caption', 'shape', 'motion-graphics'] },
              startTime: { type: 'number' },
              duration: { type: 'number' },
              label: { type: ['string', 'null'] },
              keyframes: {
                type: ['array', 'null'],
                items: {
                  type: 'object',
                  required: ['property', 'points'],
                  additionalProperties: false,
                  properties: {
                    property: { type: 'string' },
                    points: {
                      type: 'array',
                      items: {
                        type: 'object',
                        required: ['time', 'value'],
                        additionalProperties: false,
                        properties: {
                          time: { type: 'number' },
                          value: { type: 'number' },
                          easing: { type: ['string', 'null'] },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        transitions: {
          type: 'array',
          items: {
            type: 'object',
            required: ['type', 'fromShotIndex', 'toShotIndex', 'duration'],
            additionalProperties: false,
            properties: {
              type: { type: 'string' },
              fromShotIndex: { type: 'number' },
              toShotIndex: { type: 'number' },
              duration: { type: 'number' },
              easing: { type: ['string', 'null'] },
            },
          },
        },
        audioFades: {
          type: 'array',
          items: {
            type: 'object',
            required: ['target', 'type', 'startTime', 'duration'],
            additionalProperties: false,
            properties: {
              target: { type: 'string', enum: ['main', 'music'] },
              type: { type: 'string', enum: ['fadeIn', 'fadeOut'] },
              startTime: { type: 'number' },
              duration: { type: 'number' },
            },
          },
        },
        mediaIssues: {
          type: 'array',
          items: {
            type: 'object',
            required: ['shotIndex', 'severity', 'type', 'title', 'description'],
            additionalProperties: false,
            properties: {
              shotIndex: { type: 'number' },
              severity: { type: 'string', enum: ['error', 'warning', 'info'] },
              type: { type: 'string' },
              title: { type: 'string' },
              description: { type: 'string' },
            },
          },
        },
      },
    },
  };

  // Dynamic token budget: ~2000 tokens per shot for structured JSON (clips +
  // keyframes + transitions + overlays + SFX) + base overhead for tracks/fades.
  // Min 32000, max 65536 (Gemini Flash output limit).
  const initialMaxTokens = Math.min(65536, Math.max(32000, shotCount * 2000 + 8000));

  // Prompt size diagnostic logging
  const promptChars = systemPrompt.length + userPrompt.length;
  const estimatedInputTokens = Math.ceil(promptChars / 4);
  console.log(`[EditAssembly] Prompt size: ~${promptChars} chars (~${estimatedInputTokens} input tokens), max_tokens=${initialMaxTokens}`);

  // Helper to make the actual API call with a given max_tokens budget
  const callWithBudget = async (maxTokens: number, attempt: number) => {
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
        max_tokens: maxTokens,
        response_format: { type: 'json_schema', json_schema: edlJsonSchema },
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

    const finishReason = data.choices?.[0]?.finish_reason;
    console.log(`[EditAssembly] LLM response (attempt ${attempt}): ${content.length} chars, finish_reason=${finishReason}, max_tokens=${maxTokens}`);

    return { content, finishReason };
  };

  // Attempt 1 with calculated budget
  let { content, finishReason } = await callWithBudget(initialMaxTokens, 1);

  // If truncated, retry once with maximum budget (65536)
  if (finishReason === 'length') {
    if (initialMaxTokens < 65536) {
      console.warn(`[EditAssembly] Response truncated (${content.length} chars). Retrying with max_tokens=65536...`);
      ({ content, finishReason } = await callWithBudget(65536, 2));
    }

    // If still truncated after retry (or already at max), throw
    if (finishReason === 'length') {
      console.warn(`[EditAssembly] LLM response truncated after retry (finish_reason=length, ${content.length} chars). Skipping parse.`);
      throw new Error(`LLM response truncated (finish_reason=length, ${content.length} chars) — prompt too large for model output limit`);
    }
  }

  // Structured outputs guarantee valid JSON matching the schema —
  // no markdown fence stripping needed
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    console.error(`[EditAssembly] JSON parse error: ${e instanceof Error ? e.message : 'unknown'} (response was ${content.length} chars, finish_reason=${finishReason})`);
    throw new Error(`Failed to parse LLM response as JSON: ${e instanceof Error ? e.message : 'unknown'}`);
  }

  // Detect format: is this v2 (EditorAgentEDL) or legacy (EditDecisionList)?
  if (Array.isArray(parsed.tracks) && Array.isArray(parsed.clips)) {
    // V2 format — normalize fields (AI may use snake_case) and validate
    const agentEdl = normalizeAgentEdl(parsed);
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
// FIELD NORMALIZATION (handle AI snake_case vs camelCase)
// ============================================================

/**
 * The AI may return field names in snake_case (shot_index, start_time, track_id)
 * or camelCase (shotIndex, startTime, trackId). This normalizes everything to camelCase
 * to match the EditorAgentEDL TypeScript interfaces.
 */
function normalizeAgentEdl(parsed: Record<string, unknown>): EditorAgentEDL {
  const raw = parsed as any;

  // Normalize tracks
  const tracks: AgentTrack[] = (raw.tracks || []).map((t: any) => ({
    id: t.id,
    type: t.type,
    name: t.name,
    group: t.group || 'video',
    order: t.order ?? 0,
  }));

  // Normalize clips — handle both snake_case and camelCase field names
  const clips: AgentClip[] = (raw.clips || []).map((c: any) => {
    const clip: AgentClip = {
      trackId: c.trackId ?? c.track_id ?? c.track ?? 'main-video',
      shotIndex: c.shotIndex ?? c.shot_index ?? c.shotindex,
      type: normalizeClipType(c.type ?? c.mediaType ?? c.media_type ?? 'image'),
      startTime: parseFiniteNumber(c.startTime ?? c.start_time ?? c.start),
      duration: parseFiniteNumber(c.duration ?? c.dur) || 3,
      label: c.label,
    };

    // Carry over optional properties
    if (c.transform) clip.transform = c.transform;
    if (c.text) clip.text = c.text;
    if (c.effects) clip.effects = c.effects;
    if (c.keyframes) clip.keyframes = c.keyframes;
    if (c.audioEffects ?? c.audio_effects) {
      clip.audioEffects = c.audioEffects ?? c.audio_effects;
    }

    return clip;
  });

  // Normalize transitions
  const transitions = (raw.transitions || []).map((t: any) => ({
    type: t.type,
    fromShotIndex: t.fromShotIndex ?? t.from_shot_index ?? t.from,
    toShotIndex: t.toShotIndex ?? t.to_shot_index ?? t.to,
    duration: parseFiniteNumber(t.duration) || 0.5,
  }));

  // Normalize audio fades (AI may use audioFades or audio_fades)
  const audioFades = (raw.audioFades ?? raw.audio_fades ?? []).map((a: any) => ({
    target: a.target || 'main',
    type: a.type,
    startTime: parseFiniteNumber(a.startTime ?? a.start_time) || 0,
    duration: parseFiniteNumber(a.duration) || 1,
  }));

  // Normalize media issues
  const mediaIssues = (raw.mediaIssues ?? raw.media_issues ?? []).map((m: any) => ({
    shotIndex: m.shotIndex ?? m.shot_index,
    severity: m.severity || 'warning',
    type: m.type || 'missing_media',
    title: m.title || '',
    description: m.description || '',
  }));

  console.log(`[EditAssembly] Normalized agent EDL: ${tracks.length} tracks, ${clips.length} clips, ` +
    `${clips.filter(c => c.startTime !== undefined && Number.isFinite(c.startTime)).length}/${clips.length} have valid startTime, ` +
    `${clips.filter(c => c.shotIndex !== undefined).length}/${clips.length} have shotIndex`);

  return { tracks, clips, transitions, audioFades, mediaIssues };
}

/** Parse a value to a finite number, returning undefined if not valid */
function parseFiniteNumber(v: unknown): number {
  if (v === undefined || v === null) return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/** Normalize clip type to our canonical values */
function normalizeClipType(raw: string): AgentClip['type'] {
  const t = raw.toLowerCase().replace(/[_\s-]/g, '');
  if (t === 'motiongraphic' || t === 'motiongraphics' || t === 'mg') return 'motion-graphics';
  if (t === 'video') return 'video';
  if (t === 'image') return 'image';
  if (t === 'audio') return 'audio';
  if (t === 'text') return 'text';
  if (t === 'caption') return 'caption';
  if (t === 'shape') return 'shape';
  return raw as AgentClip['type'];
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

  // Build shot lookup for timing fallbacks
  const shotByIndex = new Map<number, ShotDataInput>();
  shots.forEach(s => shotByIndex.set(s.segment_index, s));

  // Fix clips with missing startTime by using shot timing or sequential placement
  const clipsByTrack = new Map<string, AgentClip[]>();
  fixed.clips.forEach(clip => {
    // Fix missing duration first
    if (!Number.isFinite(clip.duration) || clip.duration <= 0) {
      const shot = clip.shotIndex != null ? shotByIndex.get(clip.shotIndex) : undefined;
      clip.duration = shot?.duration_seconds || 3;
      console.warn(`[EditAssembly] Fix: Clip (shot ${clip.shotIndex}) had invalid duration, set to ${clip.duration}s`);
    }

    // Fix missing startTime
    if (!Number.isFinite(clip.startTime)) {
      const shot = clip.shotIndex != null ? shotByIndex.get(clip.shotIndex) : undefined;
      if (shot) {
        clip.startTime = shot.start_seconds;
        console.warn(`[EditAssembly] Fix: Clip (shot ${clip.shotIndex}) had no startTime, using shot timing ${clip.startTime}s`);
      }
      // If still NaN, will be fixed by sequential placement below
    }

    const arr = clipsByTrack.get(clip.trackId) || [];
    arr.push(clip);
    clipsByTrack.set(clip.trackId, arr);
  });

  // Sort and fix overlaps/gaps within each track
  clipsByTrack.forEach((clips, trackId) => {
    // Sort by startTime, putting NaN clips at the end
    clips.sort((a, b) => {
      const aTime = Number.isFinite(a.startTime) ? a.startTime : Infinity;
      const bTime = Number.isFinite(b.startTime) ? b.startTime : Infinity;
      return aTime - bTime;
    });

    // Fix remaining NaN startTimes by placing sequentially after last known clip
    let lastEnd = 0;
    for (const clip of clips) {
      if (!Number.isFinite(clip.startTime)) {
        clip.startTime = lastEnd;
        console.warn(`[EditAssembly] Fix: Clip (shot ${clip.shotIndex}) placed at ${clip.startTime}s (sequential fallback)`);
      }
      const clipEnd = clip.startTime + clip.duration;
      if (clipEnd > lastEnd) lastEnd = clipEnd;
    }

    // Fix overlapping clips (unless on allowOverlap track)
    for (let i = 1; i < clips.length; i++) {
      const prev = clips[i - 1];
      const curr = clips[i];
      const prevEnd = prev.startTime + prev.duration;
      if (curr.startTime < prevEnd) {
        console.warn(`[EditAssembly] Fix: Clip overlapped on ${trackId}, adjusted from ${curr.startTime}s to ${prevEnd}s`);
        curr.startTime = prevEnd;
      }
    }

    // === GAP-FILLING (main-video track only) ===
    if (trackId === 'main-video' && clips.length > 0) {
      // 1. Snap first clip to t=0 if offset (prevent black screen at start).
      //    Only shift startTime — do NOT extend duration, because in batched
      //    mode the LLM may emit absolute timestamps (e.g., 161s for batch 5)
      //    and inflating duration creates absurdly long clips. The merger
      //    handles absolute-to-sequential rebasing correctly.
      if (clips[0].startTime > 0) {
        const offset = clips[0].startTime;
        console.warn(`[EditAssembly] Fix: First clip on main-video started at ${offset.toFixed(1)}s — shifting to 0s (no black screen)`);
        // Shift all clips in this track back by the offset
        for (const c of clips) {
          c.startTime = Math.max(0, c.startTime - offset);
        }
      }

      // 2. Fill any gaps between clips by extending the preceding clip.
      //    For large gaps (≥ 2s), emit a mediaIssue so the user is warned
      //    about sections where the video may freeze or show stretched content.
      for (let i = 1; i < clips.length; i++) {
        const prev = clips[i - 1];
        const curr = clips[i];
        const prevEnd = prev.startTime + prev.duration;
        const gap = curr.startTime - prevEnd;
        if (gap > 0.05) { // >50ms gap
          console.warn(`[EditAssembly] Fix: Filling ${gap.toFixed(2)}s gap on main-video by extending clip (shot ${prev.shotIndex}) from ${prev.duration.toFixed(2)}s to ${(prev.duration + gap).toFixed(2)}s`);
          prev.duration += gap;

          // Large extensions likely exceed the source video duration — warn the user
          if (gap >= 2.0) {
            fixed.mediaIssues = fixed.mediaIssues || [];
            fixed.mediaIssues.push({
              shotIndex: prev.shotIndex ?? -1,
              severity: 'warning',
              type: 'substituted_media',
              title: `Shot ${prev.shotIndex ?? '?'} extended by ${gap.toFixed(1)}s`,
              description: `This clip was extended to fill a ${gap.toFixed(1)}s gap from missing media. Review this section for visual quality.`,
            });
          }
        }
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
  _scriptText: string = ''
): EditorAgentEDL {
  const mediaByShot = new Map<number, GeneratedMedia>();
  generatedMedia.forEach(m => mediaByShot.set(m.shot_index, m));

  // --- TRACKS ---
  // Base visual clips on main-video, MG overlays on overlays track.
  const tracks: AgentTrack[] = [
    { id: 'main-video', type: 'video', name: 'Main Video', group: 'video', order: 0 },
    { id: 'overlays', type: 'video', name: 'Video 2', group: 'video', order: 1 },
    { id: 'sfx', type: 'audio', name: 'Sound Effects', group: 'audio', order: 1 },
  ];

  // --- CLIPS ---
  const clips: AgentClip[] = [];
  const mediaIssues: EditorAgentEDL['mediaIssues'] = [];
  let currentTime = 0;

  for (const shot of shots) {
    const media = mediaByShot.get(shot.segment_index);
    const hasMedia = !!media && (media.generation_status === 'completed' || !!media.remotion_code);

    if (!hasMedia) {
      mediaIssues.push({
        shotIndex: shot.segment_index,
        severity: 'error',
        type: media?.generation_status === 'failed' ? 'generation_failed' : 'missing_media',
        title: `Shot ${shot.segment_index} media unavailable`,
        description: `Media for this shot is ${media?.generation_status || 'missing'}. A placeholder will be shown.`,
      });
    }

    const hasRemotionCode = !!media?.remotion_code;
    const isStandaloneMG = media?.media_type === 'motiongraphic' && !hasRemotionCode;
    // Any shot with remotion code gets an overlay clip on the overlays track
    const isHybrid = hasRemotionCode;

    const clipType = isStandaloneMG
      ? 'motion-graphics' as const
      : (media?.media_type || 'image') as 'image' | 'video';

    // Base media clip always goes on main-video
    const clip: AgentClip = {
      trackId: 'main-video',
      shotIndex: shot.segment_index,
      type: clipType,
      startTime: currentTime,
      duration: shot.duration_seconds,
      label: shot.text?.substring(0, 40),
    };

    // Add keyframe animations for image clips — vary Ken Burns style
    // based on segment index to prevent monotonous identical animations.
    // 8 patterns: push-in, pull-out, drift-left, drift-right, diagonal NE,
    // diagonal SW, Ken Burns combo (scale+drift), subtle snap-zoom.
    if (clipType === 'image') {
      const animPattern = shot.segment_index % 8;
      const dur = shot.duration_seconds;
      const patterns: Array<AgentKeyframes[]> = [
        // 0: Slow push-in (scale 1.0 → 1.08)
        [{ property: 'transform.scale' as const, points: [
          { time: 0, value: 1.0, easing: 'easeInOut' as const }, { time: dur, value: 1.08 },
        ]}],
        // 1: Slow pull-out (scale 1.08 → 1.0)
        [{ property: 'transform.scale' as const, points: [
          { time: 0, value: 1.08, easing: 'easeInOut' as const }, { time: dur, value: 1.0 },
        ]}],
        // 2: Drift left
        [{ property: 'transform.x' as const, points: [
          { time: 0, value: 0, easing: 'easeInOut' as const }, { time: dur, value: -40 },
        ]}],
        // 3: Drift right
        [{ property: 'transform.x' as const, points: [
          { time: 0, value: 0, easing: 'easeInOut' as const }, { time: dur, value: 40 },
        ]}],
        // 4: Diagonal drift NE (drift right + slight scale up)
        [{ property: 'transform.x' as const, points: [
          { time: 0, value: -20, easing: 'easeInOut' as const }, { time: dur, value: 20 },
        ]}, { property: 'transform.scale' as const, points: [
          { time: 0, value: 1.0, easing: 'easeInOut' as const }, { time: dur, value: 1.05 },
        ]}],
        // 5: Diagonal drift SW (drift left + slight scale down)
        [{ property: 'transform.x' as const, points: [
          { time: 0, value: 20, easing: 'easeInOut' as const }, { time: dur, value: -20 },
        ]}, { property: 'transform.scale' as const, points: [
          { time: 0, value: 1.06, easing: 'easeInOut' as const }, { time: dur, value: 1.0 },
        ]}],
        // 6: Ken Burns combo (scale up + drift left — most cinematic)
        [{ property: 'transform.scale' as const, points: [
          { time: 0, value: 1.0, easing: 'easeInOut' as const }, { time: dur, value: 1.1 },
        ]}, { property: 'transform.x' as const, points: [
          { time: 0, value: 15, easing: 'easeInOut' as const }, { time: dur, value: -15 },
        ]}],
        // 7: Subtle snap-zoom for dramatic beats (quick scale in first 30%)
        [{ property: 'transform.scale' as const, points: [
          { time: 0, value: 1.0, easing: 'easeOut' as const },
          { time: dur * 0.3, value: 1.04 },
          { time: dur, value: 1.06 },
        ]}],
      ];
      clip.keyframes = patterns[animPattern]!;
    }

    clips.push(clip);

    // For hybrid shots, add a separate overlay clip on the overlays track
    if (isHybrid) {
      clips.push({
        trackId: 'overlays',
        shotIndex: shot.segment_index,
        type: 'motion-graphics',
        startTime: currentTime,
        duration: shot.duration_seconds,
        label: `${shot.text?.substring(0, 30)} (overlay)`,
      });
    }

    currentTime += shot.duration_seconds;
  }


  // --- TRANSITIONS ---
  // Place transitions at content-type boundaries AND at regular intervals
  // to ensure the fallback EDL always has some visual flow (not all hard cuts).
  const transitions: AgentTransition[] = [];
  const mainClips = clips.filter(c => c.trackId === 'main-video');
  const transitionTypes: Array<AgentTransition['type']> = ['crossfade', 'dissolve', 'crossfade', 'crossfade'];
  let clipsSinceLastTransition = 0;

  for (let i = 1; i < mainClips.length; i++) {
    const fromClip = mainClips[i - 1];
    const toClip = mainClips[i];
    if (fromClip.shotIndex == null || toClip.shotIndex == null) continue;

    const fromShot = shots.find(s => s.segment_index === fromClip.shotIndex);
    const toShot = shots.find(s => s.segment_index === toClip.shotIndex);
    clipsSinceLastTransition++;

    // Determine if this boundary deserves a transition:
    // 1. Content-type boundaries (section break, emotional beat, concept change)
    // 2. Regular interval (every 4-6 clips) to prevent monotonous hard cuts
    const isContentBoundary =
      toShot?.content_type === 'transition' ||
      fromShot?.content_type === 'emotional-beat' ||
      (fromShot?.content_type !== toShot?.content_type);
    const isRegularInterval = clipsSinceLastTransition >= 5;

    if (isContentBoundary || isRegularInterval) {
      // Vary transition type based on context
      let transType: AgentTransition['type'];
      let transDur: number;

      if (toShot?.content_type === 'transition') {
        transType = 'fadeToBlack';
        transDur = 0.6;
      } else if (fromShot?.content_type === 'emotional-beat') {
        transType = 'dissolve';
        transDur = 0.5;
      } else {
        // Cycle through transition types for variety
        transType = transitionTypes[transitions.length % transitionTypes.length];
        transDur = 0.4;
      }

      transitions.push({
        type: transType,
        fromShotIndex: fromClip.shotIndex,
        toShotIndex: toClip.shotIndex,
        duration: transDur,
      });
      clipsSinceLastTransition = 0;
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
