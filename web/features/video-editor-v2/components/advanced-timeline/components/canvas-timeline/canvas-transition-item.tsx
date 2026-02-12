'use client';

/**
 * CanvasTransitionItem — GPU-rendered transition element (Professional NLE style)
 *
 * Renders a transition as a separate, first-class visual element on the canvas,
 * sitting at the boundary between clips (Premiere Pro / DaVinci Resolve style).
 *
 * Features:
 * - Distinct rounded rectangle separate from clips
 * - Color-coded by transition position (purple=between, blue=in/out)
 * - Shuffle icon + transition type label
 * - Hover effects with resize handles
 * - Click to select, edges to resize
 * - Rendered at reduced height to visually distinguish from clips
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Graphics, Text, TextStyle, Container, Rectangle } from 'pixi.js';
import { extend } from '@pixi/react';
import {
  hexToPixiColor,
  getItemRect,
  truncateLabel,
} from './canvas-timeline-utils';
import type { TransitionEntity } from '../../../../types/timeline-v2';

extend({ Container, Graphics, Text });

// ============================================================
// CONSTANTS
// ============================================================

const CORNER_RADIUS = 5;
const LABEL_PADDING = 6;
const LABEL_FONT_SIZE = 10;
const SELECTION_BORDER_WIDTH = 2;
const MIN_WIDTH_FOR_LABEL = 40;
const MIN_WIDTH_FOR_ICON = 20;

// Transition is rendered at 55% of clip height, centered
const TRANSITION_HEIGHT_RATIO = 0.55;

// Resize handles
const RESIZE_HANDLE_WIDTH = 10;
const RESIZE_HANDLE_VISUAL_WIDTH = 12;

// Hover
const HOVER_LIGHTEN = 0.1;

// Color schemes
const COLORS = {
  between: {
    fill: 0x7c3aed,       // Violet-600
    fillDark: 0x5b21b6,   // Violet-800
    accent: 0xa78bfa,      // Violet-400
    border: 0x6d28d9,      // Violet-700
    selection: 0xa78bfa,   // Violet-400
    icon: 0xddd6fe,        // Violet-200
  },
  inOut: {
    fill: 0x2563eb,        // Blue-600
    fillDark: 0x1e40af,    // Blue-800
    accent: 0x60a5fa,      // Blue-400
    border: 0x1d4ed8,      // Blue-700
    selection: 0x60a5fa,   // Blue-400
    icon: 0xbfdbfe,        // Blue-200
  },
} as const;

// Label style cache
const transitionLabelStyleCache = new Map<string, TextStyle>();

function getTransitionLabelStyle(fontSize: number): TextStyle {
  const key = `transition-${fontSize}`;
  let cached = transitionLabelStyleCache.get(key);
  if (!cached) {
    cached = new TextStyle({
      fontSize,
      fill: 0xffffff,
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      fontWeight: '600',
    });
    transitionLabelStyleCache.set(key, cached);
  }
  return cached;
}

// ============================================================
// TYPES
// ============================================================

export interface CanvasTransitionItemProps {
  /** The transition entity data */
  transition: TransitionEntity;
  /** Total scrollable duration in seconds */
  totalDuration: number;
  /** Total scrollable width in pixels */
  totalWidth: number;
  /** Track height in pixels */
  trackHeight: number;
  /** Whether this transition is currently selected */
  isSelected: boolean;
  /** Whether the parent track is locked */
  isLocked?: boolean;
  /** Callback when transition is clicked */
  onTransitionClick?: (transitionId: string) => void;
  /** Callback to initiate resize */
  onResizeStart?: (
    transitionId: string,
    clientX: number,
    clientY: number,
    side: 'left' | 'right',
  ) => void;
}

// ============================================================
// HELPERS
// ============================================================

/** Lighten a PixiJS numeric color */
function lightenPixiColor(color: number, amount: number): number {
  const r = Math.min(255, ((color >> 16) & 0xff) + Math.floor(255 * amount));
  const g = Math.min(255, ((color >> 8) & 0xff) + Math.floor(255 * amount));
  const b = Math.min(255, (color & 0xff) + Math.floor(255 * amount));
  return (r << 16) | (g << 8) | b;
}

