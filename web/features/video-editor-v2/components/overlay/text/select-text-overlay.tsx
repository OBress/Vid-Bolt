import React, { useMemo, useCallback } from "react";
import { useVideoEditorStore } from "../../../stores/video-editor-store";
import { textOverlayTemplates } from "../../../templates/text-overlay-templates";

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
 * SelectTextOverlay Component
 *
 * This component renders a grid of text overlay templates that users can select from.
 * When a template is selected, it creates a new text clip with predefined styles
 * and positions it at the current playhead position.
 *
 * Uses Timeline V2 clip-based API directly.
 *
 * @component
 */
export const SelectTextOverlay: React.FC = () => {
  const addClip = useVideoEditorStore(s => s.addClip);
  const selectClip = useVideoEditorStore(s => s.selectClip);
  const currentTime = useVideoEditorStore(s => s.playback?.currentTime || 0);
  const fps = useVideoEditorStore(s => s.fps) || 30;

  /**
   * Creates and adds a new text clip to the editor
   * @param option - The selected template option from textOverlayTemplates
   */
  const handleAddOverlay = useCallback((option: (typeof textOverlayTemplates)[0]) => {
    const trackId = ensureVideoTrack();
    const { width: canvasWidth, height: canvasHeight } = getCompositionDimensions();

    const textWidth = 500;
    const textHeight = 180;
    const textX = Math.round((canvasWidth - textWidth) / 2);
    const textY = Math.round((canvasHeight - textHeight) / 2);
    const durationInSeconds = 90 / fps; // 90 frames converted to seconds

    const clipId = addClip({
      trackId,
      startTime: currentTime,
      duration: durationInSeconds,
      type: 'text',
      sourceId: '',
      label: option.name,
      content: option.content ?? "Testing",
      transform: {
        x: textX,
        y: textY,
        width: textWidth,
        height: textHeight,
        rotation: 0,
        opacity: 1,
        zIndex: 1,
      },
      styles: {
        ...option.styles,
        opacity: 1,
        zIndex: 1,
        transform: "none",
        textAlign: option.styles.textAlign as "left" | "center" | "right",
        fontSizeScale: 1,
      },
    });

    if (clipId) {
      selectClip(clipId);
    }
  }, [currentTime, fps, addClip, selectClip]);

  /**
   * Handle drag start for timeline integration
   * Text items use dataTransfer API directly for timeline drop handling
   */
  const handleDragStart = useCallback((option: (typeof textOverlayTemplates)[0]) => (e: React.DragEvent) => {
    // Set drag data for timeline
    const dragData = {
      isNewItem: true,
      type: 'text',
      label: option.name,
      duration: 3, // Default 3 seconds (90 frames / 30 fps)
      data: option, // Pass template data
    };
    
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData("application/json", JSON.stringify(dragData));
    
    // Create a custom drag preview with text
    const dragPreview = document.createElement('div');
    dragPreview.style.position = 'absolute';
    dragPreview.style.top = '-9999px';
    dragPreview.style.padding = '8px 12px';
    dragPreview.style.backgroundColor = 'rgba(0,0,0,0.8)';
    dragPreview.style.color = 'white';
    dragPreview.style.borderRadius = '4px';
    dragPreview.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    dragPreview.style.fontSize = '14px';
    dragPreview.style.whiteSpace = 'nowrap';
    dragPreview.textContent = option.name;
    
    document.body.appendChild(dragPreview);
    e.dataTransfer.setDragImage(dragPreview, 40, 20);
    
    // Clean up the preview element after drag starts
    setTimeout(() => {
      document.body.removeChild(dragPreview);
    }, 0);
  }, []);
  
  /**
   * Handle drag end - no cleanup needed as we use dataTransfer API directly
   */
  const handleDragEnd = useCallback(() => {
    // Text items use dataTransfer API, no store state to clear
  }, []);

  return useMemo(
    () => (
      <div className="grid grid-cols-1 gap-3 p-2">
        {Object.entries(textOverlayTemplates).map(([key, option]) => (
          <div
            key={key}
            onClick={() => handleAddOverlay(option)}
            draggable={true}
            onDragStart={handleDragStart(option)}
            onDragEnd={handleDragEnd}
            className="group relative overflow-hidden border-2  bg-card rounded-md transition-all duration-200 hover:border-secondary hover:bg-accent/30 cursor-pointer"
          >
            {/* Preview Container */}
            <div className="aspect-16/6 w-full flex items-center justify-center p-2 pb-12">
              <div
                className="text-base transform-gpu transition-transform duration-200 group-hover:scale-102 text-foreground"
                style={{
                  ...option.styles,
                  fontSize: "1.25rem",
                  padding: option.styles.padding || undefined,
                  fontFamily: undefined,
                  color: undefined,
                }}
              >
                {option.content}
              </div>
            </div>

            {/* Label */}
            <div className="absolute bottom-0 left-0 right-0 backdrop-blur-[2px] px-3 py-1.5">
              <div className="font-extralight text-foreground text-[11px]">
                {option.name}
              </div>
              <div className="text-muted-foreground text-[9px] leading-tight">
                {option.preview}
              </div>
            </div>
          </div>
        ))}
      </div>
    ),
    [handleAddOverlay, handleDragStart, handleDragEnd]
  );
};
