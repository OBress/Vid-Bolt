"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  ChevronRight,
  Monitor,
  Settings,
  Shield,
  Target,
  Users,
  Bell,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoutButton } from "@/components/LogoutButton";

export default function CommandCenterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const navGroups = [
    {
      id: "media",
      label: "MEDIA CREATION",
      icon: Monitor,
      items: [
        {
          id: "video-studio",
          label: "Video Studio",
          href: "/command-center/media/video-studio",
        },
        {
          id: "assets",
          label: "Asset Manager",
          href: "/command-center/media/assets",
        },
      ],
    },
    {
      id: "analytics",
      label: "ANALYTICS",
      icon: Target,
      items: [
        {
          id: "performance",
          label: "Performance",
          href: "/command-center/analytics/performance",
        },
        {
          id: "audience",
          label: "Audience",
          href: "/command-center/analytics/audience",
        },
      ],
    },
    {
      id: "settings",
      label: "SETTINGS",
      icon: Settings,
      items: [
        {
          id: "general",
          label: "General Settings",
          href: "/command-center/settings/general",
        },
        {
          id: "api-keys",
          label: "API Keys",
          href: "/command-center/settings/api-keys",
        },
      ],
    },
  ];

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

  const getActiveLabel = () => {
    for (const group of navGroups) {
      const item = group.items.find((item) => item.href === pathname);
      if (item) return item.label.toUpperCase();
    }
    return "COMMAND CENTER";
  };

  return (
    <div className="flex h-screen bg-black">
      {/* Sidebar */}
      <div
        className={`${
          sidebarCollapsed ? "w-16" : "w-70"
        } bg-neutral-900 border-r border-neutral-700 transition-all duration-300 fixed md:relative z-50 md:z-auto h-full md:h-auto ${
          !sidebarCollapsed ? "md:block" : ""
        }`}
      >
        <div className="p-4 flex flex-col h-full">
          <div className="flex items-center justify-between mb-8">
            <div className={`${sidebarCollapsed ? "hidden" : "block"}`}>
              <h1 className="text-orange-500 font-bold text-lg tracking-wider">
                VID BOLT
              </h1>
              <p className="text-neutral-500 text-xs">v1.0.0 BETA</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="text-neutral-400 hover:text-orange-500"
            >
              <ChevronRight
                className={`w-4 h-4 sm:w-5 sm:h-5 transition-transform ${
                  sidebarCollapsed ? "" : "rotate-180"
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
              {!sidebarCollapsed && (
                <span className="text-sm font-medium">COMMAND CENTER</span>
              )}
            </Link>

            {navGroups.map((group) => (
              <div key={group.id} className="space-y-1">
                {!sidebarCollapsed ? (
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
                    {expandedGroups.includes(group.id) && (
                      <div className="space-y-1 ml-4 border-l border-neutral-800 pl-2">
                        {group.items.map((item) => (
                          <Link
                            key={item.id}
                            href={item.href}
                            className={`block p-2 text-sm rounded transition-colors ${
                              pathname === item.href
                                ? "text-orange-500 font-medium"
                                : "text-neutral-400 hover:text-white hover:bg-neutral-800"
                            }`}
                          >
                            {item.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-4">
                    <group.icon className="w-5 h-5 text-neutral-400" />
                  </div>
                )}
              </div>
            ))}
          </nav>

          <LogoutButton />

          {!sidebarCollapsed && (
            <div className="mt-8 p-4 bg-neutral-800 border border-neutral-700 rounded">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                <span className="text-xs text-white">SYSTEM ONLINE</span>
              </div>
              <div className="text-xs text-neutral-500">
                <div>UPTIME: 72:14:33</div>
                <div>AGENTS: 847 ACTIVE</div>
                <div>MISSIONS: 23 ONGOING</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Overlay */}
      {!sidebarCollapsed && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarCollapsed(true)}
        />
      )}

      {/* Main Content */}
      <div className={`flex-1 flex flex-col min-w-0`}>
        {/* Top Toolbar */}
        <div className="h-16 bg-neutral-800 border-b border-neutral-700 flex items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <div className="text-sm text-neutral-400">
              TACTICAL COMMAND /{" "}
              <span className="text-orange-500">{getActiveLabel()}</span>
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

        {/* Dashboard Content */}
        <div className="flex-1 overflow-auto">{children}</div>
      </div>
    </div>
  );
}
