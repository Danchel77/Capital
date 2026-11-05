const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const CHROME_PATH = path.resolve(__dirname, '../chrome-headless-shell/linux-156.0.8078.80/chrome-headless-shell-linux64/chrome-headless-shell');

// Парсинг аргументов
const args = process.argv.slice(2);
function getArg(name, def = null) {
  const prefix = `--${name}=`;
  const hit = args.find(a => a.startsWith(prefix));
  if (hit) return hit.slice(prefix.length);
  if (args.includes(`--${name}`)) return true;
  return def;
}

const targetTab = getArg('tab', 'capital'); // 'budget' | 'capital' | 'transactions'
const summaryMode = getArg('mode', 'numbers'); // 'numbers' | 'chart'
const openDepForm = getArg('openDepositForm', false);
const openBankDropdown = getArg('openBankDropdown', false);
const outPath = path.resolve(process.cwd(), getArg('out', 'scripts/preview-harness.png'));

// Мок-данные для наполнения реального приложения
const mockCache = {
  deposits: [
    {
      id: 'dep-1',
      name: 'Сбер Накопительный',
      bank: 'Сбербанк',
      amount: 1500000,
      rate: 16.0,
      startDate: '2026-01-10',
      endDate: '2027-07-10',
      status: 'Активен',
      isInterestCredited: false
    },
    {
      id: 'dep-2',
      name: 'Т-Банк Максимум',
      bank: 'Т-Банк',
      amount: 450000,
      rate: 15.5,
      startDate: '2026-02-01',
      endDate: '2027-08-01',
      status: 'Активен',
      isInterestCredited: false
    },
    {
      id: 'dep-3',
      name: 'ВТБ Выгодный',
      bank: 'ВТБ',
      amount: 301162,
      rate: 14.8,
      startDate: '2026-03-15',
      endDate: '2027-09-15',
      status: 'Активен',
      isInterestCredited: false
    }
  ],
  savingsAccounts: [
    {
      id: 'sa-1',
      name: 'Копилка ВТБ',
      bank: 'ВТБ',
      amount: 150000,
      rate: 15.0,
      status: 'Активен'
    },
    {
      id: 'sa-2',
      name: 'Озон Счёт',
      bank: 'Ozon Банк',
      amount: 85000,
      rate: 15.1,
      status: 'Активен'
    }
  ],
  transactions: [
    {
      id: '2026-11',
      monthId: '2026-11',
      label: 'Ноябрь 2026',
      items: [
        { id: 'tx-1', type: 'Доход', amount: 240000, category: 'Зарплата', name: 'Основная зарплата', date: '2026-11-05', rawDate: '2026-11-05', formattedDate: '05.11.2026', timestamp: 1793865600000, dayTimestamp: 1793865600000, note: '' },
        { id: 'tx-2', type: 'Расход', amount: 48500, category: 'Супермаркеты', name: 'Продукты Eurospar', date: '2026-11-04', rawDate: '2026-11-04', formattedDate: '04.11.2026', timestamp: 1793779200000, dayTimestamp: 1793779200000, note: '' },
        { id: 'tx-3', type: 'Расход', amount: 32000, category: 'Кафе и рестораны', name: 'Ужины и кофе', date: '2026-11-03', rawDate: '2026-11-03', formattedDate: '03.11.2026', timestamp: 1793692800000, dayTimestamp: 1793692800000, note: '' },
        { id: 'tx-4', type: 'Расход', amount: 28000, category: 'Квартира и ЖКХ', name: 'Коммунальные услуги', date: '2026-11-02', rawDate: '2026-11-02', formattedDate: '02.11.2026', timestamp: 1793606400000, dayTimestamp: 1793606400000, note: '' },
        { id: 'tx-5', type: 'Расход', amount: 19500, category: 'Транспорт и авто', name: 'Бензин и парковки', date: '2026-11-01', rawDate: '2026-11-01', formattedDate: '01.11.2026', timestamp: 1793520000000, dayTimestamp: 1793520000000, note: '' },
        { id: 'tx-6', type: 'Расход', amount: 15000, category: 'Здоровье и аптеки', name: 'Витамины и стоматолог', date: '2026-11-01', rawDate: '2026-11-01', formattedDate: '01.11.2026', timestamp: 1793520000000, dayTimestamp: 1793520000000, note: '' },
        { id: 'tx-7', type: 'Расход', amount: 12500, category: 'Одежда и обувь', name: 'Покупки', date: '2026-11-01', rawDate: '2026-11-01', formattedDate: '01.11.2026', timestamp: 1793520000000, dayTimestamp: 1793520000000, note: '' }
      ]
    }
  ],
  goals: [
    { id: 'goal-1', name: 'Резервный фонд', targetAmount: 1000000, currentAmount: 850000, color: '#10B981', icon: 'shield-check' },
    { id: 'goal-2', name: 'Отпуск на море', targetAmount: 350000, currentAmount: 195000, color: '#38BDF8', icon: 'plane' }
  ],
  calendarBills: [
    { id: 'bill-1', name: 'Ипотека / аренда', amount: 45000, day: 12, category: 'Квартира и ЖКХ' },
    { id: 'bill-2', name: 'Интернет и связь', amount: 2500, day: 18, category: 'Связь' }
  ],
  broker: [],
  budgetPlan: {
    monthlyIncome: 240000
  },
  isInitialDataLoaded: true
};

