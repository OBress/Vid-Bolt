/**
 * Canvas-Based Effect Renderer
 * 
 * Handles effects that cannot be implemented with CSS filters:
 * - Sharpen: Convolution kernel for edge enhancement
 * - Noise/Grain: Random pixel manipulation for film grain
 * - Glow: Blur + composite for outer glow
 * 
 * Performance optimization:
 * - Uses WebGL acceleration when available (10-100x faster)
 * - Falls back to canvas processing for unsupported browsers
 * 
 * These effects work in both preview and final Remotion render because
 * Remotion captures canvas elements as part of each frame.
 */

import {
  Effect,
  EffectType,
  SharpenEffect,
  NoiseEffect,
  GlowEffect,
} from "../types/effects";

import {
  isWebGLSupported,
  applySharpenWebGL,
  applyNoiseWebGL,
} from "./webgl-effects";

// ==========================================
// TYPES
// ==========================================

export interface CanvasEffectContext {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  imageData: ImageData;
}

// ==========================================
// SHARPEN EFFECT
// ==========================================

/**
 * Sharpen kernel - 3x3 convolution matrix for edge enhancement
 * Higher amounts increase the center weight and decrease surrounding weights
 */
function getSharpenKernel(amount: number): number[] {
  // Normalize amount from 0-100 to 0-2 for kernel strength
  const strength = (amount / 100) * 2;
  const edge = -strength / 4;
  const center = 1 + strength;
  
  return [
    0, edge, 0,
    edge, center, edge,
    0, edge, 0
  ];
}

/**
 * Apply convolution kernel to image data
 */
function applyConvolution(
  imageData: ImageData,
  kernel: number[],
  width: number,
  height: number
): ImageData {
  const src = imageData.data;
  const output = new Uint8ClampedArray(src.length);
  
  const kernelSize = 3;
  const half = Math.floor(kernelSize / 2);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0;
      
      for (let ky = 0; ky < kernelSize; ky++) {
        for (let kx = 0; kx < kernelSize; kx++) {
          const px = Math.min(width - 1, Math.max(0, x + kx - half));
          const py = Math.min(height - 1, Math.max(0, y + ky - half));
          const idx = (py * width + px) * 4;
          const weight = kernel[ky * kernelSize + kx];
          
          r += src[idx] * weight;
          g += src[idx + 1] * weight;
          b += src[idx + 2] * weight;
        }
      }
      
      const outIdx = (y * width + x) * 4;
      output[outIdx] = Math.min(255, Math.max(0, r));
      output[outIdx + 1] = Math.min(255, Math.max(0, g));
      output[outIdx + 2] = Math.min(255, Math.max(0, b));
      output[outIdx + 3] = src[outIdx + 3]; // Preserve alpha
    }
  }
  
  return new ImageData(output, width, height);
}

/**
 * Apply sharpen effect to canvas
 * Uses WebGL acceleration when available for 10-100x performance improvement
 */
export function applySharpenEffect(
  ctx: CanvasEffectContext,
  effect: SharpenEffect
): void {
  if (effect.amount === 0) return;
  
  // Try WebGL first for GPU acceleration
  if (isWebGLSupported()) {
    const result = applySharpenWebGL(ctx.imageData, effect);
    if (result) {
      ctx.ctx.putImageData(result, 0, 0);
      ctx.imageData = result;
      return;
    }
  }
  
  // Fallback to CPU convolution
  const kernel = getSharpenKernel(effect.amount);
  const sharpened = applyConvolution(ctx.imageData, kernel, ctx.width, ctx.height);
  ctx.ctx.putImageData(sharpened, 0, 0);
  ctx.imageData = sharpened;
}

// ==========================================
// NOISE/GRAIN EFFECT
// ==========================================

/**
 * Generate deterministic pseudo-random noise value using a hash-based approach
 * This ensures the same seed always produces the same noise pattern,
 * maintaining visual consistency between preview and render.
 * 
 * Uses a simple but effective hash function (similar to xorshift) for
 * deterministic pseudo-random number generation.
 */
