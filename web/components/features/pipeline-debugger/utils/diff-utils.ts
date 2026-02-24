/**
 * Diff Utilities
 * ============================================================================
 * Computes structural diffs between two pipeline runs — objects, arrays,
 * and primitives. Used by the Run Comparator for A/B analysis.
 */

import type {
  PipelineRun,
  RunComparison,
  StepDiff,
  DiffResult,
  PromptDiff,
  MetricDelta,
} from '../types/pipeline-debugger';
import { ALL_STEPS, STEP_CONFIGS } from './step-config';
import type { PipelineStep } from '../types/pipeline-debugger';

// ============================================================================
// MAIN COMPARISON GENERATOR
// ============================================================================

export function generateRunComparison(
  runA: PipelineRun,
  runB: PipelineRun
): RunComparison {
  const stepDiffs: StepDiff[] = ALL_STEPS.map((step) => {
    const stepA = runA.steps.find((s) => s.step === step);
    const stepB = runB.steps.find((s) => s.step === step);

    return {
      step,
      label: STEP_CONFIGS[step].label,
      inputDiff: diffObjects(stepA?.inputs || {}, stepB?.inputs || {}),
      outputDiff: diffObjects(stepA?.outputs || {}, stepB?.outputs || {}),
      configDiff: diffObjects(stepA?.config || {}, stepB?.config || {}),
      promptDiffs: diffPrompts(stepA?.prompts || [], stepB?.prompts || []),
      timingDelta: {
        durationDeltaMs:
          stepA?.timing?.durationMs != null && stepB?.timing?.durationMs != null
            ? stepB.timing.durationMs - stepA.timing.durationMs
            : null,
        retryDelta:
          (stepB?.timing?.retryCount || 0) - (stepA?.timing?.retryCount || 0),
      },
    };
  });

  const metricDeltas = generateMetricDeltas(runA, runB);

  return { runA, runB, stepDiffs, metricDeltas };
}

// ============================================================================
// OBJECT DIFFING
// ============================================================================

export function diffObjects(
  objA: Record<string, unknown>,
  objB: Record<string, unknown>
): DiffResult {
  const keysA = new Set(Object.keys(objA));
  const keysB = new Set(Object.keys(objB));

  const added: string[] = [];
  const removed: string[] = [];
  const changed: Array<{ path: string; oldValue: unknown; newValue: unknown }> = [];
  let unchanged = 0;

  // Keys only in B → added
  for (const key of keysB) {
    if (!keysA.has(key)) {
      added.push(key);
    }
  }

  // Keys only in A → removed
  for (const key of keysA) {
    if (!keysB.has(key)) {
      removed.push(key);
    }
  }

  // Keys in both → compare
  for (const key of keysA) {
    if (keysB.has(key)) {
      if (!deepEqual(objA[key], objB[key])) {
        changed.push({ path: key, oldValue: objA[key], newValue: objB[key] });
      } else {
        unchanged++;
      }
    }
  }

  return { added, removed, changed, unchanged };
}

// ============================================================================
// PROMPT DIFFING
// ============================================================================

function diffPrompts(
  promptsA: PipelineRun['steps'][0]['prompts'],
  promptsB: PipelineRun['steps'][0]['prompts']
): PromptDiff[] {
  const diffs: PromptDiff[] = [];
  const maxLen = Math.max(promptsA.length, promptsB.length);

  for (let i = 0; i < maxLen; i++) {
    const pA = promptsA[i];
    const pB = promptsB[i];
    const label = pA?.label || pB?.label || `Prompt ${i}`;

    if (pA?.systemPrompt !== pB?.systemPrompt || pA?.userPrompt !== pB?.userPrompt) {
      diffs.push({
        promptLabel: label,
        systemPromptDiff:
          pA?.systemPrompt !== pB?.systemPrompt
            ? generateTextDiff(pA?.systemPrompt || '', pB?.systemPrompt || '')
            : undefined,
        userPromptDiff:
          pA?.userPrompt !== pB?.userPrompt
            ? generateTextDiff(pA?.userPrompt || '', pB?.userPrompt || '')
            : undefined,
      });
    }
  }

  return diffs;
}

