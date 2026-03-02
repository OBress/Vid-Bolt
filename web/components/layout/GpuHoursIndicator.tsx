"use client";

import React, { useState } from "react";
import { useGpuHours } from "@/hooks/use-gpu-hours";
import { Zap, Plus, Loader2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

/**
 * TopBar indicator showing the user's GPU hours balance.
 * Click to reveal a popover with balance details and a link to purchase more.
 */
export function GpuHoursIndicator() {
  const { balance, loading } = useGpuHours();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const handlePurchaseClick = () => {
    setOpen(false);
    router.push("/command-center/settings/general?tab=account");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg
            bg-neutral-900/60 border border-neutral-800/50
            hover:bg-neutral-800/60 hover:border-neutral-700/50
            transition-all duration-200 cursor-pointer group"
        >
          <Zap className="w-3.5 h-3.5 text-orange-500 group-hover:text-orange-400 transition-colors" />
          {loading ? (
            <Loader2 className="w-3 h-3 animate-spin text-neutral-500" />
          ) : (
            <span className="text-xs font-mono font-medium text-neutral-300 group-hover:text-white transition-colors">
              {balance} hr{balance !== 1 ? "s" : ""}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-64 bg-neutral-900 border-neutral-800 p-4"
      >
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-orange-500/10 rounded-md">
              <Zap className="w-4 h-4 text-orange-500" />
            </div>
            <div>
              <p className="text-xs font-mono text-neutral-400 uppercase tracking-wider">
                GPU Hours
              </p>
              <p className="text-lg font-bold text-white">
                {loading ? "—" : balance}
                <span className="text-sm font-normal text-neutral-400 ml-1">
                  hr{balance !== 1 ? "s" : ""}
                </span>
              </p>
            </div>
          </div>

          <p className="text-[11px] text-neutral-500 leading-relaxed">
            GPU hours are used for rendering videos. Each hour costs $1.
          </p>

          <Button
            onClick={handlePurchaseClick}
            size="sm"
            className="w-full bg-orange-600 hover:bg-orange-500 text-white font-medium text-xs h-8 gap-1.5"
          >
            <Plus className="w-3 h-3" />
            Purchase More
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
