"use client";

/**
 * Performance Profiler
 * ============================================================================
 * Visualizes step timing, queue waits, retry counts, and estimated costs.
 * Shows a waterfall chart and per-step breakdowns.
 */

import { useMemo } from "react";
import {
  Clock,
  Zap,
  DollarSign,
  RefreshCw,
  BarChart3,
  AlertTriangle,
} from "lucide-react";
import { StepIcon } from "../shared/StepIcon";
import { STEP_CONFIGS, ALL_STEPS } from "../../utils/step-config";
import type { PipelineRun, PipelineStep, StepData } from "../../types/pipeline-debugger";

interface PerformanceProfilerProps {
  run: PipelineRun | null;
  className?: string;
}

// Rough cost estimates per step (for display purposes)
const STEP_COST_ESTIMATES: Record<number, { label: string; costPerRun: number }> = {
  1: { label: "Gemini API (outline)", costPerRun: 0.02 },
  2: { label: "Pixabay/Serper API", costPerRun: 0.005 },
  3: { label: "Gemini API (script)", costPerRun: 0.03 },
  4: { label: "TTS API", costPerRun: 0.05 },
  5: { label: "Gemini API (AV script)", costPerRun: 0.04 },
  6: { label: "GPU API (image/video gen)", costPerRun: 0.50 },
  7: { label: "Gemini API (EDL)", costPerRun: 0.02 },
  8: { label: "Remotion Lambda", costPerRun: 0.15 },
};

