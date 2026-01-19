"use client";

import { ArrowLeft } from "lucide-react";

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
}

export function WizardProgress({
  steps,
  currentStep,
  maxStepReached,
  onBack,
  onStepClick,
}: WizardProgressProps) {
  // Calculate specific positions for the progress line
  // We want the line to start at the center of the first step and end at the center of the last step.
  // In a grid of N items, each item is 100/N % wide. Center of first is at 100/2N %.
  const stepCount = steps.length;
  const halfStepPercent = 100 / (stepCount * 2);

  return (
    <div className="w-full flex items-center justify-between px-6 py-4">
      {/* Left: Back Button Area (Fixed width to balance right side) */}
      <div className="w-32 flex-shrink-0 flex justify-start z-20">
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-800/80 border border-neutral-700 hover:border-orange-500/50 hover:bg-neutral-800 transition-all duration-300 group"
          >
            <ArrowLeft className="w-4 h-4 text-neutral-400 group-hover:text-orange-500 transition-colors" />
            <span className="text-xs font-mono text-neutral-400 group-hover:text-orange-500 uppercase tracking-widest transition-colors">
              Back
            </span>
          </button>
        )}
      </div>

      {/* Center: Progress Bar (Perfectly centered due to balanced spacers) */}
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

          {/* Step indicators */}
          <div
            className="relative z-10 grid w-full"
            style={{
              gridTemplateColumns: `repeat(${stepCount}, minmax(0, 1fr))`,
            }}
          >
            {steps.map((step) => {
              const isReached = step.id <= maxStepReached;
              const isCompleted = currentStep > step.id && isReached;
              const isCurrent = currentStep === step.id;
              const isFutureReached = step.id > currentStep && isReached;

              return (
                <button
                  key={step.id}
                  onClick={() => onStepClick?.(step.id)}
                  className="flex flex-col items-center group/step focus:outline-none"
                >
                  {/* Step dot */}
                  <div
                    className={`
                      w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold
                      transition-all duration-500 ease-out z-10
                      ${
                        isCurrent
                          ? "bg-orange-500 text-white ring-4 ring-orange-500/20 shadow-[0_0_15px_rgba(249,115,22,0.4)] scale-110"
                          : isCompleted
                            ? "bg-orange-500 text-white shadow-lg shadow-orange-500/20"
                            : isFutureReached
                              ? "bg-neutral-950 border-2 border-orange-500/40 text-orange-500/60"
                              : "bg-neutral-800 text-neutral-500 group-hover/step:bg-neutral-700 group-hover/step:text-neutral-300"
                      }
                    `}
                  >
                    {isCompleted ? (
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

                  {/* Step label */}
                  <span
                    className={`
                      mt-3 text-[10px] font-mono uppercase tracking-wider text-center px-1
                      transition-all duration-300
                      ${
                        isCurrent
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
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right spacer (Balances Left) */}
      <div className="w-32 flex-shrink-0" />
    </div>
  );
}
