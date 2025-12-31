"use client";

import { useState, useCallback, useEffect } from "react";
import { WizardProgress } from "./WizardProgress";
import { useNavigationStore } from "@/store/use-navigation-store";
import { Step1PromptInput } from "./steps/Step1PromptInput";
import { Step2IdeaReview } from "./steps/Step2IdeaReview";
import { Step3ScriptReview } from "./steps/Step3ScriptReview";
import { Step4AVVerification } from "./steps/Step4AVVerification";
import { StepEditor } from "./steps/StepEditor";
import { StepExport } from "./steps/StepExport";
import { LoadingStep } from "./LoadingStep";
import { AsyncLoadingStep } from "./AsyncLoadingStep";
import { useVideos } from "@/hooks/use-videos";
import { Loader2 } from "lucide-react";
import type { WritingTaskOutput } from "@/types/task";
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
}

// Step configuration for the wizard - 10 steps
const STEPS = [
  { id: 1, label: "Idea", type: "input" },
  { id: 2, label: "Expand", type: "loading" },
  { id: 3, label: "Review", type: "review" },
  { id: 4, label: "Script", type: "loading" },
  { id: 5, label: "Edit", type: "review" },
  { id: 6, label: "Media", type: "loading" },
  { id: 7, label: "Editor", type: "editor" }, // Video editor with auto-placed audio
  { id: 8, label: "Export", type: "final" },
] as const;

