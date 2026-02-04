/**
 * Motion Graphics Types
 * 
 * Type definitions for the AI-powered motion graphics system.
 * Includes templates, editable properties, and Mapbox integration.
 * 
 * NEW ARCHITECTURE (Single Source of Truth):
 * - CompositionDefinition is the single source of truth for motion graphics
 * - AI generates CompositionDefinition directly (not remotionCode)
 * - remotionCode is generated on demand for export using serializeToRemotionCode()
 * - Templates should always have compositionDefinition; remotionCode is optional/legacy
 */

import type { PropertyKeyframes } from './keyframes';
import type { CompositionDefinition } from './composition';

// ==========================================
// ENUMS
// ==========================================

/**
 * Categories for motion graphics templates
 */
export enum MotionGraphicsCategory {
  TEXT_ANIMATION = 'text-animation',
  LOWER_THIRD = 'lower-third',
  TITLE_CARD = 'title-card',
  CALL_TO_ACTION = 'call-to-action',
  MAP_ANIMATION = 'map-animation',
  DATA_VISUALIZATION = 'data-visualization',
  SOCIAL_MEDIA = 'social-media',
  COUNTDOWN = 'countdown',
  LOGO_REVEAL = 'logo-reveal',
  CUSTOM = 'custom',
}

/**
 * Human-readable names for categories
 */
export const MOTION_GRAPHICS_CATEGORY_NAMES: Record<MotionGraphicsCategory, string> = {
  [MotionGraphicsCategory.TEXT_ANIMATION]: 'Text Animation',
  [MotionGraphicsCategory.LOWER_THIRD]: 'Lower Third',
  [MotionGraphicsCategory.TITLE_CARD]: 'Title Card',
  [MotionGraphicsCategory.CALL_TO_ACTION]: 'Call to Action',
  [MotionGraphicsCategory.MAP_ANIMATION]: 'Map Animation',
  [MotionGraphicsCategory.DATA_VISUALIZATION]: 'Data Visualization',
  [MotionGraphicsCategory.SOCIAL_MEDIA]: 'Social Media',
  [MotionGraphicsCategory.COUNTDOWN]: 'Countdown',
  [MotionGraphicsCategory.LOGO_REVEAL]: 'Logo Reveal',
  [MotionGraphicsCategory.CUSTOM]: 'Custom',
};

// ==========================================
// EDITABLE PROPERTIES
// ==========================================

/**
 * Types of editable properties
 */
export type EditablePropertyType = 
  | 'text' 
  | 'color' 
  | 'number' 
  | 'select' 
  | 'font' 
  | 'location'
  | 'boolean'
  | 'image'
  | 'gradient';

/**
 * An editable property that can be customized in the inspector
 */
export interface EditableProperty {
  /** Unique identifier for the property */
  id: string;
  /** Display label in the inspector */
  label: string;
  /** Type of input control to render */
  type: EditablePropertyType;
  /** Current value */
  value: any;
  /** Default value for reset functionality */
  defaultValue?: any;
  /** Description/tooltip text */
  description?: string;
  /** Options for select type */
  options?: { label: string; value: any }[];
  /** Minimum value for number type */
  min?: number;
  /** Maximum value for number type */
  max?: number;
  /** Step value for number type */
  step?: number;
  /** Whether this property can be keyframed */
  keyframeable?: boolean;
  /** Group name for organizing properties */
  group?: string;
  /** Property path for nested updates (e.g., 'styles.fontSize') */
  propertyPath?: string;
}

/**
 * Group of editable properties
 */
export interface EditablePropertyGroup {
  id: string;
  label: string;
  properties: EditableProperty[];
  collapsed?: boolean;
}

// ==========================================
// MAPBOX CONFIGURATION
// ==========================================

/**
 * Mapbox marker configuration
 */
export interface MapboxMarker {
  /** Marker ID */
  id: string;
  /** Longitude, Latitude */
  coordinates: [number, number];
  /** Marker label/name */
  label?: string;
  /** Marker color */
  color?: string;
  /** Custom icon URL */
  iconUrl?: string;
  /** Entry animation delay (in frames) */
  entryDelay?: number;
}

/**
 * Mapbox animation types
 */
export type MapboxAnimationType = 
  | 'flyTo'    // Cinematic flight between locations
  | 'route'    // Animated path along a route
  | 'markers'  // Sequential marker animations
  | 'static'   // Static map with optional overlays
  | 'zoom'     // Dramatic zoom in/out
  | 'pan'      // Smooth pan across a region
  | 'reveal';  // Reveal animation with effects

