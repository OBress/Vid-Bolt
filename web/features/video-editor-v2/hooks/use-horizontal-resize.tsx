import { useState, useCallback, useEffect, useRef } from 'react';

interface UseHorizontalResizeOptions {
  /** Initial width of the panel in pixels */
  initialWidth?: number;
  /** Minimum width of the panel */
  minWidth?: number;
  /** Maximum width of the panel */
  maxWidth?: number;
  /** Local storage key to persist the width */
  storageKey?: string;
}

interface UseHorizontalResizeReturn {
  /** Current width of the panel */
  width: number;
  /** Whether the user is currently dragging the resize handle */
  isResizing: boolean;
  /** Handler for mouse down on the resize handle */
  handleMouseDown: (e: React.MouseEvent) => void;
  /** Handler for touch start on the resize handle */
  handleTouchStart: (e: React.TouchEvent) => void;
  /** Reset the width to initial value */
  resetWidth: () => void;
  /** Programmatically set the width (will be clamped to min/max) */
  setWidth: (width: number) => void;
}

/**
 * Custom hook for handling horizontal resize of a panel
 * Allows users to drag a divider to adjust the width
 */
export const useHorizontalResize = (options: UseHorizontalResizeOptions = {}): UseHorizontalResizeReturn => {
  const {
    initialWidth = 400,
    minWidth = 250,
    maxWidth = 800,
    storageKey = 'editor-panel-width',
  } = options;

  // Try to load saved width from localStorage
  const getSavedWidth = useCallback(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const width = parseInt(saved, 10);
          if (!isNaN(width) && width >= minWidth) {
            return Math.max(minWidth, Math.min(width, maxWidth));
          }
        }
      } catch (e) {
        console.warn('Failed to load saved width from localStorage:', e);
      }
    }
    return Math.max(minWidth, Math.min(maxWidth, initialWidth));
  }, [initialWidth, minWidth, maxWidth, storageKey]);

  const [width, setWidthState] = useState(getSavedWidth);
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  // Save width to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(storageKey, width.toString());
      } catch (e) {
        console.warn('Failed to save width to localStorage:', e);
      }
    }
  }, [width, storageKey]);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing) return;

      // Calculate the new width based on mouse movement
      const deltaX = e.clientX - startXRef.current;
      const newWidth = startWidthRef.current + deltaX;

      // Clamp the width between min and max
      const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

      setWidthState(clampedWidth);
    },
    [isResizing, minWidth, maxWidth]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!isResizing) return;

      const touch = e.touches[0];
      if (!touch) return;

      // Calculate the new width based on touch movement
      const deltaX = touch.clientX - startXRef.current;
      const newWidth = startWidthRef.current + deltaX;

      // Clamp the width between min and max
      const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

      setWidthState(clampedWidth);
    },
    [isResizing, minWidth, maxWidth]
  );

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  const handleTouchEnd = useCallback(() => {
    setIsResizing(false);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = width;
  }, [width]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    if (!touch) return;
    
    setIsResizing(true);
    startXRef.current = touch.clientX;
    startWidthRef.current = width;
  }, [width]);

  const resetWidth = useCallback(() => {
    setWidthState(initialWidth);
  }, [initialWidth]);

  const setWidth = useCallback((newWidth: number) => {
    const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
    setWidthState(clampedWidth);
  }, [minWidth, maxWidth]);

  // Add and remove mouse and touch event listeners
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleTouchEnd);

      // Prevent text selection while dragging
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'ew-resize';

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd]);

  return {
    width,
    isResizing,
    handleMouseDown,
    handleTouchStart,
    resetWidth,
    setWidth,
  };
};
