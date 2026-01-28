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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  Video,
  Camera,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  Image,
  ArrowLeft,
  Settings2,
  ExternalLink,
  Link,
  GitCompareArrows,
  Clock,
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
      primarySourceId?: string;
    }>;
    quotes: Array<{ id: string; quote: string; speaker: string }>;
    entities: Array<{ type: string; name: string; role: string }>;
    worksCited?: Array<{
      id?: string;
      title: string;
      url?: string;
      author?: string;
      reliabilityTier: number;
      excerpt?: string;
      fullContent?: string;
    }>;
    sourceDocuments?: Array<{
      id: string;
      url: string;
      title: string;
      content: string;
      publicationDate?: string;
      author?: string;
      reliabilityTier: number;
      accessedAt: string;
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

// AV Script types
interface AVShot {
  shotIndex: number;
  shotType: string;
  cameraAngle: string;
  cameraMovement: string;
  duration: number;
  imagePrompt: string;
  imageEditPrompt: string | null;
  videoMotionPrompt: string;
  generationStrategy: "create_new" | "edit_existing";
}

interface AVScene {
  sceneIndex: number;
  sceneType: string;
  summary: string;
  narration: string;
  shots: AVShot[];
  duration: number;
}

interface UniversalScriptTesterProps {
  isOpen: boolean;
  onClose: () => void;
  inline?: boolean;
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
  inline = false,
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
  const [activeTab, setActiveTab] = useState("script");

  // AV Script state
  const [avScriptScenes, setAvScriptScenes] = useState<AVScene[]>([]);
  const [avScriptStats, setAvScriptStats] = useState<{
    totalScenes: number;
    totalShots: number;
    newImagesNeeded: number;
    editsNeeded: number;
  } | null>(null);
  const [isGeneratingAV, setIsGeneratingAV] = useState(false);
  const [avError, setAvError] = useState<string | null>(null);
  const [selectedAvScene, setSelectedAvScene] = useState<AVScene | null>(null);
  const [selectedAvShot, setSelectedAvShot] = useState<AVShot | null>(null);

  // Form state
  const [topic, setTopic] = useState(
    "The collapse of the Bronze Age civilizations",
  );
  const [genre, setGenre] = useState<ScriptGenre>("documentary");
  const [researchToggle, setResearchToggle] = useState<ResearchToggle>("full");
  const [durationRange, setDurationRange] = useState([5, 10]); // [min, max] in minutes
  const [angle, setAngle] = useState("");

  // Advanced settings (matching Step 1 production)
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [pov, setPov] = useState<"1st" | "2nd" | "3rd">("1st");
  const [protagonistGender, setProtagonistGender] = useState<
    "male" | "female" | "any"
  >("any");
  const [contentNiche, setContentNiche] = useState("");
  const [toneStyle, setToneStyle] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [stockMediaLevel, setStockMediaLevel] = useState<
    | "none"
    | "standard_images"
    | "extensive_images"
    | "standard_images_video"
    | "extensive_images_video"
  >("standard_images");

  // Research provider toggle (valyu = v2 with narrative, openrouter = legacy)
  const [researchProvider, setResearchProvider] = useState<
    "valyu" | "openrouter"
  >("valyu");
  // Research only mode - just displays research results, doesn't write full script
  const [researchOnly, setResearchOnly] = useState(true);

  // Comparison mode state (Legacy vs Valyu side-by-side)
  const [compareMode, setCompareMode] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  const [comparisonResult, setComparisonResult] = useState<{
    topic: string;
    researchToggle: string;
    questionsCount: number;
    totalDurationMs: number;
    legacy: {
      success: boolean;
      performed?: boolean;
      durationMs: number;
      dossier: any;
      metrics: {
        factCount: number;
        quoteCount: number;
        entityCount: number;
        sourceCount: number;
        confidence: number;
      } | null;
      error?: string;
    };
    valyu: {
      success: boolean;
      performed?: boolean;
      durationMs: number;
      dossier: any;
      metrics: {
        factCount: number;
        quoteCount: number;
        entityCount: number;
        sourceCount: number;
        sourceDocumentCount?: number;
        confidence: number;
      } | null;
      error?: string;
      // Full outline output from extended pipeline
      outline?: {
        durationDecision: any;
        spine: any;
        assetRegistry: any;
      } | null;
    };
  } | null>(null);

  // Detail view for comparison results - 'legacy' | 'valyu' | null
  const [comparisonDetailView, setComparisonDetailView] = useState<
    "legacy" | "valyu" | null
  >(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
        `[UI:Poll] Fetching status for task ${id} (isCompletionCheck: ${isCompletionCheck})`,
      );

      // 1. First poll only for status (lightweight)
      const { data: statusData, error: statusError } = await supabase
        .from("tasks")
        .select(
          "status, progress_percent, current_phase, current_step, error_message",
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
          `[UI:Poll] Task appears COMPLETED (status=${statusData.status}, progress=${statusData.progress_percent}). Fetching full output...`,
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
          }`,
        );

        if (outputData?.output_data) {
          console.log(
            "[UI:Poll] SUCCESS - Setting output and stopping generation",
          );
          setOutput(outputData.output_data as UniversalScriptOutput);
          setIsGenerating(false);
          setTaskStatus("completed");
        } else {
          console.warn(
            "[UI:Poll] output_data is empty/null despite completed status!",
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
    [supabase],
  );

  // Polling effect
  useEffect(() => {
    if (!isGenerating || !taskId) {
      console.log(
        `[UI:Poll] Polling disabled - isGenerating: ${isGenerating}, taskId: ${taskId}`,
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
          // Research provider selection
          researchProvider,
          // Advanced settings (matching Step 1)
          pov,
          protagonistGender,
          contentNiche: contentNiche || undefined,
          toneStyle: toneStyle || undefined,
          targetAudience: targetAudience || undefined,
          stockMediaLevel,
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
    // Reset AV Script state too
    setAvScriptScenes([]);
    setAvScriptStats(null);
    setAvError(null);
    setSelectedAvScene(null);
    setSelectedAvShot(null);
    // Reset comparison state
    setComparisonResult(null);
    setIsComparing(false);
  };

  // Start comparison mode - runs both legacy and Valyu in parallel
  const startComparison = async () => {
    setError(null);
    setIsComparing(true);
    setComparisonResult(null);

    try {
      // Step 1: Enqueue job
      const enqueueResponse = await fetch("/api/research-compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          genre,
          researchToggle,
          angle: angle || undefined,
          researchProvider,
          durationRange: {
            minMinutes: durationRange[0],
            maxMinutes: durationRange[1],
          },
        }),
      });

      const enqueueData = await enqueueResponse.json();

      if (!enqueueResponse.ok) {
        throw new Error(enqueueData.error || "Failed to enqueue research job");
      }

      const jobId = enqueueData.jobId;
      console.log(`[UniversalScriptTester] Research job enqueued: ${jobId}`);

      // Step 2: Poll for completion
      let attempts = 0;
      const maxAttempts = 300; // 300 * 2s = 10 minutes max
      const pollInterval = 2000; // 2 seconds

      while (attempts < maxAttempts) {
        attempts++;
        await new Promise((resolve) => setTimeout(resolve, pollInterval));

        const statusResponse = await fetch(
          `/api/research-compare?jobId=${jobId}`,
        );
        const statusData = await statusResponse.json();

        if (!statusResponse.ok) {
          throw new Error(statusData.error || "Failed to check job status");
        }

        console.log(
          `[UniversalScriptTester] Job ${jobId} status: ${statusData.status}`,
        );

        if (statusData.status === "completed") {
          // Build comparison result in expected format
          const result = statusData.result || {};
          setComparisonResult({
            topic,
            researchToggle,
            questionsCount: 0, // DeepResearch doesn't use decomposed questions
            totalDurationMs: result.durationMs || 0,
            legacy: {
              success: false,
              performed: false,
              durationMs: 0,
              dossier: null,
              metrics: null,
            },
            valyu: {
              success: result.success ?? false,
              performed: true,
              durationMs: result.durationMs || 0,
              dossier: result.dossier || null,
              metrics: result.metrics || null,
              outline: result.outline || null,
            },
          });
          return;
        }

        if (statusData.status === "failed") {
          throw new Error(statusData.error || "Research job failed");
        }

        // Still processing - continue polling
      }

      throw new Error("Research job timed out after 10 minutes");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Research failed");
    } finally {
      setIsComparing(false);
    }
  };

  // Generate AV Script from the completed script
  const generateAVScript = async () => {
    if (!output?.finalScript && !output?.expandedBeats) {
      setAvError("No script available to generate AV from");
      return;
    }

    setIsGeneratingAV(true);
    setAvError(null);
    setAvScriptScenes([]);
    setAvScriptStats(null);
    setSelectedAvScene(null);
    setSelectedAvShot(null);

    try {
      // Use finalScript or combine expanded beats
      const scriptText =
        output.finalScript ||
        output.expandedBeats?.map((b) => b.narration).join("\n\n") ||
        "";

      // Trigger the Inngest workflow
      const response = await fetch("/api/visual-director/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptText }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to start AV script task");
      }

      const avTaskId = data.taskId;
      console.log(
        `[UniversalScriptTester] AV Script task started: ${avTaskId}`,
      );

      // Poll for results - increased timeout for chunked scene-by-scene processing
      let attempts = 0;
      const maxAttempts = 150; // 150 attempts * 2 seconds = 5 minutes max

      const pollForResults = async () => {
        while (attempts < maxAttempts) {
          attempts++;
          await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds

          const statusRes = await fetch(
            `/api/visual-director/test?taskId=${avTaskId}`,
          );
          const statusData = await statusRes.json();

          console.log(
            `[UniversalScriptTester] Poll ${attempts}: status=${statusData.status}, step=${statusData.currentStep}`,
          );

          if (statusData.status === "completed") {
            // Success!
            const scenes = statusData.output?.scenes || [];
            const stats = statusData.output?.stats || null;
            setAvScriptScenes(scenes);
            setAvScriptStats(stats);
            setActiveTab("avscript");
            return;
          }

          if (statusData.status === "failed" || statusData.status === "error") {
            throw new Error("AV Script generation failed");
          }
        }
        throw new Error("Timed out waiting for AV script generation");
      };

      await pollForResults();
    } catch (err) {
      console.error("[UniversalScriptTester] AV Script error:", err);
      setAvError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsGeneratingAV(false);
    }
  };

  // Don't render on server or when not open
  if (!mounted || !isOpen) return null;

  const content = (
    <div
      className={
        inline
          ? "relative flex flex-col h-full bg-neutral-950 overflow-hidden"
          : "fixed inset-0 z-[9999] bg-neutral-950 flex flex-col"
      }
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
        <div className="flex items-center gap-4">
          {inline && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-neutral-400 hover:text-white -ml-2"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}
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
        {!inline && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-neutral-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </Button>
        )}
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

                {/* Research Provider Toggle */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-neutral-400 flex items-center gap-2">
                      <Search className="w-4 h-4" />
                      Research Provider
                    </Label>
                    <button
                      type="button"
                      onClick={() =>
                        setResearchProvider(
                          researchProvider === "valyu" ? "openrouter" : "valyu",
                        )
                      }
                      className={`relative w-10 h-5 rounded-full transition-colors ${
                        researchProvider === "valyu"
                          ? "bg-purple-600"
                          : "bg-neutral-700"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                          researchProvider === "valyu"
                            ? "translate-x-5"
                            : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                  <p
                    className={`text-[11px] px-2 py-1.5 rounded ${
                      researchProvider === "valyu"
                        ? "text-purple-400 bg-purple-500/10"
                        : "text-blue-400 bg-blue-500/10"
                    }`}
                  >
                    {researchProvider === "valyu"
                      ? "Valyu v2: Narrative context, key developments, enhanced entities"
                      : "OpenRouter: Legacy web search with standard fact extraction"}
                  </p>
                </div>

                {/* Research Only Toggle */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-neutral-400 flex items-center gap-2">
                      <Search className="w-4 h-4" />
                      Research Only
                    </Label>
                    <button
                      type="button"
                      onClick={() => setResearchOnly(!researchOnly)}
                      className={`relative w-10 h-5 rounded-full transition-colors ${
                        researchOnly ? "bg-green-600" : "bg-neutral-700"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                          researchOnly ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                  <p
                    className={`text-[11px] px-2 py-1.5 rounded ${
                      researchOnly
                        ? "text-green-400 bg-green-500/10"
                        : "text-neutral-400 bg-neutral-800"
                    }`}
                  >
                    {researchOnly
                      ? "Test research and display v2 dossier - no script generation"
                      : "Full pipeline: research → script → assets → everything"}
                  </p>
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

                {/* Advanced Settings (Collapsible) */}
                <div className="border border-neutral-800 rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setAdvancedOpen(!advancedOpen)}
                    className="w-full flex items-center justify-between p-3 bg-neutral-900/50 hover:bg-neutral-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-2 text-neutral-400">
                      <Settings2 className="w-4 h-4" />
                      <span className="text-sm font-medium">
                        Advanced Settings
                      </span>
                    </div>
                    {advancedOpen ? (
                      <ChevronUp className="w-4 h-4 text-neutral-500" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-neutral-500" />
                    )}
                  </button>

                  {advancedOpen && (
                    <div className="p-4 space-y-4 border-t border-neutral-800">
                      {/* POV */}
                      <div className="space-y-2">
                        <Label className="text-neutral-400 text-xs">
                          Point of View
                        </Label>
                        <Select
                          value={pov}
                          onValueChange={(v) =>
                            setPov(v as "1st" | "2nd" | "3rd")
                          }
                        >
                          <SelectTrigger className="bg-neutral-900 border-neutral-700 h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="z-[10002]">
                            <SelectItem value="1st">
                              1st Person (I/We)
                            </SelectItem>
                            <SelectItem value="2nd">
                              2nd Person (You)
                            </SelectItem>
                            <SelectItem value="3rd">
                              3rd Person (They/It)
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Protagonist Gender */}
                      <div className="space-y-2">
                        <Label className="text-neutral-400 text-xs">
                          Protagonist Gender
                        </Label>
                        <Select
                          value={protagonistGender}
                          onValueChange={(v) =>
                            setProtagonistGender(v as "male" | "female" | "any")
                          }
                        >
                          <SelectTrigger className="bg-neutral-900 border-neutral-700 h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="z-[10002]">
                            <SelectItem value="any">Any/Neutral</SelectItem>
                            <SelectItem value="male">Male</SelectItem>
                            <SelectItem value="female">Female</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Stock Media Level */}
                      <div className="space-y-2">
                        <Label className="text-neutral-400 text-xs">
                          Stock Media
                        </Label>
                        <Select
                          value={stockMediaLevel}
                          onValueChange={(v) =>
                            setStockMediaLevel(
                              v as
                                | "none"
                                | "standard_images"
                                | "extensive_images"
                                | "standard_images_video"
                                | "extensive_images_video",
                            )
                          }
                        >
                          <SelectTrigger className="bg-neutral-900 border-neutral-700 h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="z-[10002]">
                            <SelectItem value="none">None</SelectItem>
                            <SelectItem value="standard_images">
                              Standard Images
                            </SelectItem>
                            <SelectItem value="extensive_images">
                              Extensive Images
                            </SelectItem>
                            <SelectItem
                              value="standard_images_video"
                              disabled
                              className="text-neutral-500"
                            >
                              Standard + Videos (Coming Soon)
                            </SelectItem>
                            <SelectItem
                              value="extensive_images_video"
                              disabled
                              className="text-neutral-500"
                            >
                              Extensive + Videos (Coming Soon)
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Content Niche */}
                      <div className="space-y-2">
                        <Label className="text-neutral-400 text-xs">
                          Content Niche (optional)
                        </Label>
                        <Input
                          value={contentNiche}
                          onChange={(e) => setContentNiche(e.target.value)}
                          placeholder="e.g., 'History', 'Science', 'True Crime'"
                          className="bg-neutral-900 border-neutral-700 h-9 text-sm"
                        />
                      </div>

                      {/* Tone/Style */}
                      <div className="space-y-2">
                        <Label className="text-neutral-400 text-xs">
                          Tone/Style (optional)
                        </Label>
                        <Input
                          value={toneStyle}
                          onChange={(e) => setToneStyle(e.target.value)}
                          placeholder="e.g., 'Dramatic', 'Casual', 'Professional'"
                          className="bg-neutral-900 border-neutral-700 h-9 text-sm"
                        />
                      </div>

                      {/* Target Audience */}
                      <div className="space-y-2">
                        <Label className="text-neutral-400 text-xs">
                          Target Audience (optional)
                        </Label>
                        <Input
                          value={targetAudience}
                          onChange={(e) => setTargetAudience(e.target.value)}
                          placeholder="e.g., 'Young adults', 'Professionals'"
                          className="bg-neutral-900 border-neutral-700 h-9 text-sm"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <Button
                  onClick={researchOnly ? startComparison : startGeneration}
                  disabled={isGenerating || isComparing || !topic}
                  className={`w-full ${
                    researchOnly
                      ? "bg-green-600 hover:bg-green-700"
                      : "bg-orange-500 hover:bg-orange-600"
                  }`}
                >
                  {isComparing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Running Research...
                    </>
                  ) : researchOnly ? (
                    <>
                      <Search className="w-4 h-4 mr-2" />
                      Run Research Only
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      Start Generation
                    </>
                  )}
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
                      <div
                        className="p-2 bg-neutral-900 rounded cursor-pointer hover:bg-neutral-800 transition-colors"
                        onClick={() => setActiveTab("research")}
                      >
                        <div className="text-neutral-500">Facts</div>
                        <div className="text-white font-medium">
                          {output.researchDossier.metadata.factCount}
                        </div>
                      </div>
                    )}
                    {output.spine && (
                      <div
                        className="p-2 bg-neutral-900 rounded cursor-pointer hover:bg-neutral-800 transition-colors"
                        onClick={() => setActiveTab("spine")}
                      >
                        <div className="text-neutral-500">Beats</div>
                        <div className="text-white font-medium">
                          {output.spine.beatCount}
                        </div>
                      </div>
                    )}
                    {output.assetRegistry && (
                      <div
                        className="p-2 bg-neutral-900 rounded cursor-pointer hover:bg-neutral-800 transition-colors"
                        onClick={() => setActiveTab("assets")}
                      >
                        <div className="text-neutral-500">Characters</div>
                        <div className="text-white font-medium">
                          {output.assetRegistry.characters.length}
                        </div>
                      </div>
                    )}
                    {output.expandedBeats && (
                      <div
                        className="p-2 bg-neutral-900 rounded cursor-pointer hover:bg-neutral-800 transition-colors"
                        onClick={() => setActiveTab("script")}
                      >
                        <div className="text-neutral-500">Words</div>
                        <div className="text-white font-medium">
                          {output.expandedBeats.reduce(
                            (sum, b) => sum + b.wordCount,
                            0,
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
          {/* Research Results View - Full Width Valyu Display */}
          {comparisonResult ? (
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Search className="w-5 h-5 text-purple-400" />
                  Valyu AI Research Results
                </h2>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setComparisonResult(null)}
                  className="text-neutral-400 border-neutral-700"
                >
                  Clear Results
                </Button>
              </div>

              {/* Overview Stats - Full Width */}
              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="bg-neutral-900 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-blue-400">
                    {comparisonResult.valyu.metrics?.factCount || 0}
                  </div>
                  <div className="text-xs text-neutral-500">Facts</div>
                </div>
                <div className="bg-neutral-900 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-green-400">
                    {comparisonResult.valyu.metrics?.quoteCount || 0}
                  </div>
                  <div className="text-xs text-neutral-500">Quotes</div>
                </div>
                <div className="bg-neutral-900 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-yellow-400">
                    {comparisonResult.valyu.metrics?.entityCount || 0}
                  </div>
                  <div className="text-xs text-neutral-500">Entities</div>
                </div>
                <div className="bg-neutral-900 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-purple-400">
                    {comparisonResult.valyu.metrics?.sourceCount || 0}
                    {comparisonResult.valyu.metrics?.sourceDocumentCount !==
                      undefined && (
                      <span className="text-xs text-neutral-500 ml-1">
                        (+{comparisonResult.valyu.metrics.sourceDocumentCount}{" "}
                        docs)
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-neutral-500">Sources</div>
                </div>
              </div>

              {/* Duration & Confidence Row */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-neutral-900 rounded-lg p-4 flex items-center justify-between">
                  <span className="text-sm text-neutral-400 flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Research Time
                  </span>
                  <span className="text-lg font-bold text-white">
                    {Math.round(
                      (comparisonResult.valyu.durationMs || 0) / 1000,
                    )}
                    s
                  </span>
                </div>
                <div className="bg-neutral-900 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-neutral-400">Confidence</span>
                    <span className="text-sm font-mono text-white">
                      {comparisonResult.valyu.metrics?.confidence || 0}%
                    </span>
                  </div>
                  <div className="w-full bg-neutral-700 rounded-full h-2">
                    <div
                      className="bg-purple-500 h-2 rounded-full transition-all"
                      style={{
                        width: `${comparisonResult.valyu.metrics?.confidence || 0}%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Error State */}
              {!comparisonResult.valyu.success && (
                <div className="flex-1 flex items-center justify-center text-red-400 text-lg">
                  {comparisonResult.valyu.error || "Research failed"}
                </div>
              )}

              {/* Success State - Tabbed Content */}
              {comparisonResult.valyu.success &&
                comparisonResult.valyu.dossier && (
                  <div className="flex-1 overflow-hidden">
                    <Tabs
                      defaultValue="narrative"
                      className="h-full flex flex-col"
                    >
                      <TabsList className="bg-neutral-900 mb-4 w-full justify-start flex-wrap">
                        <TabsTrigger value="narrative">Narrative</TabsTrigger>
                        <TabsTrigger value="developments">
                          Key Developments
                        </TabsTrigger>
                        <TabsTrigger value="outline">
                          🎬 Video Outline
                        </TabsTrigger>
                        <TabsTrigger value="assets">🎨 Assets</TabsTrigger>
                        <TabsTrigger value="facts">Facts</TabsTrigger>
                        <TabsTrigger value="quotes">Quotes</TabsTrigger>
                        <TabsTrigger value="entities">Entities</TabsTrigger>
                        <TabsTrigger value="timeline">Timeline</TabsTrigger>
                        <TabsTrigger value="sources">Sources</TabsTrigger>
                      </TabsList>

                      <div className="flex-1 overflow-y-auto">
                        {/* Narrative Tab */}
                        <TabsContent
                          value="narrative"
                          className="space-y-4 mt-0"
                        >
                          {comparisonResult.valyu.dossier?.narrative ? (
                            <div className="space-y-4">
                              {/* Hook */}
                              <div className="bg-neutral-900 rounded-lg p-4 border border-purple-500/30">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-xs font-bold text-purple-400 uppercase">
                                    🎯 Hook
                                  </span>
                                </div>
                                <p className="text-neutral-200">
                                  {
                                    comparisonResult.valyu.dossier.narrative
                                      .hook
                                  }
                                </p>
                              </div>
                              {/* Summary */}
                              {comparisonResult.valyu.dossier.narrative
                                .summary && (
                                <div className="bg-neutral-900 rounded-lg p-4">
                                  <span className="text-xs font-bold text-blue-400 uppercase mb-2 block">
                                    📋 Summary
                                  </span>
                                  <p className="text-neutral-300 whitespace-pre-line">
                                    {
                                      comparisonResult.valyu.dossier.narrative
                                        .summary
                                    }
                                  </p>
                                </div>
                              )}
                              {/* Background */}
                              {comparisonResult.valyu.dossier.narrative
                                .background && (
                                <div className="bg-neutral-900 rounded-lg p-4">
                                  <span className="text-xs font-bold text-green-400 uppercase mb-2 block">
                                    📚 Background
                                  </span>
                                  <p className="text-neutral-300 whitespace-pre-line">
                                    {
                                      comparisonResult.valyu.dossier.narrative
                                        .background
                                    }
                                  </p>
                                </div>
                              )}
                              {/* Prior Events */}
                              {comparisonResult.valyu.dossier.narrative
                                .priorEvents &&
                                comparisonResult.valyu.dossier.narrative
                                  .priorEvents.length > 0 && (
                                  <div className="bg-neutral-900 rounded-lg p-4">
                                    <span className="text-xs font-bold text-yellow-400 uppercase mb-2 block">
                                      ⏮️ Prior Events
                                    </span>
                                    <ol className="list-decimal list-inside space-y-1 text-neutral-300">
                                      {comparisonResult.valyu.dossier.narrative.priorEvents.map(
                                        (event: string, idx: number) => (
                                          <li key={idx}>{event}</li>
                                        ),
                                      )}
                                    </ol>
                                  </div>
                                )}
                              {/* Key Terms */}
                              {comparisonResult.valyu.dossier.narrative
                                .keyTerms &&
                                Object.keys(
                                  comparisonResult.valyu.dossier.narrative
                                    .keyTerms,
                                ).length > 0 && (
                                  <div className="bg-neutral-900 rounded-lg p-4 border border-orange-500/30">
                                    <span className="text-xs font-bold text-orange-400 uppercase mb-2 block">
                                      📖 Key Terms
                                    </span>
                                    <dl className="space-y-2">
                                      {Object.entries(
                                        comparisonResult.valyu.dossier.narrative
                                          .keyTerms as Record<string, string>,
                                      ).map(([term, definition]) => (
                                        <div key={term}>
                                          <dt className="text-white font-medium">
                                            {term}
                                          </dt>
                                          <dd className="text-neutral-400 text-sm ml-4">
                                            {definition}
                                          </dd>
                                        </div>
                                      ))}
                                    </dl>
                                  </div>
                                )}
                            </div>
                          ) : (
                            <div className="text-center text-neutral-500 py-8">
                              No narrative available (v1 schema)
                            </div>
                          )}
                        </TabsContent>

                        {/* Key Developments Tab */}
                        <TabsContent
                          value="developments"
                          className="space-y-3 mt-0"
                        >
                          {comparisonResult.valyu.dossier?.keyDevelopments
                            ?.length > 0 ? (
                            comparisonResult.valyu.dossier.keyDevelopments.map(
                              (dev: any, idx: number) => (
                                <div
                                  key={dev.id || idx}
                                  className="bg-neutral-900 rounded-lg p-4 border border-neutral-800"
                                >
                                  <div className="flex items-start gap-3">
                                    <div className="flex-shrink-0 w-8 h-8 bg-purple-500/20 rounded-full flex items-center justify-center">
                                      <span className="text-sm font-bold text-purple-400">
                                        {idx + 1}
                                      </span>
                                    </div>
                                    <div className="flex-1">
                                      {/* Timestamp and Who */}
                                      <div className="flex items-center gap-2 mb-1">
                                        {dev.timestamp && (
                                          <span className="text-xs font-mono bg-neutral-800 px-1.5 py-0.5 rounded text-yellow-400">
                                            {dev.timestamp}
                                          </span>
                                        )}
                                        {dev.who?.length > 0 && (
                                          <span className="text-xs text-blue-400">
                                            {dev.who.join(", ")}
                                          </span>
                                        )}
                                      </div>
                                      {/* What happened */}
                                      <p className="text-sm text-white font-medium mb-1">
                                        {dev.what}
                                      </p>
                                      {/* Significance */}
                                      {dev.significance && (
                                        <p className="text-xs text-neutral-400">
                                          <span className="text-green-400 font-medium">
                                            Significance:
                                          </span>{" "}
                                          {dev.significance}
                                        </p>
                                      )}
                                      {/* Source IDs */}
                                      {dev.sourceIds?.length > 0 && (
                                        <div className="flex gap-1 mt-2">
                                          {dev.sourceIds.map((sid: string) => (
                                            <span
                                              key={sid}
                                              className="text-xs font-mono bg-neutral-800 px-1 py-0.5 rounded text-purple-400"
                                            >
                                              {sid}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ),
                            )
                          ) : (
                            <div className="text-center text-neutral-500 py-8">
                              No key developments found
                            </div>
                          )}
                        </TabsContent>

                        {/* Video Outline Tab */}
                        <TabsContent value="outline" className="space-y-3 mt-0">
                          {comparisonResult.valyu.outline?.spine?.beats
                            ?.length > 0 ? (
                            <div className="space-y-3">
                              <div className="text-sm text-neutral-400 mb-4">
                                <span className="font-medium text-white">
                                  {comparisonResult.valyu.outline?.spine
                                    ?.beatCount ?? 0}{" "}
                                  beats
                                </span>
                                {" • "}
                                <span>
                                  ~
                                  {Math.round(
                                    (comparisonResult.valyu.outline
                                      ?.durationDecision
                                      ?.recommendedDurationSeconds ?? 0) / 60,
                                  )}{" "}
                                  min recommended
                                </span>
                              </div>
                              {comparisonResult.valyu.outline?.spine?.beats?.map(
                                (beat: any, idx: number) => (
                                  <div
                                    key={beat.id || idx}
                                    className="bg-neutral-900 rounded-lg p-4 border border-neutral-800"
                                  >
                                    <div className="flex items-start gap-3">
                                      <div className="flex-shrink-0 w-8 h-8 bg-blue-500/20 rounded-full flex items-center justify-center">
                                        <span className="text-sm font-bold text-blue-400">
                                          {beat.index + 1}
                                        </span>
                                      </div>
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                          <span
                                            className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${
                                              beat.classification?.type ===
                                              "HOOK"
                                                ? "bg-purple-500/20 text-purple-400"
                                                : beat.classification?.type ===
                                                    "ESCALATION"
                                                  ? "bg-yellow-500/20 text-yellow-400"
                                                  : beat.classification
                                                        ?.type === "CLIMAX"
                                                    ? "bg-red-500/20 text-red-400"
                                                    : beat.classification
                                                          ?.type ===
                                                        "RESOLUTION"
                                                      ? "bg-green-500/20 text-green-400"
                                                      : "bg-neutral-500/20 text-neutral-400"
                                            }`}
                                          >
                                            {beat.classification?.type ||
                                              "BEAT"}
                                          </span>
                                          <span className="text-xs text-neutral-500">
                                            ~{beat.targetDurationSeconds}s
                                          </span>
                                        </div>
                                        <p className="text-neutral-200">
                                          {beat.contentSummary}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                ),
                              )}
                            </div>
                          ) : (
                            <div className="text-center text-neutral-500 py-8">
                              No video outline available. Provide a duration
                              range to generate spine.
                            </div>
                          )}
                        </TabsContent>

                        {/* Assets Tab */}
                        <TabsContent value="assets" className="space-y-6 mt-0">
                          {comparisonResult.valyu.outline?.assetRegistry ? (
                            <div className="space-y-6">
                              {/* Characters */}
                              {comparisonResult.valyu.outline.assetRegistry
                                .characters?.length > 0 && (
                                <div>
                                  <h3 className="text-sm font-bold text-purple-400 uppercase mb-3">
                                    👤 Characters (
                                    {
                                      comparisonResult.valyu.outline
                                        .assetRegistry.characters.length
                                    }
                                    )
                                  </h3>
                                  <div className="grid gap-3">
                                    {comparisonResult.valyu.outline.assetRegistry.characters.map(
                                      (char: any, idx: number) => (
                                        <div
                                          key={char.id || idx}
                                          className="bg-neutral-900 rounded-lg p-4 border border-purple-500/30"
                                        >
                                          <div className="flex items-center gap-2 mb-2">
                                            <span className="font-bold text-white">
                                              {char.name}
                                            </span>
                                            <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded">
                                              {char.role}
                                            </span>
                                          </div>
                                          {char.physicalCharacteristics && (
                                            <div className="text-sm text-neutral-400 space-y-1">
                                              <p>
                                                <span className="text-neutral-500">
                                                  Demographics:
                                                </span>{" "}
                                                {
                                                  char.physicalCharacteristics
                                                    .demographics?.age
                                                }
                                                ,{" "}
                                                {
                                                  char.physicalCharacteristics
                                                    .demographics?.gender
                                                }
                                                {char.physicalCharacteristics
                                                  .demographics?.ethnicity &&
                                                  `, ${char.physicalCharacteristics.demographics.ethnicity}`}
                                              </p>
                                              <p>
                                                <span className="text-neutral-500">
                                                  Build:
                                                </span>{" "}
                                                {
                                                  char.physicalCharacteristics
                                                    .bodyStructure?.height
                                                }
                                                ,{" "}
                                                {
                                                  char.physicalCharacteristics
                                                    .bodyStructure?.build
                                                }
                                              </p>
                                              {char.physicalCharacteristics
                                                .hair && (
                                                <p>
                                                  <span className="text-neutral-500">
                                                    Hair:
                                                  </span>{" "}
                                                  {
                                                    char.physicalCharacteristics
                                                      .hair.color
                                                  }{" "}
                                                  {
                                                    char.physicalCharacteristics
                                                      .hair.style
                                                  }
                                                </p>
                                              )}
                                            </div>
                                          )}
                                          {char.wardrobe?.defaultOutfit && (
                                            <p className="text-sm text-neutral-500 mt-2">
                                              <span className="text-neutral-600">
                                                Wardrobe:
                                              </span>{" "}
                                              {char.wardrobe.defaultOutfit}
                                            </p>
                                          )}
                                        </div>
                                      ),
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Locations */}
                              {comparisonResult.valyu.outline.assetRegistry
                                .locations?.length > 0 && (
                                <div>
                                  <h3 className="text-sm font-bold text-blue-400 uppercase mb-3">
                                    📍 Locations (
                                    {
                                      comparisonResult.valyu.outline
                                        .assetRegistry.locations.length
                                    }
                                    )
                                  </h3>
                                  <div className="grid gap-3">
                                    {comparisonResult.valyu.outline.assetRegistry.locations.map(
                                      (loc: any, idx: number) => (
                                        <div
                                          key={loc.id || idx}
                                          className="bg-neutral-900 rounded-lg p-4 border border-blue-500/30"
                                        >
                                          <div className="flex items-center gap-2 mb-2">
                                            <span className="font-bold text-white">
                                              {loc.name}
                                            </span>
                                            <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded">
                                              {loc.type}
                                            </span>
                                          </div>
                                          {loc.structuralDetails && (
                                            <p className="text-sm text-neutral-400">
                                              {loc.structuralDetails
                                                .architecture ||
                                                loc.structuralDetails.setting}
                                            </p>
                                          )}
                                        </div>
                                      ),
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Objects */}
                              {comparisonResult.valyu.outline.assetRegistry
                                .objects?.length > 0 && (
                                <div>
                                  <h3 className="text-sm font-bold text-yellow-400 uppercase mb-3">
                                    📦 Objects (
                                    {
                                      comparisonResult.valyu.outline
                                        .assetRegistry.objects.length
                                    }
                                    )
                                  </h3>
                                  <div className="grid gap-3">
                                    {comparisonResult.valyu.outline.assetRegistry.objects.map(
                                      (obj: any, idx: number) => (
                                        <div
                                          key={obj.id || idx}
                                          className="bg-neutral-900 rounded-lg p-4 border border-yellow-500/30"
                                        >
                                          <div className="flex items-center gap-2 mb-2">
                                            <span className="font-bold text-white">
                                              {obj.name}
                                            </span>
                                            <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded">
                                              {obj.type}
                                            </span>
                                          </div>
                                          {obj.physicalDescription && (
                                            <p className="text-sm text-neutral-400">
                                              {obj.physicalDescription}
                                            </p>
                                          )}
                                        </div>
                                      ),
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="text-center text-neutral-500 py-8">
                              No asset profiles available. Provide a duration
                              range to generate assets.
                            </div>
                          )}
                        </TabsContent>

                        {/* Facts Tab */}
                        <TabsContent value="facts" className="space-y-2 mt-0">
                          {comparisonResult.valyu.dossier?.facts?.length > 0 ? (
                            comparisonResult.valyu.dossier.facts.map(
                              (fact: any, idx: number) => (
                                <div
                                  key={fact.id || idx}
                                  className="bg-neutral-900 rounded-lg p-3 border border-neutral-800"
                                >
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className="text-xs text-neutral-500">
                                      [{fact.id || `FACT-${idx + 1}`}]
                                    </span>
                                    {fact.primarySourceId && (
                                      <span className="text-xs text-purple-400">
                                        [{fact.primarySourceId}]
                                      </span>
                                    )}
                                    <span
                                      className={`text-xs px-1.5 py-0.5 rounded ${
                                        fact.confidence === "high"
                                          ? "bg-green-500/20 text-green-400"
                                          : fact.confidence === "medium"
                                            ? "bg-yellow-500/20 text-yellow-400"
                                            : "bg-neutral-700 text-neutral-400"
                                      }`}
                                    >
                                      {fact.confidence || "unknown"}
                                    </span>
                                  </div>
                                  <p className="text-sm text-neutral-200">
                                    {fact.statement}
                                  </p>
                                </div>
                              ),
                            )
                          ) : (
                            <div className="text-center text-neutral-500 py-8">
                              No facts found
                            </div>
                          )}
                        </TabsContent>

                        {/* Quotes Tab */}
                        <TabsContent value="quotes" className="space-y-2 mt-0">
                          {comparisonResult.valyu.dossier?.quotes?.length >
                          0 ? (
                            comparisonResult.valyu.dossier.quotes.map(
                              (quote: any, idx: number) => (
                                <div
                                  key={quote.id || idx}
                                  className="bg-neutral-900 rounded-lg p-3 border border-neutral-800"
                                >
                                  <blockquote className="text-sm text-neutral-200 italic border-l-2 border-green-500 pl-3">
                                    "{quote.quote || quote.text}"
                                  </blockquote>
                                  <div className="flex items-center gap-2 mt-2 text-xs text-neutral-400">
                                    <span className="font-medium text-green-400">
                                      {quote.speaker || quote.attribution}
                                    </span>
                                    {quote.sourceId && (
                                      <span className="text-neutral-500">
                                        [{quote.sourceId}]
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ),
                            )
                          ) : (
                            <div className="text-center text-neutral-500 py-8">
                              No quotes found
                            </div>
                          )}
                        </TabsContent>

                        {/* Entities Tab */}
                        <TabsContent
                          value="entities"
                          className="space-y-3 mt-0"
                        >
                          {(() => {
                            const entities =
                              comparisonResult.valyu.dossier?.entitiesV2 ||
                              comparisonResult.valyu.dossier?.entities ||
                              [];
                            if (entities.length > 0) {
                              return (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  {entities.map((entity: any, idx: number) => (
                                    <div
                                      key={entity.name || idx}
                                      className="bg-neutral-900 rounded-lg p-4 border border-neutral-800"
                                    >
                                      <div className="flex items-center gap-2 mb-2">
                                        <span
                                          className={`text-xs px-1.5 py-0.5 rounded uppercase ${
                                            entity.type === "person"
                                              ? "bg-blue-500/20 text-blue-400"
                                              : entity.type === "organization"
                                                ? "bg-purple-500/20 text-purple-400"
                                                : entity.type === "location"
                                                  ? "bg-green-500/20 text-green-400"
                                                  : "bg-yellow-500/20 text-yellow-400"
                                          }`}
                                        >
                                          {entity.type}
                                        </span>
                                      </div>
                                      <p className="text-base font-medium text-white">
                                        {entity.name}
                                      </p>
                                      <p className="text-sm text-neutral-400 mt-1">
                                        {entity.role}
                                      </p>
                                      {entity.bio && (
                                        <p className="text-sm text-neutral-300 mt-2 italic border-l-2 border-neutral-700 pl-3">
                                          {entity.bio}
                                        </p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              );
                            }
                            return (
                              <div className="text-center text-neutral-500 py-8">
                                No entities found
                              </div>
                            );
                          })()}
                        </TabsContent>

                        {/* Timeline Tab */}
                        <TabsContent
                          value="timeline"
                          className="space-y-2 mt-0"
                        >
                          {comparisonResult.valyu.dossier?.timeline?.length >
                          0 ? (
                            <div className="space-y-2">
                              {comparisonResult.valyu.dossier.timeline.map(
                                (event: any, idx: number) => (
                                  <div
                                    key={idx}
                                    className="bg-neutral-900 rounded-lg p-3 border border-neutral-800 flex gap-4"
                                  >
                                    <div className="flex-shrink-0 w-24 text-sm font-mono text-orange-400">
                                      {event.date || event.period}
                                    </div>
                                    <div className="flex-1">
                                      <p className="text-sm text-neutral-200">
                                        {event.event || event.description}
                                      </p>
                                    </div>
                                  </div>
                                ),
                              )}
                            </div>
                          ) : (
                            <div className="text-center text-neutral-500 py-8">
                              No timeline events found
                            </div>
                          )}
                        </TabsContent>

                        {/* Sources Tab */}
                        <TabsContent value="sources" className="space-y-2 mt-0">
                          {comparisonResult.valyu.dossier?.worksCited?.length >
                          0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {comparisonResult.valyu.dossier.worksCited.map(
                                (source: any, idx: number) => (
                                  <div
                                    key={source.id || idx}
                                    className="bg-neutral-900 rounded-lg p-3 border border-neutral-800 flex gap-3"
                                  >
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className="text-xs text-neutral-500">
                                          [{source.id || `SRC-${idx + 1}`}]
                                        </span>
                                        {source.reliabilityTier && (
                                          <span
                                            className={`text-xs px-1.5 py-0.5 rounded ${
                                              source.reliabilityTier === 1
                                                ? "bg-green-500/20 text-green-400"
                                                : source.reliabilityTier === 2
                                                  ? "bg-blue-500/20 text-blue-400"
                                                  : "bg-neutral-700 text-neutral-400"
                                            }`}
                                          >
                                            Tier {source.reliabilityTier}
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-sm font-medium text-neutral-200">
                                        {source.title}
                                      </p>
                                      {source.author && (
                                        <p className="text-xs text-neutral-400 mt-0.5">
                                          by {source.author}
                                        </p>
                                      )}
                                      {source.excerpt && (
                                        <p className="text-xs text-neutral-500 mt-2 line-clamp-2">
                                          {source.excerpt}
                                        </p>
                                      )}
                                    </div>
                                    {source.url && (
                                      <a
                                        href={source.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-neutral-400 hover:text-white transition-colors flex-shrink-0"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <ExternalLink className="w-4 h-4" />
                                      </a>
                                    )}
                                  </div>
                                ),
                              )}
                            </div>
                          ) : (
                            <div className="text-center text-neutral-500 py-8">
                              No sources found
                            </div>
                          )}
                        </TabsContent>
                      </div>
                    </Tabs>
                  </div>
                )}
            </div>
          ) : !output ? (
            <div className="h-full flex items-center justify-center text-neutral-600">
              <div className="text-center">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Output will appear here after generation</p>
              </div>
            </div>
          ) : (
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="h-full flex flex-col"
            >
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
                <TabsTrigger
                  value="avscript"
                  className="flex items-center gap-2"
                >
                  <Video className="w-4 h-4" />
                  AV Script
                  {avScriptScenes.length > 0 && (
                    <span className="ml-1 text-[10px] bg-teal-500/20 text-teal-400 px-1.5 rounded">
                      {avScriptStats?.totalScenes}
                    </span>
                  )}
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
                            0,
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
                      {/* Facts with Source Attribution */}
                      <div className="bg-neutral-900 rounded-lg p-4">
                        <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-green-500" />
                          Verified Facts ({output.researchDossier.facts.length})
                        </h4>
                        <TooltipProvider>
                          <div className="space-y-2 max-h-80 overflow-y-auto">
                            {output.researchDossier.facts.map((fact) => {
                              const primarySource = fact.primarySourceId
                                ? output.researchDossier?.sourceDocuments?.find(
                                    (s) => s.id === fact.primarySourceId,
                                  ) ||
                                  output.researchDossier?.worksCited?.find(
                                    (s) => s.id === fact.primarySourceId,
                                  )
                                : null;

                              return (
                                <Tooltip key={fact.id}>
                                  <TooltipTrigger asChild>
                                    <div className="p-2 bg-neutral-800 rounded text-xs cursor-help hover:bg-neutral-750 transition-colors">
                                      <div className="flex items-start gap-2">
                                        <span className="text-neutral-500 shrink-0">
                                          [{fact.id}]
                                        </span>
                                        <span className="text-neutral-300 flex-1">
                                          {fact.statement}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2 mt-1.5">
                                        <span
                                          className={`px-1 py-0.5 rounded text-[10px] ${
                                            fact.confidence === "verified"
                                              ? "bg-green-500/20 text-green-400"
                                              : fact.confidence === "high"
                                                ? "bg-blue-500/20 text-blue-400"
                                                : "bg-yellow-500/20 text-yellow-400"
                                          }`}
                                        >
                                          {fact.confidence}
                                        </span>
                                        {fact.primarySourceId && (
                                          <span className="text-blue-400 text-[10px] font-mono">
                                            [{fact.primarySourceId}]
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </TooltipTrigger>
                                  {primarySource && (
                                    <TooltipContent
                                      side="right"
                                      className="max-w-md p-4 bg-neutral-900 border border-neutral-700"
                                    >
                                      <div className="space-y-2">
                                        <div className="font-medium text-white">
                                          {primarySource.title}
                                        </div>
                                        {"content" in primarySource &&
                                          primarySource.content && (
                                            <p className="text-sm text-neutral-400 italic line-clamp-3">
                                              "
                                              {primarySource.content.substring(
                                                0,
                                                200,
                                              )}
                                              ..."
                                            </p>
                                          )}
                                        {"excerpt" in primarySource &&
                                          primarySource.excerpt &&
                                          !("content" in primarySource) && (
                                            <p className="text-sm text-neutral-400 italic line-clamp-3">
                                              "{primarySource.excerpt}"
                                            </p>
                                          )}
                                        <div className="flex items-center gap-2 text-xs pt-1">
                                          <span
                                            className={`px-1.5 py-0.5 rounded ${
                                              primarySource.reliabilityTier ===
                                              1
                                                ? "bg-green-500/20 text-green-400"
                                                : primarySource.reliabilityTier ===
                                                    2
                                                  ? "bg-blue-500/20 text-blue-400"
                                                  : primarySource.reliabilityTier ===
                                                      3
                                                    ? "bg-yellow-500/20 text-yellow-400"
                                                    : "bg-neutral-500/20 text-neutral-400"
                                            }`}
                                          >
                                            Tier {primarySource.reliabilityTier}
                                          </span>
                                          {primarySource.url && (
                                            <a
                                              href={primarySource.url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-blue-400 hover:underline flex items-center gap-1"
                                              onClick={(e) =>
                                                e.stopPropagation()
                                              }
                                            >
                                              Open Source
                                              <ExternalLink className="w-3 h-3" />
                                            </a>
                                          )}
                                        </div>
                                      </div>
                                    </TooltipContent>
                                  )}
                                </Tooltip>
                              );
                            })}
                          </div>
                        </TooltipProvider>
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
                                ),
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
                                output.spine.totalDurationSeconds / 60,
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

              {/* AV Script Tab - Visual Planning */}
              <TabsContent
                value="avscript"
                className="flex-1 overflow-hidden flex"
              >
                {avScriptScenes.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center max-w-md">
                      <Video className="w-16 h-16 mx-auto mb-4 text-neutral-700" />
                      <h3 className="text-lg font-bold text-white mb-2">
                        Generate AV Script
                      </h3>
                      <p className="text-neutral-400 mb-6">
                        Create scene and shot breakdowns from your script with
                        AI-generated image and video prompts.
                      </p>
                      {avError && (
                        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-sm">
                          {avError}
                        </div>
                      )}
                      <Button
                        onClick={generateAVScript}
                        disabled={isGeneratingAV}
                        className="bg-teal-600 hover:bg-teal-700"
                      >
                        {isGeneratingAV ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <Clapperboard className="w-4 h-4 mr-2" />
                            Generate AV Script
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex overflow-hidden min-h-0">
                    {/* Scene List */}
                    <div className="w-72 border-r border-neutral-800 flex flex-col min-h-0">
                      <div className="px-4 py-3 border-b border-neutral-700 flex items-center justify-between shrink-0">
                        <span className="text-sm font-medium text-neutral-400">
                          Scenes ({avScriptStats?.totalScenes || 0})
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={generateAVScript}
                          disabled={isGeneratingAV}
                          className="text-xs"
                        >
                          {isGeneratingAV ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            "Regenerate"
                          )}
                        </Button>
                      </div>
                      <ScrollArea className="flex-1 h-0">
                        <div className="p-3 space-y-2">
                          {avScriptScenes.map((scene) => (
                            <button
                              key={scene.sceneIndex}
                              onClick={() => {
                                setSelectedAvScene(scene);
                                setSelectedAvShot(null);
                              }}
                              className={`w-full text-left p-3 rounded-lg border transition-all ${
                                selectedAvScene?.sceneIndex === scene.sceneIndex
                                  ? "bg-teal-500/10 border-teal-500/50"
                                  : "bg-neutral-800 border-neutral-700 hover:border-neutral-600"
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-medium text-white text-sm">
                                  Scene {scene.sceneIndex}
                                </span>
                                <span className="text-[10px] px-1.5 py-0.5 bg-teal-500/20 text-teal-400 rounded">
                                  {scene.sceneType.replace(/_/g, " ")}
                                </span>
                              </div>
                              <p className="text-xs text-neutral-400 mb-1 line-clamp-2">
                                {scene.summary}
                              </p>
                              <div className="flex gap-2 text-[10px] text-neutral-500">
                                <span>{scene.shots.length} shots</span>
                                <span>{scene.duration}s</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>

                    {/* Shot Details */}
                    <div className="flex-1 flex flex-col overflow-hidden">
                      {!selectedAvScene ? (
                        <div className="flex-1 flex items-center justify-center text-neutral-500">
                          Select a scene to see shots
                        </div>
                      ) : selectedAvShot ? (
                        <ScrollArea className="flex-1 p-6">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedAvShot(null)}
                            className="text-neutral-400 hover:text-white -ml-2 mb-4"
                          >
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Back to Shots
                          </Button>

                          <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                              <div className="p-3 bg-neutral-800 rounded-lg">
                                <span className="text-xs text-neutral-500">
                                  Shot Type
                                </span>
                                <p className="text-white font-medium">
                                  {selectedAvShot.shotType.replace(/_/g, " ")}
                                </p>
                              </div>
                              <div className="p-3 bg-neutral-800 rounded-lg">
                                <span className="text-xs text-neutral-500">
                                  Camera
                                </span>
                                <p className="text-white font-medium">
                                  {selectedAvShot.cameraMovement.replace(
                                    /_/g,
                                    " ",
                                  )}
                                </p>
                              </div>
                            </div>

                            <div className="p-4 bg-neutral-800 rounded-lg">
                              <div className="flex items-center gap-2 mb-3">
                                <Image className="w-4 h-4 text-purple-400" />
                                <span className="text-sm font-medium text-white">
                                  Image Prompt
                                </span>
                                <span
                                  className={`text-xs px-2 py-0.5 rounded ${
                                    selectedAvShot.generationStrategy ===
                                    "create_new"
                                      ? "bg-purple-500/20 text-purple-400"
                                      : "bg-amber-500/20 text-amber-400"
                                  }`}
                                >
                                  {selectedAvShot.generationStrategy ===
                                  "create_new"
                                    ? "NEW"
                                    : "EDIT"}
                                </span>
                              </div>
                              <p className="text-sm text-neutral-300 leading-relaxed whitespace-pre-wrap">
                                {selectedAvShot.imagePrompt}
                              </p>
                            </div>

                            <div className="p-4 bg-neutral-800 rounded-lg">
                              <div className="flex items-center gap-2 mb-3">
                                <Video className="w-4 h-4 text-teal-400" />
                                <span className="text-sm font-medium text-white">
                                  Motion Prompt
                                </span>
                              </div>
                              <p className="text-sm text-neutral-300">
                                {selectedAvShot.videoMotionPrompt}
                              </p>
                            </div>
                          </div>
                        </ScrollArea>
                      ) : (
                        <ScrollArea className="flex-1 p-6">
                          <div className="space-y-4">
                            <div className="p-4 bg-neutral-800 rounded-lg">
                              <h4 className="font-medium text-white mb-2">
                                Scene {selectedAvScene.sceneIndex}:{" "}
                                {selectedAvScene.summary}
                              </h4>
                              <p className="text-sm text-neutral-400">
                                {selectedAvScene.narration}
                              </p>
                            </div>

                            <div className="space-y-2">
                              {selectedAvScene.shots.map((shot) => (
                                <button
                                  key={shot.shotIndex}
                                  onClick={() => setSelectedAvShot(shot)}
                                  className="w-full text-left p-4 bg-neutral-800 rounded-lg border border-neutral-700 hover:border-teal-500/50 transition-all"
                                >
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                      <Camera className="w-4 h-4 text-neutral-400" />
                                      <span className="font-medium text-white">
                                        Shot {shot.shotIndex}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span
                                        className={`text-xs px-2 py-0.5 rounded ${
                                          shot.generationStrategy ===
                                          "create_new"
                                            ? "bg-purple-500/20 text-purple-400"
                                            : "bg-amber-500/20 text-amber-400"
                                        }`}
                                      >
                                        {shot.generationStrategy ===
                                        "create_new"
                                          ? "NEW"
                                          : "EDIT"}
                                      </span>
                                      <ChevronRight className="w-4 h-4 text-neutral-500" />
                                    </div>
                                  </div>
                                  <p className="text-xs text-neutral-400 line-clamp-2">
                                    {shot.imagePrompt.substring(0, 120)}...
                                  </p>
                                </button>
                              ))}
                            </div>
                          </div>
                        </ScrollArea>
                      )}
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>

      <Dialog open={isAssetDetailOpen} onOpenChange={setIsAssetDetailOpen}>
        <DialogContent
          className="z-[10010] max-w-2xl bg-neutral-900 border-neutral-800 text-white max-h-[80vh] overflow-hidden flex flex-col"
          overlayClassName="z-[10009] bg-black/80"
        >
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
                              ),
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
                              ),
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
  // For inline mode, render directly; for overlay mode, use portal
  if (inline) {
    return content;
  }
  return createPortal(content, document.body);
}
