/**
 * apk-features.js - Модуль нативных возможностей и виджетов для Android APK
 * 
 * Включает:
 * 1. Определение нативной платформы (APK Capacitor vs PWA vs Browser).
 * 2. Расчет и фоновую синхронизацию данных для виджетов домашнего экрана смартфона.
 * 3. Два переработанных варианта виджета:
 *    - Полный (4x2): единая бесшовная карточка, недельный и месячный остаток без обрезания цифр + быстрый расход.
 *    - Компактный (2x2): крупный остаток месяца с круговым прогрессом.
 * 4. Окно добавления виджетов (без лишних кнопок и инструкций) с прямым системным закреплением.
 * 5. Всплывающая шторка-предложение (только для нативного APK).
 * 6. Фоновый перехват push-уведомлений банков (Сбер, Т-Банк, Яндекс Пэй, Альфа и др.) и авто-внесение трат.
 */

// 1. Проверка окружения (APK / Native vs PWA vs Браузер)
function isNativeAppPlatform() {
  if (typeof window === 'undefined') return false;
  if (window._forceNativeApp === true) return true;
  if (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function') {
    try {
      return window.Capacitor.isNativePlatform() === true;
    } catch (_) {
      return false;
    }
  }
  if (typeof location !== 'undefined' && (location.protocol === 'capacitor:' || location.protocol === 'ionic:')) {
    return true;
  }
  return false;
}

function isPwaStandalone() {
  if (typeof window === 'undefined') return false;
  try {
    return !!(
      window.matchMedia?.('(display-mode: standalone)')?.matches ||
      window.matchMedia?.('(display-mode: fullscreen)')?.matches ||
      window.navigator.standalone === true ||
      (document.referrer && document.referrer.includes('android-app://'))
    );
  } catch (_) {
    return false;
  }
}

// 2. Расчет живых данных для виджета (строго идентично вкладке «Бюджет»)
function getLiveWidgetData() {
  const today = new Date();
  const plan = window.Cache?.budgetPlan || {};
  const monthlyLimit = parseFloat(plan.monthlyVariableLimit) || 0;
  const weeklyLimit = monthlyLimit > 0 ? Math.round(monthlyLimit / 4.33) : 0;

  const targetYear = today.getFullYear();
  const targetMonth = today.getMonth();
  const targetMonthKey = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`;

  const startOfMonth = new Date(targetYear, targetMonth, 1, 0, 0, 0, 0);
  const endOfMonth = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);
  const startOfMonthTime = startOfMonth.getTime();
  const endOfMonthTime = endOfMonth.getTime();

  const dayOfWeek = today.getDay();
  const diffToMonday = (dayOfWeek + 6) % 7;
  const startOfWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() - diffToMonday, 0, 0, 0, 0);
  const endOfWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() - diffToMonday + 6, 23, 59, 59, 999);
  const startOfWeekTime = startOfWeek.getTime();
  const endOfWeekTime = endOfWeek.getTime();

  let monthlySpent = 0;
  let weeklySpent = 0;

  // Извлекаем операции текущего месяца
  const currentMonthObj = (window.Cache?.transactions || []).find(m => m.id === targetMonthKey);
  if (currentMonthObj && Array.isArray(currentMonthObj.items)) {
    currentMonthObj.items.forEach(tx => {
      const isExpense = tx.type === 'Расход' || tx.type === 'expense' || String(tx.type || '').trim().toLowerCase() === 'расход';
      const isExcluded = !!(tx.excludeFromBudget || tx.isExcludedFromBudget);
      if (!isExpense || isExcluded) return;

      const val = typeof tx.amount === 'number'
        ? tx.amount
        : (parseFloat(String(tx.amount || 0).replace(/\s/g, '').replace(/,/g, '.')) || 0);
      if (val <= 0) return;

      const txTime = tx.dayTimestamp || tx.timestamp || (tx.rawDate ? (typeof window.parseAnyDate === 'function' ? window.parseAnyDate(tx.rawDate)?.getTime() : new Date(tx.rawDate).getTime()) : 0);
      if (txTime >= startOfMonthTime && txTime <= endOfMonthTime) {
        monthlySpent += val;
        if (txTime >= startOfWeekTime && txTime <= endOfWeekTime) {
          weeklySpent += val;
        }
      }
    });
  }

  // Если текущая неделя началась в прошлом месяце
  const startWeekMonthKey = `${startOfWeek.getFullYear()}-${String(startOfWeek.getMonth() + 1).padStart(2, '0')}`;
  if (startWeekMonthKey !== targetMonthKey) {
    const prevMonthObj = (window.Cache?.transactions || []).find(m => m.id === startWeekMonthKey);
    if (prevMonthObj && Array.isArray(prevMonthObj.items)) {
      prevMonthObj.items.forEach(tx => {
        const isExpense = tx.type === 'Расход' || tx.type === 'expense' || String(tx.type || '').trim().toLowerCase() === 'расход';
        const isExcluded = !!(tx.excludeFromBudget || tx.isExcludedFromBudget);
        if (!isExpense || isExcluded) return;

        const val = typeof tx.amount === 'number'
          ? tx.amount
          : (parseFloat(String(tx.amount || 0).replace(/\s/g, '').replace(/,/g, '.')) || 0);
        if (val <= 0) return;

        const txTime = tx.dayTimestamp || tx.timestamp || 0;
        if (txTime >= startOfWeekTime && txTime <= endOfWeekTime) {
          weeklySpent += val;
        }
      });
    }
  }

  const weeklyAvailable = Math.max(0, weeklyLimit - weeklySpent);
  const monthlyAvailable = Math.max(0, monthlyLimit - monthlySpent);

  const weeklyPct = weeklyLimit > 0 ? Math.min(100, Math.round((weeklySpent / weeklyLimit) * 100)) : 0;
  const monthlyPct = monthlyLimit > 0 ? Math.min(100, Math.round((monthlySpent / monthlyLimit) * 100)) : 0;

  const lastDayOfMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const daysRemaining = Math.max(1, lastDayOfMonth - today.getDate() + 1);
  const dailyBudget = Math.max(0, Math.round(monthlyAvailable / daysRemaining));

  const hours = String(today.getHours()).padStart(2, '0');
  const minutes = String(today.getMinutes()).padStart(2, '0');

  const bgOpacity = parseInt(localStorage.getItem('budget_widget_bg_opacity') ?? '75', 10);

  return {
    weeklyLimit,
    weeklySpent,
    weeklyAvailable,
    weeklyPct,
    weeklyRemainingPct: Math.max(0, 100 - weeklyPct),
    weeklyOverbudget: weeklySpent > weeklyLimit && weeklyLimit > 0,
    monthlyLimit,
    monthlySpent,
    monthlyAvailable,
    monthlyPct,
    monthlyRemainingPct: Math.max(0, 100 - monthlyPct),
    monthlyOverbudget: monthlySpent > monthlyLimit && monthlyLimit > 0,
    dailyBudget,
    daysRemaining,
    bgOpacity,
    updatedAt: `${hours}:${minutes}`,
    timestamp: Date.now()
  };
}

// 3. Фоновая синхронизация данных для нативных виджетов Android
function syncWidgetData() {
  try {
    const data = getLiveWidgetData();
    localStorage.setItem('budget_widget_data', JSON.stringify(data));

    // Синхронизация с нативным плагином WidgetPin (Android AppWidgetManager)
    if (window.Capacitor?.Plugins?.WidgetPin?.updateData) {
      window.Capacitor.Plugins.WidgetPin.updateData({ data: JSON.stringify(data) }).catch(() => {});
    }

    // Дополнительное сохранение в Capacitor Preferences
    if (window.Capacitor?.Plugins?.Preferences) {
      window.Capacitor.Plugins.Preferences.set({
        key: 'budget_widget_data',
        value: JSON.stringify(data)
      }).catch(() => {});
    }

    window.dispatchEvent(new CustomEvent('budget-widget-updated', { detail: data }));
    return data;
  } catch (e) {
    console.warn('Ошибка синхронизации данных виджета:', e);
    return null;
  }
}

// 4. Генерация SVG для кругового индикатора
function renderWidgetCircleSvg(pct, color, size = 52, strokeWidth = 5.2) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedPct = Math.min(100, Math.max(0, pct));
  const offset = circumference - (clampedPct / 100) * circumference;

  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="transform -rotate-90 flex-shrink-0">
      <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" 
              stroke="rgba(255, 255, 255, 0.15)" stroke-width="${strokeWidth}" fill="transparent" />
      <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" 
              stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" fill="transparent"
              stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
              class="transition-all duration-700 ease-out" />
    </svg>
  `;
}