/** Get display name for transition type */
function getTransitionDisplayName(type: string): string {
  // Convert camelCase/PascalCase to readable
  return type
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .replace(/_/g, ' ')
    .trim();
}

// ============================================================
// TYPE-SPECIFIC TRANSITION ICONS
// ============================================================

/**
 * Draws a type-specific icon at the given center position.
 * Each transition type gets a distinct visual representation.
 */
function drawTransitionTypeIcon(
  g: Graphics,
  type: string,
  cx: number,
  cy: number,
  sz: number,
  color: number,
): void {
  const lowerType = type.toLowerCase();
  g.setStrokeStyle({ color, width: 1.5, alpha: 0.9 });

  // --- Crossfade / Dissolve: overlapping translucent rectangles ---
  if (lowerType.includes('crossfade') || lowerType === 'dissolve') {
    // Left rect
    g.rect(cx - sz - 1, cy - sz + 1, sz * 1.4, sz * 1.6);
    g.fill({ color, alpha: 0.35 });
    g.stroke();
    // Right rect (overlapping)
    g.rect(cx - 1, cy - sz - 1, sz * 1.4, sz * 1.6);
    g.fill({ color, alpha: 0.25 });
    g.stroke();
    return;
  }

  // --- Fade / Fade to black / Fade to white: gradient bars ---
  if (lowerType.includes('fade')) {
    const bars = 4;
    const totalW = sz * 2;
    const barW = totalW / bars;
    for (let i = 0; i < bars; i++) {
      const alpha = lowerType.includes('in') || lowerType.includes('white')
        ? 0.2 + (i / bars) * 0.7
        : 0.9 - (i / bars) * 0.7;
      g.rect(cx - sz + i * barW, cy - sz * 0.7, barW - 1, sz * 1.4);
      g.fill({ color, alpha });
    }
    return;
  }

  // --- Wipe directions: arrow pointing in wipe direction ---
  if (lowerType.includes('wipe')) {
    const arrowSz = sz * 0.8;
    if (lowerType.includes('right')) {
      // Right arrow
      g.moveTo(cx - arrowSz, cy).lineTo(cx + arrowSz, cy);
      g.stroke();
      g.moveTo(cx + arrowSz - 2, cy - 3).lineTo(cx + arrowSz, cy).lineTo(cx + arrowSz - 2, cy + 3);
      g.stroke();
      // Vertical wipe line
      g.moveTo(cx, cy - sz).lineTo(cx, cy + sz);
      g.stroke();
    } else if (lowerType.includes('left')) {
      g.moveTo(cx + arrowSz, cy).lineTo(cx - arrowSz, cy);
      g.stroke();
      g.moveTo(cx - arrowSz + 2, cy - 3).lineTo(cx - arrowSz, cy).lineTo(cx - arrowSz + 2, cy + 3);
      g.stroke();
      g.moveTo(cx, cy - sz).lineTo(cx, cy + sz);
      g.stroke();
    } else if (lowerType.includes('up')) {
      g.moveTo(cx, cy + arrowSz).lineTo(cx, cy - arrowSz);
      g.stroke();
      g.moveTo(cx - 3, cy - arrowSz + 2).lineTo(cx, cy - arrowSz).lineTo(cx + 3, cy - arrowSz + 2);
      g.stroke();
      g.moveTo(cx - sz, cy).lineTo(cx + sz, cy);
      g.stroke();
    } else {
      // Down
      g.moveTo(cx, cy - arrowSz).lineTo(cx, cy + arrowSz);
      g.stroke();
      g.moveTo(cx - 3, cy + arrowSz - 2).lineTo(cx, cy + arrowSz).lineTo(cx + 3, cy + arrowSz - 2);
      g.stroke();
      g.moveTo(cx - sz, cy).lineTo(cx + sz, cy);
      g.stroke();
    }
    return;
  }

  // --- Slide directions: double arrow ---
  if (lowerType.includes('slide')) {
    const arrowSz = sz * 0.7;
    const isVertical = lowerType.includes('up') || lowerType.includes('down');
    const isPositive = lowerType.includes('right') || lowerType.includes('down');

    if (isVertical) {
      const dir = isPositive ? 1 : -1;
      // Box outline
      g.rect(cx - sz * 0.6, cy - sz * 0.6, sz * 1.2, sz * 1.2);
      g.stroke();
      // Arrow inside
      g.moveTo(cx, cy - arrowSz * 0.5 * dir).lineTo(cx, cy + arrowSz * 0.5 * dir);
      g.stroke();
    } else {
      const dir = isPositive ? 1 : -1;
      g.rect(cx - sz * 0.6, cy - sz * 0.6, sz * 1.2, sz * 1.2);
      g.stroke();
      g.moveTo(cx - arrowSz * 0.5 * dir, cy).lineTo(cx + arrowSz * 0.5 * dir, cy);
      g.stroke();
    }
    return;
  }

  // --- Zoom: expanding/contracting concentric rectangles ---
  if (lowerType.includes('zoom')) {
    const isIn = lowerType.includes('in');
    const s1 = isIn ? sz * 0.4 : sz * 0.9;
    const s2 = isIn ? sz * 0.9 : sz * 0.4;
    g.rect(cx - s1, cy - s1, s1 * 2, s1 * 2);
    g.stroke();
    g.setStrokeStyle({ color, width: 1, alpha: 0.5 });
    g.rect(cx - s2, cy - s2, s2 * 2, s2 * 2);
    g.stroke();
    return;
  }

  // --- Blur: concentric circles ---
  if (lowerType.includes('blur')) {
    g.circle(cx, cy, sz * 0.4);
    g.stroke();
    g.setStrokeStyle({ color, width: 1, alpha: 0.5 });
    g.circle(cx, cy, sz * 0.7);
    g.stroke();
    g.setStrokeStyle({ color, width: 0.5, alpha: 0.3 });
    g.circle(cx, cy, sz);
    g.stroke();
    return;
  }

  // --- Iris circle: circle icon ---
  if (lowerType.includes('iriscircle')) {
    g.circle(cx, cy, sz * 0.7);
    g.stroke();
    // Small center dot
    g.circle(cx, cy, 1.5);
    g.fill({ color, alpha: 0.8 });
    return;
  }

  // --- Iris rectangle: rectangle icon ---
  if (lowerType.includes('irisrectangle')) {
    g.rect(cx - sz * 0.6, cy - sz * 0.5, sz * 1.2, sz);
    g.stroke();
    g.circle(cx, cy, 1.5);
    g.fill({ color, alpha: 0.8 });
    return;
  }

  // --- Flip: rotation arrow ---
  if (lowerType.includes('flip')) {
    const isHoriz = lowerType.includes('horizontal');
    // Half-circle arc (approximated with lines)
    if (isHoriz) {
      g.moveTo(cx - sz, cy - 2).lineTo(cx, cy - sz * 0.8).lineTo(cx + sz, cy - 2);
      g.stroke();
      // Arrowhead
      g.moveTo(cx + sz - 3, cy - 5).lineTo(cx + sz, cy - 2).lineTo(cx + sz - 3, cy + 1);
      g.stroke();
    } else {
      g.moveTo(cx - 2, cy - sz).lineTo(cx - sz * 0.8, cy).lineTo(cx - 2, cy + sz);
      g.stroke();
      g.moveTo(cx - 5, cy + sz - 3).lineTo(cx - 2, cy + sz).lineTo(cx + 1, cy + sz - 3);
      g.stroke();
    }
    return;
  }

  // --- Fallback: generic shuffle icon ---
  g.moveTo(cx - sz, cy - 2).lineTo(cx + sz, cy - 2);
  g.stroke();
  g.moveTo(cx + sz - 2, cy - 4).lineTo(cx + sz, cy - 2).lineTo(cx + sz - 2, cy);
  g.stroke();
  g.moveTo(cx + sz, cy + 2).lineTo(cx - sz, cy + 2);
  g.stroke();
  g.moveTo(cx - sz + 2, cy).lineTo(cx - sz, cy + 2).lineTo(cx - sz + 2, cy + 4);
  g.stroke();
}

