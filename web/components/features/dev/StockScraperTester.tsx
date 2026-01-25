"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Download,
  X,
  Globe,
  Youtube,
  ArrowLeft,
  Search,
  Database,
  Sparkles,
  Loader2,
  Check,
  XCircle,
  Trash2,
  Play,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
} from "lucide-react";
import { useState, useEffect } from "react";
import type {
  WikimediaImage,
  WikimediaScrapeResult,
} from "@/lib/wikimedia/types";

interface StockScraperTesterProps {
  isOpen: boolean;
  onClose: () => void;
  inline?: boolean;
}

type TabType =
  | "wikimedia"
  | "youtube"
  | "pexels"
  | "classify"
  | "search"
  | "debug";

export function StockScraperTester({
  isOpen,
  onClose,
  inline = false,
}: StockScraperTesterProps) {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("wikimedia");

  /* --------------------------------------------------------------------------------
   * Pexels State
   * -------------------------------------------------------------------------------- */
  const [pexelsQuery, setPexelsQuery] = useState("");
  const [pexelsMediaType, setPexelsMediaType] = useState<"photo" | "video">(
    "photo",
  );
  const [pexelsMaxResults, setPexelsMaxResults] = useState(20);
  const [pexelsResults, setPexelsResults] = useState<any[]>([]);
  const [isPexelsSearching, setIsPexelsSearching] = useState(false);
  const [pexelsError, setPexelsError] = useState<string | null>(null);
  const [pexelsProcessingItems, setPexelsProcessingItems] = useState<
    Set<number>
  >(new Set());
  const [pexelsProcessedItems, setPexelsProcessedItems] = useState<
    Map<number, any>
  >(new Map());

  // Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Classification State
  const [classifyUrl, setClassifyUrl] = useState("");
  const [classifyType, setClassifyType] = useState<"image" | "video" | "audio">(
    "image",
  );
  const [isClassifying, setIsClassifying] = useState(false);
  const [classificationResult, setClassificationResult] = useState<any>(null);
  const [classifyError, setClassifyError] = useState<string | null>(null);
  const [classifyStage, setClassifyStage] = useState<string>("");
  const [classifyElapsed, setClassifyElapsed] = useState(0);

  // Processing State (after approval)
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingJobId, setProcessingJobId] = useState<string | null>(null);
  const [processingProgress, setProcessingProgress] = useState<any>(null);
  const [processingError, setProcessingError] = useState<string | null>(null);

  // yt-dlp Check State
  const [ytdlpStatus, setYtdlpStatus] = useState<any>(null);
  const [isCheckingYtdlp, setIsCheckingYtdlp] = useState(false);

  // R2 Clear State
  const [isClearingR2, setIsClearingR2] = useState(false);
  const [r2ClearResult, setR2ClearResult] = useState<{
    deleted: number;
  } | null>(null);

  // Vector DB Clear State
  const [isClearingVectorDB, setIsClearingVectorDB] = useState(false);
  const [vectorDBClearResult, setVectorDBClearResult] = useState<{
    deleted: number;
  } | null>(null);

  // Clips Viewer State (after processing complete)
  const [processedClips, setProcessedClips] = useState<any[]>([]);
  const [selectedClipIndex, setSelectedClipIndex] = useState(0);

  // Filter Prompt State
  const [filterPrompt, setFilterPrompt] = useState("");

  // Debug State
  const [debugData, setDebugData] = useState<any>(null);
  const [isLoadingDebug, setIsLoadingDebug] = useState(false);
  const [debugError, setDebugError] = useState<string | null>(null);

  // Wikimedia State
  const [wikimediaQuery, setWikimediaQuery] = useState("");
  const [wikimediaMaxResults, setWikimediaMaxResults] = useState(20);
  const [wikimediaMinWidth, setWikimediaMinWidth] = useState<
    number | undefined
  >(undefined);
  const [wikimediaMinHeight, setWikimediaMinHeight] = useState<
    number | undefined
  >(undefined);
  const [wikimediaAspectRatio, setWikimediaAspectRatio] = useState<
    "landscape" | "portrait" | "square" | "any"
  >("any");
  const [wikimediaResults, setWikimediaResults] = useState<WikimediaImage[]>(
    [],
  );
  const [wikimediaSelected, setWikimediaSelected] = useState<Set<number>>(
    new Set(),
  );
  const [isSearchingWikimedia, setIsSearchingWikimedia] = useState(false);
  const [isScrapingWikimedia, setIsScrapingWikimedia] = useState(false);
  const [wikimediaScrapeResult, setWikimediaScrapeResult] =
    useState<WikimediaScrapeResult | null>(null);
  const [wikimediaError, setWikimediaError] = useState<string | null>(null);
  const [showWikimediaFilters, setShowWikimediaFilters] = useState(false);

  /* --------------------------------------------------------------------------------
   * YouTube Data API State
   * -------------------------------------------------------------------------------- */
  const [ytQuery, setYtQuery] = useState("");
  const [ytResults, setYtResults] = useState<any[]>([]);
  const [isYtSearching, setIsYtSearching] = useState(false);
  const [ytError, setYtError] = useState<string | null>(null);
  const [ytMaxResults, setYtMaxResults] = useState(10);
  const [ytDuration, setYtDuration] = useState<
    "any" | "short" | "medium" | "long"
  >("any");
  const [ytLicense, setYtLicense] = useState<
    "any" | "creativeCommon" | "youtube"
  >("any");
  const [ytDefinition, setYtDefinition] = useState<"any" | "high" | "standard">(
    "any",
  );
  const [showYtFilters, setShowYtFilters] = useState(false);
  const [ytProcessingItems, setYtProcessingItems] = useState<Set<string>>(
    new Set(),
  );
  const [ytGcpRequired, setYtGcpRequired] = useState(false);

  /* --------------------------------------------------------------------------------
   * Pexels Handlers
   * -------------------------------------------------------------------------------- */
  const handlePexelsSearch = async () => {
    if (!pexelsQuery.trim()) return;

    setIsPexelsSearching(true);
    setPexelsError(null);
    setPexelsResults([]);

    try {
      const params = new URLSearchParams({
        q: pexelsQuery,
        mediaType: pexelsMediaType,
        maxResults: pexelsMaxResults.toString(),
      });

      const res = await fetch(`/api/pexels/search?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Search failed");

      setPexelsResults(data.hits || []);
    } catch (error) {
      console.error("Pexels search failed:", error);
      setPexelsError(error instanceof Error ? error.message : "Search failed");
    } finally {
      setIsPexelsSearching(false);
    }
  };

  const handlePexelsProcess = async (item: any) => {
    if (pexelsProcessingItems.has(item.id)) return;

    setPexelsProcessingItems((prev) => new Set(prev).add(item.id));

    try {
      // Determine download URL (different structure for photos vs videos)
      let downloadUrl: string;
      let thumbnailUrl = item.previewURL;

      if (pexelsMediaType === "video" && item.video_files) {
        // Prefer HD quality, fallback to SD
        const hdFile = item.video_files.find((f: any) => f.quality === "hd");
        const sdFile = item.video_files.find((f: any) => f.quality === "sd");
        downloadUrl = hdFile?.link || sdFile?.link || item.video_files[0]?.link;
        thumbnailUrl = item.thumbnailURL || item.previewURL;
      } else {
        // For photos, use the original or large image
        downloadUrl = item.largeImageURL || item.webformatURL;
      }

      const res = await fetch("/api/pexels/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          mediaType: pexelsMediaType,
          mediaUrl: item.url,
          downloadUrl: downloadUrl,
          thumbnailUrl: thumbnailUrl,
          photographer: item.photographer || item.user,
          alt: item.alt,
          width: item.imageWidth || item.videoWidth,
          height: item.imageHeight || item.videoHeight,
          duration: item.duration,
        }),
      });

      const result = await res.json();

      if (!result.success) {
        if (result.duplicate) {
          // Show detailed duplicate info
          const existingTitle =
            result.existingAsset?.metadata?.title || "Unknown";
          const similarity = result.existingAsset?.similarity
            ? `${(result.existingAsset.similarity * 100).toFixed(1)}%`
            : "high";
          alert(
            `🔁 Duplicate Detected\n\nThis image is ${similarity} similar to an existing asset:\n"${existingTitle}"\n\nSkipping to avoid duplicates.`,
          );
        } else if (result.rejected) {
          alert(`Quality Check Failed: ${result.reason}`);
        } else {
          throw new Error(result.error || "Processing failed");
        }
      } else {
        setPexelsProcessedItems((prev) => {
          const newMap = new Map(prev);
          newMap.set(item.id, result);
          return newMap;
        });
      }
    } catch (error) {
      console.error("Processing failed:", error);
      alert(error instanceof Error ? error.message : "Processing failed");
    } finally {
      setPexelsProcessingItems((prev) => {
        const newSet = new Set(prev);
        newSet.delete(item.id);
        return newSet;
      });
    }
  };

  const handleClassify = async () => {
    if (!classifyUrl.trim()) return;

    setIsClassifying(true);
    setClassificationResult(null);
    setClassifyError(null);
    setClassifyStage("Authenticating...");
    setClassifyElapsed(0);

    // Start elapsed time counter
    const startTime = Date.now();
    const interval = setInterval(() => {
      setClassifyElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    try {
      setClassifyStage("Connecting to Gemini 3 Flash...");

      const response = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaUrl: classifyUrl,
          mediaType: classifyType,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Classification failed");
      }

      setClassifyStage("Complete!");
      setClassificationResult(data);
    } catch (error) {
      console.error("Classification failed:", error);
      setClassifyError(
        error instanceof Error ? error.message : "Classification failed",
      );
    } finally {
      clearInterval(interval);
      setIsClassifying(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setHasSearched(false);
    setSearchError(null);

    try {
      console.log("[Search] Starting vector search for:", searchQuery);
      const { StockMediaService } = await import("@/lib/stock-media/service");
      const service = new StockMediaService();
      const results = await service.search(searchQuery);
      console.log("[Search] Found", results.length, "results");
      setSearchResults(results);
      setHasSearched(true);
    } catch (error) {
      console.error("Search failed:", error);
      setSearchError(error instanceof Error ? error.message : "Search failed");
      setHasSearched(true);
    } finally {
      setIsSearching(false);
    }
  };

  // Wikimedia Search Handler (preview only)
  const handleWikimediaSearch = async () => {
    if (!wikimediaQuery.trim()) return;

    setIsSearchingWikimedia(true);
    setWikimediaResults([]);
    setWikimediaSelected(new Set());
    setWikimediaError(null);
    setWikimediaScrapeResult(null);

    try {
      const params = new URLSearchParams({
        q: wikimediaQuery,
        max: String(wikimediaMaxResults),
        aspectRatio: wikimediaAspectRatio,
      });
      if (wikimediaMinWidth) params.set("minWidth", String(wikimediaMinWidth));
      if (wikimediaMinHeight)
        params.set("minHeight", String(wikimediaMinHeight));

      const res = await fetch(`/api/wikimedia/search?${params}`);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Search failed");

      setWikimediaResults(data.results || []);
    } catch (error) {
      console.error("[Wikimedia] Search failed:", error);
      setWikimediaError(
        error instanceof Error ? error.message : "Search failed",
      );
    } finally {
      setIsSearchingWikimedia(false);
    }
  };

  // Wikimedia Scrape Handler (classify + store)
  const handleWikimediaScrape = async () => {
    if (wikimediaSelected.size === 0 && wikimediaResults.length === 0) return;

    setIsScrapingWikimedia(true);
    setWikimediaError(null);
    setWikimediaScrapeResult(null);

    try {
      const res = await fetch("/api/wikimedia/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: wikimediaQuery,
          filters: {
            maxResults: wikimediaMaxResults,
            minWidth: wikimediaMinWidth,
            minHeight: wikimediaMinHeight,
            aspectRatio: wikimediaAspectRatio,
          },
          selectedPageIds:
            wikimediaSelected.size > 0
              ? Array.from(wikimediaSelected)
              : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Scrape failed");

      setWikimediaScrapeResult(data);
    } catch (error) {
      console.error("[Wikimedia] Scrape failed:", error);
      setWikimediaError(
        error instanceof Error ? error.message : "Scrape failed",
      );
    } finally {
      setIsScrapingWikimedia(false);
    }
  };

  // Toggle image selection
  const toggleWikimediaSelection = (pageId: number) => {
    setWikimediaSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pageId)) {
        next.delete(pageId);
      } else {
        next.add(pageId);
      }
      return next;
    });
  };

  // Select/deselect all
  const toggleAllWikimediaSelection = () => {
    if (wikimediaSelected.size === wikimediaResults.length) {
      setWikimediaSelected(new Set());
    } else {
      setWikimediaSelected(new Set(wikimediaResults.map((r) => r.pageId)));
    }
  };

  /* --------------------------------------------------------------------------------
   * YouTube Data API Handlers
   * -------------------------------------------------------------------------------- */
  const handleYouTubeSearch = async () => {
    if (!ytQuery.trim()) return;

    setIsYtSearching(true);
    setYtError(null);
    setYtResults([]);
    setYtGcpRequired(false);

    try {
      const params = new URLSearchParams({
        q: ytQuery,
        maxResults: ytMaxResults.toString(),
        videoDuration: ytDuration,
        videoLicense: ytLicense,
        videoDefinition: ytDefinition,
      });

      const res = await fetch(`/api/youtube/search?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        if (data.gcpRequired) {
          setYtGcpRequired(true);
        }
        throw new Error(data.error || "Search failed");
      }

      setYtResults(data.hits || []);
    } catch (error) {
      console.error("[YouTube] Search failed:", error);
      setYtError(error instanceof Error ? error.message : "Search failed");
    } finally {
      setIsYtSearching(false);
    }
  };

  const handleYouTubeProcess = async (video: any) => {
    if (ytProcessingItems.has(video.id)) return;

    setYtProcessingItems((prev) => new Set(prev).add(video.id));

    try {
      const res = await fetch("/api/youtube/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId: video.id,
          videoUrl: video.url,
          title: video.title,
          channelTitle: video.channelTitle,
          filterPrompt: filterPrompt || undefined,
        }),
      });

      const result = await res.json();

      if (!result.success) {
        throw new Error(result.error || "Processing failed");
      }

      // Job queued successfully - show feedback
      alert(
        `Video queued for processing!\nJob ID: ${result.jobId}\n\nCheck the Classify tab to monitor progress.`,
      );
    } catch (error) {
      console.error("[YouTube] Process failed:", error);
      alert(error instanceof Error ? error.message : "Processing failed");
    } finally {
      setYtProcessingItems((prev) => {
        const newSet = new Set(prev);
        newSet.delete(video.id);
        return newSet;
      });
    }
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  // Poll for job completion when we have a processing job ID
  useEffect(() => {
    if (!processingJobId) return;

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/segment/status?jobId=${processingJobId}`);
        if (!res.ok) return;

        const data = await res.json();

        if (data.state === "completed" && data.result?.clips) {
          clearInterval(pollInterval);
          setProcessingProgress(null);
          setProcessedClips(data.result.clips);
          setSelectedClipIndex(0);
        } else if (data.state === "failed") {
          clearInterval(pollInterval);
          setProcessingError(data.failedReason || "Job failed");
        } else if (data.progress) {
          setProcessingProgress(data.progress);
        }
      } catch (e) {
        console.error("[Poll] Error fetching job status:", e);
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [processingJobId]);

  if (!mounted || !isOpen) return null;

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
          <h2>Stock Scraper Tester</h2>
          <p>Search and download stock assets</p>
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
          <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
            <Download className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Stock Scraper</h1>
            <p className="text-sm text-neutral-400">
              Search and download stock assets
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            disabled={isClearingR2}
            onClick={async () => {
              if (
                !confirm(
                  "Clear all stock media from R2? This cannot be undone.",
                )
              )
                return;
              setIsClearingR2(true);
              setR2ClearResult(null);
              try {
                const res = await fetch("/api/stock-media/clear-storage", {
                  method: "DELETE",
                });
                const data = await res.json();
                if (data.success) {
                  setR2ClearResult({ deleted: data.data.deleted });
                  setTimeout(() => setR2ClearResult(null), 5000);
                } else {
                  alert(`Clear failed: ${data.error}`);
                }
              } catch (e) {
                alert("Clear request failed");
              } finally {
                setIsClearingR2(false);
              }
            }}
            className="text-red-400 hover:text-red-300 border-red-800/50 hover:border-red-700"
          >
            {isClearingR2 ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4 mr-2" />
            )}
            {r2ClearResult
              ? `Cleared ${r2ClearResult.deleted} files`
              : "Clear R2"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isClearingVectorDB}
            onClick={async () => {
              if (
                !confirm(
                  "Clear all stock media records from Vector DB? This cannot be undone.",
                )
              )
                return;
              setIsClearingVectorDB(true);
              setVectorDBClearResult(null);
              try {
                const res = await fetch("/api/stock-media/clear-vector-db", {
                  method: "DELETE",
                });
                const data = await res.json();
                if (data.success) {
                  setVectorDBClearResult({ deleted: data.data.deleted });
                  setTimeout(() => setVectorDBClearResult(null), 5000);
                } else {
                  alert(`Clear failed: ${data.error}`);
                }
              } catch (e) {
                alert("Clear request failed");
              } finally {
                setIsClearingVectorDB(false);
              }
            }}
            className="text-orange-400 hover:text-orange-300 border-orange-800/50 hover:border-orange-700"
          >
            {isClearingVectorDB ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Database className="w-4 h-4 mr-2" />
            )}
            {vectorDBClearResult
              ? `Cleared ${vectorDBClearResult.deleted} records`
              : "Clear Vector DB"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                const res = await fetch("/api/dev/seed-mock-vector", {
                  method: "POST",
                });
                const data = await res.json();
                if (data.success) {
                  alert("Mock data seeded! Try searching for 'dog' or 'park'.");
                } else {
                  alert(`Seeding failed: ${data.error}`);
                }
              } catch (e) {
                alert("Seeding request failed completely.");
              }
            }}
            className="text-neutral-400 hover:text-white border-neutral-800"
          >
            <Database className="w-4 h-4 mr-2" />
            Seed Mock Data
          </Button>
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
          variant={activeTab === "wikimedia" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("wikimedia")}
          className={
            activeTab === "wikimedia" ? "bg-teal-600 hover:bg-teal-700" : ""
          }
        >
          <Globe className="w-4 h-4 mr-2" />
          Wikimedia
        </Button>

        <Button
          variant={activeTab === "pexels" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("pexels")}
          className={
            activeTab === "pexels"
              ? "bg-[#05A081] hover:bg-[#048a6e] text-white"
              : ""
          }
        >
          <ImageIcon className="w-4 h-4 mr-2" />
          Pexels
        </Button>
        <Button
          variant={activeTab === "youtube" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("youtube")}
          className={
            activeTab === "youtube" ? "bg-red-600 hover:bg-red-700" : ""
          }
        >
          <Youtube className="w-4 h-4 mr-2" />
          YouTube
        </Button>
        <Button
          variant={activeTab === "classify" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("classify")}
          className={
            activeTab === "classify" ? "bg-purple-600 hover:bg-purple-700" : ""
          }
        >
          <Sparkles className="w-4 h-4 mr-2" />
          Classify
        </Button>
        <Button
          variant={activeTab === "search" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("search")}
          className={
            activeTab === "search" ? "bg-green-600 hover:bg-green-700" : ""
          }
        >
          <Search className="w-4 h-4 mr-2" />
          Search Library
        </Button>
        <Button
          variant={activeTab === "debug" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("debug")}
          className={
            activeTab === "debug" ? "bg-orange-600 hover:bg-orange-700" : ""
          }
        >
          <Database className="w-4 h-4 mr-2" />
          Debug DB
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto touch-auto relative z-0 pointer-events-auto transition-all">
          <div className="max-w-2xl mx-auto p-6 relative z-10">
            {/* Pexels Tab */}
            {activeTab === "pexels" && (
              <div className="space-y-6">
                <div className="p-6 rounded-lg border border-neutral-800 bg-neutral-900/50 flex flex-col items-center justify-center space-y-4">
                  <div className="h-16 w-16 rounded-full bg-[#05A081]/20 flex items-center justify-center">
                    <ImageIcon className="w-8 h-8 text-[#05A081]" />
                  </div>
                  <h3 className="text-lg font-medium text-white">
                    Pexels Search
                  </h3>
                  <p className="text-neutral-400 text-center max-w-sm">
                    Search for high-quality royalty-free photos and videos.
                  </p>

                  <div className="w-full max-w-md space-y-4 pt-4">
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={
                          pexelsMediaType === "photo" ? "default" : "outline"
                        }
                        onClick={() => setPexelsMediaType("photo")}
                        className={
                          pexelsMediaType === "photo"
                            ? "bg-[#05A081] hover:bg-[#048a6e]"
                            : "border-neutral-700"
                        }
                      >
                        Photos
                      </Button>
                      <Button
                        size="sm"
                        variant={
                          pexelsMediaType === "video" ? "default" : "outline"
                        }
                        onClick={() => setPexelsMediaType("video")}
                        className={
                          pexelsMediaType === "video"
                            ? "bg-[#05A081] hover:bg-[#048a6e]"
                            : "border-neutral-700"
                        }
                      >
                        Videos
                      </Button>
                      <div className="flex-1 flex items-center justify-end gap-2 text-sm text-neutral-400">
                        <span>Max:</span>
                        <Input
                          type="number"
                          min={5}
                          max={80}
                          value={pexelsMaxResults}
                          onChange={(e) =>
                            setPexelsMaxResults(parseInt(e.target.value) || 20)
                          }
                          className="w-16 h-8 bg-neutral-900 border-neutral-700"
                        />
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Input
                        placeholder={`Search ${pexelsMediaType}s...`}
                        className="bg-neutral-900 border-neutral-700 text-neutral-200"
                        value={pexelsQuery}
                        onChange={(e) => setPexelsQuery(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === "Enter" && handlePexelsSearch()
                        }
                      />
                      <Button
                        className="bg-[#05A081] hover:bg-[#048a6e]"
                        onClick={handlePexelsSearch}
                        disabled={isPexelsSearching}
                      >
                        {isPexelsSearching ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Search className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Error */}
                {pexelsError && (
                  <div className="p-4 rounded-lg border border-red-500/50 bg-red-500/10 text-red-400">
                    {pexelsError}
                  </div>
                )}

                {/* Results Grid */}
                {pexelsResults.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {pexelsResults.map((item) => {
                      const isProcessing = pexelsProcessingItems.has(item.id);
                      const processed = pexelsProcessedItems.get(item.id);

                      return (
                        <div
                          key={item.id}
                          className="group relative aspect-video bg-neutral-800 rounded-lg overflow-hidden border border-neutral-700"
                        >
                          <img
                            src={item.previewURL}
                            alt={item.alt || "Pexels media"}
                            className={`w-full h-full object-cover transition-opacity ${isProcessing ? "opacity-50" : ""}`}
                          />

                          {/* Processing Overlay */}
                          {isProcessing && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                              <Loader2 className="w-8 h-8 text-[#05A081] animate-spin" />
                            </div>
                          )}

                          {/* Processed Badge */}
                          {processed && (
                            <div className="absolute top-2 right-2 bg-purple-600/90 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                              <Sparkles className="w-3 h-3" />
                              {processed.qualityRating}/10
                            </div>
                          )}

                          {/* Action Overlay */}
                          {!processed && !isProcessing && (
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                              <Button
                                size="sm"
                                className="bg-[#05A081] hover:bg-[#048a6e]"
                                onClick={() => handlePexelsProcess(item)}
                              >
                                <Sparkles className="w-4 h-4 mr-2" />
                                Process
                              </Button>
                            </div>
                          )}

                          <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/90 to-transparent pointer-events-none">
                            <p className="text-sm font-medium text-white truncate">
                              {item.alt || item.photographer || "Untitled"}
                            </p>
                            <div className="flex justify-between items-center text-xs text-neutral-400 mt-1">
                              <span>
                                by {item.photographer || item.user || "Unknown"}
                              </span>
                              {pexelsMediaType === "video" && item.duration && (
                                <span className="flex items-center gap-1">
                                  <Play className="w-3 h-3" /> {item.duration}s
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Wikimedia Tab */}
            {activeTab === "wikimedia" && (
              <div className="space-y-6">
                {/* Search Header */}
                <div className="p-6 rounded-lg border border-neutral-800 bg-neutral-900/50 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-teal-500/20 flex items-center justify-center">
                      <Globe className="w-6 h-6 text-teal-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-medium text-white">
                        Wikimedia Commons
                      </h3>
                      <p className="text-sm text-neutral-400">
                        Search and import free-to-use images with AI quality
                        filtering
                      </p>
                    </div>
                  </div>

                  {/* Search Input */}
                  <div className="flex gap-2">
                    <Input
                      placeholder="Search images (e.g., 'mountain landscape')"
                      className="bg-neutral-900 border-neutral-700 text-neutral-200"
                      value={wikimediaQuery}
                      onChange={(e) => setWikimediaQuery(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && handleWikimediaSearch()
                      }
                    />
                    <Button
                      className="bg-teal-600 hover:bg-teal-700"
                      onClick={handleWikimediaSearch}
                      disabled={isSearchingWikimedia || !wikimediaQuery.trim()}
                    >
                      {isSearchingWikimedia ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Search className="w-4 h-4" />
                      )}
                    </Button>
                  </div>

                  {/* Filter Section */}
                  <div className="space-y-3">
                    <button
                      onClick={() =>
                        setShowWikimediaFilters(!showWikimediaFilters)
                      }
                      className="text-sm text-teal-400 hover:text-teal-300 flex items-center gap-1"
                    >
                      {showWikimediaFilters ? "Hide" : "Show"} Filters
                    </button>

                    {showWikimediaFilters && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-neutral-800/50 rounded-lg">
                        <div>
                          <label className="text-xs text-neutral-500 block mb-1">
                            Max Results
                          </label>
                          <Input
                            type="number"
                            min={5}
                            max={50}
                            value={wikimediaMaxResults}
                            onChange={(e) =>
                              setWikimediaMaxResults(
                                parseInt(e.target.value) || 20,
                              )
                            }
                            className="h-8 bg-neutral-900 border-neutral-700 text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-neutral-500 block mb-1">
                            Min Width (px)
                          </label>
                          <Input
                            type="number"
                            min={0}
                            placeholder="Any"
                            value={wikimediaMinWidth || ""}
                            onChange={(e) =>
                              setWikimediaMinWidth(
                                e.target.value
                                  ? parseInt(e.target.value)
                                  : undefined,
                              )
                            }
                            className="h-8 bg-neutral-900 border-neutral-700 text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-neutral-500 block mb-1">
                            Min Height (px)
                          </label>
                          <Input
                            type="number"
                            min={0}
                            placeholder="Any"
                            value={wikimediaMinHeight || ""}
                            onChange={(e) =>
                              setWikimediaMinHeight(
                                e.target.value
                                  ? parseInt(e.target.value)
                                  : undefined,
                              )
                            }
                            className="h-8 bg-neutral-900 border-neutral-700 text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-neutral-500 block mb-1">
                            Aspect Ratio
                          </label>
                          <select
                            value={wikimediaAspectRatio}
                            onChange={(e) =>
                              setWikimediaAspectRatio(e.target.value as any)
                            }
                            className="w-full h-8 bg-neutral-900 border border-neutral-700 rounded-md text-sm text-neutral-200 px-2"
                          >
                            <option value="any">Any</option>
                            <option value="landscape">Landscape</option>
                            <option value="portrait">Portrait</option>
                            <option value="square">Square</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Error Display */}
                {wikimediaError && (
                  <div className="p-4 rounded-lg border border-red-500/50 bg-red-500/10 text-red-400">
                    {wikimediaError}
                  </div>
                )}

                {/* Scrape Result */}
                {wikimediaScrapeResult && (
                  <div className="p-4 rounded-lg border border-green-500/50 bg-green-500/10 space-y-2">
                    <div className="flex items-center gap-2 text-green-400 font-medium">
                      <Check className="w-5 h-5" />
                      Import Complete
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-neutral-400">Processed:</span>{" "}
                        <span className="text-white">
                          {wikimediaScrapeResult.processed}
                        </span>
                      </div>
                      <div>
                        <span className="text-green-400">Approved:</span>{" "}
                        <span className="text-white">
                          {wikimediaScrapeResult.approved}
                        </span>
                      </div>
                      <div>
                        <span className="text-red-400">Rejected:</span>{" "}
                        <span className="text-white">
                          {wikimediaScrapeResult.rejected}
                        </span>
                      </div>
                    </div>
                    {wikimediaScrapeResult.rejectedDetails &&
                      wikimediaScrapeResult.rejectedDetails.length > 0 && (
                        <details className="mt-2">
                          <summary className="text-xs text-neutral-400 cursor-pointer">
                            View rejected images
                          </summary>
                          <ul className="mt-2 text-xs space-y-1">
                            {wikimediaScrapeResult.rejectedDetails.map(
                              (r: any, i: number) => (
                                <li
                                  key={i}
                                  className={
                                    (r as any).isDuplicate
                                      ? "text-blue-400"
                                      : "text-neutral-500"
                                  }
                                >
                                  {(r as any).isDuplicate && "🔁 "}
                                  {r.title}: {r.reason}
                                  {(r as any).isDuplicate &&
                                    (r as any).existingAsset?.metadata
                                      ?.title && (
                                      <span className="text-blue-300 ml-1">
                                        → matches "
                                        {
                                          (r as any).existingAsset.metadata
                                            .title
                                        }
                                        "
                                      </span>
                                    )}
                                </li>
                              ),
                            )}
                          </ul>
                        </details>
                      )}
                  </div>
                )}

                {/* Results Grid */}
                {wikimediaResults.length > 0 && (
                  <div className="space-y-4">
                    {/* Selection Controls */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={toggleAllWikimediaSelection}
                          className="border-neutral-700"
                        >
                          {wikimediaSelected.size === wikimediaResults.length
                            ? "Deselect All"
                            : "Select All"}
                        </Button>
                        <span className="text-sm text-neutral-400">
                          {wikimediaSelected.size} of {wikimediaResults.length}{" "}
                          selected
                        </span>
                      </div>
                      <Button
                        className="bg-teal-600 hover:bg-teal-700"
                        onClick={handleWikimediaScrape}
                        disabled={isScrapingWikimedia}
                      >
                        {isScrapingWikimedia ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Importing...
                          </>
                        ) : (
                          <>
                            <Download className="w-4 h-4 mr-2" />
                            Import{" "}
                            {wikimediaSelected.size > 0
                              ? wikimediaSelected.size
                              : "All"}{" "}
                            Images
                          </>
                        )}
                      </Button>
                    </div>

                    {/* Image Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {wikimediaResults.map((image) => (
                        <div
                          key={image.pageId}
                          onClick={() => toggleWikimediaSelection(image.pageId)}
                          className={`group relative aspect-video bg-neutral-800 rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${
                            wikimediaSelected.has(image.pageId)
                              ? "border-teal-500 ring-2 ring-teal-500/30"
                              : "border-neutral-700 hover:border-neutral-600"
                          }`}
                        >
                          <img
                            src={image.thumbnailUrl}
                            alt={image.title}
                            className="w-full h-full object-cover"
                          />
                          {/* Selection Indicator */}
                          <div
                            className={`absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                              wikimediaSelected.has(image.pageId)
                                ? "bg-teal-500 text-white"
                                : "bg-black/50 text-transparent group-hover:text-white"
                            }`}
                          >
                            <Check className="w-4 h-4" />
                          </div>
                          {/* Info Overlay */}
                          <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/90 to-transparent">
                            <p className="text-sm font-medium text-white truncate">
                              {image.title}
                            </p>
                            <p className="text-xs text-neutral-400">
                              {image.width}×{image.height} • {image.license}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Empty State */}
                {wikimediaResults.length === 0 &&
                  !isSearchingWikimedia &&
                  !wikimediaError && (
                    <div className="p-6 rounded-lg border border-neutral-800 bg-neutral-900/30 text-center">
                      <ImageIcon className="w-12 h-12 text-neutral-600 mx-auto mb-3" />
                      <p className="text-neutral-400">
                        Enter a search query to find images on Wikimedia Commons
                      </p>
                    </div>
                  )}
              </div>
            )}

            {/* YouTube Tab */}
            {activeTab === "youtube" && (
              <div className="space-y-6">
                {/* Search Header */}
                <div className="p-6 rounded-lg border border-neutral-800 bg-neutral-900/50 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-red-500/20 flex items-center justify-center">
                      <Youtube className="w-6 h-6 text-red-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-medium text-white">
                        YouTube Video Search
                      </h3>
                      <p className="text-sm text-neutral-400">
                        Search for videos using YouTube Data API v3 (uses your
                        GCP quota)
                      </p>
                    </div>
                  </div>

                  {/* Search Input */}
                  <div className="flex gap-2">
                    <Input
                      placeholder="Search videos (e.g., 'nature documentary 4k')"
                      className="bg-neutral-900 border-neutral-700 text-neutral-200"
                      value={ytQuery}
                      onChange={(e) => setYtQuery(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && handleYouTubeSearch()
                      }
                    />
                    <Button
                      className="bg-red-600 hover:bg-red-700"
                      onClick={handleYouTubeSearch}
                      disabled={isYtSearching || !ytQuery.trim()}
                    >
                      {isYtSearching ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Search className="w-4 h-4" />
                      )}
                    </Button>
                  </div>

                  {/* Filter Section */}
                  <div className="space-y-3">
                    <button
                      onClick={() => setShowYtFilters(!showYtFilters)}
                      className="text-sm text-red-400 hover:text-red-300 flex items-center gap-1"
                    >
                      {showYtFilters ? "Hide" : "Show"} Filters
                    </button>

                    {showYtFilters && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-neutral-800/50 rounded-lg">
                        <div>
                          <label className="text-xs text-neutral-500 block mb-1">
                            Max Results
                          </label>
                          <Input
                            type="number"
                            min={1}
                            max={50}
                            value={ytMaxResults}
                            onChange={(e) =>
                              setYtMaxResults(parseInt(e.target.value) || 10)
                            }
                            className="h-8 bg-neutral-900 border-neutral-700 text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-neutral-500 block mb-1">
                            Duration
                          </label>
                          <select
                            value={ytDuration}
                            onChange={(e) =>
                              setYtDuration(e.target.value as any)
                            }
                            className="w-full h-8 bg-neutral-900 border border-neutral-700 rounded-md text-sm text-neutral-200 px-2"
                          >
                            <option value="any">Any</option>
                            <option value="short">&lt;4 min</option>
                            <option value="medium">4-20 min</option>
                            <option value="long">&gt;20 min</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-neutral-500 block mb-1">
                            License
                          </label>
                          <select
                            value={ytLicense}
                            onChange={(e) =>
                              setYtLicense(e.target.value as any)
                            }
                            className="w-full h-8 bg-neutral-900 border border-neutral-700 rounded-md text-sm text-neutral-200 px-2"
                          >
                            <option value="any">Any</option>
                            <option value="creativeCommon">
                              Creative Commons
                            </option>
                            <option value="youtube">Standard YouTube</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-neutral-500 block mb-1">
                            Quality
                          </label>
                          <select
                            value={ytDefinition}
                            onChange={(e) =>
                              setYtDefinition(e.target.value as any)
                            }
                            className="w-full h-8 bg-neutral-900 border border-neutral-700 rounded-md text-sm text-neutral-200 px-2"
                          >
                            <option value="any">Any</option>
                            <option value="high">HD</option>
                            <option value="standard">SD</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Quota info */}
                  <p className="text-xs text-neutral-500 text-center">
                    Each search uses 100 quota units (10,000/day default)
                  </p>
                </div>

                {/* GCP Required Error */}
                {ytGcpRequired && (
                  <div className="p-4 rounded-lg border border-yellow-500/50 bg-yellow-500/10 space-y-2">
                    <div className="flex items-center gap-2 text-yellow-400 font-medium">
                      <XCircle className="w-5 h-5" />
                      Google Cloud Connection Required
                    </div>
                    <p className="text-sm text-neutral-300">
                      To search YouTube, you need to connect your Google Cloud
                      account and enable the YouTube Data API in your project.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-yellow-600 text-yellow-400 hover:bg-yellow-500/20"
                      onClick={() => window.open("/settings#gcp", "_blank")}
                    >
                      Open Settings
                    </Button>
                  </div>
                )}

                {/* Error Display */}
                {ytError && !ytGcpRequired && (
                  <div className="p-4 rounded-lg border border-red-500/50 bg-red-500/10 text-red-400">
                    {ytError}
                  </div>
                )}

                {/* Results Grid */}
                {ytResults.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-neutral-400">
                        Found {ytResults.length} videos
                      </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {ytResults.map((video) => {
                        const isProcessing = ytProcessingItems.has(video.id);

                        return (
                          <div
                            key={video.id}
                            className="group relative aspect-video bg-neutral-800 rounded-lg overflow-hidden border border-neutral-700"
                          >
                            <img
                              src={video.thumbnailUrl}
                              alt={video.title}
                              className={`w-full h-full object-cover transition-opacity ${isProcessing ? "opacity-50" : ""}`}
                            />

                            {/* Processing Overlay */}
                            {isProcessing && (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                                <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
                              </div>
                            )}

                            {/* Action Overlay */}
                            {!isProcessing && (
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                <Button
                                  size="sm"
                                  className="bg-red-600 hover:bg-red-700"
                                  onClick={() => handleYouTubeProcess(video)}
                                >
                                  <Sparkles className="w-4 h-4 mr-2" />
                                  Process
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-neutral-600"
                                  onClick={() =>
                                    window.open(video.url, "_blank")
                                  }
                                >
                                  <Play className="w-4 h-4" />
                                </Button>
                              </div>
                            )}

                            <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/90 to-transparent pointer-events-none">
                              <p className="text-sm font-medium text-white truncate">
                                {video.title}
                              </p>
                              <p className="text-xs text-neutral-400 truncate">
                                {video.channelTitle}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Empty State */}
                {ytResults.length === 0 && !isYtSearching && !ytError && (
                  <div className="p-6 rounded-lg border border-neutral-800 bg-neutral-900/30 text-center">
                    <Youtube className="w-12 h-12 text-neutral-600 mx-auto mb-3" />
                    <p className="text-neutral-400">
                      Enter a search query to find videos on YouTube
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Classify Tab */}
            {activeTab === "classify" && (
              <div className="space-y-6">
                {/* yt-dlp Check Button */}
                <div className="p-4 rounded-lg border border-neutral-800 bg-neutral-900/50">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-medium text-white">
                        System Check
                      </h4>
                      <p className="text-xs text-neutral-500">
                        Verify yt-dlp and FFmpeg are available
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-neutral-700"
                      onClick={async () => {
                        setIsCheckingYtdlp(true);
                        try {
                          const res = await fetch("/api/check-ytdlp");
                          const data = await res.json();
                          setYtdlpStatus(data);
                        } catch (err) {
                          setYtdlpStatus({ error: "Failed to check" });
                        } finally {
                          setIsCheckingYtdlp(false);
                        }
                      }}
                      disabled={isCheckingYtdlp}
                    >
                      {isCheckingYtdlp ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        "Check yt-dlp"
                      )}
                    </Button>
                  </div>
                  {ytdlpStatus && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div
                        className={`p-2 rounded text-xs ${ytdlpStatus.ytdlp?.available ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}
                      >
                        <span className="font-medium">yt-dlp:</span>{" "}
                        {ytdlpStatus.ytdlp?.available
                          ? ytdlpStatus.ytdlp.version
                          : "Not found"}
                      </div>
                      <div
                        className={`p-2 rounded text-xs ${ytdlpStatus.ffmpeg?.available ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}
                      >
                        <span className="font-medium">FFmpeg:</span>{" "}
                        {ytdlpStatus.ffmpeg?.available
                          ? ytdlpStatus.ffmpeg.version
                          : "Not found"}
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-6 rounded-lg border border-neutral-800 bg-neutral-900/50 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-purple-500/20 flex items-center justify-center">
                      <Sparkles className="w-6 h-6 text-purple-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-medium text-white">
                        AI Media Classification
                      </h3>
                      <p className="text-sm text-neutral-400">
                        Classify images, videos, or audio using Gemini 3 Flash
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="text-sm text-neutral-400 mb-1 block">
                        Media URL
                      </label>
                      <Input
                        placeholder="https://youtube.com/watch?v=... or image/audio URL"
                        className="bg-neutral-900 border-neutral-700 text-neutral-200"
                        value={classifyUrl}
                        onChange={(e) => setClassifyUrl(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleClassify()}
                      />
                    </div>

                    <div>
                      <label className="text-sm text-neutral-400 mb-1 block">
                        Media Type
                      </label>
                      <div className="flex gap-2">
                        {(["image", "video", "audio"] as const).map((type) => (
                          <Button
                            key={type}
                            variant={
                              classifyType === type ? "default" : "outline"
                            }
                            size="sm"
                            onClick={() => setClassifyType(type)}
                            className={
                              classifyType === type
                                ? "bg-purple-600"
                                : "border-neutral-700"
                            }
                          >
                            {type.charAt(0).toUpperCase() + type.slice(1)}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <Button
                      className="w-full bg-purple-600 hover:bg-purple-700"
                      onClick={handleClassify}
                      disabled={isClassifying || !classifyUrl.trim()}
                    >
                      {isClassifying ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          {classifyStage} ({classifyElapsed}s)
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 mr-2" /> Classify Media
                        </>
                      )}
                    </Button>

                    {/* Time estimate */}
                    {!isClassifying && (
                      <p className="text-xs text-neutral-500 text-center">
                        {classifyType === "video"
                          ? "Videos may take 30-60 seconds"
                          : "Images typically take 3-10 seconds"}
                      </p>
                    )}
                  </div>
                </div>

                {/* Error Display */}
                {classifyError && (
                  <div className="p-4 rounded-lg border border-red-500/50 bg-red-500/10 text-red-400">
                    {classifyError}
                  </div>
                )}

                {/* Classification Result */}
                {classificationResult && (
                  <div className="rounded-xl border border-neutral-800 bg-neutral-900/80 overflow-hidden">
                    {/* Header */}
                    <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                          <Check className="w-5 h-5 text-purple-400" />
                        </div>
                        <div>
                          <h4 className="text-white font-semibold">
                            Classification Complete
                          </h4>
                          <p className="text-xs text-neutral-500">
                            Processed in{" "}
                            {
                              classificationResult.classification
                                ?.processingTimeMs
                            }
                            ms
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-center px-3 py-1 bg-purple-500/20 rounded-lg">
                          <div className="text-2xl font-bold text-purple-400">
                            {classificationResult.classification?.classification
                              ?.qualityRating || "?"}
                          </div>
                          <div className="text-[10px] text-purple-300/70 uppercase tracking-wider">
                            Quality
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Video Preview & Info */}
                    <div className="p-5 space-y-4">
                      {/* Description */}
                      <div className="p-4 rounded-lg bg-neutral-800/50 border border-neutral-700/50">
                        <p className="text-sm text-neutral-200 leading-relaxed">
                          {
                            classificationResult.classification?.classification
                              ?.description
                          }
                        </p>
                      </div>

                      {/* Metadata Grid */}
                      <div className="grid grid-cols-2 gap-3">
                        {classificationResult.classification?.classification
                          ?.mood && (
                          <div className="p-3 rounded-lg bg-neutral-800/30">
                            <p className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1">
                              Mood
                            </p>
                            <p className="text-sm text-white font-medium capitalize">
                              {
                                classificationResult.classification
                                  .classification.mood
                              }
                            </p>
                          </div>
                        )}
                        {classificationResult.classification?.classification
                          ?.pacing && (
                          <div className="p-3 rounded-lg bg-neutral-800/30">
                            <p className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1">
                              Pacing
                            </p>
                            <p className="text-sm text-white font-medium capitalize">
                              {
                                classificationResult.classification
                                  .classification.pacing
                              }
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Subjects */}
                      {classificationResult.classification?.classification
                        ?.subjects?.length > 0 && (
                        <div>
                          <p className="text-[10px] text-neutral-500 uppercase tracking-wider mb-2">
                            Subjects Detected
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {classificationResult.classification.classification.subjects.map(
                              (s: string, i: number) => (
                                <span
                                  key={i}
                                  className="px-3 py-1.5 text-xs bg-purple-500/15 border border-purple-500/30 rounded-full text-purple-300 font-medium"
                                >
                                  {s}
                                </span>
                              ),
                            )}
                          </div>
                        </div>
                      )}

                      {/* Scene Types (video) */}
                      {classificationResult.classification?.classification
                        ?.sceneTypes?.length > 0 && (
                        <div>
                          <p className="text-[10px] text-neutral-500 uppercase tracking-wider mb-2">
                            Scene Types
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {classificationResult.classification.classification.sceneTypes.map(
                              (s: string, i: number) => (
                                <span
                                  key={i}
                                  className="px-3 py-1.5 text-xs bg-blue-500/15 border border-blue-500/30 rounded-full text-blue-300"
                                >
                                  {s}
                                </span>
                              ),
                            )}
                          </div>
                        </div>
                      )}

                      {/* Content Summary (video) */}
                      {classificationResult.classification?.classification
                        ?.contentSummary && (
                        <div className="p-4 rounded-lg bg-gradient-to-br from-neutral-800/50 to-neutral-800/30 border border-neutral-700/30">
                          <p className="text-[10px] text-neutral-500 uppercase tracking-wider mb-2">
                            Content Summary
                          </p>
                          <p className="text-sm text-neutral-300 leading-relaxed">
                            {
                              classificationResult.classification.classification
                                .contentSummary
                            }
                          </p>
                        </div>
                      )}

                      {/* Raw JSON Toggle */}
                      <details className="text-xs">
                        <summary className="text-neutral-500 cursor-pointer hover:text-neutral-400 transition-colors">
                          View Raw JSON
                        </summary>
                        <pre className="mt-2 p-3 bg-neutral-800 rounded-lg overflow-x-auto text-neutral-400 text-[11px]">
                          {JSON.stringify(classificationResult, null, 2)}
                        </pre>
                      </details>
                    </div>

                    {/* Approval Section - Only for videos */}
                    {classifyType === "video" &&
                      !isProcessing &&
                      !processingJobId && (
                        <div className="px-5 py-4 border-t border-neutral-800 bg-neutral-900/50 space-y-4">
                          {/* Filter Prompt */}
                          <div className="space-y-2">
                            <label className="text-sm text-neutral-400 font-medium">
                              Filter clips by description (optional)
                            </label>
                            <Input
                              placeholder="e.g., 'old real footage', 'action scenes', 'speeches'"
                              value={filterPrompt}
                              onChange={(e) => setFilterPrompt(e.target.value)}
                              className="bg-neutral-800 border-neutral-700"
                            />
                            <p className="text-xs text-neutral-500">
                              Only clips matching this will be extracted
                            </p>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex gap-3">
                            <Button
                              className="flex-1 bg-green-600 hover:bg-green-700 h-11"
                              onClick={async () => {
                                setIsProcessing(true);
                                setProcessingError(null);
                                try {
                                  const response = await fetch("/api/segment", {
                                    method: "POST",
                                    headers: {
                                      "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify({
                                      videoId:
                                        classificationResult.classification
                                          ?.classification?.id ||
                                        Date.now().toString(),
                                      sourceUrl: classifyUrl,
                                      filterPrompt:
                                        filterPrompt.trim() || undefined,
                                      minClipDuration: 5,
                                      maxClipDuration: 10,
                                    }),
                                  });
                                  const data = await response.json();
                                  if (data.success) {
                                    setProcessingJobId(data.jobId);
                                  } else {
                                    setProcessingError(
                                      data.error || "Failed to start",
                                    );
                                  }
                                } catch (err) {
                                  setProcessingError(
                                    err instanceof Error
                                      ? err.message
                                      : "Failed",
                                  );
                                } finally {
                                  setIsProcessing(false);
                                }
                              }}
                            >
                              <Check className="w-4 h-4 mr-2" />
                              Approve & Extract Clips
                            </Button>
                            <Button
                              variant="outline"
                              className="flex-1 border-red-500/50 text-red-400 hover:bg-red-500/10 h-11"
                              onClick={() => {
                                setClassificationResult(null);
                                setClassifyUrl("");
                              }}
                            >
                              <XCircle className="w-4 h-4 mr-2" />
                              Reject
                            </Button>
                          </div>
                        </div>
                      )}

                    {/* Processing Progress UI */}
                    {(isProcessing || processingJobId) &&
                      !processedClips.length && (
                        <div className="px-5 py-5 border-t border-neutral-800 bg-gradient-to-b from-blue-500/5 to-transparent">
                          <div className="space-y-4">
                            {/* Header */}
                            <div className="flex items-center gap-3">
                              <div className="relative">
                                <div className="h-10 w-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                                  <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                                </div>
                              </div>
                              <div className="flex-1">
                                <h4 className="text-white font-semibold">
                                  {processingProgress?.message ||
                                    "Processing Video..."}
                                </h4>
                                <p className="text-xs text-neutral-400">
                                  {processingJobId
                                    ? `Job ID: ${processingJobId}`
                                    : "Starting job..."}
                                </p>
                              </div>
                              {processingProgress?.progress !== undefined && (
                                <div className="text-right">
                                  <div className="text-2xl font-bold text-blue-400">
                                    {processingProgress.progress}%
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Progress Bar */}
                            <div className="space-y-2">
                              <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full transition-all duration-500 ease-out"
                                  style={{
                                    width: `${processingProgress?.progress || 5}%`,
                                  }}
                                />
                              </div>
                            </div>

                            {/* Stage Indicators */}
                            <div className="grid grid-cols-6 gap-1">
                              {[
                                {
                                  key: "downloading",
                                  label: "Download",
                                  threshold: 5,
                                },
                                {
                                  key: "uploading",
                                  label: "Upload",
                                  threshold: 30,
                                },
                                {
                                  key: "transcribing",
                                  label: "Transcribe",
                                  threshold: 45,
                                },
                                {
                                  key: "analyzing",
                                  label: "Analyze",
                                  threshold: 65,
                                },
                                {
                                  key: "extracting",
                                  label: "Extract",
                                  threshold: 85,
                                },
                                {
                                  key: "storing",
                                  label: "Store",
                                  threshold: 95,
                                },
                              ].map((stage) => {
                                const progress =
                                  processingProgress?.progress || 0;
                                const isActive =
                                  processingProgress?.stage === stage.key;
                                const isComplete = progress >= stage.threshold;
                                return (
                                  <div
                                    key={stage.key}
                                    className={`text-center py-2 px-1 rounded transition-all ${
                                      isActive
                                        ? "bg-blue-500/20 border border-blue-500/50"
                                        : isComplete
                                          ? "bg-green-500/10"
                                          : "bg-neutral-800/50"
                                    }`}
                                  >
                                    <div
                                      className={`text-[10px] font-medium ${
                                        isActive
                                          ? "text-blue-400"
                                          : isComplete
                                            ? "text-green-400"
                                            : "text-neutral-500"
                                      }`}
                                    >
                                      {isComplete && !isActive ? "✓" : ""}{" "}
                                      {stage.label}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Helpful Info */}
                            <p className="text-xs text-neutral-500 text-center">
                              Long videos are analyzed in chunks for
                              comprehensive clip extraction
                            </p>
                          </div>
                        </div>
                      )}

                    {processingError && (
                      <div className="px-5 py-4 border-t border-red-500/30 bg-red-500/10">
                        <div className="flex items-center gap-2 text-red-400">
                          <XCircle className="w-4 h-4 flex-shrink-0" />
                          <p className="text-sm">{processingError}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Clips Viewer - Separate from classification result */}
                {processedClips.length > 0 && (
                  <div className="mt-6 p-4 rounded-lg border border-neutral-800 bg-neutral-900/50 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-white">
                        Generated Clips ({processedClips.length})
                      </h3>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          disabled={selectedClipIndex === 0}
                          onClick={() =>
                            setSelectedClipIndex((i) => Math.max(0, i - 1))
                          }
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <span className="text-sm text-neutral-400">
                          {selectedClipIndex + 1} / {processedClips.length}
                        </span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          disabled={
                            selectedClipIndex === processedClips.length - 1
                          }
                          onClick={() =>
                            setSelectedClipIndex((i) =>
                              Math.min(processedClips.length - 1, i + 1),
                            )
                          }
                        >
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Current Clip */}
                    {processedClips[selectedClipIndex] && (
                      <div className="space-y-3">
                        {/* Video Player */}
                        <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                          {processedClips[selectedClipIndex].videoUrl ? (
                            <video
                              key={selectedClipIndex}
                              src={processedClips[selectedClipIndex].videoUrl}
                              controls
                              className="w-full h-full"
                              poster={
                                processedClips[selectedClipIndex].thumbnailUrl
                              }
                            />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-neutral-500">
                              <Play className="w-12 h-12" />
                            </div>
                          )}
                        </div>

                        {/* Clip Metadata */}
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div className="p-3 rounded bg-neutral-800/50">
                            <p className="text-neutral-500 text-xs mb-1">
                              Duration
                            </p>
                            <p className="text-white font-mono">
                              {processedClips[selectedClipIndex].startTime}s -{" "}
                              {processedClips[selectedClipIndex].endTime}s
                            </p>
                          </div>
                          <div className="p-3 rounded bg-neutral-800/50">
                            <p className="text-neutral-500 text-xs mb-1">
                              Type
                            </p>
                            <p className="text-white">
                              {processedClips[selectedClipIndex].hasAudio
                                ? "Visual + Audio"
                                : "Visual Only"}
                            </p>
                          </div>
                        </div>

                        {/* Classification */}
                        {processedClips[selectedClipIndex].classification && (
                          <div className="p-3 rounded bg-neutral-800/50">
                            <p className="text-neutral-500 text-xs mb-2">
                              Classification
                            </p>
                            <p className="text-white text-sm mb-2">
                              {
                                processedClips[selectedClipIndex].classification
                                  .description
                              }
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {processedClips[
                                selectedClipIndex
                              ].classification.tags?.map(
                                (tag: string, i: number) => (
                                  <span
                                    key={i}
                                    className="px-2 py-0.5 text-xs bg-neutral-700 rounded-full text-neutral-300"
                                  >
                                    {tag}
                                  </span>
                                ),
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Thumbnail Strip */}
                    <div className="flex gap-2 overflow-x-auto py-2">
                      {processedClips.map((clip, i) => (
                        <button
                          key={i}
                          onClick={() => setSelectedClipIndex(i)}
                          className={`flex-shrink-0 w-20 h-12 rounded overflow-hidden border-2 transition ${
                            i === selectedClipIndex
                              ? "border-purple-500"
                              : "border-transparent hover:border-neutral-600"
                          }`}
                        >
                          {clip.thumbnailUrl ? (
                            <img
                              src={clip.thumbnailUrl}
                              alt={`Clip ${i + 1}`}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-neutral-800 flex items-center justify-center text-neutral-500 text-xs">
                              {i + 1}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Search Tab */}
            {activeTab === "search" && (
              <div className="space-y-6">
                <div className="p-6 rounded-lg border border-neutral-800 bg-neutral-900/50 space-y-4">
                  <h3 className="text-lg font-medium text-white">
                    Search Stock Media Library
                  </h3>
                  <p className="text-neutral-400 text-sm">
                    Search through your vector-indexed media (images, videos,
                    clips).
                  </p>

                  {/* Search Input */}
                  <div className="flex gap-3">
                    <Input
                      placeholder="Describe what you're looking for..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                      className="flex-1 bg-neutral-800 border-neutral-700"
                    />
                    <Button
                      onClick={handleSearch}
                      disabled={isSearching || !searchQuery.trim()}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {isSearching ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Search className="w-4 h-4" />
                      )}
                    </Button>
                  </div>

                  {/* Search Error */}
                  {searchError && (
                    <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                      {searchError}
                    </div>
                  )}

                  {/* Search Results */}
                  {hasSearched && (
                    <div className="space-y-4">
                      <div className="text-sm text-neutral-400">
                        {searchResults.length > 0
                          ? `Found ${searchResults.length} results`
                          : "No results found. Try a different search term."}
                      </div>

                      {searchResults.length > 0 && (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                          {searchResults.map((result, idx) => (
                            <div
                              key={idx}
                              className="relative group rounded-lg overflow-hidden border border-neutral-800 bg-neutral-900"
                            >
                              {/* Media Preview */}
                              {result.mediaType === "video" ? (
                                <div className="aspect-video bg-black">
                                  {result.url ? (
                                    <video
                                      src={result.url}
                                      className="w-full h-full"
                                      controls
                                      poster={result.thumbnailUrl}
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                      <Play className="w-8 h-8 text-neutral-600" />
                                    </div>
                                  )}
                                </div>
                              ) : result.mediaType === "image" ? (
                                <div className="aspect-video bg-neutral-800">
                                  {result.url ? (
                                    <img
                                      src={result.url}
                                      alt={result.description || "Image"}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                      <Globe className="w-8 h-8 text-neutral-600" />
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="aspect-video bg-neutral-800 flex items-center justify-center">
                                  <div className="text-center">
                                    <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-neutral-700 flex items-center justify-center">
                                      <Sparkles className="w-6 h-6 text-neutral-400" />
                                    </div>
                                    <span className="text-xs text-neutral-500">
                                      Audio
                                    </span>
                                  </div>
                                </div>
                              )}

                              {/* Info Overlay */}
                              <div className="p-3 space-y-1">
                                <p className="text-sm text-white line-clamp-2">
                                  {result.description || "No description"}
                                </p>
                                <div className="flex items-center gap-2 text-xs text-neutral-500">
                                  <span className="px-2 py-0.5 bg-neutral-800 rounded">
                                    {result.mediaType}
                                  </span>
                                  {result.similarity && (
                                    <span>
                                      {Math.round(result.similarity * 100)}%
                                      match
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Debug Tab Content */}
            {activeTab === "debug" && (
              <div className="space-y-4 p-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">
                    Vector Database Debug
                  </h3>
                  <Button
                    onClick={async () => {
                      setIsLoadingDebug(true);
                      setDebugError(null);
                      try {
                        const res = await fetch("/api/stock-media/debug");
                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                        const data = await res.json();
                        setDebugData(data);
                      } catch (e) {
                        setDebugError(
                          e instanceof Error ? e.message : "Failed to load",
                        );
                      } finally {
                        setIsLoadingDebug(false);
                      }
                    }}
                    disabled={isLoadingDebug}
                    className="bg-orange-600 hover:bg-orange-700"
                  >
                    {isLoadingDebug ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />{" "}
                        Loading...
                      </>
                    ) : (
                      <>
                        <Database className="w-4 h-4 mr-2" /> Load DB Entries
                      </>
                    )}
                  </Button>
                </div>

                {debugError && (
                  <div className="p-3 rounded bg-red-900/50 border border-red-700 text-red-200">
                    Error: {debugError}
                  </div>
                )}

                {debugData && (
                  <div className="space-y-4">
                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="p-4 rounded-lg bg-neutral-900 border border-neutral-800">
                        <div className="text-2xl font-bold text-orange-400">
                          {debugData.totalCount}
                        </div>
                        <div className="text-sm text-neutral-400">
                          Total Entries
                        </div>
                      </div>
                      <div className="p-4 rounded-lg bg-neutral-900 border border-neutral-800">
                        <div className="text-2xl font-bold text-green-400">
                          {debugData.entriesWithEmbedding}
                        </div>
                        <div className="text-sm text-neutral-400">
                          With Embeddings
                        </div>
                      </div>
                      <div className="p-4 rounded-lg bg-neutral-900 border border-neutral-800">
                        <div className="text-sm space-y-1">
                          {Object.entries(debugData.sourceCounts || {}).map(
                            ([source, count]) => (
                              <div
                                key={source}
                                className="flex justify-between"
                              >
                                <span className="text-neutral-400">
                                  {source}:
                                </span>
                                <span className="font-mono">
                                  {count as number}
                                </span>
                              </div>
                            ),
                          )}
                        </div>
                        <div className="text-sm text-neutral-400 mt-2">
                          By Source
                        </div>
                      </div>
                    </div>

                    {/* Entries Table */}
                    <div className="rounded-lg border border-neutral-800 overflow-hidden">
                      <div className="max-h-[400px] overflow-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-neutral-900 sticky top-0">
                            <tr>
                              <th className="p-2 text-left">Source</th>
                              <th className="p-2 text-left">Type</th>
                              <th className="p-2 text-left">Description</th>
                              <th className="p-2 text-left">Subjects</th>
                              <th className="p-2 text-left">URL</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(debugData.entries || []).map(
                              (entry: any, idx: number) => (
                                <tr
                                  key={idx}
                                  className="border-t border-neutral-800 hover:bg-neutral-900/50"
                                >
                                  <td className="p-2">
                                    <span
                                      className={`px-2 py-0.5 rounded text-xs ${
                                        entry.source === "youtube"
                                          ? "bg-red-900 text-red-200"
                                          : entry.source === "wikimedia"
                                            ? "bg-blue-900 text-blue-200"
                                            : "bg-neutral-700"
                                      }`}
                                    >
                                      {entry.source}
                                    </span>
                                  </td>
                                  <td className="p-2">
                                    <span className="text-neutral-400">
                                      {entry.metadata?.mediaType || "unknown"}
                                    </span>
                                  </td>
                                  <td
                                    className="p-2 max-w-xs truncate"
                                    title={entry.metadata?.description}
                                  >
                                    {entry.metadata?.description ||
                                      entry.metadata?.title ||
                                      "No description"}
                                  </td>
                                  <td className="p-2 text-xs text-neutral-400">
                                    {(entry.metadata?.subjects || [])
                                      .slice(0, 3)
                                      .join(", ")}
                                  </td>
                                  <td className="p-2">
                                    {entry.metadata?.url && (
                                      <a
                                        href={entry.metadata.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-teal-400 hover:underline text-xs"
                                      >
                                        View
                                      </a>
                                    )}
                                  </td>
                                </tr>
                              ),
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {!debugData && !isLoadingDebug && !debugError && (
                  <div className="text-center text-neutral-500 py-12">
                    Click "Load DB Entries" to inspect the stock_media table
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (inline) {
    return (
      <div className="h-full w-full border border-neutral-800 rounded-lg overflow-hidden">
        {innerContent}
      </div>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl h-[80vh] p-0 bg-neutral-950 border-neutral-800 overflow-hidden text-neutral-200">
        {innerContent}
      </DialogContent>
    </Dialog>
  );
}
