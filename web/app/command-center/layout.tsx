"use client";

import { SidebarProvider } from "@/components/layout/SidebarContext";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { MediaProjectsProvider } from "@/hooks/use-media-projects";
import { UserStatusGuard } from "@/components/auth/UserStatusGuard";
import { FocusModeProvider, useFocusMode } from "@/components/layout/FocusModeContext";

function CommandCenterContent({ children }: { children: React.ReactNode }) {
  const { isFocusMode } = useFocusMode();

  if (isFocusMode) {
    // Focus mode: full viewport, no chrome — maximum performance
    return (
      <div className="flex h-dvh bg-black">
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 overflow-hidden">{children}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh bg-black">
      <Sidebar />
      <div className={`flex-1 flex flex-col min-w-0`}>
        <TopBar />
        <div className="flex-1 overflow-hidden">{children}</div>
      </div>
    </div>
  );
}

export default function CommandCenterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MediaProjectsProvider>
      <SidebarProvider>
        <UserStatusGuard>
          <FocusModeProvider>
            <CommandCenterContent>{children}</CommandCenterContent>
          </FocusModeProvider>
        </UserStatusGuard>
      </SidebarProvider>
    </MediaProjectsProvider>
  );
}

