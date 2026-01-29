"use client";

import { ImageIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";

interface StockMediaOverrideToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  disabled?: boolean;
  isAdmin: boolean;
  /** Only show when stock media was set to none in Step 1 */
  showOverride: boolean;
}

/**
 * Admin-only toggle to enable stock media scraping in Step 5,
 * even when stock media was disabled in Step 1.
 */
export function StockMediaOverrideToggle({
  enabled,
  onToggle,
  disabled = false,
  isAdmin,
  showOverride,
}: StockMediaOverrideToggleProps) {
  // Only render for admin users when override is relevant
  if (!isAdmin || !showOverride) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all duration-300 ${
              enabled
                ? "bg-orange-500/10 border-orange-500/30 hover:border-orange-500/50"
                : "bg-neutral-800/80 border-neutral-700 hover:border-neutral-600"
            } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <ImageIcon
              className={`w-4 h-4 transition-colors ${
                enabled ? "text-orange-500" : "text-neutral-500"
              }`}
            />
            <span
              className={`text-xs font-mono uppercase tracking-widest transition-colors ${
                enabled ? "text-orange-500" : "text-neutral-500"
              }`}
            >
              Stock
            </span>
            <Switch
              checked={enabled}
              onCheckedChange={onToggle}
              disabled={disabled}
              className="data-[state=checked]:bg-orange-500 data-[state=unchecked]:bg-neutral-600 h-4 w-7"
            />
          </div>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          className="max-w-xs bg-neutral-900 border-neutral-700"
        >
          <div className="space-y-1">
            <p className="font-semibold text-sm">
              {enabled ? "Stock Media Override ON" : "Stock Media Override OFF"}
            </p>
            <p className="text-xs text-neutral-400">
              {enabled
                ? "Step 5 will scrape and match stock images despite Step 1 setting."
                : "Stock media was disabled in Step 1. Toggle ON to enable matching in Step 5."}
            </p>
            {disabled && (
              <p className="text-xs text-orange-400 mt-1">
                Cannot change after Step 5 starts
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
