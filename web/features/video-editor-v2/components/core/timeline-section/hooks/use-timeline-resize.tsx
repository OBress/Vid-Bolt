import React from 'react';
import { useVerticalResize } from '../../../../hooks/use-vertical-resize';
import { TIMELINE_CONSTANTS } from '../../../advanced-timeline/constants';

interface UseTimelineResizeOptions {
  /** Number of tracks in the timeline (not affected by track visibility) */
  trackCount: number;
}

/**
 * Constants for timeline height calculations
 */
const HEIGHT_CONSTANTS = {
  /** Minimum timeline height to ensure usability */
  MIN_TIMELINE_HEIGHT: 150,
  /** Maximum timeline height - allow users to expand as much as they want */
  MAX_TIMELINE_HEIGHT: 2000,
  /** Height of the "Add Video Track" button at top */
  ADD_VIDEO_BUTTON_HEIGHT: 28, // h-7
  /** Height of the audio tracks separator / "Add Audio Track" button */
  AUDIO_SEPARATOR_HEIGHT: 20, // h-5
  /** Buffer for borders, scrollbar prevention, and any extra elements */
  EXTRA_BUFFER: 24,
  /** Default number of tracks to show without scrolling */
  DEFAULT_VISIBLE_TRACKS: 4,
} as const;

/**
 * Compact mode constants - reduced sizes for space saving
 */
const COMPACT_CONSTANTS = {
  TRACK_HEIGHT: 32, // Reduced from 48
  TRACK_ITEM_HEIGHT: 26, // Reduced from 40
  MARKERS_HEIGHT: 28, // Reduced from 40
} as const;

/**
 * Custom hook for managing timeline resize functionality
 * - Uses a fixed large max height so users can resize freely
 * - Height persists across sessions via localStorage
 * - Supports compact mode for space-saving
 * - No auto-expand - users control the height manually via drag handle
 */
export const useTimelineResize = ({ trackCount: passedTrackCount }: UseTimelineResizeOptions) => {
  /**
   * Use the passed track count, with a minimum of 2 tracks (like Premiere Pro: V1 + A1)
   */
  const MIN_TRACKS = 2;
  const trackCount = Math.max(passedTrackCount, MIN_TRACKS);

  /**
   * Compact mode state - persisted in localStorage
   */
  const [isCompact, setIsCompact] = React.useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('editor-timeline-compact');
      return saved === 'true';
    }
    return false;
  });

  // Persist compact mode to localStorage
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('editor-timeline-compact', isCompact.toString());
    }
  }, [isCompact]);

  /**
   * Get the current track height based on compact mode
   */
  const currentTrackHeight = isCompact ? COMPACT_CONSTANTS.TRACK_HEIGHT : TIMELINE_CONSTANTS.TRACK_HEIGHT;
  const currentMarkersHeight = isCompact ? COMPACT_CONSTANTS.MARKERS_HEIGHT : TIMELINE_CONSTANTS.MARKERS_HEIGHT;

  /**
   * Calculate the height needed to show a specific number of tracks
   */
  const calculateHeightForTracks = React.useCallback((numTracks: number, useCompact: boolean) => {
    const trackHeightVal = useCompact ? COMPACT_CONSTANTS.TRACK_HEIGHT : TIMELINE_CONSTANTS.TRACK_HEIGHT;
    const markersHeightVal = useCompact ? COMPACT_CONSTANTS.MARKERS_HEIGHT : TIMELINE_CONSTANTS.MARKERS_HEIGHT;
    
    return TIMELINE_CONSTANTS.HEADER_HEIGHT + // Timeline header with controls
           markersHeightVal + // Time ruler
           HEIGHT_CONSTANTS.ADD_VIDEO_BUTTON_HEIGHT + // "Add Video Track" button
           (numTracks * trackHeightVal) + // All tracks
           HEIGHT_CONSTANTS.AUDIO_SEPARATOR_HEIGHT + // "Add Audio Track" separator
           HEIGHT_CONSTANTS.EXTRA_BUFFER; // Buffer for borders and to prevent scrollbar
  }, []);

  /**
   * Calculate the recommended height to show all current tracks (capped at default visible)
   */
  const recommendedHeight = React.useMemo(() => {
    // Show all tracks if <= default, otherwise cap at default
    const tracksToShow = Math.min(trackCount, HEIGHT_CONSTANTS.DEFAULT_VISIBLE_TRACKS);
    return calculateHeightForTracks(tracksToShow, isCompact);
  }, [calculateHeightForTracks, isCompact, trackCount]);

  /**
   * Calculate initial height: always fit default number of tracks (4) for comfortable viewing
   */
  const calculateInitialHeight = React.useCallback(() => {
    // Always default to 4 tracks worth of height for a comfortable initial view
    return calculateHeightForTracks(HEIGHT_CONSTANTS.DEFAULT_VISIBLE_TRACKS, false);
  }, [calculateHeightForTracks]);

  /**
   * Vertical resize functionality for timeline
   * Uses a fixed large max height so users can resize freely
   * Height is persisted in localStorage and restored on page load
   */
  const { bottomHeight, isResizing, handleMouseDown, handleTouchStart, setHeight } = useVerticalResize({
    initialHeight: calculateInitialHeight(),
    minHeight: HEIGHT_CONSTANTS.MIN_TIMELINE_HEIGHT,
    maxHeight: HEIGHT_CONSTANTS.MAX_TIMELINE_HEIGHT,
    storageKey: 'editor-timeline-height-v2', // v2: updated height calculation for 4 tracks
  });

  /**
   * Toggle compact mode and automatically adjust height to fit ALL tracks perfectly
   */
  const toggleCompactMode = React.useCallback(() => {
    setIsCompact(prev => {
      const newIsCompact = !prev;
      // Fit ALL tracks perfectly in the new mode - no scrollbar
      const newHeight = calculateHeightForTracks(trackCount, newIsCompact);
      setHeight(newHeight);
      return newIsCompact;
    });
  }, [calculateHeightForTracks, setHeight, trackCount]);

  return {
    bottomHeight,
    isResizing,
    handleMouseDown,
    handleTouchStart,
    trackCount,
    recommendedHeight,
    // Compact mode
    isCompact,
    toggleCompactMode,
    currentTrackHeight,
    currentMarkersHeight,
    compactTrackItemHeight: isCompact ? COMPACT_CONSTANTS.TRACK_ITEM_HEIGHT : TIMELINE_CONSTANTS.TRACK_ITEM_HEIGHT,
  };
};

