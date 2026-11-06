/**
 * deposits.js
 * Bank deposits and savings accounts management.
 * Redesigned into True OLED Obsidian Minimalist style.
 */

// ==========================================
// 1. Data Processing
// ==========================================
function processDeposits(deposits) {
  return (deposits || []).map(dep => {
    const amount =
      parseFloat(
        dep.amount !== undefined
          ? dep.amount
          : dep.initialAmount !== undefined
            ? dep.initialAmount
            : dep.currentAmount || 0
      ) || 0;
    const rate =
      parseFloat(
        dep.rate !== undefined
          ? dep.rate
          : dep.percent !== undefined
            ? dep.percent
            : dep.interestRate || 0
      ) || 0;

    const rawStart = dep.startDate || dep.rawStart;
    const startDate = rawStart
      ? typeof parseAnyDate === 'function'
        ? parseAnyDate(rawStart)
        : new Date(rawStart)
      : new Date();

    const rawEnd = dep.endDate || dep.rawEnd;
    let endDate;
    if (rawEnd) {
      endDate = typeof parseAnyDate === 'function' ? parseAnyDate(rawEnd) : new Date(rawEnd);
    } else if (dep.months && !isNaN(Number(dep.months))) {
      endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + Number(dep.months));
    } else {
      endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 1);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);

    const isExplicitlyClosed = dep.status === 'Закрыт' || dep.isClosed === true;
    const isMatured = !isExplicitlyClosed && today >= end;
    const isClosed = isExplicitlyClosed;

    const totalDays = Math.max(1, Math.round((endDate - startDate) / 86400000));
    const daysPassed = isClosed
      ? totalDays
      : Math.max(0, Math.min(Math.round((new Date() - startDate) / 86400000), totalDays));
    const durationStr = getDepositDurationStr(startDate, endDate);

    const totalExpectedInterest = Math.round(totalDays * ((amount * (rate / 100)) / 365));
    const currentInterest = Math.round(daysPassed * ((amount * (rate / 100)) / 365));
    const monthlyInterest = (amount * (rate / 100)) / 12;

    return {
      id: dep.id,
      name: dep.name || 'Вклад',
      bank: dep.bank || '',
      amount,
      rate,
      currentInterest,
      expectedInterest: totalExpectedInterest,
      monthlyInterest,
      progress: Math.min(100, (daysPassed / totalDays) * 100).toFixed(1),
      endDateStr: typeof formatDateStr === 'function' ? formatDateStr(endDate, 'dd.MM.yyyy') : '',
      durationStr,
      rawStart: typeof formatDateStr === 'function' ? formatDateStr(startDate, 'yyyy-MM-dd') : '',
      rawEnd: typeof formatDateStr === 'function' ? formatDateStr(endDate, 'yyyy-MM-dd') : '',
      isClosed,
      isMatured,
    };
  });
}

// ==========================================
// 2. Rendering
// ==========================================
const BANK_NAMES_LIST = [
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
  'Фора-Банк',
  'Свой Банк',
  'Сургутнефтегазбанк',
  'Банк Жилищного Финансирования',
  'Примсоцбанк',
  'Банк ТКБ',
  'БыстроБанк',
  'КАМКОМБАНК',
  'МОРСКОЙ БАНК',
  'Металлинвестбанк',
  'Норвик Банк',
  'Реалист Банк',
  'Ренессанс Банк',
  'СЕВЕРГАЗБАНК',
  'Самолет Банк',
  'ФИНСТАР БАНК',
];

function getSortedBankList() {
  let favoriteBanks = [];
  try {
    if (typeof getMarketRatesSettings === 'function') {
      const s = getMarketRatesSettings();
      favoriteBanks = s.selectedBanks || [];
    }
  } catch (_e) {
    // ignore
  }

  const favoritesSet = new Set(favoriteBanks.map(b => b.toLowerCase()));
  const favList = [];
  const otherList = [];

  BANK_NAMES_LIST.forEach(b => {
    if (favoritesSet.has(b.toLowerCase())) {
      favList.push(b);
    } else {
      otherList.push(b);
    }
  });

  return [...favList, ...otherList];
}

let activeBankDropdownCleanup = null;

