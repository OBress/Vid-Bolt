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
  initialOutput?: UniversalScriptOutput | null;
  initialConfig?: {
    topic: string;
    genre: ScriptGenre;
    researchToggle: ResearchToggle;
    durationRange: number[];
    angle: string;
  } | null;
  onComplete: (output: UniversalScriptOutput, config: any) => void;
  onSave: (output: UniversalScriptOutput, config: any) => void;
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
  initialOutput,
  initialConfig,
  onComplete,
  onSave,
  onBack,
  isLocked,
  lockedMessage,
}: Step4UniversalScriptProps) {
  // Initialize view based on whether we have output
  const [view, setView] = useState<ViewState>(
    initialOutput ? "output" : "config"
  );

  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<string>(
    initialOutput ? "completed" : "idle"
  );
  const [progress, setProgress] = useState(0);
  const [currentPhase, setCurrentPhase] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<UniversalScriptOutput | null>(
    initialOutput || null
  );
  const [selectedAsset, setSelectedAsset] = useState<any | null>(null);
  const [isAssetDetailOpen, setIsAssetDetailOpen] = useState(false);
  const [isRegenerateConfirmOpen, setIsRegenerateConfirmOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  // Form state - Initialize from saved config or defaults
  const [topic, setTopic] = useState(initialConfig?.topic || initialTopic);
  const [genre, setGenre] = useState<ScriptGenre>(
    initialConfig?.genre || "documentary"
  );
  const [researchToggle, setResearchToggle] = useState<ResearchToggle>(
    initialConfig?.researchToggle || "full"
  );
  const [durationRange, setDurationRange] = useState(
    initialConfig?.durationRange || [5, 10]
  ); // [min, max] in minutes
  const [angle, setAngle] = useState(initialConfig?.angle || "");
  const [activeTab, setActiveTab] = useState("script");

  // Update state if props change (e.g. after loading from DB)
  useEffect(() => {
    if (initialOutput) {
      setOutput(initialOutput);
      setView("output");
      setTaskStatus("completed");
    }
  }, [initialOutput]);

  useEffect(() => {
    if (initialConfig) {
      if (initialConfig.topic) setTopic(initialConfig.topic);
      if (initialConfig.genre) setGenre(initialConfig.genre);
      if (initialConfig.researchToggle)
        setResearchToggle(initialConfig.researchToggle);
      if (initialConfig.durationRange)
        setDurationRange(initialConfig.durationRange);
      if (initialConfig.angle) setAngle(initialConfig.angle);
    }
  }, [initialConfig]);

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
          const newOutput = outputData.output_data as UniversalScriptOutput;
          setOutput(newOutput);
          setView("output");
          setTaskStatus("completed");

          // Auto-save the result
          onSave(newOutput, {
            topic,
            genre,
            researchToggle,
            durationRange,
            angle,
          });
        }
      } else if (statusData.status === "failed") {
        setError(statusData.error_message || "Task failed");
        setView("config");
      }
    },
    [supabase, topic, genre, researchToggle, durationRange, angle, onSave]
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
      onComplete(output, {
        topic,
        genre,
        researchToggle,
        durationRange,
        angle,
      });
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
  // Calculate duration
  const totalWords =
    output?.expandedBeats?.reduce((sum, b) => sum + b.wordCount, 0) || 0;
  const estimatedDurationMinutes = Math.ceil(totalWords / 150); // ~150 wpm

  return (
    <div className="flex h-[calc(100vh-160px)] gap-6 w-full max-w-[96vw] mx-auto px-8 py-6">
      {/* LEFT SIDEBAR (Fixed width) */}
      <div className="w-80 shrink-0 flex flex-col gap-6 h-full">
        {/* Header & Stats */}
        <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-5 space-y-4 shrink-0">
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-green-500/10 border border-green-500/20 rounded-full text-green-500 text-[10px] font-mono uppercase tracking-widest">
              <CheckCircle className="w-3 h-3" />
              Complete
            </div>
            <h2 className="text-xl font-bold tracking-tight whitespace-nowrap">
              Script & Assets
            </h2>
          </div>

          {output && (
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-neutral-800/50 rounded-lg text-center">
                <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-0.5">
                  Words
                </div>
                <div className="text-lg font-mono text-white">{totalWords}</div>
              </div>
              <div className="p-3 bg-neutral-800/50 rounded-lg text-center">
                <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-0.5">
                  est. time
                </div>
                <div className="text-lg font-mono text-white">
                  {estimatedDurationMinutes}m
                </div>
              </div>
              <div className="p-3 bg-neutral-800/50 rounded-lg text-center">
                <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-0.5">
                  Facts
                </div>
                <div className="text-lg font-mono text-white">
                  {output.researchDossier?.metadata.factCount || 0}
                </div>
              </div>
              <div className="p-3 bg-neutral-800/50 rounded-lg text-center">
                <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-0.5">
                  Beats
                </div>
                <div className="text-lg font-mono text-white">
                  {output.spine?.beatCount || 0}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Navigation Tabs (Vertical-ish List) */}
        <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl overflow-hidden flex-1 flex flex-col">
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex-1 flex flex-col"
            orientation="vertical"
          >
            <TabsList className="bg-transparent flex-col flex-1 items-stretch p-0 gap-0 border-b border-neutral-800 w-full">
              <TabsTrigger
                value="script"
                className="flex-1 justify-center gap-3 px-6 rounded-none border-l-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:bg-neutral-800/50 text-neutral-400 data-[state=active]:text-white transition-all text-sm uppercase tracking-wider font-medium"
              >
                <FileText className="w-5 h-5" />
                Script
              </TabsTrigger>
              <TabsTrigger
                value="spine"
                className="flex-1 justify-center gap-3 px-6 rounded-none border-l-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:bg-neutral-800/50 text-neutral-400 data-[state=active]:text-white transition-all text-sm uppercase tracking-wider font-medium"
              >
                <Layout className="w-5 h-5" />
                Spine
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

            {/* Action Buttons at bottom of sidebar */}
            <div className="mt-auto p-5 border-t border-neutral-800 space-y-3 shrink-0">
              <Button
                onClick={() => handleConfirm()}
                className="w-full h-12 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-bold uppercase tracking-widest gap-2"
              >
                <Check className="w-4 h-4" />
                Confirm & Continue
              </Button>
              <Button
                onClick={() => setIsRegenerateConfirmOpen(true)}
                variant="ghost"
                className="w-full text-neutral-500 hover:text-white"
              >
                Regenerate
              </Button>
            </div>
          </Tabs>
        </div>
      </div>

      {/* RIGHT CONTENT AREA (Flexible width) */}
      <div className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden h-full">
        <ContentArea
          output={output}
          activeTab={activeTab}
          onAssetClick={(asset) => {
            setSelectedAsset(asset);
            setIsAssetDetailOpen(true);
          }}
        />
      </div>

      {/* Asset Detail Dialog */}
      <Dialog open={isAssetDetailOpen} onOpenChange={setIsAssetDetailOpen}>
        <DialogContent className="z-[200] max-w-2xl bg-neutral-900 border-neutral-800 text-white max-h-[80vh] overflow-hidden flex flex-col">
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

      {/* Regeneration Confirmation Dialog */}
      <Dialog
        open={isRegenerateConfirmOpen}
        onOpenChange={setIsRegenerateConfirmOpen}
      >
        <DialogContent className="bg-neutral-900 border-neutral-800 text-white sm:max-w-md z-[200]">
          <DialogHeader>
            <DialogTitle>Regenerate Script?</DialogTitle>
            <DialogDescription className="text-neutral-400">
              This will clear the current script, assets, and research. All
              progress on this specific version will be lost.
              <br />
              <br />
              Are you sure you want to start over?
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-4">
            <Button
              variant="outline"
              onClick={() => setIsRegenerateConfirmOpen(false)}
              className="border-neutral-700 text-neutral-300 hover:bg-neutral-800"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                reset();
                setIsRegenerateConfirmOpen(false);
              }}
              className="bg-red-900/50 hover:bg-red-900 text-red-100 border border-red-900"
            >
              Yes, Regenerate
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Helper Component for Content Area
function ContentArea({
  output,
  activeTab,
  onAssetClick,
}: {
  output: UniversalScriptOutput | null;
  activeTab: string;
  onAssetClick?: (asset: any) => void;
}) {
  if (!output) return null;

  return (
    <div className="h-full overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-neutral-800 scrollbar-track-transparent">
      {activeTab === "script" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold text-white">Full Script</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const text =
                  output.expandedBeats?.map((b) => b.narration).join("\n\n") ||
                  "";
                navigator.clipboard.writeText(text);
              }}
            >
              <Copy className="w-4 h-4 mr-2" /> Copy
            </Button>
          </div>

          <div className="space-y-6">
            {output.expandedBeats?.map((beat, idx) => (
              <ExpandableBeatCard key={idx} beat={beat} index={idx} />
            ))}
          </div>
        </div>
      )}

      {activeTab === "spine" && (
        <div className="space-y-6">
          <h3 className="text-2xl font-bold text-white">Narrative Spine</h3>
          <div className="space-y-4">
            {output.spine?.beats.map((beat) => (
              <div
                key={beat.index}
                className="bg-neutral-800/30 border border-neutral-800 p-4 rounded-lg"
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className="w-6 h-6 rounded-full bg-neutral-800 flex items-center justify-center text-xs font-mono text-neutral-400">
                    {beat.index + 1}
                  </span>
                  <span className="text-sm font-medium text-orange-400 uppercase tracking-wide">
                    {beat.classification.type}
                  </span>
                </div>
                <p className="text-neutral-300">{beat.contentSummary}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "assets" && (
        <div className="space-y-8">
          <h3 className="text-2xl font-bold text-white">Visual Assets</h3>

          {/* Characters */}
          {output.assetRegistry?.characters &&
            output.assetRegistry.characters.length > 0 && (
              <div className="space-y-4">
                <h4 className="text-lg font-medium text-white flex items-center gap-2">
                  <Users className="w-5 h-5 text-neutral-400" /> Characters
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  {output.assetRegistry.characters.map((char) => (
                    <div
                      key={char.id}
                      className="bg-neutral-800/30 border border-neutral-800 p-4 rounded-lg cursor-pointer hover:bg-neutral-800/50 hover:border-neutral-700 transition-all group"
                      onClick={() => onAssetClick?.(char)}
                    >
                      <div className="font-bold text-white mb-1 group-hover:text-orange-400 transition-colors">
                        {char.name}
                      </div>
                      <div className="text-xs text-neutral-500 mb-2">
                        {char.role}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          {/* Locations */}
          {output.assetRegistry?.locations &&
            output.assetRegistry.locations.length > 0 && (
              <div className="space-y-4">
                <h4 className="text-lg font-medium text-white flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-neutral-400" /> Locations
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  {output.assetRegistry.locations.map((loc) => (
                    <div
                      key={loc.id}
                      className="bg-neutral-800/30 border border-neutral-800 p-4 rounded-lg cursor-pointer hover:bg-neutral-800/50 hover:border-neutral-700 transition-all group"
                      onClick={() => onAssetClick?.(loc)}
                    >
                      <div className="font-bold text-white mb-1 group-hover:text-orange-400 transition-colors">
                        {loc.name}
                      </div>
                      <div className="text-xs text-neutral-500 mb-2">
                        {loc.essence}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
        </div>
      )}

      {activeTab === "research" && (
        <div className="space-y-6">
          <h3 className="text-2xl font-bold text-white">Research Dossier</h3>
          <div className="space-y-2">
            {!output.researchDossier?.facts ||
            output.researchDossier.facts.length === 0 ? (
              <div className="text-neutral-500 italic p-4 border border-neutral-800/50 rounded-lg bg-neutral-900/30">
                No research was performed for this script.
              </div>
            ) : (
              output.researchDossier.facts.map((fact) => (
                <div
                  key={fact.id}
                  className="p-3 bg-neutral-800/30 border border-neutral-800 rounded-lg text-sm text-neutral-300"
                >
                  <span className="text-orange-500 font-mono mr-2">
                    [{fact.id}]
                  </span>
                  {fact.statement}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ExpandableBeatCard({ beat, index }: { beat: any; index: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-neutral-800/30 border border-neutral-800 rounded-xl overflow-hidden transition-all hover:border-neutral-700">
      <div className="p-4 flex items-center justify-between bg-black/20">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-white">Beat {index + 1}</span>
          <span className="text-xs text-neutral-500 font-mono">
            {beat.wordCount} words
          </span>
        </div>
        {beat.qualityScore && (
          <div
            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
              beat.qualityScore >= 8
                ? "bg-green-500/10 text-green-400"
                : "bg-yellow-500/10 text-yellow-400"
            }`}
          >
            {beat.qualityScore}/10
          </div>
        )}
      </div>
      <div className="p-5">
        <div
          className={`font-serif text-lg leading-relaxed text-neutral-200 whitespace-pre-wrap ${
            !expanded ? "line-clamp-3" : ""
          }`}
        >
          {beat.narration}
        </div>
        {beat.narration.length > 200 && (
          <Button
            variant="link"
            onClick={() => setExpanded(!expanded)}
            className="mt-2 p-0 h-auto text-orange-500 text-xs font-medium hover:text-orange-400"
          >
            {expanded ? "Show Less" : "Read More"}
          </Button>
        )}
      </div>
    </div>
  );
}
