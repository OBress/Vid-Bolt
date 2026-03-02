/**
 * Model Registry
 * ============================================================================
 * Centralized definitions for all available image, image-editing, and video
 * generation models. Used by the UI (labels, pricing) and service layer
 * (Replicate model IDs, provider routing).
 */

// ============================================================================
// TYPES
// ============================================================================

export type ModelProvider = 'local' | 'replicate';
export type ModelCategory = 'image' | 'image_edit' | 'video';

export interface ModelDefinition {
  /** Unique value stored in settings (e.g., "replicate-seedream-4") */
  id: string;
  /** Human-readable label for the dropdown */
  label: string;
  /** Where the model runs */
  provider: ModelProvider;
  /** Which dropdown this model appears in */
  category: ModelCategory;
  /** Pricing info shown in the dropdown (e.g., "~$0.03/image") */
  pricing: string | null;
  /** Full Replicate model path (e.g., "bytedance/seedream-4"). Null for local models. */
  replicateModelId: string | null;
  /** Short description shown as helper text */
  description: string;
}

// ============================================================================
// MODEL DEFINITIONS
// ============================================================================

export const MODEL_REGISTRY: ModelDefinition[] = [
  // ── Image Generation ──────────────────────────────────────────────────
  {
    id: 'local-z-image',
    label: 'Z-Image Turbo',
    provider: 'local',
    category: 'image',
    pricing: null,
    replicateModelId: null,
    description: 'Generates keyframe images using your local GPU API.',
  },
  {
    id: 'replicate-seedream-4',
    label: 'Seedream 4',
    provider: 'replicate',
    category: 'image',
    pricing: '~$0.03/image',
    replicateModelId: 'bytedance/seedream-4',
    description: 'ByteDance\'s unified generation & editing model. Up to 4K resolution with fast inference.',
  },
  {
    id: 'replicate-imagen-4',
    label: 'Imagen 4',
    provider: 'replicate',
    category: 'image',
    pricing: '~$0.04/image',
    replicateModelId: 'google/imagen-4',
    description: 'Google\'s flagship image model. Fine detail rendering, style versatility, and enhanced text.',
  },

  // ── Image Editing ─────────────────────────────────────────────────────
  {
    id: 'local-qwen-edit',
    label: 'Qwen Image Edit',
    provider: 'local',
    category: 'image_edit',
    pricing: null,
    replicateModelId: null,
    description: 'Edits generated images for GCM consistency using your local GPU API.',
  },
  {
    id: 'replicate-nano-banana-pro',
    label: 'Nano Banana Pro',
    provider: 'replicate',
    category: 'image_edit',
    pricing: '~$0.15/image',
    replicateModelId: 'google/nano-banana-pro',
    description: 'Google Gemini 3 Pro Image. High fidelity editing with precise text rendering.',
  },
  {
    id: 'replicate-nano-banana-2',
    label: 'Nano Banana 2',
    provider: 'replicate',
    category: 'image_edit',
    pricing: '~$0.10/image',
    replicateModelId: 'google/nano-banana-2',
    description: 'Google Gemini 3.1 Flash Image. Fast editing with near-Pro quality at lower cost.',
  },

  // ── Video Generation ──────────────────────────────────────────────────
  {
    id: 'local-ltx2',
    label: 'LTX-2 19B',
    provider: 'local',
    category: 'video',
    pricing: null,
    replicateModelId: null,
    description: 'Generates video clips using your local GPU API.',
  },
  {
    id: 'replicate-veo-3.1',
    label: 'Veo 3.1',
    provider: 'replicate',
    category: 'video',
    pricing: '~$0.40/sec',
    replicateModelId: 'google/veo-3.1',
    description: 'Google\'s highest-fidelity video model with audio. Context-aware audio, reference image support.',
  },
  {
    id: 'replicate-veo-3.1-fast',
    label: 'Veo 3.1 Fast',
    provider: 'replicate',
    category: 'video',
    pricing: '~$0.15/sec',
    replicateModelId: 'google/veo-3.1-fast',
    description: 'Faster variant of Veo 3.1 with audio. Optimized for speed while maintaining high visual quality.',
  },
  {
    id: 'replicate-kling-v2.5-turbo-pro',
    label: 'Kling v2.5 Turbo Pro',
    provider: 'replicate',
    category: 'video',
    pricing: '~$0.07/sec',
    replicateModelId: 'kwaivgi/kling-v2.5-turbo-pro',
    description: 'Kuaishou\'s professional video model. Smooth motion, cinematic depth, strong prompt adherence.',
  },
];

// ============================================================================
// HELPERS
// ============================================================================

/** Get all models for a given category */
export function getModelsByCategory(category: ModelCategory): ModelDefinition[] {
  return MODEL_REGISTRY.filter((m) => m.category === category);
}

/** Look up a model definition by its ID */
export function getModelById(id: string): ModelDefinition | undefined {
  return MODEL_REGISTRY.find((m) => m.id === id);
}

/**
 * Check whether any of the selected models require the local GPU.
 * Returns `true` if at least one model has provider === 'local'.
 */
export function hasAnyLocalModel(
  imageModel: string,
  imageEditModel: string,
  videoModel: string,
): boolean {
  const selectedIds = [imageModel, imageEditModel, videoModel];
  return selectedIds.some((id) => {
    const model = getModelById(id);
    // Default to local if the model isn't found in the registry (safety)
    return !model || model.provider === 'local';
  });
}