function closeCustomBankDropdown(targetPrefix) {
  const dropdown = document.getElementById(`${targetPrefix}-dropdown`);
  const chevron = document.getElementById(`${targetPrefix}-chevron`);
  if (dropdown) dropdown.classList.add('hidden');
  if (chevron) chevron.classList.remove('rotate-180');
}
window.closeCustomBankDropdown = closeCustomBankDropdown;

function bindCustomBankDropdownAutoClose(targetPrefix) {
  if (typeof activeBankDropdownCleanup === 'function') {
    activeBankDropdownCleanup();
  }

  const container = document.getElementById(`${targetPrefix}-select-container`);
  const onPointerDown = e => {
    if (container && !container.contains(e.target)) {
      closeCustomBankDropdown(targetPrefix);
      cleanup();
    }
  };

  const cleanup = () => {
    document.removeEventListener('pointerdown', onPointerDown, { capture: true });
    activeBankDropdownCleanup = null;
  };

  document.addEventListener('pointerdown', onPointerDown, { capture: true });
  activeBankDropdownCleanup = cleanup;
}

function renderCustomBankOptions(targetPrefix, filterQuery = '') {
  const listEl = document.getElementById(`${targetPrefix}-options-list`);
  if (!listEl) return;

  const currentVal = document.getElementById(targetPrefix)?.value || '';
  const sortedBanks = getSortedBankList();
  const query = (filterQuery || '').trim().toLowerCase();
  const safeEscape = typeof escapeHtml === 'function' ? escapeHtml : s => s;

  const filteredBanks = query
    ? sortedBanks.filter(b => b.toLowerCase().includes(query))
    : sortedBanks;

  let html = '';
  if (!query) {
    const isNoneSelected = !currentVal;
    html += `
      <div
        onclick="selectCustomBank('${targetPrefix}', '')"
        class="flex items-center justify-between p-2.5 hover:bg-white/[0.06] transition-colors cursor-pointer select-none ${isNoneSelected ? 'bg-white/[0.04]' : ''}"
      >
        <span class="text-xs text-zinc-400">Не указывать банк</span>
        ${isNoneSelected ? '<i data-lucide="check" class="w-3.5 h-3.5 text-emerald-400"></i>' : ''}
      </div>
    `;
  }

  if (filteredBanks.length === 0) {
    html += `<div class="p-3 text-center text-xs text-zinc-500">Банк не найден</div>`;
  } else {
    filteredBanks.forEach(b => {
      const isSelected = currentVal.toLowerCase() === b.toLowerCase();
      const logoSvg = (typeof getBankLogoSvg === 'function' ? getBankLogoSvg(b) : '') || '';
      const logoHtml = logoSvg
        ? `<div class="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 overflow-hidden">${logoSvg}</div>`
        : '';

      html += `
        <div
          onclick="selectCustomBank('${targetPrefix}', '${safeEscape(b)}')"
          class="flex items-center justify-between p-2.5 hover:bg-white/[0.06] transition-colors cursor-pointer select-none ${isSelected ? 'bg-white/[0.04]' : ''}"
        >
          <div class="flex items-center gap-2.5 min-w-0 pr-2">
            ${logoHtml}
            <span class="text-xs font-medium text-white truncate">${safeEscape(b)}</span>
          </div>
          ${isSelected ? '<i data-lucide="check" class="w-3.5 h-3.5 text-emerald-400 flex-shrink-0"></i>' : ''}
        </div>
      `;
    });
  }

  listEl.innerHTML = html;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function openCustomBankDropdown(targetPrefix) {
  const dropdown = document.getElementById(`${targetPrefix}-dropdown`);
  const chevron = document.getElementById(`${targetPrefix}-chevron`);
  if (!dropdown) return;

  closeCustomBankDropdown('dep-bank');
  closeCustomBankDropdown('edit-dep-bank');

  dropdown.classList.remove('hidden');
  if (chevron) chevron.classList.add('rotate-180');

  const searchInput = document.getElementById(`${targetPrefix}-search`);
  if (searchInput) {
    searchInput.value = '';
  }
  renderCustomBankOptions(targetPrefix, '');
  bindCustomBankDropdownAutoClose(targetPrefix);
}
window.openCustomBankDropdown = openCustomBankDropdown;

function toggleCustomBankDropdown(targetPrefix) {
  const dropdown = document.getElementById(`${targetPrefix}-dropdown`);
  if (!dropdown) return;

  const isHidden = dropdown.classList.contains('hidden');
  if (isHidden) {
    openCustomBankDropdown(targetPrefix);
  } else {
    closeCustomBankDropdown(targetPrefix);
  }
}
window.toggleCustomBankDropdown = toggleCustomBankDropdown;

function filterCustomBankDropdown(targetPrefix, query) {
  renderCustomBankOptions(targetPrefix, query);
}
window.filterCustomBankDropdown = filterCustomBankDropdown;

function selectCustomBank(targetPrefix, bankName) {
  const hiddenInput = document.getElementById(targetPrefix);
  const displayEl = document.getElementById(`${targetPrefix}-selected-display`);
  const safeEscape = typeof escapeHtml === 'function' ? escapeHtml : s => s;

  if (hiddenInput) {
    hiddenInput.value = bankName;
  }

  if (displayEl) {
    if (bankName) {
      const logoSvg = (typeof getBankLogoSvg === 'function' ? getBankLogoSvg(bankName) : '') || '';
      const logoHtml = logoSvg
        ? `<div class="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 overflow-hidden">${logoSvg}</div>`
        : '';
      displayEl.innerHTML = `
        ${logoHtml}
        <span class="text-white font-medium text-xs truncate">${safeEscape(bankName)}</span>
      `;
    } else {
      displayEl.innerHTML = `<span class="text-zinc-500">Выберите банк (необязательно)</span>`;
    }
  }

  const nameInputId = targetPrefix === 'edit-dep-bank' ? 'edit-dep-name' : 'dep-name';
  handleDepositBankSelect({ value: bankName }, nameInputId);

  closeCustomBankDropdown(targetPrefix);
}
window.selectCustomBank = selectCustomBank;

function setCustomBankSelectValue(targetPrefix, bankName) {
  selectCustomBank(targetPrefix, bankName || '');
}
window.setCustomBankSelectValue = setCustomBankSelectValue;

function initDepositBankSelects() {
  renderCustomBankOptions('dep-bank');
  renderCustomBankOptions('edit-dep-bank');
}
window.initDepositBankSelects = initDepositBankSelects;

function handleDepositBankSelect(selectEl, nameInputId) {
  const bank = selectEl.value;
  const nameInput = document.getElementById(nameInputId);
  if (!nameInput) return;
  const all = Cache?.deposits || [];
  if (bank) {
    const count =
      all.filter(
        d =>
          (d.bank || '').toLowerCase() === bank.toLowerCase() ||
          (d.name || '').toLowerCase().startsWith(bank.toLowerCase())
      ).length + 1;
    nameInput.placeholder = `${bank} ${count}`;
  } else {
    nameInput.placeholder = `Вклад ${all.length + 1}`;
  }
}
window.handleDepositBankSelect = handleDepositBankSelect;

function updateDepositsBadge() {
  const data = Cache?.deposits || [];
  const maturedCount = data.filter(d => !d.isClosed && d.isMatured).length;
  const badge = document.getElementById('nav-capital-badge');
  if (badge) {
    if (maturedCount > 0) {
      badge.textContent = String(maturedCount);
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }
}

function renderDeposits() {
  const data = Cache.deposits || [];
  const listEl = document.getElementById('deposits-list');
  const totalAmountEl = document.getElementById('deposits-total-amount');
  const monthlyInterestEl = document.getElementById('deposits-monthly-interest');

  const matured = data.filter(d => !d.isClosed && d.isMatured);
  const active = data.filter(d => !d.isClosed && !d.isMatured);
  const closed = data.filter(d => d.isClosed);

  const totalActiveAmount = [...active, ...matured].reduce(
    (sum, d) => sum + (parseFloat(d.amount) || 0),
    0
  );
  const totalMonthlyInterest = Math.round(
    active.reduce((sum, d) => sum + (parseFloat(d.monthlyInterest) || 0), 0)
  );

  if (totalAmountEl) {
    totalAmountEl.innerText = formatMoney(totalActiveAmount);
  }
  if (monthlyInterestEl) {
    monthlyInterestEl.innerText = `+${formatMoney(totalMonthlyInterest)}/мес`;
  }

  updateDepositsBadge();
  initDepositBankSelects();
  if (typeof updateCapitalSummaryHeader === 'function') updateCapitalSummaryHeader();
  if (typeof renderMarketRatesWidget === 'function') renderMarketRatesWidget();

  if (!listEl) return;

  // Пустое состояние
  if (data.length === 0) {
    listEl.innerHTML = `
      <div class="card rounded-2xl p-6 text-center flex flex-col items-center justify-center gap-3 mt-2 border border-white/[0.08] bg-[#0E1016]">
        <div class="w-12 h-12 rounded-2xl bg-white/[0.05] border border-white/[0.08] text-zinc-400 flex items-center justify-center">
          <i data-lucide="vault" class="w-6 h-6 text-white"></i>
        </div>
        <div>
          <p class="text-sm font-semibold text-white">У вас пока нет открытых вкладов</p>
          <p class="text-xs text-zinc-400 mt-1 max-w-[280px]">
            Добавьте банковский вклад или накопительный счет для учета доходности в капитале
          </p>
        </div>
        <button
          type="button"
          onclick="toggleForm('deposit-form-container', 'dep-submit-btn', 'Сохранить', 'deposit-form')"
          class="mt-1 px-4 py-2.5 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 text-xs font-semibold transition-all active:scale-95 cursor-pointer flex items-center gap-2 shadow-sm"
        >
          <i data-lucide="plus" class="w-3.5 h-3.5"></i>
          <span>Открыть первый вклад</span>
        </button>
      </div>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  let html = '';

  // 1. СЕКЦИЯ: Вклады, требующие закрытия (Matured Deposits)
  if (matured.length > 0) {
    html += `
      <div class="mb-3 space-y-2">
        <div class="flex items-center justify-between px-1">
          <span class="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
            <i data-lucide="bell" class="w-3.5 h-3.5 text-amber-400"></i>
            <span>Требуется закрытие (${matured.length})</span>
          </span>
          <span class="text-[10px] text-amber-400/80 font-medium">Срок завершен</span>
        </div>
        ${matured
          .map(dep => {
            const logoSvg =
              (typeof getBankLogoSvg === 'function' ? getBankLogoSvg(dep.bank || dep.name) : '') ||
              '';
            const logoHtml = logoSvg
              ? `<div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden shadow-sm">${logoSvg}</div>`
              : `<div class="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-300 flex items-center justify-center flex-shrink-0 border border-amber-500/25"><i data-lucide="vault" class="w-4 h-4"></i></div>`;
            return `
          <div class="card bg-[#0E1016] border border-amber-500/30 rounded-2xl p-3.5 flex flex-col gap-2.5 transition-all cursor-pointer shadow-lg active:scale-[0.99]"
               onclick="openCloseDepositModal('${dep.id}')">
            <div class="flex items-start justify-between w-full gap-2">
              <div class="flex items-center gap-2.5 min-w-0">
                ${logoHtml}
                <div class="min-w-0">
                  <h4 class="text-sm font-semibold text-white truncate leading-tight">${escapeHtml(dep.name)}</h4>
                  <p class="text-[11px] text-amber-300/80 font-mono mt-0.5">Истёк ${dep.endDateStr} • ${typeof formatPercent === 'function' ? formatPercent(dep.rate) : dep.rate + '%'}</p>
                </div>
              </div>
              <button type="button"
                      onclick="event.stopPropagation(); openCloseDepositModal('${dep.id}')"
                      class="py-1.5 px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 active:scale-95 text-amber-300 font-semibold text-xs border border-amber-500/30 transition-all cursor-pointer flex items-center gap-1 flex-shrink-0">
                <span>Закрыть</span>
              </button>
            </div>
            <div class="pt-2 border-t border-white/[0.06] flex items-center justify-between text-xs">
              <span class="text-zinc-400">Вложено: <b class="font-mono text-white font-bold tabular-nums">${formatMoney(dep.amount)}</b></span>
              <span class="text-zinc-400">Начислено: <b class="font-mono text-emerald-400 font-bold tabular-nums">+${formatMoney(dep.expectedInterest)}</b></span>
            </div>
          </div>
        `;
          })
          .join('')}
      </div>
    `;
  }

  // 2. СЕКЦИЯ: Активные вклады (Active Deposits)
  html += `
    <div class="space-y-2 mt-1">
      <div class="flex items-center justify-between px-1 mb-2">
        <span class="text-xs uppercase tracking-wider font-bold text-zinc-400">
          Активные вклады (${active.length})
        </span>
        <button
          type="button"
          id="dep-open-top-btn"
          onclick="toggleForm('deposit-form-container', 'dep-submit-btn', 'Сохранить', 'deposit-form')"
          class="bg-white/[0.05] hover:bg-white/10 active:scale-95 text-zinc-400 hover:text-white px-2.5 py-1 rounded-xl border border-white/[0.08] flex items-center gap-1.5 text-xs font-medium cursor-pointer transition-all"
        >
          <i data-lucide="plus" class="w-3.5 h-3.5"></i>
          <span>Вклад</span>
        </button>
      </div>
  `;

  if (active.length > 0) {
    html += active
      .map(dep => {
        const logoSvg =
          (typeof getBankLogoSvg === 'function' ? getBankLogoSvg(dep.bank || dep.name) : '') || '';
        const logoHtml = logoSvg
          ? `<div class="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden shadow-sm">${logoSvg}</div>`
          : `<div class="w-7 h-7 rounded-lg bg-white/[0.05] text-zinc-300 flex items-center justify-center flex-shrink-0 border border-white/[0.06]"><i data-lucide="vault" class="w-3.5 h-3.5"></i></div>`;
        return `
      <div
        class="card bg-[#0E1016] border border-white/[0.06] hover:border-white/15 rounded-2xl w-full mb-2.5 flex flex-col p-3.5 cursor-pointer overflow-hidden transition-all active:scale-[0.99]"
        data-id="${dep.id}"
        data-table="Deposits"
        onclick="openCardContextMenu(event, '${escapeHtml(dep.name)}', () => openEditDepModal('${dep.id}'), () => deleteRecord('Deposits', '${dep.id}'))"
      >
        <input type="checkbox" class="select-checkbox" data-id="${dep.id}">

        <!-- Этаж 1: Название, иконка и ставка -->
        <div class="flex justify-between items-center w-full">
          <div class="flex items-center gap-2.5 min-w-0 pr-2">
            ${logoHtml}
            <h4 class="text-sm font-semibold text-white truncate leading-tight">${escapeHtml(dep.name)}</h4>
          </div>
          <div class="text-right flex-shrink-0">
            <span class="text-[11px] font-semibold text-zinc-300 font-mono bg-white/[0.05] border border-white/[0.06] px-2 py-0.5 rounded-md">${typeof formatPercent === 'function' ? formatPercent(dep.rate) : dep.rate + '%'}</span>
          </div>
        </div>

        <!-- Этаж 2: Тело вклада (слева) и Накопленный доход (справа) -->
        <div class="mt-2.5 flex items-baseline justify-between w-full">
          <div class="min-w-0">
            <span class="text-base font-bold text-white font-mono tabular-nums leading-none">${formatMoney(dep.amount)}</span>
          </div>
          <div class="text-right flex-shrink-0">
            <span class="text-sm font-bold text-emerald-400 font-mono tabular-nums leading-none">+${formatMoney(dep.currentInterest)}</span>
          </div>
        </div>

        <!-- Этаж 3: Дата окончания (слева) и Ориентир дохода в месяц (справа) -->
        <div class="mt-1 flex items-center justify-between w-full text-[11px] text-zinc-400 font-mono">
          <span>до ${dep.endDateStr}</span>
          ${dep.monthlyInterest > 0 ? `<span class="tabular-nums">+${formatMoney(Math.round(dep.monthlyInterest))}/мес</span>` : ''}
        </div>

        <!-- Этаж 4: Тонкий таймлайн (2px) -->
        <div class="w-full bg-white/[0.06] h-[2px] rounded-full overflow-hidden mt-2">
          <div class="bg-emerald-500 h-full rounded-full transition-all duration-300" style="width:${dep.progress}%"></div>
        </div>
      </div>
    `;
      })
      .join('');
  } else {
    html += `
      <div class="p-4 text-center text-xs text-zinc-500 border border-white/[0.04] rounded-2xl bg-[#0E1016]/40">
        Нет действующих вкладов
      </div>
    `;
  }
  html += `</div>`;

  // 3. СЕКЦИЯ: Закрытые вклады (Closed Deposits)
  if (closed.length > 0) {
    html += `
      <div class="mt-5 pt-3 border-t border-white/[0.06] space-y-2">
        <div class="flex items-center justify-between px-1 mb-1">
          <span class="text-xs uppercase tracking-wider font-bold text-zinc-500">
            Закрытые вклады (${closed.length})
          </span>
          <span class="text-[10px] text-zinc-500">Архив</span>
        </div>
        ${closed
          .map(dep => {
            const logoSvg =
              (typeof getBankLogoSvg === 'function' ? getBankLogoSvg(dep.bank || dep.name) : '') ||
              '';
            const logoHtml = logoSvg
              ? `<div class="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 opacity-70 overflow-hidden">${logoSvg}</div>`
              : `<div class="w-7 h-7 rounded-lg bg-white/[0.03] text-zinc-500 flex items-center justify-center flex-shrink-0"><i data-lucide="check-circle" class="w-3.5 h-3.5"></i></div>`;
            return `
          <div
            class="card bg-[#0E1016]/60 border border-white/[0.04] rounded-2xl w-full p-3 flex items-center justify-between cursor-pointer transition-all hover:bg-[#0E1016] opacity-70 hover:opacity-100 active:scale-[0.99]"
            data-id="${dep.id}"
            data-table="Deposits"
            onclick="openCardContextMenu(event, '${escapeHtml(dep.name)}', null, () => deleteRecord('Deposits', '${dep.id}'))"
          >
            <div class="flex items-center gap-2.5 min-w-0 pr-2">
              ${logoHtml}
              <div class="min-w-0">
                <h4 class="text-xs font-medium text-zinc-300 truncate">${escapeHtml(dep.name)}</h4>
                <p class="text-[10px] text-zinc-500 mt-0.5">Закрыт ${dep.endDateStr} • ${dep.durationStr}</p>
              </div>
            </div>
            <div class="text-right flex-shrink-0">
              <p class="text-xs font-bold text-zinc-300 font-mono tabular-nums leading-tight">${formatMoney(dep.amount)}</p>
              <p class="text-[10px] text-zinc-500 font-mono mt-0.5">+${formatMoney(dep.expectedInterest)}</p>
            </div>
          </div>
        `;
          })
          .join('')}
      </div>
    `;
  }

  listEl.innerHTML = html;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ==========================================
// 3. Deposit Creation & Form
// ==========================================
function submitDeposit(e) {
  e.preventDefault();
  const startRaw = document.getElementById('dep-start').value;
  const endRaw = document.getElementById('dep-end').value;

  if (!endRaw) {
    showToast('Укажите дату закрытия вклада', true);
    return;
  }

  const allDeposits = Cache?.deposits || [];
  const selectedBank = document.getElementById('dep-bank')?.value?.trim() || '';
  const rawName = document.getElementById('dep-name')?.value?.trim();

  let name = rawName;
  if (!name) {
    if (selectedBank) {
      const sameBankDeposits = allDeposits.filter(
        d =>
          (d.bank || '').toLowerCase() === selectedBank.toLowerCase() ||
          (d.name || '').toLowerCase().startsWith(selectedBank.toLowerCase())
      );
      name = `${selectedBank} ${sameBankDeposits.length + 1}`;
    } else {
      name = `Вклад ${allDeposits.length + 1}`;
    }
  }

  const parsedStart =
    typeof parseAnyDate === 'function' ? parseAnyDate(startRaw) : new Date(startRaw);
  const startDate =
    parsedStart && !isNaN(parsedStart.getTime()) && typeof formatDateStr === 'function'
      ? formatDateStr(parsedStart, 'yyyy-MM-dd')
      : formatDateStr(startRaw) || startRaw;

  const parsedEnd = typeof parseAnyDate === 'function' ? parseAnyDate(endRaw) : new Date(endRaw);
  const endDate =
    parsedEnd && !isNaN(parsedEnd.getTime()) && typeof formatDateStr === 'function'
      ? formatDateStr(parsedEnd, 'yyyy-MM-dd')
      : formatDateStr(endRaw) || endRaw;

  submitAction('dep-submit-btn', 'Deposits', {
    name,
    bank: selectedBank,
    amount: getUnformattedVal(document.getElementById('dep-amount')),
    rate: getUnformattedVal(document.getElementById('dep-rate')),
    startDate,
    endDate,
    status: 'Активен',
    isInterestCredited: false,
  });

  closeForm('deposit-form-container', 'dep-submit-btn', 'Сохранить', 'deposit-form');
  setCustomBankSelectValue('dep-bank', '');
}

// ==========================================
// 4. Deposit Edit Modal
// ==========================================
function openEditDepModal(id) {
  if (typeof isSelectionMode === 'function' && isSelectionMode()) return;
  if (window.isSelectionMode && window.isSelectionMode()) return;

  const dep = (Cache?.deposits || []).find(d => d.id === id);
  if (!dep) return;

  const dlg = document.getElementById('dep-edit-modal');
  if (!dlg) return;

  initDepositBankSelects();
  document.getElementById('edit-dep-id').value = dep.id;
  setCustomBankSelectValue('edit-dep-bank', dep.bank || '');
  document.getElementById('edit-dep-name').value = dep.name || '';
  setFormattedVal('edit-dep-amount', dep.amount);
  setFormattedVal('edit-dep-rate', dep.rate);

  const startRaw = dep.rawStart || dep.startDate || '';
  const parsedStart =
    typeof parseAnyDate === 'function' ? parseAnyDate(startRaw) : new Date(startRaw);
  document.getElementById('edit-dep-start').value =
    typeof formatDateStr === 'function' ? formatDateStr(parsedStart, 'dd.MM.yyyy') : startRaw;

  const endRaw = dep.rawEnd || dep.endDate || '';
  const parsedEnd = typeof parseAnyDate === 'function' ? parseAnyDate(endRaw) : new Date(endRaw);
  document.getElementById('edit-dep-end').value =
    typeof formatDateStr === 'function' ? formatDateStr(parsedEnd, 'dd.MM.yyyy') : endRaw;

  dlg.classList.remove('hidden');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeEditDepModal() {
  const dlg = document.getElementById('dep-edit-modal');
  if (dlg) dlg.classList.add('hidden');
  closeCustomBankDropdown('edit-dep-bank');
}

async function submitEditDepModal(e) {
  if (e) e.preventDefault();
  const id = document.getElementById('edit-dep-id').value;
  if (!id) return;

  const selectedBank = document.getElementById('edit-dep-bank')?.value?.trim() || '';
  const rawName = document.getElementById('edit-dep-name')?.value?.trim();
  let name = rawName;
  if (!name) {
    name = selectedBank ? `${selectedBank} 1` : 'Вклад';
  }

  const amount = getUnformattedVal(document.getElementById('edit-dep-amount'));
  const rate = getUnformattedVal(document.getElementById('edit-dep-rate'));
  const startRaw = document.getElementById('edit-dep-start').value;
  const endRaw = document.getElementById('edit-dep-end').value;

  if (!amount || amount <= 0) {
    showToast('Укажите сумму вклада', true);
    return;
  }
  if (!endRaw) {
    showToast('Укажите дату закрытия вклада', true);
    return;
  }

  const startDate = formatDateStr(startRaw) || startRaw;
  const endDate = formatDateStr(endRaw) || endRaw;

  try {
    await getUserCol('Deposits').doc(id).update({
      name,
      bank: selectedBank,
      amount,
      rate,
      startDate,
      endDate,
    });
    closeEditDepModal();
    await fetchAllData();
  } catch (err) {
    showToast('Ошибка при сохранении: ' + (err.message || ''), true);
  }
}

function deleteDepFromModal() {
  const id = document.getElementById('edit-dep-id').value;
  if (!id) return;
  showDialog(
    'Удаление вклада',
    'Вы уверены, что хотите удалить этот вклад? Запись будет удалена безвозвратно.',
    [
      { label: 'Отмена', style: 'cancel' },
      {
        label: 'Удалить',
        style: 'destructive',
        action: async () => {
          closeEditDepModal();
          await deleteRecord('Deposits', id);
        },
      },
    ]
  );
}

// ==========================================
// 5. Deposit Close Confirmation Modal
// ==========================================
function openCloseDepositModal(id) {
  const dep = (Cache?.deposits || []).find(d => d.id === id);
  if (!dep) return;

  const dlg = document.getElementById('deposit-close-dialog');
  if (!dlg) return;

  const idInp = document.getElementById('dep-close-id');
  const nameEl = document.getElementById('dep-close-name');
  const amountEl = document.getElementById('dep-close-amount');
  const interestEl = document.getElementById('dep-close-interest');
  const totalEl = document.getElementById('dep-close-total');

  if (idInp) idInp.value = dep.id;
  if (nameEl) nameEl.innerText = dep.name || 'Вклад';
  if (amountEl) amountEl.innerText = formatMoney(dep.amount || 0);
  if (interestEl) interestEl.innerText = `+${formatMoney(dep.expectedInterest || 0)}`;
  if (totalEl) totalEl.innerText = formatMoney((dep.amount || 0) + (dep.expectedInterest || 0));

  dlg.classList.remove('hidden');
  if (typeof lockBodyScroll === 'function') lockBodyScroll();
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeDepositCloseModal() {
  const dlg = document.getElementById('deposit-close-dialog');
  if (dlg) dlg.classList.add('hidden');
  if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
}

async function submitCloseDepositModal() {
  const depId = document.getElementById('dep-close-id')?.value;
  if (!depId) return;

  const dep = (Cache?.deposits || []).find(d => d.id === depId);
  if (!dep) {
    showToast('Вклад не найден', true);
    return;
  }

  const btn = document.getElementById('dep-close-submit-btn');
  if (btn) {
    btn.disabled = true;
    btn.classList.add('opacity-70');
  }

  try {
    const depRef = getUserCol('Deposits').doc(dep.id);
    const interestEarned = Math.round(dep.expectedInterest || 0);

    await depRef.update({
      status: 'Закрыт',
      isClosed: true,
      interestEarned,
      closedAt: Date.now(),
      updatedAt: Date.now(),
    });

    dep.status = 'Закрыт';
    dep.isClosed = true;
    dep.isMatured = false;

    closeDepositCloseModal();
    showToast(`Вклад «${dep.name}» закрыт`);

    updateDepositsBadge();
    if (typeof fetchAllData === 'function') {
      await fetchAllData();
    } else {
      renderDeposits();
    }
  } catch (err) {
    console.error('Ошибка при закрытии вклада:', err);
    showToast('Ошибка при закрытии: ' + (err.message || ''), true);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('opacity-70');
    }
  }
}

// ==========================================
// 6. Helpers & Legacy Stubs
// ==========================================
function getDepositDurationStr(startDate, endDate) {
  const totalDays = Math.max(1, Math.round((endDate - startDate) / 86400000));
  let months = Math.round(totalDays / 30.4375);
  if (months < 1) months = 1;
  return typeof formatPlural === 'function'
    ? formatPlural(months, 'месяц', 'месяца', 'месяцев')
    : `${months} мес.`;
}

// Безопасные заглушки для обратной совместимости
function toggleDepositGoalMenu() {}
function selectDepositGoal() {}
function toggleEditDepositGoalMenu() {}
function selectEditDepositGoal() {}
function toggleDepCloseGoalSection() {}
function toggleDepCloseGoalMenu() {}
function renderDepCloseGoals() {}
function selectDepCloseGoal() {}

// ==========================================
// 7. Global Scope Exports
// ==========================================
window.processDeposits = processDeposits;
window.renderDeposits = renderDeposits;
window.submitDeposit = submitDeposit;
window.openEditDepModal = openEditDepModal;
window.closeEditDepModal = closeEditDepModal;
window.submitEditDepModal = submitEditDepModal;
window.deleteDepFromModal = deleteDepFromModal;
window.openCloseDepositModal = openCloseDepositModal;
window.closeDepositCloseModal = closeDepositCloseModal;
window.submitCloseDepositModal = submitCloseDepositModal;
window.updateDepositsBadge = updateDepositsBadge;
window.getDepositDurationStr = getDepositDurationStr;

window.toggleDepositGoalMenu = toggleDepositGoalMenu;
window.selectDepositGoal = selectDepositGoal;
window.toggleEditDepositGoalMenu = toggleEditDepositGoalMenu;
window.selectEditDepositGoal = selectEditDepositGoal;
window.toggleDepCloseGoalSection = toggleDepCloseGoalSection;
window.toggleDepCloseGoalMenu = toggleDepCloseGoalMenu;
window.renderDepCloseGoals = renderDepCloseGoals;
window.selectDepCloseGoal = selectDepCloseGoal;
