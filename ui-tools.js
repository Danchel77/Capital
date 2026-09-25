// ==========================================
// Variables & State
// ==========================================

// Мультиселект
let selectionMode = false;
let selectedItems = new Set();
let longPressTimer = null;
let longPressTriggered = false;
let suppressClick = false;

// Кастомный DatePicker
let activeDateInput = null;
let currentPickerDate = new Date();

// Контекстное меню
let activeContextCard = null;

// ==========================================
// 1. Selection Mode (Мультивыбор)
// ==========================================
function enableSelectionMode() {
  selectionMode = true;
  document.body.classList.add('selection-mode');

  let panel = document.getElementById('selection-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'selection-panel';
    panel.className = 'selection-panel';
    panel.innerHTML = `
      <div class="selection-panel__info">
        <span class="selection-panel__dot"></span>
        <span id="selected-count">Выбрано: 0</span>
      </div>
      <div class="selection-panel__actions">
        <button id="cancel-selection" type="button">Отмена</button>
        <button id="delete-selected" type="button">Удалить</button>
      </div>
    `;
    document.body.appendChild(panel);
  }
  panel.style.display = 'flex';
  document.getElementById('selected-count').textContent = `Выбрано: ${selectedItems.size}`;
  attachSelectionPanelDirectEvents();
}

function disableSelectionMode() {
  selectionMode = false;
  selectedItems.clear();
  document.body.classList.remove('selection-mode');
  const panel = document.getElementById('selection-panel');
  if (panel) panel.style.display = 'none';
  document.querySelectorAll('.card.selected').forEach(card => card.classList.remove('selected'));
  document.querySelectorAll('.select-checkbox').forEach(cb => cb.checked = false);
}

function toggleItemSelection(id, table) {
  const key = `${table}:${id}`;
  if (selectedItems.has(key)) {
    selectedItems.delete(key);
  } else {
    selectedItems.add(key);
  }
  
  const card = document.querySelector(`.card[data-id="${id}"][data-table="${table}"]`);
  if (card) {
    card.classList.toggle('selected', selectedItems.has(key));
    const checkbox = card.querySelector('.select-checkbox');
    if (checkbox) checkbox.checked = selectedItems.has(key);
  }
  
  const countEl = document.getElementById('selected-count');
  if (countEl) countEl.textContent = `Выбрано: ${selectedItems.size}`;
  
  if (selectedItems.size === 0 && selectionMode) {
    disableSelectionMode();
  }
}

async function deleteSelectedItems() {
  if (selectedItems.size === 0) return;
  showDialog('Удаление', `Удалить выбранные записи (${selectedItems.size})?`, true, async () => {
    try {
      const batch = db.batch();
      const deletedTxIds = [];

      selectedItems.forEach(key => {
        const [table, id] = key.split(':');
        if (table === 'Transactions') {
          deletedTxIds.push(id);
        }
        batch.delete(getUserCol(table).doc(id));
      });

      if (deletedTxIds.length > 0 && typeof handleTransactionsDeleted === 'function') {
        const allTxs = typeof getAllCachedTransactionsFlat === 'function' ? getAllCachedTransactionsFlat() : [];
        const deletedTxs = allTxs.filter(t => deletedTxIds.includes(t.id));

        // Оптимистично удаляем из локального кэша транзакций
        if (Array.isArray(Cache?.transactions)) {
          for (const month of Cache.transactions) {
            if (Array.isArray(month.items)) {
              month.items = month.items.filter(t => !deletedTxIds.includes(t.id));
            }
          }
        }

        await handleTransactionsDeleted(deletedTxIds, deletedTxs, batch);
      }

      await batch.commit();
      disableSelectionMode();
      await fetchAllData();
      showToast("Выбранные записи удалены");
    } catch (e) {
      console.error('Ошибка удаления:', e);
      showToast("Ошибка удаления", true);
    }
  });
}

