/**
 * useVisualQC - Visual Quality Check Hook
 * 
 * Captures screenshots from the Remotion Player DOM at key frames
 * using html-to-image for accurate DOM-to-image conversion.
 * Sends them to a vision AI model for quality analysis.
 * 
 * Flow:
 * 1. Seek Player to frames at 0.5s intervals
 * 2. Capture DOM as PNG data URLs via html-to-image
 * 3. POST to /api/motion-graphics/visual-qc with screenshots + original prompt
 * 4. Return AI assessment with pass/fail, score, issues, and suggestions
 */

import { useState, useCallback, useRef } from 'react';
import { toPng } from 'html-to-image';

// ============================================================
// TYPES
// ============================================================

export interface QCResult {
  passed: boolean;
  issues: string[];     // List of problems found
  suggestions: string[]; // Improvement suggestions  
  summary: string;      // One-line summary
}

export interface UseVisualQCReturn {
  isAnalyzing: boolean;
  result: QCResult | null;
  error: string | null;
  captureAndAnalyze: (
    playerRef: React.RefObject<any>,
    durationInFrames: number,
    originalPrompt: string,
    model: string,
    fps?: number
  ) => Promise<QCResult | null>;
  reset: () => void;
}

// ============================================================
// CAPTURE HELPERS
// ============================================================

/**
 * Wait for the next animation frame + a delay for rendering to complete.
 */
function waitForRender(delayMs: number = 200): Promise<void> {
  return new Promise<void>(resolve => {
    requestAnimationFrame(() => {
      setTimeout(resolve, delayMs);
    });
  });
}

/**
 * Capture a screenshot from the Remotion Player at the current frame.
 * Uses html-to-image (toPng) for accurate DOM-to-image conversion.
 * Falls back to canvas/video capture if available.
 */
async function capturePlayerFrame(playerContainer: HTMLElement | null): Promise<string | null> {
  if (!playerContainer) {
    console.warn('[VisualQC] No player container provided');
    return null;
  }

  console.log('[VisualQC] Container:', {
    tag: playerContainer.tagName,
    children: playerContainer.children.length,
    size: `${playerContainer.offsetWidth}x${playerContainer.offsetHeight}`,
    hasCanvas: !!playerContainer.querySelector('canvas'),
    hasVideo: !!playerContainer.querySelector('video'),
  });

  // Strategy 1: Canvas element (fastest, pixel-perfect)
  const canvas = playerContainer.querySelector('canvas');
  if (canvas instanceof HTMLCanvasElement && canvas.width > 0) {
    try {
      console.log('[VisualQC] Using canvas capture');
      return canvas.toDataURL('image/png', 0.8);
    } catch (e) {
      console.warn('[VisualQC] Canvas toDataURL failed (CORS?):', e);
    }
  }

  // Strategy 2: Video element
  const video = playerContainer.querySelector('video');
  if (video instanceof HTMLVideoElement && video.videoWidth > 0) {
    try {
      console.log('[VisualQC] Using video capture');
      const offscreen = document.createElement('canvas');
      offscreen.width = video.videoWidth;
      offscreen.height = video.videoHeight;
      const ctx = offscreen.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        return offscreen.toDataURL('image/png', 0.8);
      }
    } catch (e) {
      console.warn('[VisualQC] Video capture failed:', e);
    }
  }

  // Strategy 3: html-to-image DOM capture (handles Remotion's DOM rendering)
  // This is the primary path for motion graphics which render as styled divs
  try {
    const targetWidth = playerContainer.offsetWidth || 1920;
    const targetHeight = playerContainer.offsetHeight || 1080;
    console.log(`[VisualQC] Using html-to-image capture (${targetWidth}x${targetHeight})`);
    
    const dataUrl = await toPng(playerContainer, {
      width: targetWidth,
      height: targetHeight,
      quality: 0.8,
      pixelRatio: 1, // 1x is sufficient for QC — saves memory and compute
      skipAutoScale: true,
      cacheBust: true,
    });
    
    console.log('[VisualQC] html-to-image capture succeeded');
    return dataUrl;
  } catch (e) {
    console.warn('[VisualQC] html-to-image capture failed:', e);
  }

  console.error('[VisualQC] All capture strategies failed');
  return null;
}

