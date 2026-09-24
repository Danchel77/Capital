// ==========================================
// PWA Service Worker & Offline Resilience
// ==========================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.log('SW registration failed:', err);
    });
  });
}

function initOfflineResilience() {
  const badge = document.getElementById('offline-badge');

  function updateNetworkStatus() {
    const isOnline = navigator.onLine;
    if (badge) {
      if (!isOnline) {
        badge.classList.remove('hidden');
        badge.classList.add('inline-flex');
      } else {
        badge.classList.add('hidden');
        badge.classList.remove('inline-flex');
      }
    }
  }

  window.addEventListener('online', () => {
    updateNetworkStatus();
    showToast('Связь восстановлена • Синхронизация данных...');
    if (typeof auth !== 'undefined' && auth.currentUser) {
      fetchAllData();
    }
  });

  window.addEventListener('offline', () => {
    updateNetworkStatus();
    showToast('Офлайн-режим • Изменения сохраняются локально');
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateNetworkStatus);
  } else {
    updateNetworkStatus();
  }
}

initOfflineResilience();

// ==========================================
// Firebase Configuration & Initialization
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyC_JkUF__UfStFrTKecRasKqKBKXlQ4D88",
  authDomain: "familybudget-4245a.firebaseapp.com",
  projectId: "familybudget-4245a",
  storageBucket: "familybudget-4245a.firebasestorage.app",
  messagingSenderId: "129164761119",
  appId: "1:129164761119:web:0303fd6ccd41e071655d2a"
};

// Инициализируем приложение
let db = null;
let auth = null;

if (typeof firebase !== 'undefined') {
  if (!firebase.apps || !firebase.apps.length) {
    try {
      firebase.initializeApp(firebaseConfig);
    } catch (e) {
      console.warn('Firebase init error:', e);
    }
  }
  if (typeof firebase.firestore === 'function') {
    db = firebase.firestore();
    // Включаем поддержку офлайн-режима Firestore
    try {
      db.enablePersistence({ synchronizeTabs: true }).catch(err => {
        if (err.code === 'failed-precondition') {
          console.warn('Firestore persistence failed: Multiple tabs open');
        } else if (err.code === 'unimplemented') {
          console.warn('Firestore persistence is not supported by the browser');
        }
      });
    } catch (e) {}
  }
  if (typeof firebase.auth === 'function') {
    auth = firebase.auth();
  }
}

window.db = db;
window.auth = auth;

// ==========================================
// Global Application State (Cache)
// ==========================================
window.Cache = {
  transactions: [],
  categories: { expense: [], income: [] },
  deposits: [],
  broker: null,
  goals: [],
  categoryRules: [],
  budgetPlan: {},
  calendarBills: [],
  settings: {},
  userProfile: { displayName: 'Пользователь', avatarId: '' },
  family: null
};
let Cache = window.Cache;

function resetGlobalCache() {
  window.Cache = {
    transactions: [],
    categories: { expense: [], income: [] },
    deposits: [],
    broker: null,
    goals: [],
    categoryRules: [],
    budgetPlan: {},
    calendarBills: [],
    settings: {},
    userProfile: { displayName: 'Пользователь', avatarId: '' },
    family: null
  };
  Cache = window.Cache;
  return Cache;
}

function getCurrentUserProfile() {
  const user = typeof auth !== 'undefined' ? auth.currentUser : null;
  const defName = user ? (user.displayName || (user.email?.includes('@budget.local') ? user.email.replace('@budget.local', '') : user.email?.split('@')[0]) || 'Пользователь') : 'Пользователь';
  const rawAvatarId = Cache?.userProfile?.avatarId;
  const avatarId = (rawAvatarId !== undefined && rawAvatarId !== null && rawAvatarId !== '') ? rawAvatarId : 'user';
  return {
    displayName: Cache?.userProfile?.displayName || defName,
    avatarId: avatarId
  };
}

// Переменные текущего редактирования
let currentEditId = null;
let currentEditTable = null;

// ==========================================
// Database CRUD & Sync Operations
// ==========================================

// Хелпер доступа к коллекции: если подключен семейный бюджет — возвращает подколлекцию семьи, иначе личную
function getUserCol(table) {
  const user = auth.currentUser;
  if (!user) throw new Error('Пользователь не авторизован');
  
  if (Cache?.family?.id) {
    return db.collection('families').doc(Cache.family.id).collection(table);
  }
  return db.collection('users').doc(user.uid).collection(table);
}

function hideLoadingScreen() {
  if (typeof window.hideLoadingScreen === 'function' && window.hideLoadingScreen !== hideLoadingScreen) {
    window.hideLoadingScreen();
    return;
  }
  const ls = document.getElementById('loading-screen');
  if (!ls || ls.dataset.hiding === 'true') return;
  ls.dataset.hiding = 'true';
  ls.classList.add('loading-screen--exit');

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    window._loadingScreenElement = ls;
    if (ls.parentNode) {
      ls.parentNode.removeChild(ls);
    }
  };
  ls.addEventListener('transitionend', cleanup, { once: true });
  setTimeout(cleanup, 450);
}

