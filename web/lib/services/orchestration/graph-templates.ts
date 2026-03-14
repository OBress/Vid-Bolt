/**
 * Graph Templates
 * ============================================================================
 * Predefined DAG templates for different content types.
 *
 * Each template defines a directed acyclic graph of production steps,
 * specifying which workers run, their dependencies, and which steps
 * can execute in parallel.
 *
 * Nodes represent production steps (workers/services).
 * Edges represent data dependencies between steps.
 */

// ============================================================================
// TYPES
// ============================================================================

export type NodeType =
  | 'tts'
  | 'shot_planning'
  | 'lora_sync'
  | 'prompt_generation'
  | 'asset_retrieval'
  | 'image_gen'
  | 'video_gen'
  | 'mg_gen'
  | 'mg_pass2'
  | 'music_gen'
  | 'sfx_gen'
  | 'stock_media'
  | 'clip_trimming'
  | 'verification'
  | 'edit_assembly'
  | 'pacing_review'
  | 'export';

export interface GraphNode {
  /** Unique node ID within the graph */
  id: string;
  /** Worker/service type */
  type: NodeType;
  /** Human-readable label */
  label: string;
  /** IDs of nodes this node depends on (must complete before this can start) */
  dependencies: string[];
  /** Whether this node can be skipped based on manifest config */
  skippable: boolean;
  /** Condition function name for runtime skip evaluation */
  skipCondition?: string;
  /** Estimated duration in seconds (for progress estimation) */
  estimatedDurationSec?: number;
}

export interface GraphEdge {
  /** Source node ID */
  from: string;
  /** Target node ID */
  to: string;
  /** Description of what data flows along this edge */
  dataFlow?: string;
}

export interface GraphTemplate {
  /** Template identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of when to use this template */
  description: string;
  /** Content types this template is optimal for */
  contentTypes: string[];
  /** All nodes in this graph */
  nodes: GraphNode[];
  /** All edges (dependencies) */
  edges: GraphEdge[];
}

// ============================================================================
// SKIP CONDITIONS
// ============================================================================

/**
 * Skip condition evaluators. Keys match the `skipCondition` field on nodes.
 * Each receives the CreativeManifest and returns true if the node should be SKIPPED.
 */
export const SKIP_CONDITIONS: Record<string, (manifest: Record<string, unknown>) => boolean> = {
  skipIfNoLora: (manifest) => !manifest.lora,
  skipIfNoStockFootage: (manifest) => {
    const mw = manifest.media_weighting as Record<string, number> | undefined;
    return (mw?.stock_footage ?? 0) === 0;
  },
  skipIfNoMG: (manifest) => {
    const mw = manifest.media_weighting as Record<string, number> | undefined;
    return (mw?.motion_graphics ?? 0) === 0;
  },
  skipIfNoSfx: () => false, // SFX is always evaluated (agent decides per-shot)
  skipIfNoMusic: () => false, // Music is always generated
};

// ============================================================================
// TEMPLATES
// ============================================================================

/**
 * Documentary — Full pipeline with all media types.
 * Optimized for: long-form content, explainers, true crime, historical
 */