const userSettingsMock = {
  marketRatesBanks: ['Сбербанк', 'ВТБ', 'Т-Банк', 'Альфа-Банк', 'Газпромбанк', 'Совкомбанк'],
  maxDepositTermMonths: 6,
  depositTags: ['новые деньги', 'капитализация']
};

// Читаем реальный index.html
const indexHtmlRaw = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

// Скрипт перехвата и инъекции моков
const previewInjectionScript = `
<script>
  window.__PREVIEW_MODE__ = true;
  window.currentUser = { uid: 'preview-user-123', email: 'preview@budget.local', displayName: 'Алексей' };
  window.Cache = ${JSON.stringify(mockCache)};
  window.UserSettings = ${JSON.stringify(userSettingsMock)};

  // Блокируем обращение к Firebase сети
  window.resetGlobalCache = function() {
    console.log('[Preview] resetGlobalCache bypassed');
  };
  window.fetchAllData = async function(silent) {
    console.log('[Preview] fetchAllData bypassed');
    return true;
  };
  window.loadUserSettings = async function(user) {
    console.log('[Preview] loadUserSettings bypassed');
    return userSettingsMock;
  };
  window.initNewUserIfNeeded = async function() { return true; };
  window.checkAndSendReminders = function() {};
  window.initMarketRatesModule = function() {};
  window.initDailyInsight = function() {};

  localStorage.setItem('budget_active_tab', '${targetTab}');
  localStorage.setItem('budget_summary_mode', '${summaryMode}');

  async function initHarness() {
    try {
      const splash = document.getElementById('loading-screen');
      if (splash) splash.remove();
      const login = document.getElementById('login-screen');
      if (login) login.remove();

      if (window.Cache) {
        Object.assign(window.Cache, ${JSON.stringify(mockCache)});
      }
      if (typeof window.processDeposits === 'function') {
        window.Cache.deposits = window.processDeposits(window.Cache.deposits);
      }
      if (typeof window.switchTab === 'function') {
        window.switchTab('${targetTab}', { initial: true });
      }
      if ('${targetTab}' === 'capital') {
        if (typeof window.renderDeposits === 'function') {
          window.renderDeposits();
        }
        if (typeof window.renderSavingsAccounts === 'function') window.renderSavingsAccounts();
        if ('${openDepForm}' === 'true') {
          const formContainer = document.getElementById('deposit-form-container');
          if (formContainer) formContainer.classList.remove('hidden');
          if ('${openBankDropdown}' === 'true') {
            if (typeof window.openCustomBankDropdown === 'function') {
              window.openCustomBankDropdown('dep-bank');
            } else if (typeof window.toggleCustomBankDropdown === 'function') {
              window.toggleCustomBankDropdown('dep-bank');
            } else {
              const dropdown = document.getElementById('dep-bank-dropdown');
              if (dropdown) dropdown.classList.remove('hidden');
            }
          }
        }
      } else if ('${targetTab}' === 'budget') {
        if (typeof window.renderBudgetTab === 'function') {
          window.renderBudgetTab();
        }
        if (typeof window.applyMonthSummaryViewMode === 'function') {
          window.applyMonthSummaryViewMode('${summaryMode}');
        }
        if (typeof window.updateAnalyticsForMonth === 'function') {
          window.updateAnalyticsForMonth('2026-11');
        }
      } else if ('${targetTab}' === 'transactions') {
        console.log('[Preview] transactions branch: calling renderTransactions');
        if (typeof window.renderTransactions === 'function') {
          window.renderTransactions();
        }
        console.log('[Preview] transactions branch finished, list children:', document.getElementById('transactions-list')?.children?.length, 'html length:', document.getElementById('transactions-list')?.innerHTML?.length);
        const list = document.getElementById('transactions-list');
        if (list) {
          const rect = list.getBoundingClientRect();
          console.log('[Preview] list rect:', rect.top, rect.left, rect.width, rect.height, 'display:', window.getComputedStyle(list).display, 'visibility:', window.getComputedStyle(list).visibility, 'opacity:', window.getComputedStyle(list).opacity);
          console.log('[Preview] list html length:', list.innerHTML.length);
          console.log('[Preview] list outerHTML sample:', JSON.stringify(list.innerHTML.slice(0, 1500)));
        }
      }

      if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
      }
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
      const readyMarker = document.createElement('div');
      readyMarker.id = '__HARNESS_READY__';
      document.body.appendChild(readyMarker);
      console.log('[Preview] initHarness completed, deposits-list children:', document.getElementById('deposits-list')?.children?.length);
    } catch (err) {
      console.error('[Preview] initHarness error:', err);
    }
  }

  let harnessInitialized = false;
  async function runHarnessOnce() {
    if (harnessInitialized) return;
    harnessInitialized = true;
    await initHarness();
  }
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', runHarnessOnce);
  } else {
    runHarnessOnce();
  }
  window.addEventListener('load', initHarness);
</script>
`;

