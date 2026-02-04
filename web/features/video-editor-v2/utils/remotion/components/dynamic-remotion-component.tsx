/**
 * DynamicRemotionComponent - Runtime JSX Compiler for AI-generated Motion Graphics
 * 
 * This component safely compiles and renders AI-generated Remotion component code
 * using @babel/standalone for JSX transformation.
 * 
 * Used by:
 * - Main video editor preview (motion-graphics-layer-content.tsx)
 * - Composition editor preview (composition-preview.tsx)
 */

import React, { useState, useEffect, useRef, useMemo } from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import * as Babel from "@babel/standalone";

// ==========================================
// REMOTION GLOBALS FOR DYNAMIC COMPONENTS
// ==========================================

// Make Remotion functions available globally for AI-generated code
if (typeof window !== 'undefined') {
  (window as any).Remotion = {
    interpolate,
    spring,
    useCurrentFrame,
    useVideoConfig,
    Easing,
  };
  
  // Also expose React for JSX
  (window as any).React = React;
}

// ==========================================
// BABEL JSX COMPILER
// ==========================================

/**
 * Compile JSX code to JavaScript using Babel
 */
export const compileJSX = (code: string): string | null => {
  try {
    // Clean up the code - remove markdown code blocks if present
    let cleanCode = code
      .replace(/```(?:jsx?|javascript|typescript|tsx)?\s*/g, '')
      .replace(/```\s*/g, '')
      .trim();

    // Configure Babel to transform JSX
    const result = Babel.transform(cleanCode, {
      presets: ['react'],
      plugins: [],
      filename: 'motion-graphic.jsx',
    });

    return result?.code || null;
  } catch (error) {
    console.error('Babel compilation error:', error);
    return null;
  }
};

// ==========================================
// COMPONENT CACHE
// ==========================================

/**
 * Cache for compiled components to avoid recompilation
 */
const componentCache = new Map<string, React.FC<any>>();

// ==========================================
// DYNAMIC REMOTION COMPONENT
// ==========================================

export interface DynamicRemotionComponentProps {
  code: string;
  props: Record<string, any>;
  frame: number;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
}

/**
 * Safely evaluate and render AI-generated Remotion component code using Babel
 */
export const DynamicRemotionComponent: React.FC<DynamicRemotionComponentProps> = ({
  code,
  props,
  frame,
  durationInFrames,
  fps,
  width,
  height,
}) => {
  const [renderedContent, setRenderedContent] = useState<React.ReactNode>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCompiling, setIsCompiling] = useState(true);
  const componentRef = useRef<React.FC<any> | null>(null);
  const codeHashRef = useRef<string>('');

  // Generate a hash for the code to use as cache key
  const codeHash = useMemo(() => {
    return btoa(code.slice(0, 100) + code.length).replace(/[^a-zA-Z0-9]/g, '');
  }, [code]);

  // Compile the component code once using Babel
  useEffect(() => {
    if (!code || codeHash === codeHashRef.current) {
      if (componentRef.current) {
        setIsCompiling(false);
      }
      return;
    }
    
    codeHashRef.current = codeHash;
    setIsCompiling(true);
    setError(null);

    // Check cache first
    if (componentCache.has(codeHash)) {
      componentRef.current = componentCache.get(codeHash) || null;
      setIsCompiling(false);
      return;
    }
    
    try {
      // Compile JSX to JavaScript using Babel
      const compiledCode = compileJSX(code);
      
      if (!compiledCode) {
        throw new Error('Babel compilation returned empty result');
      }

      // Extract component name from the compiled code
      // Look for patterns like: const ComponentName = ... or function ComponentName(
      const constMatch = compiledCode.match(/(?:const|let|var)\s+(\w+)\s*=/);
      const functionMatch = compiledCode.match(/function\s+(\w+)\s*\(/);
      const componentName = constMatch?.[1] || functionMatch?.[1];

      // Build the evaluation code using string concatenation to avoid template literal conflicts
      // The compiled code may contain template literals that would be incorrectly evaluated
      // if we use template literals here
      const evalCode = [
        '"use strict";',
        'var React = window.React;',
        'var interpolate = window.Remotion.interpolate;',
        'var spring = window.Remotion.spring;',
        'var useCurrentFrame = window.Remotion.useCurrentFrame;',
        'var useVideoConfig = window.Remotion.useVideoConfig;',
        'var Easing = window.Remotion.Easing;',
        '',
        compiledCode,
        '',
        'return ' + (componentName || 'null') + ';',
      ].join('\n');

      // Create the component
      const createComponent = new Function('React', 'window', evalCode);
      const Component = createComponent(React, window);
      
      if (typeof Component === 'function') {
        componentRef.current = Component;
        componentCache.set(codeHash, Component);
        setError(null);
      } else {
        throw new Error(`Generated code did not produce a valid React component. Got: ${typeof Component}`);
      }
    } catch (err) {
      console.error('[DynamicRemotionComponent] Failed to compile:', err);
      setError(err instanceof Error ? err.message : 'Failed to compile component');
      componentRef.current = null;
    } finally {
      setIsCompiling(false);
    }
  }, [code, codeHash]);

  // Render the component with current props
  useEffect(() => {
    if (isCompiling) {
      setRenderedContent(
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0,0,0,0.8)',
          color: '#FFFFFF',
          fontFamily: 'Inter, system-ui, sans-serif',
          padding: 20,
          textAlign: 'center',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40,
              height: 40,
              border: '3px solid rgba(255,255,255,0.2)',
              borderTopColor: '#A855F7',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }} />
            <span>Compiling motion graphic...</span>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      );
      return;
    }

    if (!componentRef.current) {
      if (!error) {
        setRenderedContent(null);
      }
      return;
    }

    try {
      const Component = componentRef.current;
      const element = React.createElement(Component, {
        ...props,
        frame,
        durationInFrames,
        fps,
        width,
        height,
      });
      setRenderedContent(element);
      setError(null);
    } catch (err) {
      console.error('[DynamicRemotionComponent] Failed to render:', err);
      setError(err instanceof Error ? err.message : 'Failed to render component');
    }
  }, [props, frame, durationInFrames, fps, width, height, error, isCompiling]);

  if (error) {
    return (
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1a1a2e',
        color: '#FFFFFF',
        fontFamily: 'Inter, system-ui, sans-serif',
        padding: 40,
        textAlign: 'center',
      }}>
        <div style={{
          width: 60,
          height: 60,
          borderRadius: '50%',
          backgroundColor: 'rgba(239, 68, 68, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 20,
        }}>
          <span style={{ fontSize: 28 }}>⚠️</span>
        </div>
        <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
          Motion Graphic Error
        </h3>
        <p style={{ fontSize: 14, opacity: 0.7, maxWidth: 400 }}>
          {error}
        </p>
        <p style={{ fontSize: 12, opacity: 0.5, marginTop: 16, maxWidth: 500 }}>
          Try regenerating or modifying the animation with a different prompt.
        </p>
      </div>
    );
  }

  return <>{renderedContent}</>;
};

export default DynamicRemotionComponent;
