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
import { toJpeg } from 'html-to-image';

// ============================================================
// TYPES
// ============================================================

export interface QCElementIssue {
  elementId: string;          // Variable name, JSX tag, or constant from the code
  elementDescription: string; // What this element is (e.g. 'the world map SVG group')
  issue: string;              // What's wrong with it
  severity: 'critical' | 'major' | 'minor';
  suggestedFix: string;       // Specific code-level fix for this element
}

export interface QCResult {
  passed: boolean;
  issues: string[];              // Legacy flat list of problems (backward compat)
  suggestions: string[];         // Legacy flat suggestions (backward compat)
  elementIssues: QCElementIssue[]; // Element-specific issues with code references
  generalIssues: string[];       // Non-element-specific problems
  summary: string;               // One-line summary
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
    fps?: number,
    code?: string
  ) => Promise<QCResult | null>;
  reset: () => void;
}

// ============================================================
// CAPTURE HELPERS
// ============================================================

export interface FrameCapture {
  frame: number;
  timeSeconds: number;
  dataUrl: string;
}

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
 * Uses html-to-image (toJpeg) for QC — lower quality is fine for AI analysis
 * and keeps the payload well under Next.js body size limits.
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
      const offscreen = document.createElement('canvas');
      offscreen.width = canvas.width;
      offscreen.height = canvas.height;
      const ctx = offscreen.getContext('2d');
      if (ctx) {
        ctx.drawImage(canvas, 0, 0, offscreen.width, offscreen.height);
        return offscreen.toDataURL('image/jpeg', 0.8);
      }
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
        ctx.drawImage(video, 0, 0, offscreen.width, offscreen.height);
        return offscreen.toDataURL('image/jpeg', 0.8);
      }
    } catch (e) {
      console.warn('[VisualQC] Video capture failed:', e);
    }
  }

  // Strategy 3: html-to-image DOM capture (handles Remotion's DOM rendering)
  try {
    const targetWidth = playerContainer.offsetWidth || 1920;
    const targetHeight = playerContainer.offsetHeight || 1080;
    console.log(`[VisualQC] Using html-to-image capture (${targetWidth}x${targetHeight})`);
    
    const dataUrl = await toJpeg(playerContainer, {
      width: targetWidth,
      height: targetHeight,
      quality: 0.8,
      pixelRatio: 1, // Full resolution for accurate QC analysis
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
): Promise<FrameCapture[]> {
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
  const captures: FrameCapture[] = [];

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
        captures.push({
          frame: frameNum,
          timeSeconds: Math.round((frameNum / fps) * 100) / 100,
          dataUrl: screenshot,
        });
        console.log(`[VisualQC] ✅ Frame ${frameNum}/${durationInFrames} (${(frameNum / fps).toFixed(2)}s)`);
      } else {
        console.warn(`[VisualQC] ❌ Could not capture frame ${frameNum}`);
      }
    } catch (error) {
      console.error(`[VisualQC] Error capturing frame ${frameNum}:`, error);
    }
  }

  return captures;
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
    fps: number = 30,
    code?: string
  ): Promise<QCResult | null> => {
    setIsAnalyzing(true);
    setResult(null);
    setError(null);

    try {
      // Step 1: Capture screenshots at 0.5s intervals
      console.log(`[VisualQC] Starting frame capture (${durationInFrames} frames at ${fps}fps)...`);
      const captures = await captureKeyFrames(playerRef, durationInFrames, fps);

      if (captures.length === 0) {
        const err = 'Could not capture any frames from the player. The player may not be rendering to a canvas.';
        setError(err);
        setIsAnalyzing(false);
        return null;
      }

      console.log(`[VisualQC] Captured ${captures.length} frames, sending for analysis...`);

      // Step 2: Send to API with frame metadata
      abortControllerRef.current = new AbortController();

      const totalDurationSeconds = Math.round((durationInFrames / fps) * 100) / 100;
      const response = await fetch('/api/motion-graphics/visual-qc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          screenshots: captures.map(c => c.dataUrl),
          frameMetadata: captures.map(c => ({
            frame: c.frame,
            timeSeconds: c.timeSeconds,
            percentThrough: Math.round((c.frame / Math.max(1, durationInFrames - 1)) * 100),
          })),
          totalDurationSeconds,
          prompt: originalPrompt,
          model,
          ...(code ? { code } : {}),
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
