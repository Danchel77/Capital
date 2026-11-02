const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const chromePath = '/home/deck/HarnessProjects/Budget/chrome-headless-shell/linux-156.0.8078.80/chrome-headless-shell-linux64/chrome-headless-shell';

// Extract the chart section from index.html
const indexHtml = fs.readFileSync('index.html', 'utf8');
const chartStart = indexHtml.indexOf('<div id="transactions-chart"');
const chartEnd = indexHtml.indexOf('</main>', chartStart);
let chartHtml = indexHtml.substring(chartStart, chartEnd).trim();

// Unhide the chart
chartHtml = chartHtml.replace('class="hidden chart-screen"', 'class="chart-screen" style="display:block !important;"');
chartHtml = chartHtml.replace('id="transactions-chart-content" class="space-y-3"', 'id="transactions-chart-content" class="space-y-3" style="display:block !important;"');

const fullHtml = `<!DOCTYPE html>
<html lang="ru" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Preview: Analytics Symmetric</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <link rel="stylesheet" href="style.css">
  <style>
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
  <div class="w-full space-y-3">
    <!-- Верхний фильтр-бар (1:1 как в приложении) -->
    <div class="flex gap-2 items-center">
      <div class="relative flex-1">
        <button type="button" class="w-full bg-[#0E1016] border border-white/[0.08] text-xs text-zinc-200 rounded-xl px-3 py-2 flex items-center justify-between">
          <span class="font-medium">Октябрь 2026</span>
          <span class="text-zinc-500 text-[9px] ml-1">▼</span>
        </button>
      </div>
      <div class="relative flex-1">
        <button type="button" class="w-full bg-[#0E1016] border border-white/[0.08] text-xs text-zinc-200 rounded-xl px-3 py-2 flex items-center justify-between">
          <span class="font-medium">Все категории</span>
          <span class="text-zinc-500 text-[9px] ml-1">▼</span>
        </button>
      </div>
    </div>

    ${chartHtml}
  </div>

  <script src="tx-analytics.js"></script>
  <script>
    Chart.defaults.animation = false;

    window.Cache = {
      transactions: [
        {
          id: '2026-10',
          label: 'Октябрь 2026',
          income: 145000,
          expense: 89400,
          items: [
            { type: 'Расход', category: 'Супермаркеты', amount: 32000 },
            { type: 'Расход', category: 'Кафе и рестораны', amount: 18500 },
            { type: 'Расход', category: 'Транспорт', amount: 14200 },
            { type: 'Расход', category: 'Жилье и ЖКХ', amount: 12700 },
            { type: 'Расход', category: 'Здоровье', amount: 8000 },
            { type: 'Расход', category: 'Развлечения', amount: 4000 }
          ]
        },
        {
          id: '2026-09',
          label: 'Сентябрь 2026',
          income: 140000,
          expense: 76000,
          items: []
        },
        {
          id: '2026-08',
          label: 'Август 2026',
          income: 135000,
          expense: 92000,
          items: []
        }
      ]
    };
    window.currentFilterMonth = '2026-10';
    window.currentDropdownYear = 2026;
    window.formatMoney = n => Number(n).toLocaleString('ru-RU') + ' ₽';
    window.formatCompactChartMoney = n => (Math.abs(n) >= 1000 ? Math.round(n/1000) + 'k' : n);
    window.escapeHtml = s => s;

    window.addEventListener('DOMContentLoaded', () => {
      if (typeof lucide !== 'undefined') lucide.createIcons();
      if (typeof buildCharts === 'function') buildCharts();
    });
  </script>
</body>
</html>`;

const previewFile = path.resolve('preview-analytics.html');
const outputFile = path.resolve('preview-analytics-symmetric.png');
fs.writeFileSync(previewFile, fullHtml);

// Capture with exact mobile viewport 390x844
execSync(`"${chromePath}" --headless --no-sandbox --hide-scrollbars --window-size=390,844 --screenshot="${outputFile}" "${previewFile}"`);
console.log('OK! Symmetric screenshot created, size:', fs.statSync(outputFile).size);
