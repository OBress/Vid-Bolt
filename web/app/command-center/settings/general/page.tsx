"use client";

import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Monitor, Key } from "lucide-react";
import { AccountTab } from "@/components/features/settings/AccountTab";
import { MediaProjectsTab } from "@/components/features/settings/MediaProjectsTab";
import { ApiKeysTab } from "@/components/features/settings/ApiKeysTab";

export default function GeneralSettingsPage() {
  const tabs = [
    { id: "account", label: "Account", icon: User, Component: AccountTab },
    {
      id: "media",
      label: "Media Projects",
      icon: Monitor,
      Component: MediaProjectsTab,
    },
    { id: "api-keys", label: "API Keys", icon: Key, Component: ApiKeysTab },
  ];

  return (
    <div className="flex flex-col h-full bg-black text-white">
      <div className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-sm">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-1 bg-orange-500 rounded-full shadow-[0_0_15px_rgba(249,115,22,0.5)]" />
            <h1 className="text-xl font-bold tracking-tight text-white uppercase font-mono">
              General Settings
            </h1>
          </div>
        </div>

        <Tabs defaultValue="account" className="w-full">
          <div className="px-6 py-2">
            <TabsList className="bg-neutral-900/50 p-1 rounded-xl border border-neutral-800/50 shadow-[0_4px_20px_rgba(0,0,0,0.3)] backdrop-blur-sm w-fit justify-start h-auto gap-1">
              {tabs.map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="data-[state=active]:bg-neutral-800 data-[state=active]:text-orange-500 data-[state=active]:shadow-[0_2px_8px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.05)] data-[state=active]:border-neutral-700/50 rounded-lg bg-transparent px-6 py-2 h-full text-neutral-400 hover:text-white transition-all gap-2 border border-transparent font-medium"
                >
                  <tab.icon className="w-4 h-4" />
                  <span className="text-sm">{tab.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="flex-1 overflow-auto p-6 max-h-[calc(100vh-140px)]">
            {tabs.map((tab) => (
              <TabsContent
                key={tab.id}
                value={tab.id}
                className="mt-0 outline-none"
              >
                <tab.Component />
              </TabsContent>
            ))}
          </div>
        </Tabs>
      </div>
    </div>
  );
}
