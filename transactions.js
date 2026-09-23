// ==========================================
// Variables & State
// ==========================================
let monthlyChartObj = null;
let categoryChartObj = null;
let currentAnalyticsMonthIndex = 0;
let currentStructureType = 'Расход'; // 'Расход' или 'Доход'

// Фильтры списка транзакций
let currentFilterMonth = 'all';
let currentFilterCategory = 'all';

// Состояние модалок категорий
let currentCategoryType = 'Расход';
let currentCategorySelect = null;
let selectedCategoryIcon = 'package';

const DEFAULT_SYSTEM_CATEGORIES = [
  'Продукты', 'Кафе и рестораны', 'Маркетплейсы', 'Транспорт', 'Жилье',
  'Одежда', 'Здоровье', 'Развлечения', 'Другое', 'Зарплата', 'Возврат', 'Кэшбек'
];

const availableIcons = [
  'shopping-cart', 'utensils', 'car', 'home', 'film', 'package', 'briefcase', 'baby', 'paw-print', 'pill',
  'shopping-bag', 'plane', 'dumbbell', 'gamepad-2', 'book', 'music', 'gift', 'coffee', 'pizza', 'shirt',
  'lightbulb', 'wrench', 'smartphone', 'laptop', 'monitor', 'camera', 'palette', 'headphones', 'target', 'trophy',
  'bus', 'train', 'navigation', 'zap', 'bath', 'sparkles', 'archive', 'leaf', 'globe', 'credit-card'
];

// ==========================================
// 1. Data Processing
// ==========================================
function processTransactions(txs) {
  const grouped = {};
  const months = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  (txs || []).forEach(tx => {
    const rawDateVal = tx.date || tx.rawDate || tx.formattedDate;
    let txDate = null;
    if (rawDateVal) {
      txDate = (typeof parseAnyDate === 'function') ? parseAnyDate(rawDateVal) : new Date(rawDateVal);
    }
    if (!txDate || isNaN(txDate.getTime())) {
      txDate = (tx.timestamp && !isNaN(new Date(tx.timestamp).getTime())) ? new Date(tx.timestamp) : new Date();
    }
    const key = (typeof formatDateStr === 'function') ? formatDateStr(txDate, 'yyyy-MM') : `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}`;
    if (!grouped[key]) {
      grouped[key] = {
        id: key,
        label: months[txDate.getMonth()] + ' ' + txDate.getFullYear(),
        income: 0,
        expense: 0,
        items: []
      };
    }
    const amount = typeof parseAmount === 'function' ? parseAmount(tx.amount) : (parseFloat(String(tx.amount || 0).replace(/\s/g, '').replace(/,/g, '.')) || 0);
    const isExpense = tx.type === 'Расход' || String(tx.type || '').trim().toLowerCase() === 'расход';
    const isIncome = tx.type === 'Доход' || String(tx.type || '').trim().toLowerCase() === 'доход';
    if (isExpense) grouped[key].expense += amount;
    else if (isIncome) grouped[key].income += amount;

    const isoDateStr = (typeof formatDateStr === 'function') ? formatDateStr(txDate, 'yyyy-MM-dd') : (tx.date || tx.rawDate);
    const ruDateStr = (typeof formatDateStr === 'function') ? formatDateStr(txDate, 'dd.MM.yyyy') : (tx.formattedDate || isoDateStr);

    grouped[key].items.push({
      ...tx,
      id: tx.id,
      type: isIncome ? 'Доход' : 'Расход',
      category: tx.category,
      amount,
      comment: tx.comment || '',
      excludeFromBudget: !!(tx.excludeFromBudget || tx.isExcludedFromBudget),
      isBillPayment: !!tx.isBillPayment,
      billId: tx.billId || null,
      billName: tx.billName || '',
      billType: tx.billType || (tx.spreadMonths > 1 ? 'onetime' : (tx.isBillPayment ? 'recurring' : '')),
      spreadMonths: parseInt(tx.spreadMonths, 10) || 1,
      date: tx.date || isoDateStr,
      rawDate: tx.rawDate || tx.date || isoDateStr,
      formattedDate: ruDateStr,
      timestamp: tx.timestamp || txDate.getTime()
    });
  });
  return Object.values(grouped)
    .sort((a, b) => b.id.localeCompare(a.id))
    .map(m => {
      m.items.sort((a, b) => b.timestamp - a.timestamp);
      return m;
    });
}

function processCategories(cats) {
  const defaultExpense = [
    { name: 'Продукты', icon: 'shopping-cart' },
    { name: 'Кафе и рестораны', icon: 'utensils' },
    { name: 'Маркетплейсы', icon: 'shopping-bag' },
    { name: 'Транспорт', icon: 'car' },
    { name: 'Жилье', icon: 'home' },
    { name: 'Одежда', icon: 'shirt' },
    { name: 'Здоровье', icon: 'heart-pulse' },
    { name: 'Развлечения', icon: 'gamepad-2' },
    { name: 'Другое', icon: 'package' }
  ];
  const defaultIncome = [
    { name: 'Зарплата', icon: 'wallet' },
    { name: 'Возврат', icon: 'undo-2' },
    { name: 'Кэшбек', icon: 'coins' },
    { name: 'Другое', icon: 'package' }
  ];

  const expense = [...defaultExpense];
  const income = [...defaultIncome];
  cats.forEach(c => {
    let rawIcon = c.icon && c.icon.length < 5 ? 'tag' : c.icon;
    if (c.type === 'Расход') { 
      if (!expense.some(item => item.name === c.name)) expense.push({ name: c.name, icon: rawIcon || 'tag' }); 
    } else if (c.type === 'Доход') { 
      if (!income.some(item => item.name === c.name)) income.push({ name: c.name, icon: rawIcon || 'tag' }); 
    }
  });
  return { expense, income };
}

// ==========================================
// 2. Category Management UI
// ==========================================
function showAddCategoryDialog(type, selectEl) {
  currentCategoryType = type;
  currentCategorySelect = selectEl;
  selectedCategoryIcon = 'package';
  const title = document.getElementById('category-dialog-title');
  if (title) title.innerText = `Новая категория (${type})`;
  const inp = document.getElementById('category-name-input');
  if (inp) inp.value = '';
  renderIconGrid();
  const dlg = document.getElementById('category-dialog');
  if (dlg) dlg.classList.remove('hidden');
}

function renderIconGrid() {
  const grid = document.getElementById('category-icon-grid');
  if (!grid) return;
  
  grid.innerHTML = availableIcons.map(icon => `
    <button type="button" class="icon-option flex items-center justify-center h-[42px] rounded-xl transition-all border ${icon === selectedCategoryIcon ? 'bg-[#6C5DD3]/15 text-[#6C5DD3] border-[#6C5DD3]/30 scale-105 shadow-sm' : 'bg-[#181B24] border-[rgba(255,255,255,0.06)] text-[#848D99] hover:bg-[#212430]'}" data-icon="${icon}">
      <i data-lucide="${icon}" class="w-5 h-5"></i>
    </button>
  `).join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();

  grid.querySelectorAll('.icon-option').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedCategoryIcon = btn.dataset.icon;
      grid.querySelectorAll('.icon-option').forEach(b => {
         b.classList.remove('bg-[#6C5DD3]/15', 'text-[#6C5DD3]', 'border-[#6C5DD3]/30', 'scale-105', 'shadow-sm');
         b.classList.add('bg-[#181B24]', 'border-[rgba(255,255,255,0.06)]', 'text-[#848D99]');
      });
      btn.classList.remove('bg-[#181B24]', 'border-[rgba(255,255,255,0.06)]', 'text-[#848D99]');
      btn.classList.add('bg-[#6C5DD3]/15', 'text-[#6C5DD3]', 'border-[#6C5DD3]/30', 'scale-105', 'shadow-sm');
    });
  });
}

function showManageCategoriesDialog() {
  renderManageCategories();
  const dlg = document.getElementById('manage-categories-dialog');
  if (dlg) dlg.classList.remove('hidden');
}

