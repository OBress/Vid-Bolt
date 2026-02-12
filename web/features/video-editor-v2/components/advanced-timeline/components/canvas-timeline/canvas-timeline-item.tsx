'use client';

/**
 * CanvasTimelineItem — GPU-rendered timeline item with full interactions
 *
 * Renders a single clip as a rounded rectangle with label text on the PixiJS canvas.
 * Replaces the 1,987-line DOM-based `timeline-item.tsx` for the rendering path.
 *
 * Phase 2 interactions:
 * - Click-to-select with Shift multi-select
 * - Drag-to-move (bridges to existing useTimelineDragAndDrop)
 * - Resize handles (12px edge zones with ew-resize cursor)
 * - Right-click context menu (emits screen coordinates to DOM portal)
 * - Hover effects (lighten fill, show resize handles)
 *
 * Performance characteristics:
 * - Zero DOM nodes per item (GPU-drawn pixels only)
 * - Zero Recalculate Style cost
 * - GPU-batched draw calls (100 items ≈ same cost as 1 item)
 * - Built-in PixiJS event system for pointer interactions
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Graphics, Text, TextStyle, Container, Rectangle } from 'pixi.js';
import { extend } from '@pixi/react';
import {
  hexToPixiColor,
  getItemRect,
  truncateLabel,
} from './canvas-timeline-utils';
import type { TimelineItem } from '../../../../stores/memoized-selectors';
import { TIMELINE_CONSTANTS } from '../../constants';

// Register PixiJS classes with @pixi/react
extend({ Container, Graphics, Text });

// ============================================================
// CONSTANTS
// ============================================================

const CORNER_RADIUS = 4;
const LABEL_PADDING = 8;
const LABEL_FONT_SIZE = 11;
const SELECTION_BORDER_WIDTH = 2;
const SELECTION_COLOR = 0x3b82f6; // Blue-500
const SELECTION_GLOW_ALPHA = 0.3;
const MIN_WIDTH_FOR_LABEL = 30; // Minimum pixel width to show label text
const MUTED_ALPHA = 0.4;
const LOCKED_ALPHA = 0.6;

// Interaction constants
const RESIZE_HANDLE_WIDTH = 12; // Pixel zone at edges for resize detection
const RESIZE_HANDLE_VISUAL_WIDTH = 16; // Visual width of resize handle
const HOVER_LIGHTEN = 0.08; // Amount to lighten fill on hover

// Accent bar — 3px vertical bar at left edge for instant type identification
const ACCENT_BAR_WIDTH = 3;

// Type icon — small glyph in top-left for clip type identification
const TYPE_ICON_SIZE = 16;
const TYPE_ICON_MARGIN = 4;
const MIN_WIDTH_FOR_TYPE_ICON = 40;

// Badge constants
const BADGE_SIZE = 14;
const BADGE_GAP = 2;
const BADGE_MARGIN = 3;
const BADGE_CORNER = 3;
const MIN_WIDTH_FOR_BADGES = 50;

// Badge colors (matching DOM timeline-item.tsx)
const BADGE_COLORS = {
  effects: 0xa855f7,     // Purple-500
  transitions: 0x3b82f6, // Blue-500
  muted: 0xef4444,       // Red-500
  hidden: 0x6b7280,      // Gray-500
  trackMuted: 0xf59e0b,  // Amber-500
  locked: 0xf97316,      // Orange-500
} as const;

// Link group colors (same palette as DOM version)
const LINK_GROUP_COLORS = [
  { bg: 0x3b82f6, glow: 0x3b82f6 }, // Blue
  { bg: 0x10b981, glow: 0x10b981 }, // Emerald
  { bg: 0xf59e0b, glow: 0xf59e0b }, // Amber
  { bg: 0xef4444, glow: 0xef4444 }, // Red
  { bg: 0x8b5cf6, glow: 0x8b5cf6 }, // Violet
  { bg: 0xec4899, glow: 0xec4899 }, // Pink
  { bg: 0x14b8a6, glow: 0x14b8a6 }, // Teal
  { bg: 0xf97316, glow: 0xf97316 }, // Orange
];

// Pre-create text style to avoid re-allocation per frame
const labelStyleCache = new Map<string, TextStyle>();

function getLabelStyle(fontSize: number): TextStyle {
  const key = `${fontSize}`;
  let cached = labelStyleCache.get(key);
  if (!cached) {
    cached = new TextStyle({
      fontSize,
      fill: 0xffffff,
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      fontWeight: '500',
    });
    labelStyleCache.set(key, cached);
  }
  return cached;
}

// ============================================================
// TYPES
// ============================================================

/** Data emitted when a canvas item is right-clicked */
export interface CanvasContextMenuData {
  /** The item that was right-clicked */
  item: TimelineItem;
  /** Screen X coordinate for positioning the DOM menu */
  screenX: number;
  /** Screen Y coordinate for positioning the DOM menu */
  screenY: number;
}

