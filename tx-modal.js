/**
 * tx-modal.js
 * Transaction creation and editing modal dialogs, multi-row split receipts,
 * amortized/one-time expenses, and smart category suggestion rules.
 */

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

  row.addEventListener(
    'transitionend',
    e => {
      if (e.propertyName === 'max-height') {
        cleanup();
      }
    },
    { once: true }
  );

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
    input.addEventListener('change', e => {
      const select = row.querySelector('.tx-category');
      updateCategorySelect(select, e.target.value);
      const amountInp = row.querySelector('.tx-amount');
      if (amountInp) handleInlineTxAmountChange(amountInp);
    });
  });

  const currentType = row.querySelector('.tx-type:checked').value;
  const select = row.querySelector('.tx-category');
  updateCategorySelect(select, currentType);

  if (prevRow && prevType === currentType) {
    const prevCat = prevRow.querySelector('.tx-category').value;
    if (prevCat) {
      select.value = prevCat;
      const catList =
        currentType === 'Доход' ? Cache.categories?.income || [] : Cache.categories?.expense || [];
      const foundCat = catList.find(c => c.name === prevCat);
      const icon = foundCat && foundCat.icon && foundCat.icon !== 'package' ? foundCat.icon : 'tag';
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

  const activeGoals = (Cache?.goals || []).filter(
    g => g.status !== 'Выполнена' || (parseFloat(g.saved) || 0) > 0
  );
  if (activeGoals.length > 0) {
    selectInlineTxGoal(row, activeGoals[0].id);
  } else {
    selectInlineTxGoal(row, '');
  }

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

function handleInlineTxAmountChange(inputEl) {
  if (!inputEl) return;
  const row = inputEl.closest('.tx-item');
  if (!row) return;

  const amount = getUnformattedVal(inputEl) || 0;
  const type = row.querySelector('.tx-type:checked')?.value || 'Расход';
  const isExp = type === 'Расход';

  const amortizeWrap = row.querySelector('.inline-tx-amortize-wrap');
  const noticeEl = row.querySelector('.inline-tx-large-notice');
  const badgeEl = row.querySelector('.inline-tx-large-badge');
  const titleEl = row.querySelector('.inline-tx-amortize-title');
  const cb = row.querySelector('.tx-exclude-budget');

  if (!amortizeWrap) return;

  if (!isExp) {
    amortizeWrap.classList.add('hidden');
    return;
  }

  const details =
    typeof getLargeExpenseThresholdDetails === 'function'
      ? getLargeExpenseThresholdDetails()
      : { threshold: 10000, isDynamic: false, reason: 'базовый порог' };
  const threshold = details.threshold;
  const isLarge = isFinite(threshold) && threshold > 0 && amount >= threshold;
  const isChecked = cb && cb.checked;

  if (amount > 0 || isChecked) {
    amortizeWrap.classList.remove('hidden');

    if (isLarge) {
      if (noticeEl) {
        noticeEl.classList.remove('hidden');
        noticeEl.classList.add('flex');
      }
      if (badgeEl && typeof formatMoney === 'function') {
        badgeEl.innerText = `Крупная трата (от ${formatMoney(threshold)})`;
      }
      if (titleEl) titleEl.innerText = 'Сделать разовой тратой?';
      amortizeWrap.classList.add('border-violet-500/35', 'bg-violet-950/20');
      amortizeWrap.classList.remove('border-[rgba(255,255,255,0.06)]', 'bg-[#181B24]');
    } else {
      if (noticeEl) {
        noticeEl.classList.add('hidden');
        noticeEl.classList.remove('flex');
      }
      if (titleEl) titleEl.innerText = 'Сделать разовой тратой';
      amortizeWrap.classList.remove('border-violet-500/35', 'bg-violet-950/20');
      amortizeWrap.classList.add('border-[rgba(255,255,255,0.06)]', 'bg-[#181B24]');
    }
    if (typeof lucide !== 'undefined') lucide.createIcons({ root: amortizeWrap });
  } else {
    amortizeWrap.classList.add('hidden');
  }

  updateInlineTxGoalRemaining(row);
}
window.handleInlineTxAmountChange = handleInlineTxAmountChange;

function toggleInlineTxAmortizeHelp(btn) {
  if (!btn) return;
  const row = btn.closest('.tx-item');
  if (!row) return;
  const helpEl = row.querySelector('.inline-tx-amortize-help');
  if (helpEl) {
    helpEl.classList.toggle('hidden');
  }
}
window.toggleInlineTxAmortizeHelp = toggleInlineTxAmortizeHelp;

function toggleInlineTxAmortize(cb) {
  if (!cb) return;
  const row = cb.closest('.tx-item');
  if (!row) return;
  const details = row.querySelector('.inline-tx-amortize-details');
  if (details) {
    if (cb.checked) {
      const activeGoals = (Cache?.goals || []).filter(
        g => g.status !== 'Выполнена' || (parseFloat(g.saved) || 0) > 0
      );
      if (activeGoals.length === 0) {
        cb.checked = false;
        showToast('Для разовой траты нужна финансовая цель. Создайте цель во вкладке «Цели»', true);
        return;
      }
      details.classList.remove('hidden');
      const curGoalId = row.querySelector('.tx-goal-id')?.value;
      if (!curGoalId || !activeGoals.some(g => g.id === curGoalId)) {
        selectInlineTxGoal(row, activeGoals[0].id);
      } else {
        updateInlineTxGoalRemaining(row);
      }
    } else {
      details.classList.add('hidden');
      const menu = row.querySelector('.tx-goal-menu');
      if (menu) menu.classList.add('hidden');
      row.style.zIndex = '';
    }
  }
}
window.toggleInlineTxAmortize = toggleInlineTxAmortize;

function renderInlineTxGoalMenu(row) {
  if (!row) return;
  const menu = row.querySelector('.tx-goal-menu');
  if (!menu) return;

  const currentGoalId = row.querySelector('.tx-goal-id')?.value;
  const activeGoals = (Cache?.goals || []).filter(
    g => g.status !== 'Выполнена' || (parseFloat(g.saved) || 0) > 0
  );

  if (activeGoals.length === 0) {
    menu.innerHTML = `
      <div class="p-3 text-center text-xs text-gray-400 space-y-1">
        <div>Нет активных финансовых целей</div>
        <button type="button" onclick="switchTab('deposits')" class="text-[#8C7DFF] hover:underline text-[11px] font-semibold cursor-pointer">
          + Создать цель во вкладке «Цели»
        </button>
      </div>
    `;
    return;
  }

  const html = activeGoals
    .map(g => {
      const saved = parseFloat(g.saved) || 0;
      const isSelected = g.id === currentGoalId;
      return `
      <button type="button" 
              onclick="selectInlineTxGoal(this, '${g.id}')" 
              class="w-full text-left px-2.5 py-2 text-xs rounded-xl hover:bg-[#212430] transition-colors flex items-center justify-between cursor-pointer group ${isSelected ? 'bg-[#6C5DD3]/20 border border-[#6C5DD3]/30' : ''}">
        <div class="min-w-0 pr-2">
          <div class="font-semibold text-gray-200 truncate group-hover:text-white">${escapeHtml(g.name || g.title || 'Цель')}</div>
          <div class="text-[10px] text-[#848D99]">Накоплено: <span class="text-amber-300 font-mono font-medium">${formatMoney(saved)}</span></div>
        </div>
        <i data-lucide="target" class="w-4 h-4 text-amber-400 flex-shrink-0"></i>
      </button>
    `;
    })
    .join('');

  menu.innerHTML = html;
  if (typeof lucide !== 'undefined') lucide.createIcons({ root: menu });
}
window.renderInlineTxGoalMenu = renderInlineTxGoalMenu;

function toggleInlineTxGoalMenu(triggerBtn, event) {
  if (event) event.stopPropagation();
  if (!triggerBtn) return;
  const row = triggerBtn.closest('.tx-item');
  if (!row) return;
  const menu = row.querySelector('.tx-goal-menu');
  if (!menu) return;

  const isClosed = menu.classList.contains('hidden');
  document.querySelectorAll('.custom-dropdown-menu').forEach(m => m.classList.add('hidden'));
  document.querySelectorAll('.tx-item').forEach(r => (r.style.zIndex = ''));

  if (isClosed) {
    row.style.zIndex = '50';
    renderInlineTxGoalMenu(row);
    if (typeof smartPositionDropdown === 'function') {
      smartPositionDropdown(menu, triggerBtn);
    }
    menu.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons({ root: menu });
  } else {
    row.style.zIndex = '';
  }
}
window.toggleInlineTxGoalMenu = toggleInlineTxGoalMenu;

function selectInlineTxGoal(targetEl, goalId) {
  if (!targetEl) return;
  const row = targetEl.closest('.tx-item') || targetEl;
  if (!row) return;

  const input = row.querySelector('.tx-goal-id');
  const label = row.querySelector('.tx-goal-label');
  const menu = row.querySelector('.tx-goal-menu');
  if (menu) menu.classList.add('hidden');
  row.style.zIndex = '';

  const activeGoals = (Cache?.goals || []).filter(
    g => g.status !== 'Выполнена' || (parseFloat(g.saved) || 0) > 0
  );
  const goal = goalId ? (Cache?.goals || []).find(g => g.id === goalId) : activeGoals[0] || null;

  if (goal) {
    const goalTitle = goal.name || goal.title || 'Цель';
    const saved = parseFloat(goal.saved) || 0;
    if (input) input.value = goal.id;
    if (label) {
      label.innerHTML = `
        <i data-lucide="target" class="w-3.5 h-3.5 text-amber-400 flex-shrink-0"></i>
        <span class="truncate font-semibold text-white">${escapeHtml(goalTitle)}</span>
        <span class="text-[10px] font-mono text-amber-300 ml-1">(${formatMoney(saved)})</span>
      `;
    }
  } else {
    if (input) input.value = '';
    if (label) {
      label.innerHTML = `
        <i data-lucide="target" class="w-3.5 h-3.5 text-gray-400 flex-shrink-0"></i>
        <span class="truncate font-medium text-gray-400">Выберите цель</span>
      `;
    }
  }
  if (typeof lucide !== 'undefined' && label) lucide.createIcons({ root: label });
  updateInlineTxGoalRemaining(row);
}
window.selectInlineTxGoal = selectInlineTxGoal;

function updateInlineTxGoalRemaining(row) {
  if (!row) return;
  const goalId = row.querySelector('.tx-goal-id')?.value;
  const amount = getUnformattedVal(row.querySelector('.tx-amount')) || 0;
  const remBox = row.querySelector('.inline-tx-goal-remaining');
  const remVal = row.querySelector('.inline-tx-goal-remaining-val');
  if (!remBox || !remVal) return;

  const goal = (Cache?.goals || []).find(g => g.id === goalId);
  if (goal && amount > 0) {
    const curSaved = parseFloat(goal.saved) || 0;
    const remaining = Math.max(0, curSaved - amount);
    remBox.classList.remove('hidden');
    remBox.classList.add('flex');
    remVal.innerText = formatMoney(remaining);
    remVal.className = `inline-tx-goal-remaining-val font-mono font-bold ${curSaved < amount ? 'text-amber-400' : 'text-emerald-400'}`;
  } else {
    remBox.classList.add('hidden');
    remBox.classList.remove('flex');
  }
}
window.updateInlineTxGoalRemaining = updateInlineTxGoalRemaining;

// Legacy alias for compatibility
function handleInlineTxGoalChange(selectEl) {
  if (!selectEl) return;
  const row = selectEl.closest('.tx-item');
  if (row) updateInlineTxGoalRemaining(row);
}
window.handleInlineTxGoalChange = handleInlineTxGoalChange;

function changeInlineTxSpreadMonths(btn, delta) {}
window.changeInlineTxSpreadMonths = changeInlineTxSpreadMonths;

function updateInlineTxSpreadPreview(row) {}
window.updateInlineTxSpreadPreview = updateInlineTxSpreadPreview;

function submitTransactions(e) {
  e.preventDefault();
  const rows = document.querySelectorAll('.tx-item');
  if (rows.length === 0) return showDialog('Ошибка', 'Добавьте хотя бы одну операцию', false);

  // Проверяем обязательность выбора цели для разовых трат
  for (const row of rows) {
    const type = row.querySelector('.tx-type:checked')?.value || 'Расход';
    const amortizeCb = row.querySelector('.tx-exclude-budget');
    const isExcluded = type === 'Расход' && (amortizeCb ? amortizeCb.checked : false);
    if (isExcluded) {
      const goalId = row.querySelector('.tx-goal-id')?.value;
      const targetGoal = goalId ? (Cache?.goals || []).find(g => g.id === goalId) : null;
      if (!targetGoal) {
        showDialog(
          'Выберите цель',
          'Для разовой траты необходимо выбрать цель, из которой будет списана сумма',
          false
        );
        return;
      }
    }
  }

  const userProfile =
    typeof getCurrentUserProfile === 'function'
      ? getCurrentUserProfile()
      : Cache?.userProfile || { displayName: 'Пользователь', avatarId: 'user' };
  const authorInfo = {
    uid: auth?.currentUser?.uid || '',
    name: userProfile.displayName,
    avatarId: userProfile.avatarId || 'user',
  };

  const txData = Array.from(rows).map(row => {
    const type = row.querySelector('.tx-type:checked').value;
    const amount = getUnformattedVal(row.querySelector('.tx-amount'));
    const date = row.querySelector('.tx-date').value;
    const category = row.querySelector('.tx-category').value;
    const comment = row.querySelector('.tx-comment').value;
    const amortizeCb = row.querySelector('.tx-exclude-budget');
    const isExcluded = type === 'Расход' && (amortizeCb ? amortizeCb.checked : false);
    const goalId = isExcluded ? row.querySelector('.tx-goal-id')?.value || null : null;
    const targetGoal = goalId ? (Cache?.goals || []).find(g => g.id === goalId) : null;
    const fundingGoalName = targetGoal ? targetGoal.name || targetGoal.title || 'Цель' : '';

    if (isExcluded && goalId && targetGoal && typeof adjustGoalSaved === 'function') {
      adjustGoalSaved(goalId, -amount).catch(err => console.error(err));
    }

    return {
      type,
      amount,
      date,
      category,
      comment,
      author: authorInfo,
      excludeFromBudget: isExcluded,
      billType: isExcluded ? 'onetime' : '',
      fundingGoalId: isExcluded ? goalId || null : null,
      fundingGoalName: isExcluded ? fundingGoalName : '',
      fundingGoalAmount: isExcluded && goalId ? parseFloat(amount) || 0 : 0,
      spreadMonths: 1,
    };
  });
  submitAction('tx-submit-btn', 'Transactions', txData);
}

// ==========================================
// 3.2. Умные правила автокатегоризации (Smart Rules)
// ==========================================
function handleTxRowCommentInput(inputEl) {
  if (!inputEl) return;
  const row = inputEl.closest('.tx-item');
  if (!row) return;

  const val = inputEl.value.trim();
  if (val.length < 2) return;

  const type = row.querySelector('.tx-type:checked')?.value || 'Расход';
  const catInput = row.querySelector('.tx-category');
  const catLabel = row.querySelector('.tx-category-label');
  if (!catInput || !catLabel) return;

  if (
    typeof window.StatementCategorizer !== 'undefined' &&
    typeof window.StatementCategorizer.categorize === 'function'
  ) {
    const guessed = window.StatementCategorizer.categorize(val, '', type);
    if (guessed && guessed !== 'Другое' && (!catInput.value || catInput.value === 'Другое')) {
      catInput.value = guessed;
      const catArr =
        type === 'Доход' ? Cache?.categories?.income || [] : Cache?.categories?.expense || [];
      const match = catArr.find(c => (typeof c === 'string' ? c : c?.name) === guessed);
      const icon =
        match && typeof match === 'object' && match.icon && match.icon !== 'package'
          ? match.icon
          : typeof getCategoryIcon === 'function'
            ? getCategoryIcon(guessed)
            : 'tag';
      catLabel.innerHTML = `<span class="inline-flex items-center gap-1.5 text-xs text-gray-200 font-normal truncate min-w-0"><i data-lucide="${icon}" class="w-3.5 h-3.5 text-[#8C7DFF] flex-shrink-0"></i><span class="truncate">${escapeHtml(guessed)}</span></span>`;
      catLabel.classList.remove('text-gray-400', 'text-white');
      catLabel.classList.add('text-gray-200');
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  }
}

function handleEditTxCommentInput(inputEl) {
  if (!inputEl) return;
  const val = inputEl.value.trim();
  if (val.length < 2) return;

  const type = document.getElementById('edit-tx-type')?.value || 'Расход';
  const currentCat = document.getElementById('edit-tx-category')?.value;

  if (
    typeof window.StatementCategorizer !== 'undefined' &&
    typeof window.StatementCategorizer.categorize === 'function'
  ) {
    const guessed = window.StatementCategorizer.categorize(val, '', type);
    if (guessed && guessed !== 'Другое' && (!currentCat || currentCat === 'Другое')) {
      const catArr =
        type === 'Доход' ? Cache?.categories?.income || [] : Cache?.categories?.expense || [];
      const match = catArr.find(c => (typeof c === 'string' ? c : c?.name) === guessed);
      const icon =
        match && typeof match === 'object' && match.icon && match.icon !== 'package'
          ? match.icon
          : typeof getCategoryIcon === 'function'
            ? getCategoryIcon(guessed)
            : 'tag';
      selectEditTxCategory(guessed, icon);
    }
  }
}

function learnMerchantCategory(merchant, category, type) {
  if (
    !merchant ||
    !category ||
    category === 'Другое' ||
    category === 'Категория...' ||
    !window.StatementCategorizer
  )
    return;
  const clean = merchant.trim();
  if (clean.length < 2) return;

  const norm = window.StatementCategorizer.normalize(clean);
  if (!norm) return;

  if (!window.Cache) window.Cache = {};
  if (!window.Cache.categoryRules) window.Cache.categoryRules = [];

  const existingIdx = window.Cache.categoryRules.findIndex(
    r => window.StatementCategorizer.normalize(r.pattern) === norm
  );
  if (existingIdx >= 0) {
    window.Cache.categoryRules[existingIdx].category = category;
  } else {
    const newRule = {
      id: 'rule_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      pattern: clean,
      category: category,
      isSystem: false,
    };
    window.Cache.categoryRules.push(newRule);
    try {
      if (typeof getUserCol === 'function' && typeof auth !== 'undefined' && auth.currentUser) {
        getUserCol('CategoryRules').add({
          pattern: clean,
          category: category,
          updatedAt: Date.now(),
        });
      }
    } catch (e) {
      console.warn('Could not persist category rule', e);
    }
  }
}

// Открытие модального окна добавления правила из строки добавления транзакции
function openRememberRuleForTxRow(btn) {
  if (!btn) return;
  const row = btn.closest('.tx-row') || btn.closest('.tx-item');
  if (!row) return;

  const commentInput = row.querySelector('.tx-comment');
  const catInput = row.querySelector('.tx-category');
  const typeBtn = row.querySelector('.tx-type-btn.active');
  const typeRadio = row.querySelector('.tx-type:checked');

  const comment = commentInput ? commentInput.value.trim() : '';
  const category = catInput ? catInput.value : '';
  const type = typeBtn ? typeBtn.innerText.trim() : typeRadio ? typeRadio.value : 'Расход';

  if (typeof window.openRememberRuleCustom === 'function') {
    window.openRememberRuleCustom(comment, category, type, (savedKeyword, savedCategory) => {
      // Подставляем категорию в текущую строку операции
      if (catInput) {
        catInput.value = savedCategory;
        const catLabel = row.querySelector('.tx-category-label');
        if (catLabel) {
          const icon =
            typeof getCategoryIcon === 'function' ? getCategoryIcon(savedCategory) : 'tag';
          catLabel.innerHTML = `<span class="inline-flex items-center gap-1.5 text-xs text-gray-200 font-normal truncate min-w-0"><i data-lucide="${icon}" class="w-3.5 h-3.5 text-[#8C7DFF] flex-shrink-0"></i><span class="truncate">${escapeHtml(savedCategory)}</span></span>`;
          catLabel.classList.remove('text-gray-400', 'text-white');
          catLabel.classList.add('text-gray-200');
          if (typeof lucide !== 'undefined') lucide.createIcons();
        }
      }
    });
  } else if (typeof openRememberRuleModal === 'function') {
    openRememberRuleModal();
  }
}

// Открытие модального окна добавления правила из формы редактирования транзакции
function openRememberRuleForEditTx() {
  const commentInput = document.getElementById('edit-tx-comment');
  const catInput = document.getElementById('edit-tx-category');
  const typeInput = document.getElementById('edit-tx-type');

  const comment = commentInput ? commentInput.value.trim() : '';
  const category = catInput ? catInput.value : '';
  const type = typeInput ? typeInput.value : 'Расход';

  if (typeof window.openRememberRuleCustom === 'function') {
    window.openRememberRuleCustom(comment, category, type, (savedKeyword, savedCategory) => {
      if (typeof selectEditTxCategory === 'function') {
        const icon = typeof getCategoryIcon === 'function' ? getCategoryIcon(savedCategory) : 'tag';
        selectEditTxCategory(savedCategory, icon);
      }
    });
  } else if (typeof openRememberRuleModal === 'function') {
    openRememberRuleModal();
  }
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
    if (initData.billName) {
      subtitleEl.innerText = `Счет: «${initData.billName}»`;
      subtitleEl.classList.remove('hidden');
    } else {
      subtitleEl.innerText = '';
      subtitleEl.classList.add('hidden');
    }
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
    targetDate =
      (typeof parseAnyDate === 'function' ? parseAnyDate(targetDate) : new Date(targetDate)) ||
      new Date();
  }
  const formattedDate =
    typeof formatDateStr === 'function' ? formatDateStr(targetDate, 'dd.MM.yyyy') : '';
  const dateInput = document.getElementById('edit-tx-date');
  const dateLabel = document.getElementById('edit-tx-date-label');
  if (dateInput) dateInput.value = formattedDate;
  if (dateLabel) dateLabel.innerText = formattedDate;

  document.getElementById('edit-tx-comment').value = initData.comment || initData.billName || '';

  // Категория изначально не задана, если не передана явно
  if (initData.category) {
    const catArr =
      type === 'Доход' ? Cache?.categories?.income || [] : Cache?.categories?.expense || [];
    const foundCat = catArr.find(c => c.name === initData.category);
    const icon = foundCat && foundCat.icon && foundCat.icon !== 'package' ? foundCat.icon : 'tag';
    selectEditTxCategory(initData.category, icon);
  } else {
    selectEditTxCategory('', 'tag');
  }

  const amortizeWrap = document.getElementById('wrap-edit-tx-amortize');
  const amortizeCb = document.getElementById('edit-tx-exclude-budget');
  const amortizeDetails = document.getElementById('edit-tx-amortize-details');

  const isExp = type === 'Расход';
  if (amortizeWrap) {
    if (isExp) {
      amortizeWrap.classList.remove('hidden');
    } else {
      amortizeWrap.classList.add('hidden');
    }
  }

  const isOneTimeBill = initData.billType === 'onetime' || initData.billType === 'Разовый';
  const isExcluded =
    initData.excludeFromBudget !== undefined
      ? !!initData.excludeFromBudget
      : !!initData.isBillPayment || isOneTimeBill;
  if (amortizeCb) amortizeCb.checked = isExcluded;
  if (amortizeDetails) {
    if (isExcluded && (!initData.isBillPayment || isOneTimeBill)) {
      amortizeDetails.classList.remove('hidden');
    } else {
      amortizeDetails.classList.add('hidden');
    }
  }

  const activeGoals = (Cache?.goals || []).filter(
    g => g.status !== 'Выполнена' || (parseFloat(g.saved) || 0) > 0
  );
  const targetGoalId =
    initData.fundingGoalId || activeGoals[0]?.id || (Cache?.goals || [])[0]?.id || '';
  if (typeof selectEditTxGoal === 'function') selectEditTxGoal(targetGoalId);
  if (typeof handleEditTxAmountChange === 'function') handleEditTxAmountChange();

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
  if (subtitleEl) {
    if (tx.billName) {
      subtitleEl.innerText = `Счет: «${tx.billName}»`;
      subtitleEl.classList.remove('hidden');
    } else {
      subtitleEl.innerText = '';
      subtitleEl.classList.add('hidden');
    }
  }
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
  const formattedDate =
    typeof formatDateStr === 'function' ? formatDateStr(parsedDate, 'dd.MM.yyyy') : rawDate;
  const dateInput = document.getElementById('edit-tx-date');
  const dateLabel = document.getElementById('edit-tx-date-label');
  if (dateInput) dateInput.value = formattedDate;
  if (dateLabel) dateLabel.innerText = formattedDate;

  document.getElementById('edit-tx-comment').value =
    tx.comment && tx.comment !== 'undefined' ? tx.comment : tx.description || tx.merchant || '';

  const catArr =
    tx.type === 'Доход' ? Cache?.categories?.income || [] : Cache?.categories?.expense || [];
  const foundCat = catArr.find(c => c.name === tx.category);
  const icon = foundCat && foundCat.icon && foundCat.icon !== 'package' ? foundCat.icon : 'tag';
  selectEditTxCategory(tx.category || '', icon);

  // Настройка опции исключения и списания из цели
  const amortizeWrap = document.getElementById('wrap-edit-tx-amortize');
  const amortizeCb = document.getElementById('edit-tx-exclude-budget');
  const amortizeDetails = document.getElementById('edit-tx-amortize-details');

  const isExp = tx.type === 'Расход' || tx.type === 'expense';
  if (amortizeWrap) {
    if (isExp) {
      amortizeWrap.classList.remove('hidden');
    } else {
      amortizeWrap.classList.add('hidden');
    }
  }

  const isOneTimeTx =
    tx.billType === 'onetime' ||
    !!tx.fundingGoalId ||
    (!tx.isBillPayment && !!tx.excludeFromBudget);
  const isExcluded = !!(tx.excludeFromBudget || tx.isExcludedFromBudget);
  if (amortizeCb) amortizeCb.checked = isExcluded;
  if (amortizeDetails) {
    if (isExcluded && (!tx.isBillPayment || isOneTimeTx)) {
      amortizeDetails.classList.remove('hidden');
    } else {
      amortizeDetails.classList.add('hidden');
    }
  }

  const activeGoals = (Cache?.goals || []).filter(
    g => g.status !== 'Выполнена' || (parseFloat(g.saved) || 0) > 0
  );
  const targetGoalId = tx.fundingGoalId || activeGoals[0]?.id || (Cache?.goals || [])[0]?.id || '';
  selectEditTxGoal(targetGoalId);
  handleEditTxAmountChange();

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
    btnExp.className =
      'flex-1 py-2 text-xs font-semibold rounded-xl transition-all text-white bg-[#FF453A]/20 border border-[#FF453A]/30 cursor-pointer shadow-sm';
    btnInc.className =
      'flex-1 py-2 text-xs font-semibold rounded-xl transition-all text-gray-400 hover:text-white border border-transparent cursor-pointer';
    handleEditTxAmountChange();
  } else {
    btnExp.className =
      'flex-1 py-2 text-xs font-semibold rounded-xl transition-all text-gray-400 hover:text-white border border-transparent cursor-pointer';
    btnInc.className =
      'flex-1 py-2 text-xs font-semibold rounded-xl transition-all text-white bg-[#30D158]/20 border border-[#30D158]/30 cursor-pointer shadow-sm';
    document.getElementById('wrap-edit-tx-amortize')?.classList.add('hidden');
    const amortizeCb = document.getElementById('edit-tx-exclude-budget');
    if (amortizeCb) amortizeCb.checked = false;
    document.getElementById('edit-tx-amortize-details')?.classList.add('hidden');
  }

  renderEditTxCategories();
  const catArr =
    type === 'Доход' ? Cache?.categories?.income || [] : Cache?.categories?.expense || [];
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

  const cats = type === 'Доход' ? Cache.categories.income || [] : Cache.categories.expense || [];

  let itemsHtml = cats
    .map(c => {
      const isCustom = !DEFAULT_SYSTEM_CATEGORIES.includes(c.name);
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
          <button type="button" onclick="event.stopPropagation(); deleteCategory('${escapeHtml(c.name)}', '${type}')" class="text-gray-500 hover:text-[#FF453A] p-1.5 flex-shrink-0 cursor-pointer" title="Удалить категорию"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
        `
            : ''
        }
      </div>
    `;
    })
    .join('');

  itemsHtml += `
    <div class="border-t border-[rgba(255,255,255,0.06)] pt-1 mt-1">
      <button type="button" class="btn-add-cat-in-edit-modal w-full text-left px-2.5 py-1.5 text-xs text-[#8C7DFF] hover:text-white hover:bg-[#6C5DD3]/15 rounded-lg flex items-center gap-1.5 font-semibold cursor-pointer transition-colors">
        <i data-lucide="plus" class="w-3.5 h-3.5"></i>
        <span>Добавить категорию</span>
      </button>
    </div>
  `;

  menu.innerHTML = itemsHtml;
  if (typeof lucide !== 'undefined') lucide.createIcons();

  menu.querySelectorAll('button[data-cat]').forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation();
      selectEditTxCategory(btn.dataset.cat, btn.dataset.icon);
    };
  });

  const addBtn = menu.querySelector('.btn-add-cat-in-edit-modal');
  if (addBtn) {
    addBtn.onclick = e => {
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
    const icon = iconName && iconName !== 'package' ? iconName : 'tag';
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
  const btn = document.getElementById('edit-tx-category-btn');
  if (!menu) return;
  const isClosed = menu.classList.contains('hidden');
  document.querySelectorAll('.custom-dropdown-menu').forEach(m => m.classList.add('hidden'));
  if (isClosed) {
    renderEditTxCategories();
    if (btn && typeof smartPositionDropdown === 'function') {
      smartPositionDropdown(menu, btn);
    }
    menu.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
}

function toggleTxAmortizeHelp() {
  const helpEl = document.getElementById('edit-tx-amortize-help');
  if (helpEl) {
    helpEl.classList.toggle('hidden');
  }
}
window.toggleTxAmortizeHelp = toggleTxAmortizeHelp;

function handleEditTxAmountChange() {
  const amount = getUnformattedVal(document.getElementById('edit-tx-amount')) || 0;
  const type = document.getElementById('edit-tx-type')?.value || 'Расход';
  const isExp = type === 'Расход' || type === 'expense';
  const isBill =
    document.getElementById('edit-tx-is-bill-payment')?.value === 'true' ||
    !!document.getElementById('edit-tx-bill-id')?.value;
  const amortizeWrap = document.getElementById('wrap-edit-tx-amortize');
  const noticeEl = document.getElementById('edit-tx-large-notice');
  const badgeEl = document.getElementById('edit-tx-large-threshold-badge');
  const titleEl = document.getElementById('edit-tx-amortize-title');
  const descEl = document.getElementById('edit-tx-amortize-desc');
  const cb = document.getElementById('edit-tx-exclude-budget');
  const hasExistingId = !!document.getElementById('edit-tx-id')?.value;

  if (!amortizeWrap) return;

  if (!isExp || isBill) {
    amortizeWrap.classList.add('hidden');
    return;
  }

  const details =
    typeof getLargeExpenseThresholdDetails === 'function'
      ? getLargeExpenseThresholdDetails()
      : { threshold: 10000, isDynamic: false, reason: 'базовый порог' };
  const threshold = details.threshold;
  const isLarge = isFinite(threshold) && threshold > 0 && amount >= threshold;
  const isAlreadyAmortized = cb && cb.checked;

  if (amount > 0 || isAlreadyAmortized || hasExistingId) {
    amortizeWrap.classList.remove('hidden');

    if (isLarge) {
      if (noticeEl) {
        noticeEl.classList.remove('hidden');
        noticeEl.classList.add('flex');
      }
      if (badgeEl && typeof formatMoney === 'function') {
        badgeEl.innerText = `Крупная трата (от ${formatMoney(threshold)})`;
      }
      if (titleEl) titleEl.innerText = 'Сделать разовой тратой?';
      if (descEl) descEl.innerText = 'Покупка не уменьшит недельный лимит трат на жизнь';
      amortizeWrap.classList.add(
        'border-violet-500/35',
        'bg-gradient-to-b',
        'from-violet-950/25',
        'to-[#12151C]'
      );
      amortizeWrap.classList.remove('border-[rgba(255,255,255,0.06)]', 'bg-[#12151C]');
    } else {
      if (noticeEl) {
        noticeEl.classList.add('hidden');
        noticeEl.classList.remove('flex');
      }
      if (titleEl) titleEl.innerText = 'Сделать разовой';
      if (descEl) descEl.innerText = 'Исключает покупку из недельного лимита трат';
      amortizeWrap.classList.remove(
        'border-violet-500/35',
        'bg-gradient-to-b',
        'from-violet-950/25'
      );
      amortizeWrap.classList.add('border-[rgba(255,255,255,0.06)]', 'bg-[#12151C]');
    }

    if (typeof lucide !== 'undefined') lucide.createIcons({ root: amortizeWrap });
  } else {
    amortizeWrap.classList.add('hidden');
    if (noticeEl) {
      noticeEl.classList.add('hidden');
      noticeEl.classList.remove('flex');
    }
  }

  updateEditTxGoalPreview();
}

function toggleTxAmortizeSection(enabled) {
  const details = document.getElementById('edit-tx-amortize-details');
  if (details) {
    if (enabled) {
      const activeGoals = (Cache?.goals || []).filter(
        g => g.status !== 'Выполнена' || (parseFloat(g.saved) || 0) > 0
      );
      if (activeGoals.length === 0) {
        document.getElementById('edit-tx-exclude-budget').checked = false;
        showToast('Для разовой траты нужна финансовая цель. Создайте цель во вкладке «Цели»', true);
        return;
      }
      details.classList.remove('hidden');
      const goalInput = document.getElementById('edit-tx-goal-id');
      if (!goalInput || !goalInput.value || !activeGoals.some(g => g.id === goalInput.value)) {
        selectEditTxGoal(activeGoals[0].id);
      } else {
        updateEditTxGoalPreview();
      }
    } else {
      details.classList.add('hidden');
    }
  }
}

function renderEditTxGoalMenu() {
  const menu = document.getElementById('edit-tx-goal-menu');
  if (!menu) return;

  const goals = (Cache?.goals || []).filter(
    g => g.status !== 'Выполнена' || (parseFloat(g.saved) || 0) > 0
  );
  const selectedGoalId = document.getElementById('edit-tx-goal-id')?.value;

  if (goals.length === 0) {
    menu.innerHTML = `
      <div class="p-3 text-center text-xs text-gray-400 space-y-1">
        <div>Нет активных финансовых целей</div>
        <button type="button" onclick="closeEditTxModal(); switchTab('deposits');" class="text-[#8C7DFF] hover:underline text-[11px] font-semibold cursor-pointer">
          + Создать цель во вкладке «Цели»
        </button>
      </div>
    `;
    return;
  }

  const html = goals
    .map(g => {
      const saved = parseFloat(g.saved) || 0;
      const isSelected = g.id === selectedGoalId;
      return `
      <button type="button" 
              onclick="selectEditTxGoal('${g.id}')" 
              class="w-full text-left px-3 py-2 text-xs rounded-xl hover:bg-[#212430] transition-colors flex items-center justify-between cursor-pointer group ${isSelected ? 'bg-[#6C5DD3]/15' : ''}">
        <div class="min-w-0 pr-2">
          <div class="font-semibold text-gray-200 truncate group-hover:text-white">${escapeHtml(g.name || g.title || 'Цель')}</div>
          <div class="text-[10px] text-[#848D99]">Накоплено: <span class="text-amber-300 font-mono font-medium">${formatMoney(saved)}</span></div>
        </div>
        <i data-lucide="target" class="w-4 h-4 text-amber-400 flex-shrink-0"></i>
      </button>
    `;
    })
    .join('');

  menu.innerHTML = html;
  if (typeof lucide !== 'undefined') lucide.createIcons({ root: menu });
}

function toggleEditTxGoalMenu(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('edit-tx-goal-menu');
  if (!menu) return;
  const isClosed = menu.classList.contains('hidden');
  document.querySelectorAll('.custom-dropdown-menu').forEach(m => m.classList.add('hidden'));
  if (isClosed) {
    renderEditTxGoalMenu();
    menu.classList.remove('hidden');
  }
}

function selectEditTxGoal(goalId) {
  const input = document.getElementById('edit-tx-goal-id');
  const label = document.getElementById('edit-tx-goal-label');
  const menu = document.getElementById('edit-tx-goal-menu');
  if (menu) menu.classList.add('hidden');

  const goals = Cache?.goals || [];
  const activeGoals = goals.filter(g => g.status !== 'Выполнена' || (parseFloat(g.saved) || 0) > 0);
  const goal = goalId ? goals.find(g => g.id === goalId) : activeGoals[0] || null;

  if (goal) {
    const goalTitle = goal.name || goal.title || 'Цель';
    if (input) input.value = goal.id;
    if (label) {
      label.innerHTML = `
        <i data-lucide="target" class="w-4 h-4 text-amber-400 flex-shrink-0"></i>
        <span class="truncate text-white font-medium">${escapeHtml(goalTitle)}</span>
        <span class="text-[10px] font-mono text-amber-300 ml-1">(${formatMoney(goal.saved || 0)})</span>
      `;
    }
  } else {
    if (input) input.value = '';
    if (label) {
      label.innerHTML = `
        <i data-lucide="target" class="w-4 h-4 text-gray-400 flex-shrink-0"></i>
        <span class="truncate text-gray-400">Выберите цель</span>
      `;
    }
  }
  if (typeof lucide !== 'undefined') lucide.createIcons();
  updateEditTxGoalPreview();
}

function updateEditTxGoalPreview() {
  const goalId = document.getElementById('edit-tx-goal-id')?.value;
  const amount = getUnformattedVal(document.getElementById('edit-tx-amount')) || 0;
  const previewBox = document.getElementById('edit-tx-goal-preview');
  const calcEl = document.getElementById('edit-tx-goal-calc');
  const balanceInfo = document.getElementById('edit-tx-goal-balance-info');

  const goal = (Cache?.goals || []).find(g => g.id === goalId);
  if (goal && previewBox && calcEl) {
    const goalTitle = goal.name || goal.title || 'Цель';
    previewBox.classList.remove('hidden');
    calcEl.innerText = `-${formatMoney(amount)}`;

    if (balanceInfo) {
      const curSaved = parseFloat(goal.saved) || 0;
      const remaining = Math.max(0, curSaved - amount);
      balanceInfo.classList.remove('hidden');
      balanceInfo.innerHTML = `В цели «${escapeHtml(goalTitle)}» останется: <span class="${curSaved < amount ? 'text-amber-400' : 'text-emerald-400'} font-bold">${formatMoney(remaining)}</span>`;
    }
  } else {
    if (previewBox) previewBox.classList.add('hidden');
    if (balanceInfo) balanceInfo.classList.add('hidden');
  }
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
  const isBillPayment =
    document.getElementById('edit-tx-is-bill-payment')?.value === 'true' || !!billId;

  if (!amount || amount <= 0) {
    showToast('Введите корректную сумму', true);
    return;
  }
  if (!category) {
    showToast('Выберите категорию', true);
    return;
  }

  const parsedDate =
    (typeof parseAnyDate === 'function' ? parseAnyDate(rawDate) : new Date(rawDate)) || new Date();
  const date =
    typeof formatDateStr === 'function' ? formatDateStr(parsedDate, 'yyyy-MM-dd') : rawDate;

  const isOneTime =
    type === 'Расход' &&
    !isBillPayment &&
    !!document.getElementById('edit-tx-exclude-budget')?.checked;
  const effectiveIsBillPayment = isBillPayment;
  const excludeFromBudget = type === 'Расход' && (isBillPayment || isOneTime);
  const selectedGoalId = isOneTime
    ? document.getElementById('edit-tx-goal-id')?.value || null
    : null;
  const targetGoal =
    isOneTime && selectedGoalId ? (Cache?.goals || []).find(g => g.id === selectedGoalId) : null;

  if (isOneTime && !targetGoal) {
    showDialog(
      'Выберите цель',
      'Для разовой траты необходимо выбрать цель, из которой будет списана сумма',
      false
    );
    return;
  }

  const fundingGoalName = targetGoal ? targetGoal.name || targetGoal.title || 'Цель' : '';
  const fundingGoalAmount = isOneTime && targetGoal ? parseFloat(amount) || 0 : 0;

  const tempTxId = id || `opt_tx_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

  // 1. Получаем плоский список и сохраняем временную метку дня при редактировании
  const allFlat =
    typeof getAllCachedTransactionsFlat === 'function' ? getAllCachedTransactionsFlat() : [];
  let itemTimestamp = parsedDate.getTime();
  let existing = null;
  if (id) {
    existing = allFlat.find(t => t.id === id);
    if (
      existing &&
      existing.timestamp &&
      (existing.formattedDate === formatDateStr(parsedDate, 'dd.MM.yyyy') || existing.date === date)
    ) {
      itemTimestamp = existing.timestamp;
    }
  }

  // Управление списанием/восполнением накоплений цели
  const oldGoalId = existing ? existing.fundingGoalId : null;
  const oldGoalAmt = existing
    ? parseFloat(existing.fundingGoalAmount) || parseFloat(existing.amount) || 0
    : 0;

  if (isOneTime && selectedGoalId) {
    if (oldGoalId && oldGoalId === selectedGoalId) {
      const delta = amount - oldGoalAmt;
      if (delta !== 0 && typeof adjustGoalSaved === 'function') {
        adjustGoalSaved(selectedGoalId, -delta).catch(err => console.error(err));
      }
    } else {
      if (oldGoalId && oldGoalAmt > 0 && typeof adjustGoalSaved === 'function') {
        adjustGoalSaved(oldGoalId, oldGoalAmt).catch(err => console.error(err));
      }
      if (typeof adjustGoalSaved === 'function') {
        adjustGoalSaved(selectedGoalId, -amount).catch(err => console.error(err));
      }
    }
  } else if (oldGoalId && oldGoalAmt > 0) {
    if (typeof adjustGoalSaved === 'function') {
      adjustGoalSaved(oldGoalId, oldGoalAmt).catch(err => console.error(err));
    }
  }

  // 2. Формируем локальный объект транзакции
  const userProfile =
    typeof getCurrentUserProfile === 'function'
      ? getCurrentUserProfile()
      : { displayName: 'Пользователь', avatarId: 'user' };
  const authorInfo =
    id && existing && existing.author
      ? existing.author
      : {
          uid: auth?.currentUser?.uid || '',
          name: userProfile.displayName,
          avatarId: userProfile.avatarId,
        };

  const txObj = {
    id: tempTxId,
    type,
    amount,
    category,
    date,
    formattedDate:
      typeof formatDateStr === 'function' ? formatDateStr(parsedDate, 'dd.MM.yyyy') : date,
    rawDate: date,
    comment: comment || billName || '',
    excludeFromBudget: !!excludeFromBudget,
    spreadMonths: 1,
    isBillPayment: !!effectiveIsBillPayment,
    billId: billId || null,
    billName: billName || '',
    billType: isOneTime ? 'onetime' : effectiveIsBillPayment ? 'recurring' : '',
    fundingGoalId: isOneTime ? selectedGoalId : null,
    fundingGoalName: isOneTime ? fundingGoalName : '',
    fundingGoalAmount: isOneTime ? fundingGoalAmount : 0,
    timestamp: itemTimestamp,
    author: authorInfo,
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
    const b = (Cache?.calendarBills || []).find(item => item.id === billId);
    if (b) {
      const monthKey =
        typeof formatDateStr === 'function' ? formatDateStr(parsedDate, 'yyyy-MM') : '2026-09';
      const paidMonths = { ...(b.paidMonths || {}) };
      paidMonths[monthKey] = { paid: true, txId: tempTxId, amount: parseFloat(amount) || 0 };
      b.isPaid = true;
      b.linkedTxId = tempTxId;
      b.paidMonths = paidMonths;
    }
  }

  // 3. Мгновенно закрываем модалку и перерисовываем интерфейс (0мс)
  closeEditTxModal();
  const isExpenseTx =
    type === 'Расход' ||
    type === 'expense' ||
    String(type || '')
      .trim()
      .toLowerCase() === 'расход' ||
    !!isBillPayment;
  if (isExpenseTx) {
    if (typeof triggerBudgetExpenseAnimation === 'function') {
      triggerBudgetExpenseAnimation();
    } else {
      window._budgetNeedsExpenseAnimation = true;
      window._budgetTabDirty = true;
    }
  }
  if (typeof markTabsDirty === 'function') markTabsDirty();
  if (typeof renderBudgetTab === 'function') renderBudgetTab();
  if (typeof renderTransactions === 'function') renderTransactions();

  document.getElementById('toast-container')?.classList.add('hidden');
  showToast(
    id
      ? 'Операция сохранена'
      : isBillPayment
        ? `Оплата «${billName || 'Счет'}» создана`
        : isOneTime
          ? targetGoal
            ? `Разовая трата списана из цели «${fundingGoalName}»`
            : 'Операция сохранена как разовая'
          : 'Операция создана'
  );

  // 4. Фоновая отправка в Firestore
  try {
    if (id) {
      // 1. Обновление существующей транзакции
      await getUserCol('Transactions')
        .doc(id)
        .update({
          type,
          amount,
          category,
          date,
          comment,
          excludeFromBudget,
          spreadMonths: 1,
          isBillPayment: !!effectiveIsBillPayment,
          billId: billId || null,
          billName: billName || '',
          billType: isOneTime ? 'onetime' : effectiveIsBillPayment ? 'recurring' : '',
          fundingGoalId: isOneTime ? selectedGoalId : null,
          fundingGoalName: isOneTime ? fundingGoalName : '',
          fundingGoalAmount: isOneTime ? fundingGoalAmount : 0,
          updatedAt: Date.now(),
        });

      // Удаляем устаревшие связанные CalendarBills, если были
      const billCol = getUserCol('CalendarBills');
      const existingBill = (Cache.calendarBills || []).find(b => b.linkedTxId === id);
      if (existingBill) {
        await billCol.doc(existingBill.id).delete();
        Cache.calendarBills = (Cache.calendarBills || []).filter(b => b.id !== existingBill.id);
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
        spreadMonths: 1,
        isBillPayment: !!effectiveIsBillPayment,
        billId: billId || null,
        billName: billName || '',
        billType: isOneTime ? 'onetime' : effectiveIsBillPayment ? 'recurring' : '',
        fundingGoalId: isOneTime ? selectedGoalId : null,
        fundingGoalName: isOneTime ? fundingGoalName : '',
        fundingGoalAmount: isOneTime ? fundingGoalAmount : 0,
        author: authorInfo,
        createdAt: Date.now(),
      };

      const txDocRef = await getUserCol('Transactions').add(newTxData);
      const newTxId = txDocRef.id;
      window.lastAddedTxIds = [newTxId];

      // Бесшовно заменяем временный ID в памяти
      const flatList =
        typeof getAllCachedTransactionsFlat === 'function' ? getAllCachedTransactionsFlat() : [];
      const tempItem = flatList.find(t => t.id === tempTxId);
      if (tempItem) tempItem.id = newTxId;
      if (typeof processTransactions === 'function') {
        Cache.transactions = processTransactions(flatList);
      }

      if (billId) {
        const b = (Cache?.calendarBills || []).find(item => item.id === billId);
        if (b) {
          const monthKey = formatDateStr(parsedDate, 'yyyy-MM');
          const paidMonths = { ...(b.paidMonths || {}) };
          paidMonths[monthKey] = {
            paid: true,
            txId: newTxId,
            amount: parseFloat(amount) || 0,
          };

          await getUserCol('CalendarBills').doc(billId).update({
            isPaid: true,
            linkedTxId: newTxId,
            paidMonths: paidMonths,
            updatedAt: Date.now(),
          });
          b.linkedTxId = newTxId;
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
  showDialog(
    'Удаление операции',
    'Точно удалить операцию? Это действие нельзя отменить.',
    true,
    async () => {
      try {
        closeEditTxModal();

        const allTxs =
          typeof getAllCachedTransactionsFlat === 'function' ? getAllCachedTransactionsFlat() : [];
        const deletedTx = allTxs.find(t => t.id === id);

        // Оптимистично удаляем из локального кэша транзакций
        if (Array.isArray(Cache?.transactions)) {
          for (const month of Cache.transactions) {
            if (Array.isArray(month.items)) {
              month.items = month.items.filter(t => t.id !== id);
            }
          }
        }

        // Восполняем цель, если была списана разовая трата
        if (deletedTx && deletedTx.fundingGoalId) {
          const refundAmt =
            parseFloat(deletedTx.fundingGoalAmount) || parseFloat(deletedTx.amount) || 0;
          if (refundAmt > 0 && typeof adjustGoalSaved === 'function') {
            await adjustGoalSaved(deletedTx.fundingGoalId, refundAmt);
          }
        }

        // Переводим связанные счета в статус "не оплачено"
        if (typeof handleTransactionsDeleted === 'function') {
          await handleTransactionsDeleted([id], deletedTx ? [deletedTx] : []);
        }

        // Удаляем связанный счет в календаре, если был
        const billCol = getUserCol('CalendarBills');
        const existingBill = (Cache.calendarBills || []).find(b => b.linkedTxId === id);
        if (existingBill) {
          await billCol.doc(existingBill.id).delete();
          Cache.calendarBills = (Cache.calendarBills || []).filter(b => b.id !== existingBill.id);
        }

        if (typeof triggerBudgetExpenseAnimation === 'function') {
          triggerBudgetExpenseAnimation();
        }
        if (typeof markTabsDirty === 'function') markTabsDirty();
        if (typeof renderBudgetTab === 'function') renderBudgetTab();
        if (typeof renderTransactions === 'function') renderTransactions();
        showToast('Операция удалена');

        // Фоновое удаление из базы данных
        await getUserCol('Transactions').doc(id).delete();
      } catch (err) {
        console.error('Ошибка при удалении:', err);
        showToast('Ошибка при удалении: ' + (err.message || ''), true);
      }
    }
  );
}

function editTx(id) {
  openEditTxModal(id);
}

// Контекстное меню для транзакции с пунктом «Сделать разовой» / «Вернуть в лимит»
function openTxContextMenu(e, txId) {
  // Закрываем открытые выпадающие списки фильтров при тапе по карточке
  const mm = document.getElementById('menu-filter-month');
  const cm = document.getElementById('menu-filter-cat');
  if (mm) mm.classList.add('hidden');
  if (cm) cm.classList.add('hidden');

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

  // Формируем мета-информацию (источник, автор, оригинальный текст)
  let sourceLabel = 'Вручную';
  let rawText = tx.comment || tx.rawText || tx.description || '';
  if (tx.source === 'bank_push' || tx.source === 'bank_push_auto') {
    sourceLabel = tx.bank ? `Пуш (${tx.bank})` : 'Пуш';
    rawText =
      tx.rawText || tx.pushText || tx.comment || 'Оригинальный текст пуш-уведомления отсутствует';
  } else if (tx.source === 'pdf_statement' || tx.source === 'statement') {
    sourceLabel = tx.bank ? `Выписка (${tx.bank})` : 'Выписка';
    rawText =
      tx.rawText || tx.rawLine || tx.comment || 'Оригинальная строка из выписки отсутствует';
  }

  const authorName = tx.author || tx.authorName || tx.userName || '';

  const metaInfo = {
    sourceLabel,
    authorName,
    rawText,
  };

  openCardContextMenu(
    e,
    `${tx.category || 'Операция'} · ${formatMoney(tx.amount)}`,
    () => openEditTxModal(txId),
    () => deleteRecord('Transactions', txId),
    metaInfo
  );
}

// Быстрое списание разовой траты из цели
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

  const activeGoals = (Cache?.goals || []).filter(
    g => g.status !== 'Выполнена' || (parseFloat(g.saved) || 0) > 0
  );
  if (activeGoals.length === 0) {
    showToast('Для разовой траты нужна финансовая цель. Создайте цель во вкладке «Цели»', true);
    return;
  }

  const dlg = document.getElementById('quick-amortize-modal');
  if (!dlg) return;

  document.getElementById('quick-amortize-tx-id').value = tx.id;
  document.getElementById('quick-amortize-amount').value = tx.amount;
  document.getElementById('quick-amortize-cat-name').innerText = tx.comment
    ? `${tx.category} • ${tx.comment}`
    : tx.category;
  document.getElementById('quick-amortize-total-display').innerText = formatMoney(tx.amount);

  const targetGoalId =
    tx.fundingGoalId && activeGoals.some(g => g.id === tx.fundingGoalId)
      ? tx.fundingGoalId
      : activeGoals[0].id;

  renderQuickGoalMenu();
  selectQuickGoal(targetGoalId);

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

function renderQuickGoalMenu() {
  const menu = document.getElementById('quick-amortize-goal-menu');
  if (!menu) return;

  const goals = (Cache?.goals || []).filter(
    g => g.status !== 'Выполнена' || (parseFloat(g.saved) || 0) > 0
  );
  const selectedGoalId = document.getElementById('quick-amortize-goal-id')?.value;

  if (goals.length === 0) {
    menu.innerHTML = `
      <div class="p-3 text-center text-xs text-gray-400 space-y-1">
        <div>Нет активных финансовых целей</div>
        <button type="button" onclick="closeQuickAmortizeModal(); switchTab('deposits');" class="text-[#8C7DFF] hover:underline text-[11px] font-semibold cursor-pointer">
          + Создать цель во вкладке «Цели»
        </button>
      </div>
    `;
    return;
  }

  const html = goals
    .map(g => {
      const saved = parseFloat(g.saved) || 0;
      const isSelected = g.id === selectedGoalId;
      return `
      <button type="button" 
              onclick="selectQuickGoal('${g.id}')" 
              class="w-full text-left px-3 py-2 text-xs rounded-xl hover:bg-[#212430] transition-colors flex items-center justify-between cursor-pointer group ${isSelected ? 'bg-[#6C5DD3]/15' : ''}">
        <div class="min-w-0 pr-2">
          <div class="font-semibold text-gray-200 truncate group-hover:text-white">${escapeHtml(g.name || g.title || 'Цель')}</div>
          <div class="text-[10px] text-[#848D99]">Накоплено: <span class="text-amber-300 font-mono font-medium">${formatMoney(saved)}</span></div>
        </div>
        <i data-lucide="target" class="w-4 h-4 text-amber-400 flex-shrink-0"></i>
      </button>
    `;
    })
    .join('');

  menu.innerHTML = html;
  if (typeof lucide !== 'undefined') lucide.createIcons({ root: menu });
}

function toggleQuickGoalMenu(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('quick-amortize-goal-menu');
  if (!menu) return;
  const isClosed = menu.classList.contains('hidden');
  document.querySelectorAll('.custom-dropdown-menu').forEach(m => m.classList.add('hidden'));
  if (isClosed) {
    renderQuickGoalMenu();
    menu.classList.remove('hidden');
  }
}

function selectQuickGoal(goalId) {
  const input = document.getElementById('quick-amortize-goal-id');
  const label = document.getElementById('quick-amortize-goal-label');
  const menu = document.getElementById('quick-amortize-goal-menu');
  if (menu) menu.classList.add('hidden');

  const goals = Cache?.goals || [];
  const activeGoals = goals.filter(g => g.status !== 'Выполнена' || (parseFloat(g.saved) || 0) > 0);
  const goal = goalId ? goals.find(g => g.id === goalId) : activeGoals[0] || null;

  if (goal) {
    const goalTitle = goal.name || goal.title || 'Цель';
    if (input) input.value = goal.id;
    if (label) {
      label.innerHTML = `
        <i data-lucide="target" class="w-4 h-4 text-amber-400 flex-shrink-0"></i>
        <span class="truncate text-white font-medium">${escapeHtml(goalTitle)}</span>
        <span class="text-[10px] font-mono text-amber-300 ml-1">(${formatMoney(goal.saved || 0)})</span>
      `;
    }
  } else {
    if (input) input.value = '';
    if (label) {
      label.innerHTML = `
        <i data-lucide="target" class="w-4 h-4 text-gray-400 flex-shrink-0"></i>
        <span class="truncate text-gray-400">Выберите цель</span>
      `;
    }
  }
  if (typeof lucide !== 'undefined') lucide.createIcons();
  updateQuickGoalPreview();
}

function updateQuickGoalPreview() {
  const goalId = document.getElementById('quick-amortize-goal-id')?.value;
  const amount = parseFloat(document.getElementById('quick-amortize-amount')?.value) || 0;
  const calcBox = document.getElementById('quick-amortize-goal-calc');
  const remainingEl = document.getElementById('quick-amortize-goal-remaining');

  if (!calcBox || !remainingEl) return;

  const goal = (Cache?.goals || []).find(g => g.id === goalId);
  if (goal && amount > 0) {
    const curSaved = parseFloat(goal.saved) || 0;
    const remaining = Math.max(0, curSaved - amount);
    calcBox.classList.remove('hidden');
    calcBox.classList.add('flex');
    remainingEl.innerText = formatMoney(remaining);
    if (curSaved < amount) {
      remainingEl.className = 'font-mono font-bold text-amber-400';
    } else {
      remainingEl.className = 'font-mono font-bold text-emerald-400';
    }
  } else {
    calcBox.classList.add('hidden');
    calcBox.classList.remove('flex');
  }
}

async function submitQuickAmortize() {
  const id = document.getElementById('quick-amortize-tx-id')?.value;
  if (!id) return;

  const goalId = document.getElementById('quick-amortize-goal-id')?.value || null;
  const goals = Cache?.goals || [];
  const targetGoal = goalId ? goals.find(g => g.id === goalId) : null;

  if (!targetGoal) {
    showDialog(
      'Выберите цель',
      'Для разовой траты необходимо выбрать цель, из которой будет списана сумма',
      false
    );
    return;
  }

  const goalName = targetGoal.name || targetGoal.title || 'Цель';

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

  // 1. Мгновенное оптимистичное обновление состояния в памяти
  tx.excludeFromBudget = true;
  tx.spreadMonths = 1;
  tx.billType = 'onetime';
  tx.fundingGoalId = targetGoal.id;
  tx.fundingGoalName = goalName;
  tx.fundingGoalAmount = amount;

  if (amount > 0) {
    targetGoal.saved = Math.max(0, (parseFloat(targetGoal.saved) || 0) - amount);
  }

  closeQuickAmortizeModal();
  if (typeof triggerBudgetExpenseAnimation === 'function') triggerBudgetExpenseAnimation();
  if (typeof markTabsDirty === 'function') markTabsDirty();
  if (typeof renderBudgetTab === 'function') renderBudgetTab();
  if (typeof renderTransactions === 'function') renderTransactions();
  if (typeof renderGoals === 'function') renderGoals();

  showToast(`Разовая трата списана из цели «${goalName}»`);

  // 2. Асинхронная фоновая запись в Firestore
  (async () => {
    try {
      const promises = [];
      if (amount > 0 && typeof adjustGoalSaved === 'function') {
        promises.push(adjustGoalSaved(targetGoal.id, -amount));
      }
      promises.push(
        getUserCol('Transactions').doc(id).update({
          excludeFromBudget: true,
          spreadMonths: 1,
          billType: 'onetime',
          fundingGoalId: targetGoal.id,
          fundingGoalName: goalName,
          fundingGoalAmount: amount,
          updatedAt: Date.now(),
        })
      );

      const existingBill = (Cache.calendarBills || []).find(b => b.linkedTxId === id);
      if (existingBill) {
        Cache.calendarBills = (Cache.calendarBills || []).filter(b => b.id !== existingBill.id);
        promises.push(getUserCol('CalendarBills').doc(existingBill.id).delete());
      }

      await Promise.all(promises);
    } catch (err) {
      console.error('Background submitQuickAmortize error:', err);
    }
  })();
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

  const oldGoalId = tx.fundingGoalId;
  const refundAmt = parseFloat(tx.fundingGoalAmount) || parseFloat(tx.amount) || 0;

  // 1. Мгновенное оптимистичное обновление состояния в памяти
  tx.excludeFromBudget = false;
  tx.spreadMonths = 1;
  tx.billType = '';
  delete tx.fundingGoalId;
  delete tx.fundingGoalName;
  delete tx.fundingGoalAmount;

  if (oldGoalId && refundAmt > 0) {
    const targetGoal = (Cache?.goals || []).find(g => g.id === oldGoalId);
    if (targetGoal) {
      targetGoal.saved = (parseFloat(targetGoal.saved) || 0) + refundAmt;
    }
  }

  if (typeof triggerBudgetExpenseAnimation === 'function') triggerBudgetExpenseAnimation();
  if (typeof markTabsDirty === 'function') markTabsDirty();
  if (typeof renderBudgetTab === 'function') renderBudgetTab();
  if (typeof renderTransactions === 'function') renderTransactions();
  if (typeof renderGoals === 'function') renderGoals();

  showToast('Трата возвращена в недельный лимит');

  // 2. Асинхронная фоновая запись в Firestore
  (async () => {
    try {
      const promises = [];
      if (oldGoalId && refundAmt > 0 && typeof adjustGoalSaved === 'function') {
        promises.push(adjustGoalSaved(oldGoalId, refundAmt));
      }
      promises.push(
        getUserCol('Transactions').doc(id).update({
          excludeFromBudget: false,
          spreadMonths: 1,
          billType: '',
          fundingGoalId: null,
          fundingGoalName: '',
          fundingGoalAmount: 0,
          updatedAt: Date.now(),
        })
      );

      const existingBill = (Cache.calendarBills || []).find(b => b.linkedTxId === id);
      if (existingBill) {
        Cache.calendarBills = (Cache.calendarBills || []).filter(b => b.id !== existingBill.id);
        promises.push(getUserCol('CalendarBills').doc(existingBill.id).delete());
      }

      await Promise.all(promises);
    } catch (err) {
      console.error('Background returnTxToBudget error:', err);
    }
  })();
}

window.updateTxSubmitBtnText = updateTxSubmitBtnText;
window.updateTxRowRemoveButtons = updateTxRowRemoveButtons;
window.removeTxRow = removeTxRow;
window.addTxRow = addTxRow;
window.handleInlineTxAmountChange = handleInlineTxAmountChange;
window.handleInlineTxGoalChange = handleInlineTxGoalChange;
window.toggleInlineTxAmortize = toggleInlineTxAmortize;
window.toggleInlineTxAmortizeHelp = toggleInlineTxAmortizeHelp;
window.handleTxRowCommentInput = handleTxRowCommentInput;
window.handleEditTxCommentInput = handleEditTxCommentInput;
window.openRememberRuleForTxRow = openRememberRuleForTxRow;
window.openRememberRuleForEditTx = openRememberRuleForEditTx;
window.learnMerchantCategory = learnMerchantCategory;
window.openCreateTxModal = openCreateTxModal;
window.closeCreateTxModal = closeCreateTxModal;
window.openEditTxModal = openEditTxModal;
window.openQuickAmortizeModal = openQuickAmortizeModal;
window.selectEditTxType = selectEditTxType;
window.selectEditTxCategory = selectEditTxCategory;
window.toggleEditTxAmortize = toggleEditTxAmortize;
window.toggleEditTxAmortizeHelp = toggleEditTxAmortizeHelp;
window.changeEditTxSpread = changeEditTxSpread;
window.updateEditTxSpreadPreview = updateEditTxSpreadPreview;
window.submitTransactions = submitTransactions;
window.editTx = editTx;
window.saveTransaction = saveTransaction;
window.deleteTransaction = deleteTransaction;
window.returnTxToBudget = returnTxToBudget;

window.toggleEditTxCategoryMenu = toggleEditTxCategoryMenu;
window.toggleTxAmortizeSection = toggleTxAmortizeSection;
window.toggleEditTxGoalMenu = toggleEditTxGoalMenu;
window.submitEditTxModal = submitEditTxModal;
window.deleteTxFromModal = deleteTxFromModal;
window.openTxContextMenu = openTxContextMenu;
window.toggleQuickGoalMenu = toggleQuickGoalMenu;
window.submitQuickAmortize = submitQuickAmortize;
