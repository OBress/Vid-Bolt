/**
 * useKeyframedValue Hook
 * 
 * React hook for getting interpolated keyframe values in Remotion components.
 * Automatically updates as the current frame changes during playback/scrubbing.
 * 
 * PERFORMANCE OPTIMIZATIONS:
 * - Uses Remotion's native `interpolate` function for smooth animations
 * - Pre-computes keyframe lookup maps to avoid repeated find() calls
 * - Minimizes object creation per frame
 * - Caches easing functions
 * 
 * Usage:
 * ```tsx
 * const opacity = useKeyframedValue(overlay, 'transform.opacity', 1);
 * const [x, y] = useKeyframedValue(overlay, 'transform.position', [0, 0]);
 * ```
 */

import { useMemo, useRef } from 'react';
import { useCurrentFrame, interpolate, Easing } from 'remotion';
import type { Overlay } from '../types';
import type { PropertyKeyframes, KeyframeValue, InterpolationType } from '../types/keyframes';
import { getInterpolatedValue, extractNumber, extractArray } from '../utils/keyframe-interpolator';
import { getValueAtPath } from '../types/keyframes';
import { framesToSeconds } from '../utils/time-conversion';

/**
 * Get a keyframed value for a property, interpolating based on current frame
 * 
 * @param overlay - The overlay object (contains keyframes data)
 * @param propertyPath - Dot-notation path to the property (e.g., "transform.x")
 * @param defaultValue - Value to use if no keyframes exist
 * @param fps - Frames per second (defaults to 30)
 * @returns Interpolated value at current frame
 */
export function useKeyframedValue<T extends KeyframeValue>(
  overlay: Overlay & { keyframes?: PropertyKeyframes[] },
  propertyPath: string,
  defaultValue: T,
  fps: number = 30
): T {
  const frame = useCurrentFrame();
  
  // Get the keyframes for this property
  const propertyKeyframes = useMemo(() => {
    if (!overlay.keyframes) return null;
    return overlay.keyframes.find(pk => pk.propertyPath === propertyPath) || null;
  }, [overlay.keyframes, propertyPath]);
  
  // Calculate interpolated value
  const interpolatedValue = useMemo(() => {
    // Convert frame to time (seconds relative to clip start)
    // Using centralized utility for consistency
    const time = framesToSeconds(frame, fps);
    
    // Get interpolated value
    return getInterpolatedValue(propertyKeyframes, time, defaultValue);
  }, [propertyKeyframes, frame, fps, defaultValue]);
  
  return interpolatedValue as T;
}

/**
 * Get a numeric keyframed value
 */
export function useKeyframedNumber(
  overlay: Overlay & { keyframes?: PropertyKeyframes[] },
  propertyPath: string,
  defaultValue: number,
  fps: number = 30
): number {
  const value = useKeyframedValue(overlay, propertyPath, defaultValue, fps);
  return extractNumber(value);
}

/**
 * Get a keyframed array value (e.g., position [x, y])
 */
export function useKeyframedArray(
  overlay: Overlay & { keyframes?: PropertyKeyframes[] },
  propertyPath: string,
  defaultValue: number[],
  fps: number = 30
): number[] {
  const value = useKeyframedValue(overlay, propertyPath, defaultValue, fps);
  return extractArray(value);
}

// ==========================================
// EASING FUNCTION CACHE
// ==========================================

/**
 * Convert our interpolation type to a Remotion-compatible easing function
 * Caches created functions to avoid recreating them each frame
 */
const easingFunctionCache = new Map<string, (t: number) => number>();