function deterministicNoise(seed: number): number {
  // xorshift-inspired hash for deterministic pseudo-random
  let x = seed;
  x ^= x << 13;
  x ^= x >> 17;
  x ^= x << 5;
  // Normalize to 0-1 range
  return Math.abs((x % 10000) / 10000);
}

/**
 * Generate a unique seed from frame number and effect ID
 * This ensures frame-accurate noise that's reproducible in renders
 */
function getFrameNoiseSeed(frame: number, effectId: string, pixelIndex: number): number {
  // Create a stable seed by combining frame, effect ID hash, and pixel position
  const effectIdHash = effectId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return frame * 100000 + effectIdHash * 1000 + pixelIndex;
}

/**
 * Apply noise/grain effect to canvas
 * 
 * Uses deterministic noise generation to ensure preview and render
 * produce identical visual output for the same frame.
 * 
 * Performance: Uses WebGL acceleration when available (10-100x faster)
 * 
 * @param ctx Canvas effect context
 * @param effect Noise effect configuration
 * @param frame Current frame number (required for frame-accurate noise)
 * @param effectId Optional effect ID for stable seeding across renders
 */
export function applyNoiseEffect(
  ctx: CanvasEffectContext,
  effect: NoiseEffect,
  frame?: number,
  effectId?: string
): void {
  if (effect.amount === 0) return;
  
  // CRITICAL: Use frame number for deterministic, reproducible noise
  const frameNum = frame ?? 0;
  const effId = effectId || effect.id || 'noise';
  
  // Try WebGL first for GPU acceleration
  if (isWebGLSupported()) {
    const result = applyNoiseWebGL(ctx.imageData, effect, frameNum, effId);
    if (result) {
      ctx.ctx.putImageData(result, 0, 0);
      ctx.imageData = result;
      return;
    }
  }
  
  // Fallback to CPU processing
  const data = ctx.imageData.data;
  const intensity = effect.amount / 100 * 50; // Map 0-100 to 0-50 noise range
  
  // Pre-calculate frame-based seed offset for performance
  const frameSeedBase = frameNum * 100000;
  const effectSeedBase = effId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) * 1000;
  const baseSeed = frameSeedBase + effectSeedBase;
  
  for (let i = 0; i < data.length; i += 4) {
    // Pixel index for unique noise per pixel (divide by 4 since i increments by 4)
    const pixelIndex = i / 4;
    
    if (effect.monochrome) {
      // Same noise applied to all channels (monochrome grain)
      const noise = (deterministicNoise(baseSeed + pixelIndex) - 0.5) * intensity * 2;
      data[i] = Math.min(255, Math.max(0, data[i] + noise));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
    } else {
      // Different noise for each channel (colored grain)
      // Use different seed offsets for R, G, B channels
      const noiseR = (deterministicNoise(baseSeed + pixelIndex) - 0.5) * intensity * 2;
      const noiseG = (deterministicNoise(baseSeed + pixelIndex + 1000000) - 0.5) * intensity * 2;
      const noiseB = (deterministicNoise(baseSeed + pixelIndex + 2000000) - 0.5) * intensity * 2;
      
      data[i] = Math.min(255, Math.max(0, data[i] + noiseR));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noiseG));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noiseB));
    }
    // Alpha unchanged
  }
  
  ctx.ctx.putImageData(ctx.imageData, 0, 0);
}

// ==========================================
// GLOW EFFECT
// ==========================================

/**
 * Apply gaussian blur for glow effect
 * Uses box blur approximation for performance
 */
function boxBlur(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number
): Uint8ClampedArray {
  const output = new Uint8ClampedArray(data.length);
  const size = radius * 2 + 1;
  const divisor = size * size;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      
      for (let ky = -radius; ky <= radius; ky++) {
        for (let kx = -radius; kx <= radius; kx++) {
          const px = Math.min(width - 1, Math.max(0, x + kx));
          const py = Math.min(height - 1, Math.max(0, y + ky));
          const idx = (py * width + px) * 4;
          
          r += data[idx];
          g += data[idx + 1];
          b += data[idx + 2];
          a += data[idx + 3];
        }
      }
      
      const outIdx = (y * width + x) * 4;
      output[outIdx] = r / divisor;
      output[outIdx + 1] = g / divisor;
      output[outIdx + 2] = b / divisor;
      output[outIdx + 3] = a / divisor;
    }
  }
  
  return output;
}

