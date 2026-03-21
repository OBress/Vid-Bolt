/**
 * Closed-Loop System Types
 * ============================================================================
 * Zod schemas and TypeScript types for the orchestrated closed-loop video
 * production system. These are the shared data contracts used by all workers.
 *
 * All inter-worker communication flows through:
 *   1. MessageEnvelope — structured routing between Orchestrator ↔ Agents
 *   2. CreativeManifest — user preferences + style rules for the video
 *   3. ShotPlan — temporal map of shots aligned to TTS timestamps
 *   4. AssetManifest — mapping of shots to media sources (stock, AI, MG)
 *   5. GCMEntity — canonical entity references for visual consistency
 */

import { z } from 'zod';
import {
  MG_ASSET_KINDS,
  MOTION_GRAPHICS_MODES,
  MOTION_GRAPHICS_TEMPLATE_TYPES,
  PERSISTENT_GRAPHIC_TYPES,
} from '@/types/video';

// ============================================================================
// ENUMS
// ============================================================================

export const ClosedLoopPhase = z.enum([
  'tts',              // Phase I
  'shot_planning',    // Phase II
  'asset_retrieval',  // Phase III
  'production',       // Phase IV (GPU + MG in parallel)
  'assembly',         // Phase V
]);
export type ClosedLoopPhase = z.infer<typeof ClosedLoopPhase>;

export const EnvelopeAction = z.enum([
  'GENERATE',   // Orchestrator → Agent: initial task
  'REVISE',     // Orchestrator → Agent: feedback-driven regen
  'APPROVE',    // Orchestrator → Agent: output accepted
  'SUBMIT',     // Agent → Orchestrator: output ready for review
  'REQUEST',    // Agent → Agent: sub-request
  'ESCALATE',   // Orchestrator → Agent: strategy change
  'FLAG',       // Orchestrator → User: needs human intervention
]);
export type EnvelopeAction = z.infer<typeof EnvelopeAction>;

export const EntityType = z.enum([
  'character',
  'setting',
  'prop',
  'style',
]);
export type EntityType = z.infer<typeof EntityType>;

export const MediaType = z.enum([
  'video',
  'image',
  'motiongraphic',
  'stock',
]);
export type MediaType = z.infer<typeof MediaType>;

export const SynthesisMode = z.enum([
  'T2V',    // Text-to-Video (first shot or isolated scene)
  'FF2V',   // First-Frame-to-Video (sequential continuation)
  'I2V',    // Image-to-Video (image-edited frame → new video)
]);
export type SynthesisMode = z.infer<typeof SynthesisMode>;

/**
 * Narrative beat classification for director-level shot planning.
 * Replaces the old 5-category content_type with purpose-driven categories.
 */
export const NarrativeBeat = z.enum([
  'hook',          // Grab attention (first 3-15s)
  'establishing',  // Set the scene, show the world
  'buildup',       // Increase tension, stack information
  'detail',        // Focus on specific evidence/element
  'reveal',        // Payoff moment, show the key thing
  'reaction',      // Emotional weight, let it land
  'transition',    // Bridge between topics
  'climax',        // Peak dramatic moment
  'resolution',    // Wrap up, debrief
]);
export type NarrativeBeat = z.infer<typeof NarrativeBeat>;

export const VerifierVerdict = z.enum(['PASS', 'FAIL']);
export type VerifierVerdict = z.infer<typeof VerifierVerdict>;

export const FailureType = z.enum(['recoverable', 'fundamental']);
export type FailureType = z.infer<typeof FailureType>;

export const VisualTreatment = z.enum([
  'stock',
  'archival',
  'mg_template',
  'ai_image',
  'ai_video',
  'hybrid',
]);
export type VisualTreatment = z.infer<typeof VisualTreatment>;

export const MotionGraphicsMode = z.enum(MOTION_GRAPHICS_MODES);
export type MotionGraphicsMode = z.infer<typeof MotionGraphicsMode>;

export const MotionGraphicsTemplateType = z.enum(MOTION_GRAPHICS_TEMPLATE_TYPES);
export type MotionGraphicsTemplateType = z.infer<typeof MotionGraphicsTemplateType>;

