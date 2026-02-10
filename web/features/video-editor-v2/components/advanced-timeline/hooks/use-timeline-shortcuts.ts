import { useHotkeys } from "react-hotkeys-hook";
import { ZOOM_CONSTRAINTS } from "../constants";

interface UseTimelineShortcutsProps {
  handlePlayPause: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  zoomScale: number;
  setZoomScale: (scale: number) => void;
  // New props for enhanced navigation (like Premiere Pro)
  onFrameStep?: (delta: number) => void; // Step forward/backward by frames
  onSeekToStart?: () => void; // Jump to start (Home key)
  onSeekToEnd?: () => void; // Jump to end (End key)
  onPlay?: () => void; // Play forward
  onPause?: () => void; // Pause playback
  isPlaying?: boolean; // Current playback state
  playbackRate?: number; // Current playback speed
  setPlaybackRate?: (rate: number) => void; // Set playback speed
  // Link/Unlink props (like Premiere Pro)
  onLink?: () => void; // Link selected items
  onUnlink?: () => void; // Unlink selected items
  canLink?: boolean; // Whether items can be linked
  canUnlink?: boolean; // Whether items can be unlinked
  // Delete props
  onDeleteSelectedItems?: () => void; // Delete selected items
  hasSelectedItems?: boolean; // Whether there are items selected
  // Transition delete props
  onDeleteSelectedTransition?: () => void; // Delete selected transition
  hasSelectedTransition?: boolean; // Whether a transition is selected
}

/**
 * A custom hook that sets up keyboard shortcuts for timeline controls
 * Like Premiere Pro:
 *
 * Playback controls:
 * - Space: Play/Pause
 * - K: Pause (stop)
 * - J: Play backward / increase reverse speed
 * - L: Play forward / increase forward speed
 *
 * Navigation:
 * - Left Arrow: Step 1 frame backward
 * - Right Arrow: Step 1 frame forward
 * - Shift + Left Arrow: Step 10 frames backward
 * - Shift + Right Arrow: Step 10 frames forward
 * - Home: Go to start
 * - End: Go to end
 *
 * History:
 * - Cmd/Ctrl + Z: Undo
 * - Cmd/Ctrl + Shift + Z or Cmd/Ctrl + Y: Redo
 *
 * Zoom:
 * - Cmd/Ctrl + Plus/=: Zoom in
 * - Cmd/Ctrl + Minus/-: Zoom out
 */
