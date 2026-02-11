/**
 * Utility for loading full Google Fonts for text rendering
 * Handles font loading for both editor preview and server-side rendering
 * 
 * This module implements:
 * - Asynchronous font loading with Remotion render synchronization
 * - Font caching to prevent redundant loads
 * - Preloading capabilities for instant font availability
 * - FOUF (Flash of Unstyled/Unstyle Font) prevention
 */

import { loadFontFromInfo } from '@remotion/google-fonts/from-info';
import type { FontInfo } from '@remotion/google-fonts';
import { getInfo as getRobotoFontInfo } from '@remotion/google-fonts/Roboto';
import { continueRender, delayRender, getRemotionEnvironment } from 'remotion';
import { useEffect, useState, useRef, useCallback } from 'react';

/**
 * Interface for font loading configuration
 */
export interface LoadFontInfo {
  fontFamily: string;
  fontWeight: string;
  fontStyle: 'normal' | 'italic';
  fontInfosDuringRendering: FontInfo | null;
}

// Cache for font info to avoid redundant API calls
const fontInfoPromiseCache: Record<string, Promise<FontInfo>> = {};

// Cache for tracking loaded font variants (family-weight-style combinations)
const loadedFontVariantsCache = new Set<string>();

/**
 * Generate a cache key for a specific font variant
 */
const getFontVariantKey = (family: string, weight: string, style: string): string => {
  return `${family}-${weight}-${style}`;
};

/**
 * Check if a specific font variant is already loaded
 */
export const isFontVariantLoaded = (family: string, weight: string, style: string): boolean => {
  return loadedFontVariantsCache.has(getFontVariantKey(family, weight, style));
};

/**
 * Preload multiple fonts at once for instant availability
 * Call this before entering the video editor with a list of fonts used in the project
 * 
 * @param fonts - Array of font configurations to preload
 * @returns Promise that resolves when all fonts are loaded
 */
export const preloadFonts = async (fonts: LoadFontInfo[]): Promise<void> => {
  const loadPromises = fonts.map(font => {
    // Skip if already loaded
    const variantKey = getFontVariantKey(font.fontFamily, font.fontWeight, font.fontStyle);
    if (loadedFontVariantsCache.has(variantKey)) {
      return Promise.resolve();
    }
    return loadFontFromTextItem(font).catch(err => {
      console.warn(`[preloadFonts] Failed to preload ${font.fontFamily}:`, err);
    });
  });
  
  await Promise.all(loadPromises);
};

/**
 * Map of supported Google Fonts to their import functions
 * Add more fonts here as needed
 */
const GOOGLE_FONT_IMPORTS: Record<string, () => Promise<any>> = {
  'Inter': () => import('@remotion/google-fonts/Inter').then(m => m.getInfo()),
  'Roboto': () => Promise.resolve(getRobotoFontInfo()),
  'Montserrat': () => import('@remotion/google-fonts/Montserrat').then(m => m.getInfo()),
  'Poppins': () => import('@remotion/google-fonts/Poppins').then(m => m.getInfo()),
  'Oswald': () => import('@remotion/google-fonts/Oswald').then(m => m.getInfo()),
  'Raleway': () => import('@remotion/google-fonts/Raleway').then(m => m.getInfo()),
  'Roboto Mono': () => import('@remotion/google-fonts/RobotoMono').then(m => m.getInfo()),
  'Open Sans': () => import('@remotion/google-fonts/OpenSans').then(m => m.getInfo()),
  'Lato': () => import('@remotion/google-fonts/Lato').then(m => m.getInfo()),
};

/**
 * System fonts that don't need loading
 */
const SYSTEM_FONTS = ['Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Verdana', 'Impact', 'Courier New', 'Proxima Nova'];

/**
 * Loads font info from multiple sources:
 * 1. Pre-collected font info (during rendering)
 * 2. System fonts (no loading needed)
 * 3. Built-in Google Fonts imports
 * 4. API-loaded Google Fonts (any font from Google Fonts)
 * 5. Custom uploaded fonts
 * 
 * Falls back to Roboto font on error for graceful degradation
 * 
 * @param options - Font loading options
 * @returns Promise resolving to FontInfo
 */
