"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

interface FocusModeContextType {
  /** Whether focus mode is active (hides sidebar, topbar, etc.) */
  isFocusMode: boolean;
  /** Enter focus mode — unmounts chrome components for performance */
  enterFocusMode: () => void;
  /** Exit focus mode — restores full layout */
  exitFocusMode: () => void;
  /** Toggle focus mode */
  toggleFocusMode: () => void;
}

const FocusModeContext = createContext<FocusModeContextType>({
  isFocusMode: false,
  enterFocusMode: () => {},
  exitFocusMode: () => {},
  toggleFocusMode: () => {},
});

export function FocusModeProvider({ children }: { children: React.ReactNode }) {
  const [isFocusMode, setIsFocusMode] = useState(false);

  const enterFocusMode = useCallback(() => setIsFocusMode(true), []);
  const exitFocusMode = useCallback(() => setIsFocusMode(false), []);
  const toggleFocusMode = useCallback(() => setIsFocusMode((prev) => !prev), []);

  return (
    <FocusModeContext.Provider
      value={{ isFocusMode, enterFocusMode, exitFocusMode, toggleFocusMode }}
    >
      {children}
    </FocusModeContext.Provider>
  );
}

export function useFocusMode() {
  return useContext(FocusModeContext);
}
