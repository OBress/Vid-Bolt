/**
 * Second-pass fix for @typescript-eslint/no-unused-vars
 * 
 * Handles patterns the first script couldn't:
 * 1. Function params not on the same line as the function keyword
 * 2. Hook destructuring: const [foo, setFoo] = useState(...)
 * 3. Variables inside multi-line object destructuring
 * 4. Props destructuring in component signatures
 */

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';

const ROOT = resolve(process.cwd());

// Run next lint and capture output
console.log('Running next lint...');
let lintOutput;
try {
  lintOutput = execSync('npx next lint 2>&1', { cwd: ROOT, maxBuffer: 10 * 1024 * 1024 }).toString();
} catch (e) {
  lintOutput = e.stdout?.toString() || e.message;
}

// Parse lint output into structured data
const issues = [];
let currentFile = null;

for (const line of lintOutput.split('\n')) {
  const fileMatch = line.match(/^\.\/(.+)$/);
  if (fileMatch) {
    currentFile = fileMatch[1];
    continue;
  }
  
  if (currentFile && line.includes('@typescript-eslint/no-unused-vars')) {
    const match = line.match(/^(\d+):(\d+)\s+Error:\s+'([^']+)'\s+is\s+(.+?)\.\s+/);
    if (match) {
      issues.push({
        file: currentFile,
        line: parseInt(match[1]),
        col: parseInt(match[2]),
        name: match[3],
        reason: match[4],
      });
    }
  }
}

console.log(`Found ${issues.length} remaining no-unused-vars issues`);

// Group by file
const byFile = {};
for (const issue of issues) {
  if (!byFile[issue.file]) byFile[issue.file] = [];
  byFile[issue.file].push(issue);
}

let totalFixed = 0;
let totalSkipped = 0;

for (const [relFile, fileIssues] of Object.entries(byFile)) {
  const absPath = resolve(ROOT, relFile);
  let content;
  try {
    content = readFileSync(absPath, 'utf8');
  } catch {
    continue;
  }
  
  const lines = content.split('\n');
  let modified = false;
  const linesToRemove = new Set();
  
  // Sort by line descending
  const sorted = [...fileIssues].sort((a, b) => b.line - a.line);
  
  for (const issue of sorted) {
    const lineIdx = issue.line - 1;
    if (lineIdx < 0 || lineIdx >= lines.length) continue;
    
    const line = lines[lineIdx];
    const { name, col } = issue;
    
    // Skip already prefixed
    if (name.startsWith('_')) {
      totalSkipped++;
      continue;
    }
    
    // Strategy: Replace the exact occurrence at the specified column
    // col is 1-based
    const colIdx = col - 1;
    
    // Verify the name is at the expected position
    const nameAtPos = line.substring(colIdx, colIdx + name.length);
    if (nameAtPos === name) {
      // Check character before and after to ensure it's a word boundary
      const charBefore = colIdx > 0 ? line[colIdx - 1] : ' ';
      const charAfter = colIdx + name.length < line.length ? line[colIdx + name.length] : ' ';
      
      if (/[a-zA-Z0-9_]/.test(charBefore) || /[a-zA-Z0-9]/.test(charAfter)) {
        // Not a proper word boundary — skip
        console.warn(`  ⚠ Word boundary issue: ${relFile}:${issue.line} '${name}'`);
        totalSkipped++;
        continue;
      }
      
      // Replace at exact position
      lines[lineIdx] = line.substring(0, colIdx) + '_' + name + line.substring(colIdx + name.length);
      modified = true;
      totalFixed++;
    } else {
      // Name not at expected position, try to find it on the line
      const wordRegex = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      const match = line.match(wordRegex);
      if (match && match.index !== undefined) {
        // Check if it's an import line — handle differently 
        if (line.match(/^import\s/) || line.match(/^\s*import\s/)) {
          // For import lines, look if it's a named import part
          const importMatch = line.match(/\{([^}]*)\}/);
          if (importMatch) {
            const importNames = importMatch[1].split(',').map(s => s.trim()).filter(Boolean);
            const remaining = importNames.filter(n => {
              const actualName = n.split(/\s+as\s+/).pop().trim();
              return actualName !== name;
            });
            
            if (remaining.length === 0 && !line.match(/import\s+\w+.*,\s*\{/)) {
              linesToRemove.add(lineIdx);
            } else if (remaining.length < importNames.length) {
              const newImports = remaining.join(', ');
              lines[lineIdx] = line.replace(/\{[^}]+\}/, `{ ${newImports} }`);
            }
            modified = true;
            totalFixed++;
            continue;
          }
          
          // Single import: import Name from '...'
          linesToRemove.add(lineIdx);
          modified = true;
          totalFixed++;
          continue;
        }
        
        // Otherwise prefix with _
        lines[lineIdx] = line.substring(0, match.index) + '_' + name + line.substring(match.index + name.length);
        modified = true;
        totalFixed++;
      } else {
        console.warn(`  ⚠ Cannot find '${name}' at line ${issue.line}: "${line.trim().substring(0, 80)}"`);
        totalSkipped++;
      }
    }
  }
  
  if (modified) {
    const sortedRemove = [...linesToRemove].sort((a, b) => b - a);
    for (const idx of sortedRemove) {
      lines.splice(idx, 1);
    }
    
    let result = lines.join('\n');
    result = result.replace(/\n{3,}/g, '\n\n');
    writeFileSync(absPath, result);
    const fixed = fileIssues.length - fileIssues.filter(i => i.name.startsWith('_')).length;
    console.log(`  ✅ ${relFile}: Fixed ${fixed} issues`);
  }
}

console.log(`\nDone: ${totalFixed} fixed, ${totalSkipped} skipped`);
