"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoutButton } from "@/components/LogoutButton";
import { useSidebar } from "./SidebarContext";
import { NAV_GROUPS } from "@/app/command-center/navigation";

export function Sidebar() {
  const pathname = usePathname();
  const { isCollapsed, toggle, collapse } = useSidebar();
  const [isHovered, setIsHovered] = useState(false);
  const isVisuallyCollapsed = isCollapsed && !isHovered;
  const [expandedGroups, setExpandedGroups] = useState<string[]>([
    "media",
    "analytics",
    "settings",
  ]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId]
    );
  };

  return (
    <>
      <div
        onMouseEnter={() => isCollapsed && setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`${
          isVisuallyCollapsed ? "w-16" : "w-70"
        } bg-neutral-900 border-r border-neutral-700 transition-all duration-300 fixed md:relative z-50 md:z-auto h-full md:h-auto ${
          !isVisuallyCollapsed ? "md:block" : ""
        }`}
      >
        <div className="p-4 flex flex-col h-full">
          <div className="flex items-center justify-between mb-8">
            <div
              className={`transition-all duration-300 ${
                isVisuallyCollapsed
                  ? "opacity-0 w-0 overflow-hidden"
                  : "opacity-100 w-auto"
              }`}
            >
              <h1 className="text-orange-500 font-bold text-lg tracking-wider whitespace-nowrap">
                VID BOLT
              </h1>
              <p className="text-neutral-500 text-xs whitespace-nowrap">
                v1.0.0 BETA
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggle}
              className="text-neutral-400 hover:text-orange-500"
            >
              <ChevronRight
                className={`w-4 h-4 sm:w-5 sm:h-5 transition-transform ${
                  isVisuallyCollapsed ? "" : "rotate-180"
                }`}
              />
            </Button>
          </div>

          <nav className="space-y-4 mb-8 flex-1 overflow-y-auto custom-scrollbar">
            <Link
              href="/command-center"
              className={`w-full flex items-center gap-3 p-3 rounded transition-colors mb-4 ${
                pathname === "/command-center"
                  ? "bg-orange-500 text-white"
                  : "text-neutral-400 hover:text-white hover:bg-neutral-800"
              }`}
            >
              <Monitor className="w-5 h-5" />
              <span
                className={`text-sm font-medium transition-all duration-300 ${
                  isVisuallyCollapsed
                    ? "opacity-0 w-0 overflow-hidden"
                    : "opacity-100 w-auto"
                } whitespace-nowrap`}
              >
                COMMAND CENTER
              </span>
            </Link>

            {NAV_GROUPS.map((group) => (
              <div key={group.id} className="space-y-1">
                {!isVisuallyCollapsed ? (
                  <>
                    <button
                      onClick={() => toggleGroup(group.id)}
                      className="w-full flex items-center justify-between p-2 text-neutral-500 hover:text-white transition-colors group"
                    >
                      <div className="flex items-center gap-2">
                        <group.icon className="w-4 h-4" />
                        <span className="text-xs font-bold tracking-widest">
                          {group.label}
                        </span>
                      </div>
                      <ChevronRight
                        className={`w-3 h-3 transition-transform duration-200 ${
                          expandedGroups.includes(group.id) ? "rotate-90" : ""
                        }`}
                      />
                    </button>
                    <div
                      className={`space-y-1 ml-4 border-l border-neutral-800 pl-2 transition-all duration-300 ${
                        isVisuallyCollapsed ||
                        !expandedGroups.includes(group.id)
                          ? "opacity-0 h-0 overflow-hidden"
                          : "opacity-100 h-auto"
                      }`}
                    >
                      {group.items.map((item) => (
                        <Link
                          key={item.id}
                          href={item.href}
                          className={`block p-2 text-sm rounded transition-colors ${
                            pathname === item.href
                              ? "text-orange-500 font-medium"
                              : "text-neutral-400 hover:text-white hover:bg-neutral-800"
                          } whitespace-nowrap`}
                        >
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-4">
                    <group.icon className="w-5 h-5 text-neutral-400" />
                  </div>
                )}
              </div>
            ))}
          </nav>

          <LogoutButton isCollapsed={isVisuallyCollapsed} />

          <div
            className={`mt-8 p-4 bg-neutral-800 border border-neutral-700 rounded transition-all duration-300 ${
              isVisuallyCollapsed
                ? "opacity-0 h-0 p-0 border-0 overflow-hidden mt-0"
                : "opacity-100 h-auto"
            }`}
          >
            <div className="flex items-center gap-2 mb-2 whitespace-nowrap">
              <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
              <span className="text-xs text-white">SYSTEM ONLINE</span>
            </div>
            <div className="text-xs text-neutral-500 whitespace-nowrap">
              <div>UPTIME: 72:14:33</div>
              <div>AGENTS: 847 ACTIVE</div>
              <div>MISSIONS: 23 ONGOING</div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Overlay */}
      {!isVisuallyCollapsed && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={collapse}
        />
      )}
    </>
  );
}
