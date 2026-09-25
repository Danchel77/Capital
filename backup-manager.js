/**
 * backup-manager.js
 * Модуль экспорта и импорта данных учетной записи в формате JSON с детальным предпросмотром и умной защитой от дубликатов.
 */

// Состояние импорта
let currentParsedBackup = null;
let currentBackupFileName = '';
let currentBackupFileSize = 0;

// Состояние модального окна инспекции (детального просмотра)
let currentInspectSection = null; // 'tx' | 'dep' | 'broker' | 'goals' | 'bills' | 'rules'
let currentInspectFilter = 'all';  // 'all' | 'new' | 'dup'

/**
 * Открытие модального окна резервного копирования
 */
function openDataBackupModal() {
  const dlg = document.getElementById('data-backup-dialog');
  if (!dlg) return;

  switchBackupTab('export');
  updateExportCounters();
  updateBackupExportToggleAllButton();
  dlg.classList.remove('hidden');
  if (typeof lucide !== 'undefined') lucide.createIcons({ root: dlg });
}

/**
 * Закрытие модального окна резервного копирования
 */
function closeDataBackupModal() {
  const dlg = document.getElementById('data-backup-dialog');
  if (dlg) dlg.classList.add('hidden');
  closeBackupInspectModal();
  resetImportState();
}

/**
 * Переключение вкладок в модальном окне: 'export' | 'import'
 */
function switchBackupTab(tab) {
  const exportPane = document.getElementById('backup-pane-export');
  const importPane = document.getElementById('backup-pane-import');
  const exportTabBtn = document.getElementById('backup-tab-btn-export');
  const importTabBtn = document.getElementById('backup-tab-btn-import');

  if (tab === 'export') {
    exportPane?.classList.remove('hidden');
    importPane?.classList.add('hidden');
    exportTabBtn?.classList.add('bg-[#6C5DD3]', 'text-white', 'shadow-sm');
    exportTabBtn?.classList.remove('text-gray-400', 'hover:text-gray-200');
    importTabBtn?.classList.remove('bg-[#6C5DD3]', 'text-white', 'shadow-sm');
    importTabBtn?.classList.add('text-gray-400', 'hover:text-gray-200');
    updateExportCounters();
    updateBackupExportToggleAllButton();
  } else {
    exportPane?.classList.add('hidden');
    importPane?.classList.remove('hidden');
    importTabBtn?.classList.add('bg-[#6C5DD3]', 'text-white', 'shadow-sm');
    importTabBtn?.classList.remove('text-gray-400', 'hover:text-gray-200');
    exportTabBtn?.classList.remove('bg-[#6C5DD3]', 'text-white', 'shadow-sm');
    exportTabBtn?.classList.add('text-gray-400', 'hover:text-gray-200');
    
    if (currentParsedBackup) {
      updateImportAnalysis();
    }
  }

  const dlg = document.getElementById('data-backup-dialog');
  if (dlg && typeof lucide !== 'undefined') lucide.createIcons({ root: dlg });
}

/**
 * Обновление счетчиков существующих данных для экспорта
 */
function updateExportCounters() {
  const txCount = Array.isArray(Cache?.transactions)
    ? Cache.transactions.reduce((sum, m) => sum + (Array.isArray(m.items) ? m.items.length : (m.amount !== undefined ? 1 : 0)), 0)
    : 0;
  const depCount = Cache?.deposits?.length || 0;
  const brokerCount = Cache?.broker?.history?.length || 0;
  const goalsCount = Cache?.goals?.length || 0;
  const billsCount = Cache?.calendarBills?.length || 0;
  const rulesCount = (Cache?.categoryRules || []).filter(r => !r.isSystem).length;

  const setCounter = (id, count, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = `${count} ${text}`;
  };

  setCounter('export-count-tx', txCount, 'записей');
  setCounter('export-count-dep', depCount, 'счетов');
  setCounter('export-count-broker', brokerCount, 'операций');
  setCounter('export-count-goals', goalsCount, 'целей');
  setCounter('export-count-bills', billsCount, 'платежей');
  setCounter('export-count-rules', rulesCount, 'пользовательских правил');
}

/**
 * Умное переключение Выбрать все / Снять для экспорта
 */
function toggleSmartBackupExportAll() {
  const checkboxes = Array.from(document.querySelectorAll('.backup-export-chk'));
  if (checkboxes.length === 0) return;

  const allSelected = checkboxes.every(chk => chk.checked);
  const targetState = !allSelected;

  checkboxes.forEach(chk => {
    chk.checked = targetState;
  });

  updateBackupExportToggleAllButton();
}

/**
 * Обработчик изменения отдельного чекбокса экспорта
 */
function onBackupExportCheckboxChange() {
  updateBackupExportToggleAllButton();
}

/**
 * Обновление внешнего вида и состояния кнопки Выбрать все / Снять
 */
function updateBackupExportToggleAllButton() {
  const label = document.getElementById('backup-export-toggle-all-label');
  const icon = document.getElementById('backup-export-toggle-all-icon');
  const checkboxes = Array.from(document.querySelectorAll('.backup-export-chk'));

  if (!label || checkboxes.length === 0) return;

  const allSelected = checkboxes.every(chk => chk.checked);
  if (allSelected) {
    label.innerText = 'Снять';
    if (icon) {
      icon.setAttribute('data-lucide', 'square');
      icon.className = 'w-3.5 h-3.5 text-gray-400 flex-shrink-0';
    }
  } else {
    label.innerText = 'Все';
    if (icon) {
      icon.setAttribute('data-lucide', 'check-check');
      icon.className = 'w-3.5 h-3.5 text-[#727cff] flex-shrink-0';
    }
  }

  const btn = document.getElementById('backup-export-toggle-all-btn');
  if (btn && typeof lucide !== 'undefined') {
    lucide.createIcons({ root: btn });
  }
}

/**
 * Выбрать / снять все галочки для экспорта (обратная совместимость)
 */
function toggleAllExportCheckboxes(select) {
  const checkboxes = document.querySelectorAll('.backup-export-chk');
  checkboxes.forEach(chk => {
    chk.checked = !!select;
  });
  updateBackupExportToggleAllButton();
}

/**
 * Генерация и скачивание JSON файла бэкапа
 */
