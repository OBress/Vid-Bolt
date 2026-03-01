/**
 * DAG Executor
 * ============================================================================
 * Generic directed acyclic graph walker that replaces the fixed phase loop.
 *
 * Features:
 * - Topological sort of nodes
 * - Parallel execution of independent branches
 * - Skip condition evaluation at runtime
 * - State persistence for crash recovery
 * - Progress estimation from node estimated durations
 *
 * This module is execution-strategy agnostic: it determines WHAT to run and
 * WHEN, but delegates actual work to the caller-provided dispatch function.
 */

import { getGraphTemplate, SKIP_CONDITIONS } from './graph-templates';
import type { GraphTemplate, GraphNode } from './graph-templates';
import type { ClassificationResult } from './intent-classifier';

// ============================================================================
// TYPES
// ============================================================================

export type NodeStatus = 'pending' | 'ready' | 'running' | 'completed' | 'skipped' | 'failed';

export interface NodeState {
  nodeId: string;
  type: string;
  label: string;
  status: NodeStatus;
  /** Timestamp when execution started */
  startedAt?: string;
  /** Timestamp when execution completed */
  completedAt?: string;
  /** Error message if failed */
  error?: string;
  /** Output data from this node (for downstream nodes) */
  output?: Record<string, unknown>;
}

export interface DAGState {
  /** Graph template used */
  templateId: string;
  /** Classification result that selected this template */
  classification: ClassificationResult;
  /** Per-node execution state */
  nodes: Record<string, NodeState>;
  /** Current execution phase (for progress) */
  currentPhase: string;
  /** Overall progress (0-1) */
  progress: number;
  /** Started at timestamp */
  startedAt: string;
  /** Completed at timestamp */
  completedAt?: string;
}

/**
 * Dispatch function provided by the orchestrator.
 * Called when a node is ready to execute.
 * Should return the output data from the node.
 */
