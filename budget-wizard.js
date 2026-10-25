/**
 * budget-wizard.js
 * First-time budget setup wizard, onboarding flow, and historical averages calculation details.
 */

// Wizard State
let currentWizardStep = 1;
window.currentWizardStep = currentWizardStep;

let wizardActiveIncomeSources = new Set();
window.wizardActiveIncomeSources = wizardActiveIncomeSources;

const wizardCustomCategories = new Set();
window.wizardCustomCategories = wizardCustomCategories;

const wizardExcludedCategories = new Set();
window.wizardExcludedCategories = wizardExcludedCategories;

let wizGoalIcon = null;
window.wizGoalIcon = wizGoalIcon;

window.wizardExcludedTxIds = window.wizardExcludedTxIds || new Set();
window.wizardActiveOtherCategories = window.wizardActiveOtherCategories || new Set();

let wizAvgCurrentContext = null;
let wizAvgSelectedIds = new Set();
const wizAvgCurrentSort = 'date-desc';

const WIZARD_GOAL_ICONS =
  typeof window.GOAL_ICONS !== 'undefined'
    ? window.GOAL_ICONS
    : [
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
        { name: 'key', label: 'Ключи' },
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
window.renderWizardIconGrid = renderWizardIconGrid;

function resetWizGoalIconDisplay() {
  const display = document.getElementById('wiz-goal-icon-display');
  const btn = document.getElementById('wiz-goal-icon-btn');
  const label = document.getElementById('wiz-goal-icon-label');

  if (display) {
    display.className =
      'text-gray-400 group-hover:text-[#727cff] flex items-center justify-center transition-colors';
    display.innerHTML = '<i data-lucide="image-plus" class="w-6 h-6"></i>';
  }
  if (btn) {
    btn.className =
      'w-14 h-14 rounded-2xl bg-[#212430] hover:bg-[#2A2D3C] border border-dashed border-[#727cff]/40 hover:border-[#727cff] flex items-center justify-center transition-all cursor-pointer shadow-inner active:scale-95 group flex-shrink-0';
  }
  if (label) {
    label.innerText = 'Выбрать иконку';
  }
  if (typeof lucide !== 'undefined') lucide.createIcons();
}
window.resetWizGoalIconDisplay = resetWizGoalIconDisplay;

function initBudgetWizard(forceReset = false) {
  const wizardContainer = document.getElementById('budget-wizard');
  const dashboardContainer = document.getElementById('budget-dashboard');

  if (wizardContainer) wizardContainer.classList.remove('hidden');
  if (dashboardContainer) dashboardContainer.classList.add('hidden');

  if (forceReset) {
    localStorage.removeItem('budget_wizard_step');
    currentWizardStep = 1;
    window.currentWizardStep = 1;
  } else {
    const savedStep = parseInt(localStorage.getItem('budget_wizard_step'), 10);
    currentWizardStep = savedStep && savedStep >= 1 && savedStep <= 5 ? savedStep : 1;
    window.currentWizardStep = currentWizardStep;
  }

  const plan = Cache?.budgetPlan || {};
  const incomeInput = document.getElementById('wiz-income-input');
  if (incomeInput && plan.monthlyIncome) {
    incomeInput.value = formatMoney(plan.monthlyIncome);
  }

  const gName = document.getElementById('wiz-goal-name');
  const gTarget = document.getElementById('wiz-goal-target');
  const gSaved = document.getElementById('wiz-goal-saved');
  const hasExistingGoal = Cache?.goals && Cache.goals.length > 0;

  if (forceReset) {
    if (gName) gName.value = '';
    if (gTarget) gTarget.value = '';
    if (gSaved) gSaved.value = '';
    wizGoalIcon = null;
    window.wizGoalIcon = null;
    resetWizGoalIconDisplay();
  } else {
    if (hasExistingGoal) {
      const firstGoal = Cache.goals[0];
      if (gName) gName.value = firstGoal.name || '';
      if (gTarget) gTarget.value = firstGoal.target ? formatMoney(firstGoal.target) : '';
      if (gSaved) gSaved.value = firstGoal.saved ? formatMoney(firstGoal.saved) : '';
      if (firstGoal.icon) {
        selectWizardGoalIcon(firstGoal.icon);
      } else {
        resetWizGoalIconDisplay();
      }
    } else {
      if (gName && !gName.value) gName.value = 'Подушка безопасности';
      if (gTarget && !gTarget.value) gTarget.value = formatMoney(100000);
      if (gSaved && !gSaved.value) gSaved.value = formatMoney(0);
      wizGoalIcon = null;
      window.wizGoalIcon = null;
      resetWizGoalIconDisplay();
    }
  }

  goToWizardStep(currentWizardStep);
}
window.initBudgetWizard = initBudgetWizard;

function openBudgetPlanWizardReview() {
  const dlg = document.getElementById('budget-plan-dialog');
  if (dlg) {
    dlg.classList.add('hidden');
    if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
  }

  const dashboardContainer = document.getElementById('budget-dashboard');
  if (dashboardContainer) dashboardContainer.classList.add('hidden');

  const wizardContainer = document.getElementById('budget-wizard');
  if (wizardContainer) {
    wizardContainer.classList.remove('hidden');
    initBudgetWizard(false);
  }
}
window.openBudgetPlanWizardReview = openBudgetPlanWizardReview;

function goToWizardStep(step) {
  if (step < 1 || step > 5) return;
  currentWizardStep = step;
  window.currentWizardStep = step;
  localStorage.setItem('budget_wizard_step', step);

  for (let i = 1; i <= 5; i++) {
    const stepEl = document.getElementById(`wizard-step-${i}`);
    if (stepEl) {
      if (i === step) {
        stepEl.classList.remove('hidden');
      } else {
        stepEl.classList.add('hidden');
      }
    }

    const indicator = document.getElementById(`wiz-indicator-${i}`);
    if (indicator) {
      if (i <= step) {
        indicator.className = 'w-6 h-1.5 rounded-full bg-[#6C5DD3] transition-all duration-300';
      } else {
        indicator.className = 'w-1.5 h-1.5 rounded-full bg-white/20 transition-all duration-300';
      }
    }
  }

  if (step === 2) {
    renderWizardIncomeSources();
  } else if (step === 3) {
    if (typeof renderWizCalendar === 'function') renderWizCalendar();
  } else if (step === 4) {
    renderWizLimitsEditor();
  } else if (step === 5) {
    calculateAndRenderWizSummary();
    updateWizGoalSlider();
    if (!wizGoalIcon) resetWizGoalIconDisplay();
  }

  const content = document.getElementById('tab-budget');
  if (content) content.scrollTo({ top: 0, behavior: 'smooth' });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}
window.goToWizardStep = goToWizardStep;

function openWizardIconPicker() {
  const picker = document.getElementById('wiz-icon-picker');
  if (!picker) return;
  renderWizardIconGrid();
  picker.classList.remove('hidden');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}
window.openWizardIconPicker = openWizardIconPicker;

function closeWizardIconPicker() {
  const picker = document.getElementById('wiz-icon-picker');
  if (picker) picker.classList.add('hidden');
}
window.closeWizardIconPicker = closeWizardIconPicker;

function selectWizardGoalIcon(icon) {
  wizGoalIcon = icon;
  window.wizGoalIcon = icon;
  const display = document.getElementById('wiz-goal-icon-display');
  const btn = document.getElementById('wiz-goal-icon-btn');
  const label = document.getElementById('wiz-goal-icon-label');
  const found = WIZARD_GOAL_ICONS.find(i => i.name === icon);

  if (display) {
    display.className = 'text-[#727cff] flex items-center justify-center transition-colors';
    display.innerHTML = `<i data-lucide="${icon}" class="w-6 h-6"></i>`;
  }
  if (btn) {
    btn.className =
      'w-14 h-14 rounded-2xl bg-[#6C5DD3]/15 border border-[#6C5DD3]/40 flex items-center justify-center transition-all cursor-pointer shadow-inner active:scale-95 group flex-shrink-0';
  }
  if (label) {
    label.innerText = found ? found.label : 'Выбрать иконку';
  }

  closeWizardIconPicker();
  if (typeof lucide !== 'undefined') lucide.createIcons();
}
window.selectWizardGoalIcon = selectWizardGoalIcon;

function updateWizGoalSlider() {
  const target = getUnformattedVal(document.getElementById('wiz-goal-target'));
  const saved = getUnformattedVal(document.getElementById('wiz-goal-saved'));
  const pct = target > 0 ? Math.min(100, (saved / target) * 100) : 0;

  const bar = document.getElementById('wiz-goal-progress-bar');
  const pctText = document.getElementById('wiz-goal-progress-pct');

  if (bar) bar.style.width = `${pct.toFixed(1)}%`;
  if (pctText) pctText.innerText = `${pct.toFixed(0)}%`;
}
window.updateWizGoalSlider = updateWizGoalSlider;

function recalculateWizardIncome() {
  const checked = document.querySelectorAll('.wiz-income-source-cb:checked');
  let sum = 0;
  checked.forEach(cb => {
    sum += parseFloat(cb.dataset.val) || 0;
  });

  const avgContainer = document.getElementById('wiz-calculated-income-container');
  const avgValEl = document.getElementById('wiz-calculated-income-val');

  if (avgContainer && avgValEl) {
    if (sum > 0) {
      avgValEl.innerText = formatMoney(Math.round(sum));
      avgContainer.classList.remove('hidden');
    } else {
      avgContainer.classList.add('hidden');
    }
  }

  const incomeInput = document.getElementById('wiz-income-input');
  if (incomeInput && (!incomeInput.value || incomeInput.value === '0 ₽')) {
    incomeInput.value = formatMoney(Math.round(sum));
  }
}
window.recalculateWizardIncome = recalculateWizardIncome;

function adoptCalculatedIncome() {
  const avgValEl = document.getElementById('wiz-calculated-income-val');
  const incomeInput = document.getElementById('wiz-income-input');
  if (avgValEl && incomeInput) {
    incomeInput.value = avgValEl.innerText;
  }
}
window.adoptCalculatedIncome = adoptCalculatedIncome;

function renderWizardIncomeSources() {
  const container = document.getElementById('wiz-income-sources-list');
  if (!container) return;

  const sources = calculateHistoricalIncomeForWizard();
  if (sources.length === 0) {
    container.innerHTML =
      '<div class="text-xs text-[#848D99] text-center py-2">Нет истории регулярных доходов в выписках</div>';
    return;
  }

  container.innerHTML = sources
    .map(
      (s, idx) => `
    <label class="flex items-center justify-between p-2.5 rounded-xl bg-[#12151C] border border-[rgba(255,255,255,0.04)] hover:bg-[#181B24] cursor-pointer transition-colors">
      <div class="flex items-center gap-2.5">
        <input type="checkbox" checked onchange="recalculateWizardIncome()" data-val="${s.amount}" class="wiz-income-source-cb w-4 h-4 rounded text-[#6C5DD3] bg-[#212430] border-gray-600 focus:ring-0 cursor-pointer">
        <div>
          <p class="text-xs font-semibold text-gray-200">${escapeHtml(s.name)}</p>
          <p class="text-[10px] text-[#848D99]">${s.frequency}</p>
        </div>
      </div>
      <span class="font-mono text-xs font-bold text-emerald-400">+${formatMoney(s.amount)}</span>
    </label>
  `
    )
    .join('');

  recalculateWizardIncome();
}
window.renderWizardIncomeSources = renderWizardIncomeSources;

function calculateHistoricalIncomeForWizard() {
  return [];
}
window.calculateHistoricalIncomeForWizard = calculateHistoricalIncomeForWizard;

function addAnotherBillFromTooltip() {
  const day = currentWizSelectedDay || window.currentWizSelectedDay || 1;
  const tooltip = document.getElementById('wiz-day-tooltip');
  if (tooltip) tooltip.classList.add('hidden');
  if (typeof openAddBillModal === 'function') openAddBillModal(day);
}
window.addAnotherBillFromTooltip = addAnotherBillFromTooltip;

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
  list.innerHTML = bills
    .map(b => {
      const info =
        typeof getOneTimeBillMonthInfo === 'function'
          ? getOneTimeBillMonthInfo(b, today)
          : { isSpread: false, isOneTime: false };
      return `
      <div class="flex items-center justify-between p-2 rounded-xl bg-[#12151C] border border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)] transition-all">
        <div class="min-w-0 pr-2 cursor-pointer flex-1" onclick="openEditBillModal('${b.id}')">
          <div class="flex items-center gap-1.5 mb-0.5">
            <span class="text-xs font-semibold text-white truncate block">${escapeHtml(b.name)}</span>
            ${
              info.isSpread
                ? `<span class="text-[8px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-0.5 flex-shrink-0 font-medium font-mono"><i data-lucide="split" class="w-2.5 h-2.5"></i>${info.currentStep}/${info.totalSteps}</span>`
                : info.isOneTime
                  ? `<span class="text-[8px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-0.5 flex-shrink-0 font-medium"><i data-lucide="zap" class="w-2.5 h-2.5"></i>Разовый</span>`
                  : `<span class="text-[8px] px-1.5 py-0.2 rounded bg-[#6C5DD3]/20 text-[#a594fd] border border-[#6C5DD3]/30 flex items-center gap-0.5 flex-shrink-0 font-medium">Ежемесячно</span>`
            }
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-[11px] font-mono font-bold text-gray-200">-${formatMoney(b.amount)}</span>
            ${info.isSpread ? `<span class="text-[9px] text-[#848D99] font-mono">из ${formatMoney(b.totalAmount || b.amount * b.spreadMonths)}</span>` : ''}
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
    })
    .join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();

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

  let left = cellLeft + cellWidth / 2 - tooltipWidth / 2;
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
window.showWizDayTooltip = showWizDayTooltip;

function closeWizDayTooltip() {
  const tooltip = document.getElementById('wiz-day-tooltip');
  if (tooltip) tooltip.classList.add('hidden');
  currentWizardStep = 1;
  document
    .querySelectorAll('.wiz-day-cell.is-selected')
    .forEach(el => el.classList.remove('is-selected'));
}
window.closeWizDayTooltip = closeWizDayTooltip;

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
  window.wizardExcludedCategories = window.wizardExcludedCategories || new Set();

  const defaultList = [
    { name: 'Продукты', icon: 'shopping-cart' },
    { name: 'Кафе и рестораны', icon: 'utensils' },
    { name: 'Развлечения', icon: 'gamepad-2' },
  ];

  const userCats = Cache?.categories?.expense || [];
  const extraCats = [];
  wizardCustomCategories.forEach(catName => {
    if (!defaultList.some(d => d.name === catName)) {
      const found = userCats.find(c => (typeof c === 'string' ? c : c?.name) === catName);
      extraCats.push({
        name: catName,
        icon:
          typeof found === 'object' && found.icon
            ? found.icon
            : typeof getCategoryIcon === 'function'
              ? getCategoryIcon(catName)
              : 'tag',
      });
    }
  });

  const fullList = [...defaultList, ...extraCats];

  container.innerHTML = fullList
    .map(c => {
      const avg = avgMap[c.name] || 0;
      const isCustom = !defaultList.some(d => d.name === c.name);

      return `
      <div class="p-2.5 rounded-2xl bg-[#12151C] border border-[rgba(255,255,255,0.04)] flex items-center justify-between gap-3" data-cat-card="${escapeHtml(c.name)}">
        <div class="flex items-center gap-2.5 min-w-0 flex-1">
          <div class="w-8 h-8 rounded-xl bg-[#1E2330] text-[#727cff] flex items-center justify-center flex-shrink-0">
            <i data-lucide="${c.icon}" class="w-4 h-4"></i>
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5">
              <span class="text-xs font-bold text-gray-200 truncate">${escapeHtml(c.name)}</span>
              ${
                isCustom
                  ? `<button type="button" onclick="removeWizardCustomCat('${escapeHtml(c.name)}')" class="text-gray-500 hover:text-[#FF453A] cursor-pointer p-0.5"><i data-lucide="x" class="w-3 h-3"></i></button>`
                  : ''
              }
            </div>
            ${
              avg > 0
                ? `
              <div class="flex items-center gap-1 mt-0.5">
                <div onclick="applyWizCategoryAvg('${escapeHtml(c.name)}', ${avg})" 
                     class="w-[100px] h-6 justify-between text-[10px] py-0.5 px-2 bg-[#6C5DD3]/15 text-[#727cff] hover:bg-[#6C5DD3]/25 border border-[#6C5DD3]/25 rounded-lg whitespace-nowrap flex items-center cursor-pointer transition-all active:scale-95 flex-shrink-0" 
                     title="Нажмите, чтобы применить среднее">
                  <span class="truncate">Ср: ~${formatMoney(avg)}</span>
                  <i data-lucide="arrow-right" class="w-2.5 h-2.5 flex-shrink-0 ml-1"></i>
                </div>
                <button type="button" 
                        onclick="openWizAvgDetailsModal('expense', '${escapeHtml(c.name)}')" 
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
                        onclick="openWizAvgDetailsModal('expense', '${escapeHtml(c.name)}')" 
                        class="w-6 h-6 rounded-lg bg-[#1E2330] hover:bg-[#2A2D3C] text-gray-400 hover:text-white border border-[rgba(255,255,255,0.06)] flex items-center justify-center flex-shrink-0 cursor-pointer transition-colors" 
                        title="Просмотр и выбор транзакций">
                  <i data-lucide="sliders-horizontal" class="w-3 h-3"></i>
                </button>
              </div>
            `
            }
          </div>
        </div>
        <div class="w-[96px] flex-shrink-0">
          <input type="text" 
                 data-wiz-cat="${escapeHtml(c.name)}" 
                 inputmode="numeric" 
                 oninput="formatSumInput(this); fitWizLimitFont(this); updateWizLiveTotal();" 
                 placeholder="0 ₽" 
                 class="w-full bg-[#181B24] border border-[rgba(255,255,255,0.08)] focus:border-[#6C5DD3] text-white text-xs font-bold font-mono rounded-xl p-2 outline-none text-right transition-colors">
        </div>
      </div>
    `;
    })
    .join('');

  updateWizLiveTotal();
  if (typeof lucide !== 'undefined') lucide.createIcons();
}
window.renderWizLimitsEditor = renderWizLimitsEditor;

function openAddCategoryLimitPicker() {
  const dlg = document.getElementById('wiz-category-picker-dialog');
  const listEl = document.getElementById('wiz-category-picker-list');
  if (!dlg || !listEl) return;

  const defaultList = ['Продукты', 'Кафе и рестораны', 'Развлечения'];
  const userCats = (Cache?.categories?.expense || [])
    .map(c => (typeof c === 'string' ? c : c?.name || ''))
    .filter(Boolean);
  const standardCats = ['Маркетплейсы', 'Транспорт', 'Жилье', 'Одежда', 'Здоровье', 'Другое'];
  const allAvailable = Array.from(new Set([...userCats, ...standardCats])).filter(
    c => !defaultList.includes(c) && !wizardCustomCategories.has(c)
  );

  if (allAvailable.length === 0) {
    listEl.innerHTML =
      '<div class="text-xs text-[#848D99] text-center py-4">Все доступные категории уже добавлены</div>';
  } else {
    listEl.innerHTML = allAvailable
      .map(cat => {
        const icon = typeof getCategoryIcon === 'function' ? getCategoryIcon(cat) : 'tag';
        return `
        <button type="button" 
                onclick="handleAddCategoryLimitChoice('${escapeHtml(cat)}')" 
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
window.openAddCategoryLimitPicker = openAddCategoryLimitPicker;

function closeAddCategoryLimitPicker() {
  const dlg = document.getElementById('wiz-category-picker-dialog');
  if (dlg) dlg.classList.add('hidden');
}
window.closeAddCategoryLimitPicker = closeAddCategoryLimitPicker;

function handleAddCategoryLimitChoice(catName) {
  if (catName) {
    addCategoryToWizard(catName);
  }
  closeAddCategoryLimitPicker();
}
window.handleAddCategoryLimitChoice = handleAddCategoryLimitChoice;

function addCategoryToWizard(catName) {
  wizardCustomCategories.add(catName);
  renderWizLimitsEditor();
}
window.addCategoryToWizard = addCategoryToWizard;

function removeWizardCustomCat(catName) {
  wizardCustomCategories.delete(catName);
  renderWizLimitsEditor();
}
window.removeWizardCustomCat = removeWizardCustomCat;

function applyWizCategoryAvg(catName, avg) {
  const inp = document.querySelector(`[data-wiz-cat="${catName}"]`);
  if (inp) {
    inp.value = formatMoney(avg);
    fitWizLimitFont(inp);
    updateWizLiveTotal();
  }
}
window.applyWizCategoryAvg = applyWizCategoryAvg;

function updateWizLiveTotal() {
  const totalEl = document.getElementById('wiz-limits-live-total');
  if (!totalEl) return;

  let total = 0;
  document.querySelectorAll('[data-wiz-cat]').forEach(inp => {
    total += getUnformattedVal(inp) || 0;
  });

  totalEl.innerText = formatMoney(total);
}
window.updateWizLiveTotal = updateWizLiveTotal;

function isBillOrOneTimeTx(tx) {
  return (
    tx.billType === 'onetime' ||
    !!tx.fundingGoalId ||
    (tx.spreadMonths && parseInt(tx.spreadMonths, 10) > 1) ||
    (!tx.isBillPayment && !!tx.excludeFromBudget) ||
    !!tx.isExcludedFromBudget
  );
}
window.isBillOrOneTimeTx = isBillOrOneTimeTx;

function getTxEffectiveTimestamp(tx) {
  if (tx.timestamp && typeof tx.timestamp === 'number') return tx.timestamp;
  const raw = tx.rawDate || tx.date;
  if (raw) {
    const d = typeof parseAnyDate === 'function' ? parseAnyDate(raw) : new Date(raw);
    if (d && !isNaN(d.getTime())) return d.getTime();
  }
  return 0;
}
window.getTxEffectiveTimestamp = getTxEffectiveTimestamp;

function calculateHistoricalCategoryAverages() {
  const allMonths = Cache?.transactions || [];
  if (!allMonths.length) return {};

  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1).getTime();

  const sums = {};
  const activeMonths = new Set();

  allMonths.forEach(m => {
    (m.items || []).forEach(tx => {
      if (tx.type !== 'Расход') return;
      if (isBillOrOneTimeTx(tx)) return;

      const t = getTxEffectiveTimestamp(tx);
      if (t < threeMonthsAgo || t >= currentMonthStart) return;

      const val = parseFloat(tx.amount) || 0;
      if (val <= 0) return;

      const cat = tx.category || 'Прочее';
      sums[cat] = (sums[cat] || 0) + val;

      const d = new Date(t);
      const mKey = `${d.getFullYear()}-${d.getMonth()}`;
      activeMonths.add(mKey);
    });
  });

  const monthsCount = Math.max(1, activeMonths.size);
  const averages = {};
  Object.keys(sums).forEach(cat => {
    averages[cat] = Math.round(sums[cat] / monthsCount);
  });

  return averages;
}
window.calculateHistoricalCategoryAverages = calculateHistoricalCategoryAverages;

function calculateAndRenderWizSummary() {
  const income = getUnformattedVal(document.getElementById('wiz-income-input')) || 0;
  const recurringBills = (Cache?.calendarBills || []).filter(
    b => b.type !== 'onetime' && b.type !== 'Разовый'
  );
  const billsTotal = recurringBills.reduce((acc, b) => acc + (parseFloat(b.amount) || 0), 0);

  let limitsTotal = 0;
  document.querySelectorAll('[data-wiz-cat]').forEach(inp => {
    limitsTotal += getUnformattedVal(inp) || 0;
  });

  const surplus = income - billsTotal - limitsTotal;

  const incEl = document.getElementById('wiz-sum-income');
  const billsEl = document.getElementById('wiz-sum-bills');
  const limitsEl = document.getElementById('wiz-sum-limits');
  const surplusEl = document.getElementById('wiz-sum-surplus');

  if (incEl) incEl.innerText = formatMoney(income);
  if (billsEl) billsEl.innerText = formatMoney(billsTotal);
  if (limitsEl) limitsEl.innerText = formatMoney(limitsTotal);

  if (surplusEl) {
    if (surplus > 0) {
      surplusEl.innerText = `+${formatMoney(surplus)} / мес`;
      surplusEl.className = 'font-mono text-sm sm:text-base font-black text-emerald-400';
    } else if (surplus < 0) {
      surplusEl.innerText = `-${formatMoney(Math.abs(surplus))} / мес`;
      surplusEl.className = 'font-mono text-sm sm:text-base font-black text-[#FF453A]';
    } else {
      surplusEl.innerText = '0 ₽ / мес';
      surplusEl.className = 'font-mono text-sm sm:text-base font-black text-gray-300';
    }
  }

  const goalTarget = getUnformattedVal(document.getElementById('wiz-goal-target')) || 0;
  const goalSaved = getUnformattedVal(document.getElementById('wiz-goal-saved')) || 0;
  const remainingToGoal = Math.max(0, goalTarget - goalSaved);
  const monthsToGoal =
    surplus > 0 && remainingToGoal > 0 ? Math.ceil(remainingToGoal / surplus) : 0;

  const timelineEl = document.getElementById('wiz-sum-goal-timeline');
  if (timelineEl) {
    if (surplus <= 0) {
      timelineEl.innerText = 'Недостижима при текущем дефиците';
      timelineEl.className = 'font-mono text-xs font-semibold text-[#FF453A]';
    } else if (remainingToGoal === 0) {
      timelineEl.innerText = 'Цель уже достигнута!';
      timelineEl.className = 'font-mono text-xs font-semibold text-emerald-400';
    } else {
      const now = new Date();
      const targetDate = new Date(now.getFullYear(), now.getMonth() + monthsToGoal, 1);
      const targetDateStr =
        typeof formatDateStr === 'function' ? formatDateStr(targetDate, 'LLLL yyyy') : '';
      timelineEl.innerText = `~${monthsToGoal} мес. (${targetDateStr})`;
      timelineEl.className = 'font-mono text-xs font-semibold text-gray-200';
    }
  }
}
window.calculateAndRenderWizSummary = calculateAndRenderWizSummary;

async function finishBudgetOnboarding() {
  const goalName =
    document.getElementById('wiz-goal-name')?.value?.trim() || 'Подушка безопасности';
  const goalTarget = getUnformattedVal(document.getElementById('wiz-goal-target')) || 0;
  const goalSaved = getUnformattedVal(document.getElementById('wiz-goal-saved')) || 0;
  const income = getUnformattedVal(document.getElementById('wiz-income-input')) || 0;
  const goalIcon =
    wizGoalIcon || (typeof getGoalIcon === 'function' ? getGoalIcon(goalName) : 'target');

  const categoryLimits = {};
  let limitsTotal = 0;
  document.querySelectorAll('[data-wiz-cat]').forEach(inp => {
    const val = getUnformattedVal(inp);
    if (val > 0) {
      limitsTotal += val;
      categoryLimits[inp.dataset.wizCat] = val;
    }
  });

  const bills = Cache?.calendarBills || [];
  const recurringBills = bills.filter(b => b.type !== 'onetime' && b.type !== 'Разовый');
  const billsTotal = recurringBills.reduce((acc, b) => acc + (parseFloat(b.amount) || 0), 0);
  const varLimit = limitsTotal > 0 ? limitsTotal : Math.max(0, income - billsTotal);

  if (!Cache.budgetPlan) Cache.budgetPlan = {};
  Cache.budgetPlan.isConfigured = true;
  Cache.budgetPlan.monthlyIncome = income;
  Cache.budgetPlan.monthlyVariableLimit = varLimit;
  Cache.budgetPlan.categoryLimits = categoryLimits;
  Cache.budgetPlan.updatedAt = Date.now();

  const existingGoal = Cache.goals && Cache.goals.length > 0 ? Cache.goals[0] : null;
  const goalStatus = goalTarget > 0 && goalSaved >= goalTarget ? 'Выполнена' : 'В процессе';

  let goalObj;
  if (existingGoal) {
    goalObj = {
      ...existingGoal,
      name: goalName,
      target: goalTarget,
      saved: goalSaved,
      icon: goalIcon,
      share: 100,
      status: goalStatus,
      updatedAt: Date.now(),
    };
    Cache.goals[0] = goalObj;
  } else {
    goalObj = {
      id: 'goal_' + Date.now(),
      name: goalName,
      target: goalTarget,
      saved: goalSaved,
      icon: goalIcon,
      share: 100,
      status: goalStatus,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    Cache.goals = [goalObj];
  }

  if (typeof unlockBodyScroll === 'function') unlockBodyScroll(true);
  document.body.classList.remove('modal-open');
  document.body.style.top = '';
  document.body.style.position = '';
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';

  localStorage.removeItem('budget_wizard_step');
  currentWizardStep = 1;
  window.currentWizardStep = 1;

  if (typeof renderBudgetTab === 'function') renderBudgetTab();
  showToast('Бюджет успешно активирован!');

  try {
    const batch = db.batch();
    const goalsCol = getUserCol('Goals');
    const targetGoalRef = existingGoal ? goalsCol.doc(existingGoal.id) : goalsCol.doc(goalObj.id);

    if (existingGoal) {
      batch.update(targetGoalRef, {
        name: goalName,
        target: goalTarget,
        saved: goalSaved,
        icon: goalIcon,
        share: 100,
        status: goalStatus,
        updatedAt: Date.now(),
      });
    } else {
      batch.set(targetGoalRef, goalObj);
    }

    const planRef = getUserCol('BudgetPlan').doc('plan');
    batch.set(
      planRef,
      {
        isConfigured: true,
        monthlyIncome: income,
        monthlyVariableLimit: varLimit,
        categoryLimits: categoryLimits,
        updatedAt: Date.now(),
      },
      { merge: true }
    );

    await batch.commit();
  } catch (err) {
    console.error('Ошибка фонового сохранения бюджета:', err);
  }
}
window.finishBudgetOnboarding = finishBudgetOnboarding;

// ==========================================
// ДЕТАЛИЗАЦИЯ РАСЧЕТА СРЕДНИХ (ШАГ 2 И ШАГ 4)
// ==========================================

function getCanonicalIncomeCategory(cat) {
  if (!cat) return 'Другое';
  const trimmed = String(cat).trim();
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('зарплат') || lower === 'аванс' || lower === 'премия') return 'Зарплата';
  if (lower.includes('кэшб') || lower.includes('кэшбек') || lower.includes('кэшбэк'))
    return 'Кэшбек';
  if (lower.startsWith('возврат')) return 'Возврат';
  if (lower === 'другое' || lower === 'прочее') return 'Другое';
  return trimmed;
}
window.getCanonicalIncomeCategory = getCanonicalIncomeCategory;

function updateWizAvgCatToggleAllButton(activeCount, totalCount) {
  const label = document.getElementById('wiz-avg-cat-toggle-all-label');
  const icon = document.getElementById('wiz-avg-cat-toggle-all-icon');
  if (!label || !icon) return;

  if (activeCount === totalCount && totalCount > 0) {
    label.innerText = 'Снять выбор';
    icon.setAttribute('data-lucide', 'x');
  } else {
    label.innerText = 'Выбрать все';
    icon.setAttribute('data-lucide', 'check-check');
  }
  if (typeof lucide !== 'undefined') lucide.createIcons();
}
window.updateWizAvgCatToggleAllButton = updateWizAvgCatToggleAllButton;

function openWizAvgDetailsModal(type, categoryName, isInitialOpen = true) {
  wizAvgCurrentContext = { type, categoryName };

  const dlg = document.getElementById('wiz-avg-details-dialog');
  const title = document.getElementById('wiz-avg-details-title');
  const catFilterWrap = document.getElementById('wiz-avg-category-filter-wrap');
  const catFilterList = document.getElementById('wiz-avg-category-filter-list');
  const catFilterLabel = document.getElementById('wiz-avg-category-filter-label');
  if (!dlg) return;

  if (title) {
    title.innerText =
      type === 'income' ? 'Доходы: история и среднее' : `Средние траты: ${categoryName}`;
  }

  const allTxs =
    typeof getAllCachedTransactionsFlat === 'function' ? getAllCachedTransactionsFlat() : [];
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1).getTime();

  let detectedCatsList = [];
  const isOtherCat =
    type === 'expense' && (categoryName === 'Прочие расходы' || categoryName === 'Прочие траты');

  if (type === 'income') {
    const detectedIncomeCats = new Set();
    (Cache?.transactions || []).forEach(m => {
      (m.items || []).forEach(tx => {
        if (tx.type === 'Доход') {
          const c = getCanonicalIncomeCategory(tx.category);
          if (c) detectedIncomeCats.add(c);
        }
      });
    });

    if (isInitialOpen || !wizardActiveIncomeSources) {
      wizardActiveIncomeSources = new Set(detectedIncomeCats);
      window.wizardActiveIncomeSources = wizardActiveIncomeSources;
    } else {
      const normalizedSet = new Set();
      wizardActiveIncomeSources.forEach(s => normalizedSet.add(getCanonicalIncomeCategory(s)));
      wizardActiveIncomeSources = normalizedSet;
      window.wizardActiveIncomeSources = wizardActiveIncomeSources;
    }

    detectedCatsList = Array.from(detectedIncomeCats);
    const activeCount = detectedCatsList.filter(c => wizardActiveIncomeSources.has(c)).length;

    if (catFilterWrap) catFilterWrap.classList.remove('hidden');
    if (catFilterLabel) {
      catFilterLabel.innerText =
        activeCount === detectedCatsList.length
          ? 'Все доходы'
          : `Доходы (${activeCount}/${detectedCatsList.length})`;
    }
    updateWizAvgCatToggleAllButton(activeCount, detectedCatsList.length);

    if (catFilterList) {
      catFilterList.innerHTML = detectedCatsList
        .map(cat => {
          const isActive = wizardActiveIncomeSources.has(cat);
          const icon = typeof getCategoryIcon === 'function' ? getCategoryIcon(cat) : 'wallet';
          return `
          <button type="button" 
                  onclick="toggleWizAvgIncomeCategory('${escapeHtml(cat)}', event)" 
                  class="w-full p-2 rounded-xl flex items-center justify-between text-left transition-colors cursor-pointer ${isActive ? 'bg-[#6C5DD3]/20 text-white' : 'hover:bg-[#212430] text-gray-400'}">
            <div class="flex items-center gap-2 min-w-0 flex-1">
              <i data-lucide="${icon}" class="w-3.5 h-3.5 text-[#727cff] flex-shrink-0"></i>
              <span class="text-xs font-semibold truncate">${escapeHtml(cat)}</span>
            </div>
            <div class="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${isActive ? 'bg-[#6C5DD3] border-[#6C5DD3] text-white' : 'border-gray-600'}">
              ${isActive ? '<i data-lucide="check" class="w-3 h-3 stroke-[3]"></i>' : ''}
            </div>
          </button>
        `;
        })
        .join('');
    }
  } else if (isOtherCat) {
    const isWizardStep4 =
      document.getElementById('wizard-step-4')?.classList.contains('hidden') === false;
    let mainAssignedCategories = new Set();

    if (isWizardStep4) {
      mainAssignedCategories = new Set([
        'Продукты',
        'Кафе и рестораны',
        'Развлечения',
        ...wizardCustomCategories,
      ]);
    } else {
      const plan = Cache?.budgetPlan || {};
      const currentLimits = plan.categoryLimits || {};
      const assigned = Object.keys(currentLimits).filter(
        k =>
          k !== 'Прочие расходы' && k !== 'Прочие траты' && (parseFloat(currentLimits[k]) || 0) > 0
      );
      mainAssignedCategories = new Set(assigned);
    }

    const detectedOtherCats = new Set();
    allTxs.forEach(tx => {
      if (tx.type !== 'Расход') return;
      if (isBillOrOneTimeTx(tx)) return;
      const t = getTxEffectiveTimestamp(tx);
      if (t < threeMonthsAgo || t >= currentMonthStart) return;

      const cat = tx.category || 'Прочее';
      if (!mainAssignedCategories.has(cat)) {
        detectedOtherCats.add(cat);
      }
    });

    detectedCatsList = Array.from(detectedOtherCats);

    if (isInitialOpen || window.wizardActiveOtherCategories.size === 0) {
      window.wizardActiveOtherCategories = new Set(detectedCatsList);
    }

    const activeCount = detectedCatsList.filter(c =>
      window.wizardActiveOtherCategories.has(c)
    ).length;

    if (catFilterWrap) catFilterWrap.classList.remove('hidden');
    if (catFilterLabel) {
      catFilterLabel.innerText =
        activeCount === detectedCatsList.length
          ? 'Все категории трат'
          : `Категории (${activeCount}/${detectedCatsList.length})`;
    }
    updateWizAvgCatToggleAllButton(activeCount, detectedCatsList.length);

    if (catFilterList) {
      catFilterList.innerHTML = detectedCatsList
        .map(cat => {
          const isActive = window.wizardActiveOtherCategories.has(cat);
          const icon = typeof getCategoryIcon === 'function' ? getCategoryIcon(cat) : 'tag';
          return `
          <button type="button" 
                  onclick="toggleWizAvgOtherCategory('${escapeHtml(cat)}', event)" 
                  class="w-full p-2 rounded-xl flex items-center justify-between text-left transition-colors cursor-pointer ${isActive ? 'bg-[#6C5DD3]/20 text-white' : 'hover:bg-[#212430] text-gray-400'}">
            <div class="flex items-center gap-2 min-w-0 flex-1">
              <i data-lucide="${icon}" class="w-3.5 h-3.5 text-[#727cff] flex-shrink-0"></i>
              <span class="text-xs font-semibold truncate">${escapeHtml(cat)}</span>
            </div>
            <div class="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${isActive ? 'bg-[#6C5DD3] border-[#6C5DD3] text-white' : 'border-gray-600'}">
              ${isActive ? '<i data-lucide="check" class="w-3 h-3 stroke-[3]"></i>' : ''}
            </div>
          </button>
        `;
        })
        .join('');
    }
  } else {
    if (catFilterWrap) catFilterWrap.classList.add('hidden');
  }

  const txs = [];
  allTxs.forEach((tx, idx) => {
    const isMatchingType = type === 'income' ? tx.type === 'Доход' : tx.type === 'Расход';
    if (!isMatchingType) return;
    if (type === 'expense' && isBillOrOneTimeTx(tx)) return;

    const t = getTxEffectiveTimestamp(tx);
    if (t < threeMonthsAgo || t >= currentMonthStart) return;

    const amt = parseFloat(tx.amount) || 0;
    if (amt <= 0) return;

    if (type === 'income') {
      const canonical = getCanonicalIncomeCategory(tx.category);
      if (!wizardActiveIncomeSources.has(canonical)) return;
    } else {
      if (isOtherCat) {
        const cat = tx.category || 'Прочее';
        if (!window.wizardActiveOtherCategories.has(cat)) return;
      } else {
        if (tx.category !== categoryName) return;
      }
    }

    const uid = tx.id ? String(tx.id) : `idx_${t}_${amt}_${idx}`;
    txs.push({ ...tx, _uid: uid });
  });

  if (isInitialOpen) {
    wizAvgSelectedIds = new Set();
    txs.forEach(t => {
      if (!window.wizardExcludedTxIds.has(t._uid)) {
        wizAvgSelectedIds.add(t._uid);
      }
    });
  }

  wizAvgCurrentContext.txs = txs;
  renderWizAvgTxList();
  recalculateWizAvgModal();

  dlg.classList.remove('hidden');
  if (typeof lockBodyScroll === 'function') lockBodyScroll();
  if (typeof lucide !== 'undefined') lucide.createIcons();
}
window.openWizAvgDetailsModal = openWizAvgDetailsModal;

function renderWizAvgTxList() {
  const listEl = document.getElementById('wiz-avg-tx-list');
  if (!listEl || !wizAvgCurrentContext) return;

  const txs = [...(wizAvgCurrentContext.txs || [])];

  if (wizAvgCurrentSort === 'date-desc') {
    txs.sort((a, b) => getTxEffectiveTimestamp(b) - getTxEffectiveTimestamp(a));
  } else if (wizAvgCurrentSort === 'date-asc') {
    txs.sort((a, b) => getTxEffectiveTimestamp(a) - getTxEffectiveTimestamp(b));
  } else if (wizAvgCurrentSort === 'amount-desc') {
    txs.sort((a, b) => (parseFloat(b.amount) || 0) - (parseFloat(a.amount) || 0));
  } else if (wizAvgCurrentSort === 'amount-asc') {
    txs.sort((a, b) => (parseFloat(a.amount) || 0) - (parseFloat(b.amount) || 0));
  }

  if (txs.length === 0) {
    listEl.innerHTML =
      '<div class="text-xs text-[#848D99] text-center py-6">Операций за выбранный период нет</div>';
    return;
  }

  listEl.innerHTML = txs
    .map(t => {
      const isSelected = wizAvgSelectedIds.has(t._uid);
      const isIncome = wizAvgCurrentContext.type === 'income';
      const icon =
        typeof getCategoryIcon === 'function'
          ? getCategoryIcon(t.category)
          : isIncome
            ? 'wallet'
            : 'shopping-bag';
      const dateFormatted = t.formattedDate || t.rawDate || t.date || '';

      return `
      <div onclick="wizAvgToggleTx('${t._uid}')" 
           class="p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2.5 ${isSelected ? 'bg-[#181B24] border-[rgba(255,255,255,0.08)]' : 'bg-[#12151C]/60 border-[rgba(255,255,255,0.03)] opacity-40'}">
        <div class="flex items-center gap-2.5 min-w-0 flex-1">
          <div class="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-[#6C5DD3] border-[#6C5DD3] text-white' : 'border-gray-600'}">
            ${isSelected ? '<i data-lucide="check" class="w-3 h-3 stroke-[3]"></i>' : ''}
          </div>
          <div class="w-7 h-7 rounded-lg bg-[#212430] flex items-center justify-center text-[#727cff] flex-shrink-0">
            <i data-lucide="${icon}" class="w-3.5 h-3.5"></i>
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-xs font-semibold text-gray-200 truncate">${escapeHtml(t.comment || t.merchant || t.category || 'Операция')}</p>
            <p class="text-[10px] text-[#848D99]">${dateFormatted}</p>
          </div>
        </div>
        <span class="font-mono text-xs font-bold ${isIncome ? 'text-emerald-400' : 'text-white'} flex-shrink-0">
          ${isIncome ? '+' : '-'}${formatMoney(t.amount)}
        </span>
      </div>
    `;
    })
    .join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();
}
window.renderWizAvgTxList = renderWizAvgTxList;

function closeWizAvgDetailsModal() {
  const dlg = document.getElementById('wiz-avg-details-dialog');
  if (dlg) {
    dlg.classList.add('hidden');
    if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
  }
}
window.closeWizAvgDetailsModal = closeWizAvgDetailsModal;

function wizAvgToggleTx(uid) {
  if (wizAvgSelectedIds.has(uid)) {
    wizAvgSelectedIds.delete(uid);
    window.wizardExcludedTxIds.add(uid);
  } else {
    wizAvgSelectedIds.add(uid);
    window.wizardExcludedTxIds.delete(uid);
  }
  renderWizAvgTxList();
  recalculateWizAvgModal();
}
window.wizAvgToggleTx = wizAvgToggleTx;

function updateWizAvgToggleAllButton() {
  const label = document.getElementById('wiz-avg-toggle-all-label');
  const icon = document.getElementById('wiz-avg-toggle-all-icon');
  if (!label || !icon || !wizAvgCurrentContext) return;

  const total = (wizAvgCurrentContext.txs || []).length;
  const selected = wizAvgSelectedIds.size;

  if (selected === total && total > 0) {
    label.innerText = 'Снять выбор';
    icon.setAttribute('data-lucide', 'x');
  } else {
    label.innerText = 'Выбрать все';
    icon.setAttribute('data-lucide', 'check-check');
  }
  if (typeof lucide !== 'undefined') lucide.createIcons();
}
window.updateWizAvgToggleAllButton = updateWizAvgToggleAllButton;

function wizAvgToggleSelectAll() {
  if (!wizAvgCurrentContext) return;
  const total = (wizAvgCurrentContext.txs || []).length;
  const selected = wizAvgSelectedIds.size;
  wizAvgSelectAll(selected < total);
}
window.wizAvgToggleSelectAll = wizAvgToggleSelectAll;

function wizAvgSelectAll(selectAll) {
  if (!wizAvgCurrentContext) return;
  const txs = wizAvgCurrentContext.txs || [];

  if (selectAll) {
    txs.forEach(t => {
      wizAvgSelectedIds.add(t._uid);
      window.wizardExcludedTxIds.delete(t._uid);
    });
  } else {
    txs.forEach(t => {
      wizAvgSelectedIds.delete(t._uid);
      window.wizardExcludedTxIds.add(t._uid);
    });
  }

  renderWizAvgTxList();
  recalculateWizAvgModal();
}
window.wizAvgSelectAll = wizAvgSelectAll;

function recalculateWizAvgModal() {
  if (!wizAvgCurrentContext) return;
  const txs = wizAvgCurrentContext.txs || [];

  let sum = 0;
  const activeMonths = new Set();

  txs.forEach(t => {
    if (wizAvgSelectedIds.has(t._uid)) {
      const val = parseFloat(t.amount) || 0;
      sum += val;
      const ts = getTxEffectiveTimestamp(t);
      if (ts > 0) {
        const d = new Date(ts);
        activeMonths.add(`${d.getFullYear()}-${d.getMonth()}`);
      }
    }
  });

  const monthsCount = Math.max(1, activeMonths.size);
  const avg = Math.round(sum / monthsCount);

  const avgValEl = document.getElementById('wiz-avg-modal-val');
  const countEl = document.getElementById('wiz-avg-modal-count');

  if (avgValEl) avgValEl.innerText = formatMoney(avg);
  if (countEl)
    countEl.innerText = `Выбрано ${wizAvgSelectedIds.size} из ${txs.length} операций (активных месяцев: ${monthsCount})`;

  updateWizAvgToggleAllButton();
}
window.recalculateWizAvgModal = recalculateWizAvgModal;

function toggleWizAvgIncomeCategory(catName, e) {
  if (e) e.stopPropagation();
  if (wizardActiveIncomeSources.has(catName)) {
    wizardActiveIncomeSources.delete(catName);
  } else {
    wizardActiveIncomeSources.add(catName);
  }
  openWizAvgDetailsModal('income', 'Доходы', false);
}
window.toggleWizAvgIncomeCategory = toggleWizAvgIncomeCategory;

function toggleWizAvgOtherCategory(catName, e) {
  if (e) e.stopPropagation();
  if (window.wizardActiveOtherCategories.has(catName)) {
    window.wizardActiveOtherCategories.delete(catName);
  } else {
    window.wizardActiveOtherCategories.add(catName);
  }
  openWizAvgDetailsModal('expense', 'Прочие расходы', false);
}
window.toggleWizAvgOtherCategory = toggleWizAvgOtherCategory;

function applyWizAvgDetailsResult() {
  if (!wizAvgCurrentContext) return;
  const avgValEl = document.getElementById('wiz-avg-modal-val');
  const avg = avgValEl ? getUnformattedVal(avgValEl) : 0;

  if (wizAvgCurrentContext.type === 'expense') {
    applyWizCategoryAvg(wizAvgCurrentContext.categoryName, avg);
  } else {
    const incInput = document.getElementById('wiz-income-input');
    if (incInput) incInput.value = formatMoney(avg);
  }

  closeWizAvgDetailsModal();
}
window.applyWizAvgDetailsResult = applyWizAvgDetailsResult;
