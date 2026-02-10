/**
 * Drag Manager — Stub module for advanced timeline drag operations.
 * Drag operations are now handled via UnifiedDragState in the store.
 */

export interface TransitionDragParams {
  action: 'move' | 'resize-left' | 'resize-right';
  transitionId: string;
  startX: number;
  startY: number;
  originalTransition: {
    startTime: number;
    endTime: number;
  };
}

export interface TransitionDragState extends TransitionDragParams {
  currentX: number;
  currentY: number;
  previewState: {
    startTime: number;
    endTime: number;
  };
}

export interface DragManagerAPI {
  isDragging: boolean;
  dragType: string | null;
  startDrag: (type: string, data?: any) => void;
  endDrag: () => void;
  // Transition drag operations (used by transition-overlay.tsx)
  transitionDrag: TransitionDragState | null;
  canStartDrag: () => boolean;
  startTransitionDrag: (params: TransitionDragParams) => boolean;
  updateTransitionDrag: (update: { currentX: number; currentY: number; previewState: { startTime: number; endTime: number } }) => void;
  endTransitionDrag: () => TransitionDragState | null;
}

/**
 * Creates a no-op drag manager.
 * Drag operations now use the unified drag state in the store.
 */
export function createDragManager(): DragManagerAPI {
  return {
    isDragging: false,
    dragType: null,
    startDrag: () => {},
    endDrag: () => {},
    transitionDrag: null,
    canStartDrag: () => true,
    startTransitionDrag: () => false,
    updateTransitionDrag: () => {},
    endTransitionDrag: () => null,
  };
}

/**
 * Stub hooks for backwards compatibility.
 * Drag state is now managed via UnifiedDragState in the store.
 */
export function useDragManager(): DragManagerAPI {
  return createDragManager();
}

export function useIsDragActive(_type?: string): boolean {
  return false;
}

