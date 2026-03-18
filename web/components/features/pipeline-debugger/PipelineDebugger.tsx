"use client";

/**
 * Pipeline Debugger — Main Entry Point
 * ============================================================================
 * Orchestrates all sub-views: Pipeline Inspector, Run Comparator,
 * Replay mode, and Snapshot Manager. Accessible from the Admin DevTools tab.
 */

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Search,
  GitCompare,
  Play,
  Database,
  Settings2,
  Bug,
  ClipboardCopy,
  Check,
} from "lucide-react";
import { usePipelineDebuggerStore } from "./stores/pipeline-debugger-store";
import { VideoProjectSelector } from "./components/shared/VideoProjectSelector";
import { PipelineTimeline } from "./components/pipeline-inspector/PipelineTimeline";
import { StepInspectorPanel } from "./components/pipeline-inspector/StepInspectorPanel";
import { DataFlowViewer } from "./components/pipeline-inspector/DataFlowViewer";
import { MediaPreviewPanel } from "./components/pipeline-inspector/MediaPreviewPanel";
import { JsonTreeViewer } from "./components/shared/JsonTreeViewer";
import { SnapshotManager } from "./components/snapshot-manager/SnapshotManager";
import { RunComparator } from "./components/run-comparator/RunComparator";
import { ReplayMode } from "./components/replay-mode/ReplayMode";
import { QualityScorer } from "./components/quality/QualityScorer";
import { PerformanceProfiler } from "./components/quality/PerformanceProfiler";
import { AnnotationSystem } from "./components/quality/AnnotationSystem";

import type { DebuggerMode, PipelineStep, StepData, PipelineRun, PipelineDebuggerState, PipelineDebuggerActions } from "./types/pipeline-debugger";
import { STEP_CONFIGS } from "./utils/step-config";
import { buildDebugContext } from "./utils/copy-debug-context";

interface PipelineDebuggerProps {
  onClose: () => void;
}

const MODES: Array<{ id: DebuggerMode; label: string; icon: typeof Search; description: string }> = [
  { id: "inspect", label: "Inspect", icon: Search, description: "Browse pipeline runs" },
  { id: "compare", label: "Compare", icon: GitCompare, description: "A/B comparison" },
  { id: "replay", label: "Replay", icon: Play, description: "Step-through with breakpoints" },
  { id: "snapshot", label: "Snapshots", icon: Database, description: "Saved pipeline states" },
];