async function downloadBackupJson() {
  const expTx = document.getElementById('chk-exp-tx')?.checked;
  const expDep = document.getElementById('chk-exp-dep')?.checked;
  const expBroker = document.getElementById('chk-exp-broker')?.checked;
  const expGoals = document.getElementById('chk-exp-goals')?.checked;
  const expBills = document.getElementById('chk-exp-bills')?.checked;
  const expBudget = document.getElementById('chk-exp-budget')?.checked;
  const expRules = document.getElementById('chk-exp-rules')?.checked;

  if (!expTx && !expDep && !expBroker && !expGoals && !expBills && !expBudget && !expRules) {
    if (typeof showToast === 'function') showToast('Выберите хотя бы одну категорию для экспорта', true);
    return;
  }

  const exportPayload = {
    version: '1.0',
    appName: 'Семейный Бюджет',
    exportedAt: new Date().toISOString(),
    data: {}
  };

  if (expTx && Cache?.transactions) {
    const rawTxList = Array.isArray(Cache.transactions) 
      ? Cache.transactions.flatMap(m => m.items || (m.amount !== undefined ? [m] : []))
      : [];
    exportPayload.data.transactions = rawTxList.map(t => {
      const commentVal = (typeof getTxComment === 'function')
        ? getTxComment(t)
        : (t.comment || t.description || t.merchant || t.title || t.name || t.note || t.notes || t.payee || t.details || '');
      const rawType = String(t.type || '').trim().toLowerCase();
      const isInc = rawType === 'income' || rawType === 'доход';
      const typeVal = isInc ? 'Доход' : 'Расход';
      return {
        id: t.id,
        amount: Math.abs(Number(t.amount)) || 0,
        category: t.category || 'Прочее',
        date: t.date || t.rawDate,
        comment: commentVal,
        description: commentVal,
        merchant: commentVal,
        note: commentVal,
        title: commentVal,
        type: typeVal,
        excludeFromBudget: !!(t.excludeFromBudget || t.isExcludedFromBudget),
        spreadMonths: parseInt(t.spreadMonths, 10) || 1,
        isBillPayment: !!t.isBillPayment,
        billId: t.billId || null,
        billName: t.billName || '',
        goalId: t.goalId || null,
        goalName: t.goalName || null,
        authorName: t.authorName || (t.author ? t.author.name : null),
        createdAt: t.createdAt || null
      };
    });
  }

  if (expDep && Cache?.deposits) {
    exportPayload.data.deposits = (Cache.deposits || []).map(d => ({
      id: d.id,
      name: d.name || '',
      amount: Number(d.amount !== undefined ? d.amount : (d.initialAmount || d.currentAmount || 0)),
      rate: Number(d.rate !== undefined ? d.rate : (d.percent || 0)),
      startDate: d.rawStart || d.startDate || '',
      endDate: d.rawEnd || d.endDate || '',
      goalId: d.goalId || '',
      goalName: d.goalName || '',
      bank: d.bank || '',
      status: d.isClosed ? 'Закрыт' : (d.status || 'Активен'),
      isInterestCredited: !!d.isInterestCredited,
      // Алиасы для обратной совместимости
      initialAmount: Number(d.amount !== undefined ? d.amount : (d.initialAmount || 0)),
      currentAmount: Number(d.amount !== undefined ? d.amount : (d.currentAmount || d.initialAmount || 0)),
      percent: Number(d.rate !== undefined ? d.rate : (d.percent || 0))
    }));
  }

  if (expBroker && Cache?.broker?.history) {
    exportPayload.data.broker = (Cache.broker.history || []).map(b => ({
      id: b.id,
      date: b.date || '',
      type: b.type || 'deposit',
      amount: b.amount || 0,
      balance: b.balance !== undefined ? b.balance : null,
      note: b.note || '',
      timestamp: b.timestamp || null
    }));
  }

  if (expGoals && Cache?.goals) {
    exportPayload.data.goals = (Cache.goals || []).map(g => ({
      id: g.id,
      name: g.name,
      target: Number(g.target) || 0,
      saved: Number(g.saved !== undefined ? g.saved : (g.current || 0)),
      current: Number(g.saved !== undefined ? g.saved : (g.current || 0)),
      icon: g.icon || 'target',
      share: Number(g.share) || 100,
      status: g.status || 'В процессе'
    }));
  }

  if (expBills && Cache?.calendarBills) {
    exportPayload.data.calendarBills = (Cache.calendarBills || []).map(b => ({
      id: b.id,
      name: b.name,
      amount: Number(b.amount) || 0,
      day: Number(b.day) || 1,
      category: b.category || 'Счета',
      paid: !!b.paid,
      icon: b.icon || 'receipt'
    }));
  }

  if (expBudget && (Cache?.budgetPlan || Cache?.budget)) {
    const bPlan = Cache?.budgetPlan || Cache?.budget || {};
    exportPayload.data.budget = {
      isConfigured: bPlan.isConfigured !== false,
      monthlyIncome: Number(bPlan.monthlyIncome || bPlan.income || 0),
      monthlyVariableLimit: Number(bPlan.monthlyVariableLimit || bPlan.dailyLimit || 0),
      categoryLimits: bPlan.categoryLimits || bPlan.categories || {}
    };
  }

  if (expRules) {
    try {
      const snap = await getUserCol('CategoryRules').get();
      const docsRules = snap.docs.map(doc => ({
        id: doc.id,
        pattern: doc.data().pattern,
        category: doc.data().category,
        disabled: !!doc.data().disabled
      }));

      if (docsRules.length > 0) {
        exportPayload.data.categoryRules = docsRules;
      } else if (Cache?.categoryRules) {
        exportPayload.data.categoryRules = Cache.categoryRules
          .filter(r => !r.isSystem)
          .map(r => ({
            id: r.id,
            pattern: r.pattern,
            category: r.category,
            disabled: !!r.disabled
          }));
      }
    } catch (e) {
      console.warn('Не удалось выгрузить правила категорий:', e);
    }
  }

  // Создаем файл и инициируем загрузку
  const jsonStr = JSON.stringify(exportPayload, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const filename = `budget_backup_${dateStr}.json`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  if (typeof showToast === 'function') {
    showToast('Файл резервной копии успешно скачан');
  }
}

/**
 * Триггер выбора файла импорта
 */
function triggerBackupFileSelect() {
  const input = document.getElementById('backup-import-file-input');
  if (input) {
    input.value = '';
    input.click();
  }
}

/**
 * Обработка перетаскивания (Drag & Drop)
 */
function handleBackupFileDrop(event) {
  event.preventDefault();
  event.stopPropagation();
  
  const zone = document.getElementById('backup-dropzone');
  if (zone) zone.classList.remove('border-[#6C5DD3]', 'bg-[#6C5DD3]/10');

  if (event.dataTransfer?.files?.length > 0) {
    processSelectedBackupFile(event.dataTransfer.files[0]);
  }
}

function handleBackupDragOver(event) {
  event.preventDefault();
  event.stopPropagation();
  const zone = document.getElementById('backup-dropzone');
  if (zone) zone.classList.add('border-[#6C5DD3]', 'bg-[#6C5DD3]/10');
}

function handleBackupDragLeave(event) {
  event.preventDefault();
  event.stopPropagation();
  const zone = document.getElementById('backup-dropzone');
  if (zone) zone.classList.remove('border-[#6C5DD3]', 'bg-[#6C5DD3]/10');
}

/**
 * Обработка события выбора файла через input
 */
function handleBackupFileSelect(event) {
  const file = event.target.files?.[0];
  if (file) {
    processSelectedBackupFile(file);
  }
}

/**
 * Чтение и парсинг выбранного файла
 */
function processSelectedBackupFile(file) {
  if (!file) return;

  if (!file.name.endsWith('.json') && file.type !== 'application/json') {
    if (typeof showToast === 'function') showToast('Пожалуйста, выберите файл в формате .json', true);
    return;
  }

  currentBackupFileName = file.name;
  currentBackupFileSize = file.size;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const rawText = e.target.result;
      const parsed = JSON.parse(rawText);
      analyzeAndDisplayBackup(parsed);
    } catch (err) {
      if (typeof showToast === 'function') showToast('Не удалось прочитать JSON: поврежденный файл', true);
      console.error(err);
    }
  };
  reader.readAsText(file);
}

