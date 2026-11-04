const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CHROME_PATH = path.resolve(__dirname, '../chrome-headless-shell/linux-156.0.8078.80/chrome-headless-shell-linux64/chrome-headless-shell');
const dataJson = fs.readFileSync(path.resolve(__dirname, '../data/market-rates.json'), 'utf8');
const marketRatesJs = fs.readFileSync(path.resolve(__dirname, '../marketRates.js'), 'utf8');
const bankLogosJs = fs.readFileSync(path.resolve(__dirname, '../bank-logos.js'), 'utf8');
const styleCss = fs.readFileSync(path.resolve(__dirname, '../style.css'), 'utf8');

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
    ${styleCss}
  </style>
</head>
<body class="bg-black min-h-screen flex items-center justify-center p-0">

  <!-- МОДАЛКА: СТАВКИ И ПРЕДЛОЖЕНИЯ (Obsidian Minimalist - Full Mobile View) -->
  <div id="market-rates-modal" class="w-full h-[844px] bg-[#0E1016] p-4 pt-6 pb-6 shadow-2xl flex flex-col overflow-hidden relative">
    
    <!-- Шапка модалки -->
    <div class="flex items-center justify-between pb-3 border-b border-white/[0.06] mb-3 flex-shrink-0">
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-white">
          <i data-lucide="percent" class="w-4 h-4"></i>
        </div>
        <div>
          <h3 class="text-base font-bold text-white leading-tight">Ставки и предложения</h3>
          <p class="text-[11px] text-zinc-400">
            Ставка ЦБ: <span id="market-modal-cbr-rate" class="font-mono font-medium text-zinc-200">14,0%</span>
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button type="button" class="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer transition-colors">
          <i data-lucide="sliders" class="w-4 h-4"></i>
        </button>
        <button type="button" class="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer transition-colors text-xs font-semibold">
          ✕
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
    const mockJson = ${dataJson};

    function formatMoney(amount) {
      if (amount === undefined || amount === null) return '0 ₽';
      return Math.round(amount).toLocaleString('ru-RU') + ' ₽';
    }
    function lockBodyScroll() {}
    function unlockBodyScroll() {}
    function showNotification() {}

    ${bankLogosJs}
    ${marketRatesJs}

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

    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons();
    }
  </script>
</body>
</html>`;
}

function createSettingsPreviewHtml() {
  return `<!DOCTYPE html>
<html lang="ru" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Preview: Market Rates Settings Modal</title>
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
<body class="bg-black min-h-screen flex items-center justify-center p-0">

  <!-- МОДАЛКА: НАСТРОЙКИ СТАВОК И БАНКОВ (Obsidian Minimalist - Full Mobile View) -->
  <div id="market-rates-settings-modal" class="w-full h-[844px] bg-[#0E1016] p-4 pt-6 pb-6 shadow-2xl flex flex-col overflow-hidden relative">
    
    <!-- Шапка окна настроек -->
    <div class="flex items-center justify-between mb-4 flex-shrink-0">
      <h3 class="text-base font-bold text-white leading-tight">Настройки фильтров</h3>
      <button
        type="button"
        class="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer transition-colors text-xs font-semibold"
        title="Закрыть"
      >
        ✕
      </button>
    </div>

    <!-- Скроллируемое тело настроек -->
    <div class="flex-1 overflow-y-auto space-y-4 pr-1 -mr-1 pb-4 text-xs overscroll-contain touch-pan-y custom-scrollbar">
      <!-- 1. Максимальный срок вклада в виджете -->
      <div class="space-y-2 pb-4 border-b border-white/[0.06]">
        <label class="block text-zinc-300 font-semibold text-xs">
          Максимальный срок вклада в виджете
        </label>
        <div class="px-1 pt-1.5">
          <input
            type="range"
            id="mr-settings-max-months-slider"
            min="0"
            max="3"
            step="1"
            class="w-full accent-white h-1.5 bg-white/10 rounded-lg cursor-pointer"
            oninput="handleMaxMonthsSliderChange(this.value)"
          />
          <input type="hidden" id="mr-settings-max-months" value="12" />
          <div class="flex justify-between text-[11px] text-zinc-400 font-mono mt-2 select-none">
            <span>1 мес.</span>
            <span>3 мес.</span>
            <span>6 мес.</span>
            <span>1 год</span>
          </div>
        </div>
      </div>

      <!-- 2. Условия предложений -->
      <div class="space-y-1.5 pb-4 border-b border-white/[0.06]">
        <span class="block text-zinc-300 font-semibold text-xs mb-1">
          Условия предложений
        </span>
        <div id="mr-settings-tags-list" class="space-y-0.5"></div>
      </div>

      <!-- 3. Список отслеживаемых банков -->
      <div class="space-y-2.5 pt-1">
        <span class="block text-zinc-300 font-semibold text-xs">
          Отслеживаемые банки
        </span>

        <!-- Быстрые кнопки выбора -->
        <div class="grid grid-cols-3 gap-1 p-1 bg-white/[0.04] border border-white/[0.06] rounded-xl">
          <button
            type="button"
            onclick="selectBanksPreset('top10')"
            class="py-1 rounded-lg text-center text-[11px] font-medium text-zinc-300 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
          >
            ТОП-10
          </button>
          <button
            type="button"
            onclick="selectBanksPreset('all')"
            class="py-1 rounded-lg text-center text-[11px] font-medium text-zinc-300 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
          >
            Все банки
          </button>
          <button
            type="button"
            onclick="selectBanksPreset('none')"
            class="py-1 rounded-lg text-center text-[11px] font-medium text-zinc-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
          >
            Сбросить
          </button>
        </div>

        <!-- Список чекбоксов банков во всю ширину -->
        <div id="mr-settings-banks-list" class="pt-1"></div>
      </div>
    </div>

    <!-- Кнопки действий -->
    <div class="flex gap-2 pt-3 flex-shrink-0 border-t border-white/[0.06] mt-2">
      <button
        type="button"
        class="flex-1 py-2.5 px-3 rounded-xl bg-white/[0.06] hover:bg-white/10 active:scale-95 text-zinc-300 text-xs font-semibold transition-all cursor-pointer"
      >
        Отмена
      </button>
      <button
        type="button"
        class="flex-1 py-2.5 px-3 rounded-xl bg-white hover:bg-zinc-200 active:scale-95 text-zinc-950 text-xs font-semibold transition-all shadow-sm cursor-pointer"
      >
        Сохранить
      </button>
    </div>
  </div>

  <script>
    function lockBodyScroll() {}
    function unlockBodyScroll() {}
    function showNotification() {}

    ${bankLogosJs}
    ${marketRatesJs}

    initMarketRatesSettingsForm();

    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons();
    }
  </script>
</body>
</html>`;
}

const tests = [
  { name: 'preview-deposits', config: { term: 'all', openPopover: false, activeTab: 'deposits' } },
  { name: 'preview-accounts', config: { term: 'all', openPopover: false, activeTab: 'accounts' } },
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

// Generate Settings Preview
const settingsHtmlPath = path.resolve(__dirname, 'preview-settings.html');
const settingsPngPath = path.resolve(__dirname, 'preview-settings.png');
fs.writeFileSync(settingsHtmlPath, createSettingsPreviewHtml(), 'utf8');
console.log(`Wrote ${settingsHtmlPath}`);
execSync(`"${CHROME_PATH}" --headless --no-sandbox --hide-scrollbars --window-size=390,844 --screenshot="${settingsPngPath}" "${settingsHtmlPath}"`);
console.log(`Rendered ${settingsPngPath}`);
