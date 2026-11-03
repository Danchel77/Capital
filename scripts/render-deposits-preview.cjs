const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const chromePath =
  '/home/deck/HarnessProjects/Budget/chrome-headless-shell/linux-156.0.8078.80/chrome-headless-shell-linux64/chrome-headless-shell';

// Read index.html and extract app header, capital subbar, and deposits view
const indexHtml = fs.readFileSync('index.html', 'utf8');

// 1. App Header
const headerStart = indexHtml.indexOf('<header\n      class="bg-gray-900');
const headerEnd = indexHtml.indexOf('</header>', headerStart) + '</header>'.length;
const appHeaderHtml = indexHtml.substring(headerStart, headerEnd).trim();

// 2. Subbar switcher (pinned top bar like Analytics)
const subbarStart = indexHtml.indexOf(
  '<!-- ПОДХЕДЕР: Закрепленная полоса переключателя «Вклады / Инвестиции»'
);
const subbarEnd = indexHtml.indexOf('<main id="app-content"', subbarStart);
let subbarHtml = indexHtml.substring(subbarStart, subbarEnd).trim();
// Unhide (Вклады active)
subbarHtml = subbarHtml.replace('class="hidden sticky', 'class="sticky');

// 3. Deposits View
const depStart = indexHtml.indexOf('<!-- Подвкладка: Вклады -->');
const depEnd = indexHtml.indexOf('<!-- Подвкладка: Брокер -->', depStart);
const depHtml = indexHtml.substring(depStart, depEnd).trim();

const fullHtml = `<!DOCTYPE html>
<html lang="ru" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Preview: Deposits Screen</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <style>
    ${fs.readFileSync('style.css', 'utf8')}
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      background-color: #000000;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      overflow-x: hidden;
      -webkit-font-smoothing: antialiased;
    }
  </style>
</head>
<body class="bg-black text-white min-h-screen">
  ${appHeaderHtml}
  ${subbarHtml}
  <main id="app-content" class="p-3.5 sm:p-4 pb-20 sm:pb-16">
    <div id="capital-tab" class="tab-pane flex flex-col gap-3.5">
      ${depHtml}
    </div>
  </main>

  <script>
    ${fs.readFileSync('marketRates.js', 'utf8')}
  </script>
  <script>
    ${fs.readFileSync('deposits.js', 'utf8')}
  </script>
  <script>
    window.formatMoney = n => Number(Math.round(n)).toLocaleString('ru-RU') + ' ₽';
    window.formatDateStr = (d, fmt) => {
      const dt = typeof d === 'string' ? new Date(d) : d;
      if (!dt || isNaN(dt.getTime())) return String(d);
      const dd = String(dt.getDate()).padStart(2, '0');
      const mm = String(dt.getMonth() + 1).padStart(2, '0');
      const yyyy = dt.getFullYear();
      if (fmt === 'dd.MM.yyyy') return \`\${dd}.\${mm}.\${yyyy}\`;
      return \`\${yyyy}-\${mm}-\${dd}\`;
    };
    window.parseAnyDate = s => new Date(s);
    window.escapeHtml = s => s;
    window.openCardContextMenu = () => {};

    const rawDeposits = [
      {
        id: 'dep-matured-1',
        name: 'Газпром 2',
        amount: 300000,
        rate: 13.4,
        startDate: '2026-04-10',
        endDate: '2026-10-15',
        status: 'Активен',
        isClosed: false
      },
      {
        id: 'dep-active-1',
        name: 'Сбер Накопительный',
        amount: 1727162,
        rate: 16.0,
        startDate: '2026-05-12',
        endDate: '2027-01-25',
        status: 'Активен',
        isClosed: false
      },
      {
        id: 'dep-active-2',
        name: 'Т-Банк Доходный',
        amount: 524000,
        rate: 14.5,
        startDate: '2026-06-01',
        endDate: '2026-12-11',
        status: 'Активен',
        isClosed: false
      }
    ];

    window.Cache = {
      deposits: processDeposits(rawDeposits)
    };

    renderDeposits();
    if (typeof lucide !== 'undefined') lucide.createIcons();
  </script>
</body>
</html>`;

const tmpHtmlPath = path.resolve(__dirname, 'preview-deposits.html');
const tmpPngPath = path.resolve(__dirname, '../preview-deposits-390.png');

fs.writeFileSync(tmpHtmlPath, fullHtml, 'utf8');

try {
  execSync(
    `"${chromePath}" --headless --disable-gpu --no-sandbox --hide-scrollbars --window-size=390,844 --screenshot="${tmpPngPath}" "file://${tmpHtmlPath}"`,
    { stdio: 'inherit' }
  );
  console.log('Deposits screenshot rendered successfully to:', tmpPngPath);
} catch (err) {
  console.error('Error rendering deposits screenshot:', err);
  process.exit(1);
}
