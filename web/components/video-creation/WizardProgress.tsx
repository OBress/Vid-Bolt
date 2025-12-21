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
  return (
    <div className="px-4 py-2 flex items-center gap-4">
      {/* Back button */}
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

      {/* Progress bar - compact, centered */}
      <div className="relative flex-1 max-w-3xl mx-auto">
        {/* Background track */}
        <div className="absolute top-3.5 left-0 right-0 h-0.5 bg-neutral-800 z-0" />

        {/* Active progress track (Official progress) */}
        <div
          className="absolute top-3.5 left-0 h-0.5 bg-gradient-to-r from-orange-500 to-orange-400 transition-all duration-700 ease-out z-0"
          style={{
            width: `${((maxStepReached - 1) / (steps.length - 1)) * 100}%`,
          }}
        />

        {/* Step indicators */}
        <div className="relative flex justify-between z-10">
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
                    w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
                    transition-all duration-500 ease-out
                    ${
                      isCurrent
                        ? "bg-orange-500 text-white ring-4 ring-orange-500/20 shadow-[0_0_15px_rgba(249,115,22,0.4)] scale-110 z-10"
                        : isCompleted
                        ? "bg-orange-500 text-white"
                        : isFutureReached
                        ? "bg-neutral-950 border-2 border-orange-500/40 text-orange-500/60"
                        : "bg-neutral-800 text-neutral-500 group-hover/step:bg-neutral-700 group-hover/step:text-neutral-300"
                    }
                  `}
                >
                  {isCompleted ? (
                    <svg
                      className="w-3.5 h-3.5"
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
                    mt-1.5 text-[10px] font-mono uppercase tracking-wider
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
  );
}