const loadFontInfo = async ({
  fontFamily,
  fontInfosDuringRendering,
}: {
  fontFamily: string;
  fontInfosDuringRendering: FontInfo | null;
}): Promise<FontInfo> => {
  console.log('[loadFontInfo] Loading font info for:', fontFamily);
  
  // During rendering, use pre-collected font info
  if (fontInfosDuringRendering) {
    console.log('[loadFontInfo] Using pre-collected font info for:', fontFamily);
    return fontInfosDuringRendering;
  }

  // Check if it's a system font - return null as FontInfo (system fonts don't need loading)
  if (SYSTEM_FONTS.includes(fontFamily)) {
    console.log('[loadFontInfo] System font detected:', fontFamily);
    // For system fonts, return a minimal FontInfo that will be handled gracefully
    return getRobotoFontInfo(); // Roboto as safe fallback that won't be used visually
  }

  // In editor, load fonts with caching
  if (!fontInfoPromiseCache[fontFamily]) {
    const fontImportFn = GOOGLE_FONT_IMPORTS[fontFamily];
    
    if (fontImportFn) {
      console.log('[loadFontInfo] Using built-in Google Font import for:', fontFamily);
      // Use built-in Google Fonts import
      fontInfoPromiseCache[fontFamily] = fontImportFn()
        .then((info) => {
          console.log('[loadFontInfo] Successfully loaded Google Font:', fontFamily, info);
          return info;
        })
        .catch((error) => {
          console.error(
            `[loadFontInfo] Failed to load Google Font "${fontFamily}", falling back to Roboto.`,
            `Error:`, error
          );
          
          // Remove from cache on error so it can be retried
          delete fontInfoPromiseCache[fontFamily];
          
          // Return Roboto as fallback
          return getRobotoFontInfo();
        });
    } else {
      console.log('[loadFontInfo] Font not in built-in imports, trying API for:', fontFamily);
      // Try to load from API (Google Fonts API or custom fonts)
      fontInfoPromiseCache[fontFamily] = fetch(`/api/fonts/google/${encodeURIComponent(fontFamily)}`)
        .then(async (res) => {
          if (!res.ok) {
            // If Google Fonts API fails, try custom fonts
            throw new Error(`Google Fonts API returned ${res.status}`);
          }
          return res.json() as Promise<FontInfo>;
        })
        .catch(async (error) => {
          console.warn(
            `Font "${fontFamily}" not available via API, checking custom fonts...`
          );
          
          // TODO: Check custom uploaded fonts here
          // For now, fall back to Roboto
          console.warn(
            `Using Roboto as fallback for "${fontFamily}".`,
            `To add this font: upload it or ensure Google Fonts API is configured.`
          );
          
          // Remove from cache on error so it can be retried
          delete fontInfoPromiseCache[fontFamily];
          
          // Return Roboto as fallback
          return getRobotoFontInfo();
        });
    }
  }

  return fontInfoPromiseCache[fontFamily];
};

/**
 * Loads a font from text item configuration
 * Handles both editor and rendering contexts
 * 
 * Features:
 * - Caches loaded font variants to prevent redundant loads
 * - Gracefully falls back to Roboto on error
 * - Tracks loading state for FOUF prevention
 * 
 * @param item - Font configuration from text item
 * @returns Promise that resolves when font is loaded
 */
