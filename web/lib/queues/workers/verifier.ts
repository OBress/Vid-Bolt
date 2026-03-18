/**
 * VLM Verifier Worker
 * ============================================================================
 * Uses Gemini 3 Flash as a frozen VLM critic to evaluate generated images
 * and videos against the shot description, GCM entity references, and
 * style guide from the Creative Manifest.
 *
 * Evaluates 5 dimensions:
 *   1. Semantic Alignment      — does the output match the shot description?
 *   2. Entity Consistency      — do characters/settings match GCM references?
 *   3. Temporal Continuity     — smooth transition from previous shot?
 *   4. Visual Quality          — free of artifacts (hands, flickering)?
 *   5. Style Consistency       — matches the approved style guide?
 *   6. Thematic Consistency    — belongs to the same video as declared creative direction?
 *
 * Returns a three-tier verdict:
 *   PASS      — fully acceptable for the final video
 *   SOFT_FAIL — usable but has quality concerns (forwarded as warnings to the editor)
 *   FAIL      — fundamentally wrong, needs regeneration
 */

import { Job, Processor } from 'bullmq';
import { getOpenRouterApiKey } from '@/lib/services/api-keys';
import { callOpenRouterWithKey } from '@/lib/ai/openrouter';
import type { OpenRouterMessage } from '@/lib/ai/openrouter';
// Static video detection removed — VLM verifier catches bad media directly

// ============================================================================
// TYPES
// ============================================================================

export type VerifierVerdict = 'PASS' | 'SOFT_FAIL' | 'FAIL';
export type FailureType = 'recoverable' | 'fundamental';
export type RecommendedAction = 're-edit' | 'regenerate' | 'accept';

export interface DimensionFeedback {
  semantic_alignment: string;
  entity_consistency: string;
  temporal_continuity: string;
  visual_quality: string;
  style_consistency: string;
  /** Does this shot feel like it belongs to the same video? Matches creative direction? */
  thematic_consistency: string;
}

export interface VerifierResult {
  verdict: VerifierVerdict;
  failure_type?: FailureType;
  dimension_feedback: DimensionFeedback;
  suggested_corrections: string[];
  recommended_action: RecommendedAction;
  confidence: number; // 0-1
}

export interface VerifierJobData {
  taskId: string;
  userId: string;
  videoId: string;
  /** Type of media being verified */
  mediaType: 'image' | 'video';
  /** URL of the generated media to verify */
  mediaUrl: string;
  /** The shot description / visual prompt that was used to generate the media */
  shotDescription: string;
  /** Shot index for traceability */
  shotIndex: number;
  /** GCM entity reference URLs for consistency checking */
  entityReferences?: Array<{
    name: string;
    referenceUrl: string;
    description: string;
  }>;
  /** URL of the previous shot's output for temporal continuity checking */
  previousShotUrl?: string;
  /** Style guide excerpt from the Creative Manifest */
  styleGuide?: string;
  /** If this is a re-verification after edits, include the original feedback */
  previousFeedback?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const LOG_PREFIX = '[Verifier]';
const VERIFICATION_MODEL = 'google/gemini-3-flash-preview';

/** Gemini 3.1 Pro for meta-review of borderline verdicts (deeper reasoning) */
const META_REVIEW_MODEL = 'google/gemini-3.1-pro-preview';

/**
 * Confidence range that triggers a meta-review.
 * Below MIN = clearly bad, above MAX = clearly good — no second opinion needed.
 */
const META_REVIEW_CONFIDENCE_MIN = 0.4;
const META_REVIEW_CONFIDENCE_MAX = 0.7;

/** Check if a URL points to a video file (not an image). */
function isVideoUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return /\.(mp4|webm|mov|avi|mkv)$/.test(pathname);
  } catch {
    return url.toLowerCase().includes('.mp4') ||
           url.toLowerCase().includes('.webm') ||
           url.toLowerCase().includes('.mov');
  }
}

/**
 * Number of keyframes to sample from a video for verification.
 * Always includes first + last frame.
 */
const _VIDEO_KEYFRAME_COUNT = 5;

// ============================================================================
// JSON SCHEMA FOR STRUCTURED OUTPUT
// ============================================================================

