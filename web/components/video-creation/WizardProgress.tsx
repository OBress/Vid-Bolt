"use client";

import { ArrowLeft, ArrowRight, Check } from "lucide-react";

interface Step {
  id: number;
  label: string;
  type: string;
}

interface WizardProgressProps {
  steps: readonly Step[];
  currentStep: number;
  maxStepReached: number;
  onBack?: () => void;
  onStepClick?: (step: number) => void;
  skippedSteps?: number[];
  // Navigation buttons
  onPrevStep?: () => void;
  onNextStep?: () => void;
  canGoPrev?: boolean;
  canGoNext?: boolean;
  isFirstStep?: boolean;
  isLastStep?: boolean;
}

export function WizardProgress({
  steps,
  currentStep,
  maxStepReached,
  onBack,
  onStepClick,
  skippedSteps = [],
  onPrevStep,
  onNextStep,
  canGoPrev = true,
  canGoNext = true,
  isFirstStep = false,
  isLastStep = false,
}: WizardProgressProps) {
  // Calculate specific positions for the progress line
  // We want the line to start at the center of the first step and end at the center of the last step.
  // In a grid of N items, each item is 100/N % wide. Center of first is at 100/2N %.
  const stepCount = steps.length;
  const halfStepPercent = 100 / (stepCount * 2);

  return (
    <div className="w-full flex items-center justify-between px-2 sm:px-6 py-3 sm:py-4">
      {/* Left: Exit Button */}
      <div className="w-10 sm:w-24 flex-shrink-0 flex justify-start z-20">
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-800/80 border border-neutral-700 hover:border-orange-500/50 hover:bg-neutral-800 transition-all duration-300 group"
          >
            <ArrowLeft className="w-4 h-4 text-neutral-400 group-hover:text-orange-500 transition-colors" />
            <span className="text-xs font-mono text-neutral-400 group-hover:text-orange-500 uppercase tracking-widest transition-colors hidden sm:inline">
              Exit
            </span>
          </button>
        )}
      </div>

      {/* Center: Progress Bar with inline navigation */}
      <div className="flex-1 max-w-[95%] px-4">
        <div className="relative w-full">
          {/* Background track */}
          <div
            className="absolute top-4 h-0.5 bg-neutral-800 z-0 rounded-full"
            style={{
              left: `${halfStepPercent}%`,
              right: `${halfStepPercent}%`,
            }}
          />

          {/* Active progress track */}
          <div
            className="absolute top-4 z-0 flex items-center"
            style={{
              left: `${halfStepPercent}%`,
              right: `${halfStepPercent}%`,
            }}
          >
            <div
              className="h-0.5 bg-gradient-to-r from-orange-500 to-orange-400 transition-all duration-700 ease-out rounded-full shadow-[0_0_10px_rgba(249,115,22,0.5)]"
              style={{
                width: `${Math.min(100, Math.max(0, ((maxStepReached - 1) / (stepCount - 1)) * 100))}%`,
              }}
            />
          </div>

          {/* Step indicators with inline nav buttons */}
          <div
            className="relative z-10 grid w-full items-start"
            style={{
              gridTemplateColumns: `repeat(${stepCount}, minmax(0, 1fr))`,
            }}
          >
            {steps.map((step, _index) => {
              const isReached = step.id <= maxStepReached;
              const isCompleted = currentStep > step.id && isReached;
              const isCurrent = currentStep === step.id;
              const isSkipped = skippedSteps.includes(step.id);
              const isFutureReached =
                step.id > currentStep && isReached && !isSkipped;

              // Determine if prev/next buttons should appear adjacent to this step
              const showPrevButton = isCurrent && !isFirstStep && onPrevStep;
              const showNextButton = isCurrent && onNextStep;

              return (
                <div
                  key={step.id}
                  className="flex flex-col items-center relative"
                >
                  {/* Prev button - Red circular, centered between current and prev step */}
                  {showPrevButton && (
                    <button
                      onClick={onPrevStep}
                      disabled={!canGoPrev}
                      className={`absolute z-20 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                        canGoPrev
                          ? "bg-red-600 hover:bg-red-500"
                          : "bg-neutral-700 cursor-not-allowed opacity-50"
                      }`}
                      style={{
                        left: "0",
                        transform: "translateX(-50%)",
                        top: "-4px",
                        boxShadow: canGoPrev
                          ? "0 4px 15px rgba(239, 68, 68, 0.35), 0 2px 8px rgba(0, 0, 0, 0.25)"
                          : "0 2px 6px rgba(0, 0, 0, 0.3)",
                      }}
                    >
                      <ArrowLeft
                        className={`w-5 h-5 ${
                          canGoPrev ? "text-white" : "text-neutral-500"
                        }`}
                      />
                    </button>
                  )}

                  {/* Step dot */}
                  <button
                    onClick={() => !isSkipped && onStepClick?.(step.id)}
                    className={`flex flex-col items-center group/step focus:outline-none ${isSkipped ? "cursor-default" : ""}`}
                  >
                    <div
                      className={`
                        w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold
                        transition-all duration-500 ease-out z-10
                        ${
                          isCurrent
                            ? "bg-orange-500 text-white ring-4 ring-orange-500/20 shadow-[0_0_15px_rgba(249,115,22,0.4)] scale-110"
                            : isCompleted
                              ? "bg-orange-500 text-white shadow-lg shadow-orange-500/20"
                              : isSkipped
                                ? "bg-neutral-800 text-neutral-600 border border-neutral-700"
                                : isFutureReached
                                  ? "bg-neutral-950 border-2 border-orange-500/40 text-orange-500/60"
                                  : "bg-neutral-800 text-neutral-500 group-hover/step:bg-neutral-700 group-hover/step:text-neutral-300"
                        }
                        relative overflow-hidden
                      `}
                    >
                      {isSkipped && (
                        <div className="absolute inset-0 z-20">
                          <svg
                            width="100%"
                            height="100%"
                            viewBox="0 0 32 32"
                            className="text-neutral-500/50"
                          >
                            <line
                              x1="0"
                              y1="32"
                              x2="32"
                              y2="0"
                              stroke="currentColor"
                              strokeWidth="2"
                            />
                          </svg>
                        </div>
                      )}
                      {isCompleted && !isSkipped ? (
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={3}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      ) : (
                        step.id
                      )}
                    </div>
                  </button>

                  {/* Next button - Green circular, centered between current and next step */}
                  {showNextButton && (
                    <button
                      onClick={onNextStep}
                      disabled={!canGoNext}
                      className={`absolute z-20 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                        canGoNext
                          ? "bg-green-600 hover:bg-green-500"
                          : "bg-neutral-700 cursor-not-allowed opacity-50"
                      }`}
                      style={{
                        left: "100%",
                        transform: "translateX(-50%)",
                        top: "-4px",
                        boxShadow: canGoNext
                          ? "0 4px 15px rgba(34, 197, 94, 0.35), 0 2px 8px rgba(0, 0, 0, 0.25)"
                          : "0 2px 6px rgba(0, 0, 0, 0.3)",
                      }}
                    >
                      {isLastStep ? (
                        <Check
                          className={`w-5 h-5 ${
                            canGoNext ? "text-white" : "text-neutral-500"
                          }`}
                        />
                      ) : (
                        <ArrowRight
                          className={`w-5 h-5 ${
                            canGoNext ? "text-white" : "text-neutral-500"
                          }`}
                        />
                      )}
                    </button>
                  )}

                  {/* Step label */}
                  <span
                    className={`
                      mt-3 text-[10px] font-mono uppercase tracking-wider text-center px-1
                      transition-all duration-300 hidden sm:block
                      ${
                        isSkipped
                          ? "text-neutral-600 line-through decoration-neutral-600"
                          : isCurrent
                            ? "text-orange-500 font-bold scale-105"
                            : isCompleted
                              ? "text-neutral-400 font-medium"
                              : isFutureReached
                                ? "text-orange-500/40"
                                : "text-neutral-600 group-hover/step:text-neutral-400"
                      }
                    `}
                  >
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right spacer (Balances Left) */}
      <div className="w-10 sm:w-24 flex-shrink-0" />
    </div>
  );
}