/**
 * Draws a subtle background pattern specific to the transition type.
 */
function drawTransitionBgPattern(
  g: Graphics,
  type: string,
  w: number,
  h: number,
): void {
  const lowerType = type.toLowerCase();

  // Crossfade/dissolve: diagonal hatching
  if (lowerType.includes('crossfade') || lowerType === 'dissolve') {
    g.setStrokeStyle({ color: 0xffffff, width: 0.5, alpha: 0.10 });
    const step = 8;
    for (let x = step; x < w; x += step) {
      g.moveTo(x, 0).lineTo(x - Math.min(step, h), Math.min(step, h));
      g.stroke();
    }
    return;
  }

  // Fade: vertical gradient bars
  if (lowerType.includes('fade')) {
    const bars = Math.floor(w / 6);
    for (let i = 0; i < bars; i++) {
      const alpha = 0.02 + (i / bars) * 0.08;
      g.rect(i * 6, 0, 4, h);
      g.fill({ color: 0xffffff, alpha });
    }
    return;
  }

  // Wipe/Slide: directional lines
  if (lowerType.includes('wipe') || lowerType.includes('slide')) {
    const isVertical = lowerType.includes('up') || lowerType.includes('down');
    g.setStrokeStyle({ color: 0xffffff, width: 0.5, alpha: 0.08 });
    if (isVertical) {
      const step = 6;
      for (let y = step; y < h; y += step) {
        g.moveTo(0, y).lineTo(w, y);
        g.stroke();
      }
    } else {
      const step = 6;
      for (let x = step; x < w; x += step) {
        g.moveTo(x, 0).lineTo(x, h);
        g.stroke();
      }
    }
    return;
  }

  // Default: subtle diagonal lines
  g.setStrokeStyle({ color: 0xffffff, width: 0.5, alpha: 0.08 });
  const step = 10;
  for (let x = step; x < w; x += step) {
    g.moveTo(x, 0).lineTo(x - Math.min(step, h), Math.min(step, h));
    g.stroke();
  }
}

