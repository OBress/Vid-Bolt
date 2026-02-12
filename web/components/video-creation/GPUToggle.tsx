"use client";

import { CpuIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";

interface GPUToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  disabled?: boolean;
  isAdmin: boolean;
}

/**
 * Admin-only GPU toggle for enabling/disabling GPU generation.
 * When disabled, the workflow uses placeholder images instead of AI-generated ones.
 * This saves costs during testing of non-GPU-related features.
 */
export function GPUToggle({
  enabled,
  onToggle,
  disabled = false,
  isAdmin,
}: GPUToggleProps) {
  // Only render for admin users
  if (!isAdmin) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all duration-300 ${
              enabled
                ? "bg-green-500/10 border-green-500/30 hover:border-green-500/50"
                : "bg-neutral-800/80 border-neutral-700 hover:border-neutral-600"
            } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <CpuIcon
              className={`w-4 h-4 transition-colors ${
                enabled ? "text-green-500" : "text-neutral-500"
              }`}
            />
            <span
              className={`text-xs font-mono uppercase tracking-widest transition-colors ${
                enabled ? "text-green-500" : "text-neutral-500"
              }`}
            >
              GPU
            </span>
            <Switch
              checked={enabled}
              onCheckedChange={onToggle}
              disabled={disabled}
              className="data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-neutral-600 h-4 w-7"
            />
          </div>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          className="max-w-xs bg-neutral-900 border-neutral-700"
        >
          <div className="space-y-1">
            <p className="font-semibold text-sm">
              {enabled ? "GPU Generation Enabled" : "GPU Generation Disabled"}
            </p>
            <p className="text-xs text-neutral-400">
              {enabled
                ? "AI images will be generated using the GPU VM. This incurs costs."
                : "Using placeholder images. Toggle ON before Step 5 for AI generation."}
            </p>
            {disabled && (
              <p className="text-xs text-orange-400 mt-1">
                Cannot change after Step 4
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
