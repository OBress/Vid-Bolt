/**
 * Pipeline Debugger — TypeScript Types
 * ============================================================================
 * Comprehensive type definitions for the Pipeline Debugger system.
 * Covers runs, steps, snapshots, breakpoints, quality scores, annotations,
 * and the comparator.
 */

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

export type PipelineStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type StepStatus =
  | 'not-reached'
  | 'in-progress'
  | 'complete'
  | 'error'
  | 'skipped'
  | 'paused';

export type DebuggerMode = 'inspect' | 'compare' | 'replay' | 'snapshot';

export type BreakpointType = 'unconditional' | 'conditional';

export type AnnotationTarget = 'step' | 'media' | 'prompt' | 'output';

export type MediaType = 'image' | 'video' | 'audio' | 'motiongraphic';

// ============================================================================
// STEP DATA
// ============================================================================

/** Data extracted from a single pipeline step */
export interface StepData {
  step: PipelineStep;
  label: string;
  status: StepStatus;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  config: Record<string, unknown>;
  prompts: StepPrompt[];
  timing: StepTiming | null;
  errors: StepError[];
  logs: StepLog[];
  media: StepMedia[];
}

export interface StepPrompt {
  id: string;
  label: string;
  systemPrompt?: string;
  userPrompt?: string;
  model?: string;
  temperature?: number;
  tokenCount?: number;
}

export interface StepTiming {
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  queueWaitMs: number | null;
  retryCount: number;
}

export interface StepError {
  message: string;
  code?: string;
  timestamp?: string;
  stack?: string;
  retryAttempt?: number;
}

export interface StepMedia {
  id: string;
  type: MediaType;
  url: string;
  label: string;
  shotIndex?: number;
  width?: number;
  height?: number;
  durationSeconds?: number;
  generationStatus?: string;
}

export interface StepLog {
  timestamp: string;
  level: 'info' | 'warning' | 'error' | 'debug';
  phase: string;
  message: string;
  detail?: string;
}

// ============================================================================
// PIPELINE RUN
// ============================================================================

/** A complete pipeline run extracted from a video project */
export interface PipelineRun {
  id: string; // video project ID
  videoName: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  currentStage: string;
  steps: StepData[];
  totalDurationMs: number | null;
  metadata: Record<string, unknown>; // Raw metadata for fallback access
}

/** Summary card for a pipeline run (list view) */
export interface PipelineRunSummary {
  id: string;
  videoName: string;
  currentStage: string;
  stepsCompleted: number;
  totalSteps: number;
  createdAt: string;
  updatedAt: string;
  hasErrors: boolean;
}

// ============================================================================
// SNAPSHOTS
// ============================================================================

/** A saved pipeline state snapshot */
export interface PipelineSnapshot {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  pipelineStep: PipelineStep | null; // null = full pipeline snapshot
  stepLabel: string;
  isFullPipeline: boolean;
  data: {
    inputs: Record<string, unknown>;
    outputs: Record<string, unknown>;
    config: Record<string, unknown>;
  };
  /** Full pipeline run data — allows loading snapshot as a virtual video */
  fullRun: PipelineRun | null;
  tags: string[];
  sourceVideoId: string | null;
  sourceVideoName?: string;
  createdAt: string;
  updatedAt: string;
}

/** Form data for creating/editing a snapshot */
export interface SnapshotFormData {
  name: string;
  description: string;
  tags: string[];
}

// ============================================================================
// BREAKPOINTS
// ============================================================================

export interface Breakpoint {
  step: PipelineStep;
  type: BreakpointType;
  enabled: boolean;
  condition?: BreakpointCondition;
  label?: string;
}

export interface BreakpointCondition {
  /** JS expression evaluated against step data, e.g. "outputs.shots.length < 10" */
  expression: string;
  description: string;
}

export interface BreakpointPauseState {
  step: PipelineStep;
  capturedState: Record<string, unknown>;
  timestamp: string;
}

// ============================================================================
// QUALITY SCORING
// ============================================================================

export type QualityDimension =
  | 'prompt_adherence'
  | 'visual_quality'
  | 'pacing'
  | 'coherence'
  | 'overall';

export interface QualityScore {
  id: string;
  userId: string;
  videoId: string;
  pipelineStep: PipelineStep;
  overallScore: number; // 1-5
  dimensionScores: Partial<Record<QualityDimension, number>>;
  notes: string | null;
  createdAt: string;
}

// ============================================================================
// ANNOTATIONS
// ============================================================================

export interface PipelineAnnotation {
  id: string;
  userId: string;
  videoId: string;
  pipelineStep: PipelineStep | null;
  targetType: AnnotationTarget;
  targetId: string | null;
  content: string;
  parentId: string | null;
  children?: PipelineAnnotation[];
  createdAt: string;
}