/**
 * Mapbox style presets
 */
export type MapboxStylePreset = 
  | 'streets-v12'
  | 'outdoors-v12'
  | 'light-v11'
  | 'dark-v11'
  | 'satellite-v9'
  | 'satellite-streets-v12';

/**
 * Mapbox configuration for map-based motion graphics
 */
export interface MapboxConfig {
  /** Map center [longitude, latitude] */
  center: [number, number];
  /** Zoom level (0-22) */
  zoom: number;
  /** Map style preset or custom style URL */
  style: MapboxStylePreset | string;
  /** Pitch angle (0-60) */
  pitch?: number;
  /** Bearing/rotation angle (0-360) */
  bearing?: number;
  /** Markers to display on map */
  markers?: MapboxMarker[];
  /** Route coordinates for route animation */
  route?: [number, number][];
  /** Animation type */
  animationType: MapboxAnimationType;
  /** Destination for flyTo animation */
  flyToDestination?: [number, number];
  /** Destination zoom for flyTo animation */
  flyToZoom?: number;
  /** Animation duration in frames */
  animationDuration?: number;
  
  // Airplane configuration for flyTo animations
  /** Whether to show animated airplane (default: true for flyTo) */
  showAirplane?: boolean;
  /** Airplane icon color */
  airplaneColor?: string;
  /** Airplane icon size in pixels */
  airplaneSize?: number;
  /** Whether to show flight path trail behind airplane */
  showFlightPath?: boolean;
  /** Color of the flight path trail */
  flightPathColor?: string;
}

// ==========================================
// MOTION GRAPHICS TEMPLATE
// ==========================================

/**
 * A motion graphics template that can be instantiated
 * 
 * NEW ARCHITECTURE (Single Source of Truth):
 * - compositionDefinition is the PRIMARY source of truth
 * - remotionCode is OPTIONAL and only used for:
 *   - Legacy built-in templates
 *   - Export (generated on demand via serializeToRemotionCode)
 */
export interface MotionGraphicsTemplate {
  /** Unique template ID */
  id: string;
  /** Display name */
  name: string;
  /** Description of the template */
  description: string;
  /** Category for organization */
  category: MotionGraphicsCategory;
  /** Tags for search */
  tags?: string[];
  /** Thumbnail URL or data URI */
  thumbnail?: string;
  /** Default duration in frames */
  duration: number;
  /** Editable properties for customization */
  editableProperties: EditableProperty[];
  /** Property groups for organization */
  propertyGroups?: EditablePropertyGroup[];
  /** 
   * Structured composition definition with layers.
   * 
   * PRIMARY SOURCE OF TRUTH for AI-generated motion graphics.
   * This defines the editable layer structure for the composition editor.
   * CompositionRenderer uses this directly for preview and playback.
   */
  compositionDefinition?: CompositionDefinition;
  /** 
   * The Remotion component code (compiled or source)
   * 
   * OPTIONAL/LEGACY - Only needed for:
   * - Built-in templates that predate the new architecture
   * - Export (can be generated from compositionDefinition via serializeToRemotionCode)
   * 
   * For new AI-generated templates, this field may be undefined.
   * Use serializeToRemotionCode(compositionDefinition) to generate when needed.
   */
  remotionCode?: string;
  /** Mapbox configuration for map animations */
  mapboxConfig?: MapboxConfig;
  /** Whether this is a built-in template */
  isBuiltIn?: boolean;
  /** Whether this template requires pro subscription */
  isPro?: boolean;
  /** Creation timestamp */
  createdAt?: string;
  /** Last update timestamp */
  updatedAt?: string;
  /** Author information */
  author?: {
    id: string;
    name: string;
    avatar?: string;
  };
}

// ==========================================
// MOTION GRAPHICS OVERLAY
// ==========================================

/**
 * Base overlay properties (matches existing pattern)
 */
type BaseMotionGraphicsOverlay = {
  id: number;
  durationInFrames: number;
  from: number;
  height: number;
  width: number;
  left: number;
  top: number;
  row: number;
  rotation: number;
  isDragging: boolean;
  /** Keyframe animation data */
  keyframes?: PropertyKeyframes[];
};

/**
 * Motion Graphics overlay for Remotion rendering
 */
