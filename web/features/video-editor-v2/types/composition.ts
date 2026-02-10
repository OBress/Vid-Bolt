/**
 * ============================================================
 * COMPOSITION TYPES - After Effects Style Multi-Layer Compositions
 * ============================================================
 * 
 * Defines the data model for motion graphics compositions that can be
 * edited in the Composition Editor. Each composition contains multiple
 * layers (text, shapes, images, solids) that can be positioned and
 * animated independently.
 * 
 * TIME UNIT CONVENTION:
 * - CompositionLayer.startTime: FRAMES (relative to composition start)
 * - CompositionLayer.duration: FRAMES
 * - Keyframe.time: SECONDS (relative to layer start)
 * - Use framesToSeconds() and secondsToFrames() from time-conversion.ts
 * 
 * This follows After Effects/Premiere Pro patterns:
 * - Compositions have duration, fps, and dimensions
 * - Layers are stacked (higher index = renders on top)
 * - Each layer has transform properties and can be animated
 * - Layers can have type-specific properties
 */

import type { PropertyKeyframes, Keyframe, KeyframeInterpolation } from './keyframes';

// ============================================================
// LAYER TYPES
// ============================================================

/**
 * Types of layers that can exist in a composition
 */
export type CompositionLayerType = 
  | 'text'      // Text layer with font, size, color
  | 'shape'     // Shape layer (rectangle, ellipse, polygon, path)
  | 'image'     // Image layer
  | 'solid'     // Solid color layer
  | 'video'     // Video layer (sub-clip)
  | 'null'      // Null/control layer (for parenting)
  | 'adjustment'; // Adjustment layer (effects apply to layers below)

/**
 * Shape types for shape layers
 */
export type ShapeType = 
  | 'rectangle'
  | 'ellipse'
  | 'polygon'
  | 'star'
  | 'path';

// ============================================================
// LAYER TRANSFORM
// ============================================================

/**
 * CSS-style position (preserved from JSX parsing for reference)
 */
export interface CSSPosition {
  /** Position type */
  position?: 'absolute' | 'relative' | 'fixed';
  /** Left offset (pixels or percentage string) */
  left?: number | string;
  /** Right offset (pixels or percentage string) */
  right?: number | string;
  /** Top offset (pixels or percentage string) */
  top?: number | string;
  /** Bottom offset (pixels or percentage string) */
  bottom?: number | string;
}

/**
 * Transform properties for a layer
 * All values can be animated via keyframes
 */
export interface LayerTransform {
  /** X position (pixels from left) */
  x: number;
  
  /** Y position (pixels from top) */
  y: number;
  
  /** Anchor point X (relative to layer bounds, 0-1) */
  anchorX: number;
  
  /** Anchor point Y (relative to layer bounds, 0-1) */
  anchorY: number;
  
  /** Scale X (1 = 100%) */
  scaleX: number;
  
  /** Scale Y (1 = 100%) */
  scaleY: number;
  
  /** Rotation in degrees */
  rotation: number;
  
  /** Opacity (0-1) */
  opacity: number;
  
  /** 
   * Original CSS position (preserved from JSX parsing)
   * Used for reference and potential re-serialization to JSX
   */
  cssPosition?: CSSPosition;
}

/**
 * Default transform values
 */
export const DEFAULT_LAYER_TRANSFORM: LayerTransform = {
  x: 0,
  y: 0,
  anchorX: 0.5,
  anchorY: 0.5,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  opacity: 1,
};

// ============================================================
// LAYER TYPE-SPECIFIC PROPERTIES
// ============================================================

/**
 * Text layer properties
 */
export interface TextLayerProperties {
  /** Text content */
  text: string;
  
  /** Font family */
  fontFamily: string;
  
  /** Font size in pixels */
  fontSize: number;
  
  /** Font weight */
  fontWeight: number;
  
  /** Line height multiplier */
  lineHeight: number;
  
  /** Letter spacing in pixels */
  letterSpacing: number;
  
  /** Text color */
  color: string;
  
  /** Text alignment */
  textAlign: 'left' | 'center' | 'right';
  
