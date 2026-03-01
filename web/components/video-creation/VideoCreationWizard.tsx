"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { WizardProgress } from "./WizardProgress";
import { StepNavigationConfirmDialog } from "./StepNavigationConfirmDialog";
import { useNavigationStore } from "@/store/use-navigation-store";
import { createClient } from "@/lib/supabase/client";
import { OutlineStep } from "./steps/OutlineStep";
import { ScriptStep } from "./steps/ScriptStep";
import { ProductionStep } from "./steps/ProductionStep";
import { EditorStep } from "./steps/EditorStep";
import { ExportStep } from "./steps/ExportStep";
import { AsyncLoadingStep } from "./AsyncLoadingStep";
import { useVideos } from "@/hooks/use-videos";
import { Loader2 } from "lucide-react";
import type { VideoStage, VideoProject, AudioChunk, ShotEvent, GeneratedMedia } from "@/types/video";
import type { EditDecisionList } from "@/lib/services/edit-assembly/edit-assembly-prompts";


export interface WizardState {
  prompt: string;
  expandedIdea: string;
  script: string;
  videoId: string | null;
  expandTaskId: string | null;
  writeTaskId: string | null;
  // Outline output (Step 1)
  outlineOutput: any | null;
  outlineConfig: any | null;
  outlineTaskId: string | null;
  // Script output (Step 2)
  scriptConfig: any;
  scriptOutput: any | null;
  isScriptLoading: boolean;
  scriptTaskId: string | null;
  // Production (Step 3 — Closed-Loop Pipeline)
  isProductionLoading: boolean;
  productionTaskId: string | null;
  // Edit Decision List (produced by orchestrator Phase V)
  edl: EditDecisionList | null;
  agentEdl: any | null;
  edlTaskId: string | null;
  isEdlLoading: boolean;
  // Pipeline outputs needed by the editor (Step 4)
  audioChunks: AudioChunk[];
  shotList: ShotEvent[];
  generatedMedia: GeneratedMedia[];
}

// Step configuration for the wizard - 5 steps
const STEPS = [
  { id: 1, label: "Outline", type: "outline" },
  { id: 2, label: "Script", type: "script" },
  { id: 3, label: "Production", type: "production" },
  { id: 4, label: "Editor", type: "editor" },
  { id: 5, label: "Export", type: "final" },
] as const;

// Helper function to map video stage to wizard step number
function stageToStepNumber(stage: VideoStage): number {
  const stageMapping: Record<VideoStage, number> = {
    idea: 1, // Legacy -> Step 1
    outline: 1, // Step 1
    stock: 2, // Legacy (removed) -> Step 2
    script: 2, // Step 2
    production: 3, // Step 3 (Closed-Loop)
    audio: 3, // Legacy (removed) -> Step 3
    media: 3, // Legacy (removed) -> Step 3
    shot_planning: 3, // Legacy (removed) -> Step 3
    shot_creation: 3, // Legacy (removed) -> Step 3
    video: 4, // Step 4 (Editor)
    export: 5, // Step 5
    completed: 5, // Step 5
  };
  return stageMapping[stage] || 1;
}

/**
 * Extract pipeline outputs (audioChunks, shotList, generatedMedia) from
 * video_projects.metadata so the editor can resolve media URLs.
 */