const DOCUMENTARY_TEMPLATE: GraphTemplate = {
  id: 'documentary',
  name: 'Documentary',
  description: 'Full pipeline with all media types — stock, AI images/video, MG, music, SFX.',
  contentTypes: ['documentary', 'explainer', 'true_crime', 'historical', 'educational'],
  nodes: [
    { id: 'tts',             type: 'tts',             label: 'Text-to-Speech',       dependencies: [],                      skippable: false },
    { id: 'lora_sync',       type: 'lora_sync',       label: 'LoRA Sync',            dependencies: [],                      skippable: true,  skipCondition: 'skipIfNoLora', estimatedDurationSec: 5 },
    { id: 'shot_planning',   type: 'shot_planning',   label: 'Shot Planning',        dependencies: ['tts'],                 skippable: false, estimatedDurationSec: 15 },
    { id: 'prompt_gen',      type: 'prompt_generation', label: 'Prompt Generation',  dependencies: ['shot_planning', 'lora_sync'], skippable: false, estimatedDurationSec: 20 },
    { id: 'stock_media',     type: 'stock_media',     label: 'Stock Media Search',   dependencies: ['prompt_gen'],          skippable: true,  skipCondition: 'skipIfNoStockFootage', estimatedDurationSec: 30 },
    { id: 'image_gen',       type: 'image_gen',       label: 'Image Generation',     dependencies: ['prompt_gen'],          skippable: false, estimatedDurationSec: 60 },
    { id: 'video_gen',       type: 'video_gen',       label: 'Video Generation',     dependencies: ['image_gen'],           skippable: false, estimatedDurationSec: 120 },
    { id: 'verification',    type: 'verification',    label: 'Visual Verification',  dependencies: ['image_gen', 'video_gen'], skippable: false, estimatedDurationSec: 30 },
    { id: 'mg_gen',          type: 'mg_gen',          label: 'Motion Graphics',      dependencies: ['prompt_gen'],          skippable: true,  skipCondition: 'skipIfNoMG', estimatedDurationSec: 45 },
    { id: 'mg_pass2',        type: 'mg_pass2',        label: 'MG Pass 2 (Swap)',     dependencies: ['mg_gen', 'verification'], skippable: true, skipCondition: 'skipIfNoMG', estimatedDurationSec: 15 },
    { id: 'music_gen',       type: 'music_gen',       label: 'Music Generation',     dependencies: ['tts', 'shot_planning'], skippable: false, estimatedDurationSec: 30 },
    { id: 'sfx_gen',         type: 'sfx_gen',         label: 'SFX Generation',       dependencies: ['shot_planning'],       skippable: false, estimatedDurationSec: 20 },
    { id: 'clip_trimming',   type: 'clip_trimming',   label: 'Clip Trimming',        dependencies: ['verification', 'stock_media'], skippable: false, estimatedDurationSec: 15 },
    { id: 'edit_assembly',   type: 'edit_assembly',   label: 'Edit Assembly',        dependencies: ['clip_trimming', 'mg_pass2', 'music_gen', 'sfx_gen'], skippable: false, estimatedDurationSec: 20 },
    { id: 'pacing_review',   type: 'pacing_review',   label: 'Pacing Review',        dependencies: ['edit_assembly'],       skippable: false, estimatedDurationSec: 10 },
  ],
  edges: [
    { from: 'tts',           to: 'shot_planning',   dataFlow: 'audio + word timestamps' },
    { from: 'tts',           to: 'music_gen',       dataFlow: 'audio duration' },
    { from: 'shot_planning', to: 'music_gen',       dataFlow: 'shot boundaries + narrative context' },
    { from: 'shot_planning', to: 'prompt_gen',      dataFlow: 'shot list + media assignments' },
    { from: 'shot_planning', to: 'sfx_gen',         dataFlow: 'shot context + word timestamps' },
    { from: 'lora_sync',     to: 'prompt_gen',      dataFlow: 'LoRA availability confirmed' },
    { from: 'prompt_gen',    to: 'stock_media',     dataFlow: 'search queries for stock shots' },
    { from: 'prompt_gen',    to: 'image_gen',       dataFlow: 'image prompts' },
    { from: 'prompt_gen',    to: 'mg_gen',          dataFlow: 'MG composition specs' },
    { from: 'image_gen',     to: 'video_gen',       dataFlow: 'keyframe images for I2V' },
    { from: 'image_gen',     to: 'verification',    dataFlow: 'generated images for QA' },
    { from: 'video_gen',     to: 'verification',    dataFlow: 'generated videos for QA' },
    { from: 'verification',  to: 'clip_trimming',   dataFlow: 'verified media URLs' },
    { from: 'stock_media',   to: 'clip_trimming',   dataFlow: 'stock media URLs' },
    { from: 'mg_gen',        to: 'mg_pass2',        dataFlow: 'MG compositions' },
    { from: 'verification',  to: 'mg_pass2',        dataFlow: 'verified clips for swap evaluation' },
    { from: 'clip_trimming', to: 'edit_assembly',   dataFlow: 'trimmed clips' },
    { from: 'mg_pass2',      to: 'edit_assembly',   dataFlow: 'MG swap decisions' },
    { from: 'music_gen',     to: 'edit_assembly',   dataFlow: 'background music' },
    { from: 'sfx_gen',       to: 'edit_assembly',   dataFlow: 'sound effects' },
    { from: 'edit_assembly', to: 'pacing_review',   dataFlow: 'assembled EDL' },
  ],
};

/**
 * Montage — Optimized for fast-paced, music-driven content.
 * Skips: stock media, MG, SFX. Relies on AI images+video with music sync.
 */
