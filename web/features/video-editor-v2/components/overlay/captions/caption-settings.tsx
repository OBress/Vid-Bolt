/**
 * CaptionSettings Component
 *
 * Provides a tabbed interface for managing caption clip settings including:
 * - Caption text and timing management
 * - Visual style customization
 *
 * Uses Timeline V2 clip-based API directly.
 *
 * @component
 */

import React from "react";
import type { TimelineClip } from "../../../types/timeline-v2";
import type { CaptionStyles, Caption } from "../../../types";
import { captionTemplates } from "../../../templates/caption-templates";
import { useVideoEditorStore } from "../../../stores/video-editor-store";

import { AlignLeft, PaintBucket } from "lucide-react";

import { CaptionStylePanel } from "./caption-style-panel";
import { CaptionTimeline } from "./caption-timeline";
import { UnifiedTabs } from "../shared/unified-tabs";

interface CaptionSettingsProps {
  /** The caption clip to edit */
  clip: TimelineClip;
  /** Current frame position in the video */
  currentFrame: number;
}

/**
 * Default styling configuration for captions
 * Uses the classic template from caption-templates.ts
 */
export const defaultCaptionStyles: CaptionStyles = captionTemplates.classic.styles;

/**
 * CaptionSettings component for managing caption clip configuration
 */
export const CaptionSettings: React.FC<CaptionSettingsProps> = ({
  clip,
  currentFrame,
}) => {
  const updateClip = useVideoEditorStore(s => s.updateClip);
  const fps = useVideoEditorStore(s => s.fps) || 30;
  
  const currentMs = (currentFrame / fps) * 1000;
  
  // Convert clip to the format expected by child components (backward compat)
  // TODO: Refactor child components to use TimelineClip directly
  const clipAsOverlay = {
    id: parseInt(clip.id.replace(/\D/g, ''), 10) || Date.now(),
    type: 4, // OverlayType.CAPTION
    left: clip.transform.x,
    top: clip.transform.y,
    width: clip.transform.width,
    height: clip.transform.height,
    rotation: clip.transform.rotation,
    from: Math.round(clip.startTime * fps),
    durationInFrames: Math.round(clip.duration * fps),
    row: 0,
    isDragging: false,
    captions: clip.data?.captions || [],
    styles: clip.styles || {},
  };
  
  /**
   * Updates the clip when overlay changes are made by child components
   */
  const handleOverlayChange = (updatedOverlay: any) => {
    updateClip(clip.id, {
      transform: {
        ...clip.transform,
        x: updatedOverlay.left,
        y: updatedOverlay.top,
        width: updatedOverlay.width,
        height: updatedOverlay.height,
        rotation: updatedOverlay.rotation,
        opacity: updatedOverlay.styles?.opacity !== undefined ? updatedOverlay.styles.opacity : 1,
      },
      startTime: updatedOverlay.from / fps,
      duration: updatedOverlay.durationInFrames / fps,
      data: {
        ...clip.data,
        captions: updatedOverlay.captions,
      },
      styles: updatedOverlay.styles,
    });
  };

  return (
    <UnifiedTabs
      defaultValue="captions"
      tabs={[
        {
          value: "captions",
          label: "Edit",
          icon: <AlignLeft className="w-3 h-3" />,
          content: (
            <div className="overflow-y-auto sidepanel-scrollbar [&_[data-radix-scroll-area-viewport]]:!scrollbar-none" style={{
              height: 'calc(100vh - 120px)',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none'
            }}>
              <CaptionTimeline
                localOverlay={clipAsOverlay as any}
                setLocalOverlay={handleOverlayChange}
                currentMs={currentMs}
              />
            </div>
          ),
        },
        {
          value: "display",
          label: "Style",
          icon: <PaintBucket className="w-3 h-3" />,
          content: (
            <div className="overflow-y-auto sidepanel-scrollbar [&_[data-radix-scroll-area-viewport]]:!scrollbar-none" style={{
              height: 'calc(100vh - 120px)',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none'
            }}>
              <CaptionStylePanel
                localOverlay={clipAsOverlay as any}
                setLocalOverlay={handleOverlayChange}
              />
            </div>
          ),
        },
      ]}
    />
  );
};