export const loadFontFromTextItem = async (item: LoadFontInfo): Promise<void> => {
  const variantKey = getFontVariantKey(item.fontFamily, item.fontWeight, item.fontStyle);
  
  // Skip if already loaded
  if (loadedFontVariantsCache.has(variantKey)) {
    return;
  }
  
  try {
    // Skip loading for system fonts - they're already available
    if (SYSTEM_FONTS.includes(item.fontFamily)) {
      loadedFontVariantsCache.add(variantKey);
      return;
    }

    // Get font info (with fallback to Roboto on error)
    const fontInfo = await loadFontInfo({
      fontFamily: item.fontFamily,
      fontInfosDuringRendering: item.fontInfosDuringRendering,
    });

    // Determine font variant based on weight and style
    const variant = item.fontStyle === 'italic' ? 'italic' : 'normal';

    // Normalize CSS keyword weights to numeric values
    // Google Font info objects only use numeric weight strings ('100', '400', '700', etc.)
    const WEIGHT_KEYWORD_MAP: Record<string, string> = {
      'normal': '400',
      'bold': '700',
      'lighter': '300',
      'bolder': '900',
    };
    let fontWeight = WEIGHT_KEYWORD_MAP[item.fontWeight] ?? item.fontWeight;

    // If using fallback font, adjust weight to available ones
    if (fontInfo.fontFamily === 'Roboto' && item.fontFamily !== 'Roboto') {
      console.warn('[loadFontFromTextItem] Font fell back to Roboto! Requested:', item.fontFamily);
      // Roboto supports all standard weights, but ensure we use a valid one
      const validWeights = ['100', '300', '400', '500', '700', '900'];
      if (!validWeights.includes(fontWeight)) {
        fontWeight = '400'; // Default to regular
      }
    }

    // Load font with specific weight
    await loadFontFromInfo(fontInfo, variant, {
      weights: [fontWeight],
    }).waitUntilDone();
    
    // Mark as loaded
    loadedFontVariantsCache.add(variantKey);
  } catch (error) {
    console.error(`[loadFontFromTextItem] Failed to load font ${item.fontFamily}:`, error);
    // Mark as loaded even on error to prevent infinite retry loops
    // The component will render with fallback font
    loadedFontVariantsCache.add(variantKey);
  }
};

/**
 * Hook for loading fonts in React components with Remotion integration
 * Handles delayRender/continueRender for proper font loading during rendering
 * 
 * Features:
 * - Immediate return for already-loaded fonts (no FOUF)
 * - Proper Remotion render delay integration
 * - Cleanup handling for unmounted components
 * - Optimized to prevent redundant loads
 * 
 * @param fontInfo - Font loading configuration
 * @returns Loading state - true when font is ready to use
 */
export const useLoadFontFromTextItem = (fontInfo: LoadFontInfo | null): boolean => {
  // Check if font is already loaded for immediate response
  const isAlreadyLoaded = fontInfo 
    ? isFontVariantLoaded(fontInfo.fontFamily, fontInfo.fontWeight, fontInfo.fontStyle)
    : true;
  
  const [loaded, setLoaded] = useState(isAlreadyLoaded);
  const cancelledRef = useRef(false);
  const handleRef = useRef<number | null>(null);

  // Get render environment
  const environment = getRemotionEnvironment();
  const isRendering = environment.isRendering;

  useEffect(() => {
    // Reset cancellation flag on new effect
    cancelledRef.current = false;
    
    if (!fontInfo) {
      setLoaded(true);
      return;
    }

    // Check if already loaded (cache may have been populated since initial render)
    if (isFontVariantLoaded(fontInfo.fontFamily, fontInfo.fontWeight, fontInfo.fontStyle)) {
      setLoaded(true);
      return;
    }

    const loadFont = async () => {
      // Only delay render during actual rendering (not preview)
      // This ensures preview shows content quickly while renders are accurate
      if (isRendering) {
        handleRef.current = delayRender(`Loading font ${fontInfo.fontFamily}`);
      }

      try {
        await loadFontFromTextItem(fontInfo);
        
        if (!cancelledRef.current) {
          setLoaded(true);
        }
      } catch (error) {
        console.error('[useLoadFontFromTextItem] Font loading error:', error, 'for font:', fontInfo.fontFamily);
        // Set loaded to true even on error to prevent infinite loading
        // The component will render with fallback font
        if (!cancelledRef.current) {
          setLoaded(true);
        }
      } finally {
        if (handleRef.current !== null) {
          continueRender(handleRef.current);
          handleRef.current = null;
        }
      }
    };

    loadFont();

    return () => {
      cancelledRef.current = true;
      if (handleRef.current !== null) {
        continueRender(handleRef.current);
        handleRef.current = null;
      }
    };
  }, [fontInfo?.fontFamily, fontInfo?.fontWeight, fontInfo?.fontStyle, isRendering]);

  return loaded;
};

/**
 * Context for providing font infos during rendering
 * This is used to pass pre-collected font data to text layers
 */
import { createContext } from 'react';

export const FontInfoContext = createContext<Record<string, FontInfo>>({});
