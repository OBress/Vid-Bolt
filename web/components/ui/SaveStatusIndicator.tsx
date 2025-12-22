"use client";

import { Check, X, Loader2 } from "lucide-react";
import { SaveStatus } from "@/hooks/use-project-settings";

interface SaveStatusIndicatorProps {
  status: SaveStatus;
  className?: string;
}

export function SaveStatusIndicator({
  status,
  className = "",
}: SaveStatusIndicatorProps) {
  return (
    <div className={`h-5 inline-flex items-center gap-1 ${className}`}>
      {status === "saving" && (
        <Loader2 className="w-4 h-4 text-neutral-400 animate-spin" />
      )}
      {status === "saved" && (
        <div className="flex items-center gap-1 text-green-500 animate-in fade-in slide-in-from-left-1 duration-200">
          <Check className="w-4 h-4" />
          <span className="text-[10px] font-bold uppercase tracking-wider">
            Saved
          </span>
        </div>
      )}
      {status === "error" && (
        <div className="flex items-center gap-1 text-red-500 animate-in fade-in slide-in-from-left-1 duration-200">
          <X className="w-4 h-4" />
          <span className="text-[10px] font-bold uppercase tracking-wider">
            Error
          </span>
        </div>
      )}
      {status === "idle" && (
        <span className="invisible text-[10px]">Placeholder</span>
      )}
    </div>
  );
}