/**
 * Apply glow effect to canvas
 * Creates a blurred version and composites it with the original
 */
export function applyGlowEffect(
  ctx: CanvasEffectContext,
  effect: GlowEffect
): void {
  if (effect.intensity === 0 || effect.radius === 0) return;
  
  const { width, height } = ctx;
  const originalData = new Uint8ClampedArray(ctx.imageData.data);
  
  // Parse glow color
  let glowR = 255, glowG = 255, glowB = 255;
  if (effect.color.startsWith('#')) {
    glowR = parseInt(effect.color.slice(1, 3), 16);
    glowG = parseInt(effect.color.slice(3, 5), 16);
    glowB = parseInt(effect.color.slice(5, 7), 16);
  }
  
  // Create blurred version for glow
  const blurRadius = Math.ceil(effect.radius / 3);
  const blurredData = boxBlur(ctx.imageData.data, width, height, blurRadius);
  
  // Composite: original + (blurred * glow color * intensity)
  const data = ctx.imageData.data;
  const intensity = effect.intensity;
  
  for (let i = 0; i < data.length; i += 4) {
    // Calculate glow contribution (use blurred luminance as mask)
    const blurLuma = (blurredData[i] + blurredData[i + 1] + blurredData[i + 2]) / 3 / 255;
    const glowAmount = blurLuma * intensity;
    
    // Add glow to original
    data[i] = Math.min(255, originalData[i] + glowR * glowAmount);
    data[i + 1] = Math.min(255, originalData[i + 1] + glowG * glowAmount);
    data[i + 2] = Math.min(255, originalData[i + 2] + glowB * glowAmount);
    // Alpha unchanged
  }
  
  ctx.ctx.putImageData(ctx.imageData, 0, 0);
}

// ==========================================
// MAIN PROCESSING FUNCTION
// ==========================================

/**
 * Process all canvas effects on an image/video frame
 * @param canvas Target canvas element
 * @param effects Array of effects to apply
 * @param frame Current frame number (for animated effects like noise)
 */
export function processCanvasEffects(
  canvas: HTMLCanvasElement,
  effects: Effect[],
  frame?: number
): void {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  
  const width = canvas.width;
  const height = canvas.height;
  
  // Get initial image data
  let imageData = ctx.getImageData(0, 0, width, height);
  
  const effectCtx: CanvasEffectContext = {
    canvas,
    ctx,
    width,
    height,
    imageData,
  };
  
  // Sort effects by order and apply
  const sortedEffects = [...effects]
    .filter(e => e.enabled)
    .sort((a, b) => a.order - b.order);
  
  for (const effect of sortedEffects) {
    switch (effect.type) {
      case EffectType.SHARPEN:
        applySharpenEffect(effectCtx, effect as SharpenEffect);
        break;
      case EffectType.NOISE:
        // Pass effect ID for deterministic noise seeding
        applyNoiseEffect(effectCtx, effect as NoiseEffect, frame, effect.id);
        break;
      case EffectType.GLOW:
        applyGlowEffect(effectCtx, effect as GlowEffect);
        break;
    }
    
    // Update image data reference after each effect
    effectCtx.imageData = effectCtx.ctx.getImageData(0, 0, width, height);
  }
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

/**
 * Create a canvas copy of an image or video frame
 * @param source Image or video element
 * @param width Target width
 * @param height Target height
 * @returns Canvas with copied content
 */
export function createCanvasCopy(
  source: HTMLImageElement | HTMLVideoElement,
  width: number,
  height: number
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(source, 0, 0, width, height);
  }
  
  return canvas;
}

