/**
 * AudioTab - Music and sound effects browser
 *
 * Features:
 * - Search audio via adaptors
 * - Preview audio with waveform visualization
 * - Add to timeline via drag
 * - Upload custom audio
 * - Filter by music, SFX, and uploads
 */

import React, { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { cn } from "../../../utils/general/utils";
import { ScrollArea } from "../../ui/scroll-area";
import { Input } from "../../ui/input";
import { Button } from "../../ui/button";
import { Slider } from "../../ui/slider";
import { Tabs, TabsList, TabsTrigger } from "../../ui/tabs";
import {
  Search,
  Upload,
  Music2,
  Volume2,
  Play,
  Pause,
  Loader2,
  X,
  Plus,
  Square,
  VolumeX,
} from "lucide-react";
import { useMediaAdaptors } from "../../../contexts/media-adaptor-context";
import { useLocalMedia } from "../../../contexts/local-media-context";
import { startMediaDrag, endDrag } from "../../../stores/video-editor-store";
import { StandardAudio } from "../../../types/media-adaptors";

// ==========================================
// TYPES
// ==========================================

type AudioFilter = "all" | "music" | "sfx" | "uploads";

interface AudioItem {
  id: string;
  type: "music" | "sfx";
  name: string;
  artist?: string;
  src: string;
  duration: number; // in seconds
  isUserUpload?: boolean;
  _source?: string;
  _sourceDisplayName?: string;
  _isLocalMedia?: boolean;
}

// ==========================================
// FILTER TABS COMPONENT
// ==========================================

interface FilterTabsProps {
  activeFilter: AudioFilter;
  onFilterChange: (filter: AudioFilter) => void;
  counts: {
    all: number;
    music: number;
    sfx: number;
    uploads: number;
  };
}

const FilterTabs: React.FC<FilterTabsProps> = ({
  activeFilter,
  onFilterChange,
  counts,
}) => (
  <Tabs
    value={activeFilter}
    onValueChange={(v) => onFilterChange(v as AudioFilter)}
  >
    <TabsList className="w-full h-8 bg-muted/30 p-0.5 rounded-md">
      <TabsTrigger
        value="all"
        className="flex-1 h-full text-xs px-2 rounded-sm"
      >
        All{counts.all > 0 && ` (${counts.all})`}
      </TabsTrigger>
      <TabsTrigger
        value="music"
        className="flex-1 h-full text-xs px-2 rounded-sm gap-1"
      >
        <Music2 className="h-3 w-3" />
        Music
      </TabsTrigger>
      <TabsTrigger
        value="sfx"
        className="flex-1 h-full text-xs px-2 rounded-sm gap-1"
      >
        <Volume2 className="h-3 w-3" />
        SFX
      </TabsTrigger>
      <TabsTrigger
        value="uploads"
        className="flex-1 h-full text-xs px-2 rounded-sm"
      >
        Uploads{counts.uploads > 0 && ` (${counts.uploads})`}
      </TabsTrigger>
    </TabsList>
  </Tabs>
);

// ==========================================
// AUDIO LIST ITEM COMPONENT
// ==========================================

interface AudioListItemProps {
  item: AudioItem;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

const AudioListItem: React.FC<AudioListItemProps> = ({
  item,
  isPlaying,
  onTogglePlay,
  onDragStart,
  onDragEnd,
}) => {
  return (
    <div
      className={cn(
        "flex items-center gap-2 p-2 rounded-md",
        "bg-muted/30 hover:bg-muted/50 transition-colors",
        "cursor-grab active:cursor-grabbing",
        isPlaying && "ring-1 ring-primary bg-primary/5"
      )}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      {/* Play/Pause Button */}
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "h-8 w-8 shrink-0 rounded-full",
          isPlaying && "bg-primary text-primary-foreground hover:bg-primary/90"
        )}
        onClick={(e) => {
          e.stopPropagation();
          onTogglePlay();
        }}
      >
        {isPlaying ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4 ml-0.5" />
        )}
      </Button>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{item.name}</p>
        <p className="text-xs text-muted-foreground truncate">
          {item.artist || item._sourceDisplayName || "Unknown"}
        </p>
      </div>

      {/* Type Badge */}
      {item.isUserUpload && (
        <div className="px-1.5 py-0.5 bg-blue-500/20 text-blue-500 rounded text-[10px]">
          Upload
        </div>
      )}

      {/* Duration */}
      <span className="text-xs text-muted-foreground tabular-nums shrink-0 font-mono">
        {formatDuration(item.duration)}
      </span>

      {/* Add Button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={(e) => {
          e.stopPropagation();
          // Quick add functionality could go here
        }}
        title="Add to timeline"
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
};

// ==========================================
// AUDIO PREVIEW PLAYER
// ==========================================

interface AudioPreviewPlayerProps {
  src: string | null;
  isPlaying: boolean;
  onPlayStateChange: (playing: boolean) => void;
  onEnded: () => void;
}

const AudioPreviewPlayer: React.FC<AudioPreviewPlayerProps> = ({
  src,
  isPlaying,
  onPlayStateChange,
  onEnded,
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [volume, setVolume] = useState(0.5);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying && src) {
      audio.src = src;
      audio.volume = isMuted ? 0 : volume;
      audio.play().catch(console.error);
    } else {
      audio.pause();
    }
  }, [isPlaying, src, volume, isMuted]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleDurationChange = () => setDuration(audio.duration);
    const handleEnded = () => {
      onEnded();
      setCurrentTime(0);
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("durationchange", handleDurationChange);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("durationchange", handleDurationChange);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [onEnded]);

  if (!src) return null;

  return (
    <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-background border shadow-lg">
        <audio ref={audioRef} />

        {/* Play/Pause */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full"
          onClick={() => onPlayStateChange(!isPlaying)}
        >
          {isPlaying ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4 ml-0.5" />
          )}
        </Button>

        {/* Progress */}
        <div className="flex items-center gap-2 min-w-[150px]">
          <span className="text-xs tabular-nums w-8">
            {formatDuration(currentTime)}
          </span>
          <Slider
            value={[currentTime]}
            max={duration || 100}
            step={0.1}
            className="w-24"
            onValueChange={([val]) => {
              if (audioRef.current) {
                audioRef.current.currentTime = val;
              }
            }}
          />
          <span className="text-xs tabular-nums w-8">
            {formatDuration(duration)}
          </span>
        </div>

        {/* Volume */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full"
          onClick={() => setIsMuted(!isMuted)}
        >
          {isMuted ? (
            <VolumeX className="h-4 w-4" />
          ) : (
            <Volume2 className="h-4 w-4" />
          )}
        </Button>

        {/* Close */}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 rounded-full"
          onClick={() => {
            onPlayStateChange(false);
            onEnded();
          }}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
};

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// Convert StandardAudio to AudioItem
function audioToItem(
  audio: StandardAudio & { _source?: string; _sourceDisplayName?: string }
): AudioItem {
  return {
    id: audio.id,
    type: "music", // Default to music, could be determined by source/metadata
    name: audio.title || `Audio ${audio.id}`,
    artist: audio.artist,
    src: (audio as any).src || (audio as any).url || '',
    duration: audio.duration || 0,
    _source: audio._source,
    _sourceDisplayName: audio._sourceDisplayName,
  };
}

// ==========================================
// AUDIO TAB COMPONENT
// ==========================================

export const AudioTab: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<AudioFilter>("all");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<AudioItem[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playingSrc, setPlayingSrc] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Drag and drop state
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCounterRef = useRef(0);

  // Get audio adaptors and local media
  const { searchAudio, audioAdaptors } = useMediaAdaptors();
  const { localMediaFiles, addMediaFile, isLoading: isUploading } =
    useLocalMedia();

  const hasAdaptors = audioAdaptors.length > 0;

  // Convert local audio files to AudioItem format
  const localAudioItems = useMemo<AudioItem[]>(() => {
    const audioFiles = localMediaFiles.filter((file) => file.type === "audio");
    console.log(`[AudioTab] Processing ${audioFiles.length} audio files from localMediaFiles`);
    
    const items = audioFiles
      .filter((file) => file.path) // Filter out files without a valid path
      .map((file) => {
        // Use the path directly if it's already a proper URL
        let mediaSrc: string;
        const path = file.path || '';
        if (path.startsWith("blob:") || path.startsWith("/api/") || path.startsWith("http")) {
          // Already a valid URL (blob, API path, or HTTP/HTTPS)
          mediaSrc = path;
        } else if (path) {
          // It's a file ID, construct the API path
          mediaSrc = `/api/latest/local-media/serve/${path}`;
        } else {
          // Fallback - shouldn't happen but just in case
          console.warn(`[AudioTab] File ${file.id} has no path, skipping`);
          mediaSrc = '';
        }

        console.log(`[AudioTab] Converted audio file: ${file.name} -> ${mediaSrc.substring(0, 60)}...`);
        
        return {
          id: file.id,
          type: "music" as const,
          name: file.name,
          src: mediaSrc,
          duration: file.duration || 0,
          isUserUpload: true,
          _isLocalMedia: true,
        };
      })
      .filter((item) => item.src); // Filter out items without a valid src
    
    console.log(`[AudioTab] Converted ${items.length} audio items`);
    return items;
  }, [localMediaFiles]);

  // Combined items
  const allAudioItems = useMemo(() => {
    const combined = [...searchResults];
    localAudioItems.forEach((localItem) => {
      if (!combined.find((item) => item.id === localItem.id)) {
        combined.push(localItem);
      }
    });
    return combined;
  }, [searchResults, localAudioItems]);

  // Filter items
  const filteredItems = useMemo(() => {
    switch (activeFilter) {
      case "music":
        return allAudioItems.filter((item) => item.type === "music");
      case "sfx":
        return allAudioItems.filter((item) => item.type === "sfx");
      case "uploads":
        return allAudioItems.filter((item) => item.isUserUpload);
      default:
        return allAudioItems;
    }
  }, [allAudioItems, activeFilter]);

  // Counts for filter tabs
  const counts = useMemo(
    () => ({
      all: allAudioItems.length,
      music: allAudioItems.filter((item) => item.type === "music").length,
      sfx: allAudioItems.filter((item) => item.type === "sfx").length,
      uploads: allAudioItems.filter((item) => item.isUserUpload).length,
    }),
    [allAudioItems]
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
        const results = await searchAudio({ query, page: 1, perPage: 30 });
        setSearchResults(results.items.map((audio: any) => audioToItem(audio)));
      } catch (error) {
        console.error("Error searching audio:", error);
      } finally {
        setIsSearching(false);
      }
    },
    [searchQuery, searchAudio]
  );

  // Clear search
  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    setSearchResults([]);
    setHasSearched(false);
  }, []);

  // Toggle play preview
  const handleTogglePlay = useCallback(
    (item: AudioItem) => {
      if (playingId === item.id) {
        setPlayingId(null);
        setPlayingSrc(null);
      } else {
        setPlayingId(item.id);
        setPlayingSrc(item.src);
      }
    },
    [playingId]
  );

  // Handle file upload
  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (files && files.length > 0) {
        try {
          setUploadError(null);
          await addMediaFile(files[0]);
          event.target.value = "";
        } catch (error) {
          console.error("Error uploading file:", error);
          setUploadError("Failed to upload audio. Please try again.");
          event.target.value = "";
        }
      }
    },
    [addMediaFile]
  );

  // Handle dropped files
  const handleDroppedFiles = useCallback(
    async (files: FileList) => {
      console.log(`[AudioTab] Dropped ${files.length} file(s)`);
      if (files.length > 0) {
        try {
          setUploadError(null);
          // Upload files one by one
          for (let i = 0; i < files.length; i++) {
            const file = files[i];
            console.log(`[AudioTab] Uploading file ${i + 1}/${files.length}: ${file.name} (${file.type})`);
            
            // Validate file type
            if (!file.type.startsWith('audio/')) {
              console.warn(`[AudioTab] Skipping unsupported file type: ${file.type}`);
              setUploadError(`Unsupported file type: ${file.name}. Please upload audio files only.`);
              continue;
            }
            
            await addMediaFile(file);
            console.log(`[AudioTab] Successfully uploaded: ${file.name}`);
          }
        } catch (error) {
          console.error("[AudioTab] Error uploading dropped file:", error);
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
    
    console.log('[AudioTab] Drag enter, types:', e.dataTransfer.types);
    
    // Check if the dragged item contains files
    // Check for 'Files' (most browsers) or 'application/x-moz-file' (Firefox)
    const hasFiles = e.dataTransfer.types.includes('Files') || 
                     e.dataTransfer.types.includes('application/x-moz-file') ||
                     (e.dataTransfer.items && e.dataTransfer.items.length > 0 && e.dataTransfer.items[0].kind === 'file');
    
    // Also ensure it's not a JSON drag (timeline items)
    const isTimelineItem = e.dataTransfer.types.includes('application/json');
    
    if (hasFiles && !isTimelineItem) {
      dragCounterRef.current += 1;
      console.log('[AudioTab] File drag detected, counter:', dragCounterRef.current);
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
    console.log('[AudioTab] Drag leave, counter:', dragCounterRef.current);
    if (dragCounterRef.current === 0) {
      setIsDraggingOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      console.log('[AudioTab] Drop event triggered');
      console.log('[AudioTab] Files in drop:', e.dataTransfer.files.length);
      
      dragCounterRef.current = 0;
      setIsDraggingOver(false);
      
      // Only handle file drops (not dragging timeline items)
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        // Filter out invalid files before processing
        const validFiles: File[] = [];
        const invalidFiles: string[] = [];
        
        Array.from(e.dataTransfer.files).forEach(file => {
          const isValidAudio = file.type.startsWith('audio/');
          
          if (isValidAudio) {
            validFiles.push(file);
          } else {
            invalidFiles.push(file.name);
          }
        });
        
        // Show error for invalid files
        if (invalidFiles.length > 0) {
          const errorMsg = invalidFiles.length === 1 
            ? `Invalid file type: ${invalidFiles[0]}. Only audio files are supported.`
            : `${invalidFiles.length} invalid files skipped. Only audio files are supported.`;
          setUploadError(errorMsg);
        }
        
        // Process valid files
        if (validFiles.length > 0) {
          const fileList = new DataTransfer();
          validFiles.forEach(file => fileList.items.add(file));
          await handleDroppedFiles(fileList.files);
        }
      } else {
        console.log('[AudioTab] No files in drop event');
      }
    },
    [handleDroppedFiles]
  );

  // Handle drag start
  const handleDragStart = useCallback(
    (item: AudioItem) => (e: React.DragEvent) => {
      const duration = item.duration || 5;
      
      const dragData = {
        isNewItem: true,
        type: "audio",
        label: item.name,
        duration,
        data: {
          ...item,
          file: item.src,
          title: item.name,
          _isLocalMedia: item._isLocalMedia || false,
        },
      };

      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("application/json", JSON.stringify(dragData));

      // Set drag state in video-editor-store (unified state management)
      startMediaDrag('audio', item.src, {
        duration,
        name: item.name,
      });

      // Create audio drag preview
      const dragPreview = document.createElement("div");
      dragPreview.style.cssText = `
        position: absolute;
        top: -9999px;
        width: 80px;
        height: 40px;
        background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 20px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      `;
      dragPreview.innerHTML = "🎵";
      document.body.appendChild(dragPreview);
      e.dataTransfer.setDragImage(dragPreview, 40, 20);
      setTimeout(() => dragPreview.remove(), 0);
    },
    []
  );

  const handleDragEnd = useCallback(() => {
    endDrag(); // Clear unified store drag state
  }, []);

  const SEARCH_BAR_HEIGHT = 110;
  
  return (
    <div 
      className="relative h-full overflow-hidden"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Search Bar - fixed at top */}
      <div className="absolute top-0 left-0 right-0 z-10 p-3 space-y-3 border-b border-border bg-background">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder={
                hasAdaptors ? "Search audio..." : "Upload your own audio"
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-8 h-9 bg-muted/50"
              disabled={!hasAdaptors}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button
            type="submit"
            size="sm"
            className="h-9"
            disabled={isSearching || !hasAdaptors || !searchQuery.trim()}
          >
            {isSearching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </Button>
        </form>

        {/* Filter Tabs */}
        <FilterTabs
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          counts={counts}
        />
      </div>

      {/* Content Area - absolute positioned below search bar */}
      <div 
        className="absolute left-0 right-0 bottom-0 overflow-hidden"
        style={{ top: `${SEARCH_BAR_HEIGHT}px` }}
      >
        <ScrollArea className="h-full w-full sidepanel-scrollbar">
          <div className="p-3">
          {/* Upload Button */}
          <Button
            variant="outline"
            className="w-full h-16 border-dashed mb-4 flex flex-col gap-1 hover:border-primary hover:bg-primary/5"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Upload className="h-5 w-5" />
            )}
            <span className="text-xs">Upload Audio</span>
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileUpload}
            accept="audio/*"
            disabled={isUploading}
          />

          {/* Upload Error */}
          {uploadError && (
            <div className="mb-4 p-2 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs">
              {uploadError}
            </div>
          )}

          {/* Loading State */}
          {isSearching && (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">Searching audio...</p>
            </div>
          )}

          {/* Audio List */}
          {!isSearching && filteredItems.length > 0 && (
            <div className="space-y-2">
              {filteredItems.map((item) => (
                <AudioListItem
                  key={item.id}
                  item={item}
                  isPlaying={playingId === item.id}
                  onTogglePlay={() => handleTogglePlay(item)}
                  onDragStart={handleDragStart(item)}
                  onDragEnd={handleDragEnd}
                />
              ))}
            </div>
          )}

          {/* Empty State */}
          {!isSearching && filteredItems.length === 0 && (
            <div className="text-center py-8">
              <Music2 className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-1">
                {hasSearched ? "No audio found" : "No audio yet"}
              </p>
              <p className="text-xs text-muted-foreground/70">
                {hasAdaptors
                  ? "Search for music and sound effects or upload your own"
                  : "Upload your own audio files to get started"}
              </p>
            </div>
          )}
          </div>
        </ScrollArea>
      </div>

      {/* Audio Preview Player */}
      <AudioPreviewPlayer
        src={playingSrc}
        isPlaying={playingId !== null}
        onPlayStateChange={(playing) => {
          if (!playing) {
            setPlayingId(null);
          }
        }}
        onEnded={() => {
          setPlayingId(null);
          setPlayingSrc(null);
        }}
      />

      {/* Drag and Drop Overlay */}
      {isDraggingOver && (
        <div className="absolute inset-0 z-50 bg-primary/15 backdrop-blur-sm border-4 border-primary border-dashed rounded-lg flex items-center justify-center animate-in fade-in duration-200">
          <div className="bg-background/95 rounded-xl px-10 py-8 flex flex-col items-center gap-4 shadow-2xl border-2 border-primary/30">
            <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center animate-pulse">
              <Upload className="h-10 w-10 text-primary" />
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-foreground mb-2">Drop audio files here to upload</p>
              <p className="text-sm text-muted-foreground">
                Supported formats: MP3, WAV, OGG, FLAC, AAC, M4A
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AudioTab;
