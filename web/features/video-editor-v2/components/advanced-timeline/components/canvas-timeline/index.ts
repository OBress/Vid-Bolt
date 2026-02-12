/**
 * Canvas Timeline — barrel export
 *
 * GPU-accelerated timeline rendering using PixiJS + @pixi/react.
 * This replaces the DOM-based track/item rendering while keeping
 * all store logic, hooks, and business logic unchanged.
 */

export { CanvasTimeline } from './canvas-timeline';
export type { CanvasTimelineProps } from './canvas-timeline';

export { CanvasTimelineTrack } from './canvas-timeline-track';
export type { CanvasTimelineTrackProps } from './canvas-timeline-track';

export { CanvasTimelineItem } from './canvas-timeline-item';
export type { CanvasTimelineItemProps, CanvasContextMenuData } from './canvas-timeline-item';

export { CanvasTransitionItem } from './canvas-transition-item';
export type { CanvasTransitionItemProps } from './canvas-transition-item';

export { CanvasContextMenu } from './canvas-context-menu';
export type { CanvasContextMenuProps } from './canvas-context-menu';

export { CanvasPlayhead } from './canvas-playhead';
export type { CanvasPlayheadProps } from './canvas-playhead';

export {
  timeToX,
  xToTime,
  getTrackYOffset,
  getTotalContentHeight,
  getItemRect,
  hexToPixiColor,
  darkenColor,
  truncateLabel,
} from './canvas-timeline-utils';

// Phase 4 — Accessibility & QoL
export { CanvasTimelineAria } from './canvas-timeline-aria';
export type { CanvasTimelineAriaProps } from './canvas-timeline-aria';
export { useCanvasKeyboard } from './use-canvas-keyboard';
export type { UseCanvasKeyboardOptions } from './use-canvas-keyboard';
export { useAutoScroll } from './use-auto-scroll';
export type { UseAutoScrollOptions } from './use-auto-scroll';
export { useClipboard } from './use-clipboard';
export type { UseClipboardOptions } from './use-clipboard';
