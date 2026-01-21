"use client";

import React, { useState, useMemo } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Film,
  Image,
  Music,
  Plus,
  Play,
  Clock,
  Eye,
  Search,
  X,
  Upload,
  Grid3X3,
  Tag,
  FileText,
  Star,
  Check,
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

interface Step2StockMediaProps {
  onNext: () => void;
  onBack: () => void;
  isLocked?: boolean;
}

type MediaCategory = "all" | "video" | "image" | "audio" | "uploaded";

interface MediaItem {
  id: string;
  type: "video" | "image" | "audio";
  name: string;
  thumbnail: string | null;
  duration?: string;
  durationSeconds?: number;
  source: "pexels" | "pixabay" | "uploaded";
  selected?: boolean;
  description: string;
  tags: string[];
  transcript?: string;
  quality: number;
}

// Enhanced mock data
const MOCK_MEDIA: MediaItem[] = [
  {
    id: "1",
    type: "video",
    name: "Aerial City View",
    thumbnail:
      "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=400&h=300&fit=crop",
    duration: "0:15",
    durationSeconds: 15,
    source: "pexels",
    description:
      "Stunning aerial drone footage of a modern city skyline during golden hour with traffic flowing through streets.",
    tags: ["aerial", "city", "urban", "skyline", "drone"],
    transcript: "No speech content - ambient city sounds only",
    quality: 92,
  },
  {
    id: "2",
    type: "video",
    name: "Ocean Waves",
    thumbnail:
      "https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=400&h=300&fit=crop",
    duration: "0:22",
    durationSeconds: 22,
    source: "pexels",
    description:
      "Peaceful ocean waves crashing on a sandy beach with turquoise water and white foam.",
    tags: ["ocean", "waves", "beach", "nature", "relaxing"],
    transcript: "No speech content - ocean ambient sounds",
    quality: 88,
  },
  {
    id: "3",
    type: "image",
    name: "Mountain Landscape",
    thumbnail:
      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop",
    source: "pixabay",
    description:
      "Majestic snow-capped mountain peaks at sunrise with dramatic clouds and alpine meadows.",
    tags: ["mountain", "landscape", "nature", "sunrise", "scenic"],
    quality: 95,
  },
  {
    id: "4",
    type: "image",
    name: "Abstract Background",
    thumbnail:
      "https://images.unsplash.com/photo-1557682250-33bd709cbe85?w=400&h=300&fit=crop",
    source: "pexels",
    description:
      "Vibrant purple and pink gradient abstract background with smooth flowing lines.",
    tags: ["abstract", "gradient", "background", "colorful", "design"],
    quality: 85,
  },
  {
    id: "5",
    type: "audio",
    name: "Cinematic Ambience",
    thumbnail: null,
    duration: "2:34",
    durationSeconds: 154,
    source: "pixabay",
    description:
      "Atmospheric cinematic soundtrack with deep bass, subtle tension, and growing intensity.",
    tags: ["cinematic", "ambient", "dramatic", "soundtrack", "film"],
    transcript: "Instrumental track - no speech content",
    quality: 90,
  },
  {
    id: "6",
    type: "video",
    name: "Nature Timelapse",
    thumbnail:
      "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=400&h=300&fit=crop",
    duration: "0:30",
    durationSeconds: 30,
    source: "pexels",
    description:
      "Beautiful timelapse of clouds moving over a lush green forest with sunlight beams.",
    tags: ["timelapse", "nature", "forest", "clouds", "sunlight"],
    transcript: "No speech content - nature ambience",
    quality: 91,
  },
  {
    id: "7",
    type: "image",
    name: "Technology Pattern",
    thumbnail:
      "https://images.unsplash.com/photo-1518770660439-4636190af475?w=400&h=300&fit=crop",
    source: "pixabay",
    description:
      "Close-up of a circuit board with microchips and electronic components in blue tones.",
    tags: ["technology", "circuit", "electronics", "tech", "hardware"],
    quality: 87,
  },
  {
    id: "8",
    type: "audio",
    name: "Uplifting Music",
    thumbnail: null,
    duration: "3:12",
    durationSeconds: 192,
    source: "pexels",
    description:
      "Inspiring and uplifting orchestral music with piano and strings building to a crescendo.",
    tags: ["uplifting", "inspiring", "orchestral", "motivational", "positive"],
    transcript: "Instrumental track - no speech content",
    quality: 94,
  },
  {
    id: "9",
    type: "video",
    name: "Business Meeting",
    thumbnail:
      "https://images.unsplash.com/photo-1556761175-b413da4baf72?w=400&h=300&fit=crop",
    duration: "0:18",
    durationSeconds: 18,
    source: "pixabay",
    description:
      "Professional team collaborating in a modern office conference room with laptops.",
    tags: ["business", "meeting", "office", "teamwork", "corporate"],
    transcript: "Muffled conversation - corporate meeting discussion",
    quality: 82,
  },
  {
    id: "10",
    type: "image",
    name: "Sunset Sky",
    thumbnail:
      "https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?w=400&h=300&fit=crop",
    source: "pexels",
    description:
      "Dramatic sunset sky with vibrant orange, pink, and purple clouds over the horizon.",
    tags: ["sunset", "sky", "clouds", "colorful", "dramatic"],
    quality: 96,
  },
  {
    id: "11",
    type: "audio",
    name: "Dramatic Score",
    thumbnail: null,
    duration: "1:45",
    durationSeconds: 105,
    source: "pixabay",
    description:
      "Intense dramatic score with percussion, strings, and brass building suspense.",
    tags: ["dramatic", "intense", "suspense", "score", "tension"],
    transcript: "Instrumental track - no speech content",
    quality: 89,
  },
  {
    id: "12",
    type: "video",
    name: "Space Animation",
    thumbnail:
      "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=400&h=300&fit=crop",
    duration: "0:25",
    durationSeconds: 25,
    source: "pexels",
    description:
      "CGI animation of Earth from space with stars, satellites, and the Milky Way galaxy.",
    tags: ["space", "earth", "galaxy", "animation", "cosmos"],
    quality: 93,
  },
];

