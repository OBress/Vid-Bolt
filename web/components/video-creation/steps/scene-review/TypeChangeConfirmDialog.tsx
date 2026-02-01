"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";

interface TypeChangeConfirmDialogProps {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  fromType: string;
  toType: string;
  hasKeyframes?: boolean;
}

/**
 * Confirmation dialog shown when user changes media type on save.
 * Warns that existing generated content will be deleted.
 */
export function TypeChangeConfirmDialog({
  isOpen,
  onCancel,
  onConfirm,
  fromType,
  toType,
  hasKeyframes = false,
}: TypeChangeConfirmDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="bg-neutral-950 border-neutral-800 text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-400">
            <AlertTriangle className="w-5 h-5" />
            Change Media Type?
          </DialogTitle>
          <DialogDescription className="text-neutral-400 space-y-2">
            <p>
              You are changing from <span className="text-white font-medium">{fromType}</span> to{" "}
              <span className="text-white font-medium">{toType}</span>.
            </p>
            <p>
              This will <span className="text-red-400">permanently delete</span> the current generated{" "}
              {fromType.toLowerCase()} content.
            </p>
            {hasKeyframes && (
              <p className="text-amber-400">
                ⚠️ Any configured keyframe images will also be deleted.
              </p>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex gap-2 justify-end">
          <Button
            variant="ghost"
            className="text-neutral-300 hover:bg-neutral-800"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            className="bg-red-600 hover:bg-red-700 text-white"
            onClick={onConfirm}
          >
            Delete & Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

