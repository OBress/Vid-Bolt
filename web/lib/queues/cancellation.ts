/**
 * Cancellation Utilities
 * ============================================================================
 * Shared cancellation primitives for the video production pipeline.
 * Extracted from orchestrator.ts to allow gpu-batch-generation and other
 * services to check cancellation without circular dependencies.
 */

import { getSupabaseServiceClient } from '@/lib/queues/shared';

// ============================================================================
// CANCELLATION ERROR
// ============================================================================

/**
 * Custom error for task cancellation — allows clean exit without error logging.
 */
export class CancellationError extends Error {
  constructor(taskId: string) {
    super(`Task ${taskId} was cancelled`);
    this.name = 'CancellationError';
  }
}

// ============================================================================
// CANCELLATION CHECK
// ============================================================================

/**
 * Check if the task has been cancelled or failed in Supabase.
 * Called between orchestrator phases and within long-running operations
 * (e.g., GPU batch generation) as a defensive layer — even if the Redis
 * job wasn't fully cleaned, the pipeline will self-terminate at the next check.
 *
 * @param taskId - The task ID to check
 * @throws CancellationError if the task is cancelled or failed
 */
export async function checkCancelled(taskId: string): Promise<void> {
  const supabase = getSupabaseServiceClient();
  const { data } = await supabase
    .from('tasks')
    .select('status')
    .eq('id', taskId)
    .single();

  if (data?.status === 'cancelled' || data?.status === 'failed') {
    console.log(`[Cancellation] Task ${taskId} is ${data.status} — aborting pipeline`);
    throw new CancellationError(taskId);
  }
}
