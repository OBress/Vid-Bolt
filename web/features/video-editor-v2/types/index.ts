import type { PropertyKeyframes } from './keyframes';
import type { AudioEffect } from './audio-effects';
import type { MotionGraphicsOverlay } from './motion-graphics';
import type { AudioNormalizationMetadata } from '@/lib/services/audio-normalization-metadata';

/**
 * Overlay types for Remotion rendering
 * 
 * Note: A newer RenderClip-based API is available in render-clip.ts
 */
export enum OverlayType {
  TEXT = "text",
  IMAGE = "image",
  SHAPE = "shape",
  VIDEO = "video",
  SOUND = "sound",
  CAPTION = "caption",
  LOCAL_DIR = "local-dir",
  STICKER = "sticker",
  TEMPLATE = "TEMPLATE",
  SETTINGS = "settings",
  TRANSITION = "transition",
  MOTION_GRAPHICS = "motion-graphics",
}

// ==========================================
// VIDEO TRANSITION TYPES
// ==========================================

export enum VideoTransitionType {
  // Fade transitions
  FADE = "fade",
  CROSSFADE = "crossfade",
  FADE_TO_BLACK = "fadeToBlack",
  FADE_TO_WHITE = "fadeToWhite",
  
  // Wipe transitions
  WIPE_LEFT = "wipeLeft",
  WIPE_RIGHT = "wipeRight",
  WIPE_UP = "wipeUp",
  WIPE_DOWN = "wipeDown",
  
  // Slide/Push transitions
  SLIDE_LEFT = "slideLeft",
  SLIDE_RIGHT = "slideRight",
  SLIDE_UP = "slideUp",
  SLIDE_DOWN = "slideDown",
  
  // Zoom transitions
  ZOOM_IN = "zoomIn",
  ZOOM_OUT = "zoomOut",
  
  // Blur transitions
  CROSS_BLUR = "crossBlur",
  
  // Iris/Shape transitions
  IRIS_CIRCLE = "irisCircle",
  IRIS_RECTANGLE = "irisRectangle",
  
  // 3D transitions
  FLIP_HORIZONTAL = "flipHorizontal",
  FLIP_VERTICAL = "flipVertical",
  
  // Stylized transitions
  DISSOLVE = "dissolve",
}

// ==========================================
// AUDIO TRANSITION TYPES
// ==========================================

export enum AudioTransitionType {
  // Crossfade types
  CROSSFADE_LINEAR = "crossfadeLinear",
  CROSSFADE_CONSTANT_POWER = "crossfadeConstantPower",
  CROSSFADE_EXPONENTIAL = "crossfadeExponential",
  
  // Single-sided fades
  FADE_IN_LINEAR = "fadeInLinear",
  FADE_OUT_LINEAR = "fadeOutLinear",
}

// ==========================================
// TRANSITION CONFIGURATION TYPES
// ==========================================

export type TransitionPosition = "start" | "end" | "between";

/**
 * Easing preset types (like Premiere Pro)
 * These map to specific bezier curves
 */
export enum EasingPreset {
  LINEAR = "linear",
  EASE = "ease",
  EASE_IN = "easeIn",
  EASE_OUT = "easeOut",
  EASE_IN_OUT = "easeInOut",
  // More dramatic easings
  EASE_IN_CUBIC = "easeInCubic",
  EASE_OUT_CUBIC = "easeOutCubic",
  EASE_IN_OUT_CUBIC = "easeInOutCubic",
  EASE_IN_EXPO = "easeInExpo",
  EASE_OUT_EXPO = "easeOutExpo",
  EASE_IN_OUT_EXPO = "easeInOutExpo",
  // Custom bezier
  CUSTOM = "custom",
}

/**
 * Easing configuration for transitions
 */
export interface TransitionEasing {
  /** Preset easing type */
  preset: EasingPreset;
  /** Custom bezier control points (only used when preset is CUSTOM) */
  bezier?: [number, number, number, number]; // [x1, y1, x2, y2]
}

/**
 * Bezier curve definitions for each easing preset
 */
