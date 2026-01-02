"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Play,
  Loader2,
  CheckCircle,
  XCircle,
  FileText,
  Search,
  Users,
  MapPin,
  Layout,
  Copy,
  Check,
  Wand2,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { createBrowserClient } from "@supabase/ssr";

// Types for the Universal Script output
interface UniversalScriptOutput {
  researchDossier?: {
    metadata: {
      topic: string;
      factCount: number;
      quoteCount: number;
      overallConfidence: number;
    };
    facts: Array<{
      id: string;
      statement: string;
      confidence: string;
      sources?: Array<{ title: string; url?: string }>;
    }>;
    quotes: Array<{ id: string; quote: string; speaker: string }>;
    entities: Array<{ type: string; name: string; role: string }>;
    worksCited?: Array<{
      title: string;
      url?: string;
      author?: string;
      reliabilityTier: number;
    }>;
  } & Record<string, any>;
  spine?: {
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
    }>;
  };
  assetRegistry?: {
    characters: Array<{
      id: string;
      name: string;
      role: string;
      physicalCharacteristics?: any;
      visualInstructions?: any;
      wardrobe?: any;
    }>;
    locations: Array<{
      id: string;
      name: string;
      essence: string;
      structuralDetails?: any;
      environmentalDetails?: any;
      visualInstructions?: any;
      lighting?: any;
    }>;
    objects: Array<{
      id: string;
      name: string;
      type: string;
      physicalDescription?: any;
      visualInstructions?: any;
    }>;
  };
  expandedBeats?: Array<{
    beatIndex: number;
    narration: string;
    wordCount: number;
    qualityScore?: number;
  }>;
  finalScript?: string;
  qualityValidation?: {
    passed: boolean;
    factualAccuracy?: { passed: boolean; issues: string[] };
    consistency?: { passed: boolean; issues: string[] };
    engagement?: { passed: boolean; issues: string[] };
  };
}

interface Step4UniversalScriptProps {
  videoId: string;
  initialTopic: string;
  onComplete: (output: UniversalScriptOutput) => void;
  onBack: () => void;
  isLocked?: boolean;
  lockedMessage?: string;
}

type ViewState = "config" | "progress" | "output";
type ScriptGenre =
  | "documentary"
  | "educational"
  | "narrative_fiction"
  | "historical_fiction"
  | "opinion_essay"
  | "tutorial"
  | "news";
type ResearchToggle = "deep" | "full" | "light" | "off";

