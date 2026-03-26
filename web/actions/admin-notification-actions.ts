"use server";

/**
 * Admin Notification Actions
 * ============================================================================
 * Server actions for admins to send notifications to specific users or
 * broadcast to all active users. Follows the pattern in admin-user-actions.ts.
 */

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// ============================================================================
// Types
// ============================================================================

export type NotificationType = "info" | "warning" | "success" | "update";

export interface SendNotificationResult {
  success: boolean;
  sent_to: number;
  broadcast: boolean;
}

export interface NotificationHistoryItem {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  created_at: string;
  sent_by_name: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  is_broadcast: boolean;
}

// ============================================================================
// Actions
// ============================================================================

/**
 * Send a notification to a specific user or broadcast to all active users.
 *
 * @param targetUserId - UUID of the target user, or null for broadcast
 * @param title        - Notification title
 * @param message      - Notification body
 * @param type         - Notification type: info | warning | success | update
 */
export async function sendNotification(
  targetUserId: string | null,
  title: string,
  message: string,
  type: NotificationType = "info"
): Promise<SendNotificationResult> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("admin_send_notification", {
    p_target_user_id: targetUserId,
    p_title: title,
    p_message: message,
    p_type: type,
  });

  if (error) {
    console.error("[Admin] Failed to send notification:", error);
    throw new Error(`Failed to send notification: ${error.message}`);
  }

  revalidatePath("/command-center");

  return data as SendNotificationResult;
}

/**
 * Get the admin notification history (recently sent notifications).
 */
export async function getNotificationHistory(
  limit: number = 50
): Promise<NotificationHistoryItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_admin_notification_history", {
    p_limit: limit,
  });

  if (error) {
    console.error("[Admin] Failed to fetch notification history:", error);
    throw new Error(`Failed to fetch notification history: ${error.message}`);
  }

  return (data || []) as NotificationHistoryItem[];
}