export const EASING_BEZIER_CURVES: Record<Exclude<EasingPreset, EasingPreset.CUSTOM>, [number, number, number, number]> = {
  [EasingPreset.LINEAR]: [0, 0, 1, 1],
  [EasingPreset.EASE]: [0.25, 0.1, 0.25, 1],
  [EasingPreset.EASE_IN]: [0.42, 0, 1, 1],
  [EasingPreset.EASE_OUT]: [0, 0, 0.58, 1],
  [EasingPreset.EASE_IN_OUT]: [0.42, 0, 0.58, 1],
  [EasingPreset.EASE_IN_CUBIC]: [0.55, 0.055, 0.675, 0.19],
  [EasingPreset.EASE_OUT_CUBIC]: [0.215, 0.61, 0.355, 1],
  [EasingPreset.EASE_IN_OUT_CUBIC]: [0.645, 0.045, 0.355, 1],
  [EasingPreset.EASE_IN_EXPO]: [0.95, 0.05, 0.795, 0.035],
  [EasingPreset.EASE_OUT_EXPO]: [0.19, 1, 0.22, 1],
  [EasingPreset.EASE_IN_OUT_EXPO]: [1, 0, 0, 1],
};

/**
 * Human-readable names for easing presets
 */
export const EASING_PRESET_NAMES: Record<EasingPreset, string> = {
  [EasingPreset.LINEAR]: "Linear",
  [EasingPreset.EASE]: "Ease",
  [EasingPreset.EASE_IN]: "Ease In",
  [EasingPreset.EASE_OUT]: "Ease Out",
  [EasingPreset.EASE_IN_OUT]: "Ease In Out",
  [EasingPreset.EASE_IN_CUBIC]: "Ease In (Strong)",
  [EasingPreset.EASE_OUT_CUBIC]: "Ease Out (Strong)",
  [EasingPreset.EASE_IN_OUT_CUBIC]: "Ease In Out (Strong)",
  [EasingPreset.EASE_IN_EXPO]: "Ease In (Dramatic)",
  [EasingPreset.EASE_OUT_EXPO]: "Ease Out (Dramatic)",
  [EasingPreset.EASE_IN_OUT_EXPO]: "Ease In Out (Dramatic)",
  [EasingPreset.CUSTOM]: "Custom Bezier",
};

/**
 * Video transition configuration for Remotion rendering.
 * Used by TransitionWrapper in layer.tsx to apply visual effects.
 * 
 * All transition types (crossfade, wipe, slide, zoom, etc.) are handled uniformly.
 * The _absoluteStartTime and _absoluteEndTime fields determine when the effect plays.
 */
export interface VideoTransition {
  type: VideoTransitionType;
  /** Duration in seconds - derived from endTime - startTime */
  duration: number;
  /** Position: 'in', 'out', or 'between' */
  position: TransitionPosition;
  /** Easing configuration (defaults to linear if not specified) */
  easing?: TransitionEasing;
  /** For rendering: duration in frames (computed from duration * fps) */
  durationInFrames?: number;
  /** Absolute timeline start time in seconds - when the transition effect begins */
  _absoluteStartTime?: number;
  /** Absolute timeline end time in seconds - when the transition effect ends */
  _absoluteEndTime?: number;
  /** Flag indicating this is a between-clip transition */
  _isBetween?: boolean;
}

/**
 * Audio transition configuration for Remotion rendering.
 * Used by SoundLayerContent to apply volume fading.
 * 
 * All audio transitions fade volume over the specified duration.
 */
export interface AudioTransition {
  type: AudioTransitionType;
  /** Duration in seconds - derived from endTime - startTime */
  duration: number;
  /** Position: 'in', 'out', or 'between' */
  position: TransitionPosition;
  /** Easing configuration (defaults to linear if not specified) */
  easing?: TransitionEasing;
  /** For rendering: duration in frames (computed from duration * fps) */
  durationInFrames?: number;
  /** Absolute timeline start time in seconds - when the transition effect begins */
  _absoluteStartTime?: number;
  /** Absolute timeline end time in seconds - when the transition effect ends */
  _absoluteEndTime?: number;
  /** Flag indicating this is a between-clip transition */
  _isBetween?: boolean;
}

