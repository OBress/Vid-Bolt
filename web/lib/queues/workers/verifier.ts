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
 * Returns a binary PASS/FAIL verdict with qualitative feedback.
 */

import { Job, Processor } from 'bullmq';
import { getSupabaseServiceClient } from '@/lib/queues/shared';
import { getOpenRouterApiKey } from '@/lib/services/api-keys';
// Static video detection removed — VLM verifier catches bad media directly

// ============================================================================
// TYPES
// ============================================================================

export type VerifierVerdict = 'PASS' | 'FAIL';
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
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const VERIFICATION_MODEL = 'google/gemini-3-flash-preview';

/** Gemini 3.1 Pro for meta-review of borderline verdicts (deeper reasoning) */
const META_REVIEW_MODEL = 'google/gemini-3.1-pro-preview';

/**
 * Confidence range that triggers a meta-review.
 * Below MIN = clearly bad, above MAX = clearly good — no second opinion needed.
 */
const META_REVIEW_CONFIDENCE_MIN = 0.4;
const META_REVIEW_CONFIDENCE_MAX = 0.7;

/**
 * Number of keyframes to sample from a video for verification.
 * Always includes first + last frame.
 */
const VIDEO_KEYFRAME_COUNT = 5;

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

const VERIFIER_SYSTEM_PROMPT = `You are a visual quality critic for an automated video production pipeline.
Your role is to evaluate generated images and videos against their shot descriptions,
entity references, and style guides with strict but fair judgment.

You must evaluate 6 dimensions and provide a binary PASS/FAIL verdict.
A PASS means the output is acceptable for the final video. A FAIL means it needs revision.

IMPORTANT RULES:
1. Be strict on entity consistency — wrong hair color, clothing, or character appearance is ALWAYS a FAIL.
2. Be lenient on artistic interpretation — slightly different compositions or angles are fine if semantically correct.

IMAGE-SPECIFIC RULES:
3. For IMAGES: AI artifacts (extra fingers, melted faces, garbled text, floating objects) are FAIL.
4. For IMAGES: Style mismatches (lighting mood, color palette, visual tone) that differ significantly from the style guide are FAIL.
5. For IMAGES: The generated image must clearly depict the scene described. A generic or unrelated image is a fundamental FAIL.

VIDEO-SPECIFIC RULES (AI-generated video inherently has minor imperfections):
5. For VIDEOS: Only FAIL if:
   - The scene is completely wrong or unrecognizable vs the description
   - The video is essentially static with no meaningful motion
   - There are extreme distortions (entire frame warping, subjects morphing into different objects)
   - The video would confuse or distract the viewer from the narration
6. For VIDEOS: These are ACCEPTABLE (PASS):
   - Minor text warping or illegible text (AI cannot render text well)
   - Subtle face/hand distortions that don't dominate the frame
   - Slight temporal flickering or shimmer on textures
   - Minor geometry warping on buildings, objects, or backgrounds
   - Slight color/lighting shifts during camera movement
   - Minor morphing between frames if the overall motion reads correctly

GENERAL:
7. Minor temporal discontinuities between shots are acceptable — major scene breaks are FAIL.

THEMATIC CONSISTENCY:
8. Every shot must feel like it belongs to the SAME VIDEO. Compare against the style guide (creative direction).
   - If the style guide says "warm cinematic" but the shot looks like cold industrial footage, that's a thematic mismatch.
   - If the creative direction mentions a specific aesthetic and the shot completely ignores it, FAIL.
   - Be lenient here: the shot doesn't need to perfectly match, but it shouldn't feel like it's from a different video.

For FAIL verdicts, classify as:
- "recoverable": The issue can be fixed by editing (wrong color, lighting adjustment, style mismatch)
- "fundamental": The base image/video is wrong and must be regenerated (wrong scene, wrong entity, wrong composition)

Respond ONLY with valid JSON matching this schema:
{
  "verdict": "PASS" | "FAIL",
  "failure_type": "recoverable" | "fundamental" | null,
  "dimension_feedback": {
    "semantic_alignment": "Brief assessment",
    "entity_consistency": "Brief assessment",
    "temporal_continuity": "Brief assessment",
    "visual_quality": "Brief assessment",
    "style_consistency": "Brief assessment",
    "thematic_consistency": "Brief assessment — does this shot feel like it belongs to the same video?"
  },
  "suggested_corrections": ["correction 1", "correction 2"],
  "recommended_action": "re-edit" | "regenerate" | "accept",
  "confidence": 0.0-1.0
}`;

// ============================================================================
// MULTIMODAL API CALL
// ============================================================================

/**
 * Call OpenRouter with multimodal content (text + images).
 * The standard callOpenRouter() only supports text messages, so we use
 * the raw API for vision calls.
 */
async function callVisionModel(
  apiKey: string,
  systemPrompt: string,
  userContent: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>
): Promise<string> {
  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      'X-Title': 'Vid-Bolt Verifier',
    },
    body: JSON.stringify({
      model: VERIFICATION_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: 0.2, // Low temperature for consistent scoring
      max_tokens: 2048,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'verifier_result',
          strict: true,
          schema: {
            type: 'object',
            required: ['verdict', 'failure_type', 'dimension_feedback', 'suggested_corrections', 'recommended_action', 'confidence'],
            additionalProperties: false,
            properties: {
              verdict: { type: 'string', enum: ['PASS', 'FAIL'] },
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
      },
    }),
  });

  const responseText = await response.text();

  if (responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')) {
    throw new Error(`OpenRouter returned error page. Status: ${response.status}`);
  }

  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(`Invalid JSON from OpenRouter: ${responseText.substring(0, 200)}`);
  }

  if (!response.ok) {
    const errorMessage = data.error?.message || `HTTP ${response.status}`;
    throw new Error(`Verifier API error: ${errorMessage}`);
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('No content in verifier API response');
  }

  return content;
}

// ============================================================================
// VERIFICATION LOGIC
// ============================================================================

/**
 * Build the user prompt with all context for verification.
 */
function buildVerificationPrompt(jobData: VerifierJobData): Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> {
  const content: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [];

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
  if (jobData.entityReferences) {
    for (const entity of jobData.entityReferences) {
      if (entity.referenceUrl) {
        content.push({ type: 'text', text: `**Reference for ${entity.name}:**` });
        content.push({ type: 'image_url', image_url: { url: entity.referenceUrl } });
      }
    }
  }

  // Previous shot for temporal continuity
  if (jobData.previousShotUrl) {
    content.push({ type: 'text', text: '**Previous shot (for temporal continuity check):**' });
    content.push({ type: 'image_url', image_url: { url: jobData.previousShotUrl } });
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

    // Call Gemini 3.1 Pro for deeper reasoning
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        'X-Title': 'Vid-Bolt Verifier Meta-Review',
      },
      body: JSON.stringify({
        model: META_REVIEW_MODEL,
        messages: [
          { role: 'system', content: 'You are a senior quality reviewer for an AI video production pipeline. Your role is to provide a second opinion on borderline verification verdicts.' },
          { role: 'user', content: metaPrompt },
        ],
        temperature: 0.1,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      throw new Error(`Meta-review API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content in meta-review response');
    }

    const revisedResult = parseVerifierResponse(content);
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
    if (!parsed.verdict || !['PASS', 'FAIL'].includes(parsed.verdict)) {
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
  } catch (parseError) {
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
  const { taskId, userId, videoId, mediaType, mediaUrl, shotIndex } = job.data;

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
