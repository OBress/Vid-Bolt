"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

import { createHash } from "crypto";

/**
 * Generates a consistent 32-character hash ID from a username using SHA-256.
 */
function generateHashId(username: string): string {
  return createHash("sha256")
    .update(username)
    .digest("hex")
    .slice(0, 32)
    .toUpperCase();
}

/**
 * Checks if a username is available in the network.
 */
export async function checkUsernameUnique(username: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('username', username)
    .single();

  if (error && error.code === 'PGRST116') {
    // Record not found, so username is unique
    return { unique: true };
  }
  
  return { unique: false, error: error?.message };
}

/**
 * Completes the onboarding process for the current user.
 */
export async function completeOnboarding(formData: {
  name: string;
  username: string;
  reasons: string[];
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized access. Please session authentication required.");
  }

  // 1. Double check username uniqueness on server
  const { unique } = await checkUsernameUnique(formData.username);
  if (!unique) {
    throw new Error("Identity conflict: Username already assigned to another operative.");
  }

  const hashid = generateHashId(formData.username);

  // 2. Transmit operational data to command node
  const { error } = await supabase
    .from('users')
    .update({
      name: formData.name,
      username: formData.username,
      hashid: hashid,
      joining_reason: formData.reasons,
      onboarding_completed: true,
    })
    .eq('id', user.id);

  if (error) {
    console.error("Transmission error:", error);
    throw new Error(`CRITICAL_FAILURE: ${error.message}`);
  }

  // 3. Initiate redirection to command center
  redirect('/command-center/operations');
}