/**
 * Анализ содержимого бэкапа и нормализация данных
 */
function analyzeAndDisplayBackup(parsed) {
  let rawSections = {
    transactions: [],
    deposits: [],
    broker: [],
    goals: [],
    calendarBills: [],
    budget: null,
    categoryRules: []
  };

  // Поддерживаем как полный формат { data: {...} }, так и плоский { transactions: [...] } или массив операций
  if (Array.isArray(parsed)) {
    rawSections.transactions = parsed;
  } else if (parsed && typeof parsed === 'object') {
    const src = parsed.data || parsed;
    if (Array.isArray(src.transactions)) rawSections.transactions = src.transactions;
    else if (Array.isArray(src.operations)) rawSections.transactions = src.operations;
    else if (Array.isArray(src.items)) rawSections.transactions = src.items;
    else if (Array.isArray(src.records)) rawSections.transactions = src.records;
    else if (Array.isArray(src['транзакции'])) rawSections.transactions = src['транзакции'];
    else if (Array.isArray(src['операции'])) rawSections.transactions = src['операции'];
    if (Array.isArray(src.deposits || src['вклады'])) rawSections.deposits = src.deposits || src['вклады'];
    if (Array.isArray(src.broker || src['брокер'])) rawSections.broker = src.broker || src['брокер'];
    if (Array.isArray(src.goals || src['цели'])) rawSections.goals = src.goals || src['цели'];
    if (Array.isArray(src.calendarBills || src.bills || src['счета'])) rawSections.calendarBills = src.calendarBills || src.bills || src['счета'];
    if (src.budget || src.budgetPlans || src['бюджет']) rawSections.budget = src.budget || src.budgetPlans || src['бюджет'];
    if (Array.isArray(src.categoryRules || src.rules || src['правила'])) rawSections.categoryRules = src.categoryRules || src.rules || src['правила'];
  }

  const existingTxs = Array.isArray(Cache?.transactions)
    ? Cache.transactions.flatMap(m => m.items || (m.amount !== undefined ? [m] : []))
    : [];
  const existingDeps = Array.isArray(Cache?.deposits) ? Cache.deposits : [];
  const existingBroker = Array.isArray(Cache?.broker?.history)
    ? Cache.broker.history
    : (Array.isArray(Cache?.broker) ? Cache.broker : []);
  const existingGoals = Array.isArray(Cache?.goals) ? Cache.goals : [];
  const existingBills = Array.isArray(Cache?.calendarBills) ? Cache.calendarBills : [];
  const existingRules = Array.isArray(Cache?.categoryRules) ? Cache.categoryRules : (window.DEFAULT_CATEGORY_RULES || []);

  // Анализируем каждую секцию в структурированный список элементов с признаком дубликата и дефолтным чекбоксом
  const processedSections = {
    tx: prepareAnalyzedItems(rawSections.transactions, (item) => isTransactionDuplicate(item, existingTxs), 'Совпадает дата, сумма и категория'),
    dep: prepareAnalyzedItems(rawSections.deposits, (item) => isDepositDuplicate(item, existingDeps), 'Уже есть вклад с таким названием и суммой'),
    broker: prepareAnalyzedItems(rawSections.broker, (item) => isBrokerPointDuplicate(item, existingBroker), 'Совпадает дата, сумма и операция'),
    goals: prepareAnalyzedItems(rawSections.goals, (item) => isGoalDuplicate(item, existingGoals), 'Цель с таким названием и суммой уже существует'),
    bills: prepareAnalyzedItems(rawSections.calendarBills, (item) => isBillDuplicate(item, existingBills), 'Платеж с таким названием, суммой и днем уже есть'),
    rules: prepareAnalyzedItems(rawSections.categoryRules, (item) => isRuleDuplicate(item, existingRules), 'Правило для этого слова/фразы уже есть в словаре'),
    budget: rawSections.budget
  };

  const totalItemsCount = processedSections.tx.length +
    processedSections.dep.length +
    processedSections.broker.length +
    processedSections.goals.length +
    processedSections.bills.length +
    processedSections.rules.length +
    (processedSections.budget ? 1 : 0);

  if (totalItemsCount === 0) {
    if (typeof showToast === 'function') showToast('В файле не найдено поддерживаемых данных для импорта', true);
    return;
  }

  currentParsedBackup = {
    sections: processedSections,
    budget: rawSections.budget
  };

  // Показываем блок предпросмотра импорта
  document.getElementById('backup-import-drop-step')?.classList.add('hidden');
  document.getElementById('backup-import-preview-step')?.classList.remove('hidden');

  // Устанавливаем метаданные файла
  const nameEl = document.getElementById('backup-file-name-display');
  const sizeEl = document.getElementById('backup-file-size-display');
  if (nameEl) nameEl.textContent = currentBackupFileName;
  if (sizeEl) sizeEl.textContent = `${(currentBackupFileSize / 1024).toFixed(1)} КБ`;

  updateImportAnalysis();
}

/**
 * Подготовка списка элементов секции с проверкой дубликатов
 */
function prepareAnalyzedItems(rawList, duplicateChecker, defaultReason) {
  if (!Array.isArray(rawList)) return [];

  return rawList.map((item, idx) => {
    const isDup = duplicateChecker(item);
    return {
      id: item.id || `item_${idx}_${Date.now()}`,
      raw: item,
      isDuplicate: isDup,
      duplicateReason: isDup ? defaultReason : '',
      selected: !isDup // По умолчанию отмечаем только новые
    };
  });
}

/**
 * Обновление элементов интерфейса предпросмотра импорта
 */
function updateImportAnalysis() {
  if (!currentParsedBackup) return;

  const { sections, budget } = currentParsedBackup;

  // Обновляем плашки каждой секции
  setupImportSectionRow('import-row-tx', 'chk-imp-tx', 'import-count-tx', sections.tx, 'операций');
  setupImportSectionRow('import-row-dep', 'chk-imp-dep', 'import-count-dep', sections.dep, 'вкладов');
  setupImportSectionRow('import-row-broker', 'chk-imp-broker', 'import-count-broker', sections.broker, 'записей');
  setupImportSectionRow('import-row-goals', 'chk-imp-goals', 'import-count-goals', sections.goals, 'целей');
  setupImportSectionRow('import-row-bills', 'chk-imp-bills', 'import-count-bills', sections.bills, 'платежей');
  setupImportSectionRow('import-row-rules', 'chk-imp-rules', 'import-count-rules', sections.rules, 'правил');

  // Бюджет
  const budgetRow = document.getElementById('import-row-budget');
  if (budgetRow) {
    if (budget) {
      budgetRow.classList.remove('hidden');
    } else {
      budgetRow.classList.add('hidden');
    }
  }

  // Общая сводка
  updateImportTotalsSummary();
}

/**
 * Настройка строки секции в предпросмотре импорта
 */
