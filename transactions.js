// ==========================================
// Variables & State
// ==========================================

// Фильтры списка транзакций
let currentFilterMonth = 'all';
let currentFilterCategory = 'all';
let currentFilterSearch = '';
let currentFilterPendingOnly = false;

// ==========================================
// 1. Data Processing
// ==========================================
function processTransactions(txs) {
  const grouped = {};
  const months = [
    'Январь',
    'Февраль',
    'Март',
    'Апрель',
    'Май',
    'Июнь',
    'Июль',
    'Август',
    'Сентябрь',
    'Октябрь',
    'Ноябрь',
    'Декабрь',
  ];
  (txs || []).forEach(tx => {
    const rawDateVal = tx.date || tx.rawDate || tx.formattedDate;
    let txDate = null;
    if (rawDateVal) {
      txDate = typeof parseAnyDate === 'function' ? parseAnyDate(rawDateVal) : new Date(rawDateVal);
    }
    if (!txDate || isNaN(txDate.getTime())) {
      txDate =
        tx.timestamp && !isNaN(new Date(tx.timestamp).getTime())
          ? new Date(tx.timestamp)
          : new Date();
    }
    const key =
      typeof formatDateStr === 'function'
        ? formatDateStr(txDate, 'yyyy-MM')
        : `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}`;
    if (!grouped[key]) {
      grouped[key] = {
        id: key,
        label: months[txDate.getMonth()] + ' ' + txDate.getFullYear(),
        income: 0,
        expense: 0,
        items: [],
      };
    }
    const amount =
      typeof parseAmount === 'function'
        ? parseAmount(tx.amount)
        : parseFloat(
            String(tx.amount || 0)
              .replace(/\s/g, '')
              .replace(/,/g, '.')
          ) || 0;
    const rawType = String(tx.type || '')
      .trim()
      .toLowerCase();
    const isIncome = rawType === 'доход' || rawType === 'income';
    const isExpense = !isIncome;
    const isPending = !!(tx.isPendingTransfer || tx.transferStatus === 'pending');

    if (!isPending) {
      if (isExpense) grouped[key].expense += amount;
      else if (isIncome) grouped[key].income += amount;
    }

    const isoDateStr =
      typeof formatDateStr === 'function'
        ? formatDateStr(txDate, 'yyyy-MM-dd')
        : tx.date || tx.rawDate;
    const ruDateStr =
      typeof formatDateStr === 'function'
        ? formatDateStr(txDate, 'dd.MM.yyyy')
        : tx.formattedDate || isoDateStr;

    let createdTime = 0;
    if (tx.createdAt) {
      if (typeof tx.createdAt === 'object' && typeof tx.createdAt.toMillis === 'function') {
        createdTime = tx.createdAt.toMillis();
      } else if (typeof tx.createdAt === 'object' && typeof tx.createdAt.seconds === 'number') {
        createdTime = tx.createdAt.seconds * 1000;
      } else {
        const parsedCreated = new Date(tx.createdAt).getTime();
        if (!isNaN(parsedCreated)) createdTime = parsedCreated;
      }
    } else if (tx.timestamp && Number(tx.timestamp) > 2000000000) {
      createdTime = Number(tx.timestamp);
    }

    const commentVal =
      typeof getTxComment === 'function'
        ? getTxComment(tx)
        : tx.comment ||
          tx.description ||
          tx.merchant ||
          tx.note ||
          tx.notes ||
          tx.title ||
          tx.name ||
          tx.payee ||
          tx.details ||
          '';

    const searchTokens =
      `${commentVal} ${tx.category || 'Прочее'} ${amount} ${ruDateStr} ${isoDateStr}`.toLowerCase();

    grouped[key].items.push({
      ...tx,
      id: tx.id,
      type: isIncome ? 'Доход' : 'Расход',
      category: tx.category || 'Прочее',
      amount,
      comment: commentVal,
      description: commentVal,
      merchant: commentVal,
      title: commentVal,
      note: commentVal,
      _searchIndex: searchTokens,
      author: tx.author || null,
      excludeFromBudget: isPending ? true : !!(tx.excludeFromBudget || tx.isExcludedFromBudget),
      isPendingTransfer: isPending,
      transferStatus: tx.transferStatus || (isPending ? 'pending' : 'confirmed'),
      isBillPayment: !!tx.isBillPayment,
      billId: tx.billId || null,
      billName: tx.billName || '',
      billType:
        tx.billType || (tx.spreadMonths > 1 ? 'onetime' : tx.isBillPayment ? 'recurring' : ''),
      spreadMonths: parseInt(tx.spreadMonths, 10) || 1,
      date: isoDateStr,
      rawDate: tx.rawDate || tx.date || isoDateStr,
      formattedDate: ruDateStr,
      dayTimestamp: txDate.getTime(),
      createdAt: createdTime || txDate.getTime(),
      timestamp: txDate.getTime(),
    });
  });

  return Object.values(grouped)
    .sort((a, b) => b.id.localeCompare(a.id))
    .map(m => {
      m.items.sort((a, b) => {
        // 1. Сортировка по календарному дню (от свежих дней к прошлым)
        if (a.date !== b.date) {
          return (b.dayTimestamp || 0) - (a.dayTimestamp || 0);
        }
        // 2. В рамках одного дня: новые добавленные операции располагаются строго сверху
        const timeA = a.createdAt || a.timestamp || 0;
        const timeB = b.createdAt || b.timestamp || 0;
        if (timeA !== timeB) {
          return timeB - timeA;
        }
        return (b.id || '').localeCompare(a.id || '');
      });
      return m;
    });
}

