/**
 * Remotion Code Compiler
 * 
 * =============================================================================
 * ARCHITECTURE: Simple & Robust Icon Handling
 * =============================================================================
 * 
 * ICON STRATEGY: Inject ALL lucide-react icons into compilation scope.
 * 
 * Why? lucide-react has ~1500 icons. Rather than trying to detect which
 * icons the AI-generated code uses (error-prone), we simply inject ALL
 * icons into the compilation scope. The icons are already loaded at
 * module initialization, so this is just adding references to arrays.
 * 
 * Benefits:
 * ✓ Zero "icon not defined" errors - every icon is always available
 * ✓ No icon detection logic needed (simpler, more reliable)
 * ✓ Works with any icon usage pattern the AI generates
 * ✓ Automatically supports new icons when lucide-react updates
 * 
 * Performance: Negligible impact. We're not re-importing anything,
 * just adding ~1500 entries to two arrays. The Function constructor
 * call is still very fast.
 * 
 * =============================================================================
 * DATA FLOW
 * =============================================================================
 * 
 * 1. User enters prompt
 * 2. Backend generates code via AI (MotionGraphicsService)
 * 3. Backend validates code (CodeValidator.js):
 *    - Validates syntax and structure
 *    - Applies auto-fixes
 *    - Returns: { code, metadata }
 * 4. Frontend receives code + metadata
 * 5. Frontend compiles with this compiler:
 *    - Compiles with Babel
 *    - Injects ALL lucide-react icons into scope
 *    - Injects Remotion APIs, shapes, transitions
 * 6. Component renders
 * 
 * =============================================================================
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import React from 'react';
import { babelWorker, preloadBabelWorker, isWorkerCompilationAvailable } from './babel-compiler-worker';

// Lazy-loaded Babel for fallback (only loaded if worker fails)
let BabelModule: typeof import('@babel/standalone') | null = null;
let babelLoadPromise: Promise<typeof import('@babel/standalone')> | null = null;

async function loadBabelFallback(): Promise<typeof import('@babel/standalone')> {
  if (BabelModule) return BabelModule;
  if (babelLoadPromise) return babelLoadPromise;
  
  console.log('[Compiler] Loading Babel fallback (worker unavailable)');
  babelLoadPromise = import('@babel/standalone').then(module => {
    BabelModule = module;
    console.log('[Compiler] Babel fallback loaded');
    return module;
  });
  
  return babelLoadPromise;
}
import {
  AbsoluteFill,
  interpolate,
  interpolateColors,
  useCurrentFrame,
  useVideoConfig,
  spring,
  Sequence,
  Img,
  Easing,
  Series,
  random,
  AnimatedImage,
  delayRender,
  continueRender,
  cancelRender,
} from 'remotion';

// Import ALL lucide-react icons as a namespace
// This is the professional way to handle dynamic icon usage in Vite/ESM
import * as LucideIcons from 'lucide-react';

// ============================================================
// OPTIONAL PACKAGE IMPORTS (ES Module style)
// ============================================================

// Import shapes - these are direct ES imports, will tree-shake if not used
import * as RemotionShapesModule from '@remotion/shapes';
const RemotionShapes = RemotionShapesModule;

// Import transitions
import * as TransitionsModule from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { wipe } from '@remotion/transitions/wipe';
import { flip } from '@remotion/transitions/flip';
import { clockWipe } from '@remotion/transitions/clock-wipe';

const { TransitionSeries, linearTiming, springTiming } = TransitionsModule;

// Import d3-geo for geographic map rendering
import {
  geoPath,
  geoMercator,
  geoOrthographic,
  geoNaturalEarth1,
  geoEquirectangular,
  geoGraticule,
} from 'd3-geo';

// Import pre-loaded world map data and city database
import {
  WorldCountries,
  WorldLand,
  loadCities,
  getCityCoords,
  getCityInfo,
  getSubNationalData,
  SUPPORTED_SUBNATIONAL_COUNTRIES,
  // Geo layers
  loadRivers,
  loadLakes,
  loadOceans,
  loadAirports,
  loadPorts,
  loadUrbanAreas,
  loadTimezones,
  loadCoastlines,
  loadGeographicLines,
  loadGlaciated,
  loadReefs,
} from './remotion/geo-data';

// Optional packages - These are truly optional and may not be installed
// We don't import them statically to avoid build errors
// They'll only be available if the user has installed them
let ThreeCanvas: any = null;
let THREE: any = null;
let Lottie: any = null;

// Note: These optional packages need to be installed separately by users who want them:
// - @remotion/three + three (for 3D)
// - @remotion/lottie (for Lottie animations)
// The compiler will work without them, just without 3D/Lottie support

// ============================================================
// ICON LOADING (LAZY, ON-DEMAND)
// ============================================================

// Placeholder icon for missing icons (shows a warning indicator)
const PlaceholderIcon: React.FC<any> = ({ size = 24, color = '#888' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <circle cx="12" cy="16" r="1" fill={color} />
  </svg>
);

/**
 * Get an icon by name from the pre-loaded icons.
 * Returns PlaceholderIcon if not found.
 */