function showLoadingScreen() {
  if (typeof window.showLoadingScreen === 'function' && window.showLoadingScreen !== showLoadingScreen) {
    window.showLoadingScreen();
    return;
  }
  let ls = document.getElementById('loading-screen');
  if (!ls && window._loadingScreenElement) {
    ls = window._loadingScreenElement;
    document.body.prepend(ls);
  }
  if (!ls) return;
  ls.dataset.hiding = 'false';
  ls.classList.remove('loading-screen--exit', 'hidden');
  ls.style.opacity = '1';
  ls.style.transform = 'scale(1)';
  ls.style.pointerEvents = 'auto';
}

async function fetchAllData(isSilent = false) {
  const tables = ['Transactions', 'Deposits', 'Broker', 'Goals', 'Categories', 'CategoryRules', 'BudgetPlan', 'CalendarBills'];

  // ЭТАП 1: Мгновенное чтение из локального кэша IndexedDB (15-40 мс)
  try {
    const cachedSnaps = await Promise.all(
      tables.map(tbl => getUserCol(tbl).get({ source: 'cache' }))
    );
    if (Array.isArray(cachedSnaps) && cachedSnaps.some(s => s && !s.empty)) {
      await applySnapshotsToUI(cachedSnaps, false);
      hideLoadingScreen();
    }
  } catch (e) {}

  // ЭТАП 2: Фоновая синхронизация со свежими данными сервера
  try {
    if (!isSilent) {
      showToast("Синхронизация...", false, true);
    }
    const serverSnaps = await Promise.all(
      tables.map(tbl => getUserCol(tbl).get())
    );
    await applySnapshotsToUI(serverSnaps, true);
    const syncTimeEl = document.getElementById('last-sync');
    if (syncTimeEl) {
      syncTimeEl.innerText = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (!isSilent) {
      document.getElementById('toast-container')?.classList.add('hidden');
    }
    hideLoadingScreen();

    if (typeof checkFamilyBudgetReviewPrompt === 'function') {
      checkFamilyBudgetReviewPrompt();
    }
  } catch (err) {
    if (!isSilent) {
      document.getElementById('toast-container')?.classList.add('hidden');
    }
    hideLoadingScreen();
    if (Cache) {
      Cache.isServerSyncComplete = true;
      if (typeof renderBudgetTab === 'function') renderBudgetTab();
    } else if (!isSilent) {
      showToast("Нет подключения к сети", true);
    }
  }
}

// --- БД И ЛОГИКА ---
async function fetchCollection(table) {
  try {
    const querySnapshot = await getUserCol(table).get();
    const data = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    switch (table) {
      case 'Transactions':
        Cache.transactions = processTransactions(data);
        renderTransactions();
        renderBudgetTab();
        break;
      case 'Deposits':
        Cache.deposits = processDeposits(data, Cache.goals);
        renderDeposits();
        break;
      case 'Broker':
        Cache.broker = processBroker(data, Cache.goals);
        renderBroker();
        break;
      case 'CalendarBills':
        Cache.calendarBills = data;
        renderBudgetTab();
        break;
      case 'Goals':
        await fetchAllData();
        break;
    }
  } catch (e) {
    showToast("Ошибка загрузки", true);
  }
}

// Гибридная загрузка: системный словарь из default-rules.js + пользовательские оверрайды из Firestore
async function processOrSeedRules(snapshot) {
  const userDocs = snapshot ? snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) : [];
  const norm = (str) => typeof StatementCategorizer !== 'undefined' ? StatementCategorizer.normalize(str) : String(str || '').toLowerCase().trim();

  const disabledPatterns = new Set(
    userDocs.filter(d => d.disabled).map(d => norm(d.pattern))
  );

  const customRules = userDocs.filter(d => !d.disabled && d.pattern && d.category).map(d => ({
    id: d.id,
    pattern: d.pattern.trim(),
    category: d.category,
    isSystem: false
  }));

  const customMap = new Map();
  customRules.forEach(r => customMap.set(norm(r.pattern), r));

  const systemDefaults = window.DEFAULT_CATEGORY_RULES || [];
  const combined = [];

  systemDefaults.forEach((rule, idx) => {
    const patKey = norm(rule.pattern);
    if (disabledPatterns.has(patKey)) return;

    if (customMap.has(patKey)) {
      combined.push(customMap.get(patKey));
      customMap.delete(patKey);
    } else {
      combined.push({
        id: 'sys_' + idx,
        pattern: rule.pattern,
        category: rule.category,
        isSystem: true
      });
    }
  });

  customMap.forEach(rule => combined.push(rule));
  return combined;
}

