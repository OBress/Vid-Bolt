/**
 * Time Conversion Utilities
 * 
 * Centralized utilities for converting between frames and seconds.
 * The video editor internally uses SECONDS for all time values (keyframes, durations, etc.)
 * External sources (AI, some UI inputs) may use FRAMES which need conversion.
 * 
 * CONVENTION:
 * - All internal time values are in SECONDS
 * - Keyframe.time is in SECONDS
 * - PropertyKeyframes times are in SECONDS
 * - CompositionLayer.startTime and duration are in FRAMES (Remotion convention)
 * - AI-generated keyframe times are in FRAMES and must be converted
 */

// ============================================================
// BRANDED TYPES FOR TYPE SAFETY
// ============================================================

/**
 * Time value in frames (branded type for compile-time safety)
 * Use this when you know a value is specifically in frames
 */
export type FrameTime = number & { readonly __brand: 'FrameTime' };

/**
 * Time value in seconds (branded type for compile-time safety)
 * Use this when you know a value is specifically in seconds
 */
export type SecondsTime = number & { readonly __brand: 'SecondsTime' };

// ============================================================
// CONVERSION FUNCTIONS
// ============================================================

/**
 * Convert frames to seconds
 * 
 * @param frames - Time in frames
 * @param fps - Frames per second (default: 30)
 * @returns Time in seconds
 * 
 * @example
 * framesToSeconds(30, 30) // returns 1 (30 frames at 30fps = 1 second)
 * framesToSeconds(90, 30) // returns 3 (90 frames at 30fps = 3 seconds)
 */
export function framesToSeconds(frames: number, fps: number = 30): number {
  if (fps <= 0) {
    console.warn('[TimeConversion] Invalid fps value:', fps, '- using 30');
    fps = 30;
  }
  return frames / fps;
}

/**
 * Convert seconds to frames
 * 
 * @param seconds - Time in seconds
 * @param fps - Frames per second (default: 30)
 * @returns Time in frames (rounded to nearest frame)
 * 
 * @example
 * secondsToFrames(1, 30) // returns 30 (1 second at 30fps = 30 frames)
 * secondsToFrames(2.5, 30) // returns 75 (2.5 seconds at 30fps = 75 frames)
 */
export function secondsToFrames(seconds: number, fps: number = 30): number {
  if (fps <= 0) {
    console.warn('[TimeConversion] Invalid fps value:', fps, '- using 30');
    fps = 30;
  }
  return Math.round(seconds * fps);
}

/**
 * Convert frames to seconds (same as framesToSeconds but with explicit naming)
 */
export const frameToSecond = framesToSeconds;
export const secondToFrame = secondsToFrames;

// ============================================================
// KEYFRAME-SPECIFIC UTILITIES
// ============================================================

/**
 * Convert keyframe times from frames to seconds
 * Used when processing AI-generated keyframes which use frame numbers
 * 
 * @param keyframes - Array of keyframes with time in frames
 * @param fps - Frames per second
 * @returns Array of keyframes with time in seconds
 */
export function convertKeyframeTimesToSeconds<T extends { time: number }>(
  keyframes: T[],
  fps: number = 30
): T[] {
  return keyframes.map(kf => ({
    ...kf,
    time: framesToSeconds(kf.time, fps),
  }));
}

/**
 * Convert keyframe times from seconds to frames
 * Used when exporting or displaying keyframes in frame-based UI
 * 
 * @param keyframes - Array of keyframes with time in seconds
 * @param fps - Frames per second
 * @returns Array of keyframes with time in frames
 */
export function convertKeyframeTimesToFrames<T extends { time: number }>(
  keyframes: T[],
  fps: number = 30
): T[] {
  return keyframes.map(kf => ({
    ...kf,
    time: secondsToFrames(kf.time, fps),
  }));
}

// ============================================================
// VALIDATION & DETECTION
// ============================================================

/**
 * Heuristically detect if keyframe times appear to be in frames rather than seconds
 * This is useful for validating AI output or detecting format issues
 * 
 * @param keyframeTimes - Array of time values
 * @param fps - Expected frames per second
 * @param duration - Expected duration in seconds
 * @returns true if times appear to be in frames, false if they appear to be in seconds
 */
