"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { Loader2, CheckCircle2 } from "lucide-react";
import { useGCPVM } from "@/providers/GCPVMProvider";
import { useVramMode } from "@/hooks/use-vram-mode";
import type {
  AudioChunk,
  ShotEvent,
  GeneratedMedia,
} from "@/types/video";
import type { EditDecisionList } from "@/lib/services/edit-assembly/edit-assembly-prompts";
import type { WizardData } from "@/features/video-editor-v2/hooks/use-wizard-data-import";
import { useVideoEditorStore } from "@/features/video-editor-v2/stores/video-editor-store";

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


interface EditorStepProps {
  videoId: string;
  projectId: string;
  audioUrl?: string | null;
  audioChunks?: AudioChunk[];
  shotList?: ShotEvent[];
  generatedMedia?: GeneratedMedia[];
  edl?: EditDecisionList | null;
  agentEdl?: any | null;
  onContinue?: () => void;
  onBack?: () => void;
  isLocked?: boolean;
  lockedMessage?: string;
  /** Set to true when resuming a previously-visited step 7 (stage was already 'video').
   *  Skips the import animation and loads from persisted editor state instead. */
  isResuming?: boolean;
}

// ============================================================
// LOADING SCREEN (matches AsyncLoadingStep visual style)
// ============================================================

const IMPORT_STEPS = [
  "Initializing editor",
  "Placing audio clips",
  "Placing visual clips",
  "Applying transitions & effects",
  "Finalizing timeline",
];

