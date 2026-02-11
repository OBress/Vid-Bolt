'use client';

/**
 * use-canvas-keyboard — Professional editor keyboard shortcuts for the canvas timeline
 *
 * Modelled after Adobe Premiere Pro, DaVinci Resolve, and CapCut Web.
 * Handles playback control (JKL shuttle), navigation, editing, tool switching,
 * and zoom when the canvas container is focused.
 *
 * IMPORTANT: All shortcuts only fire when the canvas container has focus
 * and the active element is not an input/textarea/contentEditable.
 */

import { useCallback, useRef } from 'react';
import { useVideoEditorStore } from '../../../../stores/video-editor-store';
import type { TrackWithClips, TimelineItem } from '../../../../stores/memoized-selectors';

// ============================================================
// TYPES
// ============================================================

export interface UseCanvasKeyboardOptions {
  /** Tracks (for navigation between items) */
  tracks: TrackWithClips[];
  /** Currently selected item IDs */
  selectedItemIds: string[];
  /** Callback to set selection (single) */
  onItemSelect?: (itemId: string) => void;
  /** Callback to change selection (shift/ctrl) */
  onSelectionChange?: (itemId: string, isMultiple: boolean) => void;
  /** Callback to request a zoom change: delta > 0 = zoom in */
  onZoomChange?: (delta: number) => void;
  /** Callback to zoom-to-fit the entire timeline */
  onZoomToFit?: () => void;
}

// ============================================================
// JKL SHUTTLE SPEEDS
// ============================================================

const SHUTTLE_RATES = [1, 2, 4, 8] as const;

// ============================================================
// HELPERS
// ============================================================

/** Check if the event target is an editable field */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!target) return false;
  if (target instanceof HTMLInputElement) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  if ((target as HTMLElement).isContentEditable) return true;
  return false;
}

/** Flatten all items from tracks into a single ordered list */
function getAllItems(tracks: TrackWithClips[]): { trackIndex: number; item: TimelineItem }[] {
  const result: { trackIndex: number; item: TimelineItem }[] = [];
  for (let ti = 0; ti < tracks.length; ti++) {
    const track = tracks[ti];
    if (!track.items) continue;
    for (const item of track.items) {
      result.push({ trackIndex: ti, item });
    }
  }
  // Sort by track index, then by start time
  result.sort((a, b) => a.trackIndex - b.trackIndex || a.item.start - b.item.start);
  return result;
}

/** Find items on a specific track, sorted by start time */
function getTrackItems(tracks: TrackWithClips[], trackIndex: number): TimelineItem[] {
  const track = tracks[trackIndex];
  if (!track?.items) return [];
  return [...track.items].sort((a, b) => a.start - b.start);
}

/** Find the track index containing an item by ID */
function findTrackIndexForItem(tracks: TrackWithClips[], itemId: string): number {
  for (let ti = 0; ti < tracks.length; ti++) {
    if (tracks[ti].items?.some(i => i.id === itemId)) return ti;
  }
  return -1;
}

/** Find an item by ID across all tracks */
function findItem(tracks: TrackWithClips[], itemId: string): TimelineItem | undefined {
  for (const track of tracks) {
    const found = track.items?.find(i => i.id === itemId);
    if (found) return found;
  }
  return undefined;
}

// ============================================================
// HOOK
// ============================================================