const MONTAGE_TEMPLATE: GraphTemplate = {
  id: 'montage',
  name: 'Montage',
  description: 'Fast-paced, music-driven. Skips stock, MG, and SFX. Rhythm-synced cuts.',
  contentTypes: ['montage', 'compilation', 'highlight_reel', 'music_video'],
  nodes: [
    { id: 'tts',             type: 'tts',             label: 'Text-to-Speech',       dependencies: [],              skippable: false },
    { id: 'lora_sync',       type: 'lora_sync',       label: 'LoRA Sync',            dependencies: [],              skippable: true, skipCondition: 'skipIfNoLora' },
    { id: 'shot_planning',   type: 'shot_planning',   label: 'Shot Planning',        dependencies: ['tts'],         skippable: false, estimatedDurationSec: 10 },
    { id: 'prompt_gen',      type: 'prompt_generation', label: 'Prompt Generation',  dependencies: ['shot_planning', 'lora_sync'], skippable: false, estimatedDurationSec: 15 },
    { id: 'image_gen',       type: 'image_gen',       label: 'Image Generation',     dependencies: ['prompt_gen'],  skippable: false, estimatedDurationSec: 45 },
    { id: 'video_gen',       type: 'video_gen',       label: 'Video Generation',     dependencies: ['image_gen'],   skippable: false, estimatedDurationSec: 90 },
    { id: 'verification',    type: 'verification',    label: 'Visual Verification',  dependencies: ['video_gen'],   skippable: false, estimatedDurationSec: 20 },
    { id: 'music_gen',       type: 'music_gen',       label: 'Music Generation',     dependencies: ['tts', 'shot_planning'], skippable: false, estimatedDurationSec: 30 },
    { id: 'clip_trimming',   type: 'clip_trimming',   label: 'Clip Trimming',        dependencies: ['verification'], skippable: false, estimatedDurationSec: 10 },
    { id: 'edit_assembly',   type: 'edit_assembly',   label: 'Edit Assembly',        dependencies: ['clip_trimming', 'music_gen'], skippable: false, estimatedDurationSec: 15 },
    { id: 'pacing_review',   type: 'pacing_review',   label: 'Pacing Review',        dependencies: ['edit_assembly'], skippable: false, estimatedDurationSec: 8 },
  ],
  edges: [
    { from: 'tts',           to: 'shot_planning',   dataFlow: 'audio + timestamps' },
    { from: 'tts',           to: 'music_gen',       dataFlow: 'audio duration' },
    { from: 'shot_planning', to: 'music_gen',       dataFlow: 'shot boundaries + narrative context' },
    { from: 'shot_planning', to: 'prompt_gen',      dataFlow: 'shot list' },
    { from: 'lora_sync',     to: 'prompt_gen',      dataFlow: 'LoRA ready' },
    { from: 'prompt_gen',    to: 'image_gen',       dataFlow: 'image prompts' },
    { from: 'image_gen',     to: 'video_gen',       dataFlow: 'keyframes' },
    { from: 'video_gen',     to: 'verification',    dataFlow: 'videos' },
    { from: 'verification',  to: 'clip_trimming',   dataFlow: 'verified clips' },
    { from: 'clip_trimming', to: 'edit_assembly',   dataFlow: 'trimmed clips' },
    { from: 'music_gen',     to: 'edit_assembly',   dataFlow: 'music' },
    { from: 'edit_assembly', to: 'pacing_review',   dataFlow: 'EDL' },
  ],
};

/**
 * Comparison — MG-heavy, less video generation.
 * Optimized for: product comparisons, before/after, side-by-side analysis.
 */
