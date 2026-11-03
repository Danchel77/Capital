// marketRates.js - Мониторинг ключевой ставки ЦБ, индексов Мосбиржи и лучших ставок банков
/* global formatMoney, lucide, getUserCol */

const TOP_10_BANKS_DEFAULT = [
  'Сбербанк',
  'ВТБ',
  'Газпромбанк',
  'Альфа-Банк',
  'Т-Банк',
  'Банк ДОМ.РФ',
  'Совкомбанк',
  'Промсвязьбанк',
  'Московский кредитный банк',
  'Россельхозбанк',
];

const ALL_POPULAR_BANKS = [
  // ТОП-10 ЦБ РФ
  'Сбербанк',
  'ВТБ',
  'Газпромбанк',
  'Альфа-Банк',
  'Т-Банк',
  'Банк ДОМ.РФ',
  'Совкомбанк',
  'Промсвязьбанк',
  'Московский кредитный банк',
  'Россельхозбанк',
  // Другие популярные банки
  'Банк Санкт-Петербург',
  'Банк Уралсиб',
  'МТС Банк',
  'Локо-Банк',
  'Экспобанк',
  'Цифра Банк',
  'Яндекс Банк',
  'Ozon Банк',
  'Ак Барс',
  'Банк Зенит',
  'Новикомбанк',
  'Почта Банк',
  'РНКБ',
  'Абсолют Банк',
  'Сургутнефтегазбанк',
  'Фора-Банк',
  'Банк Жилищного Финансирования',
  'Свой Банк',
  'Примсоцбанк',
  'ФИНСТАР БАНК',
];

const ALL_CONDITION_TAGS = [
  { id: 'Новый клиент', label: 'Только для новых клиентов', defaultChecked: false },
  { id: 'Новые деньги', label: 'Только на новые деньги', defaultChecked: true },
  { id: 'С капитализацией', label: 'С капитализацией процентов', defaultChecked: true },
  { id: 'С пополнением', label: 'С пополнением', defaultChecked: true },
  { id: 'На минимальный остаток', label: 'На минимальный остаток', defaultChecked: true },
  { id: 'На ежедневный остаток', label: 'На ежедневный остаток', defaultChecked: true },
];

const BANK_ALIASES = {
  Сбербанк: ['сбер', 'сбербанк', 'пао сбербанк', 'sber'],
  ВТБ: ['втб', 'vtb', 'банк втб'],
  Газпромбанк: ['газпром', 'газпромбанк', 'гпб'],
  'Альфа-Банк': ['альфа', 'альфа-банк', 'альфа банк', 'alfa'],
  'Т-Банк': ['т-банк', 'тбанк', 'тинькофф', 't-bank', 'tbank', 'tinkoff'],
  'Банк ДОМ.РФ': ['дом.рф', 'домрф', 'банк дом.рф', 'банк дом рф'],
  Совкомбанк: ['совком', 'совкомбанк'],
  Промсвязьбанк: ['псб', 'промсвязь', 'промсвязьбанк'],
  'Московский кредитный банк': ['мкб', 'московский кредитный банк'],
  Россельхозбанк: ['рсхб', 'россельхоз', 'россельхозбанк'],
  'Банк Санкт-Петербург': ['бспб', 'санкт-петербург'],
  'Банк Уралсиб': ['уралсиб'],
  'МТС Банк': ['мтс'],
  'Локо-Банк': ['локо'],
  Экспобанк: ['экспо'],
  'Цифра Банк': ['цифра'],
  'Яндекс Банк': ['яндекс'],
  'Ozon Банк': ['ozon', 'озон'],
  'Ак Барс': ['ак барс'],
  'Банк Зенит': ['зенит'],
  'Свой Банк': ['свой банк'],
  Примсоцбанк: ['примсоцбанк'],
  'ФИНСТАР БАНК': ['финстар'],
};

