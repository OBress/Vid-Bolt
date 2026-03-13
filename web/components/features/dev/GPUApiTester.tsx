"use client";

import { useState, useEffect, useRef } from "react";
import { useDevToolsMediaStore } from "@/lib/stores/devtools-media-store"; // [DEVTOOLS-MEDIA] - Remove when no longer needed
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

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
  Wand2,
  RefreshCw,
  Upload,
  Plus,
  List,
  Layers,
  Trash2,
  Clock,
  ArrowLeft,
  Music,
  Volume2,
} from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

interface GPUApiTesterProps {
  isOpen: boolean;
  onClose: () => void;
  inline?: boolean;
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
  audioUrl?: string;
  error?: string;
  errorCode?: string;
  generationTime?: number;
  r2Key?: string;
  inputImageUrl?: string;
  durationSeconds?: number;
  fps?: number;
  debug?: DebugInfo;
  finalJob?: any;
}

type TestStatus = "idle" | "loading" | "success" | "error";
type TabType = "system" | "mode" | "image" | "image-edit" | "video" | "music" | "sfx" | "loras";
type AspectRatio = "16:9" | "9:16";
type FPS = 8 | 12 | 16 | 24 | 30;
type ApiMode = "mock" | "real";
type VramMode =
  | "image_generation"
  | "image_editing"
  | "video_generation"
  | "audio_creation"
  | "all";

// Job tracking types for queue panel
type JobType = "image" | "image-edit" | "video" | "ltx2" | "ltx2-interpolate" | "music" | "sfx";
type QueueFilter =
  | "all"
  | "queued"
  | "pending"
  | "processing"
  | "completed"
  | "failed";

interface TrackedJob {
  id: string;
  taskId?: string; // Optional - only set after submitted to API
  batchId?: string; // Optional - set when submitted as part of a batch
  batchItemIndex?: number; // Optional - index within the batch
  type: JobType;
  status: "queued" | "pending" | "processing" | "completed" | "failed";
  queuePosition?: number;
  progressPercent?: number;
  progressStage?: string;
  result?: TestResult | null;
  createdAt: Date;
  params: {
    prompt: string;
    [key: string]: any;
  };
}

// Batch tracking for GPU API batch operations
interface TrackedBatch {
  id: string;
  type: JobType;
  status: "pending" | "processing" | "completed" | "failed";
  totalItems: number;
  completedItems: number;
  failedItems: number;
  jobIds: string[]; // Local job IDs in this batch
  itemUrls: Array<{ index: number; publicUrl: string; key: string }>;
  createdAt: Date;
}

// LoRA types
interface LoraInfo {
  name: string;
  size_bytes: number;
  modified_time: number;
}

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
    active_job_id: string | null;
    loaded_models: string[];
  } | null;
  mock_mode: boolean;
}

