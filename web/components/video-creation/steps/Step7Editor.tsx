"use client";

import dynamic from "next/dynamic";
import type {
  AudioChunk,
  ShotEvent,
} from "@/components/video-creation/VideoCreationWizard";
import type { GeneratedMedia } from "@/types/video";
import { useWizardDataImport } from "@/features/video-editor-v2/hooks/use-wizard-data-import";
import type { EditDecisionList } from "@/lib/services/edit-assembly/edit-assembly-prompts";
import { HttpRenderer } from "@/features/video-editor-v2/utils/http-renderer";

const ReactVideoEditor = dynamic(
  () =>
    import("@/features/video-editor-v2/components/react-video-editor-v2").then(
      (mod) => mod.ReactVideoEditorV2,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-background">
        <div className="text-neutral-400">Loading Editor...</div>
      </div>
    ),
  },
);

// Shared renderer instance for wizard editor sessions
const httpRenderer = new HttpRenderer("/api/render", {
  type: "ssr",
  entryPoint: "/api/render",
});

interface Step7EditorProps {
  videoId: string;
  projectId: string;
  audioUrl?: string | null;
  audioChunks?: AudioChunk[];
  shotList?: ShotEvent[];
  generatedMedia?: GeneratedMedia[];
  edl?: EditDecisionList | null;
  onContinue?: () => void;
  onBack?: () => void;
  isLocked?: boolean;
  lockedMessage?: string;
}

/**
 * Invisible component that populates the V2 editor store
 * with wizard data (audioChunks, shotList, generatedMedia).
 * Uses the global Zustand store so it works as a sibling to the editor.
 */
function WizardDataBridge({
  audioChunks,
  audioUrl,
  shotList,
  generatedMedia,
  edl,
}: Pick<Step7EditorProps, "audioChunks" | "audioUrl" | "shotList" | "generatedMedia" | "edl">) {
  useWizardDataImport({ audioChunks, audioUrl, shotList, generatedMedia, edl });
  return null;
}

export function Step7Editor({
  videoId,
  projectId,
  audioUrl,
  audioChunks,
  shotList,
  generatedMedia,
  edl,
  onContinue,
  onBack,
  isLocked,
  lockedMessage,
}: Step7EditorProps) {
  console.log("[Step7Editor] Props received:", {
    videoId,
    projectId,
    audioUrl: audioUrl ? "present" : "null",
    audioChunks: audioChunks?.length || 0,
    shotList: shotList?.length || 0,
    generatedMedia: generatedMedia?.length || 0,
  });

  return (
    <div
      className={`dark flex flex-col h-full w-full bg-background ${isLocked ? "pointer-events-none" : ""}`}
    >
      {/* Header with navigation */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-neutral-800">
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              onClick={onBack}
              className="text-sm text-neutral-400 hover:text-white transition-colors"
            >
              ← Back
            </button>
          )}
          <span className="text-sm text-neutral-500">Step 7: Video Editor</span>
        </div>
        <div className="flex items-center gap-2">
          {isLocked && lockedMessage && (
            <span className="text-xs text-neutral-500 font-mono uppercase tracking-widest">
              {lockedMessage}
            </span>
          )}
          {onContinue && (
            <button
              onClick={onContinue}
              disabled={isLocked}
              className="px-4 py-1.5 text-sm font-medium bg-orange-500 hover:bg-orange-400 text-white rounded-md transition-colors disabled:opacity-50"
            >
              Continue to Export →
            </button>
          )}
        </div>
      </div>

      {/* Wizard data bridge — populates the V2 store with wizard data */}
      <WizardDataBridge
        audioChunks={audioChunks}
        audioUrl={audioUrl}
        shotList={shotList}
        generatedMedia={generatedMedia}
        edl={edl}
      />

      {/* Editor */}
      <div className="flex-1 overflow-hidden bg-background">
        <ReactVideoEditor
          projectId={projectId}
          renderer={httpRenderer}
          projectTitle="Video Editor"
          fps={30}
          videoWidth={1920}
          videoHeight={1080}
        />
      </div>
    </div>
  );
}
