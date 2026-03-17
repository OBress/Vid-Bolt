'use client';

/**
 * useVramMode Hook
 * ============================================================================
 * Client-side hook to fetch and set the GPU VRAM loading mode via
 * the Next.js proxy routes:
 *   GET  /api/gpu-api/settings/vram-mode
 *   POST /api/gpu-api/settings/vram-mode
 *
 * Only fetches when the VM API is ready (vmApiReady === true).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { VramMode } from '@/lib/services/gpu-api-service';

interface UseVramModeReturn {
  /** Current VRAM mode (null if not yet fetched or VM is off) */
  currentMode: VramMode | null;
  /** True while the initial mode fetch is in-flight */
  isLoading: boolean;
  /** True while a mode switch request is in-flight */
  isSwitching: boolean;
  /** Last error message, if any */
  error: string | null;
  /** Switch the VRAM mode to 'all'. Resolves true on success. */
  switchToAll: () => Promise<boolean>;
  /** Whether the GPU is fully ready for editor AI generation */
  isGpuReady: boolean;
}

export function useVramMode(vmApiReady: boolean): UseVramModeReturn {
  const [currentMode, setCurrentMode] = useState<VramMode | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasFetchedRef = useRef(false);

  // Fetch current VRAM mode when VM becomes ready
  useEffect(() => {
    if (!vmApiReady) {
      // Reset when VM goes offline
      setCurrentMode(null);
      setError(null);
      hasFetchedRef.current = false;
      return;
    }

    // Only fetch once per "ready" transition
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetch('/api/gpu-api/settings/vram-mode')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled && data.success && data.data?.mode) {
          setCurrentMode(data.data.mode as VramMode);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('[useVramMode] Failed to fetch VRAM mode:', err);
          setError(err instanceof Error ? err.message : 'Failed to fetch VRAM mode');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [vmApiReady]);

  // Switch to "all" mode
  const switchToAll = useCallback(async (): Promise<boolean> => {
    if (isSwitching) return false;

    setIsSwitching(true);
    setError(null);

    try {
      const res = await fetch('/api/gpu-api/settings/vram-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'all' }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      if (data.success) {
        setCurrentMode('all');
        console.log('[useVramMode] Successfully switched to "all" mode');
        return true;
      } else {
        throw new Error(data.error || 'Switch failed');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to switch VRAM mode';
      console.error('[useVramMode] Switch error:', msg);
      setError(msg);
      return false;
    } finally {
      setIsSwitching(false);
    }
  }, [isSwitching]);

  const isGpuReady = vmApiReady && currentMode === 'all';

  return {
    currentMode,
    isLoading,
    isSwitching,
    error,
    switchToAll,
    isGpuReady,
  };
}
