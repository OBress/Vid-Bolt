"use client";

/**
 * Replay Mode
 * ============================================================================
 * Step-through debugger interface. Allows setting breakpoints on pipeline
 * steps, viewing captured state when paused, overriding data, and controlling
 * execution flow (resume, skip, re-run step).
 *
 * Phase 4 — integrates with the breakpoint engine in the Zustand store.
 * Full wizard integration (actually pausing the wizard) is noted but will
 * require wiring into VideoCreationWizard's advanceToStep logic.
 */

import { useState, useMemo } from "react";
import {
  Play,
  Pause,
  SkipForward,
  Circle,
  AlertCircle,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StepIcon } from "../shared/StepIcon";
import { JsonTreeViewer } from "../shared/JsonTreeViewer";
import { STEP_CONFIGS, ALL_STEPS } from "../../utils/step-config";
import type {
  PipelineStep,
  Breakpoint,
  BreakpointCondition,
  PipelineDebuggerState,
  PipelineDebuggerActions,
} from "../../types/pipeline-debugger";

interface ReplayModeProps {
  store: PipelineDebuggerState & PipelineDebuggerActions;
  className?: string;
}

export function ReplayMode({ store, className = "" }: ReplayModeProps) {
  const [editingCondition, setEditingCondition] = useState<PipelineStep | null>(null);

  const breakpointsList = useMemo(() => {
    const list: Array<{ step: PipelineStep; bp: Breakpoint | null }> = ALL_STEPS.map((step) => ({
      step,
      bp: store.breakpoints.get(step) || null,
    }));
    return list;
  }, [store.breakpoints]);

  const activeBreakpoints = breakpointsList.filter((b) => b.bp !== null);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* ================================================================ */}
      {/* STATUS BAR */}
      {/* ================================================================ */}
      <div
        className={`rounded-lg border p-4 ${
          store.isPaused
            ? "border-purple-500/30 bg-purple-950/20"
            : "border-neutral-800 bg-neutral-900/50"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {store.isPaused ? (
              <>
                <div className="h-8 w-8 rounded-full bg-purple-500/20 flex items-center justify-center">
                  <Pause className="w-4 h-4 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-purple-300">
                    Paused at Step {store.pauseState?.step}
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Paused at {store.pauseState?.timestamp ? new Date(store.pauseState.timestamp).toLocaleTimeString() : ""}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="h-8 w-8 rounded-full bg-neutral-800 flex items-center justify-center">
                  <Play className="w-4 h-4 text-neutral-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-neutral-200">
                    Ready to Debug
                  </h3>
                  <p className="text-xs text-neutral-500">
                    {activeBreakpoints.length === 0
                      ? "Set breakpoints below, then run the video wizard. It will pause at breakpoints."
                      : `${activeBreakpoints.length} breakpoint${activeBreakpoints.length !== 1 ? "s" : ""} set. Run the video wizard to trigger.`}
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1.5">
            {store.isPaused && (
              <>
                <Button
                  size="sm"
                  onClick={store.resume}
                  className="bg-green-600 hover:bg-green-700 text-xs gap-1"
                >
                  <Play className="w-3 h-3" /> Resume
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={store.resume}
                  className="text-xs gap-1 border-neutral-700"
                >
                  <SkipForward className="w-3 h-3" /> Skip
                </Button>
              </>
            )}
            {activeBreakpoints.length > 0 && !store.isPaused && (
              <Button
                size="sm"
                variant="ghost"
                onClick={store.clearAllBreakpoints}
                className="text-xs text-neutral-500"
              >
                Clear All
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ================================================================ */}
      {/* BREAKPOINT CONFIGURATION */}
      {/* ================================================================ */}
      <div className="rounded-lg border border-neutral-800 overflow-hidden">
        <div className="px-4 py-2 bg-neutral-900/50 border-b border-neutral-800 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-neutral-300 uppercase">Breakpoints</h3>
          <span className="text-[10px] text-neutral-600">
            Click to toggle · right-click for conditions
          </span>
        </div>

        <div className="divide-y divide-neutral-800/50">
          {breakpointsList.map(({ step, bp }) => {
            const config = STEP_CONFIGS[step];
            const isSet = bp !== null;
            const isConditional = bp?.type === "conditional";
            const isPausedHere = store.isPaused && store.pauseState?.step === step;

            return (
              <div
                key={step}
                className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${
                  isPausedHere
                    ? "bg-purple-950/20"
                    : isSet
                    ? "bg-neutral-800/20"
                    : ""
                }`}
              >
                {/* Breakpoint toggle */}
                <button
                  onClick={() => store.toggleBreakpoint(step)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setEditingCondition(editingCondition === step ? null : step);
                  }}
                  className="flex-shrink-0"
                  title={isSet ? "Remove breakpoint" : "Set breakpoint"}
                >
                  <Circle
                    className={`w-4 h-4 transition-colors ${
                      isPausedHere
                        ? "fill-purple-500 text-purple-500"
                        : isSet
                        ? "fill-red-500 text-red-500"
                        : "text-neutral-700 hover:text-neutral-500"
                    }`}
                  />
                </button>

                <StepIcon step={step} size="sm" />
                <span className="text-xs font-medium text-neutral-200 flex-1">
                  Step {step}: {config.label}
                </span>

                {/* Conditional badge */}
                {isConditional && bp?.condition && (
                  <span
                    className="text-[9px] px-1.5 py-0.5 rounded bg-amber-900/30 text-amber-400 border border-amber-800/30 max-w-32 truncate"
                    title={bp.condition.description}
                  >
                    if: {bp.condition.description}
                  </span>
                )}

                {/* Paused indicator */}
                {isPausedHere && (
                  <span className="text-[10px] text-purple-400 font-semibold animate-pulse">
                    ▶ PAUSED
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ================================================================ */}
      {/* CONDITION EDITOR */}
      {/* ================================================================ */}
      {editingCondition !== null && (
        <ConditionEditor
          step={editingCondition}
          existingCondition={store.breakpoints.get(editingCondition)?.condition}
          onSave={(condition) => {
            store.setConditionalBreakpoint(editingCondition, condition);
            setEditingCondition(null);
          }}
          onClose={() => setEditingCondition(null)}
        />
      )}

      {/* ================================================================ */}
      {/* CAPTURED STATE (when paused) */}
      {/* ================================================================ */}
      {store.isPaused && store.pauseState && (
        <div className="rounded-lg border border-purple-500/30 bg-purple-950/10 overflow-hidden">
          <div className="px-4 py-2 border-b border-purple-500/20 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-purple-300 uppercase">Captured State</h3>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                navigator.clipboard.writeText(
                  JSON.stringify(store.pauseState?.capturedState, null, 2)
                )
              }
              className="text-xs gap-1 text-neutral-400"
            >
              <Copy className="w-3 h-3" /> Copy
            </Button>
          </div>
          <div className="p-4 max-h-80 overflow-y-auto">
            <JsonTreeViewer
              data={store.pauseState.capturedState}
              defaultExpanded={true}
              maxDepth={4}
            />
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* INSTRUCTIONS */}
      {/* ================================================================ */}
      {!store.isPaused && (
        <div className="rounded-lg border border-neutral-800/50 bg-neutral-900/30 p-4">
          <h4 className="text-xs font-semibold text-neutral-400 mb-2">How to use Replay Mode</h4>
          <ol className="text-xs text-neutral-500 space-y-1.5 list-decimal list-inside">
            <li>Set breakpoints by clicking the circles next to each step above</li>
            <li>Right-click a breakpoint to add a conditional expression</li>
            <li>Open the Video Creation Wizard and start creating a video</li>
            <li>When the pipeline reaches a breakpoint, it will pause and show the captured state here</li>
            <li>Inspect the state, modify it if needed, then Resume or Skip</li>
          </ol>
          <div className="mt-3 px-3 py-2 rounded bg-amber-900/10 border border-amber-800/20">
            <p className="text-[10px] text-amber-400/80">
              <AlertCircle className="w-3 h-3 inline mr-1" />
              Wizard integration requires hooking into advanceToStep — this intercepts the wizard&apos;s step
              transitions. Currently, breakpoint state is tracked but not yet wired to the live wizard.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// CONDITION EDITOR
// ============================================================================

function ConditionEditor({
  step,
  existingCondition,
  onSave,
  onClose,
}: {
  step: PipelineStep;
  existingCondition?: BreakpointCondition;
  onSave: (condition: BreakpointCondition) => void;
  onClose: () => void;
}) {
  const [expression, setExpression] = useState(existingCondition?.expression || "");
  const [description, setDescription] = useState(existingCondition?.description || "");

  const config = STEP_CONFIGS[step];

  return (
    <div className="rounded-lg border border-amber-500/20 bg-amber-950/10 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-amber-300">
          Conditional Breakpoint — Step {step}: {config.label}
        </h4>
        <button onClick={onClose} className="text-neutral-500 hover:text-neutral-300 text-xs">
          Cancel
        </button>
      </div>

      <div>
        <label className="text-[10px] uppercase text-neutral-500 font-semibold">
          Description
        </label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. 'Break when fewer than 10 shots'"
          className="w-full mt-1 px-3 py-1.5 text-xs bg-neutral-900 border border-neutral-700 rounded-md text-neutral-200 focus:outline-none focus:border-neutral-500"
        />
      </div>

      <div>
        <label className="text-[10px] uppercase text-neutral-500 font-semibold">
          Condition Expression
        </label>
        <input
          type="text"
          value={expression}
          onChange={(e) => setExpression(e.target.value)}
          placeholder="e.g. outputs.shots.length < 10"
          className="w-full mt-1 px-3 py-1.5 text-xs font-mono bg-neutral-950 border border-neutral-700 rounded-md text-amber-300 placeholder-neutral-600 focus:outline-none focus:border-amber-500/50"
        />
        <p className="text-[10px] text-neutral-600 mt-1">
          JS expression evaluated against step data. Available: inputs, outputs, config, errors.
        </p>
      </div>

      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={() => onSave({ expression, description })}
          disabled={!expression.trim()}
          className="bg-amber-600 hover:bg-amber-700 text-xs"
        >
          Set Condition
        </Button>
      </div>
    </div>
  );
}
