const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CHROME_PATH = path.resolve(__dirname, '../chrome-headless-shell/linux-156.0.8078.80/chrome-headless-shell-linux64/chrome-headless-shell');
const styleCss = fs.readFileSync(path.resolve(__dirname, '../style.css'), 'utf8');

function createPreviewHtml({ viewMode = 'numbers', openOthers = false, activeScreen = 'analytics' }) {
  return `<!DOCTYPE html>
<html lang="ru" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Preview: Financial Analytics</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
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
      overflow-x: hidden;
    }
    ${styleCss}
  </style>
</head>
<body class="bg-black min-h-screen flex items-center justify-center p-0">

  <div class="w-[390px] h-[844px] bg-[#000000] p-4 pt-6 pb-20 shadow-2xl flex flex-col overflow-y-auto overflow-x-hidden relative">
    
    ${activeScreen === 'analytics' ? `
      <!-- ЭКРАН 1: АНАЛИТИКА -->
      <div class="space-y-3.5">
        <!-- Чистая шапка экрана с переключением месяцев -->
        <div class="flex items-center justify-between px-1">
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="w-7 h-7 rounded-lg bg-[#12151C] border border-white/[0.08] text-zinc-300 flex items-center justify-center"
            >
              <i data-lucide="chevron-left" class="w-4 h-4"></i>
            </button>
            <h2 class="text-base sm:text-lg font-bold text-white tracking-tight select-none">
              Ноябрь 2026
            </h2>
            <button
              type="button"
              class="w-7 h-7 rounded-lg bg-[#12151C] border border-white/[0.08] text-zinc-300 flex items-center justify-center"
            >
              <i data-lucide="chevron-right" class="w-4 h-4"></i>
            </button>
          </div>
        </div>

        <!-- 1. Сводная карточка месяца (2 режима: Числа / Диаграмма) -->
        <div class="bg-[#0E1016] border border-white/[0.08] rounded-2xl p-4 shadow-sm relative overflow-hidden">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              ${viewMode === 'chart' ? 'Структура трат' : 'Сводка месяца'}
            </span>
            <button
              type="button"
              class="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.08] text-zinc-300 flex items-center justify-center"
            >
              <i data-lucide="${viewMode === 'chart' ? 'layout-list' : 'pie-chart'}" class="w-3.5 h-3.5"></i>
            </button>
          </div>

          ${viewMode === 'numbers' ? `
            <!-- Режим 1: Числа -->
            <div>
              <p class="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight my-1.5 font-mono">
                +84 500 ₽
              </p>
              <div class="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-white/[0.06]">
                <div class="flex flex-col gap-0.5 min-w-0">
                  <div class="flex items-center gap-1.5 text-[11px] text-zinc-400">
                    <span class="w-1.5 h-1.5 rounded-full bg-[#10B981] shrink-0"></span>
                    <span>Доходы</span>
                  </div>
                  <span class="font-mono font-bold text-[#10B981] text-sm">+240 000 ₽</span>
                </div>
                <div class="flex flex-col gap-0.5 min-w-0">
                  <div class="flex items-center gap-1.5 text-[11px] text-zinc-400">
                    <span class="w-1.5 h-1.5 rounded-full bg-[#F43F5E] shrink-0"></span>
                    <span>Расходы</span>
                  </div>
                  <span class="font-mono font-bold text-zinc-200 text-sm">-155 500 ₽</span>
                </div>
              </div>
            </div>
          ` : `
            <!-- Режим 2: Компактная диаграмма структуры -->
            <div class="pt-1">
              <div class="flex items-center justify-between pb-2 mb-2 border-b border-white/[0.06]">
                <span class="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Структура расходов</span>
                <div class="flex bg-[#12151C] p-0.5 rounded-lg border border-white/[0.06]">
                  <span class="px-2 py-0.5 text-[11px] font-semibold rounded-md bg-white/10 text-white">Расход</span>
                  <span class="px-2 py-0.5 text-[11px] font-semibold rounded-md text-zinc-400">Доход</span>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <div class="chart-canvas--donut-mini">
                  <canvas id="categoryExpensesChart"></canvas>
                  <div class="donut-center--mini">
                    <span class="donut-center__label">Расходы</span>
                    <strong class="donut-center__total">155 500 ₽</strong>
                  </div>
                </div>
                <div id="category-legend" class="flex-1 min-w-0 space-y-1">
                  <div class="category-legend__item flex items-center justify-between p-1.5 rounded-lg bg-[#12151C] border border-white/[0.04]">
                    <div class="flex items-center gap-1.5 min-w-0 pr-1">
                      <span class="category-legend__dot w-2 h-2 rounded-full flex-shrink-0 bg-[#38BDF8]"></span>
                      <span class="category-legend__name text-xs font-medium text-zinc-200 truncate">Супермаркеты</span>
                    </div>
                    <div class="flex items-center gap-2 flex-shrink-0">
                      <span class="category-legend__value font-mono font-semibold text-xs text-white">52 000 ₽</span>
                      <span class="category-legend__percent font-mono text-[11px] text-zinc-500 w-7 text-right">33%</span>
                    </div>
                  </div>
                  <div class="category-legend__item flex items-center justify-between p-1.5 rounded-lg bg-[#12151C] border border-white/[0.04]">
                    <div class="flex items-center gap-1.5 min-w-0 pr-1">
                      <span class="category-legend__dot w-2 h-2 rounded-full flex-shrink-0 bg-[#F59E0B]"></span>
                      <span class="category-legend__name text-xs font-medium text-zinc-200 truncate">Аренда и ЖКХ</span>
                    </div>
                    <div class="flex items-center gap-2 flex-shrink-0">
                      <span class="category-legend__value font-mono font-semibold text-xs text-white">45 000 ₽</span>
                      <span class="category-legend__percent font-mono text-[11px] text-zinc-500 w-7 text-right">29%</span>
                    </div>
                  </div>
                  <div class="category-legend__item flex items-center justify-between p-1.5 rounded-lg bg-[#12151C] border border-white/[0.04]">
                    <div class="flex items-center gap-1.5 min-w-0 pr-1">
                      <span class="category-legend__dot w-2 h-2 rounded-full flex-shrink-0 bg-[#F43F5E]"></span>
                      <span class="category-legend__name text-xs font-medium text-zinc-200 truncate">Рестораны и кафе</span>
                    </div>
                    <div class="flex items-center gap-2 flex-shrink-0">
                      <span class="category-legend__value font-mono font-semibold text-xs text-white">24 500 ₽</span>
                      <span class="category-legend__percent font-mono text-[11px] text-zinc-500 w-7 text-right">16%</span>
                    </div>
                  </div>
                  <div class="category-legend__item flex items-center justify-between p-1.5 rounded-lg bg-[#12151C] border border-white/[0.04]">
                    <div class="flex items-center gap-1.5 min-w-0 pr-1">
                      <span class="category-legend__dot w-2 h-2 rounded-full flex-shrink-0 bg-[#A855F7]"></span>
                      <span class="category-legend__name text-xs font-medium text-zinc-200 truncate">Транспорт и авто</span>
                    </div>
                    <div class="flex items-center gap-2 flex-shrink-0">
                      <span class="category-legend__value font-mono font-semibold text-xs text-white">18 000 ₽</span>
                      <span class="category-legend__percent font-mono text-[11px] text-zinc-500 w-7 text-right">12%</span>
                    </div>
                  </div>
                  <div id="others-btn" class="category-legend__item flex items-center justify-between p-1.5 rounded-lg bg-[#12151C] border border-white/[0.04] hover:bg-white/[0.08] cursor-pointer">
                    <div class="flex items-center gap-1.5 min-w-0 pr-1">
                      <span class="category-legend__dot w-2 h-2 rounded-full flex-shrink-0 bg-[#71717A]"></span>
                      <span class="category-legend__name text-xs font-medium text-zinc-300 truncate">Остальные (4) ›</span>
                    </div>
                    <div class="flex items-center gap-2 flex-shrink-0">
                      <span class="category-legend__value font-mono font-semibold text-xs text-white">16 000 ₽</span>
                      <span class="category-legend__percent font-mono text-[11px] text-zinc-400 w-7 text-right">10%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          `}
        </div>

        <!-- 2. Ближайшие списания -->
        <div class="space-y-2">
          <div class="flex items-center justify-between px-1">
            <span class="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Предстоящие платежи</span>
            <span class="text-[11px] text-zinc-500 font-mono">14 200 ₽</span>
          </div>
          <div class="p-3 rounded-2xl bg-[#0E1016] border border-white/[0.06] flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                <i data-lucide="zap" class="w-4 h-4"></i>
              </div>
              <div>
                <div class="text-xs font-semibold text-white">Электроэнергия</div>
                <div class="text-[10px] text-zinc-400">Через 3 дня · 10 ноября</div>
              </div>
            </div>
            <div class="font-mono text-xs font-bold text-white">3 400 ₽</div>
          </div>
        </div>

        <!-- 3. Цели накопления -->
        <div class="space-y-2">
          <div class="flex items-center justify-between px-1">
            <span class="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Цели накопления</span>
            <button class="w-6 h-6 rounded-lg bg-white/[0.06] text-zinc-300 flex items-center justify-center">
              <i data-lucide="plus" class="w-3 h-3"></i>
            </button>
          </div>
          <div class="p-3 rounded-2xl bg-[#0E1016] border border-white/[0.06] space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold text-white">Отпуск 2027</span>
              <span class="font-mono text-xs font-semibold text-emerald-400">240 000 / 300 000 ₽</span>
            </div>
            <div class="w-full bg-white/[0.06] h-1.5 rounded-full overflow-hidden">
              <div class="bg-emerald-400 h-full rounded-full" style="width: 80%"></div>
            </div>
          </div>
        </div>

        <!-- 4. Динамика сальдо (Net Flow Spline) -->
        <div class="bg-[#0E1016] border border-white/[0.08] rounded-2xl p-4 shadow-sm pb-5">
          <div class="flex items-center justify-between gap-2 mb-3">
            <div>
              <span class="text-xs uppercase tracking-wider font-bold text-zinc-400 block">Динамика сальдо</span>
              <div class="text-[11px] text-zinc-500 font-medium mt-0.5">За 2026 год</div>
            </div>
            <div class="text-right">
              <div class="text-[10px] text-zinc-500 uppercase font-semibold">Среднее в мес.</div>
              <div class="text-xs sm:text-sm font-bold font-mono text-white">+62 300 ₽</div>
            </div>
          </div>
          <div class="w-full h-[180px] relative">
            <canvas id="monthlyExpensesChart"></canvas>
          </div>
        </div>
      </div>
    ` : `
      <!-- ЭКРАН 3: ОПЕРАЦИИ (ИНСТРУМЕНТАЛЬНЫЙ ЖУРНАЛ) -->
      <div class="space-y-3">
        <!-- 50/50 кнопки добавления и импорта -->
        <div class="grid grid-cols-2 gap-2">
          <button class="py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 bg-white text-black active:scale-[0.98]">
            <i data-lucide="plus" class="w-3.5 h-3.5"></i>
            <span>Операция</span>
          </button>
          <button class="py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 bg-white/[0.05] border border-white/[0.08] text-white active:scale-[0.98]">
            <i data-lucide="file-up" class="w-3.5 h-3.5 text-zinc-400"></i>
            <span>Импорт PDF</span>
          </button>
        </div>

        <!-- Поисковая строка -->
        <div class="relative flex items-center">
          <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
            <i data-lucide="search" class="w-4 h-4"></i>
          </div>
          <input
            type="text"
            id="tx-search-input"
            placeholder="Поиск по операциям или суммам..."
            style="padding-left: 42px !important;"
            class="w-full input-with-left-icon pr-3 py-2 bg-[#0E1016] border border-white/[0.06] rounded-xl text-xs text-white placeholder-zinc-500 outline-none"
          />
        </div>

        <!-- Фильтры: месяц и категория -->
        <div class="flex items-center gap-2">
          <div class="flex-1 py-1.5 px-2.5 bg-[#0E1016] border border-white/[0.06] rounded-xl flex items-center justify-between text-xs text-zinc-300">
            <span>Ноябрь 2026</span>
            <i data-lucide="chevron-down" class="w-3.5 h-3.5 text-zinc-500"></i>
          </div>
          <div class="flex-1 py-1.5 px-2.5 bg-[#0E1016] border border-white/[0.06] rounded-xl flex items-center justify-between text-xs text-zinc-300">
            <span>Все категории</span>
            <i data-lucide="chevron-down" class="w-3.5 h-3.5 text-zinc-500"></i>
          </div>
        </div>

        <!-- Список транзакций -->
        <div class="space-y-1.5 pt-1">
          <div class="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider px-1">Сегодня, 5 ноября</div>
          
          <div class="p-3 bg-[#0E1016] border border-white/[0.06] rounded-2xl flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center">
                <i data-lucide="shopping-cart" class="w-4 h-4"></i>
              </div>
              <div>
                <div class="text-xs font-semibold text-white">ВкусВилл</div>
                <div class="text-[10px] text-zinc-400">Супермаркеты · Карта Т-Банк</div>
              </div>
            </div>
            <div class="text-right font-mono">
              <div class="text-xs font-bold text-white">-2 450 ₽</div>
              <div class="text-[10px] text-zinc-500">14:22</div>
            </div>
          </div>

          <div class="p-3 bg-[#0E1016] border border-white/[0.06] rounded-2xl flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
                <i data-lucide="car" class="w-4 h-4"></i>
              </div>
              <div>
                <div class="text-xs font-semibold text-white">Лукойл АЗС №412</div>
                <div class="text-[10px] text-zinc-400">Транспорт и авто · Сбербанк</div>
              </div>
            </div>
            <div class="text-right font-mono">
              <div class="text-xs font-bold text-white">-3 100 ₽</div>
              <div class="text-[10px] text-zinc-500">11:05</div>
            </div>
          </div>

          <div class="p-3 bg-[#0E1016] border border-white/[0.06] rounded-2xl flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-xl bg-[#13251E] text-[#34D399] border border-[#1E3E32] flex items-center justify-center">
                <i data-lucide="arrow-down-left" class="w-4 h-4"></i>
              </div>
              <div>
                <div class="text-xs font-semibold text-white">Аванс за ноябрь</div>
                <div class="text-[10px] text-zinc-400">Зарплата · ВТБ</div>
              </div>
            </div>
            <div class="text-right font-mono">
              <div class="text-xs font-bold text-emerald-400">+120 000 ₽</div>
              <div class="text-[10px] text-zinc-500">09:30</div>
            </div>
          </div>
        </div>
      </div>
    `}

    <!-- ВСПЛЫВАЮЩИЙ ПОПОВЕР: ОСТАЛЬНЫЕ КАТЕГОРИИ -->
    <div
      id="category-others-popover"
      class="fixed z-[130] ${openOthers ? '' : 'hidden'} bg-[#1A1E29] border border-white/15 rounded-2xl p-4 shadow-2xl backdrop-blur-md transition-all duration-150 animate-fade-in w-[calc(100%-32px)] max-w-sm"
      style="left: 16px; right: 16px; margin: 0 auto; top: 220px;"
    >
      <div class="flex items-center justify-between pb-2 mb-2.5 border-b border-white/[0.08]">
        <div class="flex items-center gap-1.5 min-w-0">
          <div class="w-2 h-2 rounded-full bg-zinc-400 flex-shrink-0"></div>
          <span class="text-xs font-bold text-white truncate">Остальные категории (4)</span>
        </div>
        <button
          type="button"
          class="w-6 h-6 rounded-full bg-white/[0.06] text-zinc-400 flex items-center justify-center text-xs font-semibold"
        >
          ✕
        </button>
      </div>

      <div class="relative">
        <div class="space-y-1.5 max-h-48 overflow-y-auto pr-1 pb-4 select-text">
          <div class="flex items-center justify-between py-1 border-b border-white/[0.04] text-xs">
            <span class="text-zinc-300 truncate pr-2">Подписки и сервисы</span>
            <div class="flex items-center gap-2 flex-shrink-0 font-mono">
              <span class="text-white font-semibold">5 500 ₽</span>
              <span class="text-[10px] text-zinc-500 w-6 text-right">4%</span>
            </div>
          </div>
          <div class="flex items-center justify-between py-1 border-b border-white/[0.04] text-xs">
            <span class="text-zinc-300 truncate pr-2">Аптеки и здоровье</span>
            <div class="flex items-center gap-2 flex-shrink-0 font-mono">
              <span class="text-white font-semibold">4 200 ₽</span>
              <span class="text-[10px] text-zinc-500 w-6 text-right">3%</span>
            </div>
          </div>
          <div class="flex items-center justify-between py-1 border-b border-white/[0.04] text-xs">
            <span class="text-zinc-300 truncate pr-2">Кино и развлечения</span>
            <div class="flex items-center gap-2 flex-shrink-0 font-mono">
              <span class="text-white font-semibold">3 800 ₽</span>
              <span class="text-[10px] text-zinc-500 w-6 text-right">2%</span>
            </div>
          </div>
          <div class="flex items-center justify-between py-1 text-xs">
            <span class="text-zinc-300 truncate pr-2">Одежда и обувь</span>
            <div class="flex items-center gap-2 flex-shrink-0 font-mono">
              <span class="text-white font-semibold">2 500 ₽</span>
              <span class="text-[10px] text-zinc-500 w-6 text-right">1%</span>
            </div>
          </div>
        </div>
        <div class="pointer-events-none absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-[#1A1E29] to-transparent rounded-b-xl"></div>
      </div>
    </div>

    <!-- НИЖНЯЯ ПАНЕЛЬ НАВИГАЦИИ (3 ВКЛАДКИ) -->
    <nav class="fixed bottom-0 left-0 right-0 h-16 bg-[#0E1016]/95 border-t border-white/[0.06] backdrop-blur-md flex items-center justify-around px-4 z-50 max-w-[390px] mx-auto">
      <button class="flex flex-col items-center gap-1 ${activeScreen === 'analytics' ? 'text-white' : 'text-zinc-500'}">
        <i data-lucide="pie-chart" class="w-5 h-5"></i>
        <span class="text-[10px] font-semibold">Аналитика</span>
      </button>
      <button class="flex flex-col items-center gap-1 text-zinc-500">
        <i data-lucide="landmark" class="w-5 h-5"></i>
        <span class="text-[10px] font-medium">Капитал</span>
      </button>
      <button class="flex flex-col items-center gap-1 ${activeScreen === 'operations' ? 'text-white' : 'text-zinc-500'}">
        <i data-lucide="receipt-text" class="w-5 h-5"></i>
        <span class="text-[10px] font-medium">Операции</span>
      </button>
    </nav>
  </div>

  <script>
    if (typeof lucide !== 'undefined') lucide.createIcons();

    // Рендер Donut диаграммы (если на экране)
    const donutCanvas = document.getElementById('categoryExpensesChart');
    if (donutCanvas) {
      new Chart(donutCanvas.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: ['Супермаркеты', 'Аренда и ЖКХ', 'Рестораны и кафе', 'Транспорт и авто', 'Остальные'],
          datasets: [{
            data: [52000, 45000, 24500, 18000, 16000],
            backgroundColor: ['#38BDF8', '#F59E0B', '#F43F5E', '#A855F7', '#71717A'],
            borderColor: '#0E1016',
            borderWidth: 2,
            hoverOffset: 3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          layout: { padding: 2 },
          cutout: '74%',
          animation: false,
          plugins: {
            legend: { display: false },
            tooltip: { enabled: false }
          }
        }
      });
    }

    // Рендер кривой сальдо (если на экране)
    const splineCanvas = document.getElementById('monthlyExpensesChart');
    if (splineCanvas) {
      new Chart(splineCanvas.getContext('2d'), {
        type: 'line',
        data: {
          labels: ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'],
          datasets: [{
            data: [45000, 52000, 48000, 61000, 55000, 72000, 68000, 80000, 75000, 62000, 84500, 70000],
            borderColor: '#10B981',
            borderWidth: 2,
            tension: 0.35,
            pointRadius: 0,
            fill: {
              target: 'origin',
              above: 'rgba(16, 185, 129, 0.08)'
            }
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { enabled: false }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: '#71717a', font: { size: 10, weight: '500', family: 'Inter, system-ui, sans-serif' } }
            },
            y: {
              grid: { color: 'rgba(255, 255, 255, 0.04)' },
              ticks: { display: false }
            }
          }
        }
      });
    }
  </script>
</body>
</html>`;
}

const previews = [
  { name: 'preview-analytics-numbers', viewMode: 'numbers', openOthers: false, activeScreen: 'analytics' },
  { name: 'preview-analytics-donut', viewMode: 'chart', openOthers: false, activeScreen: 'analytics' },
  { name: 'preview-analytics-others', viewMode: 'chart', openOthers: true, activeScreen: 'analytics' },
  { name: 'preview-operations', viewMode: 'numbers', openOthers: false, activeScreen: 'operations' },
];

for (const p of previews) {
  const htmlPath = path.resolve(__dirname, `${p.name}.html`);
  const pngPath = path.resolve(__dirname, `${p.name}.png`);
  
  fs.writeFileSync(htmlPath, createPreviewHtml(p), 'utf8');
  console.log(`Generating ${p.name}.png...`);
  
  execSync(`"${CHROME_PATH}" --headless --no-sandbox --hide-scrollbars --window-size=390,844 --screenshot="${pngPath}" "${htmlPath}"`, {
    stdio: 'inherit'
  });
}

console.log('All previews generated successfully!');
