/**
 * MediaTab - Combined media browser for videos, images, and uploads
 *
 * Features:
 * - Filter tabs: All | Images | Videos | Uploads | AI Generated
 * - Search across all sources via media adaptors
 * - Drag to timeline with thumbnail preview
 * - AI-generated label on applicable items
 * - Upload local media
 * - Multi-select mode with batch delete
 * - Context menu for individual items
 */

import React, { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { cn } from "../../../utils/general/utils";
import { ScrollArea } from "../../ui/scroll-area";
import { Input } from "../../ui/input";
import { Button } from "../../ui/button";
import {
  Search,
  Upload,
  ImageIcon,
  Film,
  FolderOpen,
  Sparkles,
  Loader2,
  X,
  Trash2,
  CheckSquare,
  Square,
  Check,
  Plus,
  Music2,
} from "lucide-react";
import { useMediaAdaptors } from "../../../contexts/media-adaptor-context";
import { useLocalMedia } from "../../../contexts/local-media-context";
import { StandardImage, StandardVideo } from "../../../types/media-adaptors";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../../ui/context-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../ui/alert-dialog";
import { startMediaDrag, endDrag } from "../../../stores/video-editor-store";
import { useDevToolsMediaStore } from "@/lib/stores/devtools-media-store"; // [DEVTOOLS-MEDIA] - Remove when no longer needed
import { VideoThumbnailPreview } from "../../../hooks/use-video-thumbnail";
import type { AudioNormalizationMetadata } from "@/lib/services/audio-normalization-metadata";
import {
  getNormalizationBlockReason,
  getNormalizedAudioUrl,
} from "../../../utils/audio-normalization";

// ==========================================
// TYPES
// ==========================================

type MediaFilter = "all" | "images" | "videos" | "audio" | "uploads" | "ai";

interface MediaItem extends Partial<AudioNormalizationMetadata> {
  id: string;
  type: "image" | "video" | "audio";
  src: string;
  thumbnail: string;
  name: string;
  duration?: number; // For videos and audio, in seconds
  isAiGenerated?: boolean;
  isUserUpload?: boolean;
  width?: number;
  height?: number;
  // Source attribution
  _source?: string;
  _sourceDisplayName?: string;
  // For local media
  _isLocalMedia?: boolean;
  // For audio
  artist?: string;
}

// ==========================================
// FILTER TABS COMPONENT
// ==========================================

interface FilterTabsProps {
  activeFilter: MediaFilter;
  onFilterChange: (filter: MediaFilter) => void;
  counts: {
    all: number;
    images: number;
    videos: number;
    audio: number;
    uploads: number;
    ai: number;
  };
}

const FilterTabs: React.FC<FilterTabsProps> = ({
  activeFilter,
  onFilterChange,
  counts,
}) => {
  const filters: { value: MediaFilter; icon: React.ReactNode; label: string }[] = [
    { value: "all", icon: <FolderOpen className="h-3 w-3" />, label: "All" },
    { value: "images", icon: <ImageIcon className="h-3 w-3" />, label: "Images" },
    { value: "videos", icon: <Film className="h-3 w-3" />, label: "Videos" },
    { value: "audio", icon: <Music2 className="h-3 w-3" />, label: "Audio" },
    { value: "uploads", icon: <Upload className="h-3 w-3" />, label: "Uploads" },
    { value: "ai", icon: <Sparkles className="h-3 w-3" />, label: "AI" },
  ];

  return (
    <div className="flex flex-wrap gap-1.5">
      {filters.map((filter) => {
        const count = counts[filter.value];
        const isActive = activeFilter === filter.value;
        return (
          <button
            key={filter.value}
            onClick={() => onFilterChange(filter.value)}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 text-xs rounded-full transition-all",
              isActive
                ? "bg-primary text-primary-foreground font-medium"
                : "bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            {filter.icon}
            <span>{filter.label}</span>
            {count > 0 && (
              <span className={cn(
                "text-[10px] tabular-nums ml-0.5",
                isActive ? "text-primary-foreground/80" : "text-muted-foreground/70"
              )}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

// ==========================================
// MEDIA GRID ITEM COMPONENT
// ==========================================

interface MediaGridItemProps {
  item: MediaItem;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  isSelectionMode: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  onDelete: () => void;
  onAddToTimeline: () => void;
  canDelete: boolean;
}

const MediaGridItem: React.FC<MediaGridItemProps> = ({
  item,
  onClick,
  onDragStart,
  onDragEnd,
  isSelectionMode,
  isSelected,
  onToggleSelect,
  onDelete,
  onAddToTimeline,
  canDelete,
}) => {
  const [isHovering, setIsHovering] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const blockReason = getNormalizationBlockReason({
    ...item,
    type: item.type,
  });



  // Handle hover-to-autoplay for videos - DISABLED during drag
  useEffect(() => {
    if (item.type !== "video") return;
    
    // Never play video while dragging
    if (isDragging) {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }
      setIsVideoPlaying(false);
      return;
    }
    
    if (isHovering && !isSelectionMode) {
      hoverTimeoutRef.current = setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.currentTime = 0;
          videoRef.current.play().catch(() => {});
          setIsVideoPlaying(true);
        }
      }, 400);
    } else {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }
      setIsVideoPlaying(false);
    }
    
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, [isHovering, isSelectionMode, isDragging, item.type]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (isSelectionMode) {
      e.preventDefault();
      e.stopPropagation();
      onToggleSelect();
    } else {
      onClick();
    }
  }, [isSelectionMode, onClick, onToggleSelect]);

  const handleDeleteClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDelete();
  }, [onDelete]);

  const handleAddToTimelineClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onAddToTimeline();
  }, [onAddToTimeline]);

  // Get the best quality thumbnail - use src for images if thumbnail is lower quality
  const thumbnailSrc = item.type === "image" ? (item.src || item.thumbnail) : item.thumbnail;


  // Wrap drag handlers to manage isDragging state
  const handleDragStart = useCallback((e: React.DragEvent) => {
    setIsDragging(true);
    // Stop video playback immediately
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
    setIsVideoPlaying(false);
    onDragStart(e);
  }, [onDragStart]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    onDragEnd();
  }, [onDragEnd]);

  const content = (
    <div
      onClick={handleClick}
      draggable={!isSelectionMode && !blockReason}
      onDragStart={isSelectionMode || blockReason ? undefined : handleDragStart}
      onDragEnd={isSelectionMode || blockReason ? undefined : handleDragEnd}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      title={blockReason || item.name}
      className={cn(
        "group flex flex-col rounded overflow-hidden",
        "bg-neutral-900/50 border border-neutral-800",
        "transition-all duration-150",
        isSelectionMode
          ? "cursor-pointer"
          : blockReason
            ? "cursor-not-allowed opacity-80"
            : "cursor-grab active:cursor-grabbing",
        isSelected 
          ? "border-primary bg-primary/5" 
          : "hover:border-neutral-700 hover:bg-neutral-800/50",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      )}
    >
      {/* Thumbnail Area */}
      <div className="relative aspect-video bg-neutral-900">
        {/* Selection Checkbox (top-left) */}
        {isSelectionMode && (
          <div className={cn(
            "absolute top-1.5 left-1.5 z-20 w-4 h-4 rounded-sm flex items-center justify-center transition-all",
            "border",
            isSelected 
              ? "bg-primary border-primary text-primary-foreground" 
              : "bg-neutral-900/80 border-neutral-600 text-transparent"
          )}>
            <Check className="h-2.5 w-2.5" strokeWidth={3} />
          </div>
        )}

        {/* Type Badge (top-right corner) */}
        {!isSelectionMode && (
          <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
            {item.isAiGenerated && (
              <div className="w-5 h-5 rounded bg-purple-600 flex items-center justify-center" title="AI Generated">
                <Sparkles className="h-3 w-3 text-white" />
              </div>
            )}
            {item.isUserUpload && !item.isAiGenerated && (
              <div className="w-5 h-5 rounded bg-blue-600 flex items-center justify-center" title="Uploaded">
                <Upload className="h-3 w-3 text-white" />
              </div>
            )}
          </div>
        )}

        {/* Thumbnail or Video Preview */}
        {item.type === "audio" ? (
          <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-900/50 to-blue-900/50">
            <Music2 className="h-12 w-12 text-purple-200" />
          </div>
        ) : item.type === "video" ? (
          <>
            {/* First-frame thumbnail (always mounted to avoid re-loading after hover) */}
            <VideoThumbnailPreview src={item.src} />
            {/* Hover-to-play overlay */}
            {isHovering && !isSelectionMode && (
              <video
                ref={videoRef}
                src={item.src}
                muted
                loop
                playsInline
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  objectPosition: 'center',
                  zIndex: 5,
                }}
              />
            )}
          </>
        ) : !imageError ? (
          <img
            src={thumbnailSrc}
            alt={item.name}
            loading="lazy"
            draggable={false}
            onError={() => setImageError(true)}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center',
            }}
          />
        ) : (
          <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-neutral-800">
            <ImageIcon className="h-8 w-8 text-neutral-700" />
          </div>
        )}

        {/* Video Duration Overlay (bottom-right) */}
        {item.type === "video" && item.duration && (
          <div className="absolute bottom-1 right-1 px-1 py-0.5 bg-black/80 rounded text-[10px] font-mono text-white">
            {formatDuration(item.duration)}
          </div>
        )}

        {/* Playing Indicator (bottom-left) */}
        {isVideoPlaying && (
          <div className="absolute bottom-1 left-1 flex items-center gap-1 px-1 py-0.5 bg-black/80 rounded">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[9px] text-white font-medium">LIVE</span>
          </div>
        )}
        {blockReason && (
          <div
            className="absolute inset-x-0 bottom-0 bg-amber-500/90 text-[9px] font-semibold text-black px-2 py-1"
            title={blockReason}
          >
            {item.audioNormalizationStatus === "failed"
              ? "Audio normalization failed"
              : "Normalizing audio..."}
          </div>
        )}
      </div>

      {/* Info Panel */}
      <div className="px-2 py-1.5 flex items-center gap-2">
        {/* Filename */}
        <span className="flex-1 text-[11px] font-medium text-neutral-200 truncate" title={item.name}>
          {item.name}
        </span>
        
        {/* Action Buttons - Always visible */}
        {!isSelectionMode && canDelete && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={handleDeleteClick}
              className="p-1 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
              title="Delete"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  // Wrap with context menu when not in selection mode
  if (isSelectionMode) {
    return content;
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {content}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <ContextMenuItem disabled={!!blockReason} onClick={onAddToTimeline}>
          <Plus className="mr-2 h-4 w-4" />
          <span>Add to Timeline</span>
        </ContextMenuItem>
        {canDelete && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem 
              onClick={onDelete}
              className="text-red-600 focus:text-red-600"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              <span>Delete</span>
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
};


// ==========================================
// HELPER FUNCTIONS
// ==========================================

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// Convert StandardImage to MediaItem
function imageToMediaItem(
  image: StandardImage & { _source?: string; _sourceDisplayName?: string }
): MediaItem {
  return {
    id: String(image.id),
    type: "image",
    src: image.src.original,
    thumbnail: image.thumbnail || image.src.small || image.src.original,
    name: image.alt || `Image ${image.id}`,
    width: image.width,
    height: image.height,
    isAiGenerated: false, // TODO: Track AI-generated source
    _source: image._source,
    _sourceDisplayName: image._sourceDisplayName,
  };
}

// Convert StandardVideo to MediaItem
function videoToMediaItem(
  video: StandardVideo & { _source?: string; _sourceDisplayName?: string }
): MediaItem {
  return {
    id: String(video.id),
    type: "video",
    src: video.videoFiles?.[0]?.url || "",
    thumbnail: video.thumbnail || "",
    name: `Video ${video.id}`,
    duration: video.duration,
    width: video.width,
    height: video.height,
    isAiGenerated: false, // TODO: Track AI-generated source
    _source: video._source,
    _sourceDisplayName: video._sourceDisplayName,
  };
}

// ==========================================
// MEDIA TAB COMPONENT
// ==========================================

// [DEVTOOLS-MEDIA] Stable empty array to avoid infinite useSyncExternalStore re-render
const EMPTY_DEVTOOLS_ITEMS: never[] = [];

export const MediaTab: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<MediaFilter>("all");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<MediaItem[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Selection mode state
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<MediaItem | null>(null);
  
  // Drag and drop state
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCounterRef = useRef(0);

  // Get media adaptors and local media
  const { searchImages, searchVideos, imageAdaptors, videoAdaptors } =
    useMediaAdaptors();
  const { localMediaFiles, addMediaFile, removeMediaFile, isLoading: isUploading } =
    useLocalMedia();

  // Check if any adaptors are available
  const hasAdaptors = imageAdaptors.length > 0 || videoAdaptors.length > 0;

  // Convert local media to MediaItem format
  const localMediaItems = useMemo<MediaItem[]>(() => {
    const mediaFiles = localMediaFiles.filter((file) => 
      file.type === "image" || file.type === "video" || file.type === "audio"
    );
    console.log(`[MediaTab] Processing ${mediaFiles.length} media files (${localMediaFiles.filter(f => f.type === 'image').length} images, ${localMediaFiles.filter(f => f.type === 'video').length} videos, ${localMediaFiles.filter(f => f.type === 'audio').length} audio) from ${localMediaFiles.length} total local files`);
    
    return mediaFiles
      .filter((file) => file.path) // Filter out files without a valid path
      .map((file) => {
        // Use the path directly if it's already a proper URL
        let mediaSrc: string;
        const path = file.path || '';
        if (path.startsWith("blob:") || path.startsWith("/api/") || path.startsWith("http")) {
          // Already a valid URL (blob, API path, or HTTP)
          mediaSrc = path;
        } else if (path) {
          // It's a file ID, construct the API path
          mediaSrc = `/api/latest/local-media/serve/${path}`;
        } else {
          // Fallback - shouldn't happen but just in case
          console.warn(`[MediaTab] File ${file.id} has no path, skipping`);
          mediaSrc = '';
        }

        return {
          id: file.id,
          type: file.type as "image" | "video" | "audio",
          src: mediaSrc,
          thumbnail: file.thumbnail || mediaSrc,
          name: file.name,
          duration: file.duration,
          isUserUpload: true,
          _isLocalMedia: true,
          width: file.width,
          height: file.height,
          audioNormalizationStatus: file.audioNormalizationStatus,
          hasEmbeddedAudio: file.hasEmbeddedAudio,
          normalizedAudioUrl: file.normalizedAudioUrl,
          originalLufs: file.originalLufs,
          normalizedLufs: file.normalizedLufs,
          truePeakDbtp: file.truePeakDbtp,
          audioNormalizationError: file.audioNormalizationError,
          audioNormalizedAt: file.audioNormalizedAt,
        };
      })
      .filter((item) => item.src); // Filter out items without a valid src
  }, [localMediaFiles]);

  // ====================================================================
  // [DEVTOOLS-MEDIA] START - DevTools media store integration.
  // Only loads when ?devtools=true is in the URL.
  // Remove this block and the import above when no longer needed.
  // ====================================================================
  const isDevToolsMode = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('devtools') === 'true';
  const allDevToolsItems = useDevToolsMediaStore((s) => s.items);
  const devToolsMediaItems = isDevToolsMode ? allDevToolsItems : EMPTY_DEVTOOLS_ITEMS;
  const fetchFromR2 = useDevToolsMediaStore((s) => s.fetchFromR2);

  // Fetch R2 media only in DevTools mode
  useEffect(() => {
    if (isDevToolsMode) fetchFromR2();
  }, [fetchFromR2, isDevToolsMode]);

  const devToolsAsMediaItems = useMemo<MediaItem[]>(() => {
    return devToolsMediaItems.map((dt) => ({
      id: dt.id,
      type: dt.type,
      src: dt.url,
      thumbnail: dt.type === 'audio' ? '' : dt.url,
      name: dt.name,
      isAiGenerated: true,
      isUserUpload: false,
      width: dt.width,
      height: dt.height,
    }));
  }, [devToolsMediaItems]);
  // [DEVTOOLS-MEDIA] END

  const allMediaItems = useMemo(() => {
    const combined = [...searchResults];

    // Add local items if they're not duplicated
    localMediaItems.forEach((localItem) => {
      if (!combined.find((item) => item.id === localItem.id)) {
        combined.push(localItem);
      }
    });

    // [DEVTOOLS-MEDIA] - Add devtools-generated media if not duplicated
    devToolsAsMediaItems.forEach((dtItem) => {
      if (!combined.find((item) => item.src === dtItem.src)) {
        combined.push(dtItem);
      }
    });
    // [DEVTOOLS-MEDIA] END

    return combined;
  }, [searchResults, localMediaItems, devToolsAsMediaItems]);

  // Filter items based on active filter
  const filteredItems = useMemo(() => {
    // Type priority for "all" view: video first, then images, then audio
    const TYPE_PRIORITY: Record<string, number> = { video: 0, image: 1, audio: 2 };

    switch (activeFilter) {
      case "images":
        return allMediaItems.filter((item) => item.type === "image");
      case "videos":
        return allMediaItems.filter((item) => item.type === "video");
      case "audio":
        return allMediaItems.filter((item) => item.type === "audio");
      case "uploads":
        return allMediaItems.filter((item) => item.isUserUpload);
      case "ai":
        return allMediaItems.filter((item) => item.isAiGenerated);
      default:
        // Sort by type priority: videos → images → audio
        return [...allMediaItems].sort(
          (a, b) => (TYPE_PRIORITY[a.type] ?? 9) - (TYPE_PRIORITY[b.type] ?? 9)
        );
    }
  }, [allMediaItems, activeFilter]);

  // Calculate counts for filter tabs
  const counts = useMemo(
    () => ({
      all: allMediaItems.length,
      images: allMediaItems.filter((item) => item.type === "image").length,
      videos: allMediaItems.filter((item) => item.type === "video").length,
      audio: allMediaItems.filter((item) => item.type === "audio").length,
      uploads: allMediaItems.filter((item) => item.isUserUpload).length,
      ai: allMediaItems.filter((item) => item.isAiGenerated).length,
    }),
    [allMediaItems]
  );

  // Handle search
  const handleSearch = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();

      const query = searchQuery.trim();
      if (!query) return;

      setIsSearching(true);
      setHasSearched(true);

      try {
        const results: MediaItem[] = [];

        // Search images and videos in parallel
        const [imageResults, videoResults] = await Promise.all([
          imageAdaptors.length > 0
            ? searchImages({ query, page: 1, perPage: 20 })
            : Promise.resolve({ items: [] }),
          videoAdaptors.length > 0
            ? searchVideos({ query, page: 1, perPage: 20 })
            : Promise.resolve({ items: [] }),
        ]);

        // Convert and add images
        imageResults.items.forEach((img: any) => {
          results.push(imageToMediaItem(img));
        });

        // Convert and add videos
        videoResults.items.forEach((vid: any) => {
          results.push(videoToMediaItem(vid));
        });

        setSearchResults(results);
      } catch (error) {
        console.error("Error searching media:", error);
      } finally {
        setIsSearching(false);
      }
    },
    [searchQuery, searchImages, searchVideos, imageAdaptors, videoAdaptors]
  );

  // Clear search
  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    setSearchResults([]);
    setHasSearched(false);
  }, []);

  // Handle file upload
  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (files && files.length > 0) {
        try {
          setUploadError(null);
          // Upload files one by one
          for (let i = 0; i < files.length; i++) {
            await addMediaFile(files[i]);
          }
          event.target.value = "";
        } catch (error) {
          console.error("Error uploading file:", error);
          setUploadError(error instanceof Error ? error.message : "Failed to upload file. Please try again.");
          event.target.value = "";
        }
      }
    },
    [addMediaFile]
  );

  // Handle dropped files
  const handleDroppedFiles = useCallback(
    async (files: FileList) => {
      console.log(`[MediaTab] Dropped ${files.length} file(s)`);
      if (files.length > 0) {
        try {
          setUploadError(null);
          let uploadedCount = 0;
          
          // Upload files one by one
          for (let i = 0; i < files.length; i++) {
            const file = files[i];
            console.log(`[MediaTab] Uploading file ${i + 1}/${files.length}: ${file.name} (${file.type})`);
            
            // Validate file type - images, videos, and audio are all valid
            const isValidMedia = file.type.startsWith('image/') || 
                                 file.type.startsWith('video/') || 
                                 file.type.startsWith('audio/');
            
            if (!isValidMedia) {
              console.warn(`[MediaTab] Skipping unsupported file type: ${file.type}`);
              setUploadError(`Unsupported file type: ${file.name}. Please upload images, videos, or audio files.`);
              continue;
            }
            
            await addMediaFile(file);
            uploadedCount++;
            console.log(`[MediaTab] Successfully uploaded: ${file.name}`);
          }
          
          // Show success message
          if (uploadedCount > 0 && uploadedCount === files.length) {
            // All files uploaded successfully - clear any previous errors
            setUploadError(null);
          }
        } catch (error) {
          console.error("[MediaTab] Error uploading dropped file:", error);
          setUploadError(error instanceof Error ? error.message : "Failed to upload file. Please try again.");
        }
      }
    },
    [addMediaFile]
  );

  // Drag and drop event handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    console.log('[MediaTab] Drag enter, types:', e.dataTransfer.types);
    
    // Check if the dragged item contains files
    // Check for 'Files' (most browsers) or 'application/x-moz-file' (Firefox)
    const hasFiles = e.dataTransfer.types.includes('Files') || 
                     e.dataTransfer.types.includes('application/x-moz-file') ||
                     (e.dataTransfer.items && e.dataTransfer.items.length > 0 && e.dataTransfer.items[0].kind === 'file');
    
    // Also ensure it's not a JSON drag (timeline items)
    const isTimelineItem = e.dataTransfer.types.includes('application/json');
    
    if (hasFiles && !isTimelineItem) {
      dragCounterRef.current += 1;
      console.log('[MediaTab] File drag detected, counter:', dragCounterRef.current);
      if (dragCounterRef.current === 1) {
        setIsDraggingOver(true);
      }
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Check if dragging files
    const hasFiles = e.dataTransfer.types.includes('Files') || 
                     e.dataTransfer.types.includes('application/x-moz-file') ||
                     (e.dataTransfer.items && e.dataTransfer.items.length > 0 && e.dataTransfer.items[0].kind === 'file');
    
    const isTimelineItem = e.dataTransfer.types.includes('application/json');
    
    if (hasFiles && !isTimelineItem) {
      e.dataTransfer.dropEffect = 'copy';
    } else {
      e.dataTransfer.dropEffect = 'none';
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    dragCounterRef.current -= 1;
    console.log('[MediaTab] Drag leave, counter:', dragCounterRef.current);
    if (dragCounterRef.current === 0) {
      setIsDraggingOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      console.log('[MediaTab] Drop event triggered');
      console.log('[MediaTab] Files in drop:', e.dataTransfer.files.length);
      
      dragCounterRef.current = 0;
      setIsDraggingOver(false);
      
      // Only handle file drops (not dragging timeline items)
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        // Filter out invalid files before processing
        const validFiles: File[] = [];
        const invalidFiles: string[] = [];
        
        Array.from(e.dataTransfer.files).forEach(file => {
          const isValidMedia = file.type.startsWith('image/') || 
                               file.type.startsWith('video/') || 
                               file.type.startsWith('audio/');
          
          if (isValidMedia) {
            validFiles.push(file);
          } else {
            invalidFiles.push(file.name);
          }
        });
        
        // Show error for invalid files
        if (invalidFiles.length > 0) {
          const errorMsg = invalidFiles.length === 1 
            ? `Invalid file type: ${invalidFiles[0]}. Only images, videos, and audio files are supported.`
            : `${invalidFiles.length} invalid files skipped. Only images, videos, and audio files are supported.`;
          setUploadError(errorMsg);
        }
        
        // Process valid files
        if (validFiles.length > 0) {
          const fileList = new DataTransfer();
          validFiles.forEach(file => fileList.items.add(file));
          await handleDroppedFiles(fileList.files);
        }
      } else {
        console.log('[MediaTab] No files in drop event');
      }
    },
    [handleDroppedFiles]
  );

  // Handle upload button click
  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Handle item click (add to timeline)
  const handleItemClick = useCallback((item: MediaItem) => {
    const blockReason = getNormalizationBlockReason({
      ...item,
      type: item.type,
    });
    if (blockReason) {
      window.alert(blockReason);
      return;
    }
    console.log("Add to timeline:", item);
    // Preview functionality could be added here
  }, []);

  // Handle drag start for timeline integration
  const handleDragStart = useCallback(
    (item: MediaItem) => (e: React.DragEvent) => {
      const blockReason = getNormalizationBlockReason({
        ...item,
        type: item.type,
      });
      if (blockReason) {
        e.preventDefault();
        window.alert(blockReason);
        return;
      }

      const normalizedAudioUrl = getNormalizedAudioUrl({
        ...item,
        type: item.type,
      });
      const mediaSrc =
        item.type === "audio" ? (normalizedAudioUrl || item.src) : item.src;
      const duration = item.duration || 5; // Default 5 seconds

      // Set drag data in dataTransfer for cross-component communication
      const dragData = {
        isNewItem: true,
        type: item.type,
        label: item.name,
        duration,
        data: {
          ...item,
          src: mediaSrc,
          originalUrl: item.src,
          file: mediaSrc,
          thumbnail: item.thumbnail,
          _isLocalMedia: item._isLocalMedia || false,
          normalizedAudioUrl: normalizedAudioUrl || item.normalizedAudioUrl || null,
          audioNormalizationStatus:
            item.audioNormalizationStatus ||
            (item.type === "image" ? "not_applicable" : undefined),
          hasEmbeddedAudio: item.hasEmbeddedAudio,
        },
      };

      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("application/json", JSON.stringify(dragData));

      // Use unified video-editor-store for drag state
      startMediaDrag(
        item.type as 'video' | 'image' | 'audio',
        mediaSrc,
        {
          duration,
          name: item.name,
          thumbnailUrl: item.type !== 'audio' ? item.thumbnail : undefined,
        }
      );

      // Create custom drag image
      const thumbnail = e.currentTarget.querySelector("img");
      if (thumbnail) {
        const dragPreview = document.createElement("div");
        dragPreview.style.cssText = `
          position: absolute;
          top: -9999px;
          width: 80px;
          height: 60px;
          overflow: hidden;
          border-radius: 4px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `;

        const clonedImg = thumbnail.cloneNode(true) as HTMLImageElement;
        clonedImg.style.cssText = `
          width: 80px;
          height: 60px;
          object-fit: cover;
        `;

        dragPreview.appendChild(clonedImg);
        document.body.appendChild(dragPreview);
        e.dataTransfer.setDragImage(dragPreview, 40, 30);

        setTimeout(() => dragPreview.remove(), 0);
      }
    },
    []
  );

  const handleDragEnd = useCallback(() => {
    endDrag(); // Clear unified store drag state
  }, []);

  // Selection mode handlers
  const toggleSelectionMode = useCallback(() => {
    setIsSelectionMode(prev => {
      if (prev) {
        // Exiting selection mode - clear selection
        setSelectedIds(new Set());
      }
      return !prev;
    });
  }, []);

  const toggleSelectItem = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    // Only select items that can be deleted (user uploads)
    const deletableIds = filteredItems
      .filter(item => item.isUserUpload || item._isLocalMedia)
      .map(item => item.id);
    setSelectedIds(new Set(deletableIds));
  }, [filteredItems]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Get selected items that can be deleted
  const selectedDeletableItems = useMemo(() => {
    return filteredItems.filter(
      item => selectedIds.has(item.id) && (item.isUserUpload || item._isLocalMedia)
    );
  }, [filteredItems, selectedIds]);

  // Delete handlers
  const handleDeleteSingle = useCallback((item: MediaItem) => {
    setItemToDelete(item);
    setDeleteDialogOpen(true);
  }, []);

  const handleDeleteSelected = useCallback(() => {
    if (selectedDeletableItems.length > 0) {
      setItemToDelete(null); // null means batch delete
      setDeleteDialogOpen(true);
    }
  }, [selectedDeletableItems]);

  const confirmDelete = useCallback(async () => {
    if (itemToDelete) {
      // Single delete
      await removeMediaFile(itemToDelete.id);
    } else {
      // Batch delete
      for (const item of selectedDeletableItems) {
        await removeMediaFile(item.id);
      }
      setSelectedIds(new Set());
    }
    setDeleteDialogOpen(false);
    setItemToDelete(null);
  }, [itemToDelete, selectedDeletableItems, removeMediaFile]);

  // Add to timeline handler (for context menu)
  const handleAddToTimelineFromContextMenu = useCallback((item: MediaItem) => {
    handleItemClick(item);
  }, [handleItemClick]);

  return (
    <div 
      className="h-full flex flex-col overflow-hidden bg-background"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header - naturally stacked */}
      <div className="flex-shrink-0 bg-background border-b border-border shadow-sm">
        {/* Top row: Search + Actions */}
        <div className="flex items-center gap-2 px-3 pt-3 pb-2.5">
          <form onSubmit={handleSearch} className="flex-1 flex gap-1.5">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                type="text"
                placeholder={hasAdaptors ? "Search images, videos & audio..." : "Search uploads..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-8 h-8 text-sm bg-muted/50 border-0 focus-visible:ring-1"
                disabled={isSelectionMode}
              />
              {searchQuery && !isSelectionMode && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {!isSelectionMode && hasAdaptors && (
              <Button
                type="submit"
                size="sm"
                className="h-8 px-2.5"
                disabled={isSearching || !searchQuery.trim()}
              >
                {isSearching ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Search className="h-3.5 w-3.5" />
                )}
              </Button>
            )}
          </form>
          
          {/* Action buttons */}
          <div className="flex items-center gap-1.5">
            {/* Upload button */}
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={handleUploadClick}
              disabled={isUploading || isSelectionMode}
            >
              {isUploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">Upload</span>
            </Button>
            
            {/* Selection mode toggle */}
            <Button
              type="button"
              size="sm"
              variant={isSelectionMode ? "default" : "secondary"}
              className="h-8 gap-1.5 text-xs"
              onClick={toggleSelectionMode}
            >
              {isSelectionMode ? (
                <>
                  <X className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Done</span>
                </>
              ) : (
                <>
                  <CheckSquare className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Select</span>
                </>
              )}
            </Button>
          </div>
        </div>
        
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileUpload}
          accept="image/*,video/*,audio/*"
          multiple
          disabled={isUploading}
        />

        {/* Selection Toolbar - shown when in selection mode */}
        {isSelectionMode && (
          <div className="flex items-center justify-between gap-2 px-3 py-2 bg-primary/10">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium">
                {selectedIds.size} selected
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 text-xs px-2"
                onClick={selectedIds.size === filteredItems.filter(i => i.isUserUpload || i._isLocalMedia).length ? deselectAll : selectAll}
              >
                {selectedIds.size === filteredItems.filter(i => i.isUserUpload || i._isLocalMedia).length ? "Deselect All" : "Select All"}
              </Button>
            </div>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              className="h-6 text-xs gap-1"
              onClick={handleDeleteSelected}
              disabled={selectedDeletableItems.length === 0}
            >
              <Trash2 className="h-3 w-3" />
              Delete {selectedDeletableItems.length > 0 && `(${selectedDeletableItems.length})`}
            </Button>
          </div>
        )}

        {/* Filter Tabs */}
        <div className="px-3 py-1.5">
          <FilterTabs
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
            counts={counts}
          />
        </div>
      </div>

      {/* Content Area - flexbox takes remaining space */}
      <div className="flex-1 overflow-hidden bg-background">
        <ScrollArea className="h-full w-full sidepanel-scrollbar">
          <div className="p-3">
          {/* Upload Message */}
          {uploadError && (
            <div className={cn(
              "mb-3 p-2 rounded-md text-xs",
              uploadError.startsWith('✓')
                ? "bg-primary/10 border border-primary/20 text-primary"
                : "bg-destructive/10 border border-destructive/20 text-destructive"
            )}>
              {uploadError}
            </div>
          )}

          {/* Loading State */}
          {isSearching && (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">Searching media...</p>
            </div>
          )}

          {/* Media Grid */}
          {!isSearching && filteredItems.length > 0 && (
            <div className="grid grid-cols-2 gap-2.5">
              {filteredItems.map((item) => (
                <MediaGridItem
                  key={item.id}
                  item={item}
                  onClick={() => handleItemClick(item)}
                  onDragStart={handleDragStart(item)}
                  onDragEnd={handleDragEnd}
                  isSelectionMode={isSelectionMode}
                  isSelected={selectedIds.has(item.id)}
                  onToggleSelect={() => toggleSelectItem(item.id)}
                  onDelete={() => handleDeleteSingle(item)}
                  onAddToTimeline={() => handleAddToTimelineFromContextMenu(item)}
                  canDelete={item.isUserUpload || item._isLocalMedia || false}
                />
              ))}
            </div>
          )}

          {/* Empty State */}
          {!isSearching && filteredItems.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8">
              {activeFilter === "uploads" ? (
                <>
                  {/* Upload Drop Zone */}
                  <button
                    onClick={handleUploadClick}
                    disabled={isUploading}
                    className={cn(
                      "w-full max-w-[200px] aspect-video rounded-lg border-2 border-dashed",
                      "flex flex-col items-center justify-center gap-2",
                      "transition-all cursor-pointer group",
                      "border-primary/30 hover:border-primary/60 hover:bg-primary/5",
                      "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                    )}
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
                      "bg-primary/10 group-hover:bg-primary/20"
                    )}>
                      {isUploading ? (
                        <Loader2 className="h-5 w-5 text-primary animate-spin" />
                      ) : (
                        <Upload className="h-5 w-5 text-primary" />
                      )}
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-foreground">
                        {isUploading ? "Uploading..." : "Upload Media"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Images, videos & audio
                      </p>
                    </div>
                  </button>
                </>
              ) : activeFilter === "ai" ? (
                <>
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                    <Sparkles className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    No AI Media
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 text-center max-w-[180px]">
                    AI-generated content will appear here
                  </p>
                </>
              ) : activeFilter === "images" ? (
                <>
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                    <ImageIcon className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    No Images
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 text-center max-w-[180px]">
                    {hasAdaptors ? "Search or upload images" : "Upload images to get started"}
                  </p>
                  <Button
                    size="sm"
                    className="mt-3 h-7 gap-1 text-xs"
                    onClick={handleUploadClick}
                  >
                    <Upload className="h-3 w-3" />
                    Upload
                  </Button>
                </>
              ) : activeFilter === "videos" ? (
                <>
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                    <Film className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    No Videos
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 text-center max-w-[180px]">
                    {hasAdaptors ? "Search or upload videos" : "Upload videos to get started"}
                  </p>
                  <Button
                    size="sm"
                    className="mt-3 h-7 gap-1 text-xs"
                    onClick={handleUploadClick}
                  >
                    <Upload className="h-3 w-3" />
                    Upload
                  </Button>
                </>
              ) : activeFilter === "audio" ? (
                <>
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                    <Music2 className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    No Audio
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 text-center max-w-[180px]">
                    {hasAdaptors ? "Search or upload audio" : "Upload audio files to get started"}
                  </p>
                  <Button
                    size="sm"
                    className="mt-3 h-7 gap-1 text-xs"
                    onClick={handleUploadClick}
                  >
                    <Upload className="h-3 w-3" />
                    Upload
                  </Button>
                </>
              ) : hasSearched ? (
                <>
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                    <Search className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    No Results
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Try different keywords
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-3 h-7 text-xs gap-1"
                    onClick={handleClearSearch}
                  >
                    <X className="h-3 w-3" />
                    Clear
                  </Button>
                </>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                    <FolderOpen className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    {hasAdaptors ? "Search or Upload" : "Add Media"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 text-center max-w-[180px]">
                    {hasAdaptors
                      ? "Search stock media or upload your own"
                      : "Upload images, videos, and audio"}
                  </p>
                  <Button
                    size="sm"
                    className="mt-3 h-7 gap-1 text-xs"
                    onClick={handleUploadClick}
                  >
                    <Upload className="h-3 w-3" />
                    Upload
                  </Button>
                </>
              )}
            </div>
          )}
          </div>
        </ScrollArea>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {itemToDelete 
                ? "Delete Media" 
                : `Delete ${selectedDeletableItems.length} Item${selectedDeletableItems.length !== 1 ? 's' : ''}`
              }
            </AlertDialogTitle>
            <AlertDialogDescription>
              {itemToDelete 
                ? `Are you sure you want to delete "${itemToDelete.name}"? This action cannot be undone.`
                : `Are you sure you want to delete ${selectedDeletableItems.length} selected item${selectedDeletableItems.length !== 1 ? 's' : ''}? This action cannot be undone.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Drag and Drop Overlay */}
      {isDraggingOver && !isSelectionMode && (
        <div className="absolute inset-0 z-50 bg-primary/15 backdrop-blur-sm border-4 border-primary border-dashed rounded-lg flex items-center justify-center animate-in fade-in duration-200">
          <div className="bg-background/95 rounded-xl px-10 py-8 flex flex-col items-center gap-4 shadow-2xl border-2 border-primary/30">
            <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center animate-pulse">
              <Upload className="h-10 w-10 text-primary" />
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-foreground mb-2">Drop files here to upload</p>
              <p className="text-sm text-muted-foreground">
                Supported formats: Images (JPG, PNG, GIF, WebP), Videos (MP4, WebM, MOV), Audio (MP3, WAV, OGG)
              </p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default MediaTab;
