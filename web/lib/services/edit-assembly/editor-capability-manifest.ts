/**
 * Editor Capability Manifest
 * ============================================================================
 * Structured reference document describing ALL video editor capabilities.
 * The LLM receives this as context so it knows exactly what actions it can take.
 *
 * This is the single source of truth for what the AI editor agent can do.
 * When editor types change, update this manifest to keep the AI in sync.
 *
 * Phase 1: Multi-track, effects, keyframes, text styling, transitions
 * Phase 2 (future): Masks, greenscreen, motion graphics composition
 */

// ============================================================================
// CAPABILITY MANIFEST (LLM prompt fragment)
// ============================================================================

/**
 * Returns a structured markdown string describing all editor capabilities.
 * Included in the system prompt so the AI knows exactly what's available.
 */
export function getEditorCapabilityPrompt(): string {
  return `
## EDITOR CAPABILITIES REFERENCE

You have full control over a professional video editor. Below is everything you can do.

### TRACKS

You can create any number of tracks. Each track has:
- \`id\`: Your assigned ID (e.g. "main-video", "b-roll", "text-overlays", "narration")
- \`type\`: "video" | "audio"
- \`name\`: Display name (e.g. "Main Video", "B-Roll", "Chapter Titles")
- \`group\`: "video" | "audio" | "text" | "effects"
- \`order\`: Visual stacking order (0 = bottom, higher = on top).

Common track layouts:
- Standard: main-video (order:0) for all visual clips (images, videos, motion graphics), narration (audio, order:0)
- Dynamic: main-video (order:0), b-roll (order:1), sfx (audio, order:1), narration (audio, order:0)

### CLIP TYPES

| Type | Use Case | Required Properties |
|------|----------|-------------------|
| \`image\` | Static visuals, photos, AI images | transform, media.src |
| \`video\` | Video footage, stock clips | transform, media.src, media.speed |
| \`audio\` | Narration, music, SFX | media.src, media.volume |
| \`caption\` | Subtitles, word-level captions | text.* |
| \`shape\` | Rectangles, circles, dividers | transform |
| \`motion-graphics\` | Animated templates, titles, overlays | properties.template |

> **Note**: Do NOT use \`text\` clips. All text/titles are generated as motion graphics by a separate pipeline.

### TRANSFORM (all visual clips)

\`\`\`json
{
  "x": 0, "y": 0,           // Position in pixels (1920x1080 canvas)
  "width": 1920, "height": 1080,  // Size in pixels
  "rotation": 0,             // Degrees
  "opacity": 1               // 0-1
}
\`\`\`

Full-screen: { x: 0, y: 0, width: 1920, height: 1080 }
Lower-third box: { x: 100, y: 800, width: 600, height: 200 }
Center title: { x: 460, y: 440, width: 1000, height: 200 }


### VISUAL EFFECTS

Apply to any visual clip via the \`effects\` array:

| Effect Type | Parameters | Use Case |
|------------|-----------|----------|
| \`blur\` | radius (0-100) | Background blur, focus effect |
| \`dropShadow\` | offsetX, offsetY, blur, spread, color, opacity | Text/shape shadows |
| \`glow\` | radius, color, intensity (0-1) | Highlight elements |
| \`vignette\` | size (0-100), feather (0-100), color | Cinematic framing |
| \`brightness\` | amount (-100 to 100) | Lighten/darken |
| \`contrast\` | amount (-100 to 100) | Punch or flatten |
| \`saturation\` | amount (-100 to 100) | Vibrance control |
| \`grayscale\` | amount (0-100) | B&W effect |
| \`sepia\` | amount (0-100) | Vintage look |

### KEYFRAME ANIMATIONS

Animate any property over time. Each keyframe defines a value at a specific moment:

Animatable properties:
- \`transform.x\`, \`transform.y\` — Position
- \`transform.width\`, \`transform.height\` — Size
- \`transform.rotation\` — Rotation
- \`transform.scale\` — Uniform scale (1.0 = 100%)
- \`transform.opacity\` — Fade in/out

Common animation patterns:
- **Ken Burns (zoom in)**: scale 1.0→1.05 over clip duration, with x/y drift
- **Slow zoom in**: scale 1.0→1.03 over clip duration
- **Slow zoom out**: scale 1.05→1.0 over clip duration
- **Pan left**: x 0→-50 over clip duration
- **Pan right**: x 0→50 over clip duration
- **Fade in**: opacity 0→1 over 0.5s
- **Fade out**: opacity 1→0 over 0.5s
- **Pop in**: scale 0→1.1→1.0 over 0.3s

Interpolation types: "linear", "ease", "easeIn", "easeOut", "easeInOut", "easeInCubic", "easeOutCubic"

### VIDEO TRANSITIONS (between adjacent clips)

| Type | Description |
|------|------------|
| \`crossfade\` | Smooth opacity blend (most common) |
| \`fadeToBlack\` | Fade to black between clips |
| \`fadeToWhite\` | Fade to white between clips |
| \`fade\` | Simple fade |
| \`dissolve\` | Film-style dissolve |
| \`wipeLeft\`, \`wipeRight\`, \`wipeUp\`, \`wipeDown\` | Directional wipe |
| \`slideLeft\`, \`slideRight\`, \`slideUp\`, \`slideDown\` | Push/slide |
| \`zoomIn\`, \`zoomOut\` | Zoom transition |
| \`crossBlur\` | Blur transition |
| \`irisCircle\`, \`irisRectangle\` | Shape reveal |
| \`flipHorizontal\`, \`flipVertical\` | 3D flip |

Easing presets: "linear", "ease", "easeIn", "easeOut", "easeInOut", "easeInCubic", "easeOutCubic", "easeInExpo", "easeOutExpo"

### AUDIO TRANSITIONS

| Type | Description |
|------|------------|
| \`fadeInLinear\` | Linear volume fade in |
| \`fadeOutLinear\` | Linear volume fade out |
| \`crossfadeLinear\` | Linear crossfade between clips |
| \`crossfadeConstantPower\` | Smooth constant-power crossfade |

### AUDIO EFFECTS (for audio/video clips)

| Effect Type | Key Parameters |
|------------|---------------|
| \`parametricEq\` | bands[].frequency, bands[].gain, bands[].q |
| \`compressor\` | threshold, ratio, attack, release |
| \`reverb\` | preset, decay, mix |
| \`gain\` | gain (dB) |
| \`noiseGate\` | threshold, attack, release |

### PROJECT SETTINGS

- aspectRatio: "16:9" (landscape), "9:16" (portrait/shorts), "1:1" (square), "4:5" (Instagram)
- fps: 30 (default)
- backgroundColor: "#000000"
`.trim();
}

