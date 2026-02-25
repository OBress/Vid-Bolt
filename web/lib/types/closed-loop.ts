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
]);
export type SynthesisMode = z.infer<typeof SynthesisMode>;

export const VerifierVerdict = z.enum(['PASS', 'FAIL']);
export type VerifierVerdict = z.infer<typeof VerifierVerdict>;

export const FailureType = z.enum(['recoverable', 'fundamental']);
export type FailureType = z.infer<typeof FailureType>;

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
  payload: z.record(z.unknown()).default({}),
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
  }).default({}),
  last_updated: z.number(),
  appearance_count: z.number().int().default(0),
});
export type GCMEntity = z.infer<typeof GCMEntity>;

// ============================================================================
// CREATIVE MANIFEST
// ============================================================================

/**
 * The Orchestrator's initialization document, derived from user input
 * during the open-loop phase. Drives all downstream prompt generation.
 */
export const CreativeManifest = z.object({
  project_id: z.string().uuid(),
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
    pacing_preset: z.enum(['documentary', 'fast-paced', 'cinematic', 'custom']).optional(),
    default_cut_duration_range: z.tuple([z.number(), z.number()]).optional(),
    hook_cut_duration_range: z.tuple([z.number(), z.number()]).optional(),
  }).optional(),
  motion_graphics: z.object({
    theme: z.enum(['dark', 'light', 'colorful', 'minimal']).optional(),
    color_palette: z.array(z.string()).optional(),
    animation_style: z.enum(['smooth', 'bouncy', 'snappy', 'gentle']).optional(),
  }).optional(),
  gcm_ref: z.string().optional(),
  locked_script_ref: z.string().optional(),
  tts_ref: z.string().optional(),
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
  /** Sound effects for this shot */
  sound_effects: z.array(z.object({
    type: z.string(),
    description: z.string(),
    trigger_at_seconds: z.number(),
    anchor_word: z.string().optional(),
  })).default([]),
  /** Whether this shot is stock-worthy */
  stock_worthy: z.boolean().default(false),
  /** Number of images needed */
  image_count: z.number().int().default(1),
  /** MG composition tier */
  mg_tier: z.enum(['self-contained', 'reference-overlay', 'composite']).optional(),
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
    content_type_breakdown: z.record(z.number()),
    media_type_breakdown: z.record(z.number()),
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
  status: z.enum(['pending', 'running', 'completed', 'failed']),
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
  /** The Creative Manifest for this video */
  creativeManifest: CreativeManifest,
  /** User's system prompt (from profile) */
  userSystemPrompt: z.string().optional(),
  /** Locked script content */
  scriptContent: z.string(),
  /** GCM entities for this project */
  entities: z.array(GCMEntity).default([]),
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
