/**
 * Graph Composer
 * ============================================================================
 * LLM-based graph designer that can compose custom DAG definitions beyond
 * the predefined templates.
 *
 * Phase B of Agent Graph Orchestration:
 * - Input: Creative Manifest + script + content analysis + worker catalog
 * - Output: Custom DAG definition (nodes, edges, typed parameter connections)
 * - Enables workflows impossible with fixed templates (e.g., generate reference
 *   images first, then use as style anchors for all subsequent shots)
 *
 * The composed graph is validated by the Graph Reviewer before execution.
 */

import { callOpenRouter } from '@/lib/ai/openrouter';
import type { GraphTemplate, GraphNode, GraphEdge, NodeType } from './graph-templates';
import type { ClassificationResult } from './intent-classifier';
import type { CreativeManifest } from '@/lib/types/closed-loop';

// ============================================================================
// TYPES
// ============================================================================

export interface ComposedGraph {
  /** The composed graph template */
  template: GraphTemplate;
  /** Reasoning for the custom graph design */
  reasoning: string;
  /** Whether this is a modification of a preset or fully custom */
  compositionType: 'modified_preset' | 'fully_custom';
  /** List of modifications if modifying a preset */
  modifications?: string[];
}

const LOG_PREFIX = '[GraphComposer]';

// ============================================================================
// WORKER CATALOG
// ============================================================================

/**
 * Available workers and their input/output types.
 * This catalog is sent to the LLM so it knows what building blocks are available.
 */
const WORKER_CATALOG: Array<{
  type: NodeType;
  label: string;
  inputs: string;
  outputs: string;
  description: string;
}> = [
  {
    type: 'tts',
    label: 'Text-to-Speech',
    inputs: 'Script text',
    outputs: 'Audio file URL, word timestamps',
    description: 'Converts script narration to speech with precise word timing.',
  },
  {
    type: 'shot_planning',
    label: 'Shot Planner',
    inputs: 'Audio timestamps, script text',
    outputs: 'Shot list with media type assignments, segment timing',
    description: 'Segments script into shots and assigns media types (image, video, MG).',
  },
  {
    type: 'lora_sync',
    label: 'LoRA Sync',
    inputs: 'LoRA config from manifest',
    outputs: 'Confirmation that LoRAs are available on GPU',
    description: 'Syncs user LoRA models from R2 to GPU API.',
  },
  {
    type: 'prompt_generation',
    label: 'Prompt Generation',
    inputs: 'Shot list, creative manifest, entity references',
    outputs: 'Per-shot prompts for each media worker',
    description: 'Generates optimized prompts for image, video, and MG agents.',
  },
  {
    type: 'stock_media',
    label: 'Stock Media Search',
    inputs: 'Search queries from prompts',
    outputs: 'Stock image/video URLs',
    description: 'Searches Pexels/Pixabay for stock B-roll footage.',
  },
  {
    type: 'image_gen',
    label: 'Image Generation',
    inputs: 'Image prompts, optional LoRA name',
    outputs: 'Generated image URLs',
    description: 'Generates keyframe images using Z-Image Turbo on GPU.',
  },
  {
    type: 'video_gen',
    label: 'Video Generation',
    inputs: 'Keyframe images, motion prompts',
    outputs: 'Generated video clip URLs',
    description: 'Creates motion video from keyframes using LTX-2 on GPU.',
  },
  {
    type: 'mg_gen',
    label: 'Motion Graphics Generation',
    inputs: 'MG composition specs, reference images',
    outputs: 'Remotion compositions / rendered MG clips',
    description: 'Creates data visualizations, quote cards, timelines, etc.',
  },
  {
    type: 'mg_pass2',
    label: 'MG Pass 2 (Swap)',
    inputs: 'MG compositions, verified clips',
    outputs: 'Swap decisions (which clips to replace with MG)',
    description: 'Evaluates where MG compositions should replace AI-generated clips.',
  },
  {
    type: 'music_gen',
    label: 'Music Generation',
    inputs: 'Audio duration, script text, creative manifest mood/genre, shot plan boundaries',
    outputs: 'Multi-segment background music URLs with transition metadata (crossfade durations, volume)',
    description: 'AI music director plans segmented instrumental background music via ACE-Step 1.5. Generates instrument-only tracks with shared seed/BPM/key for timbral consistency, crossfaded transitions aligned to narrative arc (build-up → climax → resolution).',
  },
  {
    type: 'sfx_gen',
    label: 'SFX Generation',
    inputs: 'Shot context, word timestamps',
    outputs: 'Sound effect URLs with timing',
    description: 'Creates or finds sound effects timed to narration.',
  },
  {
    type: 'verification',
    label: 'Visual Verification',
    inputs: 'Generated media URLs, shot descriptions',
    outputs: 'PASS/FAIL verdicts with feedback',
    description: 'VLM-based quality check against shot descriptions and style guide.',
  },
  {
    type: 'clip_trimming',
    label: 'Clip Trimming',
    inputs: 'Verified media URLs, shot timing',
    outputs: 'Trimmed clips with timing',
    description: 'Trims clips to match shot durations from the shot plan.',
  },
  {
    type: 'edit_assembly',
    label: 'Edit Assembly',
    inputs: 'Trimmed clips, MG, music, SFX',
    outputs: 'Edit Decision List (EDL)',
    description: 'Assembles all media into a final timeline.',
  },
  {
    type: 'pacing_review',
    label: 'Pacing Review',
    inputs: 'Assembled EDL',
    outputs: 'Pacing adjustments',
    description: 'Reviews and adjusts timing for optimal viewer engagement.',
  },
];

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

