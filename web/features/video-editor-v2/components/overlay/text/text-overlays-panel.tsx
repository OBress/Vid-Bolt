import React from "react";
import { useVideoEditorStore } from "../../../stores/video-editor-store";
import type { TimelineClip } from "../../../types/timeline-v2";

import { TextDetails } from "./text-details";
import { SelectTextOverlay } from "./select-text-overlay";

/**
 * TextOverlaysPanel Component
 *
 * A panel for managing text clips in the video editor.
 * Provides functionality for:
 * - Selecting text templates to add to the timeline
 * - Editing selected text clips
 *
 * Uses Timeline V2 clip-based API directly.
 *
 * @component
 */
export const TextOverlaysPanel: React.FC = () => {
  // Use VideoEditorStore for state - get selected text clip directly
  const selectedClip = useVideoEditorStore(s => {
    const ids = s.selection?.clipIds;
    if (!ids || ids.length !== 1) return null;
    const clip = s.clips[ids[0]];
    return clip?.type === 'text' ? clip : null;
  }) as TimelineClip | null;

  return (
    <div className="h-full overflow-y-auto sidepanel-scrollbar p-2">
      {!selectedClip ? (
        <SelectTextOverlay />
      ) : (
        <TextDetails
          clip={selectedClip}
        />
      )}
    </div>
  );
};