function setupImportSectionRow(rowId, chkId, countId, itemsList, unitName) {
  const row = document.getElementById(rowId);
  const chk = document.getElementById(chkId);
  const countEl = document.getElementById(countId);

  if (!row) return;

  if (!itemsList || itemsList.length === 0) {
    row.classList.add('hidden');
    if (chk) chk.checked = false;
  } else {
    row.classList.remove('hidden');
    const selectedCount = itemsList.filter(i => i.selected).length;
    const newCount = itemsList.filter(i => !i.isDuplicate).length;
    const dupCount = itemsList.filter(i => i.isDuplicate).length;

    if (chk) {
      chk.checked = selectedCount > 0;
      chk.indeterminate = (selectedCount > 0 && selectedCount < itemsList.length);
    }

    if (countEl) {
      if (dupCount > 0) {
        countEl.innerHTML = `<span class="text-emerald-400 font-medium">${selectedCount} из ${itemsList.length} выбрано</span> <span class="text-gray-500">(${newCount} новых, ${dupCount} дубл.)</span>`;
      } else {
        countEl.innerHTML = `<span class="text-emerald-400 font-medium">${selectedCount} из ${itemsList.length} выбрано</span> <span class="text-gray-500">(все новые)</span>`;
      }
    }
  }
}

/**
 * Переключение всех элементов секции по клику на главный чекбокс строки
 */
function toggleImportSectionAll(secKey, checked) {
  if (!currentParsedBackup?.sections?.[secKey]) return;

  currentParsedBackup.sections[secKey].forEach(item => {
    item.selected = !!checked;
  });

  updateImportAnalysis();
}

/**
 * Общая сводка импорта
 */
