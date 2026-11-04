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
  'Яндекс Банк',
  'Ozon Банк',
  'Банк Санкт-Петербург',
  'Банк Уралсиб',
  'МТС Банк',
  'Локо-Банк',
  'Экспобанк',
  'Цифра Банк',
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
  { id: 'С капитализацией', label: 'Капитализация процентов', defaultChecked: true },
  { id: 'С пополнением', label: 'Пополнение вклада', defaultChecked: true },
  { id: 'На ежедневный остаток', label: 'Ежедневный остаток', defaultChecked: true },
  { id: 'На минимальный остаток', label: 'Минимальный остаток', defaultChecked: true },
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
  'Яндекс Банк': ['яндекс'],
  'Ozon Банк': ['ozon', 'озон'],
  'Банк Санкт-Петербург': ['бспб', 'санкт-петербург'],
  'Банк Уралсиб': ['уралсиб'],
  'МТС Банк': ['мтс'],
  'Локо-Банк': ['локо', 'locko'],
  Экспобанк: ['экспо'],
  'Цифра Банк': ['цифра'],
  'Ак Барс': ['ак барс'],
  'Банк Зенит': ['зенит'],
  'Свой Банк': ['свой банк'],
  Примсоцбанк: ['примсоцбанк'],
  'ФИНСТАР БАНК': ['финстар'],
};

// Состояние модуля (данные загружаются исключительно динамически)
const marketRatesState = {
  cbrRate: null,
  moexIndices: {
    '3m': null,
    '6m': null,
    '12m': null,
    accountMax: null,
    accountAvg: null,
  },
  offers: [],
  activeTab: 'deposits', // 'deposits' | 'accounts'
  selectedTerm: 'all', // 'all' | '3m' | '6m' | '12m'
  isLoading: false,
  loadError: null,
  lastUpdated: null,
};

// ==========================================
// 1. Scroll Lock Helpers
// ==========================================
function mrLockScroll() {
  if (typeof window.lockBodyScroll === 'function') {
    window.lockBodyScroll();
  } else {
    document.body.classList.add('overflow-hidden');
  }
}

function mrUnlockScroll() {
  const mrModal = document.getElementById('market-rates-modal');
  const settingsModal = document.getElementById('market-rates-settings-modal');
  const isMrOpen = mrModal && !mrModal.classList.contains('hidden');
  const isSettingsOpen = settingsModal && !settingsModal.classList.contains('hidden');

  if (!isMrOpen && !isSettingsOpen) {
    if (typeof window.unlockBodyScroll === 'function') {
      window.unlockBodyScroll();
    } else {
      document.body.classList.remove('overflow-hidden');
    }
  }
}

// ==========================================
// 2. Settings Storage & Filter Matchers
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

function formatRate(val) {
  const num = typeof val === 'number' ? val : parseFloat(val);
  if (isNaN(num)) return '0,0';
  if (Number.isInteger(num)) {
    return `${num},0`;
  }
  return String(num).replace('.', ',');
}

const TAG_DISPLAY_NAMES = {
  'С капитализацией': 'капитализация',
  'С пополнением': 'пополнение',
  'Со снятием': 'снятие',
  'С частичным снятием': 'снятие',
  'На минимальный остаток': 'мин. остаток',
  'На ежедневный остаток': 'ежедневный остаток',
  'Новые деньги': 'новые деньги',
  'Новый клиент': 'новый клиент',
};

function formatTag(tag) {
  if (!tag) return '';
  return TAG_DISPLAY_NAMES[tag] || String(tag).trim().toLowerCase();
}

const MARKET_RATES_CACHE_VERSION = 3;

