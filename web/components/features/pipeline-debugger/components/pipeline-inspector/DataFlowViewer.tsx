"use client";

/**
 * Data Flow Viewer
 * ============================================================================
 * Visualizes the data that flows between pipeline steps.
 * Shows what outputs from step N become inputs to step N+1.
 */

import type { StepData, PipelineStep } from "../../types/pipeline-debugger";
import { STEP_CONFIGS, ALL_STEPS } from "../../utils/step-config";
import { ArrowRight, Database } from "lucide-react";

interface DataFlowViewerProps {
  steps: StepData[];
  className?: string;
}

/** Which output keys flow from step to the next step as inputs */
const DATA_FLOW_MAP: Record<number, Array<{ key: string; label: string; toStep: number }>> = {
  1: [
    { key: "outlineOutput", label: "Outline (spine, assets, research)", toStep: 2 },
    { key: "outlineConfig", label: "Config (stock level, voice, etc.)", toStep: 2 },
    { key: "outlineOutput", label: "Outline (for script expansion)", toStep: 3 },
  ],
  2: [
    { key: "stockMediaResults", label: "Stock media items", toStep: 5 },
  ],
  3: [
    { key: "script", label: "Final script text", toStep: 4 },
    { key: "scriptOutput", label: "Script structure", toStep: 5 },
  ],
  4: [
    { key: "audioChunks", label: "Audio chunks + timestamps", toStep: 5 },
  ],
  5: [
    { key: "avScriptPart1Output", label: "Shot plan + visual prompts", toStep: 6 },
    { key: "assetReferenceImages", label: "Reference images", toStep: 6 },
  ],
  6: [
    { key: "generatedMedia", label: "Images, videos, MG code", toStep: 7 },
  ],
  7: [
    { key: "edl", label: "Edit Decision List", toStep: 8 },
    { key: "editor_state", label: "Editor state JSON", toStep: 8 },
  ],
};

export function DataFlowViewer({ steps, className = "" }: DataFlowViewerProps) {
  return (
    <div className={`rounded-lg border border-neutral-800 bg-neutral-900/50 p-4 space-y-3 ${className}`}>
      <div className="flex items-center gap-2 mb-2">
        <Database className="w-4 h-4 text-neutral-400" />
        <h3 className="text-sm font-semibold text-neutral-200">Data Flow</h3>
      </div>

      {ALL_STEPS.slice(0, -1).map((stepNum) => {
        const flows = DATA_FLOW_MAP[stepNum] || [];
        const fromStep = steps.find((s) => s.step === stepNum);
        const fromConfig = STEP_CONFIGS[stepNum as PipelineStep];

        if (flows.length === 0) return null;

        return (
          <div key={stepNum} className="flex items-start gap-2">
            {/* From step badge */}
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${fromConfig.badgeClass} flex-shrink-0`}>
              {fromConfig.shortLabel}
            </span>

            <ArrowRight className="w-3 h-3 text-neutral-600 mt-1 flex-shrink-0" />

            {/* Flow items */}
            <div className="flex flex-wrap gap-1 flex-1">
              {flows.map((flow) => {
                const hasData = fromStep?.outputs?.[flow.key] != null;
                const toConfig = STEP_CONFIGS[flow.toStep as PipelineStep];

                return (
                  <span
                    key={`${stepNum}-${flow.key}-${flow.toStep}`}
                    className={`text-[10px] px-1.5 py-0.5 rounded border ${
                      hasData
                        ? "border-neutral-700 bg-neutral-800 text-neutral-300"
                        : "border-neutral-800 bg-neutral-900 text-neutral-600"
                    }`}
                    title={`${flow.label} → Step ${flow.toStep} (${toConfig.label})`}
                  >
                    {flow.label}
                    <span className="text-neutral-600 ml-1">→ {toConfig.shortLabel}</span>
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
