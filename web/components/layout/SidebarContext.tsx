"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";

const MOBILE_BREAKPOINT = 768; // md breakpoint

interface SidebarContextType {
  isCollapsed: boolean;
  isMobile: boolean;
  collapse: () => void;
  expand: () => void;
  toggle: () => void;
}

const SidebarContext = createContext<SidebarContextType | null>(null);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Auto-collapse on mobile, track breakpoint changes
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(e.matches);
      if (e.matches) setIsCollapsed(true);
    };
    handleChange(mql);
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);

  const collapse = useCallback(() => setIsCollapsed(true), []);
  const expand = useCallback(() => setIsCollapsed(false), []);
  const toggle = useCallback(() => setIsCollapsed((prev) => !prev), []);

  return (
    <SidebarContext.Provider value={{ isCollapsed, isMobile, collapse, expand, toggle }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within SidebarProvider");
  }
  return context;
}
