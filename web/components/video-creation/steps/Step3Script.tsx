"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  Play,
  Loader2,
  CheckCircle,
  FileText,
  Search,
  Users,
  Layout,
  Check,
  Edit3,
  Copy,
} from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";

// ============================================================================
// TYPES
// ============================================================================

type ViewState = "review" | "progress" | "output";

interface OutlineOutput {
  researchDossier?: any;
  durationDecision?: any;
  spine?: {
    title?: string;
    beatCount: number;
    totalDurationSeconds: number;
    sections: Array<{
      name: string;
      startBeatIndex: number;
      endBeatIndex: number;
    }>;
    beats: Array<{
      index: number;
      classification: { type: string; section: string };
      contentSummary: string;
      keyPoints: string[];
    }>;
  };
  assetRegistry?: {
    characters: Array<{ id: string; name: string; role: string }>;
    locations: Array<{ id: string; name: string; essence: string }>;
    objects: Array<{ id: string; name: string; type: string }>;
  };
}

interface ScriptOutput {
  expandedBeats: Array<{
    beatIndex: number;
    narration: string;
    wordCount: number;
    qualityScore?: number;
  }>;
  finalScript: string;
  qualityValidation: {
    passed: boolean;
    factualAccuracy?: { passed: boolean; issues: string[] };
    consistency?: { passed: boolean; issues: string[] };
    engagement?: { passed: boolean; issues: string[] };
  };
}

interface Step3ScriptProps {
  videoId: string;
  projectId: string;
  outlineData: OutlineOutput | null;
  outlineConfig?: {
    topic: string;
    genre: string;
    angle?: string;
  } | null;
  initialScriptOutput?: ScriptOutput | null;
  onComplete: (script: string, output: ScriptOutput) => void;
  onSave: (script: string) => void;
  onBack: () => void;
  isLocked?: boolean;
  lockedMessage?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function Step3Script({
  videoId,
  projectId,
  outlineData,
  outlineConfig,
  initialScriptOutput,
  onComplete,
  onSave,
  onBack,
  isLocked,
  lockedMessage,
}: Step3ScriptProps) {
  const [view, setView] = useState<ViewState>(
    initialScriptOutput ? "output" : "review",
  );

  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<string>(
    initialScriptOutput ? "completed" : "idle",
  );
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<ScriptOutput | null>(
    initialScriptOutput || null,
  );
  const [isStarting, setIsStarting] = useState(false);
  const [activeTab, setActiveTab] = useState("script");

  // Editing state for script
  const [editingScript, setEditingScript] = useState<string>(
    initialScriptOutput?.finalScript || "",
  );
  const [isEditing, setIsEditing] = useState(false);
  const [copied, setCopied] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  // Update editing script when output changes
  useEffect(() => {
    if (output?.finalScript) {
      setEditingScript(output.finalScript);
    }
  }, [output]);

  // Poll for task updates
  const fetchTaskStatus = useCallback(
    async (id: string) => {
      const { data: statusData, error: statusError } = await supabase
        .from("tasks")
        .select(
          "status, progress_percent, current_phase, current_step, error_message",
        )
        .eq("id", id)
        .single();

      if (statusError) {
        console.error("[Step3] Failed to fetch task status:", statusError);
        return;
      }

      setTaskStatus(statusData.status);
      setProgress(statusData.progress_percent || 0);
      setCurrentStep(statusData.current_step);

      if (
        statusData.status === "completed" ||
        statusData.progress_percent === 100
      ) {
        const { data: outputData, error: outputError } = await supabase
          .from("tasks")
          .select("output_data")
          .eq("id", id)
          .single();

        if (outputError) {
          console.error("[Step3] Failed to fetch output data:", outputError);
          return;
        }

        if (outputData?.output_data) {
          const newOutput = outputData.output_data as ScriptOutput;
          setOutput(newOutput);
          setView("output");
          setTaskStatus("completed");
        }
      } else if (statusData.status === "failed") {
        setError(statusData.error_message || "Task failed");
        setView("review");
      }
    },
    [supabase],
  );

  // Polling effect
  useEffect(() => {
    if (view !== "progress" || !taskId) return;

    fetchTaskStatus(taskId);

    const interval = setInterval(() => {
      fetchTaskStatus(taskId);
    }, 2000);

    return () => clearInterval(interval);
  }, [view, taskId, fetchTaskStatus]);

  const startGeneration = async () => {
    if (!outlineData?.spine) {
      setError("Outline data is missing. Please complete Step 1 first.");
      return;
    }

    setError(null);
    setIsStarting(true);

    try {
      const response = await fetch("/api/process/script-writing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to start task");
      }

      setTaskId(data.taskId);
      setTaskStatus("pending");
      setProgress(0);
      setView("progress");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsStarting(false);
    }
  };

