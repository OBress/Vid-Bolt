/**
 * Adaptive Preview Quality System
 * 
 * Dynamically adjusts preview quality based on:
 * - User interaction state (scrubbing, playing, paused)
 * - System performance metrics
 * - Available memory
 * 
 * This enables smooth scrubbing on lower-end hardware while maintaining
 * full quality during playback and when paused.
 */

import { createPreviewCanvas, restoreFromPreview } from './canvas-effect-renderer';

// ==========================================
// TYPES
// ==========================================

export type PreviewState = 'idle' | 'scrubbing' | 'playing' | 'seeking';

export interface QualitySettings {
  /** Resolution scale (0.25 - 1.0) */
  scale: number;
  /** Whether to skip heavy effects during this state */
  skipHeavyEffects: boolean;
  /** Frame skip rate (1 = every frame, 2 = every other frame) */
  frameSkip: number;
  /** Delay before restoring full quality (ms) */
  restoreDelay: number;
}

export interface PerformanceMetrics {
  /** Average frame processing time in ms */
  avgFrameTime: number;
  /** Target frame time based on FPS (e.g., 33ms for 30fps) */
  targetFrameTime: number;
  /** Frames dropped in last second */
  droppedFrames: number;
  /** Memory usage percentage */
  memoryUsage: number;
}

// ==========================================
// QUALITY PRESETS
// ==========================================

const QUALITY_PRESETS: Record<PreviewState, QualitySettings> = {
  idle: {
    scale: 1.0,
    skipHeavyEffects: false,
    frameSkip: 1,
    restoreDelay: 0,
  },
  playing: {
    scale: 1.0,
    skipHeavyEffects: false,
    frameSkip: 1,
    restoreDelay: 0,
  },
  scrubbing: {
    scale: 0.5, // 50% resolution during scrubbing
    skipHeavyEffects: true, // Skip sharpen/noise during scrubbing
    frameSkip: 2, // Process every other frame
    restoreDelay: 200, // Restore full quality 200ms after scrubbing stops
  },
  seeking: {
    scale: 0.75,
    skipHeavyEffects: true,
    frameSkip: 1,
    restoreDelay: 100,
  },
};

// ==========================================
// ADAPTIVE QUALITY MANAGER
// ==========================================

class AdaptiveQualityManager {
  private currentState: PreviewState = 'idle';
  private customSettings: Partial<QualitySettings> = {};
  private performanceHistory: number[] = [];
  private restoreTimeout: ReturnType<typeof setTimeout> | null = null;
  private callbacks: Set<(settings: QualitySettings) => void> = new Set();
  private autoAdjustEnabled = true;
  
  constructor() {
    // Start performance monitoring
    this.startPerformanceMonitoring();
  }
  
  /**
   * Get current quality settings
   */
  getSettings(): QualitySettings {
    const preset = QUALITY_PRESETS[this.currentState];
    return { ...preset, ...this.customSettings };
  }
  
  /**
   * Set preview state (triggers quality adjustment)
   */
  setState(state: PreviewState): void {
    if (this.currentState === state) return;
    
    const previousState = this.currentState;
    this.currentState = state;
    
    // Clear pending restore timeout
    if (this.restoreTimeout) {
      clearTimeout(this.restoreTimeout);
      this.restoreTimeout = null;
    }
    
    // If transitioning from active state to idle, schedule quality restore
    if ((previousState === 'scrubbing' || previousState === 'seeking') && state === 'idle') {
      const settings = this.getSettings();
      this.restoreTimeout = setTimeout(() => {
        this.notifyCallbacks();
      }, settings.restoreDelay);
    } else {
      this.notifyCallbacks();
    }
  }
  
  /**
   * Get current state
   */
  getState(): PreviewState {
    return this.currentState;
  }
  
  /**
   * Enable/disable auto-adjustment based on performance
   */
  setAutoAdjust(enabled: boolean): void {
    this.autoAdjustEnabled = enabled;
  }
  
  /**
   * Override specific settings
   */
  setCustomSettings(settings: Partial<QualitySettings>): void {
    this.customSettings = settings;
    this.notifyCallbacks();
  }
  
