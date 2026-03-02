import { createServiceClient } from "@/lib/supabase/service";

/**
 * Server-side GPU hours service.
 * All methods use the service-role Supabase client to bypass RLS.
 */

/**
 * Get the current GPU hours balance for a user.
 */
export async function getGpuHoursBalance(userId: string): Promise<number> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("users")
    .select("gpu_hours_balance")
    .eq("id", userId)
    .single();

  if (error) {
    console.error("[GPU Hours] Error fetching balance:", error);
    throw new Error(`Failed to fetch GPU hours balance: ${error.message}`);
  }

  return data?.gpu_hours_balance ?? 0;
}

/**
 * Check if a user has enough GPU hours for a render job.
 */
export async function hasEnoughGpuHours(
  userId: string,
  requiredHours: number
): Promise<boolean> {
  const balance = await getGpuHoursBalance(userId);
  return balance >= requiredHours;
}

/**
 * Estimate the GPU hours needed for a render job.
 * 
 * Current heuristic: 1 GPU hour per 1 hour of rendered video.
 * A 5-minute video = ~0.083 hours, rounded up to 1.
 * We round up to the nearest whole hour for billing simplicity.
 */
export function estimateRenderHours(
  durationInFrames: number,
  fps: number
): number {
  const durationInSeconds = durationInFrames / fps;
  const durationInHours = durationInSeconds / 3600;
  // Minimum 1 hour per render
  return Math.max(1, Math.ceil(durationInHours));
}

/**
 * Deduct GPU hours for a render job. 
 * Uses the atomic deduct_gpu_hours RPC which locks the row to prevent races.
 * 
 * @returns The new balance after deduction
 * @throws If insufficient balance or user not found
 */
export async function deductGpuHours(
  userId: string,
  hours: number,
  videoId?: string,
  description?: string
): Promise<number> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("deduct_gpu_hours", {
    p_user_id: userId,
    p_hours: hours,
    p_video_id: videoId || null,
    p_description: description || "Video render",
  });

  if (error) {
    console.error("[GPU Hours] Deduction error:", error);
    throw new Error(`GPU hours deduction failed: ${error.message}`);
  }

  return data as number;
}

/**
 * Refund GPU hours (e.g., if a render fails).
 * Creates a 'refund' ledger entry.
 */
export async function refundGpuHours(
  userId: string,
  hours: number,
  videoId?: string,
  description?: string
): Promise<number> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("credit_gpu_hours", {
    p_user_id: userId,
    p_hours: hours,
    p_stripe_session_id: null, // No stripe session for refunds
  });

  if (error) {
    console.error("[GPU Hours] Refund error:", error);
    throw new Error(`GPU hours refund failed: ${error.message}`);
  }

  // Also insert a proper refund ledger entry
  await supabase.from("gpu_hours_transactions").insert({
    user_id: userId,
    type: "refund",
    hours: hours,
    balance_after: data as number,
    video_id: videoId || null,
    description: description || "Render refund",
  });

  return data as number;
}
