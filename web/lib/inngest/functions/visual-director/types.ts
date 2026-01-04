/**
 * Visual Director Types
 * ============================================================================
 * Type definitions for the visual director system that plans scenes,
 * generates images, edits for consistency, and creates video clips.
 */

// ============================================================================
// CAMERA & SHOT TYPES
// ============================================================================

/**
 * Professional shot types from cinematography
 */
export type ShotType =
  | 'extreme_wide'    // Establishes vast environment
  | 'wide'            // Shows full scene context
  | 'medium_wide'     // Subject with environment
  | 'medium'          // Waist-up framing
  | 'medium_close'    // Shoulders-up framing
  | 'close_up'        // Face/detail focus
  | 'extreme_close';  // Intense detail

/**
 * Camera angles for visual storytelling
 */
export type CameraAngle =
  | 'eye_level'       // Neutral, objective
  | 'low_angle'       // Makes subject powerful
  | 'high_angle'      // Makes subject vulnerable
  | 'birds_eye'       // God's eye view
  | 'worms_eye'       // Extreme low
  | 'dutch_angle';    // Tension/unease

/**
 * Camera movements - kept SUBTLE for AI video generation compatibility
 */
export type CameraMovement =
  | 'static'          // No movement
  | 'slow_pan_left'   // Gentle horizontal left
  | 'slow_pan_right'  // Gentle horizontal right
  | 'slow_zoom_in'    // Subtle push in
  | 'slow_zoom_out'   // Subtle pull out
  | 'slow_tilt_up'    // Gentle vertical up
  | 'slow_tilt_down'  // Gentle vertical down
  | 'slow_dolly_in'   // Forward movement
  | 'slow_dolly_out'; // Backward movement

// ============================================================================
// SCENE TYPES
// ============================================================================

/**
 * Scene purpose classification
 */
export type SceneType =
  | 'establishing'    // Sets location/context
  | 'action'          // Something happening
  | 'dialogue'        // Conversation/narration focus
  | 'transition'      // Between major sections
  | 'montage'         // Rapid visual sequence
  | 'emotional_beat'; // Impactful moment

/**
 * Individual shot within a scene
 */
export interface Shot {
  /** Sequential shot number within scene (1-indexed) */
  shotIndex: number;
  
  /** Shot type classification */
  shotType: ShotType;
  
  /** Camera angle */
  cameraAngle: CameraAngle;
  
  /** Camera movement (kept subtle) */
  cameraMovement: CameraMovement;
  
  /** Duration in seconds */
  durationSeconds: number;
  
  /** Timing within parent scene */
  timing: {
    startSeconds: number;
    endSeconds: number;
  };
  
  /** Visual description for image generation */
  visualDescription: string;
  
  /** Asset references (CHAR-001, LOC-001, etc.) */
  assetReferences: string[];
  
  /** Specific visual elements to include */
  visualElements: string[];
  
  /** Lighting notes */
  lighting: {
    type: 'natural' | 'artificial' | 'mixed';
    mood: string; // "warm golden hour", "harsh fluorescent", etc.
    direction?: string; // "backlit", "side-lit", etc.
  };
  
  /** Atmosphere/mood */
  atmosphere: string;
  
  /** Whether this needs a NEW image or can EDIT existing */
  generationStrategy: 'create_new' | 'edit_existing';
  
  /** If editing, which previous shot to base on */
  editSourceShotIndex?: number;
  
  /** Motion prompt for image-to-video */
  motionPrompt: string;
}

/**
 * Scene containing multiple shots
 */
export interface Scene {
  /** Sequential scene number (1-indexed) */
  sceneIndex: number;
  
  /** Scene type classification */
  sceneType: SceneType;
  
  /** Timing */
  timing: {
    startSeconds: number;
    endSeconds: number;
    durationSeconds: number;
  };
  
  /** Beat indices this scene covers */
  beatIndices: number[];
  
  /** Primary location for this scene */
  primaryLocation: string | null;
  
  /** Characters appearing in scene */
  characters: string[];
  
  /** Scene summary for continuity */
  summary: string;
  
  /** Narration text during this scene */
  narrationText: string;
  
  /** Individual shots */
  shots: Shot[];
  
  /** Visual continuity notes from previous scene */
  continuityNotes: string;
}

// ============================================================================
// GENERATION TASK TYPES
// ============================================================================

/**
 * Task for generating a new image
 */
export interface ImageGenerationTask {
  /** Unique task ID */
  taskId: string;
  
  /** Scene and shot indices */
  sceneIndex: number;
  shotIndex: number;
  
  /** The prompt for image generation */
  prompt: string;
  
  /** Negative prompt (what to avoid) */
  negativePrompt: string;
  
  /** Aspect ratio */
  aspectRatio: '16:9' | '9:16' | '1:1';
  
  /** Style guidance */
  style: string;
  
  /** Reference image URLs for consistency */
  referenceImages: string[];
  
  /** Asset profiles to maintain consistency */
  assetProfiles: Array<{
    assetId: string;
    consistencyAnchors: string[];
  }>;
  
  /** Status */
  status: 'pending' | 'processing' | 'completed' | 'failed';
  
  /** Result URL when completed */
  resultUrl?: string;
}

