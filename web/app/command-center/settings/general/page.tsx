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
          <div className="px-6">
            <TabsList className="bg-transparent border-b border-white/5 w-full justify-start h-12 p-0 gap-8 rounded-none">
              {tabs.map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="data-[state=active]:bg-transparent data-[state=active]:text-orange-500 data-[state=active]:border-b-2 data-[state=active]:border-orange-500 rounded-none bg-transparent px-0 h-full text-neutral-400 hover:text-white transition-all gap-2"
                >
                  <tab.icon className="w-4 h-4" />
                  <span className="text-sm font-medium">{tab.label}</span>
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
