"use client";

/**
 * Step Icon
 * ============================================================================
 * Renders the appropriate icon for a pipeline step with consistent styling.
 */

import type { PipelineStep } from "../../types/pipeline-debugger";
import { getStepConfig } from "../../utils/step-config";

interface StepIconProps {
  step: PipelineStep;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_MAP = {
  sm: { icon: "w-3.5 h-3.5", container: "h-6 w-6" },
  md: { icon: "w-4 h-4", container: "h-8 w-8" },
  lg: { icon: "w-5 h-5", container: "h-10 w-10" },
};

export function StepIcon({ step, size = "md", className = "" }: StepIconProps) {
  const config = getStepConfig(step);
  const Icon = config.icon;
  const sizes = SIZE_MAP[size];

  return (
    <div
      className={`${sizes.container} rounded-full ${config.bgClass} flex items-center justify-center flex-shrink-0 ${className}`}
    >
      <Icon className={`${sizes.icon} ${config.textClass}`} />
    </div>
  );
}
