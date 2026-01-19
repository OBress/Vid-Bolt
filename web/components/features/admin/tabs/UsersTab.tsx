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
import { Checkbox } from "@/components/ui/checkbox";
import { UserDetailModal } from "../UserDetailModal";
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
import {
  MoreHorizontal,
  Search,
  RefreshCw,
  Filter,
  Eraser,
  Trash2,
  Copy,
  CheckCircle,
  PauseCircle,
  PlayCircle,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
      console.error("Error details:", err.message, err.details, err.hint);
      toast.error(`Failed to fetch users: ${err.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  }, [page, perPage, searchText, statusFilter, supabase]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchUsers();
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [fetchUsers]);

  const updateUserStatus = async (userId: string, newStatus: AccountStatus) => {
    try {
      const { error } = await supabase.rpc("update_user_status", {
        target_user_id: userId,
        new_status: newStatus,
      });

      if (error) throw error;

      toast.success(`User status updated to ${newStatus}`);
      fetchUsers(); // Refresh list
    } catch (err) {
      console.error("Failed to update status:", err);
      toast.error("Failed to update user status");
    }
  };

  const getStatusColor = (status: AccountStatus) => {
    switch (status) {
      case "active":
        return "bg-green-500/10 text-green-500 hover:bg-green-500/20";
      case "pending":
        return "bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20";
      case "paused":
        return "bg-orange-500/10 text-orange-500 hover:bg-orange-500/20";
      case "banned":
        return "bg-red-500/10 text-red-500 hover:bg-red-500/20";
      default:
        return "bg-neutral-500/10 text-neutral-500";
    }
  };

  const totalPages = Math.ceil(totalUsers / perPage);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-neutral-500" />
          <Input
            placeholder="Search users..."
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value);
              setPage(1); // Reset to first page on search
            }}
            className="pl-8 bg-neutral-900 border-neutral-800 text-neutral-200 focus-visible:ring-neutral-700"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(val) => {
            setStatusFilter(val);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[180px] bg-neutral-900 border-neutral-800 text-neutral-200">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent className="bg-neutral-900 border-neutral-800 text-neutral-200">
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
          onClick={() => fetchUsers()}
          className="bg-neutral-900 border-neutral-800 hover:bg-neutral-800"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="rounded-md border border-neutral-800 bg-neutral-900/50">
        <Table>
          <TableHeader>
            <TableRow className="border-neutral-800 hover:bg-transparent">
              <TableHead className="text-neutral-400">User</TableHead>
              <TableHead className="text-neutral-400">Status</TableHead>
              <TableHead className="text-neutral-400 text-center">
                Paid (Last Month)
              </TableHead>
              <TableHead className="text-neutral-400">Joined</TableHead>
              <TableHead className="text-right text-neutral-400">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && users.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="h-24 text-center text-neutral-400"
                >
                  Loading users...
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="h-24 text-center text-neutral-400"
                >
                  No users found.
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow
                  key={user.id}
                  className="border-neutral-800 hover:bg-neutral-900 cursor-pointer"
                  onClick={() => {
                    setSelectedUser(user);
                    setDetailModalOpen(true);
                  }}
                >
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium text-neutral-200">
                        {user.name || "Unnamed"}
                        {user.is_admin && (
                          <Badge
                            variant="outline"
                            className="ml-2 border-red-500/50 text-red-500 text-[10px] h-4"
                          >
                            ADMIN
                          </Badge>
                        )}
                      </span>
                      <span className="text-xs text-neutral-500">
                        {user.email}
                      </span>
                      <span className="text-xs text-neutral-600">
                        @{user.username || "no-username"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={getStatusColor(user.status)}
                    >
                      {user.status.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex justify-center">
                      {user.last_month_status === "paid" && (
                        <div
                          className="h-3 w-3 rounded-full bg-green-500 shadow-[0_0_8px] shadow-green-500/50"
                          title="Paid"
                        />
                      )}
                      {user.last_month_status === "pending_verification" && (
                        <div
                          className="h-3 w-3 rounded-full bg-yellow-500 shadow-[0_0_8px] shadow-yellow-500/50"
                          title="Pending Verification"
                        />
                      )}
                      {(!user.last_month_status ||
                        user.last_month_status === "draft") && (
                        <div
                          className="h-3 w-3 rounded-full bg-red-500/20 border border-red-500/50"
                          title="Unpaid"
                        />
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-neutral-400 text-sm">
                    {new Date(user.date_joined).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4 text-neutral-400" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="bg-neutral-900 border-neutral-800"
                      >
                        <DropdownMenuLabel className="text-neutral-400">
                          Actions
                        </DropdownMenuLabel>
                        <DropdownMenuItem
                          className="text-neutral-200 focus:bg-neutral-800 focus:text-neutral-100 cursor-pointer"
                          onClick={() => navigator.clipboard.writeText(user.id)}
                        >
                          <Copy className="w-4 h-4 mr-2" />
                          Copy User ID
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-neutral-800" />

                        {user.status === "pending" && (
                          <DropdownMenuItem
                            className="text-green-500 focus:bg-green-500/10 focus:text-green-400 cursor-pointer font-medium"
                            onClick={() => updateUserStatus(user.id, "active")}
                          >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Approve Access (Whitelist)
                          </DropdownMenuItem>
                        )}

                        {user.status === "active" && (
                          <>
                            <DropdownMenuItem
                              className="text-orange-500 focus:bg-orange-500/10 focus:text-orange-400 cursor-pointer"
                              onClick={() =>
                                updateUserStatus(user.id, "paused")
                              }
                            >
                              <PauseCircle className="w-4 h-4 mr-2" />
                              Pause Account
                            </DropdownMenuItem>
                          </>
                        )}

                        {user.status === "paused" && (
                          <DropdownMenuItem
                            className="text-green-500 focus:bg-green-500/10 focus:text-green-400 cursor-pointer"
                            onClick={() => updateUserStatus(user.id, "active")}
                          >
                            <PlayCircle className="w-4 h-4 mr-2" />
                            Unpause (Restore)
                          </DropdownMenuItem>
                        )}

                        {user.status === "banned" && (
                          <DropdownMenuItem
                            className="text-green-500 focus:bg-green-500/10 focus:text-green-400 cursor-pointer"
                            onClick={() => updateUserStatus(user.id, "active")}
                          >
                            <ShieldCheck className="w-4 h-4 mr-2" />
                            Unban (Restore)
                          </DropdownMenuItem>
                        )}

                        {/* Deletion Actions - Hidden for admin users */}
                        {!user.is_admin && (
                          <>
                            <DropdownMenuItem
                              className="text-orange-500 focus:bg-orange-500/10 focus:text-orange-400 cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                openDeleteDialog(user.id, "wipe");
                              }}
                            >
                              <Eraser className="w-4 h-4 mr-2" />
                              Delete User Data
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-500 focus:bg-red-500/10 focus:text-red-400 cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                openDeleteDialog(user.id, "delete");
                              }}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
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
      <div className="flex items-center justify-end space-x-2 py-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1 || loading}
          className="bg-neutral-900 border-neutral-800 text-neutral-400 hover:bg-neutral-800 hover:text-white"
        >
          Previous
        </Button>
        <span className="text-sm text-neutral-400">
          Page {page} of {totalPages || 1}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages || loading}
          className="bg-neutral-900 border-neutral-800 text-neutral-400 hover:bg-neutral-800 hover:text-white"
        >
          Next
        </Button>
      </div>
      <UserDetailModal
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
        user={selectedUser}
        onUpdate={() => {
          fetchUsers();
        }}
      />

      {/* Delete User Dialog */}
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
          }}
        />
      )}
    </div>
  );
}