function extractPipelineOutputs(metadata: Record<string, any>): {
  audioChunks: AudioChunk[];
  shotList: ShotEvent[];
  generatedMedia: GeneratedMedia[];
} {
  const avScript = metadata?.av_script_part1 || {};
  const shots: ShotEvent[] = (avScript.shots || []) as ShotEvent[];
  const genImages = (metadata?.generated_images || {}) as Record<string, string>;
  const genVideos = (metadata?.generated_videos || {}) as Record<string, string>;
  const genMG = (metadata?.generated_motion_graphics || {}) as Record<string, string>;
  const audioChunks = (metadata?.audio_chunks || []) as AudioChunk[];

  const generatedMedia: GeneratedMedia[] = shots.map((shot: any) => {
    const idx = shot.segment_index as number;
    const key = `shot-${idx}`;
    const imageUrl = genImages[key];
    const videoUrl = genVideos[key];
    const mgCode = genMG[key];
    // Use real media URL if available, or remotion:// marker for MG-only shots
    const url = videoUrl || imageUrl || (mgCode ? `remotion://shot-${idx}` : undefined);
    return {
      shot_index: idx,
      media_type: (shot.media_type || 'image') as 'image' | 'video' | 'motiongraphic',
      generation_status: (url || mgCode) ? 'completed' : 'failed',
      media_url: url,
      visual_prompt: shot.visual_prompt || shot.summary || '',
      remotion_code: mgCode,
    } as GeneratedMedia;
  });

  return { audioChunks, shotList: shots, generatedMedia };
}