const VERIFIER_JSON_SCHEMA = {
  type: 'json_schema' as const,
  json_schema: {
    name: 'verifier_result',
    strict: true,
    schema: {
      type: 'object',
      required: ['verdict', 'failure_type', 'dimension_feedback', 'suggested_corrections', 'recommended_action', 'confidence'],
      additionalProperties: false,
      properties: {
        verdict: { type: 'string', enum: ['PASS', 'SOFT_FAIL', 'FAIL'] },
        failure_type: { type: ['string', 'null'], enum: ['recoverable', 'fundamental', null] },
        dimension_feedback: {
          type: 'object',
          required: ['semantic_alignment', 'entity_consistency', 'temporal_continuity', 'visual_quality', 'style_consistency', 'thematic_consistency'],
          additionalProperties: false,
          properties: {
            semantic_alignment: { type: 'string' },
            entity_consistency: { type: 'string' },
            temporal_continuity: { type: 'string' },
            visual_quality: { type: 'string' },
            style_consistency: { type: 'string' },
            thematic_consistency: { type: 'string' },
          },
        },
        suggested_corrections: { type: 'array', items: { type: 'string' } },
        recommended_action: { type: 'string', enum: ['re-edit', 'regenerate', 'accept'] },
        confidence: { type: 'number' },
      },
    },
  },
};

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

const VERIFIER_SYSTEM_PROMPT = `You are a visual quality critic for an automated video production pipeline.
Your role is to evaluate generated images and videos against their shot descriptions,
entity references, and style guides.

You must evaluate 6 dimensions and return a THREE-TIER verdict:
  PASS      — the output is acceptable as-is for the final video.
  SOFT_FAIL — the output is USABLE but has a clearly noticeable issue.
              The media will be included in the timeline with a warning in the editor.
  FAIL      — the output is catastrophically broken and must be regenerated.

CRITICAL — STYLE MODEL (LoRA) RULE:
If the style guide mentions a "STYLE MODEL (LoRA)", this model defines the INTENDED visual aesthetic.
The AI model's trained style IS the correct style — do NOT penalize shots for looking like the LoRA's output.

=== IMAGE-SPECIFIC RULES ===
For IMAGES, be moderately strict:
1. AI artifacts (extra fingers, melted faces, garbled text, floating objects) are FAIL.
2. Style mismatches (lighting mood, color palette, visual tone) that differ significantly from the style guide are FAIL.
3. The generated image must clearly depict the scene described. A generic or unrelated image is FAIL.
4. Wrong entity appearance (wrong hair color, clothing, character) is FAIL.

=== VIDEO-SPECIFIC RULES — PASS BY DEFAULT ===
AI-generated video CANNOT precisely match text descriptions for style, lighting, camera movement,
composition, or color grading. Regenerating with the same model produces similar results.
Therefore: for videos, you should return PASS approximately 90% of the time.

FAIL — ONLY for catastrophically broken video. ALL of these must be true:
  - The video is frozen (same frame repeating, zero motion throughout)
  - OR black screen / no visible content at all
  - OR extreme full-frame corruption (garbled noise, unwatchable distortion)
  - OR completely static with absolutely zero motion of any kind
  NOTHING ELSE IS A FAIL FOR VIDEOS. Not wrong subject, not wrong lighting, not wrong style.
  For frozen/corrupted/static failures, include "SIMPLIFY_PROMPT" as the FIRST item in
  suggested_corrections — complex prompts can cause these artifacts in video models.

SOFT_FAIL — ONLY when something is DRAMATICALLY wrong (not subtly wrong):
  - The subject is completely wrong: description says "a cat" but video clearly shows a dog
  - The background/setting is DRAMATICALLY different: description says "a battlefield" but video shows "a beach"
  - The style is DRASTICALLY off: the video looks like a completely different production or art style
    (e.g., description expects realistic but video is cartoon, or vice versa)
  - A completely different character appears than what was described
  IMPORTANT: "subtly wrong" is NOT SOFT_FAIL. If the subject is roughly correct but the lighting,
  composition, colors, or minor details differ — that is PASS. SOFT_FAIL is ONLY for things that
  are so obviously wrong that any viewer would immediately notice without reading the description.

PASS — Everything else, which should be almost all videos:
  - Scene is recognizable and broadly related to the description
  - Video has some motion and isn't corrupted
  - Style/lighting/composition differs from description — PASS (AI video can't control these)
  - Missing camera movement — PASS
  - Wrong lighting mood — PASS
  - Missing volumetric lighting, film grain, depth of field — PASS
  - Minor entity inconsistencies (slightly wrong clothing, minor style drift) — PASS
  - The LoRA/model aesthetic is present — PASS
  - Minor morphing, flickering, shimmer — PASS
  - Text warping or illegible text — PASS
  - Subtle face/hand distortions — PASS

EXAMPLES:
  - Video of a Roman bust with different lighting than described → PASS
  - Video of a Roman bust that looks slightly different than previous shot → PASS
  - Video of a Roman bust but it's a car instead → SOFT_FAIL
  - Black screen / frozen frame → FAIL

=== GENERAL RULES ===
- Minor temporal discontinuities between shots are acceptable — PASS.
- If a LoRA style model is specified, ALL shots sharing that style is correct and expected — PASS.
- Thematic consistency: only SOFT_FAIL if a shot looks like it's from a completely different production.

FAILURE TYPE CLASSIFICATION (only for FAIL verdicts):
- "fundamental": The video is catastrophically broken (frozen, black, corrupted).
For SOFT_FAIL verdicts, set failure_type to null — the media is accepted.
For PASS verdicts, set failure_type to null.

PROMPT SIMPLIFICATION:
When a video FAIL is caused by visual artifacts (frozen, static, corrupted frames),
include "SIMPLIFY_PROMPT" as the first suggested_correction. This signals to the
video generation system that the prompt may be too complex and should be simplified
on retry. Do NOT suggest SIMPLIFY_PROMPT for OOM errors or API failures.

Respond ONLY with valid JSON matching this schema:
{
  "verdict": "PASS" | "SOFT_FAIL" | "FAIL",
  "failure_type": "recoverable" | "fundamental" | null,
  "dimension_feedback": {
    "semantic_alignment": "Brief assessment",
    "entity_consistency": "Brief assessment",
    "temporal_continuity": "Brief assessment",
    "visual_quality": "Brief assessment",
    "style_consistency": "Brief assessment",
    "thematic_consistency": "Brief assessment"
  },
  "suggested_corrections": ["correction 1", "correction 2"],
  "recommended_action": "re-edit" | "regenerate" | "accept",
  "confidence": 0.0-1.0
}`;