async function applySnapshotsToUI([txS, depS, brS, goalS, catS, rulesS, planS, billsS], fromServer = false) {
  const txData = txS.docs.map(d => ({ id: d.id, ...d.data() }));
  const depData = depS.docs.map(d => ({ id: d.id, ...d.data() }));
  const brData = brS.docs.map(d => ({ id: d.id, ...d.data() }));
  const goalData = goalS ? goalS.docs.map(d => ({ id: d.id, ...d.data() })) : [];
  const planData = planS && !planS.empty ? planS.docs[0].data() : {};
  const billsData = billsS ? billsS.docs.map(d => ({ id: d.id, ...d.data() })) : [];
  
  const processedDeposits = processDeposits(depData, goalData);
  const processedBroker = processBroker(brData, goalData);
  const catData = catS.docs.map(d => ({ id: d.id, ...d.data() }));
  const categories = processCategories(catData);

  const existingSettings = (Cache && Cache.settings) ? Cache.settings : {};
  const existingUserProfile = (Cache && Cache.userProfile) ? Cache.userProfile : { displayName: 'Пользователь', avatarId: '' };
  const existingFamily = (Cache && Cache.family) ? Cache.family : null;
  const wasServerSyncComplete = Cache ? !!Cache.isServerSyncComplete : false;

  Cache = {
    isInitialDataLoaded: true,
    isServerSyncComplete: fromServer || wasServerSyncComplete,
    settings: existingSettings,
    userProfile: existingUserProfile,
    family: existingFamily,
    transactions: processTransactions(txData),
    deposits: processedDeposits,
    broker: processedBroker,
    goals: processGoals(goalData),
    categories: categories,
    categoryRules: await processOrSeedRules(rulesS),
    budgetPlan: planData,
    calendarBills: billsData
  };
  window.Cache = Cache;

  if (typeof updateGoalDropdowns === 'function') updateGoalDropdowns();
  renderBudgetTab();
  renderTransactions();
  renderDeposits();
  renderBroker();

  if (typeof checkAndCreditMaturedDeposits === 'function') {
    checkAndCreditMaturedDeposits();
  }

  // Фиксируем завершение первичной анимации счетчиков после их первого появления
  setTimeout(() => {
    window._initialAnimationDone = true;
  }, 1400);
}

// Управление флагами обновления табов (кэширование DOM)
function markTabsDirty() {
  window._budgetTabDirty = true;
  window._transactionsTabDirty = true;
  window._depositsTabDirty = true;
  window._brokerTabDirty = true;
}
window.markTabsDirty = markTabsDirty;

/* Универсальная оптимистичная функция добавления/обновления (0мс отклик) */
async function submitAction(btnId, table, data) {
  const btn = document.getElementById(btnId);
  if (btn) btn.disabled = true;

  const isEdit = !!(currentEditId && currentEditTable === table);
  const targetId = currentEditId;

  // 1. Мгновенно закрываем форму в 0мс
  if (btn) {
    const formContainer = btn.closest('form')?.parentElement;
    if (formContainer) formContainer.classList.add('hidden');
    btn.disabled = false;
    btn.innerText = isEdit ? 'Сохранить изменения' : btn.innerText;
  }

  currentEditId = null;
  currentEditTable = null;

  // 2. Оптимистично обновляем данные в памяти Cache и вызываем моментальный перерендер
  if (table === 'Transactions') {
    const userProfile = (typeof getCurrentUserProfile === 'function') ? getCurrentUserProfile() : (Cache?.userProfile || { displayName: 'Пользователь', avatarId: 'user' });
    const defaultAuthor = {
      uid: auth?.currentUser?.uid || '',
      name: userProfile.displayName,
      avatarId: userProfile.avatarId || 'user'
    };

    const now = Date.now();
    const items = Array.isArray(data) ? data : [data];
    items.forEach((item, idx) => {
      if (!item.author) item.author = defaultAuthor;
      if (!item.createdAt) item.createdAt = now + idx;
    });

    const newIds = items.map((item, idx) => isEdit ? targetId : `opt_tx_${now}_${idx}`);
    window.lastAddedTxIds = newIds;
    window.lastAddedTxTime = now;

    const allFlat = typeof getAllCachedTransactionsFlat === 'function' ? getAllCachedTransactionsFlat() : [];
    items.forEach((item, idx) => {
      const id = newIds[idx];
      const parsedDate = (typeof parseAnyDate === 'function' ? parseAnyDate(item.date) : new Date(item.date)) || new Date();
      const txObj = {
        id,
        type: item.type || 'Расход',
        amount: parseAmount(item.amount),
        date: formatDateStr(parsedDate, 'yyyy-MM-dd'),
        rawDate: formatDateStr(parsedDate, 'yyyy-MM-dd'),
        formattedDate: formatDateStr(parsedDate, 'dd.MM.yyyy'),
        category: item.category,
        comment: (typeof getTxComment === 'function') ? getTxComment(item) : (item.comment || item.description || item.merchant || item.title || item.name || item.note || item.notes || item.payee || item.details || ''),
        description: (typeof getTxComment === 'function') ? getTxComment(item) : (item.comment || item.description || item.merchant || item.title || item.name || item.note || item.notes || item.payee || item.details || ''),
        author: item.author || defaultAuthor,
        excludeFromBudget: !!item.excludeFromBudget,
        spreadMonths: parseInt(item.spreadMonths, 10) || 1,
        isBillPayment: !!item.isBillPayment,
        billId: item.billId || null,
        billName: item.billName || '',
        billType: item.billType || (item.spreadMonths > 1 ? 'onetime' : (item.isBillPayment ? 'recurring' : '')),
        createdAt: item.createdAt || (now + idx),
        timestamp: item.createdAt || (now + idx)
      };
      if (isEdit) {
        const foundIdx = allFlat.findIndex(t => t.id === targetId);
        if (foundIdx !== -1) allFlat[foundIdx] = { ...allFlat[foundIdx], ...txObj };
        else allFlat.unshift(txObj);
      } else {
        allFlat.unshift(txObj);
      }
    });

    if (typeof processTransactions === 'function') {
      Cache.transactions = processTransactions(allFlat);
    }
    markTabsDirty();
    if (typeof renderTransactions === 'function') renderTransactions();
    if (typeof renderBudgetTab === 'function') renderBudgetTab();
  } else if (table === 'Deposits') {
    markTabsDirty();
    if (typeof renderDeposits === 'function') renderDeposits();
    if (typeof renderBudgetTab === 'function') renderBudgetTab();
  }

  // 3. Асинхронное фоновое сохранение в Firestore
  try {
    const saveTime = Date.now();
    if (isEdit) {
      await getUserCol(table).doc(targetId).update(data);
    } else if (Array.isArray(data)) {
      const batch = db.batch();
      const realAddedIds = [];
      data.forEach((item, idx) => {
        const docRef = getUserCol(table).doc();
        batch.set(docRef, {
          ...item,
          createdAt: item.createdAt || (saveTime + idx)
        });
        realAddedIds.push(docRef.id);
      });
      await batch.commit();
      window.lastAddedTxIds = realAddedIds;
    } else {
      const payload = {
        ...data,
        createdAt: data.createdAt || saveTime
      };
      const docRef = await getUserCol(table).add(payload);
      if (table === 'Transactions') {
        window.lastAddedTxIds = [docRef.id];
      }
    }

    // Фоновая тихая синхронизация коллекции
    if (table === 'Transactions') {
      fetchCollection('Transactions').catch(() => {});
    } else {
      fetchAllData().catch(() => {});
    }
  } catch (e) {
    console.error('Ошибка сохранения:', e);
    showToast('Ошибка сохранения: ' + (e.message || ''), true);
    fetchAllData();
  }
}

