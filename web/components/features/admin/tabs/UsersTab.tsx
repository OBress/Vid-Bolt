"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { UserDetailSheet } from "../UserDetailSheet";
import { DeleteUserDialog, type DeleteMode } from "../DeleteUserDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  MoreHorizontal,
  Search,
  RefreshCw,
  Eraser,
  Trash2,
  Copy,
  CheckCircle,
  PauseCircle,
  PlayCircle,
  ShieldCheck,
  Users,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type AccountStatus = "pending" | "active" | "paused" | "banned";

interface User {
  id: string;
  email: string;
  name: string | null;
  username: string | null;
  is_admin: boolean;
  status: AccountStatus;
  date_joined: string;
  total_count: number;
  last_month_status?: string;
  discord_username: string | null;
  discord_avatar: string | null;
  in_vidbolt_server: boolean;
}

export function UsersTab() {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [perPage] = useState(10);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [totalUsers, setTotalUsers] = useState(0);

  // Metrics State
  const [metrics, setMetrics] = useState({ total: 0, active: 0, pending: 0, paused: 0 });
  const [loadingMetrics, setLoadingMetrics] = useState(true);

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [deleteMode, setDeleteMode] = useState<DeleteMode>("wipe");

  const openDeleteDialog = (userId: string, mode: DeleteMode) => {
    setDeleteUserId(userId);
    setDeleteMode(mode);
    setDeleteDialogOpen(true);
  };

  const supabase = createClient();

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_users_paginated", {
        page,
        per_page: perPage,
        search_text: searchText,
        status_filter: statusFilter,
      });

      if (error) throw error;

      if (data && data.length > 0) {
        setUsers(data as User[]);
        setTotalUsers(data[0].total_count);
      } else {
        setUsers([]);
        setTotalUsers(0);
      }
    } catch (err: any) {
      console.error("Failed to fetch users:", err);
      toast.error(`Failed to fetch users: ${err.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  }, [page, perPage, searchText, statusFilter, supabase]);

  const fetchMetricsData = useCallback(async () => {
    setLoadingMetrics(true);
    try {
      const fetchCount = async (status: string) => {
        const { data } = await supabase.rpc("get_users_paginated", {
          page: 1,
          per_page: 1,
          search_text: "",
          status_filter: status,
        });
        return data?.[0]?.total_count || 0;
      };
      const [total, active, pending, paused] = await Promise.all([
        fetchCount("all"),
        fetchCount("active"),
        fetchCount("pending"),
        fetchCount("paused"),
      ]);
      setMetrics({ total, active, pending, paused });
    } catch (err) {
      console.error("Failed to fetch metrics", err);
    } finally {
      setLoadingMetrics(false);
    }
  }, [supabase]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchUsers();
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [fetchUsers]);

  // Fetch metrics once on mount
  useEffect(() => {
    fetchMetricsData();
  }, [fetchMetricsData]);

  const updateUserStatus = async (userId: string, newStatus: AccountStatus) => {
    try {
      const { error } = await supabase.rpc("update_user_status", {
        target_user_id: userId,
        new_status: newStatus,
      });

      if (error) throw error;

      toast.success(`User status updated to ${newStatus}`);
      fetchUsers(); // Refresh list
      fetchMetricsData(); // Refresh metrics
    } catch (err) {
      console.error("Failed to update status:", err);
      toast.error("Failed to update user status");
    }
  };

  const getStatusColor = (status: AccountStatus) => {
    switch (status) {
      case "active":
        return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
      case "pending":
        return "bg-amber-500/10 text-amber-400 border border-amber-500/20";
      case "paused":
        return "bg-orange-500/10 text-orange-400 border border-orange-500/20";
      case "banned":
        return "bg-red-500/10 text-red-500 border border-red-500/20";
      default:
        return "bg-neutral-500/10 text-neutral-400 border border-neutral-700";
    }
  };

  const totalPages = Math.ceil(totalUsers / perPage);

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto w-full">
      {/* Metrics Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-neutral-900/40 border-white/5 backdrop-blur-md shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Total Users</CardTitle>
            <Users className="h-4 w-4 text-neutral-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white tracking-tight">{loadingMetrics ? "-" : metrics.total}</div>
          </CardContent>
        </Card>
        <Card className="bg-neutral-900/40 border-white/5 backdrop-blur-md shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-emerald-500/80">Active Users</CardTitle>
            <CheckCircle className="h-4 w-4 text-emerald-500/50" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white tracking-tight">{loadingMetrics ? "-" : metrics.active}</div>
          </CardContent>
        </Card>
        <Card className="bg-neutral-900/40 border-white/5 backdrop-blur-md shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-amber-500/80">Pending Waitlist</CardTitle>
            <Clock className="h-4 w-4 text-amber-500/50" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white tracking-tight">{loadingMetrics ? "-" : metrics.pending}</div>
          </CardContent>
        </Card>
        <Card className="bg-neutral-900/40 border-white/5 backdrop-blur-md shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-orange-500/80">Paused</CardTitle>
            <PauseCircle className="h-4 w-4 text-orange-500/50" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white tracking-tight">{loadingMetrics ? "-" : metrics.paused}</div>
          </CardContent>
        </Card>
      </div>

      <div className="bg-neutral-900/30 border border-white/5 rounded-xl shadow-lg backdrop-blur-sm overflow-hidden flex flex-col">
        {/* Action Bar */}
        <div className="p-4 border-b border-white/5 bg-neutral-900/50 flex flex-col sm:flex-row items-center gap-4 justify-between">
          <div className="relative w-full sm:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
            <Input
              placeholder="Search by name, email, or username..."
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
                setPage(1); // Reset to first page on search
              }}
              className="pl-9 bg-black/40 border-white/10 text-white placeholder-neutral-500 focus-visible:ring-1 focus-visible:ring-neutral-700 h-10 transition-all rounded-lg"
            />
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Select
              value={statusFilter}
              onValueChange={(val) => {
                setStatusFilter(val);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-[160px] bg-black/40 border-white/10 text-neutral-200 h-10 rounded-lg">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="bg-neutral-900 border-neutral-800 text-neutral-200 shadow-xl">
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="pending">Waitlist (Pending)</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="banned">Banned</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                fetchUsers();
                fetchMetricsData();
              }}
              className="h-10 w-10 shrink-0 bg-black/40 border-white/10 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded-lg transition-colors"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-black/20">
              <TableRow className="border-white/5 hover:bg-transparent">
                <TableHead className="text-neutral-400 font-medium h-12">User</TableHead>
                <TableHead className="text-neutral-400 font-medium h-12">Discord</TableHead>
                <TableHead className="text-neutral-400 font-medium h-12">Status</TableHead>
                <TableHead className="text-neutral-400 font-medium text-center h-12">Paid Status</TableHead>
                <TableHead className="text-neutral-400 font-medium h-12">Joined</TableHead>
                <TableHead className="text-right text-neutral-400 font-medium h-12">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-neutral-500">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-neutral-600" />
                    Loading users...
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-neutral-500">
                    No users found matching your criteria.
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow
                    key={user.id}
                    className="border-white/5 hover:bg-neutral-800/40 transition-colors cursor-pointer group"
                    onClick={() => {
                      setSelectedUser(user);
                      setDetailModalOpen(true);
                    }}
                  >
                    <TableCell>
                      <div className="flex flex-col py-1">
                        <span className="font-semibold text-neutral-200 flex items-center gap-2">
                          {user.name || "Unnamed User"}
                          {user.is_admin && (
                            <Badge variant="outline" className="border-red-500/30 text-red-400 bg-red-500/10 text-[9px] uppercase tracking-wider px-1.5 py-0.5">
                              Admin
                            </Badge>
                          )}
                        </span>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-neutral-400">{user.email}</span>
                          <span className="text-xs text-neutral-600 hidden sm:inline-block border-l border-neutral-700 pl-2">
                            @{user.username || "no-username"}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {user.discord_username ? (
                          <>
                            <div
                              className={cn(
                                "w-2 h-2 rounded-full shrink-0",
                                user.in_vidbolt_server
                                  ? "bg-[#5865F2] shadow-[0_0_6px_rgba(88,101,242,0.6)]"
                                  : "bg-neutral-600"
                              )}
                              title={user.in_vidbolt_server ? "In VidBolt server" : "Not in VidBolt server"}
                            />
                            <span className="text-xs text-neutral-300 font-mono truncate max-w-[120px]">
                              {user.discord_username}
                            </span>
                          </>
                        ) : (
                          <span className="text-xs text-neutral-600">—</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={cn("px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider", getStatusColor(user.status))}>
                        {user.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center">
                        {user.last_month_status === "paid" && (
                          <div className="flex items-center justify-center h-6 px-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold gap-1.5" title="Paid">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                            Paid
                          </div>
                        )}
                        {user.last_month_status === "pending_verification" && (
                          <div className="flex items-center justify-center h-6 px-2 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold gap-1.5" title="Pending Verification">
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)] animate-pulse" />
                            Pending
                          </div>
                        )}
                        {(!user.last_month_status || user.last_month_status === "draft") && (
                          <div className="flex items-center justify-center h-6 px-2 rounded-full bg-neutral-800/50 border border-neutral-700 text-neutral-500 text-xs font-semibold gap-1.5" title="Unpaid / Draft">
                            <div className="w-1.5 h-1.5 rounded-full bg-neutral-600" />
                            Unpaid
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-neutral-400 text-sm font-mono">
                      {new Date(user.date_joined).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 data-[state=open]:opacity-100">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4 text-neutral-400" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-neutral-900 border-neutral-800 p-1 shadow-xl rounded-xl">
                          <DropdownMenuLabel className="text-neutral-500 text-xs font-semibold uppercase tracking-wider px-2 py-1.5">
                            User Actions
                          </DropdownMenuLabel>
                          <DropdownMenuItem
                            className="text-neutral-200 focus:bg-neutral-800 focus:text-neutral-100 cursor-pointer rounded-lg py-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(user.id);
                              toast.success("User ID copied to clipboard");
                            }}
                          >
                            <Copy className="w-4 h-4 mr-2 text-neutral-400" />
                            Copy User ID
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-neutral-800" />

                          {user.status === "pending" && (
                            <DropdownMenuItem
                              className="text-emerald-500 focus:bg-emerald-500/10 focus:text-emerald-400 cursor-pointer font-medium rounded-lg py-2"
                              onClick={(e) => { e.stopPropagation(); updateUserStatus(user.id, "active"); }}
                            >
                              <CheckCircle className="w-4 h-4 mr-2" />
                              Approve Access
                            </DropdownMenuItem>
                          )}

                          {user.status === "active" && (
                            <DropdownMenuItem
                              className="text-orange-500 focus:bg-orange-500/10 focus:text-orange-400 cursor-pointer rounded-lg py-2"
                              onClick={(e) => { e.stopPropagation(); updateUserStatus(user.id, "paused"); }}
                            >
                              <PauseCircle className="w-4 h-4 mr-2" />
                              Pause Account
                            </DropdownMenuItem>
                          )}

                          {user.status === "paused" && (
                            <DropdownMenuItem
                              className="text-emerald-500 focus:bg-emerald-500/10 focus:text-emerald-400 cursor-pointer rounded-lg py-2"
                              onClick={(e) => { e.stopPropagation(); updateUserStatus(user.id, "active"); }}
                            >
                              <PlayCircle className="w-4 h-4 mr-2" />
                              Unpause (Restore)
                            </DropdownMenuItem>
                          )}

                          {user.status === "banned" && (
                            <DropdownMenuItem
                              className="text-emerald-500 focus:bg-emerald-500/10 focus:text-emerald-400 cursor-pointer rounded-lg py-2"
                              onClick={(e) => { e.stopPropagation(); updateUserStatus(user.id, "active"); }}
                            >
                              <ShieldCheck className="w-4 h-4 mr-2" />
                              Unban (Restore)
                            </DropdownMenuItem>
                          )}

                          {/* Deletion Actions - Hidden for admin users */}
                          {!user.is_admin && (
                            <>
                              <DropdownMenuSeparator className="bg-neutral-800" />
                              <DropdownMenuItem
                                className="text-orange-500 focus:bg-orange-500/10 focus:text-orange-400 cursor-pointer rounded-lg py-2"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openDeleteDialog(user.id, "wipe");
                                }}
                              >
                                <Eraser className="w-4 h-4 mr-2 opacity-80" />
                                Wipe User Data
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-red-500 focus:bg-red-500/10 focus:text-red-400 cursor-pointer rounded-lg py-2"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openDeleteDialog(user.id, "delete");
                                }}
                              >
                                <Trash2 className="w-4 h-4 mr-2 opacity-80" />
                                Delete User
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between p-4 border-t border-white/5 bg-black/20">
          <div className="text-xs text-neutral-500 font-medium">
            Showing <span className="text-neutral-300">{users.length}</span> of <span className="text-neutral-300">{totalUsers}</span> users
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
              className="h-8 border-transparent bg-neutral-800/50 hover:bg-neutral-700 text-neutral-300 text-xs px-3"
            >
              Previous
            </Button>
            <span className="text-xs text-neutral-400 font-medium px-2">
              Page {page} of {totalPages || 1}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="h-8 border-transparent bg-neutral-800/50 hover:bg-neutral-700 text-neutral-300 text-xs px-3"
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      <UserDetailSheet
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
        user={selectedUser}
        onUpdate={() => {
          fetchUsers();
          fetchMetricsData();
        }}
      />

      {deleteUserId && (
        <DeleteUserDialog
          open={deleteDialogOpen}
          onOpenChange={(open) => {
            setDeleteDialogOpen(open);
            if (!open) setDeleteUserId(null);
          }}
          userId={deleteUserId}
          mode={deleteMode}
          onSuccess={() => {
            fetchUsers();
            fetchMetricsData();
          }}
        />
      )}
    </div>
  );
}
