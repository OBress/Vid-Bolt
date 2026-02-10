/**
 * TextDetails Component
 *
 * Provides a UI for editing text clip properties and styles.
 * It includes a text editor and tabbed panels for settings and styling.
 *
 * Uses Timeline V2 clip-based API directly.
 *
 * @component
 */

import React from "react";
import type { TimelineClip } from "../../../types/timeline-v2";
import { useVideoEditorStore } from "../../../stores/video-editor-store";
import { TextSettingsPanel } from "./text-settings-panel";
import { TextStylePanel } from "./text-style-panel";
import { UnifiedTabs } from "../shared/unified-tabs";
import { Textarea } from "../../ui/textarea";
import { Separator } from "../../ui/separator";

interface TextDetailsProps {
  /** The text clip to edit */
  clip: TimelineClip;
}

/**
 * TextDetails component for managing text clip configuration
 */
export const TextDetails: React.FC<TextDetailsProps> = ({
  clip,
}) => {
  const updateClip = useVideoEditorStore(s => s.updateClip);
  const fps = useVideoEditorStore(s => s.fps) || 30;

  /**
   * Handles changes to the text content
   */
  const handleContentChange = (value: string) => {
    updateClip(clip.id, {
      content: value,
    });
  };

  /**
   * Handles changes to style properties
   */
  const handleStyleChange = (
    field: string,
    value: any
  ) => {
    updateClip(clip.id, {
      styles: {
        ...clip.styles,
        [field]: value,
      },
    });
  };

  /**
   * Handles position and size changes for the text clip
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
    id: parseInt(clip.id.replace(/\D/g, ''), 10) || Date.now(),
    type: 0, // OverlayType.TEXT
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
    styles: clip.styles || {},
  };

  /**
   * Handle input change that updates clip directly (for content)
   */
  const handleInputChange = (field: string, value: string) => {
    if (field === 'content') {
      handleContentChange(value);
    }
  };

  return (
    <div className="space-y-4">
      {/* Preview and Edit Section */}
      <div className="flex flex-col px-2 mt-2">
        {/* Editor */}
        <Textarea
          value={clip.content || ""}
          onChange={(e) => handleContentChange(e.target.value)}
          placeholder="Enter your text here..."
          className="w-full min-h-[60px] resize-none text-base bg-input border-gray-300 text-foreground"
          spellCheck="false"
        />
      </div>
      <Separator />
      {/* Settings Tabs */}
      <div className="flex flex-col gap-4 px-2">
        <UnifiedTabs
          settingsContent={
            <TextSettingsPanel
              localOverlay={clipAsOverlay as any}
              handleStyleChange={handleStyleChange}
            />
          }
          styleContent={
            <TextStylePanel
              localOverlay={clipAsOverlay as any}
              handleInputChange={handleInputChange}
              handleStyleChange={handleStyleChange}
              onPositionChange={handlePositionChange}
            />
          }
        />
      </div>
    </div>
  );
};