function getIcon(name: string): React.ComponentType<any> {
  // Try exact name
  if (AllIcons[name]) {
    return AllIcons[name];
  }
  
  // Try with 'Icon' suffix
  if (!name.endsWith('Icon') && AllIcons[name + 'Icon']) {
    return AllIcons[name + 'Icon'];
  }
  
  // Try without 'Icon' suffix
  if (name.endsWith('Icon') && AllIcons[name.slice(0, -4)]) {
    return AllIcons[name.slice(0, -4)];
  }
  
  return PlaceholderIcon;
}

/**
 * Get all available icons from the pre-imported lucide-react namespace.
 * Uses ES module import (not require) for Vite/browser compatibility.
 */
function getAllIcons(): Record<string, React.ComponentType<any>> {
  const icons: Record<string, React.ComponentType<any>> = {};
  
  for (const key of Object.keys(LucideIcons)) {
    const component = (LucideIcons as any)[key];
    
    // Skip non-PascalCase names (utilities like createLucideIcon)
    if (!/^[A-Z][a-zA-Z0-9]*$/.test(key)) continue;
    
    // Skip special exports
    if (key === 'Icon' || key === 'default' || key === 'LucideIcon' || key === 'IconNode') continue;
    
    // Accept any object or function - lucide exports forwardRef components as objects
    if (component && (typeof component === 'object' || typeof component === 'function')) {
      icons[key] = component;
    }
  }
  
  console.log(`[Compiler] Loaded ${Object.keys(icons).length} icons from lucide-react`);
  
  // Log a few sample icons to verify they loaded
  const sampleIcons = ['Bell', 'Check', 'ChevronRight', 'Star', 'Heart', 'Sparkles'];
  const found = sampleIcons.filter(name => icons[name]);
  console.log(`[Compiler] Sample icons available: ${found.join(', ')}`);
  
  return icons;
}

// Load all icons at module initialization using ES module import
const AllIcons = getAllIcons();

// ============================================================
// TYPES
// ============================================================

export interface CompilationResult {
  Component: React.ComponentType | null;
  error: string | null;
}

export interface CompilationOptions {
  /** List of icon names used in the code (from backend analysis) */
  usedIcons?: string[];
  /** Skip icon injection (for performance when icons aren't needed) */
  skipIcons?: boolean;
}

// ============================================================
// CODE EXTRACTION
// ============================================================

/**
 * Strip imports and extract ONLY the body from an AI-generated component.
 * 
 * This is the key to reliable compilation - extract just what's inside the
 * arrow function, then wrap it ourselves with a known-good wrapper.
 * 
 * Input:  export const SubscribeAnimation = () => { const frame = useCurrentFrame(); return <div/>; };
 * Output: const frame = useCurrentFrame(); return <div/>;
 */
