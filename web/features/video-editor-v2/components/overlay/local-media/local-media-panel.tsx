import { useCallback } from "react";
import { useVideoEditorStore, getTypedState } from "../../../stores/video-editor-store";
import { calculateIntelligentAssetSize, getAssetDimensions } from "../../../utils/asset-sizing";
import { LocalMediaGallery } from "./local-media-gallery";
import { DEFAULT_IMAGE_DURATION_FRAMES, IMAGE_DURATION_PERCENTAGE } from "../../../constants";

/**
 * LocalMediaPanel Component
 *
 * A panel that allows users to:
 * 1. Upload their own media files (videos, images, audio)
 * 2. View and manage uploaded media files
 * 3. Add uploaded media to the timeline
 * 
 * Uses Timeline V2 clip-based API
 */

/**
 * Get composition dimensions based on aspect ratio and resolution
 */
const getCompositionDimensions = () => {
  const state = getTypedState();
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
 * Ensure appropriate tracks exist for media types
 */
const ensureTracks = () => {
  const state = getTypedState();
  
  let videoTrackId = Object.values(state.tracks).find(t => t.type === 'video')?.id;
  let audioTrackId = Object.values(state.tracks).find(t => t.type === 'audio')?.id;
  
  if (!videoTrackId) {
    videoTrackId = state.addTrack('video');
  }
  
  if (!audioTrackId) {
    audioTrackId = state.addTrack('audio');
  }
  
  return { videoTrackId, audioTrackId };
};

export const LocalMediaPanel: React.FC = () => {
  // Get store actions and state
  const addClip = useVideoEditorStore(s => s.addClip);
  const currentTime = useVideoEditorStore(s => s.playback?.currentTime || 0);
  const selectClip = useVideoEditorStore(s => s.selectClip);
  const selectClips = useVideoEditorStore(s => s.selectClips);
  const clips = useVideoEditorStore(s => s.clips);
  const fps = useVideoEditorStore(s => s.fps) || 30;

  /**
   * Add a media file to the timeline
   * Memoized to prevent recreation on every frame update
   */
  const handleAddToTimeline = useCallback((file: any) => {
    const canvasDimensions = getCompositionDimensions();
    
    // Ensure we have the necessary tracks
    const { videoTrackId, audioTrackId } = ensureTracks();
    
    // Note: Local media files don't currently store dimension information
    // For intelligent sizing, we would need to extract dimensions during upload
    // For now, we fall back to canvas dimensions
    const assetDimensions = getAssetDimensions(file);
    const { width, height } = assetDimensions 
      ? calculateIntelligentAssetSize(assetDimensions, canvasDimensions)
      : canvasDimensions;

    // Handle both server paths and blob URLs
    let mediaSrc: string;
    if (file.path.startsWith('blob:') || file.path.startsWith('/api/') || file.path.startsWith('http')) {
      // Already a valid URL - use as-is
      mediaSrc = file.path;
    } else {
      // File ID - convert to API route
      mediaSrc = `/api/latest/local-media/serve/${file.path}`;
    }

    const createdClipIds: string[] = [];

    if (file.type === "video") {
      // Like Premiere Pro: separate video and audio but link them together
      const duration = file.duration || 6.67; // Default to ~200 frames at 30fps
      
      // Create video clip (without volume control)
      const videoClipId = addClip({
        trackId: videoTrackId,
        startTime: currentTime,
        duration,
        type: 'video',
        sourceId: mediaSrc,
        label: file.name || 'Video',
        transform: {
          x: 0,
          y: 0,
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
          volume: 0, // Video clip has no volume (audio comes from audio clip)
        },
        thumbnailUrl: file.thumbnail,
        data: {
          src: mediaSrc,
          originalUrl: mediaSrc,
          content: file.thumbnail || "",
        },
      });
      
      if (videoClipId) {
        createdClipIds.push(videoClipId);
        
        // Create linked audio clip on audio track
        const audioClipId = addClip({
          trackId: audioTrackId,
          startTime: currentTime,
          duration,
          type: 'audio',
          sourceId: mediaSrc,
          label: `${file.name} (Audio)` || 'Audio',
          transform: {
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            rotation: 0,
            opacity: 1,
            zIndex: 0,
          },
          media: {
            mediaStartTime: 0,
            mediaDuration: duration,
            speed: 1,
            volume: 1,
          },
          linkedClipId: videoClipId, // Link to video clip
          data: {
            src: mediaSrc,
            originalUrl: mediaSrc,
          },
        });
        
        if (audioClipId) {
          createdClipIds.push(audioClipId);
          
          // Update video clip to link back to audio
          const updateClip = useVideoEditorStore.getState().updateClip;
          updateClip(videoClipId, { linkedClipId: audioClipId });
        }
      }
    } else if (file.type === "image") {
      // Use a percentage of composition duration for smart image length when there are existing clips,
      // otherwise default to DEFAULT_IMAGE_DURATION_FRAMES converted to seconds
      const clipsArr = Object.values(clips) as import('../../../types/timeline-v2').TimelineClip[];
      const totalDuration = clipsArr.length > 0 
        ? Math.max(...clipsArr.map(c => c.startTime + c.duration))
        : 0;
      
      const smartDuration = clipsArr.length > 0 
        ? (totalDuration * IMAGE_DURATION_PERCENTAGE)
        : (DEFAULT_IMAGE_DURATION_FRAMES / fps);
      
      const imageClipId = addClip({
        trackId: videoTrackId,
        startTime: currentTime,
        duration: smartDuration,
        type: 'image',
        sourceId: mediaSrc,
        label: file.name || 'Image',
        transform: {
          x: 0,
          y: 0,
          width,
          height,
          rotation: 0,
          opacity: 1,
          zIndex: 100,
        },
        thumbnailUrl: mediaSrc,
        styles: {
          objectFit: "fill",
          animation: {
            enter: "fadeIn",
            exit: "fadeOut",
          },
        },
        data: {
          src: mediaSrc,
          originalUrl: mediaSrc,
          content: mediaSrc,
        },
      });
      
      if (imageClipId) {
        createdClipIds.push(imageClipId);
      }
    } else if (file.type === "audio") {
      const duration = file.duration || 6.67; // Default to ~200 frames at 30fps
      
      const audioClipId = addClip({
        trackId: audioTrackId,
        startTime: currentTime,
        duration,
        type: 'audio',
        sourceId: mediaSrc,
        label: file.name || 'Audio',
        transform: {
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          rotation: 0,
          opacity: 1,
          zIndex: 0,
        },
        media: {
          mediaStartTime: 0,
          mediaDuration: duration,
          speed: 1,
          volume: 1,
        },
        data: {
          src: mediaSrc,
          originalUrl: mediaSrc,
        },
      });
      
      if (audioClipId) {
        createdClipIds.push(audioClipId);
      }
    } else {
      return; // Unsupported file type
    }

    // Select the created clips
    if (createdClipIds.length > 0) {
      if (createdClipIds.length === 1) {
        selectClip(createdClipIds[0]);
      } else {
        // For linked video+audio, select both
        selectClips(createdClipIds);
      }
    }
  }, [currentTime, clips, fps, addClip, selectClip, selectClips]);

  return (
    <div className="h-full overflow-y-auto sidepanel-scrollbar p-2">
      <LocalMediaGallery onSelectMedia={handleAddToTimeline} />
    </div>
  );
};

export default LocalMediaPanel;
