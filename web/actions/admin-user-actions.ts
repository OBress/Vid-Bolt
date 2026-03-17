"use server";

/**
 * Admin User Actions
 * ============================================================================
 * Server actions for admin user management including:
 * - Wiping user data (keeps account structure)
 * - Full user deletion (removes everything)
 * - Rejecting pending users (allows re-apply)
 * - Banning users (blocks email + Discord ID permanently)
 * - Unbanning identities (allows re-apply)
 * 
 * All actions require admin privileges.
 */

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { deleteFilesWithPrefix, deleteFile, getKeyFromUrl, isR2Configured } from "@/lib/services/r2-storage";
import { revalidatePath } from "next/cache";

// ============================================================================
// Types
// ============================================================================

export interface UserDeletionInfo {
  id: string;
  email: string;
  name: string | null;
  username: string | null;
  status: string;
  is_admin: boolean;
  date_joined: string;
  task_count: number;
  video_count: number;
  statement_count: number;
}

export interface WipeUserDataResult {
  success: boolean;
  user_id: string;
  username: string | null;
  deleted_tasks: number;
  deleted_videos: number;
  deleted_statements: number;
  r2_deleted: number;
  r2_errors: string[];
}

export interface DeleteUserResult {
  success: boolean;
  user_id: string;
  username: string | null;
  email: string;
  r2_deleted: number;
  r2_errors: string[];
  auth_deleted: boolean;
}

export interface BanUserResult {
  success: boolean;
  user_id: string;
  username: string | null;
  email: string;
  discord_id: string | null;
  ban_id: string;
  r2_deleted: number;
  r2_errors: string[];
  auth_deleted: boolean;
}

