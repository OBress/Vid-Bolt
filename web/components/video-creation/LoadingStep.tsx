"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

interface LoadingStepProps {
  title: string;
  subtitle: string;
  steps: string[];
  onComplete: () => void;
  duration: number;
}

export function LoadingStep({
  title,
  subtitle,
  steps,
  onComplete,
  duration,
}: LoadingStepProps) {
  const [progress, setProgress] = useState(0);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);

  useEffect(() => {
    const stepDuration = duration / steps.length;
    const progressInterval = 50;
    const progressIncrement = (100 / duration) * progressInterval;

    const progressTimer = setInterval(() => {
      setProgress((prev) => {
        const next = prev + progressIncrement;
        if (next >= 100) {
          clearInterval(progressTimer);
          return 100;
        }
        return next;
      });
    }, progressInterval);

    const stepTimer = setInterval(() => {
      setCurrentStepIndex((prev) => {
        if (prev < steps.length - 1) {
          setCompletedSteps((completed) => [...completed, prev]);
          return prev + 1;
        }
        return prev;
      });
    }, stepDuration);

    const completeTimer = setTimeout(() => {
      setCompletedSteps((completed) => [...completed, steps.length - 1]);
      setTimeout(onComplete, 500);
    }, duration);

    return () => {
      clearInterval(progressTimer);
      clearInterval(stepTimer);
      clearTimeout(completeTimer);
    };
  }, [duration, steps.length, onComplete]);

  return (
    <div className="flex flex-col items-center gap-8 text-center">
      {/* Animated icon */}
      <div className="relative">
        <div className="absolute -inset-8 bg-orange-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/30">
          <Loader2 className="w-10 h-10 text-white animate-spin" />
        </div>
      </div>

      {/* Title and subtitle */}
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        <p className="text-neutral-500 text-sm">{subtitle}</p>
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-md">
        <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-orange-500 to-orange-400 rounded-full transition-all duration-100 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-[10px] font-mono text-neutral-500">
          <span>Processing...</span>
          <span>{Math.round(progress)}%</span>
        </div>
      </div>

      {/* Step checklist */}
      <div className="w-full max-w-md bg-neutral-900/50 border border-neutral-800 rounded-lg p-4">
        <div className="space-y-3">
          {steps.map((step, index) => {
            const isCompleted = completedSteps.includes(index);
            const isCurrent = currentStepIndex === index && !isCompleted;

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

      {/* Ambient message */}
      <p className="text-xs text-neutral-600 font-mono">
        Please wait while the AI processes your content...
      </p>
    </div>
  );
}
