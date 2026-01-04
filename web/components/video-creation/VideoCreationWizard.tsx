"use client";

import { useState, useCallback, useEffect } from "react";
import { WizardProgress } from "./WizardProgress";
import { useNavigationStore } from "@/store/use-navigation-store";
import { Step4UniversalScript } from "./steps/Step4UniversalScript";
import { Step2Audio } from "./steps/Step2Audio";
import { StepEditor } from "./steps/StepEditor";
import { StepExport } from "./steps/StepExport";
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
  // Universal script output
  scriptConfig: any; // Store script generation configuration
  universalScriptOutput: UniversalScriptOutput | null;
  generationError?: string | null;
}

// Step configuration for the wizard - 4 steps
const STEPS = [
  { id: 1, label: "Script", type: "script" }, // Universal script generation
  { id: 2, label: "Media", type: "loading" }, // Audio generation
  { id: 3, label: "Editor", type: "editor" }, // Video editor
  { id: 4, label: "Export", type: "final" }, // Export
] as const;

// Helper function to map video stage to wizard step number
function stageToStepNumber(stage: VideoStage): number {
  const stageMapping: Record<VideoStage, number> = {
    idea: 1, // Step 1: Script
    script: 1, // Step 1: Script
    audio: 2, // Step 2: Audio Review (was 3)
    video: 3, // Step 3: Editor (was 4)
    export: 4, // Step 4: Export
    completed: 4, // Step 4: Export (if completed, show export)
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
    scriptConfig: null,
    universalScriptOutput: null,
  });

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
          JSON.stringify(rawAudioChunks, null, 2)
        );

        const normalizedAudioChunks = rawAudioChunks.map((c: any) => ({
          ...c,
          chapterNumber: c.chapterNumber ?? c.chunkIndex,
        }));

        console.log(
          "[Wizard DEBUG] normalizedAudioChunks:",
          JSON.stringify(normalizedAudioChunks, null, 2)
        );

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
          audioTaskId: video.audio_task_id || null, // FIX: Load the audio task ID
          scriptConfig,
          universalScriptOutput,
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
          `Resumed video at step ${targetStep} (stage: ${video.current_stage})`
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

  // Render the appropriate step content
  const renderStep = () => {
    const lock = getLockState(currentStep);

    console.log(
      `[Wizard Render] Step: ${currentStep}, AudioChunks: ${
        state.audioChunks.length
      }, Error: ${state.generationError ? "YES" : "NO"}`
    );

    switch (currentStep) {
      case 1:
        // Step 1: Universal Script Generation
        return (
          <Step4UniversalScript
            videoId={state.videoId!}
            projectId={projectId}
            initialTopic={state.prompt}
            initialOutput={state.universalScriptOutput}
            initialConfig={state.scriptConfig}
            onSave={async (scriptOutput, config) => {
              // Extract script from expanded beats or final script
              const script = scriptOutput.expandedBeats
                ? scriptOutput.expandedBeats
                    .map((b) => b.narration)
                    .join("\n\n")
                : scriptOutput.finalScript || "";

              // Update local state
              updateState({
                script,
                universalScriptOutput: scriptOutput,
                scriptConfig: config,
              });

              // Persist to database (Auto-save)
              if (state.videoId) {
                try {
                  console.log("[Wizard] Auto-saving script data...");
                  await fetch(`/api/videos/${state.videoId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      script_content: script,
                      // Don't change stage, keep at 'script' or 'idea' until confirmed
                      metadata: {
                        universalScriptOutput: scriptOutput,
                        scriptConfig: config,
                      },
                    }),
                  });
                  console.log("[Wizard] Auto-save complete");
                } catch (err) {
                  console.error("Failed to auto-save script:", err);
                }
              }
            }}
            onComplete={async (scriptOutput, config) => {
              // Extract script
              const script = scriptOutput.expandedBeats
                ? scriptOutput.expandedBeats
                    .map((b) => b.narration)
                    .join("\n\n")
                : scriptOutput.finalScript || "";

              // Save the script and update state
              updateState({
                script,
                universalScriptOutput: scriptOutput,
                scriptConfig: config,
              });

              // Persist to database (Final confirm)
              if (state.videoId) {
                try {
                  await fetch(`/api/videos/${state.videoId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      script_content: script,
                      current_stage: "audio",
                      metadata: {
                        universalScriptOutput: scriptOutput,
                        scriptConfig: config,
                      },
                    }),
                  });

                  // Trigger audio generation workflow via resume API
                  const response = await fetch(
                    `/api/videos/${state.videoId}/resume`,
                    { method: "POST" }
                  );
                  const data = await response.json();

                  if (data.taskId) {
                    setState((prev) => ({ ...prev, audioTaskId: data.taskId }));
                    await new Promise((resolve) => setTimeout(resolve, 50));
                  }
                } catch (err) {
                  console.error("Failed to save script or start audio:", err);
                }
              }

              advanceToStep(2);
            }}
            onBack={onBack}
            {...lock}
          />
        );

      case 2: // Step 2: Media Generation (Audio + AV)
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
                    goToStep(1);
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
                      body: JSON.stringify({ current_stage: "video" }),
                    });
                  } catch (err) {
                    console.error("Failed to save step:", err);
                  }
                }
                // Proceed to Video Editor
                advanceToStep(3);
              }}
              onBack={() => {
                // If they want to go back to script
                goToStep(1);
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
                      `/api/videos/${state.videoId}`
                    );
                    const data = await response.json();
                    if (data.audioChunks && data.audioChunks.length > 0) {
                      audioChunks = data.audioChunks.map((c: any) => ({
                        ...c,
                        chapterNumber: c.chapterNumber ?? c.chunkIndex,
                      }));
                      console.log(
                        "[Wizard] Recovered audio chunks from metadata"
                      );
                    }
                  } catch (e) {
                    console.error("[Wizard] Failed to recover audio chunks", e);
                  }
                }

                // Double check after recovery attempt
                if (audioChunks.length === 0) {
                  console.error(
                    "[Wizard] Audio generation completed with 0 chunks."
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
                audioChunks.length
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

      case 3:
        // Step 3: Video Editor
        return (
          <StepEditor
            videoId={state.videoId!}
            projectId={projectId}
            audioUrl={state.audioUrl}
            audioChunks={state.audioChunks}
            shotList={state.shotList}
            onContinue={async () => {
              // Persist the step navigation to the database
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
              advanceToStep(4);
            }}
            onBack={() => goToStep(1)}
            {...lock}
          />
        );

      case 4:
        // Step 4: Export
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
                    body: JSON.stringify({ current_stage: "audio" }),
                  });
                } catch (err) {
                  console.error("Failed to save step:", err);
                }
              }
              goToStep(3);
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

  // Check if current step needs full width (Script and Editor)
  const isFullWidthStep = currentStep === 1 || currentStep === 3;

  return (
    <div
      className={`flex flex-col h-full w-full ${
        isFullWidthStep ? "" : "max-w-5xl"
      } mx-auto`}
    >
      {/* Progress indicator with back button */}
      <div className="flex-shrink-0 pt-2">
        <WizardProgress
          steps={STEPS}
          currentStep={currentStep}
          maxStepReached={maxStepReached}
          onBack={onBack}
          onStepClick={goToStep}
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
        <div className="flex-1 overflow-hidden">{renderStep()}</div>
      ) : (
        <div className="flex-1 overflow-hidden">
          <div className="flex items-center justify-center h-full p-6">
            <div className="w-full max-w-3xl">{renderStep()}</div>
          </div>
        </div>
      )}
    </div>
  );
}
