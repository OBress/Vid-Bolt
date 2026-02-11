import { useState, useCallback, useRef, useEffect } from 'react';
import { calculateMousePosition } from '../utils';

/**
 * Custom hook to handle timeline mouse interactions
 * Uses CSS custom properties for ghost marker positioning to avoid React re-renders.
 * 
 * PERFORMANCE: Ghost marker updates are synchronous (no rAF) because:
 * 1. Setting a CSS custom property is near-zero cost
 * 2. rAF adds ~16ms latency causing the marker to trail the cursor
 * 3. The container rect is cached and invalidated on resize to avoid forced reflows
 */
export const useTimelineInteractions = (
  timelineRef: React.RefObject<HTMLDivElement | null>,
  zoomScale: number = 1
) => {
  // Keep only essential React state that actually needs to trigger re-renders
  const [isDragging, setIsDragging] = useState(false);
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
  
  const lastPositionRef = useRef<number | null>(null);
  const isGhostMarkerVisibleRef = useRef<boolean>(false);
  
  // Cache the scroll container rect to avoid getBoundingClientRect() on every mousemove
  // This prevents forced reflows — the rect only changes on resize/zoom
  const cachedRectRef = useRef<DOMRect | null>(null);
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const rootContainerRef = useRef<HTMLElement | null>(null);

  // Invalidate cached rect when zoom changes (layout changes)
  useEffect(() => {
    cachedRectRef.current = null;
  }, [zoomScale]);

  // Set up ResizeObserver to invalidate cached rect when container resizes
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      cachedRectRef.current = null;
    });

    // Observe the scroll container if available
    const scrollContainer = document.querySelector('.timeline-tracks-scroll-container') as HTMLElement;
    if (scrollContainer) {
      scrollContainerRef.current = scrollContainer;
      observer.observe(scrollContainer);
    }

    return () => observer.disconnect();
  }, []);

  // Handle mouse movement using CSS custom properties (no React re-renders!)
  // SYNCHRONOUS — no rAF delay for zero-latency cursor tracking
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging) return;
    
    const element = timelineRef.current;
    if (!element) return;

    // Lazily resolve and cache container references
    if (!scrollContainerRef.current) {
      scrollContainerRef.current = document.querySelector('.timeline-tracks-scroll-container') as HTMLElement;
    }
    if (!rootContainerRef.current) {
      rootContainerRef.current = element.parentElement?.parentElement ?? null;
    }
    
    const scrollContainer = scrollContainerRef.current;
    const rootContainer = rootContainerRef.current;
    if (!scrollContainer || !rootContainer) return;

    // Use cached rect — only call getBoundingClientRect() when cache is invalidated
    if (!cachedRectRef.current) {
      cachedRectRef.current = scrollContainer.getBoundingClientRect();
    }
    const rect = cachedRectRef.current;
    
    const x = e.clientX - rect.left;
    const position = Math.max(0, Math.min(100, (x / rect.width) * 100));
    
    // Calculate zoom-aware threshold for smoother tracking at high zoom levels
    const threshold = Math.max(0.001, 0.1 / zoomScale);
    
    // Only update if position has changed significantly
    if (lastPositionRef.current === null || Math.abs(position - lastPositionRef.current) > threshold) {
      const precision = zoomScale > 10 ? 6 : zoomScale > 5 ? 4 : 2;
      
      // Update CSS custom property directly — NO REACT RE-RENDER!
      rootContainer.style.setProperty('--ghost-marker-position', `${position.toFixed(precision)}%`);
      rootContainer.style.setProperty('--ghost-marker-visible', '1');
      
      lastPositionRef.current = position;
      isGhostMarkerVisibleRef.current = true;
    }
  }, [isDragging, timelineRef, zoomScale]);

  // Handle mouse leave to hide ghost marker
  const handleMouseLeave = useCallback(() => {
    // Hide ghost marker using CSS custom property - NO REACT RE-RENDER!
    if (rootContainerRef.current && isGhostMarkerVisibleRef.current) {
      rootContainerRef.current.style.setProperty('--ghost-marker-visible', '0');
      isGhostMarkerVisibleRef.current = false;
    }
    
    lastPositionRef.current = null;
  }, []);

  return {
    ghostMarkerPosition: null, // Legacy prop for backward compatibility - always null now
    isDragging,
    isContextMenuOpen,
    setIsDragging,
    setIsContextMenuOpen,
    handleMouseMove,
    handleMouseLeave,
  };
}; 