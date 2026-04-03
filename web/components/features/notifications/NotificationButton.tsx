"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import { NotificationPanel } from "./NotificationPanel";
import {
  markNotificationRead,
  markAllNotificationsRead,
  clearAllNotifications,
} from "@/actions/notification-actions";
import type { NotificationData } from "./NotificationCard";

// ============================================================================
// Component
// ============================================================================

export function NotificationButton() {
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);

  // Memoize Supabase client
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ),
    []
  );

  // ── Fetch notifications ─────────────────────────────────────────────
  const fetchNotifications = useCallback(async () => {
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) return;

      const { data, error } = await supabase.rpc("get_user_notifications", {
        p_limit: 50,
      });

      if (error) {
        console.error("Failed to fetch notifications:", error.message, error.code, error.details);
        return;
      }

      setNotifications((data as NotificationData[]) || []);
    } catch (err) {
      console.error("Error fetching notifications:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  // Initial fetch
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // ── Real-time subscription ──────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel("notifications-updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
        },
        () => {
          fetchNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchNotifications]);

  // ── Derived state ───────────────────────────────────────────────────
  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.is_read).length,
    [notifications]
  );

  // ── Handlers ────────────────────────────────────────────────────────
  const handleMarkRead = useCallback(
    async (id: string) => {
      // Optimistic update
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      try {
        await markNotificationRead(id);
      } catch {
        // Revert on error
        fetchNotifications();
      }
    },
    [fetchNotifications]
  );

  const handleMarkAllRead = useCallback(async () => {
    // Optimistic update
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    try {
      await markAllNotificationsRead();
    } catch {
      fetchNotifications();
    }
  }, [fetchNotifications]);

  const handleClearAll = useCallback(async () => {
    // Optimistic update
    setNotifications([]);
    try {
      await clearAllNotifications();
    } catch {
      fetchNotifications();
    }
  }, [fetchNotifications]);

  // ====================================================================
  // Render
  // ====================================================================

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-neutral-400 hover:text-orange-500"
        >
          <Bell className="w-4 h-4" />

          {/* Unread count badge */}
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex items-center justify-center">
              {/* Pulse ring animation */}
              <span className="absolute inline-flex h-4 w-4 rounded-full bg-orange-500/40 animate-ping" />
              <span className="relative inline-flex items-center justify-center w-4 h-4 bg-orange-500 rounded-full text-[9px] text-white font-bold tabular-nums">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            </span>
          )}
        </Button>
      </SheetTrigger>

      <SheetContent
        side="right"
        className="w-[420px] sm:max-w-[420px] bg-neutral-950 border-neutral-800 p-0 [&>button:last-child]:hidden"
      >
        <VisuallyHidden>
          <SheetTitle>Notifications Panel</SheetTitle>
        </VisuallyHidden>
        <NotificationPanel
          notifications={notifications}
          loading={loading}
          onMarkRead={handleMarkRead}
          onMarkAllRead={handleMarkAllRead}
          onClearAll={handleClearAll}
          onClose={() => setIsOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
