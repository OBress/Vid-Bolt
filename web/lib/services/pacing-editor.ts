/**
 * Holistic Pacing Editor
 * ============================================================================
 * Post-assembly step that reviews the full video timeline for pacing issues
 * and suggests adjustments to shot durations and transitions.
 *
 * This catches batch-boundary pacing inconsistencies and ensures the final
 * video flows naturally from start to finish.
 *
 * Flow:
 *   1. Load the assembled EDL (Edit Decision List) from DB
 *   2. Serialize the timeline for LLM review
 *   3. Send to Gemini 3 Flash for holistic pacing analysis
 *   4. Return adjustment recommendations
 */

import { getOpenRouterApiKey } from '@/lib/services/api-keys';
import { getSupabaseServiceClient } from '@/lib/queues/shared';

// ============================================================================
// TYPES
// ============================================================================

export interface PacingAdjustment {
  /** Shot index to adjust */
  shotIndex: number;
  /** New duration (only if changed) */
  newDuration?: number;
  /** New transition type (only if changed) */
  newTransition?: string;
  /** Reason for the adjustment */
  reason: string;
}

export interface PacingReviewResult {
  /** List of recommended adjustments */
  adjustments: PacingAdjustment[];
  /** Overall assessment of the timeline pacing */
  overallAssessment: string;
  /** Whether any adjustments were recommended */
  hasAdjustments: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const LOG_PREFIX = '[PacingEditor]';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const PACING_MODEL = 'google/gemini-3-flash-preview';

// ============================================================================
// MAIN
// ============================================================================

/**
 * Review the assembled timeline for pacing issues.
 * Loads the EDL from the video project metadata and sends it to Gemini 3 Flash.
 */
export async function reviewTimelinePacing(
  videoId: string,
  userId: string
): Promise<PacingReviewResult> {
  console.log(`${LOG_PREFIX} Reviewing timeline pacing for project ${videoId}`);

  // Load the assembled EDL and shot plan from DB
  const supabase = getSupabaseServiceClient();
  const { data: project } = await supabase
    .from('video_projects')
    .select('metadata')
    .eq('id', videoId)
    .single();

  const metadata = (project?.metadata || {}) as Record<string, unknown>;
  const edl = metadata.edl as Record<string, unknown> | undefined;
  const shotPlan = (metadata.shot_plan || {}) as Record<string, unknown>;
  const shots = (shotPlan.shots || []) as Array<Record<string, unknown>>;
  const clipTrims = (metadata.clip_trims || []) as Array<{ shotIndex: number; trimStart: number; trimEnd: number; trimmedDuration: number }>;

  if (!edl || !shots.length) {
    console.warn(`${LOG_PREFIX} No EDL or shot plan found — skipping pacing review`);
    return { adjustments: [], overallAssessment: 'No data available for review.', hasAdjustments: false };
  }

  // Build a timeline summary for the LLM
  const timelineSummary = shots.map((shot, i) => {
    const trim = clipTrims.find(t => t.shotIndex === i);
    return {
      index: i,
      media_type: shot.media_type,
      content_type: shot.content_type,
      planned_duration: shot.duration_seconds,
      effective_duration: trim ? trim.trimmedDuration : shot.duration_seconds,
      text_preview: String(shot.text || shot.summary || '').substring(0, 80),
    };
  });

  // Call Gemini 3 Flash for pacing review
  const apiKey = await getOpenRouterApiKey(userId);

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      'X-Title': 'Vid-Bolt Pacing Editor',
    },
    body: JSON.stringify({
      model: PACING_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are a YouTube retention specialist and editing supervisor. Review video timelines the way a top creator\'s editor would — looking for pacing issues, missed opportunities for engagement, and moments where the edit doesn\'t match the content\'s energy. Your standard is the best YouTube documentary channels.',
        },
        {
          role: 'user',
          content: `Review this video timeline for engagement quality:

${JSON.stringify(timelineSummary, null, 2)}

Evaluate with a top YouTube editor's eye:

1. **Energy mismatch**: Pacing that doesn't match content energy (slow cuts on exciting content, fast cuts on emotional beats that need to breathe)
2. **Visual monotony**: More than 3-4 consecutive shots at the same rhythm without any variation (transitions, different cut lengths)
3. **Static periods**: Any shot longer than 6 seconds — modern YouTube rarely holds a single visual that long unless it's an intentional emotional beat
4. **Rushed moments**: Emotional or impactful content cut too short to land properly (less than 2.5s for meaningful content)
5. **Missed opportunities**: Section boundaries without transitions, reveals without emphasis, dramatic moments without breathing room
6. **Pacing flatline**: Extended stretches (>15s) with the same cut rhythm — the pacing should feel like a rollercoaster

For each issue, suggest a specific adjustment. If the pacing is well-crafted with intentional variety, return an empty adjustments array. Don't flag things just to flag them — only flag genuine engagement problems.`,
        },
      ],
      temperature: 0.1,
      max_tokens: 2048,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'pacing_review',
          strict: true,
          schema: {
            type: 'object',
            required: ['adjustments', 'overall_assessment'],
            additionalProperties: false,
            properties: {
              adjustments: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['shotIndex', 'reason'],
                  additionalProperties: false,
                  properties: {
                    shotIndex: { type: 'number' },
                    newDuration: { type: ['number', 'null'] },
                    newTransition: { type: ['string', 'null'] },
                    reason: { type: 'string' },
                  },
                },
              },
              overall_assessment: { type: 'string' },
            },
          },
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Pacing review API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '{}';

  try {
    const parsed = JSON.parse(content);
    const adjustments: PacingAdjustment[] = (parsed.adjustments || []).map((adj: Record<string, unknown>) => ({
      shotIndex: Number(adj.shotIndex || 0),
      newDuration: adj.newDuration != null ? Number(adj.newDuration) : undefined,
      newTransition: adj.newTransition as string | undefined,
      reason: String(adj.reason || ''),
    }));

    const hasAdjustments = adjustments.length > 0;

    if (hasAdjustments) {
      console.log(`${LOG_PREFIX} Found ${adjustments.length} pacing adjustments`);
      // Persist adjustments to metadata for the editor
      await supabase
        .from('video_projects')
        .update({
          metadata: {
            ...metadata,
            pacing_adjustments: adjustments,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', videoId);
    } else {
      console.log(`${LOG_PREFIX} Timeline pacing looks good — no adjustments needed`);
    }

    return {
      adjustments,
      overallAssessment: String(parsed.overall_assessment || 'Review complete.'),
      hasAdjustments,
    };
  } catch {
    console.warn(`${LOG_PREFIX} JSON parse failed:`, content.substring(0, 200));
    return { adjustments: [], overallAssessment: 'Parse failed.', hasAdjustments: false };
  }
}
