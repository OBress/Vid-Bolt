/**
 * GCP VM Session Closer
 * ============================================================================
 * Called when a GCP VM stops (manual stop, auto-shutdown, or preemption).
 * Computes the session cost and daily flat fee, then emits cost_events rows.
 *
 * Two cost lines are emitted per session close:
 *   1. Hourly compute: (session_duration_hours) × $1.90/hr  [isEstimated=true]
 *   2. Daily flat fee: (new_days_since_provisioned) × $2.00/day [isEstimated=false]
 *
 * The daily flat fee tracks new days since the last session close to avoid
 * double-counting across multiple start/stop cycles in the same day.
 */

import { VM_HOURLY_RATE_USD, VM_DAILY_FLAT_RATE_USD } from './pricing';
import { emitCostEvents, type CostEventPayload } from './emit-cost-event';

// ============================================================================
// TYPES
// ============================================================================

interface GcpSessionCloseResult {
  hourlyAmountUsd: number;
  dailyFlatAmountUsd: number;
  sessionHours: number;
  newDaysOwned: number;
}

// ============================================================================
// SUPABASE CLIENT
// ============================================================================

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('[closeVmSession] Missing Supabase env vars');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Close the active GCP VM session for a user.
 * Computes hourly + daily costs and emits cost_events rows.
 * Updates total_vm_hours_run and total_vm_days_owned in user_gcp_config.
 * Clears vm_session_started_at so the next session starts fresh.
 *
 * @param userId - The user whose VM session to close.
 * @returns A summary of costs emitted, or null if no active session found.
 */
export async function closeVmSession(userId: string): Promise<GcpSessionCloseResult | null> {
  try {
    const supabase = await getSupabase();
    const now = new Date();

    // Fetch current session state
    const { data: config, error: readError } = await supabase
      .from('user_gcp_config')
      .select('vm_session_started_at, vm_provisioned_at, total_vm_hours_run, total_vm_days_owned')
      .eq('user_id', userId)
      .single();

    if (readError || !config) {
      console.warn('[closeVmSession] No GCP config found for user:', userId);
      return null;
    }

    const sessionStart = config.vm_session_started_at
      ? new Date(config.vm_session_started_at)
      : null;
    const provisionedAt = config.vm_provisioned_at
      ? new Date(config.vm_provisioned_at)
      : null;

    // ---- Hourly compute cost ----
    let sessionHours = 0;
    let hourlyAmountUsd = 0;
    if (sessionStart) {
      const sessionMs = now.getTime() - sessionStart.getTime();
      sessionHours = sessionMs / (1000 * 60 * 60);
      hourlyAmountUsd = sessionHours * VM_HOURLY_RATE_USD;
    }

    // ---- Daily flat fee (since provisioned, only counting new days) ----
    // We use total_vm_days_owned to track how many days we've already billed,
    // then compute additional days elapsed since the VM was provisioned.
    let newDaysOwned = 0;
    let dailyFlatAmountUsd = 0;
    if (provisionedAt) {
      const totalDaysElapsed = Math.floor(
        (now.getTime() - provisionedAt.getTime()) / (1000 * 60 * 60 * 24)
      );
      const previouslyBilledDays = config.total_vm_days_owned ?? 0;
      newDaysOwned = Math.max(0, totalDaysElapsed - previouslyBilledDays);
      dailyFlatAmountUsd = newDaysOwned * VM_DAILY_FLAT_RATE_USD;
    }

    // Emit both cost events
    const events: CostEventPayload[] = [];

    if (hourlyAmountUsd > 0) {
      events.push({
        userId,
        category: 'gcp_vm' as const,
        service: 'gcp' as const,
        subLabel: 'hourly_compute',
        amountUsd: Math.round(hourlyAmountUsd * 1000000) / 1000000,
        rawUnits: { hours: Math.round(sessionHours * 10000) / 10000 },
        isEstimated: true,
        note: `SPOT pricing estimate @ $${VM_HOURLY_RATE_USD}/hr`,
        occurredAt: now,
      });
    }

    if (dailyFlatAmountUsd > 0) {
      events.push({
        userId,
        category: 'gcp_vm' as const,
        service: 'gcp' as const,
        subLabel: 'daily_flat_fee',
        amountUsd: Math.round(dailyFlatAmountUsd * 1000000) / 1000000,
        rawUnits: { days: newDaysOwned },
        isEstimated: false,
        note: `$${VM_DAILY_FLAT_RATE_USD}/day ownership fee`,
        occurredAt: now,
      });
    }

    if (events.length > 0) {
      await emitCostEvents(events);
    }

    // Update user_gcp_config: clear session, accumulate totals
    await supabase
      .from('user_gcp_config')
      .update({
        vm_session_started_at: null,
        total_vm_hours_run: (config.total_vm_hours_run ?? 0) + sessionHours,
        total_vm_days_owned: (config.total_vm_days_owned ?? 0) + newDaysOwned,
      })
      .eq('user_id', userId);

    console.log(
      `[closeVmSession] User ${userId.slice(0, 8)}: ` +
      `${sessionHours.toFixed(2)}h compute ($${hourlyAmountUsd.toFixed(4)}) + ` +
      `${newDaysOwned}d flat ($${dailyFlatAmountUsd.toFixed(2)})`
    );

    return { hourlyAmountUsd, dailyFlatAmountUsd, sessionHours, newDaysOwned };
  } catch (err) {
    console.error('[closeVmSession] Error:', err);
    return null;
  }
}

/**
 * Open a new GCP VM session (called on VM start).
 * Records vm_session_started_at and sets vm_provisioned_at if not already set.
 */
export async function openVmSession(userId: string): Promise<void> {
  try {
    const supabase = await getSupabase();
    const now = new Date().toISOString();

    const { data: existing } = await supabase
      .from('user_gcp_config')
      .select('vm_provisioned_at')
      .eq('user_id', userId)
      .single();

    const updatePayload: Record<string, unknown> = {
      vm_session_started_at: now,
    };

    // Only set provisioned_at if this is the first time
    if (!existing?.vm_provisioned_at) {
      updatePayload.vm_provisioned_at = now;
      console.log(`[openVmSession] First provision for user ${userId.slice(0, 8)}`);
    }

    await supabase
      .from('user_gcp_config')
      .update(updatePayload)
      .eq('user_id', userId);

    console.log(`[openVmSession] Session opened for user ${userId.slice(0, 8)}`);
  } catch (err) {
    console.error('[openVmSession] Error:', err);
  }
}