// ============================================================================
// METRIC DELTAS
// ============================================================================

function generateMetricDeltas(
  runA: PipelineRun,
  runB: PipelineRun
): MetricDelta[] {
  const deltas: MetricDelta[] = [];

  // Stage comparison
  deltas.push({
    label: 'Current Stage',
    category: 'Pipeline',
    valueA: runA.currentStage,
    valueB: runB.currentStage,
    delta: null,
    improved: null,
  });

  // Steps completed
  const completedA = runA.steps.filter((s) => s.status === 'complete').length;
  const completedB = runB.steps.filter((s) => s.status === 'complete').length;
  deltas.push({
    label: 'Steps Completed',
    category: 'Pipeline',
    valueA: completedA,
    valueB: completedB,
    delta: completedB - completedA,
    improved: completedB >= completedA,
  });

  // Error count
  const errorsA = runA.steps.reduce((n, s) => n + s.errors.length, 0);
  const errorsB = runB.steps.reduce((n, s) => n + s.errors.length, 0);
  deltas.push({
    label: 'Total Errors',
    category: 'Quality',
    valueA: errorsA,
    valueB: errorsB,
    delta: errorsB - errorsA,
    improved: errorsB <= errorsA,
  });

  // Media count (step 6)
  const mediaA = runA.steps.find((s) => s.step === 6)?.media.length || 0;
  const mediaB = runB.steps.find((s) => s.step === 6)?.media.length || 0;
  deltas.push({
    label: 'Generated Media',
    category: 'Media',
    valueA: mediaA,
    valueB: mediaB,
    delta: mediaB - mediaA,
    improved: null,
  });

  // Script word count (step 3 output)
  const wordsA = getScriptWordCount(runA);
  const wordsB = getScriptWordCount(runB);
  if (wordsA || wordsB) {
    deltas.push({
      label: 'Script Words',
      category: 'Content',
      valueA: wordsA,
      valueB: wordsB,
      delta: wordsB - wordsA,
      improved: null,
    });
  }

  return deltas;
}

function getScriptWordCount(run: PipelineRun): number {
  const scriptStep = run.steps.find((s) => s.step === 3);
  const wordCount = scriptStep?.outputs?.scriptWordCount;
  return typeof wordCount === 'number' ? wordCount : 0;
}

// ============================================================================
// HELPERS
// ============================================================================

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a as Record<string, unknown>);
    const keysB = Object.keys(b as Record<string, unknown>);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((k) =>
      deepEqual(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k]
      )
    );
  }

  return false;
}

/**
 * Simple line-based text diff — shows added/removed lines.
 * Full diff library can be added later if needed.
 */
function generateTextDiff(textA: string, textB: string): string {
  const linesA = textA.split('\n');
  const linesB = textB.split('\n');
  const result: string[] = [];

  const maxLen = Math.max(linesA.length, linesB.length);
  for (let i = 0; i < maxLen; i++) {
    const lineA = linesA[i];
    const lineB = linesB[i];

    if (lineA === lineB) {
      result.push(`  ${lineA || ''}`);
    } else {
      if (lineA !== undefined) result.push(`- ${lineA}`);
      if (lineB !== undefined) result.push(`+ ${lineB}`);
    }
  }

  return result.join('\n');
}

/**
 * Summarize a DiffResult for display.
 */
export function summarizeDiff(diff: DiffResult): string {
  const parts: string[] = [];
  if (diff.added.length) parts.push(`+${diff.added.length} added`);
  if (diff.removed.length) parts.push(`-${diff.removed.length} removed`);
  if (diff.changed.length) parts.push(`~${diff.changed.length} changed`);
  if (diff.unchanged) parts.push(`${diff.unchanged} same`);
  return parts.join(', ') || 'identical';
}

export function hasDifferences(diff: DiffResult): boolean {
  return diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0;
}
