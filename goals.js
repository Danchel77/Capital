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
let activeTopupGoalId = null;
let currentTopupMode = 'add';
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
      const statusText = g.isAchieved
        ? '<span class="text-emerald-400 font-medium">Цель достигнута</span>'
        : '<span class="text-zinc-500 font-medium text-xs">В процессе накопления</span>';

      return `
      <div class="card bg-[#0E1016] border border-white/[0.08] hover:border-white/20 rounded-2xl p-4 shadow-sm cursor-pointer relative transition-all"
           data-id="${g.id}"
           data-table="Goals"
           onclick="openEditGoalModal('${g.id}')">
        
        <input type="checkbox" class="select-checkbox hidden" data-id="${g.id}">

        <!-- Шапка: Иконка, название, статус и быстрая кнопка копилки -->
        <div class="flex items-center justify-between mb-3 gap-2">
          <div class="flex items-center gap-3 min-w-0 flex-1">
            <div class="w-10 h-10 rounded-xl bg-[#13251E] border border-[#1E3E32] text-[#34D399] flex items-center justify-center flex-shrink-0">
              <i data-lucide="${g.icon || 'target'}" class="w-5 h-5"></i>
            </div>
            <div class="min-w-0 flex-1">
              <h4 class="text-sm font-semibold text-white truncate">${escapeHtml(g.name)}</h4>
              <p class="text-xs text-zinc-400 mt-0.5">${statusText}</p>
            </div>
          </div>
          
          <button type="button" 
                  onclick="event.stopPropagation(); openGoalTopupModal('${g.id}', '${escapeHtml(g.name)}')" 
                  class="p-2 rounded-xl bg-white/[0.04] hover:bg-white/10 text-zinc-400 hover:text-white transition-all cursor-pointer active:scale-95 flex-shrink-0"
                  title="Копилка цели">
            <i data-lucide="wallet" class="w-4 h-4 text-sky-400"></i>
          </button>
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
            <span>Капитал (${g.share}%): <span class="text-zinc-200 font-mono font-medium">${formatMoney(g.capitalAlloc)}</span></span>
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

/**
 * Render multi-goal capital shares manager inside creation/edit dialog.
 * Allows setting shares 0..100% per goal with total <= 100%.
 */
function renderGoalSharesManagerList(currentEditingId = null) {
  const container = document.getElementById('goal-shares-list');
  const section = document.getElementById('goal-shares-manager-section');
  if (!container || !section) return;

  const existingGoals = (Cache?.goals || []).filter(g => g.status !== 'Архив');
  const isCreatingNew = !currentEditingId;

  section.classList.remove('hidden');

  const list = [];
  const currentNameInput = document.getElementById('goal-name-input')?.value?.trim();
  const currentIconInput = document.getElementById('goal-icon-input')?.value || 'target';

  if (isCreatingNew) {
    list.push({
      id: '__new__',
      name: currentNameInput || 'Новая цель',
      icon: currentIconInput,
      isCurrent: true,
    });
  }

  existingGoals.forEach(g => {
    if (g.id === currentEditingId) {
      list.push({
        id: g.id,
        name: currentNameInput || g.name || 'Цель',
        icon: currentIconInput || g.icon || 'target',
        isCurrent: true,
      });
    } else {
      list.push({
        id: g.id,
        name: g.name || 'Цель',
        icon: g.icon || 'target',
        isCurrent: false,
      });
    }
  });

  const listIds = list.map(item => item.id);
  const isFullyInit = listIds.every(id => typeof tempGoalShares[id] === 'number');

  if (!isFullyInit) {
    tempGoalShares = {};
    if (isCreatingNew) {
      const sumExisting = existingGoals.reduce((s, g) => s + (parseFloat(g.share) || 0), 0);
      const freeRemaining = Math.max(0, 100 - sumExisting);
      tempGoalShares['__new__'] = freeRemaining > 0 ? freeRemaining : Math.round(100 / list.length);

      existingGoals.forEach(g => {
        tempGoalShares[g.id] = parseFloat(g.share) || 0;
      });

      // If initial sum > 100, normalize
      const totalInitial = Object.values(tempGoalShares).reduce((a, b) => a + b, 0);
      if (totalInitial > 100) {
        normalizeTempGoalShares('__new__');
      }
    } else {
      existingGoals.forEach(g => {
        tempGoalShares[g.id] = parseFloat(g.share) || 0;
      });
    }
  }

  const totalCapital = getTotalCapitalValue();

  container.innerHTML = list
    .map(item => {
      const shareVal = tempGoalShares[item.id] !== undefined ? tempGoalShares[item.id] : 0;
      const capitalAmount = Math.round(totalCapital * (shareVal / 100));

      return `
      <div class="py-2.5 border-b border-white/[0.06] last:border-b-0 space-y-2" data-share-goal-id="${item.id}">
        <div class="flex items-center justify-between text-xs">
          <div class="flex items-center gap-2 min-w-0 flex-1 mr-2">
            <div class="w-6 h-6 rounded-lg bg-white/[0.05] text-zinc-300 flex items-center justify-center flex-shrink-0">
              <i data-lucide="${item.icon}" class="w-3.5 h-3.5" id="goal-share-icon-${item.id}"></i>
            </div>
            <span class="font-medium text-xs text-white truncate" id="goal-share-title-${item.id}">
              ${escapeHtml(item.name)}
            </span>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            <span class="text-[11px] font-mono text-zinc-400" id="goal-share-amount-${item.id}">
              ${formatMoney(capitalAmount)}
            </span>
            <span class="font-mono font-bold text-xs text-white bg-white/10 px-2 py-0.5 rounded-lg border border-white/15" id="goal-share-val-${item.id}">
              ${shareVal}%
            </span>
          </div>
        </div>
        <div class="flex items-center pt-0.5">
          <input type="range" 
                 min="0" 
                 max="100" 
                 step="1" 
                 value="${shareVal}" 
                 id="goal-share-slider-${item.id}"
                 oninput="handleGoalShareSliderChange('${item.id}', parseFloat(this.value))"
                 class="goal-share-slider w-full cursor-pointer">
        </div>
      </div>
    `;
    })
    .join('');

  updateGoalSharesUI();
  if (typeof lucide !== 'undefined') lucide.createIcons();
}
window.renderGoalSharesManagerList = renderGoalSharesManagerList;

function normalizeTempGoalShares(targetLockedId = null) {
  const ids = Object.keys(tempGoalShares);
  const total = ids.reduce((s, id) => s + (tempGoalShares[id] || 0), 0);
  if (total <= 100) return;

  const overflow = total - 100;
  const otherIds = targetLockedId ? ids.filter(id => id !== targetLockedId) : ids;
  const currentOthersSum = otherIds.reduce((sum, id) => sum + (tempGoalShares[id] || 0), 0);

  if (currentOthersSum > 0) {
    let reduced = 0;
    otherIds.forEach((id, idx) => {
      if (idx === otherIds.length - 1) {
        tempGoalShares[id] = Math.max(0, tempGoalShares[id] - (overflow - reduced));
      } else {
        const shareOfOverflow = Math.round((tempGoalShares[id] / currentOthersSum) * overflow);
        tempGoalShares[id] = Math.max(0, tempGoalShares[id] - shareOfOverflow);
        reduced += shareOfOverflow;
      }
    });
  }
}

function handleGoalShareSliderChange(targetId, newShareVal) {
  const ids = Object.keys(tempGoalShares);
  const clampedVal = Math.max(0, Math.min(100, Math.round(newShareVal)));
  tempGoalShares[targetId] = clampedVal;

  const otherIds = ids.filter(id => id !== targetId);
  const currentOthersSum = otherIds.reduce((sum, id) => sum + (tempGoalShares[id] || 0), 0);
  const total = clampedVal + currentOthersSum;

  if (total > 100) {
    const overflow = total - 100;
    if (currentOthersSum > 0) {
      let reduced = 0;
      otherIds.forEach((id, idx) => {
        if (idx === otherIds.length - 1) {
          tempGoalShares[id] = Math.max(0, tempGoalShares[id] - (overflow - reduced));
        } else {
          const shareOfOverflow = Math.round((tempGoalShares[id] / currentOthersSum) * overflow);
          tempGoalShares[id] = Math.max(0, tempGoalShares[id] - shareOfOverflow);
          reduced += shareOfOverflow;
        }
      });
    }
  }

  updateGoalSharesUI();
}
window.handleGoalShareSliderChange = handleGoalShareSliderChange;

function updateGoalSharesUI() {
  const totalCapital = getTotalCapitalValue();
  const ids = Object.keys(tempGoalShares);

  let totalAllocatedShare = 0;
  ids.forEach(id => {
    const val = tempGoalShares[id] || 0;
    totalAllocatedShare += val;

    const valEl = document.getElementById(`goal-share-val-${id}`);
    if (valEl) valEl.innerText = `${val}%`;

    const sliderEl = document.getElementById(`goal-share-slider-${id}`);
    if (sliderEl && parseFloat(sliderEl.value) !== val) {
      sliderEl.value = val;
    }

    const amountEl = document.getElementById(`goal-share-amount-${id}`);
    if (amountEl) {
      const amount = Math.round(totalCapital * (val / 100));
      amountEl.innerText = formatMoney(amount);
    }
  });

  const freeIndicator = document.getElementById('goal-shares-free-indicator');
  if (freeIndicator) {
    const freePct = Math.max(0, 100 - totalAllocatedShare);
    const freeAmount = Math.round(totalCapital * (freePct / 100));
    if (freePct > 0) {
      freeIndicator.innerHTML = `Свободно: <span class="text-emerald-400 font-semibold">${freePct}%</span> (${formatMoney(freeAmount)})`;
    } else {
      freeIndicator.innerHTML = '';
    }
  }
}
window.updateGoalSharesUI = updateGoalSharesUI;

function openGoalModal() {
  document.getElementById('goal-edit-id').value = '';
  document.getElementById('goal-name-input').value = '';
  document.getElementById('goal-target-input').value = '';
  document.getElementById('goal-saved-input').value = '';
  document.getElementById('goal-delete-btn').classList.add('hidden');
  document.getElementById('budget-goal-dialog-title').innerText = 'Новая цель';

  const submitBtn = document.getElementById('goal-submit-btn');
  if (submitBtn) submitBtn.innerText = 'Создать цель';

  closeBudgetGoalIconPicker();
  selectGoalIcon('target');

  tempGoalShares = {};
  renderGoalSharesManagerList(null);

  const dlg = document.getElementById('budget-goal-dialog');
  if (dlg) dlg.classList.remove('hidden');
}
window.openGoalModal = openGoalModal;

function closeGoalModal() {
  const dlg = document.getElementById('budget-goal-dialog');
  if (dlg) dlg.classList.add('hidden');
  closeBudgetGoalIconPicker();
  tempGoalShares = {};
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

  tempGoalShares = {};
  renderGoalSharesManagerList(goalId);

  const dlg = document.getElementById('budget-goal-dialog');
  if (dlg) dlg.classList.remove('hidden');
}
window.openEditGoalModal = openEditGoalModal;

async function submitBudgetGoal(e) {
  e.preventDefault();
  const editId = document.getElementById('goal-edit-id').value;
  const name = document.getElementById('goal-name-input').value.trim();
  const target = getUnformattedVal(document.getElementById('goal-target-input'));
  const saved = getUnformattedVal(document.getElementById('goal-saved-input'));
  const icon = document.getElementById('goal-icon-input')?.value || getGoalIcon(name) || 'target';

  if (!name || !target) return;

  const existingGoals = (Cache?.goals || []).filter(g => g.status !== 'Архив');
  const isCreatingNew = !editId;

  const finalShare = isCreatingNew
    ? tempGoalShares['__new__'] !== undefined
      ? tempGoalShares['__new__']
      : 100
    : tempGoalShares[editId] !== undefined
      ? tempGoalShares[editId]
      : parseFloat(existingGoals.find(g => g.id === editId)?.share) || 100;

  const totalCapital = getTotalCapitalValue();
  const capitalAlloc = Math.round(totalCapital * (finalShare / 100));
  const isAchieved = saved + capitalAlloc >= target;

  try {
    const col = getUserCol('Goals');
    const batch = db.batch();

    const goalData = {
      name,
      target,
      saved, // Strictly the piggy bank balance
      share: finalShare,
      icon,
      status: isAchieved ? 'Выполнена' : 'В процессе',
      updatedAt: Date.now(),
    };

    if (editId) {
      batch.update(col.doc(editId), goalData);
    } else {
      const newDocRef = col.doc();
      batch.set(newDocRef, { ...goalData, createdAt: Date.now() });
    }

    // Save other goals' adjusted shares
    existingGoals.forEach(g => {
      if (g.id !== editId && tempGoalShares[g.id] !== undefined) {
        batch.update(col.doc(g.id), {
          share: tempGoalShares[g.id],
          updatedAt: Date.now(),
        });
      }
    });

    await batch.commit();
    closeGoalModal();
    await fetchAllData();
    showToast(editId ? 'Цель обновлена' : 'Цель создана');
  } catch (err) {
    console.error('Ошибка сохранения цели:', err);
    showToast('Ошибка: ' + err.message, true);
  }
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
      showToast('Цель удалена');
    } catch (e) {
      console.error('Ошибка удаления цели:', e);
      showToast('Ошибка удаления', true);
    }
  });
}
window.deleteBudgetGoal = deleteBudgetGoal;

/**
 * Piggy bank modal controls
 */
function openGoalTopupModal(goalId, goalName) {
  document
    .querySelectorAll('.card[data-table="Goals"].context-active')
    .forEach(el => el.classList.remove('context-active'));
  const goalCard = document.querySelector(`.card[data-table="Goals"][data-id="${goalId}"]`);
  if (goalCard) goalCard.classList.add('context-active');

  activeTopupGoalId = goalId;
  const dlg = document.getElementById('goal-topup-dialog');
  const title = document.getElementById('goal-topup-title');
  if (title) title.innerText = goalName || 'Копилка цели';

  const goal = Cache?.goals?.find(g => g.id === goalId);
  const currentPiggy = parseFloat(goal?.saved) || 0;
  const balanceEl = document.getElementById('goal-topup-current-balance');
  if (balanceEl) balanceEl.innerText = formatMoney(currentPiggy);

  document.getElementById('goal-topup-amount').value = '';
  const noteEl = document.getElementById('goal-topup-preview-note');
  if (noteEl) noteEl.innerHTML = '';

  setTopupMode('add');
  if (dlg) dlg.classList.remove('hidden');
}
window.openGoalTopupModal = openGoalTopupModal;

function closeGoalTopupModal() {
  const dlg = document.getElementById('goal-topup-dialog');
  if (dlg) dlg.classList.add('hidden');
  document
    .querySelectorAll('.card[data-table="Goals"].context-active')
    .forEach(el => el.classList.remove('context-active'));
  activeTopupGoalId = null;
}
window.closeGoalTopupModal = closeGoalTopupModal;

function setTopupMode(mode) {
  currentTopupMode = mode;
  const addBtn = document.getElementById('tab-topup-add');
  const subBtn = document.getElementById('tab-topup-sub');
  const submitBtn = document.getElementById('goal-topup-submit-btn');
  if (!addBtn || !subBtn) return;

  if (mode === 'add') {
    addBtn.className =
      'py-1.5 rounded-lg text-xs font-semibold bg-white/10 text-white border border-white/15 transition-all cursor-pointer';
    subBtn.className =
      'py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-white border border-transparent transition-all cursor-pointer';
    if (submitBtn) submitBtn.innerText = 'Пополнить';
  } else {
    subBtn.className =
      'py-1.5 rounded-lg text-xs font-semibold bg-white/10 text-white border border-white/15 transition-all cursor-pointer';
    addBtn.className =
      'py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-white border border-transparent transition-all cursor-pointer';
    if (submitBtn) submitBtn.innerText = 'Снять';
  }

  handleGoalTopupAmountInput();
}
window.setTopupMode = setTopupMode;

function handleGoalTopupAmountInput() {
  if (!activeTopupGoalId) return;
  const goal = Cache?.goals?.find(g => g.id === activeTopupGoalId);
  const currentPiggy = parseFloat(goal?.saved) || 0;
  const amount = getUnformattedVal(document.getElementById('goal-topup-amount')) || 0;
  const noteEl = document.getElementById('goal-topup-preview-note');
  const submitBtn = document.getElementById('goal-topup-submit-btn');

  if (!noteEl) return;

  if (amount <= 0) {
    noteEl.innerHTML = '';
    if (submitBtn) submitBtn.disabled = false;
    return;
  }

  if (currentTopupMode === 'add') {
    const newTotal = currentPiggy + amount;
    noteEl.innerHTML = `Станет в копилке: <span class="text-emerald-400 font-semibold">${formatMoney(newTotal)}</span>`;
    if (submitBtn) submitBtn.disabled = false;
  } else {
    if (amount > currentPiggy) {
      noteEl.innerHTML = `<span class="text-[#F43F5E] font-medium">Нельзя снять больше, чем есть в копилке</span>`;
      if (submitBtn) submitBtn.disabled = true;
    } else {
      const newTotal = currentPiggy - amount;
      noteEl.innerHTML = `Останется в копилке: <span class="text-zinc-300 font-semibold">${formatMoney(newTotal)}</span>`;
      if (submitBtn) submitBtn.disabled = false;
    }
  }
}
window.handleGoalTopupAmountInput = handleGoalTopupAmountInput;

async function submitGoalTopup() {
  if (!activeTopupGoalId) return;
  const amount = getUnformattedVal(document.getElementById('goal-topup-amount'));
  if (!amount || amount <= 0) return;

  const goal = Cache?.goals?.find(g => g.id === activeTopupGoalId);
  if (!goal) return;

  const currentPiggy = parseFloat(goal.saved) || 0;
  let newSaved = currentPiggy;

  if (currentTopupMode === 'add') {
    newSaved = currentPiggy + amount;
  } else {
    if (amount > currentPiggy) {
      showToast('Нельзя снять больше, чем есть в копилке', true);
      return;
    }
    newSaved = Math.max(0, currentPiggy - amount);
  }

  try {
    await getUserCol('Goals').doc(activeTopupGoalId).update({
      saved: newSaved,
      updatedAt: Date.now(),
    });

    closeGoalTopupModal();
    await fetchAllData();
    showToast(currentTopupMode === 'add' ? 'Копилка пополнена' : 'Средства выведены');
  } catch (err) {
    console.error('Ошибка изменения копилки цели:', err);
    showToast('Ошибка: ' + err.message, true);
  }
}
window.submitGoalTopup = submitGoalTopup;
