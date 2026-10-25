/**
 * tx-categories.js
 * Category management dialogs, category selection menus, and icon pickers.
 */

// Category state
let currentCategoryType = 'Расход';
let currentCategorySelect = null;
let selectedCategoryIcon = 'package';

const availableIcons = [
  'shopping-cart',
  'utensils',
  'car',
  'home',
  'film',
  'package',
  'briefcase',
  'baby',
  'paw-print',
  'pill',
  'shopping-bag',
  'plane',
  'dumbbell',
  'gamepad-2',
  'book',
  'music',
  'gift',
  'coffee',
  'pizza',
  'shirt',
  'lightbulb',
  'wrench',
  'smartphone',
  'laptop',
  'monitor',
  'camera',
  'palette',
  'headphones',
  'target',
  'trophy',
  'bus',
  'train',
  'navigation',
  'zap',
  'bath',
  'sparkles',
  'archive',
  'leaf',
  'globe',
  'credit-card',
];

function showAddCategoryDialog(type, selectEl) {
  currentCategoryType = type === 'Доход' || type === 'income' ? 'Доход' : 'Расход';
  currentCategorySelect = selectEl || null;
  selectedCategoryIcon = 'package';
  const title = document.getElementById('category-dialog-title');
  if (title) title.innerText = `Новая категория (${currentCategoryType})`;
  const inp = document.getElementById('category-name-input');
  if (inp) {
    inp.value = '';
    setTimeout(() => inp.focus(), 80);
  }
  renderIconGrid();
  const dlg = document.getElementById('category-dialog');
  if (dlg) dlg.classList.remove('hidden');
}
window.showAddCategoryDialog = showAddCategoryDialog;

function renderIconGrid() {
  const grid = document.getElementById('category-icon-grid');
  if (!grid) return;

  grid.innerHTML = availableIcons
    .map(
      icon => `
    <button type="button" class="icon-option flex items-center justify-center h-[42px] rounded-xl transition-all border ${icon === selectedCategoryIcon ? 'bg-[#6C5DD3]/15 text-[#6C5DD3] border-[#6C5DD3]/30 scale-105 shadow-sm' : 'bg-[#181B24] border-[rgba(255,255,255,0.06)] text-[#848D99] hover:bg-[#212430]'}" data-icon="${icon}">
      <i data-lucide="${icon}" class="w-5 h-5"></i>
    </button>
  `
    )
    .join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();

  grid.querySelectorAll('.icon-option').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedCategoryIcon = btn.dataset.icon;
      grid.querySelectorAll('.icon-option').forEach(b => {
        b.classList.remove(
          'bg-[#6C5DD3]/15',
          'text-[#6C5DD3]',
          'border-[#6C5DD3]/30',
          'scale-105',
          'shadow-sm'
        );
        b.classList.add('bg-[#181B24]', 'border-[rgba(255,255,255,0.06)]', 'text-[#848D99]');
      });
      btn.classList.remove('bg-[#181B24]', 'border-[rgba(255,255,255,0.06)]', 'text-[#848D99]');
      btn.classList.add(
        'bg-[#6C5DD3]/15',
        'text-[#6C5DD3]',
        'border-[#6C5DD3]/30',
        'scale-105',
        'shadow-sm'
      );
    });
  });
}
window.renderIconGrid = renderIconGrid;

function showManageCategoriesDialog() {
  renderManageCategories();
  const dlg = document.getElementById('manage-categories-dialog');
  if (dlg) dlg.classList.remove('hidden');
}
window.showManageCategoriesDialog = showManageCategoriesDialog;

function renderManageCategories() {
  const container = document.getElementById('categories-list-container');
  if (!container || !Cache?.categories) return;

  const defaultCats = window.DEFAULT_SYSTEM_CATEGORIES || [];

  let html = `<p class="text-[11px] uppercase tracking-wider text-gray-500 font-bold mb-2">Расходы</p>`;
  (Cache.categories.expense || []).forEach(cat => {
    const isDefault = defaultCats.includes(cat.name);
    const iconName = cat.icon && cat.icon !== 'package' ? cat.icon : 'tag';
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
  (Cache.categories.income || []).forEach(cat => {
    const isDefault = defaultCats.includes(cat.name);
    const iconName = cat.icon && cat.icon !== 'package' ? cat.icon : 'tag';
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
window.renderManageCategories = renderManageCategories;

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
          const rowType = row.querySelector('.tx-type:checked')?.value;
          if (rowType === type) updateCategorySelect(select, type);
        }
      });
    } catch (_e) {
      showToast('Ошибка', true);
    }
  });
}
window.deleteCategory = deleteCategory;