// 5. Рендеринг Варианта 1: 4×1 виджет (Недельные траты + Траты за месяц, компактный масштаб без обрезания)
function renderFullWidgetPreviewHtml(data) {
  const format = typeof window.formatMoney === 'function' ? window.formatMoney : (n) => `${Math.round(n).toLocaleString('ru-RU')} ₽`;
  const weekColor = data.weeklyOverbudget ? '#FF453A' : (data.weeklyPct >= 80 ? '#FF9F0A' : '#30D158');
  const monthColor = data.monthlyOverbudget ? '#FF453A' : (data.monthlyPct >= 80 ? '#FF9F0A' : '#30D158');
  const bgOpacity = (data.bgOpacity !== undefined ? data.bgOpacity : 75) / 100;

  return `
    <div class="relative w-full rounded-2xl border transition-all duration-300 select-none overflow-hidden" 
         style="background-color: rgba(22, 24, 34, ${bgOpacity}); border-color: rgba(255, 255, 255, ${Math.min(0.2, bgOpacity * 0.25)});">
      
      <div class="p-2.5 sm:p-3 flex items-center justify-between gap-2.5">
        <!-- 1. Слева: Недельные траты -->
        <div class="flex-1 min-w-0 pr-1">
          <span class="text-[9.5px] font-bold text-[#BAC7D5] block leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">Недельные траты</span>
          <div class="flex items-center gap-2 mt-1">
            <div class="relative flex items-center justify-center flex-shrink-0">
              ${renderWidgetCircleSvg(data.weeklyPct, weekColor, 40, 4.2)}
              <span class="absolute text-[9.5px] font-bold text-white font-mono drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">${data.weeklyPct}%</span>
            </div>
            <div class="min-w-0 flex-1">
              <span class="text-[14px] font-bold text-white block leading-tight tracking-tight drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] truncate">${format(data.weeklySpent)}</span>
              <span class="text-[10px] text-[#94A3B8] block leading-tight truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] mt-0.5">из ${format(data.weeklyLimit)}</span>
            </div>
          </div>
        </div>

        <!-- 2. Справа: Траты за месяц -->
        <div class="flex-[1.35] min-w-0 pl-1">
          <span class="text-[9.5px] font-bold text-[#BAC7D5] block leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">Траты за месяц</span>
          <span class="text-[13px] font-bold text-white block leading-tight tracking-tight drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] truncate mt-0.5">${format(data.monthlySpent)} из ${format(data.monthlyLimit)}</span>

          <!-- Линейный прогресс-бар месяца (умеренная шкала 5.5px) -->
          <div class="w-full h-[5.5px] bg-white/15 rounded-full overflow-hidden my-1">
            <div class="h-full rounded-full transition-all duration-700" style="width: ${Math.min(100, Math.max(0, data.monthlyPct))}%; background-color: ${monthColor};"></div>
          </div>

          <div class="flex items-center justify-between text-[10px] text-[#BAC7D5] font-bold leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
            <span class="truncate">Остаток: ${format(data.monthlyAvailable)}</span>
            <span class="text-white ml-1 font-mono">${data.monthlyPct}%</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

// 6. Рендеринг Варианта 2: 2×1 компактный виджет месяца
function renderCompactWidgetPreviewHtml(data) {
  const format = typeof window.formatMoney === 'function' ? window.formatMoney : (n) => `${Math.round(n).toLocaleString('ru-RU')} ₽`;
  const monthColor = data.monthlyOverbudget ? '#FF453A' : (data.monthlyPct >= 80 ? '#FF9F0A' : '#30D158');
  const bgOpacity = (data.bgOpacity !== undefined ? data.bgOpacity : 75) / 100;

  return `
    <div class="relative max-w-[260px] mx-auto rounded-2xl border transition-all duration-300 select-none overflow-hidden" 
         style="background-color: rgba(22, 24, 34, ${bgOpacity}); border-color: rgba(255, 255, 255, ${Math.min(0.2, bgOpacity * 0.25)});">
      
      <div class="p-2.5 sm:p-3 flex items-center justify-between gap-2.5">
        <div class="relative flex items-center justify-center flex-shrink-0">
          ${renderWidgetCircleSvg(data.monthlyPct, monthColor, 44, 4.4)}
          <span class="absolute text-[10px] font-bold text-white font-mono drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">${data.monthlyPct}%</span>
        </div>

        <div class="flex-1 min-w-0">
          <span class="text-[10px] font-bold text-[#BAC7D5] block leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">Траты за месяц</span>
          <span class="text-[15.5px] font-bold text-white block leading-tight mt-0.5 tracking-tight drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] truncate">${format(data.monthlySpent)}</span>
          <span class="text-[10.5px] text-[#94A3B8] block leading-none truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] mt-0.5">из ${format(data.monthlyLimit)}</span>
        </div>
      </div>
    </div>
  `;
}

// 7. Рендеринг Варианта 3: Отдельный виджет быстрого добавления трат (2x1)
function renderActionWidgetPreviewHtml(data) {
  const bgOpacity = (data.bgOpacity !== undefined ? data.bgOpacity : 75) / 100;

  return `
    <div class="relative max-w-[260px] mx-auto rounded-2xl border transition-all duration-300 select-none overflow-hidden" 
         style="background-color: rgba(22, 24, 34, ${bgOpacity}); border-color: rgba(255, 255, 255, ${Math.min(0.2, bgOpacity * 0.25)});">
      
      <div class="p-3">
        <button type="button" onclick="triggerQuickNewExpense()" class="w-full py-3 px-3 rounded-xl bg-gradient-to-r from-[#6C5DD3] to-[#8C7DFF] hover:opacity-95 active:scale-95 text-white text-sm font-bold shadow-md shadow-[#6C5DD3]/30 flex items-center justify-center gap-2 cursor-pointer transition-all">
          <i data-lucide="plus" class="w-4 h-4"></i>
          <span>Внести расход</span>
        </button>
      </div>
    </div>
  `;
}

// 8. Быстрый переход к добавлению расхода из виджета или ярлыка
function triggerQuickNewExpense() {
  if (typeof closeWidgetHubModal === 'function') closeWidgetHubModal();
  if (typeof closeProfileModal === 'function') closeProfileModal();
  if (typeof closeCustomDatePicker === 'function') closeCustomDatePicker();

  if (typeof window.switchTab === 'function') {
    window.switchTab('transactions');
  }

  const openExpenseForm = () => {
    const formContainer = document.getElementById('tx-form-container');
    if (formContainer && formContainer.classList.contains('hidden')) {
      if (typeof window.toggleForm === 'function') {
        window.toggleForm('tx-form-container', 'tx-submit-btn', 'Сохранить', 'tx-form', 'tx');
      } else {
        formContainer.classList.remove('hidden');
      }
    }

    const typeSelect = document.getElementById('tx-type');
    if (typeSelect) {
      typeSelect.value = 'Расход';
      typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const amountInput = document.getElementById('tx-amount');
    if (amountInput) {
      amountInput.focus();
      amountInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  openExpenseForm();
  setTimeout(openExpenseForm, 180);
  setTimeout(openExpenseForm, 350);
}

function triggerWidgetAddExpense() {
  triggerQuickNewExpense();
}

// 9. Модальное окно управления и предпросмотра виджетов (Widget Hub)
let currentWidgetTab = 'full';

function openWidgetHubModal(selectedVariant = 'full') {
  currentWidgetTab = selectedVariant;
  let modal = document.getElementById('widget-hub-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'widget-hub-modal';
    modal.className = 'fixed inset-0 z-[1300] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in';
    modal.onclick = (e) => {
      if (e.target === modal) closeWidgetHubModal();
    };
    document.body.appendChild(modal);
  }

  renderWidgetHubContent();
  modal.classList.remove('hidden');
}

function closeWidgetHubModal() {
  const modal = document.getElementById('widget-hub-modal');
  if (modal) modal.classList.add('hidden');
}

function setWidgetHubTab(tab) {
  currentWidgetTab = tab;
  updateWidgetHubUI();
}

const WIDGET_OPACITY_STEPS = [0, 25, 50, 75, 100];

function handleWidgetOpacityChange(val) {
  const opacity = parseInt(val, 10);
  localStorage.setItem('budget_widget_bg_opacity', opacity);
  
  syncWidgetData();
  updateWidgetHubUI();
}

function updateWidgetHubUI() {
  const card = document.getElementById('widget-hub-card');
  if (!card) {
    renderWidgetHubContent();
    return;
  }

  const data = getLiveWidgetData();
  const currentOpacity = data.bgOpacity !== undefined ? data.bgOpacity : 75;

  // 1. Обновляем табы форматов без пересоздания модалки
  const tabFullBtn = document.getElementById('widget-tab-full');
  const tabCompactBtn = document.getElementById('widget-tab-compact');
  const tabActionBtn = document.getElementById('widget-tab-action');

  if (tabFullBtn && tabCompactBtn && tabActionBtn) {
    const activeClass = 'bg-[#6C5DD3] text-white shadow-md';
    const inactiveClass = 'text-gray-400 hover:text-white';

    tabFullBtn.className = `flex-1 py-2 px-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${currentWidgetTab === 'full' ? activeClass : inactiveClass}`;
    tabCompactBtn.className = `flex-1 py-2 px-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${currentWidgetTab === 'compact' ? activeClass : inactiveClass}`;
    tabActionBtn.className = `flex-1 py-2 px-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${currentWidgetTab === 'action' ? activeClass : inactiveClass}`;
  }

  // 2. Обновляем контейнер превью
  const previewArea = document.getElementById('widget-preview-area');
  if (previewArea) {
    previewArea.innerHTML = currentWidgetTab === 'full' 
      ? renderFullWidgetPreviewHtml(data) 
      : (currentWidgetTab === 'compact' ? renderCompactWidgetPreviewHtml(data) : renderActionWidgetPreviewHtml(data));
    if (typeof lucide !== 'undefined') lucide.createIcons({ root: previewArea });
  }

  // 3. Обновляем процент прозрачности
  const opacityValEl = document.getElementById('widget-opacity-val');
  if (opacityValEl) {
    opacityValEl.textContent = `${currentOpacity}%`;
  }

  // 4. Обновляем кнопки прозрачности
  WIDGET_OPACITY_STEPS.forEach(step => {
    const btn = document.getElementById(`widget-opacity-btn-${step}`);
    if (btn) {
      btn.className = `py-1.5 text-center text-xs font-bold rounded-xl transition-all cursor-pointer ${currentOpacity === step ? 'bg-[#6C5DD3] text-white shadow-md shadow-[#6C5DD3]/30 scale-105' : 'bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white'}`;
    }
  });

  // 5. Обновляем кнопку добавления
  const addBtn = document.getElementById('widget-pin-action-btn');
  if (addBtn) {
    addBtn.setAttribute('onclick', `handleWidgetPinRequest('${currentWidgetTab}')`);
  }
}

function renderWidgetHubContent() {
  const modal = document.getElementById('widget-hub-modal');
  if (!modal) return;

  const data = getLiveWidgetData();
  const currentOpacity = data.bgOpacity !== undefined ? data.bgOpacity : 75;

  modal.innerHTML = `
    <div id="widget-hub-card" class="relative bg-[#161822] border border-white/10 rounded-3xl p-5 sm:p-6 max-w-sm w-full shadow-2xl space-y-4 my-auto animate-in fade-in zoom-in duration-200">
      <!-- Шапка модалки -->
      <div class="flex items-center justify-between pb-2 border-b border-white/5">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-2xl bg-[#6C5DD3]/20 border border-[#6C5DD3]/40 flex items-center justify-center text-[#8C7DFF]">
            <i data-lucide="layout-grid" class="w-5 h-5"></i>
          </div>
          <div>
            <h3 class="text-base font-bold text-white leading-tight">Виджеты на экран</h3>
            <span class="text-xs text-gray-400">Шкалы недели и месяца на рабочем столе</span>
          </div>
        </div>
        <button type="button" onclick="closeWidgetHubModal()" class="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-all cursor-pointer">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <!-- Переключатель 3 форматов -->
      <div class="flex p-1 bg-[#0F1118] rounded-2xl border border-white/5 gap-1">
        <button type="button" id="widget-tab-full" onclick="setWidgetHubTab('full')" class="flex-1 py-2 px-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${currentWidgetTab === 'full' ? 'bg-[#6C5DD3] text-white shadow-md' : 'text-gray-400 hover:text-white'}">
          <i data-lucide="columns-2" class="w-3 h-3"></i>
          <span>4×1</span>
        </button>
        <button type="button" id="widget-tab-compact" onclick="setWidgetHubTab('compact')" class="flex-1 py-2 px-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${currentWidgetTab === 'compact' ? 'bg-[#6C5DD3] text-white shadow-md' : 'text-gray-400 hover:text-white'}">
          <i data-lucide="pie-chart" class="w-3 h-3"></i>
          <span>2×1 Месяц</span>
        </button>
        <button type="button" id="widget-tab-action" onclick="setWidgetHubTab('action')" class="flex-1 py-2 px-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${currentWidgetTab === 'action' ? 'bg-[#6C5DD3] text-white shadow-md' : 'text-gray-400 hover:text-white'}">
          <i data-lucide="plus-circle" class="w-3 h-3"></i>
          <span>+ Расход</span>
        </button>
      </div>

      <!-- Предпросмотр с имитацией обоев рабочего стола для оценки прозрачности -->
      <div class="relative rounded-2xl p-3 bg-gradient-to-tr from-slate-900 via-indigo-950 to-slate-900 border border-white/10 shadow-inner overflow-hidden">
        <div class="absolute inset-0 opacity-40 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none"></div>
        <div id="widget-preview-area" class="relative z-10">
          ${currentWidgetTab === 'full' ? renderFullWidgetPreviewHtml(data) : (currentWidgetTab === 'compact' ? renderCompactWidgetPreviewHtml(data) : renderActionWidgetPreviewHtml(data))}
        </div>
      </div>

      <!-- Настройка прозрачности фона виджета с 5 точками (0%, 25%, 50%, 75%, 100%) -->
      <div class="bg-[#0F1118] p-3.5 rounded-2xl border border-white/5 space-y-2.5">
        <div class="flex items-center justify-between text-xs">
          <div class="flex items-center gap-1.5 text-gray-300 font-semibold">
            <i data-lucide="sliders" class="w-3.5 h-3.5 text-[#8C7DFF]"></i>
            <span>Прозрачность фона</span>
          </div>
          <span id="widget-opacity-val" class="text-xs font-bold text-[#8C7DFF] font-mono">${currentOpacity}%</span>
        </div>
        <div class="grid grid-cols-5 gap-1.5 pt-0.5">
          ${WIDGET_OPACITY_STEPS.map(step => `
            <button type="button" id="widget-opacity-btn-${step}" onclick="handleWidgetOpacityChange(${step})" 
                    class="py-1.5 text-center text-xs font-bold rounded-xl transition-all cursor-pointer ${currentOpacity === step ? 'bg-[#6C5DD3] text-white shadow-md shadow-[#6C5DD3]/30 scale-105' : 'bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white'}">
              ${step}%
            </button>
          `).join('')}
        </div>
      </div>

      <!-- Кнопка добавления на экран -->
      <div class="pt-1">
        <button type="button" id="widget-pin-action-btn" onclick="handleWidgetPinRequest('${currentWidgetTab}')" class="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-[#6C5DD3] to-[#8C7DFF] hover:opacity-95 active:scale-95 text-white text-xs font-bold shadow-lg shadow-[#6C5DD3]/30 flex items-center justify-center gap-2 cursor-pointer transition-all">
          <i data-lucide="plus-circle" class="w-4 h-4"></i>
          <span>Добавить виджет на экран</span>
        </button>
      </div>
    </div>
  `;

  if (typeof lucide !== 'undefined') lucide.createIcons({ root: modal });
}

// 9. Добавление виджета на экран через системный AppWidgetManager
function handleWidgetPinRequest(variant) {
  syncWidgetData();

  // Нативное закрепление через Capacitor плагин WidgetPin
  if (window.Capacitor?.Plugins?.WidgetPin?.requestPin) {
    window.Capacitor.Plugins.WidgetPin.requestPin({ variant })
      .then((res) => {
        if (res && res.success) {
          if (typeof showToast === 'function') showToast('Подтвердите добавление виджета на экран телефона');
          closeWidgetHubModal();
        } else {
          showWidgetPinFallback();
        }
      })
      .catch(() => {
        showWidgetPinFallback();
      });
  } else {
    showWidgetPinFallback();
  }
}

function showWidgetPinFallback() {
  if (typeof showToast === 'function') {
    showToast('Виджет доступен в списке виджетов на экране смартфона', false);
  }
}

// 10. Всплывающая шторка-предложение добавить виджет (ТОЛЬКО для нативного APK)
let widgetPromptTimer = null;
let widgetAutoDismissTimer = null;
let widgetProgressInterval = null;
let widgetTimeRemaining = 10000;
let widgetTimerPaused = false;
let widgetTouchStartX = 0;
let widgetTouchCurrentX = 0;
let widgetTouchStartY = 0;
let widgetTouchCurrentY = 0;
let widgetIsDragging = false;

function shouldShowWidgetPrompt() {
  // 1. Показываем ТОЛЬКО внутри нативного мобильного приложения (APK)
  const isNative = isNativeAppPlatform();
  if (!isNative) return false;

  // 2. Если сейчас открыто окно запроса разрешений на пуши — не показываем шторку
  if (window._isBankPushPromptOpen) return false;

  // 3. Пользователь отключил навсегда
  if (localStorage.getItem('widget_prompt_dismissed_permanently') === 'true') return false;

  // 4. Частота: не чаще одного раза в сутки
  const lastShownDate = localStorage.getItem('widget_prompt_last_shown_date');
  const todayStr = new Date().toISOString().split('T')[0];
  if (lastShownDate === todayStr) return false;

  return true;
}

function checkAndShowWidgetPrompt(delayMs = 3500) {
  if (!shouldShowWidgetPrompt()) return;

  if (widgetPromptTimer) clearTimeout(widgetPromptTimer);
  widgetPromptTimer = setTimeout(() => {
    if (!shouldShowWidgetPrompt()) return;
    if (typeof auth !== 'undefined' && !auth.currentUser) return;

    let banner = document.getElementById('widget-install-banner');
    if (!banner) {
      banner = createWidgetBannerElement();
      document.body.appendChild(banner);
    }

    initWidgetSwipeGesture();

    banner.classList.remove('hidden');
    requestAnimationFrame(() => {
      banner.classList.remove('translate-y-10', 'opacity-0');
      banner.classList.add('translate-y-0', 'opacity-100');
    });

    startWidgetAutoDismissCountdown();

    const todayStr = new Date().toISOString().split('T')[0];
    localStorage.setItem('widget_prompt_last_shown_date', todayStr);

    if (typeof lucide !== 'undefined') lucide.createIcons({ root: banner });
  }, delayMs);
}

function createWidgetBannerElement() {
  const div = document.createElement('div');
  div.id = 'widget-install-banner';
  div.className = 'fixed bottom-[74px] sm:bottom-6 left-3.5 right-3.5 sm:left-auto sm:right-6 sm:w-[390px] z-50 hidden translate-y-10 opacity-0 transition-all duration-300 pointer-events-none select-none';
  div.onmouseenter = pauseWidgetTimer;
  div.onmouseleave = resumeWidgetTimer;

  div.innerHTML = `
    <div id="widget-banner-card" class="relative bg-[#161824]/95 backdrop-blur-2xl border border-[#6C5DD3]/30 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.7),0_0_24px_rgba(108,93,211,0.22)] pointer-events-auto transition-transform duration-200">
      <!-- Крестик закрытия -->
      <button type="button" onclick="dismissWidgetBannerForToday()" class="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/5 hover:bg-white/15 active:scale-90 text-gray-400 hover:text-white flex items-center justify-center transition-all cursor-pointer z-10" title="Скрыть на сегодня">
        <i data-lucide="x" class="w-3.5 h-3.5"></i>
      </button>

      <!-- Шапка шторки -->
      <div class="flex items-center gap-3.5 pr-8">
        <div class="w-12 h-12 rounded-[14px] bg-gradient-to-br from-[#6C5DD3] to-[#8C7DFF] flex items-center justify-center text-white shadow-lg shadow-[#6C5DD3]/40 flex-shrink-0">
          <i data-lucide="layout-grid" class="w-6 h-6"></i>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5">
            <h4 class="text-[15px] font-bold text-white tracking-tight leading-snug">Виджет на экран</h4>
            <span class="text-[9px] font-bold bg-[#6C5DD3]/25 text-[#A594FD] border border-[#6C5DD3]/40 px-1.5 py-0.2 rounded-full">Новое</span>
          </div>
          <p class="text-xs text-gray-300 font-medium leading-snug mt-0.5">Следите за остатком недели и месяца прямо с рабочего стола</p>
        </div>
      </div>

      <!-- Нижняя строка -->
      <div class="flex items-center justify-between gap-3 mt-3.5 pt-3 border-t border-[rgba(255,255,255,0.06)]">
        <button type="button" onclick="dismissWidgetBannerPermanently()" class="text-[11px] text-[#848D99] hover:text-gray-300 transition-colors cursor-pointer py-1">
          Больше не показывать
        </button>

        <button type="button" onclick="handleWidgetBannerAction()" class="py-2 px-4 rounded-xl bg-gradient-to-r from-[#6C5DD3] to-[#8C7DFF] hover:opacity-90 active:scale-95 text-white text-xs font-bold shadow-md shadow-[#6C5DD3]/30 transition-all cursor-pointer flex items-center gap-1.5 flex-shrink-0">
          <i data-lucide="sparkles" class="w-3.5 h-3.5"></i>
          <span>Добавить виджет</span>
        </button>
      </div>

      <!-- 10-секундный прогресс-бар -->
      <div class="absolute bottom-0 left-3 right-3 h-[2px] bg-white/5 rounded-full overflow-hidden">
        <div id="widget-progress-bar" class="h-full bg-gradient-to-r from-[#6C5DD3] to-[#38BDF8] rounded-full transition-all duration-100 ease-linear" style="width: 100%;"></div>
      </div>
    </div>
  `;

  return div;
}

function handleWidgetBannerAction() {
  hideWidgetBanner();
  openWidgetHubModal('full');
}

function hideWidgetBanner() {
  stopWidgetAutoDismissCountdown();
  const banner = document.getElementById('widget-install-banner');
  if (banner) {
    banner.classList.add('translate-y-10', 'opacity-0');
    banner.classList.remove('translate-y-0', 'opacity-100');
    setTimeout(() => {
      banner.classList.add('hidden');
    }, 300);
  }
}

function dismissWidgetBannerForToday() {
  const todayStr = new Date().toISOString().split('T')[0];
  localStorage.setItem('widget_prompt_last_shown_date', todayStr);
  hideWidgetBanner();
}

function dismissWidgetBannerPermanently() {
  localStorage.setItem('widget_prompt_dismissed_permanently', 'true');
  hideWidgetBanner();
}

function startWidgetAutoDismissCountdown() {
  stopWidgetAutoDismissCountdown();
  widgetTimeRemaining = 10000;
  widgetTimerPaused = false;

  const progressBar = document.getElementById('widget-progress-bar');
  if (progressBar) progressBar.style.width = '100%';

  widgetProgressInterval = setInterval(() => {
    if (widgetTimerPaused) return;

    widgetTimeRemaining -= 100;
    if (progressBar) {
      const pct = Math.max(0, (widgetTimeRemaining / 10000) * 100);
      progressBar.style.width = pct + '%';
    }

    if (widgetTimeRemaining <= 0) {
      stopWidgetAutoDismissCountdown();
      dismissWidgetBannerForToday();
    }
  }, 100);
}

function stopWidgetAutoDismissCountdown() {
  if (widgetProgressInterval) {
    clearInterval(widgetProgressInterval);
    widgetProgressInterval = null;
  }
  if (widgetAutoDismissTimer) {
    clearTimeout(widgetAutoDismissTimer);
    widgetAutoDismissTimer = null;
  }
}

function pauseWidgetTimer() {
  widgetTimerPaused = true;
}

function resumeWidgetTimer() {
  widgetTimerPaused = false;
}

function initWidgetSwipeGesture() {
  const card = document.getElementById('widget-banner-card');
  if (!card || card.dataset.swipeBound === 'true') return;
  card.dataset.swipeBound = 'true';

  card.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    const target = (e?.target?.nodeType === 3) ? e.target.parentElement : e?.target;
    if (target && typeof target.closest === 'function' && target.closest('button, a, input')) return;

    widgetTouchStartX = e.touches[0].clientX;
    widgetTouchCurrentX = widgetTouchStartX;
    widgetTouchStartY = e.touches[0].clientY;
    widgetTouchCurrentY = widgetTouchStartY;
    widgetIsDragging = true;
    pauseWidgetTimer();
    card.style.transition = 'none';
  }, { passive: true });

  card.addEventListener('touchmove', (e) => {
    if (!widgetIsDragging || e.touches.length !== 1) return;
    widgetTouchCurrentX = e.touches[0].clientX;
    widgetTouchCurrentY = e.touches[0].clientY;
    const deltaX = widgetTouchCurrentX - widgetTouchStartX;
    const deltaY = widgetTouchCurrentY - widgetTouchStartY;
    const clampedY = Math.max(-15, deltaY);

    card.style.transform = `translate3d(${deltaX}px, ${clampedY}px, 0)`;
    const distance = Math.hypot(deltaX, Math.max(0, clampedY));
    const opacity = Math.max(0.15, 1 - (distance / 260));
    card.style.opacity = opacity.toString();
  }, { passive: true });

  const endDrag = () => {
    if (!widgetIsDragging) return;
    widgetIsDragging = false;
    const deltaX = widgetTouchCurrentX - widgetTouchStartX;
    const deltaY = widgetTouchCurrentY - widgetTouchStartY;

    const isHorizontalSwipe = Math.abs(deltaX) > 60;
    const isVerticalSwipe = deltaY > 50;

    if (isHorizontalSwipe || isVerticalSwipe) {
      card.style.transition = 'transform 0.4s cubic-bezier(0.2, 0.9, 0.35, 1), opacity 0.35s ease-out';
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        card.style.transform = `translate3d(${deltaX > 0 ? '120%' : '-120%'}, 0, 0)`;
      } else {
        card.style.transform = 'translate3d(0, 160px, 0)';
      }
      card.style.opacity = '0';

      dismissWidgetBannerForToday();
    } else {
      card.style.transition = 'transform 0.35s cubic-bezier(0.2, 0.9, 0.35, 1), opacity 0.3s ease-out';
      card.style.transform = 'translate3d(0, 0, 0)';
      card.style.opacity = '1';
      setTimeout(() => {
        card.style.transition = '';
        card.style.transform = '';
        card.style.opacity = '';
      }, 350);
      resumeWidgetTimer();
    }
  };

  card.addEventListener('touchend', endDrag, { passive: true });
  card.addEventListener('touchcancel', endDrag, { passive: true });
}

// 11. Автоматический учет расходов по банковским пуш-уведомлениям (Bank Push Automation)

const BANK_PACKAGE_NAMES = {
  'com.idamob.tinkoff.android': 'Т-Банк',
  'ru.tinkoff.mobile': 'Т-Банк',
  'ru.sberbankmobile': 'СберБанк',
  'ru.alfabank.mobile.android': 'Альфа-Банк',
  'ru.vtb24.mobilebanking': 'ВТБ',
  'ru.raiffeisennews': 'Райффайзенбанк',
  'com.yandex.bank': 'Яндекс Банк',
  'ru.yandex.pay': 'Яндекс Пэй',
  'ru.gazprombank.android.mobilebank.app': 'Газпромбанк',
  'ru.ozon.fintech.bank': 'Озон Банк',
  'ru.mts.money': 'МТС Банк',
  'ru.rosbank.android': 'Росбанк',
  'ru.sovcomcard.halva.v1': 'Совкомбанк',
  'ru.psbank.mobile.individual': 'ПСБ'
};

function getBankNameByPackage(pkgName) {
  if (!pkgName) return 'Банк';
  return BANK_PACKAGE_NAMES[pkgName] || 'Банк';
}

// Буфер недавних пушей для моментального отсечения парных встречных операций (+X и -X)
const recentBankPushesBuffer = [];

function checkAndCancelPairPush(parsedData) {
  const now = Date.now();
  // Очищаем события старше 60 секунд
  while (recentBankPushesBuffer.length > 0 && (now - recentBankPushesBuffer[0].time > 60000)) {
    recentBankPushesBuffer.shift();
  }

  // Ищем встречную операцию с такой же суммой и противоположным типом (от того же банка или в пределах 60 сек)
  const pairIdx = recentBankPushesBuffer.findIndex(p => 
    Math.abs(p.amount - parsedData.amount) < 0.01 && 
    p.type !== parsedData.type
  );

  if (pairIdx !== -1) {
    const pair = recentBankPushesBuffer.splice(pairIdx, 1)[0];
    console.log('[BankPush] Обнаружена встречная парная операция (+-), отменяем обе:', pair, parsedData);
    
    // Если первая операция успела сохраниться как pending transfer, тихо удаляем её
    if (pair.txId && typeof window.dismissPendingTransferSilent === 'function') {
      window.dismissPendingTransferSilent(pair.txId);
    }
    return true; // Парная операция компенсирована
  }

  return false;
}

/**
 * Скоринговая модель классификации push-уведомлений банков (Financial Push Scoring Engine)
 * Оценивает достоверность того, что входящее уведомление является реальной финансовой транзакцией,
 * а не рекламой, кредитным предложением, акцией, кэшбэк-промокодом или кодом подтверждения.
 */
function scoreBankPushNotification(title = '', text = '', packageName = '') {
  const fullText = `${title} ${text}`.trim();
  if (!fullText) return { score: 0, isFinancial: false, reason: 'empty_text', factors: [] };

  // 1. АБСОЛЮТНЫЕ СТОП-ФАКТОРЫ (Hard Gate -> Score = -999, мгновенный отброс)
  // 1.1. Одноразовые коды и данные авторизации / безопасности
  if (/(?:код\s+подтверждения|пароль\s+для\s+входа|никому\s+не\s+(?:сообщайте|передавайте)|вход\s+в\s+(?:приложение|банк)|одноразовый\s+пароль|для\s+входа\s+в\s+лк|push[- ]?код|код\s+авторизации|sms[- ]?код)/i.test(fullText)) {
    return { score: -999, isFinancial: false, reason: 'auth_otp_code', factors: ['auth_otp_code'] };
  }
  // 1.2. Сервисные/технические уведомления банков
  if (/(?:обновление\s+условий|изменение\s+тарифов|график\s+работы|технические\s+работы|безопасность\s+аккаунта|новая\s+версия\s+приложения|оцените\s+приложение|опрос\s+о\s+качестве)/i.test(fullText)) {
    return { score: -999, isFinancial: false, reason: 'system_service_alert', factors: ['system_service_alert'] };
  }

  let score = 0;
  const factors = [];

  // 2. ПОЛОЖИТЕЛЬНЫЕ СИГНАЛЫ (ФАКТ СОВЕРШЕННОЙ ФИНАНСОВОЙ ОПЕРАЦИИ)
  
  // 2.1. Глаголы совершенного действия / прошедшее время (+40)
  if (/(?:покупка|оплата|оплачено|списано|списание|снятие|зачисление|зачислено|пополнение|пополнено|выдача\s+наличных|чек\b)/i.test(fullText)) {
    score += 40;
    factors.push('action_verb_match (+40)');
  }

  // 2.2. Наличие статуса счета / карты / баланса (+35)
  if (/(?:баланс|остаток|доступно|лимит\s+карты|карта\s+\*?\d+|сч[её]т\s+\*?\d+|mir-\d+|ecmc\d+|visa\d+|authcode|mcc\b)/i.test(fullText)) {
    score += 35;
    factors.push('balance_or_card_state (+35)');
  }

  // 2.3. Переводы (+30)
  if (/(?:перевод\s+от|перевод\s+клиенту|перевод\s+на|входящий\s+перевод|исходящий\s+перевод|перевод\s+по\s+сбп|сбп\b)/i.test(fullText)) {
    score += 30;
    factors.push('transfer_marker (+30)');
  }

  // 2.4. Пакет известного банковского приложения (+15)
  if (packageName && BANK_PACKAGE_NAMES[packageName]) {
    score += 15;
    factors.push('known_bank_package (+15)');
  }

  // 2.5. Сумма в жесткой связке с операцией (+20)
  if (/(?:покупка|оплата|списание|списано|зачисление|пополнение|перевод)\s*[:=]?\s*[+\-]?\s*\d+[\s\d]*[.,]?\d*\s*(?:₽|руб|rur|rub|р\b)/i.test(fullText)) {
    score += 20;
    factors.push('amount_bound_to_action (+20)');
  }

  // 3. ОТРИЦАТЕЛЬНЫЕ СИГНАЛЫ (МАРКЕТИНГ, СПАМ, БУДУЩИЕ ПРЕДЛОЖЕНИЯ)

  // 3.1. Предлоги диапазонов и условий перед суммами (-50)
  // Примеры: "до 10 000 ₽", "от 500 ₽", "кешбэк до 5 000", "скидка до 30%"
  if (/(?:до|от)\s+\d+[\s\d]*\s*(?:₽|руб|рубл|rur|rub|р\b|%)/i.test(fullText) ||
      /(?:лимит(?:\s+до|\s+на)?|кешбэк(?:\s+до)?|кэшбэк(?:\s+до)?|ставка(?:\s+от)?|скидк[аи](?:\s+до)?|рассрочк[аи](?:\s+на)?|кредит(?:\s+до|\s+на)?|одобрен[ао]?\s+на)\s+\d+/i.test(fullText)) {
    score -= 50;
    factors.push('range_or_future_offer_penalty (-50)');
  }

  // 3.2. Повелительное наклонение и рекламные глаголы (-40)
  if (/\b(?:оформите|получите|попробуйте|откройте|возьмите|узнайте|дарим|выиграйте|успейте|инвестируйте|подключите|заберите|выбирайте|закажите|увеличьте|подайте\s+заявку|активируйте|пригласите|копите)\b/i.test(fullText)) {
    score -= 40;
    factors.push('imperative_marketing_verb (-40)');
  }

  // 3.3. Рекламные ключевые слова и акции (-35)
  if (/\b(?:промокод|специальное\s+предложение|персональное\s+предложение|акция|выгода|партнеры\s+банка|рассрочка|кредитные\s+каникулы|бонусы\s+спасибо|кэшбэк|кешбэк|выгодн[а-я]+|шанс\s+выиграть|розыгрыш|дополнительный\s+доход|начните\s+инвестировать)\b/i.test(fullText)) {
    score -= 35;
    factors.push('marketing_buzzwords (-35)');
  }

  const isFinancial = score >= 50;
  return {
    score,
    isFinancial,
    factors,
    reason: isFinancial ? 'valid_transaction' : 'low_confidence_or_marketing'
  };
}

function cleanBankPushMerchant(text = '', title = '') {
  let combined = `${title} ${text}`.trim();
  let clean = text || combined;

  // 1. Отрезаем всё после точки, двоеточия или перевода строки, если там начинается баланс/доступно/остаток/счет/карта/кэшбэк
  clean = clean.split(/(?:\.|\n|\r)\s*(?:баланс|доступно|остаток|лимит|карта\b|карты\b|кэшб|authcode|mcc\b|сч[её]т\b|счета\b|сч[её]та\b|накопительн)/i)[0];
  
  // 2. Если слово баланс встретилось без точки перед ним
  clean = clean.split(/\s+(?:баланс|доступно|остаток|лимит)[\s:]+/i)[0];

  // 3. Срезаем префиксы банков
  clean = clean.replace(/^(?:сбербанк|тинькофф|т-банк|альфа-банк|втб|банк|яндекс\s*пэй|пэй|озон\s*банк|райффайзенбанк|газпромбанк)[:\s]+/i, '');

  // 4. Срезаем тип операции и сумму в начале
  clean = clean.replace(/^(?:покупка|оплата|списание|списано|зачисление|пополнение|снятие|перевод)(?:\s*(?:на\s+сумму|в\s+размере))?[:\s]+[+\-]?\s*[\d\s.,]+(?:₽|руб|rur|rub|р)?\s*[,.]?\s*(?:в\s+|за\s+|от\s+|клиенту\s+|на\s+карту\s+|с\s+карты\s+)?/i, '');

  // 5. Срезаем хвосты «карта Пэй», «карта *1234», «кэшбэк ...»
  clean = clean.replace(/\s+(?:карта\s+пэй|карта\s+\*?\d+|кэшбэк.*)$/i, '');

  // 6. Срезаем знаки препинания и пробелы на концах
  clean = clean.replace(/^[,\s.—–:;]+|[,\s.—–:;]+$/g, '').trim();

  // 7. Если строка пустая, пробуем взять заголовок
  if (!clean || clean.length < 2) {
    let titleClean = (title || '')
      .replace(/^[+\-]?\s*[\d\s.,]+(?:₽|руб|rur|rub|р)?\s*/i, '')
      .replace(/^[,\s.—–:;]+|[,\s.—–:;]+$/g, '')
      .trim();
    if (titleClean.length >= 2) clean = titleClean;
  }

  return clean || 'Операция';
}

function parseBankPushText(title = '', text = '', packageName = '') {
  const fullText = `${title} ${text}`.trim();
  if (!fullText) return null;

  // 1. Прогон через скоринговую модель оценки доверия к транзакции
  const scoring = scoreBankPushNotification(title, text, packageName);
  if (!scoring.isFinancial) {
    console.log(`[BankPush] Пуш отфильтрован скорингом (Score: ${scoring.score}, Причина: ${scoring.reason}):`, fullText, scoring.factors);
    return null;
  }

  // 2. Определение банка
  let bankName = getBankNameByPackage(packageName);
  const lowerFull = fullText.toLowerCase();
  if (bankName === 'Банк') {
    if (lowerFull.includes('тинькофф') || lowerFull.includes('т-банк') || lowerFull.includes('tinkoff') || lowerFull.includes('t-bank')) bankName = 'Т-Банк';
    else if (lowerFull.includes('сбер') || lowerFull.includes('sber')) bankName = 'СберБанк';
    else if (lowerFull.includes('альфа') || lowerFull.includes('alfa')) bankName = 'Альфа-Банк';
    else if (lowerFull.includes('втб') || lowerFull.includes('vtb')) bankName = 'ВТБ';
    else if (lowerFull.includes('райф') || lowerFull.includes('raiff')) bankName = 'Райффайзенбанк';
    else if (lowerFull.includes('яндекс') || lowerFull.includes('yandex')) bankName = 'Яндекс Пэй';
    else if (lowerFull.includes('газпром') || lowerFull.includes('gpb')) bankName = 'Газпромбанк';
    else if (lowerFull.includes('озон') || lowerFull.includes('ozon')) bankName = 'Озон Банк';
  }

  // 3. Распознавание внутреннего перевода между счетами / в накопительные счета
  const isInternalAccountTransfer = /(?:на\s+сч[её]т\s+в\s+сейвах|в\s+сейвы|на\s+накопительн|накопительного\s+сч[её]та|пополнение\s+с\s+карты.*на\s+сч[её]т|перевод.*между\s+(?:своими|счетами)|в\s+инвесткопилку|в\s+копилку|перевод\s+на\s+сч[её]т\s+в\s+сейв|перевод\s+с\s+накопительн)/i.test(fullText);

  // 4. Определение типа операции (Расход vs Доход)
  const isIncome = /(?:зачисление|пополнение|перевод от|возврат|зарплата|входящий перевод|\+[\d\s]+)/i.test(fullText) && !/(?:списание|покупка|оплата)/i.test(fullText);
  const isExpense = /(?:покупка|оплата|списание|списано|снятие|чек|заказ|перевод клиенту|перевод на|в адрес)/i.test(fullText) || !isIncome;

  // 5. Определение обычного перевода (требует подтверждения)
  const isTransferOperation = !isInternalAccountTransfer && /(?:перевод|сбп|по\s+номеру|клиенту|зачисление\s+перевода|входящий\s+перевод|исходящий\s+перевод)/i.test(fullText);

  // 6. Извлечение суммы операции
  let amount = 0;
  const amountRegexes = [
    /(?:покупка|оплата|списание|списано|снятие|зачисление|пополнение|сумма|чек|на сумму|расход|перевод)\s*(?::)?\s*([+\-]?\s*[\d\s]+(?:[.,]\d{1,2})?)\s*(?:₽|руб|рубл|rur|rub|р\b)/i,
    /([+\-]?\s*[\d\s]+(?:[.,]\d{1,2})?)\s*(?:₽|руб|рубл|rur|rub|р\b)/i,
    /(?:сумма|итог)\s*[:=]\s*([+\-]?\s*[\d\s]+(?:[.,]\d{1,2})?)/i
  ];

  for (const reg of amountRegexes) {
    const match = fullText.match(reg);
    if (match && match[1]) {
      const cleanNumStr = match[1].replace(/\s/g, '').replace(/\+/g, '').replace(/,/g, '.');
      const parsed = parseFloat(cleanNumStr);
      if (!isNaN(parsed) && parsed > 0 && parsed < 10000000) {
        amount = Math.round(parsed * 100) / 100;
        break;
      }
    }
  }

  if (amount <= 0) return null;

  // 7. Извлечение чистого названия магазина / назначения
  const finalMerchant = cleanBankPushMerchant(text, title);

  // 8. Автокатегоризация через StatementCategorizer
  let category = isIncome ? 'Зарплата' : 'Продукты';
  if (isTransferOperation || isInternalAccountTransfer) {
    category = isIncome ? 'Входящий перевод' : 'Перевод';
  } else if (typeof window.StatementCategorizer?.categorize === 'function') {
    category = window.StatementCategorizer.categorize(finalMerchant, fullText, isIncome ? 'Доход' : 'Расход');
  } else {
    const rules = window.Cache?.categoryRules || window.DEFAULT_CATEGORY_RULES || [];
    const lowerNorm = (finalMerchant + ' ' + fullText).toLowerCase();
    for (const r of rules) {
      if (r.pattern && lowerNorm.includes(r.pattern.toLowerCase())) {
        category = r.category;
        break;
      }
    }
  }

  return {
    bank: bankName,
    amount,
    type: isIncome ? 'Доход' : 'Расход',
    merchant: finalMerchant,
    category: category || (isIncome ? 'Другое' : 'Прочее'),
    rawText: fullText,
    score: scoring.score,
    isInternalTransfer: isInternalAccountTransfer,
    isPendingTransfer: isTransferOperation,
    timestamp: Date.now()
  };
}

// Автоматическое сохранение распознанной операции
async function saveAutoExpenseTransaction(parsedData) {
  if (!parsedData || !parsedData.amount || parsedData.amount <= 0) return null;
  if (!window.auth?.currentUser) return null;

  // 1. Если это явный внутренний перевод между своими счетами — пропускаем учет в тратах
  if (parsedData.isInternalTransfer) {
    console.log('[BankPush] Внутренний перевод между своими счетами пропущен:', parsedData);
    return null;
  }

  // 2. Проверка и отсечение встречных парных операций (+- на одинаковую сумму)
  const isPairCancelled = checkAndCancelPairPush(parsedData);
  if (isPairCancelled) {
    return null;
  }

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const formattedDateStr = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;

  const tempTxId = `auto_push_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

  // Проверка на дубликат
  const allFlat = typeof getAllCachedTransactionsFlat === 'function' ? getAllCachedTransactionsFlat() : [];
  const isDuplicate = allFlat.some(t => {
    if (t.date !== dateStr) return false;
    const diff = Math.abs(parseFloat(t.amount) - parsedData.amount);
    if (diff < 0.01) {
      const timeDiff = Math.abs((t.timestamp || t.createdAt || 0) - parsedData.timestamp);
      if (timeDiff < 10 * 60 * 1000) return true; // 10 минут
    }
    return false;
  });

  if (isDuplicate) {
    console.log('[BankPush] Операция пропущена (обнаружен дубликат):', parsedData);
    return null;
  }

  const isPending = !!parsedData.isPendingTransfer;
  const userProfile = (typeof getCurrentUserProfile === 'function') ? getCurrentUserProfile() : { displayName: 'Пользователь', avatarId: 'user' };
  const authorInfo = {
    uid: window.auth.currentUser.uid || '',
    name: userProfile.displayName || 'Пользователь',
    avatarId: userProfile.avatarId || 'user'
  };

  const txObj = {
    id: tempTxId,
    type: parsedData.type || 'Расход',
    amount: parsedData.amount,
    category: parsedData.category || 'Прочее',
    date: dateStr,
    formattedDate: formattedDateStr,
    rawDate: dateStr,
    comment: parsedData.merchant || '',
    excludeFromBudget: isPending ? true : false, // Неподтвержденные переводы не влияют на бюджет
    isPendingTransfer: isPending,
    transferStatus: isPending ? 'pending' : 'confirmed',
    spreadMonths: 1,
    isBillPayment: false,
    billId: null,
    billName: '',
    billType: '',
    source: 'bank_push_auto',
    bank: parsedData.bank || '',
    timestamp: parsedData.timestamp || Date.now(),
    createdAt: Date.now(),
    author: authorInfo
  };

  // Добавляем в буфер недавних пушей для проверки встречных парных списаний/пополнений
  recentBankPushesBuffer.push({
    txId: tempTxId,
    amount: parsedData.amount,
    type: parsedData.type,
    bank: parsedData.bank,
    time: Date.now()
  });

  // Мгновенное добавление в кэш
  allFlat.unshift(txObj);
  window.lastAddedTxIds = [tempTxId];
  window.lastAddedTxTime = Date.now();

  if (typeof processTransactions === 'function') {
    window.Cache.transactions = processTransactions(allFlat);
  }

  // Анимация и обновление интерфейса (только если операция подтвержденная и влияет на бюджет)
  if (!isPending) {
    if (typeof triggerBudgetExpenseAnimation === 'function') {
      triggerBudgetExpenseAnimation();
    } else {
      window._budgetNeedsExpenseAnimation = true;
      window._budgetTabDirty = true;
    }
    syncWidgetData();
  }

  if (typeof markTabsDirty === 'function') markTabsDirty();
  if (typeof renderBudgetTab === 'function') renderBudgetTab();
  if (typeof renderTransactions === 'function') renderTransactions();

  // Локальный тост и push-уведомление
  const format = typeof window.formatMoney === 'function' ? window.formatMoney : (n) => `${Math.round(n).toLocaleString('ru-RU')} ₽`;
  
  if (isPending) {
    if (typeof showToast === 'function') {
      showToast(`Перевод: ${format(parsedData.amount)} • Требует подтверждения`);
    }
    sendAppLocalNotification(
      `Перевод: ${format(parsedData.amount)}`,
      `${parsedData.merchant} • Подтвердите в приложении`
    );
  } else {
    if (typeof showToast === 'function') {
      showToast(`Авто-расход: ${format(parsedData.amount)} • ${parsedData.merchant} (${parsedData.category})`);
    }
    sendAppLocalNotification(
      `Расход внесен: ${format(parsedData.amount)}`,
      `${parsedData.merchant} • ${parsedData.category}`
    );
  }

  // Фоновая запись в Firestore
  try {
    if (typeof getUserCol === 'function') {
      await getUserCol('Transactions').doc(tempTxId).set(txObj);
    }
  } catch (err) {
    console.warn('[BankPush] Ошибка сохранения транзакции в Firestore:', err);
  }

  return txObj;
}

// Отправка нативного push-уведомления пользователю и настройки
function isBankPushNotifyOnSaveEnabled() {
  return localStorage.getItem('bank_push_notify_on_save_enabled') !== 'false';
}

function toggleBankPushNotifyOnSave(enabled) {
  localStorage.setItem('bank_push_notify_on_save_enabled', enabled ? 'true' : 'false');
  if (enabled) {
    requestPostNotificationPermission();
  }
  renderBankPushModalContent();
}

// Отправка нативного push-уведомления пользователю
function sendAppLocalNotification(title, body) {
  if (!isBankPushNotifyOnSaveEnabled()) return;
  try {
    // 1. Через нативный плагин Capacitor BankPush
    if (window.Capacitor?.Plugins?.BankPush?.notifyExpenseSaved) {
      window.Capacitor.Plugins.BankPush.notifyExpenseSaved({ title, body }).catch(() => {});
      return;
    }

    // 2. Через браузерный Notification API (если доступен и разрешен)
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: 'icon-pwa.svg?v=3',
        badge: 'icon-pwa.svg?v=3'
      });
    }
  } catch (_) {}
}