// ==========================================
// 3. Dynamic Data Loader (No hardcoded rates)
// ==========================================
async function fetchLiveBankOffers(forceRefresh = false) {
  marketRatesState.isLoading = true;
  marketRatesState.loadError = null;

  // 1. Попытка загрузить из локального кэша (если не принудительное обновление и кэш актуален)
  if (!forceRefresh) {
    try {
      const cached = localStorage.getItem('budget_market_rates_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (
          parsed.version === MARKET_RATES_CACHE_VERSION &&
          parsed.timestamp &&
          Date.now() - parsed.timestamp < 12 * 3600000 &&
          parsed.offers &&
          parsed.offers.length >= 100 &&
          parsed.offers.some(o => o.conditionsNote)
        ) {
          marketRatesState.offers = parsed.offers;
          if (parsed.cbrRate) marketRatesState.cbrRate = parsed.cbrRate;
          if (parsed.moexIndices) marketRatesState.moexIndices = parsed.moexIndices;
          marketRatesState.lastUpdated = parsed.lastUpdated || new Date().toISOString();
          marketRatesState.isLoading = false;
          return;
        }
      }
    } catch (_e) {
      // ignore
    }
  }

  // 2. Загрузка из актуального data/market-rates.json (созданного парсером)
  try {
    const res = await fetch(`./data/market-rates.json?v=${Date.now()}`);
    if (res.ok) {
      const json = await res.json();
      if (json && Array.isArray(json.offers) && json.offers.length > 0) {
        marketRatesState.offers = json.offers;
        if (json.cbrRate) marketRatesState.cbrRate = json.cbrRate;
        if (json.moexIndices) marketRatesState.moexIndices = json.moexIndices;
        marketRatesState.lastUpdated = json.updatedAt || new Date().toISOString();
        marketRatesState.isLoading = false;

        // Сохраняем в localStorage с версией
        try {
          localStorage.setItem(
            'budget_market_rates_cache',
            JSON.stringify({
              version: MARKET_RATES_CACHE_VERSION,
              timestamp: Date.now(),
              lastUpdated: marketRatesState.lastUpdated,
              cbrRate: marketRatesState.cbrRate,
              moexIndices: marketRatesState.moexIndices,
              offers: marketRatesState.offers,
            })
          );
        } catch (_e) {
          // ignore
        }

        // Синхронизируем свежие данные в общую Firestore коллекцию (MarketRates/latest)
        try {
          if (typeof getUserCol === 'function') {
            const col = getUserCol('MarketRates');
            if (col && json.offers.length > 50) {
              col
                .doc('latest')
                .set(
                  {
                    updatedAt: marketRatesState.lastUpdated,
                    cbrRate: marketRatesState.cbrRate,
                    moexIndices: marketRatesState.moexIndices,
                    totalOffers: marketRatesState.offers.length,
                    offers: marketRatesState.offers,
                  },
                  { merge: true }
                )
                .catch(() => {});
            }
          }
        } catch (_e) {
          // ignore
        }

        return;
      }
    }
  } catch (err) {
    console.warn('[MarketRates] Static json fetch error:', err.message);
  }

  // 3. Попытка загрузки из общей базы Firestore (MarketRates/latest)
  try {
    if (typeof getUserCol === 'function') {
      const col = getUserCol('MarketRates');
      if (col) {
        const snap = await col.doc('latest').get();
        if (snap.exists) {
          const docData = snap.data();
          if (docData && Array.isArray(docData.offers) && docData.offers.length > 0) {
            marketRatesState.offers = docData.offers;
            if (docData.cbrRate) marketRatesState.cbrRate = docData.cbrRate;
            if (docData.moexIndices) marketRatesState.moexIndices = docData.moexIndices;
            marketRatesState.isLoading = false;
            return;
          }
        }
      }
    }
  } catch (err) {
    console.warn('[MarketRates] Firestore fetch error:', err);
  }

  marketRatesState.isLoading = false;
  if (!marketRatesState.offers || marketRatesState.offers.length === 0) {
    marketRatesState.loadError = 'Данные о ставках пока не загружены';
  }
}

// ==========================================
// 4. Selection of Best Offer
// ==========================================
function getBestDepositOffer() {
  if (!marketRatesState.offers || marketRatesState.offers.length === 0) return null;

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

  if (validDeposits.length === 0) return null;

  // Сортировка по ставке
  validDeposits.sort((a, b) => b.rate - a.rate);
  return validDeposits[0];
}