function deleteRecord(table, id) {
  showDialog('Удаление', 'Точно удалить запись? Это нельзя отменить.', true, async () => {
    try {
      // Плавная анимация схлопывания и исчезновения удаляемого элемента
      const targetEl = document.querySelector(`.card[data-id="${id}"]`) || document.querySelector(`[data-id="${id}"]`);
      if (targetEl) {
        targetEl.classList.add('tx-row-deleting');
        setTimeout(() => targetEl.remove(), 250);
      }

      // Мгновенно удаляем из локального кэша Cache в 0мс
      if (table === 'Transactions') {
        const allTxs = typeof getAllCachedTransactionsFlat === 'function' ? getAllCachedTransactionsFlat() : [];
        const deletedTx = allTxs.find(t => t.id === id);
        const filtered = allTxs.filter(t => t.id !== id);
        if (typeof processTransactions === 'function') {
          Cache.transactions = processTransactions(filtered);
        }
        markTabsDirty();
        if (typeof renderTransactions === 'function') renderTransactions();
        if (typeof renderBudgetTab === 'function') renderBudgetTab();

        if (typeof handleTransactionsDeleted === 'function') {
          handleTransactionsDeleted([id], deletedTx ? [deletedTx] : []).catch(() => {});
        }
      } else if (table === 'Deposits') {
        if (Array.isArray(Cache?.deposits)) {
          Cache.deposits = Cache.deposits.filter(d => d.id !== id);
        }
        markTabsDirty();
        if (typeof renderDeposits === 'function') renderDeposits();
        if (typeof renderBudgetTab === 'function') renderBudgetTab();
      } else if (table === 'Goals') {
        if (Array.isArray(Cache?.goals)) {
          Cache.goals = Cache.goals.filter(g => g.id !== id);
        }
        markTabsDirty();
        if (typeof renderBudgetTab === 'function') renderBudgetTab();
        if (typeof updateGoalDropdowns === 'function') updateGoalDropdowns();
      }

      // Фоновое удаление из Firestore
      await getUserCol(table).doc(id).delete();

      if (table === 'Transactions') {
        fetchCollection('Transactions').catch(() => {});
      } else {
        fetchAllData().catch(() => {});
      }
    } catch (e) {
      console.error(e);
      showToast("Ошибка удаления", true);
      fetchAllData();
    }
  });
}

// Инициализация профиля ТОЛЬКО если это совершенно новый пользователь
async function initNewUserIfNeeded(user) {
  try {
    const userDocRef = db.collection('users').doc(user.uid);
    const userDoc = await userDocRef.get();

    // Пользователь уже зарегистрирован и настроен — сразу выходим
    if (userDoc.exists) return;

    // Новый аккаунт: создаем профиль и начальные категории со словарем
    await seedNewUserInitialData(user);
  } catch (e) {
    console.error('Ошибка инициализации профиля:', e);
  }
}

