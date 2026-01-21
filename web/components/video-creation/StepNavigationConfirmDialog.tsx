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
import { ArrowLeft, ArrowRight, AlertTriangle } from "lucide-react";

interface StepNavigationConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  direction: "next" | "prev";
  currentStepName: string;
  targetStepName: string;
}

export function StepNavigationConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  direction,
  currentStepName,
  targetStepName,
}: StepNavigationConfirmDialogProps) {
  const isGoingBack = direction === "prev";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md bg-neutral-900 border border-neutral-800">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            {isGoingBack && (
              <AlertTriangle className="w-5 h-5 text-amber-500" />
            )}
            Confirm Navigation
          </DialogTitle>
          <DialogDescription className="text-neutral-400">
            {isGoingBack ? (
              <>
                Are you sure you want to go back to{" "}
                <span className="font-semibold text-white">
                  {targetStepName}
                </span>
                ? Your progress on the current step will be saved.
              </>
            ) : (
              <>
                Continue to{" "}
                <span className="font-semibold text-white">
                  {targetStepName}
                </span>
                ?
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 border-neutral-700 text-neutral-400 hover:text-white hover:bg-neutral-800"
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            className={`flex-1 gap-2 ${
              isGoingBack
                ? "bg-red-600 hover:bg-red-500 text-white"
                : "bg-green-600 hover:bg-green-500 text-white"
            }`}
          >
            {isGoingBack ? (
              <>
                <ArrowLeft className="w-4 h-4" />
                Go Back
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
