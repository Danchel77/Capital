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
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(content);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
  }
});

const TARGETS = [
  { name: 'preview-profile.png', query: 'openProfile=1' },
  { name: 'preview-backup.png', query: 'openBackup=1' },
  { name: 'preview-change-password.png', query: 'openChangePassword=1' },
  { name: 'preview-create-family.png', query: 'openCreateFamily=1' },
  { name: 'preview-delete-account.png', query: 'openDeleteAccount=1' },
  { name: 'preview-app-install.png', query: 'openAppInstall=1' },
];

function captureTarget(port, target) {
  return new Promise(resolve => {
    const url = `http://127.0.0.1:${port}/?mock=1&${target.query}`;
    const outPath = path.resolve(__dirname, target.name);
    console.log(`[Capture] Capturing ${target.name} from ${url}...`);

    const chromeArgs = [
      '--headless',
      '--no-sandbox',
      '--hide-scrollbars',
      '--virtual-time-budget=2500',
      '--window-size=390,844',
      `--screenshot=${outPath}`,
      url,
    ];

    const proc = spawn(CHROME_PATH, chromeArgs);
    proc.on('close', code => {
      console.log(`[Capture] Saved ${target.name} (exit ${code})`);
      resolve();
    });
  });
}

server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  console.log(`[Server] Live on http://127.0.0.1:${port}`);

  for (const t of TARGETS) {
    await captureTarget(port, t);
  }

  server.close(() => {
    console.log('[Capture] All targets finished.');
    process.exit(0);
  });
});
