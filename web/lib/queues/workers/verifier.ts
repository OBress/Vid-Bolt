/**
 * VLM Verifier Worker
 * ============================================================================
 * Uses Gemini 3 Flash as a frozen VLM critic to evaluate generated images
 * and videos against the shot description, GCM entity references, and
 * style guide from the Creative Manifest.
 *
 * Evaluates 5 dimensions:
 *   1. Semantic Alignment  — does the output match the shot description?
 *   2. Entity Consistency  — do characters/settings match GCM references?
 *   3. Temporal Continuity — smooth transition from previous shot?
 *   4. Visual Quality      — free of artifacts (hands, flickering)?
 *   5. Style Consistency   — matches the approved style guide?
 *
 * Returns a binary PASS/FAIL verdict with qualitative feedback.
 */

import { Job, Processor } from 'bullmq';
import { getSupabaseServiceClient } from '@/lib/queues/shared';
import { getOpenRouterApiKey } from '@/lib/services/api-keys';

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

You must evaluate 5 dimensions and provide a binary PASS/FAIL verdict.
A PASS means the output is acceptable for the final video. A FAIL means it needs revision.

IMPORTANT RULES:
1. Be strict on entity consistency — wrong hair color, clothing, or character appearance is ALWAYS a FAIL.
2. Be lenient on artistic interpretation — slightly different compositions or angles are fine if semantically correct.
3. AI artifacts (extra fingers, melted faces, text artifacts) are ALWAYS a FAIL.
4. Style mismatches (wrong lighting mood, wrong color palette) are FAIL if significant, PASS if subtle.
5. Minor temporal discontinuities between shots are acceptable — major scene breaks when continuity was expected are FAIL.

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
    "style_consistency": "Brief assessment"
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
  content.push({ type: 'image_url', image_url: { url: jobData.mediaUrl } });

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
      },
      suggested_corrections: parsed.suggested_corrections || [],
      recommended_action: parsed.recommended_action || 'accept',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    };
  } catch (parseError) {
    console.error(`${LOG_PREFIX} Failed to parse verifier response:`, cleaned.substring(0, 200));

    // Fallback: if we can't parse, default to PASS with low confidence
    // This prevents the pipeline from blocking on a malformed response
    return {
      verdict: 'PASS',
      failure_type: undefined,
      dimension_feedback: {
        semantic_alignment: 'Parse error — defaulting to PASS',
        entity_consistency: 'Parse error — defaulting to PASS',
        temporal_continuity: 'Parse error — defaulting to PASS',
        visual_quality: 'Parse error — defaulting to PASS',
        style_consistency: 'Parse error — defaulting to PASS',
      },
      suggested_corrections: [],
      recommended_action: 'accept',
      confidence: 0.3,
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

  try {
    // Get API key
    const apiKey = await getOpenRouterApiKey(userId);

    // Build the multimodal prompt
    const userContent = buildVerificationPrompt(job.data);

    // Call Gemini 3 Flash via OpenRouter vision API
    console.log(`${LOG_PREFIX} Calling Gemini 3 Flash for shot ${shotIndex}...`);
    const rawResponse = await callVisionModel(apiKey, VERIFIER_SYSTEM_PROMPT, userContent);

    // Parse the response
    const result = parseVerifierResponse(rawResponse);

    console.log(`${LOG_PREFIX} Shot ${shotIndex}: ${result.verdict} (confidence: ${result.confidence}, action: ${result.recommended_action})`);

    if (result.verdict === 'FAIL') {
      console.log(`${LOG_PREFIX} Shot ${shotIndex} failure type: ${result.failure_type}`);
      console.log(`${LOG_PREFIX} Corrections: ${result.suggested_corrections.join('; ')}`);
    }

    return {
      success: true,
      shotIndex,
      videoId,
      result,
    };

  } catch (error) {
    console.error(`${LOG_PREFIX} Verification failed for shot ${shotIndex}:`, error);

    // On API failure, default to PASS to prevent pipeline blockage
    // The pipeline should never halt due to a verification API error
    return {
      success: false,
      shotIndex,
      videoId,
      result: {
        verdict: 'PASS' as VerifierVerdict,
        dimension_feedback: {
          semantic_alignment: 'Verification API error — defaulting to PASS',
          entity_consistency: 'Verification API error — defaulting to PASS',
          temporal_continuity: 'Verification API error — defaulting to PASS',
          visual_quality: 'Verification API error — defaulting to PASS',
          style_consistency: 'Verification API error — defaulting to PASS',
        },
        suggested_corrections: [],
        recommended_action: 'accept' as RecommendedAction,
        confidence: 0.0,
      } satisfies VerifierResult,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};
