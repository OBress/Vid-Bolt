/**
 * MG Template Tracker
 * ============================================================================
 * Tracks motion graphic composition styles within a video to enforce
 * consistency across MG components of the same type.
 *
 * When a motion graphic is generated (e.g., a "quote_card"), this service
 * records the style decisions (colors, fonts, animations, layout). On
 * subsequent MG of the same type, it retrieves the existing style to enforce
 * consistency — ensuring all quote cards look the same, all timelines share
 * the same visual DNA, etc.
 *
 * Storage: Persisted to video metadata in Supabase for crash recovery.
 */

import { getSupabaseServiceClient } from '@/lib/queues/shared';

// ============================================================================
// TYPES
// ============================================================================

export interface MgStyleRecord {
  /** The composition type (e.g., "quote_card", "timeline", "split_screen") */
  compositionType: string;
  /** Style decisions captured from the first-generated MG of this type */
  styleDecisions: {
    backgroundColor?: string;
    primaryColor?: string;
    accentColor?: string;
    fontFamily?: string;
    fontSize?: string;
    padding?: string;
    borderRadius?: string;
    animationStyle?: string;
    animationDuration?: string;
    layoutDescription?: string;
  };
  /** The full style_notes field from the original MG prompt output */
  styleNotes: string;
  /** Shot index of the first instance */
  firstInstanceShotIndex: number;
  /** How many times this template has been applied */
  instanceCount: number;
}

export interface MgTemplateRegistry {
  /** Map of compositionType → style record */
  templates: Record<string, MgStyleRecord>;
  /** Video ID this registry belongs to */
  videoId: string;
}

const LOG_PREFIX = '[MgTemplateTracker]';

// ============================================================================
// REGISTRY MANAGEMENT
// ============================================================================

/**
 * Load the MG template registry from video metadata.
 * Returns an empty registry if none exists yet.
 */
export async function loadMgTemplateRegistry(
  videoId: string,
): Promise<MgTemplateRegistry> {
  try {
    const supabase = getSupabaseServiceClient();
    const { data } = await supabase
      .from('video_projects')
      .select('metadata')
      .eq('id', videoId)
      .single();

    const registry = data?.metadata?.mgTemplateRegistry;
    if (registry && registry.videoId === videoId) {
      return registry as MgTemplateRegistry;
    }
  } catch (err) {
    console.warn(`${LOG_PREFIX} Failed to load registry for ${videoId}:`, err);
  }

  return { templates: {}, videoId };
}

/**
 * Persist the MG template registry to video metadata.
 */
export async function saveMgTemplateRegistry(
  registry: MgTemplateRegistry,
): Promise<void> {
  try {
    const supabase = getSupabaseServiceClient();

    // Read current metadata
    const { data } = await supabase
      .from('video_projects')
      .select('metadata')
      .eq('id', registry.videoId)
      .single();

    const currentMetadata = (data?.metadata as Record<string, unknown>) || {};

    // Merge registry into metadata
    await supabase
      .from('video_projects')
      .update({
        metadata: {
          ...currentMetadata,
          mgTemplateRegistry: registry,
        },
      })
      .eq('id', registry.videoId);

    console.log(
      `${LOG_PREFIX} Saved registry for ${registry.videoId} (${Object.keys(registry.templates).length} templates)`,
    );
  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to save registry:`, err);
  }
}

// ============================================================================
// STYLE TRACKING
// ============================================================================

/**
 * Check if a composition type already has a style record.
 * If so, returns the existing style notes to enforce consistency.
 * If not, returns undefined (the MG is free to define the style).
 */
export function getExistingStyle(
  registry: MgTemplateRegistry,
  compositionType: string,
): MgStyleRecord | undefined {
  return registry.templates[compositionType];
}

/**
 * Record a style decision for a composition type.
 * Called after the first MG of a type is generated.
 */
export function recordStyle(
  registry: MgTemplateRegistry,
  compositionType: string,
  styleNotes: string,
  shotIndex: number,
  styleDecisions?: MgStyleRecord['styleDecisions'],
): MgTemplateRegistry {
  const existing = registry.templates[compositionType];

  if (existing) {
    // Increment usage counter
    return {
      ...registry,
      templates: {
        ...registry.templates,
        [compositionType]: {
          ...existing,
          instanceCount: existing.instanceCount + 1,
        },
      },
    };
  }

  // Record new template
  return {
    ...registry,
    templates: {
      ...registry.templates,
      [compositionType]: {
        compositionType,
        styleDecisions: styleDecisions || {},
        styleNotes,
        firstInstanceShotIndex: shotIndex,
        instanceCount: 1,
      },
    },
  };
}

/**
 * Build a consistency prompt fragment for a composition type.
 * If a previous MG of this type exists, returns instructions to match it.
 * If not, returns instructions to establish the template.
 */
export function buildMgConsistencyPrompt(
  registry: MgTemplateRegistry,
  compositionType: string,
  _shotIndex: number,
): string {
  const existing = getExistingStyle(registry, compositionType);

  if (!existing) {
    return `\n## TEMPLATE ESTABLISHMENT
You are creating the FIRST "${compositionType}" in this video.
Your style decisions will be the template for ALL future "${compositionType}" compositions.
Be deliberate: choose colors, fonts, padding, animation timing, and layout that can be consistently replicated.
Document your style decisions clearly in style_notes.`;
  }

  return `\n## TEMPLATE ENFORCEMENT (CRITICAL)
A "${compositionType}" template already exists from Shot ${existing.firstInstanceShotIndex + 1}:
Style: ${existing.styleNotes}
${existing.styleDecisions.backgroundColor ? `Background: ${existing.styleDecisions.backgroundColor}` : ''}
${existing.styleDecisions.primaryColor ? `Primary Color: ${existing.styleDecisions.primaryColor}` : ''}
${existing.styleDecisions.fontFamily ? `Font: ${existing.styleDecisions.fontFamily}` : ''}
${existing.styleDecisions.animationStyle ? `Animation: ${existing.styleDecisions.animationStyle}` : ''}

You MUST match this template EXACTLY. This is instance #${existing.instanceCount + 1}.
Use the same layout, colors, fonts, padding, and animation timing.
The viewer should not be able to tell that different instances of "${compositionType}" were generated separately.`;
}
