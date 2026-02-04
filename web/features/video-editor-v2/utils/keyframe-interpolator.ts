/**
 * Keyframe Interpolation Engine
 * 
 * Calculates interpolated values between keyframes at any point in time.
 * Supports multiple interpolation types including custom bezier curves.
 * 
 * Features:
 * - Linear interpolation
 * - Hold (step) interpolation
 * - Bezier curve interpolation with custom handles
 * - Preset easing functions
 * - Multi-dimensional value interpolation (arrays, colors)
 */

import type {
  Keyframe,
  PropertyKeyframes,
  KeyframeValue,
  KeyframeInterpolation,
  InterpolationType,
  BezierHandles,
} from '../types/keyframes';
import {
  findSurroundingKeyframes,
  getPresetBezierHandles,
  usesBezierCurve,
} from '../types/keyframes';
import {
  evaluateCubicBezier,
  getEasingFunction,
  bounceOut,
  elasticOut,
  elasticIn,
  elasticInOut,
} from './bezier-curve';
import { framesToSeconds } from './time-conversion';

// ============================================================
// INTERPOLATION FUNCTIONS
// ============================================================

/**
 * Linear interpolation between two values
 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Interpolate between two numeric values with easing
 */
function interpolateNumber(
  fromValue: number,
  toValue: number,
  progress: number,
  interpolation: KeyframeInterpolation
): number {
  // Get eased progress
  const easedProgress = applyEasing(progress, interpolation);
  
  // Linear interpolation with eased progress
  return lerp(fromValue, toValue, easedProgress);
}

/**
 * Interpolate between two number arrays (e.g., position [x, y], color [r, g, b])
 */
function interpolateNumberArray(
  fromValue: number[],
  toValue: number[],
  progress: number,
  interpolation: KeyframeInterpolation
): number[] {
  const easedProgress = applyEasing(progress, interpolation);
  
  // Interpolate each component
  const result: number[] = [];
  const length = Math.max(fromValue.length, toValue.length);
  
  for (let i = 0; i < length; i++) {
    const from = fromValue[i] ?? 0;
    const to = toValue[i] ?? 0;
    result.push(lerp(from, to, easedProgress));
  }
  
  return result;
}

/**
 * Interpolate between two color strings (hex or rgba)
 */
function interpolateColor(
  fromColor: string,
  toColor: string,
  progress: number,
  interpolation: KeyframeInterpolation
): string {
  const fromRgb = parseColor(fromColor);
  const toRgb = parseColor(toColor);
  
  if (!fromRgb || !toRgb) {
    // Fall back to discrete switch at midpoint
    return progress < 0.5 ? fromColor : toColor;
  }
  
  const easedProgress = applyEasing(progress, interpolation);
  
  const r = Math.round(lerp(fromRgb.r, toRgb.r, easedProgress));
  const g = Math.round(lerp(fromRgb.g, toRgb.g, easedProgress));
  const b = Math.round(lerp(fromRgb.b, toRgb.b, easedProgress));
  const a = lerp(fromRgb.a, toRgb.a, easedProgress);
  
  if (a < 1) {
    return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
  }
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Parse a color string to RGB components
 */
function parseColor(color: string): { r: number; g: number; b: number; a: number } | null {
  // Handle hex colors
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: 1,
      };
    }
    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: 1,
      };
    }
    if (hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: parseInt(hex.slice(6, 8), 16) / 255,
      };
    }
  }
  
  // Handle rgb/rgba
  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1], 10),
      g: parseInt(rgbMatch[2], 10),
      b: parseInt(rgbMatch[3], 10),
      a: rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1,
    };
  }
  
  return null;
}

/**
 * Apply easing to a progress value (0-1)
 */
