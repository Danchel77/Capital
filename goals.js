/**
 * goals.js
 * Financial goals, piggy banks, capital allocation, and True OLED Obsidian Minimalist design system.
 */

// Global goal icons catalog
window.GOAL_ICONS = window.GOAL_ICONS || [
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
  { name: 'trending-up', label: 'Инвестиции' },
];
const WIZARD_GOAL_ICONS = window.GOAL_ICONS;
window.WIZARD_GOAL_ICONS = WIZARD_GOAL_ICONS;

// Module state
let tempGoalShares = {};

function getTotalDepositsValue() {
  const deps = (Cache?.deposits || [])
    .filter(d => !d.isClosed)
    .reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);
  const sa = (Cache?.savingsAccounts || [])
    .filter(a => !a.isClosed && a.status !== 'Закрыт')
    .reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0);
  return deps + sa;
}
window.getTotalDepositsValue = getTotalDepositsValue;

function getTotalBrokerValue() {
  const assets = Cache?.brokerAssets || [];
  let total = 0;
  assets.forEach(a => {
    const qty = parseFloat(a.quantity) || 0;
    const price = a.type === 'cash' ? 1 : parseFloat(a.currentPrice) || parseFloat(a.price) || 0;
    total += qty * price;
  });
  return total;
}
window.getTotalBrokerValue = getTotalBrokerValue;

function getTotalCapitalValue() {
  return getTotalDepositsValue() + getTotalBrokerValue();
}
window.getTotalCapitalValue = getTotalCapitalValue;

function calculateRecentMonthlySurplus(monthsCount = 3) {
  const months = (Cache?.transactions || []).slice(0, monthsCount);
  if (months.length === 0) return 0;

  let totalIncome = 0;
  let totalExpense = 0;

  months.forEach(m => {
    (m.items || []).forEach(tx => {
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

      const val = parseFloat(tx.amount) || 0;
      if (isExpense) totalExpense += val;
      if (isIncome) totalIncome += val;
    });
  });

  return Math.round((totalIncome - totalExpense) / Math.max(1, months.length));
}
window.calculateRecentMonthlySurplus = calculateRecentMonthlySurplus;

function getMonthlyPlannedSavingsTotal() {
  const surplus = calculateRecentMonthlySurplus(3);
  return Math.max(0, surplus);
}
window.getMonthlyPlannedSavingsTotal = getMonthlyPlannedSavingsTotal;

/**
 * Process raw goals into structured model with distinct capital & piggy bank allocations.
 * CRITICAL: Keeps g.saved strictly as the manual piggy bank balance without mutating it into total accumulated!
 */
function processGoals(goals) {
  const totalCapital = getTotalCapitalValue();
  const rawGoals = goals || Cache?.goals || [];

  return rawGoals.map(g => {
    const target = Math.max(0, parseFloat(g.target) || 0);
    const piggyBank = Math.max(0, parseFloat(g.saved) || 0);
    const share = Math.max(0, Math.min(100, parseFloat(g.share) || 0));
    const capitalAlloc = Math.round(totalCapital * (share / 100));
    const totalAccumulated = piggyBank + capitalAlloc;
    const remaining = Math.max(0, target - totalAccumulated);

    const totalVis = Math.max(target, totalAccumulated);
    const progress = target > 0 ? Math.min(100, (totalAccumulated / target) * 100) : 0;
    const capitalPct = totalVis > 0 ? (capitalAlloc / totalVis) * 100 : 0;
    const piggyPct = totalVis > 0 ? (piggyBank / totalVis) * 100 : 0;
    const isAchieved = target > 0 && totalAccumulated >= target;
    const icon = g.icon || getGoalIcon(g.name) || 'target';

    return {
      ...g,
      target,
      saved: piggyBank, // Keep saved strictly as manual piggy bank
      piggyBank,
      capitalAlloc,
      totalAccumulated,
      remaining,
      share,
      progress: progress.toFixed(1),
      capitalPct: Math.min(100, capitalPct).toFixed(1),
      piggyPct: Math.min(100 - Math.min(100, capitalPct), piggyPct).toFixed(1),
      isAchieved,
      icon,
    };
  });
}
window.processGoals = processGoals;

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
window.getGoalIcon = getGoalIcon;