  const handleConfirm = () => {
    if (output) {
      const finalScript = isEditing ? editingScript : output.finalScript;
      onComplete(finalScript, output);
    }
  };

  const handleCopy = async () => {
    const textToCopy = isEditing ? editingScript : output?.finalScript || "";
    await navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Phase mapping for progress display (phases 5-6)
  const phases = [
    { key: "Script Expansion", label: "Script Expansion" },
    { key: "Assembly & Validation", label: "Assembly & Validation" },
  ];

  const getCurrentPhaseIndex = () => {
    const idx = phases.findIndex((p) => currentStep?.includes(p.key));
    return idx >= 0 ? idx : 0;
  };

  // =========================================================================
  // RENDER: REVIEW VIEW (Show outline data before generating script)
  // =========================================================================
  if (view === "review") {
    if (!outlineData?.spine) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center text-red-500">
            <FileText className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold">Outline Not Found</h2>
            <p className="text-neutral-500 max-w-md">
              Please complete Step 1 (Outline Generation) before writing the
              script.
            </p>
          </div>
          <Button onClick={onBack} variant="outline" className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Go Back to Outline
          </Button>
        </div>
      );
    }

    const beatCount = outlineData.spine.beatCount || 0;
    const assetCount =
      (outlineData.assetRegistry?.characters?.length || 0) +
      (outlineData.assetRegistry?.locations?.length || 0) +
      (outlineData.assetRegistry?.objects?.length || 0);

    return (
      <div className="flex h-[calc(100vh-160px)] gap-6 w-full max-w-[96vw] mx-auto px-8 py-6">
        {/* LEFT SIDEBAR */}
        <div className="w-80 shrink-0 flex flex-col gap-6 h-full">
          {/* Header & Stats */}
          <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-5 space-y-4 shrink-0">
            <div className="space-y-1">
              <h2 className="text-xl font-bold tracking-tight">
                Write Your Script
              </h2>
              <p className="text-neutral-500 text-sm">
                Review the outline below, then generate your script.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-neutral-800/50 rounded-lg text-center">
                <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-0.5">
                  Beats
                </div>
                <div className="text-lg font-mono text-white">{beatCount}</div>
              </div>
              <div className="p-3 bg-neutral-800/50 rounded-lg text-center">
                <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-0.5">
                  Assets
                </div>
                <div className="text-lg font-mono text-white">{assetCount}</div>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl overflow-hidden flex-1 flex flex-col">
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="flex-1 flex flex-col"
              orientation="vertical"
            >
              <TabsList className="bg-transparent flex-col flex-1 items-stretch p-0 gap-0 border-b border-neutral-800 w-full">
                <TabsTrigger
                  value="spine"
                  className="flex-1 justify-center gap-3 px-6 rounded-none border-l-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:bg-neutral-800/50 text-neutral-400 data-[state=active]:text-white transition-all text-sm uppercase tracking-wider font-medium"
                >
                  <Layout className="w-5 h-5" />
                  Outline
                </TabsTrigger>
                <TabsTrigger
                  value="assets"
                  className="flex-1 justify-center gap-3 px-6 rounded-none border-l-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:bg-neutral-800/50 text-neutral-400 data-[state=active]:text-white transition-all text-sm uppercase tracking-wider font-medium"
                >
                  <Users className="w-5 h-5" />
                  Assets
                </TabsTrigger>
                <TabsTrigger
                  value="research"
                  className="flex-1 justify-center gap-3 px-6 rounded-none border-l-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:bg-neutral-800/50 text-neutral-400 data-[state=active]:text-white transition-all text-sm uppercase tracking-wider font-medium"
                >
                  <Search className="w-5 h-5" />
                  Research
                </TabsTrigger>
              </TabsList>

              {/* Action Buttons */}
              <div className="mt-auto p-5 border-t border-neutral-800 space-y-3 shrink-0">
                {error && (
                  <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs">
                    {error}
                  </div>
                )}
                <Button
                  onClick={startGeneration}
                  disabled={isStarting || isLocked}
                  className="w-full h-12 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-bold uppercase tracking-widest gap-2"
                >
                  {isStarting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      Generate Script
                    </>
                  )}
                </Button>
                <Button
                  onClick={onBack}
                  variant="ghost"
                  className="w-full text-neutral-500 hover:text-white gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Stock Media
                </Button>
              </div>
            </Tabs>
          </div>
        </div>

