"use client";

import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getActiveLabel } from "@/app/command-center/navigation";
import { useMediaProjects } from "@/hooks/use-media-projects";
import { useMemo } from "react";
import { TaskStatusButton } from "@/components/features/tasks/TaskStatusButton";
import { NotificationButton } from "@/components/features/notifications/NotificationButton";
import { useNavigationStore } from "@/store/use-navigation-store";
import { VMStatus } from "@/components/layout/VMStatus";
import { GpuHoursIndicator } from "@/components/layout/GpuHoursIndicator";
import { useSidebar } from "./SidebarContext";

export function TopBar() {
  const pathname = usePathname();
  const { projects } = useMediaProjects();
  const { currentVideoName } = useNavigationStore();
  const { toggle } = useSidebar();

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
    <div className="h-14 md:h-16 bg-neutral-800 border-b border-neutral-700 flex items-center justify-between px-3 md:px-6 relative">
      <div className="flex items-center gap-2 md:gap-4 min-w-0">
        {/* Mobile hamburger */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          className="md:hidden text-neutral-400 hover:text-orange-500 flex-shrink-0"
        >
          <Menu className="w-5 h-5" />
        </Button>

        <div className="text-sm text-neutral-400 truncate">
          {/* Desktop: full breadcrumb */}
          <span className="hidden md:inline">
            {label === "COMMAND CENTER" ? (
              displayLabel
            ) : (
              <>COMMAND CENTER / {displayLabel}</>
            )}
          </span>
          {/* Mobile: short label only */}
          <span className="md:hidden">{displayLabel}</span>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="hidden sm:block">
          <VMStatus />
        </div>
        <div className="hidden sm:block">
          <GpuHoursIndicator />
        </div>
        <TaskStatusButton />
        <NotificationButton />
      </div>
    </div>
  );
}
