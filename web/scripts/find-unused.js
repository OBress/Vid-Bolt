const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const extensions = ['.ts', '.tsx', '.js', '.jsx'];
const alias = '@';

// Directories where files are implicitly used (entry points)
const entryPointDirs = [
    path.join(rootDir, 'app'),
    path.join(rootDir, 'pages'),
    path.join(rootDir, 'public'),
    path.join(rootDir, '.next'),
    path.join(rootDir, 'node_modules'),
    path.join(rootDir, 'scripts'), // Don't report scripts as unused
];

// Files that are implicitly used even in other directories
const entryPointFiles = [
    'middleware.ts',
    'next.config.js',
    'next.config.ts',
    'tailwind.config.ts',
    'tailwind.config.js',
    'postcss.config.js',
    'postcss.config.mjs',
    'eslint.config.mjs',
    'components.json',
];

function getAllFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
            if (file === 'node_modules' || file === '.git' || file === '.next') return;
            getAllFiles(filePath, fileList);
        } else {
            // Only care about code files
            if (extensions.includes(path.extname(file))) {
                fileList.push(filePath);
            }
        }
    });
    
    return fileList;
}

function resolveImport(sourceFile, importPath) {
    let targetPath;
    
    if (importPath.startsWith(alias)) {
        targetPath = path.join(rootDir, importPath.substring(alias.length + 1));
    } else if (importPath.startsWith('.')) {
        targetPath = path.resolve(path.dirname(sourceFile), importPath);
    } else {
        // Node module import, ignore
        return null;
    }
    
    // Try to find the file with extensions
    if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) return targetPath;
    
    for (const ext of extensions) {
        const withExt = targetPath + ext;
        if (fs.existsSync(withExt)) return withExt;
    }
    
    // Try index file
    const indexBase = path.join(targetPath, 'index');
    for (const ext of extensions) {
        const indexWithExt = indexBase + ext;
        if (fs.existsSync(indexWithExt)) return indexWithExt;
    }
    
    return null;
}

const allFiles = getAllFiles(rootDir);
const usedFiles = new Set();

// Mark entry point files as used
allFiles.forEach(file => {
    if (entryPointDirs.some(dir => file.startsWith(dir))) {
        usedFiles.add(file);
    }
    if (entryPointFiles.includes(path.basename(file))) {
        usedFiles.add(file);
    }
});

// Regex to find imports
// Matches: import ... from '...'; import('...'); require('...');
const importRegex = /from\s+['"]([^'"]+)['"]|import\(['"]([^'"]+)['"]\)|require\(['"]([^'"]+)['"]/g;

allFiles.forEach(file => {
    const content = fs.readFileSync(file, 'utf-8');
    let match;
    
    while ((match = importRegex.exec(content)) !== null) {
        const importPath = match[1] || match[2] || match[3];
        if (!importPath) continue;
        
        const resolved = resolveImport(file, importPath);
        if (resolved) {
            usedFiles.add(resolved);
        }
    }
});

const unusedFiles = allFiles.filter(file => !usedFiles.has(file));

console.log('Unused Files Analysis Report');
console.log('============================');
if (unusedFiles.length === 0) {
    console.log('No unused files found (ignoring app/ and config files).');
} else {
    unusedFiles.forEach(file => {
        console.log(path.relative(rootDir, file));
    });
}
