"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Send,
  Users,
  User,
  Info,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Megaphone,
  Search,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  sendNotification,
  getNotificationHistory,
  type NotificationType,
  type NotificationHistoryItem,
} from "@/actions/admin-notification-actions";
import { cn } from "@/lib/utils";

// ============================================================================
// Helpers
// ============================================================================

const TYPE_OPTIONS: { value: NotificationType; label: string; icon: React.ReactNode; color: string }[] = [
  { value: "info",    label: "Info",    icon: <Info className="w-3.5 h-3.5" />,           color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  { value: "success", label: "Success", icon: <CheckCircle className="w-3.5 h-3.5" />,   color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  { value: "warning", label: "Warning", icon: <AlertTriangle className="w-3.5 h-3.5" />,  color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  { value: "update",  label: "Update",  icon: <RefreshCw className="w-3.5 h-3.5" />,      color: "text-purple-400 bg-purple-500/10 border-purple-500/20" },
];

function getTypeStyle(type: string) {
  return TYPE_OPTIONS.find((t) => t.value === type)?.color ?? "text-neutral-400 bg-neutral-500/10 border-neutral-700";
}

// ============================================================================
// Simple user search result
// ============================================================================

interface UserOption {
  id: string;
  name: string | null;
  email: string;
  username: string | null;
}

// ============================================================================
// Component
// ============================================================================

export function NotificationsTab() {
  // Form state
  const [targetMode, setTargetMode] = useState<"all" | "user">("all");
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<UserOption[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserOption | null>(null);
  const [searching, setSearching] = useState(false);

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState<NotificationType>("info");
  const [sending, setSending] = useState(false);

  // History state
  const [history, setHistory] = useState<NotificationHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const supabase = createClient();

  // ── Search users ──────────────────────────────────────────────────────
  useEffect(() => {
    if (targetMode !== "user" || searchText.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const timeout = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await supabase.rpc("get_users_paginated", {
          page: 1,
          per_page: 8,
          search_text: searchText.trim(),
          status_filter: "active",
        });
        setSearchResults(
          (data || []).map((u: any) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            username: u.username,
          }))
        );
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);

    return () => clearTimeout(timeout);
  }, [searchText, targetMode, supabase]);

  // ── Fetch history ─────────────────────────────────────────────────────
  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const data = await getNotificationHistory(50);
      setHistory(data);
    } catch (err: any) {
      console.error("Failed to fetch history:", err);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // ── Send handler ──────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!title.trim() || !message.trim()) {
      toast.error("Title and message are required");
      return;
    }
    if (targetMode === "user" && !selectedUser) {
      toast.error("Please select a target user");
      return;
    }

    setSending(true);
    try {
      const result = await sendNotification(
        targetMode === "user" ? selectedUser!.id : null,
        title.trim(),
        message.trim(),
        type
      );

      toast.success(
        result.broadcast
          ? `Notification broadcast to ${result.sent_to} users`
          : "Notification sent successfully"
      );

      // Reset form
      setTitle("");
      setMessage("");
      setType("info");
      setSelectedUser(null);
      setSearchText("");

      // Refresh history
      fetchHistory();
    } catch (err: any) {
      toast.error(err.message || "Failed to send notification");
    } finally {
      setSending(false);
    }
  };

  // ====================================================================
  // Render
  // ====================================================================

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto w-full">
      {/* ── Compose Section ─────────────────────────────────────────── */}
      <Card className="bg-neutral-900/40 border-white/5 backdrop-blur-md shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-red-500" />
            Send Notification
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Target Mode */}
          <div className="flex items-center gap-3">
            <Button
              variant={targetMode === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setTargetMode("all");
                setSelectedUser(null);
                setSearchText("");
              }}
              className={cn(
                "gap-1.5",
                targetMode === "all"
                  ? "bg-red-500/20 border-red-500/50 text-red-400 hover:bg-red-500/30"
                  : "bg-black/40 border-white/10 text-neutral-400 hover:text-white"
              )}
            >
              <Users className="w-3.5 h-3.5" />
              All Users
            </Button>
            <Button
              variant={targetMode === "user" ? "default" : "outline"}
              size="sm"
              onClick={() => setTargetMode("user")}
              className={cn(
                "gap-1.5",
                targetMode === "user"
                  ? "bg-red-500/20 border-red-500/50 text-red-400 hover:bg-red-500/30"
                  : "bg-black/40 border-white/10 text-neutral-400 hover:text-white"
              )}
            >
              <User className="w-3.5 h-3.5" />
              Specific User
            </Button>
          </div>

          {/* User Search (only when targeting specific user) */}
          {targetMode === "user" && (
            <div className="space-y-2">
              {selectedUser ? (
                <div className="flex items-center gap-2 px-3 py-2 bg-neutral-800/60 rounded-lg border border-white/5">
                  <User className="w-4 h-4 text-neutral-400" />
                  <span className="text-sm text-white font-medium">
                    {selectedUser.name || selectedUser.email}
                  </span>
                  <span className="text-xs text-neutral-500">
                    {selectedUser.email}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-6 text-xs text-neutral-500 hover:text-white"
                    onClick={() => {
                      setSelectedUser(null);
                      setSearchText("");
                    }}
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
                  <Input
                    placeholder="Search by name, email, or username..."
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    className="pl-9 bg-black/40 border-white/10 text-white placeholder-neutral-500 h-10"
                  />
                  {/* Search results dropdown */}
                  {(searchResults.length > 0 || searching) && (
                    <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-neutral-900 border border-neutral-800 rounded-lg shadow-xl overflow-hidden">
                      {searching && (
                        <div className="p-3 flex items-center gap-2 text-xs text-neutral-500">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Searching...
                        </div>
                      )}
                      {searchResults.map((user) => (
                        <button
                          key={user.id}
                          onClick={() => {
                            setSelectedUser(user);
                            setSearchText("");
                            setSearchResults([]);
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-neutral-800 flex items-center gap-2 transition-colors"
                        >
                          <User className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm text-neutral-200 truncate font-medium">
                              {user.name || "Unnamed"}
                            </p>
                            <p className="text-[11px] text-neutral-500 truncate">
                              {user.email}
                              {user.username && ` · @${user.username}`}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Notification Type */}
          <Select value={type} onValueChange={(v) => setType(v as NotificationType)}>
            <SelectTrigger className="w-[180px] bg-black/40 border-white/10 text-neutral-200 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-neutral-900 border-neutral-800 text-neutral-200 shadow-xl">
              {TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  <span className="flex items-center gap-2">
                    {opt.icon}
                    {opt.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Title */}
          <Input
            placeholder="Notification title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="bg-black/40 border-white/10 text-white placeholder-neutral-500 h-10"
          />

          {/* Message */}
          <Textarea
            placeholder="Notification message..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            className="bg-black/40 border-white/10 text-white placeholder-neutral-500 resize-none"
          />

          {/* Send Button */}
          <Button
            onClick={handleSend}
            disabled={sending || !title.trim() || !message.trim() || (targetMode === "user" && !selectedUser)}
            className="bg-red-500/20 border border-red-500/50 text-red-400 hover:bg-red-500/30 hover:text-red-300 gap-2"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {targetMode === "all" ? "Broadcast to All Users" : "Send Notification"}
          </Button>
        </CardContent>
      </Card>

      <Separator className="bg-neutral-800/60" />

      {/* ── History Section ──────────────────────────────────────────── */}
      <div className="bg-neutral-900/30 border border-white/5 rounded-xl shadow-lg backdrop-blur-sm overflow-hidden">
        <div className="p-4 border-b border-white/5 bg-neutral-900/50 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
            Notification History
          </h3>
          <Button
            variant="outline"
            size="icon"
            onClick={fetchHistory}
            className="h-8 w-8 bg-black/40 border-white/10 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded-lg"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loadingHistory && "animate-spin")} />
          </Button>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-black/20">
              <TableRow className="border-white/5 hover:bg-transparent">
                <TableHead className="text-neutral-400 font-medium h-10">Type</TableHead>
                <TableHead className="text-neutral-400 font-medium h-10">Title</TableHead>
                <TableHead className="text-neutral-400 font-medium h-10">Recipient</TableHead>
                <TableHead className="text-neutral-400 font-medium h-10">Sent By</TableHead>
                <TableHead className="text-neutral-400 font-medium h-10">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingHistory ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-neutral-500">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-neutral-600" />
                    Loading history...
                  </TableCell>
                </TableRow>
              ) : history.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-neutral-500">
                    No notifications sent yet.
                  </TableCell>
                </TableRow>
              ) : (
                history.map((item) => (
                  <TableRow key={item.id} className="border-white/5 hover:bg-neutral-800/40">
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider border",
                          getTypeStyle(item.type)
                        )}
                      >
                        {item.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-[200px]">
                        <p className="text-sm text-neutral-200 truncate font-medium">{item.title}</p>
                        <p className="text-[11px] text-neutral-500 truncate">{item.message}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {item.is_broadcast ? (
                        <Badge variant="secondary" className="bg-red-500/10 text-red-400 border border-red-500/20 text-[10px] uppercase font-bold">
                          <Users className="w-3 h-3 mr-1" />
                          Broadcast
                        </Badge>
                      ) : (
                        <span className="text-sm text-neutral-300">
                          {item.recipient_name || item.recipient_email || "Unknown"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-neutral-400">
                      {item.sent_by_name || "System"}
                    </TableCell>
                    <TableCell className="text-sm text-neutral-400 font-mono">
                      {new Date(item.created_at).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