  /**
   * Subscribe to quality changes
   */
  onQualityChange(callback: (settings: QualitySettings) => void): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }
  
  /**
   * Record frame processing time for performance monitoring
   */
  recordFrameTime(ms: number): void {
    this.performanceHistory.push(ms);
    if (this.performanceHistory.length > 60) {
      this.performanceHistory.shift();
    }
    
    // Auto-adjust quality if enabled
    if (this.autoAdjustEnabled) {
      this.autoAdjustQuality();
    }
  }
  
  /**
   * Get current performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics {
    const avgFrameTime = this.performanceHistory.length > 0
      ? this.performanceHistory.reduce((a, b) => a + b, 0) / this.performanceHistory.length
      : 0;
    
    const targetFrameTime = 33; // 30fps target
    
    const droppedFrames = this.performanceHistory.filter(t => t > targetFrameTime * 1.5).length;
    
    // Estimate memory usage (if available)
    const memoryUsage = (performance as any).memory
      ? (performance as any).memory.usedJSHeapSize / (performance as any).memory.jsHeapSizeLimit
      : 0;
    
    return {
      avgFrameTime,
      targetFrameTime,
      droppedFrames,
      memoryUsage,
    };
  }
  
  /**
   * Auto-adjust quality based on performance
   */
  private autoAdjustQuality(): void {
    const metrics = this.getPerformanceMetrics();
    
    // If dropping frames, reduce quality
    if (metrics.droppedFrames > 5 && this.currentState === 'scrubbing') {
      const currentSettings = this.getSettings();
      if (currentSettings.scale > 0.25) {
        this.customSettings = {
          ...this.customSettings,
          scale: Math.max(0.25, currentSettings.scale - 0.25),
        };
        this.notifyCallbacks();
      }
    }
    
    // If performing well, gradually restore quality
    if (metrics.droppedFrames === 0 && metrics.avgFrameTime < metrics.targetFrameTime * 0.5) {
      const currentSettings = this.getSettings();
      const presetScale = QUALITY_PRESETS[this.currentState].scale;
      if (currentSettings.scale < presetScale) {
        this.customSettings = {
          ...this.customSettings,
          scale: Math.min(presetScale, currentSettings.scale + 0.1),
        };
        this.notifyCallbacks();
      }
    }
  }
  
  private notifyCallbacks(): void {
    const settings = this.getSettings();
    this.callbacks.forEach(cb => cb(settings));
  }
  
  private startPerformanceMonitoring(): void {
    // Clear old metrics periodically
    setInterval(() => {
      if (this.performanceHistory.length > 30) {
        this.performanceHistory = this.performanceHistory.slice(-30);
      }
    }, 5000);
  }
}

// Singleton instance
export const qualityManager = new AdaptiveQualityManager();

// ==========================================
// HOOK FOR REACT COMPONENTS
// ==========================================

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Hook for using adaptive preview quality in components
 */
export function useAdaptiveQuality() {
  const [settings, setSettings] = useState<QualitySettings>(qualityManager.getSettings());
  
  useEffect(() => {
    const unsubscribe = qualityManager.onQualityChange(setSettings);
    return unsubscribe;
  }, []);
  
  const setScrubbing = useCallback((isScrubbing: boolean) => {
    qualityManager.setState(isScrubbing ? 'scrubbing' : 'idle');
  }, []);
  
  const setPlaying = useCallback((isPlaying: boolean) => {
    qualityManager.setState(isPlaying ? 'playing' : 'idle');
  }, []);
  
  const recordFrameTime = useCallback((ms: number) => {
    qualityManager.recordFrameTime(ms);
  }, []);
  
  return {
    settings,
    setScrubbing,
    setPlaying,
    recordFrameTime,
    metrics: qualityManager.getPerformanceMetrics(),
  };
}

// ==========================================
// PREVIEW SCALING UTILITIES
// ==========================================

/**
 * Scale a canvas for preview with automatic restoration
 */
export function withAdaptiveScale<T>(
  canvas: HTMLCanvasElement,
  callback: (scaledCanvas: HTMLCanvasElement) => T
): T {
  const settings = qualityManager.getSettings();
  
  if (settings.scale >= 1) {
    return callback(canvas);
  }
  
  // Create scaled preview canvas
  const previewCanvas = createPreviewCanvas(canvas, settings.scale);
  
  // Execute callback with scaled canvas
  const result = callback(previewCanvas);
  
  // Restore to full resolution
  restoreFromPreview(previewCanvas, canvas);
  
  return result;
}

/**
 * Determine if heavy effects should be processed
 */
export function shouldProcessHeavyEffects(): boolean {
  const settings = qualityManager.getSettings();
  return !settings.skipHeavyEffects;
}

/**
 * Get current frame skip rate
 */
export function getFrameSkipRate(): number {
  return qualityManager.getSettings().frameSkip;
}

/**
 * Check if current frame should be processed based on skip rate
 */
export function shouldProcessFrame(frame: number): boolean {
  const skipRate = getFrameSkipRate();
  return frame % skipRate === 0;
}

// ==========================================
// PERFORMANCE DECORATOR
// ==========================================

/**
 * Decorator for measuring function performance and recording metrics
 */
export function withPerformanceTracking<T extends (...args: any[]) => any>(
  fn: T,
  label?: string
): T {
  return ((...args: Parameters<T>): ReturnType<T> => {
    const start = performance.now();
    const result = fn(...args);
    const elapsed = performance.now() - start;
    
    qualityManager.recordFrameTime(elapsed);
    
    if (elapsed > 50) {
      console.warn(`[AdaptiveQuality] ${label || fn.name}: ${elapsed.toFixed(2)}ms (slow)`);
    }
    
    return result;
  }) as T;
}