function extractComponentBody(code: string): string {
  let cleaned = code;

  // Step 1: Remove ICONS comment (added by backend for icon injection)
  // Format: // ICONS: Bell, Heart, Star
  cleaned = cleaned.replace(/^\/\/\s*ICONS:.*$/m, '');
  
  // Step 2: Remove ALL import statements (various formats)
  cleaned = cleaned.replace(/import\s+type\s*\{[\s\S]*?\}\s*from\s*["'][^"']+["'];?/g, '');
  cleaned = cleaned.replace(/import\s+\w+\s*,\s*\{[\s\S]*?\}\s*from\s*["'][^"']+["'];?/g, '');
  cleaned = cleaned.replace(/import\s*\{[\s\S]*?\}\s*from\s*["'][^"']+["'];?/g, '');
  cleaned = cleaned.replace(/import\s+\*\s+as\s+\w+\s+from\s*["'][^"']+["'];?/g, '');
  cleaned = cleaned.replace(/import\s+\w+\s+from\s*["'][^"']+["'];?/g, '');
  cleaned = cleaned.replace(/import\s*["'][^"']+["'];?/g, '');

  cleaned = cleaned.trim();

  // Step 2: Extract the BODY from "export const MyAnimation = () => { BODY };"
  // This regex captures:
  //   $1 = any helper code before the export (functions, constants)
  //   $2 = the body inside the arrow function's braces
  const match = cleaned.match(
    /^([\s\S]*?)export\s+const\s+\w+\s*=\s*\(\s*\)\s*=>\s*\{([\s\S]*)\};?\s*$/
  );

  if (match) {
    const helpers = match[1].trim();
    const body = match[2].trim();
    console.log('[Compiler] Successfully extracted component body');
    return helpers ? `${helpers}\n\n${body}` : body;
  }

  // Fallback: Try without 'export' keyword
  const noExportMatch = cleaned.match(
    /^([\s\S]*?)const\s+\w+\s*=\s*\(\s*\)\s*=>\s*\{([\s\S]*)\};?\s*$/
  );

  if (noExportMatch) {
    const helpers = noExportMatch[1].trim();
    const body = noExportMatch[2].trim();
    console.log('[Compiler] Extracted component body (no export keyword)');
    return helpers ? `${helpers}\n\n${body}` : body;
  }

  // If no pattern matches, the code might already be just a body
  console.warn('[Compiler] Could not extract body pattern, using code as-is');
  return cleaned;
}

/**
 * Strip markdown code fences from code
 */
export function stripMarkdownFences(code: string): string {
  let cleaned = code.replace(/^```(?:tsx|typescript|jsx|javascript)?\s*\n?/gm, '');
  cleaned = cleaned.replace(/\n?```\s*$/gm, '');
  return cleaned.trim();
}

/**
 * Extract recommended duration from AI-generated code comment.
 * Looks for: // RECOMMENDED_DURATION: 180
 */
export function extractRecommendedDuration(code: string): number | null {
  const match = code.match(/\/\/\s*RECOMMENDED_DURATION:\s*(\d+)/i);
  if (match && match[1]) {
    const duration = parseInt(match[1], 10);
    if (duration >= 30 && duration <= 900) {
      return duration;
    }
  }
  return null;
}

/**
 * Extract the BODY of a component from AI-generated code.
 * Exported for use by the generation hook.
 * 
 * This delegates to the internal extractComponentBody function which
 * follows the same approach as the template-prompt-to-motion-graphics project.
 */
export function extractComponentCode(code: string): string {
  return extractComponentBody(code);
}

/**
 * Extract icon names from code (for informational purposes)
 * 
 * NOTE: This is no longer used for compilation since we inject ALL icons.
 * Kept for backward compatibility and potential use in UI/logging.
 * 
 * Scans code for lucide-react icon usage via:
 * 1. Import statements
 * 2. JSX elements
 * 3. Any PascalCase word that matches a real lucide icon
 */