export interface CanvasTimelineItemProps {
  /** The timeline item data from the store */
  item: TimelineItem;
  /** Total scrollable duration in seconds */
  totalDuration: number;
  /** Total scrollable width in pixels */
  totalWidth: number;
  /** Track height in pixels */
  trackHeight: number;
  /** Whether this item is currently selected */
  isSelected: boolean;
  /** Whether the track is muted */
  isMuted?: boolean;
  /** Whether this item's track is locked */
  isLocked?: boolean;
  /** Whether the track is hidden (visible=false) */
  trackHidden?: boolean;
  /** Whether the track is muted (track-level, separate from clip mute) */
  trackMuted?: boolean;
  /** Whether splitting mode is active (disables drag) */
  splittingEnabled?: boolean;
  /** All currently selected item IDs (for multi-drag) */
  selectedItemIds?: string[];
  /** Callback when item is clicked */
  onSelect?: (itemId: string) => void;
  /** Callback for multi-select (Shift+click) */
  onSelectionChange?: (itemId: string, isMultiple: boolean) => void;
  /** Callback to initiate drag/resize (bridges to useTimelineDragAndDrop) */
  onDragStart?: (
    item: TimelineItem,
    clientX: number,
    clientY: number,
    action: 'move' | 'resize-start' | 'resize-end',
    selectedItemIds: string[],
  ) => void;
  /** Callback for right-click context menu */
  onContextMenu?: (data: CanvasContextMenuData) => void;
  /** Callback when user clicks on a transition zone */
  onTransitionClick?: (transitionId: string) => void;
}

// ============================================================
// HELPERS
// ============================================================

/** Lighten a PixiJS numeric color by a factor */
function lightenPixiColor(color: number, amount: number): number {
  const r = Math.min(255, ((color >> 16) & 0xff) + Math.floor(255 * amount));
  const g = Math.min(255, ((color >> 8) & 0xff) + Math.floor(255 * amount));
  const b = Math.min(255, (color & 0xff) + Math.floor(255 * amount));
  return (r << 16) | (g << 8) | b;
}

/** Darken a PixiJS numeric color by a factor (0-1) */
function darkenPixiColor(color: number, amount: number): number {
  const factor = 1 - amount;
  const r = Math.max(0, Math.floor(((color >> 16) & 0xff) * factor));
  const g = Math.max(0, Math.floor(((color >> 8) & 0xff) * factor));
  const b = Math.max(0, Math.floor((color & 0xff) * factor));
  return (r << 16) | (g << 8) | b;
}

/** Determine drag action based on pointer position within item */
function getActionFromPosition(
  localX: number,
  itemWidth: number,
): 'resize-start' | 'resize-end' | 'move' {
  if (localX <= RESIZE_HANDLE_WIDTH) return 'resize-start';
  if (localX >= itemWidth - RESIZE_HANDLE_WIDTH) return 'resize-end';
  return 'move';
}

/** Determine cursor style based on pointer position */
function getCursorFromPosition(
  localX: number,
  itemWidth: number,
  isLocked: boolean,
): string {
  if (isLocked) return 'not-allowed';
  if (localX <= RESIZE_HANDLE_WIDTH || localX >= itemWidth - RESIZE_HANDLE_WIDTH) {
    return 'ew-resize';
  }
  return 'pointer';
}

/** Get link group color from link group ID using deterministic hash */
function getLinkGroupColor(linkGroup: string | undefined) {
  if (!linkGroup) return null;
  let hash = 0;
  for (let i = 0; i < linkGroup.length; i++) {
    hash = (hash * 31 + linkGroup.charCodeAt(i)) | 0;
  }
  return LINK_GROUP_COLORS[Math.abs(hash) % LINK_GROUP_COLORS.length];
}

