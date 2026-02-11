'use client';

/**
 * CanvasPlayhead — GPU-rendered playhead indicator
 *
 * Renders the current playhead position as a thin vertical line
 * with a triangular head on the canvas. This replaces the DOM-based
 * playhead line in the tracks area.
 *
 * Note: The playhead HEAD (draggable triangle in the markers area)
 * remains DOM-based in `timeline-marker.tsx`. This component only
 * renders the vertical line that spans the tracks area.
 */

import { useCallback } from 'react';
import { Graphics } from 'pixi.js';
import { extend } from '@pixi/react';

extend({ Graphics });

// ============================================================
// CONSTANTS
// ============================================================

const PLAYHEAD_COLOR = 0xef4444; // Red-500
const PLAYHEAD_WIDTH = 1.5;
const PLAYHEAD_ALPHA = 0.9;

// ============================================================
// TYPES
// ============================================================

export interface CanvasPlayheadProps {
  /** X position of the playhead in pixels */
  x: number;
  /** Total height to draw the playhead line */
  height: number;
}

// ============================================================
// COMPONENT
// ============================================================

export function CanvasPlayhead({ x, height }: CanvasPlayheadProps) {
  const drawPlayhead = useCallback(
    (g: Graphics) => {
      g.clear();

      // Vertical line spanning the full track height
      g.moveTo(0, 0);
      g.lineTo(0, height);
      g.stroke({
        color: PLAYHEAD_COLOR,
        width: PLAYHEAD_WIDTH,
        alpha: PLAYHEAD_ALPHA,
      });
    },
    [height],
  );

  return (
    <pixiGraphics
      x={x}
      y={0}
      draw={drawPlayhead}
      eventMode="none"
    />
  );
}