// Проверка и запрос разрешений нативного сервиса пушей
async function checkBankPushPermissions() {
  if (window.Capacitor?.Plugins?.BankPush?.checkPermission) {
    try {
      const res = await window.Capacitor.Plugins.BankPush.checkPermission();
      return !!(res && res.granted);
    } catch (_) {
      return false;
    }
  }
  return false;
}

async function checkPostNotificationPermission() {
  if (window.Capacitor?.Plugins?.BankPush?.checkPostNotificationPermission) {
    try {
      const res = await window.Capacitor.Plugins.BankPush.checkPostNotificationPermission();
      return !!(res && res.granted);
    } catch (_) {
      return false;
    }
  }
  if (typeof Notification !== 'undefined') {
    return Notification.permission === 'granted';
  }
  return true;
}

async function requestPostNotificationPermission() {
  if (window.Capacitor?.Plugins?.BankPush?.requestPostNotificationPermission) {
    try {
      await window.Capacitor.Plugins.BankPush.requestPostNotificationPermission();
    } catch (_) {}
  } else if (typeof Notification !== 'undefined' && Notification.requestPermission) {
    try {
      await Notification.requestPermission();
    } catch (_) {}
  }
}

function openBankPushPermissionSettings() {
  if (window.Capacitor?.Plugins?.BankPush?.openPermissionSettings) {
    window.Capacitor.Plugins.BankPush.openPermissionSettings().catch(() => {});
  } else {
    if (typeof showToast === 'function') {
      showToast('Откройте: Настройки телефона → Приложения → Доступ к уведомлениям');
    }
  }
}

