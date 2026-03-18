/**
 * GPU Production Tracker
 * ============================================================================
 * Reference-counting service for active GPU productions per user.
 *
 * When a production pipeline starts that uses the GPU, the counter is
 * incremented. When it completes (success, failure, or cancellation),
 * the counter is decremented. If the counter reaches 0 and the user
 * has requested auto-shutdown, the VM is stopped.
 *
 * This prevents premature shutdowns when multiple videos are being
 * produced concurrently.
 */

import { createClient } from '@supabase/supabase-js';
import { stopNode } from '@/lib/gcp/provision';
import { getValidGCPToken } from '@/lib/gcp/token-refresh';

// ============================================================================
// SUPABASE CLIENT
// ============================================================================

function getSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Increment the active GPU production count for a user.
 * Called when a production pipeline starts that uses local GPU models.
 */
export async function incrementActiveProductions(userId: string): Promise<void> {
  const supabase = getSupabaseServiceClient();

  // Atomic increment via raw SQL to avoid race conditions
  const { error } = await supabase.rpc('increment_active_gpu_productions', {
    p_user_id: userId,
  });

  if (error) {
    // Fallback: use a non-atomic read-then-write if the RPC doesn't exist yet
    console.warn('[GPUProductionTracker] RPC not available, using fallback:', error.message);
    const { data } = await supabase
      .from('user_gcp_config')
      .select('active_gpu_productions')
      .eq('user_id', userId)
      .single();

    const current = data?.active_gpu_productions ?? 0;
    await supabase
      .from('user_gcp_config')
      .update({ active_gpu_productions: current + 1 })
      .eq('user_id', userId);
  }

  console.log(`[GPUProductionTracker] Incremented active productions for user ${userId}`);
}

/**
 * Decrement the active GPU production count and check if shutdown should fire.
 * Called when a production pipeline ends (completed, failed, or cancelled).
 *
 * @returns Whether the GPU should be shut down and the remaining count.
 */
export async function decrementActiveProductions(userId: string): Promise<{
  shouldShutdown: boolean;
  activeCount: number;
}> {
  const supabase = getSupabaseServiceClient();

  // Read current state
  const { data, error: readError } = await supabase
    .from('user_gcp_config')
    .select('active_gpu_productions, shutdown_after_production_requested, status')
    .eq('user_id', userId)
    .single();

  if (readError || !data) {
    console.warn('[GPUProductionTracker] Failed to read user config:', readError?.message);
    return { shouldShutdown: false, activeCount: 0 };
  }

  const newCount = Math.max((data.active_gpu_productions ?? 1) - 1, 0);
  const shouldShutdown =
    newCount === 0 &&
    data.shutdown_after_production_requested === true &&
    data.status === 'RUNNING';

  // Update counter (and clear flag if shutting down)
  const updatePayload: Record<string, unknown> = {
    active_gpu_productions: newCount,
  };

  if (shouldShutdown) {
    updatePayload.shutdown_after_production_requested = false;
  }

  await supabase
    .from('user_gcp_config')
    .update(updatePayload)
    .eq('user_id', userId);

  console.log(
    `[GPUProductionTracker] Decremented active productions for user ${userId}: ` +
    `count=${newCount}, shouldShutdown=${shouldShutdown}`
  );

  return { shouldShutdown, activeCount: newCount };
}

/**
 * Set or clear the shutdown-after-production flag for a user.
 * Called from the UI when the user toggles the checkbox.
 */
export async function setShutdownRequested(userId: string, requested: boolean): Promise<void> {
  const supabase = getSupabaseServiceClient();

  const { error } = await supabase
    .from('user_gcp_config')
    .update({ shutdown_after_production_requested: requested })
    .eq('user_id', userId);

  if (error) {
    console.error('[GPUProductionTracker] Failed to set shutdown flag:', error.message);
    throw error;
  }

  console.log(`[GPUProductionTracker] Set shutdown_after_production_requested=${requested} for user ${userId}`);
}

/**
 * Execute the GPU shutdown for a user.
 * Called when the last production completes and shutdown was requested.
 *
 * @returns true if shutdown was initiated, false if skipped (e.g. VM already off).
 */
export async function executeGpuShutdown(userId: string): Promise<boolean> {
  const supabase = getSupabaseServiceClient();

  // Get user's GCP config
  const { data: config, error: configError } = await supabase
    .from('user_gcp_config')
    .select('project_id, status')
    .eq('user_id', userId)
    .single();

  if (configError || !config) {
    console.warn('[GPUProductionTracker] No GCP config found for shutdown:', configError?.message);
    return false;
  }

  // Skip if VM is not running
  if (config.status !== 'RUNNING') {
    console.log(`[GPUProductionTracker] VM for user ${userId} is ${config.status}, skipping shutdown`);
    return false;
  }

  try {
    const gcpToken = await getValidGCPToken(userId, null);
    await stopNode(gcpToken, config.project_id);

    // Update status in DB
    await supabase
      .from('user_gcp_config')
      .update({ status: 'STOPPING' })
      .eq('user_id', userId);

    console.log(`[GPUProductionTracker] GPU VM shutdown initiated for user ${userId}`);
    return true;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[GPUProductionTracker] GPU shutdown failed for user ${userId}:`, message);
    return false;
  }
}
