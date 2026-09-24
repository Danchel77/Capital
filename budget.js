// ==========================================
// Variables & State
// ==========================================
let currentWizardStep = 1;
let currentWizSelectedDay = null;
let wizardActiveIncomeSources = new Set();
let wizardCustomCategories = new Set();
let activeTopupGoalId = null;
let activeEditCategory = null;
let currentTopupMode = 'topup';
let wizGoalIcon = null;

// Состояние навигации по месяцам бюджета
let selectedBudgetYear = null;
let selectedBudgetMonth = null;
let activeMonthCloseData = null;

function getSelectedBudgetDate() {
  const today = new Date();
  if (selectedBudgetYear === null || selectedBudgetMonth === null) {
    selectedBudgetYear = today.getFullYear();
    selectedBudgetMonth = today.getMonth();
  }
  return new Date(selectedBudgetYear, selectedBudgetMonth, 1);
}

function getBudgetStartMonthDate() {
  const plan = Cache?.budgetPlan || {};
  if (plan.startMonth) {
    const parts = String(plan.startMonth).split('-');
    if (parts.length === 2) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      if (!isNaN(y) && !isNaN(m)) return new Date(y, m, 1);
    }
  }
  if (plan.createdAt) {
    const d = new Date(plan.createdAt);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), 1);
}

function getBudgetMaxMonthDate() {
  const today = new Date();
  const currentMonthDate = new Date(today.getFullYear(), today.getMonth(), 1);
  const plan = Cache?.budgetPlan || {};
  const closedMonths = plan.closedMonths || {};
  const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  
  // Если текущий месяц уже закрыт — разрешаем перейти на следующий вперед
  if (closedMonths[currentMonthKey]) {
    return new Date(today.getFullYear(), today.getMonth() + 1, 1);
  }
  return currentMonthDate;
}

function isBudgetMonthClosed(year, month) {
  const plan = Cache?.budgetPlan || {};
  const closedMonths = plan.closedMonths || {};
  const key = `${year}-${String(month + 1).padStart(2, '0')}`;
  return !!closedMonths[key];
}

function navigateBudgetMonth(delta) {
  const currentTarget = getSelectedBudgetDate();
  const minDate = getBudgetStartMonthDate();
  const maxDate = getBudgetMaxMonthDate();

  const newTarget = new Date(currentTarget.getFullYear(), currentTarget.getMonth() + delta, 1);

  if (newTarget.getTime() < minDate.getTime()) {
    showToast('Нельзя переключиться на месяц до начала создания плана бюджета');
    return;
  }
  if (newTarget.getTime() > maxDate.getTime()) {
    showToast('Нельзя переключиться на месяц позже текущего');
    return;
  }

  selectedBudgetYear = newTarget.getFullYear();
  selectedBudgetMonth = newTarget.getMonth();

  renderBudgetTab();
}

// ==========================================
// 1. Budget Dashboard (Дашборд Бюджета)
// ==========================================
function renderBudgetTab() {
  if (!Cache || !Cache.isInitialDataLoaded) return;

  const plan = Cache.budgetPlan || {};
  const wizardEl = document.getElementById('budget-wizard');
  const dashboardEl = document.getElementById('budget-dashboard');

  // Если бюджет еще не настроен:
  // Если синхронизация с сервером еще идет (например, прочитан только пустой локальный кэш),
  // не показываем мастер создания преждевременно, чтобы не пугать пользователя.
  if (!plan.isConfigured) {
    if (!Cache.isServerSyncComplete) {
      return;
    }
    if (wizardEl) wizardEl.classList.remove('hidden');
    if (dashboardEl) dashboardEl.classList.add('hidden');
    initBudgetWizard(false);
    return;
  }

  // Бюджет настроен — показываем дашборд
  if (wizardEl) wizardEl.classList.add('hidden');
  if (dashboardEl) dashboardEl.classList.remove('hidden');

  const bills = Cache.calendarBills || [];
  const goals = Cache.goals || [];
  const today = new Date();
  const targetDate = getSelectedBudgetDate();
  const targetYear = targetDate.getFullYear();
  const targetMonth = targetDate.getMonth();
  const isCurrentCalendarMonth = (targetYear === today.getFullYear() && targetMonth === today.getMonth());

  // Проверка граничных месяцев для скрытия стрелок навигации
  const minDate = getBudgetStartMonthDate();
  const maxDate = getBudgetMaxMonthDate();
  const prevBtn = document.getElementById('budget-prev-month-btn');
  const nextBtn = document.getElementById('budget-next-month-btn');
  const hasPrev = targetDate.getTime() > minDate.getTime();
  const hasNext = targetDate.getTime() < maxDate.getTime();
  if (prevBtn) {
    prevBtn.classList.toggle('hidden', !hasPrev);
    prevBtn.disabled = !hasPrev;
  }
  if (nextBtn) {
    nextBtn.classList.toggle('hidden', !hasNext);
    nextBtn.disabled = !hasNext;
  }

  // Актуализация выбранного месяца в шапке
  const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const monthLabel = document.getElementById('budget-month-label');
  if (monthLabel) {
    monthLabel.innerText = `${monthNames[targetMonth]} ${targetYear}`;
  }

  // Бейдж статуса месяца (Закрыт / Ожидает закрытия / Текущий)
  const statusBadge = document.getElementById('budget-month-status-badge');
  const isClosed = isBudgetMonthClosed(targetYear, targetMonth);
  if (statusBadge) {
    if (isClosed) {
      statusBadge.className = 'text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 inline-block';
      statusBadge.innerText = 'Закрыт';
      statusBadge.classList.remove('hidden');
    } else if (!isCurrentCalendarMonth && targetDate.getTime() < new Date(today.getFullYear(), today.getMonth(), 1).getTime()) {
      statusBadge.className = 'text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25 inline-block';
      statusBadge.innerText = 'Ожидает закрытия';
      statusBadge.classList.remove('hidden');
    } else {
      statusBadge.classList.add('hidden');
    }
  }

  // Точный расчет недели (Пн-Вс) для текущего месяца
  const dayOfWeek = today.getDay();
  const diffToMonday = (dayOfWeek + 6) % 7;
  const startOfWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() - diffToMonday, 0, 0, 0, 0);
  const endOfWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() - diffToMonday + 6, 23, 59, 59, 999);

  // Точный расчет выбранного месяца (с 1 по последний день)
  const startOfMonth = new Date(targetYear, targetMonth, 1, 0, 0, 0, 0);
  const endOfMonth = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);

  // Собираем ВСЕ расходные операции по всем месяцам из кэша (исключая распределенные в календаре разовые траты)
  const allExpenseTxs = [];
  (Cache.transactions || []).forEach(m => {
    (m.items || []).forEach(tx => {
      const isExpense = tx.type === 'Расход' || tx.type === 'expense' || String(tx.type || '').trim().toLowerCase() === 'расход';
      const isExcluded = !!(tx.excludeFromBudget || tx.isExcludedFromBudget);
      if (isExpense && !isExcluded) {
        allExpenseTxs.push(tx);
      }
    });
  });

  let weeklySpent = 0;
  let monthlySpent = 0;
  const currentMonthItems = [];

  allExpenseTxs.forEach(tx => {
    const val = typeof tx.amount === 'number'
      ? tx.amount
      : (parseFloat(String(tx.amount || 0).replace(/\s/g, '').replace(/,/g, '.')) || 0);
    if (val <= 0) return;

    let txDate = null;
    if (tx.timestamp && typeof tx.timestamp === 'number') {
      txDate = new Date(tx.timestamp);
    } else if (tx.rawDate) {
      txDate = typeof window.parseAnyDate === 'function' ? window.parseAnyDate(tx.rawDate) : new Date(tx.rawDate);
    } else if (tx.date) {
      txDate = typeof window.parseAnyDate === 'function' ? window.parseAnyDate(tx.date) : new Date(tx.date);
    }

    if (txDate && !isNaN(txDate.getTime())) {
      const txTime = txDate.getTime();
      if (isCurrentCalendarMonth && txTime >= startOfWeek.getTime() && txTime <= endOfWeek.getTime()) {
        weeklySpent += val;
      }
      if (txTime >= startOfMonth.getTime() && txTime <= endOfMonth.getTime()) {
        monthlySpent += val;
        currentMonthItems.push(tx);
      }
    }
  });

  // Если просматриваем архивный месяц — недельные траты берутся как средненедельные по месяцу
  if (!isCurrentCalendarMonth) {
    weeklySpent = Math.round(monthlySpent / 4.33);
  }

  // Защита от деления на ноль и пустых лимитов
  const monthlyLimit = parseFloat(plan.monthlyVariableLimit) || 0;
  const weeklyBaseLimit = monthlyLimit > 0 ? Math.round(monthlyLimit / 4.33) : 0;
  const weeklyAvailable = Math.max(0, weeklyBaseLimit - weeklySpent);

  // 1. Блок «Недельный пульс» с круговым прогресс-баром
  const weekAvailEl = document.getElementById('budget-week-available');
  const weekSpentText = document.getElementById('budget-week-spent-text');
  const weekLimitText = document.getElementById('budget-week-limit-text');
  const weekCircleBar = document.getElementById('budget-week-circle-bar');
  const weekCirclePct = document.getElementById('budget-week-circle-pct');

  if (weekAvailEl) {
    if (weeklyBaseLimit > 0 && weeklySpent > weeklyBaseLimit) {
      weekAvailEl.innerHTML = `<span class="text-white">${formatMoney(0)}</span> <span class="text-xs font-semibold text-[#FF453A] ml-2 block sm:inline">Лимит превышен на ${formatMoney(weeklySpent - weeklyBaseLimit)}</span>`;
      weekAvailEl.dataset.animVal = "0";
    } else if (typeof animateNumber === 'function') {
      animateNumber(weekAvailEl, weeklyAvailable);
    } else {
      weekAvailEl.innerText = formatMoney(weeklyAvailable);
    }
  }

  if (weekSpentText) {
    if (typeof animateNumber === 'function') animateNumber(weekSpentText, weeklySpent);
    else weekSpentText.innerText = formatMoney(weeklySpent);
  }
  if (weekLimitText) {
    if (typeof animateNumber === 'function') animateNumber(weekLimitText, weeklyBaseLimit);
    else weekLimitText.innerText = formatMoney(weeklyBaseLimit);
  }

  const weekPct = weeklyBaseLimit > 0 ? (weeklySpent / weeklyBaseLimit) * 100 : 0;
  const clampedWeekPct = Math.min(100, Math.max(0, weekPct));
  const circleCircumference = 238.76;
  const circleOffset = circleCircumference - (clampedWeekPct / 100) * circleCircumference;

  let strokeColor = '#30D158';
  if (weeklySpent > weeklyBaseLimit && weeklyBaseLimit > 0) {
    strokeColor = '#FF453A';
  } else if (weekPct >= 80) {
    strokeColor = '#FF9F0A';
  }

  if (weekCircleBar) {
    weekCircleBar.style.strokeDashoffset = `${circleOffset}`;
    weekCircleBar.style.stroke = strokeColor;
  }
  if (weekCirclePct) {
    weekCirclePct.innerText = `${Math.round(weekPct)}%`;
    weekCirclePct.style.color = strokeColor;
  }

  // 4-сегментный прогресс-бар месяца
  const monthStatEl = document.getElementById('budget-month-stat');
  const monthPctEl = document.getElementById('budget-month-pct');
  const mPct = monthlyLimit > 0 ? (monthlySpent / monthlyLimit) * 100 : 0;
  if (monthStatEl) {
    monthStatEl.innerHTML = `<span id="budget-month-spent-val">${formatMoney(monthlySpent)}</span> <span class="text-[#848D99] font-normal">из</span> ${formatMoney(monthlyLimit)}`;
    const spentEl = document.getElementById('budget-month-spent-val');
    if (spentEl && typeof animateNumber === 'function') {
      animateNumber(spentEl, monthlySpent);
    }
  }
  if (monthPctEl) {
    monthPctEl.innerText = `${Math.round(mPct)}%`;
    monthPctEl.style.color = (monthlySpent > monthlyLimit && monthlyLimit > 0) ? '#FF453A' : (mPct >= 80 ? '#FF9F0A' : '#848D99');
  }

  const weekSegmentLimit = monthlyLimit > 0 ? monthlyLimit / 4 : 0;
  const segSpent = [0, 0, 0, 0];

  currentMonthItems.forEach(tx => {
    const val = parseFloat(tx.amount) || 0;
    if (val <= 0) return;
    const txDate = (typeof window.parseAnyDate === 'function')
      ? window.parseAnyDate(tx.timestamp || tx.rawDate || tx.date)
      : (tx.timestamp ? new Date(tx.timestamp) : new Date(tx.rawDate || tx.date));
    if (!txDate || isNaN(txDate.getTime())) return;
    const d = txDate.getDate();
    if (d <= 7) segSpent[0] += val;
    else if (d <= 14) segSpent[1] += val;
    else if (d <= 21) segSpent[2] += val;
    else segSpent[3] += val;
  });

  for (let i = 0; i < 4; i++) {
    const segBar = document.getElementById(`budget-seg-${i + 1}`);
    const sSpent = segSpent[i];
    const sPct = weekSegmentLimit > 0 ? (sSpent / weekSegmentLimit) * 100 : 0;
    const sClamped = Math.min(100, Math.max(0, sPct));

    let segColor = 'bg-[#30D158]';
    if (sSpent > weekSegmentLimit && weekSegmentLimit > 0) {
      segColor = 'bg-[#FF453A]';
    } else if (sPct >= 80) {
      segColor = 'bg-[#FF9F0A]';
    }

    if (segBar) {
      segBar.style.width = `${sClamped}%`;
      segBar.className = `h-full ${segColor} rounded-full transition-all duration-300`;
    }
  }

  // Кнопка закрытия месяца на одной строке с процентом заполнения шкалы
  const closeMonthContainer = document.getElementById('budget-close-month-container');
  const closeMonthBtn = document.getElementById('budget-close-month-btn');
  const closeMonthBtnText = document.getElementById('budget-close-month-btn-text');
  
  // Месяц завершился по дате устройства
  const isMonthEnded = (today.getFullYear() > targetYear) || (today.getFullYear() === targetYear && today.getMonth() > targetMonth);

  if (closeMonthContainer && closeMonthBtn && closeMonthBtnText) {
    if (isClosed) {
      closeMonthContainer.classList.remove('hidden');
      closeMonthBtn.className = 'py-1 px-2.5 rounded-lg bg-[#212430] hover:bg-[#2A2D3C] text-emerald-400 font-semibold text-[11px] border border-emerald-500/30 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer';
      closeMonthBtnText.innerText = 'Итоги закрытия';
      closeMonthBtn.onclick = () => openMonthCloseFlow(targetYear, targetMonth);
    } else if (isMonthEnded) {
      closeMonthContainer.classList.remove('hidden');
      closeMonthBtn.className = 'py-1 px-3 rounded-lg bg-gradient-to-r from-[#6C5DD3] to-[#8C7DFF] hover:from-[#5e4fc9] hover:to-[#7b6ceb] text-white font-bold text-[11px] shadow-sm border border-[rgba(255,255,255,0.1)] flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer';
      closeMonthBtnText.innerText = 'Закрыть месяц';
      closeMonthBtn.onclick = () => openMonthCloseFlow(targetYear, targetMonth);
    } else {
      closeMonthContainer.classList.add('hidden');
    }
  }

  // 2. Блок «Календарь счетов»
  renderBudgetCalendar(bills, targetDate, currentMonthItems);
  // 3. Блок «Цели накопления»
  renderBudgetGoals(goals, plan, bills, targetDate);
  // 4. Блок «Лимиты по категориям»
  renderBudgetCategoryLimits(currentMonthItems, plan.categoryLimits || {});

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// Вспомогательная функция для расчета статуса разового/распределенного платежа в конкретном месяце
function getOneTimeBillMonthInfo(bill, targetDate = new Date()) {
  const isOneTime = bill.type === 'onetime' || bill.type === 'Разовый';
  if (!isOneTime) {
    return { isActive: true, isOneTime: false, isSpread: false, currentStep: 1, totalSteps: 1 };
  }
  const spreadMonths = Math.max(1, parseInt(bill.spreadMonths, 10) || 1);
  const startMonthStr = bill.startMonth || bill.month || formatDateStr(targetDate, 'yyyy-MM');
  
  const parts = String(startMonthStr).split('-');
  const startYear = parseInt(parts[0], 10) || targetDate.getFullYear();
  const startM = parseInt(parts[1], 10) || (targetDate.getMonth() + 1);

  const targetYear = targetDate.getFullYear();
  const targetM = targetDate.getMonth() + 1;

  const monthDiff = (targetYear - startYear) * 12 + (targetM - startM);
  const isActive = monthDiff >= 0 && monthDiff < spreadMonths;
  const currentStep = monthDiff + 1;

  return {
    isActive,
    isOneTime: true,
    currentStep,
    totalSteps: spreadMonths,
    isSpread: spreadMonths > 1,
    startMonthStr,
    monthDiff
  };
}

// Вспомогательная функция для расчета фактической суммы счета/разовой траты в конкретном месяце
// с учетом привязанной транзакции (величина корректируется по фактической оплате только в этом месяце,
// а в других месяцах сохраняется базовая запланированная сумма)
function getEffectiveBillAmount(bill, targetDate = new Date(), monthItems = null) {
  if (!bill) return 0;
  const d = targetDate || ((typeof getSelectedBudgetDate === 'function') ? getSelectedBudgetDate() : new Date());
  const year = d.getFullYear();
  const month = d.getMonth();
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;

  const info = getOneTimeBillMonthInfo(bill, d);
  if (!info.isActive) return 0;

  // 1. Проверяем привязанную транзакцию в переданном массиве транзакций или в общем кэше
  const allTxs = monthItems || (typeof getAllCachedTransactionsFlat === 'function' ? getAllCachedTransactionsFlat() : []);
  const linkedTx = allTxs.find(tx => {
    if (tx.type !== 'Расход') return false;
    if (tx.billId !== bill.id && tx.id !== bill.linkedTxId) return false;

    // Проверяем принадлежность транзакции целевому месяцу
    let txDate = null;
    if (tx.timestamp && typeof tx.timestamp === 'number') {
      txDate = new Date(tx.timestamp);
    } else if (tx.rawDate || tx.date) {
      txDate = typeof window.parseAnyDate === 'function' ? window.parseAnyDate(tx.rawDate || tx.date) : new Date(tx.rawDate || tx.date);
    }
    if (!txDate || isNaN(txDate.getTime())) return false;
    return txDate.getFullYear() === year && txDate.getMonth() === month;
  });

  if (linkedTx) {
    const txAmt = parseFloat(linkedTx.amount) || 0;
    if (txAmt > 0) {
      if (info.isSpread && info.totalSteps > 1) {
        return Math.round(txAmt / info.totalSteps);
      }
      return txAmt;
    }
  }

  // 2. Проверяем сохраненную сумму в paidMonths (если сохранена структура { paid: true, amount: ... })
  if (bill.paidMonths && bill.paidMonths[monthKey]) {
    const pVal = bill.paidMonths[monthKey];
    if (typeof pVal === 'object' && pVal && pVal.amount) {
      const pAmt = parseFloat(pVal.amount) || 0;
      if (pAmt > 0) {
        if (info.isSpread && info.totalSteps > 1) {
          return Math.round(pAmt / info.totalSteps);
        }
        return pAmt;
      }
    }
  }

  // 3. Для разовой траты без распределения, если привязан linkedTxId в том же месяце
  if (info.isOneTime && bill.linkedTxId && !info.isSpread) {
    const singleTx = allTxs.find(tx => tx.id === bill.linkedTxId);
    if (singleTx) {
      const singleAmt = parseFloat(singleTx.amount) || 0;
      if (singleAmt > 0) return singleAmt;
    }
  }

  // Иначе возвращаем базовую запланированную сумму счета
  return parseFloat(bill.amount) || 0;
}
window.getEffectiveBillAmount = getEffectiveBillAmount;

function formatCompactBillAmount(amount, hasBadge = false) {
  const num = parseFloat(amount) || 0;
  if (hasBadge && num >= 10000) {
    const k = (num / 1000).toFixed(num % 1000 === 0 ? 0 : 1).replace('.0', '');
    return `${k}k ₽`;
  }
  return formatMoney(num);
}