// ============================================================================
// MULTIMODAL API CALL (via central module)
// ============================================================================

/**
 * Call OpenRouter with multimodal content (text + images/videos).
 * Uses the central callOpenRouterWithKey for rate limiting and retries.
 */
async function callVisionModel(
  apiKey: string,
  systemPrompt: string,
  userContent: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } } | { type: 'video_url'; video_url: { url: string } }>,
  config?: { model?: string; temperature?: number; maxTokens?: number }
): Promise<string> {
  const response = await callOpenRouterWithKey(apiKey, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent },
  ], {
    model: config?.model || VERIFICATION_MODEL,
    temperature: config?.temperature ?? 0.2,
    maxTokens: config?.maxTokens ?? 2048,
    xTitle: 'Vid-Bolt Verifier',
    responseFormat: VERIFIER_JSON_SCHEMA,
  });

  return response.content;
}

// ============================================================================
// VERIFICATION LOGIC
// ============================================================================

/**
 * Build the user prompt with all context for verification.
 */
function buildVerificationPrompt(jobData: VerifierJobData): Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } } | { type: 'video_url'; video_url: { url: string } }> {
  const content: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } } | { type: 'video_url'; video_url: { url: string } }> = [];

  // Context text
  let contextText = `## Shot ${jobData.shotIndex + 1} Verification\n\n`;
  contextText += `**Media Type:** ${jobData.mediaType}\n`;
  contextText += `**Shot Description:** ${jobData.shotDescription}\n\n`;

  if (jobData.styleGuide) {
    contextText += `**Style Guide:** ${jobData.styleGuide}\n\n`;
  }

  if (jobData.previousFeedback) {
    contextText += `**Previous Feedback (this is a re-verification):** ${jobData.previousFeedback}\n\n`;
  }

  // Entity context
  if (jobData.entityReferences && jobData.entityReferences.length > 0) {
    contextText += `**Entity References:**\n`;
    for (const entity of jobData.entityReferences) {
      contextText += `- ${entity.name}: ${entity.description}\n`;
    }
    contextText += '\n';
  }

  content.push({ type: 'text', text: contextText });

  // Generated media to verify
  content.push({ type: 'text', text: '**Generated output to verify:**' });
  // Use the correct content type: video_url for videos, image_url for images
  if (jobData.mediaType === 'video') {
    content.push({ type: 'video_url', video_url: { url: jobData.mediaUrl } } as any);
  } else {
    content.push({ type: 'image_url', image_url: { url: jobData.mediaUrl } });
  }

  // Entity reference images for comparison
  // Skip video URLs — Gemini only accepts image formats for image_url parts.
  // Text descriptions (included above) suffice for entity consistency checks.
  if (jobData.entityReferences) {
    for (const entity of jobData.entityReferences) {
      if (entity.referenceUrl && !isVideoUrl(entity.referenceUrl)) {
        content.push({ type: 'text', text: `**Reference for ${entity.name}:**` });
        content.push({ type: 'image_url', image_url: { url: entity.referenceUrl } });
      }
    }
  }

  // Previous shot for temporal continuity
  if (jobData.previousShotUrl) {
    content.push({ type: 'text', text: '**Previous shot (for temporal continuity check):**' });
    if (isVideoUrl(jobData.previousShotUrl)) {
      content.push({ type: 'video_url', video_url: { url: jobData.previousShotUrl } } as any);
    } else {
      content.push({ type: 'image_url', image_url: { url: jobData.previousShotUrl } });
    }
  }

  content.push({ type: 'text', text: '\nPlease evaluate this generated output and respond with the JSON verdict.' });

  return content;
}

