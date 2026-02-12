"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { useTaskProgress } from "@/hooks/use-task-progress";
import type { Task, WritingTaskOutput } from "@/types/task";

interface AsyncLoadingStepProps {
  title: string;
  subtitle: string;
  /** Steps to display (for visual progress) */
  steps: string[];
  /** Task ID to poll for progress */
  taskId: string | null;
  /** Called when task completes successfully */
  onComplete: (result: WritingTaskOutput) => void;
  /** Called when task fails */
  onError?: (error: string) => void;
  /** Fallback duration for timer mode (when no taskId) */
  fallbackDuration?: number;
  /** Polling interval in milliseconds */
  pollInterval?: number;
}

/**
 * Loading step that polls a real task for progress.
 * Falls back to timer-based progress if no taskId is provided.
 */
export function AsyncLoadingStep({
  title,
  subtitle,
  steps,
  taskId,
  onComplete,
  onError,
  fallbackDuration: _fallbackDuration = 3000,
  pollInterval = 2000,
}: AsyncLoadingStepProps) {
  console.log("[AsyncLoadingStep Render] ID:", taskId, "Title:", title);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [displayProgress, setDisplayProgress] = useState(0);
  const [hasCompleted, setHasCompleted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Handle task completion
  const handleComplete = useCallback(
    (task: Task) => {
      setHasCompleted(true);
      setDisplayProgress(100);
      setCompletedSteps(steps.map((_, i) => i));

      // Extract output and call parent handler
      const output = task.output_data as WritingTaskOutput;
      setTimeout(() => {
        onComplete(output);
      }, 500);
    },
    [onComplete, steps],
  );

  // Handle task error
  const handleError = useCallback(
    (error: string) => {
      setErrorMessage(error);
      onError?.(error);
    },
    [onError],
  );

  // Use task progress hook
  const {
    task,
    progress,
    currentStep,
    status,
    isPolling,
    error: pollError,
  } = useTaskProgress(taskId, {
    pollInterval,
    onComplete: handleComplete,
    onError: handleError,
    autoStart: !!taskId,
  });

  // Update display based on task progress
  useEffect(() => {
    if (task && !hasCompleted) {
      setDisplayProgress(progress);

      // Update step index based on progress
      const stepIndex = Math.min(
        Math.floor((progress / 100) * steps.length),
        steps.length - 1,
      );
      setCurrentStepIndex(stepIndex);

      // Mark completed steps
      const completed: number[] = [];
      for (let i = 0; i < stepIndex; i++) {
        completed.push(i);
      }
      setCompletedSteps(completed);
    }
  }, [task, progress, steps.length, hasCompleted]);

  // Set error from poll
  useEffect(() => {
    if (pollError) {
      setErrorMessage(pollError);
    }
  }, [pollError]);

  // Note: Fallback timer mode is disabled - we always wait for a real taskId
  // to avoid showing fake progress that jumps back when real polling starts.
  // The component will show 0% with "Waiting for task..." until taskId is set.

  // Error state UI
  if (errorMessage) {
    return (
      <div className="flex flex-col items-center gap-8 text-center">
        <div className="relative">
          <div className="absolute -inset-8 bg-red-500/20 rounded-full blur-3xl" />
          <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-lg shadow-red-500/30">
            <AlertCircle className="w-10 h-10 text-white" />
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight text-red-500">
            Something went wrong
          </h2>
          <p className="text-neutral-500 text-sm max-w-md">{errorMessage}</p>
        </div>

        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg text-sm font-medium transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-8 text-center">
      {/* Animated icon */}
      <div className="relative">
        <div
          className={`absolute -inset-8 rounded-full blur-3xl animate-pulse ${
            hasCompleted ? "bg-green-500/20" : "bg-orange-500/20"
          }`}
        />
        <div
          className={`relative w-20 h-20 rounded-2xl flex items-center justify-center shadow-lg ${
            hasCompleted
              ? "bg-gradient-to-br from-green-500 to-green-600 shadow-green-500/30"
              : "bg-gradient-to-br from-orange-500 to-orange-600 shadow-orange-500/30"
          }`}
        >
          {hasCompleted ? (
            <CheckCircle2 className="w-10 h-10 text-white" />
          ) : (
            <Loader2 className="w-10 h-10 text-white animate-spin" />
          )}
        </div>
      </div>

      {/* Title and subtitle */}
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        <p className="text-neutral-500 text-sm">{currentStep || subtitle}</p>
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-md">
        <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ease-linear ${
              hasCompleted
                ? "bg-gradient-to-r from-green-500 to-green-400"
                : "bg-gradient-to-r from-orange-500 to-orange-400"
            }`}
            style={{ width: `${displayProgress}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-[10px] font-mono text-neutral-500">
          <span>
            {status === "running"
              ? "Processing..."
              : status || "Initializing..."}
          </span>
          <span>{Math.round(displayProgress)}%</span>
        </div>
      </div>

      {/* Step checklist */}
      <div className="w-full max-w-md bg-neutral-900/50 border border-neutral-800 rounded-lg p-4">
        <div className="space-y-3">
          {steps.map((step, index) => {
            const isCompleted = completedSteps.includes(index);
            const isCurrent =
              currentStepIndex === index && !isCompleted && !hasCompleted;

            return (
              <div
                key={index}
                className={`
                  flex items-center gap-3 text-sm transition-all duration-300
                  ${
                    isCompleted
                      ? "text-green-500"
                      : isCurrent
                        ? "text-orange-500"
                        : "text-neutral-600"
                  }
                `}
              >
                <div
                  className={`
                    w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0
                    transition-all duration-300
                    ${
                      isCompleted
                        ? "bg-green-500/20 border border-green-500"
                        : isCurrent
                          ? "bg-orange-500/20 border border-orange-500"
                          : "bg-neutral-800 border border-neutral-700"
                    }
                  `}
                >
                  {isCompleted ? (
                    <svg
                      className="w-3 h-3"
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
                  ) : isCurrent ? (
                    <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                  ) : (
                    <div className="w-2 h-2 bg-neutral-600 rounded-full" />
                  )}
                </div>
                <span className={isCurrent ? "font-medium" : ""}>{step}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Status indicator */}
      <div className="flex flex-col items-center gap-2">
        <p className="text-xs text-neutral-600 font-mono">
          {taskId
            ? isPolling
              ? "Connected to AI workflow..."
              : "Waiting for task..."
            : "Processing locally..."}
        </p>

        {hasCompleted && (
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-md text-xs font-medium text-neutral-400 hover:text-white transition-colors animate-in fade-in slide-in-from-bottom-2 duration-1000 delay-1000 fill-mode-forwards opacity-0"
            style={{ animationDelay: "2s" }}
          >
            Stuck? Click to reload
          </button>
        )}
      </div>
    </div>
  );
}