// Базовые проверенные предложения на случай отсутствия сети
const BASELINE_MARKET_OFFERS = [
  {
    bankName: 'Совкомбанк',
    productName: 'Доходный премиум на 91 день',
    rate: 14.5,
    type: 'deposit',
    termMonths: 3,
    termDays: 91,
    minAmount: 10000,
    tags: ['С капитализацией'],
  },
  {
    bankName: 'Банк ДОМ.РФ',
    productName: 'Мой Дом',
    rate: 14.5,
    type: 'deposit',
    termMonths: 3,
    termDays: 91,
    minAmount: 30000,
    tags: ['Новые деньги'],
  },
  {
    bankName: 'Газпромбанк',
    productName: 'В плюсе',
    rate: 14.2,
    type: 'deposit',
    termMonths: 3,
    termDays: 91,
    minAmount: 15000,
    tags: ['Новый клиент'],
  },
  {
    bankName: 'ВТБ',
    productName: 'ВТБ-Вклад',
    rate: 14.0,
    type: 'deposit',
    termMonths: 3,
    termDays: 91,
    minAmount: 10000,
    tags: ['С капитализацией'],
  },
  {
    bankName: 'Сбербанк',
    productName: 'Лучший %',
    rate: 13.8,
    type: 'deposit',
    termMonths: 3,
    termDays: 91,
    minAmount: 100000,
    tags: ['Новые деньги'],
  },
  {
    bankName: 'Локо-Банк',
    productName: 'Локо-Вклад',
    rate: 14.8,
    type: 'deposit',
    termMonths: 3,
    termDays: 91,
    minAmount: 50000,
    tags: ['С капитализацией'],
  },
  {
    bankName: 'Свой Банк',
    productName: 'Свой вклад',
    rate: 14.79,
    type: 'deposit',
    termMonths: 3,
    termDays: 91,
    minAmount: 30000,
    tags: ['С капитализацией'],
  },
  {
    bankName: 'Банк Жилищного Финансирования',
    productName: 'Лидер 3',
    rate: 15.0,
    type: 'deposit',
    termMonths: 3,
    termDays: 91,
    minAmount: 30000,
    tags: ['Новые деньги'],
  },
  {
    bankName: 'Совкомбанк',
    productName: 'Доходный премиум на 181 день',
    rate: 13.8,
    type: 'deposit',
    termMonths: 6,
    termDays: 181,
    minAmount: 10000,
    tags: ['С капитализацией'],
  },
  {
    bankName: 'Газпромбанк',
    productName: 'Новые деньги',
    rate: 13.6,
    type: 'deposit',
    termMonths: 6,
    termDays: 181,
    minAmount: 15000,
    tags: ['Новые деньги'],
  },
  {
    bankName: 'ВТБ',
    productName: 'ВТБ-Вклад',
    rate: 13.5,
    type: 'deposit',
    termMonths: 6,
    termDays: 181,
    minAmount: 10000,
    tags: ['С капитализацией'],
  },
  {
    bankName: 'Т-Банк',
    productName: 'СмартВклад',
    rate: 13.0,
    type: 'deposit',
    termMonths: 6,
    termDays: 181,
    minAmount: 50000,
    tags: ['С пополнением'],
  },
  {
    bankName: 'ФИНСТАР БАНК',
    productName: 'Классический онлайн',
    rate: 13.85,
    type: 'deposit',
    termMonths: 6,
    termDays: 181,
    minAmount: 50000,
    tags: ['С капитализацией'],
  },
  {
    bankName: 'Совкомбанк',
    productName: 'Доходный премиум на 365 дней',
    rate: 13.2,
    type: 'deposit',
    termMonths: 12,
    termDays: 365,
    minAmount: 10000,
    tags: ['С капитализацией'],
  },
  {
    bankName: 'Банк ДОМ.РФ',
    productName: 'Мой Дом',
    rate: 13.0,
    type: 'deposit',
    termMonths: 12,
    termDays: 365,
    minAmount: 30000,
    tags: ['Новые деньги'],
  },
  {
    bankName: 'Газпромбанк',
    productName: 'В плюсе',
    rate: 12.9,
    type: 'deposit',
    termMonths: 12,
    termDays: 365,
    minAmount: 15000,
    tags: ['С капитализацией'],
  },
  {
    bankName: 'Сбербанк',
    productName: 'Лучший %',
    rate: 12.5,
    type: 'deposit',
    termMonths: 12,
    termDays: 365,
    minAmount: 100000,
    tags: ['Новые деньги'],
  },
  // Накопительные счета
  {
    bankName: 'Промсвязьбанк',
    productName: 'Накопительный счет Импульс',
    rate: 15.0,
    type: 'account',
    termMonths: 2,
    termDays: 60,
    minAmount: 0,
    tags: ['Новый клиент', 'На минимальный остаток'],
  },
  {
    bankName: 'Газпромбанк',
    productName: 'ГПБ-счет',
    rate: 14.0,
    type: 'account',
    termMonths: 2,
    termDays: 60,
    minAmount: 0,
    tags: ['Новые деньги', 'На минимальный остаток'],
  },
  {
    bankName: 'ВТБ',
    productName: 'ВТБ-Накопительный счет',
    rate: 14.0,
    type: 'account',
    termMonths: 2,
    termDays: 60,
    minAmount: 0,
    tags: ['Новый клиент', 'На минимальный остаток'],
  },
  {
    bankName: 'Сбербанк',
    productName: 'Накопительный счет',
    rate: 13.5,
    type: 'account',
    termMonths: 3,
    termDays: 90,
    minAmount: 0,
    tags: ['Новый клиент', 'На минимальный остаток'],
  },
  {
    bankName: 'Т-Банк',
    productName: 'Накопительный счет с подпиской',
    rate: 13.0,
    type: 'account',
    termMonths: 0,
    termDays: 0,
    minAmount: 0,
    tags: ['С пополнением', 'На ежедневный остаток'],
  },
];