function attachSelectionPanelDirectEvents() {
  const cancelBtn = document.getElementById('cancel-selection');
  const deleteBtn = document.getElementById('delete-selected');
  if (!cancelBtn || !deleteBtn) return;

  cancelBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); cancelSelection(); };
  cancelBtn.ontouchend = (e) => { e.preventDefault(); e.stopPropagation(); cancelSelection(); };
  deleteBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); deleteSelectedItems(); };
  deleteBtn.ontouchend = (e) => { e.preventDefault(); e.stopPropagation(); deleteSelectedItems(); };
}

function cancelSelection() {
  longPressTriggered = false;
  suppressClick = false;
  disableSelectionMode();
}

function startLongPress(card) {
  longPressTriggered = false;
  clearTimeout(longPressTimer);
  longPressTimer = setTimeout(() => {
    longPressTriggered = true;
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 400);
    
    // Снимаем возможное системное выделение текста в мобильном браузере
    if (window.getSelection) {
      window.getSelection().removeAllRanges();
    }

    if (!selectionMode) enableSelectionMode();
    toggleItemSelection(card.dataset.id, card.dataset.table);
  }, 500);
}

function getEventTargetElement(target) {
  if (!target) return null;
  if (target.nodeType === 3) return target.parentElement; // TextNode
  return (typeof target.closest === 'function') ? target : null;
}

function handleTouchStart(e) {
  const el = getEventTargetElement(e?.target);
  if (!el) return;
  // Касания по плавающей панели выбора, бейджам темпа целей и тултипам не должны инициировать события карточек
  if (el.closest('#selection-panel') || el.closest('.goal-pace-badge') || el.closest('.goal-pace-tooltip')) return;
  const card = el.closest('.card, [data-table]');
  if (!card) return;
  if (selectionMode) return;
  startLongPress(card);
}

function handleTouchEnd(e) {
  clearTimeout(longPressTimer);
  if (longPressTriggered) {
    if (e.cancelable) e.preventDefault();
    longPressTriggered = false;
  }
}

function handleTouchMove(e) {
  clearTimeout(longPressTimer);
  longPressTriggered = false;
}

function handleMouseDown(e) {
  const el = getEventTargetElement(e?.target);
  if (!el) return;
  if (el.closest('#selection-panel') || el.closest('.goal-pace-badge') || el.closest('.goal-pace-tooltip')) return;
  const card = el.closest('.card, [data-table]');
  if (!card) return;
  if (selectionMode) return;
  startLongPress(card);
}

function handleMouseUp(e) {
  clearTimeout(longPressTimer);
  if (longPressTriggered) {
    if (e.cancelable) e.preventDefault();
    longPressTriggered = false;
  }
}

function handleMouseMove(e) {
  clearTimeout(longPressTimer);
}