export function extractIconsFromCode(code: string): string[] {
  const icons = new Set<string>();
  
  // Known Remotion/React components that are NOT icons
  const knownComponents = new Set([
    'React', 'AbsoluteFill', 'Sequence', 'Series', 'Img', 'Audio', 'Video',
    'TransitionSeries', 'Fragment', 'Component', 'Rect', 'Circle', 'Triangle',
    'Star', 'Polygon', 'Ellipse', 'Heart', 'Pie', 'ThreeCanvas', 'Lottie'
  ]);
  
  // Scan for ANY PascalCase word that exists in lucide-react
  const wordPattern = /\b([A-Z][a-zA-Z0-9]*)\b/g;
  let match;
  
  while ((match = wordPattern.exec(code)) !== null) {
    const word = match[1];
    if (!knownComponents.has(word) && AllIcons[word]) {
      icons.add(word);
    }
  }
  
  return Array.from(icons);
}

// ============================================================
// COMPILER
// ============================================================

/**
 * Pre-process code: extract component body and apply auto-fixes
 */
function preprocessCode(code: string): { componentBody: string; wrappedSource: string } {
  // Extract component body (strips imports)
  let componentBody = extractComponentBody(code);
  
  // Auto-fix common errors: bare Math function calls
  const mathFunctions = [
    'floor', 'ceil', 'round', 'abs', 
    'min', 'max', 'sin', 'cos', 'tan',
    'sqrt', 'pow', 'atan2', 'asin', 'acos'
  ];
  
  let fixCount = 0;
  for (const fn of mathFunctions) {
    const pattern = `([^.\\w])${fn}\\s*\\(`;
    const regex = new RegExp(pattern, 'g');
    
    const before = componentBody;
    componentBody = componentBody.replace(regex, `$1Math.${fn}(`);
    
    if (componentBody !== before) {
      fixCount++;
      console.log(`[Compiler] Auto-fixed: ${fn}() -> Math.${fn}()`);
    }
  }
  
  if (fixCount > 0) {
    console.log(`[Compiler] ✓ Applied ${fixCount} Math function auto-fixes`);
  }
  
  // Wrap in a function component
  const wrappedSource = `const DynamicAnimation = () => {\n${componentBody}\n};`;
  
  return { componentBody, wrappedSource };
}

/**
 * Create component from transpiled code by injecting scope
 */