function updateImportTotalsSummary() {
  if (!currentParsedBackup) return;
  const { sections, budget } = currentParsedBackup;

  let totalSelected = 0;
  let totalDuplicatesInBackup = 0;

  ['tx', 'dep', 'broker', 'goals', 'bills', 'rules'].forEach(key => {
    const list = sections[key] || [];
    totalSelected += list.filter(i => i.selected).length;
    totalDuplicatesInBackup += list.filter(i => i.isDuplicate).length;
  });

  if (budget && document.getElementById('chk-imp-budget')?.checked) {
    totalSelected += 1;
  }

  const sumEl = document.getElementById('import-summary-badge');
  if (sumEl) {
    sumEl.innerHTML = `
      <div class="flex items-center gap-2 flex-wrap">
        <div class="flex items-center gap-1.5">
          <i data-lucide="shield-check" class="w-4 h-4 text-emerald-400 flex-shrink-0"></i>
          <span>К добавлению: <strong class="text-emerald-400 font-bold">${totalSelected}</strong> записей</span>
        </div>
        ${totalDuplicatesInBackup > 0 ? `<span class="text-gray-400 text-[11px]">• Обнаружено дубликатов: <strong class="text-amber-400">${totalDuplicatesInBackup}</strong></span>` : ''}
      </div>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons({ root: sumEl });
  }
}

// =========================================================================
// ДЕТАЛЬНЫЙ ПРОСМОТР И ВЫБОР (ИНСПЕКЦИЯ) СЕКЦИИ
// =========================================================================

const SECTION_CONFIGS = {
  tx: {
    title: 'Просмотр операций',
    subtitle: 'Выберите транзакции для импорта в историю',
    icon: 'arrow-left-right',
    iconWrapClass: 'bg-[#6C5DD3]/15 text-[#8C7DFF]'
  },
  dep: {
    title: 'Просмотр вкладов и счетов',
    subtitle: 'Выберите накопительные счета и вклады для добавления',
    icon: 'piggy-bank',
    iconWrapClass: 'bg-emerald-500/15 text-emerald-400'
  },
  broker: {
    title: 'Просмотр операций брокера',
    subtitle: 'Выберите движения средств брокерского портфеля',
    icon: 'trending-up',
    iconWrapClass: 'bg-cyan-500/15 text-cyan-400'
  },
  goals: {
    title: 'Просмотр финансовых целей',
    subtitle: 'Выберите цели для добавления в приложение',
    icon: 'target',
    iconWrapClass: 'bg-amber-500/15 text-amber-400'
  },
  bills: {
    title: 'Просмотр обязательных платежей',
    subtitle: 'Выберите регулярные счета и подписки для календаря',
    icon: 'calendar',
    iconWrapClass: 'bg-rose-500/15 text-rose-400'
  },
  rules: {
    title: 'Просмотр словаря категорий',
    subtitle: 'Выберите ключевые фразы и правила автокатегоризации',
    icon: 'book-open-check',
    iconWrapClass: 'bg-fuchsia-500/15 text-fuchsia-400'
  }
};

/**
 * Открытие модального окна просмотра конкретной секции
 */
function openBackupInspectModal(secKey) {
  if (!currentParsedBackup?.sections?.[secKey]) return;

  currentInspectSection = secKey;
  currentInspectFilter = 'all';

  const cfg = SECTION_CONFIGS[secKey] || SECTION_CONFIGS.tx;
  
  const titleEl = document.getElementById('backup-inspect-title');
  const subtitleEl = document.getElementById('backup-inspect-subtitle');
  const iconWrap = document.getElementById('backup-inspect-icon-wrap');
  const icon = document.getElementById('backup-inspect-icon');

  if (titleEl) titleEl.textContent = cfg.title;
  if (subtitleEl) subtitleEl.textContent = cfg.subtitle;
  if (iconWrap) iconWrap.className = `w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0 ${cfg.iconWrapClass}`;
  if (icon) icon.setAttribute('data-lucide', cfg.icon);

  renderInspectDialogContent();

  const dlg = document.getElementById('backup-inspect-dialog');
  if (dlg) {
    dlg.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons({ root: dlg });
  }
}

/**
 * Закрытие окна инспекции
 */
function closeBackupInspectModal() {
  const dlg = document.getElementById('backup-inspect-dialog');
  if (dlg) dlg.classList.add('hidden');
  currentInspectSection = null;
  updateImportAnalysis();
}

/**
 * Установка фильтра в окне инспекции ('all' | 'new' | 'dup')
 */
function setBackupInspectFilter(filter) {
  currentInspectFilter = filter;
  renderInspectDialogContent();
}

/**
 * Рендеринг списка элементов в окне инспекции
 */
function renderInspectDialogContent() {
  if (!currentInspectSection || !currentParsedBackup?.sections?.[currentInspectSection]) return;

  const items = currentParsedBackup.sections[currentInspectSection];
  const listEl = document.getElementById('backup-inspect-list');
  if (!listEl) return;

  // Обновляем счетчики в табах фильтрации
  const allCount = items.length;
  const newCount = items.filter(i => !i.isDuplicate).length;
  const dupCount = items.filter(i => i.isDuplicate).length;

  const setTabCount = (id, count) => {
    const el = document.getElementById(id);
    if (el) el.textContent = count;
  };
  setTabCount('inspect-count-all', allCount);
  setTabCount('inspect-count-new', newCount);
  setTabCount('inspect-count-dup', dupCount);

  // Стили активных табов
  ['all', 'new', 'dup'].forEach(f => {
    const tabBtn = document.getElementById(`backup-inspect-filter-${f}`);
    if (tabBtn) {
      if (f === currentInspectFilter) {
        tabBtn.className = 'px-2.5 py-1 rounded-lg font-medium transition-colors bg-white/10 text-white cursor-pointer';
      } else {
        tabBtn.className = 'px-2.5 py-1 rounded-lg font-medium transition-colors text-gray-400 hover:text-gray-200 cursor-pointer';
      }
    }
  });

  // Фильтруем элементы для отображения
  const visibleItems = items.filter(item => {
    if (currentInspectFilter === 'new') return !item.isDuplicate;
    if (currentInspectFilter === 'dup') return item.isDuplicate;
    return true;
  });

  if (visibleItems.length === 0) {
    listEl.innerHTML = `
      <div class="py-10 text-center text-gray-400 text-xs flex flex-col items-center justify-center gap-2">
        <i data-lucide="inbox" class="w-8 h-8 text-gray-600"></i>
        <span>В этой категории нет записей по выбранному фильтру</span>
      </div>
    `;
    updateInspectToggleAllButton(visibleItems);
    updateInspectSelectedSummary();
    if (typeof lucide !== 'undefined') lucide.createIcons({ root: listEl });
    return;
  }

  // Рендерим элементы
  listEl.innerHTML = visibleItems.map((item, vIdx) => {
    const actualIndex = items.indexOf(item);
    return renderInspectItemRow(currentInspectSection, item, actualIndex);
  }).join('');

  updateInspectToggleAllButton(visibleItems);
  updateInspectSelectedSummary();

  const dlg = document.getElementById('backup-inspect-dialog');
  if (dlg && typeof lucide !== 'undefined') {
    lucide.createIcons({ root: dlg });
  }
}

/**
 * Форматирование даты для окна инспекции бэкапа
 */
function formatInspectDate(dateVal) {
  if (!dateVal) return '—';
  try {
    let d;
    if (typeof parseAnyDate === 'function') {
      d = parseAnyDate(dateVal);
    } else {
      d = new Date(dateVal);
    }
    if (!d || isNaN(d.getTime())) return String(dateVal);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (e) {
    return String(dateVal);
  }
}

/**
 * Рендеринг отдельной строки элемента в окне инспекции
 */
function renderInspectItemRow(secKey, item, actualIndex) {
  const isChecked = item.selected ? 'checked' : '';
  const raw = item.raw || {};

  // Бейдж статуса записи (Новая vs Дубликат)
  const statusBadge = item.isDuplicate
    ? `<span class="text-[10px] font-medium text-amber-400 bg-amber-500/15 border border-amber-500/20 px-2 py-0.5 rounded-md flex-shrink-0 flex items-center gap-1" title="${escapeHtml(item.duplicateReason || 'Дубликат')}">
         <i data-lucide="copy" class="w-3 h-3"></i>
         <span>Дубликат</span>
       </span>`
    : `<span class="text-[10px] font-medium text-emerald-400 bg-emerald-500/15 border border-emerald-500/20 px-2 py-0.5 rounded-md flex-shrink-0 flex items-center gap-1">
         <i data-lucide="plus" class="w-3 h-3"></i>
         <span>Новая</span>
       </span>`;

  // Генерация контента карточки в аккуратной 2-строчной сетке
  let topRowLeft = '';
  let topRowRight = '';
  let bottomRowLeft = '';

  switch (secKey) {
    case 'tx': {
      const rawType = String(raw.type || '').trim().toLowerCase();
      const isIncome = rawType === 'income' || rawType === 'доход' || (Number(raw.amount) > 0 && raw.isIncome);
      const amountFormatted = Math.abs(Number(raw.amount || 0)).toLocaleString('ru-RU');
      const sign = isIncome ? '+' : '−';
      const amountColor = isIncome ? 'text-emerald-400' : 'text-gray-100';
      const dateStr = formatInspectDate(raw.date || raw.rawDate);
      const comment = (typeof getTxComment === 'function')
        ? getTxComment(raw)
        : (raw.comment || raw.description || raw.merchant || raw.title || raw.name || raw.note || raw.notes || raw.payee || raw.details || '');
      const title = comment || raw.category || 'Операция';

      topRowLeft = `<span class="text-xs font-semibold text-white break-words">${escapeHtml(title)}</span>`;
      topRowRight = `<span class="text-xs font-bold ${amountColor}">${sign} ${amountFormatted} ₽</span>`;
      bottomRowLeft = `<span class="text-[11px] text-gray-400 truncate">${dateStr}${raw.category ? ` • ${escapeHtml(raw.category)}` : ''}</span>`;
      break;
    }

    case 'dep': {
      const amountVal = Number(raw.amount !== undefined ? raw.amount : (raw.initialAmount || raw.currentAmount || 0));
      const amount = amountVal.toLocaleString('ru-RU');
      const rateVal = raw.rate !== undefined ? raw.rate : (raw.percent || 0);
      const percent = rateVal ? `${rateVal}%` : '';

      topRowLeft = `<span class="text-xs font-semibold text-white break-words">${escapeHtml(raw.name || 'Вклад')}</span>`;
      topRowRight = `<span class="text-xs font-bold text-emerald-400">${amount} ₽</span>`;
      bottomRowLeft = `<span class="text-[11px] text-gray-400 truncate">${escapeHtml(raw.bank || 'Накопительный счет')}${percent ? ` • ставка ${percent}` : ''}</span>`;
      break;
    }

    case 'broker': {
      const isDeposit = raw.type === 'deposit' || raw.type === 'Пополнение';
      const typeLabel = isDeposit ? 'Пополнение' : 'Вывод средств';
      const typeColor = isDeposit ? 'text-emerald-400' : 'text-rose-400';
      const amount = Number(raw.amount || 0).toLocaleString('ru-RU');
      const dateStr = formatInspectDate(raw.date || raw.rawDate);

      topRowLeft = `<span class="text-xs font-semibold ${typeColor} break-words">${typeLabel}</span>`;
      topRowRight = `<span class="text-xs font-bold text-white">${amount} ₽</span>`;
      bottomRowLeft = `<span class="text-[11px] text-gray-400 truncate">${dateStr}${raw.note ? ` • ${escapeHtml(raw.note)}` : ''}</span>`;
      break;
    }

    case 'goals': {
      const target = Number(raw.target || 0).toLocaleString('ru-RU');
      const current = Number(raw.saved !== undefined ? raw.saved : (raw.current || 0)).toLocaleString('ru-RU');

      topRowLeft = `<span class="text-xs font-semibold text-white break-words">${escapeHtml(raw.name || 'Цель')}</span>`;
      topRowRight = `<span class="text-xs font-bold text-amber-400">${target} ₽</span>`;
      bottomRowLeft = `<span class="text-[11px] text-gray-400 truncate">Накоплено: ${current} ₽</span>`;
      break;
    }

    case 'bills': {
      const amount = Number(raw.amount || 0).toLocaleString('ru-RU');
      let scheduleText = '';
      if (raw.day) {
        scheduleText = `Каждый месяц, ${raw.day}-го числа`;
      } else if (raw.dueDate || raw.date) {
        scheduleText = `Срок: ${formatInspectDate(raw.dueDate || raw.date)}`;
      } else {
        scheduleText = 'Регулярный счет';
      }

      topRowLeft = `<span class="text-xs font-semibold text-white break-words">${escapeHtml(raw.name || 'Платеж')}</span>`;
      topRowRight = `<span class="text-xs font-bold text-rose-400">${amount} ₽</span>`;
      bottomRowLeft = `<span class="text-[11px] text-gray-400 truncate">${scheduleText}${raw.category ? ` • ${escapeHtml(raw.category)}` : ''}</span>`;
      break;
    }

    case 'rules': {
      topRowLeft = `<span class="text-xs font-semibold text-gray-200 break-words">«${escapeHtml(raw.pattern || '')}»</span>`;
      topRowRight = `<span class="text-[11px] font-medium text-[#8C7DFF] bg-[#6C5DD3]/15 border border-[#6C5DD3]/25 px-2 py-0.5 rounded-lg flex-shrink-0">${escapeHtml(raw.category || 'Категория')}</span>`;
      bottomRowLeft = `<span class="text-[11px] text-[#848D99]">Правило автокатегоризации</span>`;
      break;
    }

    default:
      topRowLeft = `<span class="text-xs text-white">${JSON.stringify(raw).slice(0, 40)}</span>`;
      topRowRight = '';
      bottomRowLeft = '';
  }

  return `
    <div class="flex items-center gap-3 p-3 rounded-2xl bg-[#12151C] border ${item.selected ? 'border-[#6C5DD3]/30 bg-[#6C5DD3]/[0.04]' : 'border-[rgba(255,255,255,0.05)]'} hover:border-white/10 transition-colors">
      <input type="checkbox" 
             ${isChecked} 
             onchange="onInspectItemCheckboxChange(${actualIndex}, this.checked)" 
             class="w-4 h-4 rounded border-gray-600 accent-[#6C5DD3] bg-[#212430] cursor-pointer flex-shrink-0">
      <div class="flex-1 min-w-0 flex flex-col gap-1 cursor-pointer" onclick="toggleInspectItemByRowClick(${actualIndex})">
        <div class="flex items-center justify-between gap-2 min-w-0">
          <div class="min-w-0 flex-1 pr-1">${topRowLeft}</div>
          <div class="text-right flex-shrink-0">${topRowRight}</div>
        </div>
        <div class="flex items-center justify-between gap-2 min-w-0">
          <div class="min-w-0 flex-1 pr-1">${bottomRowLeft}</div>
          <div class="text-right flex-shrink-0">${statusBadge}</div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Обработчик переключения чекбокса конкретного элемента
 */
function onInspectItemCheckboxChange(index, isChecked) {
  if (!currentInspectSection || !currentParsedBackup?.sections?.[currentInspectSection]) return;

  currentParsedBackup.sections[currentInspectSection][index].selected = isChecked;

  const items = currentParsedBackup.sections[currentInspectSection];
  const visibleItems = items.filter(item => {
    if (currentInspectFilter === 'new') return !item.isDuplicate;
    if (currentInspectFilter === 'dup') return item.isDuplicate;
    return true;
  });

  updateInspectToggleAllButton(visibleItems);
  updateInspectSelectedSummary();
  updateImportTotalsSummary();
}

/**
 * Клик по телу карточки переключает ее чекбокс
 */
function toggleInspectItemByRowClick(index) {
  if (!currentInspectSection || !currentParsedBackup?.sections?.[currentInspectSection]) return;

  const item = currentParsedBackup.sections[currentInspectSection][index];
  item.selected = !item.selected;
  renderInspectDialogContent();
  updateImportTotalsSummary();
}

/**
 * Умная кнопка Выбрать все / Снять в окне инспекции
 */
function toggleBackupInspectAll() {
  if (!currentInspectSection || !currentParsedBackup?.sections?.[currentInspectSection]) return;

  const items = currentParsedBackup.sections[currentInspectSection];
  const visibleItems = items.filter(item => {
    if (currentInspectFilter === 'new') return !item.isDuplicate;
    if (currentInspectFilter === 'dup') return item.isDuplicate;
    return true;
  });

  if (visibleItems.length === 0) return;

  const allSelected = visibleItems.every(i => i.selected);
  const targetState = !allSelected;

  visibleItems.forEach(i => {
    i.selected = targetState;
  });

  renderInspectDialogContent();
  updateImportTotalsSummary();
}

/**
 * Обновление текста кнопки Выбрать все / Снять в окне инспекции
 */
function updateInspectToggleAllButton(visibleItems) {
  const label = document.getElementById('backup-inspect-toggle-all-label');
  const icon = document.getElementById('backup-inspect-toggle-all-icon');
  const btn = document.getElementById('backup-inspect-toggle-all-btn');

  if (!label || visibleItems.length === 0) return;

  const allSelected = visibleItems.every(i => i.selected);
  if (allSelected) {
    label.innerText = 'Снять';
    if (icon) {
      icon.setAttribute('data-lucide', 'square');
      icon.className = 'w-3.5 h-3.5 text-gray-400 flex-shrink-0';
    }
  } else {
    label.innerText = 'Все';
    if (icon) {
      icon.setAttribute('data-lucide', 'check-check');
      icon.className = 'w-3.5 h-3.5 text-[#727cff] flex-shrink-0';
    }
  }

  if (btn && typeof lucide !== 'undefined') {
    lucide.createIcons({ root: btn });
  }
}

/**
 * Обновление плашки "Выбрано для импорта: X из Y" внизу окна инспекции
 */
function updateInspectSelectedSummary() {
  if (!currentInspectSection || !currentParsedBackup?.sections?.[currentInspectSection]) return;

  const items = currentParsedBackup.sections[currentInspectSection];
  const selectedCount = items.filter(i => i.selected).length;

  const el = document.getElementById('backup-inspect-selected-summary');
  if (el) {
    el.textContent = `${selectedCount} из ${items.length}`;
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// =========================================================================
// ДЕДУПЛИКАЦИЯ
// =========================================================================

function isTransactionDuplicate(tx, existingList) {
  if (!tx || !Array.isArray(existingList) || existingList.length === 0) return false;
  const txDate = String(tx.date || tx.rawDate || '').slice(0, 10);
  const txAmount = Math.round(Math.abs(Number(tx.amount || 0)) * 100) / 100;
  const txCat = String(tx.category || '').trim().toLowerCase();
  const txDesc = ((typeof getTxComment === 'function') ? getTxComment(tx) : String(tx.description || tx.comment || '')).trim().toLowerCase();
  const rawTxType = String(tx.type || '').trim().toLowerCase();
  const txType = (rawTxType === 'income' || rawTxType === 'доход') ? 'доход' : 'расход';

  return existingList.some(ex => {
    if (!ex) return false;
    if (tx.id && ex.id && tx.id === ex.id) return true;
    const exDate = String(ex.date || ex.rawDate || '').slice(0, 10);
    const exAmount = Math.round(Math.abs(Number(ex.amount || 0)) * 100) / 100;
    const exCat = String(ex.category || '').trim().toLowerCase();
    const exDesc = ((typeof getTxComment === 'function') ? getTxComment(ex) : String(ex.description || ex.comment || '')).trim().toLowerCase();
    const rawExType = String(ex.type || '').trim().toLowerCase();
    const exType = (rawExType === 'income' || rawExType === 'доход') ? 'доход' : 'расход';

    return exDate === txDate &&
      Math.abs(exAmount - txAmount) < 0.01 &&
      exCat === txCat &&
      (!txDesc || !exDesc || txDesc === exDesc) &&
      exType === txType;
  });
}

function isDepositDuplicate(dep, existingList) {
  if (!dep || !Array.isArray(existingList) || existingList.length === 0) return false;
  const name = String(dep.name || '').trim().toLowerCase();
  const bank = String(dep.bank || '').trim().toLowerCase();
  const amount = Math.round(Number(dep.amount !== undefined ? dep.amount : (dep.initialAmount || dep.currentAmount || 0)) * 100) / 100;
  const startDate = String(dep.startDate || dep.rawStart || '').slice(0, 10);

  return existingList.some(ex => {
    if (!ex) return false;
    if (dep.id && ex.id && dep.id === ex.id) return true;
    const exName = String(ex.name || '').trim().toLowerCase();
    const exBank = String(ex.bank || '').trim().toLowerCase();
    const exAmount = Math.round(Number(ex.amount !== undefined ? ex.amount : (ex.initialAmount || ex.currentAmount || 0)) * 100) / 100;
    const exStartDate = String(ex.startDate || ex.rawStart || '').slice(0, 10);

    return exName === name &&
      Math.abs(exAmount - amount) < 0.01 &&
      (!bank || !exBank || exBank === bank) &&
      (!startDate || !exStartDate || exStartDate === startDate);
  });
}

function isBrokerPointDuplicate(bp, existingList) {
  if (!bp || !Array.isArray(existingList) || existingList.length === 0) return false;
  const date = String(bp.date || '').slice(0, 10);
  const type = String(bp.type || '').trim().toLowerCase();
  const amount = Math.round(Number(bp.amount || 0) * 100) / 100;
  const balance = bp.balance !== null && bp.balance !== undefined ? Math.round(Number(bp.balance) * 100) / 100 : null;

  return existingList.some(ex => {
    if (!ex) return false;
    if (bp.id && ex.id && bp.id === ex.id) return true;
    const exDate = String(ex.date || '').slice(0, 10);
    const exType = String(ex.type || '').trim().toLowerCase();
    const exAmount = Math.round(Number(ex.amount || 0) * 100) / 100;
    const exBalance = ex.balance !== null && ex.balance !== undefined ? Math.round(Number(ex.balance) * 100) / 100 : null;

    const dateMatch = exDate === date;
    const typeMatch = exType === type;
    const amountMatch = Math.abs(exAmount - amount) < 0.01;
    const balanceMatch = (balance === null && exBalance === null) || (balance !== null && exBalance !== null && Math.abs(exBalance - balance) < 0.01);

    return dateMatch && typeMatch && amountMatch && balanceMatch;
  });
}

function isGoalDuplicate(goal, existingList) {
  if (!goal || !Array.isArray(existingList) || existingList.length === 0) return false;
  const name = String(goal.name || '').trim().toLowerCase();
  const target = Math.round(Number(goal.target || 0) * 100) / 100;

  return existingList.some(ex => {
    if (!ex) return false;
    if (goal.id && ex.id && goal.id === ex.id) return true;
    const exName = String(ex.name || '').trim().toLowerCase();
    const exTarget = Math.round(Number(ex.target || 0) * 100) / 100;
    return exName === name && Math.abs(exTarget - target) < 0.01;
  });
}

function isBillDuplicate(bill, existingList) {
  if (!bill || !Array.isArray(existingList) || existingList.length === 0) return false;
  const name = String(bill.name || '').trim().toLowerCase();
  const amount = Math.round(Number(bill.amount || 0) * 100) / 100;
  const day = Number(bill.day || 0);

  return existingList.some(ex => {
    if (!ex) return false;
    if (bill.id && ex.id && bill.id === ex.id) return true;
    const exName = String(ex.name || '').trim().toLowerCase();
    const exAmount = Math.round(Number(ex.amount || 0) * 100) / 100;
    const exDay = Number(ex.day || 0);
    return exName === name && Math.abs(exAmount - amount) < 0.01 && exDay === day;
  });
}

function isRuleDuplicate(rule, existingRules) {
  if (!rule || !Array.isArray(existingRules) || existingRules.length === 0) return false;
  const norm = (str) => typeof StatementCategorizer !== 'undefined' ? StatementCategorizer.normalize(str) : String(str || '').toLowerCase().trim();
  const pat = norm(rule.pattern);
  return (existingRules || []).some(ex => ex && norm(ex.pattern) === pat);
}

// =========================================================================
// ИСПОЛНЕНИЕ ИМПОРТА ВЫБРАННЫХ ДАННЫХ
// =========================================================================

async function executeBackupImport() {
  if (!currentParsedBackup) return;

  const { sections, budget } = currentParsedBackup;

  const impBudget = document.getElementById('chk-imp-budget')?.checked;

  const selectedTx = sections.tx.filter(i => i.selected).map(i => i.raw);
  const selectedDep = sections.dep.filter(i => i.selected).map(i => i.raw);
  const selectedBroker = sections.broker.filter(i => i.selected).map(i => i.raw);
  const selectedGoals = sections.goals.filter(i => i.selected).map(i => i.raw);
  const selectedBills = sections.bills.filter(i => i.selected).map(i => i.raw);
  const selectedRules = sections.rules.filter(i => i.selected).map(i => i.raw);

  const totalToImport = selectedTx.length + selectedDep.length + selectedBroker.length +
    selectedGoals.length + selectedBills.length + selectedRules.length + (impBudget && budget ? 1 : 0);

  if (totalToImport === 0) {
    if (typeof showToast === 'function') showToast('Не выбрано ни одной записи для импорта', true);
    return;
  }

  const btn = document.getElementById('btn-execute-backup-import');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader" class="w-4 h-4 animate-spin"></i><span>Импортируем данные...</span>';
    if (typeof lucide !== 'undefined') lucide.createIcons({ root: btn });
  }

  try {
    let importedStats = { added: 0, skipped: 0 };

    // Считаем пропущенные
    ['tx', 'dep', 'broker', 'goals', 'bills', 'rules'].forEach(key => {
      importedStats.skipped += sections[key].filter(i => !i.selected).length;
    });

    // 1. Транзакции
    if (selectedTx.length > 0) {
      const txCol = getUserCol('Transactions');
      for (let i = 0; i < selectedTx.length; i += 400) {
        const chunk = selectedTx.slice(i, i + 400);
        const batch = db.batch();
        chunk.forEach(tx => {
          const docRef = (tx.id && typeof tx.id === 'string' && tx.id.length > 5) ? txCol.doc(tx.id) : txCol.doc();
          const commentVal = (typeof getTxComment === 'function')
            ? getTxComment(tx)
            : String(tx.comment || tx.description || tx.merchant || tx.title || tx.name || tx.note || tx.notes || tx.payee || tx.details || '').trim();
          const rawType = String(tx.type || '').trim().toLowerCase();
          const isIncome = rawType === 'income' || rawType === 'доход';
          const typeVal = isIncome ? 'Доход' : 'Расход';

          batch.set(docRef, {
            amount: Math.abs(Number(tx.amount)) || 0,
            category: tx.category || 'Прочее',
            date: String(tx.date || tx.rawDate || new Date().toISOString().slice(0, 10)).slice(0, 10),
            comment: commentVal,
            description: commentVal,
            merchant: commentVal,
            title: commentVal,
            note: commentVal,
            type: typeVal,
            excludeFromBudget: !!(tx.excludeFromBudget || tx.isExcludedFromBudget),
            spreadMonths: parseInt(tx.spreadMonths, 10) || 1,
            isBillPayment: !!tx.isBillPayment,
            billId: tx.billId || null,
            billName: tx.billName || '',
            goalId: tx.goalId || null,
            goalName: tx.goalName || null,
            createdAt: tx.createdAt || firebase.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        });
        await batch.commit();
      }
      importedStats.added += selectedTx.length;
    }

    // 2. Вклады
    if (selectedDep.length > 0) {
      const depCol = getUserCol('Deposits');
      const batch = db.batch();
      selectedDep.forEach(dep => {
        const docRef = depCol.doc();
        const amount = Number(dep.amount !== undefined ? dep.amount : (dep.initialAmount !== undefined ? dep.initialAmount : (dep.currentAmount || 0))) || 0;
        const rate = Number(dep.rate !== undefined ? dep.rate : (dep.percent !== undefined ? dep.percent : (dep.interestRate || 0))) || 0;
        
        let startDate = dep.startDate || dep.rawStart || new Date().toISOString().slice(0, 10);
        let endDate = dep.endDate || dep.rawEnd || '';
        
        if (!endDate && dep.months) {
          const s = new Date(startDate);
          s.setMonth(s.getMonth() + Number(dep.months));
          endDate = s.toISOString().slice(0, 10);
        }

        const isClosed = dep.status === 'Закрыт' || dep.isClosed === true;

        batch.set(docRef, {
          name: dep.name || 'Вклад',
          amount: amount,
          rate: rate,
          startDate: startDate,
          endDate: endDate,
          status: isClosed ? 'Закрыт' : (dep.status || 'Активен'),
          goalId: dep.goalId || '',
          bank: dep.bank || '',
          isInterestCredited: !!dep.isInterestCredited,
          // Сохраняем и алиасы
          initialAmount: amount,
          currentAmount: amount,
          percent: rate,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      });
      await batch.commit();
      importedStats.added += selectedDep.length;
    }

    // 3. Брокер
    if (selectedBroker.length > 0) {
      const brokerCol = getUserCol('Broker');
      const batch = db.batch();
      selectedBroker.forEach(bp => {
        const docRef = brokerCol.doc();
        batch.set(docRef, {
          date: bp.date || new Date().toISOString().slice(0, 10),
          type: bp.type || 'deposit',
          amount: Number(bp.amount) || 0,
          balance: bp.balance !== null && bp.balance !== undefined ? Number(bp.balance) : null,
          note: bp.note || '',
          timestamp: bp.timestamp || Date.now()
        });
      });
      await batch.commit();
      importedStats.added += selectedBroker.length;
    }

    // 4. Цели
    if (selectedGoals.length > 0) {
      const goalsCol = getUserCol('Goals');
      const batch = db.batch();
      selectedGoals.forEach(g => {
        const docRef = goalsCol.doc();
        batch.set(docRef, {
          name: g.name || 'Цель',
          target: Number(g.target) || 0,
          saved: Number(g.saved !== undefined ? g.saved : (g.current || 0)) || 0,
          icon: g.icon || 'target',
          share: Number(g.share) || 100,
          status: g.status || 'В процессе',
          createdAt: g.createdAt || Date.now(),
          updatedAt: Date.now()
        });
      });
      await batch.commit();
      importedStats.added += selectedGoals.length;
    }

    // 5. Счета календаря
    if (selectedBills.length > 0) {
      const billsCol = getUserCol('CalendarBills');
      const batch = db.batch();
      selectedBills.forEach(b => {
        const docRef = billsCol.doc();
        batch.set(docRef, {
          name: b.name || 'Платеж',
          amount: Number(b.amount) || 0,
          day: Number(b.day) || 1,
          category: b.category || 'Счета',
          paid: !!b.paid,
          icon: b.icon || 'receipt',
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      });
      await batch.commit();
      importedStats.added += selectedBills.length;
    }

    // 6. Бюджет
    if (impBudget && budget) {
      const budgetCol = getUserCol('BudgetPlan');
      const mIncome = Number(budget.monthlyIncome || budget.income || 0);
      const mLimit = Number(budget.monthlyVariableLimit || budget.dailyLimit || 0);
      const cLimits = budget.categoryLimits || budget.categories || {};
      await budgetCol.doc('plan').set({
        isConfigured: budget.isConfigured !== false,
        monthlyIncome: mIncome,
        monthlyVariableLimit: mLimit,
        categoryLimits: cLimits,
        updatedAt: Date.now()
      }, { merge: true });
      importedStats.added += 1;
    }

    // 7. Словарь правил категорий
    if (selectedRules.length > 0) {
      const rulesCol = getUserCol('CategoryRules');
      const batch = db.batch();
      selectedRules.forEach(r => {
        const docRef = rulesCol.doc();
        batch.set(docRef, {
          pattern: r.pattern,
          category: r.category,
          disabled: !!r.disabled,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      });
      await batch.commit();
      importedStats.added += selectedRules.length;
    }

    // Обновляем данные приложения
    await fetchAllData();

    closeDataBackupModal();

    if (typeof showToast === 'function') {
      showToast(`Импорт завершен! Добавлено: ${importedStats.added} записей, пропущено: ${importedStats.skipped}`);
    }
  } catch (err) {
    console.error('Ошибка импорта бэкапа:', err);
    if (typeof showToast === 'function') {
      showToast('Ошибка при импорте данных: ' + err.message, true);
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="upload" class="w-4 h-4"></i><span>Импортировать выбранное</span>';
      if (typeof lucide !== 'undefined') lucide.createIcons({ root: btn });
    }
  }
}

/**
 * Сброс состояния импорта
 */
function resetImportState() {
  currentParsedBackup = null;
  currentBackupFileName = '';
  currentBackupFileSize = 0;
  currentInspectSection = null;

  const input = document.getElementById('backup-import-file-input');
  if (input) input.value = '';

  document.getElementById('backup-import-drop-step')?.classList.remove('hidden');
  document.getElementById('backup-import-preview-step')?.classList.add('hidden');
}

// ==========================================
// Global Scope Exports
// ==========================================
window.openDataBackupModal = openDataBackupModal;
window.closeDataBackupModal = closeDataBackupModal;
window.switchBackupTab = switchBackupTab;
window.toggleSmartBackupExportAll = toggleSmartBackupExportAll;
window.onBackupExportCheckboxChange = onBackupExportCheckboxChange;
window.toggleAllExportCheckboxes = toggleAllExportCheckboxes;
window.downloadBackupJson = downloadBackupJson;
window.triggerBackupFileSelect = triggerBackupFileSelect;
window.handleBackupFileDrop = handleBackupFileDrop;
window.handleBackupDragOver = handleBackupDragOver;
window.handleBackupDragLeave = handleBackupDragLeave;
window.handleBackupFileSelect = handleBackupFileSelect;
window.toggleImportSectionAll = toggleImportSectionAll;
window.openBackupInspectModal = openBackupInspectModal;
window.closeBackupInspectModal = closeBackupInspectModal;
window.setBackupInspectFilter = setBackupInspectFilter;
window.onInspectItemCheckboxChange = onInspectItemCheckboxChange;
window.toggleInspectItemByRowClick = toggleInspectItemByRowClick;
window.toggleBackupInspectAll = toggleBackupInspectAll;
window.executeBackupImport = executeBackupImport;
window.resetImportState = resetImportState;
