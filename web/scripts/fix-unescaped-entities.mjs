/**
 * Fix react/no-unescaped-entities errors
 * Replaces unescaped ' with &apos; and " with &quot; in JSX text content
 */

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';

const ROOT = resolve(process.cwd());

console.log('Running next lint...');
let lintOutput;
try {
  lintOutput = execSync('npx next lint 2>&1', { cwd: ROOT, maxBuffer: 10 * 1024 * 1024 }).toString();
} catch (e) {
  lintOutput = e.stdout?.toString() || e.message;
}

const issues = [];
let currentFile = null;

for (const line of lintOutput.split('\n')) {
  const fileMatch = line.match(/^\.\/(.+)$/);
  if (fileMatch) {
    currentFile = fileMatch[1];
    continue;
  }
  
  if (currentFile && line.includes('react/no-unescaped-entities')) {
    const match = line.match(/^(\d+):(\d+)\s+Error:\s+(.+?)\s+react\/no-unescaped-entities/);
    if (match) {
      // Extract which character is the issue
      const charMatch = match[3].match(/`(.)`.*can be escaped/);
      issues.push({
        file: currentFile,
        line: parseInt(match[1]),
        col: parseInt(match[2]),
        char: charMatch ? charMatch[1] : "'",
        msg: match[3],
      });
    }
  }
}

console.log(`Found ${issues.length} react/no-unescaped-entities issues`);

// Group by file
const byFile = {};
for (const issue of issues) {
  if (!byFile[issue.file]) byFile[issue.file] = [];
  byFile[issue.file].push(issue);
}

let totalFixed = 0;

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
  
  // Sort by line desc, col desc
  const sorted = [...fileIssues].sort((a, b) => b.line - a.line || b.col - a.col);
  
  for (const issue of sorted) {
    const lineIdx = issue.line - 1;
    if (lineIdx < 0 || lineIdx >= lines.length) continue;
    
    const line = lines[lineIdx];
    const col = issue.col - 1;
    const char = line[col];
    
    let replacement;
    if (char === "'") {
      replacement = '&apos;';
    } else if (char === '"') {
      replacement = '&quot;';
    } else if (char === '>') {
      replacement = '&gt;';
    } else if (char === '<') {
      replacement = '&lt;';
    } else if (char === '{') {
      replacement = '&#123;';
    } else if (char === '}') {
      replacement = '&#125;';
    } else {
      console.warn(`  ⚠ Unknown char '${char}' at ${relFile}:${issue.line}:${issue.col}`);
      continue;
    }
    
    lines[lineIdx] = line.substring(0, col) + replacement + line.substring(col + 1);
    modified = true;
    totalFixed++;
  }
  
  if (modified) {
    writeFileSync(absPath, lines.join('\n'));
    console.log(`  ✅ ${relFile}: Fixed ${fileIssues.length} issues`);
  }
}

console.log(`\nDone: ${totalFixed} fixed`);
