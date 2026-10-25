/**
 * goals.js
 * Financial goals, piggy banks, shares allocation, and savings flow animations.
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
let currentTopupMode = 'topup';
let tempGoalShares = {};

const GOAL_SHARE_TOTAL_VIRTUAL = 1000;

function getGoalShareWeight(share) {
  return share % 5 === 0 ? 2.5 : 1.0;
}

const GOAL_SHARE_INTERVALS = (() => {
  let totalW = 0;
  for (let s = 1; s <= 99; s++) {
    totalW += getGoalShareWeight(s);
  }
  const intervals = [];
  let currentPos = 0;
  for (let s = 1; s <= 99; s++) {
    const w = getGoalShareWeight(s);
    const start = currentPos;
    const end = currentPos + (w / totalW) * GOAL_SHARE_TOTAL_VIRTUAL;
    intervals.push({ share: s, start, end, center: (start + end) / 2 });
    currentPos = end;
  }
  return intervals;
})();

function virtualPosToShare(pos) {
  const p = Math.max(0, Math.min(GOAL_SHARE_TOTAL_VIRTUAL, pos));
  for (let i = 0; i < GOAL_SHARE_INTERVALS.length; i++) {
    if (p >= GOAL_SHARE_INTERVALS[i].start && p <= GOAL_SHARE_INTERVALS[i].end) {
      return GOAL_SHARE_INTERVALS[i].share;
    }
  }
  return p < GOAL_SHARE_INTERVALS[0].start ? 1 : 99;
}

function shareToVirtualPos(share) {
  const s = Math.max(1, Math.min(99, Math.round(share)));
  const found = GOAL_SHARE_INTERVALS.find(item => item.share === s);
  return found ? found.center : (s / 100) * GOAL_SHARE_TOTAL_VIRTUAL;
}

function getMonthlyPlannedSavingsTotal() {
  const plan = Cache?.budgetPlan || {};
  if (!plan.isConfigured) return 0;

  const income = parseFloat(plan.income || plan.monthlyIncome) || 0;
  const bills = Cache?.calendarBills || [];
  const recurringBills = bills.filter(b => b.type !== 'onetime' && b.type !== 'Разовый');
  const billsTotal = recurringBills.reduce((acc, b) => acc + (parseFloat(b.amount) || 0), 0);

  const limits = plan.categoryLimits || {};
  const limitsTotal = Object.values(limits).reduce((acc, val) => acc + (parseFloat(val) || 0), 0);

  return Math.max(0, income - billsTotal - limitsTotal);
}
window.getMonthlyPlannedSavingsTotal = getMonthlyPlannedSavingsTotal;

function processGoals(goals) {
  return (goals || []).map(g => {
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
      isAchieved: tar > 0 && sav >= tar,
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

function renderBudgetGoals(goals, plan, bills, targetDate) {
  const container = document.getElementById('budget-goals-list');
  const surplusEl = document.getElementById('budget-goals-surplus');
  if (!container) return;

  const currentSelectedDate =
    targetDate ||
    (typeof getSelectedBudgetDate === 'function' ? getSelectedBudgetDate() : new Date());
  const monthlyIncome = plan?.monthlyIncome || 0;
  const monthlyLimit = plan?.monthlyVariableLimit || 0;
  const activeBills = (bills || []).filter(b => {
    return typeof getOneTimeBillMonthInfo === 'function'
      ? getOneTimeBillMonthInfo(b, currentSelectedDate).isActive
      : true;
  });
  const totalBills = activeBills.reduce((s, b) => {
    return (
      s +
      (typeof getEffectiveBillAmount === 'function'
        ? getEffectiveBillAmount(b, currentSelectedDate)
        : parseFloat(b.amount) || 0)
    );
  }, 0);
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

  if (!goals || goals.length === 0) {
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

  const activeDeposits = (Cache?.deposits || []).filter(d => !d.isClosed);

  container.innerHTML = goals
    .map(g => {
      const goalMonthlyAlloc = Math.round(netSurplus * (g.share / 100));
      const linkedDeposits = activeDeposits.filter(d => d.goalId === g.id);
      const monthlyDepInterest = Math.round(
        linkedDeposits.reduce((sum, d) => sum + (d.amount * (d.rate / 100)) / 12, 0)
      );
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
      let badgeClass =
        'bg-[#212430] text-[#848D99] hover:bg-[#2A2D3C] border-[rgba(255,255,255,0.06)]';
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
                  <b class="font-mono ${goalMonthlyAlloc < 0 ? 'text-[#FF453A]' : goalMonthlyAlloc > 0 ? 'text-[#30D158]' : 'text-gray-300'}">
                    ${goalMonthlyAlloc < 0 ? '-' : goalMonthlyAlloc > 0 ? '+' : ''}${formatMoney(Math.abs(goalMonthlyAlloc))}
                  </b>
                </div>
                <div class="flex justify-between text-gray-400">
                  <span>Со вкладов:</span>
                  <b class="${monthlyDepInterest > 0 ? 'text-[#30D158]' : 'text-gray-400'} font-mono">+${formatMoney(monthlyDepInterest)}</b>
                </div>
              </div>
              ${
                monthsNeeded > 0
                  ? `
                <div class="pt-1 border-t border-[rgba(255,255,255,0.06)] text-[9px] text-[#848D99]">
                  Срок достижения: ~${monthsNeeded} мес.
                </div>
              `
                  : totalMonthlyGrowth < 0
                    ? `
                <div class="pt-1 border-t border-[rgba(255,255,255,0.06)] text-[9px] text-[#FF453A]">
                  При текущем дефиците цель недостижима
                </div>
              `
                    : ''
              }
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
    })
    .join('');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}
window.renderBudgetGoals = renderBudgetGoals;

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
    window._hasOpenGoalPaceTooltips = true;
    current.classList.remove('hidden');
    const card = current.closest('.card');
    if (card) card.style.zIndex = '50';

    const trigger =
      (event && (event.currentTarget || event.target?.closest('.goal-pace-badge'))) ||
      current.parentElement?.querySelector('.goal-pace-badge');
    const rect = trigger ? trigger.getBoundingClientRect() : null;
    const tooltipHeight = current.offsetHeight || 135;

    if (rect && rect.top < tooltipHeight + 16) {
      current.classList.remove('bottom-full', 'mb-2');
      current.classList.add('top-full', 'mt-2');
    } else {
      current.classList.remove('top-full', 'mt-2');
      current.classList.add('bottom-full', 'mb-2');
    }
  } else {
    window._hasOpenGoalPaceTooltips = false;
  }
}
window.toggleGoalPaceTooltip = toggleGoalPaceTooltip;

function hideGoalPaceTooltips() {
  if (!window._hasOpenGoalPaceTooltips) return;
  const visibleTooltips = document.querySelectorAll('.goal-pace-tooltip:not(.hidden)');
  if (visibleTooltips.length > 0) {
    visibleTooltips.forEach(el => {
      el.classList.add('hidden');
      const card = el.closest('.card');
      if (card) card.style.zIndex = '';
    });
  }
  window._hasOpenGoalPaceTooltips = false;
}
window.hideGoalPaceTooltips = hideGoalPaceTooltips;

// Event listeners for closing tooltips on outer click or scroll
if (typeof document !== 'undefined') {
  document.addEventListener('click', e => {
    const target = e?.target?.nodeType === 3 ? e.target.parentElement : e?.target;
    if (
      target &&
      typeof target.closest === 'function' &&
      !target.closest('.goal-pace-tooltip') &&
      !target.closest('.goal-pace-badge')
    ) {
      hideGoalPaceTooltips();
    }
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('scroll', hideGoalPaceTooltips, { passive: true, capture: true });
}

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
              class="h-10 rounded-xl ${isSelected ? 'bg-[#6C5DD3]/25 border-[#6C5DD3] text-[#727cff]' : 'hover:bg-[#212430] border-transparent text-gray-300 hover:text-white'} border flex flex-col items-center justify-center p-1 transition-all cursor-pointer group active:scale-95" 
              title="${item.label}">
        <i data-lucide="${item.name}" class="w-4 h-4 group-hover:scale-110 transition-transform"></i>
        <span class="text-[8px] mt-0.5 truncate w-full text-center leading-none ${isSelected ? 'text-[#727cff] font-bold' : 'text-[#848D99]'}">${item.label}</span>
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
  const btn = document.getElementById('goal-modal-icon-btn');
  const label = document.getElementById('goal-modal-icon-label');
  const iconsList = window.GOAL_ICONS || [];
  const found = iconsList.find(i => i.name === iconName);

  if (display) {
    display.className = 'text-[#727cff] flex items-center justify-center transition-colors';
    display.innerHTML = `<i data-lucide="${iconName}" class="w-6 h-6"></i>`;
  }
  if (btn) {
    btn.className =
      'w-14 h-14 rounded-2xl bg-[#6C5DD3]/15 border border-[#6C5DD3]/40 flex items-center justify-center transition-all cursor-pointer shadow-inner active:scale-95 group flex-shrink-0';
  }
  if (label) {
    label.innerText = found ? found.label : 'Выбрать иконку';
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

function renderGoalSharesManagerList(currentEditingId = null) {
  const container = document.getElementById('goal-shares-list');
  const section = document.getElementById('goal-shares-manager-section');
  if (!container || !section) return;

  const existingGoals = (Cache?.goals || []).filter(g => g.status !== 'Архив');
  const isCreatingNew = !currentEditingId;
  const totalCount = isCreatingNew ? existingGoals.length + 1 : existingGoals.length;

  if (totalCount <= 1) {
    section.classList.add('hidden');
    tempGoalShares = {};
    if (isCreatingNew) {
      tempGoalShares['__new__'] = 100;
    } else if (existingGoals[0]) {
      tempGoalShares[existingGoals[0].id] = 100;
    }
    return;
  }

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
      const defaultNewShare = Math.round(100 / list.length);
      tempGoalShares['__new__'] = defaultNewShare;
      const remaining = 100 - defaultNewShare;
      const sumExisting = existingGoals.reduce((s, g) => s + (parseFloat(g.share) || 0), 0) || 100;
      let acc = 0;
      existingGoals.forEach((g, idx) => {
        if (idx === existingGoals.length - 1) {
          tempGoalShares[g.id] = Math.max(1, remaining - acc);
        } else {
          const s = Math.max(
            1,
            Math.round(
              ((parseFloat(g.share) || 100 / existingGoals.length) / sumExisting) * remaining
            )
          );
          tempGoalShares[g.id] = s;
          acc += s;
        }
      });
    } else {
      const sumShares = existingGoals.reduce((s, g) => s + (parseFloat(g.share) || 0), 0) || 100;
      let acc = 0;
      existingGoals.forEach((g, idx) => {
        if (idx === existingGoals.length - 1) {
          tempGoalShares[g.id] = Math.max(1, 100 - acc);
        } else {
          const s = Math.max(
            1,
            Math.round(((parseFloat(g.share) || 100 / existingGoals.length) / sumShares) * 100)
          );
          tempGoalShares[g.id] = s;
          acc += s;
        }
      });
    }
    normalizeTempGoalShares();
  }

  const plannedSavingsTotal = getMonthlyPlannedSavingsTotal();
  const totalMonthlyEl = document.getElementById('goal-shares-total-monthly');
  if (totalMonthlyEl) {
    if (plannedSavingsTotal > 0) {
      totalMonthlyEl.innerText = `План: +${formatMoney(plannedSavingsTotal)}/мес`;
      totalMonthlyEl.classList.remove('hidden');
    } else {
      totalMonthlyEl.classList.add('hidden');
    }
  }

  container.innerHTML = list
    .map(item => {
      const shareVal = tempGoalShares[item.id] !== undefined ? tempGoalShares[item.id] : 0;
      const plannedAmount =
        plannedSavingsTotal > 0 ? Math.round(plannedSavingsTotal * (shareVal / 100)) : 0;
      const amountBadgeHtml =
        plannedSavingsTotal > 0
          ? `
      <span class="text-[10px] font-mono font-bold text-[#30D158]" id="goal-share-amount-${item.id}">
        +${formatMoney(plannedAmount)}/мес
      </span>
    `
          : '';

      return `
      <div class="px-3 py-2 rounded-xl bg-[#12151C] border border-[rgba(255,255,255,0.04)] space-y-1.5" data-share-goal-id="${item.id}">
        <div class="flex items-center justify-between text-xs">
          <div class="flex items-center gap-2 min-w-0 flex-1 mr-2">
            <div class="w-5 h-5 rounded-lg bg-[#1E2330] text-[#8C7DFF] flex items-center justify-center flex-shrink-0">
              <i data-lucide="${item.icon}" class="w-3 h-3" id="goal-share-icon-${item.id}"></i>
            </div>
            <span class="font-bold text-xs text-gray-200 truncate" id="goal-share-title-${item.id}">
              ${escapeHtml(item.name)}
            </span>
          </div>
          <div class="flex items-center gap-1.5 flex-shrink-0">
            ${amountBadgeHtml}
            <span class="font-mono font-bold text-xs text-[#8C7DFF] bg-[#6C5DD3]/15 px-2 py-0.5 rounded-lg border border-[#6C5DD3]/20" id="goal-share-val-${item.id}">
              ${shareVal}%
            </span>
          </div>
        </div>
        <div class="flex items-center pt-0.5">
          <input type="range" 
                 min="0" 
                 max="1000" 
                 step="1" 
                 value="${shareToVirtualPos(shareVal)}" 
                 oninput="handleGoalShareVirtualSliderChange('${item.id}', parseFloat(this.value))"
                 class="goal-share-slider w-full cursor-pointer">
        </div>
      </div>
    `;
    })
    .join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();
}
window.renderGoalSharesManagerList = renderGoalSharesManagerList;

function normalizeTempGoalShares(targetLockedId = null) {
  const ids = Object.keys(tempGoalShares);
  if (ids.length === 0) return;
  if (ids.length === 1) {
    tempGoalShares[ids[0]] = 100;
    return;
  }

  const total = ids.reduce((s, id) => s + (tempGoalShares[id] || 0), 0);
  const diff = 100 - total;
  if (diff !== 0) {
    const adjustableIds = targetLockedId ? ids.filter(id => id !== targetLockedId) : ids;
    if (adjustableIds.length > 0) {
      tempGoalShares[adjustableIds[0]] = Math.max(1, tempGoalShares[adjustableIds[0]] + diff);
    } else {
      tempGoalShares[ids[0]] = Math.max(1, tempGoalShares[ids[0]] + diff);
    }
  }
}

function handleGoalShareVirtualSliderChange(targetId, virtualPos) {
  const ids = Object.keys(tempGoalShares);
  if (ids.length <= 1) return;

  const newShare = virtualPosToShare(virtualPos);
  const clampedVal = Math.max(1, Math.min(99, newShare));
  if (tempGoalShares[targetId] === clampedVal) return;

  tempGoalShares[targetId] = clampedVal;

  const otherIds = ids.filter(id => id !== targetId);
  const remaining = 100 - clampedVal;
  const currentOthersSum = otherIds.reduce((sum, id) => sum + (tempGoalShares[id] || 0), 0);

  if (currentOthersSum > 0) {
    let allocated = 0;
    otherIds.forEach((id, index) => {
      if (index === otherIds.length - 1) {
        tempGoalShares[id] = Math.max(1, remaining - allocated);
      } else {
        const proportional = Math.max(
          1,
          Math.round((tempGoalShares[id] / currentOthersSum) * remaining)
        );
        tempGoalShares[id] = proportional;
        allocated += proportional;
      }
    });
  } else {
    const equalShare = Math.floor(remaining / otherIds.length);
    let allocated = 0;
    otherIds.forEach((id, index) => {
      if (index === otherIds.length - 1) {
        tempGoalShares[id] = Math.max(1, remaining - allocated);
      } else {
        tempGoalShares[id] = Math.max(1, equalShare);
        allocated += equalShare;
      }
    });
  }

  normalizeTempGoalShares(targetId);

  const plannedSavingsTotal = getMonthlyPlannedSavingsTotal();

  ids.forEach(id => {
    const valEl = document.getElementById(`goal-share-val-${id}`);
    const amountEl = document.getElementById(`goal-share-amount-${id}`);
    const slider = document.querySelector(`[data-share-goal-id="${id}"] input[type="range"]`);
    if (valEl) valEl.innerText = `${tempGoalShares[id]}%`;
    if (amountEl && plannedSavingsTotal > 0) {
      const plannedAmount = Math.round(plannedSavingsTotal * (tempGoalShares[id] / 100));
      amountEl.innerText = `+${formatMoney(plannedAmount)}/мес`;
    }
    if (slider && id !== targetId) {
      slider.value = shareToVirtualPos(tempGoalShares[id]);
    }
  });
}
window.handleGoalShareVirtualSliderChange = handleGoalShareVirtualSliderChange;
window.handleGoalShareSliderChange = handleGoalShareVirtualSliderChange;

function openGoalModal() {
  const form = document.getElementById('budget-goal-form');
  if (form) form.reset();

  document.getElementById('goal-edit-id').value = '';
  document.getElementById('goal-delete-btn').classList.add('hidden');
  document.getElementById('budget-goal-dialog-title').innerText = 'Новая цель';

  closeBudgetGoalIconPicker();
  selectGoalIcon('target');
  const addGoalBtn = document.getElementById('goal-modal-icon-btn');
  if (addGoalBtn) {
    addGoalBtn.className =
      'w-14 h-14 rounded-2xl bg-[#12151C] hover:bg-[#212430] border border-dashed border-[#727cff]/40 hover:border-[#727cff] flex items-center justify-center transition-all cursor-pointer shadow-inner active:scale-95 group flex-shrink-0';
  }

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
  setFormattedVal('goal-saved-input', goal.saved);
  document.getElementById('goal-delete-btn').classList.remove('hidden');
  document.getElementById('budget-goal-dialog-title').innerText = 'Редактировать цель';

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
  const totalCount = isCreatingNew ? existingGoals.length + 1 : existingGoals.length;

  let finalShare = 100;
  if (totalCount > 1) {
    normalizeTempGoalShares();
    finalShare = isCreatingNew ? tempGoalShares['__new__'] || 100 : tempGoalShares[editId] || 100;
  }

  try {
    const col = getUserCol('Goals');
    const batch = db.batch();

    const goalData = {
      name,
      target,
      saved,
      share: finalShare,
      icon,
      status: saved >= target ? 'Выполнена' : 'В процессе',
      updatedAt: Date.now(),
    };

    if (editId) {
      batch.update(col.doc(editId), goalData);
    } else {
      const newDocRef = col.doc();
      batch.set(newDocRef, { ...goalData, createdAt: Date.now() });
    }

    if (totalCount > 1) {
      existingGoals.forEach(g => {
        if (g.id !== editId && tempGoalShares[g.id] !== undefined) {
          batch.update(col.doc(g.id), {
            share: tempGoalShares[g.id],
            updatedAt: Date.now(),
          });
        }
      });
    }

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
  showDialog(
    'Удаление цели',
    `Удалить цель "${goalName}"? Накопленный прогресс будет удален.`,
    true,
    async () => {
      try {
        const batch = db.batch();
        batch.delete(getUserCol('Goals').doc(goalId));

        const remainingGoals = (Cache?.goals || []).filter(
          g => g.id !== goalId && g.status !== 'Архив'
        );
        if (remainingGoals.length === 1) {
          batch.update(getUserCol('Goals').doc(remainingGoals[0].id), {
            share: 100,
            updatedAt: Date.now(),
          });
        } else if (remainingGoals.length > 1) {
          const sumShares =
            remainingGoals.reduce((s, g) => s + (parseFloat(g.share) || 0), 0) || 100;
          let acc = 0;
          remainingGoals.forEach((g, idx) => {
            let newShare;
            if (idx === remainingGoals.length - 1) {
              newShare = Math.max(1, 100 - acc);
            } else {
              newShare = Math.max(
                1,
                Math.round(((parseFloat(g.share) || 100 / remainingGoals.length) / sumShares) * 100)
              );
              acc += newShare;
            }
            batch.update(getUserCol('Goals').doc(g.id), {
              share: newShare,
              updatedAt: Date.now(),
            });
          });
        }

        await batch.commit();
        closeGoalModal();
        await fetchAllData();
        showToast('Цель удалена');
      } catch (e) {
        console.error('Ошибка удаления цели:', e);
        showToast('Ошибка удаления', true);
      }
    }
  );
}
window.deleteBudgetGoal = deleteBudgetGoal;

function openGoalTopupModal(goalId, goalName) {
  document
    .querySelectorAll('.card[data-table="Goals"].context-active')
    .forEach(el => el.classList.remove('context-active'));
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
  if (!addBtn || !subBtn) return;
  if (mode === 'add') {
    addBtn.className =
      'flex-1 py-1.5 rounded-lg font-semibold bg-[#212430] text-white transition-all';
    subBtn.className =
      'flex-1 py-1.5 rounded-lg font-medium text-[#848D99] hover:text-white transition-all';
  } else {
    subBtn.className =
      'flex-1 py-1.5 rounded-lg font-semibold bg-[#212430] text-white transition-all';
    addBtn.className =
      'flex-1 py-1.5 rounded-lg font-medium text-[#848D99] hover:text-white transition-all';
  }
}
window.setTopupMode = setTopupMode;

async function submitGoalTopup() {
  if (!activeTopupGoalId) return;
  const amount = getUnformattedVal(document.getElementById('goal-topup-amount'));
  if (!amount) return;

  const goal = Cache?.goals?.find(g => g.id === activeTopupGoalId);
  if (!goal) return;

  const newSaved =
    currentTopupMode === 'add' ? goal.saved + amount : Math.max(0, goal.saved - amount);

  try {
    await getUserCol('Goals').doc(activeTopupGoalId).update({ saved: newSaved });
    closeGoalTopupModal();
    await fetchAllData();
  } catch (err) {
    showToast('Ошибка: ' + err.message, true);
  }
}
window.submitGoalTopup = submitGoalTopup;

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
        ${goalIncrements
          .map(g => {
            const oldPct =
              g.target > 0 ? Math.min(100, Math.round((g.oldSaved / g.target) * 100)) : 0;
            const newPct =
              g.target > 0 ? Math.min(100, Math.round((g.newSaved / g.target) * 100)) : 0;
            const isInc = g.changeAmount > 0;
            const diffStr = isInc
              ? `+${formatMoney(g.changeAmount)}`
              : `-${formatMoney(Math.abs(g.changeAmount))}`;

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
          })
          .join('')}
      </div>
    `;
  } else {
    goalsListHtml = `
      <div class="w-full p-3 rounded-2xl bg-[#12151C] border border-[rgba(255,255,255,0.06)] my-3 text-center">
        <p class="text-xs text-gray-400 leading-relaxed">
          ${
            isNegative
              ? 'Активных целей для списания дефицита нет. Баланс целей не изменился.'
              : 'У вас пока нет активных финансовых целей для автоматического зачисления сбережений.'
          }
        </p>
      </div>
    `;
  }

  if (isPositive) {
    card.className =
      'bg-[#181B24]/95 border border-emerald-500/40 rounded-3xl p-5 shadow-2xl backdrop-blur-xl flex flex-col items-center text-center max-w-sm w-full mx-4 transform scale-100 transition-all duration-300 pointer-events-auto border-emerald-500/30';
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
      
      <div class="w-full my-2.5 p-3 rounded-2xl bg-[#12151C] border border-[#6C5DD3]/25 flex items-start gap-2.5 text-left">
        <div class="w-7 h-7 rounded-xl bg-[#6C5DD3]/20 flex items-center justify-center text-[#8C7DFF] flex-shrink-0 mt-0.5">
          <i data-lucide="piggy-bank" class="w-4 h-4"></i>
        </div>
        <div class="text-[11px] leading-relaxed text-gray-300 flex-1 min-w-0">
          <span class="font-bold text-white block mb-0.5">Совет по накоплениям</span>
          Средства можно положить на вклад или накопительный счет — так вы быстрее сможете достичь поставленных целей!
        </div>
      </div>

      <button type="button" onclick="closeGoalFlowAnimationOverlay()" class="w-full mt-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all active:scale-95 cursor-pointer">
        Отлично!
      </button>
    `;
  } else if (isNegative) {
    card.className =
      'bg-[#181B24]/95 border border-red-500/40 rounded-3xl p-5 shadow-2xl backdrop-blur-xl flex flex-col items-center text-center max-w-sm w-full mx-4 transform scale-100 transition-all duration-300 pointer-events-auto border-red-500/30';
    card.innerHTML = `
      <div class="w-14 h-14 rounded-2xl bg-gradient-to-tr from-red-500/20 to-rose-500/20 border border-red-500/40 flex items-center justify-center text-[#FF453A] mb-2 shadow-lg">
        <i data-lucide="trending-down" class="w-7 h-7"></i>
      </div>
      <h3 class="text-base font-black text-white tracking-tight">Корректировка накоплений</h3>
      <p class="text-2xl font-black font-mono text-[#FF453A] my-1">-${formatMoney(Math.abs(amount))}</p>
      <p class="text-[11px] text-[#848D99] leading-tight">
        Из-за дефицита бюджета сумма автоматически вычтена из целей в соответствии с выставленными долями.
      </p>
      ${goalsListHtml}
      <p class="text-[10px] text-gray-400 mt-1 italic leading-tight">
        При необходимости вы можете скорректировать баланс целей в разделе «Вклады и Цели».
      </p>
      <button type="button" onclick="closeGoalFlowAnimationOverlay()" class="w-full mt-3 py-2.5 rounded-xl bg-[#212430] hover:bg-[#2A2D3C] text-gray-200 font-bold text-xs border border-[rgba(255,255,255,0.08)] transition-all active:scale-95 cursor-pointer">
        Понятно
      </button>
    `;
  } else {
    card.className =
      'bg-[#181B24]/95 border border-[rgba(255,255,255,0.1)] rounded-3xl p-5 shadow-2xl backdrop-blur-xl flex flex-col items-center text-center max-w-sm w-full mx-4 transform scale-100 transition-all duration-300 pointer-events-auto';
    card.innerHTML = `
      <div class="w-14 h-14 rounded-2xl bg-[#212430] border border-[rgba(255,255,255,0.08)] flex items-center justify-center text-gray-300 mb-2 shadow-lg">
        <i data-lucide="check-circle-2" class="w-7 h-7 text-[#30D158]"></i>
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
  }, 18000);
}
window.playGoalFlowAnimation = playGoalFlowAnimation;

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