// ============================================================
// COMPONENT
// ============================================================

export const CanvasTransitionItem = React.memo(function CanvasTransitionItem({
  transition,
  totalDuration,
  totalWidth,
  trackHeight,
  isSelected,
  isLocked = false,
  onTransitionClick,
  onResizeStart,
}: CanvasTransitionItemProps) {
  const [isHovering, setIsHovering] = useState(false);

  // Determine color scheme
  const isBetween = transition.position === 'between' ||
    (transition.clipIds.length === 2 && transition.clipIds[1] !== undefined);
  const colorScheme = isBetween ? COLORS.between : COLORS.inOut;

  // Compute pixel rectangle — transitions use reduced height
  const transitionHeight = Math.floor(trackHeight * TRANSITION_HEIGHT_RATIO);
  const rect = useMemo(() => {
    const item = { start: transition.startTime, end: transition.endTime };
    return getItemRect(item, totalDuration, totalWidth, trackHeight, transitionHeight);
  }, [transition.startTime, transition.endTime, totalDuration, totalWidth, trackHeight, transitionHeight]);

  // Fill color with hover effect
  const fillColor = useMemo(
    () => isHovering ? lightenPixiColor(colorScheme.fill, HOVER_LIGHTEN) : colorScheme.fill,
    [colorScheme.fill, isHovering],
  );

  // Truncated label
  const displayLabel = useMemo(() => {
    if (rect.width < MIN_WIDTH_FOR_LABEL) return '';
    const typeName = getTransitionDisplayName(transition.type);
    // Reserve space for icon (16px) + padding
    const availableWidth = rect.width - LABEL_PADDING * 2 - (rect.width >= MIN_WIDTH_FOR_ICON ? 18 : 0);
    return truncateLabel(typeName, availableWidth, LABEL_FONT_SIZE);
  }, [rect.width, transition.type]);

  const showHandles = (isHovering || isSelected) && !isLocked;

  // ========================================
  // DRAW CALLBACKS
  // ========================================

  /** Main transition body — gradient box with distinct styling */
  const drawBody = useCallback(
    (g: Graphics) => {
      g.clear();
      const w = rect.width;
      const h = rect.height;

      // Background fill
      g.roundRect(0, 0, w, h, CORNER_RADIUS);
      g.fill({ color: fillColor, alpha: 0.85 });

      // Bottom gradient band for depth
      const midY = Math.floor(h * 0.5);
      g.rect(0, midY, w, h - midY);
      g.fill({ color: colorScheme.fillDark, alpha: 0.4 });

      // Left accent bar
      g.roundRect(0, 0, 3, h, CORNER_RADIUS);
      g.fill({ color: colorScheme.accent, alpha: 0.9 });

      // Right accent bar
      g.roundRect(w - 3, 0, 3, h, CORNER_RADIUS);
      g.fill({ color: colorScheme.accent, alpha: 0.9 });

      // Type-specific icon in center
      if (w >= MIN_WIDTH_FOR_ICON) {
        const iconX = w >= MIN_WIDTH_FOR_LABEL ? LABEL_PADDING + 1 : w / 2;
        const iconY = h / 2;
        const sz = Math.min(5, h * 0.22);
        const iconColor = colorScheme.icon;

        drawTransitionTypeIcon(g, transition.type, iconX, iconY, sz, iconColor);
      }

      // Subtle background pattern (type-aware)
      if (w > 24) {
        drawTransitionBgPattern(g, transition.type, w, h);
      }

      // Border stroke
      g.roundRect(0, 0, w, h, CORNER_RADIUS);
      g.stroke({ color: colorScheme.border, width: 1, alpha: 0.7 });
    },
    [rect.width, rect.height, fillColor, colorScheme],
  );

  /** Selection glow */
  const drawSelection = useCallback(
    (g: Graphics) => {
      g.clear();
      if (!isSelected) return;

      // Outer glow
      g.roundRect(
        -SELECTION_BORDER_WIDTH,
        -SELECTION_BORDER_WIDTH,
        rect.width + SELECTION_BORDER_WIDTH * 2,
        rect.height + SELECTION_BORDER_WIDTH * 2,
        CORNER_RADIUS + 1,
      );
      g.fill({ color: colorScheme.selection, alpha: 0.3 });

      // Selection border
      g.roundRect(0, 0, rect.width, rect.height, CORNER_RADIUS);
      g.stroke({ color: colorScheme.selection, width: SELECTION_BORDER_WIDTH, alpha: 0.9 });
    },
    [isSelected, rect.width, rect.height, colorScheme.selection],
  );

  /** Resize handles on edges */
  const drawResizeHandles = useCallback(
    (g: Graphics) => {
      g.clear();
      if (!showHandles || rect.width < RESIZE_HANDLE_VISUAL_WIDTH * 3) return;

      const handleH = rect.height;
      const gripperH = 14;
      const gripperY = (handleH - gripperH) / 2;
      const gripperW = 2;
      const gripperGap = 3;

      // Left handle
      g.roundRect(0, 0, RESIZE_HANDLE_VISUAL_WIDTH, handleH, CORNER_RADIUS);
      g.fill({ color: colorScheme.accent, alpha: 0.3 });

      const leftCX = RESIZE_HANDLE_VISUAL_WIDTH / 2;
      g.roundRect(leftCX - gripperGap / 2 - gripperW, gripperY, gripperW, gripperH, 1);
      g.fill({ color: 0xffffff, alpha: 0.85 });
      g.roundRect(leftCX + gripperGap / 2, gripperY, gripperW, gripperH, 1);
      g.fill({ color: 0xffffff, alpha: 0.85 });

      // Right handle
      const rightX = rect.width - RESIZE_HANDLE_VISUAL_WIDTH;
      g.roundRect(rightX, 0, RESIZE_HANDLE_VISUAL_WIDTH, handleH, CORNER_RADIUS);
      g.fill({ color: colorScheme.accent, alpha: 0.3 });

      const rightCX = rightX + RESIZE_HANDLE_VISUAL_WIDTH / 2;
      g.roundRect(rightCX - gripperGap / 2 - gripperW, gripperY, gripperW, gripperH, 1);
      g.fill({ color: 0xffffff, alpha: 0.85 });
      g.roundRect(rightCX + gripperGap / 2, gripperY, gripperW, gripperH, 1);
      g.fill({ color: 0xffffff, alpha: 0.85 });
    },
    [showHandles, rect.width, rect.height, colorScheme.accent],
  );

  // ========================================
  // EVENT HANDLERS
  // ========================================

  const handlePointerDown = useCallback(
    (e: any) => {
      console.log('[CanvasTransitionItem] pointerDown', transition.id, { e, onTransitionClick: !!onTransitionClick });
      e.stopPropagation?.();

      const nativeEvent = e.nativeEvent || e.data?.originalEvent;
      const button = nativeEvent?.button ?? 0;

      if (button !== 0) return;
      if (isLocked) return;

      // Determine if clicking on resize zone
      const localPos = e.data?.getLocalPosition?.(e.currentTarget);
      const localX = localPos?.x ?? 0;

      if (onResizeStart && localX <= RESIZE_HANDLE_WIDTH) {
        const clientX = nativeEvent?.clientX ?? e.globalX ?? 0;
        const clientY = nativeEvent?.clientY ?? e.globalY ?? 0;
        onResizeStart(transition.id, clientX, clientY, 'left');
        return;
      }

      if (onResizeStart && localX >= rect.width - RESIZE_HANDLE_WIDTH) {
        const clientX = nativeEvent?.clientX ?? e.globalX ?? 0;
        const clientY = nativeEvent?.clientY ?? e.globalY ?? 0;
        onResizeStart(transition.id, clientX, clientY, 'right');
        return;
      }

      // Regular click → select
      onTransitionClick?.(transition.id);
    },
    [transition.id, rect.width, isLocked, onTransitionClick, onResizeStart],
  );

  const handlePointerMove = useCallback(
    (e: any) => {
      if (isLocked) return;
      const localPos = e.data?.getLocalPosition?.(e.currentTarget);
      const localX = localPos?.x ?? 0;

      let cursor = 'pointer';
      if (isLocked) {
        cursor = 'not-allowed';
      } else if (localX <= RESIZE_HANDLE_WIDTH || localX >= rect.width - RESIZE_HANDLE_WIDTH) {
        cursor = 'ew-resize';
      }

      const target = e.currentTarget;
      if (target && target.cursor !== cursor) {
        target.cursor = cursor;
      }
    },
    [rect.width, isLocked],
  );

  const handlePointerEnter = useCallback(() => setIsHovering(true), []);
  const handlePointerLeave = useCallback(() => setIsHovering(false), []);

  // Explicit hit area so PixiJS can detect pointer events on the container
  const hitArea = useMemo(
    () => new Rectangle(0, 0, rect.width, rect.height),
    [rect.width, rect.height],
  );

  // Don't render transitions that are too narrow
  if (rect.width < 2) return null;

  return (
    <pixiContainer
      x={rect.x}
      y={rect.y}
      eventMode="static"
      interactiveChildren={false}
      hitArea={hitArea}
      cursor={isLocked ? 'not-allowed' : 'pointer'}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      {/* Selection glow (behind body) */}
      {isSelected && <pixiGraphics draw={drawSelection} />}

      {/* Main transition body */}
      <pixiGraphics draw={drawBody} />

      {/* Resize handles */}
      {showHandles && <pixiGraphics draw={drawResizeHandles} />}

      {/* Label text */}
      {displayLabel && (
        <pixiText
          text={displayLabel}
          style={getTransitionLabelStyle(LABEL_FONT_SIZE)}
          x={LABEL_PADDING + (rect.width >= MIN_WIDTH_FOR_ICON ? 16 : 0)}
          y={(rect.height - LABEL_FONT_SIZE) / 2}
          alpha={0.9}
        />
      )}
    </pixiContainer>
  );
});