const marketRatesState = {
  cbrRate: 14.0,
  moexIndices: {
    '3m': 13.8,
    '6m': 13.05,
    '12m': 12.52,
    accountMax: 13.81,
    accountAvg: 8.26,
  },
  offers: [...BASELINE_MARKET_OFFERS],
  activeTab: 'deposits', // 'deposits' | 'accounts'
  selectedTerm: 'all', // 'all' | '3m' | '6m' | '12m'
  lastUpdated: null,
};

// ==========================================
// 1. Settings Storage & Filter Matchers
// ==========================================
function getMarketRatesSettings() {
  const defaultAllowedTags = {};
  ALL_CONDITION_TAGS.forEach(t => {
    defaultAllowedTags[t.id] = t.defaultChecked;
  });

  const defaultSettings = {
    maxMonths: 12,
    selectedBanks: [...TOP_10_BANKS_DEFAULT],
    allowedTags: defaultAllowedTags,
  };

  try {
    const raw = localStorage.getItem('budget_market_rates_settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...defaultSettings,
        ...parsed,
        allowedTags: { ...defaultSettings.allowedTags, ...(parsed.allowedTags || {}) },
      };
    }
  } catch (e) {
    console.warn('[MarketRates] Error reading settings:', e);
  }
  return defaultSettings;
}

function saveMarketRatesSettings(settings) {
  try {
    localStorage.setItem('budget_market_rates_settings', JSON.stringify(settings));
  } catch (e) {
    console.warn('[MarketRates] Error saving settings:', e);
  }
}

function isBankAllowed(bankName, settings) {
  if (!settings) settings = getMarketRatesSettings();
  const allowedList = settings.selectedBanks || TOP_10_BANKS_DEFAULT;
  if (allowedList.length === 0) return true;

  const bLower = (bankName || '').toLowerCase().trim();
  for (const mainBank of allowedList) {
    const aliases = BANK_ALIASES[mainBank] || [mainBank.toLowerCase()];
    if (aliases.some(alias => bLower.includes(alias))) {
      return true;
    }
  }
  return false;
}

