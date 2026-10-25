/**
 * deposits.js
 * Bank deposits and savings accounts management.
 */

// 1. Deposits (Вклады и привязка к целям)
// ==========================================
function processDeposits(deposits, goals) {
  const goalsMap = {};
  (goals || []).forEach(g => goalsMap[g.id] = g.name || '');

  return deposits.map(dep => {
    const amount = parseFloat(dep.amount !== undefined ? dep.amount : (dep.initialAmount !== undefined ? dep.initialAmount : (dep.currentAmount || 0))) || 0;
    const rate = parseFloat(dep.rate !== undefined ? dep.rate : (dep.percent !== undefined ? dep.percent : (dep.interestRate || 0))) || 0;
    
    const rawStart = dep.startDate || dep.rawStart;
    const startDate = rawStart ? (typeof parseAnyDate === 'function' ? parseAnyDate(rawStart) : new Date(rawStart)) : new Date();
    
    const rawEnd = dep.endDate || dep.rawEnd;
    let endDate;
    if (rawEnd) {
      endDate = typeof parseAnyDate === 'function' ? parseAnyDate(rawEnd) : new Date(rawEnd);
    } else if (dep.months && !isNaN(Number(dep.months))) {
      endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + Number(dep.months));
    } else {
      endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 1);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);

    const isExplicitlyClosed = dep.status === 'Закрыт' || dep.isClosed === true;
    const isMatured = !isExplicitlyClosed && (today >= end);
    const isClosed = isExplicitlyClosed;

    const totalDays = Math.max(1, Math.round((endDate - startDate) / 86400000));
    const daysPassed = isClosed ? totalDays : Math.max(0, Math.min(Math.round((new Date() - startDate) / 86400000), totalDays));
    const goalIdStr = dep.goalId || '';
    const durationStr = getDepositDurationStr(startDate, endDate);

    const totalExpectedInterest = Math.round(totalDays * (amount * (rate / 100) / 365));
    const currentInterest = Math.round(daysPassed * (amount * (rate / 100) / 365));
    const monthlyInterest = (amount * (rate / 100)) / 12;

    // Авто-миграция неполных записей в Firestore при чтении
    if (dep.id && (dep.amount === undefined || dep.rate === undefined || !dep.startDate || !dep.endDate)) {
      try {
        getUserCol('Deposits').doc(dep.id).update({
          amount: amount,
          rate: rate,
          startDate: formatDateStr(startDate, 'yyyy-MM-dd') || dep.startDate,
          endDate: formatDateStr(endDate, 'yyyy-MM-dd') || dep.endDate,
          status: isClosed ? 'Закрыт' : 'Активен'
        }).catch(() => {});
      } catch (e) {}
    }

    return {
      id: dep.id,
      name: dep.name || 'Вклад',
      amount,
      rate,
      goalId: goalIdStr,
      goalName: goalsMap[goalIdStr] || '',
      currentInterest,
      expectedInterest: totalExpectedInterest,
      monthlyInterest,
      progress: Math.min(100, (daysPassed / totalDays) * 100).toFixed(1),
      endDateStr: formatDateStr(endDate, 'dd.MM.yyyy'),
      durationStr,
      rawStart: formatDateStr(startDate, 'yyyy-MM-dd') || dep.startDate,
      rawEnd: formatDateStr(endDate, 'yyyy-MM-dd') || dep.endDate,
      isClosed,
      isMatured,
      isInterestCredited: !!dep.isInterestCredited
    };
  });
}