export function PipelineDebugger({ onClose }: PipelineDebuggerProps) {
  const store = usePipelineDebuggerStore();

  const selectedStepData = useMemo(() => {
    if (!store.selectedRun || store.selectedStep === null) return null;
    return store.selectedRun.steps.find((s) => s.step === store.selectedStep) || null;
  }, [store.selectedRun, store.selectedStep]);

  const breakpointSet = useMemo(() => {
    const set = new Set<number>();
    for (const [step] of store.breakpoints) {
      set.add(step);
    }
    return set;
  }, [store.breakpoints]);

  // ---- Resizable panels ----
  const [leftWidth, setLeftWidth] = useState(192);   // default ~w-48
  const [rightWidth, setRightWidth] = useState(288);  // default ~w-72
  const [copyFeedback, setCopyFeedback] = useState(false);
  const draggingRef = useRef<"left" | "right" | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((side: "left" | "right") => {
    draggingRef.current = side;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();

      if (draggingRef.current === "left") {
        const newWidth = Math.min(400, Math.max(120, e.clientX - rect.left));
        setLeftWidth(newWidth);
      } else {
        const newWidth = Math.min(500, Math.max(200, rect.right - e.clientX));
        setRightWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      if (draggingRef.current) {
        draggingRef.current = null;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white overflow-hidden">
      {/* ================================================================== */}
      {/* TOP BAR */}
      {/* ================================================================== */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-neutral-800 bg-neutral-950/50 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="rounded-full hover:bg-neutral-800 h-8 w-8"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-red-500/10 flex items-center justify-center">
              <Bug className="w-3.5 h-3.5 text-red-400" />
            </div>
            <h1 className="text-sm font-bold text-white">Pipeline Debugger</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Copy Debug Context button — copies steps 5-7 data (wizard steps 3-4) */}
          <button
            onClick={async () => {
              if (!store.selectedRun) return;
              try {
                const ctx = buildDebugContext(store.selectedRun);
                await navigator.clipboard.writeText(ctx);
                setCopyFeedback(true);
                setTimeout(() => setCopyFeedback(false), 2000);
              } catch (err) {
                console.error('Failed to copy debug context:', err);
              }
            }}
            disabled={!store.selectedRun}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
              copyFeedback
                ? 'bg-green-900/30 border-green-500/50 text-green-400'
                : store.selectedRun
                  ? 'bg-neutral-900 border-neutral-700 text-neutral-300 hover:border-orange-500/50 hover:text-orange-400'
                  : 'bg-neutral-900/50 border-neutral-800 text-neutral-600 cursor-not-allowed'
            }`}
            title="Copy debug context for Production & Editor steps to clipboard (for AI debugging)"
          >
            {copyFeedback ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <ClipboardCopy className="w-3.5 h-3.5" />
            )}
            {copyFeedback ? 'Copied!' : 'Copy Debug'}
          </button>

          {/* Mode tabs */}
          <div className="flex items-center bg-neutral-900 rounded-lg border border-neutral-800 p-0.5">
            {MODES.map((mode) => {
              const Icon = mode.icon;
              const isActive = store.mode === mode.id;
              return (
                <button
                  key={mode.id}
                  onClick={() => store.setMode(mode.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-neutral-800 text-white"
                      : "text-neutral-500 hover:text-neutral-300"
                  }`}
                  title={mode.description}
                >
                  <Icon className="w-3 h-3" />
                  {mode.label}
                </button>
              );
            })}
          </div>

          {/* Video selector */}
          <VideoProjectSelector
            selectedVideoId={store.selectedVideoId}
            onSelect={(id) => store.selectVideo(id)}
          />
        </div>
      </div>

      {/* ================================================================== */}
      {/* MAIN CONTENT — RESIZABLE THREE PANEL LAYOUT */}
      {/* ================================================================== */}
      <div ref={containerRef} className="flex flex-1 min-h-0 overflow-hidden">
        {/* LEFT SIDEBAR — Step list + actions */}
        <div
          style={{ width: leftWidth }}
          className="border-r border-neutral-800 bg-neutral-950/30 flex flex-col overflow-y-auto flex-shrink-0"
        >
          <StepSidebar
            steps={store.selectedRun?.steps || []}
            selectedStep={store.selectedStep}
            onSelectStep={store.selectStep}
            breakpoints={breakpointSet}
          />
        </div>

        {/* LEFT RESIZE HANDLE */}
        <div
          onMouseDown={() => handleMouseDown("left")}
          className="w-1 flex-shrink-0 cursor-col-resize group relative hover:bg-red-500/30 active:bg-red-500/40 transition-colors"
        >
          <div className="absolute inset-y-0 -left-1 -right-1" />
        </div>

        {/* CENTER — Main content area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-w-0">
          {store.mode === "inspect" && (
            <InspectMode store={store} breakpointSet={breakpointSet} />
          )}

          {store.mode === "compare" && (
            <RunComparator store={store} />
          )}

          {store.mode === "replay" && (
            <ReplayMode store={store} />
          )}

          {store.mode === "snapshot" && (
            <SnapshotManager
              currentStepData={selectedStepData ?? undefined}
              currentRun={store.selectedRun}
              currentVideoId={store.selectedVideoId}
              currentVideoName={store.selectedRun?.videoName}
            />
          )}
        </div>

        {/* RIGHT RESIZE HANDLE */}
        <div
          onMouseDown={() => handleMouseDown("right")}
          className="w-1 flex-shrink-0 cursor-col-resize group relative hover:bg-red-500/30 active:bg-red-500/40 transition-colors"
        >
          <div className="absolute inset-y-0 -left-1 -right-1" />
        </div>

        {/* RIGHT PANEL — Detail view */}
        <div
          style={{ width: rightWidth }}
          className="border-l border-neutral-800 bg-neutral-950/30 flex flex-col overflow-y-auto flex-shrink-0"
        >
          <RightPanel
            stepData={selectedStepData}
            run={store.selectedRun}
            selectedStep={store.selectedStep}
            activeTab={store.rightPanelTab}
            onTabChange={store.setRightPanelTab}
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// STEP SIDEBAR
// ============================================================================

