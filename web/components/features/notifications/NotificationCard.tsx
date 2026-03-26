"use client";

import { useMemo } from "react";
import {
  Info,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================================
// Types
// ============================================================================

export interface NotificationData {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
  sent_by_name: string | null;
}

// ============================================================================
// Helpers
// ============================================================================

function getTypeConfig(type: string) {
  switch (type) {
    case "success":
      return {
        icon: <CheckCircle className="w-4 h-4" />,
        color: "text-emerald-400",
        bg: "bg-emerald-500/10",
        border: "border-emerald-500/20",
        dot: "bg-emerald-500",
      };
    case "warning":
      return {
        icon: <AlertTriangle className="w-4 h-4" />,
        color: "text-amber-400",
        bg: "bg-amber-500/10",
        border: "border-amber-500/20",
        dot: "bg-amber-500",
      };
    case "update":
      return {
        icon: <RefreshCw className="w-4 h-4" />,
        color: "text-purple-400",
        bg: "bg-purple-500/10",
        border: "border-purple-500/20",
        dot: "bg-purple-500",
      };
    default:
      return {
        icon: <Info className="w-4 h-4" />,
        color: "text-blue-400",
        bg: "bg-blue-500/10",
        border: "border-blue-500/20",
        dot: "bg-blue-500",
      };
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

// ============================================================================
// Component
// ============================================================================

interface NotificationCardProps {
  notification: NotificationData;
  onMarkRead?: (id: string) => void;
}

export function NotificationCard({ notification, onMarkRead }: NotificationCardProps) {
  const config = useMemo(() => getTypeConfig(notification.type), [notification.type]);

  return (
    <button
      onClick={() => {
        if (!notification.is_read && onMarkRead) {
          onMarkRead(notification.id);
        }
      }}
      className={cn(
        "w-full text-left rounded-lg border p-3 transition-all duration-150",
        notification.is_read
          ? "bg-neutral-900/30 border-neutral-800/50 opacity-60 hover:opacity-80"
          : "bg-neutral-800/40 border-neutral-700/50 hover:bg-neutral-800/60"
      )}
    >
      <div className="flex items-start gap-2.5">
        {/* Type icon */}
        <div
          className={cn(
            "shrink-0 w-7 h-7 rounded-md flex items-center justify-center mt-0.5",
            config.bg,
            config.border,
            config.color,
            "border"
          )}
        >
          {config.icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-neutral-200 truncate">
              {notification.title}
            </p>
            {/* Unread dot */}
            {!notification.is_read && (
              <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", config.dot)} />
            )}
          </div>
          <p className="text-xs text-neutral-400 mt-0.5 line-clamp-2 leading-relaxed">
            {notification.message}
          </p>
          <p className="text-[10px] text-neutral-600 mt-1.5">
            {timeAgo(notification.created_at)}
            {notification.sent_by_name && (
              <span className="text-neutral-600"> · from {notification.sent_by_name}</span>
            )}
          </p>
        </div>
      </div>
    </button>
  );
}