// ============================================================
// OVERLAY TYPES (Remotion Rendering)
// ============================================================

/**
 * Base overlay properties for Remotion rendering
 */
type BaseOverlay = {
  id: number;
  durationInFrames: number;
  from: number;
  height: number;
  row: number;
  left: number;
  top: number;
  width: number;
  isDragging: boolean;
  rotation: number;
  type: OverlayType;
  /** ID of linked overlay (for video/audio pairs) - like Premiere Pro's link feature */
  linkedOverlayId?: number;
  /** Additional data for overlay-specific properties */
  data?: any;
  /** Keyframe animation data - enables animating any property over time */
  keyframes?: PropertyKeyframes[];
};

// Base style properties
type BaseStyles = {
  opacity?: number;
  zIndex?: number;
  transform?: string;
  colorGrading?: any;
  mixBlendMode?: string;
};

// Base animation type
type AnimationConfig = {
  enter?: string;
  exit?: string;
};

// 3D layout configuration type
type Layout3DConfig = {
  layout?: string;
};

// Text overlay specific
export type TextOverlay = BaseOverlay & {
  type: OverlayType.TEXT;
  content: string;
  styles: BaseStyles & {
    fontSize: string;
    fontWeight: string;
    color: string;
    backgroundColor: string;
    fontFamily: string;
    fontStyle: string;
    textDecoration: string;
    lineHeight?: string;
    letterSpacing?: string;
    textAlign?: "left" | "center" | "right";
    /** Legacy text shadow (single shadow). Prefer textShadows array for multiple shadows support. */
    textShadow?: string;
    padding?: string;
    paddingBackgroundColor?: string;
    borderRadius?: string;
    boxShadow?: string;
    background?: string;
    WebkitBackgroundClip?: string;
    WebkitTextFillColor?: string;
    backdropFilter?: string;
    border?: string;
    animation?: AnimationConfig;
    fontSizeScale?: number; // Scale factor for font size (1.0 = 100%, 0.5 = 50%, 2.0 = 200%)
    /** Text stroke/outline configuration */
    textStroke?: {
      width: number;
      color: string;
    };
    /** Advanced text shadows (multiple shadows support) */
    textShadows?: import("./shadows").Shadow[];
    /** Gradient fill for text */
    textGradient?: import("./gradients").Gradient;
    /** Glow effect configuration */
    glowEffect?: {
      color: string;
      intensity: number;
    };
    /** Per-character animation preset */
    characterAnimation?: {
      preset: 'fadeIn' | 'slideIn' | 'scaleIn' | 'rotateIn' | 'wave' | 'typewriter';
      duration: number; // Duration per character in frames
      stagger: number; // Delay between characters in frames
    };
  };
};

// Shape overlay specific
export type ShapeOverlay = BaseOverlay & {
  type: OverlayType.SHAPE;
  content: string;
  /**
   * Effects stack (Premiere Pro style)
   * Each effect can have its own masks that constrain where the effect applies.
   */
  effects?: import("./effects").Effect[];
  styles: BaseStyles & {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    borderRadius?: string;
    boxShadow?: string;
    /** Legacy gradient string. Prefer gradientConfig for full gradient customization. */
    gradient?: string;
    /** Gradient configuration with full control over type, colors, and direction */
    gradientConfig?: import("./gradients").Gradient;
    /** Drop shadow configuration */
    dropShadow?: import("./shadows").Shadow;
    /** Inner shadow configuration */
    innerShadow?: import("./shadows").Shadow;
    /** Multiple shadows support */
    shadows?: import("./shadows").Shadow[];
  };
};

// Template creator type
export type TemplateCreator = {
  name: string;
  avatar: string;
};

// Template overlay type
export interface TemplateOverlay {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  createdBy: TemplateCreator;
  category: string;
  tags: string[];
  thumbnail?: string;
  duration: number;
  aspectRatio?: AspectRatio;
  overlays: Overlay[];
}