function processCategories(cats) {
  const defaultExpense = [
    { name: 'Продукты', icon: 'shopping-cart' },
    { name: 'Кафе и рестораны', icon: 'utensils' },
    { name: 'Маркетплейсы', icon: 'shopping-bag' },
    { name: 'Транспорт', icon: 'car' },
    { name: 'Жилье', icon: 'home' },
    { name: 'Одежда', icon: 'shirt' },
    { name: 'Здоровье', icon: 'heart-pulse' },
    { name: 'Развлечения', icon: 'gamepad-2' },
    { name: 'Другое', icon: 'package' },
  ];
  const defaultIncome = [
    { name: 'Зарплата', icon: 'wallet' },
    { name: 'Возврат', icon: 'undo-2' },
    { name: 'Кэшбек', icon: 'coins' },
    { name: 'Другое', icon: 'package' },
  ];

  const expense = [...defaultExpense];
  const income = [...defaultIncome];
  (Array.isArray(cats) ? cats : []).forEach(c => {
    if (!c || !c.name) return;
    const rawIcon = c.icon && c.icon.length < 5 ? 'tag' : c.icon;
    if (c.type === 'Расход') {
      if (!expense.some(item => item && item.name === c.name))
        expense.push({ name: c.name, icon: rawIcon || 'tag' });
    } else if (c.type === 'Доход') {
      if (!income.some(item => item && item.name === c.name))
        income.push({ name: c.name, icon: rawIcon || 'tag' });
    }
  });
  return { expense, income };
}

// ==========================================
// 4. Filtering & List Rendering
// ==========================================
function toggleCustomFilterMenu(type) {
  const monthMenu = document.getElementById('menu-filter-month');
  const catMenu = document.getElementById('menu-filter-cat');

  if (type === 'month') {
    monthMenu.classList.toggle('hidden');
    catMenu.classList.add('hidden');
  } else {
    catMenu.classList.toggle('hidden');
    monthMenu.classList.add('hidden');
  }
}

function selectFilterValue(type, value, label) {
  if (type === 'month') {
    currentFilterMonth = value;
    document.getElementById('label-filter-month').textContent = label;
    document.getElementById('menu-filter-month').classList.add('hidden');
  } else {
    currentFilterCategory = value;
    document.getElementById('label-filter-cat').textContent = label;
    document.getElementById('menu-filter-cat').classList.add('hidden');
  }
  renderTransactions();
}

function toggleTxSearchBar() {
  const container = document.getElementById('tx-search-bar-container');
  const btn = document.getElementById('tx-search-toggle-btn');
  const input = document.getElementById('tx-search-input');
  if (!container) return;

  const isHidden = container.classList.contains('hidden');
  if (isHidden) {
    container.classList.remove('hidden');
    if (btn) {
      btn.classList.add('bg-[#6C5DD3]/25', 'text-[#8C7DFF]', 'border-[#6C5DD3]/50');
      btn.classList.remove('bg-gray-800', 'text-gray-400');
    }
    if (input) {
      setTimeout(() => input.focus(), 60);
    }
  } else {
    if (!currentFilterSearch) {
      container.classList.add('hidden');
      if (btn) {
        btn.classList.remove('bg-[#6C5DD3]/25', 'text-[#8C7DFF]', 'border-[#6C5DD3]/50');
        btn.classList.add('bg-gray-800', 'text-gray-400');
      }
    } else {
      clearTxSearch();
      container.classList.add('hidden');
      if (btn) {
        btn.classList.remove('bg-[#6C5DD3]/25', 'text-[#8C7DFF]', 'border-[#6C5DD3]/50');
        btn.classList.add('bg-gray-800', 'text-gray-400');
      }
    }
  }
}

function handleTxSearchInput(event) {
  const query = (event.target.value || '').trim().toLowerCase();
  currentFilterSearch = query;

  const clearBtn = document.getElementById('tx-search-clear-btn');
  if (clearBtn) {
    if (query) clearBtn.classList.remove('hidden');
    else clearBtn.classList.add('hidden');
  }

  const toggleBtn = document.getElementById('tx-search-toggle-btn');
  if (toggleBtn) {
    if (query) {
      toggleBtn.classList.add('bg-[#6C5DD3]/25', 'text-[#8C7DFF]', 'border-[#6C5DD3]/50');
      toggleBtn.classList.remove('bg-gray-800', 'text-gray-400');
    } else {
      toggleBtn.classList.remove('bg-[#6C5DD3]/25', 'text-[#8C7DFF]', 'border-[#6C5DD3]/50');
      toggleBtn.classList.add('bg-gray-800', 'text-gray-400');
    }
  }

  if (window._txSearchTimeout) clearTimeout(window._txSearchTimeout);
  window._txSearchTimeout = setTimeout(() => {
    renderTransactions();
  }, 180);
}

function clearTxSearch() {
  currentFilterSearch = '';
  const searchInput = document.getElementById('tx-search-input');
  if (searchInput) searchInput.value = '';
  const clearBtn = document.getElementById('tx-search-clear-btn');
  if (clearBtn) clearBtn.classList.add('hidden');
  const toggleBtn = document.getElementById('tx-search-toggle-btn');
  if (toggleBtn) {
    toggleBtn.classList.remove('bg-[#6C5DD3]/25', 'text-[#8C7DFF]', 'border-[#6C5DD3]/50');
    toggleBtn.classList.add('bg-gray-800', 'text-gray-400');
  }
  renderTransactions();
}

