/**
 * Hook for Render Preview Feature
 * 
 * Provides an easy-to-use interface for the render preview functionality
 * that can be integrated into video editor components.
 * 
 * Usage:
 * ```tsx
 * const { 
 *   isRendering, 
 *   progress, 
 *   result, 
 *   renderFrame,
 *   compareWithPreview 
 * } = useRenderPreview();
 * ```
 */

import { useState, useCallback, useRef } from 'react';
import { Overlay } from '../types';
import { 
  renderPreviewFrame, 
  RenderPreviewResult, 
  RenderPreviewOptions,
  compareFrames,
  RenderComparison,
} from '../utils/render-preview';

// ==========================================
// TYPES
// ==========================================

export interface UseRenderPreviewOptions {
  /** Default FPS for rendering */
  defaultFps?: number;
  /** Default width for rendering */
  defaultWidth?: number;
  /** Default height for rendering */
  defaultHeight?: number;
  /** Base URL for assets */
  baseUrl?: string;
}

export interface UseRenderPreviewReturn {
  /** Whether a render is in progress */
  isRendering: boolean;
  /** Render progress (0-100) */
  progress: number;
  /** Last render result */
  result: RenderPreviewResult | null;
  /** Last comparison result */
  comparison: RenderComparison | null;
  /** Error if render failed */
  error: Error | null;
  /** Render a single frame */
  renderFrame: (options: Partial<RenderPreviewOptions> & { overlays: Overlay[] }) => Promise<RenderPreviewResult>;
  /** Render and compare with current preview */
  compareWithPreview: (
    previewCanvas: HTMLCanvasElement,
    options: Partial<RenderPreviewOptions> & { overlays: Overlay[] }
  ) => Promise<RenderComparison>;
  /** Clear results */
  clearResults: () => void;
}

// ==========================================
// HOOK IMPLEMENTATION
// ==========================================

export function useRenderPreview(options: UseRenderPreviewOptions = {}): UseRenderPreviewReturn {
  const {
    defaultFps = 30,
    defaultWidth = 1920,
    defaultHeight = 1080,
    baseUrl,
  } = options;
  
  const [isRendering, setIsRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<RenderPreviewResult | null>(null);
  const [comparison, setComparison] = useState<RenderComparison | null>(null);
  const [error, setError] = useState<Error | null>(null);
  
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  /**
   * Render a single frame
   */
  const renderFrame = useCallback(async (
    renderOptions: Partial<RenderPreviewOptions> & { overlays: Overlay[] }
  ): Promise<RenderPreviewResult> => {
    setIsRendering(true);
    setProgress(0);
    setError(null);
    
    // Start progress polling
    progressIntervalRef.current = setInterval(() => {
      // Progress is managed internally by renderPreviewFrame
      // This just provides a visual update mechanism
    }, 100);
    
    try {
      const fullOptions: RenderPreviewOptions = {
        frame: renderOptions.frame ?? 0,
        width: renderOptions.width ?? defaultWidth,
        height: renderOptions.height ?? defaultHeight,
        fps: renderOptions.fps ?? defaultFps,
        overlays: renderOptions.overlays,
        baseUrl: renderOptions.baseUrl ?? baseUrl,
        fontInfos: renderOptions.fontInfos,
      };
      
      const renderResult = await renderPreviewFrame(fullOptions);
      
      setResult(renderResult);
      setProgress(100);
      
      return renderResult;
      
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      setError(errorObj);
      throw errorObj;
    } finally {
      setIsRendering(false);
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    }
  }, [defaultFps, defaultWidth, defaultHeight, baseUrl]);
  
  /**
   * Render and compare with current preview canvas
   */
  const compareWithPreview = useCallback(async (
    previewCanvas: HTMLCanvasElement,
    renderOptions: Partial<RenderPreviewOptions> & { overlays: Overlay[] }
  ): Promise<RenderComparison> => {
    // First render the frame
    const renderResult = await renderFrame(renderOptions);
    
    // Then compare with preview
    const comparisonResult = await compareFrames(previewCanvas, renderResult);
    
    setComparison(comparisonResult);
    
    return comparisonResult;
  }, [renderFrame]);
  
  /**
   * Clear all results
   */
  const clearResults = useCallback(() => {
    setResult(null);
    setComparison(null);
    setError(null);
    setProgress(0);
  }, []);
  
  return {
    isRendering,
    progress,
    result,
    comparison,
    error,
    renderFrame,
    compareWithPreview,
    clearResults,
  };
}

// ==========================================
// UTILITY EXPORTS
// ==========================================

export type { RenderPreviewResult, RenderPreviewOptions, RenderComparison } from '../utils/render-preview';