// Greenscreen removal configuration
export type GreenscreenConfig = {
  enabled: boolean;
  sensitivity?: number; // 0-255, higher = more aggressive removal (default: 100)
  threshold?: {
    red?: number; // Max red value to consider as green (default: 100)
    green?: number; // Min green value to consider as green (default: 100)
    blue?: number; // Max blue value to consider as green (default: 100)
  };
  smoothing?: number; // 0-10, edge smoothing amount (default: 0)
  spill?: number; // 0-1, green spill removal amount (default: 0)
};

export type OverlayMediaSegment = {
  startFrame: number; // ABSOLUTE source frame (inclusive)
  endFrame: number; // ABSOLUTE source frame (exclusive)
  speed?: number; // optional; default 1
};
// Clip overlay specific
export type ClipOverlay = BaseOverlay & {
  type: OverlayType.VIDEO;
  content: string;
  src: string;
  videoStartTime?: number;
  speed?: number;
  segments?: OverlayMediaSegment[]; // ordered list of source slices to play
  mediaSrcDuration?: number; // in seconds - total duration of the source media file
  greenscreen?: GreenscreenConfig; // Greenscreen removal configuration
  // Transition properties
  inTransition?: VideoTransition; // Transition at the start of the clip
  outTransition?: VideoTransition; // Transition at the end of the clip
  /**
   * Effects stack (Premiere Pro style)
   * Includes built-in effects (Motion, Opacity) and user-added effects.
   * Each effect can have its own masks that constrain where the effect applies.
   */
  effects?: import("./effects").Effect[];
  /** Legacy masks array. For Premiere Pro-style workflow, use effects[].masks instead. */
  masks?: import("./masks").Mask[];
  styles: BaseStyles & {
    objectFit?: "contain" | "cover" | "fill" | "none" | "scale-down";
    objectPosition?: string;
    volume?: number;
    borderRadius?: string;
    filter?: string;
    boxShadow?: string;
    border?: string;
    padding?: string;
    paddingBackgroundColor?: string;
    animation?: AnimationConfig; // Using shared type
    // Crop properties
    cropEnabled?: boolean;
    cropX?: number; // Crop X position as percentage (0-100)
    cropY?: number; // Crop Y position as percentage (0-100)
    cropWidth?: number; // Crop width as percentage (0-100)
    cropHeight?: number; // Crop height as percentage (0-100)
    clipPath?: string; // Generated CSS clipPath
  };
};

// Sound overlay specific
export type SoundOverlay = BaseOverlay & {
  type: OverlayType.SOUND;
  content: string;
  src: string;
  startFromSound?: number; // Frame to start from in source audio
  endAtSound?: number; // Frame to end at in source audio (for trimming)
  videoDurationInFrames?: number;
  mediaSrcDuration?: number; // in seconds - total duration of the source media file
  playbackRate?: number; // Playback speed (0.25 - 4.0)
  toneFrequency?: number; // Pitch control (0.5 - 2.0, 1.0 = normal)
  // Audio effects (EQ, Compressor, Reverb, etc.)
  audioEffects?: AudioEffect[];
  // Transition properties
  inTransition?: AudioTransition; // Transition at the start of the audio
  outTransition?: AudioTransition; // Transition at the end of the audio
  styles: BaseStyles & {
    volumeDb?: number; // Volume in decibels (-60 to +12 dB, 0 = unity)
    volume?: number; // Linear volume (for backwards compatibility)
  };
};

export type StickerCategory =
  | "Shapes"
  | "Discounts"
  | "Emojis"
  | "Reviews"
  | "Default";

export type CaptionWord = {
  word: string;
  startMs: number;
  endMs: number;
  confidence: number;
};

export type Caption = {
  text: string;
  startMs: number;
  endMs: number;
  timestampMs: number | null;
  confidence: number | null;
  words: CaptionWord[];
};

