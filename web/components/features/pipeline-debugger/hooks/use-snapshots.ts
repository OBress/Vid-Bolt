/**
 * use-snapshots Hook
 * ============================================================================
 * Manages pipeline snapshots using localStorage for persistence.
 * Provides CRUD operations, tag management, import/export, and search.
 * 
 * No Supabase table required — snapshots are local dev tool data.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { PipelineSnapshot, PipelineStep, PipelineRun, SnapshotFormData } from '../types/pipeline-debugger';

const STORAGE_KEY = 'pipeline-debugger-snapshots';

// ============================================================================
// HELPERS
// ============================================================================

function loadSnapshots(): PipelineSnapshot[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistSnapshots(snapshots: PipelineSnapshot[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshots));
}

// ============================================================================
// HOOK
// ============================================================================

export function useSnapshots() {
  const [snapshots, setSnapshots] = useState<PipelineSnapshot[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    setSnapshots(loadSnapshots());
    setIsLoaded(true);
  }, []);

  // Persist whenever snapshots change (after initial load)
  useEffect(() => {
    if (isLoaded) {
      persistSnapshots(snapshots);
    }
  }, [snapshots, isLoaded]);

  // ---- CRUD ----

  const saveSnapshot = useCallback((
    step: PipelineStep,
    stepLabel: string,
    data: PipelineSnapshot['data'],
    formData: SnapshotFormData,
    sourceVideoId?: string,
    sourceVideoName?: string,
    fullRun?: PipelineRun | null,
  ) => {
    const newSnapshot: PipelineSnapshot = {
      id: crypto.randomUUID(),
      userId: '',
      name: formData.name,
      description: formData.description || null,
      pipelineStep: step,
      stepLabel,
      isFullPipeline: !!fullRun,
      data,
      fullRun: fullRun || null,
      tags: formData.tags,
      sourceVideoId: sourceVideoId || null,
      sourceVideoName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setSnapshots((prev) => [newSnapshot, ...prev]);
    return newSnapshot;
  }, []);

  const saveFullPipelineSnapshot = useCallback((
    fullRun: PipelineRun,
    formData: SnapshotFormData,
    sourceVideoId?: string,
    sourceVideoName?: string,
  ) => {
    const newSnapshot: PipelineSnapshot = {
      id: crypto.randomUUID(),
      userId: '',
      name: formData.name,
      description: formData.description || null,
      pipelineStep: null,
      stepLabel: `Full Pipeline (${fullRun.steps.filter(s => s.status === 'complete').length}/8 steps)`,
      isFullPipeline: true,
      data: { inputs: {}, outputs: {}, config: {} },
      fullRun,
      tags: formData.tags,
      sourceVideoId: sourceVideoId || null,
      sourceVideoName: sourceVideoName || fullRun.videoName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setSnapshots((prev) => [newSnapshot, ...prev]);
    return newSnapshot;
  }, []);

  const deleteSnapshot = useCallback((id: string) => {
    setSnapshots((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const updateSnapshot = useCallback((id: string, updates: Partial<PipelineSnapshot>) => {
    setSnapshots((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, ...updates, updatedAt: new Date().toISOString() } : s
      )
    );
  }, []);

  const clearAll = useCallback(() => {
    setSnapshots([]);
  }, []);

  // ---- TAGS ----

  const addTag = useCallback((id: string, tag: string) => {
    setSnapshots((prev) =>
      prev.map((s) =>
        s.id === id && !s.tags.includes(tag)
          ? { ...s, tags: [...s.tags, tag], updatedAt: new Date().toISOString() }
          : s
      )
    );
  }, []);

  const removeTag = useCallback((id: string, tag: string) => {
    setSnapshots((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, tags: s.tags.filter((t) => t !== tag), updatedAt: new Date().toISOString() }
          : s
      )
    );
  }, []);

  // ---- IMPORT / EXPORT ----

  const exportSnapshots = useCallback((ids?: string[]) => {
    const toExport = ids
      ? snapshots.filter((s) => ids.includes(s.id))
      : snapshots;
    const json = JSON.stringify(toExport, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pipeline-snapshots-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [snapshots]);

  const importSnapshots = useCallback((jsonString: string) => {
    try {
      const imported = JSON.parse(jsonString) as PipelineSnapshot[];
      if (!Array.isArray(imported)) throw new Error('Invalid format');
      // Assign new IDs to avoid conflicts
      const withNewIds = imported.map((s) => ({
        ...s,
        id: crypto.randomUUID(),
        createdAt: s.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));
      setSnapshots((prev) => [...withNewIds, ...prev]);
      return withNewIds.length;
    } catch {
      console.error('[useSnapshots] Failed to import snapshots');
      return 0;
    }
  }, []);

  // ---- FILTERING ----

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const s of snapshots) {
      for (const t of s.tags) tagSet.add(t);
    }
    return Array.from(tagSet).sort();
  }, [snapshots]);

  const filterSnapshots = useCallback(
    (filters: { step?: PipelineStep; tag?: string; search?: string }) => {
      return snapshots.filter((s) => {
        if (filters.step && s.pipelineStep !== filters.step) return false;
        if (filters.tag && !s.tags.includes(filters.tag)) return false;
        if (filters.search) {
          const q = filters.search.toLowerCase();
          return (
            s.name.toLowerCase().includes(q) ||
            s.description?.toLowerCase().includes(q) ||
            s.stepLabel.toLowerCase().includes(q) ||
            s.sourceVideoName?.toLowerCase().includes(q)
          );
        }
        return true;
      });
    },
    [snapshots]
  );

  return {
    snapshots,
    isLoaded,
    allTags,
    saveSnapshot,
    saveFullPipelineSnapshot,
    deleteSnapshot,
    updateSnapshot,
    clearAll,
    addTag,
    removeTag,
    exportSnapshots,
    importSnapshots,
    filterSnapshots,
  };
}