function renderBudgetCalendar(bills, today, monthItems) {
  const container = document.getElementById('budget-calendar-list');
  const totalEl = document.getElementById('budget-bills-total');
  if (!container) return;

  let validToday;
  let itemsList;

  if (Array.isArray(today)) {
    itemsList = today;
    validToday = (typeof getSelectedBudgetDate === 'function') ? getSelectedBudgetDate() : new Date();
  } else {
    validToday = (today instanceof Date && !isNaN(today.getTime()))
      ? today
      : ((typeof getSelectedBudgetDate === 'function') ? getSelectedBudgetDate() : new Date());
    itemsList = monthItems || [];
  }

  const monthShortNames = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const weekDayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const currentMonthShort = monthShortNames[validToday.getMonth()];

  const billsList = bills || Cache?.calendarBills || [];

  // ФИЛЬТРАЦИЯ СЧЕТОВ ДЛЯ ТЕКУЩЕГО МЕСЯЦА:
  const activeBills = billsList.filter(b => {
    const info = getOneTimeBillMonthInfo(b, validToday);
    return info.isActive;
  });

  // СОРТИРОВКА:
  // 1. Все ежемесячные траты (по дням месяца)
  // 2. Изначальные разовые траты (1-й шаг / без распределения) (по дням месяца)
  // 3. Вторые и последующие части распределенных разовых трат (без даты, в конце списка)
  activeBills.sort((a, b) => {
    const infoA = getOneTimeBillMonthInfo(a, validToday);
    const infoB = getOneTimeBillMonthInfo(b, validToday);

    const groupA = !infoA.isOneTime ? 0 : (infoA.currentStep === 1 ? 1 : 2);
    const groupB = !infoB.isOneTime ? 0 : (infoB.currentStep === 1 ? 1 : 2);

    if (groupA !== groupB) {
      return groupA - groupB;
    }

    if (groupA === 2) {
      return (a.name || '').localeCompare(b.name || '');
    }

    return (parseInt(a.day, 10) || 1) - (parseInt(b.day, 10) || 1);
  });

  const monthlyBillsSum = billsList.filter(b => {
    const info = getOneTimeBillMonthInfo(b, validToday);
    return !info.isOneTime;
  }).reduce((s, b) => s + getEffectiveBillAmount(b, validToday, itemsList), 0);

  if (totalEl) totalEl.innerText = `Ежемесячные траты: ${formatMoney(monthlyBillsSum)}`;

  if (activeBills.length === 0) {
    container.innerHTML = `
      <div class="col-span-full card rounded-2xl p-5 text-center flex flex-col items-center justify-center gap-2.5 bg-[#181B24] border border-[rgba(255,255,255,0.06)]">
        <div class="w-10 h-10 rounded-xl bg-[#6C5DD3]/15 text-[#727cff] flex items-center justify-center">
          <i data-lucide="calendar" class="w-5 h-5"></i>
        </div>
        <div>
          <p class="text-xs font-semibold text-gray-200">Нет обязательных платежей</p>
          <p class="text-[11px] text-[#848D99] mt-0.5">Запланируйте аренду, подписки или кредиты на этот месяц</p>
        </div>
        <button type="button" onclick="openBillModal()" class="px-3.5 py-1.5 rounded-xl bg-[#6C5DD3] hover:bg-[#5b4ec2] text-white text-xs font-semibold transition-all active:scale-95 cursor-pointer flex items-center gap-1.5">
          <i data-lucide="plus" class="w-3.5 h-3.5"></i>
          <span>Добавить платеж</span>
        </button>
      </div>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  container.innerHTML = activeBills.map(b => {
    const billDay = parseInt(b.day, 10) || 1;
    const info = getOneTimeBillMonthInfo(b, validToday);
    const isSubsequentPart = info.isOneTime && info.currentStep > 1;
    const isPaid = isSubsequentPart ? true : isBillPaidInCurrentMonth(b, itemsList, validToday);

    const effectiveAmount = getEffectiveBillAmount(b, validToday, itemsList);
    const baseAmount = parseFloat(b.amount) || 0;
    const isAdjusted = isPaid && Math.abs(effectiveAmount - baseAmount) > 0.01;

    const billDate = new Date(validToday.getFullYear(), validToday.getMonth(), billDay);
    const dayOfWeek = weekDayNames[billDate.getDay()];

    return `
      <div class="card group p-2.5 rounded-2xl border ${isPaid ? 'border-[#30D158]/30 bg-[#181B24]/75' : 'border-[rgba(255,255,255,0.06)] bg-[#181B24]'} hover:border-[rgba(255,255,255,0.18)] hover:bg-[#1C1F2B] flex flex-col justify-between transition-all cursor-pointer relative min-h-[82px] shadow-sm active:scale-[0.98]"
           data-id="${b.id}"
           data-table="CalendarBills"
           onclick="openEditBillModal('${b.id}')">
        
        <input type="checkbox" class="select-checkbox hidden" data-id="${b.id}">

        <!-- Верхняя строка: дата / статус -->
        <div class="flex items-center justify-between gap-1">
          ${isSubsequentPart ? `
            <span class="text-[10px] font-bold text-amber-400/90 uppercase tracking-tight truncate">Доля ${info.currentStep} из ${info.totalSteps}</span>
            <!-- Для последующих частей — статус всегда оплачено -->
            <div class="bill-pay-status w-4 h-4 rounded-full border border-[#30D158] bg-[#30D158] text-black shadow-sm flex items-center justify-center flex-shrink-0" 
                 title="Оплачено (распределенная часть)">
              <i data-lucide="check" class="w-2.5 h-2.5 opacity-100 stroke-[3]"></i>
            </div>
          ` : `
            <span class="text-[10px] font-bold text-[#6C5DD3] uppercase tracking-tight truncate">${billDay} ${currentMonthShort} · <span class="text-[#848D99] font-normal">${dayOfWeek}</span></span>
            
            <!-- Круглый чекбокс оплаты для регулярных счетов и изначальных разовых трат -->
            <button type="button" 
                    onclick="event.stopPropagation(); openBillPaymentMatchModal('${b.id}')" 
                    class="bill-pay-status w-4 h-4 rounded-full border transition-all flex items-center justify-center cursor-pointer flex-shrink-0 ${isPaid ? 'bg-[#30D158] border-[#30D158] text-black shadow-sm' : 'border-gray-600 hover:border-gray-400 bg-[#12151C]'}" 
                    title="${isPaid ? 'Оплачено (нажмите для управления оплатой)' : 'Отметить как оплаченный'}">
              <i data-lucide="check" class="w-2.5 h-2.5 ${isPaid ? 'opacity-100' : 'opacity-0'} stroke-[3]"></i>
            </button>
          `}
        </div>

        <!-- Средняя часть: название счета -->
        <div class="my-0.5 min-w-0">
          <h4 class="text-[11px] font-semibold text-gray-200 truncate group-hover:text-white transition-colors" title="${escapeHtml(b.name)}">${escapeHtml(b.name)}</h4>
        </div>

        <!-- Нижняя строка: сумма слева и бейдж справа -->
        <div class="pt-1 border-t border-[rgba(255,255,255,0.04)] flex items-center justify-between gap-1">
          <span class="text-[11px] font-bold font-mono text-white tracking-tight truncate min-w-0 flex-shrink-0" title="${isAdjusted ? `Фактическая оплата по привязанной операции: ${formatMoney(effectiveAmount)} (по плану: ${formatMoney(baseAmount)})` : `Сумма: ${formatMoney(effectiveAmount)}`}">-${formatCompactBillAmount(effectiveAmount, info.isOneTime)}</span>
          ${info.isOneTime ? `
            ${info.isSpread ? `
              <span class="text-[9px] font-mono font-bold text-amber-300 bg-amber-500/15 border border-amber-500/25 px-1.5 py-0.5 rounded-md flex items-center gap-0.5 flex-shrink-0 ml-auto" title="Распределено на ${info.totalSteps} мес. Доля текущего месяца: ${info.currentStep} из ${info.totalSteps}">
                <i data-lucide="split" class="w-2.5 h-2.5"></i>${info.currentStep}/${info.totalSteps}
              </span>
            ` : `
              <span class="text-[9px] font-mono font-bold text-amber-300 bg-amber-500/15 border border-amber-500/25 px-1.5 py-0.5 rounded-md flex items-center gap-0.5 flex-shrink-0 ml-auto" title="Разовый расход">
                <i data-lucide="zap" class="w-2.5 h-2.5"></i>Разовый
              </span>
            `}
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderBudgetGoals(goals, plan, bills, targetDate = getSelectedBudgetDate()) {
  const container = document.getElementById('budget-goals-list');
  const surplusEl = document.getElementById('budget-goals-surplus');
  if (!container) return;

  const monthlyIncome = plan.monthlyIncome || 0;
  const monthlyLimit = plan.monthlyVariableLimit || 0;
  const today = targetDate || getSelectedBudgetDate();
  const activeBills = (bills || []).filter(b => getOneTimeBillMonthInfo(b, today).isActive);
  const totalBills = activeBills.reduce((s, b) => s + getEffectiveBillAmount(b, today), 0);
  const netSurplus = monthlyIncome - monthlyLimit - totalBills;

  if (surplusEl) {
    if (netSurplus < 0) {
      surplusEl.innerText = `Дефицит по плану: -${formatMoney(Math.abs(netSurplus))}/мес`;
      surplusEl.className = 'text-xs font-semibold text-[#FF453A]';
    } else {
      surplusEl.innerText = `Накопления по плану: +${formatMoney(netSurplus)}/мес`;
      surplusEl.className = 'text-xs font-semibold text-[#30D158]';
    }
  }

  if (goals.length === 0) {
    container.innerHTML = `
      <div class="card rounded-2xl p-5 text-center flex flex-col items-center justify-center gap-2.5 bg-[#181B24] border border-[rgba(255,255,255,0.06)]">
        <div class="w-10 h-10 rounded-xl bg-[#6C5DD3]/15 text-[#727cff] flex items-center justify-center">
          <i data-lucide="target" class="w-5 h-5"></i>
        </div>
        <div>
          <p class="text-xs font-semibold text-gray-200">Целей пока нет</p>
          <p class="text-[11px] text-[#848D99] mt-0.5">Создайте финансовую цель для накопления средств</p>
        </div>
        <button type="button" onclick="openGoalModal()" class="px-3.5 py-1.5 rounded-xl bg-[#6C5DD3] hover:bg-[#5b4ec2] text-white text-xs font-semibold transition-all active:scale-95 cursor-pointer flex items-center gap-1.5">
          <i data-lucide="plus" class="w-3.5 h-3.5"></i>
          <span>Создать цель</span>
        </button>
      </div>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  // Активные вклады, привязанные к целям
  const activeDeposits = (Cache.deposits || []).filter(d => !d.isClosed);

  container.innerHTML = goals.map(g => {
    const goalMonthlyAlloc = Math.round(netSurplus * (g.share / 100));

    // Расчет условного ежемесячного прироста от процентов по привязанным вкладам
    const linkedDeposits = activeDeposits.filter(d => d.goalId === g.id);
    const monthlyDepInterest = Math.round(linkedDeposits.reduce((sum, d) => sum + ((d.amount * (d.rate / 100)) / 12), 0));
    const totalMonthlyGrowth = goalMonthlyAlloc + monthlyDepInterest;

    const remaining = Math.max(0, g.target - g.saved);
    let monthsNeeded = 0;
    let timeHint = '';

    if (g.isAchieved || (g.target > 0 && g.saved >= g.target)) {
      timeHint = 'Цель выполнена';
    } else if (totalMonthlyGrowth > 0) {
      monthsNeeded = Math.ceil(remaining / totalMonthlyGrowth);
      timeHint = `~${monthsNeeded} мес. при текущем плане`;
    } else if (totalMonthlyGrowth < 0) {
      timeHint = 'Дефицит темпа';
    } else {
      timeHint = 'Увеличьте профицит';
    }

    let badgeText = '0 ₽/мес';
    let badgeClass = 'bg-[#212430] text-[#848D99] hover:bg-[#2A2D3C] border-[rgba(255,255,255,0.06)]';
    let tooltipHeaderClass = 'text-gray-400';

    if (totalMonthlyGrowth > 0) {
      badgeText = `+${formatMoney(totalMonthlyGrowth)}/мес`;
      badgeClass = 'bg-[#30D158]/10 text-[#30D158] hover:bg-[#30D158]/20 border-[#30D158]/25';
      tooltipHeaderClass = 'text-[#30D158]';
    } else if (totalMonthlyGrowth < 0) {
      badgeText = `-${formatMoney(Math.abs(totalMonthlyGrowth))}/мес`;
      badgeClass = 'bg-[#FF453A]/10 text-[#FF453A] hover:bg-[#FF453A]/20 border-[#FF453A]/25';
      tooltipHeaderClass = 'text-[#FF453A]';
    }

    return `
      <div class="card bg-[#181B24] border border-[rgba(255,255,255,0.06)] rounded-2xl p-4 shadow-sm cursor-pointer relative hover:border-[rgba(255,255,255,0.12)] transition-all"
           data-id="${g.id}"
           data-table="Goals"
           onclick="openEditGoalModal('${g.id}')">
        
        <input type="checkbox" class="select-checkbox hidden" data-id="${g.id}">

        <div class="flex items-start justify-between mb-2 gap-2">
          <div class="flex items-center gap-2.5 min-w-0 flex-1">
            <div class="w-8 h-8 rounded-xl bg-[#6C5DD3]/15 text-[#6C5DD3] flex items-center justify-center flex-shrink-0">
              <i data-lucide="${g.icon || 'target'}" class="w-4 h-4"></i>
            </div>
            <div class="min-w-0 flex-1">
              <h4 class="text-sm font-bold text-white truncate">${escapeHtml(g.name)}</h4>
              <p class="text-[11px] text-[#848D99] mt-0.5">${timeHint}</p>
            </div>
          </div>
          
          <button type="button" onclick="event.stopPropagation(); openGoalTopupModal('${g.id}', '${escapeHtml(g.name)}')" class="goal-topup-btn bg-[#212430] hover:bg-[#2A2D3C] text-gray-200 border border-[rgba(255,255,255,0.06)] text-xs font-semibold px-2.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1 flex-shrink-0 active:scale-95">
            <i data-lucide="plus" class="w-3.5 h-3.5"></i>
            <span>Пополнить</span>
          </button>
        </div>

        <div class="flex items-center justify-between gap-2 mb-2 text-[11px]">
          <span class="text-gray-400 font-medium">Доля в бюджете: <span class="text-[#6C5DD3] font-bold">${g.share}%</span></span>
          <div class="relative inline-block" onclick="event.stopPropagation();" onmousedown="event.stopPropagation();" ontouchstart="event.stopPropagation();">
            <button type="button" 
                    onclick="event.stopPropagation(); toggleGoalPaceTooltip('${g.id}', event);" 
                    onmousedown="event.stopPropagation();"
                    ontouchstart="event.stopPropagation();"
                    class="goal-pace-badge inline-flex items-center px-2 py-0.5 rounded-full ${badgeClass} font-semibold text-[10px] border flex-shrink-0 cursor-pointer transition-all active:scale-95" 
                    title="Детализация темпа">
              ${badgeText}
            </button>
            <div id="goal-pace-tooltip-${g.id}" class="goal-pace-tooltip hidden absolute right-0 z-50 w-56 bg-[#1E222D] border border-[rgba(255,255,255,0.15)] p-2.5 rounded-2xl shadow-2xl space-y-1.5 text-left pointer-events-auto" onclick="event.stopPropagation();" onmousedown="event.stopPropagation();" ontouchstart="event.stopPropagation();">
              <div class="flex items-center justify-between border-b border-[rgba(255,255,255,0.06)] pb-1.5">
                <span class="text-[10px] font-bold text-white">Темп накоплений</span>
                <span class="text-[10px] font-mono font-bold ${tooltipHeaderClass}">${badgeText}</span>
              </div>
              <div class="text-[10px] space-y-1">
                <div class="flex justify-between text-gray-400">
                  <span>Из бюджета (${g.share}%):</span>
                  <b class="font-mono ${goalMonthlyAlloc < 0 ? 'text-[#FF453A]' : (goalMonthlyAlloc > 0 ? 'text-[#30D158]' : 'text-gray-300')}">
                    ${goalMonthlyAlloc < 0 ? '-' : (goalMonthlyAlloc > 0 ? '+' : '')}${formatMoney(Math.abs(goalMonthlyAlloc))}
                  </b>
                </div>
                <div class="flex justify-between text-gray-400">
                  <span>Со вкладов:</span>
                  <b class="${monthlyDepInterest > 0 ? 'text-[#30D158]' : 'text-gray-400'} font-mono">+${formatMoney(monthlyDepInterest)}</b>
                </div>
              </div>
              ${monthsNeeded > 0 ? `
                <div class="pt-1 border-t border-[rgba(255,255,255,0.06)] text-[9px] text-[#848D99]">
                  Срок достижения: ~${monthsNeeded} мес.
                </div>
              ` : (totalMonthlyGrowth < 0 ? `
                <div class="pt-1 border-t border-[rgba(255,255,255,0.06)] text-[9px] text-[#FF453A]">
                  При текущем дефиците цель недостижима
                </div>
              ` : '')}
            </div>
          </div>
        </div>

        <div class="flex justify-between items-end text-xs mb-2">
          <span class="text-white font-bold font-mono text-sm">${formatMoney(g.saved)} <span class="text-[#848D99] font-normal text-xs">/ ${formatMoney(g.target)}</span></span>
          <span class="text-[11px] font-semibold text-[#6C5DD3]">${g.progress}%</span>
        </div>

        <div class="w-full bg-[rgba(255,255,255,0.06)] h-2 rounded-full overflow-hidden">
          <div class="bg-gradient-to-r from-[#6C5DD3] to-[#32ADE6] h-full rounded-full transition-all duration-500" style="width: ${g.progress}%"></div>
        </div>
      </div>
    `;
  }).join('');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderBudgetCategoryLimits(monthItems = [], categoryLimits = {}) {
  const container = document.getElementById('budget-category-limits-list');
  if (!container) return;

  const safeLimits = categoryLimits && typeof categoryLimits === 'object' ? categoryLimits : {};
  const expenseCats = Cache?.categories?.expense || [];

  // Собираем все категории, у которых задан лимит > 0
  const activeLimitKeys = Object.keys(safeLimits).filter(k => {
    const lim = parseFloat(safeLimits[k]);
    return !isNaN(lim) && lim > 0;
  });

  // Если нет настроенных лимитов — аккуратная заглушка
  if (activeLimitKeys.length === 0) {
    container.innerHTML = `
      <div class="py-4 px-2 text-center">
        <p class="text-xs text-[#848D99]">Отдельные лимиты категорий не заданы</p>
        <button type="button" onclick="openAddCategoryLimitPicker()" class="mt-2 text-xs text-[#6C5DD3] hover:text-[#8274ea] font-semibold transition-colors cursor-pointer">
          + Настроить лимит категории
        </button>
      </div>
    `;
    return;
  }

  // Список категорий с индивидуальными лимитами (кроме 'Прочие расходы' / 'Прочие траты')
  const specificLimitKeys = activeLimitKeys.filter(k => k !== 'Прочие расходы' && k !== 'Прочие траты');

  // Расчет фактических трат
  const spentMap = {};
  let otherSpent = 0;

  (monthItems || []).forEach(tx => {
    if (tx.type === 'Расход' && !tx.excludeFromBudget && !tx.isBillPayment) {
      const cat = (tx.category || 'Другое').trim() || 'Другое';
      const val = parseFloat(tx.amount) || 0;
      spentMap[cat] = (spentMap[cat] || 0) + val;

      // Если у категории нет собственного индивидуального лимита, она относится к "Прочим расходам"
      if (!specificLimitKeys.includes(cat)) {
        otherSpent += val;
      }
    }
  });

  container.innerHTML = activeLimitKeys.map(catName => {
    const isOther = (catName === 'Прочие расходы' || catName === 'Прочие траты');
    const spent = isOther ? otherSpent : (spentMap[catName] || 0);
    const limit = parseFloat(safeLimits[catName]) || 0;

    // Получаем иконку категории
    const catObj = expenseCats.find(c => (typeof c === 'string' ? c : c?.name) === catName);
    const icon = catObj?.icon || (typeof getCategoryIcon === 'function' ? getCategoryIcon(catName) : 'tag');

    const pct = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
    const isOver = limit > 0 && spent > limit;

    let barColor = 'bg-[#30D158]';
    if (isOver) barColor = 'bg-[#FF453A]';
    else if (pct >= 80) barColor = 'bg-[#FF9F0A]';

    return `
      <div class="card cursor-pointer py-3 px-3 rounded-2xl flex items-center justify-between gap-3 group hover:opacity-90 transition-all"
           data-budget-cat="${escapeHtml(catName)}"
           onclick="openCategoryLimitModal('${escapeHtml(catName)}', ${limit})">
        <div class="flex items-center gap-3 min-w-0 flex-1">
          <div class="w-8 h-8 rounded-xl bg-[#212430] text-gray-300 flex items-center justify-center flex-shrink-0">
            <i data-lucide="${icon}" class="w-4 h-4 text-[#848D99]"></i>
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between text-xs mb-1.5">
              <span class="font-semibold text-gray-200 truncate">${escapeHtml(catName)}</span>
              <span class="font-mono font-bold ${isOver ? 'text-[#FF453A]' : 'text-gray-200'} ml-2">
                ${formatMoney(spent)} <span class="text-[#848D99] font-normal text-[11px]">/ ${formatMoney(limit)}</span>
              </span>
            </div>
            <div class="w-full bg-[rgba(255,255,255,0.06)] h-1.5 rounded-full overflow-hidden">
              <div class="${barColor} h-full rounded-full transition-all duration-300" style="width: ${pct}%"></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function isBillPaidInCurrentMonth(bill, monthItems, customDate) {
  if (!bill) return false;
  const d = customDate || ((typeof getSelectedBudgetDate === 'function') ? getSelectedBudgetDate() : new Date());
  const info = getOneTimeBillMonthInfo(bill, d);

  // Для вторых и последующих частей распределенных трат — статус всегда оплачено
  if (info.isOneTime && info.currentStep > 1) {
    return true;
  }

  const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

  // 1. Проверяем paidMonths именно для текущего месяца
  if (bill.paidMonths && bill.paidMonths[monthKey]) return true;

  // 2. Для разовых выплат проверяем общий флаг isPaid
  if (info.isOneTime) {
    if (bill.isPaid) return true;
    if (bill.linkedTxId) return true;
  }

  // 3. Проверяем наличие привязанной транзакции в рамках выбранного месяца
  if (Array.isArray(monthItems) && monthItems.length > 0) {
    const hasLinked = (monthItems || []).some(tx => 
      tx && tx.type === 'Расход' && 
      tx.billId === bill.id && 
      (tx.isBillPayment || tx.excludeFromBudget)
    );
    if (hasLinked) return true;
  }

  return false;
}

// Управление модальными окнами бюджета
function openBudgetPlanModal() {
  const dlg = document.getElementById('budget-plan-dialog');
  if (!dlg) return;

  const plan = Cache?.budgetPlan || {};
  setFormattedVal('plan-income-input', plan.monthlyIncome || 0);

  // Расчет реального среднего дохода за 3 месяца
  const months = Cache?.transactions || [];
  const lastMonths = months.slice(0, 3);
  let totalInc = 0;
  lastMonths.forEach(m => {
    (m.items || []).forEach(tx => {
      if (tx.type === 'Доход') totalInc += tx.amount;
    });
  });
  const avgIncome = Math.round(totalInc / Math.max(1, lastMonths.length));
  const avgEl = document.getElementById('plan-avg-income');
  if (avgEl) avgEl.innerText = `${formatMoney(avgIncome)}/мес`;

  updatePlanForecast();
  if (typeof lockBodyScroll === 'function') lockBodyScroll();
  dlg.classList.remove('hidden');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeBudgetPlanModal() {
  const dlg = document.getElementById('budget-plan-dialog');
  if (dlg) {
    dlg.classList.add('hidden');
    if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
  }
}

function updatePlanForecast() {
  const inc = getUnformattedVal(document.getElementById('plan-income-input')) || 0;
  const plan = Cache?.budgetPlan || {};
  const limits = plan.categoryLimits || {};
  const categoriesSum = Object.values(limits).reduce((s, v) => s + (parseFloat(v) || 0), 0);

  const bills = Cache?.calendarBills || [];
  const today = (typeof getSelectedBudgetDate === 'function') ? getSelectedBudgetDate() : new Date();

  // Сумма только ежемесячных трат (регулярных счетов) с учетом фактической корректировки
  const monthlyBillsSum = bills.filter(b => !getOneTimeBillMonthInfo(b, today).isOneTime)
    .reduce((s, b) => s + getEffectiveBillAmount(b, today), 0);

  // Активные счета месяца для расчета свободного остатка
  const activeBills = bills.filter(b => getOneTimeBillMonthInfo(b, today).isActive);
  const totalBills = activeBills.reduce((s, b) => s + getEffectiveBillAmount(b, today), 0);

  const totalPlannedExpenses = categoriesSum + monthlyBillsSum;
  const surplus = inc - categoriesSum - totalBills;

  const totalExpDisplay = document.getElementById('plan-total-expenses-display');
  const catSumEl = document.getElementById('plan-categories-sum');
  const billsSumEl = document.getElementById('plan-monthly-bills-sum');
  const surplusEl = document.getElementById('plan-forecast-surplus');

  if (totalExpDisplay) totalExpDisplay.innerText = formatMoney(totalPlannedExpenses);
  if (catSumEl) catSumEl.innerText = formatMoney(categoriesSum);
  if (billsSumEl) billsSumEl.innerText = formatMoney(monthlyBillsSum);

  if (surplusEl) {
    if (surplus < 0) {
      surplusEl.className = 'text-[#FF453A] font-bold text-sm font-mono';
      surplusEl.innerText = `-${formatMoney(Math.abs(surplus))}/мес`;
    } else {
      surplusEl.className = 'text-[#30D158] font-bold text-sm font-mono';
      surplusEl.innerText = `+${formatMoney(surplus)}/мес`;
    }
  }
}

async function submitBudgetPlan(e) {
  e.preventDefault();
  const inc = getUnformattedVal(document.getElementById('plan-income-input'));
  const plan = Cache?.budgetPlan || {};
  const limits = plan.categoryLimits || {};
  const categoriesSum = Object.values(limits).reduce((s, v) => s + (parseFloat(v) || 0), 0);

  try {
    const col = getUserCol('BudgetPlan');
    const snap = await col.get();
    const batch = db.batch();

    const planData = {
      monthlyIncome: inc,
      monthlyVariableLimit: categoriesSum,
      updatedAt: Date.now()
    };

    if (snap.empty) {
      batch.set(col.doc('plan'), planData);
    } else {
      batch.update(snap.docs[0].ref, planData);
    }

    await batch.commit();
    closeBudgetPlanModal();
    await fetchAllData();
  } catch (err) {
    showToast('Ошибка: ' + err.message, true);
  }
}

// Сброс текущей настройки бюджета и перезапуск мастера первого запуска
async function resetBudgetPlanToWizard() {
  showDialog(
    'Перезапуск мастера настройки',
    'Сбросить статус настройки бюджета и открыть мастер первого запуска заново? Все ваши транзакции, категории, счета и цели сохранятся.',
    true,
    async () => {
      try {
        const col = getUserCol('BudgetPlan');
        const snap = await col.get();
        const batch = db.batch();

        if (!snap.empty) {
          snap.docs.forEach(d => {
            batch.update(d.ref, { isConfigured: false, updatedAt: Date.now() });
          });
        } else {
          batch.set(col.doc('plan'), { isConfigured: false, updatedAt: Date.now() });
        }
        await batch.commit();

        if (Cache && Cache.budgetPlan) {
          Cache.budgetPlan.isConfigured = false;
        }

        closeBudgetPlanModal();
        if (typeof closeProfileModal === 'function') closeProfileModal();

        // Переключаемся на таб бюджета
        if (typeof switchTab === 'function') switchTab('budget');

        // Сбрасываем сохраненный шаг на 1
        localStorage.setItem('budget_wizard_step', '1');
        currentWizardStep = 1;

        // Показываем мастер, прячем дашборд
        const wizardEl = document.getElementById('budget-wizard');
        const dashboardEl = document.getElementById('budget-dashboard');
        if (wizardEl) wizardEl.classList.remove('hidden');
        if (dashboardEl) dashboardEl.classList.add('hidden');

        initBudgetWizard(true);
      } catch (err) {
        console.error('Ошибка сброса плана бюджета:', err);
        showToast('Ошибка сброса: ' + err.message, true);
      }
    }
  );
}

// ==========================================
// 2. Calendar Bills (Счета и платежи)
// ==========================================
function changeBillSpreadMonths(delta) {
  const input = document.getElementById('bill-spread-months');
  if (!input) return;
  let val = parseInt(input.value, 10) || 1;
  val = Math.max(1, Math.min(12, val + delta));
  input.value = val;
  const label = document.getElementById('bill-spread-months-label');
  if (label) label.innerText = `${val} мес.`;
  updateBillSpreadPreview();
}

function updateBillSpreadPreview() {
  const amount = getUnformattedVal(document.getElementById('bill-amount')) || 0;
  const spreadMonths = parseInt(document.getElementById('bill-spread-months')?.value, 10) || 1;
  const monthlyCalc = spreadMonths > 0 ? Math.round(amount / spreadMonths) : amount;
  const weeklyCalc = Math.round(monthlyCalc / 4.33);

  const monthlyEl = document.getElementById('bill-spread-monthly-calc');
  const weeklyEl = document.getElementById('bill-spread-weekly-calc');
  const periodEl = document.getElementById('bill-spread-period-hint');

  if (monthlyEl) monthlyEl.innerText = `+${formatMoney(monthlyCalc)}/мес`;
  if (weeklyEl) weeklyEl.innerText = `+~${formatMoney(weeklyCalc)}/нед`;

  if (periodEl) {
    const today = new Date();
    const monthNames = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
    if (spreadMonths === 1) {
      periodEl.innerText = `Период: ${monthNames[today.getMonth()]} ${today.getFullYear()} (1 месяц)`;
    } else {
      const endMonthDate = new Date(today.getFullYear(), today.getMonth() + spreadMonths - 1, 1);
      const startText = `${monthNames[today.getMonth()]} ${today.getFullYear()}`;
      const endText = `${monthNames[endMonthDate.getMonth()]} ${endMonthDate.getFullYear()}`;
      periodEl.innerText = `Период: ${startText} — ${endText} (${spreadMonths} мес.)`;
    }
  }
}

function setBillType(type) {
  const input = document.getElementById('bill-type');
  if (input) input.value = type;

  const recBtn = document.getElementById('bill-type-recurring-btn');
  const oneBtn = document.getElementById('bill-type-onetime-btn');
  const spreadSection = document.getElementById('bill-spread-section');

  if (recBtn && oneBtn) {
    if (type === 'onetime' || type === 'Разовый') {
      recBtn.className = 'py-2.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 text-[#848D99] hover:text-white cursor-pointer';
      oneBtn.className = 'py-2.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-sm cursor-pointer';
      if (spreadSection) {
        spreadSection.classList.remove('hidden');
        updateBillSpreadPreview();
      }
    } else {
      recBtn.className = 'py-2.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 bg-[#6C5DD3] text-white shadow-sm cursor-pointer';
      oneBtn.className = 'py-2.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 text-[#848D99] hover:text-white cursor-pointer';
      if (spreadSection) spreadSection.classList.add('hidden');
    }
  }
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function openAddBillModal(initialDay = null) {
  const form = document.getElementById('calendar-bill-form');
  if (form) form.reset();

  const editIdEl = document.getElementById('bill-edit-id');
  if (editIdEl) editIdEl.value = '';

  const targetDay = parseInt(initialDay, 10) || currentWizSelectedDay || 1;
  currentWizSelectedDay = targetDay;

  const dayInput = document.getElementById('bill-day');
  if (dayInput) {
    dayInput.value = targetDay;
  }

  const spreadInput = document.getElementById('bill-spread-months');
  const spreadLabel = document.getElementById('bill-spread-months-label');
  if (spreadInput) spreadInput.value = '3';
  if (spreadLabel) spreadLabel.innerText = '3 мес.';

  setBillType('recurring');

  const actions = document.getElementById('bill-dialog-actions');
  const deleteBtn = document.getElementById('bill-delete-btn');
  const title = document.getElementById('calendar-bill-dialog-title');

  if (actions) actions.classList.remove('hidden');
  if (deleteBtn) deleteBtn.classList.add('hidden');
  if (title) title.innerText = `Платеж на ${targetDay} число`;

  const dlg = document.getElementById('calendar-bill-dialog');
  if (dlg) dlg.classList.remove('hidden');
}

function closeAddBillModal() {
  const dlg = document.getElementById('calendar-bill-dialog');
  if (dlg) dlg.classList.add('hidden');
}

function openEditBillModal(billId) {
  if (typeof isSelectionMode === 'function' && isSelectionMode()) return;
  if (window.isSelectionMode && window.isSelectionMode()) return;
  const bill = Cache?.calendarBills?.find(b => b.id === billId);
  if (!bill) return;

  const dlg = document.getElementById('calendar-bill-dialog');
  const title = document.getElementById('calendar-bill-dialog-title');
  const deleteBtn = document.getElementById('bill-delete-btn');

  document.getElementById('bill-edit-id').value = bill.id;
  document.getElementById('bill-name').value = bill.name;

  const isOne = (bill.type === 'onetime' || bill.type === 'Разовый');
  const spMonths = parseInt(bill.spreadMonths, 10) || 1;
  const spreadInput = document.getElementById('bill-spread-months');
  const spreadLabel = document.getElementById('bill-spread-months-label');
  if (spreadInput) spreadInput.value = spMonths;
  if (spreadLabel) spreadLabel.innerText = `${spMonths} мес.`;

  const totalSum = bill.totalAmount || (bill.amount * spMonths);
  setFormattedVal('bill-amount', isOne ? totalSum : bill.amount);

  const dayInput = document.getElementById('bill-day');
  if (dayInput) dayInput.value = bill.day;
  currentWizSelectedDay = parseInt(bill.day, 10) || 1;
  
  setBillType(bill.type || 'recurring');

  if (title) title.innerText = `Редактировать платеж (${bill.day} число)`;
  if (deleteBtn) deleteBtn.classList.remove('hidden');

  if (dlg) dlg.classList.remove('hidden');
}

async function submitCalendarBill(e) {
  e.preventDefault();
  const editId = document.getElementById('bill-edit-id')?.value;
  const name = document.getElementById('bill-name')?.value.trim();
  const amount = getUnformattedVal(document.getElementById('bill-amount'));
  const dayInput = document.getElementById('bill-day');
  const day = parseInt(dayInput ? dayInput.value : currentWizSelectedDay, 10) || currentWizSelectedDay || 1;
  const type = document.getElementById('bill-type')?.value || 'recurring';

  if (!name || !amount) return;

  try {
    const col = getUserCol('CalendarBills');
    const today = new Date();
    const currentMonthStr = formatDateStr(today, 'yyyy-MM');
    const isOneTime = (type === 'onetime' || type === 'Разовый');
    const spreadMonths = isOneTime ? (parseInt(document.getElementById('bill-spread-months')?.value, 10) || 1) : 1;
    const totalAmount = amount;
    const monthlyAmount = isOneTime ? Math.round(totalAmount / spreadMonths) : amount;

    const existingBill = editId ? (Cache?.calendarBills || []).find(b => b.id === editId) : null;
    const startMonth = existingBill?.startMonth || currentMonthStr;

    const billData = { 
      name, 
      amount: monthlyAmount, 
      totalAmount,
      spreadMonths,
      day, 
      type: isOneTime ? 'onetime' : 'recurring', 
      startMonth: isOneTime ? startMonth : null,
      month: isOneTime ? currentMonthStr : null,
      updatedAt: Date.now() 
    };

    if (!Cache.calendarBills) Cache.calendarBills = [];

    if (editId) {
      if (existingBill) Object.assign(existingBill, billData);
      await col.doc(editId).update(billData);
    } else {
      const newBill = { ...billData, isPaid: isOneTime, createdAt: Date.now() };
      const docRef = await col.add(newBill);
      newBill.id = docRef.id;
      Cache.calendarBills.push(newBill);
    }

    closeAddBillModal();
    document.getElementById('calendar-bill-form')?.reset();
    if (document.getElementById('bill-edit-id')) document.getElementById('bill-edit-id').value = '';
    
    // Мгновенно обновляем все календари и вкладку бюджета
    renderWizCalendar();
    renderBudgetTab();

    // Фоновая синхронизация
    fetchAllData().then(() => {
      renderWizCalendar();
      renderBudgetTab();
    });

    // Если открыт мастер или модальный календарь
    const plan = Cache?.budgetPlan || {};
    if (!plan.isConfigured) {
      goToWizardStep(3);
      currentWizSelectedDay = null;
      closeWizDayTooltip();
    } else {
      closeBudgetModalDayTooltip();
    }
  } catch (err) {
    showToast('Ошибка: ' + err.message, true);
  }
}

async function deleteCurrentEditingBill() {
  const id = document.getElementById('bill-edit-id')?.value;
  if (!id) return;

  closeAddBillModal();
  deleteCalendarBill(id);
}

async function toggleBillPaidStatus(billId, newStatus) {
  try {
    // Мгновенное оптимистичное обновление в памяти
    const b = (Cache?.calendarBills || []).find(x => x.id === billId);
    if (b) {
      b.isPaid = newStatus;
      b.paidAt = newStatus ? Date.now() : null;
    }
    renderBudgetTab();

    await getUserCol('CalendarBills').doc(billId).update({ 
      isPaid: newStatus,
      paidAt: newStatus ? Date.now() : null
    });
    fetchAllData();
  } catch (e) {
    showToast('Ошибка обновления статуса', true);
  }
}

// Модальное окно управления счетами конкретного дня
function openDayBillsModal(day) {
  const dlg = document.getElementById('day-bills-dialog');
  const title = document.getElementById('day-bills-title');
  const list = document.getElementById('day-bills-items-list');
  const addBtn = document.getElementById('btn-add-second-bill');

  if (title) title.innerText = `${day} число: список платежей`;
  if (dlg) dlg.classList.remove('hidden');

  const today = new Date();
  const bills = (Cache?.calendarBills || []).filter(b => parseInt(b.day, 10) === parseInt(day, 10) && getOneTimeBillMonthInfo(b, today).isActive);

  if (list) {
    if (bills.length === 0) {
      list.innerHTML = '<div class="text-center py-4 text-xs text-[#848D99]">Счетов на этот день нет</div>';
    } else {
      list.innerHTML = bills.map(b => {
        const info = getOneTimeBillMonthInfo(b, today);
        return `
          <div class="flex items-center justify-between p-2.5 rounded-xl bg-[#12151C] border border-[rgba(255,255,255,0.04)] text-xs">
            <div>
              <div class="font-semibold text-white flex items-center gap-1.5">
                ${escapeHtml(b.name)}
                ${info.isSpread ? `<span class="text-[9px] text-amber-300 font-mono">(${info.currentStep}/${info.totalSteps})</span>` : ''}
              </div>
              <div class="font-mono text-[11px] text-[#848D99]">-${formatMoney(b.amount)}</div>
            </div>
            <button type="button" onclick="deleteCalendarBill('${b.id}')" class="text-gray-500 hover:text-[#FF453A] p-1.5 cursor-pointer">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        `;
      }).join('');
    }
  }

  if (addBtn) {
    addBtn.onclick = () => {
      closeDayBillsModal();
      openAddBillModal(day);
    };
  }

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeDayBillsModal() {
  const dlg = document.getElementById('day-bills-dialog');
  if (dlg) dlg.classList.add('hidden');
}

// Быстрое мгновенное удаление счета из календаря
async function deleteCalendarBill(billId) {
  if (!billId) return;

  const deletedBill = (Cache?.calendarBills || []).find(b => b.id === billId);
  Cache.calendarBills = (Cache?.calendarBills || []).filter(b => b.id !== billId);

  // Если этот счет был привязан к транзакции, возвращаем флаг в транзакции
  if (deletedBill?.linkedTxId) {
    try {
      await getUserCol('Transactions').doc(deletedBill.linkedTxId).update({ excludeFromBudget: false });
      (Cache.transactions || []).forEach(m => {
        (m.items || []).forEach(tx => {
          if (tx.id === deletedBill.linkedTxId) tx.excludeFromBudget = false;
        });
      });
    } catch (e) {
      console.warn('Не удалось обновить транзакцию при удалении счета:', e);
    }
  }

  renderWizCalendar();
  renderBudgetTab();

  const plan = Cache?.budgetPlan || {};
  const isWizard = !plan.isConfigured || document.getElementById('budget-wizard')?.classList.contains('hidden') === false;

  if (isWizard) {
    if (currentWizSelectedDay) {
      const remainingBills = (Cache?.calendarBills || []).filter(b => parseInt(b.day, 10) === currentWizSelectedDay);
      if (remainingBills.length > 0) {
        const cell = document.querySelector(`[data-wiz-day="${currentWizSelectedDay}"]`);
        showWizDayTooltip(currentWizSelectedDay, remainingBills, cell);
      } else {
        closeWizDayTooltip();
      }
    }
  } else {
    const modalCalendar = document.getElementById('budget-calendar-modal');
    if (modalCalendar && !modalCalendar.classList.contains('hidden') && currentWizSelectedDay) {
      const remainingBills = (Cache?.calendarBills || []).filter(b => parseInt(b.day, 10) === currentWizSelectedDay);
      if (remainingBills.length > 0) {
        const cell = document.querySelector(`#budget-modal-calendar-grid [data-wiz-day="${currentWizSelectedDay}"]`);
        showBudgetModalDayTooltip(currentWizSelectedDay, remainingBills, cell);
      } else {
        closeBudgetModalDayTooltip();
      }
    }

    const dayDlg = document.getElementById('day-bills-dialog');
    if (dayDlg && !dayDlg.classList.contains('hidden') && window.currentDayBillsModalDay) {
      const dayBills = (Cache?.calendarBills || []).filter(b => parseInt(b.day, 10) === window.currentDayBillsModalDay);
      if (dayBills.length > 0) {
        openDayBillsModal(window.currentDayBillsModalDay);
      } else {
        closeDayBillsModal();
      }
    }
  }

  try {
    await getUserCol('CalendarBills').doc(billId).delete();
  } catch (e) {
    console.error('Ошибка фонового удаления счета:', e);
    showToast('Ошибка синхронизации удаления', true);
    if (deletedBill) {
      Cache.calendarBills.push(deletedBill);
      renderWizCalendar();
      renderBudgetTab();
    }
  }
}

// ==========================================
// 3. Budget Goals (Цели и Копилки)
// ==========================================
function processGoals(goals) {
  return goals.map(g => {
    const tar = parseFloat(g.target) || 0;
    const sav = parseFloat(g.saved) || 0;
    const share = parseFloat(g.share) || (goals.length > 0 ? Math.round(100 / goals.length) : 100);
    const icon = g.icon || getGoalIcon(g.name) || 'target';
    return {
      id: g.id,
      name: g.name,
      target: tar,
      saved: sav,
      share: share,
      icon: icon,
      progress: Math.min(100, tar > 0 ? (sav / tar) * 100 : 0).toFixed(1),
      isAchieved: tar > 0 && sav >= tar
    };
  });
}

function openBudgetGoalIconPicker() {
  const picker = document.getElementById('goal-modal-icon-picker');
  if (picker) {
    const isHidden = picker.classList.contains('hidden');
    picker.classList.toggle('hidden');
    if (isHidden) {
      renderGoalModalIconGrid();
    }
  }
}

function closeBudgetGoalIconPicker() {
  const picker = document.getElementById('goal-modal-icon-picker');
  if (picker) picker.classList.add('hidden');
}

function renderGoalModalIconGrid() {
  const grid = document.getElementById('goal-modal-icon-grid');
  if (!grid) return;
  const currentVal = document.getElementById('goal-icon-input')?.value || 'target';

  const iconsList = (typeof WIZARD_GOAL_ICONS !== 'undefined') ? WIZARD_GOAL_ICONS : [
    { name: 'target', label: 'Цель' },
    { name: 'home', label: 'Жилье' },
    { name: 'car', label: 'Авто' },
    { name: 'plane', label: 'Отпуск' },
    { name: 'laptop', label: 'Ноутбук' },
    { name: 'smartphone', label: 'Гаджет' },
    { name: 'shield-check', label: 'Подушка' },
    { name: 'graduation-cap', label: 'Учеба' },
    { name: 'sparkles', label: 'Мечта' },
    { name: 'heart-pulse', label: 'Здоровье' },
    { name: 'gem', label: 'Подарок' },
    { name: 'bike', label: 'Спорт' },
    { name: 'baby', label: 'Семья' },
    { name: 'briefcase', label: 'Бизнес' },
    { name: 'sofa', label: 'Уют' },
    { name: 'watch', label: 'Покупки' },
    { name: 'wallet', label: 'Копилка' },
    { name: 'trending-up', label: 'Инвестиции' }
  ];

  grid.innerHTML = iconsList.map(item => {
    const isSelected = currentVal === item.name;
    return `
      <button type="button" 
              onclick="selectGoalIcon('${item.name}')" 
              class="h-10 rounded-xl ${isSelected ? 'bg-[#6C5DD3]/25 border-[#6C5DD3] text-[#727cff]' : 'hover:bg-[#212430] border-transparent text-gray-300 hover:text-white'} border flex flex-col items-center justify-center p-1 transition-all cursor-pointer group" 
              title="${item.label}">
        <i data-lucide="${item.name}" class="w-4 h-4 group-hover:scale-110 transition-transform"></i>
        <span class="text-[8px] mt-0.5 truncate w-full text-center leading-none ${isSelected ? 'text-[#727cff] font-bold' : 'text-[#848D99]'}">${item.label}</span>
      </button>
    `;
  }).join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function selectGoalIcon(iconName) {
  const input = document.getElementById('goal-icon-input');
  if (input) input.value = iconName;

  const display = document.getElementById('goal-modal-icon-display');
  const btn = document.getElementById('goal-modal-icon-btn');
  const label = document.getElementById('goal-modal-icon-label');
  const iconsList = (typeof WIZARD_GOAL_ICONS !== 'undefined') ? WIZARD_GOAL_ICONS : [];
  const found = iconsList.find(i => i.name === iconName);

  if (display) {
    display.className = 'text-[#727cff] flex items-center justify-center transition-colors';
    display.innerHTML = `<i data-lucide="${iconName}" class="w-6 h-6"></i>`;
  }
  if (btn) {
    btn.className = 'w-14 h-14 rounded-2xl bg-[#6C5DD3]/15 border border-[#6C5DD3]/40 flex items-center justify-center transition-all cursor-pointer shadow-inner active:scale-95 group flex-shrink-0';
  }
  if (label) {
    label.innerText = found ? found.label : 'Выбрать иконку';
  }

  closeBudgetGoalIconPicker();
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function handleGoalNameInput(name) {
  const currentVal = document.getElementById('goal-icon-input')?.value;
  if (!currentVal || currentVal === 'target') {
    const detected = getGoalIcon(name);
    if (detected && detected !== currentVal) {
      selectGoalIcon(detected);
    }
  }
}

// Умный определитель векторной иконки цели по смыслу названия
function getGoalIcon(name) {
  const n = (name || '').toLowerCase();
  if (/квартир|дом|ремонт|жиль/i.test(n)) return 'home';
  if (/машин|авто|тачк|мото/i.test(n)) return 'car';
  if (/отпуск|море|путешеств|билет|тур/i.test(n)) return 'plane';
  if (/учеб|курс|образов/i.test(n)) return 'graduation-cap';
  if (/подушк|безопасн|резерв/i.test(n)) return 'shield-check';
  if (/инвест|акци/i.test(n)) return 'trending-up';
  if (/телефон|ноут|комп|айфон|гаджет/i.test(n)) return 'smartphone';
  return 'target';
}

// Управление созданием и редактированием целей бюджета
function openGoalModal() {
  const form = document.getElementById('budget-goal-form');
  if (form) form.reset();

  document.getElementById('goal-edit-id').value = '';
  document.getElementById('goal-share-input').value = 100;
  document.getElementById('goal-share-label').innerText = '100%';
  document.getElementById('goal-delete-btn').classList.add('hidden');
  document.getElementById('budget-goal-dialog-title').innerText = 'Новая цель';

  closeBudgetGoalIconPicker();
  selectGoalIcon('target');
  const addGoalBtn = document.getElementById('goal-modal-icon-btn');
  if (addGoalBtn) {
    addGoalBtn.className = 'w-14 h-14 rounded-2xl bg-[#12151C] hover:bg-[#212430] border border-dashed border-[#727cff]/40 hover:border-[#727cff] flex items-center justify-center transition-all cursor-pointer shadow-inner active:scale-95 group flex-shrink-0';
  }

  const dlg = document.getElementById('budget-goal-dialog');
  if (dlg) dlg.classList.remove('hidden');
}

function closeGoalModal() {
  const dlg = document.getElementById('budget-goal-dialog');
  if (dlg) dlg.classList.add('hidden');
  closeBudgetGoalIconPicker();
  document.querySelectorAll('.card[data-table="Goals"].context-active').forEach(el => el.classList.remove('context-active'));
}

function openEditGoalModal(goalId) {
  if (typeof isSelectionMode === 'function' && isSelectionMode()) return;
  if (window.isSelectionMode && window.isSelectionMode()) return;
  const goal = Cache?.goals?.find(g => g.id === goalId);
  if (!goal) return;

  document.querySelectorAll('.card[data-table="Goals"].context-active').forEach(el => el.classList.remove('context-active'));
  const goalCard = document.querySelector(`.card[data-table="Goals"][data-id="${goalId}"]`);
  if (goalCard) goalCard.classList.add('context-active');

  document.getElementById('goal-edit-id').value = goal.id;
  document.getElementById('goal-name-input').value = goal.name;
  setFormattedVal('goal-target-input', goal.target);
  setFormattedVal('goal-saved-input', goal.saved);
  document.getElementById('goal-share-input').value = goal.share || 100;
  document.getElementById('goal-share-label').innerText = (goal.share || 100) + '%';
  document.getElementById('goal-delete-btn').classList.remove('hidden');
  document.getElementById('budget-goal-dialog-title').innerText = 'Редактировать цель';

  closeBudgetGoalIconPicker();
  const initialIcon = goal.icon || getGoalIcon(goal.name) || 'target';
  selectGoalIcon(initialIcon);

  const dlg = document.getElementById('budget-goal-dialog');
  if (dlg) dlg.classList.remove('hidden');
}

async function submitBudgetGoal(e) {
  e.preventDefault();
  const editId = document.getElementById('goal-edit-id').value;
  const name = document.getElementById('goal-name-input').value.trim();
  const target = getUnformattedVal(document.getElementById('goal-target-input'));
  const saved = getUnformattedVal(document.getElementById('goal-saved-input'));
  const share = parseInt(document.getElementById('goal-share-input').value, 10) || 100;
  const icon = document.getElementById('goal-icon-input')?.value || getGoalIcon(name) || 'target';

  if (!name || !target) return;

  try {
    const col = getUserCol('Goals');
    const goalData = {
      name,
      target,
      saved,
      share,
      icon,
      status: saved >= target ? 'Выполнена' : 'В процессе',
      updatedAt: Date.now()
    };

    if (editId) {
      await col.doc(editId).update(goalData);
    } else {
      await col.add({ ...goalData, createdAt: Date.now() });
    }

    closeGoalModal();
    await fetchAllData();
  } catch (err) {
    showToast('Ошибка: ' + err.message, true);
  }
}

async function deleteCurrentEditingGoal() {
  const editId = document.getElementById('goal-edit-id').value;
  if (!editId) return;

  try {
    await getUserCol('Goals').doc(editId).delete();
    closeGoalModal();
    await fetchAllData();
  } catch (err) {
    showToast('Ошибка: ' + err.message, true);
  }
}

function deleteBudgetGoal(goalId, goalName) {
  showDialog('Удаление цели', `Удалить цель "${goalName}"? Накопленный прогресс будет удален.`, true, async () => {
    try {
      await getUserCol('Goals').doc(goalId).delete();
      await fetchAllData();
    } catch (e) {
      showToast('Ошибка удаления', true);
    }
  });
}

function openGoalTopupModal(goalId, goalName) {
  document.querySelectorAll('.card[data-table="Goals"].context-active').forEach(el => el.classList.remove('context-active'));
  const goalCard = document.querySelector(`.card[data-table="Goals"][data-id="${goalId}"]`);
  if (goalCard) goalCard.classList.add('context-active');

  activeTopupGoalId = goalId;
  const dlg = document.getElementById('goal-topup-dialog');
  const title = document.getElementById('goal-topup-title');
  if (title) title.innerText = goalName;
  document.getElementById('goal-topup-amount').value = '';
  setTopupMode('add');
  if (dlg) dlg.classList.remove('hidden');
}

function closeGoalTopupModal() {
  const dlg = document.getElementById('goal-topup-dialog');
  if (dlg) dlg.classList.add('hidden');
  document.querySelectorAll('.card[data-table="Goals"].context-active').forEach(el => el.classList.remove('context-active'));
  activeTopupGoalId = null;
}

function setTopupMode(mode) {
  currentTopupMode = mode;
  const addBtn = document.getElementById('tab-topup-add');
  const subBtn = document.getElementById('tab-topup-sub');
  if (mode === 'add') {
    addBtn.className = 'flex-1 py-1.5 rounded-lg font-semibold bg-[#212430] text-white transition-all';
    subBtn.className = 'flex-1 py-1.5 rounded-lg font-medium text-[#848D99] hover:text-white transition-all';
  } else {
    subBtn.className = 'flex-1 py-1.5 rounded-lg font-semibold bg-[#212430] text-white transition-all';
    addBtn.className = 'flex-1 py-1.5 rounded-lg font-medium text-[#848D99] hover:text-white transition-all';
  }
}

async function submitGoalTopup() {
  if (!activeTopupGoalId) return;
  const amount = getUnformattedVal(document.getElementById('goal-topup-amount'));
  if (!amount) return;

  const goal = Cache?.goals?.find(g => g.id === activeTopupGoalId);
  if (!goal) return;

  let newSaved = currentTopupMode === 'add' ? (goal.saved + amount) : Math.max(0, goal.saved - amount);

  try {
    await getUserCol('Goals').doc(activeTopupGoalId).update({ saved: newSaved });
    closeGoalTopupModal();
    await fetchAllData();
  } catch (err) {
    showToast('Ошибка: ' + err.message, true);
  }
}

// ==========================================
// 4. Budget Wizard (Мастер настройки)
// ==========================================

// Каталог векторных иконок целей (Lucide Icons)
const WIZARD_GOAL_ICONS = [
  { name: 'target', label: 'Цель' },
  { name: 'shield-check', label: 'Подушка' },
  { name: 'home', label: 'Жилье' },
  { name: 'car', label: 'Авто' },
  { name: 'plane', label: 'Отпуск' },
  { name: 'laptop', label: 'Ноутбук' },
  { name: 'smartphone', label: 'Гаджет' },
  { name: 'graduation-cap', label: 'Учеба' },
  { name: 'sparkles', label: 'Мечта' },
  { name: 'heart-pulse', label: 'Здоровье' },
  { name: 'gem', label: 'Подарок' },
  { name: 'bike', label: 'Спорт' },
  { name: 'baby', label: 'Семья' },
  { name: 'briefcase', label: 'Бизнес' },
  { name: 'sofa', label: 'Уют' },
  { name: 'watch', label: 'Покупки' },
  { name: 'wallet', label: 'Копилка' },
  { name: 'trending-up', label: 'Инвестиции' },
  { name: 'anchor', label: 'Резерв' },
  { name: 'camera', label: 'Хобби' },
  { name: 'music', label: 'Музыка' },
  { name: 'coffee', label: 'Отдых' },
  { name: 'gift', label: 'Праздник' },
  { name: 'key', label: 'Ключи' }
];

function renderWizardIconGrid() {
  const grid = document.getElementById('wiz-icon-grid');
  if (!grid) return;

  grid.innerHTML = WIZARD_GOAL_ICONS.map(item => {
    const isSelected = wizGoalIcon === item.name;
    return `
      <button type="button" 
              onclick="selectWizardGoalIcon('${item.name}')" 
              class="h-10 rounded-xl ${isSelected ? 'bg-[#6C5DD3]/25 border-[#6C5DD3] text-[#727cff]' : 'hover:bg-[#212430] border-transparent text-gray-300 hover:text-white'} border flex flex-col items-center justify-center p-1 transition-all cursor-pointer group" 
              title="${item.label}">
        <i data-lucide="${item.name}" class="w-4 h-4 group-hover:scale-110 transition-transform"></i>
        <span class="text-[8px] mt-0.5 truncate w-full text-center leading-none ${isSelected ? 'text-[#727cff] font-bold' : 'text-[#848D99]'}">${item.label}</span>
      </button>
    `;
  }).join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function resetWizGoalIconDisplay() {
  const display = document.getElementById('wiz-goal-icon-display');
  const btn = document.getElementById('wiz-goal-icon-btn');
  const label = document.getElementById('wiz-goal-icon-label');

  if (display) {
    display.className = 'text-gray-400 group-hover:text-[#727cff] flex items-center justify-center transition-colors';
    display.innerHTML = '<i data-lucide="image-plus" class="w-6 h-6"></i>';
  }
  if (btn) {
    btn.className = 'w-14 h-14 rounded-2xl bg-[#212430] hover:bg-[#2A2D3C] border border-dashed border-[#727cff]/40 hover:border-[#727cff] flex items-center justify-center transition-all cursor-pointer shadow-inner active:scale-95 group flex-shrink-0';
  }
  if (label) {
    label.innerText = 'Выбрать иконку';
  }
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function initBudgetWizard(forceReset = false) {
  const gName = document.getElementById('wiz-goal-name');
  const gTarget = document.getElementById('wiz-goal-target');
  const gSaved = document.getElementById('wiz-goal-saved');
  const incInput = document.getElementById('wiz-income-input');

  const hasExistingGoal = Cache?.goals && Cache.goals.length > 0;
  const existingPlan = Cache?.budgetPlan || {};

  if (forceReset) {
    currentWizardStep = 1;
    localStorage.setItem('budget_wizard_step', '1');
  } else {
    currentWizardStep = parseInt(localStorage.getItem('budget_wizard_step'), 10) || 1;
  }

  // Заполняем доходы, если уже были сохранены
  if (existingPlan.monthlyIncome && incInput) {
    incInput.value = formatMoney(existingPlan.monthlyIncome);
  }

  // Заполняем кастомные категории из сохраненного плана, если есть
  if (existingPlan.categoryLimits) {
    const standardCats = ['Продукты', 'Кафе и рестораны', 'Развлечения', 'Прочие расходы', 'Прочие траты'];
    Object.keys(existingPlan.categoryLimits).forEach(cat => {
      if (!standardCats.includes(cat)) {
        wizardCustomCategories.add(cat);
      }
    });
  }

  if (hasExistingGoal) {
    const firstGoal = Cache.goals[0];
    if (gName) gName.value = firstGoal.name || '';
    if (gTarget) gTarget.value = firstGoal.target ? formatMoney(firstGoal.target) : '';
    if (gSaved) gSaved.value = firstGoal.saved ? formatMoney(firstGoal.saved) : '';
    if (firstGoal.icon) {
      selectWizardGoalIcon(firstGoal.icon);
    } else if (!wizGoalIcon) {
      resetWizGoalIconDisplay();
    }
  } else {
    if (gName) gName.value = '';
    if (gTarget) gTarget.value = '';
    if (gSaved) gSaved.value = '';
    wizGoalIcon = null;
    resetWizGoalIconDisplay();
  }
  updateWizGoalSlider();

  renderWizardIconGrid();
  goToWizardStep(currentWizardStep);
  renderWizardIncomeSources();
  calculateHistoricalIncomeForWizard();
}

function openBudgetPlanWizardReview() {
  if (typeof unlockBodyScroll === 'function') unlockBodyScroll(true);
  document.body.classList.remove('modal-open');
  document.body.style.top = '';

  if (typeof switchTab === 'function') {
    switchTab('budget');
  }

  const wizardEl = document.getElementById('budget-wizard');
  const dashboardEl = document.getElementById('budget-dashboard');
  if (wizardEl) wizardEl.classList.remove('hidden');
  if (dashboardEl) dashboardEl.classList.add('hidden');

  localStorage.setItem('budget_wizard_step', '1');
  currentWizardStep = 1;

  initBudgetWizard(true);

  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
}

function goToWizardStep(step) {
  currentWizardStep = step;
  localStorage.setItem('budget_wizard_step', String(step));

  for (let i = 1; i <= 5; i++) {
    const stepEl = document.getElementById(`wizard-step-${i}`);
    const progEl = document.getElementById(`wiz-progress-${i}`);
    if (stepEl) {
      if (i === step) stepEl.classList.remove('hidden');
      else stepEl.classList.add('hidden');
    }
    if (progEl) {
      progEl.className = i <= step 
        ? 'h-full rounded-full bg-[#6C5DD3] transition-colors duration-300' 
        : 'h-full rounded-full bg-[rgba(255,255,255,0.08)] transition-colors duration-300';
    }
  }

  const badge = document.getElementById('wizard-step-badge');
  const title = document.getElementById('wizard-step-title');

  const titles = [
    'Создайте цель накопления',
    'Планируемый доход',
    'Календарь обязательных счетов',
    'Месячные лимиты расходов',
    'Итоговый план бюджета'
  ];

  if (badge) badge.innerText = `Шаг ${step} из 5`;
  if (title) title.innerText = titles[step - 1] || 'Настройка';

  if (step === 1) {
    updateWizGoalSlider();
    if (!wizGoalIcon) resetWizGoalIconDisplay();
  }
  else if (step === 2) {
    renderWizardIncomeSources();
    calculateHistoricalIncomeForWizard();
  }
  else if (step === 3) renderWizCalendar();
  else if (step === 4) renderWizLimitsEditor();
  else if (step === 5) calculateAndRenderWizSummary();

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function openWizardIconPicker() {
  const picker = document.getElementById('wiz-icon-picker');
  if (picker) {
    picker.classList.toggle('hidden');
    if (!picker.classList.contains('hidden')) {
      renderWizardIconGrid();
    }
  }
}

function selectWizardGoalIcon(icon) {
  wizGoalIcon = icon;
  const display = document.getElementById('wiz-goal-icon-display');
  const btn = document.getElementById('wiz-goal-icon-btn');
  const label = document.getElementById('wiz-goal-icon-label');

  if (display) {
    display.className = 'text-[#727cff] flex items-center justify-center';
    display.innerHTML = `<i data-lucide="${icon}" class="w-6 h-6"></i>`;
  }
  if (btn) {
    btn.className = 'w-14 h-14 rounded-2xl bg-[#6C5DD3]/15 border border-[#6C5DD3]/40 flex items-center justify-center transition-all cursor-pointer shadow-inner active:scale-95 group flex-shrink-0';
  }
  if (label) {
    label.innerText = 'Изменить иконку';
  }
  const picker = document.getElementById('wiz-icon-picker');
  if (picker) picker.classList.add('hidden');
  renderWizardIconGrid();
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function updateWizGoalSlider() {
  const target = getUnformattedVal(document.getElementById('wiz-goal-target'));
  const saved = getUnformattedVal(document.getElementById('wiz-goal-saved'));

  const label = document.getElementById('wiz-goal-pct-label');
  const bar = document.getElementById('wiz-goal-progress-bar');

  if (!target || target <= 0) {
    if (label) label.innerText = '0%';
    if (bar) bar.style.width = '0%';
    return;
  }

  const pct = Math.min(100, Math.max(0, Math.round((saved / target) * 1000) / 10));
  if (label) label.innerText = `${pct}%`;
  if (bar) bar.style.width = `${pct}%`;
}

function recalculateWizardIncome() {
  const txMonths = Cache?.transactions || [];
  const calcEl = document.getElementById('wiz-calculated-income');
  const inputEl = document.getElementById('wiz-income-input');

  if (!txMonths || txMonths.length === 0) {
    if (calcEl) calcEl.innerText = '0 ₽/мес';
    return 0;
  }

  const monthsCount = Math.max(1, Math.min(3, txMonths.length));
  let totalIncome = 0;

  for (let i = 0; i < monthsCount; i++) {
    const items = txMonths[i].items || [];
    items.forEach(tx => {
      if (tx.type === 'Доход') {
        const cat = tx.category || 'Другое';
        if (wizardActiveIncomeSources.has(cat)) {
          const uid = tx.id || tx._id || `${tx.timestamp || tx.rawDate || ''}_${tx.amount}_${tx.merchant || tx.title || ''}`;
          if (window.wizardExcludedTxIds && window.wizardExcludedTxIds.has(uid)) return;

          totalIncome += (parseFloat(tx.amount) || 0);
        }
      }
    });
  }

  const avgIncome = Math.round(totalIncome / monthsCount);
  
  if (calcEl) calcEl.innerText = `${formatMoney(avgIncome)}/мес`;
  if (inputEl && (!inputEl.value || inputEl.value === '0 ₽' || inputEl.value === '0')) {
    inputEl.value = formatMoney(avgIncome);
  }
  return avgIncome;
}

function adoptCalculatedIncome() {
  const calcText = document.getElementById('wiz-calculated-income')?.innerText || '0';
  const val = parseInt(calcText.replace(/[^\d]/g, ''), 10) || 0;
  const input = document.getElementById('wiz-income-input');
  if (input && val > 0) {
    input.value = formatMoney(val);
  } else {
    showToast('Сначала рассчитайте доход или введите сумму вручную', true);
  }
}

function renderWizardIncomeSources() {
  const txMonths = Cache?.transactions || [];
  const detectedSources = new Set();

  txMonths.forEach(m => {
    (m.items || []).forEach(tx => {
      if (tx.type === 'Доход') {
        const cat = getCanonicalIncomeCategory(tx.category || 'Другое');
        if (cat) detectedSources.add(cat);
      }
    });
  });

  if (wizardActiveIncomeSources.size === 0 && detectedSources.size > 0) {
    detectedSources.forEach(s => wizardActiveIncomeSources.add(s));
  }
}

function calculateHistoricalIncomeForWizard() {
  renderWizardIncomeSources();
  return recalculateWizardIncome();
}

function addAnotherBillFromTooltip() {
  const day = currentWizSelectedDay || 1;
  const tooltip = document.getElementById('wiz-day-tooltip');
  if (tooltip) tooltip.classList.add('hidden');
  openAddBillModal(day);
}

function formatShortSum(val, forceRoundK = false) {
  val = parseFloat(val) || 0;
  if (val >= 1000000) {
    const m = (val / 1000000).toFixed(1);
    return m.endsWith('.0') ? `${Math.round(val / 1000000)}M` : `${m}M`;
  }
  if (val >= 10000 || forceRoundK) {
    return `${Math.round(val / 1000)}k`;
  }
  if (val >= 1000) {
    const k = (val / 1000).toFixed(1);
    return k.endsWith('.0') ? `${Math.round(val / 1000)}k` : `${k}k`;
  }
  return `${Math.round(val)}`;
}

// Standalone Budget Calendar Modal Functions
function openBudgetCalendarModal() {
  const dlg = document.getElementById('budget-calendar-modal');
  if (dlg) {
    if (typeof lockBodyScroll === 'function') lockBodyScroll();
    dlg.classList.remove('hidden');
    renderWizCalendar();
  }
}

function closeBudgetCalendarModal() {
  const dlg = document.getElementById('budget-calendar-modal');
  if (dlg) {
    dlg.classList.add('hidden');
    if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
  }
  closeBudgetModalDayTooltip();
}

function closeBudgetModalDayTooltip() {
  const tooltip = document.getElementById('budget-modal-day-tooltip');
  if (tooltip) tooltip.classList.add('hidden');
  currentWizSelectedDay = null;
  document.querySelectorAll('#budget-modal-calendar-grid .wiz-day-cell.is-selected').forEach(el => el.classList.remove('is-selected'));
}

function addAnotherBillFromBudgetModalTooltip() {
  const day = currentWizSelectedDay || 1;
  closeBudgetModalDayTooltip();
  openAddBillModal(day);
}

// Рендер сетки календаря в Мастере и в Модальном календаре Бюджета
function renderWizCalendar() {
  const gridWiz = document.getElementById('wiz-calendar-grid');
  const gridModal = document.getElementById('budget-modal-calendar-grid');
  const totalLabelWiz = document.getElementById('wiz-bills-total-label');
  const totalLabelModal = document.getElementById('budget-modal-bills-total');
  
  if (!gridWiz && !gridModal) return;

  const today = new Date();
  const allBills = Cache?.calendarBills || [];
  const bills = allBills.filter(b => getOneTimeBillMonthInfo(b, today).isActive);
  const totalSum = bills.reduce((acc, b) => acc + (parseFloat(b.amount) || 0), 0);
  const formattedSum = formatMoney(totalSum);

  if (totalLabelWiz) totalLabelWiz.innerText = formattedSum;
  if (totalLabelModal) totalLabelModal.innerText = formattedSum;

  let html = '';

  for (let day = 1; day <= 31; day++) {
    const dayBills = bills.filter(b => parseInt(b.day, 10) === day);
    const count = dayBills.length;
    const hasBills = count > 0;
    const isSelected = day === currentWizSelectedDay;

    let chipsHtml = '';
    if (count === 1) {
      const b = dayBills[0];
      const info = getOneTimeBillMonthInfo(b, today);
      const formatted = formatShortSum(b.amount, false);
      const spreadHint = info.isSpread ? ` (${info.currentStep}/${info.totalSteps})` : (info.isOneTime ? ' (Разовый)' : ' (Ежемесячно)');
      chipsHtml = `
        <div class="wiz-chips-wrap">
          <span class="wiz-bill-chip is-single ${info.isOneTime ? 'is-onetime' : 'is-recurring'}" title="${escapeHtml(b.name)}: ${formatMoney(b.amount)}${spreadHint}">${formatted}</span>
        </div>
      `;
    } else if (count === 2) {
      chipsHtml = `<div class="wiz-chips-wrap">${dayBills.map(b => {
        const info = getOneTimeBillMonthInfo(b, today);
        const formatted = formatShortSum(b.amount, true);
        const spreadHint = info.isSpread ? ` (${info.currentStep}/${info.totalSteps})` : (info.isOneTime ? ' (Разовый)' : ' (Ежемесячно)');
        return `<span class="wiz-bill-chip ${info.isOneTime ? 'is-onetime' : 'is-recurring'}" title="${escapeHtml(b.name)}: ${formatMoney(b.amount)}${spreadHint}">${formatted}</span>`;
      }).join('')}</div>`;
    } else if (count > 2) {
      const totalDaySum = dayBills.reduce((acc, b) => acc + (parseFloat(b.amount) || 0), 0);
      const formatted = formatShortSum(totalDaySum, true);
      chipsHtml = `
        <div class="wiz-chips-wrap">
          <span class="wiz-bill-chip is-multi" title="${count} платежей на сумму ${formatMoney(totalDaySum)}">
            ${formatted}
            <span class="wiz-count-badge">${count}</span>
          </span>
        </div>
      `;
    }

    html += `
      <div data-wiz-day="${day}" onclick="handleWizardDayClick(${day}, event)" class="wiz-day-cell ${isSelected ? 'is-selected' : ''} ${hasBills ? 'has-bills' : ''}">
        <span class="wiz-day-num">${day}</span>
        ${chipsHtml}
      </div>
    `;
  }

  if (gridWiz) gridWiz.innerHTML = html;
  if (gridModal) gridModal.innerHTML = html;
}

function handleWizardDayClick(day, event) {
  if (event) event.stopPropagation();
  const targetDay = parseInt(day, 10) || 1;
  currentWizSelectedDay = targetDay;
  const today = new Date();
  const bills = (Cache?.calendarBills || []).filter(b => parseInt(b.day, 10) === targetDay && getOneTimeBillMonthInfo(b, today).isActive);

  const isModalCalendar = !!event?.target?.closest('#budget-modal-calendar-wrapper') || (!document.getElementById('wizard-step-3')?.classList.contains('hidden') === false && !document.getElementById('budget-calendar-modal')?.classList.contains('hidden'));

  if (bills.length === 0) {
    if (isModalCalendar) {
      closeBudgetModalDayTooltip();
    } else {
      const tooltip = document.getElementById('wiz-day-tooltip');
      if (tooltip) tooltip.classList.add('hidden');
    }
    openAddBillModal(targetDay);
  } else {
    const targetEl = event?.currentTarget || (isModalCalendar 
      ? document.querySelector(`#budget-modal-calendar-grid [data-wiz-day="${targetDay}"]`)
      : document.querySelector(`#wiz-calendar-grid [data-wiz-day="${targetDay}"]`));
    
    if (isModalCalendar) {
      showBudgetModalDayTooltip(targetDay, bills, targetEl);
    } else {
      showWizDayTooltip(targetDay, bills, targetEl);
    }
  }
  renderWizCalendar();
}

function showBudgetModalDayTooltip(day, bills, targetEl) {
  const tooltip = document.getElementById('budget-modal-day-tooltip');
  const dayBadge = document.getElementById('budget-modal-tooltip-day-badge');
  const title = document.getElementById('budget-modal-tooltip-title');
  const list = document.getElementById('budget-modal-tooltip-bills-list');
  const addLabel = document.getElementById('budget-modal-tooltip-add-label');
  const wrapper = document.getElementById('budget-modal-calendar-wrapper');

  if (!tooltip || !list || !wrapper) return;

  if (dayBadge) dayBadge.innerText = `${day}`;
  if (title) title.innerText = `Платежи (${bills.length})`;
  if (addLabel) addLabel.innerText = `Добавить еще платеж на ${day} число`;

  const today = new Date();
  list.innerHTML = bills.map(b => {
    const info = getOneTimeBillMonthInfo(b, today);
    return `
      <div class="flex items-center justify-between p-2 rounded-xl bg-[#12151C] border border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)] transition-all">
        <div class="min-w-0 pr-2 cursor-pointer flex-1" onclick="openEditBillModal('${b.id}')">
          <div class="flex items-center gap-1.5 mb-0.5">
            <span class="text-xs font-semibold text-white truncate block">${escapeHtml(b.name)}</span>
            ${info.isSpread 
              ? `<span class="text-[8px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-0.5 flex-shrink-0 font-medium font-mono"><i data-lucide="split" class="w-2.5 h-2.5"></i>${info.currentStep}/${info.totalSteps}</span>` 
              : (info.isOneTime 
                ? `<span class="text-[8px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-0.5 flex-shrink-0 font-medium"><i data-lucide="zap" class="w-2.5 h-2.5"></i>Разовый</span>` 
                : `<span class="text-[8px] px-1.5 py-0.2 rounded bg-[#6C5DD3]/20 text-[#a594fd] border border-[#6C5DD3]/30 flex items-center gap-0.5 flex-shrink-0 font-medium">Ежемесячно</span>`
              )
            }
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-[11px] font-mono font-bold text-gray-200">-${formatMoney(b.amount)}</span>
            ${info.isSpread ? `<span class="text-[9px] text-[#848D99] font-mono">из ${formatMoney(b.totalAmount || (b.amount * b.spreadMonths))}</span>` : ''}
          </div>
        </div>
        <div class="flex items-center gap-1 flex-shrink-0">
          <button type="button" onclick="openEditBillModal('${b.id}')" class="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-[#212430] cursor-pointer transition-colors" title="Редактировать">
            <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
          </button>
          <button type="button" onclick="deleteCalendarBill('${b.id}')" class="text-gray-400 hover:text-[#FF453A] p-1 rounded-lg hover:bg-[#212430] cursor-pointer transition-colors" title="Удалить">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();

  tooltip.classList.remove('hidden');

  const cell = targetEl || document.querySelector(`#budget-modal-calendar-grid [data-wiz-day="${day}"]`);
  if (!cell) return;

  const wrapperRect = wrapper.getBoundingClientRect();
  const cellRect = cell.getBoundingClientRect();

  const cellTop = cellRect.top - wrapperRect.top;
  const cellLeft = cellRect.left - wrapperRect.left;
  const cellWidth = cellRect.width;
  const cellHeight = cellRect.height;

  const tooltipWidth = tooltip.offsetWidth || 260;
  const tooltipHeight = tooltip.offsetHeight || 180;

  let left = cellLeft + (cellWidth / 2) - (tooltipWidth / 2);
  const minLeft = 8;
  const maxLeft = Math.max(minLeft, wrapperRect.width - tooltipWidth - 8);
  left = Math.max(minLeft, Math.min(left, maxLeft));

  const spaceBelow = wrapperRect.height - (cellTop + cellHeight);
  const spaceAbove = cellTop;

  let top = 0;
  if (spaceBelow >= tooltipHeight + 12 || spaceBelow >= spaceAbove) {
    top = cellTop + cellHeight + 6;
  } else {
    top = Math.max(6, cellTop - tooltipHeight - 6);
  }

  tooltip.style.left = `${Math.round(left)}px`;
  tooltip.style.top = `${Math.round(top)}px`;
}

function showWizDayTooltip(day, bills, targetEl) {
  const tooltip = document.getElementById('wiz-day-tooltip');
  const dayBadge = document.getElementById('wiz-tooltip-day-badge');
  const title = document.getElementById('wiz-tooltip-title');
  const list = document.getElementById('wiz-tooltip-bills-list');
  const addLabel = document.getElementById('wiz-tooltip-add-label');
  const wrapper = document.getElementById('wiz-calendar-wrapper');

  if (!tooltip || !list || !wrapper) return;

  if (dayBadge) dayBadge.innerText = `${day}`;
  if (title) title.innerText = `Платежи (${bills.length})`;
  if (addLabel) addLabel.innerText = `Добавить еще платеж на ${day} число`;

  const today = new Date();
  list.innerHTML = bills.map(b => {
    const info = getOneTimeBillMonthInfo(b, today);
    return `
      <div class="flex items-center justify-between p-2 rounded-xl bg-[#12151C] border border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)] transition-all">
        <div class="min-w-0 pr-2 cursor-pointer flex-1" onclick="openEditBillModal('${b.id}')">
          <div class="flex items-center gap-1.5 mb-0.5">
            <span class="text-xs font-semibold text-white truncate block">${escapeHtml(b.name)}</span>
            ${info.isSpread 
              ? `<span class="text-[8px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-0.5 flex-shrink-0 font-medium font-mono"><i data-lucide="split" class="w-2.5 h-2.5"></i>${info.currentStep}/${info.totalSteps}</span>` 
              : (info.isOneTime 
                ? `<span class="text-[8px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-0.5 flex-shrink-0 font-medium"><i data-lucide="zap" class="w-2.5 h-2.5"></i>Разовый</span>` 
                : `<span class="text-[8px] px-1.5 py-0.2 rounded bg-[#6C5DD3]/20 text-[#a594fd] border border-[#6C5DD3]/30 flex items-center gap-0.5 flex-shrink-0 font-medium">Ежемесячно</span>`
              )
            }
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-[11px] font-mono font-bold text-gray-200">-${formatMoney(b.amount)}</span>
            ${info.isSpread ? `<span class="text-[9px] text-[#848D99] font-mono">из ${formatMoney(b.totalAmount || (b.amount * b.spreadMonths))}</span>` : ''}
          </div>
        </div>
        <div class="flex items-center gap-1 flex-shrink-0">
          <button type="button" onclick="openEditBillModal('${b.id}')" class="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-[#212430] cursor-pointer transition-colors" title="Редактировать">
            <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
          </button>
          <button type="button" onclick="deleteCalendarBill('${b.id}')" class="text-gray-400 hover:text-[#FF453A] p-1 rounded-lg hover:bg-[#212430] cursor-pointer transition-colors" title="Удалить">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();

  // Открываем тултип для замера размеров
  tooltip.classList.remove('hidden');

  const cell = targetEl || document.querySelector(`[data-wiz-day="${day}"]`);
  if (!cell) return;

  const wrapperRect = wrapper.getBoundingClientRect();
  const cellRect = cell.getBoundingClientRect();

  const cellTop = cellRect.top - wrapperRect.top;
  const cellLeft = cellRect.left - wrapperRect.left;
  const cellWidth = cellRect.width;
  const cellHeight = cellRect.height;

  const tooltipWidth = tooltip.offsetWidth || 260;
  const tooltipHeight = tooltip.offsetHeight || 180;

  // Центрируем по горизонтали относительно ячейки, но не даем вылезти за пределы календаря
  let left = cellLeft + (cellWidth / 2) - (tooltipWidth / 2);
  const minLeft = 8;
  const maxLeft = Math.max(minLeft, wrapperRect.width - tooltipWidth - 8);
  left = Math.max(minLeft, Math.min(left, maxLeft));

  // Выбираем позиционирование: сверху или снизу от ячейки
  const spaceBelow = wrapperRect.height - (cellTop + cellHeight);
  const spaceAbove = cellTop;

  let top = 0;
  if (spaceBelow >= tooltipHeight + 12 || spaceBelow >= spaceAbove) {
    top = cellTop + cellHeight + 6;
  } else {
    top = Math.max(6, cellTop - tooltipHeight - 6);
  }

  tooltip.style.left = `${Math.round(left)}px`;
  tooltip.style.top = `${Math.round(top)}px`;
}

function closeWizDayTooltip() {
  const tooltip = document.getElementById('wiz-day-tooltip');
  if (tooltip) tooltip.classList.add('hidden');
  currentWizSelectedDay = null;
  document.querySelectorAll('.wiz-day-cell.is-selected').forEach(el => el.classList.remove('is-selected'));
}

// Закрытие тултипа при клике вне его области
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const target = (e?.target?.nodeType === 3) ? e.target.parentElement : e?.target;
    if (!target || typeof target.closest !== 'function') return;

    const tooltipWiz = document.getElementById('wiz-day-tooltip');
    if (tooltipWiz && !tooltipWiz.classList.contains('hidden')) {
      if (!tooltipWiz.contains(target) && !target.closest('.wiz-day-cell') && !target.closest('#calendar-bill-dialog')) {
        closeWizDayTooltip();
      }
    }

    const tooltipModal = document.getElementById('budget-modal-day-tooltip');
    if (tooltipModal && !tooltipModal.classList.contains('hidden')) {
      if (!tooltipModal.contains(target) && !target.closest('.wiz-day-cell') && !target.closest('#calendar-bill-dialog')) {
        closeBudgetModalDayTooltip();
      }
    }
  });
}

// Автоподгонка размера шрифта для лимитов категорий (чтобы шести- и семизначные суммы никогда не обрезались)
function fitWizLimitFont(input) {
  if (!input) return;
  const len = (input.value || '').length;
  input.classList.remove('text-xs', 'text-[11px]', 'text-[10px]');
  if (len > 8) {
    input.classList.add('text-[10px]');
  } else if (len > 6) {
    input.classList.add('text-[11px]');
  } else {
    input.classList.add('text-xs');
  }
}
window.fitWizLimitFont = fitWizLimitFont;

function renderWizLimitsEditor() {
  const container = document.getElementById('wiz-category-limits-editor');
  if (!container) return;

  const avgMap = calculateHistoricalCategoryAverages();

  // Стандартные 3 категории
  const list = [
    { name: 'Продукты', icon: 'shopping-cart' },
    { name: 'Кафе и рестораны', icon: 'utensils' },
    { name: 'Развлечения', icon: 'gamepad-2' }
  ];

  // Добавленные пользователем категории
  wizardCustomCategories.forEach(catName => {
    const catObj = Cache?.categories?.expense?.find(c => c.name === catName);
    list.push({ name: catName, icon: catObj?.icon || 'tag', isCustom: true });
  });

  // Собирательная категория «Прочие расходы»
  const accountedNames = list.map(c => c.name);
  let othersAvg = 0;
  Object.keys(avgMap).forEach(cat => {
    if (!accountedNames.includes(cat)) {
      othersAvg += avgMap[cat] || 0;
    }
  });
  avgMap['Прочие расходы'] = othersAvg;
  list.push({ name: 'Прочие расходы', icon: 'package' });

  container.innerHTML = list.map(cat => {
    const avg = Math.round(avgMap[cat.name] || 0);
    const existingVal = Cache.budgetPlan?.categoryLimits?.[cat.name] || (avg > 0 ? avg : '');

    return `
      <div class="py-2 px-3 rounded-2xl bg-[#12151C] border border-[rgba(255,255,255,0.04)] flex items-center justify-between gap-3">
        <div class="w-8 h-8 rounded-xl bg-[#1E2330] text-gray-300 flex items-center justify-center flex-shrink-0">
          <i data-lucide="${cat.icon}" class="w-4 h-4 text-[#848D99]"></i>
        </div>
        
        <div class="flex-1 min-w-0 pr-1">
          <div class="flex items-center gap-1.5">
            <span class="text-xs font-bold text-gray-200 truncate">${escapeHtml(cat.name)}</span>
            ${cat.isCustom ? `<button type="button" onclick="removeWizardCustomCat('${escapeHtml(cat.name)}')" class="text-gray-500 hover:text-[#FF453A] text-xs font-bold cursor-pointer">✕</button>` : ''}
          </div>
          ${avg > 0 ? `
            <div class="flex items-center gap-1 mt-0.5">
              <div onclick="applyWizCategoryAvg('${escapeHtml(cat.name)}', ${avg})" 
                   class="w-[100px] h-6 justify-between text-[10px] py-0.5 px-2 bg-[#6C5DD3]/10 text-[#727cff] hover:bg-[#6C5DD3]/20 border border-[#6C5DD3]/20 rounded-lg whitespace-nowrap flex items-center cursor-pointer transition-all active:scale-95 flex-shrink-0" 
                   title="Нажмите, чтобы применить среднее">
                <span class="truncate">Ср: ~${formatMoney(avg)}</span>
                <i data-lucide="arrow-right" class="w-2.5 h-2.5 flex-shrink-0 ml-1"></i>
              </div>
              <button type="button" 
                      onclick="openWizAvgDetailsModal('expense', '${escapeHtml(cat.name)}')" 
                      class="w-6 h-6 rounded-lg bg-[#1E2330] hover:bg-[#2A2D3C] text-[#727cff] border border-[rgba(255,255,255,0.06)] flex items-center justify-center flex-shrink-0 cursor-pointer transition-colors" 
                      title="Настройка транзакций в расчете">
                <i data-lucide="sliders-horizontal" class="w-3 h-3"></i>
              </button>
            </div>
          ` : `
            <div class="flex items-center gap-1 mt-0.5">
              <span class="text-[10px] text-[#848D99] w-[100px] block truncate">Ср: нет данных</span>
              <button type="button" 
                      onclick="openWizAvgDetailsModal('expense', '${escapeHtml(cat.name)}')" 
                      class="w-6 h-6 rounded-lg bg-[#1E2330] hover:bg-[#2A2D3C] text-gray-400 hover:text-white border border-[rgba(255,255,255,0.06)] flex items-center justify-center flex-shrink-0 cursor-pointer transition-colors" 
                      title="Просмотр и выбор транзакций">
                <i data-lucide="sliders-horizontal" class="w-3 h-3"></i>
              </button>
            </div>
          `}
        </div>

        <div class="w-[92px] flex-shrink-0" style="width: 92px;">
          <input type="text"
                 inputmode="decimal"
                 data-wiz-cat="${escapeHtml(cat.name)}"
                 oninput="formatSumInput(this); fitWizLimitFont(this); updateWizLiveTotal();"
                 value="${existingVal ? formatMoney(existingVal) : ''}"
                 placeholder="0 ₽"
                 class="w-full h-8 bg-[#161922] border border-[rgba(255,255,255,0.08)] text-white text-right font-mono font-semibold text-xs rounded-xl px-2 outline-none focus:border-[#6C5DD3] focus:bg-[#1A1E29] transition-all whitespace-nowrap">
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('input[data-wiz-cat]').forEach(inp => fitWizLimitFont(inp));
  updateWizLiveTotal();
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function openAddCategoryLimitPicker() {
  const allExpenseCats = Cache?.categories?.expense || [];
  const standardNames = ['Продукты', 'Кафе и рестораны', 'Развлечения', 'Прочие расходы'];
  
  const available = allExpenseCats.filter(c => !standardNames.includes(c.name) && !wizardCustomCategories.has(c.name));

  if (available.length === 0) {
    showAddCategoryDialog('Расход', null);
    return;
  }

  const listEl = document.getElementById('wiz-category-picker-list');
  const dlg = document.getElementById('wiz-category-picker-dialog');
  if (!listEl || !dlg) return;

  listEl.innerHTML = available.map(c => `
    <button type="button" onclick="addCategoryToWizard('${escapeHtml(c.name)}')" class="w-full flex items-center justify-between p-3 rounded-2xl bg-[#12151C] hover:bg-[#212430] border border-[rgba(255,255,255,0.04)] text-xs text-gray-200 transition-colors cursor-pointer active:scale-98">
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="w-7 h-7 rounded-xl bg-[#1E2330] text-gray-300 flex items-center justify-center flex-shrink-0">
          <i data-lucide="${c.icon || 'tag'}" class="w-3.5 h-3.5 text-[#848D99]"></i>
        </div>
        <span class="font-medium truncate">${escapeHtml(c.name)}</span>
      </div>
      <span class="w-6 h-6 rounded-lg bg-[#6C5DD3]/20 hover:bg-[#6C5DD3]/30 text-[#a594fd] font-bold text-sm flex items-center justify-center flex-shrink-0 ml-2 transition-colors">+</span>
    </button>
  `).join('');

  if (typeof lockBodyScroll === 'function') lockBodyScroll();
  dlg.classList.remove('hidden');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeAddCategoryLimitPicker() {
  const dlg = document.getElementById('wiz-category-picker-dialog');
  if (dlg) {
    dlg.classList.add('hidden');
    if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
  }
}

function addCategoryToWizard(catName) {
  wizardCustomCategories.add(catName);
  closeAddCategoryLimitPicker();
  renderWizLimitsEditor();
}

function removeWizardCustomCat(catName) {
  wizardCustomCategories.delete(catName);
  renderWizLimitsEditor();
}

function updateWizLiveTotal() {
  let total = 0;
  document.querySelectorAll('[data-wiz-cat]').forEach(inp => {
    total += getUnformattedVal(inp) || 0;
  });

  const totalEl = document.getElementById('wiz-limits-live-total');
  const weeklyEl = document.getElementById('wiz-live-weekly-estimate');
  if (totalEl) totalEl.innerText = `${formatMoney(total)}/мес`;
  if (weeklyEl) weeklyEl.innerText = `~${formatMoney(Math.round(total / 4.33))}`;
}

// Вспомогательная функция определения счетов и разовых выплат
function isBillOrOneTimeTx(tx) {
  if (!tx) return false;
  const isOneTime = (tx.billType === 'onetime') || (tx.spreadMonths && parseInt(tx.spreadMonths, 10) > 1) || (!tx.isBillPayment && !!tx.excludeFromBudget) || !!tx.isExcludedFromBudget;
  const isBill = !isOneTime && (!!tx.isBillPayment || (!!tx.billId && tx.billType !== 'onetime'));
  return isOneTime || isBill;
}
window.isBillOrOneTimeTx = isBillOrOneTimeTx;

// Вспомогательный расчет истории трат из выписок (строго за последние 90 дней)
function calculateHistoricalCategoryAverages() {
  const map = {};
  const txMonths = Cache?.transactions || [];
  if (!txMonths.length) return map;

  // 1. Находим самую свежую дату среди всех транзакций
  let maxTime = -Infinity;
  txMonths.forEach(m => {
    (m.items || []).forEach(tx => {
      const t = tx.timestamp || (tx.rawDate ? new Date(tx.rawDate).getTime() : null);
      if (t && t > maxTime) maxTime = t;
    });
  });

  if (maxTime === -Infinity) return map;

  // 90-дневное окно назад от самой свежей транзакции
  const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
  const cutoffTime = maxTime - ninetyDaysMs;

  let minTimeInWindow = Infinity;
  const catTotals = {};

  txMonths.forEach(m => {
    (m.items || []).forEach(tx => {
      const t = tx.timestamp || (tx.rawDate ? new Date(tx.rawDate).getTime() : null);
      if (!t || t < cutoffTime || t > maxTime) return;

      if (t < minTimeInWindow) minTimeInWindow = t;

      if (tx.type === 'Расход' && tx.category) {
        const uid = tx.id || tx._id || `${tx.timestamp || tx.rawDate || ''}_${tx.amount}_${tx.merchant || tx.title || ''}`;
        
        // Пропускаем вручную исключенные операции
        if (window.wizardExcludedTxIds && window.wizardExcludedTxIds.has(uid)) return;

        // Пропускаем ежемесячные счета и разовые выплаты
        if (isBillOrOneTimeTx(tx)) return;

        const val = parseFloat(tx.amount) || 0;
        catTotals[tx.category] = (catTotals[tx.category] || 0) + val;
      }
    });
  });

  const diffDays = minTimeInWindow !== Infinity
    ? Math.max(1, Math.round((maxTime - minTimeInWindow) / (1000 * 60 * 60 * 24)) + 1)
    : 30;
  const effectiveDays = Math.min(90, diffDays);
  const monthFactor = 30.44 / effectiveDays;

  Object.keys(catTotals).forEach(cat => {
    map[cat] = Math.round(catTotals[cat] * monthFactor);
  });

  return map;
}

// Расчет финансовой квитанции на Шаге 5
function calculateAndRenderWizSummary() {
  const income = getUnformattedVal(document.getElementById('wiz-income-input')) || 0;
  
  // Считаем обязательные регулярные платежи из календаря (разовые счета не учитываются в расчете ежемесячных трат)
  const bills = Cache.calendarBills || [];
  const recurringBills = bills.filter(b => b.type !== 'onetime' && b.type !== 'Разовый');
  const billsTotal = recurringBills.reduce((acc, b) => acc + (parseFloat(b.amount) || 0), 0);

  // Считаем сумму установленных лимитов
  let limitsTotal = 0;
  document.querySelectorAll('[data-wiz-cat]').forEach(inp => {
    limitsTotal += getUnformattedVal(inp) || 0;
  });

  // Чистый баланс месяца: Доход - Счета - Лимиты
  const balance = income - billsTotal - limitsTotal;
  const surplus = Math.max(0, balance);

  // Свободно в неделю из расчета баланса месяца
  const weeklyFree = Math.round(balance / 4.33);

  // Расчет срока цели
  const goalTarget = getUnformattedVal(document.getElementById('wiz-goal-target')) || 0;
  const goalSaved = getUnformattedVal(document.getElementById('wiz-goal-saved')) || 0;
  const remainingToGoal = Math.max(0, goalTarget - goalSaved);
  const monthsToGoal = surplus > 0 && remainingToGoal > 0 ? Math.ceil(remainingToGoal / surplus) : 0;

  // Форматирование квитанции
  document.getElementById('wiz-sum-income').innerText = formatMoney(income);
  document.getElementById('wiz-sum-bills').innerText = `-${formatMoney(billsTotal)}`;
  document.getElementById('wiz-sum-limits').innerText = `-${formatMoney(limitsTotal)}`;

  const surplusEl = document.getElementById('wiz-sum-surplus');
  if (surplusEl) {
    if (balance < 0) {
      surplusEl.innerText = `-${formatMoney(Math.abs(balance))}/мес`;
      surplusEl.className = 'text-base font-mono font-bold text-[#FF453A]';
    } else {
      surplusEl.innerText = `+${formatMoney(surplus)}/мес`;
      surplusEl.className = 'text-base font-mono font-bold text-[#727cff]';
    }
  }

  const weekEl = document.getElementById('wiz-sum-week');
  if (weekEl) {
    if (weeklyFree < 0) {
      weekEl.innerText = `-${formatMoney(Math.abs(weeklyFree))}`;
      weekEl.className = 'text-[#FF453A] font-mono font-bold text-sm mt-0.5 block';
    } else {
      weekEl.innerText = formatMoney(weeklyFree);
      weekEl.className = 'text-white font-mono font-bold text-sm mt-0.5 block';
    }
  }

  const timelineEl = document.getElementById('wiz-sum-timeline');
  if (timelineEl) {
    if (goalTarget <= 0) {
      timelineEl.innerText = 'Не задана сумма цели';
      timelineEl.className = 'text-[#848D99] font-medium text-xs mt-0.5 block truncate';
    } else if (remainingToGoal === 0) {
      timelineEl.innerText = 'Цель достигнута!';
      timelineEl.className = 'text-[#30D158] font-mono font-bold text-sm mt-0.5 block';
    } else if (surplus <= 0) {
      timelineEl.innerText = 'Нужен профицит';
      timelineEl.className = 'text-[#FF9F0A] font-mono font-bold text-sm mt-0.5 block';
    } else {
      const now = new Date();
      const targetDate = new Date(now.getFullYear(), now.getMonth() + monthsToGoal, 1);
      const monthsRu = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
      const targetDateStr = `${monthsRu[targetDate.getMonth()]} ${targetDate.getFullYear()}`;

      timelineEl.innerText = `~${monthsToGoal} мес. (${targetDateStr})`;
      timelineEl.className = 'text-[#32ADE6] font-mono font-bold text-sm mt-0.5 block';
    }
  }
}

async function finishBudgetOnboarding() {
  const goalName = document.getElementById('wiz-goal-name')?.value?.trim() || 'Моя цель';
  const goalTarget = getUnformattedVal(document.getElementById('wiz-goal-target')) || 0;
  const goalSaved = getUnformattedVal(document.getElementById('wiz-goal-saved')) || 0;
  const income = getUnformattedVal(document.getElementById('wiz-income-input')) || 0;
  const goalIcon = wizGoalIcon || getGoalIcon(goalName) || 'target';

  // 1. Собираем установленные лимиты категорий
  let limitsTotal = 0;
  const categoryLimits = {};
  document.querySelectorAll('[data-wiz-cat]').forEach(inp => {
    const val = getUnformattedVal(inp);
    if (val > 0) {
      limitsTotal += val;
      categoryLimits[inp.dataset.wizCat] = val;
    }
  });

  try {
    const batch = db.batch();

    // 2. Создаем или обновляем первую цель накопления
    const goalsCol = getUserCol('Goals');
    const existingGoalsSnap = await goalsCol.limit(1).get();
    let targetGoalRef;

    if (!existingGoalsSnap.empty) {
      targetGoalRef = existingGoalsSnap.docs[0].ref;
      batch.update(targetGoalRef, {
        name: goalName,
        target: goalTarget,
        saved: goalSaved,
        icon: goalIcon,
        share: 100,
        status: (goalTarget > 0 && goalSaved >= goalTarget) ? 'Выполнена' : 'В процессе',
        updatedAt: Date.now()
      });
    } else {
      targetGoalRef = goalsCol.doc();
      batch.set(targetGoalRef, {
        name: goalName,
        target: goalTarget,
        saved: goalSaved,
        icon: goalIcon,
        share: 100,
        status: (goalTarget > 0 && goalSaved >= goalTarget) ? 'Выполнена' : 'В процессе',
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }

    // 3. Сохраняем генеральный план бюджета (учитывая только регулярные обязательные счета)
    const bills = Cache.calendarBills || [];
    const recurringBills = bills.filter(b => b.type !== 'onetime' && b.type !== 'Разовый');
    const billsTotal = recurringBills.reduce((acc, b) => acc + (parseFloat(b.amount) || 0), 0);

    const planRef = getUserCol('BudgetPlan').doc('plan');
    batch.set(planRef, {
      isConfigured: true,
      monthlyIncome: income,
      monthlyVariableLimit: limitsTotal > 0 ? limitsTotal : Math.max(0, income - billsTotal),
      categoryLimits: categoryLimits,
      updatedAt: Date.now()
    }, { merge: true });

    // 4. Коммитим все изменения единым пакетом
    await batch.commit();

    // Гарантированное снятие блокировки прокрутки после завершения настройки бюджета
    if (typeof unlockBodyScroll === 'function') {
      unlockBodyScroll(true);
    }
    document.body.classList.remove('modal-open');
    document.body.style.top = '';
    document.body.style.position = '';
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';

    // 5. Полная перезагрузка актуальных данных и переход к дашборду
    await fetchAllData();
    // Сброс сохраненного шага после успешного запуска бюджета
    localStorage.removeItem('budget_wizard_step');
    currentWizardStep = 1;

    showToast('Бюджет успешно активирован!');
  } catch (err) {
    console.error('Ошибка активации бюджета:', err);
    showToast('Ошибка сохранения: ' + err.message, true);
  } finally {
    if (typeof unlockBodyScroll === 'function') {
      unlockBodyScroll(true);
    }
    document.body.classList.remove('modal-open');
    document.body.style.top = '';
    document.body.style.position = '';
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
  }
}

// ========================================================
// Управление лимитами категорий и учтенными операциями
// ========================================================
function getCategoryCurrentMonthTransactions(categoryName, targetDate = getSelectedBudgetDate()) {
  const d = targetDate || getSelectedBudgetDate();
  const startOfMonth = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
  const endOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
  
  const isOtherCategory = (categoryName === 'Прочие расходы' || categoryName === 'Прочие траты');
  const plan = Cache?.budgetPlan || {};
  const safeLimits = (plan && typeof plan.categoryLimits === 'object') ? plan.categoryLimits : {};
  const specificLimitKeys = Object.keys(safeLimits).filter(k => {
    const lim = parseFloat(safeLimits[k]);
    return !isNaN(lim) && lim > 0 && k !== 'Прочие расходы' && k !== 'Прочие траты';
  });

  const txList = [];
  (Cache.transactions || []).forEach(m => {
    (m.items || []).forEach(tx => {
      const isExpense = tx.type === 'Расход' || tx.type === 'expense' || String(tx.type || '').trim().toLowerCase() === 'расход';
      if (!isExpense) return;
      if (tx.isBillPayment) return;

      const txCat = (tx.category || 'Другое').trim() || 'Другое';
      if (isOtherCategory) {
        if (specificLimitKeys.includes(txCat) && txCat !== categoryName) return;
      } else {
        if (txCat !== categoryName) return;
      }

      let txDate = null;
      if (tx.timestamp && typeof tx.timestamp === 'number') {
        txDate = new Date(tx.timestamp);
      } else if (tx.rawDate) {
        txDate = typeof window.parseAnyDate === 'function' ? window.parseAnyDate(tx.rawDate) : new Date(tx.rawDate);
      } else if (tx.date) {
        txDate = typeof window.parseAnyDate === 'function' ? window.parseAnyDate(tx.date) : new Date(tx.date);
      }

      if (txDate && !isNaN(txDate.getTime())) {
        const txTime = txDate.getTime();
        if (txTime >= startOfMonth.getTime() && txTime <= endOfMonth.getTime()) {
          txList.push({ ...tx, dateObj: txDate });
        }
      }
    });
  });

  // Сортировка от свежих к старым
  txList.sort((a, b) => (b.dateObj?.getTime() || 0) - (a.dateObj?.getTime() || 0));
  return txList;
}

function openCategoryLimitModal(catName, currentLimit) {
  document.querySelectorAll('[data-budget-cat].context-active').forEach(el => el.classList.remove('context-active'));
  const catCard = document.querySelector(`[data-budget-cat="${catName}"]`);
  if (catCard) catCard.classList.add('context-active');

  activeEditCategory = catName;
  const dlg = document.getElementById('category-limit-dialog');
  const title = document.getElementById('category-limit-title');
  const inp = document.getElementById('category-limit-amount');
  const iconWrap = document.getElementById('category-limit-icon-wrap');

  const catObj = Cache?.categories?.expense?.find(c => (typeof c === 'string' ? c : c?.name) === catName);
  const iconName = (catObj && typeof catObj === 'object' && catObj.icon && catObj.icon !== '📦')
    ? catObj.icon
    : (typeof getCategoryIcon === 'function' ? getCategoryIcon(catName) : 'tag');

  if (title) title.innerText = catName;
  if (iconWrap) {
    iconWrap.innerHTML = `<i data-lucide="${iconName}" class="w-4 h-4 text-[#6C5DD3]"></i>`;
  }
  if (inp) setFormattedVal('category-limit-amount', currentLimit || '');

  refreshCategoryLimitModalStats();
  renderCategoryLimitTransactions();

  if (dlg) {
    if (typeof lockBodyScroll === 'function') lockBodyScroll();
    dlg.classList.remove('hidden');
  }
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeCategoryLimitModal() {
  const dlg = document.getElementById('category-limit-dialog');
  if (dlg) {
    dlg.classList.add('hidden');
    if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
  }
  document.querySelectorAll('[data-budget-cat].context-active').forEach(el => el.classList.remove('context-active'));
  activeEditCategory = null;
}

function onCategoryLimitInputChanged() {
  refreshCategoryLimitModalStats();
}

function refreshCategoryLimitModalStats() {
  if (!activeEditCategory) return;
  const currentLimit = getUnformattedVal(document.getElementById('category-limit-amount')) || 0;
  const txList = getCategoryCurrentMonthTransactions(activeEditCategory);

  let spent = 0;
  txList.forEach(tx => {
    const isExcluded = !!(tx.excludeFromBudget || tx.isExcludedFromBudget);
    if (!isExcluded) {
      const val = typeof tx.amount === 'number' ? tx.amount : (parseFloat(String(tx.amount || 0).replace(/\s/g, '').replace(/,/g, '.')) || 0);
      spent += val;
    }
  });

  const spentLabel = document.getElementById('category-limit-spent-label');
  const progressBar = document.getElementById('category-limit-progress-bar');
  const pctEl = document.getElementById('category-limit-pct');
  const hintEl = document.getElementById('category-limit-status-hint');
  const countEl = document.getElementById('category-limit-tx-count');

  if (countEl) countEl.innerText = `${txList.length} оп.`;
  if (spentLabel) {
    spentLabel.innerHTML = `${formatMoney(spent)} <span class="text-[#848D99] font-normal text-[11px]">/ ${formatMoney(currentLimit)}</span>`;
  }

  const pct = currentLimit > 0 ? Math.min(100, Math.round((spent / currentLimit) * 100)) : 0;
  const isOver = currentLimit > 0 && spent > currentLimit;

  if (progressBar) {
    progressBar.style.width = `${pct}%`;
    progressBar.className = `h-full rounded-full transition-all duration-300 ${isOver ? 'bg-[#FF453A]' : (pct >= 80 ? 'bg-[#FF9F0A]' : 'bg-[#30D158]')}`;
  }

  if (pctEl) {
    pctEl.innerText = `${pct}%`;
    pctEl.className = `font-mono font-bold ${isOver ? 'text-[#FF453A]' : 'text-gray-300'}`;
  }

  if (hintEl) {
    if (currentLimit <= 0) {
      hintEl.innerText = 'Лимит не задан';
      hintEl.className = 'text-[#848D99]';
    } else if (isOver) {
      hintEl.innerText = `Перерасход на ${formatMoney(spent - currentLimit)}`;
      hintEl.className = 'text-[#FF453A] font-medium';
    } else {
      hintEl.innerText = `Осталось ${formatMoney(currentLimit - spent)}`;
      hintEl.className = 'text-[#30D158] font-medium';
    }
  }
}

function renderCategoryLimitTransactions() {
  const listEl = document.getElementById('category-limit-tx-list');
  if (!listEl || !activeEditCategory) return;

  const txList = getCategoryCurrentMonthTransactions(activeEditCategory);

  if (txList.length === 0) {
    listEl.innerHTML = `
      <div class="py-4 px-2 text-center text-xs text-[#848D99] bg-[#12151C] rounded-xl border border-[rgba(255,255,255,0.03)]">
        В этом месяце операций по категории «${escapeHtml(activeEditCategory)}» пока нет
      </div>
    `;
    return;
  }

  const isOther = (activeEditCategory === 'Прочие расходы' || activeEditCategory === 'Прочие траты');

  listEl.innerHTML = txList.map(tx => {
    const isExcluded = !!(tx.excludeFromBudget || tx.isExcludedFromBudget);
    const amountVal = typeof tx.amount === 'number' ? tx.amount : (parseFloat(String(tx.amount || 0).replace(/\s/g, '').replace(/,/g, '.')) || 0);
    const dateStr = tx.dateObj ? `${tx.dateObj.getDate()} ${['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'][tx.dateObj.getMonth()]}` : (tx.date || '');
    const comment = tx.comment ? escapeHtml(tx.comment) : 'Без комментария';
    const catSubtitle = isOther && tx.category ? `${escapeHtml(tx.category)} · ` : '';

    return `
      <div class="p-2.5 rounded-xl bg-[#12151C] border border-[rgba(255,255,255,0.04)] flex items-center justify-between gap-2.5 transition-all ${isExcluded ? 'opacity-50' : 'hover:border-[rgba(255,255,255,0.1)]'}">
        <label class="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer select-none">
          <input type="checkbox" 
                 ${!isExcluded ? 'checked' : ''} 
                 onchange="toggleCategoryTxExclusion('${tx.id}', this.checked)"
                 class="w-4 h-4 rounded accent-[#6C5DD3] cursor-pointer flex-shrink-0">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5">
              <span class="text-xs font-semibold text-gray-200 truncate ${isExcluded ? 'line-through text-gray-500' : ''}">${comment}</span>
            </div>
            <span class="text-[10px] text-[#848D99] block">${catSubtitle}${dateStr}</span>
          </div>
        </label>

        <span class="text-xs font-mono font-bold ${isExcluded ? 'text-gray-500 line-through' : 'text-[#FF453A]'} flex-shrink-0">
          -${formatMoney(amountVal)}
        </span>
      </div>
    `;
  }).join('');
}

async function toggleCategoryTxExclusion(txId, isChecked) {
  const isExcluded = !isChecked;

  // 1. Локально обновляем Cache
  let targetTx = null;
  (Cache.transactions || []).forEach(m => {
    (m.items || []).forEach(tx => {
      if (tx.id === txId) {
        tx.excludeFromBudget = isExcluded;
        tx.isExcludedFromBudget = isExcluded;
        targetTx = tx;
      }
    });
  });

  if (!targetTx) return;

  // 2. Мгновенно обновляем модалку
  refreshCategoryLimitModalStats();
  renderCategoryLimitTransactions();

  // 3. Обновляем в базе данных
  try {
    await getUserCol('Transactions').doc(txId).update({
      excludeFromBudget: isExcluded,
      updatedAt: Date.now()
    });

    // 4. Перерисовываем бюджет для синхронизации всех шкал и пульса
    renderBudgetTab();
  } catch (err) {
    console.error('Ошибка обновления исключения транзакции:', err);
    showToast('Ошибка: ' + err.message, true);
  }
}

async function submitCategoryLimit() {
  if (!activeEditCategory) return;
  const amount = getUnformattedVal(document.getElementById('category-limit-amount'));
  const plan = Cache?.budgetPlan || {};
  const limits = plan.categoryLimits || {};

  if (amount > 0) limits[activeEditCategory] = amount;
  else delete limits[activeEditCategory];

  const totalVarLimit = Object.values(limits).reduce((s, v) => s + v, 0);

  try {
    await getUserCol('BudgetPlan').doc('plan').set({
      ...plan,
      isConfigured: true,
      monthlyVariableLimit: totalVarLimit,
      categoryLimits: limits,
      updatedAt: Date.now()
    }, { merge: true });

    closeCategoryLimitModal();
    await fetchAllData();
  } catch (err) {
    showToast('Ошибка: ' + err.message, true);
  }
}

// ========================================================
// Редактор всех лимитов категорий (из настроек бюджета)
// ========================================================
let managerCustomCategories = new Set();

function openCategoryLimitsManagerModal() {
  const dlg = document.getElementById('category-limits-manager-dialog');
  if (!dlg) return;

  const plan = Cache.budgetPlan || {};
  const limits = plan.categoryLimits || {};
  managerCustomCategories = new Set(Object.keys(limits));

  renderCategoryLimitsManager();
  if (typeof lockBodyScroll === 'function') lockBodyScroll();
  dlg.classList.remove('hidden');
}

function closeCategoryLimitsManagerModal() {
  const dlg = document.getElementById('category-limits-manager-dialog');
  if (dlg) {
    dlg.classList.add('hidden');
    if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
  }
}

function renderCategoryLimitsManager() {
  const container = document.getElementById('category-limits-manager-list');
  if (!container) return;

  const avgMap = typeof calculateHistoricalCategoryAverages === 'function' ? calculateHistoricalCategoryAverages() : {};
  const allExpenseCats = Cache?.categories?.expense || [];
  const plan = Cache.budgetPlan || {};
  const currentLimits = plan.categoryLimits || {};

  // Стандартные категории
  const standardNames = ['Продукты', 'Кафе и рестораны', 'Развлечения'];
  const list = [];

  standardNames.forEach(name => {
    const catObj = allExpenseCats.find(c => c.name === name);
    list.push({ name, icon: catObj?.icon || 'tag', isCustom: false });
  });

  managerCustomCategories.forEach(catName => {
    if (!standardNames.includes(catName) && catName !== 'Прочие расходы') {
      const catObj = allExpenseCats.find(c => c.name === catName);
      list.push({ name: catName, icon: catObj?.icon || 'tag', isCustom: true });
    }
  });

  // Собирательная категория Прочие расходы
  const accountedNames = list.map(c => c.name);
  let othersAvg = 0;
  Object.keys(avgMap).forEach(cat => {
    if (!accountedNames.includes(cat)) {
      othersAvg += avgMap[cat] || 0;
    }
  });
  avgMap['Прочие расходы'] = othersAvg;
  list.push({ name: 'Прочие расходы', icon: 'package', isCustom: false });

  container.innerHTML = list.map(cat => {
    const avg = Math.round(avgMap[cat.name] || 0);
    const existingVal = currentLimits[cat.name] !== undefined ? currentLimits[cat.name] : (cat.isCustom ? '' : (avg > 0 ? avg : ''));

    return `
      <div class="py-2 px-3 rounded-2xl bg-[#12151C] border border-[rgba(255,255,255,0.04)] flex items-center justify-between gap-3">
        <div class="w-8 h-8 rounded-xl bg-[#1E2330] text-gray-300 flex items-center justify-center flex-shrink-0">
          <i data-lucide="${cat.icon || 'tag'}" class="w-4 h-4 text-[#848D99]"></i>
        </div>
        
        <div class="flex-1 min-w-0 pr-1">
          <div class="flex items-center gap-1.5">
            <span class="text-xs font-bold text-gray-200 truncate">${escapeHtml(cat.name)}</span>
            ${cat.isCustom ? `<button type="button" onclick="removeManagerCustomCat('${escapeHtml(cat.name)}')" class="text-gray-500 hover:text-[#FF453A] text-xs font-bold cursor-pointer">✕</button>` : ''}
          </div>
          ${avg > 0 ? `
            <div class="flex items-center gap-1 mt-0.5">
              <div onclick="applyMgrCategoryAvg('${escapeHtml(cat.name)}', ${avg})" 
                   class="w-[100px] h-6 justify-between text-[10px] py-0.5 px-2 bg-[#6C5DD3]/10 text-[#727cff] hover:bg-[#6C5DD3]/20 border border-[#6C5DD3]/20 rounded-lg whitespace-nowrap flex items-center cursor-pointer transition-all active:scale-95 flex-shrink-0" 
                   title="Нажмите, чтобы применить среднее">
                <span class="truncate">Ср: ~${formatMoney(avg)}</span>
                <i data-lucide="arrow-right" class="w-2.5 h-2.5 flex-shrink-0 ml-1"></i>
              </div>
              <button type="button" 
                      onclick="openWizAvgDetailsModal('expense', '${escapeHtml(cat.name)}')" 
                      class="w-6 h-6 rounded-lg bg-[#1E2330] hover:bg-[#2A2D3C] text-[#727cff] border border-[rgba(255,255,255,0.06)] flex items-center justify-center flex-shrink-0 cursor-pointer transition-colors" 
                      title="Настройка транзакций в расчете">
                <i data-lucide="sliders-horizontal" class="w-3 h-3"></i>
              </button>
            </div>
          ` : `
            <div class="flex items-center gap-1 mt-0.5">
              <span class="text-[10px] text-[#848D99] w-[100px] block truncate">Ср: нет данных</span>
              <button type="button" 
                      onclick="openWizAvgDetailsModal('expense', '${escapeHtml(cat.name)}')" 
                      class="w-6 h-6 rounded-lg bg-[#1E2330] hover:bg-[#2A2D3C] text-gray-400 hover:text-white border border-[rgba(255,255,255,0.06)] flex items-center justify-center flex-shrink-0 cursor-pointer transition-colors" 
                      title="Просмотр и выбор транзакций">
                <i data-lucide="sliders-horizontal" class="w-3 h-3"></i>
              </button>
            </div>
          `}
        </div>

        <div class="w-[96px] flex-shrink-0">
          <input type="text"
                 inputmode="decimal"
                 data-mgr-cat="${escapeHtml(cat.name)}"
                 oninput="formatSumInput(this); updateMgrLiveTotal();"
                 value="${existingVal ? formatMoney(existingVal) : ''}"
                 placeholder="0 ₽"
                 class="w-full h-8 bg-[#161922] border border-[rgba(255,255,255,0.08)] text-white text-right font-mono font-semibold text-xs rounded-xl px-2 outline-none focus:border-[#6C5DD3] focus:bg-[#1A1E29] transition-all whitespace-nowrap">
        </div>
      </div>
    `;
  }).join('');

  updateMgrLiveTotal();
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function applyMgrCategoryAvg(catName, avg) {
  const inp = document.querySelector(`[data-mgr-cat="${catName}"]`);
  if (inp) {
    inp.value = formatMoney(avg);
    updateMgrLiveTotal();
  }
}

function removeManagerCustomCat(catName) {
  managerCustomCategories.delete(catName);
  renderCategoryLimitsManager();
}

function updateMgrLiveTotal() {
  let total = 0;
  document.querySelectorAll('[data-mgr-cat]').forEach(inp => {
    total += getUnformattedVal(inp) || 0;
  });
  const totalEl = document.getElementById('mgr-limits-total');
  const weekEl = document.getElementById('mgr-limits-weekly-estimate');
  if (totalEl) totalEl.innerText = `${formatMoney(total)}/мес`;
  if (weekEl) weekEl.innerText = `~${formatMoney(Math.round(total / 4.33))}`;
}

async function saveCategoryLimitsManager() {
  const limits = {};
  let totalVarLimit = 0;
  document.querySelectorAll('[data-mgr-cat]').forEach(inp => {
    const val = getUnformattedVal(inp);
    const cat = inp.dataset.mgrCat;
    if (cat && val > 0) {
      limits[cat] = val;
      totalVarLimit += val;
    }
  });

  const plan = Cache?.budgetPlan || {};
  plan.categoryLimits = limits;
  plan.monthlyVariableLimit = totalVarLimit;

  try {
    const col = getUserCol('BudgetPlan');
    const snap = await col.get();
    const batch = db.batch();

    const planData = {
      isConfigured: true,
      categoryLimits: limits,
      monthlyVariableLimit: totalVarLimit,
      updatedAt: Date.now()
    };

    if (snap.empty) {
      batch.set(col.doc('plan'), planData);
    } else {
      batch.update(snap.docs[0].ref, planData);
    }

    await batch.commit();
    closeCategoryLimitsManagerModal();

    // Обновляем поля в окне настройки плана, если оно открыто
    const catSumEl = document.getElementById('plan-categories-sum');
    if (catSumEl) {
      catSumEl.innerText = formatMoney(totalVarLimit);
    }
    updatePlanForecast();

    await fetchAllData();
  } catch (err) {
    showToast('Ошибка сохранения лимитов: ' + err.message, true);
  }
}

function toggleGoalPaceTooltip(goalId, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  const current = document.getElementById(`goal-pace-tooltip-${goalId}`);
  const isHidden = current ? current.classList.contains('hidden') : true;
  document.querySelectorAll('.goal-pace-tooltip').forEach(el => {
    el.classList.add('hidden');
    const card = el.closest('.card');
    if (card) card.style.zIndex = '';
  });
  if (current && isHidden) {
    current.classList.remove('hidden');
    const card = current.closest('.card');
    if (card) card.style.zIndex = '50';

    // Проверка свободного места сверху (если сверху места мало, открываем снизу чипа)
    const trigger = (event && (event.currentTarget || event.target?.closest('.goal-pace-badge'))) || current.parentElement?.querySelector('.goal-pace-badge');
    const rect = trigger ? trigger.getBoundingClientRect() : null;
    const tooltipHeight = current.offsetHeight || 135;

    if (rect && rect.top < tooltipHeight + 16) {
      current.classList.remove('bottom-full', 'mb-2');
      current.classList.add('top-full', 'mt-2');
    } else {
      current.classList.remove('top-full', 'mt-2');
      current.classList.add('bottom-full', 'mb-2');
    }
  }
}

// Функция скрытия всех тултипов темпа целей
function hideGoalPaceTooltips() {
  const visibleTooltips = document.querySelectorAll('.goal-pace-tooltip:not(.hidden)');
  if (visibleTooltips.length > 0) {
    visibleTooltips.forEach(el => {
      el.classList.add('hidden');
      const card = el.closest('.card');
      if (card) card.style.zIndex = '';
    });
  }
}

// Глобальное закрытие тултипов темпа целей при клике во внешнюю область
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const target = (e?.target?.nodeType === 3) ? e.target.parentElement : e?.target;
    if (target && typeof target.closest === 'function' && !target.closest('.goal-pace-tooltip') && !target.closest('.goal-pace-badge')) {
      hideGoalPaceTooltips();
    }
  });
}

// Скрытие тултипов при скролле страницы или любого контейнера
if (typeof window !== 'undefined') {
  window.addEventListener('scroll', hideGoalPaceTooltips, { passive: true, capture: true });
}

function applyWizCategoryAvg(catName, avg) {
  const inp = document.querySelector(`[data-wiz-cat="${catName}"]`);
  if (inp) {
    inp.value = formatMoney(avg);
    fitWizLimitFont(inp);
    updateWizLiveTotal();
  }
}

// ==========================================
// 5. Global Scope Exports
// ==========================================
window.renderBudgetTab = renderBudgetTab;
window.renderBudgetCalendar = renderBudgetCalendar;
window.renderBudgetGoals = renderBudgetGoals;
window.renderBudgetCategoryLimits = renderBudgetCategoryLimits;
window.isBillPaidInCurrentMonth = isBillPaidInCurrentMonth;

// План бюджета
window.openBudgetPlanModal = openBudgetPlanModal;
window.closeBudgetPlanModal = closeBudgetPlanModal;
window.updatePlanForecast = updatePlanForecast;
window.submitBudgetPlan = submitBudgetPlan;

// Счета календаря
window.openAddBillModal = openAddBillModal;
window.closeAddBillModal = closeAddBillModal;
window.openEditBillModal = openEditBillModal;
window.submitCalendarBill = submitCalendarBill;
window.deleteCurrentEditingBill = deleteCurrentEditingBill;
window.toggleBillPaidStatus = toggleBillPaidStatus;
window.openDayBillsModal = openDayBillsModal;
window.closeDayBillsModal = closeDayBillsModal;
window.deleteCalendarBill = deleteCalendarBill;

// Цели и копилки
window.processGoals = processGoals;
window.getGoalIcon = getGoalIcon;
window.openGoalModal = openGoalModal;
window.closeGoalModal = closeGoalModal;
window.openEditGoalModal = openEditGoalModal;
window.submitBudgetGoal = submitBudgetGoal;
window.deleteCurrentEditingGoal = deleteCurrentEditingGoal;
window.deleteBudgetGoal = deleteBudgetGoal;
window.openGoalTopupModal = openGoalTopupModal;
window.closeGoalTopupModal = closeGoalTopupModal;
window.setTopupMode = setTopupMode;
window.submitGoalTopup = submitGoalTopup;

// ==========================================
// 6. Детализация расчета средних (Шаг 2 и Шаг 4)
// ==========================================
window.wizardExcludedTxIds = window.wizardExcludedTxIds || new Set();
window.wizardActiveOtherCategories = window.wizardActiveOtherCategories || new Set();
let wizAvgCurrentContext = null;
let wizAvgSelectedIds = new Set();

function getCanonicalIncomeCategory(cat) {
  if (!cat) return 'Другое';
  const trimmed = String(cat).trim();
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('зарплат') || lower === 'аванс' || lower === 'премия') return 'Зарплата';
  if (lower.includes('кэшб') || lower.includes('кэшбек') || lower.includes('кэшбэк')) return 'Кэшбек';
  if (lower.startsWith('возврат')) return 'Возврат';
  if (lower === 'другое' || lower === 'прочее') return 'Другое';
  return trimmed;
}

function updateWizAvgCatToggleAllButton(activeCount, totalCount) {
  const label = document.getElementById('wiz-avg-cat-toggle-all-label');
  const icon = document.getElementById('wiz-avg-cat-toggle-all-icon');
  if (!label) return;

  const allActive = totalCount > 0 && activeCount === totalCount;
  if (allActive) {
    label.innerText = 'Снять';
    if (icon) {
      icon.setAttribute('data-lucide', 'square');
      icon.className = 'w-3 h-3 text-gray-400 flex-shrink-0';
    }
  } else {
    label.innerText = 'Все';
    if (icon) {
      icon.setAttribute('data-lucide', 'check-check');
      icon.className = 'w-3 h-3 text-[#727cff] flex-shrink-0';
    }
  }
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function openWizAvgDetailsModal(type, categoryName, isInitialOpen = true) {
  const dlg = document.getElementById('wiz-avg-details-dialog');
  const titleEl = document.getElementById('wiz-avg-title');
  const subtitleEl = document.getElementById('wiz-avg-subtitle');
  const iconWrap = document.getElementById('wiz-avg-icon-wrap');
  const listEl = document.getElementById('wiz-avg-tx-list');
  if (!dlg || !listEl) return;

  if (isInitialOpen) {
    const sortMenu = document.getElementById('wiz-avg-sort-menu');
    if (sortMenu) sortMenu.classList.add('hidden');
    const catMenu = document.getElementById('wiz-avg-cat-filter-menu');
    if (catMenu) catMenu.classList.add('hidden');
  }

  const txMonths = Cache?.transactions || [];

  const catFilterWrap = document.getElementById('wiz-avg-cat-filter-wrap');
  const catFilterLabel = document.getElementById('wiz-avg-cat-filter-label');
  const catFilterList = document.getElementById('wiz-avg-cat-filter-list');

  let detectedCatsList = [];

  // 1. Инициализация и рендеринг выпадающего фильтра категорий дохода
  if (type === 'income') {
    const detectedIncomeCats = new Set(['Зарплата', 'Кэшбек', 'Возврат', 'Другое']);
    
    // Категории из базы/настроек пользователя
    (Cache?.categories?.income || []).forEach(c => {
      const name = typeof c === 'string' ? c : c?.name;
      if (name) detectedIncomeCats.add(getCanonicalIncomeCategory(name));
    });

    txMonths.forEach(m => {
      (m.items || []).forEach(tx => {
        if (tx.type === 'Доход') {
          const c = getCanonicalIncomeCategory(tx.category);
          if (c) detectedIncomeCats.add(c);
        }
      });
    });

    if (isInitialOpen || !wizardActiveIncomeSources) {
      wizardActiveIncomeSources = new Set(detectedIncomeCats);
    } else {
      // Нормализуем существующие элементы в сете, чтобы не было дублей
      const normalizedSet = new Set();
      wizardActiveIncomeSources.forEach(s => normalizedSet.add(getCanonicalIncomeCategory(s)));
      wizardActiveIncomeSources = normalizedSet;
    }

    detectedCatsList = Array.from(detectedIncomeCats);
    const activeCount = detectedCatsList.filter(c => wizardActiveIncomeSources.has(c)).length;

    if (catFilterWrap) catFilterWrap.classList.remove('hidden');
    if (catFilterLabel) {
      catFilterLabel.innerText = activeCount === detectedCatsList.length ? 'Все доходы' : `Доходы (${activeCount}/${detectedCatsList.length})`;
    }
    updateWizAvgCatToggleAllButton(activeCount, detectedCatsList.length);

    if (catFilterList) {
      catFilterList.innerHTML = detectedCatsList.map(cat => {
        const isActive = wizardActiveIncomeSources.has(cat);
        const icon = (typeof getCategoryIcon === 'function') ? getCategoryIcon(cat) : 'wallet';
        return `
          <div onclick="toggleWizAvgIncomeCategory('${escapeHtml(cat)}', event)" 
               class="flex items-center justify-between p-2 rounded-xl bg-[#12151C] hover:bg-[#212430] border border-[rgba(255,255,255,0.04)] cursor-pointer select-none transition-all ${isActive ? 'text-white' : 'text-gray-500 opacity-60'}">
            <div class="flex items-center gap-2 min-w-0">
              <div class="w-6 h-6 rounded-lg ${isActive ? 'bg-[#30D158]/15 text-[#30D158]' : 'bg-[#181B24] text-gray-500'} flex items-center justify-center flex-shrink-0">
                <i data-lucide="${icon}" class="w-3.5 h-3.5"></i>
              </div>
              <span class="text-xs font-medium truncate">${escapeHtml(cat)}</span>
            </div>
            <div class="w-4 h-4 rounded-md flex items-center justify-center ${isActive ? 'bg-[#30D158] text-black' : 'border border-gray-600 bg-transparent'} flex-shrink-0 ml-2">
              ${isActive ? '<i data-lucide="check" class="w-3 h-3 stroke-[3]"></i>' : ''}
            </div>
          </div>
        `;
      }).join('');
    }
  } 
  // 2. Инициализация и рендеринг выпадающего фильтра категорий для «Прочие расходы / траты»
  else if (categoryName === 'Прочие расходы' || categoryName === 'Прочие траты') {
    let mainExpenseCats = [];
    if (activeMonthCloseData && activeMonthCloseData.categoryLimits) {
      mainExpenseCats = Object.keys(activeMonthCloseData.categoryLimits).filter(c => c !== 'Прочие расходы' && c !== 'Прочие траты');
    } else if (Cache?.budgetPlan?.categoryLimits && Object.keys(Cache.budgetPlan.categoryLimits).length > 0) {
      mainExpenseCats = Object.keys(Cache.budgetPlan.categoryLimits).filter(c => c !== 'Прочие расходы' && c !== 'Прочие траты');
    } else {
      mainExpenseCats = ['Продукты', 'Кафе и рестораны', 'Развлечения', ...(window.wizardCustomCategories || [])];
    }
    if (mainExpenseCats.length === 0) {
      mainExpenseCats = ['Продукты', 'Кафе и рестораны', 'Развлечения'];
    }

    const detectedOtherCats = new Set();
    (Cache?.categories?.expense || []).forEach(c => {
      const name = typeof c === 'string' ? c : c?.name;
      if (name && !mainExpenseCats.includes(name) && name !== 'Прочие расходы' && name !== 'Прочие траты') {
        detectedOtherCats.add(name);
      }
    });

    txMonths.forEach(m => {
      (m.items || []).forEach(tx => {
        if (tx.type === 'Расход') {
          const c = (tx.category || 'Другое').trim() || 'Другое';
          if (!mainExpenseCats.includes(c) && c !== 'Прочие расходы' && c !== 'Прочие траты') {
            detectedOtherCats.add(c);
          }
        }
      });
    });

    if (!detectedOtherCats.has('Другое')) detectedOtherCats.add('Другое');

    if (isInitialOpen || !window.wizardActiveOtherCategories) {
      window.wizardActiveOtherCategories = new Set(detectedOtherCats);
    }

    detectedCatsList = Array.from(detectedOtherCats);
    const activeCount = detectedCatsList.filter(c => window.wizardActiveOtherCategories.has(c)).length;

    if (catFilterWrap) catFilterWrap.classList.remove('hidden');
    if (catFilterLabel) {
      catFilterLabel.innerText = activeCount === detectedCatsList.length ? 'Все категории' : `Категории (${activeCount}/${detectedCatsList.length})`;
    }
    updateWizAvgCatToggleAllButton(activeCount, detectedCatsList.length);

    if (catFilterList) {
      catFilterList.innerHTML = detectedCatsList.map(cat => {
        const isActive = window.wizardActiveOtherCategories.has(cat);
        const icon = (typeof getCategoryIcon === 'function') ? getCategoryIcon(cat) : 'tag';
        return `
          <div onclick="toggleWizAvgOtherCategory('${escapeHtml(cat)}', event)" 
               class="flex items-center justify-between p-2 rounded-xl bg-[#12151C] hover:bg-[#212430] border border-[rgba(255,255,255,0.04)] cursor-pointer select-none transition-all ${isActive ? 'text-white' : 'text-gray-500 opacity-60'}">
            <div class="flex items-center gap-2 min-w-0">
              <div class="w-6 h-6 rounded-lg ${isActive ? 'bg-[#6C5DD3]/20 text-[#8C7DFF]' : 'bg-[#181B24] text-gray-500'} flex items-center justify-center flex-shrink-0">
                <i data-lucide="${icon}" class="w-3.5 h-3.5"></i>
              </div>
              <span class="text-xs font-medium truncate">${escapeHtml(cat)}</span>
            </div>
            <div class="w-4 h-4 rounded-md flex items-center justify-center ${isActive ? 'bg-[#727cff] text-white' : 'border border-gray-600 bg-transparent'} flex-shrink-0 ml-2">
              ${isActive ? '<i data-lucide="check" class="w-3 h-3 stroke-[3]"></i>' : ''}
            </div>
          </div>
        `;
      }).join('');
    }
  } else {
    if (catFilterWrap) catFilterWrap.classList.add('hidden');
    if (catFilterList) catFilterList.innerHTML = '';
  }

  // 3. Собираем операции и общий таймлайн
  const rawTxs = [];
  const incomeMonthsCount = Math.max(1, Math.min(3, txMonths.length));
  const relevantMonths = type === 'income' ? txMonths.slice(0, incomeMonthsCount) : txMonths;

  let maxTime = -Infinity;
  txMonths.forEach(m => {
    (m.items || []).forEach(tx => {
      const t = tx.timestamp || (tx.rawDate ? new Date(tx.rawDate).getTime() : null);
      if (t && t > maxTime) maxTime = t;
    });
  });
  if (maxTime === -Infinity) maxTime = Date.now();

  const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
  const cutoffTime = maxTime - ninetyDaysMs;

  let minTimeInWindow = Infinity;
  txMonths.forEach(m => {
    (m.items || []).forEach(tx => {
      const t = tx.timestamp || (tx.rawDate ? new Date(tx.rawDate).getTime() : null);
      if (t && t >= cutoffTime && t <= maxTime) {
        if (t < minTimeInWindow) minTimeInWindow = t;
      }
    });
  });

  let mainExpenseCats = [];
  if (categoryName === 'Прочие расходы' || categoryName === 'Прочие траты') {
    if (activeMonthCloseData && activeMonthCloseData.categoryLimits) {
      mainExpenseCats = Object.keys(activeMonthCloseData.categoryLimits).filter(c => c !== 'Прочие расходы' && c !== 'Прочие траты');
    } else if (Cache?.budgetPlan?.categoryLimits && Object.keys(Cache.budgetPlan.categoryLimits).length > 0) {
      mainExpenseCats = Object.keys(Cache.budgetPlan.categoryLimits).filter(c => c !== 'Прочие расходы' && c !== 'Прочие траты');
    } else {
      mainExpenseCats = ['Продукты', 'Кафе и рестораны', 'Развлечения', ...(window.wizardCustomCategories || [])];
    }
  }

  relevantMonths.forEach(m => {
    (m.items || []).forEach(tx => {
      const t = tx.timestamp || (tx.rawDate ? new Date(tx.rawDate).getTime() : null);
      if (!t) return;

      if (type === 'income') {
        if (tx.type === 'Доход') {
          const cat = getCanonicalIncomeCategory(tx.category);
          if (wizardActiveIncomeSources.has(cat)) {
            rawTxs.push(tx);
          }
        }
      } else {
        // Расходы строго за последние 90 дней
        if (tx.type === 'Расход' && t >= cutoffTime && t <= maxTime) {
          if (categoryName === 'Прочие расходы' || categoryName === 'Прочие траты') {
            const cat = (tx.category || 'Другое').trim() || 'Другое';
            if (!mainExpenseCats.includes(cat) && (!window.wizardActiveOtherCategories || window.wizardActiveOtherCategories.has(cat))) {
              rawTxs.push(tx);
            }
          } else if (tx.category === categoryName) {
            rawTxs.push(tx);
          }
        }
      }
    });
  });

  let monthFactor = 1;
  let effectivePeriodText = '';

  if (type === 'income') {
    monthFactor = 1 / incomeMonthsCount;
    const mWord = incomeMonthsCount === 1 ? '1 месяц' : `${incomeMonthsCount} месяца`;
    effectivePeriodText = `за ${mWord}`;
  } else {
    const diffDays = minTimeInWindow !== Infinity
      ? Math.max(1, Math.round((maxTime - minTimeInWindow) / (1000 * 60 * 60 * 24)) + 1)
      : 30;
    const effectiveDays = Math.min(90, diffDays);
    monthFactor = 30.44 / effectiveDays;
    effectivePeriodText = `за ${effectiveDays} дн.`;
  }

  // 2. Формируем карточки операций
  const items = rawTxs.map(tx => {
    const uid = tx.id || tx._id || `${tx.timestamp || tx.rawDate || ''}_${tx.amount}_${tx.merchant || tx.title || ''}`;
    const amount = parseFloat(tx.amount) || 0;
    const dateObj = tx.timestamp ? new Date(tx.timestamp) : (tx.rawDate ? new Date(tx.rawDate) : null);
    const dateStr = dateObj ? dateObj.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : (tx.displayDate || '—');
    const isOneTime = (tx.billType === 'onetime') || (tx.spreadMonths && parseInt(tx.spreadMonths, 10) > 1) || (!tx.isBillPayment && !!tx.excludeFromBudget) || !!tx.isExcludedFromBudget;
    const isBill = !isOneTime && (!!tx.isBillPayment || (!!tx.billId && tx.billType !== 'onetime'));
    const isBillOrOneTime = isOneTime || isBill;

    return {
      uid,
      amount,
      dateStr,
      timestamp: dateObj ? dateObj.getTime() : 0,
      bank: tx.bank || '',
      category: tx.category || '',
      title: typeof cleanMerchantTitle === 'function' 
        ? (cleanMerchantTitle(tx.merchant || tx.title || tx.comment) || (type === 'income' ? 'Поступление' : 'Расход'))
        : (tx.merchant || tx.title || tx.comment || (type === 'income' ? 'Поступление' : 'Расход')),
      isBill,
      isOneTime,
      isBillOrOneTime
    };
  });

  // 3. Выставляем галочки (по умолчанию не учитываем ежемесячные счета и разовые выплаты)
  wizAvgSelectedIds = new Set();
  items.forEach(it => {
    if (!window.wizardExcludedTxIds.has(it.uid) && !it.isBillOrOneTime) {
      wizAvgSelectedIds.add(it.uid);
    }
  });

  wizAvgCurrentContext = { 
    type, 
    categoryName, 
    items, 
    monthFactor, 
    effectivePeriodText,
    sortOrder: wizAvgCurrentContext?.sortOrder || 'date-desc',
    detectedCats: detectedCatsList
  };

  // 4. Шапка
  if (type === 'income') {
    if (titleEl) titleEl.innerText = 'Расчет среднего дохода';
    if (subtitleEl) subtitleEl.innerText = `Учтенные поступления ${effectivePeriodText}`;
    if (iconWrap) {
      iconWrap.className = 'w-8 h-8 rounded-xl bg-[#30D158]/15 text-[#30D158] flex items-center justify-center flex-shrink-0';
      iconWrap.innerHTML = '<i data-lucide="trending-up" class="w-4 h-4"></i>';
    }
  } else {
    const catObj = Cache?.categories?.expense?.find(c => c.name === categoryName);
    const iconName = catObj?.icon || (categoryName === 'Прочие расходы' ? 'package' : 'tag');
    if (titleEl) titleEl.innerText = `Расчет: ${categoryName}`;
    if (subtitleEl) subtitleEl.innerText = `Учтенные траты ${effectivePeriodText}`;
    if (iconWrap) {
      iconWrap.className = 'w-8 h-8 rounded-xl bg-[#6C5DD3]/15 text-[#727cff] flex items-center justify-center flex-shrink-0';
      iconWrap.innerHTML = `<i data-lucide="${iconName}" class="w-4 h-4"></i>`;
    }
  }

  // 5. Показываем/скрываем кнопку удаления категории
  const delBtn = document.getElementById('wiz-avg-delete-cat-btn');
  if (delBtn) {
    if (type === 'expense' && categoryName && categoryName !== 'Прочие расходы' && typeof adjustActiveCategories !== 'undefined' && adjustActiveCategories.includes(categoryName)) {
      delBtn.classList.remove('hidden');
    } else {
      delBtn.classList.add('hidden');
    }
  }

  // 6. Рендерим список с учетом текущей сортировки
  renderWizAvgTxList();

  recalculateWizAvgModal();
  if (typeof lockBodyScroll === 'function') lockBodyScroll();
  dlg.classList.remove('hidden');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

const WIZ_SORT_LABELS = {
  'date-desc': 'Дата (новые)',
  'date-asc': 'Дата (старые)',
  'amount-desc': 'Сумма (большие)',
  'amount-asc': 'Сумма (меньшие)'
};

function wizAvgToggleSortDropdown(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('wiz-avg-sort-menu');
  const catMenu = document.getElementById('wiz-avg-cat-filter-menu');
  if (catMenu) {
    catMenu.classList.add('hidden');
    document.removeEventListener('click', closeWizAvgCatFilterDropdownOnClickOutside);
  }
  if (!menu) return;
  const isHidden = menu.classList.contains('hidden');
  if (isHidden) {
    menu.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
    setTimeout(() => {
      document.addEventListener('click', closeWizAvgSortDropdownOnClickOutside);
    }, 10);
  } else {
    menu.classList.add('hidden');
    document.removeEventListener('click', closeWizAvgSortDropdownOnClickOutside);
  }
}

function closeWizAvgSortDropdownOnClickOutside(e) {
  const menu = document.getElementById('wiz-avg-sort-menu');
  const btn = document.getElementById('wiz-avg-sort-wrap')?.querySelector('button');
  if (!menu || menu.classList.contains('hidden')) return;

  if (e.target.closest && (e.target.closest('#wiz-avg-sort-menu') || e.target.closest('#wiz-avg-sort-wrap'))) {
    return;
  }
  if (menu.contains(e.target) || btn?.contains(e.target)) {
    return;
  }

  menu.classList.add('hidden');
  document.removeEventListener('click', closeWizAvgSortDropdownOnClickOutside);
}

function wizAvgToggleCatFilterDropdown(e) {
  if (e && e.stopPropagation) e.stopPropagation();
  const menu = document.getElementById('wiz-avg-cat-filter-menu');
  const sortMenu = document.getElementById('wiz-avg-sort-menu');
  if (sortMenu) {
    sortMenu.classList.add('hidden');
    document.removeEventListener('click', closeWizAvgSortDropdownOnClickOutside);
  }
  if (!menu) return;
  const isHidden = menu.classList.contains('hidden');
  if (isHidden) {
    menu.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
    setTimeout(() => {
      document.addEventListener('click', closeWizAvgCatFilterDropdownOnClickOutside);
    }, 10);
  } else {
    menu.classList.add('hidden');
    document.removeEventListener('click', closeWizAvgCatFilterDropdownOnClickOutside);
  }
}

function closeWizAvgCatFilterDropdownOnClickOutside(e) {
  const menu = document.getElementById('wiz-avg-cat-filter-menu');
  const btn = document.getElementById('wiz-avg-cat-filter-btn');
  if (!menu || menu.classList.contains('hidden')) return;

  if (e.target.closest && (e.target.closest('#wiz-avg-cat-filter-menu') || e.target.closest('#wiz-avg-cat-filter-btn'))) {
    return;
  }
  if (menu.contains(e.target) || btn?.contains(e.target)) {
    return;
  }

  menu.classList.add('hidden');
  document.removeEventListener('click', closeWizAvgCatFilterDropdownOnClickOutside);
}

function wizAvgToggleAllFilterCategories(e, forceVal) {
  if (e && e.stopPropagation) e.stopPropagation();
  const ctx = wizAvgCurrentContext;
  if (!ctx) return;

  if (ctx.type === 'income') {
    const cats = ctx.detectedCats || [];
    const allActive = cats.length > 0 && cats.every(c => wizardActiveIncomeSources.has(c));
    const shouldSelect = typeof forceVal === 'boolean' ? forceVal : !allActive;
    if (shouldSelect) {
      cats.forEach(c => wizardActiveIncomeSources.add(c));
    } else {
      wizardActiveIncomeSources.clear();
    }
  } else if (ctx.categoryName === 'Прочие расходы' || ctx.categoryName === 'Прочие траты') {
    if (!window.wizardActiveOtherCategories) window.wizardActiveOtherCategories = new Set();
    const cats = ctx.detectedCats || [];
    const allActive = cats.length > 0 && cats.every(c => window.wizardActiveOtherCategories.has(c));
    const shouldSelect = typeof forceVal === 'boolean' ? forceVal : !allActive;
    if (shouldSelect) {
      cats.forEach(c => window.wizardActiveOtherCategories.add(c));
    } else {
      window.wizardActiveOtherCategories.clear();
    }
  }
  openWizAvgDetailsModal(ctx.type, ctx.categoryName, false);
}

function wizAvgSelectSort(sortVal) {
  if (!wizAvgCurrentContext) return;
  wizAvgCurrentContext.sortOrder = sortVal;
  
  const menu = document.getElementById('wiz-avg-sort-menu');
  if (menu) menu.classList.add('hidden');
  document.removeEventListener('click', closeWizAvgSortDropdownOnClickOutside);

  renderWizAvgTxList();
}

function renderWizAvgTxList() {
  const ctx = wizAvgCurrentContext;
  if (!ctx || !ctx.items) return;

  const listEl = document.getElementById('wiz-avg-tx-list');
  if (!listEl) return;

  const sortOrder = ctx.sortOrder || 'date-desc';
  
  // Обновляем метку кнопки
  const labelEl = document.getElementById('wiz-avg-sort-label');
  if (labelEl) labelEl.innerText = WIZ_SORT_LABELS[sortOrder] || 'Сортировка';

  // Подсвечиваем выбранный вариант в кастомном меню
  document.querySelectorAll('#wiz-avg-sort-menu .wiz-sort-opt').forEach(opt => {
    const val = opt.getAttribute('data-value');
    const check = opt.querySelector('.opt-check');
    if (val === sortOrder) {
      opt.classList.add('bg-[#252836]', 'text-[#727cff]', 'font-semibold');
      opt.classList.remove('text-gray-200');
      if (check) check.classList.remove('hidden');
    } else {
      opt.classList.remove('bg-[#252836]', 'text-[#727cff]', 'font-semibold');
      opt.classList.add('text-gray-200');
      if (check) check.classList.add('hidden');
    }
  });

  const items = [...ctx.items];
  items.sort((a, b) => {
    if (sortOrder === 'date-desc') return b.timestamp - a.timestamp;
    if (sortOrder === 'date-asc') return a.timestamp - b.timestamp;
    if (sortOrder === 'amount-asc') return a.amount - b.amount;
    if (sortOrder === 'amount-desc') return b.amount - a.amount;
    return b.timestamp - a.timestamp;
  });

  if (items.length === 0) {
    listEl.innerHTML = `
      <div class="text-center py-8 px-4 text-[#848D99] space-y-2">
        <i data-lucide="inbox" class="w-8 h-8 mx-auto opacity-40"></i>
        <p class="text-xs">В выписках нет операций по ${ctx.type === 'income' ? 'доходам' : 'категории «' + escapeHtml(ctx.categoryName) + '»'}</p>
      </div>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    updateWizAvgToggleAllButton();
    return;
  }

  const totalAmount = items.reduce((s, it) => s + it.amount, 0);

  listEl.innerHTML = items.map(it => {
    const isSelected = wizAvgSelectedIds.has(it.uid);
    const isLarge = (it.amount > 15000) || (items.length > 2 && it.amount >= totalAmount * 0.35);

    return `
      <div id="wiz-avg-row-${it.uid}" 
           onclick="wizAvgToggleTx('${it.uid}')" 
           class="card-parsed-row bg-[#181B24] border border-[rgba(255,255,255,0.06)] px-3 py-2.5 rounded-2xl flex flex-col gap-1.5 transition-all cursor-pointer select-none ${isSelected ? 'hover:border-[rgba(255,255,255,0.12)]' : 'bg-[#12151C] opacity-50'}">
        <div class="flex items-center justify-between gap-2.5 min-w-0">
          <div class="flex items-center gap-2.5 min-w-0 flex-1">
            <input type="checkbox" 
                   id="wiz-avg-cb-${it.uid}" 
                   class="w-4 h-4 rounded accent-[#6C5DD3] bg-[#212430] border-gray-700 flex-shrink-0 cursor-pointer pointer-events-none" 
                   ${isSelected ? 'checked' : ''}>
            <span class="text-xs font-semibold text-gray-100 truncate">${escapeHtml(it.title)}</span>
          </div>
          <span class="text-xs font-mono font-bold flex-shrink-0 ml-2 ${ctx.type === 'income' ? 'text-[#30D158]' : 'text-gray-200'}">
            ${ctx.type === 'income' ? '+' : '-'}${formatMoney(it.amount)}
          </span>
        </div>
        <div class="flex items-center justify-between gap-2 pt-1 border-t border-[rgba(255,255,255,0.03)] text-[11px] text-[#848D99]">
          <div class="flex items-center gap-1.5 min-w-0 truncate">
            <span class="font-mono text-[10px] text-gray-400 flex-shrink-0">${it.dateStr}</span>
            ${it.bank ? `<span class="text-[9px] px-1.5 py-0.5 rounded bg-[#212430] text-gray-300 font-medium flex-shrink-0">${escapeHtml(it.bank)}</span>` : ''}
            ${it.category ? `<span class="text-[9px] text-[#848D99] truncate max-w-[120px]">${escapeHtml(it.category)}</span>` : ''}
          </div>
          <div class="flex items-center gap-1 flex-shrink-0">
            ${it.isBill ? `<span class="text-[9px] font-bold text-indigo-300 bg-indigo-950/60 border border-indigo-500/30 px-1.5 py-0.5 rounded flex items-center gap-0.5"><i data-lucide="calendar" class="w-2.5 h-2.5"></i>Счет</span>` : ''}
            ${it.isOneTime ? `<span class="text-[9px] font-bold text-amber-300 bg-amber-950/60 border border-amber-500/30 px-1.5 py-0.5 rounded flex items-center gap-0.5"><i data-lucide="clock" class="w-2.5 h-2.5"></i>Разовой выплатой</span>` : ''}
            ${isLarge && !it.isBill && !it.isOneTime && ctx.type === 'expense' ? `<span class="text-[9px] font-bold text-amber-300 bg-amber-950/40 border-amber-900/40 border px-1.5 py-0.5 rounded flex items-center gap-0.5">Крупная трата</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();
  updateWizAvgToggleAllButton();
}

function wizAvgChangeSort(sortVal) {
  wizAvgSelectSort(sortVal);
}
window.wizAvgChangeSort = wizAvgChangeSort;
window.wizAvgToggleSortDropdown = wizAvgToggleSortDropdown;
window.wizAvgSelectSort = wizAvgSelectSort;

function closeWizAvgDetailsModal() {
  const dlg = document.getElementById('wiz-avg-details-dialog');
  if (dlg) dlg.classList.add('hidden');
  const menu = document.getElementById('wiz-avg-sort-menu');
  if (menu) menu.classList.add('hidden');
  const catMenu = document.getElementById('wiz-avg-cat-filter-menu');
  if (catMenu) catMenu.classList.add('hidden');
  document.removeEventListener('click', closeWizAvgSortDropdownOnClickOutside);
  document.removeEventListener('click', closeWizAvgCatFilterDropdownOnClickOutside);
  wizAvgCurrentContext = null;
  if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
}

function wizAvgToggleTx(uid) {
  if (!wizAvgCurrentContext) return;
  if (wizAvgSelectedIds.has(uid)) {
    wizAvgSelectedIds.delete(uid);
  } else {
    wizAvgSelectedIds.add(uid);
  }

  const isSelected = wizAvgSelectedIds.has(uid);
  const cb = document.getElementById(`wiz-avg-cb-${uid}`);
  const row = document.getElementById(`wiz-avg-row-${uid}`);
  if (cb) cb.checked = isSelected;
  if (row) {
    if (isSelected) {
      row.classList.remove('opacity-50', 'bg-[#12151C]');
      row.classList.add('hover:border-[rgba(255,255,255,0.12)]');
    } else {
      row.classList.add('opacity-50', 'bg-[#12151C]');
      row.classList.remove('hover:border-[rgba(255,255,255,0.12)]');
    }
  }

  recalculateWizAvgModal();
}

function updateWizAvgToggleAllButton() {
  const ctx = wizAvgCurrentContext;
  const label = document.getElementById('wiz-avg-toggle-all-label');
  const icon = document.getElementById('wiz-avg-toggle-all-icon');
  if (!label || !ctx || !ctx.items) return;

  const allSelected = ctx.items.length > 0 && ctx.items.every(it => wizAvgSelectedIds.has(it.uid));
  if (allSelected) {
    label.innerText = 'Снять';
    if (icon) {
      icon.setAttribute('data-lucide', 'square');
      icon.className = 'w-3 h-3 text-gray-400 flex-shrink-0';
    }
  } else {
    label.innerText = 'Все';
    if (icon) {
      icon.setAttribute('data-lucide', 'check-check');
      icon.className = 'w-3 h-3 text-[#727cff] flex-shrink-0';
    }
  }
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function wizAvgToggleSelectAll() {
  const ctx = wizAvgCurrentContext;
  if (!ctx || !ctx.items || ctx.items.length === 0) return;

  const allSelected = ctx.items.every(it => wizAvgSelectedIds.has(it.uid));
  if (allSelected) {
    wizAvgSelectedIds.clear();
  } else {
    ctx.items.forEach(it => wizAvgSelectedIds.add(it.uid));
  }

  renderWizAvgTxList();
  recalculateWizAvgModal();
}

function wizAvgSelectAll(selectAll) {
  if (!wizAvgCurrentContext) return;
  wizAvgSelectedIds.clear();
  if (selectAll) {
    wizAvgCurrentContext.items.forEach(it => wizAvgSelectedIds.add(it.uid));
  }

  renderWizAvgTxList();
  recalculateWizAvgModal();
}

function recalculateWizAvgModal() {
  const ctx = wizAvgCurrentContext;
  if (!ctx) return;

  let selectedSum = 0;
  ctx.items.forEach(it => {
    if (wizAvgSelectedIds.has(it.uid)) {
      selectedSum += it.amount;
    }
  });

  const avg = Math.round(selectedSum * ctx.monthFactor);
  const resultEl = document.getElementById('wiz-avg-live-result');
  const countEl = document.getElementById('wiz-avg-count-label');
  const sumEl = document.getElementById('wiz-avg-total-sum');
  const btnEl = document.getElementById('wiz-avg-apply-btn');
  const periodEl = document.getElementById('wiz-avg-period-badge');
  const typeLabelEl = document.getElementById('wiz-avg-type-label');

  if (resultEl) {
    resultEl.innerText = `~${formatMoney(avg)}`;
    resultEl.className = ctx.type === 'income' 
      ? 'text-base sm:text-lg font-bold font-mono text-[#30D158] whitespace-nowrap' 
      : 'text-base sm:text-lg font-bold font-mono text-[#727cff] whitespace-nowrap';
  }
  if (typeLabelEl) {
    typeLabelEl.innerText = ctx.type === 'income' ? 'Средний доход' : 'Среднее в месяц';
  }
  if (countEl) {
    countEl.innerText = `${wizAvgSelectedIds.size} из ${ctx.items.length} оп.`;
  }
  if (sumEl) {
    sumEl.innerText = formatMoney(selectedSum);
  }
  if (periodEl) {
    periodEl.innerText = ctx.effectivePeriodText || (ctx.type === 'income' ? 'за 3 мес.' : 'за 90 дн.');
  }

  if (btnEl) {
    btnEl.innerHTML = `<span>Применить среднее</span>`;
  }

  updateWizAvgToggleAllButton();
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function toggleWizAvgIncomeCategory(catName, e) {
  if (e && e.stopPropagation) e.stopPropagation();
  const canon = getCanonicalIncomeCategory(catName);
  if (wizardActiveIncomeSources.has(canon)) {
    wizardActiveIncomeSources.delete(canon);
  } else {
    wizardActiveIncomeSources.add(canon);
  }
  if (wizAvgCurrentContext) {
    openWizAvgDetailsModal(wizAvgCurrentContext.type, wizAvgCurrentContext.categoryName, false);
  }
}
window.toggleWizAvgIncomeCategory = toggleWizAvgIncomeCategory;

function toggleWizAvgOtherCategory(catName, e) {
  if (e && e.stopPropagation) e.stopPropagation();
  if (!window.wizardActiveOtherCategories) {
    window.wizardActiveOtherCategories = new Set();
  }
  if (window.wizardActiveOtherCategories.has(catName)) {
    window.wizardActiveOtherCategories.delete(catName);
  } else {
    window.wizardActiveOtherCategories.add(catName);
  }
  if (wizAvgCurrentContext) {
    openWizAvgDetailsModal(wizAvgCurrentContext.type, wizAvgCurrentContext.categoryName, false);
  }
}
window.toggleWizAvgOtherCategory = toggleWizAvgOtherCategory;

function applyWizAvgDetailsResult() {
  const ctx = wizAvgCurrentContext;
  if (!ctx) return;

  // 1. Синхронизируем исключения
  ctx.items.forEach(it => {
    if (!wizAvgSelectedIds.has(it.uid)) {
      window.wizardExcludedTxIds.add(it.uid);
    } else {
      window.wizardExcludedTxIds.delete(it.uid);
    }
  });

  // 2. Рассчитываем итоговое среднее
  let selectedSum = 0;
  ctx.items.forEach(it => {
    if (wizAvgSelectedIds.has(it.uid)) selectedSum += it.amount;
  });
  const avg = Math.round(selectedSum * ctx.monthFactor);

  if (ctx.type === 'expense') {
    const inp = document.querySelector(`input[data-wiz-cat="${ctx.categoryName}"]`);
    if (inp) {
      inp.value = avg > 0 ? formatMoney(avg) : '';
      if (typeof fitWizLimitFont === 'function') fitWizLimitFont(inp);
      if (typeof updateWizLiveTotal === 'function') updateWizLiveTotal();
    }

    const mgrInp = document.querySelector(`input[data-mgr-cat="${ctx.categoryName}"]`);
    if (mgrInp) {
      mgrInp.value = avg > 0 ? formatMoney(avg) : '';
      if (typeof updateMgrLiveTotal === 'function') updateMgrLiveTotal();
    }

    const closeInp = document.querySelector(`input[data-close-cat="${ctx.categoryName}"]`);
    if (closeInp) {
      closeInp.value = avg > 0 ? formatMoney(avg) : '';
    }

    if (activeMonthCloseData) {
      activeMonthCloseData.averages = calculate3MonthAverages(activeMonthCloseData.year, activeMonthCloseData.month);
      if (typeof renderAdjustCategoriesList === 'function') renderAdjustCategoriesList();
      if (typeof updateMonthCloseForecast === 'function') updateMonthCloseForecast();
    }

    if (typeof renderWizLimitsEditor === 'function') renderWizLimitsEditor();
    if (typeof renderCategoryLimitsManager === 'function') renderCategoryLimitsManager();
  } else {
    const incInput = document.getElementById('wiz-income-input');
    if (incInput) {
      incInput.value = avg > 0 ? formatMoney(avg) : '';
    }
    const calcEl = document.getElementById('wiz-calculated-income');
    if (calcEl) {
      calcEl.innerText = `${formatMoney(avg)}/мес`;
    }

    const closeIncInput = document.getElementById('close-adjust-income-input');
    if (closeIncInput) {
      closeIncInput.value = avg > 0 ? formatMoney(avg) : '';
    }
    const closeAvgIncText = document.getElementById('close-adjust-avg-income-text');
    if (closeAvgIncText) {
      closeAvgIncText.innerText = `Ср: ~${formatMoney(avg)}`;
    }
    if (activeMonthCloseData) {
      activeMonthCloseData.averages.avgIncome = avg;
      if (typeof updateMonthCloseForecast === 'function') updateMonthCloseForecast();
    }
  }

  closeWizAvgDetailsModal();
}

// ========================================================
// Закрытие месяца и подведение итогов (Month Closing Flow)
// ========================================================

function calculate3MonthAverages(refYear, refMonth) {
  const result = {
    avgIncome: 0,
    avgCategorySpending: {},
    activeMonthsCount: 0
  };

  const allMonths = Cache?.transactions || [];
  if (!allMonths.length) return result;

  const targetMonths = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date(refYear, refMonth - i, 1);
    targetMonths.push({
      year: d.getFullYear(),
      month: d.getMonth(),
      start: new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0).getTime(),
      end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999).getTime(),
      income: 0,
      cats: {}
    });
  }

  // Сбор данных по операциям
  allMonths.forEach(m => {
    (m.items || []).forEach(tx => {
      let t = tx.timestamp || (tx.rawDate ? new Date(tx.rawDate).getTime() : (tx.date ? new Date(tx.date).getTime() : null));
      if (!t || isNaN(t)) return;

      const val = typeof tx.amount === 'number' ? tx.amount : (parseFloat(String(tx.amount || 0).replace(/\s/g, '').replace(/,/g, '.')) || 0);
      if (val <= 0) return;

      const isIncome = tx.type === 'Доход' || tx.type === 'income' || String(tx.type || '').trim().toLowerCase() === 'доход';
      const isExpense = tx.type === 'Расход' || tx.type === 'expense' || String(tx.type || '').trim().toLowerCase() === 'расход';
      const uid = tx.id || tx._id || `${tx.timestamp || tx.rawDate || ''}_${tx.amount}_${tx.merchant || tx.title || ''}`;
      const isExcluded = !!(window.wizardExcludedTxIds && window.wizardExcludedTxIds.has(uid)) || isBillOrOneTimeTx(tx);

      targetMonths.forEach(tm => {
        if (t >= tm.start && t <= tm.end) {
          if (isIncome) {
            tm.income += val;
          } else if (isExpense && !isExcluded && tx.category) {
            tm.cats[tx.category] = (tm.cats[tx.category] || 0) + val;
          }
        }
      });
    });
  });

  const activeMonths = targetMonths.filter(tm => tm.income > 0 || Object.keys(tm.cats).length > 0);
  const count = Math.max(1, activeMonths.length);
  result.activeMonthsCount = count;

  let totalInc = 0;
  const catSums = {};

  targetMonths.forEach(tm => {
    totalInc += tm.income;
    Object.keys(tm.cats).forEach(c => {
      catSums[c] = (catSums[c] || 0) + tm.cats[c];
    });
  });

  result.avgIncome = Math.round(totalInc / count);
  Object.keys(catSums).forEach(c => {
    result.avgCategorySpending[c] = Math.round(catSums[c] / count);
  });

  return result;
}

function calculateMonthCloseData(year, month) {
  const monthDate = new Date(year, month, 1);
  const startOfMonth = new Date(year, month, 1, 0, 0, 0, 0);
  const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999);
  const plan = Cache?.budgetPlan || {};
  const bills = Cache?.calendarBills || [];
  const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

  let actualIncome = 0;
  let actualExpense = 0;
  const categorySpentMap = {};

  (Cache?.transactions || []).forEach(m => {
    (m.items || []).forEach(tx => {
      let t = tx.timestamp || (tx.rawDate ? new Date(tx.rawDate).getTime() : (tx.date ? new Date(tx.date).getTime() : null));
      if (!t || isNaN(t)) return;
      if (t < startOfMonth.getTime() || t > endOfMonth.getTime()) return;

      const val = typeof tx.amount === 'number' ? tx.amount : (parseFloat(String(tx.amount || 0).replace(/\s/g, '').replace(/,/g, '.')) || 0);
      if (val <= 0) return;

      const isIncome = tx.type === 'Доход' || tx.type === 'income' || String(tx.type || '').trim().toLowerCase() === 'доход';
      const isExpense = tx.type === 'Расход' || tx.type === 'expense' || String(tx.type || '').trim().toLowerCase() === 'расход';
      const isExcluded = !!(tx.excludeFromBudget || tx.isExcludedFromBudget);

      if (isIncome) {
        actualIncome += val;
      } else if (isExpense && !isExcluded) {
        actualExpense += val;
        const cat = tx.category || 'Прочее';
        categorySpentMap[cat] = (categorySpentMap[cat] || 0) + val;
      }
    });
  });

  // Активные счета на этот месяц
  const activeBills = bills.filter(b => getOneTimeBillMonthInfo(b, monthDate).isActive);
  const actualBills = activeBills.reduce((s, b) => s + getEffectiveBillAmount(b, monthDate), 0);

  const planIncome = plan.monthlyIncome || 0;
  const planExpense = plan.monthlyVariableLimit || 0;
  const planCategoryLimits = plan.categoryLimits || {};

  // Расчет профицита / остатка
  const actualSurplus = actualIncome - actualExpense - actualBills;
  const planSurplus = Math.max(0, planIncome - planExpense - actualBills);
  const extraSaved = actualSurplus - planSurplus;

  // В статистике закрытия месяца отображаются ТОЛЬКО назначенные пользователем категории.
  // Все остальные траты автоматически аккумулируются в "Прочие расходы".
  const assignedCats = Object.keys(planCategoryLimits).filter(k => k !== 'Прочие расходы' && (parseFloat(planCategoryLimits[k]) || 0) > 0);
  
  const categoryStats = [];
  assignedCats.forEach(cat => {
    const spent = categorySpentMap[cat] || 0;
    const limit = planCategoryLimits[cat] || 0;
    const diff = limit - spent;
    const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0;
    categoryStats.push({ category: cat, spent, limit, diff, pct });
  });

  let otherSpent = 0;
  Object.keys(categorySpentMap).forEach(cat => {
    if (!assignedCats.includes(cat)) {
      otherSpent += categorySpentMap[cat] || 0;
    }
  });

  const otherLimit = planCategoryLimits['Прочие расходы'] || 0;
  if (otherSpent > 0 || otherLimit > 0) {
    categoryStats.push({
      category: 'Прочие расходы',
      spent: otherSpent,
      limit: otherLimit,
      diff: otherLimit - otherSpent,
      pct: otherLimit > 0 ? Math.round((otherSpent / otherLimit) * 100) : 0
    });
  }

  categoryStats.sort((a, b) => b.spent - a.spent);

  const averages = calculate3MonthAverages(year, month);

  return {
    year,
    month,
    monthName: monthNames[month],
    actualIncome,
    planIncome,
    incomeDiff: actualIncome - planIncome,
    actualExpense,
    planExpense,
    expenseDiff: planExpense - actualExpense, // положительный = экономия
    actualBills,
    billsCount: activeBills.length,
    actualSurplus,
    planSurplus,
    extraSaved,
    categoryStats,
    averages,
    isClosed: isBudgetMonthClosed(year, month)
  };
}

function openCloseMonthFlow() {
  const d = getSelectedBudgetDate();
  openMonthCloseFlow(d.getFullYear(), d.getMonth());
}

function openMonthCloseFlow(year, month) {
  activeMonthCloseData = calculateMonthCloseData(year, month);
  const data = activeMonthCloseData;
  const dlg = document.getElementById('month-close-summary-dialog');
  if (!dlg) return;

  const titleEl = document.getElementById('close-summary-title');
  const subtitleEl = document.getElementById('close-summary-subtitle');
  if (titleEl) titleEl.innerText = `Итоги за ${data.monthName} ${data.year}`;
  if (subtitleEl) subtitleEl.innerText = data.isClosed ? 'Месяц успешно закрыт' : 'Сводка выполнения финансового плана';

  // Главный баннер (Награда за экономию)
  const heroCard = document.getElementById('close-summary-hero-card');
  if (heroCard) {
    if (data.actualSurplus > 0) {
      heroCard.className = 'p-4 rounded-2xl border bg-gradient-to-br from-amber-500/15 via-[#181B24] to-emerald-500/15 border-amber-500/40 text-left shadow-lg relative overflow-hidden';
      heroCard.innerHTML = `
        <div class="flex items-start justify-between gap-3">
          <div>
            <span class="text-[10px] text-amber-400 font-bold uppercase tracking-wider block mb-1 flex items-center gap-1">
              <i data-lucide="sparkles" class="w-3 h-3"></i>
              <span>${data.isClosed ? 'Накоплено за месяц' : 'Итоговый профицит к переводу в цели'}</span>
            </span>
            <p class="text-2xl sm:text-3xl font-black font-mono text-emerald-400">+${formatMoney(data.actualSurplus)}</p>
            <p class="text-xs text-gray-200 mt-1.5 leading-relaxed">
              ${data.extraSaved > 0 
                ? `Отличная работа! Вы сэкономили <b class="text-emerald-400">+${formatMoney(data.extraSaved)}</b> сверх запланированного плана.` 
                : 'План накоплений выполнен! Средства готовы к распределению по вашим целям.'}
            </p>
          </div>
          <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-emerald-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 flex-shrink-0 shadow-md">
            <i data-lucide="award" class="w-7 h-7"></i>
          </div>
        </div>
      `;
    } else if (data.actualSurplus < 0) {
      heroCard.className = 'p-4 rounded-2xl border bg-gradient-to-br from-red-950/40 via-[#181B24] to-rose-900/20 border-red-500/30 text-left';
      heroCard.innerHTML = `
        <div class="flex items-start justify-between gap-3">
          <div>
            <span class="text-[10px] text-[#FF453A] font-bold uppercase tracking-wider block mb-1">Дефицит бюджета за месяц</span>
            <p class="text-2xl sm:text-3xl font-black font-mono text-[#FF453A]">-${formatMoney(Math.abs(data.actualSurplus))}</p>
            <p class="text-xs text-gray-300 mt-1.5 leading-relaxed">Расходы и счета превысили фактический доход. Корректировка лимитов поможет вернуть контроль в следующем месяце.</p>
          </div>
          <div class="w-11 h-11 rounded-2xl bg-red-500/20 border border-red-500/30 flex items-center justify-center text-[#FF453A] flex-shrink-0">
            <i data-lucide="alert-triangle" class="w-6 h-6"></i>
          </div>
        </div>
      `;
    } else {
      heroCard.className = 'p-4 rounded-2xl border bg-[#12151C] border-[rgba(255,255,255,0.08)] text-left';
      heroCard.innerHTML = `
        <span class="text-[10px] text-[#848D99] font-bold uppercase tracking-wider block mb-1">Баланс месяца</span>
        <p class="text-2xl sm:text-3xl font-black font-mono text-white">0 ₽</p>
        <p class="text-xs text-gray-300 mt-1">Доходы в точности покрыли расходы и обязательные счета.</p>
      `;
    }
  }

  // Метрики Дохода
  const incFact = document.getElementById('close-sum-income-fact');
  const incPlan = document.getElementById('close-sum-income-plan');
  const incDiff = document.getElementById('close-sum-income-diff');
  const incIcon = document.getElementById('close-sum-income-icon');

  if (incFact) {
    incFact.innerText = formatMoney(data.actualIncome);
    incFact.className = 'text-base font-bold font-mono text-[#30D158]';
  }
  if (incPlan) incPlan.innerText = formatMoney(data.planIncome);
  if (incDiff) {
    if (data.incomeDiff > 0) {
      incDiff.innerText = `+${formatMoney(data.incomeDiff)}`;
      incDiff.className = 'font-bold font-mono text-emerald-400';
    } else if (data.incomeDiff < 0) {
      incDiff.innerText = `-${formatMoney(Math.abs(data.incomeDiff))}`;
      incDiff.className = 'font-bold font-mono text-[#FF453A]';
    } else {
      incDiff.innerText = '0 ₽';
      incDiff.className = 'font-bold font-mono text-gray-400';
    }
  }
  if (incIcon) {
    if (data.incomeDiff < 0) {
      incIcon.className = 'w-3.5 h-3.5 text-[#FF453A]';
    } else {
      incIcon.className = 'w-3.5 h-3.5 text-emerald-400';
    }
  }

  // Траты на жизнь
  const expFact = document.getElementById('close-sum-expense-fact');
  const expPlan = document.getElementById('close-sum-expense-plan');
  const expDiff = document.getElementById('close-sum-expense-diff');
  if (expFact) expFact.innerText = formatMoney(data.actualExpense);
  if (expPlan) expPlan.innerText = formatMoney(data.planExpense);
  if (expDiff) {
    if (data.expenseDiff > 0) {
      expDiff.innerText = `Экон. +${formatMoney(data.expenseDiff)}`;
      expDiff.className = 'font-bold font-mono text-emerald-400';
    } else if (data.expenseDiff < 0) {
      expDiff.innerText = `Превыш. ${formatMoney(Math.abs(data.expenseDiff))}`;
      expDiff.className = 'font-bold font-mono text-[#FF453A]';
    } else {
      expDiff.innerText = 'В лимите';
      expDiff.className = 'font-bold font-mono text-gray-400';
    }
  }

  const billsFact = document.getElementById('close-sum-bills-fact');
  const billsCount = document.getElementById('close-sum-bills-count');
  if (billsFact) billsFact.innerText = formatMoney(data.actualBills);
  if (billsCount) billsCount.innerText = `${data.billsCount} шт`;

  // Список категорий
  const catCountEl = document.getElementById('close-sum-cat-count');
  const catListEl = document.getElementById('close-sum-categories-list');
  if (catCountEl) catCountEl.innerText = `${data.categoryStats.length} категорий`;
  if (catListEl) {
    if (data.categoryStats.length === 0) {
      catListEl.innerHTML = '<div class="text-xs text-[#848D99] text-center py-2">Нет трат по категориям</div>';
    } else {
      catListEl.innerHTML = data.categoryStats.map(c => {
        const icon = getCategoryIcon(c.category);
        const isOver = c.limit > 0 && c.spent > c.limit;
        const hasLimit = c.limit > 0;
        return `
          <div class="p-2.5 rounded-xl bg-[#12151C] border border-[rgba(255,255,255,0.04)] flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 min-w-0 flex-1">
              <div class="w-7 h-7 rounded-lg bg-[#212430] flex items-center justify-center text-[#727cff] flex-shrink-0">
                <i data-lucide="${icon}" class="w-3.5 h-3.5"></i>
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-xs font-bold text-white truncate">${escapeHtml(c.category)}</p>
                <p class="text-[10px] text-[#848D99]">${formatMoney(c.spent)} ${hasLimit ? `/ ${formatMoney(c.limit)}` : '(без лимита)'}</p>
              </div>
            </div>
            <div class="text-right flex-shrink-0">
              ${hasLimit 
                ? (isOver 
                    ? `<span class="text-[10px] font-mono font-bold text-[#FF453A] px-2 py-0.5 rounded-md bg-red-500/10 border border-red-500/20">+${formatMoney(c.spent - c.limit)}</span>` 
                    : `<span class="text-[10px] font-mono font-bold text-emerald-400 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20">-${formatMoney(c.diff)}</span>`)
                : `<span class="text-[10px] font-mono text-gray-400">${formatMoney(c.spent)}</span>`
              }
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // Кнопка продолжения (строго "Далее" без иконок). Скрываем для закрытых месяцев.
  const contBtn = document.getElementById('close-summary-continue-btn');
  if (contBtn) {
    if (data.isClosed) {
      contBtn.classList.add('hidden');
    } else {
      contBtn.classList.remove('hidden');
      contBtn.innerHTML = `<span>Далее</span>`;
    }
  }

  dlg.classList.remove('hidden');
  if (typeof lockBodyScroll === 'function') lockBodyScroll();
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeMonthCloseSummaryModal() {
  const dlg = document.getElementById('month-close-summary-dialog');
  if (dlg) {
    dlg.classList.add('hidden');
    if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
  }
}

// Активные категории в окне корректировки плана на следующий месяц
let adjustActiveCategories = [];

function proceedToMonthAdjustStep() {
  closeMonthCloseSummaryModal();

  const dlg = document.getElementById('month-close-adjust-dialog');
  if (!dlg || !activeMonthCloseData) return;

  // Если месяц уже закрыт, не переходим ко второму окну настройки лимитов
  if (activeMonthCloseData.isClosed) return;

  const data = activeMonthCloseData;
  const nextMonthDate = new Date(data.year, data.month + 1, 1);
  const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const nextMonthName = monthNames[nextMonthDate.getMonth()];

  const titleEl = document.getElementById('close-adjust-title');
  const subBtnText = document.getElementById('close-adjust-submit-btn-text');
  if (titleEl) titleEl.innerText = `План на ${nextMonthName} ${nextMonthDate.getFullYear()}`;
  if (subBtnText) subBtnText.innerText = `Принять и продолжить`;

  // Поле дохода
  const incInput = document.getElementById('close-adjust-income-input');
  const avgIncText = document.getElementById('close-adjust-avg-income-text');
  const avgIncome = data.averages.avgIncome || data.planIncome || 0;

  if (incInput) {
    incInput.value = formatMoney(data.planIncome || avgIncome);
  }
  if (avgIncText) {
    avgIncText.innerText = `Ср: ~${formatMoney(avgIncome)}`;
  }

  // Инициализация категорий: ТОЛЬКО назначенные ранее категории
  const plan = Cache?.budgetPlan || {};
  const currentLimits = plan.categoryLimits || {};
  const assigned = Object.keys(currentLimits).filter(k => (parseFloat(currentLimits[k]) || 0) > 0);
  
  if (assigned.length > 0) {
    adjustActiveCategories = [...assigned];
  } else {
    adjustActiveCategories = ['Продукты', 'Кафе и рестораны', 'Транспорт', 'Развлечения'];
  }

  renderAdjustCategoriesList();
  updateMonthCloseForecast();

  if (typeof lockBodyScroll === 'function') lockBodyScroll();
  dlg.classList.remove('hidden');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderAdjustCategoriesList() {
  const catContainer = document.getElementById('close-adjust-categories-container');
  if (!catContainer || !activeMonthCloseData) return;

  const data = activeMonthCloseData;
  const plan = Cache?.budgetPlan || {};
  const currentLimits = plan.categoryLimits || {};
  const allExpenseCats = Cache?.categories?.expense || [];

  if (adjustActiveCategories.length === 0) {
    catContainer.innerHTML = '<div class="text-xs text-[#848D99] text-center py-3 bg-[#12151C] rounded-2xl border border-[rgba(255,255,255,0.04)]">Нет выбранных категорий. Добавьте категории кнопкой ниже.</div>';
    return;
  }

  catContainer.innerHTML = adjustActiveCategories.map(cat => {
    const catObj = allExpenseCats.find(c => (typeof c === 'string' ? c : c?.name) === cat);
    const icon = catObj?.icon || getCategoryIcon(cat);
    const existingVal = document.querySelector(`input[data-close-cat="${cat}"]`);
    const curLimit = existingVal ? (getUnformattedVal(existingVal) || 0) : (currentLimits[cat] || 0);

    // Расчет среднего значения (с корректной аккумуляцией невыделенных категорий в "Прочие расходы")
    let avgSpend = 0;
    if (cat === 'Прочие расходы') {
      Object.keys(data.averages.avgCategorySpending || {}).forEach(k => {
        if (!adjustActiveCategories.includes(k)) {
          avgSpend += data.averages.avgCategorySpending[k] || 0;
        }
      });
    } else {
      avgSpend = data.averages.avgCategorySpending[cat] || 0;
    }
    avgSpend = Math.round(avgSpend);

    return `
      <div class="py-2 px-3 rounded-2xl bg-[#12151C] border border-[rgba(255,255,255,0.04)] flex items-center justify-between gap-3">
        <div class="w-8 h-8 rounded-xl bg-[#1E2330] text-gray-300 flex items-center justify-center flex-shrink-0">
          <i data-lucide="${icon}" class="w-4 h-4 text-[#848D99]"></i>
        </div>
        
        <div class="flex-1 min-w-0 pr-1">
          <div class="flex items-center gap-1.5">
            <span class="text-xs font-bold text-gray-200 truncate">${escapeHtml(cat)}</span>
          </div>
          ${avgSpend > 0 ? `
            <div class="flex items-center gap-1 mt-0.5">
              <div onclick="applyAdjustAverageCategoryLimit('${escapeHtml(cat)}', ${avgSpend})" 
                   class="w-[100px] h-6 justify-between text-[10px] py-0.5 px-2 bg-[#6C5DD3]/10 text-[#727cff] hover:bg-[#6C5DD3]/20 border border-[#6C5DD3]/20 rounded-lg whitespace-nowrap flex items-center cursor-pointer transition-all active:scale-95 flex-shrink-0" 
                   title="Нажмите, чтобы применить среднее">
                <span class="truncate">Ср: ~${formatMoney(avgSpend)}</span>
                <i data-lucide="arrow-right" class="w-2.5 h-2.5 flex-shrink-0 ml-1"></i>
              </div>
              <button type="button" 
                      onclick="openWizAvgDetailsModal('expense', '${escapeHtml(cat)}')" 
                      class="w-6 h-6 rounded-lg bg-[#1E2330] hover:bg-[#2A2D3C] text-[#727cff] border border-[rgba(255,255,255,0.06)] flex items-center justify-center flex-shrink-0 cursor-pointer transition-colors" 
                      title="Настройка транзакций в расчете">
                <i data-lucide="sliders-horizontal" class="w-3 h-3"></i>
              </button>
            </div>
          ` : `
            <div class="flex items-center gap-1 mt-0.5">
              <span class="text-[10px] text-[#848D99] w-[100px] block truncate">Ср: нет данных</span>
              <button type="button" 
                      onclick="openWizAvgDetailsModal('expense', '${escapeHtml(cat)}')" 
                      class="w-6 h-6 rounded-lg bg-[#1E2330] hover:bg-[#2A2D3C] text-gray-400 hover:text-white border border-[rgba(255,255,255,0.06)] flex items-center justify-center flex-shrink-0 cursor-pointer transition-colors" 
                      title="Просмотр и выбор транзакций">
                <i data-lucide="sliders-horizontal" class="w-3 h-3"></i>
              </button>
            </div>
          `}
        </div>

        <div class="w-[96px] flex-shrink-0">
          <input type="text" 
                 data-close-cat="${escapeHtml(cat)}" 
                 inputmode="numeric" 
                 oninput="formatSumInput(this); updateMonthCloseForecast();" 
                 placeholder="0 ₽" 
                 value="${curLimit > 0 ? formatMoney(curLimit) : ''}" 
                 class="w-full bg-[#181B24] border border-[rgba(255,255,255,0.08)] focus:border-[#6C5DD3] text-white text-xs font-bold font-mono rounded-xl p-2 outline-none text-right transition-colors">
        </div>
      </div>
    `;
  }).join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function openAddAdjustCategoryPicker() {
  const dlg = document.getElementById('month-adjust-category-picker-dialog');
  const listEl = document.getElementById('month-adjust-category-picker-list');
  if (!dlg || !listEl) return;

  const expenseCats = (Cache?.categories?.expense || []).map(c => typeof c === 'string' ? c : (c?.name || '')).filter(Boolean);
  const standardCats = ['Продукты', 'Кафе и рестораны', 'Маркетплейсы', 'Транспорт', 'Жилье', 'Одежда', 'Здоровье', 'Развлечения', 'Другое'];
  const allAvailable = Array.from(new Set([...expenseCats, ...standardCats])).filter(c => !adjustActiveCategories.includes(c));

  if (allAvailable.length === 0) {
    listEl.innerHTML = '<div class="text-xs text-[#848D99] text-center py-4">Все доступные категории уже добавлены в план.</div>';
  } else {
    listEl.innerHTML = allAvailable.map(cat => {
      const icon = getCategoryIcon(cat);
      return `
        <button type="button" 
                onclick="selectAdjustCategoryToAdd('${escapeHtml(cat)}')" 
                class="w-full p-2.5 rounded-xl bg-[#12151C] hover:bg-[#212430] border border-[rgba(255,255,255,0.04)] flex items-center justify-between text-left transition-colors cursor-pointer group">
          <div class="flex items-center gap-2.5">
            <div class="w-7 h-7 rounded-lg bg-[#181B24] flex items-center justify-center text-[#727cff]">
              <i data-lucide="${icon}" class="w-3.5 h-3.5"></i>
            </div>
            <span class="text-xs font-semibold text-gray-200 group-hover:text-white">${escapeHtml(cat)}</span>
          </div>
          <i data-lucide="plus" class="w-4 h-4 text-gray-400 group-hover:text-[#6C5DD3]"></i>
        </button>
      `;
    }).join('');
  }

  dlg.classList.remove('hidden');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeAddAdjustCategoryPicker() {
  const dlg = document.getElementById('month-adjust-category-picker-dialog');
  if (dlg) {
    dlg.classList.add('hidden');
    if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
  }
}

function selectAdjustCategoryToAdd(catName) {
  if (catName && !adjustActiveCategories.includes(catName)) {
    adjustActiveCategories.push(catName);
    renderAdjustCategoriesList();
    updateMonthCloseForecast();
  }
  closeAddAdjustCategoryPicker();
}

function removeAdjustCategory(catName) {
  adjustActiveCategories = adjustActiveCategories.filter(c => c !== catName);
  renderAdjustCategoriesList();
  updateMonthCloseForecast();
}

function closeMonthCloseAdjustModal() {
  const dlg = document.getElementById('month-close-adjust-dialog');
  if (dlg) {
    dlg.classList.add('hidden');
    if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
  }
}

function backToMonthSummaryStep() {
  closeMonthCloseAdjustModal();
  const dlg = document.getElementById('month-close-summary-dialog');
  if (dlg) dlg.classList.remove('hidden');
}

function updateMonthCloseForecast() {
  const incInput = document.getElementById('close-adjust-income-input');
  const income = incInput ? (getUnformattedVal(incInput) || 0) : 0;

  let totalLimits = 0;
  document.querySelectorAll('[data-close-cat]').forEach(inp => {
    totalLimits += getUnformattedVal(inp) || 0;
  });

  const bills = Cache?.calendarBills || [];
  const recurringBills = bills.filter(b => b.type !== 'onetime' && b.type !== 'Разовый');
  const billsTotal = recurringBills.reduce((s, b) => s + (parseFloat(b.amount) || 0), 0);

  const surplus = income - totalLimits - billsTotal;

  const limitsLabel = document.getElementById('close-adjust-total-limits-label');
  const forecastIncome = document.getElementById('close-adjust-forecast-income');
  const forecastLimits = document.getElementById('close-adjust-forecast-limits');
  const forecastBills = document.getElementById('close-adjust-forecast-bills');
  const forecastSurplus = document.getElementById('close-adjust-forecast-surplus');

  if (limitsLabel) limitsLabel.innerText = `Сумма: ${formatMoney(totalLimits)}`;
  if (forecastIncome) forecastIncome.innerText = formatMoney(income);
  if (forecastLimits) forecastLimits.innerText = formatMoney(totalLimits);
  if (forecastBills) forecastBills.innerText = formatMoney(billsTotal);

  if (forecastSurplus) {
    if (surplus > 0) {
      forecastSurplus.innerText = `+${formatMoney(surplus)} / мес`;
      forecastSurplus.className = 'text-xs sm:text-sm font-black font-mono text-emerald-400 whitespace-nowrap flex-shrink-0';
    } else if (surplus < 0) {
      forecastSurplus.innerText = `-${formatMoney(Math.abs(surplus))} / мес`;
      forecastSurplus.className = 'text-xs sm:text-sm font-black font-mono text-[#FF453A] whitespace-nowrap flex-shrink-0';
    } else {
      forecastSurplus.innerText = '0 ₽ / мес';
      forecastSurplus.className = 'text-xs sm:text-sm font-black font-mono text-gray-300 whitespace-nowrap flex-shrink-0';
    }
  }
}

function deleteCurrentWizCategory() {
  if (wizAvgCurrentContext && wizAvgCurrentContext.categoryName) {
    removeAdjustCategory(wizAvgCurrentContext.categoryName);
  }
  closeWizAvgDetailsModal();
}
window.deleteCurrentWizCategory = deleteCurrentWizCategory;

function applyAdjustAverageIncome() {
  if (!activeMonthCloseData) return;
  const avg = activeMonthCloseData.averages.avgIncome || 0;
  const incInput = document.getElementById('close-adjust-income-input');
  if (incInput) {
    incInput.value = formatMoney(avg);
    updateMonthCloseForecast();
  }
}

function applyAdjustAverageCategoryLimit(catName, avgValue) {
  const inp = document.querySelector(`input[data-close-cat="${catName}"]`);
  if (inp) {
    inp.value = avgValue > 0 ? formatMoney(avgValue) : '';
    updateMonthCloseForecast();
  }
}

function applyAllAdjustAverageCategoryLimits() {
  if (!activeMonthCloseData) return;
  const avgs = activeMonthCloseData.averages.avgCategorySpending || {};
  document.querySelectorAll('[data-close-cat]').forEach(inp => {
    const cat = inp.dataset.closeCat;
    let avg = 0;
    if (cat === 'Прочие расходы') {
      Object.keys(avgs).forEach(k => {
        if (!adjustActiveCategories.includes(k)) {
          avg += avgs[k] || 0;
        }
      });
    } else {
      avg = avgs[cat] || 0;
    }
    inp.value = avg > 0 ? formatMoney(Math.round(avg)) : '';
  });
  updateMonthCloseForecast();
}

// ----------------------------------------------------
// МОДАЛЬНОЕ ОКНО ОПЛАТЫ И СВЯЗЫВАНИЯ СЧЕТА С ОПЕРАЦИЯМИ
// ----------------------------------------------------
let activeMatchingBillId = null;
let selectedMatchingTxId = null;

function openBillPaymentMatchModal(billId, preserveSelection = false) {
  activeMatchingBillId = billId;
  if (!preserveSelection) {
    selectedMatchingTxId = null;
  }

  const bill = (Cache?.calendarBills || []).find(b => b.id === billId);
  const dlg = document.getElementById('bill-payment-match-dialog');
  if (!bill || !dlg) return;

  const targetDate = (typeof getSelectedBudgetDate === 'function') ? getSelectedBudgetDate() : new Date();
  const year = targetDate.getFullYear();
  const month = targetDate.getMonth();
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
  const info = getOneTimeBillMonthInfo(bill, targetDate);

  const titleEl = document.getElementById('bill-match-title');
  const nameEl = document.getElementById('bill-match-name');
  const dateEl = document.getElementById('bill-match-date-hint');
  const amountEl = document.getElementById('bill-match-amount');
  const unlinkBtn = document.getElementById('bill-match-unlink-btn');

  if (titleEl) {
    titleEl.innerText = info.isOneTime ? 'Оплата разовой траты' : 'Оплата ежемесячной траты';
  }
  if (nameEl) nameEl.innerText = bill.name || 'Счет';
  if (dateEl) {
    dateEl.innerText = info.isOneTime ? `${bill.day || 1} число` : `${bill.day || 1} число каждого месяца`;
  }

  // Получаем транзакции текущего месяца
  const allTxs = getAllCachedTransactionsFlat();
  const calendarBills = Cache?.calendarBills || [];

  const effectiveAmount = getEffectiveBillAmount(bill, targetDate, allTxs);
  const baseAmount = parseFloat(bill.amount) || 0;
  if (amountEl) {
    if (Math.abs(effectiveAmount - baseAmount) > 0.01) {
      amountEl.innerHTML = `${formatMoney(effectiveAmount)} <span class="text-[10px] text-[#848D99] font-normal">(план: ${formatMoney(baseAmount)})</span>`;
    } else {
      amountEl.innerText = formatMoney(baseAmount);
    }
  }

  // Собираем множество идентификаторов транзакций, привязанных к ДРУГИМ счетам
  const otherLinkedTxIds = new Set();
  calendarBills.forEach(b => {
    if (b.id !== bill.id && b.linkedTxId) {
      otherLinkedTxIds.add(b.linkedTxId);
    }
  });

  const monthTxs = allTxs.filter(t => {
    if (t.type !== 'Расход') return false;
    const dateStr = t.rawDate || t.date || '';
    const d = typeof parseAnyDate === 'function' ? parseAnyDate(dateStr) : (dateStr ? new Date(dateStr) : null);
    if (!d || isNaN(d.getTime())) return false;
    if (d.getFullYear() !== year || d.getMonth() !== month) return false;

    // Исключаем транзакции, которые уже привязаны к другим счетам
    if (otherLinkedTxIds.has(t.id)) return false;
    if (t.billId && t.billId !== bill.id) return false;
    if (t.isBillPayment && t.billId && t.billId !== bill.id) return false;
    if (t.isBillPayment && !t.billId && t.id !== bill.linkedTxId) return false;

    return true;
  });

  // Проверяем, есть ли уже связанная транзакция
  const linkedTx = monthTxs.find(tx => (tx.billId === bill.id || tx.id === bill.linkedTxId) && (tx.isBillPayment || tx.excludeFromBudget));
  const isPaid = (bill.paidMonths && bill.paidMonths[monthKey]) || bill.isPaid || !!linkedTx;

  if (!preserveSelection && linkedTx) {
    selectedMatchingTxId = linkedTx.id;
  }

  if (unlinkBtn) {
    if (isPaid || linkedTx) {
      unlinkBtn.classList.remove('hidden');
    } else {
      unlinkBtn.classList.add('hidden');
    }
  }

  const billAmount = parseFloat(bill.amount) || 0;
  const tolerance = billAmount * 0.33;

  const suggestedListEl = document.getElementById('bill-match-suggested-list');
  const otherListEl = document.getElementById('bill-match-other-list');

  const suggestedTxs = [];
  const otherTxs = [];

  monthTxs.forEach(tx => {
    const amt = parseFloat(tx.amount) || 0;
    const diff = Math.abs(amt - billAmount);
    if (diff <= tolerance) {
      suggestedTxs.push(tx);
    } else {
      otherTxs.push(tx);
    }
  });

  const renderTxItem = (tx) => {
    const isSelected = (selectedMatchingTxId === tx.id);
    const icon = getCategoryIcon(tx.category);
    return `
      <div onclick="selectBillMatchTx('${tx.id}')" 
           class="p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2.5 ${isSelected ? 'bg-[#6C5DD3]/20 border-[#6C5DD3] text-white shadow-sm' : 'bg-[#12151C] border-[rgba(255,255,255,0.04)] hover:bg-[#181B24] text-gray-300'}">
        <div class="flex items-center gap-2.5 min-w-0 flex-1">
          <div class="w-8 h-8 rounded-lg ${isSelected ? 'bg-[#6C5DD3] text-white' : 'bg-[#212430] text-[#727cff]'} flex items-center justify-center flex-shrink-0">
            <i data-lucide="${icon}" class="w-4 h-4"></i>
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-xs font-bold truncate ${isSelected ? 'text-white' : 'text-gray-200'}">${escapeHtml(tx.category)}</p>
            <p class="text-[10px] text-[#848D99] truncate">${tx.formattedDate || tx.rawDate || tx.date || ''} ${tx.comment ? `· ${escapeHtml(tx.comment)}` : ''}</p>
          </div>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <span class="text-xs font-bold font-mono text-white">-${formatMoney(tx.amount)}</span>
          <div class="w-4 h-4 rounded-full border flex items-center justify-center ${isSelected ? 'bg-[#6C5DD3] border-[#6C5DD3] text-white' : 'border-gray-600'}">
            ${isSelected ? '<i data-lucide="check" class="w-2.5 h-2.5 stroke-[3]"></i>' : ''}
          </div>
        </div>
      </div>
    `;
  };

  if (suggestedListEl) {
    if (suggestedTxs.length === 0) {
      suggestedListEl.innerHTML = '<div class="text-[11px] text-[#848D99] text-center py-2 px-3 bg-[#12151C] rounded-xl border border-[rgba(255,255,255,0.04)]">Подходящих операций нет. Вы можете создать новую операцию или выбрать из списка ниже.</div>';
    } else {
      suggestedListEl.innerHTML = suggestedTxs.map(renderTxItem).join('');
    }
  }

  if (otherListEl) {
    if (otherTxs.length === 0) {
      otherListEl.innerHTML = '<div class="text-[11px] text-[#848D99] text-center py-2">Нет других операций в этом месяце.</div>';
    } else {
      otherListEl.innerHTML = otherTxs.map(renderTxItem).join('');
    }
  }

  const applyBtn = document.getElementById('bill-match-apply-btn');
  if (applyBtn) {
    if (selectedMatchingTxId) {
      applyBtn.classList.remove('opacity-60');
      applyBtn.classList.add('opacity-100');
    } else {
      applyBtn.classList.remove('opacity-100');
      applyBtn.classList.add('opacity-60');
    }
  }

  if (typeof lockBodyScroll === 'function') lockBodyScroll();
  dlg.classList.remove('hidden');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeBillPaymentMatchModal() {
  const dlg = document.getElementById('bill-payment-match-dialog');
  if (dlg) {
    dlg.classList.add('hidden');
    if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
  }
  activeMatchingBillId = null;
  selectedMatchingTxId = null;
}

function selectBillMatchTx(txId) {
  selectedMatchingTxId = (selectedMatchingTxId === txId) ? null : txId;
  const bill = (Cache?.calendarBills || []).find(b => b.id === activeMatchingBillId);
  if (bill) openBillPaymentMatchModal(bill.id, true);
}

function createAndLinkBillTransaction() {
  if (!activeMatchingBillId) return;
  const bill = (Cache?.calendarBills || []).find(b => b.id === activeMatchingBillId);
  if (!bill) return;

  const targetDate = (typeof getSelectedBudgetDate === 'function') ? getSelectedBudgetDate() : new Date();
  const year = targetDate.getFullYear();
  const month = targetDate.getMonth();
  const maxDay = new Date(year, month + 1, 0).getDate();
  const billDay = Math.min(Math.max(1, parseInt(bill.day, 10) || 1), maxDay);
  const plannedDate = new Date(year, month, billDay);

  const isOneTime = bill.type === 'onetime' || bill.type === 'Разовый';
  const totalAmount = isOneTime && bill.totalAmount ? (parseFloat(bill.totalAmount) || parseFloat(bill.amount) || 0) : (parseFloat(bill.amount) || 0);
  const spreadMonths = parseInt(bill.spreadMonths, 10) || 1;

  closeBillPaymentMatchModal();

  if (typeof openCreateTxModal === 'function') {
    openCreateTxModal({
      type: 'Расход',
      amount: totalAmount,
      date: plannedDate,
      category: '', // Категория изначально не задана
      comment: bill.name || '',
      isBillPayment: !isOneTime,
      billType: isOneTime ? 'onetime' : 'recurring',
      excludeFromBudget: true,
      spreadMonths: spreadMonths,
      billId: bill.id,
      billName: bill.name || '',
      title: isOneTime ? 'Оплата разовой траты' : 'Оплата счета',
      subtitle: `Создание операции для «${bill.name}»`
    });
  }
}

async function applySelectedBillMatch() {
  if (!activeMatchingBillId) return;
  const bill = (Cache?.calendarBills || []).find(b => b.id === activeMatchingBillId);
  if (!bill) return;

  if (!selectedMatchingTxId) {
    showToast('Выберите операцию из списка или создайте новую', true);
    return;
  }

  const allTxs = getAllCachedTransactionsFlat();
  const tx = allTxs.find(t => t.id === selectedMatchingTxId);
  if (!tx) {
    showToast('Выбранная транзакция не найдена', true);
    return;
  }

  const targetDate = (typeof getSelectedBudgetDate === 'function') ? getSelectedBudgetDate() : new Date();
  const year = targetDate.getFullYear();
  const month = targetDate.getMonth();
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;

  const isOneTime = bill.type === 'onetime' || bill.type === 'Разовый';
  const spreadMonths = parseInt(bill.spreadMonths, 10) || tx.spreadMonths || 1;

  try {
    const batch = db.batch();

    // 1. Помечаем транзакцию как оплату счета / разовую трату и исключаем из лимитов на жизнь
    const txRef = getUserCol('Transactions').doc(tx.id);
    batch.update(txRef, {
      isBillPayment: !isOneTime,
      billType: isOneTime ? 'onetime' : 'recurring',
      spreadMonths: spreadMonths,
      excludeFromBudget: true,
      billId: bill.id,
      billName: bill.name || '',
      updatedAt: Date.now()
    });

    // 2. Помечаем счет как оплаченный с сохранением фактической суммы чека для текущего месяца
    const txAmount = parseFloat(tx.amount) || 0;
    const paidMonths = { ...(bill.paidMonths || {}) };
    paidMonths[monthKey] = {
      paid: true,
      txId: tx.id,
      amount: txAmount
    };

    const billRef = getUserCol('CalendarBills').doc(bill.id);
    batch.update(billRef, {
      isPaid: true,
      linkedTxId: tx.id,
      paidMonths: paidMonths,
      updatedAt: Date.now()
    });

    // Мгновенное оптимистичное обновление локального кэша и интерфейса
    tx.isBillPayment = !isOneTime;
    tx.billType = isOneTime ? 'onetime' : 'recurring';
    tx.spreadMonths = spreadMonths;
    tx.excludeFromBudget = true;
    tx.billId = bill.id;
    tx.billName = bill.name || '';

    bill.isPaid = true;
    bill.linkedTxId = tx.id;
    bill.paidMonths = paidMonths;

    closeBillPaymentMatchModal();
    if (typeof renderBudgetTab === 'function') renderBudgetTab();
    if (typeof renderTransactions === 'function') renderTransactions();

    showToast(`Оплата «${bill.name}» привязана`);

    // Фоновое сохранение в базу без блокировки UI
    batch.commit().catch(err => {
      console.error('Ошибка сохранения привязки:', err);
      showToast('Ошибка сохранения: ' + err.message, true);
    });
  } catch (err) {
    console.error('Ошибка привязки счета:', err);
    showToast('Ошибка привязки: ' + err.message, true);
  }
}

async function unlinkCurrentBillPayment() {
  if (!activeMatchingBillId) return;
  const bill = (Cache?.calendarBills || []).find(b => b.id === activeMatchingBillId);
  if (!bill) return;

  const targetDate = (typeof getSelectedBudgetDate === 'function') ? getSelectedBudgetDate() : new Date();
  const year = targetDate.getFullYear();
  const month = targetDate.getMonth();
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;

  try {
    const batch = db.batch();
    const allTxs = getAllCachedTransactionsFlat();

    // 1. Снимаем статус со связанных транзакций в кэше и формируем пакет изменений
    allTxs.forEach(tx => {
      if (tx.billId === bill.id || tx.id === bill.linkedTxId) {
        tx.isBillPayment = false;
        tx.excludeFromBudget = false;
        tx.spreadMonths = 1;
        tx.billType = null;
        tx.billId = null;
        tx.billName = null;

        const txRef = getUserCol('Transactions').doc(tx.id);
        batch.update(txRef, {
          isBillPayment: false,
          excludeFromBudget: false,
          spreadMonths: 1,
          billType: null,
          billId: null,
          billName: null,
          updatedAt: Date.now()
        });
      }
    });

    // 2. Снимаем оплату со счета
    const paidMonths = { ...(bill.paidMonths || {}) };
    delete paidMonths[monthKey];

    const billRef = getUserCol('CalendarBills').doc(bill.id);
    batch.update(billRef, {
      isPaid: false,
      linkedTxId: null,
      paidMonths: paidMonths,
      updatedAt: Date.now()
    });

    bill.isPaid = false;
    bill.linkedTxId = null;
    bill.paidMonths = paidMonths;

    // Мгновенное закрытие модалки и перерисовка дашборда и транзакций
    closeBillPaymentMatchModal();
    if (typeof renderBudgetTab === 'function') renderBudgetTab();
    if (typeof renderTransactions === 'function') renderTransactions();

    showToast(`Оплата «${bill.name}» снята`);

    // Фоновое сохранение изменений в Firestore
    batch.commit().catch(err => {
      console.error('Ошибка снятия оплаты:', err);
      showToast('Ошибка снятия: ' + err.message, true);
    });
  } catch (err) {
    console.error('Ошибка снятия оплаты:', err);
    showToast('Ошибка снятия: ' + err.message, true);
  }
}

// При удалении транзакций, сбрасываем статус привязанных счетов на "не оплачено"
async function handleTransactionsDeleted(txIds, deletedTxs = [], existingBatch = null) {
  if (!Array.isArray(txIds) || txIds.length === 0) return;
  const txIdSet = new Set(txIds);

  const bills = Cache?.calendarBills || [];
  if (!bills.length) return;

  const targetDate = (typeof getSelectedBudgetDate === 'function') ? getSelectedBudgetDate() : new Date();
  const fallbackYear = targetDate.getFullYear();
  const fallbackMonth = targetDate.getMonth();
  const fallbackMonthKey = `${fallbackYear}-${String(fallbackMonth + 1).padStart(2, '0')}`;

  const batch = existingBatch || db.batch();
  let updatedAnyBill = false;

  bills.forEach(bill => {
    const isLinkedByBillTxId = bill.linkedTxId && txIdSet.has(bill.linkedTxId);
    const matchingTxs = deletedTxs.filter(t => t.billId === bill.id || t.id === bill.linkedTxId);
    const isLinkedByTxBillId = matchingTxs.length > 0;

    if (isLinkedByBillTxId || isLinkedByTxBillId) {
      updatedAnyBill = true;

      const paidMonths = { ...(bill.paidMonths || {}) };

      if (matchingTxs.length > 0) {
        matchingTxs.forEach(tx => {
          const raw = tx.rawDate || tx.date;
          const txDateObj = (typeof parseAnyDate === 'function' ? parseAnyDate(raw) : new Date(raw)) || targetDate;
          const mk = `${txDateObj.getFullYear()}-${String(txDateObj.getMonth() + 1).padStart(2, '0')}`;
          delete paidMonths[mk];
        });
      } else {
        delete paidMonths[fallbackMonthKey];
      }

      bill.isPaid = false;
      if (isLinkedByBillTxId || (Array.isArray(matchingTxs) && matchingTxs.some(t => t && t.id === bill.linkedTxId))) {
        bill.linkedTxId = null;
      }
      bill.paidMonths = paidMonths;

      const billRef = getUserCol('CalendarBills').doc(bill.id);
      batch.update(billRef, {
        isPaid: false,
        linkedTxId: bill.linkedTxId,
        paidMonths: paidMonths,
        updatedAt: Date.now()
      });
    }
  });

  if (updatedAnyBill && !existingBatch) {
    try {
      await batch.commit();
    } catch (err) {
      console.error('Ошибка при сбросе статуса оплаты счетов:', err);
    }
  }
}
window.handleTransactionsDeleted = handleTransactionsDeleted;

async function finalizeMonthClose() {
  if (!activeMonthCloseData) return;
  const data = activeMonthCloseData;
  const income = getUnformattedVal(document.getElementById('close-adjust-income-input')) || 0;

  const categoryLimits = {};
  let totalLimits = 0;
  document.querySelectorAll('[data-close-cat]').forEach(inp => {
    const val = getUnformattedVal(inp);
    if (val > 0) {
      categoryLimits[inp.dataset.closeCat] = val;
      totalLimits += val;
    }
  });

  const monthKey = `${data.year}-${String(data.month + 1).padStart(2, '0')}`;
  const plan = Cache?.budgetPlan || {};
  const closedMonths = plan.closedMonths || {};

  // Распределение фактического профицита или дефицита в цели
  const goals = Cache?.goals || [];
  const actualSurplus = data.actualSurplus || 0;
  const goalIncrements = [];

  try {
    const batch = db.batch();

    // 1. Обновление целей на основе доли (share %)
    if (actualSurplus !== 0 && goals.length > 0) {
      goals.forEach(g => {
        const sharePct = parseFloat(g.share) || 0;
        if (sharePct > 0) {
          const changeAmount = Math.round(actualSurplus * (sharePct / 100));
          if (changeAmount !== 0) {
            const oldSaved = parseFloat(g.saved) || 0;
            const newSaved = Math.max(0, oldSaved + changeAmount);
            const target = parseFloat(g.target) || 0;
            const isAchieved = (target > 0 && newSaved >= target);

            const goalRef = getUserCol('Goals').doc(g.id);
            batch.update(goalRef, {
              saved: newSaved,
              status: isAchieved ? 'Выполнена' : (g.status === 'Выполнена' && newSaved < target ? 'В процессе' : (g.status || 'В процессе')),
              updatedAt: Date.now()
            });

            // Обновляем локально
            g.saved = newSaved;
            if (isAchieved) g.status = 'Выполнена';

            goalIncrements.push({
              id: g.id,
              name: g.name,
              changeAmount,
              oldSaved,
              newSaved,
              target
            });
          }
        }
      });
    }

    // 2. Запись закрытого месяца
    closedMonths[monthKey] = {
      closedAt: Date.now(),
      year: data.year,
      month: data.month,
      actualIncome: data.actualIncome,
      actualExpense: data.actualExpense,
      actualBills: data.actualBills,
      actualSurplus: data.actualSurplus,
      planIncome: data.planIncome,
      planExpense: data.planExpense
    };

    // 3. Обновление генерального плана
    const planRef = getUserCol('BudgetPlan').doc('plan');
    batch.set(planRef, {
      ...plan,
      isConfigured: true,
      monthlyIncome: income,
      monthlyVariableLimit: totalLimits,
      categoryLimits: categoryLimits,
      closedMonths: closedMonths,
      updatedAt: Date.now()
    }, { merge: true });

    await batch.commit();

    // 4. Переключаем интерфейс на новый месяц
    const nextDate = new Date(data.year, data.month + 1, 1);
    selectedBudgetYear = nextDate.getFullYear();
    selectedBudgetMonth = nextDate.getMonth();

    closeMonthCloseAdjustModal();
    await fetchAllData();

    // 5. Анимация перетекания средств в цели
    playGoalFlowAnimation(actualSurplus, goalIncrements);
  } catch (err) {
    console.error('Ошибка закрытия месяца:', err);
    showToast('Ошибка закрытия: ' + err.message, true);
  }
}

function playGoalFlowAnimation(amount, goalIncrements = []) {
  const overlay = document.getElementById('goal-flow-animation-overlay');
  const card = document.getElementById('goal-flow-card');
  if (!overlay || !card) return;

  const isPositive = amount > 0;
  const isNegative = amount < 0;

  let goalsListHtml = '';
  if (goalIncrements.length > 0) {
    goalsListHtml = `
      <div class="w-full space-y-2 my-3 text-left">
        ${goalIncrements.map(g => {
          const oldPct = g.target > 0 ? Math.min(100, Math.round((g.oldSaved / g.target) * 100)) : 0;
          const newPct = g.target > 0 ? Math.min(100, Math.round((g.newSaved / g.target) * 100)) : 0;
          const isInc = g.changeAmount > 0;
          const diffStr = isInc ? `+${formatMoney(g.changeAmount)}` : `-${formatMoney(Math.abs(g.changeAmount))}`;

          return `
            <div class="p-3 rounded-2xl bg-[#12151C] border border-[rgba(255,255,255,0.06)] space-y-1.5">
              <div class="flex items-center justify-between text-xs">
                <span class="font-bold text-white truncate max-w-[170px]">${escapeHtml(g.name)}</span>
                <span class="font-mono font-bold ${isInc ? 'text-emerald-400' : 'text-[#FF453A]'}">${diffStr}</span>
              </div>
              <div class="w-full bg-[rgba(255,255,255,0.08)] h-2 rounded-full overflow-hidden relative">
                <div id="anim-goal-bar-${g.id}" class="h-full ${isInc ? 'bg-gradient-to-r from-emerald-500 to-teal-400' : 'bg-gradient-to-r from-rose-500 to-red-400'} rounded-full transition-all duration-1000 ease-out" style="width: ${oldPct}%"></div>
              </div>
              <div class="flex justify-between items-center text-[10px] text-[#848D99] font-mono">
                <span>Было: ${oldPct}%</span>
                <span class="font-bold ${isInc ? 'text-emerald-400' : 'text-[#FF453A]'}">Стало: ${newPct}%</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  if (isPositive) {
    card.className = "bg-[#181B24]/95 border border-emerald-500/40 rounded-3xl p-5 shadow-2xl backdrop-blur-xl flex flex-col items-center text-center max-w-sm w-full mx-4 transform scale-100 transition-all duration-300 pointer-events-auto border-emerald-500/30";
    card.innerHTML = `
      <div class="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500/20 to-teal-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mb-2 shadow-lg animate-bounce">
        <i data-lucide="award" class="w-7 h-7"></i>
      </div>
      <h3 class="text-base font-black text-white tracking-tight">Средства переведены в цели!</h3>
      <p class="text-2xl font-black font-mono text-emerald-400 my-1">+${formatMoney(amount)}</p>
      <p class="text-[11px] text-[#848D99] leading-tight">
        Отложенный профицит успешно пополнил накопления по вашим финансовым целям.
      </p>
      ${goalsListHtml}
      <button type="button" onclick="closeGoalFlowAnimationOverlay()" class="w-full mt-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all active:scale-95 cursor-pointer">
        Отлично!
      </button>
    `;
  } else if (isNegative) {
    card.className = "bg-[#181B24]/95 border border-red-500/40 rounded-3xl p-5 shadow-2xl backdrop-blur-xl flex flex-col items-center text-center max-w-sm w-full mx-4 transform scale-100 transition-all duration-300 pointer-events-auto border-red-500/30";
    card.innerHTML = `
      <div class="w-14 h-14 rounded-2xl bg-gradient-to-tr from-red-500/20 to-rose-500/20 border border-red-500/40 flex items-center justify-center text-[#FF453A] mb-2 shadow-lg">
        <i data-lucide="trending-down" class="w-7 h-7"></i>
      </div>
      <h3 class="text-base font-black text-white tracking-tight">Корректировка накоплений</h3>
      <p class="text-2xl font-black font-mono text-[#FF453A] my-1">-${formatMoney(Math.abs(amount))}</p>
      <p class="text-[11px] text-[#848D99] leading-tight">
        Из-за дефицита в прошедшем месяце сумма целей скорректирована.
      </p>
      ${goalsListHtml}
      <button type="button" onclick="closeGoalFlowAnimationOverlay()" class="w-full mt-2 py-2.5 rounded-xl bg-[#212430] hover:bg-[#2A2D3C] text-gray-200 font-bold text-xs border border-[rgba(255,255,255,0.08)] transition-all active:scale-95 cursor-pointer">
        Понятно
      </button>
    `;
  } else {
    card.className = "bg-[#181B24]/95 border border-[rgba(255,255,255,0.1)] rounded-3xl p-5 shadow-2xl backdrop-blur-xl flex flex-col items-center text-center max-w-sm w-full mx-4 transform scale-100 transition-all duration-300 pointer-events-auto";
    card.innerHTML = `
      <div class="w-14 h-14 rounded-2xl bg-[#212430] border border-[rgba(255,255,255,0.08)] flex items-center justify-center text-gray-300 mb-2 shadow-lg">
        <i data-lucide="check-circle-2" class="w-7 h-7 text-blue-400"></i>
      </div>
      <h3 class="text-base font-black text-white tracking-tight">Месяц успешно закрыт!</h3>
      <p class="text-[11px] text-[#848D99] my-2">Все расходы в точности сошлись с доходами.</p>
      <button type="button" onclick="closeGoalFlowAnimationOverlay()" class="w-full mt-2 py-2.5 rounded-xl bg-[#212430] hover:bg-[#2A2D3C] text-gray-200 font-bold text-xs border border-[rgba(255,255,255,0.08)] transition-all active:scale-95 cursor-pointer">
        Продолжить
      </button>
    `;
  }

  overlay.classList.remove('hidden');
  if (typeof lucide !== 'undefined') lucide.createIcons();

  // Плавная анимация шкалы
  setTimeout(() => {
    goalIncrements.forEach(g => {
      const bar = document.getElementById(`anim-goal-bar-${g.id}`);
      if (bar) {
        const newPct = g.target > 0 ? Math.min(100, Math.round((g.newSaved / g.target) * 100)) : 0;
        bar.style.width = `${newPct}%`;
      }
    });
  }, 120);

  if (window.goalFlowAnimTimeout) clearTimeout(window.goalFlowAnimTimeout);
  window.goalFlowAnimTimeout = setTimeout(() => {
    closeGoalFlowAnimationOverlay();
  }, 6000);
}

function closeGoalFlowAnimationOverlay() {
  const overlay = document.getElementById('goal-flow-animation-overlay');
  if (overlay) {
    overlay.classList.add('animate-fade-out');
    setTimeout(() => {
      overlay.classList.add('hidden');
      overlay.classList.remove('animate-fade-out');
    }, 300);
  }
}
window.closeGoalFlowAnimationOverlay = closeGoalFlowAnimationOverlay;

// Мастер (Онбординг)
window.initBudgetWizard = initBudgetWizard;
window.goToWizardStep = goToWizardStep;
window.openWizardIconPicker = openWizardIconPicker;
window.selectWizardGoalIcon = selectWizardGoalIcon;
window.renderWizardIconGrid = renderWizardIconGrid;
window.resetWizGoalIconDisplay = resetWizGoalIconDisplay;
window.renderWizardIncomeSources = renderWizardIncomeSources;
window.updateWizGoalSlider = updateWizGoalSlider;
window.recalculateWizardIncome = recalculateWizardIncome;
window.adoptCalculatedIncome = adoptCalculatedIncome;
window.calculateHistoricalIncomeForWizard = calculateHistoricalIncomeForWizard;
window.addAnotherBillFromTooltip = addAnotherBillFromTooltip;
window.renderWizCalendar = renderWizCalendar;
window.showWizDayTooltip = showWizDayTooltip;
window.closeWizDayTooltip = closeWizDayTooltip;
window.renderWizLimitsEditor = renderWizLimitsEditor;
window.openAddCategoryLimitPicker = openAddCategoryLimitPicker;
window.closeAddCategoryLimitPicker = closeAddCategoryLimitPicker;
window.addCategoryToWizard = addCategoryToWizard;
window.removeWizardCustomCat = removeWizardCustomCat;
window.updateWizLiveTotal = updateWizLiveTotal;
window.calculateAndRenderWizSummary = calculateAndRenderWizSummary;
window.finishBudgetOnboarding = finishBudgetOnboarding;
// Управление лимитами категорий
window.openCategoryLimitModal = openCategoryLimitModal;
window.closeCategoryLimitModal = closeCategoryLimitModal;
window.submitCategoryLimit = submitCategoryLimit;
window.onCategoryLimitInputChanged = onCategoryLimitInputChanged;
window.toggleCategoryTxExclusion = toggleCategoryTxExclusion;
window.openCategoryLimitsManagerModal = openCategoryLimitsManagerModal;
window.closeCategoryLimitsManagerModal = closeCategoryLimitsManagerModal;
window.renderCategoryLimitsManager = renderCategoryLimitsManager;
window.saveCategoryLimitsManager = saveCategoryLimitsManager;
window.applyMgrCategoryAvg = applyMgrCategoryAvg;
window.removeManagerCustomCat = removeManagerCustomCat;
window.updateMgrLiveTotal = updateMgrLiveTotal;
window.toggleGoalPaceTooltip = toggleGoalPaceTooltip;

window.applyWizCategoryAvg = applyWizCategoryAvg;
window.handleWizardDayClick = handleWizardDayClick;
window.selectWizCalendarDay = handleWizardDayClick;
window.openWizAvgDetailsModal = openWizAvgDetailsModal;
window.closeWizAvgDetailsModal = closeWizAvgDetailsModal;
window.wizAvgToggleTx = wizAvgToggleTx;
window.wizAvgToggleSelectAll = wizAvgToggleSelectAll;
window.wizAvgSelectAll = wizAvgSelectAll;
window.recalculateWizAvgModal = recalculateWizAvgModal;
window.applyWizAvgDetailsResult = applyWizAvgDetailsResult;
window.setBillType = setBillType;
window.changeBillSpreadMonths = changeBillSpreadMonths;
window.updateBillSpreadPreview = updateBillSpreadPreview;
window.getOneTimeBillMonthInfo = getOneTimeBillMonthInfo;
window.resetBudgetPlanToWizard = resetBudgetPlanToWizard;
window.openBudgetCalendarModal = openBudgetCalendarModal;
window.closeBudgetCalendarModal = closeBudgetCalendarModal;
window.closeBudgetModalDayTooltip = closeBudgetModalDayTooltip;
window.addAnotherBillFromBudgetModalTooltip = addAnotherBillFromBudgetModalTooltip;
window.openBudgetGoalIconPicker = openBudgetGoalIconPicker;
window.closeBudgetGoalIconPicker = closeBudgetGoalIconPicker;
window.renderGoalModalIconGrid = renderGoalModalIconGrid;
window.selectGoalIcon = selectGoalIcon;
window.formatCompactBillAmount = formatCompactBillAmount;
window.handleGoalNameInput = handleGoalNameInput;

function getCategoryIcon(catName) {
  if (!catName || typeof catName !== 'string') return 'package';
  const expenseCats = Cache?.categories?.expense || [];
  const foundExp = expenseCats.find(c => (typeof c === 'string' ? c : c?.name) === catName);
  if (foundExp && typeof foundExp === 'object' && foundExp.icon) return foundExp.icon;

  const incomeCats = Cache?.categories?.income || [];
  const foundInc = incomeCats.find(c => (typeof c === 'string' ? c : c?.name) === catName);
  if (foundInc && typeof foundInc === 'object' && foundInc.icon) return foundInc.icon;

  const map = {
    'Продукты': 'shopping-cart',
    'Кафе и рестораны': 'utensils',
    'Маркетплейсы': 'shopping-bag',
    'Транспорт': 'car',
    'Жилье': 'home',
    'Одежда': 'shirt',
    'Здоровье': 'heart-pulse',
    'Развлечения': 'gamepad-2',
    'Другое': 'package',
    'Прочие расходы': 'package',
    'Зарплата': 'wallet',
    'Возврат': 'undo-2',
    'Кэшбек': 'coins'
  };
  return map[catName] || 'tag';
}

// Навигация и закрытие месяца
window.getCategoryIcon = getCategoryIcon;
window.getSelectedBudgetDate = getSelectedBudgetDate;
window.getBudgetStartMonthDate = getBudgetStartMonthDate;
window.getBudgetMaxMonthDate = getBudgetMaxMonthDate;
window.navigateBudgetMonth = navigateBudgetMonth;
window.isBudgetMonthClosed = isBudgetMonthClosed;
window.openCloseMonthFlow = openCloseMonthFlow;
window.openMonthCloseFlow = openMonthCloseFlow;
window.closeMonthCloseSummaryModal = closeMonthCloseSummaryModal;
window.proceedToMonthAdjustStep = proceedToMonthAdjustStep;
window.closeMonthCloseAdjustModal = closeMonthCloseAdjustModal;
window.backToMonthSummaryStep = backToMonthSummaryStep;
window.updateMonthCloseForecast = updateMonthCloseForecast;
window.applyAdjustAverageIncome = applyAdjustAverageIncome;
window.applyAdjustAverageCategoryLimit = applyAdjustAverageCategoryLimit;
window.applyAllAdjustAverageCategoryLimits = applyAllAdjustAverageCategoryLimits;
window.finalizeMonthClose = finalizeMonthClose;
window.playGoalFlowAnimation = playGoalFlowAnimation;
window.renderAdjustCategoriesList = renderAdjustCategoriesList;
window.openAddAdjustCategoryPicker = openAddAdjustCategoryPicker;
window.closeAddAdjustCategoryPicker = closeAddAdjustCategoryPicker;
window.selectAdjustCategoryToAdd = selectAdjustCategoryToAdd;
window.removeAdjustCategory = removeAdjustCategory;
window.deleteCurrentWizCategory = deleteCurrentWizCategory;
window.toggleWizAvgIncomeCategory = toggleWizAvgIncomeCategory;
window.toggleWizAvgOtherCategory = toggleWizAvgOtherCategory;
window.wizAvgToggleCatFilterDropdown = wizAvgToggleCatFilterDropdown;
window.wizAvgToggleAllFilterCategories = wizAvgToggleAllFilterCategories;
window.openBillPaymentMatchModal = openBillPaymentMatchModal;
window.closeBillPaymentMatchModal = closeBillPaymentMatchModal;
window.selectBillMatchTx = selectBillMatchTx;
window.createAndLinkBillTransaction = createAndLinkBillTransaction;
window.applySelectedBillMatch = applySelectedBillMatch;
window.unlinkCurrentBillPayment = unlinkCurrentBillPayment;
window.openBudgetPlanWizardReview = openBudgetPlanWizardReview;
