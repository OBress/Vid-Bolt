import { ThemeDropdown } from "../ui/theme-dropdown";
import { CustomTheme } from "../../hooks/use-extended-theme-switcher";
import { useExtendedThemeSwitcher } from "../../hooks/use-extended-theme-switcher";
import { useThemeConfig } from "../../contexts/theme-context";

import RenderControls from "../rendering/render-controls";
import { SaveControls } from "./save-controls";
import { useEditorContext } from "../../contexts/editor-context";
import { useEffect, useState, useCallback } from "react";
import { Maximize, Minimize } from "lucide-react";

export interface EditorHeaderProps {
  /** Project title to display in the header */
  projectTitle?: string;
  /** Array of available custom themes for the theme dropdown */
  availableThemes?: CustomTheme[] | undefined;
  /** Current selected theme */
  selectedTheme?: string | undefined;
  /** Callback when theme is changed */
  onThemeChange?: ((themeId: string) => void) | undefined;
  /** Whether to show the default light/dark themes */
  showDefaultThemes?: boolean | undefined;
  /** Whether to hide the theme toggle dropdown */
  hideThemeToggle?: boolean | undefined;
  /** Default theme to use when theme toggle is hidden */
  defaultTheme?: string | undefined;
}

/**
 * EditorHeader component renders the top navigation bar of the editor interface.
 *
 * @component
 * @description
 * This component provides the main navigation and control elements at the top of the editor:
 * - Project title or theme dropdown (conditionally shown)
 * - Rendering controls for media export
 * - Fullscreen toggle (uses native browser Fullscreen API)
 *
 * The header is sticky-positioned at the top of the viewport and includes
 * responsive styling for both light and dark themes.
 *
 * Theme configuration can be provided either through direct props or through the ThemeProvider context.
 * Direct props take precedence over context values.
 *
 * @example
 * ```tsx
 * // Using direct props
 * <EditorHeader 
 *   availableThemes={[{id: 'purple', name: 'Purple', className: 'theme-purple'}]}
 *   onThemeChange={(theme) => console.log('Theme changed:', theme)}
 *   hideThemeToggle={false}
 *   defaultTheme="dark"
 * />
 * 
 * // Using ThemeProvider context (no props needed)
 * <ThemeProvider config={{...}}>
 *   <EditorHeader />
 * </ThemeProvider>
 * ```
 *
 * @returns {JSX.Element} A header element containing navigation and control components
 */
export function EditorHeader({
  projectTitle,
  availableThemes,
  selectedTheme,
  onThemeChange,
  showDefaultThemes,
  hideThemeToggle,
  defaultTheme,
}: EditorHeaderProps = {}) {
  /**
   * Destructure required values from the editor context:
   * - renderMedia: Function to handle media rendering/export
   * - renderState: Current render state (separate from editor state)
   */
  const { renderMedia, renderState, saveProject } = useEditorContext();

  // Get theme configuration from context if available
  const themeConfig = useThemeConfig();

  // Use direct props if provided, otherwise fall back to context values
  const resolvedAvailableThemes = availableThemes ?? themeConfig?.availableThemes ?? [];
  const resolvedSelectedTheme = selectedTheme ?? themeConfig?.selectedTheme;
  const resolvedOnThemeChange = onThemeChange ?? themeConfig?.onThemeChange;
  const resolvedShowDefaultThemes = showDefaultThemes ?? themeConfig?.showDefaultThemes ?? true;
  const resolvedHideThemeToggle = hideThemeToggle ?? themeConfig?.hideThemeToggle ?? false;
  const resolvedDefaultTheme = defaultTheme ?? themeConfig?.defaultTheme ?? 'dark';

  // Use the theme switcher hook to apply default theme when toggle is hidden
  const { setTheme } = useExtendedThemeSwitcher({
    customThemes: resolvedAvailableThemes,
    showDefaultThemes: resolvedShowDefaultThemes,
    defaultTheme: resolvedDefaultTheme,
  });

  // Apply default theme when theme toggle is hidden (only on mount or when hideThemeToggle changes)
  useEffect(() => {
    if (resolvedHideThemeToggle && resolvedDefaultTheme) {
      setTheme(resolvedDefaultTheme);
    }
  }, [resolvedHideThemeToggle, resolvedDefaultTheme, setTheme]);

  // ── Native browser fullscreen (hides address bar, like YouTube) ──
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Sync state when user exits via Escape / F11 / browser controls
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        // Fullscreen only the editor container, not the entire browser
        const editorRoot = document.querySelector("[data-editor-root]") as HTMLElement | null;
        if (editorRoot) {
          await editorRoot.requestFullscreen();
        }
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.warn("[EditorHeader] Fullscreen API error:", err);
    }
  }, []);

  return (
    <header
      className="sticky top-0 flex shrink-0 items-center gap-2.5 
      bg-background
      border-l
      p-2.5 px-4.5"
    >
      {/* Project title or Theme dropdown */}
      {resolvedHideThemeToggle ? (
        projectTitle && (
          <h1 className="text-sm font-medium text-foreground truncate max-w-[300px]">
            {projectTitle}
          </h1>
        )
      ) : (
        <ThemeDropdown
          availableThemes={resolvedAvailableThemes}
          selectedTheme={resolvedSelectedTheme}
          onThemeChange={resolvedOnThemeChange}
          showDefaultThemes={resolvedShowDefaultThemes}
          size="default"
        />
      )}

      {/* Spacer to push controls to the right */}
      <div className="grow" />

      {/* Save controls */}
      <SaveControls onSave={saveProject || (() => Promise.resolve())} />

      {/* Render controls */}
      <RenderControls
        handleRender={renderMedia}
        state={renderState}
      />

      {/* Fullscreen toggle */}
      <button
        onClick={toggleFullscreen}
        className="inline-flex items-center justify-center rounded-md h-8 w-8
          text-muted-foreground hover:text-foreground hover:bg-accent
          transition-colors"
        title={isFullscreen ? "Exit Fullscreen (Esc)" : "Fullscreen"}
        aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
      >
        {isFullscreen ? (
          <Minimize className="h-4 w-4" />
        ) : (
          <Maximize className="h-4 w-4" />
        )}
      </button>
    </header>
  );
}