function isOfferAllowedByTags(itemTags, settings) {
  if (!settings) settings = getMarketRatesSettings();
  const allowedTags = settings.allowedTags || {};

  // Если у предложения есть тег, который пользователь выключил (например, "Новый клиент" === false)
  // то такое предложение отбрасывается
  if (Array.isArray(itemTags)) {
    for (const tag of itemTags) {
      if (allowedTags[tag] === false) {
        return false;
      }
    }
  }
  return true;
}

// ==========================================
// 2. Data Fetchers (CBR, MOEX, Firestore/Cache)
// ==========================================
async function fetchCbrKeyRate() {
  try {
    const now = new Date();
    const fromDate = new Date(now.getTime() - 14 * 86400000).toISOString().split('T')[0];
    const toDate = now.toISOString().split('T')[0];

    const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <KeyRateXML xmlns="http://web.cbr.ru/">
      <fromDate>${fromDate}</fromDate>
      <ToDate>${toDate}</ToDate>
    </KeyRateXML>
  </soap:Body>
</soap:Envelope>`;

    const res = await fetch('https://www.cbr.ru/DailyInfoWebServ/DailyInfo.asmx', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: '"http://web.cbr.ru/KeyRateXML"',
      },
      body: soapBody,
    });

    if (res.ok) {
      const xmlText = await res.text();
      const rateMatch = xmlText.match(/<Rate>([\d.,]+)<\/Rate>/);
      if (rateMatch) {
        const val = parseFloat(rateMatch[1].replace(',', '.'));
        if (!isNaN(val) && val > 0) {
          marketRatesState.cbrRate = val;
          return val;
        }
      }
    }
  } catch (e) {
    console.warn('[MarketRates] CBR SOAP fetch error, using fallback:', e);
  }
  return marketRatesState.cbrRate;
}

async function fetchMoexDepositIndices() {
  const tickers = ['FIND3M10', 'FIND6M10', 'FIND12M10', 'FINSAMAX', 'FINSABASE'];
  try {
    const promises = tickers.map(async t => {
      try {
        const res = await fetch(
          `https://iss.moex.com/iss/engines/stock/markets/index/securities/${t}.json`
        );
        if (!res.ok) return null;
        const json = await res.json();
        const md = json?.marketdata;
        if (!md || !md.data || md.data.length === 0) return null;
        const curCol = md.columns.indexOf('CURRENTVALUE');
        const lastCol = md.columns.indexOf('LASTVALUE');
        const val = md.data[0][curCol] || md.data[0][lastCol];
        return { ticker: t, value: parseFloat(val) };
      } catch (_err) {
        return null;
      }
    });

    const results = await Promise.all(promises);
    results.forEach(item => {
      if (!item || isNaN(item.value)) return;
      if (item.ticker === 'FIND3M10') marketRatesState.moexIndices['3m'] = item.value;
      if (item.ticker === 'FIND6M10') marketRatesState.moexIndices['6m'] = item.value;
      if (item.ticker === 'FIND12M10') marketRatesState.moexIndices['12m'] = item.value;
      if (item.ticker === 'FINSAMAX') marketRatesState.moexIndices.accountMax = item.value;
      if (item.ticker === 'FINSABASE') marketRatesState.moexIndices.accountAvg = item.value;
    });
  } catch (e) {
    console.warn('[MarketRates] MOEX indices fetch error:', e);
  }
}

