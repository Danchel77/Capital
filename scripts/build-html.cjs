const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src');
const srcIndex = path.join(srcDir, 'index.html');
const outIndex = path.join(rootDir, 'index.html');

/**
 * Recursively resolves <!-- @include "path/to/file.html" -->
 * Handles optional leading whitespace so indented tags maintain their position.
 */
function resolveIncludes(content, baseDir) {
  const includeRegex = /^[ \t]*<!--\s*@include\s+['"]([^'"]+)['"]\s*-->/gm;
  return content.replace(includeRegex, (match, relPath) => {
    const fullPath = path.resolve(baseDir, relPath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(
        `[build:html] Include file not found: ${fullPath} (included from ${baseDir})`
      );
    }
    const partial = fs.readFileSync(fullPath, 'utf8');
    return resolveIncludes(partial, path.dirname(fullPath));
  });
}

function buildHtml(options = {}) {
  const startTime = Date.now();
  if (!fs.existsSync(srcIndex)) {
    console.error(`[build:html] Error: Source index file not found at ${srcIndex}`);
    process.exit(1);
  }

  const rawTemplate = fs.readFileSync(srcIndex, 'utf8');
  const compiled = resolveIncludes(rawTemplate, srcDir);

  const existing = fs.existsSync(outIndex) ? fs.readFileSync(outIndex, 'utf8') : '';

  if (options.check) {
    if (existing !== compiled) {
      console.error('[build:html] Check failed: index.html is out of sync with src/');
      process.exit(1);
    }
    console.log('[build:html] Check passed: index.html is in sync with src/');
    return true;
  }

  if (existing !== compiled) {
    fs.writeFileSync(outIndex, compiled, 'utf8');
    const elapsed = Date.now() - startTime;
    console.log(`[build:html] index.html reassembled successfully (${elapsed}ms)`);
  } else if (!options.silent) {
    const elapsed = Date.now() - startTime;
    console.log(`[build:html] index.html is already up to date (${elapsed}ms)`);
  }
  return true;
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const isWatch = args.includes('--watch');
  const isCheck = args.includes('--check');

  buildHtml({ check: isCheck });

  if (isWatch) {
    console.log(`[build:html] Watching ${srcDir} for changes...`);
    fs.watch(srcDir, { recursive: true }, (eventType, filename) => {
      if (filename && (filename.endsWith('.html') || filename.endsWith('.htm'))) {
        try {
          buildHtml({ silent: false });
        } catch (err) {
          console.error(`[build:html] Build error:`, err.message);
        }
      }
    });
  }
}

module.exports = { buildHtml };
