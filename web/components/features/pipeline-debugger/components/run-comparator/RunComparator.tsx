"use client";

/**
 * Run Comparator
 * ============================================================================
 * Side-by-side comparison of two pipeline runs. Shows config diffs,
 * output diffs, metric deltas, and step-by-step analysis.
 */

import { useState, useMemo, useCallback } from "react";
import {
  GitCompare,
  ChevronRight,
  ArrowUpDown,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle2,
  Database,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { VideoProjectSelector } from "../shared/VideoProjectSelector";
import { StepIcon } from "../shared/StepIcon";
import { JsonTreeViewer } from "../shared/JsonTreeViewer";
import { PipelineStatusBadge } from "../shared/PipelineStatusBadge";
import { STEP_CONFIGS, ALL_STEPS } from "../../utils/step-config";
import {
  generateRunComparison,
  summarizeDiff,
  hasDifferences,
} from "../../utils/diff-utils";
import { extractPipelineRun } from "../../utils/pipeline-data-extractor";
import { useSnapshots } from "../../hooks/use-snapshots";
import type {
  PipelineRun,
  RunComparison,
  StepDiff,
  DiffResult,
  MetricDelta,
  PipelineStep,
  PipelineDebuggerState,
  PipelineDebuggerActions,
} from "../../types/pipeline-debugger";

interface RunComparatorProps {
  store: PipelineDebuggerState & PipelineDebuggerActions;
  className?: string;
}

export function RunComparator({ store, className = "" }: RunComparatorProps) {
  const [videoIdA, setVideoIdA] = useState<string | null>(null);
  const [videoIdB, setVideoIdB] = useState<string | null>(null);
  const [runA, setRunA] = useState<PipelineRun | null>(null);
  const [runB, setRunB] = useState<PipelineRun | null>(null);
  const [isLoadingA, setIsLoadingA] = useState(false);
  const [isLoadingB, setIsLoadingB] = useState(false);
  const [comparison, setComparison] = useState<RunComparison | null>(null);
  const [selectedDiffStep, setSelectedDiffStep] = useState<PipelineStep | null>(null);
  const [showSnapshotPickerFor, setShowSnapshotPickerFor] = useState<"A" | "B" | null>(null);

  const { snapshots } = useSnapshots();
  const fullPipelineSnapshots = useMemo(
    () => snapshots.filter((s) => s.isFullPipeline && s.fullRun),
    [snapshots]
  );

  const loadRun = useCallback(async (videoId: string, side: "A" | "B") => {
    const setLoading = side === "A" ? setIsLoadingA : setIsLoadingB;
    const setRun = side === "A" ? setRunA : setRunB;
    setLoading(true);
    try {
      const response = await fetch(`/api/videos/${videoId}`);
      if (!response.ok) throw new Error("Failed to load video");
      const data = await response.json();
      const run = extractPipelineRun(data.video);
      setRun(run);
      setComparison(null);
    } catch (err) {
      console.error(`[RunComparator] Failed to load run ${side}:`, err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSnapshotAsRun = useCallback(
    (snapshotId: string, side: "A" | "B") => {
      const snapshot = snapshots.find((s) => s.id === snapshotId);
      if (!snapshot?.fullRun) return;
      const setRun = side === "A" ? setRunA : setRunB;
      const setVideoId = side === "A" ? setVideoIdA : setVideoIdB;
      setRun(snapshot.fullRun);
      setVideoId(`snapshot:${snapshot.id}`);
      setComparison(null);
      setShowSnapshotPickerFor(null);
    },
    [snapshots]
  );

  const handleCompare = useCallback(() => {
    if (runA && runB) {
      const result = generateRunComparison(runA, runB);
      setComparison(result);
      setSelectedDiffStep(null);
    }
  }, [runA, runB]);

  const selectedStepDiff = useMemo(() => {
    if (!comparison || !selectedDiffStep) return null;
    return comparison.stepDiffs.find((d) => d.step === selectedDiffStep) || null;
  }, [comparison, selectedDiffStep]);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* ================================================================ */}
      {/* RUN SELECTORS */}
      {/* ================================================================ */}
      <div className="flex items-center gap-4">
        <div className="flex-1 p-3 rounded-lg border border-blue-500/20 bg-blue-950/10">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-bold uppercase text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">A</span>
            <span className="text-xs text-neutral-400">Base run</span>
            {fullPipelineSnapshots.length > 0 && (
              <button
                onClick={() => setShowSnapshotPickerFor(showSnapshotPickerFor === "A" ? null : "A")}
                className="ml-auto text-[10px] text-blue-400/60 hover:text-blue-400 flex items-center gap-1"
              >
                <Database className="w-3 h-3" /> From Snapshot
              </button>
            )}
          </div>
          <VideoProjectSelector
            selectedVideoId={videoIdA?.startsWith("snapshot:") ? null : videoIdA}
            onSelect={(id) => {
              setVideoIdA(id);
              loadRun(id, "A");
            }}
          />
          {showSnapshotPickerFor === "A" && (
            <SnapshotPicker
              snapshots={fullPipelineSnapshots}
              onSelect={(id) => loadSnapshotAsRun(id, "A")}
              onClose={() => setShowSnapshotPickerFor(null)}
            />
          )}
          {runA && (
            <div className="mt-2 text-[10px] text-neutral-500">
              {videoIdA?.startsWith("snapshot:") && <span className="text-blue-400 mr-1">[Snapshot]</span>}
              {runA.videoName} · {runA.currentStage} · {runA.steps.filter(s => s.status === 'complete').length}/8 steps
            </div>
          )}
        </div>

        <GitCompare className="w-5 h-5 text-neutral-600 flex-shrink-0" />

        <div className="flex-1 p-3 rounded-lg border border-amber-500/20 bg-amber-950/10">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-bold uppercase text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">B</span>
            <span className="text-xs text-neutral-400">Compare run</span>
            {fullPipelineSnapshots.length > 0 && (
              <button
                onClick={() => setShowSnapshotPickerFor(showSnapshotPickerFor === "B" ? null : "B")}
                className="ml-auto text-[10px] text-amber-400/60 hover:text-amber-400 flex items-center gap-1"
              >
                <Database className="w-3 h-3" /> From Snapshot
              </button>
            )}
          </div>
          <VideoProjectSelector
            selectedVideoId={videoIdB?.startsWith("snapshot:") ? null : videoIdB}
            onSelect={(id) => {
              setVideoIdB(id);
              loadRun(id, "B");
            }}
          />
          {showSnapshotPickerFor === "B" && (
            <SnapshotPicker
              snapshots={fullPipelineSnapshots}
              onSelect={(id) => loadSnapshotAsRun(id, "B")}
              onClose={() => setShowSnapshotPickerFor(null)}
            />
          )}
          {runB && (
            <div className="mt-2 text-[10px] text-neutral-500">
              {videoIdB?.startsWith("snapshot:") && <span className="text-amber-400 mr-1">[Snapshot]</span>}
              {runB.videoName} · {runB.currentStage} · {runB.steps.filter(s => s.status === 'complete').length}/8 steps
            </div>
          )}
        </div>
      </div>

      {/* Compare button */}
      <div className="flex justify-center">
        <Button
          onClick={handleCompare}
          disabled={!runA || !runB || isLoadingA || isLoadingB}
          className="bg-neutral-800 hover:bg-neutral-700 text-sm gap-2"
        >
          <GitCompare className="w-4 h-4" />
          Generate Comparison
        </Button>
      </div>

      {/* ================================================================ */}
      {/* COMPARISON RESULTS */}
      {/* ================================================================ */}
      {comparison && (
        <>
          {/* Metric deltas */}
          <MetricDeltaCards deltas={comparison.metricDeltas} />

          {/* Step-by-step diff overview */}
          <div className="rounded-lg border border-neutral-800 overflow-hidden">
            <div className="px-4 py-2 bg-neutral-900/50 border-b border-neutral-800">
              <h3 className="text-xs font-semibold text-neutral-300 uppercase">Step-by-Step Diff</h3>
            </div>
            <div className="divide-y divide-neutral-800/50">
              {comparison.stepDiffs.map((diff) => (
                <StepDiffRow
                  key={diff.step}
                  diff={diff}
                  isSelected={selectedDiffStep === diff.step}
                  onClick={() =>
                    setSelectedDiffStep(
                      selectedDiffStep === diff.step ? null : (diff.step as PipelineStep)
                    )
                  }
                />
              ))}
            </div>
          </div>

          {/* Selected step detail */}
          {selectedStepDiff && (
            <StepDiffDetail diff={selectedStepDiff} runA={comparison.runA} runB={comparison.runB} />
          )}
        </>
      )}
    </div>
  );
}

// ============================================================================
// METRIC DELTA CARDS
// ============================================================================

function MetricDeltaCards({ deltas }: { deltas: MetricDelta[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {deltas.map((delta) => {
        const DeltaIcon =
          delta.improved === true
            ? TrendingUp
            : delta.improved === false
            ? TrendingDown
            : Minus;
        const deltaColor =
          delta.improved === true
            ? "text-green-400"
            : delta.improved === false
            ? "text-red-400"
            : "text-neutral-500";

        return (
          <div
            key={delta.label}
            className="p-2.5 rounded-lg border border-neutral-800 bg-neutral-900/50"
          >
            <div className="text-[10px] text-neutral-500 uppercase">{delta.label}</div>
            <div className="flex items-center justify-between mt-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-blue-400">{String(delta.valueA)}</span>
                <ChevronRight className="w-3 h-3 text-neutral-600" />
                <span className="text-xs text-amber-400">{String(delta.valueB)}</span>
              </div>
              {delta.delta !== null && (
                <div className={`flex items-center gap-0.5 ${deltaColor}`}>
                  <DeltaIcon className="w-3 h-3" />
                  <span className="text-[10px] font-medium">
                    {delta.delta > 0 ? "+" : ""}
                    {delta.delta}
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// STEP DIFF ROW
// ============================================================================

function StepDiffRow({
  diff,
  isSelected,
  onClick,
}: {
  diff: StepDiff;
  isSelected: boolean;
  onClick: () => void;
}) {
  const config = STEP_CONFIGS[diff.step as PipelineStep];
  const hasInputChanges = hasDifferences(diff.inputDiff);
  const hasOutputChanges = hasDifferences(diff.outputDiff);
  const hasConfigChanges = hasDifferences(diff.configDiff);
  const hasChanges = hasInputChanges || hasOutputChanges || hasConfigChanges;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-2 flex items-center gap-3 transition-colors ${
        isSelected ? "bg-neutral-800" : "hover:bg-neutral-800/30"
      }`}
    >
      <StepIcon step={diff.step as PipelineStep} size="sm" />
      <span className="text-xs font-medium text-neutral-200 flex-1">
        {diff.label}
      </span>

      <div className="flex items-center gap-2">
        {hasConfigChanges && (
          <DiffBadge label="Config" diff={diff.configDiff} />
        )}
        {hasInputChanges && (
          <DiffBadge label="Inputs" diff={diff.inputDiff} />
        )}
        {hasOutputChanges && (
          <DiffBadge label="Outputs" diff={diff.outputDiff} />
        )}
        {!hasChanges && (
          <span className="text-[10px] text-neutral-600 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Same
          </span>
        )}
      </div>

      <ChevronRight
        className={`w-3.5 h-3.5 text-neutral-600 transition-transform ${
          isSelected ? "rotate-90" : ""
        }`}
      />
    </button>
  );
}

function DiffBadge({ label, diff }: { label: string; diff: DiffResult }) {
  const totalChanges = diff.added.length + diff.removed.length + diff.changed.length;
  return (
    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-900/30 text-amber-400 border border-amber-800/30">
      {label}: {totalChanges}
    </span>
  );
}

// ============================================================================
// STEP DIFF DETAIL
// ============================================================================

function StepDiffDetail({
  diff,
  runA,
  runB,
}: {
  diff: StepDiff;
  runA: PipelineRun;
  runB: PipelineRun;
}) {
  const [activeTab, setActiveTab] = useState<"inputs" | "outputs" | "config">("outputs");
  const stepA = runA.steps.find((s) => s.step === diff.step);
  const stepB = runB.steps.find((s) => s.step === diff.step);

  const activeDiff =
    activeTab === "inputs"
      ? diff.inputDiff
      : activeTab === "outputs"
      ? diff.outputDiff
      : diff.configDiff;

  const dataA =
    activeTab === "inputs"
      ? stepA?.inputs
      : activeTab === "outputs"
      ? stepA?.outputs
      : stepA?.config;

  const dataB =
    activeTab === "inputs"
      ? stepB?.inputs
      : activeTab === "outputs"
      ? stepB?.outputs
      : stepB?.config;

  return (
    <div className="rounded-lg border border-neutral-800 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-neutral-800 bg-neutral-900/50">
        <StepIcon step={diff.step as PipelineStep} size="sm" />
        <span className="text-xs font-semibold text-white">{diff.label}</span>
        <span className="text-[10px] text-neutral-500 ml-auto">{summarizeDiff(activeDiff)}</span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-neutral-800">
        {(["inputs", "outputs", "config"] as const).map((tab) => {
          const tabDiff = tab === "inputs" ? diff.inputDiff : tab === "outputs" ? diff.outputDiff : diff.configDiff;
          const hasChanges = hasDifferences(tabDiff);
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 text-xs capitalize transition-colors border-b-2 ${
                activeTab === tab
                  ? "border-amber-500 text-white"
                  : "border-transparent text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {tab}
              {hasChanges && <span className="ml-1 text-amber-400">•</span>}
            </button>
          );
        })}
      </div>

      {/* Side-by-side content */}
      <div className="flex divide-x divide-neutral-800 max-h-96 overflow-hidden">
        <div className="flex-1 p-3 overflow-y-auto">
          <div className="text-[10px] uppercase text-blue-400 font-semibold mb-1.5">
            Run A — {runA.videoName}
          </div>
          <JsonTreeViewer data={dataA || {}} defaultExpanded={false} maxDepth={3} />
        </div>
        <div className="flex-1 p-3 overflow-y-auto">
          <div className="text-[10px] uppercase text-amber-400 font-semibold mb-1.5">
            Run B — {runB.videoName}
          </div>
          <JsonTreeViewer data={dataB || {}} defaultExpanded={false} maxDepth={3} />
        </div>
      </div>

      {/* Change summary */}
      {hasDifferences(activeDiff) && (
        <div className="px-4 py-2 border-t border-neutral-800 bg-neutral-950/30">
          <div className="flex flex-wrap gap-2 text-[10px]">
            {activeDiff.added.length > 0 && (
              <span className="text-green-400">
                + {activeDiff.added.join(", ")}
              </span>
            )}
            {activeDiff.removed.length > 0 && (
              <span className="text-red-400">
                − {activeDiff.removed.join(", ")}
              </span>
            )}
            {activeDiff.changed.length > 0 && (
              <span className="text-amber-400">
                ~ {activeDiff.changed.map((c) => c.path).join(", ")}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SNAPSHOT PICKER (for loading snapshots into A/B comparison)
// ============================================================================

function SnapshotPicker({
  snapshots,
  onSelect,
  onClose,
}: {
  snapshots: Array<{ id: string; name: string; sourceVideoName?: string; createdAt: string }>;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="mt-2 rounded-md border border-neutral-700 bg-neutral-900 overflow-hidden max-h-40 overflow-y-auto">
      {snapshots.length === 0 ? (
        <div className="p-2 text-[10px] text-neutral-600 text-center">
          No full pipeline snapshots saved
        </div>
      ) : (
        <div className="divide-y divide-neutral-800/50">
          {snapshots.map((snap) => (
            <button
              key={snap.id}
              onClick={() => onSelect(snap.id)}
              className="w-full text-left px-3 py-1.5 hover:bg-neutral-800/50 transition-colors"
            >
              <div className="text-xs text-neutral-200 truncate">{snap.name}</div>
              <div className="text-[10px] text-neutral-600">
                {snap.sourceVideoName && `${snap.sourceVideoName} · `}
                {new Date(snap.createdAt).toLocaleDateString()}
              </div>
            </button>
          ))}
        </div>
      )}
      <button
        onClick={onClose}
        className="w-full px-3 py-1 text-[10px] text-neutral-500 hover:text-neutral-300 border-t border-neutral-800 bg-neutral-950/50"
      >
        Cancel
      </button>
    </div>
  );
}
