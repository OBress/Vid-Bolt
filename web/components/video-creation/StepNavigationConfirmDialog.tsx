"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowRight, AlertTriangle, Trash2 } from "lucide-react";

interface StepNavigationConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  direction: "next" | "prev";
  currentStepName: string;
  targetStepName: string;
  /** Warning text describing what data will be deleted when going back */
  resetWarning?: string | null;
  /** Whether the reset operation is in progress */
  isResetting?: boolean;
}

export function StepNavigationConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  direction,
  currentStepName,
  targetStepName,
  resetWarning,
  isResetting = false,
}: StepNavigationConfirmDialogProps) {
  const isGoingBack = direction === "prev";

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => !open && !isResetting && onClose()}
    >
      <DialogContent className="sm:max-w-md bg-neutral-900 border border-neutral-800">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            {isGoingBack && (
              <AlertTriangle className="w-5 h-5 text-amber-500" />
            )}
            {isGoingBack
              ? "Warning: Data Will Be Deleted"
              : "Confirm Navigation"}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="text-neutral-400 space-y-3">
              {isGoingBack ? (
                <>
                  <p>
                    Are you sure you want to go back to{" "}
                    <span className="font-semibold text-white">
                      {targetStepName}
                    </span>
                    ?
                  </p>

                  {/* Warning box for data deletion */}
                  <div className="bg-red-950/50 border border-red-800/50 rounded-lg p-3 space-y-2">
                    <p className="text-red-400 font-medium text-sm flex items-center gap-2">
                      <Trash2 className="w-4 h-4" />
                      Your progress on &quot;{currentStepName}&quot; will be DELETED:
                    </p>
                    <ul className="text-sm text-red-300/80 space-y-1 ml-6 list-disc">
                      {resetWarning ? (
                        <li>{resetWarning}</li>
                      ) : (
                        <li>All saved data for this step</li>
                      )}
                      <li>Any files uploaded to cloud storage</li>
                    </ul>
                    <p className="text-xs text-red-400/70 mt-2">
                      This action cannot be undone.
                    </p>
                  </div>
                </>
              ) : (
                <p>
                  Continue to{" "}
                  <span className="font-semibold text-white">
                    {targetStepName}
                  </span>
                  ?
                </p>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isResetting}
            className="flex-1 border-neutral-700 text-neutral-400 hover:text-white hover:bg-neutral-800"
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isResetting}
            className={`flex-1 gap-2 ${
              isGoingBack
                ? "bg-red-600 hover:bg-red-500 text-white"
                : "bg-green-600 hover:bg-green-500 text-white"
            }`}
          >
            {isResetting ? (
              <>
                <span className="animate-spin">⏳</span>
                Deleting...
              </>
            ) : isGoingBack ? (
              <>
                <Trash2 className="w-4 h-4" />
                Delete & Go Back
              </>
            ) : (
              <>
                Continue
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