export const PersistentGraphicType = z.enum(PERSISTENT_GRAPHIC_TYPES);
export type PersistentGraphicType = z.infer<typeof PersistentGraphicType>;

export const MotionGraphicsAssetKind = z.enum(MG_ASSET_KINDS);
export type MotionGraphicsAssetKind = z.infer<typeof MotionGraphicsAssetKind>;

export const MotionGraphicsAssetBundleItem = z.object({
  id: z.string(),
  url: z.string(),
  asset_kind: MotionGraphicsAssetKind,
  label: z.string().optional(),
  usage: z.string().optional(),
  description: z.string().optional(),
  source: z.enum(['generated', 'stock', 'reference', 'placeholder']).optional(),
  source_shot_index: z.number().int().optional(),
});
export type MotionGraphicsAssetBundleItem = z.infer<typeof MotionGraphicsAssetBundleItem>;

export const GraphicStatePatch = z.object({
  headline: z.string().optional(),
  notes: z.array(z.string()).optional(),
  add_labels: z.array(z.string()).optional(),
  remove_labels: z.array(z.string()).optional(),
  focus_label: z.string().optional(),
  status: z.enum(['introduced', 'updated', 'revealed', 'resolved']).optional(),
});
export type GraphicStatePatch = z.infer<typeof GraphicStatePatch>;

// ============================================================================
// MESSAGE ENVELOPE
// ============================================================================

/**
 * Delta feedback from the Orchestrator identifying the gap between output and goal.
 */
export const DeltaFeedback = z.object({
  target_id: z.string(),
  issue: z.string(),
  instruction: z.string(),
  verdict: VerifierVerdict,
  failure_type: FailureType.optional(),
  dimension_feedback: z.object({
    semantic_alignment: z.string().optional(),
    entity_consistency: z.string().optional(),
    temporal_continuity: z.string().optional(),
    visual_quality: z.string().optional(),
    style_consistency: z.string().optional(),
  }).optional(),
});
export type DeltaFeedback = z.infer<typeof DeltaFeedback>;

/**
 * Structured JSON envelope for all inter-agent communication via BullMQ.
 */
export const MessageEnvelope = z.object({
  envelope_id: z.string().uuid(),
  from: z.string(),
  to: z.string(),
  action: EnvelopeAction,
  phase: ClosedLoopPhase,
  iteration: z.number().int().min(1).default(1),
  project_id: z.string().uuid(),
  context: z.object({
    creative_manifest_ref: z.string().optional(),
    gcm_ref: z.string().optional(),
    locked_script_ref: z.string().optional(),
  }),
  payload: z.record(z.string(), z.unknown()).default({}),
  delta_feedback: DeltaFeedback.optional(),
  context_locked: z.boolean().default(true),
  timestamp: z.string().datetime(),
});
export type MessageEnvelope = z.infer<typeof MessageEnvelope>;

// ============================================================================
// GLOBAL CONTEXT MANAGER (GCM) ENTITY
// ============================================================================

/**
 * A canonical entity reference for visual consistency across all shots.
 * Seeded by human-approved reference assets (Step 3).
 */
export const GCMEntity = z.object({
  entity_id: z.string().uuid(),
  entity_type: EntityType,
  name: z.string(),
  reference_url: z.string().url(),
  text_description: z.string(),
  attributes: z.object({
    pose: z.string().optional(),
    emotion: z.string().optional(),
    lighting: z.string().optional(),
    camera_angle: z.string().optional(),
    clothing: z.string().optional(),
    color_palette: z.array(z.string()).optional(),
    /** Preserved original reference URL before rolling GCM updates */
    original_reference_url: z.string().optional(),
  }).default({}),
  last_updated: z.number(),
  appearance_count: z.number().int().default(0),
});
export type GCMEntity = z.infer<typeof GCMEntity>;

// ============================================================================
// VIDEO CREATIVE OVERRIDES (Per-Video)
// ============================================================================

/**
 * Per-video creative direction overrides.
 * Applied on top of channel-level defaults when the user customizes
 * settings for a specific video at production time.
 * Only fields that are set will override the channel defaults.
 */