export function Step2StockMedia({
  onNext,
  onBack,
  isLocked = false,
}: Step2StockMediaProps) {
  const [activeTab, setActiveTab] = useState<MediaCategory>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [mediaItems, setMediaItems] = useState<MediaItem[]>(MOCK_MEDIA);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [previewItem, setPreviewItem] = useState<MediaItem | null>(null);

  // Filter media based on active tab and search
  const filteredMedia = useMemo(() => {
    return mediaItems.filter((item) => {
      // For "uploaded" tab, only show items with source "uploaded"
      // For type tabs (video, image, audio), show all items of that type regardless of source
      // For "all" tab, show everything
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
              Browse and select media for your video
            </p>
          </div>
        </div>

        {/* Statistics - 1x3 vertical layout, flex-1 to fill space */}
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

            {/* Rating */}
            <div className="flex-1 p-4 bg-neutral-800/50 rounded-lg flex flex-col items-center justify-center">
              <div className="flex items-center gap-2 mb-2">
                <Star className="w-5 h-5 text-yellow-400" />
                <span className="text-sm text-neutral-400">Rating</span>
              </div>
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className="w-5 h-5 text-yellow-400 fill-yellow-400"
                  />
                ))}
              </div>
              <div className="text-xs text-neutral-500 mt-1">5.0 / 5.0</div>
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
              {/* Upload Button */}
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
            {/* File Upload */}
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

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-neutral-700" />
              <span className="text-xs text-neutral-500 uppercase tracking-wider">
                or
              </span>
              <div className="flex-1 h-px bg-neutral-700" />
            </div>

            {/* YouTube URL */}
            <div className="space-y-2">
              <label className="text-xs text-neutral-400 uppercase tracking-wider font-medium">
                Import from YouTube
              </label>
              <div className="relative">
                <Film className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                <Input
                  placeholder="Paste YouTube URL..."
                  className="pl-10 bg-neutral-800/50 border-neutral-700 text-sm focus:border-orange-500/50"
                />
              </div>
              <p className="text-[10px] text-neutral-500">
                Audio and video will be extracted from the YouTube video
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
                {previewItem.type === "video" && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <button className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white/30 transition-colors">
                      <Play className="w-8 h-8 text-white ml-1" />
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="aspect-video bg-gradient-to-br from-purple-900/30 to-neutral-900 rounded-lg flex flex-col items-center justify-center gap-4">
                <Music className="w-16 h-16 text-purple-500/50" />
                <div className="flex items-center gap-4 text-neutral-400">
                  <button className="p-3 bg-neutral-800 rounded-full hover:bg-neutral-700 transition-colors">
                    <Play className="w-6 h-6" />
                  </button>
                  <span className="text-lg font-mono">
                    {previewItem?.duration}
                  </span>
                </div>
              </div>
            )}

            {/* Description */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-neutral-500 uppercase tracking-wider">
                <FileText className="w-3.5 h-3.5" />
                Description
              </div>
              <p className="text-neutral-300 text-sm leading-relaxed">
                {previewItem?.description}
              </p>
            </div>

            {/* Tags */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-neutral-500 uppercase tracking-wider">
                <Tag className="w-3.5 h-3.5" />
                Tags
              </div>
              <div className="flex flex-wrap gap-2">
                {previewItem?.tags.map((tag, i) => (
                  <span
                    key={i}
                    className="px-2.5 py-1 bg-neutral-800 rounded-full text-xs text-neutral-300"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Metadata Row */}
            <div className="grid grid-cols-2 gap-4">
              {/* Duration */}
              {previewItem?.duration && (
                <div className="p-3 bg-neutral-800/50 rounded-lg">
                  <div className="flex items-center gap-2 text-xs text-neutral-500 uppercase tracking-wider mb-1">
                    <Clock className="w-3.5 h-3.5" />
                    Duration
                  </div>
                  <p className="text-white font-mono">{previewItem.duration}</p>
                </div>
              )}

              {/* Quality */}
              <div className="p-3 bg-neutral-800/50 rounded-lg">
                <div className="flex items-center gap-2 text-xs text-neutral-500 uppercase tracking-wider mb-1">
                  <Star className="w-3.5 h-3.5" />
                  Quality Score
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "text-lg font-mono font-bold",
                      getQualityColor(previewItem?.quality || 0),
                    )}
                  >
                    {previewItem?.quality}
                  </span>
                  <div className="flex-1 h-2 bg-neutral-700 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        getQualityBg(previewItem?.quality || 0),
                      )}
                      style={{ width: `${previewItem?.quality || 0}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Transcript */}
            {previewItem?.transcript && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-neutral-500 uppercase tracking-wider">
                  <FileText className="w-3.5 h-3.5" />
                  Transcript
                </div>
                <div className="p-3 bg-neutral-800/50 rounded-lg">
                  <p className="text-neutral-400 text-sm italic">
                    {previewItem.transcript}
                  </p>
                </div>
              </div>
            )}
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
