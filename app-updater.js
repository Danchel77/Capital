// ============================================================
// МОДУЛЬ ОБНОВЛЕНИЯ И УСТАНОВКИ ПРИЛОЖЕНИЯ (PWA / APK)
// ============================================================

window.APP_VERSION = '1.0.0';
window.GITHUB_REPO = 'Danchel77/Capital';
window.APK_DOWNLOAD_URL = `https://github.com/${window.GITHUB_REPO}/releases/download/latest/FamilyBudget.apk`;
window.RELEASES_API_URL = `https://api.github.com/repos/${window.GITHUB_REPO}/releases/latest`;

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
function isNativeApp() {
  return !!(window.Capacitor?.isNativePlatform());
}

// Проверка наличия доступных обновлений
async function checkAppUpdates(isManual = false) {
  const isNative = isNativeApp();
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

    // Если приложение запущено в первый раз, сохраняем текущий релиз как установленный
    let installedVersion = localStorage.getItem('app_installed_version');
    let installedTimestamp = parseInt(localStorage.getItem('app_installed_release_timestamp') || '0', 10);

    if (!installedVersion) {
      installedVersion = window.APP_VERSION || '1.0.0';
      localStorage.setItem('app_installed_version', installedVersion);
      if (releaseTimestamp > 0) {
        localStorage.setItem('app_installed_release_timestamp', releaseTimestamp.toString());
        installedTimestamp = releaseTimestamp;
      }
    }

    // Сравнение версий
    const isNewerTag = (remoteTag !== installedVersion && remoteTag !== (window.APP_VERSION || '1.0.0'));
    const isNewerTime = releaseTimestamp > 0 && installedTimestamp > 0 && releaseTimestamp > installedTimestamp;

    // Новое обновление доступно только если тег и дата релиза строго новее текущей версии
    const isNewer = isNewerTag && isNewerTime;

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

// Отображение модального окна обновления
function showUpdateAvailableModal(tag, notes, dateStr, releaseTimestamp) {
  let modal = document.getElementById('app-update-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'app-update-modal';
    modal.className = 'fixed inset-0 z-[1200] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 transition-all duration-300';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="bg-[#181B24] border border-white/10 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4 animate-in fade-in zoom-in duration-200">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-2xl bg-[#6C5DD3]/20 border border-[#6C5DD3]/40 flex items-center justify-center text-[#6C5DD3]">
            <i data-lucide="download-cloud" class="w-5 h-5"></i>
          </div>
          <div>
            <h3 class="text-base font-bold text-white leading-tight">Доступно обновление</h3>
            <span class="text-xs text-[#6C5DD3] font-semibold">${dateStr ? `Релиз от ${dateStr}` : `Версия ${escapeHtml(tag)}`}</span>
          </div>
        </div>
        <button type="button" onclick="closeUpdateModal()" class="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-all">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <div class="bg-[#0F1117] border border-white/5 rounded-2xl p-3.5 space-y-1">
        <span class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Что нового:</span>
        <p class="text-xs text-gray-300 whitespace-pre-line leading-relaxed max-h-32 overflow-y-auto pr-1">${escapeHtml(notes)}</p>
      </div>

      <div class="pt-1 flex flex-col gap-2">
        <button type="button" onclick="downloadApkDirectly(${releaseTimestamp})" class="w-full py-3 px-4 rounded-xl bg-[#6C5DD3] hover:bg-[#5b4eb8] active:scale-98 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-lg shadow-[#6C5DD3]/20 transition-all cursor-pointer">
          <i data-lucide="download" class="w-4 h-4"></i>
          Обновить сейчас (.APK)
        </button>
        <button type="button" onclick="closeUpdateModal()" class="w-full py-2.5 px-4 rounded-xl text-gray-400 hover:text-white font-semibold text-xs text-center transition-all cursor-pointer">
          Позже
        </button>
      </div>
    </div>
  `;

  modal.classList.remove('hidden');
  if (typeof lucide !== 'undefined') lucide.createIcons({ root: modal });
}

function closeUpdateModal() {
  const modal = document.getElementById('app-update-modal');
  if (modal) modal.classList.add('hidden');
}

// Прямое скачивание APK
function downloadApkDirectly(releaseTimestamp) {
  if (releaseTimestamp) {
    try {
      localStorage.setItem('app_installed_release_timestamp', releaseTimestamp.toString());
    } catch (e) {}
  }

  showToast('Загрузка установочного файла...');
  closeUpdateModal();

  const a = document.createElement('a');
  a.href = window.APK_DOWNLOAD_URL;
  a.download = 'FamilyBudget.apk';
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Запуск процесса установки через быструю кнопку на главном экране (PWA)
async function triggerPwaInstall() {
  if (window.deferredPwaPrompt) {
    window.deferredPwaPrompt.prompt();
    const { outcome } = await window.deferredPwaPrompt.userChoice;
    if (outcome === 'accepted') {
      showToast('Приложение добавлено на главный экран!');
      window.deferredPwaPrompt = null;
    }
  } else {
    showToast('Нажмите "Поделиться" или меню браузера и выберите "Добавить на главный экран"', false);
  }
}

// Открытие единого красивого модального окна выбора варианта установки
function openAppInstallOptionsModal() {
  let modal = document.getElementById('app-install-options-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'app-install-options-modal';
    modal.className = 'fixed inset-0 z-[1200] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 transition-all duration-300';
    document.body.appendChild(modal);
  }

  const isNative = window.Capacitor?.isNativePlatform();

  modal.innerHTML = `
    <div class="bg-[#181B24] border border-white/10 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4 animate-in fade-in zoom-in duration-200">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-2xl bg-[#6C5DD3]/20 border border-[#6C5DD3]/40 flex items-center justify-center text-[#6C5DD3]">
            <i data-lucide="smartphone" class="w-5 h-5"></i>
          </div>
          <div>
            <h3 class="text-base font-bold text-white leading-tight">Приложение для телефона</h3>
            <span class="text-xs text-gray-400">Установите удобный вариант</span>
          </div>
        </div>
        <button type="button" onclick="closeAppInstallOptionsModal()" class="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-all">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <div class="space-y-3 pt-1">
        <!-- Вариант 1: Скачать APK -->
        <button type="button" onclick="downloadApkDirectly(); closeAppInstallOptionsModal();" class="w-full p-4 rounded-2xl bg-[#0F1117] border border-white/10 hover:border-[#6C5DD3]/50 hover:bg-[#1f222e] transition-all text-left group flex items-center justify-between cursor-pointer">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform">
              <i data-lucide="bot" class="w-5 h-5"></i>
            </div>
            <div>
              <div class="text-xs font-bold text-white group-hover:text-[#6C5DD3] transition-colors">Скачать файл (.APK)</div>
              <div class="text-[11px] text-gray-400">Полноценное приложение для Android</div>
            </div>
          </div>
          <i data-lucide="download" class="w-4 h-4 text-gray-400 group-hover:text-white transition-colors"></i>
        </button>

        ${!isNative ? `
        <!-- Вариант 2: Добавить на главный экран -->
        <button type="button" onclick="triggerPwaInstall(); closeAppInstallOptionsModal();" class="w-full p-4 rounded-2xl bg-[#0F1117] border border-white/10 hover:border-[#6C5DD3]/50 hover:bg-[#1f222e] transition-all text-left group flex items-center justify-between cursor-pointer">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl bg-[#6C5DD3]/15 border border-[#6C5DD3]/30 flex items-center justify-center text-[#6C5DD3] group-hover:scale-105 transition-transform">
              <i data-lucide="plus-square" class="w-5 h-5"></i>
            </div>
            <div>
              <div class="text-xs font-bold text-white group-hover:text-[#6C5DD3] transition-colors">Добавить ярлык на рабочий стол</div>
              <div class="text-[11px] text-gray-400">Быстрый доступ без скачивания файла</div>
            </div>
          </div>
          <i data-lucide="chevron-right" class="w-4 h-4 text-gray-400 group-hover:text-white transition-colors"></i>
        </button>
        ` : ''}
      </div>

      <div class="pt-1">
        <button type="button" onclick="closeAppInstallOptionsModal()" class="w-full py-2.5 rounded-xl text-gray-400 hover:text-white font-semibold text-xs text-center transition-all cursor-pointer">
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
}

// Автоматическая фоновая проверка раз в сутки при запуске (ТОЛЬКО ДЛЯ APK)
window.addEventListener('DOMContentLoaded', () => {
  if (window.Capacitor?.isNativePlatform()) {
    setTimeout(() => {
      const lastCheck = localStorage.getItem('app_last_check_time');
      const now = Date.now();
      if (!lastCheck || (now - parseInt(lastCheck, 10)) > 24 * 3600 * 1000) {
        localStorage.setItem('app_last_check_time', now.toString());
        checkAppUpdates(false);
      }
    }, 4000);
  }
});

// Экспорт глобальных функций
window.checkAppUpdates = checkAppUpdates;
window.showUpdateAvailableModal = showUpdateAvailableModal;
window.closeUpdateModal = closeUpdateModal;
window.downloadApkDirectly = downloadApkDirectly;
window.triggerPwaInstall = triggerPwaInstall;
window.openAppInstallOptionsModal = openAppInstallOptionsModal;
window.closeAppInstallOptionsModal = closeAppInstallOptionsModal;
