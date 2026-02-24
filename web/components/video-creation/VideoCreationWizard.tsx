"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { WizardProgress } from "./WizardProgress";
import { StepNavigationConfirmDialog } from "./StepNavigationConfirmDialog";
import { useNavigationStore } from "@/store/use-navigation-store";
import { createClient } from "@/lib/supabase/client";
import { Step1Outline } from "./steps/Step1Outline";
import { Step3Script } from "./steps/Step3Script";
import { Step2StockMedia } from "./steps/Step2StockMedia";
import { Step7Editor } from "./steps/Step7Editor";
import { Step8Export } from "./steps/Step8Export";
import { AsyncLoadingStep } from "./AsyncLoadingStep";
import { useVideos } from "@/hooks/use-videos";
import { Loader2 } from "lucide-react";
import type { VideoStage, VideoProject } from "@/types/video";
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
  // Stock Media (Step 1→2 transition)
  isStockMediaLoading: boolean;
  stockMediaTaskId: string | null;
  stockMediaResults: any[] | null;
  // Script output (Step 3)
  scriptConfig: any; // Store script generation configuration
  scriptOutput: any | null; // Output from script-writing worker
  isScriptLoading: boolean; // Flag for auto-triggering script gen (Step 2→3)
  scriptTaskId: string | null; // Task ID for script generation
  // Edit Decision List (Step 3 → Step 4 transition)
  edl: EditDecisionList | null;
  agentEdl: any | null; // EditorAgentEDL v2 format
  edlTaskId: string | null;
  isEdlLoading: boolean;
}

// Step configuration for the wizard - 5 steps
const STEPS = [
  { id: 1, label: "Outline", type: "outline" },
  { id: 2, label: "Stock Media", type: "stock" },
  { id: 3, label: "Script", type: "script" },
  { id: 4, label: "Editor", type: "editor" },
  { id: 5, label: "Export", type: "final" },
] as const;

