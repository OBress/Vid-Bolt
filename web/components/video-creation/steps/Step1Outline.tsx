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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Play,
  Loader2,
  CheckCircle,
  Search,
  Users,
  MapPin,
  Layout,
  Check,
  Save,
  Edit3,
  ChevronDown,
  ChevronUp,
  Trash2,
  Plus,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { createBrowserClient } from "@supabase/ssr";
import { useProjectSettings } from "@/hooks/use-project-settings";

// ============================================================================
// TYPES
// ============================================================================

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

interface OutlineOutput {
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
  };
  durationDecision?: {
    recommendedDurationSeconds: number;
    targetWordCount: number;
    beatCount: number;
    reasoning: string;
  };
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
      toneEnergy: { mood: string; pacing: string };
    }>;
  };
  assetRegistry?: {
    characters: Array<{
      id: string;
      name: string;
      role: string;
      physicalCharacteristics?: any;
    }>;
    locations: Array<{
      id: string;
      name: string;
      essence: string;
    }>;
    objects: Array<{
      id: string;
      name: string;
      type: string;
    }>;
  };
}

interface Step1OutlineProps {
  videoId: string;
  projectId: string;
  initialTopic?: string;
  initialOutput?: OutlineOutput | null;
  initialConfig?: {
    topic: string;
    genre: ScriptGenre;
    researchToggle: ResearchToggle;
    durationRange: number[];
    angle: string;
  } | null;
  onComplete: (output: OutlineOutput, config: any) => void;
  onSave: (output: OutlineOutput, config: any) => void;
  onBack: () => void;
  isLocked?: boolean;
  lockedMessage?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function Step1Outline({
  videoId,
  projectId,
  initialTopic = "",
  initialOutput,
  initialConfig,
  onComplete,
  onSave,
  onBack,
  isLocked,
  lockedMessage,
}: Step1OutlineProps) {
  const { settings: projectSettings, loading: settingsLoading } =
    useProjectSettings(projectId);

  const [view, setView] = useState<ViewState>(
    initialOutput ? "output" : "config",
  );

  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<string>(
    initialOutput ? "completed" : "idle",
  );
  const [progress, setProgress] = useState(0);
  const [currentPhase, setCurrentPhase] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<OutlineOutput | null>(
    initialOutput || null,
  );
  const [isStarting, setIsStarting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Form state
  const [topic, setTopic] = useState(initialConfig?.topic || initialTopic);
  const [genre, setGenre] = useState<ScriptGenre>(
    initialConfig?.genre || projectSettings?.script?.genre || "documentary",
  );
  const [researchToggle, setResearchToggle] = useState<ResearchToggle>(
    initialConfig?.researchToggle ||
      projectSettings?.script?.researchDepth ||
      "full",
  );
  const [durationRange, setDurationRange] = useState(
    initialConfig?.durationRange ||
      projectSettings?.basic_info?.videoDurationRange || [5, 10],
  );
  const [angle, setAngle] = useState(initialConfig?.angle || "");
  const [activeTab, setActiveTab] = useState("spine");

  // Editing state for output
  const [editingSpine, setEditingSpine] =
    useState<(typeof output)["spine"]>(null);

  // Update state when props change
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

  useEffect(() => {
    if (!settingsLoading && projectSettings && !initialConfig) {
      if (projectSettings.script?.genre) setGenre(projectSettings.script.genre);
      if (projectSettings.script?.researchDepth)
        setResearchToggle(projectSettings.script.researchDepth);
      if (projectSettings.basic_info?.videoDurationRange)
        setDurationRange(projectSettings.basic_info.videoDurationRange);
    }
  }, [settingsLoading, projectSettings, initialConfig]);

  // Initialize editing spine when output changes
  useEffect(() => {
    if (output?.spine) {
      setEditingSpine(JSON.parse(JSON.stringify(output.spine)));
    }
  }, [output]);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

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
        console.error("[Step1] Failed to fetch task status:", statusError);
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
          console.error("[Step1] Failed to fetch output data:", outputError);
          return;
        }

        if (outputData?.output_data) {
          const newOutput = outputData.output_data as OutlineOutput;
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
    [supabase, topic, genre, researchToggle, durationRange, angle, onSave],
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
      const response = await fetch("/api/process/outline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId,
          topic,
          genre,
          researchToggle,
          durationRange: {
            minMinutes: durationRange[0],
            maxMinutes: durationRange[1],
          },
          angle: angle || undefined,
          pov: projectSettings?.script?.pov || "1st",
          protagonistGender:
            projectSettings?.script?.protagonistGender || "any",
          openrouterModel:
            projectSettings?.script?.openrouterModel ||
            "google/gemini-3-flash-preview",
          contentNiche: projectSettings?.script?.contentNiche,
          toneStyle: projectSettings?.script?.toneStyle,
          targetAudience: projectSettings?.script?.targetAudience,
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

  const handleSaveChanges = async () => {
    if (!editingSpine || !output) return;

    setIsSaving(true);
    try {
      const updatedOutput = { ...output, spine: editingSpine };
      setOutput(updatedOutput);
      await onSave(updatedOutput, {
        topic,
        genre,
        researchToggle,
        durationRange,
        angle,
      });
      setHasChanges(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirm = () => {
    if (output) {
      // Use the editing spine if we have unsaved changes
      const finalOutput =
        hasChanges && editingSpine
          ? { ...output, spine: editingSpine }
          : output;
      onComplete(finalOutput, {
        topic,
        genre,
        researchToggle,
        durationRange,
        angle,
      });
    }
  };

  const handleBeatChange = (
    beatIndex: number,
    field: string,
    value: string,
  ) => {
    if (!editingSpine) return;

    const updatedBeats = editingSpine.beats.map((beat, i) => {
      if (i === beatIndex) {
        if (field === "contentSummary") {
          return { ...beat, contentSummary: value };
        }
      }
      return beat;
    });

    setEditingSpine({ ...editingSpine, beats: updatedBeats });
    setHasChanges(true);
  };

  const handleDeleteBeat = (beatIndex: number) => {
    if (!editingSpine) return;

    const updatedBeats = editingSpine.beats
      .filter((_, i) => i !== beatIndex)
      .map((beat, i) => ({ ...beat, index: i }));

    setEditingSpine({
      ...editingSpine,
      beats: updatedBeats,
      beatCount: updatedBeats.length,
    });
    setHasChanges(true);
  };

  const handleAddBeat = (afterIndex: number) => {
    if (!editingSpine) return;

    const newBeat = {
      index: afterIndex + 1,
      classification: { type: "information", section: "Main Content" },
      contentSummary: "New beat - describe the content here...",
      keyPoints: [],
      toneEnergy: { mood: "neutral", pacing: "medium" },
    };

    const updatedBeats = [
      ...editingSpine.beats.slice(0, afterIndex + 1),
      newBeat,
      ...editingSpine.beats.slice(afterIndex + 1).map((beat) => ({
        ...beat,
        index: beat.index + 1,
      })),
    ];

    setEditingSpine({
      ...editingSpine,
      beats: updatedBeats,
      beatCount: updatedBeats.length,
    });
    setHasChanges(true);
  };

  // Phase mapping for progress display (only phases 1-4)
  const phases = [
    { key: "Research & Analysis", label: "Research & Analysis" },
    { key: "Content Scoping", label: "Content Scoping" },
    { key: "Spine Generation", label: "Spine Generation" },
    { key: "Asset Registry", label: "Asset Registry" },
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
      <div className="flex flex-col items-center gap-6 pt-12">
        {/* Header */}
        <div className="text-center space-y-3">
          <h2 className="text-3xl font-bold tracking-tight">
            Create Your Outline
          </h2>
          <p className="text-neutral-500 text-sm max-w-md">
            AI will research your topic and create a structured outline with
            verified facts and visual assets.
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
              placeholder="Enter your video topic..."
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
                      Generate Outline
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
            Creating Your Outline
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

        <p className="text-xs text-neutral-600 font-mono">
          Connected to AI workflow...
        </p>
      </div>
    );
  }

  // =========================================================================
  // RENDER: OUTPUT VIEW (Editable Review)
  // =========================================================================
  const beatCount = editingSpine?.beatCount || output?.spine?.beatCount || 0;
  const assetCount =
    (output?.assetRegistry?.characters?.length || 0) +
    (output?.assetRegistry?.locations?.length || 0) +
    (output?.assetRegistry?.objects?.length || 0);

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
              Outline & Assets
            </h2>
          </div>

          {output && (
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
              <div className="p-3 bg-neutral-800/50 rounded-lg text-center">
                <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-0.5">
                  Facts
                </div>
                <div className="text-lg font-mono text-white">
                  {output.researchDossier?.metadata?.factCount || 0}
                </div>
              </div>
              <div className="p-3 bg-neutral-800/50 rounded-lg text-center">
                <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-0.5">
                  Est. Time
                </div>
                <div className="text-lg font-mono text-white">
                  {Math.round(
                    (output.durationDecision?.recommendedDurationSeconds || 0) /
                      60,
                  )}
                  m
                </div>
              </div>
            </div>
          )}
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

            {/* Action Buttons */}
            <div className="mt-auto p-5 border-t border-neutral-800 space-y-3 shrink-0">
              {hasChanges && (
                <Button
                  onClick={handleSaveChanges}
                  disabled={isSaving}
                  variant="outline"
                  className="w-full h-10 border-orange-500 text-orange-500 hover:bg-orange-500/10 gap-2"
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Save Changes
                </Button>
              )}
              <Button
                onClick={handleConfirm}
                className="w-full h-12 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-bold uppercase tracking-widest gap-2"
              >
                <Check className="w-4 h-4" />
                Continue to Stock Media
              </Button>
            </div>
          </Tabs>
        </div>
      </div>

      {/* RIGHT CONTENT AREA */}
      <div className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden h-full">
        <div className="h-full overflow-y-auto p-6">
          {activeTab === "spine" && editingSpine && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold">
                  {editingSpine.title || "Video Outline"}
                </h3>
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <Edit3 className="w-3 h-3" />
                  Click any beat to edit
                </div>
              </div>
              {editingSpine.beats.map((beat, index) => (
                <EditableBeatCard
                  key={index}
                  beat={beat}
                  index={index}
                  onChange={handleBeatChange}
                  onDelete={handleDeleteBeat}
                  onAddAfter={handleAddBeat}
                />
              ))}
            </div>
          )}

          {activeTab === "assets" && output?.assetRegistry && (
            <div className="space-y-6">
              {/* Characters */}
              {output.assetRegistry.characters?.length > 0 && (
                <div>
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                    <Users className="w-5 h-5 text-orange-500" />
                    Characters
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    {output.assetRegistry.characters.map((char) => (
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

              {/* Locations */}
              {output.assetRegistry.locations?.length > 0 && (
                <div>
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-blue-500" />
                    Locations
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    {output.assetRegistry.locations.map((loc) => (
                      <div
                        key={loc.id}
                        className="p-4 bg-neutral-800/50 border border-neutral-700 rounded-lg"
                      >
                        <div className="font-medium text-white">{loc.name}</div>
                        <div className="text-sm text-neutral-500">
                          {loc.essence}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Objects */}
              {output.assetRegistry.objects?.length > 0 && (
                <div>
                  <h3 className="text-lg font-bold mb-4">Objects</h3>
                  <div className="grid grid-cols-3 gap-4">
                    {output.assetRegistry.objects.map((obj) => (
                      <div
                        key={obj.id}
                        className="p-3 bg-neutral-800/50 border border-neutral-700 rounded-lg"
                      >
                        <div className="font-medium text-white text-sm">
                          {obj.name}
                        </div>
                        <div className="text-xs text-neutral-500">
                          {obj.type}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "research" && output?.researchDossier && (
            <div className="space-y-6">
              {/* Facts */}
              <div>
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  Verified Facts ({output.researchDossier.facts?.length || 0})
                </h3>
                <div className="space-y-3">
                  {output.researchDossier.facts?.map((fact) => (
                    <div
                      key={fact.id}
                      className="p-4 bg-neutral-800/50 border border-neutral-700 rounded-lg"
                    >
                      <div className="text-white text-sm">{fact.statement}</div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-400">
                          {fact.confidence}
                        </span>
                        {fact.sources?.map((source, i) => (
                          <span key={i} className="text-xs text-neutral-500">
                            {source.title}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quotes */}
              {output.researchDossier.quotes?.length > 0 && (
                <div>
                  <h3 className="text-lg font-bold mb-4">Quotes</h3>
                  <div className="space-y-3">
                    {output.researchDossier.quotes?.map((quote) => (
                      <div
                        key={quote.id}
                        className="p-4 bg-neutral-800/50 border border-neutral-700 rounded-lg"
                      >
                        <div className="text-white text-sm italic">
                          "{quote.quote}"
                        </div>
                        <div className="text-xs text-neutral-500 mt-2">
                          — {quote.speaker}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function EditableBeatCard({
  beat,
  index,
  onChange,
  onDelete,
  onAddAfter,
}: {
  beat: any;
  index: number;
  onChange: (index: number, field: string, value: string) => void;
  onDelete: (index: number) => void;
  onAddAfter: (index: number) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(beat.contentSummary);

  const handleSave = () => {
    onChange(index, "contentSummary", editValue);
    setIsEditing(false);
  };

  return (
    <div className="border border-neutral-700 rounded-lg overflow-hidden bg-neutral-800/30">
      {/* Header */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-neutral-800/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="w-8 h-8 rounded-lg bg-orange-500/20 border border-orange-500/30 flex items-center justify-center text-orange-500 font-mono text-sm font-bold">
          {index + 1}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 rounded bg-neutral-700 text-neutral-300 font-mono uppercase">
              {beat.classification?.type || "beat"}
            </span>
            <span className="text-xs text-neutral-500">
              {beat.classification?.section}
            </span>
          </div>
          <div className="text-sm text-white mt-1 line-clamp-1">
            {beat.contentSummary}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAddAfter(index);
            }}
            className="p-1.5 rounded hover:bg-neutral-700 text-neutral-500 hover:text-green-400 transition-colors"
            title="Add beat after"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(index);
            }}
            className="p-1.5 rounded hover:bg-neutral-700 text-neutral-500 hover:text-red-400 transition-colors"
            title="Delete beat"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-neutral-500" />
          ) : (
            <ChevronDown className="w-5 h-5 text-neutral-500" />
          )}
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-neutral-700 p-4 space-y-4">
          {isEditing ? (
            <div className="space-y-2">
              <Textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="bg-neutral-900 border-neutral-700 min-h-[100px]"
              />
              <div className="flex gap-2">
                <Button
                  onClick={handleSave}
                  size="sm"
                  className="bg-orange-500 hover:bg-orange-600"
                >
                  Save
                </Button>
                <Button
                  onClick={() => {
                    setEditValue(beat.contentSummary);
                    setIsEditing(false);
                  }}
                  size="sm"
                  variant="outline"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div
              onClick={() => setIsEditing(true)}
              className="p-3 bg-neutral-900/50 rounded-lg cursor-text hover:bg-neutral-900 transition-colors"
            >
              <div className="text-xs text-neutral-500 mb-1 flex items-center gap-1">
                <Edit3 className="w-3 h-3" />
                Content (click to edit)
              </div>
              <div className="text-sm text-white">{beat.contentSummary}</div>
            </div>
          )}

          {beat.keyPoints?.length > 0 && (
            <div>
              <div className="text-xs text-neutral-500 mb-2">Key Points</div>
              <ul className="list-disc list-inside space-y-1">
                {beat.keyPoints.map((point: string, i: number) => (
                  <li key={i} className="text-sm text-neutral-300">
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-4 text-xs text-neutral-500">
            <span>
              Mood:{" "}
              <span className="text-neutral-300">{beat.toneEnergy?.mood}</span>
            </span>
            <span>
              Pacing:{" "}
              <span className="text-neutral-300">
                {beat.toneEnergy?.pacing}
              </span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
