const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const chromePath =
  '/home/deck/HarnessProjects/Budget/chrome-headless-shell/linux-156.0.8078.80/chrome-headless-shell-linux64/chrome-headless-shell';

// Read index.html and extract capital header and broker view
const indexHtml = fs.readFileSync('index.html', 'utf8');

// 1. Capital summary header and segmented control
const summaryStart = indexHtml.indexOf('<!-- Сводная карточка общего капитала');
const summaryEnd = indexHtml.indexOf('<!-- Подвкладка: Вклады -->', summaryStart);
let headerHtml = indexHtml.substring(summaryStart, summaryEnd).trim();

// Make "Инвестиции MOEX" active and "Вклады" inactive in preview
headerHtml = headerHtml.replace(
  'id="cap-subtab-deposits"\n            onclick="switchCapitalSubtab(\'deposits\')"\n            class="flex-1 py-2 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 bg-white text-zinc-950 shadow-sm active:scale-95"',
  'id="cap-subtab-deposits"\n            onclick="switchCapitalSubtab(\'deposits\')"\n            class="flex-1 py-2 px-3 rounded-xl text-xs font-medium transition-all cursor-pointer flex items-center justify-center gap-1.5 text-zinc-400 hover:text-white active:scale-95"'
);
headerHtml = headerHtml.replace(
  'id="cap-subtab-broker"\n            onclick="switchCapitalSubtab(\'broker\')"\n            class="flex-1 py-2 px-3 rounded-xl text-xs font-medium transition-all cursor-pointer flex items-center justify-center gap-1.5 text-zinc-400 hover:text-white active:scale-95"',
  'id="cap-subtab-broker"\n            onclick="switchCapitalSubtab(\'broker\')"\n            class="flex-1 py-2 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 bg-white text-zinc-950 shadow-sm active:scale-95"'
);

// 2. Broker View
const brStart = indexHtml.indexOf('<!-- Подвкладка: Брокер -->');
const brEnd = indexHtml.indexOf('</div>\n      </div>\n    </main>', brStart);
let brHtml = indexHtml.substring(brStart, brEnd).trim();

// Unhide broker view
brHtml = brHtml.replace('id="capital-broker-view" class="hidden space-y-3.5"', 'id="capital-broker-view" class="space-y-3.5" style="display:block !important;"');

const fullHtml = `<!DOCTYPE html>
<html lang="ru" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Preview: Broker Screen</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
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
<body class="bg-black text-white p-3.5 min-h-screen">
  <div class="w-full space-y-3.5">
    ${headerHtml}
    ${brHtml}
  </div>

  <script>
    ${fs.readFileSync('broker.js', 'utf8')}
  </script>
  <script>
    Chart.defaults.animation = false;
    window.formatMoney = n => Number(Math.round(n)).toLocaleString('ru-RU') + ' ₽';
    window.formatDateStr = (d, fmt) => {
      const dt = typeof d === 'string' ? new Date(d) : d;
      if (!dt || isNaN(dt.getTime())) return String(d);
      const monthsRu = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
      const monthsFull = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
      const dd = dt.getDate();
      const mIdx = dt.getMonth();
      const yyyy = dt.getFullYear();
      if (fmt === 'd MMM') return \`\${dd} \${monthsRu[mIdx]}\`;
      if (fmt === 'd MMMM yyyy') return \`\${dd} \${monthsFull[mIdx]} \${yyyy}\`;
      if (fmt === 'dd.MM.yyyy') return \`\${String(dd).padStart(2, '0')}.\${String(mIdx + 1).padStart(2, '0')}.\${yyyy}\`;
      return \`\${yyyy}-\${String(mIdx + 1).padStart(2, '0')}-\${String(dd).padStart(2, '0')}\`;
    };
    window.parseAnyDate = s => new Date(s);
    window.escapeHtml = s => s;
    window.showToast = () => {};

    // Sample real state matching user portfolio
    window.Cache = {
      brokerAssets: [
        {
          id: 'asset_rub',
          ticker: 'RUB',
          name: 'Свободные рубли',
          type: 'cash',
          quantity: 50000,
          currentPrice: 1,
          changePct24h: 0,
        },
        {
          id: 'asset_eqmx',
          ticker: 'EQMX',
          name: 'EQMX ETF',
          type: 'fund',
          isFund: true,
          quantity: 4756,
          currentPrice: 136.1,
          buyPrice: 128.5,
          changePct24h: 1.23,
        }
      ],
      broker: processBroker([
        { id: '1', date: '2026-05-31', amount: 510000, balance: 510000, type: 'Баланс' },
        { id: '2', date: '2026-06-30', amount: 540000, balance: 540000, type: 'Баланс' },
        { id: '3', date: '2026-07-31', amount: 565000, balance: 565000, type: 'Баланс' },
        { id: '4', date: '2026-09-01', amount: 580000, balance: 580000, type: 'Баланс' },
        { id: '5', date: '2026-09-14', amount: 163320, balance: 615000, type: 'Покупка', tradeType: 'buy', ticker: 'EQMX', quantity: 1200 },
        { id: '6', date: '2026-10-26', amount: 68050, balance: 642000, type: 'Продажа', tradeType: 'sell', ticker: 'EQMX', quantity: 500 },
        { id: '7', date: '2026-11-02', amount: 697292, balance: 697292, type: 'Баланс' }
      ])
    };

    // Initialize UI
    renderBroker();

    // Summary headers
    const totalAmountEl = document.getElementById('capital-total-amount');
    const depSummaryEl = document.getElementById('capital-summary-deposits');
    const brSummaryEl = document.getElementById('capital-summary-broker');
    if (totalAmountEl) totalAmountEl.innerText = formatMoney(2251162 + 697292);
    if (depSummaryEl) depSummaryEl.innerText = formatMoney(2251162);
    if (brSummaryEl) brSummaryEl.innerText = formatMoney(697292);

    if (typeof lucide !== 'undefined') lucide.createIcons();
  </script>
</body>
</html>`;

const tmpHtmlPath = path.resolve(__dirname, 'preview-broker.html');
const tmpPngPath = path.resolve(__dirname, '../preview-broker-390.png');

fs.writeFileSync(tmpHtmlPath, fullHtml, 'utf8');

try {
  execSync(
    `"${chromePath}" --headless --disable-gpu --no-sandbox --hide-scrollbars --window-size=390,844 --screenshot="${tmpPngPath}" "file://${tmpHtmlPath}"`,
    { stdio: 'inherit' }
  );
  console.log('Screenshot rendered successfully to:', tmpPngPath);
} catch (err) {
  console.error('Error rendering screenshot:', err);
  process.exit(1);
}
