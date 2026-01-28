"use client";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Cpu, Clock, DollarSign } from "lucide-react";

interface VMStartupWarningDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading?: boolean;
}

/**
 * Warning dialog shown when navigating from Step 4 to Step 5 with GPU enabled but VM is OFF.
 * Warns the user that proceeding will start the VM (incurring costs).
 */
export function VMStartupWarningDialog({
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
}: VMStartupWarningDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-neutral-900 border-neutral-800 max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-orange-500/10 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
            </div>
            <DialogTitle className="text-lg font-bold text-white">
              GPU VM Not Running
            </DialogTitle>
          </div>
          <div className="text-neutral-400 text-sm space-y-4">
            <p>
              The GPU VM is currently{" "}
              <span className="text-red-400 font-medium">offline</span>.
              Proceeding will start the VM to generate AI images for your video.
            </p>

            <div className="grid grid-cols-2 gap-3 p-3 bg-black/30 rounded-lg border border-neutral-800">
              <div className="flex items-center gap-2 text-xs">
                <Clock className="w-4 h-4 text-neutral-500" />
                <span className="text-neutral-300">~2-3 min startup</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <DollarSign className="w-4 h-4 text-neutral-500" />
                <span className="text-neutral-300">GPU costs apply</span>
              </div>
              <div className="flex items-center gap-2 text-xs col-span-2">
                <Cpu className="w-4 h-4 text-green-500" />
                <span className="text-neutral-300">
                  AI-generated reference images
                </span>
              </div>
            </div>
          </div>
        </DialogHeader>

        <DialogFooter className="gap-2 mt-4">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={isLoading}
            className="text-neutral-400 hover:text-white"
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isLoading}
            className="bg-orange-600 hover:bg-orange-700 text-white font-medium"
          >
            {isLoading ? (
              <>
                <span className="animate-spin mr-2">⏳</span>
                Starting VM...
              </>
            ) : (
              "Start VM & Continue"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
