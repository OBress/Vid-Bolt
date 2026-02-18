/**
 * Edit Assembly Prompts
 * ============================================================================
 * System prompt, user prompt templates, and EDL types for the
 * AI Edit Assembly Service.
 *
 * V2 ARCHITECTURE:
 * - Uses EditorAgentEDL from editor-capability-manifest.ts
 * - System prompt includes the full capability manifest
 * - AI can use multi-track, effects, keyframes, text styling, etc.
 *
 * Legacy EDL types are preserved for backward compatibility with
 * the fallback EDL generator and existing stored EDLs.
 */

import {
  getEditorCapabilityPrompt,
  type EditorAgentEDL,
  AGENT_EDL_JSON_SCHEMA,
} from './editor-capability-manifest';

// ============================================================
// LEGACY EDL TYPES (kept for backward compat + fallback)
// ============================================================

export interface EDLClip {
  shotIndex: number;
  track: string;
  startTime: number;
  duration: number;
  mediaType: 'image' | 'video' | 'motiongraphic';
  sourceUrl?: string;
}

export interface EDLTransition {
  type: 'crossfade' | 'fadeToBlack' | 'fade' | 'wipeLeft' | 'dissolve';
  duration: number;
  fromShotIndex: number;
  toShotIndex: number;
  position: 'between';
}

export interface EDLEffect {
  shotIndex: number;
  type: 'kenBurns' | 'slowZoomIn' | 'slowZoomOut' | 'panLeft' | 'panRight';
  params: {
    startScale?: number;
    endScale?: number;
    startX?: number;
    endX?: number;
    startY?: number;
    endY?: number;
  };
}

export interface EDLTextOverlay {
  text: string;
  startTime: number;
  duration: number;
  style: 'chapterTitle' | 'lowerThird' | 'callout' | 'subtitle';
  fontSize?: number;
  position?: { x: number; y: number };
}

export interface EDLMotionGraphic {
  shotIndex: number;
  track: string;
  startTime: number;
  duration: number;
}

export interface EDLAudioEffect {
  target: 'main' | number;
  type: 'fadeIn' | 'fadeOut' | 'volumeAutomation';
  startTime: number;
  duration: number;
  volume?: number;
}

export interface MediaIssueEDL {
  shotIndex: number;
  severity: 'error' | 'warning';
  type: 'generation_failed' | 'placeholder' | 'missing_media';
  title: string;
  description: string;
}

export interface EditDecisionList {
  clips: EDLClip[];
  transitions: EDLTransition[];
  effects: EDLEffect[];
  textOverlays: EDLTextOverlay[];
  motionGraphics: EDLMotionGraphic[];
  audioEffects: EDLAudioEffect[];
  mediaIssues: MediaIssueEDL[];
}

// Re-export new types
export type { EditorAgentEDL };
export { AGENT_EDL_JSON_SCHEMA };

// ============================================================
// V2 SYSTEM PROMPT — includes capability manifest
// ============================================================

export const EDIT_ASSEMBLY_SYSTEM_PROMPT = `You are a professional video editor AI. You produce structured EDLs (Edit Decision Lists) that create polished, YouTube-optimized videos.

You have FULL CONTROL over a professional video editor. Use the capabilities below to create the best possible edit.

${getEditorCapabilityPrompt()}

## YOUR STYLE: DOCUMENTARY

Apply these documentary style defaults:
- Average cut duration: 6-10 seconds
- Transition density: LOW (mostly hard cuts)
- Use crossfade transitions only for topic/section shifts
- Use fadeToBlack for major section boundaries
- Apply Ken Burns / slow zoom keyframe animations on ALL static images
- Pacing: steady and measured — breathing room between points

## YOUTUBE BEST PRACTICES

1. **5-second visual change rule**: Ensure a visual change every ~5s (transition, zoom, or cut)
2. **Audio-visual sync**: Align transitions with phrase/sentence boundaries, not mid-word
3. **Hook pattern**: Slightly faster pacing in the first 15 seconds (4-6s cuts vs 6-10s default)

## TRACK STRATEGY

Create tracks based on content needs:
- Always create a "main-video" track (type: video, group: video, order: 0) for ALL visual clips
- Place image, video, AND motion-graphics clips on the same main-video track
- Motion graphics clips render as transparent overlays on top of the underlying media — no separate track needed
- Audio tracks are handled separately by the import system

## CRITICAL RULES

1. NEVER create overlapping clips on the same track
2. Every transition duration must be <= min(fromClipDuration, toClipDuration) / 2
3. For failed shots (listed in failedShots), include them as mediaIssues
4. ALL image clips MUST have keyframe animations (Ken Burns or zoom) — static images look dead on video
5. Always include audio fades: fadeIn on start, fadeOut on end
6. Do NOT create any "text" clips — all text/titles are handled by motion graphics in a separate pipeline
7. All clips go on the "main-video" track — do NOT create a separate overlays track

## REQUIRED JSON FORMAT

Use exact camelCase field names. Each clip MUST have trackId, shotIndex, type, startTime, and duration:

\`\`\`json
{
  "tracks": [{ "id": "main-video", "type": "video", "name": "Main Video", "group": "video", "order": 0 }],
  "clips": [
    { "trackId": "main-video", "shotIndex": 0, "type": "image", "startTime": 0, "duration": 5.2, "keyframes": [...] },
    { "trackId": "main-video", "shotIndex": 1, "type": "motion-graphics", "startTime": 5.2, "duration": 4.8 }
  ],
  "transitions": [{ "type": "crossfade", "fromShotIndex": 0, "toShotIndex": 1, "duration": 0.5 }],
  "audioFades": [{ "target": "main", "type": "fadeIn", "startTime": 0, "duration": 1 }],
  "mediaIssues": []
}
\`\`\`

Respond with ONLY valid JSON matching this schema. No markdown, no code fences, no commentary.`;

