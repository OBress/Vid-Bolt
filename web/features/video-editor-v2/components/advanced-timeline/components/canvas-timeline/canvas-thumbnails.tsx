'use client';

/**
 * CanvasThumbnails — GPU-rendered video thumbnail strip via PixiJS Sprites
 *
 * Loads a sprite sheet URL into a PixiJS Texture and renders tiled Sprite
 * sub-regions across the item width. Each thumbnail samples the sprite sheet
 * at the correct time offset using the provided `rectForTime` function.
 *
 * PixiJS v8 API: Uses Texture.from() and frame-based sub-textures.
 * Uses a shared texture cache so multiple items with the same sprite URL
 * only load the texture once.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Texture, Rectangle, Sprite, Container } from 'pixi.js';
import { extend } from '@pixi/react';

extend({ Sprite, Container });

// ============================================================
// TYPES
// ============================================================

export interface ThumbnailRect {
  x: number;
  y: number;
  width: number;
  height: number;
  index: number;
}

export interface CanvasThumbnailsProps {
  /** URL to the sprite sheet image */
  spriteUrl: string;
  /** Function to get the crop rectangle for a given timestamp */
  rectForTime: (timestampSec: number) => ThumbnailRect;
  /** Item width in pixels */
  itemWidth: number;
  /** Item height in pixels */
  itemHeight: number;
  /** Item start time in seconds */
  start: number;
  /** Item end time in seconds */
  end: number;
  /** Media start offset in seconds */
  mediaStart: number;
  /** Thumbnail interval in seconds */
  intervalSec: number;
  /** Frames per second */
  fps: number;
}

// ============================================================
// CONSTANTS
// ============================================================

const MIN_THUMBNAIL_WIDTH = 40;

// ============================================================
// COMPONENT
// ============================================================

export function CanvasThumbnails({
  spriteUrl,
  rectForTime,
  itemWidth,
  itemHeight,
  start,
  end,
  mediaStart,
  intervalSec,
  fps,
}: CanvasThumbnailsProps) {
  const [textureReady, setTextureReady] = useState(false);
  const textureRef = useRef<Texture | null>(null);
  const mountedRef = useRef(true);

  // Load the sprite sheet texture (PixiJS v8: Texture.from)
  // We preload the image first to ensure the texture source is valid
  useEffect(() => {
    mountedRef.current = true;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!mountedRef.current) return;
      textureRef.current = Texture.from(spriteUrl);
      setTextureReady(true);
    };
    img.onerror = () => {
      // Silently fail — item will just show the colored background
    };
    img.src = spriteUrl;

    return () => {
      mountedRef.current = false;
    };
  }, [spriteUrl]);

  // Compute thumbnail slot width
  const thumbnailWidth = useMemo(() => {
    const rect0 = rectForTime(0);
    const rect0Width = rect0?.width || MIN_THUMBNAIL_WIDTH;
    const rect0Height = rect0?.height || itemHeight;
    const baseScale = Math.max(1, itemHeight / rect0Height);
    return Math.max(MIN_THUMBNAIL_WIDTH, Math.floor(rect0Width * baseScale));
  }, [rectForTime, itemHeight]);

  const thumbnailCount = useMemo(
    () => Math.ceil(itemWidth / thumbnailWidth),
    [itemWidth, thumbnailWidth],
  );

  const timePerPixel = useMemo(
    () => (end - start) / itemWidth,
    [end, start, itemWidth],
  );

  // Build sprite data for each thumbnail slot
  const sprites = useMemo(() => {
    if (!textureReady || !textureRef.current) return [];

    const baseTex = textureRef.current;
    const texWidth = baseTex.source.width;
    const texHeight = baseTex.source.height;
    const result: Array<{
      key: number;
      texture: Texture;
      x: number;
      scaleX: number;
      scaleY: number;
    }> = [];

    for (let i = 0; i < thumbnailCount; i++) {
      const timestamp = mediaStart + i * thumbnailWidth * timePerPixel;
      const sourceTimestamp = Math.max(0, Math.floor(timestamp));
      const rect = rectForTime(sourceTimestamp);

      // Clamp frame to texture bounds
      const fx = Math.max(0, Math.min(rect.x, texWidth - 1));
      const fy = Math.max(0, Math.min(rect.y, texHeight - 1));
      const fw = Math.min(rect.width, texWidth - fx);
      const fh = Math.min(rect.height, texHeight - fy);

      if (fw <= 0 || fh <= 0) continue;

      try {
        const frame = new Rectangle(fx, fy, fw, fh);
        const subTexture = new Texture({ source: baseTex.source, frame });

        // Scale to fit item height, maintain aspect for width
        const scaleY = itemHeight / fh;
        const scaleX = thumbnailWidth / fw;

        result.push({
          key: i,
          texture: subTexture,
          x: i * thumbnailWidth,
          scaleX,
          scaleY,
        });
      } catch {
        // Skip invalid texture regions
      }
    }

    return result;
  }, [
    textureReady,
    thumbnailCount,
    thumbnailWidth,
    timePerPixel,
    mediaStart,
    rectForTime,
    itemHeight,
  ]);

  if (!textureReady || sprites.length === 0) return null;

  return (
    <pixiContainer alpha={0.9}>
      {sprites.map((s) => (
        <pixiSprite
          key={s.key}
          texture={s.texture}
          x={s.x}
          y={0}
          width={thumbnailWidth}
          height={itemHeight}
        />
      ))}
    </pixiContainer>
  );
}
