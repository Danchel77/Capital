// ==========================================
// Main Application Entry Point & Navigation
// ==========================================

// Показываем экран загрузки сразу при старте
document.getElementById('loading-screen')?.classList.remove('hidden');

// Слушатель состояния авторизации пользователя (Запуск приложения)
auth.onAuthStateChanged(async user => {
  if (user) {
    document.getElementById('login-screen')?.classList.add('hidden');

    // Обновляем никнейм в шапке
    const nameEl = document.getElementById('header-user-name');
    if (nameEl) {
      const name = user.displayName || (user.email?.includes('@budget.local') ? user.email.replace('@budget.local', '') : user.email?.split('@')[0]) || 'Профиль';
      nameEl.textContent = name;
    }

    if (typeof window.initNewUserIfNeeded === 'function') {
      await window.initNewUserIfNeeded(user);
    }
    if (typeof window.loadUserSettings === 'function') {
      await window.loadUserSettings(user);
    }
    if (typeof window.fetchAllData === 'function') {
      await window.fetchAllData();
    }

    // Переключаемся на вкладку бюджета ТОЛЬКО после применения актуальных данных
    switchTab('budget');

    // Скрываем загрузочный экран, когда приложение полностью готово
    document.getElementById('loading-screen')?.classList.add('hidden');

    // Проверяем и предлагаем установку PWA (только 1 раз в день в обычном браузере)
    checkAndShowPwaInstallPrompt(2500);
  } else {
    document.getElementById('loading-screen')?.classList.add('hidden');
    if (typeof window.closeProfileModal === 'function') window.closeProfileModal();
    if (typeof window.resetGlobalCache === 'function') window.resetGlobalCache();
    if (typeof window.resetAuthFormState === 'function') window.resetAuthFormState();
    if (typeof window.hidePwaInstallBanner === 'function') window.hidePwaInstallBanner();

    // Закрываем любые открытые диалоговые окна
    document.querySelectorAll('[id$="-dialog"]').forEach(d => d.classList.add('hidden'));

    document.getElementById('login-screen')?.classList.remove('hidden');
  }
});

// ==========================================
// iOS-Style Tactile Press Feedback Engine
// ==========================================
// Обеспечивает мгновенный, упругий тактильный отклик (iOS scale/brightness) для всех кнопок и кликабельных элементов.
// Защищен от ложных срабатываний при скролле страницы, быстрых тапах и двойных анимаций.

let activePressedEl = null;
let touchPressTimer = null;
let touchStartX = 0;
let touchStartY = 0;
let isTouchScrolling = false;

function isInteractiveTarget(target) {
  if (!target || typeof target.closest !== 'function') return null;
  const el = target.closest(`
    button:not(:disabled),
    [role="button"],
    .btn-press,
    nav button,
    .context-menu-btn,
    .card-context-menu button,
    .wiz-day-cell,
    .wiz-adopt-chip,
    .icon-option,
    .custom-dropdown-btn,
    .custom-dropdown-item,
    .view-switcher__btn,
    .manage-categories-btn,
    .add-category-btn,
    .interactive-tap,
    #quick-add-btn
  `);
  if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return null;
  return el;
}

function releasePressedElement(el, immediate = false) {
  if (!el) return;
  if (immediate) {
    el.classList.remove('is-pressed');
  } else {
    // Даем зафиксировать визуальный тактильный отклик (~70мс), после чего плавно возвращаем форму
    setTimeout(() => {
      el.classList.remove('is-pressed');
    }, 70);
  }
}

function cancelTouchPress() {
  if (touchPressTimer) {
    clearTimeout(touchPressTimer);
    touchPressTimer = null;
  }
  if (activePressedEl) {
    activePressedEl.classList.remove('is-pressed');
    activePressedEl = null;
  }
}

