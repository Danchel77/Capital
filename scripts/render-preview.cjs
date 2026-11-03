const fs = require('fs');
const { execSync } = require('child_process');

const CHROME =
  '/home/deck/HarnessProjects/Budget/chrome-headless-shell/linux-156.0.8078.80/chrome-headless-shell-linux64/chrome-headless-shell';

// 1. Preview for Market Rates modal
const ratesHtml = `<!DOCTYPE html>
<html lang="ru" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Preview: Market Rates Grouped</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <link rel="stylesheet" href="style.css">
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0; width: 100%;
      background: #000000; color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      overflow-x: hidden; -webkit-font-smoothing: antialiased;
    }
  </style>
</head>
<body class="bg-black text-white p-0 min-h-screen flex flex-col justify-end">
  <div id="market-rates-modal" class="w-full h-[94vh] flex flex-col bg-[#0E1016] border-t border-white/10 rounded-t-3xl overflow-hidden shadow-2xl relative">
    <div class="px-4 pt-3.5 pb-2.5 border-b border-white/[0.06] flex items-center justify-between">
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="w-8 h-8 rounded-xl bg-white/[0.06] text-white flex items-center justify-center font-bold text-sm border border-white/10">%</div>
        <div class="min-w-0">
          <h3 class="text-sm font-bold text-white tracking-tight truncate">Ставки и предложения</h3>
          <p class="text-[11px] text-zinc-400 truncate">Лучшие доходности в банках</p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button class="w-8 h-8 rounded-full bg-white/[0.06] text-zinc-400 flex items-center justify-center"><i data-lucide="settings" class="w-4 h-4"></i></button>
        <button class="w-8 h-8 rounded-full bg-white/[0.06] text-zinc-400 flex items-center justify-center">✕</button>
      </div>
    </div>
    <div class="px-4 py-2 flex flex-col gap-2 border-b border-white/[0.06] bg-black/30">
      <div class="p-1 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center gap-1">
        <button class="flex-1 py-1.5 text-center text-xs font-semibold rounded-lg bg-[#181c26] text-white border border-[#282e3e]">Вклады</button>
        <button class="flex-1 py-1.5 text-center text-xs font-semibold rounded-lg text-zinc-400">Накопительные счета</button>
      </div>
      <div class="flex items-center gap-1.5 overflow-x-auto py-0.5">
        <button class="px-3 py-1 rounded-lg text-xs font-semibold bg-white text-zinc-950">Все сроки</button>
        <button class="px-3 py-1 rounded-lg text-xs font-medium bg-white/[0.04] text-zinc-400 border border-white/[0.06]">3 мес.</button>
        <button class="px-3 py-1 rounded-lg text-xs font-medium bg-white/[0.04] text-zinc-400 border border-white/[0.06]">6 мес.</button>
        <button class="px-3 py-1 rounded-lg text-xs font-medium bg-white/[0.04] text-zinc-400 border border-white/[0.06]">1 год</button>
      </div>
    </div>
    <div id="market-rates-offers-list" class="flex-1 overflow-y-auto px-4 py-3 space-y-3"></div>
  </div>

  <script src="marketRates.js"></script>
  <script>
    window.formatMoney = n => Number(n).toLocaleString("ru-RU") + " ₽";
    window.addEventListener("DOMContentLoaded", () => {
      const data = ${fs.readFileSync('data/market-rates.json', 'utf8')};
      marketRatesState.offers = data.offers;
      marketRatesState.cbrRate = data.cbrRate;
      marketRatesState.moexIndices = data.moexIndices;
      marketRatesState.activeTab = "deposits";
      marketRatesState.selectedTerm = "all";
      renderMarketRatesModalContent();
      if (typeof lucide !== "undefined") lucide.createIcons();
    });
  </script>
</body>
</html>`;

fs.writeFileSync('preview-rates-grouped.html', ratesHtml);
execSync(
  `"${CHROME}" --headless --no-sandbox --hide-scrollbars --window-size=390,844 --screenshot="preview-rates-grouped.png" preview-rates-grouped.html`
);
console.log(
  'Rates grouped screenshot created, size:',
  fs.statSync('preview-rates-grouped.png').size
);

// 2. Preview for Broker Chart with new max clearance
const brokerHtml = `<!DOCTYPE html>
<html lang="ru" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Preview: Broker Chart</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <link rel="stylesheet" href="style.css">
</head>
<body class="bg-black text-white p-3.5 min-h-screen flex flex-col justify-start">
  <div class="card bg-[#0E1016] border border-white/[0.06] rounded-2xl p-4 flex flex-col gap-3">
    <div class="flex items-center justify-between">
      <span class="text-xs font-semibold uppercase tracking-wider text-zinc-400">Инвестиционный портфель</span>
      <span class="text-xs text-zinc-500 font-mono">RUB</span>
    </div>
    <div class="text-2xl font-bold font-mono tracking-tight text-white">112 000 ₽</div>
    <div class="flex items-center gap-1 p-1 bg-white/[0.03] border border-white/[0.06] rounded-xl text-xs">
      <span class="flex-1 py-1 text-center rounded-lg bg-white text-zinc-950 font-semibold">1М</span>
      <span class="flex-1 py-1 text-center rounded-lg text-zinc-400">3М</span>
      <span class="flex-1 py-1 text-center rounded-lg text-zinc-400">6М</span>
      <span class="flex-1 py-1 text-center rounded-lg text-zinc-400">1Г</span>
      <span class="flex-1 py-1 text-center rounded-lg text-zinc-400">Всё</span>
    </div>
    <div class="h-44 w-full relative">
      <canvas id="brokerChart"></canvas>
    </div>
  </div>

  <script src="broker.js"></script>
  <script>
    window.formatMoney = n => Number(n).toLocaleString("ru-RU") + " ₽";
    window.formatDateStr = d => d;
    window.Cache = {
      brokerAssets: [
        { type: "cash", quantity: 50000 },
        { type: "share", ticker: "SBER", quantity: 200, currentPrice: 310, buyPrice: 280 }
      ],
      broker: {
        chartData: [
          { x: "1 сен", y: 98000, timestamp: Date.now() - 60*86400000, fullDate: "1 сентября" },
          { x: "20 сен", y: 92000, timestamp: Date.now() - 40*86400000, fullDate: "20 сентября" },
          { x: "10 окт", y: 118000, timestamp: Date.now() - 20*86400000, fullDate: "10 октября" },
          { x: "3 ноя", y: 112000, timestamp: Date.now(), fullDate: "3 ноября" }
        ]
      }
    };
    window.addEventListener("DOMContentLoaded", () => {
      drawBrokerChart();
    });
  </script>
</body>
</html>`;

fs.writeFileSync('preview-broker-chart.html', brokerHtml);
execSync(
  `"${CHROME}" --headless --no-sandbox --hide-scrollbars --window-size=390,844 --screenshot="preview-broker-chart.png" preview-broker-chart.html`
);
console.log('Broker chart screenshot created, size:', fs.statSync('preview-broker-chart.png').size);
