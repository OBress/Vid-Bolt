/**
 * StickerDetails Component
 *
 * Provides a tabbed interface for managing sticker clip settings and styles.
 * Features include:
 * - Sticker preview
 * - Style customization panel
 * - Settings configuration panel
 * - Real-time updates
 *
 * Uses Timeline V2 clip-based API directly.
 *
 * @component
 */

import React from "react";
import type { TimelineClip } from "../../../types/timeline-v2";
import { useVideoEditorStore } from "../../../stores/video-editor-store";

import { UnifiedTabs } from "../shared/unified-tabs";
import { StickerStylesPanel } from "./sticker-styles-panel";
import { StickerSettingsPanel } from "./sticker-settings-panel";

interface StickerDetailsProps {
  /** The sticker clip to edit */
  clip: TimelineClip;
}

/**
 * StickerDetails component for managing sticker clip configuration
 */
export const StickerDetails: React.FC<StickerDetailsProps> = ({
  clip,
}) => {
  const updateClip = useVideoEditorStore(s => s.updateClip);
  const fps = useVideoEditorStore(s => s.fps) || 30;

  /**
   * Updates the style properties of the sticker clip
   */
  const handleStyleChange = (updates: Record<string, any>) => {
    updateClip(clip.id, {
      styles: {
        ...clip.styles,
        ...updates,
      },
    });
  };

  // Convert clip to the format expected by child components (backward compat)
  // TODO: Refactor child components to use TimelineClip directly
  const clipAsOverlay = {
    id: parseInt(clip.id.replace(/\D/g, ''), 10) || Date.now(),
    type: 5, // OverlayType.STICKER
    left: clip.transform.x,
    top: clip.transform.y,
    width: clip.transform.width,
    height: clip.transform.height,
    rotation: clip.transform.rotation,
    from: Math.round(clip.startTime * fps),
    durationInFrames: Math.round(clip.duration * fps),
    row: 0,
    isDragging: false,
    content: clip.content || '',
    category: clip.data?.category,
    styles: clip.styles || {},
  };

  return (
    <div className="space-y-4">
      <UnifiedTabs
        settingsContent={
          <StickerSettingsPanel
            localOverlay={clipAsOverlay as any}
            handleStyleChange={handleStyleChange}
          />
        }
        styleContent={
          <StickerStylesPanel />
        }
      />
    </div>
  );
}; 
