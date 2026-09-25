// ==========================================
// Variables & State
// ==========================================
let currentAuthMode = 'login'; // Отвечает за переключение формы (Вход / Регистрация)
let selectedAvatarPresetId = 'user'; // Выбранный аватар в настройках

// Память навигации: запоминаем, если окно было вызвано из профиля
window._returnToProfile = false;

// ==========================================
// Authentication Functions
// ==========================================
function setAuthMode(mode) {
  currentAuthMode = mode;
  const loginTab = document.getElementById('tab-auth-login');
  const regTab = document.getElementById('tab-auth-register');
  const submitBtn = document.getElementById('auth-submit-btn');

  if (mode === 'login') {
    loginTab.className = 'flex-1 py-2 text-xs font-semibold rounded-xl bg-[#6C5DD3] text-white transition-all cursor-pointer';
    regTab.className = 'flex-1 py-2 text-xs font-semibold rounded-xl text-gray-400 hover:text-white transition-all cursor-pointer';
    submitBtn.innerText = 'Войти';
  } else {
    regTab.className = 'flex-1 py-2 text-xs font-semibold rounded-xl bg-[#6C5DD3] text-white transition-all cursor-pointer';
    loginTab.className = 'flex-1 py-2 text-xs font-semibold rounded-xl text-gray-400 hover:text-white transition-all cursor-pointer';
    submitBtn.innerText = 'Создать аккаунт';
  }
}

// Превращает никнейм в безопасный виртуальный email для Firebase
function normalizeAuthEmail(input) {
  const clean = input.trim().toLowerCase();
  if (clean.includes('@')) {
    return clean;
  }
  const safeNickname = clean.replace(/[^a-z0-9._-]/g, '');
  return `${safeNickname || 'user'}@budget.local`;
}

// Вход через Google в 1 клик
async function loginWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  showToast('Вход через Google...', false, true);

  try {
    await auth.signInWithPopup(provider);
    document.getElementById('toast-container')?.classList.add('hidden');
  } catch (err) {
    document.getElementById('toast-container')?.classList.add('hidden');
    if (err.code !== 'auth/popup-closed-by-user') {
      showToast('Ошибка авторизации Google: ' + err.message, true);
    }
  }
}

