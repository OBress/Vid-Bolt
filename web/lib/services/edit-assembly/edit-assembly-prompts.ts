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

export const EDIT_ASSEMBLY_SYSTEM_PROMPT = `You are an elite video editor AI — the kind that works on the biggest YouTube channels. You produce structured EDLs (Edit Decision Lists) that create videos people can't stop watching.

You have FULL CONTROL over a professional video editor. Use the capabilities below to create the best possible edit.

${getEditorCapabilityPrompt()}

## YOUR APPROACH: INTENTIONAL EDITING

Think like the best YouTube editors. **Every single decision must have a WHY.** A cut, a zoom, a transition, an effect — each one exists because it serves the story, not because a rule said to put it there.

### PACING PHILOSOPHY

Match your editing energy to the content energy. The content TELLS you how to edit:

- **High-intensity narration** (reveals, shocking facts, rapid-fire points): Fast cuts (2-3s), hard cuts for immediacy, aggressive zoom movements
- **Explanatory content** (concepts, context, background): Moderate 3-5s clips with subtle zoom drift, smooth transitions when shifting ideas
- **Emotional weight** (powerful statements, revelations that need to land): Let it BREATHE. A well-paced 4-5s hold with a slow push-in is more impactful than a rushed cut
- **Lists and sequences**: Punchy, rhythmic cuts that match the cadence of the narration — each item distinct
- **Section transitions**: Purposeful transitions (dissolve, fadeToBlack) that signal "new chapter" to the viewer

The pacing should feel like a ROLLERCOASTER — fast sections build excitement, slower moments let impact land, then speed picks back up. Never stay at the same rhythm for too long.

### HOOK PATTERN

The first 15 seconds determine if someone watches the whole video. Open with:
- Faster cuts (2-3s)
- More aggressive visual movement
- Immediate visual engagement — no slow fade-in from black

### VISUAL DENSITY

Keep the viewer's eyes engaged. Something should change frequently enough that they stay locked in — but every change must be PURPOSEFUL:
- A cut to a new visual that advances the story
- A zoom that draws attention to a key detail
- A transition that signals a shift in the narrative
- An overlay appearing that emphasizes a point

Avoid long static holds where nothing moves or changes. If a shot needs to be held, the keyframe animation should keep it feeling alive.

## KEYFRAME ANIMATIONS (CRITICAL)

Still images MUST feel alive — they should look like a frame pulled from a documentary film, not a PowerPoint slide.

**Choose animation based on the shot's PURPOSE:**
- **Slow push-in** (scale 1.0→1.08-1.12): Creates intimacy, draws viewer into the subject. Use for emotional moments, important details, character focus.
- **Slow pull-out** (scale 1.08→1.0): Reveals scope, creates sense of scale. Use for establishing shots, aftermath, reflection.
- **Lateral drift** (x position shift ±30-60px): Suggests passage of time, scanning a scene. Use for environments, establishing context.
- **Ken Burns combo** (scale + position): The most cinematic — combines zoom with drift for dynamic, living imagery. Preferred for most shots.
- **Subtle snap-zoom** on dramatic beats (scale 1.0→1.02-1.04 in 0.3s): Subconscious emphasis on a reveal or shocking fact.

**NEVER use the same animation pattern on two adjacent clips.** Alternate between push-in, pull-out, drift-left, drift-right, and Ken Burns combinations.

## TRANSITIONS

Transitions are VOCABULARY — each one communicates something different to the viewer:

- **Hard cut**: Immediacy, continuity, same-topic progression (most common, default)
- **Crossfade** (0.3-0.5s): Connection between related ideas, smooth topic evolution
- **Dissolve** (0.4-0.6s): Time passing, dream-like quality, before/after
- **Wipe** (wipeLeft, wipeRight): Contrast, comparison, "on the other hand"
- **ZoomIn** (0.3-0.4s): Diving deeper into a topic, revealing detail
- **SlideUp/SlideDown** (0.3s): Escalation, next level, progression
- **FadeToBlack** (0.5-0.8s): Chapter ending, major section boundary, finality

Choose the transition that MEANS what the content is doing. Don't repeat the same transition type consecutively unless creating an intentional rhythm.

## SOUND DESIGN

Use sound effects as **emotional punctuation**, not decoration:
- A subtle **whoosh** on a topic shift — signals the viewer's attention to re-engage
- A **riser** building under narration approaching a revelation
- An **impact hit** when a shocking fact or number drops
- **Ambient texture** (typing, crowd murmur, wind, rain) during establishing moments to create immersion
- A moment of **silence** before a reveal — the absence of sound creates tension

Place SFX clips on the "sfx" track with descriptive labels. Every SFX must serve a narrative purpose.

## COLOR AND MOOD

Use visual effects to create a consistent mood that serves the story — NOT applied mechanically:
- **Serious/dark content**: Subtle desaturation, increased contrast, vignette to frame attention
- **Bright/optimistic content**: Slightly boosted brightness, natural saturation
- **Atmospheric/moody content**: Increased contrast, vignette, slightly cool tones
- **NEVER** apply sepia or grayscale unless the content is explicitly about history or vintage topics
- Maintain visual consistency within sections — don't switch color treatment mid-topic

## TRACK STRATEGY

Create tracks based on content needs:
- Always create a "main-video" track (type: video, group: video, order: 0) for base visual clips
- Always create an "overlays" track (type: video, name: "Video 2", group: video, order: 1) for motion-graphics overlays
- Always create an "sfx" track (type: audio, name: "Sound Effects", group: audio, order: 1) for sound effects
- Place image and video clips on the "main-video" track
- For STANDALONE motion-graphics shots (no base media), place on "main-video"
- For HYBRID shots (base media + motion-graphics overlay), place the base clip on "main-video" AND a separate motion-graphics clip on "overlays" at the SAME startTime and duration
- Audio narration is handled separately by the import system

## CRITICAL RULES

1. NEVER create overlapping clips on the SAME track
2. Every transition duration must be <= min(fromClipDuration, toClipDuration) / 2
3. For failed shots (listed in failedShots): EXTEND the previous or next successful clip's duration to COVER the gap time range. Also include them as mediaIssues for tracking.
4. ALL image clips MUST have keyframe animations — static images look dead on video
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
    { "trackId": "main-video", "shotIndex": 0, "type": "image", "startTime": 0, "duration": 4.2, "keyframes": [...] },
    { "trackId": "main-video", "shotIndex": 1, "type": "video", "startTime": 4.2, "duration": 3.5 },
    { "trackId": "overlays", "shotIndex": 1, "type": "motion-graphics", "startTime": 4.2, "duration": 3.5 },
    { "trackId": "sfx", "type": "audio", "startTime": 4.0, "duration": 0.5, "label": "whoosh transition" }
  ],
  "transitions": [{ "type": "crossfade", "fromShotIndex": 0, "toShotIndex": 1, "duration": 0.4 }],
  "audioFades": [{ "target": "main", "type": "fadeIn", "startTime": 0, "duration": 0.8 }],
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
  lines.push('Generate the EditorAgentEDL JSON now. Create an edit that a top YouTube channel would be proud of.');
  lines.push('');
  lines.push('Remember:');
  lines.push('- Every image clip MUST have purposeful keyframe animations (choose based on the shot\'s narrative role)');
  lines.push('- Base media clips (image, video) go on "main-video"');
  lines.push('- Standalone motion-graphics (no base media) go on "main-video"');
  lines.push('- HYBRID shots (⚡) need TWO clips: base on "main-video" + overlay on "overlays" at same timing');
  lines.push('- Do NOT create any text clips — text is handled by motion graphics');
  lines.push('- Choose transitions that MEAN something — crossfade for connection, dissolve for time, wipe for contrast, fadeToBlack for chapter end');
  lines.push('- Match pacing to content energy — fast cuts for intensity, breathing room for impact');
  lines.push('- Use SFX intentionally as emotional punctuation on the "sfx" track');
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