// ==========================================
// 2. Context Menu (Контекстное меню)
// ==========================================
function openCardContextMenu(e, title, onEdit, onDelete, extraAction = null) {
  if (selectionMode) {
    if (e) e.stopPropagation();
    const el = getEventTargetElement(e?.target);
    const card = e ? (e.currentTarget || (el && el.closest('.card'))) : null;
    if (card) {
      toggleItemSelection(card.dataset.id, card.dataset.table);
    }
    return;
  }

  if (e) e.stopPropagation();
  const menu = document.getElementById('card-context-menu');
  const titleEl = document.getElementById('context-menu-title');
  const editBtn = document.getElementById('context-btn-edit');
  const deleteBtn = document.getElementById('context-btn-delete');
  const amortizeBtn = document.getElementById('context-btn-amortize');
  const amortizeText = document.getElementById('context-amortize-text');
  const amortizeIcon = document.getElementById('context-amortize-icon');
  if (!menu) return;

  const el = getEventTargetElement(e?.target);
  const card = e ? (e.currentTarget || (el && el.closest('.card'))) : null;
  if (!card) return;

  // Снимаем подсветку с предыдущей активной карточки, если была
  if (activeContextCard && activeContextCard !== card) {
    activeContextCard.classList.remove('context-active');
  }

  // Тоггл: повторный клик по той же карточке закрывает меню
  if (activeContextCard === card && !menu.classList.contains('hidden')) {
    closeCardContextMenu();
    return;
  }
  activeContextCard = card;
  activeContextCard.classList.add('context-active');

  function triggerPopoverAction(btn, action) {
    if (!btn) {
      closeCardContextMenu();
      if (typeof action === 'function') action();
      return;
    }
    btn.classList.add('is-pressed');
    setTimeout(() => {
      btn.classList.remove('is-pressed');
      closeCardContextMenu();
      if (typeof action === 'function') action();
    }, 75);
  }

  titleEl.innerText = title || 'Действия';
  editBtn.onclick = () => triggerPopoverAction(editBtn, onEdit);
  deleteBtn.onclick = () => triggerPopoverAction(deleteBtn, onDelete);

  if (amortizeBtn) {
    if (extraAction && typeof extraAction.handler === 'function') {
      amortizeBtn.classList.remove('hidden');
      amortizeBtn.classList.add('flex');
      if (amortizeText) amortizeText.innerText = extraAction.label || 'Сделать разовой';
      if (amortizeIcon && extraAction.icon) amortizeIcon.setAttribute('data-lucide', extraAction.icon);
      amortizeBtn.onclick = () => triggerPopoverAction(amortizeBtn, extraAction.handler);
    } else {
      amortizeBtn.classList.add('hidden');
      amortizeBtn.classList.remove('flex');
      amortizeBtn.onclick = null;
    }
  }

  menu.classList.remove('hidden');
  if (typeof lucide !== 'undefined') lucide.createIcons({ root: menu });

  const rect = card.getBoundingClientRect();
  const hasExtra = (extraAction && typeof extraAction.handler === 'function');
  const menuHeight = menu.offsetHeight || (hasExtra ? 175 : 125);
  const menuWidth = menu.offsetWidth || 200;

  // Учитываем нижнюю панель навигации (nav) и границы вьюпорта
  const nav = document.querySelector('nav');
  const navHeight = (nav && nav.offsetHeight > 0) ? nav.offsetHeight : 64;
  const bottomLimit = window.innerHeight - navHeight - 8;
  const topLimit = 10;

  const spaceBelow = bottomLimit - rect.bottom;
  const spaceAbove = rect.top - topLimit;

  let top;
  if (spaceBelow >= menuHeight + 6) {
    // Достаточно места под карточкой
    top = rect.bottom + 6;
  } else if (spaceAbove >= menuHeight + 6) {
    // Места снизу нет, открываем аккуратно СВЕРХУ карточки без перекрытия
    top = rect.top - menuHeight - 6;
  } else {
    // В редком случае нехватки места с обеих сторон выбираем сторону с большим запасом
    if (spaceAbove >= spaceBelow) {
      top = Math.max(topLimit, rect.top - menuHeight - 6);
    } else {
      top = Math.min(bottomLimit - menuHeight, rect.bottom + 6);
    }
  }

  // Горизонтальное позиционирование (прижимаем к правому краю карточки, но в пределах экрана)
  let left = Math.min(window.innerWidth - menuWidth - 12, Math.max(12, rect.right - menuWidth));

  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;
}

function closeCardContextMenu() {
  const menu = document.getElementById('card-context-menu');
  if (menu) menu.classList.add('hidden');
  if (activeContextCard) {
    activeContextCard.classList.remove('context-active');
    activeContextCard = null;
  }
  document.querySelectorAll('.card.context-active').forEach(el => el.classList.remove('context-active'));
}