// Вставляем скрипт перед закрывающим </body>
let modifiedHtml = indexHtmlRaw;

// Устанавливаем правильную начальную вкладку на уровне HTML
if (targetTab === 'transactions') {
  modifiedHtml = modifiedHtml
    .replace('id="transactions-tab" class="tab-pane space-y-3 hidden"', 'id="transactions-tab" class="tab-pane space-y-3"')
    .replace('id="budget-tab" class="tab-pane space-y-3.5"', 'id="budget-tab" class="tab-pane space-y-3.5 hidden"');
} else if (targetTab === 'capital') {
  modifiedHtml = modifiedHtml
    .replace('id="capital-tab" class="tab-pane hidden flex flex-col gap-3.5"', 'id="capital-tab" class="tab-pane flex flex-col gap-3.5"')
    .replace('id="budget-tab" class="tab-pane space-y-3.5"', 'id="budget-tab" class="tab-pane space-y-3.5 hidden"');
}

// Добавляем начальную установку localStorage в <head>
modifiedHtml = modifiedHtml.replace(
  '<head>',
  `<head>
  <style>
    .tx-day-group { content-visibility: visible !important; }
  </style>
  <script>
    try {
      localStorage.setItem('budget_active_tab', '${targetTab}');
    } catch (e) {}
  </script>`
);

const injectedHtml = modifiedHtml.replace('</body>', previewInjectionScript + '\n</body>');

const tempHtmlPath = path.resolve(__dirname, '../__preview_harness_temp.html');
fs.writeFileSync(tempHtmlPath, injectedHtml, 'utf8');

// Запускаем локальный веб-сервер
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') reqPath = '/__preview_harness_temp.html';
  const filePath = path.resolve(__dirname, '..', '.' + reqPath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  const targetUrl = `http://127.0.0.1:${port}/__preview_harness_temp.html`;

  const chromeProc = spawn(CHROME_PATH, [
    '--headless',
    '--no-sandbox',
    '--hide-scrollbars',
    '--virtual-time-budget=2000',
    '--window-size=390,844',
    `--screenshot=${outPath}`,
    targetUrl
  ]);

  chromeProc.stderr.on('data', d => {
    const s = d.toString();
    if (s.includes('[Preview]') || s.includes('CONSOLE') || s.includes('Error')) {
      process.stderr.write(s);
    }
  });

  chromeProc.on('close', (code) => {
    server.close();
    try { fs.unlinkSync(tempHtmlPath); } catch {}
    if (code === 0 && fs.existsSync(outPath)) {
      console.log(`[Preview Harness] Successfully rendered ${outPath}`);
      process.exit(0);
    } else {
      console.error(`[Preview Harness] Failed with exit code ${code}`);
      process.exit(1);
    }
  });
});