// Helper function to generate a fallback script when workflow fails
function _generateFallbackScript(prompt: string): string {
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
  const { createVideo: _createVideo, updateVideo } = useVideos({
    projectId,
    autoFetch: false,
  });
  const [_isSaving, _setIsSaving] = useState(false);

  const [currentStep, setCurrentStep] = useState(1);
  const [maxStepReached, setMaxStepReached] = useState(1);
  const [state, setState] = useState<WizardState>({
    prompt: "",
    expandedIdea: "",
    script: "",
    videoId: initialVideoId,
    expandTaskId: null,
    writeTaskId: null,
    outlineOutput: null,
    outlineConfig: null,
    outlineTaskId: null,
    scriptConfig: null,
    scriptOutput: null,
    isScriptLoading: false,
    scriptTaskId: null,
    isProductionLoading: false,
    productionTaskId: null,
    edl: null,
    agentEdl: null,
    edlTaskId: null,
    isEdlLoading: false,
    audioChunks: [],
    shotList: [],
    generatedMedia: [],
  });

  // Step 2 ref for manual trigger (Script step)
  const step2ScriptRef = useRef<any>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      setCurrentVideoName(null);
    };
  }, [setCurrentVideoName]);

  // Admin status
  const [isAdmin, setIsAdmin] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    async function checkAdminStatus() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userData } = await supabase
        .from("users")
        .select("is_admin")
        .eq("id", user.id)
        .single();

      if (userData) {
        setIsAdmin(userData.is_admin || false);
      }
    }
    checkAdminStatus();
  }, [supabase]);

  // Load existing video data when resuming
  const [isLoadingVideo, setIsLoadingVideo] = useState(false);
  // Track if we resumed at step 4 (editor) so EditorStep can skip its import animation
  const resumedAtEditorRef = useRef(false);

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

        // Update state with loaded video data
        const scriptConfig = (video.metadata as any)?.scriptConfig || null;

        // Load outline data from metadata
        let outlineOutput = (video.metadata as any)?.outlineOutput || null;

        // RECOVERY: If outline missing in metadata, try to recover from linked task
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

        const outlineConfig = (video.metadata as any)?.outlineConfig || null;
        const scriptOutput = (video.metadata as any)?.scriptOutput || null;

        // Extract pipeline outputs (audioChunks, shots, media) from metadata
        const pipelineOutputs = extractPipelineOutputs((video.metadata || {}) as Record<string, any>);

        setState({
          prompt: video.idea || "",
          expandedIdea: expandedIdea,
          script: video.script_content || "",
          videoId: video.id,
          expandTaskId: null,
          writeTaskId: null,
          outlineOutput,
          outlineConfig,
          outlineTaskId: null,
          scriptConfig,
          scriptOutput,
          isScriptLoading: false,
          scriptTaskId: null,
          isProductionLoading: false,
          productionTaskId: null,
          edl: (video.metadata as any)?.edl || null,
          agentEdl: (video.metadata as any)?.agentEdl || null,
          edlTaskId: null,
          isEdlLoading: false,
          audioChunks: pipelineOutputs.audioChunks,
          shotList: pipelineOutputs.shotList,
          generatedMedia: pipelineOutputs.generatedMedia,
        });

        // =====================================================================
        // RESTORE IN-PROGRESS LOADING STATES FROM ACTIVE TASKS
        // =====================================================================
        const activeTasks = data.activeTasks || [];
        if (activeTasks.length > 0) {
          const loadingUpdates: Partial<WizardState> = {};

          for (const task of activeTasks) {
            switch (task.type) {
              case "script_writing":
                loadingUpdates.isScriptLoading = true;
                loadingUpdates.scriptTaskId = task.id;
                console.log(`[Wizard] Restoring active script task: ${task.id}`);
                break;
              case "closed_loop":
                loadingUpdates.isProductionLoading = true;
                loadingUpdates.productionTaskId = task.id;
                console.log(`[Wizard] Restoring active production task: ${task.id}`);
                break;
              case "outline":
                loadingUpdates.outlineTaskId = task.id;
                console.log(`[Wizard] Restoring active outline task: ${task.id}`);
                break;
              case "edit_assembly":
                if (!(video.metadata as any)?.edl) {
                  loadingUpdates.isEdlLoading = true;
                  loadingUpdates.edlTaskId = task.id;
                  console.log(`[Wizard] Restoring active edit assembly task: ${task.id}`);
                }
                break;
            }
          }

          if (Object.keys(loadingUpdates).length > 0) {
            console.log(
              `[Wizard] Restored ${Object.keys(loadingUpdates).length} loading states from active tasks`,
            );
            setState((prev) => ({ ...prev, ...loadingUpdates }));
          }
        }

        // Set the video name in the navigation store
        setCurrentVideoName(video.name);

        // Set the current step and max reached step
        setCurrentStep(targetStep);
        setMaxStepReached(targetStep);
        if (targetStep === 4) {
          resumedAtEditorRef.current = true;
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
        case 2: // Script
          return !!state.scriptOutput || !!state.script;
        case 3: // Production
          return true; // ProductionStep handles its own gating
        case 4: // Editor
          return true; // No blocking requirements
        case 5: // Export
          return true; // Final step, always completable
        default:
          return false;
      }
    },
    [state.outlineOutput, state.scriptOutput, state.script],
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
  const [isResetting, setIsResetting] = useState(false);

  // =========================================================================
  // RESET WARNING HELPER
  // =========================================================================
  const getResetWarning = useCallback(
    (stepId: number): string | null => {
      switch (stepId) {
        case 2: // Script
          return "Your generated script content";
        case 3: // Production
          return "Generated audio, shots, images, videos, and edit decisions";
        case 4: // Editor
          return "Editor timeline and settings";
        case 5: // Export
          return "Exported video file";
        default:
          return null;
      }
    },
    [],
  );

  // No skipped steps in the new 5-step flow
  const skippedSteps = useMemo(() => [] as number[], []);

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

  const handleConfirmNavigation = useCallback(async () => {
    if (!confirmDialog) return;

    // For NEXT navigation: Close dialog immediately (optimistic)
    // For PREV navigation: Keep dialog open during reset, close after
    if (confirmDialog.direction === "next") {
      setConfirmDialog(null);

      const nextStep = getNextStep(currentStep);

      if (nextStep > STEPS.length) {
        // Final step - trigger completion immediately
        onComplete(state.videoId!);
        if (state.videoId) {
          updateVideo(state.videoId, { status: "completed" }).catch((err) =>
            console.error("Failed to mark video as completed:", err),
          );
        }
      } else if (currentStep === 1 && state.outlineOutput) {
        // Step 1 → Step 2: OPTIMISTIC - Navigate immediately, start script generation in background
        console.log(
          "[Wizard] OPTIMISTIC: Navigating to Step 2, firing script generation...",
        );

        setState((prev) => ({
          ...prev,
          isScriptLoading: true,
        }));
        advanceToStep(2);

        // Trigger script generation in background
        if (state.videoId) {
          fetch("/api/process/script-writing", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ videoId: state.videoId }),
          })
            .then((res) => res.json())
            .then((data) => {
              if (data.taskId) {
                console.log("[Wizard] Script task created:", data.taskId);
                setState((prev) => ({
                  ...prev,
                  scriptTaskId: data.taskId,
                }));
              } else {
                console.error("[Wizard] Failed to create script task:", data);
                setState((prev) => ({
                  ...prev,
                  isScriptLoading: false,
                }));
              }
            })
            .catch((err) => {
              console.error("[Wizard] Script generation failed:", err);
              setState((prev) => ({
                ...prev,
                isScriptLoading: false,
              }));
            });
        }
      } else if (currentStep === 2 && step2ScriptRef.current) {
        // Step 2 → 3: Trigger script completion (which handles its own navigation)
        step2ScriptRef.current.handleConfirm();
      } else {
        advanceToStep(nextStep);
      }
    } else {
      // PREV: Reset data and go back
      const prevStep = getPrevStep(currentStep);

      // If we have a video, call the reset API
      if (state.videoId) {
        setIsResetting(true);
        try {
          const response = await fetch(
            `/api/videos/${state.videoId}/reset-step`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                fromStep: currentStep,
                toStep: prevStep,
              }),
            },
          );

          // Get result before closing dialog
          const result = await response.json();
          console.log(
            `[Wizard] Reset step ${currentStep} → ${prevStep}:`,
            result,
          );

          // Also reset relevant local wizard state based on the step we're leaving
          const stateUpdates: Partial<WizardState> = {};
          switch (currentStep) {
            case 2: // Script
              stateUpdates.script = "";
              stateUpdates.scriptOutput = null;
              stateUpdates.scriptTaskId = null;
              stateUpdates.isScriptLoading = false;
              break;
            case 3: // Production
              stateUpdates.isProductionLoading = false;
              stateUpdates.productionTaskId = null;
              stateUpdates.edl = null;
              stateUpdates.agentEdl = null;
              stateUpdates.edlTaskId = null;
              stateUpdates.isEdlLoading = false;
              break;
            case 4: // Editor
              stateUpdates.edl = null;
              stateUpdates.agentEdl = null;
              stateUpdates.edlTaskId = null;
              stateUpdates.isEdlLoading = false;
              break;
          }

          if (Object.keys(stateUpdates).length > 0) {
            updateState(stateUpdates);
          }
        } catch (err) {
          console.error("[Wizard] Reset step error:", err);
          // Still allow navigation even if reset fails
        } finally {
          setIsResetting(false);
        }
      }

      // Close dialog and navigate
      setConfirmDialog(null);
      setMaxStepReached(prevStep);
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
    state.script,
    state.outlineOutput,
    state.outlineConfig,
    updateVideo,
    onComplete,
    updateState,
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

  // EDL auto-trigger removed — the orchestrator's Phase V generates the EDL
  const edlTriggerRef = useRef(false);

  // Render the appropriate step content
  const renderStep = () => {
    const lock = getLockState(currentStep);

    switch (currentStep) {
      case 1: // Outline Generation + Research
        return (
          <OutlineStep
            videoId={state.videoId!}
            projectId={projectId}
            initialTopic={state.prompt}
            initialOutput={state.outlineOutput}
            initialConfig={state.outlineConfig}
            onSave={async (outlineOutput, config) => {
              updateState({
                outlineOutput,
                outlineConfig: config,
              });

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
              updateState({
                outlineOutput,
                outlineConfig: config,
              });

              if (state.videoId) {
                try {
                  await fetch(`/api/videos/${state.videoId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      current_stage: "script",
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

              // Navigate to Step 2 (Script) with script generation
              console.log(
                "[Wizard] OPTIMISTIC: Navigating to Step 2 (Script), firing script generation...",
              );
              setState((prev) => ({
                ...prev,
                isScriptLoading: true,
              }));
              advanceToStep(2);

              // Trigger script generation in background
              if (state.videoId) {
                fetch("/api/process/script-writing", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ videoId: state.videoId }),
                })
                  .then((res) => res.json())
                  .then((data) => {
                    if (data.taskId) {
                      console.log("[Wizard] Script task created:", data.taskId);
                      setState((prev) => ({
                        ...prev,
                        scriptTaskId: data.taskId,
                      }));
                    } else {
                      console.error(
                        "[Wizard] Failed to create script task:",
                        data,
                      );
                      setState((prev) => ({
                        ...prev,
                        isScriptLoading: false,
                      }));
                    }
                  })
                  .catch((err) => {
                    console.error("[Wizard] Script generation failed:", err);
                    setState((prev) => ({
                      ...prev,
                      isScriptLoading: false,
                    }));
                  });
              }
            }}
            onBack={onBack}
            {...lock}
          />
        );
      case 2: // Script Writing (uses outline from Step 1)
        return (
          <ScriptStep
            ref={step2ScriptRef}
            videoId={state.videoId!}
            projectId={projectId}
            outlineData={state.outlineOutput}
            outlineConfig={state.outlineConfig}
            initialScriptOutput={state.scriptOutput}
            isLoading={state.isScriptLoading}
            taskId={state.scriptTaskId}
            onSave={(script) => {
              updateState({ script });
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
              updateState({ script, scriptOutput });
            }}
            onComplete={async (script, scriptOutput) => {
              // Save script and navigate to Production (Step 3)
              updateState({
                script,
                scriptOutput,
              });

              // Persist script and update stage
              if (state.videoId) {
                try {
                  await fetch(`/api/videos/${state.videoId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      script_content: script,
                      current_stage: "production",
                      metadata: {
                        scriptOutput,
                      },
                    }),
                  });
                } catch (err) {
                  console.error("Failed to save script:", err);
                }
              }

              advanceToStep(3);
            }}
            onBack={() => goToStep(1)}
            {...lock}
          />
        );

      case 3: // Production (Closed-Loop Pipeline)
        return (
          <ProductionStep
            videoId={state.videoId!}
            isLoading={state.isProductionLoading}
            taskId={state.productionTaskId}
            onTaskStarted={(taskId) => {
              updateState({
                isProductionLoading: true,
                productionTaskId: taskId,
              });
            }}
            onComplete={async () => {
              // Fetch completed EDL/agentEdl + pipeline outputs from project metadata
              let edl = null;
              let agentEdl = null;
              let pipelineOutputs = { audioChunks: [] as AudioChunk[], shotList: [] as ShotEvent[], generatedMedia: [] as GeneratedMedia[] };
              if (state.videoId) {
                try {
                  const res = await fetch(`/api/videos/${state.videoId}`);
                  if (res.ok) {
                    const data = await res.json();
                    const meta = (data.video?.metadata || {}) as Record<string, any>;
                    edl = meta.edl || null;
                    agentEdl = meta.agentEdl || null;
                    pipelineOutputs = extractPipelineOutputs(meta);
                    console.log(`[Wizard] Post-production: ${pipelineOutputs.generatedMedia.length} media, ${pipelineOutputs.audioChunks.length} audio, ${pipelineOutputs.shotList.length} shots`);
                  }
                } catch (err) {
                  console.warn("[Wizard] Failed to fetch data after production:", err);
                }

                // Update stage to video (editor)
                try {
                  await fetch(`/api/videos/${state.videoId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ current_stage: "video" }),
                  });
                } catch (err) {
                  console.error("Failed to update stage:", err);
                }
              }

              updateState({
                isProductionLoading: false,
                productionTaskId: null,
                edl,
                agentEdl,
                audioChunks: pipelineOutputs.audioChunks,
                shotList: pipelineOutputs.shotList,
                generatedMedia: pipelineOutputs.generatedMedia,
              });
              advanceToStep(4);
            }}
            onError={(error) => {
              console.warn("[Wizard] Production error:", error);
              updateState({
                isProductionLoading: false,
              });
            }}
            onBack={() => goToStep(2)}
            {...lock}
          />
        );

      case 4: // Editor
        // Show loading screen while EDL is being generated (fallback for legacy flows)
        if (state.isEdlLoading && !state.edl) {
          return (
            <AsyncLoadingStep
              title="Generating Edit Decisions"
              subtitle="AI is analyzing your script and creating edit decisions..."
              steps={[
                "Loading project context",
                "Analyzing script & media",
                "Generating edit decisions",
                "Validating & finalizing",
              ]}
              taskId={state.edlTaskId}
              onComplete={async (output) => {
                console.log("[Wizard] EDL task complete, output:", output);
                let edl = (output as any)?.edl || null;
                let agentEdl = (output as any)?.agentEdl || null;

                // Fallback: if task output doesn't contain EDL, fetch from project metadata
                if (!edl && state.videoId) {
                  console.log("[Wizard] EDL not in task output, fetching from project metadata...");
                  try {
                    const res = await fetch(`/api/videos/${state.videoId}`);
                    if (res.ok) {
                      const data = await res.json();
                      edl = (data.video?.metadata as any)?.edl || null;
                      agentEdl = (data.video?.metadata as any)?.agentEdl || null;
                    }
                  } catch (err) {
                    console.warn("[Wizard] Failed to fetch EDL from metadata:", err);
                  }
                }

                edlTriggerRef.current = false;
                setState((prev) => ({
                  ...prev,
                  edl,
                  agentEdl,
                  isEdlLoading: false,
                  edlTaskId: null,
                }));
              }}
              onError={(error) => {
                console.warn("[Wizard] EDL task failed:", error);
                edlTriggerRef.current = false;
                setState((prev) => ({
                  ...prev,
                  isEdlLoading: false,
                  edlTaskId: null,
                }));
              }}
            />
          );
        }

        return (
          <EditorStep
            videoId={state.videoId!}
            projectId={projectId}
            audioUrl={null}
            audioChunks={state.audioChunks}
            shotList={state.shotList}
            generatedMedia={state.generatedMedia}
            edl={state.edl}
            agentEdl={state.agentEdl}
            isResuming={resumedAtEditorRef.current}
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
              advanceToStep(5);
            }}
            onBack={async () => {
              // Call reset-step API to revert current_stage and clean up DB
              if (state.videoId) {
                try {
                  await fetch(`/api/videos/${state.videoId}/reset-step`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ fromStep: 4, toStep: 3 }),
                  });
                } catch (err) {
                  console.error("[Wizard] Reset step 4→3 error:", err);
                }
              }
              // Clear local EDL + editor state
              updateState({
                edl: null,
                isEdlLoading: false,
                edlTaskId: null,
              });
              setMaxStepReached(3);
              goToStep(3);
            }}
            {...lock}
          />
        );

      case 5: // Export
        return (
          <ExportStep
            videoId={state.videoId!}
            projectId={projectId}
            onClose={async () => {
              if (state.videoId) {
                try {
                  await updateVideo(state.videoId, { status: "completed" });
                } catch (_err) {
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

  // All steps except Export (5) are full width
  const isFullWidthStep =
    currentStep === 1 ||
    currentStep === 2 ||
    currentStep === 3 ||
    currentStep === 4;

  return (
    <div className="flex flex-col h-full w-full mx-auto">
      {/* Progress indicator with navigation buttons */}
      <div className="flex-shrink-0 pt-2">
        <div className="flex items-center">
          <div className="flex-1">
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
        </div>
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
        resetWarning={
          confirmDialog?.direction === "prev"
            ? getResetWarning(currentStep)
            : null
        }
        isResetting={isResetting}
      />
    </div>
  );
}
