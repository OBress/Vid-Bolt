"use client";

import { use, useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Settings,
  Video,
  BarChart2,
  Hash,
  Play,
  Clock,
  MoreVertical,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { VideoCreationOverlay } from "@/components/VideoCreationOverlay";

export default function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const [showFinished, setShowFinished] = useState(false);
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);

  // Handle ESC key to close overlay
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOverlayOpen) {
        setIsOverlayOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOverlayOpen]);

  const tabs = [
    { id: "videos", label: "Videos", icon: Video },
    { id: "analytics", label: "Analytics", icon: BarChart2 },
    { id: "settings", label: "Settings", icon: Settings },
    { id: "random", label: "Random", icon: Hash },
  ];

  const projectTitle = projectId
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  return (
    <div className="flex flex-col h-full bg-black text-white overflow-hidden">
      {/* Video Creation Overlay */}
      <VideoCreationOverlay
        isOpen={isOverlayOpen}
        onClose={() => setIsOverlayOpen(false)}
      />

      <div className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-sm">
        <div className="px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tight text-orange-500 uppercase">
            {projectTitle}
          </h2>
          <Button
            variant="outline"
            size="sm"
            className="bg-orange-500 border-none text-white hover:bg-orange-600 transition-colors gap-2"
            onClick={() => setIsOverlayOpen(true)}
          >
            <Plus className="w-4 h-4" />
            NEW VIDEO
          </Button>
        </div>

        <Tabs defaultValue="videos" className="w-full">
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
            {/* Videos Tab Content */}
            <TabsContent value="videos" className="mt-0 outline-none space-y-6">
              <div className="flex items-center justify-between bg-neutral-900/40 p-4 rounded-lg border border-neutral-800">
                <div className="space-y-1">
                  <h3 className="text-sm font-medium">Video Assets</h3>
                  <p className="text-xs text-neutral-500">
                    Manage and preview your video project files.
                  </p>
                </div>
                <div className="flex bg-black/40 p-1 rounded-full border border-neutral-800 relative w-60">
                  <button
                    onClick={() => setShowFinished(false)}
                    className={`flex-1 px-4 py-1.5 rounded-full text-[10px] font-bold tracking-widest uppercase transition-all duration-300 relative z-10 ${
                      !showFinished
                        ? "text-white"
                        : "text-neutral-500 hover:text-neutral-300"
                    }`}
                  >
                    Unfinished
                  </button>
                  <button
                    onClick={() => setShowFinished(true)}
                    className={`flex-1 px-4 py-1.5 rounded-full text-[10px] font-bold tracking-widest uppercase transition-all duration-300 relative z-10 ${
                      showFinished
                        ? "text-white"
                        : "text-neutral-500 hover:text-neutral-300"
                    }`}
                  >
                    Finished
                  </button>
                  <div
                    className={`absolute inset-y-1 w-[calc(50%-4px)] bg-orange-500 rounded-full transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${
                      showFinished ? "translate-x-full" : "translate-x-0"
                    }`}
                    style={{ left: "4px" }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="group relative bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden hover:border-orange-500/50 transition-all duration-300"
                  >
                    <div className="aspect-video bg-neutral-800 relative flex items-center justify-center">
                      <Play className="w-8 h-8 text-neutral-700 group-hover:text-orange-500/50 transition-colors" />
                      <div className="absolute bottom-2 right-2 bg-black/80 px-1.5 py-0.5 rounded text-[10px] font-mono text-neutral-400">
                        02:45
                      </div>
                    </div>
                    <div className="p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium truncate">
                          sequence_v{i}_draft.mp4
                        </span>
                        <MoreVertical className="w-3.5 h-3.5 text-neutral-600" />
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-neutral-500">
                        <Clock className="w-3 h-3" />
                        <span>Modified 2h ago</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* Analytics Tab Content */}
            <TabsContent
              value="analytics"
              className="mt-0 outline-none space-y-6"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { label: "Total Views", value: "12.4K", change: "+14.2%" },
                  { label: "Avg. Duration", value: "01:24", change: "-2.1%" },
                  { label: "Retention Rate", value: "68%", change: "+5.7%" },
                ].map((stat, i) => (
                  <div
                    key={i}
                    className="bg-neutral-900/60 border border-neutral-800 p-4 rounded-lg"
                  >
                    <p className="text-xs text-neutral-500 uppercase tracking-widest font-bold mb-1">
                      {stat.label}
                    </p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold">{stat.value}</span>
                      <span
                        className={`text-[10px] ${
                          stat.change.startsWith("+")
                            ? "text-green-500"
                            : "text-red-500"
                        }`}
                      >
                        {stat.change}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="h-64 bg-neutral-900/60 border border-neutral-800 rounded-lg flex items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 opacity-10 flex items-end">
                  {[...Array(20)].map((_, i) => (
                    <div
                      key={i}
                      className="flex-1 bg-orange-500"
                      style={{ height: `${Math.random() * 80 + 20}%` }}
                    ></div>
                  ))}
                </div>
                <p className="text-sm text-neutral-500 font-mono tracking-tighter text-center px-4">
                  DATA VISUALIZATION STREAMING...
                </p>
              </div>
            </TabsContent>

            {/* Settings Tab Content */}
            <TabsContent value="settings" className="mt-0 outline-none">
              <div className="max-w-2xl bg-neutral-900/40 border border-neutral-800 rounded-lg divide-y divide-neutral-800">
                {[
                  { title: "Project Resolution", value: "3840 x 2160 (4K)" },
                  { title: "Target Frame Rate", value: "60 FPS" },
                  { title: "Auto-Save Interval", value: "5 Minutes" },
                  { title: "Export Format", value: "H.264 / MP4" },
                ].map((setting, i) => (
                  <div
                    key={i}
                    className="p-4 flex items-center justify-between hover:bg-neutral-800/20 transition-colors"
                  >
                    <span className="text-sm text-neutral-300">
                      {setting.title}
                    </span>
                    <span className="text-xs text-orange-500 font-mono cursor-pointer hover:underline">
                      {setting.value}
                    </span>
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* Random Tab Content */}
            <TabsContent value="random" className="mt-0 outline-none">
              <div className="flex flex-col items-center justify-center min-h-[300px] gap-6 text-center">
                <div className="relative group">
                  <div className="absolute -inset-1 bg-gradient-to-r from-orange-600 to-red-600 rounded-full blur opacity-25 group-hover:opacity-75 transition duration-1000 group-hover:duration-200"></div>
                  <div className="relative p-6 bg-black rounded-full border border-neutral-800">
                    <Hash className="w-12 h-12 text-orange-500 animate-pulse" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-bold tracking-widest uppercase">
                    Seed Generator
                  </h3>
                  <p className="text-xs text-neutral-500 max-w-[240px]">
                    Initialize a new randomized project environment based on
                    unique entropy seeds.
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="border-neutral-700 text-neutral-400 hover:text-white hover:bg-neutral-800 uppercase tracking-widest text-[10px] font-bold"
                >
                  Generate New Seed
                </Button>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
