'use client';

/**
 * use-clipboard — Copy/paste/cut for timeline clips
 *
 * Maintains an in-memory clipboard buffer of serialized clip data.
 * Handles Ctrl+C/V/X with proper ID regeneration and relative positioning.
 *
 * Inspired by Premiere Pro and DaVinci Resolve clipboard behavior.
 */

import { useCallback, useRef } from 'react';
import { useVideoEditorStore } from '../../../../stores/video-editor-store';
import type { TrackWithClips, TimelineItem } from '../../../../stores/memoized-selectors';

// ============================================================
// TYPES
// ============================================================

interface ClipboardEntry {
  /** Original clip ID (for reference, not reused) */
  originalId: string;
  /** Track ID the clip came from */
  trackId: string;
  /** Offset from the earliest clip in the selection (seconds) */
  offsetFromFirst: number;
  /** Duration of the clip */
  duration: number;
  /** Clip type */
  type: string;
  /** Full clip data snapshot for duplication */
  clipId: string;
}

export interface UseClipboardOptions {
  /** Tracks (for finding clips) */
  tracks: TrackWithClips[];
  /** Currently selected item IDs */
  selectedItemIds: string[];
}

// ============================================================
// HOOK
// ============================================================

export function useClipboard({ tracks, selectedItemIds }: UseClipboardOptions) {
  const clipboardRef = useRef<ClipboardEntry[]>([]);

  /**
   * Copy selected clips to clipboard buffer.
   * Stores relative offsets from the earliest selected clip.
   */
  const copy = useCallback(() => {
    if (selectedItemIds.length === 0) return;

    const state = useVideoEditorStore.getState();
    const entries: ClipboardEntry[] = [];
    let earliestStart = Infinity;

    // First pass: find the earliest start time
    for (const clipId of selectedItemIds) {
      const clip = state.clips[clipId];
      if (clip && clip.startTime < earliestStart) {
        earliestStart = clip.startTime;
      }
    }

    // Second pass: create clipboard entries with offsets
    for (const clipId of selectedItemIds) {
      const clip = state.clips[clipId];
      if (!clip) continue;
      entries.push({
        originalId: clip.id,
        trackId: clip.trackId,
        offsetFromFirst: clip.startTime - earliestStart,
        duration: clip.duration,
        type: clip.type,
        clipId: clip.id, // Store for duplication via store action
      });
    }

    clipboardRef.current = entries;
  }, [selectedItemIds]);

  /**
   * Paste clipboard contents at the current playhead position.
   * Creates new clips via duplicateClip, then repositions them.
   */
  const paste = useCallback(() => {
    const entries = clipboardRef.current;
    if (entries.length === 0) return;

    const state = useVideoEditorStore.getState();
    const currentTime = state.playback.currentTime;
    const { duplicateClip, moveClip, selectClips } = state;

    const newIds: string[] = [];

    for (const entry of entries) {
      // Duplicate the original clip
      const newId = duplicateClip(entry.clipId);
      if (newId) {
        // Move to position: playhead + relative offset
        const targetTime = currentTime + entry.offsetFromFirst;
        moveClip(newId, entry.trackId, targetTime);
        newIds.push(newId);
      }
    }

    // Select the newly pasted clips
    if (newIds.length > 0) {
      selectClips(newIds);
    }
  }, []);

  /**
   * Cut = copy + delete selected.
   */
  const cut = useCallback(() => {
    copy();
    if (selectedItemIds.length > 0) {
      const state = useVideoEditorStore.getState();
      state.deleteClips(selectedItemIds);
      state.clearSelection();
    }
  }, [copy, selectedItemIds]);

  /**
   * Keyboard event handler — call from the parent's onKeyDown.
   * Returns true if the event was handled.
   */
  const handleClipboardKey = useCallback(
    (e: React.KeyboardEvent): boolean => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return false;

      switch (e.key) {
        case 'c':
          e.preventDefault();
          copy();
          return true;
        case 'v':
          e.preventDefault();
          paste();
          return true;
        case 'x':
          e.preventDefault();
          cut();
          return true;
        default:
          return false;
      }
    },
    [copy, paste, cut],
  );

  return { copy, paste, cut, handleClipboardKey };
}