// 1. Обработка Touch-событий (смартфоны и планшеты) — мгновенная реакция без ватности
document.addEventListener('touchstart', (e) => {
  if (e.touches.length !== 1) {
    cancelTouchPress();
    return;
  }

  const target = isInteractiveTarget(e.target);
  if (!target) {
    cancelTouchPress();
    return;
  }

  cancelTouchPress();

  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
  isTouchScrolling = false;
  activePressedEl = target;

  // Мгновенно активируем отклик при касании (0мс задержки)
  activePressedEl.classList.add('is-pressed');
}, { passive: true });

document.addEventListener('touchmove', (e) => {
  if (!activePressedEl || isTouchScrolling || e.touches.length !== 1) return;
  const dx = Math.abs(e.touches[0].clientX - touchStartX);
  const dy = Math.abs(e.touches[0].clientY - touchStartY);

  // Порог сдвига в 6px: если палец сдвинулся, это скролл страницы, снимаем отклик моментально
  if (dx > 6 || dy > 6) {
    isTouchScrolling = true;
    cancelTouchPress();
  }
}, { passive: true });

document.addEventListener('touchend', () => {
  if (activePressedEl && !isTouchScrolling) {
    const el = activePressedEl;
    activePressedEl = null;
    releasePressedElement(el, false);
  } else {
    cancelTouchPress();
  }
  isTouchScrolling = false;
}, { passive: true });

document.addEventListener('touchcancel', () => {
  cancelTouchPress();
  isTouchScrolling = false;
}, { passive: true });

// Снятие нажатия при возникновении скролла в любом контейнере
window.addEventListener('scroll', () => {
  if (activePressedEl) {
    cancelTouchPress();
  }
}, { passive: true });

// 2. Обработка Mouse-событий (Desktop / мышь)
document.addEventListener('mousedown', (e) => {
  if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
  if (e.button !== 0) return;

  const target = isInteractiveTarget(e.target);
  if (!target) return;

  target.classList.add('is-pressed');

  const onMouseUp = () => {
    releasePressedElement(target, false);
    document.removeEventListener('mouseup', onMouseUp);
    document.removeEventListener('mouseleave', onMouseUp);
  };
  document.addEventListener('mouseup', onMouseUp, { once: true });
  document.addEventListener('mouseleave', onMouseUp, { once: true });
});

// Переключение основных экранов (Табов)
const APP_MAIN_TABS = ['budget', 'transactions', 'deposits', 'broker'];

function getCurrentActiveTab() {
  return APP_MAIN_TABS.find(t => {
    const el = document.getElementById(t + '-tab');
    return el && !el.classList.contains('hidden');
  }) || 'budget';
}

