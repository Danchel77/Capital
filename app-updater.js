// ============================================================
// МОДУЛЬ ОБНОВЛЕНИЯ И УСТАНОВКИ ПРИЛОЖЕНИЯ (PWA / APK)
// ============================================================

window.APP_VERSION = '1.0.2';
window.GITHUB_REPO = 'Danchel77/Capital';
window.APK_DOWNLOAD_URL = `https://github.com/${window.GITHUB_REPO}/releases/download/latest/FamilyBudget.apk`;
window.RELEASES_API_URL = `https://api.github.com/repos/${window.GITHUB_REPO}/releases/latest`;

// Helper для строгого семантического сравнения версий (например, 1.0.1 > 1.0.0)
function compareSemver(v1, v2) {
  const p1 = String(v1 || '0').replace(/^v/i, '').split('.').map(x => parseInt(x, 10) || 0);
  const p2 = String(v2 || '0').replace(/^v/i, '').split('.').map(x => parseInt(x, 10) || 0);
  const len = Math.max(p1.length, p2.length);
  for (let i = 0; i < len; i++) {
    const num1 = p1[i] || 0;
    const num2 = p2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}
window.compareSemver = compareSemver;

// Глобальный перехват события установки PWA
window.deferredPwaPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.deferredPwaPrompt = e;
  
  // Показываем плашку или кнопку установки, если мы в браузере
  if (typeof updateInstallerUI === 'function') {
    updateInstallerUI();
  }
});

// Helper to detect native Capacitor app
function checkIsNativeApp() {
  if (typeof window.isNativeAppPlatform === 'function') {
    return window.isNativeAppPlatform();
  }
  return !!(window.Capacitor?.isNativePlatform && window.Capacitor.isNativePlatform() === true);
}

// Проверка наличия доступных обновлений
async function checkAppUpdates(isManual = false) {
  const isNative = checkIsNativeApp();
  // В обычном браузере или PWA фоновое окно ОБНОВЛЕНИЯ APK НЕ ПОКАЗЫВАЕТСЯ НИКОГДА
  if (!isManual && !isNative) {
    return;
  }

  if (isManual) {
    showToast('Проверка обновлений...', false, true);
  }

  try {
    const res = await fetch(window.RELEASES_API_URL, { cache: 'no-store' });
    if (!res.ok) {
      if (isManual) showToast('Не удалось проверить обновления', true);
      return;
    }

    const data = await res.json();
    const releaseNotes = data.body || 'Улучшения производительности и исправления ошибок.';
    const publishedAt = data.published_at ? new Date(data.published_at).toLocaleDateString('ru-RU') : '';
    const releaseTimestamp = data.published_at ? new Date(data.published_at).getTime() : 0;
    const remoteTag = (data.tag_name || '1.0.0').replace(/^v/i, '');
    const currentAppVer = window.APP_VERSION || '1.0.1';

    // Синхронизируем установленную версию с текущей версией запущенного кода
    let installedVersion = localStorage.getItem('app_installed_version');
    let installedTimestamp = parseInt(localStorage.getItem('app_installed_release_timestamp') || '0', 10);

    if (!installedVersion || compareSemver(currentAppVer, installedVersion) > 0) {
      installedVersion = currentAppVer;
      localStorage.setItem('app_installed_version', installedVersion);
      if (releaseTimestamp > 0 && (!installedTimestamp || releaseTimestamp > installedTimestamp)) {
        localStorage.setItem('app_installed_release_timestamp', releaseTimestamp.toString());
        installedTimestamp = releaseTimestamp;
      }
    }

    // Сравнение версий
    const isNewerTag = (remoteTag !== 'latest' && (compareSemver(remoteTag, installedVersion) > 0 || compareSemver(remoteTag, currentAppVer) > 0));
    const isNewerTime = releaseTimestamp > 0 && installedTimestamp > 0 && releaseTimestamp > installedTimestamp && (remoteTag !== installedVersion);

    // Новое обновление доступно, если на сервере более свежий тег или время публикации
    const isNewer = isNewerTag || isNewerTime;

    if (!isNewer) {
      if (isManual) {
        if (document.getElementById('toast-container')) document.getElementById('toast-container').classList.add('hidden');
        showToast('У вас установлена самая свежая версия!');
      }
      return;
    }

    if (document.getElementById('toast-container')) document.getElementById('toast-container').classList.add('hidden');
    showUpdateAvailableModal(data.tag_name || 'latest', releaseNotes, publishedAt, releaseTimestamp);
  } catch (err) {
    console.warn('Ошибка проверки обновлений:', err);
    if (isManual) showToast('Ошибка сети при проверке обновлений', true);
  }
}

/**
 * Преобразует текст описания релиза из Markdown в структурированные аккуратные карточки
 */
