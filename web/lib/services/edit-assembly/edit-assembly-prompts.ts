/**
 * Edit Assembly Prompts
 * ============================================================================
 * System prompt, user prompt templates, and EDL JSON schema for the
 * AI Edit Assembly Service. Encodes documentary-style defaults and
 * YouTube best practices.
 */

// ============================================================
// EDL TYPES (Edit Decision List)
// ============================================================

export interface EDLClip {
  /** Shot index from the shot list */
  shotIndex: number;
  /** Track to place on: 'video-1', 'video-2', etc. */
  track: string;
  /** Start time on timeline in seconds */
  startTime: number;
  /** Duration on timeline in seconds */
  duration: number;
  /** Media type */
  mediaType: 'image' | 'video' | 'motiongraphic';
  /** Source URL or remotion identifier */
  sourceUrl?: string;
}

export interface EDLTransition {
  /** Type of transition (maps to VideoTransitionType enum) */
  type: 'crossfade' | 'fadeToBlack' | 'fade' | 'wipeLeft' | 'dissolve';
  /** Duration of transition in seconds */
  duration: number;
  /** Shot index of clip BEFORE the transition */
  fromShotIndex: number;
  /** Shot index of clip AFTER the transition */
  toShotIndex: number;
  /** Position qualifier */
  position: 'between';
}

export interface EDLEffect {
  /** Shot index to apply the effect to */
  shotIndex: number;
  /** Effect type (simplified set for AI to choose from) */
  type: 'kenBurns' | 'slowZoomIn' | 'slowZoomOut' | 'panLeft' | 'panRight';
  /** Effect parameters */
  params: {
    /** Start scale (1.0 = 100%) */
    startScale?: number;
    /** End scale */
    endScale?: number;
    /** Start X position (normalized 0-1) */
    startX?: number;
    /** End X position */
    endX?: number;
    /** Start Y position (normalized 0-1) */
    startY?: number;
    /** End Y position */
    endY?: number;
  };
}

export interface EDLTextOverlay {
  /** Text content to display */
  text: string;
  /** Start time on timeline in seconds */
  startTime: number;
  /** Duration in seconds */
  duration: number;
  /** Style preset */
  style: 'chapterTitle' | 'lowerThird' | 'callout' | 'subtitle';
  /** Font size (in px) */
  fontSize?: number;
  /** Position on canvas */
  position?: {
    x: number; // normalized 0-1 from left
    y: number; // normalized 0-1 from top
  };
}

export interface EDLMotionGraphic {
  /** Shot index of the motion graphic */
  shotIndex: number;
  /** Which track to place on: 'effects-1', 'effects-2' */
  track: string;
  /** Start time on timeline in seconds */
  startTime: number;
  /** Duration in seconds */
  duration: number;
}

export interface EDLAudioEffect {
  /** What to apply to: 'main' for main audio, or specific chunk index */
  target: 'main' | number;
  /** Effect type */
  type: 'fadeIn' | 'fadeOut' | 'volumeAutomation';
  /** Start time in seconds */
  startTime: number;
  /** Duration in seconds */
  duration: number;
  /** Volume level (0-1) for automation */
  volume?: number;
}

