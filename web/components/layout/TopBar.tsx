"use client";

import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getActiveLabel } from "@/app/command-center/navigation";
import { useMediaProjects } from "@/hooks/use-media-projects";
import { useMemo } from "react";
import { TaskStatusButton } from "@/components/features/tasks/TaskStatusButton";
import { useNavigationStore } from "@/store/use-navigation-store";
import { VMStatus } from "@/components/layout/VMStatus";

export function TopBar() {
  const pathname = usePathname();
  const { projects } = useMediaProjects();
  const { currentVideoName } = useNavigationStore();

  // Extract project name if on a media project page
  const { label, displayLabel } = useMemo(() => {
    const mediaMatch = pathname.match(/\/command-center\/media\/([^\/]+)/);
    let label = "";

    if (mediaMatch) {
      const projectId = mediaMatch[1];
      const project = projects.find((p) => p.id === projectId);
      label = project ? project.name.toUpperCase() : "MEDIA PROJECT";
    } else {
      label = getActiveLabel(pathname);
    }

    if (currentVideoName) {
      return {
        label,
        displayLabel: (
          <>
            {label} /{" "}
            <span className="text-orange-500">
              {currentVideoName.toUpperCase()}
            </span>
          </>
        ),
      };
    }

    return {
      label,
      displayLabel: <span className="text-orange-500">{label}</span>,
    };
  }, [pathname, projects, currentVideoName]);

  return (
    <div className="h-16 bg-neutral-800 border-b border-neutral-700 flex items-center justify-between px-6 relative">
      <div className="flex items-center gap-4">
        <div className="text-sm text-neutral-400">
          {label === "COMMAND CENTER" ? (
            displayLabel
          ) : (
            <>COMMAND CENTER / {displayLabel}</>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <VMStatus />
        <TaskStatusButton />
        <Button
          variant="ghost"
          size="icon"
          className="text-neutral-400 hover:text-orange-500"
        >
          <Bell className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
