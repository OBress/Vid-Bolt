/**
 * Web Worker for Heavy Canvas Effect Processing
 * 
 * Offloads CPU-intensive effects (sharpen, noise, glow) to a separate thread
 * to prevent UI jank during preview playback.
 * 
 * Communication protocol:
 * - Main thread sends ImageData + effect config
 * - Worker processes and returns modified ImageData
 * - Uses transferable objects for zero-copy transfer
 * 
 * @module effect-worker
 */

import { Effect, EffectType, SharpenEffect, NoiseEffect, GlowEffect } from "../types/effects";

// ==========================================
// TYPES
// ==========================================

export interface EffectWorkerMessage {
  type: 'process' | 'cancel' | 'ping';
  id: string;
  imageData?: ImageData;
  effects?: Effect[];
  frame?: number;
  width?: number;
  height?: number;
}

export interface EffectWorkerResponse {
  type: 'result' | 'error' | 'pong';
  id: string;
  imageData?: ImageData;
  buffer?: ArrayBuffer;
  width?: number;
  height?: number;
  error?: string;
  processingTime?: number;
}

// ==========================================
// WORKER CODE (Inline)
// ==========================================

const workerCode = `
// Effect processing functions (duplicated from canvas-effect-renderer for worker context)

function deterministicNoise(seed) {
  let x = seed;
  x ^= x << 13;
  x ^= x >> 17;
  x ^= x << 5;
  return Math.abs((x % 10000) / 10000);
}

function getSharpenKernel(amount) {
  const strength = (amount / 100) * 2;
  const edge = -strength / 4;
  const center = 1 + strength;
  return [0, edge, 0, edge, center, edge, 0, edge, 0];
}

function applyConvolution(data, kernel, width, height) {
  const src = data;
  const output = new Uint8ClampedArray(src.length);
  const kernelSize = 3;
  const half = 1;
  
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
      output[outIdx + 3] = src[outIdx + 3];
    }
  }
  
  return output;
}

function applySharpen(data, width, height, amount) {
  if (amount === 0) return data;
  const kernel = getSharpenKernel(amount);
  return applyConvolution(data, kernel, width, height);
}

function applyNoise(data, width, height, amount, monochrome, frame, effectId) {
  if (amount === 0) return data;
  
  const intensity = amount / 100 * 50;
  const frameSeedBase = frame * 100000;
  const effectSeedBase = (effectId || 'noise').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) * 1000;
  const baseSeed = frameSeedBase + effectSeedBase;
  
  for (let i = 0; i < data.length; i += 4) {
    const pixelIndex = i / 4;
    
    if (monochrome) {
      const noise = (deterministicNoise(baseSeed + pixelIndex) - 0.5) * intensity * 2;
      data[i] = Math.min(255, Math.max(0, data[i] + noise));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
    } else {
      const noiseR = (deterministicNoise(baseSeed + pixelIndex) - 0.5) * intensity * 2;
      const noiseG = (deterministicNoise(baseSeed + pixelIndex + 1000000) - 0.5) * intensity * 2;
      const noiseB = (deterministicNoise(baseSeed + pixelIndex + 2000000) - 0.5) * intensity * 2;
      
      data[i] = Math.min(255, Math.max(0, data[i] + noiseR));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noiseG));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noiseB));
    }
  }
  
  return data;
}

function boxBlur(data, width, height, radius) {
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

function applyGlow(data, width, height, radius, color, intensity) {
  if (intensity === 0 || radius === 0) return data;
  
  const originalData = new Uint8ClampedArray(data);
  
  let glowR = 255, glowG = 255, glowB = 255;
  if (color.startsWith('#')) {
    glowR = parseInt(color.slice(1, 3), 16);
    glowG = parseInt(color.slice(3, 5), 16);
    glowB = parseInt(color.slice(5, 7), 16);
  }
  
  const blurRadius = Math.ceil(radius / 3);
  const blurredData = boxBlur(data, width, height, blurRadius);
  
  for (let i = 0; i < data.length; i += 4) {
    const blurLuma = (blurredData[i] + blurredData[i + 1] + blurredData[i + 2]) / 3 / 255;
    const glowAmount = blurLuma * intensity;
    
    data[i] = Math.min(255, originalData[i] + glowR * glowAmount);
    data[i + 1] = Math.min(255, originalData[i + 1] + glowG * glowAmount);
    data[i + 2] = Math.min(255, originalData[i + 2] + glowB * glowAmount);
  }
  
  return data;
}

// Process effects
function processEffects(data, width, height, effects, frame) {
  let result = new Uint8ClampedArray(data);
  
  const sortedEffects = effects
    .filter(e => e.enabled)
    .sort((a, b) => a.order - b.order);
  
  for (const effect of sortedEffects) {
    switch (effect.type) {
      case 'sharpen':
        result = applySharpen(result, width, height, effect.amount || 0);
        break;
      case 'noise':
        result = applyNoise(
          result, width, height, 
          effect.amount || 0, 
          effect.monochrome !== false,
          frame,
          effect.id
        );
        break;
      case 'glow':
        result = applyGlow(
          result, width, height,
          effect.radius || 0,
          effect.color || '#ffffff',
          effect.intensity || 0
        );
        break;
    }
  }
  
  return result;
}

// Message handler
self.onmessage = function(e) {
  const message = e.data;
  
  if (message.type === 'ping') {
    self.postMessage({ type: 'pong', id: message.id });
    return;
  }
  
  if (message.type === 'process') {
    const startTime = performance.now();
    
    try {
      const { id, width, height, effects, frame } = message;
      const inputBuffer = message.buffer;
      
      // Create Uint8ClampedArray view of the buffer
      const inputData = new Uint8ClampedArray(inputBuffer);
      
      // Process effects
      const resultData = processEffects(inputData, width, height, effects, frame);
      
      // Transfer result back
      const resultBuffer = resultData.buffer;
      
      self.postMessage({
        type: 'result',
        id,
        buffer: resultBuffer,
        width,
        height,
        processingTime: performance.now() - startTime,
      }, [resultBuffer]);
      
    } catch (error) {
      self.postMessage({
        type: 'error',
        id: message.id,
        error: error.message,
      });
    }
  }
};
`;

