/**
 * DynamicComposition - Renders dynamically compiled Remotion code
 * 
 * This component takes JSX code as a prop, compiles it in-browser using Babel,
 * and renders the resulting component. Used for AI-generated motion graphics.
 * 
 * Based on the Remotion template-prompt-to-motion-graphics pattern.
 */

import React, { useEffect, useState, useMemo } from 'react';
import {
  delayRender,
  continueRender,
  AbsoluteFill,
} from 'remotion';
import { compileCodeAsync, type CompilationResult } from '../remotion-compiler';

// ============================================================
// TYPES
// ============================================================

export interface DynamicCompositionProps {
  /** The Remotion JSX code to compile and render */
  code: string;
  /** Callback when compilation completes (success or error) */
  onCompilationResult?: (result: CompilationResult) => void;
  /** Whether to show error display in the composition */
  showErrorDisplay?: boolean;
  /** List of icon names used in the code (from backend analysis) */
  usedIcons?: string[];
  /** Callback when the rendered component throws a runtime error */
  onRuntimeError?: (error: string) => void;
}

// ============================================================
// ERROR DISPLAY COMPONENT
// ============================================================

interface CompilationErrorDisplayProps {
  error: string;
}

const CompilationErrorDisplay: React.FC<CompilationErrorDisplayProps> = ({ error }) => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#1a1a2e',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 60,
      }}
    >
      <div
        style={{
          color: '#ff6b6b',
          fontSize: 42,
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center',
          maxWidth: '80%',
        }}
      >
        Compilation Error
      </div>
      <div
        style={{
          color: '#fff',
          fontSize: 24,
          fontFamily: 'monospace',
          marginTop: 24,
          textAlign: 'center',
          maxWidth: '80%',
          wordBreak: 'break-word',
        }}
      >
        {error}
      </div>
    </AbsoluteFill>
  );
};

// ============================================================
// RUNTIME ERROR BOUNDARY
// ============================================================

interface RuntimeErrorBoundaryProps {
  children: React.ReactNode;
  onError?: (error: string) => void;
  showErrorDisplay?: boolean;
}

interface RuntimeErrorBoundaryState {
  error: string | null;
}

/**
 * Catches runtime errors thrown during React render of AI-generated code.
 * Without this, a crash in the generated component silently unmounts it → blank white screen.
 */
class RuntimeErrorBoundary extends React.Component<RuntimeErrorBoundaryProps, RuntimeErrorBoundaryState> {
  state: RuntimeErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): RuntimeErrorBoundaryState {
    return { error: error.message };
  }

  componentDidCatch(error: Error) {
    console.error('[DynamicComposition] Runtime error in generated code:', error.message);
    this.props.onError?.(error.message);
  }

  componentDidUpdate(prevProps: RuntimeErrorBoundaryProps) {
    // Reset error state when children change (new code compiled)
    if (prevProps.children !== this.props.children && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      if (this.props.showErrorDisplay !== false) {
        return <CompilationErrorDisplay error={`Runtime Error: ${this.state.error}`} />;
      }
      return null;
    }
    return this.props.children;
  }
}

// ============================================================
// LOADING DISPLAY COMPONENT
// ============================================================

const LoadingDisplay: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#1a1a2e',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          color: '#a855f7',
          fontSize: 24,
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        Compiling...
      </div>
    </AbsoluteFill>
  );
};

// ============================================================
// MAIN COMPONENT
// ============================================================

/**
 * DynamicComposition - Compiles and renders Remotion code dynamically
 * 
 * Usage:
 * ```tsx
 * <DynamicComposition 
 *   code={jsxCode} 
 *   onCompilationResult={(result) => console.log(result)}
 * />
 * ```
 */
