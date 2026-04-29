"use client";

import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LayoutDashboard, Users, Wrench, DollarSign } from "lucide-react";
import { AnalyticsTab } from "@/components/features/admin/tabs/AnalyticsTab";
import { UsersTab } from "@/components/features/admin/tabs/UsersTab";
import { DevToolsTab } from "@/components/features/admin/tabs/DevToolsTab";
import { PlatformCostsTab } from "@/components/features/admin/tabs/PlatformCostsTab";
import { PageHeader } from "@/components/shared/PageHeader";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function AdminPageContent() {
  const searchParams = useSearchParams();
  const defaultTab = searchParams.get("tab") || "overview";

  const tabs = [
    {
      id: "overview",
      label: "Overview",
      icon: LayoutDashboard,
      Component: AnalyticsTab,
    },
    {
      id: "users",
      label: "User Management",
      icon: Users,
      Component: UsersTab,
    },
    {
      id: "devtools",
      label: "Dev Tools",
      icon: Wrench,
      Component: DevToolsTab,
    },
    {
      id: "platform-costs",
      label: "Platform Costs",
      icon: DollarSign,
      Component: PlatformCostsTab,
    },
  ];

  return (
    <div className="flex flex-col h-full bg-black text-white overflow-hidden">
      <Tabs
        defaultValue={defaultTab}
        className="flex flex-col h-full overflow-hidden"
      >
        <div className="flex-shrink-0 border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-sm">
          <PageHeader
            title="Admin Panel"
            center={
              <TabsList className="bg-neutral-900/50 p-1 rounded-xl border border-neutral-800/50 shadow-[0_4px_20px_rgba(0,0,0,0.3)] backdrop-blur-sm w-fit justify-start h-auto gap-1">
                {tabs.map((tab) => (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    className="data-[state=active]:bg-neutral-800 data-[state=active]:text-red-500 data-[state=active]:shadow-[0_2px_8px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.05)] data-[state=active]:border-neutral-700/50 rounded-lg bg-transparent px-6 py-2 h-full text-neutral-400 hover:text-white transition-all gap-2 border border-transparent font-medium"
                  >
                    <tab.icon className="w-4 h-4" />
                    <span className="text-sm">{tab.label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            }
          />
        </div>

        <div className="flex-1 overflow-auto">
          {tabs.map((tab) => (
            <TabsContent
              key={tab.id}
              value={tab.id}
              className="mt-0 outline-none h-full data-[state=active]:flex data-[state=active]:flex-col"
            >
              <tab.Component />
            </TabsContent>
          ))}
        </div>
      </Tabs>
    </div>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading admin panel...</div>}>
      <AdminPageContent />
    </Suspense>
  );
}