function switchTab(tab) {
  if (typeof closeCardContextMenu === 'function') closeCardContextMenu();
  if (typeof disableSelectionMode === 'function') disableSelectionMode();

  // Удаляем любые остаточные классы анимации подсветки транзакций и сбрасываем ID
  document.querySelectorAll('.tx-row-new').forEach(el => el.classList.remove('tx-row-new'));
  window.lastAddedTxIds = null;

  APP_MAIN_TABS.forEach(t => {
    const el = document.getElementById(t + '-tab');
    const navBtn = document.getElementById('nav-' + t);
    if (el) {
      el.classList.add('hidden');
      el.classList.remove('tab-enter-active');
      el.style.transform = '';
      el.style.transition = '';
      el.style.position = '';
      el.style.top = '';
      el.style.left = '';
      el.style.width = '';
      el.style.backgroundColor = '';
      el.style.zIndex = '';
      el.style.minHeight = '';
      el.style.opacity = '';
      el.style.transformOrigin = '';
    }
    if (navBtn) navBtn.classList.replace('text-blue-400', 'text-gray-500');
  });

  const activeTabEl = document.getElementById(tab + '-tab');
  const activeNavBtn = document.getElementById('nav-' + tab);
  if (activeTabEl) {
    activeTabEl.classList.remove('hidden');
    requestAnimationFrame(() => {
      activeTabEl.classList.add('tab-enter-active');
    });
  }
  if (activeNavBtn) activeNavBtn.classList.replace('text-gray-500', 'text-blue-400');

  // Всегда открываем вкладку с позицией прокрутки в самом верху
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  if (document.documentElement) document.documentElement.scrollTop = 0;
  if (document.body) document.body.scrollTop = 0;
  const appContent = document.getElementById('app-content');
  if (appContent) {
    appContent.scrollTop = 0;
    appContent.style.overflowX = '';
    appContent.style.position = '';
  }
  if (activeTabEl) activeTabEl.scrollTop = 0;
  
  // Умный кэшированный рендер вкладок
  if (tab === 'budget') {
    if (window._budgetTabDirty !== false || !window._budgetTabRendered) {
      if (typeof renderBudgetTab === 'function') renderBudgetTab();
      window._budgetTabDirty = false;
      window._budgetTabRendered = true;
    }
  } else if (tab === 'transactions') {
    if (window._transactionsTabDirty !== false || !window._transactionsTabRendered) {
      if (typeof renderTransactions === 'function') renderTransactions();
      window._transactionsTabDirty = false;
      window._transactionsTabRendered = true;
    }
  } else if (tab === 'deposits') {
    if (window._depositsTabDirty !== false || !window._depositsTabRendered) {
      if (typeof renderDeposits === 'function') renderDeposits();
      window._depositsTabDirty = false;
      window._depositsTabRendered = true;
    }
  } else if (tab === 'broker') {
    if (window._brokerTabDirty !== false || !window._brokerTabRendered) {
      if (typeof renderBroker === 'function') renderBroker();
      if (Cache && typeof drawBrokerChart === 'function') setTimeout(drawBrokerChart, 80);
      window._brokerTabDirty = false;
      window._brokerTabRendered = true;
    }
  }
}

// Универсальные хелперы открытия/закрытия форм
function toggleForm(containerId, btnId, btnText, formId, type) {
  const formContainer = document.getElementById(containerId);
  if (!formContainer) return;
  formContainer.classList.toggle('hidden');

  if (currentEditId) {
    currentEditId = null;
    currentEditTable = null;
    const btn = document.getElementById(btnId);
    if (btn) btn.innerText = btnText;
  }

  if (!formContainer.classList.contains('hidden')) {
    const form = document.getElementById(formId);
    if (form) form.reset();
    const today = new Date().toISOString().split('T')[0];

    if (type === 'tx' && typeof addTxRow === 'function') {
      const list = document.getElementById('tx-items-list');
      if (list) list.innerHTML = '';
      addTxRow();
    } else if (type === 'dep') {
      const startInp = document.getElementById('dep-start');
      if (startInp) startInp.value = today;
      const endInp = document.getElementById('dep-end');
      if (endInp) endInp.value = '';
      if (typeof selectDepositGoal === 'function') {
        selectDepositGoal('', 'Без привязки к цели');
      }
      if (typeof updateGoalDropdowns === 'function') {
        updateGoalDropdowns();
      }
    }
  }
}

function closeForm(containerId, btnId, btnText, formId) {
  const container = document.getElementById(containerId);
  if (container) container.classList.add('hidden');
  const form = document.getElementById(formId);
  if (form) form.reset();
  if (formId === 'tx-form') {
    const list = document.getElementById('tx-items-list');
    if (list) list.innerHTML = '';
  }
  if (currentEditId) {
    currentEditId = null;
    currentEditTable = null;
    const btn = document.getElementById(btnId);
    if (btn) btn.innerText = btnText;
  }
}

// ==========================================
// PWA Installation Management (Ultra-Compact Action Pill)
// ==========================================
let pwaPromptTimer = null;
let pwaAutoDismissTimer = null;
let pwaProgressInterval = null;
let pwaTimeRemaining = 10000; // 10 секунд
let pwaTimerPaused = false;
let pwaTouchStartX = 0;
let pwaTouchCurrentX = 0;
let pwaTouchStartY = 0;
let pwaTouchCurrentY = 0;
let pwaIsDragging = false;
window.deferredPwaPrompt = null;