function formatReleaseNotesHtml(rawNotes) {
  if (!rawNotes || typeof rawNotes !== 'string') {
    return '<p class="text-xs text-gray-300">Улучшения производительности и исправления ошибок.</p>';
  }

  // Удаляем эмодзи для соответствия строгому UI-стилю
  let text = rawNotes.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/gu, '').trim();

  // Удаляем заголовок "### Что нового..." если он дублирует шапку
  text = text.replace(/^#+\s*Что нового[^\n]*\n?/gim, '').trim();

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const items = [];

  for (const line of lines) {
    const cleanLine = line.replace(/^[-*•]\s+/, '').replace(/^\d+\.\s+/, '').trim();
    if (!cleanLine) continue;

    // Парсим формат вида: **Заголовок:** подробное описание
    const match = cleanLine.match(/^\*\*([^*]+)\*\*:?\s*(.*)$/);
    if (match) {
      const title = match[1].trim();
      const desc = match[2].trim();
      items.push(`
        <div class="flex items-start gap-2.5 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.05] transition-colors">
          <div class="w-2 h-2 rounded-full bg-[#6C5DD3] mt-1.5 flex-shrink-0 shadow-[0_0_8px_rgba(108,93,211,0.8)]"></div>
          <div class="text-xs leading-relaxed flex-1">
            <span class="font-semibold text-white block">${escapeHtml(title)}</span>
            ${desc ? `<span class="text-gray-300 text-[11.5px] mt-0.5 block leading-normal">${escapeHtml(desc)}</span>` : ''}
          </div>
        </div>
      `);
    } else {
      const formatted = cleanLine.replace(/\*\*([^*]+)\*\*/g, '<strong class="text-white font-semibold">$1</strong>');
      items.push(`
        <div class="flex items-start gap-2.5 p-2 rounded-xl bg-white/[0.02] border border-white/[0.04]">
          <div class="w-1.5 h-1.5 rounded-full bg-indigo-400/80 mt-1.5 flex-shrink-0"></div>
          <div class="text-xs text-gray-300 leading-relaxed flex-1">${formatted}</div>
        </div>
      `);
    }
  }

  if (items.length === 0) {
    return `<p class="text-xs text-gray-300 leading-relaxed">${escapeHtml(text)}</p>`;
  }

  return items.join('');
}
window.formatReleaseNotesHtml = formatReleaseNotesHtml;

// Отображение модального окна обновления
function showUpdateAvailableModal(tag, notes, dateStr, releaseTimestamp) {
  window._isAppUpdateModalOpen = true;

  // Если были активны шторка виджетов или другие баннеры — скрываем их
  if (typeof window.hideWidgetBanner === 'function') {
    window.hideWidgetBanner();
  }
  if (typeof window.closeBankPushPermissionPrompt === 'function') {
    const pushPrompt = document.getElementById('bank-push-permission-prompt-modal');
    if (pushPrompt && !pushPrompt.classList.contains('hidden')) {
      pushPrompt.classList.add('hidden');
    }
  }

  let modal = document.getElementById('app-update-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'app-update-modal';
    modal.className = 'fixed inset-0 z-[1200] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overscroll-contain no-scrollbar transition-all duration-300 select-none';
    document.body.appendChild(modal);
  }

  if (typeof lockBodyScroll === 'function') lockBodyScroll();

  modal.innerHTML = `
    <div class="bg-[#181B24] border border-white/10 rounded-3xl p-5 sm:p-6 max-w-md sm:max-w-lg w-full shadow-2xl space-y-4 animate-in fade-in zoom-in duration-200">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-11 h-11 rounded-2xl bg-[#6C5DD3]/20 border border-[#6C5DD3]/40 flex items-center justify-center text-[#8C7DFF]">
            <i data-lucide="download-cloud" class="w-6 h-6"></i>
          </div>
          <div>
            <h3 class="text-base sm:text-lg font-bold text-white leading-tight">Доступно обновление</h3>
            <span class="text-xs text-[#8C7DFF] font-semibold">${dateStr ? `Релиз от ${dateStr}` : `Версия ${escapeHtml(tag)}`}</span>
          </div>
        </div>
        <button type="button" onclick="closeUpdateModal()" class="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-all cursor-pointer">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <div class="bg-[#0F1117] border border-white/5 rounded-2xl p-3.5 sm:p-4 space-y-2.5">
        <div class="flex items-center justify-between pb-1 border-b border-white/5">
          <span class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Что нового в обновлении:</span>
          <span class="text-[11px] font-mono text-indigo-300 font-semibold">${escapeHtml(tag)}</span>
        </div>
        <div class="space-y-2 max-h-72 sm:max-h-96 overflow-y-auto pr-1 custom-scrollbar">
          ${formatReleaseNotesHtml(notes)}
        </div>
      </div>

      <div class="pt-1 flex flex-col gap-2">
        <button type="button" onclick="downloadApkDirectly(${releaseTimestamp})" class="w-full py-3.5 px-4 rounded-xl bg-[#6C5DD3] hover:bg-[#5b4eb8] active:scale-98 text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#6C5DD3]/25 transition-all cursor-pointer">
          <i data-lucide="download" class="w-4 h-4"></i>
          <span>Обновить сейчас (.APK)</span>
        </button>
        <button type="button" onclick="closeUpdateModal()" class="w-full py-2 px-4 rounded-xl text-gray-400 hover:text-white font-medium text-xs text-center transition-all cursor-pointer">
          Позже
        </button>
      </div>
    </div>
  `;

  modal.classList.remove('hidden');
  if (typeof lucide !== 'undefined') lucide.createIcons({ root: modal });
}

