"use client";

import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getActiveLabel } from "@/app/command-center/navigation";
import { useMediaProjects } from "@/hooks/use-media-projects";
import { useMemo } from "react";
import { TaskStatusButton } from "@/components/features/tasks/TaskStatusButton";
import { DevButton } from "@/components/features/dev/DevButton";
import { useNavigationStore } from "@/store/use-navigation-store";

export function TopBar() {
  const pathname = usePathname();
  const { projects } = useMediaProjects();
  const { currentVideoName } = useNavigationStore();
  const [lastUpdate, setLastUpdate] = useState<string>("LOADING...");

  useEffect(() => {
    const fetchDate = async () => {
      try {
        const response = await fetch("/api/git-info");
        const data = await response.json();
        const dateStr = data.date;
        if (dateStr) {
          const date = new Date(dateStr);
          const formattedDate = new Intl.DateTimeFormat("en-US", {
            timeZone: "America/New_York",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }).format(date);

          const cleaned = formattedDate.replace(",", "");
          setLastUpdate(`${cleaned} EST`);
        } else {
          setLastUpdate("UNAVAILABLE");
        }
      } catch (err) {
        setLastUpdate("UNAVAILABLE");
      }
    };
    fetchDate();
  }, []);

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
    <div className="h-16 bg-neutral-800 border-b border-neutral-700 flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <div className="text-sm text-neutral-400">
          {label === "COMMAND CENTER" ? (
            displayLabel
          ) : (
            <>COMMAND CENTER / {displayLabel}</>
          )}
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
        <div className="text-xs text-neutral-500 ml-2 uppercase">
          LAST UPDATE: {lastUpdate}
        </div>
      </div>
    </div>
  );
}
