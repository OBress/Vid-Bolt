/**
 * VideoDetails Component
 *
 * A component that provides a user interface for configuring video clip settings, styles, and AI features.
 * It displays a video preview along with three tabbed panels for comprehensive video management.
 *
 * Features:
 * - Video preview display
 * - Settings panel for basic video configuration
 * - Style panel for visual customization
 * - AI panel for AI-powered video features
 *
 * Uses Timeline V2 clip-based API directly - no overlay conversion needed.
 *
 * @component
 */

import React from "react";
import type { TimelineClip } from "../../../types/timeline-v2";
import { VideoStylePanel } from "./video-style-panel";
import { VideoSettingsPanel } from "./video-settings-panel";
import { VideoAIPanel } from "./video-ai-panel";
import { VideoPreview } from "./video-preview";
import { useVideoEditorStore } from "../../../stores/video-editor-store";
import { UnifiedTabs } from "../shared/unified-tabs";
import { Settings, PaintBucket, Sparkles } from "lucide-react";

interface VideoDetailsProps {
  /** The video clip to edit */
  clip: TimelineClip;
  /** Callback function to initiate video replacement */
  onChangeVideo?: () => void;
}

/**
 * VideoDetails component for managing video clip configuration
 */
export const VideoDetails: React.FC<VideoDetailsProps> = ({
  clip,
  onChangeVideo,
}) => {
  const updateClip = useVideoEditorStore(s => s.updateClip);
  const fps = useVideoEditorStore(s => s.fps) || 30;

  /**
   * Updates the style properties of the video clip
   */
  const handleStyleChange = (updates: Record<string, any>) => {
    updateClip(clip.id, {
      styles: {
        ...clip.styles,
        ...updates,
      },
    });
  };

  /**
   * Handles speed and duration changes for the video clip
   */
  const handleSpeedChange = (speed: number, newDurationInFrames: number) => {
    const newDuration = newDurationInFrames / fps;
    updateClip(clip.id, {
      duration: newDuration,
      media: {
        ...(clip.media as any),
      speed,
      },
    });
  };

  /**
   * Handles position and size changes for the video clip
   */
  const handlePositionChange = (updates: { 
    left?: number; 
    top?: number; 
    width?: number; 
    height?: number 
  }) => {
    updateClip(clip.id, {
      transform: {
        ...clip.transform,
        x: updates.left ?? clip.transform.x,
        y: updates.top ?? clip.transform.y,
        width: updates.width ?? clip.transform.width,
        height: updates.height ?? clip.transform.height,
      },
    });
  };

  /**
   * Handles rotation changes for the video clip
   */
  const handleRotationChange = (rotation: number) => {
    updateClip(clip.id, {
      transform: {
        ...clip.transform,
      rotation,
      },
    });
    };
    
  // Convert clip to the format expected by child components (backward compat)
  // TODO: Refactor child components to use TimelineClip directly
  const clipAsOverlay = {
    id: parseInt(clip.id.replace(/\D/g, ''), 10) || Date.now(),
    type: 1, // OverlayType.VIDEO
    left: clip.transform.x,
    top: clip.transform.y,
    width: clip.transform.width,
    height: clip.transform.height,
    rotation: clip.transform.rotation,
    from: Math.round(clip.startTime * fps),
    durationInFrames: Math.round(clip.duration * fps),
    row: 0,
    isDragging: false,
    src: clip.sourceId,
    content: clip.thumbnailUrl || "",
    videoStartTime: clip.media?.mediaStartTime || 0,
    mediaSrcDuration: clip.media?.mediaDuration,
    speed: clip.media?.speed || 1,
    styles: clip.styles || {},
    data: clip.data,
  } as any;

  return (
    <div className="space-y-2">
      {/* Preview */}
      <VideoPreview overlay={clipAsOverlay} onChangeVideo={onChangeVideo} />

      {/* Settings Tabs */}
      <UnifiedTabs
        tabs={[
          {
            value: "settings",
            label: "Settings",
            icon: <Settings className="w-4 h-4" />,
            content: (
              <VideoSettingsPanel
                localOverlay={clipAsOverlay}
                handleStyleChange={handleStyleChange}
                onSpeedChange={handleSpeedChange}
                onPositionChange={handlePositionChange}
                onRotationChange={handleRotationChange}
              />
            ),
          },
          {
            value: "style",
            label: "Style",
            icon: <PaintBucket className="w-4 h-4" />,
            content: (
              <VideoStylePanel
                localOverlay={clipAsOverlay}
                handleStyleChange={handleStyleChange}
              />
            ),
          },
          {
            value: "ai",
            label: "AI",
            icon: <Sparkles className="w-4 h-4" />,
            content: (
              <VideoAIPanel
                localOverlay={clipAsOverlay}
              />
            ),
          },
        ]}
      />
    </div>
  );
};