/** Draw a simple icon glyph inside a badge using Graphics lines */
function drawBadgeIcon(g: Graphics, x: number, y: number, type: string) {
  const cx = x + BADGE_SIZE / 2;
  const cy = y + BADGE_SIZE / 2;
  const s = 3.5; // icon half-size
  g.setStrokeStyle({ color: 0xffffff, width: 1.5, alpha: 0.95 });

  switch (type) {
    case 'effects': // sparkle star ✦
      g.moveTo(cx, cy - s).lineTo(cx + 1, cy - 1).lineTo(cx + s, cy)
       .lineTo(cx + 1, cy + 1).lineTo(cx, cy + s).lineTo(cx - 1, cy + 1)
       .lineTo(cx - s, cy).lineTo(cx - 1, cy - 1).closePath();
      g.fill({ color: 0xffffff, alpha: 0.9 });
      break;
    case 'transitions': // shuffle arrows ⇄
      g.moveTo(cx - s, cy - 1).lineTo(cx + s, cy - 1).stroke();
      g.moveTo(cx - s, cy + 1).lineTo(cx + s, cy + 1).stroke();
      break;
    case 'muted': // X mark for volume off
      g.moveTo(cx - s + 1, cy - s + 1).lineTo(cx + s - 1, cy + s - 1).stroke();
      g.moveTo(cx + s - 1, cy - s + 1).lineTo(cx - s + 1, cy + s - 1).stroke();
      break;
    case 'hidden': // eye with slash
      g.moveTo(cx - s, cy).lineTo(cx, cy - s + 1).lineTo(cx + s, cy).stroke();
      g.moveTo(cx - s + 1, cy + s - 1).lineTo(cx + s - 1, cy - s + 1).stroke();
      break;
    case 'trackMuted': // small speaker with X
      g.moveTo(cx - s + 1, cy - 1).lineTo(cx, cy - 1)
       .lineTo(cx + 1, cy - s + 1).stroke();
      g.moveTo(cx - s + 1, cy + 1).lineTo(cx, cy + 1)
       .lineTo(cx + 1, cy + s - 1).stroke();
      break;
    case 'locked': // padlock
      g.roundRect(cx - s + 0.5, cy - 0.5, s * 2 - 1, s + 1, 1);
      g.fill({ color: 0xffffff, alpha: 0.9 });
      g.moveTo(cx - 1.5, cy - 0.5).lineTo(cx - 1.5, cy - 2)
       .bezierCurveTo(cx - 1.5, cy - s - 0.5, cx + 1.5, cy - s - 0.5, cx + 1.5, cy - 2)
       .lineTo(cx + 1.5, cy - 0.5).stroke();
      break;
    case 'link': // chain link
      g.circle(cx - 1, cy, 2.5).stroke();
      g.circle(cx + 1, cy, 2.5).stroke();
      break;
  }
}



// ============================================================
// EFFECT PATTERN DRAWING
// ============================================================

/**
 * Draws subtle background patterns for effect/shape clips.
 * Makes effect clips visually distinct from plain media clips.
 */
function drawEffectPattern(
  g: Graphics,
  w: number,
  h: number,
  effectLabel?: string,
): void {
  if (w < 20 || h < 10) return;

  const label = (effectLabel || '').toLowerCase();

  // Color grade — horizontal gradient bands
  if (label.includes('color') || label.includes('grade') || label.includes('lut')) {
    const bands = 6;
    const bandH = h / bands;
    for (let i = 0; i < bands; i++) {
      // Warm-to-cool progression
      const hue = (i / bands) * 0.3;
      const r = Math.floor(200 * (1 - hue));
      const b = Math.floor(200 * hue);
      const color = (r << 16) | (100 << 8) | b;
      g.rect(ACCENT_BAR_WIDTH + 4, i * bandH, w - ACCENT_BAR_WIDTH - 8, bandH);
      g.fill({ color, alpha: 0.08 });
    }
    return;
  }

  // Blur/Sharpen — soft diagonal lines
  if (label.includes('blur') || label.includes('sharpen') || label.includes('defocus')) {
    g.setStrokeStyle({ color: 0xffffff, width: 1, alpha: 0.08 });
    const step = 10;
    for (let x = step; x < w + h; x += step) {
      g.moveTo(Math.max(0, x), 0)
       .lineTo(Math.max(0, x - h), Math.min(h, x));
      g.stroke();
    }
    return;
  }

  // Default effect — diamond/sparkle pattern
  const spacing = 16;
  for (let x = ACCENT_BAR_WIDTH + spacing; x < w - 4; x += spacing) {
    for (let y = spacing / 2; y < h - 4; y += spacing) {
      const s = 2;
      g.moveTo(x, y - s).lineTo(x + s, y).lineTo(x, y + s).lineTo(x - s, y).closePath();
      g.fill({ color: 0xffffff, alpha: 0.06 });
    }
  }
}

// ============================================================
// COMPONENT
// ============================================================

