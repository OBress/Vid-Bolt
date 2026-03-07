/**
 * Graph Reviewer
 * ============================================================================
 * Self-reflective validation of DAG configurations before execution.
 *
 * Phase C of Agent Graph Orchestration (from VideoAgent A.11):
 * Two-step review process:
 *   1. Check execution sequence, parameter routing, redundancy, requirement fulfillment
 *   2. Meta-review: "Was Step 1's verdict correct? Any overlooked aspects?"
 *
 * Catches configuration errors before expensive GPU work begins.
 */

import { callOpenRouter } from '@/lib/ai/openrouter';
import { topologicalSort } from './dag-executor';
import type { GraphTemplate } from './graph-templates';
import type { CreativeManifest } from '@/lib/types/closed-loop';

// ============================================================================
// TYPES
// ============================================================================

export interface ReviewResult {
  /** Whether the graph is approved for execution */
  approved: boolean;
  /** Issues found during review */
  issues: ReviewIssue[];
  /** Suggestions for improvements (non-blocking) */
  suggestions: string[];
  /** Auto-corrected modifications applied to the graph */
  corrections: GraphCorrection[];
  /** The (possibly corrected) graph template */
  reviewedTemplate: GraphTemplate;
}

export interface ReviewIssue {
  severity: 'critical' | 'warning' | 'info';
  nodeId?: string;
  message: string;
}

export interface GraphCorrection {
  type: 'add_dependency' | 'remove_node' | 'add_node' | 'skip_node';
  nodeId: string;
  detail: string;
}

const LOG_PREFIX = '[GraphReviewer]';

// ============================================================================
// STRUCTURAL VALIDATION (STATIC CHECKS)
// ============================================================================

/**
 * Perform static structural validation of a graph template.
 * These are fast, deterministic checks that don't require an LLM.
 */
export function validateGraphStructure(template: GraphTemplate): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const nodeIds = new Set(template.nodes.map((n) => n.id));

  // 1. Check for missing TTS node (required root)
  const hasTts = template.nodes.some((n) => n.type === 'tts');
  if (!hasTts) {
    issues.push({
      severity: 'critical',
      message: 'Graph is missing a TTS node — every pipeline must start with text-to-speech.',
    });
  }

  // 2. Check for missing edit_assembly or pacing_review (required terminal nodes)
  const hasAssembly = template.nodes.some((n) => n.type === 'edit_assembly');
  if (!hasAssembly) {
    issues.push({
      severity: 'warning',
      message: 'Graph is missing edit_assembly — videos cannot be assembled without it.',
    });
  }

  // 3. Check for dangling dependency references
  for (const node of template.nodes) {
    for (const depId of node.dependencies) {
      if (!nodeIds.has(depId)) {
        issues.push({
          severity: 'critical',
          nodeId: node.id,
          message: `Node "${node.id}" depends on "${depId}" which doesn't exist in the graph.`,
        });
      }
    }
  }

  // 4. Check for dangling edge references
  for (const edge of template.edges) {
    if (!nodeIds.has(edge.from)) {
      issues.push({
        severity: 'critical',
        message: `Edge references source node "${edge.from}" which doesn't exist.`,
      });
    }
    if (!nodeIds.has(edge.to)) {
      issues.push({
        severity: 'critical',
        message: `Edge references target node "${edge.to}" which doesn't exist.`,
      });
    }
  }

  // 5. Check for cycles via topological sort
  try {
    topologicalSort(template);
  } catch {
    issues.push({
      severity: 'critical',
      message: 'Graph contains a cycle — DAGs must be acyclic.',
    });
  }

  // 6. Check for unreachable nodes (no dependency chain from TTS)
  const reachable = new Set<string>();
  const queue = template.nodes
    .filter((n) => n.dependencies.length === 0)
    .map((n) => n.id);

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (reachable.has(id)) continue;
    reachable.add(id);

    // Find nodes that depend on this one
    for (const node of template.nodes) {
      if (node.dependencies.includes(id) && !reachable.has(node.id)) {
        queue.push(node.id);
      }
    }
  }

  for (const node of template.nodes) {
    if (!reachable.has(node.id)) {
      issues.push({
        severity: 'warning',
        nodeId: node.id,
        message: `Node "${node.id}" (${node.label}) is unreachable — no dependency chain from root nodes.`,
      });
    }
  }

  // 7. Check edge consistency with node dependencies
  for (const edge of template.edges) {
    const targetNode = template.nodes.find((n) => n.id === edge.to);
    if (targetNode && !targetNode.dependencies.includes(edge.from)) {
      issues.push({
        severity: 'info',
        nodeId: edge.to,
        message: `Edge ${edge.from} → ${edge.to} exists but "${edge.to}" doesn't list "${edge.from}" in dependencies. Edge is informational only.`,
      });
    }
  }

  return issues;
}

