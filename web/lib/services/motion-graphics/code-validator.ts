/**
 * CodeValidator - SINGLE SOURCE OF TRUTH for Code Analysis
 * 
 * Ported from gpt-story-writer-niche-sys/backend/src/services/motion-graphics/CodeValidator.js
 * 
 * Responsible for:
 * ✓ Extracting icons from code (imports + JSX usage)
 * ✓ Validating code structure and syntax
 * ✓ Applying auto-fixes for common errors
 * ✓ Providing metadata to frontend (icons, corrections, warnings)
 * ✓ Babel-based syntax validation (transpileCheck)
 */

import { parse } from '@babel/parser';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  fixedCode: string | null;
  corrections?: string[];
}

/** Reserved names that shouldn't be used as variable names */
const RESERVED_NAMES = new Set([
  'spring',
  'interpolate',
  'interpolateColors',
  'interpolateColor',
  'useCurrentFrame',
  'useVideoConfig',
  'AbsoluteFill',
  'Sequence',
  'Img',
  'Easing',
  'Series',
  'React',
  'random',
]);

/** Common API mistakes and their corrections */
const API_CORRECTIONS = [
  { pattern: /interpolateColor\(/g, replacement: 'interpolateColors(', name: 'interpolateColor → interpolateColors' },
  { pattern: /useFrame\(/g, replacement: 'useCurrentFrame(', name: 'useFrame → useCurrentFrame' },
  { pattern: /useConfig\(/g, replacement: 'useVideoConfig(', name: 'useConfig → useVideoConfig' },
  { pattern: /Math\.random\(\)/g, replacement: 'random(null)', name: 'Math.random() → random(null) (deterministic)' },
];

/**
 * Count brace/paren balance properly, ignoring those inside strings
 */
function countBalanceIgnoringStrings(code: string, open: string, close: string): number {
  let balance = 0;
  let inString = false;
  let stringChar = '';
  
  for (let i = 0; i < code.length; i++) {
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
    
    if (char === open) balance++;
    if (char === close) balance--;
  }
  
  return balance;
}

/**
 * Fix common syntax errors in AI-generated code
 */
function fixSyntaxErrors(code: string): { code: string; fixes: string[] } {
  let fixed = code;
  const fixes: string[] = [];

  const braceBalance = countBalanceIgnoringStrings(fixed, '{', '}');
  const parenBalance = countBalanceIgnoringStrings(fixed, '(', ')');
  
  console.log(`[CodeValidator] Brace balance: ${braceBalance}, Paren balance: ${parenBalance}`);
  
  if (braceBalance > 5 || parenBalance > 5) {
    console.error('[CodeValidator] ⚠️ SEVERE CODE TRUNCATION DETECTED');
    console.error(`[CodeValidator] Missing: ${braceBalance} closing braces, ${parenBalance} closing parens`);
  }
  
  if (braceBalance < -2 || parenBalance < -2) {
    console.warn('[CodeValidator] Code has too many closing braces/parens - cannot auto-fix');
    return { code: fixed, fixes: ['Code has severe syntax issues - regeneration recommended'] };
  }

  if (braceBalance > 0 || parenBalance > 0) {
    const trimmed = fixed.trimEnd();
    
    if (!trimmed.endsWith('};') && !trimmed.endsWith(');') && !trimmed.endsWith('}')) {
      let closing = '';
      
      for (let i = 0; i < parenBalance; i++) closing += ')';
      for (let i = 0; i < braceBalance; i++) closing += '}';
      
      if (!closing.endsWith('};')) {
        closing += ';';
      }
      
      fixed = trimmed + closing;
      fixes.push(`Added ${braceBalance} closing brace(s) and ${parenBalance} closing paren(s)`);
    }
  }
  
  fixed = fixed.replace(/;{2,}/g, ';');
  fixed = fixed.replace(/\};\s*;/g, '};');

  return { code: fixed, fixes };
}

/**
 * Count the balance of opening/closing characters (with comment awareness)
 */
function countBalance(code: string, open: string, close: string): number {
  let balance = 0;
  let inString = false;
  let stringChar = '';
  let inComment = false;
  let inBlockComment = false;

  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    const nextChar = code[i + 1];
    const prevChar = i > 0 ? code[i - 1] : '';

    if (!inString) {
      if (char === '/' && nextChar === '/') {
        inComment = true;
        continue;
      }
      if (char === '/' && nextChar === '*') {
        inBlockComment = true;
        continue;
      }
      if (inBlockComment && char === '*' && nextChar === '/') {
        inBlockComment = false;
        i++;
        continue;
      }
      if (inComment && char === '\n') {
        inComment = false;
        continue;
      }
    }

    if (inComment || inBlockComment) continue;

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

    if (char === open) balance++;
    if (char === close) balance--;
  }

  return balance;
}

/**
 * Known Remotion and React components that are NOT icons.
 */
const KNOWN_COMPONENTS = new Set([
  'React', 'AbsoluteFill', 'Sequence', 'Series', 'Img', 'Audio', 'Video', 'Fragment',
  'TransitionSeries', 'Rect', 'Circle', 'Triangle', 'Star', 'Polygon', 'Ellipse', 
  'Heart', 'Pie', 'ThreeCanvas', 'Lottie', 'LightLeak', 'Component'
]);

/**
 * Scan code for potential icon usage (informational only).
 * The frontend now injects ALL lucide-react icons so this is for logging.
 */
function scanCodeForIcons(code: string): string[] {
  const detectedIcons = new Set<string>();
  
  // Method 1: Parse import statements from lucide-react
  const importPattern = /import\s*\{([^}]+)\}\s*from\s*['"]lucide-react['"]/g;
  
  let match;
  while ((match = importPattern.exec(code)) !== null) {
    const imports = match[1];
    const importNames = imports
      .split(',')
      .map(name => name.trim())
      .filter(name => name.length > 0);
    
    for (const name of importNames) {
      const actualName = name.split(/\s+as\s+/)[0].trim();
      detectedIcons.add(actualName);
    }
  }
  
  // Method 2: Scan for PascalCase words (potential icons)
  const wordPattern = /\b([A-Z][a-zA-Z0-9]*)\b/g;
  
  while ((match = wordPattern.exec(code)) !== null) {
    const word = match[1];
    if (KNOWN_COMPONENTS.has(word)) continue;
    detectedIcons.add(word);
  }

  const icons = Array.from(detectedIcons);
  
  if (icons.length > 0) {
    console.log('[CodeValidator] Potential icons detected:', icons.join(', '));
  }
  
  return icons;
}

/**
 * Validate generated Remotion code
 */
export function validateCode(code: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let fixedCode = code;
  let hasAutoFixes = false;
  const corrections: string[] = [];

  if (!code || typeof code !== 'string') {
    return {
      isValid: false,
      errors: ['No code provided'],
      warnings: [],
      fixedCode: null,
    };
  }

  // Apply syntax error fixes (most critical)
  const syntaxFixes = fixSyntaxErrors(fixedCode);
  if (syntaxFixes.fixes.length > 0) {
    fixedCode = syntaxFixes.code;
    corrections.push(...syntaxFixes.fixes);
    hasAutoFixes = true;
    console.log('[CodeValidator] Applied syntax fixes:', syntaxFixes.fixes);
  }

  // Check for basic component structure
  const hasExport = fixedCode.includes('export const') && fixedCode.includes('= () =>');
  const hasReturn = /return[\s\S]*?\(/.test(fixedCode) || /return[\s\S]*?</.test(fixedCode);
  
  if (!hasExport && !hasReturn) {
    errors.push('Code must be a function component with a return statement');
  }

  // Check for AbsoluteFill
  if (!fixedCode.includes('AbsoluteFill') && !fixedCode.includes('div')) {
    warnings.push('Consider using AbsoluteFill as the root element for full-screen coverage');
  }

  // Check for reserved name usage as variables
  for (const name of RESERVED_NAMES) {
    const varPattern = new RegExp(`(const|let|var)\\s+${name}\\s*=`, 'g');
    if (varPattern.test(fixedCode)) {
      errors.push(`Reserved name "${name}" used as variable - this will shadow the import`);
    }
  }

  // Apply API corrections
  for (const correction of API_CORRECTIONS) {
    if (correction.pattern.test(fixedCode)) {
      fixedCode = fixedCode.replace(correction.pattern, correction.replacement);
      corrections.push(correction.name);
      hasAutoFixes = true;
    }
  }

  if (corrections.length > 0) {
    warnings.push(`Auto-corrected: ${corrections.join(', ')}`);
  }

  // Check for unclosed braces/parentheses
  const braceBalance = countBalance(code, '{', '}');
  const parenBalance = countBalance(code, '(', ')');
  const bracketBalance = countBalance(code, '[', ']');

  if (braceBalance !== 0) {
    errors.push(`Unbalanced braces: ${braceBalance > 0 ? 'missing' : 'extra'} ${Math.abs(braceBalance)} closing brace(s)`);
  }
  if (parenBalance !== 0) {
    errors.push(`Unbalanced parentheses: ${parenBalance > 0 ? 'missing' : 'extra'} ${Math.abs(parenBalance)} closing paren(s)`);
  }
  if (bracketBalance !== 0) {
    errors.push(`Unbalanced brackets: ${bracketBalance > 0 ? 'missing' : 'extra'} ${Math.abs(bracketBalance)} closing bracket(s)`);
  }

  // Check for unclosed JSX tags
  const selfClosingTags = ['img', 'br', 'hr', 'input', 'meta', 'link', 'Img', 'Circle', 'Rect', 'Triangle', 'Star', 'Ellipse', 'Pie'];
  const jsxTagPattern = /<([A-Z][a-zA-Z0-9]*)[^>]*(?<!\/)>/g;
  let tagMatch;
  while ((tagMatch = jsxTagPattern.exec(code)) !== null) {
    const tagName = tagMatch[1];
    if (!selfClosingTags.includes(tagName)) {
      const closePattern = new RegExp(`</${tagName}>`);
      if (!closePattern.test(code)) {
        warnings.push(`JSX tag <${tagName}> may not be properly closed`);
      }
    }
  }

  // Check for common interpolate mistakes
  if (code.includes('interpolate(') && !code.includes('extrapolate')) {
    warnings.push('Consider adding extrapolateLeft/Right: "clamp" to interpolate() calls');
  }

  // Check for animation without frame reference
  if ((code.includes('spring(') || code.includes('interpolate(')) && !code.includes('frame')) {
    warnings.push('Animation functions found but no "frame" variable - ensure useCurrentFrame() is called');
  }

  // === DETERMINISM & REMOTION-SPECIFIC CHECKS ===

  // Detect Math.random() usage (non-deterministic — breaks Remotion rendering)
  if (/Math\.random\(\)/g.test(fixedCode)) {
    warnings.push('⚠️ Math.random() detected — use random() from "remotion" for deterministic rendering');
    // Auto-fix is handled by API_CORRECTIONS above
  }

  // Detect CSS animations (will not render in Remotion)
  if (/@keyframes\s/.test(fixedCode)) {
    warnings.push('⚠️ @keyframes detected — CSS animations will NOT render in Remotion. Use spring()/interpolate() instead');
  }
  if (/\banimation\s*:/.test(fixedCode) && !fixedCode.includes('// animation')) {
    warnings.push('⚠️ CSS animation property detected — will not render in Remotion');
  }
  if (/\btransition\s*:/.test(fixedCode) && !fixedCode.includes('TransitionSeries')) {
    warnings.push('⚠️ CSS transition property detected — will not render in Remotion. Use spring() instead');
  }

  // Detect useState (usually wrong in Remotion — state resets every frame)
  if (/\buseState\b/.test(fixedCode)) {
    warnings.push('⚠️ useState detected — Remotion components should derive state from useCurrentFrame(), not React state');
  }

  // Detect useEffect (side effects are non-deterministic in Remotion)
  if (/\buseEffect\b/.test(fixedCode)) {
    warnings.push('⚠️ useEffect detected — side effects are generally wrong in Remotion components');
  }

  // Detect Video/Audio imported from wrong package
  if (/from\s+['"]remotion['"]/.test(fixedCode) && /\b(Video|Audio)\b/.test(fixedCode)) {
    const remImport = fixedCode.match(/import\s*\{([^}]*?)\}\s*from\s*['"]remotion['"]/);
    if (remImport && /\b(Video|Audio)\b/.test(remImport[1])) {
      warnings.push('⚠️ Video/Audio should be imported from "@remotion/media", not "remotion"');
    }
  }

  // === SECURITY CHECKS (CODE INJECTION PREVENTION) ===

  /** Dangerous APIs that should never appear in Remotion components */
  const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
    // Network access
    { pattern: /\bfetch\s*\(/, label: 'fetch() — network requests are not allowed in motion graphics' },
    { pattern: /\bXMLHttpRequest\b/, label: 'XMLHttpRequest — network requests are not allowed' },
    { pattern: /\bWebSocket\b/, label: 'WebSocket — network access is not allowed' },
    { pattern: /\bnavigator\.sendBeacon\b/, label: 'navigator.sendBeacon — network access is not allowed' },
    // Code execution
    { pattern: /\beval\s*\(/, label: 'eval() — dynamic code execution is forbidden' },
    { pattern: /\bnew\s+Function\s*\(/, label: 'new Function() — dynamic code execution is forbidden' },
    { pattern: /\bimport\s*\(/, label: 'Dynamic import() — not allowed in motion graphics' },
    // Cookie / storage access
    { pattern: /\bdocument\.cookie\b/, label: 'document.cookie — cookie access is not allowed' },
    { pattern: /\blocalStorage\b/, label: 'localStorage — storage access is not allowed' },
    { pattern: /\bsessionStorage\b/, label: 'sessionStorage — storage access is not allowed' },
    { pattern: /\bindexedDB\b/, label: 'indexedDB — storage access is not allowed' },
    // DOM manipulation (outside React)
    { pattern: /\bdocument\.getElementById\b/, label: 'Direct DOM access is not allowed — use React JSX' },
    { pattern: /\bdocument\.querySelector\b/, label: 'Direct DOM access is not allowed — use React JSX' },
    { pattern: /\bdocument\.createElement\b/, label: 'Direct DOM creation is not allowed — use React JSX' },
    { pattern: /\.innerHTML\s*=/, label: 'innerHTML assignment — XSS vector, not allowed' },
    { pattern: /\.outerHTML\s*=/, label: 'outerHTML assignment — XSS vector, not allowed' },
    // Navigation / window manipulation
    { pattern: /\bwindow\.open\s*\(/, label: 'window.open() — navigation is not allowed' },
    { pattern: /\bwindow\.location\b/, label: 'window.location — navigation is not allowed' },
    { pattern: /\blocation\.href\b/, label: 'location.href — navigation is not allowed' },
    { pattern: /\blocation\.assign\b/, label: 'location.assign — navigation is not allowed' },
    // Process / global access (Node.js context)
    { pattern: /\bprocess\.env\b/, label: 'process.env — environment variable access is not allowed' },
    { pattern: /\bglobalThis\b/, label: 'globalThis — direct global access is not allowed' },
  ];

  for (const { pattern, label } of DANGEROUS_PATTERNS) {
    if (pattern.test(fixedCode)) {
      errors.push(`🛡️ SECURITY: ${label}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    fixedCode: hasAutoFixes ? fixedCode : null,
    corrections: corrections.length > 0 ? corrections : undefined,
  };
}

/**
 * Extract icon names from code and ensure the ICONS comment is present.
 * Informational only — the frontend injects ALL lucide-react icons.
 */
export function extractAndEnsureIcons(code: string): { icons: string[]; code: string } {
  const potentialIcons = scanCodeForIcons(code);
  
  const iconsCommentMatch = code.match(/^\/\/\s*ICONS:\s*(.+)$/m);
  
  let declaredIcons: string[] = [];
  if (iconsCommentMatch) {
    const iconsString = iconsCommentMatch[1].trim();
    if (iconsString.toLowerCase() !== 'none') {
      declaredIcons = iconsString
        .split(',')
        .map(icon => icon.trim())
        .filter(icon => icon.length > 0 && icon.toLowerCase() !== 'none');
    }
  }
  
  const allIcons = [...new Set([...declaredIcons, ...potentialIcons])];
  
  const iconsComment = allIcons.length > 0 
    ? `// ICONS: ${allIcons.join(', ')}\n`
    : `// ICONS: none\n`;
  
  const codeWithoutComment = code.replace(/^\/\/\s*ICONS:.*$/m, '').trim();
  
  const finalCode = iconsComment + codeWithoutComment;
  
  console.log('[CodeValidator] Icons (informational):', allIcons.length > 0 ? allIcons.join(', ') : 'none');
  return { icons: allIcons, code: finalCode };
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use extractAndEnsureIcons instead
 */
export function extractIconNames(code: string): string[] {
  const result = extractAndEnsureIcons(code);
  return result.icons;
}

/**
 * Strip markdown code fences from AI response
 */
export function stripMarkdownFences(code: string): string {
  let cleaned = code.replace(/^```(?:tsx|typescript|jsx|javascript)?\s*\n?/gm, '');
  cleaned = cleaned.replace(/\n?```\s*$/gm, '');
  return cleaned.trim();
}

/**
 * Extract the component code from a larger response
 */
export function extractComponentCode(code: string): string {
  let cleaned = code;

  // Remove wrapper functions
  const wrapperMatch = cleaned.match(/const\s+\w+\s*=\s*\(\s*\)\s*=>\s*\{\s*(export\s+const[\s\S]*)\};?\s*$/);
  if (wrapperMatch) {
    cleaned = wrapperMatch[1];
    cleaned = cleaned.replace(/\};[\s\n]*\};?\s*$/g, '};');
  }

  // Extract export if not at start
  if (!cleaned.startsWith('export const') && cleaned.includes('export const')) {
    const exportIndex = cleaned.indexOf('export const');
    if (exportIndex > 0) {
      cleaned = cleaned.substring(exportIndex);
      cleaned = cleaned.replace(/\};[\s\n]*\};?\s*$/g, '};');
    }
  }

  // Find the component and extract with proper brace matching
  const exportMatch = cleaned.match(/export\s+const\s+\w+\s*=\s*\(\s*\)\s*=>\s*\{/);
  if (!exportMatch || exportMatch.index === undefined) {
    return cleaned;
  }

  // Find matching closing brace
  let braceCount = 0;
  let inString = false;
  let stringChar = '';
  let i = exportMatch.index + exportMatch[0].length - 1;

  for (; i < cleaned.length; i++) {
    const char = cleaned[i];
    const prevChar = i > 0 ? cleaned[i - 1] : '';

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

    if (char === '{') braceCount++;
    if (char === '}') {
      braceCount--;
      if (braceCount === 0) break;
    }
  }

  const startIndex = cleaned.lastIndexOf('\n', exportMatch.index);
  const actualStart = startIndex === -1 ? 0 : startIndex + 1;

  let preContent = cleaned.substring(0, actualStart).trim();
  preContent = preContent.replace(/import[\s\S]*?from\s*["'][^"']+["'];?\s*/g, '');
  preContent = preContent.replace(/import\s*["'][^"']+["'];?\s*/g, '');

  const mainComponent = cleaned.substring(actualStart, i + 2);

  return preContent ? `${preContent}\n\n${mainComponent}` : mainComponent;
}

/**
 * Babel-based syntax validation for AI-generated Remotion code.
 * Uses @babel/parser to parse TSX — catches ALL syntax errors in ~1-2ms.
 * 
 * Wraps the code in a component shell before parsing (same pattern
 * as the frontend remotion-compiler) so it validates accurately.
 */
export function transpileCheck(code: string): { valid: boolean; error?: string } {
  if (!code?.trim()) {
    return { valid: false, error: 'No code provided' };
  }

  try {
    // Strip imports — the runtime injects everything into scope, so imports
    // are decorative. Removing them avoids false-positive parse errors from
    // import-only syntax issues while keeping the actual component logic intact.
    let body = code;
    body = body.replace(/import\s+type\s*\{[\s\S]*?\}\s*from\s*["'][^"']+["'];?/g, '');
    body = body.replace(/import\s+\w+\s*,\s*\{[\s\S]*?\}\s*from\s*["'][^"']+["'];?/g, '');
    body = body.replace(/import\s*\{[\s\S]*?\}\s*from\s*["'][^"']+["'];?/g, '');
    body = body.replace(/import\s+\*\s+as\s+\w+\s+from\s*["'][^"']+["'];?/g, '');
    body = body.replace(/import\s+\w+\s+from\s*["'][^"']+["'];?/g, '');
    body = body.replace(/import\s*["'][^"']+["'];?/g, '');
    // Strip ICONS comment
    body = body.replace(/^\/\/\s*ICONS:.*$/m, '');

    body = body.trim();

    // Detect if the code is a module-level construct (has export, top-level const, function, etc.)
    // If so, parse directly as a module. If it's just a function body (starts with hooks/return),
    // wrap it in a component shell.
    const isModuleCode = /^\s*(export\s|const\s|let\s|var\s|function\s|class\s|\/\*|\/\/)/m.test(body)
      && /\bexport\b/.test(body);

    const sourceToCheck = isModuleCode
      ? body
      : `const DynamicAnimation = () => {\n${body}\n};`;

    parse(sourceToCheck, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
      errorRecovery: false,
    });

    console.log('[CodeValidator] ✅ Babel syntax check passed');
    return { valid: true };
  } catch (err) {
    const error = err as Error & { loc?: { line: number; column: number } };
    const loc = error.loc ? ` (${error.loc.line}:${error.loc.column})` : '';
    const message = `Syntax error${loc}: ${error.message}`;

    console.error('[CodeValidator] ❌ Babel syntax check failed:', message);
    return { valid: false, error: message };
  }
}