// Заполнение начальных категорий и правил для нового аккаунта
async function seedNewUserInitialData(user) {
  try {
    const batch = db.batch();

    const displayName = user.displayName || user.email?.split('@')[0] || 'Пользователь';
    // Документ пользователя
    batch.set(db.collection('users').doc(user.uid), {
      migrated: true,
      displayName: displayName,
      email: user.email || '',
      profile: {
        displayName: displayName,
        avatarId: ''
      },
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    await batch.commit();
  } catch (err) {
    console.error('Ошибка инициализации нового пользователя:', err);
  }
}

// ==========================================
// Formatting & Utility Functions
// ==========================================

// Режим приватности (скрытие/показ сумм для защиты от посторонних глаз)
window.isPrivacyModeEnabled = (function() {
  try {
    return localStorage.getItem('budget_privacy_mode') === '1';
  } catch (e) {
    return false;
  }
})();

const EYE_SVG_OPEN = `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_SVG_CLOSED = `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-[#727cff]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><line x1="2" y1="2" x2="22" y2="22"/></svg>`;

function updatePrivacyModeUI() {
  const isPrivate = !!window.isPrivacyModeEnabled;
  const iconContainer = document.getElementById('privacy-icon-container');
  const toggleBtn = document.getElementById('privacy-toggle-btn');

  if (document.body) {
    document.body.classList.toggle('privacy-mode-active', isPrivate);
  }

  if (iconContainer) {
    iconContainer.innerHTML = isPrivate ? EYE_SVG_CLOSED : EYE_SVG_OPEN;
  }

  if (toggleBtn) {
    if (isPrivate) {
      toggleBtn.classList.add('bg-[#6C5DD3]/20', 'border-[#6C5DD3]/50', 'text-[#727cff]');
      toggleBtn.classList.remove('text-gray-300');
      toggleBtn.title = 'Показать суммы';
    } else {
      toggleBtn.classList.remove('bg-[#6C5DD3]/20', 'border-[#6C5DD3]/50', 'text-[#727cff]');
      toggleBtn.classList.add('text-gray-300');
      toggleBtn.title = 'Скрыть суммы';
    }
  }
}

function togglePrivacyMode() {
  window.isPrivacyModeEnabled = !window.isPrivacyModeEnabled;
  try {
    localStorage.setItem('budget_privacy_mode', window.isPrivacyModeEnabled ? '1' : '0');
  } catch (e) {}

  updatePrivacyModeUI();

  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try { navigator.vibrate(15); } catch (e) {}
  }

  showToast(window.isPrivacyModeEnabled ? 'Режим приватности включен' : 'Суммы снова отображаются');

  if (typeof markTabsDirty === 'function') markTabsDirty();

  const currentTab = typeof getCurrentActiveTab === 'function' ? getCurrentActiveTab() : 'budget';
  if (currentTab === 'budget' && typeof renderBudgetTab === 'function') renderBudgetTab();
  else if (currentTab === 'transactions' && typeof renderTransactions === 'function') renderTransactions();
  else if (currentTab === 'deposits' && typeof renderDeposits === 'function') renderDeposits();
  else if (currentTab === 'broker' && typeof renderBroker === 'function') renderBroker();
}

const formatMoney = (sum, isInputOrDetails = false) => {
  if (window.isPrivacyModeEnabled && !isInputOrDetails) {
    return '•••• ₽';
  }
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: isInputOrDetails ? 2 : 0, // Убираем копейки везде по умолчанию
    maximumFractionDigits: isInputOrDetails ? 2 : 0
  }).format(sum).replace(',', '.'); // Использует неразрывные пробелы встроенно
};

// Плавная выразительная анимация числовых счетчиков (Rolling Counter / Odometer)
function animateNumber(el, targetNum, duration = 1200, isCurrency = true) {
  if (!el) return;
  const target = Math.round(Number(targetNum) || 0);

  // В режиме приватности мгновенно отображаем маскированные точки
  if (window.isPrivacyModeEnabled && isCurrency) {
    if (el._animFrame) cancelAnimationFrame(el._animFrame);
    el.innerText = '•••• ₽';
    el.dataset.animVal = String(target);
    return;
  }

  // Если у элемента еще нет значения:
  // При ПЕРВОЙ инициализации приложения (window._initialAnimationDone еще false) стартуем с 0.
  // После того, как первичная загрузка уже прошла, анимируем только реальные дельты изменения.
  let current = target;
  const hasExistingVal = el.dataset.animVal !== undefined && !isNaN(Number(el.dataset.animVal));

  if (hasExistingVal) {
    current = Number(el.dataset.animVal);
  } else if (!window._initialAnimationDone) {
    current = 0;
  }

  // Если значение не изменилось — мгновенно форматируем и выходим (никаких дерганий при смене экранов)
  if (hasExistingVal && current === target) {
    el.innerText = isCurrency ? formatMoney(target) : target.toLocaleString('ru-RU');
    return;
  }

  if (el._animFrame) cancelAnimationFrame(el._animFrame);

  // Если разница 0 (например, не первое открытие, а значение не изменилось)
  if (current === target) {
    el.dataset.animVal = String(target);
    el.innerText = isCurrency ? formatMoney(target) : target.toLocaleString('ru-RU');
    return;
  }

  const startTime = performance.now();
  const diff = target - current;

  function step(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(1, elapsed / duration);
    // Мягкая степенная кривая замедления для благородного докатывания счетчика
    const ease = 1 - Math.pow(1 - progress, 3);
    const currentVal = Math.round(current + diff * ease);

    el.innerText = isCurrency ? formatMoney(currentVal) : currentVal.toLocaleString('ru-RU');
    el.dataset.animVal = String(currentVal);

    if (progress < 1) {
      el._animFrame = requestAnimationFrame(step);
    } else {
      el.dataset.animVal = String(target);
      el.innerText = isCurrency ? formatMoney(target) : target.toLocaleString('ru-RU');
      el._animFrame = null;
    }
  }

  el._animFrame = requestAnimationFrame(step);
}