export const VideoCreativeOverrides = z.object({
  /** Override the visual style for this specific video */
  visualStyle: z.string().optional(),
  /** Override the color palette for this video */
  colorPalette: z.array(z.string()).optional(),
  /** Override the lighting mood */
  lightingMood: z.string().optional(),
  /** LoRA name to use for this video (overrides channel default) */
  loraName: z.string().optional(),
  /** LoRA weight for this video (0.0–1.0) */
  loraWeight: z.number().min(0).max(1).optional(),
  /** Override MG theme for this video */
  mgThemeOverride: z.object({
    theme: z.enum(['dark', 'light', 'colorful', 'minimal']).optional(),
    colorPalette: z.array(z.string()).optional(),
    animationStyle: z.enum(['smooth', 'bouncy', 'snappy', 'gentle']).optional(),
  }).optional(),
  /** Override media weighting for this video */
  mediaWeightingOverride: z.object({
    stock_footage: z.number().min(0).max(1).optional(),
    ai_video: z.number().min(0).max(1).optional(),
    motion_graphics: z.number().min(0).max(1).optional(),
    ai_image_static: z.number().min(0).max(1).optional(),
  }).optional(),
  /** Video-specific creative direction prompt — merged with channel prompt */
  videoCreativePrompt: z.string().optional(),
  /** Override quality anchors for this video */
  qualityAnchors: z.array(z.string()).optional(),
}).optional();
export type VideoCreativeOverrides = z.infer<typeof VideoCreativeOverrides>;

// ============================================================================
// CREATIVE MANIFEST
// ============================================================================

/**
 * The Orchestrator's initialization document, derived from user input
 * during the open-loop phase. Drives all downstream prompt generation.
 * Built by the manifest-builder from: system defaults → channel settings → per-video overrides.
 */
export const CreativeManifest = z.object({
  project_id: z.string().uuid(),
  quality_mode: z.enum(['draft', 'production']).optional(),
  premium_video_fallback: z.enum(['off', 'on_failure']).optional(),
  style: z.object({
    visual_style: z.string().default('cinematic, documentary'),
    color_palette: z.array(z.string()).default([]),
    lighting_mood: z.string().optional(),
    aspect_ratio: z.enum(['16:9', '9:16']).default('16:9'),
  }),
  media_weighting: z.object({
    stock_footage: z.number().min(0).max(1).default(0.3),
    ai_video: z.number().min(0).max(1).default(0.4),
    motion_graphics: z.number().min(0).max(1).default(0.2),
    ai_image_static: z.number().min(0).max(1).default(0.1),
  }),
  pacing_rules: z.object({
    hook_duration_seconds: z.number().default(15),
    hook_min_motion_graphics: z.number().int().default(2),
    max_consecutive_static_images: z.number().int().default(2),
    min_video_shots_per_minute: z.number().default(3),
  }),
  quality_thresholds: z.object({
    max_retries: z.number().int().default(3),
  }),
  writing: z.object({
    writer_persona: z.string().optional(),
    audience: z.object({
      demographics: z.string().optional(),
      platform: z.string().optional(),
    }).optional(),
    banned_words: z.array(z.string()).optional(),
    formality_level: z.enum(['casual', 'conversational', 'formal']).optional(),
  }).optional(),
  visual: z.object({
    quality_anchors: z.array(z.string()).optional(),
    image_constraints: z.array(z.string()).optional(),
  }).optional(),
  editing: z.object({
    pacing_preset: z.enum(['documentary', 'fast-paced', 'cinematic', 'educational', 'custom']).optional(),
    default_cut_duration_range: z.tuple([z.number(), z.number()]).optional(),
    hook_cut_duration_range: z.tuple([z.number(), z.number()]).optional(),
  }).optional(),
  motion_graphics: z.object({
    theme: z.enum(['dark', 'light', 'colorful', 'minimal']).optional(),
    color_palette: z.array(z.string()).optional(),
    animation_style: z.enum(['smooth', 'bouncy', 'snappy', 'gentle']).optional(),
    /** Font family for MG text elements */
    font_family: z.string().optional(),
    /** Border/corner style for MG cards and containers */
    border_style: z.enum(['rounded', 'sharp', 'pill']).optional(),
  }).optional(),
  /** LoRA configuration for image generation in this video */
  lora: z.object({
    name: z.string(),
    weight: z.number().min(0).max(1).default(0.8),
    url: z.string(),
    /** Activation trigger words — prepended to image prompts */
    trigger_words: z.string().optional(),
  }).optional(),
  /** Combined channel-level creative direction prompt */
  master_creative_prompt: z.string().optional(),
  /** Video-specific creative direction prompt */
  video_creative_prompt: z.string().optional(),
  /** Narrow project-scoped reference kit for MG composition and overlays */
  reference_kit: z.array(MotionGraphicsAssetBundleItem).optional(),
  /** Per-worker prompt overrides from user settings */
  worker_prompt_overrides: z.record(z.string(), z.string()).optional(),
  /** Model selection from project settings — passed through to workers */
  models: z.object({
    image: z.string().default('local-z-image'),
    video: z.string().default('local-ltx2'),
    image_edit: z.string().default('local-qwen-edit'),
  }).optional(),
  gcm_ref: z.string().optional(),
  locked_script_ref: z.string().optional(),
  tts_ref: z.string().optional(),
  /** Script metadata for downstream prompt tuning (genre, tone, audience, etc.) */
  script_context: z.object({
    pov: z.string().optional(),
    genre: z.string().optional(),
    tone_style: z.string().optional(),
    target_audience: z.string().optional(),
    content_niche: z.string().optional(),
  }).optional(),
});
export type CreativeManifest = z.infer<typeof CreativeManifest>;