function getRemotionEasing(interpolationType: InterpolationType): (t: number) => number {
  // Check cache first
  const cached = easingFunctionCache.get(interpolationType);
  if (cached) return cached;
  
  let easingFn: (t: number) => number;
  
  switch (interpolationType) {
    case 'linear':
      easingFn = Easing.linear;
      break;
    case 'ease':
      easingFn = Easing.ease;
      break;
    case 'ease-in':
      easingFn = Easing.in(Easing.quad);
      break;
    case 'ease-out':
      easingFn = Easing.out(Easing.quad);
      break;
    case 'ease-in-out':
      easingFn = Easing.inOut(Easing.quad);
      break;
    case 'ease-in-cubic':
      easingFn = Easing.in(Easing.cubic);
      break;
    case 'ease-out-cubic':
      easingFn = Easing.out(Easing.cubic);
      break;
    case 'ease-in-out-cubic':
      easingFn = Easing.inOut(Easing.cubic);
      break;
    case 'ease-in-quad':
      easingFn = Easing.in(Easing.quad);
      break;
    case 'ease-out-quad':
      easingFn = Easing.out(Easing.quad);
      break;
    case 'ease-in-out-quad':
      easingFn = Easing.inOut(Easing.quad);
      break;
    case 'ease-in-quart':
      easingFn = Easing.in(Easing.poly(4));
      break;
    case 'ease-out-quart':
      easingFn = Easing.out(Easing.poly(4));
      break;
    case 'ease-in-out-quart':
      easingFn = Easing.inOut(Easing.poly(4));
      break;
    case 'ease-in-expo':
      easingFn = Easing.in(Easing.exp);
      break;
    case 'ease-out-expo':
      easingFn = Easing.out(Easing.exp);
      break;
    case 'ease-in-out-expo':
      easingFn = Easing.inOut(Easing.exp);
      break;
    case 'ease-in-back':
      easingFn = Easing.in(Easing.back(1.7));
      break;
    case 'ease-out-back':
      easingFn = Easing.out(Easing.back(1.7));
      break;
    case 'ease-in-out-back':
      easingFn = Easing.inOut(Easing.back(1.7));
      break;
    case 'ease-out-bounce':
      easingFn = Easing.out(Easing.bounce);
      break;
    case 'ease-in-elastic':
      easingFn = Easing.in(Easing.elastic(1));
      break;
    case 'ease-out-elastic':
      easingFn = Easing.out(Easing.elastic(1));
      break;
    case 'ease-in-out-elastic':
      easingFn = Easing.inOut(Easing.elastic(1));
      break;
    case 'bezier':
      // Custom bezier is handled separately with bezierHandles - fall back to linear here
      // The actual bezier curve should be calculated using the handles from keyframe.interpolation.bezierHandles
      easingFn = Easing.linear;
      break;
    case 'hold':
      // Hold = step function, return start value
      easingFn = () => 0;
      break;
    default:
      // Fallback to linear for any unknown easing types
      easingFn = Easing.linear;
  }
  
  // Cache for future use
    easingFunctionCache.set(interpolationType, easingFn);
  
  return easingFn;
}

// ==========================================
// KEYFRAME MAP CACHE TYPE
// ==========================================

interface KeyframeMapCache {
  keyframesRef: PropertyKeyframes[] | undefined;
  map: Map<string, PropertyKeyframes>;
}

/**
 * Get keyframed transform values
 * Returns an object with all transform properties, using keyframes where available
 * 
 * PERFORMANCE OPTIMIZATIONS:
 * - Uses Remotion's native interpolate function for common easings
 * - Pre-computes keyframe lookup map to avoid repeated find() calls
 * - Minimizes object allocations per frame
 * - Caches easing functions
 * 
 * IMPORTANT: `outsideSequence` controls how the current frame is converted to relative time:
 * 
 * - `outsideSequence: true`: Subtracts `overlay.from` from the frame to get time relative to
 *   clip start. Use this when:
 *   - The component is NOT rendered inside a Remotion Sequence, OR
 *   - The component IS rendered inside a Sequence but useCurrentFrame() is called BEFORE
 *     the Sequence (e.g., Layer component where Sequence is in the return statement)
 * 
 * - `outsideSequence: false`: Assumes the frame is already relative to clip start. Use this when:
 *   - The component IS rendered inside a Remotion Sequence (e.g., SelectionOutline, 
 *     SelectionHandles which are wrapped in Sequence by SortedOutlines)
 *   - useCurrentFrame() already returns the relative frame due to being inside a Sequence
 */
