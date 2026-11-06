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
    const content = fs.readFileSync(filePath);

    if (reqPath === '/index.html') {
      const html = content.toString('utf8');
      const injectScript = `
        <script>
          window.addEventListener('DOMContentLoaded', () => {
            const check = setInterval(() => {
              if (typeof window.openAvatarPickerModal === 'function') {
                clearInterval(check);
                window.openAvatarPickerModal();
                if (typeof window.lucide !== 'undefined') {
                  window.lucide.createIcons();
                }
              }
            }, 50);
          });
        </script>
      `;
      const modifiedHtml = html.replace('</body>', `${injectScript}</body>`);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(modifiedHtml);
    }

    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    return res.end(content);
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  const outPath = path.resolve(__dirname, 'preview-avatar-picker.png');
  console.log(`Taking avatar picker screenshot from http://127.0.0.1:${port}/?mock=1...`);

  const chrome = spawn(
    CHROME_PATH,
    [
      '--headless',
      '--no-sandbox',
      '--disable-gpu',
      '--hide-scrollbars',
      '--window-size=390,844',
      `--screenshot=${outPath}`,
      '--virtual-time-budget=2000',
      `http://127.0.0.1:${port}/?mock=1`,
    ],
    { stdio: 'inherit' }
  );

  chrome.on('close', code => {
    console.log(`Chrome closed with code ${code}. Saved to ${outPath}`);
    server.close();
    process.exit(0);
  });
});