export interface MotionGraphicsOverlay extends BaseMotionGraphicsOverlay {
  type: 'motion-graphics';
  /** Reference to the template */
  templateId: string;
  /** The template data (for rendering) */
  template: MotionGraphicsTemplate;
  /** Current property values (overrides template defaults) */
  propertyValues: Record<string, any>;
  /** 
   * Composition definition with layers (takes precedence over remotionCode for rendering).
   * Can be from template.compositionDefinition or from clip.properties.compositionDefinition.
   */
  compositionDefinition?: CompositionDefinition;
  /** Mapbox configuration (can override template) */
  mapboxConfig?: MapboxConfig;
  /** Styles */
  styles: {
    opacity?: number;
    zIndex?: number;
    transform?: string;
  };
}

// ==========================================
// AI CHAT TYPES
// ==========================================

/**
 * Role in the chat conversation
 */
export type ChatRole = 'user' | 'assistant' | 'system';

/**
 * A message in the AI chat
 */
export interface ChatMessage {
  /** Unique message ID */
  id: string;
  /** Message role */
  role: ChatRole;
  /** Message content */
  content: string;
  /** Timestamp */
  timestamp: string;
  /** Generated template (for assistant messages) */
  generatedTemplate?: MotionGraphicsTemplate;
  /** Error message if generation failed */
  error?: string;
  /** Whether the message is still being generated */
  isStreaming?: boolean;
}

/**
 * Request to generate motion graphics
 */
export interface GenerateMotionGraphicsRequest {
  /** User's prompt */
  prompt: string;
  /** Conversation history for context */
  conversationHistory?: ChatMessage[];
  /** Selected clip ID if modifying existing */
  selectedClipId?: string;
  /** Current template if modifying */
  currentTemplate?: MotionGraphicsTemplate;
  /** Preferred category */
  category?: MotionGraphicsCategory;
  /** Target duration in frames */
  targetDuration?: number;
  /** Canvas dimensions */
  canvasDimensions?: {
    width: number;
    height: number;
  };
}

/**
 * Response from motion graphics generation
 */
export interface GenerateMotionGraphicsResponse {
  /** Whether generation was successful */
  success: boolean;
  /** Generated template */
  template?: MotionGraphicsTemplate;
  /** Error message if failed */
  error?: string;
  /** Assistant's response message */
  message?: string;
}

// ==========================================
// MOTION GRAPHICS STATE
// ==========================================

/**
 * Motion graphics state for the store
 */
export interface MotionGraphicsState {
  /** Current chat messages */
  chatMessages: ChatMessage[];
  /** Saved user templates */
  savedTemplates: MotionGraphicsTemplate[];
  /** Currently selected template for preview */
  selectedTemplateId: string | null;
  /** Whether AI is currently generating */
  isGenerating: boolean;
  /** Generation progress (0-100) */
  generationProgress: number;
  /** Current generation error */
  generationError: string | null;
  /** Active category filter */
  categoryFilter: MotionGraphicsCategory | 'all';
  /** Search query */
  searchQuery: string;
}

/**
 * Motion graphics actions for the store
 */
export interface MotionGraphicsActions {
  /** Add a chat message */
  addChatMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  /** Clear chat history */
  clearChatHistory: () => void;
  /** Add a motion graphics clip to the timeline */
  addMotionGraphicsClip: (template: MotionGraphicsTemplate, position?: { x: number; y: number }) => void;
  /** Update a property value on a motion graphics clip */
  updateMotionGraphicsProperty: (clipId: string, propertyId: string, value: any) => void;
  /** Save current clip as a template */
  saveAsMotionGraphicsTemplate: (clipId: string, name: string, description?: string) => void;
  /** Delete a saved template */
  deleteMotionGraphicsTemplate: (templateId: string) => void;
  /** Set generation state */
  setGenerating: (isGenerating: boolean, progress?: number) => void;
  /** Set generation error */
  setGenerationError: (error: string | null) => void;
  /** Set category filter */
  setCategoryFilter: (category: MotionGraphicsCategory | 'all') => void;
  /** Set search query */
  setSearchQuery: (query: string) => void;
  /** Select a template for preview */
  selectTemplate: (templateId: string | null) => void;
}

// ==========================================
// UTILITY TYPES
// ==========================================

/**
 * Helper type for creating a new template
 */
export type NewMotionGraphicsTemplate = Omit<MotionGraphicsTemplate, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Helper type for updating a template
 */
export type UpdateMotionGraphicsTemplate = Partial<Omit<MotionGraphicsTemplate, 'id'>>;

/**
 * Default values for motion graphics state
 */
export const DEFAULT_MOTION_GRAPHICS_STATE: MotionGraphicsState = {
  chatMessages: [],
  savedTemplates: [],
  selectedTemplateId: null,
  isGenerating: false,
  generationProgress: 0,
  generationError: null,
  categoryFilter: 'all',
  searchQuery: '',
};