const getUnformattedVal = (el) => parseFloat(el.value.replace(/\s/g, '')) || 0;
const setFormattedVal = (id, val) => {
  const el = document.getElementById(id);
  el.value = val;
  formatSumInput(el);
};

function formatSumInput(el) {
  let val = el.value.replace(/[^\d.,]/g, '').replace(',', '.');
  if (val) {
    let parts = val.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    el.value = parts.join('.');
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function parseAnyDate(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === 'object') {
    if (typeof val.toDate === 'function') {
      try { return val.toDate(); } catch(e) {}
    }
    if (typeof val.seconds === 'number') {
      return new Date(val.seconds * 1000);
    }
    if (typeof val._seconds === 'number') {
      return new Date(val._seconds * 1000);
    }
  }
  if (typeof val === 'number') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  const str = String(val).trim();
  if (!str) return null;

  // 1. DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY with optional time
  const ruMatch = str.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (ruMatch) {
    const d = parseInt(ruMatch[1], 10);
    const m = parseInt(ruMatch[2], 10) - 1;
    let y = parseInt(ruMatch[3], 10);
    if (y < 100) y += 2000;
    const hh = ruMatch[4] ? parseInt(ruMatch[4], 10) : 12;
    const mm = ruMatch[5] ? parseInt(ruMatch[5], 10) : 0;
    const ss = ruMatch[6] ? parseInt(ruMatch[6], 10) : 0;
    return new Date(y, m, d, hh, mm, ss);
  }

  // 2. YYYY-MM-DD or YYYY/MM/DD with optional time
  const isoMatch = str.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10) - 1;
    const d = parseInt(isoMatch[3], 10);
    const hh = isoMatch[4] ? parseInt(isoMatch[4], 10) : 12;
    const mm = isoMatch[5] ? parseInt(isoMatch[5], 10) : 0;
    const ss = isoMatch[6] ? parseInt(isoMatch[6], 10) : 0;
    return new Date(y, m, d, hh, mm, ss);
  }

  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function parseAmount(val) {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  const clean = String(val).replace(/\s/g, '').replace(/,/g, '.').replace(/[^\d.-]/g, '');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

function formatDateStr(dateStr, format) {
  if (!dateStr) return '';
  const d = parseAnyDate(dateStr);
  if (!d) return String(dateStr);

  const RU_MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const dNum = d.getDate();

  if (format === 'd MMM') {
    return `${dNum} ${RU_MONTHS_SHORT[d.getMonth()]}`;
  }
  if (format === 'd MMM yyyy') {
    return `${dNum} ${RU_MONTHS_SHORT[d.getMonth()]} ${year}`;
  }
  if (format === 'dd.MM.yyyy') {
    return `${day}.${month}.${year}`;
  }
  if (format === 'dd.MM') {
    return `${day}.${month}`;
  }
  if (format === 'yyyy-MM') {
    return `${year}-${month}`;
  }
  return `${year}-${month}-${day}`;
}

// ==========================================
// UI Notifications & Dialogs (с поддержкой свайпа влево/вправо)
// ==========================================

let toastTimer = null;
let isToastDragging = false;
let toastStartX = 0;
let toastStartY = 0;
let toastDiffX = 0;
let toastIsHorizontalSwipe = false;

function initToastSwipe() {
  const content = document.getElementById('toast-content');
  const container = document.getElementById('toast-container');
  if (!content || !container || content._swipeInited) return;
  content._swipeInited = true;

  function onTouchStart(e) {
    if (container.classList.contains('hidden')) return;
    const touch = e.touches ? e.touches[0] : e;
    isToastDragging = true;
    toastIsHorizontalSwipe = false;
    toastStartX = touch.clientX;
    toastStartY = touch.clientY;
    toastDiffX = 0;

    // Приостанавливаем автотаймер закрытия при удержании тоста пальцем
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }

    content.classList.add('is-dragging');
  }

  function onTouchMove(e) {
    if (!isToastDragging) return;
    const touch = e.touches ? e.touches[0] : e;
    const dx = touch.clientX - toastStartX;
    const dy = touch.clientY - toastStartY;

    if (!toastIsHorizontalSwipe) {
      if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) {
        toastIsHorizontalSwipe = true;
      } else if (Math.abs(dy) > 10) {
        // Вертикальный скролл страницы — отменяем перехват
        isToastDragging = false;
        content.classList.remove('is-dragging');
        return;
      }
    }

    if (toastIsHorizontalSwipe) {
      if (e.cancelable) e.preventDefault();
      toastDiffX = dx;
      const opacity = Math.max(0.2, 1 - Math.abs(dx) / 220);
      content.style.transform = `translateX(${dx}px) scale(0.98)`;
      content.style.opacity = String(opacity);
    }
  }

  function onTouchEnd() {
    if (!isToastDragging) return;
    isToastDragging = false;
    content.classList.remove('is-dragging');

    if (toastIsHorizontalSwipe && Math.abs(toastDiffX) > 45) {
      // Смахивание влево или вправо завершено
      dismissToast(toastDiffX > 0 ? 1 : -1);
    } else {
      // Пружинящий возврат на центр
      content.style.transform = '';
      content.style.opacity = '';
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        dismissToast(0);
      }, 2000);
    }
  }

  content.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('touchend', onTouchEnd, { passive: true });
  window.addEventListener('touchcancel', onTouchEnd, { passive: true });

  // Поддержка свайпа мышью (десктоп)
  content.addEventListener('mousedown', onTouchStart);
  window.addEventListener('mousemove', onTouchMove);
  window.addEventListener('mouseup', onTouchEnd);
}

