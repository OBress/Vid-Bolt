import { useState } from "react";
import { useVideoEditorStore } from "../../../stores/video-editor-store";
import type { TimelineClip } from "../../../types/timeline-v2";
import { VideoDetails } from "./video-details";
import { useMediaAdaptors } from "../../../contexts/media-adaptor-context";
import { StandardVideo } from "../../../types/media-adaptors";
import { MediaOverlayPanel } from "../shared/media-overlay-panel";
import { getSrcDuration } from "../../../hooks/use-src-duration";
import { calculateIntelligentAssetSize, getAssetDimensions } from "../../../utils/asset-sizing";
import { useVideoReplacement } from "../../../hooks/use-video-replacement";

/**
 * Get composition dimensions based on aspect ratio and resolution
 */
const getCompositionDimensions = () => {
  const state = useVideoEditorStore.getState();
  const aspectRatio = state.aspectRatio || '16:9';
  const resolution = state.resolution || '1080p';
  
  const resolutionHeights: Record<string, number> = {
    '720p': 720,
    '1080p': 1080,
    '1440p': 1440,
    '4k': 2160,
  };
  
  const aspectRatios: Record<string, number> = {
    '16:9': 16/9,
    '9:16': 9/16,
    '1:1': 1,
    '4:5': 4/5,
  };
  
  const height = resolutionHeights[resolution] || 1080;
  const ratio = aspectRatios[aspectRatio] || 16/9;
  const width = Math.round(height * ratio);
  
  return { width, height };
};

/**
 * Ensure video track exists
 */
const ensureVideoTrack = () => {
  const state = useVideoEditorStore.getState();
  let trackId = state.tracks.find(t => t.type === 'video')?.id;
  if (!trackId) {
    trackId = state.addTrack('video');
  }
  return trackId;
};

/**
 * VideoOverlayPanel is a component that provides video search and management functionality.
 * It allows users to:
 * - Search and browse videos from all configured video adaptors
 * - Add videos to the timeline as clips
 * - Manage video properties when a video clip is selected
 *
 * The component has two main states:
 * 1. Search/Browse mode: Shows a search input and grid of video thumbnails from all sources
 * 2. Edit mode: Shows video details panel when a video clip is selected
 * 
 * Uses Timeline V2 clip-based API directly.
 *
 * @component
 */