// ============================================================================
// LLM REVIEW (SEMANTIC CHECKS)
// ============================================================================

/**
 * LLM-based semantic review of the graph.
 * Checks for logic errors that static analysis can't catch:
 * - Is the execution order sensible?
 * - Are there redundant nodes?
 * - Are all requirements from the manifest fulfilled?
 */
async function performLLMReview(
  userId: string,
  template: GraphTemplate,
  manifest: CreativeManifest,
): Promise<{ issues: ReviewIssue[]; suggestions: string[] }> {
  const systemPrompt = `You are a production pipeline reviewer for an AI video system.
Review the following DAG (directed acyclic graph) for correctness and efficiency.

Check for:
1. **Execution order**: Does the sequence make sense? (e.g., verification before generation is wrong)
2. **Redundancy**: Are there duplicate or unnecessary nodes?
3. **Missing requirements**: Does the manifest require features the graph doesn't provide?
4. **Parallelism**: Could independent nodes run in parallel but are serialized unnecessarily?
5. **Data flow**: Do all nodes receive the data they need from their dependencies?

Respond ONLY with valid JSON:
{
  "issues": [
    { "severity": "critical" | "warning" | "info", "nodeId": "optional_node_id", "message": "description" }
  ],
  "suggestions": ["improvement suggestion 1", "improvement suggestion 2"]
}`;

  const nodeList = template.nodes
    .map(
      (n) =>
        `  ${n.id} (${n.type}): deps=[${n.dependencies.join(', ')}]${n.skippable ? ' [skippable]' : ''}`,
    )
    .join('\n');

  const userPrompt = `## GRAPH: "${template.name}"
${template.description}

## NODES
${nodeList}

## EDGES
${template.edges.map((e) => `  ${e.from} → ${e.to}: ${e.dataFlow || 'data'}`).join('\n')}

## MANIFEST REQUIREMENTS
- LoRA: ${manifest.lora ? 'Yes' : 'No'}
- Stock footage weight: ${manifest.media_weighting?.stock_footage ?? 0.3}
- MG weight: ${manifest.media_weighting?.motion_graphics ?? 0.2}
- Pacing: ${manifest.editing?.pacing_preset || 'documentary'}

Please review this pipeline configuration.`;

  try {
    const response = await callOpenRouter(
      userId,
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { model: 'google/gemini-3-flash-preview' },
    );

    let cleaned = response.content.trim();
    if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
    else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
    if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
    cleaned = cleaned.trim();

    const parsed = JSON.parse(cleaned);
    return {
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
    };
  } catch (err) {
    console.warn(`${LOG_PREFIX} LLM review failed:`, err);
    return { issues: [], suggestions: [] };
  }
}

// ============================================================================
// META-REVIEW
// ============================================================================

/**
 * Step 2: Meta-review of the initial LLM review.
 * "Was Step 1's verdict correct? Any overlooked aspects?"
 */
