"use server";

import { createClient } from "@/lib/supabase/server";
import { getKeyFromUrl, deleteFile } from "@/lib/services/r2-storage";
import { revalidatePath } from "next/cache";

/**
 * Reset a payment for a specific user and month.
 * - Resets status to draft
 * - Clears proof URL in DB
 * - Deletes the proof file from R2
 */
export async function resetPaymentMonth(userId: string, monthDate: string, proofUrl: string | null) {
  const supabase = await createClient();

  // 1. Call DB RPC to update state immediately
  // This verifies admin permissions and updates the record
  const { error } = await supabase.rpc("reset_payment_month", {
    target_user_id: userId,
    target_month_date: monthDate,
  });

  if (error) {
    console.error("Error resetting payment:", error);
    throw new Error(error.message);
  }

  // 2. Delete from R2 if url exists
  if (proofUrl) {
    try {
      const key = getKeyFromUrl(proofUrl);
      console.log(`Deleting proof file from R2: ${proofUrl} -> Key: ${key}`);
      await deleteFile(key);
    } catch (err) {
      console.error("Failed to delete proof file from R2:", err);
      // We don't throw here to avoid rolling back the DB state (which we can't easily do without transaction)
      // The user state is "reset" which is the primary goal.
      // Orphaned files can be cleaned up later if needed.
    }
  }

  // 3. Revalidate Admin Panel
  revalidatePath("/command-center");
  revalidatePath("/command-center/admin"); // In case it's a separate page
}