// ============================================================================
// META-REVIEW (BORDERLINE CASES)
// ============================================================================

/**
 * Build a meta-review prompt for borderline verifier verdicts.
 * Asks a more powerful model to reconsider the initial assessment.
 */
function buildMetaReviewPrompt(
  shotIndex: number,
  initialResult: VerifierResult,
  mediaType: string
): string {
  const feedbackSummary = Object.entries(initialResult.dimension_feedback)
    .map(([dim, feedback]) => `  - ${dim}: ${feedback}`)
    .join('\n');

  return `You are reviewing a verification verdict for shot ${shotIndex + 1} (${mediaType}).

The initial assessment returned:
  Verdict: ${initialResult.verdict}
  Confidence: ${initialResult.confidence}
  Failure type: ${initialResult.failure_type || 'N/A'}
  Dimension feedback:
${feedbackSummary}
  Suggested corrections: ${initialResult.suggested_corrections.join('; ') || 'None'}

This verdict has LOW CONFIDENCE (${initialResult.confidence}), meaning the initial reviewer was uncertain.

Please reflect on this assessment:
1. Was the initial verdict too strict? AI-generated video naturally has minor imperfections.
2. Was the initial verdict too lenient? Would this media confuse or distract a viewer?
3. Are the suggested corrections actionable and accurate?

Return your revised assessment as JSON with the same schema:
{
  "verdict": "PASS" | "FAIL",
  "failure_type": "recoverable" | "fundamental" | null,
  "dimension_feedback": { ... },
  "suggested_corrections": [...],
  "recommended_action": "re-edit" | "regenerate" | "accept",
  "confidence": 0.0-1.0
}`;
}

/**
 * Perform a meta-review of a borderline verifier verdict using Gemini 3.1 Pro.
 * Returns the revised result, or the original if the meta-review fails.
 */
