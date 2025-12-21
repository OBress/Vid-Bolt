"use client";

import { usePathname } from "next/navigation";
import { Bell, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getActiveLabel } from "@/app/command-center/navigation";

export function TopBar() {
  const pathname = usePathname();

  return (
    <div className="h-16 bg-neutral-800 border-b border-neutral-700 flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <div className="text-sm text-neutral-400">
          COMMAND CENTER /{" "}
          <span className="text-orange-500">{getActiveLabel(pathname)}</span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-xs text-neutral-500">
          LAST UPDATE: 05/06/2025 20:00 UTC
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="text-neutral-400 hover:text-orange-500"
        >
          <Bell className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-neutral-400 hover:text-orange-500"
        >
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