// Скрытие тултипов графиков при клике в пустое место страницы или скролле
function hideAllChartTooltips(e) {
  const isTargetInside = (selector) => e && e.target && e.target.closest(selector);

  // 1. График брокера и контекстный попап точки
  if (!isTargetInside('#brokerChart') && !isTargetInside('#broker-point-popup')) {
    if (typeof closeBrokerPointPopup === 'function') closeBrokerPointPopup();
  }
  const brokerChart = window.brokerChartObj;
  if (brokerChart && !isTargetInside('#brokerChart') && brokerChart.tooltip && brokerChart.tooltip.getActiveElements().length > 0) {
    brokerChart.setActiveElements([]);
    brokerChart.tooltip.setActiveElements([], { x: 0, y: 0 });
    brokerChart.update('none');
  }

  // 2. Столбчатый график динамики трат
  const monthlyChart = window.monthlyChartObj;
  if (monthlyChart && !isTargetInside('#monthlyExpensesChart')) {
    if (monthlyChart.getActiveElements().length > 0 || monthlyChart._activeElementKey) {
      monthlyChart._activeElementKey = null;
      monthlyChart._activeMonthIndex = -1;
      monthlyChart.setActiveElements([]);
      monthlyChart.tooltip.setActiveElements([], { x: 0, y: 0 });
      monthlyChart.update();
    }
  }

  // 3. Круговая диаграмма структуры категорий
  const catChart = window.categoryChartObj;
  if (catChart && !isTargetInside('#categoryExpensesChart') && !isTargetInside('#category-legend') && !isTargetInside('.donut-center')) {
    if (catChart.getActiveElements().length > 0 || catChart._activeSliceIdx >= 0) {
      if (typeof window.resetCategoryDonutCenter === 'function') {
        window.resetCategoryDonutCenter();
      } else {
        catChart._activeSliceIdx = -1;
        catChart.setActiveElements([]);
        catChart.update();
      }
    }
  }
}

// ==========================================
// 3. Custom DatePicker (Кастомный календарь)
// ==========================================
function setupCustomDatePickers() {
  document.querySelectorAll('input[type="date"], input[data-datepicker]').forEach(input => {
    input.readOnly = true;
    input.setAttribute('inputmode', 'none');
    input.style.cursor = 'pointer';
  });
}

function openCustomDatePicker(inputEl) {
  activeDateInput = inputEl;
  const modal = document.getElementById('custom-datepicker-modal');
  const picker = document.getElementById('custom-datepicker');
  if (!picker && !modal) return;

  const currentVal = inputEl?.value ? (typeof parseAnyDate === 'function' ? parseAnyDate(inputEl.value) : new Date(inputEl.value)) : new Date();
  currentPickerDate = (currentVal && !isNaN(currentVal.getTime())) ? currentVal : new Date();

  renderCustomDatePicker();

  // Предзаполняем поле ручного ввода текущей датой
  const manualInput = document.getElementById('datepicker-manual-input');
  if (manualInput) {
    const yyyy = currentPickerDate.getFullYear();
    const mm = String(currentPickerDate.getMonth() + 1).padStart(2, '0');
    const dd = String(currentPickerDate.getDate()).padStart(2, '0');
    manualInput.value = `${dd}.${mm}.${yyyy}`;
    manualInput.classList.remove('border-[#FF453A]');
  }

  // Сбрасываем устаревшие inline-координаты
  if (picker) {
    picker.style.top = '';
    picker.style.left = '';
    picker.style.transform = '';
  }

  if (modal) {
    modal.classList.remove('hidden');
    picker?.classList.remove('hidden');
  } else if (picker) {
    picker.classList.remove('hidden');
  }

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeCustomDatePicker() {
  const modal = document.getElementById('custom-datepicker-modal');
  const picker = document.getElementById('custom-datepicker');
  if (modal) modal.classList.add('hidden');
  if (picker) picker.classList.add('hidden');
  activeDateInput = null;
}

function renderCustomDatePicker() {
  const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const label = document.getElementById('datepicker-month-year');
  const grid = document.getElementById('datepicker-days-grid');
  if (!label || !grid) return;

  const year = currentPickerDate.getFullYear();
  const month = currentPickerDate.getMonth();
  label.innerText = `${monthNames[month]} ${year}`;

  const firstDayIndex = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  let html = '';
  for (let i = 0; i < firstDayIndex; i++) {
    html += `<span></span>`;
  }

  const selectedDateStr = activeDateInput ? activeDateInput.value : '';

  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = String(day).padStart(2, '0');
    const monthStr = String(month + 1).padStart(2, '0');
    const fullDate = `${year}-${monthStr}-${dayStr}`;
    const fullDateRu = `${dayStr}.${monthStr}.${year}`;
    const isSelected = (selectedDateStr === fullDate || selectedDateStr === fullDateRu);

    html += `
      <button type="button" onclick="applyCustomDate('${fullDate}')" class="h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer font-medium ${isSelected ? 'bg-[#6C5DD3] text-white font-bold' : 'hover:bg-[#212430] text-gray-300'}">
        ${day}
      </button>
    `;
  }
  grid.innerHTML = html;
}