async function performMetaReview(
  apiKey: string,
  shotIndex: number,
  initialResult: VerifierResult,
  mediaType: string
): Promise<{ result: VerifierResult; overturned: boolean }> {
  try {
    const metaPrompt = buildMetaReviewPrompt(shotIndex, initialResult, mediaType);

    // Call Gemini 3.1 Pro via the central module
    const response = await callOpenRouterWithKey(apiKey, [
      { role: 'system', content: 'You are a senior quality reviewer for an AI video production pipeline. Your role is to provide a second opinion on borderline verification verdicts.' },
      { role: 'user', content: metaPrompt },
    ], {
      model: META_REVIEW_MODEL,
      temperature: 0.1,
      maxTokens: 2048,
      xTitle: 'Vid-Bolt Verifier Meta-Review',
    });

    const revisedResult = parseVerifierResponse(response.content);
    const overturned = revisedResult.verdict !== initialResult.verdict;

    if (overturned) {
      console.log(
        `${LOG_PREFIX} Shot ${shotIndex}: Meta-review OVERTURNED verdict ` +
        `${initialResult.verdict} → ${revisedResult.verdict} ` +
        `(confidence: ${initialResult.confidence} → ${revisedResult.confidence})`
      );
    } else {
      console.log(
        `${LOG_PREFIX} Shot ${shotIndex}: Meta-review CONFIRMED verdict ` +
        `${initialResult.verdict} (confidence: ${initialResult.confidence} → ${revisedResult.confidence})`
      );
    }

    return { result: revisedResult, overturned };
  } catch (error) {
    console.warn(`${LOG_PREFIX} Shot ${shotIndex}: Meta-review failed, using initial result:`, error);
    return { result: initialResult, overturned: false };
  }
}

/**
 * Parse the Gemini response into a structured VerifierResult.
 */
function parseVerifierResponse(rawResponse: string): VerifierResult {
  // Strip markdown fences if present
  let cleaned = rawResponse.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  try {
    const parsed = JSON.parse(cleaned);

    // Validate required fields
    if (!parsed.verdict || !['PASS', 'SOFT_FAIL', 'FAIL'].includes(parsed.verdict)) {
      throw new Error('Invalid verdict');
    }

    return {
      verdict: parsed.verdict,
      failure_type: parsed.failure_type || undefined,
      dimension_feedback: {
        semantic_alignment: parsed.dimension_feedback?.semantic_alignment || 'Not evaluated',
        entity_consistency: parsed.dimension_feedback?.entity_consistency || 'Not evaluated',
        temporal_continuity: parsed.dimension_feedback?.temporal_continuity || 'Not evaluated',
        visual_quality: parsed.dimension_feedback?.visual_quality || 'Not evaluated',
        style_consistency: parsed.dimension_feedback?.style_consistency || 'Not evaluated',
        thematic_consistency: parsed.dimension_feedback?.thematic_consistency || 'Not evaluated',
      },
      suggested_corrections: parsed.suggested_corrections || [],
      recommended_action: parsed.recommended_action || 'accept',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    };
  } catch (_parseError) {
    console.error(`${LOG_PREFIX} Failed to parse verifier response:`, cleaned.substring(0, 200));

    // Fallback: if we can't parse, default to FAIL — malformed verification
    // should NOT auto-approve media. The orchestrator's Best-Fit Salvage
    // already handles FAILed shots gracefully.
    return {
      verdict: 'FAIL',
      failure_type: 'fundamental' as FailureType,
      dimension_feedback: {
        semantic_alignment: 'Parse error — verification result unusable',
        entity_consistency: 'Parse error — verification result unusable',
        temporal_continuity: 'Parse error — verification result unusable',
        visual_quality: 'Parse error — verification result unusable',
        style_consistency: 'Parse error — verification result unusable',
        thematic_consistency: 'Parse error — verification result unusable',
      },
      suggested_corrections: ['Verification response could not be parsed — regenerate media'],
      recommended_action: 'regenerate' as RecommendedAction,
      confidence: 0.0,
    };
  }
}

// ============================================================================
// PROCESSOR
// ============================================================================

