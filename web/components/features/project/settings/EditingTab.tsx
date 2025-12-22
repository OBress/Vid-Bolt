"use client";

import React from "react";
import { useProjectSettings } from "@/hooks/use-project-settings";
import { Scissors } from "lucide-react";

export function EditingTab({ projectId }: { projectId?: string }) {
  const { loading } = useProjectSettings(projectId);

  if (loading) {
    return (
      <div className="h-48 bg-neutral-900/40 border border-neutral-800 rounded-xl animate-pulse" />
    );
  }

  return (
    <div className="p-8 bg-neutral-900/40 border border-neutral-800 rounded-xl flex flex-col items-center justify-center text-center space-y-4 w-full">
      <Scissors className="w-12 h-12 text-neutral-700" />
      <div>
        <h3 className="text-lg font-bold text-white uppercase tracking-tighter">
          Advanced Editing Logic
        </h3>
        <p className="text-sm text-neutral-500 max-w-sm mx-auto">
          Configure how AI cut-scenes, transitions, and overlays are applied to
          your media timeline.
        </p>
      </div>
      <div className="text-[10px] font-mono text-orange-500 bg-orange-500/5 px-3 py-1 rounded border border-orange-500/20">
        FEATURE COMING SOON
      </div>
    </div>
  );
}
