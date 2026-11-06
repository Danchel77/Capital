const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const CHROME_PATH = path.resolve(
  __dirname,
  '../chrome-headless-shell/linux-156.0.8078.80/chrome-headless-shell-linux64/chrome-headless-shell'
);

// Аргументы командной строки
const args = process.argv.slice(2);
function getArg(name, def = null) {
  const prefix = `--${name}=`;
  const hit = args.find(a => a.startsWith(prefix));
  if (hit) return hit.slice(prefix.length);
  if (args.includes(`--${name}`)) return true;
  return def;
}

const tab = getArg('tab', 'capital');
const mode = getArg('mode', 'numbers');
const openDepositForm = getArg('openDepositForm', false) ? '1' : '0';
const openCalendar = getArg('openCalendar', false) ? '1' : '0';
const openGoalModal = getArg('openGoalModal', false) ? '1' : '0';
const emptyBills = getArg('emptyBills', '') || '';
const outPath = path.resolve(process.cwd(), getArg('out', `scripts/preview-${tab}.png`));

// Простой статический сервер на свободном порту
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
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  const targetUrl = `http://127.0.0.1:${port}/?mock=1&tab=${tab}&mode=${mode}&openDepositForm=${openDepositForm}&openCalendar=${openCalendar}&openGoalModal=${openGoalModal}&emptyBills=${emptyBills}`;

  console.log(`[Screenshot] Loading native mock URL: ${targetUrl}`);

  const chromeProc = spawn(CHROME_PATH, [
    '--headless',
    '--no-sandbox',
    '--hide-scrollbars',
    '--virtual-time-budget=2000',
    '--window-size=390,844',
    `--screenshot=${outPath}`,
    targetUrl,
  ]);

  chromeProc.stderr.on('data', d => {
    const s = d.toString();
    if (s.includes('[MockMode]') || s.includes('CONSOLE') || s.includes('Error')) {
      process.stderr.write(s);
    }
  });

  chromeProc.on('close', code => {
    server.close();
    if (code === 0 && fs.existsSync(outPath)) {
      console.log(`[Screenshot] Saved: ${outPath} (${fs.statSync(outPath).size} bytes)`);
      process.exit(0);
    } else {
      console.error(`[Screenshot] Failed with exit code ${code}`);
      process.exit(1);
    }
  });
});