function isBankPushAutoExpenseEnabled() {
  return localStorage.getItem('bank_push_auto_expense_enabled') !== 'false';
}

function toggleBankPushAutoExpense(enabled) {
  localStorage.setItem('bank_push_auto_expense_enabled', enabled ? 'true' : 'false');
  if (window.Capacitor?.Plugins?.BankPush?.setAutoExpenseEnabled) {
    window.Capacitor.Plugins.BankPush.setAutoExpenseEnabled({ enabled: !!enabled }).catch(() => {});
  }
  renderBankPushModalContent();
}

// Инициализация фонового слушателя входящих банковских пушей
function initBankPushListener() {
  if (window._bankPushListenerInitialized) return;
  window._bankPushListenerInitialized = true;

  if (window.Capacitor?.Plugins?.BankPush) {
    // Подписка на событие прихода пуша в реальном времени
    window.Capacitor.Plugins.BankPush.addListener('bankPushReceived', async (eventData) => {
      if (!isBankPushAutoExpenseEnabled()) return;
      const parsed = parseBankPushText(eventData.title, eventData.text || eventData.body, eventData.packageName);
      if (parsed && parsed.amount > 0) {
        await saveAutoExpenseTransaction(parsed);
      }
    }).catch(() => {});

    // Получение пушей, накопившихся пока приложение было закрыто
    window.Capacitor.Plugins.BankPush.getPendingBankPushes?.().then(async (res) => {
      if (res && Array.isArray(res.pushes) && isBankPushAutoExpenseEnabled()) {
        for (const p of res.pushes) {
          const parsed = parseBankPushText(p.title, p.text || p.body, p.packageName);
          if (parsed && parsed.amount > 0) {
            await saveAutoExpenseTransaction(parsed);
          }
        }
      }
    }).catch(() => {});
  }
}