function closeUpdateModal() {
  window._isAppUpdateModalOpen = false;
  const modal = document.getElementById('app-update-modal');
  if (modal) modal.classList.add('hidden');
  if (typeof unlockBodyScroll === 'function') unlockBodyScroll();

  // После закрытия окна обновления (если пользователь отложил)
  // плавно проверяем разрешения пушей и виджеты без наложения
  setTimeout(() => {
    if (typeof window.checkAndPromptBankPushPermission === 'function') {
      window.checkAndPromptBankPushPermission(400);
    }
  }, 800);
}

// Прямое скачивание APK
function downloadApkDirectly(releaseTimestamp) {
  if (releaseTimestamp) {
    try {
      localStorage.setItem('app_installed_release_timestamp', releaseTimestamp.toString());
    } catch (e) {}
  }

  showToast('Загрузка установочного файла началась...');
  closeUpdateModal();

  const a = document.createElement('a');
  a.href = window.APK_DOWNLOAD_URL;
  a.download = 'FamilyBudget.apk';
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Запуск скачивания приложения с аккуратным уведомлением в модальном окне
function startApkDownloadWithHelp() {
  downloadApkDirectly();

  const container = document.getElementById('apk-action-container');
  if (container) {
    container.innerHTML = `
      <div class="p-3 rounded-xl bg-white/[0.04] border border-white/[0.08] space-y-1.5 animate-in fade-in duration-200">
        <div class="flex items-center gap-2 text-white text-xs font-medium">
          <span class="w-2 h-2 rounded-full bg-[#6C5DD3] animate-pulse"></span>
          <span>Загрузка началась</span>
        </div>
        <p class="text-[11px] text-gray-400 leading-snug">
          Нажмите «Открыть» в уведомлении браузера для завершения установки.
        </p>
        <button type="button" onclick="downloadApkDirectly()" class="text-[11px] text-[#8C7DFF] hover:underline cursor-pointer pt-0.5 inline-block">
          Скачать повторно
        </button>
      </div>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons({ root: container });
  }
}

// Запуск процесса установки через быструю кнопку на главном экране (PWA)
async function triggerPwaInstall() {
  if (window.deferredPwaPrompt) {
    window.deferredPwaPrompt.prompt();
    const { outcome } = await window.deferredPwaPrompt.userChoice;
    if (outcome === 'accepted') {
      showToast('Приложение добавлено на главный экран!');
      window.deferredPwaPrompt = null;
      closeAppInstallOptionsModal();
    }
  } else {
    showToast('Нажмите меню браузера и выберите «Добавить на главный экран»', false);
  }
}

// Открытие модального окна выбора варианта установки
function openAppInstallOptionsModal() {
  let modal = document.getElementById('app-install-options-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'app-install-options-modal';
    modal.className = 'fixed inset-0 z-[1200] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-hidden select-none transition-all duration-300';
    modal.onclick = (e) => {
      if (e.target === modal) closeAppInstallOptionsModal();
    };
    modal.addEventListener('wheel', (e) => {
      e.stopPropagation();
    }, { passive: true });
    document.body.appendChild(modal);
  } else {
    modal.className = 'fixed inset-0 z-[1200] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-hidden select-none transition-all duration-300';
  }

  const isNative = (typeof window.isNativeAppPlatform === 'function') 
    ? window.isNativeAppPlatform() 
    : !!(window.Capacitor?.isNativePlatform && window.Capacitor.isNativePlatform() === true);
  if (isNative) {
    if (typeof showToast === 'function') showToast('Приложение уже установлено на вашем телефоне');
    return;
  }

  if (typeof lockBodyScroll === 'function') lockBodyScroll();

  const isPwa = (typeof window.isPwaStandalone === 'function') 
    ? window.isPwaStandalone() 
    : (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true);

  modal.innerHTML = `
    <div class="relative bg-[#161822] border border-white/10 rounded-[28px] p-5 sm:p-6 max-w-sm w-full shadow-2xl space-y-3.5 animate-in fade-in zoom-in duration-200">
      <!-- Шапка -->
      <div class="flex items-center justify-between pb-2.5 border-b border-white/5">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-[#8C7DFF]">
            <i data-lucide="smartphone" class="w-5 h-5"></i>
          </div>
          <div>
            <h3 class="text-base font-bold text-white leading-tight">Установка приложения</h3>
            <span class="text-xs text-gray-400">Выберите способ установки</span>
          </div>
        </div>
        <button type="button" onclick="closeAppInstallOptionsModal()" class="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-all cursor-pointer">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <div class="space-y-2.5 pt-0.5">
        <!-- Вариант 1: Скачать приложение -->
        <div class="bg-[#1B1E2B] border border-white/[0.08] rounded-2xl p-4 transition-colors">
          <div class="flex items-start gap-3">
            <div class="w-8 h-8 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-[#8C7DFF] flex-shrink-0 mt-0.5">
              <i data-lucide="download" class="w-4 h-4"></i>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5">
                <h4 class="text-sm font-semibold text-white">Скачать приложение</h4>
                <span class="text-[9px] font-bold bg-[#6C5DD3]/25 text-[#A594FD] border border-[#6C5DD3]/40 px-1.5 py-0.2 rounded-full">Android</span>
              </div>
              <p class="text-xs text-gray-300 leading-relaxed mt-1">
                Полнофункциональная версия: <strong class="text-white">авто-внесение трат по банковским пушам</strong> прямо после оплаты и живые <strong class="text-white">виджеты на рабочем столе</strong>
              </p>
            </div>
          </div>

          <div id="apk-action-container" class="mt-3.5">
            <button type="button" onclick="startApkDownloadWithHelp()" class="w-full py-2.5 px-4 rounded-xl bg-[#6C5DD3] hover:bg-[#5b4ec2] active:scale-[0.98] text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm">
              <i data-lucide="download" class="w-4 h-4"></i>
              <span>Скачать</span>
            </button>
          </div>
        </div>

        ${(!isPwa && !isNative) ? `
        <!-- Вариант 2: Добавить на главный экран -->
        <div class="bg-[#1B1E2B] border border-white/[0.08] rounded-2xl p-4 transition-colors">
          <div class="flex items-start gap-3">
            <div class="w-8 h-8 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-sky-400 flex-shrink-0 mt-0.5">
              <i data-lucide="layout-grid" class="w-4 h-4"></i>
            </div>
            <div class="flex-1 min-w-0">
              <h4 class="text-sm font-semibold text-white">Добавить на главный экран</h4>
              <p class="text-xs text-gray-400 leading-relaxed mt-0.5">
                Быстрый запуск прямо с рабочего стола телефона без загрузки установочного файла
              </p>
            </div>
          </div>

          <div class="mt-3.5">
            <button type="button" onclick="triggerPwaInstall();" class="w-full py-2.5 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] active:scale-[0.98] text-white text-xs font-semibold border border-white/[0.08] flex items-center justify-center gap-2 transition-all cursor-pointer">
              <i data-lucide="plus" class="w-4 h-4"></i>
              <span>Добавить на экран</span>
            </button>
          </div>
        </div>
        ` : ''}
      </div>

      <div class="pt-1">
        <button type="button" onclick="closeAppInstallOptionsModal()" class="w-full py-1 text-gray-400 hover:text-white font-medium text-xs text-center transition-colors cursor-pointer">
          Закрыть
        </button>
      </div>
    </div>
  `;

  modal.classList.remove('hidden');
  if (typeof lucide !== 'undefined') lucide.createIcons({ root: modal });
}

function closeAppInstallOptionsModal() {
  const modal = document.getElementById('app-install-options-modal');
  if (modal) modal.classList.add('hidden');
  if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
}

// Автоматическая фоновая проверка при запуске нативного APK (с задержкой 2.5 сек)
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (checkIsNativeApp()) {
      checkAppUpdates(false);
    }
  }, 2500);
});

// Экспорт глобальных функций
window.checkAppUpdates = checkAppUpdates;
window.showUpdateAvailableModal = showUpdateAvailableModal;
window.closeUpdateModal = closeUpdateModal;
window.downloadApkDirectly = downloadApkDirectly;
window.startApkDownloadWithHelp = startApkDownloadWithHelp;
window.triggerPwaInstall = triggerPwaInstall;
window.openAppInstallOptionsModal = openAppInstallOptionsModal;
window.closeAppInstallOptionsModal = closeAppInstallOptionsModal;