async function fetchLiveBankOffers() {
  // Проверяем локальный кэш
  try {
    const cached = localStorage.getItem('budget_market_rates_cache');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.timestamp && Date.now() - parsed.timestamp < 12 * 3600000) {
        if (parsed.offers && parsed.offers.length > 0) {
          marketRatesState.offers = parsed.offers;
          if (parsed.cbrRate) marketRatesState.cbrRate = parsed.cbrRate;
          if (parsed.moexIndices) marketRatesState.moexIndices = parsed.moexIndices;
          return;
        }
      }
    }
  } catch (e) {
    console.warn('[MarketRates] Cache parse error:', e);
  }

  // Также проверяем общую базу Firestore (MarketRates/latest)
  try {
    if (typeof getUserCol === 'function') {
      const col = getUserCol('MarketRates');
      if (col) {
        const snap = await col.doc('latest').get();
        if (snap.exists) {
          const docData = snap.data();
          if (docData.offers && docData.offers.length > 0) {
            marketRatesState.offers = docData.offers;
            if (docData.cbrRate) marketRatesState.cbrRate = docData.cbrRate;
            if (docData.moexIndices) marketRatesState.moexIndices = docData.moexIndices;
          }
        }
      }
    }
  } catch (err) {
    console.warn('[MarketRates] Firestore sync error:', err);
  }

  // Сохраняем в локальный кэш
  try {
    localStorage.setItem(
      'budget_market_rates_cache',
      JSON.stringify({
        timestamp: Date.now(),
        cbrRate: marketRatesState.cbrRate,
        moexIndices: marketRatesState.moexIndices,
        offers: marketRatesState.offers,
      })
    );
  } catch (_e) {
    // Ignore storage quota
  }
}

// ==========================================
// 3. Selection of Best Offer
// ==========================================
function getBestDepositOffer() {
  const settings = getMarketRatesSettings();
  const maxM = settings.maxMonths || 12;

  // Фильтруем депозиты по сроку, банкам и разрешенным бейджам
  const validDeposits = marketRatesState.offers.filter(o => {
    if (o.type !== 'deposit') return false;
    if (o.termMonths && o.termMonths > maxM) return false;
    if (!isBankAllowed(o.bankName, settings)) return false;
    if (!isOfferAllowedByTags(o.tags, settings)) return false;
    return true;
  });

  if (validDeposits.length === 0) {
    // Если по строгим фильтрам ничего не найдено, берем из базового списка с проверкой срока
    const fallback = BASELINE_MARKET_OFFERS.filter(
      o =>
        o.type === 'deposit' &&
        (o.termMonths || 0) <= maxM &&
        isOfferAllowedByTags(o.tags, settings)
    );
    if (fallback.length > 0) {
      fallback.sort((a, b) => b.rate - a.rate);
      return fallback[0];
    }
    return null;
  }

  // Сортировка по ставке
  validDeposits.sort((a, b) => b.rate - a.rate);
  return validDeposits[0];
}

// ==========================================
// 4. UI Widget on Deposits Screen
// ==========================================
function renderMarketRatesWidget() {
  const cbrEl = document.getElementById('market-cbr-rate-val');
  const bestEl = document.getElementById('market-best-deposit-val');

  if (cbrEl) {
    cbrEl.innerText = `${marketRatesState.cbrRate.toFixed(1).replace('.0', '')}%`;
  }

  if (bestEl) {
    const best = getBestDepositOffer();
    if (best) {
      bestEl.innerText = `${best.rate}% · ${best.bankName}`;
    } else {
      bestEl.innerText = 'до 14.5%';
    }
  }

  if (typeof lucide !== 'undefined' && lucide.createIcons) {
    lucide.createIcons();
  }
}

// ==========================================
// 5. Main Modal Window & Filtering
// ==========================================
function openMarketRatesModal() {
  const modal = document.getElementById('market-rates-modal');
  if (!modal) return;

  modal.classList.remove('hidden');
  renderMarketRatesModalContent();

  if (typeof lucide !== 'undefined' && lucide.createIcons) {
    lucide.createIcons();
  }
}

function closeMarketRatesModal() {
  const modal = document.getElementById('market-rates-modal');
  if (modal) modal.classList.add('hidden');
}