function TimelineImportLoadingScreen({ progress, currentStep }: {
  progress: number;
  currentStep: number;
}) {
  const hasCompleted = progress >= 100;

  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 text-center">
      {/* Animated icon */}
      <div className="relative">
        <div
          className={`absolute -inset-8 rounded-full blur-3xl animate-pulse ${
            hasCompleted ? "bg-green-500/20" : "bg-orange-500/20"
          }`}
        />
        <div
          className={`relative w-20 h-20 rounded-2xl flex items-center justify-center shadow-lg ${
            hasCompleted
              ? "bg-gradient-to-br from-green-500 to-green-600 shadow-green-500/30"
              : "bg-gradient-to-br from-orange-500 to-orange-600 shadow-orange-500/30"
          }`}
        >
          {hasCompleted ? (
            <CheckCircle2 className="w-10 h-10 text-white" />
          ) : (
            <Loader2 className="w-10 h-10 text-white animate-spin" />
          )}
        </div>
      </div>

      {/* Title */}
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">
          {hasCompleted ? "Timeline Ready" : "Building Timeline"}
        </h2>
        <p className="text-neutral-500 text-sm">
          {hasCompleted
            ? "Opening editor..."
            : "Placing media and applying edits to your timeline..."}
        </p>
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-md">
        <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ease-linear ${
              hasCompleted
                ? "bg-gradient-to-r from-green-500 to-green-400"
                : "bg-gradient-to-r from-orange-500 to-orange-400"
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-[10px] font-mono text-neutral-500">
          <span>{hasCompleted ? "Complete" : "Processing..."}</span>
          <span>{Math.round(progress)}%</span>
        </div>
      </div>

      {/* Step checklist */}
      <div className="w-full max-w-md bg-neutral-900/50 border border-neutral-800 rounded-lg p-4">
        <div className="space-y-3">
          {IMPORT_STEPS.map((step, index) => {
            const isCompleted = index < currentStep;
            const isCurrent = index === currentStep && !hasCompleted;

            return (
              <div
                key={index}
                className={`
                  flex items-center gap-3 text-sm transition-all duration-300
                  ${
                    isCompleted
                      ? "text-green-500"
                      : isCurrent
                        ? "text-orange-500"
                        : "text-neutral-600"
                  }
                `}
              >
                <div
                  className={`
                    w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0
                    transition-all duration-300
                    ${
                      isCompleted
                        ? "bg-green-500/20 border border-green-500"
                        : isCurrent
                          ? "bg-orange-500/20 border border-orange-500"
                          : "bg-neutral-800 border border-neutral-700"
                    }
                  `}
                >
                  {isCompleted ? (
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : isCurrent ? (
                    <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                  ) : (
                    <div className="w-2 h-2 bg-neutral-600 rounded-full" />
                  )}
                </div>
                <span className={isCurrent ? "font-medium" : ""}>{step}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// STEP 7 EDITOR
// ============================================================

export function EditorStep({
  videoId,
  projectId,
  audioUrl,
  audioChunks,
  shotList,
  generatedMedia,
  edl,
  agentEdl,
  onContinue,
  onBack,
  isLocked,
  lockedMessage,
  isResuming = false,
}: EditorStepProps) {
  // When resuming, skip animation entirely (synchronous — no API call, no flash)
  const [isImporting, setIsImporting] = useState(!isResuming);
  const [importProgress, setImportProgress] = useState(0);
  const [importStep, setImportStep] = useState(0);
  const hasStartedImportRef = useRef(false);
  // If resuming, load from Supabase persisted state instead of re-importing wizard data
  const hasSavedState = isResuming;

  console.log(`[EditorStep] Mount: isResuming=${isResuming}, isImporting=${!isResuming}`);

  // Memoize wizard data to prevent reference changes between renders
  const wizardData: WizardData = useMemo(() => ({
    audioChunks,
    audioUrl,
    shotList,
    generatedMedia,
    edl,
    agentEdl,
  }), [audioChunks, audioUrl, shotList, generatedMedia, edl, agentEdl]);

  // Monitor store clip count to know when import is truly done
  const clipCount = useVideoEditorStore((s) => Object.keys(s.clips).length);

  // Simulate progress animation, then check if clips exist before showing editor
  useEffect(() => {
    if (hasStartedImportRef.current || isImporting !== true) return;
    hasStartedImportRef.current = true;

    const totalDuration = 2000; // 2 seconds total animation
    const stepDuration = totalDuration / IMPORT_STEPS.length;

    // Animate through steps
    for (let i = 0; i < IMPORT_STEPS.length; i++) {
      setTimeout(() => {
        setImportStep(i);
        setImportProgress(Math.min(((i + 1) / IMPORT_STEPS.length) * 100, 95));
      }, stepDuration * i);
    }

    // Final: complete after full animation
    setTimeout(() => {
      setImportProgress(100);
      // Small delay to show the "complete" state
      setTimeout(() => {
        setIsImporting(false);
      }, 500);
    }, totalDuration);
  }, [isImporting]);

  // If clips appear in the store before the animation finishes, fast-forward
  useEffect(() => {
    if (clipCount > 0 && importProgress < 90) {
      setImportProgress(95);
      setImportStep(IMPORT_STEPS.length - 1);
    }
  }, [clipCount, importProgress]);

  // ── Auto-switch VRAM mode to "all" when editor opens ──
  const { displayStatus, apiReady } = useGCPVM();
  const { currentMode, switchToAll, isLoading: vramLoading } = useVramMode(apiReady);
  const hasAutoSwitchedRef = useRef(false);

  useEffect(() => {
    if (
      !hasAutoSwitchedRef.current &&
      !vramLoading &&
      displayStatus === "ON" &&
      currentMode !== null &&
      currentMode !== "all"
    ) {
      hasAutoSwitchedRef.current = true;
      console.log(`[EditorStep] Auto-switching VRAM mode from '${currentMode}' to 'all'`);
      switchToAll().catch(() => {
        console.warn('[EditorStep] Auto-switch to "all" failed — user can switch manually via header banner');
      });
    }
  }, [displayStatus, currentMode, vramLoading, switchToAll]);

  console.log("[EditorStep] Props received:", {
    videoId,
    projectId,
    audioUrl: audioUrl ? "present" : "null",
    audioChunks: audioChunks?.length || 0,
    shotList: shotList?.length || 0,
    generatedMedia: generatedMedia?.length || 0,
    edlType: agentEdl ? 'agentEdl' : edl ? 'legacyEdl' : 'none',
    isImporting,
    hasSavedState,
    clipCount,
  });

  // Detailed media debug: show what data Step 7 is receiving from upstream steps
  if (generatedMedia && generatedMedia.length > 0 && clipCount === 0) {
    console.log("[EditorStep] 📊 GeneratedMedia breakdown:");
    for (const media of generatedMedia) {
      const urlType = !media.media_url ? '❌ NO_URL'
        : media.media_url.startsWith('remotion://') ? '🎬 remotion://'
        : media.media_url.startsWith('data:') ? '📦 data-uri'
        : '✅ real URL';
      console.log(
        `  Shot ${media.shot_index}: ${urlType} | status=${media.generation_status} | type=${media.media_type}` +
        `${media.remotion_code ? ' | has remotion_code' : ''}` +
        `${media.media_url && !media.media_url.startsWith('remotion://') ? ` | url=${media.media_url.substring(0, 60)}...` : ''}`
      );
    }
  }

  // Show loading screen during import
  if (isImporting) {
    return (
      <div className="dark flex flex-col h-full w-full bg-background">
        <TimelineImportLoadingScreen
          progress={importProgress}
          currentStep={importStep}
        />
      </div>
    );
  }

  return (
    <div
      className={`dark flex flex-col h-full w-full bg-background overflow-hidden ${isLocked ? "pointer-events-none" : ""}`}
    >
      {/* Editor — wizard data is imported INSIDE the editor provider after store.initialize() */}
      <div className="flex-1 overflow-hidden bg-background">
        <ReactVideoEditor
          projectId={videoId}
          skipInitialLoad={!isResuming}
          wizardData={wizardData}
          projectTitle="Video Editor"
          fps={30}
          videoWidth={1920}
          videoHeight={1080}
        />
      </div>
    </div>
  );
}
