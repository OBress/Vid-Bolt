/**
 * Intent Classifier
 * ============================================================================
 * Lightweight LLM call that analyzes a script + manifest to determine:
 * 1. The best graph template (documentary, montage, comparison, tutorial)
 * 2. Which phases can be skipped (e.g., skip SFX if minimal, skip MG if zero weight)
 *
 * This is the entry point for dynamic orchestration: instead of always
 * running all 5 phases, the classifier selects the optimal pipeline.
 */

import { callOpenRouter } from '@/lib/ai/openrouter';
import { getTemplateCatalog } from './graph-templates';
import type { CreativeManifest } from '@/lib/types/closed-loop';

// ============================================================================
// TYPES
// ============================================================================

export interface ClassificationResult {
  /** Selected graph template ID */
  templateId: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Reasoning for the selection */
  reasoning: string;
  /** Suggested node skips (node IDs that should be skipped) */
  suggestedSkips: string[];
  /** Content analysis metadata */
  contentAnalysis: {
    dominantContentType: string;
    hasComparisons: boolean;
    hasMGHeavyContent: boolean;
    isDataDriven: boolean;
    paceCategory: 'slow' | 'medium' | 'fast';
    estimatedShotCount: number;
  };
}

const LOG_PREFIX = '[IntentClassifier]';

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

const CLASSIFICATION_SYSTEM_PROMPT = `You are a content pipeline optimizer for an AI video production system.

Your job: analyze a video script and creative settings, then select the optimal production pipeline.

## AVAILABLE PIPELINES
{TEMPLATE_CATALOG}

## YOUR ANALYSIS
1. Read the script and identify the dominant content type
2. Check if there are comparisons, data visualizations, or step-by-step instructions
3. Assess the pacing (fast montage vs. slow documentary vs. educational walkthrough)
4. Choose the template that best matches
5. Identify any nodes that should be skipped (e.g., stock_media if media_weighting.stock_footage = 0)

## SKIP RULES
- Skip "stock_media" if creative manifest has stock_footage weight = 0
- Skip "mg_gen" + "mg_pass2" if creative manifest has motion_graphics weight = 0
- Skip "sfx_gen" if the content is very minimal/simple
- Skip "lora_sync" if no LoRA is configured
- Skip "video_gen" ONLY for tutorial template when all shots are MG-based

## OUTPUT FORMAT
Respond ONLY with valid JSON:
{
  "templateId": "documentary" | "montage" | "comparison" | "tutorial",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of why this template fits",
  "suggestedSkips": ["node_id_1", "node_id_2"],
  "contentAnalysis": {
    "dominantContentType": "documentary",
    "hasComparisons": false,
    "hasMGHeavyContent": false,
    "isDataDriven": false,
    "paceCategory": "medium",
    "estimatedShotCount": 25
  }
}`;

// ============================================================================
// CLASSIFIER
// ============================================================================

/**
 * Classify the content intent and select the optimal graph template.
 *
 * @param userId - For API key retrieval
 * @param scriptText - The video script (narration text)
 * @param manifest - The creative manifest with media weightings etc.
 * @returns Classification result with template selection and analysis
 */