export const CanvasTimelineItem = React.memo(function CanvasTimelineItem({
  item,
  totalDuration,
  totalWidth,
  trackHeight,
  isSelected,
  isMuted = false,
  isLocked = false,
  trackHidden = false,
  trackMuted = false,
  splittingEnabled = false,
  selectedItemIds = [],
  onSelect,
  onSelectionChange,
  onDragStart,
  onContextMenu,
  onTransitionClick,
}: CanvasTimelineItemProps) {
  const itemHeight = TIMELINE_CONSTANTS.TRACK_ITEM_HEIGHT;
  const [isHovering, setIsHovering] = useState(false);

  // Compute pixel-domain rectangle from time-domain item data
  const rect = useMemo(
    () => getItemRect(item, totalDuration, totalWidth, trackHeight, itemHeight),
    [item.start, item.end, totalDuration, totalWidth, trackHeight, itemHeight],
  );



  // Resolve colors
  const baseColor = useMemo(() => hexToPixiColor(item.color || '#3b82f6'), [item.color]);
  const fillColor = useMemo(
    () => (isHovering ? lightenPixiColor(baseColor, HOVER_LIGHTEN) : baseColor),
    [baseColor, isHovering],
  );
  const fillColorBottom = useMemo(
    () => darkenPixiColor(fillColor, 0.25),
    [fillColor],
  );
  const accentColor = useMemo(
    () => lightenPixiColor(baseColor, 0.2),
    [baseColor],
  );
  const borderColor = useMemo(
    () => darkenPixiColor(baseColor, 0.6),
    [baseColor],
  );

  // Link group styling
  const linkGroupColor = useMemo(() => getLinkGroupColor(item.linkGroup), [item.linkGroup]);

  // Badge flags (derived from item data)
  const hasEffects = !!item.data?.effects?.length;
  const hasTransitions = !!item.inTransition || !!item.outTransition;
  const isItemMuted = !!item.data?.muted;

  // Truncated label based on available width
  const displayLabel = useMemo(
    () =>
      rect.width >= MIN_WIDTH_FOR_LABEL
        ? truncateLabel(item.label || item.type || '', rect.width - LABEL_PADDING * 2, LABEL_FONT_SIZE)
        : '',
    [rect.width, item.label, item.type],
  );

  // Alpha based on muted/locked/hidden state
  const alpha = (trackHidden || isMuted) ? MUTED_ALPHA : isLocked ? LOCKED_ALPHA : 1;

  // Whether resize handles should be visible
  const showHandles = (isHovering || isSelected) && !splittingEnabled && !isLocked;

  // ========================================
  // DRAW CALLBACKS
  // ========================================

  /**
   * Main item body — rounded rectangle with vertical gradient, left accent bar,
   * and type icon. This is the core rendering call that replaces ~1,250 DOM nodes.
   *
   * Visual hierarchy (top-to-bottom):
   * 1. Gradient fill (lighter top → darker bottom) for depth
   * 2. Left accent bar (3px bright bar for instant type identification)
   * 3. Type icon (top-left glyph: film, note, T, image, star)
   * 4. Border stroke
   */
  const drawBody = useCallback(
    (g: Graphics) => {
      g.clear();
      const w = rect.width;
      const h = rect.height;

      // --- Gradient fill: 2 horizontal bands (top lighter, bottom darker) ---
      const midY = Math.floor(h * 0.45);
      // Top band
      g.roundRect(0, 0, w, h, CORNER_RADIUS);
      g.fill({ color: fillColor, alpha: 0.88 });
      // Bottom band (overlaid, clipped to bottom half)
      g.rect(0, midY, w, h - midY);
      g.fill({ color: fillColorBottom, alpha: 0.45 });

      // --- Left accent bar ---
      g.roundRect(0, 0, ACCENT_BAR_WIDTH, h, CORNER_RADIUS);
      g.fill({ color: accentColor, alpha: 0.95 });

      // --- Type icon badge (top-left, after accent bar) ---
      if (w >= MIN_WIDTH_FOR_TYPE_ICON) {
        const ix = ACCENT_BAR_WIDTH + TYPE_ICON_MARGIN;
        const iy = TYPE_ICON_MARGIN;
        const ic = TYPE_ICON_SIZE / 2;
        const cx = ix + ic;
        const cy = iy + ic;
        const s = 4; // icon half-size

        g.setStrokeStyle({ color: 0xffffff, width: 1.4, alpha: 0.75 });

        switch (item.type) {
          case 'video': // film frame ▶
            g.roundRect(ix + 2, iy + 2, TYPE_ICON_SIZE - 4, TYPE_ICON_SIZE - 4, 2);
            g.stroke({ color: 0xffffff, width: 1.2, alpha: 0.7 });
            // Play triangle
            g.moveTo(cx - 1, cy - s + 2).lineTo(cx + s - 2, cy).lineTo(cx - 1, cy + s - 2).closePath();
            g.fill({ color: 0xffffff, alpha: 0.6 });
            break;
          case 'audio': // music note ♪
            g.circle(cx - 1, cy + 2, 2.5);
            g.fill({ color: 0xffffff, alpha: 0.7 });
            g.moveTo(cx + 1.5, cy + 2).lineTo(cx + 1.5, cy - s + 1);
            g.stroke({ color: 0xffffff, width: 1.5, alpha: 0.7 });
            g.moveTo(cx + 1.5, cy - s + 1).lineTo(cx + s, cy - s + 2);
            g.stroke({ color: 0xffffff, width: 1.5, alpha: 0.7 });
            break;
          case 'text': // letter T
          case 'caption':
            g.moveTo(cx - s + 1, cy - s + 2).lineTo(cx + s - 1, cy - s + 2);
            g.stroke({ color: 0xffffff, width: 1.8, alpha: 0.8 });
            g.moveTo(cx, cy - s + 2).lineTo(cx, cy + s - 1);
            g.stroke({ color: 0xffffff, width: 1.8, alpha: 0.8 });
            break;
          case 'image': // frame corners
          case 'sticker':
            g.roundRect(ix + 3, iy + 3, TYPE_ICON_SIZE - 6, TYPE_ICON_SIZE - 6, 1.5);
            g.stroke({ color: 0xffffff, width: 1.2, alpha: 0.65 });
            // Mountain/sun hint
            g.circle(cx + 1, cy - 1, 1.5);
            g.fill({ color: 0xffffff, alpha: 0.55 });
            g.moveTo(ix + 4, cy + 3).lineTo(cx, cy - 1).lineTo(ix + TYPE_ICON_SIZE - 4, cy + 3);
            g.stroke({ color: 0xffffff, width: 1, alpha: 0.5 });
            break;
          case 'shape':
          case 'blur':
            // Diamond shape
            g.moveTo(cx, cy - s).lineTo(cx + s, cy).lineTo(cx, cy + s).lineTo(cx - s, cy).closePath();
            g.stroke({ color: 0xffffff, width: 1.2, alpha: 0.65 });
            break;
          default: // motion-graphics, effect, etc — sparkle ✦
            g.moveTo(cx, cy - s).lineTo(cx + 1.5, cy - 1.5).lineTo(cx + s, cy)
             .lineTo(cx + 1.5, cy + 1.5).lineTo(cx, cy + s).lineTo(cx - 1.5, cy + 1.5)
             .lineTo(cx - s, cy).lineTo(cx - 1.5, cy - 1.5).closePath();
            g.fill({ color: 0xffffff, alpha: 0.6 });
            break;
        }
      }

      // --- Border stroke ---
      g.roundRect(0, 0, w, h, CORNER_RADIUS);
      g.stroke({ color: borderColor, width: 1, alpha: 0.5 });
    },
    [rect.width, rect.height, fillColor, fillColorBottom, accentColor, borderColor, item.type],
  );

  /**
   * Selection glow — colored border drawn on top when item is selected.
   * Uses link group color when available, otherwise default blue.
   */
  const drawSelection = useCallback(
    (g: Graphics) => {
      g.clear();
      if (!isSelected && !linkGroupColor) return;

      const selColor = linkGroupColor?.bg ?? SELECTION_COLOR;
      const glowAlpha = linkGroupColor ? 0.35 : SELECTION_GLOW_ALPHA;

      if (isSelected) {
        // Outer glow
        g.roundRect(
          -SELECTION_BORDER_WIDTH,
          -SELECTION_BORDER_WIDTH,
          rect.width + SELECTION_BORDER_WIDTH * 2,
          rect.height + SELECTION_BORDER_WIDTH * 2,
          CORNER_RADIUS + 1,
        );
        g.fill({ color: selColor, alpha: glowAlpha });

        // Inner selection border
        g.roundRect(0, 0, rect.width, rect.height, CORNER_RADIUS);
        g.stroke({ color: selColor, width: SELECTION_BORDER_WIDTH, alpha: 0.9 });
      } else if (linkGroupColor) {
        // Unselected but linked — subtle colored border
        g.roundRect(0, 0, rect.width, rect.height, CORNER_RADIUS);
        g.stroke({ color: linkGroupColor.bg, width: 1, alpha: 0.3 });
      }
    },
    [isSelected, linkGroupColor, rect.width, rect.height],
  );

  /**
   * Resize handles — gripper lines at left/right edges.
   * Only drawn when item is hovered or selected.
   */
  const drawResizeHandles = useCallback(
    (g: Graphics) => {
      g.clear();
      if (!showHandles || rect.width < RESIZE_HANDLE_VISUAL_WIDTH * 3) return;

      const handleH = rect.height;
      const gripperH = 18;
      const gripperY = (handleH - gripperH) / 2;
      const gripperW = 2;
      const gripperGap = 4;

      // Left handle background
      g.roundRect(0, 0, RESIZE_HANDLE_VISUAL_WIDTH, handleH, CORNER_RADIUS);
      g.fill({ color: 0x4b5563, alpha: 0.4 }); // gray-600/40

      // Left gripper lines
      const leftCenterX = RESIZE_HANDLE_VISUAL_WIDTH / 2;
      g.roundRect(leftCenterX - gripperGap / 2 - gripperW, gripperY, gripperW, gripperH, 1);
      g.fill({ color: 0xffffff, alpha: 0.9 });
      g.roundRect(leftCenterX + gripperGap / 2, gripperY, gripperW, gripperH, 1);
      g.fill({ color: 0xffffff, alpha: 0.9 });

      // Right handle background
      const rightX = rect.width - RESIZE_HANDLE_VISUAL_WIDTH;
      g.roundRect(rightX, 0, RESIZE_HANDLE_VISUAL_WIDTH, handleH, CORNER_RADIUS);
      g.fill({ color: 0x4b5563, alpha: 0.4 });

      // Right gripper lines
      const rightCenterX = rightX + RESIZE_HANDLE_VISUAL_WIDTH / 2;
      g.roundRect(rightCenterX - gripperGap / 2 - gripperW, gripperY, gripperW, gripperH, 1);
      g.fill({ color: 0xffffff, alpha: 0.9 });
      g.roundRect(rightCenterX + gripperGap / 2, gripperY, gripperW, gripperH, 1);
      g.fill({ color: 0xffffff, alpha: 0.9 });
    },
    [showHandles, rect.width, rect.height],
  );

  /**
   * Status badges — small colored squares with icon glyphs.
   * Right side: effects, transitions, muted, hidden, track-muted, locked
   * Left side: link group badge
   */
  const drawBadges = useCallback(
    (g: Graphics) => {
      g.clear();
      if (rect.width < MIN_WIDTH_FOR_BADGES) return;

      // --- Right-side badges ---
      const rightBadges: { color: number; type: string }[] = [];
      if (hasEffects)   rightBadges.push({ color: BADGE_COLORS.effects, type: 'effects' });
      if (hasTransitions) rightBadges.push({ color: BADGE_COLORS.transitions, type: 'transitions' });
      if (isItemMuted)  rightBadges.push({ color: BADGE_COLORS.muted, type: 'muted' });
      if (trackHidden)  rightBadges.push({ color: BADGE_COLORS.hidden, type: 'hidden' });
      if (trackMuted && !isItemMuted) rightBadges.push({ color: BADGE_COLORS.trackMuted, type: 'trackMuted' });
      if (isLocked)     rightBadges.push({ color: BADGE_COLORS.locked, type: 'locked' });

      let rx = rect.width - BADGE_MARGIN;
      for (const badge of rightBadges) {
        rx -= BADGE_SIZE;
        const by = BADGE_MARGIN;
        g.roundRect(rx, by, BADGE_SIZE, BADGE_SIZE, BADGE_CORNER);
        g.fill({ color: badge.color, alpha: 0.9 });
        drawBadgeIcon(g, rx, by, badge.type);
        rx -= BADGE_GAP;
      }

      // --- Left-side badge: link group ---
      if (linkGroupColor) {
        const lx = BADGE_MARGIN;
        const ly = BADGE_MARGIN;
        g.roundRect(lx, ly, BADGE_SIZE, BADGE_SIZE, BADGE_CORNER);
        g.fill({ color: linkGroupColor.bg, alpha: 0.9 });
        drawBadgeIcon(g, lx, ly, 'link');
      }
    },
    [rect.width, hasEffects, hasTransitions, isItemMuted, trackHidden, trackMuted, isLocked, linkGroupColor],
  );

  /**
   * Visual overlays — transition gradients, fade triangles, keyframe diamonds.
   * These are visual-only indicators (no interactive resize).
   */
  const drawOverlays = useCallback(
    (g: Graphics) => {
      g.clear();
      const duration = item.end - item.start;
      if (duration <= 0 || rect.width < 20) return;

      const pxPerSec = rect.width / duration;

      // --- Transition indicators ---
      // Transitions are now rendered as separate CanvasTransitionItem elements
      // by the track component. No in-clip rendering needed.

      // --- Fade overlays ---
      const fadeIn = item.data?.styles?.fadeIn ?? 0;
      const fadeOut = item.data?.styles?.fadeOut ?? 0;

      if (fadeIn > 0) {
        const fadeW = Math.max(4, Math.min(fadeIn * pxPerSec, rect.width * 0.5));
        // Triangle from bottom-left to top of fade width
        g.moveTo(0, rect.height).lineTo(fadeW, 0).lineTo(fadeW, rect.height).closePath();
        g.fill({ color: 0x000000, alpha: 0.2 });
        g.moveTo(0, rect.height).lineTo(fadeW, 0);
        g.stroke({ color: 0xffffff, width: 1, alpha: 0.4 });
      }

      if (fadeOut > 0) {
        const fadeW = Math.max(4, Math.min(fadeOut * pxPerSec, rect.width * 0.5));
        const startX = rect.width - fadeW;
        g.moveTo(startX, 0).lineTo(rect.width, rect.height).lineTo(startX, rect.height).closePath();
        g.fill({ color: 0x000000, alpha: 0.2 });
        g.moveTo(startX, 0).lineTo(rect.width, rect.height);
        g.stroke({ color: 0xffffff, width: 1, alpha: 0.4 });
      }

      // --- Keyframe diamonds ---
      const keyframes = item.data?.keyframes;
      if (keyframes && Array.isArray(keyframes)) {
        const diamondSize = 3;
        const bottomY = rect.height - 4;
        for (const propKf of keyframes) {
          if (!propKf.keyframes || !Array.isArray(propKf.keyframes)) continue;
          for (const kf of propKf.keyframes) {
            const time = kf.time ?? kf.frame;
            if (time == null) continue;
            const x = (time / duration) * rect.width;
            if (x < 2 || x > rect.width - 2) continue;
            // Diamond shape
            g.moveTo(x, bottomY - diamondSize)
             .lineTo(x + diamondSize, bottomY)
             .lineTo(x, bottomY + diamondSize)
             .lineTo(x - diamondSize, bottomY)
             .closePath();
            g.fill({ color: 0xfbbf24, alpha: 0.9 }); // Amber-400
          }
        }
      }
    },
    [item.start, item.end, item.data?.styles?.fadeIn, item.data?.styles?.fadeOut, item.data?.keyframes, rect.width, rect.height],
  );

  // ========================================
  // EVENT HANDLERS
  // ========================================

  const handlePointerDown = useCallback(
    (e: any) => {
      // Prevent event from bubbling to empty track area handler
      e.stopPropagation?.();

      const nativeEvent = e.nativeEvent || e.data?.originalEvent;
      const button = nativeEvent?.button ?? 0;
      const shiftKey = nativeEvent?.shiftKey ?? false;

      // Right-click → context menu
      if (button === 2) {
        const screenX = nativeEvent?.clientX ?? e.globalX ?? 0;
        const screenY = nativeEvent?.clientY ?? e.globalY ?? 0;
        onContextMenu?.({ item, screenX, screenY });
        return;
      }

      // Only handle left mouse button for drag
      if (button !== 0) return;

      // Don't allow interactions on locked tracks
      if (isLocked) return;

      // Splitting mode: don't handle drag
      if (splittingEnabled) return;

      // Get local click position for action detection
      const localPos = e.data?.getLocalPosition?.(e.currentTarget);
      const localX = localPos?.x ?? 0;

      // Shift+click → multi-select
      if (shiftKey && onSelectionChange) {
        onSelectionChange(item.id, true);
        return;
      }

      // Select the item if not already selected (preserves multi-selection for drag)
      if (!isSelected) {
        if (onSelectionChange) {
          onSelectionChange(item.id, false);
        } else {
          onSelect?.(item.id);
        }
      }

      // If no drag start handler, we're done (selection only)
      if (!onDragStart) return;

      // Determine action from click position within the item
      // (localPos and localX already computed above for transition detection)
      const action = getActionFromPosition(localX, rect.width);

      // Get screen coordinates for the drag system
      const clientX = nativeEvent?.clientX ?? e.globalX ?? 0;
      const clientY = nativeEvent?.clientY ?? e.globalY ?? 0;

      onDragStart(item, clientX, clientY, action, selectedItemIds);
    },
    [
      item,
      rect.width,
      isSelected,
      isLocked,
      splittingEnabled,
      selectedItemIds,
      onSelect,
      onSelectionChange,
      onDragStart,
      onContextMenu,
    ],
  );

  /** Update cursor on hover to reflect resize zones */
  const handlePointerMove = useCallback(
    (e: any) => {
      if (isLocked) return;
      const localPos = e.data?.getLocalPosition?.(e.currentTarget);
      const localX = localPos?.x ?? 0;
      const cursor = getCursorFromPosition(localX, rect.width, isLocked);

      // Update cursor on the canvas element
      const target = e.currentTarget;
      if (target && target.cursor !== cursor) {
        target.cursor = cursor;
      }
    },
    [rect.width, isLocked],
  );

  const handlePointerEnter = useCallback(() => {
    setIsHovering(true);
  }, []);

  const handlePointerLeave = useCallback(() => {
    setIsHovering(false);
  }, []);

  /** Prevent default browser context menu on right-click */
  const handleRightDown = useCallback(
    (e: any) => {
      e.stopPropagation?.();

      const nativeEvent = e.nativeEvent || e.data?.originalEvent;
      const screenX = nativeEvent?.clientX ?? e.globalX ?? 0;
      const screenY = nativeEvent?.clientY ?? e.globalY ?? 0;

      // Select the item on right-click if not already selected
      if (!isSelected) {
        if (onSelectionChange) {
          onSelectionChange(item.id, false);
        } else {
          onSelect?.(item.id);
        }
      }

      onContextMenu?.({ item, screenX, screenY });
    },
    [item, isSelected, onSelect, onSelectionChange, onContextMenu],
  );

  // ========================================
  // EXTRACTED DRAW CALLBACKS (previously inline closures)
  // ========================================

  // Audio waveform visualization — lightweight sine bars
  const drawAudioWaveform = useCallback((g: Graphics) => {
    g.clear();
    if (rect.width < 20) return;
    const barW = 2;
    const gap = 3;
    const maxH = rect.height * 0.4;
    const baseY = rect.height / 2;
    for (let x = ACCENT_BAR_WIDTH + 8; x < rect.width - 4; x += barW + gap) {
      const h = maxH * (0.3 + 0.7 * Math.abs(Math.sin(x * 0.15)));
      g.rect(x, baseY - h / 2, barW, h);
      g.fill({ color: 0xffffff, alpha: 0.15 });
    }
  }, [rect.width, rect.height]);

  // Effect/shape clip background pattern
  const drawEffectPatternCb = useCallback((g: Graphics) => {
    g.clear();
    drawEffectPattern(g, rect.width, rect.height, item.label);
  }, [rect.width, rect.height, item.label]);

  // Label backdrop — dark rounded rect behind text for readability
  const labelLayout = useMemo(() => {
    if (!displayLabel) return null;
    const labelX = ACCENT_BAR_WIDTH + TYPE_ICON_SIZE + TYPE_ICON_MARGIN + LABEL_PADDING + (linkGroupColor ? BADGE_SIZE + BADGE_MARGIN + 2 : 0);
    const labelY = (rect.height - LABEL_FONT_SIZE) / 2;
    const estimatedTextWidth = Math.min(displayLabel.length * 6, rect.width - labelX - 4);
    return { labelX, labelY, estimatedTextWidth };
  }, [displayLabel, rect.height, rect.width, linkGroupColor]);

  const drawLabelBackdrop = useCallback((g: Graphics) => {
    g.clear();
    if (!labelLayout) return;
    const backdropPadX = 3;
    const backdropPadY = 2;
    g.roundRect(
      labelLayout.labelX - backdropPadX,
      labelLayout.labelY - backdropPadY,
      labelLayout.estimatedTextWidth + backdropPadX * 2,
      LABEL_FONT_SIZE + backdropPadY * 2,
      3,
    );
    g.fill({ color: 0x000000, alpha: 0.4 });
  }, [labelLayout]);

  // Don't render items that are too narrow to see (< 1px)
  if (rect.width < 1) return null;

  // Explicit hit area required because interactiveChildren=false means
  // PixiJS won't traverse children for hit testing. Without this,
  // clicks pass through items to the timeline background.
  const hitArea = useMemo(
    () => new Rectangle(0, 0, rect.width, rect.height),
    [rect.width, rect.height],
  );

  return (
    <pixiContainer
      x={rect.x}
      y={rect.y}
      alpha={alpha}
      eventMode="static"
      cursor={isLocked ? 'not-allowed' : 'pointer'}
      cullable={true}
      interactiveChildren={false}
      hitArea={hitArea}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onRightDown={handleRightDown}
    >
      {/* Selection glow / link group border (rendered behind body) */}
      {(isSelected || linkGroupColor) && <pixiGraphics draw={drawSelection} />}

      {/* Main item body */}
      <pixiGraphics draw={drawBody} />

      {/* Audio faux waveform — lightweight sine-wave bars for visual identification */}
      {item.type === 'audio' && (
        <pixiGraphics draw={drawAudioWaveform} />
      )}

      {/* Effect/shape clip background pattern */}
      {(item.type === 'shape' || item.type === 'effect') && (
        <pixiGraphics draw={drawEffectPatternCb} />
      )}

      {/* Transition, fade, keyframe overlays */}
      <pixiGraphics draw={drawOverlays} />

      {/* Resize handles (drawn on top of body, behind label) */}
      {showHandles && <pixiGraphics draw={drawResizeHandles} />}

      {/* Status badges */}
      <pixiGraphics draw={drawBadges} />

      {/* Label text with dark backdrop for readability over waveforms/thumbnails */}
      {displayLabel && labelLayout && (
        <>
          <pixiGraphics draw={drawLabelBackdrop} />
          <pixiText
            text={displayLabel}
            style={getLabelStyle(LABEL_FONT_SIZE)}
            x={labelLayout.labelX}
            y={labelLayout.labelY}
            alpha={0.95}
          />
        </>
      )}
    </pixiContainer>
  );
});