const COMPARISON_TEMPLATE: GraphTemplate = {
  id: 'comparison',
  name: 'Comparison',
  description: 'MG-heavy with side-by-side and data overlays. Less AI video, more stock + images.',
  contentTypes: ['comparison', 'review', 'analysis', 'versus'],
  nodes: [
    { id: 'tts',             type: 'tts',             label: 'Text-to-Speech',       dependencies: [],              skippable: false },
    { id: 'lora_sync',       type: 'lora_sync',       label: 'LoRA Sync',            dependencies: [],              skippable: true, skipCondition: 'skipIfNoLora' },
    { id: 'shot_planning',   type: 'shot_planning',   label: 'Shot Planning',        dependencies: ['tts'],         skippable: false, estimatedDurationSec: 12 },
    { id: 'prompt_gen',      type: 'prompt_generation', label: 'Prompt Generation',  dependencies: ['shot_planning', 'lora_sync'], skippable: false, estimatedDurationSec: 18 },
    { id: 'stock_media',     type: 'stock_media',     label: 'Stock Media Search',   dependencies: ['prompt_gen'],  skippable: false, estimatedDurationSec: 25 },
    { id: 'image_gen',       type: 'image_gen',       label: 'Image Generation',     dependencies: ['prompt_gen'],  skippable: false, estimatedDurationSec: 40 },
    { id: 'mg_gen',          type: 'mg_gen',          label: 'Motion Graphics',      dependencies: ['prompt_gen', 'image_gen'], skippable: false, estimatedDurationSec: 60 },
    { id: 'verification',    type: 'verification',    label: 'Visual Verification',  dependencies: ['image_gen'],   skippable: false, estimatedDurationSec: 20 },
    { id: 'mg_pass2',        type: 'mg_pass2',        label: 'MG Pass 2 (Swap)',     dependencies: ['mg_gen', 'verification'], skippable: false, estimatedDurationSec: 15 },
    { id: 'music_gen',       type: 'music_gen',       label: 'Music Generation',     dependencies: ['tts', 'shot_planning'], skippable: false, estimatedDurationSec: 30 },
    { id: 'sfx_gen',         type: 'sfx_gen',         label: 'SFX Generation',       dependencies: ['shot_planning'], skippable: false, estimatedDurationSec: 15 },
    { id: 'clip_trimming',   type: 'clip_trimming',   label: 'Clip Trimming',        dependencies: ['verification', 'stock_media'], skippable: false, estimatedDurationSec: 12 },
    { id: 'edit_assembly',   type: 'edit_assembly',   label: 'Edit Assembly',        dependencies: ['clip_trimming', 'mg_pass2', 'music_gen', 'sfx_gen'], skippable: false, estimatedDurationSec: 20 },
    { id: 'pacing_review',   type: 'pacing_review',   label: 'Pacing Review',        dependencies: ['edit_assembly'], skippable: false, estimatedDurationSec: 10 },
  ],
  edges: [
    { from: 'tts',           to: 'shot_planning',   dataFlow: 'audio + timestamps' },
    { from: 'tts',           to: 'music_gen',       dataFlow: 'audio duration' },
    { from: 'shot_planning', to: 'music_gen',       dataFlow: 'shot boundaries + narrative context' },
    { from: 'shot_planning', to: 'prompt_gen',      dataFlow: 'shot list' },
    { from: 'shot_planning', to: 'sfx_gen',         dataFlow: 'shot context' },
    { from: 'lora_sync',     to: 'prompt_gen',      dataFlow: 'LoRA ready' },
    { from: 'prompt_gen',    to: 'stock_media',     dataFlow: 'search queries' },
    { from: 'prompt_gen',    to: 'image_gen',       dataFlow: 'image prompts' },
    { from: 'prompt_gen',    to: 'mg_gen',          dataFlow: 'MG specs' },
    { from: 'image_gen',     to: 'mg_gen',          dataFlow: 'generated images for MG reference' },
    { from: 'image_gen',     to: 'verification',    dataFlow: 'images' },
    { from: 'mg_gen',        to: 'mg_pass2',        dataFlow: 'MG compositions' },
    { from: 'verification',  to: 'mg_pass2',        dataFlow: 'verified clips' },
    { from: 'verification',  to: 'clip_trimming',   dataFlow: 'verified URLs' },
    { from: 'stock_media',   to: 'clip_trimming',   dataFlow: 'stock URLs' },
    { from: 'clip_trimming', to: 'edit_assembly',   dataFlow: 'trimmed clips' },
    { from: 'mg_pass2',      to: 'edit_assembly',   dataFlow: 'MG swaps' },
    { from: 'music_gen',     to: 'edit_assembly',   dataFlow: 'music' },
    { from: 'sfx_gen',       to: 'edit_assembly',   dataFlow: 'SFX' },
    { from: 'edit_assembly', to: 'pacing_review',   dataFlow: 'EDL' },
  ],
};

/**
 * Tutorial — MG-dominant with screen recording placeholders.
 * Optimized for: how-to, step-by-step, technical walkthroughs.
 */