// ============================================================================
// SHOT PLAN (Phase II Output)
// ============================================================================

/**
 * A single planned shot aligned to TTS timestamps.
 */
export const PlannedShot = z.object({
  segment_index: z.number().int(),
  start_seconds: z.number(),
  end_seconds: z.number(),
  duration_seconds: z.number(),
  text: z.string(),
  summary: z.string(),
  content_type: z.string(),
  media_type: MediaType,
  /** Synthesis mode for video shots */
  synthesis_mode: SynthesisMode.optional(),
  /** Entity references from GCM */
  entity_refs: z.array(z.string().uuid()).default([]),
  /** Routing tags for generation tool selection */
  visual_elements: z.array(z.string()).default([]),
  /** AI visual description */
  visual_description: z.string().optional(),
  /** Higher-level media treatment decision for this shot */
  visual_treatment: VisualTreatment.optional(),
  /** Sound effects for this shot */
  sound_effects: z.array(z.object({
    type: z.string(),
    description: z.string(),
    trigger_at_seconds: z.number(),
    anchor_word: z.string().optional(),
  })).default([]),
  /** Whether this shot is stock-worthy */
  stock_worthy: z.boolean().default(false),
  /** Entity-focused search query for stock media (2-4 words, e.g., "Julius Caesar") */
  stock_search_query: z.string().optional(),
  /** Number of images needed */
  image_count: z.number().int().default(1),
  /** MG composition tier */
  mg_tier: z.enum(['self-contained', 'reference-overlay', 'composite']).optional(),
  /** Template vs freeform MG generation lane */
  mg_mode: MotionGraphicsMode.optional(),
  /** Deterministic template type for template-lane MG generation */
  template_type: MotionGraphicsTemplateType.optional(),
  /** Explicit asset bundle for deterministic MG templates */
  mg_asset_bundle: z.array(MotionGraphicsAssetBundleItem).optional(),
  /** Scene grouping ID — shots sharing a scene_id maintain visual continuity */
  scene_id: z.string().optional(),
  /** Narrative purpose of this shot (director-level beat classification) */
  narrative_beat: NarrativeBeat.optional(),
  /** Whether this shot continues the previous shot's scene (same location/environment) */
  continuity_from_previous: z.boolean().default(false),
  /** Angle change directive for I2V synthesis — edits the previous shot's last frame */
  angle_change: z.string().optional(),
  /** General-purpose image edit instruction (applies to ANY shot type: video, MG, stock, image).
   *  When present, the base image (keyframe, stock photo, etc.) is edited via Qwen-Edit
   *  before being used in its context (video start frame, MG composition, overlay, etc.).
   *  Examples: "add a clown mask to the statue", "highlight the data points in red",
   *  "make the background darker and more dramatic", "add rain effects" */
  image_edit_instruction: z.string().optional(),
  /** Stable reusable graphic ID when a board/map/timeline should evolve across shots */
  persistent_graphic_id: z.string().optional(),
  /** Reusable graphic family/type */
  persistent_graphic_type: PersistentGraphicType.optional(),
  /** Delta to apply to the reusable graphic at this shot */
  graphic_state_patch: GraphicStatePatch.optional(),
  /** Derived continuity cluster for same-world / same-setting shot runs */
  scene_cluster_id: z.string().optional(),
  /** Derived connected documentary breakdown progression */
  breakdown_sequence_id: z.string().optional(),
  /** Role inside a connected documentary breakdown progression */
  breakdown_role: z.enum(['macro', 'mid', 'micro', 'detail']).optional(),
});
export type PlannedShot = z.infer<typeof PlannedShot>;

