"use client";

import React, {
  useState,
  useMemo,
  useEffect,
  useCallback,
  useRef,
} from "react";
import {
  Film,
  Image,
  Music,
  Plus,
  Clock,
  Eye,
  Search,
  X,
  Upload,
  Grid3X3,
  Star,
  Check,
  Loader2,
  CheckCircle,
  ImageIcon,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { createBrowserClient } from "@supabase/ssr";

// =============================================================================
// Types
// =============================================================================

// Stock media level type (from Step 1 selection)
type StockMediaLevel =
  | "none"
  | "standard_images"
  | "extensive_images"
  | "standard_images_video"
  | "extensive_images_video";

interface Step2StockMediaProps {
  videoId: string;
  isLoading: boolean;
  taskId: string | null;
  initialMedia: MediaItem[];
  onMediaLoaded: (results: MediaItem[]) => void;
  onNext: () => void;
  onBack: () => void;
  isLocked?: boolean;
  stockMediaLevel?: StockMediaLevel;
}

type MediaCategory = "all" | "video" | "image" | "audio" | "uploaded";

interface MediaItem {
  id: string;
  type: "video" | "image" | "audio";
  name: string;
  thumbnail: string | null;
  duration?: string;
  durationSeconds?: number;
  source: "serper" | "pexels" | "youtube" | "uploaded";
  selected?: boolean;
  description: string;
  tags: string[];
  transcript?: string;
  quality: number;
  url?: string;
}

// =============================================================================
// Scraping Phases
// =============================================================================

const SCRAPING_PHASES = [
  {
    key: "serper",
    label: "Serper Images",
    icon: ImageIcon,
    color: "text-blue-400",
  },
  {
    key: "pexels",
    label: "Pexels Videos",
    icon: Video,
    color: "text-green-400",
  },
  { key: "youtube", label: "YouTube Clips", icon: Film, color: "text-red-400" },
];

// =============================================================================
// Component
// =============================================================================

export function Step2StockMedia({
  videoId: _videoId,
  isLoading,
  taskId,
  initialMedia,
  onMediaLoaded,
  onNext,
  onBack,
  isLocked: _isLocked = false,
  stockMediaLevel = "standard_images",
}: Step2StockMediaProps) {
  // Determine if we're in images-only mode
  const isImagesOnly =
    stockMediaLevel === "standard_images" ||
    stockMediaLevel === "extensive_images";
  // Debug logging for props
  console.log(
    `[Step2StockMedia] Render - isLoading: ${isLoading}, taskId: ${taskId}, initialMedia: ${initialMedia?.length || 0}`,
  );

  const [activeTab, setActiveTab] = useState<MediaCategory>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [mediaItems, setMediaItems] = useState<MediaItem[]>(initialMedia);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [previewItem, setPreviewItem] = useState<MediaItem | null>(null);

  // Task polling state
  const [taskStatus, setTaskStatus] = useState<string>("pending");
  const [progress, setProgress] = useState(0);
  const [currentPhase, setCurrentPhase] = useState<string | null>(null);

  // Use ref to avoid stale closure issues with onMediaLoaded callback
  const onMediaLoadedRef = useRef(onMediaLoaded);
  useEffect(() => {
    onMediaLoadedRef.current = onMediaLoaded;
  }, [onMediaLoaded]);

  // Reset taskStatus when taskId changes (new task started)
  useEffect(() => {
    if (taskId) {
      console.log(
        `[Step2] New taskId detected: ${taskId}, resetting taskStatus`,
      );
      setTaskStatus("pending");
      setProgress(0);
      setCurrentPhase(null);
    }
  }, [taskId]);

  // Supabase client for polling
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  // Map worker output format to frontend MediaItem format
  const mapWorkerMedia = (workerMedia: any[]): MediaItem[] => {
    return workerMedia.map((m) => ({
      id: m.id,
      type: m.type,
      name: m.title || m.name || "Untitled", // Worker uses 'title', frontend expects 'name'
      thumbnail: m.thumbnailUrl || m.thumbnail || null, // Worker uses 'thumbnailUrl', frontend expects 'thumbnail'
      duration: m.duration ? formatDuration(m.duration) : undefined,
      durationSeconds: typeof m.duration === "number" ? m.duration : undefined,
      source: m.source,
      description: m.description || "",
      tags: m.classification?.subjects || [],
      quality: m.qualityRating || m.quality || 70,
      url: m.url,
    }));
  };

  // Helper to format duration
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Poll for task updates
  const fetchTaskStatus = useCallback(
    async (id: string) => {
      console.log(`[Step2] Polling task ${id}...`);

      const { data: statusData, error: statusError } = await supabase
        .from("tasks")
        .select(
          "status, progress_percent, current_phase, current_step, output_data",
        )
        .eq("id", id)
        .single();

      if (statusError) {
        // PGRST116 = no rows found - task might not be created yet
        if (statusError.code === "PGRST116") {
          console.log("[Step2] Task not found yet, waiting...");
          return;
        }
        console.error(
          "[Step2] Failed to fetch task status:",
          statusError?.message || statusError,
        );
        return;
      }

      console.log(
        `[Step2] Task status: ${statusData.status}, progress: ${statusData.progress_percent}%`,
      );

      setTaskStatus(statusData.status);
      setProgress(statusData.progress_percent || 0);
      setCurrentPhase(statusData.current_phase || statusData.current_step);

      if (statusData.status === "completed" && statusData.output_data) {
        // Task completed - extract and map media results
        const rawMedia = statusData.output_data?.media || [];
        const results = mapWorkerMedia(rawMedia);
        console.log(
          `[Step2] Task completed with ${results.length} media items`,
        );
        setMediaItems(results);
        // Use ref to call callback to avoid stale closure
        onMediaLoadedRef.current(results);
      } else if (statusData.status === "failed") {
        console.error("[Step2] Task failed");
        onMediaLoadedRef.current([]); // Signal completion with empty results
      }
    },
    [supabase], // Removed onMediaLoaded from deps, using ref instead
  );

  // Polling effect - continue polling until task completes or fails
  useEffect(() => {
    if (!taskId) {
      console.log("[Step2] No taskId, skipping poll");
      return;
    }

    // If task already completed or failed, don't poll
    if (taskStatus === "completed" || taskStatus === "failed") {
      console.log(`[Step2] Task already ${taskStatus}, stopping poll`);
      return;
    }

    console.log(`[Step2] Starting poll interval for taskId: ${taskId}`);

    // Initial fetch
    fetchTaskStatus(taskId);

    const interval = setInterval(() => {
      fetchTaskStatus(taskId);
    }, 2000);

    return () => {
      console.log(`[Step2] Clearing poll interval for taskId: ${taskId}`);
      clearInterval(interval);
    };
  }, [taskId, taskStatus, fetchTaskStatus]);

  // Update media when initial data changes
  useEffect(() => {
    if (initialMedia.length > 0) {
      setMediaItems(initialMedia);
    }
  }, [initialMedia]);

  // Filter media based on active tab and search
  const filteredMedia = useMemo(() => {
    return mediaItems.filter((item) => {
      const tabFilter =
        activeTab === "all"
          ? true
          : activeTab === "uploaded"
            ? item.source === "uploaded"
            : item.type === activeTab;
      const matchesSearch =
        searchQuery === "" ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.tags.some((tag) =>
          tag.toLowerCase().includes(searchQuery.toLowerCase()),
        );
      return tabFilter && matchesSearch;
    });
  }, [mediaItems, activeTab, searchQuery]);

  // Toggle selection
  const toggleSelection = (id: string) => {
    setMediaItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, selected: !item.selected } : item,
      ),
    );
  };

  // Statistics
  const stats = useMemo(() => {
    const videos = mediaItems.filter((m) => m.type === "video");
    const images = mediaItems.filter((m) => m.type === "image");
    const audios = mediaItems.filter((m) => m.type === "audio");

    const totalVideoDuration = videos.reduce(
      (acc, v) => acc + (v.durationSeconds || 0),
      0,
    );
    const totalAudioDuration = audios.reduce(
      (acc, a) => acc + (a.durationSeconds || 0),
      0,
    );

    const formatDuration = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      if (mins === 0) return `${secs}s`;
      return secs === 0 ? `${mins}m` : `${mins}m ${secs}s`;
    };

    return {
      videoCount: videos.length,
      videoDuration: formatDuration(totalVideoDuration),
      imageCount: images.length,
      audioCount: audios.length,
      audioDuration: formatDuration(totalAudioDuration),
    };
  }, [mediaItems]);

  // Category counts
  const counts = {
    all: mediaItems.length,
    video: mediaItems.filter((m) => m.type === "video").length,
    image: mediaItems.filter((m) => m.type === "image").length,
    audio: mediaItems.filter((m) => m.type === "audio").length,
    uploaded: mediaItems.filter((m) => m.source === "uploaded").length,
  };

  // Get quality color
  const getQualityColor = (score: number) => {
    if (score >= 90) return "text-green-400";
    if (score >= 70) return "text-yellow-400";
    return "text-red-400";
  };

  const getQualityBg = (score: number) => {
    if (score >= 90) return "bg-green-500";
    if (score >= 70) return "bg-yellow-500";
    return "bg-red-500";
  };

  // Get current phase index for progress display
  const _getCurrentPhaseIndex = () => {
    const idx = SCRAPING_PHASES.findIndex((p) =>
      currentPhase?.toLowerCase().includes(p.key.toLowerCase()),
    );
    return idx >= 0 ? idx : 0;
  };

  // =========================================================================
  // RENDER: LOADING VIEW
  // =========================================================================
  if (isLoading) {
    // Determine which phases are active based on mode
    // Pexels is currently disabled, so only serper is active for images-only
    // For video modes, serper + youtube would be active
    const activePhaseKeys = isImagesOnly
      ? ["serper"] // Only Serper for images-only mode
      : ["serper", "youtube"]; // Pexels is disabled, so just serper + youtube

    // Get current phase index based on active phases only
    const getActivePhaseIndex = () => {
      const activePhases = SCRAPING_PHASES.filter((p) =>
        activePhaseKeys.includes(p.key),
      );
      const idx = activePhases.findIndex((p) =>
        currentPhase?.toLowerCase().includes(p.key.toLowerCase()),
      );
      return idx >= 0 ? idx : 0;
    };

    const phaseIndex = getActivePhaseIndex();

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
            {isImagesOnly
              ? "Collecting Stock Images"
              : "Collecting Stock Media"}
          </h2>
          <p className="text-neutral-500 text-sm">
            {currentPhase || "Initializing..."}
          </p>
        </div>

        {/* Progress bar */}
        <div className="w-full max-w-md">
          <Progress value={progress} className="h-2" />
          <div className="flex justify-between mt-2 text-[10px] font-mono text-neutral-500">
            <span>
              {taskStatus === "running" ? "Scraping..." : "Initializing..."}
            </span>
            <span>{progress}%</span>
          </div>
        </div>

        {/* Phase checklist */}
        <div className="w-full max-w-md bg-neutral-900/50 border border-neutral-800 rounded-lg p-4">
          <div className="space-y-3">
            {SCRAPING_PHASES.map((phase, _index) => {
              const PhaseIcon = phase.icon;
              const isPhaseActive = activePhaseKeys.includes(phase.key);
              const isSkipped = !isPhaseActive;

              // For active phases, calculate their position in active phases array
              const activePhases = SCRAPING_PHASES.filter((p) =>
                activePhaseKeys.includes(p.key),
              );
              const activeIndex = activePhases.findIndex(
                (p) => p.key === phase.key,
              );
              const isCompleted = isPhaseActive && activeIndex < phaseIndex;
              const isCurrent = isPhaseActive && activeIndex === phaseIndex;

              return (
                <div
                  key={phase.key}
                  className={cn(
                    "flex items-center gap-3 text-sm transition-all duration-300",
                    isSkipped
                      ? "text-neutral-500 opacity-50"
                      : isCompleted
                        ? "text-green-500"
                        : isCurrent
                          ? "text-orange-500"
                          : "text-neutral-600",
                  )}
                >
                  <div
                    className={cn(
                      "w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300",
                      isSkipped
                        ? "bg-neutral-800/50 border border-neutral-700/50"
                        : isCompleted
                          ? "bg-green-500/20 border border-green-500"
                          : isCurrent
                            ? "bg-orange-500/20 border border-orange-500"
                            : "bg-neutral-800 border border-neutral-700",
                    )}
                  >
                    {isSkipped ? (
                      <X className="w-3 h-3 text-neutral-600" />
                    ) : isCompleted ? (
                      <CheckCircle className="w-3 h-3" />
                    ) : isCurrent ? (
                      <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                    ) : (
                      <div className="w-2 h-2 bg-neutral-600 rounded-full" />
                    )}
                  </div>
                  <PhaseIcon
                    className={cn(
                      "w-4 h-4",
                      isSkipped ? "text-neutral-600" : phase.color,
                    )}
                  />
                  <span
                    className={cn(
                      isCurrent ? "font-medium" : "",
                      isSkipped ? "line-through" : "",
                    )}
                  >
                    {phase.label}
                  </span>
                  {isSkipped && (
                    <span className="text-[10px] text-neutral-600 uppercase tracking-wider ml-auto">
                      Skipped
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-xs text-neutral-600 font-mono">
          {isImagesOnly
            ? "Collecting images only (videos disabled)..."
            : "AI-powered quality filtering active..."}
        </p>
      </div>
    );
  }

  // =========================================================================
  // RENDER: MEDIA LIBRARY VIEW
  // =========================================================================
  return (
    <div className="flex h-[calc(100vh-160px)] gap-4 w-full px-6 py-6">
      {/* LEFT SIDEBAR */}
      <div className="w-56 shrink-0 flex flex-col gap-4 h-full">
        {/* Header */}
        <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-5 shrink-0">
          <div className="space-y-1">
            <h2 className="text-xl font-bold tracking-tight text-white">
              Stock Media
            </h2>
            <p className="text-neutral-500 text-xs">
              {mediaItems.length > 0
                ? `${mediaItems.length} items collected`
                : "No media collected yet"}
            </p>
          </div>
        </div>

        {/* Statistics */}
        <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-4 flex-1 flex flex-col gap-3">
          <div className="text-[10px] text-neutral-500 uppercase tracking-wider font-medium px-1">
            Library Statistics
          </div>

          <div className="flex-1 flex flex-col gap-3">
            {/* Videos */}
            <div className="flex-1 p-4 bg-neutral-800/50 rounded-lg flex flex-col items-center justify-center">
              <div className="flex items-center gap-2 mb-2">
                <Film className="w-5 h-5 text-blue-400" />
                <span className="text-sm text-neutral-400">Videos</span>
              </div>
              <div className="text-3xl font-mono font-bold text-white">
                {stats.videoCount}
              </div>
              <div className="text-xs text-neutral-500 mt-1">
                {stats.videoDuration}
              </div>
            </div>

            {/* Images */}
            <div className="flex-1 p-4 bg-neutral-800/50 rounded-lg flex flex-col items-center justify-center">
              <div className="flex items-center gap-2 mb-2">
                <Image className="w-5 h-5 text-green-400" />
                <span className="text-sm text-neutral-400">Images</span>
              </div>
              <div className="text-3xl font-mono font-bold text-white">
                {stats.imageCount}
              </div>
              <div className="text-xs text-neutral-500 mt-1">files</div>
            </div>

            {/* Audio */}
            <div className="flex-1 p-4 bg-neutral-800/50 rounded-lg flex flex-col items-center justify-center">
              <div className="flex items-center gap-2 mb-2">
                <Music className="w-5 h-5 text-purple-400" />
                <span className="text-sm text-neutral-400">Audio</span>
              </div>
              <div className="text-3xl font-mono font-bold text-white">
                {stats.audioCount}
              </div>
              <div className="text-xs text-neutral-500 mt-1">
                {stats.audioDuration}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 bg-neutral-900/50 border border-neutral-800 rounded-xl overflow-hidden flex flex-col h-full">
        {/* Content Header */}
        <div className="shrink-0 p-4 border-b border-neutral-800 bg-neutral-900/30">
          <div className="flex items-center gap-4">
            {/* Category Tabs */}
            <div className="flex gap-1 bg-neutral-800/50 p-1 rounded-lg">
              {(
                [
                  "all",
                  "video",
                  "image",
                  "audio",
                  "uploaded",
                ] as MediaCategory[]
              ).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all capitalize",
                    activeTab === tab
                      ? "bg-neutral-700 text-white"
                      : "text-neutral-400 hover:text-white hover:bg-neutral-700/50",
                  )}
                >
                  {tab === "video" && <Film className="w-3.5 h-3.5" />}
                  {tab === "image" && <Image className="w-3.5 h-3.5" />}
                  {tab === "audio" && <Music className="w-3.5 h-3.5" />}
                  {tab === "all" && <Grid3X3 className="w-3.5 h-3.5" />}
                  {tab === "uploaded" && <Upload className="w-3.5 h-3.5" />}
                  <span>{tab}</span>
                  <span className="text-neutral-500">({counts[tab]})</span>
                </button>
              ))}
            </div>

            {/* Search + Upload */}
            <div className="flex items-center gap-2 ml-auto">
              <Button
                onClick={() => setUploadDialogOpen(true)}
                className="h-9 px-4 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold uppercase tracking-wider gap-1.5"
              >
                <Plus className="w-4 h-4" />
                Upload
              </Button>

              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search media..."
                  className="pl-9 h-9 bg-neutral-800/50 border-neutral-700 text-sm focus:border-orange-500/50"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Media Grid */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
          {filteredMedia.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 bg-neutral-800 rounded-xl flex items-center justify-center mb-4">
                <Search className="w-8 h-8 text-neutral-600" />
              </div>
              <h3 className="text-lg font-medium text-neutral-300 mb-2">
                No media found
              </h3>
              <p className="text-neutral-500 text-sm max-w-md">
                {searchQuery
                  ? `No results for "${searchQuery}"`
                  : mediaItems.length === 0
                    ? "Stock media will appear here after scraping completes."
                    : "No media available in this category."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredMedia.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setPreviewItem(item)}
                  className={cn(
                    "group relative rounded-xl overflow-hidden cursor-pointer transition-all duration-200 bg-neutral-800/50 border",
                    item.selected
                      ? "border-orange-500 ring-2 ring-orange-500/30"
                      : "border-neutral-700/50 hover:border-neutral-600",
                  )}
                >
                  {/* Thumbnail */}
                  <div className="aspect-video relative">
                    {item.thumbnail ? (
                      <img
                        src={item.thumbnail}
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-purple-900/50 to-neutral-900 flex items-center justify-center">
                        <Music className="w-10 h-10 text-purple-400/50" />
                      </div>
                    )}

                    {/* Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60 group-hover:opacity-80 transition-opacity" />

                    {/* Type Badge */}
                    <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 bg-black/60 backdrop-blur-sm rounded-md text-[10px] text-white border border-white/10">
                      {item.type === "video" && <Film className="w-3 h-3" />}
                      {item.type === "image" && <Image className="w-3 h-3" />}
                      {item.type === "audio" && <Music className="w-3 h-3" />}
                      <span className="uppercase">{item.type}</span>
                    </div>

                    {/* Source Badge */}
                    <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/60 backdrop-blur-sm rounded text-[9px] text-neutral-300 border border-white/10 uppercase">
                      {item.source}
                    </div>

                    {/* Duration Badge */}
                    {item.duration && (
                      <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 bg-black/60 backdrop-blur-sm rounded-md text-[10px] text-white border border-white/10">
                        <Clock className="w-3 h-3" />
                        {item.duration}
                      </div>
                    )}

                    {/* Selection Indicator */}
                    {item.selected && (
                      <div className="absolute top-2 right-2 w-6 h-6 bg-orange-500 rounded-md flex items-center justify-center">
                        <Check className="w-4 h-4 text-white" />
                      </div>
                    )}

                    {/* Hover overlay */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="p-2.5 bg-white/20 backdrop-blur-sm rounded-lg">
                        <Eye className="w-5 h-5 text-white" />
                      </div>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-3">
                    <p className="font-medium text-white text-sm truncate mb-1">
                      {item.name}
                    </p>
                    <p className="text-xs text-neutral-400 line-clamp-2 leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="shrink-0 p-4 border-t border-neutral-800 bg-neutral-900/30 flex justify-between">
          <Button
            variant="ghost"
            onClick={onBack}
            className="text-neutral-400 hover:text-white"
          >
            Back
          </Button>
          <Button
            onClick={onNext}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            Continue to Script
          </Button>
        </div>
      </div>

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="bg-neutral-900 border-neutral-800 text-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload Media</DialogTitle>
            <DialogDescription className="text-neutral-400">
              Upload your own video, image, or audio files.
            </DialogDescription>
          </DialogHeader>

          <div className="py-6 space-y-4">
            <div className="border-2 border-dashed border-neutral-700 hover:border-orange-500/50 rounded-xl p-8 text-center transition-colors cursor-pointer group">
              <div className="w-12 h-12 bg-neutral-800 group-hover:bg-orange-500/20 rounded-xl flex items-center justify-center mx-auto mb-3 transition-colors">
                <Upload className="w-6 h-6 text-neutral-500 group-hover:text-orange-500 transition-colors" />
              </div>
              <p className="text-neutral-300 font-medium mb-1 text-sm">
                Drop files here or click to browse
              </p>
              <p className="text-neutral-500 text-xs">
                MP4, MOV, JPG, PNG, MP3, WAV
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button
              variant="ghost"
              onClick={() => setUploadDialogOpen(false)}
              className="text-neutral-300 hover:bg-neutral-800"
            >
              Cancel
            </Button>
            <Button
              onClick={() => setUploadDialogOpen(false)}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              Upload
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewItem} onOpenChange={() => setPreviewItem(null)}>
        <DialogContent className="bg-neutral-900 border-neutral-800 text-white sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-3">
              {previewItem?.type === "video" && (
                <Film className="w-5 h-5 text-blue-400" />
              )}
              {previewItem?.type === "image" && (
                <Image className="w-5 h-5 text-green-400" />
              )}
              {previewItem?.type === "audio" && (
                <Music className="w-5 h-5 text-purple-400" />
              )}
              {previewItem?.name}
            </DialogTitle>
            <DialogDescription className="text-neutral-400 capitalize">
              {previewItem?.type} • {previewItem?.source}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-4 space-y-4">
            {/* Preview */}
            {previewItem?.thumbnail ? (
              <div className="aspect-video bg-black rounded-lg overflow-hidden relative">
                <img
                  src={previewItem.thumbnail}
                  alt={previewItem.name}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div className="aspect-video bg-gradient-to-br from-purple-900/30 to-neutral-900 rounded-lg flex flex-col items-center justify-center gap-4">
                <Music className="w-16 h-16 text-purple-500/50" />
              </div>
            )}

            {/* Description */}
            <div className="space-y-2">
              <p className="text-neutral-300 text-sm leading-relaxed">
                {previewItem?.description}
              </p>
            </div>

            {/* Tags */}
            {previewItem?.tags && previewItem.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {previewItem.tags.map((tag, i) => (
                  <span
                    key={i}
                    className="px-2.5 py-1 bg-neutral-800 rounded-full text-xs text-neutral-300"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Quality */}
            <div className="p-3 bg-neutral-800/50 rounded-lg">
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-yellow-400" />
                <span className="text-sm text-neutral-400">Quality Score:</span>
                <span
                  className={cn(
                    "font-mono font-bold",
                    getQualityColor(previewItem?.quality || 0),
                  )}
                >
                  {previewItem?.quality}
                </span>
                <div className="flex-1 h-2 bg-neutral-700 rounded-full overflow-hidden ml-2">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      getQualityBg(previewItem?.quality || 0),
                    )}
                    style={{ width: `${previewItem?.quality || 0}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="shrink-0 flex justify-between items-center pt-4 border-t border-neutral-800">
            <Button
              variant="ghost"
              onClick={() => setPreviewItem(null)}
              className="text-neutral-300 hover:bg-neutral-800"
            >
              Close
            </Button>
            <Button
              onClick={() => {
                if (previewItem) {
                  toggleSelection(previewItem.id);
                  setPreviewItem(null);
                }
              }}
              className={cn(
                previewItem?.selected
                  ? "bg-neutral-700 hover:bg-neutral-600 text-white"
                  : "bg-orange-500 hover:bg-orange-600 text-white",
              )}
            >
              {previewItem?.selected ? (
                <>
                  <X className="w-4 h-4 mr-2" />
                  Deselect
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Select
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