/**
 * Apply CSS filter effects to canvas
 * This combines CSS filters with canvas effects
 * @param canvas Target canvas
 * @param filterString CSS filter string
 */
export function applyCSSFilterToCanvas(
  canvas: HTMLCanvasElement,
  filterString: string
): void {
  if (!filterString || filterString === 'none') return;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  
  // Create a temporary canvas with the filter applied
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = canvas.width;
  tempCanvas.height = canvas.height;
  const tempCtx = tempCanvas.getContext('2d');
  
  if (tempCtx) {
    tempCtx.filter = filterString;
    tempCtx.drawImage(canvas, 0, 0);
    
    // Copy back to original canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(tempCanvas, 0, 0);
  }
}

// ==========================================
// INTELLIGENT FRAME CACHING
// ==========================================

interface CachedFrame {
  frameNumber: number;
  effectsHash: string;
  imageData: ImageData;
  timestamp: number;
  accessCount: number;
  byteSize: number;
}

interface CacheConfig {
  maxSize: number;
  maxMemoryMB: number;
  adaptiveSize: boolean;
}

// Default cache configuration - expanded from 30 to adaptive
const DEFAULT_CACHE_CONFIG: CacheConfig = {
  maxSize: 120, // Up to 4 seconds at 30fps
  maxMemoryMB: 256, // Max memory usage
  adaptiveSize: true,
};

// LRU cache with per-clip isolation
const clipCaches = new Map<string, Map<number, CachedFrame>>();
let cacheConfig = { ...DEFAULT_CACHE_CONFIG };
let totalCacheMemory = 0;

/**
 * Configure the effect cache
 * @param config Partial cache configuration
 */
export function configureCaching(config: Partial<CacheConfig>): void {
  cacheConfig = { ...cacheConfig, ...config };
  
  // Enforce new limits immediately
  enforceMemoryLimit();
}

/**
 * Get cache statistics for debugging/monitoring
 */
export function getCacheStats(): {
  clipCount: number;
  totalFrames: number;
  memoryUsageMB: number;
  hitRate: number;
} {
  let totalFrames = 0;
  clipCaches.forEach(cache => {
    totalFrames += cache.size;
  });
  
  return {
    clipCount: clipCaches.size,
    totalFrames,
    memoryUsageMB: totalCacheMemory / (1024 * 1024),
    hitRate: cacheHitCount / Math.max(1, cacheHitCount + cacheMissCount),
  };
}

let cacheHitCount = 0;
let cacheMissCount = 0;

/**
 * Generate hash for effects configuration
 * Optimized to minimize string operations
 */
function getEffectsHash(effects: Effect[]): string {
  const enabledEffects = effects.filter(e => e.enabled);
  if (enabledEffects.length === 0) return 'none';
  
  // Use a fast hash for each effect
  return enabledEffects
    .sort((a, b) => a.order - b.order)
    .map(e => `${e.id}:${e.type}:${JSON.stringify(e)}`)
    .join('|');
}

/**
 * Calculate byte size of ImageData
 */
function getImageDataByteSize(imageData: ImageData): number {
  return imageData.data.length;
}

/**
 * Enforce memory limit using LRU eviction
 */
function enforceMemoryLimit(): void {
  const maxBytes = cacheConfig.maxMemoryMB * 1024 * 1024;
  
  while (totalCacheMemory > maxBytes && clipCaches.size > 0) {
    // Find oldest accessed frame across all clips
    let oldestKey: string | null = null;
    let oldestFrame: number = 0;
    let oldestTimestamp = Infinity;
    
    clipCaches.forEach((cache, clipKey) => {
      cache.forEach((frame, frameNum) => {
        if (frame.timestamp < oldestTimestamp) {
          oldestTimestamp = frame.timestamp;
          oldestKey = clipKey;
          oldestFrame = frameNum;
        }
      });
    });
    
    if (oldestKey !== null) {
      const cache = clipCaches.get(oldestKey);
      if (cache) {
        const frame = cache.get(oldestFrame);
        if (frame) {
          totalCacheMemory -= frame.byteSize;
          cache.delete(oldestFrame);
          if (cache.size === 0) {
            clipCaches.delete(oldestKey);
          }
        }
      }
    } else {
      break;
    }
  }
}

