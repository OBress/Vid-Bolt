import { useEffect, useRef } from 'react';
import { useVideoEditorStore, selectClipsArray } from '../stores/video-editor-store';
import { loadFontFromTextItem } from '../utils/text/load-font-from-text-item';
import type { TimelineClip } from '../types/timeline-v2';

/**
 * Hook that preloads all fonts used in text clips when the page loads
 * or when clips change.
 * 
 * PERF: Uses reselect's selectClipsArray instead of inline Object.values().
 * selectClipsArray only recomputes when state.clips reference changes,
 * NOT on selection/playback/UI state changes.
 */
export const useFontPreloader = () => {
  const timelineClips = useVideoEditorStore(selectClipsArray) as TimelineClip[];
  const loadedFontsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Extract all text clips
    const textClips = timelineClips.filter((clip: any) => clip.type === 'text');
    
    if (textClips.length === 0) {
      return;
    }

    console.log(`[FontPreloader] Found ${textClips.length} text clips, preloading fonts...`);

    // Extract unique font configurations
    const fontConfigs = new Map<string, {
      fontFamily: string;
      fontWeight: string;
      fontStyle: 'normal' | 'italic';
    }>();

    textClips.forEach(clip => {
      const fontFamily = clip.styles?.fontFamily || clip.text?.fontFamily || 'Inter';
      const fontWeight = clip.styles?.fontWeight || '400';
      const fontStyle = (clip.styles?.fontStyle || 'normal') as 'normal' | 'italic';
      
      // Create a unique key for this font config
      const fontKey = `${fontFamily}-${fontWeight}-${fontStyle}`;
      
      if (!fontConfigs.has(fontKey)) {
        fontConfigs.set(fontKey, { fontFamily, fontWeight, fontStyle });
      }
    });

    console.log(`[FontPreloader] Unique fonts to preload: ${fontConfigs.size}`, Array.from(fontConfigs.keys()));

    // Preload all unique fonts
    const preloadPromises = Array.from(fontConfigs.values()).map(async ({ fontFamily, fontWeight, fontStyle }) => {
      const fontKey = `${fontFamily}-${fontWeight}-${fontStyle}`;
      
      // Skip if already loaded
      if (loadedFontsRef.current.has(fontKey)) {
        console.log(`[FontPreloader] Font already loaded, skipping: ${fontKey}`);
        return;
      }

      try {
        console.log(`[FontPreloader] Preloading font: ${fontKey}`);
        await loadFontFromTextItem({
          fontFamily,
          fontWeight,
          fontStyle,
          fontInfosDuringRendering: null,
        });
        loadedFontsRef.current.add(fontKey);
        console.log(`[FontPreloader] Successfully preloaded: ${fontKey}`);
      } catch (error) {
        console.error(`[FontPreloader] Failed to preload font ${fontKey}:`, error);
        // Don't block other fonts from loading
      }
    });

    // Run all preloads in parallel
    Promise.all(preloadPromises).then(() => {
      console.log(`[FontPreloader] All fonts preloaded. Total loaded: ${loadedFontsRef.current.size}`);
    });

  }, [timelineClips]);
};
