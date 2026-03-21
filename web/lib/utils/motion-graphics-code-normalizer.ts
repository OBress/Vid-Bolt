/**
 * Motion graphics code normalizer shared by the server validation path and the
 * client-side Remotion compiler.
 *
 * The runtime accepts two input shapes:
 * 1. Component body snippets
 * 2. Full TSX modules with imports / exports
 *
 * This helper strips decorative syntax and emits canonical source that always
 * defines `DynamicAnimation`, while preserving helper declarations that appear
 * above the component.
 */

export type MotionGraphicSourceKind = 'body' | 'module';

export interface NormalizedMotionGraphicCode {
  sourceKind: MotionGraphicSourceKind;
  helperCode: string;
  componentParams: string;
  componentBody: string;
  normalizedCode: string;
}

type ComponentPattern = {
  kind: 'arrow' | 'function';
  regex: RegExp;
};

type ComponentCandidate = {
  kind: 'arrow' | 'function';
  start: number;
  bodyStart: number;
  bodyEnd: number;
  depth: number;
  params: string;
  body: string;
  score: number;
};

const COMPONENT_PATTERNS: ComponentPattern[] = [
  {
    kind: 'arrow',
    regex:
      /\bexport\s+const\s+([A-Za-z_$][\w$]*)(?:\s*:\s*[^=]+)?\s*=\s*\(([^)]*)\)\s*(?::\s*[^=]+)?\s*=>\s*\{/g,
  },
  {
    kind: 'arrow',
    regex:
      /\bconst\s+([A-Za-z_$][\w$]*)(?:\s*:\s*[^=]+)?\s*=\s*\(([^)]*)\)\s*(?::\s*[^=]+)?\s*=>\s*\{/g,
  },
  {
    kind: 'function',
    regex:
      /\bexport\s+default\s+function(?:\s+([A-Za-z_$][\w$]*))?\s*\(([^)]*)\)\s*\{/g,
  },
  {
    kind: 'function',
    regex:
      /\bexport\s+function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/g,
  },
  {
    kind: 'function',
    regex:
      /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/g,
  },
];

/**
 * Strip markdown fences that sometimes wrap AI-generated TSX.
 */
export function stripMarkdownFences(code: string): string {
  let cleaned = code.replace(/^```(?:tsx|typescript|jsx|javascript)?\s*\n?/gm, '');
  cleaned = cleaned.replace(/\n?```\s*$/gm, '');
  return cleaned.trim();
}

function stripDecorativeSyntax(code: string): string {
  let cleaned = stripMarkdownFences(code);

  cleaned = cleaned.replace(/^\/\/\s*ICONS:.*$/gm, '');

  cleaned = cleaned.replace(/import\s+type\s*\{[\s\S]*?\}\s*from\s*["'][^"']+["'];?/g, '');
  cleaned = cleaned.replace(/import\s+\w+\s*,\s*\{[\s\S]*?\}\s*from\s*["'][^"']+["'];?/g, '');
  cleaned = cleaned.replace(/import\s*\{[\s\S]*?\}\s*from\s*["'][^"']+["'];?/g, '');
  cleaned = cleaned.replace(/import\s+\*\s+as\s+\w+\s+from\s*["'][^"']+["'];?/g, '');
  cleaned = cleaned.replace(/import\s+\w+\s+from\s*["'][^"']+["'];?/g, '');
  cleaned = cleaned.replace(/import\s*["'][^"']+["'];?/g, '');

  return cleaned.trim();
}

function stripExportSyntax(code: string): string {
  let cleaned = code;

  cleaned = cleaned.replace(/^\s*export\s+default\s+[A-Za-z_$][\w$]*\s*;?\s*$/gm, '');
  cleaned = cleaned.replace(/^\s*export\s*\{[\s\S]*?\}\s*;?\s*$/gm, '');
  cleaned = cleaned.replace(
    /^\s*export\s+(?=(?:async\s+function|const|function|class|let|var|type|interface|enum)\b)/gm,
    '',
  );

  return cleaned.trim();
}