function createComponentFromTranspiled(
  transpiledCode: string, 
  options: CompilationOptions = {}
): CompilationResult {
  try {
    const skipIconInjection = options.skipIcons === true;

    // Safe interpolate wrapper for AI-generated code.
    // AI code may pass undefined, NaN, or string values in inputRange/outputRange
    // which causes Remotion to throw "outputRange must contain only numbers".
    // This wrapper sanitizes the arrays before passing to the real interpolate.
    const safeInterpolate: typeof interpolate = (input, inputRange, outputRange, options) => {
      const sanitize = (arr: readonly number[]): readonly number[] =>
        arr.map(v => {
          const n = Number(v);
          if (Number.isNaN(n)) {
            console.warn('[Compiler] interpolate: non-numeric value in range, defaulting to 0. Original:', v);
            return 0;
          }
          return n;
        });
      return interpolate(
        Number.isNaN(Number(input)) ? 0 : Number(input),
        sanitize(inputRange),
        sanitize(outputRange),
        options,
      );
    };

    // Build the Remotion namespace
    const Remotion = {
      AbsoluteFill,
      interpolate: safeInterpolate,
      interpolateColors,
      useCurrentFrame,
      useVideoConfig,
      spring,
      Sequence,
      Img,
      Easing,
      Series,
      random,
    };

    // Build parameter names (static list)
    const paramNames: string[] = [
      'React',
      'Remotion',
      'RemotionShapes',
      'Lottie',
      'ThreeCanvas',
      'THREE',
      'Math',
      'AbsoluteFill',
      'interpolate',
      'interpolateColors',
      'interpolateColor',
      'useCurrentFrame',
      'useVideoConfig',
      'spring',
      'Sequence',
      'Img',
      'Easing',
      'Series',
      'random',
      'AnimatedImage',
      'delayRender',
      'continueRender',
      'cancelRender',
      'useState',
      'useEffect',
      'useMemo',
      'useRef',
      'useCallback',
      'Rect', 'Circle', 'Triangle', 'Star', 'Polygon', 'Ellipse', 'Heart', 'Pie',
      'makeRect', 'makeCircle', 'makeTriangle', 'makeStar', 
      'makePolygon', 'makeEllipse', 'makeHeart', 'makePie',
      'TransitionSeries', 'linearTiming', 'springTiming',
      'fade', 'slide', 'wipe', 'flip', 'clockWipe',
      // d3-geo map rendering
      'geoPath', 'geoMercator', 'geoOrthographic', 'geoNaturalEarth1',
      'geoEquirectangular', 'geoGraticule',
      'WorldCountries', 'WorldLand', 'loadCities', 'getCityCoords', 'getCityInfo',
      'getSubNationalData', 'SUPPORTED_SUBNATIONAL_COUNTRIES',
      // Geo layers
      'loadRivers', 'loadLakes', 'loadOceans', 'loadAirports', 'loadPorts',
      'loadUrbanAreas', 'loadTimezones', 'loadCoastlines', 'loadGeographicLines',
      'loadGlaciated', 'loadReefs',
    ];

    // Build parameter values (matching names above)
    const paramValues: any[] = [
      React,
      Remotion,
      RemotionShapes,
      Lottie,
      ThreeCanvas,
      THREE,
      Math,
      AbsoluteFill,
      safeInterpolate,
      interpolateColors,
      interpolateColors,
      useCurrentFrame,
      useVideoConfig,
      spring,
      Sequence,
      Img,
      Easing,
      Series,
      random,
      AnimatedImage,
      delayRender,
      continueRender,
      cancelRender,
      useState,
      useEffect,
      useMemo,
      useRef,
      useCallback,
      RemotionShapes?.Rect,
      RemotionShapes?.Circle,
      RemotionShapes?.Triangle,
      RemotionShapes?.Star,
      RemotionShapes?.Polygon,
      RemotionShapes?.Ellipse,
      RemotionShapes?.Heart,
      RemotionShapes?.Pie,
      RemotionShapes?.makeRect,
      RemotionShapes?.makeCircle,
      RemotionShapes?.makeTriangle,
      RemotionShapes?.makeStar,
      RemotionShapes?.makePolygon,
      RemotionShapes?.makeEllipse,
      RemotionShapes?.makeHeart,
      RemotionShapes?.makePie,
      TransitionSeries,
      linearTiming,
      springTiming,
      fade,
      slide,
      wipe,
      flip,
      clockWipe,
      // d3-geo map rendering
      geoPath, geoMercator, geoOrthographic, geoNaturalEarth1,
      geoEquirectangular, geoGraticule,
      WorldCountries, WorldLand, loadCities, getCityCoords, getCityInfo,
      getSubNationalData, SUPPORTED_SUBNATIONAL_COUNTRIES,
      // Geo layers
      loadRivers, loadLakes, loadOceans, loadAirports, loadPorts,
      loadUrbanAreas, loadTimezones, loadCoastlines, loadGeographicLines,
      loadGlaciated, loadReefs,
    ];

    // INJECT ALL ICONS
    if (!skipIconInjection) {
      const iconCount = Object.keys(AllIcons).length;
      for (const [iconName, IconComponent] of Object.entries(AllIcons)) {
        paramNames.push(iconName);
        paramValues.push(IconComponent);
      }
      console.log(`[Compiler] ✓ Injected all ${iconCount} lucide-react icons into scope`);
    }

    // SECURITY: Shadow dangerous globals so generated code cannot access them.
    // new Function() runs in global scope by default — these overrides block access
    // to browser APIs that motion graphic components should never need.
    const SHADOWED_GLOBALS: string[] = [
      'window', 'document', 'fetch', 'eval',
      'localStorage', 'sessionStorage', 'indexedDB',
      'XMLHttpRequest', 'WebSocket', 'navigator',
      'globalThis', 'process', 'importScripts',
    ];
    for (const name of SHADOWED_GLOBALS) {
      paramNames.push(name);
      paramValues.push(undefined);
    }

    // Build the function body
    const wrappedCode = `
      ${transpiledCode}
      return DynamicAnimation;
    `;

    // Create and execute the function
    const createComponent = new Function(...paramNames, wrappedCode);
    const Component = createComponent(...paramValues);

    if (typeof Component !== 'function') {
      return {
        Component: null,
        error: 'Code must be a function that returns a React component',
      };
    }

    return { Component, error: null };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown compilation error';
    console.error('[Compiler] Error:', errorMessage);
    return { Component: null, error: errorMessage };
  }
}

