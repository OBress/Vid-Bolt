"use client";

/**
 * Ban User Dialog
 * ============================================================================
 * Confirmation dialog for banning a user. Shows user info and allows
 * entering an optional reason. Banning persists the email + Discord ID
 * in banned_identities and deletes the account.
 */

import { useState } from "react";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, ShieldBan, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { banUser } from "@/actions/admin-user-actions";

// ============================================================================
// Types
// ============================================================================

interface BanUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string | null;
  userEmail: string;
  onSuccess?: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function BanUserDialog({
  open,
  onOpenChange,
  userId,
  userName,
  userEmail,
  onSuccess,
}: BanUserDialogProps) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBan = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await banUser(userId, reason || undefined);
      toast.success("User Banned", {
        description: `${result.username || result.email} has been banned. Their email and Discord ID are now blacklisted.`,
      });
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "An error occurred";
      setError(message);
      toast.error("Ban Failed", { description: message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-neutral-950 border border-white/10 text-white sm:max-w-md shadow-2xl overflow-hidden p-0">
        <DialogHeader className="p-6 border-b border-white/5 bg-red-950/20">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <ShieldBan className="w-5 h-5 text-red-400" />
            Ban User
          </DialogTitle>
          <DialogDescription className="text-neutral-400 mt-1">
            This will permanently ban this user and prevent them from
            re-registering with the same email or Discord account.
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 space-y-5">
          {/* User Info */}
          <div className="p-4 rounded-xl bg-neutral-900/50 border border-white/5 space-y-2 shadow-inner">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                User
              </span>
              <span className="font-medium text-neutral-200">
                {userName || "Unnamed User"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Email
              </span>
              <span className="text-sm text-neutral-300">{userEmail}</span>
            </div>
          </div>

          {/* Warning */}
          <Alert
            variant="destructive"
            className="bg-red-500/10 border-red-500/20 text-red-400"
          >
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <AlertTitle className="font-bold">Permanent Ban</AlertTitle>
            <AlertDescription className="mt-1 text-xs opacity-90">
              Both the email address and Discord account will be blacklisted.
              The user will be unable to sign up again unless you unban them from
              the Banned Identities panel.
            </AlertDescription>
          </Alert>

          {/* Optional Reason */}
          <div className="space-y-2">
            <Label
              htmlFor="ban-reason"
              className="text-sm text-neutral-400"
            >
              Reason (optional)
            </Label>
            <Input
              id="ban-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Spam, abuse, etc."
              className="bg-black/60 border-white/10 text-white focus-visible:ring-1 focus-visible:ring-neutral-500 h-10"
              autoComplete="off"
            />
          </div>

          {/* Error Display */}
          {error && (
            <Alert
              variant="destructive"
              className="bg-red-950/50 border-red-900/50"
            >
              <AlertTriangle className="h-4 w-4 text-red-400" />
              <AlertDescription className="text-red-300">
                {error}
              </AlertDescription>
            </Alert>
          )}
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
            onClick={handleBan}
            disabled={loading}
            className="bg-red-600 hover:bg-red-500 text-white font-bold shadow-lg shadow-red-900/20 disabled:opacity-50 transition-all"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Banning...
              </>
            ) : (
              <>
                <ShieldBan className="w-4 h-4 mr-2" />
                Confirm Ban
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
