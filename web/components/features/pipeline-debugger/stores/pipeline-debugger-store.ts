/**
 * Pipeline Debugger Store
 * ============================================================================
 * Zustand store managing all Pipeline Debugger state: mode, inspector,
 * comparator, snapshots, breakpoints, quality, and annotations.
 */

import { create } from 'zustand';
import type {
  PipelineDebuggerState,
  PipelineDebuggerActions,
  PipelineRun,
  PipelineStep,
  DebuggerMode,
  Breakpoint,
  BreakpointCondition,
  PipelineSnapshot,
  QualityScore,
  PipelineAnnotation,
} from '../types/pipeline-debugger';
import { extractPipelineRun } from '../utils/pipeline-data-extractor';

type DebuggerStore = PipelineDebuggerState & PipelineDebuggerActions;

export const usePipelineDebuggerStore = create<DebuggerStore>()((set, get) => ({
  // ============================
  // MODE
  // ============================
  mode: 'inspect' as DebuggerMode,
  setMode: (mode) => set({ mode }),

  // ============================
  // INSPECTOR
  // ============================
  selectedVideoId: null,
  selectedRun: null,
  selectedStep: null,
  isLoadingRun: false,

  selectVideo: (videoId) => {
    set({ selectedVideoId: videoId, selectedRun: null, selectedStep: null });
    get().loadRun(videoId);
  },

  selectStep: (step) => set({ selectedStep: step }),

  loadRun: async (videoId) => {
    set({ isLoadingRun: true });
    try {
      const response = await fetch(`/api/videos/${videoId}`);
      if (!response.ok) throw new Error('Failed to load video');
      const data = await response.json();
      const run = extractPipelineRun(data.video, {
        audioChunks: data.audioChunks,
        linkedTasks: data.linkedTasks,
      });
      set({ selectedRun: run, isLoadingRun: false });
    } catch (error) {
      console.error('[PipelineDebugger] Failed to load run:', error);
      set({ isLoadingRun: false });
    }
  },

  loadSnapshotAsRun: (snapshot) => {
    if (snapshot.fullRun) {
      set({
        selectedVideoId: `snapshot:${snapshot.id}`,
        selectedRun: snapshot.fullRun,
        selectedStep: null,
        isLoadingRun: false,
      });
    }
  },

  // ============================
  // COMPARATOR
  // ============================
  compareRunA: null,
  compareRunB: null,
  comparison: null,

  setCompareRunA: (run) => set({ compareRunA: run, comparison: null }),
  setCompareRunB: (run) => set({ compareRunB: run, comparison: null }),
  generateComparison: () => {
    // Comparison generation is handled by diff-utils (Phase 3)
    // Placeholder — will be wired up during Phase 3 implementation
  },

  // ============================
  // SNAPSHOTS
  // ============================
  snapshots: [],
  isLoadingSnapshots: false,
  selectedSnapshot: null,

  loadSnapshots: async () => {
    set({ isLoadingSnapshots: true });
    try {
      const response = await fetch('/api/pipeline-debugger/snapshots');
      if (!response.ok) throw new Error('Failed to load snapshots');
      const data = await response.json();
      set({ snapshots: data.snapshots || [], isLoadingSnapshots: false });
    } catch (error) {
      console.error('[PipelineDebugger] Failed to load snapshots:', error);
      set({ isLoadingSnapshots: false });
    }
  },

  saveSnapshot: async (snapshot) => {
    try {
      const response = await fetch('/api/pipeline-debugger/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
      });
      if (!response.ok) throw new Error('Failed to save snapshot');
      const data = await response.json();
      set((state) => ({
        snapshots: [...state.snapshots, data.snapshot],
      }));
    } catch (error) {
      console.error('[PipelineDebugger] Failed to save snapshot:', error);
      throw error;
    }
  },

  deleteSnapshot: async (id) => {
    try {
      await fetch(`/api/pipeline-debugger/snapshots/${id}`, { method: 'DELETE' });
      set((state) => ({
        snapshots: state.snapshots.filter((s) => s.id !== id),
        selectedSnapshot:
          state.selectedSnapshot?.id === id ? null : state.selectedSnapshot,
      }));
    } catch (error) {
      console.error('[PipelineDebugger] Failed to delete snapshot:', error);
      throw error;
    }
  },

  selectSnapshot: (snapshot) => set({ selectedSnapshot: snapshot }),

  // ============================
  // BREAKPOINTS
  // ============================
  breakpoints: new Map(),
  isPaused: false,
  pauseState: null,
  overrideData: null,

  toggleBreakpoint: (step) => {
    const breakpoints = new Map(get().breakpoints);
    if (breakpoints.has(step)) {
      breakpoints.delete(step);
    } else {
      breakpoints.set(step, {
        step,
        type: 'unconditional',
        enabled: true,
      });
    }
    set({ breakpoints });
  },

  setConditionalBreakpoint: (step, condition) => {
    const breakpoints = new Map(get().breakpoints);
    breakpoints.set(step, {
      step,
      type: 'conditional',
      enabled: true,
      condition,
    });
    set({ breakpoints });
  },

  removeBreakpoint: (step) => {
    const breakpoints = new Map(get().breakpoints);
    breakpoints.delete(step);
    set({ breakpoints });
  },

  clearAllBreakpoints: () => {
    set({ breakpoints: new Map() });
  },

  pauseAt: (step, state) => {
    set({
      isPaused: true,
      pauseState: {
        step,
        capturedState: state,
        timestamp: new Date().toISOString(),
      },
    });
  },

  resume: () => {
    set({
      isPaused: false,
      pauseState: null,
      overrideData: null,
    });
  },

  setOverrideData: (data) => set({ overrideData: data }),

  // ============================
  // QUALITY
  // ============================
  qualityScores: [],

  addQualityScore: async (score) => {
    try {
      const response = await fetch('/api/pipeline-debugger/quality-scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(score),
      });
      if (!response.ok) throw new Error('Failed to save quality score');
      const data = await response.json();
      set((state) => ({
        qualityScores: [...state.qualityScores, data.score],
      }));
    } catch (error) {
      console.error('[PipelineDebugger] Failed to save quality score:', error);
      throw error;
    }
  },

  // ============================
  // ANNOTATIONS
  // ============================
  annotations: [],

  addAnnotation: async (annotation) => {
    try {
      const response = await fetch('/api/pipeline-debugger/annotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(annotation),
      });
      if (!response.ok) throw new Error('Failed to save annotation');
      const data = await response.json();
      set((state) => ({
        annotations: [...state.annotations, data.annotation],
      }));
    } catch (error) {
      console.error('[PipelineDebugger] Failed to save annotation:', error);
      throw error;
    }
  },

  // ============================
  // UI STATE
  // ============================
  rightPanelTab: 'json',
  inspectorTab: 'inputs',

  setRightPanelTab: (tab) => set({ rightPanelTab: tab }),
  setInspectorTab: (tab) => set({ inspectorTab: tab }),
}));
