/**
 * ImageDetails Component
 *
 * Provides a tabbed interface for managing image clip settings and styles.
 * Features include:
 * - Image preview
 * - Style customization panel
 * - Settings configuration panel
 * - Real-time updates
 *
 * Uses Timeline V2 clip-based API directly - no overlay conversion needed.
 *
 * @component
 */

import React from "react";
import type { TimelineClip } from "../../../types/timeline-v2";
import { clipIdToNumeric } from "../../../utils/clip-to-render-adapter";
import { ImageStylePanel } from "./image-style-panel";
import { ImageSettingsPanel } from "./image-settings-panel";
import { ImagePreview } from "./image-preview";
import { ImageAIPanel } from "./image-ai-panel";
import { useVideoEditorStore } from "../../../stores/video-editor-store";
import { UnifiedTabs } from "../shared/unified-tabs";
import { Settings, PaintBucket, Sparkles } from "lucide-react";

interface ImageDetailsProps {
  /** The image clip to edit */
  clip: TimelineClip;
  /** Callback function to initiate image replacement */
  onChangeImage?: () => void;
}

/**
 * ImageDetails component for managing image clip configuration
 */
export const ImageDetails: React.FC<ImageDetailsProps> = ({
  clip,
  onChangeImage,
}) => {
  const updateClip = useVideoEditorStore(s => s.updateClip);
  const fps = useVideoEditorStore(s => s.fps) || 30;

  /**
   * Updates the style properties of the image clip
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
   * Handles position and size changes for the image clip
   */
  const handlePositionChange = (updates: {
    left?: number;
    top?: number;
    width?: number;
    height?: number;
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

  // Convert clip to the format expected by child components (backward compat)
  // TODO: Refactor child components to use TimelineClip directly
  const clipAsOverlay = {
    id: clipIdToNumeric(clip.id),
    type: 2, // OverlayType.IMAGE
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
    content: clip.sourceId,
    styles: clip.styles || {},
    data: clip.data,
  } as any;

  return (
    <div className="space-y-4">
      {/* Preview */}
      <ImagePreview overlay={clipAsOverlay} onChangeImage={onChangeImage} />

      <UnifiedTabs
        tabs={[
          {
            value: "settings",
            label: "Settings",
            icon: <Settings className="w-4 h-4" />,
            content: (
              <ImageSettingsPanel
                localOverlay={clipAsOverlay}
                handleStyleChange={handleStyleChange}
                onPositionChange={handlePositionChange}
              />
            ),
          },
          {
            value: "style",
            label: "Style",
            icon: <PaintBucket className="w-4 h-4" />,
            content: (
              <ImageStylePanel
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
              <ImageAIPanel
                localOverlay={clipAsOverlay}
              />
            ),
          },
        ]}
      />
    </div>
  );
};