/**
 * The complete shot plan output from Phase II.
 */
export const ShotPlan = z.object({
  shots: z.array(PlannedShot),
  metadata: z.object({
    total_segments: z.number().int(),
    total_duration_seconds: z.number(),
    average_segment_duration: z.number(),
    content_type_breakdown: z.record(z.string(), z.number()),
    media_type_breakdown: z.record(z.string(), z.number()),
    /** Number of scenes identified by the scene decomposer */
    scene_count: z.number().int().optional(),
    /** Per-scene breakdown with timing and shot counts */
    scene_breakdown: z.array(z.object({
      scene_id: z.string(),
      shot_count: z.number().int(),
      start_seconds: z.number(),
      end_seconds: z.number(),
      description: z.string(),
    })).optional(),
    planner_diagnostics: z.object({
      fallback_scene_count: z.number().int().optional(),
      fallback_scene_ids: z.array(z.string()).optional(),
      scene_cluster_count: z.number().int().optional(),
      breakdown_sequence_count: z.number().int().optional(),
      linked_entity_count: z.number().int().optional(),
      linked_shot_count: z.number().int().optional(),
    }).optional(),
  }),
});
export type ShotPlan = z.infer<typeof ShotPlan>;

// ============================================================================
// ASSET MANIFEST (Phase III Output)
// ============================================================================

/**
 * A single asset entry mapping a shot to its media source.
 */
export const AssetEntry = z.object({
  segment_index: z.number().int(),
  /** The AI-crafted visual prompt (enriched with GCM entity descriptions) */
  visual_prompt: z.string(),
  /** Source type */
  source: z.enum(['stock', 'ai_image', 'ai_video', 'motiongraphic']),
  /** Stock image URL (if source is stock) */
  stock_url: z.string().url().optional(),
  stock_metadata: z.object({
    id: z.string(),
    thumbnailUrl: z.string(),
    description: z.string(),
    similarity: z.number(),
  }).optional(),
  /** SFX clip info (if a sound effect is assigned to this shot) */
  sfx: z.object({
    url: z.string().url(),
    description: z.string(),
    trigger_at_seconds: z.number(),
    duration_seconds: z.number().optional(),
  }).optional(),
});
export type AssetEntry = z.infer<typeof AssetEntry>;

/**
 * The complete asset manifest output from Phase III.
 */
export const AssetManifest = z.object({
  entries: z.array(AssetEntry),
  metadata: z.object({
    stock_count: z.number().int(),
    ai_image_count: z.number().int(),
    ai_video_count: z.number().int(),
    motiongraphic_count: z.number().int(),
    sfx_count: z.number().int(),
  }),
});
export type AssetManifest = z.infer<typeof AssetManifest>;

// ============================================================================
// CLOSED LOOP STATE (Orchestrator persistence)
// ============================================================================

/**
 * Granular state tracked by the Orchestrator, persisted to
 * `video_projects.closed_loop_state` for crash recovery.
 */