function renderManageCategories() {
  const container = document.getElementById('categories-list-container');
  if (!container || !Cache?.categories) return;

  let html = `<p class="text-[11px] uppercase tracking-wider text-gray-500 font-bold mb-2">Расходы</p>`;
  Cache.categories.expense.forEach(cat => {
    const isDefault = DEFAULT_SYSTEM_CATEGORIES.includes(cat.name);
    const iconName = cat.icon && cat.icon !== '📦' ? cat.icon : 'tag';
    html += `
      <div class="flex justify-between items-center py-2.5 border-b border-[rgba(255,255,255,0.06)]">
        <span class="flex items-center gap-2.5 text-sm font-medium text-gray-200">
          <i data-lucide="${iconName}" class="w-4 h-4 text-[#848D99]"></i>
          ${escapeHtml(cat.name)}
        </span>
        ${!isDefault ? `<button type="button" class="text-gray-500 hover:text-[#FF453A] p-1 cursor-pointer transition-colors" onclick="deleteCategory('${escapeHtml(cat.name)}', 'Расход')"><i data-lucide="trash-2" class="w-4 h-4"></i></button>` : ''}
      </div>`;
  });

  html += `<p class="text-[11px] uppercase tracking-wider text-gray-500 font-bold mt-5 mb-2">Доходы</p>`;
  Cache.categories.income.forEach(cat => {
    const isDefault = DEFAULT_SYSTEM_CATEGORIES.includes(cat.name);
    const iconName = cat.icon && cat.icon !== '📦' ? cat.icon : 'tag';
    html += `
      <div class="flex justify-between items-center py-2.5 border-b border-[rgba(255,255,255,0.06)]">
        <span class="flex items-center gap-2.5 text-sm font-medium text-gray-200">
          <i data-lucide="${iconName}" class="w-4 h-4 text-[#848D99]"></i>
          ${escapeHtml(cat.name)}
        </span>
        ${!isDefault ? `<button type="button" class="text-gray-500 hover:text-[#FF453A] p-1 cursor-pointer transition-colors" onclick="deleteCategory('${escapeHtml(cat.name)}', 'Доход')"><i data-lucide="trash-2" class="w-4 h-4"></i></button>` : ''}
      </div>`;
  });

  container.innerHTML = html;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function deleteCategory(name, type) {
  showDialog('Удаление', `Удалить категорию "${name}"?`, true, async () => {
    try {
      const snapshot = await getUserCol('Categories')
        .where('name', '==', name)
        .where('type', '==', type)
        .get();
      const batch = db.batch();
      snapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();

      const arr = type === 'Доход' ? Cache.categories.income : Cache.categories.expense;
      const index = arr.findIndex(c => c.name === name);
      if (index !== -1) arr.splice(index, 1);
      renderManageCategories();

      document.querySelectorAll('.tx-category').forEach(select => {
        const row = select.closest('.tx-item');
        if (row) {
          const rowType = row.querySelector('.tx-type:checked').value;
          if (rowType === type) updateCategorySelect(select, type);
        }
      });
    } catch (e) {
      showToast('Ошибка', true);
    }
  });
}

function updateCategorySelect(containerOrRow, type) {
  if (!Cache || !Cache.categories) return;
  
  const row = containerOrRow.closest ? (containerOrRow.closest('.tx-item') || containerOrRow) : containerOrRow;
  const menu = row.querySelector('.tx-category-menu');
  const input = row.querySelector('.tx-category');
  const btn = row.querySelector('.tx-category-btn');
  const label = row.querySelector('.tx-category-label');
  
  if (!menu || !input || !btn || !label) return;

  const cats = type === 'Доход' ? Cache.categories.income : Cache.categories.expense;

  let itemsHtml = cats.map(c => {
    const isCustom = !DEFAULT_SYSTEM_CATEGORIES.includes(c.name);
    const icon = c.icon && c.icon !== '📦' ? c.icon : 'tag';
    return `
      <div class="flex items-center justify-between hover:bg-[#212430] rounded-xl px-2.5 py-1.5 transition-colors group">
        <button type="button" class="flex-1 text-left text-[13px] font-medium text-gray-200 flex items-center gap-2.5 cursor-pointer truncate min-w-0" data-cat="${escapeHtml(c.name)}" data-icon="${icon}">
          <i data-lucide="${icon}" class="w-[18px] h-[18px] text-[#848D99]"></i>
          <span class="truncate">${escapeHtml(c.name)}</span>
        </button>
        ${isCustom ? `
          <button type="button" onclick="event.stopPropagation(); deleteCategory('${escapeHtml(c.name)}', '${type}')" class="text-gray-500 hover:text-[#FF453A] p-1.5 flex-shrink-0 cursor-pointer"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
        ` : ''}
      </div>
    `;
  }).join('');

  itemsHtml += `
    <div class="border-t border-[rgba(255,255,255,0.06)] pt-1 mt-1">
      <button type="button" class="btn-add-cat-in-menu w-full text-left px-2.5 py-1.5 text-xs text-[#6C5DD3] hover:bg-[#6C5DD3]/10 rounded-lg flex items-center gap-1.5 font-semibold cursor-pointer transition-colors">
        <span>+</span> <span>Добавить категорию</span>
      </button>
    </div>
  `;

  menu.innerHTML = itemsHtml;
  if (typeof lucide !== 'undefined') lucide.createIcons();

  btn.onclick = (e) => {
    e.stopPropagation();
    const isClosed = menu.classList.contains('hidden');
    
    document.querySelectorAll('.custom-dropdown-menu').forEach(m => m.classList.add('hidden'));
    document.querySelectorAll('.tx-item').forEach(r => r.style.zIndex = '');

    if (isClosed) {
      row.style.zIndex = '50';
      smartPositionDropdown(menu, btn);
      menu.classList.remove('hidden');
      if (typeof lucide !== 'undefined') lucide.createIcons();
    } else {
      row.style.zIndex = '';
    }
  };

  menu.querySelectorAll('button[data-cat]').forEach(itemBtn => {
    itemBtn.onclick = (e) => {
      e.stopPropagation();
      const catName = itemBtn.dataset.cat;
      const catIcon = itemBtn.dataset.icon;
      input.value = catName;
      label.innerHTML = `<span class="inline-flex items-center gap-1.5 text-xs text-gray-200 font-normal truncate min-w-0"><i data-lucide="${catIcon}" class="w-3.5 h-3.5 text-[#848D99] flex-shrink-0"></i><span class="truncate">${escapeHtml(catName)}</span></span>`;
      if (typeof lucide !== 'undefined') lucide.createIcons();
      label.classList.remove('text-gray-400', 'text-white');
      label.classList.add('text-gray-200');
      menu.classList.add('hidden');
      row.style.zIndex = '';
    };
  });

  const addBtn = menu.querySelector('.btn-add-cat-in-menu');
  if (addBtn) {
    addBtn.onclick = (e) => {
      e.stopPropagation();
      menu.classList.add('hidden');
      row.style.zIndex = '';
      showAddCategoryDialog(type, row);
    };
  }
}

function smartPositionDropdown(menu, triggerBtn) {
  const rect = triggerBtn.getBoundingClientRect();
  const menuHeight = 220;
  const spaceBelow = window.innerHeight - rect.bottom;

  if (spaceBelow < menuHeight && rect.top > menuHeight) {
    menu.style.bottom = 'calc(100% + 4px)';
    menu.style.top = 'auto';
  } else {
    menu.style.top = 'calc(100% + 4px)';
    menu.style.bottom = 'auto';
  }
}

// ==========================================
// 3. Transactions Form (Создание и редактирование)
// ==========================================
function updateTxSubmitBtnText() {
  const submitBtn = document.getElementById('tx-submit-btn');
  if (!submitBtn) return;
  const rows = document.querySelectorAll('#tx-items-list .tx-item');
  if (rows.length <= 1) {
    submitBtn.textContent = 'Сохранить';
  } else {
    submitBtn.textContent = 'Сохранить все';
  }
}

function updateTxRowRemoveButtons() {
  const rows = document.querySelectorAll('#tx-items-list .tx-item');
  rows.forEach((r, idx) => {
    const btn = r.querySelector('.tx-remove-row-btn');
    if (btn) {
      if (idx === 0) {
        btn.classList.add('hidden');
      } else {
        btn.classList.remove('hidden');
      }
    }
  });
}

function removeTxRow(btn) {
  const row = btn.closest('.tx-item');
  if (!row) return;
  const list = document.getElementById('tx-items-list');
  if (!list) return;
  const allRows = Array.from(list.querySelectorAll('.tx-item'));
  if (allRows.length <= 1) return;

  // Блокируем кнопку от повторных нажатий во время анимации
  btn.disabled = true;

  // Считываем точную величину скролла, добавленную при создании именно этой карточки
  const recordedDiff = parseFloat(row.dataset.scrollDiff) || 0;
  const scrollAmount = Math.min(window.scrollY, Math.max(0, recordedDiff));

  // Фиксируем исходную высоту перед стартом CSS-перехода, чтобы исключить задержки и рывки
  row.style.maxHeight = row.offsetHeight + 'px';
  row.style.boxSizing = 'border-box';
  row.style.overflow = 'hidden';

  // В следующем кадре запускаем эстетичный iOS-слайд и схлопывание
  requestAnimationFrame(() => {
    row.classList.add('tx-item-removing');

    // Плавный синхронизированный обратный скролл ровно на добавленную дистанцию
    if (scrollAmount > 4) {
      setTimeout(() => {
        window.scrollBy({ top: -scrollAmount, behavior: 'smooth' });
      }, 40);
    }
  });

  // Очистка DOM строго по завершению анимации
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    row.remove();
    updateTxSubmitBtnText();
    updateTxRowRemoveButtons();
  };

  row.addEventListener('transitionend', (e) => {
    if (e.propertyName === 'max-height') {
      cleanup();
    }
  }, { once: true });

  setTimeout(cleanup, 360);
}