function hasRenderableBody(body: string): boolean {
  return /return\s*(?:\(|<)/.test(body) || /<[A-Za-z][\w:-]*[\s/>]/.test(body) || /React\.createElement\s*\(/.test(body);
}

function getBraceDepthAt(code: string, index: number): number {
  let depth = 0;
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < index; i++) {
    const char = code[i];
    const prevChar = i > 0 ? code[i - 1] : '';

    if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
      continue;
    }

    if (inString) continue;

    if (char === '{') depth++;
    if (char === '}') depth = Math.max(0, depth - 1);
  }

  return depth;
}

function findMatchingBrace(code: string, openBraceIndex: number): number {
  let depth = 0;
  let inString = false;
  let stringChar = '';

  for (let i = openBraceIndex; i < code.length; i++) {
    const char = code[i];
    const prevChar = i > 0 ? code[i - 1] : '';

    if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
      continue;
    }

    if (inString) continue;

    if (char === '{') depth++;
    if (char === '}') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }

  return -1;
}

function findNearestEnclosingBrace(code: string, index: number): number {
  const stack: number[] = [];
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < index; i++) {
    const char = code[i];
    const prevChar = i > 0 ? code[i - 1] : '';

    if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
      continue;
    }

    if (inString) continue;

    if (char === '{') {
      stack.push(i);
    } else if (char === '}') {
      stack.pop();
    }
  }

  return stack.length > 0 ? stack[stack.length - 1] : -1;
}

function buildCanonicalSource(helperCode: string, componentParams: string, componentBody: string): string {
  const sections: string[] = [];
  const trimmedHelpers = stripExportSyntax(helperCode);

  if (trimmedHelpers) {
    sections.push(trimmedHelpers);
  }

  sections.push(`const DynamicAnimation = (${componentParams.trim()}) => {\n${componentBody}\n};`);

  return sections.join('\n\n').trim();
}

function findComponentCandidate(code: string): ComponentCandidate | null {
  const candidates: ComponentCandidate[] = [];

  for (const pattern of COMPONENT_PATTERNS) {
    pattern.regex.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = pattern.regex.exec(code)) !== null) {
      const bodyStart = match.index + match[0].length - 1;
      const bodyEnd = findMatchingBrace(code, bodyStart);

      if (bodyEnd === -1) {
        continue;
      }

      const body = code.substring(bodyStart + 1, bodyEnd).trim();
      const depth = getBraceDepthAt(code, match.index);
      const renderScore = hasRenderableBody(body) ? 10 : 0;
      const depthScore = depth === 0 ? 100 : 0;

      candidates.push({
        kind: pattern.kind,
        start: match.index,
        bodyStart,
        bodyEnd,
        depth,
        params: match[2] || '',
        body,
        score: depthScore + renderScore,
      });
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    if (right.depth !== left.depth) {
      return left.depth - right.depth;
    }

    return left.start - right.start;
  });

  return candidates[0] || null;
}

/**
 * Normalize motion-graphics code so the runtime always receives canonical code
 * that defines `DynamicAnimation`, regardless of whether the input started as
 * a component body or a full TSX module.
 */
export function normalizeMotionGraphicCode(code: string): NormalizedMotionGraphicCode {
  const cleaned = stripDecorativeSyntax(code);
  const candidate = findComponentCandidate(cleaned);

  if (!candidate) {
    const componentBody = cleaned.trim();
    return {
      sourceKind: 'body',
      helperCode: '',
      componentParams: '',
      componentBody,
      normalizedCode: buildCanonicalSource('', '', componentBody),
    };
  }

  const helperStart = candidate.depth === 0
    ? 0
    : Math.max(0, findNearestEnclosingBrace(cleaned, candidate.start) + 1);

  const helperCode = cleaned.substring(helperStart, candidate.start).trim();
  const componentBody = candidate.body;

  return {
    sourceKind: 'module',
    helperCode,
    componentParams: candidate.params,
    componentBody,
    normalizedCode: buildCanonicalSource(helperCode, candidate.params, componentBody),
  };
}