// Helper function to map video stage to wizard step number
function stageToStepNumber(stage: VideoStage): number {
  const stageMapping: Record<VideoStage, number> = {
    idea: 1, // Step 1: Idea input
    script: 5, // Step 5: Script edit/review (after writing is done)
    audio: 7, // Step 7: Editor (after audio is done)
    video: 8, // Step 8: Export (skip generate/fine-tune)
    export: 8, // Step 8: Export
    completed: 8, // Step 8: Export (if completed, show export)
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
        setState({
          prompt: video.idea || "",
          expandedIdea: expandedIdea,
          script: video.script_content || "",
          audioUrl: video.audio_url || null,
          audioChunks: data.audioChunks || [],
          shotList: shotList,
          avScript: (video.metadata as any)?.avScript || [],
          videoId: video.id,
          expandTaskId: null,
          writeTaskId: null,
          audioTaskId: null,
        });

        // Set the video name in the navigation store
        setCurrentVideoName(video.name);

        // Set the current step and max reached step
        // For resumed videos, maxStepReached should be at least the target step
        setCurrentStep(targetStep);
        setMaxStepReached(targetStep);

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

    switch (currentStep) {
      case 1:
        return (
          <Step1PromptInput
            value={state.prompt}
            onChange={(prompt) => updateState({ prompt })}
            onSubmit={async () => {
              console.log("Step1 onSubmit: Updating video idea");

              if (!state.videoId) {
                console.error("No videoId found in state!");
                return;
              }

              setIsSaving(true);
              try {
                // Update video with idea
                await updateVideo(state.videoId, {
                  idea: state.prompt,
                  current_stage: "idea",
                });

                // Trigger idea expansion workflow
                const response = await fetch(
                  `/api/videos/${state.videoId}/expand`,
                  {
                    method: "POST",
                  }
                );
                const data = await response.json();

                if (!response.ok) {
                  throw new Error(
                    data.error || "Failed to start idea expansion"
                  );
                }

                // Store task ID and advance with delay to ensure state is set
                if (data.taskId) {
                  setState((prev) => ({ ...prev, expandTaskId: data.taskId }));
                  await new Promise((resolve) => setTimeout(resolve, 50));
                }
                advanceToStep(2);
              } catch (err) {
                console.error("Failed to start expansion:", err);
                // Still advance but without task ID (will use fallback)
                setState((prev) => ({ ...prev, expandTaskId: null }));
                advanceToStep(2);
              } finally {
                setIsSaving(false);
              }
            }}
            {...lock}
          />
        );
      case 2:
        return (
          <AsyncLoadingStep
            title="Expanding Your Idea"
            subtitle="AI is analyzing and enhancing your concept..."
            steps={[
              "Analyzing prompt structure",
              "Researching topic context",
              "Generating expanded concept",
              "Optimizing for engagement",
            ]}
            taskId={state.expandTaskId}
            onComplete={(output: WritingTaskOutput) => {
              // Use expanded idea from task output or fallback
              const expandedIdea =
                output.expanded_idea ||
                `Enhanced Version of: "${state.prompt}"\n\nThis video will explore the fascinating world of ${state.prompt}. We'll break down the key concepts, provide real-world examples, and deliver actionable insights that viewers can apply immediately.\n\nKey Points:\n• Introduction to the core concept\n• Three main supporting arguments\n• Real-world case studies\n• Actionable takeaways for the audience`;

              updateState({ expandedIdea });
              advanceToStep(3);
            }}
            onError={(error) => {
              console.error("Idea expansion failed:", error);
              // Use fallback and continue
              updateState({
                expandedIdea: `Enhanced Version of: "${state.prompt}"\n\nThis video will explore the fascinating world of ${state.prompt}. We'll break down the key concepts, provide real-world examples, and deliver actionable insights that viewers can apply immediately.\n\nKey Points:\n• Introduction to the core concept\n• Three main supporting arguments\n• Real-world case studies\n• Actionable takeaways for the audience`,
              });
              advanceToStep(3);
            }}
            fallbackDuration={3000}
          />
        );
      case 3:
        return (
          <Step2IdeaReview
            expandedIdea={state.expandedIdea}
            onChange={(expandedIdea: string) => updateState({ expandedIdea })}
            onConfirm={async () => {
              // Trigger script writing workflow
              if (state.videoId) {
                try {
                  const response = await fetch(
                    `/api/videos/${state.videoId}/write`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        expandedIdea: state.expandedIdea,
                        scriptType: "long_form",
                        numberOfChapters: 1,
                      }),
                    }
                  );
                  const data = await response.json();

                  if (response.ok && data.taskId) {
                    // Update state and advance in a way that ensures taskId is set first
                    setState((prev) => ({ ...prev, writeTaskId: data.taskId }));
                    // Use Promise + setTimeout to wait for React's state update batch
                    await new Promise((resolve) => setTimeout(resolve, 50));
                    advanceToStep(4);
                    return;
                  } else {
                    console.error(
                      "Failed to start script writing:",
                      data.error
                    );
                  }
                } catch (err) {
                  console.error("Failed to start script writing:", err);
                }
              }
              // Fallback: advance without taskId (will use timer-based progress)
              advanceToStep(4);
            }}
            onBack={() => goToStep(1)}
            {...lock}
          />
        );
      case 4:
        return (
          <AsyncLoadingStep
            title="Writing Script"
            subtitle="AI is crafting your complete video script..."
            steps={[
              "Structuring narrative arc",
              "Writing introduction hook",
              "Developing main content",
              "Crafting conclusion",
              "Optimizing for retention",
            ]}
            taskId={state.writeTaskId}
            onComplete={(output: WritingTaskOutput) => {
              // Use final script from task output or fallback
              const script =
                output.final_script ||
                output.chapters?.map((c) => c.content).join("\n\n---\n\n") ||
                generateFallbackScript(state.prompt);

              updateState({ script });

              // Also update video project with the script
              if (state.videoId) {
                fetch(`/api/videos/${state.videoId}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ script_content: script }),
                }).catch((err) => console.error("Failed to save script:", err));
              }

              advanceToStep(5);
            }}
            onError={(error) => {
              console.error("Script writing failed:", error);
              // Use fallback script and continue
              updateState({ script: generateFallbackScript(state.prompt) });
              advanceToStep(5);
            }}
            fallbackDuration={4000}
          />
        );
      case 5:
        return (
          <Step3ScriptReview
            script={state.script}
            onChange={(script: string) => updateState({ script })}
            onConfirm={async () => {
              if (state.videoId) {
                setIsSaving(true);
                try {
                  // Save the script and update stage to audio
                  await fetch(`/api/videos/${state.videoId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      script_content: state.script,
                      current_stage: "audio",
                    }),
                  });

                  // Trigger audio generation workflow via resume API
                  const response = await fetch(
                    `/api/videos/${state.videoId}/resume`,
                    { method: "POST" }
                  );
                  const data = await response.json();

                  if (!response.ok) {
                    throw new Error(
                      data.error || "Failed to start audio generation"
                    );
                  }

                  console.log("Audio generation started:", data);
                  if (data.taskId) {
                    setState((prev) => ({ ...prev, audioTaskId: data.taskId }));
                    await new Promise((resolve) => setTimeout(resolve, 50));
                  }
                } catch (err) {
                  console.error("Failed to start audio generation:", err);
                  setState((prev) => ({ ...prev, audioTaskId: null }));
                } finally {
                  setIsSaving(false);
                }
              }
              advanceToStep(6);
            }}
            onBack={() => goToStep(3)}
            {...lock}
          />
        );
      case 6:
        // Combined Media step - Audio + AV generation
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
              const audioChunks: AudioChunk[] = audioOutput?.tts_chunks || [];

              // Fetch the shot list from video metadata (generated by AV Script workflow)
              // Poll until av_script_completed flag is set or timeout after 60 seconds
              let shotList: ShotEvent[] = [];
              if (state.videoId) {
                const maxWaitTime = 60000; // 60 seconds max
                const pollInterval = 2000; // Check every 2 seconds
                const startTime = Date.now();

                console.log("[Wizard DEBUG] Starting AV Script polling...", {
                  videoId: state.videoId,
                  maxWaitTime,
                  pollInterval,
                  audioChunksCount: audioChunks.length,
                });

                let pollAttempt = 0;
                while (Date.now() - startTime < maxWaitTime) {
                  pollAttempt++;
                  const elapsedMs = Date.now() - startTime;

                  try {
                    const response = await fetch(
                      `/api/videos/${state.videoId}`
                    );
                    const data = await response.json();

                    console.log(
                      `[Wizard DEBUG] Poll attempt ${pollAttempt} (${elapsedMs}ms elapsed):`,
                      {
                        responseOk: response.ok,
                        hasMetadata: !!data.video?.metadata,
                        avScriptCompleted:
                          data.video?.metadata?.av_script_completed,
                        shotListLength:
                          data.video?.metadata?.shot_list?.length || 0,
                      }
                    );

                    if (
                      response.ok &&
                      data.video?.metadata?.av_script_completed
                    ) {
                      shotList = data.video.metadata.shot_list || [];
                      console.log(
                        `[Wizard DEBUG] AV Script completed! Loaded ${shotList.length} shots`,
                        shotList.length > 0
                          ? {
                              firstShot: shotList[0],
                              lastShot: shotList[shotList.length - 1],
                            }
                          : {}
                      );
                      break;
                    }

                    console.log(
                      `[Wizard DEBUG] AV Script not ready, waiting ${pollInterval}ms...`
                    );
                    await new Promise((resolve) =>
                      setTimeout(resolve, pollInterval)
                    );
                  } catch (err) {
                    console.error(
                      "[Wizard DEBUG] Failed to fetch shot list:",
                      err
                    );
                    await new Promise((resolve) =>
                      setTimeout(resolve, pollInterval)
                    );
                  }
                }

                if (shotList.length === 0) {
                  console.warn(
                    "[Wizard DEBUG] AV Script timed out or returned empty shot list after",
                    Date.now() - startTime,
                    "ms"
                  );
                }
              } else {
                console.warn(
                  "[Wizard DEBUG] No videoId available, skipping AV Script polling"
                );
              }

              updateState({
                audioUrl,
                audioChunks,
                shotList,
                avScript: [
                  {
                    timestamp: "0:00-0:15",
                    visual: "Cinematic opener with title animation",
                    audio: "Introduction narration",
                  },
                  {
                    timestamp: "0:15-0:30",
                    visual: "Hook visuals with dynamic text overlays",
                    audio: "Hook and promise",
                  },
                  {
                    timestamp: "0:30-1:00",
                    visual: "Explainer graphics and diagrams",
                    audio: "Core concept explanation",
                  },
                  {
                    timestamp: "1:00-1:30",
                    visual: "B-roll footage with highlights",
                    audio: "Real-world examples",
                  },
                  {
                    timestamp: "1:30-2:00",
                    visual: "Case study visuals",
                    audio: "Deep dive content",
                  },
                  {
                    timestamp: "2:00-2:30",
                    visual: "Summary cards with key points",
                    audio: "Conclusion recap",
                  },
                  {
                    timestamp: "2:30-2:45",
                    visual: "Subscribe animation and end screen",
                    audio: "Call to action",
                  },
                ],
              });
              advanceToStep(7);
            }}
            onError={(error) => {
              console.error("Audio generation failed:", error);
              // Use fallback and continue
              updateState({
                audioUrl: "/placeholder-audio.mp3",
                audioChunks: [],
                avScript: [
                  {
                    timestamp: "0:00-0:15",
                    visual: "Opening",
                    audio: "Introduction",
                  },
                  {
                    timestamp: "0:15-2:00",
                    visual: "Main content",
                    audio: "Script narration",
                  },
                  {
                    timestamp: "2:00-2:30",
                    visual: "Closing",
                    audio: "Call to action",
                  },
                ],
              });
              advanceToStep(7);
            }}
            fallbackDuration={8000}
          />
        );
      case 7:
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
                    body: JSON.stringify({ current_stage: "video" }),
                  });
                } catch (err) {
                  console.error("Failed to save step:", err);
                }
              }
              advanceToStep(8);
            }}
            onBack={() => goToStep(5)}
            {...lock}
          />
        );
      case 8:
        return (
          <StepExport
            videoId={state.videoId!}
            projectId={projectId}
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
              goToStep(7);
            }}
            onClose={async () => {
              if (state.videoId) {
                try {
                  await updateVideo(state.videoId, { status: "completed" });
                } catch (err) {
                  console.error("Failed to mark video as completed:", err);
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

  // Check if current step is editor (needs full width and height)
  const isEditorStep = currentStep === 7;

  return (
    <div
      className={`flex flex-col h-full w-full ${
        isEditorStep ? "" : "max-w-5xl"
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
      ) : isEditorStep ? (
        <div className="flex-1 overflow-hidden">{renderStep()}</div>
      ) : (
        <div className="flex-1 overflow-hidden">
          <div className="flex items-center justify-center h-full p-6">
            <div className="w-full max-w-3xl animate-in fade-in slide-in-from-bottom-4 duration-500">
              {renderStep()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