interface ModeData {
  mode: string;
  is_busy: boolean;
  active_job_id: string | null;
  loaded_models: string[];
  // Mode switching fields
  is_switching?: boolean;
  switching_target?: string | null;
  switching_step?: string | null;
  switching_progress?: number | null;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function GPUApiTester({
  isOpen,
  onClose,
  inline = false,
}: GPUApiTesterProps) {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("system");
  const [apiMode, setApiMode] = useState<ApiMode>("real");
  const [vramMode, setVramMode] = useState<VramMode | null>(null);

  // System/Mode State
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [readinessData, setReadinessData] = useState<ReadinessData | null>(
    null,
  );
  const [systemData, setSystemData] = useState<SystemData | null>(null);
  const [modeData, setModeData] = useState<ModeData | null>(null);
  const [systemStatus, setSystemStatus] = useState<TestStatus>("idle");
  const [modeStatus, setModeStatus] = useState<TestStatus>("idle");
  const [modeSwitching, setModeSwitching] = useState(false);

  // LoRA State
  const [loraList, setLoraList] = useState<LoraInfo[]>([]);
  const [loraStatus, setLoraStatus] = useState<TestStatus>("idle");
  const [loraDeleting, setLoraDeleting] = useState<string | null>(null);
  const [loraUploading, setLoraUploading] = useState(false);

  // Image Creation State
  const [imagePrompt, setImagePrompt] = useState(
    "A beautiful sunset over mountains with golden light",
  );
  const [imageAspectRatio, setImageAspectRatio] = useState<AspectRatio>("16:9");
  const [imageInferenceSteps, setImageInferenceSteps] = useState(8);
  const [imageWidth, setImageWidth] = useState<string>("");
  const [imageHeight, setImageHeight] = useState<string>("");
  const [imageSeed, setImageSeed] = useState<string>("");
  const [imageStatus, setImageStatus] = useState<TestStatus>("idle");
  const [imageResult, setImageResult] = useState<TestResult | null>(null);
  const [imageLora, setImageLora] = useState<string>("");
  const [imageDebugExpanded, setImageDebugExpanded] = useState(false);

  // Image Edit State
  const [editPrompt, setEditPrompt] = useState(
    "Change the sky to nighttime with stars",
  );
  const [editSourceUrl, setEditSourceUrl] = useState("");
  const [editMaskUrl, setEditMaskUrl] = useState("");
  const [editAspectRatio, setEditAspectRatio] = useState<AspectRatio>("16:9");
  const [editSeed, setEditSeed] = useState<string>("");
  const [editLoraName, setEditLoraName] = useState<string>("");
  const [editLoraStrength, setEditLoraStrength] = useState<number>(0.9);
  const [editStatus, setEditStatus] = useState<TestStatus>("idle");
  const [editResult, setEditResult] = useState<TestResult | null>(null);
  const [editDebugExpanded, setEditDebugExpanded] = useState(false);

  // Video Creation State
  const [videoPrompt, setVideoPrompt] = useState(
    "Camera slowly zooms in, subtle movement",
  );
  const [videoStartFrameUrl, setVideoStartFrameUrl] = useState("");
  const [videoDuration, setVideoDuration] = useState(4);
  const [videoFps, setVideoFps] = useState<FPS>(24);
  const [videoAspectRatio, setVideoAspectRatio] = useState<AspectRatio>("16:9");
  const [videoWidth, setVideoWidth] = useState<string>("");
  const [videoHeight, setVideoHeight] = useState<string>("");
  const [videoEndFrameUrl, setVideoEndFrameUrl] = useState("");
  const [videoSeed, setVideoSeed] = useState<string>("");
  const [videoStatus, setVideoStatus] = useState<TestStatus>("idle");
  const [videoResult, setVideoResult] = useState<TestResult | null>(null);
  const [videoDebugExpanded, setVideoDebugExpanded] = useState(false);

  // Music Generation State
  const [musicPrompt, setMusicPrompt] = useState(
    "Upbeat electronic music with synth melodies",
  );
  const [musicLyrics, setMusicLyrics] = useState("");
  const [musicDuration, setMusicDuration] = useState(30);
  const [musicSeed, setMusicSeed] = useState<string>("");
  const [musicStatus, setMusicStatus] = useState<TestStatus>("idle");
  const [musicResult, setMusicResult] = useState<TestResult | null>(null);
  const [musicDebugExpanded, setMusicDebugExpanded] = useState(false);

  // Sound Effect Generation State
  const [sfxPrompt, setSfxPrompt] = useState(
    "Thunder rumbling in the distance",
  );
  const [sfxDuration, setSfxDuration] = useState(5);
  const [sfxSeed, setSfxSeed] = useState<string>("");
  const [sfxStatus, setSfxStatus] = useState<TestStatus>("idle");
  const [sfxResult, setSfxResult] = useState<TestResult | null>(null);
  const [sfxDebugExpanded, setSfxDebugExpanded] = useState(false);

  // Prompt Enhancement State
  const [imageEnhancing, setImageEnhancing] = useState(false);
  const [editEnhancing, setEditEnhancing] = useState(false);
  const [videoEnhancing, setVideoEnhancing] = useState(false);

  // QUEUE & BATCH STATE
  // =========================================================================
  const [trackedJobs, setTrackedJobs] = useState<Map<string, TrackedJob>>(
    new Map(),
  );
  const [_trackedBatches, setTrackedBatches] = useState<
    Map<string, TrackedBatch>
  >(new Map());
  const [queuePanelOpen, setQueuePanelOpen] = useState(false);
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("all");
  const [batchQueueOpen, setBatchQueueOpen] = useState(false);
  const [batchCount, setBatchCount] = useState(5);
  const [batchVarySeeds, setBatchVarySeeds] = useState(true);
  const [batchJobType, setBatchJobType] = useState<JobType>("image");
  const [_batchSubmitting, setBatchSubmitting] = useState(false);
  const [isManualPolling, setIsManualPolling] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  // Clear storage state
  const [clearingStorage, setClearingStorage] = useState(false);

  // Ref to always have latest trackedJobs for polling
  const trackedJobsRef = useRef<Map<string, TrackedJob>>(trackedJobs);
  useEffect(() => {
    trackedJobsRef.current = trackedJobs;
  }, [trackedJobs]);

  // ====================================================================
  // [DEVTOOLS-MEDIA] START - Real-time sync to DevTools media store.
  // Remove this entire block and the import above when no longer needed.
  // ====================================================================
  const addDevToolsMedia = useDevToolsMediaStore((s) => s.addMedia);
  const syncedUrlsRef = useRef<Set<string>>(new Set());

  const syncUrlToStore = (url: string, type: 'image' | 'video' | 'audio', name: string) => {
    if (!url || syncedUrlsRef.current.has(url)) return;
    syncedUrlsRef.current.add(url);
    addDevToolsMedia({ type, url, name });
  };

  // Sync queue/batch jobs
  useEffect(() => {
    for (const job of trackedJobs.values()) {
      if (job.status !== 'completed' || !job.result?.success) continue;

      const url = job.result.imageUrl || job.result.videoUrl || job.result.audioUrl;
      if (!url) continue;

      const mediaType: 'image' | 'video' | 'audio' = job.result.imageUrl
        ? 'image'
        : job.result.videoUrl
          ? 'video'
          : 'audio';

      syncUrlToStore(url, mediaType, `${job.type}-${job.id.slice(0, 8)}`);
    }
  }, [trackedJobs]);

  // Sync individual test results (direct "Generate" buttons)
  useEffect(() => {
    if (imageResult?.success && imageResult.imageUrl)
      syncUrlToStore(imageResult.imageUrl, 'image', `image-test`);
  }, [imageResult]);

  useEffect(() => {
    if (editResult?.success && editResult.imageUrl)
      syncUrlToStore(editResult.imageUrl, 'image', `image-edit-test`);
  }, [editResult]);

  useEffect(() => {
    if (videoResult?.success && videoResult.videoUrl)
      syncUrlToStore(videoResult.videoUrl, 'video', `video-test`);
  }, [videoResult]);

  useEffect(() => {
    if (musicResult?.success && musicResult.audioUrl)
      syncUrlToStore(musicResult.audioUrl, 'audio', `music-test`);
  }, [musicResult]);

  useEffect(() => {
    if (sfxResult?.success && sfxResult.audioUrl)
      syncUrlToStore(sfxResult.audioUrl, 'audio', `sfx-test`);
  }, [sfxResult]);
  // [DEVTOOLS-MEDIA] END

  // Mount effect for portal
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Fetch initial data on tab switch
  useEffect(() => {
    if (activeTab === "loras" || activeTab === "image") {
      handleListLoras();
    }
    if (activeTab === "system") {
      handleCheckHealth();
      handleGetVramMode();
    }
    if (activeTab === "mode") {
      handleGetMode();
      handleGetVramMode();
    }
  }, [activeTab]);

  // Auto-poll mode status when switching is in progress
  useEffect(() => {
    if (!modeData?.is_switching) return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch("/api/gpu-api/mode");
        const data = await response.json();
        if (data.success) {
          setModeData(data.data);
          // Stop polling when switching is complete
          if (!data.data.is_switching) {
            setModeStatus("success");
          }
        }
      } catch {
        // Ignore errors during polling
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [modeData?.is_switching]);

  // =========================================================================
  // POLLING HELPER
  // =========================================================================

  const pollForResult = async (
    taskId: string,
    onUpdate?: (output: TestResult) => void,
  ): Promise<TestResult> => {
    const maxAttempts = 120;
    let attempts = 0;

    while (attempts < maxAttempts) {
      const response = await fetch(`/api/gpu-api/test/status?taskId=${taskId}`);
      const data = await response.json();

      if (data.output && onUpdate) {
        onUpdate(data.output as TestResult);
      }

      if (data.status === "completed" || data.status === "failed") {
        return data.output as TestResult;
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
      attempts++;
    }

    throw new Error("Timeout waiting for result");
  };

  // =========================================================================
  // QUEUE HELPERS & COMPUTED VALUES
  // =========================================================================

  // Computed values for queue stats
  const filteredJobs = Array.from(trackedJobs.values()).filter((job) => {
    if (queueFilter === "all") return true;
    return job.status === queueFilter;
  });

  const queuedJobCount = Array.from(trackedJobs.values()).filter(
    (j) => j.status === "queued",
  ).length;
  const pendingJobCount = Array.from(trackedJobs.values()).filter(
    (j) => j.status === "pending",
  ).length;
  const processingJobCount = Array.from(trackedJobs.values()).filter(
    (j) => j.status === "processing",
  ).length;
  const activeJobCount = queuedJobCount + pendingJobCount + processingJobCount;

  // Background polling for active batches (only when panel is open)
  // Optimized: polls batch status instead of individual jobs
  useEffect(() => {
    const pollBatches = async () => {
      // Skip polling if panel is closed
      if (!queuePanelOpen) return;

      const currentJobs = trackedJobsRef.current;

      // Get unique batch IDs for jobs that are pending/processing
      const activeBatchIds = new Set<string>();
      for (const job of currentJobs.values()) {
        if (
          (job.status === "pending" || job.status === "processing") &&
          job.batchId
        ) {
          activeBatchIds.add(job.batchId);
        }
      }

      if (activeBatchIds.size === 0) {
        // Also check for legacy individual jobs (non-batch)
        const legacyJobs = Array.from(currentJobs.values()).filter(
          (job) =>
            (job.status === "pending" || job.status === "processing") &&
            job.taskId &&
            !job.batchId,
        );

        if (legacyJobs.length === 0) return;

        // Handle legacy polling for non-batch jobs
        const jobsBatch = legacyJobs.slice(0, 10);
        const results = await Promise.allSettled(
          jobsBatch.map(async (job) => {
            const response = await fetch(
              `/api/gpu-api/test/status?taskId=${job.taskId}`,
            );
            return { job, data: await response.json() };
          }),
        );

        for (const result of results) {
          if (result.status !== "fulfilled") continue;
          const { job, data } = result.value;

          setTrackedJobs((prev) => {
            const newMap = new Map(prev);
            const existingJob = newMap.get(job.id);
            if (!existingJob) return prev;

            const updatedJob = { ...existingJob };

            if (data.status === "completed") {
              updatedJob.status = "completed";
              updatedJob.progressPercent = 100;
              if (data.output) {
                updatedJob.result = {
                  success: data.output.success,
                  type: job.type,
                  imageUrl: data.output.imageUrl,
                  videoUrl: data.output.videoUrl,
                  generationTime: data.output.generationTime,
                  finalJob: data.output.finalJob,
                };
              }
            } else if (data.status === "failed") {
              updatedJob.status = "failed";
              updatedJob.result = {
                success: false,
                type: job.type,
                error: data.output?.errorMessage || "Job failed",
              };
            } else if (data.status === "running") {
              if (data.output?.finalJob) {
                const finalJob = data.output.finalJob;
                if (finalJob.status === "processing") {
                  updatedJob.status = "processing";
                  updatedJob.progressPercent = finalJob.progress_percent || 0;
                  updatedJob.progressStage = finalJob.progress_stage;
                } else if (finalJob.status === "completed") {
                  updatedJob.status = "completed";
                  updatedJob.progressPercent = 100;
                  updatedJob.result = {
                    success: data.output.success ?? true,
                    type: job.type,
                    imageUrl: data.output.imageUrl,
                    videoUrl: data.output.videoUrl,
                    generationTime: data.output.generationTime,
                    finalJob: data.output.finalJob,
                  };
                } else if (finalJob.status === "failed") {
                  updatedJob.status = "failed";
                  updatedJob.result = {
                    success: false,
                    type: job.type,
                    error: finalJob.error_message || "Job failed",
                  };
                }
              }
            }

            newMap.set(job.id, updatedJob);
            return newMap;
          });
        }
        return;
      }

      // Poll each active batch
      for (const batchId of activeBatchIds) {
        try {
          const response = await fetch(
            `/api/gpu-api/test/batch/status?batchId=${batchId}`,
          );
          const data = await response.json();

          if (!data.success || !data.batch) continue;

          const batchStatus = data.batch;

          // Update tracked batch
          setTrackedBatches((prev) => {
            const newMap = new Map(prev);
            const existing = newMap.get(batchId);
            if (existing) {
              newMap.set(batchId, {
                ...existing,
                status: batchStatus.status,
                completedItems: batchStatus.completedItems,
                failedItems: batchStatus.failedItems,
              });
            }
            return newMap;
          });

          // Update individual jobs from batch items
          // Debug: log what we received
          console.log(`[GPUApiTester] Received batch status:`, {
            batchId,
            status: batchStatus.status,
            completedItems: batchStatus.completedItems,
            items: batchStatus.items?.map(
              (i: { taskId: string; status: string; itemIndex: number }) => ({
                taskId: i.taskId,
                status: i.status,
                itemIndex: i.itemIndex,
              }),
            ),
          });

          setTrackedJobs((prev) => {
            const newMap = new Map(prev);

            // Debug: log current jobs for this batch
            const batchJobs = Array.from(newMap.values()).filter(
              (j) => j.batchId === batchId,
            );
            console.log(
              `[GPUApiTester] Current tracked jobs for batch:`,
              batchJobs.map((j) => ({
                id: j.id,
                batchItemIndex: j.batchItemIndex,
                status: j.status,
              })),
            );

            for (const item of batchStatus.items) {
              // Find the job with this batchId and item index
              for (const [jobId, job] of newMap) {
                if (
                  job.batchId === batchId &&
                  job.batchItemIndex === item.itemIndex
                ) {
                  const updatedJob = { ...job };

                  if (item.status === "completed") {
                    updatedJob.status = "completed";
                    updatedJob.progressPercent = 100;
                    updatedJob.result = {
                      success: true,
                      type: job.type,
                      imageUrl:
                        job.type === "image" || job.type === "image-edit"
                          ? item.result?.imageUrl || item.result?.save_url
                          : undefined,
                      videoUrl:
                        job.type === "video" || job.type === "ltx2"
                          ? item.result?.videoUrl || item.result?.save_url
                          : undefined,
                      generationTime:
                        item.result?.generationTime ||
                        item.result?.generation_time,
                    };
                  } else if (item.status === "failed") {
                    updatedJob.status = "failed";
                    updatedJob.result = {
                      success: false,
                      type: job.type,
                      error:
                        item.result?.error ||
                        item.error_message ||
                        "Job failed",
                    };
                  } else if (
                    item.status === "running" ||
                    item.status === "processing"
                  ) {
                    updatedJob.status = "processing";
                  } else if (item.status === "pending") {
                    updatedJob.status = "pending";
                  }

                  newMap.set(jobId, updatedJob);
                  break;
                }
              }
            }

            return newMap;
          });
        } catch (error) {
          console.error(
            `[GPUApiTester] Error polling batch ${batchId}:`,
            error,
          );
        }
      }
    };

    const interval = setInterval(pollBatches, 10000); // Poll every 10 seconds
    return () => clearInterval(interval);
  }, [queuePanelOpen]);

  // Get params for current tab
  const getCurrentParams = (type: JobType) => {
    switch (type) {
      case "image":
        return {
          prompt: imagePrompt,
          aspectRatio: imageAspectRatio,
          numInferenceSteps: imageInferenceSteps,
          seed: imageSeed ? parseInt(imageSeed) : undefined,
          lora: imageLora || undefined,
          width: imageWidth ? parseInt(imageWidth) : undefined,
          height: imageHeight ? parseInt(imageHeight) : undefined,
        };
      case "image-edit":
        return {
          prompt: editPrompt,
          sourceImageUrl: editSourceUrl || undefined,
          maskImageUrl: editMaskUrl || undefined,
          aspectRatio: editAspectRatio,
          seed: editSeed ? parseInt(editSeed) : undefined,
        };
      case "video":
        return {
          prompt: videoPrompt,
          startFrameUrl: videoStartFrameUrl || undefined,
          durationSeconds: videoDuration,
          fps: videoFps,
          aspectRatio: videoAspectRatio,
          width: videoWidth ? parseInt(videoWidth) : undefined,
          height: videoHeight ? parseInt(videoHeight) : undefined,
          endFrameUrl: videoEndFrameUrl || undefined,
          seed: videoSeed ? parseInt(videoSeed) : undefined,
        };
      default:
        return { prompt: "" };
    }
  };

  // Add a job to LOCAL queue (no API call yet)
  const handleQueueJob = (type: JobType) => {
    const params = getCurrentParams(type);
    const jobId = crypto.randomUUID();
    const newJob: TrackedJob = {
      id: jobId,
      type,
      status: "queued", // LOCAL only - not submitted to API yet
      createdAt: new Date(),
      params,
    };
    setTrackedJobs((prev) => new Map(prev).set(jobId, newJob));
  };

  // Submit a single job to the API (internal helper)
  const _submitJobToApi = async (job: TrackedJob) => {
    const endpoint =
      job.type === "image"
        ? "/api/gpu-api/test/image"
        : job.type === "image-edit"
          ? "/api/gpu-api/test/image-edit"
          : "/api/gpu-api/test/video";

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(job.params),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to submit job");

      // Update job with taskId and pending status
      setTrackedJobs((prev) => {
        const newMap = new Map(prev);
        const existing = newMap.get(job.id);
        if (existing) {
          newMap.set(job.id, {
            ...existing,
            taskId: data.taskId,
            status: "pending",
          });
        }
        return newMap;
      });
    } catch (e) {
      // Mark as failed
      setTrackedJobs((prev) => {
        const newMap = new Map(prev);
        const existing = newMap.get(job.id);
        if (existing) {
          newMap.set(job.id, {
            ...existing,
            status: "failed",
            result: { success: false, type: job.type, error: String(e) },
          });
        }
        return newMap;
      });
    }
  };

  // Send ALL queued jobs to API using batch submission
  const handleSendAllQueued = async () => {
    const queuedJobs = Array.from(trackedJobs.values()).filter(
      (j) => j.status === "queued",
    );

    if (queuedJobs.length === 0) return;

    setBatchSubmitting(true);

    try {
      // Group jobs by type
      const jobsByType = new Map<JobType, TrackedJob[]>();
      for (const job of queuedJobs) {
        const existing = jobsByType.get(job.type) || [];
        existing.push(job);
        jobsByType.set(job.type, existing);
      }

      // Submit each type as a separate batch
      for (const [type, jobs] of jobsByType) {
        // Map JobType to batch API type
        const batchType = type === "image-edit" ? "image-edit" : type;

        // Prepare items for batch submission
        const items = jobs.map((job) => job.params);

        try {
          const response = await fetch("/api/gpu-api/test/batch/submit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: batchType, items }),
          });

          const data = await response.json();

          if (!response.ok || !data.success) {
            // Mark all jobs in this batch as failed
            setTrackedJobs((prev) => {
              const newMap = new Map(prev);
              for (const job of jobs) {
                const existing = newMap.get(job.id);
                if (existing) {
                  newMap.set(job.id, {
                    ...existing,
                    status: "failed",
                    result: {
                      success: false,
                      type: job.type,
                      error: data.error || "Batch submission failed",
                    },
                  });
                }
              }
              return newMap;
            });
            continue;
          }

          const { batchId, itemUrls } = data;

          // Create tracked batch
          setTrackedBatches((prev) => {
            const newMap = new Map(prev);
            newMap.set(batchId, {
              id: batchId,
              type,
              status: "pending",
              totalItems: jobs.length,
              completedItems: 0,
              failedItems: 0,
              jobIds: jobs.map((j) => j.id),
              itemUrls: itemUrls || [],
              createdAt: new Date(),
            });
            return newMap;
          });

          // Update each job with batch ID and pending status
          setTrackedJobs((prev) => {
            const newMap = new Map(prev);
            jobs.forEach((job, index) => {
              const existing = newMap.get(job.id);
              if (existing) {
                // Find the public URL for this item
                const itemUrl = itemUrls?.find(
                  (u: { index: number }) => u.index === index,
                );
                newMap.set(job.id, {
                  ...existing,
                  batchId,
                  batchItemIndex: index,
                  status: "pending",
                  result: itemUrl
                    ? {
                        success: false,
                        type: job.type,
                        // Pre-populate URL (will be available once completed)
                        imageUrl:
                          type === "image" || type === "image-edit"
                            ? itemUrl.publicUrl
                            : undefined,
                        videoUrl:
                          type === "video" || type === "ltx2"
                            ? itemUrl.publicUrl
                            : undefined,
                      }
                    : null,
                });
              }
            });
            return newMap;
          });

          console.log(
            `[GPUApiTester] Submitted batch ${batchId} with ${jobs.length} ${type} jobs`,
          );
        } catch (error) {
          console.error(
            `[GPUApiTester] Failed to submit ${type} batch:`,
            error,
          );
          // Mark jobs as failed
          setTrackedJobs((prev) => {
            const newMap = new Map(prev);
            for (const job of jobs) {
              const existing = newMap.get(job.id);
              if (existing) {
                newMap.set(job.id, {
                  ...existing,
                  status: "failed",
                  result: {
                    success: false,
                    type: job.type,
                    error:
                      error instanceof Error ? error.message : "Network error",
                  },
                });
              }
            }
            return newMap;
          });
        }
      }
    } finally {
      setBatchSubmitting(false);
    }
  };

  // Batch queue multiple jobs locally (no API call)
  const handleBatchQueue = () => {
    for (let i = 0; i < batchCount; i++) {
      const params = getCurrentParams(batchJobType);
      // Vary seeds if enabled
      if (batchVarySeeds && params.seed !== undefined) {
        delete params.seed;
      }

      const jobId = crypto.randomUUID();
      const newJob: TrackedJob = {
        id: jobId,
        type: batchJobType,
        status: "queued",
        createdAt: new Date(),
        params,
      };
      setTrackedJobs((prev) => new Map(prev).set(jobId, newJob));
    }
    setBatchQueueOpen(false);
  };

  // Clear jobs from queue
  const handleClearQueue = (
    clearType: "completed" | "failed" | "all" | "queued",
  ) => {
    setTrackedJobs((prev) => {
      const newMap = new Map(prev);
      for (const [id, job] of newMap) {
        if (
          clearType === "all" ||
          (clearType === "completed" && job.status === "completed") ||
          (clearType === "failed" && job.status === "failed") ||
          (clearType === "queued" && job.status === "queued")
        ) {
          newMap.delete(id);
        }
      }
      return newMap;
    });
  };

  // Manual poll for job status (webhook-based architecture uses this for manual refresh)
  const handleManualPoll = async () => {
    setIsManualPolling(true);
    try {
      const currentJobs = trackedJobsRef.current;

      // Get unique batch IDs for jobs that are pending/processing
      const activeBatchIds = new Set<string>();
      for (const job of currentJobs.values()) {
        if (
          (job.status === "pending" || job.status === "processing") &&
          job.batchId
        ) {
          activeBatchIds.add(job.batchId);
        }
      }

      // Poll each active batch
      for (const batchId of activeBatchIds) {
        try {
          const response = await fetch(
            `/api/gpu-api/test/batch/status?batchId=${batchId}`,
          );
          const data = await response.json();

          if (!data.success || !data.batch) continue;

          const batchStatus = data.batch;

          // Update tracked batch
          setTrackedBatches((prev) => {
            const newMap = new Map(prev);
            const existing = newMap.get(batchId);
            if (existing) {
              newMap.set(batchId, {
                ...existing,
                status: batchStatus.status,
                completedItems: batchStatus.completedItems,
                failedItems: batchStatus.failedItems,
              });
            }
            return newMap;
          });

          // Update individual jobs from batch items
          setTrackedJobs((prev) => {
            const newMap = new Map(prev);

            for (const item of batchStatus.items) {
              for (const [jobId, job] of newMap) {
                if (
                  job.batchId === batchId &&
                  job.batchItemIndex === item.itemIndex
                ) {
                  const updatedJob = { ...job };

                  if (item.status === "completed") {
                    updatedJob.status = "completed";
                    updatedJob.progressPercent = 100;
                    updatedJob.result = {
                      success: true,
                      type: job.type,
                      imageUrl:
                        job.type === "image" || job.type === "image-edit"
                          ? item.result?.imageUrl || item.result?.save_url
                          : undefined,
                      videoUrl:
                        job.type === "video" || job.type === "ltx2"
                          ? item.result?.videoUrl || item.result?.save_url
                          : undefined,
                      generationTime:
                        item.result?.generationTime ||
                        item.result?.generation_time,
                    };
                  } else if (item.status === "failed") {
                    updatedJob.status = "failed";
                    updatedJob.result = {
                      success: false,
                      type: job.type,
                      error:
                        item.result?.error ||
                        item.error_message ||
                        "Job failed",
                    };
                  } else if (
                    item.status === "running" ||
                    item.status === "processing"
                  ) {
                    updatedJob.status = "processing";
                  } else if (item.status === "pending") {
                    updatedJob.status = "pending";
                  }

                  newMap.set(jobId, updatedJob);
                  break;
                }
              }
            }

            return newMap;
          });
        } catch (error) {
          console.error(
            `[GPUApiTester] Error polling batch ${batchId}:`,
            error,
          );
        }
      }
    } finally {
      setIsManualPolling(false);
    }
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

  const _handleSwitchMode = async (targetMode: "image" | "video") => {
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

  const handleGetVramMode = async () => {
    try {
      const response = await fetch("/api/gpu-api/settings/vram-mode");
      const data = await response.json();
      if (data.success) {
        setVramMode(data.data.mode);
      }
    } catch {
      // Ignore error
    }
  };

  const handleSetVramMode = async (mode: VramMode) => {
    setModeSwitching(true);
    try {
      const response = await fetch("/api/gpu-api/settings/vram-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = await response.json();
      if (data.success) {
        setVramMode(data.data.mode);
      } else {
        console.error("[GPUApiTester] Set VRAM mode failed:", data.error);
      }
    } catch (err) {
      console.error("[GPUApiTester] Set VRAM mode error:", err);
    } finally {
      setModeSwitching(false);
    }
  };

  // =========================================================================
  // LORA HANDLERS
  // =========================================================================

  const handleListLoras = async () => {
    setLoraStatus("loading");
    try {
      const response = await fetch("/api/gpu-api/loras");
      const data = await response.json();
      if (data.success) {
        setLoraList(data.data || []);
        setLoraStatus("success");
      } else {
        setLoraStatus("error");
      }
    } catch {
      setLoraStatus("error");
    }
  };

  const handleDeleteLora = async (loraName: string) => {
    setLoraDeleting(loraName);
    try {
      const response = await fetch(
        `/api/gpu-api/loras?name=${encodeURIComponent(loraName)}`,
        {
          method: "DELETE",
        },
      );
      const data = await response.json();
      if (data.success) {
        // Refresh the list
        await handleListLoras();
      }
    } catch {
      // Handle error silently
    } finally {
      setLoraDeleting(null);
    }
  };

  const handleUploadLora = async (file: File) => {
    setLoraUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/gpu-api/loras", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (data.success) {
        // Refresh the list
        await handleListLoras();
      }
    } catch {
      // Handle error silently
    } finally {
      setLoraUploading(false);
    }
  };

  // R2 Storage clear handler
  const handleClearR2Storage = async () => {
    if (clearingStorage) return;

    const confirmed = window.confirm(
      "Are you sure you want to delete all media from GPU API Tester R2 storage? This action cannot be undone.",
    );

    if (!confirmed) return;

    setClearingStorage(true);
    try {
      const response = await fetch("/api/gpu-api/test/clear-storage", {
        method: "DELETE",
      });
      const data = await response.json();

      if (data.success) {
        alert(
          `Successfully deleted ${data.data.deleted} files from R2 storage.`,
        );
      } else {
        alert(`Failed to clear storage: ${data.error}`);
      }
    } catch (error) {
      alert(
        `Error clearing storage: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    } finally {
      setClearingStorage(false);
    }
  };

  // =========================================================================
  // PROMPT ENHANCEMENT HANDLER
  // =========================================================================

  const handleEnhancePrompt = async (
    type: 'image' | 'image-edit' | 'video',
    prompt: string,
    setPrompt: (s: string) => void,
    setEnhancing: (b: boolean) => void,
  ) => {
    if (!prompt.trim()) return;
    setEnhancing(true);
    try {
      const response = await fetch('/api/gpu-api/enhance-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          generationType: type,
          ...(type === 'video' && {
            durationSeconds: videoDuration,
            aspectRatio: videoAspectRatio,
            hasStartFrame: !!videoStartFrameUrl,
            hasEndFrame: !!videoEndFrameUrl,
          }),
          ...(type === 'image' && {
            aspectRatio: imageAspectRatio,
          }),
          ...(type === 'image-edit' && {
            aspectRatio: editAspectRatio,
          }),
        }),
      });
      const data = await response.json();
      if (data.enhancedPrompt) {
        setPrompt(data.enhancedPrompt);
      }
    } catch (err) {
      console.error('[GPUApiTester] Prompt enhancement failed:', err);
    } finally {
      setEnhancing(false);
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
          lora: imageLora || undefined,
          width: imageWidth
            ? parseInt(imageWidth)
            : imageAspectRatio === "9:16"
              ? 1080
              : 1920,
          height: imageHeight
            ? parseInt(imageHeight)
            : imageAspectRatio === "9:16"
              ? 1920
              : 1080,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to start test");

      const result = await pollForResult(data.taskId, (update) =>
        setImageResult(update),
      );
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
          maskImageUrl: editMaskUrl || undefined,
          aspectRatio: editAspectRatio,
          seed: editSeed ? parseInt(editSeed) : undefined,
          loraName: editLoraName || undefined,
          loraStrength: editLoraName ? editLoraStrength : undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to start test");

      const result = await pollForResult(data.taskId, (update) =>
        setEditResult(update),
      );
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
          width: videoWidth
            ? parseInt(videoWidth)
            : videoAspectRatio === "9:16"
              ? 1080
              : 1920,
          height: videoHeight
            ? parseInt(videoHeight)
            : videoAspectRatio === "9:16"
              ? 1920
              : 1080,
          endFrameUrl: videoEndFrameUrl || undefined,
          seed: videoSeed ? parseInt(videoSeed) : undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to start test");

      const result = await pollForResult(data.taskId, (update) =>
        setVideoResult(update),
      );
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

  const handleTestMusicGeneration = async () => {
    setMusicStatus("loading");
    setMusicResult(null);

    try {
      const response = await fetch("/api/gpu-api/test/music", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: musicPrompt,
          lyrics: musicLyrics || undefined,
          durationSeconds: musicDuration,
          seed: musicSeed ? parseInt(musicSeed) : undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to start test");

      const result = await pollForResult(data.taskId, (update) =>
        setMusicResult(update),
      );
      setMusicResult(result);
      setMusicStatus(result.success ? "success" : "error");
      setMusicDebugExpanded(!result.success);
    } catch (err) {
      setMusicResult({
        success: false,
        type: "music_generation",
        error: err instanceof Error ? err.message : "Unknown error",
      });
      setMusicStatus("error");
    }
  };

  const handleTestSfxGeneration = async () => {
    setSfxStatus("loading");
    setSfxResult(null);

    try {
      const response = await fetch("/api/gpu-api/test/sfx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: sfxPrompt,
          durationSeconds: sfxDuration,
          seed: sfxSeed ? parseInt(sfxSeed) : undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to start test");

      const result = await pollForResult(data.taskId, (update) =>
        setSfxResult(update),
      );
      setSfxResult(result);
      setSfxStatus(result.success ? "success" : "error");
      setSfxDebugExpanded(!result.success);
    } catch (err) {
      setSfxResult({
        success: false,
        type: "sfx_generation",
        error: err instanceof Error ? err.message : "Unknown error",
      });
      setSfxStatus("error");
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
      case "music":
        setMusicStatus("idle");
        setMusicResult(null);
        break;
      case "sfx":
        setSfxStatus("idle");
        setSfxResult(null);
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

  const renderStatusBadge = (
    status: TestStatus,
    result?: TestResult | null,
  ) => {
    // Check for queue position in finalJob
    const queuePos = result?.finalJob?.queue_position;
    const isPending = result?.finalJob?.status === "pending";
    const isProcessing = result?.finalJob?.status === "processing";
    const progressPercent = result?.finalJob?.progress_percent;
    const progressStage = result?.finalJob?.progress_stage;

    // Show queue position when pending
    if (status === "loading" && isPending && queuePos) {
      return (
        <span className="flex items-center gap-1 text-xs px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded">
          <Loader2 className="w-3 h-3 animate-spin" />
          Queue: #{queuePos}
        </span>
      );
    }

    // Show progress when processing
    if (status === "loading" && isProcessing) {
      const progressText =
        progressPercent !== undefined
          ? `${progressPercent}%${progressStage ? ` - ${progressStage}` : ""}`
          : progressStage || "Processing";
      return (
        <span className="flex items-center gap-1 text-xs px-2 py-1 bg-blue-500/20 text-blue-400 rounded">
          <Loader2 className="w-3 h-3 animate-spin" />
          {progressText}
        </span>
      );
    }

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
    color: string,
  ) => (
    <div className="flex gap-2 flex-wrap">
      {(["16:9", "9:16"] as AspectRatio[]).map((ratio) => (
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

  const _calculateDefaultResolutions = (ratio: AspectRatio) => {
    if (ratio === "9:16") {
      return { width: "1080", height: "1920" };
    }
    return { width: "1920", height: "1080" };
  };

  const renderDebugSection = (
    result: TestResult | null,
    expanded: boolean,
    onToggle: () => void,
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

            {/* Final Job Info */}
            {result.finalJob && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-neutral-500 uppercase">
                    Final Job State
                  </span>
                  <button
                    onClick={() =>
                      copyToClipboard(JSON.stringify(result.finalJob, null, 2))
                    }
                    className="p-1 hover:bg-neutral-800 rounded transition-colors"
                  >
                    <Copy className="w-3 h-3 text-neutral-400" />
                  </button>
                </div>
                <pre className="text-xs text-neutral-300 bg-neutral-900 p-2 rounded overflow-x-auto">
                  {JSON.stringify(result.finalJob, null, 2)}
                </pre>
              </div>
            )}

            {/* Request */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-neutral-500 uppercase">
                  Request Body
                </span>
                <button
                  onClick={() =>
                    copyToClipboard(
                      JSON.stringify(result.debug?.request, null, 2),
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
                      JSON.stringify(result.debug?.response, null, 2),
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
    onDebugToggle: () => void,
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

  if (!mounted || !isOpen) return null;

  // Inner content (shared between inline and dialog modes)
  const innerContent = (
    <div
      className={
        inline
          ? "relative flex flex-col h-full bg-neutral-950 overflow-hidden"
          : "fixed top-0 left-0 w-full h-full z-[9999] bg-neutral-950 flex flex-col pointer-events-auto overflow-hidden"
      }
    >
      {!inline && (
        <div className="sr-only">
          <h2>GPU API Tester</h2>
          <p>Test individual GPU API endpoints</p>
        </div>
      )}
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-neutral-800">
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
          <div className="flex items-center gap-2">
            {renderStatusBadge(imageStatus, imageResult)}
          </div>
          {/* Clear R2 Storage Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearR2Storage}
            disabled={clearingStorage}
            className="border-red-500/50 text-red-400 hover:bg-red-500/10 hover:text-red-300"
          >
            {clearingStorage ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4 mr-2" />
            )}
            Clear R2 Storage
          </Button>
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
            <span className="ml-2">
              {renderStatusBadge(imageStatus, imageResult)}
            </span>
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
            <span className="ml-2">
              {renderStatusBadge(editStatus, editResult)}
            </span>
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
            <span className="ml-2">
              {renderStatusBadge(videoStatus, videoResult)}
            </span>
          )}
        </Button>

        <Button
          variant={activeTab === "music" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("music")}
          className={
            activeTab === "music" ? "bg-purple-600 hover:bg-purple-700" : ""
          }
        >
          <Music className="w-4 h-4 mr-2" />
          Music
          {musicStatus !== "idle" && (
            <span className="ml-2">
              {renderStatusBadge(musicStatus, musicResult)}
            </span>
          )}
        </Button>
        <Button
          variant={activeTab === "sfx" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("sfx")}
          className={
            activeTab === "sfx" ? "bg-orange-600 hover:bg-orange-700" : ""
          }
        >
          <Volume2 className="w-4 h-4 mr-2" />
          SFX
          {sfxStatus !== "idle" && (
            <span className="ml-2">
              {renderStatusBadge(sfxStatus, sfxResult)}
            </span>
          )}
        </Button>

        <Button
          variant={activeTab === "loras" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("loras")}
          className={
            activeTab === "loras" ? "bg-pink-600 hover:bg-pink-700" : ""
          }
        >
          <Settings2 className="w-4 h-4 mr-2" />
          LoRAs
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Main Content */}
        <div
          className={`flex-1 overflow-y-auto touch-auto relative z-0 pointer-events-auto transition-all ${
            queuePanelOpen ? "" : ""
          }`}
        >
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
                        <span className="text-white">
                          {readinessData.status}
                        </span>
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
                                {systemData.gpu.memory_usage_percent.toFixed(1)}
                                %)
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

                {/* VRAM Strategy Card */}
                <div className="p-4 bg-neutral-900 rounded-lg border border-neutral-700">
                  <h3 className="text-sm font-medium text-white mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-blue-400" />
                      VRAM Strategy
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => handleGetVramMode()}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </h3>

                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-neutral-400">Current:</span>
                      <span className="text-sm font-medium text-white uppercase">
                        {vramMode || "Unknown"}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        onClick={() => handleSetVramMode("image_generation")}
                        disabled={
                          vramMode === "image_generation" || modeSwitching
                        }
                        className={
                          vramMode === "image_generation"
                            ? "bg-green-600"
                            : "bg-neutral-700 hover:bg-neutral-600"
                        }
                        size="sm"
                      >
                        <Image className="w-4 h-4 mr-2" />
                        Image Gen
                      </Button>
                      <Button
                        onClick={() => handleSetVramMode("image_editing")}
                        disabled={vramMode === "image_editing" || modeSwitching}
                        className={
                          vramMode === "image_editing"
                            ? "bg-blue-600"
                            : "bg-neutral-700 hover:bg-neutral-600"
                        }
                        size="sm"
                      >
                        <Pencil className="w-4 h-4 mr-2" />
                        Image Edit
                      </Button>
                      <Button
                        onClick={() => handleSetVramMode("video_generation")}
                        disabled={
                          vramMode === "video_generation" || modeSwitching
                        }
                        className={
                          vramMode === "video_generation"
                            ? "bg-purple-600"
                            : "bg-neutral-700 hover:bg-neutral-600"
                        }
                        size="sm"
                      >
                        <Video className="w-4 h-4 mr-2" />
                        Video Gen
                      </Button>
                      <Button
                        onClick={() => handleSetVramMode("audio_creation")}
                        disabled={
                          vramMode === "audio_creation" || modeSwitching
                        }
                        className={
                          vramMode === "audio_creation"
                            ? "bg-pink-600"
                            : "bg-neutral-700 hover:bg-neutral-600"
                        }
                        size="sm"
                      >
                        <Music className="w-4 h-4 mr-2" />
                        Audio
                      </Button>
                      <Button
                        onClick={() => handleSetVramMode("all")}
                        disabled={vramMode === "all" || modeSwitching}
                        className={
                          vramMode === "all"
                            ? "bg-orange-600"
                            : "bg-neutral-700 hover:bg-neutral-600"
                        }
                        size="sm"
                      >
                        <Sparkles className="w-4 h-4 mr-2" />
                        All Models
                      </Button>
                    </div>
                    <div className="text-xs text-neutral-500 mt-2">
                      {vramMode === "image_generation" &&
                        "Z-Image Turbo only (~8GB VRAM)"}
                      {vramMode === "image_editing" &&
                        "Qwen-Image-Edit-2511 (~12GB VRAM)"}
                      {vramMode === "video_generation" &&
                        "LTX-2 only (~20GB VRAM)"}
                      {vramMode === "audio_creation" &&
                        "ACE-Step 1.5 + AudioGen (~8GB VRAM)"}
                      {vramMode === "all" && "All models loaded (~40GB+ VRAM)"}
                      {!vramMode && "Select a VRAM mode"}
                    </div>
                  </div>
                </div>

                {/* Mode Result */}
                {modeData && (
                  <div className="p-4 bg-neutral-900 rounded-lg border border-neutral-700">
                    <h4 className="text-sm font-medium text-neutral-300 mb-3">
                      Current Mode
                    </h4>

                    {/* Mode Switching Status */}
                    {modeData.is_switching && (
                      <div className="mb-4 p-3 bg-amber-900/30 rounded-lg border border-amber-600/50">
                        <div className="flex items-center gap-2 mb-2">
                          <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                          <span className="text-sm font-medium text-amber-400">
                            Switching to{" "}
                            {modeData.switching_target?.replace("_", " ") ||
                              "new mode"}
                            ...
                          </span>
                        </div>
                        {modeData.switching_step && (
                          <p className="text-xs text-amber-300/80 mb-2">
                            {modeData.switching_step}
                          </p>
                        )}
                        {modeData.switching_progress != null && (
                          <div className="w-full bg-neutral-700 rounded-full h-2">
                            <div
                              className="bg-amber-500 h-2 rounded-full transition-all duration-500"
                              style={{
                                width: `${Math.round(
                                  modeData.switching_progress * 100,
                                )}%`,
                              }}
                            />
                          </div>
                        )}
                        {modeData.switching_progress != null && (
                          <p className="text-xs text-neutral-400 mt-1 text-right">
                            {Math.round(modeData.switching_progress * 100)}%
                          </p>
                        )}
                      </div>
                    )}

                    <div className="space-y-2 text-sm mb-4">
                      <div className="flex justify-between">
                        <span className="text-neutral-400">Mode:</span>
                        <span className="text-purple-400 font-medium capitalize">
                          {modeData.mode?.replace("_", " ")}
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
                  </div>
                )}
              </div>
            )}

            {/* Image Generation Tab */}
            {activeTab === "image" && (
              <div className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-neutral-400">
                      Prompt{" "}
                      <span className="text-neutral-600">
                        (required, max 2000 chars)
                      </span>
                    </label>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-purple-400 hover:text-purple-300 hover:bg-purple-400/10"
                      disabled={!imagePrompt.trim() || imageEnhancing || imageStatus === "loading"}
                      onClick={() => handleEnhancePrompt('image', imagePrompt, setImagePrompt, setImageEnhancing)}
                      title="Enhance prompt with AI"
                    >
                      {imageEnhancing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                      ) : (
                        <Wand2 className="w-3.5 h-3.5 mr-1" />
                      )}
                      <span className="text-xs">{imageEnhancing ? 'Enhancing...' : 'Enhance'}</span>
                    </Button>
                  </div>
                  <Textarea
                    value={imagePrompt}
                    onChange={(e) => setImagePrompt(e.target.value)}
                    placeholder="Describe the image to generate..."
                    className="min-h-[100px] bg-neutral-900 border-neutral-700 text-neutral-200 relative z-20 cursor-text"
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
                    imageStatus === "loading" || !!(imageWidth || imageHeight),
                    "purple",
                  )}
                  {(imageWidth || imageHeight) && (
                    <p className="text-xs text-amber-500 mt-1">
                      Aspect ratio is ignored when custom dimensions are set.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-neutral-400 mb-2 block">
                      Width <span className="text-neutral-600">(optional)</span>
                    </label>
                    <Input
                      type="number"
                      value={imageWidth}
                      onChange={(e) => setImageWidth(e.target.value)}
                      placeholder="e.g. 512"
                      className="bg-neutral-900 border-neutral-700 text-neutral-200 relative z-20 cursor-text"
                      disabled={imageStatus === "loading"}
                      min={256}
                      max={2048}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-neutral-400 mb-2 block">
                      Height{" "}
                      <span className="text-neutral-600">(optional)</span>
                    </label>
                    <Input
                      type="number"
                      value={imageHeight}
                      onChange={(e) => setImageHeight(e.target.value)}
                      placeholder="e.g. 512"
                      className="bg-neutral-900 border-neutral-700 text-neutral-200 relative z-20 cursor-text"
                      disabled={imageStatus === "loading"}
                      min={256}
                      max={2048}
                    />
                  </div>
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
                    className="bg-neutral-900 border-neutral-700 text-neutral-200 relative z-20 cursor-text"
                    disabled={imageStatus === "loading"}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-neutral-400 mb-2 block">
                    LoRA <span className="text-neutral-600">(optional)</span>
                  </label>
                  <select
                    value={imageLora}
                    onChange={(e) => setImageLora(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:ring-2 focus:ring-purple-600 relative z-20"
                    disabled={imageStatus === "loading"}
                  >
                    <option value="">None (Base Model)</option>
                    {loraList.map((lora) => (
                      <option key={lora.name} value={lora.name}>
                        {lora.name} ({Math.round(lora.size_bytes / 1024 / 1024)}{" "}
                        MB)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-2">
                  {/* Queue Button */}
                  <Button
                    onClick={() => handleQueueJob("image")}
                    disabled={!imagePrompt.trim()}
                    className="w-1/5 bg-indigo-600 hover:bg-indigo-700"
                    size="sm"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Queue
                  </Button>

                  {/* Batch Button */}
                  <Button
                    onClick={() => {
                      setBatchJobType("image");
                      setBatchQueueOpen(true);
                    }}
                    disabled={!imagePrompt.trim()}
                    className="w-1/5 bg-violet-600 hover:bg-violet-700"
                    size="sm"
                  >
                    <Layers className="w-4 h-4 mr-1" />
                    Batch
                  </Button>

                  {/* View Queue Button */}
                  <Button
                    onClick={() => setQueuePanelOpen(true)}
                    variant="outline"
                    className="w-1/5 border-neutral-700"
                    size="sm"
                  >
                    <List className="w-4 h-4 mr-1" />
                    {activeJobCount > 0 ? `(${activeJobCount})` : "View"}
                  </Button>

                  {/* Generate Button (existing blocking behavior) */}
                  <Button
                    onClick={handleTestImageCreation}
                    disabled={!imagePrompt.trim() || imageStatus === "loading"}
                    className="w-2/5 bg-purple-600 hover:bg-purple-700"
                  >
                    {imageStatus === "loading" ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-2" />
                        Generate
                      </>
                    )}
                  </Button>

                  {/* Reset Button */}
                  {imageStatus !== "idle" && imageStatus !== "loading" && (
                    <Button
                      variant="outline"
                      onClick={() => handleReset("image")}
                      className="border-neutral-700"
                      size="sm"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </Button>
                  )}
                </div>

                {renderResult(imageResult, imageDebugExpanded, () =>
                  setImageDebugExpanded(!imageDebugExpanded),
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
                    className="bg-neutral-900 border-neutral-700 text-neutral-200 relative z-20 cursor-text"
                    disabled={editStatus === "loading"}
                  />
                  <p className="text-xs text-neutral-500 mt-1">
                    Will use picsum.photos placeholder if not provided
                  </p>
                </div>

                <div>
                  <label className="text-sm font-medium text-neutral-400 mb-2 block">
                    Mask Image URL{" "}
                    <span className="text-neutral-600">(optional)</span>
                  </label>
                  <Input
                    value={editMaskUrl}
                    onChange={(e) => setEditMaskUrl(e.target.value)}
                    placeholder="https://... (black/white mask)"
                    className="bg-neutral-900 border-neutral-700 text-neutral-200 relative z-20 cursor-text"
                    disabled={editStatus === "loading"}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-neutral-400">
                      Edit Prompt{" "}
                      <span className="text-neutral-600">
                        (required, max 2000 chars)
                      </span>
                    </label>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-amber-400 hover:text-amber-300 hover:bg-amber-400/10"
                      disabled={!editPrompt.trim() || editEnhancing || editStatus === "loading"}
                      onClick={() => handleEnhancePrompt('image-edit', editPrompt, setEditPrompt, setEditEnhancing)}
                      title="Enhance prompt with AI"
                    >
                      {editEnhancing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                      ) : (
                        <Wand2 className="w-3.5 h-3.5 mr-1" />
                      )}
                      <span className="text-xs">{editEnhancing ? 'Enhancing...' : 'Enhance'}</span>
                    </Button>
                  </div>
                  <Textarea
                    value={editPrompt}
                    onChange={(e) => setEditPrompt(e.target.value)}
                    placeholder="Describe how to edit the image..."
                    className="min-h-[100px] bg-neutral-900 border-neutral-700 text-neutral-200 relative z-20 cursor-text"
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
                    "amber",
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
                    className="bg-neutral-900 border-neutral-700 text-neutral-200 relative z-20 cursor-text"
                    disabled={editStatus === "loading"}
                  />
                </div>

                {/* LoRA Selection */}
                <div className="p-4 bg-neutral-900/50 rounded-lg border border-neutral-700">
                  <label className="text-sm font-medium text-neutral-400 mb-3 block flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-pink-400" />
                    LoRA Enhancement{" "}
                    <span className="text-neutral-600">(optional)</span>
                  </label>
                  <div className="space-y-4">
                    <div>
                      <select
                        value={editLoraName}
                        onChange={(e) => setEditLoraName(e.target.value)}
                        className="w-full bg-neutral-900 border border-neutral-700 text-neutral-200 rounded-md px-3 py-2"
                        disabled={editStatus === "loading"}
                      >
                        <option value="">None (standard editing)</option>
                        <option value="multiple-angles">
                          Multiple Angles - 96-position camera control
                        </option>
                      </select>
                      {editLoraName === "multiple-angles" && (
                        <p className="text-xs text-neutral-500 mt-2">
                          Prompt format: &lt;sks&gt; {"{azimuth}"} {"{elevation}"} {"{distance}"}
                          <br />
                          Example: &lt;sks&gt; 45 30 1.5
                        </p>
                      )}
                    </div>
                    {editLoraName && (
                      <div>
                        <label className="text-sm text-neutral-500 mb-2 block">
                          LoRA Strength: {editLoraStrength.toFixed(1)}
                        </label>
                        <Slider
                          value={[editLoraStrength]}
                          onValueChange={(val) => setEditLoraStrength(val[0])}
                          min={0.1}
                          max={1.0}
                          step={0.1}
                          disabled={editStatus === "loading"}
                          className="my-2"
                        />
                        <div className="flex justify-between text-xs text-neutral-600">
                          <span>0.1 (subtle)</span>
                          <span>0.5</span>
                          <span>1.0 (strong)</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={() => handleQueueJob("image-edit")}
                    disabled={!editPrompt.trim()}
                    className="w-1/5 bg-indigo-600 hover:bg-indigo-700"
                    size="sm"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Queue
                  </Button>
                  <Button
                    onClick={() => {
                      setBatchJobType("image-edit");
                      setBatchQueueOpen(true);
                    }}
                    disabled={!editPrompt.trim()}
                    className="w-1/5 bg-violet-600 hover:bg-violet-700"
                    size="sm"
                  >
                    <Layers className="w-4 h-4 mr-1" />
                    Batch
                  </Button>
                  <Button
                    onClick={() => setQueuePanelOpen(true)}
                    variant="outline"
                    className="w-1/5 border-neutral-700"
                    size="sm"
                  >
                    <List className="w-4 h-4 mr-1" />
                    {activeJobCount > 0 ? `(${activeJobCount})` : "View"}
                  </Button>
                  <Button
                    onClick={handleTestImageEdit}
                    disabled={!editPrompt.trim() || editStatus === "loading"}
                    className="w-2/5 bg-amber-600 hover:bg-amber-700"
                  >
                    {editStatus === "loading" ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Editing...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-2" />
                        Edit
                      </>
                    )}
                  </Button>
                  {editStatus !== "idle" && editStatus !== "loading" && (
                    <Button
                      variant="outline"
                      onClick={() => handleReset("image-edit")}
                      className="border-neutral-700"
                      size="sm"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </Button>
                  )}
                </div>

                {renderResult(editResult, editDebugExpanded, () =>
                  setEditDebugExpanded(!editDebugExpanded),
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
                    className="bg-neutral-900 border-neutral-700 text-neutral-200 relative z-20 cursor-text"
                    disabled={videoStatus === "loading"}
                  />
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
                    className="bg-neutral-900 border-neutral-700 text-neutral-200 relative z-20 cursor-text"
                    disabled={videoStatus === "loading"}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-neutral-400">
                      Motion Prompt{" "}
                      <span className="text-neutral-600">
                        (required, max 2000 chars)
                      </span>
                    </label>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-teal-400 hover:text-teal-300 hover:bg-teal-400/10"
                      disabled={!videoPrompt.trim() || videoEnhancing || videoStatus === "loading"}
                      onClick={() => handleEnhancePrompt('video', videoPrompt, setVideoPrompt, setVideoEnhancing)}
                      title="Enhance prompt with AI (LTX 2.3 optimized)"
                    >
                      {videoEnhancing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                      ) : (
                        <Wand2 className="w-3.5 h-3.5 mr-1" />
                      )}
                      <span className="text-xs">{videoEnhancing ? 'Enhancing...' : 'Enhance'}</span>
                    </Button>
                  </div>
                  <Textarea
                    value={videoPrompt}
                    onChange={(e) => setVideoPrompt(e.target.value)}
                    placeholder="Describe the motion/camera movement..."
                    className="min-h-[100px] bg-neutral-900 border-neutral-700 text-neutral-200 relative z-20 cursor-text"
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
                          variant={
                            videoDuration === dur ? "default" : "outline"
                          }
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
                            videoFps === f
                              ? "bg-teal-600"
                              : "border-neutral-700"
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
                    videoStatus === "loading" || !!(videoWidth || videoHeight),
                    "teal",
                  )}
                  {(videoWidth || videoHeight) && (
                    <p className="text-xs text-amber-500 mt-1">
                      Aspect ratio is ignored when custom dimensions are set.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-neutral-400 mb-2 block">
                      Width{" "}
                      <span className="text-neutral-600">
                        (optional, 512-1920)
                      </span>
                    </label>
                    <Input
                      type="number"
                      value={videoWidth}
                      onChange={(e) => setVideoWidth(e.target.value)}
                      placeholder="e.g. 1920 for 1080p"
                      className="bg-neutral-900 border-neutral-700 text-neutral-200 relative z-20 cursor-text"
                      disabled={videoStatus === "loading"}
                      min={512}
                      max={1920}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-neutral-400 mb-2 block">
                      Height{" "}
                      <span className="text-neutral-600">
                        (optional, 512-1920)
                      </span>
                    </label>
                    <Input
                      type="number"
                      value={videoHeight}
                      onChange={(e) => setVideoHeight(e.target.value)}
                      placeholder="e.g. 1080 for 1080p"
                      className="bg-neutral-900 border-neutral-700 text-neutral-200 relative z-20 cursor-text"
                      disabled={videoStatus === "loading"}
                      min={512}
                      max={1920}
                    />
                  </div>
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
                    className="bg-neutral-900 border-neutral-700 text-neutral-200 relative z-20 cursor-text"
                    disabled={videoStatus === "loading"}
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={() => handleQueueJob("video")}
                    disabled={!videoPrompt.trim()}
                    className="w-1/5 bg-indigo-600 hover:bg-indigo-700"
                    size="sm"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Queue
                  </Button>
                  <Button
                    onClick={() => {
                      setBatchJobType("video");
                      setBatchQueueOpen(true);
                    }}
                    disabled={!videoPrompt.trim()}
                    className="w-1/5 bg-violet-600 hover:bg-violet-700"
                    size="sm"
                  >
                    <Layers className="w-4 h-4 mr-1" />
                    Batch
                  </Button>
                  <Button
                    onClick={() => setQueuePanelOpen(true)}
                    variant="outline"
                    className="w-1/5 border-neutral-700"
                    size="sm"
                  >
                    <List className="w-4 h-4 mr-1" />
                    {activeJobCount > 0 ? `(${activeJobCount})` : "View"}
                  </Button>
                  <Button
                    onClick={handleTestVideoCreation}
                    disabled={!videoPrompt.trim() || videoStatus === "loading"}
                    className="w-2/5 bg-teal-600 hover:bg-teal-700"
                  >
                    {videoStatus === "loading" ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-2" />
                        Generate
                      </>
                    )}
                  </Button>
                  {videoStatus !== "idle" && videoStatus !== "loading" && (
                    <Button
                      variant="outline"
                      onClick={() => handleReset("video")}
                      className="border-neutral-700"
                      size="sm"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </Button>
                  )}
                </div>

                {renderResult(videoResult, videoDebugExpanded, () =>
                  setVideoDebugExpanded(!videoDebugExpanded),
                )}
              </div>
            )}

            {/* Music Generation Tab */}
            {activeTab === "music" && (
              <div className="space-y-6">
                <div>
                  <label className="text-sm font-medium text-neutral-400 mb-2 block">
                    Music Style/Genre Prompt{" "}
                    <span className="text-neutral-600">(required)</span>
                  </label>
                  <Textarea
                    value={musicPrompt}
                    onChange={(e) => setMusicPrompt(e.target.value)}
                    placeholder="Describe the music style, instruments, mood..."
                    className="min-h-[100px] bg-neutral-900 border-neutral-700 text-neutral-200 relative z-20 cursor-text"
                    disabled={musicStatus === "loading"}
                    maxLength={500}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-neutral-400 mb-2 block">
                    Lyrics{" "}
                    <span className="text-neutral-600">(optional)</span>
                  </label>
                  <Textarea
                    value={musicLyrics}
                    onChange={(e) => setMusicLyrics(e.target.value)}
                    placeholder="Add lyrics if you want vocal music..."
                    className="min-h-[80px] bg-neutral-900 border-neutral-700 text-neutral-200 relative z-20 cursor-text"
                    disabled={musicStatus === "loading"}
                    maxLength={3000}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-neutral-400 mb-2 block">
                    Duration: {musicDuration}s{" "}
                    <span className="text-neutral-600">(10-600 seconds)</span>
                  </label>
                  <Slider
                    value={[musicDuration]}
                    onValueChange={(val) => setMusicDuration(val[0])}
                    min={10}
                    max={600}
                    step={5}
                    disabled={musicStatus === "loading"}
                    className="my-3"
                  />
                  <div className="flex justify-between text-xs text-neutral-600">
                    <span>10s</span>
                    <span>1m</span>
                    <span>5m</span>
                    <span>10m</span>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-neutral-400 mb-2 block">
                    Seed <span className="text-neutral-600">(optional)</span>
                  </label>
                  <Input
                    type="number"
                    value={musicSeed}
                    onChange={(e) => setMusicSeed(e.target.value)}
                    placeholder="Leave empty for random"
                    className="bg-neutral-900 border-neutral-700 text-neutral-200 relative z-20 cursor-text"
                    disabled={musicStatus === "loading"}
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleTestMusicGeneration}
                    disabled={!musicPrompt.trim() || musicStatus === "loading"}
                    className="flex-1 bg-purple-600 hover:bg-purple-700"
                  >
                    {musicStatus === "loading" ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Music className="w-4 h-4 mr-2" />
                        Generate Music
                      </>
                    )}
                  </Button>
                  {musicStatus !== "idle" && musicStatus !== "loading" && (
                    <Button
                      variant="outline"
                      onClick={() => handleReset("music")}
                      className="border-neutral-700"
                      size="sm"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </Button>
                  )}
                </div>

                {/* Result */}
                {musicResult && (
                  <div
                    className={`p-4 rounded-lg border ${
                      musicResult.success
                        ? "bg-green-900/20 border-green-700"
                        : "bg-red-900/20 border-red-700"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      {musicResult.success ? (
                        <>
                          <CheckCircle2 className="w-5 h-5 text-green-400" />
                          <span className="text-green-400 font-medium">
                            Music Generated
                          </span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-5 h-5 text-red-400" />
                          <span className="text-red-400 font-medium">
                            Generation Failed
                          </span>
                        </>
                      )}
                    </div>

                    {musicResult.success && musicResult.audioUrl && (
                      <div className="space-y-3">
                        <audio
                          controls
                          className="w-full"
                          src={musicResult.audioUrl}
                        />
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copyToClipboard(musicResult.audioUrl!)}
                            className="border-neutral-700"
                          >
                            <Copy className="w-4 h-4 mr-2" />
                            Copy URL
                          </Button>
                          <a
                            href={musicResult.audioUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-neutral-700"
                            >
                              <ExternalLink className="w-4 h-4 mr-2" />
                              Open
                            </Button>
                          </a>
                        </div>
                        {musicResult.generationTime && (
                          <p className="text-sm text-neutral-400">
                            Generation time: {musicResult.generationTime.toFixed(2)}s
                          </p>
                        )}
                      </div>
                    )}

                    {!musicResult.success && musicResult.error && (
                      <p className="text-sm text-red-300">{musicResult.error}</p>
                    )}

                    {/* Debug section */}
                    <button
                      onClick={() => setMusicDebugExpanded(!musicDebugExpanded)}
                      className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-400 mt-3"
                    >
                      {musicDebugExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                      Debug Info
                    </button>
                    {musicDebugExpanded && musicResult.debug && (
                      <pre className="mt-2 p-2 bg-neutral-950 rounded text-xs text-neutral-400 overflow-x-auto">
                        {JSON.stringify(musicResult.debug, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Sound Effect Generation Tab */}
            {activeTab === "sfx" && (
              <div className="space-y-6">
                <div>
                  <label className="text-sm font-medium text-neutral-400 mb-2 block">
                    Sound Effect Description{" "}
                    <span className="text-neutral-600">(required)</span>
                  </label>
                  <Textarea
                    value={sfxPrompt}
                    onChange={(e) => setSfxPrompt(e.target.value)}
                    placeholder="Describe the sound effect..."
                    className="min-h-[100px] bg-neutral-900 border-neutral-700 text-neutral-200 relative z-20 cursor-text"
                    disabled={sfxStatus === "loading"}
                    maxLength={500}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-neutral-400 mb-2 block">
                    Duration: {sfxDuration}s{" "}
                    <span className="text-neutral-600">(1-30 seconds)</span>
                  </label>
                  <Slider
                    value={[sfxDuration]}
                    onValueChange={(val) => setSfxDuration(val[0])}
                    min={1}
                    max={30}
                    step={1}
                    disabled={sfxStatus === "loading"}
                    className="my-3"
                  />
                  <div className="flex justify-between text-xs text-neutral-600">
                    <span>1s</span>
                    <span>10s</span>
                    <span>20s</span>
                    <span>30s</span>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-neutral-400 mb-2 block">
                    Seed <span className="text-neutral-600">(optional)</span>
                  </label>
                  <Input
                    type="number"
                    value={sfxSeed}
                    onChange={(e) => setSfxSeed(e.target.value)}
                    placeholder="Leave empty for random"
                    className="bg-neutral-900 border-neutral-700 text-neutral-200 relative z-20 cursor-text"
                    disabled={sfxStatus === "loading"}
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleTestSfxGeneration}
                    disabled={!sfxPrompt.trim() || sfxStatus === "loading"}
                    className="flex-1 bg-orange-600 hover:bg-orange-700"
                  >
                    {sfxStatus === "loading" ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-4 h-4 mr-2" />
                        Generate SFX
                      </>
                    )}
                  </Button>
                  {sfxStatus !== "idle" && sfxStatus !== "loading" && (
                    <Button
                      variant="outline"
                      onClick={() => handleReset("sfx")}
                      className="border-neutral-700"
                      size="sm"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </Button>
                  )}
                </div>

                {/* Result */}
                {sfxResult && (
                  <div
                    className={`p-4 rounded-lg border ${
                      sfxResult.success
                        ? "bg-green-900/20 border-green-700"
                        : "bg-red-900/20 border-red-700"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      {sfxResult.success ? (
                        <>
                          <CheckCircle2 className="w-5 h-5 text-green-400" />
                          <span className="text-green-400 font-medium">
                            Sound Effect Generated
                          </span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-5 h-5 text-red-400" />
                          <span className="text-red-400 font-medium">
                            Generation Failed
                          </span>
                        </>
                      )}
                    </div>

                    {sfxResult.success && sfxResult.audioUrl && (
                      <div className="space-y-3">
                        <audio
                          controls
                          className="w-full"
                          src={sfxResult.audioUrl}
                        />
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copyToClipboard(sfxResult.audioUrl!)}
                            className="border-neutral-700"
                          >
                            <Copy className="w-4 h-4 mr-2" />
                            Copy URL
                          </Button>
                          <a
                            href={sfxResult.audioUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-neutral-700"
                            >
                              <ExternalLink className="w-4 h-4 mr-2" />
                              Open
                            </Button>
                          </a>
                        </div>
                        {sfxResult.generationTime && (
                          <p className="text-sm text-neutral-400">
                            Generation time: {sfxResult.generationTime.toFixed(2)}s
                          </p>
                        )}
                      </div>
                    )}

                    {!sfxResult.success && sfxResult.error && (
                      <p className="text-sm text-red-300">{sfxResult.error}</p>
                    )}

                    {/* Debug section */}
                    <button
                      onClick={() => setSfxDebugExpanded(!sfxDebugExpanded)}
                      className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-400 mt-3"
                    >
                      {sfxDebugExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                      Debug Info
                    </button>
                    {sfxDebugExpanded && sfxResult.debug && (
                      <pre className="mt-2 p-2 bg-neutral-950 rounded text-xs text-neutral-400 overflow-x-auto">
                        {JSON.stringify(sfxResult.debug, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* LoRAs Tab */}
            {activeTab === "loras" && (
              <div className="space-y-6">
                <div className="p-4 bg-neutral-900 rounded-lg border border-neutral-700">
                  <h3 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
                    <Settings2 className="w-4 h-4 text-pink-400" />
                    LoRA Management
                  </h3>
                  <div className="flex gap-3">
                    <Button
                      onClick={handleListLoras}
                      disabled={loraStatus === "loading"}
                      className="bg-pink-600 hover:bg-pink-700"
                      size="sm"
                    >
                      {loraStatus === "loading" ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <RefreshCw className="w-4 h-4 mr-2" />
                      )}
                      List LoRAs
                    </Button>
                    <label>
                      <input
                        type="file"
                        accept=".safetensors"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            handleUploadLora(file);
                            e.target.value = "";
                          }
                        }}
                        disabled={loraUploading}
                      />
                      <Button
                        asChild
                        disabled={loraUploading}
                        className="bg-green-600 hover:bg-green-700 cursor-pointer"
                        size="sm"
                      >
                        <span>
                          {loraUploading ? (
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          ) : (
                            <Upload className="w-4 h-4 mr-2" />
                          )}
                          Upload LoRA
                        </span>
                      </Button>
                    </label>
                  </div>
                </div>

                {/* LoRA List */}
                {loraList.length > 0 && (
                  <div className="p-4 bg-neutral-900 rounded-lg border border-neutral-700">
                    <h4 className="text-sm font-medium text-neutral-300 mb-3">
                      Available LoRAs ({loraList.length})
                    </h4>
                    <div className="space-y-2">
                      {loraList.map((lora) => (
                        <div
                          key={lora.name}
                          className="flex items-center justify-between p-3 bg-neutral-800 rounded-lg"
                        >
                          <div>
                            <p className="text-sm font-medium text-white">
                              {lora.name}
                            </p>
                            <p className="text-xs text-neutral-400">
                              {(lora.size_bytes / 1024 / 1024).toFixed(2)} MB
                            </p>
                          </div>
                          <Button
                            onClick={() => handleDeleteLora(lora.name)}
                            disabled={loraDeleting === lora.name}
                            variant="ghost"
                            size="sm"
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          >
                            {loraDeleting === lora.name ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <X className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {loraStatus === "success" && loraList.length === 0 && (
                  <div className="p-4 bg-neutral-900 rounded-lg border border-neutral-700 text-center">
                    <p className="text-sm text-neutral-400">
                      No LoRAs found. Upload a .safetensors file to get started.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Info Note */}
            <div className="mt-8 p-4 bg-neutral-900/50 border border-neutral-800 rounded-lg">
              <p className="text-xs text-neutral-500">
                <strong className="text-neutral-400">Note:</strong>{" "}
                {apiMode === "mock" ? (
                  <>
                    Mock mode uses BullMQ workers for async testing. Results
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

        {/* ================================================================= */}
        {/* QUEUE PANEL - Inline Sidebar */}
        {/* ================================================================= */}
        {queuePanelOpen && (
          <div className="w-[380px] flex-shrink-0 bg-neutral-900 border-l border-neutral-700 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-neutral-700">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <List className="w-4 h-4" />
                Queue ({trackedJobs.size})
              </h2>
              <div className="flex items-center gap-2">
                {/* Manual Poll Button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleManualPoll}
                  disabled={isManualPolling || activeJobCount === 0}
                  className="border-neutral-600 text-neutral-300 hover:bg-neutral-700 h-7"
                  title="Manually refresh job status from GPU API"
                >
                  <RefreshCw
                    className={`w-3 h-3 mr-1 ${
                      isManualPolling ? "animate-spin" : ""
                    }`}
                  />
                  Poll
                </Button>
                {queuedJobCount > 0 && (
                  <Button
                    onClick={handleSendAllQueued}
                    className="bg-green-600 hover:bg-green-700"
                    size="sm"
                  >
                    <Play className="w-3 h-3 mr-1" />
                    Send ({queuedJobCount})
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setQueuePanelOpen(false)}
                  className="h-7 w-7"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-1 p-2 border-b border-neutral-800 flex-wrap">
              {(
                [
                  "all",
                  "queued",
                  "pending",
                  "processing",
                  "completed",
                  "failed",
                ] as QueueFilter[]
              ).map((f) => (
                <Button
                  key={f}
                  variant={queueFilter === f ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setQueueFilter(f)}
                  className={`text-xs px-2 py-1 h-7 ${
                    queueFilter === f ? "bg-indigo-600" : "text-neutral-400"
                  }`}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                  {f === "queued" &&
                    queuedJobCount > 0 &&
                    ` (${queuedJobCount})`}
                </Button>
              ))}
            </div>

            {/* Job List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {filteredJobs.length === 0 ? (
                <div className="text-center text-neutral-500 py-6">
                  <Clock className="w-6 h-6 mx-auto mb-2 opacity-50" />
                  <p className="text-xs">No jobs</p>
                  <p className="text-xs mt-1 text-neutral-600">
                    Click Queue or Batch to add
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {/* Selected Job Detail Panel */}
                  {selectedJobId && trackedJobs.get(selectedJobId) && (
                    <div className="bg-neutral-900 border border-indigo-500/50 rounded-lg p-3 mb-2">
                      {(() => {
                        const job = trackedJobs.get(selectedJobId)!;
                        const mediaUrl =
                          job.result?.imageUrl || job.result?.videoUrl;
                        return (
                          <>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-medium text-indigo-400">
                                Job Details
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedJobId(null)}
                                className="h-5 w-5 p-0"
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </div>

                            {/* Preview */}
                            {job.status === "completed" && mediaUrl && (
                              <div className="mb-3 rounded overflow-hidden bg-neutral-800">
                                {job.result?.imageUrl ? (
                                  <img
                                    src={job.result.imageUrl}
                                    alt="Generated"
                                    className="w-full h-auto max-h-40 object-contain"
                                  />
                                ) : job.result?.videoUrl ? (
                                  <video
                                    src={job.result.videoUrl}
                                    controls
                                    className="w-full h-auto max-h-40"
                                  />
                                ) : null}
                              </div>
                            )}

                            {/* Info */}
                            <div className="space-y-1.5 text-xs">
                              <div className="flex justify-between">
                                <span className="text-neutral-500">
                                  Status:
                                </span>
                                <span
                                  className={`font-medium ${
                                    job.status === "completed"
                                      ? "text-green-400"
                                      : job.status === "failed"
                                        ? "text-red-400"
                                        : job.status === "processing"
                                          ? "text-blue-400"
                                          : "text-yellow-400"
                                  }`}
                                >
                                  {job.status}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-neutral-500">Type:</span>
                                <span className="text-neutral-300">
                                  {job.type}
                                </span>
                              </div>
                              {job.batchId && (
                                <div className="flex justify-between">
                                  <span className="text-neutral-500">
                                    Batch:
                                  </span>
                                  <span
                                    className="text-neutral-400 truncate max-w-[150px]"
                                    title={job.batchId}
                                  >
                                    {job.batchId.slice(0, 20)}...
                                  </span>
                                </div>
                              )}
                              {job.result?.generationTime && (
                                <div className="flex justify-between">
                                  <span className="text-neutral-500">
                                    Gen Time:
                                  </span>
                                  <span className="text-neutral-300">
                                    {job.result.generationTime}s
                                  </span>
                                </div>
                              )}
                              <div className="pt-1">
                                <span className="text-neutral-500 block mb-1">
                                  Prompt:
                                </span>
                                <p className="text-neutral-300 text-[10px] leading-relaxed bg-neutral-800 rounded p-2">
                                  {job.params.prompt}
                                </p>
                              </div>

                              {/* URL and Actions */}
                              {mediaUrl && (
                                <div className="pt-2 space-y-2">
                                  <div>
                                    <span className="text-neutral-500 block mb-1">
                                      URL:
                                    </span>
                                    <div className="flex gap-1">
                                      <input
                                        type="text"
                                        value={mediaUrl}
                                        readOnly
                                        className="flex-1 bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-[10px] text-neutral-400"
                                      />
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                          navigator.clipboard.writeText(
                                            mediaUrl,
                                          )
                                        }
                                        className="h-6 px-2 border-neutral-700"
                                      >
                                        <Copy className="w-3 h-3" />
                                      </Button>
                                    </div>
                                  </div>
                                  <div className="flex gap-2">
                                    <a
                                      href={mediaUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex-1 flex items-center justify-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded py-1.5 text-xs"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                      Open
                                    </a>
                                  </div>
                                </div>
                              )}

                              {/* Error */}
                              {job.status === "failed" && job.result?.error && (
                                <div className="pt-2">
                                  <span className="text-red-400 block mb-1">
                                    Error:
                                  </span>
                                  <p className="text-red-300 text-[10px] bg-red-900/20 rounded p-2">
                                    {job.result.error}
                                  </p>
                                </div>
                              )}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}

                  {/* Job List */}
                  {filteredJobs
                    .sort(
                      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
                    )
                    .map((job) => (
                      <div
                        key={job.id}
                        onClick={() =>
                          setSelectedJobId(
                            selectedJobId === job.id ? null : job.id,
                          )
                        }
                        className={`bg-neutral-800 rounded-lg p-2 border text-xs cursor-pointer transition-colors ${
                          selectedJobId === job.id
                            ? "border-indigo-500 bg-neutral-800/80"
                            : "border-neutral-700 hover:border-neutral-600"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1">
                            {job.type === "image" && (
                              <Image className="w-3 h-3 text-purple-400" />
                            )}
                            {job.type === "image-edit" && (
                              <Pencil className="w-3 h-3 text-amber-400" />
                            )}
                            {job.type === "video" && (
                              <Video className="w-3 h-3 text-teal-400" />
                            )}
                            {job.type === "ltx2" && (
                              <Sparkles className="w-3 h-3 text-cyan-400" />
                            )}
                            <span className="text-neutral-400 uppercase">
                              {job.type}
                            </span>
                          </div>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] ${
                              job.status === "queued"
                                ? "bg-orange-500/20 text-orange-400"
                                : job.status === "pending"
                                  ? "bg-yellow-500/20 text-yellow-400"
                                  : job.status === "processing"
                                    ? "bg-blue-500/20 text-blue-400"
                                    : job.status === "completed"
                                      ? "bg-green-500/20 text-green-400"
                                      : "bg-red-500/20 text-red-400"
                            }`}
                          >
                            {job.status === "queued"
                              ? "Local"
                              : job.status === "pending" && job.queuePosition
                                ? `#${job.queuePosition}`
                                : job.status === "processing" &&
                                    job.progressPercent !== undefined
                                  ? `${job.progressPercent}%`
                                  : job.status}
                          </span>
                        </div>
                        {job.status === "processing" &&
                          job.progressPercent !== undefined && (
                            <div className="mt-1 h-1 bg-neutral-700 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-500"
                                style={{ width: `${job.progressPercent}%` }}
                              />
                            </div>
                          )}
                        <p className="mt-1 text-neutral-400 truncate">
                          {job.params.prompt?.slice(0, 40)}...
                        </p>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-2 border-t border-neutral-700 flex gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleClearQueue("completed")}
                className="flex-1 border-neutral-700 text-neutral-400 text-xs h-7"
              >
                <Trash2 className="w-3 h-3 mr-1" />
                Done
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleClearQueue("queued")}
                className="flex-1 border-neutral-700 text-neutral-400 text-xs h-7"
              >
                <Trash2 className="w-3 h-3 mr-1" />
                Queued
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleClearQueue("all")}
                className="flex-1 border-neutral-700 text-neutral-400 text-xs h-7"
              >
                <Trash2 className="w-3 h-3 mr-1" />
                All
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ================================================================= */}
      {/* BATCH QUEUE MODAL */}
      {/* ================================================================= */}
      <Dialog open={batchQueueOpen} onOpenChange={setBatchQueueOpen}>
        <DialogContent className="bg-neutral-900 border-neutral-700 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-violet-400" />
              Batch Queue Jobs
            </DialogTitle>
            <DialogDescription className="text-neutral-400">
              Queue multiple similar jobs with variations for testing.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {/* Quantity Input */}
            <div>
              <label className="text-sm font-medium text-neutral-400 block mb-2">
                Number of Jobs
              </label>
              <Input
                type="number"
                value={batchCount}
                onChange={(e) =>
                  setBatchCount(
                    Math.min(50, Math.max(1, parseInt(e.target.value) || 1)),
                  )
                }
                min={1}
                max={50}
                className="bg-neutral-800 border-neutral-700 text-white"
              />
              <p className="text-xs text-neutral-500 mt-1">
                Max 50 jobs per batch
              </p>
            </div>

            {/* Variation Options */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-neutral-400 block">
                Variations
              </label>
              <div className="flex items-center gap-3 bg-neutral-800 p-3 rounded-lg">
                <Switch
                  checked={batchVarySeeds}
                  onCheckedChange={setBatchVarySeeds}
                />
                <div>
                  <span className="text-sm text-neutral-300">Random seeds</span>
                  <p className="text-xs text-neutral-500">
                    Each job gets a unique random seed
                  </p>
                </div>
              </div>
            </div>

            {/* Preview */}
            <div className="bg-neutral-800 rounded-lg p-3 border border-neutral-700">
              <p className="text-xs text-neutral-500 mb-1">Preview</p>
              <p className="text-sm text-neutral-300">
                Will add{" "}
                <span className="text-violet-400 font-medium">
                  {batchCount}
                </span>{" "}
                {batchJobType} jobs to local queue
                {batchVarySeeds && " with random seeds"}
              </p>
              <p className="text-xs text-neutral-500 mt-1">
                Use &quot;Send All&quot; in queue panel to submit to API
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-end pt-2">
              <Button
                variant="outline"
                onClick={() => setBatchQueueOpen(false)}
                className="border-neutral-700"
              >
                Cancel
              </Button>
              <Button
                onClick={handleBatchQueue}
                className="bg-violet-600 hover:bg-violet-700"
              >
                <Layers className="w-4 h-4 mr-2" />
                Queue {batchCount} Jobs
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );

  // For inline mode, render content directly; for overlay mode, wrap in Dialog
  if (inline) {
    return innerContent;
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="fixed top-0 left-0 w-full h-full z-[9999] !max-w-none translate-x-0 translate-y-0 bg-neutral-950 border-none rounded-none p-0 flex flex-col pointer-events-auto overflow-hidden isolate animate-none duration-0"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>GPU API Tester</DialogTitle>
          <DialogDescription>
            Test individual GPU API endpoints
          </DialogDescription>
        </DialogHeader>
        {innerContent}
      </DialogContent>
    </Dialog>
  );
}
