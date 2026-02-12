/**
 * Fix React.ElementType className errors by replacing JSX syntax
 * with React.createElement for dynamic icon components.
 * 
 * <Icon className="w-4 h-4" /> → {React.createElement(Icon, { className: "w-4 h-4" })}
 * <Icon className={cn("a", "b")} /> → {React.createElement(Icon, { className: cn("a", "b") })}
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(process.cwd());

// Error locations from tsc --noEmit (file:line:column)
// These are the exact lines with <Icon className=...> that error
const errorLocations = [
  { file: 'features/video-editor-v2/components/advanced-timeline/components/timeline-header/edit-mode-toolbar.tsx', line: 161 },
  { file: 'features/video-editor-v2/components/asset-manager/asset-manager.tsx', line: 160 },
  { file: 'features/video-editor-v2/components/asset-manager/tabs/effects-tab.tsx', line: 687 },
  { file: 'features/video-editor-v2/components/asset-manager/tabs/effects-tab.tsx', line: 1160 },
  { file: 'features/video-editor-v2/components/asset-manager/tabs/transitions-tab.tsx', line: 206 },
  { file: 'features/video-editor-v2/components/inspector/sections/appearance-section.tsx', line: 134 },
  { file: 'features/video-editor-v2/components/inspector/sections/audio-effects-section.tsx', line: 850 },
  { file: 'features/video-editor-v2/components/inspector/sections/audio-effects-section.tsx', line: 997 },
  { file: 'features/video-editor-v2/components/inspector/sections/effect-add-panel.tsx', line: 310 },
  { file: 'features/video-editor-v2/components/inspector/sections/effect-add-panel.tsx', line: 425 },
  { file: 'features/video-editor-v2/components/inspector/sections/gradient-mask-controls.tsx', line: 72 },
  { file: 'features/video-editor-v2/components/inspector/sections/image-section.tsx', line: 101 },
  { file: 'features/video-editor-v2/components/inspector/sections/keyframes-section.tsx', line: 2379 },
  { file: 'features/video-editor-v2/components/inspector/sections/mask-add-panel.tsx', line: 380 },
  { file: 'features/video-editor-v2/components/inspector/sections/masks-section.tsx', line: 141 },
  { file: 'features/video-editor-v2/components/inspector/sections/masks-section.tsx', line: 242 },
  { file: 'features/video-editor-v2/components/inspector/sections/motion-graphics-section.tsx', line: 129 },
  { file: 'features/video-editor-v2/components/inspector/sections/shape-section.tsx', line: 64 },
  { file: 'features/video-editor-v2/components/inspector/sections/text-section.tsx', line: 64 },
  { file: 'features/video-editor-v2/components/inspector/sections/transform-section.tsx', line: 180 },
  { file: 'features/video-editor-v2/components/ui/edge-feather-selector.tsx', line: 46 },
];

// Group by file
const byFile = {};
for (const err of errorLocations) {
  if (!byFile[err.file]) byFile[err.file] = [];
  byFile[err.file].push(err.line);
}

let totalFixed = 0;

for (const [relFile, errorLines] of Object.entries(byFile)) {
  const absPath = resolve(ROOT, relFile);
  let content;
  try {
    content = readFileSync(absPath, 'utf8');
  } catch {
    console.warn(`  ⚠ Cannot read: ${relFile}`);
    continue;
  }

  const lines = content.split('\n');
  const sortedLines = [...errorLines].sort((a, b) => b - a); // Process from bottom up

  for (const errorLine of sortedLines) {
    const lineIdx = errorLine - 1;
    if (lineIdx < 0 || lineIdx >= lines.length) continue;

    const line = lines[lineIdx];
    
    // Determine the component name (Icon, config.icon, etc.)
    // Search backwards from error line for the opening < tag if not on same line
    let componentName = null;
    let startLineIdx = lineIdx;
    let endLineIdx = lineIdx;

    // Try pattern on same line: <Icon className="..." />
    const singleLineMatch = line.match(/^(\s*)<(\w+(?:\.\w+)?)\s+className="([^"]+)"\s*\/>/);
    if (singleLineMatch) {
      const indent = singleLineMatch[1];
      componentName = singleLineMatch[2];
      const classValue = singleLineMatch[3];
      lines[lineIdx] = `${indent}{React.createElement(${componentName}, { className: "${classValue}" })}`;
      totalFixed++;
      console.log(`  ✅ ${relFile}:${errorLine} — single-line string className`);
      continue;
    }

    // Try pattern: <Icon className={cn(\n  ...\n)} />  (multiline cn())
    // Look for the start of the JSX element and end
    let fullJsx = '';
    let jsxStartIdx = -1;
    let jsxEndIdx = -1;
    
    // Search backwards for < opening
    for (let i = lineIdx; i >= Math.max(0, lineIdx - 3); i--) {
      if (lines[i].match(/<\w+(?:\.\w+)?\s+className/)) {
        jsxStartIdx = i;
        break;
      }
    }
    if (jsxStartIdx === -1) jsxStartIdx = lineIdx;
    
    // Now search forward for />
    for (let i = jsxStartIdx; i < Math.min(lines.length, jsxStartIdx + 8); i++) {
      if (lines[i].includes('/>')) {
        jsxEndIdx = i;
        break;
      }
    }
    if (jsxEndIdx === -1) jsxEndIdx = jsxStartIdx;
    
    // Extract full JSX
    fullJsx = lines.slice(jsxStartIdx, jsxEndIdx + 1).join('\n');
    
    // Match pattern: <ComponentName className={expression} />
    // We need to extract the component name and className value
    const multiLineMatch = fullJsx.match(/^(\s*)<(\w+(?:\.\w+)?)\s+className=\{([\s\S]+?)\}\s*\/>\s*$/);
    if (multiLineMatch) {
      const indent = multiLineMatch[1];
      componentName = multiLineMatch[2];
      const classExpression = multiLineMatch[3].trim();
      const replacement = `${indent}{React.createElement(${componentName}, { className: ${classExpression} })}`;
      
      // Replace the lines
      lines.splice(jsxStartIdx, jsxEndIdx - jsxStartIdx + 1, replacement);
      totalFixed++;
      console.log(`  ✅ ${relFile}:${errorLine} — multi-line expression className (${componentName})`);
      continue;
    }

    // Try another pattern: <ComponentName className="..." />  on multiple lines
    const multiLineStringMatch = fullJsx.match(/^(\s*)<(\w+(?:\.\w+)?)\s+className="([^"]+)"\s*\/>\s*$/);
    if (multiLineStringMatch) {
      const indent = multiLineStringMatch[1];
      componentName = multiLineStringMatch[2];
      const classValue = multiLineStringMatch[3];
      const replacement = `${indent}{React.createElement(${componentName}, { className: "${classValue}" })}`;
      lines.splice(jsxStartIdx, jsxEndIdx - jsxStartIdx + 1, replacement);
      totalFixed++;
      console.log(`  ✅ ${relFile}:${errorLine} — multi-line string className (${componentName})`);
      continue;
    }

    console.warn(`  ⚠ Could not fix ${relFile}:${errorLine}`);
    console.warn(`    JSX: ${fullJsx.trim().substring(0, 100)}...`);
  }

  // Add React import if needed (check if React is imported)
  const hasReactImport = lines.some(l => l.includes("import React") || l.includes("import * as React"));
  // Don't need to add - NextJS files always import React

  writeFileSync(absPath, lines.join('\n'));
}

console.log(`\nDone: ${totalFixed} JSX elements converted to React.createElement`);