/**
 * Capture frames at 0.5-second intervals. Always includes the first and last frame.
 * For a 3-second animation at 30fps (90 frames):
 *   frames = [0, 15, 30, 45, 60, 75, 89]
 */
async function captureKeyFrames(
  playerRef: React.RefObject<any>,
  durationInFrames: number,
  fps: number = 30
): Promise<string[]> {
  const intervalFrames = Math.round(fps * 0.5); // 0.5 seconds between captures
  const frames: number[] = [0]; // Always start with frame 0

  // Add frames at 0.5s intervals
  let frame = intervalFrames;
  while (frame < durationInFrames - 1) {
    frames.push(frame);
    frame += intervalFrames;
  }

  // Always include the last frame
  const lastFrame = Math.max(0, durationInFrames - 1);
  if (!frames.includes(lastFrame)) {
    frames.push(lastFrame);
  }

  // Cap at a reasonable limit to avoid excessive API payload
  const maxFrames = 12;
  const selectedFrames = frames.length > maxFrames
    ? [frames[0], ...frames.slice(1, -1).filter((_, i) => i % Math.ceil((frames.length - 2) / (maxFrames - 2)) === 0), frames[frames.length - 1]]
    : frames;

  console.log(`[VisualQC] Capturing ${selectedFrames.length} frames at 0.5s intervals:`, selectedFrames);
  const screenshots: string[] = [];

  for (const frameNum of selectedFrames) {
    try {
      // Seek the player to the target frame
      if (playerRef.current?.seekTo) {
        playerRef.current.seekTo(frameNum);
      } else if (playerRef.current?.seek) {
        playerRef.current.seek(frameNum);
      }

      // Wait for the frame to render (increased for DOM compilation)
      await waitForRender(350);

      // Get the player container element
      const container = playerRef.current?.getContainerNode?.()
        || playerRef.current?.containerRef?.current
        || (playerRef.current as HTMLElement);

      const screenshot = await capturePlayerFrame(container);
      if (screenshot) {
        screenshots.push(screenshot);
        console.log(`[VisualQC] ✅ Frame ${frameNum}/${durationInFrames}`);
      } else {
        console.warn(`[VisualQC] ❌ Could not capture frame ${frameNum}`);
      }
    } catch (error) {
      console.error(`[VisualQC] Error capturing frame ${frameNum}:`, error);
    }
  }

  return screenshots;
}

// ============================================================
// HOOK
// ============================================================

export function useVisualQC(): UseVisualQCReturn {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<QCResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setIsAnalyzing(false);
    setResult(null);
    setError(null);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const captureAndAnalyze = useCallback(async (
    playerRef: React.RefObject<any>,
    durationInFrames: number,
    originalPrompt: string,
    model: string,
    fps: number = 30
  ): Promise<QCResult | null> => {
    setIsAnalyzing(true);
    setResult(null);
    setError(null);

    try {
      // Step 1: Capture screenshots at 0.5s intervals
      console.log(`[VisualQC] Starting frame capture (${durationInFrames} frames at ${fps}fps)...`);
      const screenshots = await captureKeyFrames(playerRef, durationInFrames, fps);

      if (screenshots.length === 0) {
        const err = 'Could not capture any frames from the player. The player may not be rendering to a canvas.';
        setError(err);
        setIsAnalyzing(false);
        return null;
      }

      console.log(`[VisualQC] Captured ${screenshots.length} frames, sending for analysis...`);

      // Step 2: Send to API
      abortControllerRef.current = new AbortController();

      const response = await fetch('/api/motion-graphics/visual-qc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          screenshots,
          prompt: originalPrompt,
          model,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Visual QC API error: ${response.status} - ${errorText.substring(0, 200)}`);
      }

      const qcResult: QCResult = await response.json();

      console.log('[VisualQC] Analysis complete:', qcResult.passed ? 'PASSED' : 'FAILED', '-', qcResult.summary);
      setResult(qcResult);
      setIsAnalyzing(false);
      return qcResult;

    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        console.log('[VisualQC] Analysis aborted');
        setIsAnalyzing(false);
        return null;
      }

      const errorMessage = err instanceof Error ? err.message : 'Visual QC failed';
      console.error('[VisualQC] Error:', errorMessage);
      setError(errorMessage);
      setIsAnalyzing(false);
      return null;
    }
  }, []);

  return {
    isAnalyzing,
    result,
    error,
    captureAndAnalyze,
    reset,
  };
}