function StepSidebar({
  steps,
  selectedStep,
  onSelectStep,
  breakpoints,
}: {
  steps: Array<{ step: PipelineStep; label: string; status: string }>;
  selectedStep: PipelineStep | null;
  onSelectStep: (step: PipelineStep) => void;
  breakpoints: Set<number>;
}) {

  return (
    <div className="p-2 space-y-1">
      <div className="px-2 py-1.5 text-[10px] uppercase text-neutral-600 font-semibold">
        Pipeline Steps
      </div>
      {([1, 2, 3, 4, 5, 6, 7, 8] as PipelineStep[]).map((stepNum) => {
        const stepData = steps.find((s) => s.step === stepNum);
        const config = STEP_CONFIGS[stepNum];
        const isSelected = selectedStep === stepNum;
        const hasBreakpoint = breakpoints.has(stepNum);
        const Icon = config.icon;

        const statusDot =
          stepData?.status === "complete"
            ? "bg-green-400"
            : stepData?.status === "error"
            ? "bg-red-400"
            : stepData?.status === "in-progress"
            ? "bg-amber-400 animate-pulse"
            : "bg-neutral-700";

        return (
          <button
            key={stepNum}
            onClick={() => onSelectStep(stepNum)}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors ${
              isSelected
                ? "bg-neutral-800 text-white"
                : "text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${statusDot} flex-shrink-0`} />
            <Icon className={`w-3.5 h-3.5 ${config.textClass} flex-shrink-0`} />
            <span className="text-xs truncate flex-1">{config.label}</span>
            {hasBreakpoint && (
              <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// INSPECT MODE CONTENT
// ============================================================================

function InspectMode({
  store,
  breakpointSet,
}: {
  store: PipelineDebuggerState & PipelineDebuggerActions;
  breakpointSet: Set<number>;
}) {
  if (!store.selectedVideoId) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3 max-w-sm">
          <div className="h-16 w-16 rounded-full bg-neutral-800 flex items-center justify-center mx-auto">
            <Search className="w-8 h-8 text-neutral-600" />
          </div>
          <h3 className="text-lg font-medium text-neutral-200">Select a Video</h3>
          <p className="text-sm text-neutral-500">
            Choose a video project from the dropdown above to inspect its pipeline data at every step.
          </p>
        </div>
      </div>
    );
  }

  if (store.isLoadingRun) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="w-6 h-6 border-2 border-neutral-600 border-t-white rounded-full animate-spin mx-auto" />
          <p className="text-sm text-neutral-500">Loading pipeline data...</p>
        </div>
      </div>
    );
  }

  if (!store.selectedRun) {
    return (
      <div className="flex-1 flex items-center justify-center text-neutral-500 text-sm">
        Failed to load pipeline data.
      </div>
    );
  }

  const selectedStepData = store.selectedStep
    ? store.selectedRun.steps.find((s) => s.step === store.selectedStep) || null
    : null;

  return (
    <>
      {/* Pipeline Timeline */}
      <PipelineTimeline
        steps={store.selectedRun.steps}
        selectedStep={store.selectedStep}
        onSelectStep={store.selectStep}
        breakpoints={breakpointSet}
      />

      {/* Step Inspector */}
      {selectedStepData ? (
        <StepInspectorPanel
          step={selectedStepData}
          activeTab={store.inspectorTab}
          onTabChange={store.setInspectorTab}
        />
      ) : (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-8 text-center">
          <p className="text-neutral-500 text-sm">
            Click a step above or in the sidebar to inspect its data.
          </p>
        </div>
      )}

      {/* Data Flow */}
      <DataFlowViewer steps={store.selectedRun.steps} />
    </>
  );
}

// ============================================================================
// RIGHT PANEL
// ============================================================================

function RightPanel({
  stepData,
  run,
  selectedStep,
  activeTab,
  onTabChange,
}: {
  stepData: StepData | null;
  run: PipelineRun | null;
  selectedStep: PipelineStep | null;
  activeTab: string;
  onTabChange: (tab: "json" | "media" | "prompts" | "annotations" | "quality" | "performance") => void;
}) {
  const tabs = [
    { id: "json" as const, label: "JSON" },
    { id: "media" as const, label: "Media" },
    { id: "quality" as const, label: "Quality" },
    { id: "performance" as const, label: "Perf" },
    { id: "annotations" as const, label: "Notes" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b border-neutral-800 flex-shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex-1 px-1.5 py-2 text-[10px] uppercase font-semibold transition-colors ${
              activeTab === tab.id
                ? "text-white border-b-2 border-red-500"
                : "text-neutral-600 hover:text-neutral-400"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === "json" ? (
          !stepData ? (
            <div className="text-xs text-neutral-600 text-center py-8">
              Select a step to view details
            </div>
          ) : (
            <div className="space-y-3">
              <JsonSection label="Inputs" data={stepData.inputs} />
              <JsonSection label="Outputs" data={stepData.outputs} />
              <JsonSection label="Config" data={stepData.config} />
            </div>
          )
        ) : activeTab === "media" ? (
          stepData ? (
            <MediaPreviewPanel media={stepData.media} />
          ) : (
            <div className="text-xs text-neutral-600 text-center py-8">
              Select a step to view media
            </div>
          )
        ) : activeTab === "quality" ? (
          <QualityScorer run={run} selectedStep={selectedStep} />
        ) : activeTab === "performance" ? (
          <PerformanceProfiler run={run} />
        ) : activeTab === "annotations" ? (
          <AnnotationSystem run={run} selectedStep={selectedStep} />
        ) : null}
      </div>
    </div>
  );
}

function JsonSection({ label, data }: { label: string; data: unknown }) {
  return (
    <div>
      <h4 className="text-[10px] uppercase text-neutral-500 font-semibold mb-1">{label}</h4>
      <JsonTreeViewer data={data} defaultExpanded={false} maxDepth={4} />
    </div>
  );
}

// ============================================================================
// PLACEHOLDER
// ============================================================================

function _ComingSoonPlaceholder({
  mode,
  description,
}: {
  mode: string;
  description: string;
}) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-3 max-w-md">
        <div className="h-16 w-16 rounded-full bg-neutral-800 flex items-center justify-center mx-auto">
          <Settings2 className="w-8 h-8 text-neutral-600" />
        </div>
        <h3 className="text-lg font-medium text-neutral-200">{mode}</h3>
        <p className="text-sm text-neutral-500">{description}</p>
        <p className="text-xs text-neutral-600">Coming in a future phase.</p>
      </div>
    </div>
  );
}