// ============================================================
// USER PROMPT BUILDER
// ============================================================

export interface EditAssemblyContext {
  videoTitle: string;
  totalDuration: number;
  fps: number;
  shots: Array<{
    index: number;
    startSeconds: number;
    endSeconds: number;
    durationSeconds: number;
    text: string;
    mediaType: 'image' | 'video' | 'motiongraphic' | 'none';
    hasMedia: boolean;
    mediaUrl?: string;
  }>;
  scriptSentences: string[];
  failedShots: number[];
  audioChunks: Array<{
    index: number;
    durationSeconds: number;
    text?: string;
  }>;
}

export function buildEditAssemblyUserPrompt(context: EditAssemblyContext): string {
  const lines: string[] = [];

  lines.push(`# Video: ${context.videoTitle}`);
  lines.push(`Total duration: ${context.totalDuration.toFixed(1)}s | FPS: ${context.fps}`);
  lines.push('');

  // Shot list
  lines.push('## Shots');
  for (const shot of context.shots) {
    const mediaStatus = shot.hasMedia ? `✓ ${shot.mediaType}` : '✗ no media';
    lines.push(`  [${shot.index}] ${shot.startSeconds.toFixed(1)}s-${shot.endSeconds.toFixed(1)}s (${shot.durationSeconds.toFixed(1)}s) | ${mediaStatus} | "${shot.text.substring(0, 60)}..."`);
  }
  lines.push('');

  // Failed shots
  if (context.failedShots.length > 0) {
    lines.push(`## Failed Shots (include as mediaIssues)`);
    lines.push(`  Indices: ${context.failedShots.join(', ')}`);
    lines.push('');
  }

  // Audio chunks
  lines.push('## Audio');
  for (const chunk of context.audioChunks) {
    lines.push(`  Chunk ${chunk.index}: ${chunk.durationSeconds.toFixed(1)}s${chunk.text ? ` | "${chunk.text.substring(0, 50)}..."` : ''}`);
  }
  lines.push('');



  lines.push('## Instructions');
  lines.push('');
  lines.push('Generate the EditorAgentEDL JSON now. Place all visual clips on the main-video track with keyframe animations, and include transitions between sections.');
  lines.push('');
  lines.push('Remember:');
  lines.push('- Every image clip MUST have keyframes (slowZoomIn or kenBurns pattern)');
  lines.push('- ALL clips (image, video, motion-graphics) go on the "main-video" track');
  lines.push('- Do NOT create any text clips — text is handled by motion graphics');
  lines.push('- Use crossfade transitions between topic/section changes');
  lines.push('- Include fadeIn and fadeOut audio fades');

  return lines.join('\n');
}

// ============================================================
// LEGACY JSON SCHEMA (kept for reference)
// ============================================================

export const EDL_JSON_SCHEMA = {
  type: 'object',
  required: ['clips', 'transitions', 'effects', 'textOverlays', 'motionGraphics', 'audioEffects', 'mediaIssues'],
  properties: {
    clips: { type: 'array', items: { type: 'object', required: ['shotIndex', 'track', 'startTime', 'duration', 'mediaType'] } },
    transitions: { type: 'array', items: { type: 'object', required: ['type', 'duration', 'fromShotIndex', 'toShotIndex', 'position'] } },
    effects: { type: 'array', items: { type: 'object', required: ['shotIndex', 'type', 'params'] } },
    textOverlays: { type: 'array', items: { type: 'object', required: ['text', 'startTime', 'duration', 'style'] } },
    motionGraphics: { type: 'array', items: { type: 'object', required: ['shotIndex', 'track', 'startTime', 'duration'] } },
    audioEffects: { type: 'array', items: { type: 'object', required: ['target', 'type', 'startTime', 'duration'] } },
    mediaIssues: { type: 'array', items: { type: 'object', required: ['shotIndex', 'severity', 'type', 'title', 'description'] } },
  },
};