// Update CaptionOverlay to include styling for highlighted words
export interface CaptionStyles {
  fontFamily: string;
  fontSize: string;
  lineHeight: number;
  textAlign: "left" | "center" | "right";
  color: string;
  backgroundColor?: string;
  background?: string;
  backdropFilter?: string;
  padding?: string;
  fontWeight?: number | string;
  letterSpacing?: string;
  textShadow?: string;
  borderRadius?: string;
  transition?: string;
  highlightStyle?: {
    backgroundColor?: string;
    color?: string;
    scale?: number;
    fontWeight?: number;
    textShadow?: string;
    padding?: string;
    borderRadius?: string;
    transition?: string;
    background?: string;
    border?: string;
    backdropFilter?: string;
  };
}

export interface CaptionOverlay extends BaseOverlay {
  type: OverlayType.CAPTION;
  captions: Caption[];
  styles?: CaptionStyles;
  template?: string;
}

// Sticker overlay specific
export type StickerOverlay = BaseOverlay & {
  type: OverlayType.STICKER;
  content: string;
  category: import("./sticker-templates").StickerCategory;
  styles: BaseStyles & {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    scale?: number;
    filter?: string;
    animation?: AnimationConfig;
  };
};

/**
 * Overlay union type for Remotion rendering
 */
export type Overlay =
  | TextOverlay
  | ImageOverlay
  | ShapeOverlay
  | ClipOverlay
  | SoundOverlay
  | CaptionOverlay
  | StickerOverlay
  | MotionGraphicsOverlay;

/**
 * Visual overlay union type — all overlays except sound that have visual/style properties
 */
export type VisualOverlay =
  | TextOverlay
  | ImageOverlay
  | ShapeOverlay
  | ClipOverlay
  | CaptionOverlay
  | StickerOverlay
  | MotionGraphicsOverlay;

export type MainProps = {
  readonly overlays: Overlay[];
  readonly setSelectedOverlay: React.Dispatch<
    React.SetStateAction<number | null>
  >;
  readonly selectedOverlay: number | null;
  readonly changeOverlay: (
    overlayId: number,
    updater: (overlay: Overlay) => Overlay
  ) => void;
};

import { z } from "zod";

// Base interface for all timeline items
interface TimelineItem {
  id: string;
  start: number;
  duration: number;
  row: number;
}

// Clip specific properties
export interface Video extends TimelineItem {
  type: OverlayType.VIDEO;
  src: string;
  videoStartTime?: number;
}

// Sound specific properties
export interface Sound extends TimelineItem {
  type: OverlayType.SOUND;
  file: string;
  content: string;
  startFromSound: number;
}

// Base interface for layers
interface Layer extends TimelineItem {
  position: { x: number; y: number };
}

// Text layer specific properties
export interface TextLayer extends Layer {
  type: OverlayType.TEXT;
  text: string;
  fontSize: number;
  fontColor: string;
  fontFamily: string;
  backgroundColor: string;
}

// Shape layer specific properties
export interface ShapeLayer extends Layer {
  type: OverlayType.SHAPE;
  shapeType: "rectangle" | "circle" | "triangle";
  color: string;
  size: { width: number; height: number };
}

// Image layer specific properties
export interface ImageLayer extends Layer {
  type: OverlayType.IMAGE;
  src: string;
  size: { width: number; height: number };
}

// Union type for all possible layers
export type LayerItem = TextLayer | ShapeLayer | ImageLayer;

// Union type for all timeline items
export type TimelineItemUnion = Video | Sound | LayerItem;

// Type for the selected item in the editor
export type SelectedItem = TimelineItemUnion | null;

// Zod schema for composition props

export const CompositionProps = z.object({
  overlays: z.array(z.any()), // Replace with your actual Overlay type
  durationInFrames: z.number(),
  width: z.number(),
  height: z.number(),
  fps: z.number(),
  src: z.string(),
});

// Other types remain the same
export const RenderRequest = z.object({
  id: z.string(),
  inputProps: CompositionProps,
});

export const ProgressRequest = z.object({
  bucketName: z.string(),
  id: z.string(),
});

