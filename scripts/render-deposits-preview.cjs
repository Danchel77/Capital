const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const chromePath = '/home/deck/HarnessProjects/Budget/chrome-headless-shell/linux-156.0.8078.80/chrome-headless-shell-linux64/chrome-headless-shell';

// Extract the capital tab markup from index.html
const indexHtml = fs.readFileSync('index.html', 'utf8');
const capStart = indexHtml.indexOf('<div id="capital-tab"');
const capEnd = indexHtml.indexOf('<!-- Подвкладка: Брокер -->', capStart);
let capHtml = indexHtml.substring(capStart, capEnd).trim();

// Unhide the tab
capHtml = capHtml.replace('class="tab-pane hidden space-y-4"', 'class="space-y-3" style="display:block !important;"');

const fullHtml = `<!DOCTYPE html>
<html lang="ru" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Preview: Deposits Screen</title>
  <script src="https://cdn.tailwindcss.com"></script>
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
    ${capHtml}
  </div>

  <script src="deposits.js"></script>
  <script>
    window.formatMoney = n => Number(n).toLocaleString('ru-RU') + ' ₽';
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
    window.getTotalDepositsValue = () => 2551162;
    window.getTotalBrokerValue = () => 647292;
    window.openCardContextMenu = () => {};

    window.Cache = {
      deposits: [
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
        },
        {
          id: 'dep-closed-1',
          name: 'ВТБ Надежный',
          amount: 200000,
          rate: 12.0,
          startDate: '2025-11-12',
          endDate: '2026-05-12',
          status: 'Закрыт',
          isClosed: true,
          expectedInterest: 12200
        }
      ]
    };

    window.addEventListener('DOMContentLoaded', () => {
      Cache.deposits = processDeposits(Cache.deposits);
      renderDeposits();
      const totalAmountEl = document.getElementById('capital-total-amount');
      const depSummaryEl = document.getElementById('capital-summary-deposits');
      const brSummaryEl = document.getElementById('capital-summary-broker');
      if (totalAmountEl) totalAmountEl.innerText = formatMoney(2551162 + 647292);
      if (depSummaryEl) depSummaryEl.innerText = formatMoney(2551162);
      if (brSummaryEl) brSummaryEl.innerText = formatMoney(647292);
      if (typeof lucide !== 'undefined') lucide.createIcons();
    });
  </script>
</body>
</html>`;

const previewFile = path.resolve('preview-deposits.html');
const outputFile = path.resolve('preview-deposits.png');
fs.writeFileSync(previewFile, fullHtml);

execSync(`"${chromePath}" --headless --no-sandbox --hide-scrollbars --window-size=390,844 --screenshot="${outputFile}" "${previewFile}"`);
console.log('OK! Updated Deposits screenshot created, size:', fs.statSync(outputFile).size);