function dismissToast(direction = 0) {
  const container = document.getElementById('toast-container');
  const content = document.getElementById('toast-content');
  if (!container || !content) return;

  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }

  if (direction !== 0) {
    // Тактильный виброотклик при смахивании тоста
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(10); } catch (e) {}
    }
    content.classList.add('is-dismissing');
    const exitX = direction > 0 ? window.innerWidth : -window.innerWidth;
    content.style.transform = `translateX(${exitX}px) scale(0.9)`;
    content.style.opacity = '0';

    setTimeout(() => {
      container.classList.add('hidden');
      content.classList.remove('is-dismissing');
      content.style.transform = '';
      content.style.opacity = '';
    }, 220);
  } else {
    container.classList.add('hidden');
    content.style.transform = '';
    content.style.opacity = '';
  }
}

function showToast(text, isError = false, keep = false) {
  const container = document.getElementById('toast-container');
  const content = document.getElementById('toast-content');
  const textEl = document.getElementById('toast-text');
  const spinner = document.getElementById('toast-spinner');
  const successIcon = document.getElementById('toast-icon-success');
  const errorIcon = document.getElementById('toast-icon-error');

  if (!container || !textEl) return;

  clearTimeout(toastTimer);
  textEl.innerText = text;

  if (content) {
    content.classList.remove('is-dragging', 'is-dismissing');
    content.style.transform = '';
    content.style.opacity = '';
  }

  if (isError) {
    if (spinner) spinner.style.display = 'none';
    if (successIcon) successIcon.classList.add('hidden');
    if (errorIcon) errorIcon.classList.remove('hidden');
    if (content) content.style.borderColor = 'rgba(255, 69, 58, 0.4)';
  } else if (keep) {
    if (spinner) spinner.style.display = 'block';
    if (successIcon) successIcon.classList.add('hidden');
    if (errorIcon) errorIcon.classList.add('hidden');
    if (content) content.style.borderColor = 'rgba(108, 93, 211, 0.4)';
  } else {
    if (spinner) spinner.style.display = 'none';
    if (successIcon) successIcon.classList.remove('hidden');
    if (errorIcon) errorIcon.classList.add('hidden');
    if (content) content.style.borderColor = 'rgba(48, 209, 88, 0.4)';
  }

  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  initToastSwipe();
  container.classList.remove('hidden');

  if (!keep) {
    toastTimer = setTimeout(() => {
      dismissToast(0);
    }, 2600);
  }
}

// Универсальный хелпер надежного извлечения комментария/описания/названия транзакции
function getTxComment(tx) {
  if (!tx || typeof tx !== 'object') return '';
  const val = tx.comment ??
    tx.description ??
    tx.merchant ??
    tx.note ??
    tx.notes ??
    tx.title ??
    tx.name ??
    tx.payee ??
    tx.details ??
    tx.rawDetails ??
    tx.memo ??
    tx.purpose ??
    tx.text ??
    tx.message ??
    tx.label ??
    tx['комментарий'] ??
    tx['описание'] ??
    tx['назначение'] ??
    tx['контрагент'] ??
    tx['получатель'] ??
    tx['плательщик'] ??
    tx['название'] ??
    tx['наименование'] ??
    '';
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed === 'undefined' || trimmed === 'null') return '';
    return trimmed;
  }
  if (typeof val === 'number') return String(val);
  return '';
}

/* Управление блокировкой и сохранением прокрутки страницы при открытии модальных окон */
let modalScrollPos = 0;
let openModalsCount = 0;

function lockBodyScroll() {
  if (openModalsCount === 0) {
    modalScrollPos = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    document.body.style.top = `-${modalScrollPos}px`;
    document.body.classList.add('modal-open');
  }
  openModalsCount++;
}