function switchMarketRatesTab(tab) {
  marketRatesState.activeTab = tab;

  const btnDep = document.getElementById('mr-tab-deposits');
  const btnAcc = document.getElementById('mr-tab-accounts');
  const periodChips = document.getElementById('mr-period-chips-container');

  if (tab === 'deposits') {
    if (btnDep) {
      btnDep.className =
        'flex-1 py-1.5 text-center text-xs font-semibold rounded-xl bg-[#181c26] text-white border border-[#282e3e] shadow-sm transition-all cursor-pointer is-active';
    }
    if (btnAcc) {
      btnAcc.className =
        'flex-1 py-1.5 text-center text-xs font-medium rounded-xl text-zinc-400 hover:text-white transition-all cursor-pointer';
    }
    if (periodChips) periodChips.classList.remove('hidden');
  } else {
    if (btnDep) {
      btnDep.className =
        'flex-1 py-1.5 text-center text-xs font-medium rounded-xl text-zinc-400 hover:text-white transition-all cursor-pointer';
    }
    if (btnAcc) {
      btnAcc.className =
        'flex-1 py-1.5 text-center text-xs font-semibold rounded-xl bg-[#181c26] text-white border border-[#282e3e] shadow-sm transition-all cursor-pointer is-active';
    }
    if (periodChips) periodChips.classList.add('hidden');
  }

  renderMarketRatesModalContent();
}

function setMarketRatesTermFilter(term) {
  marketRatesState.selectedTerm = term;

  document.querySelectorAll('.mr-period-btn').forEach(btn => {
    const isAct = btn.dataset.term === term;
    if (isAct) {
      btn.className =
        'mr-period-btn px-3 py-1 rounded-xl bg-white text-zinc-950 text-xs font-semibold shadow-sm transition-all cursor-pointer';
    } else {
      btn.className =
        'mr-period-btn px-3 py-1 rounded-xl bg-white/[0.05] hover:bg-white/10 text-zinc-400 text-xs font-medium transition-all cursor-pointer border border-white/[0.06]';
    }
  });

  renderMarketRatesModalContent();
}

function getDaysDeclension(n) {
  const abs = Math.abs(n) % 100;
  const rem = abs % 10;
  if (abs > 10 && abs < 20) return `${n} дней`;
  if (rem > 1 && rem < 5) return `${n} дня`;
  if (rem === 1) return `${n} день`;
  return `${n} дней`;
}

