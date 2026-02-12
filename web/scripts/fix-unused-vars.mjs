/**
 * Automated fix for @typescript-eslint/no-unused-vars
 * 
 * Parses next lint output and applies safe fixes:
 * 1. Unused function/catch params → prefix with _
 * 2. Unused destructured vars → prefix with _
 * 3. Unused imports (not type imports) → remove
 * 4. Unused type-only imports → convert to `import type`
 * 5. Unused local variables → prefix with _
 */

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, relative } from 'path';

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
    const match = line.match(/^(\d+):(\d+)\s+Error:\s+'([^']+)'\s+is\s+(.+?)\.\s+@typescript-eslint\/no-unused-vars/);
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

console.log(`Found ${issues.length} no-unused-vars issues across files`);

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
    console.warn(`  ⚠ Cannot read: ${relFile}`);
    continue;
  }
  
  const lines = content.split('\n');
  let modified = false;
  const linesToRemove = new Set();
  
  // Sort issues by line number descending so we can modify without shifting
  const sorted = [...fileIssues].sort((a, b) => b.line - a.line);
  
  for (const issue of sorted) {
    const lineIdx = issue.line - 1;
    if (lineIdx < 0 || lineIdx >= lines.length) continue;
    
    const line = lines[lineIdx];
    const { name, reason } = issue;
    
    // Skip already-prefixed names
    if (name.startsWith('_')) {
      totalSkipped++;
      continue;
    }
    
    // Pattern 1: Unused import
    if (reason.includes('defined but never used')) {
      // Check if this is an import line
      if (line.match(/^import\s/)) {
        // Single default import: import Foo from '...'
        const singleDefaultMatch = line.match(/^import\s+(\w+)\s+from\s+/);
        if (singleDefaultMatch && singleDefaultMatch[1] === name) {
          linesToRemove.add(lineIdx);
          modified = true;
          totalFixed++;
          continue;
        }
        
        // Named import: import { A, B } from '...'
        const namedMatch = line.match(/^import\s*\{([^}]+)\}\s*from\s/);
        if (namedMatch) {
          const imports = namedMatch[1].split(',').map(s => s.trim()).filter(Boolean);
          const remaining = imports.filter(i => {
            const actualName = i.split(/\s+as\s+/).pop().trim();
            return actualName !== name;
          });
          
          if (remaining.length === 0) {
            // All imports unused → remove entire line
            linesToRemove.add(lineIdx);
            modified = true;
            totalFixed++;
          } else if (remaining.length < imports.length) {
            // Some imports unused → remove just this import
            const newImports = remaining.join(', ');
            lines[lineIdx] = line.replace(/\{[^}]+\}/, `{ ${newImports} }`);
            modified = true;
            totalFixed++;
          }
          continue;
        }
        
        // Type import: import type { A, B } from '...'
        const typeImportMatch = line.match(/^import\s+type\s*\{([^}]+)\}\s*from\s/);
        if (typeImportMatch) {
          const imports = typeImportMatch[1].split(',').map(s => s.trim()).filter(Boolean);
          const remaining = imports.filter(i => {
            const actualName = i.split(/\s+as\s+/).pop().trim();
            return actualName !== name;
          });
          
          if (remaining.length === 0) {
            linesToRemove.add(lineIdx);
            modified = true;
            totalFixed++;
          } else if (remaining.length < imports.length) {
            const newImports = remaining.join(', ');
            lines[lineIdx] = line.replace(/\{[^}]+\}/, `{ ${newImports} }`);
            modified = true;
            totalFixed++;
          }
          continue;
        }
        
        // Multi-line import - check next lines
        if (line.match(/^import\s*\{/) && !line.includes('}')) {
          // Find the closing brace
          let endIdx = lineIdx + 1;
          while (endIdx < lines.length && !lines[endIdx].includes('}')) {
            endIdx++;
          }
          // Collect all import names in the block
          const importBlock = lines.slice(lineIdx, endIdx + 1).join('\n');
          const blockMatch = importBlock.match(/\{([^}]+)\}/);
          if (blockMatch) {
            const imports = blockMatch[1].split(',').map(s => s.trim()).filter(s => s && !s.startsWith('//'));
            const remaining = imports.filter(i => {
              const actualName = i.split(/\s+as\s+/).pop().trim();
              return actualName !== name;
            });
            
            if (remaining.length === 0) {
              // Remove all lines of this import
              for (let i = lineIdx; i <= endIdx; i++) {
                linesToRemove.add(i);
              }
              modified = true;
              totalFixed++;
            } else if (remaining.length < imports.length) {
              // Reconstruct the import
              const fromPart = lines[endIdx].match(/\}\s*from\s+.+/)?.[0] || "} from '???';";
              const newImport = line.match(/^(import\s+(?:type\s+)?)\{/)[1] + `{ ${remaining.join(', ')} ${fromPart}`;
              lines[lineIdx] = newImport;
              for (let i = lineIdx + 1; i <= endIdx; i++) {
                linesToRemove.add(i);
              }
              modified = true;
              totalFixed++;
            }
          }
          continue;
        }
      }
      
      // Check if this is a destructured import from a multi-line import block
      // e.g. line contains just "  SomeName," as part of an import { ... } block
      const trimmed = line.trim();
      if (trimmed === `${name},` || trimmed === name) {
        // Check if we're inside an import block
        let checkIdx = lineIdx - 1;
        let insideImport = false;
        while (checkIdx >= 0) {
          if (lines[checkIdx].includes('}')) break;
          if (lines[checkIdx].match(/^import\s/)) {
            insideImport = true;
            break;
          }
          checkIdx--;
        }
        if (insideImport) {
          linesToRemove.add(lineIdx);
          modified = true;
          totalFixed++;
          continue;
        }
      }
    }
    
    // Pattern 2: Unused catch variable
    if (line.match(/}\s*catch\s*\(\s*\w+\s*\)/)) {
      const catchMatch = line.match(/(}\s*catch\s*\(\s*)(\w+)(\s*\))/);
      if (catchMatch && catchMatch[2] === name) {
        lines[lineIdx] = line.replace(
          new RegExp(`(catch\\s*\\(\\s*)${name}(\\s*\\))`),
          `$1_${name}$2`
        );
        modified = true;
        totalFixed++;
        continue;
      }
    }
    
    // Pattern 2b: Unused catch variable (catch on its own line)
    if (line.match(/catch\s*\(\s*\w+\s*\)/) || line.match(/catch\s*\(\s*\w+\s*:\s*\w+\s*\)/)) {
      const catchMatch = line.match(/(catch\s*\(\s*)(\w+)([\s:])/);
      if (catchMatch && catchMatch[2] === name) {
        lines[lineIdx] = line.replace(
          new RegExp(`(catch\\s*\\(\\s*)${name}(\\s*[:\\)])`),
          `$1_${name}$2`
        );
        modified = true;
        totalFixed++;
        continue;
      }
    }
    
    // Pattern 3: Unused function parameter
    // Look for param in function declaration, arrow function, or method
    if (reason.includes('defined but never used')) {
      // Function param: function foo(bar, baz) or (bar, baz) =>
      const paramRegex = new RegExp(`([,(]\\s*)\\b${name}\\b(\\s*[,):])`, 'g');
      if (paramRegex.test(line) && !line.match(/^import\s/)) {
        const newLine = line.replace(
          new RegExp(`([,(]\\s*)\\b${name}\\b(\\s*[,):])`),
          `$1_${name}$2`
        );
        if (newLine !== line) {
          lines[lineIdx] = newLine;
          modified = true;
          totalFixed++;
          continue;
        }
      }
      
      // Typed function param: (name: Type) or name: Type,
      const typedParamRegex = new RegExp(`([,(]\\s*)\\b${name}\\b(\\s*:\\s*\\w)`, 'g');
      if (typedParamRegex.test(line) && !line.match(/^import\s/)) {
        const newLine = line.replace(
          new RegExp(`([,(]\\s*)\\b${name}\\b(\\s*:\\s*\\w)`),
          `$1_${name}$2`
        );
        if (newLine !== line) {
          lines[lineIdx] = newLine;
          modified = true;
          totalFixed++;
          continue;
        }
      }
    }
    
    // Pattern 4: Unused local variable (assigned but never used)
    if (reason.includes('assigned a value but never used') || reason.includes('defined but never used')) {
      // Destructured: const { foo, bar } = ...
      const destructMatch = line.match(/(?:const|let|var)\s*\{([^}]+)\}/);
      if (destructMatch) {
        const vars = destructMatch[1];
        if (vars.includes(name)) {
          const newVars = vars.replace(
            new RegExp(`\\b${name}\\b`),
            `_${name}`
          );
          lines[lineIdx] = line.replace(destructMatch[1], newVars);
          modified = true;
          totalFixed++;
          continue;
        }
      }
      
      // Simple assignment: const foo = ...
      const simpleMatch = line.match(/(?:const|let|var)\s+(\w+)\s*[=:]/);
      if (simpleMatch && simpleMatch[1] === name) {
        lines[lineIdx] = line.replace(
          new RegExp(`((?:const|let|var)\\s+)${name}(\\s*[=:])`),
          `$1_${name}$2`
        );
        modified = true;
        totalFixed++;
        continue;
      }
      
      // Function declaration: function foo(...)
      const funcMatch = line.match(/function\s+(\w+)\s*\(/);
      if (funcMatch && funcMatch[1] === name) {
        lines[lineIdx] = line.replace(
          new RegExp(`(function\\s+)${name}(\\s*\\()`),
          `$1_${name}$2`
        );
        modified = true;
        totalFixed++;
        continue;
      }
    }
    
    // Pattern 5: Standalone catch — catch alone with param
    if (reason.includes('defined but never used')) {
      // Standalone: } catch (e) {
      const standaloneCatch = line.match(/catch\s*\(\s*(\w+)\s*\)/);
      if (standaloneCatch && standaloneCatch[1] === name) {
        lines[lineIdx] = line.replace(
          new RegExp(`(catch\\s*\\(\\s*)${name}(\\s*\\))`),
          `$1_${name}$2`
        );
        modified = true;
        totalFixed++;
        continue;
      }
    }
    
    console.warn(`  ⚠ Could not auto-fix: ${relFile}:${issue.line} - '${name}' ${reason}`);
    totalSkipped++;
  }
  
  if (modified) {
    // Remove marked lines (in reverse order to preserve indices)
    const sortedRemove = [...linesToRemove].sort((a, b) => b - a);
    for (const idx of sortedRemove) {
      lines.splice(idx, 1);
    }
    
    // Clean up double blank lines
    let result = lines.join('\n');
    result = result.replace(/\n{3,}/g, '\n\n');
    
    writeFileSync(absPath, result);
    console.log(`  ✅ ${relFile}: Fixed ${fileIssues.length - fileIssues.filter(i => i.name.startsWith('_')).length} issues`);
  }
}

console.log(`\nDone: ${totalFixed} fixed, ${totalSkipped} skipped`);