// Helper function to map video stage to wizard step number
function stageToStepNumber(stage: VideoStage): number {
  const stageMapping: Record<VideoStage, number> = {
    idea: 1, // Legacy -> Step 1
    outline: 1, // Step 1
    stock: 2, // Step 2
    script: 3, // Step 3
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
    isStockMediaLoading: false,
    stockMediaTaskId: null,
    stockMediaResults: null,
    scriptConfig: null,
    scriptOutput: null,
    isScriptLoading: false,
    scriptTaskId: null,
    edl: null,
    agentEdl: null,
    edlTaskId: null,
    isEdlLoading: false,
  });

  // Step 3 ref for manual trigger
  const step3Ref = useRef<any>(null);

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
  // Track if we resumed at step 4 (editor) so Step7Editor can skip its import animation
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

        // Fetch stock media from database for this video
        let stockMediaResults: any[] | null = null;
        try {
          const stockRes = await fetch(
            `/api/stock-media/by-video?videoId=${video.id}`,
          );
          if (stockRes.ok) {
            const stockData = await stockRes.json();
            stockMediaResults = stockData.stockMedia || null;
            console.log(
              `[Wizard] Loaded ${stockMediaResults?.length || 0} stock media items`,
            );
          }
        } catch (err) {
          console.error("[Wizard] Failed to fetch stock media:", err);
        }

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
          isStockMediaLoading: false,
          stockMediaTaskId: (video.metadata as any)?.stockMediaTaskId || null,
          stockMediaResults,
          scriptConfig,
          scriptOutput,
          isScriptLoading: false,
          scriptTaskId: null,
          edl: (video.metadata as any)?.edl || null,
          agentEdl: (video.metadata as any)?.agentEdl || null,
          edlTaskId: null,
          isEdlLoading: false,
        });

        // =====================================================================
        // RESTORE IN-PROGRESS LOADING STATES FROM ACTIVE TASKS
        // =====================================================================
        const activeTasks = data.activeTasks || [];
        if (activeTasks.length > 0) {
          const loadingUpdates: Partial<WizardState> = {};

          const metadataStockTaskId = (video.metadata as any)?.stockMediaTaskId;

          for (const task of activeTasks) {
            switch (task.type) {
              case "script_writing":
                loadingUpdates.isScriptLoading = true;
                loadingUpdates.scriptTaskId = task.id;
                console.log(`[Wizard] Restoring active script task: ${task.id}`);
                break;
              case "video":
                if (metadataStockTaskId && task.id === metadataStockTaskId) {
                  loadingUpdates.isStockMediaLoading = true;
                  loadingUpdates.stockMediaTaskId = task.id;
                  console.log(`[Wizard] Restoring active stock media task: ${task.id}`);
                }
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
        case 2: // Stock Media
          return true; // Always completable (optional step)
        case 3: // Script
          return !!state.scriptOutput || !!state.script;
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
        case 2: // Stock Media
          return null; // No persistent data to reset
        case 3: // Script
          return "Your generated script content";
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
      } else if (
        currentStep === 1 &&
        state.outlineOutput &&
        state.outlineConfig?.stockMediaLevel !== "none"
      ) {
        // Step 1 → Step 2: OPTIMISTIC - Navigate immediately, start stock media scraping in background
        console.log(
          "[Wizard] OPTIMISTIC: Navigating to Step 2, firing stock media scraping...",
        );

        setState((prev) => ({
          ...prev,
          isStockMediaLoading: true,
          stockMediaResults: null,
        }));
        advanceToStep(2);

        // Fire stock media scraping in background
        if (state.videoId) {
          fetch("/api/stock-media/batch-scrape", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              videoId: state.videoId,
              level: state.outlineConfig?.stockMediaLevel?.includes("extensive")
                ? "extensive"
                : "standard",
              outlineAssets: state.outlineOutput?.assetRegistry,
              topic: state.outlineConfig?.topic,
              spine: state.outlineOutput?.spine,
              expandedBeats: state.outlineOutput?.expandedBeats,
              mediaDensity: (() => {
                const level = state.outlineConfig?.stockMediaLevel;
                switch (level) {
                  case "none":
                    return "none";
                  case "standard_images":
                    return "images_only";
                  case "extensive_images":
                    return "images_only";
                  case "standard_images_video":
                    return "images_minimal_video";
                  case "extensive_images_video":
                    return "images_heavy_video";
                  default:
                    return "images_only";
                }
              })(),
            }),
          })
            .then((res) => res.json())
            .then((data) => {
              if (data.taskId) {
                console.log("[Wizard] Stock media task created:", data.taskId);
                setState((prev) => ({
                  ...prev,
                  stockMediaTaskId: data.taskId,
                }));
              } else {
                console.error(
                  "[Wizard] Failed to create stock media task:",
                  data,
                );
                setState((prev) => ({
                  ...prev,
                  isStockMediaLoading: false,
                }));
              }
            })
            .catch((err) => {
              console.error("[Wizard] Stock media scraping failed:", err);
              setState((prev) => ({
                ...prev,
                isStockMediaLoading: false,
              }));
            });
        }
      } else if (
        currentStep === 1 &&
        state.outlineConfig?.stockMediaLevel === "none"
      ) {
        // Step 1 → Step 3: Skip Step 2 when stock media is disabled
        advanceToStep(3);
      } else if (currentStep === 2) {
        // Step 2 → Step 3: OPTIMISTIC - Navigate immediately, start script generation in background
        console.log(
          "[Wizard] OPTIMISTIC: Navigating to Step 3, firing script generation...",
        );

        setState((prev) => ({
          ...prev,
          isScriptLoading: true,
        }));
        advanceToStep(3);

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
      } else if (currentStep === 3 && step3Ref.current) {
        // Step 3 → 4: Trigger script completion (which handles its own optimistic navigation)
        step3Ref.current.handleConfirm();
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
            case 3: // Script
              stateUpdates.script = "";
              stateUpdates.scriptOutput = null;
              stateUpdates.scriptTaskId = null;
              stateUpdates.isScriptLoading = false;
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

  // =========================================================================
  // AUTO-TRIGGER EDL GENERATION ON ENTERING STEP 4 (EDITOR)
  // =========================================================================
  const edlTriggerRef = useRef(false);
  useEffect(() => {
    if (
      currentStep === 4 &&
      !state.edl &&
      !state.isEdlLoading &&
      !edlTriggerRef.current &&
      state.videoId
    ) {
      edlTriggerRef.current = true;
      console.log("[Wizard] Auto-triggering EDL generation for Step 4 (Editor)...");
      setState((prev) => ({ ...prev, isEdlLoading: true }));

      fetch("/api/process/edit-assembly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: state.videoId }),
      })
        .then((res) => {
          if (res.ok) return res.json();
          throw new Error(`EDL trigger failed: ${res.status}`);
        })
        .then(({ taskId }) => {
          setState((prev) => ({ ...prev, edlTaskId: taskId }));
          console.log("[Wizard] EDL task created:", taskId);
        })
        .catch((err) => {
          console.warn("[Wizard] EDL trigger error:", err);
          edlTriggerRef.current = false;
          setState((prev) => ({ ...prev, isEdlLoading: false }));
        });
    }
  }, [currentStep, state.edl, state.isEdlLoading, state.videoId]);

  // Render the appropriate step content
  const renderStep = () => {
    const lock = getLockState(currentStep);

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
                console.log(
                  "[Wizard] OPTIMISTIC: Stock media disabled, skipping to Step 3 with script generation...",
                );
                setState((prev) => ({
                  ...prev,
                  isScriptLoading: true,
                }));
                advanceToStep(3);

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
              } else {
                // OPTIMISTIC: Set loading and navigate immediately
                console.log(
                  "[Wizard] OPTIMISTIC: Navigating to Step 2, firing stock media scraping...",
                );
                setState((prev) => ({
                  ...prev,
                  isStockMediaLoading: true,
                  stockMediaResults: null,
                }));
                advanceToStep(2);

                // Fire stock media scraping in background
                if (state.videoId) {
                  fetch("/api/stock-media/batch-scrape", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      videoId: state.videoId,
                      level: config?.stockMediaLevel?.includes("extensive")
                        ? "extensive"
                        : "standard",
                      outlineAssets: outlineOutput?.assetRegistry,
                      topic: config?.topic,
                      spine: outlineOutput?.spine,
                      expandedBeats: (outlineOutput as any)?.expandedBeats,
                      mediaDensity: (() => {
                        const level = config?.stockMediaLevel;
                        switch (level) {
                          case "none":
                            return "none";
                          case "standard_images":
                            return "images_only";
                          case "extensive_images":
                            return "images_only";
                          case "standard_images_video":
                            return "images_minimal_video";
                          case "extensive_images_video":
                            return "images_heavy_video";
                          default:
                            return "images_only";
                        }
                      })(),
                    }),
                  })
                    .then((res) => res.json())
                    .then((data) => {
                      if (data.taskId) {
                        console.log(
                          "[Wizard] Stock media task created:",
                          data.taskId,
                        );
                        setState((prev) => ({
                          ...prev,
                          stockMediaTaskId: data.taskId,
                        }));
                      } else {
                        console.error(
                          "[Wizard] Failed to create stock media task:",
                          data,
                        );
                        setState((prev) => ({
                          ...prev,
                          isStockMediaLoading: false,
                        }));
                      }
                    })
                    .catch((err) => {
                      console.error(
                        "[Wizard] Stock media scraping failed:",
                        err,
                      );
                      setState((prev) => ({
                        ...prev,
                        isStockMediaLoading: false,
                      }));
                    });
                }
              }
            }}
            onBack={onBack}
            {...lock}
          />
        );
      case 2:
        return (
          <Step2StockMedia
            videoId={state.videoId!}
            isLoading={state.isStockMediaLoading}
            taskId={state.stockMediaTaskId}
            initialMedia={state.stockMediaResults || []}
            stockMediaLevel={
              state.outlineConfig?.stockMediaLevel || "standard_images"
            }
            onMediaLoaded={(results) => {
              setState((prev) => ({
                ...prev,
                stockMediaResults: results,
                isStockMediaLoading: false,
              }));
            }}
            onNext={async () => {
              // OPTIMISTIC: Set loading flag and navigate immediately
              console.log(
                "[Wizard] OPTIMISTIC: Navigating to Step 3, firing script generation...",
              );
              setState((prev) => ({
                ...prev,
                isScriptLoading: true,
              }));
              advanceToStep(3);

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
              // Save script and navigate to Editor (Step 4)
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
                      current_stage: "video",
                      metadata: {
                        scriptOutput,
                      },
                    }),
                  });
                } catch (err) {
                  console.error("Failed to save script:", err);
                }

                // Trigger EDL generation in background
                console.log(
                  "[Wizard] OPTIMISTIC: Navigating to Step 4 (Editor), firing EDL generation...",
                );
                setState((prev) => ({ ...prev, isEdlLoading: true }));

                try {
                  const edlRes = await fetch("/api/process/edit-assembly", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ videoId: state.videoId }),
                  });
                  if (edlRes.ok) {
                    const { taskId } = await edlRes.json();
                    setState((prev) => ({ ...prev, edlTaskId: taskId }));
                    console.log("[Wizard] EDL task created:", taskId);
                  } else {
                    console.warn("[Wizard] EDL trigger failed, continuing without EDL");
                    setState((prev) => ({ ...prev, isEdlLoading: false }));
                  }
                } catch (edlErr) {
                  console.warn("[Wizard] EDL trigger error:", edlErr);
                  setState((prev) => ({ ...prev, isEdlLoading: false }));
                }
              }

              advanceToStep(4);
            }}
            onBack={() => {
              if (state.outlineConfig?.stockMediaLevel === "none") {
                goToStep(1);
              } else {
                goToStep(2);
              }
            }}
            {...lock}
          />
        );

      case 4: // Editor
        // Show loading screen while EDL is being generated
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
          <Step7Editor
            videoId={state.videoId!}
            projectId={projectId}
            audioUrl={null}
            audioChunks={[]}
            shotList={[]}
            generatedMedia={[]}
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
          <Step8Export
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
