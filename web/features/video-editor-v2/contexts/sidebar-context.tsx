import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from "react";
import { OverlayType } from "../types";

const COLLAPSED_STORAGE_KEY = 'editor-panel-collapsed';

// Define the shape of our context data
type EditorSidebarContextType = {
  activePanel: OverlayType; // Stores the currently active panel name
  setActivePanel: (panel: OverlayType) => void; // Function to update the active panel
  isCollapsed: boolean; // Whether the panel content is collapsed (only icons visible)
  setIsCollapsed: (collapsed: boolean) => void; // Function to toggle collapsed state
  toggleCollapsed: () => void; // Toggle collapsed state
  setIsOpen: (open: boolean) => void; // For backwards compatibility - maps to setIsCollapsed(!open)
};

// Create the context with undefined as initial value
const EditorSidebarContext = createContext<EditorSidebarContextType | undefined>(undefined);

// Custom hook to consume the editor sidebar context
export const useEditorSidebar = () => {
  const context = useContext(EditorSidebarContext);

  if (!context) {
    throw new Error("useEditorSidebar must be used within a SidebarProvider");
  }

  return context;
};

// Provider component that wraps parts of the app that need access to panel state
export const SidebarProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const [activePanel, setActivePanel] = useState<OverlayType>(OverlayType.VIDEO);
  
  // Initialize collapsed state from localStorage
  const [isCollapsed, setIsCollapsedState] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(COLLAPSED_STORAGE_KEY);
      return saved === 'true';
    }
    return false;
  });

  // Persist collapsed state to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(COLLAPSED_STORAGE_KEY, String(isCollapsed));
    }
  }, [isCollapsed]);

  const setIsCollapsed = useCallback((collapsed: boolean) => {
    setIsCollapsedState(collapsed);
  }, []);

  const toggleCollapsed = useCallback(() => {
    setIsCollapsedState(prev => !prev);
  }, []);

  // For backwards compatibility - maps to setIsCollapsed(!open)
  const setIsOpen = useCallback((open: boolean) => {
    setIsCollapsedState(!open);
  }, []);

  // Memoize the context value to prevent unnecessary re-renders of consumers
  const value = useMemo(() => ({
    activePanel,
    setActivePanel,
    isCollapsed,
    setIsCollapsed,
    toggleCollapsed,
    setIsOpen,
  }), [activePanel, isCollapsed, setIsCollapsed, toggleCollapsed, setIsOpen]);

  return (
    <EditorSidebarContext.Provider value={value}>{children}</EditorSidebarContext.Provider>
  );
}; 