// ==========================================
// WORKER MANAGER
// ==========================================

class EffectWorkerManager {
  private worker: Worker | null = null;
  private pendingRequests = new Map<string, {
    resolve: (result: ImageData) => void;
    reject: (error: Error) => void;
    startTime: number;
  }>();
  private requestId = 0;
  private isSupported: boolean | null = null;
  private initPromise: Promise<boolean> | null = null;
  
  /**
   * Check if Web Workers are supported
   */
  isWorkerSupported(): boolean {
    if (this.isSupported !== null) return this.isSupported;
    
    this.isSupported = typeof Worker !== 'undefined' && typeof Blob !== 'undefined';
    return this.isSupported;
  }
  
  /**
   * Initialize the worker
   */
  async initialize(): Promise<boolean> {
    if (!this.isWorkerSupported()) return false;
    
    if (this.initPromise) return this.initPromise;
    
    this.initPromise = new Promise((resolve) => {
      try {
        // Create worker from inline code
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(blob);
        
        this.worker = new Worker(workerUrl);
        
        this.worker.onmessage = (e: MessageEvent<EffectWorkerResponse>) => {
          this.handleMessage(e.data);
        };
        
        this.worker.onerror = (error) => {
          console.error('[EffectWorker] Worker error:', error);
          this.isSupported = false;
        };
        
        // Test worker with ping
        const testId = 'init-test';
        this.worker.postMessage({ type: 'ping', id: testId });
        
        const timeout = setTimeout(() => {
          console.warn('[EffectWorker] Worker initialization timeout');
          this.isSupported = false;
          resolve(false);
        }, 2000);
        
        const originalHandler = this.worker.onmessage;
        this.worker.onmessage = (e: MessageEvent<EffectWorkerResponse>) => {
          if (e.data.id === testId && e.data.type === 'pong') {
            clearTimeout(timeout);
            this.worker!.onmessage = originalHandler;
            resolve(true);
          } else {
            originalHandler?.call(this.worker, e);
          }
        };
        
        // Cleanup blob URL
        URL.revokeObjectURL(workerUrl);
        
      } catch (error) {
        console.error('[EffectWorker] Failed to create worker:', error);
        this.isSupported = false;
        resolve(false);
      }
    });
    
    return this.initPromise;
  }
  
