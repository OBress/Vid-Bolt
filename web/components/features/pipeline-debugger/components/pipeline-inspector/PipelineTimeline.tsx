"use client";

/**
 * Pipeline Timeline
 * ============================================================================
 * Horizontal visual timeline showing all 8 pipeline steps with status
 * indicators. Clicking a step selects it for inspection.
 */

import type { PipelineStep, StepData } from "../../types/pipeline-debugger";
import { ALL_STEPS, STEP_CONFIGS } from "../../utils/step-config";
import { StepIcon } from "../shared/StepIcon";
import { PipelineStatusBadge } from "../shared/PipelineStatusBadge";

interface PipelineTimelineProps {
  steps: StepData[];
  selectedStep: PipelineStep | null;
  onSelectStep: (step: PipelineStep) => void;
  breakpoints?: Set<number>;
  className?: string;
}

export function PipelineTimeline({
  steps,
  selectedStep,
  onSelectStep,
  breakpoints,
  className = "",
}: PipelineTimelineProps) {
  return (
    <div className={`rounded-lg border border-neutral-800 bg-neutral-900/50 p-4 ${className}`}>
      <div className="flex items-center justify-between">
        {ALL_STEPS.map((stepNum, index) => {
          const stepData = steps.find((s) => s.step === stepNum);
          const config = STEP_CONFIGS[stepNum];
          const isSelected = selectedStep === stepNum;
          const hasBreakpoint = breakpoints?.has(stepNum);

          return (
            <div key={stepNum} className="flex items-center flex-1">
              {/* Step node */}
              <button
                onClick={() => onSelectStep(stepNum)}
                className={`relative flex flex-col items-center gap-1.5 px-2 py-1.5 rounded-lg transition-all min-w-[64px] ${
                  isSelected
                    ? `bg-neutral-800 ring-1 ring-${config.color}-500/50`
                    : "hover:bg-neutral-800/50"
                }`}
              >
                {/* Breakpoint indicator */}
                {hasBreakpoint && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-500 border border-neutral-900" />
                )}

                <StepIcon step={stepNum} size="sm" />
                <span
                  className={`text-[10px] font-medium ${
                    isSelected ? "text-white" : "text-neutral-500"
                  }`}
                >
                  {config.shortLabel}
                </span>

                {stepData && (
                  <PipelineStatusBadge status={stepData.status} compact />
                )}
              </button>

              {/* Connector line */}
              {index < ALL_STEPS.length - 1 && (
                <div className="flex-1 h-px bg-neutral-800 mx-1" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
