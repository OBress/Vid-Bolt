"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Loader2,
  X,
  Cpu,
  Image,
  Video,
  Pencil,
  Play,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Activity,
  Settings2,
  Sparkles,
  RefreshCw,
} from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

interface GPUApiTesterProps {
  isOpen: boolean;
  onClose: () => void;
}

interface DebugInfo {
  request?: Record<string, unknown>;
  response?: unknown;
  statusCode?: number;
  gpuApiUrl?: string;
}

interface TestResult {
  success: boolean;
  type: string;
  imageUrl?: string;
  videoUrl?: string;
  error?: string;
  errorCode?: string;
  generationTime?: number;
  r2Key?: string;
  inputImageUrl?: string;
  durationSeconds?: number;
  fps?: number;
  debug?: DebugInfo;
}

type TestStatus = "idle" | "loading" | "success" | "error";
type TabType = "system" | "mode" | "image" | "image-edit" | "video";
type AspectRatio = "16:9" | "9:16" | "1:1" | "4:3" | "3:4";
type FPS = 8 | 12 | 16 | 24 | 30;
type ApiMode = "mock" | "real";

// System/Mode types
interface HealthData {
  status: string;
  version: string;
  mock_mode: boolean;
}

interface ReadinessData {
  ready: boolean;
  status: string;
  version: string;
  mock_mode: boolean;
  current_mode: string | null;
  models_loaded: boolean;
}

interface SystemData {
  system: {
    os: string;
    python_version: string;
    cpu_count: number;
    hostname: string;
  };
  gpu: {
    name: string;
    memory_total_gb: number;
    memory_used_gb: number;
    memory_free_gb: number;
    memory_usage_percent: number;
    temperature_celsius?: number;
  } | null;
  mode: {
    mode: string;
    is_busy: boolean;
    loaded_models: string[];
  } | null;
  mock_mode: boolean;
}

interface ModeData {
  mode: string;
  is_busy: boolean;
  active_job_id: string | null;
  loaded_models: string[];
}

// ============================================================================
// COMPONENT
// ============================================================================