// ============================================================================
// COMPARATOR
// ============================================================================

export interface RunComparison {
  runA: PipelineRun;
  runB: PipelineRun;
  stepDiffs: StepDiff[];
  metricDeltas: MetricDelta[];
}

export interface StepDiff {
  step: PipelineStep;
  label: string;
  inputDiff: DiffResult;
  outputDiff: DiffResult;
  configDiff: DiffResult;
  promptDiffs: PromptDiff[];
  timingDelta: {
    durationDeltaMs: number | null;
    retryDelta: number;
  };
}

export interface DiffResult {
  added: string[];
  removed: string[];
  changed: Array<{
    path: string;
    oldValue: unknown;
    newValue: unknown;
  }>;
  unchanged: number;
}

export interface PromptDiff {
  promptLabel: string;
  systemPromptDiff?: string; // unified diff text
  userPromptDiff?: string;
}

export interface MetricDelta {
  label: string;
  category: string;
  valueA: number | string;
  valueB: number | string;
  delta: number | null;
  improved: boolean | null; // null = can't determine
}

// ============================================================================
// PERFORMANCE PROFILING
// ============================================================================

export interface PerformanceProfile {
  videoId: string;
  steps: StepPerformance[];
  totalDurationMs: number;
  estimatedCost: number;
}

export interface StepPerformance {
  step: PipelineStep;
  label: string;
  durationMs: number;
  queueWaitMs: number;
  retryCount: number;
  apiCalls: ApiCallRecord[];
  estimatedCost: number;
}

export interface ApiCallRecord {
  service: string; // 'gemini', 'tts', 'gpu', 'pixabay', 'serper'
  endpoint: string;
  durationMs: number;
  status: 'success' | 'error' | 'retry';
  tokenCount?: number;
  errorMessage?: string;
}

// ============================================================================
// STORE STATE
// ============================================================================

export interface PipelineDebuggerState {
  // Mode
  mode: DebuggerMode;
  
  // Inspector
  selectedVideoId: string | null;
  selectedRun: PipelineRun | null;
  selectedStep: PipelineStep | null;
  isLoadingRun: boolean;
  
  // Comparator
  compareRunA: PipelineRun | null;
  compareRunB: PipelineRun | null;
  comparison: RunComparison | null;
  
  // Snapshots
  snapshots: PipelineSnapshot[];
  isLoadingSnapshots: boolean;
  selectedSnapshot: PipelineSnapshot | null;
  
  // Breakpoints
  breakpoints: Map<PipelineStep, Breakpoint>;
  isPaused: boolean;
  pauseState: BreakpointPauseState | null;
  overrideData: Record<string, unknown> | null;
  
  // Quality
  qualityScores: QualityScore[];
  
  // Annotations
  annotations: PipelineAnnotation[];
  
  // UI State
  rightPanelTab: 'json' | 'media' | 'prompts' | 'annotations' | 'quality' | 'performance';
  inspectorTab: 'inputs' | 'outputs' | 'config' | 'prompts' | 'logs' | 'timing';
}

export interface PipelineDebuggerActions {
  // Mode
  setMode: (mode: DebuggerMode) => void;
  
  // Inspector
  selectVideo: (videoId: string) => void;
  selectStep: (step: PipelineStep | null) => void;
  loadRun: (videoId: string) => Promise<void>;
  loadSnapshotAsRun: (snapshot: PipelineSnapshot) => void;
  
  // Comparator
  setCompareRunA: (run: PipelineRun | null) => void;
  setCompareRunB: (run: PipelineRun | null) => void;
  generateComparison: () => void;
  
  // Snapshots
  loadSnapshots: () => Promise<void>;
  saveSnapshot: (snapshot: Omit<PipelineSnapshot, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  deleteSnapshot: (id: string) => Promise<void>;
  selectSnapshot: (snapshot: PipelineSnapshot | null) => void;
  
  // Breakpoints
  toggleBreakpoint: (step: PipelineStep) => void;
  setConditionalBreakpoint: (step: PipelineStep, condition: BreakpointCondition) => void;
  removeBreakpoint: (step: PipelineStep) => void;
  clearAllBreakpoints: () => void;
  pauseAt: (step: PipelineStep, state: Record<string, unknown>) => void;
  resume: () => void;
  setOverrideData: (data: Record<string, unknown> | null) => void;
  
  // Quality
  addQualityScore: (score: Omit<QualityScore, 'id' | 'userId' | 'createdAt'>) => Promise<void>;
  
  // Annotations
  addAnnotation: (annotation: Omit<PipelineAnnotation, 'id' | 'userId' | 'createdAt'>) => Promise<void>;
  
  // UI
  setRightPanelTab: (tab: PipelineDebuggerState['rightPanelTab']) => void;
  setInspectorTab: (tab: PipelineDebuggerState['inspectorTab']) => void;
}