function applyEasing(progress: number, interpolation: KeyframeInterpolation): number {
  const { type, bezierHandles } = interpolation;
  
  // Handle hold interpolation (step function)
  if (type === 'hold') {
    return 0; // Always return start value until we hit the next keyframe
  }
  
  // Handle bounce (procedural)
  if (type === 'ease-out-bounce') {
    return bounceOut(progress);
  }
  
  // Handle elastic (procedural)
  if (type === 'ease-in-elastic') {
    return elasticIn(progress);
  }
  if (type === 'ease-out-elastic') {
    return elasticOut(progress);
  }
  if (type === 'ease-in-out-elastic') {
    return elasticInOut(progress);
  }
  
  // Handle custom bezier
  if (type === 'bezier' && bezierHandles) {
    return evaluateCubicBezier(
      progress,
      bezierHandles.in.x,
      bezierHandles.in.y,
      bezierHandles.out.x,
      bezierHandles.out.y
    );
  }
  
  // Handle preset easings (convert to bezier)
  const presetHandles = getPresetBezierHandles(type);
  if (presetHandles) {
    return evaluateCubicBezier(
      progress,
      presetHandles.in.x,
      presetHandles.in.y,
      presetHandles.out.x,
      presetHandles.out.y
    );
  }
  
  // Fall back to linear
  return progress;
}

/**
 * Determine if a value is a color string
 */
function isColorValue(value: KeyframeValue): value is string {
  if (typeof value !== 'string') return false;
  return value.startsWith('#') || value.startsWith('rgb');
}

/**
 * Interpolate between two keyframe values based on type
 */
function interpolateValues(
  fromValue: KeyframeValue,
  toValue: KeyframeValue,
  progress: number,
  interpolation: KeyframeInterpolation
): KeyframeValue {
  // Handle hold interpolation
  if (interpolation.type === 'hold') {
    return fromValue;
  }
  
  // Numeric interpolation
  if (typeof fromValue === 'number' && typeof toValue === 'number') {
    return interpolateNumber(fromValue, toValue, progress, interpolation);
  }
  
  // Array interpolation
  if (Array.isArray(fromValue) && Array.isArray(toValue)) {
    return interpolateNumberArray(fromValue, toValue, progress, interpolation);
  }
  
  // Color interpolation
  if (isColorValue(fromValue) && isColorValue(toValue)) {
    return interpolateColor(fromValue, toValue, progress, interpolation);
  }
  
  // String interpolation (discrete)
  if (typeof fromValue === 'string' && typeof toValue === 'string') {
    return progress < 0.5 ? fromValue : toValue;
  }
  
  // Fallback: return fromValue until midpoint, then toValue
  return progress < 0.5 ? fromValue : toValue;
}

// ============================================================
// MAIN INTERPOLATION API
// ============================================================

/**
 * Get the interpolated value for a property at a specific time
 * 
 * @param propertyKeyframes - The keyframes for the property
 * @param time - Current time in seconds (relative to clip start)
 * @param defaultValue - Value to return if no keyframes exist
 * @returns Interpolated value at the given time
 */
export function getInterpolatedValue(
  propertyKeyframes: PropertyKeyframes | null,
  time: number,
  defaultValue: KeyframeValue
): KeyframeValue {
  // No keyframes or animation disabled
  if (!propertyKeyframes || !propertyKeyframes.enabled || propertyKeyframes.keyframes.length === 0) {
    return defaultValue;
  }
  
  const keyframes = propertyKeyframes.keyframes;
  
  // Single keyframe - return its value
  if (keyframes.length === 1) {
    return keyframes[0].value;
  }
  
  // Find surrounding keyframes
  const [prevKeyframe, nextKeyframe] = findSurroundingKeyframes(keyframes, time);
  
  // Before first keyframe - return first value
  if (!prevKeyframe) {
    return nextKeyframe?.value ?? defaultValue;
  }
  
  // After last keyframe - return last value
  if (!nextKeyframe) {
    return prevKeyframe.value;
  }
  
  // At exact keyframe time
  if (Math.abs(prevKeyframe.time - time) < 0.0001) {
    return prevKeyframe.value;
  }
  
  // Calculate progress between keyframes
  const duration = nextKeyframe.time - prevKeyframe.time;
  const progress = duration > 0 ? (time - prevKeyframe.time) / duration : 0;
  
  // Interpolate using the previous keyframe's interpolation settings
  return interpolateValues(
    prevKeyframe.value,
    nextKeyframe.value,
    Math.max(0, Math.min(1, progress)),
    prevKeyframe.interpolation
  );
}

