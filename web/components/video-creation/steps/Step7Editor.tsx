"use client";

import { Clapperboard } from "lucide-react";
import Editor from "@/features/editor";
import type {
  AudioChunk,
  ShotEvent,
} from "@/components/video-creation/VideoCreationWizard";
import type { GeneratedMedia } from "@/types/video";

interface Step7EditorProps {
  videoId: string;
  projectId: string;
  audioUrl?: string | null;
  audioChunks?: AudioChunk[];
  shotList?: ShotEvent[];
  generatedMedia?: GeneratedMedia[];
  onContinue: () => void;
  onBack: () => void;
  isLocked?: boolean;
  lockedMessage?: string;
}

export function Step7Editor({
  videoId,
  projectId,
  audioUrl,
  audioChunks,
  shotList,
  generatedMedia,
  onContinue: _onContinue,
  isLocked,
  lockedMessage: _lockedMessage,
}: Step7EditorProps) {
  // Debug logging
  console.log("[Step7Editor Debug] Props received:", {
    videoId,
    projectId,
    audioUrl,
    audioChunksCount: audioChunks?.length || 0,
    shotListCount: shotList?.length || 0,
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
      </div>

      {/* Full-bleed Editor with dark theme wrapper */}
      <div className="flex-1 overflow-hidden bg-background">
        <Editor
          tempId={videoId}
          id={projectId}
          audioUrl={audioUrl}
          audioChunks={audioChunks}
          shotList={shotList}
          generatedMedia={generatedMedia}
        />
      </div>
    </div>
  );
}
