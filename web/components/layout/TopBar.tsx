"use client";

import { usePathname } from "next/navigation";
import { Bell, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getActiveLabel } from "@/app/command-center/navigation";
import { useMediaProjects } from "@/hooks/use-media-projects";
import { useMemo } from "react";
import { TaskStatusButton } from "@/components/features/tasks/TaskStatusButton";
import { DevButton } from "@/components/features/dev/DevButton";

export function TopBar() {
  const pathname = usePathname();
  const { projects } = useMediaProjects();

  // Extract project name if on a media project page
  const displayLabel = useMemo(() => {
    const mediaMatch = pathname.match(/\/command-center\/media\/([^\/]+)/);
    if (mediaMatch) {
      const projectId = mediaMatch[1];
      const project = projects.find((p) => p.id === projectId);
      if (project) {
        return project.name.toUpperCase();
      }
      return "MEDIA PROJECT";
    }
    return getActiveLabel(pathname);
  }, [pathname, projects]);

  return (
    <div className="h-16 bg-neutral-800 border-b border-neutral-700 flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <div className="text-sm text-neutral-400">
          COMMAND CENTER /{" "}
          <span className="text-orange-500">{displayLabel}</span>
        </div>
      </div>

      {/* Center - Dev Button */}
      <div className="absolute left-1/2 transform -translate-x-1/2">
        <DevButton />
      </div>

      <div className="flex items-center gap-2">
        <TaskStatusButton />
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
        <div className="text-xs text-neutral-500 ml-2">
          LAST UPDATE: 05/06/2025 20:00 UTC
        </div>
      </div>
    </div>
  );
}
