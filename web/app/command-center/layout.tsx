"use client";

import { SidebarProvider } from "@/components/layout/SidebarContext";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { MediaProjectsProvider } from "@/hooks/use-media-projects";

export default function CommandCenterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MediaProjectsProvider>
      <SidebarProvider>
        <div className="flex h-screen bg-black">
          <Sidebar />

          {/* Main Content */}
          <div className={`flex-1 flex flex-col min-w-0`}>
            <TopBar />

            {/* Dashboard Content */}
            <div className="flex-1 overflow-hidden">{children}</div>
          </div>
        </div>
      </SidebarProvider>
    </MediaProjectsProvider>
  );
}