export const DynamicComposition: React.FC<DynamicCompositionProps> = ({
  code,
  onCompilationResult,
  showErrorDisplay = true,
  usedIcons,
  onRuntimeError,
}) => {
  const [handle] = useState(() => delayRender('Compiling code...'));
  const [Component, setComponent] = useState<React.ComponentType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCompiling, setIsCompiling] = useState(true);

  useEffect(() => {
    if (!code?.trim()) {
      console.error('[DynamicComposition] No code provided');
      setError('No code provided');
      setComponent(null);
      setIsCompiling(false);
      continueRender(handle);
      onCompilationResult?.({ Component: null, error: 'No code provided' });
      return;
    }

    console.log('[DynamicComposition] Compiling code:', code.substring(0, 200) + '...');
    if (usedIcons?.length) {
      console.log('[DynamicComposition] Using icons from backend:', usedIcons);
    }
    setIsCompiling(true);

    // Use async compilation (Web Worker when available)
    const compile = async () => {
      try {
        // Pass usedIcons to the compiler if available
        const result = await compileCodeAsync(code, { usedIcons });

        if (result.error) {
          console.error('[DynamicComposition] Compilation error:', result.error);
          setError(result.error);
          setComponent(null);
        } else {
          console.log('[DynamicComposition] Compilation successful');
          setComponent(() => result.Component);
          setError(null);
        }

        onCompilationResult?.(result);
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'Unknown error';
        console.error('[DynamicComposition] Compilation exception:', errorMessage);
        setError(errorMessage);
        setComponent(null);
        onCompilationResult?.({ Component: null, error: errorMessage });
      } finally {
        setIsCompiling(false);
        continueRender(handle);
      }
    };

    compile();
  }, [code, handle, onCompilationResult]);

  if (isCompiling) {
    return <LoadingDisplay />;
  }

  if (error && showErrorDisplay) {
    return <CompilationErrorDisplay error={error} />;
  }

  if (!Component) {
    return null;
  }

  return (
    <RuntimeErrorBoundary
      onError={onRuntimeError}
      showErrorDisplay={showErrorDisplay}
    >
      <Component />
    </RuntimeErrorBoundary>
  );
};

// ============================================================
// WRAPPER FOR PLAYER
// ============================================================

/**
 * DynamicCompositionWrapper - A wrapper that can be used with Remotion Player
 * 
 * This component is designed to receive code via inputProps and render it.
 * Use this when you need to render the composition in a Remotion Player.
 */
export interface DynamicCompositionWrapperProps {
  code?: string;
}

// Module-level runtime error handler — Remotion inputProps can't serialize functions,
// so external code registers a handler via setRuntimeErrorHandler() instead.
let _runtimeErrorHandler: ((error: string) => void) | null = null;

/**
 * Register a callback for runtime errors from DynamicCompositionWrapper.
 * Call with `null` to unregister.
 */
export function setRuntimeErrorHandler(handler: ((error: string) => void) | null) {
  _runtimeErrorHandler = handler;
}

export const DynamicCompositionWrapper: React.FC<DynamicCompositionWrapperProps> = ({
  code = '',
}) => {
  return (
    <DynamicComposition
      code={code}
      onRuntimeError={_runtimeErrorHandler || undefined}
    />
  );
};

// ============================================================
// HOOK FOR COMPILATION
// ============================================================

/**
 * useCompiledCode - Hook for compiling Remotion code
 * 
 * Returns the compiled component and any error.
 * Debounces compilation to avoid excessive recompilation.
 * Uses async compilation (Web Worker when available).
 */
export function useCompiledCode(code: string, debounceMs: number = 500) {
  const [result, setResult] = useState<CompilationResult>({
    Component: null,
    error: null,
  });
  const [isCompiling, setIsCompiling] = useState(false);

  useEffect(() => {
    if (!code?.trim()) {
      setResult({ Component: null, error: 'No code provided' });
      return;
    }

    setIsCompiling(true);

    const timeoutId = setTimeout(async () => {
      try {
        const compilationResult = await compileCodeAsync(code);
        setResult(compilationResult);
      } catch (e) {
        setResult({
          Component: null,
          error: e instanceof Error ? e.message : 'Unknown error',
        });
      } finally {
        setIsCompiling(false);
      }
    }, debounceMs);

    return () => clearTimeout(timeoutId);
  }, [code, debounceMs]);

  return { ...result, isCompiling };
}

export default DynamicComposition;
