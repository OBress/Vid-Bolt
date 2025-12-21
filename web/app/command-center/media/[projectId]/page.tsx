"use client";

import { use, useState, useRef, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Video, BarChart2, Settings, Hash, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VideoCreationWizard } from "@/components/video-creation/VideoCreationWizard";
import { useSidebar } from "@/components/layout/SidebarContext";
import { VideoCard } from "@/components/features/project/VideoCard";
import { AnalyticsTab } from "@/components/features/project/AnalyticsTab";
import { SettingsTab } from "@/components/features/project/SettingsTab";
import { RandomTab } from "@/components/features/project/RandomTab";

interface AnimationOrigin {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface WizardState {
  isOpen: boolean;
  isAnimating: boolean;
  isClosing: boolean;
  origin: AnimationOrigin | null;
  targetVideoIndex: number | null;
}

export default function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const [showFinished, setShowFinished] = useState(false);
  const { collapse } = useSidebar();

  const [wizardState, setWizardState] = useState<WizardState>({
    isOpen: false,
    isAnimating: false,
    isClosing: false,
    origin: null,
    targetVideoIndex: null,
  });

  const newVideoButtonRef = useRef<HTMLButtonElement>(null);
  const videoCardRefs = useRef<(HTMLDivElement | null)[]>([]);

  const getElementOrigin = (element: HTMLElement): AnimationOrigin => {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      width: rect.width,
      height: rect.height,
    };
  };

  const handleNewVideo = useCallback(() => {
    if (!newVideoButtonRef.current) return;
    const origin = getElementOrigin(newVideoButtonRef.current);
    collapse();
    setWizardState({
      isOpen: true,
      isAnimating: true,
      isClosing: false,
      origin,
      targetVideoIndex: null,
    });
    setTimeout(() => {
      setWizardState((prev) => ({ ...prev, isAnimating: false }));
    }, 400);
  }, [collapse]);

  const handleVideoClick = useCallback(
    (index: number) => {
      const videoCard = videoCardRefs.current[index];
      if (!videoCard) return;
      const origin = getElementOrigin(videoCard);
      collapse();
      setWizardState({
        isOpen: true,
        isAnimating: true,
        isClosing: false,
        origin,
        targetVideoIndex: index,
      });
      setTimeout(() => {
        setWizardState((prev) => ({ ...prev, isAnimating: false }));
      }, 400);
    },
    [collapse]
  );

  const handleWizardBack = useCallback(() => {
    let targetOrigin: AnimationOrigin | null = null;
    if (wizardState.targetVideoIndex !== null) {
      const videoCard = videoCardRefs.current[wizardState.targetVideoIndex];
      if (videoCard) targetOrigin = getElementOrigin(videoCard);
    } else if (newVideoButtonRef.current) {
      targetOrigin = getElementOrigin(newVideoButtonRef.current);
    }

    setWizardState((prev) => ({
      ...prev,
      isClosing: true,
      isAnimating: true,
      origin: targetOrigin,
    }));
    setTimeout(() => {
      setWizardState({
        isOpen: false,
        isAnimating: false,
        isClosing: false,
        origin: null,
        targetVideoIndex: null,
      });
    }, 350);
  }, [wizardState.targetVideoIndex]);

  const handleWizardComplete = useCallback((videoId: string) => {
    console.log("Video created:", videoId);
    setWizardState({
      isOpen: false,
      isAnimating: false,
      isClosing: false,
      origin: null,
      targetVideoIndex: null,
    });
  }, []);

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

  const getTransformStyle = () => {
    if (!wizardState.origin) return {};
    const { x, y } = wizardState.origin;
    if (wizardState.isClosing) {
      return {
        transformOrigin: `${x}px ${y}px`,
        transform: "scale(0)",
        opacity: 0,
      };
    } else if (wizardState.isAnimating) {
      return { transformOrigin: `${x}px ${y}px` };
    }
    return {};
  };

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div
        className={`flex flex-col h-full bg-black text-white transition-all duration-300 ${
          wizardState.isOpen && !wizardState.isClosing
            ? "opacity-0 pointer-events-none"
            : "opacity-100"
        }`}
      >
        <div className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-sm">
          <div className="px-6 py-4 flex items-center justify-between">
            <h2 className="text-xl font-bold tracking-tight text-orange-500 uppercase">
              {projectTitle}
            </h2>
            <Button
              ref={newVideoButtonRef}
              variant="outline"
              size="sm"
              className="bg-orange-500 border-none text-white hover:bg-orange-600 transition-colors gap-2"
              onClick={handleNewVideo}
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
              <TabsContent
                value="videos"
                className="mt-0 outline-none space-y-6"
              >
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
                  {[1, 2, 3, 4].map((i, index) => (
                    <VideoCard
                      key={i}
                      index={index}
                      ref={(el) => {
                        videoCardRefs.current[index] = el;
                      }}
                      onClick={() => handleVideoClick(index)}
                    />
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="analytics" className="mt-0 outline-none">
                <AnalyticsTab />
              </TabsContent>

              <TabsContent value="settings" className="mt-0 outline-none">
                <SettingsTab />
              </TabsContent>

              <TabsContent value="random" className="mt-0 outline-none">
                <RandomTab />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>

      {wizardState.isOpen && (
        <div
          className={`absolute inset-0 bg-black z-10 transition-all duration-300 ease-out ${
            wizardState.isAnimating && !wizardState.isClosing
              ? "animate-expand-in"
              : wizardState.isClosing
              ? "animate-collapse-out"
              : ""
          }`}
          style={getTransformStyle()}
        >
          <VideoCreationWizard
            projectId={projectId}
            onComplete={handleWizardComplete}
            onBack={handleWizardBack}
          />
        </div>
      )}

      <style jsx>{`
        @keyframes expand-in {
          0% {
            transform: scale(0);
            opacity: 0;
            border-radius: 50%;
          }
          100% {
            transform: scale(1);
            opacity: 1;
            border-radius: 0;
          }
        }
        @keyframes collapse-out {
          0% {
            transform: scale(1);
            opacity: 1;
            border-radius: 0;
          }
          100% {
            transform: scale(0);
            opacity: 0;
            border-radius: 50%;
          }
        }
        .animate-expand-in {
          animation: expand-in 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        .animate-collapse-out {
          animation: collapse-out 0.3s cubic-bezier(0.55, 0.085, 0.68, 0.53)
            forwards;
        }
      `}</style>
    </div>
  );
}