// ==========================================
// 5. UI Widget on Deposits Screen
// ==========================================
function renderMarketRatesWidget() {
  const modalCbrEl = document.getElementById('market-modal-cbr-rate');
  const cbrEl = document.getElementById('market-cbr-rate-val');
  const bestEl = document.getElementById('market-best-deposit-val');

  const cbrText = marketRatesState.cbrRate ? `${formatRate(marketRatesState.cbrRate)}%` : '14,0%';

  if (modalCbrEl) modalCbrEl.innerText = cbrText;
  if (cbrEl) cbrEl.innerText = cbrText;

  if (bestEl) {
    const best = getBestDepositOffer();
    if (best) {
      bestEl.innerText = `${formatRate(best.rate)}% · ${best.bankName}`;
    } else if (marketRatesState.isLoading) {
      bestEl.innerText = 'Загрузка...';
    } else if (marketRatesState.offers.length === 0) {
      bestEl.innerText = 'Нажмите для обновления';
    } else {
      bestEl.innerText = 'Нет предложений по фильтру';
    }
  }

  if (typeof lucide !== 'undefined' && lucide.createIcons) {
    lucide.createIcons();
  }
}

// ==========================================
// 6. Main Modal Window & Grouped Offers
// ==========================================
function openMarketRatesModal() {
  const modal = document.getElementById('market-rates-modal');
  if (!modal) return;

  const modalCbrEl = document.getElementById('market-modal-cbr-rate');
  if (modalCbrEl) {
    modalCbrEl.innerText = marketRatesState.cbrRate
      ? `${formatRate(marketRatesState.cbrRate)}%`
      : '14,0%';
  }

  mrLockScroll();
  modal.classList.remove('hidden');
  renderMarketRatesModalContent();

  if (typeof lucide !== 'undefined' && lucide.createIcons) {
    lucide.createIcons();
  }
}

function closeMarketRatesModal() {
  closeRateConditionsPopover();
  const modal = document.getElementById('market-rates-modal');
  if (modal) modal.classList.add('hidden');
  mrUnlockScroll();
}

function switchMarketRatesTab(tab) {
  closeRateConditionsPopover();
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
  closeRateConditionsPopover();
  marketRatesState.selectedTerm = term;

  document.querySelectorAll('.mr-period-btn').forEach(btn => {
    const isAct = btn.dataset.term === term;
    if (isAct) {
      btn.className =
        'mr-period-btn py-1.5 text-center rounded-lg bg-white text-zinc-950 text-xs font-semibold shadow-sm transition-all cursor-pointer';
    } else {
      btn.className =
        'mr-period-btn py-1.5 text-center rounded-lg text-zinc-400 hover:text-white text-xs font-medium transition-all cursor-pointer';
    }
  });

  renderMarketRatesModalContent();
}