/**
 * Get cache for a specific clip
 */
function getClipCache(clipId: string): Map<number, CachedFrame> {
  let cache = clipCaches.get(clipId);
  if (!cache) {
    cache = new Map();
    clipCaches.set(clipId, cache);
  }
  return cache;
}

/**
 * Get cached frame or process new one
 * Uses LRU eviction and per-clip isolation
 * 
 * @param canvas Target canvas
 * @param effects Effects to apply
 * @param frame Frame number
 * @param clipId Unique ID for the clip (for per-clip caching)
 * @returns True if cache hit, false if processed
 */
export function getCachedOrProcess(
  canvas: HTMLCanvasElement,
  effects: Effect[],
  frame: number,
  clipId: string
): boolean {
  const effectsHash = getEffectsHash(effects);
  const clipCache = getClipCache(clipId);
  const cached = clipCache.get(frame);
  
  if (cached && cached.effectsHash === effectsHash) {
    // Cache hit - update access timestamp and count
    cached.timestamp = Date.now();
    cached.accessCount++;
    cacheHitCount++;
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.putImageData(cached.imageData, 0, 0);
      return true;
    }
  }
  
  cacheMissCount++;
  
  // Process effects
  processCanvasEffects(canvas, effects, frame);
  
  // Cache the result
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const byteSize = getImageDataByteSize(imageData);
    
    // Remove old frame if exists
    const oldFrame = clipCache.get(frame);
    if (oldFrame) {
      totalCacheMemory -= oldFrame.byteSize;
    }
    
    // Add new frame to cache
    clipCache.set(frame, {
      frameNumber: frame,
      effectsHash,
      imageData,
      timestamp: Date.now(),
      accessCount: 1,
      byteSize,
    });
    totalCacheMemory += byteSize;
    
    // Enforce memory limits
    enforceMemoryLimit();
  }
  
  return false;
}

/**
 * Prefetch frames around current position for smooth scrubbing
 * @param clipId Clip to prefetch for
 * @param currentFrame Current frame position
 * @param range Number of frames to prefetch in each direction
 */
export function prefetchFrames(
  canvas: HTMLCanvasElement,
  effects: Effect[],
  clipId: string,
  currentFrame: number,
  range: number = 5
): void {
  const clipCache = getClipCache(clipId);
  const effectsHash = getEffectsHash(effects);
  
  // Prefetch forward frames (more important)
  for (let i = 1; i <= range; i++) {
    const frame = currentFrame + i;
    const cached = clipCache.get(frame);
    
    if (!cached || cached.effectsHash !== effectsHash) {
      // Use requestIdleCallback to prefetch during idle time
      requestIdleUpdate(() => {
        if (!clipCache.has(frame)) {
          getCachedOrProcess(canvas, effects, frame, clipId);
        }
      });
    }
  }
  
  // Prefetch backward frames (less priority)
  for (let i = 1; i <= Math.floor(range / 2); i++) {
    const frame = currentFrame - i;
    if (frame >= 0) {
      const cached = clipCache.get(frame);
      
      if (!cached || cached.effectsHash !== effectsHash) {
        requestIdleUpdate(() => {
          if (!clipCache.has(frame)) {
            getCachedOrProcess(canvas, effects, frame, clipId);
          }
        });
      }
    }
  }
}

/**
 * Clear cache for a specific clip
 */
export function clearClipCache(clipId: string): void {
  const cache = clipCaches.get(clipId);
  if (cache) {
    cache.forEach(frame => {
      totalCacheMemory -= frame.byteSize;
    });
    clipCaches.delete(clipId);
  }
}

/**
 * Clear entire frame cache
 */
export function clearFrameCache(): void {
  clipCaches.clear();
  totalCacheMemory = 0;
  cacheHitCount = 0;
  cacheMissCount = 0;
}

