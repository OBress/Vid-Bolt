/**
 * Canvas Timeline Utilities
 *
 * Pure functions for coordinate math shared across all canvas timeline components.
 * These convert between time-domain values and pixel-domain values using the
 * same duration/width calculations as the existing DOM timeline.
 */

// ============================================================
// TIME ↔ PIXEL CONVERSION
// ============================================================

/**
 * Convert a time value (seconds) to a pixel X position.
 *
 * @param time           Time in seconds
 * @param totalDuration  Scrollable duration (seconds) — the full width in time-domain
 * @param totalWidth     Scrollable width (pixels) — the full width in pixel-domain
 * @returns              X position in pixels
 */
export function timeToX(
  time: number,
  totalDuration: number,
  totalWidth: number,
): number {
  if (totalDuration <= 0) return 0;
  return (time / totalDuration) * totalWidth;
}

/**
 * Convert a pixel X position to a time value (seconds).
 *
 * @param x              X position in pixels
 * @param totalDuration  Scrollable duration (seconds)
 * @param totalWidth     Scrollable width (pixels)
 * @returns              Time in seconds
 */
export function xToTime(
  x: number,
  totalDuration: number,
  totalWidth: number,
): number {
  if (totalWidth <= 0) return 0;
  return (x / totalWidth) * totalDuration;
}

// ============================================================
// LAYOUT HELPERS
// ============================================================

/**
 * Get the vertical Y offset for a given track index.
 * Accounts for the top spacer (Add Video Track button = 28px)
 * and the divider between video/audio sections.
 *
 * @param trackIndex  Zero-based index of the track in the sorted tracks array
 * @param trackHeight Height of each track row in pixels
 * @param tracks      Array of tracks (used to detect video→audio boundary)
 * @returns           Y offset in pixels for this track's container
 */
export function getTrackYOffset(
  trackIndex: number,
  trackHeight: number,
  tracks: ReadonlyArray<{ type: string }>,
): number {
  const ADD_VIDEO_BUTTON_HEIGHT = 28; // Matches h-7 spacer in DOM version
  const DIVIDER_HEIGHT = trackHeight / 2; // Half-track divider between video/audio

  let y = ADD_VIDEO_BUTTON_HEIGHT;

  for (let i = 0; i < trackIndex; i++) {
    y += trackHeight;

    // Add divider height if transitioning from video to audio
    if (i + 1 < tracks.length && tracks[i].type === 'video' && tracks[i + 1].type === 'audio') {
      y += DIVIDER_HEIGHT;
    }
  }

  return y;
}

/**
 * Compute the total content height for all tracks.
 *
 * @param tracks      Array of tracks
 * @param trackHeight Height of each track row
 * @returns           Total content height in pixels
 */
export function getTotalContentHeight(
  tracks: ReadonlyArray<{ type: string }>,
  trackHeight: number,
): number {
  const ADD_VIDEO_BUTTON_HEIGHT = 28;
  const DIVIDER_HEIGHT = trackHeight / 2;
  const BOTTOM_SPACER = trackHeight / 2;

  let height = ADD_VIDEO_BUTTON_HEIGHT;

  for (let i = 0; i < tracks.length; i++) {
    height += trackHeight;

    // Divider between video and audio sections
    if (i + 1 < tracks.length && tracks[i].type === 'video' && tracks[i + 1].type === 'audio') {
      height += DIVIDER_HEIGHT;
    }
  }

  // Bottom spacer (for "Add Audio Track" or visual comfort)
  const hasAudioTracks = tracks.some(t => t.type === 'audio');
  if (!hasAudioTracks) {
    height += DIVIDER_HEIGHT;
  }

  height += BOTTOM_SPACER;

  return height;
}

// ============================================================
// ITEM DIMENSION HELPERS
// ============================================================

/**
 * Compute the pixel rectangle for a timeline item.
 *
 * @param item          Object with `start` and `end` in seconds
 * @param totalDuration Scrollable duration (seconds)
 * @param totalWidth    Scrollable width (pixels)
 * @param trackHeight   Height of the track
 * @param itemHeight    Height of the item within the track
 * @returns             { x, y, width, height } in pixels
 */
export function getItemRect(
  item: { start: number; end: number },
  totalDuration: number,
  totalWidth: number,
  trackHeight: number,
  itemHeight: number,
): { x: number; y: number; width: number; height: number } {
  const x = timeToX(item.start, totalDuration, totalWidth);
  const endX = timeToX(item.end, totalDuration, totalWidth);
  const width = Math.max(endX - x, 2); // Minimum 2px width so items are always visible
  const y = (trackHeight - itemHeight) / 2; // Center item vertically within track

  return { x, y, width, height: itemHeight };
}

// ============================================================
// HIT TESTING
// ============================================================

/**
 * Check if a point is within a rounded rectangle (axis-aligned).
 * Used for click detection when the canvas doesn't provide built-in hit testing.
 *
 * @param px     Point X
 * @param py     Point Y
 * @param rx     Rectangle X
 * @param ry     Rectangle Y
 * @param rw     Rectangle width
 * @param rh     Rectangle height
 * @returns      True if point is inside the rectangle
 */
export function pointInRect(
  px: number,
  py: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): boolean {
  return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
}

// ============================================================
// COLOR HELPERS
// ============================================================

/**
 * Convert a CSS hex color string to a PixiJS numeric color.
 * Handles both '#RRGGBB' and '#RGB' formats.
 *
 * @param hex  CSS hex color string (e.g., '#0ea5e9')
 * @returns    Numeric color value (e.g., 0x0ea5e9)
 */
export function hexToPixiColor(hex: string): number {
  if (!hex || hex.length < 4) return 0x3b82f6; // Fallback blue
  const cleaned = hex.startsWith('#') ? hex.slice(1) : hex;

  // Expand shorthand (#RGB → #RRGGBB)
  const full =
    cleaned.length === 3
      ? cleaned[0] + cleaned[0] + cleaned[1] + cleaned[1] + cleaned[2] + cleaned[2]
      : cleaned;

  return parseInt(full, 16) || 0x3b82f6;
}

/**
 * Generate a slightly darker variant of a hex color for borders/shadows.
 *
 * @param hex    CSS hex color string
 * @param factor Darkening factor (0-1, where 0 = black, 1 = original)
 * @returns      Darkened hex color string
 */
export function darkenColor(hex: string, factor: number = 0.7): string {
  const num = hexToPixiColor(hex);
  const r = Math.floor(((num >> 16) & 0xff) * factor);
  const g = Math.floor(((num >> 8) & 0xff) * factor);
  const b = Math.floor((num & 0xff) * factor);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// ============================================================
// TEXT HELPERS
// ============================================================

/**
 * Truncate a label to fit within a given pixel width.
 * Uses a rough character-width estimate (6px per char at 11px font).
 *
 * @param label     Full label text
 * @param maxWidth  Available width in pixels (accounting for padding)
 * @param fontSize  Font size in pixels (default 11)
 * @returns         Truncated label with ellipsis if needed
 */
export function truncateLabel(
  label: string,
  maxWidth: number,
  fontSize: number = 11,
): string {
  if (!label) return '';

  const avgCharWidth = fontSize * 0.6; // Rough estimate for proportional fonts
  const maxChars = Math.floor(maxWidth / avgCharWidth);

  if (maxChars <= 0) return '';
  if (label.length <= maxChars) return label;
  if (maxChars <= 3) return label.substring(0, maxChars);

  return label.substring(0, maxChars - 1) + '…';
}
