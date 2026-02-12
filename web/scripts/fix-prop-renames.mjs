/**
 * Fix type errors caused by the unused-vars script incorrectly renaming 
 * destructured interface properties and library imports.
 * 
 * For each error, we either:
 * 1. Use destructuring rename syntax: propName: _propName
 * 2. Remove the incorrectly prefixed import entirely
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(process.cwd());

// All errors from tsc output
const errors = [
  { file: 'components/ui/autosize-input.tsx', line: 64, prop: '_injectStyles' },
  { file: 'components/video-creation/AsyncLoadingStep.tsx', line: 36, prop: '_fallbackDuration' },
  { file: 'components/video-creation/steps/scene-review/SceneReviewSidebar.tsx', line: 49, prop: '_onGenerateAll' },
  { file: 'components/video-creation/steps/Step1Outline.tsx', line: 205, prop: '_onBack' },
  { file: 'components/video-creation/steps/Step2StockMedia.tsx', line: 108, prop: '_videoId' },
  { file: 'components/video-creation/steps/Step2StockMedia.tsx', line: 115, prop: '_isLocked' },
  { file: 'components/video-creation/steps/Step3Script.tsx', line: 176, prop: '_outlineConfig' },
  { file: 'components/video-creation/steps/Step3Script.tsx', line: 183, prop: '_onBack' },
  { file: 'components/video-creation/steps/Step3Script.tsx', line: 184, prop: '_isLocked' },
  { file: 'components/video-creation/steps/Step3Script.tsx', line: 185, prop: '_lockedMessage' },
  { file: 'components/video-creation/steps/Step4Audio.tsx', line: 20, prop: '_onComplete' },
  { file: 'components/video-creation/steps/Step4Audio.tsx', line: 21, prop: '_onBack' },
  { file: 'components/video-creation/steps/Step5ShotCreation.tsx', line: 182, prop: '_onNext' },
  { file: 'components/video-creation/steps/Step5ShotCreation.tsx', line: 183, prop: '_onBack' },
  { file: 'components/video-creation/steps/Step5ShotCreation.tsx', line: 184, prop: '_isLocked' },
  { file: 'components/video-creation/steps/Step6SceneReview.tsx', line: 54, prop: '_projectId' },
  { file: 'components/video-creation/steps/Step6SceneReview.tsx', line: 56, prop: '_outlineAssets' },
  { file: 'components/video-creation/steps/Step6SceneReview.tsx', line: 60, prop: '_onContinue' },
  { file: 'components/video-creation/steps/Step6SceneReview.tsx', line: 62, prop: '_isLocked' },
  { file: 'components/video-creation/steps/Step6SceneReview.tsx', line: 63, prop: '_lockedMessage' },
  { file: 'components/video-creation/steps/Step7Editor.tsx', line: 31, prop: '_onContinue' },
  { file: 'components/video-creation/steps/Step7Editor.tsx', line: 33, prop: '_lockedMessage' },
  { file: 'components/video-creation/steps/Step8Export.tsx', line: 44, prop: '_onBack' },
  { file: 'components/video-creation/steps/Step8Export.tsx', line: 60, prop: '_timeline' },
  { file: 'components/video-creation/VideoCreationWizard.tsx', line: 187, prop: '_createVideo' },
  { file: 'lib/av-script/segmenter.ts', line: 147, prop: '_reason' },
  { file: 'lib/gcp/token-refresh.ts', line: 95, prop: '_error' },
  { file: 'lib/queues/workers/av-script.ts', line: 504, prop: '_generateJSON' },
  { file: 'lib/queues/workers/gpu-api-test.ts', line: 536, prop: '_publicUrl' },
  { file: 'lib/queues/workers/research-compare.ts', line: 75, prop: '_researchProvider' },
];

// Group by file
const byFile = {};
for (const error of errors) {
  if (!byFile[error.file]) byFile[error.file] = [];
  byFile[error.file].push(error);
}

let totalFixed = 0;

for (const [relFile, fileErrors] of Object.entries(byFile)) {
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

  // Sort by line desc
  const sorted = [...fileErrors].sort((a, b) => b.line - a.line);

  for (const error of sorted) {
    const lineIdx = error.line - 1;
    if (lineIdx < 0 || lineIdx >= lines.length) continue;

    const line = lines[lineIdx];
    const prop = error.prop; // e.g., '_onBack'
    const originalProp = prop.substring(1); // e.g., 'onBack'

    // Check what kind of line this is
    if (line.includes('import ')) {
      // Import statement - find and handle the _name in the import
      if (line.includes(`{ `) && line.includes(prop)) {
        // Named import: { _name } or { _name, other }
        // Try to remove it
        // If it's the only import, remove the whole line
        const importMatch = line.match(/\{([^}]+)\}/);
        if (importMatch) {
          const names = importMatch[1].split(',').map(s => s.trim()).filter(Boolean);
          const remaining = names.filter(n => n !== prop && !n.startsWith(`type ${prop}`));
          
          if (remaining.length === 0) {
            // Remove entire line
            lines.splice(lineIdx, 1);
          } else {
            const newImports = remaining.join(', ');
            lines[lineIdx] = line.replace(/\{[^}]+\}/, `{ ${newImports} }`);
          }
          modified = true;
          totalFixed++;
          continue;
        }
      }
      
      // Single default import with _
      if (line.match(new RegExp(`import\\s+${prop}\\s+from`))) {
        lines.splice(lineIdx, 1);
        modified = true;
        totalFixed++;
        continue;
      }
    }

    // Destructured const/let: const { _name } = or const { _name, other } = 
    const destructMatch = line.match(/(?:const|let|var)\s*\{([^}]+)\}/);
    if (destructMatch && line.includes(prop)) {
      // Replace _name with name: _name
      lines[lineIdx] = line.replace(
        new RegExp(`\\b${prop}\\b(?!\\s*:)`),
        `${originalProp}: ${prop}`
      );
      modified = true;
      totalFixed++;
      continue;
    }

    // Destructured prop in function/component params
    // Pattern: _propName = value, or _propName, in destructuring
    if (line.includes(prop)) {
      // Check if we're inside a destructuring block
      // Simple replacement: _name -> name: _name
      const replaced = line.replace(
        new RegExp(`(\\s+)${prop}\\b(?!\\s*:)`),
        `$1${originalProp}: ${prop}`
      );
      if (replaced !== line) {
        lines[lineIdx] = replaced;
        modified = true;
        totalFixed++;
        continue;
      }

      // Also handle accessing a property: obj._name -> obj.name 
      // (for cases like Step8Export._timeline)
      const accessReplaced = line.replace(
        new RegExp(`\\.${prop}\\b`),
        `.${originalProp}`
      );
      if (accessReplaced !== line) {
        lines[lineIdx] = accessReplaced;
        modified = true;
        totalFixed++;
        continue;
      }
    }

    console.warn(`  ⚠ Could not fix: ${relFile}:${error.line} - ${prop}`);
  }

  if (modified) {
    writeFileSync(absPath, lines.join('\n'));
    console.log(`  ✅ ${relFile}: Fixed ${fileErrors.length} issues`);
  }
}

console.log(`\nDone: ${totalFixed} fixed`);