export async function classifyContentIntent(
  userId: string,
  scriptText: string,
  manifest: CreativeManifest,
): Promise<ClassificationResult> {
  console.log(`${LOG_PREFIX} Classifying content intent...`);

  // Build template catalog for the prompt
  const catalog = getTemplateCatalog();
  const catalogStr = catalog
    .map(
      (t) =>
        `- **${t.name}** (id: "${t.id}"): ${t.description}\n  Content types: ${t.contentTypes.join(', ')}`,
    )
    .join('\n');

  const systemPrompt = CLASSIFICATION_SYSTEM_PROMPT.replace(
    '{TEMPLATE_CATALOG}',
    catalogStr,
  );

  // Build user prompt with script + manifest context
  const userPrompt = buildClassificationPrompt(scriptText, manifest);

  try {
    const rawResponse = await callOpenRouter(
      userId,
      systemPrompt,
      userPrompt,
      'google/gemini-3-flash-preview',
    );

    const result = parseClassificationResponse(rawResponse);
    console.log(
      `${LOG_PREFIX} Selected template: ${result.templateId} (confidence: ${result.confidence}) — ${result.reasoning}`,
    );
    return result;
  } catch (err) {
    console.warn(
      `${LOG_PREFIX} Classification failed, falling back to documentary:`,
      err,
    );
    return getDefaultClassification(manifest);
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function buildClassificationPrompt(
  scriptText: string,
  manifest: CreativeManifest,
): string {
  // Truncate script to first 3000 chars to stay within token limits
  const truncatedScript =
    scriptText.length > 3000
      ? scriptText.slice(0, 3000) + '\n... [truncated]'
      : scriptText;

  return `## SCRIPT
${truncatedScript}

## CREATIVE MANIFEST
- Visual Style: ${manifest.style?.visual_style || 'cinematic'}
- Aspect Ratio: ${manifest.style?.aspect_ratio || '16:9'}
- Media Weighting:
  - Stock Footage: ${manifest.media_weighting?.stock_footage ?? 0.3}
  - AI Video: ${manifest.media_weighting?.ai_video ?? 0.4}
  - Motion Graphics: ${manifest.media_weighting?.motion_graphics ?? 0.2}
  - AI Image Static: ${manifest.media_weighting?.ai_image_static ?? 0.1}
- Pacing Preset: ${manifest.editing?.pacing_preset || 'documentary'}
- LoRA Configured: ${manifest.lora ? `Yes (${manifest.lora.name})` : 'No'}
- MG Theme: ${manifest.motion_graphics?.theme || 'default'}

Please classify this content and select the optimal production pipeline.`;
}

function parseClassificationResponse(rawResponse: string): ClassificationResult {
  // Strip markdown fences
  let cleaned = rawResponse.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();

  try {
    const parsed = JSON.parse(cleaned);

    // Validate template ID
    const validTemplates = ['documentary', 'montage', 'comparison', 'tutorial'];
    const templateId = validTemplates.includes(parsed.templateId)
      ? parsed.templateId
      : 'documentary';

    return {
      templateId,
      confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
      reasoning: parsed.reasoning || 'No reasoning provided',
      suggestedSkips: Array.isArray(parsed.suggestedSkips)
        ? parsed.suggestedSkips
        : [],
      contentAnalysis: {
        dominantContentType:
          parsed.contentAnalysis?.dominantContentType || templateId,
        hasComparisons: parsed.contentAnalysis?.hasComparisons || false,
        hasMGHeavyContent: parsed.contentAnalysis?.hasMGHeavyContent || false,
        isDataDriven: parsed.contentAnalysis?.isDataDriven || false,
        paceCategory: parsed.contentAnalysis?.paceCategory || 'medium',
        estimatedShotCount: parsed.contentAnalysis?.estimatedShotCount || 20,
      },
    };
  } catch {
    console.error(`${LOG_PREFIX} Failed to parse classification response`);
    return getDefaultClassification();
  }
}

/**
 * Default classification when the LLM fails.
 * Returns documentary (safest, most complete pipeline).
 */
function getDefaultClassification(
  manifest?: CreativeManifest,
): ClassificationResult {
  const skips: string[] = [];

  // Apply simple rule-based skips from manifest
  if (manifest) {
    if (!manifest.lora) skips.push('lora_sync');
    if ((manifest.media_weighting?.stock_footage ?? 0.3) === 0)
      skips.push('stock_media');
    if ((manifest.media_weighting?.motion_graphics ?? 0.2) === 0) {
      skips.push('mg_gen');
      skips.push('mg_pass2');
    }
  }

  return {
    templateId: 'documentary',
    confidence: 0.3,
    reasoning: 'Fallback to documentary (classification failed or uncertain)',
    suggestedSkips: skips,
    contentAnalysis: {
      dominantContentType: 'documentary',
      hasComparisons: false,
      hasMGHeavyContent: false,
      isDataDriven: false,
      paceCategory: 'medium',
      estimatedShotCount: 20,
    },
  };
}
