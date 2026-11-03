const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const chromePath =
  '/home/deck/HarnessProjects/Budget/chrome-headless-shell/linux-156.0.8078.80/chrome-headless-shell-linux64/chrome-headless-shell';

const indexHtml = fs.readFileSync('index.html', 'utf8');

// Extract market-rates-settings-modal
const modalStart = indexHtml.indexOf('<!-- МОДАЛКА: НАСТРОЙКИ СТАВОК И БАНКОВ');
const modalEnd = indexHtml.indexOf('<!-- Модальное окно Личного кабинета -->', modalStart);
let modalHtml = indexHtml.substring(modalStart, modalEnd).trim();
// Make modal visible
modalHtml = modalHtml.replace(
  'id="market-rates-settings-modal"\n      class="fixed inset-0 bg-black/85 z-[130] hidden',
  'id="market-rates-settings-modal"\n      class="fixed inset-0 bg-black/85 z-[130] flex'
);

const fullHtml = `<!DOCTYPE html>
<html lang="ru" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Preview: Market Rates Settings Modal</title>
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
    openMarketRatesSettingsModal();
    if (typeof lucide !== 'undefined') lucide.createIcons();
  </script>
</body>
</html>`;

const tmpHtmlPath = path.resolve(__dirname, 'preview-settings.html');
const tmpPngPath = path.resolve(__dirname, '../preview-settings-390.png');

fs.writeFileSync(tmpHtmlPath, fullHtml, 'utf8');

try {
  execSync(
    `"${chromePath}" --headless --disable-gpu --no-sandbox --hide-scrollbars --window-size=390,844 --screenshot="${tmpPngPath}" "file://${tmpHtmlPath}"`,
    { stdio: 'inherit' }
  );
  console.log('Settings modal screenshot rendered successfully to:', tmpPngPath);
} catch (err) {
  console.error('Error rendering settings modal screenshot:', err);
  process.exit(1);
}
