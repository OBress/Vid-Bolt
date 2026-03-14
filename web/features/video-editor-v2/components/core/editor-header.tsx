import { ThemeDropdown } from "../ui/theme-dropdown";
import { CustomTheme } from "../../hooks/use-extended-theme-switcher";
import { useExtendedThemeSwitcher } from "../../hooks/use-extended-theme-switcher";
import { useThemeConfig } from "../../contexts/theme-context";


import { useEditorContext } from "../../contexts/editor-context";
import { useEffect, useState, useCallback } from "react";
import { Maximize, Minimize, AlertTriangle, Loader2 } from "lucide-react";
import { useGCPVM } from "@/providers/GCPVMProvider";
import { useVramMode } from "@/hooks/use-vram-mode";

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
  // Editor context (kept for potential future use)
  useEditorContext();

  // ── VM & VRAM mode state ──
  const { displayStatus, apiReady } = useGCPVM();
  const { currentMode, isSwitching, switchToAll } = useVramMode(apiReady);
  const showVramBanner = displayStatus === "ON" && currentMode !== null && currentMode !== "all";

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

      {/* VRAM Mode Warning Banner (centered) */}
      {showVramBanner && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md
          bg-amber-500/10 border border-amber-500/30 text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="text-[11px] font-medium whitespace-nowrap">
            VRAM: <span className="font-mono">{currentMode}</span> — switch to All Models
          </span>
          <button
            onClick={() => switchToAll()}
            disabled={isSwitching}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded
              bg-amber-500/20 hover:bg-amber-500/30 text-amber-300
              text-[10px] font-semibold transition-colors disabled:opacity-50"
          >
            {isSwitching ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Switching…
              </>
            ) : (
              "Switch to All"
            )}
          </button>
        </div>
      )}

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