// ============================================================================
// EDITOR AGENT EDL — The new richer format
// ============================================================================

/**
 * Track definition — agent can create any number of tracks
 */
export interface AgentTrack {
  /** Agent-assigned ID (e.g. "main-video", "b-roll", "text-overlay", "narration") */
  id: string;
  /** Track type */
  type: 'video' | 'audio';
  /** Display name */
  name: string;
  /** Track group for UI organization */
  group: 'video' | 'audio' | 'text' | 'effects' | 'overlays';
  /** Visual stacking order (0 = bottom) */
  order: number;
}

/**
 * Effect applied to a clip
 */
export interface AgentEffect {
  /** Effect type (from EffectType enum values) */
  type: string;
  /** Effect parameters */
  params: Record<string, number | string | boolean>;
}

/**
 * Keyframe animation point
 */
export interface AgentKeyframePoint {
  /** Time in seconds relative to clip start */
  time: number;
  /** Numeric value or array of values */
  value: number | number[];
  /** Easing to NEXT keyframe */
  easing?: string;
}

/**
 * Keyframe animation for a property
 */
export interface AgentKeyframes {
  /** Property path (e.g. 'transform.scale', 'transform.x', 'transform.opacity') */
  property: string;
  /** Keyframe points */
  points: AgentKeyframePoint[];
}

/**
 * Audio effect applied to a clip
 */
export interface AgentAudioEffect {
  /** Audio effect type */
  type: string;
  /** Effect parameters */
  params: Record<string, number | string | boolean | object>;
}

/**
 * Text properties for text/caption clips
 */
export interface AgentTextProperties {
  /** Text content */
  text: string;
  /** Font family */
  fontFamily?: string;
  /** Font size in pixels */
  fontSize?: number;
  /** Text color (hex) */
  color?: string;
  /** Background color (rgba or hex) */
  backgroundColor?: string;
  /** Text alignment */
  textAlign?: 'left' | 'center' | 'right';
}

/**
 * Clip placement with full property support
 */
export interface AgentClip {
  /** Which agent-defined track to place on */
  trackId: string;
  /** Shot index from wizard (for media lookup) — omit for agent-created clips like text */
  shotIndex?: number;
  /** Clip type */
  type: 'video' | 'audio' | 'image' | 'text' | 'caption' | 'shape' | 'motion-graphics';
  /** Start time on timeline in seconds */
  startTime: number;
  /** Duration in seconds */
  duration: number;

  // === OPTIONAL PROPERTIES ===
  /** Transform (position, size, rotation, opacity) */
  transform?: Partial<{
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    opacity: number;
  }>;
  /** Text properties (for text/caption clips) */
  text?: AgentTextProperties;
  /** Visual effects stack */
  effects?: AgentEffect[];
  /** Keyframe animations */
  keyframes?: AgentKeyframes[];
  /** Audio effects (for audio/video clips) */
  audioEffects?: AgentAudioEffect[];
  /** Display label */
  label?: string;
}

/**
 * Transition between clips
 */
export interface AgentTransition {
  /** Transition type (VideoTransitionType or AudioTransitionType value) */
  type: string;
  /** Shot index of the outgoing clip */
  fromShotIndex: number;
  /** Shot index of the incoming clip */
  toShotIndex: number;
  /** Duration in seconds */
  duration: number;
  /** Easing preset */
  easing?: string;
  /** Whether this is an audio transition */
  isAudio?: boolean;
}

