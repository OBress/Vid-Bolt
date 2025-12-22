"use client";

import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Info, Mic2, MonitorPlay, Scissors, Share2 } from "lucide-react";
import { BasicInfoTab } from "./settings/BasicInfoTab";
import { VoiceTab } from "./settings/VoiceTab";
import { VisualsTab } from "./settings/VisualsTab";
import { EditingTab } from "./settings/EditingTab";
import { ExportTab } from "./settings/ExportTab";

export function SettingsTab() {
  const tabs = [
    { id: "basic", label: "Basic Info", icon: Info, Component: BasicInfoTab },
    { id: "voice", label: "Voice", icon: Mic2, Component: VoiceTab },
    {
      id: "visuals",
      label: "Visuals",
      icon: MonitorPlay,
      Component: VisualsTab,
    },
    { id: "editing", label: "Editing", icon: Scissors, Component: EditingTab },
    { id: "export", label: "Export", icon: Share2, Component: ExportTab },
  ];

  return (
    <div className="w-full">
      <Tabs defaultValue="basic" className="w-full">
        <div className="mb-6">
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

        <div className="flex-1">
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
  );
}
