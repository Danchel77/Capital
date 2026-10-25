/**
 * month-close.js
 * Month-end closing flow, financial summaries, 3-month averages calculation,
 * limit adjustment for next month, and surplus distribution into goals.
 */

// Module state
let activeMonthCloseData = null;
window.activeMonthCloseData = activeMonthCloseData;

let adjustActiveCategories = [];
window.adjustActiveCategories = adjustActiveCategories;

function calculate3MonthAverages(refYear, refMonth) {
  const result = {
    avgIncome: 0,
    avgCategorySpending: {},
    activeMonthsCount: 0,
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
      cats: {},
    });
  }

  allMonths.forEach(m => {
    (m.items || []).forEach(tx => {
      const t =
        tx.timestamp ||
        (tx.rawDate
          ? new Date(tx.rawDate).getTime()
          : tx.date
            ? new Date(tx.date).getTime()
            : null);
      if (!t || isNaN(t)) return;

      const val =
        typeof tx.amount === 'number'
          ? tx.amount
          : parseFloat(
              String(tx.amount || 0)
                .replace(/\s/g, '')
                .replace(/,/g, '.')
            ) || 0;
      if (val <= 0) return;

      const isIncome =
        tx.type === 'Доход' ||
        tx.type === 'income' ||
        String(tx.type || '')
          .trim()
          .toLowerCase() === 'доход';
      const isExpense =
        tx.type === 'Расход' ||
        tx.type === 'expense' ||
        String(tx.type || '')
          .trim()
          .toLowerCase() === 'расход';
      const uid =
        tx.id ||
        tx._id ||
        `${tx.timestamp || tx.rawDate || ''}_${tx.amount}_${tx.merchant || tx.title || ''}`;
      const isExcluded =
        !!(window.wizardExcludedTxIds && window.wizardExcludedTxIds.has(uid)) ||
        (typeof isBillOrOneTimeTx === 'function' ? isBillOrOneTimeTx(tx) : false);

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
window.calculate3MonthAverages = calculate3MonthAverages;

function calculateMonthCloseData(year, month) {
  const monthDate = new Date(year, month, 1);
  const startOfMonth = new Date(year, month, 1, 0, 0, 0, 0);
  const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999);
  const plan = Cache?.budgetPlan || {};
  const bills = Cache?.calendarBills || [];
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

  let actualIncome = 0;
  let actualExpense = 0;
  const categorySpentMap = {};

  (Cache?.transactions || []).forEach(m => {
    (m.items || []).forEach(tx => {
      const t =
        tx.timestamp ||
        (tx.rawDate
          ? new Date(tx.rawDate).getTime()
          : tx.date
            ? new Date(tx.date).getTime()
            : null);
      if (!t || isNaN(t)) return;
      if (t < startOfMonth.getTime() || t > endOfMonth.getTime()) return;

      const val =
        typeof tx.amount === 'number'
          ? tx.amount
          : parseFloat(
              String(tx.amount || 0)
                .replace(/\s/g, '')
                .replace(/,/g, '.')
            ) || 0;
      if (val <= 0) return;

      const isIncome =
        tx.type === 'Доход' ||
        tx.type === 'income' ||
        String(tx.type || '')
          .trim()
          .toLowerCase() === 'доход';
      const isExpense =
        tx.type === 'Расход' ||
        tx.type === 'expense' ||
        String(tx.type || '')
          .trim()
          .toLowerCase() === 'расход';
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

  const activeBills = bills.filter(b => {
    return typeof getOneTimeBillMonthInfo === 'function'
      ? getOneTimeBillMonthInfo(b, monthDate).isActive
      : true;
  });
  const actualBills = activeBills.reduce((s, b) => {
    return (
      s +
      (typeof getEffectiveBillAmount === 'function'
        ? getEffectiveBillAmount(b, monthDate)
        : parseFloat(b.amount) || 0)
    );
  }, 0);

  const planIncome = plan.monthlyIncome || 0;
  const planExpense = plan.monthlyVariableLimit || 0;
  const planCategoryLimits = plan.categoryLimits || {};

  const actualSurplus = actualIncome - actualExpense - actualBills;
  const planSurplus = Math.max(0, planIncome - planExpense - actualBills);
  const extraSaved = actualSurplus - planSurplus;

  const assignedCats = Object.keys(planCategoryLimits).filter(
    k => k !== 'Прочие расходы' && (parseFloat(planCategoryLimits[k]) || 0) > 0
  );

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
      pct: otherLimit > 0 ? Math.round((otherSpent / otherLimit) * 100) : 0,
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
    expenseDiff: planExpense - actualExpense,
    actualBills,
    billsCount: activeBills.length,
    actualSurplus,
    planSurplus,
    extraSaved,
    categoryStats,
    averages,
    isClosed: typeof isBudgetMonthClosed === 'function' ? isBudgetMonthClosed(year, month) : false,
  };
}
window.calculateMonthCloseData = calculateMonthCloseData;

function openCloseMonthFlow() {
  const d = typeof getSelectedBudgetDate === 'function' ? getSelectedBudgetDate() : new Date();
  openMonthCloseFlow(d.getFullYear(), d.getMonth());
}
window.openCloseMonthFlow = openCloseMonthFlow;

function openMonthCloseFlow(year, month) {
  activeMonthCloseData = calculateMonthCloseData(year, month);
  window.activeMonthCloseData = activeMonthCloseData;
  const data = activeMonthCloseData;
  const dlg = document.getElementById('month-close-summary-dialog');
  if (!dlg) return;

  const titleEl = document.getElementById('close-summary-title');
  const subtitleEl = document.getElementById('close-summary-subtitle');
  if (titleEl) titleEl.innerText = `Итоги за ${data.monthName} ${data.year}`;
  if (subtitleEl)
    subtitleEl.innerText = data.isClosed
      ? 'Месяц успешно закрыт'
      : 'Сводка выполнения финансового плана';

  const heroCard = document.getElementById('close-summary-hero-card');
  if (heroCard) {
    if (data.actualSurplus > 0) {
      heroCard.className =
        'p-4 rounded-2xl border bg-gradient-to-br from-amber-500/15 via-[#181B24] to-emerald-500/15 border-amber-500/40 text-left shadow-lg relative overflow-hidden';
      heroCard.innerHTML = `
        <div class="flex items-start justify-between gap-3">
          <div>
            <span class="text-[10px] text-amber-400 font-bold uppercase tracking-wider block mb-1 flex items-center gap-1">
              <i data-lucide="sparkles" class="w-3 h-3"></i>
              <span>${data.isClosed ? 'Накоплено за месяц' : 'Итоговый профицит к переводу в цели'}</span>
            </span>
            <p class="text-2xl sm:text-3xl font-black font-mono text-emerald-400">+${formatMoney(data.actualSurplus)}</p>
            <p class="text-xs text-gray-200 mt-1.5 leading-relaxed">
              ${
                data.extraSaved > 0
                  ? `Отличная работа! Вы сэкономили <b class="text-emerald-400">+${formatMoney(data.extraSaved)}</b> сверх запланированного плана.`
                  : 'План накоплений выполнен! Средства готовы к распределению по вашим целям.'
              }
            </p>
          </div>
          <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-emerald-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 flex-shrink-0 shadow-md">
            <i data-lucide="award" class="w-7 h-7"></i>
          </div>
        </div>
      `;
    } else if (data.actualSurplus < 0) {
      heroCard.className =
        'p-4 rounded-2xl border bg-gradient-to-br from-red-950/40 via-[#181B24] to-rose-900/20 border-red-500/30 text-left';
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
      heroCard.className =
        'p-4 rounded-2xl border bg-[#12151C] border-[rgba(255,255,255,0.08)] text-left';
      heroCard.innerHTML = `
        <span class="text-[10px] text-[#848D99] font-bold uppercase tracking-wider block mb-1">Баланс месяца</span>
        <p class="text-2xl sm:text-3xl font-black font-mono text-white">0 ₽</p>
        <p class="text-xs text-gray-300 mt-1">Доходы в точности покрыли расходы и обязательные счета.</p>
      `;
    }
  }

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
    incIcon.className =
      data.incomeDiff < 0 ? 'w-3.5 h-3.5 text-[#FF453A]' : 'w-3.5 h-3.5 text-emerald-400';
  }

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

  const catListEl = document.getElementById('close-sum-categories-list');
  if (catListEl) {
    if (data.categoryStats.length === 0) {
      catListEl.innerHTML =
        '<div class="text-xs text-[#848D99] text-center py-2">Нет трат по категориям</div>';
    } else {
      catListEl.innerHTML = data.categoryStats
        .map(c => {
          const icon = typeof getCategoryIcon === 'function' ? getCategoryIcon(c.category) : 'tag';
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
              ${
                hasLimit
                  ? isOver
                    ? `<span class="text-[10px] font-mono font-bold text-[#FF453A] px-2 py-0.5 rounded-md bg-red-500/10 border border-red-500/20">+${formatMoney(c.spent - c.limit)}</span>`
                    : `<span class="text-[10px] font-mono font-bold text-emerald-400 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20">-${formatMoney(c.diff)}</span>`
                  : `<span class="text-[10px] font-mono text-gray-400">${formatMoney(c.spent)}</span>`
              }
            </div>
          </div>
        `;
        })
        .join('');
    }
  }

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
window.openMonthCloseFlow = openMonthCloseFlow;

function closeMonthCloseSummaryModal() {
  const dlg = document.getElementById('month-close-summary-dialog');
  if (dlg) {
    dlg.classList.add('hidden');
    if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
  }
}
window.closeMonthCloseSummaryModal = closeMonthCloseSummaryModal;

function proceedToMonthAdjustStep() {
  closeMonthCloseSummaryModal();

  const dlg = document.getElementById('month-close-adjust-dialog');
  if (!dlg || !activeMonthCloseData) return;
  if (activeMonthCloseData.isClosed) return;

  const data = activeMonthCloseData;
  const nextMonthDate = new Date(data.year, data.month + 1, 1);
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
  const nextMonthName = monthNames[nextMonthDate.getMonth()];

  const titleEl = document.getElementById('close-adjust-title');
  const subBtnText = document.getElementById('close-adjust-submit-btn-text');
  if (titleEl) titleEl.innerText = `План на ${nextMonthName} ${nextMonthDate.getFullYear()}`;
  if (subBtnText) subBtnText.innerText = `Принять и продолжить`;

  const incInput = document.getElementById('close-adjust-income-input');
  const avgIncText = document.getElementById('close-adjust-avg-income-text');
  const avgIncome = data.averages.avgIncome || data.planIncome || 0;

  if (incInput) {
    incInput.value = formatMoney(data.planIncome || avgIncome);
  }
  if (avgIncText) {
    avgIncText.innerText = `Ср: ~${formatMoney(avgIncome)}`;
  }

  const plan = Cache?.budgetPlan || {};
  const currentLimits = plan.categoryLimits || {};
  const assigned = Object.keys(currentLimits).filter(k => (parseFloat(currentLimits[k]) || 0) > 0);

  if (assigned.length > 0) {
    adjustActiveCategories = [...assigned];
  } else {
    adjustActiveCategories = ['Продукты', 'Кафе и рестораны', 'Транспорт', 'Развлечения'];
  }
  window.adjustActiveCategories = adjustActiveCategories;

  renderAdjustCategoriesList();
  updateMonthCloseForecast();

  if (typeof lockBodyScroll === 'function') lockBodyScroll();
  dlg.classList.remove('hidden');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}
window.proceedToMonthAdjustStep = proceedToMonthAdjustStep;

function renderAdjustCategoriesList() {
  const catContainer = document.getElementById('close-adjust-categories-container');
  if (!catContainer || !activeMonthCloseData) return;

  const data = activeMonthCloseData;
  const plan = Cache?.budgetPlan || {};
  const currentLimits = plan.categoryLimits || {};
  const allExpenseCats = Cache?.categories?.expense || [];

  if (adjustActiveCategories.length === 0) {
    catContainer.innerHTML =
      '<div class="text-xs text-[#848D99] text-center py-3 bg-[#12151C] rounded-2xl border border-[rgba(255,255,255,0.04)]">Нет выбранных категорий. Добавьте категории кнопкой ниже.</div>';
    return;
  }

  catContainer.innerHTML = adjustActiveCategories
    .map(cat => {
      const catObj = allExpenseCats.find(c => (typeof c === 'string' ? c : c?.name) === cat);
      const icon =
        catObj?.icon || (typeof getCategoryIcon === 'function' ? getCategoryIcon(cat) : 'tag');
      const existingVal = document.querySelector(`input[data-close-cat="${cat}"]`);
      const curLimit = existingVal ? getUnformattedVal(existingVal) || 0 : currentLimits[cat] || 0;

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
          ${
            avgSpend > 0
              ? `
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
          `
              : `
            <div class="flex items-center gap-1 mt-0.5">
              <span class="text-[10px] text-[#848D99] w-[100px] block truncate">Ср: нет данных</span>
              <button type="button" 
                      onclick="openWizAvgDetailsModal('expense', '${escapeHtml(cat)}')" 
                      class="w-6 h-6 rounded-lg bg-[#1E2330] hover:bg-[#2A2D3C] text-gray-400 hover:text-white border border-[rgba(255,255,255,0.06)] flex items-center justify-center flex-shrink-0 cursor-pointer transition-colors" 
                      title="Просмотр и выбор транзакций">
                <i data-lucide="sliders-horizontal" class="w-3 h-3"></i>
              </button>
            </div>
          `
          }
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
    })
    .join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();
}
window.renderAdjustCategoriesList = renderAdjustCategoriesList;

function openAddAdjustCategoryPicker() {
  const dlg = document.getElementById('month-adjust-category-picker-dialog');
  const listEl = document.getElementById('month-adjust-category-picker-list');
  if (!dlg || !listEl) return;

  const expenseCats = (Cache?.categories?.expense || [])
    .map(c => (typeof c === 'string' ? c : c?.name || ''))
    .filter(Boolean);
  const standardCats = [
    'Продукты',
    'Кафе и рестораны',
    'Маркетплейсы',
    'Транспорт',
    'Жилье',
    'Одежда',
    'Здоровье',
    'Развлечения',
    'Другое',
  ];
  const allAvailable = Array.from(new Set([...expenseCats, ...standardCats])).filter(
    c => !adjustActiveCategories.includes(c)
  );

  if (allAvailable.length === 0) {
    listEl.innerHTML =
      '<div class="text-xs text-[#848D99] text-center py-4">Все доступные категории уже добавлены в план.</div>';
  } else {
    listEl.innerHTML = allAvailable
      .map(cat => {
        const icon = typeof getCategoryIcon === 'function' ? getCategoryIcon(cat) : 'tag';
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
      })
      .join('');
  }

  dlg.classList.remove('hidden');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}
window.openAddAdjustCategoryPicker = openAddAdjustCategoryPicker;

function closeAddAdjustCategoryPicker() {
  const dlg = document.getElementById('month-adjust-category-picker-dialog');
  if (dlg) {
    dlg.classList.add('hidden');
    if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
  }
}
window.closeAddAdjustCategoryPicker = closeAddAdjustCategoryPicker;

function selectAdjustCategoryToAdd(catName) {
  if (catName && !adjustActiveCategories.includes(catName)) {
    adjustActiveCategories.push(catName);
    window.adjustActiveCategories = adjustActiveCategories;
    renderAdjustCategoriesList();
    updateMonthCloseForecast();
  }
  closeAddAdjustCategoryPicker();
}
window.selectAdjustCategoryToAdd = selectAdjustCategoryToAdd;

function removeAdjustCategory(catName) {
  adjustActiveCategories = adjustActiveCategories.filter(c => c !== catName);
  window.adjustActiveCategories = adjustActiveCategories;
  renderAdjustCategoriesList();
  updateMonthCloseForecast();
}
window.removeAdjustCategory = removeAdjustCategory;

function closeMonthCloseAdjustModal() {
  const dlg = document.getElementById('month-close-adjust-dialog');
  if (dlg) {
    dlg.classList.add('hidden');
    if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
  }
}
window.closeMonthCloseAdjustModal = closeMonthCloseAdjustModal;

function backToMonthSummaryStep() {
  closeMonthCloseAdjustModal();
  const dlg = document.getElementById('month-close-summary-dialog');
  if (dlg) dlg.classList.remove('hidden');
}
window.backToMonthSummaryStep = backToMonthSummaryStep;

function updateMonthCloseForecast() {
  const incInput = document.getElementById('close-adjust-income-input');
  const income = incInput ? getUnformattedVal(incInput) || 0 : 0;

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
      forecastSurplus.className =
        'text-xs sm:text-sm font-black font-mono text-emerald-400 whitespace-nowrap flex-shrink-0';
    } else if (surplus < 0) {
      forecastSurplus.innerText = `-${formatMoney(Math.abs(surplus))} / мес`;
      forecastSurplus.className =
        'text-xs sm:text-sm font-black font-mono text-[#FF453A] whitespace-nowrap flex-shrink-0';
    } else {
      forecastSurplus.innerText = '0 ₽ / мес';
      forecastSurplus.className =
        'text-xs sm:text-sm font-black font-mono text-gray-300 whitespace-nowrap flex-shrink-0';
    }
  }
}
window.updateMonthCloseForecast = updateMonthCloseForecast;

function applyAdjustAverageIncome() {
  if (!activeMonthCloseData) return;
  const avg = activeMonthCloseData.averages.avgIncome || 0;
  const incInput = document.getElementById('close-adjust-income-input');
  if (incInput) {
    incInput.value = formatMoney(avg);
    updateMonthCloseForecast();
  }
}
window.applyAdjustAverageIncome = applyAdjustAverageIncome;

function applyAdjustAverageCategoryLimit(catName, avgValue) {
  const inp = document.querySelector(`input[data-close-cat="${catName}"]`);
  if (inp) {
    inp.value = avgValue > 0 ? formatMoney(avgValue) : '';
    updateMonthCloseForecast();
  }
}
window.applyAdjustAverageCategoryLimit = applyAdjustAverageCategoryLimit;

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
window.applyAllAdjustAverageCategoryLimits = applyAllAdjustAverageCategoryLimits;

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

  const goals = Cache?.goals || [];
  const actualSurplus = data.actualSurplus || 0;
  const goalIncrements = [];

  try {
    const batch = db.batch();

    if (actualSurplus !== 0 && goals.length > 0) {
      const activeGoals = goals.filter(g => g.status !== 'Архив');
      const totalExplicitShares = activeGoals.reduce(
        (sum, g) => sum + (parseFloat(g.share) || 0),
        0
      );

      activeGoals.forEach(g => {
        let sharePct = parseFloat(g.share) || 0;
        if (totalExplicitShares === 0) {
          sharePct = 100 / activeGoals.length;
        }
        if (sharePct > 0) {
          const changeAmount = Math.round(actualSurplus * (sharePct / 100));
          if (changeAmount !== 0) {
            const oldSaved = parseFloat(g.saved) || 0;
            const newSaved = Math.max(0, oldSaved + changeAmount);
            const actualDeducted = Math.abs(oldSaved - newSaved);
            const target = parseFloat(g.target) || 0;
            const isAchieved = target > 0 && newSaved >= target;

            const goalRef = getUserCol('Goals').doc(g.id);
            batch.update(goalRef, {
              saved: newSaved,
              status: isAchieved
                ? 'Выполнена'
                : newSaved < target && g.status === 'Выполнена'
                  ? 'В процессе'
                  : g.status || 'В процессе',
              updatedAt: Date.now(),
            });

            g.saved = newSaved;
            g.status = isAchieved
              ? 'Выполнена'
              : newSaved < target && g.status === 'Выполнена'
                ? 'В процессе'
                : g.status || 'В процессе';

            goalIncrements.push({
              id: g.id,
              name: g.name,
              changeAmount: actualSurplus < 0 ? -actualDeducted : changeAmount,
              oldSaved,
              newSaved,
              target,
            });
          }
        }
      });
    }

    closedMonths[monthKey] = {
      closedAt: Date.now(),
      year: data.year,
      month: data.month,
      actualIncome: data.actualIncome,
      actualExpense: data.actualExpense,
      actualBills: data.actualBills,
      actualSurplus: data.actualSurplus,
      planIncome: data.planIncome,
      planExpense: data.planExpense,
    };

    const planRef = getUserCol('BudgetPlan').doc('plan');
    batch.set(
      planRef,
      {
        ...plan,
        isConfigured: true,
        monthlyIncome: income,
        monthlyVariableLimit: totalLimits,
        categoryLimits: categoryLimits,
        closedMonths: closedMonths,
        updatedAt: Date.now(),
      },
      { merge: true }
    );

    await batch.commit();

    const nextDate = new Date(data.year, data.month + 1, 1);
    if (typeof navigateBudgetMonth === 'function') {
      navigateBudgetMonth(0, nextDate);
    } else {
      window.selectedBudgetYear = nextDate.getFullYear();
      window.selectedBudgetMonth = nextDate.getMonth();
    }

    closeMonthCloseAdjustModal();
    await fetchAllData();

    if (typeof playGoalFlowAnimation === 'function') {
      playGoalFlowAnimation(actualSurplus, goalIncrements);
    }
  } catch (err) {
    console.error('Ошибка закрытия месяца:', err);
    showToast('Ошибка закрытия: ' + err.message, true);
  }
}
window.finalizeMonthClose = finalizeMonthClose;
