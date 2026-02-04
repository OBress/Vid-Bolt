// hooks/use-overlay-selection.tsx
import { useCallback } from "react";
import { useEditorSidebar } from "../contexts/sidebar-context";
import { useVideoEditorStore } from "../stores/video-editor-store";
import { Overlay, OverlayType } from "../types";

/**
 * A custom hook that manages overlay selection in the editor.
 * Uses the unified VideoEditorStore for selection state.
 *
 * @returns {Object} An object containing:
 *   - handleOverlaySelect: A callback function to handle overlay selection and update the sidebar panel
 *
 * @example
 * const { handleOverlaySelect } = useOverlaySelection();
 * // Later in your component:
 * <OverlayComponent onClick={() => handleOverlaySelect(overlay)} />
 */
export const useOverlaySelection = () => {
  // Try to get sidebar context for panel management
  let setActivePanel: ((panel: OverlayType) => void) | null = null;
  let setIsOpen: ((open: boolean) => void) | null = null;

  try {
    const sidebarContext = useEditorSidebar();
    setActivePanel = sidebarContext.setActivePanel;
    setIsOpen = sidebarContext.setIsOpen;
  } catch (error) {
    // SidebarContext not available (e.g., in remotion bundle)
    // This is expected in rendering contexts
  }

  const handleOverlaySelect = useCallback(
    (overlay: Overlay) => {
      // Update selection in the unified store
      // Get fresh state from store to find matching clip
      try {
        const store = useVideoEditorStore.getState();
        const clips = store.clips || [];
        const selectClips = store.selectClips;
        
        // Find the clip that corresponds to this numeric overlay ID
        // The adapter converts clip IDs like "clip-1768620046955-qcri1o2" to numeric "1768620046955"
        const matchingClip = clips.find(clip => {
          const numericId = parseInt(clip.id.replace(/\D/g, ''), 10) || 0;
          return numericId === overlay.id;
        });
        
        if (matchingClip) {
          selectClips([matchingClip.id]);
        } else {
          console.warn('[useOverlaySelection] No clip found for overlay ID:', overlay.id);
        }
      } catch (error) {
        // Store not available (e.g., in remotion bundle for SSR)
        console.warn('[useOverlaySelection] Store not available:', error);
      }

      // Only perform sidebar logic if we're in an interactive context
      if (setActivePanel && setIsOpen) {
        // Set the appropriate sidebar panel based on overlay type
        switch (overlay.type) {
          case OverlayType.TEXT:
            setActivePanel(OverlayType.TEXT);
            break;
          case OverlayType.VIDEO:
            setActivePanel(OverlayType.VIDEO);
            break;
          case OverlayType.SOUND:
            setActivePanel(OverlayType.SOUND);
            break;
          case OverlayType.STICKER:
            setActivePanel(OverlayType.STICKER);
            break;
          case OverlayType.IMAGE:
            setActivePanel(OverlayType.IMAGE);
            break;
          case OverlayType.CAPTION:
            setActivePanel(OverlayType.CAPTION);
            break;
        }
        
        // Open the sidebar to show the selected overlay's panel
        setIsOpen(true);
      }
    },
    [setActivePanel, setIsOpen]
  );

  return { handleOverlaySelect };
};
