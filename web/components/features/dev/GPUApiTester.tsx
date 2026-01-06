"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
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
type TabType = "image" | "image-edit" | "video";
type AspectRatio = "16:9" | "9:16" | "1:1" | "4:3" | "3:4";
type FPS = 8 | 12 | 16 | 24 | 30;

// ============================================================================
// COMPONENT
// ============================================================================

export function GPUApiTester({ isOpen, onClose }: GPUApiTesterProps) {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("image");

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
    <div className="fixed inset-0 z-[9999] bg-neutral-950 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
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
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="text-neutral-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 px-6 py-3 border-b border-neutral-800">
        <Button
          variant={activeTab === "image" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("image")}
          className={
            activeTab === "image" ? "bg-purple-600 hover:bg-purple-700" : ""
          }
        >
          <Image className="w-4 h-4 mr-2" />
          Image Generation
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
          Image Edit
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
          Video Generation
          {videoStatus !== "idle" && (
            <span className="ml-2">{renderStatusBadge(videoStatus)}</span>
          )}
        </Button>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="max-w-2xl mx-auto p-6">
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
              <strong className="text-neutral-400">Note:</strong> This tester
              connects to the GPU API at{" "}
              <code className="text-orange-400">localhost:8000</code>. Ensure
              your GPU API server is running and{" "}
              <code className="text-orange-400">GPU_API_KEY</code> is
              configured. Results are saved to Cloudflare R2 under{" "}
              <code className="text-orange-400">gpu-api-test/</code>.
            </p>
          </div>
        </div>
      </ScrollArea>
    </div>
  );

  return createPortal(content, document.body);
}