export const useTimelineShortcuts = ({
  handlePlayPause,
  undo,
  redo,
  canUndo,
  canRedo,
  zoomScale,
  setZoomScale,
  onFrameStep,
  onSeekToStart,
  onSeekToEnd,
  onPlay,
  onPause,
  isPlaying,
  playbackRate = 1,
  setPlaybackRate,
  onLink,
  onUnlink,
  canLink = false,
  canUnlink = false,
  onDeleteSelectedItems,
  hasSelectedItems = false,
  onDeleteSelectedTransition,
  hasSelectedTransition = false,
}: UseTimelineShortcutsProps) => {
  // Helper to check if we should ignore the keypress (user is typing)
  const shouldIgnoreKeypress = (e: KeyboardEvent): boolean => {
    const target = e.target as HTMLElement;
    return (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable ||
      !!target.closest('[contenteditable="true"]')
    );
  };

  // Space: Play/Pause
  useHotkeys(
    "space",
    (e) => {
      if (shouldIgnoreKeypress(e)) return;
      e.preventDefault();
      handlePlayPause();
    }
  );

  // K: Pause (like Premiere Pro)
  useHotkeys(
    "k",
    (e) => {
      if (shouldIgnoreKeypress(e)) return;
      e.preventDefault();
      if (isPlaying) {
        onPause?.();
      }
      // Reset playback rate to normal when pressing K
      setPlaybackRate?.(1);
    }
  );

  // J: Play backward / increase reverse speed (like Premiere Pro shuttle control)
  useHotkeys(
    "j",
    (e) => {
      if (shouldIgnoreKeypress(e)) return;
      e.preventDefault();
      
      if (!setPlaybackRate || !onPlay) return;
      
      // If currently playing forward, stop and start reverse
      if (playbackRate > 0) {
        setPlaybackRate(-1);
      } else if (playbackRate < 0) {
        // Already playing backward, increase speed (more negative)
        const newRate = Math.max(playbackRate * 2, -8); // Max 8x reverse
        setPlaybackRate(newRate);
      } else {
        // Stopped, start reverse
        setPlaybackRate(-1);
      }
      onPlay();
    }
  );

  // L: Play forward / increase forward speed (like Premiere Pro shuttle control)
  useHotkeys(
    "l",
    (e) => {
      if (shouldIgnoreKeypress(e)) return;
      e.preventDefault();
      
      if (!setPlaybackRate || !onPlay) return;
      
      // If currently playing backward, stop and start forward
      if (playbackRate < 0) {
        setPlaybackRate(1);
      } else if (playbackRate > 0) {
        // Already playing forward, increase speed
        const newRate = Math.min(playbackRate * 2, 8); // Max 8x forward
        setPlaybackRate(newRate);
      } else {
        // Stopped, start forward
        setPlaybackRate(1);
      }
      onPlay();
    }
  );

  // Left Arrow: Step 1 frame backward
  useHotkeys(
    "ArrowLeft",
    (e) => {
      if (shouldIgnoreKeypress(e)) return;
      e.preventDefault();
      // If playing, pause first
      if (isPlaying) {
        onPause?.();
      }
      onFrameStep?.(-1);
    },
    { keydown: true }
  );

  // Right Arrow: Step 1 frame forward
  useHotkeys(
    "ArrowRight",
    (e) => {
      if (shouldIgnoreKeypress(e)) return;
      e.preventDefault();
      // If playing, pause first
      if (isPlaying) {
        onPause?.();
      }
      onFrameStep?.(1);
    },
    { keydown: true }
  );

  // Shift + Left Arrow: Step 10 frames backward
  useHotkeys(
    "shift+ArrowLeft",
    (e) => {
      if (shouldIgnoreKeypress(e)) return;
      e.preventDefault();
      if (isPlaying) {
        onPause?.();
      }
      onFrameStep?.(-10);
    },
    { keydown: true }
  );

  // Shift + Right Arrow: Step 10 frames forward
  useHotkeys(
    "shift+ArrowRight",
    (e) => {
      if (shouldIgnoreKeypress(e)) return;
      e.preventDefault();
      if (isPlaying) {
        onPause?.();
      }
      onFrameStep?.(10);
    },
    { keydown: true }
  );

  // Home: Go to start
  useHotkeys(
    "Home",
    (e) => {
      if (shouldIgnoreKeypress(e)) return;
      e.preventDefault();
      onSeekToStart?.();
    }
  );

  // End: Go to end
  useHotkeys(
    "End",
    (e) => {
      if (shouldIgnoreKeypress(e)) return;
      e.preventDefault();
      onSeekToEnd?.();
    }
  );

  // Undo
  useHotkeys("meta+z, ctrl+z", (e) => {
    e.preventDefault();
    if (canUndo) undo();
  });

  // Redo
  useHotkeys("meta+shift+z, ctrl+shift+z, meta+y, ctrl+y", (e) => {
    e.preventDefault();
    if (canRedo) redo();
  });

  // Zoom in
  useHotkeys("meta+=, meta+plus, ctrl+=, ctrl+plus", (e) => {
    e.preventDefault();
    const newScale = Math.min(
      zoomScale + ZOOM_CONSTRAINTS.step,
      ZOOM_CONSTRAINTS.max
    );
    setZoomScale(newScale);
  });

  // Zoom out
  useHotkeys(
    "meta+-, meta+minus, ctrl+-, ctrl+minus",
    (e) => {
      e.preventDefault();
      const newScale = Math.max(
        zoomScale - ZOOM_CONSTRAINTS.step,
        ZOOM_CONSTRAINTS.min
      );
      setZoomScale(newScale);
    },
    {
      keydown: true,
      preventDefault: true,
    }
  );

  // Link items (Ctrl/Cmd + L)
  useHotkeys("meta+l, ctrl+l", (e) => {
    if (shouldIgnoreKeypress(e)) return;
    e.preventDefault();
    if (canLink && onLink) {
      onLink();
    }
  });

  // Unlink items (Ctrl/Cmd + Shift + L)
  useHotkeys("meta+shift+l, ctrl+shift+l", (e) => {
    if (shouldIgnoreKeypress(e)) return;
    e.preventDefault();
    if (canUnlink && onUnlink) {
      onUnlink();
    }
  });

  // Delete selected items or transitions (Delete or Backspace key)
  useHotkeys("Delete, Backspace", (e) => {
    if (shouldIgnoreKeypress(e)) return;
    e.preventDefault();
    if (hasSelectedItems && onDeleteSelectedItems) {
      onDeleteSelectedItems();
    } else if (hasSelectedTransition && onDeleteSelectedTransition) {
      onDeleteSelectedTransition();
    }
  });
}; 