function resetAllTxFilters() {
  currentFilterSearch = '';
  const searchInput = document.getElementById('tx-search-input');
  if (searchInput) searchInput.value = '';
  const clearBtn = document.getElementById('tx-search-clear-btn');
  if (clearBtn) clearBtn.classList.add('hidden');
  const searchContainer = document.getElementById('tx-search-bar-container');
  if (searchContainer) searchContainer.classList.add('hidden');
  const toggleBtn = document.getElementById('tx-search-toggle-btn');
  if (toggleBtn) {
    toggleBtn.classList.remove('bg-[#6C5DD3]/25', 'text-[#8C7DFF]', 'border-[#6C5DD3]/50');
    toggleBtn.classList.add('bg-gray-800', 'text-gray-400');
  }

  currentFilterMonth = 'all';
  const monthLabel = document.getElementById('label-filter-month');
  if (monthLabel) monthLabel.textContent = 'Все месяцы';
  const monthMenu = document.getElementById('menu-filter-month');
  if (monthMenu) monthMenu.classList.add('hidden');

  currentFilterCategory = 'all';
  const catLabel = document.getElementById('label-filter-cat');
  if (catLabel) catLabel.textContent = 'Все категории';
  const catMenu = document.getElementById('menu-filter-cat');
  if (catMenu) catMenu.classList.add('hidden');

  renderTransactions();
}

function getLargeExpenseThresholdDetails() {
  const plan = Cache?.budgetPlan;
  const isConfigured = !!(plan && plan.isConfigured === true);
  if (isConfigured) {
    const monthlyLimit = parseFloat(plan?.monthlyVariableLimit) || 0;
    if (monthlyLimit > 0) {
      const weeklyBaseLimit = monthlyLimit / 4.33;
      if (weeklyBaseLimit > 0) {
        const val = Math.round((weeklyBaseLimit * 2) / 3);
        return {
          threshold: val,
          isDynamic: true,
          reason: 'порог бюджета (~65% недели)',
        };
      }
    }
    const monthlyIncome = parseFloat(plan?.monthlyIncome) || 0;
    if (monthlyIncome > 0) {
      const val = Math.round((monthlyIncome / 4.33) * 0.5);
      return {
        threshold: val,
        isDynamic: true,
        reason: 'порог дохода (~50% недели)',
      };
    }
  }
  return {
    threshold: 10000,
    isDynamic: false,
    reason: 'базовый порог (до настройки плана)',
  };
}
window.getLargeExpenseThresholdDetails = getLargeExpenseThresholdDetails;

function getLargeExpenseThreshold() {
  return getLargeExpenseThresholdDetails().threshold;
}

let _txInfiniteObserver = null;
let _txPendingDayGroups = [];
let _txRenderedDayCount = 0;
const TX_DAYS_PER_CHUNK = 8;

