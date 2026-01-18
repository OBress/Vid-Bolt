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
  const title = isWipeMode ? "Delete User Data" : "Delete User";
  const icon = isWipeMode ? (
    <Eraser className="w-5 h-5 text-orange-500" />
  ) : (
    <Trash2 className="w-5 h-5 text-red-500" />
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-neutral-950 border-neutral-800 text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            {icon}
            {title}
          </DialogTitle>
          <DialogDescription className="text-neutral-400">
            {isWipeMode
              ? "This will delete all user-generated content but keep the account."
              : "This will permanently delete the user and all their data."}
          </DialogDescription>
        </DialogHeader>

        {fetching ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
          </div>
        ) : error && !userInfo ? (
          <Alert variant="destructive" className="bg-red-950/50 border-red-900">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : userInfo ? (
          <div className="space-y-4">
            {/* User Info Summary */}
            <div className="p-4 rounded-lg bg-neutral-900/50 border border-neutral-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-400">User</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium">
                    {userInfo.name || userInfo.email}
                  </span>
                  {userInfo.is_admin && (
                    <Badge
                      variant="outline"
                      className="border-red-500/50 text-red-500 text-[10px]"
                    >
                      ADMIN
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-400">Username</span>
                <span className="font-mono text-sm text-neutral-300">
                  @{userInfo.username || "none"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-400">Email</span>
                <span className="text-sm text-neutral-300">
                  {userInfo.email}
                </span>
              </div>
            </div>

            {/* Data to be deleted */}
            <div className="p-4 rounded-lg bg-neutral-900/50 border border-neutral-800">
              <h4 className="text-sm font-medium text-neutral-300 mb-3">
                Data that will be{" "}
                {isWipeMode ? "deleted" : "permanently removed"}:
              </h4>
              <ul className="space-y-1.5 text-sm text-neutral-400">
                <li className="flex justify-between">
                  <span>Tasks</span>
                  <span className="font-mono text-neutral-300">
                    {userInfo.task_count}
                  </span>
                </li>
                <li className="flex justify-between">
                  <span>Video Projects</span>
                  <span className="font-mono text-neutral-300">
                    {userInfo.video_count}
                  </span>
                </li>
                <li className="flex justify-between">
                  <span>Payment Statements</span>
                  <span className="font-mono text-neutral-300">
                    {userInfo.statement_count}
                  </span>
                </li>
                <li className="flex justify-between text-neutral-500">
                  <span>R2 Storage Files</span>
                  <span className="font-mono">All associated files</span>
                </li>
                {!isWipeMode && (
                  <>
                    <li className="flex justify-between text-red-400/80 pt-2 border-t border-neutral-800 mt-2">
                      <span>User Account</span>
                      <span className="font-mono">Will be deleted</span>
                    </li>
                    <li className="flex justify-between text-red-400/80">
                      <span>Authentication</span>
                      <span className="font-mono">Cannot log in again</span>
                    </li>
                  </>
                )}
              </ul>
            </div>

            {/* Warning */}
            <Alert
              variant="destructive"
              className={
                isWipeMode
                  ? "bg-orange-950/30 border-orange-900/50"
                  : "bg-red-950/30 border-red-900/50"
              }
            >
              <AlertTriangle
                className={`h-4 w-4 ${isWipeMode ? "text-orange-500" : "text-red-500"}`}
              />
              <AlertTitle
                className={isWipeMode ? "text-orange-400" : "text-red-400"}
              >
                {isWipeMode ? "Warning" : "Danger Zone"}
              </AlertTitle>
              <AlertDescription
                className={
                  isWipeMode ? "text-orange-300/80" : "text-red-300/80"
                }
              >
                {isWipeMode
                  ? "This action cannot be undone. The user will keep their account but lose all their work."
                  : "This action is IRREVERSIBLE. The user will be permanently removed from the system."}
              </AlertDescription>
            </Alert>

            {/* Confirmation Input */}
            <div className="space-y-2">
              <Label
                htmlFor="confirm-username"
                className="text-sm text-neutral-300"
              >
                Type{" "}
                <span className="font-mono font-bold text-white bg-neutral-800 px-1.5 py-0.5 rounded">
                  {confirmIdentifier}
                </span>{" "}
                to confirm:
              </Label>
              <Input
                id="confirm-username"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder={confirmIdentifier}
                className="bg-neutral-900 border-neutral-700 text-white font-mono focus-visible:ring-neutral-600"
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            {/* Error Display */}
            {error && (
              <Alert
                variant="destructive"
                className="bg-red-950/50 border-red-900"
              >
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="bg-transparent border-neutral-700 text-neutral-300 hover:bg-neutral-900 hover:text-white"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!inputMatches || loading || !userInfo}
            className={
              isWipeMode
                ? "bg-orange-600 hover:bg-orange-700 text-white"
                : "bg-red-600 hover:bg-red-700 text-white"
            }
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {isWipeMode ? "Wiping..." : "Deleting..."}
              </>
            ) : (
              <>
                {isWipeMode ? (
                  <Eraser className="w-4 h-4 mr-2" />
                ) : (
                  <Trash2 className="w-4 h-4 mr-2" />
                )}
                {isWipeMode ? "Wipe Data" : "Delete User"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