export function useCanvasKeyboard({
  tracks,
  selectedItemIds,
  onItemSelect,
  onSelectionChange,
  onZoomChange,
  onZoomToFit,
}: UseCanvasKeyboardOptions) {
  // JKL shuttle state
  const shuttleRef = useRef<{ direction: 'forward' | 'reverse'; speedIndex: number } | null>(null);

  // In-memory clipboard for copy/paste
  const clipboardRef = useRef<{ clipId: string; trackId: string; offset: number }[]>([]);

  /**
   * Main keydown handler — attach to the canvas container div's onKeyDown.
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (isEditableTarget(e.target)) return;

      const state = useVideoEditorStore.getState();
      const {
        togglePlayPause,
        play,
        pause,
        setPlaybackRate,
        setCurrentTime,
        setIsPlaying,
        deleteClips,
        splitClip,
        duplicateClip,
        selectClips,
        clearSelection,
        toggleSnapping,
        setEditMode,
        linkClips,
        unlinkClips,
        getLinkedClipIds,
        moveClip,
        trimClip,
        undo,
        redo,
        canUndo,
        canRedo,
      } = state;

      const fps = state.fps || 30;
      const currentTime = state.playback.currentTime;
      const isPlaying = state.playback.isPlaying;
      const frameDuration = 1 / fps;

      const key = e.key;
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const alt = e.altKey;

      // ========================================
      // UNDO / REDO (Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y)
      // ========================================
      if (ctrl && key === 'z' && !shift) {
        e.preventDefault();
        if (canUndo()) undo();
        return;
      }
      if ((ctrl && shift && key === 'z') || (ctrl && key === 'y')) {
        e.preventDefault();
        if (canRedo()) redo();
        return;
      }

      // ========================================
      // CLIPBOARD — Ctrl+C / Ctrl+V / Ctrl+X
      // ========================================

      // Ctrl+C = Copy selected clips
      if (ctrl && key === 'c') {
        e.preventDefault();
        if (selectedItemIds.length === 0) return;
        let earliest = Infinity;
        for (const id of selectedItemIds) {
          const clip = state.clips[id];
          if (clip && clip.startTime < earliest) earliest = clip.startTime;
        }
        clipboardRef.current = selectedItemIds
          .map(id => {
            const clip = state.clips[id];
            if (!clip) return null;
            return { clipId: id, trackId: clip.trackId, offset: clip.startTime - earliest };
          })
          .filter(Boolean) as { clipId: string; trackId: string; offset: number }[];
        return;
      }

      // Ctrl+V = Paste at playhead
      if (ctrl && key === 'v') {
        e.preventDefault();
        const entries = clipboardRef.current;
        if (entries.length === 0) return;
        const newIds: string[] = [];
        for (const entry of entries) {
          const newId = duplicateClip(entry.clipId);
          if (newId) {
            moveClip(newId, entry.trackId, currentTime + entry.offset);
            newIds.push(newId);
          }
        }
        if (newIds.length > 0) selectClips(newIds);
        return;
      }

      // Ctrl+X = Cut (copy + delete)
      if (ctrl && key === 'x') {
        e.preventDefault();
        if (selectedItemIds.length === 0) return;
        // Copy first
        let earliest = Infinity;
        for (const id of selectedItemIds) {
          const clip = state.clips[id];
          if (clip && clip.startTime < earliest) earliest = clip.startTime;
        }
        clipboardRef.current = selectedItemIds
          .map(id => {
            const clip = state.clips[id];
            if (!clip) return null;
            return { clipId: id, trackId: clip.trackId, offset: clip.startTime - earliest };
          })
          .filter(Boolean) as { clipId: string; trackId: string; offset: number }[];
        // Then delete
        deleteClips(selectedItemIds);
        clearSelection();
        return;
      }

      // ========================================
      // JKL SHUTTLE PLAYBACK
      // ========================================

      // L = Play forward (ramp speed: 1x → 2x → 4x → 8x)
      if (key === 'l' || key === 'L') {
        e.preventDefault();
        const shuttle = shuttleRef.current;
        if (shuttle?.direction === 'forward' && shuttle.speedIndex < SHUTTLE_RATES.length - 1) {
          shuttle.speedIndex++;
        } else {
          shuttleRef.current = { direction: 'forward', speedIndex: 0 };
        }
        const rate = SHUTTLE_RATES[shuttleRef.current!.speedIndex];
        setPlaybackRate(rate);
        if (!isPlaying) play();
        return;
      }

      // J = Play reverse (ramp speed: -1x → -2x → -4x → -8x)
      if (key === 'j' || key === 'J') {
        // Skip if the global shortcut handler uses J for keyframe navigation
        // Only handle if no keyframe selection is active
        if (state.keyframeSelection) return;
        e.preventDefault();
        const shuttle = shuttleRef.current;
        if (shuttle?.direction === 'reverse' && shuttle.speedIndex < SHUTTLE_RATES.length - 1) {
          shuttle.speedIndex++;
        } else {
          shuttleRef.current = { direction: 'reverse', speedIndex: 0 };
        }
        const rate = -SHUTTLE_RATES[shuttleRef.current!.speedIndex];
        setPlaybackRate(rate);
        if (!isPlaying) play();
        return;
      }

      // K = Stop playback, reset shuttle
      if (key === 'k' || key === 'K') {
        // Skip if keyframe selection is active (K used for keyframe add)
        if (state.keyframeSelection) return;
        e.preventDefault();
        shuttleRef.current = null;
        setPlaybackRate(1);
        if (isPlaying) pause();
        return;
      }

      // Space = Toggle play/pause, reset shuttle
      if (key === ' ') {
        e.preventDefault();
        shuttleRef.current = null;
        setPlaybackRate(1);
        togglePlayPause();
        return;
      }

      // ========================================
      // FRAME STEPPING
      // ========================================

      // ← = Step back 1 frame
      if (key === 'ArrowLeft' && !ctrl && !alt) {
        e.preventDefault();
        if (shift) {
          // Shift+Left = step back 10 frames
          setCurrentTime(Math.max(0, currentTime - frameDuration * 10));
        } else {
          setCurrentTime(Math.max(0, currentTime - frameDuration));
        }
        return;
      }

      // → = Step forward 1 frame
      if (key === 'ArrowRight' && !ctrl && !alt) {
        e.preventDefault();
        if (shift) {
          // Shift+Right = step forward 10 frames
          setCurrentTime(currentTime + frameDuration * 10);
        } else {
          setCurrentTime(currentTime + frameDuration);
        }
        return;
      }

      // ========================================
      // EDIT POINT NAVIGATION (↑ / ↓)
      // ========================================

      // ↑ = Jump to previous edit point (any clip edge before current time)
      if (key === 'ArrowUp' && !ctrl && !alt && !shift) {
        e.preventDefault();
        const allItems = getAllItems(tracks);
        const editPoints = new Set<number>();
        for (const { item } of allItems) {
          editPoints.add(item.start);
          editPoints.add(item.end);
        }
        const sorted = [...editPoints].sort((a, b) => a - b);
        // Find the largest edit point that is strictly before currentTime
        let prev: number | null = null;
        for (const pt of sorted) {
          if (pt < currentTime - frameDuration * 0.5) prev = pt;
          else break;
        }
        if (prev !== null) setCurrentTime(prev);
        return;
      }

      // ↓ = Jump to next edit point (any clip edge after current time)
      if (key === 'ArrowDown' && !ctrl && !alt && !shift) {
        e.preventDefault();
        const allItems = getAllItems(tracks);
        const editPoints = new Set<number>();
        for (const { item } of allItems) {
          editPoints.add(item.start);
          editPoints.add(item.end);
        }
        const sorted = [...editPoints].sort((a, b) => a - b);
        let next: number | null = null;
        for (const pt of sorted) {
          if (pt > currentTime + frameDuration * 0.5) {
            next = pt;
            break;
          }
        }
        if (next !== null) setCurrentTime(next);
        return;
      }

      // Home = Jump to timeline start
      if (key === 'Home') {
        e.preventDefault();
        setCurrentTime(0);
        return;
      }

      // End = Jump to timeline end
      if (key === 'End') {
        e.preventDefault();
        const duration = state.getDurationInSeconds();
        if (duration > 0) setCurrentTime(duration);
        return;
      }

      // ========================================
      // EDITING — DELETE / SPLIT / DUPLICATE
      // ========================================

      // Delete or Backspace = Delete selected clips
      if (key === 'Delete' || key === 'Backspace') {
        // Don't consume if keyframe selection handles it globally
        if (state.keyframeSelection?.keyframeIds?.length) return;
        if (selectedItemIds.length > 0) {
          e.preventDefault();
          deleteClips(selectedItemIds);
          clearSelection();
          return;
        }
      }

      // C = Split clip(s) at playhead (or Ctrl+K for Premiere-style)
      if ((key === 'c' && !ctrl && !shift && !alt) || (ctrl && key === 'k')) {
        e.preventDefault();
        if (selectedItemIds.length > 0) {
          // Split selected clips at playhead
          for (const clipId of selectedItemIds) {
            const item = findItem(tracks, clipId);
            if (item && currentTime > item.start && currentTime < item.end) {
              splitClip(clipId, currentTime);
            }
          }
        } else {
          // No selection — split all clips at current playhead
          const allItems = getAllItems(tracks);
          for (const { item } of allItems) {
            if (currentTime > item.start && currentTime < item.end) {
              splitClip(item.id, currentTime);
            }
          }
        }
        return;
      }

      // D = Duplicate selected clips
      if (key === 'd' && !ctrl && !shift && !alt) {
        e.preventDefault();
        const newIds: string[] = [];
        for (const clipId of selectedItemIds) {
          const newId = duplicateClip(clipId);
          if (newId) newIds.push(newId);
        }
        if (newIds.length > 0) {
          selectClips(newIds);
        }
        return;
      }

      // Q = Trim clip start to playhead
      if (key === 'q' && !ctrl && !shift && !alt) {
        e.preventDefault();
        for (const clipId of selectedItemIds) {
          const item = findItem(tracks, clipId);
          if (item && currentTime > item.start && currentTime < item.end) {
            const newDuration = item.end - currentTime;
            trimClip(clipId, currentTime, newDuration);
          }
        }
        return;
      }

      // W = Trim clip end to playhead
      if (key === 'w' && !ctrl && !shift && !alt) {
        e.preventDefault();
        for (const clipId of selectedItemIds) {
          const item = findItem(tracks, clipId);
          if (item && currentTime > item.start && currentTime < item.end) {
            const newDuration = currentTime - item.start;
            trimClip(clipId, item.start, newDuration);
          }
        }
        return;
      }

      // ========================================
      // NUDGE — move clips by frames
      // ========================================

      // . = Nudge selected clips forward 1 frame (Shift = 10 frames)
      if (key === '.' && !ctrl && !alt) {
        e.preventDefault();
        const nudge = shift ? frameDuration * 10 : frameDuration;
        for (const clipId of selectedItemIds) {
          const item = findItem(tracks, clipId);
          if (item) {
            const trackIndex = findTrackIndexForItem(tracks, clipId);
            if (trackIndex >= 0) {
              moveClip(clipId, tracks[trackIndex].id, item.start + nudge);
            }
          }
        }
        return;
      }

      // , = Nudge selected clips backward 1 frame (Shift = 10 frames)
      if (key === ',' && !ctrl && !alt) {
        e.preventDefault();
        const nudge = shift ? frameDuration * 10 : frameDuration;
        for (const clipId of selectedItemIds) {
          const item = findItem(tracks, clipId);
          if (item) {
            const trackIndex = findTrackIndexForItem(tracks, clipId);
            if (trackIndex >= 0) {
              moveClip(clipId, tracks[trackIndex].id, Math.max(0, item.start - nudge));
            }
          }
        }
        return;
      }

      // ========================================
      // SELECTION
      // ========================================

      // Ctrl+A = Select all items
      if (ctrl && key === 'a') {
        e.preventDefault();
        const allIds = getAllItems(tracks).map(({ item }) => item.id);
        if (allIds.length > 0) selectClips(allIds);
        return;
      }

      // Escape = Clear selection
      if (key === 'Escape') {
        e.preventDefault();
        shuttleRef.current = null;
        setPlaybackRate(1);
        clearSelection();
        return;
      }

      // ========================================
      // TOOLS & TOGGLES
      // ========================================

      // V = Selection tool
      if (key === 'v' && !ctrl && !shift && !alt) {
        e.preventDefault();
        setEditMode('select');
        return;
      }

      // B = Razor/blade tool
      if (key === 'b' && !ctrl && !shift && !alt) {
        e.preventDefault();
        setEditMode('razor');
        return;
      }

      // S or N = Toggle snapping
      if ((key === 's' || key === 'n') && !ctrl && !shift && !alt) {
        e.preventDefault();
        toggleSnapping();
        return;
      }

      // Ctrl+L = Link/unlink selected clips
      if (ctrl && key === 'l') {
        e.preventDefault();
        if (selectedItemIds.length >= 2) {
          // Check if they're already linked
          const firstLinked = getLinkedClipIds(selectedItemIds[0]);
          const allLinked = selectedItemIds.every(id => firstLinked.includes(id));
          if (allLinked) {
            unlinkClips(selectedItemIds);
          } else {
            // Link them pairwise
            for (let i = 1; i < selectedItemIds.length; i++) {
              linkClips(selectedItemIds[0], selectedItemIds[i]);
            }
          }
        }
        return;
      }

      // ========================================
      // ZOOM
      // ========================================

      // + / = = Zoom in
      if ((key === '+' || key === '=') && !ctrl) {
        e.preventDefault();
        onZoomChange?.(1);
        return;
      }

      // - = Zoom out
      if (key === '-' && !ctrl) {
        e.preventDefault();
        onZoomChange?.(-1);
        return;
      }

      // Shift+Z = Zoom to fit
      if (shift && (key === 'z' || key === 'Z') && !ctrl) {
        e.preventDefault();
        onZoomToFit?.();
        return;
      }
    },
    [tracks, selectedItemIds, onItemSelect, onSelectionChange, onZoomChange, onZoomToFit],
  );

  return { handleKeyDown };
}