function renderTxRowHtml(tx, largeThreshold, hasDynamicThreshold) {
  const isExp = tx.type === 'Расход';
  const isOneTime =
    tx.billType === 'onetime' ||
    !!tx.fundingGoalId ||
    (!tx.isBillPayment && !!tx.excludeFromBudget);
  const isBill = !isOneTime && (!!tx.isBillPayment || (!!tx.billId && tx.billType !== 'onetime'));
  const isAmortized = isOneTime && !!tx.excludeFromBudget;
  const goalObj = tx.fundingGoalId
    ? (Cache?.goals || []).find(g => g.id === tx.fundingGoalId)
    : null;
  const goalTitle = tx.fundingGoalName || (goalObj ? goalObj.name || goalObj.title : '') || '';

  let isTxMonthTracked = true;
  const pDate = typeof parseAnyDate === 'function' ? parseAnyDate(tx.date) : new Date(tx.date);
  if (pDate && !isNaN(pDate.getTime())) {
    const txMDate = new Date(pDate.getFullYear(), pDate.getMonth(), 1);
    if (Cache?.budgetPlan?.isConfigured) {
      const startMDate =
        typeof getBudgetStartMonthDate === 'function' ? getBudgetStartMonthDate() : null;
      if (startMDate && txMDate.getTime() < startMDate.getTime()) {
        isTxMonthTracked = false;
      } else if (
        typeof isBudgetMonthClosed === 'function' &&
        isBudgetMonthClosed(pDate.getFullYear(), pDate.getMonth())
      ) {
        isTxMonthTracked = false;
      }
    } else {
      const today = new Date();
      const currentMDate = new Date(today.getFullYear(), today.getMonth(), 1);
      if (txMDate.getTime() !== currentMDate.getTime()) {
        isTxMonthTracked = false;
      }
    }
  }

  const isPending = !!(tx.isPendingTransfer || tx.transferStatus === 'pending');
  const isLarge =
    isExp &&
    !isAmortized &&
    !isBill &&
    !isPending &&
    hasDynamicThreshold &&
    isTxMonthTracked &&
    parseFloat(tx.amount) >= largeThreshold;

  let badgeHtml = '';
  if (isPending) {
    badgeHtml = `
      <span class="h-5 px-1.5 rounded-md bg-[#6C5DD3]/20 text-[#A594FD] border border-[#6C5DD3]/30 text-[10px] font-bold flex items-center gap-1 flex-shrink-0 leading-none select-none">
        <i data-lucide="arrow-left-right" class="w-2.5 h-2.5"></i>Перевод
      </span>
    `;
  } else if (isBill) {
    badgeHtml = `
      <span class="h-5 px-1.5 rounded-md bg-[#6C5DD3]/15 text-[#a594fd] border border-[#6C5DD3]/25 text-[10px] font-medium flex items-center gap-1 flex-shrink-0 leading-none select-none" title="Ежемесячный счет: ${escapeHtml(tx.billName || 'Счет')}">
        <i data-lucide="calendar" class="w-2.5 h-2.5"></i>Счет
      </span>
    `;
  } else if (isAmortized) {
    badgeHtml = `
      <span class="h-5 px-1.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/25 text-[10px] font-medium flex items-center gap-1 flex-shrink-0 leading-none select-none" title="Разовая трата${goalTitle ? ' (списано из цели: ' + escapeHtml(goalTitle) + ')' : ''}">
        <i data-lucide="sparkles" class="w-2.5 h-2.5 text-amber-400"></i>Разовая
      </span>
    `;
  } else if (isLarge) {
    badgeHtml = `
      <span class="h-5 px-1.5 rounded-md bg-violet-500/15 text-violet-300 border border-violet-500/25 flex items-center justify-center flex-shrink-0 leading-none shadow-sm select-none" title="Крупная трата (от ${formatMoney(largeThreshold)})">
        <i data-lucide="gem" class="w-3 h-3 stroke-[2]"></i>
      </span>
    `;
  }

  const isTxTabVisible = !document.getElementById('transactions-tab')?.classList.contains('hidden');
  const isFresh = Date.now() - (window.lastAddedTxTime || 0) < 1800;
  const isJustAdded =
    isTxTabVisible && isFresh && window.lastAddedTxIds && window.lastAddedTxIds.includes(tx.id);

  const catArr = isExp ? Cache.categories?.expense || [] : Cache.categories?.income || [];
  const catInfo = catArr.find(c => c.name === tx.category);
  let iconStr = catInfo && catInfo.icon ? catInfo.icon : 'tag';
  let iconBg = isExp
    ? 'bg-[#212430] text-[#9EA7B3] border border-[rgba(255,255,255,0.04)]'
    : 'bg-[#30D158]/10 text-[#30D158] border border-[#30D158]/20';

  if (isPending) {
    iconStr = 'arrow-left-right';
    iconBg = 'bg-[#6C5DD3]/20 text-[#A594FD] border border-[#6C5DD3]/30';
  }

  const rawComment =
    typeof getTxComment === 'function'
      ? getTxComment(tx)
      : (
          tx.comment ||
          tx.description ||
          tx.merchant ||
          tx.title ||
          tx.name ||
          tx.note ||
          tx.notes ||
          tx.payee ||
          tx.details ||
          ''
        ).trim();
  const hasComment = Boolean(rawComment && rawComment !== 'undefined' && rawComment !== 'null');
  const cleanedTitle =
    hasComment && typeof cleanMerchantTitle === 'function'
      ? cleanMerchantTitle(rawComment)
      : rawComment;
  const mainTitle =
    hasComment && cleanedTitle
      ? cleanedTitle
      : hasComment
        ? rawComment
        : tx.category || (isExp ? 'Расход' : 'Доход');
  const subCategory = hasComment ? tx.category || '' : '';

  const isFamilyConnected = !!(
    Cache?.family?.id ||
    (Cache?.family?.members && Cache.family.members.length > 1)
  );
  let authorBadgeHtml = '';

  if (isFamilyConnected) {
    let authorInfo = null;
    const familyMembers = Cache?.family?.members || [];

    if (tx.author && (tx.author.avatarId || tx.author.uid)) {
      const matched = tx.author.uid ? familyMembers.find(m => m.uid === tx.author.uid) : null;
      authorInfo = {
        name: matched?.name || tx.author.name || 'Член семьи',
        avatarId: matched?.avatarId || tx.author.avatarId || 'user',
      };
    } else if (tx.authorUid || tx.userId) {
      const uid = tx.authorUid || tx.userId;
      const matched = familyMembers.find(m => m.uid === uid);
      if (matched) {
        authorInfo = { name: matched.name, avatarId: matched.avatarId };
      }
    }

    if (!authorInfo && familyMembers.length > 0) {
      const owner =
        familyMembers.find(m => m.role === 'owner' || m.uid === Cache.family.ownerUid) ||
        familyMembers[0];
      if (owner) {
        authorInfo = { name: owner.name, avatarId: owner.avatarId };
      }
    }

    if (authorInfo) {
      const authorPreset = (window.AVATAR_PRESETS && window.AVATAR_PRESETS[authorInfo.avatarId]) ||
        window.AVATAR_PRESETS?.user || { bg: 'bg-[#6C5DD3]', icon: 'user' };
      authorBadgeHtml = `
        <div class="tx-author-badge absolute top-2 right-2.5 flex items-center justify-center w-[18px] h-[18px] rounded-full ${authorPreset.bg} text-white ring-2 ring-[#181B24] shadow-sm select-none pointer-events-none z-10" title="Добавил(а): ${escapeHtml(authorInfo.name)}">
          <i data-lucide="${authorPreset.icon}" class="w-2.5 h-2.5 stroke-[2.5]"></i>
        </div>
      `;
    }
  }

  return `
    <div class="card cursor-pointer w-full py-[13px] px-4 relative flex items-center justify-between ${authorBadgeHtml ? 'tx-has-author' : ''} ${isJustAdded ? 'tx-row-new' : ''} ${isPending ? 'border border-[#6C5DD3]/25 bg-[#171926]/90' : ''}"
         data-id="${tx.id}"
         data-table="Transactions"
         onclick="openTxContextMenu(event, '${tx.id}')">
      
      <input type="checkbox" class="select-checkbox hidden" data-id="${tx.id}">
      ${authorBadgeHtml}

      <div class="flex items-center gap-3.5 min-w-0 flex-1 mr-2">
         <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}">
            <i data-lucide="${iconStr}" class="w-[22px] h-[22px] stroke-[1.75px]"></i>
         </div>
         <div class="min-w-0 flex flex-col justify-center flex-1">
           <span class="text-[15px] font-semibold text-gray-200 truncate leading-snug">${escapeHtml(mainTitle)}</span>
           ${
             isPending
               ? `
             <div class="flex items-center gap-1.5 mt-1" onclick="event.stopPropagation()">
               <button type="button" 
                       onclick="confirmPendingTransfer('${tx.id}', event)" 
                       class="px-2 py-0.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 active:scale-95 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold flex items-center gap-1 transition-all shadow-sm cursor-pointer" 
                       title="Учесть в бюджете">
                 <i data-lucide="check" class="w-3 h-3 stroke-[2.5]"></i>
                 <span>Учесть</span>
               </button>
               <button type="button" 
                       onclick="dismissPendingTransfer('${tx.id}', event)" 
                       class="px-2 py-0.5 rounded-lg bg-white/5 hover:bg-red-500/20 active:scale-95 text-gray-400 hover:text-red-300 border border-white/10 hover:border-red-500/30 text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer" 
                       title="Удалить (перевод себе / не учитывать)">
                 <i data-lucide="trash-2" class="w-3 h-3"></i>
                 <span>Удалить</span>
               </button>
             </div>
           `
               : subCategory
                 ? `<span class="text-[12px] text-[#848D99] truncate leading-tight">${escapeHtml(subCategory)}</span>`
                 : ''
           }
         </div>
      </div>

      <div class="tx-row-right flex items-center gap-2 flex-shrink-0 ml-2">
        ${badgeHtml}
        ${
          isPending
            ? `
          <div class="tx-amount text-right flex flex-col items-end flex-shrink-0">
            <span class="font-bold text-gray-200 text-[15px]">
              ${window.isPrivacyModeEnabled ? '•••• ₽' : (isExp ? '-' : '+') + formatMoney(tx.amount)}
            </span>
            <span class="text-[9.5px] font-semibold text-[#A594FD] bg-[#6C5DD3]/20 border border-[#6C5DD3]/30 px-1.5 py-0.2 rounded-md mt-0.5">Ожидает</span>
          </div>
        `
            : `
          <div class="tx-amount text-right font-medium ${isExp ? 'text-gray-200' : 'text-[#30D158]'} text-[16px] whitespace-nowrap">
            ${window.isPrivacyModeEnabled ? '•••• ₽' : (isExp ? '-' : '+') + formatMoney(tx.amount)}
          </div>
        `
        }
      </div>
    </div>
  `;
}

