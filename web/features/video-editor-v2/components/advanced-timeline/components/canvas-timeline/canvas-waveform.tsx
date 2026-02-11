'use client';

/**
 * CanvasWaveform — GPU-rendered audio waveform bars via PixiJS Graphics
 *
 * Draws vertical bars mirrored around the center line from peak amplitude data.
 * This replaces the DOM-based `AudioWaveform` canvas-2D component for items
 * rendered on the PixiJS canvas timeline.
 *
 * Performance: Single Graphics draw call for all bars — GPU-batched.
 */

import { useCallback, useMemo } from 'react';
import { Graphics } from 'pixi.js';
import { extend } from '@pixi/react';

extend({ Graphics });

// ============================================================
// TYPES
// ============================================================

export interface CanvasWaveformProps {
  /** Peak amplitude data (0..1 per sample) */
  peaks: number[];
  /** Available width in pixels */
  width: number;
  /** Available height in pixels */
  height: number;
  /** Fill color (PixiJS hex) — defaults to white */
  color?: number;
  /** Fill alpha — defaults to 0.9 */
  alpha?: number;
}

// ============================================================
// CONSTANTS
// ============================================================

const MIN_BAR_SPACING = 2;   // Minimum pixels per bar (controls density)
const BAR_WIDTH_RATIO = 0.6; // Ratio of bar width to slot width
const MIN_BAR_HEIGHT = 2;    // Minimum bar height in pixels
const AMPLITUDE_SCALE = 0.8; // Scale factor for peak-to-pixel conversion

// ============================================================
// COMPONENT
// ============================================================

export function CanvasWaveform({
  peaks,
  width,
  height,
  color = 0xffffff,
  alpha = 0.9,
}: CanvasWaveformProps) {
  const barCount = useMemo(
    () => Math.min(peaks.length, Math.floor(width / MIN_BAR_SPACING)),
    [peaks.length, width],
  );

  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      if (barCount < 1 || width < 4 || !peaks.length) return;

      const barSlotWidth = width / barCount;
      const barW = barSlotWidth * BAR_WIDTH_RATIO;
      const centerY = height / 2;

      for (let i = 0; i < barCount; i++) {
        const peakIndex = Math.floor((i / barCount) * peaks.length);
        const amplitude = peaks[peakIndex] || 0;
        const barH = Math.max(MIN_BAR_HEIGHT, amplitude * height * AMPLITUDE_SCALE);

        const x = i * barSlotWidth + (barSlotWidth - barW) / 2;
        const y = centerY - barH / 2;

        g.roundRect(x, y, barW, barH, 1);
      }

      g.fill({ color, alpha });
    },
    [peaks, barCount, width, height, color, alpha],
  );

  if (width < 4 || barCount < 1) return null;

  return <pixiGraphics draw={draw} />;
}
