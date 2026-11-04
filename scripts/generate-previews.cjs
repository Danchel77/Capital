const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CHROME_PATH = path.resolve(__dirname, '../chrome-headless-shell/linux-156.0.8078.80/chrome-headless-shell-linux64/chrome-headless-shell');
const dataJson = fs.readFileSync(path.resolve(__dirname, '../data/market-rates.json'), 'utf8');
const marketRatesJs = fs.readFileSync(path.resolve(__dirname, '../marketRates.js'), 'utf8');

function createPreviewHtml({ term = 'all', openPopover = false, activeTab = 'deposits' }) {
  return `<!DOCTYPE html>
<html lang="ru" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Preview: Market Rates Modal</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <style>
    :root {
      --bg: #000000;
      --surface: #0e1016;
      --surface-2: #12151c;
      --surface-3: #1a1e29;
    }
    body {
      margin: 0;
      background: #000000;
      color: #ffffff;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-variant-numeric: tabular-nums;
      -webkit-font-smoothing: antialiased;
    }
    .custom-scrollbar::-webkit-scrollbar {
      width: 4px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
      background: rgba(255, 255, 255, 0.02);
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.15);
      border-radius: 4px;
    }
  </style>
</head>
<body class="p-3.5 bg-black min-h-screen flex items-center justify-center">

  <!-- МОДАЛКА: СТАВКИ И ПРЕДЛОЖЕНИЯ -->
  <div id="market-rates-modal" class="w-full max-w-sm rounded-3xl bg-[#0E1016] border border-white/10 p-4 shadow-2xl flex flex-col h-[780px] overflow-hidden relative">
    
    <!-- Шапка модалки -->
    <div class="flex items-center justify-between pb-3 border-b border-white/[0.06] mb-3 flex-shrink-0">
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center text-white font-bold text-sm">
          %
        </div>
        <div>
          <h3 class="text-sm font-bold text-white leading-tight">Ставки и предложения</h3>
          <p class="text-[11px] text-zinc-400">Лучшие доходности в банках</p>
        </div>
      </div>
      <div class="flex items-center gap-1.5">
        <button type="button" class="w-8 h-8 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-zinc-400">
          <i data-lucide="settings-2" class="w-4 h-4"></i>
        </button>
        <button type="button" class="w-8 h-8 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-zinc-400">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>
    </div>

    <!-- Переключатель табов: Вклады / Накопительные счета -->
    <div class="flex rounded-xl bg-white/[0.03] p-1 border border-white/[0.06] mb-3 flex-shrink-0">
      <button
        type="button"
        id="mr-tab-deposits"
        class="flex-1 py-1.5 text-center text-xs ${activeTab === 'deposits' ? 'font-semibold rounded-xl bg-[#181c26] text-white border border-[#282e3e] shadow-sm is-active' : 'font-medium rounded-xl text-zinc-400'}"
      >
        Вклады
      </button>
      <button
        type="button"
        id="mr-tab-accounts"
        class="flex-1 py-1.5 text-center text-xs ${activeTab === 'accounts' ? 'font-semibold rounded-xl bg-[#181c26] text-white border border-[#282e3e] shadow-sm is-active' : 'font-medium rounded-xl text-zinc-400'}"
      >
        Накопительные счета
      </button>
    </div>

    <!-- Быстрый фильтр сроков для вкладов -->
    <div id="mr-period-chips-container" class="grid grid-cols-4 gap-1 p-1 bg-white/[0.04] border border-white/[0.06] rounded-xl mb-3 flex-shrink-0 w-full ${activeTab === 'accounts' ? 'hidden' : ''}">
      <button type="button" data-term="all" class="mr-period-btn py-1.5 text-center rounded-lg text-xs ${term === 'all' ? 'bg-white text-zinc-950 font-semibold shadow-sm' : 'text-zinc-400 font-medium'}">Все сроки</button>
      <button type="button" data-term="3m" class="mr-period-btn py-1.5 text-center rounded-lg text-xs ${term === '3m' ? 'bg-white text-zinc-950 font-semibold shadow-sm' : 'text-zinc-400 font-medium'}">3 мес.</button>
      <button type="button" data-term="6m" class="mr-period-btn py-1.5 text-center rounded-lg text-xs ${term === '6m' ? 'bg-white text-zinc-950 font-semibold shadow-sm' : 'text-zinc-400 font-medium'}">6 мес.</button>
      <button type="button" data-term="12m" class="mr-period-btn py-1.5 text-center rounded-lg text-xs ${term === '12m' ? 'bg-white text-zinc-950 font-semibold shadow-sm' : 'text-zinc-400 font-medium'}">1 год</button>
    </div>

    <!-- Скроллируемый список предложений (id: market-rates-offers-list) -->
    <div id="market-rates-offers-list" class="flex-1 overflow-y-auto space-y-2 pr-1 -mr-1 min-h-0 pb-8 custom-scrollbar"></div>

    <!-- ВСПЛЫВАЮЩИЙ ПОПОВЕР: ОФИЦИАЛЬНЫЕ УСЛОВИЯ СТАВКИ -->
    <div
      id="rate-conditions-popover"
      class="fixed z-[130] hidden bg-[#1A1E29] border border-white/15 rounded-2xl p-4 shadow-2xl backdrop-blur-md transition-all duration-150 animate-fade-in w-[calc(100%-32px)] max-w-sm"
      style="left: 16px; right: 16px; margin: 0 auto;"
    >
      <div class="flex items-center justify-between pb-2 mb-2.5 border-b border-white/[0.08]">
        <div class="flex items-center gap-1.5 min-w-0">
          <div class="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0"></div>
          <span id="rcp-bank-title" class="text-[11px] font-semibold text-zinc-400 truncate">Банк</span>
          <span class="text-zinc-600 select-none">·</span>
          <span id="rcp-product-title" class="text-xs font-bold text-white truncate">Условия</span>
        </div>
        <button
          type="button"
          onclick="closeRateConditionsPopover()"
          class="w-6 h-6 rounded-full bg-white/[0.06] hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer transition-colors text-xs font-semibold flex-shrink-0 ml-2"
          title="Закрыть"
        >
          ✕
        </button>
      </div>

      <div class="relative">
        <div
          id="rcp-content"
          class="text-xs text-zinc-300 leading-relaxed max-h-44 overflow-y-auto overscroll-contain pr-1 pb-6 custom-scrollbar select-text"
        ></div>
        <div class="pointer-events-none absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-[#1A1E29] to-transparent rounded-b-xl"></div>
      </div>
    </div>

  </div>

  <script>
    // Подставляем мок-данные и логику ставок
    const mockJson = ${dataJson};

    // Helper functions expected by marketRates.js
    function formatMoney(amount) {
      if (amount === undefined || amount === null) return '0 ₽';
      return Math.round(amount).toLocaleString('ru-RU') + ' ₽';
    }
    function lockBodyScroll() {}
    function unlockBodyScroll() {}
    function showNotification() {}

    ${marketRatesJs}

    // Инициализируем состояние
    marketRatesState.offers = mockJson.offers;
    marketRatesState.cbrRate = mockJson.cbrRate;
    marketRatesState.moexIndices = mockJson.moexIndices;
    marketRatesState.lastUpdated = mockJson.updatedAt;
    marketRatesState.activeTab = '${activeTab}';
    marketRatesState.selectedTerm = '${term}';
    marketRatesState.isLoading = false;

    renderMarketRatesModalContent();

    if (${openPopover}) {
      const vtbBtn = document.querySelector('[data-bank*="ВТБ"]') || document.querySelector('[data-note]');
      if (vtbBtn) {
        handleRateInfoClick(vtbBtn);
      } else {
        showRateConditionsPopover(null, 'Банк ВТБ', 'ВТБ-Вклад', 'Ставка действует при открытии онлайн и размещении новых денежных средств. Для клиентов с пакетом услуг Привилегия действует надбавка +0.5% годовых.');
      }
    }
  </script>
</body>
</html>`;
}

const tests = [
  { name: 'preview-mode1-all', config: { term: 'all', openPopover: false, activeTab: 'deposits' } },
  { name: 'preview-mode2-3m', config: { term: '3m', openPopover: false, activeTab: 'deposits' } },
  { name: 'preview-popover', config: { term: 'all', openPopover: true, activeTab: 'deposits' } }
];

for (const t of tests) {
  const htmlPath = path.resolve(__dirname, `${t.name}.html`);
  const pngPath = path.resolve(__dirname, `${t.name}.png`);
  fs.writeFileSync(htmlPath, createPreviewHtml(t.config), 'utf8');
  console.log(`Wrote ${htmlPath}`);

  const cmd = `"${CHROME_PATH}" --headless --no-sandbox --hide-scrollbars --window-size=390,844 --screenshot="${pngPath}" "${htmlPath}"`;
  execSync(cmd);
  console.log(`Rendered ${pngPath}`);
}
