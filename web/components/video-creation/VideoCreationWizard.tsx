"use client";

import { useState, useCallback } from "react";
import { WizardProgress } from "./WizardProgress";
import { Step1PromptInput } from "./steps/Step1PromptInput";
import { Step2IdeaReview } from "./steps/Step2IdeaReview";
import { Step3ScriptReview } from "./steps/Step3ScriptReview";
import { Step4AVVerification } from "./steps/Step4AVVerification";
import { StepEditor } from "./steps/StepEditor";
import { StepExport } from "./steps/StepExport";
import { LoadingStep } from "./LoadingStep";

export interface WizardState {
  prompt: string;
  expandedIdea: string;
  script: string;
  audioUrl: string | null;
  avScript: { timestamp: string; visual: string; audio: string }[];
  videoId: string | null;
}

// Step configuration for the wizard - 10 steps
const STEPS = [
  { id: 1, label: "Idea", type: "input" },
  { id: 2, label: "Expand", type: "loading" },
  { id: 3, label: "Review", type: "review" },
  { id: 4, label: "Script", type: "loading" },
  { id: 5, label: "Edit", type: "review" },
  { id: 6, label: "Media", type: "loading" },
  { id: 7, label: "Verify", type: "review" },
  { id: 8, label: "Generate", type: "loading" }, // New: Generate video assets
  { id: 9, label: "Editor", type: "editor" },
  { id: 10, label: "Export", type: "final" },
] as const;

interface VideoCreationWizardProps {
  onComplete: (videoId: string) => void;
  onBack: () => void;
  projectId: string;
}

export function VideoCreationWizard({
  onComplete,
  onBack,
  projectId,
}: VideoCreationWizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [maxStepReached, setMaxStepReached] = useState(1);
  const [state, setState] = useState<WizardState>({
    prompt: "",
    expandedIdea: "",
    script: "",
    audioUrl: null,
    avScript: [],
    videoId: null,
  });

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
            onSubmit={() => advanceToStep(2)}
            {...lock}
          />
        );
      case 2:
        return (
          <LoadingStep
            title="Expanding Your Idea"
            subtitle="AI is analyzing and enhancing your concept..."
            steps={[
              "Analyzing prompt structure",
              "Researching topic context",
              "Generating expanded concept",
              "Optimizing for engagement",
            ]}
            onComplete={() => {
              updateState({
                expandedIdea: `Enhanced Version of: "${state.prompt}"\n\nThis video will explore the fascinating world of ${state.prompt}. We'll break down the key concepts, provide real-world examples, and deliver actionable insights that viewers can apply immediately.\n\nKey Points:\n• Introduction to the core concept\n• Three main supporting arguments\n• Real-world case studies\n• Actionable takeaways for the audience`,
              });
              advanceToStep(3);
            }}
            duration={3000}
          />
        );
      case 3:
        return (
          <Step2IdeaReview
            expandedIdea={state.expandedIdea}
            onChange={(expandedIdea: string) => updateState({ expandedIdea })}
            onConfirm={() => advanceToStep(4)}
            onBack={() => goToStep(1)}
            {...lock}
          />
        );
      case 4:
        return (
          <LoadingStep
            title="Writing Script"
            subtitle="AI is crafting your complete video script..."
            steps={[
              "Structuring narrative arc",
              "Writing introduction hook",
              "Developing main content",
              "Crafting conclusion",
              "Optimizing for retention",
            ]}
            onComplete={() => {
              updateState({
                script: `[INTRO - 0:00-0:15]
HOST: "Have you ever wondered about ${state.prompt}? Today, we're diving deep into this fascinating topic."

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
HOST: "If you found this valuable, don't forget to like and subscribe for more content like this!"`,
              });
              advanceToStep(5);
            }}
            duration={4000}
          />
        );
      case 5:
        return (
          <Step3ScriptReview
            script={state.script}
            onChange={(script: string) => updateState({ script })}
            onConfirm={() => advanceToStep(6)}
            onBack={() => goToStep(3)}
            {...lock}
          />
        );
      case 6:
        // Combined Media step - Audio + AV generation
        return (
          <LoadingStep
            title="Generating Media"
            subtitle="Creating audio and visual timeline..."
            steps={[
              "Processing script segments",
              "Selecting optimal voice",
              "Generating TTS audio",
              "Analyzing audio segments",
              "Matching visual elements",
              "Planning transitions",
              "Building AV timeline",
            ]}
            onComplete={() => {
              updateState({
                audioUrl: "/placeholder-audio.mp3",
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
            duration={5000}
          />
        );
      case 7:
        return (
          <Step4AVVerification
            audioUrl={state.audioUrl}
            avScript={state.avScript}
            onConfirm={() => advanceToStep(8)} // Go to Generate step
            onBack={() => goToStep(5)}
            {...lock}
          />
        );
      case 8:
        // New Generate step - assembling video assets
        return (
          <LoadingStep
            title="Generating Video"
            subtitle="Assembling all media into the editor..."
            steps={[
              "Initializing video project",
              "Importing audio tracks",
              "Loading visual assets",
              "Placing elements on timeline",
              "Applying transitions & effects",
              "Rendering preview frames",
              "Finalizing project",
            ]}
            onComplete={() => {
              const videoId = `video-${Date.now()}`;
              updateState({ videoId });
              advanceToStep(9);
            }}
            duration={4000}
          />
        );
      case 9:
        return (
          <StepEditor
            videoId={state.videoId!}
            projectId={projectId}
            onContinue={() => advanceToStep(10)}
            onBack={() => goToStep(7)}
            {...lock}
          />
        );
      case 10:
        return (
          <StepExport
            videoId={state.videoId!}
            projectId={projectId}
            onBack={() => goToStep(9)}
            onClose={onBack}
            {...lock}
          />
        );
      default:
        return null;
    }
  };

  // Check if current step is editor (needs full width and height)
  const isEditorStep = currentStep === 9;

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
      {isEditorStep ? (
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