export function useKeyframedTransform(
  overlay: Overlay & { keyframes?: PropertyKeyframes[] },
  fps: number = 30,
  outsideSequence: boolean = true
): {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  rotation: number;
  opacity: number;
} {
  const frame = useCurrentFrame();
  
  // Cache the keyframe map - only rebuild when keyframes array changes
  const keyframeMapRef = useRef<KeyframeMapCache>({ keyframesRef: undefined, map: new Map() });
  
  // Build keyframe lookup map only when keyframes change (not every frame)
  const keyframeMap = useMemo(() => {
    const keyframes = overlay.keyframes;
    
    // Check if we can reuse the cached map
    if (keyframeMapRef.current.keyframesRef === keyframes) {
      return keyframeMapRef.current.map;
    }
    
    // Build new map
    const map = new Map<string, PropertyKeyframes>();
    if (keyframes) {
      for (const pk of keyframes) {
        if (pk.enabled && pk.keyframes.length > 0) {
          map.set(pk.propertyPath, pk);
        }
      }
    }
    
    // Cache for next time
    keyframeMapRef.current = { keyframesRef: keyframes, map };
    return map;
  }, [overlay.keyframes]);
  
  // Calculate frame relative to clip start
  const effectiveFrame = outsideSequence ? Math.max(0, frame - overlay.from) : frame;
  
  // Fast path: no active keyframes
  if (keyframeMap.size === 0) {
    return {
      x: overlay.left ?? 0,
      y: overlay.top ?? 0,
      width: overlay.width ?? 100,
      height: overlay.height ?? 100,
      scale: 1,
      rotation: overlay.rotation ?? 0,
      opacity: (overlay as any).styles?.opacity ?? 1,
    };
  }
  
  // Helper to get interpolated value using Remotion's optimized interpolate
  // Supports per-segment easing (like Premiere Pro)
  const getValueOptimized = (path: string, overlayValue: number | undefined, fallback: number): number => {
    const propKf = keyframeMap.get(path);
    if (!propKf) {
      return overlayValue ?? fallback;
    }
    
    const kfs = propKf.keyframes;
    if (kfs.length === 0) return overlayValue ?? fallback;
    if (kfs.length === 1) return extractNumber(kfs[0].value);
    
    // Convert current frame time to seconds for comparison
    const currentTime = effectiveFrame / fps;
    
    // Find which segment we're in (between which two keyframes)
    let prevKf = kfs[0];
    let nextKf = kfs[1];
    
    for (let i = 1; i < kfs.length; i++) {
      if (kfs[i].time > currentTime) {
        prevKf = kfs[i - 1];
        nextKf = kfs[i];
        break;
      }
      // If we're past the last keyframe
      if (i === kfs.length - 1) {
        return extractNumber(kfs[i].value);
      }
    }
    
    // If before first keyframe
    if (currentTime <= kfs[0].time) {
      return extractNumber(kfs[0].value);
    }
    
    // Get the easing for THIS segment (from the previous keyframe)
    // The easing on a keyframe controls the curve going TO the next keyframe
    const interpolation = prevKf.interpolation;
    const segmentEasing = interpolation?.type || 'linear';
    
    // Handle hold interpolation (step function)
    if (segmentEasing === 'hold') {
      return extractNumber(prevKf.value);
    }
    
    // Convert keyframe times to frames
    const prevFrame = Math.round(prevKf.time * fps);
    const nextFrame = Math.round(nextKf.time * fps);
    const prevValue = extractNumber(prevKf.value);
    const nextValue = extractNumber(nextKf.value);
    
    // Guard against invalid frame range (would cause interpolate to error)
    if (prevFrame >= nextFrame) {
      return prevValue;
    }
    
    // Get the easing function for this segment
    // For custom bezier curves, create a bezier easing function
    let easingFn: (t: number) => number;
    
    if (segmentEasing === 'bezier' && interpolation?.bezierHandles) {
      // Create custom bezier easing from handles
      const { in: inHandle, out: outHandle } = interpolation.bezierHandles;
      easingFn = Easing.bezier(inHandle.x, inHandle.y, outHandle.x, outHandle.y);
    } else {
      easingFn = getRemotionEasing(segmentEasing);
    }
    
    // Use Remotion's interpolate for this segment with the correct easing
    return interpolate(
      effectiveFrame,
      [prevFrame, nextFrame],
      [prevValue, nextValue],
      {
        easing: easingFn,
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      }
    );
  };
  
  return {
    x: getValueOptimized('transform.x', overlay.left, 0),
    y: getValueOptimized('transform.y', overlay.top, 0),
    width: getValueOptimized('transform.width', overlay.width, 100),
    height: getValueOptimized('transform.height', overlay.height, 100),
    scale: getValueOptimized('transform.scale', 1, 1),
    rotation: getValueOptimized('transform.rotation', overlay.rotation, 0),
    opacity: getValueOptimized('transform.opacity', (overlay as any).styles?.opacity, 1),
  };
}

