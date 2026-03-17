/**
 * Copy Debug Context Utility
 * ============================================================================
 * Builds a structured text representation of pipeline debug data for
 * wizard steps 3 (Production) and 4 (Editor), targeting pipeline steps 5-7.
 * Designed to be copied to clipboard for AI-assisted debugging.
 */

import type { PipelineRun, StepData, PipelineStep } from '../types/pipeline-debugger';

// Pipeline steps corresponding to wizard step 3 (Production) + step 4 (Editor)
const DEBUG_STEPS: PipelineStep[] = [5, 6, 7];

/**
 * Build a comprehensive debug context string from a pipeline run.
 * Gathers inputs, outputs, errors, logs, timing, and BullMQ data
 * for steps 5-7 (Shot Creation, Scene Review, Editor).
 */
export function buildDebugContext(run: PipelineRun): string {
  const lines: string[] = [];

  // Header
  lines.push('# Pipeline Debug Context');
  lines.push(`Video ID: ${run.id}`);
  lines.push(`Video Name: ${run.videoName || 'N/A'}`);
  lines.push(`Current Stage: ${run.currentStage}`);
  lines.push(`Run Timestamp: ${run.createdAt}`);
  lines.push('');

  // Per-step data
  for (const stepNum of DEBUG_STEPS) {
    const step = run.steps.find(s => s.step === stepNum);
    if (!step) continue;

    lines.push(`## Step ${step.step}: ${step.label} [${step.status}]`);
    lines.push('');

    // Inputs
    if (step.inputs && Object.keys(step.inputs).length > 0) {
      lines.push('### Inputs');
      lines.push('```json');
      lines.push(safeStringify(step.inputs));
      lines.push('```');
      lines.push('');
    }

    // Outputs (summarized — truncate large objects)
    if (step.outputs && Object.keys(step.outputs).length > 0) {
      lines.push('### Outputs');
      lines.push('```json');
      lines.push(safeStringify(summarizeOutputs(step.outputs)));
      lines.push('```');
      lines.push('');
    }

    // Config
    if (step.config && Object.keys(step.config).length > 0) {
      lines.push('### Config');
      lines.push('```json');
      lines.push(safeStringify(step.config));
      lines.push('```');
      lines.push('');
    }

    // Errors
    if (step.errors.length > 0) {
      lines.push('### Errors');
      for (const err of step.errors) {
        lines.push(`- ${err.code ? `[${err.code}] ` : ''}${err.message}`);
        if (err.stack) {
          lines.push(`  Stack: ${err.stack.substring(0, 200)}`);
        }
      }
      lines.push('');
    }

    // Logs
    if (step.logs.length > 0) {
      lines.push('### Logs');
      for (const log of step.logs) {
        const ts = log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : '';
        lines.push(`- [${log.level.toUpperCase()}] ${ts} ${log.phase ? `(${log.phase}) ` : ''}${log.message}`);
        if (log.detail) {
          // Truncate very long detail strings
          const detail = log.detail.length > 500 ? log.detail.substring(0, 500) + '...' : log.detail;
          lines.push(`  Detail: ${detail}`);
        }
      }
      lines.push('');
    }

    // Timing
    if (step.timing) {
      lines.push('### Timing');
      lines.push(`- Duration: ${step.timing.durationMs ? `${(step.timing.durationMs / 1000).toFixed(1)}s` : 'N/A'}`);
      lines.push(`- Queue Wait: ${step.timing.queueWaitMs ? `${(step.timing.queueWaitMs / 1000).toFixed(1)}s` : 'N/A'}`);
      lines.push(`- Retries: ${step.timing.retryCount}`);
      if (step.timing.startedAt) {
        lines.push(`- Started: ${new Date(step.timing.startedAt).toLocaleTimeString()}`);
      }
      lines.push('');
    }

    // Media summary
    if (step.media.length > 0) {
      lines.push('### Media');
      lines.push(`Total: ${step.media.length} items`);
      const byType = step.media.reduce((acc, m) => {
        acc[m.type] = (acc[m.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      lines.push(`Breakdown: ${Object.entries(byType).map(([t, c]) => `${c} ${t}`).join(', ')}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Summarize outputs for clipboard — truncate large objects like EDLs and media maps.
 */
function summarizeOutputs(outputs: Record<string, unknown>): Record<string, unknown> {
  const summarized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(outputs)) {
    if (key === 'edl' || key === 'agentEdl') {
      // Summarize EDL — just show clip count and track info
      if (value && typeof value === 'object') {
        const edl = value as Record<string, unknown>;
        summarized[key] = {
          clipCount: Array.isArray(edl.clips) ? edl.clips.length : 0,
          trackCount: Array.isArray(edl.tracks) ? edl.tracks.length : 0,
          transitionCount: Array.isArray(edl.transitions) ? edl.transitions.length : 0,
          mediaIssueCount: Array.isArray(edl.mediaIssues) ? edl.mediaIssues.length : 0,
        };
      } else {
        summarized[key] = value;
      }
    } else if (key === 'generated_videos' || key === 'generated_images' || key === 'generated_motion_graphics') {
      // Show keys only, not full URLs
      if (value && typeof value === 'object') {
        const map = value as Record<string, string>;
        summarized[key] = {
          count: Object.keys(map).length,
          shots: Object.keys(map),
        };
      } else {
        summarized[key] = value;
      }
    } else if (key === 'generatedMedia' && Array.isArray(value)) {
      // Summarize legacy array
      summarized[key] = `${value.length} items`;
    } else if (key === 'avScriptPart1Output' && value && typeof value === 'object') {
      // Shot plan — just show shot count
      const plan = value as Record<string, unknown>;
      summarized[key] = {
        shotCount: Array.isArray(plan.shots) ? plan.shots.length : 'N/A',
        metadata: plan.metadata || null,
      };
    } else {
      summarized[key] = value;
    }
  }

  return summarized;
}

/**
 * Safe JSON stringify with circular reference handling and size limits.
 */
function safeStringify(obj: unknown, maxLength = 5000): string {
  try {
    const str = JSON.stringify(obj, null, 2);
    if (str.length > maxLength) {
      return str.substring(0, maxLength) + '\n... (truncated)';
    }
    return str;
  } catch {
    return String(obj);
  }
}
