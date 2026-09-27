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
function renderWidgetCircleSvg(pct, color, size = 42, strokeWidth = 4.2) {
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

// 5. Рендеринг Варианта 1: 4×1 виджет (Недельные траты + Траты за месяц)
function renderFullWidgetPreviewHtml(data) {
  const format = typeof window.formatMoney === 'function' ? window.formatMoney : (n) => `${Math.round(n).toLocaleString('ru-RU')} ₽`;
  const weekColor = data.weeklyOverbudget ? '#FF453A' : (data.weeklyPct >= 80 ? '#FF9F0A' : '#30D158');
  const monthColor = data.monthlyOverbudget ? '#FF453A' : (data.monthlyPct >= 80 ? '#FF9F0A' : '#30D158');
  const bgOpacity = (data.bgOpacity !== undefined ? data.bgOpacity : 75) / 100;

  return `
    <div class="relative w-full rounded-2xl border transition-all duration-300 select-none overflow-hidden" 
         style="background-color: rgba(22, 24, 34, ${bgOpacity}); border-color: rgba(255, 255, 255, ${Math.min(0.2, bgOpacity * 0.25)});">
      
      <div class="p-3.5 flex items-center justify-between gap-3">
        <!-- 1. Слева: Недельные траты -->
        <div class="flex-1 min-w-0">
          <span class="text-[9px] font-bold text-gray-400 uppercase tracking-wide block leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">Недельные траты</span>
          <div class="flex items-center gap-2 mt-1.5">
            <div class="relative flex items-center justify-center flex-shrink-0">
              ${renderWidgetCircleSvg(data.weeklyPct, weekColor, 44, 4)}
              <span class="absolute text-[9.5px] font-black text-white font-mono drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">${data.weeklyPct}%</span>
            </div>
            <div class="min-w-0 flex-1">
              <span class="text-[13.5px] font-bold text-white block leading-tight tracking-tight drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] truncate">${format(data.weeklySpent)}</span>
              <span class="text-[9.5px] text-[#8898AA] block leading-none truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] mt-0.5">из ${format(data.weeklyLimit)}</span>
            </div>
          </div>
        </div>

        <!-- Разделитель -->
        <div class="w-[1px] h-9 bg-white/15 flex-shrink-0"></div>

        <!-- 2. Справа: Траты за месяц -->
        <div class="flex-[1.35] min-w-0">
          <span class="text-[9px] font-bold text-gray-400 uppercase tracking-wide block leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">Траты за месяц</span>
          <span class="text-[13px] font-bold text-white block leading-tight tracking-tight drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] truncate mt-1">${format(data.monthlySpent)} из ${format(data.monthlyLimit)}</span>

          <!-- Линейный прогресс-бар месяца -->
          <div class="w-full h-1.5 bg-white/15 rounded-full overflow-hidden my-1.5">
            <div class="h-full rounded-full transition-all duration-700" style="width: ${Math.min(100, Math.max(0, data.monthlyPct))}%; background-color: ${monthColor};"></div>
          </div>

          <div class="flex items-center justify-between text-[9.5px] text-[#8898AA] leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
            <span class="truncate">Остаток: ${format(data.monthlyAvailable)}</span>
            <span class="font-semibold text-gray-300 ml-1">${data.monthlyPct}%</span>
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
      
      <div class="p-3 flex items-center justify-between gap-3">
        <div class="relative flex items-center justify-center flex-shrink-0">
          ${renderWidgetCircleSvg(data.monthlyPct, monthColor, 44, 4)}
          <span class="absolute text-[9.5px] font-black text-white font-mono drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">${data.monthlyPct}%</span>
        </div>

        <div class="flex-1 min-w-0">
          <span class="text-[9px] font-bold text-gray-400 uppercase tracking-wide block leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">Траты за месяц</span>
          <span class="text-[14px] font-bold text-white block leading-tight mt-1 tracking-tight drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] truncate">${format(data.monthlySpent)}</span>
          <span class="text-[9.5px] text-[#8898AA] block leading-none truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] mt-0.5">из ${format(data.monthlyLimit)}</span>
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
        <button type="button" onclick="triggerQuickNewExpense()" class="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-[#6C5DD3] to-[#8C7DFF] hover:opacity-95 active:scale-95 text-white text-xs font-bold shadow-md shadow-[#6C5DD3]/30 flex items-center justify-center gap-1.5 cursor-pointer transition-all">
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
  renderWidgetHubContent();
}

function handleWidgetOpacityChange(val) {
  const opacity = parseInt(val, 10);
  localStorage.setItem('budget_widget_bg_opacity', opacity);
  
  const valLabel = document.getElementById('widget-opacity-val-label');
  if (valLabel) valLabel.textContent = `${opacity}%`;

  syncWidgetData();
  
  const previewContainer = document.getElementById('widget-preview-area');
  if (previewContainer) {
    const data = getLiveWidgetData();
    if (currentWidgetTab === 'full') {
      previewContainer.innerHTML = renderFullWidgetPreviewHtml(data);
    } else if (currentWidgetTab === 'compact') {
      previewContainer.innerHTML = renderCompactWidgetPreviewHtml(data);
    } else {
      previewContainer.innerHTML = renderActionWidgetPreviewHtml(data);
    }
    if (typeof lucide !== 'undefined') lucide.createIcons({ root: previewContainer });
  }
}

function renderWidgetHubContent() {
  const modal = document.getElementById('widget-hub-modal');
  if (!modal) return;

  const data = getLiveWidgetData();
  const currentOpacity = data.bgOpacity !== undefined ? data.bgOpacity : 75;

  modal.innerHTML = `
    <div class="relative bg-[#161822] border border-white/10 rounded-3xl p-5 sm:p-6 max-w-sm w-full shadow-2xl space-y-4 my-auto animate-in fade-in zoom-in duration-200">
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
        <button type="button" onclick="setWidgetHubTab('full')" class="flex-1 py-2 px-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${currentWidgetTab === 'full' ? 'bg-[#6C5DD3] text-white shadow-md' : 'text-gray-400 hover:text-white'}">
          <i data-lucide="columns-2" class="w-3 h-3"></i>
          <span>4×1</span>
        </button>
        <button type="button" onclick="setWidgetHubTab('compact')" class="flex-1 py-2 px-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${currentWidgetTab === 'compact' ? 'bg-[#6C5DD3] text-white shadow-md' : 'text-gray-400 hover:text-white'}">
          <i data-lucide="pie-chart" class="w-3 h-3"></i>
          <span>2×1 Месяц</span>
        </button>
        <button type="button" onclick="setWidgetHubTab('action')" class="flex-1 py-2 px-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${currentWidgetTab === 'action' ? 'bg-[#6C5DD3] text-white shadow-md' : 'text-gray-400 hover:text-white'}">
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

      <!-- Настройка прозрачности фона виджета -->
      <div class="bg-[#0F1118] p-3.5 rounded-2xl border border-white/5 space-y-2">
        <div class="flex items-center justify-between text-xs">
          <div class="flex items-center gap-1.5 text-gray-300 font-semibold">
            <i data-lucide="sliders" class="w-3.5 h-3.5 text-[#8C7DFF]"></i>
            <span>Прозрачность фона</span>
          </div>
          <span id="widget-opacity-val-label" class="text-xs font-bold text-[#8C7DFF] font-mono">${currentOpacity}%</span>
        </div>
        <input type="range" min="0" max="100" step="5" value="${currentOpacity}" 
               oninput="handleWidgetOpacityChange(this.value)"
               class="w-full accent-[#6C5DD3] bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer">
        <div class="flex justify-between text-[10px] text-gray-500 font-medium">
          <span>0% (Прозрачный)</span>
          <span>50%</span>
          <span>100% (Плотный)</span>
        </div>
        <p class="text-[10px] text-gray-400 leading-tight pt-1">
          💡 Прозрачность можно также настроить системно: зажмите виджет на рабочем столе и выберите <strong>«Настройки виджета»</strong>.
        </p>
      </div>

      <!-- Кнопка добавления на экран -->
      <div class="pt-1">
        <button type="button" onclick="handleWidgetPinRequest('${currentWidgetTab}')" class="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-[#6C5DD3] to-[#8C7DFF] hover:opacity-95 active:scale-95 text-white text-xs font-bold shadow-lg shadow-[#6C5DD3]/30 flex items-center justify-center gap-2 cursor-pointer transition-all">
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

  // 2. Пользователь отключил навсегда
  if (localStorage.getItem('widget_prompt_dismissed_permanently') === 'true') return false;

  // 3. Частота: не чаще одного раза в сутки
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

// 11. Глобальный экспорт функций
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