function _getDaysDeclension(n) {
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

  // 1. Состояние отсутствия данных
  if (!marketRatesState.offers || marketRatesState.offers.length === 0) {
    listEl.innerHTML = `
      <div class="p-8 text-center text-xs text-zinc-500 rounded-2xl bg-white/[0.02] border border-white/[0.06] mt-4 flex flex-col items-center gap-2.5">
        <i data-lucide="cloud-off" class="w-8 h-8 text-zinc-600"></i>
        <p class="font-medium text-zinc-300">Данные о ставках пока не загружены</p>
        <p class="text-[11px] text-zinc-500 max-w-xs">
          Запустите обновление или дождитесь планового сбора ставок ночным GitHub Action.
        </p>
        <button
          type="button"
          onclick="fetchLiveBankOffers(true).then(() => { renderMarketRatesWidget(); renderMarketRatesModalContent(); })"
          class="mt-2 px-4 py-2 rounded-xl bg-white text-zinc-950 font-semibold text-xs active:scale-95 transition-all cursor-pointer shadow-sm"
        >
          Загрузить ставки
        </button>
      </div>
    `;
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    return;
  }

  const settings = getMarketRatesSettings();
  const isDeposits = marketRatesState.activeTab === 'deposits';
  const cbrRate = marketRatesState.cbrRate || 14;
  const minDepositRate = cbrRate - 2.5; // Отсекаем ставки ниже ЦБ - 2.5% (например, ниже 11.5%)
  const minAccountRate = 8.0;

  // 2. Фильтрация
  const filtered = marketRatesState.offers.filter(o => {
    // Вклад или накопительный счет
    if (isDeposits && o.type !== 'deposit') return false;
    if (!isDeposits && o.type !== 'account') return false;

    // Отсекаем неконкурентные/мусорные ставки
    if (isDeposits && o.rate < minDepositRate) return false;
    if (!isDeposits && o.rate < minAccountRate) return false;

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

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="p-8 text-center text-xs text-zinc-500 rounded-2xl bg-white/[0.02] border border-white/[0.06] mt-4 flex flex-col items-center gap-2">
        <i data-lucide="filter" class="w-7 h-7 text-zinc-600 mb-1"></i>
        <p class="text-zinc-300 font-medium">Нет предложений по выбранным условиям</p>
        <p class="text-[11px] text-zinc-500 max-w-xs">
          Попробуйте включить дополнительные банки или изменить фильтр условий в настройках.
        </p>
        <button
          type="button"
          onclick="openMarketRatesSettingsModal()"
          class="mt-2 px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-medium cursor-pointer"
        >
          Открыть настройки
        </button>
      </div>
    `;
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    return;
  }

  // 3. Группировка предложений по банкам
  const bankGroupsMap = new Map();
  for (const item of filtered) {
    if (!bankGroupsMap.has(item.bankName)) {
      bankGroupsMap.set(item.bankName, []);
    }
    bankGroupsMap.get(item.bankName).push(item);
  }

  // Сортировка банков по их наивысшей ставке
  const sortedBanks = Array.from(bankGroupsMap.entries()).map(([bankName, items]) => {
    items.sort((a, b) => b.rate - a.rate);
    const topRate = items[0]?.rate || 0;
    return { bankName, items, topRate };
  });

  sortedBanks.sort((a, b) => b.topRate - a.topRate);

  const _moexBenchmark = isDeposits
    ? marketRatesState.moexIndices[marketRatesState.selectedTerm] ||
      marketRatesState.moexIndices['3m'] ||
      13.8
    : marketRatesState.moexIndices.accountMax || 13.81;

  // 4. Отрисовка сгруппированных карточек банков
  listEl.innerHTML = sortedBanks
    .map(bankGroup => {
      const { bankName, items, topRate } = bankGroup;

      let productsHtml = '';

      if (isDeposits && marketRatesState.selectedTerm === 'all') {
        // Режим «Все сроки»: объединяем одинаковые продукты в единую карточку с сеткой ставок
        const productMap = new Map();
        for (const it of items) {
          const baseName = it.productName.split('(')[0].trim() || it.productName;
          if (!productMap.has(baseName)) {
            productMap.set(baseName, {
              productName: baseName,
              bankName: it.bankName,
              minAmount: it.minAmount || 0,
              tags: new Set(it.tags || []),
              conditionsNote: it.conditionsNote || '',
              termRates: new Map(),
              topRate: it.rate,
            });
          }
          const entry = productMap.get(baseName);
          if (it.minAmount > 0 && (entry.minAmount === 0 || it.minAmount < entry.minAmount)) {
            entry.minAmount = it.minAmount;
          }
          (it.tags || []).forEach(t => entry.tags.add(t));
          if (it.conditionsNote && !entry.conditionsNote) {
            entry.conditionsNote = it.conditionsNote;
          }
          if (it.rate > entry.topRate) {
            entry.topRate = it.rate;
          }
          const m = it.termMonths || Math.round((it.termDays || 90) / 30);
          const curR = entry.termRates.get(m) || 0;
          if (it.rate > curR) {
            entry.termRates.set(m, it.rate);
          }
        }

        const productsList = Array.from(productMap.values()).sort((a, b) => b.topRate - a.topRate);

        productsHtml = productsList
          .map((entry, pIdx) => {
            const isLast = pIdx === productsList.length - 1;

            // Кнопка Условия › (только если есть conditionsNote)
            const conditionsBtn = entry.conditionsNote
              ? `
              <button
                type="button"
                onclick="handleRateInfoClick(this)"
                data-bank="${encodeURIComponent(entry.bankName)}"
                data-product="${encodeURIComponent(entry.productName)}"
                data-note="${encodeURIComponent(entry.conditionsNote)}"
                class="text-[11px] font-medium text-zinc-400 hover:text-white transition-colors cursor-pointer flex items-center gap-0.5 flex-shrink-0 ml-2"
                title="Официальные условия"
              >
                <span>Условия</span>
                <i data-lucide="chevron-right" class="w-3.5 h-3.5 text-zinc-500"></i>
              </button>
            `
              : '';

            // Сроки и ставки чистым текстом через точку (без рамок и чипов)
            const standardTerms = [
              { m: 3, label: '3 мес' },
              { m: 6, label: '6 мес' },
              { m: 12, label: '1 год' },
            ];
            const presentTerms = standardTerms.filter(t => entry.termRates.has(t.m));
            const displayTerms =
              presentTerms.length > 0
                ? presentTerms
                : Array.from(entry.termRates.entries()).map(([m]) => ({
                    m,
                    label: m === 12 ? '1 год' : `${m} мес`,
                  }));

            const termsLineParts = displayTerms.map((t, idx) => {
              const r = entry.termRates.get(t.m);
              const isTop = r === entry.topRate;
              const dot = idx > 0 ? '<span class="text-zinc-600 select-none mx-1.5">·</span>' : '';
              return `${dot}<span class="whitespace-nowrap text-zinc-400">${t.label}:&nbsp;<b class="${isTop ? 'text-emerald-400 font-bold' : 'text-zinc-200 font-semibold'}">${formatRate(r)}%</b></span>`;
            });
            const termsLineHtml = termsLineParts.join('');

            // Условия простым текстом через точки без чипов
            const rawAmount = entry.minAmount > 0 ? formatMoney(entry.minAmount) : '';
            const minAmountDesc =
              entry.minAmount > 0
                ? `от&nbsp;${String(rawAmount).replace(/\s+/g, '&nbsp;')}`
                : 'без&nbsp;ограничений';

            let conditionsTextHtml = `<span class="whitespace-nowrap text-zinc-400 font-medium">${minAmountDesc}</span>`;
            if (entry.tags && entry.tags.size > 0) {
              const formattedTags = Array.from(entry.tags).map(formatTag).filter(Boolean);
              if (formattedTags.length > 0) {
                const tagsHtml = formattedTags
                  .map(t => `<span class="whitespace-nowrap text-zinc-500">${t}</span>`)
                  .join(' <span class="text-zinc-600 select-none mx-1.5">·</span> ');
                conditionsTextHtml += ` <span class="text-zinc-600 select-none mx-1.5">·</span> ${tagsHtml}`;
              }
            }

            return `
              <div class="py-2.5 ${!isLast ? 'border-b border-white/[0.04]' : ''} flex flex-col gap-1">
                <!-- Строка 1: Название продукта слева, кнопка Условия справа -->
                <div class="flex items-start justify-between gap-2">
                  <h5 class="text-xs font-semibold text-white tracking-tight leading-snug min-w-0 flex-1">${entry.productName}</h5>
                  ${conditionsBtn}
                </div>

                <!-- Строка 2: Сроки и ставки чистым текстом через точку -->
                <div class="flex items-center flex-wrap gap-y-0.5 text-[11px] font-mono mt-0.5">
                  ${termsLineHtml}
                </div>

                <!-- Строка 3: Сумма и параметры простым текстом через точки -->
                <p class="text-[11px] leading-normal">
                  ${conditionsTextHtml}
                </p>
              </div>
            `;
          })
          .join('');
      } else {
        // Режим конкретного срока или накопительных счетов
        productsHtml = items
          .map((item, pIdx) => {
            const isLast = pIdx === items.length - 1;
            const rawAmount = item.minAmount > 0 ? formatMoney(item.minAmount) : '';
            const minAmountDesc =
              item.minAmount > 0
                ? `от&nbsp;${String(rawAmount).replace(/\s+/g, '&nbsp;')}`
                : 'без&nbsp;ограничений';

            const conditionsBtn = item.conditionsNote
              ? `
              <button
                type="button"
                onclick="handleRateInfoClick(this)"
                data-bank="${encodeURIComponent(item.bankName)}"
                data-product="${encodeURIComponent(item.productName)}"
                data-note="${encodeURIComponent(item.conditionsNote)}"
                class="text-[11px] font-medium text-zinc-400 hover:text-white transition-colors cursor-pointer flex items-center gap-0.5 flex-shrink-0 ml-2"
                title="Официальные условия"
              >
                <span>Условия</span>
                <i data-lucide="chevron-right" class="w-3.5 h-3.5 text-zinc-500"></i>
              </button>
            `
              : '';

            const formattedTags =
              item.tags && item.tags.length > 0
                ? item.tags
                    .map(formatTag)
                    .filter(t => Boolean(t) && (isDeposits || t !== 'пополнение'))
                : [];
            let sublineHtml = `<span class="whitespace-nowrap text-zinc-400 font-medium">${minAmountDesc}</span>`;
            if (formattedTags.length > 0) {
              const tagsHtml = formattedTags
                .map(t => `<span class="whitespace-nowrap text-zinc-500">${t}</span>`)
                .join(' <span class="text-zinc-600 select-none mx-1.5">·</span> ');
              sublineHtml += ` <span class="text-zinc-600 select-none mx-1.5">·</span> ${tagsHtml}`;
            }

            return `
              <div class="py-2.5 ${!isLast ? 'border-b border-white/[0.04]' : ''} flex flex-col gap-1">
                <!-- Верхняя строка: Название продукта слева, ставка справа -->
                <div class="flex items-start justify-between gap-2">
                  <h5 class="text-xs font-semibold text-white tracking-tight leading-snug min-w-0 flex-1">${item.productName}</h5>
                  <span class="text-sm font-semibold tabular-nums text-emerald-400 leading-tight flex-shrink-0">
                    ${formatRate(item.rate)}%
                  </span>
                </div>

                <!-- Нижняя строка: Параметры простым текстом слева, кнопка Условия справа -->
                <div class="flex items-start justify-between gap-2 text-[11px] mt-0.5">
                  <p class="text-[11px] leading-normal min-w-0 flex-1">
                    ${sublineHtml}
                  </p>
                  ${conditionsBtn}
                </div>
              </div>
            `;
          })
          .join('');
      }

      return `
        <div class="p-3.5 rounded-2xl bg-[#12151C] border border-white/[0.06] hover:border-white/15 transition-all flex flex-col gap-1">
          <!-- Шапка группы банка -->
          <div class="flex items-center justify-between pb-2 border-b border-white/[0.06]">
            <div class="flex items-center gap-2 min-w-0">
              <h4 class="text-sm font-bold text-white tracking-tight truncate">${bankName}</h4>
            </div>
            <div class="text-right flex-shrink-0">
              <span class="text-xs text-zinc-400 font-medium whitespace-nowrap">до&nbsp;<b class="text-white font-semibold text-sm tabular-nums tracking-tight">${formatRate(topRate)}%</b></span>
            </div>
          </div>

          <!-- Список продуктов банка -->
          <div class="flex flex-col">
            ${productsHtml}
          </div>
        </div>
      `;
    })
    .join('');

  if (typeof lucide !== 'undefined' && lucide.createIcons) {
    lucide.createIcons();
  }
}

// ==========================================
// 6. Rate Conditions Floating Popover Card
// ==========================================
let _rateConditionsPopoverCleanup = null;

function showRateConditionsPopover(btn, bankName, productName, note) {
  const popover = document.getElementById('rate-conditions-popover');
  if (!popover) return;

  const bankEl = document.getElementById('rcp-bank-title');
  const prodEl = document.getElementById('rcp-product-title');
  const contentEl = document.getElementById('rcp-content');

  if (bankEl) bankEl.innerText = bankName || 'Банк';
  if (prodEl) prodEl.innerText = productName || 'Условия ставки';
  if (contentEl) {
    let cleanNote = (note || 'Подробные условия не указаны').trim();
    if (cleanNote.length > 0) {
      cleanNote = cleanNote.charAt(0).toUpperCase() + cleanNote.slice(1);
    }
    contentEl.innerText = cleanNote;
    contentEl.scrollTop = 0;
  }

  popover.classList.remove('hidden');

  // Динамическое позиционирование над/под кнопкой
  if (btn && typeof btn.getBoundingClientRect === 'function') {
    const rect = btn.getBoundingClientRect();
    const popoverH = popover.offsetHeight || 220;
    const winH = window.innerHeight;

    // По умолчанию показываем под кнопкой с зазором 6px
    let top = rect.bottom + 6;
    // Если выходит за пределы экрана снизу — поднимаем над кнопкой
    if (top + popoverH > winH - 20) {
      top = Math.max(50, rect.top - popoverH - 6);
    }
    popover.style.top = `${Math.round(top)}px`;
  } else {
    popover.style.top = '30%';
  }

  // Привязываем слушатели закрытия при скролле и клике вне поповера
  bindPopoverAutoClose();
}

function bindPopoverAutoClose() {
  if (_rateConditionsPopoverCleanup) {
    _rateConditionsPopoverCleanup();
  }

  const popover = document.getElementById('rate-conditions-popover');
  const listEl = document.getElementById('market-rates-offers-list');

  const onScroll = () => {
    closeRateConditionsPopover();
  };

  const onPointerDown = e => {
    if (!popover || popover.classList.contains('hidden')) return;
    // Если тап внутри поповера или по кнопке открытия — не закрываем
    if (popover.contains(e.target) || (e.target.closest && e.target.closest('[data-note]'))) {
      return;
    }
    closeRateConditionsPopover();
  };

  if (listEl) {
    listEl.addEventListener('scroll', onScroll, { passive: true });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('pointerdown', onPointerDown, { capture: true });

  _rateConditionsPopoverCleanup = () => {
    if (listEl) listEl.removeEventListener('scroll', onScroll);
    window.removeEventListener('scroll', onScroll);
    document.removeEventListener('pointerdown', onPointerDown, { capture: true });
    _rateConditionsPopoverCleanup = null;
  };
}

function closeRateConditionsPopover() {
  const popover = document.getElementById('rate-conditions-popover');
  if (popover) popover.classList.add('hidden');
  if (_rateConditionsPopoverCleanup) {
    _rateConditionsPopoverCleanup();
  }
}

function handleRateInfoClick(btn) {
  if (!btn) return;
  const bank = decodeURIComponent(btn.dataset.bank || '');
  const product = decodeURIComponent(btn.dataset.product || '');
  const note = decodeURIComponent(btn.dataset.note || '');
  showRateConditionsPopover(btn, bank, product, note);
}

window.showRateConditionsPopover = showRateConditionsPopover;
window.closeRateConditionsPopover = closeRateConditionsPopover;
window.showRateConditionsTooltip = showRateConditionsPopover;
window.closeRateConditionsTooltip = closeRateConditionsPopover;
window.handleRateInfoClick = handleRateInfoClick;
window.formatRate = formatRate;

// ==========================================
// 7. Separate Settings Modal
// ==========================================
function openMarketRatesSettingsModal() {
  const modal = document.getElementById('market-rates-settings-modal');
  if (!modal) return;

  mrLockScroll();
  modal.classList.remove('hidden');
  initMarketRatesSettingsForm();

  if (typeof lucide !== 'undefined' && lucide.createIcons) {
    lucide.createIcons();
  }
}

function closeMarketRatesSettingsModal() {
  const modal = document.getElementById('market-rates-settings-modal');
  if (modal) modal.classList.add('hidden');
  mrUnlockScroll();
}

const MONTHS_SLIDER_VALUES = [1, 3, 6, 12];

function handleMaxMonthsSliderChange(val) {
  const idx = parseInt(val, 10);
  const months = MONTHS_SLIDER_VALUES[idx] || 12;
  const hiddenInput = document.getElementById('mr-settings-max-months');
  if (hiddenInput) hiddenInput.value = months;
}

function toggleCustomCheckbox(input) {
  const box = input.nextElementSibling;
  if (!box) return;
  if (input.checked) {
    box.className =
      'custom-cb-box w-4 h-4 rounded-md border flex items-center justify-center transition-all bg-white border-white text-black flex-shrink-0';
  } else {
    box.className =
      'custom-cb-box w-4 h-4 rounded-md border flex items-center justify-center transition-all border-white/20 bg-white/[0.04] text-transparent flex-shrink-0';
  }
}

function filterBanksList(query) {
  const q = (query || '').trim().toLowerCase();
  document.querySelectorAll('.mr-bank-row').forEach(row => {
    const bank = row.getAttribute('data-bank') || '';
    if (!q || bank.includes(q)) {
      row.classList.remove('hidden');
    } else {
      row.classList.add('hidden');
    }
  });
}

function initMarketRatesSettingsForm() {
  const settings = getMarketRatesSettings();
  const hiddenInput = document.getElementById('mr-settings-max-months');
  const slider = document.getElementById('mr-settings-max-months-slider');
  const tagsContainer = document.getElementById('mr-settings-tags-list');
  const banksContainer = document.getElementById('mr-settings-banks-list');
  const searchInput = document.getElementById('mr-settings-bank-search');

  if (searchInput) searchInput.value = '';

  const currentMonths = settings.maxMonths || 12;
  if (hiddenInput) hiddenInput.value = currentMonths;
  if (slider) {
    const idx = MONTHS_SLIDER_VALUES.indexOf(currentMonths);
    slider.value = idx >= 0 ? idx : 3;
  }

  // 1. Отрисовка списка бейджей с минималистичными белыми чекбоксами
  if (tagsContainer) {
    tagsContainer.innerHTML = ALL_CONDITION_TAGS.map(t => {
      const isChecked = settings.allowedTags?.[t.id] !== false;
      return `
        <label class="flex items-center justify-between py-2 cursor-pointer select-none group border-b border-white/[0.04] last:border-b-0">
          <span class="text-xs text-zinc-300 group-hover:text-white transition-colors">${t.label}</span>
          <input type="checkbox" class="mr-tag-cb sr-only" value="${t.id}" ${isChecked ? 'checked' : ''} onchange="toggleCustomCheckbox(this)">
          <div class="custom-cb-box w-4 h-4 rounded-md border flex items-center justify-center transition-all flex-shrink-0 ${isChecked ? 'bg-white border-white text-black' : 'border-white/20 bg-white/[0.04] text-transparent'}">
            <svg class="w-3 h-3 stroke-[2.5]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
        </label>
      `;
    }).join('');
  }

  // 2. Отрисовка списка банков строками во всю ширину
  if (banksContainer) {
    const selected = settings.selectedBanks || TOP_10_BANKS_DEFAULT;
    banksContainer.innerHTML = ALL_POPULAR_BANKS.map(b => {
      const isChecked = selected.includes(b);
      return `
        <label class="mr-bank-row flex items-center justify-between py-2 cursor-pointer select-none group border-b border-white/[0.04] last:border-b-0" data-bank="${b.toLowerCase()}">
          <span class="text-xs text-zinc-300 group-hover:text-white transition-colors leading-snug">${b}</span>
          <input type="checkbox" class="mr-bank-cb sr-only flex-shrink-0" value="${b}" ${isChecked ? 'checked' : ''} onchange="toggleCustomCheckbox(this)">
          <div class="custom-cb-box w-4 h-4 rounded-md border flex items-center justify-center transition-all flex-shrink-0 ${isChecked ? 'bg-white border-white text-black' : 'border-white/20 bg-white/[0.04] text-transparent'}">
            <svg class="w-3 h-3 stroke-[2.5]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
        </label>
      `;
    }).join('');
  }
}

function selectBanksPreset(preset) {
  const checkboxes = document.querySelectorAll('.mr-bank-cb');
  checkboxes.forEach(cb => {
    if (preset === 'top10') {
      cb.checked = TOP_10_BANKS_DEFAULT.includes(cb.value);
    } else if (preset === 'all') {
      cb.checked = true;
    } else if (preset === 'none') {
      cb.checked = false;
    }
    toggleCustomCheckbox(cb);
  });
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
// 8. Lifecycle Initializer
// ==========================================
async function initMarketRatesModule() {
  renderMarketRatesWidget();

  try {
    await fetchLiveBankOffers(false);
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
window.fetchLiveBankOffers = fetchLiveBankOffers;
window.handleMaxMonthsSliderChange = handleMaxMonthsSliderChange;
window.toggleCustomCheckbox = toggleCustomCheckbox;
window.filterBanksList = filterBanksList;