/**
 * Task for editing an existing image
 */
export interface ImageEditingTask {
  /** Unique task ID */
  taskId: string;
  
  /** Scene and shot indices */
  sceneIndex: number;
  shotIndex: number;
  
  /** Source image to edit */
  sourceImageUrl: string;
  
  /** Edit instructions */
  editPrompt: string;
  
  /** What to preserve from the original */
  preserveElements: string[];
  
  /** What to change */
  changeElements: string[];
  
  /** Status */
  status: 'pending' | 'processing' | 'completed' | 'failed';
  
  /** Result URL when completed */
  resultUrl?: string;
}

/**
 * Task for converting image to video
 */
export interface VideoGenerationTask {
  /** Unique task ID */
  taskId: string;
  
  /** Scene and shot indices */
  sceneIndex: number;
  shotIndex: number;
  
  /** Start frame image URL */
  startFrameUrl: string;
  
  /** Motion description (kept subtle) */
  motionPrompt: string;
  
  /** Duration in seconds */
  durationSeconds: number;
  
  /** FPS */
  fps: number;
  
  /** Status */
  status: 'pending' | 'processing' | 'completed' | 'failed';
  
  /** Result URL when completed */
  resultUrl?: string;
}

// ============================================================================
// VISUAL CONTINUITY TYPES
// ============================================================================

/**
 * Tracks visual state for consistency across scenes
 */
export interface VisualContinuityState {
  /** Map of asset ID to last generated image */
  generatedImages: Record<string, {
    url: string;
    sceneIndex: number;
    shotIndex: number;
    visualDescription: string;
  }>;
  
  /** Current location being shown */
  currentLocation: string | null;
  
  /** Current time of day established */
  timeOfDay: 'morning' | 'day' | 'evening' | 'night' | 'unspecified';
  
  /** Current weather/atmosphere established */
  atmosphere: string;
  
  /** Characters currently "on screen" */
  activeCharacters: string[];
  
  /** Established color palette */
  colorPalette: string[];
  
  /** Visual style notes */
  styleNotes: string;
}

/**
 * Analysis of transition between scenes
 */
export interface TransitionAnalysis {
  /** Can we use existing generated images? */
  canReuseImages: boolean;
  
  /** What needs to change visually */
  requiredChanges: string[];
  
  /** What must stay consistent */
  mustPreserve: string[];
  
  /** Recommended generation strategy */
  strategy: 'create_all_new' | 'edit_existing' | 'mix';
}

// ============================================================================
// INPUT/OUTPUT TYPES
// ============================================================================

/**
 * Input for visual director workflow
 */
export interface VisualDirectorInput {
  /** Task ID for tracking */
  taskId: string;
  
  /** User ID */
  userId: string;
  
  /** Video project ID */
  videoId: string;
  
  /** Final assembled script text */
  finalScript: string;
  
  /** Spine with beat structure */
  spine: {
    beatCount: number;
    totalDurationSeconds: number;
    beats: Array<{
      index: number;
      timing: { startSeconds: number; endSeconds: number; durationSeconds: number };
      contentSummary: string;
      keyPoints: string[];
    }>;
  };
  
  /** Asset registry with character/location/object profiles */
  assetRegistry: {
    characters: Array<{
      id: string;
      name: string;
      visualInstructions: {
        consistencyAnchors: string[];
        prohibitions: string[];
        styleNotes: string;
      };
    }>;
    locations: Array<{
      id: string;
      name: string;
      visualInstructions: {
        consistencyAnchors: string[];
        prohibitions: string[];
        styleNotes: string;
      };
    }>;
    objects: Array<{
      id: string;
      name: string;
      visualInstructions: {
        consistencyAnchors: string[];
        prohibitions: string[];
        styleNotes: string;
      };
    }>;
  };
  
  /** Expanded beats with narration */
  expandedBeats: Array<{
    beatIndex: number;
    narration: string;
    visualCallouts: Array<{ assetId: string; context: string }>;
  }>;
}

/**
 * Output from visual director workflow
 */
export interface VisualDirectorOutput {
  /** All planned scenes */
  scenes: Scene[];
  
  /** Image generation task queue */
  imageGenerationQueue: ImageGenerationTask[];
  
  /** Image editing task queue */
  imageEditingQueue: ImageEditingTask[];
  
  /** Video generation task queue */
  videoGenerationQueue: VideoGenerationTask[];
  
  /** Final visual continuity state */
  continuityState: VisualContinuityState;
  
  /** Statistics */
  stats: {
    totalScenes: number;
    totalShots: number;
    newImagesNeeded: number;
    editsNeeded: number;
    videosToGenerate: number;
  };
}

// ============================================================================
// SCENE PLANNER TYPES
// ============================================================================

/**
 * Options for scene planning
 */
export interface ScenePlannerOptions {
  userId: string;
  videoId: string;
  spine: VisualDirectorInput['spine'];
  assetRegistry: VisualDirectorInput['assetRegistry'];
  expandedBeats: VisualDirectorInput['expandedBeats'];
  finalScript: string;
}

/**
 * Result from scene planning
 */
export interface ScenePlanResult {
  scenes: Scene[];
  continuityState: VisualContinuityState;
}