  /**
   * Process effects using the worker
   */
  async processEffects(
    imageData: ImageData,
    effects: Effect[],
    frame: number
  ): Promise<ImageData> {
    // Initialize if needed
    const initialized = await this.initialize();
    
    if (!initialized || !this.worker) {
      throw new Error('Worker not available');
    }
    
    return new Promise((resolve, reject) => {
      const id = `effect-${this.requestId++}`;
      
      // Store pending request
      this.pendingRequests.set(id, {
        resolve,
        reject,
        startTime: performance.now(),
      });
      
      // Create transferable buffer
      const buffer = imageData.data.buffer.slice(0);
      
      // Send to worker
      this.worker!.postMessage({
        type: 'process',
        id,
        buffer,
        width: imageData.width,
        height: imageData.height,
        effects: effects.map(e => ({
          id: e.id,
          type: e.type,
          enabled: e.enabled,
          order: e.order,
          amount: (e as any).amount,
          monochrome: (e as any).monochrome,
          radius: (e as any).radius,
          color: (e as any).color,
          intensity: (e as any).intensity,
        })),
        frame,
      }, [buffer]);
      
      // Timeout after 5 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Worker timeout'));
        }
      }, 5000);
    });
  }
  
  /**
   * Handle messages from worker
   */
  private handleMessage(response: EffectWorkerResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) return;
    
    this.pendingRequests.delete(response.id);
    
    if (response.type === 'error') {
      pending.reject(new Error(response.error || 'Unknown error'));
      return;
    }
    
    if (response.type === 'result' && response.buffer) {
      const data = new Uint8ClampedArray(response.buffer);
      const imageData = new ImageData(data, response.width!, response.height!);
      pending.resolve(imageData);
      
      // Log performance
      if (response.processingTime && response.processingTime > 50) {
        console.debug(`[EffectWorker] Processing took ${response.processingTime.toFixed(1)}ms`);
      }
    }
  }
  
  /**
   * Terminate the worker
   */
  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pendingRequests.clear();
    this.initPromise = null;
  }
  
  /**
   * Cancel all pending requests
   */
  cancelAll(): void {
    this.pendingRequests.forEach(({ reject }) => {
      reject(new Error('Cancelled'));
    });
    this.pendingRequests.clear();
  }
}

// Singleton instance
export const effectWorker = new EffectWorkerManager();

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Process effects with automatic fallback to main thread
 * 
 * @param canvas Target canvas
 * @param effects Effects to apply
 * @param frame Current frame
 * @param useWorker Whether to use worker (default: true)
 */
export async function processEffectsAsync(
  canvas: HTMLCanvasElement,
  effects: Effect[],
  frame: number,
  useWorker: boolean = true
): Promise<void> {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  
  // Filter for canvas effects only
  const canvasEffects = effects.filter(e => 
    e.enabled && 
    (e.type === EffectType.SHARPEN || e.type === EffectType.NOISE || e.type === EffectType.GLOW)
  );
  
  if (canvasEffects.length === 0) return;
  
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  
  if (useWorker && effectWorker.isWorkerSupported()) {
    try {
      const result = await effectWorker.processEffects(imageData, canvasEffects, frame);
      ctx.putImageData(result, 0, 0);
      return;
    } catch (error) {
      console.warn('[EffectWorker] Falling back to main thread:', error);
    }
  }
  
  // Fallback: import and use synchronous processing
  const { processCanvasEffects } = await import('./canvas-effect-renderer');
  processCanvasEffects(canvas, effects, frame);
}

/**
 * Check if worker processing is available
 */
export function isWorkerAvailable(): boolean {
  return effectWorker.isWorkerSupported();
}

/**
 * Pre-initialize the worker during idle time
 */
export function preInitializeWorker(): void {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => {
      effectWorker.initialize();
    });
  } else {
    setTimeout(() => {
      effectWorker.initialize();
    }, 100);
  }
}