// Перехватываем стандартное событие браузера для установки PWA
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.deferredPwaPrompt = e;
  const btnText = document.getElementById('pwa-install-btn-text');
  if (btnText) btnText.textContent = 'Установить';
});

// Событие успешной установки приложения пользователем
window.addEventListener('appinstalled', () => {
  localStorage.setItem('pwa_prompt_dismissed_permanently', 'true');
  hidePwaInstallBanner();
  window.deferredPwaPrompt = null;
});

// Проверка, запущено ли приложение уже как PWA (standalone)
function isPwaStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
         window.navigator.standalone === true ||
         document.referrer.includes('android-app://');
}

// Проверка, является ли устройство iOS (Safari требует ручного добавления на экран)
function isIOSDevice() {
  const ua = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// Проверка условий показа баннера установки приложения
function shouldShowPwaPrompt() {
  // 1. Уже установлено и открыто как PWA (standalone)
  if (isPwaStandalone()) return false;

  // 2. Пользователь отключил уведомление навсегда или приложение уже установлено
  if (localStorage.getItem('pwa_prompt_dismissed_permanently') === 'true') return false;

  // 3. Ограничение частоты: показываем не чаще одного раза в сутки
  const lastShownDate = localStorage.getItem('pwa_prompt_last_shown_date');
  const todayStr = new Date().toISOString().split('T')[0];
  if (lastShownDate === todayStr) return false;

  return true;
}

// Запуск таймера автозакрытия через 10 секунд с полосой прогресса
function startPwaAutoDismissCountdown() {
  stopPwaAutoDismissCountdown();
  pwaTimeRemaining = 10000;
  pwaTimerPaused = false;

  const progressBar = document.getElementById('pwa-progress-bar');
  if (progressBar) {
    progressBar.style.width = '100%';
  }

  pwaProgressInterval = setInterval(() => {
    if (pwaTimerPaused) return;

    pwaTimeRemaining -= 100;
    if (progressBar) {
      const percent = Math.max(0, (pwaTimeRemaining / 10000) * 100);
      progressBar.style.width = percent + '%';
    }

    if (pwaTimeRemaining <= 0) {
      stopPwaAutoDismissCountdown();
      dismissPwaInstallBannerForToday();
    }
  }, 100);
}

function stopPwaAutoDismissCountdown() {
  if (pwaProgressInterval) {
    clearInterval(pwaProgressInterval);
    pwaProgressInterval = null;
  }
  if (pwaAutoDismissTimer) {
    clearTimeout(pwaAutoDismissTimer);
    pwaAutoDismissTimer = null;
  }
}

function pausePwaTimer() {
  pwaTimerPaused = true;
}

function resumePwaTimer() {
  pwaTimerPaused = false;
}

// Инициализация жеста свайпа (вниз, влево или вправо) для мобильных устройств
function initPwaSwipeGesture() {
  const card = document.getElementById('pwa-banner-card');
  const banner = document.getElementById('pwa-install-banner');
  if (!card || card.dataset.swipeBound === 'true') return;
  card.dataset.swipeBound = 'true';

  card.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    // Если тап пришелся по кнопке или крестику — даем кнопке сработать
    if (e.target.closest('button, a, input')) return;

    pwaTouchStartX = e.touches[0].clientX;
    pwaTouchCurrentX = pwaTouchStartX;
    pwaTouchStartY = e.touches[0].clientY;
    pwaTouchCurrentY = pwaTouchStartY;
    pwaIsDragging = true;
    pausePwaTimer();
    card.style.transition = 'none';
  }, { passive: true });

  card.addEventListener('touchmove', (e) => {
    if (!pwaIsDragging || e.touches.length !== 1) return;
    pwaTouchCurrentX = e.touches[0].clientX;
    pwaTouchCurrentY = e.touches[0].clientY;
    const deltaX = pwaTouchCurrentX - pwaTouchStartX;
    const deltaY = pwaTouchCurrentY - pwaTouchStartY;
    const clampedY = Math.max(-15, deltaY); // Не даем сильно утягивать вверх

    // Перемещаем карточку за пальцем
    card.style.transform = `translate3d(${deltaX}px, ${clampedY}px, 0)`;
    
    // Рассчитываем плавное затухание в зависимости от расстояния смещения
    const distance = Math.hypot(deltaX, Math.max(0, clampedY));
    const opacity = Math.max(0.15, 1 - (distance / 260));
    card.style.opacity = opacity.toString();
  }, { passive: true });

  const endDrag = () => {
    if (!pwaIsDragging) return;
    pwaIsDragging = false;
    const deltaX = pwaTouchCurrentX - pwaTouchStartX;
    const deltaY = pwaTouchCurrentY - pwaTouchStartY;

    const isHorizontalSwipe = Math.abs(deltaX) > 60;
    const isVerticalSwipe = deltaY > 50;

    if (isHorizontalSwipe || isVerticalSwipe) {
      // Плавный вылет карточки по траектории свайпа
      card.style.transition = 'transform 0.4s cubic-bezier(0.2, 0.9, 0.35, 1), opacity 0.35s ease-out';
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        card.style.transform = `translate3d(${deltaX > 0 ? '120%' : '-120%'}, 0, 0)`;
      } else {
        card.style.transform = 'translate3d(0, 160px, 0)';
      }
      card.style.opacity = '0';

      stopPwaAutoDismissCountdown();
      const todayStr = new Date().toISOString().split('T')[0];
      localStorage.setItem('pwa_prompt_last_shown_date', todayStr);

      setTimeout(() => {
        if (banner) {
          banner.classList.add('hidden', 'translate-y-10', 'opacity-0');
          banner.classList.remove('translate-y-0', 'opacity-100');
        }
        card.style.transition = '';
        card.style.transform = '';
        card.style.opacity = '';
      }, 400);
    } else {
      // Мягкий возврат карточки на место без рывков
      card.style.transition = 'transform 0.35s cubic-bezier(0.2, 0.9, 0.35, 1), opacity 0.3s ease-out';
      card.style.transform = 'translate3d(0, 0, 0)';
      card.style.opacity = '1';
      setTimeout(() => {
        card.style.transition = '';
        card.style.transform = '';
        card.style.opacity = '';
      }, 350);
      resumePwaTimer();
    }
    pwaTouchStartX = 0;
    pwaTouchCurrentX = 0;
    pwaTouchStartY = 0;
    pwaTouchCurrentY = 0;
  };

  card.addEventListener('touchend', endDrag, { passive: true });
  card.addEventListener('touchcancel', endDrag, { passive: true });
}