function appendTxChunk() {
  const listEl = document.getElementById('transactions-list');
  if (!listEl || !_txPendingDayGroups || _txPendingDayGroups.length === 0) {
    const sentinel = document.getElementById('tx-infinite-sentinel');
    if (sentinel) sentinel.remove();
    return;
  }

  const nextGroups = _txPendingDayGroups.slice(
    _txRenderedDayCount,
    _txRenderedDayCount + TX_DAYS_PER_CHUNK
  );
  if (nextGroups.length === 0) {
    const sentinel = document.getElementById('tx-infinite-sentinel');
    if (sentinel) sentinel.remove();
    return;
  }

  _txRenderedDayCount += nextGroups.length;

  const largeThreshold = getLargeExpenseThreshold();
  const hasDynamicThreshold = isFinite(largeThreshold) && largeThreshold > 0;

  const getRelativeDayName = dateStr => {
    const d = new Date(dateStr.split('.').reverse().join('-'));
    const tday = new Date();
    tday.setHours(0, 0, 0, 0);
    const yday = new Date(tday);
    yday.setDate(tday.getDate() - 1);

    if (d.getTime() === tday.getTime()) return 'Сегодня';
    if (d.getTime() === yday.getTime()) return 'Вчера';
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  };

  const chunkHtml = nextGroups
    .map(
      group => `
    <div class="mb-5 tx-day-group">
      <h3 class="font-semibold text-[#848D99] text-[13px] mb-2 px-1 tracking-wide">${getRelativeDayName(group.day)}</h3>
      <div class="bg-[#181B24] border border-[rgba(255,255,255,0.06)] rounded-2xl overflow-hidden divide-y divide-[rgba(255,255,255,0.03)] shadow-sm">
        ${group.items.map(tx => renderTxRowHtml(tx, largeThreshold, hasDynamicThreshold)).join('')}
      </div>
    </div>
  `
    )
    .join('');

  // Удаляем старый sentinel перед добавлением новых элементов
  const oldSentinel = document.getElementById('tx-infinite-sentinel');
  if (oldSentinel) oldSentinel.remove();

  const tempWrapper = document.createElement('div');
  tempWrapper.innerHTML = chunkHtml;

  const insertedNodes = [];
  while (tempWrapper.firstChild) {
    const child = tempWrapper.firstChild;
    listEl.appendChild(child);
    if (child.nodeType === 1) insertedNodes.push(child);
  }

  // Создаем иконки строго внутри вновь добавленного блока, не трогая весь документ!
  if (typeof lucide !== 'undefined') {
    insertedNodes.forEach(node => {
      lucide.createIcons({ root: node });
    });
  }

  // Если остались еще группы, вешаем сторож (sentinel) для плавной догрузки при скролле
  if (_txRenderedDayCount < _txPendingDayGroups.length) {
    const sentinel = document.createElement('div');
    sentinel.id = 'tx-infinite-sentinel';
    sentinel.className = 'py-4 flex items-center justify-center text-xs text-gray-500 min-h-[36px]';
    listEl.appendChild(sentinel);

    if (!_txInfiniteObserver) {
      _txInfiniteObserver = new IntersectionObserver(
        entries => {
          if (entries[0] && entries[0].isIntersecting) {
            appendTxChunk();
          }
        },
        { rootMargin: '400px 0px' }
      );
    }
    _txInfiniteObserver.disconnect();
    _txInfiniteObserver.observe(sentinel);
  }
}