/**
 * Invalidate cache for a clip when effects change
 */
export function invalidateClipCache(clipId: string): void {
  clearClipCache(clipId);
}

// ==========================================
// PERFORMANCE OPTIMIZATION UTILITIES
// ==========================================

/**
 * Throttle function for limiting effect updates during scrubbing
 * @param func Function to throttle
 * @param limit Time limit in ms
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let lastRun = 0;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return function (this: any, ...args: Parameters<T>) {
    const now = Date.now();
    
    if (now - lastRun >= limit) {
      func.apply(this, args);
      lastRun = now;
    } else {
      // Schedule a final update after the limit
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        func.apply(this, args);
        lastRun = Date.now();
      }, limit - (now - lastRun));
    }
  };
}

/**
 * Debounce function for delaying expensive operations
 * @param func Function to debounce
 * @param wait Wait time in ms
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return function (this: any, ...args: Parameters<T>) {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      func.apply(this, args);
    }, wait);
  };
}

/**
 * Request idle callback wrapper for non-critical updates
 * Falls back to setTimeout for unsupported browsers
 */
export function requestIdleUpdate(callback: () => void, timeout: number = 100): void {
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(callback, { timeout });
  } else {
    setTimeout(callback, 0);
  }
}

/**
 * Performance metrics for effect processing
 */
interface EffectPerformanceMetrics {
  effectType: string;
  processingTime: number;
  pixelCount: number;
}

const performanceMetrics: EffectPerformanceMetrics[] = [];
const MAX_METRICS = 100;

/**
 * Record performance metrics for effect processing
 */
export function recordPerformance(effectType: string, startTime: number, width: number, height: number): void {
  const processingTime = performance.now() - startTime;
  
  performanceMetrics.push({
    effectType,
    processingTime,
    pixelCount: width * height,
  });
  
  // Keep only recent metrics
  if (performanceMetrics.length > MAX_METRICS) {
    performanceMetrics.shift();
  }
}

/**
 * Get average processing time for an effect type
 */
export function getAverageProcessingTime(effectType: string): number {
  const typeMetrics = performanceMetrics.filter(m => m.effectType === effectType);
  if (typeMetrics.length === 0) return 0;
  
  const total = typeMetrics.reduce((sum, m) => sum + m.processingTime, 0);
  return total / typeMetrics.length;
}

/**
 * Check if effects should be processed at reduced quality during scrubbing
 * @param isScrubbing Whether the user is scrubbing the timeline
 * @param quality 0-1 quality setting
 */
export function shouldUseReducedQuality(isScrubbing: boolean, quality: number = 1): boolean {
  // Use reduced quality during scrubbing for smoother preview
  if (isScrubbing && quality < 1) return true;
  
  // Check if processing is taking too long
  const avgTime = getAverageProcessingTime('sharpen');
  if (avgTime > 16) return true; // Slower than 60fps
  
  return false;
}

/**
 * Create a low-resolution version of a canvas for preview
 * @param canvas Source canvas
 * @param scale Scale factor (0.25 - 1)
 */
export function createPreviewCanvas(
  canvas: HTMLCanvasElement,
  scale: number = 0.5
): HTMLCanvasElement {
  const preview = document.createElement('canvas');
  preview.width = Math.max(1, Math.floor(canvas.width * scale));
  preview.height = Math.max(1, Math.floor(canvas.height * scale));
  
  const ctx = preview.getContext('2d');
  if (ctx) {
    ctx.drawImage(canvas, 0, 0, preview.width, preview.height);
  }
  
  return preview;
}

/**
 * Restore a preview canvas back to full resolution
 * @param preview Preview canvas
 * @param target Target canvas (full resolution)
 */
export function restoreFromPreview(
  preview: HTMLCanvasElement,
  target: HTMLCanvasElement
): void {
  const ctx = target.getContext('2d');
  if (ctx) {
    ctx.drawImage(preview, 0, 0, target.width, target.height);
  }
}