export function GPUApiTester({ isOpen, onClose }: GPUApiTesterProps) {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("system");
  const [apiMode, setApiMode] = useState<ApiMode>("mock");

  // System/Mode State
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [readinessData, setReadinessData] = useState<ReadinessData | null>(
    null
  );
  const [systemData, setSystemData] = useState<SystemData | null>(null);
  const [modeData, setModeData] = useState<ModeData | null>(null);
  const [systemStatus, setSystemStatus] = useState<TestStatus>("idle");
  const [modeStatus, setModeStatus] = useState<TestStatus>("idle");
  const [modeSwitching, setModeSwitching] = useState(false);

  // Image Creation State
  const [imagePrompt, setImagePrompt] = useState(
    "A beautiful sunset over mountains with golden light"
  );
  const [imageAspectRatio, setImageAspectRatio] = useState<AspectRatio>("16:9");
  const [imageInferenceSteps, setImageInferenceSteps] = useState(20);
  const [imageSeed, setImageSeed] = useState<string>("");
  const [imageStatus, setImageStatus] = useState<TestStatus>("idle");
  const [imageResult, setImageResult] = useState<TestResult | null>(null);
  const [imageDebugExpanded, setImageDebugExpanded] = useState(false);

  // Image Edit State
  const [editPrompt, setEditPrompt] = useState(
    "Change the sky to nighttime with stars"
  );
  const [editSourceUrl, setEditSourceUrl] = useState("");
  const [editAspectRatio, setEditAspectRatio] = useState<AspectRatio>("16:9");
  const [editSeed, setEditSeed] = useState<string>("");
  const [editStatus, setEditStatus] = useState<TestStatus>("idle");
  const [editResult, setEditResult] = useState<TestResult | null>(null);
  const [editDebugExpanded, setEditDebugExpanded] = useState(false);

  // Video Creation State
  const [videoPrompt, setVideoPrompt] = useState(
    "Camera slowly zooms in, subtle movement"
  );
  const [videoStartFrameUrl, setVideoStartFrameUrl] = useState("");
  const [videoDuration, setVideoDuration] = useState(4);
  const [videoFps, setVideoFps] = useState<FPS>(24);
  const [videoAspectRatio, setVideoAspectRatio] = useState<AspectRatio>("16:9");
  const [videoEndFrameUrl, setVideoEndFrameUrl] = useState("");
  const [videoSeed, setVideoSeed] = useState<string>("");
  const [videoStatus, setVideoStatus] = useState<TestStatus>("idle");
  const [videoResult, setVideoResult] = useState<TestResult | null>(null);
  const [videoDebugExpanded, setVideoDebugExpanded] = useState(false);

  // Mount effect for portal
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // =========================================================================
  // POLLING HELPER
  // =========================================================================

  const pollForResult = async (taskId: string): Promise<TestResult> => {
    const maxAttempts = 120; // 2 minutes max for video generation
    let attempts = 0;

    while (attempts < maxAttempts) {
      const response = await fetch(`/api/gpu-api/test/status?taskId=${taskId}`);
      const data = await response.json();

      if (data.status === "completed" || data.status === "failed") {
        return data.output as TestResult;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
      attempts++;
    }

    throw new Error("Timeout waiting for result");
  };

  // =========================================================================
  // SYSTEM/MODE HANDLERS
  // =========================================================================

  const handleCheckHealth = async () => {
    setSystemStatus("loading");
    try {
      const response = await fetch("/api/gpu-api/health");
      const data = await response.json();
      if (data.success) {
        setHealthData(data.data);
        setSystemStatus("success");
      } else {
        setSystemStatus("error");
      }
    } catch {
      setSystemStatus("error");
    }
  };

  const handleCheckReadiness = async () => {
    setSystemStatus("loading");
    try {
      const response = await fetch("/api/gpu-api/health?ready=true");
      const data = await response.json();
      if (data.success) {
        setReadinessData(data.data);
        setSystemStatus("success");
      } else {
        setSystemStatus("error");
      }
    } catch {
      setSystemStatus("error");
    }
  };

  const handleGetSystemStatus = async () => {
    setSystemStatus("loading");
    try {
      const response = await fetch("/api/gpu-api/system");
      const data = await response.json();
      if (data.success) {
        setSystemData(data.data);
        setSystemStatus("success");
      } else {
        setSystemStatus("error");
      }
    } catch {
      setSystemStatus("error");
    }
  };

  const handleGetMode = async () => {
    setModeStatus("loading");
    try {
      const response = await fetch("/api/gpu-api/mode");
      const data = await response.json();
      if (data.success) {
        setModeData(data.data);
        setModeStatus("success");
      } else {
        setModeStatus("error");
      }
    } catch {
      setModeStatus("error");
    }
  };

  const handleSwitchMode = async (targetMode: "image" | "video") => {
    setModeSwitching(true);
    setModeStatus("loading");
    try {
      const response = await fetch("/api/gpu-api/mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetMode }),
      });
      const data = await response.json();
      if (data.success) {
        setModeData(data.data);
        setModeStatus("success");
      } else {
        setModeStatus("error");
      }
    } catch {
      setModeStatus("error");
    } finally {
      setModeSwitching(false);
    }
  };

  // =========================================================================
  // HANDLERS
  // =========================================================================

  const handleTestImageCreation = async () => {
    setImageStatus("loading");
    setImageResult(null);

    try {
      const response = await fetch("/api/gpu-api/test/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: imagePrompt,
          aspectRatio: imageAspectRatio,
          numInferenceSteps: imageInferenceSteps,
          seed: imageSeed ? parseInt(imageSeed) : undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to start test");

      const result = await pollForResult(data.taskId);
      setImageResult(result);
      setImageStatus(result.success ? "success" : "error");
      setImageDebugExpanded(!result.success); // Auto-expand debug on error
    } catch (err) {
      setImageResult({
        success: false,
        type: "image_creation",
        error: err instanceof Error ? err.message : "Unknown error",
      });
      setImageStatus("error");
    }
  };

  const handleTestImageEdit = async () => {
    setEditStatus("loading");
    setEditResult(null);

    try {
      const response = await fetch("/api/gpu-api/test/image-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: editPrompt,
          sourceImageUrl: editSourceUrl || undefined,
          aspectRatio: editAspectRatio,
          seed: editSeed ? parseInt(editSeed) : undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to start test");

      const result = await pollForResult(data.taskId);
      setEditResult(result);
      setEditStatus(result.success ? "success" : "error");
      setEditDebugExpanded(!result.success);
    } catch (err) {
      setEditResult({
        success: false,
        type: "image_edit",
        error: err instanceof Error ? err.message : "Unknown error",
      });
      setEditStatus("error");
    }
  };

  const handleTestVideoCreation = async () => {
    setVideoStatus("loading");
    setVideoResult(null);

    try {
      const response = await fetch("/api/gpu-api/test/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: videoPrompt,
          startFrameUrl: videoStartFrameUrl || undefined,
          durationSeconds: videoDuration,
          fps: videoFps,
          aspectRatio: videoAspectRatio,
          endFrameUrl: videoEndFrameUrl || undefined,
          seed: videoSeed ? parseInt(videoSeed) : undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to start test");

      const result = await pollForResult(data.taskId);
      setVideoResult(result);
      setVideoStatus(result.success ? "success" : "error");
      setVideoDebugExpanded(!result.success);
    } catch (err) {
      setVideoResult({
        success: false,
        type: "video_creation",
        error: err instanceof Error ? err.message : "Unknown error",
      });
      setVideoStatus("error");
    }
  };

  const handleReset = (tab: TabType) => {
    switch (tab) {
      case "image":
        setImageStatus("idle");
        setImageResult(null);
        break;
      case "image-edit":
        setEditStatus("idle");
        setEditResult(null);
        break;
      case "video":
        setVideoStatus("idle");
        setVideoResult(null);
        break;
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // Don't render on server or when not open
  if (!mounted || !isOpen) return null;

  // =========================================================================
  // RENDER HELPERS
  // =========================================================================

  const renderStatusBadge = (status: TestStatus) => {
    switch (status) {
      case "loading":
        return (
          <span className="flex items-center gap-1 text-xs px-2 py-1 bg-blue-500/20 text-blue-400 rounded">
            <Loader2 className="w-3 h-3 animate-spin" />
            Processing
          </span>
        );
      case "success":
        return (
          <span className="flex items-center gap-1 text-xs px-2 py-1 bg-green-500/20 text-green-400 rounded">
            <CheckCircle2 className="w-3 h-3" />
            Success
          </span>
        );
      case "error":
        return (
          <span className="flex items-center gap-1 text-xs px-2 py-1 bg-red-500/20 text-red-400 rounded">
            <AlertCircle className="w-3 h-3" />
            Error
          </span>
        );
      default:
        return null;
    }
  };

  const renderAspectRatioSelector = (
    value: AspectRatio,
    onChange: (v: AspectRatio) => void,
    disabled: boolean,
    color: string
  ) => (
    <div className="flex gap-2 flex-wrap">
      {(["16:9", "9:16", "1:1", "4:3", "3:4"] as AspectRatio[]).map((ratio) => (
        <Button
          key={ratio}
          variant={value === ratio ? "default" : "outline"}
          size="sm"
          onClick={() => onChange(ratio)}
          disabled={disabled}
          className={value === ratio ? `bg-${color}-600` : "border-neutral-700"}
        >
          {ratio}
        </Button>
      ))}
    </div>
  );

  const renderDebugSection = (
    result: TestResult | null,
    expanded: boolean,
    onToggle: () => void
  ) => {
    if (!result?.debug) return null;

    return (
      <div className="mt-4 border border-neutral-700 rounded-lg overflow-hidden">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-between px-4 py-2 bg-neutral-900 hover:bg-neutral-800 transition-colors"
        >
          <span className="text-sm font-medium text-neutral-300">
            Debug Information
          </span>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-neutral-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-neutral-400" />
          )}
        </button>
        {expanded && (
          <div className="p-4 bg-neutral-950 space-y-4">
            {/* GPU API URL */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-neutral-500 uppercase">
                  GPU API URL
                </span>
              </div>
              <code className="block text-xs text-neutral-300 bg-neutral-900 p-2 rounded">
                {result.debug.gpuApiUrl || "N/A"}
              </code>
            </div>

            {/* HTTP Status */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-neutral-500 uppercase">
                  HTTP Status Code
                </span>
              </div>
              <code
                className={`block text-xs p-2 rounded ${
                  result.debug.statusCode === 200
                    ? "text-green-400 bg-green-500/10"
                    : "text-red-400 bg-red-500/10"
                }`}
              >
                {result.debug.statusCode || "N/A"}
              </code>
            </div>

            {/* Request */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-neutral-500 uppercase">
                  Request Body
                </span>
                <button
                  onClick={() =>
                    copyToClipboard(
                      JSON.stringify(result.debug?.request, null, 2)
                    )
                  }
                  className="text-neutral-500 hover:text-neutral-300"
                >
                  <Copy className="w-3 h-3" />
                </button>
              </div>
              <pre className="text-xs text-neutral-300 bg-neutral-900 p-3 rounded overflow-x-auto max-h-48 overflow-y-auto">
                {JSON.stringify(result.debug.request, null, 2)}
              </pre>
            </div>

            {/* Response */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-neutral-500 uppercase">
                  Response Body
                </span>
                <button
                  onClick={() =>
                    copyToClipboard(
                      JSON.stringify(result.debug?.response, null, 2)
                    )
                  }
                  className="text-neutral-500 hover:text-neutral-300"
                >
                  <Copy className="w-3 h-3" />
                </button>
              </div>
              <pre className="text-xs text-neutral-300 bg-neutral-900 p-3 rounded overflow-x-auto max-h-48 overflow-y-auto">
                {JSON.stringify(result.debug.response, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderResult = (
    result: TestResult | null,
    debugExpanded: boolean,
    onDebugToggle: () => void
  ) => {
    if (!result) return null;

    return (
      <div className="mt-6 space-y-4">
        {/* Main Result Card */}
        <div className="p-4 bg-neutral-900 rounded-lg border border-neutral-700">
          <h4 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
            {result.success ? (
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-500" />
            )}
            Result
          </h4>

          {result.error ? (
            <div className="space-y-2">
              <p className="text-sm text-red-400">{result.error}</p>
              {result.errorCode && (
                <p className="text-xs text-neutral-500">
                  Error Code:{" "}
                  <code className="text-red-300">{result.errorCode}</code>
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Generation Time */}
              {result.generationTime !== undefined && (
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-400">Generation Time:</span>
                  <span className="text-white font-mono">
                    {result.generationTime.toFixed(2)}s
                  </span>
                </div>
              )}

              {/* Image URL */}
              {result.imageUrl && (
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm text-neutral-400">Image URL:</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => copyToClipboard(result.imageUrl!)}
                        className="text-neutral-500 hover:text-neutral-300"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <a
                        href={result.imageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-neutral-500 hover:text-neutral-300"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                  <code className="block text-xs text-purple-400 bg-neutral-950 p-2 rounded truncate">
                    {result.imageUrl}
                  </code>
                </div>
              )}

              {/* Video URL */}
              {result.videoUrl && (
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm text-neutral-400">Video URL:</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => copyToClipboard(result.videoUrl!)}
                        className="text-neutral-500 hover:text-neutral-300"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <a
                        href={result.videoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-neutral-500 hover:text-neutral-300"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                  <code className="block text-xs text-teal-400 bg-neutral-950 p-2 rounded truncate">
                    {result.videoUrl}
                  </code>
                </div>
              )}

              {/* R2 Key */}
              {result.r2Key && (
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-400">R2 Key:</span>
                  <code className="text-neutral-300 text-xs">
                    {result.r2Key}
                  </code>
                </div>
              )}

              {/* Input Image (for edit/video) */}
              {result.inputImageUrl && (
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-400">Input Image:</span>
                  <span className="text-white text-xs truncate max-w-[200px]">
                    {result.inputImageUrl.includes("picsum")
                      ? "(placeholder)"
                      : result.inputImageUrl}
                  </span>
                </div>
              )}

              {/* Video-specific info */}
              {result.durationSeconds && (
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-400">Duration:</span>
                  <span className="text-white">{result.durationSeconds}s</span>
                </div>
              )}
              {result.fps && (
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-400">FPS:</span>
                  <span className="text-white">{result.fps}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Debug Section */}
        {renderDebugSection(result, debugExpanded, onDebugToggle)}
      </div>
    );
  };

  // =========================================================================
  // MAIN RENDER
  // =========================================================================

  const content = (
    <div className="fixed inset-0 z-[9999] bg-neutral-950 flex flex-col pointer-events-auto overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-neutral-800">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center">
            <Cpu className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">GPU API Tester</h1>
            <p className="text-sm text-neutral-400">
              Test image generation, editing, and video creation endpoints
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {/* Mock/Real Toggle */}
          <div className="flex items-center gap-3 bg-neutral-900 px-4 py-2 rounded-lg">
            <span
              className={`text-sm ${
                apiMode === "mock"
                  ? "text-orange-400 font-medium"
                  : "text-neutral-500"
              }`}
            >
              Mock
            </span>
            <Switch
              checked={apiMode === "real"}
              onCheckedChange={(checked) =>
                setApiMode(checked ? "real" : "mock")
              }
            />
            <span
              className={`text-sm ${
                apiMode === "real"
                  ? "text-green-400 font-medium"
                  : "text-neutral-500"
              }`}
            >
              Real API
            </span>
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
      </div>

      {/* Tabs */}
      <div className="flex-shrink-0 flex gap-2 px-6 py-3 border-b border-neutral-800 overflow-x-auto">
        <Button
          variant={activeTab === "system" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("system")}
          className={
            activeTab === "system" ? "bg-blue-600 hover:bg-blue-700" : ""
          }
        >
          <Activity className="w-4 h-4 mr-2" />
          System
        </Button>
        <Button
          variant={activeTab === "mode" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("mode")}
          className={
            activeTab === "mode" ? "bg-indigo-600 hover:bg-indigo-700" : ""
          }
        >
          <Settings2 className="w-4 h-4 mr-2" />
          Mode
        </Button>
        <Button
          variant={activeTab === "image" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("image")}
          className={
            activeTab === "image" ? "bg-purple-600 hover:bg-purple-700" : ""
          }
        >
          <Image className="w-4 h-4 mr-2" />
          Image
          {imageStatus !== "idle" && (
            <span className="ml-2">{renderStatusBadge(imageStatus)}</span>
          )}
        </Button>
        <Button
          variant={activeTab === "image-edit" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("image-edit")}
          className={
            activeTab === "image-edit" ? "bg-amber-600 hover:bg-amber-700" : ""
          }
        >
          <Pencil className="w-4 h-4 mr-2" />
          Edit
          {editStatus !== "idle" && (
            <span className="ml-2">{renderStatusBadge(editStatus)}</span>
          )}
        </Button>
        <Button
          variant={activeTab === "video" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("video")}
          className={
            activeTab === "video" ? "bg-teal-600 hover:bg-teal-700" : ""
          }
        >
          <Video className="w-4 h-4 mr-2" />
          Video
          {videoStatus !== "idle" && (
            <span className="ml-2">{renderStatusBadge(videoStatus)}</span>
          )}
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-6 relative z-10">
          {/* System Tab */}
          {activeTab === "system" && (
            <div className="space-y-6">
              <div className="p-4 bg-neutral-900 rounded-lg border border-neutral-700">
                <h3 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-400" />
                  API Status Checks
                </h3>
                <div className="flex gap-3 flex-wrap">
                  <Button
                    onClick={handleCheckHealth}
                    disabled={systemStatus === "loading"}
                    className="bg-blue-600 hover:bg-blue-700"
                    size="sm"
                  >
                    {systemStatus === "loading" ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-2" />
                    )}
                    Health Check
                  </Button>
                  <Button
                    onClick={handleCheckReadiness}
                    disabled={systemStatus === "loading"}
                    className="bg-blue-600 hover:bg-blue-700"
                    size="sm"
                  >
                    {systemStatus === "loading" ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                    )}
                    Readiness
                  </Button>
                  <Button
                    onClick={handleGetSystemStatus}
                    disabled={systemStatus === "loading"}
                    className="bg-blue-600 hover:bg-blue-700"
                    size="sm"
                  >
                    {systemStatus === "loading" ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Cpu className="w-4 h-4 mr-2" />
                    )}
                    Full Status
                  </Button>
                </div>
              </div>

              {/* Health Result */}
              {healthData && (
                <div className="p-4 bg-neutral-900 rounded-lg border border-neutral-700">
                  <h4 className="text-sm font-medium text-neutral-300 mb-3">
                    Health Response
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-neutral-400">Status:</span>
                      <span
                        className={
                          healthData.status === "healthy"
                            ? "text-green-400"
                            : "text-red-400"
                        }
                      >
                        {healthData.status}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-400">Version:</span>
                      <span className="text-white">{healthData.version}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-400">Mock Mode:</span>
                      <span
                        className={
                          healthData.mock_mode
                            ? "text-orange-400"
                            : "text-green-400"
                        }
                      >
                        {healthData.mock_mode ? "Yes" : "No"}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Readiness Result */}
              {readinessData && (
                <div className="p-4 bg-neutral-900 rounded-lg border border-neutral-700">
                  <h4 className="text-sm font-medium text-neutral-300 mb-3">
                    Readiness Response
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-neutral-400">Ready:</span>
                      <span
                        className={
                          readinessData.ready
                            ? "text-green-400"
                            : "text-red-400"
                        }
                      >
                        {readinessData.ready ? "Yes" : "No"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-400">Status:</span>
                      <span className="text-white">{readinessData.status}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-400">Current Mode:</span>
                      <span className="text-purple-400">
                        {readinessData.current_mode || "None"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-400">Models Loaded:</span>
                      <span
                        className={
                          readinessData.models_loaded
                            ? "text-green-400"
                            : "text-yellow-400"
                        }
                      >
                        {readinessData.models_loaded ? "Yes" : "No"}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* System Status Result */}
              {systemData && (
                <div className="p-4 bg-neutral-900 rounded-lg border border-neutral-700">
                  <h4 className="text-sm font-medium text-neutral-300 mb-3">
                    System Status
                  </h4>
                  <div className="space-y-4">
                    {/* System Info */}
                    <div>
                      <h5 className="text-xs font-medium text-neutral-500 uppercase mb-2">
                        System
                      </h5>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-neutral-400">OS:</span>
                          <span className="text-white">
                            {systemData.system.os}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-neutral-400">Python:</span>
                          <span className="text-white">
                            {systemData.system.python_version}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-neutral-400">CPU Count:</span>
                          <span className="text-white">
                            {systemData.system.cpu_count}
                          </span>
                        </div>
                      </div>
                    </div>
                    {/* GPU Info */}
                    {systemData.gpu && (
                      <div>
                        <h5 className="text-xs font-medium text-neutral-500 uppercase mb-2">
                          GPU
                        </h5>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-neutral-400">Name:</span>
                            <span className="text-white">
                              {systemData.gpu.name}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-neutral-400">Memory:</span>
                            <span className="text-white">
                              {systemData.gpu.memory_used_gb.toFixed(1)} /{" "}
                              {systemData.gpu.memory_total_gb.toFixed(1)} GB (
                              {systemData.gpu.memory_usage_percent.toFixed(1)}%)
                            </span>
                          </div>
                          {systemData.gpu.temperature_celsius && (
                            <div className="flex justify-between">
                              <span className="text-neutral-400">Temp:</span>
                              <span className="text-white">
                                {systemData.gpu.temperature_celsius}°C
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {/* Mode Info */}
                    {systemData.mode && (
                      <div>
                        <h5 className="text-xs font-medium text-neutral-500 uppercase mb-2">
                          Mode
                        </h5>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-neutral-400">
                              Current Mode:
                            </span>
                            <span className="text-purple-400 font-medium">
                              {systemData.mode.mode}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-neutral-400">Busy:</span>
                            <span
                              className={
                                systemData.mode.is_busy
                                  ? "text-yellow-400"
                                  : "text-green-400"
                              }
                            >
                              {systemData.mode.is_busy ? "Yes" : "No"}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-neutral-400">
                              Loaded Models:
                            </span>
                            <span className="text-white">
                              {systemData.mode.loaded_models.join(", ") ||
                                "None"}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Mode Tab */}
          {activeTab === "mode" && (
            <div className="space-y-6">
              <div className="p-4 bg-neutral-900 rounded-lg border border-neutral-700">
                <h3 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-indigo-400" />
                  Mode Management
                </h3>
                <div className="flex gap-3">
                  <Button
                    onClick={handleGetMode}
                    disabled={modeStatus === "loading"}
                    className="bg-indigo-600 hover:bg-indigo-700"
                    size="sm"
                  >
                    {modeStatus === "loading" ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-2" />
                    )}
                    Get Mode
                  </Button>
                </div>
              </div>

              {/* Mode Result */}
              {modeData && (
                <div className="p-4 bg-neutral-900 rounded-lg border border-neutral-700">
                  <h4 className="text-sm font-medium text-neutral-300 mb-3">
                    Current Mode
                  </h4>
                  <div className="space-y-2 text-sm mb-4">
                    <div className="flex justify-between">
                      <span className="text-neutral-400">Mode:</span>
                      <span className="text-purple-400 font-medium capitalize">
                        {modeData.mode}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-400">Busy:</span>
                      <span
                        className={
                          modeData.is_busy
                            ? "text-yellow-400"
                            : "text-green-400"
                        }
                      >
                        {modeData.is_busy ? "Yes" : "No"}
                      </span>
                    </div>
                    {modeData.active_job_id && (
                      <div className="flex justify-between">
                        <span className="text-neutral-400">Active Job:</span>
                        <span className="text-white text-xs">
                          {modeData.active_job_id}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-neutral-400">Loaded Models:</span>
                      <span className="text-white">
                        {modeData.loaded_models?.join(", ") || "None"}
                      </span>
                    </div>
                  </div>

                  <div className="border-t border-neutral-700 pt-4">
                    <h5 className="text-xs font-medium text-neutral-500 uppercase mb-3">
                      Switch Mode
                    </h5>
                    <div className="flex gap-3">
                      <Button
                        onClick={() => handleSwitchMode("image")}
                        disabled={
                          modeSwitching ||
                          modeData.mode === "image" ||
                          modeData.is_busy
                        }
                        className={
                          modeData.mode === "image"
                            ? "bg-purple-600"
                            : "bg-neutral-700 hover:bg-neutral-600"
                        }
                        size="sm"
                      >
                        {modeSwitching ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : (
                          <Image className="w-4 h-4 mr-2" />
                        )}
                        Image Mode
                      </Button>
                      <Button
                        onClick={() => handleSwitchMode("video")}
                        disabled={
                          modeSwitching ||
                          modeData.mode === "video" ||
                          modeData.is_busy
                        }
                        className={
                          modeData.mode === "video"
                            ? "bg-teal-600"
                            : "bg-neutral-700 hover:bg-neutral-600"
                        }
                        size="sm"
                      >
                        {modeSwitching ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : (
                          <Video className="w-4 h-4 mr-2" />
                        )}
                        Video Mode
                      </Button>
                    </div>
                    <p className="text-xs text-neutral-500 mt-2">
                      Switching modes takes ~30-60 seconds as models are
                      loaded/unloaded.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Image Generation Tab */}
          {activeTab === "image" && (
            <div className="space-y-6">
              <div>
                <label className="text-sm font-medium text-neutral-400 mb-2 block">
                  Prompt{" "}
                  <span className="text-neutral-600">
                    (required, max 2000 chars)
                  </span>
                </label>
                <Textarea
                  value={imagePrompt}
                  onChange={(e) => setImagePrompt(e.target.value)}
                  placeholder="Describe the image to generate..."
                  className="min-h-[100px] bg-neutral-900 border-neutral-700 text-neutral-200"
                  disabled={imageStatus === "loading"}
                  maxLength={2000}
                />
                <p className="text-xs text-neutral-500 mt-1">
                  {imagePrompt.length}/2000
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-neutral-400 mb-2 block">
                  Aspect Ratio
                </label>
                {renderAspectRatioSelector(
                  imageAspectRatio,
                  setImageAspectRatio,
                  imageStatus === "loading",
                  "purple"
                )}
              </div>

              <div>
                <label className="text-sm font-medium text-neutral-400 mb-2 block">
                  Inference Steps{" "}
                  <span className="text-neutral-600">
                    ({imageInferenceSteps})
                  </span>
                </label>
                <Slider
                  value={[imageInferenceSteps]}
                  onValueChange={([v]) => setImageInferenceSteps(v)}
                  min={1}
                  max={50}
                  step={1}
                  disabled={imageStatus === "loading"}
                  className="w-full"
                />
                <p className="text-xs text-neutral-500 mt-1">
                  Higher = better quality but slower (default: 20)
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-neutral-400 mb-2 block">
                  Seed{" "}
                  <span className="text-neutral-600">
                    (optional, for reproducibility)
                  </span>
                </label>
                <Input
                  type="number"
                  value={imageSeed}
                  onChange={(e) => setImageSeed(e.target.value)}
                  placeholder="Leave empty for random"
                  className="bg-neutral-900 border-neutral-700 text-neutral-200"
                  disabled={imageStatus === "loading"}
                />
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={handleTestImageCreation}
                  disabled={!imagePrompt.trim() || imageStatus === "loading"}
                  className="flex-1 bg-purple-600 hover:bg-purple-700"
                >
                  {imageStatus === "loading" ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      Generate Image
                    </>
                  )}
                </Button>
                {imageStatus !== "idle" && imageStatus !== "loading" && (
                  <Button
                    variant="outline"
                    onClick={() => handleReset("image")}
                    className="border-neutral-700"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </Button>
                )}
              </div>

              {renderResult(imageResult, imageDebugExpanded, () =>
                setImageDebugExpanded(!imageDebugExpanded)
              )}
            </div>
          )}

          {/* Image Edit Tab */}
          {activeTab === "image-edit" && (
            <div className="space-y-6">
              <div>
                <label className="text-sm font-medium text-neutral-400 mb-2 block">
                  Source Image URL{" "}
                  <span className="text-neutral-600">
                    (optional - uses placeholder if empty)
                  </span>
                </label>
                <Input
                  value={editSourceUrl}
                  onChange={(e) => setEditSourceUrl(e.target.value)}
                  placeholder="https://... (leave empty for placeholder)"
                  className="bg-neutral-900 border-neutral-700 text-neutral-200"
                  disabled={editStatus === "loading"}
                />
                <p className="text-xs text-neutral-500 mt-1">
                  Will use picsum.photos placeholder if not provided
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-neutral-400 mb-2 block">
                  Edit Prompt{" "}
                  <span className="text-neutral-600">
                    (required, max 2000 chars)
                  </span>
                </label>
                <Textarea
                  value={editPrompt}
                  onChange={(e) => setEditPrompt(e.target.value)}
                  placeholder="Describe how to edit the image..."
                  className="min-h-[100px] bg-neutral-900 border-neutral-700 text-neutral-200"
                  disabled={editStatus === "loading"}
                  maxLength={2000}
                />
                <p className="text-xs text-neutral-500 mt-1">
                  {editPrompt.length}/2000
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-neutral-400 mb-2 block">
                  Aspect Ratio
                </label>
                {renderAspectRatioSelector(
                  editAspectRatio,
                  setEditAspectRatio,
                  editStatus === "loading",
                  "amber"
                )}
              </div>

              <div>
                <label className="text-sm font-medium text-neutral-400 mb-2 block">
                  Seed <span className="text-neutral-600">(optional)</span>
                </label>
                <Input
                  type="number"
                  value={editSeed}
                  onChange={(e) => setEditSeed(e.target.value)}
                  placeholder="Leave empty for random"
                  className="bg-neutral-900 border-neutral-700 text-neutral-200"
                  disabled={editStatus === "loading"}
                />
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={handleTestImageEdit}
                  disabled={!editPrompt.trim() || editStatus === "loading"}
                  className="flex-1 bg-amber-600 hover:bg-amber-700"
                >
                  {editStatus === "loading" ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Editing...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      Edit Image
                    </>
                  )}
                </Button>
                {editStatus !== "idle" && editStatus !== "loading" && (
                  <Button
                    variant="outline"
                    onClick={() => handleReset("image-edit")}
                    className="border-neutral-700"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </Button>
                )}
              </div>

              {renderResult(editResult, editDebugExpanded, () =>
                setEditDebugExpanded(!editDebugExpanded)
              )}
            </div>
          )}

          {/* Video Generation Tab */}
          {activeTab === "video" && (
            <div className="space-y-6">
              <div>
                <label className="text-sm font-medium text-neutral-400 mb-2 block">
                  Start Frame URL{" "}
                  <span className="text-neutral-600">
                    (optional - uses placeholder if empty)
                  </span>
                </label>
                <Input
                  value={videoStartFrameUrl}
                  onChange={(e) => setVideoStartFrameUrl(e.target.value)}
                  placeholder="https://... (leave empty for placeholder)"
                  className="bg-neutral-900 border-neutral-700 text-neutral-200"
                  disabled={videoStatus === "loading"}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-neutral-400 mb-2 block">
                  Motion Prompt{" "}
                  <span className="text-neutral-600">
                    (required, max 2000 chars)
                  </span>
                </label>
                <Textarea
                  value={videoPrompt}
                  onChange={(e) => setVideoPrompt(e.target.value)}
                  placeholder="Describe the motion/camera movement..."
                  className="min-h-[100px] bg-neutral-900 border-neutral-700 text-neutral-200"
                  disabled={videoStatus === "loading"}
                  maxLength={2000}
                />
                <p className="text-xs text-neutral-500 mt-1">
                  {videoPrompt.length}/2000
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-neutral-400 mb-2 block">
                    Duration{" "}
                    <span className="text-neutral-600">(1-8 seconds)</span>
                  </label>
                  <div className="flex gap-2">
                    {[2, 3, 4, 5, 6, 8].map((dur) => (
                      <Button
                        key={dur}
                        variant={videoDuration === dur ? "default" : "outline"}
                        size="sm"
                        onClick={() => setVideoDuration(dur)}
                        disabled={videoStatus === "loading"}
                        className={
                          videoDuration === dur
                            ? "bg-teal-600"
                            : "border-neutral-700"
                        }
                      >
                        {dur}s
                      </Button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-neutral-400 mb-2 block">
                    FPS
                  </label>
                  <div className="flex gap-2">
                    {([8, 12, 16, 24, 30] as FPS[]).map((f) => (
                      <Button
                        key={f}
                        variant={videoFps === f ? "default" : "outline"}
                        size="sm"
                        onClick={() => setVideoFps(f)}
                        disabled={videoStatus === "loading"}
                        className={
                          videoFps === f ? "bg-teal-600" : "border-neutral-700"
                        }
                      >
                        {f}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-neutral-400 mb-2 block">
                  Aspect Ratio
                </label>
                {renderAspectRatioSelector(
                  videoAspectRatio,
                  setVideoAspectRatio,
                  videoStatus === "loading",
                  "teal"
                )}
              </div>

              <div>
                <label className="text-sm font-medium text-neutral-400 mb-2 block">
                  End Frame URL{" "}
                  <span className="text-neutral-600">
                    (optional, for interpolation)
                  </span>
                </label>
                <Input
                  value={videoEndFrameUrl}
                  onChange={(e) => setVideoEndFrameUrl(e.target.value)}
                  placeholder="https://..."
                  className="bg-neutral-900 border-neutral-700 text-neutral-200"
                  disabled={videoStatus === "loading"}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-neutral-400 mb-2 block">
                  Seed <span className="text-neutral-600">(optional)</span>
                </label>
                <Input
                  type="number"
                  value={videoSeed}
                  onChange={(e) => setVideoSeed(e.target.value)}
                  placeholder="Leave empty for random"
                  className="bg-neutral-900 border-neutral-700 text-neutral-200"
                  disabled={videoStatus === "loading"}
                />
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={handleTestVideoCreation}
                  disabled={!videoPrompt.trim() || videoStatus === "loading"}
                  className="flex-1 bg-teal-600 hover:bg-teal-700"
                >
                  {videoStatus === "loading" ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      Generate Video
                    </>
                  )}
                </Button>
                {videoStatus !== "idle" && videoStatus !== "loading" && (
                  <Button
                    variant="outline"
                    onClick={() => handleReset("video")}
                    className="border-neutral-700"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </Button>
                )}
              </div>

              {renderResult(videoResult, videoDebugExpanded, () =>
                setVideoDebugExpanded(!videoDebugExpanded)
              )}
            </div>
          )}

          {/* Info Note */}
          <div className="mt-8 p-4 bg-neutral-900/50 border border-neutral-800 rounded-lg">
            <p className="text-xs text-neutral-500">
              <strong className="text-neutral-400">Note:</strong>{" "}
              {apiMode === "mock" ? (
                <>
                  Mock mode uses Inngest workflows for async testing. Results
                  are polled from the database.
                </>
              ) : (
                <>
                  Real API mode calls the GPU API directly at{" "}
                  <code className="text-orange-400">localhost:8000</code>.
                  Ensure the GPU API server is running.
                </>
              )}{" "}
              <code className="text-orange-400">GPU_API_KEY</code> must be
              configured. Results are saved to Cloudflare R2.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