export function Step4UniversalScript({
  videoId,
  initialTopic,
  onComplete,
  onBack,
  isLocked,
  lockedMessage,
}: Step4UniversalScriptProps) {
  const [view, setView] = useState<ViewState>("config");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<string>("idle");
  const [progress, setProgress] = useState(0);
  const [currentPhase, setCurrentPhase] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<UniversalScriptOutput | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<any | null>(null);
  const [isAssetDetailOpen, setIsAssetDetailOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  // Form state
  const [topic, setTopic] = useState(initialTopic);
  const [genre, setGenre] = useState<ScriptGenre>("documentary");
  const [researchToggle, setResearchToggle] = useState<ResearchToggle>("full");
  const [durationRange, setDurationRange] = useState([5, 10]); // [min, max] in minutes
  const [angle, setAngle] = useState("");

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Poll for task updates
  const fetchTaskStatus = useCallback(
    async (id: string) => {
      const { data: statusData, error: statusError } = await supabase
        .from("tasks")
        .select(
          "status, progress_percent, current_phase, current_step, error_message"
        )
        .eq("id", id)
        .single();

      if (statusError) {
        console.error("[Step4] Failed to fetch task status:", statusError);
        return;
      }

      setTaskStatus(statusData.status);
      setProgress(statusData.progress_percent || 0);
      setCurrentPhase(statusData.current_phase);
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
          console.error("[Step4] Failed to fetch output data:", outputError);
          return;
        }

        if (outputData?.output_data) {
          setOutput(outputData.output_data as UniversalScriptOutput);
          setView("output");
          setTaskStatus("completed");
        }
      } else if (statusData.status === "failed") {
        setError(statusData.error_message || "Task failed");
        setView("config");
      }
    },
    [supabase]
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
    setError(null);
    setIsStarting(true);

    try {
      const response = await fetch("/api/universal-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          genre,
          researchToggle,
          durationRange: {
            minMinutes: durationRange[0],
            maxMinutes: durationRange[1],
          },
          angle: angle || undefined,
        }),
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
      onComplete(output);
    }
  };

  const reset = () => {
    setTaskId(null);
    setTaskStatus("idle");
    setProgress(0);
    setCurrentPhase(null);
    setError(null);
    setOutput(null);
    setView("config");
  };

  // Phase mapping for display
  const phases = [
    { key: "Research & Analysis", label: "Research & Analysis" },
    { key: "Content Scoping", label: "Content Scoping" },
    { key: "Spine Generation", label: "Spine Generation" },
    { key: "Asset Registry", label: "Asset Registry" },
    { key: "Script Expansion", label: "Script Expansion" },
    { key: "Assembly & Validation", label: "Assembly & Validation" },
  ];

  const getCurrentPhaseIndex = () => {
    const idx = phases.findIndex((p) => currentStep?.includes(p.key));
    return idx >= 0 ? idx : 0;
  };

  // =========================================================================
  // RENDER: CONFIG VIEW
  // =========================================================================
  if (view === "config") {
    return (
      <div className="flex flex-col items-center gap-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-orange-500/10 border border-orange-500/20 rounded-full text-orange-500 text-xs font-mono uppercase tracking-widest">
            <Wand2 className="w-3 h-3" />
            Step 1 of 4
          </div>
          <h2 className="text-3xl font-bold tracking-tight">
            Write Your Script
          </h2>
          <p className="text-neutral-500 text-sm max-w-md">
            AI will research your topic and write a complete, engaging script
            with verified facts and structured beats.
          </p>
        </div>

        {/* Configuration Form */}
        <div className="w-full max-w-2xl space-y-6">
          {/* Topic */}
          <div className="space-y-2">
            <Label className="text-neutral-400">Topic</Label>
            <Textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Enter your topic..."
              className="bg-neutral-900 border-neutral-700 min-h-[80px]"
              disabled={isLocked}
            />
          </div>

          {/* Angle and Genre Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-neutral-400">Angle/Focus (optional)</Label>
              <Input
                value={angle}
                onChange={(e) => setAngle(e.target.value)}
                placeholder="e.g., 'Focus on the economic factors'"
                className="bg-neutral-900 border-neutral-700"
                disabled={isLocked}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-neutral-400">Genre</Label>
              <Select
                value={genre}
                onValueChange={(v) => setGenre(v as ScriptGenre)}
                disabled={isLocked}
              >
                <SelectTrigger className="bg-neutral-900 border-neutral-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="documentary">Documentary</SelectItem>
                  <SelectItem value="educational">Educational</SelectItem>
                  <SelectItem value="narrative_fiction">
                    Narrative Fiction
                  </SelectItem>
                  <SelectItem value="historical_fiction">
                    Historical Fiction
                  </SelectItem>
                  <SelectItem value="opinion_essay">Opinion Essay</SelectItem>
                  <SelectItem value="tutorial">Tutorial</SelectItem>
                  <SelectItem value="news">News</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Research and Duration Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-neutral-400">Research Depth</Label>
              <Select
                value={researchToggle}
                onValueChange={(v) => setResearchToggle(v as ResearchToggle)}
                disabled={isLocked}
              >
                <SelectTrigger className="bg-neutral-900 border-neutral-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deep">
                    Deep Research (Recent Events)
                  </SelectItem>
                  <SelectItem value="full">Full Research</SelectItem>
                  <SelectItem value="light">
                    Light (Verification Only)
                  </SelectItem>
                  <SelectItem value="off">No Research</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <Label className="text-neutral-400">Duration Range</Label>
                <span className="text-orange-500 font-mono text-xs">
                  {durationRange[0]}m - {durationRange[1]}m
                </span>
              </div>
              <Slider
                value={durationRange}
                min={1}
                max={60}
                step={1}
                minStepsBetweenThumbs={1}
                onValueChange={setDurationRange}
                className="py-2"
                disabled={isLocked}
              />
              <div className="flex justify-between text-[10px] text-neutral-600 px-1 select-none">
                <span>1m</span>
                <span>15m</span>
                <span>30m</span>
                <span>45m</span>
                <span>60m</span>
              </div>
            </div>
          </div>

          {/* Error display */}
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-4 pt-4">
            {isLocked ? (
              <div className="w-full h-12 flex items-center justify-center bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-500 font-mono text-xs uppercase tracking-widest">
                {lockedMessage}
              </div>
            ) : (
              <>
                <Button
                  onClick={onBack}
                  variant="outline"
                  className="flex-1 h-12 border-neutral-700 text-neutral-400 hover:text-white hover:bg-neutral-800 gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </Button>
                <Button
                  onClick={startGeneration}
                  disabled={isStarting || !topic.trim()}
                  className="flex-[2] h-12 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-bold uppercase tracking-widest gap-2"
                >
                  {isStarting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      Start Writing
                    </>
                  )}
                </Button>
              </>
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
      <div className="flex flex-col items-center gap-8 text-center">
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
            {currentStep || currentPhase || "Initializing..."}
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

        {/* Status */}
        <p className="text-xs text-neutral-600 font-mono">
          Connected to AI workflow...
        </p>
      </div>
    );
  }

  // =========================================================================
  // RENDER: OUTPUT VIEW
  // =========================================================================
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 text-center space-y-2 mb-4">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/20 rounded-full text-green-500 text-xs font-mono uppercase tracking-widest">
          <CheckCircle className="w-3 h-3" />
          Script Complete
        </div>
        <h2 className="text-2xl font-bold tracking-tight">
          Review Your Script
        </h2>
      </div>

      {/* Quick Stats */}
      {output && (
        <div className="flex-shrink-0 flex items-center justify-center gap-4 mb-4">
          {output.researchDossier && (
            <div className="px-3 py-1.5 bg-neutral-800/50 rounded-lg text-xs">
              <span className="text-neutral-500">Facts:</span>{" "}
              <span className="text-white font-medium">
                {output.researchDossier.metadata.factCount}
              </span>
            </div>
          )}
          {output.spine && (
            <div className="px-3 py-1.5 bg-neutral-800/50 rounded-lg text-xs">
              <span className="text-neutral-500">Beats:</span>{" "}
              <span className="text-white font-medium">
                {output.spine.beatCount}
              </span>
            </div>
          )}
          {output.expandedBeats && (
            <div className="px-3 py-1.5 bg-neutral-800/50 rounded-lg text-xs">
              <span className="text-neutral-500">Words:</span>{" "}
              <span className="text-white font-medium">
                {output.expandedBeats.reduce((sum, b) => sum + b.wordCount, 0)}
              </span>
            </div>
          )}
          {output.qualityValidation && (
            <div
              className={`px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 ${
                output.qualityValidation.passed
                  ? "bg-green-500/10 text-green-400"
                  : "bg-yellow-500/10 text-yellow-400"
              }`}
            >
              {output.qualityValidation.passed ? (
                <CheckCircle className="w-3 h-3" />
              ) : (
                <XCircle className="w-3 h-3" />
              )}
              {output.qualityValidation.passed
                ? "Quality Passed"
                : "Issues Found"}
            </div>
          )}
        </div>
      )}

      {/* Tabbed Output */}
      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="script" className="h-full flex flex-col">
          <TabsList className="flex-shrink-0 bg-neutral-900 mb-4">
            <TabsTrigger value="script" className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Script
            </TabsTrigger>
            <TabsTrigger value="research" className="flex items-center gap-2">
              <Search className="w-4 h-4" />
              Research
            </TabsTrigger>
            <TabsTrigger value="assets" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Assets
            </TabsTrigger>
            <TabsTrigger value="spine" className="flex items-center gap-2">
              <Layout className="w-4 h-4" />
              Spine
            </TabsTrigger>
          </TabsList>

          {/* Script Tab */}
          <TabsContent value="script" className="flex-1 overflow-y-auto">
            <div className="bg-neutral-900 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                  <h3 className="text-lg font-bold text-white">
                    Script by Beats
                  </h3>
                  {output?.expandedBeats && (
                    <div className="text-sm text-neutral-500">
                      {output.expandedBeats.length} beats •{" "}
                      {output.expandedBeats.reduce(
                        (sum, b) => sum + b.wordCount,
                        0
                      )}{" "}
                      words
                    </div>
                  )}
                </div>
                {(output?.expandedBeats || output?.finalScript) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const fullScript = output.expandedBeats
                        ? output.expandedBeats
                            .map((b) => b.narration)
                            .join("\n\n---\n\n")
                        : output.finalScript || "";
                      navigator.clipboard.writeText(fullScript);
                    }}
                    className="gap-2"
                  >
                    <Copy className="w-4 h-4" />
                    Copy Story
                  </Button>
                )}
              </div>

              {output?.expandedBeats && output.expandedBeats.length > 0 ? (
                <div className="space-y-4 max-h-[400px] overflow-y-auto">
                  {output.expandedBeats.map((beat) => {
                    const score = beat.qualityScore ?? 0;
                    const scoreColor =
                      score >= 8
                        ? "text-green-400 bg-green-500/20"
                        : score >= 6
                        ? "text-yellow-400 bg-yellow-500/20"
                        : "text-red-400 bg-red-500/20";

                    return (
                      <div
                        key={beat.beatIndex}
                        className="border border-neutral-800 rounded-lg overflow-hidden"
                      >
                        <div className="bg-neutral-800/50 px-4 py-2 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-bold text-white">
                              Beat {beat.beatIndex + 1}
                            </span>
                            <span className="text-xs text-neutral-500">
                              {beat.wordCount} words
                            </span>
                          </div>
                          <div
                            className={`px-2 py-0.5 rounded text-xs font-bold ${scoreColor}`}
                          >
                            {score > 0 ? `${score}/10` : "N/A"}
                          </div>
                        </div>
                        <div className="p-4">
                          <div className="font-serif text-neutral-300 leading-relaxed whitespace-pre-wrap text-sm line-clamp-4">
                            {beat.narration.replace(/\\n/g, "\n")}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : output?.finalScript ? (
                <div className="font-serif leading-relaxed text-neutral-300 whitespace-pre-wrap max-h-[400px] overflow-y-auto">
                  {output.finalScript.replace(/\\n/g, "\n")}
                </div>
              ) : (
                <p className="text-neutral-500">No script generated.</p>
              )}
            </div>
          </TabsContent>

          {/* Research Tab */}
          <TabsContent value="research" className="flex-1 overflow-y-auto">
            <div className="space-y-4 max-h-[500px] overflow-y-auto">
              {output?.researchDossier ? (
                <>
                  {/* Facts */}
                  <div className="bg-neutral-900 rounded-lg p-4">
                    <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      Verified Facts ({output.researchDossier.facts.length})
                    </h4>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {output.researchDossier.facts.slice(0, 10).map((fact) => (
                        <div
                          key={fact.id}
                          className="p-2 bg-neutral-800 rounded text-xs"
                        >
                          <span className="text-neutral-500">[{fact.id}]</span>{" "}
                          <span className="text-neutral-300">
                            {fact.statement}
                          </span>
                          <span
                            className={`ml-2 px-1 py-0.5 rounded text-[10px] ${
                              fact.confidence === "verified"
                                ? "bg-green-500/20 text-green-400"
                                : fact.confidence === "high"
                                ? "bg-blue-500/20 text-blue-400"
                                : "bg-yellow-500/20 text-yellow-400"
                            }`}
                          >
                            {fact.confidence}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Quotes */}
                  {output.researchDossier.quotes.length > 0 && (
                    <div className="bg-neutral-900 rounded-lg p-4">
                      <h4 className="text-sm font-bold text-white mb-3">
                        Quotes ({output.researchDossier.quotes.length})
                      </h4>
                      <div className="space-y-2">
                        {output.researchDossier.quotes
                          .slice(0, 5)
                          .map((quote) => (
                            <div
                              key={quote.id}
                              className="p-2 bg-neutral-800 rounded text-xs"
                            >
                              <p className="text-neutral-300 italic">
                                "{quote.quote}"
                              </p>
                              <p className="text-neutral-500 mt-1">
                                — {quote.speaker}
                              </p>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Entities */}
                  {output.researchDossier.entities.length > 0 && (
                    <div className="bg-neutral-900 rounded-lg p-4">
                      <h4 className="text-sm font-bold text-white mb-3">
                        Key Entities ({output.researchDossier.entities.length})
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {output.researchDossier.entities
                          .slice(0, 15)
                          .map((entity, i) => (
                            <span
                              key={i}
                              className={`px-2 py-1 rounded text-xs ${
                                entity.type === "person"
                                  ? "bg-purple-500/20 text-purple-400"
                                  : entity.type === "location"
                                  ? "bg-blue-500/20 text-blue-400"
                                  : "bg-orange-500/20 text-orange-400"
                              }`}
                            >
                              {entity.name}
                            </span>
                          ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-neutral-900 rounded-lg p-6 text-center text-neutral-500">
                  No research performed (research toggle: {researchToggle})
                </div>
              )}
            </div>
          </TabsContent>

          {/* Assets Tab */}
          <TabsContent value="assets" className="flex-1 overflow-y-auto">
            <div className="space-y-4 max-h-[500px] overflow-y-auto">
              {output?.assetRegistry ? (
                <>
                  {/* Characters */}
                  <div className="bg-neutral-900 rounded-lg p-4">
                    <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                      <Users className="w-4 h-4 text-purple-500" />
                      Characters ({output.assetRegistry.characters.length})
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                      {output.assetRegistry.characters.map((char) => (
                        <div
                          key={char.id}
                          className="p-3 bg-neutral-800 rounded cursor-pointer hover:bg-neutral-700 transition-colors"
                          onClick={() => {
                            setSelectedAsset(char);
                            setIsAssetDetailOpen(true);
                          }}
                        >
                          <div className="text-white font-medium text-sm">
                            {char.name}
                          </div>
                          <div className="text-neutral-500 text-xs">
                            {char.role}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Locations */}
                  {output.assetRegistry.locations.length > 0 && (
                    <div className="bg-neutral-900 rounded-lg p-4">
                      <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-blue-500" />
                        Locations ({output.assetRegistry.locations.length})
                      </h4>
                      <div className="grid grid-cols-2 gap-2">
                        {output.assetRegistry.locations.map((loc) => (
                          <div
                            key={loc.id}
                            className="p-3 bg-neutral-800 rounded cursor-pointer hover:bg-neutral-700 transition-colors"
                            onClick={() => {
                              setSelectedAsset(loc);
                              setIsAssetDetailOpen(true);
                            }}
                          >
                            <div className="text-white font-medium text-sm">
                              {loc.name}
                            </div>
                            <div className="text-neutral-500 text-xs">
                              {loc.essence}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-neutral-900 rounded-lg p-6 text-center text-neutral-500">
                  No assets generated
                </div>
              )}
            </div>
          </TabsContent>

          {/* Spine Tab */}
          <TabsContent value="spine" className="flex-1 overflow-y-auto">
            <div className="space-y-4 max-h-[500px] overflow-y-auto">
              {output?.spine ? (
                <>
                  <div className="bg-neutral-900 rounded-lg p-4">
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <div className="text-2xl font-bold text-white">
                          {output.spine.beatCount}
                        </div>
                        <div className="text-xs text-neutral-500">Beats</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-white">
                          {Math.round(output.spine.totalDurationSeconds / 60)}
                        </div>
                        <div className="text-xs text-neutral-500">Minutes</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-white">
                          {output.spine.sections.length}
                        </div>
                        <div className="text-xs text-neutral-500">Sections</div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {output.spine.beats.map((beat) => (
                      <div
                        key={beat.index}
                        className="p-3 bg-neutral-900 rounded-lg"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="w-6 h-6 rounded bg-orange-500/20 text-orange-400 text-xs flex items-center justify-center">
                            {beat.index + 1}
                          </span>
                          <span className="px-2 py-0.5 bg-neutral-800 rounded text-xs text-neutral-400">
                            {beat.classification.type}
                          </span>
                          <span className="text-neutral-600 text-xs">
                            {beat.classification.section}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-300 line-clamp-2">
                          {beat.contentSummary}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="bg-neutral-900 rounded-lg p-6 text-center text-neutral-500">
                  No spine generated
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Actions */}
      <div className="flex-shrink-0 flex items-center gap-4 pt-4">
        <Button
          onClick={reset}
          variant="outline"
          className="flex-1 h-12 border-neutral-700 text-neutral-400 hover:text-white hover:bg-neutral-800 gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Regenerate
        </Button>
        <Button
          onClick={handleConfirm}
          className="flex-[2] h-12 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-bold uppercase tracking-widest gap-2"
        >
          <Check className="w-4 h-4" />
          Confirm & Generate Media
        </Button>
      </div>

      {/* Asset Detail Dialog */}
      <Dialog open={isAssetDetailOpen} onOpenChange={setIsAssetDetailOpen}>
        <DialogContent className="max-w-2xl bg-neutral-900 border-neutral-800 text-white max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{selectedAsset?.name}</DialogTitle>
            <DialogDescription className="text-neutral-400">
              {selectedAsset?.id} •{" "}
              {selectedAsset?.role ||
                selectedAsset?.type ||
                selectedAsset?.essence}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto pr-4">
            <div className="space-y-6 py-4">
              {selectedAsset && (
                <>
                  {/* Visual Instructions */}
                  {selectedAsset.visualInstructions && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-bold text-orange-400 uppercase tracking-wider">
                        Visual Instructions
                      </h4>
                      <div className="bg-neutral-950 p-4 rounded-lg space-y-2 text-sm">
                        <p>
                          <span className="text-neutral-500">Style:</span>{" "}
                          {selectedAsset.visualInstructions.styleNotes}
                        </p>
                        {selectedAsset.visualInstructions
                          .consistencyAnchors && (
                          <div>
                            <span className="text-neutral-500">Anchors:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {selectedAsset.visualInstructions.consistencyAnchors.map(
                                (a: string, i: number) => (
                                  <span
                                    key={i}
                                    className="bg-neutral-800 px-2 py-0.5 rounded text-xs"
                                  >
                                    {a}
                                  </span>
                                )
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Physical Characteristics (Characters) */}
                  {selectedAsset.physicalCharacteristics && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-bold text-neutral-300 uppercase tracking-wider">
                        Physical Characteristics
                      </h4>
                      <div className="bg-neutral-950 p-4 rounded-lg grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-neutral-500 block text-xs">
                            Age/Gender
                          </span>
                          {
                            selectedAsset.physicalCharacteristics.demographics
                              ?.age
                          }
                          ,{" "}
                          {
                            selectedAsset.physicalCharacteristics.demographics
                              ?.gender
                          }
                        </div>
                        <div>
                          <span className="text-neutral-500 block text-xs">
                            Build
                          </span>
                          {
                            selectedAsset.physicalCharacteristics.bodyStructure
                              ?.build
                          }
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Location Details */}
                  {selectedAsset.structuralDetails && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-bold text-neutral-300 uppercase tracking-wider">
                        Structure & Environment
                      </h4>
                      <div className="bg-neutral-950 p-4 rounded-lg space-y-3 text-sm">
                        <div>
                          <span className="text-neutral-500 block text-xs">
                            Architecture
                          </span>
                          {selectedAsset.structuralDetails.architectureStyle} -{" "}
                          {selectedAsset.structuralDetails.materials}
                        </div>
                        {selectedAsset.environmentalDetails && (
                          <div>
                            <span className="text-neutral-500 block text-xs">
                              Atmosphere
                            </span>
                            {
                              selectedAsset.environmentalDetails
                                .weatherAtmosphere
                            }
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Raw JSON */}
                  <pre className="text-[10px] text-neutral-600 overflow-x-auto p-4 bg-black rounded">
                    {JSON.stringify(selectedAsset, null, 2)}
                  </pre>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
