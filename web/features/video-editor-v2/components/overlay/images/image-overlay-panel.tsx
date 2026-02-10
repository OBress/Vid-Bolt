import { useState } from "react";
import { useVideoEditorStore } from "../../../stores/video-editor-store";
import type { TimelineClip } from "../../../types/timeline-v2";
import { ImageDetails } from "./image-details";
import { useMediaAdaptors } from "../../../contexts/media-adaptor-context";
import { StandardImage } from "../../../types/media-adaptors";
import { MediaOverlayPanel } from "../shared/media-overlay-panel";
import { calculateIntelligentAssetSize, getAssetDimensions } from "../../../utils/asset-sizing";
import { useImageReplacement } from "../../../hooks/use-image-replacement";
import { DEFAULT_IMAGE_DURATION_FRAMES, IMAGE_DURATION_PERCENTAGE } from "../../../constants";

/**
 * Type for images with source attribution
 */
type ImageWithSource = StandardImage & {
  _source: string;
  _sourceDisplayName: string;
};

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
  let trackId = Object.values(state.tracks).find(t => t.type === 'video')?.id;
  if (!trackId) {
    trackId = state.addTrack('video');
  }
  return trackId;
};

/**
 * ImageOverlayPanel Component
 *
 * A panel that provides functionality to:
 * 1. Search and select images from all configured image adaptors
 * 2. Add selected images as clips to the editor
 * 3. Modify existing image clip properties
 * 4. Filter images by source using tabs
 *
 * The panel has two main states:
 * - Search/Selection mode: Shows a search bar, source tabs, and masonry grid of images
 * - Edit mode: Shows image details editor when an existing image clip is selected
 * 
 * Uses Timeline V2 clip-based API directly.
 */
export const ImageOverlayPanel: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [images, setImages] = useState<ImageWithSource[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sourceResults, setSourceResults] = useState<Array<{
    adaptorName: string;
    adaptorDisplayName: string;
    itemCount: number;
    hasMore: boolean;
    error?: string;
  }>>([]);
  
  const { searchImages, imageAdaptors } = useMediaAdaptors();
  const { isReplaceMode, startReplaceMode, cancelReplaceMode } = useImageReplacement();
  
  // Use VideoEditorStore for state - get selected image clip directly
  const selectedClip = useVideoEditorStore(s => {
    const ids = s.selection?.clipIds;
    if (!ids || ids.length !== 1) return null;
    const clip = s.clips[ids[0]];
    return clip?.type === 'image' ? clip : null;
  }) as TimelineClip | null;
  
  const clips = useVideoEditorStore(s => s.clips);
  const addClip = useVideoEditorStore(s => s.addClip);
  const updateClip = useVideoEditorStore(s => s.updateClip);
  const selectClip = useVideoEditorStore(s => s.selectClip);
  const currentTime = useVideoEditorStore(s => s.playback?.currentTime || 0);
  const fps = useVideoEditorStore(s => s.fps) || 30;

  /**
   * Handles the image search form submission
   * Searches across all configured image adaptors
   */
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    
    setIsLoading(true);
    try {
      const results = await searchImages({ query: searchQuery, page: 1, perPage: 50 });
      setImages(results.items);
      setSourceResults(results.sourceResults || []);
    } catch (error) {
      console.error('Failed to search images:', error);
      setImages([]);
      setSourceResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handles adding or replacing an image
   * @param image - The selected image to add or use as replacement
   */
  const handleAddImage = async (image: ImageWithSource) => {
    // Check if we're in replace mode
    if (isReplaceMode && selectedClip) {
      // Replace mode: Update the existing clip's source
      const clipId = selectedClip.id;
      const imageSrc = image.src['original'] || image.src['large'] || image.src['medium'] || image.src['small'] || '';
      
      updateClip(clipId, {
        sourceId: imageSrc,
        thumbnailUrl: image.src['medium'] || image.src['small'] || imageSrc,
        data: {
          ...(clips as Record<string, TimelineClip>)[clipId]?.data,
          src: imageSrc,
          originalUrl: imageSrc,
        },
      });
      
      // Clear search state
      setSearchQuery("");
      setImages([]);
      setSourceResults([]);
      cancelReplaceMode();
    } else {
      // Add mode: Create new clip
      const canvasDimensions = getCompositionDimensions();
      const assetDimensions = getAssetDimensions(image);
      
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

      // Use a percentage of composition duration for smart image length when there are existing clips,
      // otherwise default to DEFAULT_IMAGE_DURATION_FRAMES converted to seconds
      const clipsArr = Object.values(clips) as TimelineClip[];
      const totalDuration = clipsArr.length > 0 
        ? Math.max(...clipsArr.map(c => c.startTime + c.duration))
        : 0;
      
      const smartDuration = clipsArr.length > 0
        ? (totalDuration * IMAGE_DURATION_PERCENTAGE)
        : (DEFAULT_IMAGE_DURATION_FRAMES / fps);

      const imageSrc = image.src['original'] || image.src['large'] || image.src['medium'] || image.src['small'] || '';
      const trackId = ensureVideoTrack();
      
      const clipId = addClip({
        trackId,
        startTime: currentTime,
        duration: smartDuration,
        type: 'image',
        sourceId: imageSrc,
        label: image.alt || 'Image',
        transform: {
          x: centerLeft,
          y: centerTop,
          width,
          height,
          rotation: 0,
          opacity: 1,
          zIndex: 100,
        },
        thumbnailUrl: image.src['medium'] || image.src['small'] || imageSrc,
        styles: {
          objectFit: "contain",
          animation: {
            enter: "fadeIn",
            exit: "fadeOut",
          },
        },
        data: {
          src: imageSrc,
          originalUrl: imageSrc,
          content: imageSrc,
        },
      });
      
      if (clipId) {
        selectClip(clipId);
      }
    }
  };

  const handleCancelReplace = () => {
    cancelReplaceMode();
    setSearchQuery("");
    setImages([]);
    setSourceResults([]);
  };

  const getThumbnailUrl = (image: ImageWithSource) => {
    return image.src['medium'] || image.src['small'] || image.src['original'];
  };

  const getItemKey = (image: ImageWithSource) => {
    return `${image._source}-${image.id}`;
  };

  return (
    <MediaOverlayPanel
      searchQuery={searchQuery}
      onSearchQueryChange={setSearchQuery}
      onSearch={handleSearch}
      items={images}
      isLoading={isLoading}
      hasAdaptors={imageAdaptors.length > 0}
      sourceResults={sourceResults}
      onItemClick={handleAddImage}
      getThumbnailUrl={getThumbnailUrl}
      getItemKey={getItemKey}
      mediaType="images"
      searchPlaceholder={isReplaceMode ? "Search for replacement image" : "Search images"}
      showSourceBadge={true}
      isEditMode={!!selectedClip && !isReplaceMode}
      editComponent={
        selectedClip ? (
          <ImageDetails
            clip={selectedClip}
            onChangeImage={startReplaceMode}
          />
        ) : null
      }
      isReplaceMode={isReplaceMode}
      onCancelReplace={handleCancelReplace}
      enableTimelineDrag={!isReplaceMode && !selectedClip}
    />
  );
};