export function detectFrameBasedTimes(
  keyframeTimes: number[],
  fps: number = 30,
  duration?: number
): boolean {
  if (keyframeTimes.length === 0) return false;
  
  const maxTime = Math.max(...keyframeTimes);
  
  // If max time is greater than a reasonable duration in seconds (e.g., 60 seconds),
  // it's likely in frames
  if (maxTime > 60) {
    return true;
  }
  
  // If we know the expected duration in seconds, check if max time exceeds it significantly
  if (duration && maxTime > duration * 1.5) {
    return true;
  }
  
  // If times are all integers and the max is close to duration * fps, likely frames
  const allIntegers = keyframeTimes.every(t => Number.isInteger(t));
  if (allIntegers && duration && Math.abs(maxTime - duration * fps) < fps) {
    return true;
  }
  
  return false;
}

/**
 * Automatically convert keyframe times to seconds if they appear to be in frames
 * 
 * @param keyframes - Array of keyframes
 * @param fps - Frames per second
 * @param expectedDurationSeconds - Expected duration in seconds (for detection)
 * @returns Keyframes with times guaranteed to be in seconds
 */
export function normalizeKeyframeTimes<T extends { time: number }>(
  keyframes: T[],
  fps: number = 30,
  expectedDurationSeconds?: number
): T[] {
  if (keyframes.length === 0) return keyframes;
  
  const times = keyframes.map(kf => kf.time);
  const needsConversion = detectFrameBasedTimes(times, fps, expectedDurationSeconds);
  
  if (needsConversion) {
    console.log('[TimeConversion] Auto-converting keyframe times from frames to seconds');
    return convertKeyframeTimesToSeconds(keyframes, fps);
  }
  
  return keyframes;
}

// ============================================================
// DISPLAY FORMATTING
// ============================================================

/**
 * Format time in seconds as a display string
 * 
 * @param seconds - Time in seconds
 * @param format - Display format ('seconds' | 'timecode' | 'frames')
 * @param fps - Frames per second (for timecode/frames format)
 */
export function formatTime(
  seconds: number,
  format: 'seconds' | 'timecode' | 'frames' = 'seconds',
  fps: number = 30
): string {
  switch (format) {
    case 'frames':
      return `${secondsToFrames(seconds, fps)}f`;
    
    case 'timecode': {
      const totalFrames = secondsToFrames(seconds, fps);
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      const frames = totalFrames % fps;
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
    }
    
    case 'seconds':
    default:
      return `${seconds.toFixed(2)}s`;
  }
}

/**
 * Parse a time string to seconds
 * Supports formats: "1.5s", "45f", "00:01:15" (timecode)
 * 
 * @param timeString - Time string to parse
 * @param fps - Frames per second (for frame/timecode parsing)
 */
export function parseTime(timeString: string, fps: number = 30): number {
  const trimmed = timeString.trim().toLowerCase();
  
  // Frames format: "30f", "45f"
  if (trimmed.endsWith('f')) {
    const frames = parseInt(trimmed.slice(0, -1), 10);
    return framesToSeconds(frames, fps);
  }
  
  // Seconds format: "1.5s", "2s"
  if (trimmed.endsWith('s')) {
    return parseFloat(trimmed.slice(0, -1));
  }
  
  // Timecode format: "00:01:15" (MM:SS:FF)
  const timecodeMatch = trimmed.match(/^(\d{2}):(\d{2}):(\d{2})$/);
  if (timecodeMatch) {
    const mins = parseInt(timecodeMatch[1], 10);
    const secs = parseInt(timecodeMatch[2], 10);
    const frames = parseInt(timecodeMatch[3], 10);
    return mins * 60 + secs + framesToSeconds(frames, fps);
  }
  
  // Plain number - assume seconds
  return parseFloat(trimmed) || 0;
}

// ============================================================
// CONSTANTS
// ============================================================

/** Standard frame rate */
export const DEFAULT_FPS = 30;

/** Common frame rates */
export const COMMON_FPS = {
  FILM: 24,
  NTSC: 29.97,
  PAL: 25,
  WEB: 30,
  HIGH: 60,
} as const;
