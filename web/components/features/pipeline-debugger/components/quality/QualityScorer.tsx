"use client";

/**
 * Quality Scorer
 * ============================================================================
 * Rate pipeline step outputs on multiple quality dimensions (1-5 stars).
 * Tracks scores over time for regression detection.
 */

import { useState, useMemo } from "react";
import { Star, BarChart3, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StepIcon } from "../shared/StepIcon";
import { STEP_CONFIGS, ALL_STEPS } from "../../utils/step-config";
import type {
  PipelineStep,
  QualityDimension,
  QualityScore,
  PipelineRun,
} from "../../types/pipeline-debugger";

interface QualityScorerProps {
  run: PipelineRun | null;
  selectedStep: PipelineStep | null;
  className?: string;
}

const DIMENSIONS: Array<{ id: QualityDimension; label: string; description: string }> = [
  { id: "prompt_adherence", label: "Prompt Adherence", description: "How well does the output match the input prompt?" },
  { id: "visual_quality", label: "Visual Quality", description: "Quality of generated images/videos" },
  { id: "pacing", label: "Pacing", description: "Flow and rhythm of the content" },
  { id: "coherence", label: "Coherence", description: "Logical consistency across the pipeline" },
  { id: "overall", label: "Overall", description: "General impression" },
];

const STORAGE_KEY = "pipeline-debugger-quality-scores";

function loadScores(): QualityScore[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch { return []; }
}

function persistScores(scores: QualityScore[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scores));
}

export function QualityScorer({ run, selectedStep, className = "" }: QualityScorerProps) {
  const [scores, setScores] = useState<QualityScore[]>(() => loadScores());
  const [dimensionScores, setDimensionScores] = useState<Partial<Record<QualityDimension, number>>>({});
  const [notes, setNotes] = useState("");

  const currentStepScores = useMemo(() => {
    if (!run || !selectedStep) return [];
    return scores.filter((s) => s.videoId === run.id && s.pipelineStep === selectedStep);
  }, [scores, run, selectedStep]);

  const videoScores = useMemo(() => {
    if (!run) return [];
    return scores.filter((s) => s.videoId === run.id);
  }, [scores, run]);

  const handleSubmit = () => {
    if (!run || !selectedStep) return;
    const overall = dimensionScores.overall || 3;
    const newScore: QualityScore = {
      id: crypto.randomUUID(),
      userId: "",
      videoId: run.id,
      pipelineStep: selectedStep,
      overallScore: overall,
      dimensionScores: { ...dimensionScores },
      notes: notes || null,
      createdAt: new Date().toISOString(),
    };
    const updated = [newScore, ...scores];
    setScores(updated);
    persistScores(updated);
    setDimensionScores({});
    setNotes("");
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Scoring form */}
      {run && selectedStep ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4 space-y-4">
          <div className="flex items-center gap-2">
            <StepIcon step={selectedStep} size="sm" />
            <h3 className="text-xs font-semibold text-neutral-200">
              Rate Step {selectedStep}: {STEP_CONFIGS[selectedStep].label}
            </h3>
            <span className="text-[10px] text-neutral-600 ml-auto">{run.videoName}</span>
          </div>

          <div className="space-y-2">
            {DIMENSIONS.map((dim) => (
              <div key={dim.id} className="flex items-center gap-3">
                <span className="text-xs text-neutral-400 w-32 flex-shrink-0">{dim.label}</span>
                <StarRating
                  value={dimensionScores[dim.id] || 0}
                  onChange={(v) => setDimensionScores((prev) => ({ ...prev, [dim.id]: v }))}
                />
                <span className="text-[10px] text-neutral-600 flex-1">{dim.description}</span>
              </div>
            ))}
          </div>

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes..."
            rows={2}
            className="w-full px-3 py-1.5 text-xs bg-neutral-950 border border-neutral-700 rounded-md text-neutral-300 placeholder-neutral-600 focus:outline-none focus:border-neutral-500 resize-none"
          />

          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!dimensionScores.overall}
            className="bg-emerald-600 hover:bg-emerald-700 text-xs"
          >
            Submit Score
          </Button>
        </div>
      ) : (
        <div className="text-center py-6 text-neutral-500 text-sm">
          Select a video and step to score.
        </div>
      )}

      {/* Score history */}
      {currentStepScores.length > 0 && (
        <div className="rounded-lg border border-neutral-800 overflow-hidden">
          <div className="px-4 py-2 bg-neutral-900/50 border-b border-neutral-800">
            <h4 className="text-xs font-semibold text-neutral-300 uppercase">Previous Scores</h4>
          </div>
          <div className="divide-y divide-neutral-800/50">
            {currentStepScores.map((score) => (
              <div key={score.id} className="px-4 py-2 flex items-center gap-3">
                <StarDisplay value={score.overallScore} />
                <div className="flex-1 min-w-0">
                  <div className="flex gap-2 text-[10px]">
                    {Object.entries(score.dimensionScores).map(([dim, val]) => (
                      <span key={dim} className="text-neutral-500">
                        {dim.replace("_", " ")}: {val}★
                      </span>
                    ))}
                  </div>
                  {score.notes && (
                    <p className="text-[10px] text-neutral-500 mt-0.5 truncate">{score.notes}</p>
                  )}
                </div>
                <span className="text-[10px] text-neutral-600 flex-shrink-0">
                  {new Date(score.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-step summary */}
      {run && videoScores.length > 0 && (
        <div className="rounded-lg border border-neutral-800 overflow-hidden">
          <div className="px-4 py-2 bg-neutral-900/50 border-b border-neutral-800">
            <h4 className="text-xs font-semibold text-neutral-300 uppercase">
              Quality Overview — {run.videoName}
            </h4>
          </div>
          <div className="grid grid-cols-4 gap-2 p-3">
            {ALL_STEPS.map((step) => {
              const stepScores = videoScores.filter((s) => s.pipelineStep === step);
              if (stepScores.length === 0) return null;
              const avg = stepScores.reduce((a, s) => a + s.overallScore, 0) / stepScores.length;
              return (
                <div key={step} className="p-2 rounded bg-neutral-950 border border-neutral-800 text-center">
                  <StepIcon step={step} size="sm" className="mx-auto mb-1" />
                  <div className="text-xs font-medium text-neutral-200">{avg.toFixed(1)}★</div>
                  <div className="text-[9px] text-neutral-600">{stepScores.length} rating{stepScores.length !== 1 ? "s" : ""}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// STAR RATING
// ============================================================================

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          onClick={() => onChange(star)}
          className="p-0.5"
        >
          <Star
            className={`w-4 h-4 transition-colors ${
              star <= value
                ? "fill-amber-400 text-amber-400"
                : "text-neutral-700 hover:text-neutral-500"
            }`}
          />
        </button>
      ))}
    </div>
  );
}

function StarDisplay({ value }: { value: number }) {
  return (
    <div className="flex gap-0.5 flex-shrink-0">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`w-3 h-3 ${
            star <= value ? "fill-amber-400 text-amber-400" : "text-neutral-700"
          }`}
        />
      ))}
    </div>
  );
}