function addTxRow() {
  const clone = document.getElementById('tx-row-template').content.cloneNode(true);
  const uid = 'type_' + Math.random().toString(36).substr(2, 9);
  const radios = clone.querySelectorAll('.tx-type');
  radios[0].name = uid;
  radios[1].name = uid;

  const row = clone.querySelector('.tx-item');
  const existingRows = document.querySelectorAll('#tx-items-list .tx-item');
  const prevRow = existingRows.length > 0 ? existingRows[existingRows.length - 1] : null;

  const prevDate = prevRow ? prevRow.querySelector('.tx-date').value : '';
  row.querySelector('.tx-date').value = prevDate || new Date().toISOString().split('T')[0];

  const prevType = prevRow ? prevRow.querySelector('.tx-type:checked')?.value : null;
  if (prevType) {
    const radioToSelect = row.querySelector(`.tx-type[value="${prevType}"]`);
    if (radioToSelect) radioToSelect.checked = true;
  }

  row.querySelectorAll('.tx-type').forEach(input => {
    input.addEventListener('change', (e) => {
      const select = row.querySelector('.tx-category');
      updateCategorySelect(select, e.target.value);
    });
  });

  const currentType = row.querySelector('.tx-type:checked').value;
  const select = row.querySelector('.tx-category');
  updateCategorySelect(select, currentType);

  if (prevRow && prevType === currentType) {
    const prevCat = prevRow.querySelector('.tx-category').value;
    if (prevCat) {
      select.value = prevCat;
      const catList = currentType === 'Доход' ? (Cache.categories?.income || []) : (Cache.categories?.expense || []);
      const foundCat = catList.find(c => c.name === prevCat);
      const icon = foundCat && foundCat.icon && foundCat.icon !== '📦' ? foundCat.icon : 'tag';
      const rowLabel = row.querySelector('.tx-category-label');
      if (rowLabel) {
        rowLabel.innerHTML = `<span class="inline-flex items-center gap-1.5 text-xs text-gray-200 font-normal truncate min-w-0"><i data-lucide="${icon}" class="w-3.5 h-3.5 text-[#848D99] flex-shrink-0"></i><span class="truncate">${escapeHtml(prevCat)}</span></span>`;
        rowLabel.classList.remove('text-gray-400', 'text-white');
        rowLabel.classList.add('text-gray-200');
      }
    }
  }

  row.classList.add('tx-enter-animated');
  document.getElementById('tx-items-list').appendChild(row);

  if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
    lucide.createIcons();
  }

  updateTxSubmitBtnText();
  updateTxRowRemoveButtons();

  // Если операция добавлена кнопкой "+ Добавить еще транзакцию", плавно скроллим к новой транзакции (сбалансированное расстояние)
  if (existingRows.length > 0) {
    setTimeout(() => {
      const addBtn = document.getElementById('add-tx-row-btn');
      if (addBtn && typeof addBtn.blur === 'function') {
        addBtn.blur();
      }

      // Баланс скролла: плавно прокручиваем окно так, чтобы новая строка и кнопка добавления были идеально видны
      const rect = row.getBoundingClientRect();
      const targetOffset = 130; // оптимальный отступ от нижнего края экрана
      const currentBottom = rect.bottom;
      const desiredBottom = window.innerHeight - targetOffset;
      const diff = currentBottom - desiredBottom;

      if (diff > 0) {
        row.dataset.scrollDiff = String(Math.round(diff));
        window.scrollBy({ top: diff, behavior: 'smooth' });
      } else {
        row.dataset.scrollDiff = '0';
        row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 70);
  }
}

function submitTransactions(e) {
  e.preventDefault();
  const rows = document.querySelectorAll('.tx-item');
  if (rows.length === 0) return showDialog('Ошибка', 'Добавьте хотя бы одну операцию', false);
  submitAction('tx-submit-btn', 'Transactions', Array.from(rows).map(row => ({
    type: row.querySelector('.tx-type:checked').value,
    amount: getUnformattedVal(row.querySelector('.tx-amount')),
    date: row.querySelector('.tx-date').value,
    category: row.querySelector('.tx-category').value,
    comment: row.querySelector('.tx-comment').value
  })));
}

// ==========================================
// 3.5. Transaction Edit & Create Modal & Actions
// ==========================================
function openCreateTxModal(initData = {}) {
  const dlg = document.getElementById('tx-edit-modal');
  if (!dlg) return;

  const titleEl = document.getElementById('tx-edit-modal-title');
  const subtitleEl = document.getElementById('tx-edit-modal-subtitle');
  const deleteBtn = document.getElementById('edit-tx-delete-btn');
  const saveBtn = document.getElementById('edit-tx-save-btn');

  document.getElementById('edit-tx-id').value = '';
  const billIdInput = document.getElementById('edit-tx-bill-id');
  if (billIdInput) billIdInput.value = initData.billId || '';
  const billNameInput = document.getElementById('edit-tx-bill-name');
  if (billNameInput) billNameInput.value = initData.billName || '';
  const isBillInput = document.getElementById('edit-tx-is-bill-payment');
  if (isBillInput) isBillInput.value = initData.isBillPayment ? 'true' : 'false';

  if (titleEl) {
    titleEl.innerText = initData.title || (initData.billName ? 'Оплата счета' : 'Новая операция');
  }
  if (subtitleEl) {
    subtitleEl.innerText = initData.subtitle || (initData.billName ? `Счет: «${initData.billName}»` : 'Создание транзакции');
  }

  const type = initData.type || 'Расход';
  setEditTxType(type);

  if (initData.amount !== undefined && initData.amount !== null && initData.amount > 0) {
    setFormattedVal('edit-tx-amount', initData.amount);
  } else {
    document.getElementById('edit-tx-amount').value = '';
  }

  let targetDate = initData.date;
  if (!targetDate) {
    targetDate = new Date();
  } else if (typeof targetDate === 'string') {
    targetDate = (typeof parseAnyDate === 'function' ? parseAnyDate(targetDate) : new Date(targetDate)) || new Date();
  }
  document.getElementById('edit-tx-date').value = (typeof formatDateStr === 'function') ? formatDateStr(targetDate, 'dd.MM.yyyy') : '';

  document.getElementById('edit-tx-comment').value = (initData.comment || initData.billName || '');

  // Категория изначально не задана, если не передана явно
  if (initData.category) {
    const catArr = (type === 'Доход') ? (Cache?.categories?.income || []) : (Cache?.categories?.expense || []);
    const foundCat = catArr.find(c => c.name === initData.category);
    const icon = foundCat && foundCat.icon && foundCat.icon !== '📦' ? foundCat.icon : 'tag';
    selectEditTxCategory(initData.category, icon);
  } else {
    selectEditTxCategory('', 'tag');
  }

  const amortizeWrap = document.getElementById('wrap-edit-tx-amortize');
  const amortizeCb = document.getElementById('edit-tx-exclude-budget');
  const amortizeDetails = document.getElementById('edit-tx-amortize-details');
  const spreadInput = document.getElementById('edit-tx-spread-months');
  const spreadLabel = document.getElementById('edit-tx-spread-months-label');

  const isExp = (type === 'Расход');
  if (amortizeWrap) {
    if (isExp) {
      amortizeWrap.classList.remove('hidden');
    } else {
      amortizeWrap.classList.add('hidden');
    }
  }

  const isOneTimeBill = initData.billType === 'onetime' || initData.billType === 'Разовый';
  const isExcluded = initData.excludeFromBudget !== undefined ? !!initData.excludeFromBudget : (!!initData.isBillPayment || isOneTimeBill);
  if (amortizeCb) amortizeCb.checked = isExcluded;
  if (amortizeDetails) {
    if (isExcluded && (!initData.isBillPayment || isOneTimeBill)) {
      amortizeDetails.classList.remove('hidden');
    } else {
      amortizeDetails.classList.add('hidden');
    }
  }

  const spreadMonths = parseInt(initData.spreadMonths, 10) || 3;
  if (spreadInput) spreadInput.value = spreadMonths;
  if (spreadLabel) spreadLabel.innerText = `${spreadMonths} мес.`;
  updateTxSpreadPreview();

  if (deleteBtn) deleteBtn.classList.add('hidden');
  if (saveBtn) saveBtn.innerText = 'Создать';

  if (typeof lockBodyScroll === 'function') lockBodyScroll();
  dlg.classList.remove('hidden');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function openEditTxModal(id) {
  if (typeof isSelectionMode === 'function' && isSelectionMode()) return;
  if (window.isSelectionMode && window.isSelectionMode()) return;

  let tx = null;
  if (Array.isArray(Cache?.transactions)) {
    for (const month of Cache.transactions) {
      if (Array.isArray(month.items)) {
        tx = month.items.find(t => t.id === id);
        if (tx) break;
      }
    }
  }
  if (!tx) return;

  const dlg = document.getElementById('tx-edit-modal');
  if (!dlg) return;

  const titleEl = document.getElementById('tx-edit-modal-title');
  const subtitleEl = document.getElementById('tx-edit-modal-subtitle');
  const deleteBtn = document.getElementById('edit-tx-delete-btn');
  const saveBtn = document.getElementById('edit-tx-save-btn');

  if (titleEl) titleEl.innerText = 'Редактирование операции';
  if (subtitleEl) subtitleEl.innerText = 'Изменение параметров транзакции';
  if (deleteBtn) deleteBtn.classList.remove('hidden');
  if (saveBtn) saveBtn.innerText = 'Сохранить';

  document.getElementById('edit-tx-id').value = tx.id;
  const billIdInput = document.getElementById('edit-tx-bill-id');
  if (billIdInput) billIdInput.value = tx.billId || '';
  const billNameInput = document.getElementById('edit-tx-bill-name');
  if (billNameInput) billNameInput.value = tx.billName || '';
  const isBillInput = document.getElementById('edit-tx-is-bill-payment');
  if (isBillInput) isBillInput.value = tx.isBillPayment ? 'true' : 'false';

  setEditTxType(tx.type || 'Расход');

  setFormattedVal('edit-tx-amount', tx.amount);

  const rawDate = tx.rawDate || tx.date || new Date().toISOString().split('T')[0];
  const parsedDate = typeof parseAnyDate === 'function' ? parseAnyDate(rawDate) : new Date(rawDate);
  document.getElementById('edit-tx-date').value = (typeof formatDateStr === 'function') ? formatDateStr(parsedDate, 'dd.MM.yyyy') : rawDate;

  document.getElementById('edit-tx-comment').value = (tx.comment && tx.comment !== 'undefined') ? tx.comment : '';

  const catArr = (tx.type === 'Доход') ? (Cache?.categories?.income || []) : (Cache?.categories?.expense || []);
  const foundCat = catArr.find(c => c.name === tx.category);
  const icon = foundCat && foundCat.icon && foundCat.icon !== '📦' ? foundCat.icon : 'tag';
  selectEditTxCategory(tx.category || '', icon);

  // Настройка опции исключения и распределения
  const amortizeWrap = document.getElementById('wrap-edit-tx-amortize');
  const amortizeCb = document.getElementById('edit-tx-exclude-budget');
  const amortizeDetails = document.getElementById('edit-tx-amortize-details');
  const spreadInput = document.getElementById('edit-tx-spread-months');
  const spreadLabel = document.getElementById('edit-tx-spread-months-label');

  const isExp = (tx.type === 'Расход' || tx.type === 'expense');
  if (amortizeWrap) {
    if (isExp) {
      amortizeWrap.classList.remove('hidden');
    } else {
      amortizeWrap.classList.add('hidden');
    }
  }

  const isOneTimeTx = tx.billType === 'onetime' || (tx.spreadMonths && parseInt(tx.spreadMonths, 10) > 1) || (!tx.isBillPayment && !!tx.excludeFromBudget);
  const isExcluded = !!(tx.excludeFromBudget || tx.isExcludedFromBudget);
  if (amortizeCb) amortizeCb.checked = isExcluded;
  if (amortizeDetails) {
    if (isExcluded && (!tx.isBillPayment || isOneTimeTx)) {
      amortizeDetails.classList.remove('hidden');
    } else {
      amortizeDetails.classList.add('hidden');
    }
  }

  const spreadMonths = parseInt(tx.spreadMonths, 10) || 3;
  if (spreadInput) spreadInput.value = spreadMonths;
  if (spreadLabel) spreadLabel.innerText = `${spreadMonths} мес.`;
  updateTxSpreadPreview();

  if (typeof lockBodyScroll === 'function') lockBodyScroll();
  dlg.classList.remove('hidden');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeEditTxModal() {
  const dlg = document.getElementById('tx-edit-modal');
  if (dlg && !dlg.classList.contains('hidden')) {
    dlg.classList.add('hidden');
    if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
  }
  const menu = document.getElementById('edit-tx-category-menu');
  if (menu) menu.classList.add('hidden');
}

function setEditTxType(type) {
  const typeInput = document.getElementById('edit-tx-type');
  const btnExp = document.getElementById('edit-tx-type-expense');
  const btnInc = document.getElementById('edit-tx-type-income');
  if (!typeInput || !btnExp || !btnInc) return;

  typeInput.value = type;
  if (type === 'Расход') {
    btnExp.className = 'flex-1 py-2 text-xs font-semibold rounded-xl transition-all text-white bg-[#FF453A]/20 border border-[#FF453A]/30 cursor-pointer shadow-sm';
    btnInc.className = 'flex-1 py-2 text-xs font-semibold rounded-xl transition-all text-gray-400 hover:text-white border border-transparent cursor-pointer';
    document.getElementById('wrap-edit-tx-amortize')?.classList.remove('hidden');
  } else {
    btnExp.className = 'flex-1 py-2 text-xs font-semibold rounded-xl transition-all text-gray-400 hover:text-white border border-transparent cursor-pointer';
    btnInc.className = 'flex-1 py-2 text-xs font-semibold rounded-xl transition-all text-white bg-[#30D158]/20 border border-[#30D158]/30 cursor-pointer shadow-sm';
    document.getElementById('wrap-edit-tx-amortize')?.classList.add('hidden');
    const amortizeCb = document.getElementById('edit-tx-exclude-budget');
    if (amortizeCb) amortizeCb.checked = false;
    document.getElementById('edit-tx-amortize-details')?.classList.add('hidden');
  }

  renderEditTxCategories();
  const catArr = (type === 'Доход') ? (Cache?.categories?.income || []) : (Cache?.categories?.expense || []);
  const currentCat = document.getElementById('edit-tx-category')?.value;
  const match = catArr.find(c => c.name === currentCat);
  if (match) {
    selectEditTxCategory(match.name, match.icon);
  } else if (catArr.length > 0) {
    selectEditTxCategory(catArr[0].name, catArr[0].icon);
  } else {
    selectEditTxCategory('', 'tag');
  }
}

function renderEditTxCategories() {
  const menu = document.getElementById('edit-tx-category-menu');
  const type = document.getElementById('edit-tx-type')?.value || 'Расход';
  if (!menu || !Cache || !Cache.categories) return;

  const cats = type === 'Доход' ? (Cache.categories.income || []) : (Cache.categories.expense || []);

  let itemsHtml = cats.map(c => {
    const isCustom = !DEFAULT_SYSTEM_CATEGORIES.includes(c.name);
    const icon = c.icon && c.icon !== '📦' ? c.icon : 'tag';
    return `
      <div class="flex items-center justify-between hover:bg-[#212430] rounded-xl px-2.5 py-1.5 transition-colors group">
        <button type="button" class="flex-1 text-left text-[13px] font-medium text-gray-200 flex items-center gap-2.5 cursor-pointer truncate min-w-0" data-cat="${escapeHtml(c.name)}" data-icon="${icon}">
          <i data-lucide="${icon}" class="w-[18px] h-[18px] text-[#848D99]"></i>
          <span class="truncate">${escapeHtml(c.name)}</span>
        </button>
        ${isCustom ? `
          <button type="button" onclick="event.stopPropagation(); deleteCategory('${escapeHtml(c.name)}', '${type}')" class="text-gray-500 hover:text-[#FF453A] p-1.5 flex-shrink-0 cursor-pointer" title="Удалить категорию"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
        ` : ''}
      </div>
    `;
  }).join('');

  itemsHtml += `
    <div class="border-t border-[rgba(255,255,255,0.06)] pt-1 mt-1">
      <button type="button" class="btn-add-cat-in-edit-modal w-full text-left px-2.5 py-1.5 text-xs text-[#6C5DD3] hover:bg-[#6C5DD3]/10 rounded-lg flex items-center gap-1.5 font-semibold cursor-pointer transition-colors">
        <span>+</span> <span>Добавить категорию</span>
      </button>
    </div>
  `;

  menu.innerHTML = itemsHtml;
  if (typeof lucide !== 'undefined') lucide.createIcons();

  menu.querySelectorAll('button[data-cat]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      selectEditTxCategory(btn.dataset.cat, btn.dataset.icon);
    };
  });

  const addBtn = menu.querySelector('.btn-add-cat-in-edit-modal');
  if (addBtn) {
    addBtn.onclick = (e) => {
      e.stopPropagation();
      menu.classList.add('hidden');
      showAddCategoryDialog(type);
    };
  }
}

function selectEditTxCategory(catName, iconName) {
  const input = document.getElementById('edit-tx-category');
  const label = document.getElementById('edit-tx-category-label');
  const menu = document.getElementById('edit-tx-category-menu');
  if (input) input.value = catName || '';
  if (label) {
    const icon = (iconName && iconName !== '📦') ? iconName : 'tag';
    if (catName) {
      label.innerHTML = `<i data-lucide="${icon}" class="w-4 h-4 text-[#848D99]"></i> <span class="truncate text-white font-medium">${escapeHtml(catName)}</span>`;
    } else {
      label.innerHTML = `<i data-lucide="tag" class="w-4 h-4 text-[#848D99]"></i> <span class="truncate text-gray-400">Выберите категорию</span>`;
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
  if (menu) menu.classList.add('hidden');
}

function toggleEditTxCategoryMenu(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('edit-tx-category-menu');
  if (!menu) return;
  const isClosed = menu.classList.contains('hidden');
  document.querySelectorAll('.custom-dropdown-menu').forEach(m => m.classList.add('hidden'));
  if (isClosed) {
    renderEditTxCategories();
    menu.classList.remove('hidden');
  }
}

function toggleTxAmortizeSection(enabled) {
  const details = document.getElementById('edit-tx-amortize-details');
  if (details) {
    if (enabled) {
      details.classList.remove('hidden');
      updateTxSpreadPreview();
    } else {
      details.classList.add('hidden');
    }
  }
}

function changeTxSpreadMonths(delta) {
  const input = document.getElementById('edit-tx-spread-months');
  if (!input) return;
  let val = parseInt(input.value, 10) || 1;
  val = Math.max(1, Math.min(12, val + delta));
  input.value = val;
  const label = document.getElementById('edit-tx-spread-months-label');
  if (label) label.innerText = `${val} мес.`;
  updateTxSpreadPreview();
}

function updateTxSpreadPreview() {
  const amount = getUnformattedVal(document.getElementById('edit-tx-amount')) || 0;
  const spreadMonths = parseInt(document.getElementById('edit-tx-spread-months')?.value, 10) || 3;
  const monthlyVal = spreadMonths > 0 ? Math.round(amount / spreadMonths) : amount;
  const calcEl = document.getElementById('edit-tx-spread-calc');
  if (calcEl) calcEl.innerText = `+${formatMoney(monthlyVal)}/мес`;
}

async function submitEditTxModal(e) {
  if (e) e.preventDefault();
  const id = document.getElementById('edit-tx-id').value;

  const type = document.getElementById('edit-tx-type').value;
  const amount = getUnformattedVal(document.getElementById('edit-tx-amount'));
  const category = document.getElementById('edit-tx-category').value;
  const rawDate = document.getElementById('edit-tx-date').value;
  const comment = document.getElementById('edit-tx-comment').value.trim();

  const billId = document.getElementById('edit-tx-bill-id')?.value || null;
  const billName = document.getElementById('edit-tx-bill-name')?.value || '';
  const isBillPayment = (document.getElementById('edit-tx-is-bill-payment')?.value === 'true') || !!billId;

  if (!amount || amount <= 0) {
    showToast('Введите корректную сумму', true);
    return;
  }
  if (!category) {
    showToast('Выберите категорию', true);
    return;
  }

  const parsedDate = (typeof parseAnyDate === 'function' ? parseAnyDate(rawDate) : new Date(rawDate)) || new Date();
  const date = (typeof formatDateStr === 'function') ? formatDateStr(parsedDate, 'yyyy-MM-dd') : rawDate;

  const bill = billId ? (Cache?.calendarBills || []).find(b => b.id === billId) : null;
  const isOneTimeBill = (bill && (bill.type === 'onetime' || bill.type === 'Разовый')) || (parseInt(document.getElementById('edit-tx-spread-months')?.value, 10) > 1 && !!document.getElementById('edit-tx-exclude-budget')?.checked);
  const effectiveIsBillPayment = isBillPayment && !isOneTimeBill;
  const excludeFromBudget = (type === 'Расход') && (isBillPayment || isOneTimeBill || !!document.getElementById('edit-tx-exclude-budget')?.checked);
  const spreadMonths = (excludeFromBudget && (isOneTimeBill || !isBillPayment)) ? (parseInt(document.getElementById('edit-tx-spread-months')?.value, 10) || (bill ? parseInt(bill.spreadMonths, 10) : 1) || 3) : 1;

  const tempTxId = id || `opt_tx_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  const isNew = !id;

  // 1. Получаем плоский список и сохраняем временную метку дня при редактировании
  const allFlat = typeof getAllCachedTransactionsFlat === 'function' ? getAllCachedTransactionsFlat() : [];
  let itemTimestamp = parsedDate.getTime();
  if (id) {
    const existing = allFlat.find(t => t.id === id);
    if (existing && existing.timestamp && (existing.formattedDate === formatDateStr(parsedDate, 'dd.MM.yyyy') || existing.date === date)) {
      itemTimestamp = existing.timestamp;
    }
  }

  // 2. Формируем локальный объект транзакции
  const txObj = {
    id: tempTxId,
    type,
    amount,
    category,
    date,
    formattedDate: (typeof formatDateStr === 'function') ? formatDateStr(parsedDate, 'dd.MM.yyyy') : date,
    rawDate: date,
    comment: comment || billName || '',
    excludeFromBudget: !!excludeFromBudget,
    spreadMonths,
    isBillPayment: !!effectiveIsBillPayment,
    billId: billId || null,
    billName: billName || '',
    billType: isOneTimeBill ? 'onetime' : (effectiveIsBillPayment ? 'recurring' : ''),
    timestamp: itemTimestamp
  };

  // 3. Мгновенно обновляем локальный кэш Cache в 0мс
  if (id) {
    const idx = allFlat.findIndex(t => t.id === id);
    if (idx !== -1) allFlat[idx] = { ...allFlat[idx], ...txObj };
    else allFlat.unshift(txObj);
  } else {
    allFlat.unshift(txObj);
    window.lastAddedTxIds = [tempTxId];
    window.lastAddedTxTime = Date.now();
  }

  if (typeof processTransactions === 'function') {
    Cache.transactions = processTransactions(allFlat);
  }

  if (billId) {
    const bill = (Cache?.calendarBills || []).find(b => b.id === billId);
    if (bill) {
      const monthKey = (typeof formatDateStr === 'function') ? formatDateStr(parsedDate, 'yyyy-MM') : '2026-09';
      const paidMonths = { ...(bill.paidMonths || {}) };
      paidMonths[monthKey] = { paid: true, txId: tempTxId, amount: parseFloat(amount) || 0 };
      bill.isPaid = true;
      bill.linkedTxId = tempTxId;
      bill.paidMonths = paidMonths;
    }
  }

  // 3. Мгновенно закрываем модалку и перерисовываем интерфейс (0мс)
  closeEditTxModal();
  if (typeof markTabsDirty === 'function') markTabsDirty();
  if (typeof renderBudgetTab === 'function') renderBudgetTab();
  if (typeof renderTransactions === 'function') renderTransactions();

  document.getElementById('toast-container')?.classList.add('hidden');
  showToast(id ? 'Операция сохранена' : (isBillPayment ? `Оплата «${billName || 'Счет'}» создана` : 'Операция создана'));

  // 4. Фоновая отправка в Firestore
  try {
    if (id) {
      // 1. Обновление существующей транзакции
      await getUserCol('Transactions').doc(id).update({
        type,
        amount,
        category,
        date,
        comment,
        excludeFromBudget,
        spreadMonths,
        isBillPayment: !!effectiveIsBillPayment,
        billId: billId || null,
        billName: billName || '',
        billType: isOneTimeBill ? 'onetime' : (effectiveIsBillPayment ? 'recurring' : ''),
        updatedAt: Date.now()
      });

      // Синхронизация с CalendarBills при исключении/распределении
      if (!isBillPayment) {
        const billCol = getUserCol('CalendarBills');
        const existingBill = (Cache.calendarBills || []).find(b => b.linkedTxId === id);

        if (excludeFromBudget) {
          const billData = {
            name: comment || category || 'Разовая трата',
            totalAmount: amount,
            spreadMonths,
            amount: Math.round(amount / spreadMonths),
            day: parsedDate.getDate(),
            month: formatDateStr(parsedDate, 'yyyy-MM'),
            startMonth: formatDateStr(parsedDate, 'yyyy-MM'),
            type: 'onetime',
            linkedTxId: id,
            updatedAt: Date.now()
          };

          if (existingBill) {
            await billCol.doc(existingBill.id).update(billData);
            Object.assign(existingBill, billData);
          } else {
            const newBill = { ...billData, isPaid: true, createdAt: Date.now() };
            const docRef = await billCol.add(newBill);
            newBill.id = docRef.id;
            if (!Cache.calendarBills) Cache.calendarBills = [];
            Cache.calendarBills.push(newBill);
          }
        } else if (existingBill) {
          await billCol.doc(existingBill.id).delete();
          Cache.calendarBills = (Cache.calendarBills || []).filter(b => b.id !== existingBill.id);
        }
      }
    } else {
      // 2. Создание новой транзакции в Firestore
      const newTxData = {
        type,
        amount,
        category,
        date,
        comment: comment || billName || '',
        excludeFromBudget,
        spreadMonths,
        isBillPayment: !!effectiveIsBillPayment,
        billId: billId || null,
        billName: billName || '',
        billType: isOneTimeBill ? 'onetime' : (effectiveIsBillPayment ? 'recurring' : ''),
        createdAt: Date.now()
      };

      const txDocRef = await getUserCol('Transactions').add(newTxData);
      const newTxId = txDocRef.id;
      window.lastAddedTxIds = [newTxId];

      // Бесшовно заменяем временный ID в памяти
      const flatList = typeof getAllCachedTransactionsFlat === 'function' ? getAllCachedTransactionsFlat() : [];
      const tempItem = flatList.find(t => t.id === tempTxId);
      if (tempItem) tempItem.id = newTxId;
      if (typeof processTransactions === 'function') {
        Cache.transactions = processTransactions(flatList);
      }

      if (billId) {
        const bill = (Cache?.calendarBills || []).find(b => b.id === billId);
        if (bill) {
          const monthKey = formatDateStr(parsedDate, 'yyyy-MM');
          const paidMonths = { ...(bill.paidMonths || {}) };
          paidMonths[monthKey] = {
            paid: true,
            txId: newTxId,
            amount: parseFloat(amount) || 0
          };

          await getUserCol('CalendarBills').doc(billId).update({
            isPaid: true,
            linkedTxId: newTxId,
            paidMonths: paidMonths,
            updatedAt: Date.now()
          });
          bill.linkedTxId = newTxId;
        }
      }
    }

    if (typeof fetchCollection === 'function') {
      fetchCollection('Transactions').catch(() => {});
      if (billId) fetchCollection('CalendarBills').catch(() => {});
    }
  } catch (err) {
    console.error('Ошибка при сохранении операции:', err);
    showToast('Ошибка при сохранении: ' + (err.message || ''), true);
    if (typeof fetchAllData === 'function') fetchAllData();
  }
}

function deleteTxFromModal() {
  const id = document.getElementById('edit-tx-id').value;
  if (!id) return;
  showDialog('Удаление операции', 'Точно удалить операцию? Это действие нельзя отменить.', true, async () => {
    try {
      closeEditTxModal();

      const allTxs = typeof getAllCachedTransactionsFlat === 'function' ? getAllCachedTransactionsFlat() : [];
      const deletedTx = allTxs.find(t => t.id === id);

      // Оптимистично удаляем из локального кэша транзакций
      if (Array.isArray(Cache?.transactions)) {
        for (const month of Cache.transactions) {
          if (Array.isArray(month.items)) {
            month.items = month.items.filter(t => t.id !== id);
          }
        }
      }

      // Переводим связанные счета в статус "не оплачено"
      if (typeof handleTransactionsDeleted === 'function') {
        await handleTransactionsDeleted([id], deletedTx ? [deletedTx] : []);
      }

      if (typeof renderBudgetTab === 'function') renderBudgetTab();
      if (typeof renderTransactions === 'function') renderTransactions();
      showToast('Операция удалена');

      // Фоновое удаление из базы данных
      await getUserCol('Transactions').doc(id).delete();
    } catch (err) {
      console.error('Ошибка при удалении:', err);
      showToast('Ошибка при удалении: ' + (err.message || ''), true);
    }
  });
}

function editTx(id) {
  openEditTxModal(id);
}

// Контекстное меню для транзакции с пунктом «Сделать разовой» / «Вернуть в лимит»
function openTxContextMenu(e, txId) {
  if (typeof isSelectionMode === 'function' && isSelectionMode()) return;
  if (window.isSelectionMode && window.isSelectionMode()) return;

  let tx = null;
  if (Array.isArray(Cache?.transactions)) {
    for (const month of Cache.transactions) {
      if (Array.isArray(month.items)) {
        tx = month.items.find(t => t.id === txId);
        if (tx) break;
      }
    }
  }
  if (!tx) return;

  const isExp = (tx.type === 'Расход');
  let extraAction = null;

  if (isExp) {
    if (tx.excludeFromBudget) {
      extraAction = {
        label: 'Вернуть в лимит',
        icon: 'rotate-ccw',
        handler: () => returnTxToBudget(txId)
      };
    } else {
      extraAction = {
        label: 'Сделать разовой',
        icon: 'split',
        handler: () => openQuickAmortizeModal(txId)
      };
    }
  }

  openCardContextMenu(
    e,
    tx.category,
    () => openEditTxModal(txId),
    () => deleteRecord('Transactions', txId),
    extraAction
  );
}

// Быстрое распределение разовой траты без полного редактирования
function openQuickAmortizeModal(id) {
  let tx = null;
  if (Array.isArray(Cache?.transactions)) {
    for (const month of Cache.transactions) {
      if (Array.isArray(month.items)) {
        tx = month.items.find(t => t.id === id);
        if (tx) break;
      }
    }
  }
  if (!tx) return;

  const dlg = document.getElementById('quick-amortize-modal');
  if (!dlg) return;

  document.getElementById('quick-amortize-tx-id').value = tx.id;
  document.getElementById('quick-amortize-amount').value = tx.amount;
  document.getElementById('quick-amortize-cat-name').innerText = tx.comment ? `${tx.category} • ${tx.comment}` : tx.category;
  document.getElementById('quick-amortize-total-display').innerText = formatMoney(tx.amount);

  const spreadInput = document.getElementById('quick-amortize-spread-months');
  const spreadLabel = document.getElementById('quick-amortize-months-label');
  const initialMonths = parseInt(tx.spreadMonths, 10) || 3;
  if (spreadInput) spreadInput.value = initialMonths;
  if (spreadLabel) spreadLabel.innerText = `${initialMonths} мес.`;

  updateQuickSpreadPreview();
  if (typeof lockBodyScroll === 'function') lockBodyScroll();
  dlg.classList.remove('hidden');
  if (typeof lucide !== 'undefined') lucide.createIcons({ root: dlg });
}

function closeQuickAmortizeModal() {
  const dlg = document.getElementById('quick-amortize-modal');
  if (dlg && !dlg.classList.contains('hidden')) {
    dlg.classList.add('hidden');
    if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
  }
}

function changeQuickSpreadMonths(delta) {
  const input = document.getElementById('quick-amortize-spread-months');
  if (!input) return;
  let val = parseInt(input.value, 10) || 1;
  val = Math.max(1, Math.min(12, val + delta));
  input.value = val;
  const label = document.getElementById('quick-amortize-months-label');
  if (label) label.innerText = `${val} мес.`;
  updateQuickSpreadPreview();
}

function updateQuickSpreadPreview() {
  const amount = parseFloat(document.getElementById('quick-amortize-amount')?.value) || 0;
  const spreadMonths = parseInt(document.getElementById('quick-amortize-spread-months')?.value, 10) || 3;
  const monthlyVal = spreadMonths > 0 ? Math.round(amount / spreadMonths) : amount;
  const calcEl = document.getElementById('quick-amortize-monthly-calc');
  if (calcEl) calcEl.innerText = `+${formatMoney(monthlyVal)}/мес`;
}

async function submitQuickAmortize() {
  const id = document.getElementById('quick-amortize-tx-id')?.value;
  if (!id) return;

  let tx = null;
  if (Array.isArray(Cache?.transactions)) {
    for (const month of Cache.transactions) {
      if (Array.isArray(month.items)) {
        tx = month.items.find(t => t.id === id);
        if (tx) break;
      }
    }
  }
  if (!tx) return;

  const amount = parseFloat(tx.amount) || 0;
  const spreadMonths = parseInt(document.getElementById('quick-amortize-spread-months')?.value, 10) || 3;
  const rawDate = tx.rawDate || tx.date || new Date().toISOString().split('T')[0];
  const parsedDate = (typeof parseAnyDate === 'function' ? parseAnyDate(rawDate) : new Date(rawDate)) || new Date();

  try {
    await getUserCol('Transactions').doc(id).update({
      excludeFromBudget: true,
      spreadMonths
    });

    const billCol = getUserCol('CalendarBills');
    const existingBill = (Cache.calendarBills || []).find(b => b.linkedTxId === id);

    const billData = {
      name: tx.comment || tx.category || 'Разовая трата',
      totalAmount: amount,
      spreadMonths,
      amount: Math.round(amount / spreadMonths),
      day: parsedDate.getDate(),
      month: (typeof formatDateStr === 'function') ? formatDateStr(parsedDate, 'yyyy-MM') : parsedDate.toISOString().slice(0, 7),
      startMonth: (typeof formatDateStr === 'function') ? formatDateStr(parsedDate, 'yyyy-MM') : parsedDate.toISOString().slice(0, 7),
      type: 'onetime',
      linkedTxId: id,
      updatedAt: Date.now()
    };

    if (existingBill) {
      await billCol.doc(existingBill.id).update(billData);
      Object.assign(existingBill, billData);
    } else {
      const docRef = await billCol.add(billData);
      billData.id = docRef.id;
      if (!Cache.calendarBills) Cache.calendarBills = [];
      Cache.calendarBills.push(billData);
    }

    tx.excludeFromBudget = true;
    tx.spreadMonths = spreadMonths;

    closeQuickAmortizeModal();
    renderTransactions();
    if (typeof renderBudgetCalendar === 'function') {
      const today = new Date();
      const currentMonthStr = (typeof formatDateStr === 'function') ? formatDateStr(today, 'yyyy-MM') : today.toISOString().slice(0, 7);
      const monthItems = (Cache.transactions || []).find(m => m.month === currentMonthStr)?.items || [];
      renderBudgetCalendar(Cache.calendarBills || [], monthItems);
      if (typeof updatePlanForecast === 'function') updatePlanForecast();
      if (typeof renderBudgetMonthProgress === 'function') renderBudgetMonthProgress(Cache.budgetPlan || {}, monthItems);
      if (typeof renderWeeklyPulse === 'function') renderWeeklyPulse(Cache.budgetPlan || {}, monthItems);
    }

    showToast(`Трата распределена в календаре на ${spreadMonths} мес.`);
  } catch (err) {
    console.error('Error submitting quick amortize:', err);
    showToast('Ошибка при сохранении', true);
  }
}

async function returnTxToBudget(id) {
  let tx = null;
  if (Array.isArray(Cache?.transactions)) {
    for (const month of Cache.transactions) {
      if (Array.isArray(month.items)) {
        tx = month.items.find(t => t.id === id);
        if (tx) break;
      }
    }
  }
  if (!tx) return;

  try {
    await getUserCol('Transactions').doc(id).update({
      excludeFromBudget: false,
      spreadMonths: 1
    });

    const billCol = getUserCol('CalendarBills');
    const existingBill = (Cache.calendarBills || []).find(b => b.linkedTxId === id);
    if (existingBill) {
      await billCol.doc(existingBill.id).delete();
      Cache.calendarBills = (Cache.calendarBills || []).filter(b => b.id !== existingBill.id);
    }

    tx.excludeFromBudget = false;
    tx.spreadMonths = 1;

    renderTransactions();
    if (typeof renderBudgetCalendar === 'function') {
      const today = new Date();
      const currentMonthStr = (typeof formatDateStr === 'function') ? formatDateStr(today, 'yyyy-MM') : today.toISOString().slice(0, 7);
      const monthItems = (Cache.transactions || []).find(m => m.month === currentMonthStr)?.items || [];
      renderBudgetCalendar(Cache.calendarBills || [], monthItems);
      if (typeof updatePlanForecast === 'function') updatePlanForecast();
      if (typeof renderBudgetMonthProgress === 'function') renderBudgetMonthProgress(Cache.budgetPlan || {}, monthItems);
      if (typeof renderWeeklyPulse === 'function') renderWeeklyPulse(Cache.budgetPlan || {}, monthItems);
    }

    showToast('Трата возвращена в месячный лимит');
  } catch (err) {
    console.error('Error returning tx to budget:', err);
    showToast('Ошибка при возврате в бюджет', true);
  }
}

// ==========================================
// 4. Filtering & List Rendering
// ==========================================
function toggleCustomFilterMenu(type) {
  const monthMenu = document.getElementById('menu-filter-month');
  const catMenu = document.getElementById('menu-filter-cat');

  if (type === 'month') {
    monthMenu.classList.toggle('hidden');
    catMenu.classList.add('hidden');
  } else {
    catMenu.classList.toggle('hidden');
    monthMenu.classList.add('hidden');
  }
}

function selectFilterValue(type, value, label) {
  if (type === 'month') {
    currentFilterMonth = value;
    document.getElementById('label-filter-month').textContent = label;
    document.getElementById('menu-filter-month').classList.add('hidden');
  } else {
    currentFilterCategory = value;
    document.getElementById('label-filter-cat').textContent = label;
    document.getElementById('menu-filter-cat').classList.add('hidden');
  }
  renderTransactions();
}

function getLargeExpenseThreshold() {
  const plan = Cache?.budgetPlan;
  if (!plan) return Infinity;

  // Проверяем, настроен ли бюджет: должен быть задан лимит переменных расходов больше 0
  const monthlyLimit = parseFloat(plan.monthlyVariableLimit) || 0;
  if (monthlyLimit <= 0) return Infinity;

  // Недельный лимит = monthlyLimit / 4.33
  const weeklyBaseLimit = monthlyLimit / 4.33;
  if (weeklyBaseLimit <= 0) return Infinity;

  // Крупная трата: 2/3 от недельного лимита расходов
  return Math.round((weeklyBaseLimit * 2) / 3);
}

let _txInfiniteObserver = null;
let _txPendingDayGroups = [];
let _txRenderedDayCount = 0;
const TX_DAYS_PER_CHUNK = 12;

function renderTxRowHtml(tx, largeThreshold, hasDynamicThreshold) {
  const isExp = tx.type === 'Расход';
  const isOneTime = (tx.billType === 'onetime') || (tx.spreadMonths && parseInt(tx.spreadMonths, 10) > 1) || (!tx.isBillPayment && !!tx.excludeFromBudget);
  const isBill = !isOneTime && (!!tx.isBillPayment || (!!tx.billId && tx.billType !== 'onetime'));
  const isAmortized = isOneTime && !!tx.excludeFromBudget;
  const isLarge = isExp && !isAmortized && !isBill && hasDynamicThreshold && (parseFloat(tx.amount) >= largeThreshold);

  const isTxTabVisible = !document.getElementById('transactions-tab')?.classList.contains('hidden');
  const isFresh = (Date.now() - (window.lastAddedTxTime || 0)) < 1800;
  const isJustAdded = isTxTabVisible && isFresh && window.lastAddedTxIds && window.lastAddedTxIds.includes(tx.id);

  const catArr = isExp ? (Cache.categories?.expense || []) : (Cache.categories?.income || []);
  const catInfo = catArr.find(c => c.name === tx.category);
  const iconStr = catInfo && catInfo.icon ? catInfo.icon : 'tag';
  const iconBg = isExp 
    ? 'bg-[#212430] text-[#9EA7B3] border border-[rgba(255,255,255,0.04)]' 
    : 'bg-[#30D158]/10 text-[#30D158] border border-[#30D158]/20';

  return `
    <div class="card cursor-pointer w-full py-[13px] px-4 flex items-center justify-between ${isJustAdded ? 'tx-row-new' : ''}"
         data-id="${tx.id}"
         data-table="Transactions"
         onclick="openTxContextMenu(event, '${tx.id}')">
      
      <input type="checkbox" class="select-checkbox hidden" data-id="${tx.id}">

      <div class="flex items-center gap-3.5 min-w-0">
         <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}">
            <i data-lucide="${iconStr}" class="w-[22px] h-[22px] stroke-[1.75px]"></i>
         </div>
         <div class="min-w-0 flex flex-col justify-center">
           <div class="flex items-center gap-1.5">
             <span class="text-[15px] font-semibold text-gray-200 truncate leading-snug">${escapeHtml(tx.category)}</span>
             ${isBill ? `
               <span class="px-1.5 py-0.5 rounded bg-[#6C5DD3]/15 text-[#a594fd] border border-[#6C5DD3]/25 text-[10px] font-medium flex items-center gap-1 flex-shrink-0 leading-none" title="Ежемесячный счет: ${escapeHtml(tx.billName || 'Счет')}">
                 <i data-lucide="calendar" class="w-2.5 h-2.5"></i>Счет
               </span>
             ` : (isAmortized ? `
               <span class="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/25 text-[10px] font-medium flex items-center gap-1 flex-shrink-0 leading-none" title="Исключена из месячного лимита и распределена на ${tx.spreadMonths || 1} мес.">
                 <i data-lucide="split" class="w-2.5 h-2.5"></i>${tx.spreadMonths || 1} мес
               </span>
             ` : (isLarge ? `
               <span class="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center flex-shrink-0 leading-none" title="Крупная трата (от ${formatMoney(largeThreshold)})">
                 <i data-lucide="flame" class="w-3 h-3 stroke-[2]"></i>
               </span>
             ` : ''))}
           </div>
           ${tx.comment ? `<span class="text-[12px] text-gray-500 truncate leading-tight">${escapeHtml(typeof cleanMerchantTitle === 'function' ? cleanMerchantTitle(tx.comment) : tx.comment)}</span>` : ''}
         </div>
      </div>

     <div class="tx-amount flex-shrink-0 text-right font-medium ml-2 ${isExp ? 'text-gray-200' : 'text-[#30D158]'} text-[16px]">
        ${isExp ? '-' : '+'}${formatMoney(tx.amount)}
     </div>
    </div>
  `;
}

function appendTxChunk() {
  const listEl = document.getElementById('transactions-list');
  if (!listEl || !_txPendingDayGroups || _txPendingDayGroups.length === 0) {
    const sentinel = document.getElementById('tx-infinite-sentinel');
    if (sentinel) sentinel.remove();
    return;
  }

  const nextGroups = _txPendingDayGroups.slice(_txRenderedDayCount, _txRenderedDayCount + TX_DAYS_PER_CHUNK);
  if (nextGroups.length === 0) {
    const sentinel = document.getElementById('tx-infinite-sentinel');
    if (sentinel) sentinel.remove();
    return;
  }

  _txRenderedDayCount += nextGroups.length;

  const largeThreshold = getLargeExpenseThreshold();
  const hasDynamicThreshold = isFinite(largeThreshold) && largeThreshold > 0;

  const getRelativeDayName = (dateStr) => {
    const d = new Date(dateStr.split('.').reverse().join('-'));
    const tday = new Date(); tday.setHours(0, 0, 0, 0);
    const yday = new Date(tday); yday.setDate(tday.getDate() - 1);
    
    if (d.getTime() === tday.getTime()) return 'Сегодня';
    if (d.getTime() === yday.getTime()) return 'Вчера';
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  };

  const chunkHtml = nextGroups.map(group => `
    <div class="mb-5">
      <h3 class="font-semibold text-[#848D99] text-[13px] mb-2 px-1 tracking-wide">${getRelativeDayName(group.day)}</h3>
      <div class="bg-[#181B24] border border-[rgba(255,255,255,0.06)] rounded-2xl overflow-hidden divide-y divide-[rgba(255,255,255,0.03)] shadow-sm">
        ${group.items.map(tx => renderTxRowHtml(tx, largeThreshold, hasDynamicThreshold)).join('')}
      </div>
    </div>
  `).join('');

  // Удаляем старый sentinel перед добавлением новых элементов
  const oldSentinel = document.getElementById('tx-infinite-sentinel');
  if (oldSentinel) oldSentinel.remove();

  const tempWrapper = document.createElement('div');
  tempWrapper.innerHTML = chunkHtml;

  const insertedNodes = [];
  while (tempWrapper.firstChild) {
    const child = tempWrapper.firstChild;
    listEl.appendChild(child);
    if (child.nodeType === 1) insertedNodes.push(child);
  }

  // Создаем иконки строго внутри вновь добавленного блока, не трогая весь документ!
  if (typeof lucide !== 'undefined') {
    insertedNodes.forEach(node => {
      lucide.createIcons({ root: node });
    });
  }

  // Если остались еще группы, вешаем сторож (sentinel) для плавной догрузки при скролле
  if (_txRenderedDayCount < _txPendingDayGroups.length) {
    const sentinel = document.createElement('div');
    sentinel.id = 'tx-infinite-sentinel';
    sentinel.className = 'py-4 flex items-center justify-center text-xs text-gray-500 min-h-[36px]';
    listEl.appendChild(sentinel);

    if (!_txInfiniteObserver) {
      _txInfiniteObserver = new IntersectionObserver((entries) => {
        if (entries[0] && entries[0].isIntersecting) {
          appendTxChunk();
        }
      }, { rootMargin: '400px 0px' });
    }
    _txInfiniteObserver.disconnect();
    _txInfiniteObserver.observe(sentinel);
  }
}

function renderTransactions() {
  const data = Cache.transactions || [];

  const monthMenu = document.getElementById('menu-filter-month');
  if (monthMenu && data.length > 0) {
    let mHtml = `
      <button type="button" onclick="selectFilterValue('month', 'all', 'Все месяцы')" class="custom-dropdown-item ${currentFilterMonth === 'all' ? 'is-active' : ''}">
        Все месяцы
      </button>
    `;
    data.forEach(m => {
      const active = (currentFilterMonth === m.id);
      mHtml += `
        <button type="button" onclick="selectFilterValue('month', '${m.id}', '${escapeHtml(m.label)}')" class="custom-dropdown-item ${active ? 'is-active' : ''}">
          ${escapeHtml(m.label)}
        </button>
      `;
    });
    monthMenu.innerHTML = mHtml;
  }

  const catMenu = document.getElementById('menu-filter-cat');
  if (catMenu && Cache.categories) {
    const allCats = [
      ...Cache.categories.expense.map(c => ({ name: c.name, icon: c.icon || 'tag' })),
      ...Cache.categories.income.map(c => ({ name: c.name, icon: c.icon || 'tag' }))
    ];
    const map = new Map();
    allCats.forEach(c => { if (!map.has(c.name)) map.set(c.name, c.icon); });

    let cHtml = `
      <button type="button" onclick="selectFilterValue('cat', 'all', 'Все категории')" class="custom-dropdown-item ${currentFilterCategory === 'all' ? 'is-active' : ''}">
        Все категории
      </button>
    `;
    Array.from(map.entries()).sort((a,b) => a[0].localeCompare(b[0])).forEach(([name, icon]) => {
      const active = (currentFilterCategory === name);
      cHtml += `
        <button type="button" onclick="selectFilterValue('cat', '${escapeHtml(name)}', '${escapeHtml(name)}')" class="custom-dropdown-item ${active ? 'is-active' : ''}">
          <i data-lucide="${icon}" class="w-4 h-4 flex-shrink-0"></i>
          <span class="truncate">${escapeHtml(name)}</span>
        </button>
      `;
    });
    catMenu.innerHTML = cHtml;
    if (typeof lucide !== 'undefined') {
      lucide.createIcons({ root: catMenu });
    }
  }

  let filteredMonths = data.map(m => {
    if (currentFilterMonth !== 'all' && m.id !== currentFilterMonth) return null;

    let items = m.items;
    if (currentFilterCategory !== 'all') {
      items = items.filter(tx => tx.category === currentFilterCategory);
    }

    if (items.length === 0) return null;

    const expense = items.filter(i => i.type === 'Расход').reduce((sum, i) => sum + i.amount, 0);
    const income = items.filter(i => i.type === 'Доход').reduce((sum, i) => sum + i.amount, 0);

    return { ...m, items, expense, income };
  }).filter(Boolean);

  let periodText = 'Тек. мес';
  if (currentFilterMonth === 'all') {
    periodText = 'Все время';
  } else {
    const selectedMonthObj = data.find(m => m.id === currentFilterMonth);
    if (selectedMonthObj) periodText = selectedMonthObj.label;
  }
  if (currentFilterCategory !== 'all') {
    periodText += ` • ${currentFilterCategory}`;
  }

  const expLabel = document.getElementById('month-expense-label');
  const incLabel = document.getElementById('month-income-label');
  if (expLabel) expLabel.innerText = `Расходы (${periodText})`;
  if (incLabel) incLabel.innerText = `Доходы (${periodText})`;

  const totalExp = filteredMonths.reduce((a, b) => a + b.expense, 0);
  const totalInc = filteredMonths.reduce((a, b) => a + b.income, 0);
  const expEl = document.getElementById('month-expense');
  const incEl = document.getElementById('month-income');
  if (expEl) {
    if (typeof animateNumber === 'function') animateNumber(expEl, totalExp);
    else expEl.innerText = formatMoney(totalExp);
  }
  if (incEl) {
    if (typeof animateNumber === 'function') animateNumber(incEl, totalInc);
    else incEl.innerText = formatMoney(totalInc);
  }

  const listEl = document.getElementById('transactions-list');
  if (!listEl) return;

  if (_txInfiniteObserver) {
    _txInfiniteObserver.disconnect();
  }

  if (filteredMonths.length === 0) {
    listEl.innerHTML = '<div class="text-center text-gray-500 py-10 text-[13px]">Операции не найдены</div>';
    return;
  }

  // Формируем плоский массив групп по дням для мгновенной постраничной отрисовки
  _txPendingDayGroups = [];
  _txRenderedDayCount = 0;

  filteredMonths.forEach(month => {
    const daysObj = {};
    month.items.forEach(tx => { 
      if (!daysObj[tx.formattedDate]) daysObj[tx.formattedDate] = [];
      daysObj[tx.formattedDate].push(tx);
    });

    Object.keys(daysObj).forEach(day => {
      _txPendingDayGroups.push({
        day,
        monthId: month.id,
        items: daysObj[day]
      });
    });
  });

  listEl.innerHTML = '';
  appendTxChunk();

  if (window.lastAddedTxIds) {
    setTimeout(() => {
      document.querySelectorAll('.tx-row-new').forEach(el => el.classList.remove('tx-row-new'));
      window.lastAddedTxIds = null;
    }, 1250);
  }
}

// ==========================================
// 5. Analytics & Charts
// ==========================================
function switchTransactionView(view) {
  const isChart = view === 'chart';
  const list = document.getElementById('transactions-list-wrap') || document.getElementById('transactions-list');
  const chart = document.getElementById('transactions-chart');
  const listBtn = document.getElementById('view-list-btn');
  const chartBtn = document.getElementById('view-chart-btn');

  if (list) list.classList.toggle('hidden', isChart);
  if (chart) chart.classList.toggle('hidden', !isChart);
  if (listBtn) {
    listBtn.classList.toggle('is-active', !isChart);
    listBtn.setAttribute('aria-selected', String(!isChart));
  }
  if (chartBtn) {
    chartBtn.classList.toggle('is-active', isChart);
    chartBtn.setAttribute('aria-selected', String(isChart));
  }

  if (isChart) {
    requestAnimationFrame(() => buildCharts());
  }
}

function buildCharts() {
  if (!Cache || !Cache.transactions) return;
  const months = Cache.transactions;
  if (!months.length) return;

  const chronological = months.slice().reverse();
  const lastMonths = chronological.slice(-8);
  const labels = lastMonths.map(m => m.label);
  const expenses = lastMonths.map(m => Number(m.expense) || 0);
  const incomes = lastMonths.map(m => Number(m.income) || 0);

  const canvas = document.getElementById('monthlyExpensesChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (monthlyChartObj) monthlyChartObj.destroy();

  monthlyChartObj = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Доходы',
          data: incomes,
          backgroundColor: 'rgba(48, 209, 88, 0.78)',
          hoverBackgroundColor: '#34D35B',
          borderColor: '#30D158',
          hoverBorderColor: 'rgba(94, 235, 135, 0.95)',
          borderWidth: 0,
          hoverBorderWidth: 1.5,
          borderRadius: 7,
          borderSkipped: false,
          barPercentage: .72,
          categoryPercentage: .62
        },
        {
          label: 'Расходы',
          data: expenses,
          backgroundColor: 'rgba(255, 69, 58, 0.78)',
          hoverBackgroundColor: '#FF4A3F',
          borderColor: '#FF453A',
          hoverBorderColor: 'rgba(255, 120, 110, 0.95)',
          borderWidth: 0,
          hoverBorderWidth: 1.5,
          borderRadius: 7,
          borderSkipped: false,
          barPercentage: .72,
          categoryPercentage: .62
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 650, easing: 'easeOutQuart' },
      interaction: { mode: 'point', intersect: true },
      onClick: (e, elements, chart) => {
        // Если кликнули мимо столбцов (в пустую область графика) — закрываем тултип и снимаем подсветку
        if (!elements || elements.length === 0) {
          chart._activeElementKey = null;
          chart._activeMonthIndex = -1;
          chart.setActiveElements([]);
          chart.tooltip.setActiveElements([], { x: 0, y: 0 });
          chart.update();
          return;
        }

        const clickedEl = elements[0];
        const datasetIdx = clickedEl.datasetIndex; // 0 — Доходы, 1 — Расходы
        const monthIdx = clickedEl.index;
        const elementKey = `${datasetIdx}_${monthIdx}`;

        // Повторный клик по тому же столбцу — снимаем выделение
        if (chart._activeElementKey === elementKey) {
          chart._activeElementKey = null;
          chart._activeMonthIndex = -1;
          chart.setActiveElements([]);
          chart.tooltip.setActiveElements([], { x: 0, y: 0 });
          chart.update();
          return;
        }

        // Выделяем именно нажатый столбец (только его!)
        chart._activeElementKey = elementKey;
        chart._activeMonthIndex = monthIdx;
        const activeItems = [{ datasetIndex: datasetIdx, index: monthIdx }];
        chart.setActiveElements(activeItems);

        const targetEl = chart.getDatasetMeta(datasetIdx)?.data?.[monthIdx] || clickedEl.element;
        chart.tooltip.setActiveElements(activeItems, {
          x: targetEl.x,
          y: Math.max(12, targetEl.y)
        });
        chart.update();
      },
      scales: {
        x: {
          stacked: false,
          grid: { display: false },
          border: { display: false },
          ticks: { color: '#737d89', font: { size: 10, weight: '600' }, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 }
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(255,255,255,.055)' },
          border: { display: false },
          ticks: { color: '#737d89', font: { size: 10 }, padding: 7, maxTicksLimit: 6, callback: v => formatCompactChartMoney(v) }
        }
      },
      plugins: {
        legend: {
          position: 'top', align: 'start',
          labels: { color: '#aeb6c1', usePointStyle: true, pointStyle: 'circle', boxWidth: 8, boxHeight: 8, padding: 16, font: { size: 11, weight: '650' } }
        },
        datalabels: { display: false },
        tooltip: {
          backgroundColor: '#1b222a', borderColor: 'rgba(255,255,255,.10)', borderWidth: 1,
          titleColor: '#fff', bodyColor: '#c9ced5', padding: 11, cornerRadius: 12,
          callbacks: { label: context => `${context.dataset.label}: ${formatMoney(context.raw)}` }
        }
      }
    }
  });

  window.monthlyChartObj = monthlyChartObj;
  updateAnalyticsMonthView();
}

function updateAnalyticsMonthView() {
  const months = Cache?.transactions || [];
  if (!months.length) return;

  currentAnalyticsMonthIndex = Math.max(0, Math.min(months.length - 1, currentAnalyticsMonthIndex));
  const cur = months[currentAnalyticsMonthIndex];

  const labelEl = document.getElementById('analytics-month-label');
  if (labelEl) labelEl.textContent = cur.label;

  const prevBtn = document.getElementById('prev-month-btn');
  const nextBtn = document.getElementById('next-month-btn');

  const hasPrev = currentAnalyticsMonthIndex < months.length - 1;
  const hasNext = currentAnalyticsMonthIndex > 0;

  if (prevBtn) {
    prevBtn.classList.toggle('invisible', !hasPrev);
    prevBtn.disabled = !hasPrev;
  }
  if (nextBtn) {
    nextBtn.classList.toggle('invisible', !hasNext);
    nextBtn.disabled = !hasNext;
  }

  updateAnalyticsForMonth(cur.id);

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

function changeAnalyticsMonth(direction) {
  const months = Cache?.transactions || [];
  if (!months.length) return;
  currentAnalyticsMonthIndex += direction;
  updateAnalyticsMonthView();
}

function formatCompactChartMoney(value) {
  if (Math.abs(value) >= 1000000) return (value / 1000000).toFixed(value % 1000000 ? 1 : 0) + ' млн';
  if (Math.abs(value) >= 1000) return Math.round(value / 1000) + 'k';
  return value;
}

function switchStructureType(type) {
  currentStructureType = type;
  
  const expBtn = document.getElementById('struct-type-expense');
  const incBtn = document.getElementById('struct-type-income');
  if (expBtn && incBtn) {
    if (type === 'Расход') {
      expBtn.className = 'px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-gray-700 text-white transition-all';
      incBtn.className = 'px-2.5 py-1 text-[11px] font-semibold rounded-lg text-gray-400 hover:text-white transition-all';
    } else {
      incBtn.className = 'px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-emerald-600 text-white transition-all';
      expBtn.className = 'px-2.5 py-1 text-[11px] font-semibold rounded-lg text-gray-400 hover:text-white transition-all';
    }
  }

  const titleEl = document.getElementById('structure-title');
  if (titleEl) {
    titleEl.textContent = type === 'Расход' ? 'Куда уходят деньги' : 'Источники доходов';
  }

  const months = Cache?.transactions || [];
  if (months.length > 0) {
    const curMonth = months[currentAnalyticsMonthIndex] || months[0];
    updateAnalyticsForMonth(curMonth.id);
  }
}

let currentDonutEntries = [];
let currentDonutTotal = 0;
let currentDonutColors = [];

// Функция сброса выбора сектора круговой диаграммы
function resetCategoryDonutCenter() {
  const centerLabelEl = document.getElementById('donut-center-label');
  const totalEl = document.getElementById('category-total');
  const defaultLabel = currentStructureType === 'Расход' ? 'Расходы' : 'Доходы';

  if (centerLabelEl) {
    centerLabelEl.textContent = defaultLabel;
    centerLabelEl.style.color = '';
  }
  if (totalEl) {
    totalEl.textContent = formatMoney(currentDonutTotal);
  }
  document.querySelectorAll('.category-legend__item').forEach(el => el.classList.remove('is-selected'));
  if (categoryChartObj) {
    categoryChartObj._activeSliceIdx = -1;
    categoryChartObj.setActiveElements([]);
    categoryChartObj.update();
  }
}

// Функция интерактивного выбора сектора круговой диаграммы
function selectCategorySlice(idx) {
  if (!categoryChartObj || !currentDonutEntries[idx]) return;

  if (categoryChartObj._activeSliceIdx === idx) {
    resetCategoryDonutCenter();
    return;
  }

  categoryChartObj._activeSliceIdx = idx;
  categoryChartObj.setActiveElements([{ datasetIndex: 0, index: idx }]);
  categoryChartObj.update();

  const [catLabel, catVal] = currentDonutEntries[idx];
  const pct = currentDonutTotal ? Math.round(catVal / currentDonutTotal * 100) : 0;
  const col = currentDonutColors[idx % currentDonutColors.length];

  const centerLabelEl = document.getElementById('donut-center-label');
  const totalEl = document.getElementById('category-total');

  if (centerLabelEl) {
    centerLabelEl.textContent = `${catLabel} (${pct}%)`;
    centerLabelEl.style.color = col;
  }
  if (totalEl) {
    totalEl.textContent = formatMoney(catVal);
  }

  document.querySelectorAll('.category-legend__item').forEach((item, i) => {
    item.classList.toggle('is-selected', i === idx);
  });
}

function updateAnalyticsForMonth(monthId) {
  const month = Cache.transactions?.find(m => m.id === monthId);
  if (!month) return;

  const income = Number(month.income) || 0;
  const expense = Number(month.expense) || 0;
  const balance = income - expense;
  const rate = income > 0 ? Math.round((expense / income) * 100) : 0;

  const incomeEl = document.getElementById('analytics-income');
  const expenseEl = document.getElementById('analytics-expense');
  const balanceEl = document.getElementById('analytics-month-balance');
  const rateEl = document.getElementById('analytics-rate');
  if (incomeEl) incomeEl.textContent = formatMoney(income);
  if (expenseEl) expenseEl.textContent = formatMoney(expense);
  if (balanceEl) {
    balanceEl.textContent = `${balance >= 0 ? '+' : ''}${formatMoney(balance)}`;
    balanceEl.classList.toggle('is-negative', balance < 0);
  }
  if (rateEl) rateEl.textContent = income > 0 ? `${rate}% дохода` : 'Нет дохода';

  const catMap = {};
  month.items.filter(tx => tx.type === currentStructureType).forEach(tx => {
    catMap[tx.category] = (catMap[tx.category] || 0) + (Number(tx.amount) || 0);
  });

  const entries = Object.entries(catMap).sort((a,b) => b[1] - a[1]);
  const labels = entries.map(([label]) => label);
  const data = entries.map(([,value]) => value);
  const colors = currentStructureType === 'Расход' 
    ? ['#0A84FF', '#FF9F0A', '#FF453A', '#BF5AF2', '#30D158', '#FF375F', '#5E5CE6'] 
    : ['#30D158', '#32ADE6', '#FF9F0A', '#64D2FF'];
  const total = data.reduce((sum, value) => sum + value, 0);

  currentDonutEntries = entries;
  currentDonutTotal = total;
  currentDonutColors = colors;

  const totalEl = document.getElementById('category-total');
  const centerLabelEl = document.getElementById('donut-center-label');
  const legendEl = document.getElementById('category-legend');

  const defaultLabel = currentStructureType === 'Расход' ? 'Расходы' : 'Доходы';
  if (totalEl) totalEl.textContent = formatMoney(total);
  if (centerLabelEl) {
    centerLabelEl.textContent = defaultLabel;
    centerLabelEl.style.color = '';
  }

  if (legendEl) {
    legendEl.innerHTML = entries.length ? entries.map(([label, value], i) => `
      <div class="category-legend__item" onclick="selectCategorySlice(${i})">
        <span class="category-legend__dot" style="background:${colors[i % colors.length]}"></span>
        <span class="category-legend__name">${escapeHtml(label)}</span>
        <span class="category-legend__value">${formatMoney(value)}</span>
        <span class="category-legend__percent">${total ? Math.round(value / total * 100) : 0}%</span>
      </div>`).join('') : `<div class="analytics-empty">Нет ${currentStructureType === 'Расход' ? 'расходов' : 'доходов'} за этот месяц</div>`;
  }

  const canvas = document.getElementById('categoryExpensesChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  if (categoryChartObj && categoryChartObj.ctx && categoryChartObj.ctx.canvas === canvas) {
    categoryChartObj._activeSliceIdx = -1;
    categoryChartObj.setActiveElements([]);
    categoryChartObj.data.labels = data.length ? labels : ['Нет данных'];
    categoryChartObj.data.datasets[0].data = data.length ? data : [1];
    categoryChartObj.data.datasets[0].backgroundColor = data.length ? colors.slice(0, data.length) : ['#303740'];
    
    // Мгновенно обнуляем дугу без анимации
    categoryChartObj.options.circumference = 0;
    categoryChartObj.update('none');

    // Запускаем плавное красивое круговое заполнение на 360 градусов
    requestAnimationFrame(() => {
      if (categoryChartObj) {
        categoryChartObj.options.circumference = 360;
        categoryChartObj.update();
      }
    });
  } else {
    if (categoryChartObj) categoryChartObj.destroy();

    categoryChartObj = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: data.length ? labels : ['Нет данных'],
        datasets: [{
          data: data.length ? data : [1],
          backgroundColor: data.length ? colors.slice(0, data.length) : ['#303740'],
          borderColor: '#171d24',
          borderWidth: 3,
          hoverOffset: 8,
          hoverBorderColor: 'rgba(255,255,255,0.92)',
          hoverBorderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: 14 // Защитный отступ от краев canvas, чтобы выделенный верхний/боковые сегменты не обрезались
        },
        cutout: '72%',
        rotation: -90,
        circumference: 0,
        animation: {
          duration: 750,
          easing: 'easeOutQuart'
        },
        interaction: {
          mode: 'nearest',
          intersect: true
        },
        onClick: (e, elements, chart) => {
          let clickedElements = elements;
          if (!clickedElements || !clickedElements.length) {
            clickedElements = chart.getElementsAtEventForMode(
              e.native || e,
              'nearest',
              { intersect: true },
              false
            );
          }
          if (!clickedElements || !clickedElements.length) {
            window.resetCategoryDonutCenter();
            return;
          }
          const clickedIdx = clickedElements[0].index;
          window.selectCategorySlice(clickedIdx);
        },
        plugins: {
          legend: { display: false },
          datalabels: { display: false },
          tooltip: {
            enabled: false
          }
        }
      }
    });

    // Запускаем первичное круговое заполнение на 360 градусов
    requestAnimationFrame(() => {
      if (categoryChartObj) {
        categoryChartObj.options.circumference = 360;
        categoryChartObj.update();
      }
    });
  }

  window.categoryChartObj = categoryChartObj;
}

// ==========================================
// 6. Global Event Listeners (Фильтры и модалки)
// ==========================================
document.addEventListener('click', (e) => {
  if (!e.target.closest('#wrap-filter-month') && !e.target.closest('#wrap-filter-cat')) {
    const mm = document.getElementById('menu-filter-month');
    const cm = document.getElementById('menu-filter-cat');
    if (mm) mm.classList.add('hidden');
    if (cm) cm.classList.add('hidden');
  }
  if (!e.target.closest('.custom-dropdown-wrap')) {
    document.querySelectorAll('.tx-category-menu').forEach(m => m.classList.add('hidden'));
    document.querySelectorAll('.tx-item').forEach(r => r.style.zIndex = '');
  }
});

// Слушатели кнопок внутри модальных окон категорий
document.addEventListener('DOMContentLoaded', () => {
  const cancelCatBtn = document.getElementById('category-cancel-btn');
  if (cancelCatBtn) {
    cancelCatBtn.addEventListener('click', () => {
      document.getElementById('category-dialog')?.classList.add('hidden');
    });
  }

  const saveCatBtn = document.getElementById('category-save-btn');
  if (saveCatBtn) {
    saveCatBtn.addEventListener('click', async () => {
      const name = document.getElementById('category-name-input').value.trim();
      if (!name) return showToast('Введите название', true);
      try {
        await getUserCol('Categories').add({ name, type: currentCategoryType, icon: selectedCategoryIcon });
        const arr = currentCategoryType === 'Доход' ? Cache.categories.income : Cache.categories.expense;
        arr.push({ name, icon: selectedCategoryIcon });
        updateCategorySelect(currentCategorySelect, currentCategoryType);
        document.getElementById('category-dialog').classList.add('hidden');
      } catch (e) {
        showToast('Ошибка', true);
      }
    });
  }

  const closeManageBtn = document.getElementById('close-manage-categories');
  if (closeManageBtn) {
    closeManageBtn.addEventListener('click', () => {
      document.getElementById('manage-categories-dialog')?.classList.add('hidden');
      if (window._returnToProfile) {
        window._returnToProfile = false;
        openProfileModal();
      }
    });
  }
});

// ==========================================
// 7. Global Scope Exports
// ==========================================
window.processTransactions = processTransactions;
window.processCategories = processCategories;

window.showAddCategoryDialog = showAddCategoryDialog;
window.renderIconGrid = renderIconGrid;
window.showManageCategoriesDialog = showManageCategoriesDialog;
window.renderManageCategories = renderManageCategories;
window.deleteCategory = deleteCategory;
window.updateCategorySelect = updateCategorySelect;
window.smartPositionDropdown = smartPositionDropdown;

window.addTxRow = addTxRow;
window.removeTxRow = removeTxRow;
window.updateTxSubmitBtnText = updateTxSubmitBtnText;
window.updateTxRowRemoveButtons = updateTxRowRemoveButtons;
window.submitTransactions = submitTransactions;
window.editTx = editTx;
window.openTxContextMenu = openTxContextMenu;
window.openQuickAmortizeModal = openQuickAmortizeModal;
window.closeQuickAmortizeModal = closeQuickAmortizeModal;
window.changeQuickSpreadMonths = changeQuickSpreadMonths;
window.updateQuickSpreadPreview = updateQuickSpreadPreview;
window.submitQuickAmortize = submitQuickAmortize;
window.returnTxToBudget = returnTxToBudget;
window.openEditTxModal = openEditTxModal;
window.openCreateTxModal = openCreateTxModal;
window.closeEditTxModal = closeEditTxModal;
window.submitEditTxModal = submitEditTxModal;
window.deleteTxFromModal = deleteTxFromModal;
window.toggleTxAmortizeSection = toggleTxAmortizeSection;
window.changeTxSpreadMonths = changeTxSpreadMonths;
window.updateTxSpreadPreview = updateTxSpreadPreview;
window.setEditTxType = setEditTxType;
window.renderEditTxCategories = renderEditTxCategories;
window.toggleEditTxCategoryMenu = toggleEditTxCategoryMenu;
window.selectEditTxCategory = selectEditTxCategory;

window.toggleCustomFilterMenu = toggleCustomFilterMenu;
window.selectFilterValue = selectFilterValue;
window.renderTransactions = renderTransactions;
window.appendTxChunk = appendTxChunk;
window.getLargeExpenseThreshold = getLargeExpenseThreshold;

window.switchTransactionView = switchTransactionView;
window.buildCharts = buildCharts;
window.updateAnalyticsMonthView = updateAnalyticsMonthView;
window.changeAnalyticsMonth = changeAnalyticsMonth;
window.switchStructureType = switchStructureType;
window.updateAnalyticsForMonth = updateAnalyticsForMonth;
window.resetCategoryDonutCenter = resetCategoryDonutCenter;
window.selectCategorySlice = selectCategorySlice;