/**
 * Get interpolated value at a specific frame number
 * 
 * @param propertyKeyframes - The keyframes for the property
 * @param frame - Current frame number (relative to clip start)
 * @param fps - Frames per second
 * @param defaultValue - Value to return if no keyframes exist
 * @returns Interpolated value at the given frame
 */
export function getInterpolatedValueAtFrame(
  propertyKeyframes: PropertyKeyframes | null,
  frame: number,
  fps: number,
  defaultValue: KeyframeValue
): KeyframeValue {
  // Use centralized time conversion utility
  const time = framesToSeconds(frame, fps);
  return getInterpolatedValue(propertyKeyframes, time, defaultValue);
}

/**
 * Check if a property has any keyframes at a specific time
 */
export function hasKeyframeAtTime(
  propertyKeyframes: PropertyKeyframes | null,
  time: number,
  tolerance: number = 0.001
): boolean {
  if (!propertyKeyframes) return false;
  return propertyKeyframes.keyframes.some(kf => Math.abs(kf.time - time) < tolerance);
}

/**
 * Get all times where keyframes exist for a property
 */
export function getKeyframeTimes(propertyKeyframes: PropertyKeyframes | null): number[] {
  if (!propertyKeyframes) return [];
  return propertyKeyframes.keyframes.map(kf => kf.time);
}

/**
 * Get the nearest keyframe time to a given time
 * @param direction - 'before', 'after', or 'nearest'
 */
export function getNearestKeyframeTime(
  propertyKeyframes: PropertyKeyframes | null,
  time: number,
  direction: 'before' | 'after' | 'nearest' = 'nearest'
): number | null {
  if (!propertyKeyframes || propertyKeyframes.keyframes.length === 0) {
    return null;
  }
  
  const times = propertyKeyframes.keyframes.map(kf => kf.time);
  
  if (direction === 'before') {
    const beforeTimes = times.filter(t => t < time);
    return beforeTimes.length > 0 ? Math.max(...beforeTimes) : null;
  }
  
  if (direction === 'after') {
    const afterTimes = times.filter(t => t > time);
    return afterTimes.length > 0 ? Math.min(...afterTimes) : null;
  }
  
  // Nearest
  let nearestTime: number | null = null;
  let minDistance = Infinity;
  
  for (const t of times) {
    const distance = Math.abs(t - time);
    if (distance < minDistance) {
      minDistance = distance;
      nearestTime = t;
    }
  }
  
  return nearestTime;
}

/**
 * Get all unique keyframe times across all animated properties on a clip
 */
export function getAllKeyframeTimes(allKeyframes: PropertyKeyframes[]): number[] {
  const times = new Set<number>();
  
  for (const propKeyframes of allKeyframes) {
    if (propKeyframes.enabled) {
      for (const kf of propKeyframes.keyframes) {
        times.add(kf.time);
      }
    }
  }
  
  return Array.from(times).sort((a, b) => a - b);
}

/**
 * Sample interpolated values at regular intervals
 * Useful for generating preview curves
 */
export function sampleInterpolatedValues(
  propertyKeyframes: PropertyKeyframes,
  startTime: number,
  endTime: number,
  numSamples: number,
  defaultValue: KeyframeValue
): { time: number; value: KeyframeValue }[] {
  const samples: { time: number; value: KeyframeValue }[] = [];
  const step = (endTime - startTime) / (numSamples - 1);
  
  for (let i = 0; i < numSamples; i++) {
    const time = startTime + i * step;
    const value = getInterpolatedValue(propertyKeyframes, time, defaultValue);
    samples.push({ time, value });
  }
  
  return samples;
}

// ============================================================
// VALUE EXTRACTION HELPERS
// ============================================================

/**
 * Extract numeric value from keyframe value
 * Returns the value as a number, or 0 if not numeric
 */
export function extractNumber(value: KeyframeValue): number {
  if (typeof value === 'number') return value;
  if (Array.isArray(value) && value.length > 0) return value[0];
  return 0;
}

/**
 * Extract array value from keyframe value
 * Returns the value as an array, wrapping single numbers
 */
export function extractArray(value: KeyframeValue): number[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'number') return [value];
  return [0];
}
