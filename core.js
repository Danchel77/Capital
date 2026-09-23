// ==========================================
// PWA Service Worker Registration
// ==========================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.log('SW registration failed:', err);
    });
  });
}

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
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const db = firebase.firestore();
const auth = firebase.auth();

// Включаем поддержку офлайн-режима Firestore
db.enablePersistence({ synchronizeTabs: true }).catch(err => {
  if (err.code === 'failed-precondition') {
    console.warn('Firestore persistence failed: Multiple tabs open');
  } else if (err.code === 'unimplemented') {
    console.warn('Firestore persistence is not supported by the browser');
  }
});

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
  settings: {}
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
    settings: {}
  };
  Cache = window.Cache;
  return Cache;
}

// Переменные текущего редактирования
let currentEditId = null;
let currentEditTable = null;

// ==========================================
// Database CRUD & Sync Operations
// ==========================================

// Хелпер доступа к личной подколлекции авторизованного пользователя
function getUserCol(table) {
  const user = auth.currentUser;
  if (!user) throw new Error('Пользователь не авторизован');
  return db.collection('users').doc(user.uid).collection(table);
}

async function fetchAllData() {
  const tables = ['Transactions', 'Deposits', 'Broker', 'Goals', 'Categories', 'CategoryRules', 'BudgetPlan', 'CalendarBills'];

  // ЭТАП 1: Мгновенное чтение из локального кэша IndexedDB (15-40 мс)
  try {
    const cachedSnaps = await Promise.all(
      tables.map(tbl => getUserCol(tbl).get({ source: 'cache' }))
    );
    if (cachedSnaps.some(s => !s.empty)) {
      await applySnapshotsToUI(cachedSnaps, false);
      document.getElementById('loading-screen')?.classList.add('hidden');
    }
  } catch (e) {}

  // ЭТАП 2: Фоновая синхронизация со свежими данными сервера
  try {
    showToast("Синхронизация...", false, true);
    const serverSnaps = await Promise.all(
      tables.map(tbl => getUserCol(tbl).get())
    );
    await applySnapshotsToUI(serverSnaps, true);
    document.getElementById('last-sync').innerText = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    document.getElementById('toast-container')?.classList.add('hidden');
    document.getElementById('loading-screen')?.classList.add('hidden');
  } catch (err) {
    document.getElementById('toast-container')?.classList.add('hidden');
    document.getElementById('loading-screen')?.classList.add('hidden');
    if (Cache) {
      Cache.isServerSyncComplete = true;
      if (typeof renderBudgetTab === 'function') renderBudgetTab();
    } else {
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
  const wasServerSyncComplete = Cache ? !!Cache.isServerSyncComplete : false;

  Cache = {
    isInitialDataLoaded: true,
    isServerSyncComplete: fromServer || wasServerSyncComplete,
    settings: existingSettings,
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

/* Универсальная функция добавления/обновления */
async function submitAction(btnId, table, data) {

  const btn = document.getElementById(btnId);
  btn.disabled = true;

  try {
    if (currentEditId && currentEditTable === table) {
      await getUserCol(table).doc(currentEditId).update(data);
    } else if (Array.isArray(data)) {
      const batch = db.batch();
      const addedIds = [];
      data.forEach(item => {
        const docRef = getUserCol(table).doc();
        batch.set(docRef, item);
        addedIds.push(docRef.id);
      });
      await batch.commit();
      if (table === 'Transactions') {
        window.lastAddedTxIds = addedIds;
        window.lastAddedTxTime = Date.now();
      }
    } else {
      const docRef = await getUserCol(table).add(data);
      if (table === 'Transactions') {
        window.lastAddedTxIds = [docRef.id];
        window.lastAddedTxTime = Date.now();
      }
    }

    btn.disabled = false;
    btn.innerText = currentEditId ? 'Сохранить изменения' : btn.innerText;

    // Скрываем форму
    btn.closest('form').parentElement.classList.add('hidden');

    currentEditId = null;
    currentEditTable = null;

    // Оптимизированное обновление: только нужная коллекция
    if (table === 'Transactions') {
      await fetchCollection('Transactions');
      document.getElementById('toast-container').classList.add('hidden');
    } else {
      fetchAllData();
    }
  } catch (e) {
    btn.disabled = false;
    showToast(e.message, true);
  }
}

function deleteRecord(table, id) {
  showDialog('Удаление', 'Точно удалить запись? Это нельзя отменить.', true, async () => {
    try {
      // Плавная анимация схлопывания и исчезновения удаляемого элемента
      const targetEl = document.querySelector(`.card[data-id="${id}"]`) || document.querySelector(`[data-id="${id}"]`);
      if (targetEl) {
        targetEl.classList.add('tx-row-deleting');
        await new Promise(res => setTimeout(res, 600));
        targetEl.remove();
      }

      if (table === 'Transactions' && typeof handleTransactionsDeleted === 'function') {
        const allTxs = typeof getAllCachedTransactionsFlat === 'function' ? getAllCachedTransactionsFlat() : [];
        const deletedTx = allTxs.find(t => t.id === id);

        // Оптимистично удаляем из локального кэша
        if (Array.isArray(Cache?.transactions)) {
          for (const month of Cache.transactions) {
            if (Array.isArray(month.items)) {
              month.items = month.items.filter(t => t.id !== id);
            }
          }
        }

        await handleTransactionsDeleted([id], deletedTx ? [deletedTx] : []);
      }

      await getUserCol(table).doc(id).delete();

      // Оптимизированное обновление
      if (table === 'Transactions') {
        await fetchCollection('Transactions');
        document.getElementById('toast-container')?.classList.add('hidden');
      } else {
        fetchAllData();
      }
    } catch (e) {
      console.error(e);
      showToast("Ошибка", true);
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

    // Документ пользователя
    batch.set(db.collection('users').doc(user.uid), {
      migrated: true,
      displayName: user.displayName || user.email?.split('@')[0] || 'Пользователь',
      email: user.email || '',
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

const formatMoney = (sum, isInputOrDetails = false) => new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  minimumFractionDigits: isInputOrDetails ? 2 : 0, // Убираем копейки везде по умолчанию
  maximumFractionDigits: isInputOrDetails ? 2 : 0
}).format(sum).replace(',', '.'); // Использует неразрывные пробелы встроенно

// Плавная выразительная анимация числовых счетчиков (Rolling Counter / Odometer)
function animateNumber(el, targetNum, duration = 1200, isCurrency = true) {
  if (!el) return;
  const target = Math.round(Number(targetNum) || 0);

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
// UI Notifications & Dialogs
// ==========================================

let toastTimer = null;

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

  container.classList.remove('hidden');

  if (!keep) {
    toastTimer = setTimeout(() => {
      container.classList.add('hidden');
    }, 2400);
  }
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

function unlockBodyScroll() {
  if (openModalsCount > 0) {
    openModalsCount--;
  }
  if (openModalsCount === 0) {
    const scrollY = document.body.style.top;
    document.body.classList.remove('modal-open');
    document.body.style.top = '';
    const topVal = parseInt(scrollY || '0', 10) * -1;
    const targetY = !isNaN(topVal) && topVal > 0 ? topVal : modalScrollPos;
    window.scrollTo({ top: targetY, left: 0, behavior: 'instant' });
    if (document.documentElement) document.documentElement.scrollTop = targetY;
    if (document.body) document.body.scrollTop = targetY;
  }
}

/* Кастомное диалоговое окно */
function showDialog(title, message, isConfirm, callback) {
  const dialog = document.getElementById('custom-dialog');
  if (!dialog) return;
  lockBodyScroll();
  document.getElementById('dialog-title').innerText = title;
  document.getElementById('dialog-message').innerText = message;
  const btns = document.getElementById('dialog-buttons');
  btns.innerHTML = '';

  if (isConfirm) {
    const isDelete = (title || '').toLowerCase().includes('удал');
    const okBtnClass = isDelete ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500';
    const okBtnText = isDelete ? 'Удалить' : 'ОК';

    btns.innerHTML = `<button id="dialog-cancel" type="button" class="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-xl font-medium cursor-pointer transition-colors active:scale-95">Отмена</button>
                      <button id="dialog-ok" type="button" class="flex-1 ${okBtnClass} text-white py-3 rounded-xl font-medium cursor-pointer transition-colors active:scale-95 shadow-md">${okBtnText}</button>`;
    document.getElementById('dialog-cancel').onclick = (e) => {
      if (e) e.stopPropagation();
      dialog.classList.add('hidden');
      unlockBodyScroll();
    };
    document.getElementById('dialog-ok').onclick = (e) => {
      if (e) e.stopPropagation();
      dialog.classList.add('hidden');
      unlockBodyScroll();
      if (callback) callback();
    };
  } else {
    btns.innerHTML = `<button id="dialog-ok" type="button" class="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-medium cursor-pointer transition-colors active:scale-95 shadow-md">Понятно</button>`;
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
window.lockBodyScroll = lockBodyScroll;
window.unlockBodyScroll = unlockBodyScroll;
window.resetGlobalCache = resetGlobalCache;
window.initNewUserIfNeeded = initNewUserIfNeeded;
window.processOrSeedRules = processOrSeedRules;
