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

export type AssemblyPlacement = 'base_only' | 'overlay_on_base' | 'standalone_graphic';

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

## SCENE COHERENCE

Recognize when consecutive shots share the same setting, characters, or narrative moment (a "visual sequence"). Within a visual sequence:
- Use HARD CUTS between shots — they're part of the same moment
- Keep keyframe animation DIRECTION consistent (e.g., all drift-right within the same sequence)
- Match animation intensity — don't go from subtle to aggressive within the same scene

Between visual sequences (when the setting/topic/mood clearly shifts):
- Use stronger transitions (fadeToBlack for major shifts, dissolve for soft shifts)
- This signals to the viewer: "We're moving to something new"
- Consider an SFX transition marker on these boundaries

### DUPLICATE PREVENTION (CRITICAL)
- NEVER place the same shotIndex on BOTH main-video and overlays tracks simultaneously
  (unless it's a hybrid shot: base video on main-video + MG overlay with remotion_code on overlays)
- Do NOT repeat the same shot consecutively — each clip MUST display unique visual content
- If you need to extend the same visual, increase that clip's duration instead of creating a copy

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
- Always create an "overlays" track (type: video, name: "Video 2", group: overlays, order: 1) for motion-graphics overlays
- Always create an "sfx" track (type: audio, name: "Sound Effects", group: audio, order: 1) for sound effects
- Place image and video clips on the "main-video" track
- For STANDALONE motion-graphics shots (no base media), place on "main-video"
- For HYBRID shots explicitly marked as placement=overlay_on_base, place the base clip on "main-video" AND a separate motion-graphics clip on "overlays" at the SAME startTime and duration
- If a shot is not marked placement=overlay_on_base, do NOT invent an overlay companion clip
- Audio narration is handled separately by the import system

## CRITICAL RULES

1. Before emitting any clip, verify that shotIndex has not already appeared earlier on that same track. The ONLY exception is the companion overlay for placement=overlay_on_base on the "overlays" track.
2. NEVER create overlapping clips on the SAME track
3. Every transition duration must be <= min(fromClipDuration, toClipDuration) / 2
4. For failed shots (listed in failedShots): SKIP them — do NOT create a clip for them. Include them as mediaIssues for tracking. NEVER extend neighboring clips to fill a gap.
5. ALL image clips MUST have keyframe animations — static images look dead on video
6. Always include audio fades: fadeIn on start, fadeOut on end
7. Do NOT create any "text" clips — all text/titles are handled by motion graphics in a separate pipeline
8. Hybrid shots (marked ⚡ / placement=overlay_on_base in the shot list) MUST produce TWO clips: base on "main-video" + overlay on "overlays"
9. The FIRST clip MUST start at exactly startTime: 0. There must NEVER be a black screen at the beginning.
10. Place each clip at its narration-aligned startTime from the shot data. Gaps are acceptable — the renderer handles them gracefully. NEVER sacrifice audio sync for visual coverage.
11. NEVER stretch or extend any clip beyond its narration segment boundary. Stretched clips create frozen frames — the single worst artifact possible.
12. Every major section break (sectionBreak=true shots) MUST have a fadeToBlack transition of 0.5–0.7s AND an SFX clip labeled "section-transition" on the sfx track.
13. Shot 0 MUST have an aggressive Ken Burns push-in keyframe (scale 1.0→1.10 over the shot duration) to hook the viewer from frame one.
14. Vary Ken Burns patterns — alternate push-in, pull-out, drift-left, drift-right across consecutive image clips. Never use the same animation on two adjacent clips.
15. For emotional beat shots, use a dissolve transition (0.5s). For high-energy shots, use hard cuts only.

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
    assemblyPlacement?: AssemblyPlacement;
    visualElements?: string[];
    /** Content type from segmenter (list-item, concept, emotional-beat, etc.) */
    contentType?: string;
    /** True if this shot marks a major section/topic boundary */
    sectionBreak?: boolean;
    /** Scene grouping ID — shots sharing a scene_id belong to the same visual scene */
    sceneId?: string;
    sceneClusterId?: string;
    breakdownSequenceId?: string;
    breakdownRole?: 'macro' | 'mid' | 'micro' | 'detail';
    /** Narrative purpose (e.g., 'hook', 'reveal', 'climax', 'transition', 'cta') */
    narrativeBeat?: string;
    shotRole?: string;
    framing?: string;
    cameraAngle?: string;
    cameraMotion?: string;
    lensStyle?: string;
    subjectFocus?: string;
    entryTransitionIntent?: string;
    exitTransitionIntent?: string;
    visualMotif?: string;
    continuityLevel?: 'fresh' | 'soft' | 'strict';
    anchorStrategy?: 'fresh' | 'scene_anchor' | 'prev_frame' | 'prev_keyframe';
    renderStrategy?: string;
    trimPriority?: 'hold' | 'balanced' | 'tight';
    assemblyContract?: Record<string, unknown>;
    /** Whether this shot continues the previous shot's scene seamlessly */
    continuityFromPrevious?: boolean;
  }>;
  scriptSentences: string[];
  failedShots: number[];
  audioChunks: Array<{
    index: number;
    durationSeconds: number;
    text?: string;
  }>;
  /** Optional time window for batch-mode audio chunk filtering */
  shotTimeRange?: { startSeconds: number; endSeconds: number };
}

