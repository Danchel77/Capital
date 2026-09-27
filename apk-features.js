/**
 * apk-features.js - Модуль нативных возможностей и виджетов для Android APK
 * 
 * Включает:
 * 1. Определение нативной платформы (APK Capacitor vs PWA vs Browser).
 * 2. Расчет и синхронизацию данных для виджетов домашнего экрана смартфона.
 * 3. Два интерактивных варианта виджета:
 *    - Полный (4x2): круговые графики недели и месяца + остатки + быстрый расход.
 *    - Компактный (2x2): остаток и круговой прогресс текущего месяца.
 * 4. Интерактивный хаб предпросмотра и закрепления виджетов.
 * 5. Всплывающую шторку-предложение добавить виджет (с правилами как у PWA: 1 раз в сутки, свайп, 10с автоскрытие).
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
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.navigator.standalone === true ||
    document.referrer.includes('android-app://')
  );
}

// 2. Расчет живых данных для виджета
function getLiveWidgetData() {
  const today = new Date();
  const plan = window.Cache?.budgetPlan || {};
  const monthlyLimit = parseFloat(plan.monthlyVariableLimit) || 0;
  const weeklyLimit = monthlyLimit > 0 ? Math.round(monthlyLimit / 4.33) : 0;

  const targetYear = today.getFullYear();
  const targetMonth = today.getMonth();
  const targetMonthKey = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`;

  const dayOfWeek = today.getDay();
  const diffToMonday = (dayOfWeek + 6) % 7;
  const startOfWeek = new Date(targetYear, targetMonth, today.getDate() - diffToMonday, 0, 0, 0, 0);
  const endOfWeek = new Date(targetYear, targetMonth, today.getDate() - diffToMonday + 6, 23, 59, 59, 999);
  const startOfWeekTime = startOfWeek.getTime();
  const endOfWeekTime = endOfWeek.getTime();

  let monthlySpent = 0;
  let weeklySpent = 0;

  const currentMonthObj = (window.Cache?.transactions || []).find(m => m.id === targetMonthKey);
  if (currentMonthObj && Array.isArray(currentMonthObj.items)) {
    currentMonthObj.items.forEach(tx => {
      const isExpense = tx.type === 'Расход' || tx.type === 'expense' || String(tx.type || '').trim().toLowerCase() === 'расход';
      const isExcluded = !!(tx.excludeFromBudget || tx.isExcludedFromBudget);
      if (!isExpense || isExcluded) return;
      const val = typeof tx.amount === 'number' ? tx.amount : (parseFloat(String(tx.amount || 0).replace(/\s/g, '').replace(/,/g, '.')) || 0);
      if (val <= 0) return;
      monthlySpent += val;

      const txTime = tx.dayTimestamp || tx.timestamp || 0;
      if (txTime >= startOfWeekTime && txTime <= endOfWeekTime) {
        weeklySpent += val;
      }
    });
  }

  // Если начало текущей недели выпало на предшествующий месяц
  const startWeekMonthKey = `${startOfWeek.getFullYear()}-${String(startOfWeek.getMonth() + 1).padStart(2, '0')}`;
  if (startWeekMonthKey !== targetMonthKey) {
    const prevMonthObj = (window.Cache?.transactions || []).find(m => m.id === startWeekMonthKey);
    if (prevMonthObj && Array.isArray(prevMonthObj.items)) {
      prevMonthObj.items.forEach(tx => {
        const isExpense = tx.type === 'Расход' || tx.type === 'expense' || String(tx.type || '').trim().toLowerCase() === 'расход';
        const isExcluded = !!(tx.excludeFromBudget || tx.isExcludedFromBudget);
        if (!isExpense || isExcluded) return;
        const txTime = tx.dayTimestamp || tx.timestamp || 0;
        if (txTime >= startOfWeekTime && txTime <= endOfWeekTime) {
          const val = typeof tx.amount === 'number' ? tx.amount : (parseFloat(String(tx.amount || 0).replace(/\s/g, '').replace(/,/g, '.')) || 0);
          if (val > 0) weeklySpent += val;
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
    updatedAt: `${hours}:${minutes}`,
    timestamp: Date.now()
  };
}

// 3. Синхронизация данных виджета в локальное и нативное хранилище
function syncWidgetData() {
  try {
    const data = getLiveWidgetData();
    localStorage.setItem('budget_widget_data', JSON.stringify(data));

    // Интеграция с нативным хранилищем Capacitor Preferences
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

// 4. Генерация HTML для кругового кольца (SVG)
function renderWidgetCircleSvg(pct, color, size = 64, strokeWidth = 6) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedPct = Math.min(100, Math.max(0, pct));
  const offset = circumference - (clampedPct / 100) * circumference;

  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="transform -rotate-90">
      <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" 
              stroke="rgba(255, 255, 255, 0.08)" stroke-width="${strokeWidth}" fill="transparent" />
      <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" 
              stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" fill="transparent"
              stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
              class="transition-all duration-700 ease-out" />
    </svg>
  `;
}

// 5. Рендеринг Варианта 1: Полный виджет (4x2)
function renderFullWidgetPreviewHtml(data) {
  const format = typeof window.formatMoney === 'function' ? window.formatMoney : (n) => `${Math.round(n).toLocaleString('ru-RU')} ₽`;
  const weekColor = data.weeklyOverbudget ? '#FF453A' : '#30D158';
  const monthColor = data.monthlyOverbudget ? '#FF453A' : '#6C5DD3';

  return `
    <div class="relative bg-gradient-to-br from-[#181B24] to-[#12151C] border border-[#6C5DD3]/30 rounded-[26px] p-4 sm:p-5 shadow-2xl text-white select-none overflow-hidden group">
      <!-- Фоновый мягкий ореол -->
      <div class="absolute -top-12 -right-12 w-36 h-36 bg-[#6C5DD3]/15 rounded-full blur-2xl pointer-events-none"></div>

      <!-- Шапка виджета -->
      <div class="flex items-center justify-between mb-3.5 pb-2.5 border-b border-white/5">
        <div class="flex items-center gap-2">
          <div class="w-6 h-6 rounded-lg bg-[#6C5DD3]/25 flex items-center justify-center text-[#8C7DFF]">
            <i data-lucide="wallet" class="w-3.5 h-3.5"></i>
          </div>
          <span class="text-xs font-bold text-gray-200 tracking-tight">Семейный бюджет</span>
          <span class="text-[9px] font-semibold bg-[#6C5DD3]/20 text-[#8C7DFF] border border-[#6C5DD3]/30 px-1.5 py-0.2 rounded-full">Виджет 4×2</span>
        </div>
        <div class="flex items-center gap-1.5 text-[10px] text-gray-400 font-mono">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>${data.updatedAt}</span>
        </div>
      </div>

      <!-- Два блока со шкалами: Неделя и Месяц -->
      <div class="grid grid-cols-2 gap-3 mb-3.5">
        <!-- Левый блок: Неделя -->
        <div class="bg-[#0F1117]/80 border border-white/5 rounded-2xl p-3 flex items-center gap-3">
          <div class="relative flex-shrink-0 flex items-center justify-center">
            ${renderWidgetCircleSvg(data.weeklyPct, weekColor, 54, 5.5)}
            <span class="absolute text-[11px] font-black text-white font-mono">${data.weeklyPct}%</span>
          </div>
          <div class="min-w-0 flex-1">
            <span class="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Неделя</span>
            <span class="text-sm sm:text-base font-extrabold text-white block truncate leading-tight mt-0.5">${format(data.weeklyAvailable)}</span>
            <span class="text-[9px] text-[#848D99] block truncate">из ${format(data.weeklyLimit)}</span>
          </div>
        </div>

        <!-- Правый блок: Месяц -->
        <div class="bg-[#0F1117]/80 border border-white/5 rounded-2xl p-3 flex items-center gap-3">
          <div class="relative flex-shrink-0 flex items-center justify-center">
            ${renderWidgetCircleSvg(data.monthlyPct, monthColor, 54, 5.5)}
            <span class="absolute text-[11px] font-black text-white font-mono">${data.monthlyPct}%</span>
          </div>
          <div class="min-w-0 flex-1">
            <span class="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Месяц</span>
            <span class="text-sm sm:text-base font-extrabold text-white block truncate leading-tight mt-0.5">${format(data.monthlyAvailable)}</span>
            <span class="text-[9px] text-[#848D99] block truncate">В день: ${format(data.dailyBudget)}</span>
          </div>
        </div>
      </div>

      <!-- Нижняя строка: Быстрые действия -->
      <div class="flex items-center justify-between gap-2 pt-1">
        <span class="text-[10px] text-gray-400 truncate">
          Осталось дней: <strong class="text-white">${data.daysRemaining}</strong>
        </span>
        <button type="button" onclick="triggerWidgetAddExpense()" class="px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#6C5DD3] to-[#8C7DFF] hover:opacity-90 active:scale-95 text-white text-[11px] font-bold shadow-md shadow-[#6C5DD3]/20 flex items-center gap-1.5 cursor-pointer transition-all">
          <i data-lucide="plus" class="w-3.5 h-3.5"></i>
          <span>Расход</span>
        </button>
      </div>
    </div>
  `;
}

// 6. Рендеринг Варианта 2: Компактный виджет (2x2)
function renderCompactWidgetPreviewHtml(data) {
  const format = typeof window.formatMoney === 'function' ? window.formatMoney : (n) => `${Math.round(n).toLocaleString('ru-RU')} ₽`;
  const monthColor = data.monthlyOverbudget ? '#FF453A' : '#6C5DD3';

  return `
    <div class="relative max-w-[240px] mx-auto bg-gradient-to-br from-[#181B24] to-[#12151C] border border-[#6C5DD3]/30 rounded-[26px] p-4 shadow-2xl text-white select-none overflow-hidden group">
      <!-- Фоновый ореол -->
      <div class="absolute -top-10 -right-10 w-28 h-28 bg-[#6C5DD3]/15 rounded-full blur-xl pointer-events-none"></div>

      <!-- Шапка -->
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-1.5">
          <div class="w-5 h-5 rounded-md bg-[#6C5DD3]/25 flex items-center justify-center text-[#8C7DFF]">
            <i data-lucide="calendar" class="w-3 h-3"></i>
          </div>
          <span class="text-[11px] font-bold text-gray-200">Остаток месяца</span>
        </div>
        <span class="text-[9px] font-semibold bg-[#6C5DD3]/20 text-[#8C7DFF] border border-[#6C5DD3]/30 px-1.5 py-0.2 rounded-full">2×2</span>
      </div>

      <!-- Центральный круговой график -->
      <div class="flex flex-col items-center justify-center my-1">
        <div class="relative flex items-center justify-center mb-2">
          ${renderWidgetCircleSvg(data.monthlyPct, monthColor, 80, 7)}
          <div class="absolute flex flex-col items-center justify-center">
            <span class="text-xs font-black text-white font-mono">${data.monthlyPct}%</span>
            <span class="text-[8px] text-gray-400 uppercase font-bold">исчерпано</span>
          </div>
        </div>

        <span class="text-lg font-black text-white tracking-tight leading-tight">${format(data.monthlyAvailable)}</span>
        <span class="text-[10px] text-gray-400 mt-0.5">В день: ${format(data.dailyBudget)} • ${data.daysRemaining} дн.</span>
      </div>

      <!-- Быстрая кнопка -->
      <div class="mt-3 pt-2 border-t border-white/5 flex justify-center">
        <button type="button" onclick="triggerWidgetAddExpense()" class="w-full py-1.5 rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 text-xs font-bold text-[#A594FD] border border-white/10 flex items-center justify-center gap-1.5 cursor-pointer transition-all">
          <i data-lucide="plus" class="w-3.5 h-3.5"></i>
          <span>Внести расход</span>
        </button>
      </div>
    </div>
  `;
}

// 7. Быстрый переход к добавлению расхода
function triggerWidgetAddExpense() {
  if (typeof closeWidgetHubModal === 'function') closeWidgetHubModal();
  if (typeof closeProfileModal === 'function') closeProfileModal();

  if (typeof window.switchTab === 'function') {
    window.switchTab('transactions');
  }
  setTimeout(() => {
    const formContainer = document.getElementById('tx-form-container');
    if (formContainer && formContainer.classList.contains('hidden')) {
      if (typeof window.toggleForm === 'function') {
        window.toggleForm('tx-form-container', 'tx-submit-btn', 'Сохранить', 'tx-form', 'tx');
      }
    }
  }, 200);
}

// 8. Модальное окно управления и предпросмотра виджетов (Widget Hub)
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

function renderWidgetHubContent() {
  const modal = document.getElementById('widget-hub-modal');
  if (!modal) return;

  const data = getLiveWidgetData();

  modal.innerHTML = `
    <div class="relative bg-[#181B24] border border-white/10 rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl space-y-4 my-auto">
      <!-- Шапка модалки -->
      <div class="flex items-center justify-between pb-3 border-b border-white/5">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-2xl bg-[#6C5DD3]/20 border border-[#6C5DD3]/40 flex items-center justify-center text-[#8C7DFF]">
            <i data-lucide="layout-grid" class="w-5 h-5"></i>
          </div>
          <div>
            <h3 class="text-base font-bold text-white leading-tight">Виджеты на рабочий стол</h3>
            <span class="text-xs text-gray-400">Остаток недели и месяца на экране</span>
          </div>
        </div>
        <button type="button" onclick="closeWidgetHubModal()" class="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-all cursor-pointer">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <!-- Переключатель вариантов виджета -->
      <div class="flex p-1 bg-[#12151C] rounded-2xl border border-white/5">
        <button type="button" onclick="setWidgetHubTab('full')" class="flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${currentWidgetTab === 'full' ? 'bg-[#6C5DD3] text-white shadow-md' : 'text-gray-400 hover:text-white'}">
          <i data-lucide="columns-2" class="w-3.5 h-3.5"></i>
          <span>Полный (4×2)</span>
        </button>
        <button type="button" onclick="setWidgetHubTab('compact')" class="flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${currentWidgetTab === 'compact' ? 'bg-[#6C5DD3] text-white shadow-md' : 'text-gray-400 hover:text-white'}">
          <i data-lucide="square" class="w-3.5 h-3.5"></i>
          <span>Компактный (2×2)</span>
        </button>
      </div>

      <!-- Живой предпросмотр выбранного виджета -->
      <div class="pt-1">
        ${currentWidgetTab === 'full' ? renderFullWidgetPreviewHtml(data) : renderCompactWidgetPreviewHtml(data)}
      </div>

      <!-- Инструкция по добавлению на экран смартфона -->
      <div class="p-3.5 rounded-2xl bg-[#12151C] border border-white/5 space-y-2 text-xs">
        <div class="flex items-center gap-2 text-[#A594FD] font-semibold text-[11px]">
          <i data-lucide="sparkles" class="w-4 h-4"></i>
          <span>Как вынести виджет на экран Android:</span>
        </div>
        <ol class="space-y-1.5 text-gray-300 text-[11px] pl-4 list-decimal marker:text-[#6C5DD3] marker:font-bold leading-snug">
          <li>Удерживайте палец на <strong>свободном месте</strong> экрана телефона.</li>
          <li>В нижнем системном меню нажмите <strong>«Виджеты»</strong>.</li>
          <li>Найдите приложение <strong>«Семейный бюджет»</strong> и перетащите виджет на экран.</li>
        </ol>
      </div>

      <!-- Кнопки действий -->
      <div class="flex items-center gap-2 pt-1">
        <button type="button" onclick="handleWidgetPinRequest('${currentWidgetTab}')" class="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-[#6C5DD3] to-[#8C7DFF] hover:opacity-90 active:scale-95 text-white text-xs font-bold shadow-lg shadow-[#6C5DD3]/25 flex items-center justify-center gap-2 cursor-pointer transition-all">
          <i data-lucide="pin" class="w-4 h-4"></i>
          <span>Закрепить на экране</span>
        </button>
        <button type="button" onclick="refreshWidgetDataAction()" class="p-3 rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 text-gray-300 hover:text-white border border-white/10 flex items-center justify-center cursor-pointer transition-all" title="Обновить данные виджета">
          <i data-lucide="refresh-cw" class="w-4 h-4"></i>
        </button>
      </div>
    </div>
  `;

  if (typeof lucide !== 'undefined') lucide.createIcons({ root: modal });
}

// 9. Закрепление виджета через нативный AppWidgetManager или подсказка
function handleWidgetPinRequest(variant) {
  syncWidgetData();

  // Если плагин Capacitor поддерживает нативный запрос закрепления виджета (Android 8.0+)
  if (window.Capacitor?.Plugins?.AppWidget?.requestPin) {
    window.Capacitor.Plugins.AppWidget.requestPin({ variant })
      .then(() => {
        if (typeof showToast === 'function') showToast('Виджет отправлен на главный экран');
      })
      .catch(() => {
        showManualPinDialog();
      });
  } else {
    showManualPinDialog();
  }
}

function showManualPinDialog() {
  if (typeof showToast === 'function') {
    showToast('Удерживайте палец на рабочем столе смартфона и выберите «Виджеты»', false);
  }
}

function refreshWidgetDataAction() {
  const data = syncWidgetData();
  renderWidgetHubContent();
  if (typeof showToast === 'function') {
    showToast(`Данные виджета обновлены (${data.updatedAt})`);
  }
}

// 10. Всплывающая шторка-предложение добавить виджет (с теми же правилами, что у PWA)
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
  // В PWA и обычном браузере виджеты на рабочий стол смартфонов не поддерживаются системой
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
  const banner = document.getElementById('widget-install-banner');
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
window.triggerWidgetAddExpense = triggerWidgetAddExpense;
window.checkAndShowWidgetPrompt = checkAndShowWidgetPrompt;
window.hideWidgetBanner = hideWidgetBanner;
window.dismissWidgetBannerForToday = dismissWidgetBannerForToday;
window.dismissWidgetBannerPermanently = dismissWidgetBannerPermanently;
window.pauseWidgetTimer = pauseWidgetTimer;
window.resumeWidgetTimer = resumeWidgetTimer;
window.handleWidgetBannerAction = handleWidgetBannerAction;
window.handleWidgetPinRequest = handleWidgetPinRequest;
window.refreshWidgetDataAction = refreshWidgetDataAction;
