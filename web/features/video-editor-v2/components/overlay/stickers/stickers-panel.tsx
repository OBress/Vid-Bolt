import React from "react";

import { useVideoEditorStore } from "../../../stores/video-editor-store";
import type { TimelineClip } from "../../../types/timeline-v2";
import {
  templatesByCategory,
  getStickerCategories,
} from "../../../templates/sticker-templates/sticker-helpers";
import { UnifiedTabs } from "../shared/unified-tabs";
import { StickerPreview } from "./sticker-preview";
import { StickerDetails } from "./sticker-details";

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
 * StickersPanel Component
 *
 * A panel for selecting and managing sticker clips in the video editor.
 * Provides functionality for:
 * - Browsing sticker templates by category
 * - Adding stickers to the timeline
 * - Editing selected sticker clips
 *
 * Uses Timeline V2 clip-based API directly.
 *
 * @component
 */
export function StickersPanel() {
  // Use VideoEditorStore for state - get selected sticker clip directly
  const selectedClip = useVideoEditorStore(s => {
    const ids = s.selection?.clipIds;
    if (!ids || ids.length !== 1) return null;
    const clip = s.clips[ids[0]];
    return clip?.type === 'sticker' ? clip : null;
  }) as TimelineClip | null;
  
  const addClip = useVideoEditorStore(s => s.addClip);
  const selectClip = useVideoEditorStore(s => s.selectClip);
  const currentTime = useVideoEditorStore(s => s.playback?.currentTime || 0);
  const fps = useVideoEditorStore(s => s.fps) || 30;
  
  const stickerCategories = getStickerCategories();

  const handleStickerClick = (templateId: string) => {
    const template = Object.values(templatesByCategory)
      .flat()
      .find((t) => t.config.id === templateId);

    if (!template) return;

    const trackId = ensureVideoTrack();
    const { width: canvasWidth, height: canvasHeight } = getCompositionDimensions();
    
    const stickerWidth = 150;
    const stickerHeight = 150;
    const stickerX = Math.round((canvasWidth - stickerWidth) / 2);
    const stickerY = Math.round((canvasHeight - stickerHeight) / 2);

    const clipId = addClip({
      trackId,
      startTime: currentTime,
      duration: 50 / fps, // 50 frames converted to seconds
      type: 'sticker',
      sourceId: '',
      label: template.config.id,
      content: template.config.id,
      transform: {
        x: stickerX,
        y: stickerY,
        width: stickerWidth,
        height: stickerHeight,
        rotation: 0,
        opacity: 1,
        zIndex: 1,
      },
      styles: {
        opacity: 1,
        zIndex: 1,
        ...template.config.defaultProps?.styles,
      },
      data: {
        category: template.config.category,
      },
    });

    if (clipId) {
      selectClip(clipId);
    }
  };

  const renderStickerContent = (category: string) => (
    <div className="grid grid-cols-2 gap-3 pt-3 pb-3">
      {templatesByCategory[category]?.map((template) => (
        <div
          key={template.config.id}
          className={`
            h-[140px]
            ${template.config.layout === "double" ? "col-span-2" : ""}
          `}
        >
          <StickerPreview
            template={template}
            onClick={() => handleStickerClick(template.config.id)}
          />
        </div>
      ))}
    </div>
  );

  // If we're in edit mode, show the details panel
  if (selectedClip) {
    return (
      <div className="h-full overflow-y-auto sidepanel-scrollbar p-2">
        <StickerDetails
          clip={selectedClip}
        />
      </div>
    );
  }

  // Otherwise show the sticker selection panel
  return (
    <div className="h-full overflow-y-auto sidepanel-scrollbar p-2">
      <UnifiedTabs
        defaultValue={stickerCategories[0]}
        tabs={stickerCategories.map((category) => ({
          value: category,
          label: category,
          content: renderStickerContent(category),
        }))}
      />
    </div>
  );
}