export interface BannedIdentity {
  id: string;
  email: string | null;
  discord_id: string | null;
  banned_by_name: string | null;
  reason: string | null;
  created_at: string;
  total_count: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Clean up R2 files based on prefixes/URLs returned from the database.
 * Handles both prefix patterns (for batch delete) and direct URLs (for single files).
 */
async function cleanupR2Files(r2Prefixes: string[]): Promise<{ deleted: number; errors: string[] }> {
  if (!isR2Configured()) {
    console.warn("[Admin] R2 not configured, skipping file cleanup");
    return { deleted: 0, errors: ["R2 not configured"] };
  }

  let totalDeleted = 0;
  const allErrors: string[] = [];

  for (const prefixOrUrl of r2Prefixes) {
    try {
      // Check if this is a direct URL (contains http) or a prefix
      if (prefixOrUrl.startsWith("http")) {
        // It's a URL - extract key and delete single file
        const key = getKeyFromUrl(prefixOrUrl);
        await deleteFile(key);
        totalDeleted++;
        console.log(`[Admin] Deleted R2 file: ${key}`);
      } else {
        // It's a prefix - delete all files with that prefix
        const result = await deleteFilesWithPrefix(prefixOrUrl);
        totalDeleted += result.deleted;
        allErrors.push(...result.errors);
        console.log(`[Admin] Deleted ${result.deleted} files with prefix: ${prefixOrUrl}`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      allErrors.push(`Failed to cleanup ${prefixOrUrl}: ${errorMessage}`);
      console.error(`[Admin] R2 cleanup error for ${prefixOrUrl}:`, err);
    }
  }

  return { deleted: totalDeleted, errors: allErrors };
}

// ============================================================================
// Public Actions
// ============================================================================

/**
 * Get user information for the deletion confirmation dialog.
 * Shows counts of data that will be affected.
 */
export async function getUserForDeletion(userId: string): Promise<UserDeletionInfo> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("admin_get_user_for_deletion", {
    target_user_id: userId,
  });

  if (error) {
    console.error("[Admin] Failed to get user for deletion:", error);
    throw new Error(error.message);
  }

  return data as UserDeletionInfo;
}

/**
 * Wipe all user-generated content while keeping the account structure.
 * 
 * Deletes:
 * - All tasks and related data (task_steps, continuity_state)
 * - All video_projects
 * - All monthly_statements
 * - All R2 files (audio, GPU test outputs, payment proofs)
 * 
 * Keeps:
 * - User account (users table)
 * - API keys (user_api_keys)
 * - User settings (user_settings)
 * - GCP config (user_gcp_config)
 * - Media projects (media_projects, project_settings)
 * 
 * @param userId - The UUID of the user to wipe
 * @param confirmUsername - Must match the user's username/email for safety
 */
export async function wipeUserData(
  userId: string,
  confirmUsername: string
): Promise<WipeUserDataResult> {
  const supabase = await createClient();

  // First, verify the username matches
  const userInfo = await getUserForDeletion(userId);
  const expectedIdentifier = userInfo.username || userInfo.email;
  
  if (confirmUsername !== expectedIdentifier) {
    throw new Error(
      `Username confirmation does not match. Expected "${expectedIdentifier}" but received "${confirmUsername}".`
    );
  }

  // Prevent wiping admin accounts (extra safety)
  if (userInfo.is_admin) {
    throw new Error("Cannot wipe data for admin accounts");
  }

  console.log(`[Admin] Wiping data for user: ${userId} (${expectedIdentifier})`);

  // Call the database function to delete data and get R2 prefixes
  const { data, error } = await supabase.rpc("admin_wipe_user_data", {
    target_user_id: userId,
  });

  if (error) {
    console.error("[Admin] Database wipe failed:", error);
    throw new Error(`Failed to wipe user data: ${error.message}`);
  }

  const dbResult = data as {
    success: boolean;
    user_id: string;
    username: string;
    deleted_tasks: number;
    deleted_videos: number;
    deleted_statements: number;
    r2_prefixes: string[];
  };

  // Clean up R2 files
  const r2Result = await cleanupR2Files(dbResult.r2_prefixes || []);

  console.log(`[Admin] Wipe complete for ${userId}:`, {
    deleted_tasks: dbResult.deleted_tasks,
    deleted_videos: dbResult.deleted_videos,
    deleted_statements: dbResult.deleted_statements,
    r2_deleted: r2Result.deleted,
    r2_errors: r2Result.errors.length,
  });

  // Revalidate admin pages
  revalidatePath("/command-center");

  return {
    success: true,
    user_id: dbResult.user_id,
    username: dbResult.username,
    deleted_tasks: dbResult.deleted_tasks,
    deleted_videos: dbResult.deleted_videos,
    deleted_statements: dbResult.deleted_statements,
    r2_deleted: r2Result.deleted,
    r2_errors: r2Result.errors,
  };
}

/**
 * Fully delete a user and all their data from the system.
 * 
 * Deletes:
 * - User account from public.users (cascades to most tables)
 * - User from auth.users (Supabase Auth)
 * - All R2 files (audio, GPU test outputs, payment proofs, media project images)
 * 
 * This action is IRREVERSIBLE. The user will not be able to log in again.
 * 
 * @param userId - The UUID of the user to delete
 * @param confirmUsername - Must match the user's username/email for safety
 */
export async function deleteUser(
  userId: string,
  confirmUsername: string
): Promise<DeleteUserResult> {
  const supabase = await createClient();

  // First, verify the username matches
  const userInfo = await getUserForDeletion(userId);
  const expectedIdentifier = userInfo.username || userInfo.email;
  
  if (confirmUsername !== expectedIdentifier) {
    throw new Error(
      `Username confirmation does not match. Expected "${expectedIdentifier}" but received "${confirmUsername}".`
    );
  }

  // Prevent deleting admin accounts (extra safety)
  if (userInfo.is_admin) {
    throw new Error("Cannot delete admin accounts");
  }

  console.log(`[Admin] Deleting user: ${userId} (${expectedIdentifier})`);

  // Call the database function to delete from public.users and get R2 prefixes
  const { data, error } = await supabase.rpc("admin_delete_user", {
    target_user_id: userId,
  });

  if (error) {
    console.error("[Admin] Database delete failed:", error);
    throw new Error(`Failed to delete user from database: ${error.message}`);
  }

  const dbResult = data as {
    success: boolean;
    user_id: string;
    username: string;
    email: string;
    r2_prefixes: string[];
  };

  // Clean up R2 files
  const r2Result = await cleanupR2Files(dbResult.r2_prefixes || []);

  // Delete from auth.users using service role client
  let authDeleted = false;
  try {
    const serviceClient = createServiceClient();
    const { error: authError } = await serviceClient.auth.admin.deleteUser(userId);
    
    if (authError) {
      console.error("[Admin] Failed to delete from auth.users:", authError);
      // Don't throw - the public.users record is already deleted
      // The auth record will be orphaned but that's acceptable
    } else {
      authDeleted = true;
      console.log(`[Admin] Deleted user from auth.users: ${userId}`);
    }
  } catch (err) {
    console.error("[Admin] Error deleting from auth.users:", err);
    // Continue - the main deletion succeeded
  }

  console.log(`[Admin] Delete complete for ${userId}:`, {
    r2_deleted: r2Result.deleted,
    r2_errors: r2Result.errors.length,
    auth_deleted: authDeleted,
  });

  // Revalidate admin pages
  revalidatePath("/command-center");

  return {
    success: true,
    user_id: dbResult.user_id,
    username: dbResult.username,
    email: dbResult.email,
    r2_deleted: r2Result.deleted,
    r2_errors: r2Result.errors,
    auth_deleted: authDeleted,
  };
}

/**
 * Reject a pending user — deletes their account but allows them to re-apply.
 * This is a lightweight version of deleteUser without the confirmation input requirement.
 * 
 * @param userId - The UUID of the pending user to reject
 */
export async function rejectUser(userId: string): Promise<DeleteUserResult> {
  const supabase = await createClient();

  // Verify the user exists and is pending
  const userInfo = await getUserForDeletion(userId);

  if (userInfo.is_admin) {
    throw new Error("Cannot reject admin accounts");
  }

  console.log(`[Admin] Rejecting user: ${userId} (${userInfo.username || userInfo.email})`);

  // Call the database function to delete from public.users and get R2 prefixes
  const { data, error } = await supabase.rpc("admin_delete_user", {
    target_user_id: userId,
  });

  if (error) {
    console.error("[Admin] Database reject failed:", error);
    throw new Error(`Failed to reject user: ${error.message}`);
  }

  const dbResult = data as {
    success: boolean;
    user_id: string;
    username: string;
    email: string;
    r2_prefixes: string[];
  };

  // Clean up R2 files
  const r2Result = await cleanupR2Files(dbResult.r2_prefixes || []);

  // Delete from auth.users
  let authDeleted = false;
  try {
    const serviceClient = createServiceClient();
    const { error: authError } = await serviceClient.auth.admin.deleteUser(userId);
    if (authError) {
      console.error("[Admin] Failed to delete from auth.users:", authError);
    } else {
      authDeleted = true;
    }
  } catch (err) {
    console.error("[Admin] Error deleting from auth.users:", err);
  }

  console.log(`[Admin] Reject complete for ${userId}`);
  revalidatePath("/command-center");

  return {
    success: true,
    user_id: dbResult.user_id,
    username: dbResult.username,
    email: dbResult.email,
    r2_deleted: r2Result.deleted,
    r2_errors: r2Result.errors,
    auth_deleted: authDeleted,
  };
}

/**
 * Ban a user — deletes their account AND adds their email + Discord ID to the
 * banned_identities table, preventing them from re-registering.
 * 
 * @param userId - The UUID of the user to ban
 * @param reason - Optional reason for the ban
 */
export async function banUser(
  userId: string,
  reason?: string
): Promise<BanUserResult> {
  const supabase = await createClient();

  // Verify the user exists
  const userInfo = await getUserForDeletion(userId);

  if (userInfo.is_admin) {
    throw new Error("Cannot ban admin accounts");
  }

  console.log(`[Admin] Banning user: ${userId} (${userInfo.username || userInfo.email})`);

  // Call the ban RPC — persists identifiers and deletes from public.users
  const { data, error } = await supabase.rpc("admin_ban_user", {
    target_user_id: userId,
    p_reason: reason || null,
  });

  if (error) {
    console.error("[Admin] Database ban failed:", error);
    throw new Error(`Failed to ban user: ${error.message}`);
  }

  const dbResult = data as {
    success: boolean;
    user_id: string;
    username: string;
    email: string;
    discord_id: string | null;
    ban_id: string;
    r2_prefixes: string[];
  };

  // Clean up R2 files
  const r2Result = await cleanupR2Files(dbResult.r2_prefixes || []);

  // Delete from auth.users
  let authDeleted = false;
  try {
    const serviceClient = createServiceClient();
    const { error: authError } = await serviceClient.auth.admin.deleteUser(userId);
    if (authError) {
      console.error("[Admin] Failed to delete from auth.users:", authError);
    } else {
      authDeleted = true;
      console.log(`[Admin] Deleted banned user from auth.users: ${userId}`);
    }
  } catch (err) {
    console.error("[Admin] Error deleting from auth.users:", err);
  }

  console.log(`[Admin] Ban complete for ${userId}:`, {
    ban_id: dbResult.ban_id,
    r2_deleted: r2Result.deleted,
    auth_deleted: authDeleted,
  });

  revalidatePath("/command-center");

  return {
    success: true,
    user_id: dbResult.user_id,
    username: dbResult.username,
    email: dbResult.email,
    discord_id: dbResult.discord_id,
    ban_id: dbResult.ban_id,
    r2_deleted: r2Result.deleted,
    r2_errors: r2Result.errors,
    auth_deleted: authDeleted,
  };
}

/**
 * Unban an identity — removes from banned_identities so the user can re-register.
 * 
 * @param bannedId - The UUID of the banned_identities row to remove
 */
export async function unbanIdentity(bannedId: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("admin_unban_identity", {
    p_banned_id: bannedId,
  });

  if (error) {
    console.error("[Admin] Unban failed:", error);
    throw new Error(`Failed to unban identity: ${error.message}`);
  }

  console.log(`[Admin] Unbanned identity: ${bannedId}`);
  revalidatePath("/command-center");
}

/**
 * Get paginated list of banned identities for the admin panel.
 */
export async function getBannedIdentities(
  page: number = 1,
  perPage: number = 20
): Promise<BannedIdentity[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_banned_identities", {
    page,
    per_page: perPage,
  });

  if (error) {
    console.error("[Admin] Failed to get banned identities:", error);
    throw new Error(`Failed to fetch banned identities: ${error.message}`);
  }

  return (data || []) as BannedIdentity[];
}
