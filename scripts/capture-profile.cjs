const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const CHROME_PATH = path.resolve(
  __dirname,
  '../chrome-headless-shell/linux-156.0.8078.80/chrome-headless-shell-linux64/chrome-headless-shell'
);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.resolve(__dirname, '..', '.' + reqPath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    let content = fs.readFileSync(filePath);

    if (reqPath === '/index.html') {
      let html = content.toString('utf8');
      const injectScript = `
        <script>
          window.addEventListener('DOMContentLoaded', () => {
            const check = setInterval(() => {
              const u = window.auth?.currentUser || window.currentUser;
              if (typeof window.openProfileModal === 'function' && u) {
                clearInterval(check);
                if (!window.auth) window.auth = {};
                window.auth.currentUser = u;
                window.openProfileModal();
                if (typeof window.lucide !== 'undefined') {
                  window.lucide.createIcons();
                }
              }
            }, 50);
          });
        </script>
      `;
      html = html.replace('</body>', `${injectScript}</body>`);
      content = Buffer.from(html, 'utf8');
    }

    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(content);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
  }
});

server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  const targetUrl = `http://127.0.0.1:${port}/?mock=1`;
  const outPath = path.resolve(__dirname, 'preview-profile.png');

  console.log(`Taking profile screenshot from ${targetUrl}...`);

  const chromeArgs = [
    '--headless',
    '--no-sandbox',
    '--hide-scrollbars',
    '--window-size=390,844',
    `--screenshot=${outPath}`,
    '--virtual-time-budget=2000',
    targetUrl,
  ];

  const chromeProc = spawn(CHROME_PATH, chromeArgs);

  chromeProc.on('close', code => {
    console.log(`Chrome closed with code ${code}. Saved to ${outPath}`);
    server.close();
    process.exit(code);
  });
});
