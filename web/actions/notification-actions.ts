"use server";

/**
 * Notification Actions (User-Facing)
 * ============================================================================
 * Server actions for users to mark notifications as read and clear them.
 */

import { createClient } from "@/lib/supabase/server";

/**
 * Mark a single notification as read.
 */
export async function markNotificationRead(notificationId: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("mark_notification_read", {
    p_notification_id: notificationId,
  });

  if (error) {
    console.error("[Notifications] Failed to mark as read:", error);
    throw new Error(`Failed to mark notification as read: ${error.message}`);
  }
}

/**
 * Mark all notifications as read for the current user.
 */
export async function markAllNotificationsRead(): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("mark_all_notifications_read");

  if (error) {
    console.error("[Notifications] Failed to mark all as read:", error);
    throw new Error(`Failed to mark all notifications as read: ${error.message}`);
  }
}

/**
 * Clear (delete) all notifications for the current user.
 */
export async function clearAllNotifications(): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("clear_all_notifications");

  if (error) {
    console.error("[Notifications] Failed to clear notifications:", error);
    throw new Error(`Failed to clear notifications: ${error.message}`);
  }
}