  /** Vertical alignment */
  verticalAlign: 'top' | 'middle' | 'bottom';
  
  /** Background color (optional) */
  backgroundColor?: string;
  
  /** Background padding */
  padding?: number;
  
  /** Border radius (for background) */
  borderRadius?: number;
  
  /** Text shadow */
  shadow?: {
    color: string;
    offsetX: number;
    offsetY: number;
    blur: number;
  };
  
  /** Stroke/outline */
  stroke?: {
    color: string;
    width: number;
  };
}

/**
 * Default text layer properties
 */
export const DEFAULT_TEXT_PROPERTIES: TextLayerProperties = {
  text: 'Text',
  fontFamily: 'Inter',
  fontSize: 48,
  fontWeight: 600,
  lineHeight: 1.2,
  letterSpacing: 0,
  color: '#FFFFFF',
  textAlign: 'center',
  verticalAlign: 'middle',
};

/**
 * Shape layer properties
 */
export interface ShapeLayerProperties {
  /** Shape type */
  shapeType: ShapeType;
  
  /** Width of shape */
  width: number;
  
  /** Height of shape */
  height: number;
  
  /** Fill color */
  fillColor: string;
  
  /** Fill opacity (0-1) */
  fillOpacity: number;
  
  /** Stroke color */
  strokeColor?: string;
  
  /** Stroke width */
  strokeWidth?: number;
  
  /** Corner radius (for rectangle) */
  cornerRadius?: number;
  
  /** Number of sides (for polygon) */
  sides?: number;
  
  /** Inner radius ratio (for star) */
  innerRadius?: number;
  
  /** SVG path data (for path type) */
  pathData?: string;
}

/**
 * Default shape layer properties
 */
export const DEFAULT_SHAPE_PROPERTIES: ShapeLayerProperties = {
  shapeType: 'rectangle',
  width: 200,
  height: 100,
  fillColor: '#3B82F6',
  fillOpacity: 1,
  cornerRadius: 0,
};

/**
 * Image layer properties
 */
export interface ImageLayerProperties {
  /** Image source URL */
  src: string;
  
  /** Image width */
  width: number;
  
  /** Image height */
  height: number;
  
  /** Object fit */
  objectFit: 'contain' | 'cover' | 'fill' | 'none';
  
  /** Border radius */
  borderRadius?: number;
}

/**
 * Default image layer properties
 */
export const DEFAULT_IMAGE_PROPERTIES: ImageLayerProperties = {
  src: '',
  width: 200,
  height: 200,
  objectFit: 'cover',
};

/**
 * Solid layer properties
 */
export interface SolidLayerProperties {
  /** Solid color */
  color: string;
  
  /** Width */
  width: number;
  
  /** Height */
  height: number;
  
  /** Border radius */
  borderRadius?: number;
}

/**
 * Default solid layer properties
 */
export const DEFAULT_SOLID_PROPERTIES: SolidLayerProperties = {
  color: '#000000',
  width: 200,
  height: 100,
};

/**
 * Video layer properties (for nested video clips)
 */
export interface VideoLayerProperties {
  /** Video source URL */
  src: string;
  
  /** Width */
  width: number;
  
  /** Height */
  height: number;
  
  /** Start time offset in source video (seconds) */
  startOffset: number;
  
  /** Playback speed */
  speed: number;
  
  /** Volume (0-1) */
  volume: number;
  
  /** Whether to loop */
  loop: boolean;
}

/**
 * Default video layer properties
 */
export const DEFAULT_VIDEO_PROPERTIES: VideoLayerProperties = {
  src: '',
  width: 400,
  height: 225,
  startOffset: 0,
  speed: 1,
  volume: 0,
  loop: false,
};

/**
 * Union type for all layer properties
 */
export type LayerTypeProperties = 
  | { type: 'text'; properties: TextLayerProperties }
  | { type: 'shape'; properties: ShapeLayerProperties }
  | { type: 'image'; properties: ImageLayerProperties }
  | { type: 'solid'; properties: SolidLayerProperties }
  | { type: 'video'; properties: VideoLayerProperties }
  | { type: 'null'; properties: Record<string, never> }
  | { type: 'adjustment'; properties: Record<string, never> };

