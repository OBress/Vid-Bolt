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
- Average cut duration: 4-8 seconds
- Transition density: LOW (mostly hard cuts)
- Use crossfade transitions only for topic/section shifts
- Use fadeToBlack for major section boundaries
- Apply Ken Burns / slow zoom keyframe animations on ALL static images
- Pacing: steady and measured — breathing room between points

## YOUTUBE BEST PRACTICES

1. **5-second visual change rule**: Ensure a visual change every ~5s (transition, zoom, overlay appearing, or cut)
2. **Audio-visual sync**: Align transitions with phrase/sentence boundaries, not mid-word
3. **Hook pattern**: Faster pacing in the first 15 seconds (3-5s cuts)
4. **Emotional pacing zones**: Vary pacing based on content type tags in the shot list:
   - [list-item] sections: Steady 4-5s cuts, minimal transitions
   - [emotional-beat] sections: Longer holds (6-8s), slower Ken Burns, with crossfade transitions
   - [comparison] sections: Paired 4-5s clips with crossfade between the two sides
   - [transition] sections: Hold a neutral visual for 4-5s as a breathing beat
   - 🔶 SECTION-BREAK shots: Use fadeToBlack or dissolve transition, add 0.3s black gap
   - [concept] sections: Rich 5-8s holds with slow zoom
5. **Ken Burns variation**: Alternate between zoom-in (scale 1.0→1.08), zoom-out (1.08→1.0), pan-left, and pan-right across consecutive image clips — never use the same animation on two adjacent clips
6. **Color grading**: Apply consistent visual effects across all clips based on the video's mood:
   - If the narration text suggests dark/serious content: add vignette (size: 60, feather: 80) to image clips
   - If content is bright/optimistic: add brightness (+10) to image clips
   - Atmospheric/moody content: add slight contrast (+15) to all visual clips
   - NEVER apply sepia or grayscale unless the content is explicitly about history or vintage topics

## TRACK STRATEGY

Create tracks based on content needs:
- Always create a "main-video" track (type: video, group: video, order: 0) for base visual clips
- Always create an "overlays" track (type: video, name: "Video 2", group: video, order: 1) for motion-graphics overlays
- Always create an "sfx" track (type: audio, name: "Sound Effects", group: audio, order: 1) for sound effects
- Place image and video clips on the "main-video" track
- For STANDALONE motion-graphics shots (no base media), place on "main-video"
- For HYBRID shots (base media + motion-graphics overlay), place the base clip on "main-video" AND a separate motion-graphics clip on "overlays" at the SAME startTime and duration
- Audio narration is handled separately by the import system
- Sound effects: when shots describe actions with obvious audio (footsteps, doors, nature sounds, impacts, whooshes), add an audio clip on "sfx" at the appropriate startTime. Set type to "audio" and label to a descriptive SFX name.

## CRITICAL RULES

1. NEVER create overlapping clips on the SAME track
2. Every transition duration must be <= min(fromClipDuration, toClipDuration) / 2
3. For failed shots (listed in failedShots): EXTEND the previous or next successful clip's duration to COVER the gap time range. Also include them as mediaIssues for tracking.
4. ALL image clips MUST have keyframe animations (Ken Burns or zoom) — static images look dead on video
5. Always include audio fades: fadeIn on start, fadeOut on end
6. Do NOT create any "text" clips — all text/titles are handled by motion graphics in a separate pipeline
7. Hybrid shots (marked ⚡ in the shot list) MUST produce TWO clips: base on "main-video" + overlay on "overlays"
8. The FIRST clip MUST start at exactly startTime: 0. There must NEVER be a black screen at the beginning.
9. The timeline MUST have CONTINUOUS visual coverage — NO gaps between clips on the main-video track. Every second from 0 to total duration must be covered.
10. When a shot has no media, extend the neighboring clip's duration to fill that time range rather than leaving a gap.

## REQUIRED JSON FORMAT

Use exact camelCase field names. Each clip MUST have trackId, shotIndex, type, startTime, and duration:

\`\`\`json
{
  "tracks": [
    { "id": "main-video", "type": "video", "name": "Main Video", "group": "video", "order": 0 },
    { "id": "overlays", "type": "video", "name": "Video 2", "group": "video", "order": 1 },
    { "id": "sfx", "type": "audio", "name": "Sound Effects", "group": "audio", "order": 1 }
  ],
  "clips": [
    { "trackId": "main-video", "shotIndex": 0, "type": "image", "startTime": 0, "duration": 5.2, "keyframes": [...] },
    { "trackId": "main-video", "shotIndex": 1, "type": "video", "startTime": 5.2, "duration": 4.8 },
    { "trackId": "overlays", "shotIndex": 1, "type": "motion-graphics", "startTime": 5.2, "duration": 4.8 }
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
    hasRemotionCode?: boolean;
    /** Content type from segmenter (list-item, concept, emotional-beat, etc.) */
    contentType?: string;
    /** True if this shot marks a major section/topic boundary */
    sectionBreak?: boolean;
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
    const hybridTag = (shot.hasRemotionCode && shot.hasMedia && shot.mediaType !== 'motiongraphic') ? ' ⚡ HYBRID' : '';
    const sectionTag = shot.sectionBreak ? ' 🔶 SECTION-BREAK' : '';
    const ctTag = shot.contentType ? ` [${shot.contentType}]` : '';
    lines.push(`  [${shot.index}] ${shot.startSeconds.toFixed(1)}s-${shot.endSeconds.toFixed(1)}s (${shot.durationSeconds.toFixed(1)}s) | ${mediaStatus}${hybridTag}${ctTag}${sectionTag} | "${shot.text.substring(0, 150)}"`);
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
  lines.push('Generate the EditorAgentEDL JSON now. Include BOTH tracks: "main-video" for base media, "overlays" for motion-graphics overlays.');
  lines.push('');
  lines.push('Remember:');
  lines.push('- Every image clip MUST have keyframes (slowZoomIn or kenBurns pattern)');
  lines.push('- Base media clips (image, video) go on "main-video"');
  lines.push('- Standalone motion-graphics (no base media) go on "main-video"');
  lines.push('- HYBRID shots (⚡) need TWO clips: base on "main-video" + overlay on "overlays" at same timing');
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