function unlockBodyScroll(force = false) {
  if (force) {
    openModalsCount = 0;
  } else if (openModalsCount > 0) {
    openModalsCount--;
  }

  // Проверяем, есть ли на экране реально открытые модальные окна
  const activeDialogs = Array.from(document.querySelectorAll('.fixed.inset-0')).filter(el => {
    if (el.id === 'loading-screen' || el.id === 'login-screen' || el.id === 'goal-flow-animation-overlay') return false;
    if (el.classList.contains('hidden')) return false;
    return (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0);
  });

  if (activeDialogs.length === 0) {
    openModalsCount = 0;
  }

  if (openModalsCount <= 0 || force) {
    openModalsCount = 0;
    const scrollY = document.body.style.top;
    document.body.classList.remove('modal-open');
    document.body.style.top = '';
    document.body.style.position = '';
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
    const topVal = parseInt(scrollY || '0', 10) * -1;
    const targetY = !isNaN(topVal) && topVal > 0 ? topVal : modalScrollPos;
    window.scrollTo({ top: targetY, left: 0, behavior: 'instant' });
    if (document.documentElement) document.documentElement.scrollTop = targetY;
    if (document.body) document.body.scrollTop = targetY;
  }
}

/* Кастомное диалоговое окно */
function showDialog(title, message, isConfirm, callback, cancelCallback, customOkText, customCancelText) {
  const dialog = document.getElementById('custom-dialog');
  if (!dialog) return;
  lockBodyScroll();
  document.getElementById('dialog-title').innerText = title;
  document.getElementById('dialog-message').innerText = message;
  const btns = document.getElementById('dialog-buttons');
  btns.innerHTML = '';

  if (isConfirm) {
    const isDelete = (title || '').toLowerCase().includes('удал');
    const okBtnClass = isDelete ? 'bg-red-600 hover:bg-red-500' : 'bg-[#6C5DD3] hover:bg-[#5b4ec2]';
    const okBtnText = customOkText || (isDelete ? 'Удалить' : 'ОК');
    const cancelBtnText = customCancelText || 'Отмена';

    btns.innerHTML = `<button id="dialog-cancel" type="button" class="flex-1 bg-[#212430] hover:bg-[#2A2D3C] text-gray-300 hover:text-white py-3 rounded-xl font-semibold text-xs cursor-pointer transition-colors active:scale-95">${escapeHtml(cancelBtnText)}</button>
                      <button id="dialog-ok" type="button" class="flex-1 ${okBtnClass} text-white py-3 rounded-xl font-semibold text-xs cursor-pointer transition-colors active:scale-95 shadow-md">${escapeHtml(okBtnText)}</button>`;
    document.getElementById('dialog-cancel').onclick = (e) => {
      if (e) e.stopPropagation();
      dialog.classList.add('hidden');
      unlockBodyScroll();
      if (cancelCallback) cancelCallback();
    };
    document.getElementById('dialog-ok').onclick = (e) => {
      if (e) e.stopPropagation();
      dialog.classList.add('hidden');
      unlockBodyScroll();
      if (callback) callback();
    };
  } else {
    const okBtnText = customOkText || 'Понятно';
    btns.innerHTML = `<button id="dialog-ok" type="button" class="w-full bg-[#6C5DD3] hover:bg-[#5b4ec2] text-white py-3 rounded-xl font-semibold text-xs cursor-pointer transition-colors active:scale-95 shadow-md">${escapeHtml(okBtnText)}</button>`;
    document.getElementById('dialog-ok').onclick = (e) => {
      if (e) e.stopPropagation();
      dialog.classList.add('hidden');
      unlockBodyScroll();
      if (callback) callback();
    };
  }
  dialog.classList.remove('hidden');
}

// ==========================================
// Global Scope Export
// ==========================================
window.db = db;
window.auth = auth;
window.getUserCol = getUserCol;
window.fetchAllData = fetchAllData;
window.fetchCollection = fetchCollection;
window.applySnapshotsToUI = applySnapshotsToUI;
window.submitAction = submitAction;
window.deleteRecord = deleteRecord;
window.formatMoney = formatMoney;
window.animateNumber = animateNumber;
window.formatSumInput = formatSumInput;
window.getUnformattedVal = getUnformattedVal;
window.setFormattedVal = setFormattedVal;
window.formatDateStr = formatDateStr;
window.parseAnyDate = parseAnyDate;
window.parseAmount = parseAmount;
window.escapeHtml = escapeHtml;
window.showToast = showToast;
window.showDialog = showDialog;
window.getTxComment = getTxComment;
window.lockBodyScroll = lockBodyScroll;
window.unlockBodyScroll = unlockBodyScroll;
window.resetGlobalCache = resetGlobalCache;
window.initNewUserIfNeeded = initNewUserIfNeeded;
window.processOrSeedRules = processOrSeedRules;
window.togglePrivacyMode = togglePrivacyMode;
window.updatePrivacyModeUI = updatePrivacyModeUI;
window.initOfflineResilience = initOfflineResilience;
window.hideLoadingScreen = hideLoadingScreen;
window.showLoadingScreen = showLoadingScreen;
window.getCurrentUserProfile = getCurrentUserProfile;