function renderMarketRatesModalContent() {
  const listEl = document.getElementById('market-rates-offers-list');
  if (!listEl) return;

  const settings = getMarketRatesSettings();
  const isDeposits = marketRatesState.activeTab === 'deposits';

  const filtered = marketRatesState.offers.filter(o => {
    // Вклад или накопительный счет
    if (isDeposits && o.type !== 'deposit') return false;
    if (!isDeposits && o.type !== 'account') return false;

    // Банковский фильтр
    if (!isBankAllowed(o.bankName, settings)) return false;

    // Фильтр условий (бейджей)
    if (!isOfferAllowedByTags(o.tags, settings)) return false;

    // Фильтр сроков (только для вкладов)
    if (isDeposits && marketRatesState.selectedTerm !== 'all') {
      if (marketRatesState.selectedTerm === '3m' && o.termMonths !== 3) return false;
      if (marketRatesState.selectedTerm === '6m' && o.termMonths !== 6) return false;
      if (marketRatesState.selectedTerm === '12m' && o.termMonths !== 12) return false;
    }

    return true;
  });

  // Сортировка: максимальная ставка сверху
  filtered.sort((a, b) => b.rate - a.rate);

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="p-8 text-center text-xs text-zinc-500 rounded-2xl bg-white/[0.02] border border-white/[0.06] mt-4">
        Предложений по заданным фильтрам не найдено. Нажмите иконку настроек вверху, чтобы изменить банки и условия.
      </div>
    `;
    return;
  }

  const moexBenchmark = isDeposits
    ? marketRatesState.moexIndices[marketRatesState.selectedTerm] ||
      marketRatesState.moexIndices['3m'] ||
      13.8
    : marketRatesState.moexIndices.accountMax || 13.81;

  listEl.innerHTML = filtered
    .map(item => {
      // Проверка на аномалию: если ставка выше индекса Мосбиржи более чем на 3.5%
      const isOutlier = item.rate > moexBenchmark + 3.5;

      const tagsHtml = (item.tags || [])
        .map(
          t => `
        <span class="text-[10px] px-2 py-0.5 rounded-md bg-white/[0.05] text-zinc-400 font-medium border border-white/[0.06]">
          ${t}
        </span>
      `
        )
        .join('');

      const outlierBadge = isOutlier
        ? `<span class="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 font-medium border border-amber-500/20">Промо/Комбо</span>`
        : '';

      const termDesc = isDeposits
        ? item.termDays
          ? `${getDaysDeclension(item.termDays)} (~${item.termMonths} мес.)`
          : `${item.termMonths} мес.`
        : 'Бессрочный';

      const minAmountDesc =
        item.minAmount > 0 ? `от ${formatMoney(item.minAmount)}` : 'без ограничений';

      return `
      <div class="p-3.5 rounded-2xl bg-[#12151C] border border-white/[0.06] hover:border-white/15 transition-all flex flex-col gap-2">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <h4 class="text-sm font-semibold text-white leading-tight truncate">${item.bankName}</h4>
            <p class="text-xs text-zinc-400 mt-0.5 truncate">${item.productName}</p>
          </div>
          <div class="text-right flex-shrink-0">
            <span class="text-lg font-bold font-mono ${isOutlier ? 'text-amber-400' : 'text-emerald-400'} leading-none">
              ${item.rate}%
            </span>
          </div>
        </div>

        <div class="flex items-center justify-between text-[11px] text-zinc-400 font-mono pt-1 border-t border-white/[0.04]">
          <span>Срок: <b class="text-zinc-200">${termDesc}</b></span>
          <span>Сумма: <b class="text-zinc-200">${minAmountDesc}</b></span>
        </div>

        ${
          tagsHtml || outlierBadge
            ? `
          <div class="flex flex-wrap gap-1.5 pt-1">
            ${tagsHtml}
            ${outlierBadge}
          </div>
        `
            : ''
        }
      </div>
    `;
    })
    .join('');
}

// ==========================================
// 6. Separate Settings Modal
// ==========================================
function openMarketRatesSettingsModal() {
  const modal = document.getElementById('market-rates-settings-modal');
  if (!modal) return;

  modal.classList.remove('hidden');
  initMarketRatesSettingsForm();

  if (typeof lucide !== 'undefined' && lucide.createIcons) {
    lucide.createIcons();
  }
}

function closeMarketRatesSettingsModal() {
  const modal = document.getElementById('market-rates-settings-modal');
  if (modal) modal.classList.add('hidden');
}

function initMarketRatesSettingsForm() {
  const settings = getMarketRatesSettings();
  const maxMonthsInput = document.getElementById('mr-settings-max-months');
  const tagsContainer = document.getElementById('mr-settings-tags-list');
  const banksContainer = document.getElementById('mr-settings-banks-list');

  if (maxMonthsInput) maxMonthsInput.value = settings.maxMonths || 12;

  // 1. Отрисовка списка бейджей
  if (tagsContainer) {
    tagsContainer.innerHTML = ALL_CONDITION_TAGS.map(t => {
      const isChecked = settings.allowedTags?.[t.id] !== false;
      return `
        <label class="flex items-center gap-2.5 text-xs text-zinc-200 py-1 cursor-pointer select-none">
          <input type="checkbox" class="mr-tag-cb rounded bg-white/10 border-white/20 text-emerald-500 accent-emerald-500 focus:ring-0" value="${t.id}" ${isChecked ? 'checked' : ''}>
          <span>${t.label}</span>
        </label>
      `;
    }).join('');
  }

  // 2. Отрисовка списка банков
  if (banksContainer) {
    const selected = settings.selectedBanks || TOP_10_BANKS_DEFAULT;
    banksContainer.innerHTML = ALL_POPULAR_BANKS.map(b => {
      const isChecked = selected.includes(b);
      return `
        <label class="flex items-center gap-2 text-xs text-zinc-300 py-1 cursor-pointer select-none">
          <input type="checkbox" class="mr-bank-cb rounded bg-white/10 border-white/20 text-emerald-500 accent-emerald-500 focus:ring-0 flex-shrink-0" value="${b}" ${isChecked ? 'checked' : ''}>
          <span class="leading-snug text-[11px]">${b}</span>
        </label>
      `;
    }).join('');
  }
}

function selectBanksPreset(preset) {
  const checkboxes = document.querySelectorAll('.mr-bank-cb');
  if (preset === 'top10') {
    checkboxes.forEach(cb => {
      cb.checked = TOP_10_BANKS_DEFAULT.includes(cb.value);
    });
  } else if (preset === 'all') {
    checkboxes.forEach(cb => {
      cb.checked = true;
    });
  } else if (preset === 'none') {
    checkboxes.forEach(cb => {
      cb.checked = false;
    });
  }
}

function saveAndApplyMarketRatesSettings() {
  const maxMonthsInput = document.getElementById('mr-settings-max-months');
  const maxMonths = parseInt(maxMonthsInput?.value, 10) || 12;

  // Считываем выбранные бейджи условий
  const allowedTags = {};
  document.querySelectorAll('.mr-tag-cb').forEach(cb => {
    allowedTags[cb.value] = cb.checked;
  });

  // Считываем выбранные банки
  const selectedBanks = [];
  document.querySelectorAll('.mr-bank-cb:checked').forEach(cb => {
    selectedBanks.push(cb.value);
  });

  const newSettings = {
    maxMonths: Math.max(1, Math.min(60, maxMonths)),
    selectedBanks: selectedBanks.length > 0 ? selectedBanks : [...TOP_10_BANKS_DEFAULT],
    allowedTags,
  };

  saveMarketRatesSettings(newSettings);
  closeMarketRatesSettingsModal();
  renderMarketRatesWidget();
  renderMarketRatesModalContent();
}

// ==========================================
// 7. Lifecycle Initializer
// ==========================================
async function initMarketRatesModule() {
  // 1. Отобразить виджет из базовых данных
  renderMarketRatesWidget();

  // 2. Асинхронно запросить ЦБ и Мосбиржу
  try {
    await Promise.all([fetchCbrKeyRate(), fetchMoexDepositIndices(), fetchLiveBankOffers()]);
    renderMarketRatesWidget();
  } catch (e) {
    console.warn('[MarketRates] Init error:', e);
  }
}

// Экспорт глобальных функций
window.getMarketRatesSettings = getMarketRatesSettings;
window.saveMarketRatesSettings = saveMarketRatesSettings;
window.renderMarketRatesWidget = renderMarketRatesWidget;
window.openMarketRatesModal = openMarketRatesModal;
window.closeMarketRatesModal = closeMarketRatesModal;
window.switchMarketRatesTab = switchMarketRatesTab;
window.setMarketRatesTermFilter = setMarketRatesTermFilter;
window.openMarketRatesSettingsModal = openMarketRatesSettingsModal;
window.closeMarketRatesSettingsModal = closeMarketRatesSettingsModal;
window.selectBanksPreset = selectBanksPreset;
window.saveAndApplyMarketRatesSettings = saveAndApplyMarketRatesSettings;
window.initMarketRatesModule = initMarketRatesModule;