async function performMetaReview(
  userId: string,
  template: GraphTemplate,
  initialIssues: ReviewIssue[],
  initialSuggestions: string[],
): Promise<{ additionalIssues: ReviewIssue[]; overturnedIssues: string[] }> {
  if (initialIssues.length === 0 && initialSuggestions.length === 0) {
    return { additionalIssues: [], overturnedIssues: [] };
  }

  const systemPrompt = `You are a senior quality reviewer examining a pipeline review.
The initial reviewer analyzed a video production DAG and found the following issues.
Your job: validate the initial review and catch anything overlooked.

Respond ONLY with valid JSON:
{
  "additionalIssues": [{ "severity": "critical" | "warning" | "info", "message": "..." }],
  "overturnedIssues": ["message of issue that was wrong/too strict"]
}`;

  const userPrompt = `## GRAPH
${template.nodes.length} nodes, ${template.edges.length} edges

## INITIAL REVIEW
Issues found:
${initialIssues.map((i) => `- [${i.severity}] ${i.nodeId ? `(${i.nodeId}) ` : ''}${i.message}`).join('\n')}

Suggestions:
${initialSuggestions.map((s) => `- ${s}`).join('\n')}

Was this review accurate? Did it miss anything?`;

  try {
    const response = await callOpenRouter(
      userId,
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { model: 'google/gemini-3-flash-preview' },
    );

    let cleaned = response.content.trim();
    if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
    else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
    if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
    cleaned = cleaned.trim();

    const parsed = JSON.parse(cleaned);
    return {
      additionalIssues: Array.isArray(parsed.additionalIssues)
        ? parsed.additionalIssues
        : [],
      overturnedIssues: Array.isArray(parsed.overturnedIssues)
        ? parsed.overturnedIssues
        : [],
    };
  } catch (err) {
    console.warn(`${LOG_PREFIX} Meta-review failed:`, err);
    return { additionalIssues: [], overturnedIssues: [] };
  }
}

// ============================================================================
// MAIN REVIEW FUNCTION
// ============================================================================

/**
 * Full two-step review of a graph template.
 *
 * Step 1: Structural validation + LLM semantic review
 * Step 2: Meta-review of Step 1's findings
 *
 * Returns approved=true if no critical issues remain after review.
 *
 * @param userId - For API key retrieval
 * @param template - The graph template to review
 * @param manifest - Creative manifest for requirement checking
 * @param skipLLMReview - If true, only run structural validation (faster, cheaper)
 */
export async function reviewGraph(
  userId: string,
  template: GraphTemplate,
  manifest: CreativeManifest,
  skipLLMReview = false,
): Promise<ReviewResult> {
  console.log(
    `${LOG_PREFIX} Reviewing graph "${template.name}" (${template.nodes.length} nodes)...`,
  );

  // Step 0: Structural validation
  const structuralIssues = validateGraphStructure(template);

  // If critical structural issues, reject immediately
  const criticalStructural = structuralIssues.filter(
    (i) => i.severity === 'critical',
  );
  if (criticalStructural.length > 0) {
    console.error(
      `${LOG_PREFIX} Graph rejected: ${criticalStructural.length} critical structural issues`,
    );
    return {
      approved: false,
      issues: structuralIssues,
      suggestions: [],
      corrections: [],
      reviewedTemplate: template,
    };
  }

  // Step 1: LLM semantic review
  let llmIssues: ReviewIssue[] = [];
  let suggestions: string[] = [];

  if (!skipLLMReview) {
    const llmReview = await performLLMReview(userId, template, manifest);
    llmIssues = llmReview.issues;
    suggestions = llmReview.suggestions;

    // Step 2: Meta-review
    if (llmIssues.length > 0 || suggestions.length > 0) {
      const metaReview = await performMetaReview(
        userId,
        template,
        llmIssues,
        suggestions,
      );

      // Add newly discovered issues
      llmIssues = [
        ...llmIssues.filter(
          (i) => !metaReview.overturnedIssues.includes(i.message),
        ),
        ...metaReview.additionalIssues,
      ];
    }
  }

  // Combine all issues
  const allIssues = [...structuralIssues, ...llmIssues];
  const hasCritical = allIssues.some((i) => i.severity === 'critical');

  const result: ReviewResult = {
    approved: !hasCritical,
    issues: allIssues,
    suggestions,
    corrections: [],
    reviewedTemplate: template,
  };

  console.log(
    `${LOG_PREFIX} Review complete: ${result.approved ? 'APPROVED' : 'REJECTED'} ` +
      `(${allIssues.filter((i) => i.severity === 'critical').length} critical, ` +
      `${allIssues.filter((i) => i.severity === 'warning').length} warnings, ` +
      `${allIssues.filter((i) => i.severity === 'info').length} info)`,
  );

  return result;
}