/**
 * Audio fade effect
 */
export interface AgentAudioFade {
  /** Target: 'main' for narration, 'music' for background */
  target: 'main' | 'music';
  /** Fade type */
  type: 'fadeIn' | 'fadeOut';
  /** Start time on timeline */
  startTime: number;
  /** Duration of fade */
  duration: number;
}

/**
 * Media issue report
 */
export interface AgentMediaIssue {
  shotIndex: number;
  severity: 'error' | 'warning' | 'info';
  type: string;
  title: string;
  description: string;
}

/**
 * Project settings the agent can configure
 */
export interface AgentProjectSettings {
  aspectRatio?: '16:9' | '1:1' | '4:5' | '9:16';
  fps?: number;
  backgroundColor?: string;
}

/**
 * The complete EDL produced by the editor agent.
 * This replaces the flatter EditDecisionList with a richer format
 * that matches the editor's full capability set.
 */
export interface EditorAgentEDL {
  /** Track definitions — agent creates the tracks it needs */
  tracks: AgentTrack[];
  /** Clip placements with full property support */
  clips: AgentClip[];
  /** Transitions between clips */
  transitions: AgentTransition[];
  /** Audio fades */
  audioFades: AgentAudioFade[];
  /** Media issues */
  mediaIssues: AgentMediaIssue[];
  /** Optional project settings */
  settings?: AgentProjectSettings;
}

// ============================================================================
// JSON SCHEMA for structured output
// ============================================================================

/**
 * JSON Schema for the EditorAgentEDL, used with LLM structured output.
 */
export const AGENT_EDL_JSON_SCHEMA = {
  type: 'object' as const,
  required: ['tracks', 'clips', 'transitions', 'audioFades', 'mediaIssues'],
  properties: {
    tracks: {
      type: 'array',
      description: 'Track definitions. Create all tracks needed for the edit.',
      items: {
        type: 'object',
        required: ['id', 'type', 'name', 'group', 'order'],
        properties: {
          id: { type: 'string', description: 'Your assigned ID (e.g. "main-video")' },
          type: { type: 'string', enum: ['video', 'audio'] },
          name: { type: 'string', description: 'Display name' },
          group: { type: 'string', enum: ['video', 'audio', 'text', 'effects', 'overlays'] },
          order: { type: 'number', description: 'Stacking order (0 = bottom)' },
        },
      },
    },
    clips: {
      type: 'array',
      description: 'All clips on the timeline.',
      items: {
        type: 'object',
        required: ['trackId', 'type', 'startTime', 'duration'],
        properties: {
          trackId: { type: 'string' },
          shotIndex: { type: 'number', description: 'Shot index from wizard (omit for text/shape clips)' },
          type: { type: 'string', enum: ['video', 'audio', 'image', 'text', 'caption', 'shape', 'motion-graphics'] },
          startTime: { type: 'number' },
          duration: { type: 'number' },
          label: { type: 'string' },
          transform: {
            type: 'object',
            properties: {
              x: { type: 'number' }, y: { type: 'number' },
              width: { type: 'number' }, height: { type: 'number' },
              rotation: { type: 'number' }, opacity: { type: 'number' },
            },
          },
          text: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              fontFamily: { type: 'string' },
              fontSize: { type: 'number' },
              color: { type: 'string' },
              backgroundColor: { type: 'string' },
              textAlign: { type: 'string', enum: ['left', 'center', 'right'] },
            },
          },
          effects: {
            type: 'array',
            items: {
              type: 'object',
              required: ['type', 'params'],
              properties: {
                type: { type: 'string' },
                params: { type: 'object' },
              },
            },
          },
          keyframes: {
            type: 'array',
            items: {
              type: 'object',
              required: ['property', 'points'],
              properties: {
                property: { type: 'string' },
                points: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['time', 'value'],
                    properties: {
                      time: { type: 'number' },
                      value: {},
                      easing: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
          audioEffects: {
            type: 'array',
            items: {
              type: 'object',
              required: ['type', 'params'],
              properties: {
                type: { type: 'string' },
                params: { type: 'object' },
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
        properties: {
          type: { type: 'string' },
          fromShotIndex: { type: 'number' },
          toShotIndex: { type: 'number' },
          duration: { type: 'number' },
          easing: { type: 'string' },
          isAudio: { type: 'boolean' },
        },
      },
    },
    audioFades: {
      type: 'array',
      items: {
        type: 'object',
        required: ['target', 'type', 'startTime', 'duration'],
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
        properties: {
          shotIndex: { type: 'number' },
          severity: { type: 'string', enum: ['error', 'warning', 'info'] },
          type: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
        },
      },
    },
    settings: {
      type: 'object',
      properties: {
        aspectRatio: { type: 'string', enum: ['16:9', '1:1', '4:5', '9:16'] },
        fps: { type: 'number' },
        backgroundColor: { type: 'string' },
      },
    },
  },
} as const;