function togglePendingTransfersFilter() {
  currentFilterPendingOnly = !currentFilterPendingOnly;
  renderTransactions();
}
window.togglePendingTransfersFilter = togglePendingTransfersFilter;

async function confirmPendingTransfer(txId, event) {
  if (event) event.stopPropagation();
  if (!txId) return;

  const allFlat =
    typeof getAllCachedTransactionsFlat === 'function' ? getAllCachedTransactionsFlat() : [];
  const tx = allFlat.find(t => t.id === txId);
  if (!tx) return;

  tx.isPendingTransfer = false;
  tx.transferStatus = 'confirmed';
  tx.excludeFromBudget = false;

  if (typeof processTransactions === 'function') {
    Cache.transactions = processTransactions(allFlat);
  }

  // Запуск анимации расхода
  if (tx.type === 'Расход') {
    if (typeof triggerBudgetExpenseAnimation === 'function') {
      triggerBudgetExpenseAnimation();
    } else {
      window._budgetNeedsExpenseAnimation = true;
      window._budgetTabDirty = true;
    }
  }

  if (typeof markTabsDirty === 'function') markTabsDirty();
  if (typeof renderBudgetTab === 'function') renderBudgetTab();
  if (typeof renderTransactions === 'function') renderTransactions();

  if (typeof syncWidgetData === 'function') syncWidgetData();
  if (typeof showToast === 'function') showToast('Перевод подтвержден и учтен в бюджете');

  // Фоновое обновление в Firestore
  try {
    if (typeof getUserCol === 'function') {
      await getUserCol('Transactions').doc(txId).update({
        isPendingTransfer: false,
        transferStatus: 'confirmed',
        excludeFromBudget: false,
        updatedAt: Date.now(),
      });
    }
  } catch (err) {
    console.warn('Ошибка обновления статуса перевода:', err);
  }
}
window.confirmPendingTransfer = confirmPendingTransfer;

async function dismissPendingTransfer(txId, event) {
  if (event) event.stopPropagation();
  if (!txId) return;

  const allFlat =
    typeof getAllCachedTransactionsFlat === 'function' ? getAllCachedTransactionsFlat() : [];
  const idx = allFlat.findIndex(t => t.id === txId);
  if (idx !== -1) {
    allFlat.splice(idx, 1);
  }

  if (typeof processTransactions === 'function') {
    Cache.transactions = processTransactions(allFlat);
  }

  if (typeof markTabsDirty === 'function') markTabsDirty();
  if (typeof renderBudgetTab === 'function') renderBudgetTab();
  if (typeof renderTransactions === 'function') renderTransactions();

  if (typeof showToast === 'function') showToast('Перевод удален');

  // Фоновое удаление из Firestore
  try {
    if (typeof getUserCol === 'function') {
      await getUserCol('Transactions').doc(txId).delete();
    }
  } catch (err) {
    console.warn('Ошибка удаления перевода:', err);
  }
}
window.dismissPendingTransfer = dismissPendingTransfer;

async function dismissPendingTransferSilent(txId) {
  if (!txId) return;
  const allFlat =
    typeof getAllCachedTransactionsFlat === 'function' ? getAllCachedTransactionsFlat() : [];
  const idx = allFlat.findIndex(t => t.id === txId);
  if (idx !== -1) {
    allFlat.splice(idx, 1);
  }
  if (typeof processTransactions === 'function') {
    Cache.transactions = processTransactions(allFlat);
  }
  if (typeof markTabsDirty === 'function') markTabsDirty();
  if (typeof renderBudgetTab === 'function') renderBudgetTab();
  if (typeof renderTransactions === 'function') renderTransactions();
  try {
    if (typeof getUserCol === 'function') {
      await getUserCol('Transactions').doc(txId).delete();
    }
  } catch (_err) {
    /* ignore */
  }
}
window.dismissPendingTransferSilent = dismissPendingTransferSilent;

