"use client";

import { createContext, useContext, useState, useCallback } from "react";

interface SidebarContextType {
  isCollapsed: boolean;
  collapse: () => void;
  expand: () => void;
  toggle: () => void;
}

const SidebarContext = createContext<SidebarContextType | null>(null);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const collapse = useCallback(() => setIsCollapsed(true), []);
  const expand = useCallback(() => setIsCollapsed(false), []);
  const toggle = useCallback(() => setIsCollapsed((prev) => !prev), []);

  return (
    <SidebarContext.Provider value={{ isCollapsed, collapse, expand, toggle }}>
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
