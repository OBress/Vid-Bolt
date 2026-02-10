/**
 * useGifExport - Export motion graphics as animated GIF
 *
 * Captures frames from a Remotion Player by seeking frame-by-frame,
 * rendering each to a canvas via html-to-image, and encoding the
 * sequence into a GIF using gif.js (Web Worker-based, non-blocking).
 *
 * Designed for DevTools showcase use — not production.
 */

import { useState, useCallback, useRef } from 'react';
import { toPng } from 'html-to-image';
import GIF from 'gif.js';

// ============================================================
// TYPES
// ============================================================

export interface UseGifExportReturn {
  isExporting: boolean;
  /** 0–100 */
  progress: number;
  error: string | null;
  exportGif: (
    playerRef: React.RefObject<any>,
    durationInFrames: number,
    fps: number,
    filename?: string
  ) => Promise<void>;
  cancel: () => void;
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Wait for the next animation frame + delay for rendering to settle.
 */
function waitForRender(delayMs: number = 250): Promise<void> {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      setTimeout(resolve, delayMs);
    });
  });
}

/**
 * Convert a PNG data-URL to an HTMLImageElement (already decoded).
 */
function dataUrlToImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error(`Image load failed: ${e}`));
    img.src = dataUrl;
  });
}

/**
 * Capture the Remotion Player container as a PNG data-URL using the same
 * strategy as use-visual-qc (canvas → video → html-to-image fallback).
 */
async function captureFrame(
  playerContainer: HTMLElement | null,
  width: number,
  height: number
): Promise<string | null> {
  if (!playerContainer) return null;

  // Strategy 1: Canvas (fastest)
  const canvas = playerContainer.querySelector('canvas');
  if (canvas instanceof HTMLCanvasElement && canvas.width > 0) {
    try {
      return canvas.toDataURL('image/png');
    } catch {
      // CORS — fall through
    }
  }

  // Strategy 2: Video element
  const video = playerContainer.querySelector('video');
  if (video instanceof HTMLVideoElement && video.videoWidth > 0) {
    try {
      const offscreen = document.createElement('canvas');
      offscreen.width = video.videoWidth;
      offscreen.height = video.videoHeight;
      const ctx = offscreen.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        return offscreen.toDataURL('image/png');
      }
    } catch {
      // fall through
    }
  }

  // Strategy 3: DOM capture via html-to-image
  try {
    return await toPng(playerContainer, {
      width,
      height,
      quality: 1.0,
      pixelRatio: 1, // Full res 1:1
      skipAutoScale: true,
      cacheBust: true,
    });
  } catch {
    // fall through
  }

  return null;
}

// ============================================================
// HOOK
// ============================================================

export function useGifExport(): UseGifExportReturn {
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const gifRef = useRef<InstanceType<typeof GIF> | null>(null);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    if (gifRef.current) {
      try {
        gifRef.current.abort();
      } catch {
        // gif.js may throw if not started
      }
      gifRef.current = null;
    }
    setIsExporting(false);
    setProgress(0);
  }, []);

  const exportGif = useCallback(
    async (
      playerRef: React.RefObject<any>,
      durationInFrames: number,
      fps: number,
      filename: string = 'motion-graphic'
    ): Promise<void> => {
      if (!playerRef.current) {
        setError('Player ref is not available');
        return;
      }

      setIsExporting(true);
      setProgress(0);
      setError(null);
      cancelledRef.current = false;

      try {
        // --- Determine dimensions ---
        const container =
          playerRef.current.getContainerNode?.() ||
          playerRef.current.containerRef?.current ||
          (playerRef.current as HTMLElement);

        if (!container) {
          throw new Error('Cannot access Player container');
        }

        // Use the composition dimensions (full 1080p)
        const width = (container as HTMLElement).offsetWidth || 1920;
        const height = (container as HTMLElement).offsetHeight || 1080;

        console.log(
          `[GifExport] Starting export: ${durationInFrames} frames @ ${fps}fps, ${width}x${height}`
        );

        // --- Capture at 5fps (every Nth frame from source) ---
        const gifFps = 10;
        const frameStep = Math.max(1, Math.round(fps / gifFps));
        const gifDelay = Math.round(1000 / gifFps); // ms per frame for GIF (200ms at 5fps)
        const capturedFrames: HTMLImageElement[] = [];

        // Build list of frames to capture
        const framesToCapture: number[] = [];
        for (let frame = 0; frame < durationInFrames; frame += frameStep) {
          framesToCapture.push(frame);
        }
        // Always include the last frame
        const lastFrame = durationInFrames - 1;
        if (framesToCapture[framesToCapture.length - 1] !== lastFrame) {
          framesToCapture.push(lastFrame);
        }
        const totalFrames = framesToCapture.length;

        for (let i = 0; i < totalFrames; i++) {
          const frame = framesToCapture[i];
          if (cancelledRef.current) {
            console.log('[GifExport] Export cancelled during capture');
            return;
          }

          // Seek
          if (playerRef.current.seekTo) {
            playerRef.current.seekTo(frame);
          } else if (playerRef.current.seek) {
            playerRef.current.seek(frame);
          }

          // Wait for render
          await waitForRender(200);

          // Capture
          const dataUrl = await captureFrame(container, width, height);
          if (dataUrl) {
            const img = await dataUrlToImage(dataUrl);
            capturedFrames.push(img);
          }

          // Update progress (capture phase = 0-70%)
          const captureProgress = Math.round(((i + 1) / totalFrames) * 70);
          setProgress(captureProgress);
        }

        if (capturedFrames.length === 0) {
          throw new Error('No frames were captured — the Player may not be rendering');
        }

        console.log(`[GifExport] Captured ${capturedFrames.length}/${totalFrames} frames, encoding GIF...`);

        // --- Encode GIF ---
        const gif = new GIF({
          workers: 4,
          quality: 10,
          width,
          height,
          workerScript: '/gif.worker.js',
        });

        gifRef.current = gif;

        for (const img of capturedFrames) {
          gif.addFrame(img, { delay: gifDelay, copy: true });
        }

        // Wrap gif.render() in a promise
        await new Promise<void>((resolve, reject) => {
          gif.on('progress', (p: number) => {
            // Encoding phase = 70-100%
            const encodeProgress = 70 + Math.round(p * 30);
            setProgress(encodeProgress);
          });

          gif.on('finished', (blob: Blob) => {
            // Trigger download
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${filename}.gif`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            const sizeMB = (blob.size / (1024 * 1024)).toFixed(2);
            console.log(`[GifExport] ✅ GIF exported: ${sizeMB}MB, ${capturedFrames.length} frames`);
            resolve();
          });

          // gif.js emits 'error' at runtime but @types/gif.js lacks the overload
          (gif as any).on('error', (err: Error) => {
            reject(err);
          });

          gif.render();
        });

        setProgress(100);
      } catch (err) {
        if (cancelledRef.current) return;
        const msg = err instanceof Error ? err.message : 'GIF export failed';
        console.error('[GifExport] Error:', msg);
        setError(msg);
      } finally {
        gifRef.current = null;
        setIsExporting(false);
      }
    },
    []
  );

  return {
    isExporting,
    progress,
    error,
    exportGif,
    cancel,
  };
}

export default useGifExport;
