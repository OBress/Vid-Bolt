/**
 * rem ↔ px conversion utilities.
 *
 * All timeline dimensions are defined in rem so they scale with
 * the browser's root font-size (accessibility, display preferences).
 * PixiJS canvas needs pixel values, so we convert at the entry point
 * (useTimelineResize) and pass px downstream.
 */

/**
 * Convert a rem value to rounded pixels using the current root font-size.
 * SSR-safe: falls back to the browser default of 16px.
 */
export function remToPx(rem: number): number {
  if (typeof document === 'undefined') return Math.round(rem * 16);
  const rootFontSize =
    parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  return Math.round(rem * rootFontSize);
}