// ============================================================
// COMPOSITION LAYER
// ============================================================

/**
 * A single layer in a composition
 */
export interface CompositionLayer {
  /** Unique layer ID */
  id: string;
  
  /** Display name */
  name: string;
  
  /** Layer type */
  type: CompositionLayerType;
  
  /** Start time in frames (relative to composition start) */
  startTime: number;
  
  /** Duration in frames */
  duration: number;
  
  /** Transform properties */
  transform: LayerTransform;
  
  /** Type-specific properties */
  layerProperties: LayerTypeProperties;
  
  /** Keyframe animations for this layer */
  keyframes?: PropertyKeyframes[];
  
  /** Whether layer is visible */
  visible: boolean;
  
  /** Whether layer is locked (can't be edited) */
  locked: boolean;
  
  /** Whether layer is soloed (only visible layers are soloed ones) */
  solo?: boolean;
  
  /** Parent layer ID (for parenting/hierarchy) */
  parentId?: string;
  
  /** Blend mode */
  blendMode?: BlendMode;
  
  /** Track matte settings */
  trackMatte?: {
    layerId: string;
    type: 'alpha' | 'alpha-inverted' | 'luma' | 'luma-inverted';
  };
  
  /** Layer color (for organization in timeline) */
  color?: string;
  
  /** Generic properties bag for layer-specific settings */
  properties?: Record<string, any>;
}

/**
 * Available blend modes
 */
export type BlendMode = 
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion';

// ============================================================
// COMPOSITION DEFINITION
// ============================================================

/**
 * A complete composition definition
 */
export interface CompositionDefinition {
  /** Unique composition ID */
  id: string;
  
  /** Composition name */
  name: string;
  
  /** Duration in frames */
  duration: number;
  
  /** Frames per second */
  fps: number;
  
  /** Width in pixels */
  width: number;
  
  /** Height in pixels */
  height: number;
  
  /** Background color */
  backgroundColor: string;
  
  /** Layers (ordered by z-index, higher index = renders on top) */
  layers: CompositionLayer[];
  
  /** Creation timestamp */
  createdAt?: string;
  
  /** Last update timestamp */
  updatedAt?: string;
  
  /** The original Remotion code (for reference/fallback) */
  originalRemotionCode?: string;
  
  /** 
   * Flag indicating this composition was parsed from JSX code.
   * When true, the originalRemotionCode can be used for high-fidelity rendering.
   */
  generatedFromJSX?: boolean;
  
  /**
   * List of icons used in the code (extracted by backend).
   * Passed to the compiler to inject only the needed icons.
   */
  usedIcons?: string[];
}

/**
 * Default composition settings
 */
export const DEFAULT_COMPOSITION: Omit<CompositionDefinition, 'id' | 'layers'> = {
  name: 'New Composition',
  duration: 150, // 5 seconds at 30fps
  fps: 30,
  width: 1920,
  height: 1080,
  backgroundColor: 'transparent',
};

// ============================================================
// COMPOSITION EDITOR STATE
// ============================================================

/**
 * Selection state for the composition editor
 */
export interface CompositionSelectionState {
  /** Selected layer IDs */
  layerIds: string[];
  
  /** Selected keyframe IDs (within selected layer) */
  keyframeIds: string[];
  
  /** Property path being edited */
  activePropertyPath?: string;
}

/**
 * Playback state for the composition editor
 */
export interface CompositionPlaybackState {
  /** Current frame */
  currentFrame: number;
  
  /** Whether playing */
  isPlaying: boolean;
  
  /** Playback speed */
  playbackRate: number;
  
  /** Loop playback */
  loop: boolean;
  
  /** Work area start frame */
  workAreaStart?: number;
  
  /** Work area end frame */
  workAreaEnd?: number;
}

/**
 * Timeline UI state for composition editor
 */
export interface CompositionTimelineState {
  /** Zoom level (pixels per frame) */
  zoom: number;
  
