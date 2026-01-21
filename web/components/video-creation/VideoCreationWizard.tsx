"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { WizardProgress } from "./WizardProgress";
import { StepNavigationConfirmDialog } from "./StepNavigationConfirmDialog";
import { useNavigationStore } from "@/store/use-navigation-store";
import { Step4UniversalScript } from "./steps/Step4UniversalScript";
import { Step1Outline } from "./steps/Step1Outline";
import { Step3Script } from "./steps/Step3Script";
import { Step2Audio } from "./steps/Step2Audio";
import { Step2StockMedia } from "./steps/Step2StockMedia";
import { Step5ShotCreation } from "./steps/Step5ShotCreation";
// import { StepMediaGeneration } from "./steps/StepMediaGeneration"; // Removing old Step 3
import { Step6SceneReview } from "./steps/Step6SceneReview";
import { StepEditor } from "./steps/StepEditor";
import { StepExport } from "./steps/StepExport";
import { PlaceholderStep } from "./steps/PlaceholderStep";
import { AsyncLoadingStep } from "./AsyncLoadingStep";
import { useVideos } from "@/hooks/use-videos";
import { Loader2 } from "lucide-react";
import type { VideoStage, VideoProject } from "@/types/video";

export interface AudioChunk {
  chapterNumber: number;
  url: string;
  duration_seconds?: number;
  text?: string;
}

export interface ShotEvent {
  segment_index: number;
  start_seconds: number;
  end_seconds: number;
  duration_seconds: number;
  content_type:
    | "list-item"
    | "comparison"
    | "concept"
    | "transition"
    | "emotional-beat";
  text: string;
  visual_prompt?: string;
  summary?: string;
  media_type?: "image" | "video";
  character_refs?: string[];
  location_refs?: string[];
  object_refs?: string[];
}

// Type for universal script output
interface UniversalScriptOutput {
  researchDossier?: any;
  spine?: any;
  assetRegistry?: any;
  expandedBeats?: Array<{
    beatIndex: number;
    narration: string;
    wordCount: number;
    qualityScore?: number;
  }>;
  finalScript?: string;
  qualityValidation?: any;
}

export interface WizardState {
  prompt: string;
  expandedIdea: string;
  script: string;
  audioUrl: string | null;
  audioChunks: AudioChunk[];
  shotList: ShotEvent[];
  avScript: { timestamp: string; visual: string; audio: string }[];
  videoId: string | null;
  expandTaskId: string | null;
  writeTaskId: string | null;
  audioTaskId: string | null;
  // Outline output (Step 1)
  outlineOutput: any | null;
  outlineConfig: any | null;
  outlineTaskId: string | null;
  // Universal script output (Step 3)
  scriptConfig: any; // Store script generation configuration
  universalScriptOutput: UniversalScriptOutput | null;
  scriptOutput: any | null; // Output from script-writing worker
  // AV Script Part 1 (Step 4→5 transition)
  avScriptTaskId: string | null;
  avScriptPart1Output: any | null;
  generationError?: string | null;
}

// Step configuration for the wizard - 8 steps
const STEPS = [
  { id: 1, label: "Outline", type: "outline" }, // New Placeholder
  { id: 2, label: "Stock Media", type: "stock" }, // New Placeholder
  { id: 3, label: "Script", type: "script" }, // Old Step 1
  { id: 4, label: "Audio", type: "audio" }, // Old Step 2
  { id: 5, label: "Shot Creation", type: "generations" }, // Moved from Step 6
  { id: 6, label: "Scene Review", type: "refs" }, // Moved from Step 7
  { id: 7, label: "Editor", type: "editor" }, // Restored Editor
  { id: 8, label: "Export", type: "final" }, // Old Step 5
] as const;

// Helper function to map video stage to wizard step number
// Helper function to map video stage to wizard step number
function stageToStepNumber(stage: VideoStage): number {
  const stageMapping: Record<VideoStage, number> = {
    idea: 1, // Legacy -> Step 1
    outline: 1, // Step 1
    stock: 2, // Step 2
    script: 3, // Step 3
    audio: 4, // Step 4
    media: 5, // Legacy -> Step 5
    shot_planning: 5, // Step 5
    shot_creation: 6, // Step 6
    video: 7, // Step 7
    export: 8, // Step 8
    completed: 8, // Step 8
  };
  return stageMapping[stage] || 1;
}