        {/* RIGHT CONTENT AREA - Show outline summary */}
        <div className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden h-full">
          <div className="h-full overflow-y-auto p-6">
            {activeTab === "spine" && outlineData.spine && (
              <div className="space-y-4">
                <h3 className="text-lg font-bold mb-4">
                  {outlineData.spine.title || "Video Outline"}
                </h3>
                {outlineData.spine.beats.map((beat, index) => (
                  <div
                    key={index}
                    className="p-4 bg-neutral-800/30 border border-neutral-700 rounded-lg"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-6 h-6 rounded bg-orange-500/20 text-orange-500 flex items-center justify-center text-xs font-bold">
                        {index + 1}
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded bg-neutral-700 text-neutral-300">
                        {beat.classification?.type}
                      </span>
                      <span className="text-xs text-neutral-500">
                        {beat.classification?.section}
                      </span>
                    </div>
                    <p className="text-sm text-white">{beat.contentSummary}</p>
                  </div>
                ))}
              </div>
            )}

            {activeTab === "assets" && outlineData.assetRegistry && (
              <div className="space-y-6">
                {outlineData.assetRegistry.characters?.length > 0 && (
                  <div>
                    <h3 className="text-lg font-bold mb-4">Characters</h3>
                    <div className="grid grid-cols-2 gap-4">
                      {outlineData.assetRegistry.characters.map((char) => (
                        <div
                          key={char.id}
                          className="p-4 bg-neutral-800/50 border border-neutral-700 rounded-lg"
                        >
                          <div className="font-medium text-white">
                            {char.name}
                          </div>
                          <div className="text-sm text-neutral-500">
                            {char.role}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {outlineData.assetRegistry.locations?.length > 0 && (
                  <div>
                    <h3 className="text-lg font-bold mb-4">Locations</h3>
                    <div className="grid grid-cols-2 gap-4">
                      {outlineData.assetRegistry.locations.map((loc) => (
                        <div
                          key={loc.id}
                          className="p-4 bg-neutral-800/50 border border-neutral-700 rounded-lg"
                        >
                          <div className="font-medium text-white">
                            {loc.name}
                          </div>
                          <div className="text-sm text-neutral-500">
                            {loc.essence}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "research" && outlineData.researchDossier && (
              <div className="space-y-4">
                <h3 className="text-lg font-bold mb-4">Research Summary</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 bg-neutral-800/50 rounded-lg text-center">
                    <div className="text-2xl font-bold text-white">
                      {outlineData.researchDossier.metadata?.factCount || 0}
                    </div>
                    <div className="text-xs text-neutral-500 uppercase">
                      Verified Facts
                    </div>
                  </div>
                  <div className="p-4 bg-neutral-800/50 rounded-lg text-center">
                    <div className="text-2xl font-bold text-white">
                      {outlineData.researchDossier.metadata?.quoteCount || 0}
                    </div>
                    <div className="text-xs text-neutral-500 uppercase">
                      Quotes
                    </div>
                  </div>
                  <div className="p-4 bg-neutral-800/50 rounded-lg text-center">
                    <div className="text-2xl font-bold text-white">
                      {outlineData.researchDossier.metadata
                        ?.overallConfidence || 0}
                      %
                    </div>
                    <div className="text-xs text-neutral-500 uppercase">
                      Confidence
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // RENDER: PROGRESS VIEW
  // =========================================================================
  if (view === "progress") {
    const phaseIndex = getCurrentPhaseIndex();

    return (
      <div className="flex flex-col items-center gap-8 text-center pt-16">
        {/* Animated icon */}
        <div className="relative">
          <div className="absolute -inset-8 bg-orange-500/20 rounded-full blur-3xl animate-pulse" />
          <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/30">
            <Loader2 className="w-10 h-10 text-white animate-spin" />
          </div>
        </div>

        {/* Title */}
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">
            Writing Your Script
          </h2>
          <p className="text-neutral-500 text-sm">
            {currentStep || "Initializing..."}
          </p>
        </div>

        {/* Progress bar */}
        <div className="w-full max-w-md">
          <Progress value={progress} className="h-2" />
          <div className="flex justify-between mt-2 text-[10px] font-mono text-neutral-500">
            <span>
              {taskStatus === "running" ? "Processing..." : "Initializing..."}
            </span>
            <span>{progress}%</span>
          </div>
        </div>

        {/* Phase checklist */}
        <div className="w-full max-w-md bg-neutral-900/50 border border-neutral-800 rounded-lg p-4">
          <div className="space-y-3">
            {phases.map((phase, index) => {
              const isCompleted = index < phaseIndex;
              const isCurrent = index === phaseIndex;

              return (
                <div
                  key={phase.key}
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
                      <CheckCircle className="w-3 h-3" />
                    ) : isCurrent ? (
                      <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                    ) : (
                      <div className="w-2 h-2 bg-neutral-600 rounded-full" />
                    )}
                  </div>
                  <span className={isCurrent ? "font-medium" : ""}>
                    {phase.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-xs text-neutral-600 font-mono">
          Connected to AI workflow...
        </p>
      </div>
    );
  }

  // =========================================================================
  // RENDER: OUTPUT VIEW (Script Display & Editing)
  // =========================================================================
  const wordCount = editingScript.split(/\s+/).filter(Boolean).length;
  const estimatedDuration = Math.ceil(wordCount / 150);

  return (
    <div className="flex h-[calc(100vh-160px)] gap-6 w-full max-w-[96vw] mx-auto px-8 py-6">
      {/* LEFT SIDEBAR */}
      <div className="w-80 shrink-0 flex flex-col gap-6 h-full">
        {/* Header & Stats */}
        <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-5 space-y-4 shrink-0">
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-green-500/10 border border-green-500/20 rounded-full text-green-500 text-[10px] font-mono uppercase tracking-widest">
              <CheckCircle className="w-3 h-3" />
              Complete
            </div>
            <h2 className="text-xl font-bold tracking-tight whitespace-nowrap">
              Your Script
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-neutral-800/50 rounded-lg text-center">
              <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-0.5">
                Words
              </div>
              <div className="text-lg font-mono text-white">{wordCount}</div>
            </div>
            <div className="p-3 bg-neutral-800/50 rounded-lg text-center">
              <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-0.5">
                Est. Time
              </div>
              <div className="text-lg font-mono text-white">
                ~{estimatedDuration}m
              </div>
            </div>
          </div>

          {/* Quality Validation */}
          {output?.qualityValidation && (
            <div className="p-3 bg-neutral-800/30 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle
                  className={`w-4 h-4 ${
                    output.qualityValidation.passed
                      ? "text-green-500"
                      : "text-yellow-500"
                  }`}
                />
                <span className="text-sm font-medium">
                  Quality Check{" "}
                  {output.qualityValidation.passed ? "Passed" : "Review Needed"}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-5 space-y-3 flex-1 flex flex-col justify-end">
          <Button
            onClick={() => setIsEditing(!isEditing)}
            variant="outline"
            className="w-full h-10 gap-2 border-neutral-700"
          >
            <Edit3 className="w-4 h-4" />
            {isEditing ? "Preview" : "Edit Script"}
          </Button>
          <Button
            onClick={handleCopy}
            variant="outline"
            className="w-full h-10 gap-2 border-neutral-700"
          >
            {copied ? (
              <Check className="w-4 h-4" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
            {copied ? "Copied!" : "Copy Script"}
          </Button>
          <Button
            onClick={handleConfirm}
            className="w-full h-12 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-bold uppercase tracking-widest gap-2"
          >
            <Check className="w-4 h-4" />
            Confirm & Generate Audio
          </Button>
          <Button
            onClick={onBack}
            variant="ghost"
            className="w-full text-neutral-500 hover:text-white gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
        </div>
      </div>

      {/* RIGHT CONTENT AREA - Script */}
      <div className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden h-full">
        <div className="h-full flex flex-col">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-neutral-800 bg-neutral-800/30 shrink-0">
            <span className="text-xs font-mono text-neutral-500 uppercase tracking-wider">
              {isEditing ? "Editing Script" : "Script Preview"}
            </span>
            <div className="flex items-center gap-4 text-xs text-neutral-500">
              <span>{wordCount} words</span>
              <span>~{estimatedDuration} min read</span>
            </div>
          </div>

          {/* Script Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {isEditing ? (
              <Textarea
                value={editingScript}
                onChange={(e) => setEditingScript(e.target.value)}
                className="w-full h-full min-h-[500px] bg-transparent border-none resize-none focus:outline-none text-sm leading-relaxed font-mono text-white"
              />
            ) : (
              <pre className="text-sm text-neutral-300 leading-relaxed whitespace-pre-wrap font-mono">
                {editingScript}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