/**
 * Check if a property has active keyframes
 */
export function useIsPropertyAnimated(
  overlay: Overlay & { keyframes?: PropertyKeyframes[] },
  propertyPath: string
): boolean {
  return useMemo(() => {
    if (!overlay.keyframes) return false;
    const propKf = overlay.keyframes.find(pk => pk.propertyPath === propertyPath);
    return propKf?.enabled === true && propKf.keyframes.length > 0;
  }, [overlay.keyframes, propertyPath]);
}

/**
 * Get all animated property paths for an overlay
 */
export function useAnimatedProperties(
  overlay: Overlay & { keyframes?: PropertyKeyframes[] }
): string[] {
  return useMemo(() => {
    if (!overlay.keyframes) return [];
    return overlay.keyframes
      .filter(pk => pk.enabled && pk.keyframes.length > 0)
      .map(pk => pk.propertyPath);
  }, [overlay.keyframes]);
}

/**
 * Applies keyframed values to an overlay object
 * Returns a new overlay with interpolated values applied
 */
export function useKeyframedOverlay<T extends Overlay>(
  overlay: T & { keyframes?: PropertyKeyframes[] },
  fps: number = 30
): T {
  const frame = useCurrentFrame();
  
  return useMemo(() => {
    if (!overlay.keyframes || overlay.keyframes.length === 0) {
      return overlay;
    }
    
    // Using centralized utility for consistency
    const time = framesToSeconds(frame, fps);
    let modified = { ...overlay };
    let hasChanges = false;
    
    for (const propKf of overlay.keyframes) {
      if (!propKf.enabled || propKf.keyframes.length === 0) continue;
      
      const currentValue = getValueAtPath(overlay, propKf.propertyPath);
      const interpolatedValue = getInterpolatedValue(propKf, time, currentValue);
      
      // Only apply if different from current value
      if (interpolatedValue !== currentValue) {
        hasChanges = true;
        modified = applyValueToPath(modified, propKf.propertyPath, interpolatedValue);
      }
    }
    
    return hasChanges ? modified : overlay;
  }, [overlay, frame, fps]);
}

/**
 * Apply a value to a path in an object, returning a new object
 */
function applyValueToPath<T extends object>(obj: T, path: string, value: any): T {
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  const result = { ...obj };
  
  let current: any = result;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (current[part] === undefined) {
      current[part] = /^\d+$/.test(parts[i + 1]) ? [] : {};
    } else {
      current[part] = Array.isArray(current[part]) 
        ? [...current[part]] 
        : { ...current[part] };
    }
    current = current[part];
  }
  
  current[parts[parts.length - 1]] = value;
  return result;
}

/**
 * Get keyframed mask values - handles mask animation paths like masks[0].x
 * 
 * Returns deep-cloned masks array with interpolated values applied
 * Use this when rendering masks that may be animated
 */
