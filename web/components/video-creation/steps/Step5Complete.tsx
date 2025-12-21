"use client";

import { CheckCircle, ExternalLink, Download, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Step5CompleteProps {
  videoId: string;
  projectId: string;
  onOpenEditor: () => void;
  onClose: () => void;
}

export function Step5Complete({
  videoId,
  projectId,
  onOpenEditor,
  onClose,
}: Step5CompleteProps) {
  return (
    <div className="flex flex-col items-center gap-6 text-center py-4">
      {/* Success animation */}
      <div className="relative">
        <div className="absolute -inset-6 bg-green-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-lg shadow-green-500/30">
          <CheckCircle className="w-10 h-10 text-white" />
        </div>
      </div>

      {/* Header */}
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/20 rounded-full text-green-500 text-xs font-mono uppercase tracking-widest">
          <Sparkles className="w-3 h-3" />
          Complete
        </div>
        <h2 className="text-2xl font-bold tracking-tight">
          Video Created Successfully!
        </h2>
        <p className="text-neutral-500 text-sm max-w-md">
          Your video has been assembled and is ready for final editing. Open the
          editor to make adjustments or export directly.
        </p>
      </div>

      {/* Video preview placeholder */}
      <div className="w-full max-w-lg aspect-video bg-neutral-900/50 border border-neutral-800 rounded-xl flex items-center justify-center relative overflow-hidden">
        {/* Decorative video frames */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-24 h-24 border-4 border-orange-500/30 rounded-lg animate-pulse" />
          </div>
          <div className="absolute top-3 left-3 w-12 h-12 bg-orange-500/10 rounded" />
          <div className="absolute bottom-3 right-3 w-16 h-8 bg-orange-500/10 rounded" />
        </div>

        <div className="text-center z-10">
          <p className="text-sm text-neutral-500 font-mono">VIDEO PREVIEW</p>
          <p className="text-xs text-neutral-600 mt-1">ID: {videoId}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center justify-center gap-8">
        {[
          { label: "Duration", value: "2:45" },
          { label: "Scenes", value: "7" },
          { label: "Project", value: projectId.slice(0, 12) + "..." },
        ].map((stat) => (
          <div key={stat.label} className="text-center">
            <p className="text-lg font-bold text-white">{stat.value}</p>
            <p className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider">
              {stat.label}
            </p>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4 w-full">
        <Button
          onClick={onClose}
          variant="outline"
          className="flex-1 h-12 border-neutral-700 text-neutral-400 hover:text-white hover:bg-neutral-800 gap-2"
        >
          <Download className="w-4 h-4" />
          Export Later
        </Button>
        <Button
          onClick={onOpenEditor}
          className="flex-[2] h-12 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-bold uppercase tracking-widest gap-2"
        >
          <ExternalLink className="w-4 h-4" />
          Open in Editor
        </Button>
      </div>
    </div>
  );
}