// Показ компактного островка установки
function checkAndShowPwaInstallPrompt(delayMs = 2000) {
  if (!shouldShowPwaPrompt()) return;

  if (pwaPromptTimer) clearTimeout(pwaPromptTimer);
  pwaPromptTimer = setTimeout(() => {
    if (!shouldShowPwaPrompt()) return;
    if (!auth.currentUser) return;

    const banner = document.getElementById('pwa-install-banner');
    if (!banner) return;

    initPwaSwipeGesture();

    const btnText = document.getElementById('pwa-install-btn-text');
    if (isIOSDevice() && !window.deferredPwaPrompt) {
      if (btnText) btnText.textContent = 'Инструкция';
    } else {
      if (btnText) btnText.textContent = 'Установить';
    }

    banner.classList.remove('hidden');
    requestAnimationFrame(() => {
      banner.classList.remove('translate-y-10', 'opacity-0');
      banner.classList.add('translate-y-0', 'opacity-100');
    });

    if (typeof lucide !== 'undefined') lucide.createIcons();

    // Запускаем 10-секундный таймер
    startPwaAutoDismissCountdown();
  }, delayMs);
}

// Вызов установки или инструкций по кнопке
async function triggerPwaInstallPrompt() {
  pausePwaTimer();
  const iosInstructions = document.getElementById('pwa-ios-instructions');

  if (window.deferredPwaPrompt) {
    try {
      await window.deferredPwaPrompt.prompt();
      const { outcome } = await window.deferredPwaPrompt.userChoice;
      if (outcome === 'accepted') {
        localStorage.setItem('pwa_prompt_dismissed_permanently', 'true');
        hidePwaInstallBanner();
      } else {
        dismissPwaInstallBannerForToday();
      }
      window.deferredPwaPrompt = null;
    } catch (e) {
      console.log('PWA prompt error:', e);
    }
  } else if (isIOSDevice()) {
    // На iOS раскрываем ультракомпактную пошаговую инструкцию Safari
    if (iosInstructions) {
      iosInstructions.classList.toggle('hidden');
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  } else {
    // В десктопном браузере без нативного события подсказываем меню
    if (iosInstructions) {
      iosInstructions.innerHTML = `
        <div class="text-[10px] text-gray-300 leading-tight">
          Откройте меню браузера (<strong>⋮</strong> вверху) и выберите <strong class="text-white">«Установить приложение»</strong>.
        </div>
      `;
      iosInstructions.classList.remove('hidden');
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  }
}

// Открытие предложения установки вручную из настроек профиля
function showPwaInstallFromProfile() {
  if (typeof closeProfileModal === 'function') closeProfileModal();

  const banner = document.getElementById('pwa-install-banner');
  if (!banner) return;

  initPwaSwipeGesture();

  const btnText = document.getElementById('pwa-install-btn-text');
  if (isIOSDevice() && !window.deferredPwaPrompt) {
    if (btnText) btnText.textContent = 'Инструкция';
  } else {
    if (btnText) btnText.textContent = 'Установить';
  }

  banner.classList.remove('hidden');
  requestAnimationFrame(() => {
    banner.classList.remove('translate-y-10', 'opacity-0');
    banner.classList.add('translate-y-0', 'opacity-100');
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
  startPwaAutoDismissCountdown();
}

// Скрыть баннер с плавной анимацией
function hidePwaInstallBanner() {
  stopPwaAutoDismissCountdown();
  const banner = document.getElementById('pwa-install-banner');
  if (!banner) return;
  banner.classList.add('translate-y-10', 'opacity-0');
  banner.classList.remove('translate-y-0', 'opacity-100');
  setTimeout(() => {
    banner.classList.add('hidden');
  }, 300);
}

// Отложить показ до следующего дня (кнопка "✕", таймаут 10 секунд или свайп вниз)
function dismissPwaInstallBannerForToday() {
  const todayStr = new Date().toISOString().split('T')[0];
  localStorage.setItem('pwa_prompt_last_shown_date', todayStr);
  hidePwaInstallBanner();
}

// Отключить показ навсегда (кнопка "Больше не показывать")
function dismissPwaInstallBannerPermanently() {
  localStorage.setItem('pwa_prompt_dismissed_permanently', 'true');
  hidePwaInstallBanner();
  if (typeof showToast === 'function') {
    showToast('Напоминание об установке отключено');
  }
}

// Экспорт в глобальную область
window.switchTab = switchTab;
window.toggleForm = toggleForm;
window.closeForm = closeForm;
window.isPwaStandalone = isPwaStandalone;
window.isIOSDevice = isIOSDevice;
window.shouldShowPwaPrompt = shouldShowPwaPrompt;
window.checkAndShowPwaInstallPrompt = checkAndShowPwaInstallPrompt;
window.triggerPwaInstallPrompt = triggerPwaInstallPrompt;
window.showPwaInstallFromProfile = showPwaInstallFromProfile;
window.hidePwaInstallBanner = hidePwaInstallBanner;
window.dismissPwaInstallBannerForToday = dismissPwaInstallBannerForToday;
window.dismissPwaInstallBannerPermanently = dismissPwaInstallBannerPermanently;
window.pausePwaTimer = pausePwaTimer;
window.resumePwaTimer = resumePwaTimer;

