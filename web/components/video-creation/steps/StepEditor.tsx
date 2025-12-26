"use client";

import { ArrowRight, Clapperboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import Editor from "@/features/editor";
import type { AudioChunk } from "@/components/video-creation/VideoCreationWizard";

interface StepEditorProps {
  videoId: string;
  projectId: string;
  audioUrl?: string | null;
  audioChunks?: AudioChunk[];
  onContinue: () => void;
  onBack: () => void;
  isLocked?: boolean;
  lockedMessage?: string;
}

export function StepEditor({
  videoId,
  projectId,
  audioUrl,
  audioChunks,
  onContinue,
  isLocked,
  lockedMessage,
}: StepEditorProps) {
  // Debug logging
  console.log("[StepEditor Debug] Props received:", {
    videoId,
    projectId,
    audioUrl,
    audioChunksCount: audioChunks?.length || 0,
    audioChunks,
  });

  return (
    <div
      className={`dark flex flex-col h-full w-full bg-background ${
        isLocked ? "pointer-events-none" : ""
      }`}
    >
      {/* Compact header bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-neutral-900/80 border-b border-neutral-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-orange-500/10 border border-orange-500/20 rounded text-orange-500 text-[10px] font-mono uppercase tracking-widest">
            <Clapperboard className="w-3 h-3" />
            Editor
          </div>
          <span className="text-sm text-neutral-400">
            {isLocked ? "Editor Locked" : "Edit your video"}
          </span>
        </div>

        {isLocked ? (
          <div className="px-4 h-8 flex items-center bg-neutral-800 border border-neutral-700 rounded text-neutral-500 font-mono text-[10px] uppercase tracking-widest pointer-events-auto">
            {lockedMessage}
          </div>
        ) : (
          <Button
            onClick={onContinue}
            size="sm"
            className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white text-xs font-bold uppercase tracking-widest gap-1.5 h-8"
          >
            Continue to Export
            <ArrowRight className="w-3 h-3" />
          </Button>
        )}
      </div>

      {/* Full-bleed Editor with dark theme wrapper */}
      <div className="flex-1 overflow-hidden bg-background">
        <Editor
          tempId={videoId}
          id={projectId}
          audioUrl={audioUrl}
          audioChunks={audioChunks}
        />
      </div>
    </div>
  );
}
