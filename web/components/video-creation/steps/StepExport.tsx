"use client";

import { Download, Youtube, Music2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// Custom icons for platforms that don't have lucide icons
const TikTokIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
  </svg>
);

const XIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

interface StepExportProps {
  videoId: string;
  projectId: string;
  onBack: () => void;
  onClose: () => void;
  isLocked?: boolean;
  lockedMessage?: string;
}

export function StepExport({
  videoId,
  projectId,
  onBack,
  onClose,
  isLocked,
  lockedMessage,
}: StepExportProps) {
  const exportOptions = [
    {
      id: "mp4",
      label: "Download MP4",
      description: "High quality video file",
      icon: Download,
      color: "from-blue-500 to-blue-600",
      hoverColor: "hover:from-blue-400 hover:to-blue-500",
    },
    {
      id: "youtube",
      label: "Upload to YouTube",
      description: "Publish directly to your channel",
      icon: Youtube,
      color: "from-red-500 to-red-600",
      hoverColor: "hover:from-red-400 hover:to-red-500",
    },
    {
      id: "tiktok",
      label: "Upload to TikTok",
      description: "Share on TikTok",
      icon: TikTokIcon,
      color: "from-pink-500 to-purple-600",
      hoverColor: "hover:from-pink-400 hover:to-purple-500",
    },
    {
      id: "x",
      label: "Post to X",
      description: "Share on X (Twitter)",
      icon: XIcon,
      color: "from-neutral-600 to-neutral-800",
      hoverColor: "hover:from-neutral-500 hover:to-neutral-700",
    },
    {
      id: "spotify",
      label: "Upload to Spotify",
      description: "Publish as podcast audio",
      icon: Music2,
      color: "from-green-500 to-green-600",
      hoverColor: "hover:from-green-400 hover:to-green-500",
    },
  ];

  const handleExport = (platformId: string) => {
    if (isLocked) return;
    console.log(`Exporting to ${platformId}`, { videoId, projectId });
    // TODO: Implement actual export logic
  };

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      {/* Header */}
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-orange-500/10 border border-orange-500/20 rounded-full text-orange-500 text-xs font-mono uppercase tracking-widest">
          <Share2 className="w-3 h-3" />
          Export
        </div>
        <h2 className="text-2xl font-bold tracking-tight">Export Your Video</h2>
        <p className="text-neutral-500 text-sm max-w-md">
          Download your video or share it directly to your favorite platforms.
        </p>
      </div>

      {/* Export options grid */}
      <div
        className={`w-full grid grid-cols-1 sm:grid-cols-2 gap-3 ${
          isLocked ? "opacity-50" : ""
        }`}
      >
        {exportOptions.map((option) => {
          const Icon = option.icon;
          return (
            <button
              key={option.id}
              onClick={() => handleExport(option.id)}
              disabled={isLocked}
              className={`group flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r ${
                option.color
              } ${
                option.hoverColor
              } text-white transition-all duration-300 hover:scale-[1.02] hover:shadow-lg ${
                isLocked ? "cursor-not-allowed" : ""
              }`}
            >
              <div className="p-2 bg-white/20 rounded-lg">
                <Icon />
              </div>
              <div className="text-left">
                <p className="font-semibold">{option.label}</p>
                <p className="text-xs opacity-80">{option.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4 w-full pt-4">
        {isLocked ? (
          <div className="w-full h-12 flex items-center justify-center bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-500 font-mono text-xs uppercase tracking-widest">
            {lockedMessage}
          </div>
        ) : (
          <>
            <Button
              onClick={onBack}
              variant="outline"
              className="flex-1 h-12 border-neutral-700 text-neutral-400 hover:text-white hover:bg-neutral-800"
            >
              Back to Editor
            </Button>
            <Button
              onClick={onClose}
              className="flex-1 h-12 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-bold uppercase tracking-widest"
            >
              Done
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