const COMPOSER_SYSTEM_PROMPT = `You are a video production pipeline architect. You design custom production DAGs (directed acyclic graphs) for AI video generation.

## AVAILABLE WORKERS
{WORKER_CATALOG}

## RULES
1. Every graph MUST start with "tts" (text-to-speech) — this produces audio and timestamps
2. "shot_planning" MUST depend on "tts"
3. "prompt_generation" MUST depend on "shot_planning"
4. "edit_assembly" should be near the end, receiving media from upstream nodes
5. "pacing_review" should be the final node
6. You can add nodes that don't exist in the worker catalog IF they are marked with type "custom"
7. Nodes that can run in parallel SHOULD be parallelized
8. Never create cycles (A → B → A is illegal)
9. Each node needs a unique ID

## WHEN TO COMPOSE CUSTOM GRAPHS
- When no preset template fits the content
- When the user's creative direction requires unusual pipeline ordering
- When specific media types should be generated BEFORE others to serve as style references

## OUTPUT FORMAT
Return valid JSON:
{
  "template": {
    "id": "custom_<descriptive_name>",
    "name": "Human readable name",
    "description": "Why this graph was designed this way",
    "contentTypes": ["custom"],
    "nodes": [{ "id": "tts", "type": "tts", "label": "Text-to-Speech", "dependencies": [], "skippable": false }],
    "edges": [{ "from": "tts", "to": "shot_planning", "dataFlow": "audio + timestamps" }]
  },
  "reasoning": "Detailed explanation of design decisions",
  "compositionType": "fully_custom",
  "modifications": []
}`;

// ============================================================================
// COMPOSER
// ============================================================================

/**
 * Compose a custom graph for complex or unusual content.
 * Only called when the intent classifier's confidence is low
 * or when the content doesn't fit any preset template well.
 */
