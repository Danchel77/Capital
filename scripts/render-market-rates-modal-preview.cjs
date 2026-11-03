const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const chromePath =
  '/home/deck/HarnessProjects/Budget/chrome-headless-shell/linux-156.0.8078.80/chrome-headless-shell-linux64/chrome-headless-shell';

const indexHtml = fs.readFileSync('index.html', 'utf8');

// Extract market-rates-modal
const modalStart = indexHtml.indexOf('<!-- МОДАЛКА: СТАВКИ И ПРЕДЛОЖЕНИЯ БАНКОВ');
const modalEnd = indexHtml.indexOf('<!-- МОДАЛКА: НАСТРОЙКИ СТАВОК И БАНКОВ', modalStart);
let modalHtml = indexHtml.substring(modalStart, modalEnd).trim();
// Make modal visible
modalHtml = modalHtml.replace(
  'id="market-rates-modal"\n      class="fixed inset-0 bg-black/80 z-[120] hidden',
  'id="market-rates-modal"\n      class="fixed inset-0 bg-black/80 z-[120] flex'
);

const fullHtml = `<!DOCTYPE html>
<html lang="ru" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Preview: Market Rates Modal</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <style>
    ${fs.readFileSync('style.css', 'utf8')}
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background-color: #000000;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      overflow: hidden;
      -webkit-font-smoothing: antialiased;
    }
  </style>
</head>
<body class="bg-black text-white min-h-screen">
  ${modalHtml}

  <script>
    window.formatMoney = n => Number(Math.round(n)).toLocaleString('ru-RU') + ' ₽';
    ${fs.readFileSync('marketRates.js', 'utf8')}
  </script>
  <script>
    openMarketRatesModal();
    if (typeof lucide !== 'undefined') lucide.createIcons();
  </script>
</body>
</html>`;

const tmpHtmlPath = path.resolve(__dirname, 'preview-modal.html');
const tmpPngPath = path.resolve(__dirname, '../preview-modal-390.png');

fs.writeFileSync(tmpHtmlPath, fullHtml, 'utf8');

try {
  execSync(
    `"${chromePath}" --headless --disable-gpu --no-sandbox --hide-scrollbars --window-size=390,844 --screenshot="${tmpPngPath}" "file://${tmpHtmlPath}"`,
    { stdio: 'inherit' }
  );
  console.log('Modal screenshot rendered successfully to:', tmpPngPath);
} catch (err) {
  console.error('Error rendering modal screenshot:', err);
  process.exit(1);
}