// Helper function to generate a fallback script when workflow fails
function generateFallbackScript(prompt: string): string {
  return `[INTRO - 0:00-0:15]
HOST: "Have you ever wondered about ${prompt}? Today, we're diving deep into this fascinating topic."

[HOOK - 0:15-0:30]
HOST: "By the end of this video, you'll understand exactly how this works and how you can apply it in your own life."

[MAIN CONTENT - 0:30-2:00]
HOST: "Let's start with the basics..."

[Section 1]
"First, we need to understand the fundamental principles..."

[Section 2]
"Now that we have the foundation, let's explore the practical applications..."

[Section 3]
"Here's where things get really interesting..."

[CONCLUSION - 2:00-2:30]
HOST: "So there you have it! Remember, the key takeaways are..."

[CALL TO ACTION - 2:30-2:45]
HOST: "If you found this valuable, don't forget to like and subscribe for more content like this!"`;
}

interface VideoCreationWizardProps {
  onComplete: (videoId: string) => void;
  onBack: () => void;
  projectId: string;
  videoId: string | null;
}

export function VideoCreationWizard({
  onComplete,
  onBack,
  projectId,
  videoId: initialVideoId,
}: VideoCreationWizardProps) {
  const { setCurrentVideoName } = useNavigationStore();
  const { createVideo, updateVideo } = useVideos({
    projectId,
    autoFetch: false,
  });
  const [isSaving, setIsSaving] = useState(false);

  const [currentStep, setCurrentStep] = useState(1);
  const [maxStepReached, setMaxStepReached] = useState(1);
  const [state, setState] = useState<WizardState>({
    prompt: "",
    expandedIdea: "",
    script: "",
    audioUrl: null,
    audioChunks: [],
    shotList: [],
    avScript: [],
    videoId: initialVideoId,
    expandTaskId: null,
    writeTaskId: null,
    audioTaskId: null,
    outlineOutput: null,
    outlineConfig: null,
    outlineTaskId: null,
    scriptConfig: null,
    universalScriptOutput: null,
    scriptOutput: null,
    avScriptTaskId: null,
    avScriptPart1Output: null,
  });

  // Step 3 ref for manual trigger
  const step3Ref = useRef<any>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      setCurrentVideoName(null);
    };
  }, [setCurrentVideoName]);

  // Load existing video data when resuming
  const [isLoadingVideo, setIsLoadingVideo] = useState(false);

  useEffect(() => {
    async function loadVideoData() {
      if (!initialVideoId) return;

      setIsLoadingVideo(true);
      try {
        const response = await fetch(`/api/videos/${initialVideoId}`);
        const data = await response.json();

        if (!response.ok) {
          console.error("Failed to load video:", data.error);
          return;
        }

        const video: VideoProject = data.video;

        // Determine the correct step based on current_stage
        const targetStep = stageToStepNumber(video.current_stage);

        // Get expanded idea from metadata if available
        const expandedIdea = (video.metadata as any)?.expanded_idea || "";

        // Load shot list from metadata if available
        const shotList = (video.metadata as any)?.shot_list || [];

        // Update state with loaded video data
        const scriptConfig = (video.metadata as any)?.scriptConfig || null;
        const universalScriptOutput =
          (video.metadata as any)?.universalScriptOutput || null;

        // Normalize audio chunks from API
        const rawAudioChunks = data.audioChunks || [];
        console.log(
          "[Wizard DEBUG] rawAudioChunks from API:",
          JSON.stringify(rawAudioChunks, null, 2),
        );

        const normalizedAudioChunks = rawAudioChunks.map((c: any) => ({
          ...c,
          chapterNumber: c.chapterNumber ?? c.chunkIndex,
        }));

        console.log(
          "[Wizard DEBUG] normalizedAudioChunks:",
          JSON.stringify(normalizedAudioChunks, null, 2),
        );

        // Load outline data from metadata
        let outlineOutput = (video.metadata as any)?.outlineOutput || null;

        // RECOVERY: If outline missing in metadata, try to recover from linked task
        // This handles cases where metadata was inadvertently overwritten
        if (!outlineOutput && (video as any).outline_task_id) {
          console.log(
            "[Wizard] Attempting to recover outline from task:",
            (video as any).outline_task_id,
          );
          try {
            const tRes = await fetch(
              `/api/tasks/${(video as any).outline_task_id}`,
            );
            const tData = await tRes.json();
            if (tRes.ok && tData.task?.output_data) {
              outlineOutput = tData.task.output_data;
              console.log(
                "[Wizard] Successfully recovered outline output from task!",
              );
            }
          } catch (err) {
            console.error("[Wizard] Outline recovery failed:", err);
          }
        }
        console.log(
          "[Wizard DEBUG] Loaded outlineOutput:",
          outlineOutput
            ? `Present (assetRegistry keys: ${Object.keys(outlineOutput.assetRegistry || {}).join(", ")})`
            : "NULL",
        );

        const outlineConfig = (video.metadata as any)?.outlineConfig || null;
        const scriptOutput = (video.metadata as any)?.scriptOutput || null;

        setState({
          prompt: video.idea || "",
          expandedIdea: expandedIdea,
          script: video.script_content || "",
          audioUrl: video.audio_url || null,
          audioChunks: normalizedAudioChunks,
          shotList: shotList,
          avScript: (video.metadata as any)?.avScript || [],
          videoId: video.id,
          expandTaskId: null,
          writeTaskId: null,
          audioTaskId: video.audio_task_id || null,
          outlineOutput,
          outlineConfig,
          outlineTaskId: null,
          scriptConfig,
          universalScriptOutput,
          scriptOutput,
          avScriptTaskId: null,
          avScriptPart1Output: (video.metadata as any)?.av_script_part1 || null,
        });

        // Set the video name in the navigation store
        setCurrentVideoName(video.name);

        // Set the current step and max reached step
        setCurrentStep(targetStep);
        setMaxStepReached(targetStep);

        // HOTFIX: If we are in Step 2 (Audio) but find 0 chunks, it means the previous generation failed silently.
        // Instead of trying to use the AsyncLoadingStep (which is getting stuck or invisible),
        // we force the Error UI immediately so the user can regenerate.
        let initialError = null;
        if (targetStep === 2 && normalizedAudioChunks.length === 0) {
          initialError = "Audio data missing. Please regenerate.";
          // Also clear the junk task ID so we don't pollute the next attempt
          if (video.audio_task_id) {
            setState((prev) => ({ ...prev, audioTaskId: null }));
            // Fire and forget cleanup
            fetch(`/api/videos/${video.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ audio_task_id: null }),
            }).catch(console.error);
          }
        }

        if (initialError) {
          setState((prev) => ({ ...prev, generationError: initialError }));
        }

        console.log(
          `Resumed video at step ${targetStep} (stage: ${video.current_stage})`,
        );
      } catch (err) {
        console.error("Error loading video data:", err);
      } finally {
        setIsLoadingVideo(false);
      }
    }

    loadVideoData();
  }, [initialVideoId]);

  const updateState = useCallback((updates: Partial<WizardState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  const goToStep = useCallback((step: number) => {
    setCurrentStep(step);
  }, []);

  const advanceToStep = useCallback((step: number) => {
    setCurrentStep(step);
    setMaxStepReached((prev) => Math.max(prev, step));
  }, []);

  // Helper to get lock state for a step
  const getLockState = (stepId: number) => {
    const isLocked = stepId > maxStepReached;
    let lockedMessage = "";

    if (isLocked) {
      // Find the first incomplete required step
      const previousStep = STEPS.find((s) => s.id === stepId - 1);
      lockedMessage = `Must complete ${
        previousStep?.label || "previous step"
      } first`;
    }

    return { isLocked, lockedMessage };
  };

  // =========================================================================
  // STEP COMPLETION GATING
  // =========================================================================
  const getStepCompletionStatus = useCallback(
    (stepId: number): boolean => {
      switch (stepId) {
        case 1: // Outline
          return !!state.outlineOutput?.spine?.beats?.length;
        case 2: // Stock Media
          return true; // Always completable (optional step)
        case 3: // Script
          return !!state.scriptOutput || !!state.script;
        case 4: // Audio
          return state.audioChunks.length > 0;
        case 5: // Shot Creation
          return true; // No blocking requirements
        case 6: // Scene Review
          return true; // No blocking requirements
        case 7: // Editor
          return true; // No blocking requirements
        case 8: // Export
          return true; // Final step, always completable
        default:
          return false;
      }
    },
    [state.outlineOutput, state.scriptOutput, state.script, state.audioChunks],
  );

  const canGoNext = useMemo(
    () => getStepCompletionStatus(currentStep),
    [currentStep, getStepCompletionStatus],
  );
  const canGoPrev = currentStep > 1;
  const isFirstStep = currentStep === 1;
  const isLastStep = currentStep === STEPS.length;

  // =========================================================================
  // CONFIRMATION DIALOG STATE
  // =========================================================================
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    direction: "next" | "prev";
  } | null>(null);

  // Get skipped steps for navigation calculations
  const skippedSteps = useMemo(
    () => (state.outlineConfig?.stockMediaLevel === "none" ? [2] : []),
    [state.outlineConfig?.stockMediaLevel],
  );

  // Calculate actual next/prev step accounting for skips
  const getNextStep = useCallback(
    (fromStep: number): number => {
      let next = fromStep + 1;
      while (skippedSteps.includes(next) && next <= STEPS.length) {
        next++;
      }
      return Math.min(next, STEPS.length);
    },
    [skippedSteps],
  );

  const getPrevStep = useCallback(
    (fromStep: number): number => {
      let prev = fromStep - 1;
      while (skippedSteps.includes(prev) && prev >= 1) {
        prev--;
      }
      return Math.max(prev, 1);
    },
    [skippedSteps],
  );

  const handlePrevStepRequest = useCallback(() => {
    if (!canGoPrev) return;
    setConfirmDialog({ isOpen: true, direction: "prev" });
  }, [canGoPrev]);

  const handleNextStepRequest = useCallback(() => {
    if (!canGoNext) return;
    setConfirmDialog({ isOpen: true, direction: "next" });
  }, [canGoNext]);

  const handleConfirmNavigation = useCallback(() => {
    if (!confirmDialog) return;

    // OPTIMISTIC: Close dialog immediately
    setConfirmDialog(null);

    if (confirmDialog.direction === "next") {
      const nextStep = getNextStep(currentStep);

      if (nextStep > STEPS.length) {
        // Final step - trigger completion immediately, fire backend in background
        onComplete(state.videoId!);
        if (state.videoId) {
          updateVideo(state.videoId, { status: "completed" }).catch((err) =>
            console.error("Failed to mark video as completed:", err),
          );
        }
      } else if (currentStep === 3 && step3Ref.current) {
        // Step 3 → 4: Trigger script completion (which handles its own optimistic navigation)
        step3Ref.current.handleConfirm();
      } else if (currentStep === 4 && state.audioChunks.length > 0) {
        // Step 4 → Step 5: OPTIMISTIC - Navigate immediately, start AV Script task in background
        // The AV Script loading screen will appear because avScriptTaskId will be set

        if (state.videoId) {
          // Prepare data for background call
          const wordTimestamps = state.audioChunks.flatMap(
            (chunk: any) => chunk.wordTimestamps || chunk.word_timestamps || [],
          );
          const totalDuration = state.audioChunks.reduce(
            (sum, chunk) => sum + (chunk.duration_seconds || 0),
            0,
          );

          // Fire background API calls (non-blocking)
          console.log(
            "[Wizard] OPTIMISTIC: Navigating to Step 5, firing AV Script task in background...",
          );

          // Update stage in background
          fetch(`/api/videos/${state.videoId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ current_stage: "shot_planning" }),
          }).catch((err) =>
            console.error("[Wizard] Failed to update stage:", err),
          );

          // Trigger AV Script in background and update state when ready
          fetch("/api/process/av-script-part1", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              videoId: state.videoId,
              script: state.script,
              wordTimestamps,
              totalDurationSeconds: totalDuration,
              outlineAssets: state.outlineOutput?.assetRegistry || null,
            }),
          })
            .then((response) => response.json())
            .then((data) => {
              if (data.taskId) {
                console.log(
                  "[Wizard] AV Script Part 1 task created:",
                  data.taskId,
                );
                setState((prev) => ({
                  ...prev,
                  avScriptTaskId: data.taskId,
                }));
              } else {
                console.error(
                  "[Wizard] Failed to create AV Script task:",
                  data,
                );
              }
            })
            .catch((err) => {
              console.error(
                "[Wizard] Failed to trigger AV Script Part 1:",
                err,
              );
            });
        }

        // OPTIMISTIC: Advance to step 5 immediately
        advanceToStep(5);
      } else {
        // Default: advance immediately
        advanceToStep(nextStep);
      }
    } else {
      // PREV navigation - immediate
      const prevStep = getPrevStep(currentStep);
      goToStep(prevStep);
    }
  }, [
    confirmDialog,
    currentStep,
    getNextStep,
    getPrevStep,
    advanceToStep,
    goToStep,
    state.videoId,
    state.audioChunks,
    state.script,
    state.outlineOutput?.assetRegistry,
    updateVideo,
    onComplete,
  ]);

  const handleCloseConfirmDialog = useCallback(() => {
    setConfirmDialog(null);
  }, []);

  // Get step names for dialog
  const currentStepName = STEPS.find((s) => s.id === currentStep)?.label || "";
  const targetStepName =
    confirmDialog?.direction === "next"
      ? STEPS.find((s) => s.id === getNextStep(currentStep))?.label || "Next"
      : STEPS.find((s) => s.id === getPrevStep(currentStep))?.label ||
        "Previous";

  // Render the appropriate step content
  const renderStep = () => {
    const lock = getLockState(currentStep);

    console.log(
      `[Wizard Render] Step: ${currentStep}, AudioChunks: ${
        state.audioChunks.length
      }, Error: ${state.generationError ? "YES" : "NO"}`,
    );

    switch (currentStep) {
      case 1: // Outline Generation + Research
        return (
          <Step1Outline
            videoId={state.videoId!}
            projectId={projectId}
            initialTopic={state.prompt}
            initialOutput={state.outlineOutput}
            initialConfig={state.outlineConfig}
            onSave={async (outlineOutput, config) => {
              // Update local state
              updateState({
                outlineOutput,
                outlineConfig: config,
              });

              // Persist to database (Auto-save)
              if (state.videoId) {
                try {
                  console.log("[Wizard] Auto-saving outline data...");
                  await fetch(`/api/videos/${state.videoId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      metadata: {
                        outlineOutput,
                        outlineConfig: config,
                      },
                    }),
                  });
                  console.log("[Wizard] Outline auto-save complete");
                } catch (err) {
                  console.error("Failed to auto-save outline:", err);
                }
              }
            }}
            onStockMediaChange={(level) => {
              updateState({
                outlineConfig: {
                  ...(state.outlineConfig || {}),
                  stockMediaLevel: level,
                },
              });
            }}
            onComplete={async (outlineOutput, config) => {
              // Save the outline and update state
              updateState({
                outlineOutput,
                outlineConfig: config,
              });

              // Persist to database and update stage
              if (state.videoId) {
                try {
                  await fetch(`/api/videos/${state.videoId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      current_stage: "stock",
                      metadata: {
                        outlineOutput,
                        outlineConfig: config,
                      },
                    }),
                  });
                } catch (err) {
                  console.error("Failed to save outline:", err);
                }
              }

              // Check if we should skip step 2 (Stock Media)
              if (config?.stockMediaLevel === "none") {
                advanceToStep(3);
              } else {
                advanceToStep(2);
              }
            }}
            onBack={onBack}
            {...lock}
          />
        );
      case 2:
        return (
          <Step2StockMedia
            onNext={() => advanceToStep(3)}
            onBack={() => goToStep(1)}
            {...lock}
          />
        );

      case 3: // Script Writing (uses outline from Step 1)
        return (
          <Step3Script
            ref={step3Ref}
            videoId={state.videoId!}
            projectId={projectId}
            outlineData={state.outlineOutput}
            outlineConfig={state.outlineConfig}
            initialScriptOutput={state.scriptOutput}
            onSave={(script) => {
              // Update local state
              updateState({ script });

              // Persist to database (Auto-save)
              if (state.videoId) {
                fetch(`/api/videos/${state.videoId}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    script_content: script,
                  }),
                }).catch(console.error);
              }
            }}
            onScriptGenerated={(script, scriptOutput) => {
              // Update wizard state so navigation button gets enabled
              updateState({ script, scriptOutput });
            }}
            onComplete={(script, scriptOutput) => {
              // OPTIMISTIC: Update state and navigate immediately
              updateState({
                script,
                scriptOutput,
              });

              // OPTIMISTIC: Advance to Step 4 immediately
              advanceToStep(4);

              // Fire API calls in background (non-blocking)
              if (state.videoId) {
                console.log(
                  "[Wizard] OPTIMISTIC: Navigated to Step 4, firing backend calls in background...",
                );

                // Persist to database and trigger audio generation in background
                fetch(`/api/videos/${state.videoId}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    script_content: script,
                    current_stage: "audio",
                    metadata: {
                      scriptOutput,
                    },
                  }),
                })
                  .then(() => {
                    // Trigger audio generation workflow via resume API
                    return fetch(`/api/videos/${state.videoId}/resume`, {
                      method: "POST",
                    });
                  })
                  .then((response) => response.json())
                  .then((data) => {
                    if (data.taskId) {
                      console.log("[Wizard] Audio task created:", data.taskId);
                      setState((prev) => ({
                        ...prev,
                        audioTaskId: data.taskId,
                      }));
                    }
                  })
                  .catch((err) => {
                    console.error(
                      "[Wizard] Failed to save script or start audio:",
                      err,
                    );
                  });
              }
            }}
            onBack={() => {
              // Check if we should skip back to step 1
              if (state.outlineConfig?.stockMediaLevel === "none") {
                goToStep(1);
              } else {
                goToStep(2);
              }
            }}
            {...lock}
          />
        );

      case 4: // Old Step 2: Audio Generation & Review
        // Check for explicit generation error
        if (state.generationError) {
          console.log("[Wizard Render] FORCE RENDERING FIXED ERROR UI");
          return (
            <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-8 backdrop-blur-sm">
              <div className="bg-neutral-900 border border-red-500 rounded-xl p-8 max-w-lg w-full text-center shadow-2xl space-y-6">
                <div className="w-16 h-16 bg-red-500 mx-auto rounded-full flex items-center justify-center text-white text-3xl font-bold">
                  !
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-bold text-white">
                    Generation Failed
                  </h3>
                  <p className="text-red-200">{state.generationError}</p>
                </div>
                <button
                  onClick={() => {
                    console.log("[Wizard] Resetting error");
                    updateState({ generationError: null });
                    goToStep(3);
                  }}
                  className="w-full py-3 bg-white hover:bg-neutral-200 text-black font-bold rounded-lg transition-colors"
                >
                  Return to Script
                </button>
              </div>
            </div>
          );
        }

        // Check if we need to generate AV script Part 1 (loading state)
        console.log(
          "[Wizard] Case 4 render check: avScriptTaskId=",
          state.avScriptTaskId,
          "avScriptPart1Output=",
          !!state.avScriptPart1Output,
        );
        if (state.avScriptTaskId && !state.avScriptPart1Output) {
          console.log("[Wizard] SHOWING AV Script Loading Screen!");
          // Show loading screen for AV script generation
          return (
            <AsyncLoadingStep
              title="Creating Shot Breakdown"
              subtitle="Analyzing script and generating scene structure..."
              steps={[
                "Analyzing content structure",
                "Segmenting timeline",
                "Generating shot summaries",
                "Finalizing breakdown",
              ]}
              taskId={state.avScriptTaskId}
              onComplete={async (output) => {
                console.log("[Wizard] AV Script Part 1 complete:", output);
                const avOutput = output as any;

                // Update state with AV script output
                updateState({
                  avScriptPart1Output: avOutput,
                  avScriptTaskId: null,
                });

                // Advance to Step 5
                advanceToStep(5);
              }}
              onError={(error) => {
                console.error("[Wizard] AV Script Part 1 failed:", error);
                updateState({
                  avScriptTaskId: null,
                  generationError: `Shot breakdown failed: ${error}`,
                });
              }}
              fallbackDuration={15000}
            />
          );
        }

        // If we have audio chunks, show the editor/review screen
        if (state.audioChunks.length > 0) {
          return (
            <Step2Audio
              videoId={state.videoId!}
              audioChunks={state.audioChunks}
              onUpdateChunks={(newChunks) =>
                updateState({ audioChunks: newChunks })
              }
              onComplete={async () => {
                // Persist the step navigation to the database
                if (state.videoId) {
                  try {
                    await fetch(`/api/videos/${state.videoId}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ current_stage: "shot_planning" }),
                    });
                  } catch (err) {
                    console.error("Failed to save step:", err);
                  }

                  // Trigger AV Script Part 1 generation
                  try {
                    console.log("[Wizard] Triggering AV Script Part 1...");

                    // Get word timestamps from audio chunks if available
                    // Note: Check both camelCase (from audio worker) and snake_case (legacy)
                    const wordTimestamps = state.audioChunks.flatMap(
                      (chunk: any) =>
                        chunk.wordTimestamps || chunk.word_timestamps || [],
                    );

                    // Calculate total duration
                    const totalDuration = state.audioChunks.reduce(
                      (sum, chunk) => sum + (chunk.duration_seconds || 0),
                      0,
                    );

                    const response = await fetch(
                      "/api/process/av-script-part1",
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          videoId: state.videoId,
                          script: state.script,
                          wordTimestamps,
                          totalDurationSeconds: totalDuration,
                          outlineAssets:
                            state.outlineOutput?.assetRegistry || null,
                        }),
                      },
                    );

                    const data = await response.json();

                    if (data.taskId) {
                      console.log(
                        "[Wizard] AV Script Part 1 task created:",
                        data.taskId,
                      );
                      setState((prev) => ({
                        ...prev,
                        avScriptTaskId: data.taskId,
                      }));
                    } else {
                      console.error(
                        "[Wizard] Failed to create AV Script task:",
                        data,
                      );
                      // Fallback: proceed without AV script
                      advanceToStep(5);
                    }
                  } catch (err) {
                    console.error(
                      "[Wizard] Failed to trigger AV Script Part 1:",
                      err,
                    );
                    // Fallback: proceed without AV script
                    advanceToStep(5);
                  }
                } else {
                  advanceToStep(5);
                }
              }}
              onBack={() => {
                // If they want to go back to script
                goToStep(3);
              }}
            />
          );
        }

        // Otherwise show loading/generation
        return (
          <AsyncLoadingStep
            title="Generating Audio"
            subtitle="Creating TTS audio from your script..."
            steps={[
              "Splitting script into chunks",
              "Generating TTS audio",
              "Uploading audio files",
              "Finalizing audio",
            ]}
            taskId={state.audioTaskId}
            onComplete={async (output) => {
              // Use audio data from task output
              const audioOutput = output as any;
              const audioUrl =
                audioOutput?.final_audio || "/placeholder-audio.mp3";

              // Extract audio chunks if available
              let audioChunks: AudioChunk[] = (
                audioOutput?.tts_chunks || []
              ).map((c: any) => ({
                ...c,
                chapterNumber: c.chapterNumber ?? c.chunkIndex,
              }));

              // Handle "silent failure" where task completes but 0 chunks are produced
              // Do this BEFORE polling for AV script to avoid waiting 60s for nothing
              if (audioChunks.length === 0) {
                // Try to recover from metadata first
                if (state.videoId) {
                  try {
                    const response = await fetch(
                      `/api/videos/${state.videoId}`,
                    );
                    const data = await response.json();
                    if (data.audioChunks && data.audioChunks.length > 0) {
                      audioChunks = data.audioChunks.map((c: any) => ({
                        ...c,
                        chapterNumber: c.chapterNumber ?? c.chunkIndex,
                      }));
                      console.log(
                        "[Wizard] Recovered audio chunks from metadata",
                      );
                    }
                  } catch (e) {
                    console.error("[Wizard] Failed to recover audio chunks", e);
                  }
                }

                // Double check after recovery attempt
                if (audioChunks.length === 0) {
                  console.error(
                    "[Wizard] Audio generation completed with 0 chunks.",
                  );

                  // Clear invalid task ID from DB so it doesn't persist
                  if (state.videoId) {
                    fetch(`/api/videos/${state.videoId}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ audio_task_id: null }),
                    }).catch(console.error);
                  }

                  setState((prev) => ({
                    ...prev,
                    audioTaskId: null,
                    generationError:
                      "Audio generation completed but produced no audio. This usually happens if the script was too short or the AI service timed out. Please try regenerating.",
                  }));
                  return;
                }
              }

              // Update state with just audio chunks (AV script generated later)
              console.log(
                "[Wizard] Audio generation complete. chunks:",
                audioChunks.length,
              );

              updateState({
                audioUrl,
                audioChunks,
                shotList: [], // Clean slate for editor
                avScript: [],
              });

              // If valid audio, this will trigger re-render to Step2Audio
              // If invalid (0 chunks), the error state set above will trigger re-render to Error UI
            }}
            onError={(error) => {
              console.error("Audio generation failed:", error);
              // Use fallback? Or just stay here?
              // For robustness, maybe we should allow retry?
              // Existing logic advanced anyway, let's keep it simple for now
            }}
            fallbackDuration={8000}
          />
        );

      case 5: // Shot Creation (was Step 6)
        console.log(
          "[Wizard] Rendering Step 5 with outlineAssets:",
          state.outlineOutput?.assetRegistry
            ? `Present (characters: ${state.outlineOutput.assetRegistry.characters?.length || 0}, locations: ${state.outlineOutput.assetRegistry.locations?.length || 0})`
            : "NULL - will show mock data",
        );
        return (
          <Step5ShotCreation
            onNext={async () => {
              if (state.videoId) {
                try {
                  await fetch(`/api/videos/${state.videoId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ current_stage: "shot_creation" }),
                  });
                } catch (err) {
                  console.error("Failed to save step:", err);
                }
              }
              advanceToStep(6);
            }}
            onBack={() => goToStep(4)}
            outlineAssets={state.outlineOutput?.assetRegistry}
            avScriptShots={state.avScriptPart1Output?.shots}
            {...lock}
          />
        );

      case 6: // Scene Review (was Step 7)
        return (
          <Step6SceneReview
            videoId={state.videoId!}
            projectId={projectId}
            onContinue={async () => {
              if (state.videoId) {
                try {
                  await fetch(`/api/videos/${state.videoId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ current_stage: "video" }),
                  });
                } catch (err) {
                  console.error("Failed to save step:", err);
                }
              }
              advanceToStep(7);
            }}
            onBack={() => goToStep(5)}
            {...lock}
          />
        );

      case 7: // Editor (restored)
        return (
          <StepEditor
            videoId={state.videoId!}
            projectId={projectId}
            audioUrl={state.audioUrl}
            audioChunks={state.audioChunks}
            shotList={state.shotList}
            onContinue={async () => {
              if (state.videoId) {
                try {
                  await fetch(`/api/videos/${state.videoId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ current_stage: "export" }),
                  });
                } catch (err) {
                  console.error("Failed to save step:", err);
                }
              }
              advanceToStep(8);
            }}
            onBack={() => goToStep(6)}
            {...lock}
          />
        );

      case 8: // Old Step 5: Export
        return (
          <StepExport
            videoId={state.videoId!}
            projectId={projectId}
            audioChunks={state.audioChunks}
            shotList={state.shotList}
            onBack={async () => {
              // Persist the step navigation to the database
              if (state.videoId) {
                try {
                  await fetch(`/api/videos/${state.videoId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ current_stage: "video" }),
                  });
                } catch (err) {
                  console.error("Failed to save step:", err);
                }
              }
              goToStep(7);
            }}
            onClose={async () => {
              if (state.videoId) {
                try {
                  await updateVideo(state.videoId, { status: "completed" });
                } catch (err) {
                  console.error("Failed to mark video as completed:");
                }
              }
              onComplete(state.videoId!);
            }}
            {...lock}
          />
        );

      default:
        return null;
    }
  };

  // Check if current step needs full width (Script, Audio, References, Generations, Editor)
  // Basically everything except Placeholder steps 1 & 2 maybe?
  // Actually, Script (3), Audio (4), Editor (7) are full width confirmed.
  // Original: 1, 2, 3, 4 were full width. 5 was narrow.
  // New map:
  // 3 (Script) -> Full
  // 4 (Audio) -> Full
  // 7 (Editor) -> Full
  // 8 (Export) -> Narrow? (Original 5 was narrow).
  // Placeholders: Default narrow is fine, but maybe full width looks better?
  // Let's keep strict equality for now.
  const isFullWidthStep =
    currentStep === 1 ||
    currentStep === 2 ||
    currentStep === 3 ||
    currentStep === 4 ||
    currentStep === 5 ||
    currentStep === 6 ||
    currentStep === 7;

  return (
    <div className="flex flex-col h-full w-full mx-auto">
      {/* Progress indicator with navigation buttons */}
      <div className="flex-shrink-0 pt-2">
        <WizardProgress
          steps={STEPS}
          currentStep={currentStep}
          maxStepReached={maxStepReached}
          onBack={onBack}
          onStepClick={goToStep}
          skippedSteps={skippedSteps}
          onPrevStep={handlePrevStepRequest}
          onNextStep={handleNextStepRequest}
          canGoPrev={canGoPrev}
          canGoNext={canGoNext}
          isFirstStep={isFirstStep}
          isLastStep={isLastStep}
        />
      </div>

      {/* Step content */}
      {isLoadingVideo ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <Loader2 className="w-8 h-8 animate-spin text-orange-500 mx-auto" />
            <p className="text-neutral-400">Loading video...</p>
          </div>
        </div>
      ) : isFullWidthStep ? (
        <div key={currentStep} className="flex-1 min-h-0 overflow-hidden">
          {renderStep()}
        </div>
      ) : (
        <div className="flex-1 overflow-hidden">
          <div className="flex items-center justify-center h-full p-6">
            <div className="w-full max-w-3xl">{renderStep()}</div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      <StepNavigationConfirmDialog
        isOpen={confirmDialog?.isOpen ?? false}
        onClose={handleCloseConfirmDialog}
        onConfirm={handleConfirmNavigation}
        direction={confirmDialog?.direction ?? "next"}
        currentStepName={currentStepName}
        targetStepName={targetStepName}
      />
    </div>
  );
}
