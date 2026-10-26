// ==========================================
// Variables & State
// ==========================================

// Состояние навигации по месяцам бюджета
let selectedBudgetYear = null;
let selectedBudgetMonth = null;

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
window.getSelectedBudgetDate = getSelectedBudgetDate;
window.getBudgetStartMonthDate = getBudgetStartMonthDate;

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

  const dashboardEl = document.getElementById('budget-dashboard');
  if (dashboardEl) dashboardEl.classList.remove('hidden');

  const bills = Cache.calendarBills || [];
  const goals = Cache.goals || [];
  const today = new Date();
  const targetDate = getSelectedBudgetDate();
  const targetYear = targetDate.getFullYear();
  const targetMonth = targetDate.getMonth();
  const isCurrentCalendarMonth =
    targetYear === today.getFullYear() && targetMonth === today.getMonth();

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
  const monthNames = [
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
  const monthLabel = document.getElementById('budget-month-label');
  if (monthLabel) {
    monthLabel.innerText = `${monthNames[targetMonth]} ${targetYear}`;
  }

  // Бейдж статуса месяца (Текущий / Архив)
  const statusBadge = document.getElementById('budget-month-status-badge');
  if (statusBadge) {
    if (isCurrentCalendarMonth) {
      statusBadge.className =
        'text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 inline-block';
      statusBadge.innerText = 'Текущий';
      statusBadge.classList.remove('hidden');
    } else {
      statusBadge.classList.add('hidden');
    }
  }

  const startOfMonth = new Date(targetYear, targetMonth, 1, 0, 0, 0, 0);
  const endOfMonth = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);
  const startOfMonthTime = startOfMonth.getTime();
  const endOfMonthTime = endOfMonth.getTime();
  const targetMonthKey = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`;

  let monthlySpent = 0;
  let monthlyIncome = 0;

  const targetMonthObj = (Cache.transactions || []).find(m => m.id === targetMonthKey);
  if (targetMonthObj && Array.isArray(targetMonthObj.items)) {
    targetMonthObj.items.forEach(tx => {
      const isExpense =
        tx.type === 'Расход' ||
        tx.type === 'expense' ||
        String(tx.type || '')
          .trim()
          .toLowerCase() === 'расход';
      const isIncome =
        tx.type === 'Доход' ||
        tx.type === 'income' ||
        String(tx.type || '')
          .trim()
          .toLowerCase() === 'доход';
      const isExcluded = !!(tx.excludeFromBudget || tx.isExcludedFromBudget);
      if (isExcluded) return;

      const val =
        typeof tx.amount === 'number'
          ? tx.amount
          : parseFloat(
              String(tx.amount || 0)
                .replace(/\s/g, '')
                .replace(/,/g, '.')
            ) || 0;
      if (val <= 0) return;

      const txTime =
        tx.dayTimestamp ||
        tx.timestamp ||
        (tx.rawDate
          ? typeof window.parseAnyDate === 'function'
            ? window.parseAnyDate(tx.rawDate)?.getTime()
            : new Date(tx.rawDate).getTime()
          : 0);

      if (txTime >= startOfMonthTime && txTime <= endOfMonthTime) {
        if (isExpense) monthlySpent += val;
        if (isIncome) monthlyIncome += val;
      }
    });
  }

  // Расчет ежемесячных счетов за выбранный месяц
  const activeBills = bills.filter(b => {
    return typeof getOneTimeBillMonthInfo === 'function'
      ? getOneTimeBillMonthInfo(b, targetDate).isActive
      : true;
  });
  const monthlyBillsSum = activeBills.reduce((acc, b) => {
    return (
      acc +
      (typeof getEffectiveBillAmount === 'function'
        ? getEffectiveBillAmount(b, targetDate)
        : parseFloat(b.amount) || 0)
    );
  }, 0);

  const delta = monthlyIncome - monthlySpent;

  // Обновление карточки финансового результата
  const deltaValEl = document.getElementById('budget-month-delta-val');
  const deltaLabelEl = document.getElementById('budget-month-delta-label');
  const deltaPillEl = document.getElementById('budget-month-status-pill');
  const incomeValEl = document.getElementById('budget-month-income-val');
  const expenseValEl = document.getElementById('budget-month-expense-val');
  const billsValEl = document.getElementById('budget-month-bills-val');

  if (deltaValEl) {
    if (delta >= 0) {
      deltaValEl.innerText = `+${formatMoney(delta)}`;
      deltaValEl.className =
        'text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight';
    } else {
      deltaValEl.innerText = `-${formatMoney(Math.abs(delta))}`;
      deltaValEl.className =
        'text-3xl sm:text-4xl font-extrabold text-[#FF453A] tracking-tight leading-tight';
    }
  }

  if (deltaLabelEl) {
    deltaLabelEl.innerText = delta >= 0 ? 'Свободный остаток месяца' : 'Дефицит месяца';
  }

  if (deltaPillEl) {
    if (delta >= 0) {
      deltaPillEl.className =
        'text-[10px] font-semibold px-2.5 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-400 border-emerald-500/25';
      deltaPillEl.innerText = 'Профицит';
    } else {
      deltaPillEl.className =
        'text-[10px] font-semibold px-2.5 py-0.5 rounded-full border bg-rose-500/10 text-rose-400 border-rose-500/25';
      deltaPillEl.innerText = 'Дефицит';
    }
  }

  if (incomeValEl) incomeValEl.innerText = `+${formatMoney(monthlyIncome)}`;
  if (expenseValEl) expenseValEl.innerText = `-${formatMoney(monthlySpent)}`;
  if (billsValEl) billsValEl.innerText = formatMoney(monthlyBillsSum);

  // 2. Блок «Предстоящие платежи»
  if (typeof renderBudgetCalendar === 'function') {
    renderBudgetCalendar(bills, targetDate);
  }

  // 3. Блок «Цели накопления»
  if (typeof renderBudgetGoals === 'function') {
    renderBudgetGoals(goals);
  }

  if (typeof lucide !== 'undefined') lucide.createIcons();
  if (typeof window.syncWidgetData === 'function') {
    window.syncWidgetData();
  }
}

// Заглушка для совместимости
function renderBudgetCategoryLimits() {}
window.renderBudgetCategoryLimits = renderBudgetCategoryLimits;

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
  const today = typeof getSelectedBudgetDate === 'function' ? getSelectedBudgetDate() : new Date();

  // Сумма только ежемесячных трат (регулярных счетов) с учетом фактической корректировки
  const monthlyBillsSum = bills
    .filter(b => !getOneTimeBillMonthInfo(b, today).isOneTime)
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
      updatedAt: Date.now(),
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

// Global Scope Exports
window.renderBudgetTab = renderBudgetTab;
window.openBudgetPlanModal = openBudgetPlanModal;
window.closeBudgetPlanModal = closeBudgetPlanModal;
window.updatePlanForecast = updatePlanForecast;
window.submitBudgetPlan = submitBudgetPlan;

function getCategoryIcon(catName) {
  if (!catName || typeof catName !== 'string') return 'package';
  const expenseCats = Cache?.categories?.expense || [];
  const foundExp = expenseCats.find(c => (typeof c === 'string' ? c : c?.name) === catName);
  if (foundExp && typeof foundExp === 'object' && foundExp.icon) return foundExp.icon;

  const incomeCats = Cache?.categories?.income || [];
  const foundInc = incomeCats.find(c => (typeof c === 'string' ? c : c?.name) === catName);
  if (foundInc && typeof foundInc === 'object' && foundInc.icon) return foundInc.icon;

  const map = {
    Продукты: 'shopping-cart',
    'Кафе и рестораны': 'utensils',
    Маркетплейсы: 'shopping-bag',
    Транспорт: 'car',
    Жилье: 'home',
    Одежда: 'shirt',
    Здоровье: 'heart-pulse',
    Развлечения: 'gamepad-2',
    Другое: 'package',
    'Прочие расходы': 'package',
    Зарплата: 'wallet',
    Возврат: 'undo-2',
    Кэшбек: 'coins',
  };
  return map[catName] || 'tag';
}

// Навигация по месяцам бюджета
window.getCategoryIcon = getCategoryIcon;
window.getSelectedBudgetDate = getSelectedBudgetDate;
window.getBudgetStartMonthDate = getBudgetStartMonthDate;
window.getBudgetMaxMonthDate = getBudgetMaxMonthDate;
window.navigateBudgetMonth = navigateBudgetMonth;
window.isBudgetMonthClosed = isBudgetMonthClosed;