function renderTransactions() {
  const data = Cache.transactions || [];
  const isTotallyEmpty = data.length === 0;

  // Подсчет количества неподтвержденных переводов
  const allFlat =
    typeof getAllCachedTransactionsFlat === 'function' ? getAllCachedTransactionsFlat() : [];
  const pendingTransfers = allFlat.filter(
    t => t.isPendingTransfer || t.transferStatus === 'pending'
  );
  const pendingCount = pendingTransfers.length;

  const pendingBannerEl = document.getElementById('tx-pending-transfers-banner');
  const pendingBadgeEl = document.getElementById('tx-pending-count-badge');
  const pendingFilterBtnText = document.getElementById('tx-pending-filter-btn-text');

  if (pendingCount === 0) {
    currentFilterPendingOnly = false;
  }

  if (pendingBannerEl) {
    if (pendingCount > 0) {
      pendingBannerEl.classList.remove('hidden');
      if (pendingBadgeEl) pendingBadgeEl.textContent = String(pendingCount);
      if (pendingFilterBtnText) {
        pendingFilterBtnText.textContent = currentFilterPendingOnly ? 'Все операции' : 'Показать';
      }
    } else {
      pendingBannerEl.classList.add('hidden');
    }
  }

  const topActionsEl = document.getElementById('tx-top-actions');
  const filterBarEl = document.getElementById('tx-filter-bar');
  const searchBarContainerEl = document.getElementById('tx-search-bar-container');

  if (topActionsEl) {
    if (isTotallyEmpty) topActionsEl.classList.add('hidden');
    else topActionsEl.classList.remove('hidden');
  }
  if (filterBarEl) {
    if (isTotallyEmpty) filterBarEl.classList.add('hidden');
    else filterBarEl.classList.remove('hidden');
  }
  if (searchBarContainerEl && isTotallyEmpty) {
    searchBarContainerEl.classList.add('hidden');
  }

  const monthMenu = document.getElementById('menu-filter-month');
  if (monthMenu && data.length > 0) {
    let mHtml = `
      <button type="button" onclick="selectFilterValue('month', 'all', 'Все месяцы')" class="custom-dropdown-item ${currentFilterMonth === 'all' ? 'is-active' : ''}">
        Все месяцы
      </button>
    `;
    data.forEach(m => {
      const active = currentFilterMonth === m.id;
      mHtml += `
        <button type="button" onclick="selectFilterValue('month', '${m.id}', '${escapeHtml(m.label)}')" class="custom-dropdown-item ${active ? 'is-active' : ''}">
          ${escapeHtml(m.label)}
        </button>
      `;
    });
    monthMenu.innerHTML = mHtml;
  }

  const catMenu = document.getElementById('menu-filter-cat');
  if (catMenu && Cache.categories) {
    const allCats = [
      ...Cache.categories.expense.map(c => ({ name: c.name, icon: c.icon || 'tag' })),
      ...Cache.categories.income.map(c => ({ name: c.name, icon: c.icon || 'tag' })),
    ];
    const map = new Map();
    allCats.forEach(c => {
      if (!map.has(c.name)) map.set(c.name, c.icon);
    });

    let cHtml = `
      <button type="button" onclick="selectFilterValue('cat', 'all', 'Все категории')" class="custom-dropdown-item ${currentFilterCategory === 'all' ? 'is-active' : ''}">
        Все категории
      </button>
    `;
    Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([name, icon]) => {
        const active = currentFilterCategory === name;
        cHtml += `
        <button type="button" onclick="selectFilterValue('cat', '${escapeHtml(name)}', '${escapeHtml(name)}')" class="custom-dropdown-item ${active ? 'is-active' : ''}">
          <i data-lucide="${icon}" class="w-4 h-4 flex-shrink-0"></i>
          <span class="truncate">${escapeHtml(name)}</span>
        </button>
      `;
      });
    catMenu.innerHTML = cHtml;
    if (typeof lucide !== 'undefined') {
      lucide.createIcons({ root: catMenu });
    }
  }

  const filteredMonths = data
    .map(m => {
      if (currentFilterMonth !== 'all' && m.id !== currentFilterMonth) return null;

      let items = m.items;
      if (currentFilterPendingOnly) {
        items = items.filter(tx => tx.isPendingTransfer || tx.transferStatus === 'pending');
      }
      if (currentFilterCategory !== 'all') {
        items = items.filter(tx => tx.category === currentFilterCategory);
      }
      if (currentFilterSearch) {
        items = items.filter(tx => {
          if (tx._searchIndex) return tx._searchIndex.includes(currentFilterSearch);
          const comment = (tx.comment || '').toLowerCase();
          const cat = (tx.category || '').toLowerCase();
          const amountStr = String(tx.amount || '');
          const dateStr = (tx.date || '').toLowerCase();
          return (
            comment.includes(currentFilterSearch) ||
            cat.includes(currentFilterSearch) ||
            amountStr.includes(currentFilterSearch) ||
            dateStr.includes(currentFilterSearch)
          );
        });
      }

      if (items.length === 0) return null;

      const expense = items
        .filter(i => i.type === 'Расход' && !i.isPendingTransfer)
        .reduce((sum, i) => sum + i.amount, 0);
      const income = items
        .filter(i => i.type === 'Доход' && !i.isPendingTransfer)
        .reduce((sum, i) => sum + i.amount, 0);

      return { ...m, items, expense, income };
    })
    .filter(Boolean);

  let periodText = 'Тек. мес';
  if (currentFilterMonth === 'all') {
    periodText = 'Все время';
  } else {
    const selectedMonthObj = data.find(m => m.id === currentFilterMonth);
    if (selectedMonthObj) periodText = selectedMonthObj.label;
  }
  if (currentFilterCategory !== 'all') {
    periodText += ` • ${currentFilterCategory}`;
  }
  if (currentFilterSearch) {
    periodText += ` • Поиск: «${currentFilterSearch}»`;
  }

  const expLabel = document.getElementById('month-expense-label');
  const incLabel = document.getElementById('month-income-label');
  if (expLabel) expLabel.innerText = `Расходы (${periodText})`;
  if (incLabel) incLabel.innerText = `Доходы (${periodText})`;

  const totalExp = filteredMonths.reduce((a, b) => a + b.expense, 0);
  const totalInc = filteredMonths.reduce((a, b) => a + b.income, 0);
  const expEl = document.getElementById('month-expense');
  const incEl = document.getElementById('month-income');
  if (expEl) {
    if (typeof animateNumber === 'function') animateNumber(expEl, totalExp);
    else expEl.innerText = formatMoney(totalExp);
  }
  if (incEl) {
    if (typeof animateNumber === 'function') animateNumber(incEl, totalInc);
    else incEl.innerText = formatMoney(totalInc);
  }

  const listEl = document.getElementById('transactions-list');
  if (!listEl) return;

  if (_txInfiniteObserver) {
    _txInfiniteObserver.disconnect();
  }

  if (filteredMonths.length === 0) {
    const isTotallyEmpty = data.length === 0;
    if (isTotallyEmpty) {
      listEl.innerHTML = `
        <div class="card rounded-2xl p-6 text-center flex flex-col items-center justify-center gap-3 mt-4 border border-[rgba(255,255,255,0.06)] bg-[#181B24]">
          <div class="w-12 h-12 rounded-2xl bg-[#6C5DD3]/15 text-[#8C7DFF] flex items-center justify-center">
            <i data-lucide="receipt" class="w-6 h-6"></i>
          </div>
          <div>
            <p class="text-sm font-semibold text-gray-200">Операций пока нет</p>
            <p class="text-xs text-[#848D99] mt-1 max-w-[280px]">Внесите свои первые расходы или доходы вручную, либо загрузите банковскую выписку</p>
          </div>
          <div class="flex flex-col sm:flex-row gap-2 mt-2 w-full max-w-xs">
            <button type="button" onclick="toggleForm('tx-form-container', 'tx-submit-btn', 'Сохранить', 'tx-form', 'tx')" class="flex-1 py-2.5 px-4 rounded-xl bg-[#6C5DD3] hover:bg-[#5b4ec2] text-white text-xs font-semibold transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5">
              <i data-lucide="plus" class="w-3.5 h-3.5"></i>
              <span>Добавить операцию</span>
            </button>
            <button type="button" onclick="openPdfInfoModal()" class="py-2.5 px-4 rounded-xl bg-[#212430] hover:bg-[#2A2D3C] text-gray-300 text-xs font-semibold transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 border border-[rgba(255,255,255,0.06)]">
              <i data-lucide="file-up" class="w-3.5 h-3.5 text-[#8C7DFF]"></i>
              <span>Импорт PDF</span>
            </button>
          </div>
        </div>
      `;
    } else {
      listEl.innerHTML = `
        <div class="card rounded-2xl p-6 text-center flex flex-col items-center justify-center gap-3 mt-4 border border-[rgba(255,255,255,0.06)] bg-[#181B24]">
          <div class="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
            <i data-lucide="search-x" class="w-6 h-6"></i>
          </div>
          <div>
            <p class="text-sm font-semibold text-gray-200">Ничего не найдено</p>
            <p class="text-xs text-[#848D99] mt-1 max-w-[280px]">По выбранным фильтрам и поисковому запросу нет подходящих операций</p>
          </div>
          <button type="button" onclick="resetAllTxFilters()" class="mt-1 px-4 py-2 rounded-xl bg-[#212430] hover:bg-[#2A2D3C] text-[#8C7DFF] hover:text-white text-xs font-semibold transition-all active:scale-95 cursor-pointer border border-[rgba(255,255,255,0.08)] flex items-center gap-1.5">
            <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i>
            <span>Сбросить фильтры и поиск</span>
          </button>
        </div>
      `;
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  // Формируем плоский массив групп по дням для мгновенной постраничной отрисовки
  _txPendingDayGroups = [];
  _txRenderedDayCount = 0;

  filteredMonths.forEach(month => {
    const daysObj = {};
    month.items.forEach(tx => {
      if (!daysObj[tx.formattedDate]) daysObj[tx.formattedDate] = [];
      daysObj[tx.formattedDate].push(tx);
    });

    Object.keys(daysObj).forEach(day => {
      _txPendingDayGroups.push({
        day,
        monthId: month.id,
        items: daysObj[day],
      });
    });
  });

  listEl.innerHTML = '';
  appendTxChunk();

  if (window.lastAddedTxIds) {
    setTimeout(() => {
      document.querySelectorAll('.tx-row-new').forEach(el => el.classList.remove('tx-row-new'));
      window.lastAddedTxIds = null;
    }, 1250);
  }
}

// ==========================================
// 6. Global Event Listeners (Фильтры и модалки)
// ==========================================
document.addEventListener('click', e => {
  const target = e?.target?.nodeType === 3 ? e.target.parentElement : e?.target;
  if (!target || typeof target.closest !== 'function') return;

  if (!target.closest('#wrap-filter-month') && !target.closest('#wrap-filter-cat')) {
    const mm = document.getElementById('menu-filter-month');
    const cm = document.getElementById('menu-filter-cat');
    if (mm) mm.classList.add('hidden');
    if (cm) cm.classList.add('hidden');
  }
  if (!target.closest('.custom-dropdown-wrap')) {
    document.querySelectorAll('.tx-category-menu').forEach(m => m.classList.add('hidden'));
    document.querySelectorAll('.tx-goal-menu').forEach(m => m.classList.add('hidden'));
    document.querySelectorAll('.custom-dropdown-menu').forEach(m => m.classList.add('hidden'));
    document.querySelectorAll('.tx-item').forEach(r => (r.style.zIndex = ''));
  }
});

// ==========================================
// 7. Global Scope Exports
// ==========================================
window.processTransactions = processTransactions;
window.processCategories = processCategories;
window.filterTransactionsByRange = filterTransactionsByRange;
window.renderTransactions = renderTransactions;
window.renderTxRowHtml = renderTxRowHtml;
window.toggleTxItemSelection = toggleTxItemSelection;
window.toggleSelectAllTransactions = toggleSelectAllTransactions;
window.deleteSelectedTransactions = deleteSelectedTransactions;
window.openBatchCategoryModal = openBatchCategoryModal;
window.closeBatchCategoryModal = closeBatchCategoryModal;
window.applyBatchCategory = applyBatchCategory;
window.toggleCustomFilterMenu = toggleCustomFilterMenu;
window.selectFilterValue = selectFilterValue;
window.resetTransactionsFilters = resetTransactionsFilters;
window.dismissPendingTransferSilent = dismissPendingTransferSilent;
window.loadMoreTransactions = loadMoreTransactions;
window.toggleTxSearchBar = toggleTxSearchBar;
window.handleTxSearchInput = handleTxSearchInput;
window.resetAllTxFilters = resetAllTxFilters;
