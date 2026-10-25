// ==========================================
// Variables & State
// ==========================================
let activeEditCategory = null;

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

    // Проверяем, отображен ли уже какой-либо шаг мастера в DOM
    const hasVisibleStep = [1, 2, 3, 4, 5].some(s => {
      const el = document.getElementById(`wizard-step-${s}`);
      return el && !el.classList.contains('hidden');
    });

    if (!hasVisibleStep) {
      initBudgetWizard(false);
    } else {
      // Мастер уже активен: не сбрасываем поля, а мягко обновляем данные для текущего шага
      goToWizardStep(currentWizardStep || 1);
    }
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

  // Бейдж статуса месяца (Закрыт / Ожидает закрытия / Текущий)
  const statusBadge = document.getElementById('budget-month-status-badge');
  const isClosed = isBudgetMonthClosed(targetYear, targetMonth);
  if (statusBadge) {
    if (isClosed) {
      statusBadge.className =
        'text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 inline-block';
      statusBadge.innerText = 'Закрыт';
      statusBadge.classList.remove('hidden');
    } else if (
      !isCurrentCalendarMonth &&
      targetDate.getTime() < new Date(today.getFullYear(), today.getMonth(), 1).getTime()
    ) {
      statusBadge.className =
        'text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25 inline-block';
      statusBadge.innerText = 'Ожидает закрытия';
      statusBadge.classList.remove('hidden');
    } else {
      statusBadge.classList.add('hidden');
    }
  }

  // Точный расчет недели (Пн-Вс) для текущего месяца
  const dayOfWeek = today.getDay();
  const diffToMonday = (dayOfWeek + 6) % 7;
  const startOfWeek = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - diffToMonday,
    0,
    0,
    0,
    0
  );
  const endOfWeek = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - diffToMonday + 6,
    23,
    59,
    59,
    999
  );

  // Точный расчет выбранного месяца (с 1 по последний день)
  const startOfMonth = new Date(targetYear, targetMonth, 1, 0, 0, 0, 0);
  const endOfMonth = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);
  const startOfMonthTime = startOfMonth.getTime();
  const endOfMonthTime = endOfMonth.getTime();
  const startOfWeekTime = startOfWeek.getTime();
  const endOfWeekTime = endOfWeek.getTime();

  const targetMonthKey = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`;

  let weeklySpent = 0;
  let monthlySpent = 0;
  const currentMonthItems = [];

  // ОПТИМИЗАЦИЯ: Извлекаем операции целевого месяца напрямую за O(1), без обхода всей многолетней истории
  const targetMonthObj = (Cache.transactions || []).find(m => m.id === targetMonthKey);
  if (targetMonthObj && Array.isArray(targetMonthObj.items)) {
    targetMonthObj.items.forEach(tx => {
      const isExpense =
        tx.type === 'Расход' ||
        tx.type === 'expense' ||
        String(tx.type || '')
          .trim()
          .toLowerCase() === 'расход';
      const isExcluded = !!(tx.excludeFromBudget || tx.isExcludedFromBudget);
      if (!isExpense || isExcluded) return;

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
        monthlySpent += val;
        currentMonthItems.push(tx);
        if (isCurrentCalendarMonth && txTime >= startOfWeekTime && txTime <= endOfWeekTime) {
          weeklySpent += val;
        }
      }
    });
  }

  // Если текущая неделя захватывает дни соседнего месяца (например, конец прошлого месяца)
  if (isCurrentCalendarMonth) {
    const startWeekMonthKey = `${startOfWeek.getFullYear()}-${String(startOfWeek.getMonth() + 1).padStart(2, '0')}`;
    if (startWeekMonthKey !== targetMonthKey) {
      const prevMonthObj = (Cache.transactions || []).find(m => m.id === startWeekMonthKey);
      if (prevMonthObj && Array.isArray(prevMonthObj.items)) {
        prevMonthObj.items.forEach(tx => {
          const isExpense =
            tx.type === 'Расход' ||
            tx.type === 'expense' ||
            String(tx.type || '')
              .trim()
              .toLowerCase() === 'расход';
          const isExcluded = !!(tx.excludeFromBudget || tx.isExcludedFromBudget);
          if (!isExpense || isExcluded) return;
          const val =
            typeof tx.amount === 'number'
              ? tx.amount
              : parseFloat(
                  String(tx.amount || 0)
                    .replace(/\s/g, '')
                    .replace(/,/g, '.')
                ) || 0;
          if (val <= 0) return;
          const txTime = tx.dayTimestamp || tx.timestamp || 0;
          if (txTime >= startOfWeekTime && txTime <= endOfWeekTime) {
            weeklySpent += val;
          }
        });
      }
    }
  } else {
    // Если просматриваем архивный месяц — недельные траты берутся как средненедельные по месяцу
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

  // Истинная шкала трат за месяц (непрерывный прогресс-бар)
  const monthStatEl = document.getElementById('budget-month-stat');
  const monthPctEl = document.getElementById('budget-month-pct');
  const monthBar = document.getElementById('budget-month-bar');
  const mPct = monthlyLimit > 0 ? (monthlySpent / monthlyLimit) * 100 : 0;
  const mClampedPct = Math.min(100, Math.max(0, mPct));

  let monthColor = 'bg-[#30D158]';
  let monthTextColor = '#30D158';
  if (monthlySpent > monthlyLimit && monthlyLimit > 0) {
    monthColor = 'bg-[#FF453A]';
    monthTextColor = '#FF453A';
  } else if (mPct >= 80) {
    monthColor = 'bg-[#FF9F0A]';
    monthTextColor = '#FF9F0A';
  } else {
    monthTextColor = '#848D99';
  }

  // Проверяем, видна ли сейчас вкладка бюджета, и нужно ли проиграть анимацию после внесения трат
  const budgetTabEl = document.getElementById('budget-tab');
  const isBudgetTabVisible = !!(budgetTabEl && !budgetTabEl.classList.contains('hidden'));
  const currentMonthKey = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`;
  const shouldPlayExpenseAnimation = !!(window._budgetNeedsExpenseAnimation && isBudgetTabVisible);
  const EXPENSE_ANIM_DURATION = 3000; // Размеренная благородная скорость наполнения/уменьшения (3.0 сек)

  // Базовые значения до внесения трат для анимации изменений от предыдущей точки
  const baseline =
    window._budgetBaselineState && window._budgetBaselineState.targetMonthKey === currentMonthKey
      ? window._budgetBaselineState
      : window._budgetLastRenderedState &&
          window._budgetLastRenderedState.targetMonthKey === currentMonthKey
        ? window._budgetLastRenderedState
        : null;

  const baseWeeklySpent =
    baseline && baseline.weeklySpent !== undefined ? baseline.weeklySpent : weeklySpent;
  const baseMonthlySpent =
    baseline && baseline.monthlySpent !== undefined ? baseline.monthlySpent : monthlySpent;
  const baseWeeklyAvailable =
    baseline && baseline.weeklyAvailable !== undefined ? baseline.weeklyAvailable : weeklyAvailable;
  const baseWeekPct = baseline && baseline.weekPct !== undefined ? baseline.weekPct : weekPct;
  const baseMonthPct = baseline && baseline.monthPct !== undefined ? baseline.monthPct : mPct;
  const baseCircleOffset =
    baseline && baseline.circleOffset !== undefined ? baseline.circleOffset : circleOffset;
  const baseClampedMonthPct =
    baseline && baseline.clampedMonthPct !== undefined ? baseline.clampedMonthPct : mClampedPct;

  if (shouldPlayExpenseAnimation) {
    // Сбрасываем флаги: анимация изменений проигрывается строго один раз после внесения трат
    window._budgetNeedsExpenseAnimation = false;
    window._budgetBaselineState = null;

    // 1. Анимация метрик недели: стартуем от точки ДО внесения трат
    if (weekAvailEl) {
      if (weeklyBaseLimit > 0 && weeklySpent > weeklyBaseLimit) {
        weekAvailEl.innerHTML = `<span class="text-white">${formatMoney(0)}</span> <span class="text-xs font-semibold text-[#FF453A] ml-2 block sm:inline">Лимит превышен на ${formatMoney(weeklySpent - weeklyBaseLimit)}</span>`;
        weekAvailEl.dataset.animVal = '0';
      } else if (typeof animateNumber === 'function') {
        weekAvailEl.dataset.animVal = String(baseWeeklyAvailable);
        weekAvailEl.innerText = formatMoney(baseWeeklyAvailable);
        animateNumber(weekAvailEl, weeklyAvailable, true, EXPENSE_ANIM_DURATION);
      } else {
        weekAvailEl.innerText = formatMoney(weeklyAvailable);
      }
    }

    if (weekSpentText) {
      weekSpentText.dataset.animVal = String(baseWeeklySpent);
      weekSpentText.innerText = formatMoney(baseWeeklySpent);
      if (typeof animateNumber === 'function')
        animateNumber(weekSpentText, weeklySpent, true, EXPENSE_ANIM_DURATION);
      else weekSpentText.innerText = formatMoney(weeklySpent);
    }

    if (weekLimitText) {
      if (typeof animateNumber === 'function') animateNumber(weekLimitText, weeklyBaseLimit);
      else weekLimitText.innerText = formatMoney(weeklyBaseLimit);
    }

    // Исходное состояние кольцевой шкалы (точка до добавления трат)
    if (weekCircleBar) {
      weekCircleBar.style.transition = 'none';
      weekCircleBar.style.strokeDashoffset = `${baseCircleOffset}`;
      weekCircleBar.style.stroke = strokeColor;
    }

    // Нарастание процентов недели от предыдущего значения
    if (typeof animatePercentage === 'function') {
      animatePercentage(weekCirclePct, weekPct, strokeColor, EXPENSE_ANIM_DURATION, baseWeekPct);
    } else if (weekCirclePct) {
      weekCirclePct.innerText = `${Math.round(weekPct)}%`;
      weekCirclePct.style.color = strokeColor;
    }

    // 2. Анимация метрик месяца: стартуем от точки ДО внесения трат
    if (monthStatEl) {
      monthStatEl.innerHTML = `<span id="budget-month-spent-val">${formatMoney(baseMonthlySpent)}</span> <span class="text-[#848D99] font-normal">из</span> ${formatMoney(monthlyLimit)}`;
      const spentEl = document.getElementById('budget-month-spent-val');
      if (spentEl && typeof animateNumber === 'function') {
        spentEl.dataset.animVal = String(baseMonthlySpent);
        animateNumber(spentEl, monthlySpent, true, EXPENSE_ANIM_DURATION);
      }
    }

    // Нарастание процентов месяца от предыдущего значения
    if (typeof animatePercentage === 'function') {
      animatePercentage(monthPctEl, mPct, monthTextColor, EXPENSE_ANIM_DURATION, baseMonthPct);
    } else if (monthPctEl) {
      monthPctEl.innerText = `${Math.round(mPct)}%`;
      monthPctEl.style.color = monthTextColor;
    }

    // Исходное состояние шкалы месяца (ширина до добавления трат)
    if (monthBar) {
      monthBar.style.transition = 'none';
      monthBar.style.width = `${monthlyLimit > 0 ? baseClampedMonthPct : baseMonthlySpent > 0 ? 100 : 0}%`;
      monthBar.className = `h-full ${monthColor} rounded-full shadow-sm`;
    }

    // Запускаем плавное наполнение шкал от предыдущей точки до новой
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (weekCircleBar) {
          weekCircleBar.style.transition = `stroke-dashoffset ${EXPENSE_ANIM_DURATION}ms cubic-bezier(0.16, 1, 0.3, 1), stroke 0.4s ease`;
          weekCircleBar.style.strokeDashoffset = `${circleOffset}`;
        }
        if (monthBar) {
          monthBar.style.transition = `width ${EXPENSE_ANIM_DURATION}ms cubic-bezier(0.16, 1, 0.3, 1), background-color 0.4s ease`;
          monthBar.style.width = `${monthlyLimit > 0 ? mClampedPct : monthlySpent > 0 ? 100 : 0}%`;
        }
      });
    });
  } else {
    // Обычный рендер без анимации с нуля (быстрое обновление или стабильное отображение)
    if (weekAvailEl) {
      if (weeklyBaseLimit > 0 && weeklySpent > weeklyBaseLimit) {
        weekAvailEl.innerHTML = `<span class="text-white">${formatMoney(0)}</span> <span class="text-xs font-semibold text-[#FF453A] ml-2 block sm:inline">Лимит превышен на ${formatMoney(weeklySpent - weeklyBaseLimit)}</span>`;
        weekAvailEl.dataset.animVal = '0';
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

    if (weekCircleBar) {
      weekCircleBar.style.transition = 'stroke-dashoffset 0.5s ease-out, stroke 0.4s ease';
      weekCircleBar.style.strokeDashoffset = `${circleOffset}`;
      weekCircleBar.style.stroke = strokeColor;
    }
    if (weekCirclePct) {
      weekCirclePct.innerText = `${Math.round(weekPct)}%`;
      weekCirclePct.style.color = strokeColor;
    }

    if (monthStatEl) {
      monthStatEl.innerHTML = `<span id="budget-month-spent-val">${formatMoney(monthlySpent)}</span> <span class="text-[#848D99] font-normal">из</span> ${formatMoney(monthlyLimit)}`;
      const spentEl = document.getElementById('budget-month-spent-val');
      if (spentEl && typeof animateNumber === 'function') {
        animateNumber(spentEl, monthlySpent);
      }
    }

    if (monthPctEl) {
      monthPctEl.innerText = `${Math.round(mPct)}%`;
      monthPctEl.style.color = monthTextColor;
    }

    if (monthBar) {
      monthBar.style.transition = 'width 0.5s ease-out, background-color 0.4s ease';
      monthBar.style.width = `${monthlyLimit > 0 ? mClampedPct : monthlySpent > 0 ? 100 : 0}%`;
      monthBar.className = `h-full ${monthColor} rounded-full shadow-sm`;
    }
  }

  // Фиксируем текущее актуальное состояние для следующей анимации изменений
  window._budgetLastRenderedState = {
    weeklySpent,
    monthlySpent,
    weeklyAvailable,
    weekPct,
    monthPct: mPct,
    circleOffset,
    clampedMonthPct: mClampedPct,
    targetMonthKey: currentMonthKey,
  };

  // Кнопка закрытия месяца на одной строке с процентом заполнения шкалы
  const closeMonthContainer = document.getElementById('budget-close-month-container');
  const closeMonthBtn = document.getElementById('budget-close-month-btn');
  const closeMonthBtnText = document.getElementById('budget-close-month-btn-text');

  // Месяц завершился по дате устройства
  const isMonthEnded =
    today.getFullYear() > targetYear ||
    (today.getFullYear() === targetYear && today.getMonth() > targetMonth);

  if (closeMonthContainer && closeMonthBtn && closeMonthBtnText) {
    if (isClosed) {
      closeMonthContainer.classList.remove('hidden');
      closeMonthBtn.className =
        'py-1 px-2.5 rounded-lg bg-[#212430] hover:bg-[#2A2D3C] text-emerald-400 font-semibold text-[11px] border border-emerald-500/30 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer';
      closeMonthBtnText.innerText = 'Итоги закрытия';
      closeMonthBtn.onclick = () => openMonthCloseFlow(targetYear, targetMonth);
    } else if (isMonthEnded) {
      closeMonthContainer.classList.remove('hidden');
      closeMonthBtn.className =
        'py-1 px-3 rounded-lg bg-gradient-to-r from-[#6C5DD3] to-[#8C7DFF] hover:from-[#5e4fc9] hover:to-[#7b6ceb] text-white font-bold text-[11px] shadow-sm border border-[rgba(255,255,255,0.1)] flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer';
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
  if (typeof window.syncWidgetData === 'function') {
    window.syncWidgetData();
  }
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

  // Сортировка: пользовательские категории сверху, а "Прочие расходы / Прочие траты" всегда в самом конце
  activeLimitKeys.sort((a, b) => {
    const isOtherA = a === 'Прочие расходы' || a === 'Прочие траты';
    const isOtherB = b === 'Прочие расходы' || b === 'Прочие траты';
    if (isOtherA && !isOtherB) return 1;
    if (!isOtherA && isOtherB) return -1;
    return a.localeCompare(b, 'ru');
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
  const specificLimitKeys = activeLimitKeys.filter(
    k => k !== 'Прочие расходы' && k !== 'Прочие траты'
  );

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

  container.innerHTML = activeLimitKeys
    .map(catName => {
      const isOther = catName === 'Прочие расходы' || catName === 'Прочие траты';
      const spent = isOther ? otherSpent : spentMap[catName] || 0;
      const limit = parseFloat(safeLimits[catName]) || 0;

      // Получаем иконку категории
      const catObj = expenseCats.find(c => (typeof c === 'string' ? c : c?.name) === catName);
      const icon =
        catObj?.icon || (typeof getCategoryIcon === 'function' ? getCategoryIcon(catName) : 'tag');

      const pct = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
      const isOver = limit > 0 && spent > limit;

      let barColor = 'bg-[#30D158]';
      if (isOver) barColor = 'bg-[#FF453A]';
      else if (pct >= 80) barColor = 'bg-[#FF9F0A]';

      return `
      <div class="category-limit-card cursor-pointer py-3 px-3 rounded-2xl flex items-center justify-between gap-3 group hover:bg-[#1f222d]/60 active:scale-[0.99] transition-all select-none"
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
    })
    .join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();
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

// ========================================================
// Управление лимитами категорий и учтенными операциями
// ========================================================
function getCategoryCurrentMonthTransactions(categoryName, targetDate = getSelectedBudgetDate()) {
  const d = targetDate || getSelectedBudgetDate();
  const startOfMonth = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
  const endOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);

  const isOtherCategory = categoryName === 'Прочие расходы' || categoryName === 'Прочие траты';
  const plan = Cache?.budgetPlan || {};
  const safeLimits = plan && typeof plan.categoryLimits === 'object' ? plan.categoryLimits : {};
  const specificLimitKeys = Object.keys(safeLimits).filter(k => {
    const lim = parseFloat(safeLimits[k]);
    return !isNaN(lim) && lim > 0 && k !== 'Прочие расходы' && k !== 'Прочие траты';
  });

  const txList = [];
  const startOfMonthTime = startOfMonth.getTime();
  const endOfMonthTime = endOfMonth.getTime();
  const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const monthObj = (Cache.transactions || []).find(m => m.id === monthKey);

  if (monthObj && Array.isArray(monthObj.items)) {
    monthObj.items.forEach(tx => {
      const isExpense =
        tx.type === 'Расход' ||
        tx.type === 'expense' ||
        String(tx.type || '')
          .trim()
          .toLowerCase() === 'расход';
      if (!isExpense) return;
      if (tx.isBillPayment) return;

      const txCat = (tx.category || 'Другое').trim() || 'Другое';
      if (isOtherCategory) {
        if (specificLimitKeys.includes(txCat) && txCat !== categoryName) return;
      } else {
        if (txCat !== categoryName) return;
      }

      const txTime =
        tx.dayTimestamp ||
        tx.timestamp ||
        (tx.rawDate
          ? typeof window.parseAnyDate === 'function'
            ? window.parseAnyDate(tx.rawDate)?.getTime()
            : new Date(tx.rawDate).getTime()
          : 0);

      if (txTime >= startOfMonthTime && txTime <= endOfMonthTime) {
        txList.push({ ...tx, dateObj: new Date(txTime) });
      }
    });
  }

  // Сортировка от свежих к старым
  txList.sort((a, b) => (b.dateObj?.getTime() || 0) - (a.dateObj?.getTime() || 0));
  return txList;
}

function openCategoryLimitModal(catName, currentLimit) {
  activeEditCategory = catName;
  const dlg = document.getElementById('category-limit-dialog');
  const title = document.getElementById('category-limit-title');
  const inp = document.getElementById('category-limit-amount');
  const iconWrap = document.getElementById('category-limit-icon-wrap');
  const delBtn = document.getElementById('category-limit-delete-btn');

  const catObj = Cache?.categories?.expense?.find(
    c => (typeof c === 'string' ? c : c?.name) === catName
  );
  const iconName =
    catObj && typeof catObj === 'object' && catObj.icon && catObj.icon !== 'package'
      ? catObj.icon
      : typeof getCategoryIcon === 'function'
        ? getCategoryIcon(catName)
        : 'tag';

  if (title) title.innerText = catName;
  if (iconWrap) {
    iconWrap.innerHTML = `<i data-lucide="${iconName}" class="w-4 h-4 text-[#6C5DD3]"></i>`;
  }
  if (inp) setFormattedVal('category-limit-amount', currentLimit || '');

  if (delBtn) {
    if (catName === 'Прочие расходы' || catName === 'Прочие траты') {
      delBtn.classList.add('hidden');
    } else {
      delBtn.classList.remove('hidden');
    }
  }

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
  activeEditCategory = null;
}

async function deleteCategoryLimitFromModal() {
  if (!activeEditCategory) return;
  const catToDelete = activeEditCategory;
  if (catToDelete === 'Прочие расходы' || catToDelete === 'Прочие траты') {
    showToast('Категорию «Прочие траты» нельзя удалить', true);
    return;
  }
  showDialog(
    'Удаление лимита',
    `Удалить лимит категории «${catToDelete}»? Его сумма будет перенесена в «Прочие расходы».`,
    true,
    async () => {
      await deleteBudgetCategoryLimit(catToDelete);
    }
  );
}
window.deleteCategoryLimitFromModal = deleteCategoryLimitFromModal;

async function deleteBudgetCategoryLimit(catName) {
  if (!catName || catName === 'Прочие расходы' || catName === 'Прочие траты') {
    showToast('Категорию «Прочие траты» нельзя удалить', true);
    return;
  }

  try {
    const plan = { ...(Cache.budgetPlan || {}) };
    const limits = { ...(plan.categoryLimits || {}) };
    const removedLimit = parseFloat(limits[catName]) || 0;

    const otherKey = limits['Прочие траты'] !== undefined ? 'Прочие траты' : 'Прочие расходы';
    limits[otherKey] = (parseFloat(limits[otherKey]) || 0) + removedLimit;
    delete limits[catName];

    plan.categoryLimits = limits;
    Cache.budgetPlan = plan;

    if (auth.currentUser) {
      await getUserCol('BudgetPlan').doc('current').set(plan, { merge: true });
    }

    if (typeof managerCustomCategories !== 'undefined') {
      managerCustomCategories.delete(catName);
    }
    if (typeof wizardCustomCategories !== 'undefined') {
      wizardCustomCategories.delete(catName);
    }

    closeCategoryLimitModal();
    closeWizAvgDetailsModal();

    if (typeof markTabsDirty === 'function') markTabsDirty();
    if (typeof renderBudgetTab === 'function') renderBudgetTab();
    if (typeof renderCategoryLimitsManager === 'function') renderCategoryLimitsManager();
    if (typeof renderWizLimitsEditor === 'function') renderWizLimitsEditor();

    showToast(`Лимит «${catName}» (${formatMoney(removedLimit)}) перенесен в «${otherKey}»`);
  } catch (err) {
    console.error('Ошибка удаления лимита категории:', err);
    showToast('Ошибка удаления лимита: ' + err.message, true);
  }
}
window.deleteBudgetCategoryLimit = deleteBudgetCategoryLimit;

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
      const val =
        typeof tx.amount === 'number'
          ? tx.amount
          : parseFloat(
              String(tx.amount || 0)
                .replace(/\s/g, '')
                .replace(/,/g, '.')
            ) || 0;
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
    progressBar.className = `h-full rounded-full transition-all duration-300 ${isOver ? 'bg-[#FF453A]' : pct >= 80 ? 'bg-[#FF9F0A]' : 'bg-[#30D158]'}`;
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

  const isOther = activeEditCategory === 'Прочие расходы' || activeEditCategory === 'Прочие траты';

  listEl.innerHTML = txList
    .map(tx => {
      const isExcluded = !!(tx.excludeFromBudget || tx.isExcludedFromBudget);
      const amountVal =
        typeof tx.amount === 'number'
          ? tx.amount
          : parseFloat(
              String(tx.amount || 0)
                .replace(/\s/g, '')
                .replace(/,/g, '.')
            ) || 0;
      const dateStr = tx.dateObj
        ? `${tx.dateObj.getDate()} ${['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'][tx.dateObj.getMonth()]}`
        : tx.date || '';
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
    })
    .join('');
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
      updatedAt: Date.now(),
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
    await getUserCol('BudgetPlan')
      .doc('plan')
      .set(
        {
          ...plan,
          isConfigured: true,
          monthlyVariableLimit: totalVarLimit,
          categoryLimits: limits,
          updatedAt: Date.now(),
        },
        { merge: true }
      );

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

  const avgMap =
    typeof calculateHistoricalCategoryAverages === 'function'
      ? calculateHistoricalCategoryAverages()
      : {};
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
    if (!accountedNames.includes(cat) && cat !== 'Прочие расходы' && cat !== 'Прочие траты') {
      othersAvg += avgMap[cat] || 0;
    }
  });
  if (
    window._customCategoryAverages &&
    (window._customCategoryAverages['Прочие расходы'] !== undefined ||
      window._customCategoryAverages['Прочие траты'] !== undefined)
  ) {
    avgMap['Прочие расходы'] =
      window._customCategoryAverages['Прочие расходы'] !== undefined
        ? window._customCategoryAverages['Прочие расходы']
        : window._customCategoryAverages['Прочие траты'];
  } else {
    avgMap['Прочие расходы'] = othersAvg;
  }
  list.push({ name: 'Прочие расходы', icon: 'package', isCustom: false });

  container.innerHTML = list
    .map(cat => {
      const avg = Math.round(avgMap[cat.name] || 0);
      const existingVal =
        currentLimits[cat.name] !== undefined
          ? currentLimits[cat.name]
          : cat.isCustom
            ? ''
            : avg > 0
              ? avg
              : '';

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
          ${
            avg > 0
              ? `
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
          `
              : `
            <div class="flex items-center gap-1 mt-0.5">
              <span class="text-[10px] text-[#848D99] w-[100px] block truncate">Ср: нет данных</span>
              <button type="button" 
                      onclick="openWizAvgDetailsModal('expense', '${escapeHtml(cat.name)}')" 
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
                 inputmode="decimal"
                 data-mgr-cat="${escapeHtml(cat.name)}"
                 oninput="formatSumInput(this); updateMgrLiveTotal();"
                 value="${existingVal ? formatMoney(existingVal) : ''}"
                 placeholder="0 ₽"
                 class="w-full h-8 bg-[#161922] border border-[rgba(255,255,255,0.08)] text-white text-right font-mono font-semibold text-xs rounded-xl px-2 outline-none focus:border-[#6C5DD3] focus:bg-[#1A1E29] transition-all whitespace-nowrap">
        </div>
      </div>
    `;
    })
    .join('');

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
      updatedAt: Date.now(),
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
window.openBillModal = openAddBillModal;
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

// ========================================================
// Закрытие месяца и подведение итогов (Month Closing Flow)
// ========================================================

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

  // Сбор данных по операциям
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
        isBillOrOneTimeTx(tx);

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
    expenseDiff: planExpense - actualExpense, // положительный = экономия
    actualBills,
    billsCount: activeBills.length,
    actualSurplus,
    planSurplus,
    extraSaved,
    categoryStats,
    averages,
    isClosed: isBudgetMonthClosed(year, month),
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
  if (subtitleEl)
    subtitleEl.innerText = data.isClosed
      ? 'Месяц успешно закрыт'
      : 'Сводка выполнения финансового плана';

  // Главный баннер (Награда за экономию)
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
            <p class="text-xs text-gray-300 mt-1.5 leading-relaxed">Расходы и счета превысили доход. Сумма дефицита будет автоматически вычтена из накоплений по целям пропорционально их долям.</p>
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
      catListEl.innerHTML =
        '<div class="text-xs text-[#848D99] text-center py-2">Нет трат по категориям</div>';
    } else {
      catListEl.innerHTML = data.categoryStats
        .map(c => {
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
    catContainer.innerHTML =
      '<div class="text-xs text-[#848D99] text-center py-3 bg-[#12151C] rounded-2xl border border-[rgba(255,255,255,0.04)]">Нет выбранных категорий. Добавьте категории кнопкой ниже.</div>';
    return;
  }

  catContainer.innerHTML = adjustActiveCategories
    .map(cat => {
      const catObj = allExpenseCats.find(c => (typeof c === 'string' ? c : c?.name) === cat);
      const icon = catObj?.icon || getCategoryIcon(cat);
      const existingVal = document.querySelector(`input[data-close-cat="${cat}"]`);
      const curLimit = existingVal ? getUnformattedVal(existingVal) || 0 : currentLimits[cat] || 0;

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
      })
      .join('');
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

function deleteCurrentWizCategory() {
  if (!wizAvgCurrentContext || !wizAvgCurrentContext.categoryName) return;
  const catName = wizAvgCurrentContext.categoryName;
  if (catName === 'Прочие расходы' || catName === 'Прочие траты') {
    showToast('Категорию «Прочие траты» нельзя удалить', true);
    return;
  }

  showDialog('Удаление категории', `Удалить категорию «${catName}» из лимитов?`, true, async () => {
    // 1. Если это Шаг 4 мастера первоначальной настройки:
    const step4 = document.getElementById('wizard-step-4');
    if (step4 && !step4.classList.contains('hidden')) {
      removeWizardCustomCat(catName);
      closeWizAvgDetailsModal();
      return;
    }

    // 2. Если это окно закрытия месяца:
    if (
      typeof adjustActiveCategories !== 'undefined' &&
      Array.isArray(adjustActiveCategories) &&
      adjustActiveCategories.includes(catName)
    ) {
      if (typeof removeAdjustCategory === 'function') removeAdjustCategory(catName);
      closeWizAvgDetailsModal();
      return;
    }

    // 3. Если это менеджер лимитов:
    if (typeof managerCustomCategories !== 'undefined' && managerCustomCategories.has(catName)) {
      if (typeof removeManagerCustomCat === 'function') removeManagerCustomCat(catName);
      closeWizAvgDetailsModal();
      return;
    }

    // 4. Иначе это настроенный бюджетный план:
    removeWizardCustomCat(catName);
    await deleteBudgetCategoryLimit(catName);
    closeWizAvgDetailsModal();
  });
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

            // Обновляем локально
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
      planExpense: data.planExpense,
    };

    // 3. Обновление генерального плана
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
window.handleAddCategoryLimitChoice = handleAddCategoryLimitChoice;
window.addCategoryToWizard = addCategoryToWizard;
window.removeWizardCustomCat = removeWizardCustomCat;
window.updateWizLiveTotal = updateWizLiveTotal;
window.calculateAndRenderWizSummary = calculateAndRenderWizSummary;
window.finishBudgetOnboarding = finishBudgetOnboarding;
// Управление лимитами категорий
window.openCategoryLimitModal = openCategoryLimitModal;
window.closeCategoryLimitModal = closeCategoryLimitModal;
window.deleteCategoryLimitFromModal = deleteCategoryLimitFromModal;
window.deleteBudgetCategoryLimit = deleteBudgetCategoryLimit;
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
window.toggleBudgetGoalIconPicker = toggleBudgetGoalIconPicker;
window.closeBudgetGoalIconPicker = closeBudgetGoalIconPicker;
window.renderGoalModalIconGrid = renderGoalModalIconGrid;
window.selectGoalIcon = selectGoalIcon;
window.formatCompactBillAmount = formatCompactBillAmount;
window.handleGoalNameInput = handleGoalNameInput;
window.renderGoalSharesManagerList = renderGoalSharesManagerList;
window.handleGoalShareSliderChange = handleGoalShareSliderChange;
window.handleGoalShareVirtualSliderChange = handleGoalShareVirtualSliderChange;
window.getMonthlyPlannedSavingsTotal = getMonthlyPlannedSavingsTotal;

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