// 12. Модальное окно настроек и симулятора авто-учета по пушам (Bank Push Hub)
window._bankPushOpenedFromProfile = false;

function openBankPushModal(options = {}) {
  const profileDialog = document.getElementById('profile-dialog');
  const isFromProfile = !!(options?.fromProfile || (profileDialog && !profileDialog.classList.contains('hidden')));
  
  if (isFromProfile) {
    window._bankPushOpenedFromProfile = true;
    if (profileDialog) profileDialog.classList.add('hidden');
  } else {
    window._bankPushOpenedFromProfile = false;
  }

  let modal = document.getElementById('bank-push-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'bank-push-modal';
    modal.className = 'fixed inset-0 z-[1400] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in custom-scrollbar';
    modal.onclick = (e) => {
      if (e.target === modal) closeBankPushModal();
    };
    document.body.appendChild(modal);
  }

  renderBankPushModalContent();
  modal.classList.remove('hidden');
}

function closeBankPushModal() {
  const modal = document.getElementById('bank-push-modal');
  if (modal) modal.classList.add('hidden');

  // Если окно было вызвано из профиля, возвращаем пользователя в профиль
  if (window._bankPushOpenedFromProfile) {
    window._bankPushOpenedFromProfile = false;
    if (typeof openProfileModal === 'function') {
      openProfileModal();
    }
  }
}