// Обработка отправки формы (Вход или Регистрация)
async function handleAuthSubmit(e) {
  e.preventDefault();
  const usernameInput = document.getElementById('auth-username').value;
  const password = document.getElementById('auth-password').value;
  const btn = document.getElementById('auth-submit-btn');

  if (!usernameInput.trim() || !password) return;

  if (password.length < 6) {
    showToast('Пароль должен быть от 6 символов', true);
    return;
  }

  const email = normalizeAuthEmail(usernameInput);
  btn.disabled = true;

  try {
    if (currentAuthMode === 'login') {
      btn.innerText = 'Вход...';
      await auth.signInWithEmailAndPassword(email, password);
    } else {
      btn.innerText = 'Создание аккаунта...';
      const cred = await auth.createUserWithEmailAndPassword(email, password);
      if (cred.user) {
        const displayName = usernameInput.includes('@') ? usernameInput.split('@')[0] : usernameInput.trim();
        await cred.user.updateProfile({ displayName });
        await db.collection('users').doc(cred.user.uid).set({
          displayName,
          email,
          profile: { displayName, avatarId: 'user' },
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }
      showToast('Аккаунт успешно создан!');
    }
  } catch (err) {
    if (currentAuthMode === 'login') {
      showToast('Неверный логин или пароль', true);
    } else {
      if (err.code === 'auth/email-already-in-use') {
        showToast('Этот никнейм уже занят', true);
      } else {
        showToast('Ошибка регистрации: ' + err.message, true);
      }
    }
  } finally {
    btn.disabled = false;
    btn.innerText = (currentAuthMode === 'login') ? 'Войти' : 'Создать аккаунт';
  }
}

function resetAuthFormState() {
  const btn = document.getElementById('auth-submit-btn');
  if (btn) {
    btn.disabled = false;
    btn.innerText = (currentAuthMode === 'login') ? 'Войти' : 'Создать аккаунт';
  }
  const form = document.getElementById('auth-form');
  if (form) form.reset();
}

function logoutUser() {
  showDialog('Выход', 'Точно выйти из аккаунта?', true, async () => {
    try {
      if (typeof closeProfileModal === 'function') closeProfileModal();
      if (typeof resetGlobalCache === 'function') resetGlobalCache();
      
      const txList = document.getElementById('transactions-list');
      if (txList) txList.innerHTML = '';
      const expEl = document.getElementById('month-expense');
      if (expEl) expEl.innerText = '0 ₽';
      const incEl = document.getElementById('month-income');
      if (incEl) incEl.innerText = '0 ₽';
      
      resetAuthFormState();
      await auth.signOut();
    } catch (err) {
      console.error('Ошибка выхода:', err);
    }
  });
}

// ==========================================
// User Settings & Profile Engine
// ==========================================

// Загрузка профиля и настроек пользователя из Firestore
async function loadUserSettings(user) {
  if (!user) return;
  try {
    const doc = await db.collection('users').doc(user.uid).get();
    const data = doc.exists ? doc.data() : {};
    const settings = data?.settings || {};
    
    const showBroker = settings.showBroker !== undefined ? settings.showBroker : false;
    const showPdfInfo = settings.showPdfInfo !== undefined ? settings.showPdfInfo : true;

    if (!Cache) Cache = {};
    if (!Cache.settings) Cache.settings = {};
    Cache.settings.showBroker = showBroker;
    Cache.settings.showPdfInfo = showPdfInfo;

    // Загружаем профиль пользователя
    const rawName = user.displayName || (user.email?.includes('@budget.local') ? user.email.replace('@budget.local', '') : user.email?.split('@')[0]) || 'Пользователь';
    const profile = data?.profile || {};
    const avatarId = (profile.avatarId !== undefined && profile.avatarId !== null && profile.avatarId !== '') ? profile.avatarId : (data?.avatarId || 'user');
    
    Cache.userProfile = {
      displayName: profile.displayName || data?.displayName || rawName,
      avatarId: avatarId
    };
    selectedAvatarPresetId = Cache.userProfile.avatarId || 'user';

    // Проверяем семейный доступ
    const familyId = data?.familyId || null;
    if (familyId) {
      try {
        const famDoc = await db.collection('families').doc(familyId).get();
        if (famDoc.exists) {
          const famData = famDoc.data() || {};
          const members = Array.isArray(famData.members) ? famData.members : [];
          if (members.length === 0) {
            // Если в семье 0 участников — группа удалена
            await db.collection('users').doc(user.uid).update({ familyId: firebase.firestore.FieldValue.delete() });
            Cache.family = null;
          } else {
            Cache.family = { id: famDoc.id, ...famData, members };
          }
        } else {
          // Если группа была удалена — отвязываем
          await db.collection('users').doc(user.uid).update({ familyId: firebase.firestore.FieldValue.delete() });
          Cache.family = null;
        }
      } catch (famErr) {
        console.warn('Не удалось загрузить данные семьи:', famErr);
        Cache.family = null;
      }
    } else {
      Cache.family = null;
    }

    applyBrokerVisibility(showBroker);
    updateHeaderProfileUI();

    // Проверяем, нужно ли предложить создателю семьи пересмотреть бюджет после присоединения нового участника
    setTimeout(() => {
      checkFamilyBudgetReviewPrompt();
    }, 800);
  } catch (err) {
    console.error('Ошибка загрузки настроек:', err);
  }
}

// Проверка и показ диалога предложения перенастройки бюджета создателю семьи
function checkFamilyBudgetReviewPrompt() {
  const user = auth.currentUser;
  if (!user || !Cache?.family) return;

  const isOwner = (Cache.family.ownerUid === user.uid) || (Cache.family.members?.find(m => m && m.uid === user.uid)?.role === 'owner');
  if (!isOwner || !Cache.family.needsBudgetReview) return;

  const memberName = Cache.family.lastJoinedMember?.name || 'Новый участник';
  openFamilyReviewDialog(memberName);
}

function openFamilyReviewDialog(memberName) {
  const dlg = document.getElementById('family-review-dialog');
  const nameEl = document.getElementById('family-review-member-name');
  if (nameEl) nameEl.textContent = memberName || 'Новый участник';
  if (dlg) {
    if (typeof lockBodyScroll === 'function') lockBodyScroll();
    dlg.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons({ root: dlg });
  }
}

async function closeFamilyReviewDialog(isConfirmed = false) {
  const dlg = document.getElementById('family-review-dialog');
  if (dlg) dlg.classList.add('hidden');
  if (typeof unlockBodyScroll === 'function') unlockBodyScroll(true);

  if (Cache?.family?.id) {
    try {
      await db.collection('families').doc(Cache.family.id).update({ needsBudgetReview: false });
      if (Cache.family) Cache.family.needsBudgetReview = false;
    } catch (e) {}
  }
}

async function confirmFamilyBudgetReview() {
  const dlg = document.getElementById('family-review-dialog');
  if (dlg) dlg.classList.add('hidden');
  if (typeof unlockBodyScroll === 'function') unlockBodyScroll(true);

  if (Cache?.family?.id) {
    try {
      await db.collection('families').doc(Cache.family.id).update({ needsBudgetReview: false });
      if (Cache.family) Cache.family.needsBudgetReview = false;
    } catch (e) {}
  }

  // Переходим на вкладку бюджета и открываем мастер настройки со СТАДИИ 1 со всеми сохраненными данными!
  if (typeof openBudgetPlanWizardReview === 'function') {
    openBudgetPlanWizardReview();
  }
}

// Обновление кнопки профиля в шапке
function updateHeaderProfileUI() {
  const profile = (typeof getCurrentUserProfile === 'function') ? getCurrentUserProfile() : (Cache?.userProfile || { displayName: 'Профиль', avatarId: 'user' });
  const nameEl = document.getElementById('header-user-name');
  const avatarEl = document.getElementById('header-user-avatar');

  if (nameEl) {
    nameEl.textContent = profile.displayName || 'Профиль';
  }

  if (avatarEl) {
    if (typeof getAvatarHtml === 'function') {
      avatarEl.innerHTML = getAvatarHtml(profile.avatarId, 'w-6 h-6', 'w-3.5 h-3.5');
      if (typeof lucide !== 'undefined') lucide.createIcons({ root: avatarEl });
    }
  }
}

// Открытие модального окна профиля
function openProfileModal() {
  const user = auth.currentUser;
  if (!user) return;

  const dialog = document.getElementById('profile-dialog');
  if (dialog) {
    dialog.scrollTop = 0;
    dialog.scrollTo({ top: 0, behavior: 'instant' });
  }

  const nameEl = document.getElementById('profile-username-display');
  const typeEl = document.getElementById('profile-auth-type');
  const avatarContainer = document.getElementById('profile-avatar-container');
  const editNameInput = document.getElementById('profile-edit-name-input');
  const editNameRow = document.getElementById('profile-edit-name-row');

  const profile = (typeof getCurrentUserProfile === 'function') ? getCurrentUserProfile() : (Cache?.userProfile || { displayName: 'Пользователь', avatarId: '' });
  
  if (nameEl) nameEl.textContent = profile.displayName;
  if (editNameInput) editNameInput.value = profile.displayName;
  if (editNameRow) editNameRow.classList.add('hidden');

  if (avatarContainer && typeof getAvatarHtml === 'function') {
    avatarContainer.innerHTML = getAvatarHtml(profile.avatarId, 'w-14 h-14', 'w-7 h-7', 'ring-2 ring-white/10 shadow-lg cursor-pointer hover:ring-[#6C5DD3]/50 transition-all active:scale-95');
  }

  if (typeEl) {
    const isGoogle = Array.isArray(user?.providerData) && user.providerData.some(p => p && p.providerId === 'google.com');
    typeEl.textContent = isGoogle ? `Google (${user.email})` : `Логин: ${user.email?.includes('@budget.local') ? user.email.replace('@budget.local', '') : user.email}`;
  }

  // Обновляем состояние чекбокса брокера
  const toggle = document.getElementById('toggle-broker-setting');
  if (toggle) {
    toggle.checked = !!(Cache?.settings?.showBroker);
  }

  // Обновляем состояние чекбокса инфо-окна PDF
  const togglePdf = document.getElementById('toggle-pdf-info-setting');
  if (togglePdf) {
    togglePdf.checked = Cache?.settings?.showPdfInfo !== undefined ? !!Cache.settings.showPdfInfo : true;
  }

  // Обновляем видимость пункта установки приложения
  const pwaBtn = document.getElementById('profile-install-app-btn');
  if (pwaBtn) {
    if (typeof isPwaStandalone === 'function' && isPwaStandalone()) {
      pwaBtn.classList.add('hidden');
    } else {
      pwaBtn.classList.remove('hidden');
    }
  }

  // Обновляем блок семейного доступа
  renderFamilySettingsUI();

  if (dialog) {
    dialog.classList.remove('hidden');
    dialog.scrollTop = 0;
  }
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeProfileModal() {
  const dialog = document.getElementById('profile-dialog');
  if (dialog) dialog.classList.add('hidden');
}

// Переключение режима редактирования имени
function toggleProfileNameEdit(show) {
  const editRow = document.getElementById('profile-edit-name-row');
  const input = document.getElementById('profile-edit-name-input');
  if (!editRow) return;

  const willShow = show !== undefined ? show : editRow.classList.contains('hidden');
  if (willShow) {
    editRow.classList.remove('hidden');
    if (input) {
      input.value = Cache?.userProfile?.displayName || 'Пользователь';
      input.focus();
      input.select();
    }
  } else {
    editRow.classList.add('hidden');
  }
}

// ==========================================
// Avatar Picker & Name Editing
// ==========================================

function openAvatarPickerModal() {
  const dialog = document.getElementById('avatar-picker-dialog');
  const grid = document.getElementById('avatar-picker-grid');
  if (!grid) return;

  const currentAvatar = Cache?.userProfile?.avatarId || 'user';
  selectedAvatarPresetId = currentAvatar;

  const presets = window.AVATAR_PRESETS || {};
  let html = '';
  Object.keys(presets).forEach(key => {
    const p = presets[key];
    const isSelected = (key === currentAvatar);
    html += `
      <button type="button" 
              onclick="selectAvatarPreset('${p.id}')"
              class="avatar-preset-btn p-2.5 rounded-2xl flex items-center justify-center border transition-all cursor-pointer ${isSelected ? 'border-[#6C5DD3] bg-[#6C5DD3]/25 scale-105 shadow-lg ring-2 ring-[#6C5DD3]/40' : 'border-white/5 bg-[#181B24] hover:bg-[#212430] hover:border-white/15'}"
              data-preset-id="${p.id}"
              title="${escapeHtml(p.label)}">
        <div class="w-12 h-12 rounded-full ${p.bg} text-white flex items-center justify-center shadow-md select-none pointer-events-none">
          <i data-lucide="${p.icon}" class="w-6 h-6 stroke-[2.2]"></i>
        </div>
      </button>
    `;
  });

  grid.innerHTML = html;
  if (dialog) dialog.classList.remove('hidden');
  if (typeof lucide !== 'undefined') lucide.createIcons({ root: grid });
}

function closeAvatarPickerModal() {
  const dialog = document.getElementById('avatar-picker-dialog');
  if (dialog) dialog.classList.add('hidden');
}

function selectAvatarPreset(avatarId) {
  selectedAvatarPresetId = avatarId;
  const grid = document.getElementById('avatar-picker-grid');
  if (grid) {
    grid.querySelectorAll('.avatar-preset-btn').forEach(btn => {
      const isSelected = btn.dataset.presetId === avatarId;
      btn.className = `avatar-preset-btn p-2.5 rounded-2xl flex items-center justify-center border transition-all cursor-pointer ${isSelected ? 'border-[#6C5DD3] bg-[#6C5DD3]/25 scale-105 shadow-lg ring-2 ring-[#6C5DD3]/40' : 'border-white/5 bg-[#181B24] hover:bg-[#212430] hover:border-white/15'}`;
    });
  }
}

async function applySelectedAvatar() {
  const user = auth.currentUser;
  if (!user) return;

  if (!Cache.userProfile) Cache.userProfile = {};
  Cache.userProfile.avatarId = selectedAvatarPresetId;

  closeAvatarPickerModal();

  // Обновляем аватарку в модалке профиля
  const avatarContainer = document.getElementById('profile-avatar-container');
  if (avatarContainer && typeof getAvatarHtml === 'function') {
    avatarContainer.innerHTML = getAvatarHtml(selectedAvatarPresetId, 'w-14 h-14', 'w-7 h-7', 'ring-2 ring-white/10 shadow-lg cursor-pointer hover:ring-[#6C5DD3]/50 transition-all active:scale-95');
    if (typeof lucide !== 'undefined') lucide.createIcons({ root: avatarContainer });
  }

  // Фоново сохраняем в Firestore
  await saveProfileInfo(false);
}

// Сохранение имени и аватарки профиля
async function saveProfileInfo(showToastSuccess = true) {
  const user = auth.currentUser;
  if (!user) return;

  const nameInput = document.getElementById('profile-edit-name-input');
  const newName = nameInput ? nameInput.value.trim() : (Cache.userProfile?.displayName || 'Пользователь');
  const avatarId = selectedAvatarPresetId || Cache.userProfile?.avatarId || 'user';

  if (!newName) {
    showToast('Имя не может быть пустым', true);
    return;
  }

  try {
    if (!Cache.userProfile) Cache.userProfile = {};
    Cache.userProfile.displayName = newName;
    Cache.userProfile.avatarId = avatarId;

    // Скрываем строку редактирования имени
    const editRow = document.getElementById('profile-edit-name-row');
    if (editRow) editRow.classList.add('hidden');

    // Обновляем профиль в Firebase Auth
    await user.updateProfile({ displayName: newName });

    // Обновляем документ пользователя в Firestore
    await db.collection('users').doc(user.uid).set({
      displayName: newName,
      profile: {
        displayName: newName,
        avatarId: avatarId
      }
    }, { merge: true });

    // Если состоит в семье — обновляем его запись в составе семьи
    if (Cache?.family?.id) {
      const famRef = db.collection('families').doc(Cache.family.id);
      const famDoc = await famRef.get();
      if (famDoc.exists) {
        const members = famDoc.data().members || [];
        const updatedMembers = members.map(m => {
          if (m.uid === user.uid) {
            return { ...m, name: newName, avatarId: avatarId };
          }
          return m;
        });
        await famRef.update({ members: updatedMembers });
        Cache.family.members = updatedMembers;
      }
    }

    updateHeaderProfileUI();
    const nameEl = document.getElementById('profile-username-display');
    if (nameEl) nameEl.textContent = newName;

    renderFamilySettingsUI();
    if (showToastSuccess) {
      showToast('Имя успешно обновлено');
    }
  } catch (err) {
    console.error('Ошибка сохранения профиля:', err);
    showToast('Ошибка сохранения: ' + err.message, true);
  }
}

// ==========================================
// Change Login & Change Password Flow
// ==========================================

function openChangeLoginModal() {
  const user = auth.currentUser;
  if (!user) return;

  const dialog = document.getElementById('change-login-dialog');
  const currentLoginEl = document.getElementById('change-login-current');
  const newLoginInput = document.getElementById('change-login-new');
  const passInput = document.getElementById('change-login-password');

  const currentLogin = user.email?.includes('@budget.local') ? user.email.replace('@budget.local', '') : user.email;
  if (currentLoginEl) currentLoginEl.textContent = currentLogin;
  if (newLoginInput) newLoginInput.value = '';
  if (passInput) passInput.value = '';

  if (dialog) dialog.classList.remove('hidden');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeChangeLoginModal() {
  const dialog = document.getElementById('change-login-dialog');
  if (dialog) dialog.classList.add('hidden');
}

async function submitChangeLogin() {
  const user = auth.currentUser;
  if (!user) return;

  const newLoginInput = document.getElementById('change-login-new');
  const passInput = document.getElementById('change-login-password');
  const submitBtn = document.getElementById('change-login-submit-btn');

  const rawNewLogin = newLoginInput?.value.trim();
  const password = passInput?.value || '';

  if (!rawNewLogin) {
    showToast('Введите новый логин', true);
    return;
  }
  if (!password) {
    showToast('Введите текущий пароль для подтверждения', true);
    return;
  }

  const newEmail = normalizeAuthEmail(rawNewLogin);
  if (newEmail === user.email) {
    showToast('Новый логин совпадает с текущим', true);
    return;
  }

  if (submitBtn) submitBtn.disabled = true;
  showToast('Смена логина...', false, true);

  try {
    // 1. Реаутентификация
    const credential = firebase.auth.EmailAuthProvider.credential(user.email, password);
    await user.reauthenticateWithCredential(credential);

    // 2. Обновление email в Auth
    await user.updateEmail(newEmail);

    // 3. Обновление в Firestore
    await db.collection('users').doc(user.uid).set({
      email: newEmail,
      login: rawNewLogin
    }, { merge: true });

    document.getElementById('toast-container')?.classList.add('hidden');
    closeChangeLoginModal();
    showToast('Логин успешно изменён!');

    // Обновляем данные в окне настроек
    const typeEl = document.getElementById('profile-auth-type');
    if (typeEl) {
      typeEl.textContent = `Логин: ${rawNewLogin}`;
    }
  } catch (err) {
    document.getElementById('toast-container')?.classList.add('hidden');
    console.error('Ошибка смены логина:', err);
    if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
      showToast('Неверный текущий пароль', true);
    } else if (err.code === 'auth/email-already-in-use') {
      showToast('Этот логин уже занят другим аккаунтом', true);
    } else {
      showToast('Ошибка смены логина: ' + err.message, true);
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

function openChangePasswordModal() {
  const dialog = document.getElementById('change-password-dialog');
  const curPass = document.getElementById('change-pass-current');
  const newPass = document.getElementById('change-pass-new');
  const confPass = document.getElementById('change-pass-confirm');

  if (curPass) curPass.value = '';
  if (newPass) newPass.value = '';
  if (confPass) confPass.value = '';

  if (dialog) dialog.classList.remove('hidden');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeChangePasswordModal() {
  const dialog = document.getElementById('change-password-dialog');
  if (dialog) dialog.classList.add('hidden');
}

async function submitChangePassword() {
  const user = auth.currentUser;
  if (!user) return;

  const curPassInput = document.getElementById('change-pass-current');
  const newPassInput = document.getElementById('change-pass-new');
  const confPassInput = document.getElementById('change-pass-confirm');
  const submitBtn = document.getElementById('change-password-submit-btn');

  const curPass = curPassInput?.value || '';
  const newPass = newPassInput?.value || '';
  const confPass = confPassInput?.value || '';

  if (!curPass) {
    showToast('Введите текущий пароль', true);
    return;
  }
  if (!newPass || newPass.length < 6) {
    showToast('Новый пароль должен быть от 6 символов', true);
    return;
  }
  if (newPass !== confPass) {
    showToast('Новый пароль и подтверждение не совпадают', true);
    return;
  }

  if (submitBtn) submitBtn.disabled = true;
  showToast('Обновление пароля...', false, true);

  try {
    // 1. Реаутентификация
    const credential = firebase.auth.EmailAuthProvider.credential(user.email, curPass);
    await user.reauthenticateWithCredential(credential);

    // 2. Обновление пароля
    await user.updatePassword(newPass);

    document.getElementById('toast-container')?.classList.add('hidden');
    closeChangePasswordModal();
    showToast('Пароль успешно обновлён!');
  } catch (err) {
    document.getElementById('toast-container')?.classList.add('hidden');
    console.error('Ошибка смены пароля:', err);
    if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
      showToast('Неверный текущий пароль', true);
    } else {
      showToast('Ошибка смены пароля: ' + err.message, true);
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

// ==========================================
// Family Space (Связка аккаунтов / Семейный доступ)
// ==========================================

function renderFamilySettingsUI() {
  const container = document.getElementById('family-section-container');
  if (!container) return;

  const user = auth.currentUser;
  if (!user) return;

  const family = Cache?.family;
  const userProfile = (typeof getCurrentUserProfile === 'function') ? getCurrentUserProfile() : { displayName: 'Пользователь', avatarId: 'user' };

  if (family) {
    const isOwner = (family.ownerUid === user.uid);
    const members = family.members || [];
    
    let membersHtml = '';
    members.forEach(m => {
      const isMe = (m.uid === user.uid);
      const isMemOwner = (m.role === 'owner' || m.uid === family.ownerUid);
      membersHtml += `
        <div class="flex items-center justify-between p-2.5 rounded-xl bg-[#12151C] border border-[rgba(255,255,255,0.04)]">
          <div class="flex items-center gap-3 min-w-0">
            ${getAvatarHtml(m.avatarId || 'user', 'w-8 h-8', 'w-4 h-4')}
            <div class="min-w-0">
              <span class="text-sm font-medium text-white flex items-center gap-1.5 truncate">
                ${escapeHtml(m.name || 'Пользователь')}
                ${isMe ? '<span class="text-[10px] text-[#8C7DFF] font-semibold bg-[#6C5DD3]/15 px-1.5 py-0.2 rounded">Вы</span>' : ''}
              </span>
              <span class="text-[11px] text-gray-400 block truncate">${isMemOwner ? 'Владелец бюджета' : 'Участник семьи'}</span>
            </div>
          </div>
          <span class="text-xs px-2 py-0.5 rounded-full ${isMemOwner ? 'bg-amber-500/15 text-amber-300 border border-amber-500/25' : 'bg-gray-700/50 text-gray-300'} font-medium">
            ${isMemOwner ? 'Создатель' : 'Доступ'}
          </span>
        </div>
      `;
    });

    container.innerHTML = `
      <div class="p-4 rounded-2xl bg-[#181B24] border border-[rgba(255,255,255,0.06)] space-y-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-xl bg-[#6C5DD3]/15 text-[#8C7DFF] flex items-center justify-center">
              <i data-lucide="users" class="w-4 h-4"></i>
            </div>
            <div>
              <h4 class="text-sm font-bold text-white">${escapeHtml(family.name || 'Семейный бюджет')}</h4>
              <p class="text-[11px] text-[#848D99]">Общие транзакции, бюджет и накопления</p>
            </div>
          </div>
          <span class="px-2 py-0.5 rounded-full bg-[#6C5DD3]/20 text-[#8C7DFF] text-[11px] font-semibold border border-[#6C5DD3]/30">
            ${members.length} уч.
          </span>
        </div>

        <!-- Код приглашения -->
        <div class="p-3 rounded-xl bg-[#12151C] border border-[rgba(255,255,255,0.05)] flex items-center justify-between gap-3">
          <div>
            <span class="text-[10px] text-[#848D99] uppercase font-bold tracking-wider block mb-0.5">Код для подключения члена семьи</span>
            <span class="text-base font-mono font-bold text-[#8C7DFF] tracking-wider select-all">${escapeHtml(family.code || '')}</span>
          </div>
          <button type="button" onclick="copyFamilyInviteCode('${family.code}')" class="px-3 py-2 rounded-xl bg-[#6C5DD3]/20 hover:bg-[#6C5DD3]/30 text-[#8C7DFF] text-xs font-semibold border border-[#6C5DD3]/30 flex items-center gap-1.5 cursor-pointer transition-colors active:scale-95">
            <i data-lucide="copy" class="w-3.5 h-3.5"></i>
            <span>Скопировать</span>
          </button>
        </div>

        <!-- Список участников -->
        <div class="space-y-1.5">
          <span class="text-[11px] text-gray-400 font-semibold px-1">Участники с доступом:</span>
          ${membersHtml}
        </div>

        <!-- Действия -->
        <div class="pt-2 border-t border-[rgba(255,255,255,0.04)] flex justify-between items-center">
          ${isOwner ? `
            <button type="button" onclick="deleteFamilyGroup()" class="text-xs text-red-400 hover:text-red-300 transition-colors cursor-pointer flex items-center gap-1">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Удалить группу
            </button>
          ` : `
            <button type="button" onclick="leaveFamilyGroup()" class="text-xs text-red-400 hover:text-red-300 transition-colors cursor-pointer flex items-center gap-1">
              <i data-lucide="log-out" class="w-3.5 h-3.5"></i> Выйти из семьи
            </button>
          `}
          <span class="text-[11px] text-gray-500">Синхронизация вкл.</span>
        </div>
      </div>
    `;
  } else {
    // Пользователь пока ведет личный бюджет
    container.innerHTML = `
      <div class="p-4 rounded-2xl bg-[#181B24] border border-[rgba(255,255,255,0.06)]">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-2xl bg-[#6C5DD3]/15 text-[#8C7DFF] flex items-center justify-center flex-shrink-0">
            <i data-lucide="users-round" class="w-5 h-5"></i>
          </div>
          <div>
            <h4 class="text-sm font-bold text-white">Семейный доступ к бюджету</h4>
            <p class="text-xs text-[#848D99] mt-0.5">Ведите общий учет расходов и накоплений с членами семьи в реальном времени</p>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
          <button type="button" onclick="openCreateFamilyModal()" class="w-full py-2.5 px-3 rounded-xl bg-[#6C5DD3] hover:bg-[#5E4FC9] text-white text-xs font-semibold transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-[#6C5DD3]/25">
            <i data-lucide="plus-circle" class="w-4 h-4"></i>
            <span>Создать семью</span>
          </button>
          <button type="button" onclick="openJoinFamilyModal()" class="w-full py-2.5 px-3 rounded-xl bg-[#212430] hover:bg-[#2A2D3C] text-gray-200 hover:text-white text-xs font-semibold border border-[rgba(255,255,255,0.08)] transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5">
            <i data-lucide="key-round" class="w-4 h-4 text-[#8C7DFF]"></i>
            <span>Ввести код семьи</span>
          </button>
        </div>
      </div>
    `;
  }

  if (typeof lucide !== 'undefined') lucide.createIcons({ root: container });
}

function openCreateFamilyModal() {
  const dialog = document.getElementById('create-family-dialog');
  const nameInput = document.getElementById('create-family-name');
  if (nameInput) nameInput.value = 'Семейный бюджет';
  if (dialog) dialog.classList.remove('hidden');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeCreateFamilyModal() {
  const dialog = document.getElementById('create-family-dialog');
  if (dialog) dialog.classList.add('hidden');
}

function generateFamilyInviteCode(length = 6) {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let result = '';
  const cryptoObj = window.crypto || window.msCrypto;
  if (cryptoObj && cryptoObj.getRandomValues) {
    const randomBytes = new Uint8Array(length);
    cryptoObj.getRandomValues(randomBytes);
    for (let i = 0; i < length; i++) {
      result += chars[randomBytes[i] % chars.length];
    }
  } else {
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  }
  return result;
}

async function submitCreateFamily() {
  const user = auth.currentUser;
  if (!user) return;

  const nameInput = document.getElementById('create-family-name');
  const submitBtn = document.getElementById('create-family-submit-btn');
  const familyName = nameInput?.value.trim() || 'Семейный бюджет';

  if (submitBtn) submitBtn.disabled = true;
  showToast('Создание семейного пространства...', false, true);

  try {
    const code = generateFamilyInviteCode(6);
    const userProfile = (typeof getCurrentUserProfile === 'function') ? getCurrentUserProfile() : { displayName: 'Пользователь', avatarId: 'user' };

    const familyRef = db.collection('families').doc();
    const familyData = {
      name: familyName,
      code: code,
      ownerUid: user.uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      members: [
        {
          uid: user.uid,
          name: userProfile.displayName,
          avatarId: userProfile.avatarId,
          role: 'owner',
          joinedAt: Date.now()
        }
      ]
    };

    const tables = ['Transactions', 'Deposits', 'Broker', 'Goals', 'Categories', 'CategoryRules', 'BudgetPlan', 'CalendarBills'];

    // Параллельное выполнение: создаем документ семьи и запрашиваем 8 личных коллекций одновременно
    const [_, ...snaps] = await Promise.all([
      familyRef.set(familyData),
      ...tables.map(tbl => db.collection('users').doc(user.uid).collection(tbl).get())
    ]);

    // Копируем все личные записи в единый пакетный запрос (Batch Write)
    const batch = db.batch();
    let pendingWrites = 0;

    snaps.forEach((snap, idx) => {
      if (snap && !snap.empty) {
        const table = tables[idx];
        snap.docs.forEach(d => {
          const newDocRef = familyRef.collection(table).doc(d.id);
          batch.set(newDocRef, d.data());
          pendingWrites++;
        });
      }
    });

    // Параллельно коммитим пакетное копирование и обновляем привязку пользователя
    const tasks = [
      db.collection('users').doc(user.uid).set({ familyId: familyRef.id }, { merge: true })
    ];
    if (pendingWrites > 0) {
      tasks.push(batch.commit());
    }

    await Promise.all(tasks);

    Cache.family = { id: familyRef.id, ...familyData };

    document.getElementById('toast-container')?.classList.add('hidden');
    closeCreateFamilyModal();
    showToast(`Семейный бюджет создан! Код: ${code}`);

    renderFamilySettingsUI();
    await fetchAllData(true);
  } catch (err) {
    document.getElementById('toast-container')?.classList.add('hidden');
    console.error('Ошибка создания семьи:', err);
    showToast('Ошибка создания: ' + err.message, true);
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

function openJoinFamilyModal() {
  const dialog = document.getElementById('join-family-dialog');
  const codeInput = document.getElementById('join-family-code');
  if (codeInput) codeInput.value = '';
  if (dialog) dialog.classList.remove('hidden');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeJoinFamilyModal() {
  const dialog = document.getElementById('join-family-dialog');
  if (dialog) dialog.classList.add('hidden');
}

// Генерация уникальной сигнатуры для проверки дубликатов при слиянии данных
function getRecordDeduplicationSignature(table, item) {
  if (!item) return '';
  switch (table) {
    case 'Transactions': {
      const date = (item.date || item.rawDate || '').slice(0, 10);
      const amount = Math.round((Number(item.amount) || 0) * 100);
      const type = (item.type || '').trim().toLowerCase();
      const cat = (item.category || '').trim().toLowerCase();
      const comment = (item.comment || '').trim().toLowerCase();
      return `${date}_${amount}_${type}_${cat}_${comment}`;
    }
    case 'Deposits': {
      const name = (item.bank || item.name || '').trim().toLowerCase();
      const amount = Math.round((Number(item.amount) || 0) * 100);
      const rate = Number(item.rate) || 0;
      const start = (item.startDate || '').slice(0, 10);
      return `${name}_${amount}_${rate}_${start}`;
    }
    case 'Broker': {
      const date = (item.date || '').slice(0, 10);
      const type = (item.type || '').trim().toLowerCase();
      const amount = Math.round((Number(item.amount) || 0) * 100);
      const balance = Math.round((Number(item.balance) || 0) * 100);
      return `${date}_${type}_${amount}_${balance}`;
    }
    case 'Goals': {
      const name = (item.name || item.title || '').trim().toLowerCase();
      const target = Math.round((Number(item.target) || 0) * 100);
      return `${name}_${target}`;
    }
    case 'CalendarBills': {
      const name = (item.name || item.title || '').trim().toLowerCase();
      const amount = Math.round((Number(item.amount) || 0) * 100);
      const day = item.day || (item.date || '').slice(0, 10);
      return `${name}_${amount}_${day}`;
    }
    case 'Categories': {
      const name = (item.name || '').trim().toLowerCase();
      const type = (item.type || '').trim().toLowerCase();
      return `${name}_${type}`;
    }
    case 'CategoryRules': {
      const pattern = (item.pattern || '').trim().toLowerCase();
      return `${pattern}`;
    }
    default:
      return '';
  }
}

// Объединение личных данных нового участника в семейное пространство с защитой от дублирования
async function mergePersonalDataIntoFamily(user, familyRef, userProfile) {
  const tables = ['Transactions', 'Deposits', 'Broker', 'Goals', 'CalendarBills', 'Categories', 'CategoryRules'];

  try {
    const userProms = tables.map(tbl => db.collection('users').doc(user.uid).collection(tbl).get());
    const famProms = tables.map(tbl => familyRef.collection(tbl).get());

    const allSnaps = await Promise.all([...userProms, ...famProms]);
    const userSnaps = allSnaps.slice(0, tables.length);
    const famSnaps = allSnaps.slice(tables.length);

    const batch = db.batch();
    let writeCount = 0;

    tables.forEach((table, idx) => {
      const userSnap = userSnaps[idx];
      const famSnap = famSnaps[idx];

      if (!userSnap || userSnap.empty) return;

      const famDocs = famSnap ? famSnap.docs.map(d => d.data()) : [];
      const existingSignatures = new Set();
      famDocs.forEach(item => {
        const sig = getRecordDeduplicationSignature(table, item);
        if (sig) existingSignatures.add(sig);
      });

      userSnap.docs.forEach(doc => {
        const data = doc.data();
        const sig = getRecordDeduplicationSignature(table, data);

        if (sig && existingSignatures.has(sig)) {
          return;
        }

        if (table === 'Transactions') {
          data.author = data.author || {
            uid: user.uid,
            name: userProfile.displayName || 'Участник',
            avatarId: userProfile.avatarId || 'user'
          };
        }

        const targetDocRef = familyRef.collection(table).doc(doc.id);
        batch.set(targetDocRef, data);
        if (sig) existingSignatures.add(sig);
        writeCount++;
      });
    });

    if (writeCount > 0) {
      await batch.commit();
    }
  } catch (tblErr) {
    console.warn(`Ошибка объединения таблиц в семейный бюджет:`, tblErr);
  }
}

async function submitJoinFamily() {
  const user = auth.currentUser;
  if (!user) return;

  const codeInput = document.getElementById('join-family-code');
  const submitBtn = document.getElementById('join-family-submit-btn');
  const rawCode = (codeInput?.value || '').trim().toUpperCase();

  if (!rawCode) {
    showToast('Введите код приглашения', true);
    return;
  }

  if (submitBtn) submitBtn.disabled = true;
  showToast('Поиск семейной группы...', false, true);

  try {
    // Поддерживаем как новые буквенно-цифровые коды (например 7K9X2M), так и старые с префиксом FAM-
    let qSnap = await db.collection('families').where('code', '==', rawCode).limit(1).get();
    
    if (qSnap.empty && !rawCode.startsWith('FAM-')) {
      qSnap = await db.collection('families').where('code', '==', `FAM-${rawCode}`).limit(1).get();
    }
    if (qSnap.empty && rawCode.startsWith('FAM-')) {
      qSnap = await db.collection('families').where('code', '==', rawCode.replace('FAM-', '')).limit(1).get();
    }

    if (qSnap.empty) {
      document.getElementById('toast-container')?.classList.add('hidden');
      showToast('Группа с таким кодом не найдена', true);
      if (submitBtn) submitBtn.disabled = false;
      return;
    }

    const famDoc = qSnap.docs[0];
    const famData = famDoc.data() || {};
    const members = Array.isArray(famData.members) ? famData.members : [];

    // Защита: если в группе 0 участников или все аккаунты были удалены — группа расформирована
    if (members.length === 0) {
      try {
        await famDoc.ref.delete();
      } catch (e) {}
      document.getElementById('toast-container')?.classList.add('hidden');
      showToast('Группа не существует или была расформирована', true);
      if (submitBtn) submitBtn.disabled = false;
      return;
    }

    const userProfile = (typeof getCurrentUserProfile === 'function') ? getCurrentUserProfile() : { displayName: 'Пользователь', avatarId: 'user' };
    const isAlreadyMember = members.some(m => m && m.uid === user.uid);

    showToast('Объединение семейных данных...', false, true);

    if (!isAlreadyMember) {
      members.push({
        uid: user.uid,
        name: userProfile.displayName,
        avatarId: userProfile.avatarId,
        role: 'member',
        joinedAt: Date.now()
      });

      // Обновляем семью и выставляем флаг предложения перенастройки бюджета создателю
      await famDoc.ref.update({
        members: members,
        needsBudgetReview: true,
        lastJoinedMember: {
          uid: user.uid,
          name: userProfile.displayName,
          joinedAt: Date.now()
        }
      });

      // Объединяем личные данные нового участника в семейное пространство (с защитой от дублирования)
      await mergePersonalDataIntoFamily(user, famDoc.ref, userProfile);
    }

    // Привязываем пользователя
    await db.collection('users').doc(user.uid).set({
      familyId: famDoc.id
    }, { merge: true });

    Cache.family = { id: famDoc.id, ...famData, members };

    document.getElementById('toast-container')?.classList.add('hidden');
    closeJoinFamilyModal();
    showToast(`Вы успешно присоединились к «${famData.name}»! Данные объединены.`);

    renderFamilySettingsUI();
    await fetchAllData();
  } catch (err) {
    document.getElementById('toast-container')?.classList.add('hidden');
    console.error('Ошибка присоединения к семье:', err);
    showToast('Ошибка подключения: ' + err.message, true);
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

function copyFamilyInviteCode(code) {
  if (!code) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(code).then(() => {
      showToast(`Код ${code} скопирован в буфер обмена`);
    }).catch(() => {
      showToast(`Код семьи: ${code}`);
    });
  } else {
    showToast(`Код семьи: ${code}`);
  }
}

function leaveFamilyGroup() {
  const user = auth.currentUser;
  if (!user || !Cache?.family) return;

  showDialog('Выход из семьи', 'Вы точно хотите отключиться от семейного бюджета? Вы вернётесь к личному кабинету.', true, async () => {
    showToast('Отключение от семьи...', false, true);
    const tables = ['Transactions', 'Deposits', 'Broker', 'Goals', 'Categories', 'CategoryRules', 'BudgetPlan', 'CalendarBills'];
    try {
      const famId = Cache.family.id;
      const famDoc = await db.collection('families').doc(famId).get();
      if (famDoc.exists) {
        const famData = famDoc.data() || {};
        const members = (famData.members || []).filter(m => m && m.uid !== user.uid);

        if (members.length === 0) {
          // Если участников не осталось — удаляем все подколлекции и документ семьи параллельно
          const snaps = await Promise.all(
            tables.map(table => db.collection('families').doc(famId).collection(table).get())
          );
          const batch = db.batch();
          let deleteCount = 0;
          snaps.forEach(snap => {
            if (snap && !snap.empty) {
              snap.docs.forEach(doc => {
                batch.delete(doc.ref);
                deleteCount++;
              });
            }
          });
          if (deleteCount > 0) {
            await batch.commit();
          }
          await db.collection('families').doc(famId).delete();
        } else {
          const isOwner = (famData.ownerUid === user.uid) || (famData.members?.find(m => m && m.uid === user.uid)?.role === 'owner');
          if (isOwner) {
            // Передаем права владельца следующему участнику
            const newOwner = members[0];
            members.forEach((m, idx) => {
              if (idx === 0) m.role = 'owner';
              else if (m.role === 'owner') m.role = 'member';
            });
            await db.collection('families').doc(famId).update({
              ownerUid: newOwner.uid,
              members: members
            });
          } else {
            await db.collection('families').doc(famId).update({ members });
          }
        }
      }

      await db.collection('users').doc(user.uid).update({
        familyId: firebase.firestore.FieldValue.delete()
      });

      Cache.family = null;
      document.getElementById('toast-container')?.classList.add('hidden');
      showToast('Вы вышли из семейного бюджета');

      renderFamilySettingsUI();
      await fetchAllData();
    } catch (err) {
      document.getElementById('toast-container')?.classList.add('hidden');
      console.error('Ошибка выхода из семьи:', err);
      showToast('Ошибка выхода: ' + err.message, true);
    }
  });
}

function deleteFamilyGroup() {
  const user = auth.currentUser;
  if (!user || !Cache?.family) return;

  showDialog('Удаление семьи', 'Вы уверены, что хотите удалить семейную группу? Все объединенные данные будут удалены, а участники отключены.', true, async () => {
    showToast('Удаление семейной группы...', false, true);
    const tables = ['Transactions', 'Deposits', 'Broker', 'Goals', 'Categories', 'CategoryRules', 'BudgetPlan', 'CalendarBills'];
    try {
      const famId = Cache.family.id;

      // Удаляем все подколлекции семьи
      for (const table of tables) {
        const snap = await db.collection('families').doc(famId).collection(table).get();
        if (!snap.empty) {
          const batch = db.batch();
          snap.docs.forEach(doc => batch.delete(doc.ref));
          await batch.commit();
        }
      }

      // Удаляем сам документ семьи
      await db.collection('families').doc(famId).delete();

      await db.collection('users').doc(user.uid).update({
        familyId: firebase.firestore.FieldValue.delete()
      });

      Cache.family = null;
      document.getElementById('toast-container')?.classList.add('hidden');
      showToast('Семейная группа и общие данные удалены');

      renderFamilySettingsUI();
      await fetchAllData();
    } catch (err) {
      document.getElementById('toast-container')?.classList.add('hidden');
      console.error('Ошибка удаления семьи:', err);
      showToast('Ошибка удаления: ' + err.message, true);
    }
  });
}

// ==========================================
// Account Deletion Management
// ==========================================

function openDeleteAccountModal() {
  const user = auth.currentUser;
  if (!user) return;

  const isGoogle = Array.isArray(user?.providerData) && user.providerData.some(p => p && p.providerId === 'google.com');
  const dialog = document.getElementById('delete-account-dialog');
  const passSection = document.getElementById('delete-account-pass-section');
  const googleSection = document.getElementById('delete-account-google-section');
  const passInput = document.getElementById('delete-account-password');
  const confirmBtn = document.getElementById('delete-account-confirm-btn');

  if (passInput) passInput.value = '';
  if (confirmBtn) confirmBtn.disabled = false;

  if (isGoogle) {
    if (passSection) passSection.classList.add('hidden');
    if (googleSection) googleSection.classList.remove('hidden');
  } else {
    if (googleSection) googleSection.classList.add('hidden');
    if (passSection) passSection.classList.remove('hidden');
  }

  if (dialog) dialog.classList.remove('hidden');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeDeleteAccountModal() {
  const dialog = document.getElementById('delete-account-dialog');
  if (dialog) dialog.classList.add('hidden');
  const passInput = document.getElementById('delete-account-password');
  if (passInput) passInput.value = '';
}

async function purgeUserDataAndAuthUser(user) {
  showToast('Удаление всех данных аккаунта...', false, true);
  const tables = ['Transactions', 'Deposits', 'Broker', 'Goals', 'Categories', 'CategoryRules', 'BudgetPlan', 'CalendarBills'];

  try {
    // 1. Проверяем, состоит ли пользователь в семейной группе
    let familyId = Cache?.family?.id || null;
    if (!familyId) {
      const userDoc = await db.collection('users').doc(user.uid).get();
      if (userDoc.exists) {
        familyId = userDoc.data()?.familyId || null;
      }
    }

    if (familyId) {
      try {
        const famDoc = await db.collection('families').doc(familyId).get();
        if (famDoc.exists) {
          const famData = famDoc.data() || {};
          const members = Array.isArray(famData.members) ? famData.members : [];
          const remainingMembers = members.filter(m => m && m.uid !== user.uid);

          if (remainingMembers.length === 0) {
            // Сценарий 3: Единственный член семейной группы удаляет аккаунт
            // Удаляются все объединенные данные семьи и сама группа
            for (const table of tables) {
              const snap = await db.collection('families').doc(familyId).collection(table).get();
              if (!snap.empty) {
                const batch = db.batch();
                snap.docs.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
              }
            }
            await db.collection('families').doc(familyId).delete();
          } else {
            // В группе остаются другие участники
            const isOwner = (famData.ownerUid === user.uid) || (members.find(m => m && m.uid === user.uid)?.role === 'owner');
            if (isOwner) {
              // Сценарий 2: Создатель группы удаляет аккаунт -> владельцем становится следующий участник
              const newOwner = remainingMembers[0];
              remainingMembers.forEach((m, idx) => {
                if (idx === 0) m.role = 'owner';
                else if (m.role === 'owner') m.role = 'member';
              });
              await db.collection('families').doc(familyId).update({
                ownerUid: newOwner.uid,
                members: remainingMembers
              });
            } else {
              // Сценарий 1: Простой участник удаляет аккаунт -> выходит из группы
              await db.collection('families').doc(familyId).update({
                members: remainingMembers
              });
            }
          }
        }
      } catch (famErr) {
        console.warn('Ошибка обработки семейной группы при удалении аккаунта:', famErr);
      }
    }

    // 2. Безвозвратно удаляем личные подколлекции пользователя (/users/{uid}/{table})
    for (const table of tables) {
      const snap = await db.collection('users').doc(user.uid).collection(table).get();
      if (!snap.empty) {
        const batch = db.batch();
        snap.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
      }
    }

    // 3. Удаляем документ пользователя (/users/{uid})
    await db.collection('users').doc(user.uid).delete();

    // 4. Удаляем учетную запись Firebase Auth
    await user.delete();

    if (typeof resetGlobalCache === 'function') resetGlobalCache();
    if (Cache) Cache.family = null;

    closeDeleteAccountModal();
    showToast('Аккаунт и все данные удалены');
  } catch (err) {
    console.error('Критическая ошибка при удалении аккаунта:', err);
    document.getElementById('toast-container')?.classList.add('hidden');
    showToast('Ошибка удаления данных: ' + err.message, true);
    throw err;
  }
}

async function submitDeleteAccountWithPassword() {
  const user = auth.currentUser;
  if (!user) return;

  const passInput = document.getElementById('delete-account-password');
  const confirmBtn = document.getElementById('delete-account-confirm-btn');
  const password = passInput?.value || '';

  if (!password) {
    showToast('Введите пароль для подтверждения', true);
    return;
  }

  if (confirmBtn) confirmBtn.disabled = true;
  showToast('Проверка пароля...', false, true);

  try {
    const credential = firebase.auth.EmailAuthProvider.credential(user.email, password);
    await user.reauthenticateWithCredential(credential);
    await purgeUserDataAndAuthUser(user);
  } catch (err) {
    if (confirmBtn) confirmBtn.disabled = false;
    console.error('Ошибка проверки пароля при удалении:', err);
    if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
      showToast('Неверный пароль. Попробуйте ещё раз', true);
    } else {
      showToast('Ошибка подтверждения: ' + err.message, true);
    }
  }
}

async function submitDeleteAccountWithGoogle() {
  const user = auth.currentUser;
  if (!user) return;

  showToast('Подтверждение входа Google...', false, true);
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    await user.reauthenticateWithPopup(provider);
    await purgeUserDataAndAuthUser(user);
  } catch (err) {
    console.error('Ошибка Google реаутентификации:', err);
    if (err.code !== 'auth/popup-closed-by-user') {
      showToast('Ошибка подтверждения Google: ' + err.message, true);
    } else {
      document.getElementById('toast-container')?.classList.add('hidden');
    }
  }
}

async function toggleBrokerSetting(enable) {
  const user = auth.currentUser;
  if (!user) return;

  try {
    await db.collection('users').doc(user.uid).set({
      settings: { showBroker: enable }
    }, { merge: true });

    if (!Cache.settings) Cache.settings = {};
    Cache.settings.showBroker = enable;

    applyBrokerVisibility(enable);
  } catch (e) {
    showToast('Ошибка сохранения: ' + e.message, true);
  }
}

async function togglePdfInfoSetting(enable) {
  const user = auth.currentUser;
  if (!user) return;

  try {
    await db.collection('users').doc(user.uid).set({
      settings: { showPdfInfo: enable }
    }, { merge: true });

    if (!Cache.settings) Cache.settings = {};
    Cache.settings.showPdfInfo = enable;
  } catch (e) {
    showToast('Ошибка сохранения: ' + e.message, true);
  }
}

function applyBrokerVisibility(show) {
  const navBroker = document.getElementById('nav-broker');
  if (navBroker) {
    navBroker.classList.toggle('hidden', !show);
  }

  const brokerTab = document.getElementById('broker-tab');
  if (!show && brokerTab && !brokerTab.classList.contains('hidden')) {
    switchTab('transactions');
  }
}

function openSubModalFromProfile(type) {
  window._returnToProfile = true;

  if (type === 'categories') {
    if (typeof showManageCategoriesDialog === 'function') showManageCategoriesDialog();
  } else if (type === 'rules') {
    if (typeof openRulesEditorModal === 'function') openRulesEditorModal();
  }
}

// ==========================================
// Global Scope Exports
// ==========================================
window.setAuthMode = setAuthMode;
window.loginWithGoogle = loginWithGoogle;
window.handleAuthSubmit = handleAuthSubmit;
window.resetAuthFormState = resetAuthFormState;
window.logoutUser = logoutUser;
window.openDeleteAccountModal = openDeleteAccountModal;
window.closeDeleteAccountModal = closeDeleteAccountModal;
window.submitDeleteAccountWithPassword = submitDeleteAccountWithPassword;
window.submitDeleteAccountWithGoogle = submitDeleteAccountWithGoogle;
window.openProfileModal = openProfileModal;
window.closeProfileModal = closeProfileModal;
window.toggleBrokerSetting = toggleBrokerSetting;
window.togglePdfInfoSetting = togglePdfInfoSetting;
window.openSubModalFromProfile = openSubModalFromProfile;
window.loadUserSettings = loadUserSettings;
window.applyBrokerVisibility = applyBrokerVisibility;
window.updateHeaderProfileUI = updateHeaderProfileUI;
window.toggleProfileNameEdit = toggleProfileNameEdit;
window.openAvatarPickerModal = openAvatarPickerModal;
window.closeAvatarPickerModal = closeAvatarPickerModal;
window.selectAvatarPreset = selectAvatarPreset;
window.applySelectedAvatar = applySelectedAvatar;
window.saveProfileInfo = saveProfileInfo;
window.openChangeLoginModal = openChangeLoginModal;
window.closeChangeLoginModal = closeChangeLoginModal;
window.submitChangeLogin = submitChangeLogin;
window.openChangePasswordModal = openChangePasswordModal;
window.closeChangePasswordModal = closeChangePasswordModal;
window.submitChangePassword = submitChangePassword;
window.renderFamilySettingsUI = renderFamilySettingsUI;
window.openCreateFamilyModal = openCreateFamilyModal;
window.closeCreateFamilyModal = closeCreateFamilyModal;
window.submitCreateFamily = submitCreateFamily;
window.openJoinFamilyModal = openJoinFamilyModal;
window.closeJoinFamilyModal = closeJoinFamilyModal;
window.submitJoinFamily = submitJoinFamily;
window.copyFamilyInviteCode = copyFamilyInviteCode;
window.leaveFamilyGroup = leaveFamilyGroup;
window.deleteFamilyGroup = deleteFamilyGroup;
window.checkFamilyBudgetReviewPrompt = checkFamilyBudgetReviewPrompt;
window.openFamilyReviewDialog = openFamilyReviewDialog;
window.closeFamilyReviewDialog = closeFamilyReviewDialog;
window.confirmFamilyBudgetReview = confirmFamilyBudgetReview;
