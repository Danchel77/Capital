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
function lockBodyScroll() {
  document.body.classList.add('overflow-hidden');
}

function unlockBodyScroll() {
  const mrModal = document.getElementById('market-rates-modal');
  const settingsModal = document.getElementById('market-rates-settings-modal');
  const isMrOpen = mrModal && !mrModal.classList.contains('hidden');
  const isSettingsOpen = settingsModal && !settingsModal.classList.contains('hidden');

  if (!isMrOpen && !isSettingsOpen) {
    document.body.classList.remove('overflow-hidden');
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

// ==========================================
// 3. Dynamic Data Loader (No hardcoded rates)
// ==========================================
async function fetchLiveBankOffers(forceRefresh = false) {
  marketRatesState.isLoading = true;
  marketRatesState.loadError = null;

  // 1. Попытка загрузить из локального кэша (если не принудительное обновление)
  if (!forceRefresh) {
    try {
      const cached = localStorage.getItem('budget_market_rates_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.timestamp && Date.now() - parsed.timestamp < 12 * 3600000) {
          if (parsed.offers && parsed.offers.length > 0) {
            marketRatesState.offers = parsed.offers;
            if (parsed.cbrRate) marketRatesState.cbrRate = parsed.cbrRate;
            if (parsed.moexIndices) marketRatesState.moexIndices = parsed.moexIndices;
            marketRatesState.isLoading = false;
            return;
          }
        }
      }
    } catch (_e) {
      // ignore
    }
  }

  // 2. Загрузка из актуального data/market-rates.json (созданного GitHub Action парсером)
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

        // Сохраняем в localStorage
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
  const cbrEl = document.getElementById('market-cbr-rate-val');
  const bestEl = document.getElementById('market-best-deposit-val');

  if (cbrEl) {
    if (marketRatesState.cbrRate) {
      cbrEl.innerText = `${marketRatesState.cbrRate.toFixed(1).replace('.0', '')}%`;
    } else {
      cbrEl.innerText = '14%';
    }
  }

  if (bestEl) {
    const best = getBestDepositOffer();
    if (best) {
      bestEl.innerText = `${best.rate}% · ${best.bankName}`;
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

  lockBodyScroll();
  modal.classList.remove('hidden');
  renderMarketRatesModalContent();

  if (typeof lucide !== 'undefined' && lucide.createIcons) {
    lucide.createIcons();
  }
}

function closeMarketRatesModal() {
  const modal = document.getElementById('market-rates-modal');
  if (modal) modal.classList.add('hidden');
  unlockBodyScroll();
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

  // 2. Фильтрация
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

  const moexBenchmark = isDeposits
    ? marketRatesState.moexIndices[marketRatesState.selectedTerm] ||
      marketRatesState.moexIndices['3m'] ||
      13.8
    : marketRatesState.moexIndices.accountMax || 13.81;

  // 4. Отрисовка сгруппированных карточек банков
  listEl.innerHTML = sortedBanks
    .map(bankGroup => {
      const { bankName, items, topRate } = bankGroup;

      const productsHtml = items
        .map((item, pIdx) => {
          const isOutlier = item.rate > moexBenchmark + 3.5;

          const tagsHtml = (item.tags || [])
            .map(
              t => `
            <span class="text-[10px] px-2 py-0.5 rounded-md bg-white/[0.04] text-zinc-400 font-medium border border-white/[0.05]">
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

          const isLast = pIdx === items.length - 1;

          return `
            <div class="py-2.5 ${!isLast ? 'border-b border-white/[0.04]' : ''} flex flex-col gap-1.5">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0 flex-1">
                  <h5 class="text-xs font-medium text-white truncate">${item.productName}</h5>
                  <div class="flex items-center gap-3 text-[11px] text-zinc-400 font-mono mt-0.5">
                    <span>Срок: <b class="text-zinc-300 font-normal">${termDesc}</b></span>
                    <span>Сумма: <b class="text-zinc-300 font-normal">${minAmountDesc}</b></span>
                  </div>
                </div>
                <div class="text-right flex-shrink-0">
                  <span class="text-base font-bold font-mono ${isOutlier ? 'text-amber-400' : 'text-emerald-400'} leading-none">
                    ${item.rate}%
                  </span>
                </div>
              </div>

              ${
                tagsHtml || outlierBadge
                  ? `
                <div class="flex flex-wrap gap-1 pt-0.5">
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

      return `
        <div class="p-3.5 rounded-2xl bg-[#12151C] border border-white/[0.06] hover:border-white/15 transition-all flex flex-col gap-1">
          <!-- Шапка группы банка -->
          <div class="flex items-center justify-between pb-2 border-b border-white/[0.06]">
            <div class="flex items-center gap-2 min-w-0">
              <h4 class="text-sm font-bold text-white tracking-tight truncate">${bankName}</h4>
              <span class="text-[10px] text-zinc-400 font-mono px-2 py-0.5 rounded-full bg-white/[0.04]">
                ${items.length} ${items.length === 1 ? 'предложение' : items.length < 5 ? 'предложения' : 'предложений'}
              </span>
            </div>
            <div class="text-right flex-shrink-0">
              <span class="text-xs text-zinc-400 font-medium">до <b class="text-white font-mono text-sm">${topRate}%</b></span>
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
// 7. Separate Settings Modal
// ==========================================
function openMarketRatesSettingsModal() {
  const modal = document.getElementById('market-rates-settings-modal');
  if (!modal) return;

  lockBodyScroll();
  modal.classList.remove('hidden');
  initMarketRatesSettingsForm();

  if (typeof lucide !== 'undefined' && lucide.createIcons) {
    lucide.createIcons();
  }
}

function closeMarketRatesSettingsModal() {
  const modal = document.getElementById('market-rates-settings-modal');
  if (modal) modal.classList.add('hidden');
  unlockBodyScroll();
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