export const ClosedLoopState = z.object({
  /** Current phase */
  phase: ClosedLoopPhase,
  /** Phase-level status */
  status: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']),
  /** Phase start time */
  started_at: z.string().datetime().optional(),
  /** Phase completion time */
  completed_at: z.string().datetime().optional(),
  /** Per-phase progress data */
  phase_data: z.object({
    tts: z.object({
      completed: z.boolean().default(false),
      audio_url: z.string().optional(),
      timestamps_count: z.number().int().optional(),
    }).optional(),
    shot_planning: z.object({
      completed: z.boolean().default(false),
      shot_count: z.number().int().optional(),
      iteration: z.number().int().default(1),
    }).optional(),
    asset_retrieval: z.object({
      completed: z.boolean().default(false),
      stock_matched: z.number().int().optional(),
      prompts_generated: z.number().int().optional(),
    }).optional(),
    production: z.object({
      images_completed: z.number().int().default(0),
      images_failed: z.number().int().default(0),
      videos_completed: z.number().int().default(0),
      videos_failed: z.number().int().default(0),
      mg_completed: z.number().int().default(0),
      mg_failed: z.number().int().default(0),
      music_completed: z.boolean().default(false),
    }).optional(),
    assembly: z.object({
      completed: z.boolean().default(false),
      editor_state_saved: z.boolean().default(false),
    }).optional(),
  }).default({}),
  /** Shots that failed max retries and were salvaged */
  flagged_shots: z.array(z.object({
    shotIndex: z.number().int(),
    issue: z.string(),
    suggestions: z.array(z.string()).default([]),
    allAttemptUrls: z.array(z.string()).default([]),
  })).default([]),
  /** Total retry count across all phases */
  total_retries: z.number().int().default(0),
  /** Count of shots where verification was skipped due to API/parse errors */
  verification_skipped: z.number().int().default(0),
  /** Error log */
  errors: z.array(z.object({
    phase: ClosedLoopPhase,
    message: z.string(),
    timestamp: z.string().datetime(),
  })).default([]),
});
export type ClosedLoopState = z.infer<typeof ClosedLoopState>;

// ============================================================================
// ORCHESTRATOR JOB DATA
// ============================================================================

/**
 * Job data for the Orchestrator queue.
 */
export const OrchestratorJobData = z.object({
  taskId: z.string(),
  userId: z.string(),
  videoId: z.string(),
  /** Parent media project ID (for project_settings lookup, e.g. LoRA sync) */
  projectId: z.string().optional(),
  /** The Creative Manifest for this video */
  creativeManifest: CreativeManifest,
  /** User's system prompt (from profile) */
  userSystemPrompt: z.string().optional(),
  /** Locked script content */
  scriptContent: z.string(),
  /** GCM entities for this project */
  entities: z.array(GCMEntity).default([]),
  /** Per-video creative overrides set by the user at production time */
  videoCreativeOverrides: VideoCreativeOverrides,
  /** Resolved project-level settings passed once from the route */
  projectConfig: z.object({
    voice: z.object({
      provider: z.enum(['elevenlabs', 'genai', 'inworld']).default('inworld'),
      model: z.string().default('inworld-tts-1.5-max'),
      voiceName: z.string().default('Hades'),
      speakingSpeed: z.number().default(100),
      stability: z.number().default(100),
      similarityBoost: z.number().default(0),
      speakerBoost: z.boolean().default(false),
      voiceStyle: z.number().default(0),
    }).optional(),
    scriptMeta: z.object({
      pov: z.string().optional(),
      genre: z.string().optional(),
      toneStyle: z.string().optional(),
      targetAudience: z.string().optional(),
      contentNiche: z.string().optional(),
    }).optional(),
  }).optional(),
});
export type OrchestratorJobData = z.infer<typeof OrchestratorJobData>;

// ============================================================================
// WORKER PROMPTS (Dynamic Prompt Generation output)
// ============================================================================

/**
 * Per-worker system prompts generated by the Orchestrator at video start.
 */
export const WorkerPrompts = z.object({
  shot_planner: z.string(),
  asset_scout: z.string(),
  image_gen: z.string(),
  video_gen: z.string(),
  motion_graphics: z.string(),
  music: z.string(),
  sfx: z.string(),
});
export type WorkerPrompts = z.infer<typeof WorkerPrompts>;
