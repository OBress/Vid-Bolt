"use client";

/**
 * Delete User Dialog
 * ============================================================================
 * A confirmation dialog for admin user deletion operations.
 * Requires typing the exact username to confirm the action.
 *
 * Supports two modes:
 * - "wipe": Deletes user data but keeps the account
 * - "delete": Completely removes the user from the system
 */

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertTriangle, Trash2, Eraser } from "lucide-react";
import { toast } from "sonner";
import {
  getUserForDeletion,
  wipeUserData,
  deleteUser,
  type UserDeletionInfo,
} from "@/actions/admin-user-actions";
import { cn } from "@/lib/utils";

// ============================================================================
// Types
// ============================================================================

export type DeleteMode = "wipe" | "delete";

interface DeleteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  mode: DeleteMode;
  onSuccess?: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function DeleteUserDialog({
  open,
  onOpenChange,
  userId,
  mode,
  onSuccess,
}: DeleteUserDialogProps) {
  const [userInfo, setUserInfo] = useState<UserDeletionInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [confirmInput, setConfirmInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  // The identifier they need to type to confirm
  const confirmIdentifier = userInfo?.username || userInfo?.email || "";
  const inputMatches = confirmInput === confirmIdentifier;

  // Fetch user info when dialog opens
  const fetchUserInfo = useCallback(async () => {
    if (!userId) return;

    setFetching(true);
    setError(null);

    try {
      const info = await getUserForDeletion(userId);
      setUserInfo(info);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch user info";
      setError(message);
      console.error("[DeleteUserDialog] Error fetching user:", err);
    } finally {
      setFetching(false);
    }
  }, [userId]);

  useEffect(() => {
    if (open) {
      setConfirmInput("");
      setError(null);
      fetchUserInfo();
    } else {
      setUserInfo(null);
    }
  }, [open, fetchUserInfo]);

  // Handle the deletion action
  const handleConfirm = async () => {
    if (!inputMatches || !userInfo) return;

    setLoading(true);
    setError(null);

    try {
      if (mode === "wipe") {
        const result = await wipeUserData(userId, confirmInput);
        toast.success("User Data Wiped", {
          description: `Deleted ${result.deleted_tasks} tasks, ${result.deleted_videos} videos, ${result.deleted_statements} statements. ${result.r2_deleted} files cleaned up.`,
        });
      } else {
        const result = await deleteUser(userId, confirmInput);
        toast.success("User Deleted", {
          description: `User ${result.username || result.email} has been permanently deleted. ${result.r2_deleted} files cleaned up.`,
        });
      }

      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "An error occurred";
      setError(message);
      toast.error("Operation Failed", { description: message });
    } finally {
      setLoading(false);
    }
  };

  // Dialog content based on mode
  const isWipeMode = mode === "wipe";
  const title = isWipeMode ? "Wipe User Data" : "Permanently Delete User";
  const icon = isWipeMode ? (
    <Eraser className="w-5 h-5 text-orange-400" />
  ) : (
    <Trash2 className="w-5 h-5 text-red-400" />
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-neutral-950 border border-white/10 text-white sm:max-w-md shadow-2xl overflow-hidden p-0">
        <DialogHeader className={cn(
          "p-6 border-b border-white/5",
          isWipeMode ? "bg-orange-950/20" : "bg-red-950/20"
        )}>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            {icon}
            {title}
          </DialogTitle>
          <DialogDescription className="text-neutral-400 mt-1">
            {isWipeMode
              ? "This will delete all user-generated content but keep the account active."
              : "This action will permanently delete the user and all associated data."}
          </DialogDescription>
        </DialogHeader>

        <div className="p-6">
          {fetching ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-neutral-600" />
            </div>
          ) : error && !userInfo ? (
            <Alert variant="destructive" className="bg-red-950/50 border-red-900/50">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              <AlertTitle className="text-red-400">Error Loading User</AlertTitle>
              <AlertDescription className="text-red-300/80">{error}</AlertDescription>
            </Alert>
          ) : userInfo ? (
            <div className="space-y-6">
              {/* User Info Summary */}
              <div className="p-4 rounded-xl bg-neutral-900/50 border border-white/5 space-y-3 shadow-inner">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">User</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-neutral-200">
                      {userInfo.name || userInfo.email}
                    </span>
                    {userInfo.is_admin && (
                      <Badge
                        variant="outline"
                        className="border-red-500/30 text-red-400 bg-red-500/10 text-[9px] uppercase tracking-wider px-1.5 py-0.5"
                      >
                        Admin
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Handle</span>
                  <span className="font-mono text-sm text-neutral-300 bg-black/40 px-2 py-0.5 rounded-md border border-white/5">
                    @{userInfo.username || "none"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Email</span>
                  <span className="text-sm text-neutral-300">
                    {userInfo.email}
                  </span>
                </div>
              </div>

              {/* Data to be deleted */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-2">
                  <span className="h-px bg-white/10 flex-1"></span>
                  Data Impact
                  <span className="h-px bg-white/10 flex-1"></span>
                </h4>
                <ul className="space-y-2 text-sm text-neutral-400 bg-black/20 p-4 rounded-xl border border-white/5">
                  <li className="flex justify-between items-center">
                    <span>Generated Tasks</span>
                    <span className="font-mono text-neutral-300 bg-neutral-800/50 px-2 rounded">
                      {userInfo.task_count}
                    </span>
                  </li>
                  <li className="flex justify-between items-center">
                    <span>Video Projects</span>
                    <span className="font-mono text-neutral-300 bg-neutral-800/50 px-2 rounded">
                      {userInfo.video_count}
                    </span>
                  </li>
                  <li className="flex justify-between items-center">
                    <span>Payment Statements</span>
                    <span className="font-mono text-neutral-300 bg-neutral-800/50 px-2 rounded">
                      {userInfo.statement_count}
                    </span>
                  </li>
                  <li className="flex justify-between items-center text-neutral-500">
                    <span>Cloud Storage</span>
                    <span className="font-mono text-[11px] uppercase tracking-wider border border-white/5 px-1.5 rounded bg-black">All Files</span>
                  </li>
                  {!isWipeMode && (
                    <>
                      <li className="flex justify-between items-center text-red-400/80 pt-3 border-t border-white/5 mt-3">
                        <span>User Account</span>
                        <span className="font-mono text-xs uppercase font-bold">Deleted</span>
                      </li>
                      <li className="flex justify-between items-center text-red-400/80">
                        <span>Authentication</span>
                        <span className="font-mono text-xs uppercase font-bold">Revoked</span>
                      </li>
                    </>
                  )}
                </ul>
              </div>

              {/* Warning */}
              <Alert
                variant="destructive"
                className={cn(
                  "border",
                  isWipeMode
                    ? "bg-orange-500/10 border-orange-500/20 text-orange-400"
                    : "bg-red-500/10 border-red-500/20 text-red-400"
                )}
              >
                <AlertTriangle
                  className={cn("h-4 w-4", isWipeMode ? "text-orange-400" : "text-red-400")}
                />
                <AlertTitle className="font-bold">
                  {isWipeMode ? "Caution" : "Danger Zone"}
                </AlertTitle>
                <AlertDescription className="mt-1 text-xs opacity-90">
                  {isWipeMode
                    ? "This action cannot be undone. User data will be wiped permanently."
                    : "This action is IRREVERSIBLE. The user will be permanently removed."}
                </AlertDescription>
              </Alert>

              {/* Confirmation Input */}
              <div className="space-y-3 bg-neutral-900/40 p-4 rounded-xl border border-white/5">
                <Label
                  htmlFor="confirm-username"
                  className="text-sm text-neutral-300 leading-relaxed"
                >
                  Type <span className="font-mono font-bold text-white bg-black border border-white/10 px-2 py-0.5 rounded shadow-sm select-all">{confirmIdentifier}</span> below to confirm:
                </Label>
                <Input
                  id="confirm-username"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  placeholder="Enter confirmation..."
                  className="bg-black/60 border-white/10 text-white font-mono focus-visible:ring-1 focus-visible:ring-neutral-500 h-11"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>

              {/* Error Display */}
              {error && (
                <Alert
                  variant="destructive"
                  className="bg-red-950/50 border-red-900/50"
                >
                  <AlertTriangle className="h-4 w-4 text-red-400" />
                  <AlertDescription className="text-red-300">{error}</AlertDescription>
                </Alert>
              )}
            </div>
          ) : null}
        </div>

        <DialogFooter className="p-6 border-t border-white/5 bg-neutral-900/50 flex sm:justify-between items-center">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="text-neutral-400 hover:text-white hover:bg-white/5"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!inputMatches || loading || !userInfo}
            className={cn(
              "font-bold shadow-lg transition-all",
              isWipeMode
                ? "bg-orange-600 hover:bg-orange-500 text-white shadow-orange-900/20 disabled:opacity-50"
                : "bg-red-600 hover:bg-red-500 text-white shadow-red-900/20 disabled:opacity-50"
            )}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {isWipeMode ? "Wiping Data..." : "Deleting User..."}
              </>
            ) : (
              <>
                {isWipeMode ? (
                  <Eraser className="w-4 h-4 mr-2" />
                ) : (
                  <Trash2 className="w-4 h-4 mr-2" />
                )}
                {isWipeMode ? "Confirm Wipe" : "Confirm Deletion"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