async function renderBankPushModalContent() {
  const modal = document.getElementById('bank-push-modal');
  if (!modal) return;

  const isAutoEnabled = isBankPushAutoExpenseEnabled();
  const isNotifyEnabled = isBankPushNotifyOnSaveEnabled();
  const isNative = isNativeAppPlatform();
  let isGranted = true;

  if (isNative) {
    isGranted = await checkBankPushPermissions();
  }

  modal.innerHTML = `
    <div class="relative bg-[#161822] border border-white/10 rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl space-y-4 my-auto animate-in fade-in zoom-in duration-200">
      
      <!-- Шапка модального окна -->
      <div class="flex items-start justify-between pb-3 border-b border-white/5 gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#6C5DD3] to-[#8C7DFF] flex items-center justify-center text-white shadow-lg shadow-[#6C5DD3]/30 flex-shrink-0">
            <i data-lucide="bell-ring" class="w-5 h-5"></i>
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-1.5">
              <h3 class="text-base font-bold text-white leading-tight">Авто-учет по пушам</h3>
              <span class="text-[9px] font-bold bg-[#6C5DD3]/25 text-[#A594FD] border border-[#6C5DD3]/40 px-1.5 py-0.5 rounded-full">Авто</span>
            </div>
            <p class="text-xs text-gray-400 leading-tight mt-1">Мгновенное внесение трат сразу после покупки</p>
          </div>
        </div>
        <button type="button" onclick="closeBankPushModal()" class="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-all cursor-pointer flex-shrink-0">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <!-- Предупреждение об отсутствии разрешений (только если разрешения не даны) -->
      ${isNative && !isGranted ? `
        <div class="bg-amber-500/10 border border-amber-500/25 rounded-2xl p-3.5 flex items-center justify-between gap-3">
          <div class="flex items-center gap-2.5 min-w-0 flex-1">
            <i data-lucide="alert-circle" class="w-4 h-4 text-amber-400 flex-shrink-0"></i>
            <span class="text-xs text-amber-200/90 leading-snug">Для работы авто-учета требуется доступ к уведомлениям в Android</span>
          </div>
          <button type="button" onclick="openBankPushPermissionSettings()" class="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 active:scale-95 text-amber-200 border border-amber-500/30 text-xs font-semibold transition-all flex items-center gap-1.5 flex-shrink-0 cursor-pointer shadow-sm">
            <i data-lucide="settings" class="w-3.5 h-3.5"></i>
            <span>Настройки</span>
          </button>
        </div>
      ` : ''}

      <!-- Настройки: Тумблеры управления -->
      <div class="space-y-2">
        <!-- Тумблер 1: Автоматический учет -->
        <div class="bg-[#0F1118] border border-white/5 rounded-2xl p-3.5 flex items-center justify-between">
          <div class="pr-3">
            <span class="text-xs font-bold text-white block">Автоматически вносить траты</span>
            <span class="text-[11px] text-gray-400 block mt-0.5 leading-snug">Вносить покупку в базу сразу при получении пуша</span>
          </div>
          <label class="relative inline-flex items-center cursor-pointer flex-shrink-0">
            <input type="checkbox" ${isAutoEnabled ? 'checked' : ''} onchange="toggleBankPushAutoExpense(this.checked)" class="sr-only peer">
            <div class="w-11 h-6 bg-[#2A2D3C] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-[#30D158] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
          </label>
        </div>

        <!-- Тумблер 2: Подтверждающий пуш от приложения -->
        <div class="bg-[#0F1118] border border-white/5 rounded-2xl p-3.5 flex items-center justify-between">
          <div class="pr-3">
            <span class="text-xs font-bold text-white block">Пуш-подтверждение о записи</span>
            <span class="text-[11px] text-gray-400 block mt-0.5 leading-snug">Присылать уведомление после успешного внесения расхода</span>
          </div>
          <label class="relative inline-flex items-center cursor-pointer flex-shrink-0">
            <input type="checkbox" ${isNotifyEnabled ? 'checked' : ''} onchange="toggleBankPushNotifyOnSave(this.checked)" class="sr-only peer">
            <div class="w-11 h-6 bg-[#2A2D3C] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-[#30D158] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
          </label>
        </div>
      </div>

      <!-- Разъяснение о безопасности данных -->
      <div class="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-3.5 space-y-1.5">
        <div class="flex items-center gap-1.5 text-xs font-bold text-blue-200">
          <i data-lucide="shield-check" class="w-4 h-4 text-[#8C7DFF]"></i>
          <span>Безопасность и приватность</span>
        </div>
        <p class="text-[11px] text-blue-200/80 leading-relaxed">
          Наше приложение обрабатывает исключительно push-уведомления о покупках от банков — звонки и личные сообщения (Telegram, WhatsApp, SMS) никогда не читаются и не передаются.
        </p>
      </div>

      <!-- Кнопка закрытия -->
      <div class="pt-1">
        <button type="button" onclick="closeBankPushModal()" class="w-full py-3.5 px-4 rounded-2xl bg-[#212430] hover:bg-[#2A2D3C] active:scale-98 text-white text-xs font-bold transition-all cursor-pointer shadow-sm">
          Закрыть
        </button>
      </div>
    </div>
  `;

  if (typeof lucide !== 'undefined') lucide.createIcons({ root: modal });
}