export interface MediaIssueEDL {
  /** Shot index */
  shotIndex: number;
  /** Severity */
  severity: 'error' | 'warning';
  /** Issue type */
  type: 'generation_failed' | 'placeholder' | 'missing_media';
  /** Human-readable title */
  title: string;
  /** Description of the issue */
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

// ============================================================
// SYSTEM PROMPT
// ============================================================

export const EDIT_ASSEMBLY_SYSTEM_PROMPT = `You are a professional video editor AI assistant. Your job is to analyze a video project's content (script, shots, audio, media) and produce a structured Edit Decision List (EDL) that creates a polished, YouTube-optimized video.

## YOUR STYLE: DOCUMENTARY

Apply these documentary style defaults:
- Average cut duration: 6-10 seconds
- Transition density: LOW (mostly hard cuts)
- Use crossfades only for topic/section shifts
- Use fade-to-black for major section boundaries
- Apply slow Ken Burns effect on static images (subtle zoom 1.0→1.05 over 8s)
- Apply gentle zoom on video clips (1.0→1.02 for micro-movement)
- Text overlays: chapter titles at section starts, minimal callouts for key points
- Pacing: steady and measured — breathing room between points

## YOUTUBE BEST PRACTICES

1. **5-second visual change rule**: Ensure a visual change every ~5s (transition, zoom, text overlay, or cut)
2. **Audio-visual sync**: Align transitions with phrase/sentence boundaries, not mid-word
3. **Hook pattern**: Slightly faster pacing in the first 15 seconds (4-6s cuts vs 6-10s default)
4. **Text reinforcement**: Surface key phrases as text overlays on emotional or important beats

## CRITICAL RULES

1. NEVER create overlapping clips on the same track
2. Every transition duration must be <= min(fromClipDuration, toClipDuration) / 2
3. Transition types you can use: crossfade, fadeToBlack, fade, wipeLeft, dissolve
4. Effects you can use: kenBurns, slowZoomIn, slowZoomOut, panLeft, panRight
5. Text styles you can use: chapterTitle, lowerThird, callout, subtitle
6. Audio effect types: fadeIn, fadeOut, volumeAutomation
7. For motion graphics shots, place them at their shot timing - they are self-contained
8. For failed shots (listed in failedShots), include them as mediaIssues
9. Always start with a fadeIn on the first clip's audio
10. Always end with a fadeOut on the last clip's audio

Respond with ONLY valid JSON matching the EditDecisionList schema. No markdown, no code fences, no commentary.`;

// ============================================================
// USER PROMPT BUILDER
// ============================================================

export interface EditAssemblyContext {
  /** Summary of the video topic */
  videoTitle: string;
  /** Total duration in seconds */
  totalDuration: number;
  /** FPS */
  fps: number;
  /** Shot list with timing and media info */
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
  /** Script section markers (sentence boundaries) */
  scriptSentences: string[];
  /** Shot indices that failed generation */
  failedShots: number[];
  /** Audio chunk info */
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

  // Script (abbreviated)
  if (context.scriptSentences.length > 0) {
    lines.push('## Script Sentences (for text overlay placement)');
    const maxSentences = Math.min(context.scriptSentences.length, 20);
    for (let i = 0; i < maxSentences; i++) {
      lines.push(`  ${i + 1}. "${context.scriptSentences[i].substring(0, 80)}"`);
    }
    if (context.scriptSentences.length > maxSentences) {
      lines.push(`  ... and ${context.scriptSentences.length - maxSentences} more`);
    }
    lines.push('');
  }

  lines.push('Generate the EDL JSON now. Place all clips sequentially on video-1 track. Add transitions, effects, text overlays, and audio fades as appropriate for documentary style.');

  return lines.join('\n');
}

// ============================================================
// EDL JSON SCHEMA (for validation reference)
// ============================================================

export const EDL_JSON_SCHEMA = {
  type: 'object',
  required: ['clips', 'transitions', 'effects', 'textOverlays', 'motionGraphics', 'audioEffects', 'mediaIssues'],
  properties: {
    clips: {
      type: 'array',
      items: {
        type: 'object',
        required: ['shotIndex', 'track', 'startTime', 'duration', 'mediaType'],
      },
    },
    transitions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['type', 'duration', 'fromShotIndex', 'toShotIndex', 'position'],
      },
    },
    effects: {
      type: 'array',
      items: {
        type: 'object',
        required: ['shotIndex', 'type', 'params'],
      },
    },
    textOverlays: {
      type: 'array',
      items: {
        type: 'object',
        required: ['text', 'startTime', 'duration', 'style'],
      },
    },
    motionGraphics: {
      type: 'array',
      items: {
        type: 'object',
        required: ['shotIndex', 'track', 'startTime', 'duration'],
      },
    },
    audioEffects: {
      type: 'array',
      items: {
        type: 'object',
        required: ['target', 'type', 'startTime', 'duration'],
      },
    },
    mediaIssues: {
      type: 'array',
      items: {
        type: 'object',
        required: ['shotIndex', 'severity', 'type', 'title', 'description'],
      },
    },
  },
};