export function PerformanceProfiler({ run, className = "" }: PerformanceProfilerProps) {
  const stats = useMemo(() => {
    if (!run) return null;

    const completedSteps = run.steps.filter((s) => s.status === "complete");
    const errorSteps = run.steps.filter((s) => s.status === "error");
    const totalErrors = run.steps.reduce((n, s) => n + s.errors.length, 0);
    const totalMedia = run.steps.find((s) => s.step === 6)?.media.length || 0;

    // Estimate total cost
    const estimatedCost = completedSteps.reduce(
      (cost, s) => cost + (STEP_COST_ESTIMATES[s.step]?.costPerRun || 0),
      0
    );

    return {
      completedSteps: completedSteps.length,
      totalSteps: 8,
      errorSteps: errorSteps.length,
      totalErrors,
      totalMedia,
      estimatedCost,
    };
  }, [run]);

  if (!run) {
    return (
      <div className={`text-center py-8 text-neutral-500 text-sm ${className}`}>
        Select a video to view performance data.
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Summary cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <MetricCard
            icon={BarChart3}
            label="Progress"
            value={`${stats.completedSteps}/${stats.totalSteps}`}
            color="text-blue-400"
          />
          <MetricCard
            icon={AlertTriangle}
            label="Errors"
            value={String(stats.totalErrors)}
            color={stats.totalErrors > 0 ? "text-red-400" : "text-green-400"}
          />
          <MetricCard
            icon={Zap}
            label="Media Generated"
            value={String(stats.totalMedia)}
            color="text-cyan-400"
          />
          <MetricCard
            icon={DollarSign}
            label="Est. Cost"
            value={`$${stats.estimatedCost.toFixed(2)}`}
            color="text-amber-400"
          />
        </div>
      )}

      {/* Step waterfall */}
      <div className="rounded-lg border border-neutral-800 overflow-hidden">
        <div className="px-4 py-2 bg-neutral-900/50 border-b border-neutral-800 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-neutral-300 uppercase">Step Waterfall</h3>
          <span className="text-[10px] text-neutral-600">{run.videoName}</span>
        </div>

        <div className="divide-y divide-neutral-800/50">
          {ALL_STEPS.map((step) => {
            const stepData = run.steps.find((s) => s.step === step);
            const costInfo = STEP_COST_ESTIMATES[step];
            if (!stepData) return null;

            return (
              <StepWaterfallRow
                key={step}
                step={step}
                stepData={stepData}
                costEstimate={costInfo?.costPerRun || 0}
                costLabel={costInfo?.label || ""}
              />
            );
          })}
        </div>
      </div>

      {/* Cost breakdown */}
      <div className="rounded-lg border border-neutral-800 overflow-hidden">
        <div className="px-4 py-2 bg-neutral-900/50 border-b border-neutral-800">
          <h3 className="text-xs font-semibold text-neutral-300 uppercase">Cost Breakdown (Estimated)</h3>
        </div>
        <div className="p-4">
          <div className="space-y-2">
            {ALL_STEPS.map((step) => {
              const stepData = run.steps.find((s) => s.step === step);
              const costInfo = STEP_COST_ESTIMATES[step];
              const isComplete = stepData?.status === "complete";
              if (!costInfo) return null;

              return (
                <div key={step} className="flex items-center gap-2">
                  <StepIcon step={step} size="sm" />
                  <span className="text-xs text-neutral-400 flex-1">
                    {STEP_CONFIGS[step].label}
                  </span>
                  <span className="text-[10px] text-neutral-500 mr-4">{costInfo.label}</span>
                  <span
                    className={`text-xs font-mono ${
                      isComplete ? "text-neutral-200" : "text-neutral-600"
                    }`}
                  >
                    ${costInfo.costPerRun.toFixed(3)}
                  </span>
                  {/* Bar */}
                  <div className="w-24 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        isComplete ? "bg-amber-500" : "bg-neutral-700"
                      }`}
                      style={{
                        width: `${Math.min(
                          100,
                          (costInfo.costPerRun / 0.5) * 100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 pt-3 border-t border-neutral-800 flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-300">Total Estimated</span>
            <span className="text-sm font-mono font-bold text-amber-400">
              ${stats?.estimatedCost.toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function MetricCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="p-3 rounded-lg border border-neutral-800 bg-neutral-900/50">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={`w-3 h-3 ${color}`} />
        <span className="text-[10px] text-neutral-500 uppercase">{label}</span>
      </div>
      <span className="text-lg font-bold text-neutral-200">{value}</span>
    </div>
  );
}

function StepWaterfallRow({
  step,
  stepData,
  costEstimate,
  costLabel,
}: {
  step: PipelineStep;
  stepData: StepData;
  costEstimate: number;
  costLabel: string;
}) {
  const config = STEP_CONFIGS[step];
  const hasErrors = stepData.errors.length > 0;
  const retries = stepData.timing?.retryCount || 0;

  const statusColor =
    stepData.status === "complete"
      ? "bg-green-500"
      : stepData.status === "error"
      ? "bg-red-500"
      : stepData.status === "in-progress"
      ? "bg-amber-500"
      : "bg-neutral-700";

  return (
    <div className="px-4 py-2.5 flex items-center gap-3">
      <StepIcon step={step} size="sm" />
      <span className="text-xs font-medium text-neutral-200 w-28 flex-shrink-0">
        {config.label}
      </span>

      {/* Status bar */}
      <div className="flex-1 flex items-center gap-2">
        <div className="flex-1 h-5 bg-neutral-800/50 rounded-md overflow-hidden relative">
          <div
            className={`h-full ${statusColor} rounded-md transition-all`}
            style={{
              width:
                stepData.status === "complete"
                  ? "100%"
                  : stepData.status === "in-progress"
                  ? "60%"
                  : stepData.status === "error"
                  ? "100%"
                  : "0%",
              opacity: stepData.status === "not-reached" ? 0.2 : 1,
            }}
          />
          <span className="absolute inset-0 flex items-center px-2 text-[10px] font-medium text-white/80">
            {stepData.timing?.durationMs
              ? `${(stepData.timing.durationMs / 1000).toFixed(1)}s`
              : stepData.status === "complete"
              ? "Done"
              : stepData.status === "in-progress"
              ? "Running..."
              : stepData.status === "error"
              ? "Failed"
              : "Pending"}
          </span>
        </div>
      </div>

      {/* Metadata */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {retries > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] text-amber-400">
            <RefreshCw className="w-3 h-3" /> {retries}
          </span>
        )}
        {hasErrors && (
          <span className="flex items-center gap-0.5 text-[10px] text-red-400">
            <AlertTriangle className="w-3 h-3" /> {stepData.errors.length}
          </span>
        )}
        <span className="text-[10px] text-neutral-600 font-mono w-14 text-right">
          ${costEstimate.toFixed(3)}
        </span>
      </div>
    </div>
  );
}