function renderBudgetGoals(goals) {
  const container = document.getElementById('budget-goals-list');
  const surplusEl = document.getElementById('budget-goals-surplus');
  if (!container) return;

  const processedGoals = processGoals(goals || Cache?.goals || []);

  if (surplusEl) {
    surplusEl.innerText = '';
    surplusEl.className = 'hidden';
    surplusEl.style.display = 'none';
  }

  if (processedGoals.length === 0) {
    container.innerHTML = `
      <div class="card rounded-2xl p-5 text-center flex flex-col items-center justify-center gap-2.5 bg-[#0E1016] border border-white/[0.08]">
        <div class="w-10 h-10 rounded-xl bg-[#13251E] border border-[#1E3E32] text-[#34D399] flex items-center justify-center">
          <i data-lucide="target" class="w-5 h-5 text-[#34D399]"></i>
        </div>
        <div>
          <p class="text-sm font-medium text-zinc-200">Целей пока нет</p>
          <p class="text-xs text-zinc-500 mt-0.5">Создайте цель, чтобы направить долю капитала и копить</p>
        </div>
        <button type="button" onclick="openGoalModal()" class="btn-primary px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 active:scale-95 cursor-pointer">
          <i data-lucide="plus" class="w-3.5 h-3.5"></i>
          <span>Создать цель</span>
        </button>
      </div>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  container.innerHTML = processedGoals
    .map(g => {
      const dateSubtitle = g.targetDate
        ? `<p class="text-xs text-zinc-500 mt-0.5">${escapeHtml(g.targetDate)}</p>`
        : '';

      return `
      <div class="card bg-[#0E1016] border border-white/[0.08] hover:border-white/20 rounded-2xl p-4 shadow-sm cursor-pointer relative transition-all"
           data-id="${g.id}"
           data-table="Goals"
           onclick="openEditGoalModal('${g.id}')">
        
        <input type="checkbox" class="select-checkbox hidden" data-id="${g.id}">

        <!-- Шапка: Иконка, название -->
        <div class="flex items-center justify-between mb-3 gap-2">
          <div class="flex items-center gap-3 min-w-0 flex-1">
            <div class="w-10 h-10 rounded-xl bg-[#13251E] border border-[#1E3E32] text-[#34D399] flex items-center justify-center flex-shrink-0">
              <i data-lucide="${g.icon || 'target'}" class="w-5 h-5"></i>
            </div>
            <div class="min-w-0 flex-1">
              <h4 class="text-sm font-semibold text-white truncate">${escapeHtml(g.name)}</h4>
              ${dateSubtitle}
            </div>
          </div>
        </div>

        <!-- Суммы: Всего накоплено / Цель и общий процент -->
        <div class="flex justify-between items-baseline text-xs mb-1.5">
          <span class="text-white font-mono font-semibold text-sm tabular-nums">
            ${formatMoney(g.totalAccumulated)}
            <span class="text-zinc-500 font-normal text-xs">/ ${formatMoney(g.target)}</span>
          </span>
          <span class="text-sm font-mono font-bold text-emerald-400 tabular-nums">${g.progress}%</span>
        </div>

        <!-- Двухцветная шкала прогресса: Капитал (изумрудный) + Копилка (небесно-синий) -->
        <div class="w-full bg-white/[0.06] h-2 rounded-full overflow-hidden flex my-2">
          <div class="bg-emerald-500 h-full transition-all duration-500" style="width: ${g.capitalPct}%" title="Капитал: ${formatMoney(g.capitalAlloc)}"></div>
          <div class="bg-sky-400 h-full transition-all duration-500" style="width: ${g.piggyPct}%" title="Копилка: ${formatMoney(g.piggyBank)}"></div>
        </div>

        <!-- Детализация источников средств -->
        <div class="flex items-center justify-between text-[11px] text-zinc-400 pt-0.5">
          <span class="flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0"></span>
            <span>Капитал: <span class="text-zinc-200 font-mono font-medium">${formatMoney(g.capitalAlloc)}</span></span>
          </span>
          <span class="flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full bg-sky-400 flex-shrink-0"></span>
            <span>Копилка: <span class="text-zinc-200 font-mono font-medium">${formatMoney(g.piggyBank)}</span></span>
          </span>
        </div>
      </div>
    `;
    })
    .join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();
}
window.renderBudgetGoals = renderBudgetGoals;

function openBudgetGoalIconPicker(e) {
  toggleBudgetGoalIconPicker(e);
}
window.openBudgetGoalIconPicker = openBudgetGoalIconPicker;

function toggleBudgetGoalIconPicker(e) {
  if (e) e.stopPropagation();
  const picker = document.getElementById('goal-modal-icon-picker');
  if (!picker) return;

  const isHidden = picker.classList.contains('hidden');
  if (isHidden) {
    renderGoalModalIconGrid();
    picker.classList.remove('hidden');

    setTimeout(() => {
      const handleOutsideGoalIconClick = evt => {
        const p = document.getElementById('goal-modal-icon-picker');
        const btn = document.getElementById('goal-modal-icon-btn');
        if (p && !p.classList.contains('hidden')) {
          if (!p.contains(evt.target) && !btn?.contains(evt.target)) {
            closeBudgetGoalIconPicker();
            document.removeEventListener('click', handleOutsideGoalIconClick);
          }
        } else {
          document.removeEventListener('click', handleOutsideGoalIconClick);
        }
      };
      document.addEventListener('click', handleOutsideGoalIconClick);
    }, 0);
  } else {
    closeBudgetGoalIconPicker();
  }
}
window.toggleBudgetGoalIconPicker = toggleBudgetGoalIconPicker;

function closeBudgetGoalIconPicker() {
  const picker = document.getElementById('goal-modal-icon-picker');
  if (picker) picker.classList.add('hidden');
}
window.closeBudgetGoalIconPicker = closeBudgetGoalIconPicker;

function renderGoalModalIconGrid() {
  const grid = document.getElementById('goal-modal-icon-grid');
  if (!grid) return;
  const currentVal = document.getElementById('goal-icon-input')?.value || 'target';
  const iconsList = window.GOAL_ICONS || [];

  grid.innerHTML = iconsList
    .map(item => {
      const isSelected = currentVal === item.name;
      return `
      <button type="button" 
              onclick="selectGoalIcon('${item.name}')" 
              class="h-10 rounded-xl ${isSelected ? 'bg-white/20 border-white/40 text-white font-bold' : 'hover:bg-white/[0.06] border-transparent text-zinc-400 hover:text-white'} border flex flex-col items-center justify-center p-1 transition-all cursor-pointer group active:scale-95" 
              title="${item.label}">
        <i data-lucide="${item.name}" class="w-4 h-4 group-hover:scale-110 transition-transform"></i>
        <span class="text-[8px] mt-0.5 truncate w-full text-center leading-none ${isSelected ? 'text-white font-semibold' : 'text-zinc-500'}">${item.label}</span>
      </button>
    `;
    })
    .join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();
}
window.renderGoalModalIconGrid = renderGoalModalIconGrid;

function selectGoalIcon(iconName) {
  const input = document.getElementById('goal-icon-input');
  if (input) input.value = iconName;

  const display = document.getElementById('goal-modal-icon-display');
  if (display) {
    display.innerHTML = `<i data-lucide="${iconName}" class="w-5 h-5 text-white"></i>`;
  }

  const isEditing = !!document.getElementById('goal-edit-id')?.value;
  const targetId = isEditing ? document.getElementById('goal-edit-id').value : '__new__';
  const shareIconEl = document.getElementById(`goal-share-icon-${targetId}`);
  if (shareIconEl) {
    shareIconEl.setAttribute('data-lucide', iconName);
  }

  closeBudgetGoalIconPicker();
  if (typeof lucide !== 'undefined') lucide.createIcons();
}
window.selectGoalIcon = selectGoalIcon;

function handleGoalNameInput(name) {
  const currentVal = document.getElementById('goal-icon-input')?.value;
  if (!currentVal || currentVal === 'target') {
    const detected = getGoalIcon(name);
    if (detected && detected !== currentVal) {
      selectGoalIcon(detected);
    }
  }

  const isEditing = !!document.getElementById('goal-edit-id')?.value;
  const targetId = isEditing ? document.getElementById('goal-edit-id').value : '__new__';
  const titleEl = document.getElementById(`goal-share-title-${targetId}`);
  if (titleEl) {
    titleEl.innerText = name?.trim() || (isEditing ? 'Цель' : 'Новая цель');
  }
}
window.handleGoalNameInput = handleGoalNameInput;

/* ========================================================
   SINGLE-GOAL CAPITAL SHARE SLIDER (SLEEK DYNAMIC FILL)
   ======================================================== */
let activeGoalEditingId = null;

function setupGoalSingleShareSlider(goalId) {
  activeGoalEditingId = goalId || '__new__';
  const existingGoals = (Cache?.goals || []).filter(g => g.status !== 'Архив');
  const totalCapital = getTotalCapitalValue();

  tempGoalShares = {};
  existingGoals.forEach(g => {
    tempGoalShares[g.id] = parseFloat(g.share) || 0;
  });

  const otherGoalsSum = existingGoals
    .filter(g => g.id !== goalId)
    .reduce((sum, g) => sum + (tempGoalShares[g.id] || 0), 0);

  const availableShare = Math.max(0, 100 - otherGoalsSum);

  let currentShare = 0;
  if (goalId && tempGoalShares[goalId] !== undefined) {
    currentShare = tempGoalShares[goalId];
  } else {
    currentShare = Math.min(availableShare, availableShare > 0 ? availableShare : 0);
    tempGoalShares['__new__'] = currentShare;
  }

  const slider = document.getElementById('goal-single-share-slider');
  if (slider) {
    slider.value = currentShare;
  }

  const capitalHint = document.getElementById('goal-total-capital-hint');
  if (capitalHint) {
    capitalHint.innerText = `Капитал: ${formatMoney(totalCapital)}`;
  }

  handleGoalSingleShareSlider(currentShare);
}
window.setupGoalSingleShareSlider = setupGoalSingleShareSlider;

function handleGoalSingleShareSlider(val) {
  const targetId = activeGoalEditingId || '__new__';
  const clampedVal = Math.max(0, Math.min(100, Math.round(parseFloat(val) || 0)));
  tempGoalShares[targetId] = clampedVal;

  const totalCapital = getTotalCapitalValue();
  const existingGoals = (Cache?.goals || []).filter(g => g.status !== 'Архив');
  const otherIds = existingGoals.map(g => g.id).filter(id => id !== targetId);
  const otherSum = otherIds.reduce((sum, id) => sum + (tempGoalShares[id] || 0), 0);

  if (clampedVal + otherSum > 100) {
    const overflow = clampedVal + otherSum - 100;
    if (otherSum > 0) {
      let reduced = 0;
      otherIds.forEach((id, idx) => {
        if (idx === otherIds.length - 1) {
          tempGoalShares[id] = Math.max(0, tempGoalShares[id] - (overflow - reduced));
        } else {
          const shareOfOverflow = Math.round((tempGoalShares[id] / otherSum) * overflow);
          tempGoalShares[id] = Math.max(0, tempGoalShares[id] - shareOfOverflow);
          reduced += shareOfOverflow;
        }
      });
    }
  }

  const newOtherSum = otherIds.reduce((sum, id) => sum + (tempGoalShares[id] || 0), 0);
  const freePct = Math.max(0, 100 - (clampedVal + newOtherSum));

  const slider = document.getElementById('goal-single-share-slider');
  if (slider) {
    slider.style.setProperty('--slider-fill', `${clampedVal}%`);
  }

  const pctEl = document.getElementById('goal-single-share-pct');
  if (pctEl) pctEl.innerText = `${clampedVal}%`;

  const rublesEl = document.getElementById('goal-single-share-rubles');
  if (rublesEl) {
    const rublesAlloc = Math.round(totalCapital * (clampedVal / 100));
    rublesEl.innerText = formatMoney(rublesAlloc);
  }

  const freeHint = document.getElementById('goal-single-share-free-hint');
  if (freeHint) {
    freeHint.innerText = `Свободно: ${freePct}%`;
  }
}
window.handleGoalSingleShareSlider = handleGoalSingleShareSlider;

function openGoalModal() {
  document.getElementById('goal-edit-id').value = '';
  document.getElementById('goal-name-input').value = '';
  setFormattedVal('goal-target-input', '');
  setFormattedVal('goal-saved-input', 0);
  document.getElementById('goal-delete-btn').classList.add('hidden');
  document.getElementById('budget-goal-dialog-title').innerText = 'Новая цель';

  const submitBtn = document.getElementById('goal-submit-btn');
  if (submitBtn) submitBtn.innerText = 'Создать цель';

  closeBudgetGoalIconPicker();
  selectGoalIcon('target');

  setupGoalSingleShareSlider(null);

  const dlg = document.getElementById('budget-goal-dialog');
  if (dlg) dlg.classList.remove('hidden');
}
window.openGoalModal = openGoalModal;

function closeGoalModal() {
  const dlg = document.getElementById('budget-goal-dialog');
  if (dlg) dlg.classList.add('hidden');
  closeBudgetGoalIconPicker();
  tempGoalShares = {};
  activeGoalEditingId = null;
  document
    .querySelectorAll('.card[data-table="Goals"].context-active')
    .forEach(el => el.classList.remove('context-active'));
}
window.closeGoalModal = closeGoalModal;

function openEditGoalModal(goalId) {
  if (typeof isSelectionMode === 'function' && isSelectionMode()) return;
  if (window.isSelectionMode && window.isSelectionMode()) return;
  const goal = Cache?.goals?.find(g => g.id === goalId);
  if (!goal) return;

  document
    .querySelectorAll('.card[data-table="Goals"].context-active')
    .forEach(el => el.classList.remove('context-active'));
  const goalCard = document.querySelector(`.card[data-table="Goals"][data-id="${goalId}"]`);
  if (goalCard) goalCard.classList.add('context-active');

  document.getElementById('goal-edit-id').value = goal.id;
  document.getElementById('goal-name-input').value = goal.name;
  setFormattedVal('goal-target-input', goal.target);
  setFormattedVal('goal-saved-input', goal.saved || 0);

  document.getElementById('goal-delete-btn').classList.remove('hidden');
  document.getElementById('budget-goal-dialog-title').innerText = 'Редактировать цель';

  const submitBtn = document.getElementById('goal-submit-btn');
  if (submitBtn) submitBtn.innerText = 'Сохранить';

  closeBudgetGoalIconPicker();
  const initialIcon = goal.icon || getGoalIcon(goal.name) || 'target';
  selectGoalIcon(initialIcon);

  setupGoalSingleShareSlider(goalId);

  const dlg = document.getElementById('budget-goal-dialog');
  if (dlg) dlg.classList.remove('hidden');
}
window.openEditGoalModal = openEditGoalModal;

async function submitBudgetGoal(e) {
  e.preventDefault();
  const editId = document.getElementById('goal-edit-id')?.value;
  const nameInput = document.getElementById('goal-name-input');
  const targetInput = document.getElementById('goal-target-input');
  const name = nameInput?.value.trim();
  const target = getUnformattedVal(targetInput);
  const saved = getUnformattedVal(document.getElementById('goal-saved-input')) || 0;
  const icon = document.getElementById('goal-icon-input')?.value || getGoalIcon(name) || 'target';

  if (!name) {
    if (nameInput) nameInput.focus();
    if (typeof showToast === 'function') showToast('Укажите название цели', true);
    return;
  }
  if (!target || target <= 0) {
    if (targetInput) targetInput.focus();
    if (typeof showToast === 'function') showToast('Укажите целевую сумму', true);
    return;
  }

  const existingGoals = (Cache?.goals || []).filter(g => g.status !== 'Архив');
  const isCreatingNew = !editId;

  const targetKey = editId || '__new__';
  const finalShare =
    tempGoalShares[targetKey] !== undefined
      ? tempGoalShares[targetKey]
      : isCreatingNew
        ? 0
        : parseFloat(existingGoals.find(g => g.id === editId)?.share) || 0;

  const totalCapital = getTotalCapitalValue();
  const capitalAlloc = Math.round(totalCapital * (finalShare / 100));
  const isAchieved = saved + capitalAlloc >= target;

  const goalData = {
    name,
    target,
    saved,
    share: finalShare,
    icon,
    status: isAchieved ? 'Выполнена' : 'В процессе',
    updatedAt: Date.now(),
  };

  // 1. Мгновенно закрываем форму (0мс)
  closeGoalModal();

  // 2. Оптимистично обновляем Cache.goals
  if (!Cache.goals) Cache.goals = [];
  const tempId = editId || 'temp-' + Date.now();
  let targetGoal = editId ? Cache.goals.find(g => g.id === editId) : null;

  if (targetGoal) {
    Object.assign(targetGoal, goalData);
  } else {
    targetGoal = { ...goalData, id: tempId, createdAt: Date.now() };
    Cache.goals.push(targetGoal);
  }

  // Обновляем доли других целей в памяти Cache
  existingGoals.forEach(g => {
    if (g.id !== editId && tempGoalShares[g.id] !== undefined) {
      g.share = tempGoalShares[g.id];
    }
  });

  // Мгновенный перерендер целей
  if (typeof processGoals === 'function') processGoals();
  if (typeof renderBudgetGoals === 'function') renderBudgetGoals();

  // 3. Фоновая синхронизация с Firestore
  (async () => {
    try {
      const col = getUserCol('Goals');
      const batch = db.batch();

      if (editId) {
        batch.update(col.doc(editId), goalData);
      } else {
        const newDocRef = col.doc();
        batch.set(newDocRef, { ...goalData, createdAt: Date.now() });
        targetGoal.id = newDocRef.id;
      }

      existingGoals.forEach(g => {
        if (g.id !== editId && tempGoalShares[g.id] !== undefined) {
          batch.update(col.doc(g.id), {
            share: tempGoalShares[g.id],
            updatedAt: Date.now(),
          });
        }
      });

      await batch.commit();
      fetchAllData(true).catch(() => {});
    } catch (err) {
      console.error('Ошибка сохранения цели:', err);
      if (typeof showToast === 'function') {
        showToast('Ошибка сохранения: ' + err.message, true);
      }
    }
  })();
}
window.submitBudgetGoal = submitBudgetGoal;

async function deleteCurrentEditingGoal() {
  const editId = document.getElementById('goal-edit-id')?.value;
  const name = document.getElementById('goal-name-input')?.value || 'Цель';
  if (!editId) return;
  deleteBudgetGoal(editId, name);
}
window.deleteCurrentEditingGoal = deleteCurrentEditingGoal;

function deleteBudgetGoal(goalId, goalName) {
  showDialog('Удаление цели', `Удалить цель "${goalName}"?`, true, async () => {
    try {
      const batch = db.batch();
      batch.delete(getUserCol('Goals').doc(goalId));

      await batch.commit();
      closeGoalModal();
      await fetchAllData();
    } catch (e) {
      console.error('Ошибка удаления цели:', e);
      showToast('Ошибка удаления', true);
    }
  });
}
window.deleteBudgetGoal = deleteBudgetGoal;