export async function composeCustomGraph(
  userId: string,
  scriptText: string,
  manifest: CreativeManifest,
  classification: ClassificationResult,
): Promise<ComposedGraph> {
  console.log(`${LOG_PREFIX} Composing custom graph (classifier confidence: ${classification.confidence})...`);

  const workerCatalogStr = WORKER_CATALOG.map(
    (w) =>
      `- **${w.label}** (type: "${w.type}")\n  In: ${w.inputs}\n  Out: ${w.outputs}\n  ${w.description}`,
  ).join('\n');

  const systemPrompt = COMPOSER_SYSTEM_PROMPT.replace(
    '{WORKER_CATALOG}',
    workerCatalogStr,
  );

  // Truncate script
  const truncatedScript =
    scriptText.length > 2000
      ? scriptText.slice(0, 2000) + '\n... [truncated]'
      : scriptText;

  const userPrompt = `## CONTENT ANALYSIS
${JSON.stringify(classification.contentAnalysis, null, 2)}

## SCRIPT (excerpt)
${truncatedScript}

## CREATIVE MANIFEST SUMMARY
- Visual style: ${manifest.style?.visual_style || 'cinematic'}
- Media weighting: stock=${manifest.media_weighting?.stock_footage ?? 0.3}, video=${manifest.media_weighting?.ai_video ?? 0.4}, mg=${manifest.media_weighting?.motion_graphics ?? 0.2}, image=${manifest.media_weighting?.ai_image_static ?? 0.1}
- Pacing: ${manifest.editing?.pacing_preset || 'documentary'}
- LoRA: ${manifest.lora ? manifest.lora.name : 'none'}
- MG theme: ${manifest.motion_graphics?.theme || 'default'}

Design the optimal production pipeline for this content.`;

  try {
    const response = await callOpenRouter(
      userId,
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { model: 'google/gemini-3-flash-preview' },
    );

    const composed = parseComposedGraph(response.content);
    console.log(
      `${LOG_PREFIX} Composed graph: "${composed.template.name}" (${composed.template.nodes.length} nodes, ${composed.template.edges.length} edges)`,
    );
    return composed;
  } catch (err) {
    console.warn(`${LOG_PREFIX} Composition failed, falling back to preset:`, err);
    // Fall back to the classified template
    const { getGraphTemplate } = await import('./graph-templates');
    return {
      template: getGraphTemplate(classification.templateId),
      reasoning: 'Fallback to preset template after composition failure',
      compositionType: 'modified_preset',
    };
  }
}

// ============================================================================
// PARSING
// ============================================================================

function parseComposedGraph(rawResponse: string): ComposedGraph {
  let cleaned = rawResponse.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();

  const parsed = JSON.parse(cleaned);

  // Validate basic structure
  if (!parsed.template?.nodes || !parsed.template?.edges) {
    throw new Error('Invalid graph structure: missing nodes or edges');
  }

  // Ensure every node has required fields
  const nodes: GraphNode[] = parsed.template.nodes.map((n: Record<string, unknown>) => ({
    id: n.id as string,
    type: (n.type as NodeType) || ('custom' as NodeType),
    label: (n.label as string) || (n.id as string),
    dependencies: (n.dependencies as string[]) || [],
    skippable: (n.skippable as boolean) || false,
    skipCondition: n.skipCondition as string | undefined,
    estimatedDurationSec: n.estimatedDurationSec as number | undefined,
  }));

  const edges: GraphEdge[] = parsed.template.edges.map((e: Record<string, unknown>) => ({
    from: e.from as string,
    to: e.to as string,
    dataFlow: e.dataFlow as string | undefined,
  }));

  return {
    template: {
      id: parsed.template.id || `custom_${Date.now()}`,
      name: parsed.template.name || 'Custom Pipeline',
      description: parsed.template.description || 'LLM-composed pipeline',
      contentTypes: parsed.template.contentTypes || ['custom'],
      nodes,
      edges,
    },
    reasoning: parsed.reasoning || 'No reasoning provided',
    compositionType: parsed.compositionType || 'fully_custom',
    modifications: parsed.modifications,
  };
}

/**
 * Export the worker catalog for use by other services (e.g., graph reviewer).
 */
export { WORKER_CATALOG };
