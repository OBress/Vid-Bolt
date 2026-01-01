"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  X,
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

interface UniversalScriptTesterProps {
  isOpen: boolean;
  onClose: () => void;
}

type ScriptGenre =
  | "documentary"
  | "educational"
  | "narrative_fiction"
  | "historical_fiction"
  | "opinion_essay"
  | "tutorial"
  | "news";
type ResearchToggle = "full" | "light" | "off";

export function UniversalScriptTester({
  isOpen,
  onClose,
}: UniversalScriptTesterProps) {
  const [mounted, setMounted] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<string>("idle");
  const [progress, setProgress] = useState(0);
  const [currentPhase, setCurrentPhase] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<UniversalScriptOutput | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<any | null>(null);
  const [isAssetDetailOpen, setIsAssetDetailOpen] = useState(false);

  // Form state
  const [topic, setTopic] = useState(
    "The collapse of the Bronze Age civilizations"
  );
  const [genre, setGenre] = useState<ScriptGenre>("documentary");
  const [researchToggle, setResearchToggle] = useState<ResearchToggle>("full");
  const [durationRange, setDurationRange] = useState([5, 10]); // [min, max] in minutes
  const [angle, setAngle] = useState("");

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Mount effect for portal
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Poll for task updates
  const fetchTaskStatus = useCallback(
    async (id: string, isCompletionCheck = false) => {
      console.log(
        `[UI:Poll] Fetching status for task ${id} (isCompletionCheck: ${isCompletionCheck})`
      );

      // 1. First poll only for status (lightweight)
      const { data: statusData, error: statusError } = await supabase
        .from("tasks")
        .select(
          "status, progress_percent, current_phase, current_step, error_message"
        )
        .eq("id", id)
        .single();

      if (statusError) {
        console.error("[UI:Poll] Failed to fetch task status:", statusError);
        return;
      }

      console.log(`[UI:Poll] Raw DB response:`, JSON.stringify(statusData));

      setTaskStatus(statusData.status);
      setProgress(statusData.progress_percent || 0);
      setCurrentPhase(statusData.current_phase);
      setCurrentStep(statusData.current_step);

      // Debug logging
      console.log("[UI:Poll] Task Update:", {
        id,
        status: statusData.status,
        progress: statusData.progress_percent,
        phase: statusData.current_phase,
        step: statusData.current_step,
      });

      // 2. If complete, fetch the heavy output data
      if (
        statusData.status === "completed" ||
        statusData.progress_percent === 100
      ) {
        console.log(
          `[UI:Poll] Task appears COMPLETED (status=${statusData.status}, progress=${statusData.progress_percent}). Fetching full output...`
        );

        const { data: outputData, error: outputError } = await supabase
          .from("tasks")
          .select("output_data")
          .eq("id", id)
          .single();

        if (outputError) {
          console.error("[UI:Poll] Failed to fetch output data:", outputError);
          return;
        }

        console.log(
          `[UI:Poll] Output data fetched, has output_data: ${!!outputData?.output_data}, keys: ${
            outputData?.output_data
              ? Object.keys(outputData.output_data).join(", ")
              : "none"
          }`
        );

        if (outputData?.output_data) {
          console.log(
            "[UI:Poll] SUCCESS - Setting output and stopping generation"
          );
          setOutput(outputData.output_data as UniversalScriptOutput);
          setIsGenerating(false);
          setTaskStatus("completed");
        } else {
          console.warn(
            "[UI:Poll] output_data is empty/null despite completed status!"
          );
        }
      } else if (statusData.status === "failed") {
        console.log(`[UI:Poll] Task FAILED: ${statusData.error_message}`);
        setError(statusData.error_message || "Task failed");
        setIsGenerating(false);
      } else {
        console.log(`[UI:Poll] Task still running, will poll again...`);
      }
    },
    [supabase]
  );

  // Polling effect
  useEffect(() => {
    if (!isGenerating || !taskId) {
      console.log(
        `[UI:Poll] Polling disabled - isGenerating: ${isGenerating}, taskId: ${taskId}`
      );
      return;
    }

    console.log(`[UI:Poll] Starting polling interval for task ${taskId}`);

    // Immediately fetch once
    fetchTaskStatus(taskId);

    const interval = setInterval(() => {
      console.log(`[UI:Poll] Interval tick - fetching status...`);
      fetchTaskStatus(taskId);
    }, 2000);

    return () => {
      console.log(`[UI:Poll] Cleaning up polling interval`);
      clearInterval(interval);
    };
  }, [isGenerating, taskId, fetchTaskStatus]);

  const startGeneration = async () => {
    setError(null);
    setIsGenerating(true);
    setTaskStatus("starting");
    setProgress(0);
    setOutput(null);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setIsGenerating(false);
    }
  };

  const reset = () => {
    setTaskId(null);
    setTaskStatus("idle");
    setProgress(0);
    setCurrentPhase(null);
    setError(null);
    setOutput(null);
    setIsGenerating(false);
  };

  // Don't render on server or when not open
  if (!mounted || !isOpen) return null;

  const content = (
    <div className="fixed inset-0 z-[9999] bg-neutral-950 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center">
            <FileText className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">
              Universal Script Tester
            </h1>
            <p className="text-sm text-neutral-400">
              Test the 6-phase script generation pipeline
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="text-neutral-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Configuration / Status */}
        <div className="w-96 border-r border-neutral-800 p-6 overflow-y-auto">
          {!taskId ? (
            <div className="space-y-6">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Configuration
              </h2>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-neutral-400">Topic</Label>
                  <Textarea
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="Enter your topic..."
                    className="bg-neutral-900 border-neutral-700 min-h-[80px]"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-neutral-400">
                    Angle/Focus (optional)
                  </Label>
                  <Input
                    value={angle}
                    onChange={(e) => setAngle(e.target.value)}
                    placeholder="e.g., 'Focus on the economic factors'"
                    className="bg-neutral-900 border-neutral-700"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-neutral-400">Genre</Label>
                  <Select
                    value={genre}
                    onValueChange={(v) => setGenre(v as ScriptGenre)}
                  >
                    <SelectTrigger className="bg-neutral-900 border-neutral-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[10002]">
                      <SelectItem value="documentary">Documentary</SelectItem>
                      <SelectItem value="educational">Educational</SelectItem>
                      <SelectItem value="narrative_fiction">
                        Narrative Fiction
                      </SelectItem>
                      <SelectItem value="historical_fiction">
                        Historical Fiction
                      </SelectItem>
                      <SelectItem value="opinion_essay">
                        Opinion Essay
                      </SelectItem>
                      <SelectItem value="tutorial">Tutorial</SelectItem>
                      <SelectItem value="news">News</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-neutral-400">Research Depth</Label>
                  <Select
                    value={researchToggle}
                    onValueChange={(v) =>
                      setResearchToggle(v as ResearchToggle)
                    }
                  >
                    <SelectTrigger className="bg-neutral-900 border-neutral-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[10002]">
                      <SelectItem value="full">Full Research</SelectItem>
                      <SelectItem value="light">
                        Light (Verification Only)
                      </SelectItem>
                      <SelectItem value="off">No Research</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-4 pt-2">
                  <div className="flex justify-between items-center text-sm">
                    <Label className="text-neutral-400">Duration Range</Label>
                    <span className="text-orange-500 font-mono">
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
                  />
                  <div className="flex justify-between text-[10px] text-neutral-600 px-1 select-none">
                    <span>1m</span>
                    <span>15m</span>
                    <span>30m</span>
                    <span>45m</span>
                    <span>60m</span>
                  </div>
                </div>

                <Button
                  onClick={startGeneration}
                  disabled={isGenerating || !topic}
                  className="w-full bg-orange-500 hover:bg-orange-600"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Start Generation
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Progress
              </h2>

              <div className="p-4 bg-neutral-900 rounded-lg border border-neutral-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {taskStatus === "completed" ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : taskStatus === "failed" ? (
                      <XCircle className="w-5 h-5 text-red-500" />
                    ) : (
                      <Loader2 className="w-5 h-5 text-orange-500 animate-spin" />
                    )}
                    <span className="text-white font-medium">
                      {taskStatus === "completed"
                        ? "Complete!"
                        : taskStatus === "failed"
                        ? "Failed"
                        : currentPhase || "Starting..."}
                    </span>
                  </div>
                  <span className="text-neutral-500 text-sm">{progress}%</span>
                </div>

                <Progress value={progress} className="h-2" />

                {taskStatus !== "completed" && taskStatus !== "failed" && (
                  <p className="text-xs text-orange-500/80">
                    Phase: {currentStep || currentPhase || "Initializing..."}
                  </p>
                )}
              </div>

              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                  {error}
                </div>
              )}

              {(taskStatus === "completed" || taskStatus === "failed") && (
                <Button variant="outline" onClick={reset} className="w-full">
                  Start New Test
                </Button>
              )}

              {/* Quick Stats */}
              {output && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-neutral-500 uppercase">
                    Stats
                  </h3>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {output.researchDossier && (
                      <div className="p-2 bg-neutral-900 rounded">
                        <div className="text-neutral-500">Facts</div>
                        <div className="text-white font-medium">
                          {output.researchDossier.metadata.factCount}
                        </div>
                      </div>
                    )}
                    {output.spine && (
                      <div className="p-2 bg-neutral-900 rounded">
                        <div className="text-neutral-500">Beats</div>
                        <div className="text-white font-medium">
                          {output.spine.beatCount}
                        </div>
                      </div>
                    )}
                    {output.assetRegistry && (
                      <div className="p-2 bg-neutral-900 rounded">
                        <div className="text-neutral-500">Characters</div>
                        <div className="text-white font-medium">
                          {output.assetRegistry.characters.length}
                        </div>
                      </div>
                    )}
                    {output.expandedBeats && (
                      <div className="p-2 bg-neutral-900 rounded">
                        <div className="text-neutral-500">Words</div>
                        <div className="text-white font-medium">
                          {output.expandedBeats.reduce(
                            (sum, b) => sum + b.wordCount,
                            0
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {output.qualityValidation && (
                    <div
                      className={`p-2 rounded flex items-center gap-2 ${
                        output.qualityValidation.passed
                          ? "bg-green-500/10 text-green-400"
                          : "bg-yellow-500/10 text-yellow-400"
                      }`}
                    >
                      {output.qualityValidation.passed ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : (
                        <XCircle className="w-4 h-4" />
                      )}
                      <span className="text-xs font-medium">
                        Quality:{" "}
                        {output.qualityValidation.passed
                          ? "Passed"
                          : "Issues Found"}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Panel - Output Preview */}
        <div className="flex-1 p-6 overflow-hidden">
          {!output ? (
            <div className="h-full flex items-center justify-center text-neutral-600">
              <div className="text-center">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Output will appear here after generation</p>
              </div>
            </div>
          ) : (
            <Tabs defaultValue="script" className="h-full flex flex-col">
              <TabsList className="bg-neutral-900 mb-4">
                <TabsTrigger value="script" className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Script
                </TabsTrigger>
                <TabsTrigger
                  value="research"
                  className="flex items-center gap-2"
                >
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

              {/* Script Tab - Beat-by-Beat View */}
              <TabsContent value="script" className="flex-1 overflow-y-auto">
                <div className="bg-neutral-900 rounded-lg p-6 min-h-full">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                      <h3 className="text-lg font-bold text-white">
                        Script by Beats
                      </h3>
                      {output.expandedBeats && (
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
                    {(output.expandedBeats || output.finalScript) && (
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
                          alert("Script copied to clipboard!");
                        }}
                        className="gap-2"
                      >
                        <Copy className="w-4 h-4" />
                        Copy Story
                      </Button>
                    )}
                  </div>

                  {output.expandedBeats && output.expandedBeats.length > 0 ? (
                    <div className="space-y-6">
                      {output.expandedBeats.map((beat, i) => {
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
                            {/* Beat Header */}
                            <div className="bg-neutral-800/50 px-4 py-3 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-bold text-white">
                                  Beat {beat.beatIndex + 1}
                                </span>
                                <span className="text-xs text-neutral-500">
                                  {beat.wordCount} words
                                </span>
                              </div>
                              <div
                                className={`px-2 py-1 rounded text-sm font-bold ${scoreColor}`}
                              >
                                {score > 0 ? `${score}/10` : "N/A"}
                              </div>
                            </div>

                            {/* Beat Content */}
                            <div className="p-4">
                              <div className="font-serif text-neutral-300 leading-relaxed whitespace-pre-wrap">
                                {beat.narration
                                  .replace(/\\n/g, "\n")
                                  .split("\n")
                                  .map((line, j) => {
                                    const trimmed = line.trim();
                                    if (!trimmed)
                                      return <div key={j} className="h-3" />;
                                    return (
                                      <p
                                        key={j}
                                        className={`mb-2 ${
                                          trimmed.startsWith("[")
                                            ? "text-neutral-500 italic text-sm"
                                            : ""
                                        }`}
                                      >
                                        {trimmed}
                                      </p>
                                    );
                                  })}
                              </div>

                              {/* Score Warning */}
                              {score > 0 && score < 8 && (
                                <div className="mt-4 pt-3 border-t border-neutral-700">
                                  <p className="text-xs text-yellow-400">
                                    ⚠️ This beat scored below 8. Consider manual
                                    review for AI-isms, repetition, or weak
                                    transitions.
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : output.finalScript ? (
                    <div className="font-serif leading-relaxed text-neutral-300 whitespace-pre-wrap">
                      {output.finalScript.replace(/\\n/g, "\n")}
                    </div>
                  ) : (
                    <p className="text-neutral-500">No script generated.</p>
                  )}
                </div>
              </TabsContent>

              {/* Research Tab */}
              <TabsContent value="research" className="flex-1 overflow-y-auto">
                <div className="space-y-6">
                  {output.researchDossier ? (
                    <>
                      {/* Facts */}
                      <div className="bg-neutral-900 rounded-lg p-4">
                        <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-green-500" />
                          Verified Facts ({output.researchDossier.facts.length})
                        </h4>
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {output.researchDossier.facts
                            .slice(0, 10)
                            .map((fact) => (
                              <div
                                key={fact.id}
                                className="p-2 bg-neutral-800 rounded text-xs"
                              >
                                <span className="text-neutral-500">
                                  [{fact.id}]
                                </span>{" "}
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
                            Key Entities (
                            {output.researchDossier.entities.length})
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

                      {/* Works Cited */}
                      {output.researchDossier.worksCited &&
                        output.researchDossier.worksCited.length > 0 && (
                          <div className="bg-neutral-900 rounded-lg p-4">
                            <h4 className="text-sm font-bold text-white mb-3">
                              Works Cited (
                              {output.researchDossier.worksCited.length})
                            </h4>
                            <div className="space-y-2">
                              {output.researchDossier.worksCited.map(
                                (source, i) => (
                                  <div
                                    key={i}
                                    className="p-2 bg-neutral-800 rounded text-xs"
                                  >
                                    <a
                                      href={source.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-400 hover:underline font-medium block truncate"
                                    >
                                      {source.title}
                                    </a>
                                    <div className="flex items-center gap-2 mt-1 text-neutral-500">
                                      {source.author && (
                                        <span>{source.author}</span>
                                      )}
                                      <span
                                        className={`px-1 rounded text-[10px] ${
                                          source.reliabilityTier <= 2
                                            ? "bg-green-500/20 text-green-400"
                                            : "bg-yellow-500/20 text-yellow-400"
                                        }`}
                                      >
                                        Tier {source.reliabilityTier}
                                      </span>
                                    </div>
                                  </div>
                                )
                              )}
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
                <div className="space-y-6">
                  {output.assetRegistry ? (
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
                              <div className="text-neutral-600 text-[10px] mt-1">
                                {char.id}
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
                                <div className="text-neutral-600 text-[10px] mt-1">
                                  {loc.id}
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
                <div className="space-y-4">
                  {output.spine ? (
                    <>
                      <div className="bg-neutral-900 rounded-lg p-4 mb-4">
                        <div className="grid grid-cols-3 gap-4 text-center">
                          <div>
                            <div className="text-2xl font-bold text-white">
                              {output.spine.beatCount}
                            </div>
                            <div className="text-xs text-neutral-500">
                              Beats
                            </div>
                          </div>
                          <div>
                            <div className="text-2xl font-bold text-white">
                              {Math.round(
                                output.spine.totalDurationSeconds / 60
                              )}
                            </div>
                            <div className="text-xs text-neutral-500">
                              Minutes
                            </div>
                          </div>
                          <div>
                            <div className="text-2xl font-bold text-white">
                              {output.spine.sections.length}
                            </div>
                            <div className="text-xs text-neutral-500">
                              Sections
                            </div>
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
          )}
        </div>
      </div>

      {/* Asset Detail Dialog */}
      <Dialog open={isAssetDetailOpen} onOpenChange={setIsAssetDetailOpen}>
        <DialogContent className="z-[10010] max-w-2xl bg-neutral-900 border-neutral-800 text-white max-h-[80vh] overflow-hidden flex flex-col">
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
                        <div>
                          <span className="text-neutral-500">Anchors:</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {selectedAsset.visualInstructions.consistencyAnchors?.map(
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
                        <div>
                          <span className="text-neutral-500">
                            Prohibitions:
                          </span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {selectedAsset.visualInstructions.prohibitions?.map(
                              (p: string, i: number) => (
                                <span
                                  key={i}
                                  className="bg-red-900/20 text-red-400 px-2 py-0.5 rounded text-xs"
                                >
                                  {p}
                                </span>
                              )
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Character Details */}
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
                        <div className="col-span-2">
                          <span className="text-neutral-500 block text-xs">
                            Face
                          </span>
                          {
                            selectedAsset.physicalCharacteristics.faceFeatures
                              ?.notableFeatures
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
                        <div>
                          <span className="text-neutral-500 block text-xs">
                            Atmosphere
                          </span>
                          {
                            selectedAsset.environmentalDetails
                              ?.weatherAtmosphere
                          }
                        </div>
                        <div>
                          <span className="text-neutral-500 block text-xs">
                            Lighting
                          </span>
                          {selectedAsset.lighting?.mood} (
                          {selectedAsset.lighting?.natural})
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Object Details */}
                  {selectedAsset.physicalDescription && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-bold text-neutral-300 uppercase tracking-wider">
                        Physical Description
                      </h4>
                      <div className="bg-neutral-950 p-4 rounded-lg space-y-2 text-sm">
                        <p>
                          {
                            selectedAsset.physicalDescription
                              .detailedDescription
                          }
                        </p>
                        <div className="grid grid-cols-2 gap-4 mt-2">
                          <div>
                            <span className="text-neutral-500 text-xs">
                              Material:
                            </span>{" "}
                            {selectedAsset.physicalDescription.materials}
                          </div>
                          <div>
                            <span className="text-neutral-500 text-xs">
                              Color:
                            </span>{" "}
                            {selectedAsset.physicalDescription.color}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

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

  return createPortal(content, document.body);
}