export const VideoOverlayPanel: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [videos, setVideos] = useState<
    Array<StandardVideo & { _source: string; _sourceDisplayName: string }>
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDurationLoading, setIsDurationLoading] = useState(false);
  const [loadingItemKey, setLoadingItemKey] = useState<string | null>(null);
  const [sourceResults, setSourceResults] = useState<
    Array<{
      adaptorName: string;
      adaptorDisplayName: string;
      itemCount: number;
      hasMore: boolean;
      error?: string;
    }>
  >([]);

  const { searchVideos, videoAdaptors } = useMediaAdaptors();
  const { isReplaceMode, startReplaceMode, cancelReplaceMode } = useVideoReplacement();

  // Use VideoEditorStore for state - get selected video clip directly
  const selectedClip = useVideoEditorStore(s => {
    const ids = s.selection?.clipIds;
    if (!ids || ids.length !== 1) return null;
    const clip = s.clips.find(c => c.id === ids[0]);
    return clip?.type === 'video' ? clip : null;
  }) as TimelineClip | null;
  
  const clips = useVideoEditorStore(s => s.clips);
  const addClip = useVideoEditorStore(s => s.addClip);
  const updateClip = useVideoEditorStore(s => s.updateClip);
  const selectClip = useVideoEditorStore(s => s.selectClip);
  const currentTime = useVideoEditorStore(s => s.playback?.currentTime || 0);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsLoading(true);
    try {
      const result = await searchVideos({
        query: searchQuery,
        perPage: 50,
        page: 1,
      });

      setVideos(result.items);
      setSourceResults(result.sourceResults);
    } catch (error) {
      console.error("Error searching videos:", error);
      // Reset state on error
      setVideos([]);
      setSourceResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddClip = async (
    video: StandardVideo & { _source: string; _sourceDisplayName: string }
  ) => {
    const itemKey = getItemKey(video);
    setIsDurationLoading(true);
    setLoadingItemKey(itemKey);

    try {
      const adaptor = videoAdaptors.find((a) => a.name === video._source);
      const videoUrl = adaptor?.getVideoUrl(video, "hd") || "";

      // Check if we're in replace mode
      if (isReplaceMode && selectedClip) {
        // Replace mode: Update the existing clip's source
        const clipId = selectedClip.id;
        
        // Get new video duration
        let newDuration = 6.67; // fallback (200 frames at 30fps)
        try {
          const result = await getSrcDuration(videoUrl);
          newDuration = result.durationInSeconds;
        } catch (error) {
          console.warn("Failed to get video duration, using fallback:", error);
        }
        
        updateClip(clipId, {
          sourceId: videoUrl,
          duration: newDuration,
          thumbnailUrl: video.thumbnail,
          media: {
            mediaStartTime: 0,
            mediaDuration: newDuration,
            speed: 1,
            volume: 0, // Video clip has no volume
          },
          data: {
            ...clips.find(c => c.id === clipId)?.data,
            src: videoUrl,
            originalUrl: videoUrl,
            width: video.width,
            height: video.height,
          },
        });
        
        // Clear search state
        setSearchQuery("");
        setVideos([]);
        setSourceResults([]);
        cancelReplaceMode();
      } else {
        // Add mode: Create new clip
        // Get actual video duration using media-parser
        let duration = 6.67; // fallback (200 frames at 30fps)
        
        try {
          const result = await getSrcDuration(videoUrl);
          duration = result.durationInSeconds;
        } catch (error) {
          console.warn("Failed to get video duration, using fallback:", error);
        }

        const canvasDimensions = getCompositionDimensions();
        const assetDimensions = getAssetDimensions(video);

        // Use intelligent sizing if asset dimensions are available, otherwise fall back to canvas dimensions
        let { width, height } = assetDimensions
          ? calculateIntelligentAssetSize(assetDimensions, canvasDimensions)
          : canvasDimensions;

        // Ensure the item fits within canvas bounds by scaling down if necessary
        const maxWidth = canvasDimensions.width * 0.9; // Leave 10% margin
        const maxHeight = canvasDimensions.height * 0.9; // Leave 10% margin

        if (width > maxWidth || height > maxHeight) {
          const scaleX = maxWidth / width;
          const scaleY = maxHeight / height;
          const scale = Math.min(scaleX, scaleY, 1); // Don't scale up, only down

          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }

        // Calculate centered position
        const centerLeft = Math.max(0, (canvasDimensions.width - width) / 2);
        const centerTop = Math.max(0, (canvasDimensions.height - height) / 2);

        const trackId = ensureVideoTrack();
        
        const clipId = addClip({
          trackId,
          startTime: currentTime,
          duration,
          type: 'video',
          sourceId: videoUrl,
          label: video.title || 'Video',
          transform: {
            x: centerLeft,
            y: centerTop,
            width,
            height,
            rotation: 0,
            opacity: 1,
            zIndex: 100,
          },
          media: {
            mediaStartTime: 0,
            mediaDuration: duration,
            speed: 1,
            volume: 0, // Video clips don't have volume (audio comes from separate audio clip if needed)
          },
          thumbnailUrl: video.thumbnail,
          styles: {
            objectFit: "contain",
            animation: {
              enter: "none",
              exit: "none",
            },
          },
          data: {
            src: videoUrl,
            originalUrl: videoUrl,
            content: video.thumbnail,
            // Store original video dimensions for resize handle positioning
            width: assetDimensions?.width || video.width,
            height: assetDimensions?.height || video.height,
          },
        });
        
        if (clipId) {
          selectClip(clipId);
        }
      }
    } finally {
      setIsDurationLoading(false);
      setLoadingItemKey(null);
    }
  };

  const handleCancelReplace = () => {
    cancelReplaceMode();
    setSearchQuery("");
    setVideos([]);
    setSourceResults([]);
  };

  const getThumbnailUrl = (video: StandardVideo & { _source: string; _sourceDisplayName: string }) => {
    return video.thumbnail;
  };

  const getItemKey = (video: StandardVideo & { _source: string; _sourceDisplayName: string }) => {
    return `${video._source}-${video.id}`;
  };

  return (
    <MediaOverlayPanel
      searchQuery={searchQuery}
      onSearchQueryChange={setSearchQuery}
      onSearch={handleSearch}
      items={videos}
      isLoading={isLoading}
      isDurationLoading={isDurationLoading}
      loadingItemKey={loadingItemKey}
      hasAdaptors={videoAdaptors.length > 0}
      sourceResults={sourceResults}
      onItemClick={handleAddClip}
      getThumbnailUrl={getThumbnailUrl}
      getItemKey={getItemKey}
      mediaType="videos"
      searchPlaceholder={isReplaceMode ? "Search for replacement video" : "Search videos"}
      showSourceBadge={false}
      isEditMode={!!selectedClip && !isReplaceMode}
      editComponent={
        selectedClip ? (
          <VideoDetails
            clip={selectedClip}
            onChangeVideo={startReplaceMode}
          />
        ) : null
      }
      isReplaceMode={isReplaceMode}
      onCancelReplace={handleCancelReplace}
      enableTimelineDrag={!isReplaceMode && !selectedClip}
    />
  );
};