export function useKeyframedMasks<T extends any[]>(
  overlay: Overlay & { keyframes?: PropertyKeyframes[]; masks?: T },
  fps: number = 30,
  outsideSequence: boolean = true
): T | undefined {
  const frame = useCurrentFrame();
  
  // Cache the keyframe map - only rebuild when keyframes array changes
  const keyframeMapRef = useRef<KeyframeMapCache>({ keyframesRef: undefined, map: new Map() });
  
  return useMemo(() => {
    if (!overlay.masks || overlay.masks.length === 0) {
      return overlay.masks;
    }
    
    const keyframes = overlay.keyframes;
    
    // Check if we can reuse the cached map
    if (keyframeMapRef.current.keyframesRef !== keyframes) {
      // Build new map with only mask-related keyframes
      const map = new Map<string, PropertyKeyframes>();
      if (keyframes) {
        for (const pk of keyframes) {
          if (pk.enabled && pk.keyframes.length > 0 && pk.propertyPath.startsWith('masks[')) {
            map.set(pk.propertyPath, pk);
          }
        }
      }
      keyframeMapRef.current = { keyframesRef: keyframes, map };
    }
    
    const keyframeMap = keyframeMapRef.current.map;
    
    // Fast path: no active mask keyframes
    if (keyframeMap.size === 0) {
      return overlay.masks;
    }
    
    // Calculate frame relative to clip start
    const effectiveFrame = outsideSequence ? Math.max(0, frame - overlay.from) : frame;
    const currentTime = effectiveFrame / fps;
    
    // Helper to get interpolated value
    const getInterpolatedMaskValue = (path: string, currentValue: any): any => {
      const propKf = keyframeMap.get(path);
      if (!propKf) return currentValue;
      
      const kfs = propKf.keyframes;
      if (kfs.length === 0) return currentValue;
      if (kfs.length === 1) return extractNumber(kfs[0].value);
      
      // Find which segment we're in
      let prevKf = kfs[0];
      let nextKf = kfs[1];
      
      for (let i = 1; i < kfs.length; i++) {
        if (kfs[i].time > currentTime) {
          prevKf = kfs[i - 1];
          nextKf = kfs[i];
          break;
        }
        if (i === kfs.length - 1) {
          return extractNumber(kfs[i].value);
        }
      }
      
      if (currentTime <= kfs[0].time) {
        return extractNumber(kfs[0].value);
      }
      
      const interpolation = prevKf.interpolation;
      const segmentEasing = interpolation?.type || 'linear';
      
      if (segmentEasing === 'hold') {
        return extractNumber(prevKf.value);
      }
      
      const prevFrame = Math.round(prevKf.time * fps);
      const nextFrame = Math.round(nextKf.time * fps);
      const prevValue = extractNumber(prevKf.value);
      const nextValue = extractNumber(nextKf.value);
      
      if (prevFrame >= nextFrame) {
        return prevValue;
      }
      
      let easingFn: (t: number) => number;
      
      if (segmentEasing === 'bezier' && interpolation?.bezierHandles) {
        const { in: inHandle, out: outHandle } = interpolation.bezierHandles;
        easingFn = Easing.bezier(inHandle.x, inHandle.y, outHandle.x, outHandle.y);
      } else {
        easingFn = getRemotionEasing(segmentEasing);
      }
      
      return interpolate(
        effectiveFrame,
        [prevFrame, nextFrame],
        [prevValue, nextValue],
        {
          easing: easingFn,
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        }
      );
    };
    
    // Deep clone masks and apply interpolated values
    const animatedMasks = overlay.masks.map((mask: any, maskIndex: number) => {
      const animatedMask = { ...mask };
      const basePath = `masks[${maskIndex}]`;
      
      // Check each possible mask property for keyframes
      const propertyPaths = [
        // Common properties
        { path: `${basePath}.edgeFeather.top`, key: 'edgeFeather', subKey: 'top' },
        { path: `${basePath}.expansion`, key: 'expansion' },
        { path: `${basePath}.opacity`, key: 'opacity' },
        // Rectangle properties
        { path: `${basePath}.x`, key: 'x' },
        { path: `${basePath}.y`, key: 'y' },
        { path: `${basePath}.width`, key: 'width' },
        { path: `${basePath}.height`, key: 'height' },
        { path: `${basePath}.cornerRadius`, key: 'cornerRadius' },
        // Ellipse properties
        { path: `${basePath}.centerX`, key: 'centerX' },
        { path: `${basePath}.centerY`, key: 'centerY' },
        { path: `${basePath}.radiusX`, key: 'radiusX' },
        { path: `${basePath}.radiusY`, key: 'radiusY' },
      ];
      
      for (const { path, key, subKey } of propertyPaths) {
        if (keyframeMap.has(path)) {
          if (subKey) {
            // Nested property like edgeFeather.top
            if (!animatedMask[key]) {
              animatedMask[key] = { ...mask[key] };
            } else if (animatedMask[key] === mask[key]) {
              animatedMask[key] = { ...mask[key] };
            }
            animatedMask[key][subKey] = getInterpolatedMaskValue(path, mask[key]?.[subKey]);
            // Apply the same feather value to all edges for uniform feathering
            if (key === 'edgeFeather' && subKey === 'top') {
              const featherValue = animatedMask[key][subKey];
              animatedMask[key].right = featherValue;
              animatedMask[key].bottom = featherValue;
              animatedMask[key].left = featherValue;
            }
          } else {
            animatedMask[key] = getInterpolatedMaskValue(path, mask[key]);
          }
        }
      }
      
      return animatedMask;
    });
    
    return animatedMasks as T;
  }, [overlay.masks, overlay.keyframes, overlay.from, frame, fps, outsideSequence]);
}