function applyCustomDate(dateStr) {
  if (activeDateInput) {
    const isNativeDate = (activeDateInput.type === 'date');
    const formatted = (typeof formatDateStr === 'function') ? formatDateStr(dateStr, isNativeDate ? 'yyyy-MM-dd' : 'dd.MM.yyyy') : dateStr;
    activeDateInput.value = formatted;

    const label = document.getElementById('edit-tx-date-label');
    if (label && activeDateInput.id === 'edit-tx-date') {
      label.innerText = (typeof formatDateStr === 'function') ? formatDateStr(dateStr, 'dd.MM.yyyy') : dateStr;
    }

    activeDateInput.dispatchEvent(new Event('change'));
    activeDateInput.dispatchEvent(new Event('input'));
  }
  closeCustomDatePicker();
}

function formatManualDateInput(el) {
  let val = el.value.replace(/[^\d]/g, '');
  if (val.length > 8) val = val.slice(0, 8);

  let formatted = '';
  if (val.length > 4) {
    formatted = val.slice(0, 2) + '.' + val.slice(2, 4) + '.' + val.slice(4);
  } else if (val.length > 2) {
    formatted = val.slice(0, 2) + '.' + val.slice(2);
  } else {
    formatted = val;
  }
  el.value = formatted;

  // Если дата введена полностью, сразу синхронизируем сетку календаря
  if (formatted.length === 10) {
    const iso = parseManualDate(formatted);
    if (iso) {
      currentPickerDate = new Date(iso);
      renderCustomDatePicker();
    }
  }
}

function applyManualDateInput() {
  const manualInput = document.getElementById('datepicker-manual-input');
  if (!manualInput) return;

  const iso = parseManualDate(manualInput.value);
  if (!iso) {
    manualInput.classList.add('border-[#FF453A]');
    showToast('Неверная дата (формат ДД.ММ.ГГГГ)', true);
    setTimeout(() => manualInput.classList.remove('border-[#FF453A]'), 2000);
    return;
  }

  applyCustomDate(iso);
}

function handleManualDateKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    applyManualDateInput();
  }
}

function parseManualDate(str) {
  if (!str) return null;
  const clean = str.trim().replace(/[^\d.]/g, '');
  const parts = clean.split('.').filter(Boolean);
  const now = new Date();
  let day, month, year;

  if (parts.length === 3) {
    day = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
    year = parseInt(parts[2], 10);
    if (year < 100) year += 2000;
  } else if (parts.length === 2) {
    day = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
    year = currentPickerDate.getFullYear() || now.getFullYear();
  } else if (parts.length === 1 && clean.length <= 2) {
    day = parseInt(parts[0], 10);
    month = (currentPickerDate.getMonth() + 1) || (now.getMonth() + 1);
    year = currentPickerDate.getFullYear() || now.getFullYear();
  } else if (clean.length === 8) {
    day = parseInt(clean.slice(0, 2), 10);
    month = parseInt(clean.slice(2, 4), 10);
    year = parseInt(clean.slice(4, 8), 10);
  } else {
    return null;
  }

  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (year < 1900 || year > 2100) return null;

  const daysInMonth = new Date(year, month, 0).getDate();
  if (day > daysInMonth) return null;

  const yyyy = String(year);
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');

  return `${yyyy}-${mm}-${dd}`;
}

function changeCustomDatePickerMonth(delta) {
  currentPickerDate.setMonth(currentPickerDate.getMonth() + delta);
  renderCustomDatePicker();
}

function selectCustomDatePickerToday() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  applyCustomDate(`${yyyy}-${mm}-${dd}`);
}

