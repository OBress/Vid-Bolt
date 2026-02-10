import { useEffect, useRef } from 'react';
import { loadFontFromTextItem } from '../utils/text/load-font-from-text-item';
import { TEXT_STYLE_PRESETS } from '../templates/text-style-presets';

/**
 * Hook that preloads all fonts used in text style presets
 * when the component mounts (for preview cards in Text Tab)
 */
export const usePresetFontPreloader = () => {
  const loadedFontsRef = useRef<Set<string>>(new Set());
  const hasRunRef = useRef(false);

  useEffect(() => {
    // Only run once on mount
    if (hasRunRef.current) {
      return;
    }
    hasRunRef.current = true;

    console.log('[PresetFontPreloader] Preloading fonts for text presets...');

    // Extract unique font configurations from all presets
    const fontConfigs = new Map<string, {
      fontFamily: string;
      fontWeight: string;
      fontStyle: 'normal' | 'italic';
    }>();

    TEXT_STYLE_PRESETS.forEach(preset => {
      const fontFamily = preset.styles.fontFamily || 'Inter';
      const fontWeight = preset.styles.fontWeight || '400';
      const fontStyle = (preset.styles.fontStyle || 'normal') as 'normal' | 'italic';
      
      const fontKey = `${fontFamily}-${fontWeight}-${fontStyle}`;
      
      if (!fontConfigs.has(fontKey)) {
        fontConfigs.set(fontKey, { fontFamily, fontWeight, fontStyle });
      }
    });

    console.log(`[PresetFontPreloader] Found ${fontConfigs.size} unique fonts to preload:`, 
      Array.from(fontConfigs.keys()));

    // Preload all unique fonts in parallel
    const preloadPromises = Array.from(fontConfigs.values()).map(async ({ fontFamily, fontWeight, fontStyle }) => {
      const fontKey = `${fontFamily}-${fontWeight}-${fontStyle}`;
      
      // Skip if already loaded
      if (loadedFontsRef.current.has(fontKey)) {
        console.log(`[PresetFontPreloader] Font already loaded, skipping: ${fontKey}`);
        return;
      }

      try {
        console.log(`[PresetFontPreloader] Preloading font: ${fontKey}`);
        await loadFontFromTextItem({
          fontFamily,
          fontWeight,
          fontStyle,
          fontInfosDuringRendering: null,
        });
        loadedFontsRef.current.add(fontKey);
        console.log(`[PresetFontPreloader] Successfully preloaded: ${fontKey}`);
      } catch (error) {
        console.error(`[PresetFontPreloader] Failed to preload font ${fontKey}:`, error);
        // Don't block other fonts from loading
      }
    });

    // Run all preloads in parallel
    Promise.all(preloadPromises).then(() => {
      console.log(`[PresetFontPreloader] All preset fonts preloaded! Total: ${loadedFontsRef.current.size}`);
    });

  }, []); // Empty deps - only run once on mount
};