export function buildEditAssemblyUserPrompt(context: EditAssemblyContext): string {
  const lines: string[] = [];

  lines.push(`# Video: ${context.videoTitle}`);
  lines.push(`Total duration: ${context.totalDuration.toFixed(1)}s | FPS: ${context.fps}`);
  lines.push('');

  // Shot list with full narration + narrative context for content-aware editing
  lines.push('## Shots');
  let prevSceneId: string | undefined;
  for (const shot of context.shots) {
    const mediaStatus = shot.hasMedia ? `✓ ${shot.mediaType}` : '✗ no media';
    const hybridTag = shot.assemblyPlacement === 'overlay_on_base' ? ' ⚡ HYBRID' : '';
    const sectionTag = shot.sectionBreak ? ' 🔶 SECTION-BREAK' : '';
    const ctTag = shot.contentType ? ` [${shot.contentType}]` : '';

    // Classify content energy for pacing guidance
    const energy = classifyEnergy(shot.contentType || '', shot.text);
    const energyTag = ` ⚡${energy}`;

    // Narrative context tags
    const beatTag = shot.narrativeBeat ? ` 🎬${shot.narrativeBeat}` : '';
    const continuityTag = shot.continuityFromPrevious ? ' 🔗CONTINUOUS' : '';

    // Scene boundary detection — inject a scene transition marker
    const isNewScene = shot.sceneId && shot.sceneId !== prevSceneId;
    if (isNewScene && prevSceneId) {
      lines.push(`  --- SCENE TRANSITION (${prevSceneId} → ${shot.sceneId}) --- Choose a purposeful transition here based on mood shift ---`);
    }
    prevSceneId = shot.sceneId;

    lines.push(`  [${shot.index}] ${shot.startSeconds.toFixed(1)}s-${shot.endSeconds.toFixed(1)}s (${shot.durationSeconds.toFixed(1)}s) | ${mediaStatus}${hybridTag}${ctTag}${energyTag}${beatTag}${continuityTag}${sectionTag}`);
    // Include truncated narration text so the LLM can match pacing to content
    const narrationPreview = shot.text.length > 150 ? shot.text.substring(0, 147) + '...' : shot.text;
    lines.push(`    Narration: "${narrationPreview}"`);
    const shotDetails = [
      shot.shotRole ? `role=${shot.shotRole}` : '',
      shot.framing ? `framing=${shot.framing}` : '',
      shot.cameraAngle ? `angle=${shot.cameraAngle}` : '',
      shot.cameraMotion ? `motion=${shot.cameraMotion}` : '',
      shot.lensStyle ? `lens=${shot.lensStyle}` : '',
      shot.subjectFocus ? `focus=${shot.subjectFocus}` : '',
      shot.entryTransitionIntent ? `entry=${shot.entryTransitionIntent}` : '',
      shot.exitTransitionIntent ? `exit=${shot.exitTransitionIntent}` : '',
      shot.visualMotif ? `motif=${shot.visualMotif}` : '',
      shot.continuityLevel ? `continuity=${shot.continuityLevel}` : '',
      shot.anchorStrategy ? `anchor=${shot.anchorStrategy}` : '',
      shot.renderStrategy ? `render=${shot.renderStrategy}` : '',
      shot.assemblyPlacement ? `placement=${shot.assemblyPlacement}` : '',
      shot.trimPriority ? `trimPriority=${shot.trimPriority}` : '',
      shot.sceneClusterId ? `cluster=${shot.sceneClusterId}` : '',
      shot.breakdownSequenceId ? `breakdown=${shot.breakdownSequenceId}` : '',
      shot.breakdownRole ? `breakdownRole=${shot.breakdownRole}` : '',
    ].filter(Boolean);
    if (shotDetails.length > 0) {
      lines.push(`    Directing: ${shotDetails.join(' | ')}`);
    }
    if (shot.assemblyContract && Object.keys(shot.assemblyContract).length > 0) {
      lines.push(`    Assembly contract: ${JSON.stringify(shot.assemblyContract)}`);
    }
  }
  lines.push('');

  const availableIndices = context.shots
    .filter(shot => shot.hasMedia)
    .map(shot => shot.index);
  const unavailableIndices = context.shots
    .filter(shot => !shot.hasMedia)
    .map(shot => shot.index);
  lines.push('## Available Shot Pool');
  lines.push(`  Indices with media: [${availableIndices.join(', ')}]`);
  lines.push(`  Indices without media: [${unavailableIndices.join(', ')}]`);
  lines.push('  Each shotIndex may appear at most once per track. Verify this before emitting each clip.');
  lines.push('');

  // Failed shots
  if (context.failedShots.length > 0) {
    lines.push(`## Failed Shots (include as mediaIssues)`);
    lines.push(`  Indices: ${context.failedShots.join(', ')}`);
    lines.push('');
  }

  // Audio chunks — filter to batch-relevant window if provided
  const AUDIO_PADDING_S = 5; // include chunks that overlap ±5s of the shot range
  let relevantAudioChunks = context.audioChunks;
  if (context.shotTimeRange) {
    const rangeStart = context.shotTimeRange.startSeconds - AUDIO_PADDING_S;
    const rangeEnd = context.shotTimeRange.endSeconds + AUDIO_PADDING_S;
    let chunkStart = 0;
    relevantAudioChunks = context.audioChunks.filter(chunk => {
      const chunkEnd = chunkStart + chunk.durationSeconds;
      const overlaps = chunkEnd > rangeStart && chunkStart < rangeEnd;
      chunkStart = chunkEnd;
      return overlaps;
    });
    if (relevantAudioChunks.length < context.audioChunks.length) {
      lines.push(`## Audio Timeline (filtered to batch window ${context.shotTimeRange.startSeconds.toFixed(0)}s-${context.shotTimeRange.endSeconds.toFixed(0)}s)`);
    } else {
      lines.push('## Audio Timeline');
    }
  } else {
    lines.push('## Audio Timeline');
  }

  let audioRunning = 0;
  // Re-compute running offset for ALL chunks to get correct timestamps,
  // but only print the relevant ones
  let chunkOffset = 0;
  for (const chunk of context.audioChunks) {
    const chunkEnd = chunkOffset + chunk.durationSeconds;
    if (relevantAudioChunks.includes(chunk)) {
      lines.push(`  Chunk ${chunk.index}: ${chunkOffset.toFixed(1)}s-${chunkEnd.toFixed(1)}s (${chunk.durationSeconds.toFixed(1)}s)${chunk.text ? ` | "${chunk.text.substring(0, 80)}..."` : ''}`);
    }
    chunkOffset = chunkEnd;
  }
  audioRunning = chunkOffset; // total audio duration
  lines.push(`  Total audio: ${audioRunning.toFixed(1)}s`);
  lines.push('');
  lines.push('## Editorial Constraints');
  lines.push('- Treat shot metadata as authoritative when present: shot role, framing, camera motion, lens, subject focus, continuity level, and assembly contract are deliberate creative constraints.');
  lines.push('- If continuity level is strict, preserve the same world and subject identity and prefer anchor-based continuity over fresh reinterpretation.');
  lines.push('- If render strategy indicates segmentation-led execution, keep the edit crisp and editorial, not gimmicky. Use that lane only where it clearly improves clarity or emphasis.');
  lines.push('');

  lines.push('## Instructions');
  lines.push('');
  lines.push('Generate the EditorAgentEDL JSON now. Create an edit that a top YouTube channel would be proud of.');
  lines.push('');
  lines.push('**Use the narration text to drive your editing:**');
  lines.push('- Read what is being SAID in each shot and match your visual pacing to the content energy');
  lines.push('- ⚡HIGH energy narration: rapid cuts (2-3s), aggressive zoom, hard cuts');
  lines.push('- ⚡MED energy narration: moderate 3-5s clips, subtle keyframes, crossfades');
  lines.push('- ⚡LOW energy narration: let it breathe (4-6s), slow push-in, dissolves');
  lines.push('');
  lines.push('Remember:');
  lines.push('- Every image clip MUST have purposeful keyframe animations (choose based on the shot\'s narrative role)');
  lines.push('- Base media clips (image, video) go on "main-video"');
  lines.push('- Standalone motion-graphics (no base media) go on "main-video"');
  lines.push('- HYBRID shots (⚡ / placement=overlay_on_base) need TWO clips: base on "main-video" + overlay on "overlays" at same timing');
  lines.push('- If a shot is not marked placement=overlay_on_base, do NOT create an overlay companion clip for it');
  lines.push('- Do NOT create any text clips — text is handled by motion graphics');
  lines.push('- Choose transitions that MEAN something — crossfade for connection, dissolve for time, wipe for contrast, fadeToBlack for chapter end');
  lines.push('- Use SFX intentionally as emotional punctuation on the "sfx" track');
  lines.push('- Include fadeIn and fadeOut audio fades');
  lines.push(`- The timeline MUST match total audio duration (~${audioRunning.toFixed(0)}s). Do NOT exceed this.`);
  lines.push('- Treat shot metadata as authoritative when present: shot role, framing, camera motion, lens, subject focus, continuity level, and assembly contract are deliberate creative constraints.');
  lines.push('- If continuity level is strict, preserve the same world and subject identity and prefer anchor-based continuity over fresh reinterpretation.');
  lines.push('- If render strategy indicates segmentation-led execution, keep the edit crisp and editorial, not gimmicky. Use that lane only where it clearly improves clarity or emphasis.');
  lines.push('');
  lines.push('**Narrative-aware transitions:**');
  lines.push('- 🔗CONTINUOUS shots: use hard cuts ONLY — these are the same scene, no transition needed');
  lines.push('- 🎬reveal / 🎬climax: use a hard cut + snap-zoom keyframe for dramatic impact');
  lines.push('- 🎬transition: use crossfade or dissolve to signal a gentle topic shift');
  lines.push('- SCENE TRANSITION markers: use a purposeful transition (fadeToBlack, dissolve, or wipe) based on the mood shift between scenes');
  lines.push('- Within the same scene_id: keep a consistent visual rhythm — similar keyframe patterns and minimal transitions');

  return lines.join('\n');
}

/**
 * Classify a shot's content energy level based on content type and text cues.
 * Used to guide the LLM's pacing decisions.
 */
function classifyEnergy(contentType: string, text: string): 'HIGH' | 'MED' | 'LOW' {
  // High-energy indicators: reveals, shocking content, rapid information
  const highCues = /shock|reveal|expos|scandal|secret|discovered|broke|explod|arrest|murder|kill|death|breaking|urgent|crisis/i;
  if (contentType === 'list-item' || highCues.test(text)) return 'HIGH';

  // Low-energy indicators: reflective, transitional, contextual
  const lowCues = /reflect|remember|look back|aftermath|legacy|silence|pause|consider|meanwhile|background|context|overview/i;
  if (contentType === 'transition' || contentType === 'emotional-beat' || lowCues.test(text)) return 'LOW';

  // Default: medium energy
  return 'MED';
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
