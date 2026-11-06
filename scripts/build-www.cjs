const fs = require('fs');
const path = require('path');
const { buildHtml } = require('./build-html.cjs');

const rootDir = path.resolve(__dirname, '..');
const wwwDir = path.join(rootDir, 'www');

// Reassemble index.html from src/ before sync
buildHtml({ silent: true });

// Clean and recreate www/
if (fs.existsSync(wwwDir)) {
  fs.rmSync(wwwDir, { recursive: true, force: true });
}
fs.mkdirSync(wwwDir, { recursive: true });

// Copy index.html
fs.copyFileSync(path.join(rootDir, 'index.html'), path.join(wwwDir, 'index.html'));

// Copy root asset files (.js, .css, .json, .svg)
const excludedFiles = new Set(['package.json', 'package-lock.json', 'bun.lock', 'tsconfig.json']);
const files = fs.readdirSync(rootDir);
for (const file of files) {
  const fullPath = path.join(rootDir, file);
  if (fs.statSync(fullPath).isFile()) {
    const ext = path.extname(file).toLowerCase();
    if (['.js', '.css', '.json', '.svg'].includes(ext) && !excludedFiles.has(file)) {
      fs.copyFileSync(fullPath, path.join(wwwDir, file));
    }
  }
}

// Copy data/ directory
const dataDir = path.join(rootDir, 'data');
if (fs.existsSync(dataDir)) {
  const targetDataDir = path.join(wwwDir, 'data');
  fs.mkdirSync(targetDataDir, { recursive: true });
  const dataFiles = fs.readdirSync(dataDir);
  for (const df of dataFiles) {
    fs.copyFileSync(path.join(dataDir, df), path.join(targetDataDir, df));
  }
}

// Copy public/ directory if exists
const publicDir = path.join(rootDir, 'public');
if (fs.existsSync(publicDir)) {
  fs.cpSync(publicDir, wwwDir, { recursive: true });
}

console.log('[build:www] Assets successfully synced to www/');