/**
 * Compile Remotion JSX code asynchronously using Web Worker.
 * This is the recommended method - it doesn't block the main thread.
 * 
 * @param code - The JSX code to compile
 * @param options - Compilation options
 */
export async function compileCodeAsync(
  code: string, 
  options: CompilationOptions = {}
): Promise<CompilationResult> {
  if (!code?.trim()) {
    return { Component: null, error: 'No code provided' };
  }

  try {
    // Pre-process the code
    const { wrappedSource } = preprocessCode(code);

    let transpiledCode: string;

    // Try worker-based compilation first
    if (isWorkerCompilationAvailable()) {
      try {
        transpiledCode = await babelWorker.transpile(wrappedSource);
        console.log('[Compiler] ✓ Transpiled using Web Worker');
      } catch (workerError) {
        console.warn('[Compiler] Worker failed, falling back to main thread:', workerError);
        // Fall through to fallback
        const Babel = await loadBabelFallback();
        const result = Babel.transform(wrappedSource, {
          presets: ['react', 'typescript'],
          filename: 'dynamic-animation.tsx',
        });
        if (!result.code) {
          return { Component: null, error: 'Transpilation failed' };
        }
        transpiledCode = result.code;
      }
    } else {
      // No worker support, use fallback
      const Babel = await loadBabelFallback();
      const result = Babel.transform(wrappedSource, {
        presets: ['react', 'typescript'],
        filename: 'dynamic-animation.tsx',
      });
      if (!result.code) {
        return { Component: null, error: 'Transpilation failed' };
      }
      transpiledCode = result.code;
    }

    // Create component from transpiled code
    return createComponentFromTranspiled(transpiledCode, options);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown compilation error';
    console.error('[Compiler] Error:', errorMessage);
    return { Component: null, error: errorMessage };
  }
}

/**
 * Compile Remotion JSX code synchronously (fallback/legacy).
 * 
 * NOTE: This method blocks the main thread during transpilation.
 * Prefer using compileCodeAsync() for better UX.
 * 
 * @param code - The JSX code to compile
 * @param options - Compilation options
 */
export function compileCode(code: string, options: CompilationOptions = {}): CompilationResult {
  if (!code?.trim()) {
    return { Component: null, error: 'No code provided' };
  }

  // If Babel is already loaded, use it
  if (BabelModule) {
    try {
      const { wrappedSource } = preprocessCode(code);
      const result = BabelModule.transform(wrappedSource, {
        presets: ['react', 'typescript'],
        filename: 'dynamic-animation.tsx',
      });
      if (!result.code) {
        return { Component: null, error: 'Transpilation failed' };
      }
      return createComponentFromTranspiled(result.code, options);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown compilation error';
      console.error('[Compiler] Error:', errorMessage);
      return { Component: null, error: errorMessage };
    }
  }

  // Babel not loaded - return error suggesting async usage
  console.warn('[Compiler] Babel not loaded. Use compileCodeAsync() or call preloadBabelWorker() first.');
  return { 
    Component: null, 
    error: 'Compiler not ready. Please wait for initialization.' 
  };
}