// ==========================================
// 4. PDF Import (Модалка и загрузка)
// ==========================================
// Управление информационным окном импорта PDF
function openPdfInfoModal(forceShow = false) {
  const showPdfInfo = Cache?.settings?.showPdfInfo !== undefined ? Cache.settings.showPdfInfo : true;
  if (!forceShow && !showPdfInfo) {
    triggerPdfFileInput();
    return;
  }
  const dlg = document.getElementById('pdf-info-dialog');
  if (dlg) {
    dlg.classList.remove('hidden');
    if (typeof renderBankIcons === 'function') renderBankIcons();
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
}

function closePdfInfoModal() {
  const dlg = document.getElementById('pdf-info-dialog');
  if (dlg) dlg.classList.add('hidden');
}

function triggerPdfFileInput() {
  closePdfInfoModal();
  const fileInput = document.getElementById('pdf-file-input');
  if (fileInput) fileInput.click();
}

function triggerPdfImportFromWizard() {
  window._returnToWizardStep = 2;
  openPdfInfoModal();
}

// ==========================================
// 5. Global Document Event Listeners
// ==========================================

// Инициализация кастомных дейтпикеров
document.addEventListener('DOMContentLoaded', setupCustomDatePickers);
setTimeout(setupCustomDatePickers, 500);

// При скролле страницы скрываются меню, календарь и всплывающие тултипы
window.addEventListener('scroll', () => {
  closeCardContextMenu();
  closeCustomDatePicker();
  hideAllChartTooltips();
}, { passive: true, capture: true });

// Перехват нативного календаря Android / iOS (Capture phase)
document.addEventListener('click', (e) => {
  const el = getEventTargetElement(e?.target);
  if (!el) return;
  const dateInput = el.closest('input[type="date"], input[data-datepicker]');
  if (dateInput) {
    e.preventDefault();
    e.stopPropagation();
    dateInput.readOnly = true;
    dateInput.setAttribute('inputmode', 'none');
    dateInput.blur();
    openCustomDatePicker(dateInput);
  }
}, true);

document.addEventListener('pointerdown', (e) => {
  const el = getEventTargetElement(e?.target);
  if (!el) return;
  const dateInput = el.closest('input[type="date"], input[data-datepicker]');
  if (dateInput) {
    dateInput.readOnly = true;
    dateInput.setAttribute('inputmode', 'none');
  }
}, true);

// Перехват кликов в capture-фазе: гарантированная блокировка действий при мультивыборе
document.addEventListener('click', (e) => {
  // 1. Подавление синтетического клика сразу после долгого нажатия
  if (suppressClick) {
    e.preventDefault();
    e.stopImmediatePropagation();
    suppressClick = false;
    return;
  }

  // 2. Блокировщик действий в режиме мультивыбора
  if (selectionMode) {
    const el = getEventTargetElement(e?.target);
    if (!el) return;

    // Клики по кнопкам самой панели мультивыбора, кастомным диалогам и модальным окнам не блокируем
    if (el.closest('#selection-panel, #custom-dialog, [id$="-dialog"], [id$="-modal"], .dialog, .modal')) {
      return;
    }

    // Клик по любой карточке сущности (транзакция, брокер, вклад, счет, цель)
    const card = el.closest('.card, [data-table]');
    if (card && card.dataset.id && card.dataset.table) {
      e.preventDefault();
      e.stopImmediatePropagation();
      toggleItemSelection(card.dataset.id, card.dataset.table);
      return;
    }

    // Блокируем любые сторонние клики по кнопкам, ссылкам и onclick при активном мультивыборе
    if (el.closest('button, a, [onclick], .cursor-pointer')) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }
}, true);

// Глобальный клик: мультиселект, закрытие меню и тултипов
document.addEventListener('click', (e) => {
  const el = getEventTargetElement(e?.target);
  if (!el) return;

  // 1. Кнопки плавающей панели мультивыбора
  if (el.id === 'cancel-selection' || el.closest('#cancel-selection')) {
    e.stopPropagation();
    cancelSelection();
    return;
  }
  if (el.id === 'delete-selected' || el.closest('#delete-selected')) {
    e.stopPropagation();
    deleteSelectedItems();
    return;
  }

  // 2. Закрытие контекстного мини-меню карточки при клике мимо
  if (activeContextCard && !el.closest('#card-context-menu') && !el.closest('.context-menu-btn')) {
    closeCardContextMenu();
  }

  // 5. Закрытие DatePicker при клике вне его
  const modal = document.getElementById('custom-datepicker-modal');
  const picker = document.getElementById('custom-datepicker');
  const isDatepickerOpen = (modal && !modal.classList.contains('hidden')) || (picker && !picker.classList.contains('hidden'));
  if (isDatepickerOpen) {
    if (!el.closest('#custom-datepicker') && !el.closest('input[type="date"]') && !el.closest('input[data-datepicker]') && !el.closest('#edit-tx-date-btn')) {
      closeCustomDatePicker();
    }
  }

  // Закрытие всех кастомных выпадающих меню при клике мимо (не закрывать при работе с дейтпикером)
  if (!el.closest('.custom-dropdown-wrap') && !el.closest('.custom-dropdown-menu') && !el.closest('#custom-datepicker') && !el.closest('#custom-datepicker-modal')) {
    document.querySelectorAll('.custom-dropdown-menu').forEach(m => m.classList.add('hidden'));
    document.querySelectorAll('.tx-item').forEach(r => r.style.zIndex = '');
  }

  // 6. Закрытие тултипов на графиках
  if (typeof hideAllChartTooltips === 'function') {
    hideAllChartTooltips(e);
  }

  // 7. Кнопки вызова категорий (если кликнули по ним)
  if (el.classList?.contains('manage-categories-btn')) {
    if (typeof showManageCategoriesDialog === 'function') showManageCategoriesDialog();
    return;
  }
  if (el.classList?.contains('add-category-btn')) {
    const row = el.closest('.tx-item');
    if (row && typeof showAddCategoryDialog === 'function') {
      const type = row.querySelector('.tx-type:checked')?.value || 'Расход';
      const select = row.querySelector('.tx-category');
      showAddCategoryDialog(type, select);
    }
    return;
  }
});

// Слушатели долгого нажатия и мыши для мультиселекта
document.addEventListener('touchstart', handleTouchStart, { passive: true });
document.addEventListener('touchend', handleTouchEnd);
document.addEventListener('touchmove', handleTouchMove, { passive: true });
document.addEventListener('mousedown', handleMouseDown);
document.addEventListener('mouseup', handleMouseUp);
document.addEventListener('mousemove', handleMouseMove);

// ==========================================
// Global Scope Exports
// ==========================================
window.enableSelectionMode = enableSelectionMode;
window.disableSelectionMode = disableSelectionMode;
window.isSelectionMode = () => selectionMode;
window.toggleItemSelection = toggleItemSelection;
window.deleteSelectedItems = deleteSelectedItems;
window.cancelSelection = cancelSelection;
window.startLongPress = startLongPress;
window.handleTouchStart = handleTouchStart;
window.handleTouchEnd = handleTouchEnd;
window.handleTouchMove = handleTouchMove;

window.openCardContextMenu = openCardContextMenu;
window.closeCardContextMenu = closeCardContextMenu;
window.hideAllChartTooltips = hideAllChartTooltips;

window.setupCustomDatePickers = setupCustomDatePickers;
window.openCustomDatePicker = openCustomDatePicker;
window.closeCustomDatePicker = closeCustomDatePicker;
window.renderCustomDatePicker = renderCustomDatePicker;
window.applyCustomDate = applyCustomDate;
window.formatManualDateInput = formatManualDateInput;
window.applyManualDateInput = applyManualDateInput;
window.handleManualDateKeydown = handleManualDateKeydown;
window.changeCustomDatePickerMonth = changeCustomDatePickerMonth;
window.selectCustomDatePickerToday = selectCustomDatePickerToday;

window.openPdfInfoModal = openPdfInfoModal;
window.closePdfInfoModal = closePdfInfoModal;
window.triggerPdfFileInput = triggerPdfFileInput;
window.triggerPdfImportFromWizard = triggerPdfImportFromWizard;
