"use client";

import { useMemo } from "react";
import {
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  SkipForward,
} from "lucide-react";
import type { TaskStep, TaskPhase } from "@/types/task";

interface TaskStepTimelineProps {
  steps: TaskStep[];
}

const PHASE_LABELS: Record<string, string> = {
  preprocessing: "Pre-processing",
  writing: "Writing",
  postprocessing: "Post-processing",
  audio_generation: "Audio Generation",
  audio_processing: "Audio Processing",
  image_generation: "Image Generation",
  video_generation: "Video Generation",
  compositing: "Compositing",
  encoding: "Encoding",
  uploading: "Uploading",
  research: "Research",
  scoping: "Scoping",
  spine: "Spine",
  assets: "Assets",
  expansion: "Expansion",
  assembly: "Assembly",
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function StepStatusIcon({ status }: { status: TaskStep["status"] }) {
  switch (status) {
    case "running":
      return <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-500 flex-shrink-0" />;
    case "completed":
      return <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />;
    case "failed":
      return <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />;
    case "skipped":
      return <SkipForward className="w-3.5 h-3.5 text-neutral-500 flex-shrink-0" />;
    case "pending":
    default:
      return <Clock className="w-3.5 h-3.5 text-neutral-600 flex-shrink-0" />;
  }
}

export function TaskStepTimeline({ steps }: TaskStepTimelineProps) {
  // Group steps by phase
  const groupedSteps = useMemo(() => {
    const groups: { phase: TaskPhase; steps: TaskStep[] }[] = [];
    let currentPhase: TaskPhase | null = null;

    const sorted = [...steps].sort((a, b) => a.order - b.order);

    for (const step of sorted) {
      if (step.phase !== currentPhase) {
        currentPhase = step.phase;
        groups.push({ phase: step.phase, steps: [step] });
      } else {
        groups[groups.length - 1].steps.push(step);
      }
    }

    return groups;
  }, [steps]);

  if (steps.length === 0) {
    return (
      <p className="text-xs text-neutral-600 italic px-1 py-2">
        No steps recorded
      </p>
    );
  }

  return (
    <div className="space-y-3 pt-1">
      {groupedSteps.map((group) => (
        <div key={group.phase} className="space-y-1">
          {/* Phase header */}
          <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider px-1">
            {PHASE_LABELS[group.phase] || group.phase}
          </p>

          {/* Steps */}
          <div className="space-y-0.5">
            {group.steps.map((step, idx) => {
              const isRunning = step.status === "running";
              const isLast = idx === group.steps.length - 1;

              return (
                <div
                  key={step.id}
                  className={`
                    relative flex items-center gap-2 px-2 py-1.5 rounded-md
                    transition-colors duration-200
                    ${isRunning
                      ? "bg-orange-500/10 border border-orange-500/20"
                      : "hover:bg-neutral-800/50"
                    }
                  `}
                >
                  {/* Vertical connector line */}
                  {!isLast && (
                    <div className="absolute left-[17px] top-[22px] w-px h-[calc(100%-8px)] bg-neutral-800" />
                  )}

                  <StepStatusIcon status={step.status} />

                  <span
                    className={`text-xs flex-1 truncate ${
                      isRunning
                        ? "text-orange-400 font-medium"
                        : step.status === "completed"
                        ? "text-neutral-300"
                        : step.status === "failed"
                        ? "text-red-400"
                        : "text-neutral-500"
                    }`}
                  >
                    {step.name}
                  </span>

                  {/* Duration */}
                  {step.duration_ms != null && step.duration_ms > 0 && (
                    <span className="text-[10px] text-neutral-600 tabular-nums flex-shrink-0">
                      {formatDuration(step.duration_ms)}
                    </span>
                  )}

                  {/* Error indicator */}
                  {step.error && (
                    <span className="text-[10px] text-red-500 truncate max-w-[80px]" title={step.error}>
                      {step.error}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