function updateCategorySelect(containerOrRow, type) {
  if (!containerOrRow || !Cache || !Cache.categories) return;

  const row =
    typeof containerOrRow.closest === 'function'
      ? containerOrRow.closest('.tx-item') || containerOrRow
      : containerOrRow;
  if (!row || typeof row.querySelector !== 'function') return;

  const menu = row.querySelector('.tx-category-menu');
  const input = row.querySelector('.tx-category');
  const btn = row.querySelector('.tx-category-btn');
  const label = row.querySelector('.tx-category-label');

  if (!menu || !input || !btn || !label) return;

  const defaultCats = window.DEFAULT_SYSTEM_CATEGORIES || [];
  const cats = type === 'Доход' ? Cache.categories.income : Cache.categories.expense;

  let itemsHtml = (cats || [])
    .map(c => {
      const isCustom = !defaultCats.includes(c.name);
      const icon = c.icon && c.icon !== 'package' ? c.icon : 'tag';
      return `
      <div class="flex items-center justify-between hover:bg-[#212430] rounded-xl px-2.5 py-1.5 transition-colors group">
        <button type="button" class="flex-1 text-left text-[13px] font-medium text-gray-200 flex items-center gap-2.5 cursor-pointer truncate min-w-0" data-cat="${escapeHtml(c.name)}" data-icon="${icon}">
          <i data-lucide="${icon}" class="w-[18px] h-[18px] text-[#848D99]"></i>
          <span class="truncate">${escapeHtml(c.name)}</span>
        </button>
        ${
          isCustom
            ? `
          <button type="button" onclick="event.stopPropagation(); deleteCategory('${escapeHtml(c.name)}', '${type}')" class="text-gray-500 hover:text-[#FF453A] p-1.5 flex-shrink-0 cursor-pointer"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
        `
            : ''
        }
      </div>
    `;
    })
    .join('');

  itemsHtml += `
    <div class="border-t border-[rgba(255,255,255,0.06)] pt-1 mt-1">
      <button type="button" class="btn-add-cat-in-menu w-full text-left px-2.5 py-1.5 text-xs text-[#8C7DFF] hover:text-white hover:bg-[#6C5DD3]/15 rounded-lg flex items-center gap-1.5 font-semibold cursor-pointer transition-colors">
        <i data-lucide="plus" class="w-3.5 h-3.5"></i>
        <span>Добавить категорию</span>
      </button>
    </div>
  `;

  menu.innerHTML = itemsHtml;
  if (typeof lucide !== 'undefined') lucide.createIcons();

  btn.onclick = e => {
    e.stopPropagation();
    const isClosed = menu.classList.contains('hidden');

    document.querySelectorAll('.custom-dropdown-menu').forEach(m => m.classList.add('hidden'));
    document.querySelectorAll('.tx-item').forEach(r => (r.style.zIndex = ''));

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
    itemBtn.onclick = e => {
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
    addBtn.onclick = e => {
      e.stopPropagation();
      menu.classList.add('hidden');
      row.style.zIndex = '';
      showAddCategoryDialog(type, row);
    };
  }
}
window.updateCategorySelect = updateCategorySelect;

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
window.smartPositionDropdown = smartPositionDropdown;

function closeAddCategoryDialog() {
  document.getElementById('category-dialog')?.classList.add('hidden');
  currentCategorySelect = null;
}
window.closeAddCategoryDialog = closeAddCategoryDialog;

function closeManageCategoriesDialog() {
  document.getElementById('manage-categories-dialog')?.classList.add('hidden');
  if (window._returnToProfile) {
    window._returnToProfile = false;
    if (typeof openProfileModal === 'function') openProfileModal();
  }
}
window.closeManageCategoriesDialog = closeManageCategoriesDialog;

async function submitAddCategoryDialog() {
  const btn = document.getElementById('category-save-btn');
  const inp = document.getElementById('category-name-input');
  const name = inp ? inp.value.trim() : '';
  if (!name) {
    if (typeof showToast === 'function') showToast('Введите название категории', true);
    return;
  }

  const existing =
    currentCategoryType === 'Доход' ? Cache?.categories?.income : Cache?.categories?.expense;
  if ((existing || []).some(c => c.name.toLowerCase() === name.toLowerCase())) {
    if (typeof showToast === 'function') showToast('Такая категория уже есть', true);
    return;
  }

  const originalText = btn ? btn.innerText : 'Создать';
  if (btn) {
    btn.disabled = true;
    btn.innerText = 'Сохранение...';
  }

  try {
    const col = getUserCol('Categories');
    const newCategoryData = {
      name,
      type: currentCategoryType,
      icon: selectedCategoryIcon || 'package',
      createdAt: Date.now(),
    };
    const docRef = await col.add(newCategoryData);

    const newCatObj = { id: docRef.id, ...newCategoryData };
    if (!Cache.categories) Cache.categories = { expense: [], income: [] };
    if (currentCategoryType === 'Доход') {
      Cache.categories.income.push(newCatObj);
    } else {
      Cache.categories.expense.push(newCatObj);
    }

    if (currentCategorySelect) {
      updateCategorySelect(currentCategorySelect, currentCategoryType);
      const input = currentCategorySelect.querySelector('.tx-category');
      const label = currentCategorySelect.querySelector('.tx-category-label');
      if (input && label) {
        input.value = name;
        label.innerHTML = `<span class="inline-flex items-center gap-1.5 text-xs text-gray-200 font-normal truncate min-w-0"><i data-lucide="${newCatObj.icon}" class="w-3.5 h-3.5 text-[#848D99] flex-shrink-0"></i><span class="truncate">${escapeHtml(name)}</span></span>`;
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }
    }

    if (
      typeof renderManageCategories === 'function' &&
      document.getElementById('manage-categories-dialog') &&
      !document.getElementById('manage-categories-dialog').classList.contains('hidden')
    ) {
      renderManageCategories();
    }
    if (
      typeof openAddCategoryLimitPicker === 'function' &&
      document.getElementById('add-cat-limit-picker-dialog') &&
      !document.getElementById('add-cat-limit-picker-dialog').classList.contains('hidden')
    ) {
      openAddCategoryLimitPicker();
    }

    closeAddCategoryDialog();
    if (typeof showToast === 'function') showToast(`Категория «${name}» добавлена`);

    if (typeof fetchCollection === 'function') {
      fetchCollection('Categories').catch(() => {});
    }
  } catch (err) {
    if (typeof showToast === 'function')
      showToast('Ошибка при создании категории: ' + err.message, true);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerText = originalText;
    }
  }
}
window.submitAddCategoryDialog = submitAddCategoryDialog;