export type ProgressResponse =
  | { type: "error"; message: string }
  | { type: "progress"; progress: number }
  | { type: "done"; url: string; size: number };

// Additional types
export interface PexelsMedia {
  id: string;
  duration?: number;
  image?: string;
  video_files?: { link: string }[];
}

export interface PexelsAudio {
  id: string;
  title: string;
  artist: string;
  audio_url: string;
  duration: number;
}

export interface LocalSound {
  id: string;
  title: string;
  artist: string;
  file: string;
  duration: number;
}

export type LocalClip = {
  id: string;
  title: string;
  thumbnail: string;
  duration: number;
  videoUrl: string;
};

export type AspectRatio = "16:9" | "1:1" | "4:5" | "9:16";

export type ResolutionPreset = "720p" | "1080p" | "1440p" | "4K";

export interface TimelineRow {
  id: number;
  index: number;
}

export interface WaveformData {
  peaks: number[];
  length: number;
}

// Update EditorContextType
export interface EditorContextType {
  // ... existing context properties ...
  rows: TimelineRow[];
  addRow: () => void;
}

// Update ImageStyles interface to match ClipOverlay style pattern
/**
 * ImageStyles interface defining all the style properties available for image overlays
 *
 * @property filter - CSS filter string applying visual effects (can use presets or custom values)
 * @property borderRadius - Border radius for rounded corners
 * @property objectFit - How the image should be resized/positioned within its container
 * @property objectPosition - Positioning of the image within its container
 * @property boxShadow - CSS box-shadow property for drop shadows
 * @property border - CSS border property for image borders
 * @property animation - Enter/exit animation configuration
 * @property layout3D - 3D layout transformation configuration
 */
export interface ImageStyles extends BaseStyles {
  filter?: string;
  borderRadius?: string;
  objectFit?: "contain" | "cover" | "fill" | "none" | "scale-down";
  objectPosition?: string;
  boxShadow?: string;
  border?: string;
  padding?: string;
  paddingBackgroundColor?: string;
  animation?: AnimationConfig;
  layout3D?: Layout3DConfig;
  // Crop properties
  cropEnabled?: boolean;
  cropX?: number; // Crop X position as percentage (0-100)
  cropY?: number; // Crop Y position as percentage (0-100)
  cropWidth?: number; // Crop width as percentage (0-100)
  cropHeight?: number; // Crop height as percentage (0-100)
  clipPath?: string; // Generated CSS clipPath
}

// Update ImageOverlay to match ClipOverlay pattern
export interface ImageOverlay extends BaseOverlay {
  type: OverlayType.IMAGE;
  src: string;
  content?: string; // Optional thumbnail/preview
  greenscreen?: GreenscreenConfig; // Greenscreen removal configuration
  // Transition properties
  inTransition?: VideoTransition; // Transition at the start of the image
  outTransition?: VideoTransition; // Transition at the end of the image
  /**
   * Effects stack (Premiere Pro style)
   * Includes built-in effects (Motion, Opacity) and user-added effects.
   * Each effect can have its own masks that constrain where the effect applies.
   */
  effects?: import("./effects").Effect[];
  /** Legacy masks array. For Premiere Pro-style workflow, use effects[].masks instead. */
  masks?: import("./masks").Mask[];
  styles: ImageStyles;
}

// Local media file interface
export interface LocalMediaFile extends AudioNormalizationMetadata {
  id: string;
  name: string;
  type: "video" | "image" | "audio";
  path: string;         // Public URL (S3 or blob)
  size: number;
  lastModified: number;
  thumbnail?: string;
  duration?: number;
  // S3-specific fields (optional for backwards compatibility)
  s3Key?: string;       // S3 object key
  width?: number;       // Video/image width
  height?: number;      // Video/image height
  /** 'upload' for user uploads, 'generated' for pipeline-generated media */
  source?: 'upload' | 'generated';
}

// Re-export keyframe types
export * from './keyframes';

// Re-export render clip types
export * from './render-clip';

// Re-export motion graphics types
export * from './motion-graphics';

// Re-export composition types
export * from './composition';