export const verifierProcessor: Processor<VerifierJobData> = async (
  job: Job<VerifierJobData>
) => {
  const { taskId: _taskId, userId, videoId, mediaType, mediaUrl: _mediaUrl, shotIndex } = job.data;

  console.log(`${LOG_PREFIX} Verifying shot ${shotIndex} (${mediaType}) for video ${videoId}`);

  const MAX_VERIFIER_RETRIES = 2;
  let lastError: Error | null = null;

  try {
    const apiKey = await getOpenRouterApiKey(userId);
    const userContent = buildVerificationPrompt(job.data);

    // SSIM pre-check removed (C1) — VLM verifier catches static/bad media directly

    for (let attempt = 1; attempt <= MAX_VERIFIER_RETRIES; attempt++) {
      try {
        console.log(`${LOG_PREFIX} Calling Gemini 3 Flash for shot ${shotIndex} (attempt ${attempt}/${MAX_VERIFIER_RETRIES})...`);
        const rawResponse = await callVisionModel(apiKey, VERIFIER_SYSTEM_PROMPT, userContent);
        const result = parseVerifierResponse(rawResponse);

        // If parse succeeded with real confidence, use it
        if (result.confidence > 0.3) {
          // -----------------------------------------------------------
          // Meta-review for borderline cases (confidence 0.4-0.7)
          // -----------------------------------------------------------
          let finalResult = result;

          if (
            result.confidence >= META_REVIEW_CONFIDENCE_MIN &&
            result.confidence <= META_REVIEW_CONFIDENCE_MAX
          ) {
            console.log(
              `${LOG_PREFIX} Shot ${shotIndex}: Borderline confidence (${result.confidence}) — triggering meta-review`
            );
            const metaReview = await performMetaReview(apiKey, shotIndex, result, mediaType);
            finalResult = metaReview.result;
          }

          console.log(`${LOG_PREFIX} Shot ${shotIndex}: ${finalResult.verdict} (confidence: ${finalResult.confidence}, action: ${finalResult.recommended_action})`);
          if (finalResult.verdict === 'FAIL') {
            console.log(`${LOG_PREFIX} Shot ${shotIndex} failure type: ${finalResult.failure_type}`);
            console.log(`${LOG_PREFIX} Corrections: ${finalResult.suggested_corrections.join('; ')}`);
          } else if (finalResult.verdict === 'SOFT_FAIL') {
            console.log(`${LOG_PREFIX} Shot ${shotIndex} soft-fail (usable): ${finalResult.suggested_corrections.join('; ')}`);
          }
          return { success: true, shotIndex, videoId, result: finalResult };
        }

        // Low confidence (likely partial parse) — retry if we have attempts left
        console.warn(`${LOG_PREFIX} Shot ${shotIndex} attempt ${attempt}: low confidence (${result.confidence}), retrying...`);
        lastError = new Error(`Low confidence parse: ${result.confidence}`);

        if (attempt < MAX_VERIFIER_RETRIES) {
          await new Promise(r => setTimeout(r, 2000 * attempt));
        } else {
          // Last attempt — use whatever we got rather than failing completely
          console.warn(`${LOG_PREFIX} Shot ${shotIndex}: using low-confidence result after ${MAX_VERIFIER_RETRIES} attempts`);
          return { success: true, shotIndex, videoId, result, verificationSkipped: true };
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error('Unknown error');
        console.warn(`${LOG_PREFIX} Shot ${shotIndex} attempt ${attempt} failed: ${lastError.message}`);
        if (attempt < MAX_VERIFIER_RETRIES) {
          await new Promise(r => setTimeout(r, 2000 * attempt));
        }
      }
    }
  } catch (outerError) {
    // API key retrieval or prompt building failed — no retry helps
    lastError = outerError instanceof Error ? outerError : new Error('Unknown error');
    console.error(`${LOG_PREFIX} Verification setup failed for shot ${shotIndex}:`, lastError);
  }

  // All retries exhausted — return FAIL so bad media doesn't silently pass.
  // The orchestrator's Best-Fit Salvage will handle this gracefully.
  console.warn(`${LOG_PREFIX} Shot ${shotIndex}: all ${MAX_VERIFIER_RETRIES} verification attempts failed — defaulting to FAIL`);
  return {
    success: false,
    shotIndex,
    videoId,
    verificationSkipped: true,
    result: {
      verdict: 'FAIL' as VerifierVerdict,
      failure_type: 'fundamental' as FailureType,
      dimension_feedback: {
        semantic_alignment: 'Verification failed after all retries',
        entity_consistency: 'Verification failed after all retries',
        temporal_continuity: 'Verification failed after all retries',
        visual_quality: 'Verification failed after all retries',
        style_consistency: 'Verification failed after all retries',
        thematic_consistency: 'Verification failed after all retries',
      },
      suggested_corrections: ['All verification attempts failed — regenerate media'],
      recommended_action: 'regenerate' as RecommendedAction,
      confidence: 0.0,
    } satisfies VerifierResult,
    error: lastError?.message || 'Max retries exhausted',
  };
};