export type NodeDispatcher = (
  node: GraphNode,
  inputs: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

const LOG_PREFIX = '[DAGExecutor]';

// ============================================================================
// TOPOLOGICAL SORT
// ============================================================================

/**
 * Kahn's algorithm for topological sorting.
 * Returns nodes in execution order, respecting dependencies.
 */
export function topologicalSort(template: GraphTemplate): GraphNode[] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  // Initialize
  for (const node of template.nodes) {
    inDegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }

  // Build adjacency and in-degree from edges
  for (const edge of template.edges) {
    adjacency.get(edge.from)?.push(edge.to);
    inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
  }

  // Start with nodes that have no incoming edges
  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  const sorted: GraphNode[] = [];
  const nodeMap = new Map(template.nodes.map((n) => [n.id, n]));

  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = nodeMap.get(id);
    if (node) sorted.push(node);

    for (const neighbor of adjacency.get(id) || []) {
      const newDegree = (inDegree.get(neighbor) || 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  if (sorted.length !== template.nodes.length) {
    throw new Error(
      `${LOG_PREFIX} Cycle detected in graph template "${template.id}" — sorted ${sorted.length}/${template.nodes.length} nodes`,
    );
  }

  return sorted;
}

// ============================================================================
// DAG STATE MANAGEMENT
// ============================================================================

/**
 * Initialize DAG state from a template and classification result.
 */
export function initializeDAGState(
  classification: ClassificationResult,
  manifest: Record<string, unknown>,
): DAGState {
  const template = getGraphTemplate(classification.templateId);
  const nodes: Record<string, NodeState> = {};

  for (const node of template.nodes) {
    // Determine if this node should be skipped
    let shouldSkip = false;

    // Check classifier-suggested skips
    if (classification.suggestedSkips.includes(node.id)) {
      shouldSkip = true;
    }

    // Check skip conditions from manifest
    if (node.skippable && node.skipCondition) {
      const skipFn = SKIP_CONDITIONS[node.skipCondition];
      if (skipFn && skipFn(manifest)) {
        shouldSkip = true;
      }
    }

    nodes[node.id] = {
      nodeId: node.id,
      type: node.type,
      label: node.label,
      status: shouldSkip ? 'skipped' : 'pending',
    };
  }

  return {
    templateId: classification.templateId,
    classification,
    nodes,
    currentPhase: 'initializing',
    progress: 0,
    startedAt: new Date().toISOString(),
  };
}

/**
 * Get all nodes that are ready to execute (all dependencies satisfied).
 */
export function getReadyNodes(state: DAGState): string[] {
  const template = getGraphTemplate(state.templateId);
  const ready: string[] = [];

  for (const node of template.nodes) {
    const nodeState = state.nodes[node.id];
    if (!nodeState || nodeState.status !== 'pending') continue;

    // Check if all dependencies are satisfied
    const depsComplete = node.dependencies.every((depId) => {
      const depState = state.nodes[depId];
      return (
        depState &&
        (depState.status === 'completed' || depState.status === 'skipped')
      );
    });

    if (depsComplete) {
      ready.push(node.id);
    }
  }

  return ready;
}

/**
 * Mark a node as started.
 */
export function markNodeRunning(state: DAGState, nodeId: string): DAGState {
  return updateNodeState(state, nodeId, {
    status: 'running',
    startedAt: new Date().toISOString(),
  });
}

/**
 * Mark a node as completed with its output.
 */
export function markNodeCompleted(
  state: DAGState,
  nodeId: string,
  output?: Record<string, unknown>,
): DAGState {
  const updated = updateNodeState(state, nodeId, {
    status: 'completed',
    completedAt: new Date().toISOString(),
    output,
  });

  return recalculateProgress(updated);
}

/**
 * Mark a node as failed.
 */
export function markNodeFailed(
  state: DAGState,
  nodeId: string,
  error: string,
): DAGState {
  return updateNodeState(state, nodeId, {
    status: 'failed',
    completedAt: new Date().toISOString(),
    error,
  });
}

/**
 * Check if the entire DAG is complete (all nodes completed or skipped).
 */
export function isDAGComplete(state: DAGState): boolean {
  return Object.values(state.nodes).every(
    (n) =>
      n.status === 'completed' ||
      n.status === 'skipped' ||
      n.status === 'failed',
  );
}

/**
 * Check if the DAG has any failed nodes.
 */
export function hasFailedNodes(state: DAGState): boolean {
  return Object.values(state.nodes).some((n) => n.status === 'failed');
}

/**
 * Get a summary of the DAG state for logging.
 */
export function getDAGStatusSummary(state: DAGState): string {
  const counts = { pending: 0, ready: 0, running: 0, completed: 0, skipped: 0, failed: 0 };
  for (const node of Object.values(state.nodes)) {
    counts[node.status]++;
  }
  return `[${state.templateId}] P:${counts.pending} Rdy:${counts.ready} Run:${counts.running} ✓:${counts.completed} Skip:${counts.skipped} ✗:${counts.failed} — ${(state.progress * 100).toFixed(0)}%`;
}

// ============================================================================
// EXECUTION LOOP
// ============================================================================

/**
 * Execute the DAG by repeatedly finding ready nodes and dispatching them.
 *
 * This is the main execution loop. It:
 * 1. Finds all ready nodes (dependencies satisfied)
 * 2. Dispatches them in parallel via the provided dispatcher
 * 3. Collects results and updates state
 * 4. Repeats until all nodes are complete
 *
 * @param state - Initial DAG state
 * @param dispatch - Function to execute a single node
 * @param onStateChange - Callback for state persistence / UI updates
 * @returns Final DAG state
 */
export async function executeDAG(
  state: DAGState,
  dispatch: NodeDispatcher,
  onStateChange?: (state: DAGState) => Promise<void>,
): Promise<DAGState> {
  const template = getGraphTemplate(state.templateId);
  const nodeMap = new Map(template.nodes.map((n) => [n.id, n]));

  let current = state;
  let iterations = 0;
  const maxIterations = template.nodes.length * 2; // Safety limit

  while (!isDAGComplete(current) && iterations < maxIterations) {
    iterations++;

    const readyIds = getReadyNodes(current);

    if (readyIds.length === 0) {
      // No ready nodes and not complete — deadlock or all running
      const runningNodes = Object.values(current.nodes).filter(
        (n) => n.status === 'running',
      );
      if (runningNodes.length === 0) {
        console.error(
          `${LOG_PREFIX} Deadlock: no ready or running nodes. State: ${getDAGStatusSummary(current)}`,
        );
        break;
      }
      // In a real BullMQ integration, we'd wait for running jobs to complete
      // For now, break and let the caller handle re-entry
      console.log(
        `${LOG_PREFIX} Waiting for ${runningNodes.length} running nodes...`,
      );
      break;
    }

    console.log(
      `${LOG_PREFIX} Dispatching ${readyIds.length} nodes: ${readyIds.join(', ')}`,
    );

    // Mark all ready nodes as running
    for (const id of readyIds) {
      current = markNodeRunning(current, id);
    }

    // Persist state before dispatching
    if (onStateChange) await onStateChange(current);

    // Execute all ready nodes in parallel
    const results = await Promise.allSettled(
      readyIds.map(async (id) => {
        const node = nodeMap.get(id)!;

        // Gather inputs from completed dependencies
        const inputs: Record<string, unknown> = {};
        for (const depId of node.dependencies) {
          const depState = current.nodes[depId];
          if (depState?.output) {
            inputs[depId] = depState.output;
          }
        }

        const output = await dispatch(node, inputs);
        return { id, output };
      }),
    );

    // Process results
    for (const result of results) {
      if (result.status === 'fulfilled') {
        current = markNodeCompleted(
          current,
          result.value.id,
          result.value.output,
        );
      } else {
        const failedId = readyIds[results.indexOf(result)];
        current = markNodeFailed(
          current,
          failedId,
          result.reason instanceof Error
            ? result.reason.message
            : 'Unknown error',
        );
      }
    }

    // Update phase label
    const runningNodes = Object.values(current.nodes).filter(
      (n) => n.status === 'running',
    );
    current = {
      ...current,
      currentPhase:
        runningNodes.length > 0
          ? runningNodes.map((n) => n.label).join(' + ')
          : 'Waiting...',
    };

    // Persist state after processing
    if (onStateChange) await onStateChange(current);
  }

  // Mark DAG as complete
  if (isDAGComplete(current)) {
    current = {
      ...current,
      completedAt: new Date().toISOString(),
      progress: 1,
      currentPhase: hasFailedNodes(current) ? 'Completed with errors' : 'Complete',
    };
    console.log(`${LOG_PREFIX} DAG execution complete: ${getDAGStatusSummary(current)}`);
  }

  return current;
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

function updateNodeState(
  state: DAGState,
  nodeId: string,
  updates: Partial<NodeState>,
): DAGState {
  return {
    ...state,
    nodes: {
      ...state.nodes,
      [nodeId]: {
        ...state.nodes[nodeId],
        ...updates,
      },
    },
  };
}

function recalculateProgress(state: DAGState): DAGState {
  const total = Object.keys(state.nodes).length;
  const done = Object.values(state.nodes).filter(
    (n) =>
      n.status === 'completed' ||
      n.status === 'skipped' ||
      n.status === 'failed',
  ).length;

  return {
    ...state,
    progress: total > 0 ? done / total : 0,
  };
}
