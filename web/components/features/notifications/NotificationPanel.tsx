"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Trash2,
  Loader2,
  Bell,
  BellOff,
  CheckCheck,
  X,
} from "lucide-react";
import { NotificationCard, type NotificationData } from "./NotificationCard";

// ============================================================================
// Types
// ============================================================================

interface NotificationPanelProps {
  notifications: NotificationData[];
  loading: boolean;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onClearAll: () => void;
  onClose: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function NotificationPanel({
  notifications,
  loading,
  onMarkRead,
  onMarkAllRead,
  onClearAll,
  onClose,
}: NotificationPanelProps) {
  const unread = useMemo(
    () => notifications.filter((n) => !n.is_read),
    [notifications]
  );

  const read = useMemo(
    () => notifications.filter((n) => n.is_read),
    [notifications]
  );

  const isEmpty = notifications.length === 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
        <div className="flex items-center gap-2.5">
          <Bell className="w-4.5 h-4.5 text-orange-500" />
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            Notifications
          </h2>
          {unread.length > 0 && (
            <span className="text-[10px] font-bold text-orange-400 bg-orange-500/15 px-1.5 py-0.5 rounded-full tabular-nums">
              {unread.length} new
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Mark all as read */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-neutral-500 hover:text-blue-400 disabled:opacity-30 disabled:hover:text-neutral-500"
            onClick={onMarkAllRead}
            disabled={unread.length === 0}
            title="Mark all as read"
          >
            <CheckCheck className="w-3.5 h-3.5" />
          </Button>

          {/* Clear all */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-neutral-500 hover:text-red-400 disabled:opacity-30 disabled:hover:text-neutral-500"
            onClick={onClearAll}
            disabled={isEmpty}
            title="Clear all notifications"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>

          {/* Close */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-neutral-500 hover:text-white"
            onClick={onClose}
            title="Close panel"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 overflow-hidden">
        {loading && notifications.length === 0 ? (
          <div className="p-6 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-orange-500/60" />
            <p className="text-xs text-neutral-500">Loading notifications…</p>
          </div>
        ) : isEmpty ? (
          <div className="p-10 flex flex-col items-center justify-center gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-neutral-800/60 flex items-center justify-center">
              <BellOff className="w-6 h-6 text-neutral-600" />
            </div>
            <div>
              <p className="text-sm text-neutral-400 font-medium">No notifications</p>
              <p className="text-xs text-neutral-600 mt-0.5">
                You&apos;re all caught up!
              </p>
            </div>
          </div>
        ) : (
          <div className="p-3 space-y-4">
            {/* Unread */}
            {unread.length > 0 && (
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 px-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                  <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
                    New · {unread.length}
                  </p>
                </div>
                <div className="space-y-2">
                  {unread.map((n) => (
                    <NotificationCard
                      key={n.id}
                      notification={n}
                      onMarkRead={onMarkRead}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Separator */}
            {unread.length > 0 && read.length > 0 && (
              <Separator className="bg-neutral-800/60" />
            )}

            {/* Read */}
            {read.length > 0 && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between px-1">
                  <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
                    Earlier · {read.length}
                  </p>
                </div>
                <div className="space-y-1.5">
                  {read.map((n) => (
                    <NotificationCard key={n.id} notification={n} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
