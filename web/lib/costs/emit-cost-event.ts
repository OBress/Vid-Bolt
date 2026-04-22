/**
 * Cost Event Emitter
 * ============================================================================
 * Lightweight, non-blocking utility for writing rows to the `cost_events`
 * ledger table. Uses the service-role Supabase client to bypass RLS.
 *
 * IMPORTANT: This function must NEVER throw — cost tracking failures must not
 * propagate into the pipeline and cause job failures.
 *
 * Usage:
 *   await emitCostEvent({
 *     userId, videoId, category: 'tts', service: 'inworld_tts',
 *     subLabel: 'inworld-tts-1.5-max', amountUsd: 0.027,
 *     rawUnits: { chars: 1688 },
 *   });
 */

import type { CostCategory, CostService } from './pricing';

// ============================================================================
// TYPES
// ============================================================================

export interface CostEventPayload {
  /** User who incurred the cost. */
  userId: string;
  /** Optional: video project that triggered the cost. */
  videoId?: string;
  /** High-level cost category for pie chart grouping. */
  category: CostCategory;
  /** The specific service or API that generated the cost. */
  service: CostService;
  /** Optional sub-label (model name, voice, search_type, etc.) */
  subLabel?: string;
  /** Cost in USD. */
  amountUsd: number;
  /** Raw metric units for auditability (e.g. { chars: 500, tokens: 1234 }). */
  rawUnits?: Record<string, number | string>;
  /** Whether this cost is an estimate (e.g. SPOT VM pricing). */
  isEstimated?: boolean;
  /** Optional human-readable note shown in the UI. */
  note?: string;
  /** When the cost was incurred (defaults to now). */
  occurredAt?: Date;
}

// ============================================================================
// SUPABASE CLIENT (lazy singleton for worker context)
// ============================================================================

let _supabase: ReturnType<typeof import('@supabase/supabase-js').createClient> | null = null;

async function getSupabase() {
  if (!_supabase) {
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('[emitCostEvent] Missing Supabase env vars');
    _supabase = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _supabase;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Write a single cost event row to the `cost_events` table.
 * Silently swallows all errors — cost tracking must never break the pipeline.
 */
export async function emitCostEvent(payload: CostEventPayload): Promise<void> {
  if (payload.amountUsd <= 0) return; // Skip zero-cost events

  try {
    const supabase = await getSupabase();
    const { error } = await supabase.from('cost_events' as any).insert({
      user_id: payload.userId,
      video_id: payload.videoId ?? null,
      category: payload.category,
      service: payload.service,
      sub_label: payload.subLabel ?? null,
      amount_usd: payload.amountUsd,
      raw_units: payload.rawUnits ?? null,
      is_estimated: payload.isEstimated ?? false,
      note: payload.note ?? null,
      occurred_at: (payload.occurredAt ?? new Date()).toISOString(),
    });

    if (error) {
      console.error('[emitCostEvent] Failed to insert cost event:', error.message);
    } else {
      console.log(
        `[emitCostEvent] Recorded $${payload.amountUsd.toFixed(6)} ` +
        `(${payload.category}/${payload.service}` +
        (payload.subLabel ? `/${payload.subLabel}` : '') +
        (payload.videoId ? `, video=${payload.videoId.slice(0, 8)}` : '') +
        ')'
      );
    }
  } catch (err) {
    console.error('[emitCostEvent] Unexpected error:', err);
  }
}

/**
 * Write multiple cost events in a single batch insert.
 * More efficient than calling emitCostEvent() in a loop.
 */
export async function emitCostEvents(payloads: CostEventPayload[]): Promise<void> {
  const validPayloads = payloads.filter((p) => p.amountUsd > 0);
  if (validPayloads.length === 0) return;

  try {
    const supabase = await getSupabase();
    const { error } = await supabase.from('cost_events' as any).insert(
      validPayloads.map((p) => ({
        user_id: p.userId,
        video_id: p.videoId ?? null,
        category: p.category,
        service: p.service,
        sub_label: p.subLabel ?? null,
        amount_usd: p.amountUsd,
        raw_units: p.rawUnits ?? null,
        is_estimated: p.isEstimated ?? false,
        note: p.note ?? null,
        occurred_at: (p.occurredAt ?? new Date()).toISOString(),
      }))
    );

    if (error) {
      console.error('[emitCostEvents] Batch insert failed:', error.message);
    } else {
      console.log(`[emitCostEvents] Recorded ${validPayloads.length} cost events`);
    }
  } catch (err) {
    console.error('[emitCostEvents] Unexpected error:', err);
  }
}