  /** Scroll position (in frames) */
  scrollPosition: number;
  
  /** Track height in pixels */
  trackHeight: number;
  
  /** Collapsed layer IDs */
  collapsedLayers: string[];
}

/**
 * Complete composition editor state
 * 
 * NEW ARCHITECTURE (Single Source of Truth):
 * - composition is the single source of truth
 * - remotionCode is NO LONGER stored in state (removed)
 * - Use serializeToRemotionCode(composition) when code is needed for export
 */
export interface CompositionEditorState {
  /** Whether composition editor is open */
  isOpen: boolean;
  
  /** ID of the clip being edited (from main timeline) */
  sourceClipId: string | null;
  
  /** The composition being edited - SINGLE SOURCE OF TRUTH */
  composition: CompositionDefinition | null;
  
  /** Selection state */
  selection: CompositionSelectionState;
  
  /** Playback state */
  playback: CompositionPlaybackState;
  
  /** Timeline UI state */
  timeline: CompositionTimelineState;
  
  /** Whether there are unsaved changes */
  isDirty: boolean;
  
  /** Chat messages for AI assistance */
  chatMessages: CompositionChatMessage[];
}

/**
 * Chat message for composition AI assistant
 */
export interface CompositionChatMessage {
  /** Unique message ID */
  id: string;
  
  /** Message role */
  role: 'user' | 'assistant' | 'system';
  
  /** Message content */
  content: string;
  
  /** Timestamp */
  timestamp: string;
  
  /** Whether message is being streamed */
  isStreaming?: boolean;
  
  /** Error message if failed */
  error?: string;
}

// ============================================================
// DEFAULT STATE
// ============================================================

/**
 * Default composition editor state
 */
export const DEFAULT_COMPOSITION_EDITOR_STATE: CompositionEditorState = {
  isOpen: false,
  sourceClipId: null,
  composition: null,
  selection: {
    layerIds: [],
    keyframeIds: [],
  },
  playback: {
    currentFrame: 0,
    isPlaying: false,
    playbackRate: 1,
    loop: true,
  },
  timeline: {
    zoom: 4, // 4 pixels per frame
    scrollPosition: 0,
    trackHeight: 32,
    collapsedLayers: [],
  },
  isDirty: false,
  chatMessages: [],
};

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Generate a unique layer ID
 */