const TUTORIAL_TEMPLATE: GraphTemplate = {
  id: 'tutorial',
  name: 'Tutorial',
  description: 'MG-dominant for step-by-step content. Minimal AI video, heavy text overlays.',
  contentTypes: ['tutorial', 'how_to', 'walkthrough', 'guide'],
  nodes: [
    { id: 'tts',             type: 'tts',             label: 'Text-to-Speech',       dependencies: [],              skippable: false },
    { id: 'shot_planning',   type: 'shot_planning',   label: 'Shot Planning',        dependencies: ['tts'],         skippable: false, estimatedDurationSec: 10 },
    { id: 'prompt_gen',      type: 'prompt_generation', label: 'Prompt Generation',  dependencies: ['shot_planning'], skippable: false, estimatedDurationSec: 15 },
    { id: 'image_gen',       type: 'image_gen',       label: 'Image Generation',     dependencies: ['prompt_gen'],  skippable: false, estimatedDurationSec: 30 },
    { id: 'mg_gen',          type: 'mg_gen',          label: 'Motion Graphics',      dependencies: ['prompt_gen', 'image_gen'], skippable: false, estimatedDurationSec: 60 },
    { id: 'verification',    type: 'verification',    label: 'Visual Verification',  dependencies: ['image_gen'],   skippable: false, estimatedDurationSec: 15 },
    { id: 'mg_pass2',        type: 'mg_pass2',        label: 'MG Pass 2 (Swap)',     dependencies: ['mg_gen', 'verification'], skippable: false, estimatedDurationSec: 15 },
    { id: 'music_gen',       type: 'music_gen',       label: 'Music Generation',     dependencies: ['tts', 'shot_planning'], skippable: false, estimatedDurationSec: 25 },
    { id: 'clip_trimming',   type: 'clip_trimming',   label: 'Clip Trimming',        dependencies: ['verification'], skippable: false, estimatedDurationSec: 8 },
    { id: 'edit_assembly',   type: 'edit_assembly',   label: 'Edit Assembly',        dependencies: ['clip_trimming', 'mg_pass2', 'music_gen'], skippable: false, estimatedDurationSec: 18 },
    { id: 'pacing_review',   type: 'pacing_review',   label: 'Pacing Review',        dependencies: ['edit_assembly'], skippable: false, estimatedDurationSec: 8 },
  ],
  edges: [
    { from: 'tts',           to: 'shot_planning',   dataFlow: 'audio + timestamps' },
    { from: 'tts',           to: 'music_gen',       dataFlow: 'audio duration' },
    { from: 'shot_planning', to: 'music_gen',       dataFlow: 'shot boundaries + narrative context' },
    { from: 'shot_planning', to: 'prompt_gen',      dataFlow: 'shot list' },
    { from: 'prompt_gen',    to: 'image_gen',       dataFlow: 'image prompts' },
    { from: 'prompt_gen',    to: 'mg_gen',          dataFlow: 'MG specs' },
    { from: 'image_gen',     to: 'mg_gen',          dataFlow: 'images for MG' },
    { from: 'image_gen',     to: 'verification',    dataFlow: 'images' },
    { from: 'mg_gen',        to: 'mg_pass2',        dataFlow: 'MG compositions' },
    { from: 'verification',  to: 'mg_pass2',        dataFlow: 'verified clips' },
    { from: 'verification',  to: 'clip_trimming',   dataFlow: 'verified URLs' },
    { from: 'clip_trimming', to: 'edit_assembly',   dataFlow: 'trimmed clips' },
    { from: 'mg_pass2',      to: 'edit_assembly',   dataFlow: 'MG overlays' },
    { from: 'music_gen',     to: 'edit_assembly',   dataFlow: 'music' },
    { from: 'edit_assembly', to: 'pacing_review',   dataFlow: 'EDL' },
  ],
};

// ============================================================================
// REGISTRY
// ============================================================================

/** All available graph templates */
export const GRAPH_TEMPLATES: Record<string, GraphTemplate> = {
  documentary: DOCUMENTARY_TEMPLATE,
  montage: MONTAGE_TEMPLATE,
  comparison: COMPARISON_TEMPLATE,
  tutorial: TUTORIAL_TEMPLATE,
};

/**
 * Get a template by ID. Falls back to documentary if not found.
 */
export function getGraphTemplate(templateId: string): GraphTemplate {
  return GRAPH_TEMPLATES[templateId] || DOCUMENTARY_TEMPLATE;
}

/**
 * Get all template IDs and descriptions for the intent classifier.
 */
export function getTemplateCatalog(): Array<{ id: string; name: string; description: string; contentTypes: string[] }> {
  return Object.values(GRAPH_TEMPLATES).map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    contentTypes: t.contentTypes,
  }));
}