function renderDeposits() {
  const data = Cache.deposits || [];
  const listEl = document.getElementById('deposits-list');
  const topBtn = document.getElementById('dep-open-top-btn');
  const summaryPanel = document.getElementById('deposits-summary-panel');
  const totalAmountEl = document.getElementById('deposits-total-amount');
  const monthlyInterestEl = document.getElementById('deposits-monthly-interest');

  const matured = data.filter(d => !d.isClosed && d.isMatured);
  const active = data.filter(d => !d.isClosed && !d.isMatured);
  const closed = data.filter(d => d.isClosed);

  const totalActiveAmount = [...active, ...matured].reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);
  const totalMonthlyInterest = Math.round(active.reduce((sum, d) => sum + (parseFloat(d.monthlyInterest) || 0), 0));

  if (totalAmountEl) {
    totalAmountEl.innerText = formatMoney(totalActiveAmount);
  }
  if (monthlyInterestEl) {
    monthlyInterestEl.innerText = `+${formatMoney(totalMonthlyInterest)}`;
  }

  if (topBtn) {
    if (data.length === 0) topBtn.classList.add('hidden');
    else topBtn.classList.remove('hidden');
  }

  if (summaryPanel) {
    if (data.length === 0) summaryPanel.classList.add('hidden');
    else summaryPanel.classList.remove('hidden');
  }

  updateDepositsBadge();

  if (!listEl) return;

  if (data.length === 0) {
    listEl.innerHTML = `
      <div class="card rounded-2xl p-6 text-center flex flex-col items-center justify-center gap-3 mt-4 border border-[rgba(255,255,255,0.06)] bg-[#181B24]">
        <div class="w-12 h-12 rounded-2xl bg-[#6C5DD3]/15 text-[#8C7DFF] flex items-center justify-center">
          <i data-lucide="piggy-bank" class="w-6 h-6"></i>
        </div>
        <div>
          <p class="text-sm font-semibold text-gray-200">У вас пока нет открытых вкладов</p>
          <p class="text-xs text-[#848D99] mt-1.5 max-w-[320px] leading-relaxed">Добавьте банковский вклад или накопительный счет, чтобы отслеживать доходность. Вклад можно привязать к цели, и начисленные проценты будут пополнять ваши накопления.</p>
        </div>
        <button type="button" onclick="toggleForm('deposit-form-container', 'dep-submit-btn', 'Добавить вклад', 'deposit-form', 'dep')" class="mt-1 px-4 py-2.5 rounded-xl bg-[#6C5DD3] hover:bg-[#5b4ec2] text-white text-xs font-semibold transition-all active:scale-95 cursor-pointer flex items-center gap-2">
          <i data-lucide="plus" class="w-3.5 h-3.5"></i>
          <span>Открыть первый вклад</span>
        </button>
      </div>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  let html = '';

  // Секция вкладов, требующих закрытия
  if (matured.length > 0) {
    html += `
      <div class="mb-4 space-y-2.5">
        <div class="flex items-center justify-between px-1">
          <h3 class="font-bold text-amber-400 text-xs uppercase tracking-wider flex items-center gap-1.5">
            <i data-lucide="bell-ring" class="w-3.5 h-3.5 text-amber-400"></i>
            <span>Требуется закрытие (${matured.length})</span>
          </h3>
          <span class="text-[10px] text-amber-400/80 font-medium">Срок завершен</span>
        </div>
        ${matured.map(dep => `
          <div class="card bg-gradient-to-r from-amber-500/15 via-[#181B24] to-[#181B24] border border-amber-500/40 hover:border-amber-500/60 rounded-2xl p-4 flex flex-col transition-all shadow-lg cursor-pointer"
               onclick="openCloseDepositModal('${dep.id}')">
            <div class="flex items-start justify-between w-full gap-2">
              <div class="flex items-center gap-3 min-w-0">
                <div class="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center flex-shrink-0 border border-amber-500/30">
                  <i data-lucide="piggy-bank" class="w-5 h-5"></i>
                </div>
                <div class="min-w-0">
                  <h3 class="text-[15px] font-bold text-white truncate leading-tight">${escapeHtml(dep.name)}</h3>
                  <p class="text-[11px] text-amber-300/90 font-medium mt-0.5">Срок истек ${dep.endDateStr} • ${dep.rate}% годовых</p>
                </div>
              </div>
              <button type="button" 
                      onclick="event.stopPropagation(); openCloseDepositModal('${dep.id}')" 
                      class="py-1.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 active:scale-95 text-black font-bold text-xs shadow-md transition-all cursor-pointer flex items-center gap-1 flex-shrink-0">
                <span>Закрыть</span>
                <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
              </button>
            </div>

            <div class="mt-3 pt-2.5 border-t border-amber-500/20 flex items-center justify-between text-xs">
              <span class="text-gray-300">Вложено: <b class="font-mono text-white">${formatMoney(dep.amount)}</b></span>
              <span class="text-gray-300">Начислено: <b class="font-mono text-[#30D158] font-bold">+${formatMoney(dep.expectedInterest)}</b></span>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  const renderCard = (dep, isCls) => `
    <div
      class="card bg-[#181B24] border border-[rgba(255,255,255,0.06)] rounded-2xl w-full mb-3 flex flex-col p-4 cursor-pointer overflow-hidden ${isCls ? 'opacity-60' : 'hover:border-[rgba(255,255,255,0.12)]'} transition-all"
      data-id="${dep.id}"
      data-table="Deposits"
      ${!isCls ? `onclick="openCardContextMenu(event, '${escapeHtml(dep.name)}', () => openEditDepModal('${dep.id}'), () => deleteRecord('Deposits', '${dep.id}'))"` : `onclick="openCardContextMenu(event, '${escapeHtml(dep.name)}', null, () => deleteRecord('Deposits', '${dep.id}'))"`}
    >
      <input type="checkbox" class="select-checkbox" data-id="${dep.id}">

      <div class="flex justify-between items-start w-full">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-9 h-9 rounded-xl ${isCls ? 'bg-gray-700/30 text-gray-400' : 'bg-[#6C5DD3]/15 text-[#8C7DFF]'} flex items-center justify-center flex-shrink-0">
            <i data-lucide="${isCls ? 'check-circle' : 'vault'}" class="w-4 h-4"></i>
          </div>
          <div class="min-w-0">
            <h3 class="text-[15px] font-semibold text-white truncate leading-tight">${escapeHtml(dep.name)}</h3>
            <p class="text-[11px] text-[#848D99] mt-0.5">${isCls ? `Закрыт ${dep.endDateStr} • ${dep.durationStr}` : `До ${dep.endDateStr}`} • ${dep.rate}% годовых</p>
          </div>
        </div>
        
        ${dep.goalName ? `
          <div class="deposit-goal-tag flex-shrink-0 ml-2">
            <span class="px-2 py-0.5 text-[10px] font-semibold bg-[#6C5DD3]/15 text-[#9DA5FF] rounded-full border border-[#6C5DD3]/25 truncate max-w-[110px] inline-flex items-center gap-1">
              <i data-lucide="target" class="w-2.5 h-2.5"></i>
              <span class="truncate">${escapeHtml(dep.goalName)}</span>
            </span>
          </div>
        ` : ''}
      </div>

      <div class="mt-3 flex items-end justify-between w-full">
        <div class="flex flex-col">
          <span class="text-[10px] text-[#848D99] uppercase font-bold tracking-wider mb-0.5">Вложено: ${formatMoney(dep.amount)}</span>
          ${isCls ? `
            <div class="flex items-center gap-1.5 text-xs">
               <span class="text-[#30D158] font-bold font-mono">+${formatMoney(dep.expectedInterest)}</span>
               <span class="text-[10px] text-[#848D99] font-medium">${dep.goalName && dep.isInterestCredited ? 'зачислено в цель' : 'выплачено'}</span>
            </div>
          ` : `
            <div class="flex items-center gap-1 text-xs">
               <span class="text-[#30D158] font-bold font-mono">+${formatMoney(dep.currentInterest)}</span>
               <span class="text-gray-600">/</span>
               <span class="text-gray-400 font-mono text-[11px]">+${formatMoney(dep.expectedInterest)}</span>
            </div>
          `}
        </div>

        ${!isCls && dep.monthlyInterest > 0 ? `
          <div class="text-right">
            <span class="text-[10px] text-[#848D99] block font-medium">~+${formatMoney(Math.round(dep.monthlyInterest))}/мес</span>
          </div>
        ` : ''}
      </div>

      <!-- Тонкая полоска прогресса (Material/iOS) -->
      <div class="w-full bg-[rgba(255,255,255,0.06)] h-1.5 rounded-full overflow-hidden mt-2.5">
        <div class="bg-gradient-to-r from-[#6C5DD3] to-[#8C7DFF] h-full rounded-full transition-all duration-500" style="width:${dep.progress}%"></div>
      </div>

    </div>
  `;

  if (active.length > 0) {
    html += `<h3 class="font-bold text-[#848D99] text-xs uppercase tracking-wider mb-2.5 px-1 mt-2">Активные вклады</h3>`;
    html += active.map(d => renderCard(d, false)).join('');
  }

  if (closed.length > 0) {
    html += `<h3 class="font-bold text-[#848D99] text-xs uppercase tracking-wider mb-2.5 px-1 mt-4">Завершенные</h3>`;
    html += closed.map(d => renderCard(d, true)).join('');
  }

  listEl.innerHTML = html;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function submitDeposit(e) {
  e.preventDefault();
  const startRaw = document.getElementById('dep-start').value;
  const endRaw = document.getElementById('dep-end').value;

  if (!endRaw) {
    showToast('Укажите дату закрытия вклада', true);
    return;
  }

  const allDeposits = Cache?.deposits || [];
  const nextNum = allDeposits.length + 1;
  const rawName = document.getElementById('dep-name')?.value?.trim();
  const name = rawName || `Вклад ${nextNum}`;

  const parsedStart = (typeof parseAnyDate === 'function') ? parseAnyDate(startRaw) : new Date(startRaw);
  const startDate = (parsedStart && !isNaN(parsedStart.getTime()) && typeof formatDateStr === 'function') ? formatDateStr(parsedStart, 'yyyy-MM-dd') : (formatDateStr(startRaw) || startRaw);

  const parsedEnd = (typeof parseAnyDate === 'function') ? parseAnyDate(endRaw) : new Date(endRaw);
  const endDate = (parsedEnd && !isNaN(parsedEnd.getTime()) && typeof formatDateStr === 'function') ? formatDateStr(parsedEnd, 'yyyy-MM-dd') : (formatDateStr(endRaw) || endRaw);

  submitAction('dep-submit-btn', 'Deposits', {
    name,
    amount: getUnformattedVal(document.getElementById('dep-amount')),
    rate: getUnformattedVal(document.getElementById('dep-rate')),
    startDate,
    endDate,
    goalId: document.getElementById('dep-goal').value || '',
    status: 'Активен',
    isInterestCredited: false
  });
}

// ==========================================
// 1.5. Deposit Edit Modal & Actions
// ==========================================
function openEditDepModal(id) {
  if (typeof isSelectionMode === 'function' && isSelectionMode()) return;
  if (window.isSelectionMode && window.isSelectionMode()) return;

  const dep = (Cache?.deposits || []).find(d => d.id === id);
  if (!dep) return;

  const dlg = document.getElementById('dep-edit-modal');
  if (!dlg) return;

  document.getElementById('edit-dep-id').value = dep.id;
  document.getElementById('edit-dep-name').value = dep.name || '';
  setFormattedVal('edit-dep-amount', dep.amount);
  setFormattedVal('edit-dep-rate', dep.rate);

  const startRaw = dep.rawStart || dep.startDate || '';
  const parsedStart = typeof parseAnyDate === 'function' ? parseAnyDate(startRaw) : new Date(startRaw);
  document.getElementById('edit-dep-start').value = (typeof formatDateStr === 'function') ? formatDateStr(parsedStart, 'dd.MM.yyyy') : startRaw;

  const endRaw = dep.rawEnd || dep.endDate || '';
  const parsedEnd = typeof parseAnyDate === 'function' ? parseAnyDate(endRaw) : new Date(endRaw);
  document.getElementById('edit-dep-end').value = (typeof formatDateStr === 'function') ? formatDateStr(parsedEnd, 'dd.MM.yyyy') : endRaw;

  const goalObj = (Cache?.goals || []).find(g => g.id === dep.goalId);
  selectEditDepositGoal(dep.goalId || '', goalObj ? goalObj.name : '');

  dlg.classList.remove('hidden');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeEditDepModal() {
  const dlg = document.getElementById('dep-edit-modal');
  if (dlg) dlg.classList.add('hidden');
  const menu = document.getElementById('edit-dep-goal-menu');
  if (menu) menu.classList.add('hidden');
}

function toggleEditDepositGoalMenu(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('edit-dep-goal-menu');
  if (!menu) return;
  const isClosed = menu.classList.contains('hidden');
  document.querySelectorAll('.custom-dropdown-menu').forEach(m => m.classList.add('hidden'));
  if (isClosed) {
    renderEditDepositGoals();
    menu.classList.remove('hidden');
  }
}

function renderEditDepositGoals() {
  const menu = document.getElementById('edit-dep-goal-menu');
  if (!menu || !Cache) return;

  const goals = Cache.goals || [];
  let html = `
    <div onclick="selectEditDepositGoal('', '')" class="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-[#212430] text-xs font-medium text-gray-400 hover:text-white transition-colors cursor-pointer">
      <i data-lucide="circle-dashed" class="w-4 h-4 text-[#848D99]"></i>
      <span>Без привязки к цели</span>
    </div>
  `;

  if (goals.length > 0) {
    html += '<div class="border-t border-[rgba(255,255,255,0.06)] my-1"></div>';
    goals.forEach(g => {
      html += `
        <div onclick="selectEditDepositGoal('${g.id}', '${escapeHtml(g.name)}')" class="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-[#212430] text-xs font-medium text-gray-200 transition-colors cursor-pointer">
          <span class="flex items-center gap-2.5 truncate">
            <i data-lucide="target" class="w-4 h-4 text-[#6C5DD3]"></i>
            <span class="truncate">${escapeHtml(g.name)}</span>
          </span>
          <span class="text-[10px] text-[#848D99] ml-2 flex-shrink-0">${formatMoney(g.saved || 0)} / ${formatMoney(g.target || 0)}</span>
        </div>
      `;
    });
  }

  menu.innerHTML = html;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function selectEditDepositGoal(id, name) {
  const input = document.getElementById('edit-dep-goal');
  const label = document.getElementById('edit-dep-goal-label');
  const menu = document.getElementById('edit-dep-goal-menu');
  if (input) input.value = id;
  if (label) {
    if (id && name) {
      label.innerHTML = `<i data-lucide="target" class="w-4 h-4 text-[#6C5DD3]"></i><span class="truncate text-white font-medium">${escapeHtml(name)}</span>`;
    } else {
      label.innerHTML = `<i data-lucide="circle-dashed" class="w-4 h-4 text-[#848D99]"></i><span class="truncate text-gray-400">Без привязки к цели</span>`;
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
  if (menu) menu.classList.add('hidden');
}

async function submitEditDepModal(e) {
  if (e) e.preventDefault();
  const id = document.getElementById('edit-dep-id').value;
  if (!id) return;

  const name = document.getElementById('edit-dep-name').value.trim();
  const amount = getUnformattedVal(document.getElementById('edit-dep-amount'));
  const rate = getUnformattedVal(document.getElementById('edit-dep-rate'));
  const startRaw = document.getElementById('edit-dep-start').value;
  const endRaw = document.getElementById('edit-dep-end').value;
  const goalId = document.getElementById('edit-dep-goal').value || '';

  if (!name) {
    showToast('Укажите название вклада', true);
    return;
  }
  if (!amount || amount <= 0) {
    showToast('Укажите сумму вклада', true);
    return;
  }
  if (!endRaw) {
    showToast('Укажите дату закрытия вклада', true);
    return;
  }

  const startDate = formatDateStr(startRaw) || startRaw;
  const endDate = formatDateStr(endRaw) || endRaw;

  try {
    await getUserCol('Deposits').doc(id).update({
      name,
      amount,
      rate,
      startDate,
      endDate,
      goalId
    });
    closeEditDepModal();
    await fetchAllData();
  } catch (err) {
    showToast('Ошибка при сохранении: ' + (err.message || ''), true);
  }
}

function deleteDepFromModal() {
  const id = document.getElementById('edit-dep-id').value;
  if (!id) return;
  showDialog('Удаление вклада', 'Точно удалить вклад? Это действие нельзя отменить.', true, async () => {
    try {
      await getUserCol('Deposits').doc(id).delete();
      closeEditDepModal();
      await fetchAllData();
    } catch (err) {
      showToast('Ошибка при удалении: ' + (err.message || ''), true);
    }
  });
}

function editDep(id) {
  openEditDepModal(id);
}

// ==========================================
// 1.6. Deposit Close Modal & Actions
// ==========================================
function updateDepositsBadge() {
  const data = Cache?.deposits || [];
  const maturedCount = data.filter(d => !d.isClosed && d.isMatured).length;
  const badge = document.getElementById('nav-deposits-badge');
  if (badge) {
    if (maturedCount > 0) {
      badge.classList.remove('hidden');
      badge.setAttribute('title', `Требуется закрытие: ${maturedCount}`);
    } else {
      badge.classList.add('hidden');
    }
  }
}
window.updateDepositsBadge = updateDepositsBadge;

function openCloseDepositModal(id) {
  const dep = (Cache?.deposits || []).find(d => d.id === id);
  const dlg = document.getElementById('deposit-close-dialog');
  if (!dep || !dlg) return;

  const idInp = document.getElementById('dep-close-id');
  const nameEl = document.getElementById('dep-close-name');
  const amountEl = document.getElementById('dep-close-amount');
  const interestEl = document.getElementById('dep-close-interest');
  const totalEl = document.getElementById('dep-close-total');
  const toggle = document.getElementById('dep-close-credit-toggle');

  if (idInp) idInp.value = dep.id;
  if (nameEl) nameEl.innerText = dep.name || 'Вклад';
  if (amountEl) amountEl.innerText = formatMoney(dep.amount || 0);
  if (interestEl) interestEl.innerText = `+${formatMoney(dep.expectedInterest || 0)}`;
  if (totalEl) totalEl.innerText = formatMoney((dep.amount || 0) + (dep.expectedInterest || 0));

  const activeGoals = (Cache?.goals || []).filter(g => g.status !== 'Архив');

  if (toggle) {
    if (activeGoals.length === 0) {
      toggle.checked = false;
      toggle.disabled = true;
    } else {
      toggle.checked = true;
      toggle.disabled = false;
    }
  }

  toggleDepCloseGoalSection(toggle ? toggle.checked : true);

  // Выбираем цель по умолчанию: если у вклада была привязана цель
  if (dep.goalId && activeGoals.some(g => g.id === dep.goalId)) {
    selectDepCloseGoal(dep.goalId);
  } else if (activeGoals.length > 0) {
    selectDepCloseGoal(activeGoals[0].id);
  } else {
    selectDepCloseGoal('');
  }

  dlg.classList.remove('hidden');
  if (typeof lockBodyScroll === 'function') lockBodyScroll();
  if (typeof lucide !== 'undefined') lucide.createIcons();
}
window.openCloseDepositModal = openCloseDepositModal;

function closeDepositCloseModal() {
  const dlg = document.getElementById('deposit-close-dialog');
  if (dlg) dlg.classList.add('hidden');
  const menu = document.getElementById('dep-close-goal-menu');
  if (menu) menu.classList.add('hidden');
  if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
}
window.closeDepositCloseModal = closeDepositCloseModal;

function toggleDepCloseGoalSection(isChecked) {
  const wrap = document.getElementById('dep-close-goal-wrap');
  if (wrap) {
    if (isChecked) {
      wrap.classList.remove('hidden');
    } else {
      wrap.classList.add('hidden');
    }
  }
}
window.toggleDepCloseGoalSection = toggleDepCloseGoalSection;

function toggleDepCloseGoalMenu(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('dep-close-goal-menu');
  if (!menu) return;
  const isClosed = menu.classList.contains('hidden');
  document.querySelectorAll('.custom-dropdown-menu').forEach(m => m.classList.add('hidden'));
  if (isClosed) {
    renderDepCloseGoals();
    menu.classList.remove('hidden');
  }
}
window.toggleDepCloseGoalMenu = toggleDepCloseGoalMenu;

function renderDepCloseGoals() {
  const menu = document.getElementById('dep-close-goal-menu');
  if (!menu) return;

  const goals = (Cache?.goals || []).filter(g => g.status !== 'Архив');
  const selectedId = document.getElementById('dep-close-goal-id')?.value || '';

  if (goals.length === 0) {
    menu.innerHTML = '<div class="px-3 py-2 text-xs text-[#848D99] text-center">Нет активных целей</div>';
    return;
  }

  menu.innerHTML = goals.map(g => {
    const isSelected = g.id === selectedId;
    return `
      <div onclick="selectDepCloseGoal('${g.id}')" 
           class="flex items-center justify-between px-3 py-2 rounded-xl transition-colors cursor-pointer ${isSelected ? 'bg-[#6C5DD3]/20 text-white font-semibold' : 'hover:bg-[#212430] text-gray-200'}">
        <span class="flex items-center gap-2 truncate text-xs">
          <i data-lucide="target" class="w-3.5 h-3.5 ${isSelected ? 'text-[#8C7DFF]' : 'text-gray-400'}"></i>
          <span class="truncate">${escapeHtml(g.name)}</span>
        </span>
        <span class="text-[10px] text-[#848D99] font-mono ml-2 flex-shrink-0">${formatMoney(g.saved || 0)}</span>
      </div>
    `;
  }).join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();
}
window.renderDepCloseGoals = renderDepCloseGoals;

function selectDepCloseGoal(id) {
  const input = document.getElementById('dep-close-goal-id');
  const label = document.getElementById('dep-close-goal-label');
  const menu = document.getElementById('dep-close-goal-menu');

  if (input) input.value = id || '';

  const goal = (Cache?.goals || []).find(g => g.id === id);
  if (label) {
    if (goal) {
      label.innerHTML = `
        <i data-lucide="target" class="w-3.5 h-3.5 text-amber-400 flex-shrink-0"></i>
        <span class="truncate font-semibold text-white">${escapeHtml(goal.name)}</span>
        <span class="text-[10px] text-gray-400 font-mono ml-1">(${formatMoney(goal.saved || 0)})</span>
      `;
    } else {
      label.innerHTML = `
        <i data-lucide="circle-dashed" class="w-3.5 h-3.5 text-[#848D99] flex-shrink-0"></i>
        <span class="truncate text-gray-400">Выберите цель</span>
      `;
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  if (menu) menu.classList.add('hidden');
}
window.selectDepCloseGoal = selectDepCloseGoal;

async function submitCloseDepositModal() {
  const depId = document.getElementById('dep-close-id')?.value;
  if (!depId) return;

  const dep = (Cache?.deposits || []).find(d => d.id === depId);
  if (!dep) {
    showToast('Вклад не найден', true);
    return;
  }

  const toggle = document.getElementById('dep-close-credit-toggle');
  const isCreditToGoal = toggle ? toggle.checked : false;
  const goalId = document.getElementById('dep-close-goal-id')?.value;

  const interestEarned = Math.round(dep.expectedInterest || 0);

  if (isCreditToGoal && interestEarned > 0) {
    if (!goalId) {
      showToast('Выберите цель для начисления процентов', true);
      return;
    }
  }

  const btn = document.getElementById('dep-close-submit-btn');
  if (btn) {
    btn.disabled = true;
    btn.classList.add('opacity-70');
  }

  try {
    const batch = db.batch();
    const depRef = getUserCol('Deposits').doc(dep.id);

    let updatedGoalName = '';

    if (isCreditToGoal && interestEarned > 0 && goalId) {
      const goal = (Cache?.goals || []).find(g => g.id === goalId);
      if (goal) {
        const newSaved = (parseFloat(goal.saved) || 0) + interestEarned;
        const target = parseFloat(goal.target) || 0;
        const isAchieved = (target > 0 && newSaved >= target);

        const goalRef = getUserCol('Goals').doc(goal.id);
        batch.update(goalRef, {
          saved: newSaved,
          status: isAchieved ? 'Выполнена' : (goal.status || 'В процессе'),
          updatedAt: Date.now()
        });

        goal.saved = newSaved;
        if (isAchieved) goal.status = 'Выполнена';
        updatedGoalName = goal.name || '';
      }
    }

    batch.update(depRef, {
      status: 'Закрыт',
      isClosed: true,
      isInterestCredited: isCreditToGoal,
      creditedGoalId: isCreditToGoal ? (goalId || '') : '',
      interestEarned: interestEarned,
      closedAt: Date.now(),
      updatedAt: Date.now()
    });

    await batch.commit();

    // Обновляем локальный объект в Cache.deposits
    dep.status = 'Закрыт';
    dep.isClosed = true;
    dep.isMatured = false;
    dep.isInterestCredited = isCreditToGoal;

    closeDepositCloseModal();

    if (isCreditToGoal && interestEarned > 0 && updatedGoalName) {
      showToast(`Вклад «${dep.name}» закрыт. Проценты (+${formatMoney(interestEarned)}) зачислены в цель «${updatedGoalName}»!`);
    } else {
      showToast(`Вклад «${dep.name}» перенесен в закрытые вклады.`);
    }

    // Обновляем бейдж и перерисовываем списки
    updateDepositsBadge();
    renderDeposits();

    if (typeof renderBudgetTab === 'function') {
      renderBudgetTab();
    }
  } catch (err) {
    console.error('Ошибка при закрытии вклада:', err);
    showToast('Ошибка при закрытии: ' + (err.message || ''), true);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('opacity-70');
    }
  }
}
window.submitCloseDepositModal = submitCloseDepositModal;

// Обновление статусов и бейджей для завершенных вкладов
async function checkAndCreditMaturedDeposits() {
  updateDepositsBadge();
}

// Хелпер склонения месяцев для вкладов
function getDepositDurationStr(startDate, endDate) {
  const totalDays = Math.max(1, Math.round((endDate - startDate) / 86400000));
  let months = Math.round(totalDays / 30.4375);
  if (months < 1) months = 1;

  const mod10 = months % 10;
  const mod100 = months % 100;
  if (mod100 >= 11 && mod100 <= 19) return `${months} месяцев`;
  if (mod10 === 1) return `${months} месяц`;
  if (mod10 >= 2 && mod10 <= 4) return `${months} месяца`;
  return `${months} месяцев`;
}


// Global Scope Exports
window.processDeposits = processDeposits;
window.renderDeposits = renderDeposits;
window.submitDeposit = submitDeposit;
window.editDep = editDep;
window.openEditDepModal = openEditDepModal;
window.closeEditDepModal = closeEditDepModal;
window.submitEditDepModal = submitEditDepModal;
window.deleteDepFromModal = deleteDepFromModal;
window.toggleEditDepositGoalMenu = toggleEditDepositGoalMenu;
window.selectEditDepositGoal = selectEditDepositGoal;
window.getDepositDurationStr = getDepositDurationStr;
window.checkAndCreditMaturedDeposits = checkAndCreditMaturedDeposits;
window.toggleDepositGoalMenu = toggleDepositGoalMenu;
window.selectDepositGoal = selectDepositGoal;
window.openCloseDepositModal = openCloseDepositModal;
window.closeDepositCloseModal = closeDepositCloseModal;
window.toggleDepCloseGoalSection = toggleDepCloseGoalSection;
window.toggleDepCloseGoalMenu = toggleDepCloseGoalMenu;
window.renderDepCloseGoals = renderDepCloseGoals;
window.selectDepCloseGoal = selectDepCloseGoal;
window.submitCloseDepositModal = submitCloseDepositModal;
window.updateDepositsBadge = updateDepositsBadge;