export function generateLayerId(): string {
  return `layer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate a unique composition ID
 */
export function generateCompositionId(): string {
  return `comp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a new text layer with defaults
 */
export function createTextLayer(
  name: string = 'Text Layer',
  overrides?: Partial<CompositionLayer>
): CompositionLayer {
  return {
    id: generateLayerId(),
    name,
    type: 'text',
    startTime: 0,
    duration: 150,
    transform: { ...DEFAULT_LAYER_TRANSFORM },
    layerProperties: {
      type: 'text',
      properties: { ...DEFAULT_TEXT_PROPERTIES },
    },
    visible: true,
    locked: false,
    color: '#3B82F6', // Blue
    ...overrides,
  };
}

/**
 * Create a new shape layer with defaults
 */
export function createShapeLayer(
  name: string = 'Shape Layer',
  overrides?: Partial<CompositionLayer>
): CompositionLayer {
  return {
    id: generateLayerId(),
    name,
    type: 'shape',
    startTime: 0,
    duration: 150,
    transform: { ...DEFAULT_LAYER_TRANSFORM },
    layerProperties: {
      type: 'shape',
      properties: { ...DEFAULT_SHAPE_PROPERTIES },
    },
    visible: true,
    locked: false,
    color: '#22C55E', // Green
    ...overrides,
  };
}

/**
 * Create a new solid layer with defaults
 */
export function createSolidLayer(
  name: string = 'Solid Layer',
  overrides?: Partial<CompositionLayer>
): CompositionLayer {
  return {
    id: generateLayerId(),
    name,
    type: 'solid',
    startTime: 0,
    duration: 150,
    transform: { ...DEFAULT_LAYER_TRANSFORM },
    layerProperties: {
      type: 'solid',
      properties: { ...DEFAULT_SOLID_PROPERTIES },
    },
    visible: true,
    locked: false,
    color: '#6B7280', // Gray
    ...overrides,
  };
}

/**
 * Create a new image layer with defaults
 */
export function createImageLayer(
  src: string,
  name: string = 'Image Layer',
  overrides?: Partial<CompositionLayer>
): CompositionLayer {
  return {
    id: generateLayerId(),
    name,
    type: 'image',
    startTime: 0,
    duration: 150,
    transform: { ...DEFAULT_LAYER_TRANSFORM },
    layerProperties: {
      type: 'image',
      properties: { ...DEFAULT_IMAGE_PROPERTIES, src },
    },
    visible: true,
    locked: false,
    color: '#F59E0B', // Orange
    ...overrides,
  };
}

/**
 * Create a new composition with defaults
 */
export function createComposition(
  name: string = 'New Composition',
  overrides?: Partial<CompositionDefinition>
): CompositionDefinition {
  return {
    id: generateCompositionId(),
    ...DEFAULT_COMPOSITION,
    name,
    layers: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Get the end frame of a layer
 */
export function getLayerEndFrame(layer: CompositionLayer): number {
  return layer.startTime + layer.duration;
}

/**
 * Get layers visible at a specific frame
 */
export function getLayersAtFrame(
  layers: CompositionLayer[],
  frame: number
): CompositionLayer[] {
  return layers.filter(
    layer => layer.visible && frame >= layer.startTime && frame < getLayerEndFrame(layer)
  );
}

/**
 * Sort layers by z-index (for rendering order)
 */
export function sortLayersByZIndex(layers: CompositionLayer[]): CompositionLayer[] {
  // Higher index = renders on top, so we don't need to reverse
  return [...layers];
}

/**
 * Calculate composition duration from layers
 */
export function calculateCompositionDuration(layers: CompositionLayer[]): number {
  if (layers.length === 0) return 150; // Default 5 seconds
  return Math.max(...layers.map(getLayerEndFrame));
}

/**
 * Get the layer type color
 */
export function getLayerTypeColor(type: CompositionLayerType): string {
  switch (type) {
    case 'text': return '#3B82F6'; // Blue
    case 'shape': return '#22C55E'; // Green
    case 'solid': return '#6B7280'; // Gray
    case 'image': return '#F59E0B'; // Orange
    case 'video': return '#EC4899'; // Pink
    case 'null': return '#8B5CF6'; // Purple
    case 'adjustment': return '#14B8A6'; // Teal
    default: return '#6B7280';
  }
}

/**
 * Get the layer type icon name
 */
export function getLayerTypeIcon(type: CompositionLayerType): string {
  switch (type) {
    case 'text': return 'Type';
    case 'shape': return 'Square';
    case 'solid': return 'Palette';
    case 'image': return 'Image';
    case 'video': return 'Film';
    case 'null': return 'Crosshair';
    case 'adjustment': return 'Sliders';
    default: return 'Layers';
  }
}

// ============================================================
// ANIMATABLE PROPERTIES FOR LAYERS
// ============================================================

/**
 * Standard animatable properties for composition layers
 */
export const COMPOSITION_ANIMATABLE_PROPERTIES = [
  // Transform
  { path: 'transform.x', name: 'Position X', unit: 'px', color: '#EF4444' },
  { path: 'transform.y', name: 'Position Y', unit: 'px', color: '#22C55E' },
  { path: 'transform.scaleX', name: 'Scale X', unit: '%', color: '#3B82F6' },
  { path: 'transform.scaleY', name: 'Scale Y', unit: '%', color: '#3B82F6' },
  { path: 'transform.rotation', name: 'Rotation', unit: '°', color: '#F59E0B' },
  { path: 'transform.opacity', name: 'Opacity', unit: '%', color: '#8B5CF6' },
  { path: 'transform.anchorX', name: 'Anchor X', unit: '', color: '#EC4899' },
  { path: 'transform.anchorY', name: 'Anchor Y', unit: '', color: '#EC4899' },
];
