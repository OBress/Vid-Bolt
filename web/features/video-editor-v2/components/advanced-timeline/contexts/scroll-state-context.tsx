/**
 * ScrollStateContext - Provides scroll state to timeline children
 *
 * Using React context (not Zustand) because:
 * 1. Scroll state changes very frequently and should be isolated to timeline components
 * 2. We don't want scroll state changes triggering the global store subscription system
 * 3. Only timeline-internal components need this data
 */

import React, { createContext, useContext, useMemo } from 'react';
import { useScrollVelocity, type ScrollVelocityState } from '../hooks/use-scroll-velocity';

interface ScrollStateContextValue extends ScrollVelocityState {}

const ScrollStateContext = createContext<ScrollStateContextValue>({
  isScrolling: false,
  isRapidScrolling: false,
});

interface ScrollStateProviderProps {
  scrollX: number;
  scrollY: number;
  zoomScale: number;
  children: React.ReactNode;
}

/**
 * Provider component that computes scroll velocity and exposes it to children.
 * Place this at the TimelineContent level.
 */
export const ScrollStateProvider: React.FC<ScrollStateProviderProps> = ({
  scrollX,
  scrollY,
  zoomScale,
  children,
}) => {
  const { isScrolling, isRapidScrolling } = useScrollVelocity(scrollX, scrollY, zoomScale);

  const value = useMemo<ScrollStateContextValue>(
    () => ({ isScrolling, isRapidScrolling }),
    [isScrolling, isRapidScrolling],
  );

  return (
    <ScrollStateContext.Provider value={value}>
      {children}
    </ScrollStateContext.Provider>
  );
};

/**
 * Hook to consume scroll state from the nearest ScrollStateProvider.
 * Returns { isScrolling, isRapidScrolling }.
 */
export const useScrollState = (): ScrollStateContextValue => {
  return useContext(ScrollStateContext);
};
