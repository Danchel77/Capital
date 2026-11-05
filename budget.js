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
  let minDate = null;
  const txs = Cache?.transactions || [];
  for (const t of txs) {
    if (t.date) {
      const p = typeof parseAnyDate === 'function' ? parseAnyDate(t.date) : new Date(t.date);
      if (p && !isNaN(p.getTime())) {
        const m = new Date(p.getFullYear(), p.getMonth(), 1);
        if (!minDate || m.getTime() < minDate.getTime()) {
          minDate = m;
        }
      }
    }
  }

  // Если есть план с датой начала, учитываем его
  const plan = Cache?.budgetPlan || {};
  if (plan.startMonth) {
    const parts = String(plan.startMonth).split('-');
    if (parts.length === 2) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      if (!isNaN(y) && !isNaN(m)) {
        const pDate = new Date(y, m, 1);
        if (!minDate || pDate.getTime() < minDate.getTime()) minDate = pDate;
      }
    }
  }

  const today = new Date();
  const defaultPast = new Date(today.getFullYear() - 3, 0, 1); // По умолчанию до 3 лет назад
  if (minDate && minDate.getTime() < defaultPast.getTime()) {
    return minDate;
  }
  return minDate || defaultPast;
}
window.getSelectedBudgetDate = getSelectedBudgetDate;
window.getBudgetStartMonthDate = getBudgetStartMonthDate;

function getBudgetMaxMonthDate() {
  const today = new Date();
  let maxDate = new Date(today.getFullYear(), today.getMonth(), 1);

  // Если есть операции будущих месяцев, позволяем листать до них
  const txs = Cache?.transactions || [];
  for (const t of txs) {
    if (t.date) {
      const p = typeof parseAnyDate === 'function' ? parseAnyDate(t.date) : new Date(t.date);
      if (p && !isNaN(p.getTime())) {
        const m = new Date(p.getFullYear(), p.getMonth(), 1);
        if (m.getTime() > maxDate.getTime()) {
          maxDate = m;
        }
      }
    }
  }
  return maxDate;
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
    showToast('Достигнут самый ранний доступный месяц');
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
  const targetDate = getSelectedBudgetDate();
  const targetYear = targetDate.getFullYear();
  const targetMonth = targetDate.getMonth();

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

  // Бейдж статуса месяца (скрыт)
  const statusBadge = document.getElementById('budget-month-status-badge');
  if (statusBadge) {
    statusBadge.classList.add('hidden');
    statusBadge.style.display = 'none';
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
    deltaPillEl.classList.add('hidden');
    deltaPillEl.style.display = 'none';
  }

  if (incomeValEl) incomeValEl.innerText = `+${formatMoney(monthlyIncome)}`;
  if (expenseValEl) expenseValEl.innerText = `-${formatMoney(monthlySpent)}`;
  if (billsValEl) billsValEl.innerText = formatMoney(monthlyBillsSum);

  // Управление пустым состоянием и переключением режима сводки месяца
  const emptyStateEl = document.getElementById('budget-month-empty-state');
  const numbersViewEl = document.getElementById('month-summary-numbers-view');
  const chartViewEl = document.getElementById('month-summary-chart-view');
  const toggleBtnEl = document.getElementById('month-summary-toggle-btn');
  const hasTx = monthlyIncome > 0 || monthlySpent > 0;

  if (!hasTx) {
    if (emptyStateEl) emptyStateEl.classList.remove('hidden');
    if (numbersViewEl) numbersViewEl.classList.add('hidden');
    if (chartViewEl) chartViewEl.classList.add('hidden');
    if (toggleBtnEl) toggleBtnEl.classList.add('opacity-25', 'pointer-events-none');
  } else {
    if (emptyStateEl) emptyStateEl.classList.add('hidden');
    if (toggleBtnEl) toggleBtnEl.classList.remove('opacity-25', 'pointer-events-none');
    const currentMode = localStorage.getItem('budget_summary_mode') || 'numbers';
    applyMonthSummaryViewMode(currentMode);
  }

  // 2. Блок «Предстоящие платежи»
  if (typeof renderBudgetCalendar === 'function') {
    renderBudgetCalendar(bills, targetDate);
  }

  // 3. Блок «Цели накопления»
  if (typeof renderBudgetGoals === 'function') {
    renderBudgetGoals(goals);
  }

  // 4. Обновление годового графика сальдо внизу экрана Аналитики
  if (typeof window.buildCharts === 'function') {
    requestAnimationFrame(() => window.buildCharts());
  }

  if (typeof lucide !== 'undefined') lucide.createIcons();
  if (typeof window.syncWidgetData === 'function') {
    window.syncWidgetData();
  }
}

function applyMonthSummaryViewMode(mode) {
  const numbersView = document.getElementById('month-summary-numbers-view');
  const chartView = document.getElementById('month-summary-chart-view');
  const toggleIcon = document.getElementById('month-summary-toggle-icon');
  const isChart = mode === 'chart';

  if (numbersView) numbersView.classList.toggle('hidden', isChart);
  if (chartView) chartView.classList.toggle('hidden', !isChart);

  if (toggleIcon) {
    toggleIcon.setAttribute('data-lucide', isChart ? 'layout-list' : 'pie-chart');
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons();
    }
  }

  if (isChart && typeof window.updateAnalyticsForMonth === 'function') {
    requestAnimationFrame(() => {
      const targetDate = getSelectedBudgetDate();
      const mId = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`;
      window.updateAnalyticsForMonth(mId);
    });
  }
}
window.applyMonthSummaryViewMode = applyMonthSummaryViewMode;

function toggleMonthSummaryView() {
  const currentMode = localStorage.getItem('budget_summary_mode') || 'numbers';
  const newMode = currentMode === 'numbers' ? 'chart' : 'numbers';
  localStorage.setItem('budget_summary_mode', newMode);
  applyMonthSummaryViewMode(newMode);
}
window.toggleMonthSummaryView = toggleMonthSummaryView;

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