// 12.1. Диалог запроса разрешений Android при первом старте приложения
function openBankPushPermissionPrompt() {
  window._isBankPushPromptOpen = true;

  // Отменяем или скрываем шторку виджетов, если она была запланирована или открыта
  if (widgetPromptTimer) {
    clearTimeout(widgetPromptTimer);
    widgetPromptTimer = null;
  }
  const banner = document.getElementById('widget-install-banner');
  if (banner && !banner.classList.contains('hidden')) {
    hideWidgetBanner();
  }

  let modal = document.getElementById('bank-push-permission-prompt-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'bank-push-permission-prompt-modal';
    modal.className = 'fixed inset-0 z-[1500] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden';
    modal.onclick = (e) => {
      if (e.target === modal) closeBankPushPermissionPrompt();
    };
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="relative bg-[#161822] border border-white/10 rounded-3xl p-4 sm:p-5 max-w-md w-full shadow-2xl space-y-3 my-auto animate-in fade-in zoom-in duration-200 select-none">
      
      <div class="text-center space-y-1.5">
        <div class="w-12 h-12 mx-auto rounded-2xl bg-gradient-to-br from-[#6C5DD3] to-[#8C7DFF] flex items-center justify-center text-white shadow-xl shadow-[#6C5DD3]/30">
          <i data-lucide="bell-ring" class="w-6 h-6"></i>
        </div>
        <h3 class="text-base font-bold text-white leading-tight">Авто-учет расходов по пушам</h3>
        <p class="text-xs text-gray-300 leading-relaxed px-1">
          Приложение может автоматически вносить траты сразу после оплаты картой или телефоном, считывая push-уведомления банков.
        </p>
      </div>

      <div class="bg-[#0F1118] border border-white/5 rounded-2xl p-3 space-y-2">
        <div class="text-xs font-bold text-white flex items-center gap-1.5">
          <i data-lucide="zap" class="w-4 h-4 text-[#A594FD]"></i>
          <span>Как включить за 10 секунд:</span>
        </div>
        <ol class="text-[11px] text-gray-300 space-y-1.5 pl-4 list-decimal leading-snug">
          <li>Нажмите <b>«Включить доступ»</b> ниже.</li>
          <li>В системных настройках Android найдите <b>«Семейный бюджет»</b> и активируйте тумблер.</li>
          <li>Убедитесь, что в мобильных банках включены push-уведомления об операциях.</li>
        </ol>
      </div>

      <!-- Пояснение о безопасности -->
      <div class="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-2.5 flex items-start gap-2 text-xs text-blue-200/90 leading-snug">
        <i data-lucide="shield-check" class="w-4 h-4 text-[#8C7DFF] flex-shrink-0 mt-0.5"></i>
        <div class="text-[10.5px] leading-relaxed">
          Наше приложение обрабатывает исключительно push-уведомления о покупках от банков — звонки и личные сообщения (Telegram, WhatsApp, SMS) никогда не читаются и не передаются.
        </div>
      </div>

      <div class="space-y-1.5 pt-0.5">
        <button type="button" onclick="handleAcceptBankPushPrompt()" class="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-[#6C5DD3] to-[#8C7DFF] hover:opacity-90 active:scale-98 text-white text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-[#6C5DD3]/30">
          <i data-lucide="check" class="w-4 h-4"></i>
          <span>Включить доступ в Android</span>
        </button>
        <button type="button" onclick="closeBankPushPermissionPrompt()" class="w-full py-2.5 px-4 rounded-2xl bg-white/5 hover:bg-white/10 active:scale-98 text-gray-400 hover:text-white text-xs font-semibold transition-all cursor-pointer">
          Настроить позже
        </button>
      </div>
    </div>
  `;

  if (typeof lucide !== 'undefined') lucide.createIcons({ root: modal });
  modal.classList.remove('hidden');
}

function closeBankPushPermissionPrompt() {
  window._isBankPushPromptOpen = false;
  const modal = document.getElementById('bank-push-permission-prompt-modal');
  if (modal) modal.classList.add('hidden');
  localStorage.setItem('bank_push_permission_prompt_dismissed_at', Date.now().toString());

  // При закрытии окна пушей плавно предлагаем шторку добавления виджетов
  setTimeout(() => {
    if (typeof checkAndShowWidgetPrompt === 'function') {
      checkAndShowWidgetPrompt(600);
    }
  }, 300);
}

function handleAcceptBankPushPrompt() {
  closeBankPushPermissionPrompt();
  requestPostNotificationPermission();
  openBankPushPermissionSettings();
}

async function checkAndPromptBankPushPermission(delayMs = 2500) {
  // Если запущено не в APK или пользователь выключил авто-учет — запускаем шторку виджетов
  if (!isNativeAppPlatform() || !isBankPushAutoExpenseEnabled()) {
    if (typeof checkAndShowWidgetPrompt === 'function') {
      checkAndShowWidgetPrompt(3000);
    }
    return;
  }
  
  const dismissedAt = parseInt(localStorage.getItem('bank_push_permission_prompt_dismissed_at') || '0', 10);
  // Не показываем чаще, чем раз в 24 часа, если пользователь уже закрывал окно
  if (Date.now() - dismissedAt < 24 * 60 * 60 * 1000) {
    if (typeof checkAndShowWidgetPrompt === 'function') {
      checkAndShowWidgetPrompt(3000);
    }
    return;
  }

  setTimeout(async () => {
    try {
      // Если пользователь отключил в процессе ожидания
      if (!isBankPushAutoExpenseEnabled()) {
        if (typeof checkAndShowWidgetPrompt === 'function') {
          checkAndShowWidgetPrompt(1000);
        }
        return;
      }
      const isGranted = await checkBankPushPermissions();
      if (!isGranted) {
        openBankPushPermissionPrompt();
      } else {
        // Разрешения уже есть — сразу показываем шторку виджетов
        if (typeof checkAndShowWidgetPrompt === 'function') {
          checkAndShowWidgetPrompt(1500);
        }
      }
    } catch (_) {
      if (typeof checkAndShowWidgetPrompt === 'function') {
        checkAndShowWidgetPrompt(2000);
      }
    }
  }, delayMs);
}

// 13. Глобальный экспорт функций
window.isNativeAppPlatform = isNativeAppPlatform;
window.getLiveWidgetData = getLiveWidgetData;
window.syncWidgetData = syncWidgetData;
window.openWidgetHubModal = openWidgetHubModal;
window.closeWidgetHubModal = closeWidgetHubModal;
window.setWidgetHubTab = setWidgetHubTab;
window.handleWidgetOpacityChange = handleWidgetOpacityChange;
window.triggerQuickNewExpense = triggerQuickNewExpense;
window.triggerWidgetAddExpense = triggerWidgetAddExpense;
window.checkAndShowWidgetPrompt = checkAndShowWidgetPrompt;
window.hideWidgetBanner = hideWidgetBanner;
window.dismissWidgetBannerForToday = dismissWidgetBannerForToday;
window.dismissWidgetBannerPermanently = dismissWidgetBannerPermanently;
window.pauseWidgetTimer = pauseWidgetTimer;
window.resumeWidgetTimer = resumeWidgetTimer;
window.handleWidgetBannerAction = handleWidgetBannerAction;
window.handleWidgetPinRequest = handleWidgetPinRequest;

// Экспорты модуля автоматического учета по банковским пушам
window.scoreBankPushNotification = scoreBankPushNotification;
window.parseBankPushText = parseBankPushText;
window.saveAutoExpenseTransaction = saveAutoExpenseTransaction;
window.sendAppLocalNotification = sendAppLocalNotification;
window.isBankPushNotifyOnSaveEnabled = isBankPushNotifyOnSaveEnabled;
window.toggleBankPushNotifyOnSave = toggleBankPushNotifyOnSave;
window.checkBankPushPermissions = checkBankPushPermissions;
window.checkPostNotificationPermission = checkPostNotificationPermission;
window.requestPostNotificationPermission = requestPostNotificationPermission;
window.openBankPushPermissionSettings = openBankPushPermissionSettings;
window.isBankPushAutoExpenseEnabled = isBankPushAutoExpenseEnabled;
window.toggleBankPushAutoExpense = toggleBankPushAutoExpense;
window.initBankPushListener = initBankPushListener;
window.openBankPushModal = openBankPushModal;
window.closeBankPushModal = closeBankPushModal;
window.openBankPushPermissionPrompt = openBankPushPermissionPrompt;
window.closeBankPushPermissionPrompt = closeBankPushPermissionPrompt;
window.handleAcceptBankPushPrompt = handleAcceptBankPushPrompt;
window.checkAndPromptBankPushPermission = checkAndPromptBankPushPermission;

// Автоматическая инициализация слушателя при загрузке скрипта
if (typeof window !== 'undefined') {
  setTimeout(() => {
    initBankPushListener();
  }, 1000);
}
