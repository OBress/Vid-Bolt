"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { WizardProgress } from "./WizardProgress";
import { StepNavigationConfirmDialog } from "./StepNavigationConfirmDialog";
import { GPUToggle } from "./GPUToggle";
import { VMStartupWarningDialog } from "./VMStartupWarningDialog";
import { useNavigationStore } from "@/store/use-navigation-store";
import { createClient } from "@/lib/supabase/client";
import { useGCPVM } from "@/hooks/use-gcp-vm";
// Legacy imports removed: Step4UniversalScript, StepMediaGeneration
import { Step1Outline } from "./steps/Step1Outline";
import { Step3Script } from "./steps/Step3Script";
import { Step4Audio } from "./steps/Step4Audio";
import { Step2StockMedia } from "./steps/Step2StockMedia";
import { Step5ShotCreation } from "./steps/Step5ShotCreation";
import { Step6SceneReview } from "./steps/Step6SceneReview";
import { Step7Editor } from "./steps/Step7Editor";
import { Step8Export } from "./steps/Step8Export";
import { PlaceholderStep } from "./steps/PlaceholderStep";
import { AsyncLoadingStep } from "./AsyncLoadingStep";
import { useVideos } from "@/hooks/use-videos";
import { Loader2 } from "lucide-react";
import type { VideoStage, VideoProject, GeneratedMedia } from "@/types/video";

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
  // Stock Media (Step 1→2 transition)
  isStockMediaLoading: boolean;
  stockMediaTaskId: string | null;
  stockMediaResults: any[] | null;
  // Universal script output (Step 3)
  scriptConfig: any; // Store script generation configuration
  universalScriptOutput: UniversalScriptOutput | null;
  scriptOutput: any | null; // Output from script-writing worker
  isScriptLoading: boolean; // Flag for auto-triggering script gen (Step 2→3)
  scriptTaskId: string | null; // Task ID for script generation
  // AV Script Part 1 (Step 4→5 transition)
  avScriptTaskId: string | null;
  avScriptPart1Output: any | null;
  isAvScriptLoading: boolean; // Flag to show loading immediately
  isAudioLoading: boolean; // Flag to show audio loading immediately (Step 3→4)
  // AV Script Part 2 + Media Generation (Step 5→6 transition)
  avScriptPart2TaskId: string | null;
  isMediaGenerating: boolean; // Flag to show media gen loading immediately
  // Step 6: Scene Review - generated media
  generatedMedia: GeneratedMedia[];
  generationError?: string | null;
  // GPU Generation Toggle (admin-only)
  gpuEnabled: boolean;
  // Asset Reference Image Generation (Step 4→5 transition, parallel with AV Script)
  assetImageTaskId: string | null;
  // Generated reference images for assets { assetId: imageUrl }
  assetReferenceImages: Record<string, string> | null;
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

  // GPU VM status for Step 4->5 transition warning
  const { displayStatus: vmDisplayStatus, startVM } = useGCPVM();
  const [showVMWarning, setShowVMWarning] = useState(false);
  const [isVMStarting, setIsVMStarting] = useState(false);
  // Track if user has confirmed VM warning to bypass re-check
  const vmWarningConfirmedRef = useRef(false);

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
    isStockMediaLoading: false,
    stockMediaTaskId: null,
    stockMediaResults: null,
    scriptConfig: null,
    universalScriptOutput: null,
    scriptOutput: null,
    isScriptLoading: false,
    scriptTaskId: null,
    avScriptTaskId: null,
    avScriptPart1Output: null,
    isAvScriptLoading: false,
    isAudioLoading: false,
    avScriptPart2TaskId: null,
    isMediaGenerating: false,
    generatedMedia: [],
    gpuEnabled: true, // Default: GPU enabled for full generation
    assetImageTaskId: null,
    assetReferenceImages: null,
  });

  // Step 3 ref for manual trigger
  const step3Ref = useRef<any>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      setCurrentVideoName(null);
    };
  }, [setCurrentVideoName]);

  // Admin status for GPU toggle visibility
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
          isStockMediaLoading: false,
          stockMediaTaskId: (video.metadata as any)?.stockMediaTaskId || null,
          stockMediaResults, // Use fetched stock media from database
          scriptConfig,
          universalScriptOutput,
          scriptOutput,
          isScriptLoading: false,
          scriptTaskId: null,
          avScriptTaskId: null,
          avScriptPart1Output: (video.metadata as any)?.av_script_part1 || null,
          isAvScriptLoading: false,
          isAudioLoading: false,
          avScriptPart2TaskId: null,
          isMediaGenerating: false,
          generatedMedia: (video.metadata as any)?.generatedMedia || [],
          gpuEnabled: true, // Default to enabled when loading video
          assetImageTaskId: (video.metadata as any)?.assetImageTaskId || null,
          assetReferenceImages:
            (video.metadata as any)?.assetReferenceImages || null,
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
        case 4: // Audio
          const chunkCount = state.audioChunks.length;
          return chunkCount > 0
            ? `Generated TTS audio files (${chunkCount} chunks)`
            : "Generated TTS audio files";
        case 5: // Shot Creation
          return "AV Script shot list and timing data";
        case 6: // Scene Review
          return "Generated scene images and videos";
        case 7: // Editor
          return "Editor timeline and settings";
        case 8: // Export
          return "Exported video file";
        default:
          return null;
      }
    },
    [state.audioChunks.length],
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

  // Handle VM startup confirmation when GPU is enabled but VM is OFF
  const handleVMConfirm = useCallback(async () => {
    setIsVMStarting(true);
    console.log("[Wizard] User confirmed, starting VM...");

    try {
      // Start the VM (fire and forget - don't wait for completion)
      startVM?.();

      // Close the warning dialog
      setShowVMWarning(false);
      setIsVMStarting(false);

      // Set flag to bypass VM check on re-trigger
      vmWarningConfirmedRef.current = true;

      // Trigger the navigation again - this time the code will skip VM check
      setConfirmDialog({ isOpen: true, direction: "next" });
    } catch (err) {
      console.error("[Wizard] Failed to start VM:", err);
      setIsVMStarting(false);
    }
  }, [startVM]);

  const handleConfirmNavigation = useCallback(async () => {
    if (!confirmDialog) return;

    // For NEXT navigation: Close dialog immediately (optimistic)
    // For PREV navigation: Keep dialog open during reset, close after
    if (confirmDialog.direction === "next") {
      setConfirmDialog(null);

      const nextStep = getNextStep(currentStep);

      if (nextStep > STEPS.length) {
        // Final step - trigger completion immediately, fire backend in background
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
              // Pass spine data for per-scene query generation
              spine: state.outlineOutput?.spine,
              expandedBeats: state.outlineOutput?.expandedBeats,
              // Map stockMediaLevel to mediaDensity
              // Images-only levels use images_only, video levels use minimal/heavy
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
      } else if (currentStep === 4 && state.audioChunks.length > 0) {
        // Step 4 → Step 5: Check GPU toggle and VM status

        // If GPU is disabled, skip VM check and proceed with AV Script only (placeholders)
        if (!state.gpuEnabled) {
          console.log("[Wizard] GPU disabled, proceeding with placeholders...");
          // Fall through to standard AV Script flow below
        } else if (vmDisplayStatus !== "ON" && !vmWarningConfirmedRef.current) {
          // GPU enabled but VM is OFF and user hasn't confirmed yet - show warning dialog
          console.log("[Wizard] VM not running, showing warning dialog");
          setShowVMWarning(true);
          return; // Exit early, will be called again from handleVMConfirm
        } else if (vmWarningConfirmedRef.current) {
          // User already confirmed VM startup, reset flag and proceed
          console.log(
            "[Wizard] VM warning confirmed, proceeding with VM startup in progress...",
          );
          vmWarningConfirmedRef.current = false;
        }

        // Proceed with AV Script (and optional GPU generation if enabled)
        if (state.videoId) {
          // Prepare data for background call
          // IMPORTANT: Apply cumulative time offset to word timestamps from each chunk
          // Each chunk's word timestamps start from 0, so we need to add the offset
          const sortedChunks = [...state.audioChunks].sort(
            (a: any, b: any) =>
              (a.chapterNumber || a.chunkIndex || 0) -
              (b.chapterNumber || b.chunkIndex || 0),
          );

          let timeOffset = 0;
          const wordTimestamps: Array<{
            word: string;
            start_seconds: number;
            end_seconds: number;
          }> = [];

          for (const chunk of sortedChunks) {
            const chunkData = chunk as any;
            const chunkTimestamps =
              chunkData.wordTimestamps || chunkData.word_timestamps || [];
            for (const wt of chunkTimestamps) {
              wordTimestamps.push({
                word: wt.word,
                start_seconds: wt.start_seconds + timeOffset,
                end_seconds: wt.end_seconds + timeOffset,
              });
            }
            // Add this chunk's duration to the offset for the next chunk
            timeOffset +=
              chunkData.duration_seconds || chunkData.durationSeconds || 0;
          }

          const totalDuration = sortedChunks.reduce(
            (sum, chunk) =>
              sum +
              ((chunk as any).duration_seconds ||
                (chunk as any).durationSeconds ||
                0),
            0,
          );

          console.log(
            `[Wizard] Prepared ${wordTimestamps.length} word timestamps spanning ${totalDuration.toFixed(1)}s`,
          );

          // Fire background API calls (non-blocking)
          console.log(
            "[Wizard] OPTIMISTIC: Navigating to Step 5, firing AV Script task in background...",
          );

          // Set loading flag IMMEDIATELY so Step 5 shows loading screen
          setState((prev) => ({
            ...prev,
            isAvScriptLoading: true,
          }));

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
              stockMediaLevel: state.outlineConfig?.stockMediaLevel || "none",
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
                // Clear loading on failure
                setState((prev) => ({
                  ...prev,
                  isAvScriptLoading: false,
                }));
              }
            })
            .catch((err) => {
              console.error(
                "[Wizard] Failed to trigger AV Script Part 1:",
                err,
              );
              // Clear loading on error
              setState((prev) => ({
                ...prev,
                isAvScriptLoading: false,
              }));
            });

          // PARALLEL: If GPU enabled, also trigger asset reference image generation
          if (state.gpuEnabled && state.outlineOutput?.assetRegistry) {
            const assetCount =
              (state.outlineOutput.assetRegistry.characters?.length || 0) +
              (state.outlineOutput.assetRegistry.locations?.length || 0) +
              (state.outlineOutput.assetRegistry.objects?.length || 0);

            if (assetCount > 0) {
              console.log(
                `[Wizard] GPU enabled, triggering asset reference image generation for ${assetCount} assets...`,
              );

              fetch("/api/process/asset-reference-images", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  videoId: state.videoId,
                  outlineAssets: state.outlineOutput.assetRegistry,
                }),
              })
                .then((response) => response.json())
                .then((data) => {
                  if (data.taskId) {
                    console.log(
                      "[Wizard] Asset reference image task created:",
                      data.taskId,
                    );
                    setState((prev) => ({
                      ...prev,
                      assetImageTaskId: data.taskId,
                    }));
                  } else {
                    console.error(
                      "[Wizard] Failed to create asset image task:",
                      data,
                    );
                  }
                })
                .catch((err) => {
                  console.error(
                    "[Wizard] Failed to trigger asset image generation:",
                    err,
                  );
                });
            } else {
              console.log(
                "[Wizard] No assets to generate reference images for",
              );
            }
          } else if (!state.gpuEnabled) {
            console.log(
              "[Wizard] GPU disabled, skipping asset reference image generation",
            );
          }
        }

        // OPTIMISTIC: Advance to step 5 immediately
        advanceToStep(5);
      } else if (
        currentStep === 5 &&
        state.avScriptPart1Output?.shots?.length > 0
      ) {
        // Step 5 → Step 6: OPTIMISTIC - Navigate immediately, start media generation in background
        // The media generation loading screen will appear because isMediaGenerating will be set

        if (state.videoId) {
          console.log(
            "[Wizard] OPTIMISTIC: Navigating to Step 6, firing AV Script Part 2 in background...",
          );

          // Set loading flag IMMEDIATELY so Step 6 shows loading screen
          setState((prev) => ({
            ...prev,
            isMediaGenerating: true,
          }));

          // Update stage in background
          fetch(`/api/videos/${state.videoId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ current_stage: "shot_creation" }),
          }).catch((err) =>
            console.error("[Wizard] Failed to update stage:", err),
          );

          // Trigger AV Script Part 2 (visual prompts + placeholder media) in background
          fetch("/api/process/av-script-part2", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              videoId: state.videoId,
              shots: state.avScriptPart1Output.shots,
              outlineAssets: state.outlineOutput?.assetRegistry || null,
            }),
          })
            .then((response) => response.json())
            .then((data) => {
              if (data.taskId) {
                console.log(
                  "[Wizard] AV Script Part 2 task created:",
                  data.taskId,
                );
                setState((prev) => ({
                  ...prev,
                  avScriptPart2TaskId: data.taskId,
                }));
              } else {
                console.error(
                  "[Wizard] Failed to create AV Script Part 2 task:",
                  data,
                );
                // Clear loading on failure
                setState((prev) => ({
                  ...prev,
                  isMediaGenerating: false,
                }));
              }
            })
            .catch((err) => {
              console.error(
                "[Wizard] Failed to trigger AV Script Part 2:",
                err,
              );
              // Clear loading on error
              setState((prev) => ({
                ...prev,
                isMediaGenerating: false,
              }));
            });
        }

        // OPTIMISTIC: Advance to step 6 immediately
        advanceToStep(6);
      } else {
        // Default: advance immediately
        advanceToStep(nextStep);
      }
    } else {
      // PREV navigation - call reset API then navigate
      const prevStep = getPrevStep(currentStep);

      // If we have a videoId, call the reset API
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

          const data = await response.json();

          if (!response.ok) {
            console.error("[Wizard] Reset step failed:", data.error);
            // Still allow navigation even if reset fails
          } else {
            console.log(
              `[Wizard] Reset step ${currentStep} -> ${prevStep}:`,
              data,
            );

            // Clear local state based on what was reset
            const stateUpdates: Partial<WizardState> = {};

            switch (currentStep) {
              case 3: // Script
                stateUpdates.script = "";
                stateUpdates.scriptOutput = null;
                break;
              case 4: // Audio
                stateUpdates.audioUrl = null;
                stateUpdates.audioChunks = [];
                stateUpdates.audioTaskId = null;
                stateUpdates.isAudioLoading = false;
                break;
              case 5: // Shot Creation
                stateUpdates.shotList = [];
                stateUpdates.avScriptTaskId = null;
                stateUpdates.avScriptPart1Output = null;
                stateUpdates.isAvScriptLoading = false;
                break;
            }

            if (Object.keys(stateUpdates).length > 0) {
              updateState(stateUpdates);
            }
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
      setMaxStepReached(prevStep); // Reset max step to match navigation target
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
                // OPTIMISTIC: Set loading flag and navigate immediately (matching Step 2 -> 3 pattern)
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
                      // Pass spine data for per-scene query generation
                      spine: outlineOutput?.spine,
                      expandedBeats: (outlineOutput as any)?.expandedBeats,
                      // Map stockMediaLevel to mediaDensity
                      // Images-only levels use images_only, video levels use minimal/heavy
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
            onComplete={async (script, scriptOutput) => {
              // Set loading flag and navigate immediately for snappy UX
              updateState({
                script,
                scriptOutput,
                isAudioLoading: true,
              });

              // Navigate to Step 4 immediately (loading screen will wait for taskId)
              advanceToStep(4);

              // Now fetch the taskId in the background
              if (state.videoId) {
                console.log(
                  "[Wizard] Starting audio: saving script and creating task...",
                );

                try {
                  // First, persist script to database
                  await fetch(`/api/videos/${state.videoId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      script_content: script,
                      current_stage: "audio",
                      metadata: {
                        scriptOutput,
                      },
                    }),
                  });

                  // Trigger audio generation workflow and wait for taskId
                  const response = await fetch(
                    `/api/videos/${state.videoId}/resume`,
                    {
                      method: "POST",
                    },
                  );
                  const data = await response.json();

                  if (data.taskId) {
                    console.log("[Wizard] Audio task created:", data.taskId);
                    // Set taskId - AsyncLoadingStep will pick it up and start polling
                    setState((prev) => ({
                      ...prev,
                      audioTaskId: data.taskId,
                    }));
                  } else {
                    console.error("[Wizard] No taskId in response:", data);
                    setState((prev) => ({
                      ...prev,
                      isAudioLoading: false,
                      generationError:
                        data.error || "Failed to start audio generation",
                    }));
                  }
                } catch (err) {
                  console.error(
                    "[Wizard] Failed to save script or start audio:",
                    err,
                  );
                  setState((prev) => ({
                    ...prev,
                    isAudioLoading: false,
                    generationError:
                      "Failed to start audio generation. Please try again.",
                  }));
                }
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

        // If we have audio chunks, show the editor/review screen
        if (state.audioChunks.length > 0) {
          return (
            <Step4Audio
              videoId={state.videoId!}
              audioChunks={state.audioChunks}
              audioUrl={state.audioUrl}
              onUpdateChunks={(newChunks) =>
                updateState({ audioChunks: newChunks })
              }
              onComplete={async () => {
                // This path is for internal button - use global nav for loading screen
                // Just advance to step 5, the isAvScriptLoading check will handle the rest
                advanceToStep(5);
              }}
              onBack={() => {
                // If they want to go back to script
                goToStep(3);
              }}
            />
          );
        }

        // Show loading screen while audio is being generated
        // Check both isAudioLoading (immediate flag) and audioTaskId (task in progress)
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
                    isAudioLoading: false,
                    generationError:
                      "Audio generation completed but produced no audio. This usually happens if the script was too short or the AI service timed out. Please try regenerating.",
                  }));
                  return;
                }
              }

              // Update state with audio chunks and clear loading flag
              console.log(
                "[Wizard] Audio generation complete. chunks:",
                audioChunks.length,
              );

              updateState({
                audioUrl,
                audioChunks,
                shotList: [],
                avScript: [],
                audioTaskId: null,
                isAudioLoading: false,
              });
            }}
            onError={(error) => {
              console.error("Audio generation failed:", error);
              setState((prev) => ({
                ...prev,
                audioTaskId: null,
                isAudioLoading: false,
                generationError: `Audio generation failed: ${error}`,
              }));
            }}
            fallbackDuration={8000}
          />
        );

      case 5: // Shot Creation (was Step 6)
        // Show loading screen while AV Script is being generated
        if (
          (state.isAvScriptLoading || state.avScriptTaskId) &&
          !state.avScriptPart1Output
        ) {
          console.log("[Wizard] Step 5: Showing AV Script loading screen");
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
                console.log(
                  "[Wizard] AV Script Part 1 complete - raw output:",
                  JSON.stringify(output).slice(0, 500),
                );
                console.log(
                  "[Wizard] AV Script Part 1 - shots array exists?",
                  !!(output as any)?.shots,
                );
                console.log(
                  "[Wizard] AV Script Part 1 - shots count:",
                  (output as any)?.shots?.length || 0,
                );
                const avOutput = output as any;

                // Update state with AV script output and clear loading flag
                updateState({
                  avScriptPart1Output: avOutput,
                  avScriptTaskId: null,
                  isAvScriptLoading: false,
                });
              }}
              onError={(error) => {
                console.error("[Wizard] AV Script Part 1 failed:", error);
                updateState({
                  avScriptTaskId: null,
                  isAvScriptLoading: false,
                  generationError: `Shot breakdown failed: ${error}`,
                });
              }}
              fallbackDuration={15000}
            />
          );
        }

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
            audioChunks={state.audioChunks}
            script={state.script}
            stockMediaResults={state.stockMediaResults}
            assetReferenceImages={state.assetReferenceImages}
            onUpdateShots={async (updatedShots) => {
              console.log("[Wizard] Updating shots:", updatedShots.length);

              // 1. Update local state immediately
              const currentOutput = state.avScriptPart1Output || {
                shots: [],
                metadata: {},
              };
              const updatedOutput = {
                ...currentOutput,
                shots: updatedShots,
                metadata: {
                  ...currentOutput.metadata,
                  total_segments: updatedShots.length,
                  total_duration_seconds: updatedShots.reduce(
                    (acc, s) => acc + s.duration_seconds,
                    0,
                  ),
                },
              };

              // Update the state using any cast to avoid strict type issues with differing local/global types
              updateState({
                avScriptPart1Output: updatedOutput as any,
              });

              // 2. Persist to Database
              if (state.videoId) {
                try {
                  await fetch(`/api/videos/${state.videoId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      metadata: {
                        av_script_part1: updatedOutput,
                      },
                    }),
                  });
                  console.log("[Wizard] Persisted updated shots to DB");
                } catch (err) {
                  console.error("Failed to save updated shots to DB:", err);
                  // Optionally resort to previous state or show error
                }
              }
            }}
            {...lock}
          />
        );

      case 6: // Scene Review (was Step 7)
        // Show loading screen while media is being generated
        if (
          (state.isMediaGenerating || state.avScriptPart2TaskId) &&
          (!state.generatedMedia || state.generatedMedia.length === 0)
        ) {
          console.log(
            "[Wizard] Step 6: Showing media generation loading screen",
          );
          return (
            <AsyncLoadingStep
              title="Generating Scene Media"
              subtitle="Creating visuals for each shot..."
              steps={[
                "Generating visual prompts",
                "Processing images",
                "Processing videos",
                "Finalizing media",
              ]}
              taskId={state.avScriptPart2TaskId}
              onComplete={async (output) => {
                console.log("[Wizard] AV Script Part 2 complete:", output);
                const mediaOutput = output as any;

                // Extract generated media from output
                const generatedMedia = mediaOutput?.generatedMedia || [];

                // Update state with generated media and clear loading flags
                updateState({
                  generatedMedia,
                  avScriptPart2TaskId: null,
                  isMediaGenerating: false,
                });
              }}
              onError={(error) => {
                console.error("[Wizard] AV Script Part 2 failed:", error);
                updateState({
                  avScriptPart2TaskId: null,
                  isMediaGenerating: false,
                  generationError: `Media generation failed: ${error}`,
                });
              }}
              fallbackDuration={20000}
            />
          );
        }

        return (
          <Step6SceneReview
            videoId={state.videoId!}
            projectId={projectId}
            shots={state.avScriptPart1Output?.shots || []}
            outlineAssets={state.outlineOutput?.assetRegistry}
            generatedMedia={state.generatedMedia}
            onUpdateMedia={async (media) => {
              console.log("[Wizard] Updating generated media:", media.length);
              updateState({ generatedMedia: media });

              // Persist to database
              if (state.videoId) {
                try {
                  await fetch(`/api/videos/${state.videoId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      metadata: {
                        generatedMedia: media,
                      },
                    }),
                  });
                  console.log("[Wizard] Persisted generated media to DB");
                } catch (err) {
                  console.error("Failed to save generated media:", err);
                }
              }
            }}
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
          <Step7Editor
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
          <Step8Export
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
          {/* Admin GPU Toggle - positioned after Step 8 */}
          <div className="flex-shrink-0 pr-6">
            <GPUToggle
              enabled={state.gpuEnabled}
              onToggle={(enabled) =>
                setState((prev) => ({ ...prev, gpuEnabled: enabled }))
              }
              disabled={currentStep >= 5} // Lock after Step 4
              isAdmin={isAdmin}
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

      {/* VM Startup Warning Dialog */}
      <VMStartupWarningDialog
        isOpen={showVMWarning}
        onClose={() => setShowVMWarning(false)}
        onConfirm={handleVMConfirm}
        isLoading={isVMStarting}
      />
    </div>
  );
}