// ============================================================
// CODE FIXING UTILITIES
// ============================================================

/**
 * Attempt to fix common syntax errors in code based on Babel error messages.
 * Returns the fixed code if successful, null if unable to fix.
 */
export function tryFixCodeFromError(code: string, errorMessage: string): string | null {
  let fixedCode = code;
  let madeChanges = false;

  console.log('[Compiler] Attempting to fix error:', errorMessage);

  // Parse line number from Babel error (format: "(line:column)")
  const lineMatch = errorMessage.match(/\((\d+):(\d+)\)/);
  const errorLine = lineMatch ? parseInt(lineMatch[1], 10) : null;
  const errorCol = lineMatch ? parseInt(lineMatch[2], 10) : null;

  // Fix 1: Unexpected token - usually missing closing brace/paren
  if (errorMessage.includes('Unexpected token')) {
    // Count braces to find imbalance
    const braceBalance = countCharBalance(fixedCode, '{', '}');
    const parenBalance = countCharBalance(fixedCode, '(', ')');
    const bracketBalance = countCharBalance(fixedCode, '[', ']');

    if (braceBalance > 0) {
      // Missing closing braces - add them at the end before the final semicolon
      const closing = '}'.repeat(braceBalance);
      fixedCode = fixedCode.replace(/;?\s*$/, closing + ';');
      console.log(`[Compiler] Added ${braceBalance} closing brace(s)`);
      madeChanges = true;
    }
    if (parenBalance > 0) {
      const closing = ')'.repeat(parenBalance);
      fixedCode = fixedCode.replace(/;?\s*$/, closing + ';');
      console.log(`[Compiler] Added ${parenBalance} closing paren(s)`);
      madeChanges = true;
    }
    if (bracketBalance > 0) {
      const closing = ']'.repeat(bracketBalance);
      fixedCode = fixedCode.replace(/;?\s*$/, closing + ';');
      console.log(`[Compiler] Added ${bracketBalance} closing bracket(s)`);
      madeChanges = true;
    }

    // Fix unclosed JSX attributes: prop={value (missing closing brace)
    // Pattern: attribute={something without closing brace before next attribute or tag end
    const jsxAttrFix = fixedCode.replace(
      /(\w+)=\{([^{}]+?)(\s+\w+=|\s*\/?>)/g,
      (match, prop, value, next) => {
        if (!value.includes('}')) {
          console.log(`[Compiler] Fixed unclosed JSX attribute: ${prop}`);
          madeChanges = true;
          return `${prop}={${value.trim()}}${next}`;
        }
        return match;
      }
    );
    if (jsxAttrFix !== fixedCode) {
      fixedCode = jsxAttrFix;
    }
  }

  // Fix 2: Unterminated string literal
  if (errorMessage.includes('Unterminated string') || errorMessage.includes('Unterminated template')) {
    // Try to find and close unclosed strings
    const lines = fixedCode.split('\n');
    if (errorLine && errorLine <= lines.length) {
      const line = lines[errorLine - 1];
      // Count quotes
      const doubleQuotes = (line.match(/"/g) || []).length;
      const singleQuotes = (line.match(/'/g) || []).length;
      const backticks = (line.match(/`/g) || []).length;

      if (doubleQuotes % 2 !== 0) {
        lines[errorLine - 1] = line + '"';
        madeChanges = true;
      } else if (singleQuotes % 2 !== 0) {
        lines[errorLine - 1] = line + "'";
        madeChanges = true;
      } else if (backticks % 2 !== 0) {
        lines[errorLine - 1] = line + '`';
        madeChanges = true;
      }

      if (madeChanges) {
        fixedCode = lines.join('\n');
        console.log(`[Compiler] Fixed unterminated string on line ${errorLine}`);
      }
    }
  }

  // Fix 3: Unexpected EOF - code was truncated
  if (errorMessage.includes('Unexpected end of input') || errorMessage.includes('Unexpected eof')) {
    // Add missing component ending
    if (!fixedCode.trim().endsWith('};')) {
      const braceBalance = countCharBalance(fixedCode, '{', '}');
      const parenBalance = countCharBalance(fixedCode, '(', ')');
      
      let ending = '';
      for (let i = 0; i < parenBalance; i++) ending += ')';
      for (let i = 0; i < braceBalance; i++) ending += '}';
      ending += ';';
      
      fixedCode = fixedCode.trimEnd() + ending;
      console.log('[Compiler] Fixed truncated code ending');
      madeChanges = true;
    }
  }

  // Fix 4: Missing semicolon (usually not critical in JSX but let's handle it)
  if (errorMessage.includes('Missing semicolon')) {
    // This is usually a false positive in JSX, but if specified at a line, add it
    if (errorLine) {
      const lines = fixedCode.split('\n');
      if (errorLine <= lines.length) {
        const line = lines[errorLine - 1];
        if (!line.trim().endsWith(';') && !line.trim().endsWith(',') && !line.trim().endsWith('{')) {
          lines[errorLine - 1] = line + ';';
          fixedCode = lines.join('\n');
          madeChanges = true;
          console.log(`[Compiler] Added semicolon on line ${errorLine}`);
        }
      }
    }
  }

  // Fix 5: Style object issues - ensure double braces
  if (errorMessage.includes('style') || errorMessage.includes('Unexpected token')) {
    // Fix style={{ ... } (missing second closing brace)
    fixedCode = fixedCode.replace(/style=\{\{([^}]*)\}(?!\})/g, (match, content) => {
      console.log('[Compiler] Fixed style object closing braces');
      madeChanges = true;
      return `style={{${content}}}`;
    });
  }

  return madeChanges ? fixedCode : null;
}

/**
 * Count the balance between opening and closing characters
 */
function countCharBalance(code: string, open: string, close: string): number {
  let balance = 0;
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    const prevChar = i > 0 ? code[i - 1] : '';

    // Handle strings
    if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
      continue;
    }

    if (inString) continue;

    if (char === open) balance++;
    if (char === close) balance--;
  }

  return balance;
}

/**
 * Lightweight validation - just checks if code has JSX content.
 * For full validation, use compileCodeAsync().
 */
export function validateCode(code: string): { 
  isValid: boolean; 
  error?: string; 
} {
  if (!code?.trim()) {
    return { isValid: false, error: 'No code provided' };
  }

  // Check for JSX-like content (at least one opening tag)
  const hasJsx = /<[A-Z][a-zA-Z]*|<[a-z]+[^>]*>/.test(code);
  if (!hasJsx) {
    return {
      isValid: false,
      error: 'The response does not contain valid JSX. Please try again.',
    };
  }

  return { isValid: true };
}

/**
 * Async validation that actually compiles the code
 */
export async function validateCodeAsync(code: string): Promise<{ 
  isValid: boolean; 
  error?: string; 
}> {
  if (!code?.trim()) {
    return { isValid: false, error: 'No code provided' };
  }

  const hasJsx = /<[A-Z][a-zA-Z]*|<[a-z]+[^>]*>/.test(code);
  if (!hasJsx) {
    return {
      isValid: false,
      error: 'The response does not contain valid JSX. Please try again.',
    };
  }

  // Try to compile to catch any errors
  const result = await compileCodeAsync(code);
  if (result.error) {
    return { isValid: false, error: result.error };
  }

  return { isValid: true };
}

// ============================================================
// EXPORTS
// ============================================================

// Re-export worker utilities for convenience
export { preloadBabelWorker, isWorkerCompilationAvailable } from './babel-compiler-worker';

export default {
  compileCode,
  compileCodeAsync,
  validateCode,
  validateCodeAsync,
  stripMarkdownFences,
  extractComponentCode,
  extractRecommendedDuration,
  extractIconsFromCode,
  preloadBabelWorker,
};
